"""Deterministic gameplay regression using real DOM/Three objects, a null renderer,
controlled RAF, and in-memory storage. This tests rules, NOT WebGL or frame rate."""
from pathlib import Path
import os, re
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[1] / "game"
html = re.sub(r'<script\b[^>]*>.*?</script>', '', (root / 'index.html').read_text(), flags=re.S)
html = re.sub(r'<link[^>]+>', '', html)
html = html.replace('</head>', '<style>' + (root/'style.css').read_text() + (root/'polish.css').read_text() + '</style></head>')
with sync_playwright() as p:
    opts = {"headless": True}
    if os.environ.get("CHROMIUM_PATH"): opts["executable_path"] = os.environ["CHROMIUM_PATH"]
    browser = p.chromium.launch(**opts)
    page = browser.new_page(viewport={"width": 1024, "height": 768}, reduced_motion="reduce")
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.set_content(html)
    page.add_script_tag(content="""
      const data=new Map([['pizza-muted','1']]);
      Object.defineProperty(window,'localStorage',{value:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))}});
      let queue=new Map(), id=0, time=1;
      window.requestAnimationFrame=cb=>{queue.set(++id,cb);return id};
      window.cancelAnimationFrame=i=>queue.delete(i);
      window.testTick=(n=1,delta=50)=>{for(let i=0;i<n;i++){time+=delta;const next=[...queue.values()];queue.clear();next.forEach(cb=>cb(time));}};
    """)
    page.add_script_tag(content=(root/'vendor/three.min.js').read_text())
    page.add_script_tag(content="""
      THREE.WebGLRenderer=class{constructor(){this.shadowMap={};this.info={memory:{geometries:0,textures:0}};this.capabilities={isWebGL2:false};this.pr=1;}
      setPixelRatio(v){this.pr=v}getPixelRatio(){return this.pr}setSize(){}setRenderTarget(){}render(){}getContext(){return {getExtension:()=>null}}};
    """)
    for f in ["audio.js","dogs.js","meshes.js","postfx.js","levels.js","core.js","game.js"]:
        source = (root/f).read_text()
        if f == "game.js": source = source.replace('if (new URLSearchParams(location.search).has("diagnostics")) {', 'if (true) {')
        page.add_script_tag(content=source)
    page.evaluate("testTick(1)")
    page.locator('#btn-start').click(); page.locator('[data-id="toffee"]').click()
    page.locator('#btn-map-play').click(); page.locator('#btn-help-done').click()
    pad=page.locator('#touch-pad')
    for kind in ['pointerdown','pointercancel','pointerup']:
        pad.dispatch_event(kind,{'pointerId':3,'pointerType':'touch','clientX':700,'clientY':300})
    assert page.evaluate('PizzaDiagnostics.snapshot().onGround')
    page.evaluate('testTick(30)')
    page.locator('#btn-pause').click(); before=page.evaluate('PizzaDiagnostics.snapshot().time')
    page.evaluate('testTick(200)')
    assert page.evaluate('PizzaDiagnostics.snapshot().time') == before
    page.locator('#btn-resume').click()
    for _ in range(1100):
        state=page.evaluate('PizzaDiagnostics.snapshot()')
        if not state['running']: break
        progress=state['dist']/state['courseLen']
        target=page.evaluate('(progress)=>GameLevels[0].pickups.find(p=>p.at>progress+.008)?.lane ?? 1', progress)
        if state['lane'] != target:
            page.keyboard.press('ArrowRight' if target > state['lane'] else 'ArrowLeft')
        page.evaluate('testTick(1)')
        if state['charge'] >= 6:
            page.locator('#btn-super').click()
            shield=page.evaluate('PizzaDiagnostics.snapshot()')
            if shield['shieldUntil'] > shield['time']*1000:
                page.locator('#btn-pause').click(); page.evaluate('testTick(160)')
                paused=page.evaluate('PizzaDiagnostics.snapshot()')
                assert paused['shieldUntil']==shield['shieldUntil'] and paused['time']==shield['time']
                page.locator('#btn-resume').click()
                print('PASS shield duration freezes during pause',flush=True)
    assert page.locator('#screen-clear').is_visible()
    print('PASS gameplay completes with pointer/keyboard controls',flush=True)
    for stage in range(1,9):
        page.locator('#btn-clear-continue').click()
        assert page.evaluate('PizzaDiagnostics.snapshot().stage')==stage
        for _ in range(30):
            page.evaluate('testTick(50)')
            if not page.evaluate('PizzaDiagnostics.snapshot().running'): break
        assert page.locator('#screen-clear').is_visible(), f'stage {stage} stuck'
        print(f'PASS passive completion stage {stage+1}',flush=True)
    save=page.evaluate("JSON.parse(localStorage.getItem('pizza-dogs-save-v1'))")
    assert all(star>=1 for star in save['stars']) and len(save['stickers'])==12
    print('PASS nine completed stages unlock all twelve stickers',flush=True)
    # Integration regressions: real game callbacks with slow frame timestamps.
    # The renderer is still a stub; these are timing/rule tests, not FPS claims.
    for frame_ms in (100, 250, 500):
        page.locator('#btn-clear-map').click()
        page.locator('[data-stage="0"]').click()
        page.evaluate('(ms)=>testTick(1,ms)', frame_ms)
        page.evaluate('(ms)=>testTick(10,ms)', frame_ms)
        expected = 10 * min(frame_ms, 250) / 1000
        before = page.evaluate('PizzaDiagnostics.snapshot().time')
        assert abs(before - expected) < 1e-8, (frame_ms, before, expected)
        page.locator('#btn-pause').click()
        page.evaluate('testTick(2,60000)')
        assert page.evaluate('PizzaDiagnostics.snapshot().time') == before
        page.locator('#btn-resume').click()
        page.evaluate('testTick(1,60000)')
        assert page.evaluate('PizzaDiagnostics.snapshot().time') == before
        for _ in range(40):
            page.evaluate('(ms)=>testTick(10,ms)', frame_ms)
            if not page.evaluate('PizzaDiagnostics.snapshot().running'): break
        final = page.evaluate('PizzaDiagnostics.snapshot()')
        assert page.locator('#screen-clear').is_visible(), (frame_ms, final)
        assert 30 <= final['time'] <= 30.051, (frame_ms, final['time'])
        assert final['dist'] >= final['courseLen']
        print(f'PASS {frame_ms} ms frames: bounded steps, completion, no pause catch-up', flush=True)
    assert not errors, errors
    browser.close()
