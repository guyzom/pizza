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
  target.addEventListener("dispose", () => { released.targets++; });
  class Generator {
    fromScene(scene) {
      scene.traverse(object => {
        if (object.geometry) object.geometry.addEventListener("dispose", () => { released.geometries++; });
        if (object.material) object.material.addEventListener("dispose", () => { released.materials++; });
      });
      if (fail) throw new Error("environment rendering unavailable");
      return target;
    }
    dispose() { released.generators++; }
  }
  const window = { THREE: { ...THREE, PMREMGenerator: Generator } };
  vm.runInNewContext(source, { window });
  return { art: window.GameArt, target, released };
}

test("environment retains only its filtered target and releases all source objects", () => {
  const h = environmentHarness();
  const texture = h.art.makeEnvironment({});
  assert.equal(texture, h.target.texture);
  assert.deepEqual(h.released, { generators: 1, geometries: 4, materials: 4, targets: 0 });
  texture.dispose();
  assert.equal(h.released.targets, 1);
  texture.dispose();
  assert.equal(h.released.targets, 1);
});

test("environment rendering failure still releases its temporary scene and generator", () => {
  const h = environmentHarness(true);
  assert.throws(() => h.art.makeEnvironment({}), /environment rendering unavailable/);
  assert.deepEqual(h.released, { generators: 1, geometries: 4, materials: 4, targets: 0 });
});
