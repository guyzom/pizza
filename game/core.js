/* Pure, dependency-free rules. Shared with Node rule tests. */
(function (root) {
  "use strict";
  const integer = (n, lo, hi, fallback = lo) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.trunc(n))) : fallback;
  function normalizeSave(raw, count, dogs, stickers) {
    const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const settings = obj.settings && typeof obj.settings === "object" ? obj.settings : {};
    const stars = Array.from({ length: count }, (_, i) => integer(Array.isArray(obj.stars) ? obj.stars[i] : 0, 0, 3));
    const earned = new Set(stickers.map((s) => s.id));
    const completed = stars.reduce((last, n, i) => n > 0 ? i : last, -1);
    return {
      version: 1,
      unlocked: Math.max(integer(obj.unlocked, 0, count - 1), Math.min(count - 1, completed + 1)),
      stars,
      stickers: [...new Set(Array.isArray(obj.stickers) ? obj.stickers.filter((id) => earned.has(id)) : [])],
      dogId: dogs.some((t) => t.id === obj.dogId) ? obj.dogId : dogs[0].id,
      helpSeen: obj.helpSeen === true,
      settings: {
        gentle: settings.gentle !== false,
        calm: settings.calm === true,
        quality: ["auto", "battery", "high"].includes(settings.quality) ? settings.quality : "auto"
      }
    };
  }
  // Progress is monotonic: replaying a stage or writing from an older tab must
  // not lower a best score. Preferences and the character belong to this tab.
  function mergeProgress(current, previous, count, dogs, stickers) {
    const next = normalizeSave(current, count, dogs, stickers);
    const old = normalizeSave(previous, count, dogs, stickers);
    next.unlocked = Math.max(next.unlocked, old.unlocked);
    next.stars = next.stars.map((n, i) => Math.max(n, old.stars[i]));
    next.stickers = [...new Set([...next.stickers, ...old.stickers])];
    next.helpSeen = next.helpSeen || old.helpSeen;
    return next;
  }
  // Inject storage, including its getter: Safari can reject even accessing it.
  // This is local recovery, not a cloud backup or an atomic multi-tab database.
  function createSaveStore(getStorage, count, dogs, stickers, key) {
    const normalize = (raw) => normalizeSave(raw, count, dogs, stickers);
    const merge = (a, b) => mergeProgress(a, b, count, dogs, stickers);
    function decode(text) {
      if (typeof text !== "string" || text.length > 65536) return null;
      try {
        const raw = JSON.parse(text);
        return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
      } catch (_) { return null; }
    }
    function read() {
      try {
        const storage = getStorage();
        const primary = decode(storage.getItem(key));
        const backup = decode(storage.getItem(key + ":backup"));
        return { save: primary ? merge(primary, backup) : normalize(backup),
          recovered: !primary && !!backup, available: true };
      } catch (_) { return { save: normalize(null), recovered: false, available: false }; }
    }
    function write(value) {
      const latest = read();
      const save = merge(value, latest.save);
      const encoded = JSON.stringify(save);
      try {
        const storage = getStorage();
        storage.setItem(key, encoded);
        // A quota failure in the recovery copy must not invalidate a successful
        // primary save. Never replace a good backup after a failed primary write.
        let backedUp = true;
        try { storage.setItem(key + ":backup", encoded); } catch (_) { backedUp = false; }
        return { save, saved: true, backedUp };
      } catch (_) { return { save, saved: false, backedUp: false }; }
    }
    return Object.freeze({ read, write });
  }
  function starsFor(pizzas, available) {
    if (!Number.isFinite(pizzas) || !Number.isFinite(available) || available <= 0) return 1;
    const ratio = Math.max(0, pizzas) / available;
    return ratio >= 0.75 ? 3 : ratio >= 0.35 ? 2 : 1;
  }
  function nearestLane(x) {
    return !Number.isFinite(x) ? 1 : x < -1.1 ? 0 : x > 1.1 ? 2 : 1;
  }
  function pixelRatio(width, height, deviceRatio, quality = "auto") {
    const area = Math.max(1, width) * Math.max(1, height);
    const cap = quality === "high" ? 2 : quality === "battery" ? 1 : 1.5;
    const budget = quality === "high" ? 4000000 : quality === "battery" ? 900000 : 1600000;
    return Math.max(0.5, Math.min(Math.max(0.5, deviceRatio || 1), cap, Math.sqrt(budget / area)));
  }
  // Preserve elapsed play time at low frame rates without large collision steps.
  // Discard only backlog beyond 250 ms; at most five updates precede one render.
  // A zero step preserves first-frame spawning; pause/resume resets the frame clock.
  function simulationSlices(elapsed) {
    if (!Number.isFinite(elapsed) || elapsed <= 0) return [0];
    const budget = Math.min(0.25, elapsed);
    const count = Math.ceil(budget / 0.05);
    return Array(count).fill(budget / count);
  }
  const api = Object.freeze({ normalizeSave, mergeProgress, createSaveStore, starsFor, nearestLane, pixelRatio, simulationSlices });
  root.GameCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
