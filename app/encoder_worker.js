/* The web app's speech model (03_platforms.md §9, P5.11): onnxruntime-web (WebAssembly, several threads when the page
   is cross-origin isolated) runs fastconformer_quran's int8 encoder, the browser's twin of the Android app's
   OrtEncoder.kt. A module worker started by engine.js (WorkerEngine), next to the engine worker.

   Page messages ({id, op}, answered {id, ok, result | error}):
   - status: {installed, size, sha256} of the model kept in the Origin Private File System (models/<name>/);
   - download {base}: the parts listed in <base>manifest.json (B3.13, the phone's files), each checked against its
     SHA-256 and written at its place, then the whole file; {type: model_download, state, pct, bytes, total} events
     (the page's bar, D2); a part already checked is kept across a reload;
   - load {threads}: an ONNX Runtime session on the kept file -> {ms, threads, version}.
   Encoder requests come from the engine worker over its MessagePort ({feats, rows, cols}); the answer goes into the
   SharedArrayBuffer it waits on (Atomics.wait): header [flag, status, n], then n ids (int32) and n probabilities
   (float32) per 80 ms frame (greedy CTC: the best token and exp(its log-prob)); status -1 = an error message (UTF-8). */
import * as ort from './vendor/ort/ort.wasm.min.mjs';

const MODEL = 'fastconformer_quran';
const FILE = 'model.q8.onnx';
const MAX_FRAMES = 8192;           // 11 min of audio per encoder pass (the backend cuts at 30 s); engine.js: the same
const HDR = 4;                     // int32 header slots

let session = null, threads = 1, ctl = null, idsOut = null, confOut = null, bytesOut = null;
const post = (m) => self.postMessage(m);

async function modelDir(create) {
  const root = await navigator.storage.getDirectory();
  return (await root.getDirectoryHandle('models', {create})).getDirectoryHandle(MODEL, {create});
}
async function readJson(dir, name) {
  try { return JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text()); } catch (e) { return null; }
}
async function writeJson(dir, name, obj) {
  const w = await (await dir.getFileHandle(name, {create: true})).createWritable();
  await w.write(JSON.stringify(obj)); await w.close();
}
async function sha256(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  return Array.from(d, b => b.toString(16).padStart(2, '0')).join('');
}

async function status() {
  try {
    const dir = await modelDir(false);
    const meta = await readJson(dir, 'model.json');
    const file = await (await dir.getFileHandle(FILE)).getFile();
    return {installed: !!meta && meta.verified === true && file.size === meta.size, size: file.size, sha256: meta && meta.sha256};
  } catch (e) { return {installed: false, size: 0}; }
}

async function fetchPart(url, onBytes) {
  const resp = await fetch(url, {cache: 'no-store'});
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} for ${url.split('/').pop()}`);
  const len = +resp.headers.get('Content-Length') || 0;
  const reader = resp.body.getReader();
  const chunks = []; let n = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    chunks.push(value); n += value.length; onBytes(value.length);
  }
  const out = new Uint8Array(n); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  if (len && n !== len) throw new Error(`incomplete download of ${url.split('/').pop()} (${n} of ${len} bytes)`);
  return out;
}

async function download(base) {
  const man = await (await fetch(base + 'manifest.json', {cache: 'no-store'})).json();
  if (man.file !== FILE || !Array.isArray(man.parts)) throw new Error('unexpected model manifest');
  try { await navigator.storage.persist(); } catch (e) { /* the browser decides */ }
  const dir = await modelDir(true);
  let prog = await readJson(dir, 'progress.json');
  if (!prog || prog.sha256 !== man.sha256) prog = {sha256: man.sha256, done: []};
  const total = man.size;
  let got = man.parts.filter(p => prog.done.includes(p.name)).reduce((s, p) => s + p.size, 0);
  let lastPct = -1;
  const tell = () => {
    const pct = Math.floor(100 * got / total);
    if (pct !== lastPct) { lastPct = pct; post({type: 'model_download', state: 'running', pct, bytes: got, total}); }
  };
  tell();
  const fh = await dir.getFileHandle(FILE, {create: true});
  let offset = 0;
  for (const part of man.parts) {
    if (!prog.done.includes(part.name)) {
      const before = got;
      const bytes = await fetchPart(base + part.name, (k) => { got += k; tell(); });
      if (bytes.length !== part.size || await sha256(bytes) !== part.sha256) {
        got = before; throw new Error(`${part.name} is damaged (size or SHA-256 differs)`);
      }
      const a = await fh.createSyncAccessHandle();
      try { a.write(bytes, {at: offset}); a.flush(); } finally { a.close(); }
      prog.done.push(part.name); await writeJson(dir, 'progress.json', prog);
    }
    offset += part.size;
  }
  const file = await fh.getFile();
  if (file.size !== man.size || await sha256(await file.arrayBuffer()) !== man.sha256) {
    await writeJson(dir, 'progress.json', {sha256: man.sha256, done: []});
    throw new Error('the joined model is damaged (SHA-256 differs): it downloads again at the next press');
  }
  await writeJson(dir, 'model.json', {name: MODEL, file: FILE, size: man.size, sha256: man.sha256, verified: true,
    date: new Date().toISOString()});
  post({type: 'model_download', state: 'done', pct: 100, bytes: total, total});
  return {size: man.size};
}

async function load(want) {
  if (session) return {ms: 0, threads, version: ort.env.versions && ort.env.versions.web};
  const st = await status();
  if (!st.installed) throw new Error('the speech model is not downloaded yet');
  const t0 = performance.now();
  const hc = navigator.hardwareConcurrency || 2;
  threads = self.crossOriginIsolated ? Math.max(1, Math.min(4, +want || Math.floor(hc / 2))) : 1;
  ort.env.wasm.wasmPaths = new URL('./vendor/ort/', import.meta.url).href;
  ort.env.wasm.numThreads = threads;
  const file = await (await (await modelDir(false)).getFileHandle(FILE)).getFile();
  session = await ort.InferenceSession.create(new Uint8Array(await file.arrayBuffer()),
    {executionProviders: ['wasm'], graphOptimizationLevel: 'all'});
  return {ms: Math.round(performance.now() - t0), threads, version: ort.env.versions && ort.env.versions.web};
}

async function encode(feats, rows, cols) {
  if (!session) throw new Error('the speech model is not loaded');
  const x = new ort.Tensor('float32', feats, [1, rows, cols]);
  const len = new ort.Tensor('int64', BigInt64Array.from([BigInt(cols)]), [1]);
  const out = await session.run({audio_signal: x, length: len});
  const lp = out.logprobs, [, F, V] = lp.dims, d = lp.data;
  if (F > MAX_FRAMES) throw new Error(`${F} frames in one pass (at most ${MAX_FRAMES})`);
  for (let f = 0; f < F; f++) {
    let best = 0, bv = -Infinity;
    for (let v = 0, b = f * V; v < V; v++) { const z = d[b + v]; if (z > bv) { bv = z; best = v; } }
    idsOut[f] = best; confOut[f] = Math.exp(bv);
  }
  if (lp.dispose) lp.dispose();
  return F;
}

function answer(status, n) {
  Atomics.store(ctl, 1, status); Atomics.store(ctl, 2, n);
  Atomics.store(ctl, 0, 1); Atomics.notify(ctl, 0);
}

function onEncode(ev) {
  const {feats, rows, cols} = ev.data;
  encode(feats, rows, cols).then((n) => answer(0, n), (e) => {
    const msg = new TextEncoder().encode(String(e && e.message || e)).slice(0, bytesOut.length);
    bytesOut.set(msg); answer(-1, msg.length);
  });
}

self.onmessage = async (ev) => {
  const {id, op} = ev.data || {};
  if (op === 'init') {
    const sab = ev.data.sab;
    ctl = new Int32Array(sab, 0, HDR);
    idsOut = new Int32Array(sab, HDR * 4, MAX_FRAMES);
    confOut = new Float32Array(sab, (HDR + MAX_FRAMES) * 4, MAX_FRAMES);
    bytesOut = new Uint8Array(sab, HDR * 4, MAX_FRAMES * 4);
    ev.data.port.onmessage = onEncode;
    post({id, ok: true, result: {}});
    return;
  }
  try {
    let result;
    if (op === 'status') result = await status();
    else if (op === 'download') result = await download(ev.data.base);
    else if (op === 'load') result = await load(ev.data.threads);
    else throw new Error(`unknown op ${op}`);
    post({id, ok: true, result});
  } catch (e) {
    if (op === 'download') post({type: 'model_download', state: 'failed', error: String(e && e.message || e)});
    post({id, ok: false, error: String(e && e.message || e)});
  }
};

