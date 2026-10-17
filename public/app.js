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
    try {
      res = await fetch("api/" + path, {
        method: opts.method || "GET",
        headers: Object.assign({ "Content-Type": "application/json" }, app.token ? { Authorization: "Bearer " + app.token } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
        signal: ctrl ? ctrl.signal : undefined
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* leer */ }
    const t1 = Date.now();
    if (data && typeof data.now === "number" && t1 - t0 < 3000) app.clockOffset = data.now - (t0 + t1) / 2;
    if (res.status === 401 && path !== "login") { logout(); throw new Error("Bitte neu anmelden."); }
    return { status: res.status, data };
  }

  // Offline-Anzeige: Streifen unter der Kopfzeile; speichernde Knöpfe sind gesperrt.
  function setOnline(on) {
    const was = app.online;
    app.online = on;
    $("#offline").hidden = on;
    document.body.classList.toggle("is-offline", !on);
    if (on && !was) toast("Wieder online – Spielstand ist aktuell.");
  }

  // Server nicht erreichbar oder Fehlerseite (z. B. 502) zählt als offline.
  async function poll() {
    if (!app.token || app.polling) return;
    app.polling = true;
    try {
      const wasOffline = !app.online;
      // Nach einer Funkstille den kompletten Spielstand neu laden
      const r = await api("state" + (wasOffline ? "" : "?since=" + app.version));
      if (r.status !== 200 || !r.data) throw new Error("Server nicht erreichbar");
      if (r.data.unchanged) { setOnline(true); return; }
      if (!r.data.state) { await createGame(); setOnline(true); return; }
      receive(r.data.version, r.data.state, false);
      setOnline(true);
    } catch (e) {
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
    const prev = app.state;
    app.version = version;
    app.state = state;
    if (prev && prev.seed === state.seed && L.isCompatible(prev, C) && L.isCompatible(state, C)) {
      celebrate(prev, state, own);
      if (!own) announceRemote(prev, state);
    }
    render();
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
          next = L.apply(app.state, C, action, app.name, Date.now());
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
      toast("Gerade sehr viel los – nicht gespeichert, bitte nochmal versuchen.", true);
      return false;
    } finally {
      app.busy = false;
    }
  }

  const OFFLINE_MSG = "Offline – Abhaken, Rückgängig, Käufe und Werkzeuge gehen erst wieder mit Netz.";
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
    if (!ok) return;
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
      const r = await api("login", { method: "POST", body: { password } });
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
  }

  // ------------------------------------------------------------------ Rendering
  function sum() { return L.summary(app.state, C); }

  function render() {
    if (!app.state) { $("#view").innerHTML = '<div class="empty">Spielstand wird geladen …</div>'; return; }
    if (!L.isCompatible(app.state, C)) { renderUpgrade(); return; }
    const s = sum();
    $("#hdr-points").textContent = fmt(s.balance) + " P";
    $("#hdr-points").classList.toggle("neg", s.balance < 0);
    $("#hdr-rank").textContent = s.rankName;
    $("#rb-fig").innerHTML = rankFigure(s.rank, "fig-sm");
    const views = { home: viewHome, shop: viewShop, log: viewLog, stats: viewStats };
    const view = views[app.view] ? app.view : "home";
    $$(".hdr-btn[data-go]").forEach((b) => b.classList.toggle("active", b.dataset.go === view));
    const body = app.state.ended && view === "stats" ? viewEnded(s) : views[view](s);
    $("#view").innerHTML = (view === "home" ? "" : '<button class="back-btn" data-go="home">' + icon("arrow-left") + ' Zu den Quests</button>') + body;
    if (view === "home") mountMap();
    app.modals.forEach((m) => m.refresh());
  }

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

  // Bereiche (Shop, Logbuch, Mehr) öffnen sich als eigene Seite; die Zurück-Taste
  // des Handys führt wieder zur Startseite.
  function go(view) {
    if (view === "home" && history.state && history.state.view) { history.back(); return; }
    // Zwischen Shop/Logbuch/Statistik wird der Eintrag ersetzt statt gestapelt –
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

  const FULL = { x: 0, y: 0, w: MAP.w, h: MAP.h };
  const mapUI = { vb: Object.assign({}, FULL), pointers: new Map(), gesture: null };

  function regionPaths(levels) {
    return C.regions.map((r) => {
      const lvl = levels[r.id] || 0;
      const d = (MAP.regions[r.name] || []).join(" ");
      return '<path class="region-path" data-region="' + r.id + '" tabindex="0" role="button" aria-label="' + esc(r.name + ": " + L.LEVELS[lvl].name) + '" d="' + d + '" fill="' + L.LEVELS[lvl].color + '"/>';
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
    const labels = C.regions.map((r) => {
      const p = MAP.labels[r.name];
      return p ? '<text class="region-label" x="' + p[0] + '" y="' + p[1] + '">' + esc(r.name) + "</text>" : "";
    }).join("");
    const vb = mapUI.vb;
    return '' +
      (app.state.ended ? '<div class="panel ended-note"><strong>' + icon("flag") + ' Urlaub beendet.</strong> <button class="btn btn-small btn-gold" data-go="stats">Zertifikat & Belohnungen</button></div>' : "") +
      '<section class="home-sec region-zone" aria-label="Regionale Quests">' +
      '<div class="zone-head"><div><h2>' + icon("map-pinned") + ' Regionale Quests</h2>' +
      '<div class="zone-sub">' + s.explored + " von " + C.regions.length + " Regionen erkundet · " + s.questsDone + " von 30 erledigt</div></div></div>" +
      '<div class="map-wrap"><svg id="island" viewBox="' + [vb.x, vb.y, vb.w, vb.h].join(" ") + '" xmlns="http://www.w3.org/2000/svg">' +
        '<g id="regions">' + regionPaths(s.levels) + '</g><g id="labels">' + labels + '</g><g id="pins"></g></svg></div>' +
      '<div class="map-bar"><div class="map-ctrl"><button data-zoom="out" aria-label="Herauszoomen">−</button><button data-zoom="in" aria-label="Hineinzoomen">+</button><button data-zoom="reset" aria-label="Ganze Insel">⤢</button></div>' +
      '<div class="legend">' + legend + "</div></div></section>" +
      stackZone(s) +
      '<button class="btn btn-ghost btn-block all-quests-btn" data-all-quests>' + icon("list-checks") + ' Alle Quests anzeigen</button>';
  }

  // Regionsfortschritt (Meilensteine, Regionen mit Sternen) – wird in der Statistik angezeigt
  function regionsSection(s) {
    const list = C.regions.map((r) => {
      const lvl = s.levels[r.id];
      return '<button class="region-btn" data-region="' + r.id + '"><span class="dot" style="background:' + L.LEVELS[lvl].color + '"></span><span class="region-name">' + esc(r.name) + "</span>" + stars(lvl) + "</button>";
    }).join("");
    const rp = L.regionProgress(s, C);
    const milestones = ["erkundet", "erobert", "erschlossen"]
      .map((w, i) => '<span class="ms' + (rp.done[i] ? " on" : "") + '">' + (rp.done[i] ? icon("check") + " " : "") + "Madeira " + w + "</span>").join("");
    return '<section class="home-sec regions-sec" aria-label="Regionen">' +
        '<div class="sec-head"><h2>' + icon("map-pinned") + ' Regionen</h2><button class="btn btn-small btn-ghost" data-all-quests>' + icon("list-checks") + ' Alle Quests</button></div>' +
        '<div class="panel">' +
          '<div class="row between"><strong>' + rp.text + '</strong><span class="muted small">' + s.questsDone + " von 30 regionale Quests</span></div>" +
          stageBar(rp, "Regionen") +
          '<div class="ms-row">' + milestones + "</div>" +
        "</div>" +
        '<div class="region-list">' + list + "</div></section>";
  }

  // Pins: feste Bildschirmgröße. Liegen Pins zu nah beieinander, werden sie zu
  // einer Gruppe (Kreis mit Anzahl) zusammengefasst; beim Hineinzoomen lösen sie sich auf.
  const PIN = { r: 14, hit: 22, lift: 20, gap: 34 };
  // Pin-Farbe: offen = wie unbesuchte Region, erledigt = wie erkundete Region
  function pinFill(done) { return L.LEVELS[done ? 1 : 0].color; }
  const MIN_W = MAP.w / 16;
  function mountMap() {
    const svg = $("#island");
    if (!svg) return;
    applyViewBox(svg);
    if (!svg.dataset.bound) { bindMap(svg); svg.dataset.bound = "1"; }
  }
  function applyViewBox(svg) {
    const vb = mapUI.vb;
    svg.setAttribute("viewBox", [vb.x, vb.y, vb.w, vb.h].join(" "));
    svg.style.touchAction = vb.w < MAP.w - 0.5 ? "none" : "pan-y";
    layoutPins(svg);
  }
  function layoutPins(svg) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const vb = mapUI.vb, k = vb.w / rect.width; // Karteneinheiten pro Bildschirmpixel
    $$(".region-label", svg).forEach((t) => { t.style.fontSize = (11.5 * k) + "px"; t.style.strokeWidth = (3 * k) + "px"; });
    const H = vb.h / k;
    const pts = PINS.map((p) => ({ p, ax: (p.xy[0] - vb.x) / k, ay: (p.xy[1] - vb.y) / k }))
      .filter((o) => o.ax > -30 && o.ax < rect.width + 30 && o.ay > -10 && o.ay < H + 40);
    // Gruppen bilden (einfaches Zusammenlegen, bis nichts mehr überlappt)
    // Kopf-Position (über dem Standort, am Kartenrand festgehalten)
    const headX = (x) => Math.max(PIN.r + 2, Math.min(rect.width - PIN.r - 2, x));
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
    mapUI.groups = groups;
    const U = (px) => +(px * k).toFixed(3);
    const X = (px) => +(vb.x + px * k).toFixed(2), Y = (py) => +(vb.y + py * k).toFixed(2);
    const stems = [], heads = [];
    groups.forEach((g, gi) => {
      const hx = g.x, hy = g.y;
      g.items.forEach((o) => {
        stems.push('<line class="pin-stem" x1="' + X(o.ax) + '" y1="' + Y(o.ay) + '" x2="' + X(hx) + '" y2="' + Y(hy) + '" stroke-width="' + U(1.6) + '"/>' +
          '<circle class="pin-dot" cx="' + X(o.ax) + '" cy="' + Y(o.ay) + '" r="' + U(3) + '"/>');
      });
      const tr = 'transform="translate(' + X(hx) + " " + Y(hy) + ") scale(" + U(1) + ')"';
      if (g.items.length === 1) {
        const o = g.items[0], q = o.p.q, done = !!app.state.quests[q.id];
        heads.push('<g class="pin' + (done ? " done" : "") + '" data-pin="' + q.id + '" tabindex="0" role="button" aria-label="' + esc(q.title + " (" + o.p.region.name + ")" + (done ? ", erledigt" : ", offen")) + '" ' + tr + ">" +
          '<circle class="pin-hit" r="' + PIN.hit + '"/><circle class="pin-halo" r="' + (PIN.r + 2) + '"/>' +
          '<circle class="pin-head" r="' + PIN.r + '" fill="' + pinFill(done) + '"/><circle class="pin-core" r="4"/></g>');
      } else {
        const nDone = g.items.filter((o) => app.state.quests[o.p.q.id]).length;
        const all = nDone === g.items.length;
        heads.push('<g class="pin group' + (all ? " done" : "") + '" data-group="' + gi + '" tabindex="0" role="button" aria-label="' + g.items.length + " Quests, " + nDone + ' erledigt" ' + tr + ">" +
          '<circle class="pin-hit" r="' + (PIN.hit + 2) + '"/><circle class="pin-halo" r="' + (PIN.r + 3) + '"/>' +
          '<circle class="pin-head" r="' + (PIN.r + 1) + '" fill="' + pinFill(all) + '"/>' +
          '<text class="pin-txt" y="5">' + g.items.length + "</text></g>");
      }
    });
    $("#pins", svg).innerHTML = stems.join("") + heads.join("");
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
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const vb = mapUI.vb;
        mapUI.vb = clampVB({ x: cx - vb.w / 6, y: cy - vb.h / 6 - vb.h / 30, w: vb.w / 3 });
        const svg = $("#island"); if (svg) applyViewBox(svg);
      });
    });
  }
  function clampVB(vb) {
    vb.w = Math.max(MIN_W, Math.min(MAP.w, vb.w));
    vb.h = vb.w * MAP.h / MAP.w;
    vb.x = Math.max(0, Math.min(MAP.w - vb.w, vb.x));
    vb.y = Math.max(0, Math.min(MAP.h - vb.h, vb.y));
    return vb;
  }
  function zoomAt(factor, cx, cy) {
    const vb = mapUI.vb;
    const nw = Math.max(MIN_W, Math.min(MAP.w, vb.w / factor));
    const f = nw / vb.w;
    mapUI.vb = clampVB({ x: cx - (cx - vb.x) * f, y: cy - (cy - vb.y) * f, w: nw });
    const svg = $("#island");
    if (svg) applyViewBox(svg);
  }
  function svgPoint(svg, clientX, clientY) {
    const r = svg.getBoundingClientRect(), vb = mapUI.vb;
    return [vb.x + (clientX - r.left) / r.width * vb.w, vb.y + (clientY - r.top) / r.height * vb.h];
  }
  function bindMap(svg) {
    const P = mapUI.pointers;
    svg.addEventListener("pointerdown", (ev) => {
      P.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (P.size === 1) mapUI.gesture = { type: "tap", sx: ev.clientX, sy: ev.clientY, vb: Object.assign({}, mapUI.vb), target: ev.target };
      else if (P.size === 2) {
        const [a, b] = Array.from(P.values());
        const mid = svgPoint(svg, (a.x + b.x) / 2, (a.y + b.y) / 2);
        mapUI.gesture = { type: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y), vb: Object.assign({}, mapUI.vb), mid };
      }
    });
    svg.addEventListener("pointermove", (ev) => {
      if (!P.has(ev.pointerId)) return;
      P.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const g = mapUI.gesture;
      if (!g) return;
      const rect = svg.getBoundingClientRect();
      if (g.type === "pinch" && P.size === 2) {
        const [a, b] = Array.from(P.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const nw = Math.max(MIN_W, Math.min(MAP.w, g.vb.w * g.d / Math.max(d, 1)));
        const f = nw / g.vb.w;
        mapUI.vb = clampVB({ x: g.mid[0] - (g.mid[0] - g.vb.x) * f, y: g.mid[1] - (g.mid[1] - g.vb.y) * f, w: nw });
        applyViewBox(svg);
      } else if (g.type === "tap" || g.type === "pan") {
        const dx = ev.clientX - g.sx, dy = ev.clientY - g.sy;
        if (g.type === "tap" && Math.hypot(dx, dy) > 8) g.type = "pan";
        if (g.type === "pan" && g.vb.w < MAP.w - 0.5) {
          const k = g.vb.w / rect.width;
          mapUI.vb = clampVB({ x: g.vb.x - dx * k, y: g.vb.y - dy * k, w: g.vb.w });
          applyViewBox(svg);
        }
      }
    });
    const end = (ev) => {
      const g = mapUI.gesture;
      P.delete(ev.pointerId);
      if (ev.type === "pointerup" && g && g.type === "tap" && P.size === 0) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY) || g.target;
        const pin = el.closest && el.closest("[data-pin]");
        const grp = el.closest && el.closest("[data-group]");
        const reg = el.closest && el.closest("[data-region]");
        // Den "Geister-Klick" nach dem Antippen abfangen, sonst schließt er das neue Fenster sofort
        if (pin || grp || reg) mapUI.ghostUntil = Date.now() + 500;
        if (pin) openQuest(pin.dataset.pin);
        else if (grp) openGroup(+grp.dataset.group);
        else if (reg) openRegion(reg.dataset.region);
      }
      if (P.size === 0) mapUI.gesture = null;
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      const pt = svgPoint(svg, ev.clientX, ev.clientY);
      zoomAt(ev.deltaY < 0 ? 1.25 : 0.8, pt[0], pt[1]);
    }, { passive: false });
  }
  document.addEventListener("click", (ev) => {
    if (mapUI.ghostUntil && Date.now() < mapUI.ghostUntil) { ev.stopPropagation(); ev.preventDefault(); mapUI.ghostUntil = 0; }
  }, true);
  window.addEventListener("resize", () => { const svg = $("#island"); if (svg) layoutPins(svg); });

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
  function questImageHTML(q) {
    if (missingImages.has(q.id)) return "";
    return '<img class="quest-img" data-qimg="' + q.id + '" alt="' + esc(q.title) + '" decoding="async" hidden>';
  }
  function bindQuestImages(el) {
    $$("img[data-qimg]", el).forEach((img) => {
      const id = img.dataset.qimg;
      img.onload = () => { img.hidden = false; };
      img.onerror = () => { missingImages.add(id); img.remove(); };
      img.src = "images/quests/" + id + ".jpg";
    });
  }
  function regionQuestHTML(q, interactive) {
    const done = app.state.quests[q.id];
    return (interactive ? questImageHTML(q) : "") + '<div class="quest">' +
      (interactive ? '<button class="check ' + (done ? "on" : "") + '" data-quest="' + q.id + '" aria-label="' + (done ? "Erledigt – rückgängig machen" : "Als erledigt abhaken") + '">' + (done ? icon("check") : "") + "</button>"
        : '<span class="status ' + (done ? "on" : "") + '" aria-label="' + (done ? "erledigt" : "offen") + '">' + (done ? icon("check") : "") + "</span>") +
      '<div class="quest-body"><h4>' + esc(q.title) + "</h4>" +
      '<a class="loc" href="' + esc(mapsUrl(q)) + '" target="_blank" rel="noopener noreferrer" title="In Google Maps öffnen">' + icon("map-pin") + ' ' + esc(q.location) + ' <span class="loc-ext" aria-hidden="true">' + icon("external-link") + '</span></a>' +
      '<p class="desc">' + esc(q.desc) + "</p>" + taskHTML(q) + (interactive ? toolHTML(q.id) : "") +
      (done ? '<div class="by">' + icon("check") + ' erledigt von ' + esc(done.by) + " · " + when(done.t) + "</div>" : "") + "</div></div>";
  }
  function levelPill(lvl) {
    return '<span class="pill" style="background:' + L.LEVELS[lvl].color + ";color:" + (lvl <= 1 ? "#1d2a30" : "#fff") + '">' + L.LEVELS[lvl].name + "</span>";
  }
  function bindQuestChecks(el) {
    bindQuestImages(el);
    $$("[data-quest]", el).forEach((b) => b.addEventListener("click", () => toggleQuest(b.dataset.quest, b)));
    bindTools(el);
  }

  // ------------------------------------------------------------------ Werkzeuge (Tools)
  // Optionale Hilfen für einzelne regionale Quests (Regeln in tools.js). Der Zustand liegt im
  // Spielstand unter state.tools und wird wie alles andere über den Server geteilt. Änderungen
  // laufen über eine Warteschlange, damit schnelles Antippen (z. B. „+1 Auto“) nichts verliert.
  // Werkzeuge haken nie ab und geben keine Punkte.
  const toolUI = { queue: [], flushing: false, open: new Set(), closed: new Set(), signaled: new Set(), ttt: { sel: [], extra: [] } };
  const compass = { on: false, failed: "", samples: [], last: 0 };
  const TOOL_NAMES = {
    countdown: "Countdown", cablecar: "Schätzung & Stoppuhr", traffic: "Schätzung & Autos zählen",
    height: "Höhen-Schätzung", compass: "Kompass", penalty: "Strafzeit", tictactoe: "Tic-Tac-Toe"
  };
  const TOOL_ICONS = { countdown: "timer", cablecar: "timer", traffic: "car", height: "mountain", compass: "navigation", penalty: "lock", tictactoe: "grid-3x3" };
  function serverNow() { return Date.now() + app.clockOffset; }
  const secs = (ms) => Math.max(0, Math.ceil(ms / 1000));
  const mmss = (ms) => { const s = secs(ms); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const upfmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

  // Stand eines Werkzeugs inklusive noch nicht gesendeter Eingaben
  function toolState(qid) {
    const cfg = T.config(qid);
    let ts = (app.state.tools && app.state.tools[qid]) || null;
    toolUI.queue.forEach((x) => {
      if (x.qid !== qid) return;
      try { ts = T.update(cfg, ts, x.op, x.now, x.by); } catch (e) { /* von einem anderen Handy überholt */ }
    });
    return ts || {};
  }

  function toolHTML(qid) {
    const cfg = T.config(qid);
    if (!cfg) return "";
    if (cfg.kind === "link") {
      return '<div class="tool tool-link"><a class="btn btn-ghost btn-block" href="' + esc(cfg.url) + '" target="_blank" rel="noopener noreferrer">' +
        icon("plane-landing") + " " + esc(cfg.label) + " " + icon("external-link") + "</a></div>";
    }
    // Läuft gerade etwas (Uhr, Strafzeit, Partie), ist das Werkzeug von selbst aufgeklappt
    const open = toolUI.open.has(qid) || (toolActive(qid) && !toolUI.closed.has(qid));
    return '<details class="tool" data-tool="' + qid + '"' + (open ? " open" : "") + "><summary>" + icon("wrench") +
      " Werkzeug: " + TOOL_NAMES[cfg.kind] + ' <span class="muted small">(freiwillig)</span></summary><div class="tool-body">' + toolBody(qid) + "</div></details>";
  }

  function toolActive(qid) {
    const cfg = T.config(qid), ts = toolState(qid), now = serverNow();
    if (T.penaltyLeft(ts, now)) return true;
    if (cfg.kind === "countdown" || cfg.kind === "traffic") return ts.startedAt != null && now < ts.startedAt + cfg.seconds * 1000 + 5000;
    if (cfg.kind === "cablecar") return ts.startedAt != null && ts.stoppedAt == null;
    if (cfg.kind === "tictactoe") return !!ts.players;
    return ts.guess != null || (ts.measures || []).length > 0;
  }
  const tBtn = (op, label, cls, extra) => '<button class="btn ' + cls + '" data-tool-act="' + op + '"' + (extra || "") + ">" + label + "</button>";
  const tInput = (qid, key, ph, mode) => '<input class="tool-input" type="text" inputmode="' + (mode || "numeric") + '" autocomplete="off" data-keep="' + qid + ":" + key + '" placeholder="' + esc(ph) + '">';
  const byTxt = (n) => (n ? ' <span class="muted small">von ' + esc(n) + "</span>" : "");
  function tResult(ok, text, title) {
    return '<div class="tool-result ' + (ok ? "ok" : "miss") + '">' + icon(ok ? "circle-check" : "circle-x") + "<div><strong>" + (title || (ok ? "Geschafft!" : "Daneben")) + "</strong>" +
      '<div class="small">' + text + "</div>" + (ok && !title ? '<div class="small tool-hint">Abhaken macht ihr selbst – oben auf den Kreis tippen.</div>' : "") + "</div></div>";
  }
  function tFixed(label, value, by) {
    return '<div class="tool-fixed">' + icon("lock") + " " + label + ": <strong>" + value + "</strong>" + byTxt(by) + "</div>";
  }
  function tPenalty(cfg, highlight) {
    return '<button class="btn btn-block ' + (highlight ? "btn-danger" : "btn-ghost") + '" data-tool-act="penalty">' + icon("timer") +
      " Daneben – Strafzeit starten (" + cfg.penalty + " Minuten)</button>";
  }
  const nf = (n) => String(n).replace(".", ",");

  function toolBody(qid) {
    const cfg = T.config(qid), ts = toolState(qid), now = serverNow();
    const left = T.penaltyLeft(ts, now);
    if (left) {
      return '<div class="tool-lock" data-until="' + ts.penaltyUntil + '">' + icon("lock") + "<div><strong>Strafzeit läuft</strong>" +
        '<div class="tool-big" data-tick="down" data-end="' + ts.penaltyUntil + '">' + mmss(left) + "</div>" +
        '<div class="small">Bis dahin keine neue Schätzung oder Messung. Danach ist das Werkzeug automatisch wieder frei.</div></div></div>';
    }
    const res = T.result(cfg, ts, now);
    switch (cfg.kind) {
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
            '<div class="tool-row">' + tInput(qid, "guess", "z. B. 90") + '<span class="tool-unit">s</span>' + tBtn("fix", icon("lock") + " Festschreiben", "btn-primary") + "</div>" +
            '<p class="muted small">Festgeschrieben ist festgeschrieben – bis zur Auflösung nicht mehr änderbar.</p>';
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
            '<div class="tool-row">' + tInput(qid, "guess", "z. B. 8") + '<span class="tool-unit">Autos</span>' + tBtn("fix", icon("lock") + " Festschreiben", "btn-primary") + "</div>";
        }
        let h = tFixed("Schätzung", ts.guess + (ts.guess === 1 ? " Auto" : " Autos"), ts.guessBy);
        if (ts.startedAt == null) return h + tBtn("start", icon("play") + " 1-Minuten-Countdown starten", "btn-primary btn-block tool-tap");
        const end = ts.startedAt + cfg.seconds * 1000;
        if (now < end) {
          return h + '<div class="tool-count-row" data-until="' + end + '"><div class="tool-clock"><div class="tool-big" data-tick="down" data-fmt="s" data-end="' + end + '">' + secs(end - now) + '</div><div class="muted small">Sekunden</div></div>' +
            '<div class="tool-clock"><div class="tool-big">' + (ts.count || 0) + '</div><div class="muted small">gezählt</div></div></div>' +
            tBtn("inc", icon("plus") + " 1 Auto", "btn-primary btn-block tool-tap tool-plus", ' data-d="1"') +
            tBtn("inc", icon("minus") + " 1 (Korrektur)", "btn-ghost btn-block", ' data-d="-1"');
        }
        return h + tResult(res.ok, "Gezählt: <strong>" + res.count + "</strong> · Schätzung " + ts.guess + " · " + res.diff + " daneben (erlaubt: höchstens " + cfg.tolerance + ")") +
          tBtn("newRound", icon("rotate-ccw") + (res.ok ? " Zurücksetzen" : " Neue Runde – für die nächste Minute neu schätzen"), (res.ok ? "btn-ghost" : "btn-primary") + " btn-block");
      }

      case "height": {
        if (ts.guess == null) {
          return '<label class="tool-label">Die beiden Ratenden: eure gemeinsame Schätzung, wie hoch ihr seid</label>' +
            '<div class="tool-row">' + tInput(qid, "guess", "z. B. 500", "decimal") + '<span class="tool-unit">m</span>' + tBtn("fix", icon("lock") + " Festschreiben", "btn-primary") + "</div>" +
            tPenalty(cfg, false);
        }
        let h = tFixed("Schätzung", nf(ts.guess) + " m", ts.guessBy);
        if (!res) {
          return h + '<label class="tool-label">Spoiler-Schutz: Wert von der Infotafel eingeben</label>' +
            '<div class="tool-row">' + tInput(qid, "answer", "Meter", "decimal") + '<span class="tool-unit">m</span>' + tBtn("answer", icon("lock-open") + " Auflösen", "btn-primary") + "</div>";
        }
        return h + tResult(res.ok, "Infotafel: <strong>" + nf(ts.answer) + " m</strong> · " + nf(Math.round(res.pct * 10) / 10) + " % daneben (erlaubt: höchstens " + cfg.tolerancePct + " %)") +
          (res.ok ? tBtn("newRound", icon("rotate-ccw") + " Zurücksetzen", "btn-ghost btn-block") : tPenalty(cfg, true));
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
          return h + tResult(res.ok, res.ok ? "Rio liegt bei " + cfg.target + "° – mindestens eine Messung lag höchstens " + cfg.tolerance + "° daneben." : "Beide Messungen lagen mehr als " + cfg.tolerance + "° daneben (Rio: " + cfg.target + "°).") +
            (res.ok ? tBtn("newRound", icon("rotate-ccw") + " Zurücksetzen", "btn-ghost btn-block") : tPenalty(cfg, true));
        }
        const missed = ms.some((m) => !T.compassHit(cfg, m.deg));
        if (missed) h += tResult(false, "Die " + (ms.length === 1 ? "erste" : "") + " Messung lag mehr als " + cfg.tolerance + "° daneben. Laut Aufgabe reicht es, wenn eine der beiden Personen trifft – jetzt ist die zweite dran.");
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
        return h + (missed ? tPenalty(cfg, false) : "");
      }

      case "penalty":
        return '<p class="small">Liegen die beiden falsch, startet hier die Wartezeit von ' + cfg.penalty + " Minuten – sie läuft auf allen Handys.</p>" + tPenalty(cfg, true);

      case "tictactoe": {
        if (!ts.players) {
          const sel = toolUI.ttt.sel;
          const chips = knownNames().map((n) => {
            const i = sel.indexOf(n);
            return '<button class="chip' + (i >= 0 ? " on" : "") + '" data-tool-ui="ttt-pick" data-name="' + esc(n) + '">' + (i >= 0 ? (i === 0 ? "X · " : "O · ") : "") + esc(n) + "</button>";
          }).join("");
          return '<p class="tool-label">Wer spielt? Zwei Personen antippen – die erste spielt X, die zweite O. Die dritte Person ist Schiedsrichter.</p>' +
            '<div class="chips">' + chips + "</div>" +
            '<div class="tool-row">' + tInput(qid, "name", "Name", "text") + '<button class="btn btn-ghost" data-tool-ui="ttt-add">' + icon("plus") + " Name</button></div>" +
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

  function knownNames() {
    const m = new Map();
    const add = (n) => { n = String(n || "").trim(); if (n && !m.has(n.toLowerCase())) m.set(n.toLowerCase(), n); };
    add(app.name);
    (app.state.log || []).forEach((e) => add(e.by));
    toolUI.ttt.extra.forEach(add);
    return Array.from(m.values()).slice(0, 10);
  }

  // Werkzeug-Bereich neu zeichnen, ohne halb getippte Eingaben zu verlieren
  function rerenderTools(qid) {
    $$(".tool[data-tool" + (qid ? '="' + qid + '"' : "") + "]").forEach((t) => {
      const body = $(".tool-body", t);
      if (!body) return;
      const kept = {};
      let focus = null;
      $$("[data-keep]", body).forEach((i) => { kept[i.dataset.keep] = i.value; if (i === document.activeElement) focus = i.dataset.keep; });
      body.innerHTML = toolBody(t.dataset.tool);
      $$("[data-keep]", body).forEach((i) => { if (kept[i.dataset.keep] != null) i.value = kept[i.dataset.keep]; if (focus === i.dataset.keep) i.focus(); });
    });
  }

  function bindTools(el) {
    $$(".tool[data-tool]", el).forEach((t) => {
      t.addEventListener("toggle", () => {
        const q = t.dataset.tool;
        if (t.open) { toolUI.open.add(q); toolUI.closed.delete(q); } else { toolUI.open.delete(q); toolUI.closed.add(q); }
      });
      t.addEventListener("click", onToolClick);
    });
  }

  async function onToolClick(ev) {
    const b = ev.target.closest("[data-tool-act], [data-tool-ui]");
    const t = ev.target.closest(".tool");
    if (!b || !t || b.disabled) return;
    const qid = t.dataset.tool, cfg = T.config(qid);
    const input = (key) => $('[data-keep="' + qid + ":" + key + '"]', t);
    const ui = b.dataset.toolUi;
    if (ui === "compass-on") return enableCompass();
    if (ui === "ttt-pick") {
      const sel = toolUI.ttt.sel, n = b.dataset.name, i = sel.indexOf(n);
      if (i >= 0) sel.splice(i, 1); else if (sel.length < 2) sel.push(n); else toast("Es spielen nur zwei – erst jemanden abwählen.", true);
      return rerenderTools(qid);
    }
    if (ui === "ttt-add") {
      const inp = input("name"), n = inp && inp.value.trim().slice(0, 24);
      if (!n) { toast("Bitte erst einen Namen eintippen.", true); return; }
      toolUI.ttt.extra.push(n);
      if (toolUI.ttt.sel.length < 2 && toolUI.ttt.sel.indexOf(n) < 0) toolUI.ttt.sel.push(n);
      inp.value = "";
      return rerenderTools(qid);
    }
    const act = b.dataset.toolAct;
    const op = { type: act };
    let clear = null;
    if (act === "fix" || act === "answer" || (act === "measure" && b.hasAttribute("data-manual"))) {
      const key = act === "fix" ? "guess" : act === "answer" ? "answer" : "deg";
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
    else if (act === "players") { op.x = toolUI.ttt.sel[0]; op.o = toolUI.ttt.sel[1]; }
    else if (act === "penalty") {
      const ok = await confirmBox("Strafzeit starten?", cfg.penalty + " Minuten Wartezeit für diese Quest – auf allen Handys. Eine laufende Schätzung oder Messung verfällt; danach wird neu geraten.", "Strafzeit starten", true);
      if (!ok) return;
    } else if (act === "newGame") toolUI.ttt.sel = [];
    const typed = clear ? clear.value : "";
    if (clear) clear.value = ""; // vor dem Neuzeichnen leeren, sonst bleibt die Zahl stehen
    if (!toolDo(qid, op) && clear) clear.value = typed;
    if (act === "inc" && navigator.vibrate) navigator.vibrate(15);
  }

  function toolDo(qid, op) {
    if (!app.online) { toast(OFFLINE_MSG, true); return false; }
    const now = serverNow();
    try { T.update(T.config(qid), toolState(qid), op, now, app.name); } catch (e) {
      if (e instanceof T.ToolError) { toast(e.message, true); return false; }
      throw e;
    }
    toolUI.queue.push({ qid, op, now, by: app.name });
    rerenderTools(qid);
    flushTools();
    return true;
  }

  // Wartende Werkzeug-Eingaben an den Server senden (bei Konflikt auf dem neuen Stand wiederholen)
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
          try { next.tools[x.qid] = T.update(T.config(x.qid), next.tools[x.qid], x.op, x.now, x.by); } catch (e) {
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
      toast("Werkzeug: Speichern fehlgeschlagen (" + failed + "). Die Eingabe wurde NICHT übernommen.", true);
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

  // Taktgeber: Countdowns/Stoppuhren weiterzählen; ist eine Zeit abgelaufen, Werkzeug neu zeichnen + Signal
  setInterval(() => {
    const ticks = $$("[data-tick]"), dues = $$("[data-until]");
    if (!ticks.length && !dues.length) return;
    const now = serverNow();
    ticks.forEach((e) => {
      e.textContent = e.dataset.tick === "down" ? (e.dataset.fmt === "s" ? secs(+e.dataset.end - now) : mmss(+e.dataset.end - now)) : upfmt(now - +e.dataset.start);
    });
    const due = new Set();
    dues.forEach((e) => { if (+e.dataset.until <= now) { const t = e.closest(".tool"); if (t) due.add(t.dataset.tool); } });
    due.forEach((qid) => {
      const ts = toolState(qid), cfg = T.config(qid);
      const key = qid + ":" + (cfg.kind === "countdown" || cfg.kind === "traffic" ? ts.startedAt : ts.penaltyUntil);
      if (!toolUI.signaled.has(key)) {
        toolUI.signaled.add(key);
        if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
      }
      rerenderTools(qid);
    });
  }, 200);

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
    });
  }

  // Übersicht über alle 56 Quests – nur zum Ansehen
  function openAllQuests() {
    openModal(() => {
      const s = sum();
      const regionsHTML = C.regions.map((r) => {
        const lvl = s.levels[r.id];
        return '<div class="ov-group"><div class="row between"><h3>' + esc(r.name) + "</h3>" + levelPill(lvl) + "</div>" +
          r.quests.map((q) => regionQuestHTML(q, false)).join("") + "</div>";
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
      $$(".ov-jump a", el).forEach((a) => a.addEventListener("click", (ev) => {
        ev.preventDefault();
        const t = $(a.getAttribute("href"), el);
        if (t) el.scrollTo({ top: t.offsetTop - 10, behavior: "smooth" });
      }));
    });
  }

  function openRegion(regionId) {
    const r = IX.regions[regionId];
    openModal(() => {
      const s = sum();
      const lvl = s.levels[r.id];
      const joker = app.state.joker && app.state.joker.region === r.id;
      const next = lvl === 0 ? "Erste Quest: Region erkundet (+100)" : lvl < 3 ? "Nächste Quest: " + L.LEVELS[lvl + 1].name + " (+20)" : "Höchste Stufe erreicht!";
      return '<div class="modal-head"><div><h2>' + esc(r.name) + "</h2>" + levelPill(lvl) + " " +
        stars(lvl) +
        (joker ? ' <span class="pill" style="background:var(--ocean)">Region-Joker</span>' : "") +
        '</div><button class="modal-close" data-close aria-label="Schließen">' + icon("x") + '</button></div>' +
        '<p class="muted small">' + next + " · Punkte hier: " + fmt(L.regionPoints(app.state, C, r.id)) + "</p>" +
        r.quests.map((q) => regionQuestHTML(q, true)).join("");
    }, bindQuestChecks);
  }

  async function toggleQuest(questId, btn) {
    const done = app.state.quests[questId];
    if (!done) { await act({ type: "quest", questId }, { fxFrom: btn }); return; }
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
      "<h3>" + esc(q.title) + "</h3>" + taskHTML(q) +
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
        '<span class="delta plus">+' + L.stackPoints(app.state, C, id) + "</span>" +
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
      '<div class="row"><p class="muted small" style="margin:0;flex:1">Eingesetzt für <strong>' + esc(IX.regions[jokerUsed.region].name) + "</strong> (" + esc(jokerUsed.by) + "). Rückgängig im Logbuch.</p>" +
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

  // ---- Logbuch
  function viewLog() {
    const items = app.state.log.slice().reverse().map((e) => {
      const d = e.dE - e.dS;
      return '<div class="list-item ' + (e.undone ? "undone" : "") + '"><div class="grow"><div class="txt">' + esc(e.text) + "</div>" +
        '<div class="meta">' + when(e.t, true) + " · " + esc(e.by) + (e.undone ? " · rückgängig gemacht" : "") + "</div></div>" +
        (d ? '<span class="delta ' + (d > 0 ? "plus" : "minus") + '">' + signed(d) + "</span>" : "") +
        (L.canUndo(e) && !app.state.ended ? '<button class="btn btn-small btn-ghost" data-undo="' + e.id + '" aria-label="Rückgängig">' + icon("undo-2") + '</button>' : "") + "</div>";
    }).join("");
    return '<h2>Logbuch</h2><p class="muted small">Alle Aktionen mit Uhrzeit und Name. Mit ' + icon("undo-2") + ' lässt sich gezielt etwas rückgängig machen – keine Aufgabe bringt je zweimal Punkte.</p>' +
      '<div class="panel">' + (items || '<p class="muted" style="margin:0">Noch nichts passiert. Auf geht\'s!</p>') + "</div>";
  }

  async function undo(logId) {
    const e = app.state.log.find((x) => x.id === logId);
    if (!e) return;
    if (await confirmBox("Rückgängig machen?", e.text, "Rückgängig")) await act({ type: "undo", logId });
  }

  // ---- Statistik & Einstellungen
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
      "</div>" +
      '<div class="section-title"><h3>Spiel</h3></div>' +
      '<div class="panel" style="display:grid;gap:10px">' +
        '<button class="btn btn-ghost btn-block" data-all-quests>' + icon("list-checks") + ' Alle Quests ansehen</button>' +
        '<button class="btn btn-gold btn-block" id="end-btn">' + icon("flag") + ' Urlaub beenden & Belohnungen</button>' +
        '<button class="btn btn-ghost btn-block" id="help-btn2">' + icon("circle-help") + ' Spielanleitung</button>' +
        '<div class="grid2"><button class="btn btn-ghost" id="rename-btn">Name: ' + esc(app.name) + '</button><button class="btn btn-ghost" id="logout-btn">Abmelden</button></div>' +
        '<button class="btn btn-danger btn-block" id="reset-btn">Kompletter Reset</button>' +
      "</div>" +
      '<div class="section-title"><h3>Spielstand sichern</h3></div>' +
      '<div class="panel" style="display:grid;gap:10px">' +
        '<p class="muted small" style="margin:0">Lädt den kompletten Spielstand als Datei auf dieses Handy – zur Sicherheit, falls etwas schiefgeht.</p>' +
        '<button class="btn btn-primary btn-block" id="backup-btn">' + icon("download") + ' Spielstand sichern</button>' +
        '<button class="btn btn-ghost btn-block" id="restore-btn">' + icon("upload") + ' Spielstand wiederherstellen</button>' +
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

  async function startEnd() {
    if (!(await confirmBox("Urlaub beenden?", "Die Restpunkte werden jetzt in Belohnungen umgetauscht. Danach gibt es das Zertifikat. (Falls nötig, kann man den Urlaub später fortsetzen.)", "Weiter"))) return;
    const s = sum();
    const rest = Math.max(0, s.balance);
    const alloc = {};
    C.rewards.forEach((r) => { alloc[r.id] = 0; });
    let names = players().slice(0, 3).join(", ");
    const remaining = () => rest - C.rewards.reduce((a, r) => a + (alloc[r.id] || 0), 0);
    openModal(() => {
      const rem = remaining();
      return '<div class="modal-head"><h2>Belohnungen verteilen</h2><button class="modal-close" data-close aria-label="Schließen">' + icon("x") + '</button></div>' +
        '<div class="sticky-remaining"><div class="muted small">Restpunkte: ' + fmt(rest) + " (verdient " + fmt(s.earned) + " − ausgegeben " + fmt(s.spent) + ")</div>" +
        '<div class="remaining" style="color:' + (rem === 0 ? "var(--laurel)" : rem < 0 ? "var(--hibiscus)" : "inherit") + '">Noch zu verteilen: ' + fmt(rem) + " Punkte</div></div>" +
        '<label style="margin-top:10px">Spielernamen fürs Zertifikat<input id="end-names" value="' + esc(names) + '"></label>' +
        C.rewards.map((r) => {
          const v = alloc[r.id] || 0;
          return '<div class="reward"><div><strong>' + esc(r.name) + '</strong><span class="tag tag-' + r.type + '">' + r.type + "</span></div>" +
            (r.desc ? '<div class="muted small">' + esc(r.desc) + "</div>" : "") +
            '<div class="muted small">100 Punkte = ' + r.per100 + " " + (r.per100 === 1 ? r.unit : (r.unitPlural || r.unit)) + " · Schritte: " + r.step + "</div>" +
            '<div class="stepper"><button class="btn" data-minus="' + r.id + '" aria-label="weniger">−</button>' +
            '<input inputmode="numeric" data-amount="' + r.id + '" value="' + v + '" aria-label="Punkte für ' + esc(r.name) + '">' +
            '<button class="btn" data-plus="' + r.id + '" aria-label="mehr">+</button></div>' +
            '<div class="live">' + fmt(v) + " Punkte = " + L.formatReward(r, v) + " " + esc(r.name) + "</div>" +
            (r.rules ? '<div class="muted small">' + esc(r.rules) + "</div>" : "") + "</div>";
        }).join("") +
        '<p class="muted small">Wie die Belohnungen unter euch aufgeteilt werden, regelt ihr selbst – die App rechnet nur um.</p>' +
        '<div class="modal-actions"><button class="btn btn-ghost" data-close>Abbrechen</button><button class="btn btn-good" id="finish" ' + (rem !== 0 ? "disabled" : "") + ">Abschließen</button></div>";
    }, (el, refresh) => {
      $("#end-names", el).addEventListener("input", (ev) => { names = ev.target.value; });
      const setV = (id, v) => { alloc[id] = Math.max(0, Math.round(v)); refresh(); };
      $$("[data-plus]", el).forEach((b) => b.addEventListener("click", () => {
        const r = C.rewards.find((x) => x.id === b.dataset.plus);
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
        if (await act({ type: "end", alloc: clean })) {
          closeAll();
          go("stats");
          confetti(200);
        }
      });
    }, { keepScroll: true });
  }

  function viewEnded(s) {
    const alloc = app.state.ended.alloc || {};
    const lines = C.rewards.filter((r) => alloc[r.id] > 0).map((r) =>
      '<div class="list-item"><div class="grow"><strong>Gutschein: ' + L.formatReward(r, alloc[r.id]) + " " + esc(r.voucher) + '</strong><div class="meta">' + fmt(alloc[r.id]) + " Punkte</div></div></div>").join("");
    return '<h2>' + icon("flag") + ' Urlaub beendet</h2>' +
      '<div class="panel rank-panel"><div class="muted small">Euer Rang</div><div class="rank-big">' + esc(s.rankName) + '</div><div class="small">' + fmt(s.earned) + " von " + fmt(s.maxPoints) + " Punkten (" + Math.round(s.earned / s.maxPoints * 100) + " %)</div></div>" +
      '<div class="panel"><h3>Eure Belohnungen</h3>' + (lines || '<p class="muted" style="margin:0">Keine Restpunkte verteilt.</p>') + "</div>" +
      '<div class="panel"><h3>Zertifikat</h3><img class="cert-preview" alt="Zertifikat" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(certificateSVG()) + '">' +
      '<button class="btn btn-primary btn-block" id="pdf-btn" style="margin-top:12px">' + icon("file-down") + ' Zertifikat als PDF herunterladen</button></div>' +
      '<div class="panel" style="display:grid;gap:10px"><button class="btn btn-ghost btn-block" id="reopen-btn">Urlaub fortsetzen (Verteilung aufheben)</button>' +
      '<button class="btn btn-ghost btn-block" id="tab-stats-btn">Statistiken ansehen</button></div>';
  }

  // ---- Zertifikat
  function certificateSVG() {
    const s = sum();
    const st = app.state;
    const alloc = (st.ended && st.ended.alloc) || {};
    const W = 1188, H = 840;
    const names = alloc._players || players().join(", ");
    const pct = Math.round(s.earned / s.maxPoints * 100);
    const days = L.dayCount(st, Date.now());
    const vouchers = C.rewards.filter((r) => alloc[r.id] > 0).map((r) => "Gutschein: " + L.formatReward(r, alloc[r.id]) + " " + r.voucher);
    const t = (x, y, txt, size, opts) => '<text x="' + x + '" y="' + y + '" font-size="' + size + '" ' + (opts || 'text-anchor="middle"') + ">" + esc(txt) + "</text>";
    const mapScale = 0.5;
    const mapG = '<g transform="translate(' + (W / 2 - MAP.w * mapScale / 2) + ',300) scale(' + mapScale + ')">' +
      C.regions.map((r) => '<path d="' + (MAP.regions[r.name] || []).join(" ") + '" fill="' + L.LEVELS[s.levels[r.id]].color + '" stroke="#fff" stroke-width="3"/>').join("") + "</g>";
    const statsLine = s.questsDone + " regionale Quests · " + s.doneStack + " Stapel-Quests · bester Multiplikator " + (s.bestMult ? L.fmtFactor(s.bestMult) : "–") +
      " · " + (s.jokerUsed + s.swaps + s.multCount) + " Joker eingesetzt · " + days + (days === 1 ? " Tag" : " Tage");
    const date = new Date(st.ended ? st.ended.at : Date.now()).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
    let vy = 640;
    const vouchersSvg = vouchers.length ? vouchers.map((v, i) => t(W / 2, vy + i * 30, v, 22, 'text-anchor="middle" font-weight="600" fill="#0b5f78"')).join("") : t(W / 2, vy, "Keine Gutscheine", 20, 'text-anchor="middle" fill="#888"');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" font-family="Georgia, \'Times New Roman\', serif" fill="#1d2a30">' +
      '<rect width="' + W + '" height="' + H + '" fill="#fbf7ef"/>' +
      '<rect x="24" y="24" width="' + (W - 48) + '" height="' + (H - 48) + '" fill="none" stroke="#0b5f78" stroke-width="6" rx="18"/>' +
      '<rect x="40" y="40" width="' + (W - 80) + '" height="' + (H - 80) + '" fill="none" stroke="#e5b53b" stroke-width="2" rx="12"/>' +
      t(W / 2, 110, "ZERTIFIKAT", 54, 'text-anchor="middle" font-weight="700" letter-spacing="8" fill="#0b5f78"') +
      t(W / 2, 150, "Operação Madeira - Das Spiel · " + date, 20, 'text-anchor="middle" fill="#5f6f76"') +
      t(W / 2, 200, "Hiermit wird bestätigt, dass", 20, 'text-anchor="middle" fill="#5f6f76"') +
      t(W / 2, 245, names || "das Team", 36, 'text-anchor="middle" font-weight="700"') +
      t(W / 2, 285, "Madeira als Team erkundet und den Rang „" + s.rankName + "“ erreicht haben.", 22, 'text-anchor="middle"') +
      mapG +
      t(W / 2, 568, fmt(s.earned) + " von " + fmt(s.maxPoints) + " möglichen Punkten (" + pct + " %)", 28, 'text-anchor="middle" font-weight="700"') +
      t(W / 2, 600, statsLine, 18, 'text-anchor="middle" fill="#5f6f76"') +
      vouchersSvg +
      t(W / 2, H - 60, "Dieses Zertifikat gilt gleichzeitig als Gutschein.", 15, 'text-anchor="middle" fill="#5f6f76" font-style="italic"') +
      "</svg>";
  }

  async function downloadPDF() {
    if (!window.jspdf) { toast("PDF-Modul lädt noch – gleich nochmal versuchen.", true); return; }
    const svg = certificateSVG();
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode().catch(() => new Promise((res) => { img.onload = res; }));
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = 1188 * scale; canvas.height = 840 * scale;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pdf = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 297, 210);
    pdf.save("Madeira-Zertifikat.pdf");
  }

  // ---- Reset
  async function doReset() {
    if (!(await confirmBox("Kompletter Reset?", "Setzt ALLES auf null und mischt neu – für alle drei Handys. Das kann nicht rückgängig gemacht werden.", "Weiter", true))) return;
    const typed = await promptBox("Wirklich zurücksetzen?", "Tippe zur Sicherheit RESET ein:", "RESET");
    if (typed !== "RESET") { if (typed !== null) toast("Abgebrochen – nicht richtig eingetippt.", true); return; }
    if (await act({ type: "reset", seed: Math.floor(Math.random() * 2 ** 31) })) toast("Neues Spiel – viel Spaß!");
  }

  // ------------------------------------------------------------------ Hilfe
  function openHelp() {
    openModal(() => '<div class="modal-head"><div><h2>Spielanleitung</h2><div class="muted small">Operação Madeira - Das Spiel</div></div><button class="modal-close" data-close aria-label="Schließen">' + icon("x") + '</button></div>' +
      '<div class="help">' +
      "<h3>" + icon("target") + " Ziel</h3><p>Ihr spielt als <strong>ein Team</strong>: Erkundet alle 10 Regionen Madeiras mit regionalen Quests und sammelt zusätzlich Punkte mit Stapel-Quests. Alle Punkte gehören dem Team – wir vertrauen uns, es gibt keine Beweisfotos.</p>" +
      "<h3>" + icon("map-pinned") + " Regionale Quests und Stufen</h3><p>Jede Region hat 3 regionale Quests an festen Orten – auf der Inselkarte als Pins markiert. Pin antippen öffnet die Quest, Region antippen zeigt alle 3. Eine erledigte regionale Quest erkundet die Region, jede weitere hebt sie eine Stufe.</p>" +
      "<table><tr><th>Stufe</th><th>Quests</th><th>Punkte</th></tr><tr><td>Erkundet</td><td>1</td><td>100</td></tr><tr><td>Erobert</td><td>2</td><td>+20</td></tr><tr><td>Erschlossen</td><td>3</td><td>+20</td></tr></table>" +
      "<p>Alle 10 Regionen erkundet: <strong>„Madeira erkundet!“ +300 Insel-Bonus</strong>. Danach geht das Spiel weiter. Alle 10 Regionen erobert bzw. erschlossen: Meilensteine <strong>„Madeira erobert!“</strong> und <strong>„Madeira erschlossen!“</strong> (ohne Extrapunkte).</p>" +
      "<h3>" + icon("layers") + " Stapel-Quests</h3><p>26 Stapel-Quests, überall auf der Insel machbar (einfach 15, mittel 25, schwer 50 Punkte). Sie liegen gemischt in einem Stapel; immer 3 sind offen, der Rest bleibt verdeckt. Ist eine erledigt, wird automatisch eine neue vom Stapel gezogen. Stapel-Quests erkunden keine Region.</p>" +
      "<p>„" + icon("list-checks") + " Alle Quests“ zeigt alle 56 Quests zum Ansehen.</p>" +
      "<h3>" + icon("shopping-bag") + " Shop</h3><ul><li><strong>Region-Joker (150) · 1 im Spiel:</strong> Region gilt als erkundet, ohne die 100 Punkte.</li>" +
      "<li><strong>Tausch-Joker (10) · 5 im Spiel:</strong> eine offene Stapel-Quest zurück in den Stapel, eine neue wird vom Stapel gezogen. Rückgängig gemachte Tausche zählen nicht.</li>" +
      "<li><strong>Multiplikator (10) · 3 im Spiel:</strong> zufälliger Faktor ×0,5–×2,0 (5 % Jackpot ×5) auf eine offene Stapel-Quest, aufgerundet. Einer pro Stapel-Quest; sie kann danach nicht getauscht werden. Lohnt sich vor allem bei schweren Stapel-Quests.</li></ul>" +
      "<p>Jeder ausgegebene Punkt fehlt am Ende bei den Belohnungen. Ist der Kontostand negativ, ist der Shop gesperrt. Shop und Statistik zeigen immer, wie viele Joker schon <em>genutzt</em> wurden, z. B. „Tausch-Joker · 2 von 5 genutzt“.</p>" +
      "<h3>" + icon("wrench") + " Werkzeuge</h3><p>Manche regionalen Quests haben unter der Aufgabe ein freiwilliges <strong>Werkzeug</strong>: Countdown, Stoppuhr mit Schätzung, Autos zählen, Kompass, Tic-Tac-Toe oder Strafzeit. Alle Handys sehen denselben Stand. Werkzeuge geben keine Punkte und haken nichts ab – abhaken macht ihr selbst.</p>" +
      "<h3>" + icon("trophy") + " Ränge</h3><p>Landstreicher (ab 0) · Abenteurer (ab 700) · Inselkönig (ab 1.500). Es zählen die <em>verdienten</em> Punkte – Shop-Ausgaben senken den Rang nicht.</p>" +
      "<p><strong>Maximum:</strong> Ohne Multiplikatoren sind 2.400 Punkte möglich. Jeder Multiplikator verändert dieses Maximum: Die Stapel-Quest zählt dann mit ihrem multiplizierten Wert (Faktor über 1 erhöht, unter 1 senkt das Maximum). Das aktuelle Maximum steht in der Statistik.</p>" +
      "<h3>" + icon("undo-2") + " Rückgängig und Reset</h3><p>Alles lässt sich rückgängig machen (Haken antippen oder im Logbuch " + icon("undo-2") + "). Wiederholte Käufe bringen dasselbe Ergebnis. Ein kompletter Reset gilt für alle Handys und braucht die Eingabe „RESET“.</p>" +
      "<h3>" + icon("compass") + " Bedienung</h3><p>Die Startseite zeigt die Inselkarte und die 3 offenen Stapel-Quests. Pin antippen öffnet die Quest, Region antippen alle 3 Quests der Region; eine Zahl im Kreis bedeutet mehrere Quests nah beieinander. Oben rechts: " + icon("shopping-bag") + " Shop, " + icon("book-open") + " Logbuch, " + icon("chart-column") + " Statistik (Regionen, Fortschritt, Urlaub beenden, Reset) und " + icon("circle-help") + " Hilfe.</p>" +
      "<h3>" + icon("flag") + " Ende</h3><p>„Urlaub beenden“ (unter Statistik) tauscht die Restpunkte in Belohnungen um. Danach gibt es das Zertifikat als PDF.</p>" +
      "</div>");
  }

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
      // Eingaben in Werkzeugen (z. B. halb getippte Schätzung) überleben das Neuzeichnen
      const kept = {};
      $$("[data-keep]", el).forEach((i) => { kept[i.dataset.keep] = i.value; });
      el.innerHTML = renderFn();
      $$("[data-keep]", el).forEach((i) => { if (kept[i.dataset.keep] != null) i.value = kept[i.dataset.keep]; });
      $$("[data-close]", el).forEach((b) => b.addEventListener("click", closeModal));
      if (bindFn) bindFn(el, refresh);
      el.scrollTop = scroll;
      if (focused && focused.amount) { const f = $('[data-amount="' + focused.amount + '"]', el); if (f) f.focus(); }
      if (focused && focused.keep) { const f = $('[data-keep="' + focused.keep + '"]', el); if (f) f.focus(); }
    };
    if (!opts.stack) backdrop.addEventListener("click", (ev) => { if (ev.target === backdrop) closeModal(); });
    const m = { refresh: opts.static ? () => {} : refresh, el: backdrop, onClose: null };
    app.modals.push(m);
    refresh();
    return m;
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

  // ------------------------------------------------------------------ Events
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("button, [data-region]");
    if (!t || !app.state) return;
    if (t.id === "upgrade-btn") return confirmBox("Neues Spiel starten?", "Alles wird auf null gesetzt und der Stapel neu gemischt – für alle Handys.", "Neu starten", true)
      .then((ok) => ok && act({ type: "reset", seed: Math.floor(Math.random() * 2 ** 31) }));
    if (!L.isCompatible(app.state, C)) return;
    if (t.closest(".modal")) return; // Modals binden selbst
    if (t.closest("#island")) return; // Inselkarte: eigene Zeiger-Steuerung
    if (t.dataset.zoom) {
      if (t.dataset.zoom === "reset") { mapUI.vb = Object.assign({}, FULL); const svg = $("#island"); if (svg) applyViewBox(svg); return; }
      const vb = mapUI.vb;
      return zoomAt(t.dataset.zoom === "in" ? 1.6 : 1 / 1.6, vb.x + vb.w / 2, vb.y + vb.h / 2);
    }
    if (t.hasAttribute("data-all-quests")) return openAllQuests();
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.region) return openRegion(t.dataset.region);
    if (t.dataset.done) return act({ type: "stack", questId: t.dataset.done }, { fxFrom: t });
    if (t.dataset.swap) return doSwap(t.dataset.swap);
    if (t.dataset.mult) return doMult(t.dataset.mult);
    if (t.dataset.undo) return undo(Number(t.dataset.undo));
    switch (t.id) {
      case "help-btn": case "help-btn2": return openHelp();
      case "buy-joker": {
        const rid = $("#joker-region").value;
        return confirmBox("Region-Joker kaufen?", IX.regions[rid].name + " gilt dann als erkundet (ohne 100 Punkte). Kosten: 150 Punkte. Region-Joker: 0 von 1 genutzt.", "Kaufen (150)")
          .then((ok) => ok && act({ type: "joker", regionId: rid }));
      }
      case "end-btn": return startEnd();
      case "reset-btn": return doReset();
      case "backup-btn": return downloadBackup();
      case "restore-btn": return $("#restore-file").click();
      case "logout-btn": return logout();
      case "rename-btn": return promptBox("Name ändern", "Unter diesem Namen erscheinen deine Aktionen im Logbuch.", app.name).then((n) => {
        if (n) { app.name = n.slice(0, 24); store.set("name", app.name); render(); }
      });
      case "pdf-btn": return downloadPDF().catch(() => toast("PDF konnte nicht erstellt werden.", true));
      case "reopen-btn": return confirmBox("Urlaub fortsetzen?", "Die Verteilung der Belohnungen wird aufgehoben und ihr könnt weiterspielen.", "Fortsetzen").then((ok) => ok && act({ type: "reopen" }));
      case "tab-stats-btn": { const st = app.state.ended; app.state.ended = null; const html = viewStats(sum()); app.state.ended = st; $("#view").innerHTML = html; $("#end-btn").hidden = true; return; }
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
