"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Core = require("../game/core.js");
const levels = require("../game/levels.js");
const dogs = ["biscuit", "pepper", "toffee", "coco"].map(id => ({ id }));
const stickers = ["biscuit", "pepper", "toffee", "coco", "pizza", "gold", "boss", "star", "world1", "world2", "world3", "hero"].map(id => ({ id }));
const normalize = raw => Core.normalizeSave(raw, levels.length, dogs, stickers);
test("empty, null, array and primitive saves recover safely", () => {
  for (const raw of [null, undefined, [], 7, "bad", false]) {
    const s = normalize(raw);
    assert.equal(s.version, 1);
    assert.equal(s.unlocked, 0); assert.equal(s.dogId, "biscuit");
    assert.deepEqual(s.stars, Array(9).fill(0)); assert.equal(s.settings.gentle, true);
  }
});
test("valid progress, character and stickers survive normalization", () => {
  const s = normalize({ unlocked: 4, stars: [3, 2, 1, 0, 0, 0, 0, 0, 0], stickers: ["gold", "biscuit"], dogId: "toffee" });
  assert.equal(s.unlocked, 4); assert.equal(s.dogId, "toffee");
  assert.deepEqual(s.stickers, ["gold", "biscuit"]); assert.deepEqual(s.stars.slice(0, 3), [3, 2, 1]);
});
test("untrusted save fields are bounded, not interpolated into HTML", () => {
  const s = normalize({ unlocked: Infinity, stars: [99, -3, "3", null, NaN, 2.9], stickers: ["biscuit", "biscuit", "<script>"], dogId: "bad", settings: { quality: "ultra", calm: "false", gentle: false } });
  assert.deepEqual(s.stars, [3, 0, 0, 0, 0, 2, 0, 0, 0]);
  assert.equal(s.unlocked, 6); assert.deepEqual(s.stickers, ["biscuit"]);
  assert.equal(s.settings.quality, "auto"); assert.equal(s.settings.calm, false); assert.equal(s.settings.gentle, false);
});
test("all saved stars are normalized without throwing away a shorter old array", () => {
  assert.deepEqual(normalize({ stars: [3, 2] }).stars, [3, 2, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(normalize({ unlocked: 9000 }).unlocked, 8);
  assert.equal(normalize({ stars: Array(9).fill(3) }).unlocked, 8);
});
test("stars reward completion; relative thresholds include exact boundaries", () => {
  for (const score of [-1, 0, NaN]) assert.equal(Core.starsFor(score, 20), 1);
  assert.equal(Core.starsFor(6, 20), 1); assert.equal(Core.starsFor(7, 20), 2);
  assert.equal(Core.starsFor(14, 20), 2); assert.equal(Core.starsFor(15, 20), 3);
  assert.equal(Core.starsFor(100, 20), 3); assert.equal(Core.starsFor(1, 0), 1);
});
test("all nine stages have reachable three-star thresholds and super charge", () => {
  assert.equal(levels.length, 9);
  for (const stage of levels) {
    const total = stage.pickups.reduce((n, p) => n + (p.gold ? 3 : 1), 0);
    assert.ok(total >= 6, stage.name); assert.equal(Core.starsFor(total, total), 3);
  }
});
test("level spawns are ordered and use valid physical lanes", () => {
  levels.forEach((stage, i) => {
    assert.equal(stage.world, Math.floor(i / 3) + 1); assert.ok(stage.seconds > 0);
    assert.equal(!!stage.boss, i % 3 === 2);
    for (const schedule of [stage.enemies, stage.pickups]) {
      let last = 0;
      for (const item of schedule) { assert.ok(item.at >= last && item.at <= 1); last = item.at; assert.ok([0, 1, 2].includes(item.lane)); }
    }
  });
});
test("lane snapping keeps physical left and right independent of Hebrew RTL", () => {
  assert.equal(Core.nearestLane(-2.2), 0); assert.equal(Core.nearestLane(0), 1);
  assert.equal(Core.nearestLane(2.2), 2); assert.equal(Core.nearestLane(NaN), 1);
  assert.equal(Core.nearestLane(-1.1), 1); assert.equal(Core.nearestLane(1.1), 1);
});
test("iPad render budget is bounded at high-density resolutions", () => {
  for (const [w, h] of [[1024,768], [768,1024], [1366,1024], [1180,820], [390,844]]) {
    const pr = Core.pixelRatio(w,h,3,"auto");
    assert.ok(pr <= 1.5); assert.ok(w*h*pr*pr <= 1600001);
    assert.ok(Core.pixelRatio(w,h,3,"battery") <= 1);
    assert.ok(Core.pixelRatio(w,h,3,"high") <= 2);
  }
});
test("offline cache includes every required local script/style/image", () => {
  let installed;
  const sandbox = { self: { registration: { scope: "https://example.test/game/" }, addEventListener(type, fn) { if(type === "install") installed = fn; } }, URL, Request, caches: { open: async () => ({ addAll: async reqs => reqs.forEach(r => assert.ok(fs.existsSync("game/" + (new URL(r.url).pathname.replace("/game/", "") || "index.html")), r.url)) }) } };
  vm.runInNewContext(fs.readFileSync("game/sw.js", "utf8"), sandbox);
  return new Promise((resolve, reject) => installed({ waitUntil(promise) { promise.then(resolve, reject); } }));
});
test("index uses no third-party runtime script, font or stylesheet", () => {
  const html = fs.readFileSync("game/index.html", "utf8");
  assert.doesNotMatch(html, /(?:src|href)=["']https?:/);
  for (const match of html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)) assert.ok(fs.existsSync("game/" + match[1]), match[1]);
});
