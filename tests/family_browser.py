"""Additional production-script browser checks; no game-code injection or null GL.
Small-screen contexts use the battery setting to bound software GL.
The main browser suite covers automatic quality and full stage completion.
"""
from __future__ import annotations
import json

KEY = 'pizza-dogs-save-v1'
SEED = {'stars':[1,0,0,0,0,0,0,0,0], 'unlocked':1, 'dogId':'toffee',
        'stickers':['biscuit'], 'helpSeen':True, 'settings':{'quality':'battery','calm':True}}

def run_family_checks(browser, url, out, engine, check):
    seed_script = """() => {
      const key='pizza-dogs-save-v1';
      if (!localStorage.getItem(key)) localStorage.setItem(key, SEED_VALUE);
      localStorage.setItem('pizza-muted','1');
    }""".replace('SEED_VALUE', json.dumps(json.dumps(SEED)))
    for width,height in [(390,844),(667,375),(320,568)]:
        context=browser.new_context(viewport={'width':width,'height':height},has_touch=True,is_mobile=True,reduced_motion='reduce')
        errors=[]
        try:
            context.add_init_script('('+seed_script+')()')
            page=context.new_page(); page.on('pageerror',lambda error: errors.append(str(error)))
            page.goto(url,wait_until='load'); page.wait_for_function('!!window.PizzaDiagnostics',timeout=60000)
            check(f'{width}x{height}: returning player has direct continue',page.locator('#btn-continue').is_visible())
            page.locator('#btn-continue').click(); page.locator('[data-stage="0"]').click()
            page.wait_for_function('PizzaDiagnostics.snapshot().time > .1',timeout=60000)
            rects=page.locator('.play-controls button').evaluate_all("els=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}})")
            check(f'{width}x{height}: four 48px+ controls fit without overlap',
                len(rects)==4 and all(r['w']>=48 and r['h']>=48 and r['x']>=0 and r['y']>=0 and r['right']<=width+1 and r['bottom']<=height+1 for r in rects)
                and all(rects[i]['right']<rects[i+1]['x'] for i in range(3)))
            check(f'{width}x{height}: controls are not covered by overlays',page.locator('.play-controls button').evaluate_all("els=>els.every(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})"))
            page.locator('#btn-left').tap()
            check(f'{width}x{height}: native left tap steers physically left',page.evaluate('PizzaDiagnostics.snapshot().lane===0'))
            page.locator('#btn-right').tap()
            check(f'{width}x{height}: native right tap steers physically right',page.evaluate('PizzaDiagnostics.snapshot().lane===1'))
            page.locator('#btn-jump').tap()
            check(f'{width}x{height}: native jump tap works',page.evaluate('!PizzaDiagnostics.snapshot().onGround'))
            page.screenshot(path=str(out/f'{engine}-family-controls-{width}x{height}.png'))
            page.locator('#btn-pause').focus(); page.keyboard.press('Space')
            page.locator('#screen-pause.active').wait_for(state='visible')
            check(f'{width}x{height}: Space activates pause without unpausing',page.evaluate('PizzaDiagnostics.snapshot().paused'))
            page.locator('#btn-exit-map').focus(); page.keyboard.press('Tab')
            check(f'{width}x{height}: dialog retains keyboard focus',page.locator('#btn-resume').evaluate('e=>e===document.activeElement'))
            check(f'{width}x{height}: no uncaught errors',not errors)
        finally:
            context.close()
    # Native StorageEvents between two same-origin pages (not synthetic events).
    context=browser.new_context(viewport={'width':1024,'height':768},reduced_motion='reduce')
    errors=[]
    try:
        context.add_init_script('('+seed_script+')()')
        first=context.new_page(); first.on('pageerror',lambda error: errors.append(str(error)))
        first.goto(url,wait_until='load'); first.wait_for_function('!!window.PizzaDiagnostics',timeout=60000)
        first.locator('#btn-continue').click()
        second=context.new_page(); second.on('pageerror',lambda error: errors.append(str(error)))
        second.goto(url,wait_until='load'); second.wait_for_function('!!window.PizzaDiagnostics',timeout=60000)
        second.evaluate("""() => {const k='pizza-dogs-save-v1';const s=JSON.parse(localStorage.getItem(k));s.stars[0]=3;s.stars[1]=2;s.unlocked=2;s.dogId='pepper';s.stickers=['biscuit','gold'];localStorage.setItem(k,JSON.stringify(s));}""")
        first.wait_for_function("document.getElementById('map-progress').textContent.includes('5 מתוך 27')",timeout=30000)
        check('another window updates the visible map through native storage events','טופי' in first.locator('#map-dog-label').inner_text())
        first.bring_to_front()
        first.locator('#btn-settings-map').click(); first.locator('#btn-settings-back').click()
        saved=first.evaluate("JSON.parse(localStorage.getItem('pizza-dogs-save-v1'))")
        check('stale-window preference write preserves higher stars and stickers',saved['stars'][:2]==[3,2] and 'gold' in saved['stickers'] and saved['dogId']=='toffee')
        first.evaluate("localStorage.setItem('pizza-dogs-save-v1','{bad')")
        first.reload(wait_until='load'); first.wait_for_function('!!window.PizzaDiagnostics',timeout=60000)
        first.locator('#btn-continue').click()
        check('corrupted primary restores progress and character from local backup','5 מתוך 27' in first.locator('#map-progress').inner_text() and 'טופי' in first.locator('#map-dog-label').inner_text())
        first.locator('#btn-settings-map').click()
        check('recovery is disclosed in parent settings',first.locator('#recovery-note').is_visible())
        first.screenshot(path=str(out/f'{engine}-family-recovered-settings.png'))
        check('cross-window and recovery flows have no uncaught errors',not errors)
    finally:
        context.close()
