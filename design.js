/* Session construction for the image translation 2AFC study. Pure functions, no DOM,
 * so the same code runs in the browser and in node (tests/test_design.js).
 *
 * The trial list is fixed in trials.json (same inputs and method pairs for every
 * participant, chosen once by scripts/select_stimuli.py). Per participant we only
 * shuffle the order and randomize which method appears as option A (left) or B (right).
 * Consecutive trials never come from the same task, so the question changes often
 * enough that participants read it, and never repeat a long run of one task.
 */
(function (root) {
  "use strict";

  function makeRng(seed) {
    // mulberry32; seeded only in tests, the browser uses Math.random
    if (seed === undefined) return Math.random;
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function placeSides(t, rng) {
    const flip = rng() < 0.5;
    const a = flip ? t.pair[1] : t.pair[0];
    const b = flip ? t.pair[0] : t.pair[1];
    return {
      trial_id: t.trial_id, task: t.task, source: t.source, target: t.target, input: t.input,
      left_method: a, right_method: b, left_src: t.outputs[a], right_src: t.outputs[b],
    };
  }

  function noSameTaskInARow(seq) {
    for (let i = 1; i < seq.length; i++) if (seq[i].task === seq[i - 1].task) return false;
    return true;
  }

  function buildSession(data, rng) {
    const base = data.trials.map((t) => placeSides(t, rng));
    // Random order without two trials of the same task in a row: draw the next task
    // at random (weighted by how many of its trials are left, never the previous one),
    // then take that task's next trial from its own shuffled list. Restart on a dead end.
    for (let attempt = 0; attempt < 1000; attempt++) {
      const byTask = {};
      shuffle(base.slice(), rng).forEach((t) => (byTask[t.task] = byTask[t.task] || []).push(t));
      const seq = [];
      let last = null;
      for (;;) {
        const tasks = Object.keys(byTask).filter((k) => byTask[k].length && k !== last);
        if (!tasks.length) break;
        const total = tasks.reduce((n, k) => n + byTask[k].length, 0);
        let r = rng() * total, pick = tasks[tasks.length - 1];
        for (const k of tasks) { r -= byTask[k].length; if (r < 0) { pick = k; break; } }
        seq.push(byTask[pick].pop());
        last = pick;
      }
      if (seq.length === base.length) return seq;
    }
    return shuffle(base.slice(), rng);
  }

  const api = { makeRng, shuffle, buildSession, noSameTaskInARow };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StudyDesign = api;
})(typeof window !== "undefined" ? window : this);
