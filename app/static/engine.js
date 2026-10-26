/* Meddeb engine client (03_platforms.md §5): index.html talks to the backend only through this object, so that the
   same page runs on the PC (HTTP + WebSocket to server.py), in the Android app (JavaScript bridge to the Kotlin
   service, added in the Android plan) and later in the browser (Web Worker). */
(function () {
  'use strict';
  const q = encodeURIComponent;
  const ROUTES = {
    chapters: () => ['GET', '/api/chapters'],
    models: () => ['GET', '/api/models'],
    tajweed_legend: () => ['GET', '/api/tajweed_legend'],
    locate: (p) => ['GET', `/api/locate?surah=${p.surah}&ayah=${p.ayah || 1}`],
    ready: (p) => ['GET', `/api/ready?model=${q(p.model)}`],
    load: (p) => ['POST', `/api/load?model=${q(p.model)}`],
    page: (p) => ['GET', `/api/page/${p.page}`],
    progress: () => ['GET', '/api/progress'],
    stats: () => ['GET', '/api/stats'],                              // U1.19 the Stats page (issue #13)
    settings: () => ['GET', '/api/settings'],
    save_settings: (p) => ['POST', '/api/settings', p],
    mark: (p) => ['POST', '/api/marks', p],
    listen_targets: () => ['GET', '/api/listen/targets'],          // U1.13 quick buttons (B3.14)
    listen_plan: (p) => ['POST', '/api/listen/plan', p],            // a Listen form -> the ordered clips
    versions: () => ['GET', '/api/versions'],                       // U1.12 About: {app, platform, items, profile}
    // X2.15 / D4.6: the reciter's ayah file and the part a voice command plays (from_idx / to_idx omitted = the ayah's ends)
    reciter_clip: (p) => ['GET', '/api/reciter_clip?' + ['surah', 'ayah', 'from_idx', 'to_idx']
      .filter(k => p[k] != null && p[k] !== '').map(k => `${k}=${q(p[k])}`).join('&')],
    // D11 (2026-10-10): a saved session onto the page (U1.5 ◀ ▶; {} = the newest)
    session_load: (p) => ['GET', '/api/session_load?' + ['folder', 'rel', 'threshold']
      .filter(k => p[k] != null && p[k] !== '').map(k => `${k}=${q(p[k])}`).join('&')],
    report: (p) => ['POST', '/api/report', p],                     // U1.16 report a bug (D12, 2026-10-10)
    storage: () => ['GET', '/api/storage'],                         // U1.17 Settings > Space used (issue #14)
    storage_delete: (p) => ['POST', '/api/storage/delete', p],
    starter_hint: (p) => ['GET', `/api/starter_hint/${p.page}`],    // #40 the end of the page before (Blind)
    // #39 (U1.20, B3.16): the Review page; the parameters go as the JSON body (Android: the generic call)
    review_queue: () => ['GET', '/api/review/queue'],               // {today, counters, cards, suspended}
    review_card: (p) => ['POST', '/api/review/card', p],            // {card} -> the run-up, the cue, the start
    review_result: (p) => ['POST', '/api/review/result', p],        // {card, folder} -> ✓ / ✗ per ayah, the next due
    review_action: (p) => ['POST', '/api/review/action', p],        // {card, action} -> the new queue
  };

  /* #36 (X2.15): the device's own voice for a surah's name before a session's first word («سورة البقرة»; no reciter file
     has one). P0.2: only a voice that runs on the device: the browser's speechSynthesis with an Arabic voice whose
     localService is true (Chrome's "Google" voices send the text to Google's servers: refused). speak resolves
     {status: 'ended' | 'stopped' | 'unavailable' | 'failed', error?}, never rejects; the page plays its fallback (the
     basmala) for anything but ended / stopped. */
  function webSpeaker() {
    const ss = () => window.speechSynthesis || null;
    const voice = () => {
      const s = ss(); if (!s || !window.SpeechSynthesisUtterance) return null;
      let vs = [];
      try { vs = s.getVoices() || []; } catch (e) { /* no voices */ }
      return vs.find(v => /^ar(?:[-_]|$)/i.test(v.lang || '') && v.localService === true) || null;
    };
    let cur = null;   // {end} of the utterance being spoken
    voice();          // Chrome loads its voice list on the first ask
    const stop = () => {
      const c = cur; cur = null;
      if (c) c.end('stopped');
      const s = ss(); if (s) { try { s.cancel(); } catch (e) { /* nothing queued */ } }
    };
    return {
      available: () => !!voice(),
      speak: (text) => new Promise((resolve) => {
        const v = voice();
        if (!v) { resolve({status: 'unavailable'}); return; }
        stop();
        let done = false, guard = null;
        const end = (status, error) => {
          if (done) return;
          done = true; clearTimeout(guard); if (cur && cur.end === end) cur = null;
          resolve(error ? {status, error} : {status});
        };
        const u = new window.SpeechSynthesisUtterance(String(text));
        u.voice = v; u.lang = v.lang;
        u.onend = () => end('ended');
        u.onerror = (e) => {
          const why = e && e.error ? String(e.error) : 'speech failed';
          if (why === 'interrupted' || why === 'canceled') end('stopped'); else end('failed', why);
        };
        cur = {end};
        guard = setTimeout(() => {   // a voice that never ends
          end('failed', 'no end after 15 s');
          try { ss().cancel(); } catch (e) { /* gone */ }
        }, 15000);
        try { ss().speak(u); } catch (e) { end('failed', e && e.message ? e.message : String(e)); }
      }),
      stop,
    };
  }

  async function failure(resp) {
    let detail = resp.statusText;
    try { detail = (await resp.json()).detail || detail; } catch (e) { /* not JSON */ }
    const err = new Error(detail);
    err.status = resp.status;
    return err;
  }

  class HttpEngine {
    constructor() {
      this.kind = 'http'; this.nativeMic = false;
      // #39 (user, 2026-10-25: "only the Android app, not the web for now"): what this engine offers beyond the
      // shared calls; the PC has the review calls (server.py) so the page can be tried there; an engine without
      // `features` (the web's) has none
      this.features = {review: true};
      this.onModelDownload = null;   // D2 (v0.9): never called on the PC (the models are on disk, B3.1)
      this.update = null; this.onUpdate = null;   // P5.16: the PC updates with git; no app update
      // U1.13: the page's player (static/listen_player.js; null when that file is missing: Listen then says so)
      this.player = window.MeddebListenPlayer ? new window.MeddebListenPlayer() : null;
      // X2.15: the reciter's words after a voice command (static/listen_player.js MeddebClipPlayer, Web Audio)
      this.clipPlayer = window.MeddebClipPlayer ? new window.MeddebClipPlayer() : null;
      // #36: a surah's name by the browser's own Arabic voice (an offline one only)
      this.speaker = webSpeaker();
    }

    /** U1.14: the first mushaf page is drawn (Android hides its native start screen; nothing to do here). */
    uiReady() {}

    async call(name, params = {}) {
      const route = ROUTES[name];
      if (!route) throw new Error(`unknown call ${name}`);
      const [method, url, body] = route(params);
      const init = body === undefined ? {method}
        : {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)};
      const resp = await fetch(url, init);
      if (!resp.ok) throw await failure(resp);
      return resp.json();
    }

    /** Replay (B3.7): WAV of a session between start and end seconds, as a Blob. */
    async clip(p) {
      const url = `/api/clip/${q(p.session)}?start=${p.start}&end=${p.end}&margin=${p.margin}`
        + (p.folder ? `&folder=${q(p.folder)}` : '');
      const resp = await fetch(url);
      if (!resp.ok) throw await failure(resp);
      return resp.blob();
    }

    /** D4.4: the profile as a zip download; returns the message to show. */
    async exportProfile() {
      const resp = await fetch('/api/profile/export');
      if (!resp.ok) throw await failure(resp);
      const name = (/filename="([^"]+)"/.exec(resp.headers.get('Content-Disposition') || '') || [])[1] || 'meddeb_profile1.zip';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await resp.blob()); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      return `Profile exported as ${name}.`;
    }

    /** D4.4: replace the profile with an exported zip (a File from the page's file picker). */
    async importProfile(file) {
      const resp = await fetch('/api/profile/import', {method: 'POST', body: file});
      if (!resp.ok) throw await failure(resp);
      const r = await resp.json();
      return `Profile imported (the previous one is kept as ${r.backup}).`;
    }

    /** U1.16 (D12, 2026-10-10; D3 v0.9): the PC takes no screenshot (the issue says "Screenshot: none"). */
    async screenshot() { return null; }

    /** U1.16 / D3 (v0.9, user #8): report{session, folder} -> {title, body, url, session_name}: the issue text only (the
     *  app version, the session's name), nothing written nor attached; the page sends the window of the click to url. */
    reportBug(p) { return this.call('report', p); }

    /** U1.17 (issue #14): {rows, recording} / {ok, what, bytes, files, kept} | {ok: false, what, reason}: the profile
     *  only (the PC keeps no Listen audio; its models are developer files). */
    storage() { return this.call('storage'); }
    deleteStorage(what) { return this.call('storage_delete', {what}); }

    /** A live session (B3.8). Resolves once connected; onMessage(msg, session), onClose(session). */
    openSession(onMessage, onClose) {
      return new Promise((resolve, reject) => {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const sock = new WebSocket(`${proto}://${location.host}/ws`);
        sock.binaryType = 'arraybuffer';
        const session = {
          send: (obj) => { if (sock.readyState === 1) sock.send(JSON.stringify(obj)); },
          sendAudio: (int16) => { if (sock.readyState === 1) sock.send(int16.buffer); },
          close: () => { sock.onclose = null; try { sock.close(); } catch (e) { /* already closed */ } },
          isOpen: () => sock.readyState === 1,
        };
        sock.onmessage = (ev) => onMessage(JSON.parse(ev.data), session);
        sock.onclose = () => onClose(session);
        sock.onopen = () => resolve(session);
        sock.onerror = () => reject(new Error('cannot reach the Meddeb server'));
      });
    }
  }

  /* Android: window.MeddebNative (MainActivity's JavaScript bridge) forwards to the Kotlin Engine, which runs the same
     Python backend (recite/app.py) and records the microphone natively (nativeMic). Answers come back through
     window.__meddeb.resolve(id, ok, payload), session events through window.__meddeb.event(json). */
  class AndroidEngine {
    constructor() {
      this.kind = 'android'; this.nativeMic = true;
      this.features = {review: true};   // #39: the review calls (meddeb_android.py, through the generic call)
      this.pending = new Map(); this.nextId = 1; this.session = null; this.onProgress = null;
      // D2 (v0.9): Kotlin downloads the speech model by itself (D1): its model_download events {state: running | done |
      // failed, pct, bytes, total, error, retry_s} go to onModelDownload, with or without a session
      this.onModelDownload = null;
      // P5.16 / U1.18 (issue #12): Kotlin's updater; its update_state events go to onUpdate, never to a session
      this.onUpdate = null;
      // U1.16 / issue #21: Kotlin's {type: shake} events (only while Settings > Phone allows it, shake(on)) go to onShake
      this.onShake = null;
      this.update = {
        check: (press) => this.call('android_update_check', press ? {press: true} : {}),   // press: Check again
        start: () => this.call('android_update_start'),
        cancel: () => this.call('android_update_cancel'),
        settings: () => this.call('android_update_settings'),
        state: (ack) => this.call('android_update_state', ack ? {ack} : {}),
      };
      // U1.13: Media3 PlaybackService plays (background, notification, shortcuts, car); its states come back as
      // listen_state events, also when no session is open
      const listen = (obj) => {
        if (!window.MeddebNative.listen) throw new Error('this version of the app cannot play recitations');
        window.MeddebNative.listen(JSON.stringify(obj));
      };
      this.player = {
        onState: null,
        // #31: the listening's options {vary, gap_s} (Kotlin keeps them as plan.options: Resume plays as it started)
        play: (plan, repeat, options) => listen(Object.assign({action: 'play', plan, repeat: Math.max(0, parseInt(repeat, 10) || 0)},
          options ? {options: {vary: options.vary === true, gap_s: Math.max(0, Math.min(30, parseInt(options.gap_s, 10) || 0))}} : {})),
        pause: () => listen({action: 'pause'}),
        resume: () => listen({action: 'resume'}),
        stop: () => listen({action: 'stop'}),
      };
      // X2.15: the reciter's words after a voice command: MainActivity's ClipPlayer (its own ExoPlayer, never the Listen
      // service); play resolves {status: 'ended' | 'stopped'} when the clip is over (__meddeb.resolve)
      this.clipPlayer = {
        // X2.18 (2026-10-10): gain = the reciter_clip's (0..1, the ExoPlayer volume); none = unity (ClipSpec.of)
        play: (p) => this.call('clip_play', Object.assign({url: p.url, key: p.key, t0_ms: p.t0_ms,
          t1_ms: p.t1_ms == null ? null : p.t1_ms}, p.gain == null ? {} : {gain: p.gain})),
        stop: () => this.call('clip_stop'),
      };
      // #36: a surah's name by Kotlin's TextToSpeech (Speaker.kt: an Arabic voice that needs no network, P0.2), through
      // the generic call like clip_play: tts_speak{text} -> {status: 'ended' | 'stopped' | 'unavailable' | 'failed',
      // error?}; Kotlin knows whether a voice exists (available: true here), an app without the call is 'unavailable'
      this.speaker = {
        available: () => true,
        speak: (text) => this.call('tts_speak', {text: String(text)})
          .then((r) => r || {status: 'failed'}, (e) => ({status: 'unavailable', error: e && e.message ? e.message : String(e)})),
        stop: () => this.call('tts_stop').catch(() => null),
      };
      window.__meddeb = {
        resolve: (id, ok, payload) => {
          const p = this.pending.get(id); if (!p) return;
          this.pending.delete(id);
          if (ok) p.resolve(payload ? JSON.parse(payload) : null);
          else { const err = new Error(payload || 'error'); err.status = 500; p.reject(err); }
        },
        event: (json) => {
          const m = JSON.parse(json);
          if (m.type === 'android_progress') { if (this.onProgress) this.onProgress(m); return; }   // the phone tools
          if (m.type === 'model_download') { if (this.onModelDownload) this.onModelDownload(m); return; }
          if (m.type === 'update_state') { if (this.onUpdate) this.onUpdate(m); return; }   // P5.16
          if (m.type === 'shake') { if (this.onShake) this.onShake(); return; }             // issue #21, never a session
          if (m.type === 'listen_state') {
            const st = Object.assign({}, m); delete st.type;
            if (this.player.onState) this.player.onState(st);
            return;
          }
          const s = this.session; if (!s) return;
          // the engine saves an older session (e.g. the car's) before it starts this one: its last state and done
          // arrive first and must not reach (and close) the new session
          if (!s._started) {
            if (m.type === 'started') s._started = true;
            else if (m.type !== 'closed' && m.type !== 'status') return;
          }
          if (m.type === 'closed') { this.session = null; s._onClose(); return; }
          s._onMessage(m);
          if (m.type === 'done') this.session = null;
        },
      };
    }

    call(name, params = {}) {
      return new Promise((resolve, reject) => {
        const id = this.nextId++;
        this.pending.set(id, {resolve, reject});
        window.MeddebNative.call(id, name, JSON.stringify(params));
      });
    }

    /** U1.14: the first mushaf page is drawn: MainActivity removes its native start screen (ta'awwudh + basmala). */
    uiReady() { if (window.MeddebNative.uiReady) window.MeddebNative.uiReady(); }

    /** D4.4: Android's share sheet with the zip / Android's file picker (MainActivity). */
    async exportProfile() { return (await this.call('android_export_profile')).text; }
    async importProfile() { return (await this.call('android_import_profile')).text; }

    /** U1.16 / D3 (v0.9): MainActivity copies the WebView's pixels (PixelCopy) into Download/Meddeb/meddeb_shot_<yyyy-mm-dd
     *  _HH-MM-SS>.png (the newest 10 kept) -> {ok, name, folder} ({ok: false, error} without one); taken first, before
     *  any toast covers the page. */
    screenshot() { return this.call('android_report_shot'); }

    /** U1.16 / D3: {session, folder, screenshot (its name)}: Kotlin adds the device, Python writes the issue text (the
     *  app version, the phone, the screenshot's name, the session's name), Kotlin opens the prefilled issue in the
     *  default browser -> {text (the toast), url, …}. Nothing is attached nor uploaded. */
    reportBug(p) { return this.call('android_report', p); }

    /** U1.16 / issue #21: Settings > Phone > Shake the phone to send feedback (off by default): Kotlin listens to the
     *  accelerometer while `on` and MainActivity is resumed, and sends {type: shake} -> {available} (false: no
     *  accelerometer). The PC engine has no shake. */
    shake(on) { return this.call('android_shake', {on: !!on}); }

    /** U1.17 (issue #14): Kotlin adds the phone's rows (Listen audio, the speech model, the app, the bug screenshots,
     *  the export copy) to Python's profile rows, and deletes the phone's kinds itself. */
    storage() { return this.call('android_storage'); }
    deleteStorage(what) { return this.call('android_storage_delete', {what}); }

    async clip(p) {
      const b64 = await this.call('clip', p);
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], {type: 'audio/wav'});
    }

    openSession(onMessage, onClose) {
      const session = {
        // #20: a start over an open session (the session that goes on after Find where I am, start{after_search}) waits
        // for its own `started` again: the engine finishes the search first, and the search's last step and its `done`
        // must neither reach nor close the page's session
        send: (obj) => {
          if (obj && obj.type === 'start') session._started = false;
          window.MeddebNative.sessionSend(JSON.stringify(obj));
        },
        sendAudio: () => {},                                   // the phone records natively
        close: () => { if (this.session === session) this.session = null; },
        isOpen: () => this.session === session,
        _onMessage: (m) => onMessage(m, session),
        _onClose: () => onClose(session),
        _started: false,
      };
      this.session = session;
      return Promise.resolve(session);
    }
  }

  /* P5.11 (#37): the web app, nothing on a server: d05_web/engine_worker.js runs the same Python backend in Pyodide,
     d05_web/encoder_worker.js the speech model in onnxruntime-web; the page records the microphone as on the PC.
     Both workers need a cross-origin isolated page (SharedArrayBuffer, the model's threads): GitHub Pages sends no
     COOP / COEP headers, so the app's service worker (sw.js) adds them and the first visit reloads once. */
  const WEB_MAX_FRAMES = 8192, WEB_HDR = 4;   // encoder_worker.js's answer layout
  const WEB_MODEL = 'fastconformer_quran';
  const ZIP_CHUNK = 4 * 1024 * 1024;

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes, crc) {
    let c = (crc === undefined ? 0 : crc) ^ 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** D4.4: the profile's files [{rel, size, blob | bytes}] -> the zip the phone and the PC import (entries
   *  "profile1/<rel>", logs/ left out, stored: the recordings do not shrink), as a Blob built from the files' own Blobs
   *  (a large profile is never copied into memory). */
  async function profileZip(files, now) {
    const d = now || new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = [];
    let offset = 0;
    const enc = new TextEncoder();
    for (const f of files) {
      if (f.rel === 'logs' || f.rel.startsWith('logs/')) continue;
      const name = enc.encode('profile1/' + f.rel);
      let crc = 0;
      if (f.bytes) crc = crc32(f.bytes);
      else for (let o = 0; o < f.size; o += ZIP_CHUNK) crc = crc32(new Uint8Array(await f.blob.slice(o, o + ZIP_CHUNK).arrayBuffer()), crc);
      const head = (sig, extra) => {
        const b = new DataView(new ArrayBuffer(extra + name.length));
        b.setUint32(0, sig, true);
        return b;
      };
      const local = head(0x04034b50, 30);
      [[4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, f.size, 4], [22, f.size, 4],
        [26, name.length, 2], [28, 0, 2]].forEach(([o, v, n]) => (n === 2 ? local.setUint16(o, v, true) : local.setUint32(o, v, true)));
      new Uint8Array(local.buffer).set(name, 30);
      const cen = head(0x02014b50, 46);
      [[4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, f.size, 4],
        [24, f.size, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
        .forEach(([o, v, n]) => (n === 2 ? cen.setUint16(o, v, true) : cen.setUint32(o, v, true)));
      new Uint8Array(cen.buffer).set(name, 46);
      parts.push(local.buffer, f.bytes || f.blob);
      central.push(cen.buffer);
      offset += local.byteLength + f.size;
    }
    const size = central.reduce((s, b) => s + b.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, central.length, true); end.setUint16(10, central.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], {type: 'application/zip'});
  }

  /** The browser for the About title and the bug report: {browser: "Chrome 155", os: "Windows"}. */
  function browserFacts() {
    const ua = navigator.userAgent || '';
    const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
    const b = brands.find(x => /Chrome|Edge|Opera|Brave/i.test(x.brand) && !/Not/i.test(x.brand));
    const m = /(Firefox|Edg|OPR|Chrome|Version)\/(\d+)/.exec(ua);
    const browser = b ? `${b.brand.replace('Google ', '')} ${b.version}`
      : m ? `${{Edg: 'Edge', OPR: 'Opera', Version: 'Safari'}[m[1]] || m[1]} ${m[2]}` : 'unknown browser';
    const os = (navigator.userAgentData && navigator.userAgentData.platform)
      || (/Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'unknown');
    return {browser, os};
  }

  class WorkerEngine {
    constructor() {
      this.kind = 'web'; this.nativeMic = false;
      this.onModelDownload = null;   // D2: the encoder worker's download of the model
      this.onNotice = null;          // (text, ms): the start, a new version of the app
      this.update = null;            // P5.16: no app update to install: a new version loads with the page
      this.player = window.MeddebListenPlayer ? new window.MeddebListenPlayer() : null;
      this.clipPlayer = window.MeddebClipPlayer ? new window.MeddebClipPlayer() : null;
      this.speaker = webSpeaker();
      this.pending = new Map(); this.nextId = 1; this.session = null;
      this.model = {loaded: false, loading: null, downloading: false, pct: 0, error: null, threads: 0, ortVersion: ''};
      this.version = {version: 'dev'};
      this.facts = browserFacts();
      this.booted = this.boot();
      this.booted.catch(() => {});
    }

    notice(text, ms) { if (this.onNotice) { try { this.onNotice(text, ms); } catch (e) { /* the page's */ } } }

    async isolate() {
      // the service worker also keeps the app for offline use (sw.js); without isolation it adds COOP / COEP and the
      // page reloads once (a second reload would loop: the browser cannot isolate this page)
      let reg = null;
      if ('serviceWorker' in navigator) {
        try { reg = await navigator.serviceWorker.register('sw.js'); } catch (e) { reg = null; }
      }
      if (self.crossOriginIsolated) { try { sessionStorage.removeItem('meddeb_isolate'); } catch (e) { /* none */ } return; }
      if (!reg) throw new Error('this browser cannot run Meddeb (no service worker: a private window?)');
      let tried = null;
      try { tried = sessionStorage.getItem('meddeb_isolate'); } catch (e) { /* none */ }
      if (tried) throw new Error('this browser cannot isolate the page (SharedArrayBuffer): use Chrome, Edge or Firefox');
      try { sessionStorage.setItem('meddeb_isolate', '1'); } catch (e) { /* none */ }
      await navigator.serviceWorker.ready;
      location.reload();
      await new Promise(() => {});
    }

    async boot() {
      await this.isolate();
      try { this.version = await (await fetch('version.json', {cache: 'no-store'})).json(); } catch (e) { /* dev */ }
      if (!document.querySelector('link[rel="manifest"]')) {   // P5.11: installable as an app
        const l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest'; document.head.appendChild(l);
      }
      const slow = setTimeout(() => this.notice('Starting Meddeb… (the first visit downloads about 30 MB)', 60000), 1500);
      const sab = new SharedArrayBuffer((WEB_HDR + 2 * WEB_MAX_FRAMES) * 4);
      const ch = new MessageChannel();
      this.encoder = new Worker(new URL('encoder_worker.js', document.baseURI), {type: 'module'});
      this.worker = new Worker(new URL('engine_worker.js', document.baseURI), {type: 'module'});
      this.encoder.onmessage = (ev) => this.onWorker(ev.data);
      this.worker.onmessage = (ev) => this.onWorker(ev.data);
      const fatal = (e) => { const p = [...this.pending.values()]; this.pending.clear(); p.forEach(x => x.reject(new Error(e.message || 'a worker failed'))); };
      this.encoder.onerror = fatal; this.worker.onerror = fatal;
      await this.post(this.encoder, {op: 'init', sab, port: ch.port2}, [ch.port2]);
      const facts = {app_version: this.version.version, browser: this.facts.browser, os: this.facts.os};
      try {
        this.engineInfo = await this.post(this.worker, {op: 'init', sab, encPort: ch.port1, facts}, [ch.port1]);
      } finally { clearTimeout(slow); }
      this.notice('', 0);
      this.watchVersion();
      return this.engineInfo;
    }

    post(worker, msg, transfer) {
      return new Promise((resolve, reject) => {
        const id = this.nextId++;
        this.pending.set(id, {resolve, reject});
        worker.postMessage(Object.assign({id}, msg), transfer || []);
      });
    }

    onWorker(m) {
      if (!m) return;
      if (m.id !== undefined && this.pending.has(m.id)) {
        const p = this.pending.get(m.id); this.pending.delete(m.id);
        if (m.ok) p.resolve(m.result); else { const e = new Error(m.error); e.status = 500; p.reject(e); }
        return;
      }
      if (m.type === 'model_download') {
        this.model.downloading = m.state === 'running'; this.model.pct = m.pct || 0;
        if (this.onModelDownload) this.onModelDownload(m);
        return;
      }
      if (m.event === 'log') { console.warn('[meddeb]', m.text); return; }
      const s = this.session;
      if (m.event === 'session' && s) { s._onMessage(m.msg); return; }
      if (m.event === 'closed' && s) { this.session = null; s._onClose(); }
    }

    /** A newer version on the website: the page says so (checked at start and when the page shows again, at most
     *  hourly); the service worker serves the new files at the next load. */
    watchVersion() {
      let last = Date.now();
      const check = async () => {
        if (document.hidden || Date.now() - last < 3600e3) return;
        last = Date.now();
        try {
          const v = await (await fetch('version.json', {cache: 'no-store'})).json();
          if (v && v.version && (v.version !== this.version.version || v.commit !== this.version.commit)) {
            this.notice(`Meddeb ${v.version} is available: reload the page to use it.`, 20000);
          }
        } catch (e) { /* offline */ }
      };
      document.addEventListener('visibilitychange', check);
    }

    uiReady() {}

    async modelState() {
      const st = await this.post(this.encoder, {op: 'status'});
      const m = this.model;
      return {model: WEB_MODEL, ready: m.loaded, loading: !!m.loading, installed: !!st.installed, downloading: m.downloading,
        pct: m.pct, error: m.loaded || m.loading ? null : m.error, size: st.size};
    }

    loadModel() {
      const m = this.model;
      if (m.loaded || m.loading) return;
      m.error = null;
      m.loading = this.post(this.encoder, {op: 'load', threads: +new URLSearchParams(location.search).get('threads') || 0})
        .then((r) => { m.loaded = true; m.threads = r.threads; m.ortVersion = r.version || '';
          this.post(this.worker, {op: 'log', text: `speech model loaded in ${r.ms} ms, ${r.threads} threads (ONNX Runtime Web ${r.version})`}).catch(() => {}); },
          (e) => { m.error = e.message; })
        .finally(() => { m.loading = null; });
    }

    async call(name, params = {}) {
      await this.booted;
      if (name === 'ready') return this.modelState();
      if (name === 'load') { this.loadModel(); return Object.assign(await this.modelState(), {loading: !this.model.loaded}); }
      if (name === 'android_download_model' || name === 'download_model') {   // the page's ensureModel (D1)
        this.model.downloading = true;
        try { return await this.post(this.encoder, {op: 'download', base: new URL('../models/' + WEB_MODEL + '/', document.baseURI).href}); }
        finally { this.model.downloading = false; }
      }
      if (name === 'models') {
        const st = await this.modelState();
        return {default: WEB_MODEL, models: [{name: WEB_MODEL, kind: 'onnx_ctc', available: true, benchmarked: true,
          params_m: 114.6, phone: true, note: "Qur'an FastConformer-CTC, int8, in the browser", ready: st.ready,
          loading: st.loading, error: st.error}]};
      }
      const r = await this.post(this.worker, {op: 'call', name, params});
      if (name === 'versions') {
        const i = this.engineInfo || {}, m = this.model;
        r.items.push(['Pyodide', i.pyodide || '?'], ['ONNX Runtime Web', m.ortVersion ? `${m.ortVersion} (${m.threads} threads)` : 'not loaded yet'],
          ['Browser', `${this.facts.browser} on ${this.facts.os}${self.crossOriginIsolated ? '' : ' (not isolated)'}`],
          ['Speech model', `${WEB_MODEL} (${m.loaded ? 'ready' : m.loading ? 'loading' : (await this.modelState()).installed ? 'not loaded' : 'not downloaded'})`]);
      }
      return r;
    }

    async clip(p) {
      await this.booted;
      return new Blob([await this.post(this.worker, {op: 'clip', params: p})], {type: 'audio/wav'});
    }

    async exportProfile() {
      await this.booted;
      const blob = await profileZip(await this.post(this.worker, {op: 'files'}));
      const d = new Date(), z = (n) => String(n).padStart(2, '0');
      const name = `meddeb_profile1_${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}.zip`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      return `Profile exported as ${name} (your browser's downloads).`;
    }

    async importProfile(file) {
      await this.booted;
      const r = await this.post(this.worker, {op: 'import', file});
      return `Profile imported (the previous one is kept in this browser as ${r.backup}).`;
    }

    async screenshot() { return null; }

    /** U1.16: the prefilled issue of the public Karim-53/Meddeb (recite/report.py, platform web); nothing sent. */
    reportBug(p) { return this.call('report', p); }

    /** U1.17: the profile's rows (Python) + the speech model and the rest of what the browser keeps for Meddeb. */
    async storage() {
      const r = await this.call('storage');
      const st = await this.modelState().catch(() => ({size: 0}));
      let usage = 0;
      try { usage = (await navigator.storage.estimate()).usage || 0; } catch (e) { /* unknown */ }
      const profile = (r.rows || []).reduce((s, x) => s + (+x.bytes || 0), 0);
      r.rows.push({id: 'model', bytes: st.size || 0, files: st.size ? 1 : 0, deletable: false},
        {id: 'app', bytes: Math.max(0, usage - profile - (st.size || 0)), files: 0, deletable: false});
      return r;
    }
    deleteStorage(what) { return this.call('storage_delete', {what}); }

    async openSession(onMessage, onClose) {
      await this.booted;
      const w = this.worker;
      const session = {
        send: (obj) => { if (this.session === session) w.postMessage({op: 'session', msg: obj}); },
        sendAudio: (int16) => {
          if (this.session !== session) return;
          const pcm = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
          w.postMessage({op: 'audio', pcm}, [int16.buffer]);
        },
        close: () => { if (this.session === session) { this.session = null; w.postMessage({op: 'session', msg: {type: 'close'}}); } },
        isOpen: () => this.session === session,
        _onMessage: (m) => onMessage(m, session),
        _onClose: () => onClose(session),
      };
      if (this.session) this.session.close();
      this.session = session;
      return session;
    }
  }

  /* The web app runs from .../app/ (GitHub Pages: /Meddeb/app/, P5.11); ?engine=web forces it elsewhere (tests). */
  const onWeb = () => typeof location !== 'undefined' && (/\/app\/(index\.html)?$/.test(location.pathname || '')
    || new URLSearchParams(location.search || '').get('engine') === 'web');

  window.MeddebEngine = {
    create() { return window.MeddebNative ? new AndroidEngine() : onWeb() ? new WorkerEngine() : new HttpEngine(); },
    _web: {profileZip, crc32, browserFacts},   // tests (tests/test_web_engine.py, Node)
  };
})();
