"""Real DOM/game callbacks with controlled time and a NULL renderer, not visual QA."""
from pathlib import Path
import os, re
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1] / 'game'
html = re.sub(r'<script\b[^>]*>.*?</script>', '', (ROOT/'index.html').read_text(), flags=re.S)
html = re.sub(r'<link[^>]+>', '', html)
html = html.replace('</head>', '<style>'+(ROOT/'style.css').read_text()+(ROOT/'polish.css').read_text()+'</style></head>')

def boot(browser, width=1024, height=768):
    page = browser.new_page(viewport={'width':width,'height':height}, reduced_motion='reduce', has_touch=True)
    page._errors = []
    page.on('pageerror', lambda error: page._errors.append(str(error)))
    page.set_content(html)
    page.add_script_tag(content="""
      const data=new Map([['pizza-muted','1']]);
      Object.defineProperty(window,'localStorage',{value:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))}});
      let queue=new Map(), id=0, time=1;
      window.requestAnimationFrame=cb=>{queue.set(++id,cb);return id};
      window.cancelAnimationFrame=i=>queue.delete(i);
      window.testTick=(n=1,delta=50)=>{for(let i=0;i<n;i++){time+=delta;const next=[...queue.values()];queue.clear();next.forEach(cb=>cb(time));}};
    """)
    page.add_script_tag(content=(ROOT/'vendor/three.min.js').read_text())
    page.add_script_tag(content="""
      THREE.WebGLRenderer=class{constructor(){this.shadowMap={};this.info={memory:{geometries:0,textures:0}};this.capabilities={isWebGL2:false};this.pr=1;}
      setPixelRatio(v){this.pr=v}getPixelRatio(){return this.pr}setSize(){}setRenderTarget(){}render(){}getContext(){return {getExtension:()=>null}}};
    """)
    for file in ['audio.js','dogs.js','meshes.js','postfx.js','levels.js','core.js','game.js']:
        source = (ROOT/file).read_text()
        if file=='game.js': source=source.replace('if (new URLSearchParams(location.search).has("diagnostics")) {','if (true) {')
        page.add_script_tag(content=source)
    page.evaluate('testTick(1)')
    return page

def begin(page):
    page.locator('#btn-start').click(); page.locator('[data-id="toffee"]').click()
    page.locator('#btn-map-play').click(); page.locator('#btn-help-done').click()
    page.evaluate('testTick(1)')

with sync_playwright() as p:
    opts={'headless':True}
    if os.environ.get('CHROMIUM_PATH'): opts['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**opts)
    page=boot(browser); begin(page)
    page.locator('#btn-pause').focus(); page.keyboard.press('Space')
    assert page.evaluate('PizzaDiagnostics.snapshot().paused'), 'Space must activate focused pause button, not jump'
    print('PASS native Space activates focused pause button',flush=True)

    assert page.evaluate('PizzaDiagnostics.snapshot().onGround'), 'Focused pause must not also jump'
    page.locator('#btn-exit-map').focus(); page.keyboard.press('Tab')
    assert page.locator('#btn-resume').evaluate('(e)=>document.activeElement===e')
    page.keyboard.press('Shift+Tab')
    assert page.locator('#btn-exit-map').evaluate('(e)=>document.activeElement===e')
    print('PASS modal focus wraps in both directions',flush=True)
    page.locator('#btn-settings-pause').click(); page.locator('#setting-quality').focus()
    page.keyboard.press('Escape')
    assert page.locator('#screen-pause').is_visible()
    assert page.locator('#btn-settings-pause').evaluate('(e)=>document.activeElement===e')
    assert page.evaluate('PizzaDiagnostics.snapshot().paused')
    print('PASS Escape from settings restores its trigger without resuming',flush=True)
    page.locator('#btn-resume').click()
    assert page.locator('#screen-game').evaluate('(e)=>document.activeElement===e')
    page.keyboard.press('Space'); assert not page.evaluate('PizzaDiagnostics.snapshot().onGround')
    page.evaluate('testTick(30)')
    print('PASS gameplay focus restores keyboard jump after resume',flush=True)
    # No intermediate pointermove: release displacement must still be steering.
    pad=page.locator('#touch-pad')
    for kind,x in [('pointerdown',450),('pointerup',640)]:
        pad.dispatch_event(kind,{'pointerId':7,'pointerType':'touch','isPrimary':True,'clientX':x,'clientY':350})
    state=page.evaluate('PizzaDiagnostics.snapshot()')
    assert state['lane']==2 and state['onGround'],state
    print('PASS a coalesced swipe does not become an accidental jump',flush=True)
    page.locator('#btn-left').tap(); assert page.evaluate('PizzaDiagnostics.snapshot().lane')==1
    page.locator('#btn-left').tap(); assert page.evaluate('PizzaDiagnostics.snapshot().lane')==0
    page.locator('#btn-left').tap(); assert page.evaluate('PizzaDiagnostics.snapshot().lane')==0
    page.locator('#btn-right').focus(); page.keyboard.press('Enter')
    assert page.evaluate('PizzaDiagnostics.snapshot().lane')==1
    page.locator('#btn-jump').tap(); assert not page.evaluate('PizzaDiagnostics.snapshot().onGround')
    page.evaluate('testTick(30)')
    print('PASS direct controls clamp lanes and support touch/Enter',flush=True)
    # A celebration is decorative; it must not obscure the pause dialog.
    page.evaluate("document.getElementById('celebration').hidden=false")
    page.locator('#btn-pause').click(); assert page.locator('#celebration').is_hidden()
    page.locator('#btn-resume').click(); page.evaluate('testTick(800)')
    assert page.locator('#screen-clear').is_visible()
    assert 'נשמרה' in page.locator('#clear-save').inner_text()
    assert 'חדש באלבום' in page.locator('#clear-rewards').inner_text()
    saved=page.evaluate("JSON.parse(localStorage.getItem('pizza-dogs-save-v1'))")
    backup=page.evaluate("JSON.parse(localStorage.getItem('pizza-dogs-save-v1:backup'))")
    assert saved==backup and saved['stars'][0]>=1
    print('PASS completion celebrates rewards and saves a recovery copy',flush=True)
    page.evaluate("""() => { const k='pizza-dogs-save-v1'; const s=JSON.parse(localStorage.getItem(k)); s.stars[0]=3; localStorage.setItem(k,JSON.stringify(s)); window.dispatchEvent(new StorageEvent('storage',{key:k})); }""")
    page.locator('#btn-clear-replay').click(); assert page.evaluate('PizzaDiagnostics.snapshot().stage')==0
    page.evaluate('testTick(800)')
    assert page.locator('#screen-clear').is_visible()
    assert page.evaluate("JSON.parse(localStorage.getItem('pizza-dogs-save-v1')).stars[0]")==3
    assert 'השיא' in page.locator('#clear-rewards').inner_text()
    print('PASS a lower-scoring replay preserves the best result',flush=True)
    page.locator('#btn-clear-map').click(); page.locator('#btn-settings-map').click()
    page.locator('#btn-settings-back').click()
    assert page.locator('#btn-settings-map').evaluate('(e)=>document.activeElement===e')
    page.locator('#btn-map-repick').click(); page.locator('#btn-pick-back').click()
    assert page.locator('#btn-continue').is_visible()
    page.locator('#btn-continue').click(); assert page.locator('#screen-map').is_visible()
    print('PASS continue journey and parent settings are reachable from the map',flush=True)
    page.locator('[data-stage="0"]').click()
    page.evaluate("() => { localStorage.setItem=()=>{throw new Error('QuotaExceededError')}; }")
    page.evaluate('testTick(800)')
    assert page.locator('#screen-clear').is_visible()
    assert 'לא הצלחנו לשמור' in page.locator('#clear-save').inner_text()
    assert not page.locator('#btn-clear-continue').is_disabled()
    print('PASS a failed save warns truthfully without blocking play',flush=True)
    assert not page._errors,page._errors
    page.close()
    # Real CSS/DOM measurements only: the canvas in this suite is deliberately blank.
    for width,height in [(1024,768),(768,1024),(390,844),(667,375),(320,568)]:
        page=boot(browser,width,height); begin(page)
        controls=page.locator('.play-controls button').evaluate_all("els=>els.map(e=>{const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}})")
        assert len(controls)==4
        for item in controls:
            assert item['w']>=48 and item['h']>=48 and item['x']>=0 and item['y']>=0 and item['right']<=width+1 and item['bottom']<=height+1,(width,height,controls)
        assert all(controls[i]['right']<controls[i+1]['x'] for i in range(3)),controls
        assert page.locator('#btn-left').bounding_box()['x']<page.locator('#btn-right').bounding_box()['x']
        assert not page._errors,page._errors
        page.close()
        print(f'PASS {width}x{height}: four non-overlapping 48px+ physical controls',flush=True)
    browser.close()
