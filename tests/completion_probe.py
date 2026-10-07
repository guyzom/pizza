"""Stage-completion telemetry for browser validation."""
from __future__ import annotations
import json
import time

def wait_for_completion(page, report, out, engine):
    started = time.monotonic()
    samples = report["completionProgress"] = []
    console = report["completionConsole"] = []

    def on_console(message):
        if message.text.startswith("PIZZA_QA_PROGRESS "):
            state = json.loads(message.text.removeprefix("PIZZA_QA_PROGRESS "))
            state["wallSeconds"] = round(time.monotonic() - started, 2)
            samples.append(state)
            print("STAGE_PROGRESS", json.dumps(state), flush=True)
        elif message.type in ("error", "warning") and len(console) < 40:
            console.append({"type": message.type, "text": message.text})
            print("STAGE_CONSOLE", message.type, message.text, flush=True)

    page.on("console", on_console)
    page.evaluate("""() => {
      const observe = () => console.debug('PIZZA_QA_PROGRESS ' + JSON.stringify({
        ...PizzaDiagnostics.snapshot(), hidden: document.hidden,
        activeScreen: document.querySelector('.screen.active')?.id,
        canvas: [document.getElementById('c3d').width, document.getElementById('c3d').height]
      }));
      observe(); window.__completionProbe = setInterval(observe, 5000);
    }""")
    try:
        page.locator("#screen-clear.active").wait_for(state="visible", timeout=240000)
    except Exception:
        try:
            report["completionFailureSnapshot"] = page.evaluate("PizzaDiagnostics.snapshot()")
            page.screenshot(path=str(out / f"{engine}-FAILURE-stage-completion.png"), timeout=15000)
        except Exception as capture_error:
            report["completionCaptureError"] = str(capture_error)
        raise
    finally:
        report["completionWallSeconds"] = round(time.monotonic() - started, 2)
        try:
            page.evaluate("clearInterval(window.__completionProbe); delete window.__completionProbe")
        except Exception:
            pass
        page.remove_listener("console", on_console)
