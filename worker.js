/* Runs the checks and both redesigns off the main thread so the page stays responsive. */
importScripts("engine.js");
const E = self.SeismicEngine;

self.onmessage = (ev) => {
  const { input, softwareState } = ev.data;
  try {
    const step = (msg) => self.postMessage({ type: "progress", msg });
    step("Checking the initial design");
    const initial = E.evaluate(input);
    step("Refined redesign (doubly reinforced, exact capacities)");
    const refined = E.redesign({ ...input, options: { ...input.options, conservative: false } });
    step("Textbook redesign for comparison");
    const simple = E.redesign({ ...input, options: { ...input.options, conservative: true } });
    const soft = softwareState ? E.evaluate(softwareState) : null;
    self.postMessage({ type: "done", initial, refined, simple, soft });
  } catch (e) {
    self.postMessage({ type: "error", message: e.message });
  }
};
