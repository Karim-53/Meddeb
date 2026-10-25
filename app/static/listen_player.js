/* Listen player of the PC / web page (U1.13, plan 2026-10-01 §1.2): engine.player of HttpEngine. Plays a listen_plan
   (recite/listen.py) clip by clip from the reciter's per-ayah files (D4.5: EveryAyah, streamed, the browser caches them),
   the whole range `repeat` more times (decision D1: 17 -> 18 plays, 0 -> once), preloading the next clip in a second
   <audio> element, with the browser's Media Session (title, reciter, play / pause / stop / previous / next). Android
   plays natively instead (Media3 PlaybackService, engine.js AndroidEngine.player). The pure pass counting is tested by
   tests/test_ui_logic.py with Node. MeddebClipPlayer (below) plays a few words of one ayah for the voice commands;
   MeddebReplay plays one's own recording from the word popover, one replay at a time (all platforms). */
(function (root) {
  'use strict';

  /** The file of one clip: base_url + "SSSAAA" + ".mp3" (the basmala is 001001). */
  function clipUrl(reciter, clip) { return reciter.base_url + clip.key + '.mp3'; }

  /** The position after the clip at pos ({index, pass}) has ended: the next clip, the next pass from the first clip,
   *  or ended (the last clip of the last pass stays the position). total = the clips of a pass: a number, or #31 a
   *  function of the pass (a varied pass has its own length). */
  function advance(pos, total, passes) {
    const n = typeof total === 'function' ? total(pos.pass) : total;
    if (pos.index + 1 < n) return {index: pos.index + 1, pass: pos.pass, ended: false};
    if (pos.pass < passes) return {index: 0, pass: pos.pass + 1, ended: false};
    return {index: pos.index, pass: pos.pass, ended: true};
  }

  /** "Previous": the clip before, the last clip of the previous pass, or the first clip again. */
  function back(pos, total) {
    if (pos.index > 0) return {index: pos.index - 1, pass: pos.pass};
    if (pos.pass > 1) return {index: (typeof total === 'function' ? total(pos.pass - 1) : total) - 1, pass: pos.pass - 1};
    return {index: 0, pass: 1};
  }

  /** ui_logic.js (the pass shapes, #31): the page loads it first; Node's tests require it. */
  function logic() {
    if (typeof module === 'object' && module.exports) return require('./ui_logic.js');
    return root.MeddebLogic || null;
  }

  const RETRIES = 1;   // a clip that fails to load is retried once (a network hiccup), then the state is 'error'
  const RETRY_MS = 1500;
  // #31 (user, 2026-10-24): the pause between plays (Vary on with a pause of 0: 0.25 s, the phone's rule: it swaps in the
  // next play's ayat during it), the fade-out over 1.8 s ending on the cut, checked every 50 ms
  const MIN_GAP_MS = 250, FADE_MS = 1800, FADE_TICK_MS = 50;

  class MeddebListenPlayer {
    constructor() {
      this.onState = null;
      this.plan = null; this.passes = 1; this.pos = {index: 0, pass: 1};
      this.status = 'idle'; this.message = null;
      this.els = null; this.cur = 0;   // two <audio> elements: the current clip and the preloaded next one
      this.retries = 0; this.retryMs = RETRY_MS; this.retryTimer = null;
      // a failed load reports twice (the element's 'error' and the rejected play()): one failure per load attempt
      this.attempt = 0; this.failedAttempt = -1;
      this.sessionWired = false;
      // #31: the listening's options {vary, gap_s} and seed, each pass's clips (drawn once), the pause between two plays
      // (gap = {pass: the play that comes next} while it lasts), the fade-out's timer; the times are fields so that the
      // tests run them fast
      this.opts = {vary: false, gap_s: 0}; this.seed = 0; this.passCache = new Map();
      this.gap = null; this.gapTimer = null; this.fadeTimer = null;
      this.secondMs = 1000; this.minGapMs = MIN_GAP_MS; this.fadeTickMs = FADE_TICK_MS;
    }

    _ensure() {
      if (this.els) return;
      this.els = [0, 1].map((k) => {
        const a = new Audio();
        a.preload = 'auto'; a.setAttribute('playsinline', ''); a.playsInline = true;
        a.addEventListener('playing', () => { if (k === this.cur && this.plan) { this.retries = 0; this._set('playing'); } });
        a.addEventListener('ended', () => { if (k === this.cur && this.plan) this._next(); });
        a.addEventListener('pause', () => {   // paused by the system (another app, headphones unplugged): say so
          if (a.dataset.cut) { delete a.dataset.cut; return; }   // #31: the fade-out's own cut
          if (k === this.cur && this.plan && !a.ended && !this.gap && this.status === 'playing') this._set('paused');
        });
        a.addEventListener('error', () => { if (k === this.cur && this.plan && a.getAttribute('src')) this._failed(); });
        return a;
      });
    }

    /** Called synchronously inside the click that will start playing (phones allow play() after a user gesture only). */
    unlock() {
      this._ensure();
      for (const a of this.els) {
        if (a.dataset.unlocked || a.getAttribute('src')) continue;
        try { const p = a.play(); if (p && p.catch) p.catch(() => {}); a.pause(); } catch (e) { /* nothing to unlock */ }
        a.dataset.unlocked = '1';
      }
    }

    /** Starts the plan (replaces anything playing); repeat >= 0 extra passes over the whole range. #31: opts = {vary
     *  (each play after the first starts and ends 0-4 ayat further out, from the plan's margins, and may fade out),
     *  gap_s (the pause between two plays), seed (default: a new one)}; none: the exact range, no pause. */
    play(plan, repeat, opts) {
      this._ensure();
      this._silence(); this._cancelRetry(); this._clearGap(); this._stopFade();
      if (!plan || !plan.clips || !plan.clips.length) { this.plan = null; this.message = 'nothing to play'; this._set('error'); return; }
      this.plan = plan; this.passes = Math.max(0, parseInt(repeat, 10) || 0) + 1;
      const o = opts || {};
      this.opts = {vary: o.vary === true, gap_s: Math.max(0, Math.min(30, parseInt(o.gap_s, 10) || 0))};
      this.seed = o.seed != null ? (+o.seed >>> 0) : (Math.random() * 4294967296) >>> 0;
      this.passCache = new Map();
      this.pos = {index: 0, pass: 1}; this.retries = 0;
      this._wireMediaSession();
      this._start();
    }

    pause() {
      if (!this.plan || !['playing', 'loading'].includes(this.status)) return;
      this._cancelRetry();   // a retry waiting after a failed load must not start playing behind the pause
      // #31: in the pause between two plays it holds there (resume starts the next play)
      if (this.gap) { clearTimeout(this.gapTimer); this.gapTimer = null; this._set('paused'); return; }
      this.els[this.cur].pause(); this._set('paused');
    }

    resume() {
      if (!this.plan) return;
      if (this.status === 'paused') {
        if (this.gap) { this._leaveGap(); return; }   // #31: paused in the pause between two plays: the next one now
        const a = this.els[this.cur];
        if (a.error || !a.dataset.url) this._start(); else this._playCurrent();   // paused during a retry: load again
        return;
      }
      if (this.status === 'error') { this.retries = 0; this._start(); return; }   // try the clip that failed again
      if (this.status === 'ended') { this.pos = {index: 0, pass: 1}; this.retries = 0; this._start(); }   // play again (K7), same seed
    }

    stop() {
      this._cancelRetry(); this._clearGap(); this._stopFade();
      if (this.els) this._silence();
      this.plan = null; this.message = null;
      this._set('idle');
    }

    // ---- internals
    _silence() {
      for (const a of this.els) { try { a.pause(); } catch (e) { /* not playing */ } }
    }

    _cancelRetry() { clearTimeout(this.retryTimer); this.retryTimer = null; }

    _clip() { return this._clips(this.pos.pass)[this.pos.index]; }

    /** #31: the clips of a pass: the plan's own (Vary off, pass 1, a plan without margins), else its margins around them
     *  as the pass shape says (ui_logic.js passShape / passClips: the phone's numbers); drawn once per pass. */
    _clips(pass) {
      let c = this.passCache.get(pass);
      if (c) return c;
      const L = this.opts.vary ? logic() : null, p = this.plan;
      if (!L || !(pass > 1)) c = p.clips;
      else c = L.passClips(p, L.passShape(this.seed, pass, L.marginSteps(p.margin_before), p.margin_after || []));
      this.passCache.set(pass, c);
      return c;
    }

    _total() { return (pass) => this._clips(pass).length; }

    _start() {
      this._cancelRetry(); this._stopFade(); this.attempt++;
      const clip = this._clip(), url = clipUrl(this.plan.reciter, clip);
      const other = 1 - this.cur;
      if (this.els[other].dataset.url === url && this.els[other].readyState >= 2) this.cur = other;   // preloaded
      // the element left behind is silenced: _preloadNext does not always give it a new file (the last clip, or it already
      // holds the one after: previous / next on a 2-clip plan), and two recitations must never play over each other
      try { this.els[1 - this.cur].pause(); } catch (e) { /* not playing */ }
      for (const e of this.els) e.volume = 1;   // #31: after a fade-out
      const a = this.els[this.cur];
      if (a.dataset.url !== url || a.error) { a.dataset.url = url; a.src = url; } else a.currentTime = 0;
      this._set('loading');
      this._playCurrent();
      this._preloadNext();
      if (clip.fade_ms != null) this._watchFade(a, +clip.fade_ms);
    }

    /** #31: the last extra ayah of a varied play fades out over 1.8 s and stops on its cut (a word start in its middle),
     *  leaving the rest to the listener's memory; then the next play (after the pause) or the end. */
    _watchFade(a, endMs) {
      const L = logic();
      this.fadeTimer = setInterval(() => {
        if (!this.plan || this.els[this.cur] !== a || this.gap) { this._stopFade(); return; }
        // #31 review: a pause (the user's, the Media Session's, the system's whose event is still on its way) holds the
        // fade: no cut and no next play behind it; it goes on after the resume
        if (a.paused || !['playing', 'loading'].includes(this.status)) return;
        const t = (+a.currentTime || 0) * 1000;
        if (t < endMs) { a.volume = L ? L.fadeVolume(t, endMs, FADE_MS) : 1; return; }
        this._stopFade();
        a.dataset.cut = '1';   // our own pause: the 'pause' listener does not report it
        try { a.pause(); } catch (e) { /* not playing */ }
        a.volume = 1;
        this._next();
      }, this.fadeTickMs);
    }

    _stopFade() { clearInterval(this.fadeTimer); this.fadeTimer = null; }

    _playCurrent() {
      const a = this.els[this.cur];
      let p;
      try { p = a.play(); } catch (e) { this._blocked(e); return; }
      if (p && p.catch) p.catch((e) => { if (e && e.name === 'AbortError') return; this._blocked(e); });
    }

    _blocked(e) {
      if (e && e.name === 'NotAllowedError') { this.message = null; this._set('paused'); return; }   // press play again
      this._failed();
    }

    _preloadNext() {
      const nxt = advance(this.pos, this._total(), this.passes);
      if (nxt.ended) return;
      const url = clipUrl(this.plan.reciter, this._clips(nxt.pass)[nxt.index]);
      const b = this.els[1 - this.cur];
      if (b.dataset.url === url || url === this.els[this.cur].dataset.url) return;
      b.dataset.url = url; b.src = url; try { b.load(); } catch (e) { /* preloading is optional */ }
    }

    /** The clip after this one; #31: a new play waits out the pause between plays first (skipGap: ⏭ goes on at once). */
    _next(skipGap) {
      const nxt = advance(this.pos, this._total(), this.passes);
      if (nxt.ended) { this._set('ended'); return; }
      const gapMs = nxt.pass !== this.pos.pass && !skipGap ? this._gapMs() : 0;
      if (gapMs > 0) { this._enterGap(nxt.pass, gapMs); return; }
      this.pos = {index: nxt.index, pass: nxt.pass};
      this._start();
    }

    _skip(dir) {
      if (!this.plan) return;
      if (this.gap) {   // #31: ⏭ in the pause starts the next play now, ⏮ goes back to the last ayah of the play before
        if (dir > 0) { this._leaveGap(); return; }
        this._clearGap(); this._start(); return;
      }
      if (dir > 0) { this._next(true); return; }   // on a play's last ayah: the next play at once (⏭ skips the pause)
      this.pos = back(this.pos, this._total());
      this._start();
    }

    // ---- #31 the pause between two plays: the position stays on the last ayah of the play before (status playing,
    // the state says "Pause"); its end, ⏭ or ▶ after ❚❚ start the next play
    _gapMs() {
      const ms = this.opts.gap_s * this.secondMs;
      return ms > 0 ? ms : (this.opts.vary ? this.minGapMs : 0);
    }

    _enterGap(pass, ms) {
      this._stopFade();
      this.gap = {pass};
      this.gapTimer = setTimeout(() => { this.gapTimer = null; this._leaveGap(); }, ms);
      this._set('playing');
    }

    _leaveGap() {
      if (!this.gap) return;
      const pass = this.gap.pass;
      this._clearGap();
      this.pos = {index: 0, pass};
      this._start();
    }

    _clearGap() { clearTimeout(this.gapTimer); this.gapTimer = null; this.gap = null; }

    _failed() {
      if (this.failedAttempt === this.attempt) return;   // the same failed load, reported a second time
      this.failedAttempt = this.attempt;
      if (this.retries < RETRIES) {
        this.retries++;
        const a = this.els[this.cur]; a.dataset.url = '';
        this.retryTimer = setTimeout(() => { this.retryTimer = null; if (this.plan) this._start(); }, this.retryMs);
        return;
      }
      const clip = this.plan ? this._clip() : null;
      this.message = `cannot load ${clip ? clip.label : 'the recitation'} (check the network connection)`;
      this._set('error');
    }

    _wireMediaSession() {
      const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
      if (!ms) return;
      try {
        if (typeof MediaMetadata !== 'undefined') {
          ms.metadata = new MediaMetadata({title: this.plan.title || 'Meddeb', artist: (this.plan.reciter || {}).name || '', album: 'Meddeb'});
        }
      } catch (e) { /* no metadata support */ }
      if (this.sessionWired) return;
      this.sessionWired = true;
      const on = (name, fn) => { try { ms.setActionHandler(name, fn); } catch (e) { /* action not supported */ } };
      on('play', () => this.resume());
      on('pause', () => this.pause());
      on('stop', () => this.stop());
      on('previoustrack', () => this._skip(-1));
      on('nexttrack', () => this._skip(1));
    }

    _set(status) {
      this.status = status;
      const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
      if (ms) { try { ms.playbackState = status === 'playing' ? 'playing' : (status === 'paused' ? 'paused' : 'none'); } catch (e) { /* old browser */ } }
      if (this.onState) { try { this.onState(this.state()); } catch (e) { /* the page's handler failed: keep playing */ } }
    }

    /** The state object of plan §1.2 (downloaded / to_download: Android only, null here; source: always a Listen
     *  playback here, Android also reports its car Recite as 'recite', plan 2026-10-04 §1.2). #31: total = the clips
     *  of the pass playing; in the pause between two plays: label "Pause", kind 'gap', no clip (the page follows
     *  nothing), pass = the play that ended. */
    state() {
      const p = this.plan, clips = p ? this._clips(this.pos.pass) : null, gap = !!(p && this.gap);
      const clip = clips && !gap ? clips[this.pos.index] : null;
      return {status: this.status, title: p ? p.title : null, label: gap ? 'Pause' : clip ? clip.label : null,
        key: clip ? clip.key : null, surah: clip ? clip.surah : null, ayah: clip ? clip.ayah : null,
        page: clip ? clip.page : null, index: p ? this.pos.index : null, total: clips ? clips.length : null,
        pass: p ? this.pos.pass : null, passes: p ? this.passes : null, downloaded: null, to_download: null,
        message: this.status === 'error' ? this.message : null, source: 'listen', ...(gap ? {kind: 'gap'} : {})};
    }
  }

  /* X2.15 (plan 2026-10-04 §1.2): the reciter's words after a voice command, engine.clipPlayer of HttpEngine. Web Audio
     instead of an <audio> element: the cut is exact to the sample (a word is a fraction of a second; EveryAyah's files
     have no seek table) and the file is decoded once (fetch -> decodeAudioData; EveryAyah allows any origin). Two decoded
     ayat at most are kept (a 55 s ayah is ~19 MB of samples). Android plays natively (ClipPlayer.kt, engine.js). */
  const CLIP_FADE_S = 0.02;   // 20 ms in and out: no click at a cut inside the recitation
  const CLIP_CACHE = 2;

  class MeddebClipPlayer {
    constructor() {
      this.getContext = null;   // () => an AudioContext unlocked by a click (the page's, see useContext)
      this.ctx = null; this.cache = new Map(); this.seq = 0; this.cur = null;
    }

    /** The page lends its AudioContext (unlocked by the microphone press): a clip that follows a voice command has no
     *  user gesture of its own, and phones play only through a context unlocked by one. */
    useContext(fn) { this.getContext = fn; }

    _context() {
      let c = this.getContext ? this.getContext() : null;
      if (!c) {
        if (!this.ctx) { const AC = root.AudioContext || root.webkitAudioContext; if (!AC) throw new Error('no Web Audio'); this.ctx = new AC(); }
        c = this.ctx;
      }
      return c;
    }

    _decoded(ctx, key, url) {
      // the ayah file decoded once; the most recently used ones are kept, a failed one is asked again next time
      let p = this.cache.get(key);
      if (p) { this.cache.delete(key); this.cache.set(key, p); return p; }
      p = (async () => {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`cannot download ${key}.mp3 (${resp.status} ${resp.statusText || ''})`.replace(/ \)$/, ')'));
        const data = await resp.arrayBuffer();
        return await new Promise((ok, fail) => {
          const r = ctx.decodeAudioData(data, ok, fail);   // the callbacks: old Safari has no promise form
          if (r && r.catch) r.catch(() => {});             // the same failure also comes through `fail`
        });
      })();
      this.cache.set(key, p);
      p.catch(() => { if (this.cache.get(key) === p) this.cache.delete(key); });
      while (this.cache.size > CLIP_CACHE) this.cache.delete(this.cache.keys().next().value);
      return p;
    }

    /** Plays {url, key, t0_ms, t1_ms (null = to the end of the file), gain (X2.18 one loudness, 2026-10-10: reciter_clip's
     *  0.646; clamped to 0..1, missing = 1)}; resolves {status: 'ended' | 'stopped'} (stopped by stop() or by the next
     *  play), rejects when the file cannot be downloaded or decoded. */
    async play(spec) {
      this.stop();
      const seq = this.seq, ctx = this._context();
      if (ctx.state === 'suspended' && ctx.resume) {
        // a browser that does not allow the sound yet (no click on the page) keeps resume() pending: wait 1.5 s at most,
        // the page then resumes the microphone it paused for the clip
        let timer = null;
        await Promise.race([Promise.resolve(ctx.resume()).catch(() => {}), new Promise((r) => { timer = setTimeout(r, 1500); })]);
        clearTimeout(timer);
        if (ctx.state === 'suspended') throw new Error('the browser does not allow the sound yet (press a button once)');
      }
      const key = spec.key || String(spec.url);
      const buf = await this._decoded(ctx, key, spec.url);
      if (seq !== this.seq) return {status: 'stopped'};
      const t0 = Math.max(0, Math.min((+spec.t0_ms || 0) / 1000, buf.duration));
      const t1 = spec.t1_ms == null ? buf.duration : Math.max(t0, Math.min(+spec.t1_ms / 1000, buf.duration));
      const dur = Math.max(0.02, t1 - t0), fade = Math.min(CLIP_FADE_S, dur / 2), now = ctx.currentTime;
      const lv = spec.gain == null || !Number.isFinite(+spec.gain) ? 1 : Math.max(0, Math.min(1, +spec.gain));
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf;
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(lv, now + fade);
      g.gain.setValueAtTime(lv, now + dur - fade); g.gain.linearRampToValueAtTime(0, now + dur);
      src.connect(g); g.connect(ctx.destination);
      return new Promise((resolve) => {
        const ended = () => { if (this.cur && this.cur.src === src) { clearTimeout(this.cur.guard); this.cur = null; resolve({status: 'ended'}); } };
        // the end never reported (a context suspended by the system mid-clip): over 3 s after its length anyway
        const guard = setTimeout(() => { try { src.stop(); } catch (e) { /* not started */ } ended(); }, (dur + 3) * 1000);
        this.cur = {src, resolve, guard};
        src.onended = ended;
        src.start(0, t0, dur);
      });
    }

    /** Stops the clip playing (it resolves 'stopped'); a clip still downloading never starts. */
    stop() {
      this.seq++;
      const c = this.cur; this.cur = null;
      if (!c) return;
      clearTimeout(c.guard); c.src.onended = null;
      try { c.src.stop(); } catch (e) { /* already ended */ }
      c.resolve({status: 'stopped'});
    }
  }

  /* D13 (#H, user 2026-10-10): the replay of one's own recording (B3.7) from the word popover, one at a time (a reply
     that came late used to play after the popover was closed, and a superseded replay resumed the microphone while the
     next one played). Every request has a token: a reply for an older token stays silent and never resumes the
     microphone. While the recording is fetched the replay is busy (the page greys both Play buttons, the pressed one
     reads "Loading…"; a press meanwhile waits), at most REPLAY_TIMEOUT_MS. A press while one plays replaces it.
     cancel(release) stops it, playing or loading: the user closed the popover (✕, a tap outside, Back, Esc), opened
     another word, left Recite, pressed Reset (release: the microphone paused for it goes on), or Start, Stop and a
     voice command's reciter clip took over (no release). cancelLoading(release) cancels it only while it is `loading`
     (fetched or about to start, not playing yet): the popover closed by a scroll or a page turn (review 2026-10-11: a
     late reply then played with no popover; a replay already playing goes on). The microphone paused for replays
     resumes exactly once: onRelease, when the last replay ends or is cancelled with release. Works on any <audio>-like
     element (Node tests). */
  const REPLAY_TIMEOUT_MS = 15000;

  class MeddebReplay {
    /** o = {fetch: (req) => Promise<Blob> (engine.clip), audio: () => the page's <audio> element (unlocked by a click),
     *  onBusy(req | null), onRelease(), onError(message), toUrl / revoke (blob URLs), timeoutMs}. */
    constructor(o) {
      o = o || {};
      this.fetchClip = o.fetch; this.audio = o.audio;
      this.toUrl = o.toUrl || ((b) => URL.createObjectURL(b));
      this.revoke = o.revoke || ((u) => { try { URL.revokeObjectURL(u); } catch (e) { /* already gone */ } });
      this.onBusy = o.onBusy || null; this.onRelease = o.onRelease || null; this.onError = o.onError || null;
      this.timeoutMs = o.timeoutMs || REPLAY_TIMEOUT_MS;
      this.seq = 0; this.busy = null; this.loading = false; this.holding = false; this.url = null;
    }

    /** Fetches and plays req; hold: the microphone was paused for it (released once, see above). Resolves 'playing',
     *  'busy' (another one is loading: nothing done), 'cancelled' (superseded or cancelled: silent) or 'failed' (told
     *  through onError). `loading` is true from the press until the sound plays (or the request ends otherwise). */
    async play(req, hold) {
      if (this.busy) return 'busy';
      this._silence();                                // a replay playing: replaced (the microphone stays paused)
      const seq = ++this.seq;
      if (hold) this.holding = true;
      this.loading = true;
      this._setBusy(req);
      let blob;
      try { blob = await this._withTimeout(() => this.fetchClip(req)); }
      catch (e) {
        if (seq !== this.seq) return 'cancelled';
        this.loading = false; this._setBusy(null); this._release();
        this._error('Cannot replay: ' + (e && e.message ? e.message : e));
        return 'failed';
      }
      if (seq !== this.seq) return 'cancelled';
      this._setBusy(null);
      const a = this.audio();
      a.onended = a.onpause = null;
      try { a.pause(); } catch (e) { /* not playing */ }
      if (this.url) this.revoke(this.url);
      this.url = this.toUrl(blob); a.src = this.url;
      try { await a.play(); }
      catch (e) {
        if (seq !== this.seq) return 'cancelled';   // aborted by a newer replay or a cancel: no failure
        this.loading = false; this._release();
        this._error('Playback failed: ' + (e && e.message ? e.message : e));
        return 'failed';
      }
      if (seq !== this.seq) return 'cancelled';
      this.loading = false;
      // the end, or a pause by the system (another app): the replay is over
      a.onended = a.onpause = () => { if (seq !== this.seq) return; a.onended = a.onpause = null; this._release(); };
      return 'playing';
    }

    /** Stops the replay playing or loading (its late reply stays silent); release: the microphone paused for it goes on. */
    cancel(release) {
      this.seq++;
      this.loading = false;
      this._silence();
      this._setBusy(null);
      if (release) this._release(); else this.holding = false;
    }

    /** cancel(release) for a replay still loading only (a playing one goes on); true when one was cancelled. */
    cancelLoading(release) {
      if (!this.loading) return false;
      this.cancel(release);
      return true;
    }

    // ---- internals
    _silence() {
      const a = this.audio && this.audio();
      if (!a) return;
      a.onended = a.onpause = null;                   // our own pause is not the end of a replay
      try { a.pause(); } catch (e) { /* not playing */ }
    }

    _setBusy(req) {
      if (this.busy === req) return;
      this.busy = req;
      if (this.onBusy) { try { this.onBusy(req); } catch (e) { /* the page's handler failed: keep going */ } }
    }

    _release() {
      if (!this.holding) return;
      this.holding = false;
      if (this.onRelease) this.onRelease();
    }

    _error(message) { if (this.onError) this.onError(message); }

    _withTimeout(start) {
      let timer = null;
      const late = new Promise((_, fail) => {
        timer = setTimeout(() => fail(new Error(`no answer in ${Math.round(this.timeoutMs / 1000)} s (the engine is busy)`)), this.timeoutMs);
      });
      return Promise.race([Promise.resolve().then(start), late]).finally(() => clearTimeout(timer));
    }
  }

  const api = {MeddebListenPlayer, MeddebClipPlayer, MeddebReplay, REPLAY_TIMEOUT_MS, advance, back, clipUrl};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.MeddebListenPlayer = MeddebListenPlayer; root.MeddebClipPlayer = MeddebClipPlayer; root.MeddebReplay = MeddebReplay;
    root.MeddebListenLogic = api;
  }
})(typeof window !== 'undefined' ? window : this);
