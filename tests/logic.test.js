// Ausführen mit: node tests/logic.test.js
const assert = require("assert");
global.window = {};
require("../public/content.js");
const C = window.GAME_CONTENT;
const L = require("../public/logic.js");
let t = 1700000000000;
const act = (s, a) => L.apply(s, C, a, "Tester", (t += 60000));

// Stapel & Würfe sind deterministisch
let s = L.newGame(C, 42, t);
assert.deepStrictEqual(L.newGame(C, 42, t).hand, s.hand);
assert.strictEqual(s.hand.length, 3);
assert.strictEqual(s.deck.length, 23);

// Verteilung der Multiplikatoren (≈ 1,44 im Schnitt)
let sum = 0, N = 200000; for (let i = 0; i < N; i++) { const r = Math.random; sum += (r() < .05 ? 5 : (5 + Math.floor(r() * 16)) / 10); }
assert(Math.abs(sum / N - 1.4425) < 0.02);

// Quests & Regionsstufen
s = act(s, { type: "quest", questId: "q-cal-1" });
assert.strictEqual(L.summary(s, C).earned, 100);
s = act(s, { type: "quest", questId: "q-cal-2" });
s = act(s, { type: "quest", questId: "q-cal-3" });
assert.strictEqual(L.summary(s, C).earned, 140);
assert.strictEqual(L.summary(s, C).levels.calheta, 3);
assert.throws(() => act(s, { type: "quest", questId: "q-cal-1" }));

// Shop-Sperre bei zu wenig Punkten
assert.throws(() => act(s, { type: "joker", regionId: "funchal" }), /Nicht genug/);

// Bonus-Karte
const c0 = s.hand[0];
s = act(s, { type: "card", cardId: c0 });
assert(s.done[c0]); assert.strictEqual(s.hand.length, 3); assert.strictEqual(s.deck.length, 22);
const e1 = L.summary(s, C).earned;
assert.strictEqual(e1, 140 + L.cardBase(C, c0));

// Joker
s = act(s, { type: "joker", regionId: "funchal" });
let sm = L.summary(s, C);
assert.strictEqual(sm.levels.funchal, 1); assert.strictEqual(sm.earned, e1); assert.strictEqual(sm.spent, 150);
s = act(s, { type: "quest", questId: "q-fun-1" });
assert.strictEqual(L.summary(s, C).levels.funchal, 2);
assert.strictEqual(L.summary(s, C).earned, e1 + 20);
assert.throws(() => act(s, { type: "joker", regionId: "machico" }));

// Tausch & Rückgängig -> gleiches Ergebnis
const before = JSON.stringify([s.hand, s.deck]);
const old = s.hand[1];
s = act(s, { type: "swap", cardId: old });
const got = s.hand[1];
const swapId = s.log[s.log.length - 1].id;
s = act(s, { type: "undo", logId: swapId });
assert.strictEqual(JSON.stringify([s.hand, s.deck]), before);
s = act(s, { type: "swap", cardId: old });
assert.strictEqual(s.hand[1], got);

// Multiplikator: gleicher Faktor nach Rückgängig
s = act(s, { type: "mult", cardId: s.hand[1] });
const f1 = s.mults[s.hand[1]].factor;
assert.strictEqual(f1, s.rolls[0]);
const multLog = s.log[s.log.length - 1].id;
s = act(s, { type: "undo", logId: multLog });
s = act(s, { type: "mult", cardId: s.hand[2] });
assert.strictEqual(s.mults[s.hand[2]].factor, f1);
assert.throws(() => act(s, { type: "swap", cardId: s.hand[2] }), /Multiplikator/);
assert.throws(() => act(s, { type: "mult", cardId: s.hand[2] }));

// Karte mit Multiplikator erledigen: aufgerundet
const mc = s.hand[2];
s = act(s, { type: "card", cardId: mc });
assert.strictEqual(L.cardPoints(s, C, mc), Math.ceil(L.cardBase(C, mc) * f1 - 1e-9));
assert.throws(() => act(s, { type: "undo", logId: s.log.find(e => e.type === "mult" && !e.undone).id }), /zuerst/);

// Rückgängig Karte: zurück oben auf den Stapel, Punkte weg
const cardLog = s.log[s.log.length - 1];
const earnedBefore = L.summary(s, C).earned;
s = act(s, { type: "undo", logId: cardLog.id });
assert.strictEqual(s.deck[0], mc);
assert.strictEqual(L.summary(s, C).earned, earnedBefore - L.cardPoints(s, C, mc));

// Negativer Kontostand sperrt den Shop
s = act(s, { type: "undo", logId: s.log.find(e => e.type === "quest" && e.data.questId === "q-cal-1").id });
s = act(s, { type: "undo", logId: s.log.find(e => e.type === "quest" && e.data.questId === "q-cal-2").id });
s = act(s, { type: "undo", logId: s.log.find(e => e.type === "quest" && e.data.questId === "q-cal-3").id });
sm = L.summary(s, C);
assert(sm.balance < 0, "Kontostand sollte negativ sein: " + sm.balance);
assert.throws(() => act(s, { type: "mult", cardId: s.hand[0] }), /gesperrt/);

// Summe der Log-Deltas == verdiente Punkte
assert.strictEqual(s.log.reduce((a, e) => a + e.dE, 0), sm.earned);

// Alle Regionen + alle Karten = 2.000 Basis, mit Stufen 2.400
let g = L.newGame(C, 7, t);
C.regions.forEach(r => r.quests.forEach(q => { g = act(g, { type: "quest", questId: q.id }); }));
while (g.hand.some(Boolean)) g = act(g, { type: "card", cardId: g.hand.find(Boolean) });
sm = L.summary(g, C);
assert.strictEqual(sm.earned, 2400); assert(sm.allExplored); assert(sm.bonusFinished);
assert.strictEqual(sm.rankName, "Inselkönig");

// Belohnungen
assert.strictEqual(L.formatReward(C.rewards[0], 350), "10 Min 30 Sek");
assert.strictEqual(L.formatReward(C.rewards[0], 2000), "60 Min");
assert.strictEqual(L.formatReward(C.rewards[1], 2000), "20 Bilder");

// Reset
g = L.apply(g, C, { type: "reset", seed: 99 }, "X", t);
assert.strictEqual(L.summary(g, C).earned, 0);
console.log("Alle Logik-Tests bestanden ✓");
