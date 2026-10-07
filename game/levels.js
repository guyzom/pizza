/* Nine stage schedules, shared by gameplay and validation. */
(function (root) {
  "use strict";
  // Stage schedule. `at` is a fraction 0..1 of course length.
  function S(world, name, seconds, enemies, pickups, boss) {
    return { world, name, seconds, enemies, pickups, boss: boss || null };
  }
  const STAGES = [
    S(1, "שביל הפארק", 24, [
      { at: 0.20, lane: 1, type: "scout" }, { at: 0.34, lane: 0, type: "scout" },
      { at: 0.50, lane: 2, type: "scout" }, { at: 0.66, lane: 1, type: "scout" },
      { at: 0.80, lane: 0, type: "scout" },
    ], [
      { at: 0.12, lane: 0 }, { at: 0.22, lane: 2 }, { at: 0.30, lane: 1 }, { at: 0.42, lane: 2, gold: true },
      { at: 0.56, lane: 0 }, { at: 0.62, lane: 1 }, { at: 0.74, lane: 2 }, { at: 0.88, lane: 1, gold: true },
    ]),
    S(1, "מסלול הפרחים", 26, [
      { at: 0.18, lane: 1, type: "scout" }, { at: 0.32, lane: 2, type: "hopper" },
      { at: 0.46, lane: 0, type: "scout" }, { at: 0.60, lane: 1, type: "bomber" },
      { at: 0.74, lane: 2, type: "scout" }, { at: 0.86, lane: 0, type: "hopper" },
    ], [
      { at: 0.10, lane: 2 }, { at: 0.24, lane: 0 }, { at: 0.38, lane: 1, gold: true },
      { at: 0.52, lane: 2 }, { at: 0.66, lane: 0 }, { at: 0.80, lane: 1 }, { at: 0.90, lane: 2, gold: true },
    ]),
    S(1, "בוס ברוקולי", 30, [
      { at: 0.22, lane: 0, type: "scout" }, { at: 0.40, lane: 2, type: "scout" },
      { at: 0.58, lane: 1, type: "hopper" },
    ], [
      { at: 0.14, lane: 1 }, { at: 0.30, lane: 2, gold: true }, { at: 0.46, lane: 0 }, { at: 0.64, lane: 1 },
    ], { hp: 4, name: "ברוקולי ענק" }),
    S(2, "המטבח", 26, [
      { at: 0.16, lane: 1, type: "scout" }, { at: 0.30, lane: 0, type: "bomber" },
      { at: 0.44, lane: 2, type: "hopper" }, { at: 0.58, lane: 1, type: "scout" },
      { at: 0.72, lane: 0, type: "scout" }, { at: 0.86, lane: 2, type: "bomber" },
    ], [
      { at: 0.10, lane: 2 }, { at: 0.24, lane: 0, gold: true }, { at: 0.40, lane: 1 }, { at: 0.54, lane: 2 },
      { at: 0.68, lane: 0 }, { at: 0.82, lane: 1, gold: true },
    ]),
    S(2, "הסירים", 28, [
      { at: 0.18, lane: 2, type: "hopper" }, { at: 0.32, lane: 1, type: "bomber" },
      { at: 0.46, lane: 0, type: "scout" }, { at: 0.60, lane: 2, type: "hopper" },
      { at: 0.74, lane: 1, type: "scout" }, { at: 0.88, lane: 0, type: "bomber" },
    ], [
      { at: 0.12, lane: 1 }, { at: 0.28, lane: 0 }, { at: 0.44, lane: 2, gold: true }, { at: 0.62, lane: 1 },
      { at: 0.78, lane: 0, gold: true }, { at: 0.90, lane: 2 },
    ]),
    S(2, "שף ברוקולי", 32, [
      { at: 0.20, lane: 0, type: "bomber" }, { at: 0.38, lane: 2, type: "hopper" },
      { at: 0.56, lane: 1, type: "scout" },
    ], [
      { at: 0.14, lane: 1, gold: true }, { at: 0.34, lane: 2 }, { at: 0.52, lane: 0, gold: true }, { at: 0.68, lane: 1 },
    ], { hp: 5, name: "שף ברוקולי" }),
    S(3, "הגגות", 28, [
      { at: 0.16, lane: 1, type: "hopper" }, { at: 0.30, lane: 0, type: "hopper" },
      { at: 0.44, lane: 2, type: "bomber" }, { at: 0.58, lane: 1, type: "scout" },
      { at: 0.72, lane: 0, type: "hopper" }, { at: 0.86, lane: 2, type: "bomber" },
    ], [
      { at: 0.10, lane: 2 }, { at: 0.26, lane: 0, gold: true }, { at: 0.42, lane: 1 }, { at: 0.58, lane: 2 },
      { at: 0.74, lane: 0 }, { at: 0.88, lane: 1, gold: true },
    ]),
    S(3, "ערב בשכונה", 30, [
      { at: 0.18, lane: 2, type: "bomber" }, { at: 0.32, lane: 1, type: "hopper" },
      { at: 0.46, lane: 0, type: "hopper" }, { at: 0.60, lane: 2, type: "bomber" },
      { at: 0.74, lane: 1, type: "hopper" }, { at: 0.88, lane: 0, type: "bomber" },
    ], [
      { at: 0.12, lane: 1 }, { at: 0.28, lane: 0, gold: true }, { at: 0.46, lane: 2 }, { at: 0.64, lane: 1 },
      { at: 0.80, lane: 0, gold: true },
    ]),
    S(3, "בוס על", 34, [
      { at: 0.18, lane: 0, type: "hopper" }, { at: 0.36, lane: 2, type: "bomber" },
      { at: 0.54, lane: 1, type: "hopper" },
    ], [
      { at: 0.12, lane: 1, gold: true }, { at: 0.32, lane: 0 }, { at: 0.50, lane: 2, gold: true }, { at: 0.66, lane: 1 },
    ], { hp: 6, name: "מלך הברוקולי" }),
  ];
  root.GameLevels = STAGES;
  if (typeof module !== "undefined") module.exports = STAGES;
})(typeof window !== "undefined" ? window : globalThis);
