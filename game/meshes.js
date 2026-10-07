/* meshes.js — window.GameArt
 * Pure procedural Three.js (r160). Bright, saturated cartoon/toon look.
 * Procedural park, kitchen and neighborhood art for Pizza Pups.
 * Everything is a THREE.Group. iPad-friendly poly counts.
 * Models face -Z along the route; feet rest at y = 0.
 */
(function (global) {
  "use strict";

  var THREE = global.THREE;

  // =====================================================================
  //  helpers
  // =====================================================================

  function shadowify(root, cast, receive) {
    cast = cast !== false; receive = receive !== false;
    root.traverse(function (o) {
      if (o.isMesh && !o.userData.noShadow) { o.castShadow = cast; o.receiveShadow = receive; }
    });
  }

  // A shared backface material outlines the vegetable silhouettes.
  var OUTLINE_MAT = null;
  function outlineMat() {
    if (!OUTLINE_MAT) OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x283e25, side: THREE.BackSide });
    return OUTLINE_MAT;
  }
  function addOutline(mesh, scale) {
    var o = new THREE.Mesh(mesh.geometry, outlineMat());
    o.scale.setScalar(scale || 1.07);
    o.userData.noShadow = true;
    o.castShadow = false; o.receiveShadow = false;
    mesh.add(o);
    return o;
  }

  function srgb(tex) { if (tex && "colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace; return tex; }

  // =====================================================================
  //  shared textures (cached)
  // =====================================================================

  var _tex = {};

  function checkerTexture() {
    if (_tex.checker) return _tex.checker;
    var n = 8, s = 64, c = document.createElement("canvas");
    c.width = c.height = n * s; var ctx = c.getContext("2d");
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      ctx.fillStyle = ((x + y) % 2) ? "#e9412e" : "#fbf0da";
      ctx.fillRect(x * s, y * s, s, s);
    }
    ctx.strokeStyle = "rgba(0,0,0,0.08)"; ctx.lineWidth = 2;
    for (var i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, n * s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(n * s, i * s); ctx.stroke(); }
    var t = srgb(new THREE.CanvasTexture(c));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    _tex.checker = t; return t;
  }

  function skylineTexture() {
    if (_tex.skyline) return _tex.skyline;
    var w = 1024, h = 256, c = document.createElement("canvas");
    c.width = w; c.height = h; var ctx = c.getContext("2d");
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#ffd3ae"); grad.addColorStop(1, "#f8e4c9");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    // building silhouettes
    var x = 0;
    while (x < w) {
      var bw = 40 + Math.random() * 90;
      var bh = 60 + Math.random() * 150;
      var palette = ["#c78d86", "#8fa2b1", "#d4b67e", "#c19bb6", "#96b5a1"];
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      ctx.fillRect(x, h - bh, bw, bh);
      ctx.fillStyle = "#9b776b";
      ctx.beginPath(); ctx.moveTo(x - 3, h - bh); ctx.lineTo(x + bw / 2, h - bh - 12); ctx.lineTo(x + bw + 3, h - bh); ctx.closePath(); ctx.fill();
      // windows
      ctx.fillStyle = "rgba(255,220,120,0.85)";
      for (var wy = h - bh + 10; wy < h - 8; wy += 18) {
        for (var wx = x + 6; wx < x + bw - 8; wx += 16) {
          if (Math.random() < 0.55) ctx.fillRect(wx, wy, 7, 9);
        }
      }
      x += bw + 6;
    }
    _tex.skyline = srgb(new THREE.CanvasTexture(c));
    return _tex.skyline;
  }

  // Character geometry and animation share the dedicated dog model module.
  function createDog(id) { return global.GameDogs.createDog(id); }
  function animateDogIdle(group, time) { return global.GameDogs.animateDogIdle(group, time); }
  function animateDogRun(group, time) { return global.GameDogs.animateDogRun(group, time); }
  function triggerDogAction(group) { return global.GameDogs.triggerDogAction(group); }
  function setDogGlow(group, color) { return global.GameDogs.setDogGlow(group, color); }

  // =====================================================================
  //  FOES (friendly veggies)
  // =====================================================================

  function createFoe(type) {
    type = type || "scout";
    var g = new THREE.Group();
    var bob = new THREE.Group();
    g.add(bob);

    var scale = 1, floretHex = 0x3aa62f, stalkHex = 0xd7e6a0, emissive = 0x0a2a08;
    if (type === "hopper") { floretHex = 0x2b7a24; }
    if (type === "bomber") { floretHex = 0xe5432b; }
    if (type === "boss") { floretHex = 0x2f8f28; scale = 2.3; }

    var eyeW = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80, specular: 0x888888 });
    var eyeB = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 100, specular: 0x445 });
    var browMat = new THREE.MeshStandardMaterial({ color: 0x123309, roughness: 0.7 });
    if (type === "bomber") {
      var footMat = new THREE.MeshStandardMaterial({ color: stalkHex, roughness: 0.7 });
      // cute round tomato
      var tomatoMat = new THREE.MeshStandardMaterial({ color: floretHex, roughness: 0.4, emissive: 0x3a0a04, emissiveIntensity: 0.25 });
      var body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 22, 18), tomatoMat);
      body.scale.set(1.1, 0.95, 1.1); body.position.y = 0.55; addOutline(body, 1.05); bob.add(body);
      var leaf = new THREE.MeshStandardMaterial({ color: 0x3a9e30, roughness: 0.6 });
      for (var i = 0; i < 5; i++) {
        var a = (i / 5) * Math.PI * 2;
        var lf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 5), leaf);
        lf.position.set(Math.cos(a) * 0.12, 1.02, Math.sin(a) * 0.12); lf.rotation.z = Math.cos(a) * 0.5; lf.rotation.x = Math.sin(a) * 0.5;
        bob.add(lf);
      }
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.18, 8), leaf); stem.position.y = 1.06; bob.add(stem);
      // fuse spark
      var fuse = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd23a }));
      fuse.position.y = 1.18; bob.add(fuse);
      bob.userData.fuse = fuse;
      // eyes
      addFace(bob, 0.5, 0.5, 0.14, eyeW, eyeB, browMat, true);
      addFeet(bob, footMat);
    } else {
      // broccoli
      var floretMat = new THREE.MeshStandardMaterial({ color: floretHex, roughness: 0.7, emissive: emissive, emissiveIntensity: 0.3, flatShading: true });
      var stalkMat = new THREE.MeshStandardMaterial({ color: stalkHex, roughness: 0.72 });
      var stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.5, 12), stalkMat);
      stalk.position.y = 0.25; addOutline(stalk, 1.06); bob.add(stalk);
      var core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), floretMat);
      core.position.y = 0.78; addOutline(core, 1.05); bob.add(core);
      var mini = new THREE.IcosahedronGeometry(0.18, 0);
      [[0.36, 0.84, 0.12], [-0.32, 0.8, -0.08], [0.06, 1.08, 0.22], [-0.14, 1.1, -0.18], [0.24, 0.62, -0.3], [-0.24, 0.64, 0.27]].forEach(function (q) {
        var m = new THREE.Mesh(mini, floretMat); m.position.set(q[0], q[1], q[2]); bob.add(m);
      });
      addFace(bob, 0.78, 0.14, 0.38, eyeW, eyeB, browMat, false);
      addFeet(bob, stalkMat);

      if (type === "hopper") {
        var leafMat = new THREE.MeshStandardMaterial({ color: 0x8bc741, roughness: 0.8 });
        [-1, 1].forEach(function (side) {
          var leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), leafMat);
          leaf.scale.set(0.6, 1.7, 0.35);
          leaf.position.set(side * 0.1, 1.25, 0.02);
          leaf.rotation.z = side * 0.35;
          bob.add(leaf);
        });
      }
      if (type === "boss") {
        var spikeMat = new THREE.MeshStandardMaterial({ color: 0x1f4a17, roughness: 0.5, metalness: 0.2 });
        [[0.5, 0.95, 0], [-0.5, 0.95, 0], [0, 1.3, 0], [0, 0.8, 0.5], [0, 0.8, -0.5], [0.38, 1.15, 0.2], [-0.38, 1.15, 0.2]].forEach(function (d) {
          var sp = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.4, 7), spikeMat);
          sp.position.set(d[0], d[1], d[2]);
          sp.lookAt(d[0] * 3, d[1] + 1, d[2] * 3);
          bob.add(sp);
        });
        // crown scowl brows already added; make bigger angry brows
      }
    }

    g.scale.setScalar(scale);
    shadowify(g);
    g.userData.type = type;
    g.userData.parts = { bob: bob };
    return g;

    function addFace(parent, eyeY, faceOffY, zFront, ew, eb, bm, small) {
      var eR = small ? 0.12 : 0.11;
      var eL = new THREE.Mesh(new THREE.SphereGeometry(eR, 14, 12), ew); eL.position.set(-0.15, eyeY, -zFront); eL.scale.set(1, 1.15, 0.7); parent.add(eL);
      var eRr = eL.clone(); eRr.position.x = 0.15; parent.add(eRr);
      var pL = new THREE.Mesh(new THREE.SphereGeometry(eR * 0.5, 10, 8), eb); pL.position.set(-0.15, eyeY - 0.02, -zFront - 0.07); parent.add(pL);
      var pR = pL.clone(); pR.position.x = 0.15; parent.add(pR);
      var sh = new THREE.Mesh(new THREE.SphereGeometry(eR * 0.25, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      var s1 = sh.clone(); s1.position.set(-0.19, eyeY + 0.04, -zFront - 0.1); parent.add(s1);
      var s2 = sh.clone(); s2.position.set(0.11, eyeY + 0.04, -zFront - 0.1); parent.add(s2);
      // angry eyebrows
      var bL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.05), bm); bL.position.set(-0.15, eyeY + 0.14, -zFront - 0.02); bL.rotation.z = 0.5; parent.add(bL);
      var bR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.05), bm); bR.position.set(0.15, eyeY + 0.14, -zFront - 0.02); bR.rotation.z = -0.5; parent.add(bR);
      // little smile
      var mouth = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x2a1010 }));
      mouth.position.set(0, eyeY - 0.16, -zFront - 0.02); mouth.rotation.set(Math.PI + 0.1, 0, 0); parent.add(mouth);
    }
    function addFeet(parent, fm) {
      var f1 = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), fm); f1.position.set(-0.17, 0.07, 0.06); f1.scale.set(1, 0.7, 1.3); parent.add(f1);
      var f2 = f1.clone(); f2.position.x = 0.17; parent.add(f2);
    }
  }

  function animateFoe(group, t) {
    var p = group.userData.parts, bob = p && p.bob; if (!bob) return;
    var type = group.userData.type;
    if (type === "hopper") {
      bob.rotation.y = Math.sin(t * 3) * 0.35;
      bob.position.y = Math.abs(Math.sin(t * 7)) * 0.24;
    } else if (type === "boss") {
      bob.position.y = Math.sin(t * 2) * 0.07;
      bob.rotation.z = Math.sin(t * 1.4) * 0.06;
      bob.rotation.y = Math.sin(t * 0.8) * 0.15;
    } else if (type === "bomber") {
      bob.position.y = Math.abs(Math.sin(t * 8)) * 0.12;
      if (bob.userData.fuse) { var s = 0.7 + Math.abs(Math.sin(t * 18)) * 0.6; bob.userData.fuse.scale.setScalar(s); }
    } else {
      bob.position.y = Math.abs(Math.sin(t * 6)) * 0.16;
      bob.rotation.y = Math.sin(t * 3) * 0.22;
    }
  }

  // =====================================================================
  //  PIZZA
  // =====================================================================

  function createPizza(gold) {
    var g = new THREE.Group();
    var spin = new THREE.Group();
    g.add(spin);
    var crustMat = new THREE.MeshStandardMaterial({ color: gold ? 0xffd24a : 0xd39a4a, roughness: 0.65, metalness: gold ? 0.45 : 0, emissive: gold ? 0xffa800 : 0x2a1500, emissiveIntensity: gold ? 0.6 : 0.08 });
    var cheeseMat = new THREE.MeshStandardMaterial({ color: gold ? 0xfff0a0 : 0xffcf5e, roughness: 0.5, emissive: gold ? 0xffe060 : 0x3a2a00, emissiveIntensity: gold ? 0.45 : 0.05 });
    var pepMat = new THREE.MeshStandardMaterial({ color: gold ? 0xffb84a : 0xc0301c, roughness: 0.45, emissive: gold ? 0xff9020 : 0x200500, emissiveIntensity: gold ? 0.4 : 0 });

    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.54, 0.1, 30), crustMat);
    spin.add(base);
    var cheese = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 30), cheeseMat);
    cheese.position.y = 0.06; spin.add(cheese);
    var pepGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.03, 14);
    [[0, 0], [0.22, 0.15], [-0.2, 0.17], [0.14, -0.24], [-0.26, -0.09], [0.28, -0.07], [-0.06, 0.28]].forEach(function (q) {
      var m = new THREE.Mesh(pepGeo, pepMat); m.position.set(q[0], 0.1, q[1]); spin.add(m);
    });
    for (var i = 0; i < 5; i++) {
      var blob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), cheeseMat);
      blob.position.set(Math.cos(i * 1.3) * 0.28, 0.09, Math.sin(i * 1.3) * 0.28); blob.scale.set(1, 0.5, 1); spin.add(blob);
    }
    if (gold) {
      var star = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 30), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.7 }));
      star.rotation.x = Math.PI / 2; g.add(star); g.userData.halo = star;
    }
    shadowify(g);
    g.userData.type = "pizza";
    g.userData.gold = !!gold;
    g.userData.parts = { spin: spin };
    return g;
  }

  function animatePizza(group, t) {
    var p = group.userData.parts, spin = (p && p.spin) || group;
    var gold = !!group.userData.gold;
    spin.rotation.y = t * (gold ? 3.4 : 2.0);
    spin.rotation.z = Math.sin(t * 3) * 0.1;
    spin.position.y = Math.sin(t * 4) * 0.07;
    if (gold) {
      var s = 1 + Math.sin(t * 6) * 0.06; spin.scale.set(s, s, s);
      if (group.userData.halo) { group.userData.halo.rotation.z = t * 2; group.userData.halo.scale.setScalar(1 + Math.sin(t * 5) * 0.15); }
    }
  }

  // =====================================================================
  //  GROUND CHUNKS (3 worlds)
  // =====================================================================

  function createGroundChunk(world, length) {
    length = length == null ? 20 : length;
    if (world === 2) return pizzeriaChunk(length);
    if (world === 3) return rooftopChunk(length);
    return parkChunk(length);
  }

  function repeatMap(base, rx, ry) {
    var t = base.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t;
  }

  function parkChunk(length) {
    var g = new THREE.Group();
    var grassMat = new THREE.MeshStandardMaterial({ color: 0x8cce63, roughness: 1 });
    var pathMat = new THREE.MeshStandardMaterial({ color: 0xe9cda3, roughness: 0.95 });
    var woodMat = new THREE.MeshStandardMaterial({ color: 0xb9834d, roughness: 0.85 });
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x8d5c36, roughness: 0.9 });
    var leafMat = new THREE.MeshStandardMaterial({ color: 0x54a64b, roughness: 0.85, flatShading: true });
    var flowerColors = [0xffd05b, 0xf795b4, 0xbba3e4];
    var flowerMats = flowerColors.map(function (color) {
      return new THREE.MeshStandardMaterial({ color: color, roughness: 0.8 });
    });
    var grass = new THREE.Mesh(new THREE.BoxGeometry(22, 0.4, length), grassMat);
    grass.position.y = -0.22; grass.receiveShadow = true; g.add(grass);
    var path = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.12, length), pathMat);
    path.position.y = -0.06; path.receiveShadow = true; g.add(path);

    var postGeo = new THREE.BoxGeometry(0.13, 0.85, 0.13);
    var railGeo = new THREE.BoxGeometry(0.09, 0.1, length);
    var trunkGeo = new THREE.CylinderGeometry(0.16, 0.25, 1.9, 7);
    var crownGeo = new THREE.IcosahedronGeometry(1.2, 1);
    var stemGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.35, 5);
    var petalGeo = new THREE.SphereGeometry(0.12, 6, 5);
    var lampPoleGeo = new THREE.CylinderGeometry(0.045, 0.06, 2.25, 6);
    var lampMat = new THREE.MeshStandardMaterial({ color: 0x546653, roughness: 0.6 });
    var lampTopMat = new THREE.MeshStandardMaterial({ color: 0xfff3ca, emissive: 0xffd175, emissiveIntensity: 0.45 });

    [-1, 1].forEach(function (side) {
      [0.34, 0.66].forEach(function (height) {
        var rail = new THREE.Mesh(railGeo, woodMat);
        rail.position.set(side * 5.05, height, 0); g.add(rail);
      });
      var sections = Math.max(1, Math.ceil(length / 8));
      for (var i = 0; i < sections; i++) {
        var z = -length / 2 + (i + 0.5) * length / sections;
        var post = new THREE.Mesh(postGeo, woodMat);
        post.position.set(side * 5.05, 0.425, z); g.add(post);
        if (i % 2 === 0) {
          var trunk = new THREE.Mesh(trunkGeo, trunkMat);
          trunk.position.set(side * (7.4 + (i % 3) * 0.3), 0.95, z); trunk.castShadow = true; g.add(trunk);
          var crown = new THREE.Mesh(crownGeo, leafMat);
          crown.scale.set(1.05, 1.25, 1);
          crown.position.set(trunk.position.x, 2.4, z); crown.castShadow = true; g.add(crown);
        }
        var stem = new THREE.Mesh(stemGeo, leafMat);
        stem.position.set(side * 4.45, 0.175, z + 1); g.add(stem);
        var flower = new THREE.Mesh(petalGeo, flowerMats[i % flowerMats.length]);
        flower.scale.set(1.2, 0.55, 1.2); flower.position.set(side * 4.45, 0.35, z + 1);
        flower.userData.sway = true; flower.userData.phase = i + side; g.add(flower);
      }
      var pole = new THREE.Mesh(lampPoleGeo, lampMat);
      pole.position.set(side * 5.55, 1.125, side * length / 4); g.add(pole);
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), lampTopMat);
      lamp.position.set(pole.position.x, 2.28, pole.position.z); g.add(lamp);
      var cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.15, 8), lampMat);
      cap.position.set(pole.position.x, 2.49, pole.position.z); g.add(cap);
    });
    g.userData.type = "ground"; g.userData.world = 1; g.userData.length = length;
    return g;
  }

  function pizzeriaChunk(length) {
    var g = new THREE.Group();
    var width = 9, height = 5;
    var floorMat = new THREE.MeshStandardMaterial({ map: repeatMap(checkerTexture(), length / 3, width / 3), roughness: 0.5 });
    var floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.4, length), floorMat);
    floor.position.y = -0.2; floor.receiveShadow = true; g.add(floor);
    var wallMat = new THREE.MeshStandardMaterial({ color: 0xf6c98a, roughness: 0.8 });
    var wainMat = new THREE.MeshStandardMaterial({ color: 0xc9793a, roughness: 0.7 });
    [-1, 1].forEach(function (sx) {
      var wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, height, length), wallMat);
      wall.position.set(sx * width / 2, height / 2, 0); wall.receiveShadow = true; g.add(wall);
      var wain = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.4, length), wainMat);
      wain.position.set(sx * width / 2, 0.7, 0); g.add(wain);
      // counters with pots
      var counterMat = new THREE.MeshStandardMaterial({ color: 0xded4c4, roughness: 0.6 });
      var counter = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, length * 0.9), counterMat);
      counter.position.set(sx * (width / 2 - 0.7), 0.5, 0); counter.receiveShadow = true; g.add(counter);
      var potMat = new THREE.MeshStandardMaterial({ color: 0x333840, roughness: 0.4, metalness: 0.6 });
      for (var pj = 0; pj < 2; pj++) {
        var pz = -length / 3 + pj * (length / 2);
        var pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.34, 16), potMat);
        pot.position.set(sx * (width / 2 - 0.7), 1.17, pz); g.add(pot);
        var cheese = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffdf7a, roughness: 0.4, emissive: 0x6a5010, emissiveIntensity: 0.2 }));
        cheese.position.set(sx * (width / 2 - 0.7), 1.34, pz); g.add(cheese);
      }
    });
    // ceiling with hanging lamps
    var ceil = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, length), new THREE.MeshStandardMaterial({ color: 0xe8b878, roughness: 0.8 }));
    ceil.position.y = height; g.add(ceil);
    for (var i = 0; i < 3; i++) {
      var lz = -length / 2 + 4 + i * (length / 3);
      var lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffcf60, emissiveIntensity: 2.2 });
      var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2), lampMat);
      lamp.rotation.x = Math.PI; lamp.position.set(0, height - 0.6, lz); g.add(lamp);
      var cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x222 })); cord.position.set(0, height - 0.3, lz); g.add(cord);
      var light = new THREE.PointLight(0xffd070, 1.2, 14, 1.6); light.position.set(0, height - 0.8, lz); g.add(light);
    }
    g.userData.type = "ground"; g.userData.world = 2; g.userData.length = length;
    return g;
  }

  function rooftopChunk(length) {
    var g = new THREE.Group();
    var width = 9;
    var roofMat = new THREE.MeshStandardMaterial({ color: 0xcfa486, roughness: 0.85 });
    var floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.4, length), roofMat);
    floor.position.y = -0.2; floor.receiveShadow = true; g.add(floor);
    // gravel specks / vents
    var ventMat = new THREE.MeshStandardMaterial({ color: 0x8894b0, roughness: 0.5, metalness: 0.4 });
    for (var v = 0; v < 3; v++) {
      var vz = -length / 2 + 5 + v * (length / 3);
      var vent = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), ventMat);
      vent.position.set((v % 2 ? 1 : -1) * 3, 0.25, vz); g.add(vent);
    }
    // parapet walls
    var parapetMat = new THREE.MeshStandardMaterial({ color: 0xf0d4b2, roughness: 0.8 });
    [-1, 1].forEach(function (sx) {
      var wall = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.0, length), parapetMat);
      wall.position.set(sx * width / 2, 0.5, 0); g.add(wall);
    });
    // city skyline billboards (both sides)
    var skyMat = new THREE.MeshBasicMaterial({ map: repeatMap(skylineTexture(), length / 22, 1), transparent: false });
    [-1, 1].forEach(function (sx) {
      var sky = new THREE.Mesh(new THREE.PlaneGeometry(length, 5), skyMat);
      sky.position.set(sx * (width / 2 + 3), 2.2, 0); sky.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      sky.castShadow = false; sky.receiveShadow = false; g.add(sky);
    });
    // string lights across
    var bulbColors = [0xff5a5a, 0xffd23a, 0x5affa0, 0x5ab8ff, 0xff8adf];
    for (var s = 0; s < 3; s++) {
      var sz = -length / 2 + 5 + s * (length / 3);
      var wire = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, width, 5), new THREE.MeshStandardMaterial({ color: 0x222 }));
      wire.rotation.z = Math.PI / 2; wire.position.set(0, 2.4, sz); g.add(wire);
      for (var bI = 0; bI < 7; bI++) {
        var col = bulbColors[bI % bulbColors.length];
        var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.8 }));
        bulb.position.set(-width / 2 + 0.6 + bI * (width - 1.2) / 6, 2.3 - Math.sin(bI / 6 * Math.PI) * 0.15, sz);
        bulb.userData.twinkle = true; bulb.userData.phase = Math.random() * 6.28; g.add(bulb);
      }
    }
    g.userData.type = "ground"; g.userData.world = 3; g.userData.length = length;
    return g;
  }

  function animateGroundChunk(group, t) {
    if (!group) return;
    group.traverse(function (o) {
      if (o.userData && o.userData.sway) {
        o.rotation.z = Math.sin(t * 2 + o.userData.phase) * 0.12;
      } else if (o.userData && o.userData.twinkle) {
        var m = o.material; if (m) m.emissiveIntensity = 1.2 + Math.abs(Math.sin(t * 3 + o.userData.phase)) * 1.2;
      }
    });
  }

  // =====================================================================
  //  LANE GLOW
  // =====================================================================

  function createLaneGlow(laneXs) {
    laneXs = laneXs || [-2.2, 0, 2.2];
    var g = new THREE.Group();
    var stripLen = 60;
    laneXs.forEach(function (x, idx) {
      var color = (idx === 1) ? 0x7dffbf : 0x66c8ff;
      var strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, stripLen), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.45 }));
      strip.position.set(x, 0.03, 0); g.add(strip);
      for (var i = 0; i < 14; i++) {
        var dot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.4), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 }));
        dot.position.set(x, 0.045, -stripLen / 2 + i * (stripLen / 14) + 1); g.add(dot);
      }
    });
    g.userData.type = "laneGlow";
    return g;
  }

  // =====================================================================
  //  SPEED LINES
  // =====================================================================

  function createSpeedLines() {
    var g = new THREE.Group();
    var mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    for (var i = 0; i < 26; i++) {
      var line = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1.6 + Math.random() * 1.4), mat.clone());
      line.userData.baseX = (Math.random() - 0.5) * 8;
      line.userData.baseY = 0.4 + Math.random() * 3.6;
      line.userData.offset = Math.random() * 60;
      line.userData.speed = 0.7 + Math.random() * 1.6;
      line.position.set(line.userData.baseX, line.userData.baseY, 0);
      g.add(line);
    }
    g.userData.type = "speedLines"; g.userData.range = 40; g.visible = false;
    return g;
  }

  function animateSpeedLines(group, t, intensity) {
    if (!group || group.userData.type !== "speedLines") return;
    var range = group.userData.range || 40;
    var spd = Math.max(0, intensity == null ? 1 : intensity);
    group.visible = spd > 0.05;
    if (!group.visible) return;
    var boost = Math.min(1, spd / 3);
    group.children.forEach(function (line) {
      var u = line.userData;
      var z = (((t * (10 + spd * 12) * u.speed) + u.offset) % range) - range / 2;
      line.position.z = z;
      line.position.x = u.baseX + Math.sin(t * 2 + u.offset) * 0.05;
      line.scale.z = 1 + spd * 0.6;
      if (line.material) line.material.opacity = 0.3 * boost + 0.2;
    });
  }

  // =====================================================================
  //  FX
  // =====================================================================

  function createFX(kind, color) {
    kind = kind || "spark";
    color = color == null ? 0xffe27a : color;
    var g = new THREE.Group();
    g.userData.type = "fx";
    g.userData.kind = kind;

    if (kind === "ring") {
      var mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 });
      var ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 24), mat); ring.rotation.x = -Math.PI / 2; g.add(ring);
      var disc = new THREE.Mesh(new THREE.CircleGeometry(0.28, 18), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.005; g.add(disc);
      g.userData.ring = { total: 0.5, elapsed: 0, mat: mat, discMat: disc.material };
      g.userData.life = 0.5;
      return g;
    }
    if (kind === "star") {
      var starMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 });
      for (var s = 0; s < 8; s++) {
        var st = new THREE.Mesh(new THREE.TetrahedronGeometry(0.1), starMat.clone());
        var a = Math.random() * Math.PI * 2;
        st.position.set(Math.cos(a) * 0.15, Math.random() * 0.2, Math.sin(a) * 0.15);
        st.userData.vel = new THREE.Vector3(Math.cos(a) * 2.5, 2 + Math.random() * 2.5, Math.sin(a) * 2.5);
        st.userData.spin = (Math.random() - 0.5) * 12;
        g.add(st);
      }
      g.userData.life = 0.8;
      return g;
    }
    if (kind === "poof") {
      var poofMat = new THREE.MeshStandardMaterial({ color: color === 0xffe27a ? 0xdfe6ee : color, transparent: true, opacity: 0.85, roughness: 1 });
      for (var pI = 0; pI < 7; pI++) {
        var puff = new THREE.Mesh(new THREE.SphereGeometry(0.12 + Math.random() * 0.1, 8, 6), poofMat.clone());
        var pa = Math.random() * Math.PI * 2;
        puff.position.set(Math.cos(pa) * 0.15, 0.1 + Math.random() * 0.15, Math.sin(pa) * 0.15);
        puff.userData.vel = new THREE.Vector3(Math.cos(pa) * 1.5, 0.8 + Math.random() * 1.2, Math.sin(pa) * 1.5);
        puff.userData.grow = 1.5 + Math.random();
        g.add(puff);
      }
      g.userData.life = 0.6;
      return g;
    }
    if (kind === "confetti") {
      var palette = [0xff5a5a, 0xffd23a, 0x5affa0, 0x5ab8ff, 0xff8adf, 0xffffff];
      for (var i = 0; i < 16; i++) {
        var col = palette[i % palette.length];
        var m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.02), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5 }));
        m.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 5, 3 + Math.random() * 4, (Math.random() - 0.5) * 5);
        m.userData.spin = (Math.random() - 0.5) * 14;
        g.add(m);
      }
      g.userData.life = 0.9;
      return g;
    }
    // spark (default)
    var sparkMat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 1.6 });
    for (var k = 0; k < 12; k++) {
      var sp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), sparkMat);
      var aa = Math.random() * Math.PI * 2;
      sp.position.set(Math.cos(aa) * 0.15, Math.random() * 0.3, Math.sin(aa) * 0.15);
      sp.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4);
      g.add(sp);
    }
    g.userData.life = 0.45;
    return g;
  }

  function updateFX(group, dt) {
    if (!group || group.userData.type !== "fx") return false;
    group.userData.life -= dt;

    if (group.userData.ring) {
      var r = group.userData.ring;
      r.elapsed += dt;
      var k = Math.min(1, r.elapsed / r.total);
      var scale = 0.4 + k * 3.2;
      group.scale.set(scale, 1, scale);
      var op = 1 - k;
      if (r.mat) r.mat.opacity = op;
      if (r.discMat) r.discMat.opacity = 0.5 * op;
      return group.userData.life > 0;
    }

    var fade = Math.max(0, group.userData.life);
    group.children.forEach(function (m) {
      if (m.userData.vel) {
        m.position.addScaledVector(m.userData.vel, dt);
        m.userData.vel.y -= 9 * dt;
        if (m.userData.spin) { m.rotation.x += m.userData.spin * dt; m.rotation.y += m.userData.spin * dt * 0.7; }
        else { m.rotation.x += dt * 8; m.rotation.y += dt * 6; }
      }
      if (m.userData.grow) m.scale.multiplyScalar(1 + m.userData.grow * dt);
      if (m.material && m.material.transparent && m.material.opacity !== undefined) {
        m.material.opacity = Math.min(1, fade * 2.2);
      }
    });
    return group.userData.life > 0;
  }

  // =====================================================================
  //  WORLD THEME
  // =====================================================================

  function worldTheme(world) {
    if (world === 2) {
      return { bg: 0x3a2416, fog: 0x54331c, fogNear: 16, fogFar: 52, hemiSky: 0xffe0b0, hemiGround: 0x5a3418, hemiInt: 1.3, sunColor: 0xfff2d0, sunInt: 1.5 };
    }
    if (world === 3) {
      return { bg: 0xffd3ae, fog: 0xffdcc2, fogNear: 18, fogFar: 62, hemiSky: 0xffe2c2, hemiGround: 0x796655, hemiInt: 1.4, sunColor: 0xfff0d2, sunInt: 1.3 };
    }
    return { bg: 0xbbe5f2, fog: 0xcfeaf1, fogNear: 20, fogFar: 70, hemiSky: 0xe3f7ff, hemiGround: 0x7aa65a, hemiInt: 1.45, sunColor: 0xfff2d1, sunInt: 1.5 };
  }

  // =====================================================================
  //  ENVIRONMENT (image-based lighting for reflections)
  // =====================================================================

  function makeEnvironment(renderer) {
    if (!THREE.PMREMGenerator) return null;
    var pmrem = new THREE.PMREMGenerator(renderer);
    var s = new THREE.Scene();
    // gradient sky dome
    var sky = new THREE.Mesh(
      new THREE.SphereGeometry(50, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { top: { value: new THREE.Color(0xdfefff) }, mid: { value: new THREE.Color(0x8fb6d8) }, bot: { value: new THREE.Color(0x223142) } },
        vertexShader: "varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "varying vec3 vp; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h = normalize(vp).y; vec3 c = h > 0.0 ? mix(mid, top, h) : mix(mid, bot, -h); gl_FragColor = vec4(c, 1.0); }"
      })
    );
    s.add(sky);
    // soft bright panels → shaped highlights on glossy surfaces
    function panel(w, h, x, y, z, col) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
    }
    panel(22, 22, 0, 34, 2, 0xffffff);       // big soft key overhead
    panel(16, 26, -26, 8, 14, 0xbfd8ff);     // cool side
    panel(14, 22, 24, 5, -12, 0xffe6c0);     // warm rim
    try {
      var target = pmrem.fromScene(s, 0.04);
      var tex = target.texture;
      // The public texture owns its render target, including framebuffer storage.
      function releaseTarget() {
        tex.removeEventListener("dispose", releaseTarget);
        target.dispose();
      }
      tex.addEventListener("dispose", releaseTarget);
      return tex;
    } finally {
      pmrem.dispose();
      // Only the filtered texture survives; source geometry/materials are temporary.
      s.traverse(function (object) {
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
      });
    }
  }

  // =====================================================================
  //  export
  // =====================================================================

  global.GameArt = {
    worldTheme: worldTheme,
    makeEnvironment: makeEnvironment,
    createDog: createDog,
    animateDogIdle: animateDogIdle,
    animateDogRun: animateDogRun,
    triggerDogAction: triggerDogAction,
    setDogGlow: setDogGlow,
    createFoe: createFoe,
    animateFoe: animateFoe,
    createPizza: createPizza,
    animatePizza: animatePizza,
    createGroundChunk: createGroundChunk,
    animateGroundChunk: animateGroundChunk,
    createLaneGlow: createLaneGlow,
    createSpeedLines: createSpeedLines,
    animateSpeedLines: animateSpeedLines,
    createFX: createFX,
    updateFX: updateFX
  };

})(window);
