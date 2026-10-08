"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../game");

test("the Pages package ships the complete Three.js MIT notice beside the library", () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, "../.github/workflows/deploy-pizza-game-pages.yml"), "utf8");
  const artifactPath = workflow.match(/uses: actions\/upload-pages-artifact@[^\n]+\n\s+with:\n\s+path: ([^\n]+)/)?.[1].trim();
  assert.equal(artifactPath, "game", "check the directory actually published by Pages");
  const canonical = fs.readFileSync(path.resolve(__dirname, "../licenses/threejs-MIT.txt"));
  const packaged = fs.readFileSync(path.join(root, "vendor/threejs-MIT.txt"));
  assert.deepEqual(packaged, canonical, "the shipped notice must retain the complete upstream license");
  assert.match(packaged.toString("utf8"), /Copyright © 2010-2023 three\.js authors/);
  assert.match(packaged.toString("utf8"), /Permission is hereby granted, free of charge/);
  assert.match(packaged.toString("utf8"), /The above copyright notice and this permission notice shall be included in\nall copies or substantial portions of the Software\./);
  assert.match(packaged.toString("utf8"), /THE SOFTWARE IS PROVIDED "AS IS"/);
});

test("the offline shell retains the license with its vendored Three.js build", () => {
  const worker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const shell = vm.runInNewContext(worker + "\nSHELL;", {
    self: { registration: { scope: "https://example.com/pizza/" }, addEventListener() {} }
  });
  assert.ok(shell.includes("vendor/three.min.js"));
  assert.ok(shell.includes("vendor/threejs-MIT.txt"));
});

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
