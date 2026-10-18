// ============================================================================
//  Operação Madeira - Das Spiel – Oberfläche
// ============================================================================
(function () {
  "use strict";
  const C = window.GAME_CONTENT;
  const L = window.GameLogic;
  const MAP = window.MADEIRA_MAP;
  const T = window.QuestTools;
  const IX = L.index(C);
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Math.round(n).toLocaleString("de-DE");
  const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "±") + fmt(Math.abs(n));
  const store = {
    get(k) { try { return localStorage.getItem("madeira:" + k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem("madeira:" + k) : localStorage.setItem("madeira:" + k, v); } catch (e) { /* egal */ } }
  };

  const app = {
    token: store.get("token"),
    name: store.get("name") || "",
    view: "home", // Startseite: Inselkarte, Stapel-Quests, Regionen
    version: -1,
    state: null,
    online: true,
    polling: false,
    players: [], // alle Namen, mit denen sich je jemand angemeldet hat (vom Server)
    clockOffset: 0, // Serverzeit − Handyzeit (für synchrone Timer)
    busy: false,
    modals: [] // offene Fenster (oberstes zuletzt)
  };

  // ------------------------------------------------------------------ API
  // Ohne Netz hängt eine Anfrage sonst sehr lange – nach einer Weile abbrechen (= keine Verbindung).
  async function api(path, opts) {
    opts = opts || {};
    const ctrl = window.AbortController ? new AbortController() : null;
    const timer = ctrl && setTimeout(() => ctrl.abort(), opts.method === "POST" ? 20000 : 10000);
    let res;
    const t0 = Date.now();
    // Fehlerprotokoll: fehlgeschlagene Server-Anfragen (nicht das Melden selbst, nicht das falsche Passwort,
    // nicht der normale Konflikt 409; das regelmäßige Abholen des Spielstands meldet poll als „Synchronisierung“)
    const label = (opts.method || "GET") + " api/" + path.split("?")[0];
    const logIt = !/^client-error/.test(path) && !(path.indexOf("state") === 0 && !opts.method);
    try {
      res = await fetch("api/" + path, {
        method: opts.method || "GET",
        headers: Object.assign({ "Content-Type": "application/json" }, app.token ? { Authorization: "Bearer " + app.token } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
        signal: ctrl ? ctrl.signal : undefined
      });
    } catch (e) {
      if (logIt) reportError("Server-Anfrage", { name: e && e.name === "AbortError" ? "Zeitüberschreitung" : (e && e.name) || "Netzwerkfehler", message: label + ": keine Antwort" + (e && e.message ? " (" + e.message + ")" : "") });
      if (e) e.logged = true;
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* leer */ }
    const t1 = Date.now();
    if (data && typeof data.now === "number" && t1 - t0 < 3000) app.clockOffset = data.now - (t0 + t1) / 2;
    if (data && Array.isArray(data.players)) app.players = data.players;
    if (data && data.team && Array.isArray(data.team.names)) app.team = data.team;
    if (data && typeof data.memv === "number" && data.memv !== app.memv && app.token) loadMemories(data.memv); // Erinnerungsfotos geändert
    if (data && data.sim) setSim(data.sim); // Test-Simulation aktiv? (Band für alle Handys)
    if (logIt && res.status >= 400 && res.status !== 409 && !(res.status === 401 && path === "login")) {
      reportError("Server-Anfrage", { name: "HTTP " + res.status, message: label + (data && data.error ? ": " + data.error : "") });
    }
    if (res.status === 401 && path !== "login") { logout(); throw new Error("Bitte neu anmelden."); }
    return { status: res.status, data };
  }

  // Offline-Anzeige: Streifen unter der Kopfzeile; speichernde Knöpfe sind gesperrt.
  function setOnline(on) {
    const was = app.online;
    app.online = on;
    $("#offline").hidden = on;
    document.body.classList.toggle("is-offline", !on);
    if (on && !was) { toast("Wieder online – Spielstand ist aktuell."); sendErrors(); } // gemerkte Fehler nachschicken
    if (on !== was && app.state) rerenderTools(); // z. B. Foto-Knöpfe sperren/freigeben
  }

  // Server nicht erreichbar oder Fehlerseite (z. B. 502) zählt als offline.
  async function poll() {
    if (!app.token || app.polling) return;
    if (toolUI.picking || toolUI.reading) return; // Galerie offen / Dateien werden gelesen: Synchronisierung pausiert
    app.polling = true;
    app.syncReq = (app.syncReq || 0) + 1;
    try {
      const wasOffline = !app.online;
      // Nach einer Funkstille den kompletten Spielstand neu laden
      const r = await api("state" + (wasOffline ? "" : "?since=" + app.version));
      if (r.status !== 200 || !r.data) throw Object.assign(new Error("Server nicht erreichbar (HTTP " + r.status + ")"), { name: "Abholen fehlgeschlagen" });
      if (r.data.unchanged) { setOnline(true); return; }
      if (!r.data.state) { await createGame(); setOnline(true); return; }
      receive(r.data.version, r.data.state, false);
      setOnline(true);
    } catch (e) {
      if (!e || !e.logged) reportError("Synchronisierung", e);
      setOnline(false);
    } finally {
      app.polling = false;
    }
  }

  async function createGame() {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const s = L.newGame(C, seed, Date.now());
    const r = await api("state", { method: "POST", body: { baseVersion: 0, state: s } });
    if (r.status === 200) receive(r.data.version, s, true);
    else if (r.status === 409 && r.data.state) receive(r.data.version, r.data.state, false);
  }

  function receive(version, state, own) {
    app.syncRecv = (app.syncRecv || 0) + 1;
    const prev = app.state;
    app.version = version;
    app.state = state;
    if (prev && prev.seed === state.seed && L.isCompatible(prev, C) && L.isCompatible(state, C)) {
      celebrate(prev, state, own);
      if (!own) announceRemote(prev, state);
    }
    render();
    if (!prev && L.isCompatible(state, C)) { // erster Stand nach dem (Neu-)Laden
      restoreOpenTool(); checkPhotoPickReload(); sendErrors(); loadMemories();
      if (!store.get("tourDone") && !app.modals.length) setTimeout(startTour, 500); // Einführung: einmal pro Handy
    }
  }

  // Aktion ausführen: lokal anwenden, an Server senden, bei Konflikt neu versuchen.
  async function act(action, opts) {
    opts = opts || {};
    if (app.busy) return false;
    if (!app.online) {
      await poll(); // vielleicht ist das Netz gerade zurück
      if (!app.online) { toast(OFFLINE_MSG, true); return false; }
    }
    app.busy = true;
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        let next;
        try {
          next = L.apply(app.state, C, action, app.name, Math.round(serverNow())); // Serverzeit: Datum/Uhrzeit für alle Handys gleich
        } catch (e) {
          if (e instanceof L.GameError) { toast(e.message, true); return false; }
          throw e;
        }
        let r;
        try {
          r = await api("state", { method: "POST", body: { baseVersion: app.version, state: next } });
        } catch (e) {
          setOnline(false);
          toast("Speichern fehlgeschlagen: keine Verbindung. Die Aktion wurde NICHT ausgeführt.", true);
          return false;
        }
        if (r.status >= 500) {
          setOnline(false);
          toast("Speichern fehlgeschlagen: Server nicht erreichbar. Die Aktion wurde NICHT ausgeführt.", true);
          return false;
        }
        setOnline(true);
        if (r.status === 200) {
          receive(r.data.version, next, true);
          if (opts.fxFrom) burst(opts.fxFrom, next);
          return true;
        }
        if (r.status === 409) { receive(r.data.version, r.data.state, false); continue; }
        toast("Speichern fehlgeschlagen" + (r.data && r.data.error ? " (" + r.data.error + ")" : "") + ". Die Aktion wurde NICHT ausgeführt.", true);
        return false;
      }
      reportError("Synchronisierung", { name: "Konflikt", message: "Aktion „" + action.type + "“ nach 4 Versuchen nicht gespeichert" });
      toast("Gerade sehr viel los – nicht gespeichert, bitte nochmal versuchen.", true);
      return false;
    } finally {
      app.busy = false;
    }
  }

  const OFFLINE_MSG = "Offline – Abhaken, Rückgängig, Käufe und Hilfsmittel gehen erst wieder mit Netz.";
  // Knöpfe, die etwas speichern würden (offline gesperrt)
  const SAVING_BUTTONS = "[data-tool-act], [data-done], [data-swap], [data-mult], [data-undo], [data-quest], #buy-joker, #end-btn, #reset-btn, #reopen-btn, #restore-btn, #upgrade-btn, #finish";

  // ------------------------------------------------------------------ Spielstand sichern / wiederherstellen
  function localDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function downloadBackup() {
    const doc = { app: "operacao-madeira", savedAt: new Date().toISOString(), savedBy: app.name, version: app.version, state: app.state };
    const blob = new Blob([JSON.stringify(doc, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "operacao-madeira-" + localDate(new Date()) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Spielstand gesichert: " + a.download);
  }
  // Prüft eine Sicherungsdatei; liefert den Spielstand oder wirft einen Fehlertext.
  function parseBackup(text) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) { throw "Die Datei ist keine gültige Sicherung."; }
    const st = doc && doc.state;
    if (!st || typeof st !== "object" || !Array.isArray(st.log) || !st.seed) throw "Die Datei ist keine Sicherung von Operação Madeira.";
    if (!L.isCompatible(st, C)) throw "Die Sicherung passt nicht zu dieser Spielversion.";
    try { L.summary(st, C); } catch (e) { throw "Die Sicherung ist beschädigt."; }
    return { state: st, savedAt: doc.savedAt };
  }
  async function restoreBackup(file) {
    let b;
    try { b = parseBackup(await file.text()); } catch (e) { toast(typeof e === "string" ? e : "Datei konnte nicht gelesen werden.", true); return; }
    const from = b.savedAt ? " vom " + new Date(b.savedAt).toLocaleString("de-DE", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    const ok = await confirmBox("Spielstand wiederherstellen?", "Achtung: Der aktuelle Spielstand wird für ALLE drei Handys durch die Sicherung" + from +
      " ersetzt (" + fmt(L.summary(b.state, C).earned) + " Punkte verdient). Alles, was seitdem passiert ist, geht verloren.", "Überschreiben", true);
    if (!ok) { backToSettings("backup"); return; }
    if (!app.online) await poll();
    if (!app.online) { toast(OFFLINE_MSG, true); return; }
    for (let attempt = 0; attempt < 3; attempt++) {
      let r;
      try {
        r = await api("state", { method: "POST", body: { baseVersion: app.version, state: b.state } });
      } catch (e) {
        setOnline(false);
        toast("Wiederherstellen fehlgeschlagen: keine Verbindung. Es wurde nichts geändert.", true);
        return;
      }
      if (r.status === 200) { receive(r.data.version, b.state, true); toast("Spielstand wiederhergestellt."); return; }
      if (r.status === 409) { app.version = r.data.version; continue; } // bewusst überschreiben
      if (r.status >= 500) setOnline(false);
      toast("Wiederherstellen fehlgeschlagen. Es wurde nichts geändert.", true);
      return;
    }
    toast("Gerade sehr viel los – bitte nochmal versuchen.", true);
  }
  $("#restore-file").addEventListener("change", (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (f) restoreBackup(f);
  });

  // ------------------------------------------------------------------ Login
  function showLogin() {
    $("#app").hidden = true;
    $("#login").hidden = false;
    $("#login-name").value = app.name;
  }
  function logout() {
    app.token = null;
    store.set("token", null);
    showLogin();
  }
  $("#login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const name = $("#login-name").value.trim();
    const password = $("#login-pass").value;
    $("#login-error").textContent = "";
    if (!name) return;
    try {
      const r = await api("login", { method: "POST", body: { password, name } });
      if (r.status !== 200) { $("#login-error").textContent = "Falsches Passwort."; return; }
      app.token = r.data.token; app.name = name;
      store.set("token", app.token); store.set("name", name);
      $("#login-pass").value = "";
      start();
    } catch (e) {
      $("#login-error").textContent = "Keine Verbindung zum Server.";
    }
  });

  function start() {
    $("#login").hidden = true;
    $("#app").hidden = false;
    requestAnimationFrame(fitLogo);
    if (document.fonts && document.fonts.load) document.fonts.load('27px "Bebas Neue"', "Operação Madeira").then(fitLogo, () => {});
    render();
    poll();
    registerName();
  }
  // Namen beim Server melden – er merkt sich alle Spieler (z. B. für die Auswahl beim Tic-Tac-Toe)
  function registerName() {
    if (app.token && app.name) api("player", { method: "POST", body: { name: app.name } }).catch(() => { /* beim nächsten Start */ });
  }

  // ------------------------------------------------------------------ Rendering
  function sum() { return L.summary(app.state, C); }

  function render() {
    // Während auf der Inselkarte gezoomt/verschoben wird, nicht neu zeichnen – danach nachholen
    if (mapUI.active && app.view === "home" && $("#map-wrap")) { mapUI.renderPending = true; return; }
    if (!app.state) { $("#view").innerHTML = '<div class="empty">Spielstand wird geladen …</div>'; return; }
    if (!L.isCompatible(app.state, C)) { renderUpgrade(); return; }
    const s = sum();
    $("#hdr-points").textContent = fmt(s.balance) + " P";
    $("#hdr-points").classList.toggle("neg", s.balance < 0);
    $("#hdr-rank").textContent = s.rankName;
    $("#rb-fig").innerHTML = rankFigure(s.rank, "fig-sm");
    // Urlaub beendet: nur die Ansicht „Urlaub beendet“ (bzw. über „Erfolge ansehen“ die Erfolge) – kein Wischen, keine Kopfzeilen-Navigation
    const ended = !!app.state.ended;
    if (!ended) app.endedStats = false;
    document.body.classList.toggle("is-ended", ended);
    const view = ended ? "stats" : VIEWS[app.view] ? app.view : "home";
    $$(".hdr-btn[data-go]").forEach((b) => b.classList.toggle("active", b.dataset.go === view || (SETTINGS_PAGES.indexOf(view) >= 0 && b.dataset.go === "settings")));
    // Punkte-Band unter der Kopfzeile: aktuelle Hauptseite (nur auf den 5 Hauptseiten)
    const pi = MAIN_PAGES.indexOf(view), dots = $("#page-dots");
    if (dots) { dots.hidden = pi < 0; $$("i", dots).forEach((d, i) => d.classList.toggle("on", i === pi)); }
    // Mitspieler: Feld, in dem gerade getippt wird, nicht ersetzen (Tastatur bleibt offen)
    const typing = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("team-input");
    if (!(typing && app.view === "team")) $("#view").innerHTML = pageHTML(view, s);
    if (view === "home") mountMap();
    app.modals.forEach((m) => m.refresh());
    if (tour.on) requestAnimationFrame(tourPlace); // Einführung: Hervorhebung an die neu gezeichnete Seite anpassen
  }

  const VIEWS = { home: viewHome, shop: viewShop, log: viewLog, stats: viewStats, settings: viewSettings,
    help: viewHelp, player: viewPlayer, team: viewTeam, backup: viewBackup, errors: viewErrors, photos: viewPhotos, end: viewEnd, sim: viewSim, reset: viewReset };
  // Inhalt einer Seite (auch für die Vorschau beim Wischen)
  function pageHTML(view, s) {
    if (app.state.ended && view === "stats") { // Urlaub beendet: eigene Knöpfe statt der normalen Navigation
      return app.endedStats ? '<button class="back-btn" id="ended-back">' + icon("arrow-left") + " Zurück zum Urlaubsende</button>" + viewStats(s) : viewEnded(s);
    }
    const body = VIEWS[view](s);
    // Unterseiten der Einstellungen: „← Einstellungen“ und „Zu den Quests“; alle anderen Bereiche: „← Zu den Quests“
    const back = view === "home" ? ""
      : SETTINGS_PAGES.indexOf(view) >= 0
        ? '<div class="back-row"><button class="back-btn" data-go="settings">' + icon("arrow-left") + ' Einstellungen</button>' +
          '<button class="back-btn back-home" data-go="home">' + icon("map-pinned") + " Zu den Quests</button></div>"
        : '<button class="back-btn" data-go="home">' + icon("arrow-left") + " Zu den Quests</button>";
    return back + body;
  }

  // ---- Wischen zwischen den Hauptseiten (wie Fotos durchwischen)
  // Startseite – Shop – Erfolge – Aktivitäten – Einstellungen; nach links = weiter, nach rechts = zurück, nicht im Kreis.
  // Die Seite gleitet mit dem Finger, die Nachbarseite schiebt sich als Vorschau herein; losgelassen rastet sie ein.
  // Nur ein deutlich waagerechter, langer oder schneller Wisch wechselt; senkrechtes Scrollen bleibt beim Browser
  // (touch-action: pan-y). Kein Wischen an den Bildschirmrändern (Zurück-Geste von Android/Safari), auf Karte,
  // Zeichenfläche, Ziehen-Listen, Eingabefeldern, in offenen Fenstern und auf Unterseiten der Einstellungen.
  const MAIN_PAGES = ["home", "shop", "stats", "log", "settings"];
  const SWIPE_NO = "#map-wrap, .bay-map-wrap, .draw-pad, canvas, .sort-list, .sort-item, input, textarea, select, [contenteditable], .modal, .no-swipe";
  const EDGE = 28; // px am Bildschirmrand gehören der Zurück-Geste des Systems
  const sw = { g: null, busy: false };
  function swipeStart(e) {
    if (sw.busy || e.touches.length !== 1 || app.modals.length || MAIN_PAGES.indexOf(app.view) < 0 || !app.state || !L.isCompatible(app.state, C) || app.state.ended) return;
    const t = e.touches[0];
    if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
    if (!e.target.closest || !e.target.closest("#view") || e.target.closest(SWIPE_NO)) return;
    sw.g = { x0: t.clientX, y0: t.clientY, t0: performance.now(), dx: 0, mode: "?", hist: [] };
  }
  function swipeMove(e) {
    const g = sw.g;
    if (!g) return;
    if (e.touches.length !== 1) { swipeAbort(); return; }
    const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (g.mode === "?") {
      if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx) * 0.6) { sw.g = null; return; } // senkrecht: normal scrollen
      if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 2) return;                      // noch nicht eindeutig
      g.mode = "h";
      swipeBegin(g);
    }
    if (e.cancelable) e.preventDefault();
    const i = MAIN_PAGES.indexOf(app.view), hasNext = dx < 0 ? i < MAIN_PAGES.length - 1 : i > 0;
    g.dx = hasNext ? dx : dx * 0.25; // am Anfang/Ende nur ein kleiner federnder Ausschlag
    g.hist.push([performance.now(), t.clientX]); if (g.hist.length > 6) g.hist.shift();
    swipeSet(g.dx, false);
  }
  function swipeBegin(g) {
    const view = $("#view"), W = window.innerWidth, i = MAIN_PAGES.indexOf(app.view);
    const top = Math.max(0, ($(".topbar") || view).getBoundingClientRect().bottom, view.getBoundingClientRect().top);
    g.W = W;
    g.peeks = {};
    [-1, 1].forEach((d) => {
      const name = MAIN_PAGES[i + d];
      if (!name) return;
      const el = document.createElement("div");
      el.className = "swipe-peek";
      el.style.top = top + "px";
      el.innerHTML = '<div class="view">' + pageHTML(name, sum()).replace(/\sid="[^"]*"/g, "") + "</div>"; // ohne IDs: keine Doppelten
      el.style.transform = "translate3d(" + d * W + "px,0,0)";
      document.body.appendChild(el);
      g.peeks[d] = el;
    });
    view.classList.add("swiping");
  }
  function swipeSet(dx, anim) {
    const g = sw.g, view = $("#view");
    if (!g || !view) return;
    [view].concat(Object.values(g.peeks)).forEach((el) => { el.style.transition = anim ? "transform .24s cubic-bezier(.2,.8,.2,1)" : "none"; });
    view.style.transform = "translate3d(" + dx + "px,0,0)";
    Object.keys(g.peeks).forEach((d) => { g.peeks[d].style.transform = "translate3d(" + (d * g.W + dx) + "px,0,0)"; });
  }
  function swipeEnd() {
    const g = sw.g;
    sw.g = null;
    if (!g || g.mode !== "h") return;
    const i = MAIN_PAGES.indexOf(app.view), dir = g.dx < 0 ? 1 : -1, target = MAIN_PAGES[i + dir];
    const h = g.hist, v = h.length > 1 ? (h[h.length - 1][1] - h[0][1]) / Math.max(1, h[h.length - 1][0] - h[0][0]) : 0; // px/ms
    const go2 = target && (Math.abs(g.dx) > g.W * 0.33 || (Math.abs(g.dx) > 50 && Math.abs(v) > 0.35 && Math.sign(v) === -dir));
    sw.g = g; sw.busy = true;
    swipeSet(go2 ? -dir * g.W : 0, true);
    setTimeout(() => {
      const view = $("#view");
      Object.values(g.peeks).forEach((el) => el.remove());
      view.classList.remove("swiping");
      view.style.transition = "none"; view.style.transform = "";
      sw.g = null; sw.busy = false;
      if (go2) go(target);
    }, 250);
  }
  function swipeAbort() {
    const g = sw.g;
    if (!g) return;
    if (g.mode === "h") { g.dx = 0; swipeEnd(); } else sw.g = null;
  }
  document.addEventListener("touchstart", swipeStart, { passive: true });
  document.addEventListener("touchmove", swipeMove, { passive: false });
  document.addEventListener("touchend", swipeEnd);
  document.addEventListener("touchcancel", swipeAbort);

  // Alter Spielstand (vor den finalen Inhalten) -> einmal neu starten
  function renderUpgrade() {
    closeAll();
    $("#hdr-points").textContent = "–";
    $("#hdr-rank").textContent = "Neue Spielinhalte";
    $("#rb-fig").innerHTML = "";
    $("#view").innerHTML = '<div class="panel"><h2>Neue Spielinhalte ' + icon("party-popper") + '</h2>' +
      '<p>Das Spiel hat die finalen Quests bekommen. Der gespeicherte Spielstand stammt noch von der alten Version und passt nicht mehr dazu.</p>' +
      '<p class="muted small">Ein Neustart setzt alles auf null und mischt den Stapel neu – für alle Handys.</p>' +
      '<button class="btn btn-primary btn-block" id="upgrade-btn">Neues Spiel starten</button></div>';
  }

  // Unterseiten der Einstellungen (Abbrechen einer Sicherheitsabfrage führt dorthin zurück)
  const SETTINGS_PAGES = ["help", "player", "team", "backup", "photos", "errors", "end", "sim", "reset"];
  const backToSettings = (view) => { if (app.view === view) go("settings"); };

  // Bereiche (Shop, Erfolge, Aktivitäten, Einstellungen und ihre Unterseiten) öffnen sich als eigene Seite; die Zurück-Taste
  // des Handys führt wieder zur Startseite.
  function go(view) {
    if (view === "home" && history.state && history.state.view) { history.back(); return; }
    // Zwischen den Bereichen wird der Eintrag ersetzt statt gestapelt –
    // so führt "Zurück" (Knopf oder Handy-Taste) immer direkt zur Startseite.
    if (view !== "home" && view !== app.view) {
      if (history.state && history.state.view) history.replaceState({ view }, "");
      else history.pushState({ view }, "");
    }
    show(view);
  }
  function show(view) {
    app.view = view;
    window.scrollTo(0, 0);
    render();
    if (view === "errors") loadErrorLog();
    if (view === "photos") loadMemories(); // Speicherplatz aktuell
  }
  window.addEventListener("popstate", (ev) => { closeAll(); show((ev.state && ev.state.view) || "home"); });

  // ---- Inselkarte
  // Breiten-/Längengrad -> Kartenkoordinaten (UTM Zone 28N, wie die Gemeindegrenzen)
  function toMap(lat, lon) {
    const P = MAP.proj;
    const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), k0 = 0.9996, ep2 = e2 / (1 - e2);
    const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180, lam0 = (P.zone * 6 - 183) * Math.PI / 180;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, Cc = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lam0);
    const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) +
      (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
    const x = k0 * N * (A + (1 - T + Cc) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * Cc - 58 * ep2) * A ** 5 / 120) + 500000;
    const y = k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * Cc + 4 * Cc * Cc) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * Cc - 330 * ep2) * A ** 6 / 720));
    return [(x - P.minx) * P.s + P.pad, (P.maxy - y) * P.s + P.pad];
  }
  const PINS = [];
  C.regions.forEach((r) => r.quests.forEach((q, i) => PINS.push({ q, region: r, n: i + 1, xy: toMap(q.pin[0], q.pin[1]) })));

  // Zoom-Zustand der Inselkarte: s = Faktor (1–8), tx/ty = Verschiebung in Bildschirmpixeln (bleibt beim Neuzeichnen)
  const mapUI = { st: { s: 1, tx: 0, ty: 0 }, active: false };

  function regionPaths(levels) {
    return C.regions.map((r) => {
      const lvl = levels[r.id] || 0;
      const d = (MAP.regions[r.name] || []).join(" ");
      const hl = mapUI.here && mapUI.here.region === r.id && Date.now() < mapUI.here.hlUntil ? " here-hl" : "";
      return '<path class="region-path' + hl + '" data-region="' + r.id + '" tabindex="0" role="button" aria-label="' + esc(r.name + ": " + L.LEVELS[lvl].name) + '" d="' + d + '" fill="' + L.LEVELS[lvl].color + '"/>';
    }).join("");
  }
  function mapSVG(levels, opts) {
    opts = opts || {};
    const labels = opts.labels === false ? "" : C.regions.map((r) => {
      const p = MAP.labels[r.name];
      return p ? '<text class="region-label" x="' + p[0] + '" y="' + p[1] + '">' + esc(r.name) + "</text>" : "";
    }).join("");
    return '<svg viewBox="0 0 ' + MAP.w + " " + MAP.h + '" xmlns="http://www.w3.org/2000/svg">' + regionPaths(levels) + labels + "</svg>";
  }

  // 3 Sterne für Erkundet / Erobert / Erschlossen: erreicht = voll und kräftig, sonst nur Umriss
  const STAR_PATH = "M12 2.6l2.85 5.97 6.55.83-4.82 4.55 1.25 6.5L12 17.27l-5.83 3.18 1.25-6.5L2.6 9.4l6.55-.83z";
  function stars(lvl) {
    let h = "";
    for (let i = 0; i < 3; i++) h += '<svg class="star' + (i < lvl ? " on" : "") + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg>';
    return '<span class="stars" role="img" aria-label="' + lvl + ' von 3 Sternen">' + h + "</span>";
  }

  // Startseite: a) Inselkarte, b) offene Stapel-Quests, c) Regionen mit Sternen
  function viewHome(s) {
    const legend = L.LEVELS.map((l, i) => '<span><i style="background:' + l.color + '"></i>' + (i === 0 ? "Unbesucht" : l.name) + "</span>").join("");
    const labels = C.regions.map((r) => (MAP.labels[r.name] ? '<text class="region-label" data-label="' + esc(r.name) + '">' + esc(r.name) + "</text>" : "")).join("");
    const st = mapUI.st;
    return '' +
      (app.state.ended ? '<div class="panel ended-note"><strong>' + icon("flag") + ' Urlaub beendet.</strong> <button class="btn btn-small btn-gold" data-go="stats">Zertifikat & Belohnungen</button></div>' : "") +
      '<section class="home-sec region-zone" aria-label="Regionale Quests">' +
      '<div class="zone-head"><div><h2>' + icon("map-pinned") + ' Regionale Quests</h2>' +
      '<div class="zone-sub">' + s.explored + " von " + C.regions.length + " Regionen erkundet · " + s.questsDone + " von 30 erledigt</div></div></div>" +
      // Karte (per CSS-Transform gezoomt) + Ebene darüber mit Pins, Namen und Standortpunkt in Bildschirmgröße
      '<div class="map-wrap' + (st.s > 1.001 ? " zoomed" : "") + '" id="map-wrap"><div class="map-stage" id="map-stage" style="transform:translate3d(' + st.tx + "px," + st.ty + "px,0) scale(" + st.s + ')">' +
        '<svg id="island" viewBox="0 0 ' + MAP.w + " " + MAP.h + '" xmlns="http://www.w3.org/2000/svg" style="--zs:' + st.s + '"><g id="regions">' + regionPaths(s.levels) + "</g></svg></div>" +
        '<svg class="map-ov" id="map-ov"><g id="pins"></g><g id="labels">' + labels + "</g></svg>" +
        '<button class="map-reset" data-map-reset aria-label="Ganze Insel zeigen">' + icon("scan") + "</button>" +
        '<button class="map-locate" data-here aria-label="Wo bin ich? Standort einmalig abfragen" title="Wo bin ich?">' + icon("locate-fixed") + "</button></div>" +
      '<div class="map-bar"><div class="legend">' + legend + "</div></div>" + hereBox() + "</section>" +
      stackZone(s) +
      '<button class="btn btn-ghost btn-block all-quests-btn" data-all-quests>' + icon("list-checks") + ' Alle Quests anzeigen</button>';
  }

  // Regionsfortschritt (Meilensteine, Regionen mit Sternen) – wird bei den Erfolgen angezeigt
  function regionsSection(s) {
    // Rangliste: Erschlossen → Erobert → Erkundet → Unbesucht; gleiche Stufe in Karten-Reihenfolge (zeilenweise, links zuerst)
    const ranked = C.regions.map((r, i) => ({ r, i })).sort((a, b) => (s.levels[b.r.id] - s.levels[a.r.id]) || (a.i - b.i)).map((x) => x.r);
    const list = ranked.map((r) => {
      const lvl = s.levels[r.id];
      return '<button class="region-btn" data-region="' + r.id + '"><span class="dot" style="background:' + L.LEVELS[lvl].color + '"></span><span class="region-name">' + esc(r.name) + "</span>" + stars(lvl) + "</button>";
    }).join("");
    const rp = L.regionProgress(s, C);
    const milestones = ["erkundet", "erobert", "erschlossen"]
      .map((w, i) => '<span class="ms' + (rp.done[i] ? " on" : "") + '">' + (rp.done[i] ? icon("check") + " " : "") + "Madeira " + w + "</span>").join("");
    return '<section class="home-sec regions-sec" aria-label="Regionen">' +
        '<div class="sec-head"><h2>' + icon("map-pinned") + ' Regionen</h2></div>' +
        '<div class="panel">' +
          '<div class="row between"><strong>' + rp.text + '</strong><span class="muted small">' + s.questsDone + " von 30 regionale Quests</span></div>" +
          stageBar(rp, "Regionen") +
          '<div class="ms-row">' + milestones + "</div>" +
        "</div>" +
        '<div class="region-list">' + list + "</div></section>";
  }

  // Pins: feste Bildschirmgröße. Liegen Pins zu nah beieinander, werden sie zu
  // einer Gruppe (Kreis mit Anzahl) zusammengefasst; beim Hineinzoomen lösen sie sich auf.
  // r = sichtbarer Kreis, hit = Tippfläche (Finger, 44 px), lift = Abstand über dem Standort, gap = ab hier Gruppe
  const PIN = { r: 11, hit: 22, lift: 17, gap: 28 };
  // Pin-Farbe: offen = wie unbesuchte Region, erledigt = wie erkundete Region
  function pinFill(done) { return L.LEVELS[done ? 1 : 0].color; }
  function mountMap() {
    const wrap = $("#map-wrap");
    if (!wrap) return;
    mapUI.pz = panZoom(wrap, $("#map-stage", wrap), mapUI.st, {
      mouseTap: true,
      onChange: (live) => { if (live) maybeRelayout(); moveOverlay(); },
      onEnd: () => {
        layoutPins();
        const isl = $("#island"); if (isl) isl.style.setProperty("--zs", mapUI.st.s); // Grenzlinien wieder dünn
        if (mapUI.renderPending) { mapUI.renderPending = false; render(); }
      },
      onActive: (on) => { mapUI.active = on; },
      onTap: mapTap,
      onDoubleTap: () => clearTimeout(mapUI.tapTimer)
    });
    // Regionsnamen: Größe einmal messen (sie bleiben auf dem Bildschirm immer gleich groß)
    mapUI.labelBox = {};
    $$("#map-ov .region-label").forEach((t) => {
      t.setAttribute("x", 0); t.setAttribute("y", 0);
      let b = null; try { b = t.getBBox(); } catch (e) { /* nicht sichtbar */ }
      if (b && b.width) mapUI.labelBox[t.dataset.label] = [b.x, b.y, b.width, b.height];
    });
    mapUI.pz.apply(false);
    layoutPins();
  }
  // Antippen (kein Verschieben): Pin/Gruppe sofort; Region kurz verzögert, damit Doppeltippen (Zoom) sie nicht öffnet
  function mapTap(x, y, mouse) {
    const el = document.elementFromPoint(x, y);
    if (!el || !el.closest) return;
    if (el.closest("[data-map-reset]")) { mapUI.pz.reset(); return; }
    if (el.closest("[data-here]")) { whereAmI(); return; }
    const pin = el.closest("[data-pin]"), grp = el.closest("[data-group]"), reg = el.closest(".region-path[data-region]");
    // Maus: den Klick nach dem Loslassen abfangen, sonst schließt er das neue Fenster sofort (Finger: kein Klick)
    if ((pin || grp) && mouse) mapUI.ghostUntil = Date.now() + 500;
    clearTimeout(mapUI.tapTimer);
    if (pin) openQuest(pin.dataset.pin);
    else if (grp) openGroup(+grp.dataset.group);
    else if (reg) mapUI.tapTimer = setTimeout(() => openRegion(reg.dataset.region), 280);
  }
  // Kartenpunkt → Bildschirmpunkt in der Kartenfläche (Pixel)
  function mapScreen(xy) {
    const wrap = $("#map-wrap"), k = (wrap ? wrap.clientWidth : 0) / MAP.w * mapUI.st.s;
    return [xy[0] * k + mapUI.st.tx, xy[1] * k + mapUI.st.ty];
  }
  // Während des Zoomens: nur die Positionen der Pins, Namen und des Standortpunkts nachführen (kein Neuaufbau)
  function moveOverlay() {
    const lay = mapUI.lay;
    $$("#map-ov .region-label").forEach((t) => {
      const p = mapScreen(MAP.labels[t.dataset.label]);
      t.setAttribute("x", p[0].toFixed(1)); t.setAttribute("y", p[1].toFixed(1));
    });
    if (!lay) return;
    lay.groups.forEach((g) => {
      const pts = g.items.map((o) => mapScreen(o.p.xy));
      const hx = pts.reduce((a, q) => a + q[0], 0) / pts.length + g.ox, hy = pts.reduce((a, q) => a + q[1], 0) / pts.length + g.oy;
      if (g.el) g.el.setAttribute("transform", "translate(" + hx.toFixed(1) + " " + hy.toFixed(1) + ")");
      g.items.forEach((o, i) => {
        if (!o.line) return;
        o.line.setAttribute("x1", pts[i][0].toFixed(1)); o.line.setAttribute("y1", pts[i][1].toFixed(1));
        o.line.setAttribute("x2", hx.toFixed(1)); o.line.setAttribute("y2", hy.toFixed(1));
        o.dot.setAttribute("cx", pts[i][0].toFixed(1)); o.dot.setAttribute("cy", pts[i][1].toFixed(1));
      });
    });
    if (lay.here && mapUI.here && mapUI.here.xy) {
      const p = mapScreen(mapUI.here.xy);
      lay.here.forEach((c) => { c.setAttribute("cx", p[0].toFixed(1)); c.setAttribute("cy", p[1].toFixed(1)); });
    }
  }
  // Gruppen beim Zoomen neu bilden (lösen sich beim Reinzoomen auf), höchstens alle 150 ms
  function maybeRelayout() {
    const st = mapUI.st, l = mapUI.lastLay || { s: 1, tx: 0, ty: 0, t: 0 };
    if (Date.now() - l.t < 150) return;
    if (Math.abs(Math.log(st.s / l.s)) > 0.22 || Math.hypot(st.tx - l.tx, st.ty - l.ty) > 90) layoutPins();
  }
  function layoutPins() {
    const wrap = $("#map-wrap"), ov = $("#map-ov");
    if (!wrap || !ov || !wrap.clientWidth) return;
    const W = wrap.clientWidth, H = wrap.clientHeight, st = mapUI.st;
    mapUI.lastLay = { s: st.s, tx: st.tx, ty: st.ty, t: Date.now() };
    const pts = PINS.map((p) => { const q = mapScreen(p.xy); return { p, ax: q[0], ay: q[1] }; })
      .filter((o) => o.ax > -30 && o.ax < W + 30 && o.ay > -10 && o.ay < H + 40);
    // Gruppen bilden (einfaches Zusammenlegen, bis nichts mehr überlappt)
    // Kopf-Position (über dem Standort, am Kartenrand festgehalten)
    const headX = (x) => Math.max(PIN.r + 2, Math.min(W - PIN.r - 2, x));
    const headY = (y) => Math.max(PIN.r + 2, Math.min(H - PIN.r - 2, y - PIN.lift));
    let groups = pts.map((o) => ({ items: [o], x: headX(o.ax), y: headY(o.ay) }));
    for (let merged = true; merged;) {
      merged = false;
      outer: for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          if (Math.hypot(groups[i].x - groups[j].x, groups[i].y - groups[j].y) < PIN.gap) {
            const items = groups[i].items.concat(groups[j].items);
            groups[i] = { items, x: headX(items.reduce((a, o) => a + o.ax, 0) / items.length), y: headY(items.reduce((a, o) => a + o.ay, 0) / items.length) };
            groups.splice(j, 1);
            merged = true;
            break outer;
          }
        }
      }
    }
    avoidLabels(groups, W, H, headX, headY);
    // Abstand des Kopfes zur Mitte seiner Standorte merken – so wandert er beim Verschieben/Zoomen mit
    groups.forEach((g) => { g.ox = g.x - g.items.reduce((a, o) => a + o.ax, 0) / g.items.length; g.oy = g.y - g.items.reduce((a, o) => a + o.ay, 0) / g.items.length; });
    mapUI.groups = groups;
    const stems = [], heads = [];
    const N = (v) => v.toFixed(1);
    groups.forEach((g, gi) => {
      const hx = g.x, hy = g.y;
      g.items.forEach((o) => {
        stems.push('<line class="pin-stem" x1="' + N(o.ax) + '" y1="' + N(o.ay) + '" x2="' + N(hx) + '" y2="' + N(hy) + '" stroke-width="1.6"/>' +
          '<circle class="pin-dot" cx="' + N(o.ax) + '" cy="' + N(o.ay) + '" r="3"/>');
      });
      const tr = 'transform="translate(' + N(hx) + " " + N(hy) + ')"';
      if (g.items.length === 1) {
        const o = g.items[0], q = o.p.q, done = !!app.state.quests[q.id];
        heads.push('<g class="pin' + (done ? " done" : "") + '" data-pin="' + q.id + '" tabindex="0" role="button" aria-label="' + esc(q.title + " (" + o.p.region.name + ")" + (done ? ", erledigt" : ", offen")) + '" ' + tr + ">" +
          '<circle class="pin-hit" r="' + PIN.hit + '"/><circle class="pin-halo" r="' + (PIN.r + 2) + '"/>' +
          '<circle class="pin-head" r="' + PIN.r + '" fill="' + pinFill(done) + '"/><circle class="pin-core" r="3"/></g>');
      } else {
        const nDone = g.items.filter((o) => app.state.quests[o.p.q.id]).length;
        const all = nDone === g.items.length;
        heads.push('<g class="pin group' + (all ? " done" : "") + '" data-group="' + gi + '" tabindex="0" role="button" aria-label="' + g.items.length + " Quests, " + nDone + ' erledigt" ' + tr + ">" +
          '<circle class="pin-hit" r="' + (PIN.hit + 2) + '"/><circle class="pin-halo" r="' + (PIN.r + 3) + '"/>' +
          '<circle class="pin-head" r="' + (PIN.r + 1) + '" fill="' + pinFill(all) + '"/>' +
          '<text class="pin-txt" y="4.5">' + g.items.length + "</text></g>");
      }
    });
    const here = mapUI.here && mapUI.here.xy ? (() => { // roter, pulsierender Punkt am tatsächlichen Standort
      const [x, y] = mapScreen(mapUI.here.xy).map(N);
      return '<g class="here-mark" pointer-events="none"><circle class="here-pulse" cx="' + x + '" cy="' + y + '" r="7">' +
        '<animate attributeName="r" values="6;20" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".55;0" dur="1.6s" repeatCount="indefinite"/></circle>' +
        '<circle class="here-dot" cx="' + x + '" cy="' + y + '" r="6" stroke-width="2.5"/></g>';
    })() : "";
    const pinsEl = $("#pins", ov);
    pinsEl.innerHTML = stems.join("") + heads.join("") + here;
    // Elemente merken, damit moveOverlay sie ohne Neuaufbau verschieben kann
    const lines = $$(".pin-stem", pinsEl), dots = $$(".pin-dot", pinsEl), headEls = $$(".pin", pinsEl);
    let n = 0;
    groups.forEach((g, gi) => { g.el = headEls[gi]; g.items.forEach((o) => { o.line = lines[n]; o.dot = dots[n]; n++; }); });
    mapUI.lay = { groups, here: here ? $$(".here-mark circle", pinsEl) : null };
    moveOverlay();
  }
  // ---- Standort: nur auf Knopfdruck und einmalig abgefragt; nichts wird gespeichert oder mit anderen Handys geteilt.
  // Region aus den Gemeindegrenzen (map-data.js), Höhe aus GPS (auf Meeresspiegel umgerechnet) und Geländehöhe (Open-Meteo).
  const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function getPosition() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) { rej({ code: 0 }); return; }
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
  }
  // Geländehöhe am Standort (kostenlos, ohne Schlüssel; Copernicus-Höhenmodell, ca. 90 m Raster). Ohne Internet: null
  async function terrainHeight(lat, lon) {
    const ctl = window.AbortController ? new AbortController() : null;
    const timer = ctl && setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch("https://api.open-meteo.com/v1/elevation?latitude=" + lat.toFixed(5) + "&longitude=" + lon.toFixed(5), ctl ? { signal: ctl.signal } : {});
      const j = await r.json();
      const v = j && j.elevation && j.elevation[0];
      return typeof v === "number" && isFinite(v) ? Math.round(v) : null;
    } catch (e) { return null; } finally { if (timer) clearTimeout(timer); }
  }
  async function locate() {
    const pos = await getPosition(), c = pos.coords;
    const xy = toMap(c.latitude, c.longitude), name = T.regionAt(MAP, xy[0], xy[1]);
    const region = name ? (C.regions.find((r) => r.name === name) || {}).id || null : null;
    const terrain = await terrainHeight(c.latitude, c.longitude);
    return { lat: c.latitude, lon: c.longitude, acc: c.accuracy, xy, region, terrain,
      alt: T.seaLevelAltitude(c.altitude, IS_IOS), altAcc: c.altitudeAccuracy != null && isFinite(c.altitudeAccuracy) ? Math.round(c.altitudeAccuracy) : null };
  }
  const geoError = (e) => e && e.code === 1 ? "Standort nicht erlaubt – bitte in den Browser-Einstellungen für diese Seite freigeben."
    : e && e.code === 3 ? "Standort hat zu lange gedauert – bitte noch einmal versuchen (am besten unter freiem Himmel)."
    : "Standort ist gerade nicht verfügbar.";
  const fmtM = (m) => (m < 0 ? "−" : "") + fmt(Math.abs(m)) + " m";
  function heightLine(r) {
    const gps = r.alt != null ? "GPS " + fmtM(r.alt) + (r.altAcc != null ? " (± " + r.altAcc + " m)" : "") : "";
    const ter = r.terrain != null ? "Gelände " + fmtM(r.terrain) : "";
    return gps || ter ? "Höhe: " + [gps, ter].filter(Boolean).join(" · ") : "Keine Höhe verfügbar.";
  }
  function hereBox() {
    const h = mapUI.here;
    if (!h) return "";
    if (h.loading) return '<div class="here-box">' + icon("locate") + "<span>Standort wird ermittelt …</span></div>";
    const r = h.region && IX.regions[h.region];
    return '<div class="here-box">' + icon("map-pin", "here-ic") + '<div class="grow"><strong>' + (r ? "Ihr seid in " + esc(r.name) : "Gerade in keiner Region.") + "</strong>" +
      '<div class="small muted">' + heightLine(h) + "</div></div>" +
      '<button class="here-close" data-here-close aria-label="Standort ausblenden">' + icon("x") + "</button></div>";
  }
  async function whereAmI() {
    if (mapUI.here && mapUI.here.loading) return;
    mapUI.here = { loading: true };
    render();
    try {
      const r = await locate();
      mapUI.here = Object.assign(r, { hlUntil: Date.now() + 4000 });
      setTimeout(() => $$(".region-path.here-hl").forEach((p) => p.classList.remove("here-hl")), 4100);
    } catch (e) {
      mapUI.here = null;
      toast(geoError(e), true);
    }
    render();
  }
  // Höhe messen (Stapel-Quests): dieselbe Abfrage, nur auf diesem Handy
  async function measureAlt(qid) {
    if (toolUI.alt[qid] && toolUI.alt[qid].loading) return;
    toolUI.alt[qid] = { loading: true };
    rerenderTools(qid);
    try { toolUI.alt[qid] = { res: await locate() }; } catch (e) { toolUI.alt[qid] = { err: geoError(e) }; }
    rerenderTools(qid);
  }
  function altitudeBody(qid, cfg) {
    const a = toolUI.alt[qid] || {}, r = a.res;
    const val = (label, v, sub) => '<div class="alt-val"><div class="muted small">' + label + '</div><div class="tool-big">' + (v == null ? "–" : fmtM(v)) + '</div><div class="small muted">' + sub + "</div></div>";
    const best = r ? [r.alt, r.terrain].filter((v) => v != null) : [];
    const goals = cfg.goals.map((g) => {
      const hit = best.length && (g.min != null ? Math.max(...best) >= g.min : Math.min(...best) <= g.max);
      return '<span class="mark-chip' + (hit ? " ok" : "") + '">' + (hit ? icon("check") + " " : "") + esc(g.text) + "</span>";
    }).join(" ");
    return '<p class="tool-label">Ziel: ' + goals + "</p>" +
      (r ? '<div class="alt-vals">' +
        val("GPS-Höhe", r.alt, r.alt == null ? "Handy liefert gerade keine" : (r.altAcc != null ? "± " + r.altAcc + " m · " : "") + "über dem Meeresspiegel") +
        val("Gelände am Standort", r.terrain, r.terrain == null ? "nur mit Internet" : "Höhenmodell (Open-Meteo)") + "</div>" +
        '<p class="small muted">' + (r.region ? "Region: " + esc(IX.regions[r.region].name) : "Gerade in keiner Region.") + "</p>" : "") +
      (a.err ? '<p class="tool-warn">' + esc(a.err) + "</p>" : "") +
      '<button class="btn btn-primary btn-block" data-tool-ui="alt-measure"' + (a.loading ? " disabled" : "") + ">" + icon("locate-fixed") + (a.loading ? " Messe …" : r ? " Neu messen" : " Höhe messen") + "</button>" +
      '<p class="small muted">GPS-Höhen können 10–30 m danebenliegen. Die Geländehöhe gilt für den Boden an diesem Punkt (nicht auf Gebäuden, Brücken oder im Wasser).' +
        (cfg.goals.some((g) => g.max != null) ? " Unter Wasser misst das Handy nichts – da zählt euer Wort." : "") + " Gespeichert wird nichts.</p>";
  }

  // Pin-Köpfe dürfen die Namen der 10 Regionen nicht verdecken und sich nicht gegenseitig überlappen: liegt ein Kopf
  // auf einem Namen oder einem anderen Kopf, rückt er ein Stück weiter (zuerst nach oben); der Stiel zeigt weiter auf den
  // echten Standort. Findet sich kein freier Platz, werden die beiden Köpfe zu einer Gruppe (Kreis mit Anzahl).
  function avoidLabels(groups, W, H, headX, headY) {
    const boxes = [];
    Object.keys(mapUI.labelBox || {}).forEach((name) => {
      const b = mapUI.labelBox[name], p = mapScreen(MAP.labels[name]);
      boxes.push([p[0] + b[0] - 2, p[1] + b[1] - 1, b[2] + 4, b[3] + 2]);
    });
    boxes.push([W - 54, 0, 54, 54]);                                   // Knopf „Wo bin ich?“ oben rechts frei lassen
    if (mapUI.st.s > 1.001) boxes.push([W - 102, 0, 50, 54]);          // daneben „Zurücksetzen“ (nur gezoomt)
    const rad = (g) => (g.items.length > 1 ? PIN.r + 4 : PIN.r + 3);
    const onLabel = (x, y, R) => boxes.some(([bx, by, bw, bh]) => Math.hypot(x - Math.max(bx, Math.min(x, bx + bw)), y - Math.max(by, Math.min(y, by + bh))) <= R);
    const hitHead = (x, y, R, self) => groups.find((o) => o !== self && Math.hypot(x - o.x, y - o.y) <= R + rad(o) + 1);
    const free = (x, y, R, self) => x >= R && x <= W - R && y >= R && y <= H - R && !onLabel(x, y, R) && !hitHead(x, y, R, self);
    const ANG = [-90, -60, -120, -30, -150, 0, 180, 30, 150, 60, 120, 90];
    for (let round = 0; round < 40; round++) {
      let stuck = null;
      for (const g of groups) {
        const R = rad(g);
        if (free(g.x, g.y, R, g)) continue;
        let ok = false;
        search: for (let d = 4; d <= 44; d += 4) { // nur ein kurzes Stück ausweichen – lange Stiele werden unübersichtlich
          for (const a of ANG) {
            const x = g.x + d * Math.cos(a * Math.PI / 180), y = g.y + d * Math.sin(a * Math.PI / 180);
            if (free(x, y, R, g)) { g.x = x; g.y = y; ok = true; break search; }
          }
        }
        if (!ok && groups.length > 1) { stuck = g; break; }
      }
      if (!stuck) return;
      // kein Platz in der Nähe: mit dem nächsten Kopf zu einer Gruppe zusammenlegen und neu anordnen
      const other = groups.filter((o) => o !== stuck).reduce((a, o) => (Math.hypot(o.x - stuck.x, o.y - stuck.y) < Math.hypot(a.x - stuck.x, a.y - stuck.y) ? o : a));
      const items = stuck.items.concat(other.items);
      groups.splice(groups.indexOf(other), 1);
      Object.assign(stuck, { items, x: headX(items.reduce((s2, o) => s2 + o.ax, 0) / items.length), y: headY(items.reduce((s2, o) => s2 + o.ay, 0) / items.length) });
    }
  }

  // Gruppe antippen: Auswahl der Quests in der Gruppe
  function openGroup(gi) {
    const g = mapUI.groups && mapUI.groups[gi];
    if (!g) return;
    const ids = g.items.map((o) => o.p.q.id);
    openModal(() => '<div class="modal-head"><h2>' + ids.length + ' Quests hier</h2><button class="modal-close" data-close aria-label="Schließen">' + icon("x") + '</button></div>' +
      '<div class="pick-list">' + ids.map((id) => {
        const q = IX.quests[id], done = app.state.quests[id];
        return '<button class="pick" data-open-quest="' + id + '"><span class="status ' + (done ? "on" : "") + '">' + (done ? icon("check") : "") + "</span>" +
          '<span><strong>' + esc(q.title) + '</strong><span class="muted small"> · ' + esc(IX.regions[q.region].name) + "</span></span></button>";
      }).join("") + "</div>" +
      '<div class="modal-actions"><button class="btn btn-ghost" id="group-zoom">' + icon("zoom-in") + ' Hineinzoomen</button></div>',
    (el) => {
      $$("[data-open-quest]", el).forEach((b) => b.addEventListener("click", () => openQuest(b.dataset.openQuest)));
      $("#group-zoom", el).addEventListener("click", () => {
        closeAll();
        const xs = g.items.map((o) => o.p.xy[0]), ys = g.items.map((o) => o.p.xy[1]);
        const c = mapScreen([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]);
        if (mapUI.pz) mapUI.pz.zoomTo(mapUI.st.s * 3, c[0], c[1]);
      });
    });
  }
  // ---- Zoomen und Verschieben wie in einer Karten-App (Inselkarte und Buchten-Karte)
  // Zwei Finger: Zoom um den Punkt zwischen den Fingern (1×–8×). Ein Finger: ungezoomt scrollt die Seite normal, gezoomt
  // wird die Karte verschoben. Doppeltippen zoomt hinein (bei 8× zurück). Bewegt wird nur per CSS-Transform des Inhalts
  // (kein Neuzeichnen, flüssig auch auf älteren Handys); die Karte füllt immer den Rahmen (lässt sich nicht hinausschieben).
  // Ein Verschieben gilt nie als Antippen. st = { s, tx, ty } (bleibt beim Neuzeichnen erhalten).
  const ZOOM_MAX = 8;
  function panZoom(wrap, stage, st, o) {
    const clamp = () => {
      const W = wrap.clientWidth, H = wrap.clientHeight;
      st.s = Math.min(ZOOM_MAX, Math.max(1, st.s));
      st.tx = Math.min(0, Math.max(W - W * st.s, st.tx));
      st.ty = Math.min(0, Math.max(H - H * st.s, st.ty));
    };
    const apply = (live) => {
      clamp();
      stage.style.transform = "translate3d(" + st.tx + "px," + st.ty + "px,0) scale(" + st.s + ")";
      const z = st.s > 1.001;
      wrap.classList.toggle("zoomed", z);
      wrap.style.touchAction = z ? "none" : "pan-y"; // ungezoomt: ein Finger scrollt die Seite
      if (o.onChange) o.onChange(live);
    };
    let anim = 0;
    const animate = (to) => {
      cancelAnimationFrame(anim);
      const from = { s: st.s, tx: st.tx, ty: st.ty }, t0 = performance.now();
      if (o.onActive) o.onActive(true);
      const step = (now) => {
        const p = Math.min(1, (now - t0) / 240), e = 1 - Math.pow(1 - p, 3);
        st.s = from.s + (to.s - from.s) * e; st.tx = from.tx + (to.tx - from.tx) * e; st.ty = from.ty + (to.ty - from.ty) * e;
        apply(p < 1);
        if (p < 1) { anim = requestAnimationFrame(step); return; }
        if (o.onActive) o.onActive(false);
        if (o.onEnd) o.onEnd();
      };
      anim = requestAnimationFrame(step);
    };
    // Auf Faktor ns zoomen, Punkt (px, py) in der Kartenfläche bleibt an seiner Stelle
    const zoomTo = (ns, px, py) => {
      const keep = { s: st.s, tx: st.tx, ty: st.ty };
      ns = Math.min(ZOOM_MAX, Math.max(1, ns));
      const f = ns / st.s;
      st.tx = px - (px - st.tx) * f; st.ty = py - (py - st.ty) * f; st.s = ns;
      clamp();
      const to = { s: st.s, tx: st.tx, ty: st.ty };
      Object.assign(st, keep);
      animate(to);
    };
    const rel = (t) => { const r = wrap.getBoundingClientRect(); return [t.clientX - r.left, t.clientY - r.top]; };
    let g = null, last = null;
    const startPinch = (e) => {
      const a = rel(e.touches[0]), b = rel(e.touches[1]);
      g = { mode: "pinch", d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s0: st.s, tx0: st.tx, ty0: st.ty };
    };
    const startOne = (t, mode) => { const p = rel(t); g = { mode, x0: p[0], y0: p[1], cx: t.clientX, cy: t.clientY, tx0: st.tx, ty0: st.ty, t0: Date.now() }; };
    const finish = () => {
      const moved = g && (g.mode === "pinch" || g.mode === "pan");
      g = null;
      if (!moved) return;
      apply(false);
      if (o.onActive) o.onActive(false);
      if (o.onEnd) o.onEnd();
    };
    wrap.addEventListener("touchstart", (e) => {
      cancelAnimationFrame(anim);
      if (e.touches.length >= 2) { e.preventDefault(); startPinch(e); if (o.onActive) o.onActive(true); } // Seite zoomt nicht mit
      else if (e.touches.length === 1) startOne(e.touches[0], "tap");
    }, { passive: false });
    wrap.addEventListener("touchmove", (e) => {
      if (!g) return;
      if (g.mode === "pinch") {
        if (e.touches.length < 2) return;
        e.preventDefault();
        const a = rel(e.touches[0]), b = rel(e.touches[1]);
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const ns = Math.min(ZOOM_MAX, Math.max(1, g.s0 * d / g.d0)), f = ns / g.s0;
        st.s = ns; st.tx = m[0] - (g.m0[0] - g.tx0) * f; st.ty = m[1] - (g.m0[1] - g.ty0) * f;
        apply(true);
        return;
      }
      const p = rel(e.touches[0]), dx = p[0] - g.x0, dy = p[1] - g.y0;
      if (g.mode === "tap" && Math.hypot(dx, dy) > 8) {
        g.mode = st.s > 1.001 ? "pan" : "scroll"; // ungezoomt: die Seite scrollt (Browser), sonst Karte verschieben
        if (g.mode === "pan" && o.onActive) o.onActive(true);
      }
      if (g.mode === "pan") { e.preventDefault(); st.tx = g.tx0 + dx; st.ty = g.ty0 + dy; apply(true); }
    }, { passive: false });
    wrap.addEventListener("touchend", (e) => {
      if (!g) return;
      if (g.mode === "pinch") {
        if (e.touches.length === 1) { startOne(e.touches[0], "pan"); return; } // ein Finger bleibt liegen: weiter verschieben
        if (!e.touches.length) finish();
        return;
      }
      if (e.touches.length) return;
      if (g.mode === "tap" && Date.now() - g.t0 < 600) {
        e.preventDefault(); // kein zusätzlicher Klick, kein Zoom der ganzen Seite
        const now = Date.now(), x = g.cx, y = g.cy, px = g.x0, py = g.y0;
        if (last && now - last.t < 320 && Math.hypot(x - last.x, y - last.y) < 30) {
          last = null;
          if (o.onDoubleTap) o.onDoubleTap();
          zoomTo(st.s >= ZOOM_MAX - 0.01 ? 1 : st.s * 2, px, py);
        } else {
          last = { t: now, x, y };
          if (o.onTap) o.onTap(x, y);
        }
      }
      finish();
    }, { passive: false });
    wrap.addEventListener("touchcancel", finish);
    // iPhone (Safari): eigene Seiten-Zoom-Gesten auf der Karte unterdrücken
    ["gesturestart", "gesturechange"].forEach((n) => wrap.addEventListener(n, (e) => e.preventDefault()));
    // Maus (Computer): Rad zoomt, Ziehen verschiebt, Klick tippt
    wrap.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = rel(e);
      const f = e.deltaY < 0 ? 1.25 : 0.8, ns = Math.min(ZOOM_MAX, Math.max(1, st.s * f)), k = ns / st.s;
      st.tx = p[0] - (p[0] - st.tx) * k; st.ty = p[1] - (p[1] - st.ty) * k; st.s = ns;
      apply(false);
      if (o.onEnd) o.onEnd();
    }, { passive: false });
    let m = null;
    wrap.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      m = { x: e.clientX, y: e.clientY, tx0: st.tx, ty0: st.ty, moved: false };
    });
    wrap.addEventListener("pointermove", (e) => {
      if (!m || e.pointerType !== "mouse") return;
      const dx = e.clientX - m.x, dy = e.clientY - m.y;
      if (!m.moved && Math.hypot(dx, dy) > 4 && st.s > 1.001) { m.moved = true; if (o.onActive) o.onActive(true); }
      if (m.moved) { if (!wrap.hasPointerCapture(e.pointerId)) wrap.setPointerCapture(e.pointerId); st.tx = m.tx0 + dx; st.ty = m.ty0 + dy; apply(true); }
    });
    wrap.addEventListener("pointerup", (e) => {
      if (!m || e.pointerType !== "mouse") return;
      const mm = m; m = null;
      if (mm.moved) { apply(false); if (o.onActive) o.onActive(false); if (o.onEnd) o.onEnd(); mapUI.ghostUntil = Date.now() + 300; }
      else if (o.mouseTap && o.onTap) o.onTap(e.clientX, e.clientY, true);
    });
    return { apply, zoomTo, reset: () => animate({ s: 1, tx: 0, ty: 0 }) };
  }

  document.addEventListener("click", (ev) => {
    if (mapUI.ghostUntil && Date.now() < mapUI.ghostUntil) { ev.stopPropagation(); ev.preventDefault(); mapUI.ghostUntil = 0; }
  }, true);
  window.addEventListener("resize", () => { if (mapUI.pz && $("#map-wrap")) { mapUI.pz.apply(false); layoutPins(); } });

  // ---- Quests anzeigen
  function taskHTML(q) {
    const PRE = "Eure Aufgabe:";
    const body = q.task.indexOf(PRE) === 0 ? q.task.slice(PRE.length).replace(/^\s+/, "") : q.task;
    let html = esc(body);
    if (q.link) html = html.replace(esc(q.link.text), '<a href="' + esc(q.link.href) + '" target="_blank" rel="noopener noreferrer">' + esc(q.link.text) + "</a>");
    return '<p class="task"><strong>' + PRE + "</strong> " + html + "</p>";
  }
  // Google-Maps-Link: über den Namen des Eintrags oder, falls keiner, über die Pin-Koordinaten
  function mapsUrl(q) {
    if (q.mapsUrl) return q.mapsUrl; // fester Link hat Vorrang
    const query = q.maps || (q.pin[0] + "," + q.pin[1]);
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
  }
  // Bild zur Quest (public/images/quests/<ID>.jpg). Das <img> wird erst eingefügt, wenn das
  // Quest-Fenster geöffnet wird – beim Seitenstart wird also kein Bild geladen. Fehlt es,
  // verschwindet es still. Bekannte fehlende Bilder werden nicht erneut angefragt.
  const missingImages = new Set();
  // lazy (Übersicht „Alle Quests“): erst laden, wenn das Bild in die Nähe kommt; bis dahin Platzhalter in 16:9
  function questImageHTML(q, lazy) {
    if (missingImages.has(q.id)) return "";
    return '<img class="quest-img' + (lazy ? " quest-img-lazy" : "") + '" data-qimg="' + q.id + '" alt="' + esc(q.title) + '" decoding="async"' + (lazy ? ' loading="lazy"' : " hidden") + ">";
  }
  function bindQuestImages(el) {
    $$("img[data-qimg]", el).forEach((img) => {
      const id = img.dataset.qimg;
      img.onload = () => { img.hidden = false; img.classList.remove("quest-img-lazy"); if (img.decode) img.decode().catch(() => {}); }; // vorab dekodieren (flüssiges Wischen)
      img.onerror = () => { missingImages.add(id); img.remove(); };
      img.src = "images/quests/" + id + ".jpg";
    });
  }
  function regionQuestHTML(q, interactive, withImage) {
    const done = app.state.quests[q.id];
    return (interactive ? questImageHTML(q) : withImage ? questImageHTML(q, true) : "") + '<div class="quest">' +
      (interactive ? '<button class="check ' + (done ? "on" : "") + '" data-quest="' + q.id + '" aria-label="' + (done ? "Erledigt – rückgängig machen" : "Als erledigt abhaken") + '">' + (done ? icon("check") : "") + "</button>"
        : '<span class="status ' + (done ? "on" : "") + '" aria-label="' + (done ? "erledigt" : "offen") + '">' + (done ? icon("check") : "") + "</span>") +
      '<div class="quest-body"><h4>' + esc(q.title) + "</h4>" +
      '<a class="loc" href="' + esc(mapsUrl(q)) + '" target="_blank" rel="noopener noreferrer" title="In Google Maps öffnen">' + icon("map-pin") + ' ' + esc(q.location) + ' <span class="loc-ext" aria-hidden="true">' + icon("external-link") + '</span></a>' +
      '<p class="desc">' + esc(q.desc) + "</p>" + taskHTML(q) + (interactive ? toolHTML(q.id) : "") +
      (done ? '<div class="by">' + icon("check") + ' erledigt von ' + esc(done.by) + " · " + when(done.t) + "</div>" + (interactive ? memLine(q.id) : "") : "") + "</div></div>";
  }
  function levelPill(lvl) {
    return '<span class="pill" style="background:' + L.LEVELS[lvl].color + ";color:" + (lvl <= 1 ? "#1d2a30" : "#fff") + '">' + L.LEVELS[lvl].name + "</span>";
  }
  function bindQuestChecks(el) {
    bindQuestImages(el);
    $$("[data-quest]", el).forEach((b) => b.addEventListener("click", () => toggleQuest(b.dataset.quest, b)));
    $$("[data-mem]", el).forEach((b) => b.addEventListener("click", () => openMemory(b.dataset.mem)));
    bindTools(el);
  }

  // ------------------------------------------------------------------ Hilfsmittel (Tools)
  // Optionale Hilfen für einzelne regionale Quests (Liste + Regeln in tools.js). Im Quest-Fenster
  // steht je Hilfsmittel eine antippbare Zeile (Icon + Bezeichnung, wie ein Link); Tippen öffnet es
  // in einem eigenen Fenster. Der Zustand liegt in state.tools und wird über den Server geteilt.
  // Änderungen laufen über eine Warteschlange, damit schnelles Antippen (z. B. „+1 Auto“) nichts
  // verliert. Hilfsmittel haken nie ab und geben keine Punkte.
  const toolUI = { queue: [], flushing: false, signaled: new Set(), ttt: { sel: [] }, peek: {}, order: {}, pick: {}, uploading: {}, photoFailed: {}, sel: {}, handoff: {}, picking: null, photoReplace: null, cam: null, camFallback: null, dragging: false, refreshPending: false, alt: {} };
  const compass = { on: false, failed: "", samples: [], last: 0 };
  const tcfg = (qid) => T.config(qid, C);
  function serverNow() { return Date.now() + app.clockOffset; }
  const secs = (ms) => Math.max(0, Math.ceil(ms / 1000));
  const mmss = (ms) => { const s = secs(ms); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const upfmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

  // Stand eines Hilfsmittels inklusive noch nicht gesendeter Eingaben
  function toolState(qid) {
    const cfg = tcfg(qid);
    let ts = T.sanitize(cfg, (app.state.tools && app.state.tools[qid]) || null);
    toolUI.queue.forEach((x) => {
      if (x.qid !== qid) return;
      try { ts = T.update(cfg, ts, x.op, x.now, x.by); } catch (e) { /* von einem anderen Handy überholt */ }
    });
    return ts || {};
  }

  // Zeile im Quest-Fenster: Link (neuer Tab) oder Knopf, der das Hilfsmittel öffnet
  function toolHTML(qid) {
    const cfg = tcfg(qid);
    return (cfg ? '<button class="tool-line" data-open-tool="' + qid + '">' + toolLineInner(qid) + "</button>" : "") +
      T.links(qid).map((l) => '<a class="tool-line" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + icon(l.icon) +
        '<span class="tl-label">' + esc(l.label) + "</span>" + icon("external-link", "tl-end") + "</a>").join("");
  }
  function toolLineInner(qid) {
    const cfg = tcfg(qid), st = toolStatus(qid);
    return icon(cfg.icon) + '<span class="tl-label">' + esc(cfg.label) + "</span>" +
      (st ? '<span class="tl-status ' + st.cls + '"' + (st.until ? ' data-until="' + st.until + '"' : "") + ">" + st.html + "</span>" : "") + icon("chevron-right", "tl-end");
  }
  // Kurzer Zustand rechts in der Zeile: Strafzeit, läuft, geschafft
  function toolStatus(qid) {
    const cfg = tcfg(qid), ts = toolState(qid), now = serverNow();
    if (cfg.local) return null;
    if (cfg.kind === "counter" || cfg.kind === "timer" || cfg.kind === "regions") return smallStatus(cfg, ts, now);
    if (T.penaltyLeft(ts, now)) return { cls: "lock", until: ts.penaltyUntil, html: icon("lock") + ' <span data-tick="down" data-end="' + ts.penaltyUntil + '">' + mmss(ts.penaltyUntil - now) + "</span>" };
    if ((cfg.kind === "countdown" || cfg.kind === "traffic") && ts.startedAt != null && now < ts.startedAt + cfg.seconds * 1000) {
      const end = ts.startedAt + cfg.seconds * 1000;
      return { cls: "run", until: end, html: '<span data-tick="down" data-fmt="s" data-end="' + end + '">' + secs(end - now) + "</span> s" };
    }
    if (cfg.kind === "cablecar" && ts.startedAt != null && ts.stoppedAt == null) return { cls: "run", html: '<span data-tick="up" data-start="' + ts.startedAt + '">' + upfmt(now - ts.startedAt) + "</span>" };
    const res = T.result(cfg, ts, now);
    if (res && res.ok) return { cls: "ok", html: icon("check") + " Geschafft" };
    if (res && cfg.kind === "photoGrid") return { cls: "run", html: "gefunden" };
    if ((cfg.kind === "tictactoe" && ts.players) || (T.isSecret(cfg) && ts.secret && !res)) return { cls: "run", html: "läuft" };
    return null;
  }

  // Zeile der kleinen Hilfsmittel (Stapel-Quests): Zähler „3/10“, Timer läuft „4:12“, fertig = grün
  function smallStatus(cfg, ts, now) {
    const parts = [];
    let cls = "run", until = null;
    if (cfg.kind === "counter" || cfg.kind === "regions") {
      const n = cfg.kind === "counter" ? (ts.count || 0) : (ts.regions || []).length;
      if (n >= cfg.target) cls = "ok";
      if (n || cls === "ok") parts.push((cls === "ok" ? icon("check") + " " : "") + n + "/" + cfg.target);
    }
    if (T.hasTimer(cfg)) {
      const left = T.timerLeft(cfg, ts, now);
      if (T.timerRunning(cfg, ts, now)) { until = T.timerEnd(cfg, ts); parts.push(icon("timer") + ' <span data-tick="down" data-end="' + until + '">' + mmss(left) + "</span>"); }
      else if (left <= 0) { parts.push(icon("check") + " Zeit um"); if (cfg.kind === "timer") cls = "ok"; }
      else if (ts.acc) parts.push("Pause " + mmss(left));
    }
    return parts.length ? { cls, until, html: parts.join(" · ") } : null;
  }

  // ---- Kleine Hilfsmittel der Stapel-Quests: Zähler, Timer, Regionen-Liste (synchron über alle Handys)
  const goalNote = () => '<div class="cnt-ok">' + icon("circle-check") + " Ziel erreicht – abhaken macht ihr selbst.</div>";
  function counterBody(qid, cfg, ts, now) {
    const n = ts.count || 0, pct = Math.min(100, Math.round(n / cfg.target * 100));
    return '<div class="cnt' + (n >= cfg.target ? " done" : "") + '"><div class="cnt-prog"><span class="cnt-num">' + n + "</span> von " + cfg.target + " " + esc(cfg.unit) + "</div>" +
      '<div class="cnt-bar"><i style="width:' + pct + '%"></i></div>' + (n >= cfg.target ? goalNote() : "") +
      '<div class="cnt-row"><button class="btn btn-ghost cnt-minus" data-tool-act="dec" data-hold="cnt-:' + qid + '" aria-label="Minus 1"' + (n ? "" : " disabled") + ">−1</button>" +
      '<button class="btn btn-primary cnt-plus" data-tool-act="inc" data-hold="cnt+:' + qid + '" aria-label="Plus 1">+1</button></div></div>' +
      (T.hasTimer(cfg) ? '<div class="cnt-timer"><div class="tool-label">' + icon("timer") + " Timer: " + (cfg.minutes === 60 ? "1 Stunde" : cfg.minutes + " Minuten") + "</div>" + timerBody(qid, cfg, ts, now, false) + "</div>" : "");
  }
  function timerBody(qid, cfg, ts, now, big) {
    const left = T.timerLeft(cfg, ts, now), run = T.timerRunning(cfg, ts, now), end = T.timerEnd(cfg, ts);
    if (left <= 0) {
      const flash = end && toolUI.signaled.has(qid + ":" + end) && now - end < 4000 ? " tool-flash" : "";
      return '<div class="tool-result ok tool-done' + flash + '">' + icon("circle-check") + "<div><strong>Zeit um – " + (cfg.minutes === 60 ? "1 Stunde" : cfg.minutes + " Minuten") + " vorbei!</strong>" +
        '<div class="small">Geschafft? Dann abhaken. Sonst zurücksetzen und neu starten.</div></div></div>' + tBtn("tReset", icon("rotate-ccw") + " Zurücksetzen", "btn-ghost btn-block");
    }
    const sub = run ? "läuft" + (ts.startedBy ? " · gestartet von " + esc(ts.startedBy) : "") : ts.acc ? "pausiert" : "noch nicht gestartet";
    return '<div class="tool-clock"' + (run ? ' data-until="' + end + '"' : "") + '><div class="' + (big ? "tool-huge" : "tool-big") + ' timer-num"' + (run ? ' data-tick="down" data-end="' + end + '"' : "") + ">" + mmss(left) + "</div>" +
      '<div class="muted small">' + sub + "</div></div>" +
      '<div class="grid2">' + (run ? tBtn("tPause", icon("pause") + " Pause", "btn-ghost") : tBtn("tStart", icon("play") + (ts.acc ? " Weiter" : " Start"), "btn-primary")) +
      tBtn("tReset", icon("rotate-ccw") + " Zurücksetzen", "btn-ghost", run || ts.acc ? "" : " disabled") + "</div>";
  }
  function regionsBody(cfg, ts) {
    const on = ts.regions || [], n = on.length;
    return '<div class="cnt' + (n >= cfg.target ? " done" : "") + '"><div class="cnt-prog"><span class="cnt-num">' + n + "</span> von " + cfg.target + " Regionen</div>" +
      '<div class="cnt-bar"><i style="width:' + Math.min(100, n / cfg.target * 100) + '%"></i></div>' + (n >= cfg.target ? goalNote() : "") + "</div>" +
      '<p class="tool-label">Antippen, wo ihr heute wart:</p><div class="region-chips">' +
      C.regions.map((r) => '<button class="chip' + (on.indexOf(r.id) >= 0 ? " on" : "") + '" data-tool-act="toggle" data-reg="' + r.id + '" aria-pressed="' + (on.indexOf(r.id) >= 0) + '">' +
        (on.indexOf(r.id) >= 0 ? icon("check") + " " : "") + esc(r.name) + "</button>").join("") + "</div>";
  }

  function openTool(qid) {
    const cfg = tcfg(qid);
    const m = openModal(() => '<div class="modal-head"><h2 class="tool-title">' + icon(cfg.icon) + " " + esc(cfg.label) + "</h2>" +
      '<button class="modal-close" data-close aria-label="Schließen">' + icon("x") + "</button></div>" +
      '<p class="muted small tool-sub-title">' + esc((IX.quests[qid] || IX.stack[qid]).title) + " · freiwillig – abhaken macht ihr selbst</p>" +
      '<div class="tool" data-tool="' + qid + '"><div class="tool-body">' + toolBody(qid) + "</div></div>", bindTools, { stack: true, where: "Hilfsmittel: " + cfg.label + " (" + (IX.quests[qid] || IX.stack[qid]).title + ")" });
    // Während eine Liste gezogen wird, nicht neu zeichnen (sonst reißt das Ziehen ab)
    const refresh = m.refresh;
    m.refresh = () => { if (toolUI.dragging || typingIn(m.el) || photoBusy(qid)) toolUI.refreshPending = true; else refresh(); };
    // Verlässt der Cursor die Eingabefelder: gemerkte Buchstaben speichern und aufgeschobenes Neuzeichnen nachholen –
    // mit kurzer Verzögerung, damit ein gerade angetippter Knopf nicht unter dem Finger ersetzt wird
    m.el.addEventListener("focusout", () => setTimeout(() => {
      if (typingIn(m.el) || toolUI.dragging || photoBusy(qid) || app.modals.indexOf(m) < 0) return;
      flushLetters(qid);
      if (toolUI.refreshPending) { toolUI.refreshPending = false; refresh(); }
    }, 350));
    m.el.addEventListener("click", (ev) => { if (ev.target === m.el && app.modals[app.modals.length - 1] === m) closeModal(); });
    // Offenes Hilfsmittel merken: Wirft das Handy den Browser beim Öffnen der Kamera aus dem Speicher, öffnet es
    // sich nach dem Neuladen wieder (die Fotos liegen ohnehin schon auf dem Server)
    store.set("openTool", JSON.stringify({ qid, t: Date.now() }));
    m.onClose = () => { store.set("openTool", null); if (toolUI.cam && toolUI.cam.qid === qid) stopCamera(); }; // Kamera sofort freigeben
  }
  function restoreOpenTool() {
    let saved = null;
    try { saved = JSON.parse(store.get("openTool") || "null"); } catch (e) { /* egal */ }
    store.set("openTool", null);
    if (!saved || !tcfg(saved.qid) || Date.now() - saved.t > 60 * 60000) return;
    if (IX.stack[saved.qid]) { if (app.state.open.indexOf(saved.qid) >= 0) openTool(saved.qid); return; } // Stapel-Quest: nur solange offen
    if (!IX.quests[saved.qid]) return;
    openQuest(saved.qid);
    openTool(saved.qid);
  }

  const tBtn = (op, label, cls, extra) => '<button class="btn ' + cls + '" data-tool-act="' + op + '"' + (extra || "") + ">" + label + "</button>";
  const tInput = (qid, key, ph, mode) => '<input class="tool-input" type="text" inputmode="' + (mode || "numeric") + '" autocomplete="off" data-keep="' + qid + ":" + key + '" placeholder="' + esc(ph) + '">';
  const byTxt = (n) => (n ? ' <span class="muted small">von ' + esc(n) + "</span>" : "");
  function tResult(ok, text, title) {
    return '<div class="tool-result ' + (ok ? "ok" : "miss") + '">' + icon(ok ? "circle-check" : "circle-x") + "<div><strong>" + (title || (ok ? "Geschafft!" : "Daneben")) + "</strong>" +
      '<div class="small">' + text + "</div>" + (ok && !title ? '<div class="small tool-hint">Abhaken macht ihr selbst – im Quest-Fenster auf den Kreis tippen.</div>' : "") + "</div></div>";
  }
  function tFixed(label, value, by) {
    return '<div class="tool-fixed">' + icon("lock") + " " + label + ": <strong>" + value + "</strong>" + byTxt(by) + "</div>";
  }
  const nf = (n) => String(n).replace(".", ",");
  // Was beim letzten Fehlversuch passiert ist (die echte Höhe wird dabei nie verraten)
  function missText(cfg, miss) {
    if (cfg.kind === "choice") return "Nicht beide richtig: " + critMarks(miss);
    if (cfg.kind === "height") return "Eure Schätzung " + nf(miss.guess) + " m lag mehr als " + cfg.tolerancePct + " % daneben.";
    if (cfg.kind === "compass") return "Beide Messungen lagen mehr als " + cfg.tolerance + "° daneben: " + miss.measures.map((m) => m.deg + "°").join(" und ") + " (Rio: " + cfg.target + "°).";
    return "Der Versuch war daneben.";
  }

  function toolBody(qid) {
    if (isMem(qid)) return memoryBody(qid); // Erinnerungsfoto (nutzt die Foto-Grundlage der Hilfsmittel)
    const cfg = tcfg(qid), ts = toolState(qid), now = serverNow();
    const left = T.penaltyLeft(ts, now);
    if (left) {
      return (ts.lastMiss ? tResult(false, missText(cfg, ts.lastMiss)) : "") +
        '<div class="tool-lock" data-until="' + ts.penaltyUntil + '">' + icon("lock") + "<div><strong>Strafzeit – neuer Versuch in</strong>" +
        '<div class="tool-big" data-tick="down" data-end="' + ts.penaltyUntil + '">' + mmss(left) + "</div>" +
        '<div class="small">Nur dieses Hilfsmittel wartet – alles andere könnt ihr weiter nutzen. Danach ist es automatisch wieder frei.</div></div></div>';
    }
    if (toolUI.handoff[qid]) {
      if (T.isSecret(cfg) && T.phase(cfg, ts) === 2) return handoffScreen();
      delete toolUI.handoff[qid]; // inzwischen weiter (z. B. anderes Handy) – nicht mehr nötig
    }
    const res = T.result(cfg, ts, now);
    switch (cfg.kind) {
      case "counter": return counterBody(qid, cfg, ts, now);
      case "timer": return timerBody(qid, cfg, ts, now, true);
      case "regions": return regionsBody(cfg, ts);
      case "altitude": return altitudeBody(qid, cfg);
      case "countdown": {
        const end = ts.startedAt != null ? ts.startedAt + cfg.seconds * 1000 : 0;
        if (end && now < end) {
          return '<div class="tool-clock" data-until="' + end + '"><div class="tool-huge" data-tick="down" data-fmt="s" data-end="' + end + '">' + secs(end - now) + "</div>" +
            '<div class="muted small">Sekunden' + (ts.by ? " · gestartet von " + esc(ts.by) : "") + "</div></div>" +
            '<div class="grid2">' + tBtn("cancel", icon("x") + " Abbrechen", "btn-ghost") + tBtn("restart", icon("rotate-ccw") + " Neustart", "btn-ghost") + "</div>";
        }
        if (end) {
          const flash = toolUI.signaled.has(qid + ":" + ts.startedAt) && now - end < 4000 ? " tool-flash" : "";
          return '<div class="tool-result ok tool-done' + flash + '">' + icon("circle-check") + "<div><strong>Zeit um – " + cfg.seconds + " Sekunden vorbei!</strong>" +
            '<div class="small">Hat alles gehalten? Dann oben abhaken. Sonst: Neustart.</div></div></div>' +
            tBtn("restart", icon("rotate-ccw") + " Neustart", "btn-ghost btn-block");
        }
        return '<div class="tool-clock"><div class="tool-huge">' + cfg.seconds + '</div><div class="muted small">Sekunden</div></div>' +
          tBtn("start", icon("play") + " Start", "btn-primary btn-block");
      }

      case "cablecar": {
        if (ts.guess == null) {
          return '<label class="tool-label">Eure Schätzung: Wie viele Sekunden braucht die Seilbahn?</label>' +
            '<div class="tool-row">' + tInput(qid, "guess", "z. B. 90") + '<span class="tool-unit">s</span>' + tBtn("fix", icon("lock") + " Bestätigen", "btn-primary") + "</div>" +
            '<p class="muted small">Bestätigt ist bestätigt – bis zur Auflösung nicht mehr änderbar.</p>';
        }
        let h = tFixed("Schätzung", ts.guess + " Sekunden", ts.guessBy);
        if (ts.startedAt == null) return h + tBtn("start", icon("play") + " Stoppuhr starten", "btn-primary btn-block tool-tap");
        if (ts.stoppedAt == null) {
          return h + '<div class="tool-clock"><div class="tool-huge" data-tick="up" data-start="' + ts.startedAt + '">' + upfmt(now - ts.startedAt) + "</div>" +
            '<div class="muted small">Stoppuhr läuft – bis zum vollständigen Stillstand</div></div>' + tBtn("stop", icon("square") + " Stopp", "btn-danger btn-block tool-tap");
        }
        return h + tResult(res.ok, "Gestoppt: <strong>" + res.measured + " s</strong> · Schätzung " + ts.guess + " s · " + res.diff + " s daneben (erlaubt: höchstens " + cfg.tolerance + " s)") +
          tBtn("newRound", icon("rotate-ccw") + (res.ok ? " Zurücksetzen" : " Neue Runde (zweite Chance)"), (res.ok ? "btn-ghost" : "btn-primary") + " btn-block");
      }

      case "traffic": {
        if (ts.guess == null) {
          return '<label class="tool-label">Eure gemeinsame Schätzung: Wie viele Autos fahren in einer Minute über die Brücke?</label>' +
            '<div class="tool-row">' + tInput(qid, "guess", "z. B. 8") + '<span class="tool-unit">Autos</span>' + tBtn("fix", icon("lock") + " Bestätigen", "btn-primary") + "</div>";
        }
        let h = tFixed("Schätzung", ts.guess + (ts.guess === 1 ? " Auto" : " Autos"), ts.guessBy);
        if (ts.startedAt == null) return h + tBtn("start", icon("play") + " 1-Minuten-Countdown starten", "btn-primary btn-block tool-tap");
        const end = ts.startedAt + cfg.seconds * 1000;
        if (now < end) {
          return h + '<div class="tool-count-row" data-until="' + end + '"><div class="tool-clock"><div class="tool-big" data-tick="down" data-fmt="s" data-end="' + end + '">' + secs(end - now) + '</div><div class="muted small">Sekunden</div></div>' +
            '<div class="tool-clock"><div class="tool-big">' + (ts.count || 0) + '</div><div class="muted small">gezählt</div></div></div>' +
            tBtn("inc", icon("plus") + " 1 Auto", "btn-primary btn-block tool-tap tool-plus", ' data-d="1" data-hold="car+:' + qid + '"') +
            tBtn("inc", icon("minus") + " 1 (Korrektur)", "btn-ghost btn-block", ' data-d="-1" data-hold="car-:' + qid + '"');
        }
        return h + tResult(res.ok, "Gezählt: <strong>" + res.count + "</strong> · Schätzung " + ts.guess + " · " + res.diff + " daneben (erlaubt: höchstens " + cfg.tolerance + ")") +
          tBtn("newRound", icon("rotate-ccw") + (res.ok ? " Zurücksetzen" : " Neue Runde – für die nächste Minute neu schätzen"), (res.ok ? "btn-ghost" : "btn-primary") + " btn-block");
      }

      case "height": {
        if (ts.guess == null) {
          return (ts.lastMiss ? '<p class="muted small">Letzter Versuch: ' + nf(ts.lastMiss.guess) + " m – daneben.</p>" : "") +
            '<label class="tool-label">Die beiden Ratenden: eure gemeinsame Schätzung, wie hoch ihr hier oben seid</label>' +
            '<div class="tool-row">' + tInput(qid, "guess", "z. B. 500", "decimal") + '<span class="tool-unit">m</span>' + tBtn("fix", icon("lock") + " Bestätigen", "btn-primary") + "</div>" +
            '<p class="muted small">Die App sagt sofort, ob ihr höchstens ' + cfg.tolerancePct + " % daneben liegt. Wenn nicht, startet automatisch die Strafzeit (" + cfg.penalty + " Minuten).</p>";
        }
        return tFixed("Schätzung", nf(ts.guess) + " m", ts.guessBy) +
          tResult(true, "Echte Höhe: <strong>" + nf(cfg.answer) + " m</strong> – eure Schätzung lag höchstens " + cfg.tolerancePct + " % daneben.") +
          tBtn("newRound", icon("rotate-ccw") + " Zurücksetzen", "btn-ghost btn-block");
      }

      case "compass": {
        const ms = ts.measures || [];
        let h = '<p class="small tool-note">' + icon("navigation") + " Nicht neben dem Auto oder Metall stehen. Bei ungenauer Anzeige das Handy einmal in einer Acht schwenken.</p>";
        h += ms.map((m, i) => {
          const d = Math.round(T.angleDiff(m.deg, cfg.target));
          const ok = T.compassHit(cfg, m.deg);
          return '<div class="tool-measure ' + (ok ? "ok" : "miss") + '">' + icon(ok ? "circle-check" : "circle-x") + " <span>Messung " + (i + 1) + byTxt(m.by) +
            ": <strong>" + m.deg + "°</strong> · " + d + "° daneben" + (m.manual ? " (eingetragen)" : "") + "</span></div>";
        }).join("");
        if (res) {
          return h + tResult(true, "Rio liegt bei " + cfg.target + "° – mindestens eine Messung lag höchstens " + cfg.tolerance + "° daneben.") +
            tBtn("newRound", icon("rotate-ccw") + " Zurücksetzen", "btn-ghost btn-block");
        }
        if (ms.length) h += tResult(false, "Die erste Messung lag mehr als " + cfg.tolerance + "° daneben. Es reicht, wenn eine der beiden trifft – jetzt ist die zweite Person dran. Liegt auch sie daneben, startet automatisch die Strafzeit (" + cfg.penalty + " Minuten).");
        h += '<p class="tool-label">' + (ms.length ? "Person 2" : "Person 1") + ": Handy flach halten, die Oberkante in die vermutete Richtung von Rio – dann tippen.</p>";
        const manual = '<div class="tool-row">' + tInput(qid, "deg", "Grad, z. B. 200") + '<span class="tool-unit">°</span>' + tBtn("measure", "Eintragen", "btn-primary", " data-manual") + "</div>";
        if (compass.failed) {
          h += '<div class="tool-warn">' + (compass.failed === "denied" ? "Der Zugriff auf den Kompass wurde nicht erlaubt." : "Dieses Handy liefert keinen Kompass.") +
            " Nehmt eine Kompass-App (z. B. die vorinstallierte Kompass-App) und tragt den gemessenen Wert hier ein.</div>" + manual;
        } else if (!compass.on) {
          h += '<button class="btn btn-primary btn-block" data-tool-ui="compass-on">' + icon("compass") + " Kompass aktivieren</button>";
        } else if (!compass.last) {
          h += '<p class="muted small">Kompass startet …</p>';
        } else {
          h += '<p class="small tool-ok-line">' + icon("check") + " Kompass bereit</p>" + tBtn("measure", icon("navigation") + " Hier ist Rio!", "btn-primary btn-block tool-tap");
        }
        if (!compass.failed) h += '<details class="tool-sub"><summary class="small">Ohne Handy-Kompass: Wert aus einer Kompass-App eintragen</summary>' + manual + "</details>";
        return h;
      }

      case "secretTerms": return secretTermsBody(qid, cfg, ts, now);
      case "secretRank": return secretRankBody(qid, cfg, ts, now);
      case "photoWord": return photoWordBody(qid, cfg, ts, now);
      case "photoGrid": case "photoNames": case "photoPick": return photoPuzzleBody(qid, cfg, ts, now);
      case "drawBay": return drawBayBody(qid, cfg, ts, now);
      case "choice": return choiceBody(qid, cfg, ts);

      case "tictactoe": {
        if (!ts.players) {
          const sel = toolUI.ttt.sel;
          const chips = teamNames().map((n) => {
            const i = sel.indexOf(n);
            return '<button class="chip' + (i >= 0 ? " on" : "") + '" data-tool-ui="ttt-pick" data-name="' + esc(n) + '">' + (i >= 0 ? (i === 0 ? "X · " : "O · ") : "") + esc(n) + "</button>";
          }).join("");
          return (teamNames().length < 2 ? teamHint(3) : "") + '<p class="tool-label">Wer spielt? Zwei Personen antippen – die erste spielt X, die zweite O. Die dritte Person ist Schiedsrichter.</p>' +
            '<div class="chips">' + chips + "</div>" +
            tBtn("players", icon("play") + " Spiel starten", "btn-primary btn-block", sel.length < 2 ? " disabled" : "");
        }
        const st = T.tttStatus(ts.moves);
        const name = (m) => esc(ts.players[m === "X" ? 0 : 1]);
        let h = '<div class="ttt-head"><span><strong>X</strong> ' + esc(ts.players[0]) + " · <strong>O</strong> " + esc(ts.players[1]) + '</span><span class="muted small">Runde ' + (ts.round || 1) + "</span></div>";
        if (st.winner) h += tResult(true, "Gespielt wird, bis eine Person gewinnt – geschafft!", "Sieg für " + name(st.winner) + " (" + st.winner + ")!");
        else if (st.draw) h += tResult(false, "Laut Aufgabe wird gespielt, bis eine Person gewinnt.", "Unentschieden");
        else h += '<p class="ttt-turn">Am Zug: <strong>' + name(st.turn) + "</strong> (" + st.turn + ")</p>";
        h += '<div class="ttt-grid">' + st.board.map((v, i) => '<button class="ttt-cell' + (st.line && st.line.indexOf(i) >= 0 ? " win" : "") + (v ? " " + v.toLowerCase() : "") +
          '" data-tool-act="move" data-cell="' + i + '" aria-label="Feld ' + (i + 1) + (v ? ": " + v : "") + '"' + (v || st.winner || st.draw ? " disabled" : "") + ">" + (v || "") + "</button>").join("") + "</div>";
        h += '<div class="grid2">' + tBtn("undoMove", icon("undo-2") + " Zug zurück", "btn-ghost", (ts.moves || []).length ? "" : " disabled") +
          (st.winner || st.draw ? tBtn("newRound", icon("rotate-ccw") + " Neue Runde", "btn-primary") : tBtn("newGame", "Andere Spielende", "btn-ghost")) + "</div>";
        if (st.winner || st.draw) h += tBtn("newGame", "Andere Spielende", "btn-ghost btn-block btn-small");
        return h;
      }
    }
    return "";
  }

  // ---- Geheime Eingaben (Was Churchill sah, Früchteschweiger, Baumstaben)
  // Rollen hängen nie an einem Handy: Handys werden herumgereicht, jeder Schritt geht auf jedem Handy. Der Ablauf
  // folgt nur der gemeinsamen Phase (T.phase): 1 Geheim eingeben → 2 Raten → 3 Ergebnis. Nach dem Bestätigen ist
  // das Geheimnis überall verdeckt; „Anzeigen“ (lange drücken, 5 s, nur auf diesem Handy) ist für die Person gedacht,
  // die eingegeben hat – wir vertrauen uns. „Auflösen“ deckt alles für alle auf.
  const peeking = (qid) => (toolUI.peek[qid] || 0) > serverNow();
  const PHASES = ["Geheim eingeben", "Raten", "Ergebnis"];
  function phaseBar(ph) {
    return '<ol class="phase-bar" aria-label="Phase ' + ph + " von 3: " + PHASES[ph - 1] + '">' + PHASES.map((p, i) =>
      '<li class="' + (i + 1 === ph ? "now" : i + 1 < ph ? "done" : "") + '"' + (i + 1 === ph ? ' aria-current="step"' : "") + '><span class="ph-no">' + (i + 1) + "</span>" + p + "</li>").join("") + "</ol>";
  }
  function peekBtn(qid) {
    return peeking(qid)
      ? '<button class="btn btn-ghost btn-block" data-tool-ui="peek-off" data-until="' + toolUI.peek[qid] + '">' + icon("eye-off") + " Verbergen</button>"
      : '<button class="btn btn-ghost btn-block peek-hold" data-peek-hold>' + icon("eye") + " Anzeigen (lange drücken)</button>" +
        '<p class="muted small peek-hint">Nur für die Person, die eingegeben hat.</p>';
  }
  const revealBtn = (ts) => (ts.revealed ? "" : tBtn("reveal", icon("eye") + " Auflösen (für alle)", "btn-ghost btn-block"));
  const newRoundBtn = (miss, text) => tBtn("newRound", icon("rotate-ccw") + " " + (text || "Neue Runde"), (miss ? "btn-primary" : "btn-ghost") + " btn-block");
  const hiddenDots = '<span class="tool-hidden" aria-label="verdeckt">' + icon("lock") + " verdeckt</span>";
  const lookAway = '<p class="tool-wait">' + icon("eye-off") + " Wer eingibt, tippt hier – die anderen schauen weg. Das geht auf jedem Handy.</p>";

  // Sortierbare Liste: Ziehen am Griff (ohne Pfeiltasten – der Platz gehört den Namen). Ohne sync bleibt die Reihenfolge bis zum
  // Bestätigen nur auf diesem Handy (toolUI.order[key]); mit sync wird sie geteilt (Aktion „arrange“).
  function sortList(key, items, sync) {
    let order = sync ? items.slice() : toolUI.order[key];
    if (!order || order.length !== items.length || items.some((x) => order.indexOf(x) < 0)) order = toolUI.order[key] = items.slice();
    return '<ol class="sort-list" data-sort="' + esc(key) + '"' + (sync ? " data-sync" : "") + ">" + order.map((v, i) =>
      '<li class="sort-item" data-val="' + esc(v) + '"><span class="sort-grip" data-grip aria-hidden="true">' + icon("grip-vertical") + "</span>" +
      '<span class="sort-place">' + (i + 1) + '.</span><span class="sort-name">' + esc(v) + "</span></li>").join("") +
      "</ol>";
  }
  // Ziehen: die gezogene Box hebt sich ab und folgt dem Finger, die anderen rutschen animiert zur Seite
  function bindSort(list) {
    list.addEventListener("pointerdown", (ev) => {
      const grip = ev.target.closest("[data-grip]");
      if (!grip) return;
      const items = $$(".sort-item", list), item = grip.closest(".sort-item"), from = items.indexOf(item);
      if (items.length < 2) return;
      ev.preventDefault();
      const step = items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top;
      const startY = ev.clientY;
      let to = from;
      toolUI.dragging = true;
      item.classList.add("dragging");
      try { list.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ }
      const move = (e) => {
        const dy = Math.max(-from * step - step / 3, Math.min((items.length - 1 - from) * step + step / 3, e.clientY - startY));
        item.style.transform = "translateY(" + dy + "px) scale(1.04)";
        to = Math.max(0, Math.min(items.length - 1, from + Math.round(dy / step)));
        items.forEach((o, i) => {
          const shift = o === item ? 0 : from < to && i > from && i <= to ? -step : from > to && i >= to && i < from ? step : 0;
          if (o !== item) o.style.transform = shift ? "translateY(" + shift + "px)" : "";
          const place = $(".sort-place", o); // Platznummern wandern gleich mit
          if (place) place.textContent = (o === item ? to : i + Math.round(shift / step)) + 1 + ".";
        });
      };
      const up = () => {
        list.removeEventListener("pointermove", move); list.removeEventListener("pointerup", up); list.removeEventListener("pointercancel", up);
        const order = items.map((x) => x.dataset.val);
        order.splice(to, 0, order.splice(from, 1)[0]);
        items.forEach((o) => { o.style.transform = ""; });
        item.classList.remove("dragging");
        toolUI.dragging = false;
        finishSort(list, order, from !== to);
      };
      list.addEventListener("pointermove", move); list.addEventListener("pointerup", up); list.addEventListener("pointercancel", up);
    });
  }
  function finishSort(list, order, changed) {
    const qid = list.closest(".tool").dataset.tool;
    flushLetters(qid);
    if (list.hasAttribute("data-sync")) { if (changed) toolDo(qid, { type: "arrange", order }); }
    else toolUI.order[list.dataset.sort] = order;
    if (toolUI.refreshPending) { toolUI.refreshPending = false; render(); } else rerenderTools(qid);
  }

  function secretTermsBody(qid, cfg, ts, now) {
    const ph = T.phase(cfg, ts);
    if (ph === 1) {
      let h = phaseBar(1) + lookAway + '<p class="tool-label">' + cfg.count + " Begriffe: Was findest du an der Bucht besonders schön?</p>";
      for (let i = 0; i < cfg.count; i++) h += tInput(qid, "t" + i, "Begriff " + (i + 1), "text");
      return h + tBtn("fix", icon("lock") + " Bestätigen", "btn-primary btn-block") + '<p class="muted small">Begriffe aus früheren Runden zählen nicht noch einmal.</p>';
    }
    const terms = T.unhide(ts.secret) || [], res = T.result(cfg, ts, now), guessed = ts.guessed || [];
    const show = ts.revealed || peeking(qid);
    const n = guessed.filter(Boolean).length;
    let h = phaseBar(ph) +
      '<div class="tool-count-row"><div class="tool-clock"><div class="tool-big">' + (ts.tips || 0) + " von " + cfg.maxTips + '</div><div class="muted small">Tipps</div></div>' +
      '<div class="tool-clock"><div class="tool-big">' + n + " von " + cfg.count + '</div><div class="muted small">erraten (' + cfg.need + " nötig)</div></div></div>";
    if (res) h += tResult(res.ok, res.ok ? n + " von " + cfg.count + " Begriffen erraten." : "Alle " + cfg.maxTips + " Tipps verbraucht, nur " + n + " erraten. Neue Runde: fünf neue Begriffe ausdenken.");
    else if (ts.revealed) h += '<p class="tool-label">Aufgelöst – das waren die fünf Begriffe:</p>';
    const canMark = ph === 2;
    h += (canMark ? '<p class="muted small">Ist ein Begriff erraten, tippt ihn an (wer eingegeben hat, kann vorher lange auf „Anzeigen“ drücken).</p>' : "") +
      '<div class="term-list">' + terms.map((t, i) => {
        const inner = '<span class="term-no">' + (i + 1) + "</span>" + (guessed[i] || show ? '<span class="term-text">' + esc(t) + "</span>" : hiddenDots) +
          (guessed[i] ? '<span class="term-ok">' + icon("check") + " erraten</span>" : "");
        return canMark ? '<button class="term' + (guessed[i] ? " ok" : "") + '" data-tool-act="mark" data-i="' + i + '">' + inner + "</button>"
          : '<div class="term' + (guessed[i] ? " ok" : "") + '">' + inner + "</div>";
      }).join("") + "</div>";
    if (ph === 2) {
      if ((ts.tips || 0) < cfg.maxTips) h += tBtn("tip", icon("plus") + " 1 Tipp", "btn-primary btn-block tool-tap", ' data-d="1" data-hold="tip+:' + qid + '"');
      h += tBtn("tip", icon("minus") + " 1 Tipp (Korrektur)", "btn-ghost btn-block", ' data-d="-1" data-hold="tip-:' + qid + '"' + ((ts.tips || 0) ? "" : " disabled"));
      if (!ts.revealed) h += peekBtn(qid) + revealBtn(ts);
    }
    return h + newRoundBtn(!!res && !res.ok, res && !res.ok ? "Neue Runde – fünf neue Begriffe" : "Neue Runde");
  }

  function secretRankBody(qid, cfg, ts, now) {
    const ph = T.phase(cfg, ts);
    if (ph === 1 && !ts.fruits) {
      let h = phaseBar(1) + lookAway + '<p class="tool-label">Welche drei Früchte gibt es? (Die Namen sehen nachher alle, nur die Rangfolge bleibt geheim.)</p>';
      for (let i = 0; i < cfg.count; i++) h += tInput(qid, "f" + i, "Frucht " + (i + 1), "text");
      return h + tBtn("setFruits", "Weiter", "btn-primary btn-block") + '<p class="muted small">Früchte aus früheren Runden zählen nicht noch einmal.</p>';
    }
    const round = (ts.round || 1) + ":" + ts.fruits.join("|");
    let h = phaseBar(ph) + '<p class="small">Früchte: <strong>' + ts.fruits.map(esc).join(" · ") + "</strong></p>";
    if (ph === 1) {
      const key = qid + ":set:" + round;
      return h + lookAway + '<p class="tool-label">Geheime Rangfolge – oben die beste. Zum Sortieren am Griff ziehen.</p>' +
        sortList(key, ts.fruits) + tBtn("fix", icon("lock") + " Bestätigen", "btn-primary btn-block", ' data-key="' + esc(key) + '"') +
        tBtn("editFruits", "Früchte ändern", "btn-ghost btn-block");
    }
    const order = T.unhide(ts.secret) || [];
    const orderList = () => '<ol class="rank-result">' + order.map((f, i) => '<li><span class="sort-place">' + (i + 1) + ".</span> " + esc(f) + "</li>").join("") + "</ol>";
    if (ts.guess) {
      const res = T.result(cfg, ts, now);
      return h + tResult(res.ok, res.ok ? "Ihr habt die Rangfolge genau erraten." : res.places.filter(Boolean).length + " von " + order.length + " Plätzen richtig.") +
        '<ol class="rank-result">' + ts.guess.map((f, i) => '<li class="' + (res.places[i] ? "ok" : "miss") + '"><span class="sort-place">' + (i + 1) + ".</span> " + esc(f) +
          '<span class="term-ok">' + (res.places[i] ? icon("check") + " richtig" : icon("x") + " richtig wäre: " + esc(order[i])) + "</span></li>").join("") + "</ol>" +
        newRoundBtn(!res.ok, res.ok ? "Neue Runde" : "Neue Runde – mit anderen Früchten");
    }
    if (ts.revealed) return h + '<p class="tool-label">Aufgelöst – die geheime Rangfolge (oben die beste):</p>' + orderList() + newRoundBtn(true, "Neue Runde – mit anderen Früchten");
    h += '<p class="tool-label">Ratet die Rangfolge – oben die beste. Ihr sortiert gemeinsam: alle Handys zeigen dieselbe Reihenfolge.</p>' +
      sortList(qid + ":guess:" + round, ts.guessOrder || ts.fruits, true) +
      tBtn("guess", icon("lock") + " Bestätigen und vergleichen", "btn-primary btn-block");
    if (peeking(qid)) h += '<p class="tool-label">Geheime Rangfolge:</p>' + orderList();
    return h + peekBtn(qid) + revealBtn(ts) + newRoundBtn(false, "Neue Runde");
  }

  // ---- Foto-Rätsel (Bananenversteck, Türen, Steinadler) auf der Foto-Grundlage. Phase 1: Fotos + geheime Festlegung
  // (Auswahl nur auf diesem Handy bis „Bestätigen“), Phase 2: raten, Phase 3: Ergebnis. Jedes Handy kann alles.
  const puzzleSel = (qid, ts) => { const k = qid + ":" + (ts.round || 1) + ":" + T.phase(tcfg(qid), ts); return (toolUI.sel[k] = toolUI.sel[k] || { names: {} }); };
  function gridPhoto(cfg, photo, marks, tappable) {
    let cells = "";
    for (let i = 0; i < cfg.grid * cfg.grid; i++) {
      const m = marks[i] || "";
      cells += tappable ? '<button class="gp-cell ' + m + '" data-tool-ui="cell" data-cell="' + i + '" aria-label="Feld ' + (i + 1) + '"></button>'
        : '<span class="gp-cell ' + m + '"></span>';
    }
    return '<div class="grid-photo">' + photoImg(photo, "gp-img") + '<div class="gp-cells" style="--n:' + cfg.grid + '">' + cells + "</div></div>";
  }
  const trashBtn = (i) => '<button class="sort-btn" data-tool-act="removePhoto" data-i="' + i + '" aria-label="Foto löschen">' + icon("trash-2") + "</button>";
  // Nach dem Bestätigen von Geheimem (nur auf dem Handy, auf dem bestätigt wurde): erst weitergeben, dann raten
  function handoffScreen() {
    return '<div class="handoff">' + icon("smartphone") + "<strong>Handy weitergeben</strong>" +
      '<p class="muted">Bestätigt und verdeckt. Jetzt sind die Ratenden dran.</p></div>' +
      '<button class="btn btn-primary btn-block" data-tool-ui="handoff-ok">' + icon("arrow-right") + " Weiter</button>";
  }
  function photoPuzzleBody(qid, cfg, ts, now) {
    const ph = T.phase(cfg, ts), sel = puzzleSel(qid, ts), draft = T.draftEntries(ts.draft);
    const fixBtn = (ok, label) => tBtn("fix", icon("lock") + " " + (label || "Bestätigen"), "btn-primary btn-block", ok ? "" : " disabled");
    const guessBtn = (ok) => tBtn("guess", icon("lock") + " Bestätigen", "btn-primary btn-block", ok ? "" : " disabled");
    if (ph === 1) {
      let h = phaseBar(1) + lookAway;
      const need = cfg.photos - draft.length;
      if (cfg.kind === "photoGrid") {
        h += '<p class="tool-label">Foto aufnehmen, dann geheim das Versteck antippen.</p>' + photoPicker(qid, false);
        if (draft.length) h += gridPhoto(cfg, draft[0].photo, sel.cell != null ? { [sel.cell]: "sel" } : {}, true);
        return h + fixBtn(draft.length && sel.cell != null);
      }
      if (cfg.kind === "photoPick") {
        h += '<p class="tool-label">3 Steine fotografieren, dann geheim den Adler antippen.</p>' + (need > 0 ? photoPicker(qid, true) : "") +
          '<div class="pick-tiles">' + draft.map((d, i) => '<div class="pick-tile' + (sel.key === d.key ? " sel" : "") + '">' +
            '<button class="pt-btn" data-tool-ui="pick" data-key="' + esc(d.key) + '" aria-label="Foto ' + (i + 1) + ' als Adler">' + photoImg(d.photo, "pt-img") +
            (sel.key === d.key ? '<span class="pt-badge">' + icon("bird") + " Adler</span>" : "") + "</button>" + trashBtn(i) + "</div>").join("") + "</div>";
        return h + (need > 0 ? '<p class="muted small">Noch ' + need + " Foto" + (need === 1 ? "" : "s") + ".</p>" : "") +
          fixBtn(!need && draft.some((d) => d.key === sel.key));
      }
      // photoNames
      const names = teamNames(), used = sel.names;
      h += '<p class="tool-label">3 Türen fotografieren, jeder Tür geheim einen Namen geben.</p>' + (need > 0 ? photoPicker(qid, true) : "");
      if (names.length < cfg.photos) h += teamHint(cfg.photos);
      h += '<ol class="photo-rows">' + draft.map((d, i) => '<li class="pr-item"><span class="pr-no">' + (i + 1) + "</span>" + photoImg(d.photo, "pr-photo") +
        '<span class="pr-side"><span class="chips name-chips">' + names.map((n) => '<button class="chip' + (used[d.key] === n ? " on" : "") + '" data-tool-ui="name" data-key="' + esc(d.key) +
          '" data-name="' + esc(n) + '" aria-pressed="' + (used[d.key] === n) + '">' + esc(n) + "</button>").join("") + "</span>" + trashBtn(i) + "</span></li>").join("") + "</ol>";
      const done = !need && draft.every((d) => used[d.key]);
      return h + (need > 0 ? '<p class="muted small">Noch ' + need + " Foto" + (need === 1 ? "" : "s") + ".</p>" : "") + fixBtn(done);
    }
    const photos = ts.photos || [], res = T.result(cfg, ts, now);
    if (cfg.kind === "photoGrid") {
      if (ph === 2) {
        return phaseBar(2) + '<p class="tool-label">Wo ist die Person versteckt? Feld antippen.</p>' +
          gridPhoto(cfg, photos[0], sel.cell != null ? { [sel.cell]: "sel" } : {}, true) + guessBtn(sel.cell != null) + newRoundBtn(false);
      }
      const marks = {};
      if (res) { marks[res.cell] = "answer"; marks[ts.guess] = res.hit ? "ok" : "miss"; }
      return phaseBar(3) + (res ? tResult(res.found, res.hit ? "Gefunden – neu verstecken." : ts.accepted ? "Zählt als gefunden – neu verstecken." : "Nicht gefunden – Quest geschafft!",
          res.hit || ts.accepted ? "Richtig" : "Falsch") : "") +
        gridPhoto(cfg, photos[0], marks, false) + (res && !res.hit ? '<p class="muted small gp-legend"><span class="gp-key answer"></span> Versteck · <span class="gp-key miss"></span> getippt</p>' : "") +
        newRoundBtn(true) + (res && !res.hit && !ts.accepted ? tBtn("accept", icon("check") + " Trotzdem richtig", "btn-ghost btn-block") : "");
    }
    if (cfg.kind === "photoPick") {
      const tile = (p, i, cls, badge, tap) => '<div class="pick-tile' + cls + '">' + (tap ? '<button class="pt-btn" data-tool-ui="pick" data-i="' + i + '" aria-label="Stein ' + (i + 1) + '">' : '<span class="pt-btn">') +
        photoImg(p, "pt-img") + (badge ? '<span class="pt-badge">' + badge + "</span>" : "") + (tap ? "</button>" : "</span>") + "</div>";
      if (ph === 2) {
        return phaseBar(2) + '<p class="tool-label">Welcher Stein ist der Adler?</p>' +
          '<div class="pick-tiles">' + photos.map((p, i) => tile(p, i, sel.i === i ? " sel" : "", sel.i === i ? icon("bird") + " Tipp" : "", true)).join("") + "</div>" +
          guessBtn(sel.i != null) + newRoundBtn(false);
      }
      return phaseBar(3) + (res ? tResult(res.ok, res.ok ? "Der Adler ist gefunden." : "Der Adler ist grün umrandet.", res.ok ? "Richtig" : "Falsch") : "") +
        '<div class="pick-tiles">' + photos.map((p, i) => tile(p, i, res && i === res.answer ? " answer" : res && i === ts.guess ? " miss" : "",
          res && i === res.answer ? icon("bird") + " Adler" : res && i === ts.guess ? icon("x") + " Tipp" : "", false)).join("") + "</div>" + newRoundBtn(!res || !res.ok);
    }
    // photoNames
    if (ph === 2) {
      return phaseBar(2) + '<p class="tool-label">Welche Tür gehört wem? Namen ziehen.</p>' +
        '<div class="match-grid"><ol class="match-photos">' + photos.map((p) => "<li>" + photoImg(p, "mp-img") + "</li>").join("") + "</ol>" +
        sortList(qid + ":names:" + (ts.round || 1), ts.guessOrder || [], true) + "</div>" + guessBtn(true) + newRoundBtn(false);
    }
    return phaseBar(3) + (res ? tResult(res.ok, res.ok ? "Alle Türen richtig zugeordnet." : res.places.filter(Boolean).length + " von " + photos.length + " richtig.", res.ok ? "Richtig" : "Falsch") : "") +
      '<ol class="photo-rows">' + photos.map((p, i) => '<li class="pr-item ' + (res ? (res.places[i] ? "ok" : "miss") : "") + '"><span class="pr-no">' + (i + 1) + "</span>" + photoImg(p, "pr-photo") +
        '<span class="pr-side"><strong>' + esc((ts.guess || [])[i] || "") + "</strong>" +
        (res ? '<span class="term-ok">' + (res.places[i] ? icon("check") + " richtig" : icon("x") + " richtig: " + esc(res.names[i])) + "</span>" : "") + "</span></li>").join("") + "</ol>" +
      newRoundBtn(!res || !res.ok);
  }

  // ---- Bucht gesucht (Machico): Zeichenfläche + Karte der Ponta de São Lourenço (Küste: bay-map.js, Quelle CAOP/DGT).
  // Phase 1: Zufall lost geheim eine Bucht aus; auf dem auslosenden Handy (oder wer „Hier zeichnen“ wählt) erscheinen der
  // Küstenausschnitt nur der Bucht (gedreht, Öffnung oben; ohne Nummer/Namen, ein-/ausblendbar) und die Zeichenfläche. Gezeichnet wird nur lokal
  // (nicht synchronisiert; Entwurf in localStorage), erst „Bestätigen“ speichert die Striche → „Handy weitergeben“.
  // Phase 2: Zeichnung + Karte mit nummerierten Buchten, eine antippen → „Bestätigen“. Phase 3: grün/rot, richtige Bucht
  // hervorgehoben, Zeichnung und echter Ausschnitt nebeneinander; „Neue Runde“, bei falsch „Trotzdem richtig“.
  const BM = () => window.BAY_MAP;
  const bayById = (id) => BM().bays.find((b) => b.id === id);
  const bayTitle = (b) => "Bucht " + b.n + (b.name ? " · " + b.name : "");
  let bayLandCache = "";
  const bayLand = () => bayLandCache || (bayLandCache = BM().land.map((d) => '<path d="' + d + '"/>').join(""));
  // Küstenausschnitt nur der Bucht, gedreht (nicht gespiegelt), sodass ihre Öffnung oben liegt: gleichmäßiger Landstreifen
  // (Breite d) entlang der Buchtküste, Wasser der Bucht, Inseln darin; oberhalb der Öffnung (top) wird alles abgeschnitten.
  // So ist nichts außerhalb der Bucht zu sehen (keine Nachbarbuchten, keine Gegenküste). Daten: bay-map.js (poly/rot/d/top/box).
  let bayClipN = 0;
  function bayCrop(id) {
    const b = bayById(id), v = b.box, land = BM().land, cid = "bayclip" + (++bayClipN);
    return '<svg class="bay-crop" viewBox="' + v.join(" ") + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Küstenausschnitt">' +
      '<defs><clipPath id="' + cid + '"><rect x="' + v[0] + '" y="' + b.top + '" width="' + v[2] + '" height="' + (v[1] + v[3] - b.top) + '"/></clipPath></defs>' +
      '<g clip-path="url(#' + cid + ')"><g transform="rotate(' + b.rot + ')">' +
      '<path class="bc-strip" d="' + b.poly + 'Z" stroke-width="' + 2 * b.d + '"/><path class="bm-sea" d="' + b.poly + 'Z"/>' +
      '<path class="bc-coast" d="' + b.poly + '"/><g class="bm-land">' + b.isl.map((k) => '<path d="' + land[k] + '"/>').join("") + "</g></g></g></svg>";
  }
  // Karte des Zipfels mit allen nummerierten Buchten; opts: sel (getippt), right/wrong (Ergebnis), tap (antippbar).
  // Die Nummern stehen im offenen Wasser vor ihrer Bucht (Platz berechnet tools/buchten_karte.py: keine Überdeckung von Küste,
  // Inseln, Buchten oder anderen Nummern), eine dünne Linie führt zur Buchtmitte (tx/ty).
  function bayMap(opts) {
    const m = BM(), r = m.r, v = m.view;
    const cls = (b) => (b.id === opts.right ? " right" : b.id === opts.wrong ? " wrong" : b.id === opts.sel ? " sel" : "");
    const leads = m.bays.map((b) => '<g class="bm-lead' + cls(b) + '"><line x1="' + b.x + '" y1="' + b.y + '" x2="' + b.tx + '" y2="' + b.ty + '"/><circle cx="' + b.tx + '" cy="' + b.ty + '" r="' + r * 0.2 + '"/></g>').join("");
    const marks = m.bays.map((b) => '<g class="bm-mark' + cls(b) + '"><circle class="bm-hit" cx="' + b.x + '" cy="' + b.y + '" r="' + r * 2.2 + '"/><circle cx="' + b.x + '" cy="' + b.y + '" r="' + r + '"/>' +
      '<text x="' + b.x + '" y="' + b.y + '" dy=".36em" font-size="' + r * 1.25 + '">' + b.n + "</text>" +
      (b.name ? '<text class="bm-name" x="' + b.nx + '" y="' + b.ny + '" style="text-anchor:' + b.na + '" font-size="' + r * 1.05 + '">' + esc(b.name) + "</text>" : "") + "</g>").join("");
    const hl = opts.right ? '<path class="bm-hl" d="' + bayById(opts.right).poly + 'Z"/>' : ""; // Wasserfläche der Bucht, nach Norden ausgerichtet
    const z = toolUI.bayZoom;
    return '<div class="bay-map-wrap' + (z.s > 1.001 ? " zoomed" : "") + '" data-bay-zoom' + (opts.tap ? ' data-bay-tap="1"' : "") + '><div class="bay-stage" style="transform:translate3d(' + z.tx + "px," + z.ty + "px,0) scale(" + z.s + ')">' +
      '<svg class="bay-map" viewBox="' + v.join(" ") + '"' + (opts.tap ? ' data-tool-ui="baymap"' : "") + ' style="--zs:' + z.s + '"' +
      ' role="img" aria-label="Karte der Ponta de São Lourenço mit nummerierten Buchten"><rect class="bm-sea" x="' + v[0] + '" y="' + v[1] + '" width="' + v[2] + '" height="' + v[3] + '"/><g class="bm-land">' + bayLand() + "</g>" + hl + leads + marks + "</svg></div>" +
      "</div>" + // Knopf unter der Karte, damit er gezoomt keine Nummer verdeckt
      '<div class="bay-zoom-row"><span class="muted small">' + icon("zoom-in") + " Zwei Finger: zoomen</span>" +
      '<button class="btn btn-small btn-ghost bay-reset" data-tool-ui="bay-reset">' + icon("scan") + " Ganze Karte</button></div>";
  }
  // Antippen auf der Karte: in einer Bucht → diese Bucht, sonst die nächste Nummer oder Buchtmitte
  let bayPolys = null;
  function bayAt(x, y) {
    const inPoly = (pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [x1, y1] = pts[j], [x2, y2] = pts[i]; if ((y1 > y) !== (y2 > y) && x < x1 + (y - y1) * (x2 - x1) / (y2 - y1)) c = !c; } return c; };
    bayPolys = bayPolys || BM().bays.map((b) => b.poly.slice(1).split(" ").map((q) => q.split(",").map(Number)));
    const hit = BM().bays.find((b, i) => inPoly(bayPolys[i]));
    if (hit) return hit;
    let best = null, bd = Infinity;
    BM().bays.forEach((b) => { const dd = Math.min(Math.hypot(b.x - x, b.y - y), Math.hypot(b.tx - x, b.ty - y)); if (dd < bd) { bd = dd; best = b; } });
    return best;
  }
  // Buchten-Karte zoomen/verschieben (wie die Inselkarte, panZoom). Die Nummern bleiben auf dem Bildschirm gleich groß.
  // Zoom-Zustand bleibt beim Neuzeichnen; während der Geste wird das Hilfsmittel nicht neu gezeichnet.
  toolUI.bayZoom = { s: 1, tx: 0, ty: 0 };
  function bayClientToMap(wrap, cx, cy) {
    if (!wrap) return null;
    const r = wrap.getBoundingClientRect(), v = BM().view, z = toolUI.bayZoom, k = r.width / v[2] * z.s;
    return [v[0] + (cx - r.left - z.tx) / k, v[1] + (cy - r.top - z.ty) / k];
  }
  function bayMarkScale(wrap) {
    const z = toolUI.bayZoom, inv = 1 / z.s;
    $$(".bm-mark", wrap).forEach((g) => {
      const c = g.querySelector("circle:not(.bm-hit)");
      const x = +c.getAttribute("cx"), y = +c.getAttribute("cy");
      g.setAttribute("transform", "translate(" + x + " " + y + ") scale(" + inv + ") translate(" + -x + " " + -y + ")");
    });
    $$(".bm-lead circle", wrap).forEach((c) => { c.setAttribute("transform", "translate(" + c.getAttribute("cx") + " " + c.getAttribute("cy") + ") scale(" + inv + ") translate(" + -c.getAttribute("cx") + " " + -c.getAttribute("cy") + ")"); });
  }
  function mountBayZoom() {
    $$("[data-bay-zoom]").forEach((wrap) => {
      if (wrap._pz) return;
      const qid = (wrap.closest("[data-tool]") || {}).dataset.tool, svg = $(".bay-map", wrap);
      wrap._pz = panZoom(wrap, $(".bay-stage", wrap), toolUI.bayZoom, {
        onChange: () => bayMarkScale(wrap),
        onActive: (on) => { toolUI.dragging = on; },
        onEnd: () => {
          if (svg) svg.style.setProperty("--zs", toolUI.bayZoom.s); // Linien wieder dünn
          if (toolUI.refreshPending && qid) { toolUI.refreshPending = false; rerenderTools(qid); }
        },
        onTap: (x, y) => { // Finger: Bucht unter dem Finger bzw. nächste Nummer wählen
          if (!wrap.hasAttribute("data-bay-tap") || !qid) return;
          const q = bayClientToMap(wrap, x, y), best = q && bayAt(q[0], q[1]);
          if (best) { puzzleSel(qid, toolState(qid)).bay = best.id; rerenderTools(qid); }
        }
      });
      wrap._pz.apply(false);
    });
  }
  // Zeichnung: Striche { t: p(Stift)/b(Pinsel)/e(Radierer), c: Farbe, w: 1–3, p: [x, y, …] } in 1.000 × 750
  const DRAW_W = 1000, DRAW_H = 750, DRAW_SIZES = { 1: 5, 2: 11, 3: 22 };
  const DRAW_COLORS = ["#1f2933", "#0b5f78", "#3b82f6", "#2f9e44", "#e5b53b", "#e8822d", "#e0475b", "#8b5e3c"];
  const strokeLook = (st) => (st.t === "b" ? { w: DRAW_SIZES[st.w] * 2.2, a: 0.5, c: st.c } : st.t === "e" ? { w: DRAW_SIZES[st.w] * 2.5, a: 1, c: "#ffffff" } : { w: DRAW_SIZES[st.w], a: 1, c: st.c });
  function strokeD(p) { // quadratisch geglättet über die Mittelpunkte
    if (p.length <= 2) return "M" + p[0] + "," + p[1] + " l0.1,0";
    let d = "M" + p[0] + "," + p[1];
    for (let i = 2; i < p.length - 2; i += 2) d += " Q" + p[i] + "," + p[i + 1] + " " + (p[i] + p[i + 2]) / 2 + "," + (p[i + 1] + p[i + 3]) / 2;
    return d + " L" + p[p.length - 2] + "," + p[p.length - 1];
  }
  function drawingSvg(drawing) {
    return '<svg class="bay-drawing" viewBox="0 0 ' + DRAW_W + " " + DRAW_H + '" role="img" aria-label="Zeichnung"><rect width="' + DRAW_W + '" height="' + DRAW_H + '" fill="#fff"/>' +
      ((drawing && drawing.strokes) || []).map((st) => { const l = strokeLook(st); return '<path d="' + strokeD(st.p) + '" stroke="' + l.c + '" stroke-width="' + l.w + '" opacity="' + l.a + '"/>'; }).join("") + "</svg>";
  }
  function paintStroke(ctx, st, k) {
    const l = strokeLook(st), p = st.p;
    ctx.save(); ctx.globalAlpha = l.a; ctx.strokeStyle = l.c; ctx.lineWidth = l.w * k; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(p[0] * k, p[1] * k);
    if (p.length <= 2) ctx.lineTo(p[0] * k + 0.1, p[1] * k);
    for (let i = 2; i < p.length - 2; i += 2) ctx.quadraticCurveTo(p[i] * k, p[i + 1] * k, (p[i] + p[i + 2]) / 2 * k, (p[i + 1] + p[i + 3]) / 2 * k);
    if (p.length > 2) ctx.lineTo(p[p.length - 2] * k, p[p.length - 1] * k);
    ctx.stroke(); ctx.restore();
  }
  function simplifyStroke(p, tol) { // Ramer–Douglas–Peucker auf [x, y, …]
    const n = p.length / 2;
    if (n < 3) return p;
    const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop(), x1 = p[2 * a], y1 = p[2 * a + 1], dx = p[2 * b] - x1, dy = p[2 * b + 1] - y1, L = Math.hypot(dx, dy) || 1e-9;
      let best = 0, bi = -1;
      for (let i = a + 1; i < b; i++) { const dd = Math.abs(dy * (p[2 * i] - x1) - dx * (p[2 * i + 1] - y1)) / L; if (dd > best) { best = dd; bi = i; } }
      if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(p[2 * i], p[2 * i + 1]);
    return out;
  }
  // Zeichen-Zustand dieses Handys (eine Runde = eine Bucht); Entwurf übersteht Neuladen (localStorage)
  function drawState(qid, ts) {
    const key = qid + ":" + (ts.round || 1) + ":" + String(ts.secret || "").slice(-8);
    let d = toolUI.draw;
    if (!d || d.key !== key) {
      let saved = null;
      try { saved = JSON.parse(store.get("draw:" + key) || "null"); } catch (e) { saved = null; }
      d = toolUI.draw = { qid, key, strokes: (saved && saved.strokes) || [], redo: [], tool: "p", color: DRAW_COLORS[0], size: 2, showRef: true, el: null, here: !!(saved && saved.here) };
    }
    return d;
  }
  const saveDraw = (d) => store.set("draw:" + d.key, JSON.stringify({ strokes: d.strokes, here: d.here }));
  function buildDrawEl(d) {
    const el = document.createElement("div");
    el.className = "draw";
    const tool = (t, ic, label) => '<button class="draw-btn" data-draw="tool:' + t + '" aria-label="' + label + '" title="' + label + '">' + icon(ic) + "</button>";
    const size = (s) => '<button class="draw-btn draw-size" data-draw="size:' + s + '" aria-label="Strichstärke ' + s + '"><span style="width:' + (4 + s * 4) + "px;height:" + (4 + s * 4) + 'px"></span></button>';
    el.innerHTML = '<div class="draw-bar">' + tool("p", "pencil", "Stift") + tool("b", "paintbrush", "Pinsel") + tool("e", "eraser", "Radierer") +
      '<span class="draw-sep"></span>' + size(1) + size(2) + size(3) + '<span class="draw-break"></span>' +
      '<button class="draw-btn" data-draw="undo" aria-label="Rückgängig" title="Rückgängig">' + icon("undo-2") + "</button>" +
      '<button class="draw-btn" data-draw="redo" aria-label="Wiederholen" title="Wiederholen">' + icon("redo-2") + "</button>" +
      '<button class="draw-btn" data-draw="clear" aria-label="Alles löschen" title="Alles löschen">' + icon("trash-2") + "</button>" +
      '<span class="draw-sep"></span><button class="draw-btn draw-ref" data-draw="ref" aria-label="Ausschnitt ein-/ausblenden" title="Ausschnitt ein-/ausblenden">' + icon("eye-off") + "</button></div>" +
      '<div class="draw-colors">' + DRAW_COLORS.map((c) => '<button class="draw-color" data-draw="color:' + c + '" style="background:' + c + '" aria-label="Farbe ' + c + '"></button>').join("") + "</div>" +
      '<div class="draw-pad"><canvas class="draw-base"></canvas><canvas class="draw-live"></canvas></div>';
    const pad = $(".draw-pad", el), base = $(".draw-base", el), live = $(".draw-live", el);
    d.el = el; d.base = base; d.live = live; d.pad = pad;
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-draw]");
      if (!b) return;
      ev.stopPropagation();
      const [what, val] = b.dataset.draw.split(":");
      if (what === "tool") d.tool = val;
      else if (what === "size") d.size = +val;
      else if (what === "color") { d.color = b.dataset.draw.slice(6); if (d.tool === "e") d.tool = "p"; }
      else if (what === "ref") { d.showRef = !d.showRef; rerenderTools(d.qid); }
      else if (what === "undo" && d.strokes.length) { d.redo.push(d.strokes.pop()); redrawBase(d); saveDraw(d); }
      else if (what === "redo" && d.redo.length) { d.strokes.push(d.redo.pop()); redrawBase(d); saveDraw(d); }
      else if (what === "clear" && d.strokes.length) {
        confirmBox("Alles löschen?", "Die ganze Zeichnung wird gelöscht.", "Löschen", true).then((ok) => { if (ok) { d.strokes = []; d.redo = []; redrawBase(d); saveDraw(d); drawBarState(d); } });
      }
      tapFeedback(b);
      drawBarState(d);
    });
    // Zeichnen mit Finger/Stift/Maus – die Seite scrollt und zoomt dabei nicht (touch-action: none)
    let cur = null, raf = 0;
    const pt = (e) => { const r = pad.getBoundingClientRect(); return [Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * DRAW_W), Math.round(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * DRAW_H)]; };
    const drawLive = () => { raf = 0; const ctx = live.getContext("2d"); ctx.clearRect(0, 0, live.width, live.height); if (cur) paintStroke(ctx, cur, live.width / DRAW_W); };
    pad.addEventListener("pointerdown", (e) => {
      if (e.button > 0 || cur) return;
      e.preventDefault();
      try { pad.setPointerCapture(e.pointerId); } catch (x) { /* egal */ }
      toolUI.dragging = true; // während des Zeichnens nichts neu zeichnen
      cur = { t: d.tool, c: d.tool === "e" ? "#ffffff" : d.color, w: d.size, p: pt(e), id: e.pointerId };
      drawLive();
    });
    pad.addEventListener("pointermove", (e) => {
      if (!cur || e.pointerId !== cur.id) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach((ce) => {
        const [x, y] = pt(ce), n = cur.p.length;
        if (Math.hypot(x - cur.p[n - 2], y - cur.p[n - 1]) >= 2) cur.p.push(x, y);
      });
      if (!raf) raf = requestAnimationFrame(drawLive);
    });
    const end = (e) => {
      if (!cur || e.pointerId !== cur.id) return;
      const st = { t: cur.t, c: cur.c, w: cur.w, p: simplifyStroke(cur.p, 0.8) };
      cur = null; drawLive();
      d.strokes.push(st); d.redo = [];
      paintStroke(base.getContext("2d"), st, base.width / DRAW_W);
      saveDraw(d); drawBarState(d);
      toolUI.dragging = false;
      if (toolUI.refreshPending) { toolUI.refreshPending = false; render(); }
    };
    pad.addEventListener("pointerup", end); pad.addEventListener("pointercancel", end);
    if (window.ResizeObserver) new ResizeObserver(() => sizeDraw(d)).observe(pad);
    drawBarState(d);
    return el;
  }
  function drawBarState(d) {
    if (!d.el) return;
    $$("[data-draw]", d.el).forEach((b) => {
      const [what, val] = b.dataset.draw.split(":");
      b.classList.toggle("on", (what === "tool" && val === d.tool) || (what === "size" && +val === d.size) || (what === "color" && b.dataset.draw.slice(6) === d.color && d.tool !== "e"));
      if (what === "undo") b.disabled = !d.strokes.length;
      if (what === "redo") b.disabled = !d.redo.length;
      if (what === "clear") b.disabled = !d.strokes.length;
      if (what === "ref") { b.innerHTML = icon(d.showRef ? "eye-off" : "eye"); b.classList.toggle("on", !d.showRef); }
    });
  }
  function sizeDraw(d) { // Canvas in Bildschirmauflösung, Inhalt aus den Strichen neu zeichnen
    const r = d.pad.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (d.base.width === W && d.base.height === H) return;
    [d.base, d.live].forEach((c) => { c.width = W; c.height = H; });
    redrawBase(d);
  }
  function redrawBase(d) {
    const ctx = d.base.getContext("2d"), k = d.base.width / DRAW_W;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, d.base.width, d.base.height);
    d.strokes.forEach((st) => paintStroke(ctx, st, k));
  }
  // Zeichenfläche bleibt beim Neuzeichnen erhalten (wie die Kamera): wird in ihren Platz [data-draw-slot] zurückgehängt
  function mountDraw() {
    const d = toolUI.draw;
    if (!d || !d.el) return;
    const slot = $('[data-draw-slot="' + d.qid + '"]');
    if (slot && d.el.parentNode !== slot) { slot.appendChild(d.el); sizeDraw(d); }
  }
  function drawBayBody(qid, cfg, ts, now) {
    if (!BM()) return '<p class="tool-warn">Karte fehlt (bay-map.js).</p>';
    const ph = T.phase(cfg, ts), sel = puzzleSel(qid, ts);
    if (ph === 1 && !ts.secret) {
      return phaseBar(1) + lookAway + '<p class="tool-label">Der Zufall wählt geheim eine Bucht. Wer zeichnet, sieht nur ihren Küstenausschnitt.</p>' +
        tBtn("start", icon("shuffle") + " Bucht auslosen", "btn-primary btn-block");
    }
    if (ph === 1) {
      const d = drawState(qid, ts);
      if (!d.here) {
        return phaseBar(1) + '<p class="tool-wait">' + icon("pencil") + " Auf einem anderen Handy wird gerade gezeichnet.</p>" +
          '<button class="btn btn-ghost btn-block" data-tool-ui="draw-here">' + icon("eye") + " Hier zeichnen</button>" +
          '<p class="muted small">Zeigt die geheime Bucht auf diesem Handy – nur für die Person, die zeichnet.</p>' + newRoundBtn(false, "Neue Runde (andere Bucht)");
      }
      if (!d.el) buildDrawEl(d);
      return phaseBar(1) + '<p class="tool-label">Zeichne diese Küste nach.</p>' +
        (d.showRef ? '<div class="bay-ref">' + bayCrop(T.unhide(ts.secret)) + "</div>" : "") +
        (d.showRef ? "" : '<p class="muted small">Ausschnitt ausgeblendet – das Auge in der Leiste zeigt ihn wieder.</p>') +
        '<div data-draw-slot="' + qid + '"></div>' + tBtn("fix", icon("lock") + " Bestätigen", "btn-primary btn-block") + newRoundBtn(false, "Neue Runde (andere Bucht)");
    }
    const chips = (cls) => '<div class="chips bay-chips">' + BM().bays.map((b) => '<button class="chip' + (sel.bay === b.id ? " on" : "") + '" data-tool-ui="bay" data-bay="' + b.id + '"' + cls + ">" + esc(bayTitle(b).replace("Bucht ", "")) + "</button>").join("") + "</div>";
    if (ph === 2) {
      return phaseBar(2) + '<p class="tool-label">Welche Bucht ist gezeichnet?</p>' + drawingSvg(ts.drawing) +
        bayMap({ sel: sel.bay, tap: true }) + chips("") +
        tBtn("guess", icon("lock") + " Bestätigen", "btn-primary btn-block", sel.bay ? "" : " disabled") + newRoundBtn(false);
    }
    const res = T.result(cfg, ts, now), right = res ? bayById(res.bay) : null, guess = bayById(ts.guess);
    return phaseBar(3) + (res ? tResult(res.ok, res.hit ? bayTitle(right) + " erkannt." : ts.accepted ? "Zählt als richtig (" + bayTitle(right) + ")." : "Getippt: " + bayTitle(guess) + " · richtig: " + bayTitle(right) + ".", res.ok ? "Richtig" : "Falsch") : "") +
      (res ? bayMap({ right: res.bay, wrong: res.hit ? null : ts.guess }) : "") +
      '<div class="bay-compare"><figure>' + drawingSvg(ts.drawing) + "<figcaption>Zeichnung</figcaption></figure>" +
      (right ? "<figure>" + bayCrop(right.id) + "<figcaption>" + esc(bayTitle(right)) + "</figcaption></figure>" : "") + "</div>" +
      newRoundBtn(!res || !res.ok) + (res && !res.hit && !ts.accepted ? tBtn("accept", icon("check") + " Trotzdem richtig", "btn-ghost btn-block") : "");
  }

  // ---- Buchstaben-Fotos (Baumstaben): Fotos mit je einem Buchstaben → geheimes Wort; ein Rateversuch pro Runde
  function photoWordBody(qid, cfg, ts, now) {
    const ph = T.phase(cfg, ts);
    const pbtn = (act, ic, i, d, label, off) => '<button class="sort-btn" data-tool-act="' + act + '" data-i="' + i + '"' + (d ? ' data-d="' + d + '"' : "") + ' aria-label="' + label + '"' + (off ? " disabled" : "") + ">" + icon(ic) + "</button>";
    const letterInput = (attr, value, i) => '<input class="tool-input letter-input" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="next" ' + attr +
      ' value="' + esc(value || "") + '" data-prev="' + esc(value || "") + '" aria-label="Buchstabe zu Foto ' + (i + 1) + '" placeholder="?">';
    // Raten und Ergebnis: wie bei der Eingabe ein Foto pro Zeile, von oben nach unten in Wortreihenfolge, Buchstabe daneben
    const photoRows = (cells) => '<ol class="photo-rows">' + cells.map((c, i) => '<li class="pr-item' + (c.cls ? " " + c.cls : "") + '"><span class="pr-no">' + (i + 1) + "</span>" +
      photoImg(c.photo, "pr-photo") + '<span class="pr-side">' + c.html + "</span></li>").join("") + "</ol>";
    if (ph === 1) {
      const draft = T.draftEntries(ts.draft), letters = T.unhide(ts.draftLetters) || [];
      const ready = draft.length >= cfg.minLetters && letters.length === draft.length && letters.every(Boolean);
      return phaseBar(1) + lookAway +
        '<p class="tool-label">Für jeden Buchstaben einen Baum oder Ast fotografieren, dessen Form ihn darstellt – in der richtigen Reihenfolge, mindestens ' + cfg.minLetters + ". Zu jedem Foto genau einen Buchstaben eintragen.</p>" +
        photoPicker(qid, true) +
        (draft.length ? '<p class="muted small">Reihenfolge ändern: am Griff ziehen.</p>' +
          '<ol class="sort-list photo-sort" data-sort="' + qid + ':photos" data-sync>' + draft.map((d, i) =>
            '<li class="sort-item photo-sort-item" data-val="' + esc(d.key) + '"><span class="sort-grip" data-grip aria-hidden="true">' + icon("grip-vertical") + "</span>" +
            '<span class="ps-photo">' + photoImg(d.photo, "ps-thumb") + '<span class="sort-place">' + (i + 1) + "</span></span>" +
            letterInput('data-letter="' + i + '"', letters[i], i) +
            '<span class="ps-move">' + pbtn("duplicate", "copy", i, 0, "Duplizieren (Kopie darunter, z. B. für doppelte Buchstaben)", draft.length >= 20) +
            pbtn("removePhoto", "trash-2", i, 0, "Foto löschen") + "</span></li>").join("") + "</ol>" : "") +
        tBtn("fix", icon("lock") + " Bestätigen" + (draft.length ? " (" + draft.length + " Buchstaben)" : ""), "btn-primary btn-block", ready ? "" : " disabled") +
        '<p class="muted small">' + (draft.length < cfg.minLetters ? "Noch " + (cfg.minLetters - draft.length) + " Foto" + (cfg.minLetters - draft.length === 1 ? "" : "s") + " bis zum Bestätigen. " : "") +
          "Fotos bleiben auch beim Neuladen der Seite erhalten. Wörter aus früheren Runden zählen nicht noch einmal.</p>" +
        (draft.length ? newRoundBtn(false, "Neu beginnen (alle Fotos verwerfen)") : "");
    }
    const word = T.unhide(ts.secret) || [], attempts = ts.attempts || [], last = attempts[attempts.length - 1];
    const show = ph === 3 || peeking(qid);
    let h = phaseBar(ph) + '<div class="tool-word">' + icon("camera") + " Wort mit <strong>" + word.length + " Buchstaben</strong>" +
      (show ? ': <strong class="tool-secret">' + esc(word.join("")) + "</strong>" : "") + "</div>";
    const row = (letters, marks) => '<div class="letter-row">' + letters.map((l, i) => '<span class="letter-box ' + (marks[i] ? "ok" : "miss") + '">' + esc(l) + "</span>").join("") + "</div>";
    if (ph === 3) {
      const n = last ? last.marks.filter(Boolean).length : 0;
      if (ts.solved) {
        h += tResult(true, (last ? n + " von " + word.length + " Buchstaben richtig. " : "") + "Das Wort: <strong>" + esc(word.join("")) + "</strong>" + (ts.accepted && last ? " – euer Versuch „" + esc(last.letters.join("")) + "“ zählt trotzdem." : "")) +
          (last ? row(last.letters, last.marks) : "");
      } else if (ts.failed && last) {
        h += tResult(false, n + " von " + word.length + " Buchstaben richtig. Das Wort war: <strong>" + esc(word.join("")) + "</strong>") +
          '<p class="small">Euer Versuch' + byTxt(last.by) + ":</p>" + row(last.letters, last.marks) +
          (ts.photos && ts.photos.length ? photoRows(ts.photos.map((pid, i) => ({ photo: pid, cls: last.marks[i] ? "ok" : "miss",
            html: '<span class="letter-box ' + (last.marks[i] ? "ok" : "miss") + '">' + esc(last.letters[i]) + "</span>" +
              (last.marks[i] ? "" : '<span class="pr-right">richtig: <strong>' + esc(word[i]) + "</strong></span>") }))) : "") +
          tBtn("accept", icon("check") + " Trotzdem richtig", "btn-good btn-block") + '<p class="muted small">„Trotzdem richtig“ für knappe Fälle – entscheidet, wer das Wort ausgedacht hat.</p>';
      } else {
        h += '<p class="tool-label">Aufgelöst – das Wort war: <strong>' + esc(word.join("")) + "</strong></p>" +
          (ts.photos && ts.photos.length ? photoRows(ts.photos.map((pid, i) => ({ photo: pid, html: '<span class="pr-letter">' + esc(word[i]) + "</span>" })))
            : row(word, word.map(() => true)));
      }
      return h + newRoundBtn(!ts.solved, "Neue Runde – neues Wort, neue Fotos");
    }
    h += '<p class="tool-label">Tragt neben jedes Foto einen Buchstaben ein (von oben nach unten). Es gibt nur einen Versuch – danach wird verglichen.</p>' +
      photoRows((ts.photos || []).map((pid, i) => ({ photo: pid,
        html: letterInput('data-keep="' + qid + ":g" + i + '"', "", i) + (peeking(qid) ? '<span class="pr-letter">' + esc(word[i]) + "</span>" : "") }))) +
      tBtn("guess", icon("lock") + " Bestätigen und vergleichen", "btn-primary btn-block");
    return h + peekBtn(qid) + revealBtn(ts) + newRoundBtn(false, "Neue Runde – neues Wort, neue Fotos");
  }

  // ---- Fotos für Hilfsmittel (wiederverwendbare Foto-Grundlage)
  // photoPicker(qid, mehrere) zeigt „Foto aufnehmen“ (Kamera) und „Aus Galerie wählen“ (mehrere Bilder auf einmal).
  // Jedes Bild wird einzeln und speichersparend verkleinert (shrinkPhoto), sofort hochgeladen (POST api/photo) und mit
  // toolDo(qid, { type: "addPhoto", photo: id }) eingetragen – damit liegt es auf dem Server und übersteht ein Neuladen
  // (z. B. wenn das Handy den Browser beim Öffnen der Kamera aus dem Speicher wirft). Anzeigen mit photoImg(id).
  // Der Server löscht Fotos selbst, sobald der Spielstand nicht mehr auf sie verweist (Geschafft, Neue Runde, Reset).
  const PHOTO_SIDE = 1000, PHOTO_BYTES = 200 * 1024;
  function photoPicker(qid, multiple) {
    return '<div class="photo-zone" data-photo-zone="' + qid + '"' + (multiple ? " data-multiple" : "") + ">" + photoZoneInner(qid, multiple) + "</div>";
  }
  function photoZoneInner(qid, multiple) {
    const failed = photoFailedHTML(qid), cam = toolUI.cam;
    const gallery = '<button class="btn btn-ghost" data-tool-ui="photo-gallery"' + (multiple ? " data-multiple" : "") + ">" + icon("image") + " Aus Galerie wählen</button>";
    // Zweiter Weg ohne Bildfilter: Android zeigt dann die App „Dateien“ statt der Foto-Auswahl
    const filesBtn = '<button class="btn btn-small btn-ghost photo-files" data-tool-ui="photo-files"' + (multiple ? " data-multiple" : "") + ">" + icon("folder-open") + " Aus Dateien wählen</button>";
    // Kamera in der Seite: Platz für die Live-Vorschau (das Kamera-Element selbst bleibt beim Neuzeichnen erhalten, mountCamera)
    if (cam && cam.qid === qid) return '<div data-cam-slot="' + qid + '"></div>' + failed;
    if (!app.online) return '<div class="tool-warn">' + icon("wifi-off") + " Offline – Fotos aufnehmen geht erst wieder mit Netz.</div>" + failed;
    const up = toolUI.uploading[qid];
    if (up) {
      return '<div class="tool-wait photo-progress">' + icon("camera") + "<div><strong>Foto " + Math.min(up.done + 1, up.total) + " von " + up.total + "</strong> wird verkleinert und hochgeladen …" +
        '<div class="progress"><div style="width:' + Math.round(up.done / up.total * 100) + '%"></div></div></div></div>' + failed;
    }
    const fb = toolUI.camFallback;
    if (fb) { // Kamera in der Seite geht nicht (abgelehnt/nicht vorhanden): Rückfall auf die Kamera-App
      return '<div class="tool-warn">' + icon("camera-off") + " " + esc(fb.text) + "</div>" +
        '<div class="grid2 photo-pick"><button class="btn btn-primary" data-tool-ui="photo-camera">' + icon("camera") + " Foto aufnehmen</button>" + gallery + "</div>" + filesBtn +
        '<p class="muted small">Falls die Seite abstürzt, nutze „Aus Galerie wählen“.</p>' +
        '<button class="btn btn-small btn-ghost" data-tool-ui="cam-open">' + icon("rotate-ccw") + " Kamera in der Seite erneut versuchen</button>" + failed;
    }
    return '<div class="grid2 photo-pick"><button class="btn btn-primary" data-tool-ui="cam-open">' + icon("camera") + " Foto aufnehmen</button>" + gallery + "</div>" + filesBtn + failed;
  }
  // Während Fotos aus der Galerie ausgewählt und verarbeitet werden, wird nur diese Foto-Zone (Fortschritt) aktualisiert;
  // das Neuzeichnen des übrigen Hilfsmittels (z. B. durch die Synchronisierung) wird aufgeschoben und danach nachgeholt.
  function updatePhotoZone(qid) {
    $$('[data-photo-zone="' + qid + '"]').forEach((z) => { z.innerHTML = photoZoneInner(qid, z.hasAttribute("data-multiple")); });
    mountCamera();
  }
  const photoBusy = (qid) => (qid ? !!toolUI.uploading[qid] || !!(toolUI.picking && toolUI.picking.qid === qid) || !!toolUI.reading
    : Object.keys(toolUI.uploading).length > 0 || !!toolUI.picking || !!toolUI.reading);
  function photoDone(qid) {
    if (qid) updatePhotoZone(qid); // Fortschritt sofort weg
    if (photoBusy() || toolUI.dragging) return;
    toolUI.refreshPending = false;
    render(); // holt das aufgeschobene Neuzeichnen nach (Felder, in denen getippt wird, bleiben trotzdem unangetastet)
  }
  // Fotos, die nicht geklappt haben, bleiben (nur auf diesem Handy) sichtbar – mit „Erneut versuchen“ und „Entfernen“
  const PHOTO_STAGES = { select: "Auswahl fehlgeschlagen", read: "Lesen auf dem Handy fehlgeschlagen", shrink: "Verkleinern fehlgeschlagen",
    upload: "Hochladen zum Server fehlgeschlagen", server: "Server hat das Foto abgelehnt", add: "Eintragen fehlgeschlagen", capture: "Aufnahme fehlgeschlagen" };
  const STAGE_LOG = { select: "Auswahl", read: "Lesen", shrink: "Verkleinern", upload: "Hochladen", server: "Server", add: "Eintragen", capture: "Aufnahme", camera: "Kamera" };
  function photoFailedHTML(qid) {
    const list = toolUI.photoFailed[qid] || [];
    if (!list.length) return "";
    return '<div class="photo-failed">' + list.map((j) => '<div class="pf-item">' + icon("circle-x") + '<div class="pf-text"><strong>' + esc(PHOTO_STAGES[j.err.stage] || "Fehler") + "</strong>" +
      '<div class="small">' + esc(j.err.hint || "") + "</div>" +
      '<details class="small"><summary>Details</summary>Fehler: ' + esc(j.err.name) + (j.err.message ? " – " + esc(j.err.message) : "") +
        "<br>Datei: " + esc(j.name || "ohne Namen") + " · " + esc(j.type || "unbekannter Dateityp") + " · " + fmtSize(j.size || 0) +
        (j.notes && j.notes.length ? "<br>Versuche: " + esc(j.notes.join("; ")) : "") + "</details>" +
      '<div class="pf-btns"><button class="btn btn-small btn-primary" data-tool-ui="photo-retry" data-lid="' + j.lid + '">' +
        (j.err.stage === "read" ? icon("image") + " Noch einmal wählen" : icon("rotate-ccw") + " Erneut versuchen") + "</button>" +
      (j.err.stage === "read" ? '<button class="btn btn-small btn-ghost" data-tool-ui="photo-retry" data-kind="files" data-lid="' + j.lid + '">' + icon("folder-open") + " Aus Dateien</button>" : "") +
      '<button class="btn btn-small btn-ghost" data-tool-ui="photo-drop" data-lid="' + j.lid + '">Entfernen</button></div></div></div>').join("") + "</div>";
  }
  // Für JEDE Auswahl ein frisches Datei-Feld, direkt am <body> (außerhalb aller Bereiche, die neu gezeichnet werden).
  // Grund (Fehlerprotokoll, Android 10): Beim zweiten Auswählen über dasselbe, wiederverwendete Feld waren die Datei-
  // Referenzen ungültig („NotReadableError … permission problems …“). Das Feld wird erst entfernt, wenn alle gewählten
  // Dateien gelesen und verarbeitet sind (oder die Auswahl abgebrochen wurde). Unsichtbar, aber nicht „display:none“
  // (sonst öffnet Safari die Auswahl teils nicht). Die Knöpfe lösen es nur aus.
  function newPhotoInput(kind) {
    const el = document.createElement("input");
    el.type = "file"; el.className = "photo-file"; el.tabIndex = -1;
    // „Aus Dateien wählen“: ohne Bildfilter, damit Android die App „Dateien“ statt der Foto-Auswahl zeigt
    if (kind !== "files") el.accept = "image/*";
    el.dataset.photoInput = kind;
    el.setAttribute("aria-hidden", "true");
    if (kind === "camera") el.setAttribute("capture", "environment");
    document.body.appendChild(el);
    el.addEventListener("change", (ev) => onPhotosChosen(el, ev), { once: true });
    el.addEventListener("cancel", () => { el.remove(); endPicking(); }); // Auswahl abgebrochen
    return el;
  }
  // replace: { lid, at } – „Bild neu auswählen“ nach einem Lesefehler wählt das Bild für genau diesen Platz neu aus
  function choosePhotos(qid, kind, multiple, replace) {
    if (!app.online) { toast(OFFLINE_MSG, true); return; }
    if (toolUI.uploading[qid] || toolUI.reading) { toast("Bitte warten, bis die Fotos hochgeladen sind.", true); return; }
    // Übrig gebliebene, nie benutzte Felder (Auswahl ohne „cancel“-Ereignis abgebrochen) wegräumen
    $$("input[data-photo-input]:not([data-used])").forEach((old) => old.remove());
    const el = newPhotoInput(kind);
    el.multiple = (kind === "gallery" || kind === "files") && !!multiple && !replace;
    toolUI.photoTarget = qid;
    toolUI.photoReplace = replace || null;
    // Synchronisierung und Neuzeichnen pausieren, bis alle Dateien gelesen sind (poll, photoBusy)
    toolUI.picking = { qid, kind, sync: syncMark() };
    // Merken, dass Kamera-App/Galerie offen ist: Lädt die Seite währenddessen neu (Android hat den Browser wegen
    // Speichermangel beendet), wird das beim Start erkannt und ins Fehlerprotokoll geschrieben
    store.set("photoPick", JSON.stringify({ qid, kind, t: Date.now() }));
    el.click();
  }
  // Zähler der Synchronisierung (für das Fehlerprotokoll: lief zwischendurch eine?)
  const syncMark = () => ({ req: app.syncReq || 0, recv: app.syncRecv || 0 });
  function syncSince(m) {
    const req = (app.syncReq || 0) - m.req, recv = (app.syncRecv || 0) - m.recv;
    return req || recv ? "ja (" + req + " Abfrage" + (req === 1 ? "" : "n") + ", " + recv + " neue" + (recv === 1 ? "r" : "") + " Stand/Stände)" : "nein";
  }
  function endPicking() {
    if (!toolUI.picking) return;
    toolUI.picking = null;
    store.set("photoPick", null);
    photoDone();
  }
  // Zurück aus Kamera-App/Galerie ohne Auswahl (ältere Browser kennen „cancel“ nicht): kurz warten, ob noch „change“ kommt
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && toolUI.picking) setTimeout(() => { if (toolUI.picking && !toolUI.uploading[toolUI.picking.qid]) endPicking(); }, 2500);
    if (document.visibilityState === "hidden" && toolUI.cam) stopCamera(); // Kamera sofort freigeben
  });
  window.addEventListener("pagehide", () => { if (toolUI.cam) stopCamera(); });
  function checkPhotoPickReload() {
    let p = null;
    try { p = JSON.parse(store.get("photoPick") || "null"); } catch (e) { p = null; }
    store.set("photoPick", null);
    if (!p || Date.now() - p.t > 15 * 60000) return;
    reportPhotoError({ err: { stage: "select", name: "Seite neu geladen", message: "Während " + (p.kind === "camera" ? "die Kamera" : "die Galerie") +
      " offen war, wurde die Seite neu geladen – vermutlich hat das Handy den Browser wegen Speichermangel beendet." } });
    toast("Die Seite wurde neu geladen, während " + (p.kind === "camera" ? "die Kamera-App" : "die Galerie") + " offen war (zu wenig Speicher?). Bitte nochmal versuchen – " +
      (p.kind === "camera" ? "notfalls Foto mit der Kamera-App machen und „Aus Galerie wählen“." : "notfalls weniger Bilder auf einmal."), true);
  }
  const photoUrl = (id) => "api/photo/" + encodeURIComponent(id) + "?t=" + encodeURIComponent(app.token || "");
  const photoImg = (id, cls) => '<img class="' + (cls || "tool-photo") + '" src="' + photoUrl(id) + '" alt="Foto" decoding="async" onerror="this.classList.add(\'gone\')">';
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const newKey = () => "k" + rand32().toString(36) + rand32().toString(36).slice(0, 4);
  class PhotoError extends Error {
    constructor(stage, name, message, hint) { super(message || name); this.stage = stage; this.errName = name; this.hint = hint || ""; }
  }
  const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(n ? 1 : 0, Math.round(n / 1024)) + " KB");

  // ---- Galerie-Auswahl. Ursache der Lesefehler (Fehlerprotokoll, Android 10): Android entzieht die Leseerlaubnis für
  // gewählte Dateien kurz nach der Auswahl („NotReadableError … permission problems …“) – spätere Versuche mit derselben
  // Datei-Referenz sind zwecklos. Darum startet das Lesen JEDER Datei synchron im change-Event, vor jedem await, jedem
  // Neuzeichnen, jeder Synchronisierung und jedem Zurücksetzen des Feldes (startRead). Bis 15 MB wird die Datei sofort
  // vollständig in den Speicher gelesen; größere werden später direkt aus der Datei verkleinert dekodiert.
  const MEM_READ = 15 * 1024 * 1024;
  const READ_HINT = "Bild konnte gerade nicht gelesen werden. Bitte noch einmal versuchen, über Dateien wählen oder die Kamera nutzen.";
  // Lesen mit Wiederholungen: Die Android-Foto-Auswahl vergibt die Leseerlaubnis manchmal fehlerhaft – zufällig, dasselbe
  // Bild klappt mal und mal nicht (Fehlerprotokoll). Darum: 1. Versuch synchron im change-Event, scheitert er, nach 150,
  // 500 und 1.500 ms erneut – jedes Mal alle Lesewege: arrayBuffer (bis 15 MB ganz in den Speicher, größer nur Dateianfang),
  // createImageBitmap(file), Objekt-URL + <img> (beide zeichnen gleich verkleinert ins Canvas). ways = jeder Weg mit
  // Ergebnis, tries = Anzahl Versuche, okTry = welcher Versuch/Weg geklappt hat (fürs Fehlerprotokoll).
  const READ_RETRIES = [150, 500, 1500];
  function readWhole(f) {
    if (f.size > MEM_READ) return f.slice(0, 256 * 1024).arrayBuffer().then(() => f); // groß: später direkt aus der Datei
    return f.arrayBuffer().then((buf) => {
      if (!buf.byteLength) throw Object.assign(new Error("0 Byte gelesen"), { name: "EmptyRead" });
      return new Blob([buf], { type: f.type || "image/jpeg" });
    });
  }
  function startRead(f) {
    const ways = [];
    if (!f.size) return Promise.resolve({ e: Object.assign(new Error("Die Datei ist leer (0 Byte)"), { name: "EmptyFile" }), ways: ["leer (0 Byte)"], tries: 1 });
    let first, lastErr = null;
    try { first = readWhole(f); } catch (e) { first = Promise.reject(e); } // sofort, noch im change-Event
    const round = async (n, p) => {
      try { const data = await (p || readWhole(f)); ways.push(n + ". arrayBuffer: ok"); return { data, okTry: n + ". Versuch, arrayBuffer" }; } catch (e) {
        ways.push(n + ". arrayBuffer: " + errText(e)); lastErr = lastErr || e;
      }
      for (const [way, fn] of [["createImageBitmap", readViaBitmap], ["Objekt-URL + img", readViaImg]]) {
        try { const small = await fn(f); ways.push(n + ". " + way + ": ok"); return { data: small, small: true, okTry: n + ". Versuch, " + way }; } catch (e2) { ways.push(n + ". " + way + ": " + errText(e2)); }
      }
      return null;
    };
    return (async () => {
      let r = await round(1, first), n = 1;
      while (!r && n <= READ_RETRIES.length) { await pause(READ_RETRIES[n - 1]); n++; r = await round(n); }
      return r ? Object.assign(r, { ways, tries: n }) : { e: lastErr, ways, tries: n };
    })();
  }
  // Bild-Quelle verkleinert (lange Seite ≤ 1.000 px) als JPEG ins Canvas zeichnen; Ergebnis prüfen
  async function drawSmall(src, w, h) {
    const sc = Math.min(1, PHOTO_SIDE / Math.max(w, h)), c = document.createElement("canvas");
    try {
      c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
      c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
      const out = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.82));
      if (!out || out.size < 200 || !(await isJpeg(out))) throw Object.assign(new Error("kein gültiges Bild"), { name: "LeeresBild" });
      return out;
    } finally { c.width = 0; c.height = 0; }
  }
  async function readViaBitmap(f) {
    if (!window.createImageBitmap) throw Object.assign(new Error("fehlt"), { name: "NichtUnterstützt" });
    let bm;
    try { bm = await createImageBitmap(f, { resizeWidth: PHOTO_SIDE, resizeQuality: "high" }); } catch (e) { if (e && e.name === "TypeError") bm = await createImageBitmap(f); else throw e; }
    try { return await drawSmall(bm, bm.width, bm.height); } finally { bm.close(); }
  }
  async function readViaImg(f) {
    const url = URL.createObjectURL(f), img = new Image();
    try {
      img.src = url;
      await img.decode();
      if (!img.naturalWidth) throw Object.assign(new Error("Bild hat keine Größe"), { name: "DecodeError" });
      return await drawSmall(img, img.naturalWidth, img.naturalHeight);
    } finally { img.removeAttribute("src"); URL.revokeObjectURL(url); }
  }
  const SOURCES = { gallery: "Galerie", files: "Dateien", camera: "Kamera-App" };
  const isImageFile = (f) => /^image\//.test(f.type || "") || /\.(jpe?g|png|heic|heif|webp|gif|bmp|avif)$/i.test(f.name || "");
  function onPhotosChosen(el, ev) {
    const qid = toolUI.photoTarget, replace = toolUI.photoReplace, picking = toolUI.picking, kind = el.dataset.photoInput;
    el.dataset.used = "1";
    let files = [];
    try { files = Array.from(el.files || []); } catch (e) {
      reportPhotoError({ err: { stage: "select", name: e.name || "Fehler", message: e.message || "Dateien nicht lesbar" } });
    }
    if (kind === "files") { // nur Bilder übernehmen
      const other = files.filter((f) => !isImageFile(f));
      if (other.length) toast("Nur Bilder – " + other.map((f) => "„" + f.name + "“").join(", ") + (other.length === 1 ? " ist kein Bild." : " sind keine Bilder."), true);
      files = files.filter(isImageFile);
    }
    // SOFORT lesen – noch vor allem anderen (kein await, kein Neuzeichnen, keine Synchronisierung davor)
    const evT = ev && ev.timeStamp ? ev.timeStamp : performance.now(), atChange = syncMark();
    const pick = toolUI.pickNo = (toolUI.pickNo || 0) + 1; // die wievielte Auswahl in dieser Sitzung
    const jobs = files.map((f) => {
      const delay = Math.max(0, Math.round(performance.now() - evT));
      const job = { lid: newKey(), file: f, name: f.name, type: f.type, size: f.size, lastModified: f.lastModified, err: null, notes: [], pick, readDelayMs: delay,
        kind, source: SOURCES[kind] || kind, fromRetry: !!replace };
      job.read = startRead(f).then((r) => {
        job.sync = "Galerie offen: " + (picking && picking.sync ? syncSince(picking.sync) : "?") + "; beim Lesen: " + syncSince(atChange);
        return r;
      });
      return job;
    });
    toolUI.picking = null; toolUI.photoReplace = null;
    store.set("photoPick", null);
    if (!qid || !jobs.length) { el.remove(); photoDone(); return; }
    // Synchronisierung/Neuzeichnen bleiben pausiert, bis alle Dateien gelesen sind
    toolUI.reading = (toolUI.reading || 0) + 1;
    Promise.all(jobs.map((j) => j.read)).then(() => { toolUI.reading--; if (!toolUI.reading) photoDone(); });
    if (toolUI.uploading[qid]) { el.remove(); toast("Bitte warten, bis die Fotos hochgeladen sind.", true); return; }
    if (replace) { // „Erneut versuchen“: altes Fehl-Foto ersetzen, an seinem Platz einfügen
      toolUI.photoFailed[qid] = (toolUI.photoFailed[qid] || []).filter((j) => j.lid !== replace.lid);
      jobs[0].at = replace.at;
    } else {
      const ts = isMem(qid) ? null : toolState(qid), base = ts && ts.draft ? ts.draft.length : 0;
      jobs.forEach((j, i) => { j.slot = base + i; }); // gewünschter Platz, falls das Foto später neu gewählt werden muss
    }
    processPhotos(qid, jobs).finally(() => el.remove()); // Feld erst entfernen, wenn alles gelesen und verarbeitet ist
  }
  async function processPhotos(qid, jobs) {
    const up = toolUI.uploading[qid] = { done: 0, total: jobs.length };
    updatePhotoZone(qid);
    const failed = toolUI.photoFailed[qid] = toolUI.photoFailed[qid] || [];
    let bad = 0;
    for (const job of jobs) { // streng nacheinander, nie parallel
      try {
        await addPhotoJob(qid, job);
      } catch (e) {
        failPhotoJob(qid, job, e);
        bad++;
      }
      up.done++;
      updatePhotoZone(qid);
    }
    delete toolUI.uploading[qid];
    photoDone(qid);
    // Lesefehler: die Auswahl einmal automatisch neu öffnen (für das erste betroffene Bild, an seinem Platz)
    const again = jobs.find((j) => j.err && j.err.stage === "read" && !j.fromRetry && (j.kind === "gallery" || j.kind === "files"));
    if (again) autoReopen(qid, again);
    else if (bad) toast((bad === 1 ? "Ein Foto" : bad + " Fotos") + " nicht hochgeladen – siehe Liste über den Fotos.", true);
  }
  // Ohne frisches Antippen öffnen Browser keine Auswahl. Ist die Berührung noch „frisch“ (Chrome: userActivation), sofort
  // öffnen; sonst ein Fenster mit einem großen Knopf, der die Auswahl direkt öffnet.
  function autoReopen(qid, job) {
    job.fromRetry = true;
    const kind = job.kind === "files" ? "files" : "gallery";
    const go = () => { if (toolUI.photoFailed[qid] && toolUI.photoFailed[qid].indexOf(job) >= 0) choosePhotos(qid, kind, false, { lid: job.lid, at: job.at }); };
    if (navigator.userActivation && navigator.userActivation.isActive) { setTimeout(go, 30); return; }
    const m = openModal(() => '<h2>' + icon("image") + " Noch einmal wählen</h2>" + '<p class="muted">Bild konnte gerade nicht gelesen werden. Bitte noch einmal auswählen.</p>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="ro-no">Später</button><button class="btn btn-primary" id="ro-yes">' +
      icon(kind === "files" ? "folder-open" : "image") + (kind === "files" ? " Dateien öffnen" : " Galerie öffnen") + "</button></div>",
    (el) => {
      $("#ro-no", el).addEventListener("click", () => closeModal());
      $("#ro-yes", el).addEventListener("click", () => { closeModal(); go(); }); // direkt im Antippen → Auswahl öffnet sich
    }, { static: true, stack: true });
    return m;
  }
  // Ein Foto: (gelesen) → verkleinern → hochladen → eintragen. job.small = schon fertig verkleinert (Kamera in der Seite).
  async function addPhotoJob(qid, job) {
    if (!job.data && job.read) {
      const r = await job.read;
      job.read = null;
      job.readWays = r.ways; job.autoTries = Math.max(0, (r.tries || 1) - 1); job.okTry = r.okTry || "";
      if (r.small) job.small = true;
      if (!r.e && r.tries > 1) reportPhotoError(Object.assign({}, job, { err: { stage: "read", name: "Gelesen nach Wiederholung", message: r.okTry } })); // zur Info
      if (r.e) throw new PhotoError("read", r.e.name || "Lesefehler", r.e.message || "",
        r.e.name === "EmptyFile" ? "Liegt das Bild nur in der Cloud? Bitte erst auf dem Handy öffnen (herunterladen) und neu auswählen." : READ_HINT);
      job.data = r.data;
    }
    if (!job.data) throw new PhotoError("read", "Datei nicht mehr verfügbar", "", READ_HINT);
    const small = job.small ? job.data : await shrinkPhoto(job.data, job.notes);
    if (isMem(qid)) { await saveMemory(qid.slice(4), small); job.data = null; job.file = null; return; } // Erinnerungsfoto: dauerhaft
    const id = await uploadPhoto(small);
    const op = { type: "addPhoto", photo: id, key: newKey() };
    if (job.at != null) op.at = job.at;
    if (!toolDo(qid, op, true)) throw new PhotoError("add", "Nicht eingetragen", "Das Foto passt gerade nicht in die Runde (z. B. schon bestätigt oder 20 Fotos).");
    job.data = null; job.file = null; // Speicher freigeben
  }
  function failPhotoJob(qid, job, e) {
    job.err = e instanceof PhotoError ? { stage: e.stage, name: e.errName, message: e.message === e.errName ? "" : e.message, hint: e.hint }
      : { stage: "shrink", name: e.name || "Fehler", message: e.message || "" };
    if (job.err.stage === "read") { job.data = null; job.file = null; if (job.at == null) job.at = job.slot; }
    (toolUI.photoFailed[qid] = toolUI.photoFailed[qid] || []).push(job);
    reportPhotoError(job);
  }
  function retryPhoto(qid, lid, kind) { // bewusst nicht async: die Galerie muss direkt aus dem Antippen heraus öffnen
    const list = toolUI.photoFailed[qid] || [], i = list.findIndex((j) => j.lid === lid);
    if (i < 0 || toolUI.uploading[qid]) return;
    if (!app.online) { toast(OFFLINE_MSG, true); return; }
    const job = list[i];
    if (!job.data && job.err.stage === "capture") { list.splice(i, 1); updatePhotoZone(qid); toast("Bitte einfach nochmal auslösen."); return; }
    if (!job.data) return choosePhotos(qid, kind === "files" ? "files" : "gallery", false, { lid, at: job.at }); // Lesefehler: Bild neu wählen
    list.splice(i, 1);
    job.err = null; job.notes = [];
    return processPhotos(qid, [job]);
  }

  // ---- Kamera direkt in der Seite (getUserMedia): Android beendete den Browser, während die Kamera-App offen war.
  // Live-Vorschau im Hilfsmittel, großer Auslöser, Kamera wechseln, „Fertig“; mehrere Fotos hintereinander. Jedes Foto wird
  // aus dem Videobild direkt in Zielgröße (lange Seite ≤ 1.000 px) aufgenommen, sofort (nacheinander) hochgeladen und
  // erscheint in der Liste. Das Kamera-Element wird einmal gebaut und nach jedem Neuzeichnen wieder in seinen Platz
  // ([data-cam-slot]) gehängt (mountCamera) – das Video läuft dabei weiter. Freigegeben (alle Tracks gestoppt) wird bei
  // „Fertig“, beim Schließen des Hilfsmittels, wenn die Seite in den Hintergrund geht oder der Platz verschwindet.
  // Nur falls getUserMedia fehlt oder abgelehnt wird: Rückfall auf die Kamera-App (toolUI.camFallback).
  function buildCamEl() {
    const el = document.createElement("div");
    el.className = "cam";
    el.innerHTML = '<div class="cam-view"><video playsinline muted autoplay></video><div class="cam-flash"></div>' +
      '<div class="cam-msg">' + icon("camera") + " Kamera wird gestartet …</div><span class=\"cam-count\" hidden></span></div>" +
      '<div class="cam-bar"><button class="btn btn-ghost cam-side" data-cam="switch" aria-label="Kamera wechseln (vorne/hinten)">' + icon("switch-camera") + "</button>" +
      '<button class="cam-shoot" data-cam="shoot" aria-label="Foto aufnehmen"><span></span></button>' +
      '<button class="btn btn-primary cam-side" data-cam="done">' + icon("check") + " Fertig</button></div>" +
      '<p class="cam-status small muted" aria-live="polite"></p>';
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-cam]");
      if (!b) return;
      ev.stopPropagation();
      if (b.dataset.cam === "shoot") shoot(b);
      else if (b.dataset.cam === "switch") switchCamera();
      else if (b.dataset.cam === "done") stopCamera();
    });
    return el;
  }
  function mountCamera() {
    const cam = toolUI.cam;
    if (!cam) return;
    const slot = $('[data-cam-slot="' + cam.qid + '"]');
    if (!slot) { stopCamera(); return; } // Hilfsmittel geschlossen oder andere Phase
    if (cam.el.parentNode !== slot) {
      slot.appendChild(cam.el);
      if (cam.stream && cam.video.paused) cam.video.play().catch(() => {});
    }
  }
  async function openCamera(qid) {
    if (!app.online) { toast(OFFLINE_MSG, true); return; }
    if (toolUI.cam) stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return camFail(qid, Object.assign(new Error("getUserMedia gibt es in diesem Browser nicht (oder Seite ohne https)"), { name: "NichtUnterstützt" }));
    }
    const el = buildCamEl();
    const cam = toolUI.cam = { qid, el, video: $("video", el), facing: "environment", stream: null, shots: 0, pending: 0, queue: Promise.resolve() };
    toolUI.camFallback = null;
    updatePhotoZone(qid);
    try { await startStream(cam); } catch (e) { if (toolUI.cam === cam) { stopCamera(); camFail(qid, e); } }
  }
  async function startStream(cam) {
    stopTracks(cam); // erst die alte Kamera freigeben – viele Handys können nur eine gleichzeitig öffnen
    $(".cam-msg", cam.el).hidden = false;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: cam.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    if (toolUI.cam !== cam) { stream.getTracks().forEach((t) => t.stop()); return; } // inzwischen geschlossen
    cam.stream = stream;
    cam.video.srcObject = stream;
    cam.video.classList.toggle("mirror", cam.facing === "user"); // Selfie-Vorschau gespiegelt, Foto nicht
    await cam.video.play().catch(() => {});
    $(".cam-msg", cam.el).hidden = true;
    if (cam.el.scrollIntoView) cam.el.scrollIntoView({ block: "end", behavior: "smooth" }); // Auslöser sichtbar
  }
  function stopTracks(cam) {
    if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop());
    cam.stream = null;
    if (cam.video) cam.video.srcObject = null;
  }
  function stopCamera() {
    const cam = toolUI.cam;
    if (!cam) return;
    toolUI.cam = null;
    stopTracks(cam);
    cam.el.remove();
    updatePhotoZone(cam.qid);
  }
  async function switchCamera() {
    const cam = toolUI.cam;
    if (!cam) return;
    const before = cam.facing;
    cam.facing = before === "user" ? "environment" : "user";
    try { await startStream(cam); } catch (e) {
      reportPhotoError({ err: { stage: "camera", name: "Kamera nicht verfügbar", message: "Wechsel auf " + (cam.facing === "user" ? "Frontkamera" : "Rückkamera") + ": " + errText(e) } });
      toast("Die andere Kamera lässt sich nicht öffnen.", true);
      cam.facing = before;
      try { await startStream(cam); } catch (e2) { stopCamera(); camFail(cam.qid, e2); }
    }
  }
  // Kamera abgelehnt/nicht verfügbar → ins Fehlerprotokoll, Rückfall auf die Kamera-App
  function camFail(qid, e) {
    const denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError" || e.name === "PermissionDeniedError");
    reportPhotoError({ err: { stage: "camera", name: denied ? "Kamera-Erlaubnis abgelehnt" : "Kamera nicht verfügbar", message: errText(e) } });
    toolUI.camFallback = { text: denied ? "Die Kamera-Erlaubnis wurde abgelehnt. Erlauben geht in den Browser-Einstellungen (Website-Einstellungen → Kamera). Bis dahin über die Kamera-App:"
      : "Die Kamera lässt sich in der Seite nicht öffnen. Stattdessen über die Kamera-App:" };
    updatePhotoZone(qid);
  }
  function camStatus(cam) {
    const n = $(".cam-count", cam.el);
    n.hidden = !cam.shots; n.textContent = cam.shots + (cam.shots === 1 ? " Foto" : " Fotos");
    $(".cam-status", cam.el).textContent = cam.pending ? (cam.pending === 1 ? "1 Foto wird hochgeladen …" : cam.pending + " Fotos werden hochgeladen …") : cam.shots ? "Alle Fotos sind hochgeladen." : "";
  }
  function shoot(btn) {
    const cam = toolUI.cam;
    if (!cam || !cam.stream) return;
    if (!app.online) { toast(OFFLINE_MSG, true); return; }
    const v = cam.video, w = v.videoWidth, h = v.videoHeight, qid = cam.qid;
    const job = { lid: newKey(), name: "Kamera-Foto", type: "image/jpeg", size: 0, err: null, notes: [], small: true };
    if (!w || !h) return failPhotoJob(qid, job, new PhotoError("capture", "Kein Videobild", "Die Kamera liefert noch kein Bild", "Kurz warten und nochmal auslösen.")), updatePhotoZone(qid);
    const sc = Math.min(1, PHOTO_SIDE / Math.max(w, h)), dw = Math.round(w * sc), dh = Math.round(h * sc);
    const c = document.createElement("canvas");
    let blobP;
    try {
      c.width = dw; c.height = dh;
      c.getContext("2d").drawImage(v, 0, 0, dw, dh); // direkt in Zielgröße – nie ein Canvas in voller Auflösung
      blobP = new Promise((r) => c.toBlob(r, "image/jpeg", 0.85)).finally(() => { c.width = 0; c.height = 0; });
    } catch (e) { c.width = 0; c.height = 0; blobP = Promise.reject(e); }
    const fl = $(".cam-flash", cam.el); fl.classList.remove("go"); void fl.offsetWidth; fl.classList.add("go");
    tapFeedback(btn);
    cam.shots++; cam.pending++; camStatus(cam);
    job.name = "Kamera-Foto " + cam.shots;
    cam.queue = cam.queue.then(async () => { // nacheinander hochladen; die Kamera bleibt dabei offen
      try {
        const blob = await blobP.catch((e) => { throw new PhotoError("capture", e.name || "Fehler", e.message || "Bild konnte nicht erzeugt werden", "Bitte nochmal auslösen."); });
        if (!blob || blob.size < 200 || !(await isJpeg(blob))) throw new PhotoError("capture", "LeeresBild", "Aus dem Videobild entstand kein gültiges Foto", "Bitte nochmal auslösen.");
        job.data = blob; job.size = blob.size;
        await addPhotoJob(qid, job);
        rerenderTools(qid); // Foto erscheint sofort in der Liste (die Kamera wird danach wieder eingehängt; beim Erinnerungsfoto geschlossen)
      } catch (e) {
        failPhotoJob(qid, job, e);
        updatePhotoZone(qid);
      } finally {
        cam.pending--; camStatus(cam);
      }
    });
  }

  // ---- Fehlerprotokoll: Jeder Fehler beim Foto-Upload geht an den Server (data/client-errors.log) – mit Gerät/Browser,
  // Schritt, Fehlername, Meldung, Dateityp und -größe. Ohne Netz wird er gemerkt und später nachgeschickt.
  function reportPhotoError(job) {
    const e = job.err;
    const entry = { stage: STAGE_LOG[e.stage] || e.stage, name: e.name || "", message: e.message || "", fileName: job.name || "",
      fileType: job.type || "", fileSize: job.size || 0, attempts: (job.notes || []).join("; "), player: app.name || "",
      pick: job.pick || "", readDelayMs: job.readDelayMs != null ? job.readDelayMs : "", sync: job.sync || "",
      readWays: (job.readWays || []).join("; "), lastModified: job.lastModified ? new Date(job.lastModified).toISOString() : "",
      source: job.source || "", autoTries: job.autoTries != null ? job.autoTries : "", okTry: job.okTry || "",
      detail: [navigator.deviceMemory ? "RAM ~" + navigator.deviceMemory + " GB" : "", screen.width + "×" + screen.height, new Date().toISOString()].filter(Boolean).join(" · ") };
    let q = [];
    try { q = JSON.parse(store.get("errQueue") || "[]"); } catch (x) { q = []; }
    q.push(entry);
    store.set("errQueue", JSON.stringify(q.slice(-20)));
    sendErrors();
  }
  async function sendErrors() {
    if (app.sendingErrors || !app.token) return;
    app.sendingErrors = true;
    try {
      for (;;) {
        let q = [];
        try { q = JSON.parse(store.get("errQueue") || "[]"); } catch (x) { q = []; }
        if (!q.length) break;
        const r = await api("client-error", { method: "POST", body: q[0] }).catch(() => null);
        if (!r || r.status !== 200) break;
        store.set("errQueue", JSON.stringify(q.slice(1)));
      }
    } finally { app.sendingErrors = false; }
  }
  // ---- Fehlerprotokoll allgemein: unerwartete Fehler (window.onerror, unhandledrejection), fehlgeschlagene Server-Anfragen
  // und Synchronisierungsfehler – mit Ort (Seite/Quest/Hilfsmittel), Spieler und Gerät. Derselbe Fehler wird höchstens
  // einmal pro Minute gemeldet; Wiederholungen dazwischen werden gezählt und als „count“ nachgereicht. Der Server fasst
  // gleiche Fehler zusätzlich zusammen (10 min) und behält höchstens 500 Einträge.
  const ERR_WINDOW = 60000;
  const errSeen = {};
  const PAGE_NAMES = { home: "Startseite", shop: "Shop", stats: "Erfolge", log: "Aktivitäten", settings: "Einstellungen", help: "Spielanleitung",
    player: "Spieler", team: "Mitspieler", backup: "Spielstand sichern", errors: "Fehlerprotokoll", photos: "Erinnerungsfotos", end: "Urlaub beenden", sim: "Testspiel", reset: "Reset" };
  function whereNow() {
    const top = app.modals.slice().reverse().find((m) => m.where);
    return "Seite: " + (PAGE_NAMES[app.view] || app.view) + (top ? " · " + top.where : "") + (tour.on ? " · Einführung" : "");
  }
  function reportError(stage, e, extra) {
    try {
      const name = String((e && (e.name || e.errName)) || "Fehler").slice(0, 120);
      const message = String((e && e.message) || (typeof e === "string" ? e : "") || "").slice(0, 400);
      const where = whereNow(), key = [stage, name, message, where].join("|"), now = Date.now();
      const entry = Object.assign({ kind: "general", stage, name, message, where, player: app.name || "",
        stack: e && e.stack ? String(e.stack).split("\n").slice(0, 6).join(" | ").slice(0, 500) : "",
        detail: [navigator.onLine === false ? "Handy offline" : "", navigator.deviceMemory ? "RAM ~" + navigator.deviceMemory + " GB" : "",
          screen.width + "×" + screen.height, new Date().toISOString()].filter(Boolean).join(" · ") }, extra || {});
      const seen = errSeen[key];
      if (seen && now - seen.t < ERR_WINDOW) { // kurz hintereinander: nur zählen, nach Ablauf der Minute nachreichen
        if (!seen.n++) setTimeout(() => { const s = errSeen[key]; if (s && s.n) { queueError(Object.assign(s.entry, { count: s.n })); errSeen[key] = { t: Date.now(), n: 0, entry: s.entry }; } }, ERR_WINDOW - (now - seen.t));
        return;
      }
      errSeen[key] = { t: now, n: 0, entry };
      queueError(Object.assign({}, entry, { count: 1 }));
    } catch (x) { /* Melden darf nie selbst stören */ }
  }
  function queueError(entry) {
    let q = [];
    try { q = JSON.parse(store.get("errQueue") || "[]"); } catch (x) { q = []; }
    const same = q.find((x) => x.kind === "general" && x.stage === entry.stage && x.name === entry.name && x.message === entry.message && x.where === entry.where);
    if (same) same.count = (same.count || 1) + (entry.count || 1); // noch nicht gesendet (offline): zusammenfassen
    else q.push(entry);
    store.set("errQueue", JSON.stringify(q.slice(-30)));
    if (app.online) sendErrors();
  }
  window.addEventListener("error", (ev) => {
    const e = ev.error || { name: "Fehler", message: ev.message };
    reportError("Unerwarteter Fehler", { name: e.name || "Fehler", message: (e.message || ev.message || "") + (ev.filename ? " (" + String(ev.filename).split("/").pop() + ":" + ev.lineno + ")" : ""), stack: e.stack });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev.reason;
    if (r && r.logged) return; // schon als Server-Anfrage gemeldet
    reportError("Unerwarteter Fehler", r instanceof Error ? r : { name: "Promise abgelehnt", message: String(r) });
  });

  // Abmessungen + EXIF-Ausrichtung aus dem Dateianfang (DataView der ersten 256 KB) – ohne das Bild zu dekodieren
  function readImageInfo(v) {
    const n = v.byteLength;
    if (n > 24 && v.getUint32(0) === 0x89504e47) return { w: v.getUint32(16), h: v.getUint32(20), o: 1, t: "png" }; // PNG
    if (n < 4 || v.getUint16(0) !== 0xffd8) return null; // kein JPEG
    let off = 2, o = 1;
    while (off + 4 <= n) {
      if (v.getUint8(off) !== 0xff) { off++; continue; }
      const m = v.getUint8(off + 1);
      if (m === 0xff || m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { off += m === 0xff ? 1 : 2; continue; }
      const len = v.getUint16(off + 2);
      if (m === 0xe1) o = exifOrientation(v, off + 4) || o;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return off + 9 <= n ? { w: v.getUint16(off + 7), h: v.getUint16(off + 5), o, t: "jpeg" } : null;
      }
      if (m === 0xda) break;
      off += 2 + len;
    }
    return null;
  }
  function exifOrientation(v, start) {
    if (start + 14 > v.byteLength || v.getUint32(start) !== 0x45786966) return 0; // "Exif"
    const t = start + 6, le = v.getUint16(t) === 0x4949;
    const ifd = t + v.getUint32(t + 4, le);
    if (ifd + 2 > v.byteLength) return 0;
    for (let i = 0, cnt = v.getUint16(ifd, le); i < cnt; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      if (v.getUint16(e, le) === 0x0112) { const val = v.getUint16(e + 8, le); return val >= 1 && val <= 8 ? val : 0; }
    }
    return 0;
  }
  // Speichersparend verkleinern – direkt aus der Datei, ohne sie in den Speicher zu kopieren. Das Kamerafoto
  // (12–50 Megapixel) wird nie in voller Größe in ein Canvas gezeichnet. Dekodieren: (1) createImageBitmap(file) direkt
  // in Zielgröße, (2) Rückfall Bild-Element mit Objekt-URL (z. B. HEIC/HEIF). Schlägt beides fehl, wird geprüft, ob die
  // Datei überhaupt lesbar ist (→ Fehler „Lesen“, nach Pause erneut), sonst kleiner erneut (→ „Verkleinern“). Jedes
  // Ergebnis wird geprüft (nicht leer, echtes JPEG); sonst automatisch kleiner/mit weniger Qualität. Canvas, Bitmap und
  // Objekt-URL sind kurzlebig, werden sofort freigegeben und nie wiederverwendet.
  const errText = (e) => ((e && e.name) || "Fehler") + (e && e.message ? " (" + String(e.message).slice(0, 80) + ")" : "");
  // Dateianfang lesen (meist aus der Kopie im Speicher). Kein Wiederholen mit derselben Datei-Referenz – zwecklos, wenn
  // Android die Erlaubnis entzogen hat (dann „Erneut versuchen“ = Bild neu wählen).
  async function readHeader(file, notes) {
    if (!file) throw new PhotoError("read", "Datei nicht mehr verfügbar", "", READ_HINT);
    if (!file.size) throw new PhotoError("read", "EmptyFile", "Die Datei ist leer (0 Byte)", "Liegt das Bild nur in der Cloud? Bitte erst auf dem Handy öffnen (herunterladen) und neu auswählen.");
    let buf = null;
    try { buf = await file.slice(0, 256 * 1024).arrayBuffer(); } catch (e) { notes.push("Lesen: " + errText(e)); throw new PhotoError("read", e.name || "Lesefehler", e.message || "", READ_HINT); }
    if (!buf.byteLength) throw new PhotoError("read", "EmptyRead", "0 Byte gelesen", READ_HINT);
    try { return readImageInfo(new DataView(buf)); } catch (e) { return null; } // unbekanntes Format (z. B. HEIC): Größe offen
  }
  // (1) Chrome/Android: ImageDecoder dekodiert ein JPEG direkt verkleinert (Stufen 1/8 … 8/8) – ein 48-Megapixel-Foto
  // braucht so ~3 statt ~190 MB. Die Wunschgröße muss genau eine dieser Stufen sein (sonst Fehler), darum die kleinste
  // Stufe, deren lange Seite noch ≥ der Zielgröße ist; den Rest erledigt das Canvas.
  async function decodePhoto(file, info, width) {
    let src = null, o = 1, lastErr = null;
    if (info && info.t === "jpeg" && window.ImageDecoder) {
      let dec = null;
      try {
        const ow = info.o >= 5 ? info.h : info.w, big = Math.max(info.w, info.h), side = width * big / ow;
        let n = 1;
        while (n < 8 && Math.ceil(big * n / 8) < side) n++;
        dec = new ImageDecoder({ data: file.stream(), type: "image/jpeg", desiredWidth: Math.ceil(info.w * n / 8), desiredHeight: Math.ceil(info.h * n / 8) });
        const frame = (await dec.decode()).image;
        // Neuere Chrome-Versionen drehen beim Zeichnen selbst (VideoFrame mit „rotation“), ältere nicht → selbst drehen
        return { src: frame, o: "rotation" in frame ? 1 : info.o, url: null, dec };
      } catch (e) { lastErr = e; if (dec) dec.close(); }
    }
    // (2) createImageBitmap direkt in Zielgröße
    if (window.createImageBitmap) {
      try { src = await createImageBitmap(file, { resizeWidth: width, resizeQuality: "high" }); } catch (e) { src = null; lastErr = e; }
      if (src && info) {
        const turned = info.w !== info.h && (src.width > src.height) !== (info.w > info.h); // Browser hat 90° gedreht
        o = info.o >= 5 ? (turned ? 1 : info.o) : 1; // Spiegeln/180° wendet jeder aktuelle Browser selbst an
      }
    }
    if (src) return { src, o, url: null };
    const url = URL.createObjectURL(file), img = new Image(); // Rückfall: Bild-Element (Browser dreht selbst)
    img.src = url;
    try {
      if (img.decode) await img.decode();
      else await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
      if (!img.naturalWidth) throw new Error("Bild hat keine Größe");
      return { src: img, o: 1, url };
    } catch (e) {
      img.removeAttribute("src"); URL.revokeObjectURL(url);
      const err = new Error((lastErr && lastErr.message) || e.message || "");
      err.name = (lastErr && lastErr.name) || e.name || "DecodeError";
      throw err;
    }
  }
  async function shrinkPhoto(file, notes) {
    notes = notes || [];
    let info = await readHeader(file, notes);
    const ow = info ? (info.o >= 5 ? info.h : info.w) : 0;
    let width = info ? Math.max(1, Math.round(ow * Math.min(1, PHOTO_SIDE / Math.max(info.w, info.h)))) : PHOTO_SIDE;
    let lastErr = null;
    for (let round = 1; round <= 3; round++) {
      let d = null;
      try { d = await decodePhoto(file, info, width); } catch (e) {
        lastErr = e; notes.push("Öffnen " + round + ": " + errText(e));
        await pause(500 * round);
        info = await readHeader(file, notes); // nicht lesbar → Fehler „Lesen“ (mit eigenen Wiederholungen)
        width = Math.max(300, Math.round(width * 0.7)); // lesbar, aber nicht zu öffnen (Speicher?) → kleiner erneut
        continue;
      }
      try {
        const sw = d.src.displayWidth || d.src.naturalWidth || d.src.width, sh = d.src.displayHeight || d.src.naturalHeight || d.src.height;
        const o = d.o, ow2 = o >= 5 ? sh : sw, oh2 = o >= 5 ? sw : sh;
        let side = PHOTO_SIDE, q = 0.82;
        for (let k = 0; k < 8; k++) {
          const sc = Math.min(1, side / Math.max(ow2, oh2));
          const dw = Math.max(1, Math.round(ow2 * sc)), dh = Math.max(1, Math.round(oh2 * sc));
          const c = document.createElement("canvas");
          let out = null;
          try {
            c.width = dw; c.height = dh;
            const ctx = c.getContext("2d");
            if (!ctx) throw new Error("kein Canvas");
            if (o === 2) ctx.transform(-1, 0, 0, 1, dw, 0);
            else if (o === 3) ctx.transform(-1, 0, 0, -1, dw, dh);
            else if (o === 4) ctx.transform(1, 0, 0, -1, 0, dh);
            else if (o === 5) ctx.transform(0, 1, 1, 0, 0, 0);
            else if (o === 6) ctx.transform(0, 1, -1, 0, dw, 0);
            else if (o === 7) ctx.transform(0, -1, -1, 0, dw, dh);
            else if (o === 8) ctx.transform(0, -1, 1, 0, 0, dh);
            ctx.drawImage(d.src, 0, 0, o >= 5 ? dh : dw, o >= 5 ? dw : dh);
            out = await new Promise((r) => c.toBlob(r, "image/jpeg", q));
          } catch (e) { out = null; lastErr = e; } finally { c.width = 0; c.height = 0; } // sofort freigeben
          if (out && out.size > 200 && (await isJpeg(out))) {
            if (out.size < PHOTO_BYTES) return out;
            q = q > 0.55 ? q - 0.12 : q; if (q <= 0.55) side = Math.round(side * 0.8);
          } else { // leer/kaputt (z. B. Speicherknappheit): kleiner und mit weniger Qualität erneut
            notes.push("JPEG " + (k + 1) + ": " + (out ? "ungültig" : "leer"));
            side = Math.round(side * 0.7); q = Math.max(0.5, q - 0.1);
            await pause(150);
          }
        }
      } finally {
        if (d.src.close) d.src.close();
        if (d.dec) d.dec.close();
        if (d.url) { d.src.removeAttribute("src"); URL.revokeObjectURL(d.url); }
      }
      width = Math.max(300, Math.round(width / 2));
    }
    throw new PhotoError("shrink", (lastErr && lastErr.name) || "LeeresErgebnis",
      (lastErr && lastErr.message) || "Beim Verkleinern entstand kein gültiges Bild", "Das Bild ließ sich nicht öffnen oder verkleinern (Format nicht unterstützt oder zu wenig Speicher?). Bitte „Erneut versuchen“ oder ein anderes Foto.");
  }
  async function isJpeg(b) {
    const h = new Uint8Array(await b.slice(0, 3).arrayBuffer());
    return h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
  }
  // Hochladen mit bis zu 3 Versuchen (Netz weg, Server kurz nicht erreichbar); Ablehnungen (4xx) nicht wiederholen
  async function uploadPhoto(blob, url) { // url: anderes Ziel (Erinnerungsfoto) – liefert dann die Antwort statt der ID
    let last = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let res = null;
      try {
        res = await fetch(url || "api/photo", { method: "POST", headers: { "Content-Type": "image/jpeg", Authorization: "Bearer " + app.token }, body: blob, cache: "no-store" });
      } catch (e) { last = new PhotoError("upload", e.name || "NetworkError", "keine Verbindung zum Server", "Bitte Netz prüfen und „Erneut versuchen“."); await pause(600 * attempt); continue; }
      const data = await res.json().catch(() => null);
      if (res.ok && data && (url || data.id)) return url ? data : data.id;
      if (res.status < 500) { last = new PhotoError("server", "HTTP " + res.status, (data && data.error) || "abgelehnt"); break; }
      last = new PhotoError("upload", "HTTP " + res.status, (data && data.error) || "Server-Fehler", "Bitte gleich „Erneut versuchen“.");
      await pause(600 * attempt);
    }
    if (last && last.stage === "upload" && !/^HTTP/.test(last.errName)) setOnline(false);
    throw last;
  }

  // ---- Rückmeldung auf Android und iPhone: Vibration gibt es nur auf Android (Chrome). Ersatz auf dem iPhone:
  // kurzer Ton (Audio wird beim ersten Antippen freigeschaltet, wie Safari es verlangt) bzw. sichtbares Aufblinken.
  let audioCtx = null;
  document.addEventListener("pointerdown", () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!audioCtx && AC) { try { audioCtx = new AC(); } catch (e) { audioCtx = null; } }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  }, true);
  function beep(times) {
    if (!audioCtx) return;
    for (let i = 0; i < times; i++) {
      const t0 = audioCtx.currentTime + i * 0.28, osc = audioCtx.createOscillator(), g = audioCtx.createGain();
      osc.frequency.value = 880; g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      osc.connect(g); g.connect(audioCtx.destination); osc.start(t0); osc.stop(t0 + 0.22);
    }
  }
  function signalEnd() { if (navigator.vibrate) navigator.vibrate([250, 120, 250]); else beep(2); }
  // Timer der Stapel-Quests: Ton und, wo möglich, Vibration (iPhone: nur Ton)
  function signalTimer() { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]); beep(3); }
  function tapFeedback(el) {
    if (navigator.vibrate) { navigator.vibrate(15); return; }
    if (el && el.animate) el.animate([{ transform: "scale(.96)" }, { transform: "scale(1)" }], { duration: 160 }); // iPhone: sichtbar
  }

  // Zufallszahl 0 … 2^32−1 aus dem sicheren Zufallsgenerator (für T.shuffle, siehe Zufallsregel)
  function rand32() { return crypto.getRandomValues(new Uint32Array(1))[0]; }

  function choiceBody(qid, cfg, ts) {
    if (ts.ok) {
      return tResult(true, critMarks(ts) + " – der Lorbeerwald erfüllt genau diese beiden Kriterien.") +
        T.UNESCO_CRITERIA.filter((c) => cfg.solution.indexOf(c.id) >= 0).map((c) => '<div class="crit on static"><span class="crit-id">(' + c.id + ")</span><span>" + esc(c.text) + "</span></div>").join("") +
        tBtn("newRound", icon("rotate-ccw") + " Zurücksetzen", "btn-ghost btn-block");
    }
    const sel = toolUI.pick[qid] || [];
    return (ts.lastMiss ? '<p class="small">Letzter Versuch: ' + critMarks(ts.lastMiss) + "</p>" : "") +
      '<p class="tool-label">Welche ' + cfg.pick + " Kriterien erfüllt der Lorbeerwald? Genau " + cfg.pick + " antippen. Ist die Auswahl falsch, startet automatisch die Strafzeit (" + cfg.penalty + " Minuten).</p>" +
      '<div class="crit-list">' + T.UNESCO_CRITERIA.map((c) => '<button class="crit' + (sel.indexOf(c.id) >= 0 ? " on" : "") + '" data-tool-ui="crit" data-id="' + c.id + '" aria-pressed="' + (sel.indexOf(c.id) >= 0) + '">' +
        '<span class="crit-id">(' + c.id + ")</span><span>" + esc(c.text) + "</span></button>").join("") + "</div>" +
      tBtn("fix", icon("lock") + " Auswahl bestätigen (" + sel.length + " von " + cfg.pick + ")", "btn-primary btn-block", sel.length === cfg.pick ? "" : " disabled");
  }

  // „(x) richtig, (ii) falsch“ – bewertet nur die gewählten Kriterien
  function critMarks(r) {
    return r.picks.map((c, i) => {
      const ok = r.marks ? r.marks[i] : null;
      return '<span class="mark-chip' + (ok === true ? " ok" : ok === false ? " miss" : "") + '">(' + esc(c) + ")" + (ok == null ? "" : ok ? " richtig" : " falsch") + "</span>";
    }).join(" ");
  }

  // Die 3 Mitspieler (Einstellungen → Mitspieler, für alle Handys gleich) – alle Hilfsmittel nehmen diese Namen.
  // So geht alles auch mit nur einem Handy; niemand muss sich extra anmelden.
  function teamNames() {
    return ((app.team && app.team.names) || []).map((n) => String(n || "").trim()).filter(Boolean);
  }
  // Hinweis im Hilfsmittel, wenn noch Namen fehlen
  const teamHint = (need) => '<p class="tool-warn">' + icon("users") + " Es fehlen noch Namen – bitte " + need + " Mitspieler eintragen.</p>" +
    '<button class="btn btn-ghost btn-block" data-tool-ui="team-open">' + icon("users") + " Mitspieler eintragen</button>";

  // Hilfsmittel und ihre Zeilen neu zeichnen, ohne halb getippte Eingaben zu verlieren
  function rerenderTools(qid) {
    if (toolUI.dragging) return;
    // Während Fotos ausgewählt/verarbeitet werden: nur die Foto-Zone aktualisieren, den Rest danach nachholen (photoDone)
    if (photoBusy(qid)) { toolUI.refreshPending = true; Object.keys(toolUI.uploading).forEach(updatePhotoZone); return; }
    $$("[data-open-tool" + (qid ? '="' + qid + '"' : "") + "]").forEach((b) => { b.innerHTML = toolLineInner(b.dataset.openTool); });
    $$(".tool[data-tool" + (qid ? '="' + qid + '"' : "") + "]").forEach((t) => {
      const body = $(".tool-body", t);
      if (!body) return;
      // Regel: Ein Feld, in dem gerade getippt wird, nie ersetzen (sonst schließt sich die Tastatur) – später nachholen
      if (typingIn(body)) { toolUI.refreshPending = true; return; }
      const kept = {};
      let focus = null;
      $$("[data-keep]", body).forEach((i) => { kept[i.dataset.keep] = i.value; if (i === document.activeElement) focus = i.dataset.keep; });
      body.innerHTML = toolBody(t.dataset.tool);
      $$(".sort-list", body).forEach(bindSort);
      $$("[data-keep]", body).forEach((i) => { if (kept[i.dataset.keep] != null) i.value = kept[i.dataset.keep]; if (focus === i.dataset.keep) i.focus(); });
    });
    mountCamera(); mountDraw(); mountBayZoom();
  }

  function bindTools(el) {
    $$("[data-open-tool]", el).forEach((b) => b.addEventListener("click", () => openTool(b.dataset.openTool)));
    $$(".tool[data-tool]", el).forEach((t) => {
      t.addEventListener("click", onToolClick);
      t.addEventListener("input", onToolInput);
      t.addEventListener("keydown", (ev) => { if ((ev.key === "Backspace" || ev.keyCode === 8) && ev.target.classList) backLetter(t, ev.target, ev); });
      t.addEventListener("beforeinput", (ev) => { if (ev.inputType === "deleteContentBackward" && ev.target.classList) backLetter(t, ev.target, ev); }); // Android-Tastaturen
      // Inhalt beim Antippen markieren (Tippen ersetzt dann den Buchstaben) – nur, wenn das Feld noch aktiv ist:
      // select() holt sonst den Fokus zurück und der Cursor springt beim schnellen Tippen in ein früheres Feld
      t.addEventListener("focusin", (ev) => {
        const f = ev.target;
        if (f.classList && f.classList.contains("letter-input")) setTimeout(() => { if (document.activeElement === f) { try { f.select(); } catch (e) { /* egal */ } } }, 0);
      });
      bindPeekHold(t);
    });
    $$(".sort-list", el).forEach(bindSort);
    mountCamera(); // Kamera-Vorschau nach dem Neuzeichnen wieder einhängen
    mountDraw();   // Zeichenfläche ebenso
    mountBayZoom(); // Buchten-Karte: Zoom-Steuerung neu anbinden (Zoom bleibt)
  }

  // „Anzeigen“ nur durch langes Drücken (0,6 s) – blendet das Geheimnis 5 s lang auf diesem Handy ein
  function bindPeekHold(t) {
    let timer = null;
    const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };
    t.addEventListener("pointerdown", (ev) => {
      const b = ev.target.closest("[data-peek-hold]");
      if (!b) return;
      stop();
      b.classList.add("holding");
      timer = setTimeout(() => {
        timer = null;
        toolUI.peek[t.dataset.tool] = serverNow() + 5000;
        if (navigator.vibrate) navigator.vibrate(30); // iPhone: der Knopf zeigt das Halten sichtbar an (.holding)
        rerenderTools(t.dataset.tool);
      }, 600);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((e) => t.addEventListener(e, (ev) => {
      const b = ev.target.closest && ev.target.closest("[data-peek-hold]");
      if (b) b.classList.remove("holding");
      if (timer && e === "pointerup" && b) toast("Zum Anzeigen etwas länger gedrückt halten.");
      stop();
    }));
    t.addEventListener("contextmenu", (ev) => { if (ev.target.closest("[data-peek-hold]")) ev.preventDefault(); });
  }

  // ---- Eingabefelder (Regel für alle Hilfsmittel): Während getippt wird, wird kein Feld ersetzt – sonst schließt sich
  // die Tastatur. Gespeichert wird verzögert (500 ms nach der letzten Eingabe), beim Verlassen der Felder oder beim
  // Bestätigen; aufgeschobenes Neuzeichnen wird danach nachgeholt (focusout in openTool).
  const typingIn = (el) => {
    const a = document.activeElement;
    return !!(a && el && el.contains(a) && a.matches("input, textarea") && a.type !== "file");
  };
  const letterSave = {};
  function queueLetter(qid, i, v) {
    const ls = letterSave[qid] || (letterSave[qid] = { vals: {}, timer: null });
    ls.vals[i] = v;
    clearTimeout(ls.timer);
    ls.timer = setTimeout(() => flushLetters(qid), 500);
  }
  function flushLetters(qid) {
    const ls = letterSave[qid];
    if (!ls) return;
    clearTimeout(ls.timer);
    delete letterSave[qid];
    Object.keys(ls.vals).forEach((i) => toolDo(qid, { type: "setLetter", i: +i, letter: ls.vals[i] }, true));
  }
  // Buchstaben-Felder: genau ein Buchstabe; danach springt der Cursor ins nächste Feld (Tastatur bleibt offen).
  // Löschtaste im leeren Feld: zurück ins vorherige Feld und dort löschen (gehalten: Feld für Feld rückwärts).
  function letterFields(t) { return $$(".letter-input", t); }
  function moveLetter(t, inp, d) {
    const all = letterFields(t), n = all[all.indexOf(inp) + d];
    if (n) { n.focus(); try { n.select(); } catch (e) { /* egal */ } }
    return n || null;
  }
  function setLetterField(t, inp, v) {
    inp.value = v;
    inp.dataset.prev = v;
    if (inp.dataset.letter != null) queueLetter(t.dataset.tool, +inp.dataset.letter, v); // Entwurf der Eingabe (geteilt)
  }
  function onToolInput(ev) {
    const inp = ev.target, t = inp.closest(".tool");
    if (!t || !inp.classList.contains("letter-input")) return;
    const prev = inp.dataset.prev || "";
    let v = inp.value.replace(/\s/g, "");
    if (v.length > 1) { // in ein volles Feld getippt: der neue Buchstabe zählt
      const at = prev ? v.indexOf(prev) : -1;
      v = (at >= 0 ? v.slice(0, at) + v.slice(at + prev.length) : v).slice(-1);
    }
    const l = v ? T.letter(v) : "";
    if (l == null) { inp.value = prev; toast("Bitte genau einen Buchstaben (A–Z, Ä, Ö, Ü oder ß).", true); return; }
    setLetterField(t, inp, l);
    if (l) moveLetter(t, inp, 1);
  }
  function backLetter(t, inp, ev) {
    if (!inp.classList.contains("letter-input") || inp.value) return false;
    if (ev) ev.preventDefault();
    const p = moveLetter(t, inp, -1);
    if (p) setLetterField(t, p, "");
    return true;
  }

  function onToolClick(ev) {
    const b = ev.target.closest("[data-tool-act], [data-tool-ui]");
    const t = ev.target.closest(".tool");
    if (!b || !t || b.disabled) return;
    const qid = t.dataset.tool;
    const input = (key) => $('[data-keep="' + qid + ":" + key + '"]', t);
    const ui = b.dataset.toolUi;
    if (ui === "compass-on") return enableCompass();
    if (ui === "team-open") { closeAll(); return go("team"); }
    if (ui === "handoff-ok") { delete toolUI.handoff[qid]; return rerenderTools(qid); }
    if (ui === "peek-off") { toolUI.peek[qid] = 0; return rerenderTools(qid); }
    if (ui === "mem-replace") { toolUI.memReplace[qid.slice(4)] = true; return rerenderTools(qid); }
    if (ui === "mem-cancel") { delete toolUI.memReplace[qid.slice(4)]; if (toolUI.cam && toolUI.cam.qid === qid) stopCamera(); return rerenderTools(qid); }
    if (ui === "mem-delete") return deleteMemory(qid.slice(4));
    if (ui === "cam-open") return openCamera(qid);
    if (ui === "photo-camera") return choosePhotos(qid, "camera");
    if (ui === "photo-retry") return retryPhoto(qid, b.dataset.lid, b.dataset.kind);
    if (ui === "photo-files") return choosePhotos(qid, "files", b.hasAttribute("data-multiple"));
    if (ui === "photo-drop") { toolUI.photoFailed[qid] = (toolUI.photoFailed[qid] || []).filter((j) => j.lid !== b.dataset.lid); return rerenderTools(qid); }
    if (ui === "photo-gallery") return choosePhotos(qid, "gallery", b.hasAttribute("data-multiple"));
    if (ui === "mv") {
      const sync = b.hasAttribute("data-sync");
      const o = sync ? (toolState(qid).guessOrder || []).slice() : toolUI.order[b.dataset.key], i = +b.dataset.i, j = i + +b.dataset.d;
      if (!o || j < 0 || j >= o.length) return;
      [o[i], o[j]] = [o[j], o[i]];
      if (sync) toolDo(qid, { type: "arrange", order: o }); else rerenderTools(qid);
      return;
    }
    if (ui === "crit") {
      const sel = toolUI.pick[qid] = toolUI.pick[qid] || [], i = sel.indexOf(b.dataset.id);
      if (i >= 0) sel.splice(i, 1); else if (sel.length < tcfg(qid).pick) sel.push(b.dataset.id); else toast("Genau " + tcfg(qid).pick + " – erst eines abwählen.", true);
      return rerenderTools(qid);
    }
    if (ui === "bay" || ui === "baymap") { // Bucht gesucht: Bucht antippen (Knopf, Nummer oder die Bucht selbst auf der Karte)
      const sel = puzzleSel(qid, toolState(qid));
      if (ui === "bay") sel.bay = b.dataset.bay;
      else {
        const q = bayClientToMap(b.closest("[data-bay-zoom]"), ev.clientX, ev.clientY);
        const best = q && bayAt(q[0], q[1]);
        if (best) sel.bay = best.id;
      }
      return rerenderTools(qid);
    }
    if (ui === "alt-measure") return measureAlt(qid);
    if (ui === "bay-reset") { const w = b.closest(".bay-zoom-row").previousElementSibling; if (w && w._pz) w._pz.reset(); return; }
    if (ui === "bay-ref") { const d = toolUI.draw; if (d) d.showRef = !d.showRef; return rerenderTools(qid); }
    if (ui === "draw-here") {
      return confirmBox("Hier zeichnen?", "Dann erscheint die geheime Bucht auf diesem Handy. Nur für die Person, die zeichnet.", "Hier zeichnen").then((ok) => {
        if (!ok) return;
        const d = drawState(qid, toolState(qid)); d.here = true; saveDraw(d); rerenderTools(qid);
      });
    }
    if (ui === "cell" || ui === "pick" || ui === "name") { // Foto-Rätsel: Auswahl nur auf diesem Handy bis „Bestätigen“
      const sel = puzzleSel(qid, toolState(qid));
      if (ui === "cell") sel.cell = +b.dataset.cell;
      else if (ui === "pick") { if (b.dataset.key) sel.key = b.dataset.key; else sel.i = +b.dataset.i; }
      else {
        const k = b.dataset.key, n = b.dataset.name;
        if (sel.names[k] === n) delete sel.names[k];
        else { Object.keys(sel.names).forEach((o) => { if (sel.names[o] === n) delete sel.names[o]; }); sel.names[k] = n; } // jeder Name nur einmal
      }
      tapFeedback(b);
      return rerenderTools(qid);
    }
    if (ui === "ttt-pick") {
      const sel = toolUI.ttt.sel, n = b.dataset.name, i = sel.indexOf(n);
      if (i >= 0) sel.splice(i, 1); else if (sel.length < 2) sel.push(n); else toast("Es spielen nur zwei – erst jemanden abwählen.", true);
      return rerenderTools(qid);
    }
    const act = b.dataset.toolAct;
    const op = { type: act };
    const kind = tcfg(qid).kind;
    flushLetters(qid); // gemerkte Buchstaben zuerst speichern (Bestätigen, Verschieben, Löschen …)
    let clear = null;
    // Eingaben der geheimen Hilfsmittel und der Auswahl
    const texts = (prefix, n) => { const v = [], els = []; for (let i = 0; i < n; i++) { const el = input(prefix + i); els.push(el); v.push(el ? el.value.trim() : ""); } return { v, els }; };
    let clearAll = null;
    if (kind === "secretTerms" && act === "fix") { const t = texts("t", tcfg(qid).count); op.terms = t.v; clearAll = t.els; }
    else if (kind === "secretRank" && act === "setFruits") { const t = texts("f", tcfg(qid).count); op.fruits = t.v; clearAll = t.els; }
    else if (kind === "secretRank" && act === "fix") {
      op.order = (toolUI.order[b.dataset.key] || []).slice();
      op.start = T.shuffle(toolState(qid).fruits || [], rand32); // zufällige Startreihenfolge für die Ratenden
    }
    else if (kind === "photoWord" && act === "guess") op.letters = texts("g", toolState(qid).letters || 0).v;
    else if (kind === "photoWord" && (act === "movePhoto" || act === "removePhoto")) { op.i = Number(b.dataset.i); op.d = Number(b.dataset.d || 0); }
    else if (kind === "photoWord" && act === "duplicate") { op.i = Number(b.dataset.i); op.key = newKey(); }
    else if (kind === "secretTerms" && act === "mark") op.i = Number(b.dataset.i);
    else if (kind === "secretTerms" && act === "tip") op.d = Number(b.dataset.d);
    else if (kind === "choice" && act === "fix") op.picks = (toolUI.pick[qid] || []).slice();
    else if (T.isPhotoPuzzle(tcfg(qid)) && act === "removePhoto") op.i = Number(b.dataset.i);
    else if (kind === "drawBay" && act === "start") { const ch = T.bayChoices(tcfg(qid), toolState(qid)); op.bay = ch[T.randomInt(ch.length, rand32)]; } // gleichverteilt
    else if (kind === "drawBay" && act === "fix") { const d = toolUI.draw; op.drawing = { strokes: d && d.key.indexOf(qid + ":") === 0 ? d.strokes : [] }; }
    else if (kind === "drawBay" && act === "guess") op.bay = puzzleSel(qid, toolState(qid)).bay;
    else if (T.isPhotoPuzzle(tcfg(qid)) && (act === "fix" || act === "guess")) {
      const ts = toolState(qid), sel = puzzleSel(qid, ts), keys = T.draftEntries(ts.draft).map((d) => d.key);
      if (kind === "photoGrid") op.cell = sel.cell;
      else if (kind === "photoPick" && act === "fix") { op.pick = sel.key; op.order = T.shuffle(keys, rand32); }  // zufällige Reihenfolge, gleichverteilt
      else if (kind === "photoPick") op.i = sel.i;
      else if (act === "fix") { op.names = Object.assign({}, sel.names); op.order = T.shuffle(keys, rand32); op.start = T.shuffle(keys.map((k) => sel.names[k]), rand32); }
    }
    if (clearAll || T.isSecret(tcfg(qid)) || kind === "choice") {
      clearAll = (clearAll || []).filter(Boolean);
      const typed = clearAll.map((el) => el.value);
      clearAll.forEach((el) => { el.value = ""; });
      if (toolDo(qid, op)) {
        if (kind === "choice" && act === "fix") toolUI.pick[qid] = [];
        if (act === "reveal" || act === "newRound") toolUI.peek[qid] = 0;
        // Geheimes bestätigt: auf DIESEM Handy erst „Handy weitergeben“ zeigen (ein Handy für alle); andere Handys wie bisher
        if (act === "fix" && T.isSecret(tcfg(qid)) && T.phase(tcfg(qid), toolState(qid)) === 2) toolUI.handoff[qid] = true;
        if (kind === "drawBay" && act === "start") { const d = drawState(qid, toolState(qid)); d.here = true; saveDraw(d); } // hier wird gezeichnet
        if (kind === "drawBay" && (act === "fix" || act === "newRound") && toolUI.draw) { store.set("draw:" + toolUI.draw.key, null); if (toolUI.draw.el) toolUI.draw.el.remove(); toolUI.draw = null; }
        rerenderTools(qid);
      }
      else clearAll.forEach((el, i) => { el.value = typed[i]; });
      return;
    }
    if (act === "fix" || (act === "measure" && b.hasAttribute("data-manual"))) {
      const key = act === "fix" ? "guess" : "deg";
      const inp = input(key);
      const v = inp ? inp.value.trim() : "";
      if (!v) { toast("Bitte erst eine Zahl eingeben.", true); return; }
      if (act === "measure") { op.deg = Number(v.replace(",", ".")); op.manual = true; if (!isFinite(op.deg)) { toast("Bitte eine Gradzahl eingeben.", true); return; } }
      else op.value = v;
      clear = inp;
    } else if (act === "measure") {
      const h = compassReading();
      if (h == null) { toast("Gerade kommt kein Kompass-Wert – Handy kurz bewegen und nochmal tippen.", true); return; }
      op.deg = h;
    } else if (act === "inc") op.d = Number(b.dataset.d);
    else if (act === "move") op.cell = Number(b.dataset.cell);
    else if (act === "toggle") op.region = b.dataset.reg;
    else if (act === "players") { op.x = toolUI.ttt.sel[0]; op.o = toolUI.ttt.sel[1]; }
    else if (act === "newGame") toolUI.ttt.sel = [];
    // act === "penalty" („Daneben“, wenn Spieler selbst urteilen) startet die Strafzeit sofort – ohne Rückfrage
    const typed = clear ? clear.value : "";
    if (clear) clear.value = ""; // vor dem Neuzeichnen leeren, sonst bleibt die Zahl stehen
    if (!toolDo(qid, op) && clear) clear.value = typed;
    if (act === "inc") tapFeedback(b);
  }

  function toolDo(qid, op, quiet) {
    if (!app.online) { toast(OFFLINE_MSG, true); return false; }
    const now = serverNow();
    try { T.update(tcfg(qid), toolState(qid), op, now, app.name); } catch (e) {
      if (e instanceof T.ToolError) { toast(e.message, true); return false; }
      throw e;
    }
    toolUI.queue.push({ qid, op, now, by: app.name });
    if (!quiet) rerenderTools(qid); // quiet: z. B. Buchstaben beim Tippen – Felder bleiben unangetastet
    flushTools();
    return true;
  }

  // Wartende Eingaben der Hilfsmittel an den Server senden (bei Konflikt auf dem neuen Stand wiederholen)
  async function flushTools() {
    if (toolUI.flushing || !toolUI.queue.length) return;
    if (app.busy) { setTimeout(flushTools, 200); return; }
    toolUI.flushing = app.busy = true;
    const batch = toolUI.queue.slice();
    let failed = "gerade sehr viel los";
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const next = JSON.parse(JSON.stringify(app.state));
        next.tools = next.tools || {};
        batch.forEach((x) => {
          try { next.tools[x.qid] = T.update(tcfg(x.qid), next.tools[x.qid], x.op, x.now, x.by); } catch (e) {
            if (!(e instanceof T.ToolError)) throw e; // sonst: ein anderes Handy war schneller
          }
        });
        let r;
        try { r = await api("state", { method: "POST", body: { baseVersion: app.version, state: next } }); } catch (e) {
          setOnline(false); failed = "keine Verbindung"; break;
        }
        if (r.status >= 500) { setOnline(false); failed = "Server nicht erreichbar"; break; }
        if (r.status === 200) {
          setOnline(true);
          toolUI.queue.splice(0, batch.length);
          receive(r.data.version, next, true);
          return;
        }
        if (r.status === 409) { receive(r.data.version, r.data.state, false); continue; }
        failed = (r.data && r.data.error) || "Fehler";
        break;
      }
      toolUI.queue.splice(0, batch.length);
      reportError("Synchronisierung", { name: "Hilfsmittel nicht gespeichert", message: failed + " (" + batch.map((x) => x.qid + ": " + x.op.type).slice(0, 5).join(", ") + ")" });
      toast("Speichern fehlgeschlagen (" + failed + "). Die Eingabe wurde NICHT übernommen.", true);
      render();
    } finally {
      toolUI.flushing = false;
      app.busy = false;
      if (toolUI.queue.length) setTimeout(flushTools, 0);
    }
  }

  // ---- Kompass (Grüße nach Rio): nur auf diesem Handy, der Wert wird erst beim Tippen gemessen
  async function enableCompass() {
    compass.failed = "";
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) { compass.failed = "none"; rerenderTools(); return; }
    if (typeof DOE.requestPermission === "function") { // iPhone: Erlaubnis nur per Knopfdruck
      try { if ((await DOE.requestPermission()) !== "granted") compass.failed = "denied"; } catch (e) { compass.failed = "denied"; }
      if (compass.failed) { rerenderTools(); return; }
    }
    if (!compass.on) {
      window.addEventListener("ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation", onOrientation);
      compass.on = true;
    }
    rerenderTools();
    setTimeout(() => { if (!compass.last) { compass.failed = "none"; rerenderTools(); } }, 3000);
  }
  function onOrientation(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === "number" && !isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;
    else if ((e.absolute || e.type === "deviceorientationabsolute") && typeof e.alpha === "number") h = (360 - e.alpha) % 360;
    if (h == null) return;
    const first = !compass.last;
    compass.last = Date.now();
    compass.samples.push({ h, t: compass.last });
    if (compass.samples.length > 30) compass.samples.shift();
    if (first) { compass.failed = ""; rerenderTools(); }
  }
  // Mittelwert der Richtungen der letzten Sekunde (kreisförmig gemittelt)
  function compassReading() {
    const recent = compass.samples.filter((s) => Date.now() - s.t < 1200);
    if (!recent.length) return null;
    let x = 0, y = 0;
    recent.forEach((s) => { x += Math.cos(s.h * Math.PI / 180); y += Math.sin(s.h * Math.PI / 180); });
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  // Taktgeber: Countdowns/Stoppuhren weiterzählen; ist eine Zeit abgelaufen, Hilfsmittel neu zeichnen + Signal
  setInterval(() => {
    checkTimers();
    const ticks = $$("[data-tick]"), dues = $$("[data-until]");
    if (!ticks.length && !dues.length) return;
    const now = serverNow();
    ticks.forEach((e) => {
      e.textContent = e.dataset.tick === "down" ? (e.dataset.fmt === "s" ? secs(+e.dataset.end - now) : mmss(+e.dataset.end - now)) : upfmt(now - +e.dataset.start);
    });
    const due = new Set();
    dues.forEach((e) => {
      if (+e.dataset.until > now) return;
      const t = e.closest("[data-tool], [data-open-tool]");
      if (t) due.add(t.dataset.tool || t.dataset.openTool);
    });
    due.forEach((qid) => {
      const ts = toolState(qid), cfg = tcfg(qid);
      const timed = cfg.kind === "countdown" || cfg.kind === "traffic";
      const at = T.hasTimer(cfg) ? T.timerEnd(cfg, ts) : timed ? ts.startedAt : ts.penaltyUntil;
      const key = qid + ":" + at;
      // Signal nur für abgelaufene Countdowns und Strafzeiten (nicht z. B. für „Anzeigen“)
      if (at != null && (timed || at <= now) && !toolUI.signaled.has(key)) {
        toolUI.signaled.add(key);
        if (T.hasTimer(cfg)) signalTimer(); else signalEnd(); // Vibration (Android) bzw. Ton (iPhone) – dazu die Anzeige auf allen Geräten
      }
      rerenderTools(qid);
    });
  }, 200);

  // Timer der offenen Stapel-Quests: Ende auch melden, wenn gerade eine andere Seite offen ist (Ton + Vibration)
  function checkTimers() {
    if (!app.state || !app.state.open) return;
    const now = serverNow();
    app.state.open.forEach((qid) => {
      const cfg = qid && tcfg(qid);
      if (!cfg || !T.hasTimer(cfg)) return;
      const end = T.timerEnd(cfg, toolState(qid)), key = qid + ":" + end;
      if (end == null || end > now || now - end > 60000 || toolUI.signaled.has(key)) return; // nach Neuladen kein alter Alarm
      toolUI.signaled.add(key);
      signalTimer();
      toast("Zeit um: „" + IX.stack[qid].title + "“");
      rerenderTools(qid);
    });
  }

  function openQuest(questId) {
    const q = IX.quests[questId];
    const r = IX.regions[q.region];
    openModal(() => {
      const lvl = sum().levels[r.id];
      return '<div class="modal-head"><div><div class="muted small">Regionale Quest · ' + esc(r.name) + "</div>" + levelPill(lvl) + ' <span class="stars" style="font-size:1rem">' + stars(lvl) + "</span></div>" +
        '<button class="modal-close" data-close aria-label="Schließen">' + icon("x") + '</button></div>' +
        regionQuestHTML(q, true) +
        '<div class="modal-actions"><button class="btn btn-ghost" id="to-region">Alle 3 Quests in ' + esc(r.name) + "</button></div>";
    }, (el) => {
      bindQuestChecks(el);
      $("#to-region", el).addEventListener("click", () => openRegion(r.id));
    }, { where: "Quest: " + q.title });
  }

  // Übersicht über alle 56 Quests – nur zum Ansehen
  function openAllQuests() {
    openModal(() => {
      const s = sum();
      const regionsHTML = C.regions.map((r) => {
        const lvl = s.levels[r.id];
        return '<div class="ov-group"><div class="row between"><h3>' + esc(r.name) + "</h3>" + levelPill(lvl) + "</div>" +
          r.quests.map((q) => regionQuestHTML(q, false, true)).join("") + "</div>";
      }).join("");
      const diffs = [["einfach", "Einfach"], ["mittel", "Mittel"], ["schwer", "Schwer"]];
      const stackHTML = diffs.map(([d, label]) => {
        const qs = C.stackQuests.filter((q) => q.difficulty === d);
        return '<div class="ov-group"><h3>' + label + " · " + L.STACK_POINTS[d] + " Punkte</h3>" + qs.map((q) => {
          const done = app.state.done[q.id];
          const isOpen = app.state.open.indexOf(q.id) >= 0;
          return '<div class="quest"><span class="status ' + (done ? "on" : "") + '" aria-label="' + (done ? "erledigt" : "offen") + '">' + (done ? icon("check") : "") + "</span>" +
            '<div class="quest-body"><h4>' + esc(q.title) + (isOpen && !done ? ' <span class="pill pill-open">gerade offen</span>' : "") + "</h4>" + taskHTML(q) +
            (done ? '<div class="by">' + icon("check") + ' erledigt von ' + esc(done.by) + " · " + when(done.t) + " · +" + L.stackPoints(app.state, C, q.id) + " Punkte</div>" : "") + "</div></div>";
        }).join("") + "</div>";
      }).join("");
      return '<div class="modal-head"><h2>Alle Quests</h2><button class="modal-close" data-close aria-label="Schließen">' + icon("x") + '</button></div>' +
        '<p class="muted small">Nur zum Ansehen. Abgehakt wird über die Inselkarte (Pin oder Region) bzw. bei den 3 offenen Stapel-Quests.</p>' +
        '<div class="ov-jump"><a href="#ov-region">Regionale Quests · ' + s.questsDone + "/30 erledigt</a>" +
        '<a href="#ov-stack">Stapel-Quests · ' + s.doneStack + "/" + C.stackQuests.length + " erledigt</a></div>" +
        '<h2 id="ov-region" class="ov-title">Regionale Quests</h2>' + regionsHTML +
        '<h2 id="ov-stack" class="ov-title">Stapel-Quests</h2>' + stackHTML;
    }, (el) => {
      bindQuestImages(el); // Bilder wie im Quest-Fenster
      $$(".ov-jump a", el).forEach((a) => a.addEventListener("click", (ev) => {
        ev.preventDefault();
        const t = $(a.getAttribute("href"), el);
        if (t) el.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
      }));
    });
  }

  // Regionen-Fenster: nach links/rechts wischen (oder Pfeile) wechselt zur nächsten/vorigen Region (im Kreis, Karten-Reihenfolge).
  // Technik wie beim Wischen zwischen den Hauptseiten: Die Nachbarregionen liegen schon fertig gezeichnet (mit geladenen,
  // vorab dekodierten Bildern) links und rechts neben der aktuellen (3 Ebenen .rg-pane); beim Wischen werden sie nur per
  // transform verschoben (requestAnimationFrame), während des Wischens wird nichts neu gezeichnet. Nach dem Einrasten werden
  // die Ebenen nur umsortiert und die neue, unsichtbare Nachbarregion im Hintergrund gezeichnet.
  function regionPaneHTML(r) {
    const s = sum();
    const lvl = s.levels[r.id];
    const joker = app.state.joker && app.state.joker.region === r.id;
    const next = lvl === 0 ? "Erste Quest: Region erkundet (+100)" : lvl < 3 ? "Nächste Quest: " + L.LEVELS[lvl + 1].name + " (+20)" : "Höchste Stufe erreicht!";
    const i = C.regions.indexOf(r);
    return '<div class="region-nav"><button class="region-step" data-step="-1" aria-label="Vorige Region">' + icon("chevron-left") + "</button>" +
      '<span class="region-dots" aria-label="Region ' + (i + 1) + " von " + C.regions.length + '">' + C.regions.map((x, j) => "<i" + (j === i ? ' class="on"' : "") + ' style="background:' + L.LEVELS[s.levels[x.id]].color + '"></i>').join("") + "</span>" +
      '<button class="region-step" data-step="1" aria-label="Nächste Region">' + icon("chevron-right") + "</button></div>" +
      '<div class="modal-head"><div><h2>' + esc(r.name) + "</h2>" + levelPill(lvl) + " " +
      stars(lvl) +
      (joker ? ' <span class="pill" style="background:var(--ocean)">Region-Joker</span>' : "") +
      '</div><button class="modal-close" data-close aria-label="Schließen">' + icon("x") + '</button></div>' +
      '<p class="muted small">' + next + " · Punkte hier: " + fmt(L.regionPoints(app.state, C, r.id)) + "</p>" +
      r.quests.map((q) => regionQuestHTML(q, true)).join("");
  }
  function openRegion(regionId) {
    let idx = C.regions.indexOf(IX.regions[regionId]);
    const N = C.regions.length, at = (d) => C.regions[(idx + d + N) % N];
    const rg = { panes: {}, dx: 0, raf: 0, sliding: false, g: null, pending: false };
    const bindPane = (p, withClose) => { // withClose: einzeln neu gezeichnete Ebene (sonst bindet openModal das X)
      bindQuestChecks(p);
      if (withClose) $$("[data-close]", p).forEach((b) => b.addEventListener("click", closeModal));
      $$("[data-step]", p).forEach((b) => b.addEventListener("click", () => slide(+b.dataset.step)));
    };
    const m = openModal(() => '<div class="rg-view">' + [-1, 0, 1].map((d) => '<div class="rg-pane" data-off="' + d + '">' + regionPaneHTML(at(d)) + "</div>").join("") + "</div>",
      (el) => {
        rg.panes = {};
        $$(".rg-pane", el).forEach((p) => { rg.panes[+p.dataset.off] = p; bindPane(p); });
        place(0, false);
      }, { where: "Region: " + at(0).name, sheet: () => rg.panes[0] });
    const box = rg.box = $(".modal", m.el);
    box.classList.add("rg-modal");
    place(0, false);
    // Neuzeichnen durch die Synchronisierung: nicht während des Wischens; Scrollposition der aktuellen Region bleibt
    const base = m.refresh;
    m.refresh = () => {
      if (rg.g && rg.g.mode === "h" || rg.sliding) { rg.pending = true; return; }
      const sc = rg.panes[0] ? rg.panes[0].scrollTop : 0;
      base();
      if (rg.panes[0]) rg.panes[0].scrollTop = sc;
    };
    function place(dx, anim) {
      const W = (rg.box && rg.box.clientWidth) || window.innerWidth;
      [-1, 0, 1].forEach((d) => {
        const p = rg.panes[d];
        if (!p) return;
        p.style.transition = anim ? "transform .26s cubic-bezier(.2,.8,.2,1)" : "none";
        p.style.transform = "translate3d(" + (d * W + dx) + "px,0,0)";
      });
    }
    const moveTo = (dx) => { rg.dx = dx; if (!rg.raf) rg.raf = requestAnimationFrame(() => { rg.raf = 0; place(rg.dx, false); }); };
    // Einrasten: nur Ebenen umsortieren; die neue Nachbarregion (unsichtbar) frisch zeichnen
    function slide(d) {
      if (rg.sliding) return;
      rg.sliding = true;
      if (rg.raf) { cancelAnimationFrame(rg.raf); rg.raf = 0; }
      const W = box.clientWidth || window.innerWidth;
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      place(-d * W, !reduce);
      setTimeout(() => {
        idx = (idx + d + N) % N;
        const old = rg.panes;
        rg.panes = { 0: old[d], [-d]: old[0], [d]: old[-d] };
        const fresh = rg.panes[d];
        fresh.innerHTML = regionPaneHTML(at(d));
        bindPane(fresh, true);
        [-1, 0, 1].forEach((k) => { rg.panes[k].dataset.off = k; if (k) rg.panes[k].scrollTop = 0; });
        place(0, false);
        m.where = "Region: " + at(0).name;
        if (toolUI.cam) stopCamera();
        rg.sliding = false;
        if (rg.pending) { rg.pending = false; m.refresh(); }
      }, reduce ? 0 : 270);
    }
    box.addEventListener("touchstart", (e) => {
      rg.g = null;
      if (e.touches.length !== 1 || rg.sliding || app.modals[app.modals.length - 1] !== m || e.target.closest(SHEET_NO)) return;
      const t = e.touches[0];
      rg.g = { x0: t.clientX, y0: t.clientY, mode: "?", hist: [[performance.now(), t.clientX]] };
    }, { passive: true });
    box.addEventListener("touchmove", (e) => {
      const g = rg.g;
      if (!g || e.touches.length !== 1) { if (g && g.mode === "h") end(); rg.g = null; return; }
      const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
      if (g.mode === "?") {
        if (m.lock && m.lock !== "h") { rg.g = null; return; }                                   // schon Ziehen nach unten
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx) * 0.6) { rg.g = null; return; }    // senkrecht: scrollen
        if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 2) return;
        g.mode = "h"; m.lock = "h";
      }
      if (e.cancelable) e.preventDefault();
      g.hist.push([performance.now(), t.clientX]); if (g.hist.length > 6) g.hist.shift();
      moveTo(dx);
    }, { passive: false });
    function end() {
      const g = rg.g; rg.g = null;
      if (!g || g.mode !== "h") return;
      const W = box.clientWidth || window.innerWidth, h = g.hist;
      const v = h.length > 1 ? (h[h.length - 1][1] - h[0][1]) / Math.max(1, h[h.length - 1][0] - h[0][0]) : 0;
      const dx = rg.dx;
      if (Math.abs(dx) > W * 0.25 || (Math.abs(dx) > 50 && Math.abs(v) > 0.35 && Math.sign(v) === Math.sign(dx))) slide(dx < 0 ? 1 : -1);
      else {
        if (rg.raf) { cancelAnimationFrame(rg.raf); rg.raf = 0; }
        place(0, true);
        if (rg.pending) setTimeout(() => { if (!rg.g && !rg.sliding && rg.pending) { rg.pending = false; m.refresh(); } }, 280);
      }
    }
    box.addEventListener("touchend", end);
    box.addEventListener("touchcancel", end);
    const onResize = () => { if (app.modals.indexOf(m) < 0) window.removeEventListener("resize", onResize); else if (!rg.sliding) place(0, false); };
    window.addEventListener("resize", onResize);
  }

  // Stapel-Quest als Fenster (z. B. aus den Aktivitäten): Aufgabe, Status, Hilfsmittel (wenn offen), Erinnerungsfoto (wenn erledigt)
  function openStackQuest(id) {
    const q = IX.stack[id];
    openModal(() => {
      const done = app.state.done[id], isOpen = app.state.open.indexOf(id) >= 0;
      const status = done ? '<div class="by">' + icon("check") + " erledigt von " + esc(done.by) + " · " + when(done.t) + " · +" + L.stackPoints(app.state, C, id) + " Punkte</div>"
        : '<p class="muted small">' + (isOpen ? "Gerade offen – abhaken auf der Startseite bei den Stapel-Quests." : "Liegt verdeckt im Stapel.") + "</p>";
      return '<div class="modal-head"><div><div class="muted small">Stapel-Quest</div><span class="pill diff-' + q.difficulty + '">' + diffLabel(q.difficulty) + "</span></div>" +
        '<button class="modal-close" data-close aria-label="Schließen">' + icon("x") + "</button></div>" +
        "<h2>" + esc(q.title) + "</h2>" + taskHTML(q) + (isOpen && tcfg(id) ? toolHTML(id) : "") + status + (done ? memLine(id) : "");
    }, (el) => {
      bindTools(el);
      $$("[data-mem]", el).forEach((b) => b.addEventListener("click", () => openMemory(b.dataset.mem)));
    }, { where: "Stapel-Quest: " + q.title });
  }

  async function toggleQuest(questId, btn) {
    const done = app.state.quests[questId];
    if (!done) { if (await act({ type: "quest", questId }, { fxFrom: btn })) offerMemory(questId); return; }
    const entry = lastEntry((e) => e.type === "quest" && e.data.questId === questId);
    if (!entry) return;
    if (await confirmBox("Quest rückgängig machen?", "„" + IX.quests[questId].title + "“ wird wieder offen, die Punkte werden abgezogen.", "Rückgängig")) {
      await act({ type: "undo", logId: entry.id });
    }
  }

  function lastEntry(pred) {
    for (let i = app.state.log.length - 1; i >= 0; i--) {
      const e = app.state.log[i];
      if (!e.undone && pred(e)) return e;
    }
    return null;
  }

  // ---- Stapel-Quests
  function diffLabel(d) { return { einfach: "Einfach", mittel: "Mittel", schwer: "Schwer" }[d] || d; }
  function stackQuestHTML(id, s) {
    const q = IX.stack[id];
    const m = app.state.mults[id];
    const base = L.stackBase(C, id);
    const pts = L.stackPoints(app.state, C, id);
    const shopOk = s.balance >= 0;
    return '<div class="squest ' + q.difficulty + '">' +
      '<div class="row between"><span class="pill diff-' + q.difficulty + '">' + diffLabel(q.difficulty) + "</span>" +
      (m ? '<span class="pill mult-badge">' + L.fmtFactor(m.factor) + (m.factor === 5 ? " Jackpot" : "") + "</span>" : "") + "</div>" +
      "<h3>" + esc(q.title) + "</h3>" + taskHTML(q) + (tcfg(id) ? '<div class="stack-tools">' + toolHTML(id) + "</div>" : "") +
      '<div class="pts">' + (m && pts !== base ? "<s>" + base + "</s>" : "") + pts + " Punkte</div>" +
      '<div class="actions">' +
        '<button class="btn btn-good" data-done="' + id + '">' + icon("check") + ' Erledigt</button>' +
        (s.swaps >= L.MAX_SWAPS ? '<button class="btn btn-small btn-ghost" disabled>' + icon("arrow-left-right") + ' Tausch-Limit erreicht</button>' :
          '<button class="btn btn-small btn-ghost" data-swap="' + id + '" ' + (m || !app.state.deck.length || !shopOk ? "disabled" : "") + '>' + icon("arrow-left-right") + ' Tauschen · ' + L.PRICES.swap + "</button>") +
        '<button class="btn btn-small btn-ghost" data-mult="' + id + '" ' + (m || s.multCount >= L.MAX_MULTS || !shopOk ? "disabled" : "") + ">" + icon("sparkles") + " Multiplikator · " + L.PRICES.mult + "</button>" +
      "</div></div>";
  }

  // Die 3 offenen Stapel-Quests als eigener, auffälliger Bereich auf der Startseite
  function stackZone(s) {
    const open = app.state.open.filter(Boolean);
    const quests = open.length ? open.map((id) => stackQuestHTML(id, s)).join("") :
      '<div class="panel empty">' + icon("party-popper") + ' Alle Stapel-Quests erledigt!</div>';
    const done = app.state.log.filter((e) => e.type === "stack" && !e.undone).slice().reverse();
    const doneList = done.map((e) => {
      const id = e.data.questId;
      return '<div class="list-item"><div class="grow"><div class="txt"><strong>' + esc(IX.stack[id].title) + "</strong></div>" +
        '<div class="meta">' + diffLabel(IX.stack[id].difficulty) + " · " + esc(e.by) + " · " + when(e.t) + "</div></div>" +
        '<span class="delta plus">+' + L.stackPoints(app.state, C, id) + "</span>" + memChip(id) +
        '<button class="btn btn-small btn-ghost" data-undo="' + e.id + '" aria-label="Rückgängig">' + icon("undo-2") + '</button></div>';
    }).join("");
    return '<section class="stack-zone" aria-label="Stapel-Quests">' +
      '<div class="zone-head"><div><h2>' + icon("layers") + ' Stapel-Quests</h2>' +
      '<div class="zone-sub">' + open.length + " offen · " + s.deckLeft + " verdeckt im Stapel · " + s.doneStack + " von " + C.stackQuests.length + " erledigt · Joker genutzt: Tausch " + s.swaps + " von " + L.MAX_SWAPS + " · Multiplikator " + s.multCount + " von " + L.MAX_MULTS + "</div>" +
      (s.balance < 0 ? '<div class="zone-warn">Kontostand negativ – Tausch-Joker und Multiplikator gesperrt</div>' : "") +
      '</div><div class="deck-stack" aria-hidden="true"></div></div>' +
      quests +
      (done.length ? '<details class="done-box"><summary>Erledigte Stapel-Quests (' + done.length + ")</summary>" + doneList + "</details>" : "") +
      "</section>";
  }

  async function doSwap(id) {
    if (await confirmBox("Tausch-Joker kaufen?", "Für " + L.PRICES.swap + " Punkte geht „" + IX.stack[id].title + "“ zurück in den Stapel und eine neue Stapel-Quest wird vom Stapel gezogen.", "Tauschen (" + L.PRICES.swap + ")")) {
      if (await act({ type: "swap", questId: id })) {
        const e = lastEntry((x) => x.type === "swap");
        if (e) toast("Neu vom Stapel gezogen: „" + IX.stack[e.data.newId].title + "“");
      }
    }
  }
  async function doMult(id) {
    const base = L.stackBase(C, id);
    if (await confirmBox("Multiplikator kaufen?", "Für " + L.PRICES.mult + " Punkte bekommt „" + IX.stack[id].title + "“ (" + base + " P) einen zufälligen Faktor: ×0,5 bis ×2,0 – mit 5 % Chance Jackpot ×5. Danach kann diese Stapel-Quest nicht mehr getauscht werden." + (base === 15 ? " Tipp: Bei einfachen Stapel-Quests lohnt er sich eher nicht." : ""), "Würfeln (" + L.PRICES.mult + ")")) {
      if (await act({ type: "mult", questId: id })) {
        const m = app.state.mults[id];
        if (m) {
          banner(m.factor === 5 ? icon("zap") + " JACKPOT ×5!" : L.fmtFactor(m.factor), "„" + IX.stack[id].title + "“ ist jetzt " + L.stackPoints(app.state, C, id) + " Punkte wert");
          if (m.factor >= 1.5) confetti(m.factor === 5 ? 160 : 60);
        }
      }
    }
  }

  // ---- Shop
  function viewShop(s) {
    const locked = s.balance < 0;
    const unexplored = C.regions.filter((r) => s.levels[r.id] === 0);
    const jokerUsed = app.state.joker;
    const jokerBody = jokerUsed ?
      '<div class="row"><p class="muted small" style="margin:0;flex:1">Eingesetzt für <strong>' + esc(IX.regions[jokerUsed.region].name) + "</strong> (" + esc(jokerUsed.by) + "). Rückgängig bei den Aktivitäten.</p>" +
        '<button class="btn btn-primary" disabled>Kaufen</button></div>' :
      unexplored.length ?
        '<div class="row"><select id="joker-region">' + unexplored.map((r) => '<option value="' + r.id + '">' + esc(r.name) + "</option>").join("") + "</select>" +
        '<button class="btn btn-primary" id="buy-joker" ' + (locked || s.balance < L.PRICES.joker ? "disabled" : "") + ">Kaufen</button></div>" :
        '<p class="muted small" style="margin:0">Alle Regionen sind schon erkundet.</p>';
    const openBtns = (attr, disabledFn) => app.state.open.filter(Boolean).map((id) =>
      '<button class="btn btn-ghost btn-small" style="justify-content:space-between" ' + attr + '="' + id + '" ' + (disabledFn(id) ? "disabled" : "") + ">" +
      "<span>" + esc(IX.stack[id].title) + "</span><span class='muted'>" + L.stackBase(C, id) + " P" + (app.state.mults[id] ? " · " + L.fmtFactor(app.state.mults[id].factor) : "") + "</span></button>").join("");
    return '' +
      '<div class="panel row between"><div><div class="muted small">Kontostand</div><div class="rank-big" style="color:' + (locked ? "var(--hibiscus)" : "inherit") + '">' + fmt(s.balance) + ' P</div></div>' +
      '<div class="muted small" style="text-align:right">verdient ' + fmt(s.earned) + "<br>ausgegeben " + fmt(s.spent) + "</div></div>" +
      (locked ? '<div class="locked">Der Kontostand ist negativ – der Shop ist gesperrt, bis wieder Punkte reinkommen.</div>' : "") +
      '<p class="muted small">Jeder ausgegebene Punkt fehlt am Ende bei den Belohnungen.</p>' +
      '<div class="panel shop-item"><div class="row between"><h3 style="margin:0">' + icon("compass") + ' Region-Joker <span class="used">· ' + s.jokerUsed + " von 1 genutzt</span></h3><span class=\"price\">" + L.PRICES.joker + " P</span></div>" +
      '<p class="muted small" style="margin:0">Eine Region gilt als erkundet, bringt aber keine 100 Punkte. Sie kann danach normal mit Quests auf Erobert und Erschlossen gebracht werden.</p>' + jokerBody + "</div>" +
      '<div class="panel shop-item"><div class="row between"><h3 style="margin:0">' + icon("arrow-left-right") + ' Tausch-Joker <span class="used">· ' + s.swaps + " von " + L.MAX_SWAPS + " genutzt</span></h3><span class=\"price\">" + L.PRICES.swap + " P</span></div>" +
      '<p class="muted small" style="margin:0">Eine offene Stapel-Quest geht zurück in den Stapel, eine neue wird vom Stapel gezogen.</p>' +
      '<div class="open-pick">' + openBtns("data-swap", (id) => locked || s.swaps >= L.MAX_SWAPS || app.state.mults[id] || !app.state.deck.length) + "</div></div>" +
      '<div class="panel shop-item"><div class="row between"><h3 style="margin:0">' + icon("sparkles") + ' Multiplikator <span class="used">· ' + s.multCount + " von " + L.MAX_MULTS + " genutzt</span></h3><span class=\"price\">" + L.PRICES.mult + " P</span></div>" +
      '<p class="muted small" style="margin:0">Zufälliger Faktor auf eine offene Stapel-Quest: 95 % ×0,5–×2,0, 5 % Jackpot ×5. Ergebnis wird aufgerundet. Lohnt sich vor allem bei schweren Stapel-Quests.</p>' +
      '<div class="open-pick">' + openBtns("data-mult", (id) => locked || app.state.mults[id] || s.multCount >= L.MAX_MULTS) + "</div></div>";
  }

  // ---- Aktivitäten
  function viewLog() {
    const items = app.state.log.slice().reverse().map((e) => {
      const d = e.dE - e.dS;
      // Einträge zu einer Quest: Antippen öffnet die Quest (regional bzw. Stapel-Quest)
      const qid = (e.type === "quest" || e.type === "stack" || e.type === "mult") && e.data ? e.data.questId : null;
      const inner = '<span class="txt">' + esc(e.text) + "</span>" +
        '<span class="meta">' + when(e.t, true) + " · " + esc(e.by) + (e.undone ? " · rückgängig gemacht" : "") + "</span>";
      return '<div class="list-item ' + (e.undone ? "undone" : "") + '">' +
        (qid ? '<button class="grow log-open" data-open-q="' + qid + '" aria-label="Quest öffnen: ' + esc(questTitle(qid)) + '">' + inner + icon("chevron-right", "log-arrow") + "</button>" : '<div class="grow">' + inner + "</div>") +
        (d ? '<span class="delta ' + (d > 0 ? "plus" : "minus") + '">' + signed(d) + "</span>" : "") +
        ((e.type === "quest" || e.type === "stack") && !e.undone && questDone(e.data.questId) ? memChip(e.data.questId) : "") +
        (L.canUndo(e) && !app.state.ended ? '<button class="btn btn-small btn-ghost" data-undo="' + e.id + '" aria-label="Rückgängig">' + icon("undo-2") + '</button>' : "") + "</div>";
    }).join("");
    return '<h2>' + icon("history") + ' Aktivitäten</h2><p class="muted small">Alle Aktionen mit Uhrzeit und Name. Mit ' + icon("undo-2") + ' lässt sich gezielt etwas rückgängig machen – keine Aufgabe bringt je zweimal Punkte.</p>' +
      '<div class="panel">' + (items || '<p class="muted" style="margin:0">Noch nichts passiert. Auf geht\'s!</p>') + "</div>";
  }

  async function undo(logId) {
    const e = app.state.log.find((x) => x.id === logId);
    if (!e) return;
    if (await confirmBox("Rückgängig machen?", e.text, "Rückgängig")) await act({ type: "undo", logId });
  }

  // ---- Erfolge & Einstellungen
  // Fortschrittsbalken in Etappen: Farbe = Farbe der Stufe auf der Inselkarte
  function stageBar(p, label) {
    return '<div class="progress stage" role="progressbar" aria-label="' + esc(label) + ": " + esc(p.text) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(p.pct) + '">' +
      '<div style="width:' + p.pct + "%;background:" + p.color + '"></div></div>';
  }

  function viewStats(s) {
    const kp = L.rankProgress(s.earned, s.maxPoints);
    const ladder = kp.ranks.map((r, i) => '<div class="rl-item' + (i === s.rank ? " current" : "") + (r.reached ? " reached" : "") + '">' +
      rankFigure(i) + '<span class="rl-name">' + (r.reached ? icon("check") + " " : "") + esc(r.name) + "</span></div>").join("");
    const days = L.dayCount(app.state, Date.now());
    const perDay = L.pointsPerDay(app.state, Date.now());
    const lvlCounts = [0, 0, 0, 0];
    C.regions.forEach((r) => lvlCounts[s.levels[r.id]]++);
    return '' +
      '<div class="panel rank-panel"><div class="rank-top"><div class="rank-hero">' + rankFigure(s.rank) + "</div>" +
      '<div><div class="muted small">Team-Rang</div><div class="rank-big">' + esc(s.rankName) + "</div></div></div>" +
      '<div class="small rank-sub">' + fmt(s.earned) + " Punkte verdient · " + esc(kp.text) + "</div>" +
      stageBar(kp, "Teamrang") +
      '<div class="rank-ladder">' + ladder + "</div></div>" +
      regionsSection(s) +
      '<div class="kpis">' +
        kpi(fmt(s.earned), "Punkte verdient") + kpi(fmt(s.balance), "Kontostand") +
        kpi(s.questsDone + " von 30", "Regionale Quests erledigt") + kpi(s.doneStack + " von " + C.stackQuests.length, "Stapel-Quests erledigt") +
        kpi(Math.round(s.earned / s.maxPoints * 100) + " %", "vom Maximum") + kpi(s.bestMult ? L.fmtFactor(s.bestMult) : "–", "bester Multiplikator") +
      "</div>" +
      '<p class="muted small max-line">' + maxText(s) + "</p>" +
      '<div class="section-title"><h3>Punkte pro Tag</h3></div><div class="panel chart">' + barChart(perDay) +
        '<p class="avg-line"><strong>Durchschnitt: ' + fmt(s.earned / days) + " Punkte pro Tag</strong>" +
        '<span class="muted small"> · seit Spielbeginn, ' + days + (days === 1 ? " Tag" : " Tage") + "</span></p></div>" +
      '<div class="section-title"><h3>Woher die Punkte kommen</h3></div><div class="panel">' +
        pieChart([["Regionen & Stufen", s.regionPts, "var(--einfach)"], ["Insel-Bonus", s.madeiraBonus, "var(--medium)"], ["Stapel-Quests", s.stackPts, "var(--hard)"]], "Punkte", true) +
        '<div class="joker-list">' +
          "<div>Joker genutzt:</div>" +
          '<div class="ind">Tausch ' + s.swaps + " von " + L.MAX_SWAPS + "</div>" +
          '<div class="ind">Multiplikator ' + s.multCount + " von " + L.MAX_MULTS + "</div>" +
          '<div class="ind">Region-Joker ' + s.jokerUsed + " von 1</div>" +
          '<div class="spent">Insgesamt ausgegeben: ' + fmt(s.spent) + " P</div>" +
        "</div></div>" +
      '<div class="section-title"><h3>Stufen der Regionen</h3></div><div class="panel">' +
        pieChart(L.LEVELS.map((l, i) => [i === 0 ? "Unbesucht" : l.name, lvlCounts[i], l.color]), "Regionen") +
      "</div>";
  }

  // ---- Einstellungen: Menü; jeder Punkt öffnet eine Unterseite mit „← Einstellungen“ und „Zu den Quests“
  function setRow(page, ic, label, sub, cls) {
    return '<button class="tool-line set-row' + (cls ? " " + cls : "") + '" data-go="' + page + '">' + icon(ic) +
      '<span class="tl-label">' + label + (sub ? '<span class="set-sub">' + sub + "</span>" : "") + "</span>" + icon("chevron-right", "tl-end") + "</button>";
  }
  function viewSettings() {
    return '<h2>' + icon("settings") + " Einstellungen</h2>" +
      '<div class="set-menu">' +
        setRow("help", "circle-help", "Spielanleitung", "Ziel, Quests, Shop, Hilfsmittel, Ränge") +
        setRow("player", "user", "Spieler", "Angemeldet als " + esc(app.name) + " · Name ändern, Abmelden") +
        setRow("team", "users", "Mitspieler", teamNames().length ? teamNames().map(esc).join(" · ") : "3 Namen für die Hilfsmittel") +
        setRow("backup", "download", "Spielstand sichern", "Sichern und wiederherstellen") +
        setRow("photos", "image", "Erinnerungsfotos", memStorage() + " · alle herunterladen") +
        setRow("errors", "bug", "Fehlerprotokoll", "Fehler der App und beim Foto-Upload – zum Weiterschicken") +
        setRow("end", "flag", "Urlaub beenden & Belohnungen", app.state.ended ? "Urlaub beendet – Belohnungen & Zertifikat" : "Restpunkte umtauschen, Zertifikat", "set-end") +
        setRow("sim", "shuffle", "Testspiel simulieren", app.sim && app.sim.active ? "Simulation läuft gerade" : "Zufälliges Testspiel – euer echter Stand wird gesichert") +
      "</div>" +
      '<div class="set-danger">' + setRow("reset", "rotate-ccw", "Kompletter Reset", "Alles auf null – für alle Handys", "set-reset") + "</div>";
  }
  const pageHead = (ic, title) => '<h2>' + icon(ic) + " " + title + "</h2>";
  // Mitspieler: 3 frei bearbeitbare Namen für alle Hilfsmittel (Tic-Tac-Toe, Türen …), synchron auf allen Handys
  function viewTeam() {
    const names = (app.team && app.team.names) || ["", "", ""], draft = app.teamDraft || {};
    return pageHead("users", "Mitspieler") +
      '<div class="panel set-panel">' +
        '<p class="muted small" style="margin:0">Diese 3 Namen nutzen alle Hilfsmittel – auch wenn ihr nur ein Handy habt. Gilt für alle Handys. ' +
          "Leere Plätze füllen sich von selbst, sobald sich jemand mit einem neuen Namen anmeldet.</p>" +
        [0, 1, 2].map((i) => '<label class="tool-label" for="team-' + i + '">Mitspieler ' + (i + 1) + "</label>" +
          '<input class="tool-input team-input" id="team-' + i + '" data-team="' + i + '" maxlength="24" autocomplete="off" value="' + esc(draft[i] != null ? draft[i] : names[i] || "") + '">').join("") +
        '<button class="btn btn-primary btn-block" id="team-save">' + icon("check") + " Speichern</button>" +
        (app.team && !app.team.saved ? '<p class="muted small" style="margin:0">Vorausgefüllt mit bekannten Namen – bitte prüfen und speichern.</p>' : "") +
      "</div>";
  }
  async function saveTeam() {
    const names = [0, 1, 2].map((i) => ($("#team-" + i) || {}).value || "");
    const r = await api("team", { method: "POST", body: { names } }).catch(() => null);
    if (!r || r.status !== 200) { toast((r && r.data && r.data.error) || "Speichern ging nicht (offline?).", true); return; }
    app.team = r.data.team; app.teamDraft = null;
    toast("Mitspieler gespeichert.");
    render();
  }
  function viewPlayer() {
    return pageHead("user", "Spieler") +
      '<div class="panel set-panel"><p class="set-line">' + icon("user") + " Angemeldet als <strong>" + esc(app.name) + "</strong></p>" +
        '<p class="muted small" style="margin:0">Unter diesem Namen erscheinen deine Aktionen bei den Aktivitäten.</p>' +
        '<div class="grid2"><button class="btn btn-ghost" id="rename-btn">Name ändern</button><button class="btn btn-ghost" id="logout-btn">Abmelden</button></div></div>';
  }
  function viewBackup() {
    return pageHead("download", "Spielstand sichern") +
      '<div class="panel set-panel">' +
        '<p class="muted small" style="margin:0">Lädt den kompletten Spielstand als Datei auf dieses Handy – zur Sicherheit, falls etwas schiefgeht.</p>' +
        '<button class="btn btn-primary btn-block" id="backup-btn">' + icon("download") + " Spielstand sichern</button>" +
        '<p class="muted small" style="margin:0">Wiederherstellen ersetzt den aktuellen Spielstand auf allen drei Handys durch eine gesicherte Datei.</p>' +
        '<button class="btn btn-ghost btn-block" id="restore-btn">' + icon("upload") + " Spielstand wiederherstellen</button>" +
      "</div>";
  }
  // Fehlerprotokoll (data/client-errors.log auf dem Server): die letzten 30 Einträge, neueste zuerst
  function viewErrors() {
    const log = app.errorLog;
    const list = !log ? '<p class="muted small">Wird geladen …</p>'
      : log.error ? '<p class="tool-warn">' + esc(log.error) + "</p>"
      : !log.entries.length ? '<p class="muted small" style="margin:0">Keine Einträge – bisher ist nichts schiefgegangen.</p>'
      : '<ol class="errlog">' + log.entries.map((e) => "<li><strong>" + esc(e.time || "") + " · " + esc(e.stage || "?") + (e.count > 1 ? " · " + e.count + "×" : "") + "</strong>: " + esc(e.name || "") +
          (e.message ? " – " + esc(e.message) : "") + '<div class="small muted">' + esc(errLine(e, true)) + "</div></li>").join("") + "</ol>";
    return pageHead("bug", "Fehlerprotokoll") +
      '<div class="panel set-panel">' +
        '<p class="muted small" style="margin:0">Fehler werden hier automatisch gespeichert (von allen Handys): beim Foto-Upload, unerwartete Fehler der App, fehlgeschlagene Server-Anfragen und Synchronisierung. Gleiche Fehler kurz hintereinander stehen nur einmal da (mit Anzahl). ' +
          "Mit „Kopieren“ landen die Einträge in der Zwischenablage – zum Weiterschicken.</p>" +
        (log && log.entries ? '<p class="small" style="margin:0">' + log.entries.length + (log.total > log.entries.length ? " neueste von " + log.total : "") + " Einträge</p>" : "") +
        '<div class="grid2"><button class="btn btn-primary" id="errlog-copy"' + (log && log.entries && log.entries.length ? "" : " disabled") + ">" + icon("copy") + " Kopieren</button>" +
          '<button class="btn btn-ghost" id="errlog-clear"' + (log && log.entries && log.entries.length ? "" : " disabled") + ">" + icon("trash-2") + " Protokoll leeren</button></div>" +
        list +
      "</div>";
  }
  function errLine(e, short) {
    return [short ? "" : (e.time || "") + " · " + (e.stage || "?") + ": " + (e.name || "") + (e.message ? " – " + e.message : ""),
      e.count > 1 ? e.count + "-mal" + (e.lastTime ? ", zuletzt " + e.lastTime : "") : "", e.where ? "Ort: " + e.where : "",
      e.fileName || e.fileSize ? "Datei: " + (e.fileName || "?") + " · " + (e.fileType || "?") + " · " + fmtSize(e.fileSize || 0) : "",
      e.attempts ? "Versuche: " + e.attempts : "",
      e.source ? "Knopf: " + e.source + (e.autoTries !== "" && e.autoTries != null ? " · automatische Wiederholungen: " + e.autoTries : "") + (e.okTry ? " · geklappt: " + e.okTry : "") : "",
      e.readWays ? "Lesewege: " + e.readWays : "", e.lastModified ? "Datei geändert: " + e.lastModified : "",
      e.pick ? "Auswahl Nr. " + e.pick + " in dieser Sitzung · Lesebeginn " + e.readDelayMs + " ms nach dem change-Event · Synchronisierung: " + (e.sync || "?") : "", e.player ? "Spieler: " + e.player : "", e.detail || "", e.stack && !short ? "Ablauf: " + e.stack : "", e.ua ? "Gerät: " + e.ua : ""].filter(Boolean).join(short ? " · " : "\n  ");
  }
  async function loadErrorLog() {
    app.errorLog = null;
    await sendErrors();
    const r = await api("client-errors").catch(() => null);
    app.errorLog = r && r.status === 200 && r.data ? r.data : { error: "Protokoll konnte nicht geladen werden (offline?)." };
    if (app.view === "errors") render();
  }
  async function copyErrorLog() {
    const log = app.errorLog;
    if (!log || !log.entries || !log.entries.length) return;
    const text = "Operação Madeira – Fehlerprotokoll (" + log.entries.length + " Einträge, neueste zuerst)\n\n" + log.entries.map((e) => errLine(e, false)).join("\n\n");
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = false; }
    if (!ok) { // Rückfall (z. B. ohne HTTPS): unsichtbares Textfeld
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      ta.remove();
    }
    toast(ok ? "Fehlerprotokoll kopiert – jetzt z. B. in eine Nachricht einfügen." : "Kopieren ging nicht – bitte die Einträge lang drücken und markieren.", !ok);
  }
  function viewEnd() {
    return pageHead("flag", "Urlaub beenden & Belohnungen") +
      '<div class="panel set-panel set-end">' +
        (app.state.ended
          ? '<p class="muted small" style="margin:0">Der Urlaub ist beendet. Belohnungen und Zertifikat findet ihr bei den Erfolgen.</p>' +
            '<button class="btn btn-gold btn-block" data-go="stats">' + icon("trophy") + " Belohnungen & Zertifikat ansehen</button>"
          : '<p class="muted small" style="margin:0">Am Ende des Urlaubs: Restpunkte in Belohnungen umtauschen, danach gibt es das Zertifikat als PDF. Falls nötig, kann man den Urlaub später fortsetzen.</p>' +
            '<button class="btn btn-gold btn-block" id="end-btn">' + icon("flag") + " Urlaub beenden & Belohnungen</button>") +
      "</div>";
  }
  function viewReset() {
    return pageHead("rotate-ccw", "Kompletter Reset") +
      '<div class="panel set-panel">' +
        '<p style="margin:0">Setzt alles für alle drei Handys auf null und mischt den Stapel neu – auch alle Hilfsmittel und Erinnerungsfotos. Das kann man nicht rückgängig machen.</p>' +
        '<p class="muted small" style="margin:0">Tipp: Vorher unter „Spielstand sichern“ eine Sicherung herunterladen.</p>' +
        '<button class="btn btn-danger btn-block" id="reset-btn">Kompletter Reset</button>' +
      "</div>";
  }

  // "Maximum: 2.430 (Basis 2.400, Multiplikatoren +30)" bzw. nur "Maximum: 2.400"
  function maxText(s) {
    return "Maximum: " + fmt(s.maxPoints) + (s.maxDelta ? " (Basis " + fmt(L.MAX_POINTS) + ", Multiplikatoren " + signed(s.maxDelta) + ")" : "");
  }
  // Tortendiagramm mit Legende; leere Anteile werden nicht gezeichnet, stehen aber mit 0 in der Legende
  function pieChart(parts, unit, asPercent) {
    const total = parts.reduce((a, p) => a + Math.max(0, p[1]), 0);
    const R = 60, cx = 64, cy = 64;
    let slices = "";
    if (!total) slices = '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="var(--line)"/>';
    else {
      const used = parts.filter((p) => p[1] > 0);
      let a0 = -Math.PI / 2;
      used.forEach((p) => {
        const frac = p[1] / total;
        if (frac >= 0.9999) { slices += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + p[2] + '"/>'; return; }
        const a1 = a0 + frac * 2 * Math.PI;
        const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
        slices += '<path d="M' + cx + "," + cy + " L" + x0.toFixed(2) + "," + y0.toFixed(2) + " A" + R + "," + R + " 0 " + (frac > 0.5 ? 1 : 0) + " 1 " + x1.toFixed(2) + "," + y1.toFixed(2) + ' Z" fill="' + p[2] + '"/>';
        a0 = a1;
      });
    }
    const label = parts.map((p) => p[0] + ": " + fmt(p[1])).join(", ");
    return '<div class="pie"><svg viewBox="0 0 128 128" role="img" aria-label="' + esc(unit + " – " + label) + '">' + slices + "</svg>" +
      '<ul class="pie-legend">' + parts.map((p) => '<li><i style="background:' + p[2] + '"></i><span>' + esc(p[0]) + "</span>" +
        (asPercent ? '<span class="pv"><strong>' + (total ? Math.round(p[1] / total * 100) : 0) + ' %</strong><small class="muted">' + fmt(p[1]) + " P</small></span>"
          : '<span class="pv"><strong>' + fmt(p[1]) + "</strong></span>") +
        "</li>").join("") + "</ul></div>";
  }
  function kpi(v, l) { return '<div class="kpi"><div class="v">' + v + '</div><div class="l">' + l + "</div></div>"; }
  function barChart(days) {
    const W = 600, H = 230, pad = 34;
    const max = Math.max(50, ...days.map((d) => d.points));
    const show = days.slice(-14);
    const bw = Math.min(80, (W - pad * 2) / show.length);
    // Bei vielen Tagen nur jedes n-te Datum und keine Zahlen über den Balken, damit nichts überlappt
    const step = Math.ceil(show.length / 7), showVals = bw >= 60;
    const bars = show.map((d, i) => {
      const h = Math.max(0, d.points) / max * (H - pad * 2);
      const x = pad + i * bw + bw * 0.15, y = H - pad - h;
      const lbl = d.day.slice(8) + "." + d.day.slice(5, 7) + ".";
      return '<rect x="' + x + '" y="' + y + '" width="' + bw * 0.7 + '" height="' + h + '" rx="4" fill="var(--ocean)"/>' +
        (d.points && showVals ? '<text x="' + (x + bw * 0.35) + '" y="' + (y - 6) + '" text-anchor="middle">' + fmt(d.points) + "</text>" : "") +
        ((i % step === 0 || i === show.length - 1) ? '<text x="' + (x + bw * 0.35) + '" y="' + (H - 6) + '" text-anchor="middle">' + lbl + "</text>" : "");
    }).join("");
    return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Punkte pro Tag"><line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + (H - pad) + '" y2="' + (H - pad) + '" stroke="var(--line)"/>' + bars + "</svg>";
  }

  // ---- Urlaub beenden
  function players() {
    const names = [];
    const add = (n) => { if (n && names.indexOf(n) < 0) names.push(n); };
    app.state.log.forEach((e) => add(e.by));
    add(app.name);
    return names;
  }

  // Ablauf: „Urlaub beenden“ → Urlaubs-Rückblick (überspringbar) → Punkte auf Belohnungen verteilen → Fotos für die
  // Urkunde wählen → Urkunde (bei den Erfolgen)
  async function startEnd() {
    if (!(await confirmBox("Urlaub beenden?", "Zuerst kommt euer Urlaubs-Rückblick, danach werden die Restpunkte in Belohnungen umgetauscht und ihr wählt die Fotos für die Urkunde. (Falls nötig, kann man den Urlaub später fortsetzen.)", "Weiter"))) { backToSettings("end"); return; }
    startRecap(() => openRewards());
  }
  function openRewards(prev) {
    const s = sum();
    const rest = Math.max(0, s.balance);
    const alloc = (prev && prev.alloc) || {};
    C.rewards.forEach((r) => { alloc[r.id] = alloc[r.id] || 0; });
    let names = prev ? prev.names : players().slice(0, 3).join(", ");
    const remaining = () => rest - C.rewards.reduce((a, r) => a + (alloc[r.id] || 0), 0);
    let finished = false;
    const em = openModal(() => {
      const rem = remaining();
      return '<div class="modal-head"><h2>Belohnungen verteilen</h2><button class="modal-close" data-close aria-label="Schließen">' + icon("x") + '</button></div>' +
        '<div class="sticky-remaining"><div class="muted small">Restpunkte: ' + fmt(rest) + " (verdient " + fmt(s.earned) + " − ausgegeben " + fmt(s.spent) + ")</div>" +
        '<div class="remaining" style="color:' + (rem === 0 ? "var(--laurel)" : rem < 0 ? "var(--hibiscus)" : "inherit") + '">Noch zu verteilen: ' + fmt(rem) + " Punkte</div></div>" +
        '<label style="margin-top:10px">Spielernamen fürs Zertifikat<input id="end-names" value="' + esc(names) + '"></label>' +
        C.rewards.map((r) => {
          const v = alloc[r.id] || 0, whole = r.kind === "count", plusOff = whole ? rem < 100 : rem <= 0; // zählbar: nur ganze Einheiten
          return '<div class="reward"><div><strong>' + esc(r.name) + '</strong><span class="tag tag-' + r.type + '">' + r.type + "</span></div>" +
            (r.desc ? '<div class="muted small">' + esc(r.desc) + "</div>" : "") +
            '<div class="muted small">100 Punkte = ' + r.per100 + " " + (r.per100 === 1 ? r.unit : (r.unitPlural || r.unit)) + (whole ? " · nur ganze " + (r.unitPlural || r.unit) : " · Schritte: " + r.step) + "</div>" +
            '<div class="stepper"><button class="btn" data-minus="' + r.id + '" data-hold="r-:' + r.id + '" aria-label="weniger">−</button>' +
            '<input inputmode="numeric" data-amount="' + r.id + '" value="' + v + '" aria-label="Punkte für ' + esc(r.name) + '">' +
            '<button class="btn" data-plus="' + r.id + '" data-hold="r+:' + r.id + '" aria-label="mehr"' + (plusOff ? " disabled" : "") + ">+</button>" +
            (whole && plusOff ? '<span class="step-hint">ab 100 P</span>' : "") + "</div>" +
            '<div class="live">' + fmt(v) + " Punkte = " + L.formatReward(r, v) + " " + esc(r.name) + "</div>" +
            (r.rules ? '<div class="muted small">' + esc(r.rules) + "</div>" : "") + "</div>";
        }).join("") +
        '<p class="muted small">Wie die Belohnungen unter euch aufgeteilt werden, regelt ihr selbst – die App rechnet nur um.</p>' +
        '<div class="modal-actions"><button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-good" id="finish" ' + (rem !== 0 ? "disabled" : "") + ">Weiter: Fotos für die Urkunde</button></div>";
    }, (el, refresh) => {
      $("#end-names", el).addEventListener("input", (ev) => { names = ev.target.value; });
      // Grenzen: nie mehr als die Restpunkte, nie unter 0; zählbare Belohnungen nur in ganzen 100ern (L.rewardAmount)
      const setV = (id, v) => { const r = C.rewards.find((x) => x.id === id); alloc[id] = L.rewardAmount(r, v, (alloc[id] || 0) + Math.max(0, remaining())); refresh(); };
      $$("[data-plus]", el).forEach((b) => b.addEventListener("click", () => {
        const r = C.rewards.find((x) => x.id === b.dataset.plus);
        if (r.kind === "count" && remaining() < 100) return;
        setV(r.id, (alloc[r.id] || 0) + Math.min(r.step, Math.max(0, remaining())));
      }));
      $$("[data-minus]", el).forEach((b) => b.addEventListener("click", () => {
        const r = C.rewards.find((x) => x.id === b.dataset.minus);
        setV(r.id, (alloc[r.id] || 0) - r.step);
      }));
      $$("[data-amount]", el).forEach((inp) => inp.addEventListener("change", () => {
        setV(inp.dataset.amount, parseInt(inp.value.replace(/\D/g, ""), 10) || 0);
      }));
      $("#finish", el).addEventListener("click", async () => {
        if (remaining() !== 0) return;
        const clean = {};
        Object.keys(alloc).forEach((k) => { if (alloc[k] > 0) clean[k] = alloc[k]; });
        clean._players = names.trim();
        clean._rest = rest;
        finished = true;
        closeModal();
        chooseCertPhotos(async () => { // Fotos gewählt → Urlaub beenden, Urkunde bei den Erfolgen
          if (await act({ type: "end", alloc: clean })) { closeAll(); go("stats"); confetti(200); return true; }
          return false;
        }, () => openRewards({ alloc, names }));
      });
    }, { keepScroll: true });
    em.onClose = () => { if (!finished) backToSettings("end"); }; // Verteilen abgebrochen
  }

  // Fotos für die Vorschau der Urkunde: sind sie noch nicht geladen, laden und danach neu zeichnen
  function certPreviewPhotos() {
    if (!app.mem) return [];
    const ids = certPhotoIds(), key = ids.map((id) => app.mem.items[id].f).join(",");
    if (certCache.key !== key || certCache.loading) loadCertPhotos().then(() => { if (app.view === "stats" && app.state.ended) render(); });
    return certCache.key === key && !certCache.loading ? certCache.photos : [];
  }
  function viewEnded(s) {
    const alloc = app.state.ended.alloc || {};
    const lines = C.rewards.filter((r) => alloc[r.id] > 0).map((r) =>
      '<div class="list-item"><div class="grow"><strong>Gutschein: ' + L.formatReward(r, alloc[r.id]) + " " + esc(r.voucher) + '</strong><div class="meta">' + fmt(alloc[r.id]) + " Punkte</div></div></div>").join("");
    return '<h2>' + icon("flag") + ' Urlaub beendet</h2>' +
      '<div class="panel rank-panel"><div class="muted small">Euer Rang</div><div class="rank-big">' + esc(s.rankName) + '</div><div class="small">' + fmt(s.earned) + " von " + fmt(s.maxPoints) + " Punkten (" + Math.round(s.earned / s.maxPoints * 100) + " %)</div></div>" +
      '<div class="panel"><h3>Eure Belohnungen</h3>' + (lines || '<p class="muted" style="margin:0">Keine Restpunkte verteilt.</p>') + "</div>" +
      '<div class="panel"><h3>Zertifikat</h3><img class="cert-preview" alt="Zertifikat" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(certificateSVG(certPreviewPhotos(), true)) + '">' +
      '<button class="btn btn-primary btn-block" id="pdf-btn" style="margin-top:12px">' + icon("file-down") + ' Zertifikat als PDF herunterladen</button></div>' +
      '<div class="panel" style="display:grid;gap:10px"><button class="btn btn-gold btn-block" id="recap-btn">' + icon("play") + " Urlaubs-Rückblick abspielen</button>" +
      '<button class="btn btn-ghost btn-block" id="reopen-btn">Urlaub fortsetzen (Verteilung aufheben)</button>' +
      '<button class="btn btn-ghost btn-block" id="tab-stats-btn">Erfolge ansehen</button></div>' +
      '<div class="set-danger"><button class="btn btn-danger btn-block" id="reset-btn">' + icon("rotate-ccw") + " Kompletter Reset</button></div>";
  }

  // ---- Urlaubs-Rückblick (nach „Urlaub beenden“, erneut über die Erfolge): streng chronologisch nur die erledigten Quests
  // (L.recap). Regionale Quests: Linie im Zickzack auf der Inselkarte zum Ort der Quest, Region färbt sich nach Stufe, kurzes
  // Fenster (Titel, Region, Tag, Punkte, Erinnerungsfoto). Stapel-Quests: Karte fliegt auf einen Stapel (leicht zufällig
  // gedreht/versetzt, immer lesbar). Eine eigene Uhr (requestAnimationFrame) treibt alles an: Pause, langsamer/schneller,
  // Überspringen. Bewegt wird nur per transform/opacity bzw. stroke-dashoffset; nichts wird während der Animation neu gezeichnet.
  const RC_SPEEDS = [0.5, 1, 1.5, 2, 3];
  let recapRun = null;
  const nfmt1 = (n) => n.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: n < 100 ? 1 : 0 });
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  function recapSummaryHTML(R) {
    const s = sum(), c = [0, 0, 0, 0];
    C.regions.forEach((r) => c[s.levels[r.id]]++);
    const chip = (i, label) => '<span class="rc-chip"><i style="background:' + L.LEVELS[i].color + '"></i>' + c[i] + " " + label + "</span>";
    return '<div class="rc-sum"><div class="rc-sum-in">' +
      '<div class="rc-rank"><div class="rc-glow" aria-hidden="true"></div><div class="rc-sum-fig">' + rankFigure(s.rank) + "</div></div>" +
      '<div class="muted small rc-pop-in" style="animation-delay:.45s">Euer Rang</div><h2 class="rc-rank-name">' + esc(s.rankName) + "</h2>" +
      '<div class="rc-sum-pts"><span class="rc-count-up" data-to="' + s.earned + '">0</span> Punkte</div>' +
      '<div class="rc-sum-grid">' +
        '<div><b>' + R.days + "</b><span>" + (R.days === 1 ? "Tag" : "Tage") + "</span></div>" +
        '<div><b>' + s.doneStack + "</b><span>Stapel-Quests</span></div>" +
        '<div><b>' + s.questsDone + "</b><span>regionale Quests</span></div>" +
        '<div><b>' + (s.bestMult ? L.fmtFactor(s.bestMult) : "–") + "</b><span>bester Multiplikator</span></div>" +
        '<div class="wide"><b>' + nfmt1(R.km) + " km</b><span>Luftlinie zwischen den Quest-Orten</span></div>" +
      "</div>" +
      '<div class="rc-chips">' + chip(3, "erschlossen") + chip(2, "erobert") + chip(1, "erkundet") + chip(0, "unbesucht") + "</div>" +
      '<div class="rc-sum-btns"><button class="btn btn-ghost" data-rc="again">' + icon("rotate-ccw") + " Nochmal</button>" +
      '<button class="btn btn-gold" data-rc="close">Fertig</button></div></div></div>';
  }
  // Straßenverbindung zwischen zwei Regionen für den Rückblick (Kartenkoordinaten): kürzester Weg im Straßennetz aus
  // public/roads.js (erzeugt von tools/strassen_netz.py aus einer OSRM-Route, © OpenStreetMap-Mitwirkende). Die Linie startet
  // am Quest-Pin, springt an die nächste Stelle der Straße und endet an der Stelle, die dem Ziel-Pin am nächsten liegt.
  // null = kein Straßennetz (Datei fehlt/fehlerhaft) → geschwungene Linie.
  const roadCache = {};
  function roadPath(r1, r2, fromXY, toXY) {
    const R = window.MADEIRA_ROADS;
    if (!R || !R.paths || !R.edges) return null;
    const key = r1 < r2 ? r1 + "|" + r2 : r2 + "|" + r1;
    if (!(key in roadCache)) {
      const steps = R.paths[key];
      let pts = null;
      if (Array.isArray(steps) && steps.length) {
        pts = [];
        steps.forEach(([ei, dir]) => {
          const flat = R.edges[ei] || [], seg = [];
          for (let k = 0; k + 1 < flat.length; k += 2) seg.push(toMap(flat[k], flat[k + 1]));
          if (dir < 0) seg.reverse();
          pts.push.apply(pts, pts.length ? seg.slice(1) : seg);
        });
        if (pts.length < 2 || pts.some((p) => !isFinite(p[0]) || !isFinite(p[1]))) pts = null;
      }
      roadCache[key] = pts;
    }
    let pts = roadCache[key];
    if (!pts) return null;
    if (r1 > r2) pts = pts.slice().reverse(); // gespeichert alphabetisch – hier in Fahrtrichtung
    const near = (p, from, to) => { let best = from, bd = Infinity; for (let k = from; k <= to; k++) { const d = Math.hypot(pts[k][0] - p[0], pts[k][1] - p[1]); if (d < bd) { bd = d; best = k; } } return best; };
    const a = near(fromXY, 0, pts.length - 1), b = near(toXY, a, pts.length - 1);
    return [fromXY].concat(pts.slice(a, b + 1), [toXY]);
  }
  function startRecap(onDone) {
    if (recapRun) return;
    const R = L.recap(app.state, C);
    const shown = R.events.filter((e) => e.kind !== "joker").length;
    const D = Math.max(220, Math.min(870, 12700 / Math.max(1, shown))); // dreimal so schnell: gesamt ≈ 10–15 s bei vollem Spiel
    const INTRO = 300;
    let t = INTRO;
    R.events.forEach((e) => { e.start = t; e.dur = e.kind === "joker" ? 0 : D; t += e.dur; });
    const total = t + 250;
    const el = document.createElement("div");
    el.className = "recap";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Urlaubs-Rückblick");
    const paths = C.regions.map((r) => '<path data-rc-region="' + r.id + '" d="' + (MAP.regions[r.name] || []).join(" ") + '" fill="' + L.LEVELS[0].color + '"/>').join("");
    el.innerHTML = '<div class="rc-top"><div><div class="rc-title">' + icon("history") + " Urlaubs-Rückblick</div>" +
        '<div class="rc-stats"><span class="rc-day">Tag 1</span> · <span class="rc-pts">0</span> Punkte</div></div>' +
        '<button class="btn btn-small rc-skip" data-rc="skip">Überspringen</button></div>' +
      '<div class="rc-map"><svg viewBox="0 0 ' + MAP.w + " " + MAP.h + '" aria-hidden="true"><g class="rc-regions">' + paths + '</g><g class="rc-line"></g><g class="rc-dots"></g></svg><div class="rc-pop" hidden></div></div>' +
      '<div class="rc-table"><div class="rc-count" aria-label="Stapel-Quests">' + icon("layers") + " <span>0</span></div><div class=\"rc-cards\"></div></div>" +
      '<div class="rc-bar"><div class="rc-progress"><i></i></div><div class="rc-ctrl">' +
        '<button class="btn btn-small btn-ghost" data-rc="slower" aria-label="Langsamer">' + icon("minus") + "</button>" +
        '<span class="rc-speed">1×</span>' +
        '<button class="btn btn-small btn-ghost" data-rc="faster" aria-label="Schneller">' + icon("plus") + "</button>" +
        '<button class="btn btn-small btn-primary rc-play" data-rc="pause" aria-label="Pause">' + icon("pause") + "</button></div></div>";
    document.body.appendChild(el);
    const svg = $(".rc-map svg", el), lineG = $(".rc-line", el), dotG = $(".rc-dots", el), pop = $(".rc-pop", el), cards = $(".rc-cards", el), mapBox = $(".rc-map", el);
    const run = recapRun = { vt: 0, last: 0, speed: 1, paused: false, i: -1, raf: 0, done: false };
    // Erinnerungsfotos vorab laden und dekodieren (ruckelfrei beim Einblenden)
    const thumbs = {};
    R.events.forEach((e) => {
      const it = memFor(e.id);
      if (!it || e.kind === "joker") return;
      const im = new Image(); im.decoding = "async"; im.src = memUrl(it, true);
      if (im.decode) im.decode().catch(() => {});
      thumbs[e.id] = im.src;
    });
    let lastPin = null, lastRegion = null, stackN = 0, segN = 0;
    // Winkel der Stapel-Karten: alle ganzen Grad −45 … +45 gemischt (fest je Spiel), jede Karte bekommt den nächsten
    const angles = Array.from({ length: 91 }, (_, k) => k - 45), rnd = L.mulberry32(app.state.seed >>> 0);
    for (let k = angles.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [angles[k], angles[j]] = [angles[j], angles[k]]; }
    const NS = "http://www.w3.org/2000/svg";
    const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k])); return n; };
    const setLevels = (lv) => C.regions.forEach((r) => { const p = $('[data-rc-region="' + r.id + '"]', svg); if (p) p.setAttribute("fill", L.LEVELS[lv[r.id]].color); });
    const prevEarned = (i) => (i > 0 ? R.events[i - 1].earned : 0);
    function begin(i) { // einmalig, wenn ein Ereignis dran ist
      const e = R.events[i];
      $(".rc-day", el).textContent = "Tag " + e.day;
      if (e.kind === "joker") { setLevels(e.levels); return; }
      if (e.kind === "quest") {
        const q = IX.quests[e.id], xy = toMap(q.pin[0], q.pin[1]);
        const road = lastPin && lastRegion && lastRegion !== q.region ? roadPath(lastRegion, q.region, lastPin, xy) : null;
        if (road) { // entlang der Straßen (public/roads.js, © OpenStreetMap-Mitwirkende)
          let len = 0;
          for (let k = 1; k < road.length; k++) len += Math.hypot(road[k][0] - road[k - 1][0], road[k][1] - road[k - 1][1]);
          len = Math.max(1, len);
          const dPath = "M" + road.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L");
          e.lines = ["rc-halo", "rc-path"].map((cls) => svgEl("path", { d: dPath, class: cls, "stroke-dasharray": len, "stroke-dashoffset": len }));
          e.len = len;
          e.lines.forEach((n) => lineG.appendChild(n));
        } else if (lastPin) { // gleiche Region oder ohne Straßennetz: sanft geschwungene Verbindung, abwechselnd nach links/rechts
          const dx = xy[0] - lastPin[0], dy = xy[1] - lastPin[1], d = Math.hypot(dx, dy) || 1, side = (segN++ % 2 ? 1 : -1) * 0.22;
          const cx = (lastPin[0] + xy[0]) / 2 - dy / d * d * side, cy = (lastPin[1] + xy[1]) / 2 + dx / d * d * side;
          let len = 0, px = lastPin[0], py = lastPin[1];
          for (let k = 1; k <= 16; k++) { // Länge der Kurve (für das Nachzeichnen)
            const u = k / 16, qx = (1 - u) * (1 - u) * lastPin[0] + 2 * (1 - u) * u * cx + u * u * xy[0], qy = (1 - u) * (1 - u) * lastPin[1] + 2 * (1 - u) * u * cy + u * u * xy[1];
            len += Math.hypot(qx - px, qy - py); px = qx; py = qy;
          }
          len = Math.max(1, len);
          const dPath = "M" + lastPin[0].toFixed(1) + " " + lastPin[1].toFixed(1) + "Q" + cx.toFixed(1) + " " + cy.toFixed(1) + " " + xy[0].toFixed(1) + " " + xy[1].toFixed(1);
          e.lines = ["rc-halo", "rc-path"].map((cls) => svgEl("path", { d: dPath, class: cls, "stroke-dasharray": len, "stroke-dashoffset": len }));
          e.len = len;
          e.lines.forEach((n) => lineG.appendChild(n));
        }
        lastPin = xy; lastRegion = q.region;
        e.xy = xy;
        const it = thumbs[e.id];
        pop.innerHTML = (it ? '<img src="' + it + '" alt="">' : '<span class="rc-pop-ic">' + icon("map-pin") + "</span>") +
          '<div><strong>' + esc(q.title) + '</strong><div class="small">' + esc(IX.regions[q.region].name) + " · Tag " + e.day + ' · <b class="plus">+' + e.points + "</b></div></div>";
        pop.hidden = false;
        const W = mapBox.clientWidth, H = mapBox.clientHeight, k = W / MAP.w, px = xy[0] * k, py = xy[1] * k;
        const pw = pop.offsetWidth, ph = pop.offsetHeight;
        const left = Math.max(6, Math.min(W - pw - 6, px - pw / 2));
        const top = py < H / 2 ? Math.min(H - ph - 4, py + 14) : Math.max(4, py - ph - 14);
        pop.style.left = left + "px"; pop.style.top = top + "px";
        pop.style.transformOrigin = (px - left) + "px " + (py < H / 2 ? "0" : ph + "px");
        pop.style.opacity = "0"; pop.style.transform = "scale(.6)";
      } else {
        const q = IX.stack[e.id], h = L.hash(e.id + ":" + app.state.seed);
        const it = thumbs[e.id];
        const c = document.createElement("div");
        c.className = "rc-card rc-d-" + q.difficulty;
        c.innerHTML = (it ? '<img src="' + it + '" alt="">' : '<span class="rc-card-ic">' + icon("layers") + "</span>") + // Hochformat wie die Karten der App
          '<div class="rc-card-txt"><span class="pill diff-' + q.difficulty + '">' + diffLabel(q.difficulty) + "</span>" +
          (e.factor ? ' <span class="pill mult-badge">' + L.fmtFactor(e.factor) + "</span>" : "") +
          "<strong>" + esc(q.title) + '</strong><span class="rc-card-pts">+' + e.points + " Punkte · Tag " + e.day + "</span></div>";
        e.rot = angles[stackN];                                 // ganze Grad −45 … +45, jeder Winkel höchstens einmal
        e.ox = (((h >>> 8) % 121) - 60); e.oy = (((h >>> 16) % 71) - 35);
        c.style.zIndex = 1 + stackN;
        c.style.willChange = "transform, opacity";
        cards.appendChild(c);
        e.card = c;
      }
    }
    function frame(i, p) { // laufend: nur transform/opacity/stroke-dashoffset
      const e = R.events[i];
      if (!e || e.kind === "joker") return;
      const pts = prevEarned(i) + (e.earned - prevEarned(i)) * ease(clamp01((p - 0.3) / 0.35));
      $(".rc-pts", el).textContent = fmt(pts);
      if (e.kind === "quest") {
        if (e.lines) { const off = (e.len * (1 - ease(clamp01(p / 0.3)))).toFixed(1); e.lines.forEach((n) => n.setAttribute("stroke-dashoffset", off)); }
        if (p >= 0.3 && !e.colored) { e.colored = true; setLevels(e.levels); dotG.appendChild(svgEl("circle", { cx: e.xy[0], cy: e.xy[1], r: 9, class: "rc-dot" })); }
        const a = clamp01((p - 0.25) / 0.1), z = clamp01((1 - p) / 0.1);
        pop.style.opacity = Math.min(a, z).toFixed(3);
        pop.style.transform = "scale(" + (0.6 + 0.4 * ease(a)).toFixed(3) + ")";
      } else {
        const f = ease(clamp01(p / 0.45)), W = cards.clientWidth;
        const x = e.ox + (1 - f) * (W * 0.75), y = e.oy - (1 - f) * 260, r = e.rot + (1 - f) * (e.rot < 0 ? -40 : 40), sc = 1 + (1 - f) * 0.15;
        e.card.style.transform = "translate(-50%,-50%) translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0) rotate(" + r.toFixed(2) + "deg) scale(" + sc.toFixed(3) + ")";
        e.card.style.opacity = clamp01(p / 0.12).toFixed(3);
        if (f >= 1 && !e.landed) { e.landed = true; stackN++; $(".rc-count span", el).textContent = stackN; e.card.style.willChange = "auto"; }
      }
    }
    function finish(i) { frame(i, 1); const e = R.events[i]; if (e && e.kind === "quest") pop.hidden = true; }
    function showSummary() {
      if (run.done) return;
      run.done = true;
      cancelAnimationFrame(run.raf);
      for (let i = Math.max(0, run.i); i < R.events.length; i++) { if (i > run.i) begin(i); finish(i); }
      run.i = R.events.length;
      $(".rc-pts", el).textContent = fmt(R.earned);
      $(".rc-progress i", el).style.transform = "scaleX(1)";
      el.insertAdjacentHTML("beforeend", recapSummaryHTML(R));
      // Rang feiern: Figur zoomt herein und leuchtet (CSS, nur transform/opacity), Konfetti in den Spielfarben, Punkte zählen hoch
      setTimeout(() => { confetti(70); setTimeout(() => confetti(50), 700); }, 350);
      const cu = $(".rc-count-up", el), to = +cu.dataset.to, t0 = performance.now() + 500;
      const up = (now) => {
        const p = clamp01((now - t0) / 1300);
        cu.textContent = fmt(to * ease(p));
        if (p < 1 && document.body.contains(cu)) requestAnimationFrame(up);
      };
      requestAnimationFrame(up);
    }
    function tick(now) {
      if (run.done) return;
      const dt = run.last ? Math.min(100, now - run.last) : 0;
      run.last = now;
      if (!run.paused) run.vt += dt * run.speed;
      while (run.i + 1 < R.events.length && run.vt >= R.events[run.i + 1].start) { if (run.i >= 0) finish(run.i); run.i++; begin(run.i); }
      if (run.i >= 0) { const e = R.events[run.i]; frame(run.i, e.dur ? (run.vt - e.start) / e.dur : 1); }
      $(".rc-progress i", el).style.transform = "scaleX(" + Math.min(1, run.vt / total).toFixed(4) + ")";
      if (run.vt >= total) { showSummary(); return; }
      run.raf = requestAnimationFrame(tick);
    }
    const close = () => {
      cancelAnimationFrame(run.raf);
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("keydown", onKey);
      el.remove();
      recapRun = null;
      if (onDone) onDone();
    };
    const setPause = (v) => { run.paused = v; const b = $(".rc-play", el); b.innerHTML = icon(v ? "play" : "pause"); b.setAttribute("aria-label", v ? "Weiter" : "Pause"); };
    const onHide = () => { if (document.hidden) setPause(true); };
    const onKey = (ev) => { if (ev.key === "Escape") close(); else if (ev.key === " ") { ev.preventDefault(); setPause(!run.paused); } };
    document.addEventListener("visibilitychange", onHide);
    document.addEventListener("keydown", onKey);
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-rc]");
      if (!b) return;
      const a = b.dataset.rc;
      if (a === "pause") setPause(!run.paused);
      else if (a === "faster" || a === "slower") {
        const k = RC_SPEEDS.indexOf(run.speed) + (a === "faster" ? 1 : -1);
        run.speed = RC_SPEEDS[Math.max(0, Math.min(RC_SPEEDS.length - 1, k))];
        $(".rc-speed", el).textContent = String(run.speed).replace(".", ",") + "×";
      } else if (a === "skip") showSummary();
      else if (a === "close") close();
      else if (a === "again") { const cb = onDone; onDone = null; close(); startRecap(cb); }
    });
    if (!R.events.length) { showSummary(); return; }
    run.raf = requestAnimationFrame(tick);
  }

  // ---- Zertifikat (Urkunde): Namen, Rang mit Figur, kleine Inselkarte mit gefärbten Regionen, wichtigste Statistiken
  // (wie im Rückblick), Collage aus bis zu 6 Erinnerungsfotos, Gutscheine. Vorschau als SVG (Fotos als kleine data-URLs, nur
  // Vorschaubilder ~320 px); fürs PDF wird die SVG ohne Fotos ins Canvas gezeichnet und die Fotos direkt aufs Canvas (sicher
  // auch in Safari) – dadurch bleibt das PDF handlich.
  const CERT_W = 1188, CERT_H = 840, CERT_CELL = 100, CERT_GAP = 8;
  const certCache = { key: null, photos: [], loading: null };
  // Fotos für die Urkunde: gespeicherte Auswahl (Einstellungen → Erinnerungsfotos bzw. vor der Urkunde, für alle Handys);
  // noch nie gewählt → die ersten 6 Fotos chronologisch
  const chronoMems = () => visibleMems().sort((a, b) => ((app.state.quests[a] || app.state.done[a]).t - (app.state.quests[b] || app.state.done[b]).t));
  function certPhotoIds() {
    const c = app.mem && app.mem.cert;
    return Array.isArray(c) ? c.filter((id) => memFor(id)).slice(0, 6) : chronoMems().slice(0, 6);
  }
  function certPickHTML(sel) {
    const ids = chronoMems();
    return '<div class="cp-head"><strong>Fotos für die Urkunde</strong><span class="cp-count">' + sel.length + " von 6</span></div>" +
      (ids.length ? '<div class="cp-grid">' + ids.map((id) => {
        const on = sel.indexOf(id) >= 0;
        return '<button class="cp-tile' + (on ? " on" : "") + '" data-cp="' + id + '" aria-pressed="' + on + '" aria-label="' + esc(questTitle(id)) + '">' + memThumb(memFor(id)) +
          '<span class="cp-check">' + (on ? icon("check") : "") + '</span><span class="mem-cap">' + esc(questTitle(id)) + "</span></button>";
      }).join("") + "</div>" : '<p class="muted small">Noch keine Erinnerungsfotos.</p>');
  }
  function toggleCertSel(sel, id) {
    const i = sel.indexOf(id);
    if (i >= 0) sel.splice(i, 1);
    else if (sel.length >= 6) { toast("Höchstens 6 Fotos – erst eines abwählen.", true); return false; }
    else sel.push(id);
    return true;
  }
  async function saveCertSel(sel) {
    const r = await api("memories/cert", { method: "POST", body: { ids: sel } }).catch(() => null);
    if (!r || r.status !== 200) { toast("Auswahl nicht gespeichert (offline?).", true); return false; }
    setMem(r.data);
    return true;
  }
  // Vor der Urkunde: dieselbe Auswahl, vorbelegt mit der Vorauswahl aus den Einstellungen
  function chooseCertPhotos(onDone, onBack) {
    if (!chronoMems().length) { onDone(); return; }
    const sel = certPhotoIds().slice();
    let done = false;
    const m = openModal(() => '<div class="modal-head"><h2>' + icon("image") + " Fotos für die Urkunde</h2><button class=\"modal-close\" data-close aria-label=\"Zurück\">" + icon("x") + "</button></div>" +
      '<p class="muted small">Bis zu 6 Erinnerungsfotos kommen als kleine Collage auf die Urkunde. Antippen wählt aus oder ab.</p>' + certPickHTML(sel) +
      '<div class="modal-actions"><button class="btn btn-ghost" id="cp-back">' + icon("arrow-left") + ' Zurück</button><button class="btn btn-good" id="cp-ok">' + icon("check") + " Urkunde erstellen</button></div>",
    (el, refresh) => {
      $$("[data-cp]", el).forEach((b) => b.addEventListener("click", () => { if (toggleCertSel(sel, b.dataset.cp)) refresh(); }));
      $("#cp-back", el).addEventListener("click", () => closeModal());
      $("#cp-ok", el).addEventListener("click", async () => {
        if (!(await saveCertSel(sel))) return;
        done = true;
        if (!(await onDone())) done = false;
      });
    }, { where: "Fotos für die Urkunde" });
    m.onClose = () => { if (!done) onBack(); };
  }
  function loadCertPhotos() {
    const ids = certPhotoIds(), key = ids.map((id) => app.mem.items[id].f).join(",");
    if (certCache.key === key) return certCache.loading || Promise.resolve(certCache.photos);
    certCache.key = key;
    certCache.loading = Promise.all(ids.map((id) => fetch(memUrl(app.mem.items[id], true), { cache: "force-cache" }).then((r) => (r.ok ? r.blob() : null)).then((b) => !b ? null :
      new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); })).catch(() => null)))
      .then((list) => { if (certCache.key === key) { certCache.photos = list.filter(Boolean); certCache.loading = null; } return certCache.photos; });
    return certCache.loading;
  }
  function certSlots(n) {
    return Array.from({ length: n }, (_, i) => ({ x: 800 + (i % 3) * (CERT_CELL + CERT_GAP), y: 332 + Math.floor(i / 3) * (CERT_CELL + CERT_GAP) }));
  }
  function certFigure(rank, x, y, size) {
    const inner = rankFigure(rank).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")
      .replace(/class="dot"/g, 'fill="#073b4c" stroke="none"').replace(/class="thin"/g, 'stroke-width="1"')
      .replace(/class="accent-fill"/g, 'fill="#e5b53b"').replace(/ class="[^"]*"/g, "");
    return '<g transform="translate(' + x + "," + y + ") scale(" + size / 48 + ')" fill="none" stroke="#073b4c" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + inner + "</g>";
  }
  function certificateSVG(photos, withImages) {
    photos = photos || [];
    const s = sum(), st = app.state, W = CERT_W, H = CERT_H;
    const alloc = (st.ended && st.ended.alloc) || {};
    const names = alloc._players || players().join(", ");
    const vouchers = C.rewards.filter((r) => alloc[r.id] > 0).map((r) => L.formatReward(r, alloc[r.id]) + " " + r.voucher);
    const t = (x, y, txt, size, opts) => '<text x="' + x + '" y="' + y + '" font-size="' + size + '" ' + (opts || 'text-anchor="middle"') + ">" + esc(txt) + "</text>";
    const lv = [0, 0, 0, 0];
    C.regions.forEach((r) => lv[s.levels[r.id]]++);
    const period = L.dateRange(st.createdAt, st.ended ? st.ended.at : Date.now()); // Spielbeginn bis „Urlaub beenden“
    // Rang mit Figur (links)
    const rankG = '<circle cx="235" cy="409" r="78" fill="#e6f2f5"/>' + certFigure(s.rank, 175, 349, 120) +
      t(235, 524, s.rankName, 30, 'text-anchor="middle" font-weight="700" fill="#0b5f78"') +
      t(235, 552, fmt(s.earned) + " Punkte verdient", 17, 'text-anchor="middle" fill="#5f6f76"');
    // Inselkarte (Mitte bzw. rechts, wenn keine Fotos)
    const sc = photos.length ? 0.34 : 0.4, mx = photos.length ? 424 : 520, my = photos.length ? 340 : 332;
    const mapG = '<g transform="translate(' + mx + "," + my + ") scale(" + sc + ')">' +
      C.regions.map((r) => '<path d="' + (MAP.regions[r.name] || []).join(" ") + '" fill="' + L.LEVELS[s.levels[r.id]].color + '" stroke="#fff" stroke-width="3"/>').join("") + "</g>";
    const cx = mx + MAP.w * sc / 2, ly = my + MAP.h * sc + 20;
    const legend = [[3, "erschlossen"], [2, "erobert"], [1, "erkundet"], [0, "unbesucht"]];
    const cols = photos.length ? 2 : 4, legW = photos.length ? 170 : 140; // neben der Collage 2 × 2, sonst eine Zeile
    const legendG = legend.map(([i, w], k) => {
      const x = cx - legW * cols / 2 + (k % cols) * legW + 14, y = ly + Math.floor(k / cols) * 21;
      return '<rect x="' + x + '" y="' + (y - 12) + '" width="14" height="14" rx="3" fill="' + L.LEVELS[i].color + '"/>' + t(x + 20, y, lv[i] + " " + w, 15, 'text-anchor="start" fill="#1d2a30"');
    }).join("");
    // Collage (rechts)
    const slots = certSlots(photos.length);
    const collage = photos.length ? '<defs>' + slots.map((p, i) => '<clipPath id="cp' + i + '"><rect x="' + p.x + '" y="' + p.y + '" width="' + CERT_CELL + '" height="' + CERT_CELL + '" rx="10"/></clipPath>').join("") + "</defs>" +
      slots.map((p, i) => (withImages ? '<image href="' + photos[i] + '" x="' + p.x + '" y="' + p.y + '" width="' + CERT_CELL + '" height="' + CERT_CELL + '" preserveAspectRatio="xMidYMid slice" clip-path="url(#cp' + i + ')"/>' : "") +
        '<rect x="' + p.x + '" y="' + p.y + '" width="' + CERT_CELL + '" height="' + CERT_CELL + '" rx="10" fill="none" stroke="#e5b53b" stroke-width="2"/>').join("") +
      t(800 + (3 * CERT_CELL + 2 * CERT_GAP) / 2, 332 + (photos.length > 3 ? 2 : 1) * (CERT_CELL + CERT_GAP) + 14, "Erinnerungen", 15, 'text-anchor="middle" fill="#5f6f76" font-style="italic"') : "";
    // Unten links: regionale Quests und Stapel-Quests untereinander; rechts eine Box „Gutscheine“ mit einfacher Liste
    const box = (x, y, w, h) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="12" fill="#ffffff" stroke="#e3ddd1" stroke-width="1.5"/>';
    const statsG = [["Regionale Quests", s.questsDone + " von 30"], ["Stapel-Quests", s.doneStack + " von " + C.stackQuests.length]].map(([l, v], i) => {
      const y = 584 + i * 78;
      return box(70, y, 300, 68) + t(90, y + 41, l, 18, 'text-anchor="start" fill="#5f6f76"') + t(350, y + 43, v, 26, 'text-anchor="end" font-weight="700" fill="#0b5f78"');
    }).join("");
    const two = vouchers.length > 3, rows = two ? Math.ceil(vouchers.length / 2) : Math.max(1, vouchers.length);
    const vx = 392, vw = W - 70 - vx;
    const vouchersSvg = box(vx, 584, vw, 146) + t(vx + 20, 616, "Gutscheine", 20, 'text-anchor="start" font-weight="700" fill="#0b5f78"') +
      (vouchers.length ? vouchers.map((v, i) => {
        const col = two ? Math.floor(i / rows) : 0, row = two ? i % rows : i;
        return t(vx + 22 + col * vw / 2, 648 + row * 26, "• " + v, 18, 'text-anchor="start" fill="#1d2a30"');
      }).join("") : t(vx + 22, 648, "Keine Gutscheine", 18, 'text-anchor="start" fill="#888"'));
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" font-family="Georgia, \'Times New Roman\', serif" fill="#1d2a30">' +
      '<rect width="' + W + '" height="' + H + '" fill="#fbf7ef"/>' +
      '<rect x="24" y="24" width="' + (W - 48) + '" height="' + (H - 48) + '" fill="none" stroke="#0b5f78" stroke-width="6" rx="18"/>' +
      '<rect x="40" y="40" width="' + (W - 80) + '" height="' + (H - 80) + '" fill="none" stroke="#e5b53b" stroke-width="2" rx="12"/>' +
      t(W / 2, 96, "ZERTIFIKAT", 50, 'text-anchor="middle" font-weight="700" letter-spacing="8" fill="#0b5f78"') +
      t(W / 2, 130, "Operação Madeira – Das Spiel", 20, 'text-anchor="middle" fill="#5f6f76"') +
      t(W / 2, 172, period, 19, 'text-anchor="middle" fill="#5f6f76"') + // nach einer Leerzeile: Zeitraum des Urlaubs
      t(W / 2, 214, "Hiermit wird bestätigt, dass", 19, 'text-anchor="middle" fill="#5f6f76"') +
      t(W / 2, 256, names || "das Team", 34, 'text-anchor="middle" font-weight="700"') +
      t(W / 2, 292, "Madeira als Team erkundet und den Rang „" + s.rankName + "“ erreicht haben.", 21, 'text-anchor="middle"') +
      rankG + mapG + legendG + collage + statsG + vouchersSvg +
      t(W / 2, H - 56, "Dieses Zertifikat gilt gleichzeitig als Gutschein.", 15, 'text-anchor="middle" fill="#5f6f76" font-style="italic"') +
      "</svg>";
  }

  async function downloadPDF() {
    if (!window.jspdf) { toast("PDF-Modul lädt noch – gleich nochmal versuchen.", true); return; }
    const photos = app.mem ? await loadCertPhotos() : [];
    const svg = certificateSVG(photos, false); // Fotos kommen direkt aufs Canvas
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode().catch(() => new Promise((res) => { img.onload = res; }));
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = CERT_W * scale; canvas.height = CERT_H * scale;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const slots = certSlots(photos.length);
    for (let i = 0; i < photos.length; i++) {
      const im = new Image();
      im.src = photos[i];
      try { await im.decode(); } catch (e) { continue; }
      const p = slots[i], S = CERT_CELL * scale, k = Math.max(S / im.naturalWidth, S / im.naturalHeight);
      const w = im.naturalWidth * k, h = im.naturalHeight * k;
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x * scale, p.y * scale, S, S, 10 * scale); else ctx.rect(p.x * scale, p.y * scale, S, S);
      ctx.clip();
      ctx.drawImage(im, p.x * scale + (S - w) / 2, p.y * scale + (S - h) / 2, w, h);
      ctx.restore();
      ctx.strokeStyle = "#e5b53b"; ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.x * scale, p.y * scale, S, S, 10 * scale); else ctx.rect(p.x * scale, p.y * scale, S, S);
      ctx.stroke();
    }
    const pdf = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.85), "JPEG", 0, 0, 297, 210);
    canvas.width = 0; canvas.height = 0;
    pdf.save("Madeira-Zertifikat.pdf");
  }

  // ---- Test-Simulation (Einstellungen → Testspiel simulieren): Der Server sichert den echten Stand komplett (Spielstand,
  // Erinnerungsfotos, Hilfsmittel-Fotos) und setzt einen zufälligen, regelgerechten Test-Spielstand (L.simulateGame) ein;
  // dazu mindestens 7 erzeugte Platzhalter-Erinnerungsfotos. Band „Simulation aktiv“ auf allen Handys; „Simulation beenden“
  // holt den echten Stand exakt zurück und löscht alle Simulationsdaten.
  function setSim(sim) {
    const was = !!(app.sim && app.sim.active);
    app.sim = sim;
    const band = $("#sim-band");
    if (band) band.hidden = !sim.active;
    document.body.classList.toggle("sim-on", !!sim.active);
    if (was !== !!sim.active && app.state && (app.view === "settings" || app.view === "sim")) render();
  }
  function viewSim() {
    const on = app.sim && app.sim.active;
    return pageHead("shuffle", "Testspiel simulieren") +
      '<div class="panel set-panel">' +
        (on ? '<p style="margin:0"><strong>Die Simulation läuft.</strong> Alles, was ihr jetzt macht, ist nur ein Test. Euer echter Spielstand ist sicher gespeichert.</p>' +
            '<button class="btn btn-danger btn-block" id="sim-stop">' + icon("rotate-ccw") + " Simulation beenden</button>"
          : '<p style="margin:0">Erzeugt ein zufälliges Testspiel über 7 Tage – mit Regionen in allen Stufen, Stapel-Quests, Multiplikatoren, Jokern, ein paar rückgängig gemachten Aktionen und mindestens 7 Test-Erinnerungsfotos. Damit könnt ihr z. B. „Urlaub beenden“ ausprobieren.</p>' +
            '<p class="muted small" style="margin:0">Vorher wird euer echter Spielstand samt Erinnerungsfotos automatisch gesichert. „Simulation beenden“ (Band oben) stellt ihn exakt wieder her – für alle Handys.</p>' +
            '<button class="btn btn-primary btn-block" id="sim-btn">' + icon("shuffle") + " Testspiel simulieren</button>") +
      "</div>";
  }
  // Platzhalter-Foto: farbiger Landschafts-Verlauf (Himmel, Sonne, Berge, Meer) mit dem Quest-Namen
  function simPhoto(title, hue) {
    const c = document.createElement("canvas"), W = 1000, H = 667;
    c.width = W; c.height = H;
    const g = c.getContext("2d"), hsl = (h, s, l) => "hsl(" + ((h % 360) + 360) % 360 + "," + s + "%," + l + "%)";
    let gr = g.createLinearGradient(0, 0, 0, H * 0.6);
    gr.addColorStop(0, hsl(hue, 70, 62)); gr.addColorStop(1, hsl(hue + 35, 75, 88));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = hsl(hue + 50, 95, 82); g.beginPath(); g.arc(W * (0.2 + (hue % 60) / 100), H * 0.25, 70, 0, Math.PI * 2); g.fill();
    [[0.42, 0.55, 45], [0.52, 0.62, 32], [0.6, 0.7, 22]].forEach(([top, base, l], k) => {
      g.fillStyle = hsl(hue + 140 + k * 12, 35, l);
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 50) g.lineTo(x, H * (top + 0.08 * Math.sin(x / (90 + k * 40) + hue + k)));
      g.lineTo(W, H); g.closePath(); g.fill();
    });
    gr = g.createLinearGradient(0, H * 0.78, 0, H);
    gr.addColorStop(0, hsl(200, 70, 45)); gr.addColorStop(1, hsl(210, 75, 25));
    g.fillStyle = gr; g.fillRect(0, H * 0.8, W, H * 0.2);
    g.font = "700 46px Inter, system-ui, sans-serif"; g.textAlign = "center"; g.fillStyle = "#fff";
    g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 8;
    g.fillText(String(title).slice(0, 34), W / 2, H * 0.9);
    g.font = "600 24px Inter, system-ui, sans-serif"; g.fillText("Testfoto", W / 2, H * 0.9 - 54);
    return new Promise((res) => c.toBlob((b) => { c.width = 0; c.height = 0; res(b); }, "image/jpeg", 0.8));
  }
  async function startSim() {
    if (app.sim && app.sim.active) { toast("Die Simulation läuft schon.", true); return; }
    const typed = await promptBox("Testspiel simulieren?", "Euer echter Spielstand samt Erinnerungsfotos wird vorher gesichert und mit „Simulation beenden“ exakt wiederhergestellt – für alle Handys. Tippe zur Bestätigung TEST ein:", "TEST");
    if (typed !== "TEST") { if (typed !== null) toast("Abgebrochen – nicht richtig eingetippt.", true); backToSettings("sim"); return; }
    if (!app.online) await poll();
    if (!app.online) { toast(OFFLINE_MSG, true); return; }
    const names = teamNames().length ? teamNames() : players().slice(0, 3);
    const st = L.simulateGame(C, rand32(), Math.round(serverNow()), names);
    const r = await api("sim/start", { method: "POST", body: { state: st, by: app.name } }).catch(() => null);
    if (!r || r.status !== 200 || !r.data.state) { toast("Simulation konnte nicht starten" + (r && r.data && r.data.error ? ": " + r.data.error : " (offline?)."), true); return; }
    closeAll();
    receive(r.data.version, r.data.state, true);
    // Mindestens 7 Test-Erinnerungsfotos (regionale und Stapel-Quests gemischt)
    const done = T.shuffle(Object.keys(st.quests).concat(Object.keys(st.done)), rand32);
    const n = Math.min(done.length, 7 + T.randomInt(4, rand32));
    let ok = 0;
    const prog = document.createElement("div"); // eine Fortschrittsmeldung statt vieler
    prog.className = "toast";
    $("#toast-root").appendChild(prog);
    for (let i = 0; i < n; i++) {
      prog.textContent = "Testfotos werden erzeugt … " + (i + 1) + " von " + n;
      try { await saveMemory(done[i], await simPhoto(questTitle(done[i]), T.randomInt(360, rand32)), true); ok++; } catch (e) { reportError("Simulation", e); }
    }
    prog.remove();
    await loadMemories();
    go("home");
    toast("Simulation läuft – " + ok + " Testfotos. Beenden über das Band oben.");
  }
  async function stopSim() {
    if (!(await confirmBox("Simulation beenden?", "Alle Testdaten (Spielstand und Testfotos) werden gelöscht und euer echter Spielstand wird exakt wiederhergestellt – für alle Handys.", "Beenden"))) return;
    const r = await api("sim/stop", { method: "POST" }).catch(() => null);
    if (!r || r.status !== 200) { toast("Beenden ging nicht" + (r && r.data && r.data.error ? ": " + r.data.error : " (offline?)."), true); return; }
    closeAll();
    certCache.key = null; app.certSel = null;
    if (r.data.state) receive(r.data.version, r.data.state, true);
    else { app.version = r.data.version; app.state = null; render(); poll(); }
    await loadMemories();
    go("home");
    toast("Simulation beendet – euer echter Spielstand ist zurück.");
  }

  // ---- Reset
  async function doReset() {
    if (!(await confirmBox("Kompletter Reset?", "Setzt ALLES auf null und mischt neu – für alle drei Handys, auch alle Erinnerungsfotos werden gelöscht. Das kann nicht rückgängig gemacht werden.", "Weiter", true))) { backToSettings("reset"); return; }
    const typed = await promptBox("Wirklich zurücksetzen?", "Tippe zur Sicherheit RESET ein:", "RESET");
    if (typed !== "RESET") { if (typed !== null) toast("Abgebrochen – nicht richtig eingetippt.", true); backToSettings("reset"); return; }
    if (await act({ type: "reset", seed: Math.floor(Math.random() * 2 ** 31) })) toast("Neues Spiel – viel Spaß!");
  }

  // ------------------------------------------------------------------ Hilfe
  // Spielanleitung als eigene Seite (Einstellungen → Spielanleitung)
  function viewHelp() {
    return '<h2>' + icon("circle-help") + ' Spielanleitung</h2><div class="muted small help-sub">Operação Madeira - Das Spiel</div>' +
      '<button class="btn btn-ghost btn-block tour-again" id="tour-btn">' + icon("play") + " Einführung noch einmal ansehen</button>" +
      '<div class="panel help">' +
      "<h3>" + icon("target") + " Ziel</h3><p>Ihr spielt als <strong>ein Team</strong>: Erkundet alle 10 Regionen Madeiras mit regionalen Quests und sammelt zusätzlich Punkte mit Stapel-Quests. Alle Punkte gehören dem Team – wir vertrauen uns, es gibt keine Beweisfotos.</p>" +
      "<h3>" + icon("map-pinned") + " Regionale Quests und Stufen</h3><p>Jede Region hat 3 regionale Quests an festen Orten – auf der Inselkarte als Pins markiert. Pin antippen öffnet die Quest, Region antippen zeigt alle 3. Eine erledigte regionale Quest erkundet die Region, jede weitere hebt sie eine Stufe.</p>" +
      "<table><tr><th>Stufe</th><th>Quests</th><th>Punkte</th></tr><tr><td>Erkundet</td><td>1</td><td>100</td></tr><tr><td>Erobert</td><td>2</td><td>+20</td></tr><tr><td>Erschlossen</td><td>3</td><td>+20</td></tr></table>" +
      "<p>Alle 10 Regionen erkundet: <strong>„Madeira erkundet!“ +300 Insel-Bonus</strong>. Danach geht das Spiel weiter. Alle 10 Regionen erobert bzw. erschlossen: Meilensteine <strong>„Madeira erobert!“</strong> und <strong>„Madeira erschlossen!“</strong> (ohne Extrapunkte).</p>" +
      "<h3>" + icon("layers") + " Stapel-Quests</h3><p>26 Stapel-Quests, überall auf der Insel machbar (einfach 15, mittel 25, schwer 50 Punkte). Sie liegen gemischt in einem Stapel; immer 3 sind offen, der Rest bleibt verdeckt. Ist eine erledigt, wird automatisch eine neue vom Stapel gezogen. Stapel-Quests erkunden keine Region.</p>" +
      "<p>„" + icon("list-checks") + " Alle Quests“ zeigt alle 56 Quests zum Ansehen.</p>" +
      "<h3>" + icon("shopping-bag") + " Shop</h3><ul><li><strong>Region-Joker (150) · 1 im Spiel:</strong> Region gilt als erkundet, ohne die 100 Punkte.</li>" +
      "<li><strong>Tausch-Joker (10) · 5 im Spiel:</strong> eine offene Stapel-Quest zurück in den Stapel, eine neue wird vom Stapel gezogen. Rückgängig gemachte Tausche zählen nicht.</li>" +
      "<li><strong>Multiplikator (10) · 3 im Spiel:</strong> zufälliger Faktor ×0,5–×2,0 (5 % Jackpot ×5) auf eine offene Stapel-Quest, aufgerundet. Einer pro Stapel-Quest; sie kann danach nicht getauscht werden. Lohnt sich vor allem bei schweren Stapel-Quests.</li></ul>" +
      "<p>Jeder ausgegebene Punkt fehlt am Ende bei den Belohnungen. Ist der Kontostand negativ, ist der Shop gesperrt. Shop und Erfolge zeigen immer, wie viele Joker schon <em>genutzt</em> wurden, z. B. „Tausch-Joker · 2 von 5 genutzt“.</p>" +
      "<h3>" + icon("timer") + " Hilfsmittel</h3><p>Manche regionalen Quests haben unter der Aufgabe eine antippbare Zeile mit einem freiwilligen Hilfsmittel, z. B. Countdown, Fahrzeit stoppen, Autos zählen, Höhe schätzen, Kompass, Tic-Tac-Toe-Spielfeld, geheime Begriffe, geheime Rangfolge, Buchstaben-Fotos, Kriterien wählen oder Bucht zeichnen und raten (Küstenkarte der Ponta de São Lourenço: CAOP, Direção-Geral do Território). Manche Hilfsmittel nehmen Fotos mit der Handykamera auf; sie werden nur für die laufende Runde gespeichert. Bei geheimen Eingaben geht jeder Schritt auf jedem Handy (Phase 1 geheim eingeben, 2 raten, 3 Ergebnis): Wer eingibt, tippt, die anderen schauen weg. Danach ist alles verdeckt; „Anzeigen“ per langem Drücken ist nur für die Person gedacht, die eingegeben hat. „Auflösen“ deckt alles für alle auf. Alle Handys sehen denselben Stand. Ist ein Versuch daneben, startet die Strafzeit automatisch – gesperrt ist dann nur dieses eine Hilfsmittel. Hilfsmittel geben keine Punkte und haken nichts ab – abhaken macht ihr selbst. Manche Stapel-Quests haben Zähler, Timer oder „Höhe messen“; beim Abhaken oder Tauschen beginnen sie wieder bei null. „Wo bin ich?“ bei der Inselkarte fragt einmalig den Standort ab und zeigt Region und Höhe (Geländehöhe: Open-Meteo) – gespeichert wird nichts.</p>" +
      "<h3>" + icon("camera") + " Erinnerungsfotos</h3><p>Zu jeder erledigten Quest könnt ihr ein Foto anhängen – direkt nach dem Abhaken, später im Quest-Fenster, bei den erledigten Stapel-Quests oder bei den Aktivitäten. Ersetzen und Löschen geht jederzeit. Die Fotos bleiben dauerhaft; unter Einstellungen → Erinnerungsfotos lassen sich alle als ZIP herunterladen. Wird eine Quest rückgängig gemacht, ist ihr Foto ausgeblendet; der komplette Reset löscht alle Fotos.</p>" +
      "<h3>" + icon("trophy") + " Ränge</h3><p>Landstreicher (ab 0) · Abenteurer (ab 700) · Inselkönig (ab 1.500). Es zählen die <em>verdienten</em> Punkte – Shop-Ausgaben senken den Rang nicht.</p>" +
      "<p><strong>Maximum:</strong> Ohne Multiplikatoren sind 2.400 Punkte möglich. Jeder Multiplikator verändert dieses Maximum: Die Stapel-Quest zählt dann mit ihrem multiplizierten Wert (Faktor über 1 erhöht, unter 1 senkt das Maximum). Das aktuelle Maximum steht bei den Erfolgen.</p>" +
      "<h3>" + icon("undo-2") + " Rückgängig und Reset</h3><p>Alles lässt sich rückgängig machen (Haken antippen oder bei den Aktivitäten " + icon("undo-2") + "). Wiederholte Käufe bringen dasselbe Ergebnis. Ein kompletter Reset (ganz unten in den Einstellungen) gilt für alle Handys, löscht auch alle Erinnerungsfotos und braucht die Eingabe „RESET“.</p>" +
      "<h3>" + icon("compass") + " Bedienung</h3><p>Die Startseite zeigt die Inselkarte und die 3 offenen Stapel-Quests. Pin antippen öffnet die Quest, Region antippen alle 3 Quests der Region – dort wechselt Wischen nach links/rechts (oder die Pfeile) zur nächsten Region; eine Zahl im Kreis bedeutet mehrere Quests nah beieinander. Bei den Aktivitäten öffnet Antippen eines Eintrags die Quest. Oben rechts: " + icon("shopping-bag") + " Shop, " + icon("trophy") + " Erfolge (Rang, Regionen, Punkte und Diagramme), " + icon("history") + " Aktivitäten (alles, was passiert ist, mit Rückgängig) und " + icon("settings") + " Einstellungen (diese Spielanleitung, Spieler, Spielstand sichern, Urlaub beenden, Reset). „← Zu den Quests“ führt zurück zur Startseite; in den Unterseiten der Einstellungen gibt es zusätzlich „← Einstellungen“.</p>" +
      "<h3>" + icon("flag") + " Ende</h3><p>„Urlaub beenden &amp; Belohnungen“ (unter Einstellungen) tauscht die Restpunkte in Belohnungen um. Danach gibt es das Zertifikat als PDF.</p>" +
      '<p class="muted small">Straßen im Urlaubs-Rückblick: Routendaten © OpenStreetMap-Mitwirkende (berechnet mit OSRM).</p>' +
      "</div>";
  }

  // ------------------------------------------------------------------ Erinnerungsfotos
  // Zu jeder erledigten Quest (regional und Stapel) genau ein Foto, dauerhaft auf dem Server (data/memories/, nicht im
  // Spielstand). Aufnehmen/Auswählen und Verkleinern laufen unverändert über die Foto-Grundlage der Hilfsmittel
  // (photoPicker, Kamera in der Seite, Galerie, Dateien) mit der Kennung "mem:<Quest-ID>"; statt eingetragen zu werden,
  // geht das verkleinerte Foto mit einem kleinen Vorschaubild an POST api/memory/<Quest-ID>. Die Liste (app.mem) kommt
  // von GET api/memories und wird neu geladen, sobald sich ihre Versionsnummer (memv, bei jeder Spielstand-Antwort) ändert.
  // Ist eine Quest gerade nicht erledigt (rückgängig gemacht), wird ihr Foto nirgends gezeigt. Reset löscht alle.
  const THUMB_SIDE = 320;
  const isMem = (qid) => typeof qid === "string" && qid.indexOf("mem:") === 0;
  const questDone = (id) => !!(app.state && (app.state.quests[id] || app.state.done[id]));
  const questTitle = (id) => (IX.quests[id] || IX.stack[id] || {}).title || id;
  const memFor = (id) => (app.mem && app.mem.items[id] && questDone(id) ? app.mem.items[id] : null);
  const memUrl = (it, thumb) => "api/memory-file/" + it.f + (thumb ? ".t.jpg" : ".jpg") + "?t=" + encodeURIComponent(app.token || "");
  const memThumb = (it, cls) => '<img class="' + (cls || "mem-thumb") + '" src="' + memUrl(it, true) + '" alt="Erinnerungsfoto" loading="lazy" decoding="async" onerror="this.classList.add(\'gone\')">';
  const visibleMems = () => (app.mem ? Object.keys(app.mem.items).filter((id) => memFor(id)) : []);
  async function loadMemories(v) {
    if (app.memLoading) { app.memAgain = true; return; }
    app.memLoading = true;
    if (v != null) app.memv = v;
    try {
      const r = await api("memories").catch(() => null);
      if (r && r.status === 200 && r.data && r.data.items) { setMem(r.data); return; }
      if (v != null) app.memv = null; // beim nächsten Mal erneut versuchen
    } finally {
      app.memLoading = false;
      if (app.memAgain) { app.memAgain = false; loadMemories(); }
    }
  }
  function setMem(data) {
    app.mem = data; app.memv = data.v;
    app.certSel = null; // Auswahl für die Urkunde neu aus dem Server-Stand
    if (photoBusy() || toolUI.dragging || mapUI.active) { toolUI.refreshPending = true; return; }
    if (app.state && L.isCompatible(app.state, C)) render();
  }
  // Teil des Dateinamens im ZIP (Datum_Region_Quest.jpg): Umlaute umschreiben, Akzente weg, nur Buchstaben/Ziffern
  const fileLabel = (t) => String(t).replace(/[äöüÄÖÜß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss" }[c]))
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  function memLabel(id) {
    const q = IX.quests[id];
    return (q ? fileLabel(IX.regions[q.region].name) : "Stapel") + "_" + fileLabel(questTitle(id));
  }
  // Vorschaubild (lange Seite ≤ 320 px) aus dem schon verkleinerten Foto
  async function makeThumb(blob) {
    const url = URL.createObjectURL(blob), img = new Image(), c = document.createElement("canvas");
    try {
      img.src = url;
      await img.decode();
      const w = img.naturalWidth, h = img.naturalHeight, sc = Math.min(1, THUMB_SIDE / Math.max(w, h));
      c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const out = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.75));
      if (!out || out.size < 100 || !(await isJpeg(out))) throw Object.assign(new Error("kein gültiges Vorschaubild"), { name: "LeeresBild" });
      return out;
    } finally { c.width = 0; c.height = 0; img.removeAttribute("src"); URL.revokeObjectURL(url); }
  }
  async function saveMemory(id, small, quiet) {
    let thumb;
    try { thumb = await makeThumb(small); } catch (e) { throw new PhotoError("shrink", e.name || "Fehler", "Vorschaubild: " + (e.message || ""), "Bitte „Erneut versuchen“."); }
    const url = "api/memory/" + encodeURIComponent(id) + "?tl=" + thumb.size + "&label=" + encodeURIComponent(memLabel(id)) + "&by=" + encodeURIComponent(app.name || "");
    const data = await uploadPhoto(new Blob([thumb, small], { type: "image/jpeg" }), url);
    delete toolUI.memReplace[id];
    if (data && data.items) setMem(data);
    if (!quiet) toast("Erinnerungsfoto gespeichert.");
  }
  toolUI.memReplace = {};
  function memoryBody(qid) {
    const id = qid.slice(4), it = memFor(id);
    if (!questDone(id)) return '<p class="tool-warn">' + icon("eye-off") + " Diese Quest ist gerade nicht erledigt – ihr Erinnerungsfoto ist ausgeblendet.</p>";
    if (it && !toolUI.memReplace[id]) {
      return '<img class="mem-photo" src="' + memUrl(it) + '" alt="Erinnerungsfoto zu ' + esc(questTitle(id)) + '" decoding="async" onerror="this.classList.add(\'gone\')">' +
        '<p class="muted small mem-meta">' + (it.by ? "von " + esc(it.by) + " · " : "") + when(it.t) + " · " + fmtSize(it.size || 0) + "</p>" +
        '<div class="grid2"><button class="btn btn-ghost" data-tool-ui="mem-replace">' + icon("camera") + " Ersetzen</button>" +
        '<button class="btn btn-ghost" data-tool-ui="mem-delete">' + icon("trash-2") + " Löschen</button></div>";
    }
    return '<p class="muted small">' + (it ? "Das neue Foto ersetzt das bisherige." : "Ein Foto für euren Urlaubs-Rückblick – freiwillig, eins pro Quest.") + "</p>" +
      photoPicker(qid, false) + (it ? '<button class="btn btn-small btn-ghost btn-block" data-tool-ui="mem-cancel">Abbrechen</button>' : "");
  }
  function openMemory(id) {
    const qid = "mem:" + id;
    const m = openModal(() => '<div class="modal-head"><h2 class="tool-title">' + icon("camera") + " Erinnerungsfoto</h2>" +
      '<button class="modal-close" data-close aria-label="Schließen">' + icon("x") + "</button></div>" +
      '<p class="muted small tool-sub-title">' + esc(questTitle(id)) + (IX.quests[id] ? " · " + esc(IX.regions[IX.quests[id].region].name) : " · Stapel-Quest") + "</p>" +
      '<div class="tool mem-tool" data-tool="' + qid + '"><div class="tool-body">' + toolBody(qid) + "</div></div>", bindTools, { stack: true, where: "Erinnerungsfoto: " + questTitle(id) });
    const refresh = m.refresh;
    m.refresh = () => { if (photoBusy(qid)) toolUI.refreshPending = true; else refresh(); };
    m.el.addEventListener("click", (ev) => { if (ev.target === m.el && app.modals[app.modals.length - 1] === m) closeModal(); });
    m.onClose = () => { delete toolUI.memReplace[id]; if (toolUI.cam && toolUI.cam.qid === qid) stopCamera(); };
  }
  async function deleteMemory(id) {
    if (!(await confirmBox("Erinnerungsfoto löschen?", "Das Foto zu „" + questTitle(id) + "“ wird für alle Handys gelöscht.", "Löschen", true))) return;
    if (!app.online) { toast(OFFLINE_MSG, true); return; }
    const r = await api("memory/" + encodeURIComponent(id) + "/delete", { method: "POST" }).catch(() => null);
    if (!r || r.status !== 200) { toast("Löschen ging nicht (offline?).", true); return; }
    setMem(r.data);
    toast("Erinnerungsfoto gelöscht.");
  }
  // Nach dem Abhaken (eigenes Handy): kurzes, überspringbares Angebot
  function offerMemory(id) {
    if (memFor(id)) return;
    let tries = 0;
    const show = () => { // nach den Animationen (Region erkundet schließt die Fenster; Banner abwarten)
      if (!questDone(id) || memFor(id)) return;
      if ($(".banner, .big-celebration") && tries++ < 8) { setTimeout(show, 700); return; }
      openModal(() => '<h2>' + icon("camera") + " Erinnerungsfoto hinzufügen?</h2>" +
        '<p class="muted">„' + esc(questTitle(id)) + "“ ist erledigt. Ein Foto dazu – für euren Urlaubs-Rückblick.</p>" +
        '<div class="grid2 mem-offer"><button class="btn btn-ghost" id="mo-no">Überspringen</button><button class="btn btn-primary" id="mo-yes">' + icon("camera") + " Foto hinzufügen</button></div>",
      (el) => {
        $("#mo-no", el).addEventListener("click", () => closeModal());
        $("#mo-yes", el).addEventListener("click", () => { closeModal(); openMemory(id); });
      }, { static: true, stack: true, where: "Angebot Erinnerungsfoto" });
    };
    setTimeout(show, 900);
  }
  // Zeile in der erledigten Quest bzw. kleines Vorschaubild in Listen (Aktivitäten, erledigte Stapel-Quests)
  function memLine(id) {
    const it = memFor(id);
    return '<button class="tool-line mem-line" data-mem="' + id + '">' + (it ? memThumb(it, "mem-thumb mem-thumb-sm") : icon("camera")) +
      '<span class="tl-label">' + (it ? "Erinnerungsfoto ansehen" : "Erinnerungsfoto hinzufügen") + "</span>" + icon("chevron-right", "tl-end") + "</button>";
  }
  function memChip(id) {
    const it = memFor(id);
    return '<button class="mem-chip" data-mem="' + id + '" aria-label="' + (it ? "Erinnerungsfoto ansehen" : "Erinnerungsfoto hinzufügen") + '">' +
      (it ? memThumb(it) : icon("camera")) + "</button>";
  }
  // Einstellungen → Erinnerungsfotos: Speicherplatz, ZIP herunterladen, Übersicht mit Vorschaubildern
  function viewPhotos() {
    const ids = visibleMems().sort((a, b) => ((app.state.quests[a] || app.state.done[a]).t - (app.state.quests[b] || app.state.done[b]).t));
    const zip = "api/memories.zip?t=" + encodeURIComponent(app.token || "") + "&tz=" + new Date().getTimezoneOffset();
    return pageHead("image", "Erinnerungsfotos") +
      '<div class="panel set-panel">' +
        '<p class="muted small" style="margin:0">Zu jeder erledigten Quest könnt ihr ein Foto anhängen – im Quest-Fenster, bei den erledigten Stapel-Quests oder bei den Aktivitäten. Die Fotos bleiben dauerhaft gespeichert; nur der komplette Reset löscht sie.</p>' +
        '<p class="set-line">' + icon("image") + " " + memStorage() + "</p>" +
        (ids.length ? '<a class="btn btn-primary btn-block" id="mem-zip" href="' + esc(zip) + '" download>' + icon("download") + " Alle Fotos herunterladen (ZIP)</a>"
          : '<button class="btn btn-primary btn-block" disabled>' + icon("download") + " Alle Fotos herunterladen (ZIP)</button>") +
        '<p class="muted small" style="margin:0">Dateinamen: Datum_Region_Quest.jpg</p>' +
      "</div>" +
      (ids.length ? '<div class="mem-grid">' + ids.map((id) => '<button class="mem-tile" data-mem="' + id + '">' + memThumb(memFor(id)) +
        '<span class="mem-cap">' + esc(questTitle(id)) + "</span></button>").join("") + "</div>" +
        '<div class="panel set-panel cp-panel">' + certPickHTML(app.certSel || (app.certSel = certPhotoIds().slice())) +
        '<p class="muted small" style="margin:0">Vorauswahl für die Urkunde – vor der Urkunde könnt ihr sie noch ändern. Gilt für alle Handys.</p></div>'
        : '<p class="muted small">Noch keine Erinnerungsfotos.</p>');
  }
  function memStorage() {
    if (!app.mem) return "Speicherplatz wird geladen …";
    const n = visibleMems().length;
    return n + (n === 1 ? " Foto" : " Fotos") + " · belegt " + fmtSize(app.mem.bytes || 0) + (app.mem.dataBytes ? " (alle Daten zusammen " + fmtSize(app.mem.dataBytes) + ")" : "");
  }

  // ------------------------------------------------------------------ Einführung
  // Erscheint einmal pro Handy nach dem ersten Anmelden (localStorage „tourDone“), wiederholbar unter Einstellungen →
  // Spielanleitung. 5 kurze Schritte mit Hervorhebung; „Überspringen“, „Weiter“, am Ende „Los geht's“.
  const TOUR = [
    { sel: "#map-wrap", title: "Regionale Quests", text: "Pin antippen öffnet eine Quest, Region antippen zeigt alle drei Quests dort." },
    { sel: ".stack-zone .zone-head", title: "Stapel-Quests", text: "Drei Stapel-Quests sind immer offen und überall machbar – nach dem Abhaken wird nachgezogen." },
    { sel: '.hdr-btn[data-go="shop"]', title: "Shop", text: "Hier tauscht ihr Punkte gegen Joker und Multiplikatoren." },
    { sel: '.hdr-btn[data-go="stats"]', title: "Erfolge", text: "Rang, Regionen und Punkte des Teams auf einen Blick." },
    { sel: '.hdr-btn[data-go="settings"]', title: "Einstellungen", text: "Spielanleitung, Mitspieler und Erinnerungsfotos – und Wischen wechselt zwischen den Seiten." }
  ];
  const tour = { on: false, i: 0, el: null };
  function startTour() {
    if (tour.on || !app.state || !L.isCompatible(app.state, C)) return;
    closeAll();
    if (app.view !== "home") show("home");
    tour.on = true; tour.i = 0;
    const el = tour.el = document.createElement("div");
    el.className = "tour";
    el.innerHTML = '<div class="tour-hole"></div><div class="tour-card" role="dialog" aria-modal="true" aria-live="polite"></div>';
    document.body.appendChild(el);
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-tour]");
      if (!b) return;
      if (b.dataset.tour === "next" && tour.i < TOUR.length - 1) { tour.i++; tourStep(); } else endTour();
    });
    tourStep();
  }
  function endTour() {
    if (!tour.on) return;
    tour.on = false;
    store.set("tourDone", "1");
    if (tour.el) tour.el.remove();
    tour.el = null;
    window.scrollTo(0, 0);
  }
  function tourStep() {
    const st = TOUR[tour.i], card = $(".tour-card", tour.el), last = tour.i === TOUR.length - 1;
    card.innerHTML = '<div class="tour-count small muted">' + (tour.i + 1) + " von " + TOUR.length + "</div>" +
      "<h3>" + esc(st.title) + "</h3><p>" + esc(st.text) + "</p>" +
      '<div class="tour-btns"><button class="btn btn-ghost btn-small" data-tour="skip"' + (last ? " hidden" : "") + ">Überspringen</button>" +
      '<button class="btn btn-primary" data-tour="next">' + (last ? "Los geht's" : "Weiter") + "</button></div>";
    const target = $(st.sel);
    if (target && !target.closest(".topbar")) target.scrollIntoView({ block: "center" });
    requestAnimationFrame(tourPlace);
    const btn = $('[data-tour="next"]', card); if (btn) btn.focus({ preventScroll: true });
  }
  function tourPlace() {
    if (!tour.on || !tour.el) return;
    const target = $(TOUR[tour.i].sel), hole = $(".tour-hole", tour.el), card = $(".tour-card", tour.el);
    const W = window.innerWidth, H = window.innerHeight, pad = 6;
    if (!target) { hole.hidden = true; card.style.top = Math.round(H / 2 - card.offsetHeight / 2) + "px"; return; }
    const r = target.getBoundingClientRect();
    const top = Math.max(4, r.top - pad), bottom = Math.min(H - 4, r.bottom + pad);
    hole.hidden = false;
    Object.assign(hole.style, { left: Math.max(4, r.left - pad) + "px", top: top + "px", width: Math.min(W - 8, r.width + pad * 2) + "px", height: Math.max(0, bottom - top) + "px" });
    const ch = card.offsetHeight, below = H - bottom - 12, above = top - 12;
    const y = below >= ch ? bottom + 12 : above >= ch ? top - 12 - ch : Math.max(12, H - ch - 12);
    card.style.top = Math.round(y) + "px";
  }
  window.addEventListener("resize", () => { if (tour.on) tourPlace(); });
  window.addEventListener("scroll", () => { if (tour.on) tourPlace(); }, { passive: true });
  document.addEventListener("keydown", (ev) => { if (tour.on && ev.key === "Escape") endTour(); });

  // ---- Plus/Minus gedrückt halten (alle Knöpfe mit data-hold): kurzes Tippen wie bisher (normaler Klick); nach 0,45 s
  // gedrückt wird wiederholt ausgelöst, nach einigen Schritten schneller; Loslassen, Abbrechen oder Verschieben stoppt sofort.
  // Ausgelöst wird jeweils der aktuelle Knopf mit derselben Kennung (er wird beim Neuzeichnen ersetzt) – so gelten alle
  // Grenzen der normalen Klick-Funktion. Kein Markieren/Kontextmenü (CSS + contextmenu).
  const hold = { t: null, sig: null, x: 0, y: 0, n: 0, until: 0 };
  function holdStop() {
    if (hold.t) clearTimeout(hold.t);
    if (hold.n) hold.until = Date.now() + 450; // der abschließende echte Klick zählt nicht mehr mit
    hold.t = null; hold.sig = null; hold.n = 0;
  }
  document.addEventListener("pointerdown", (ev) => {
    const b = ev.target.closest && ev.target.closest("[data-hold]");
    if (!b || b.disabled || (ev.button != null && ev.button > 0)) return;
    holdStop();
    hold.sig = b.dataset.hold; hold.x = ev.clientX; hold.y = ev.clientY; hold.until = 0;
    const step = () => {
      const all = $$('[data-hold="' + hold.sig + '"]'), cur = all[all.length - 1];
      if (!cur || cur.disabled) { holdStop(); return; }
      hold.n++;
      cur.click();
      hold.t = setTimeout(step, hold.n < 6 ? 150 : hold.n < 20 ? 75 : 35);
    };
    hold.t = setTimeout(step, 450);
  }, true);
  ["pointerup", "pointercancel"].forEach((t) => document.addEventListener(t, holdStop, true));
  document.addEventListener("pointermove", (ev) => { if (hold.sig && Math.hypot(ev.clientX - hold.x, ev.clientY - hold.y) > 12) holdStop(); }, true);
  window.addEventListener("blur", holdStop);
  document.addEventListener("click", (ev) => {
    if (ev.isTrusted && hold.until > Date.now() && ev.target.closest && ev.target.closest("[data-hold]")) { hold.until = 0; ev.preventDefault(); ev.stopPropagation(); }
  }, true);
  document.addEventListener("contextmenu", (ev) => { if (ev.target.closest && ev.target.closest("[data-hold]")) ev.preventDefault(); });

  // ------------------------------------------------------------------ Modals
  function openModal(renderFn, bindFn, opts) {
    opts = opts || {};
    if (!opts.stack) closeAll();
    const root = $("#modal-root");
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = '<div class="modal" role="dialog" aria-modal="true"></div>';
    root.appendChild(backdrop);
    const el = $(".modal", backdrop);
    const refresh = () => {
      const scroll = el.scrollTop;
      const focused = document.activeElement && document.activeElement.dataset ? Object.assign({}, document.activeElement.dataset) : null;
      // Eingaben in Hilfsmitteln (z. B. halb getippte Schätzung) überleben das Neuzeichnen
      const kept = {};
      $$("[data-keep]", el).forEach((i) => { kept[i.dataset.keep] = i.value; });
      el.innerHTML = renderFn();
      el.classList.toggle("sheet", !opts.static && !!$(".modal-close", el)); // größere Fenster mit X: nach unten wegziehen
      $$("[data-keep]", el).forEach((i) => { if (kept[i.dataset.keep] != null) i.value = kept[i.dataset.keep]; });
      $$("[data-close]", el).forEach((b) => b.addEventListener("click", closeModal));
      if (bindFn) bindFn(el, refresh);
      el.scrollTop = scroll;
      if (focused && focused.amount) { const f = $('[data-amount="' + focused.amount + '"]', el); if (f) f.focus(); }
      if (focused && focused.keep) { const f = $('[data-keep="' + focused.keep + '"]', el); if (f) f.focus(); }
    };
    if (!opts.stack) backdrop.addEventListener("click", (ev) => { if (ev.target === backdrop) closeModal(); });
    const m = { refresh: opts.static ? () => {} : refresh, el: backdrop, onClose: null, where: opts.where || "" };
    if (!opts.static) bindSheet(m, el, opts.sheet);
    app.modals.push(m);
    refresh();
    return m;
  }
  // ---- Fenster nach unten wegziehen (größere Fenster mit X-Knopf, Klasse .sheet mit Griff-Strich oben)
  // Ist der Inhalt ganz oben, folgt das Fenster dem Finger nach unten (nur transform, requestAnimationFrame) und schließt
  // sich, wenn weit genug (> 30 % der Höhe) oder schnell genug gezogen; sonst federt es zurück. Ist der Inhalt nach unten
  // gescrollt, scrollt Wischen nach unten zuerst den Inhalt zurück (erst ein neuer Wisch ganz oben schließt). Waagerechtes
  // Wischen (Regionen-Fenster) und Ziehen in Listen, Karten, Zeichenfläche, Kamera und Feldern bleiben unberührt (m.lock).
  const SHEET_NO = "input, textarea, select, canvas, .sort-list, .sort-item, .bay-map-wrap, .draw-pad, .cam, [data-cam-slot], .no-swipe";
  function bindSheet(m, box, getScroller) {
    let g = null, raf = 0, y = 0;
    const paint = () => {
      raf = 0;
      box.style.transform = y ? "translate3d(0," + y + "px,0)" : "";
      m.el.style.backgroundColor = y ? "rgba(4, 25, 33, " + (0.55 * Math.max(0, 1 - y / (box.offsetHeight || 1))).toFixed(3) + ")" : "";
    };
    box.addEventListener("touchstart", (e) => {
      g = null; m.lock = null;
      if (e.touches.length !== 1 || !box.classList.contains("sheet") || app.modals[app.modals.length - 1] !== m || e.target.closest(SHEET_NO)) return;
      const t = e.touches[0];
      g = { x0: t.clientX, y0: t.clientY, mode: "?", hist: [] };
    }, { passive: true });
    box.addEventListener("touchmove", (e) => {
      if (!g) return;
      if (e.touches.length !== 1) { finish(true); return; }
      const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
      if (g.mode === "?") {
        if (m.lock && m.lock !== "v") { g = null; return; }
        const sc = getScroller ? getScroller() : box;
        if (!sc || sc.scrollTop > 0) { g = null; return; }                    // nach unten gescrollt: erst zurückscrollen
        if (dy < -4 || Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { g = null; return; } // hoch bzw. waagerecht
        if (dy > 0 && e.cancelable) e.preventDefault();                       // ganz oben: Browser soll nicht erst scrollen
        if (dy < 8 || dy < Math.abs(dx) * 1.2) return;
        if (!e.cancelable) { g = null; return; }
        g.mode = "v"; m.lock = "v";
        box.style.transition = "none"; m.el.style.transition = "none";
      }
      if (e.cancelable) e.preventDefault();
      g.hist.push([performance.now(), t.clientY]); if (g.hist.length > 6) g.hist.shift();
      y = Math.max(0, t.clientY - g.y0);
      if (!raf) raf = requestAnimationFrame(paint);
    }, { passive: false });
    function finish(cancel) {
      const x = g; g = null;
      if (!x || x.mode !== "v") return;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      const h = x.hist, H = box.offsetHeight || window.innerHeight;
      const v = h.length > 1 ? (h[h.length - 1][1] - h[0][1]) / Math.max(1, h[h.length - 1][0] - h[0][0]) : 0;
      const close = !cancel && (y > H * 0.3 || (y > 60 && v > 0.5));
      box.style.transition = "transform " + (close ? ".22s ease-in" : ".26s cubic-bezier(.2,.8,.2,1)");
      m.el.style.transition = "background-color .22s";
      if (close) {
        y = H + 40; paint();
        m.el.style.backgroundColor = "rgba(4, 25, 33, 0)";
        setTimeout(() => { if (app.modals[app.modals.length - 1] === m) closeModal(); }, 220);
      } else {
        y = 0; paint();
        setTimeout(() => { if (!g) { box.style.transition = ""; m.el.style.transition = ""; } }, 280);
      }
    }
    box.addEventListener("touchend", () => finish(false));
    box.addEventListener("touchcancel", () => finish(true));
  }
  function closeModal() {
    const m = app.modals.pop();
    if (m) { m.el.remove(); if (m.onClose) m.onClose(); }
  }
  function closeAll() { while (app.modals.length) closeModal(); }
  function confirmBox(title, text, ok, danger) {
    return new Promise((resolve) => {
      let done = false;
      let m;
      const finish = (v) => { if (!done) { done = true; if (app.modals[app.modals.length - 1] === m) closeModal(); resolve(v); } };
      m = openModal(() => '<h2>' + esc(title) + '</h2><p class="muted">' + esc(text) + "</p>" +
        '<div class="modal-actions"><button class="btn btn-ghost" id="cb-no">Abbrechen</button><button class="btn ' + (danger ? "btn-danger" : "btn-primary") + '" id="cb-yes">' + esc(ok) + "</button></div>",
      (el) => {
        $("#cb-no", el).addEventListener("click", () => finish(false));
        $("#cb-yes", el).addEventListener("click", () => finish(true));
      }, { static: true, stack: true });
      m.onClose = () => finish(false);
      m.el.addEventListener("click", (ev) => { if (ev.target === m.el) finish(false); });
    });
  }
  function promptBox(title, text, placeholder) {
    return new Promise((resolve) => {
      let done = false;
      let m;
      const finish = (v) => { if (!done) { done = true; if (app.modals[app.modals.length - 1] === m) closeModal(); resolve(v); } };
      m = openModal(() => "<h2>" + esc(title) + '</h2><p class="muted">' + esc(text) + '</p><input id="pb-input" autocomplete="off" autocapitalize="characters" placeholder="' + esc(placeholder) + '">' +
        '<div class="modal-actions"><button class="btn btn-ghost" id="pb-no">Abbrechen</button><button class="btn btn-danger" id="pb-yes">Bestätigen</button></div>',
      (el) => {
        $("#pb-no", el).addEventListener("click", () => finish(null));
        $("#pb-yes", el).addEventListener("click", () => finish($("#pb-input", el).value.trim()));
        setTimeout(() => $("#pb-input", el).focus(), 50);
      }, { static: true, stack: true });
      m.onClose = () => finish(null);
    });
  }

  // ------------------------------------------------------------------ Effekte
  function toast(msg, err) {
    const t = document.createElement("div");
    t.className = "toast" + (err ? " err" : "");
    t.textContent = msg;
    $("#toast-root").appendChild(t);
    setTimeout(() => t.remove(), err ? 4200 : 2800);
  }
  function banner(title, sub) {
    const b = document.createElement("div");
    b.className = "banner";
    b.innerHTML = '<div class="b-title">' + title + "</div>" + (sub ? '<div class="muted">' + esc(sub) + "</div>" : "");
    document.body.appendChild(b);
    setTimeout(() => { b.style.transition = "opacity .4s"; b.style.opacity = "0"; setTimeout(() => b.remove(), 400); }, 2300);
  }
  const COLORS = ["#e0475b", "#e5b53b", "#2f9e44", "#0b5f78", "#a6e3a1", "#8a3fc7", "#f28c28"];
  function confetti(n, origin) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = $("#fx-root");
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("div");
      p.className = "confetti";
      p.style.background = COLORS[i % COLORS.length];
      const x0 = origin ? origin.x : Math.random() * W;
      const y0 = origin ? origin.y : -20;
      p.style.left = x0 + "px"; p.style.top = y0 + "px";
      root.appendChild(p);
      const dx = origin ? (Math.random() - 0.5) * 260 : (Math.random() - 0.5) * 200;
      const dy = origin ? -80 - Math.random() * 160 : H + 40;
      const rot = Math.random() * 720;
      const dur = origin ? 900 + Math.random() * 500 : 1800 + Math.random() * 1600;
      const anim = p.animate(origin ? [
        { transform: "translate(0,0) rotate(0)", opacity: 1 },
        { transform: "translate(" + dx + "px," + dy + "px) rotate(" + rot + "deg)", opacity: 1, offset: 0.5 },
        { transform: "translate(" + dx * 1.3 + "px," + (dy + 220) + "px) rotate(" + rot * 1.5 + "deg)", opacity: 0 }
      ] : [
        { transform: "translate(0,0) rotate(0)" },
        { transform: "translate(" + dx + "px," + dy + "px) rotate(" + rot + "deg)" }
      ], { duration: dur, easing: "cubic-bezier(.2,.6,.4,1)", delay: origin ? 0 : Math.random() * 400 });
      anim.onfinish = () => p.remove();
    }
  }
  function burst(el, state) {
    if (!el || !el.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    const origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    confetti(26, origin);
    const last = state.log[state.log.length - 1];
    if (last && last.dE > 0) {
      const f = document.createElement("div");
      f.className = "float-pts";
      f.textContent = "+" + last.dE;
      f.style.left = origin.x - 30 + "px"; f.style.top = origin.y - 30 + "px";
      $("#fx-root").appendChild(f);
      setTimeout(() => f.remove(), 1400);
    }
  }

  // Animationen bei Fortschritt – auch wenn ein anderes Handy abgehakt hat
  function celebrate(prevState, nextState, own) {
    const a = L.summary(prevState, C), b = L.summary(nextState, C);
    if (!a.allExplored && b.allExplored) { bigCelebration(b, "erkundet"); return; }
    if (!a.allDeveloped && b.allDeveloped) { bigCelebration(b, "erschlossen"); return; }
    if (!a.allConquered && b.allConquered) { bigCelebration(b, "erobert"); return; }
    const newly = C.regions.filter((r) => a.levels[r.id] === 0 && b.levels[r.id] >= 1);
    if (newly.length) {
      const r = newly[0];
      const viaJoker = nextState.joker && nextState.joker.region === r.id;
      setTimeout(() => {
        closeAll();
        banner(icon("compass") + " " + r.name + " erkundet!", viaJoker ? "per Region-Joker" : "+100 Punkte");
        confetti(90);
        const path = $('.region-path[data-region="' + r.id + '"]');
        if (path) path.classList.add("pulse");
      }, own ? 450 : 0);
    } else {
      const up = C.regions.find((r) => b.levels[r.id] > a.levels[r.id] && a.levels[r.id] >= 1);
      if (up) setTimeout(() => banner(icon("star") + " " + up.name + ": " + L.LEVELS[b.levels[up.id]].name + "!", "+20 Punkte"), own ? 400 : 0);
    }
    if (b.rank > a.rank) setTimeout(() => { banner(icon("trophy") + " Neuer Rang: " + b.rankName, fmt(b.earned) + " Punkte verdient"); confetti(80); }, 2800);
    if (!a.stackFinished && b.stackFinished) setTimeout(() => banner(icon("layers") + " Stapel geschafft!", "Alle 26 Stapel-Quests erledigt"), 1200);
  }
  // Große Animation für die Meilensteine erkundet (+300), erobert und erschlossen (ohne Punkte)
  function bigCelebration(s, kind) {
    closeAll();
    const o = document.createElement("div");
    o.className = "big-celebration";
    const bonus = kind === "erkundet" ? "+300 Insel-Bonus" : "Meilenstein erreicht";
    o.innerHTML = '<div><div class="sub">Alle 10 Regionen ' + kind + '</div><h1>Madeira ' + kind + '!</h1>' + mapSVG(s.levels, { labels: false }) +
      '<div class="bonus">' + bonus + '</div><button class="btn btn-gold">Weiter geht\'s!</button></div>';
    document.body.appendChild(o);
    $("button", o).addEventListener("click", () => o.remove());
    confetti(220);
    setTimeout(() => confetti(160), 1200);
    setTimeout(() => confetti(120), 2600);
  }
  function announceRemote(prev, next) {
    const known = prev.log.length ? prev.log[prev.log.length - 1].id : 0;
    next.log.filter((e) => e.id > known && e.by !== app.name).slice(-3).forEach((e) => toast(e.by + ": " + e.text));
  }

  // ------------------------------------------------------------------ Hilfsfunktionen
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function when(ts, full) {
    const d = new Date(ts);
    const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const today = new Date().toDateString() === d.toDateString();
    return (today && !full ? "heute " : d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" }) + ", ") + time;
  }

  // Mitspieler-Felder: Getipptes merken (übersteht Neuzeichnen durch die Synchronisierung)
  document.addEventListener("input", (ev) => {
    if (ev.target.classList && ev.target.classList.contains("team-input")) (app.teamDraft = app.teamDraft || {})[ev.target.dataset.team] = ev.target.value;
  });
  // ------------------------------------------------------------------ Events
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("button, [data-region]");
    if (!t || !app.state) return;
    if (t.id === "upgrade-btn") return confirmBox("Neues Spiel starten?", "Alles wird auf null gesetzt und der Stapel neu gemischt – für alle Handys.", "Neu starten", true)
      .then((ok) => ok && act({ type: "reset", seed: Math.floor(Math.random() * 2 ** 31) }));
    if (!L.isCompatible(app.state, C)) return;
    if (t.closest(".modal")) return; // Modals binden selbst
    if (t.hasAttribute("data-map-reset")) { if (mapUI.pz) mapUI.pz.reset(); return; } // auch per Tastatur
    if (t.hasAttribute("data-here")) return whereAmI();
    if (t.closest("#map-wrap")) return; // Inselkarte: eigene Steuerung (Antippen, Zoomen, Zurücksetzen über panZoom)
    if (t.hasAttribute("data-all-quests")) return openAllQuests();
    if (t.dataset.openTool) return openTool(t.dataset.openTool); // Hilfsmittel einer offenen Stapel-Quest
    if (t.hasAttribute("data-here-close")) { mapUI.here = null; return render(); }
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.region) return openRegion(t.dataset.region);
    if (t.dataset.done) { const id = t.dataset.done; return act({ type: "stack", questId: id }, { fxFrom: t }).then((ok) => ok && offerMemory(id)); }
    if (t.dataset.mem) return openMemory(t.dataset.mem);
    if (t.dataset.cp) { // Einstellungen → Fotos für die Urkunde: sofort für alle speichern
      const sel = app.certSel || (app.certSel = certPhotoIds().slice());
      if (toggleCertSel(sel, t.dataset.cp)) { render(); saveCertSel(sel).then((ok) => { if (!ok) { app.certSel = null; render(); } }); }
      return;
    }
    if (t.dataset.openQ) return IX.quests[t.dataset.openQ] ? openQuest(t.dataset.openQ) : openStackQuest(t.dataset.openQ);
    if (t.dataset.swap) return doSwap(t.dataset.swap);
    if (t.dataset.mult) return doMult(t.dataset.mult);
    if (t.dataset.undo) return undo(Number(t.dataset.undo));
    switch (t.id) {
      case "buy-joker": {
        const rid = $("#joker-region").value;
        return confirmBox("Region-Joker kaufen?", IX.regions[rid].name + " gilt dann als erkundet (ohne 100 Punkte). Kosten: 150 Punkte. Region-Joker: 0 von 1 genutzt.", "Kaufen (150)")
          .then((ok) => ok && act({ type: "joker", regionId: rid }));
      }
      case "end-btn": return startEnd();
      case "reset-btn": return doReset();
      case "backup-btn": return downloadBackup();
      case "team-save": return saveTeam();
      case "errlog-copy": return copyErrorLog();
      case "errlog-clear": return confirmBox("Protokoll leeren?", "Alle Einträge im Fehlerprotokoll werden gelöscht – für alle Handys.", "Leeren", true).then(async (ok) => {
        if (!ok) return backToSettings("errors");
        const r = await api("client-errors/clear", { method: "POST" }).catch(() => null);
        if (!r || r.status !== 200) { toast("Leeren ging nicht (offline?).", true); return; }
        toast("Fehlerprotokoll geleert.");
        loadErrorLog();
      });
      case "restore-btn": return $("#restore-file").click();
      case "logout-btn": return logout();
      case "rename-btn": return promptBox("Name ändern", "Unter diesem Namen erscheinen deine Aktionen bei den Aktivitäten.", app.name).then((n) => {
        if (n) { app.name = n.slice(0, 24); store.set("name", app.name); registerName(); render(); }
      });
      case "sim-btn": return startSim();
      case "sim-stop": return stopSim();
      case "tour-btn": go("home"); return setTimeout(startTour, 350);
      case "recap-btn": return startRecap();
      case "pdf-btn": return downloadPDF().catch(() => toast("PDF konnte nicht erstellt werden.", true));
      case "reopen-btn": return confirmBox("Urlaub fortsetzen?", "Die Verteilung der Belohnungen wird aufgehoben und ihr könnt weiterspielen.", "Fortsetzen").then((ok) => ok && act({ type: "reopen" }));
      case "tab-stats-btn": app.endedStats = true; window.scrollTo(0, 0); return render();
      case "ended-back": app.endedStats = false; window.scrollTo(0, 0); return render();
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeModal();
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.dataset) {
      if (ev.target.dataset.pin) { ev.preventDefault(); openQuest(ev.target.dataset.pin); }
      else if (ev.target.dataset.group) { ev.preventDefault(); openGroup(+ev.target.dataset.group); }
      else if (ev.target.classList.contains("region-path")) { ev.preventDefault(); openRegion(ev.target.dataset.region); }
    }
  });
  // Offline: speichernde Knöpfe abfangen, bevor ein Fenster aufgeht (Capture-Phase)
  document.addEventListener("click", (ev) => {
    if (app.online || !ev.target.closest || !ev.target.closest(SAVING_BUTTONS)) return;
    ev.preventDefault();
    ev.stopPropagation();
    toast(OFFLINE_MSG, true);
    poll();
  }, true);
  window.addEventListener("offline", () => setOnline(false));
  window.addEventListener("online", () => poll());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  setInterval(() => { if (!document.hidden) poll(); }, 4000);

  // Start: Icons in der Kopfzeile und im Login einsetzen
  $$("[data-icon]").forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  // Schriftzug so groß wie möglich, aber immer in einer Zeile neben den Icons
  function fitLogo() {
    const txt = $(".logo-txt"), logo = $(".logo"), nav = $(".hdr-nav");
    if (!txt || !logo || !nav) return;
    txt.style.fontSize = "27px";
    const free = nav.getBoundingClientRect().left - logo.getBoundingClientRect().left - 10;
    const w = logo.getBoundingClientRect().width;
    if (w > free && free > 0) txt.style.fontSize = Math.max(12, Math.floor(27 * (free - 24) / (w - 24))) + "px";
  }
  window.addEventListener("resize", fitLogo);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitLogo);
  // Eigenes Logo: liegt public/images/logo.svg (oder logo.png) vor, ersetzt es den Schriftzug
  (function loadLogo(files) {
    if (!files.length) return;
    const im = new Image();
    im.onload = () => { $("#brand-logo").innerHTML = '<img class="logo-img" src="' + files[0] + '" alt="Operação Madeira">'; };
    im.onerror = () => loadLogo(files.slice(1));
    im.src = files[0];
  })(["images/logo.svg", "images/logo.png"]);
  if (app.token && app.name) start(); else showLogin();
})();
