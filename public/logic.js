// ============================================================================
//  Spiellogik – reine Funktionen auf dem Spielstand (kein DOM).
//  Punkte, Kontostand und Stufen werden immer aus dem Spielstand berechnet,
//  dadurch kann nichts doppelt gezählt werden.
// ============================================================================
(function (root) {
  "use strict";

  const CARD_POINTS = { leicht: 15, mittel: 25, schwer: 50 };
  const PRICES = { joker: 150, swap: 10, mult: 10 };
  const MAX_MULTS = 3;
  const REGION_POINTS = { explored: 100, tier: 20 };
  const MADEIRA_BONUS = 300;
  const MAX_POINTS = 2400; // ohne Multiplikator
  const RANKS = [
    { name: "Landstreicher", min: 0 },
    { name: "Abenteurer", min: 700 },
    { name: "Inselkönig", min: 1500 }
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
    const quests = {}, regions = {}, cards = {};
    content.regions.forEach((r) => {
      regions[r.id] = r;
      r.quests.forEach((q) => { quests[q.id] = Object.assign({ region: r.id }, q); });
    });
    content.bonusCards.forEach((c) => { cards[c.id] = c; });
    Object.defineProperty(content, "_index", { value: { quests, regions, cards }, enumerable: false });
    return content._index;
  }

  // ---------------------------------------------------------------- Spielstart
  function newGame(content, seed, now) {
    const rand = mulberry32(seed);
    const deck = content.bonusCards.map((c) => c.id);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const rolls = [];
    for (let i = 0; i < MAX_MULTS; i++) rolls.push(rollFactor(rand));
    const hand = deck.splice(0, 3);
    while (hand.length < 3) hand.push(null);
    return {
      schema: 1, seed, createdAt: now,
      quests: {}, joker: null,
      deck, hand, done: {}, mults: {}, rolls,
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
  function cardBase(content, cardId) {
    return CARD_POINTS[index(content).cards[cardId].difficulty];
  }
  function cardPoints(state, content, cardId) {
    const base = cardBase(content, cardId);
    const m = state.mults[cardId];
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
    let cardPts = 0;
    const doneCards = Object.keys(state.done);
    doneCards.forEach((id) => { cardPts += cardPoints(state, content, id); });
    const earned = regionPts + (allExplored ? MADEIRA_BONUS : 0) + cardPts;
    const swaps = activeSwaps(state);
    const multCount = Object.keys(state.mults).length;
    const spent = (state.joker ? PRICES.joker : 0) + swaps * PRICES.swap + multCount * PRICES.mult;
    let rank = 0;
    RANKS.forEach((r, i) => { if (earned >= r.min) rank = i; });
    const factors = Object.values(state.mults).map((m) => m.factor);
    return {
      levels, explored, allExplored, earned, spent, balance: earned - spent,
      rank, rankName: RANKS[rank].name, nextRank: RANKS[rank + 1] || null,
      regionPts, cardPts, madeiraBonus: allExplored ? MADEIRA_BONUS : 0,
      doneCards: doneCards.length, swaps, multCount, jokerUsed: state.joker ? 1 : 0,
      bestMult: factors.length ? Math.max.apply(null, factors) : null,
      deckLeft: state.deck.length,
      bonusFinished: state.deck.length === 0 && state.hand.every((c) => !c),
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
      case "card": {
        const id = action.cardId;
        const slot = state.hand.indexOf(id);
        if (slot < 0) fail("Diese Karte ist nicht auf der Hand.");
        state.done[id] = { by, t: now };
        state.hand[slot] = state.deck.length ? state.deck.shift() : null;
        entry = { type: "card", data: { cardId: id }, text: "Bonus-Karte „" + ix.cards[id].title + "“ erledigt" };
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
        const id = action.cardId;
        const slot = state.hand.indexOf(id);
        if (slot < 0) fail("Diese Karte ist nicht auf der Hand.");
        if (state.mults[id]) fail("Eine Karte mit Multiplikator kann nicht getauscht werden.");
        if (!state.deck.length) fail("Der Stapel ist leer – es gibt nichts zum Tauschen.");
        requireShop(before, PRICES.swap);
        const fresh = state.deck.shift();
        // feste, zufällig wirkende Position (nicht ganz oben): gleiches Ergebnis bei Wiederholung
        const pos = state.deck.length ? 1 + (hash(state.seed + ":" + id + ":" + state.deck.length) % state.deck.length) : 0;
        state.deck.splice(pos, 0, id);
        state.hand[slot] = fresh;
        entry = { type: "swap", data: { oldId: id, newId: fresh }, text: "Tausch-Joker: „" + ix.cards[id].title + "“ → „" + ix.cards[fresh].title + "“" };
        break;
      }
      case "mult": {
        const id = action.cardId;
        if (state.hand.indexOf(id) < 0) fail("Diese Karte ist nicht auf der Hand.");
        if (state.mults[id]) fail("Diese Karte hat schon einen Multiplikator.");
        const slot = multFreeSlot(state);
        if (slot < 0) fail("Alle 3 Multiplikatoren sind schon im Einsatz.");
        requireShop(before, PRICES.mult);
        state.mults[id] = { slot, factor: state.rolls[slot], by, t: now };
        const f = state.rolls[slot];
        entry = { type: "mult", data: { cardId: id, factor: f }, text: "Multiplikator auf „" + ix.cards[id].title + "“: " + fmtFactor(f) + (f === 5 ? " – JACKPOT!" : "") };
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
    return state;
  }

  function undoEntry(state, content, e) {
    const ix = index(content);
    switch (e.type) {
      case "quest":
        if (!state.quests[e.data.questId]) fail("Quest ist nicht mehr erledigt.");
        delete state.quests[e.data.questId];
        return;
      case "card": {
        const id = e.data.cardId;
        if (!state.done[id]) fail("Karte ist nicht mehr erledigt.");
        delete state.done[id];
        state.deck.unshift(id); // zurück oben auf den Stapel
        for (let i = 0; i < state.hand.length; i++) {
          if (!state.hand[i] && state.deck.length) state.hand[i] = state.deck.shift();
        }
        return;
      }
      case "joker":
        if (!state.joker || state.joker.region !== e.data.regionId) fail("Joker ist nicht mehr aktiv.");
        state.joker = null;
        return;
      case "swap": {
        const { oldId, newId } = e.data;
        const slot = state.hand.indexOf(newId);
        const pos = state.deck.indexOf(oldId);
        if (slot < 0 || pos < 0 || state.mults[newId]) {
          fail("Dieser Tausch lässt sich nicht mehr rückgängig machen – „" + ix.cards[newId].title + "“ muss dafür unverändert auf der Hand und „" + ix.cards[oldId].title + "“ im Stapel sein. Macht zuerst die späteren Aktionen rückgängig.");
        }
        state.deck.splice(pos, 1);
        state.deck.unshift(newId);
        state.hand[slot] = oldId;
        return;
      }
      case "mult": {
        const id = e.data.cardId;
        if (!state.mults[id]) fail("Multiplikator ist nicht mehr aktiv.");
        if (state.done[id]) fail("Die Karte ist schon erledigt – macht zuerst die Karte rückgängig.");
        delete state.mults[id];
        return;
      }
      default:
        fail("Diese Aktion kann man nicht rückgängig machen.");
    }
  }

  function canUndo(entry) {
    return !entry.undone && ["quest", "card", "joker", "swap", "mult"].indexOf(entry.type) >= 0;
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
    CARD_POINTS, PRICES, MAX_MULTS, MADEIRA_BONUS, MAX_POINTS, RANKS, LEVELS, GameError,
    newGame, apply, summary, regionLevel, regionQuestCount, regionPoints, cardBase, cardPoints,
    canUndo, dayCount, pointsPerDay, multFreeSlot, rewardValue, formatReward, fmtFactor, index, hash
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GameLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
