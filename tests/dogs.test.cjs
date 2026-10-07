"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const THREE = require("../game/vendor/three.min.js");
const window = { THREE };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../game/dogs.js"), "utf8"), { window });
const dogs = window.GameDogs;
const ids = ["biscuit", "pepper", "toffee", "coco"];

function meshes(root) {
  const result = [];
  root.traverse(object => { if (object.isMesh) result.push(object); });
  return result;
}
function pose(root) {
  const result = [];
  root.traverse(object => result.push(...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()));
  return result;
}
function almostSame(left, right) {
  assert.equal(left.length, right.length);
  left.forEach((value, i) => assert.ok(Math.abs(value - right[i]) < 1e-10, `pose component ${i}: ${value} vs ${right[i]}`));
}

test("each character is a grounded four-legged model with a face and finite render geometry", () => {
  for (const id of ids) {
    const dog = dogs.createDog(id);
    assert.equal(dog.userData.characterType, "dog");
    assert.equal(dog.userData.dogId, id);
    assert.equal(dog.userData.legCount, 4);
    const rendered = meshes(dog);
    assert.ok(rendered.length >= 40, `${id} contains a complete character`);
    const paws = rendered.filter(object => object.name === "paw");
    assert.equal(paws.length, 4);
    assert.ok(dog.getObjectByName("muzzle"));
    assert.ok(dog.getObjectByName("nose"));
    assert.ok(dog.getObjectByName("left-ear"));
    assert.ok(dog.getObjectByName("right-ear"));
    assert.ok(dog.getObjectByName("tail-rig"));
    assert.equal(rendered.filter(object => object.name === "pupil").length, 2);
    for (const mesh of rendered) {
      const positions = mesh.geometry.getAttribute("position");
      assert.ok(positions && positions.count > 0);
      for (const value of positions.array) assert.ok(Number.isFinite(value), `${id}/${mesh.name} has finite vertices`);
    }
    dog.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(dog);
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(bounds.min.y) < 1e-6, `${id} rests on the ground`);
    assert.ok(size.x < 1.8 && size.y <= 2.05 && size.z < 3.1, `${id} fits the scene: ${size.toArray()}`);
    for (const paw of paws) {
      const pawBounds = new THREE.Box3().setFromObject(paw);
      assert.ok(Math.abs(pawBounds.min.y) < 1e-6, `${id}/${paw.parent.name} contacts the ground`);
    }
    const muzzleZ = dog.getObjectByName("muzzle").getWorldPosition(new THREE.Vector3()).z;
    const torsoZ = dog.getObjectByName("torso").getWorldPosition(new THREE.Vector3()).z;
    assert.ok(muzzleZ < torsoZ, "characters face the -Z running direction");
  }
});

test("breed silhouettes differ in leg height, body shape, ears and tail", () => {
  const models = Object.fromEntries(ids.map(id => [id, dogs.createDog(id)]));
  const dachshund = models.toffee.userData.parts;
  const retriever = models.biscuit.userData.parts;
  assert.ok(dachshund.torso.scale.z > retriever.torso.scale.z * 1.2);
  assert.ok(dachshund.legs[0].hip.position.y < retriever.legs[0].hip.position.y * 0.65);
  assert.equal(models.biscuit.userData.definition.ears, "floppy");
  assert.equal(models.pepper.userData.definition.ears, "pointed");
  assert.ok(models.pepper.getObjectByName("face-blaze"));
  assert.ok(models.coco.getObjectByName("curled-tail"));
  assert.ok(models.coco.getObjectByName("ruff-0"));
  assert.ok(!models.biscuit.getObjectByName("curled-tail"));
  assert.equal(new Set(ids.map(id => dogs.definitions[id].coat)).size, 4);
});

test("idle and run poses are finite, repeatable and move all four legs", () => {
  for (const id of ids) {
    const dog = dogs.createDog(id);
    dogs.animateDogRun(dog, 0.16);
    const run = pose(dog);
    assert.ok(run.every(Number.isFinite));
    assert.ok(dog.userData.parts.legs.every(leg => Math.abs(leg.hip.rotation.x) > 0.15));
    dogs.animateDogRun(dog, 0.16);
    almostSame(pose(dog), run);
    for (let i = 0; i < 200; i++) dogs.animateDogRun(dog, i / 60);
    dogs.animateDogRun(dog, 0.16);
    almostSame(pose(dog), run);
    dogs.animateDogIdle(dog, 1.3);
    const idle = pose(dog);
    assert.ok(idle.every(Number.isFinite));
    assert.ok(dog.userData.parts.legs.every(leg => leg.hip.rotation.x === 0 && leg.knee.rotation.x === 0));
    dogs.animateDogIdle(dog, 1.3);
    almostSame(pose(dog), idle);
    assert.notDeepEqual(run, idle);
    dogs.animateDogRun(dog, NaN);
    assert.ok(pose(dog).every(Number.isFinite));
  }
});

test("action duration uses elapsed animation time and is independent of frame cadence", () => {
  const slow = dogs.createDog("biscuit"), fast = dogs.createDog("biscuit"), direct = dogs.createDog("biscuit");
  for (const dog of [slow, fast, direct]) {
    dogs.animateDogRun(dog, 1);
    dogs.triggerDogAction(dog);
  }
  for (let t = 1; t < 1.2; t += 1 / 30) dogs.animateDogRun(slow, t);
  for (let t = 1; t < 1.2; t += 1 / 120) dogs.animateDogRun(fast, t);
  for (const dog of [slow, fast, direct]) dogs.animateDogRun(dog, 1.2);
  almostSame(pose(slow), pose(fast));
  almostSame(pose(slow), pose(direct));
  assert.ok(Math.abs(slow.userData.parts.body.rotation.y) > 0.05, "active action visibly shifts the dog");
  const normal = dogs.createDog("biscuit");
  dogs.animateDogRun(normal, 1.6);
  dogs.animateDogRun(slow, 1.6);
  almostSame(pose(slow), pose(normal));
  const firstFrame = dogs.createDog("coco");
  dogs.triggerDogAction(firstFrame);
  dogs.animateDogRun(firstFrame, 100);
  dogs.animateDogRun(firstFrame, 100.2);
  assert.ok(Math.abs(firstFrame.userData.parts.body.rotation.y) > 0.05);
});

test("glow restores each material and disposing one dog cannot affect another", () => {
  const left = dogs.createDog("pepper"), right = dogs.createDog("pepper");
  const leftMeshes = meshes(left), rightMeshes = meshes(right);
  const leftMaterials = new Set(leftMeshes.map(mesh => mesh.material));
  const rightMaterials = new Set(rightMeshes.map(mesh => mesh.material));
  const leftGeometries = new Set(leftMeshes.map(mesh => mesh.geometry));
  const rightGeometries = new Set(rightMeshes.map(mesh => mesh.geometry));
  for (const material of leftMaterials) assert.ok(!rightMaterials.has(material));
  for (const geometry of leftGeometries) assert.ok(!rightGeometries.has(geometry));
  const before = Array.from(leftMaterials, material => [material.color.getHex(), material.emissive.getHex(), material.emissiveIntensity]);
  dogs.setDogGlow(left, 0xff5555);
  for (const material of leftMaterials) assert.equal(material.emissive.getHex(), 0xff5555);
  for (const material of rightMaterials) assert.equal(material.emissive.getHex(), 0x000000);
  dogs.setDogGlow(left, 0x44ccff);
  dogs.setDogGlow(left, null);
  assert.deepEqual(Array.from(leftMaterials, material => [material.color.getHex(), material.emissive.getHex(), material.emissiveIntensity]), before);
  let rightDisposed = 0;
  for (const resource of [...rightMaterials, ...rightGeometries]) resource.addEventListener("dispose", () => rightDisposed++);
  for (const resource of [...leftMaterials, ...leftGeometries]) resource.dispose();
  assert.equal(rightDisposed, 0);
  dogs.animateDogRun(right, 1.2);
  assert.ok(pose(right).every(Number.isFinite));
});

test("unknown characters report an error instead of returning an empty object", () => {
  assert.throws(() => dogs.createDog("unknown"), /Unknown dog character/);
  assert.equal(dogs.createDog().userData.dogId, "biscuit");
});
