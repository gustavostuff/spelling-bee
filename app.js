(() => {
  const DEFAULT_WORDS = [
    "above","absence","accident","ancestor","angel","article","American","armies","bacteria","believes",
    "becoming","border","bread","breathe","brief","build","Canada","cannon","carried","carrying",
    "carnival","creature","continue","culture","costume","couple","comparison","dampness","design","develop",
    "disease","discuss","education","effect","England","English","everyone","favored","father","fellow",
    "fluid","freeway","fried","fruits","furniture","Forty-two","generation","gift","good-bye","golden",
    "government","grade","guardian","guess","harbor","hamburger","harmful","hunger","hurry","history",
    "income","ignorant","indeed","informal","island","January","journey","join","judge","jump",
    "kangaroo","Kansas","ketchup","kingdom","kindness","kitchen","king","lava","level","leader",
    "liar","library","lives","loaves","lightning","lunch","master","machine","meat","mother",
    "motorcycle","messages","move","moving","nature","natural","nation","neighbor","neither","non toxic",
    "nonsense","novel","orange","old","Olympic","oxen","parts","particular","participant","percent",
    "pioneer","politician","protect","quiet","remark","remote","scene","solemn","talk","temperature",
    "theater","tray","tomatoes","travel","Tuesday","unable","uncomfortable","urgent","valley","violin",
    "violent","virus","vitamin","warning","walked","Wednesday","weather","wishes","wool","wondered",
    "wrong","yard","yardstick","yesterday","yours","zebra","zero","zipper","zig-zag","zoom",
  ];

  const MIN_RANGE_WORDS = 10;
  const MAX_RANGE_WORDS = 150;
  const GRID_ROWS = 10;
  const GRID_COLS = 15;

  const WORDS = Array.isArray(globalThis.__WORDS_OVERRIDE__) && globalThis.__WORDS_OVERRIDE__.length > 0
    ? globalThis.__WORDS_OVERRIDE__.map((w) => String(w))
    : DEFAULT_WORDS;

  const PASTELS = [
    [0.98, 0.78, 0.82],
    [0.80, 0.93, 0.98],
    [0.82, 0.98, 0.86],
    [0.98, 0.92, 0.75],
    [0.90, 0.82, 0.98],
    [0.98, 0.86, 0.72],
    [0.80, 0.98, 0.96],
    [0.96, 0.80, 0.98],
  ];

  const STORAGE_KEY = "spelling_stats_v1";
  const RANGE_STORAGE_KEY = "spelling_range_v1";
  const SESSION_SHOWN_KEY = "spelling_session_shown_v1";

  const el = {
    word: document.getElementById("word"),
    counts: document.getElementById("counts"),
    toast: document.getElementById("toast"),
    rangeForm: document.getElementById("rangeForm"),
    rangeStart: document.getElementById("rangeStart"),
    rangeEnd: document.getElementById("rangeEnd"),
    rangeSummary: document.getElementById("rangeSummary"),
    btnCorrect: document.getElementById("btnCorrect"),
    btnWrong: document.getElementById("btnWrong"),
    btnReset: document.getElementById("btnReset"),
    btnHardest: document.getElementById("btnHardest"),
    hardestPanel: document.getElementById("hardestPanel"),
    hardestList: document.getElementById("hardestList"),
  };

  const defaultStat = () => ({ correct: 0, wrong: 0 });

  function loadStats() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stats = {};
    for (const w of WORDS) stats[w] = defaultStat();

    if (!raw) {
      saveStats(stats);
      return stats;
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const w of WORDS) {
          const st = parsed[w];
          if (st && typeof st === "object") {
            stats[w] = {
              correct: Number(st.correct) || 0,
              wrong: Number(st.wrong) || 0,
            };
          }
        }
      }
    } catch {
      saveStats(stats);
    }

    return stats;
  }

  function saveStats(stats) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  }

  function saveRange(range) {
    localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(range));
  }

  function loadSessionShownCounts() {
    const raw = sessionStorage.getItem(SESSION_SHOWN_KEY);
    if (!raw) return {};

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};

      const counts = {};
      for (const w of WORDS) {
        counts[w] = Math.max(0, Number(parsed[w]) || 0);
      }
      return counts;
    } catch {
      return {};
    }
  }

  function saveSessionShownCounts(counts) {
    sessionStorage.setItem(SESSION_SHOWN_KEY, JSON.stringify(counts));
  }

  function markShown(word) {
    sessionShownCounts[word] = (sessionShownCounts[word] || 0) + 1;
    saveSessionShownCounts(sessionShownCounts);
  }

  function hashWord(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h >>> 0;
  }

  function colorForWord(word) {
    const h = hashWord(word.toLowerCase());
    const idx = h % PASTELS.length;
    const [r, g, b] = PASTELS[idx];
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  }

  function clamp(x, a, b) {
    return Math.max(a, Math.min(b, x));
  }

  function normalizeRange(start, end) {
    const max = WORDS.length;
    let s = Math.round(Number(start));
    let e = Math.round(Number(end));

    if (!Number.isFinite(s)) s = 1;
    if (!Number.isFinite(e)) e = max;

    s = clamp(s, 1, max);
    e = clamp(e, 1, max);

    if (s > e) [s, e] = [e, s];

    const minSpan = Math.min(MIN_RANGE_WORDS, max);
    const maxSpan = Math.min(MAX_RANGE_WORDS, max);

    let span = e - s + 1;
    if (span > maxSpan) {
      e = Math.min(max, s + maxSpan - 1);
      span = e - s + 1;
    }
    if (span < minSpan) {
      e = Math.min(max, s + minSpan - 1);
      span = e - s + 1;
      if (span < minSpan) {
        s = Math.max(1, e - minSpan + 1);
      }
    }

    return { start: s, end: e };
  }

  function loadRange() {
    const raw = localStorage.getItem(RANGE_STORAGE_KEY);
    if (!raw) return { start: 1, end: WORDS.length };

    try {
      const parsed = JSON.parse(raw);
      return normalizeRange(parsed?.start, parsed?.end);
    } catch {
      return { start: 1, end: WORDS.length };
    }
  }

  function getActiveWords(range) {
    return WORDS.slice(range.start - 1, range.end);
  }

  function syncRangeUI() {
    el.rangeStart.min = "1";
    el.rangeEnd.min = "1";
    el.rangeStart.max = String(WORDS.length);
    el.rangeEnd.max = String(WORDS.length);
    el.rangeStart.value = String(range.start);
    el.rangeEnd.value = String(range.end);

    const amount = range.end - range.start + 1;
    el.rangeSummary.textContent = `Range: ${range.start}-${range.end} (${amount} words)`;
  }

  function weightForWord(stats, word) {
    const st = stats[word] || defaultStat();
    const base = 1.0;
    const wrongBoost = 0.70 * (st.wrong || 0);
    const correctDampen = 0.10 * (st.correct || 0);

    let raw = base + wrongBoost - correctDampen;
    raw = clamp(raw, 1.0, 20.0);
    return Math.pow(raw, 0.65);
  }

  /** Words with correct >= wrong (including 0–0 and ties) may appear at most twice per session. */
  function isNeutralOrPositiveScore(st) {
    const c = Number(st.correct) || 0;
    const w = Number(st.wrong) || 0;
    return c >= w;
  }

  function isSessionCapped(stats, word) {
    const st = stats[word] || defaultStat();
    if (!isNeutralOrPositiveScore(st)) return false;
    return (sessionShownCounts[word] || 0) >= 2;
  }

  function getEligiblePool(stats, pool) {
    const filtered = pool.filter((w) => !isSessionCapped(stats, w));
    return filtered.length ? filtered : pool;
  }

  function pickNextWord(stats, pool) {
    if (!pool.length) return WORDS[0];
    const eligiblePool = getEligiblePool(stats, pool);

    let total = 0;
    for (const w of eligiblePool) total += weightForWord(stats, w);

    let r = Math.random() * total;
    for (const w of eligiblePool) {
      r -= weightForWord(stats, w);
      if (r <= 0) return w;
    }
    return eligiblePool[eligiblePool.length - 1];
  }

  /** @type {HTMLTableCellElement[] | null} */
  let wordGridCells = null;

  function buildWordGrid() {
    const tbody = document.getElementById("wordGridBody");
    if (!tbody) return;

    tbody.innerHTML = "";
    wordGridCells = [];

    for (let r = 0; r < GRID_ROWS; r++) {
      const tr = document.createElement("tr");
      for (let c = 0; c < GRID_COLS; c++) {
        const td = document.createElement("td");
        const i = r * GRID_COLS + c;
        if (i < WORDS.length) {
          td.title = WORDS[i];
        }
        tr.appendChild(td);
        wordGridCells.push(td);
      }
      tbody.appendChild(tr);
    }
  }

  function syncWordGrid() {
    if (!wordGridCells) return;

    for (let i = 0; i < wordGridCells.length; i++) {
      const td = wordGridCells[i];
      if (i >= WORDS.length) {
        td.title = "";
        td.className = "wg-pad";
        continue;
      }

      const w = WORDS[i];
      td.title = w;
      const st = stats[w] || defaultStat();
      const c = st.correct;
      const wr = st.wrong;

      if (c === 0 && wr === 0) {
        td.className = "wg-none";
      } else if (wr > c) {
        td.className = "wg-bad";
      } else if (c > wr) {
        td.className = "wg-good";
      } else {
        td.className = "wg-tie";
      }
    }
  }

  function syncWordGridStats() {
    let moreWrong = 0;
    let moreCorrect = 0;
    let bothZero = 0;
    for (const w of WORDS) {
      const st = stats[w] || defaultStat();
      const c = Number(st.correct) || 0;
      const wr = Number(st.wrong) || 0;
      if (c === 0 && wr === 0) bothZero += 1;
      else if (wr > c) moreWrong += 1;
      else if (c > wr) moreCorrect += 1;
    }

    const elWrong = document.getElementById("wordGridStatMoreWrong");
    const elCorrect = document.getElementById("wordGridStatMoreCorrect");
    const elZero = document.getElementById("wordGridStatBothZero");
    if (elWrong) elWrong.textContent = String(moreWrong);
    if (elCorrect) elCorrect.textContent = String(moreCorrect);
    if (elZero) elZero.textContent = String(bothZero);
  }

  function toast(text, ms = 900) {
    el.toast.textContent = text;
    el.toast.classList.remove("hidden");
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => {
      el.toast.classList.add("hidden");
    }, ms);
  }

  let stats = loadStats();
  let range = loadRange();
  let sessionShownCounts = loadSessionShownCounts();
  let currentWord = pickNextWord(stats, getActiveWords(range));
  markShown(currentWord);

  function render() {
    syncRangeUI();
    el.word.textContent = currentWord;
    el.word.style.color = colorForWord(currentWord);

    const st = stats[currentWord] || defaultStat();
    el.counts.textContent = `Correct: ${st.correct}   Wrong: ${st.wrong}`;
    syncWordGrid();
    syncWordGridStats();
  }

  function nextWord() {
    currentWord = pickNextWord(stats, getActiveWords(range));
    markShown(currentWord);
    render();
  }

  function applyRangeFromUI() {
    const wasHardestOpen = !el.hardestPanel.classList.contains("hidden");
    range = normalizeRange(el.rangeStart.value, el.rangeEnd.value);
    saveRange(range);
    toast(`Range set: ${range.start}-${range.end}`, 1100);

    if (!getActiveWords(range).includes(currentWord)) {
      nextWord();
    } else {
      render();
    }

    if (wasHardestOpen) showHardest();
  }

  function record(isCorrect) {
    const st = stats[currentWord] || defaultStat();
    if (isCorrect) {
      st.correct += 1;
      toast("Saved: CORRECT");
    } else {
      st.wrong += 1;
      toast("Saved: WRONG");
    }
    stats[currentWord] = st;
    saveStats(stats);
    nextWord();
  }

  function resetAll() {
    stats = {};
    for (const w of WORDS) stats[w] = defaultStat();
    saveStats(stats);
    toast("Stats reset", 1200);
    nextWord();
    hideHardest();
  }

  function showHardest() {
    const arr = getActiveWords(range)
      .map((w) => ({ w, ...stats[w] }))
      .sort((a, b) => (b.wrong - a.wrong) || (a.correct - b.correct));

    el.hardestList.innerHTML = "";
    const top = arr.slice(0, 10);
    for (const item of top) {
      const li = document.createElement("li");
      li.textContent = `${item.w} (wrong: ${item.wrong}, correct: ${item.correct})`;
      el.hardestList.appendChild(li);
    }
    el.hardestPanel.classList.remove("hidden");
  }

  function hideHardest() {
    el.hardestPanel.classList.add("hidden");
  }

  // Buttons
  el.btnCorrect.addEventListener("click", () => record(true));
  el.btnWrong.addEventListener("click", () => record(false));
  el.rangeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    applyRangeFromUI();
  });

  // Reset button: confirmation dialog (no keyboard reset)
  el.btnReset.addEventListener("click", () => {
    const ok = confirm("Reset all stats? This cannot be undone.");
    if (!ok) return;
    resetAll();
  });

  el.btnHardest.addEventListener("click", () => {
    if (el.hardestPanel.classList.contains("hidden")) showHardest();
    else hideHardest();
  });

  // Keyboard (no reset binding)
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    const k = e.key.toLowerCase();
    if (k === "c") record(true);
    else if (k === "w") record(false);
  });

  buildWordGrid();
  render();
})();
