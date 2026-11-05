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
    listen_reciters: () => ['GET', '/api/listen/reciters'],         // #93 (v0.20) the Listen form's Reciter select
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
    export_plan: () => ['GET', '/api/profile/export_plan'],          // D4.9 (#71) the export dialog's kinds and sizes
    starter_hint: (p) => ['GET', `/api/starter_hint/${p.page}`],    // #40 the end of the page before (Blind)
    // #39 (U1.20, B3.16): the Review page; the parameters go as the JSON body (Android: the generic call)
    review_queue: () => ['GET', '/api/review/queue'],               // {today, counters, cards, suspended}
    review_card: (p) => ['POST', '/api/review/card', p],            // {card} -> the run-up, the cue, the start
    review_result: (p) => ['POST', '/api/review/result', p],        // {card, folder} -> ✓ / ✗ per ayah, the next due
    review_action: (p) => ['POST', '/api/review/action', p],        // {card, action} -> the new queue
    review_help: (p) => ['POST', '/api/review/help', p],            // #57: {card, folder} -> what went wrong, a method
  };

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
      // #78 (D5, v0.20): a press waits for the model before the microphone opens (only Android records while it loads)
      this.holdsAudio = false;
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

    /** D4.9 (#71, v0.19): {kinds: [{id, bytes, files}]}, the export dialog's sizes (App.export_plan). */
    exportPlan() { return this.call('export_plan'); }

    /** D4.4: the profile as a zip download; returns the message to show. D4.9: kinds = the ticked ones (null: all). */
    async exportProfile(kinds) {
      const resp = await fetch('/api/profile/export' + (kinds ? `?kinds=${q(kinds.join(','))}` : ''));
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
      return `Profile imported (the previous one is kept as ${r.backup}).${missingText(r.missing, r.backup, r.partial)}`;
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
      // #78 (D5, v0.20): with the model installed, a press opens the session and the microphone at once while the model
      // loads; Kotlin keeps the audio for Python, which catches up once the model is ready (ModelGate)
      this.holdsAudio = true;
      this.features = {review: true};   // #39: the review calls (meddeb_android.py, through the generic call)
      this.pending = new Map(); this.nextId = 1; this.session = null; this.onProgress = null;
      // D2 (v0.9): Kotlin downloads the speech model by itself (D1): its model_download events {state: running | done |
      // failed, pct, bytes, total, error, retry_s} go to onModelDownload, with or without a session
      this.onModelDownload = null;
      // P5.16 / U1.18 (issue #12): Kotlin's updater; its update_state events go to onUpdate, never to a session
      this.onUpdate = null;
      // U1.16 / issue #21: Kotlin's {type: shake} events (only while Settings > Phone allows it, shake(on)) go to onShake
      this.onShake = null;
      // #59 (v0.18): the car's recitation started while the page has no session of its own (its `started` names the
      // client car-N): onCarSession(m) may adopt it (adoptSession), and the page then follows it; Kotlin's {type:
      // notice, text} (e.g. "You left the car: …") go to onNotice, the microphone notification's Pause / Resume / Stop
      // for the page's own session ({type: remote, action}) to onRemote
      this.onCarSession = null; this.onNotice = null; this.onRemote = null;
      this.update = {
        check: (press) => this.call('android_update_check',   // press: Check again; #76: {press, channel} goes as it is
            press && typeof press === 'object' ? press : press ? {press: true} : {}),
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
        // v0.22 review (#92): + surah and ayah: ClipSpec judges a "qaSSS" range (a whole-surah file) by its ayah; without
        // it AudioBan judged the whole file and refused every clean range of a surah holding any banned ayah
        play: (p) => this.call('clip_play', Object.assign({url: p.url, key: p.key, t0_ms: p.t0_ms,
          t1_ms: p.t1_ms == null ? null : p.t1_ms}, p.gain == null ? {} : {gain: p.gain},
          p.ayah == null ? {} : {surah: p.surah, ayah: p.ayah})),
        stop: () => this.call('clip_stop'),
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
          if (m.type === 'notice') { if (this.onNotice) this.onNotice(String(m.text || ''), m.ms); return; }   // #59, as the web's
          if (m.type === 'remote') { if (this.onRemote) this.onRemote(m); return; }         // #59: the notification's press
          if (m.type === 'listen_state') {
            const st = Object.assign({}, m); delete st.type;
            if (this.player.onState) this.player.onState(st);
            return;
          }
          // #59: a car session's start reaches a page with none of its own: the page may adopt it (adoptSession)
          if (!this.session && m.type === 'started' && !m.search && /^car-/.test(String(m.client || '')) && this.onCarSession) {
            this.onCarSession(m);
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
          // v0.22 (plan D1/D3): a search from a paused group (keepAfterSearch) that found nothing: the group goes on
          if (m.type === 'done' && !(m.search && s.keepAfterSearch)) this.session = null;
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

    /** D4.4: Android's share sheet with the zip / Android's file picker (MainActivity). D4.9 (#71, v0.19): the kinds
     *  ticked (null: all); Python lists the files, Kotlin zips them on its own thread ("Exporting the profile: N %"
     *  as android_progress events), then the share sheet. The import's question names the kinds the zip lacks. */
    exportPlan() { return this.call('export_plan'); }
    async exportProfile(kinds) { return (await this.call('android_export_profile', kinds ? {kinds} : {})).text; }
    async importProfile() { return (await this.call('android_import_profile')).text; }

    /** D4.9 (#71, v0.19): Settings › Profile's copy for the PC in Download/Meddeb (Android 10+): {available, on,
     *  last_ms, bytes, name}; {on} after the page saved shared_copy in settings.json (a copy follows when one is due). */
    sharedCopy(p) { return this.call('android_shared_copy', p || {}); }

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

    /** #50 (v0.17): Settings > Phone > Keep the screen on for at least 5 min (on by default): Kotlin keeps the window's
     *  screen on while Meddeb is in front and its last activity is under 5 minutes old, while `on` -> {}. The PC engine
     *  has no keepScreen. */
    keepScreen(on) { return this.call('android_keep_screen', {on: !!on}); }

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

    openSession(onMessage, onClose) { return Promise.resolve(this.adoptSession(onMessage, onClose)); }

    /** #59: the page's session object, at once (openSession's): for a car session the page adopts (onCarSession) it
     *  takes that session's messages from its `started` on; what the page sends goes to Kotlin as ever, which hands a
     *  car session's pause / resume / stop to the car's player. */
    adoptSession(onMessage, onClose, car) {
      const session = {
        car: !!car,
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
      return session;
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
  /** D4.9 (#71, v0.19): the import's warning about the kinds the zip lacked (its export.json), '' for none. T4 review
   *  (2026-10-30): and those it held only in part (export.json "partial": Android's copy for the PC). */
  const KIND_NAMES = {settings: 'settings and logs', mistakes: 'mistake history', recordings: 'recordings'};
  function missingText(missing, backup, partial) {
    const listOf = ks => {
      const names = (ks || []).map(k => KIND_NAMES[k]).filter(Boolean);
      return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '';
    };
    const no = listOf(missing), part = listOf(partial);
    if (!no && !part) return '';
    const held = [no && `no ${no}`, part && `only part of the ${part}`].filter(Boolean).join(' and ');
    return ` This export held ${held}: ${part ? 'the rest stays' : 'they stay'} only in ${backup}.`;
  }

  async function profileZip(files, now) {
    const d = now || new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = [];
    let offset = 0;
    const enc = new TextEncoder();
    for (const f of files) {   // D4.9 (#71, v0.19): the worker's list (the kinds ticked; the logs with the settings)
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

  /** #74 (v0.20, D1): the start notice (after 1.5 s); it names the download only when the runtime is not kept yet
   *  (sw.js keeps app/vendor/ and app/engine/: ~34 MB). */
  function startText(cached) {
    return cached ? 'Starting Meddeb…' : 'Starting Meddeb… (the first visit downloads about 34 MB)';
  }

  /** Whether the service worker's cache (caches = window.caches) holds the runtime under the page's base: Pyodide's
   *  wasm, one of its largest files. */
  async function bundleCached(cs, base) {
    try { return !!(cs && await cs.match(new URL('vendor/pyodide/pyodide.asm.wasm', base).href)); } catch (e) { return false; }
  }

  class WorkerEngine {
    constructor() {
      this.kind = 'web'; this.nativeMic = false;
      this.holdsAudio = false;       // #78 (D5): a press waits for the model, as on the PC
      this.onModelDownload = null;   // D2: the encoder worker's download of the model
      this.onNotice = null;          // (text, ms): the start, a new version of the app
      this.update = null;            // P5.16: no app update to install: a new version loads with the page
      this.player = window.MeddebListenPlayer ? new window.MeddebListenPlayer() : null;
      this.clipPlayer = window.MeddebClipPlayer ? new window.MeddebClipPlayer() : null;
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
      this.keepStorage();   // #74: in the background
      const cached = await bundleCached(self.caches, document.baseURI);
      const slow = setTimeout(() => this.notice(startText(cached), 60000), 1500);
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

    /** #74 (v0.20): asks the browser to keep Meddeb's storage (the model, the profile, the kept app) instead of
     *  clearing it under pressure: navigator.storage.persist() is the window's (0.16-0.19 called it in the encoder
     *  worker, where it does not exist); at the start and at the model's download. */
    async keepStorage() {
      const s = typeof navigator !== 'undefined' && navigator.storage;
      if (!s || !s.persist) return false;
      try {
        this.persisted = (s.persisted && await s.persisted()) || await navigator.storage.persist();
      } catch (e) { /* the browser decides */ }
      return !!this.persisted;
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
      if (m.event === 'session' && s) {
        // review of 0.19 (as AndroidEngine): the worker finishes an older session's stop first; its last state and done
        // must not reach (and close) the session opened meanwhile, which takes nothing before its own `started`
        if (!s._started) {
          if (m.msg && m.msg.type === 'started') s._started = true;
          else if (!m.msg || m.msg.type !== 'status') return;
        }
        s._onMessage(m.msg);
        return;
      }
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
        this.keepStorage();   // #74: the 132 MB in OPFS
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
          ['Speech model', `${WEB_MODEL} (${m.loaded ? 'ready' : m.loading ? 'loading' : (await this.modelState()).installed ? 'not loaded' : 'not downloaded'})`],
          // #74: whether the browser keeps the storage (navigator.storage.persisted())
          ['Storage', (await this.storageKept()) ? 'kept by the browser (persistent)' : 'the browser may clear it when space runs low']);
      }
      return r;
    }

    async storageKept() {
      const s = navigator.storage;
      try { return !!(s && s.persisted && await s.persisted()); } catch (e) { return false; }
    }

    async clip(p) {
      await this.booted;
      return new Blob([await this.post(this.worker, {op: 'clip', params: p})], {type: 'audio/wav'});
    }

    /** D4.9 (#71, v0.19): the export dialog's sizes (App.export_plan, in the worker). */
    exportPlan() { return this.call('export_plan'); }

    async exportProfile(kinds) {
      await this.booted;
      // D4.9: the worker lists the files of the kinds ticked (Python's export_files), export.json first
      const blob = await profileZip(await this.post(this.worker, {op: 'files', kinds: kinds || null}));
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
      return `Profile imported (the previous one is kept in this browser as ${r.backup}).${missingText(r.missing, r.backup, r.partial)}`;
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
        send: (obj) => {
          if (this.session !== session) return;
          if (obj && obj.type === 'start') session._started = false;   // #20: a start over it waits for its `started`
          w.postMessage({op: 'session', msg: obj});
        },
        sendAudio: (int16) => {
          if (this.session !== session) return;
          const pcm = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
          w.postMessage({op: 'audio', pcm}, [int16.buffer]);
        },
        close: () => { if (this.session === session) { this.session = null; w.postMessage({op: 'session', msg: {type: 'close'}}); } },
        isOpen: () => this.session === session,
        _onMessage: (m) => onMessage(m, session),
        _onClose: () => onClose(session),
        _started: false,
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
    // tests (tests/test_web.py, tests/test_issue74_web_cache.py, Node)
    _web: {profileZip, crc32, browserFacts, missingText, startText, bundleCached},
  };
})();
