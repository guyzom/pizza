'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../game/core.js');
const count = 9, key = 'pizza-dogs-save-v1';
const dogs = ['biscuit','pepper','toffee','coco'].map(id => ({id}));
const stickers = ['biscuit','pepper','toffee','coco','pizza','gold','boss','star','world1','world2','world3','hero'].map(id => ({id}));
const normalize = raw => Core.normalizeSave(raw, count, dogs, stickers);
const merge = (a,b) => Core.mergeProgress(a,b,count,dogs,stickers);
function harness() {
  const data = new Map();
  const storage = {getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v)};
  const store = Core.createSaveStore(() => storage,count,dogs,stickers,key);
  return {data,storage,store};
}
test('new save store has safe defaults and never writes during a read', () => {
  const h=harness(); const result=h.store.read();
  assert.deepEqual(result.save, normalize(null)); assert.equal(result.recovered,false);
  assert.equal(h.data.size,0);
});
test('stored progress is retained and gets a recovery copy on successful write', () => {
  const h=harness(); h.data.set(key, JSON.stringify({unlocked:3,stars:[3,2,1],dogId:'toffee',stickers:['gold']}));
  const result=h.store.write(h.store.read().save);
  assert.equal(result.saved,true); assert.equal(result.backedUp,true);
  assert.deepEqual(result.save.stars.slice(0,3),[3,2,1]);
  assert.equal(h.data.get(key),h.data.get(key+':backup'));
});
test('malformed, oversized, null and array primary recover without erasing backup', () => {
  for (const bad of ['{bad', 'x'.repeat(65537), 'null', '[]', 'false']) {
    const h=harness(); const saved=normalize({stars:[3,2],dogId:'toffee',stickers:['gold']});
    const backup=JSON.stringify(saved); h.data.set(key+':backup',backup); h.data.set(key,bad);
    const result=h.store.read(); assert.equal(result.recovered,true);
    assert.deepEqual(result.save,saved); assert.equal(h.data.get(key+':backup'),backup);
  }
});
test('valid primary retains preferences while merging higher backup progress', () => {
  const h=harness(); h.data.set(key,JSON.stringify({stars:[1],dogId:'coco',settings:{quality:'battery'}}));
  h.data.set(key+':backup',JSON.stringify({stars:[3,2],dogId:'toffee',stickers:['gold']}));
  const save=h.store.read().save;
  assert.deepEqual(save.stars.slice(0,2),[3,2]); assert.equal(save.dogId,'coco');
  assert.equal(save.settings.quality,'battery'); assert.deepEqual(save.stickers,['gold']);
});
test('a stale tab write cannot downgrade progress already on disk', () => {
  const h=harness(), first=h.store.read().save, stale=h.store.read().save;
  first.stars[0]=3; first.stars[1]=2; first.stickers=['gold']; h.store.write(first);
  stale.dogId='pepper'; stale.settings.calm=true;
  const result=h.store.write(stale); assert.deepEqual(result.save.stars.slice(0,2),[3,2]);
  assert.equal(result.save.dogId,'pepper'); assert.equal(result.save.settings.calm,true);
  assert.deepEqual(result.save.stickers,['gold']);
});
test('independent level scores and stickers merge without duplication', () => {
  const result=merge({stars:[1,0,3],stickers:['biscuit','gold']},{stars:[3,2,1],stickers:['gold','hero']});
  assert.deepEqual(result.stars.slice(0,3),[3,2,3]); assert.equal(result.unlocked,3);
  assert.deepEqual(result.stickers,['biscuit','gold','hero']);
});
test('progress merge is idempotent and never imports foreign preferences', () => {
  const a=normalize({stars:[2],dogId:'toffee',helpSeen:true,settings:{quality:'battery'}});
  const b=normalize({stars:[3],dogId:'biscuit',helpSeen:false,settings:{quality:'high'}});
  assert.deepEqual(merge(merge(a,b),b),merge(a,b));
  assert.equal(merge(a,b).dogId,'toffee'); assert.equal(merge(a,b).settings.quality,'battery');
  assert.equal(merge(b,a).helpSeen,true);
});
test('denied storage getter keeps the current session playable', () => {
  const store=Core.createSaveStore(() => {throw new Error('SecurityError');},count,dogs,stickers,key);
  assert.equal(store.read().available,false);
  const result=store.write({stars:[3],dogId:'toffee'});
  assert.equal(result.saved,false); assert.equal(result.save.stars[0],3);
});
test('failed primary write preserves the previous good backup', () => {
  const h=harness(); h.store.write({stars:[2]}); const previous=h.data.get(key+':backup');
  h.storage.setItem=() => {throw new Error('QuotaExceededError');};
  const result=h.store.write({stars:[3]}); assert.equal(result.saved,false);
  assert.equal(result.save.stars[0],3); assert.equal(h.data.get(key+':backup'),previous);
});
test('backup quota failure does not report a successfully saved primary as lost', () => {
  const h=harness(); h.storage.setItem=(k,v) => {if(k.endsWith(':backup')) throw new Error('quota'); h.data.set(k,v);};
  const result=h.store.write({stars:[3]}); assert.equal(result.saved,true); assert.equal(result.backedUp,false);
  assert.equal(JSON.parse(h.data.get(key)).stars[0],3);
});
test('both damaged copies recover safely; schema fields remain bounded', () => {
  const h=harness(); h.data.set(key,'{bad'); h.data.set(key+':backup','[]');
  assert.deepEqual(h.store.read().save,normalize(null));
  const result=h.store.write({stars:[999,-4,'3'],dogId:'<script>',stickers:['hero','hero','<script>']});
  assert.deepEqual(result.save.stars.slice(0,3),[3,0,0]); assert.equal(result.save.dogId,'biscuit');
  assert.deepEqual(result.save.stickers,['hero']);
});
