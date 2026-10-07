/* Pizza Pups — touch-first, no-failure adventure.
 * Consumes GameLevels, GameCore, GameDogs, GameArt and GameAudio.
 */
(() => {
  "use strict";
  const LANE_XS = [-2.2, 0, 2.2];
  const SUPER_COST = 6;
  const SAVE_KEY = "pizza-dogs-save-v1";
  const SPAWN_AHEAD = 60;
  const PLAYER_Z = 0;
  const DOGS = [
    { id: "biscuit", name: "ביסקו", letter: "B", color: 0x62a79b, superName: "נביחת שמחה", emoji: "🐶" },
    { id: "pepper", name: "פלפל", letter: "P", color: 0xbd8a95, superName: "גל שמחה", emoji: "🐾" },
    { id: "toffee", name: "טופי", letter: "T", color: 0xc4aa62, superName: "בועת הגנה", emoji: "🦴" },
    { id: "coco", name: "קוקו", letter: "C", color: 0xaa9cbf, superName: "מטר פיצות", emoji: "☁️" },
  ];
  const dogById = (id) => DOGS.find((t) => t.id === id) || DOGS[0];
  const STICKERS = [
    { id: "biscuit", label: "🐶" }, { id: "pepper", label: "🐾" }, { id: "toffee", label: "🦴" }, { id: "coco", label: "☁️" },
    { id: "pizza", label: "🍕" }, { id: "gold", label: "🌟" }, { id: "boss", label: "🥦" }, { id: "star", label: "⭐" },
    { id: "world1", label: "🌳" }, { id: "world2", label: "🍕" }, { id: "world3", label: "🏘️" }, { id: "hero", label: "🏆" },
  ];
  const STAGES = window.GameLevels;
  const Core = window.GameCore;
  if (!Core || !Array.isArray(STAGES)) {
    document.getElementById("no-webgl").hidden = false;
    document.getElementById("fallback-message").textContent = "חלק מהמשחק לא נטען. נסו לרענן בחיבור לאינטרנט.";
    document.getElementById("ui").style.display = "none";
    return;
  }
  const stageLabel = (idx) => STAGES[idx].world + "-" + ((idx % 3) + 1);

  // Validated primary save and local recovery copy share a stable storage key.
  const store = Core.createSaveStore(() => localStorage, STAGES.length, DOGS, STICKERS, SAVE_KEY);
  const loaded = store.read();
  let save = loaded.save;
  let saveAvailable = loaded.available;
  function persist() {
    const result = store.write(save);
    save = result.save; saveAvailable = result.saved;
    $("storage-note").hidden = result.saved;
    return result.saved;
  }
  function updateContinue() {
    $("btn-continue").hidden = !save.stars.some((n) => n > 0);
    $("btn-continue").textContent = "ממשיכים עם " + getDog().name + " ▶";
  }
  const getDog = () => dogById(save.dogId);

  const GA = window.GameAudio || {};
  const A = {
    unlock: () => { try { GA.unlock && GA.unlock(); } catch (_) {} },
    startMusic: (w) => { try { GA.startMusic && GA.startMusic(w); } catch (_) {} },
    stopMusic: () => { try { GA.stopMusic && GA.stopMusic(); } catch (_) {} },
    sfx: (n) => { try { GA.sfx && GA.sfx(n); } catch (_) {} },
    toggleMute: () => { try { return GA.toggleMute ? GA.toggleMute() : false; } catch (_) { return false; } },
    isMuted: () => { try { return GA.isMuted ? GA.isMuted() : false; } catch (_) { return false; } },
  };
  function unlockAudioOnce() { A.unlock(); } // iOS may suspend audio again after an interruption.

  const $ = (id) => document.getElementById(id);
  const screens = {
    start: $("screen-start"), pick: $("screen-pick"), map: $("screen-map"),
    stickers: $("screen-stickers"), game: $("screen-game"), pause: $("screen-pause"),
    clear: $("screen-clear"), retry: $("screen-retry"),
    help: $("screen-help"), settings: $("screen-settings"),
  };
  const OVERLAYS = { pause: 1, clear: 1, retry: 1 };
  let mode = "showcase";
  let frameId = 0, lastFrame = 0, showcaseTime = 0, pageHidden = document.hidden, contextLost = false;
  let helpReturn = "start", settingsReturn = "start", pendingStage = null;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const calmMotion = () => save.settings.calm || motionQuery.matches;
  const starTimers = [];
  let groundWorld = 0;
  function requestFrame() { if (!frameId && !pageHidden && !contextLost) frameId = requestAnimationFrame(frame); }

  function showScreen(name) {
    const previousFocus = document.activeElement;
    if (previousFocus instanceof HTMLElement && Object.values(screens).some((screen) => screen.contains(previousFocus))) previousFocus.blur();
    Object.values(screens).forEach((s) => { s.classList.remove("active"); s.inert = true; s.setAttribute("aria-hidden", "true"); });
    if (OVERLAYS[name]) screens.game.classList.add("active");
    screens[name].classList.add("active");
    screens[name].inert = false;
    screens[name].setAttribute("aria-hidden", "false");
    if (name !== "game") resetPointer();
    if (name === "game" || OVERLAYS[name]) mode = "game";
    else if (name === "start" || name === "pick") { mode = "showcase"; ensureShowcase(); }
    else { mode = "idle"; if (showcaseRoot) showcaseRoot.visible = false; }
    const inStage = (name === "game" || !!OVERLAYS[name]);
    if (laneGlow) laneGlow.visible = inStage;
    if (speedLines) speedLines.visible = inStage && !calmMotion();
    if (playerMesh) playerMesh.visible = inStage;
    if (worldRoot) worldRoot.visible = (mode !== "idle");
    if (showcaseRoot) showcaseRoot.visible = (mode === "showcase");
    // Gameplay itself is a focus destination so Space can remain a jump shortcut.
    const focus = name === "game" ? screens.game :
      screens[name].querySelector("[data-primary]:not([hidden]):not(:disabled)") ||
      screens[name].querySelector("button:not(:disabled):not([hidden])");
    if (focus) focus.focus({ preventScroll: true });
    if (name === "start") updateContinue();
    lastFrame = 0;
    requestFrame();
  }
  function toast(text, ms) {
    const el = $("toast");
    el.hidden = false; el.textContent = text;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, ms || 1100);
  }
  function celebrate(text) {
    $("cele-text").textContent = text;
    $("celebration").hidden = false;
    clearTimeout(celebrate._t);
    celebrate._t = setTimeout(() => { $("celebration").hidden = true; }, 1500);
  }
  function banner(text) {
    const el = $("stage-banner");
    el.hidden = false; el.textContent = text;
    clearTimeout(banner._t);
    banner._t = setTimeout(() => { el.hidden = true; }, 1500);
  }

  // Renderer and owned scene resources.
  const GAr = window.GameArt;
  const canvas = $("c3d");
  let renderer;
  try {
    if (!window.THREE) throw new Error("THREE missing");
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false,
      powerPreference: "high-performance", failIfMajorPerformanceCaveat: false,
    });
  } catch (err) {
    console.warn("WebGL unavailable:", err && err.message);
    $("no-webgl").hidden = false;
    $("ui").style.display = "none";
    return;
  }
  if (!GAr || !window.GameDogs) { console.error("Game resources missing"); $("no-webgl").hidden = false; $("ui").style.display = "none"; return; }
  renderer.setPixelRatio(Core.pixelRatio(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1, save.settings.quality));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (renderer.outputColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 220);
  camera.position.set(0, 3, 7);
  let envTex = null;
  try { envTex = GAr.makeEnvironment && GAr.makeEnvironment(renderer); } catch (_) {}
  if (envTex) scene.environment = envTex;
  let post = null;
  try { if (save.settings.quality !== "battery") post = window.GamePostFX && window.GamePostFX.create(renderer); } catch (_) { post = null; }
  const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(5, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
  scene.add(sun);
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.5);
  keyLight.position.set(0, 3, 8);
  scene.add(keyLight);
  scene.fog = new THREE.Fog(0x0a2233, 30, 150);
  const worldRoot = new THREE.Group(); scene.add(worldRoot);
  const entityRoot = new THREE.Group(); scene.add(entityRoot);
  const bossRoot = new THREE.Group(); scene.add(bossRoot);
  const showcaseRoot = new THREE.Group(); scene.add(showcaseRoot);
  const fxRoot = new THREE.Group(); scene.add(fxRoot);
  let laneGlow = null, speedLines = null, playerMesh = null;
  const fxList = [];

  function applyTheme(world) {
    let th = null;
    try { th = GAr.worldTheme && GAr.worldTheme(world); } catch (_) {}
    th = th || {};
    const bg = th.bg != null ? th.bg : 0x0a2233;
    scene.background = new THREE.Color(bg);
    scene.fog.color.set(th.fog != null ? th.fog : bg);
    scene.fog.near = th.fogNear != null ? th.fogNear : 30;
    scene.fog.far = th.fogFar != null ? th.fogFar : 150;
    hemi.color.set(th.hemiSky != null ? th.hemiSky : 0xffffff);
    hemi.groundColor.set(th.hemiGround != null ? th.hemiGround : 0x334455);
    hemi.intensity = th.hemiInt != null ? th.hemiInt : 1.1;
    sun.color.set(th.sunColor != null ? th.sunColor : 0xffffff);
    sun.intensity = th.sunInt != null ? th.sunInt : 1.5;
  }
  // Cached art textures and the shared outline material survive between dogs.
  // Ground maps are owned clones; all other owned GPU objects are released once.
  function disposeObject(object, ownedMaps = false) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    object.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material && !o.userData.noShadow) {
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          materials.add(m);
          if (ownedMaps && m.map) textures.add(m.map);
        }
      }
    });
    object.removeFromParent();
    textures.forEach((x) => x.dispose());
    materials.forEach((x) => x.dispose());
    geometries.forEach((x) => x.dispose());
  }
  function disposeGroup(g, ownedMaps = false) {
    [...g.children].forEach((child) => disposeObject(child, ownedMaps));
  }
  function clearFX() { disposeGroup(fxRoot); fxList.length = 0; }
  function clearTransientUI() {
    [toast, banner, celebrate, showCombo].forEach((fn) => clearTimeout(fn._t));
    clearTimeout(startStage._h);
    starTimers.splice(0).forEach(clearTimeout);
    ["toast", "stage-banner", "celebration", "combo", "drag-hint"].forEach((id) => { $(id).hidden = true; });
    resetPointer();
  }
  let groundChunks = [];
  let chunkLen = 40;
  const CHUNK_POOL = 4;
  function buildGround(world) {
    disposeGroup(worldRoot, true);
    worldRoot.position.z = 0;
    groundWorld = world;
    groundChunks = [];
    for (let i = 0; i < CHUNK_POOL; i++) {
      let chunk;
      try { chunk = GAr.createGroundChunk(world, chunkLen); } catch (_) { chunk = new THREE.Group(); }
      chunk.position.z = -i * chunkLen;
      worldRoot.add(chunk);
      groundChunks.push(chunk);
    }
  }
  function ensureDecor() {
    if (!laneGlow) {
      try { laneGlow = GAr.createLaneGlow(LANE_XS); } catch (_) { laneGlow = new THREE.Group(); }
      scene.add(laneGlow);
    }
    if (!speedLines) {
      try { speedLines = GAr.createSpeedLines(); } catch (_) { speedLines = new THREE.Group(); }
      scene.add(speedLines);
    }
  }
  function spawnFX(kind, pos, color) {
    if (fxList.length >= (calmMotion() ? 10 : 32)) return;
    let g = null;
    try { g = GAr.createFX(kind, color); } catch (_) { g = null; }
    if (!g) return;
    if (pos) g.position.copy(pos);
    fxRoot.add(g);
    fxList.push(g);
  }
  function updateFX(dt) {
    for (let i = fxList.length - 1; i >= 0; i--) {
      let alive = false;
      try { alive = GAr.updateFX ? GAr.updateFX(fxList[i], dt) : false; } catch (_) {}
      if (!alive) { disposeObject(fxList[i]); fxList.splice(i, 1); }
    }
  }
  let showcaseMeshes = [];
  function ensureShowcase() {
    if (groundWorld !== 1) buildGround(1);
    worldRoot.position.z = 0;
    groundChunks.forEach((c, i) => { c.position.z = -i * chunkLen; });
    applyTheme(1);
    if (showcaseMeshes.length) { showcaseRoot.visible = true; highlightShowcase(); return; }
    disposeGroup(showcaseRoot);
    showcaseMeshes = [];
    DOGS.forEach((t, i) => {
      let m;
      m = GAr.createDog(t.id);
      m.position.set((i - 1.5) * 1.9, 0, 0);
      m.rotation.y = Math.PI;
      m.userData.slot = i;
      showcaseRoot.add(m);
      showcaseMeshes.push(m);
    });
    applyTheme(1);
    ensureDecor();
    if (laneGlow) laneGlow.visible = false;
    if (speedLines) speedLines.visible = false;
    showcaseRoot.visible = true;
    highlightShowcase();
  }
  function highlightShowcase() {
    const selId = save.dogId;
    showcaseMeshes.forEach((m) => {
      const t = DOGS[m.userData.slot];
      m.scale.setScalar(t.id === selId ? 1.15 : 0.92);
    });
  }
  function spawnPlayer(dogId) {
    if (playerMesh) disposeObject(playerMesh);
    playerMesh = GAr.createDog(dogId);
    playerMesh.rotation.y = 0;
    scene.add(playerMesh);
    return playerMesh;
  }

  const G = {
    idx: 0, running: false, paused: false, time: 0, glowUntil: 0,
    dist: 0, courseLen: 200, speed: 9, baseSpeed: 9,
    lane: 1, laneX: 0, laneTargetX: 0,
    jumpY: 0, jumpV: 0, onGround: true, squash: 0,
    energy: 3, energyMax: 3, pizzas: 0, superCharge: 0,
    combo: 0, bestCombo: 0, invulnUntil: 0, shieldUntil: 0, pizzaMult: 1,
    ents: [], spawnE: 0, spawnP: 0,
    boss: null, bossHp: 0, bossMax: 0, bossHitAt: 0, bossActive: false, bossRevealT: 0,
    finished: false, camShake: 0,
  };
  function currentIntensity() { return Math.min(2.2, 0.8 + G.combo * 0.05 + (G.speed - G.baseSpeed) * 0.1); }
  function updateHud() {
    const hearts = $("hearts").children;
    const full = Math.ceil(G.energy - 0.001);
    for (let i = 0; i < hearts.length; i++) hearts[i].classList.toggle("empty", i >= full);
    const pizzaText = "🍕 " + G.pizzas;
    if ($("pizza-count").textContent !== pizzaText) $("pizza-count").textContent = pizzaText;
    const progress = Math.min(100, Math.floor(G.dist / G.courseLen * 100));
    if ($("stage-progress").value !== progress) $("stage-progress").value = progress;
    if ($("stage-label").textContent !== stageLabel(G.idx)) $("stage-label").textContent = stageLabel(G.idx);
    const ready = G.superCharge >= SUPER_COST;
    const btn = $("btn-super");
    btn.disabled = !ready;
    btn.classList.toggle("ready", ready);
    $("super-fill").style.width = Math.min(100, (G.superCharge / SUPER_COST) * 100) + "%";
    $("super-label").textContent = ready ? getDog().superName : "כוח על";
    const stg = STAGES[G.idx];
    const bar = $("boss-hp");
    if (stg.boss && G.bossActive) {
      bar.hidden = false;
      $("boss-fill").style.width = (G.bossMax ? (G.bossHp / G.bossMax) * 100 : 0) + "%";
    } else bar.hidden = true;
  }
  function showCombo() {
    const el = $("combo");
    if (G.combo >= 3) {
      el.hidden = false;
      el.textContent = "x" + G.combo;
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
    }
    clearTimeout(showCombo._t);
    showCombo._t = setTimeout(() => { el.hidden = true; }, 1200);
  }

  function spawnEnemy(def) {
    let m;
    try { m = GAr.createFoe(def.type); } catch (_) { m = new THREE.Group(); }
    m.position.set(LANE_XS[def.lane], 0, -def.at * G.courseLen);
    entityRoot.add(m);
    G.ents.push({ kind: "foe", type: def.type, lane: def.lane, baseX: LANE_XS[def.lane], mesh: m, bumped: false });
  }
  function spawnPizza(def, extraZ) {
    let m;
    try { m = GAr.createPizza(!!def.gold); } catch (_) { m = new THREE.Group(); }
    m.position.set(LANE_XS[def.lane], 0.8, -def.at * G.courseLen - (extraZ || 0));
    entityRoot.add(m);
    G.ents.push({ kind: "pizza", gold: !!def.gold, lane: def.lane, mesh: m });
  }
  function clearEntities() {
    disposeGroup(entityRoot);
    disposeGroup(bossRoot);
    G.ents = [];
    G.boss = null;
  }
  function removeEnt(ent) {
    disposeObject(ent.mesh);
    const i = G.ents.indexOf(ent);
    if (i >= 0) G.ents.splice(i, 1);
  }
  function startStage(idx) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= STAGES.length || idx > save.unlocked) return;
    clearTransientUI(); clearFX();
    G.time = 0; G.glowUntil = 0;
    unlockAudioOnce();
    const stg = STAGES[idx];
    G.idx = idx;
    G.running = true; G.paused = false; G.finished = false;
    G.dist = 0;
    G.baseSpeed = (8.5 + stg.world * 0.6) * (save.settings.gentle ? 0.8 : 1);
    G.speed = G.baseSpeed;
    G.courseLen = (8.5 + stg.world * 0.6) * stg.seconds;
    G.lane = 1; G.laneX = 0; G.laneTargetX = 0;
    G.jumpY = 0; G.jumpV = 0; G.onGround = true; G.squash = 0;
    G.energy = G.energyMax = 3;
    G.pizzas = 0; G.superCharge = 0;
    G.combo = 0; G.bestCombo = 0;
    G.invulnUntil = 0; G.shieldUntil = 0; G.pizzaMult = 1;
    G.spawnE = 0; G.spawnP = 0; G.camShake = 0;
    G.boss = null; G.bossHp = 0; G.bossMax = 0; G.bossActive = false; G.bossHitAt = 0; G.bossRevealT = 0;
    if (stg.boss) G.bossMax = G.bossHp = stg.boss.hp;
    chunkLen = 40;
    buildGround(stg.world);
    applyTheme(stg.world);
    ensureDecor();
    clearEntities();
    spawnPlayer(save.dogId);
    playerMesh.position.set(0, 0, PLAYER_Z);
    playerMesh.scale.setScalar(1.15);
    showScreen("game");
    if (laneGlow) laneGlow.visible = true;
    if (speedLines) speedLines.visible = !calmMotion();
    A.startMusic(stg.world); A.sfx("start"); updateHud();
    banner(stg.name);
    $("drag-hint").hidden = false;
    clearTimeout(startStage._h);
    startStage._h = setTimeout(() => { $("drag-hint").hidden = true; }, 3000);
    toast("קדימה, " + getDog().name + "!", 1300);
  }
  function computeStars() {
    const available = STAGES[G.idx].pickups.reduce((sum, p) => sum + (p.gold ? 3 : 1), 0);
    return Core.starsFor(G.pizzas, available);
  }
  function grantStickers() {
    const cleared = save.stars.filter((n) => n > 0).length;
    const count = Math.min(STICKERS.length, Math.ceil(cleared * STICKERS.length / STAGES.length));
    for (const sticker of STICKERS) {
      if (save.stickers.length >= count) break;
      if (!save.stickers.includes(sticker.id)) save.stickers.push(sticker.id);
    }
  }
  function finishStage() {
    if (G.finished) return;
    G.finished = true; G.running = false;
    clearTransientUI(); resetPointer(); A.stopMusic(); A.sfx("win");
    const stars = computeStars();
    const previousBest = save.stars[G.idx] || 0, previousStickers = new Set(save.stickers);
    save.stars[G.idx] = Math.max(save.stars[G.idx] || 0, stars);
    if (G.idx >= save.unlocked && G.idx < STAGES.length - 1) save.unlocked = G.idx + 1;
    grantStickers();
    const saved = persist();
    const unlockedStickers = STICKERS.filter((item) => save.stickers.includes(item.id) && !previousStickers.has(item.id));
    $("clear-rewards").textContent = unlockedStickers.length ?
      "חדש באלבום: " + unlockedStickers.map((item) => item.label).join(" ") :
      "השיא שלכם: " + "⭐".repeat(save.stars[G.idx]);
    $("clear-best").textContent = previousBest > 0 && stars > previousBest ? "שיא חדש! כל הכבוד 🌟" : "כל הרפתקה נחשבת 💚";
    $("clear-save").textContent = saved ? "ההתקדמות נשמרה במכשיר ✓" : "לא הצלחנו לשמור במכשיר. אפשר להמשיך לשחק, אך ההתקדמות עלולה להיעלם בסגירה.";
    $("clear-save").classList.toggle("save-warning", !saved);
    const stg = STAGES[G.idx];
    const lastOfAll = G.idx === STAGES.length - 1;
    $("clear-emoji").textContent = lastOfAll ? "🏆" : (stg.boss ? "🥦🎉" : "🎉");
    $("clear-title").textContent = lastOfAll ? "הצלנו את העיר!" : (stg.boss ? "ניצחתם את הבוס!" : "כל הכבוד!");
    $("stars-row").textContent = "⭐".repeat(stars) + "☆".repeat(3 - stars);
    $("clear-stats").textContent = "🍕 " + G.pizzas + "   🔥 x" + G.bestCombo;
    for (let i = 0; i < stars; i++) starTimers.push(setTimeout(() => { if (!document.hidden) A.sfx("star"); }, 200 + i * 220));
    $("btn-clear-continue").textContent = lastOfAll ? "לאלבום ולמסע 🏆" : "להרפתקה הבאה ▶";
    showScreen("clear");
  }

  function collectPizza(ent) {
    const gain = (ent.gold ? 3 : 1) * G.pizzaMult;
    G.pizzas += gain;
    G.superCharge = Math.min(SUPER_COST, G.superCharge + (ent.gold ? 3 : 1));
    G.combo += 1;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;
    const wp = new THREE.Vector3(ent.mesh.position.x, 1.0, ent.mesh.position.z + entityRoot.position.z);
    spawnFX(ent.gold ? "star" : "ring", wp, ent.gold ? 0xffd23e : 0xff8a1f);
    spawnFX("confetti", wp, ent.gold ? 0xffd23e : 0xff8a1f);
    A.sfx(ent.gold ? "gold" : "pizza"); removeEnt(ent);
    if (G.combo % 5 === 0) { A.sfx("combo"); banner("איזה יופי!"); }
    else if (G.combo >= 3) showCombo();
    updateHud();
  }
  function stumble(ent) {
    const now = G.time * 1000;
    if (now < G.invulnUntil || now < G.shieldUntil) { if (ent) bumpFoeAway(ent); return; }
    G.invulnUntil = now + 1100;
    G.energy = Math.max(0, G.energy - 1);
    if (G.energy <= 0) G.energy = 1; // A stumble is never a game over.
    G.combo = 0; G.squash = 1;
    G.camShake = Math.max(G.camShake, 0.4);
    A.sfx("hit");
    if (playerMesh) { G.glowUntil = G.time + 0.3; try { GAr.setDogGlow && GAr.setDogGlow(playerMesh, 0xff5555); } catch (_) {} }
    const scatter = 1 + (Math.random() < 0.5 ? 1 : 0);
    if (playerMesh) {
      const base = new THREE.Vector3(G.laneX, 1.0 + G.jumpY, PLAYER_Z);
      for (let i = 0; i < scatter; i++) spawnFX("poof", base.clone(), 0xffd23e);
      spawnFX("spark", base.clone(), 0xffaa33);
    }
    if (ent) { try { GAr.triggerDogAction && GAr.triggerDogAction(playerMesh); } catch (_) {} bumpFoeAway(ent); }
    updateHud();
  }
  function bumpFoeAway(ent) {
    if (!ent || ent.bumped) return;
    ent.bumped = true;
    ent.mesh.userData.vz = 26;
    ent.mesh.userData.spin = (Math.random() - 0.5) * 12;
    const wp = new THREE.Vector3(ent.mesh.position.x, 0.8, ent.mesh.position.z + entityRoot.position.z);
    spawnFX("poof", wp, 0x8bd450);
  }
  function hitBoss() {
    if (!G.boss || G.bossHp <= 0) return;
    const now = G.time * 1000;
    if (now < G.bossHitAt) return;
    G.bossHitAt = now + 500;
    G.bossHp -= 1; G.camShake = Math.max(G.camShake, 0.5);
    A.sfx("boss");
    try { GAr.triggerDogAction && GAr.triggerDogAction(playerMesh); } catch (_) {}
    const wp = new THREE.Vector3(G.boss.position.x, 1.6, G.boss.position.z);
    spawnFX("spark", wp, 0x8bd450); spawnFX("ring", wp, 0xffd23e); updateHud();
    if (G.bossHp <= 0) {
      spawnFX("confetti", wp, 0x8bd450);
      disposeObject(G.boss); G.boss = null; G.bossActive = false;
      finishStage();
    }
  }
  function activateSuper() {
    if (G.superCharge < SUPER_COST || !G.running || G.paused) return;
    G.superCharge = 0; updateHud();
    const id = getDog().id;
    A.sfx("power"); celebrate(getDog().superName);
    G.camShake = Math.max(G.camShake, 0.4);
    if (id === "biscuit" || id === "pepper") {
      [...G.ents].forEach((e) => {
        if (e.kind === "foe") {
          const wp = new THREE.Vector3(e.mesh.position.x, 0.9, e.mesh.position.z + entityRoot.position.z);
          spawnFX("confetti", wp, getDog().color);
          removeEnt(e);
        }
      });
      if (G.boss && G.bossActive) { G.bossHitAt = 0; hitBoss(); }
    } else if (id === "toffee") {
      G.shieldUntil = G.time * 1000 + 5000; G.pizzaMult = 2;
      toast("בועת הגנה! 🛡️", 1400);
    } else {
      for (let i = 0; i < 10; i++) {
        let m;
        const gold = i % 4 === 0;
        try { m = GAr.createPizza(gold); } catch (_) { m = new THREE.Group(); }
        m.position.set(LANE_XS[i % 3], 0.8, -G.dist - (12 + i * 4.5));
        entityRoot.add(m);
        G.ents.push({ kind: "pizza", gold, lane: i % 3, mesh: m });
      }
      toast("מטר פיצות! 🍕", 1400);
    }
  }

  // One pointer owns a gesture. Cancellation and secondary fingers never jump.
  const pad = $("touch-pad");
  let pointerId = null, downX = 0, downY = 0, downT = 0, downTargetX = 0, moved = false;
  function resetPointer() {
    const id = pointerId; pointerId = null; moved = false;
    try { if (id !== null && pad.hasPointerCapture(id)) pad.releasePointerCapture(id); } catch (_) {}
  }
  function snapLane() {
    G.lane = Core.nearestLane(G.laneTargetX);
    G.laneTargetX = LANE_XS[G.lane];
  }
  function tryJump() {
    if (!G.running || G.paused || !G.onGround) return;
    G.jumpV = 8.6; G.onGround = false; A.sfx("jump");
  }
  function onDown(e) {
    if (!G.running || G.paused || pointerId !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
    unlockAudioOnce(); pointerId = e.pointerId; moved = false;
    downX = e.clientX; downY = e.clientY; downT = performance.now(); downTargetX = G.laneTargetX;
    try { pad.setPointerCapture(pointerId); } catch (_) {}
    e.preventDefault();
  }
  function onMove(e) {
    if (pointerId === null || e.pointerId !== pointerId || !G.running || G.paused) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 12) moved = true;
    if (moved) {
      const span = Math.min(160, Math.max(60, pad.clientWidth * 0.23));
      G.laneTargetX = Math.max(-2.2, Math.min(2.2, downTargetX + (e.clientX - downX) / span * 2.2));
      G.lane = Core.nearestLane(G.laneTargetX);
    }
    e.preventDefault();
  }
  function onUp(e) {
    if (pointerId === null || e.pointerId !== pointerId) return;
    // Some browsers coalesce move events under load. The release position is
    // still part of the gesture and must not turn a swipe into an accidental jump.
    onMove(e);
    if (!moved && performance.now() - downT < 300) tryJump();
    snapLane(); resetPointer();
  }
  function onCancel(e) {
    if (e.pointerId !== pointerId) return;
    snapLane(); resetPointer();
  }
  pad.addEventListener("pointerdown", onDown, { passive: false });
  pad.addEventListener("pointermove", onMove, { passive: false });
  pad.addEventListener("pointerup", onUp);
  pad.addEventListener("pointercancel", onCancel);
  pad.addEventListener("lostpointercapture", onCancel);
  function moveLane(delta) {
    if (!G.running || G.paused || mode !== "game") return;
    resetPointer(); unlockAudioOnce();
    G.lane = Math.max(0, Math.min(2, Core.nearestLane(G.laneTargetX) + delta));
    G.laneTargetX = LANE_XS[G.lane];
  }
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    const dialog = document.querySelector('.screen.active[aria-modal="true"]');
    if (e.key === "Tab" && dialog && $("no-webgl").hidden) {
      const controls = [...dialog.querySelectorAll('button:not(:disabled):not([hidden]), [tabindex="0"]')];
      const first = controls[0], last = controls[controls.length - 1];
      if (first && (!dialog.contains(document.activeElement) ||
          (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last))) {
        e.preventDefault(); (e.shiftKey ? last : first).focus();
      }
      return;
    }
    if (e.key === "Escape") {
      if (screens.settings.classList.contains("active")) { e.preventDefault(); closeSettings(); return; }
      if (G.running && !G.paused) { e.preventDefault(); pauseGame(); }
      else if (screens.pause.classList.contains("active")) { e.preventDefault(); resumeGame(); }
      return;
    }
    if (target && target.closest('select, input, textarea, [contenteditable="true"]')) return;
    // Space/Enter on native buttons must activate the button, not jump instead.
    if ((e.key === " " || e.key === "Enter") && target && target.closest('button, a, [role="button"]')) return;
    if (!G.running || G.paused || contextLost) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(e.key)) e.preventDefault();
    if (e.repeat) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") moveLane(e.key === "ArrowLeft" ? -1 : 1);
    else if (e.key === "ArrowUp" || e.key === " ") tryJump();
  });

  function buildPicker() {
    const grid = $("dog-grid"); grid.innerHTML = "";
    DOGS.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "dog-card"; btn.dataset.id = t.id;
      btn.innerHTML = '<img class="portrait" src="assets/' + t.id + '.svg" alt="' + t.name + '" draggable="false" />' +
        '<span class="tname">' + t.name + '</span>' + '<span class="tsuper">' + t.emoji + " " + t.superName + '</span>';
      btn.addEventListener("click", () => {
        unlockAudioOnce(); A.sfx("select"); save.dogId = t.id; persist(); highlightShowcase(); openMap();
      });
      grid.appendChild(btn);
    });
  }
  function buildMap() {
    const board = $("map-board"); board.replaceChildren();
    const worlds = [["🌳", "פארק החברים", "מוצאים את הפיצה הראשונה"], ["🍕", "הפיצרייה", "משימת הגבינה הגדולה"], ["🏘️", "גגות השכונה", "מצילים את ארוחת הערב"]];
    worlds.forEach(([icon, name, subtitle], world) => {
      const card = document.createElement("section"); card.className = "world-card world-" + (world + 1);
      const header = document.createElement("div"); header.className = "world-heading";
      const badge = document.createElement("span"); badge.className = "world-icon"; badge.textContent = icon; badge.setAttribute("aria-hidden", "true");
      const text = document.createElement("div");
      const title = document.createElement("h3"); title.textContent = name;
      const sub = document.createElement("p"); sub.textContent = subtitle;
      text.append(title, sub); header.append(badge, text); card.append(header);
      const route = document.createElement("div"); route.className = "world-route";
      STAGES.slice(world * 3, world * 3 + 3).forEach((stg, step) => {
        const idx = world * 3 + step, locked = idx > save.unlocked, stars = save.stars[idx];
        const node = document.createElement("button"); node.type = "button";
        node.className = "level-card" + (locked ? " locked" : stars ? " done" : "") + (idx === save.unlocked ? " current" : "");
        node.disabled = locked; node.dataset.stage = idx;
        node.setAttribute("aria-label", stg.name + ", שלב " + stageLabel(idx) + (locked ? ", נעול" : ", " + stars + " מתוך 3 כוכבים"));
        if (idx === save.unlocked) node.setAttribute("aria-current", "step");
        const number = document.createElement("span"); number.className = "level-number"; number.textContent = locked ? "🔒" : stg.boss ? "🥦" : String(step + 1);
        const label = document.createElement("span"); label.className = "level-name"; label.textContent = stg.name;
        const rating = document.createElement("span"); rating.className = "level-stars"; rating.setAttribute("aria-hidden", "true"); rating.textContent = locked ? "בהמשך המסע" : "★".repeat(stars) + "☆".repeat(3 - stars);
        node.append(number, label, rating);
        node.addEventListener("click", () => { A.sfx("select"); requestStage(idx); });
        route.append(node);
      });
      card.append(route); board.append(card);
    });
    const total = save.stars.reduce((a, b) => a + b, 0);
    $("map-progress").textContent = "⭐ " + total + " מתוך 27 · " + save.stickers.length + " מתוך 12 מדבקות";
    $("btn-map-play").textContent = save.stars.every((n) => n > 0) ? "עוד הרפתקה! ▶" : "ממשיכים במסע ▶";
  }
  function buildStickers() {
    const grid = $("sticker-grid"); grid.innerHTML = "";
    STICKERS.forEach((s) => {
      const cell = document.createElement("div"); cell.className = "sticker-cell";
      if (save.stickers.includes(s.id)) { cell.classList.add("earned"); cell.textContent = s.label; }
      else cell.textContent = "❔";
      cell.setAttribute("role", "img");
      cell.setAttribute("aria-label", save.stickers.includes(s.id) ? "מדבקה שנאספה " + s.label : "מדבקה שעדיין לא נאספה");
      grid.appendChild(cell);
    });
  }
  function openMap() {
    A.stopMusic(); G.running = false; G.paused = false;
    clearTransientUI(); clearFX(); clearEntities();
    $("map-dog-label").textContent = getDog().emoji + " " + getDog().name + " · " + getDog().superName;
    buildMap(); showScreen("map");
  }
  function updateMuteBtn() {
    const muted = A.isMuted(); const b = $("btn-mute");
    b.textContent = muted ? "🔇" : "🔊";
    b.setAttribute("aria-label", "השתקת צלילים");
    b.setAttribute("aria-pressed", String(muted));
    $("setting-muted").checked = muted;
  }
  function requestStage(idx) {
    if (!save.helpSeen) { pendingStage = idx; helpReturn = "map"; showScreen("help"); }
    else startStage(idx);
  }
  function pauseGame() {
    if (!G.running || G.paused) return;
    G.paused = true; A.stopMusic(); clearTransientUI();
    $("pause-stats").textContent = STAGES[G.idx].name + " · 🍕 " + G.pizzas;
    showScreen("pause");
  }
  function resumeGame() {
    if (!G.running || contextLost || document.hidden) return;
    unlockAudioOnce(); G.paused = false;
    A.startMusic(STAGES[G.idx].world); showScreen("game");
  }
  function openSettings(from) {
    settingsReturn = from;
    $("setting-gentle").checked = save.settings.gentle;
    $("setting-calm").checked = save.settings.calm;
    $("setting-quality").value = save.settings.quality;
    $("storage-note").hidden = saveAvailable;
    $("recovery-note").hidden = !loaded.recovered;
    updateMuteBtn(); showScreen("settings");
  }
  function closeSettings() {
    save.settings.gentle = $("setting-gentle").checked;
    save.settings.calm = $("setting-calm").checked;
    save.settings.quality = $("setting-quality").value;
    persist();
    document.documentElement.classList.toggle("calm-motion", calmMotion());
    if (post) { post.dispose(); post = null; }
    if (save.settings.quality !== "battery") {
      try { post = window.GamePostFX && window.GamePostFX.create(renderer); } catch (_) {}
    }
    renderer.shadowMap.enabled = save.settings.quality !== "battery";
    if (settingsReturn === "map") buildMap();
    onResize(); showScreen(settingsReturn);
    const trigger = $("btn-settings-" + settingsReturn);
    if (trigger) trigger.focus({ preventScroll: true });
  }

  // Only simulation time advances timers, protection and boss cooldowns.
  function updateGame(dt, t) {
    G.pizzaMult = G.time * 1000 < G.shieldUntil ? 2 : 1;
    if (G.glowUntil && G.time >= G.glowUntil) {
      G.glowUntil = 0;
      try { GAr.setDogGlow && GAr.setDogGlow(playerMesh, null); } catch (_) {}
    }
    const stg = STAGES[G.idx];
    const targetSpeed = G.baseSpeed + (save.settings.gentle ? 0 : Math.min(3, G.combo * 0.12));
    G.speed += (targetSpeed - G.speed) * Math.min(1, dt * 1.5);
    G.dist += G.speed * dt;
    if (G.energy < G.energyMax) G.energy = Math.min(G.energyMax, G.energy + dt * 0.28);
    worldRoot.position.z = G.dist; entityRoot.position.z = G.dist;
    for (const c of groundChunks) {
      const eff = c.position.z + G.dist;
      if (eff > chunkLen) c.position.z -= CHUNK_POOL * chunkLen;
      try { GAr.animateGroundChunk && GAr.animateGroundChunk(c, t); } catch (_) {}
    }
    while (G.spawnE < stg.enemies.length && stg.enemies[G.spawnE].at * G.courseLen <= G.dist + SPAWN_AHEAD) spawnEnemy(stg.enemies[G.spawnE++]);
    while (G.spawnP < stg.pickups.length && stg.pickups[G.spawnP].at * G.courseLen <= G.dist + SPAWN_AHEAD) spawnPizza(stg.pickups[G.spawnP++]);
    if (stg.boss && !G.bossActive && !G.finished && G.dist >= G.courseLen * 0.82) {
      G.bossActive = true; G.bossRevealT = t;
      let m;
      try { m = GAr.createFoe("boss"); } catch (_) { m = new THREE.Group(); }
      m.position.set(0, 0, -12); bossRoot.add(m); G.boss = m;
      A.sfx("boss"); banner(stg.boss.name); updateHud();
    }
    if (playerMesh) {
      G.jumpV -= 24 * dt; G.jumpY += G.jumpV * dt;
      if (G.jumpY <= 0) {
        if (!G.onGround) { A.sfx("land"); G.squash = Math.max(G.squash, 0.7); }
        G.jumpY = 0; G.jumpV = 0; G.onGround = true;
      }
      const dx = G.laneTargetX - G.laneX;
      G.laneX += dx * Math.min(1, dt * 15);
      playerMesh.position.set(G.laneX, G.jumpY, PLAYER_Z);
      playerMesh.rotation.y = 0;
      playerMesh.rotation.z = THREE.MathUtils.clamp(-dx * 0.18, -0.4, 0.4);
      playerMesh.rotation.x = G.jumpY > 0.2 ? -0.1 : 0;
      G.squash = Math.max(0, G.squash - dt * 3.2);
      const sq = G.squash, stretch = (!G.onGround && G.jumpV > 0) ? 0.12 : 0;
      playerMesh.scale.set(1.15 * (1 + sq * 0.25 - stretch * 0.5), 1.15 * (1 - sq * 0.35 + stretch), 1.15 * (1 + sq * 0.25 - stretch * 0.5));
      try { GAr.animateDogRun && GAr.animateDogRun(playerMesh, t); } catch (_) {}
    }
    if (speedLines && speedLines.visible) { try { GAr.animateSpeedLines && GAr.animateSpeedLines(speedLines, t, currentIntensity()); } catch (_) {} }
    updateFX(dt);
    const airborne = G.jumpY > 0.6;
    for (const ent of [...G.ents]) {
      const eff = ent.mesh.position.z + G.dist;
      if (ent.mesh.userData.vz) {
        ent.mesh.position.z += ent.mesh.userData.vz * dt;
        ent.mesh.userData.vz *= (1 - dt * 1.5);
        ent.mesh.rotation.z += (ent.mesh.userData.spin || 0) * dt;
        ent.mesh.position.y += dt * 2;
      }
      if (ent.kind === "pizza") {
        try { GAr.animatePizza && GAr.animatePizza(ent.mesh, t); } catch (_) { ent.mesh.rotation.y += dt * 3; }
        const dxp = ent.mesh.position.x - G.laneX;
        const dyp = (ent.mesh.position.y || 0.8) - (G.jumpY + 0.8);
        if (Math.abs(eff) < 1.8 && Math.abs(dxp) < 1.5 && Math.abs(dyp) < 2.2) collectPizza(ent);
        else if (eff > 10) removeEnt(ent);
      } else if (ent.kind === "foe") {
        try { GAr.animateFoe && GAr.animateFoe(ent.mesh, t); } catch (_) {}
        if (ent.type === "hopper" && !ent.bumped) ent.mesh.position.x = ent.baseX + Math.sin(t * 3 + ent.mesh.id) * 0.7;
        if (!ent.bumped) {
          const dxp = ent.mesh.position.x - G.laneX;
          if (Math.abs(eff) < 1.2 && Math.abs(dxp) < 1.15) {
            if (airborne) { ent.bumped = true; ent.mesh.userData.vz = 6; }
            else stumble(ent);
          }
        }
        if (eff > 12) removeEnt(ent);
      }
    }
    if (G.boss) {
      G.boss.position.x = Math.sin(t * 1.3) * 1.6;
      G.boss.position.z = -6.2 + Math.sin(t * 0.8) * 0.9;
      try { GAr.animateFoe && GAr.animateFoe(G.boss, t); } catch (_) {}
      if (Math.abs(G.boss.position.x - G.laneX) < 1.7) hitBoss();
    }
    const now = G.time * 1000;
    if (now < G.shieldUntil) {
      for (const ent of [...G.ents]) {
        if (ent.kind === "foe" && !ent.bumped) {
          const eff = ent.mesh.position.z + G.dist;
          if (eff > -3 && eff < 4) {
            spawnFX("confetti", new THREE.Vector3(ent.mesh.position.x, 0.9, eff), 0x9b4dca);
            removeEnt(ent);
          }
        }
      }
    }
    G.camShake = Math.max(0, G.camShake - dt * 1.6);
    const bob = calmMotion() ? 0 : Math.sin(t * 11) * 0.07;
    const shx = calmMotion() ? 0 : (Math.random() - 0.5) * G.camShake;
    const shy = calmMotion() ? 0 : (Math.random() - 0.5) * G.camShake;
    const camTargetX = G.laneX * 0.45 + shx;
    camera.position.x += (camTargetX - camera.position.x) * (1 - Math.exp(-8 * dt));
    camera.position.y = 2.9 + bob + shy + G.jumpY * 0.28;
    camera.position.z = 6.4;
    camera.lookAt(G.laneX * 0.25, 1.2 + G.jumpY * 0.2, -6);
    updateHud();
    if (!G.finished) {
      if (!stg.boss && G.dist >= G.courseLen) finishStage();
      // Safety net: even a completely passive child can finish every boss.
      else if (stg.boss && G.bossActive && G.boss && (t - G.bossRevealT) > 20) {
        spawnFX("confetti", new THREE.Vector3(G.boss.position.x, 1.6, G.boss.position.z), 0x8bd450);
        disposeObject(G.boss); G.boss = null; G.bossActive = false; G.bossHp = 0;
        finishStage();
      }
    }
  }
  function updateShowcase(t) {
    showcaseMeshes.forEach((m, i) => {
      try { GAr.animateDogIdle && GAr.animateDogIdle(m, t + i * 0.6); } catch (_) {}
      m.rotation.y = Math.PI + Math.sin(t * 0.7 + i) * 0.12;
      m.position.y = Math.sin(t * 1.5 + i) * 0.04;
    });
    camera.position.set(calmMotion() ? 0 : Math.sin(t * 0.2) * 0.4, 2.4, Math.max(6.4, 4.1 / (Math.tan(camera.fov * Math.PI / 360) * camera.aspect)));
    camera.lookAt(0, 1.05, 0);
    worldRoot.position.z = (t * 2) % chunkLen;
    for (const c of groundChunks) {
      if (c.position.z + worldRoot.position.z > chunkLen) c.position.z -= CHUNK_POOL * chunkLen;
    }
  }
  function frame(timestamp) {
    frameId = 0;
    if (pageHidden || contextLost) return;
    const elapsed = lastFrame ? Math.max(0, (timestamp - lastFrame) / 1000) : 0;
    lastFrame = timestamp;
    if (mode === "game" && G.running && !G.paused) {
      for (const dt of Core.simulationSlices(elapsed)) {
        if (mode !== "game" || !G.running || G.paused) break;
        G.time += dt; updateGame(dt, G.time);
      }
    } else if (mode === "showcase") {
      showcaseTime += Math.min(0.05, elapsed);
      updateShowcase(calmMotion() ? 0 : showcaseTime);
    }
    try {
      if (post) post.render(scene, camera); else renderer.render(scene, camera);
    } catch (err) {
      if (!post) { console.error("Render failed", err); return; }
      post.dispose(); post = null;
      renderer.setRenderTarget(null); renderer.render(scene, camera);
    }
    if ((mode === "showcase" && !calmMotion()) || (mode === "game" && G.running && !G.paused)) requestFrame();
  }
  function onResize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setPixelRatio(Core.pixelRatio(w, h, window.devicePixelRatio || 1, save.settings.quality));
    renderer.setSize(w, h, false);
    if (post) post.setSize(w, h);
    requestFrame();
  }
  window.addEventListener("resize", onResize);
  function suspendPage() {
    pauseGame(); A.stopMusic(); resetPointer();
    starTimers.splice(0).forEach(clearTimeout);
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0; lastFrame = 0;
  }
  document.addEventListener("visibilitychange", () => {
    pageHidden = document.hidden;
    if (pageHidden) suspendPage(); else { lastFrame = 0; requestFrame(); }
  });
  window.addEventListener("pagehide", suspendPage);
  window.addEventListener("pageshow", () => { pageHidden = document.hidden; lastFrame = 0; requestFrame(); });
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault(); contextLost = true; suspendPage();
    $("no-webgl").hidden = false;
    $("fallback-title").textContent = "מחזירים את התמונה…";
    $("fallback-message").textContent = "המשחק בהפסקה. ההתקדמות שכבר שמרתם נשארה אצלכם.";
  });
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    if (post) { post.dispose(); post = null; }
    if (envTex) envTex.dispose();
    try { envTex = GAr.makeEnvironment(renderer); scene.environment = envTex; } catch (_) { scene.environment = null; }
    try { if (save.settings.quality !== "battery") post = window.GamePostFX && window.GamePostFX.create(renderer); } catch (_) {}
    $("no-webgl").hidden = true; onResize();
  });
  motionQuery.addEventListener("change", () => {
    document.documentElement.classList.toggle("calm-motion", calmMotion());
    if (speedLines) speedLines.visible = mode === "game" && !calmMotion();
    requestFrame();
  });

  function bind() {
    $("btn-left").addEventListener("click", () => moveLane(-1));
    $("btn-right").addEventListener("click", () => moveLane(1));
    $("btn-jump").addEventListener("click", () => { resetPointer(); unlockAudioOnce(); tryJump(); });
    $("btn-continue").addEventListener("click", () => { unlockAudioOnce(); openMap(); });
    $("btn-clear-replay").addEventListener("click", () => startStage(G.idx));
    $("btn-settings-map").addEventListener("click", () => openSettings("map"));
    $("btn-start").addEventListener("click", () => { unlockAudioOnce(); A.sfx("start"); buildPicker(); showScreen("pick"); });
    $("btn-pick-back").addEventListener("click", () => { A.sfx("select"); showScreen("start"); });
    $("btn-map-repick").addEventListener("click", () => { A.sfx("select"); buildPicker(); showScreen("pick"); });
    $("btn-stickers").addEventListener("click", () => { A.sfx("select"); buildStickers(); showScreen("stickers"); });
    $("btn-stickers-back").addEventListener("click", () => { A.sfx("select"); showScreen("map"); });
    $("btn-pause").addEventListener("click", pauseGame);
    $("btn-resume").addEventListener("click", resumeGame);
    $("btn-exit-map").addEventListener("click", () => { A.sfx("select"); openMap(); });
    $("btn-retry").addEventListener("click", () => { A.sfx("select"); startStage(G.idx); });
    $("btn-retry-map").addEventListener("click", () => { A.sfx("select"); openMap(); });
    $("btn-clear-continue").addEventListener("click", () => { A.sfx("select"); if (G.idx < STAGES.length - 1) requestStage(G.idx + 1); else openMap(); });
    $("btn-clear-map").addEventListener("click", openMap);
    $("btn-map-play").addEventListener("click", () => requestStage(save.unlocked));
    $("btn-settings-start").addEventListener("click", () => openSettings("start"));
    $("btn-settings-pause").addEventListener("click", () => openSettings("pause"));
    $("btn-settings-back").addEventListener("click", closeSettings);
    $("setting-muted").addEventListener("change", () => { unlockAudioOnce(); GA.setMuted && GA.setMuted($("setting-muted").checked); updateMuteBtn(); });
    $("btn-help").addEventListener("click", () => { helpReturn = "start"; pendingStage = null; showScreen("help"); });
    $("btn-help-done").addEventListener("click", () => {
      save.helpSeen = true; persist();
      const idx = pendingStage; pendingStage = null;
      if (idx !== null) startStage(idx); else showScreen(helpReturn);
    });
    $("btn-super").addEventListener("click", activateSuper);
    $("btn-mute").addEventListener("click", () => { unlockAudioOnce(); A.toggleMute(); updateMuteBtn(); });
  }
  // Merge progress from another same-origin window without changing the active
  // character/settings or restarting an in-progress stage. No feedback writes.
  window.addEventListener("storage", (event) => {
    if (event.key !== SAVE_KEY && event.key !== SAVE_KEY + ":backup") return;
    save = Core.mergeProgress(save, store.read().save, STAGES.length, DOGS, STICKERS);
    if (screens.map.classList.contains("active")) buildMap();
    if (screens.stickers.classList.contains("active")) buildStickers();
    updateContinue();
  });
  document.documentElement.classList.toggle("calm-motion", calmMotion());
  renderer.shadowMap.enabled = save.settings.quality !== "battery";
  applyTheme(1); buildGround(1); ensureDecor(); ensureShowcase(); buildPicker(); bind(); updateMuteBtn();
  $("map-dog-label").textContent = getDog().emoji + " " + getDog().name;
  showScreen("start"); onResize(); requestFrame();
  // Opt-in read-only diagnostics: no player data leaves the device.
  if (new URLSearchParams(location.search).has("diagnostics")) {
    const dogSnapshot = (group) => {
      if (!group) return null;
      let meshes = 0;
      group.traverse((object) => { if (object.isMesh) meshes++; });
      return { kind: group.userData.characterType, id: group.userData.dogId,
        legs: group.userData.legCount, meshes };
    };
    window.PizzaDiagnostics = Object.freeze({
      snapshot: () => ({ stage: G.idx, running: G.running, paused: G.paused, time: G.time,
        dist: G.dist, courseLen: G.courseLen, charge: G.superCharge, lane: G.lane, targetX: G.laneTargetX,
        jumpY: G.jumpY, onGround: G.onGround, pizzas: G.pizzas, shieldUntil: G.shieldUntil, multiplier: G.pizzaMult,
        fx: fxList.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
        pixelRatio: renderer.getPixelRatio(), frameScheduled: !!frameId, mode,
        dogId: save.dogId, playerDog: dogSnapshot(playerMesh),
        showcaseDogs: showcaseMeshes.map(dogSnapshot) }),
      contextExtension: () => renderer.getContext().getExtension("WEBGL_lose_context")
    });
  }
})();
