"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const THREE = require("../game/vendor/three.min.js");
const source = fs.readFileSync("game/postfx.js", "utf8");

function harness(options = {}) {
  const resources = { targets: [], materials: [], geometries: [] };
  function tracked(Base, kind) {
    return class extends Base {
      constructor(...args) {
        if (options.failAllocation === kind && resources[kind].length === options.failAt) {
          throw new Error("allocation failed");
        }
        super(...args);
        const record = { resource: this, releases: 0 };
        this.addEventListener("dispose", () => { record.releases++; });
        resources[kind].push(record);
      }
    };
  }
  const window = { THREE: {
    ...THREE,
    WebGLRenderTarget: tracked(THREE.WebGLRenderTarget, "targets"),
    ShaderMaterial: tracked(THREE.ShaderMaterial, "materials"),
    PlaneGeometry: tracked(THREE.PlaneGeometry, "geometries")
  } };
  vm.runInNewContext(source, { window });
  const calls = [];
  let currentTarget = options.initialTarget || null;
  const renderer = {
    capabilities: options.capabilities === undefined ? { isWebGL2: true } : options.capabilities,
    extensions: { has: name => name === "EXT_color_buffer_float" && options.float !== false },
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 0.9,
    outputColorSpace: THREE.SRGBColorSpace,
    getPixelRatio: () => options.pixelRatio || 1,
    getRenderTarget: () => currentTarget,
    setRenderTarget: target => { currentTarget = target; },
    clear() {},
    render(scene, camera) {
      const material = scene.children[0]?.material;
      calls.push({ target: currentTarget, scene, camera, material,
        source: material?.uniforms?.tDiffuse?.value || null,
        toneMapping: this.toneMapping, exposure: this.toneMappingExposure,
        outputColorSpace: this.outputColorSpace });
      if (calls.length === options.failRender) throw new Error("render failed");
    }
  };
  return { create: window.GamePostFX.create, renderer, resources, calls };
}

function assertRendererSettings(renderer) {
  assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(renderer.toneMappingExposure, 0.9);
  assert.equal(renderer.outputColorSpace, THREE.SRGBColorSpace);
}

test("unsupported HDR capabilities allocate nothing and preserve renderer state", () => {
  for (const options of [{ capabilities: null }, { capabilities: { isWebGL2: false } }, { float: false }]) {
    const h = harness(options);
    assert.equal(h.create(h.renderer), null);
    assert.deepEqual(h.resources, { targets: [], materials: [], geometries: [] });
    assertRendererSettings(h.renderer);
    assert.equal(h.renderer.getRenderTarget(), null);
  }
});

test("HDR passes use owned linear targets and restore the caller's renderer state", () => {
  const previousTarget = new THREE.WebGLRenderTarget(8, 8);
  const h = harness({ pixelRatio: 1.5, initialTarget: previousTarget });
  const post = h.create(h.renderer, { bloomStrength: 0 });
  assertRendererSettings(h.renderer);
  assert.equal(h.renderer.getRenderTarget(), previousTarget);
  post.setSize(101, 55);
  assert.deepEqual(h.resources.targets.map(({ resource }) => [resource.width, resource.height]),
    [[151, 82], [75, 41], [75, 41], [75, 41]]);
  for (const { resource } of h.resources.targets) {
    assert.equal(resource.texture.type, THREE.HalfFloatType);
    assert.equal(resource.texture.colorSpace, THREE.LinearSRGBColorSpace);
  }
  assert.equal(h.resources.targets[0].resource.depthBuffer, true);
  assert.ok(h.resources.targets.slice(1).every(({ resource }) => !resource.depthBuffer));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  post.render(scene, camera);
  const [sceneRT, brightRT, blurA, blurB] = h.resources.targets.map(({ resource }) => resource);
  assert.deepEqual(h.calls.map(call => call.target), [sceneRT, brightRT, blurA, blurB, blurA, blurB, null]);
  assert.equal(h.calls[0].scene, scene);
  assert.equal(h.calls[0].camera, camera);
  assert.deepEqual(h.calls.slice(1, 6).map(call => call.source),
    [sceneRT.texture, brightRT.texture, blurA.texture, blurB.texture, blurA.texture]);
  assert.ok(h.calls.slice(1, 6).every(call => !call.material.toneMapped));
  assert.equal(h.calls[6].material.toneMapped, true);
  assert.equal(h.calls[6].material.uniforms.tScene.value, sceneRT.texture);
  assert.equal(h.calls[6].material.uniforms.tBloom.value, blurB.texture);
  assert.equal(h.calls[6].material.uniforms.bloomStrength.value, 0);
  assert.equal(h.renderer.getRenderTarget(), previousTarget);
  assertRendererSettings(h.renderer);
  const beforeDisposal = Object.fromEntries(Object.entries(h.resources).map(([kind, records]) =>
    [kind, records.map(record => record.releases)]));
  post.dispose();
  post.dispose();
  for (const [kind, records] of Object.entries(h.resources)) {
    records.forEach((record, i) => assert.equal(record.releases, beforeDisposal[kind][i] + 1));
  }
  assert.equal(h.renderer.getRenderTarget(), previousTarget);
  assertRendererSettings(h.renderer);
  previousTarget.dispose();
});

test("an HDR pass failure restores the caller target and permits complete cleanup", () => {
  for (const failRender of [1, 3, 7]) {
    const previousTarget = new THREE.WebGLRenderTarget(8, 8);
    const h = harness({ failRender, initialTarget: previousTarget });
    const post = h.create(h.renderer);
    assert.throws(() => post.render(new THREE.Scene(), new THREE.PerspectiveCamera()), /render failed/);
    assert.equal(h.renderer.getRenderTarget(), previousTarget);
    assertRendererSettings(h.renderer);
    post.dispose();
    assert.ok(Object.values(h.resources).flat().every(record => record.releases === 1));
    assert.equal(h.renderer.getRenderTarget(), previousTarget);
    assertRendererSettings(h.renderer);
    previousTarget.dispose();
  }
});

test("partial allocation failure releases all resources already created", () => {
  for (const options of [
    { failAllocation: "targets", failAt: 2 },
    { failAllocation: "materials", failAt: 1 },
    { failAllocation: "geometries", failAt: 0 }
  ]) {
    const h = harness(options);
    assert.throws(() => h.create(h.renderer), /allocation failed/);
    const allocated = Object.values(h.resources).flat();
    assert.ok(allocated.length > 0);
    assert.ok(allocated.every(record => record.releases === 1));
    assertRendererSettings(h.renderer);
    assert.equal(h.renderer.getRenderTarget(), null);
  }
});

test("disposal unbinds an owned target and prevents further rendering", () => {
  const h = harness();
  const post = h.create(h.renderer);
  h.renderer.setRenderTarget(h.resources.targets[1].resource);
  post.dispose();
  assert.equal(h.renderer.getRenderTarget(), null);
  assert.throws(() => post.render(new THREE.Scene(), new THREE.PerspectiveCamera()), /disposed/);
  assert.throws(() => post.setSize(100, 100), /disposed/);
  assert.equal(h.calls.length, 0);
  assert.ok(Object.values(h.resources).flat().every(record => record.releases === 1));
  assertRendererSettings(h.renderer);
});
