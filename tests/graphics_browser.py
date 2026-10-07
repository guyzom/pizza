"""Production WebGL color, quality-switching and context recovery checks."""
from __future__ import annotations
import json


PARITY_PROBE = """() => {
  const T = window.THREE;
  const renderer = new T.WebGLRenderer({antialias:false, alpha:false, preserveDrawingBuffer:true});
  renderer.setPixelRatio(1); renderer.setSize(16,16,false);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1,1,1,-1,.1,2); camera.position.z = 1;
  const geometry = new T.PlaneGeometry(2,2);
  const material = new T.MeshBasicMaterial();
  scene.add(new T.Mesh(geometry,material));
  const gl = renderer.getContext(), pixel = new Uint8Array(4), samples = [];
  let post = null, skyGeometry = null, skyMaterial = null;
  const read = () => {
    gl.readPixels(8,8,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    return Array.from(pixel);
  };
  try {
    post = GamePostFX.create(renderer,{bloomStrength:0});
    if (!post) return {supported:false,reason:'HDR float color attachments unavailable'};
    post.setSize(16,16);
    for (const exposure of [.8,1,1.2]) {
      renderer.toneMappingExposure = exposure;
      for (const color of [[.18,.18,.18],[1,.8,.5],[.08,.4,1.2],[3,.7,.2],[0,0,0]]) {
        material.color.setRGB(...color,T.LinearSRGBColorSpace);
        renderer.setRenderTarget(null); renderer.render(scene,camera);
        const direct = read();
        post.render(scene,camera); const processed = read();
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error('WebGL readback failed: '+error);
        samples.push({exposure,color,direct,processed,
          maxDifference:Math.max(...direct.slice(0,3).map((value,i)=>Math.abs(value-processed[i])))});
      }
    }
    scene.clear(); scene.background = null;
    skyGeometry = new T.SphereGeometry(190,16,8);
    skyMaterial = new T.MeshBasicMaterial({side:T.BackSide,fog:false,depthWrite:false});
    const sky = new T.Mesh(skyGeometry,skyMaterial);
    sky.frustumCulled = false; sky.renderOrder = -1000; scene.add(sky);
    const skyCamera = new T.PerspectiveCamera(55,1,.1,220), skySamples = [];
    for (const exposure of [.8,1,1.2]) {
      renderer.toneMappingExposure = exposure;
      for (const world of [1,2,3]) {
        skyMaterial.color.setHex(GameArt.worldTheme(world).bg);
        renderer.setRenderTarget(null); renderer.render(scene,skyCamera);
        const direct = read();
        post.render(scene,skyCamera); const processed = read();
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error('Sky WebGL readback failed: '+error);
        skySamples.push({exposure,world,direct,processed,
          maxDifference:Math.max(...direct.slice(0,3).map((value,i)=>Math.abs(value-processed[i])))});
      }
    }
    return {supported:true,maxDifference:Math.max(...samples.map(sample=>sample.maxDifference)),samples,
      maxSkyDifference:Math.max(...skySamples.map(sample=>sample.maxDifference)),skySamples};
  } finally {
    if (post) post.dispose();
    geometry.dispose(); material.dispose();
    if (skyGeometry) skyGeometry.dispose(); if (skyMaterial) skyMaterial.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  }
}"""


def run_graphics_checks(browser, url, out, engine, check):
    # Only progression is seeded. Quality changes use the production settings UI.
    seed = {"stars": [1] * 9, "unlocked": 8, "dogId": "biscuit", "helpSeen": True}
    context = browser.new_context(viewport={"width": 1024, "height": 768},
                                  device_scale_factor=1, reduced_motion="reduce")
    errors = []
    report = {"qualityScenes": [], "errors": errors, "passed": False}
    try:
        seed_script = """() => {
          if (!localStorage.getItem('pizza-dogs-save-v1'))
            localStorage.setItem('pizza-dogs-save-v1',SEED);
          localStorage.setItem('pizza-muted','1');
        }""".replace("SEED", json.dumps(json.dumps(seed)))
        context.add_init_script("(" + seed_script + ")()")
        page = context.new_page()
        page.set_default_timeout(30000)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.goto(url, wait_until="load")
        page.wait_for_function("!!window.PizzaDiagnostics", timeout=60000)

        def state():
            return page.evaluate("PizzaDiagnostics.snapshot()")

        initial = state()
        check("fresh graphics settings use automatic quality", initial["graphicsQuality"] == "auto")
        check("automatic quality enables supported HDR pipeline", initial["postfxActive"] == initial["postfxSupported"])
        report["colorParity"] = parity = page.evaluate(PARITY_PROBE)
        if parity["supported"]:
            check("zero-bloom HDR output matches direct ACES and sRGB", parity["maxDifference"] <= 2)
            check("GPU color samples contain opaque nonblank varied output",
                  len(parity["samples"]) == 15
                  and all(sample["direct"][3] == sample["processed"][3] == 255 for sample in parity["samples"])
                  and any(min(sample["direct"][:3]) > 20 for sample in parity["samples"])
                  and len({tuple(sample["direct"][:3]) for sample in parity["samples"]}) >= 6)
            check("all three sky colors match between HDR and direct rendering",
                  len(parity["skySamples"]) == 9 and parity["maxSkyDifference"] <= 2
                  and all(max(sample["direct"][:3]) > 20 and sample["direct"][3] == sample["processed"][3] == 255
                          for sample in parity["skySamples"]))
        else:
            check("unavailable HDR capability retains direct renderer", not initial["postfxSupported"] and not initial["postfxActive"])
        page.locator("#btn-continue").click()

        def quality(value):
            page.locator("#btn-settings-map").click()
            page.locator("#setting-quality").select_option(value)
            page.locator("#btn-settings-back").click()
            current = state()
            check(f"{value} quality uses its expected rendering pipeline",
                  current["graphicsQuality"] == value
                  and current["postfxActive"] == (value != "battery" and current["postfxSupported"]))

        # The three default scenes and the same park in the two explicit settings.
        for value, stages in (("auto", (0, 3, 6)), ("high", (0,)), ("battery", (0,))):
            quality(value)
            for stage in stages:
                page.locator(f'[data-stage="{stage}"]').click()
                page.wait_for_function("PizzaDiagnostics.snapshot().time >= .5", timeout=60000)
                current = state()
                check(f"world {stage // 3 + 1} renders in {value} quality",
                      current["stage"] == stage and current["running"] and current["geometries"] > 0
                      and current["postfxActive"] == (value != "battery" and current["postfxSupported"]))
                image = f"{engine}-graphics-{value}-world-{stage // 3 + 1}.png"
                page.screenshot(path=str(out / image))
                report["qualityScenes"].append({"image": image, "snapshot": state()})
                page.locator("#btn-pause").click(); page.locator("#btn-exit-map").click()
                page.wait_for_function("!PizzaDiagnostics.snapshot().frameScheduled", timeout=30000)

        # Repeated quality rebuilds must release their private framebuffer textures.
        quality("auto")
        page.locator('[data-stage="0"]').click()
        page.wait_for_function("PizzaDiagnostics.snapshot().time >= .1", timeout=60000)
        page.locator("#btn-pause").click()
        page.wait_for_function("!PizzaDiagnostics.snapshot().frameScheduled", timeout=30000)
        frozen = state()["time"]
        memories = []
        for value in ("battery", "high", "auto", "battery", "high", "auto"):
            page.locator("#btn-settings-pause").click()
            page.locator("#setting-quality").select_option(value)
            page.locator("#btn-settings-back").click()
            page.wait_for_function("!PizzaDiagnostics.snapshot().frameScheduled", timeout=30000)
            current = state(); memories.append(current)
            check(f"paused quality switch to {value} preserves pause and clock",
                  current["paused"] and current["time"] == frozen and current["graphicsQuality"] == value
                  and current["postfxActive"] == (value != "battery" and current["postfxSupported"]))
        report["qualityMemoryCycles"] = memories
        check("quality rebuilds do not accumulate graphics resources",
              memories[-1]["textures"] <= memories[2]["textures"] + 1
              and memories[-1]["geometries"] <= memories[2]["geometries"] + 1)

        # WEBGL_lose_context triggers the real renderer's restoration path.
        available = page.evaluate("""() => {
          window.__testContextExtension = PizzaDiagnostics.contextExtension();
          return !!window.__testContextExtension;
        }""")
        report["contextLossExtension"] = available
        if available:
            page.locator("#btn-resume").click()
            page.wait_for_function("value => PizzaDiagnostics.snapshot().time > value", arg=frozen, timeout=60000)
            page.evaluate("window.__testContextExtension.loseContext()")
            page.wait_for_function("PizzaDiagnostics.snapshot().contextLost", timeout=30000)
            lost_time = state()["time"]
            page.wait_for_timeout(250)
            check("WebGL context loss pauses the game and exposes recovery state",
                  state()["paused"] and state()["time"] == lost_time and not state()["frameScheduled"]
                  and page.locator("#no-webgl").is_visible())
            page.evaluate("window.__testContextExtension.restoreContext()")
            page.wait_for_function("!PizzaDiagnostics.snapshot().contextLost && document.getElementById('no-webgl').hidden", timeout=60000)
            page.wait_for_function("!PizzaDiagnostics.snapshot().frameScheduled", timeout=30000)
            restored = state()
            check("context restoration preserves pause and rebuilds supported HDR",
                  restored["paused"] and restored["time"] == lost_time
                  and restored["postfxActive"] == restored["postfxSupported"])
            page.locator("#btn-resume").click()
            page.wait_for_function("value => PizzaDiagnostics.snapshot().time > value", arg=lost_time, timeout=60000)
            restored = state()
            check("restored context renders after explicit resume", restored["running"] and not restored["paused"] and restored["geometries"] > 0)
            page.screenshot(path=str(out / f"{engine}-graphics-restored.png"))
        check("quality scenes and GPU recovery have no JavaScript or console errors", not errors)
        report["passed"] = True
        return report
    except Exception as error:
        report["failure"] = str(error)
        raise
    finally:
        (out / f"{engine}-graphics-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        context.close()
