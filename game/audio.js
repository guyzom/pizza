/* WebAudio synthesis: quiet, friendly music and effects; no downloaded audio.
 * Public API: unlock, startMusic(world), stopMusic, sfx(name), setMuted,
 * toggleMute, isMuted. Audio failure must never prevent a child from playing.
 */
(function () {
  'use strict';
  var MASTER_GAIN = 0.18, MUTE_KEY = 'pizza-muted';
  var muted = false;
  try { muted = window.localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
  var AC = window.AudioContext || window.webkitAudioContext || null;
  var ctx = null, master = null, musicGain = null, sfxGain = null;
  var musicWorld = 0, schedulerTimer = null, nextNoteTime = 0, stepIndex = 0;
  var LOOKAHEAD_MS = 25, SCHEDULE_AHEAD = 0.15, BPM = 108;
  var STEP = (60 / BPM) / 2;
  function ok() { return ctx && master; }
  function persistMute() {
    try { window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
  }
  function ensureCtx() {
    if (ctx) return ctx;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : MASTER_GAIN; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.9; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 1; sfxGain.connect(master);
    } catch (e) { ctx = null; master = null; musicGain = null; sfxGain = null; }
    return ctx;
  }
  function resumeContext() {
    if (!ctx || !ctx.resume) return;
    try {
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        var pending = ctx.resume();
        if (pending && pending.catch) pending.catch(function () {});
      }
    } catch (e) {}
  }
  function unlock() {
    if (!AC || !ensureCtx()) return;
    resumeContext(); applyMasterGain(false);
  }
  function applyMasterGain(smooth) {
    if (!ok()) return;
    var target = muted ? 0 : MASTER_GAIN;
    try {
      var now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      if (smooth) {
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(target, now + 0.08);
      } else master.gain.setValueAtTime(target, now);
    } catch (e) {}
  }
  // Every short-lived voice owns its envelope and optional filter.
  function envGain(t0, peak, a, d, s, sLevel, r) {
    var g = ctx.createGain(), end = t0 + a + d + s + r;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.linearRampToValueAtTime(peak * sLevel, t0 + a + d);
    g.gain.setValueAtTime(peak * sLevel, t0 + a + d + s);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    return { node: g, end: end };
  }
  function tone(opts, dest) {
    if (!ok()) return 0;
    var t0 = opts.t != null ? opts.t : ctx.currentTime;
    var a = opts.a != null ? opts.a : 0.005, d = opts.d != null ? opts.d : 0.05;
    var s = opts.s != null ? opts.s : 0, r = opts.r != null ? opts.r : 0.08;
    try {
      var osc = ctx.createOscillator(); osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(opts.freq || 440, t0);
      if (opts.freq2 != null) {
        var method = opts.glide === 'exp' ? 'exponentialRampToValueAtTime' : 'linearRampToValueAtTime';
        osc.frequency[method](opts.freq2, t0 + (opts.glideT || (a + d + s + r)));
      }
      if (opts.detune) osc.detune.setValueAtTime(opts.detune, t0);
      var env = envGain(t0, opts.gain != null ? opts.gain : 0.3, a, d, s, opts.sLevel != null ? opts.sLevel : 0.6, r);
      osc.connect(env.node);
      var out = env.node;
      if (opts.lp) {
        var filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(opts.lp, t0);
        env.node.connect(filter); out = filter;
      }
      out.connect(dest || sfxGain);
      osc.onended = function () { osc.disconnect(); env.node.disconnect(); if (out !== env.node) out.disconnect(); };
      osc.start(t0); osc.stop(env.end + 0.02);
      return env.end;
    } catch (e) { return 0; }
  }
  function noise(opts, dest) {
    if (!ok()) return 0;
    var t0 = opts.t != null ? opts.t : ctx.currentTime, dur = opts.dur || 0.15;
    try {
      var buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
      var src = ctx.createBufferSource(); src.buffer = buf;
      var bp = ctx.createBiquadFilter(); bp.type = opts.filter || 'bandpass';
      bp.frequency.setValueAtTime(opts.freq || 900, t0);
      if (opts.freq2 != null) bp.frequency.linearRampToValueAtTime(opts.freq2, t0 + dur);
      bp.Q.setValueAtTime(opts.q != null ? opts.q : 0.7, t0);
      var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(opts.gain != null ? opts.gain : 0.15, t0 + Math.min(0.02, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(bp); bp.connect(g); g.connect(dest || sfxGain);
      src.onended = function () { src.disconnect(); bp.disconnect(); g.disconnect(); };
      src.start(t0); src.stop(t0 + dur + 0.02);
      return t0 + dur;
    } catch (e) { return 0; }
  }
  function nf(semitones) { return 440 * Math.pow(2, semitones / 12); }
  function ding(base, steps, type, gain, spacing, dest) {
    var t = ctx.currentTime;
    for (var i = 0; i < steps.length; i++) tone({
      t: t + i * (spacing || 0.06), freq: base * Math.pow(2, steps[i] / 12),
      type: type || 'triangle', gain: gain != null ? gain : 0.28,
      a: 0.004, d: 0.08, s: 0.02, sLevel: 0.4, r: 0.14, lp: 5200
    }, dest || sfxGain);
  }
  var SFX = {
    select: function () { ding(nf(0), [0, 7], 'triangle', 0.26, 0.05); },
    start: function () { ding(nf(-5), [0, 4, 7, 12], 'triangle', 0.26, 0.07); },
    tap: function () { tone({ freq:nf(4), type:'triangle', gain:0.2, a:0.003, d:0.05, r:0.06, lp:4000 }); },
    jump: function () { tone({ freq:nf(0), freq2:nf(12), glide:'exp', glideT:0.16, type:'triangle', gain:0.24, a:0.004, d:0.02, s:0.06, sLevel:0.7, r:0.06, lp:4500 }); },
    land: function () {
      tone({ freq:nf(-17), freq2:nf(-24), glide:'exp', glideT:0.12, type:'sine', gain:0.26, a:0.002, d:0.1, r:0.05, lp:900 });
      noise({ freq:500, gain:0.06, dur:0.09, q:0.6 });
    },
    pizza: function () { ding(nf(7), [0,5], 'triangle', 0.26, 0.05); },
    gold: function () {
      ding(nf(12), [0,4,9], 'triangle', 0.24, 0.045);
      tone({ t:ctx.currentTime+0.02, freq:nf(24), type:'sine', gain:0.08, a:0.004, d:0.12, r:0.12, lp:8000 });
    },
    combo: function () { ding(nf(7), [0,2,4,7,11], 'square', 0.16, 0.05); },
    hit: function () { tone({ freq:nf(-9), freq2:nf(-16), glide:'exp', glideT:0.18, type:'sine', gain:0.24, a:0.004, d:0.12, s:0.02, sLevel:0.5, r:0.08, lp:700 }); },
    power: function () {
      tone({ freq:nf(-12), freq2:nf(12), glide:'exp', glideT:0.4, type:'triangle', gain:0.2, a:0.02, d:0.05, s:0.25, sLevel:0.8, r:0.12, lp:6000 });
      ding(nf(12), [0,7,12], 'sine', 0.1, 0.12);
    },
    win: function () { ding(nf(0), [0,4,7,12,16], 'triangle', 0.26, 0.09); },
    lose: function () { ding(nf(4), [0,-2,-5], 'triangle', 0.2, 0.12); },
    star: function () { ding(nf(19), [0,5,7], 'sine', 0.16, 0.06); },
    whoosh: function () { noise({ freq:1400, freq2:400, gain:0.12, dur:0.28, filter:'bandpass', q:0.5 }); },
    boss: function () {
      ding(nf(-17), [0,3,5], 'sine', 0.24, 0.14, sfxGain);
      tone({ freq:nf(-29), type:'sine', gain:0.16, a:0.02, d:0.2, s:0.2, sLevel:0.5, r:0.2, lp:500 });
    }
  };
  function sfx(name) {
    if (!AC || !ensureCtx() || muted) return;
    resumeContext();
    var fn = SFX[name];
    if (typeof fn === 'function' && Object.prototype.hasOwnProperty.call(SFX, name)) {
      try { fn(); } catch (e) {}
    }
  }
  var WORLDS = {
    1: {root:nf(-9), lead:'triangle', bass:'sine', lp:2600, leadGain:0.11, bassGain:0.13,
      mel:[0,3,5,7,5,3,0,-2,0,3,7,10,7,5,3,0], bassSeq:[0,0,-5,-5,-7,-7,-5,-5], arp:false},
    2: {root:nf(-2), lead:'triangle', bass:'triangle', lp:3200, leadGain:0.1, bassGain:0.12,
      mel:[0,4,7,9,7,4,12,9,7,4,0,4,7,12,9,7], bassSeq:[0,0,5,5,-3,-3,5,7], arp:true},
    3: {root:nf(3), lead:'sine', bass:'sine', lp:3600, leadGain:0.1, bassGain:0.1,
      mel:[0,5,7,12,10,7,5,0,3,7,10,12,15,12,10,7], bassSeq:[0,0,0,-5,-7,-7,-5,0], arp:false}
  };
  function scheduleStep(cfg, step, time) {
    if (!ok()) return;
    var i = step % 16;
    if (i !== 6 && i !== 14) {
      var f = cfg.root * Math.pow(2, cfg.mel[i] / 12);
      tone({ t:time, freq:f, type:cfg.lead, gain:cfg.leadGain, a:0.01, d:0.06, s:STEP*0.5, sLevel:0.5, r:0.12, lp:cfg.lp }, musicGain);
      if (cfg.arp && i % 4 === 0) tone({ t:time, freq:f*2, type:'sine', gain:cfg.leadGain*0.4, a:0.01, d:0.05, s:0.02, sLevel:0.3, r:0.14, lp:7000 }, musicGain);
    }
    if (i % 2 === 0) {
      var bf = cfg.root * Math.pow(2, (cfg.bassSeq[(i / 2) % cfg.bassSeq.length] - 12) / 12);
      tone({ t:time, freq:bf, type:cfg.bass, gain:cfg.bassGain, a:0.01, d:0.08, s:STEP*0.7, sLevel:0.5, r:0.16, lp:1400 }, musicGain);
    }
    if (i % 4 === 2) noise({ t:time, freq:3200, gain:0.03, dur:0.05, filter:'highpass', q:0.5 }, musicGain);
  }
  function schedulerTick() {
    if (!ok() || musicWorld === 0 || muted || ctx.state !== 'running') return;
    try {
      // Drop stale work after an interruption instead of replaying a backlog.
      if (nextNoteTime < ctx.currentTime - STEP) nextNoteTime = ctx.currentTime + 0.02;
      while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
        scheduleStep(WORLDS[musicWorld] || WORLDS[1], stepIndex, nextNoteTime);
        nextNoteTime += STEP; stepIndex++;
      }
    } catch (e) {}
  }
  function stopScheduler() {
    if (schedulerTimer !== null) {
      try { window.clearInterval(schedulerTimer); } catch (e) {}
      schedulerTimer = null;
    }
  }
  function startMusic(world) {
    if (!AC || !ensureCtx()) return;
    world = world === 2 || world === 3 ? world : 1;
    resumeContext();
    if (musicWorld === world && schedulerTimer !== null) return;
    stopScheduler(); musicWorld = world; stepIndex = 0;
    nextNoteTime = ctx.currentTime + 0.08;
    // Only an explicit restart restores a previously faded music bus.
    try {
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      musicGain.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.08);
    } catch (e) {}
    schedulerTick(); schedulerTimer = window.setInterval(schedulerTick, LOOKAHEAD_MS);
  }
  function stopMusic() {
    stopScheduler(); musicWorld = 0;
    if (!ok() || !musicGain) return;
    try {
      var now = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(musicGain.gain.value, now);
      musicGain.gain.linearRampToValueAtTime(0.0001, now + 0.12);
    } catch (e) {}
  }
  function setMuted(v) { muted = !!v; persistMute(); applyMasterGain(true); }
  function toggleMute() { setMuted(!muted); return muted; }
  function isMuted() { return muted; }
  window.GameAudio = {unlock:unlock, startMusic:startMusic, stopMusic:stopMusic, sfx:sfx, toggleMute:toggleMute, isMuted:isMuted, setMuted:setMuted};
})();
