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
  const MAX_POINTS = 2400; // ohne Multiplikator
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
        break;
      }
      case "joker": {
        const r = ix.regions[action.regionId] || fail("Unbekannte Region.");
        if (state.joker) fail("Der Region-Joker wurde schon eingesetzt (einmal pro Spiel).");
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
        if (activeSwaps(state) >= MAX_SWAPS) fail("Der Tausch-Joker wurde schon " + MAX_SWAPS + "-mal benutzt – mehr geht nicht.");
        requireShop(before, PRICES.swap);
        const fresh = state.deck.shift();
        // feste, zufällig wirkende Position (nicht ganz oben): gleiches Ergebnis bei Wiederholung
        const pos = state.deck.length ? 1 + (hash(state.seed + ":" + id + ":" + state.deck.length) % state.deck.length) : 0;
        state.deck.splice(pos, 0, id);
        state.open[slot] = fresh;
        entry = { type: "swap", data: { oldId: id, newId: fresh }, text: "Tausch-Joker: „" + ix.stack[id].title + "“ zurück in den Stapel, „" + ix.stack[fresh].title + "“ vom Stapel gezogen" };
        break;
      }
      case "mult": {
        const id = action.questId;
        if (state.open.indexOf(id) < 0) fail("Diese Stapel-Quest ist gerade nicht offen.");
        if (state.mults[id]) fail("Diese Stapel-Quest hat schon einen Multiplikator.");
        const slot = multFreeSlot(state);
        if (slot < 0) fail("Alle 3 Multiplikatoren sind schon im Einsatz.");
        requireShop(before, PRICES.mult);
        state.mults[id] = { slot, factor: state.rolls[slot], by, t: now };
        const f = state.rolls[slot];
        entry = { type: "mult", data: { questId: id, factor: f }, text: "Multiplikator auf „" + ix.stack[id].title + "“: " + fmtFactor(f) + (f === 5 ? " – JACKPOT!" : "") };
        break;
      }
      case "undo": {
        const target = state.log.find((e) => e.id === action.logId) || fail("Eintrag nicht gefunden.");
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
    state.log.push(entry);
    // Meilensteine "Madeira erobert/erschlossen" (ohne Punkte) im Logbuch festhalten –
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

  function canUndo(entry) {
    return !entry.undone && ["quest", "stack", "joker", "swap", "mult"].indexOf(entry.type) >= 0;
  }

  // ---------------------------------------------------------------- Belohnungen
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

  const api = {
    STACK_POINTS, SCHEMA, PRICES, MAX_MULTS, MAX_SWAPS, MADEIRA_BONUS, MAX_POINTS, RANKS, LEVELS, MILESTONES, GameError,
    newGame, apply, summary, regionLevel, regionQuestCount, regionPoints, stackBase, stackPoints, isCompatible,
    canUndo, dayCount, pointsPerDay, multFreeSlot, rewardValue, formatReward, fmtFactor, index, hash
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GameLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
