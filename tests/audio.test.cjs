'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('game/audio.js','utf8');
function harness(options={}) {
  const nodes=[], timers=new Map(), data=new Map(), contexts=[];
  if(options.muted) data.set('pizza-muted','1');
  function param(){return {value:0,events:[],cancelScheduledValues(t){this.events.push(['cancel',t]);},setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);},exponentialRampToValueAtTime(v,t){this.events.push(['exp',v,t]);}};}
  function node(type){const n={kind:type,type,gain:param(),frequency:param(),detune:param(),Q:param(),disconnected:false,connect(){},disconnect(){this.disconnected=true;},start(t){this.startAt=t;},stop(t){this.stopAt=t;}};nodes.push(n);return n;}
  class Context {constructor(){this.state=options.state||'running';this.currentTime=0;this.sampleRate=8000;this.destination={};this.resumed=0;contexts.push(this);}resume(){this.resumed++;return options.reject?Promise.reject(new Error('interrupted')):Promise.resolve();}createGain(){return node('gain');}createOscillator(){return node('oscillator');}createBiquadFilter(){return node('filter');}createBufferSource(){return node('source');}createBuffer(c,n){return {getChannelData:()=>new Float32Array(n)};}}
  const window={localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},AudioContext:options.unavailable?null:Context,setInterval:f=>{const id=timers.size+1;timers.set(id,f);return id;},clearInterval:id=>timers.delete(id)};
  vm.runInNewContext(source,{window,console});
  return {audio:window.GameAudio,nodes,timers,data,contexts,tick:()=>[...timers.values()].forEach(f=>f())};
}
test('audio degrades safely when AudioContext is unavailable',()=>{const h=harness({unavailable:true});assert.doesNotThrow(()=>{h.audio.unlock();h.audio.startMusic(1);h.audio.sfx('pizza');h.audio.stopMusic();});});
test('rejected resume promises are caught, including interrupted state',async()=>{const h=harness({state:'interrupted',reject:true});h.audio.unlock();h.audio.sfx('pizza');h.audio.startMusic(1);await new Promise(r=>setImmediate(r));assert.equal(h.contexts[0].resumed,3);});
test('one scheduler per world, cleared on pause',()=>{const h=harness();h.audio.startMusic(1);h.audio.startMusic(1);assert.equal(h.timers.size,1);h.audio.stopMusic();assert.equal(h.timers.size,0);});
test('muted playback creates no silent oscillator backlog',()=>{const h=harness({muted:true});h.audio.startMusic(1);h.contexts[0].currentTime=500;h.tick();h.audio.sfx('pizza');assert.equal(h.nodes.filter(n=>n.kind==='oscillator').length,0);h.audio.setMuted(false);h.tick();assert.ok(h.nodes.filter(n=>n.kind==='oscillator').length<5);});
test('long scheduler interruption does not replay missed minutes',()=>{const h=harness();h.audio.startMusic(1);const before=h.nodes.length;h.contexts[0].currentTime=1200;h.tick();assert.ok(h.nodes.length-before<20);});
test('finished oscillator and noise graphs disconnect their owned nodes',()=>{const h=harness();h.audio.sfx('land');const sounds=h.nodes.slice(3);sounds.filter(n=>n.kind==='oscillator'||n.kind==='source').forEach(n=>n.onended());assert.ok(sounds.length>0);assert.ok(sounds.every(n=>n.disconnected));});
test('paused music stays faded until explicit restart',()=>{const h=harness();h.audio.startMusic(1);const bus=h.nodes[1];h.audio.stopMusic();const last=bus.gain.events.at(-1);assert.equal(last[0],'ramp');assert.equal(last[1],.0001);h.audio.startMusic(1);assert.equal(bus.gain.events.at(-1)[1],.9);});
test('mute preference persists independently of game progress',()=>{const h=harness();assert.equal(h.audio.toggleMute(),true);assert.equal(h.data.get('pizza-muted'),'1');assert.equal(h.audio.toggleMute(),false);assert.equal(h.data.get('pizza-muted'),'0');});
