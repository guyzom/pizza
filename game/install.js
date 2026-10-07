/* Optional offline installation; failure never blocks play. No analytics. */
(() => {
  "use strict";
  const note = document.getElementById("install-state");
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  const hint = "באייפד: שיתוף בספארי ← הוספה למסך הבית.";
  function readyText() { note.textContent = "מוכן גם למשחק ללא רשת. " + hint; }
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" });
      if (navigator.serviceWorker.controller) readyText();
      navigator.serviceWorker.addEventListener("controllerchange", readyText);
      function watch(worker) {
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && reg.waiting) {
            note.textContent = "עדכון מחכה לפעם הבאה. סגרו את כל חלונות המשחק ופתחו מחדש כדי לעדכן.";
          }
        });
      }
      if (reg.waiting) note.textContent = "עדכון מחכה לפעם הבאה. סגרו את כל חלונות המשחק ופתחו מחדש כדי לעדכן.";
      watch(reg.installing);
      reg.addEventListener("updatefound", () => watch(reg.installing));
    } catch (_) { note.textContent = "אפשר לשחק עכשיו. למשחק ללא רשת נדרשת טעינה מלאה בחיבור לאינטרנט. " + hint; }
  });
})();
