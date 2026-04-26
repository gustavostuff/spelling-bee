"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

class StorageMock {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed));
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

class ClassListMock {
  constructor(initial = []) {
    this.set = new Set(initial);
  }

  add(name) {
    this.set.add(name);
  }

  remove(name) {
    this.set.delete(name);
  }

  contains(name) {
    return this.set.has(name);
  }
}

class ElementMock {
  constructor(id, classes = []) {
    this.id = id;
    this.textContent = "";
    this.value = "";
    this.min = "";
    this.max = "";
    this.style = {};
    this.children = [];
    this.classList = new ClassListMock(classes);
    this.listeners = {};

    let html = "";
    Object.defineProperty(this, "innerHTML", {
      get() {
        return html;
      },
      set(v) {
        html = String(v);
        if (html === "") this.children = [];
      },
    });
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  appendChild(node) {
    this.children.push(node);
    return node;
  }

  trigger(type, event = {}) {
    const handler = this.listeners[type];
    if (!handler) return;

    if (typeof event.preventDefault !== "function") {
      event.preventDefault = () => {};
    }
    handler(event);
  }
}

function buildDefaultStats(words) {
  const stats = {};
  for (const w of words) stats[w] = { correct: 0, wrong: 0 };
  return stats;
}

function createMathMock(sequence) {
  const values = Array.isArray(sequence) && sequence.length ? sequence.slice() : [0];
  let i = 0;

  const math = Object.create(Math);
  math.random = () => {
    const idx = Math.min(i, values.length - 1);
    i += 1;
    return values[idx];
  };

  return math;
}

function createHarness({ mockWords, initialStats, initialRange, initialSessionShown, randomSequence }) {
  const localStorage = new StorageMock();
  const sessionStorage = new StorageMock();

  if (initialStats) {
    localStorage.setItem("spelling_stats_v1", JSON.stringify(initialStats));
  }
  if (initialRange) {
    localStorage.setItem("spelling_range_v1", JSON.stringify(initialRange));
  }
  if (initialSessionShown) {
    sessionStorage.setItem("spelling_session_shown_v1", JSON.stringify(initialSessionShown));
  }

  const elements = {
    word: new ElementMock("word"),
    counts: new ElementMock("counts"),
    toast: new ElementMock("toast", ["hidden"]),
    rangeForm: new ElementMock("rangeForm"),
    rangeStart: new ElementMock("rangeStart"),
    rangeEnd: new ElementMock("rangeEnd"),
    rangeSummary: new ElementMock("rangeSummary"),
    btnCorrect: new ElementMock("btnCorrect"),
    btnWrong: new ElementMock("btnWrong"),
    btnReset: new ElementMock("btnReset"),
    btnHardest: new ElementMock("btnHardest"),
    hardestPanel: new ElementMock("hardestPanel", ["hidden"]),
    hardestList: new ElementMock("hardestList"),
    wordGridBody: new ElementMock("wordGridBody"),
    wordGridStatMoreWrong: new ElementMock("wordGridStatMoreWrong"),
    wordGridStatMoreCorrect: new ElementMock("wordGridStatMoreCorrect"),
    wordGridStatBothZero: new ElementMock("wordGridStatBothZero"),
  };

  let anonCounter = 0;
  const document = {
    getElementById(id) {
      if (!elements[id]) throw new Error(`Missing mocked element: ${id}`);
      return elements[id];
    },
    createElement(tag) {
      anonCounter += 1;
      return new ElementMock(`${tag}-${anonCounter}`);
    },
  };

  const windowListeners = {};
  let timerId = 0;
  const windowObj = {
    addEventListener(type, handler) {
      windowListeners[type] = handler;
    },
    setTimeout() {
      timerId += 1;
      return timerId;
    },
    clearTimeout() {},
    __emit(type, event = {}) {
      const handler = windowListeners[type];
      if (!handler) return;
      handler(event);
    },
  };

  const context = {
    console,
    document,
    window: windowObj,
    localStorage,
    sessionStorage,
    confirm: () => true,
    Math: createMathMock(randomSequence),
    setTimeout: windowObj.setTimeout,
    clearTimeout: windowObj.clearTimeout,
    __WORDS_OVERRIDE__: mockWords,
  };

  context.globalThis = context;
  windowObj.window = windowObj;
  windowObj.setTimeout = windowObj.setTimeout.bind(windowObj);
  windowObj.clearTimeout = windowObj.clearTimeout.bind(windowObj);

  return {
    context,
    elements,
    localStorage,
    sessionStorage,
    window: windowObj,
    runApp() {
      const appPath = path.join(__dirname, "app.js");
      const code = fs.readFileSync(appPath, "utf8");
      vm.runInNewContext(code, context, { filename: "app.js" });
    },
  };
}

/** Enough `Math.random()` draws for a long interaction test (each call consumes one value). */
function randomZeros(n) {
  return Array.from({ length: n }, () => 0);
}

function parseStats(localStorage) {
  return JSON.parse(localStorage.getItem("spelling_stats_v1"));
}

function parseSession(sessionStorage) {
  return JSON.parse(sessionStorage.getItem("spelling_session_shown_v1"));
}

function sampleInitialSelections({
  mockWords,
  initialStats,
  initialRange = { start: 1, end: mockWords.length },
  sampleSize = 400,
}) {
  const counts = {};
  for (const w of mockWords) counts[w] = 0;

  for (let i = 0; i < sampleSize; i += 1) {
    const randomValue = (i + 0.5) / sampleSize;
    const harness = createHarness({
      mockWords,
      initialStats,
      initialRange,
      initialSessionShown: {},
      randomSequence: [randomValue],
    });
    harness.runApp();
    counts[harness.elements.word.textContent] += 1;
  }

  return counts;
}

function runCoreFlowTest() {
  const mockWords = [
    "ant",
    "bat",
    "cat",
    "dog",
    "eel",
    "fox",
    "goat",
    "hawk",
    "ibis",
    "jay",
    "kiwi",
    "lion",
    "mole",
    "newt",
    "owl",
  ];

  const stats = buildDefaultStats(mockWords);
  stats.ant = { correct: 3, wrong: 0 };

  const harness = createHarness({
    mockWords,
    initialStats: stats,
    initialRange: { start: 1, end: 10 },
    initialSessionShown: {},
    randomSequence: [0],
  });

  harness.runApp();

  const { elements, localStorage, sessionStorage, window } = harness;

  assert.strictEqual(elements.word.textContent, "ant", "Initial word should be first in range");
  assert.strictEqual(elements.rangeSummary.textContent, "Range: 1-10 (10 words)");

  elements.btnCorrect.trigger("click");
  assert.strictEqual(
    elements.word.textContent,
    "ant",
    "Neutral-or-positive score: word may appear twice in a session before cap"
  );
  let sessionCounts = parseSession(sessionStorage);
  assert.strictEqual(sessionCounts.ant, 2, "Session show count should reach 2 for that word");

  elements.btnWrong.trigger("click");
  assert.strictEqual(
    elements.word.textContent,
    "bat",
    "After two session appearances, neutral/positive words are excluded when others exist"
  );
  sessionCounts = parseSession(sessionStorage);
  assert.strictEqual(sessionCounts.ant, 2, "Capped word should stop increasing session count when alternatives exist");

  elements.rangeStart.value = "14";
  elements.rangeEnd.value = "3";
  elements.rangeForm.trigger("submit", { preventDefault() {} });
  assert.strictEqual(elements.rangeSummary.textContent, "Range: 3-14 (12 words)", "Range should normalize and swap");
  assert.ok(mockWords.slice(2, 14).includes(elements.word.textContent), "Word should stay within normalized range");

  elements.rangeStart.value = "3";
  elements.rangeEnd.value = "12";
  elements.rangeForm.trigger("submit", { preventDefault() {} });
  assert.strictEqual(elements.rangeSummary.textContent, "Range: 3-12 (10 words)");
  assert.strictEqual(elements.word.textContent, "cat", "Random selection should use narrowed range");

  elements.btnWrong.trigger("click");
  let savedStats = parseStats(localStorage);
  assert.strictEqual(savedStats.cat.wrong, 1, "Wrong click should increment wrong count");

  window.__emit("keydown", { key: "c", repeat: false });
  savedStats = parseStats(localStorage);
  assert.strictEqual(savedStats.cat.correct, 1, "Keyboard shortcut should increment correct count");

  elements.btnHardest.trigger("click");
  assert.strictEqual(elements.hardestPanel.classList.contains("hidden"), false, "Hardest panel should open");
  assert.ok(elements.hardestList.children.length > 0, "Hardest list should render rows");
  assert.ok(elements.hardestList.children[0].textContent.startsWith("cat "), "Hardest list should sort by wrong desc and correct asc");

  elements.btnReset.trigger("click");
  savedStats = parseStats(localStorage);
  for (const w of mockWords) {
    assert.strictEqual(savedStats[w].correct, 0, `Reset should clear correct for ${w}`);
    assert.strictEqual(savedStats[w].wrong, 0, `Reset should clear wrong for ${w}`);
  }
  assert.strictEqual(elements.hardestPanel.classList.contains("hidden"), true, "Reset should hide hardest panel");
  assert.strictEqual(elements.counts.textContent, "Correct: 0   Wrong: 0", "Counts display should reset");
}

function runSessionCapPositiveOrTieTest() {
  const mockWords = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa"];
  const stats = buildDefaultStats(mockWords);
  stats.alpha = { correct: 1, wrong: 1 };

  const harness = createHarness({
    mockWords,
    initialStats: stats,
    initialRange: { start: 1, end: 10 },
    initialSessionShown: {},
    randomSequence: randomZeros(40),
  });
  harness.runApp();

  const { elements, sessionStorage } = harness;
  assert.strictEqual(elements.word.textContent, "alpha", "Tie score (1,1) is neutral-or-positive: first pick is list head");

  elements.btnCorrect.trigger("click");
  assert.strictEqual(elements.word.textContent, "alpha", "Second session appearance still allowed");
  assert.strictEqual(parseSession(sessionStorage).alpha, 2, "alpha should have been shown exactly twice so far");

  elements.btnCorrect.trigger("click");
  assert.strictEqual(
    elements.word.textContent,
    "beta",
    "After two appearances, tie/positive word must leave the eligible pool when other words exist"
  );
  assert.strictEqual(parseSession(sessionStorage).alpha, 2, "alpha session count should not grow past cap threshold");
}

function runSessionCapStrugglingNotCappedTest() {
  const mockWords = ["struggle", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const stats = buildDefaultStats(mockWords);
  stats.struggle = { correct: 0, wrong: 4 };

  const harness = createHarness({
    mockWords,
    initialStats: stats,
    initialRange: { start: 1, end: 10 },
    initialSessionShown: {},
    randomSequence: randomZeros(40),
  });
  harness.runApp();

  const { elements, sessionStorage } = harness;

  for (let k = 0; k < 5; k += 1) {
    assert.strictEqual(
      elements.word.textContent,
      "struggle",
      `Wrong>correct should not session-cap: iteration ${k}`
    );
    elements.btnWrong.trigger("click");
  }

  const sess = parseSession(sessionStorage);
  assert.ok(
    sess.struggle >= 5,
    `struggle should accumulate many session shows when wrong>correct (${JSON.stringify(sess)})`
  );
}

function runSessionCapAllCappedFallbackTest() {
  const mockWords = ["onlyA", "onlyB"];
  const stats = buildDefaultStats(mockWords);
  stats.onlyA = { correct: 1, wrong: 0 };
  stats.onlyB = { correct: 1, wrong: 0 };

  const harness = createHarness({
    mockWords,
    initialStats: stats,
    initialRange: { start: 1, end: 2 },
    initialSessionShown: { onlyA: 2, onlyB: 2 },
    randomSequence: randomZeros(20),
  });
  harness.runApp();

  const { elements } = harness;
  assert.ok(
    mockWords.includes(elements.word.textContent),
    "When every word in range is session-capped, pool should fall back to full range"
  );
}

function runWrongBiasDistributionTest() {
  const mockWords = ["steady", "needsPractice"];
  const stats = buildDefaultStats(mockWords);
  stats.needsPractice = { correct: 0, wrong: 5 };

  const counts = sampleInitialSelections({
    mockWords,
    initialStats: stats,
    sampleSize: 800,
  });

  assert.ok(
    counts.needsPractice > counts.steady * 1.8,
    `Word with wrong > correct should be selected much more often (${JSON.stringify(counts)})`
  );
}

function runUniformDistributionTest() {
  const mockWords = ["alpha", "beta", "gamma", "delta"];
  const stats = buildDefaultStats(mockWords);
  const sampleSize = 400;
  const expected = sampleSize / mockWords.length;

  const counts = sampleInitialSelections({
    mockWords,
    initialStats: stats,
    sampleSize,
  });

  for (const w of mockWords) {
    assert.strictEqual(
      counts[w],
      expected,
      `Equal-weight pool should split selections evenly for ${w} (${JSON.stringify(counts)})`
    );
  }
}

try {
  runCoreFlowTest();
  runSessionCapPositiveOrTieTest();
  runSessionCapStrugglingNotCappedTest();
  runSessionCapAllCappedFallbackTest();
  runWrongBiasDistributionTest();
  runUniformDistributionTest();
  console.log("PASS test.js: core flow, session caps, weighted/uniform checks");
} catch (err) {
  console.error("FAIL test.js");
  throw err;
}
