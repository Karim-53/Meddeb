/* The web app's profile on disk (03_platforms.md §6 and §9, P5.11): the engine worker's Python sees the profile as a
   folder of Pyodide's in-memory file system (MEMFS); this module mirrors that folder into the browser's Origin Private
   File System (OPFS), the web's own disk, so that it survives the tab.

   - mount(): OPFS -> MEMFS once at start. A small file is read into memory; a large one (a recording, a long
     session.json: LAZY_MIN and up) stays on disk: its MEMFS node keeps the OPFS File and reads the bytes asked for with
     FileReaderSync, so a profile of hundreds of MB costs no memory. Writing to such a file first reads it in (it is
     then an ordinary MEMFS file until the next sync).
   - sync(): MEMFS -> OPFS after every call that may write (the worker's queue): new and changed files are written
     (sync access handles), renamed large files are moved, removed ones are deleted, and a large file just written goes
     back to disk-only. MEMFS's write / truncate / mknod / rename / unlink / rmdir set a flag, so a call that wrote
     nothing costs no walk.
   Pure plumbing: no Meddeb rule lives here (recite/profile.py owns the layout). */

export const LAZY_MIN = 128 * 1024;
const CHUNK = 4 * 1024 * 1024;

export function createProfileFs(FS) {
  const MEMFS = FS.filesystems.MEMFS;
  let changed = false;
  let snap = new Map();          // path -> node (files), as on disk after the last sync
  let snapDirs = new Set();      // directory paths on disk
  let root = null, base = '';    // the OPFS directory handle and the MEMFS path it mirrors

  const reader = () => new FileReaderSync();
  const touch = (node) => { node.meddebDirty = true; changed = true; };

  // ---- large files: MEMFS nodes whose bytes stay in an OPFS File
  function materialize(node, empty) {
    if (!node.meddebBlob) return;
    const data = empty ? new Uint8Array(0) : new Uint8Array(reader().readAsArrayBuffer(node.meddebBlob));
    node.meddebBlob = null;
    node.contents = data; node.usedBytes = data.length;
    node.stream_ops = MEMFS.ops_table.file.stream; node.node_ops = MEMFS.ops_table.file.node;
    touch(node);
  }
  const LAZY_STREAM = {
    llseek: (...a) => MEMFS.stream_ops.llseek(...a),
    read(stream, buffer, offset, length, position) {
      const node = stream.node;
      if (!node.meddebBlob) return MEMFS.stream_ops.read(stream, buffer, offset, length, position);
      if (position >= node.usedBytes) return 0;
      const size = Math.min(node.usedBytes - position, length);
      const ab = reader().readAsArrayBuffer(node.meddebBlob.slice(position, position + size));
      buffer.set(new Uint8Array(ab), offset);
      return ab.byteLength;
    },
    write(stream, ...a) { materialize(stream.node); return MEMFS.ops_table.file.stream.write(stream, ...a); },
    mmap(stream, ...a) { materialize(stream.node); return MEMFS.stream_ops.mmap(stream, ...a); },
    msync: (...a) => MEMFS.stream_ops.msync(...a),
  };
  const LAZY_NODE = {
    getattr: (node) => MEMFS.node_ops.getattr(node),
    setattr(node, attr) {
      if (attr.size !== undefined) materialize(node, attr.size === 0);
      return MEMFS.ops_table.file.node.setattr(node, attr);
    },
  };
  function makeLazy(node, file) {
    node.meddebBlob = file;
    node.contents = new Uint8Array(0); node.usedBytes = file.size;
    node.stream_ops = LAZY_STREAM; node.node_ops = LAZY_NODE;
    node.meddebDirty = false;
  }

  // ---- change tracking: MEMFS's shared op tables (created with the first MEMFS node)
  function hook() {
    if (MEMFS.meddebHooked) return;
    FS.mkdirTree('/tmp/meddeb_hook'); FS.writeFile('/tmp/meddeb_hook/x', '');   // makes MEMFS.ops_table
    const t = MEMFS.ops_table;
    const wrap = (obj, name, mark) => {
      const orig = obj[name];
      obj[name] = function (...a) { mark(...a); return orig.apply(this, a); };
    };
    wrap(t.file.stream, 'write', (stream) => touch(stream.node));
    wrap(t.file.node, 'setattr', (node, attr) => { if (attr && attr.size !== undefined) touch(node); });
    for (const op of ['mknod', 'rename', 'unlink', 'rmdir', 'symlink']) wrap(t.dir.node, op, () => { changed = true; });
    MEMFS.meddebHooked = true;
  }

  // ---- OPFS helpers
  async function dirAt(rel, create) {
    let d = root;
    for (const part of rel.split('/').filter(Boolean)) d = await d.getDirectoryHandle(part, {create});
    return d;
  }
  const split = (rel) => { const i = rel.lastIndexOf('/'); return [rel.slice(0, i), rel.slice(i + 1)]; };
  async function fileHandle(rel, create) { const [d, n] = split(rel); return (await dirAt(d, create)).getFileHandle(n, {create}); }
  async function writeBytes(rel, bytes) {
    const h = await fileHandle(rel, true);
    const a = await h.createSyncAccessHandle();
    try { a.truncate(0); let o = 0; while (o < bytes.length) o += a.write(bytes.subarray(o, o + CHUNK), {at: o}); a.flush(); }
    finally { a.close(); }
    return h;
  }
  async function writeBlob(rel, blob) {
    const h = await fileHandle(rel, true);
    const a = await h.createSyncAccessHandle();
    try {
      a.truncate(0);
      for (let o = 0; o < blob.size; o += CHUNK) a.write(new Uint8Array(reader().readAsArrayBuffer(blob.slice(o, o + CHUNK))), {at: o});
      a.flush();
    } finally { a.close(); }
    return h;
  }
  async function remove(rel, recursive) {
    const [d, n] = split(rel);
    try { await (await dirAt(d, false)).removeEntry(n, {recursive: !!recursive}); }
    catch (e) { if (e && e.name !== 'NotFoundError') throw e; }
  }

  // ---- the MEMFS tree
  function walk(path, files, dirs, rel) {
    const node = FS.lookupPath(path).node;
    for (const name of Object.keys(node.contents)) {
      const child = node.contents[name], r = rel ? `${rel}/${name}` : name;
      if (FS.isDir(child.mode)) { dirs.add(r); walk(`${path}/${name}`, files, dirs, r); }
      else if (FS.isFile(child.mode)) files.set(r, child);
    }
  }

  async function mount(opfsDir, path) {
    hook();
    root = opfsDir; base = path;
    FS.mkdirTree(path);
    let loaded = 0, lazy = 0, bytes = 0;
    async function load(dir, memPath, rel) {
      for await (const [name, h] of dir.entries()) {
        const mp = `${memPath}/${name}`, r = rel ? `${rel}/${name}` : name;
        if (h.kind === 'directory') { FS.mkdirTree(mp); snapDirs.add(r); await load(h, mp, r); continue; }
        const file = await h.getFile();
        if (file.size >= LAZY_MIN) {
          FS.writeFile(mp, new Uint8Array(0));
          makeLazy(FS.lookupPath(mp).node, file); lazy++;
        } else {
          FS.writeFile(mp, new Uint8Array(await file.arrayBuffer())); loaded++;
        }
        const node = FS.lookupPath(mp).node;
        node.mtime = node.ctime = node.atime = file.lastModified || Date.now();
        node.meddebDirty = false; bytes += file.size;
        snap.set(r, node);
      }
    }
    await load(root, path, '');
    changed = false;
    return {files: loaded + lazy, lazy, bytes};
  }

  /** MEMFS -> OPFS; returns what it did ({written, moved, deleted}) or null when nothing changed. */
  async function sync() {
    if (!root || !changed) return null;
    changed = false;
    const files = new Map(), dirs = new Set();
    walk(base, files, dirs, '');
    const oldPath = new Map();
    for (const [p, n] of snap) oldPath.set(n, p);
    const out = {written: 0, moved: 0, deleted: 0};
    for (const d of [...dirs].sort()) if (!snapDirs.has(d)) await dirAt(d, true);
    // 1. large files that moved (unchanged bytes still on disk at their old path): before anything overwrites it
    for (const [p, n] of files) {
      const was = oldPath.get(n);
      if (!n.meddebBlob || was === undefined || was === p) continue;
      let h = null;
      try {
        const src = await fileHandle(was, false);
        if (src.move) { const [d, name] = split(p); await src.move(await dirAt(d, true), name); h = src; }
      } catch (e) { h = null; }
      if (!h) h = await writeBlob(p, n.meddebBlob);
      makeLazy(n, await h.getFile()); out.moved++;
    }
    // 2. new and changed files kept in memory
    for (const [p, n] of files) {
      if (n.meddebBlob) continue;
      if (snap.get(p) === n && !n.meddebDirty) continue;
      const h = await writeBytes(p, MEMFS.getFileDataAsTypedArray(n));
      n.meddebDirty = false; out.written++;
      if (n.usedBytes >= LAZY_MIN) makeLazy(n, await h.getFile());
    }
    // 3. what is gone (the old path of a file moved in 1. is gone already: nothing to find there)
    for (const p of snap.keys()) if (!files.has(p)) { await remove(p, false); out.deleted++; }
    for (const d of [...snapDirs].sort().reverse()) if (!dirs.has(d)) await remove(d, true);
    snap = files; snapDirs = dirs;
    return out;
  }

  /** A read-only MEMFS file whose bytes stay in a Blob (the zip of an import): path -> the node. */
  function blobFile(path, blob) {
    const [d] = split(path);
    FS.mkdirTree(d); FS.writeFile(path, new Uint8Array(0));
    const node = FS.lookupPath(path).node;
    makeLazy(node, blob);
    return node;
  }

  /** The mirrored files as {rel, size, blob | bytes} (the export's zip): a Blob for a large file, a copy of the bytes
   *  of a small one. */
  function listFiles(prefix) {
    const files = new Map(), dirs = new Set();
    walk(prefix ? `${base}/${prefix}` : base, files, dirs, '');
    return [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([rel, n]) => n.meddebBlob
      ? {rel, size: n.usedBytes, blob: n.meddebBlob}
      : {rel, size: n.usedBytes, bytes: MEMFS.getFileDataAsTypedArray(n).slice()});
  }

  return {mount, sync, blobFile, listFiles, get changed() { return changed; }, set changed(v) { changed = !!v; }};
}
