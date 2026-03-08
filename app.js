(() => {
  const WORDS = [
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
    "nonsense","novel"
  ];

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

  function pickNextWord(stats, pool) {
    if (!pool.length) return WORDS[0];

    let total = 0;
    for (const w of pool) total += weightForWord(stats, w);

    let r = Math.random() * total;
    for (const w of pool) {
      r -= weightForWord(stats, w);
      if (r <= 0) return w;
    }
    return pool[pool.length - 1];
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
  let currentWord = pickNextWord(stats, getActiveWords(range));

  function render() {
    syncRangeUI();
    el.word.textContent = currentWord;
    el.word.style.color = colorForWord(currentWord);

    const st = stats[currentWord] || defaultStat();
    el.counts.textContent = `Correct: ${st.correct}   Wrong: ${st.wrong}`;
  }

  function nextWord() {
    currentWord = pickNextWord(stats, getActiveWords(range));
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

  render();
})();
