"""Real-render smoke tests and screenshots. Linux WebKit is not a physical iPad."""
from __future__ import annotations
import argparse, functools, hashlib, http.server, json, threading, traceback
from completion_probe import wait_for_completion
from family_browser import run_family_checks
from graphics_browser import run_graphics_checks
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results"
OUT.mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument("--engine", choices=["chromium", "webkit"], default="chromium")
args = parser.parse_args()
release = hashlib.sha256()
for asset in sorted((ROOT / "game").rglob("*")):
    if asset.is_file():
        release.update(asset.relative_to(ROOT).as_posix().encode() + b"\0" + asset.read_bytes() + b"\0")
report: dict = {"engine": args.engine, "releaseDigest": release.hexdigest(), "checks": [], "errors": [], "physical_iPad": False, "reducedMotion": True}
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{server.server_port}/game/?diagnostics"
def check(label, condition):
    assert condition, label
    report["checks"].append(label)
    print("PASS", label, flush=True)
def snap(page):
    return page.evaluate("PizzaDiagnostics.snapshot()")
def screen(page, name):
    page.locator(f"#screen-{name}.active").wait_for(state="visible")
def shot(page, name):
    page.screenshot(path=str(OUT / f"{args.engine}-{name}.png"))
def drained(page):
    page.wait_for_function("!PizzaDiagnostics.snapshot().frameScheduled", polling=100, timeout=30000)
def pointer(page, kind, ident=7, x=450, y=350):
    page.locator("#touch-pad").dispatch_event(kind, {"pointerId": ident, "pointerType": "touch", "isPrimary": ident == 7, "clientX": x, "clientY": y, "button": 0, "buttons": 0 if kind in ("pointerup", "pointercancel") else 1, "bubbles": True})
try:
    with sync_playwright() as p:
        options = {"headless": True}
        if args.engine == "chromium":
            options["args"] = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
        else:
            options["headless"] = False
        browser = getattr(p, args.engine).launch(**options)
        report["browserVersion"] = browser.version
        context = browser.new_context(viewport={"width": 1024, "height": 768}, device_scale_factor=2, has_touch=True, is_mobile=True, reduced_motion="reduce")
        page = context.new_page()
        page.set_default_timeout(30000)
        page.on("pageerror", lambda error: report["errors"].append(str(error)))
        page.add_init_script("try { localStorage.setItem('pizza-muted', '1'); } catch (_) {}")
        page.goto(URL, wait_until="load")
        page.wait_for_function("!!window.PizzaDiagnostics", timeout=60000)
        check("WebGL starts without fallback", not page.locator("#no-webgl").is_visible())
        check("all four showcase characters use real dog meshes", len(snap(page)["showcaseDogs"]) == 4 and all(rig["kind"] == "dog" and rig["legs"] == 4 and rig["meshes"] >= 20 for rig in snap(page)["showcaseDogs"]))
        check("automatic pixel budget", snap(page)["pixelRatio"] <= 1.5)
        drained(page)
        check("system reduced-motion stops idle showcase animation", not snap(page)["frameScheduled"])
        report["initial"] = snap(page)
        shot(page, "01-start-landscape")
        page.locator("#btn-start").click(force=True); screen(page, "pick")
        check("four selectable dogs", page.locator(".dog-card").count() == 4)
        check("picker exposes the four dog identities", set(page.locator(".dog-card").evaluate_all("els=>els.map(e=>e.dataset.id)")) == {"biscuit", "pepper", "toffee", "coco"})
        portraits = report["portraits"] = page.locator(".dog-card img").evaluate_all("""async els => Promise.all(els.map(async img => {
          await img.decode();
          const canvas=document.createElement('canvas'); canvas.width=64; canvas.height=64;
          const context=canvas.getContext('2d'); context.drawImage(img,0,0,64,64);
          const pixels=context.getImageData(0,0,64,64).data, colors=new Set();
          for(let i=0;i<pixels.length;i+=4) if(pixels[i+3]) colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
          const digest=await crypto.subtle.digest('SHA-256',pixels);
          const rect=img.getBoundingClientRect();
          return {id:img.closest('.dog-card').dataset.id,complete:img.complete,
            natural:[img.naturalWidth,img.naturalHeight],bounds:[rect.width,rect.height],colors:colors.size,
            pixelDigest:Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('')};
        }))""")
        check("all four dog portraits decode in the browser", len(portraits) == 4 and all(p["complete"] and min(p["natural"]) > 0 and min(p["bounds"]) > 0 and abs(p["bounds"][0] - p["bounds"][1]) < 1 for p in portraits))
        check("four portraits render distinct nonuniform artwork", all(p["colors"] >= 8 for p in portraits) and len({p["pixelDigest"] for p in portraits}) == 4)
        shot(page, "02-characters")
        page.locator('[data-id="toffee"]').click(); screen(page, "map")
        check("nine stages / eight initially locked", page.locator(".level-card").count() == 9 and page.locator(".level-card:disabled").count() == 8)
        shot(page, "03-map-landscape")
        page.locator("#btn-map-play").click(); screen(page, "help")
        check("tutorial has three columns on iPad landscape", page.locator(".lesson-grid").evaluate("e => getComputedStyle(e).gridTemplateColumns.split(' ').length === 3"))
        shot(page, "04-tutorial")
        page.locator("#btn-help-done").click(); screen(page, "game")
        page.wait_for_function("PizzaDiagnostics.snapshot().time > .1", timeout=60000)
        check("selected dog is a rendered articulated player", snap(page)["dogId"] == "toffee" and snap(page)["playerDog"]["id"] == "toffee" and snap(page)["playerDog"]["kind"] == "dog" and snap(page)["playerDog"]["legs"] == 4 and snap(page)["playerDog"]["meshes"] >= 20)
        pointer(page, "pointerdown", x=800); pointer(page, "pointercancel", x=800)
        check("cancel does not jump or change lanes", snap(page)["onGround"] and snap(page)["targetX"] == 0)
        pointer(page, "pointerdown"); pointer(page, "pointerdown", ident=8)
        pointer(page, "pointermove", ident=8, x=100); pointer(page, "pointerup", ident=8)
        check("second finger cannot steal control", snap(page)["targetX"] == 0 and snap(page)["onGround"])
        pointer(page, "pointercancel")
        pointer(page, "pointerdown"); pointer(page, "pointermove", x=640); pointer(page, "pointerup", x=640)
        check("relative swipe moves right in RTL", snap(page)["lane"] == 2 and snap(page)["onGround"])
        page.touchscreen.tap(350, 350)
        check("real touch tap jumps without teleporting", snap(page)["targetX"] == 2.2 and not snap(page)["onGround"])
        page.locator("#btn-pause").click(); screen(page, "pause")
        frozen = snap(page)["time"]
        page.wait_for_timeout(500)
        report["pauseBeforeDrain"] = snap(page)
        drained(page)
        check("pause freezes simulation and RAF", snap(page)["time"] == frozen and not snap(page)["frameScheduled"])
        shot(page, "05-paused")
        page.locator("#btn-settings-pause").click(); screen(page, "settings")
        page.locator("#setting-calm").check(); page.locator("#setting-quality").select_option("battery")
        shot(page, "06-settings")
        page.locator("#btn-settings-back").click(); screen(page, "pause")
        check("settings do not unpause", snap(page)["paused"] and snap(page)["time"] == frozen)
        check("battery caps device pixel ratio", snap(page)["pixelRatio"] <= 1)
        page.locator("#btn-resume").click()
        page.wait_for_function("PizzaDiagnostics.snapshot().time > 1", timeout=60000)
        shot(page, "07-gameplay")
        page.evaluate("window.dispatchEvent(new Event('pagehide'))")
        screen(page, "pause")
        check("leaving the page pauses, never auto-resumes", snap(page)["paused"])
        page.evaluate("window.dispatchEvent(new Event('pageshow'))")
        check("returning stays paused", snap(page)["paused"])
        page.locator("#btn-exit-map").click(); screen(page, "map")
        drained(page)
        check("opaque menus stop the render loop", not snap(page)["frameScheduled"])
        page.set_viewport_size({"width": 768, "height": 1024})
        # Fresh portrait layout, not a claim about physical rotation.
        page.reload(wait_until="load"); page.wait_for_function("!!window.PizzaDiagnostics", timeout=60000)
        page.locator("#btn-start").click(force=True); page.locator('[data-id="toffee"]').click()
        report["portraitViewport"] = page.evaluate("({width:innerWidth,height:innerHeight,app:document.getElementById('app').getBoundingClientRect().toJSON()})")
        check("portrait viewport really uses 768 CSS pixels", page.evaluate("innerWidth === 768"))
        check("portrait stage cards remain inside the viewport", page.locator("#map-board").evaluate("e => {const r=e.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1;}"))
        shot(page, "08-map-portrait")
        check("portrait map fits width", page.locator("#map-board").evaluate("e => e.scrollWidth <= e.clientWidth + 1"))
        page.locator("#btn-stickers").click(); shot(page, "09-stickers")
        page.locator("#btn-stickers-back").click()
        page.evaluate("""() => {const s=JSON.parse(localStorage.getItem('pizza-dogs-save-v1'));s.unlocked=8;localStorage.setItem('pizza-dogs-save-v1',JSON.stringify(s));}""")
        page.reload(wait_until="load"); page.wait_for_function("!!window.PizzaDiagnostics", timeout=60000)
        page.locator("#btn-start").click(force=True); page.locator('[data-id="toffee"]').click()
        for stage in (3, 6):
            page.locator(f'[data-stage="{stage}"]').click(); screen(page, "game")
            page.wait_for_function("PizzaDiagnostics.snapshot().time > .1", timeout=60000)
            shot(page, f"10-world-{stage // 3 + 1}")
            page.locator("#btn-pause").click(); page.locator("#btn-exit-map").click()
        memories = []
        for _ in range(4):
            page.locator('[data-stage="0"]').click()
            page.wait_for_function("PizzaDiagnostics.snapshot().time > .1", timeout=60000)
            page.locator("#btn-pause").click(); page.locator("#btn-exit-map").click()
            drained(page); memories.append(snap(page))
        report["memoryCycles"] = memories
        check("repeated stages do not accumulate geometry", memories[-1]["geometries"] <= memories[1]["geometries"] + 5)
        check("repeated stages do not accumulate textures", memories[-1]["textures"] <= memories[1]["textures"] + 3)
        page.locator('[data-stage="0"]').click()
        wait_for_completion(page, report, OUT, args.engine)
        check("passive player completes a real stage", not snap(page)["running"])
        shot(page, "11-completion")
        check("completion saved on device", page.evaluate("JSON.parse(localStorage.getItem('pizza-dogs-save-v1')).stars[0] >= 1"))
        page.locator("#btn-clear-continue").click()
        check("next-stage button starts the next stage", snap(page)["stage"] == 1)
        page.locator("#btn-pause").click()
        page.wait_for_function("!!navigator.serviceWorker.controller", timeout=60000)
        check("offline worker is active", page.evaluate("navigator.serviceWorker.ready.then(() => true)"))
        report["graphics"] = run_graphics_checks(browser, URL, OUT, args.engine, check)
        run_family_checks(browser, URL, OUT, args.engine, check)
        # WebKit setOffline can reject even literal service-worker responses
        # (microsoft/playwright#42775). Stop the actual origin for BOTH engines.
        server.shutdown(); server.server_close()
        negative = browser.new_context(service_workers="block")
        control = negative.new_page(); failed_without_worker = False
        try: control.goto(URL, wait_until="load", timeout=5000)
        except Exception: failed_without_worker = True
        negative.close()
        check("offline negative control cannot reach stopped origin", failed_without_worker)
        page.reload(wait_until="load")
        page.wait_for_function("!!window.PizzaDiagnostics", timeout=60000)
        check("offline reload includes game and saved character", page.evaluate("JSON.parse(localStorage.getItem('pizza-dogs-save-v1')).dogId === 'toffee'"))
        shot(page, "12-offline-start")
        page.evaluate("localStorage.setItem('pizza-dogs-save-v1','{bad')")
        page.reload(wait_until="load"); page.wait_for_function("!!window.PizzaDiagnostics", timeout=60000)
        check("corrupt save recovers", page.locator("#screen-start").is_visible())
        check("no uncaught browser JavaScript errors", not report["errors"])
        report["offlineMethod"] = "Origin server stopped; fresh context without a worker fails. Installed context reloads from cached release."
        report["passed"] = True
        browser.close()
except Exception as error:
    report["passed"] = False; report["failure"] = str(error); report["traceback"] = traceback.format_exc()
    try: shot(page, "FAILURE")
    except Exception: pass
    raise
finally:
    (OUT / f"{args.engine}-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    server.shutdown()
