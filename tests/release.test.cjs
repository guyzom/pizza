"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../game");
test("the dog picker ships a complete set of self-contained vector portraits", () => {
  const portraits = fs.readdirSync(path.join(root, "assets")).sort();
  assert.deepEqual(portraits, ["biscuit.svg", "coco.svg", "pepper.svg", "toffee.svg"]);
  for (const name of portraits) {
    const svg = fs.readFileSync(path.join(root, "assets", name), "utf8");
    assert.match(svg, /<svg\b[^>]*viewBox=["']0 0 256 256["']/);
    assert.match(svg, /<svg\b[^>]*width=["']256["']/);
    assert.match(svg, /<svg\b[^>]*height=["']256["']/);
    assert.match(svg, /<title\b[^>]*>[^<]+<\/title>/);
    assert.match(svg, /<\/svg>\s*$/);
    assert.doesNotMatch(svg, /<(?:script|foreignObject)\b|(?:href|src)=["'](?:https?:|javascript:)/i);
  }
});

test("dog models load before the art facade and are included in offline assets", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const modules = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match => match[1]);
  const dogs = modules.indexOf("dogs.js");
  const art = modules.indexOf("meshes.js");
  assert.ok(dogs >= 0 && art > dogs, "dogs.js must precede meshes.js");
  const worker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  assert.match(worker, /["'](?:\.\/)?dogs\.js["']/);
});
