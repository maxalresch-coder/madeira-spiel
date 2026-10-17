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
assert.deepStrictEqual(L.newGame(C, 42, t).open, s.open);
assert.strictEqual(s.open.length, 3);
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

// Stapel-Quest
const c0 = s.open[0];
s = act(s, { type: "stack", questId: c0 });
assert(s.done[c0]); assert.strictEqual(s.open.length, 3); assert.strictEqual(s.deck.length, 22);
const e1 = L.summary(s, C).earned;
assert.strictEqual(e1, 140 + L.stackBase(C, c0));

// Joker
s = act(s, { type: "joker", regionId: "funchal" });
let sm = L.summary(s, C);
assert.strictEqual(sm.levels.funchal, 1); assert.strictEqual(sm.earned, e1); assert.strictEqual(sm.spent, 150);
s = act(s, { type: "quest", questId: "q-fun-1" });
assert.strictEqual(L.summary(s, C).levels.funchal, 2);
assert.strictEqual(L.summary(s, C).earned, e1 + 20);
assert.throws(() => act(s, { type: "joker", regionId: "machico" }));

// Tausch & Rückgängig -> gleiches Ergebnis
const before = JSON.stringify([s.open, s.deck]);
const old = s.open[1];
s = act(s, { type: "swap", questId: old });
const got = s.open[1];
const swapId = s.log[s.log.length - 1].id;
s = act(s, { type: "undo", logId: swapId });
assert.strictEqual(JSON.stringify([s.open, s.deck]), before);
s = act(s, { type: "swap", questId: old });
assert.strictEqual(s.open[1], got);

// Multiplikator: gleicher Faktor nach Rückgängig
s = act(s, { type: "mult", questId: s.open[1] });
const f1 = s.mults[s.open[1]].factor;
assert.strictEqual(f1, s.rolls[0]);
const multLog = s.log[s.log.length - 1].id;
s = act(s, { type: "undo", logId: multLog });
s = act(s, { type: "mult", questId: s.open[2] });
assert.strictEqual(s.mults[s.open[2]].factor, f1);
assert.throws(() => act(s, { type: "swap", questId: s.open[2] }), /Multiplikator/);
assert.throws(() => act(s, { type: "mult", questId: s.open[2] }));

// Stapel-Quest mit Multiplikator erledigen: aufgerundet
const mc = s.open[2];
s = act(s, { type: "stack", questId: mc });
assert.strictEqual(L.stackPoints(s, C, mc), Math.ceil(L.stackBase(C, mc) * f1 - 1e-9));
assert.throws(() => act(s, { type: "undo", logId: s.log.find(e => e.type === "mult" && !e.undone).id }), /zuerst/);

// Rückgängig Stapel-Quest: zurück oben auf den Stapel, Punkte weg
const stackLog = s.log[s.log.length - 1];
const earnedBefore = L.summary(s, C).earned;
s = act(s, { type: "undo", logId: stackLog.id });
assert.strictEqual(s.deck[0], mc);
assert.strictEqual(L.summary(s, C).earned, earnedBefore - L.stackPoints(s, C, mc));

// Negativer Kontostand sperrt den Shop
s = act(s, { type: "undo", logId: s.log.find(e => e.type === "quest" && e.data.questId === "q-cal-1").id });
s = act(s, { type: "undo", logId: s.log.find(e => e.type === "quest" && e.data.questId === "q-cal-2").id });
s = act(s, { type: "undo", logId: s.log.find(e => e.type === "quest" && e.data.questId === "q-cal-3").id });
sm = L.summary(s, C);
assert(sm.balance < 0, "Kontostand sollte negativ sein: " + sm.balance);
assert.throws(() => act(s, { type: "mult", questId: s.open[0] }), /gesperrt/);

// Summe der Log-Deltas == verdiente Punkte
assert.strictEqual(s.log.reduce((a, e) => a + e.dE, 0), sm.earned);

// Alle Regionen + alle Stapel-Quests = 2.000 Basis, mit Stufen 2.400
let g = L.newGame(C, 7, t);
C.regions.forEach(r => r.quests.forEach(q => { g = act(g, { type: "quest", questId: q.id }); }));
while (g.open.some(Boolean)) g = act(g, { type: "stack", questId: g.open.find(Boolean) });
sm = L.summary(g, C);
assert.strictEqual(sm.earned, 2400); assert(sm.allExplored); assert(sm.stackFinished);
assert.strictEqual(sm.rankName, "Inselkönig");

// Inhalte: 30 regionale Quests, 26 Stapel-Quests (10/10/6) = 700 Punkte, Basis 2.000
assert.strictEqual(C.regions.length, 10);
C.regions.forEach(r => assert.strictEqual(r.quests.length, 3));
const count = d => C.stackQuests.filter(q => q.difficulty === d).length;
assert.deepStrictEqual([count("einfach"), count("mittel"), count("schwer")], [10, 10, 6]);
const stackTotal = C.stackQuests.reduce((a, q) => a + L.STACK_POINTS[q.difficulty], 0);
assert.strictEqual(stackTotal, 700);
assert.strictEqual(10 * 100 + L.MADEIRA_BONUS + stackTotal, 2000);
const ids = C.regions.flatMap(r => r.quests.map(q => q.id)).concat(C.stackQuests.map(q => q.id));
assert.strictEqual(new Set(ids).size, 56);
C.regions.forEach(r => r.quests.forEach(q => {
  assert(q.title && q.location && q.desc && q.task.startsWith("Eure Aufgabe: "), q.id);
  assert(Array.isArray(q.pin) && q.pin.length === 2, q.id);
  assert(q.maps === null || (typeof q.maps === "string" && q.maps.length > 3), q.id + ": maps");
  assert(q.mapsUrl === undefined || /^https:\/\/(maps\.app\.goo\.gl|www\.google\.com\/maps)\//.test(q.mapsUrl), q.id + ": mapsUrl");
}));

// Kompatibilität alter Spielstände
assert(L.isCompatible(L.newGame(C, 1, t), C));
assert(!L.isCompatible(Object.assign(L.newGame(C, 1, t), { schema: 1 }), C));

// Meilensteine "Madeira erobert" / "erschlossen": keine Punkte, Logbuch, Rückgängig
{
  let m = L.newGame(C, 3, t);
  const ms = (st, key) => st.log.filter(e => e.type === "milestone" && e.data.milestone === key);
  C.regions.forEach(r => r.quests.slice(0, 2).forEach(q => { m = act(m, { type: "quest", questId: q.id }); }));
  let sm2 = L.summary(m, C);
  assert(sm2.allConquered && !sm2.allDeveloped);
  assert.strictEqual(sm2.earned, 10 * 120 + 300); // keine Extrapunkte
  assert.strictEqual(ms(m, "allConquered").length, 1);
  assert(ms(m, "allConquered")[0].data.reached);
  assert(!L.canUndo(ms(m, "allConquered")[0]));
  // Rückgängig -> nicht mehr erfüllt, erneut erreichen -> wieder erfüllt
  m = act(m, { type: "undo", logId: m.log.find(e => e.type === "quest" && e.data.questId === "q-cal-2").id });
  assert(!L.summary(m, C).allConquered);
  assert.strictEqual(ms(m, "allConquered").length, 2);
  assert(!ms(m, "allConquered")[1].data.reached);
  m = act(m, { type: "quest", questId: "q-cal-2" });
  assert(L.summary(m, C).allConquered);
  assert.strictEqual(ms(m, "allConquered").length, 3);
  C.regions.forEach(r => { m = act(m, { type: "quest", questId: r.quests[2].id }); });
  sm2 = L.summary(m, C);
  assert(sm2.allDeveloped);
  assert.strictEqual(sm2.earned, 10 * 140 + 300); // keine Extrapunkte
  assert.strictEqual(ms(m, "allDeveloped").length, 1);
  assert.strictEqual(m.log.reduce((a, e) => a + e.dE, 0), sm2.earned);
}

// Tausch-Limit: höchstens 5 Tausch-Joker, rückgängig gemachte zählen nicht
{
  let w = L.newGame(C, 11, t);
  C.regions.forEach(r => { w = act(w, { type: "quest", questId: r.quests[0].id }); }); // genug Punkte
  for (let i = 0; i < 5; i++) w = act(w, { type: "swap", questId: w.open[0] });
  assert.strictEqual(L.summary(w, C).swaps, 5);
  assert.throws(() => act(w, { type: "swap", questId: w.open[1] }), /5-mal/);
  const lastSwap = w.log.filter(e => e.type === "swap" && !e.undone).pop();
  w = act(w, { type: "undo", logId: lastSwap.id });
  assert.strictEqual(L.summary(w, C).swaps, 4);
  w = act(w, { type: "swap", questId: w.open[0] }); // wieder erlaubt
  assert.strictEqual(L.summary(w, C).swaps, 5);
  assert.throws(() => act(w, { type: "swap", questId: w.open[2] }), /5-mal/);
  assert.strictEqual(L.summary(w, C).spent, 50);
}

// Fortschrittsbalken in Etappen (Farben exakt wie die Stufen auf der Inselkarte)
{
  let g2 = L.newGame(C, 21, t);
  let rp = L.regionProgress(L.summary(g2, C), C);
  assert.deepStrictEqual([rp.stage, rp.pct, rp.text, rp.color], [1, 0, "0 von 10 Regionen erkundet", L.LEVELS[1].color]);
  C.regions.forEach(r => { g2 = act(g2, { type: "quest", questId: r.quests[0].id }); });
  g2 = act(g2, { type: "quest", questId: "q-cal-2" });
  rp = L.regionProgress(L.summary(g2, C), C);
  assert.deepStrictEqual([rp.stage, rp.value, rp.color, rp.done], [2, 1, L.LEVELS[2].color, [true, false, false]]);
  assert.strictEqual(rp.text, "1 von 10 Regionen erobert");
  // Rückgängig unter die Grenze -> zurück in Etappe 1
  g2 = act(g2, { type: "undo", logId: g2.log.find(e => e.type === "quest" && e.data.questId === "q-pmz-1").id });
  rp = L.regionProgress(L.summary(g2, C), C);
  assert.deepStrictEqual([rp.stage, rp.value, rp.color, rp.done[0]], [1, 9, L.LEVELS[1].color, false]);
  // alles erschlossen -> voll gold
  C.regions.forEach(r => r.quests.forEach(q => { if (!g2.quests[q.id]) g2 = act(g2, { type: "quest", questId: q.id }); }));
  rp = L.regionProgress(L.summary(g2, C), C);
  assert.deepStrictEqual([rp.stage, rp.pct, rp.color, rp.done], [3, 100, L.LEVELS[3].color, [true, true, true]]);

  let k = L.rankProgress(0);
  assert.deepStrictEqual([k.stage, k.pct, k.text, k.color], [1, 0, "noch 700 Punkte bis Abenteurer", L.LEVELS[1].color]);
  assert.deepStrictEqual(k.ranks.map(x => x.reached), [true, false, false]);
  k = L.rankProgress(700);
  assert.deepStrictEqual([k.stage, k.pct, k.text, k.color], [2, 0, "noch 800 Punkte bis Inselkönig", L.LEVELS[2].color]);
  assert.deepStrictEqual(k.ranks.map(x => x.reached), [true, true, false]);
  k = L.rankProgress(1950);
  assert.deepStrictEqual([k.stage, k.pct, k.text, k.color], [3, 50, "noch 450 Punkte bis zum Maximum", L.LEVELS[3].color]);
  k = L.rankProgress(699);
  assert.strictEqual(k.stage, 1);
  assert.deepStrictEqual([L.rankProgress(2400).pct, L.rankProgress(2400).text], [100, "Maximum erreicht!"]);
  assert.deepStrictEqual([L.rankProgress(2510).pct, L.rankProgress(2510).text], [100, "Maximum übertroffen (+110 Punkte)"]);
}

// Belohnungen
assert.strictEqual(L.formatReward(C.rewards[0], 350), "10 Min 30 Sek");
assert.strictEqual(L.formatReward(C.rewards[0], 2000), "60 Min");
assert.strictEqual(L.formatReward(C.rewards[1], 2000), "20 Bilder");

// Reset
g = L.apply(g, C, { type: "reset", seed: 99 }, "X", t);
assert.strictEqual(L.summary(g, C).earned, 0);
console.log("Alle Logik-Tests bestanden ✓");
