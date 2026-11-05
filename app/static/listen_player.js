/* Listen player of the PC / web page (U1.13, plan 2026-10-01 §1.2): engine.player of HttpEngine. Plays a listen_plan
   (recite/listen.py) clip by clip from the reciter's per-ayah files (D4.5: EveryAyah, streamed, the browser caches them;
   v0.21, D9 / D10: each clip's src, a time range of a whole-surah file such as QuranicAudio's Yasser, its EveryAyah file
   when that fails; Mix: play k's reciter),
   the whole range `repeat` more times (decision D1: 17 -> 18 plays, 0 -> once), preloading the next clip in a second
   <audio> element, with the browser's Media Session (title, reciter, play / pause / stop / previous / next). Android
   plays natively instead (Media3 PlaybackService, engine.js AndroidEngine.player). The pure pass counting is tested by
   tests/test_ui_logic.py with Node. MeddebClipPlayer (below) plays a few words of one ayah for the voice commands;
   MeddebReplay plays one's own recording from the word popover, one replay at a time (all platforms). */
(function (root) {
  'use strict';

  /** The file of one clip: base_url + "SSSAAA" + ".mp3" (the basmala is 001001); v0.21 (D9 / D10): its src's url
   *  (a whole-surah file played from from_ms to to_ms, or a per-ayah file) when the plan has one. */
  function clipUrl(reciter, clip) { return clip.src && clip.src.url ? clip.src.url : reciter.base_url + clip.key + '.mp3'; }

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
  // next play's ayat during it), the fade-out over 3 s (#89, D15 of v0.20; 1.8 s before) ending on the cut, checked
  // every 50 ms
  const MIN_GAP_MS = 250, FADE_MS = 3000, FADE_TICK_MS = 50;
  // v0.21: the next ayah of the same surah file goes on without a seek when the file plays within this of its start
  const SEAMLESS_MS = 500;

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
      // v0.21: the surah files that failed in this listening (their clips play the EveryAyah fallback), the Media
      // Session's artist shown
      this.badUrls = new Set(); this.artist = null;
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
      this.passCache = new Map(); this.badUrls = new Set(); this.artist = null;
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
     *  as the pass shape says (ui_logic.js passShape / passClips: the phone's numbers); drawn once per pass. v0.21
     *  (Mix, D10): the clips as that play's reciter plays them (passPlan: mix[(pass - 1) % n] as src). */
    _clips(pass) {
      let c = this.passCache.get(pass);
      if (c) return c;
      const L = logic(), p = this.plan;
      const v = L ? L.passPlan(p, pass) : p;
      if (!L || !this.opts.vary || !(pass > 1)) c = v.clips;
      else c = L.passClips(v, L.passShape(this.seed, pass, L.marginSteps(v.margin_before), v.margin_after || []));
      this.passCache.set(pass, c);
      return c;
    }

    /** v0.21 (D9 / D10): where a clip plays from: {url, from (ms in the file, null: its start), to (null: the file's
     *  end)}: its src's range of a surah file, its EveryAyah fallback once that file failed in this listening, or the
     *  per-ayah file (a plan of 0.20: reciter.base_url + key). v0.22 (#93, D8): a "local:" src (a file only the phone
     *  holds) is its fallback at once; null when it has none (the clip is passed). The engine never gives a banned
     *  fallback (D4.12): a src without one is never replaced by base_url + key. */
    _where(clip) {
      const s = clip.src;
      if (s && typeof s.url === 'string' && s.url.startsWith('local:')) return s.fallback ? {url: s.fallback, from: null, to: null} : null;
      if (s && s.url && this.badUrls.has(s.url) && s.fallback) return {url: s.fallback, from: null, to: null};
      if (s && s.url) return {url: s.url, from: s.from_ms != null ? +s.from_ms : null, to: s.to_ms != null ? +s.to_ms : null};
      return {url: clipUrl(this.plan.reciter, clip), from: null, to: null};
    }

    /** v0.21: the clip after this one starts where this one ends in the same file, with no pause between (the next
     *  ayah of a surah file): the file plays on. */
    _continues(w) {
      const nxt = advance(this.pos, this._total(), this.passes);
      if (nxt.ended || (nxt.pass !== this.pos.pass && this._gapMs() > 0)) return false;
      const n = this._where(this._clips(nxt.pass)[nxt.index]);
      return !!n && n.url === w.url && n.from != null && n.from === w.to;
    }

    _total() { return (pass) => this._clips(pass).length; }

    _start(follow) {
      this._cancelRetry(); this._stopFade(); this.attempt++;
      const clip = this._clip(), w = this._where(clip);
      if (!w) { this._next(); return; }            // v0.22: nothing this player may play (a local: src without fallback)
      const url = w.url, at = (w.from || 0) / 1000;
      const other = 1 - this.cur, cur = this.els[this.cur];
      // v0.21: the next ayah of the surah file playing, right where the file is: it plays on (no seek, no reload);
      // v0.22 (#104): when the file played on into it (follow), anywhere inside its range (a late check), not only
      // within SEAMLESS_MS of its start
      const ct = (+cur.currentTime || 0) * 1000;
      const seamless = w.from != null && cur.dataset.url === url && !cur.error && !cur.paused &&
        (Math.abs(ct - w.from) < SEAMLESS_MS || (follow === true && ct >= w.from && (w.to == null || ct < w.to)));
      // #75: the other element holds this clip (preloaded): it plays whatever its readyState (play() waits for the data
      // itself; v0.19 loaded the file again below readyState 2, the gap between two ayat on the web)
      const preloaded = !seamless && this.els[other].dataset.url === url && !this.els[other].error;
      if (preloaded) this.cur = other;
      // the element left behind is silenced: _preloadNext does not always give it a new file (the last clip, or it already
      // holds the one after: previous / next on a 2-clip plan), and two recitations must never play over each other
      try { this.els[1 - this.cur].pause(); } catch (e) { /* not playing */ }
      for (const e of this.els) e.volume = 1;   // #31: after a fade-out
      const a = this.els[this.cur];
      // #75: no seek on a file already at its start (a seek makes the browser wait for data again); v0.21: a range starts
      // at from_ms (set right after src: the browser applies it once the file's header is in)
      if (a.dataset.url !== url || a.error) { a.dataset.url = url; a.src = url; if (at) a.currentTime = at; }
      else if (!seamless && (+a.currentTime || 0) !== at) a.currentTime = at;
      this._artist(clip);
      // #75: play() first, before the page hears of it (its redraw used to delay the next ayah); a preloaded clip that
      // follows a playing one says nothing until its 'playing' event, anything else says 'loading' (unless play() already
      // failed: its state stays); v0.21: a seamless one is playing already
      const before = this.status;
      if (seamless) { this._preloadNext(); this._set('playing'); }
      else {
        this._playCurrent();
        this._preloadNext();
        if ((!preloaded || before !== 'playing') && this.status === before) this._set('loading');
      }
      if (clip.fade_ms != null || w.to != null) this._watchEnd(a, clip.fade_ms != null ? +clip.fade_ms : null, w);
    }

    /** #31: the last extra ayah of a varied play fades out and stops on its cut (a word start in its middle, ms from
     *  the clip's start), leaving the rest to the listener's memory; then the next play (after the pause) or the end.
     *  #89 (D15, v0.20): over 3 s, the ramp capped at the cut (a cut 2 s into the ayah fades from its start). v0.21
     *  (D9): a range ends at to_ms the same way, without the fade: the file stops there, or plays on into the next
     *  clip when that one starts right there (_continues). */
    _watchEnd(a, fadeMs, w) {
      const L = logic(), from = w.from || 0, endMs = fadeMs != null ? fadeMs : w.to - from;
      this.fadeTimer = setInterval(() => {
        if (!this.plan || this.els[this.cur] !== a || this.gap) { this._stopFade(); return; }
        // #31 review: a pause (the user's, the Media Session's, the system's whose event is still on its way) holds the
        // fade: no cut and no next play behind it; it goes on after the resume
        if (a.paused || !['playing', 'loading'].includes(this.status)) return;
        const t = (+a.currentTime || 0) * 1000 - from;
        if (t < endMs) { if (fadeMs != null) a.volume = L ? L.fadeVolume(t, endMs, Math.min(FADE_MS, endMs)) : 1; return; }
        this._stopFade();
        // v0.22 (#104): a late check (a busy or throttled page) finds the file already past the next ayat too: the
        // position follows the file over them, never a seek back into audio already heard
        let cw = w;
        if (fadeMs == null) {
          const ct = (+a.currentTime || 0) * 1000;
          while (this._continues(cw)) {
            const nxt = advance(this.pos, this._total(), this.passes), n = this._where(this._clips(nxt.pass)[nxt.index]);
            if (n.to == null || ct < n.to) break;
            this.pos = {index: nxt.index, pass: nxt.pass}; cw = n;
          }
        }
        const on = fadeMs == null && this._continues(cw);
        if (!on) {
          a.dataset.cut = '1';   // our own pause: the 'pause' listener does not report it
          try { a.pause(); } catch (e) { /* not playing */ }
        }
        a.volume = 1;
        this._next(false, on);
      }, this.fadeTickMs);
    }

    /** v0.21 (D10): the Media Session's artist is the reciter of the clip playing (Mix, the Meddeb selection). */
    _artist(clip) {
      const name = (clip.src && clip.src.name) || (this.plan.reciter || {}).name || '';
      if (name === this.artist) return;
      this.artist = name;
      const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
      try {
        if (ms && typeof MediaMetadata !== 'undefined') ms.metadata = new MediaMetadata({title: this.plan.title || 'Meddeb', artist: name, album: 'Meddeb'});
      } catch (e) { /* no metadata support */ }
    }

    _stopFade() { clearInterval(this.fadeTimer); this.fadeTimer = null; }

    _playCurrent() {
      const a = this.els[this.cur], n = this.attempt;
      let p;
      try { p = a.play(); } catch (e) { this._blocked(e); return; }
      // v0.21: a rejection of an older load (the surah file's, after its fallback started) is not this load's failure
      if (p && p.catch) p.catch((e) => { if ((e && e.name === 'AbortError') || n !== this.attempt) return; this._blocked(e); });
    }

    _blocked(e) {
      if (e && e.name === 'NotAllowedError') { this.message = null; this._set('paused'); return; }   // press play again
      this._failed();
    }

    _preloadNext() {
      const nxt = advance(this.pos, this._total(), this.passes);
      if (nxt.ended) return;
      const w = this._where(this._clips(nxt.pass)[nxt.index]);
      if (!w) return;
      const url = w.url, b = this.els[1 - this.cur];
      if (b.dataset.url === url || url === this.els[this.cur].dataset.url) return;   // v0.21: the same surah file plays on
      b.dataset.url = url; b.src = url;
      try { b.load(); } catch (e) { /* preloading is optional */ }
      if (w.from) b.currentTime = w.from / 1000;   // after load(), which resets the start position to 0
    }

    /** The clip after this one; #31: a new play waits out the pause between plays first (skipGap: ⏭ goes on at once).
     *  v0.22 (#104): follow = the surah file plays on into it (_watchEnd): _start keeps it playing where it is. */
    _next(skipGap, follow) {
      const nxt = advance(this.pos, this._total(), this.passes);
      if (nxt.ended) { this._set('ended'); return; }
      const gapMs = nxt.pass !== this.pos.pass && !skipGap ? this._gapMs() : 0;
      if (gapMs > 0) { this._enterGap(nxt.pass, gapMs); return; }
      this.pos = {index: nxt.index, pass: nxt.pass};
      this._start(follow);
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
      // v0.21 (D9): a surah file that fails: its clips play their EveryAyah files for the rest of this listening
      const c = this.plan ? this._clip() : null, s = c && c.src;
      // (at once, but after this failure's other report: the load's 'error' and its rejected play() come together)
      if (s && s.url && s.fallback && !this.badUrls.has(s.url)) {
        this.badUrls.add(s.url); this.els[this.cur].dataset.url = '';
        this.retryTimer = setTimeout(() => { this.retryTimer = null; if (this.plan) this._start(); }, 0);
        return;
      }
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
        ayah_to: clip ? (clip.ayah_to || clip.ayah) : null,     // #92 (v0.23, D17): a unit clip's last ayah
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
  const RANGE_PAD_S = 0.5;    // v0.22 review: a range of a whole-surah file is fetched with this much audio around it

  /* v0.22 review (#92, D7): app.off_banned's clips of a banned ayah play a range of a whole-surah file (key "qaSSS":
     QuranicAudio's, ~116 MB for Al-Baqarah, or Yasser's clean recording): fetched whole and decoded (~2.5 GB of
     samples) the cue took minutes or failed. Those files are constant-bitrate MP3s (as RangeAudio.Mp3Cbr reads them on
     Android): the first frame's header gives the bitrate, after the ID3 tag and a LAME Info / Xing frame, and only the
     bytes of [t0 - pad, t1 + pad] are fetched (an HTTP Range) and decoded. -> {start, bps} (bytes of audio at 0 s, bytes
     a second); null: not an MP3 this can read. */
  const MP3_KBPS = [[0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
                    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]];
  const MP3_RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]};
  function mp3Layout(b) {
    let i = 0;
    if (b.length >= 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33)   // "ID3": its size is syncsafe
      i = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f)) + (b[5] & 0x10 ? 10 : 0);
    for (; i + 4 <= b.length; i++) {
      if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
      const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bi = b[i + 2] >> 4, si = (b[i + 2] >> 2) & 3;
      if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) continue;   // Layer III, a real bitrate only
      const kbps = MP3_KBPS[ver === 3 ? 0 : 1][bi], sr = MP3_RATES[ver][si], pad = (b[i + 2] >> 1) & 1;
      const len = Math.floor((ver === 3 ? 144 : 72) * kbps * 1000 / sr) + pad;
      const tag = String.fromCharCode(...b.slice(i + 4, Math.min(b.length, i + 64)));
      return {start: i + (/Xing|Info/.test(tag) ? len : 0), bps: kbps * 125};
    }
    return null;
  }

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

    /** v0.22 review: [t0 - RANGE_PAD_S, t1 + RANGE_PAD_S] of a constant-bitrate surah file (mp3Layout), fetched with
     *  a Range and decoded alone (kept as the ayah files are, by url and range) -> {buf, off: the second it starts at
     *  in the file}. A server that sends the whole file anyway is refused: never a whole surah decoded for a clip. */
    async _rangeDecoded(ctx, spec) {
      const url = spec.url, t0 = Math.max(0, (+spec.t0_ms || 0) / 1000), t1 = Math.max(t0, +spec.t1_ms / 1000);
      const part = async (a, z) => {
        const resp = await fetch(url, {headers: {Range: `bytes=${a}-${z}`}});
        if (resp.status !== 206) throw new Error(`cannot download a part of ${spec.key}.mp3 (${resp.status})`);
        return resp.arrayBuffer();
      };
      const lay = mp3Layout(new Uint8Array(await part(0, 16383)));
      if (!lay) throw new Error(`cannot read ${spec.key}.mp3`);
      const off = Math.max(0, Math.floor(t0 - RANGE_PAD_S));
      const a = lay.start + Math.floor(off * lay.bps), z = lay.start + Math.ceil((t1 + RANGE_PAD_S) * lay.bps);
      const key = `${url}#${a}-${z}`;
      let p = this.cache.get(key);
      if (p) { this.cache.delete(key); this.cache.set(key, p); return {buf: await p, off}; }
      p = (async () => {
        const data = await part(a, z);
        return await new Promise((ok, fail) => {
          const r = ctx.decodeAudioData(data, ok, fail);
          if (r && r.catch) r.catch(() => {});
        });
      })();
      this.cache.set(key, p);
      p.catch(() => { if (this.cache.get(key) === p) this.cache.delete(key); });
      while (this.cache.size > CLIP_CACHE) this.cache.delete(this.cache.keys().next().value);
      return {buf: await p, off};
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
      const ranged = /^qa\d{3}$/.test(key) && spec.t1_ms != null;   // v0.22 review: a range of a whole-surah file
      const {buf, off} = ranged ? await this._rangeDecoded(ctx, spec) : {buf: await this._decoded(ctx, key, spec.url), off: 0};
      if (seq !== this.seq) return {status: 'stopped'};
      const t0 = Math.max(0, Math.min((+spec.t0_ms || 0) / 1000 - off, buf.duration));
      const t1 = spec.t1_ms == null ? buf.duration : Math.max(t0, Math.min(+spec.t1_ms / 1000 - off, buf.duration));
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
