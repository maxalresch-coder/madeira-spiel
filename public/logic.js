// ============================================================================
//  Spiellogik – reine Funktionen auf dem Spielstand (kein DOM).
//  Punkte, Kontostand und Stufen werden immer aus dem Spielstand berechnet,
//  dadurch kann nichts doppelt gezählt werden.
// ============================================================================
(function (root) {
  "use strict";

  const STACK_POINTS = { einfach: 15, mittel: 25, schwer: 50 };
  const SCHEMA = 2; // Version des Spielstands (2 = finale Inhalte, Stapel-Quests)
  const PRICES = { joker: 150, swap: 10, mult: 10 };
  const MAX_MULTS = 3;
  const MAX_SWAPS = 5; // Tausch-Joker höchstens 5-mal pro Spiel (rückgängig gemachte zählen nicht)
  const REGION_POINTS = { explored: 100, tier: 20 };
  const MADEIRA_BONUS = 300;
  // Basis-Maximum ohne Multiplikator (das tatsächliche Maximum: maxPoints()): 11 Regionen × 140 + 300 Insel-Bonus +
  // 700 Stapel-Quests = 2.540 (Test prüft es gegen die Inhalte)
  const MAX_POINTS = 2540;
  const RANKS = [
    { name: "Landstreicher", min: 0 },
    { name: "Abenteurer", min: 700 },
    { name: "Inselkönig", min: 1500 }
  ];
  const MILESTONES = [
    { key: "allConquered", name: "Madeira erobert" },
    { key: "allDeveloped", name: "Madeira erschlossen" }
  ];
  const LEVELS = [
    { name: "noch nicht besucht", color: "#c9ced4" },
    { name: "Erkundet", color: "#a6e3a1" },
    { name: "Erobert", color: "#2f9e44" },
    { name: "Erschlossen", color: "#e5b53b" }
  ];

  class GameError extends Error {}
  const fail = (msg) => { throw new GameError(msg); };

  // ---------------------------------------------------------------- Zufall
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // 95 %: ×0,5 … ×2,0 in Zehnerschritten (16 Werte), 5 %: Jackpot ×5
  function rollFactor(rand) {
    if (rand() < 0.05) return 5;
    return (5 + Math.floor(rand() * 16)) / 10;
  }

  // ---------------------------------------------------------------- Inhalte
  function index(content) {
    if (content._index) return content._index;
    const quests = {}, regions = {}, stack = {};
    content.regions.forEach((r) => {
      regions[r.id] = r;
      r.quests.forEach((q) => { quests[q.id] = Object.assign({ region: r.id }, q); });
    });
    content.stackQuests.forEach((s) => { stack[s.id] = s; });
    Object.defineProperty(content, "_index", { value: { quests, regions, stack }, enumerable: false });
    return content._index;
  }

  // ---------------------------------------------------------------- Spielstart
  function newGame(content, seed, now) {
    const rand = mulberry32(seed);
    const deck = content.stackQuests.map((s) => s.id);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const rolls = [];
    for (let i = 0; i < MAX_MULTS; i++) rolls.push(rollFactor(rand));
    const open = deck.splice(0, 3); // die 3 offenen Stapel-Quests
    while (open.length < 3) open.push(null);
    return {
      schema: SCHEMA, seed, createdAt: now,
      quests: {}, joker: null,
      deck, open, done: {}, mults: {}, rolls,
      log: [], nextLogId: 1, ended: null
    };
  }

  // ---------------------------------------------------------------- Ableitungen
  function regionQuestCount(state, content, regionId) {
    return index(content).regions[regionId].quests.filter((q) => state.quests[q.id]).length;
  }
  function regionLevel(state, content, regionId) {
    const n = regionQuestCount(state, content, regionId);
    const joker = state.joker && state.joker.region === regionId ? 1 : 0;
    return Math.min(3, n + joker);
  }
  function regionPoints(state, content, regionId) {
    const lvl = regionLevel(state, content, regionId);
    const viaJoker = state.joker && state.joker.region === regionId;
    let p = 0;
    if (lvl >= 1 && !viaJoker) p += REGION_POINTS.explored;
    if (lvl >= 2) p += REGION_POINTS.tier;
    if (lvl >= 3) p += REGION_POINTS.tier;
    return p;
  }
  function stackBase(content, questId) {
    return STACK_POINTS[index(content).stack[questId].difficulty];
  }
  function stackPoints(state, content, questId) {
    const base = stackBase(content, questId);
    const m = state.mults[questId];
    return m ? Math.ceil(base * m.factor - 1e-9) : base;
  }
  function activeSwaps(state) {
    return state.log.filter((e) => e.type === "swap" && !e.undone).length;
  }

  function summary(state, content) {
    const levels = {};
    let regionPts = 0, explored = 0;
    content.regions.forEach((r) => {
      levels[r.id] = regionLevel(state, content, r.id);
      if (levels[r.id] >= 1) explored++;
      regionPts += regionPoints(state, content, r.id);
    });
    const allExplored = explored === content.regions.length;
    // Meilensteine ohne Punkte: alle Regionen mindestens Erobert bzw. Erschlossen
    const allConquered = content.regions.every((r) => levels[r.id] >= 2);
    const allDeveloped = content.regions.every((r) => levels[r.id] >= 3);
    let stackPts = 0;
    const doneStack = Object.keys(state.done);
    doneStack.forEach((id) => { stackPts += stackPoints(state, content, id); });
    const earned = regionPts + (allExplored ? MADEIRA_BONUS : 0) + stackPts;
    const swaps = activeSwaps(state);
    const multCount = Object.keys(state.mults).length;
    const spent = (state.joker ? PRICES.joker : 0) + swaps * PRICES.swap + multCount * PRICES.mult;
    let rank = 0;
    RANKS.forEach((r, i) => { if (earned >= r.min) rank = i; });
    const factors = Object.values(state.mults).map((m) => m.factor);
    return {
      levels, explored, allExplored, allConquered, allDeveloped, earned, spent, balance: earned - spent,
      rank, rankName: RANKS[rank].name, nextRank: RANKS[rank + 1] || null,
      regionPts, stackPts, madeiraBonus: allExplored ? MADEIRA_BONUS : 0,
      doneStack: doneStack.length, swaps, multCount, jokerUsed: state.joker ? 1 : 0,
      maxPoints: maxPoints(state, content), maxDelta: maxPoints(state, content) - MAX_POINTS,
      bestMult: factors.length ? Math.max.apply(null, factors) : null,
      deckLeft: state.deck.length,
      stackFinished: state.deck.length === 0 && state.open.every((q) => !q),
      questsDone: Object.keys(state.quests).length
    };
  }

  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dayCount(state, now) {
    const start = new Date(dayKey(state.createdAt) + "T00:00:00");
    const end = new Date(dayKey(state.ended ? state.ended.at : now) + "T00:00:00");
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
  }
  // Punkte pro Tag (Summe der Änderungen, Rückgängiges zählt negativ)
  function pointsPerDay(state, now) {
    const days = [];
    const start = new Date(dayKey(state.createdAt) + "T12:00:00");
    const n = dayCount(state, now);
    const map = {};
    for (let i = 0; i < n; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const k = dayKey(d.getTime());
      map[k] = { day: k, points: 0 };
      days.push(map[k]);
    }
    state.log.forEach((e) => { const k = dayKey(e.t); if (map[k]) map[k].points += e.dE || 0; });
    return days;
  }

  function multFreeSlot(state) {
    const used = Object.values(state.mults).map((m) => m.slot);
    for (let i = 0; i < MAX_MULTS; i++) if (used.indexOf(i) < 0) return i;
    return -1;
  }

  // ---------------------------------------------------------------- Aktionen
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function requireShop(sum, price) {
    if (sum.balance < 0) fail("Der Kontostand ist negativ – der Shop ist gesperrt.");
    if (sum.balance < price) fail("Nicht genug Punkte (" + price + " nötig, " + sum.balance + " vorhanden).");
  }
  function fmtFactor(f) { return "×" + (f === 5 ? "5" : f.toFixed(1).replace(".", ",")); }

  /**
   * Führt eine Aktion aus und gibt den NEUEN Spielstand zurück.
   * action: {type, ...}, by: Spielername, now: Zeitstempel
   */
  function apply(oldState, content, action, by, now) {
    const ix = index(content);
    if (action.type === "reset") {
      const s = newGame(content, action.seed, now);
      s.log.push({ id: s.nextLogId++, t: now, by, type: "reset", text: "Kompletter Reset – neues Spiel, neu gemischt", dE: 0, dS: 0, undone: false });
      return s;
    }
    const state = clone(oldState);
    const before = summary(oldState, content);
    let entry;

    if (state.ended && action.type !== "reopen") fail("Der Urlaub ist beendet – erst „Urlaub fortsetzen“ wählen.");

    switch (action.type) {
      case "quest": {
        const q = ix.quests[action.questId] || fail("Unbekannte Quest.");
        if (state.quests[q.id]) fail("Diese Quest ist schon erledigt.");
        state.quests[q.id] = { by, t: now };
        entry = { type: "quest", data: { questId: q.id }, text: "Quest „" + q.title + "“ (" + ix.regions[q.region].name + ") erledigt" };
        break;
      }
      case "stack": {
        const id = action.questId;
        const slot = state.open.indexOf(id);
        if (slot < 0) fail("Diese Stapel-Quest ist gerade nicht offen.");
        state.done[id] = { by, t: now };
        state.open[slot] = state.deck.length ? state.deck.shift() : null;
        entry = { type: "stack", data: { questId: id }, text: "Stapel-Quest „" + ix.stack[id].title + "“ erledigt" };
        takeTool(state, id, entry);
        break;
      }
      case "joker": {
        const r = ix.regions[action.regionId] || fail("Unbekannte Region.");
        if (state.joker) fail("Der Region-Joker ist schon genutzt (1 von 1 genutzt).");
        if (regionLevel(state, content, r.id) > 0) fail(r.name + " ist schon erkundet.");
        requireShop(before, PRICES.joker);
        state.joker = { region: r.id, by, t: now };
        entry = { type: "joker", data: { regionId: r.id }, text: "Region-Joker für " + r.name + " gekauft" };
        break;
      }
      case "swap": {
        const id = action.questId;
        const slot = state.open.indexOf(id);
        if (slot < 0) fail("Diese Stapel-Quest ist gerade nicht offen.");
        if (state.mults[id]) fail("Eine Stapel-Quest mit Multiplikator kann nicht getauscht werden.");
        if (!state.deck.length) fail("Der Stapel ist leer – es gibt nichts zum Tauschen.");
        if (activeSwaps(state) >= MAX_SWAPS) fail("Alle Tausch-Joker sind genutzt (" + MAX_SWAPS + " von " + MAX_SWAPS + " genutzt).");
        requireShop(before, PRICES.swap);
        const fresh = state.deck.shift();
        // feste, zufällig wirkende Position (nicht ganz oben): gleiches Ergebnis bei Wiederholung
        const pos = state.deck.length ? 1 + (hash(state.seed + ":" + id + ":" + state.deck.length) % state.deck.length) : 0;
        state.deck.splice(pos, 0, id);
        state.open[slot] = fresh;
        entry = { type: "swap", data: { oldId: id, newId: fresh }, text: "Tausch-Joker: „" + ix.stack[id].title + "“ zurück in den Stapel, „" + ix.stack[fresh].title + "“ vom Stapel gezogen" };
        takeTool(state, id, entry);
        break;
      }
      case "mult": {
        const id = action.questId;
        if (state.open.indexOf(id) < 0) fail("Diese Stapel-Quest ist gerade nicht offen.");
        if (state.mults[id]) fail("Diese Stapel-Quest hat schon einen Multiplikator.");
        const slot = multFreeSlot(state);
        if (slot < 0) fail("Alle Multiplikatoren sind genutzt (" + MAX_MULTS + " von " + MAX_MULTS + " genutzt).");
        requireShop(before, PRICES.mult);
        state.mults[id] = { slot, factor: state.rolls[slot], by, t: now };
        const f = state.rolls[slot];
        entry = { type: "mult", data: { questId: id, factor: f }, text: "Multiplikator auf „" + ix.stack[id].title + "“: " + fmtFactor(f) + (f === 5 ? " – JACKPOT!" : "") };
        break;
      }
      case "undo": {
        // refUid: Ziel per fester Kennung (Eintrag von unterwegs – seine Nummer kann sich beim Synchronisieren ändern)
        const target = state.log.find((e) => (action.refUid ? e.uid === action.refUid : e.id === action.logId)) || fail("Eintrag nicht gefunden.");
        if (target.undone) fail("Das wurde schon rückgängig gemacht.");
        undoEntry(state, content, target);
        target.undone = true;
        entry = { type: "undo", data: { ref: target.id }, text: "Rückgängig: " + target.text };
        break;
      }
      case "end": {
        state.ended = { at: now, by, alloc: action.alloc || {} };
        entry = { type: "end", data: {}, text: "Urlaub beendet – Restpunkte verteilt" };
        break;
      }
      case "reopen": {
        if (!state.ended) fail("Der Urlaub läuft noch.");
        state.ended = null;
        entry = { type: "reopen", data: {}, text: "Urlaub fortgesetzt" };
        break;
      }
      default:
        fail("Unbekannte Aktion.");
    }

    const after = summary(state, content);
    entry.id = state.nextLogId++;
    entry.t = now;
    entry.by = by;
    entry.dE = after.earned - before.earned;
    entry.dS = after.spent - before.spent;
    entry.undone = false;
    if (action.uid) entry.uid = String(action.uid);
    state.log.push(entry);
    // Meilensteine "Madeira erobert/erschlossen" (ohne Punkte) bei den Aktivitäten festhalten –
    // auch wenn sie durch Rückgängigmachen wieder verloren gehen.
    MILESTONES.forEach((m) => {
      if (before[m.key] === after[m.key]) return;
      state.log.push({
        id: state.nextLogId++, t: now, by, type: "milestone", data: { milestone: m.key, reached: after[m.key] },
        text: after[m.key] ? "Meilenstein erreicht: " + m.name + "!" : "Meilenstein „" + m.name + "“ nicht mehr erfüllt",
        dE: 0, dS: 0, undone: false
      });
    });
    return state;
  }

  // Hilfsmittel einer Stapel-Quest (Zähler, Timer …) beim Abhaken/Tauschen zurücksetzen; der alte Stand
  // wird im Eintrag gemerkt, damit Rückgängig ihn wiederherstellt.
  function takeTool(state, id, entry) {
    if (!state.tools || !state.tools[id]) return;
    entry.data.tool = state.tools[id];
    delete state.tools[id];
  }
  function giveTool(state, id, e) {
    if (!e.data.tool) return;
    state.tools = state.tools || {};
    if (!state.tools[id]) state.tools[id] = e.data.tool;
  }

  function undoEntry(state, content, e) {
    const ix = index(content);
    switch (e.type) {
      case "quest":
        if (!state.quests[e.data.questId]) fail("Quest ist nicht mehr erledigt.");
        delete state.quests[e.data.questId];
        return;
      case "stack": {
        const id = e.data.questId;
        if (!state.done[id]) fail("Stapel-Quest ist nicht mehr erledigt.");
        delete state.done[id];
        giveTool(state, id, e);
        state.deck.unshift(id); // zurück oben auf den Stapel
        for (let i = 0; i < state.open.length; i++) {
          if (!state.open[i] && state.deck.length) state.open[i] = state.deck.shift();
        }
        return;
      }
      case "joker":
        if (!state.joker || state.joker.region !== e.data.regionId) fail("Joker ist nicht mehr aktiv.");
        state.joker = null;
        return;
      case "swap": {
        const { oldId, newId } = e.data;
        const slot = state.open.indexOf(newId);
        const pos = state.deck.indexOf(oldId);
        if (slot < 0 || pos < 0 || state.mults[newId]) {
          fail("Dieser Tausch lässt sich nicht mehr rückgängig machen – „" + ix.stack[newId].title + "“ muss dafür unverändert offen und „" + ix.stack[oldId].title + "“ im Stapel sein. Macht zuerst die späteren Aktionen rückgängig.");
        }
        state.deck.splice(pos, 1);
        state.deck.unshift(newId);
        state.open[slot] = oldId;
        giveTool(state, oldId, e);
        return;
      }
      case "mult": {
        const id = e.data.questId;
        if (!state.mults[id]) fail("Multiplikator ist nicht mehr aktiv.");
        if (state.done[id]) fail("Die Stapel-Quest ist schon erledigt – macht zuerst die Stapel-Quest rückgängig.");
        delete state.mults[id];
        return;
      }
      default:
        fail("Diese Aktion kann man nicht rückgängig machen.");
    }
  }

  // Passt ein gespeicherter Spielstand zu den aktuellen Inhalten?
  function isCompatible(state, content) {
    if (!state || state.schema !== SCHEMA || !Array.isArray(state.open)) return false;
    const ix = index(content);
    const ids = state.deck.concat(state.open.filter(Boolean), Object.keys(state.done), Object.keys(state.mults));
    return ids.every((id) => ix.stack[id]) && Object.keys(state.quests).every((id) => ix.quests[id]);
  }

  // Maximal erreichbare Punkte: Basis 2.540, aber jede Stapel-Quest mit Multiplikator
  // (erledigt oder offen) zählt mit ihrem multiplizierten, aufgerundeten Wert.
  function maxPoints(state, content) {
    let delta = 0;
    Object.keys(state.mults).forEach((id) => { delta += stackPoints(state, content, id) - stackBase(content, id); });
    return MAX_POINTS + delta;
  }

  // ---------------------------------------------------------------- Fortschritt in Etappen
  // Für die Balken bei den Erfolgen: jede Etappe hat die Farbe der Stufe auf der Inselkarte
  // (1 = Erkundet, 2 = Erobert, 3 = Erschlossen). Ist eine Etappe geschafft, beginnt die
  // nächste wieder bei 0. Alles wird aus dem Spielstand berechnet – Rückgängig passt also.
  function regionProgress(sum, content) {
    const total = content.regions.length;
    const counts = [1, 2, 3].map((lvl) => content.regions.filter((r) => sum.levels[r.id] >= lvl).length);
    const words = ["erkundet", "erobert", "erschlossen"];
    let stage = counts.findIndex((c) => c < total);
    const full = stage < 0;
    if (full) stage = 2;
    return {
      stage: stage + 1, color: LEVELS[stage + 1].color, value: counts[stage], max: total,
      pct: full ? 100 : counts[stage] / total * 100,
      text: counts[stage] + " von " + total + " Regionen " + words[stage],
      done: counts.map((c) => c >= total)
    };
  }
  function rankProgress(earned, max) {
    max = max || MAX_POINTS;
    const bounds = [RANKS[1].min, RANKS[2].min, Math.max(max, RANKS[2].min + 1)]; // 700, 1.500, aktuelles Maximum
    const targets = [RANKS[1].name, RANKS[2].name, "zum Maximum"];
    let stage = bounds.findIndex((b) => earned < b);
    const full = stage < 0;
    if (full) stage = 2;
    const from = stage === 0 ? 0 : bounds[stage - 1], to = bounds[stage];
    const fmtN = (n) => Math.round(n).toLocaleString("de-DE");
    return {
      stage: stage + 1, color: LEVELS[stage + 1].color,
      pct: full ? 100 : Math.max(0, (earned - from) / (to - from) * 100),
      text: full ? (earned > max ? "Maximum übertroffen (+" + fmtN(earned - max) + " Punkte)" : "Maximum erreicht!")
        : "noch " + fmtN(to - earned) + " Punkte bis " + targets[stage],
      ranks: RANKS.map((r) => ({ name: r.name, reached: earned >= r.min }))
    };
  }

  // ---------------------------------------------------------------- Urlaubs-Rückblick
  // Luftlinie zwischen zwei [lat, lon] in km (Haversine)
  function distanceKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // Ereignisse des Rückblicks: nur Quests, die JETZT erledigt sind (Rückgängiggemachtes fehlt also ganz), streng nach
  // ihrem gespeicherten Zeitpunkt (bei Gleichstand in der Reihenfolge der Aktivitäten). Der Region-Joker färbt seine Region
  // zu seinem Zeitpunkt ein (ohne eigenen Auftritt). Je Ereignis: Punkte, die es gebracht hat (inkl. Stufen und Insel-Bonus),
  // Punktestand danach, Stufen aller Regionen danach, Tag (1 = Spielbeginn) und bei regionalen Quests die Luftlinie seit
  // der vorigen regionalen Quest.
  function recap(state, content) {
    const ix = index(content);
    const order = {};
    state.log.forEach((e, i) => { if (e.data && e.data.questId && !(e.data.questId in order) && !e.undone) order[e.type + ":" + e.data.questId] = i; });
    const items = [];
    Object.keys(state.quests).forEach((id) => { if (ix.quests[id]) items.push({ kind: "quest", id, t: state.quests[id].t, by: state.quests[id].by, o: order["quest:" + id] }); });
    Object.keys(state.done).forEach((id) => { if (ix.stack[id]) items.push({ kind: "stack", id, t: state.done[id].t, by: state.done[id].by, o: order["stack:" + id] }); });
    if (state.joker) items.push({ kind: "joker", id: state.joker.region, t: state.joker.t, by: state.joker.by, o: -1 });
    const key = (x) => (x.o == null ? 1e9 : x.o);
    items.sort((a, b) => (a.t - b.t) || (key(a) - key(b)));
    const sim = { quests: {}, done: {}, joker: null, mults: state.mults, deck: [], open: [], log: [], rolls: state.rolls };
    const day0 = new Date(dayKey(state.createdAt) + "T00:00:00").getTime();
    let earned = 0, km = 0, lastPin = null;
    const events = [];
    items.forEach((x) => {
      if (x.kind === "quest") sim.quests[x.id] = { by: x.by, t: x.t };
      else if (x.kind === "stack") sim.done[x.id] = { by: x.by, t: x.t };
      else sim.joker = state.joker;
      const sm = summary(sim, content);
      const ev = { kind: x.kind, id: x.id, t: x.t, by: x.by, points: sm.earned - earned, earned: sm.earned, levels: sm.levels,
        day: Math.max(1, Math.round((new Date(dayKey(x.t) + "T00:00:00").getTime() - day0) / 86400000) + 1) };
      earned = sm.earned;
      if (x.kind === "quest") {
        const q = ix.quests[x.id];
        ev.region = q.region;
        ev.km = lastPin ? distanceKm(lastPin, q.pin) : 0;
        km += ev.km;
        lastPin = q.pin;
      } else if (x.kind === "stack") {
        ev.difficulty = ix.stack[x.id].difficulty;
        ev.factor = state.mults[x.id] ? state.mults[x.id].factor : null;
      }
      events.push(ev);
    });
    return { events, earned, km, days: dayCount(state, Date.now()) };
  }

  // Fleißigster Tag (für die Urkunde): Tag mit den meisten erledigten Quests (regional + Stapel); bei Gleichstand der frühere
  function busiestDay(state) {
    const n = {};
    Object.values(state.quests).concat(Object.values(state.done)).forEach((x) => { const k = dayKey(x.t); n[k] = (n[k] || 0) + 1; });
    let best = null;
    Object.keys(n).sort().forEach((k) => { if (!best || n[k] > best.count) best = { day: k, count: n[k] }; });
    return best;
  }

  // ---------------------------------------------------------------- Test-Simulation
  // Zufälliger, aber regelgerechter Spielstand über ~7 Tage (Einstellungen → Testspiel simulieren): Jede Aktion läuft über
  // apply(), Punkte stimmen also immer. Regionen in allen Stufen gemischt (in ~30 % der Fälle ganz Madeira erkundet),
  // Stapel-Quests, Multiplikatoren, Tausch- und Region-Joker, einige rückgängig gemachte Aktionen.
  function simulateGame(content, seed, now, names) {
    const rand = mulberry32(seed);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const DAY = 86400000, start = new Date(dayKey(now - 6 * DAY) + "T08:30:00").getTime();
    let s = newGame(content, seed, start);
    names = names && names.length ? names : ["Spieler 1", "Spieler 2", "Spieler 3"];
    const all = content.regions.reduce((a, r) => a.concat(r.quests.map((q) => q.id)), []);
    const explore = rand() < 0.3;
    const plan = [];
    if (explore) content.regions.forEach((r) => plan.push(pick(r.quests).id));
    const extra = all.filter((id) => plan.indexOf(id) < 0).sort(() => rand() - 0.5);
    plan.push.apply(plan, extra.slice(0, (explore ? 4 : 11) + Math.floor(rand() * 9)));
    plan.sort(() => rand() - 0.5);
    const acts = plan.map((id) => ({ type: "quest", questId: id }));
    const stacks = 6 + Math.floor(rand() * 7);
    for (let i = 0; i < stacks; i++) acts.splice(Math.floor(rand() * (acts.length + 1)), 0, { type: "stackAny" });
    for (let i = 0; i < 3; i++) acts.splice(Math.floor(rand() * acts.length) + 1, 0, { type: "multAny" });
    for (let i = 0; i < 2; i++) acts.splice(Math.floor(rand() * acts.length) + 1, 0, { type: "swapAny" });
    if (rand() < 0.7) acts.splice(Math.floor(acts.length * (0.4 + rand() * 0.5)), 0, { type: "jokerAny" });
    for (let i = 0, n = 2 + Math.floor(rand() * 3); i < n; i++) acts.splice(Math.floor(acts.length * (0.2 + rand() * 0.8)), 0, { type: "undoAny" });
    // Zeitpunkte: aufsteigend, je Tag zwischen 8:30 und 21:00
    const times = acts.map(() => start + Math.floor(rand() * 7) * DAY + Math.floor(rand() * 12.5 * 3600000)).sort((a, b) => a - b)
      .map((t) => Math.min(t, now - 60000));
    acts.forEach((a, i) => {
      let action = a;
      const openIds = s.open.filter(Boolean);
      if (a.type === "stackAny") action = openIds.length && { type: "stack", questId: pick(openIds) };
      else if (a.type === "multAny") action = openIds.length && { type: "mult", questId: pick(openIds) };
      else if (a.type === "swapAny") action = openIds.length && { type: "swap", questId: pick(openIds) };
      else if (a.type === "jokerAny") {
        const free = content.regions.filter((r) => regionLevel(s, content, r.id) === 0);
        action = free.length && { type: "joker", regionId: pick(free).id };
      } else if (a.type === "undoAny") {
        const can = s.log.filter((e) => canUndo(e) && e.type !== "joker");
        action = can.length && { type: "undo", logId: pick(can).id };
      }
      if (!action) return;
      try { s = apply(s, content, action, pick(names), Math.max(times[i], s.log.length ? s.log[s.log.length - 1].t + 1000 : start)); } catch (e) {
        if (!(e instanceof GameError)) throw e; // z. B. zu wenig Punkte: Aktion auslassen
      }
    });
    return s;
  }

  function canUndo(entry) {
    return !entry.undone && ["quest", "stack", "joker", "swap", "mult"].indexOf(entry.type) >= 0;
  }

  // Zeitraum für die Urkunde: „10. – 18. Oktober 2026“, „28. September – 5. Oktober 2026“,
  // „28. Dezember 2026 – 3. Januar 2027“, gleicher Tag: „18. Oktober 2026“
  const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  function dateRange(from, to) {
    const a = new Date(dayKey(from) + "T12:00:00"), b = new Date(dayKey(Math.max(from, to)) + "T12:00:00");
    const d = (x) => x.getDate() + ".", m = (x) => MONTHS[x.getMonth()], y = (x) => x.getFullYear();
    if (dayKey(a.getTime()) === dayKey(b.getTime())) return d(b) + " " + m(b) + " " + y(b);
    if (y(a) !== y(b)) return d(a) + " " + m(a) + " " + y(a) + " – " + d(b) + " " + m(b) + " " + y(b);
    if (a.getMonth() !== b.getMonth()) return d(a) + " " + m(a) + " – " + d(b) + " " + m(b) + " " + y(b);
    return d(a) + " – " + d(b) + " " + m(b) + " " + y(b);
  }

  // ---------------------------------------------------------------- Belohnungen
  // Zählbare Belohnungen (kind "count": Bild, Zutat, Tag) nur in ganzen Einheiten (100 Punkte = 1), Zeit-Belohnungen frei.
  // Liefert den erlaubten Wert für eine gewünschte Punktzahl, wenn insgesamt höchstens „max“ Punkte möglich sind.
  function rewardAmount(reward, want, max) {
    let v = Math.max(0, Math.min(Math.round(want) || 0, max));
    if (reward.kind === "count") v = Math.floor(v / 100) * 100;
    return v;
  }
  function rewardValue(reward, points) {
    return (points / 100) * reward.per100;
  }
  function formatReward(reward, points) {
    const v = rewardValue(reward, points);
    if (reward.kind === "time") {
      const totalSec = Math.round(v * 60);
      const min = Math.floor(totalSec / 60), sec = totalSec % 60;
      return min + " Min" + (sec ? " " + sec + " Sek" : "");
    }
    const n = Math.round(v * 100) / 100;
    const unit = n === 1 ? reward.unit : (reward.unitPlural || reward.unit);
    return String(n).replace(".", ",") + " " + unit;
  }

  /**
   * Offline-Warteschlange nachspielen: wendet die gemerkten Änderungen der Reihe nach auf einen (neueren) Stand an.
   * items: {k: "act", uid, seed, by, t, action} bzw. {k: "tool", uid, seed, qid, op, now, by} (Hilfsmittel über applyTool).
   * Was nicht mehr passt (ein anderes Handy war schneller, z. B. dieselbe Quest schon erledigt), wird übersprungen –
   * Punkte werden immer aus dem Ergebnis berechnet, also nie doppelt gezählt. Schon übernommene Änderungen (uid in
   * state.uids, z. B. Antwort des Servers ging verloren) werden nicht noch einmal angewendet.
   * Ergebnis: {state, applied: [uid], skipped: [{item, reason}]}
   */
  const UIDS_KEEP = 400;
  function replay(base, content, items, applyTool) {
    let state = base;
    const applied = [], skipped = [];
    (items || []).forEach((it) => {
      if (!state || it.seed !== state.seed) { skipped.push({ item: it, reason: "Änderung aus einem früheren Spiel", old: true }); return; }
      if ((state.uids || []).indexOf(it.uid) >= 0) return; // schon übernommen
      let next;
      try {
        next = it.k === "tool" ? applyTool(state, it) : apply(state, content, Object.assign({}, it.action, { uid: it.uid }), it.by, it.t);
      } catch (e) {
        skipped.push({ item: it, reason: (e && e.message) || "passt nicht mehr" });
        return;
      }
      if (next === state) next = Object.assign({}, state);
      next.uids = (state.uids || []).concat(it.uid).slice(-UIDS_KEEP);
      state = next;
      applied.push(it.uid);
    });
    return { state, applied, skipped };
  }

  const api = {
    STACK_POINTS, SCHEMA, PRICES, MAX_MULTS, MAX_SWAPS, MADEIRA_BONUS, MAX_POINTS, RANKS, LEVELS, MILESTONES, GameError,
    newGame, apply, summary, regionLevel, regionQuestCount, regionPoints, stackBase, stackPoints, isCompatible, regionProgress, rankProgress, maxPoints,
    canUndo, dayCount, pointsPerDay, recap, distanceKm, busiestDay, simulateGame, mulberry32, multFreeSlot, rewardValue, formatReward, rewardAmount, dateRange, fmtFactor, index, hash, replay
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GameLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
