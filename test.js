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

function parseStats(localStorage) {
  return JSON.parse(localStorage.getItem("spelling_stats_v1"));
}

function parseSession(sessionStorage) {
  return JSON.parse(sessionStorage.getItem("spelling_session_shown_v1"));
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
  ];

  const stats = buildDefaultStats(mockWords);
  stats.ant = { correct: 3, wrong: 0 };

  const harness = createHarness({
    mockWords,
    initialStats: stats,
    initialRange: { start: 1, end: 5 },
    initialSessionShown: {},
    randomSequence: [0],
  });

  harness.runApp();

  const { elements, localStorage, sessionStorage, window } = harness;

  assert.strictEqual(elements.word.textContent, "ant", "Initial word should be first in range");
  assert.strictEqual(elements.rangeSummary.textContent, "Range: 1-5 (5 words)");

  elements.btnCorrect.trigger("click");
  assert.strictEqual(elements.word.textContent, "ant", "Mastered word can still appear up to 2 times");
  let sessionCounts = parseSession(sessionStorage);
  assert.strictEqual(sessionCounts.ant, 2, "Mastered word should have been shown twice");

  elements.btnWrong.trigger("click");
  assert.strictEqual(elements.word.textContent, "bat", "Mastered word should be capped after 2 shows");
  sessionCounts = parseSession(sessionStorage);
  assert.strictEqual(sessionCounts.ant, 2, "Capped word should stop increasing when alternatives exist");

  elements.rangeStart.value = "9";
  elements.rangeEnd.value = "2";
  elements.rangeForm.trigger("submit", { preventDefault() {} });
  assert.strictEqual(elements.rangeSummary.textContent, "Range: 2-9 (8 words)", "Range should normalize and swap");
  assert.ok(mockWords.slice(1, 9).includes(elements.word.textContent), "Word should stay within normalized range");

  elements.rangeStart.value = "3";
  elements.rangeEnd.value = "6";
  elements.rangeForm.trigger("submit", { preventDefault() {} });
  assert.strictEqual(elements.rangeSummary.textContent, "Range: 3-6 (4 words)");
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

try {
  runCoreFlowTest();
  console.log("PASS test.js: core spelling app flow with 10 mocked words");
} catch (err) {
  console.error("FAIL test.js");
  throw err;
}
