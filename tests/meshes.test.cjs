"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const THREE = require("../game/vendor/three.min.js");
const source = fs.readFileSync("game/meshes.js", "utf8");

function environmentHarness(fail = false) {
  const target = new THREE.WebGLRenderTarget(256, 256);
  const released = { generators: 0, geometries: 0, materials: 0, targets: 0 };
  const sourceResources = { geometries: new Set(), materials: new Set() };
  target.addEventListener("dispose", () => { released.targets++; });
  class Generator {
    fromScene(scene) {
      scene.traverse(object => {
        if (object.geometry && !sourceResources.geometries.has(object.geometry)) {
          sourceResources.geometries.add(object.geometry);
          object.geometry.addEventListener("dispose", () => { released.geometries++; });
        }
        for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
          if (sourceResources.materials.has(material)) continue;
          sourceResources.materials.add(material);
          material.addEventListener("dispose", () => { released.materials++; });
        }
      });
      if (fail) throw new Error("environment rendering unavailable");
      return target;
    }
    dispose() { released.generators++; }
  }
  const window = { THREE: { ...THREE, PMREMGenerator: Generator } };
  vm.runInNewContext(source, { window });
  return { art: window.GameArt, target, released, sourceResources };
}

test("environment retains only its filtered target and releases all source objects", () => {
  const h = environmentHarness();
  const texture = h.art.makeEnvironment({});
  assert.equal(texture, h.target.texture);
  assert.ok(h.sourceResources.geometries.size > 0, "a nonempty scene supplies the environment");
  assert.ok(h.sourceResources.materials.size > 0);
  assert.deepEqual(h.released, {
    generators: 1, geometries: h.sourceResources.geometries.size,
    materials: h.sourceResources.materials.size, targets: 0
  });
  texture.dispose();
  assert.equal(h.released.targets, 1);
  texture.dispose();
  assert.equal(h.released.targets, 1);
});

test("environment rendering failure still releases its temporary scene and generator", () => {
  const h = environmentHarness(true);
  assert.throws(() => h.art.makeEnvironment({}), /environment rendering unavailable/);
  assert.ok(h.sourceResources.geometries.size > 0, "a nonempty scene supplies the environment");
  assert.ok(h.sourceResources.materials.size > 0);
  assert.deepEqual(h.released, {
    generators: 1, geometries: h.sourceResources.geometries.size,
    materials: h.sourceResources.materials.size, targets: 0
  });
});

test("pizzeria floor tiles stay square and each recycled chunk owns its texture map", () => {
  const context = {
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}
  };
  const document = { createElement: () => ({ getContext: () => context }) };
  const window = { THREE };
  vm.runInNewContext(source, { window, document });
  const short = window.GameArt.createGroundChunk(2, 20);
  const long = window.GameArt.createGroundChunk(2, 40);
  const floors = [short.children[0], long.children[0]];
  for (const floor of floors) {
    const { width, depth } = floor.geometry.parameters;
    const repeat = floor.material.map.repeat;
    assert.ok(repeat.x > 0 && repeat.y > 0);
    assert.ok(Math.abs(width / repeat.x - depth / repeat.y) < 1e-10,
      "the two UV axes cover equal world-space tile sizes");
  }
  assert.notEqual(floors[0].material.map, floors[1].material.map);
  assert.notEqual(floors[0].material, floors[1].material);
  let otherReleased = 0;
  floors[1].material.map.addEventListener("dispose", () => { otherReleased++; });
  floors[0].material.map.dispose();
  assert.equal(otherReleased, 0, "recycling one floor does not invalidate the next one");
});
