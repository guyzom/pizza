/* Procedural dog characters for Three.js r160. Forward is -Z; paws rest at y=0. */
(function (global) {
  "use strict";

  var THREE = global.THREE;
  var definitions = Object.freeze({
    biscuit: Object.freeze({ name: "ביסקו", breed: "golden retriever", coat: 0xd8a052, collar: 0x62a79b, ears: "floppy", tail: "feathered" }),
    pepper: Object.freeze({ name: "פלפל", breed: "border collie", coat: 0x354048, collar: 0xbd8a95, ears: "pointed", tail: "brush" }),
    toffee: Object.freeze({ name: "טופי", breed: "dachshund", coat: 0xb86f41, collar: 0xc4aa62, ears: "floppy", tail: "tapered" }),
    coco: Object.freeze({ name: "קוקו", breed: "spitz", coat: 0xefe0bd, collar: 0xaa9cbf, ears: "pointed", tail: "curled" })
  });
  var proportions = {
    biscuit: { bodyY: 0.89, body: [0.37, 0.36, 0.67], headY: 1.40, headZ: -0.63, head: [0.36, 0.34, 0.34], hipY: 0.76, legX: 0.27, frontZ: -0.44, backZ: 0.44, muzzle: [0.24, 0.17, 0.27], muzzleZ: -0.34 },
    pepper: { bodyY: 0.92, body: [0.32, 0.33, 0.62], headY: 1.37, headZ: -0.65, head: [0.32, 0.33, 0.31], hipY: 0.80, legX: 0.24, frontZ: -0.43, backZ: 0.40, muzzle: [0.20, 0.14, 0.26], muzzleZ: -0.32 },
    toffee: { bodyY: 0.57, body: [0.29, 0.25, 0.87], headY: 0.95, headZ: -0.73, head: [0.29, 0.27, 0.29], hipY: 0.41, legX: 0.23, frontZ: -0.63, backZ: 0.62, muzzle: [0.19, 0.12, 0.33], muzzleZ: -0.35 },
    coco: { bodyY: 0.86, body: [0.35, 0.32, 0.58], headY: 1.33, headZ: -0.60, head: [0.35, 0.34, 0.32], hipY: 0.72, legX: 0.25, frontZ: -0.38, backZ: 0.38, muzzle: [0.21, 0.14, 0.22], muzzleZ: -0.33 }
  };

  function createDog(id) {
    id = id || "biscuit";
    if (!Object.prototype.hasOwnProperty.call(definitions, id)) throw new RangeError("Unknown dog character: " + id);
    var definition = definitions[id], p = proportions[id];
    var dog = new THREE.Group(); dog.name = "dog-" + id;
    var body = new THREE.Group(); body.name = "body-rig"; dog.add(body);
    // Geometry and materials belong to this character instance, so releasing it
    // never invalidates another character or requires a global asset cache.
    var sphere = new THREE.SphereGeometry(1, 16, 12);
    var materials = [];
    function material(color, roughness) {
      var m = new THREE.MeshStandardMaterial({ color: color, roughness: roughness == null ? 0.83 : roughness, metalness: 0 });
      materials.push(m); return m;
    }
    var coat = material(definition.coat), light = material(id === "pepper" ? 0xfff8ee : id === "toffee" ? 0xe0b487 : id === "coco" ? 0xfff3df : 0xf0c983);
    var earCoat = material(id === "biscuit" ? 0xb67d37 : id === "toffee" ? 0x864331 : definition.coat);
    var earInner = material(id === "coco" ? 0xd8a8a1 : 0xb58a7c), nose = material(0x302b2d, 0.4);
    var eyeWhite = material(0xfffff1, 0.4), eyeDark = material(0x25262c, 0.32), tongue = material(0xd98792);
    var collar = material(definition.collar), tag = material(0xd3b973, 0.5);
    function ellipsoid(parent, name, mat, position, scale) {
      var mesh = new THREE.Mesh(sphere, mat); mesh.name = name;
      mesh.position.set(position[0], position[1], position[2]); mesh.scale.set(scale[0], scale[1], scale[2]);
      mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    }
    function curve(parent, name, points, radius, mat) {
      var path = new THREE.CatmullRomCurve3(points.map(function (v) { return new THREE.Vector3(v[0], v[1], v[2]); }));
      var mesh = new THREE.Mesh(new THREE.TubeGeometry(path, 12, radius, 7, false), mat);
      mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    }

    var torso = ellipsoid(body, "torso", coat, [0, p.bodyY, 0], p.body);
    ellipsoid(body, "chest", id === "pepper" || id === "coco" ? light : coat, [0, p.bodyY + 0.03, p.frontZ], [p.body[0] * 0.9, p.body[1] * 1.07, 0.31]);
    ellipsoid(body, "neck", id === "pepper" ? light : coat, [0, p.headY - 0.28, p.headZ + 0.09], [0.26, 0.31, 0.25]);
    if (id === "pepper") {
      ellipsoid(body, "white-rump-tip", light, [0, p.bodyY, 0.53], [0.23, 0.25, 0.18]);
    }
    if (id === "coco") {
      for (var r = 0; r < 9; r++) {
        var a = r / 9 * Math.PI * 2;
        ellipsoid(body, "ruff-" + r, r % 2 ? light : coat, [Math.sin(a) * 0.28, p.headY - 0.24 + Math.cos(a) * 0.15, p.headZ + 0.10], [0.17, 0.18, 0.22]);
      }
      for (var f = 0; f < 6; f++) {
        var side = f % 2 ? 1 : -1;
        ellipsoid(body, "coat-tuft-" + f, coat, [side * 0.26, p.bodyY + 0.12, (Math.floor(f / 2) - 1) * 0.32], [0.17, 0.22, 0.23]);
      }
    }

    var legs = [];
    [ ["front-left", -1, p.frontZ], ["front-right", 1, p.frontZ], ["back-left", -1, p.backZ], ["back-right", 1, p.backZ] ].forEach(function (spec, index) {
      var hip = new THREE.Group(); hip.name = spec[0] + "-leg";
      hip.position.set(spec[1] * p.legX, p.hipY, spec[2]); body.add(hip);
      var length = p.hipY - 0.105, upperLength = length * 0.53, lowerLength = length - upperLength;
      ellipsoid(hip, "upper-leg", coat, [0, -upperLength / 2, 0], [0.105, upperLength / 2 + 0.035, 0.105]);
      var knee = new THREE.Group(); knee.name = spec[0] + "-knee"; knee.position.y = -upperLength; hip.add(knee);
      ellipsoid(knee, "lower-leg", id === "pepper" ? light : coat, [0, -lowerLength / 2, 0], [0.08, lowerLength / 2 + 0.025, 0.085]);
      ellipsoid(knee, "paw", id === "pepper" || id === "toffee" ? light : coat, [0, -lowerLength, -0.04], [0.135, 0.105, 0.17]);
      // Paired pads add a paw silhouette without hard-to-read tiny toes.
      ellipsoid(knee, "paw-toes", id === "pepper" || id === "toffee" ? light : coat, [0, -lowerLength - 0.008, -0.13], [0.14, 0.082, 0.075]);
      legs.push({ hip: hip, knee: knee, phase: index === 0 || index === 3 ? 0 : Math.PI, front: index < 2 });
    });

    var head = new THREE.Group(); head.name = "head-rig";
    head.position.set(0, p.headY, p.headZ); body.add(head);
    ellipsoid(head, "skull", coat, [0, 0, 0], p.head);
    if (id === "pepper") {
      ellipsoid(head, "face-blaze", light, [0, 0.065, -0.263], [0.071, 0.255, 0.07]);
    }
    var ears = [];
    [-1, 1].forEach(function (side) {
      var ear = new THREE.Group(); ear.name = side < 0 ? "left-ear" : "right-ear";
      ear.position.set(side * (p.head[0] - 0.03), definition.ears === "floppy" ? 0.14 : 0.25, 0.005);
      head.add(ear); ears.push(ear);
      if (definition.ears === "floppy") {
        var e = ellipsoid(ear, "ear-coat", earCoat, [side * 0.035, -0.22, 0], [id === "toffee" ? 0.125 : 0.145, id === "toffee" ? 0.31 : 0.285, 0.105]);
        e.rotation.z = side * 0.14;
        ellipsoid(ear, "ear-inner", earInner, [side * 0.035, -0.21, -0.086], [0.078, 0.20, 0.025]);
      } else {
        var earHeight = id === "pepper" ? 0.38 : 0.32;
        var cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, earHeight, 4), coat);
        cone.name = "ear-coat"; cone.position.y = earHeight / 2; cone.scale.z = 0.62;
        cone.rotation.y = Math.PI / 4; cone.rotation.z = -side * 0.14; cone.castShadow = true; ear.add(cone);
        var inner = new THREE.Mesh(new THREE.ConeGeometry(0.103, earHeight * 0.68, 3), earInner);
        inner.name = "ear-inner"; inner.position.set(0, earHeight * 0.43, -0.056); inner.scale.z = 0.24;
        inner.rotation.z = -side * 0.14; ear.add(inner);
      }
    });

    ellipsoid(head, "muzzle", light, [0, -0.105, p.muzzleZ], p.muzzle);
    var tipZ = p.muzzleZ - p.muzzle[2] + 0.025;
    ellipsoid(head, "nose", nose, [0, -0.035, tipZ], [0.092, 0.063, 0.058]);
    ellipsoid(head, "nose-glint", eyeWhite, [-0.025, -0.012, tipZ - 0.048], [0.025, 0.012, 0.009]);
    curve(head, "smile", [[-0.13, -0.17, tipZ + 0.067], [-0.065, -0.215, tipZ + 0.028], [0, -0.185, tipZ + 0.005], [0.065, -0.215, tipZ + 0.028], [0.13, -0.17, tipZ + 0.067]], 0.014, nose);
    ellipsoid(head, "tongue", tongue, [0.038, -0.22, tipZ + 0.007], [0.042, 0.061, 0.022]);
    var eyes = [];
    [-1, 1].forEach(function (side) {
      var eye = new THREE.Group(); eye.name = side < 0 ? "left-eye" : "right-eye";
      eye.position.set(side * 0.135, 0.08, -p.head[2] * 0.88); head.add(eye); eyes.push(eye);
      ellipsoid(eye, "eye-white", eyeWhite, [0, 0, 0], [0.092, 0.111, 0.054]);
      ellipsoid(eye, "pupil", eyeDark, [side * -0.004, -0.004, -0.043], [0.047, 0.068, 0.021]);
      ellipsoid(eye, "eye-glint", eyeWhite, [-0.015, 0.03, -0.062], [0.017, 0.023, 0.009]);
      ellipsoid(head, "brow", earCoat, [side * 0.133, 0.223, -p.head[2] * 0.80], [0.093, 0.029, 0.04]);
    });

    var collarMesh = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.037, 7, 22), collar);
    collarMesh.name = "collar"; collarMesh.position.set(0, p.headY - 0.255, p.headZ + 0.055); collarMesh.rotation.x = Math.PI / 2; collarMesh.scale.z = 1.15;
    collarMesh.castShadow = true; body.add(collarMesh);
    ellipsoid(body, "collar-tag", tag, [0, p.headY - 0.305, p.headZ - 0.177], [0.057, 0.075, 0.018]);

    var tail = new THREE.Group(); tail.name = "tail-rig";
    tail.position.set(0, p.bodyY + 0.15, p.body[2] * 0.79); body.add(tail);
    if (id === "coco") {
      var curlPoints = [[0, 0, 0], [0, 0.19, 0.19], [0, 0.43, 0.13], [0, 0.50, -0.07], [0, 0.37, -0.18], [0, 0.28, -0.08]];
      curve(tail, "curled-tail", curlPoints, 0.14, coat);
      curlPoints.slice(1).forEach(function (point, i) { ellipsoid(tail, "tail-plume-" + i, i % 2 ? light : coat, point, [0.17, 0.15, 0.18]); });
    } else {
      var tailPoints = id === "toffee" ? [[0, 0, 0], [0, 0.10, 0.20], [0, 0.20, 0.43], [0, 0.30, 0.59]] : [[0, 0, 0], [0, 0.04, 0.21], [0, 0.17, 0.45], [0, 0.27, 0.63]];
      curve(tail, "tail", tailPoints, id === "toffee" ? 0.065 : 0.10, coat);
      if (id === "biscuit" || id === "pepper") {
        ellipsoid(tail, "tail-brush", light, [0, 0.20, 0.47], [0.145, 0.17, 0.28]).rotation.x = -0.40;
      } else {
        ellipsoid(tail, "tail-tip", coat, [0, 0.30, 0.59], [0.047, 0.05, 0.06]);
      }
    }

    dog.userData.characterType = "dog";
    dog.userData.dogId = id;
    dog.userData.legCount = legs.length;
    dog.userData.definition = definition;
    dog.userData.parts = { body: body, torso: torso, head: head, legs: legs, ears: ears, eyes: eyes, tail: tail };
    dog.userData.anim = { lastTime: null, actionStart: null, actionPending: false };
    dog.userData.glowMats = materials;
    materials.forEach(function (m) { m.userData.baseEmissive = m.emissive.getHex(); m.userData.baseEmissiveIntensity = m.emissiveIntensity; });
    return dog;
  }

  function animate(group, t, running) {
    if (!group || !group.userData || !group.userData.parts) return;
    t = Number.isFinite(t) ? t : 0;
    var p = group.userData.parts, a = group.userData.anim;
    if (a.actionPending) {
      if (a.actionStart == null || t < a.actionStart) a.actionStart = t;
      a.actionPending = false;
    }
    var elapsed = a.actionStart == null ? -1 : t - a.actionStart;
    var action = elapsed >= 0 && elapsed < 0.44 ? Math.sin(elapsed / 0.44 * Math.PI) : 0;
    if (elapsed >= 0.44 || elapsed < -0.001) a.actionStart = null;
    a.lastTime = t;
    var frequency = running ? 12 : 2.1;
    var stride = Math.sin(t * frequency);
    p.body.position.y = running ? Math.abs(stride) * 0.065 + action * 0.08 : Math.sin(t * frequency) * 0.012;
    p.body.rotation.set(running ? -0.035 : 0, action * 0.14, running ? Math.cos(t * frequency) * 0.025 : 0);
    p.torso.scale.y = proportions[group.userData.dogId].body[1] * (running ? 1 : 1 + Math.sin(t * 2.1) * 0.015);
    p.head.rotation.set((running ? 0.025 * stride : Math.sin(t * 1.1) * 0.045) - action * 0.16, running ? 0.025 * Math.cos(t * frequency) : Math.sin(t * 0.8) * 0.20, running ? -0.02 * stride : Math.sin(t * 0.6) * 0.065);
    p.legs.forEach(function (leg) {
      var wave = Math.sin(t * frequency + leg.phase);
      leg.hip.rotation.set(running ? wave * 0.58 + (leg.front ? -action * 0.35 : action * 0.15) : 0, 0, 0);
      leg.knee.rotation.set(running ? 0.10 + Math.max(0, -wave) * 0.45 : 0, 0, 0);
    });
    p.tail.rotation.set(Math.sin(t * (running ? 6 : 3)) * 0.08, Math.sin(t * (running ? 9 : 5)) * (running ? 0.35 : 0.26), 0);
    p.ears.forEach(function (ear, i) {
      var floppy = group.userData.definition.ears === "floppy";
      ear.rotation.set(Math.sin(t * (running ? 12 : 2.6) + i * 0.7) * (floppy ? running ? 0.23 : 0.07 : 0.035), 0, (i ? 1 : -1) * action * 0.06);
    });
    var blink = !running && Math.sin(t * 0.74) > 0.975 ? 0.13 : 1;
    p.eyes.forEach(function (eye) { eye.scale.y = blink; });
  }

  function animateDogIdle(group, t) { animate(group, t, false); }
  function animateDogRun(group, t) { animate(group, t, true); }
  function triggerDogAction(group) {
    if (!group || !group.userData || !group.userData.anim) return;
    var a = group.userData.anim;
    a.actionStart = Number.isFinite(a.lastTime) ? a.lastTime : null; a.actionPending = true;
  }
  function setDogGlow(group, hexOrNull) {
    if (!group || !group.userData || !group.userData.glowMats) return;
    group.userData.glowMats.forEach(function (m) {
      m.emissive.setHex(hexOrNull == null ? m.userData.baseEmissive : hexOrNull);
      m.emissiveIntensity = hexOrNull == null ? m.userData.baseEmissiveIntensity : 0.75;
    });
  }

  global.GameDogs = { createDog: createDog, animateDogIdle: animateDogIdle, animateDogRun: animateDogRun, triggerDogAction: triggerDogAction, setDogGlow: setDogGlow, definitions: definitions };
})(window);
