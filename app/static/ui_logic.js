/* Pure rules of the Meddeb page that are worth unit tests (tests/test_ui_logic.py runs them with Node): what the word
   popover's Remove button does (X2.12), how a swipe turns the mushaf page (U1.1c), the Progress sorting (U1.11), the
   manual mistake label (X2.12a), when the page follows the cursor (X2.12b), the popover's outside tap (U1.4), the next
   surah's index map (X2.1d), the Listen form (U1.13), the text-mode reset (X2.2), the shared bottom bar and the
   follow-along while listening (U1.13), the About versions (U1.12), the display modes and the pinch (U1.1b), what a
   voice command does on the page (X2.15), how a revealed word is brought on screen (X2.4b), and the rules of the round
   of 2026-10-10: the bars of unsaid mistakes and the taupe "being confirmed" (X2.4c, U1.2), ◂ on the page's bar first,
   the paused bar, the click's loudness (X2.18), the text size steps (U1.1b), the long press on ✗ n and the session
   browser (U1.5), the bug report (U1.16); and of 2026-10-11 (v0.9): the model download on a fresh phone with its small
   progress bar (D2, B3.13), the toasts that hide by themselves, the bug report's toast (D3); and of 2026-10-17 (v0.12):
   the mark drawn before the engine answers (historyAfterMark, issue #23), the double tap and its undo (wordTapStep,
   doubleTapPlan, issue #24); and of 2026-10-25 (v0.16): the cue of the first voice «next» with its starter hint
   (cueStarterHint, #36), the Review page (reviewCounters ... reviewResultView, #39). No DOM here. */
(function (root) {
  'use strict';
  const MISTAKE = new Set(['wrong', 'missing', 'hinted']);

  /** Does this verdict show (and count) as a mistake at this threshold? */
  function isMistake(st, threshold) {
    return MISTAKE.has(st.status) && (st.score >= threshold || !!st.user);
  }

  /** Remove on a word of the RUNNING session: a mistake becomes correct (the word was read, and read correctly); a
   *  correction the user made is undone (back to the automatic verdict); nothing else can be removed. */
  function sessionRemoveAction(st, threshold) {
    if (isMistake(st, threshold)) return 'mark_ok';
    if (st.user) return 'unmark';
    return null;
  }

  /** The newest reading of a word outside a running session (the finished session's verdict is in it once saved). */
  function lastOutcome(history) {
    const r = history && history.readings;
    return r && r.length ? r[r.length - 1].outcome : null;
  }

  /** Label of the Remove button: says what will go. */
  function removeLabel(outcome) {
    return outcome === 'mistake' ? 'Remove mistake' : outcome === 'ok' ? 'Remove correct' : 'Remove last';
  }

  /** After Stop, a mark on a word of the finished session also changes how that word is drawn: + Mistake makes it a
   *  mistake, + Correct and Remove make it correct (Remove on a mistake = read correctly; on a correct reading = no
   *  mistake either). Before 2026-09-28 the page kept the session's red after "Remove" (bug 5). */
  function stateAfterMark(st, event) {
    const out = Object.assign({}, st || {status: 'pending', score: 0, hyp: null});
    if (event === 'mistake') { out.status = 'wrong'; out.score = 1; }
    else { out.status = 'ok'; out.score = 0; out.lost = false; }
    out.user = true; out.concealed = false;
    return out;
  }

  const HISTORY_DEPTH = 10;   // = recite/profile.py HISTORY_DEPTH (the colour rule's last 5, the popover's last 10)

  /** Issue #23 (user, 2026-10-17): the word's history summary the engine will send after this mark, drawn at once
   *  outside a session (the answer replaces it when it differs). The rules of profile.build_history + summarize:
   *  + Mistake / + Correct append the user's reading; Remove turns a last mistake into the user's correct reading
   *  (read, and read correctly) and drops a last correct one. A new object: h is left as it was (put back on a failed
   *  save). Exact but for what the page cannot know: a relabelled reading (issue #5) and a reading older than the 10 it
   *  has coming back after a Remove. when = 'yyyy-mm-dd hh:mm' (markWhen). */
  function historyAfterMark(h, event, when) {
    let rs = h && h.readings ? h.readings.slice() : [];
    const last = rs[rs.length - 1];
    if (event === 'remove') {
      if (last && last.outcome === 'mistake') rs[rs.length - 1] = {when: last.when, outcome: 'ok', heard: null, source: 'mark'};
      else if (last) rs.pop();
    } else if (event === 'mistake' || event === 'correct') {
      rs.push({when, outcome: event === 'mistake' ? 'mistake' : 'ok', heard: null, source: 'mark'});
    } else return h;
    rs = rs.slice(-HISTORY_DEPTH);
    if (!rs.length) return null;
    const bad = (a) => a.filter(r => r.outcome === 'mistake').length;
    return {n: rs.length, bad5: bad(rs.slice(-5)), bad10: bad(rs), last: rs[rs.length - 1].when.slice(0, 10), readings: rs};
  }

  // ---------------------------------------------------------------- U1.4 / X2.12 the double tap (issue #24, D3)
  const DOUBLE_TAP_MS = 350;
  // v0.13, #24 (user, 2026-10-20: "make the window appearing after a few Ms to let the potential double clic go well";
  // D2): a single tap's popover waits out the double-tap window. Equal to it: shorter, the second tap could land on the
  // popover again; longer, a single tap would wait for nothing (a later tap is a new first tap anyway)
  const POP_DELAY_MS = DOUBLE_TAP_MS;

  /** Issue #24 (user, 2026-10-17): the taps on the words, one after the other. state = the last single tap {key, t,
   *  open, pending} (null: none); ev = {key (the written word's first part, its data-key), t (ms), open (the popover
   *  was open on that written word before this tap)}. A second tap on the same word within DOUBLE_TAP_MS is a double
   *  tap: action 'double', keepPop = the popover was already open on that word at its first tap (else the double tap
   *  closes it); a third quick tap starts again ('single'). v0.13 (#24): a single tap opens the popover POP_DELAY_MS
   *  later, unless a second tap on the same word comes first: action 'single' with `delay`, its state `pending`; the
   *  page then sends ev = {type: 'timer'}: action 'open' (key = the word to open) while that tap is still pending, else
   *  'none' (a stale timer: a double tap came, or the popover already opened). Each tap re-arms the page's timer, so a
   *  tap on another word moves the popover there. The opened popover counts as open for a second tap that comes just
   *  then (keepPop). */
  function wordTapStep(state, ev) {
    const s = state || {};
    if (ev.type === 'timer')
      return s.pending
        ? {state: Object.assign({}, s, {open: true, pending: false}), action: 'open', key: s.key, keepPop: false}
        : {state: s, action: 'none', keepPop: false};
    const dt = ev.t - s.t;
    if (s.key != null && ev.key === s.key && dt >= 0 && dt <= DOUBLE_TAP_MS)
      return {state: {key: null, t: 0, open: false, pending: false}, action: 'double', keepPop: !!s.open};
    return {state: {key: ev.key, t: ev.t, open: !!ev.open, pending: true}, action: 'single', delay: POP_DELAY_MS,
      keepPop: false};
  }

  /** #34 (user, 2026-10-23: "the last record was a mistake BUT not a mistake during the terminated session nor a
   *  mistake I just added, it is there since yesterday … When I click on it I expect a new mistake to be added"): is the
   *  newest reading of a word with no verdict on screen a mistake of the context on screen, i.e. one the user added (+
   *  Mistake or a double tap, source 'mark') since the context began? since = 'yyyy-mm-dd hh:mm' (markWhen, the
   *  history's format: compared to the minute); none known: false. */
  function contextMistake(history, since) {
    const r = history && history.readings;
    const last = r && r.length ? r[r.length - 1] : null;
    return !!last && !!since && last.outcome === 'mistake' && last.source === 'mark' && String(last.when || '') >= String(since);
  }

  /** Issue #24 (D3): what a double tap does. rec = what the last double tap left (its record, null: none); o = {key,
   *  ctx ('live:<id>' the running session, 'saved:<id>' a finished or loaded one, 'none'), live (a word of the running
   *  session), st (its session state), threshold, lastOutcome (its newest reading), history (its history summary),
   *  settled (the history shown is final for the session on screen: a loaded one, a finished one once the page was
   *  refreshed after its `done`, or one too short to be saved, whose readings never join the history), since (#34: when
   *  the context on screen began, the page's ctxSince)}.
   *  A mistake: a session verdict that is one (at the threshold, or being confirmed, taupe); #34 (v0.15): for a word
   *  with no verdict on screen, only a mistake of the context (contextMistake): an older one gets a new mistake (v0.12
   *  removed any newest reading that was a mistake, Claude's D3, and turned yesterday's mistake into "ok (you)").
   *  Returns {act, record (what the next double tap undoes), toast}:
   *  - the undo, when rec is this word in this context and the word is still as that double tap left it: the act it
   *    recorded (live: unmark, or the user's earlier verdict again; else the "undo" event), with the state (and the
   *    history) to draw at once; record null;
   *  - a word not recited yet in the running session: act null, rec kept (the popover only);
   *  - review of v0.12 (#24): a mistake of a session on screen whose word's newest reading is correct (settled; e.g.
   *    an older session loaded with ◀, read right since): act null, rec kept, a toast. The `remove` event acts on the
   *    newest reading, so it would drop that correct reading and leave the old mistake as the word's state;
   *  - else live: mark wrong / ok (as + Mistake / Remove mistake); not live: the event 'mistake' / 'remove'. */
  function doubleTapPlan(rec, o) {
    const st = o.st || {status: 'pending', score: 0};
    const pending = !st.status || st.status === 'pending';
    const bad = pending ? contextMistake(o.history, o.since) : (isMistake(st, o.threshold) || confirming(st, o.threshold));
    if (rec && rec.key === o.key && rec.ctx === o.ctx && rec.bad === bad) return {act: rec.undo, record: null, toast: 'Undone'};
    if (o.live && pending) return {act: null, record: rec || null, toast: null};
    if (!o.live && !pending && bad && o.settled && o.lastOutcome === 'ok')
      return {act: null, record: rec || null, toast: 'Its latest reading is correct: no mistake to remove'};
    const snap = pending ? null : Object.assign({}, st);
    let act, undo;
    if (o.live) {
      act = {kind: 'mark', status: bad ? 'ok' : 'wrong'};
      undo = st.user ? {kind: 'mark', status: MISTAKE.has(st.status) ? 'wrong' : 'ok', state: snap} : {kind: 'unmark', state: snap};
    } else {
      act = {kind: 'event', event: bad ? 'remove' : 'mistake'};
      undo = {kind: 'event', event: 'undo', state: snap, history: o.history == null ? null : o.history};
    }
    return {act, record: {key: o.key, ctx: o.ctx, bad: !bad, undo},
      toast: (bad ? 'Mistake removed' : 'Marked as a mistake') + ': double tap again to undo'};
  }

  /** A history line's time, as the engine writes it ('yyyy-mm-dd hh:mm', local time). */
  function markWhen(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // ---------------------------------------------------------------- X2.1c the session's start ayah (v0.15, #33)
  /** #33 (user, 2026-10-22: "let the user start from where it wants on that page if it clicks the mic button"): the
   *  ayah a press of the microphone starts the session at (start{ayah_from}; the tracker follows a start anywhere
   *  further on that page, X2.1c). o = {surah (the surah chosen in the top bar), page (shown), ayahs (the page's
   *  [{surah, ayah}]), startAt (the place Find where I am found: {surah, ayah, page, search: true}), url ({surah, ayah}
   *  of ?surah=&ayah=), hasSession}. The page's first ayah of the chosen surah (else the page's first ayah); the URL's
   *  ayah before any session (never before the page); the found place when it is on the page shown and of the chosen
   *  surah. A Progress ayah link is no start any more (v0.11-0.14: the window began at it, and the link kept that
   *  start after the page was turned), nor anything without `search`. #39 (v0.16): a review card's start ({surah,
   *  ayah: the run-up's first ayah, page, review}) is kept the same way. */
  function startAyah(o) {
    o = o || {};
    const ayahs = o.ayahs || [];
    const first = ayahs.find(a => +a.surah === +o.surah) || ayahs[0] || {ayah: 1};
    let from = +first.ayah;
    const u = o.url;
    if (u && +u.ayah > 0 && +u.surah === +o.surah && !o.hasSession) from = Math.max(+u.ayah, from);
    const s = o.startAt;
    if (s && (s.search || s.review) && +s.surah === +o.surah && +s.page === +o.page) from = +s.ayah;
    return from;
  }

  // ---------------------------------------------------------------- U1.1c the mushaf's gestures
  /** A horizontal swipe on the mushaf (right to left book): finger to the right = next page, to the left = previous. */
  function swipePage(dx, dy, minPx) {
    const min = minPx || 60;
    if (Math.abs(dx) < min || Math.abs(dx) < 1.5 * Math.abs(dy)) return 0;
    return dx > 0 ? +1 : -1;
  }

  /** #40 (user, 2026-10-24: "the user pulls down on the white space, then we show him a hint from the end of previous
   *  page"): a pull down on the mushaf: at least 60 px down, mostly vertical (|dy| >= 1.5 |dx|, so never the page
   *  swipe), the mushaf scrolled to its top (top = its scrollTop when the finger came down: never a scroll back up). */
  function pullDown(dx, dy, top, minPx) {
    return +dy >= (minPx || 60) && Math.abs(+dy) >= 1.5 * Math.abs(+dx) && !(+top > 0);
  }

  /** #40: the pull up that puts the starter hint away (the same thresholds, upwards, wherever the mushaf is scrolled). */
  function pullUp(dx, dy, minPx) {
    return -dy >= (minPx || 60) && Math.abs(+dy) >= 1.5 * Math.abs(+dx);
  }

  /** #40: the starter hint is offered in Blind while no word of the page is visible yet (said, revealed, final: with or
   *  without a session); Hidden's grey blocks and Shown are hints already. o = {mode, visibleOnPage}. */
  function starterHintAvailable(o) {
    return !!o && o.mode === 'blind' && !(+o.visibleOnPage > 0);
  }

  /** #36 (v0.16): the starter hint shown with a voice cue (the first «next», or a replay, before the first word,
   *  X2.15): where the sheet is offered (starterHintAvailable) and the session starts at the page's first word
   *  (sessionFirst = session.first, pageFirst = the session index of the page's first word, null outside the session):
   *  a session that starts further on the page would get the end of the page before, the wrong place. o = {mode,
   *  visibleOnPage, sessionFirst, pageFirst}. */
  function cueStarterHint(o) {
    return starterHintAvailable(o) && o.sessionFirst != null && o.pageFirst != null && +o.sessionFirst === +o.pageFirst;
  }

  /** #40 (user: "the minimum lines + a random 0 to 2 extra lines"): the previous page's line numbers the sheet shows,
   *  top to bottom, from starter_hint's answer (B3.8: lines = the n_min lines that identify the place last, up to 2
   *  candidate lines above them): the n_min last ones plus floor(rand * 3) more, as many as there are. n_min 0 (a page
   *  that starts a surah with its header on it, page 1): none. rand in [0, 1) (Math.random). */
  function starterHintLines(hint, rand) {
    const all = hint && Array.isArray(hint.lines) ? hint.lines.map(Number) : [];
    const nMin = hint ? Math.max(0, Math.round(+hint.n_min || 0)) : 0;
    if (!nMin || !all.length) return [];
    const r = Number.isFinite(+rand) ? clamp(+rand, 0, 0.999999) : 0;
    return all.slice(-Math.min(all.length, nMin + Math.floor(r * 3)));
  }

  // ---------------------------------------------------------------- U1.11 Progress sorting (user, 2026-10-01)
  const SORT_COLS = ['page', 'err', 'last'];
  const FIRST_DIR = {page: 1, err: -1, last: 1};   // first click: Page increasing, Err decreasing, Last revised oldest first
  const DEFAULT_SORT = [{col: 'page', dir: 1}];

  /** The sort state saved in the settings (`progress_sort`), cleaned: known columns, once each, dir 1 / -1. */
  function normalizeSortState(state) {
    const out = [];
    if (Array.isArray(state)) {
      for (const s of state) {
        if (!s || !SORT_COLS.includes(s.col) || out.some(o => o.col === s.col)) continue;
        out.push({col: s.col, dir: s.dir < 0 ? -1 : 1});
      }
    }
    return out.length ? out : DEFAULT_SORT.map(s => Object.assign({}, s));
  }

  /** A click on a column header: the same column as the active one reverses it; another one comes first with its
   *  first-click direction; the click history (most recent first) breaks the ties. */
  function nextSortState(state, col) {
    const cur = Array.isArray(state) ? state.filter(s => s && SORT_COLS.includes(s.col)) : [];
    if (cur.length && cur[0].col === col) return [{col, dir: -cur[0].dir}].concat(cur.slice(1).map(s => Object.assign({}, s)));
    return [{col, dir: FIRST_DIR[col]}].concat(cur.filter(s => s.col !== col).map(s => Object.assign({}, s)));
  }

  /** Progress rows {page, err, last_revised 'yyyy-mm-dd'} sorted by the click history, then the columns not clicked
   *  yet in their first-click direction (a new array; the input is not changed). */
  function sortProgressRows(rows, state) {
    const keys = normalizeSortState(state);
    for (const c of SORT_COLS) if (!keys.some(k => k.col === c)) keys.push({col: c, dir: FIRST_DIR[c]});
    const val = {page: r => +r.page, err: r => +r.err, last: r => r.last_revised || ''};
    return rows.slice().sort((a, b) => {
      for (const k of keys) {
        const x = val[k.col](a), y = val[k.col](b);
        if (x < y) return -k.dir;
        if (x > y) return k.dir;
      }
      return 0;
    });
  }

  /** #38 (user, 2026-10-23: "the table Progress page needs to be labeled with the sourat name … I don't want to write
   *  bakarah 20 times but also if we change the order … so do it in a good manner not too redundant"): the Surah cells
   *  of the Progress rows in the order shown (rows = [{surahs: [ids, mushaf order]}], names = {id: English name}) ->
   *  [{text, title}]: the names joined by " · " ("Surah n" for one the page does not know); the text is empty when
   *  the row holds one surah that the row just above also holds (the first row and every row of two or three surahs
   *  are named), so the rule follows any sort; the title always names them. A row without surahs: both empty. */
  function progressSurahLabels(rows, names) {
    const nm = (id) => (names && names[id]) || `Surah ${id}`;
    return (rows || []).map((r, i) => {
      const ids = r && Array.isArray(r.surahs) ? r.surahs : [];
      const title = ids.map(nm).join(' · ');
      const above = i > 0 && rows[i - 1] && Array.isArray(rows[i - 1].surahs) ? rows[i - 1].surahs : [];
      return {text: ids.length === 1 && above.includes(ids[0]) ? '' : title, title};
    });
  }

  /** #42 (user, 2026-10-25: "replace the date by the nb of days ago it was recited from: today, 1, 2, ... 99, +99 …
   *  no row is gonna consume two lines for no needed reason"): the Progress table's Days ago cell, from a page's
   *  last_revised 'yyyy-mm-dd' and today's date on the device's clock (same form; a time after it is ignored): 'today',
   *  '1' … '99', '+99'; a date after today (a clock set back) reads 'today'. words (the Manzil check line): 'today',
   *  '1 day ago', '12 days ago', '+99 days ago'. Calendar days (UTC arithmetic: no DST shift); '' when either date is
   *  unreadable. */
  function daysAgoText(iso, today, words) {
    const day = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
    const n = Math.round((day(today) - day(iso)) / 86400000);
    if (!Number.isFinite(n)) return '';
    if (n <= 0) return 'today';
    const t = n > 99 ? '+99' : String(n);
    return words ? `${t} day${n === 1 ? '' : 's'} ago` : t;
  }

  // ---------------------------------------------------------------- X2.12 (a) the manual mistake label (user, 2026-10-01)
  function manualMistake(st) { return !!(st && st.user && MISTAKE.has(st.status)); }

  /** The popover's verdict badge: {cls, text, below (under the threshold: treated as correct)}. */
  function statusLabel(st, threshold) {
    const s = st.status || 'pending';
    if (manualMistake(st)) return {cls: 'wrong', text: 'manual labeled mistake', below: false};
    if (!MISTAKE.has(s) && s !== 'ok' && !s.startsWith('provisional')) return {cls: 'pending', text: 'not recited yet', below: false};
    if (s === 'ok') return {cls: 'ok', text: 'correct', below: false};
    if (s === 'hinted') return {cls: 'hinted', text: 'revealed by a hint (counted)', below: false};
    if (s.startsWith('provisional')) return {cls: 'prov', text: 'being confirmed', below: false};
    const below = !isMistake(st, threshold);
    if (s === 'wrong') return {cls: 'wrong', text: st.lost ? 'lost here: you jumped ahead' : 'different word heard', below};
    return {cls: 'missing', text: 'skipped', below};
  }

  /** The summary's verdict word (as recite/app.py verdict_label). */
  function summaryVerdict(st) {
    if (!st) return '?';
    if (manualMistake(st)) return 'manual labeled mistake';
    if (st.lost) return 'lost';
    return {wrong: 'wrong', missing: 'skipped', hinted: 'hint'}[st.status] || st.status;
  }

  /** What the popover / summary show as "heard" for a mistake: nothing for a manual one (not the reason). */
  function shownHeard(st) {
    if (!st || !st.hyp || manualMistake(st) || st.status === 'ok' || st.status === 'provisional_ok') return null;
    return st.hyp;
  }

  /** One line of the word's history: a manual mistake reads "manual labeled mistake" without heard; a manual correct
   *  reading is "ok (you)". r = {outcome, source, heard} from the backend, or this session's {now, user, heard}. */
  function readingText(r) {
    const bad = r.outcome === 'mistake';
    const manual = r.source === 'mark' || (!!r.now && !!r.user);
    if (bad && manual) return {label: 'manual labeled mistake', bad: true, you: false, heard: null};
    return {label: bad ? 'mistake' : 'ok', bad, you: manual, heard: bad && r.heard ? r.heard : null};
  }

  // ---------------------------------------------------------------- X2.12 (b) the page follows new recitation only
  const NO_FOLLOW = new Set(['mark', 'unmark', 'threshold', 'summary']);

  /** Does this `state` message move the mushaf to the cursor's page? Not for the answer to a mark / Remove / threshold
   *  change or to the live summary of a long press on ✗ n (B3.8 reply_to; D11, 2026-10-10), and not when the cursor did
   *  not move (a Remove after Stop jumped to the session's last page, user 2026-10-01). */
  function shouldFollowCursor(msg, prevCursor) {
    if (!msg || NO_FOLLOW.has(msg.reply_to)) return false;
    if (msg.cursor == null || msg.cursor < 0) return false;
    return msg.cursor !== prevCursor;
  }

  // ---------------------------------------------------------------- U1.4 the popover closes on a tap outside
  // U1.16 (review 2026-10-11): the bar's report button was no tap outside; issue #21 (v0.12): that button is gone. The
  // tap on ☰ (its Report line) is a tap outside (else the popover would float over Settings); a shake keeps the popover
  const INSIDE_IDS = new Set(['pop', 'summary', 'confirm']);

  /** `path` = event.composedPath() (the span clicked may already be detached: openPop re-renders the page). */
  function isOutsideTap(path) {
    for (const n of path || []) {
      if (!n) continue;
      if (n.id && INSIDE_IDS.has(n.id)) return false;
      const cls = n.classList ? Array.from(n.classList) : (typeof n.className === 'string' ? n.className.split(/\s+/) : []);
      // a word: it moves the popover there. D2 / D7 (2026-10-10): a bar (a mistake on a word not said yet, .w.concealed)
      // too: it opens the popover without the expected word (in v0.7 a tap on it closed the popover)
      if (cls.includes('w')) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- X2.1d the session follows into the next surah
  /** The `extended.index_map` entries (new ayat only) added to the session's {"s:a": start} map (a new object). */
  function mergeIndexMap(indexMap, entries) {
    const out = Object.assign({}, indexMap);
    for (const e of entries || []) out[`${e.surah}:${e.ayah}`] = e.start;
    return out;
  }

  // ---------------------------------------------------------------- U1.13 Listen
  // #31 (user, 2026-10-24): vary = Vary start and end (off: "the user checks this option"), gap_s = the pause between
  // plays (3 s, 0-30)
  const LISTEN_DEFAULT = {tab: 'page', surah: 1, ayah_from: 1, ayah_to: 7, page_from: 1, page_to: 1, repeat: 17, vary: false,
    gap_s: 3};
  const GAP_MAX_S = 30;
  const N_PAGES = 604;

  function int(v, dflt) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : dflt; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /** The Listen form (saved as settings.listen), clamped: surah 1-114, ayat 1..verses of the surah, pages 1-604, a
   *  reversed range swapped, repeat >= 0 (extra plays of the whole range), vary (#31: true only when ticked) and gap_s
   *  (#31: whole seconds 0-30, 3 when unreadable). chapters = [{id, verses_count}] or null.
   *  keepOrder: clamp only (the inputs while they are typed: "from 100" with 12..15 still shown must not become
   *  15..100 before "to 110" is typed; the saved form and the plan are swapped). */
  function clampListenForm(form, chapters, keepOrder) {
    const f = Object.assign({}, LISTEN_DEFAULT, form || {});
    const out = {tab: f.tab === 'ayah' ? 'ayah' : 'page'};
    out.surah = clamp(int(f.surah, 1), 1, 114);
    const ch = (chapters || []).find(c => +c.id === out.surah);
    const n = ch ? +ch.verses_count : Infinity;
    let a = clamp(int(f.ayah_from, 1), 1, n), b = clamp(int(f.ayah_to, a), 1, n);
    if (a > b && !keepOrder) [a, b] = [b, a];
    out.ayah_from = a; out.ayah_to = b;
    let p = clamp(int(f.page_from, 1), 1, N_PAGES), q = clamp(int(f.page_to, p), 1, N_PAGES);
    if (p > q && !keepOrder) [p, q] = [q, p];
    out.page_from = p; out.page_to = q;
    out.repeat = clamp(int(f.repeat, LISTEN_DEFAULT.repeat), 0, 999);
    out.vary = f.vary === true;
    out.gap_s = clamp(int(f.gap_s, LISTEN_DEFAULT.gap_s), 0, GAP_MAX_S);
    return out;
  }

  /** #31: Vary and the pause between plays apply only with Repeat >= 1 (one play: nothing to vary, nothing to pause
   *  between): the form greys them out otherwise ("when they set repetition to 0 then gray it out"). */
  function listenOptionsOn(form) { return !!form && int(form.repeat, 0) >= 1; }

  /** #31: what a play carries along (engine.player.play's options; AndroidEngine's message, B3.14 plan.options). */
  function listenPlayOptions(form) {
    const f = form || {};
    return {vary: f.vary === true, gap_s: clamp(int(f.gap_s, LISTEN_DEFAULT.gap_s), 0, GAP_MAX_S)};
  }

  // ---- #31 the pass shapes: the same numbers in Kotlin (ListenLogic.kt PassShape) and here (§4 of the round's plan)
  /** The standard 32-bit mulberry32 generator: a function returning numbers in [0, 1). */
  function mulberry32(a) {
    return function () {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /** #31 (user, 2026-10-24: "randomize start and end with a +[0-4] eyats … the first one is always as is … fade out
   *  randomly in the middle of the last eya"): the shape of pass `pass` (1 = the first play) of a listening with seed
   *  `seed`: {before (extra ayat before the range, 0..maxBefore), after (0..the farthest step of marginAfter), fade (ms
   *  into the last extra ayah's file where its fade-out ends, or null)}. Pass 1: the exact range. Each pass is drawn
   *  alone (Resume, ⏮ across passes, the car's Repeat see the same plays). The fade ends on a word start of that ayah
   *  between 35 % and 65 % of it (its `cuts`), else at 35-65 % of the file when it lasts 3 s or more, else none.
   *  marginAfter = the plan's margin_after ({step, ms, cuts}); maxBefore = the farthest step of its margin_before. */
  function passShape(seed, pass, maxBefore, marginAfter) {
    if (!(pass > 1)) return {before: 0, after: 0, fade: null};
    const rng = mulberry32((seed ^ Math.imul(pass, 0x9E3779B9)) >>> 0);
    const ma = marginAfter || [];
    const maxAfter = ma.reduce((m, c) => Math.max(m, +c.step || 0), 0);
    const before = Math.floor(rng() * ((+maxBefore || 0) + 1));
    const after = Math.floor(rng() * (maxAfter + 1));
    let fade = null;
    if (after > 0) {
      const last = ma.filter(c => +c.step === after).pop();
      const r = rng();
      const cuts = last && Array.isArray(last.cuts) ? last.cuts : [];
      if (cuts.length) fade = cuts[Math.floor(r * cuts.length)];
      else if (last && last.ms != null && last.ms >= 3000) fade = Math.floor(last.ms * (0.35 + 0.30 * r));
    }
    return {before, after, fade};
  }

  /** #31: the farthest step of a margin (0 for none: a plan of an older engine, a whole surah). */
  function marginSteps(margin) { return (margin || []).reduce((m, c) => Math.max(m, +c.step || 0), 0); }

  /** #31: the clips of one pass: the plan's margin_before clips within `before` steps, its clips, its margin_after clips
   *  within `after` steps (the margins come in playing order, a basmala with its ayah 1); the last one carries
   *  fade_ms when the pass fades out. */
  function passClips(plan, shape) {
    const s = shape || {before: 0, after: 0, fade: null};
    const after = (plan.margin_after || []).filter(c => +c.step <= s.after);
    const out = (plan.margin_before || []).filter(c => +c.step <= s.before).concat(plan.clips || [], after);
    if (after.length && s.fade != null) out[out.length - 1] = Object.assign({}, out[out.length - 1], {fade_ms: s.fade});
    return out;
  }

  /** #31: the volume while a pass fades out: from 1 down to 0 over the span (1.8 s) that ends at the cut. */
  function fadeVolume(posMs, endMs, spanMs) { return clamp((endMs - posMs) / (spanMs || 1800), 0, 1); }

  /** The `listen_plan` parameters of the form's current tab (B3.14). */
  function listenParams(form) {
    return form.tab === 'ayah' ? {tab: 'ayah', surah: form.surah, ayah_from: form.ayah_from, ayah_to: form.ayah_to}
      : {tab: 'page', page_from: form.page_from, page_to: form.page_to};
  }

  /** "= 18 plays" next to the repeat count (the range plays once, then `repeat` more times). */
  function playsText(repeat) { const n = (+repeat || 0) + 1; return `= ${n} play${n === 1 ? '' : 's'}`; }

  /** A quick button (listen_targets entry) fills in the form: its tab, pages and repeat; the Eyah tab gets the plan's
   *  first surah and its ayat when the target has a plan. */
  function listenFormFromTarget(target, form) {
    const out = Object.assign({}, LISTEN_DEFAULT, form || {});
    out.tab = target.tab === 'ayah' ? 'ayah' : 'page';
    if (target.page_from != null) { out.page_from = target.page_from; out.page_to = target.page_to != null ? target.page_to : target.page_from; }
    if (target.repeat != null) out.repeat = target.repeat;
    const p = target.plan;
    if (p && p.surah) { out.surah = p.surah; out.ayah_from = p.ayah_from; out.ayah_to = p.ayah_to; }
    return out;
  }

  /** U1.1b: the 15 lines of a page, with the leading empty lines of pages 1 and 2 (7 empty, then the text) shared above
   *  and below the text, so the opening pages are centred like the printed mushaf instead of sitting at the bottom. */
  function centreLines(lines) {
    let n = 0;
    while (n < lines.length && lines[n].kind === 'empty') n++;
    const move = n < 2 ? 0 : Math.ceil(n / 2);   // 7 -> 3 above, 4 below: the text sits a little above the middle
    if (!move || n === lines.length || lines[lines.length - 1].kind === 'empty') return lines.slice();
    return lines.slice(move).concat(lines.slice(0, move));
  }

  /** About > Licences (P0.6): the licenses/<file> mentions of an already escaped text become links to the viewer
   *  (data-lic); a URL that merely contains "licenses/" (creativecommons.org/licenses/by/4.0/) is left alone. */
  function linkLicenceFiles(html) {
    return String(html).replace(/(^|[^\w\/.\-])licenses\/([\w\-]+(?:\.[\w\-]+)+)/g,
      (m, pre, f) => `${pre}<a href="#" data-lic="${f}">licenses/${f}</a>`);
  }

  /** The now-playing line from a player state (engine.player.onState). Between clips (each one loads) it keeps the
   *  ayah and the pass: only the plan's very first clip says "Loading" (K7, no flash at every ayah). */
  function nowPlayingText(s) {
    if (!s || !s.status || s.status === 'idle') return '';
    if (s.status === 'ended') return 'Finished';
    if (s.status === 'error') return 'Error: ' + (s.message || 'cannot play');
    const parts = [];
    // #31: the pause between two plays (the PC player: no clip; Android: its pause item): the play that comes next
    if (s.kind === 'gap' || (s.label === 'Pause' && !s.key)) {
      parts.push(s.status === 'paused' ? 'Paused' : 'Pause');
      if (s.passes > 1 && s.pass) parts.push(`then pass ${Math.min(+s.pass + 1, +s.passes)} / ${s.passes}`);
      return parts.join(' · ');
    }
    if (s.status === 'paused') parts.push('Paused');
    if (s.status === 'loading' && (s.index == null || (s.index === 0 && (s.pass || 1) === 1))) parts.push('Loading');
    if (s.label) parts.push(s.label);
    if (s.passes > 1 && s.pass) parts.push(`pass ${s.pass} / ${s.passes}`);
    if (s.to_download && s.downloaded != null && s.downloaded < s.to_download) parts.push(`downloaded ${s.downloaded} / ${s.to_download}`);
    return parts.join(' · ');
  }

  // ---------------------------------------------------------------- U1.4c the speech model, loaded at the first press
  const MODEL_LOADS = 3;   // `load` asked at most 3 times when nobody is loading the model

  /** The next step of ensureModel from the engine's last answer r ({ready, loading, installed, downloading, pct, error},
   *  from `ready` or `load`) and what was done ({loads, downloaded, waited (a download this press waited on), justLoaded}):
   *  'done', 'download' (a phone without the model, B3.13: once, before any load; Kotlin joins its own download or
   *  starts one), 'load', 'poll' (wait, then ask `ready`; always after a load that is not ready yet; `downloading`: Kotlin
   *  downloads the model, D1 (v0.9): never a second download) or 'fail' with `why` (`download`: the download failed).
   *  D2 (v0.9, user 2026-10-11): installed === false comes before any error: a fresh phone's `ready` also carried "the
   *  speech model is not downloaded yet" as an error, tested first, so the press failed (in red, for ever) instead of
   *  downloading. */
  function modelStep(r, done) {
    r = r || {}; done = done || {};
    if (r.ready) return {step: 'done'};
    if (r.downloading) return {step: 'poll', downloading: true};
    if (r.installed === false) {
      if (!done.downloaded && !done.waited && !done.loads) return {step: 'download'};
      return {step: 'fail', download: true, why: String(r.error || 'the download did not finish')};
    }
    if (r.error) return {step: 'fail', why: String(r.error)};
    if (r.loading || done.justLoaded) return {step: 'poll'};
    if ((done.loads || 0) >= MODEL_LOADS) return {step: 'fail', why: 'the model did not load'};
    return {step: 'load'};
  }

  /** D2 (v0.9, user 2026-10-11: "it should download automatically with a small progress bar"): what the page shows for
   *  Kotlin's download of the speech model (D1) from its last model_download event m ({state: 'running' | 'done' |
   *  'failed', pct, bytes, total, error, retry_s}): {show (the thin bar on the bottom bar's top edge), pct (0-100, whole),
   *  title, busy (the microphone busy-outlined), toast: null | {text, error, ms}}. done: "Speech model downloaded." 3 s;
   *  failed: a red toast that hides after 10 s, unless it failed for the same reason as the failure said last
   *  (lastFailure: Kotlin retries by itself, 30 s ... every 10 min, and says each failure). */
  function modelDownloadView(m, lastFailure) {
    const st = m && typeof m === 'object' ? m.state : null;
    const out = {show: false, pct: 0, title: '', busy: false, toast: null};
    if (st === 'running') {
      const raw = m.pct != null ? +m.pct : (+m.total > 0 ? 100 * (+m.bytes || 0) / +m.total : 0);
      out.pct = clamp(Math.round(Number.isFinite(raw) ? raw : 0), 0, 100);
      out.show = out.busy = true; out.title = `Downloading the speech model: ${out.pct} %`;
    } else if (st === 'done') {
      out.toast = {text: 'Speech model downloaded.', error: false, ms: 3000};
    } else if (st === 'failed') {
      const why = String(m.error == null ? '' : m.error);
      if (lastFailure == null || why !== String(lastFailure)) {
        const reason = why.trim().replace(/[.\s]+$/, '');
        out.toast = {text: `Could not download the speech model${reason ? ': ' + reason : ''}. It tries again by itself `
          + 'when the internet is back.', error: true, ms: ERROR_TOAST_MS};
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- the toast (D2, v0.9)
  const TOAST_MS = 4000, ERROR_TOAST_MS = 10000;

  /** How long a toast stays (ms): what the caller asks (Infinity: until another message, e.g. the text size while
   *  pinching), else 4 s; an error 10 s unless a duration is given, and never for ever (user, 2026-10-11: "the red
   *  message should disappear after a while"; v0.8 kept errors until the next message or Esc). */
  function toastMs(error, ms) {
    const n = ms == null ? NaN : +ms;
    if (error) return Number.isFinite(n) && n > 0 ? n : ERROR_TOAST_MS;
    return ms == null || Number.isNaN(n) ? TOAST_MS : n;
  }

  /** After the model loaded (seconds on a PC, minutes for a phone's download), whether the press that asked for it
   *  still starts: 'start', 'busy' (a session or a search started meanwhile) or 'left' (the user left Recite, e.g. to
   *  play something in Listen: a microphone session there would record the reciter, U1.13; or pressed Listen's play
   *  meanwhile (`played`), which opens Recite since 2026-10-04: the session would stop that playback; or the page is
   *  `hidden`: the app went to the background during a download, review 2026-10-11: no microphone from there). */
  function startAfterModel(s) {
    s = s || {};
    if (s.running || s.starting || s.searching) return 'busy';
    return s.view === 'recite' && !s.played && !s.hidden ? 'start' : 'left';
  }

  // ---------------------------------------------------------------- X2.2 text modes: what is visible, Shown resets
  const FINAL = new Set(['ok', 'wrong', 'missing', 'hinted']);
  const CONFIRMING = new Set(['provisional_wrong', 'provisional_missing']);

  /** D4 (#4, user 2026-10-10): a verdict being confirmed as a mistake (taupe, "gris tourterelle"): provisional wrong /
   *  skipped at or above the threshold, not the user's own mark. It is no reading of the word's history (yet). */
  function confirming(st, threshold) {
    return !!st && !st.user && CONFIRMING.has(st.status) && st.score >= threshold;
  }

  /** D2 (#2, 2026-10-10): a mistake on a word the reciter never said correctly: the tracker conceals it (X2.4c, the lost
   *  word, until said, revealed or Stop), or a final wrong / skipped verdict at or above the threshold, or one being
   *  confirmed, on a word neither marked by the user, nor revealed (hinted), nor said correctly once (`said`, B3.8).
   *  A concealed word the user marked correct (+ Correct after the replay) is no mistake: it is no bar either. */
  function unsaidMistake(st, threshold) {
    if (!st) return false;
    if (st.concealed) return !(st.user && st.status === 'ok');
    if (st.user || st.hinted || st.said) return false;
    return ((st.status === 'wrong' || st.status === 'missing') && st.score >= threshold) || confirming(st, threshold);
  }

  /** Is this word visible (not a grey block in Hidden, rendered at all in Blind)? st = its session state; o = {inRevealed
   *  (revealed with ◂ / ⏮ outside a session), inShown (appeared during this session: never disappears, U1.2d, but
   *  before `first` after a #33 restart further on), gi (its
   *  session index or null), first (X2.1c: words before a mid-page start are never shown), cursor, remask (X2.2, user
   *  2026-10-04: a finished session's words were hidden again by a switch to / from Shown), live (a session runs or is
   *  paused, ■ not pressed) and threshold (D2: during it a mistake on a word not said yet is a bar, not the word; a
   *  provisional verdict on a word not said yet is not the word either (review 2026-10-11, #2: a word heard only as
   *  nonsense, D6, or wrong under the threshold, was drawn, joined `shown` and stayed the word once it turned "being
   *  confirmed"): it shows once said, final, revealed or after ■); #39 (v0.16): inCue (a word of a review card's cue,
   *  drawn greyed before the run-up: never a word of the session, never a hint)}.
   *  Independent of the text mode on purpose: the page adds every visible word to `shown` (the cue's words excepted). */
  function wordVisible(st, o) {
    o = o || {};
    const first = o.first || 0;
    if (o.inRevealed || o.inCue) return true;
    // #33 review: a restart further on (first grew) puts the words before it back to not recited: shown before, they
    // are no longer (X2.1c), unless hinted or marked by the user
    if (o.inShown && o.gi != null && o.gi < first && !(st && (st.hinted || st.user))) return false;
    if (o.inShown) return true;      // U1.2d; #7: a word on screen that turns lost stays (clickable)
    if (o.remask) return false;
    if (o.live && unsaidMistake(st, o.threshold)) return false;   // its bar shows the mistake, not the word
    const status = String(st.status || 'pending');
    if (status.startsWith('provisional') && o.live && !st.said && !st.hinted) return false;   // not said yet: hidden
    return !!st.hinted || FINAL.has(status) || status.startsWith('provisional') || (o.gi != null && o.gi >= first && o.gi <= o.cursor);
  }

  /** D2: the bar drawn instead of a word in Hidden / Blind during a session (fixed length, no clue): 'lost' (red: a final
   *  verdict, or the word the tracker concealed), 'confirming' (taupe: being confirmed) or null (no bar: the word, a
   *  grey block or nothing). o = wordVisible's o + mode. After ■ (live false) nothing is a bar. */
  function placeholderKind(st, o) {
    o = o || {};
    if (!st || o.mode === 'show' || o.remask || !o.live || wordVisible(st, o) || !unsaidMistake(st, o.threshold)) return null;
    return st.concealed || FINAL.has(st.status) ? 'lost' : 'confirming';
  }

  /** X2.2 / #29 (user, 2026-10-20: "in blind mode the user should not know yet he finished the ayah until he recited the
   *  first word of next ayah"): is an ayah's marker drawn? Shown and Hidden draw every marker. In Blind it needs the
   *  ayah's whole last written word visible (lastSeen, U1.1e) and either the next ayah's whole first written word
   *  visible (nextSeen: said, final or revealed), no next ayah (hasNext false: 114:6), or the session that went through
   *  the ayah over (closed: ■ or a saved session, the result view). Only the drawing waits: the ayah counts as recited
   *  with its last word. o = {mode, lastSeen, hasNext, nextSeen, closed}. */
  function ayahMarkerShown(o) {
    o = o || {};
    if (o.mode !== 'blind') return true;
    if (!o.lastSeen) return false;
    return !o.hasNext || !!o.nextSeen || !!o.closed;
  }

  /** U1.2b (D4, 2026-10-10): this session's reading of a word for the history glow: the user's mark, or a final
   *  verdict ('mistake' at or above the threshold, else 'ok'); a provisional verdict is no reading (it was the orange
   *  glow of #4). null outside a session, and once it is saved (the server's readings hold it: no double count).
   *  ctx = {session (one is on the page), saved}. */
  function sessionOutcome(st, threshold, ctx) {
    ctx = ctx || {};
    if (!st || !ctx.session || ctx.saved) return null;
    if (st.user) return st.status === 'ok' ? 'ok' : 'mistake';
    if (FINAL.has(st.status)) return isMistake(st, threshold) ? 'mistake' : 'ok';
    return null;
  }

  /** B3.8: a session word (state / session_load) as the page keeps it (D2, 2026-10-10: `said` included). */
  function wordState(w) {
    w = w || {};
    return {status: w.status || 'pending', score: w.score == null ? 0 : w.score, hyp: w.hyp == null ? null : w.hyp,
      hinted: !!w.hinted, lost: !!w.lost, concealed: !!w.concealed, said: !!w.said, user: !!w.user,
      t0: w.t0 == null ? null : w.t0, t1: w.t1 == null ? null : w.t1};
  }

  /** D1 (#1, 2026-10-10): what ◂ / ⏮ send during a session. ◂ reveals the earliest bar of the page shown first (hint{i},
   *  barGi = its session index; v0.7 revealed the word after the cursor and left the red bar), else the word after the
   *  reciter (hint without i, X2.4b); ⏮ is unchanged (the rest of the ayah, skip_to without i). */
  function sessionRevealMsg(kind, barGi) {
    if (kind !== 'word') return {type: 'skip_to'};
    return barGi != null && barGi >= 0 ? {type: 'hint', i: +barGi} : {type: 'hint'};
  }

  /** D3 (#3, user 2026-10-10): the bar's unsettled-speech gauge (U1.2c) and ⚠ from a state. Paused reads as finished
   *  (the state of ❚❚ carries paused, and the page knows it paused): an empty gauge, no ⚠; the next state after the
   *  resume sets them again. */
  function barSignals(m, paused) {
    m = m || {};
    if (paused || m.paused) return {speech: 0, latency: 0, warn: false};
    return {speech: m.speech_s != null ? +m.speech_s : (+m.buffer_s || 0), latency: +m.latency_s || 0, warn: !!m.off_track};
  }

  /** X2.2 (user, 2026-10-04): what a text-mode change does to the reveals. Outside a session (not running, which
   *  includes paused, starting or searching), Shown means everything was seen: a change to Shown, or from Shown back to
   *  Hidden / Blind, clears the reveals ({clear}: the ◂ / ⏮ reveals and the words shown) and masks a finished session's
   *  words again ({remask}). Hidden <-> Blind keeps them; during a session nothing disappears (U1.2d). */
  function modeChangeEffect(from, to, ctx) {
    ctx = ctx || {};
    const none = {clear: false, remask: false};
    if (from === to || (from !== 'show' && to !== 'show')) return none;
    if (ctx.running || ctx.starting || ctx.searching) return none;
    return {clear: true, remask: !!ctx.hasSession};
  }

  /** U1.11: the colour class of a Progress level (ok / warn / bad); nothing for an unknown or missing level (an older
   *  engine without progress.manzil.revised_level). */
  function levelClass(level) { return ['ok', 'warn', 'bad'].includes(level) ? 'lvl-' + level : ''; }

  /** Issue #13 (user, 2026-10-13): the Progress line under Total learned, from progress.new_learned: "New ayat learned:
   *  <b>2</b> today · <b>9</b> this week · <b>59</b> in 2026". Once every ayah is learned (learned.n = total_ayat; the
   *  rounded percent already reads 100 from 6233 on) a count at 0 is left out, and the whole line (null) when all three
   *  are; until then a 0 is shown. null for an engine without new_learned. */
  function newLearnedLine(p, opts) {
    const nl = p && p.new_learned;
    if (!nl || typeof nl !== 'object') return null;
    const all = !!(p.learned && p.total_ayat && +p.learned.n >= +p.total_ayat);
    // U1.19 (issue #13, v0.12): the Stats page's Overall line leaves today out ({today: false}): Today has its own line
    const withToday = !(opts && opts.today === false);
    const parts = [[nl.today, 'today'], [nl.week, 'this week'], [nl.year, nl.year_number ? 'in ' + nl.year_number : 'this year']]
      .filter(([, label]) => withToday || label !== 'today')
      .map(([n, label]) => [Math.max(0, Math.round(+n || 0)), label])
      .filter(([n]) => !(all && n === 0))
      .map(([n, label]) => `<b>${n}</b> ${label}`);
    return parts.length ? 'New ayat learned: ' + parts.join(' · ') : null;
  }

  /** U1.19 (issue #13): the Stats page's Today list (HTML items, from `stats`). "Ayat learned" follows the #13 rule of
   *  newLearnedLine: once every ayah is learned, a 0 is left out (user, 2026-10-13: "hidden if total learned is already
   *  100% and they are at 0"). */
  function statsTodayLines(s) {
    const t = (s && s.today) || {};
    const all = !!(s && s.learned && s.total_ayat && +s.learned.n >= +s.total_ayat);
    const learned = Math.max(0, Math.round(+t.learned || 0));
    return [
      ...(all && learned === 0 ? [] : [`Ayat learned: <b>${learned}</b>`]),
      `Mistakes corrected: <b>${t.corrected}</b> <span class="lbl">(a mistake before today, recited right today)</span>`,
      `Pages recited: <b>${t.pages}</b>`,
    ];
  }

  // ---------------------------------------------------------------- issue #13 (D6, user 2026-10-17): Progress / Stats
  /** U1.11 revised: the Progress page's three checks, each done today or not. Manzil: while its date is green (orange
   *  or red, and nothing recited yet: to do). Weakest page: unless its count is red (no weak page = no mistake: done).
   *  Next to learn: when it moved forward by at least one ayah today (progress.next_advanced_today = its mushaf
   *  position now minus at midnight; every ayah recited: done). #39 (v0.16): with the Review page's queue q
   *  (review_queue, its own call when Progress opens), a 4th check: review, done once no card is due today (no q:
   *  no such key, the line is not shown). */
  function progressChecks(p, q) {
    const out = !p || typeof p !== 'object' ? {manzil: false, weak: false, next: false} : {
      manzil: !!(p.manzil && p.manzil.revised_level === 'ok'),
      weak: !p.weak || p.weak.err_level !== 'bad',
      next: !p.next_to_learn || (+p.next_advanced_today || 0) >= 1,
    };
    if (q !== undefined) out.review = reviewCounters(q).due === 0;
    return out;
  }

  // ---------------------------------------------------------------- #39 the Review page (v0.16; U1.10, U1.20)
  // user, 2026-10-25: "Build something, let's see; only the Android app, not the web for now."
  /** The engine offers the review calls (engine.features.review: Android and the PC; the web's engine: none). */
  function reviewOn(features) { return !!features && features.review === true; }

  /** review_queue's counters, cleaned (whole numbers >= 0): {red (today's errors, due again today), green (read right
   *  once before today, due today), due (counters.total_due), suspended}. */
  function reviewCounters(q) {
    const c = (q && q.counters) || {};
    const n = (v) => Math.max(0, Math.round(+v) || 0);
    return {red: n(c.red), green: n(c.green), due: n(c.total_due), suspended: n(c.suspended)};
  }

  const REVIEW_TAGS = {new: 'new', red: 'to fix', green: 'to confirm', stubborn: 'stubborn'};
  /** A row of the Review list (a review_queue card, names = {surah id: English name}): {title (the surah · the page),
   *  detail (its mistakes in the last 5 readings · the engine's why), tag (the card's state), tagText}. Never the
   *  target's ayat: the card test is hidden (user, #39: the user starts e.g. at ayah 8 for an error at 10). */
  function reviewCardView(card, names) {
    const c = card || {};
    const name = (names && names[c.surah]) || `Surah ${c.surah}`;
    const n = Math.max(0, Math.round(+c.errors) || 0);
    const tag = REVIEW_TAGS[c.state] ? c.state : 'new';
    return {title: c.page ? `${name} · page ${c.page}` : name,
      detail: [`${n} mistake${n === 1 ? '' : 's'}`, c.why ? String(c.why) : ''].filter(Boolean).join(' · '),
      tag, tagText: REVIEW_TAGS[tag]};
  }

  /** The cue drawn in place on the run-up's page (review_card's cue.lines, line numbers of `page`): the keys of the
   *  words on those lines that come before the run-up's first ayah `from` ({surah, ayah}); its first words, on the
   *  same line, are the user's to recite. */
  function reviewCueKeys(page, lines, from) {
    const ws = page && Array.isArray(page.words) ? page.words : [];
    const want = new Set((lines || []).map(Number)), f = from || {};
    const before = (w) => +w.surah < +f.surah || (+w.surah === +f.surah && +w.ayah < +f.ayah);
    const out = [];
    for (const ln of (page && page.lines) || []) {
      if (!want.has(+ln.n)) continue;
      for (const [start, n] of ln.runs || []) {
        for (let k = +start; k < +start + +n; k++) { const w = ws[k]; if (w && before(w)) out.push(`${w.surah}:${w.ayah}:${w.idx}`); }
      }
    }
    return out;
  }

  /** The session index of the last word of ayah surah:ayah from the session's index map ({"s:a": start}): the next
   *  ayah's start minus 1 (the next surah's once the session followed it, X2.1d), else the session's last word
   *  (nWords - 1); null when the ayah is not in the session. */
  function reviewTargetLast(indexMap, surah, ayah, nWords) {
    const m = indexMap || {}, s = m[`${surah}:${ayah}`];
    if (s == null) return null;
    let next = null;
    for (const v of Object.values(m)) if (+v > +s && (next == null || +v < next)) next = +v;
    if (next != null) return next - 1;
    return +nWords > +s ? +nWords - 1 : null;
  }

  /** The card strip's Next (user, #39: "a Next button green-outlined ("skip for now") becomes filled Next once the task
   *  is done"): filled once the target's last word (lastGi) has a final verdict (or the user's) or the cursor passed
   *  it; o = {lastGi, st (its state), cursor} -> {filled, action ('skip' | 'done': ■ and the result), label, title}. */
  function reviewNextState(o) {
    o = o || {};
    const st = o.st || {}, gi = o.lastGi;
    const done = gi != null && (FINAL.has(String(st.status)) || !!st.user || +o.cursor > +gi);
    return done ? {filled: true, action: 'done', label: 'Next', title: 'The card is done: stop and see the result'}
      : {filled: false, action: 'skip', label: 'Next', title: "Skip this card for now: it comes back at the end of today's round"};
  }

  /** review_result r -> what the strip shows: {passed, head, ayat: [{text 's:a', ok, runup}], due ('Next review: today' |
   *  'Next review: 29 Oct 2026'), why (the engine's sentence), help (offer Help me learn: a fail the engine flags)}. */
  function reviewResultView(r) {
    if (!r || typeof r !== 'object') return {passed: false, head: 'No result', ayat: [], due: '', why: '', help: false};
    const ayat = (Array.isArray(r.ayat) ? r.ayat : []).map(a => ({text: `${a.surah}:${a.ayah}`, ok: !!a.ok, runup: a.role === 'runup'}));
    const day = r.next_due === 'today' ? 'today' : dayText(r.next_due);
    return {passed: !!r.passed, head: r.passed ? 'Passed' : 'Not yet', ayat, due: day ? `Next review: ${day}` : '',
      why: r.why ? String(r.why) : '', help: !r.passed && !!r.help};
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
    'November', 'December'];
  /** 'yyyy-mm-dd' (+ n days) -> '25 Sep 2026' (UTC arithmetic: no time zone or DST shift); '' when unreadable. */
  function dayText(iso, plus) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + (plus || 0)));
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
  }

  /** U1.19: the averaging window of the Stats page (stats.avg.window_days: 28, or 7..27 days early on). */
  function averageWindowText(days) {
    const n = Math.round(+days || 28);
    return n === 28 ? 'last 4 weeks' : `last ${n} days`;
  }

  /** U1.19: a slope per week (stats.slope.*): '+12.5 a week', '−1.0 a week' (a real minus sign) or 'flat'. */
  function slopeText(x) {
    const v = Math.round((+x || 0) * 10) / 10;
    if (v === 0) return 'flat';
    return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1) + ' a week';
  }

  /** U1.19, issue #30 (user, on 0.12: "a combo box to choose from which speed to consider (since the beginning, since
   *  last month, since last week) … default since last month"): the "Pace over" choices, stats.pace.windows' keys in
   *  the select's order, with their names ('month' = 28 days, the page's other averages; "Last 7 days", not "last
   *  week": on this page "this week" runs from Monday). */
  const PACE_WINDOWS = [['all', 'Since the beginning'], ['month', 'Last 4 weeks'], ['week', 'Last 7 days']];

  /** Issue #30: the saved choice (settings.stats_pace) -> one of PACE_WINDOWS' keys; absent or unknown: 'month'. */
  function normalizePaceWindow(v) {
    return PACE_WINDOWS.some(([k]) => k === v) ? v : 'month';
  }

  /** Issue #30: the days a pace counts: 'since 18 Aug 2026' (since the beginning: stats.series.start), else the
   *  window's days as averageWindowText says them ('last 4 weeks', 'last 7 days', 'last N days' early on). */
  function paceWindowText(key, days, start) {
    return key === 'all' && dayText(start) ? `since ${dayText(start)}` : averageWindowText(days);
  }

  /** U1.19: the finish date line from a window of stats.pace.windows ({days, ayat, ayat_per_week, finish}), the ayat
   *  left (stats.pace.remaining) and the window's label (paceWindowText; default: its days). Issue #30: a window with
   *  ayat but no date is past year 9999 (since the beginning, little learned), not "no ayah learned". */
  function finishText(win, remaining, label) {
    if (remaining != null && +remaining === 0) return "The whole Qur'an is learned.";
    if (!win || typeof win !== 'object') return '';
    const lbl = label || averageWindowText(win.days);
    if (!(+win.ayat > 0)) return `No new ayah learned ${/^since /.test(lbl) ? lbl : 'in the ' + lbl}: no finish date yet.`;
    const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(win.finish || '');
    if (!m) return 'Finish date: too far away at this pace.';
    return `Finish date: around ${MONTHS[+m[2] - 1]} ${m[1]}`;
  }

  /** U1.19, issue #30: the Stats page's "Pace and finish date" list (HTML items) over the chosen window (key, see
   *  normalizePaceWindow): the pace and its days, the ayat left, the finish date; only the last line once nothing is
   *  left; nothing without stats. */
  function paceLines(s, key) {
    const pace = s && s.pace;
    if (!pace || typeof pace !== 'object') return [];
    const k = normalizePaceWindow(key);
    const w = (pace.windows && pace.windows[k]) || {};
    const label = paceWindowText(k, w.days, s.series && s.series.start);
    const finish = finishText(w, pace.remaining, label);
    if (+pace.remaining === 0) return [finish];
    return [
      `Pace: <b>${+w.ayat_per_week || 0}</b> new ayat a week <span class="lbl">(${label})</span>`,
      `Left to learn: <b>${pace.remaining} ayat</b>`,
      finish,
    ];
  }

  /** U1.19: the chart's lines in the legend's order, and its geometry (SVG user units; the page scales it). */
  const STATS_LINES = [['learned', 'Total learned'], ['perfect', 'Perfect learning'], ['next', 'Next to learn']];
  const STATS_CHART = {w: 320, h: 160, l: 34, r: 10, t: 8, b: 20};

  /** A round top for the y axis (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 x 10^k, at least 5), never above the whole Qur'an
   *  (cap) when the values are not. */
  function niceMax(v, cap) {
    if (!(v > 0)) return 5;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    let m = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map(s => s * p).find(s => s >= v - 1e-9);
    if (cap && v <= cap) m = Math.min(m, cap);
    return Math.max(m, 5);
  }

  /** U1.19: the inline SVG chart of stats.series ({start, days: day offsets, learned, perfect, next}): one 2 px
   *  polyline per shown line (opts.show {learned, perfect, next}, default all; the y axis from 0 to a round top that
   *  fits the shown lines), a dot at today's value, grid lines at 0, the middle and the top, the first and last dates
   *  under it, and a hidden guide line for the page's tap / hover readout. null with fewer than 2 points. */
  function statsChartSvg(series, opts) {
    opts = opts || {};
    const days = series && Array.isArray(series.days) ? series.days : [];
    if (!series || !series.start || days.length < 2) return null;
    const G = STATS_CHART, W = G.w, H = G.h, last = days[days.length - 1] || 1;
    const show = Object.assign({learned: true, perfect: true, next: true}, opts.show || {});
    const lines = STATS_LINES.filter(([k]) => show[k] && Array.isArray(series[k]) && series[k].length === days.length);
    const top = niceMax(Math.max(0, ...lines.map(([k]) => Math.max(...series[k].map(v => +v || 0)))),
      opts.total || 6236);
    const r1 = (v) => Math.round(v * 10) / 10;
    const x = (d) => r1(G.l + (W - G.l - G.r) * d / last);
    const y = (v) => r1(G.t + (H - G.t - G.b) * (1 - (+v || 0) / top));
    const ticks = [0, top / 2, top].filter(v => Number.isInteger(v));
    const out = [`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${
      lines.map(([k, name]) => `${name} ${series[k][series[k].length - 1]}`).join(', ') || 'No line shown'}">`];
    for (const v of ticks) {
      out.push(`<line class="grid${v === 0 ? ' base' : ''}" x1="${G.l}" x2="${W - G.r}" y1="${y(v)}" y2="${y(v)}"/>`);
      out.push(`<text class="tick" x="${G.l - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`);
    }
    out.push(`<text class="tick" x="${G.l}" y="${H - 5}" text-anchor="start">${dayText(series.start)}</text>`);
    out.push(`<text class="tick" x="${W - G.r}" y="${H - 5}" text-anchor="end">${dayText(series.start, last)}</text>`);
    out.push(`<line class="guide" x1="${G.l}" x2="${G.l}" y1="${G.t}" y2="${H - G.b}" visibility="hidden"/>`);
    for (const [k, name] of lines) {
      const pts = days.map((d, i) => `${x(d)},${y(series[k][i])}`).join(' ');
      out.push(`<polyline class="ln ln-${k}" data-line="${k}" points="${pts}"><title>${name}</title></polyline>`);
      out.push(`<circle class="dot dot-${k}" cx="${x(last)}" cy="${y(series[k][days.length - 1])}" r="3.5"/>`);
    }
    out.push('</svg>');
    return out.join('');
  }

  /** U1.19: the series' point nearest to a fraction (0 = the first day, 1 = today) of the chart's width. */
  function statsPointAt(series, frac) {
    const days = series && Array.isArray(series.days) ? series.days : [];
    if (!days.length) return -1;
    const want = Math.max(0, Math.min(1, +frac || 0)) * days[days.length - 1];
    let best = 0;
    days.forEach((d, i) => { if (Math.abs(d - want) < Math.abs(days[best] - want)) best = i; });
    return best;
  }

  /** U1.19: the readout of point i ('12 Jan 2026 · Total learned 3 · Perfect learning 3 · Next to learn 3'). */
  function statsPointText(series, i, show) {
    if (!series || !Array.isArray(series.days) || !(i >= 0 && i < series.days.length)) return '';
    const shown = Object.assign({learned: true, perfect: true, next: true}, show || {});
    return [dayText(series.start, series.days[i]),
      ...STATS_LINES.filter(([k]) => shown[k] && Array.isArray(series[k])).map(([k, name]) => `${name} ${series[k][i]}`)]
      .join(' · ');
  }

  // ---------------------------------------------------------------- U1.13 one bar for Recite and Listen (user, 2026-10-04)
  const LISTEN_ON = new Set(['playing', 'loading', 'paused']);

  /** Which buttons the bottom bar shows: 'listen' (the microphone is ▶ play / ❚❚ pause, the search button ■ stop) in the
   *  Listen view and wherever a Listen playback is on; 'recite' otherwise (microphone / search, or a session's pause /
   *  stop: a recitation keeps priority). ctx = {status, source (listen_state.source: the car's Recite is 'recite', not
   *  a Listen playback), running, starting, searching, view, mode (the text mode), seen (the page saw this playback
   *  play since it last came to the front)}.
   *  Issue #19 (user, 2026-10-16/17, D4): outside the Listen view, Hidden and Blind are always Recite's ("if someone
   *  select blind then automatically it is recite mode"), and a paused playback the page never saw play (the car, the
   *  notification, Meddeb started or brought back) leaves the bar to Recite. */
  function barMode(ctx) {
    ctx = ctx || {};
    if (ctx.running || ctx.starting || ctx.searching) return 'recite';
    if (ctx.view === 'listen') return 'listen';
    if (!LISTEN_ON.has(ctx.status) || ctx.source === 'recite') return 'recite';
    if (ctx.mode === 'hide' || ctx.mode === 'blind') return 'recite';
    if (ctx.status === 'paused' && ctx.seen !== true) return 'recite';
    return 'listen';
  }

  /** Issue #19 (D4): picking Hidden or Blind stops a Listen playback, playing or paused (the car's Recite is none). */
  function modeStopsListen(mode, status, source) {
    return mode !== 'show' && LISTEN_ON.has(status) && source !== 'recite';
  }

  /** The listen bar for a player status: the microphone button's icon and tooltip, and whether ■ stop shows. */
  function listenBar(status) {
    if (status === 'playing' || status === 'loading') return {start: 'pause', title: 'Pause', stop: true};
    if (status === 'paused') return {start: 'play', title: 'Resume', stop: true};
    return {start: 'play', title: 'Play the range', stop: false};
  }

  /** U1.13 (user, 2026-10-04): the mushaf follows the ayah being played, only when the clip changes (a page turned by
   *  hand stays until the next ayah; a new pass alone does not move it). prev = the clip followed last ({key, index} or
   *  null), s = the player state. Returns null (nothing to do: not playing, the car's Recite, the same clip, an empty
   *  Android state) or {clip: {key, index} (the new prev), page (0: unknown, e.g. Android car Surahs plans: ask
   *  `locate`), locate: {surah, ayah >= 1} (the basmala's page is its surah's ayah 1), ayah: {surah, ayah} to highlight,
   *  null for the basmala (ayah 0)}. */
  function listenFollow(prev, s) {
    if (!s || s.source === 'recite' || !(s.status === 'playing' || s.status === 'loading')) return null;
    const surah = +s.surah || 0, ayah = +s.ayah || 0;
    if (!s.key && !surah) return null;
    const clip = {key: s.key || '', index: s.index == null ? null : +s.index};
    if (prev && prev.key === clip.key && prev.index === clip.index) return null;
    return {clip, page: +s.page || 0, locate: surah ? {surah, ayah: Math.max(1, ayah)} : null,
      ayah: surah && ayah ? {surah, ayah} : null};
  }

  // ---------------------------------------------------------------- U1.12 About: the versions (user, 2026-10-04)
  /** engine.call('versions') = {app, platform, items: [[name, version]...], profile} (B3.8) -> the title's version
   *  ("0.6.0" reads 0.6, like Android's versionName) and the profile folder (Settings). Issue #25 (v0.13, user: "delete
   *  the details Python … Android 16 (API 36) not needed anymore"): `platform` and `items` are no longer shown.
   *  v null (an older engine without `versions`): both empty. */
  function versionsText(v) {
    v = v && typeof v === 'object' ? v : {};
    return {app: String(v.app || '').replace(/^(\d+\.\d+)\.0$/, '$1'), profile: v.profile ? String(v.profile) : ''};
  }

  // ---------------------------------------------------------------- U1.1 / U1.1b display modes (user, 2026-10-04)
  const FITS = ['page', 'width', 'free'];
  const FIT_INFO = {page: {icon: 'fitpage', name: 'Fit page'}, width: {icon: 'fitwidth', name: 'Fit width'},
    free: {icon: 'fitfree', name: 'Own size'}};
  const FONT_MAX = 72;       // Own size: at most 72 px (user, 2026-10-04)
  const FIT_CAP = 64;        // Fit page / Fit width never grow past 64 px (a wide PC window)
  const LINE_EM = 1.95;      // one Madani line needs 1.95 em (the marks above / below)

  /** settings.fit, cleaned: 'page' (the 15 lines in the box, the default), 'width' or 'free'. */
  function normalizeFit(f) { return FITS.includes(f) ? f : 'page'; }

  /** The display button (V): Fit page -> Fit width -> Own size -> Fit page. */
  function nextFit(f) { return FITS[(FITS.indexOf(normalizeFit(f)) + 1) % FITS.length]; }

  /** The display button's icon (the ICON table of index.html) and the mode's name (tooltip, toast). */
  function fitInfo(f) { return FIT_INFO[normalizeFit(f)]; }

  /** The mushaf font of a display mode. o = {fit, availW, availH (the box without padding nor scrollbar), maxW (the
   *  widest Madani line measured at `ref` px, the minimal gaps included), nLines (15), ref, fontPx (settings.font_px),
   *  scrollbar (px a scrollbar takes: 0 on phones)}. Fit page: the widest line fits the width and the lines fit the
   *  height (U1.1b, 9-64 px); Fit width: the width only (minus the scrollbar once the lines overflow the height), never
   *  below Fit page; Own
   *  size: the saved size (nothing saved yet: 1.5x Fit page), never below the Fit page size of this page on this screen
   *  and at most 72 px (user, 2026-10-04). Returns {font, min (the Fit page size)}. */
  function fitFont(o) {
    const ref = o.ref || 40, maxW = Math.max(1, o.maxW), lines = (o.nLines || 15) * LINE_EM;
    const fontW = ref * o.availW / maxW;
    const page = Math.max(9, Math.min(fontW, o.availH / lines, FIT_CAP));
    const fit = normalizeFit(o.fit);
    if (fit === 'width') {
      let w = Math.min(fontW, FIT_CAP);
      if (o.scrollbar > 0 && w * lines > o.availH) w = Math.min(ref * (o.availW - o.scrollbar) / maxW, FIT_CAP);
      return {font: Math.max(page, w), min: page};   // at the Fit page size nothing scrolls: never smaller than it
    }
    if (fit === 'free') {
      const own = +o.fontPx > 0 ? +o.fontPx : defaultOwnSize(page);
      return {font: clamp(own, page, FONT_MAX), min: page};
    }
    return {font: page, min: page};
  }

  /** The default Own size (settings.font_px_default, D10 2026-10-10): the first Own size ever computed, 1.5x the Fit
   *  page size `min`, within [min, 72]. */
  function defaultOwnSize(min) { return clamp(Math.round(min * 1.5), min, FONT_MAX); }

  const TEXT_SLACK = 0.08;   // #43: the text block may be 8 % wider than its widest line (a little air between words)
  // #43 review: and at least 24 em wide (the 95th percentile of a page's widest line: 23.5 em), so the block keeps one
  // width on nearly every page turn instead of following each page's widest line; a wider page widens it
  const TEXT_STEADY_EM = 24;
  /** #43 (user, 2026-10-25: "on a large screen like web or tablet, there might be too much space between words so I
   *  think it makes sense to center the text rather than having too much space"): the width cap of the mushaf's text
   *  block, which the page centres. o = {fit, maxW (the widest Madani line at `ref` px, the minimal gaps included, as
   *  for fitFont), ref, font (the size in use), availW (the box)}. Fit page / Fit width: the widest line's natural
   *  width at that font plus 8 %, when that is narrower than the box; 0 (no cap: the box's width) otherwise: a phone in
   *  portrait, whose font fills the width with that line, and always in Own size (its words flow and wrap: a justified
   *  line spreads by less than one word, a narrower block would only shorten its lines) or without a measure. */
  function textWidthCap(o) {
    o = o || {};
    if (normalizeFit(o.fit) === 'free') return 0;
    const maxW = +o.maxW, ref = +o.ref || 40, font = +o.font, availW = +o.availW;
    if (!(maxW > 1) || !(font > 0) || !(availW > 0)) return 0;
    const cap = Math.max(TEXT_STEADY_EM * font, maxW * font / ref) * (1 + TEXT_SLACK);
    return cap < availW ? cap : 0;
  }

  /** D10 (user, 2026-10-10: "half a gesture = +1, a whole one at most +4"): the whole pixels a two-finger pinch adds,
   *  from the finger distance ratio r = d1 / d0: sign(ln r) * min(4, round(4 * (|ln r| / ln 3)^2.6)); a whole gesture
   *  (3x apart) = 4 px, half of it = 1 px whether half is 1.73x (log scale) or 2x (half the finger travel; review
   *  2026-10-11: the square gave 2 px there), 2.5x = 2 px, under 1.6x nothing (v0.7 scaled the size by r: 1.5x apart was
   *  +10 px). */
  function pinchStep(ratio) {
    const r = +ratio;
    if (!(r > 0) || !Number.isFinite(r)) return 0;
    const x = Math.abs(Math.log(r)) / Math.log(3), n = Math.min(4, Math.round(4 * Math.pow(x, 2.6)));
    return n === 0 ? 0 : (r > 1 ? n : -n);
  }

  /** A two-finger pinch in Own size: the size at its start f0 (whole pixels) plus pinchStep(d1 / d0), never below `min`
   *  (the Fit page size) nor above `max`; live while pinching (the toast says "Text size 34 px"). */
  function pinchFont(f0, d0, d1, min, max) {
    const lo = Math.ceil(min - 1e-9), hi = Math.floor(max || FONT_MAX);
    return clamp(Math.round(f0) + (d0 > 0 && d1 > 0 ? pinchStep(d1 / d0) : 0), lo, hi);
  }

  /** D10: Ctrl + wheel (a PC touchpad's pinch, a mouse wheel): 1 px per 100 of deltaY accumulated over one gesture (a
   *  mouse notch), at most 4; wheel up (negative) = larger. A gesture ends after WHEEL_GAP_MS without a wheel event. */
  const WHEEL_GAP_MS = 600;
  function wheelStep(acc) {
    const n = Math.min(4, Math.floor(Math.abs(+acc || 0) / 100));
    return n === 0 ? 0 : (acc < 0 ? n : -n);
  }

  /** A wheel event's deltaY in pixels (Firefox reports lines, 3 per notch, or pages). */
  function wheelPixels(deltaY, deltaMode) { return (+deltaY || 0) * (deltaMode === 1 ? 100 / 3 : deltaMode === 2 ? 800 : 1); }

  /** D10 (user, 2026-10-10): "Text size 24 px · before 23 px · default 30 px" (before = the size when the gesture
   *  started, default = settings.font_px_default; each one only when known). */
  function sizeToast(size, before, def) {
    const px = (v) => `${Math.round(v)} px`;
    const out = [`Text size ${px(size)}`];
    if (before > 0) out.push(`before ${px(before)}`);
    if (def > 0) out.push(`default ${px(def)}`);
    return out.join(' · ');
  }

  // ---------------------------------------------------------------- X2.15 voice commands, page side (user, 2026-10-04)
  const VOICE_TOAST = {next: 'Voice: next word', eyah: 'Voice: rest of the ayah', replay: 'Voice: replay'};

  /** What the page does with a state's `voice` (B3.8: {name, via, heard, t0, t1, words: [i_from, i_to] | null, before},
   *  once): the engine already applied next / eyah (hint / skip_to). {act: 'play' (Yasser plays session words words[0]
   *  .. words[1], one ayah), 'before' (#36: the session's cue, `before`), 'stop' (as ■), 'pause' (as ❚❚) or 'none';
   *  words; toast}. next / eyah play only with ctx.revealAudio (settings.reveal_audio); replay always plays. #36 (user,
   *  2026-10-23: "when I just started a recite session and I say directly aawedha … it should play the Eya before this
   *  page, but if a new sourat starts at the beginning of this page then just say the sourat name"): a replay before the
   *  first word plays the cue the engine sends with it (the ayah before, the surah's name, or the words before a found
   *  place); an engine without one: "Nothing recited yet to replay." */
  function voiceAction(v, ctx) {
    ctx = ctx || {};
    const name = v && v.name;
    const words = v && Array.isArray(v.words) && v.words.length === 2 ? [+v.words[0], +v.words[1]] : null;
    const none = {act: 'none', words: null, toast: VOICE_TOAST[name] || null};
    if (name === 'stop' || name === 'pause') return {act: name, words: null, toast: null};
    // #36 (v0.16, user 2026-10-25: "since I didn't start yet, it is better to start with a line hint rather than showing
    // a word and counting it as a mistake … I directly say kalima, you read the hint. Then I say kalima again, you read
    // and show the next word"): a next or a replay with no words and a cue (B3.8 `before`) is the cue, whatever the
    // Reciter audio setting; the next's toast says the second one shows the word
    const b = v && v.before;
    if ((name === 'replay' || name === 'next') && !words && b && typeof b === 'object' && b.kind) {
      const toast = b.kind === 'surah' ? `Voice: ${b.name} begins here`
        : b.kind === 'ayah' ? `Voice: ${b.surah}:${b.ayah}, the ayah before`
        : name === 'next' ? 'Voice: the words before' : VOICE_TOAST.replay;
      return {act: 'before', words: null, before: b, toast: name === 'next' ? toast + ' (say it again for the word)' : toast};
    }
    if (name === 'replay') {
      if (words) return {act: 'play', words, toast: VOICE_TOAST.replay};
      return {act: 'none', words: null, toast: 'Nothing recited yet to replay.'};
    }
    if ((name === 'next' || name === 'eyah') && words && ctx.revealAudio !== false) return {act: 'play', words, toast: none.toast};
    return none;
  }

  /** #36: what the page plays for a cue (`before`, B3.8: {kind: 'ayah' | 'words', clip} or {kind: 'surah', name, text,
   *  fallback}; clip / fallback = reciter_clip answers): [{clip}] (Yasser's clip as the engine gave it), or for a
   *  surah's first ayah [{speak: text, fallback}] when the device has an offline Arabic voice (ctx.tts:
   *  engine.speaker.available(); the page plays the fallback when speaking fails), else [{clip: fallback}] (the
   *  basmala, the ta'awwudh for Al-Fatihah and At-Tawbah). [] for nothing playable. */
  function cueSteps(before, ctx) {
    const b = before && typeof before === 'object' ? before : {};
    if (b.kind === 'ayah' || b.kind === 'words') return b.clip ? [{clip: b.clip}] : [];
    if (b.kind !== 'surah') return [];
    if (ctx && ctx.tts && b.text) return [{speak: String(b.text), fallback: b.fallback || null}];
    return b.fallback ? [{clip: b.fallback}] : [];
  }

  // ---------------------------------------------------------------- X2.4b the revealed word is on screen (user, 2026-10-09)
  /** [from, to] (session word indices) of the words a state revealed, for the page to show: the reply to ◂ / ⏮ (hint /
   *  skip_to without i: `revealed`, B3.8) or a voice next / eyah (`voice.words`); null otherwise (a replay plays the
   *  ayah so far but reveals nothing: the page must not jump back to its first word). */
  function revealedRange(msg) {
    const pair = (r) => Array.isArray(r) && r.length === 2 ? [+r[0], +r[1]] : null;
    if (!msg) return null;
    if (msg.reply_to === 'hint' || msg.reply_to === 'skip_to') return pair(msg.revealed);
    const v = msg.voice;
    return v && (v.name === 'next' || v.name === 'eyah') ? pair(v.words) : null;
  }

  /** Outside a session: the page's word indices ◂ ('word') / ⏮ ('ayah') reveal. hidden[k] = word k of the page is not
   *  visible yet; ayahs = the page's [{start, n}]. ◂: the first hidden word, with the joined parts of its written word
   *  after it (joined[j], the page words' `joined`; U1.1e, #22); ⏮: from it to the end of its ayah on this page. []
   *  when every word is visible (the page then opens the next page and reveals there). */
  function revealIndices(kind, hidden, ayahs, joined) {
    const k = (hidden || []).indexOf(true);
    if (k < 0) return [];
    if (kind !== 'ayah') {
      // U1.1e (#22): the whole written word: its joined parts after k too (joined[j]: page word j has no written word
      // of its own, the word before it holds it)
      const out = [k];
      for (let j = k + 1; joined && joined[j]; j++) out.push(j);
      return out;
    }
    const a = (ayahs || []).find(x => k >= x.start && k < x.start + x.n);
    const end = a ? a.start + a.n : k + 1, out = [];
    for (let j = k; j < end; j++) out.push(j);
    return out;
  }

  // ---------------------------------------------------------------- U1.1e one slot per written word (v0.12, #22)
  /** A page word with no written word of its own (`joined`, B3.8; a page without the flag: an empty html), that follows
   *  the word before it in the same ayah (يَٰبَنِىَّ = يا + بني: the 2nd spoken word is drawn inside the 1st one). */
  function joinsPrevious(w, prev) {
    if (!w || !prev || w.surah !== prev.surah || w.ayah !== prev.ayah || w.idx !== prev.idx + 1) return false;
    return w.joined != null ? !!w.joined : !String(w.html || '').trim();
  }

  /** The page's written words: [[page index, ...], ...], one group per span the page draws, in order: a joined word
   *  goes with the word before it (same ayah, the previous index), a word without its partner (first in the range)
   *  gets its own group (defensive: the data never starts a line or a page with one). start / n: a line run (default:
   *  the whole list). */
  function writtenGroups(words, start, n) {
    words = words || [];
    const lo = start == null ? 0 : +start, hi = n == null ? words.length : Math.min(words.length, lo + +n);
    const out = [];
    for (let k = lo; k < hi; k++) {
      if (out.length && joinsPrevious(words[k], words[k - 1])) out[out.length - 1].push(k);
      else out.push([k]);
    }
    return out;
  }

  /** U1.5 (D1, review of v0.12): the text that names a written word in a list: its parts' Uthmani joined, g = its page
   *  indices (L.writtenGroups). The joined part has none of its own in 367 places (يَٰبَنِىَّ + ""), its own in two
   *  (2:181, 13:37: بَعْدَ + مَا = بَعْدَمَا). recite.app.written_text is the same rule. */
  function writtenText(words, g) {
    return (g || []).map(k => (words && words[k] && words[k].uthmani) || '').join('');
  }

  const HIST_RANK = {' h-green': 1, ' h-orange': 2, ' h-red': 3};
  /** How the page draws a written word from its parts (one per spoken word, in order): {key, visible, bar ('lost' |
   *  'confirming' | null, L.placeholderKind), mistake, missing, lost, hinted, confirming, lastBad (no verdict on
   *  screen, its newest reading is a mistake), hist (histClass)}. visible only when every part is visible (no clue for
   *  the 2nd part); a bar while it is hidden and any part is a bar (red 'lost' wins over taupe); a colour when any part
   *  has it; the worst history glow; focus = the part a tap opens (the first with a bar, a mistake or being confirmed,
   *  else the first whose newest reading is a mistake, else the first); keys = every part's key. */
  function groupView(parts) {
    parts = parts || [];
    const any = (f) => parts.some(p => !!(p && p[f]));
    const visible = parts.length > 0 && parts.every(p => p && p.visible);
    const bars = visible ? [] : parts.filter(p => p && p.bar);
    const bar = !bars.length ? null : (bars.some(p => p.bar === 'lost') ? 'lost' : 'confirming');
    let hist = '';
    for (const p of parts) { const h = (p && p.hist) || ''; if ((HIST_RANK[h] || 0) > (HIST_RANK[hist] || 0)) hist = h; }
    let focus = parts.findIndex(p => p && (p.bar || p.mistake || p.confirming));
    if (focus < 0) focus = parts.findIndex(p => p && p.lastBad);   // review of v0.12 (#22): outside a session
    focus = Math.max(0, focus);
    return {visible, bar, mistake: any('mistake'), missing: any('missing'), lost: any('lost'), hinted: any('hinted'),
      confirming: any('confirming'), hist, focus, keys: parts.map(p => p && p.key)};
  }

  /** The scroll that shows newly revealed words in a scrolling display mode (Fit width, Own size). o = {top, bottom
   *  (content px of the first revealed word's top and the last one's bottom), scrollTop, view (the box's visible
   *  height), maxScroll, line (one text line, px)}. Hidden below, or on the last visible line: down just enough to
   *  show its line and one more under it (user: "that line or even 2"); hidden above: up, one line above it; the
   *  first revealed word never leaves the top. Returns the new scrollTop, or null when nothing has to move. */
  function revealScroll(o) {
    let t = o.scrollTop;
    if (o.bottom + o.line > o.scrollTop + o.view) t = Math.min(o.bottom + o.line - o.view, o.top);
    else if (o.top < o.scrollTop) t = o.top - o.line;
    t = clamp(t, 0, Math.max(0, o.maxScroll));
    return Math.abs(t - o.scrollTop) < 1 ? null : t;
  }

  // ---------------------------------------------------------------- R6.6 / X2.18 one loudness (user, 2026-10-10)
  /** The mistake click's peak gain (same shape as before: 1050 -> 680 Hz, 4 ms up, down by 75 ms): 0.12 * 10^((-18 -
   *  (-33.4)) / 20) = 0.71, i.e. its energy over 100 ms equals the -18 LUFS of Yasser's clips and of the replay (D9).
   *  The car's MistakeTone.PEAK (ReciteProgress.kt) is the same. */
  const CLICK_PEAK = 0.7;

  // ---------------------------------------------------------------- U1.5 / U1.1d the session browser (user, 2026-10-10)
  const LONG_PRESS_MS = 500, LONG_PRESS_SLOP = 10;

  /** D11: the long press on ✗ n without breaking its tap (pointer events). state = {down, x, y, fired}; ev = {type:
   *  'down' (x, y) | 'move' (x, y) | 'timer' (LONG_PRESS_MS after 'arm') | 'up' | 'cancel' | 'click'}. Returns {state,
   *  action}: 'arm' (start the timer), 'disarm' (clear it: released, or moved more than LONG_PRESS_SLOP px), 'long' (open
   *  the summary), 'swallow' (the click that ends a long press), 'tap' (toggle total / page) or 'none'. A new pointerdown
   *  forgets a long press whose click never came (Chrome on Android often fires none). */
  function pressStep(state, ev) {
    const s = Object.assign({down: false, fired: false}, state || {});
    ev = ev || {};
    const out = (action) => ({state: s, action});
    switch (ev.type) {
      case 'down': s.down = true; s.fired = false; s.x = +ev.x || 0; s.y = +ev.y || 0; return out('arm');
      case 'move':
        if (s.down && Math.hypot((+ev.x || 0) - s.x, (+ev.y || 0) - s.y) > LONG_PRESS_SLOP) { s.down = false; return out('disarm'); }
        return out('none');
      case 'timer':
        if (!s.down) return out('none');
        s.down = false; s.fired = true; return out('long');
      case 'up': case 'cancel':
        if (!s.down) return out('none');
        s.down = false; return out('disarm');
      case 'click':
        if (s.fired) { s.fired = false; return out('swallow'); }
        return out('tap');
      default: return out('none');
    }
  }

  /** D11: the summary box's bottom row ◀ older session · ↺ Reset · ▶ newer session, from the session's nav{older, newer,
   *  index, count} (B3.8 done / session_load). During a session (running, paused, starting, searching, stopping) all
   *  three are greyed. Returns {older, newer, reset}: {on, title} each. */
  function summaryNav(nav, ctx) {
    ctx = ctx || {};
    const btn = (on, title) => ({on: !!on, title});
    if (ctx.running || ctx.paused || ctx.starting || ctx.searching || ctx.stopping) {
      const t = 'Stop the session first';
      return {older: btn(false, t), newer: btn(false, t), reset: btn(false, t)};
    }
    const n = nav || {};
    return {older: btn(n.older, n.older ? 'Older session' : 'No older session'),
      newer: btn(n.newer, n.newer ? 'Newer session' : 'This is the newest session'),
      reset: btn(true, 'Reset the page: verdicts, counters and revealed words (R); saved sessions stay')};
  }

  /** "yyyy-mm-dd hh:mm" of a session: from its started_at (ISO) or its folder name ("yyyy-mm-dd hh-mm-ss sourah ..."). */
  function sessionWhen(startedAt, folder) {
    for (const v of [startedAt, folder]) {
      const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2})[:-](\d{2})/.exec(String(v || ''));
      if (m) return `${m[1]} ${m[2]}:${m[3]}`;
    }
    return '';
  }

  /** D11: the summary box's header. Live: "Live summary (not saved yet)"; a finished or loaded session: "Session of
   *  yyyy-mm-dd hh:mm · n min · k of N" (each part when known; nav.index counts from 0, the oldest saved session);
   *  a session too short to be saved says so. */
  function summaryHead(m, live) {
    if (live) return 'Live summary (not saved yet)';
    m = m || {};
    if (!m.folder) return 'Session finished (too short to be saved)';
    const when = sessionWhen(m.started_at, m.folder), parts = [when ? `Session of ${when}` : 'Saved session'];
    const d = +m.duration_s;
    if (m.duration_s != null && Number.isFinite(d)) parts.push(d < 60 ? `${Math.round(d)} s` : `${Math.round(d / 60)} min`);
    const nav = m.nav;
    if (nav && nav.count > 0 && nav.index != null && nav.index >= 0) parts.push(`${+nav.index + 1} of ${nav.count}`);
    return parts.join(' · ');
  }

  // ---------------------------------------------------------------- U1.16 report a bug (user, 2026-10-10; D3 v0.9)
  /** D3 (v0.9, user #8, 2026-10-11: a screenshot and an issue naming the app version, the screenshot and the session,
   *  nothing attached): the toast once the issue page is on its way. o = {android, text (Kotlin's answer), shot (the
   *  screenshot's answer {ok, name, folder}), opened (PC: the window of the click went to the issue), url}. Android: its
   *  answer's text ("Screenshot <name> saved in Download/Meddeb. Describe the bug on the GitHub page."), else the same
   *  from the screenshot; PC: the page that opened, else a link to it (the window was blocked). Returns {text, link}. */
  function reportToast(o) {
    o = o && typeof o === 'object' ? o : {};
    if (o.android) {
      if (o.text) return {text: String(o.text), link: null};
      const shot = o.shot && o.shot.ok && o.shot.name
        ? `Screenshot ${o.shot.name} saved in ${o.shot.folder || 'Download/Meddeb'}. ` : 'No screenshot. ';
      return {text: shot + 'Describe the bug on the GitHub page.', link: null};
    }
    if (o.opened) return {text: 'Describe the bug on the GitHub page that opened.', link: null};
    return {text: 'Describe the bug on the GitHub page:', link: o.url ? {href: String(o.url), text: 'open the new issue'} : null};
  }

  // ---------------------------------------------------------------- U1.17 Settings > Space used (issue #14, 2026-10-13)
  /** A size in decimal units like Android's settings ("999 B", "12.3 KB", "12.3 MB", "123 MB", "1.4 GB"). */
  function formatBytes(n) {
    n = Math.max(0, +n || 0);
    if (n < 1000) return `${Math.round(n)} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let u = -1;
    do { n /= 1000; u++; } while (n >= 999.5 && u < units.length - 1);   // 999.6 KB would round to "1000 KB"
    return (n < 99.95 ? n.toFixed(1) : String(Math.round(n))) + ' ' + units[u];
  }

  const STORAGE_MAIN = ['listen_audio', 'recordings', 'history'];
  const STORAGE_OTHER = ['model', 'app', 'profile_other', 'screenshots', 'old_reports', 'backups'];
  const STORAGE_OPTIONAL = new Set(['screenshots', 'old_reports', 'backups']);   // shown only when they hold something
  const STORAGE_NAMES = {listen_audio: 'Listen audio', recordings: 'Your recordings', history: 'Mistake history',
    model: 'Speech model', app: 'Meddeb app and its data', profile_other: 'Settings and logs',
    screenshots: 'Bug report screenshots', old_reports: 'Old bug reports (Meddeb 0.8)',
    backups: 'Profile copies (import and export)'};
  const nOf = (k, one, many) => `${k} ${k === 1 ? one : (many || one + 's')}`;

  function storageDetail(r) {
    const f = +r.files || 0;
    switch (r.id) {
      case 'listen_audio': return `Yasser Al-Dossary's ayah files kept for Listen and the voice commands (${nOf(f, 'file')}). Deleted files download again when they are played.`;
      case 'recordings': return `Your voice (${nOf(f, 'recording')}${r.orphans ? `, ${r.orphans} without their session` : ''}). Deleting keeps your verdicts, the history and Progress; the sessions can no longer be replayed.`;
      case 'history': return `The verdicts of ${nOf(+r.sessions || 0, 'session')} and ${nOf(+r.marks || 0, 'mark')}: Progress, the word colours, the Listen buttons and the corrections Meddeb learned from you come from them.`;
      case 'model': return 'Needed to recite; Meddeb would download it again by itself.';
      case 'app': return "The app itself, its Python and Qur'an data, and Android's caches.";
      case 'profile_other': return "Your settings (never deleted here) and Meddeb's diagnostics log.";
      case 'screenshots': return `Taken by the report button (${nOf(f, 'file')}), in Download/Meddeb.`;
      case 'old_reports': return `Bug report files of Meddeb 0.8 (${nOf(f, 'file')}); they hold copies of a recording, your marks and settings.`;
      case 'backups': return `Your profile as it was before an import (${nOf(+r.folders || 0, 'copy', 'copies')})`
        + (r.export_bytes ? ' and the copy of your last export kept on the phone' : '') + ', recordings included.';
    }
    return '';
  }

  /** storage's answer (+ the engine kind) -> {total, totalBytes, label, main, other, note, error}; a row = {id, name,
   *  detail, bytes, size, deletable, canDelete, blocked}. Unknown ids are ignored; the optional rows at 0 bytes are
   *  hidden; the recordings and the history cannot be deleted while a recitation is not saved, Listen audio while
   *  Listen plays or is paused. The PC counts its profile only. */
  function storageView(answer, kind) {
    const a = answer && typeof answer === 'object' ? answer : {};
    const byId = new Map((Array.isArray(a.rows) ? a.rows : []).filter(r => r && STORAGE_NAMES[r.id]).map(r => [r.id, r]));
    let totalBytes = 0;
    const view = (id) => {
      const r = byId.get(id);
      if (!r) return null;
      const bytes = Math.max(0, +r.bytes || 0);
      totalBytes += bytes;
      if (STORAGE_OPTIONAL.has(id) && !bytes) return null;
      const blocked = !r.deletable ? null
        : a.recording && (id === 'recordings' || id === 'history') ? 'Stop the recitation first'
        : id === 'listen_audio' && a.listen_active ? 'Stop Listen first' : null;
      return {id, name: STORAGE_NAMES[id], detail: storageDetail(r), bytes, size: formatBytes(bytes),
        deletable: !!r.deletable, canDelete: !!r.deletable && bytes > 0 && !blocked, blocked,
        files: +r.files || 0, sessions: +r.sessions || 0, marks: +r.marks || 0, folders: +r.folders || 0,
        orphans: +r.orphans || 0, exportBytes: +r.export_bytes || 0};
    };
    const main = STORAGE_MAIN.map(view).filter(Boolean), other = STORAGE_OTHER.map(view).filter(Boolean);
    const pc = kind === 'http';
    return {totalBytes, total: formatBytes(totalBytes), label: pc ? 'Space used by your profile' : 'Space used',
      main, other,
      note: pc ? 'On the PC, Listen plays the files from EveryAyah and keeps none (your browser has its own cache).' : '',
      error: a.error ? String(a.error) : ''};
  }

  const UNDO = ' This cannot be undone. Export the profile first (Settings > Profile) to keep a copy.';

  /** The question before a delete (U1.17): what goes, what stays. */
  function storageConfirmText(row) {
    const s = row.size;
    switch (row.id) {
      case 'listen_audio': return `Delete the Listen audio (${s}, ${nOf(row.files, 'file')})? Yasser Al-Dossary's ayat download again when they are played (internet needed).`;
      case 'recordings': return `Delete your recordings (${s}, ${nOf(row.files, 'recording')})? Your verdicts, the history and Progress stay, but the sessions can no longer be replayed.` + UNDO;
      case 'history': return `Delete your mistake history (${s}: ${nOf(row.sessions, 'session')}, ${nOf(row.marks, 'mark')})? Progress, the word colours, the Listen buttons and the corrections Meddeb learned from you start again from zero. Your recordings stay on the device (and in an export), but Meddeb can no longer replay or browse those sessions. Your settings stay.` + UNDO;
      case 'screenshots': return `Delete the bug report screenshots (${s}, ${nOf(row.files, 'file')})? Only Meddeb's own screenshots are deleted.`;
      case 'old_reports': return `Delete the old bug reports (${s}, ${nOf(row.files, 'file')})? They hold copies of a recording, your marks and settings.` + UNDO;
      case 'backups': return `Delete the profile copies (${s})? They are your profile as it was before an import`
        + (row.exportBytes ? ', and the copy of your last export kept on the phone (the file you sent stays where you sent it)' : '')
        + ', recordings included.' + UNDO;
    }
    return `Delete ${row.name} (${s})?`;
  }

  /** The toast after a delete: {text, error}. */
  function storageDoneText(r, row) {
    const name = row ? row.name : 'It';
    if (!r || r.ok === false) return {text: `Not deleted: ${String((r && r.reason) || 'no reason given').replace(/[.\s]+$/, '')}.`, error: true};
    const kept = r.kept ? ` ${nOf(+r.kept, 'file')} in use ${+r.kept === 1 ? 'was' : 'were'} kept.` : '';
    return {text: `${name} deleted: ${formatBytes(r.bytes)} freed.${kept}`, error: false};
  }

  // ---------------------------------------------------------------- P5.16 / U1.18 the app update (issue #12, 2026-10-13)
  const UPDATE_OFFERED = new Set(['available', 'downloading', 'verifying', 'permission', 'ready', 'installing', 'failed']);
  const mb1 = (b) => (Math.max(0, +b || 0) / 1e6).toFixed(1);
  // #32 review: About's auto update text per Kotlin step (update_state's auto_step); 'wait_background' / 'install' only
  // for a 'ready' download (updateView)
  const AUTO_STEP_TEXT = new Map([['wait_wifi', ' Auto update waits for Wi-Fi.'],
    ['wait_session', ' Auto update waits for the end of the recitation.'], ['wait_listen', ' Auto update waits for Listen to stop.'],
    ['gave_up', ' Auto update gave up on this version: press Update.']]);

  /** Kotlin's update_state u -> {menu ('' = no line), required, show (About's block), text, notes, bar (null | 0-100),
   *  button (null | {label, action: start | check | settings}), cancel, link}. A check of an offer already known
   *  keeps it on screen (" (checking…)"). */
  function updateView(u) {
    u = u && typeof u === 'object' ? u : {};
    const st = String(u.state || 'idle'), cur = String(u.current || ''), lat = u.latest == null ? '' : String(u.latest);
    const label = lat ? `Update ${cur} → ${lat}` : '';
    const offered = !!lat && UPDATE_OFFERED.has(st);
    const pct = clamp(Math.round(+u.pct || 0), 0, 100);
    const why0 = String(u.error == null ? '' : u.error).trim().replace(/[.\s]+$/, '');
    const why = why0.charAt(0).toUpperCase() + why0.slice(1);   // a sentence of its own after "verified."
    const out = {menu: offered ? (st === 'downloading' ? `${label} · ${pct} %` : label) : '', required: offered && !!u.required,
      show: st !== 'idle' || !!u.checking, text: '', notes: [], bar: null, button: null, cancel: false,
      link: u.page_url ? String(u.page_url) : null};
    const notes = Array.isArray(u.notes) ? u.notes.map(String).filter(Boolean).slice(0, 10) : [];
    // #32: with Auto update on Wi-Fi ticked About says what it waits for. Review: worded from Kotlin's step (auto_step,
    // AutoStep in lowercase), not from the setting alone ("waits for Wi-Fi" showed on Wi-Fi and after it gave up);
    // none, a download starting or no step (an older app): nothing
    // (re-review: only while the setting is on: Kotlin's last step stays stale until its next tick after an untick)
    const step = u.auto === true ? String(u.auto_step || '') : '';
    const autoText = AUTO_STEP_TEXT.get(step) || (st === 'ready' && (step === 'wait_background' || step === 'install')
      ? ' It installs when you leave Meddeb.' : '');
    switch (st) {
      case 'up_to_date': out.text = 'Meddeb is up to date.'; break;
      case 'check_failed': out.text = `Could not check for updates${why0 ? ': ' + why0 : ''}.`; out.button = {label: 'Check again', action: 'check'}; break;
      case 'available': out.text = `Meddeb ${lat} is available (${mb1(u.size)} MB).` + (u.required ? ` Meddeb ${cur} is no longer supported: please update.` : '')
        + autoText;
        out.notes = notes; out.button = {label, action: 'start'}; break;
      case 'downloading': out.text = `Downloading Meddeb ${lat}: ${pct} % (${mb1(u.bytes)} of ${mb1(u.total)} MB)`; out.bar = pct; out.cancel = true; break;
      case 'verifying': out.text = 'Checking the download…'; out.bar = 100; break;
      case 'permission': out.text = 'Android asks once: allow Meddeb to install its updates (Install unknown apps > Allow from this source), then come back.';
        out.button = {label: 'Open the setting', action: 'settings'}; break;
      case 'ready': out.text = `Meddeb ${lat} is downloaded and verified.` + (why ? ` ${why}.` : '')
        + autoText; out.button = {label: 'Install', action: 'start'}; break;
      case 'installing': out.text = `Installing Meddeb ${lat}: Meddeb closes while Android updates it` + (u.notify ? '; a notification opens it again' : '')
        + '. Your profile and the speech model stay.'; break;
      case 'failed': out.text = `The update failed${why0 ? ': ' + why0 : ''}.`; out.button = {label: 'Try again', action: 'start'}; break;
      case 'needs_android': out.text = `Meddeb ${lat} needs Android ${u.min_android} or newer.`; break;
      case 'other_key': out.text = `Meddeb ${lat} is signed with another key than this app (a test build?): it cannot update it.`; break;
      default: out.text = '';
    }
    if (u.checking) out.text = out.text && offered ? out.text + ' (checking…)' : 'Checking for updates…';
    if (!out.text) out.show = false;
    return out;
  }

  /** A toast: the first start after an update (once: ctx.toldUpdated), or a failure of a download or install the user
   *  started, once per failure (u.seq vs ctx.toldSeq) and only away from About (About says it). */
  function updateToast(u, ctx) {
    u = u || {}; ctx = ctx || {};
    if (u.just_updated_from && !ctx.toldUpdated) return {text: `Meddeb updated: ${u.just_updated_from} → ${u.current}.`, error: false, ms: 4000, kind: 'updated'};
    if (u.state === 'failed' && u.trigger === 'press' && ctx.view !== 'about' && u.seq !== ctx.toldSeq)
      return {text: `The update failed: ${String(u.error || '').replace(/[.\s]+$/, '')}.`, error: true, ms: null, kind: 'failed'};
    return null;
  }

  /** #32 (user, 2026-10-22: "a checkbox for the auto update on wifi and if checked it will ask directly for the right
   *  to Install apps because that will be needed"): Settings › Updates › Auto update on Wi-Fi after an update_state u
   *  (Kotlin's, with `permission` = Android lets Meddeb install apps). saved = the settings (auto_update), asking = the
   *  page asked Android for that permission when the box was ticked and the user is back. -> {checked (the box),
   *  turnOff (save auto_update false), toast}: on without the permission unticks itself (back from the question: "stays
   *  off"; later, the permission withdrawn: "was turned off"); on with it: "is on" right after the question; off, or
   *  the permission unknown (no state yet, an older app): left as it is. */
  function autoUpdateAfter(saved, u, asking) {
    const on = !!saved && saved.auto_update === true;
    const keep = {checked: on, turnOff: false, toast: null};
    if (!on || !u || typeof u !== 'object' || u.permission == null) return keep;
    if (u.permission === false) {
      return {checked: false, turnOff: true, toast: asking
        ? 'Auto update on Wi-Fi stays off: Android did not allow Meddeb to install apps.'
        : 'Auto update on Wi-Fi was turned off: Android no longer allows Meddeb to install apps.'};
    }
    return asking ? {checked: true, turnOff: false, toast: 'Auto update on Wi-Fi is on.'} : keep;
  }

  /** The question before a download on mobile data (null: no question; nothing left to download: none). */
  function updateConfirm(u) {
    u = u || {};
    if (!u.metered || !['available', 'failed'].includes(u.state)) return null;
    const left = Math.max(0, (+u.size || 0) - (+u.bytes || 0));
    return left > 0 ? `Download the update (${mb1(left)} MB) over mobile data?` : null;
  }

  const api = {isMistake, sessionRemoveAction, lastOutcome, removeLabel, stateAfterMark, historyAfterMark, markWhen, swipePage,
    pullDown, pullUp, starterHintAvailable, starterHintLines, cueStarterHint,
    reviewOn, reviewCounters, reviewCardView, reviewCueKeys, reviewTargetLast, reviewNextState, reviewResultView,
    DOUBLE_TAP_MS, POP_DELAY_MS, wordTapStep, contextMistake, doubleTapPlan, startAyah,
    DEFAULT_SORT, normalizeSortState, nextSortState, sortProgressRows, progressSurahLabels, daysAgoText,
    statusLabel, summaryVerdict, shownHeard, readingText, shouldFollowCursor, isOutsideTap, mergeIndexMap,
    LISTEN_DEFAULT, clampListenForm, listenParams, playsText, listenFormFromTarget, nowPlayingText, linkLicenceFiles, centreLines,
    listenOptionsOn, listenPlayOptions, mulberry32, passShape, marginSteps, passClips, fadeVolume,
    modelStep, modelDownloadView, toastMs, startAfterModel, wordVisible, modeChangeEffect, levelClass, newLearnedLine, statsTodayLines,
    progressChecks, dayText, averageWindowText, slopeText, finishText, PACE_WINDOWS, normalizePaceWindow,
    paceWindowText, paceLines, STATS_LINES, STATS_CHART, statsChartSvg,
    statsPointAt, statsPointText, LISTEN_ON, barMode, modeStopsListen,
    listenBar, listenFollow,
    versionsText, FITS, FONT_MAX, normalizeFit, nextFit, fitInfo, fitFont, textWidthCap, pinchFont, voiceAction, cueSteps,
    revealedRange, revealIndices, revealScroll, joinsPrevious, writtenGroups, writtenText, groupView,
    confirming, unsaidMistake, placeholderKind, ayahMarkerShown, sessionOutcome, wordState, sessionRevealMsg, barSignals,
    defaultOwnSize, pinchStep, WHEEL_GAP_MS, wheelStep, wheelPixels, sizeToast, CLICK_PEAK,
    LONG_PRESS_MS, LONG_PRESS_SLOP, pressStep, summaryNav, summaryHead, reportToast,
    formatBytes, STORAGE_MAIN, STORAGE_OTHER, storageView, storageConfirmText, storageDoneText,
    updateView, updateToast, updateConfirm, autoUpdateAfter};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MeddebLogic = api;
})(typeof window !== 'undefined' ? window : this);
