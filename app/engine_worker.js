/* The web app's engine (03_platforms.md §9, P5.11): Pyodide runs the shared Python backend (recite/, unchanged, through
   meddeb_web.py) in this module worker, which engine.js (WorkerEngine) starts. The B3.8 protocol is the PC's: calls
   answer {id, ok, result | error}; a session's messages come back as {event: 'session', msg}, like the WebSocket of
   d04_meddeb/server.py, whose loop this one follows: audio frames that arrive while a decode runs wait and are pushed
   together before the next step, commands wait for the step, stop = the pending audio, the final step, the save.

   One queue runs every Python call, one at a time; after a call that wrote, the profile goes to the browser's disk
   (profile_fs.js). The encoder runs in the encoder worker: meddeb_js.encode posts the features there and waits on the
   SharedArrayBuffer it answers in (Atomics.wait, allowed in a worker), so the tracker's step stays synchronous. */
import { loadPyodide } from './vendor/pyodide/pyodide.mjs';
import { createProfileFs } from './profile_fs.js';

const MAX_FRAMES = 8192, HDR = 4;             // encoder_worker.js's answer layout
const ENCODE_TIMEOUT_MS = 120000;
const PROFILE = '/meddeb/profile1';

let py = null, M = null, pfs = null;
let encPort = null, ctl = null, idsIn = null, confIn = null, bytesIn = null;
let queue = Promise.resolve();
let sessOpen = false, pending = [], kicked = false;
const t0 = performance.now();
const post = (m, t) => self.postMessage(m, t || []);
const emit = (msg) => post({event: 'session', msg});
const elapsed = () => Math.round(performance.now() - t0);

function enqueue(fn) {
  const p = queue.then(fn);
  queue = p.catch(() => {});
  return p;
}
async function persist() {
  try { const r = await pfs.sync(); if (r && (r.written || r.moved || r.deleted)) post({event: 'saved', ...r}); }
  catch (e) { post({event: 'log', text: `profile save failed: ${e && e.message || e}`}); throw e; }
}
const json = (s) => (s ? JSON.parse(s) : null);

// ---- the encoder (Python -> encoder worker -> SharedArrayBuffer)
function encode(arr, rows, cols) {
  const b = arr.getBuffer('f32');
  let feats;
  try { feats = new Float32Array(b.data); } finally { b.release(); }
  Atomics.store(ctl, 0, 0);
  encPort.postMessage({feats, rows, cols}, [feats.buffer]);
  if (Atomics.wait(ctl, 0, 0, ENCODE_TIMEOUT_MS) === 'timed-out') throw new Error('the speech model did not answer');
  const n = Atomics.load(ctl, 2);
  if (Atomics.load(ctl, 1) !== 0) throw new Error(new TextDecoder().decode(bytesIn.slice(0, n)));
  return {ids: idsIn.slice(0, n), conf: confIn.slice(0, n)};
}

async function boot(d) {
  encPort = d.encPort;
  ctl = new Int32Array(d.sab, 0, HDR);
  idsIn = new Int32Array(d.sab, HDR * 4, MAX_FRAMES);
  confIn = new Float32Array(d.sab, (HDR + MAX_FRAMES) * 4, MAX_FRAMES);
  bytesIn = new Uint8Array(d.sab, HDR * 4, MAX_FRAMES * 4);
  const times = {};
  // one tab at a time: two engines mirroring the same profile would overwrite each other's files (held until the tab
  // closes)
  if (navigator.locks) {
    await new Promise((resolve, reject) => {
      navigator.locks.request('meddeb-profile', {ifAvailable: true}, (lock) => {
        if (!lock) { reject(new Error('Meddeb is already open in another tab or window: use that one (or close it and reload)')); return null; }
        resolve();
        return new Promise(() => {});
      }).catch(reject);
    });
  }
  py = await loadPyodide({indexURL: new URL('./vendor/pyodide/', import.meta.url).href});
  times.pyodide_ms = elapsed();
  await py.loadPackage('numpy', {messageCallback: () => {}});
  times.numpy_ms = elapsed();
  const zip = await fetch(new URL('./engine/meddeb_py.zip', import.meta.url));
  if (!zip.ok) throw new Error(`cannot load the engine (${zip.status})`);
  py.unpackArchive(await zip.arrayBuffer(), 'zip', {extractDir: '/home/pyodide/meddeb'});
  py.registerJsModule('meddeb_js', {encode});
  py.runPython("import sys; sys.path.insert(0, '/home/pyodide/meddeb')");
  pfs = createProfileFs(py.FS);
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('meddeb', {create: true});
  const mounted = await pfs.mount(root, '/meddeb');
  times.profile_ms = elapsed();
  M = py.pyimport('meddeb_web');
  M.start_app(PROFILE, JSON.stringify(d.facts || {}));
  M.call('chapters', '{}');                       // load_quran() now rather than at the first page
  times.engine_ms = elapsed();
  await persist();
  const info = py.runPython('import sys, numpy; [sys.version.split()[0], numpy.__version__]').toJs();
  M.log(`engine ready in ${times.engine_ms} ms (Pyodide ${times.pyodide_ms}, numpy ${times.numpy_ms - times.pyodide_ms},`
    + ` profile ${times.profile_ms - times.numpy_ms}: ${mounted.files} files, ${mounted.lazy} kept on disk,`
    + ` ${mounted.bytes} bytes)`);
  return {python: info[0], numpy: info[1], pyodide: py.version, times, profile: mounted};
}

// ---- a session (the WebSocket loop of server.py)
function drain() {
  if (!sessOpen) { pending = []; return; }
  let due = false;
  for (const b of pending) due = M.session_audio(b) || due;
  pending = [];
  if (due) { emit(json(M.session_step(false))); kick(); }
}
function kick() {
  if (kicked) return;
  kicked = true;
  setTimeout(() => { kicked = false; enqueue(drain).catch(sessionFailed); }, 0);
}
function sessionFailed(e) {
  post({event: 'log', text: `session error: ${e && e.stack || e}`});
  try { if (M) M.log(`session error: ${e && e.message || e}`); } catch (e2) { /* the log too */ }
  emit({type: 'status', text: `The engine failed: ${e && e.message || e}`});
  if (sessOpen) {
    sessOpen = false; pending = [];
    try { M.session_finish(); } catch (e2) { /* nothing to save */ }
  }
  post({event: 'closed'});
}

async function onSession(msg) {
  const kind = msg && msg.type;
  if (kind === 'start') {
    pending = [];
    const started = json(M.session_start(JSON.stringify(msg)));
    sessOpen = true;
    emit(started);
    await persist();
  } else if (!sessOpen) {
    /* nothing open: ignored, as the server does */
  } else if (['hint', 'skip_to', 'mark', 'unmark', 'threshold', 'summary'].includes(kind)) {
    drain();
    const r = json(M.session_command(JSON.stringify(msg)));
    if (r) emit(r);
  } else if (kind === 'pause') {
    drain();
    for (const m of json(M.session_pause())) emit(m);
  } else if (kind === 'resume') {
    emit({type: 'resumed'});
  } else if (kind === 'stop' || kind === 'close') {
    for (const b of pending) M.session_audio(b);
    pending = [];
    const st = json(M.session_step(true));
    const done = json(M.session_finish());
    sessOpen = false;
    if (kind === 'stop') { emit(st); emit(done); }
    await persist();
  }
}

self.onmessage = (ev) => {
  const d = ev.data || {};
  const {id, op} = d;
  const reply = (p) => p.then((result) => post({id, ok: true, result}),
    (e) => post({id, ok: false, error: String(e && e.message || e), stack: String(e && e.stack || '')}));
  if (op === 'audio') { if (sessOpen) { pending.push(d.pcm); kick(); } return; }
  if (op === 'init') { reply(enqueue(() => boot(d))); return; }
  if (op === 'session') { enqueue(() => onSession(d.msg)).catch(sessionFailed); return; }
  if (op === 'call') {
    reply(enqueue(async () => { const r = json(M.call(d.name, JSON.stringify(d.params || {}))); await persist(); return r; }));
  } else if (op === 'clip') {
    reply(enqueue(() => {
      const b = M.clip(JSON.stringify(d.params)); const bytes = b.toJs(); b.destroy();
      return bytes;
    }));
  } else if (op === 'log') {
    reply(enqueue(async () => { M.log(String(d.text)); await persist(); return true; }));
  } else if (op === 'files') {   // the export: every profile file (a Blob for a large one), after the last save
    reply(enqueue(async () => { await persist(); return pfs.listFiles('profile1'); }));
  } else if (op === 'import') {   // D4.4: the zip stays a Blob; Python reads it through a read-only file
    reply(enqueue(async () => {
      const path = '/tmp/meddeb_import.zip';
      pfs.blobFile(path, d.file);
      try { const r = json(M.call('import_profile', JSON.stringify({path, name: d.file.name || ''}))); await persist(); return r; }
      finally { try { py.FS.unlink(path); } catch (e) { /* gone */ } }
    }));
  } else {
    post({id, ok: false, error: `unknown op ${op}`});
  }
};
