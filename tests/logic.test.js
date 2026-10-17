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
  assert.throws(() => act(w, { type: "swap", questId: w.open[1] }), /5 von 5 genutzt/);
  const lastSwap = w.log.filter(e => e.type === "swap" && !e.undone).pop();
  w = act(w, { type: "undo", logId: lastSwap.id });
  assert.strictEqual(L.summary(w, C).swaps, 4);
  w = act(w, { type: "swap", questId: w.open[0] }); // wieder erlaubt
  assert.strictEqual(L.summary(w, C).swaps, 5);
  assert.throws(() => act(w, { type: "swap", questId: w.open[2] }), /5 von 5 genutzt/);
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

// Variables Maximum: 2.400 + (multiplizierter Wert − Grundwert) je Stapel-Quest mit Multiplikator
{
  let v = L.newGame(C, 31, t);
  assert.strictEqual(L.maxPoints(v, C), 2400);
  assert.strictEqual(L.summary(v, C).maxDelta, 0);
  C.regions.forEach(r => { v = act(v, { type: "quest", questId: r.quests[0].id }); }); // Punkte für den Shop
  v.rolls = [1.5, 0.5, 5]; // feste Würfe für den Test
  const a = v.open[0], b = v.open[1], c = v.open[2];
  const exp = (id, f) => Math.ceil(L.stackBase(C, id) * f - 1e-9) - L.stackBase(C, id);
  v = act(v, { type: "mult", questId: a });
  assert.strictEqual(L.maxPoints(v, C), 2400 + exp(a, 1.5));
  v = act(v, { type: "mult", questId: b });
  assert.strictEqual(L.maxPoints(v, C), 2400 + exp(a, 1.5) + exp(b, 0.5)); // ×0,5 senkt das Maximum
  // erledigte Stapel-Quest mit Multiplikator zählt weiter mit ihrem multiplizierten Wert
  v = act(v, { type: "stack", questId: a });
  assert.strictEqual(L.maxPoints(v, C), 2400 + exp(a, 1.5) + exp(b, 0.5));
  // Rückgängig des Multiplikator-Kaufs -> sofort neu berechnet
  v = act(v, { type: "undo", logId: v.log.find(e => e.type === "mult" && e.data.questId === b).id });
  assert.strictEqual(L.maxPoints(v, C), 2400 + exp(a, 1.5));
  v = act(v, { type: "mult", questId: c }); // Jackpot: Slot 2 frei? Slot 1 wieder frei -> Faktor 0,5
  assert.strictEqual(v.mults[c].factor, 0.5);
  assert.strictEqual(L.summary(v, C).maxPoints, 2400 + exp(a, 1.5) + exp(c, 0.5));
  // Teamrang-Balken: goldene Etappe läuft bis zum aktuellen Maximum
  assert.strictEqual(L.rankProgress(1500, 2430).text, "noch 930 Punkte bis zum Maximum");
  assert.strictEqual(L.rankProgress(2430, 2430).text, "Maximum erreicht!");
  assert.strictEqual(L.rankProgress(2350, 2340).text, "Maximum erreicht!".replace("erreicht!", "übertroffen (+10 Punkte)"));
}

// Belohnungen
assert.strictEqual(L.formatReward(C.rewards[0], 350), "10 Min 30 Sek");
assert.strictEqual(L.formatReward(C.rewards[0], 2000), "60 Min");
assert.strictEqual(L.formatReward(C.rewards[1], 2000), "20 Bilder");

// Reset
g = L.apply(g, C, { type: "reset", seed: 99 }, "X", t);
assert.strictEqual(L.summary(g, C).earned, 0);

// ---------------------------------------------------------------- Werkzeuge (Tools)
const T = require("../public/tools.js");
const IXT = L.index(C);
Object.keys(T.TOOLS).forEach((id) => assert(IXT.quests[id] || IXT.stack[id], "Tool für unbekannte Quest " + id));
const tu = (id, ts, op, now) => T.update(T.config(id, C), ts, op, now, "Tester");
const tf = (id, ts, op, now) => assert.throws(() => tu(id, ts, op, now), T.ToolError);
// Countdown
let ts = tu("q-cal-2", null, { type: "start" }, 1000);
tf("q-cal-2", ts, { type: "start" }, 5000);
ts = tu("q-cal-2", ts, { type: "start" }, 11001);
assert.strictEqual(ts.startedAt, 11001);
assert.strictEqual(tu("q-cal-2", ts, { type: "cancel" }, 12000).startedAt, null);
assert.strictEqual(T.config("q-rbr-1").seconds, 30);
// Seilbahn: Schätzung festschreiben, Stoppuhr, höchstens 15 s daneben
ts = tu("q-rbr-2", null, { type: "fix", value: "100" }, 0);
tf("q-rbr-2", ts, { type: "fix", value: 50 }, 0);
tf("q-rbr-2", ts, { type: "newRound" }, 0);
ts = tu("q-rbr-2", ts, { type: "start" }, 1000);
assert.strictEqual(T.result(T.config("q-rbr-2"), ts, 5000), null);
ts = tu("q-rbr-2", ts, { type: "stop" }, 1000 + 115000);
assert.deepStrictEqual(T.result(T.config("q-rbr-2"), ts, 0), { ok: true, measured: 115, diff: 15 });
ts.stoppedAt = 1000 + 116000;
assert.strictEqual(T.result(T.config("q-rbr-2"), ts, 0).ok, false);
assert.strictEqual(tu("q-rbr-2", ts, { type: "newRound" }, 0).guess, null);
// Verkehr: 1 Minute zählen, höchstens 1 Auto daneben
tf("q-svi-2", null, { type: "start" }, 0);
ts = tu("q-svi-2", null, { type: "fix", value: 5 }, 0);
tf("q-svi-2", ts, { type: "inc", d: 1 }, 0);
ts = tu("q-svi-2", ts, { type: "start" }, 0);
for (let i = 0; i < 7; i++) ts = tu("q-svi-2", ts, { type: "inc", d: 1 }, 1000 * i);
ts = tu("q-svi-2", ts, { type: "inc", d: -1 }, 59000);
assert.strictEqual(ts.count, 6);
assert.strictEqual(T.result(T.config("q-svi-2"), ts, 59999), null);
assert.deepStrictEqual(T.result(T.config("q-svi-2"), ts, 60000), { ok: true, count: 6, diff: 1 });
tf("q-svi-2", ts, { type: "inc", d: 1 }, 62000);
ts.count = 7;
assert.strictEqual(T.result(T.config("q-svi-2"), ts, 60000).ok, false);
// Höhe: fest 589 m aus content.js, höchstens 10 % daneben, sonst sofort 5 Minuten Strafzeit
assert.strictEqual(T.config("q-cdl-3", C).answer, 589);
assert.strictEqual(T.config("q-cdl-3").answer, undefined);
ts = tu("q-cdl-3", null, { type: "fix", value: "640" }, 0);
assert.strictEqual(T.result(T.config("q-cdl-3", C), ts, 0).ok, true);
tf("q-cdl-3", ts, { type: "fix", value: "600" }, 0);
assert.strictEqual(tu("q-cdl-3", ts, { type: "newRound" }, 0).guess, null);
assert.strictEqual(T.result(T.config("q-cdl-3", C), tu("q-cdl-3", null, { type: "fix", value: "530,1" }, 0), 0).ok, true);
ts = tu("q-cdl-3", null, { type: "fix", value: "530" }, 1000); // 59 m daneben > 58,9 m
assert.strictEqual(ts.guess, null);
assert.deepStrictEqual(ts.lastMiss, { guess: 530, by: "Tester" });
assert.strictEqual(T.penaltyLeft(ts, 1000 + 4 * 60000), 60000);
tf("q-cdl-3", ts, { type: "fix", value: 589 }, 1000 + 299999);
assert.strictEqual(tu("q-cdl-3", ts, { type: "fix", value: 589 }, 1000 + 300000).guess, 589);
// Strafzeit per Knopf „Daneben“ (für selbst beurteilte Versuche) – nur wo es eine gibt
assert.strictEqual(tu("q-cdl-3", null, { type: "penalty" }, 0).penaltyUntil, 300000);
tf("q-rbr-2", null, { type: "penalty" }, 0);
// Links: Flughafen-Ankünfte und UNESCO-Kriterien
assert.strictEqual(T.links("q-san-3")[0].url, "https://whc.unesco.org/en/criteria/");
assert.strictEqual(T.links("q-scr-1")[0].url, "https://www.madeiraairport.pt/en/fnc/arrivals");
assert(!IXT.quests["q-san-3"].task.includes("whc.unesco"));
assert(IXT.quests["q-scr-2"].task.includes("höchstens 50°"));
// Kompass: 208° ± 50°, eine von zwei Messungen reicht, beide daneben → sofort Strafzeit
assert.strictEqual(T.angleDiff(350, 10), 20);
assert.strictEqual(T.angleDiff(208, 28), 180);
ts = tu("q-scr-2", null, { type: "measure", deg: 150 }, 0);
assert.strictEqual(T.result(T.config("q-scr-2"), ts, 0), null);
ts = tu("q-scr-2", ts, { type: "measure", deg: 258.4 }, 0);
assert.strictEqual(T.result(T.config("q-scr-2"), ts, 0).ok, true);
tf("q-scr-2", ts, { type: "measure", deg: 200 }, 0);
ts = tu("q-scr-2", tu("q-scr-2", null, { type: "measure", deg: 100 }, 0), { type: "measure", deg: 259 }, 5000);
assert.strictEqual(T.result(T.config("q-scr-2"), ts, 5000), null);
assert.strictEqual(ts.penaltyUntil, 5000 + 300000);
assert.deepStrictEqual(ts.lastMiss.measures.map((m) => m.deg), [100, 259]);
assert.deepStrictEqual(ts.measures, []);
tf("q-scr-2", ts, { type: "measure", deg: 208 }, 6000);
// Tic-Tac-Toe: Sieg, Unentschieden, Rückgängig
tf("q-rbr-3", null, { type: "move", cell: 0 }, 0);
tf("q-rbr-3", null, { type: "players", x: "Anna", o: "anna" }, 0);
ts = tu("q-rbr-3", null, { type: "players", x: "Anna", o: "Ben" }, 0);
[0, 3, 1, 4].forEach((c) => { ts = tu("q-rbr-3", ts, { type: "move", cell: c }, 0); });
tf("q-rbr-3", ts, { type: "move", cell: 4 }, 0);
tf("q-rbr-3", ts, { type: "newRound" }, 0);
ts = tu("q-rbr-3", ts, { type: "move", cell: 2 }, 0);
assert.deepStrictEqual(T.tttStatus(ts.moves).line, [0, 1, 2]);
assert.strictEqual(T.result(T.config("q-rbr-3"), ts, 0).winner, "X");
tf("q-rbr-3", ts, { type: "move", cell: 8 }, 0);
ts = tu("q-rbr-3", ts, { type: "undoMove" }, 0);
assert.strictEqual(T.tttStatus(ts.moves).winner, null);
const draw = [0, 1, 2, 4, 3, 5, 7, 6, 8];
assert.strictEqual(T.tttStatus(draw).draw, true);
assert.strictEqual(T.tttStatus(draw).winner, null);
ts = tu("q-rbr-3", Object.assign(ts, { moves: draw }), { type: "newRound" }, 0);
assert.deepStrictEqual([ts.moves, ts.round, ts.players], [[], 2, ["Anna", "Ben"]]);
// ---- Geheime Eingaben
const tb = (id, ts, op, by, now) => T.update(T.config(id), ts, op, now || 0, by);
const tbf = (id, ts, op, by) => assert.throws(() => tb(id, ts, op, by), T.ToolError);
assert.strictEqual(T.norm("  Möwe "), T.norm("moewe"));
assert.strictEqual(T.norm("Straße"), T.norm("STRASSE"));
assert.strictEqual(T.norm("Café"), T.norm("cafe"));
assert.strictEqual(T.norm("Fußball"), T.norm("FUSSBALL"));
assert.deepStrictEqual(T.unhide(T.hide(["Möwe", "Ä"])), ["Möwe", "Ä"]);
// Was Churchill sah: 5 Begriffe, 6 Tipps, 3 erraten – jeder Schritt auf jedem Handy (keine Rollen)
const CH = T.config("q-cdl-2");
assert.strictEqual(T.phase(CH, null), 1);
tbf("q-cdl-2", null, { type: "fix", terms: ["Meer", "Boote", "Klippen", "Sonne"] }, "Anna");
tbf("q-cdl-2", null, { type: "fix", terms: ["Meer", "Boote", "Klippen", "Sonne", " meer "] }, "Anna");
tbf("q-cdl-2", null, { type: "tip", d: 1 }, "Anna"); // erst Phase 2
ts = tb("q-cdl-2", null, { type: "fix", terms: ["Meer", "Boote", "Klippen", "Sonne", "Kirche"] }, "Anna");
assert(!JSON.stringify(ts).includes("Klippen"), "Begriffe verschleiert");
assert.strictEqual(T.phase(CH, ts), 2);
tbf("q-cdl-2", ts, { type: "fix", terms: ["a", "b", "c", "d", "e"] }, "Ben");
ts = tb("q-cdl-2", ts, { type: "mark", i: 0 }, "Anna");  // auch auf dem eingebenden Handy
ts = tb("q-cdl-2", ts, { type: "mark", i: 0 }, "Ben");
for (let i = 0; i < 6; i++) ts = tb("q-cdl-2", ts, { type: "tip", d: 1 }, i % 2 ? "Anna" : "Ben");
tbf("q-cdl-2", ts, { type: "tip", d: 1 }, "Ben");
ts = tb("q-cdl-2", ts, { type: "tip", d: -1 }, "Anna");
ts = tb("q-cdl-2", ts, { type: "tip", d: 1 }, "Anna");
ts = tb("q-cdl-2", ts, { type: "mark", i: 1 }, "Ben");
ts = tb("q-cdl-2", ts, { type: "mark", i: 3 }, "Anna");
assert.deepStrictEqual(T.result(CH, ts, 0), { ok: false, guessed: 2 });
assert.strictEqual(T.phase(CH, ts), 2); // „Daneben“, aber der letzte Tipp darf noch als erraten markiert werden
assert.strictEqual(T.result(CH, tb("q-cdl-2", ts, { type: "mark", i: 4 }, "Anna"), 0).ok, true);
const chOk = tb("q-cdl-2", tb("q-cdl-2", tb("q-cdl-2", null, { type: "fix", terms: ["a", "b", "c", "d", "e"] }, "Ben"), { type: "mark", i: 0 }, "Ben"), { type: "mark", i: 1 }, "Ben");
assert.strictEqual(T.phase(CH, chOk), 2);
assert.strictEqual(T.phase(CH, tb("q-cdl-2", chOk, { type: "mark", i: 2 }, "Anna")), 3);
const rev = tb("q-cdl-2", chOk, { type: "reveal" }, "Ben");
assert.deepStrictEqual([rev.revealed, T.phase(CH, rev)], [true, 3]);
tbf("q-cdl-2", null, { type: "reveal" }, "Ben");
ts = tb("q-cdl-2", ts, { type: "newRound" }, "Ben");
assert.deepStrictEqual([ts.secret, ts.tips, ts.round, T.phase(CH, ts)], [null, 0, 2, 1]);
assert.throws(() => tb("q-cdl-2", ts, { type: "fix", terms: ["Möwen", "BOOTE", "Wolken", "Wind", "Hafen"] }, "Anna"), /BOOTE/);
ts = tb("q-cdl-2", ts, { type: "fix", terms: ["Möwen", "Wellen", "Wolken", "Wind", "Hafen"] }, "Anna");
assert.strictEqual(T.phase(CH, tb("q-cdl-2", null, { type: "newRound" }, "Anna")), 1); // Neue Runde geht auch in Phase 1
// Alte Zustände (früheres Format mit „setter“, ohne fv) werden verworfen → Phase 1
const oldCh = { setter: "Anna", secret: T.hide(["a", "b", "c", "d", "e"]), guessed: [false, false, false, false, false], tips: 2 };
assert.strictEqual(T.phase(CH, oldCh), 1);
assert.strictEqual(T.result(CH, oldCh, 0), null);
assert.strictEqual(tb("q-cdl-2", oldCh, { type: "fix", terms: ["1", "2", "3", "4", "5"] }, "Ben").tips, 0);
// Zufall: Fisher-Yates mit unverzerrtem randomInt – alle 6 Reihenfolgen gleich oft (auch die richtige)
const cr = require("crypto");
const rand32 = () => cr.randomBytes(4).readUInt32BE(0);
const counts = {};
for (let i = 0; i < 60000; i++) { const k = T.shuffle(["A", "B", "C"], rand32).join(""); counts[k] = (counts[k] || 0) + 1; }
assert.strictEqual(Object.keys(counts).length, 6);
Object.values(counts).forEach((c) => assert(Math.abs(c - 10000) < 600, "ungleichmäßig: " + JSON.stringify(counts)));
const seq = [4294967295, 7]; // 4294967295 liegt oberhalb der Grenze und wird verworfen (nicht per Modulo verzerrt)
assert.strictEqual(T.randomInt(3, () => seq.shift()), 1);
assert.strictEqual(seq.length, 0);
// Früchteschweiger: Rangfolge, zufällige Startreihenfolge, gemeinsames Sortieren – jeder darf alles
const FR = T.config("q-fun-3");
ts = tb("q-fun-3", null, { type: "setFruits", fruits: ["Mango", "Maracuja", "Banane"] }, "Carla");
assert.strictEqual(T.phase(FR, ts), 1);
ts = tb("q-fun-3", tb("q-fun-3", ts, { type: "editFruits" }, "Ben"), { type: "setFruits", fruits: ["Mango", "Maracuja", "Banane"] }, "Ben");
tbf("q-fun-3", ts, { type: "fix", order: ["Mango", "Banane"], start: ["Mango", "Maracuja", "Banane"] }, "Carla");
tbf("q-fun-3", ts, { type: "fix", order: ["Maracuja", "Mango", "Banane"], start: ["Mango", "Mango", "Banane"] }, "Carla");
tbf("q-fun-3", ts, { type: "arrange", order: ["Mango", "Banane", "Maracuja"] }, "Carla"); // erst Phase 2
ts = tb("q-fun-3", ts, { type: "fix", order: ["Maracuja", "Mango", "Banane"], start: ["Banane", "Mango", "Maracuja"] }, "Carla");
assert.deepStrictEqual([ts.guessOrder, T.phase(FR, ts)], [["Banane", "Mango", "Maracuja"], 2]);
tbf("q-fun-3", ts, { type: "editFruits" }, "Ben");
ts = tb("q-fun-3", ts, { type: "arrange", order: ["Mango", "Banane", "Maracuja"] }, "Carla"); // auch das eingebende Handy
ts = tb("q-fun-3", ts, { type: "arrange", order: ["Maracuja", "Banane", "Mango"] }, "Ben");
const wrong = tb("q-fun-3", ts, { type: "guess" }, "Carla");
assert.deepStrictEqual(wrong.guess, ["Maracuja", "Banane", "Mango"]);
assert.deepStrictEqual(T.result(FR, wrong, 0).places, [true, false, false]);
assert.deepStrictEqual([T.result(FR, wrong, 0).ok, T.phase(FR, wrong)], [false, 3]);
tbf("q-fun-3", wrong, { type: "arrange", order: ["Maracuja", "Mango", "Banane"] }, "Ben");
assert.strictEqual(T.result(FR, tb("q-fun-3", ts, { type: "guess", order: ["Maracuja", "Mango", "Banane"] }, "Ben"), 0).ok, true);
assert.strictEqual(T.phase(FR, tb("q-fun-3", ts, { type: "reveal" }, "Anna")), 3);
ts = tb("q-fun-3", wrong, { type: "newRound" }, "Ben");
assert.deepStrictEqual([ts.guessOrder, ts.fruits, T.phase(FR, ts)], [null, null, 1]);
tbf("q-fun-3", ts, { type: "setFruits", fruits: ["Papaya", "Anone", "banane"] }, "Carla");
// Buchstaben-Fotos (Baumstaben): Fotos + Buchstaben, Vergleich Buchstabe für Buchstabe – jeder darf alles
const PW = T.config("q-pmz-3");
assert.deepStrictEqual(["a", "ä", "ß", "Ü", "AB", "1", ""].map(T.letter), ["A", "Ä", "ß", "Ü", null, null, null]);
const pid = (n) => "p" + String(n).padStart(24, "0");
tbf("q-pmz-3", null, { type: "addPhoto", photo: "../hack", letter: "L" }, "Ben");
ts = null;
"LOBRER".split("").forEach((l, i) => { ts = tb("q-pmz-3", ts, { type: "addPhoto", photo: pid(i), letter: i === 5 ? "" : l }, i % 2 ? "Anna" : "Ben"); });
assert(!JSON.stringify(ts).includes('"LOBRE'), "Buchstaben verschleiert");
assert.strictEqual(T.phase(PW, ts), 1);
tbf("q-pmz-3", ts, { type: "fix" }, "Ben"); // ein Buchstabe fehlt
tbf("q-pmz-3", ts, { type: "setLetter", i: 5, letter: "RR" }, "Ben");
ts = tb("q-pmz-3", ts, { type: "setLetter", i: 5, letter: "e" }, "Anna");
ts = tb("q-pmz-3", ts, { type: "movePhoto", i: 2, d: 1 }, "Ben");          // LOBRER → LORBER … (Foto 2 ↔ 3)
ts = tb("q-pmz-3", ts, { type: "removePhoto", i: 5 }, "Ben");               // → LORBE
ts = tb("q-pmz-3", ts, { type: "addPhoto", photo: pid(9), letter: "r" }, "Ben"); // → LORBER
assert.deepStrictEqual(T.unhide(ts.draftLetters), ["L", "O", "R", "B", "E", "R"]);
const keys = ts.draft.map((d) => d.key);
assert.strictEqual(new Set(keys).size, 6);
const arr = tb("q-pmz-3", ts, { type: "arrange", order: [keys[5]].concat(keys.slice(0, 5)) }, "Anna");
assert.deepStrictEqual([arr.draft.map((d) => d.photo)[0], T.unhide(arr.draftLetters).join("")], [pid(9), "RLORBE"]);
tbf("q-pmz-3", ts, { type: "arrange", order: [keys[0], keys[1]] }, "Anna");
tbf("q-pmz-3", ts, { type: "arrange", order: [keys[0], keys[0], keys[1], keys[2], keys[3], keys[4]] }, "Anna");
// Dasselbe Foto mehrfach: Duplizieren fügt eine Kopie direkt darunter ein (eigenes Buchstabenfeld, gleiche Server-Datei)
const dup = tb("q-pmz-3", ts, { type: "duplicate", i: 2, key: "kcopy1" }, "Anna");
assert.deepStrictEqual([dup.draft.length, dup.draft[3].photo, dup.draft[3].key, T.unhide(dup.draftLetters).join("|")], [7, dup.draft[2].photo, "kcopy1", "L|O|R||B|E|R"]);
tbf("q-pmz-3", dup, { type: "duplicate", i: 0, key: "kcopy1" }, "Anna"); // Schlüssel schon vergeben
const dup2 = tb("q-pmz-3", tb("q-pmz-3", dup, { type: "setLetter", i: 3, letter: "R" }, "Anna"), { type: "removePhoto", i: 2 }, "Anna");
assert.deepStrictEqual([dup2.draft.length, dup2.draft[2].key, dup2.draft[2].photo, T.unhide(dup2.draftLetters).join("")], [6, "kcopy1", dup.draft[2].photo, "LORBER"]);
// zweimal dieselbe Datei hochgeladen (zwei Server-IDs) oder dieselbe ID zweimal: beides erlaubt
const same = tb("q-pmz-3", tb("q-pmz-3", null, { type: "addPhoto", photo: pid(1), key: "ka1" }, "A"), { type: "addPhoto", photo: pid(1), key: "ka2" }, "A");
assert.deepStrictEqual(same.draft.map((d) => d.photo), [pid(1), pid(1)]);
// an einer bestimmten Stelle einfügen (Foto, das beim ersten Mal nicht gelesen werden konnte), ungültige Stelle = hinten
const atp = tb("q-pmz-3", ts, { type: "addPhoto", photo: pid(20), letter: "x", at: 2 }, "Ben");
assert.deepStrictEqual([atp.draft[2].photo, T.unhide(atp.draftLetters).join("")], [pid(20), "LOXRBER"]);
assert.strictEqual(tb("q-pmz-3", ts, { type: "addPhoto", photo: pid(21), at: 99 }, "Ben").draft[6].photo, pid(21));
// alter Entwurf ohne Schlüssel bekommt automatisch welche
assert.strictEqual(new Set(T.draftEntries([{ photo: pid(1) }, { photo: pid(2) }]).map((d) => d.key)).size, 2);
ts = tb("q-pmz-3", ts, { type: "fix" }, "Ben");
assert.deepStrictEqual([ts.letters, ts.photos.length, ts.draft, T.phase(PW, ts)], [6, 6, null, 2]);
assert.deepStrictEqual(ts.photos, [pid(0), pid(1), pid(3), pid(2), pid(4), pid(9)]);
tbf("q-pmz-3", ts, { type: "addPhoto", photo: pid(30), letter: "X" }, "Ben");
tbf("q-pmz-3", ts, { type: "guess", letters: ["L", "O"] }, "Anna");
const fail1 = tb("q-pmz-3", ts, { type: "guess", letters: "lorbar".split("") }, "Ben"); // auch das eingebende Handy darf raten
assert.deepStrictEqual(fail1.attempts[0].marks, [true, true, true, true, false, true]);
// Fehlversuch beendet die Runde: „Daneben“ (Phase 3, Wort aufgedeckt), kein zweites Festschreiben – nur Neue Runde oder „Trotzdem richtig“
assert.deepStrictEqual([T.result(PW, fail1, 0), T.phase(PW, fail1), fail1.failed, fail1.photos.length], [null, 3, true, 6]);
tbf("q-pmz-3", fail1, { type: "guess", letters: "LORBER".split("") }, "Anna");
tbf("q-pmz-3", ts, { type: "accept" }, "Anna"); // ohne Fehlversuch nichts zu akzeptieren
const acc = tb("q-pmz-3", fail1, { type: "accept" }, "Anna");
assert.deepStrictEqual([T.result(PW, acc, 0).ok, acc.photos, T.phase(PW, acc)], [true, [], 3]);
tbf("q-pmz-3", acc, { type: "accept" }, "Anna");
const hit = tb("q-pmz-3", ts, { type: "guess", letters: "LORBER".split("") }, "Carla");
assert.deepStrictEqual([T.result(PW, hit, 0).ok, hit.photos, T.phase(PW, hit)], [true, [], 3]);
const rv = tb("q-pmz-3", ts, { type: "reveal" }, "Anna");
assert.deepStrictEqual([T.phase(PW, rv), rv.photos.length], [3, 6]);
assert.strictEqual(T.phase(PW, tb("q-pmz-3", fail1, { type: "newRound" }, "Anna")), 1);
ts = tb("q-pmz-3", rv, { type: "newRound" }, "Anna");
assert.deepStrictEqual([ts.photos, ts.secret, T.phase(PW, ts)], [null, null, 1]);
"lorber".split("").forEach((l, i) => { ts = tb("q-pmz-3", ts, { type: "addPhoto", photo: pid(20 + i), letter: l }, "Ben"); });
assert.throws(() => tb("q-pmz-3", ts, { type: "fix" }, "Ben"), /früheren Runde/);
ts = tb("q-pmz-3", ts, { type: "newRound" }, "Ben"); // Neue Runde auch mitten in Phase 1
assert.deepStrictEqual([ts.draft, T.phase(PW, ts)], [null, 1]);
// Alter Baumstaben-Zustand (eingetipptes Wort, ohne Fotos) wird verworfen: Phase 1, Neue Runde stürzt nicht ab
const oldPw = { setter: "Ben", secret: T.hide("Lorbeer"), letters: 7, guesses: [], round: 1 };
assert.strictEqual(T.phase(PW, oldPw), 1);
assert.strictEqual(T.phase(PW, tb("q-pmz-3", oldPw, { type: "newRound" }, "Anna")), 1);
assert.strictEqual(tb("q-pmz-3", oldPw, { type: "addPhoto", photo: pid(1), letter: "a" }, "Anna").draft.length, 1);
// Lorbeeren: genau 2 Kriterien, (ix)+(x), daneben → 10 Minuten Strafzeit, Einzelbewertung nur der gewählten
assert.strictEqual(T.UNESCO_CRITERIA.length, 10);
tbf("q-san-3", null, { type: "fix", picks: ["ix"] }, "Ben");
ts = tb("q-san-3", null, { type: "fix", picks: ["x", "ii"] }, "Ben", 1000);
assert.strictEqual(ts.penaltyUntil, 1000 + 600000);
assert.deepStrictEqual(ts.lastMiss, { picks: ["x", "ii"], marks: [true, false] });
assert.strictEqual(T.result(T.config("q-san-3"), ts, 2000), null);
assert(!JSON.stringify(ts).includes('"ix"'), "nicht gewählte Lösung bleibt geheim");
tbf("q-san-3", ts, { type: "fix", picks: ["ix", "x"] }, "Ben");
ts = T.update(T.config("q-san-3"), ts, { type: "fix", picks: ["x", "ix"] }, 1000 + 600000, "Ben");
assert.deepStrictEqual([T.result(T.config("q-san-3"), ts, 0).ok, ts.marks], [true, [true, true]]);

// Tools liegen im Spielstand, Aktionen behalten sie, Reset löscht sie
g = L.newGame(C, 7, t);
g.tools = { "q-cal-2": { startedAt: 1 } };
g = act(g, { type: "quest", questId: "q-fun-1" });
assert.deepStrictEqual(g.tools, { "q-cal-2": { startedAt: 1 } });
assert.strictEqual(L.summary(g, C).earned, 100);
assert.strictEqual(L.apply(g, C, { type: "reset", seed: 1 }, "X", t).tools, undefined);

// ---- Foto-Rätsel (Bananenversteck, Türen, Steinadler): Fotos → geheim festlegen → raten → Ergebnis; Geheimnis nur verschleiert
{
  const pp = (n) => "p" + String(n).padStart(24, "0");
  const plain = (ts) => JSON.stringify(ts);
  // Bananenversteck: 1 Foto (ein neues ersetzt das alte), geheimes Feld 0–15
  const BG = T.config("q-pds-3");
  let g = tb("q-pds-3", null, { type: "addPhoto", photo: pp(1), key: "ka1" }, "Anna");
  g = tb("q-pds-3", g, { type: "addPhoto", photo: pp(2), key: "ka2" }, "Anna");
  assert.deepStrictEqual(g.draft.map((d) => d.photo), [pp(2)]);
  tbf("q-pds-3", g, { type: "fix", cell: 16 }, "Anna");
  tbf("q-pds-3", null, { type: "fix", cell: 3 }, "Anna"); // ohne Foto
  g = tb("q-pds-3", g, { type: "fix", cell: 6 }, "Anna");
  assert.deepStrictEqual([T.phase(BG, g), g.photos, g.draft], [2, [pp(2)], null]);
  assert(!/"secret":6|"cell"/.test(plain(g)), "Feld nur verschleiert");
  tbf("q-pds-3", g, { type: "addPhoto", photo: pp(3) }, "Ben");
  tbf("q-pds-3", g, { type: "accept" }, "Ben");      // noch nicht geraten
  const hit = tb("q-pds-3", g, { type: "guess", cell: 6 }, "Ben");   // auch das Handy, das versteckt hat, darf raten
  assert.deepStrictEqual([T.phase(BG, hit), T.result(BG, hit, 0).found, T.result(BG, hit, 0).ok], [3, true, false]);
  tbf("q-pds-3", hit, { type: "accept" }, "Ben");    // richtig getippt: nichts zu akzeptieren
  const miss = tb("q-pds-3", g, { type: "guess", cell: 5 }, "Ben");
  assert.deepStrictEqual([T.result(BG, miss, 0).ok, T.result(BG, miss, 0).cell], [true, 6]);  // nicht gefunden = Quest geschafft
  const acc = tb("q-pds-3", miss, { type: "accept" }, "Carla");    // „Trotzdem richtig“
  assert.deepStrictEqual([T.result(BG, acc, 0).found, T.result(BG, acc, 0).ok], [true, false]);
  tbf("q-pds-3", miss, { type: "guess", cell: 2 }, "Ben"); // nur ein Tipp
  const nr = tb("q-pds-3", acc, { type: "newRound" }, "Ben");
  assert.deepStrictEqual([T.phase(BG, nr), nr.photos, nr.draft, nr.secret], [1, null, null, null]); // Fotos weg → Server löscht sie
  // Steinadler: 3 Fotos, einer ist der Adler, Reihenfolge gemischt
  const SA = T.config("q-mac-3");
  let a = null;
  [1, 2, 3].forEach((n) => { a = tb("q-mac-3", a, { type: "addPhoto", photo: pp(n), key: "ks" + n }, "Anna"); });
  tbf("q-mac-3", a, { type: "addPhoto", photo: pp(4) }, "Anna"); // höchstens 3
  tbf("q-mac-3", a, { type: "fix", pick: "ks2", order: ["ks1", "ks2"] }, "Anna");
  tbf("q-mac-3", a, { type: "fix", pick: "kxx", order: ["ks3", "ks1", "ks2"] }, "Anna");
  const fewer = tb("q-mac-3", a, { type: "removePhoto", i: 0 }, "Anna");
  tbf("q-mac-3", fewer, { type: "fix", pick: "ks2", order: ["ks2", "ks3"] }, "Anna"); // nur 2 Fotos
  a = tb("q-mac-3", a, { type: "fix", pick: "ks2", order: ["ks3", "ks1", "ks2"] }, "Anna");
  assert.deepStrictEqual([a.photos, T.phase(SA, a)], [[pp(3), pp(1), pp(2)], 2]);
  assert(!plain(a).includes('"pick"') && T.unhide(a.secret) === 2);
  const aOk = tb("q-mac-3", a, { type: "guess", i: 2 }, "Ben"), aNo = tb("q-mac-3", a, { type: "guess", i: 0 }, "Ben");
  assert.deepStrictEqual([T.result(SA, aOk, 0).ok, T.result(SA, aNo, 0).ok, T.result(SA, aNo, 0).answer], [true, false, 2]);
  tbf("q-mac-3", aNo, { type: "accept" }, "Ben"); // „Trotzdem richtig“ nur beim Bananenversteck
  // Türen: 3 Fotos, jedem ein anderer Name; Namen werden gemeinsam (synchron) den gemischten Fotos zugeordnet
  const TU = T.config("q-fun-1");
  let d = null;
  [1, 2, 3].forEach((n) => { d = tb("q-fun-1", d, { type: "addPhoto", photo: pp(n), key: "kt" + n }, "Anna"); });
  tbf("q-fun-1", d, { type: "fix", names: { kt1: "Anna", kt2: "anna", kt3: "Ben" }, order: ["kt1", "kt2", "kt3"], start: ["Anna", "anna", "Ben"] }, "Anna");
  tbf("q-fun-1", d, { type: "fix", names: { kt1: "Anna", kt2: "Ben" }, order: ["kt1", "kt2", "kt3"], start: ["Anna", "Ben", "Carla"] }, "Anna");
  tbf("q-fun-1", d, { type: "fix", names: { kt1: "Anna", kt2: "Ben", kt3: "Carla" }, order: ["kt1", "kt2", "kt3"], start: ["Anna", "Ben", "Dora"] }, "Anna");
  d = tb("q-fun-1", d, { type: "fix", names: { kt1: "Anna", kt2: "Ben", kt3: "Carla" }, order: ["kt2", "kt3", "kt1"], start: ["Carla", "Anna", "Ben"] }, "Anna");
  assert.deepStrictEqual([d.photos, d.guessOrder, T.phase(TU, d)], [[pp(2), pp(3), pp(1)], ["Carla", "Anna", "Ben"], 2]);
  assert.deepStrictEqual(T.unhide(d.secret), ["Ben", "Carla", "Anna"]);
  assert(!/"names"|kt1":"Anna/.test(plain(d)), "Zuordnung nur verschleiert");
  d = tb("q-fun-1", d, { type: "arrange", order: ["Ben", "Anna", "Carla"] }, "Carla"); // gemeinsames Ziehen
  tbf("q-fun-1", d, { type: "arrange", order: ["Ben", "Ben", "Carla"] }, "Carla");
  const dg = tb("q-fun-1", d, { type: "guess" }, "Ben");
  assert.deepStrictEqual([T.phase(TU, dg), T.result(TU, dg, 0).places, T.result(TU, dg, 0).ok], [3, [true, false, false], false]);
  const dOk = tb("q-fun-1", tb("q-fun-1", d, { type: "arrange", order: ["Ben", "Carla", "Anna"] }, "A"), { type: "guess" }, "A");
  assert.strictEqual(T.result(TU, dOk, 0).ok, true);
  assert.strictEqual(tb("q-fun-1", dg, { type: "newRound" }, "Ben").photos, null);
  // Alle drei gelten als geheime Hilfsmittel (Phasen, Rollen frei) und schreiben nichts in die Aktivitäten
  assert(["q-pds-3", "q-fun-1", "q-mac-3"].every((id) => T.isSecret(T.config(id)) && T.isPhotoPuzzle(T.config(id))));
}
// ---- Bucht gesucht: Bucht auslosen (ohne Wiederholung, bis alle dran waren) → zeichnen → raten
{
  const BG = T.config("q-mac-2"), fsx = require("fs"), vm = require("vm");
  const sandbox = { window: {} }; vm.runInNewContext(fsx.readFileSync(__dirname + "/../public/bay-map.js", "utf8"), sandbox);
  const MAP = sandbox.window.BAY_MAP;
  assert.strictEqual(JSON.stringify(MAP.bays.map((b) => b.id)), JSON.stringify(BG.bays), "Buchten in bay-map.js und tools.js gleich");
  assert(MAP.bays.length >= 8 && MAP.bays.length <= 12 && MAP.land.length > 10);
  // Nummern im Wasser vor der Bucht: nicht auf/an Küste oder Inseln, Linie zur Buchtmitte kreuzt keine Küste, keine Überlappung
  {
    const segs = [];
    MAP.land.forEach((d) => { const q = d.slice(1, -1).split(" ").map((t) => t.split(",").map(Number)); q.forEach((p, i) => segs.push([q[(i || q.length) - 1], p])); });
    const dist = (p, [a, b]) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]); };
    const cross = (p, q, [a, b]) => { const c = (o, u, v) => (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]); return c(a, b, p) * c(a, b, q) < 0 && c(p, q, a) * c(p, q, b) < 0; };
    const r = MAP.r, [vx, vy, vw, vh] = MAP.view;
    MAP.bays.forEach((b, i) => {
      const L = [b.x, b.y], T = [b.tx, b.ty];
      assert(Math.min(...segs.map((sg) => dist(L, sg))) > r + 20, "Nummer " + b.n + " berührt keine Küste");
      assert(!segs.some((sg) => cross(L, T, sg)), "Linie " + b.n + " kreuzt keine Küste");
      assert(b.n <= 6 ? b.y < b.ty : b.y > b.ty, "Nummer " + b.n + " auf der richtigen Seite (Nord/Süd)");
      assert(b.x - r >= vx && b.x + r <= vx + vw && b.y - r >= vy && b.y + r <= vy + vh, "Nummer " + b.n + " im Kartenausschnitt");
      MAP.bays.forEach((c, j) => { if (j > i) assert(Math.hypot(b.x - c.x, b.y - c.y) > 2 * r + 30 && !cross(L, T, [[c.x, c.y], [c.tx, c.ty]]), "Nummern " + b.n + "/" + c.n + " überlappen nicht"); });
      assert(!b.name || (b.nx !== undefined && ["start", "end", "middle"].includes(b.na)));
    });
  }
  // Ausschnitte: gedreht (nur Drehung), Öffnung waagrecht oben, die ganze Buchtküste darunter und im Ausschnitt
  for (const bay of MAP.bays) {
    const pts = bay.poly.slice(1).split(" ").map((q) => q.split(",").map(Number)), t = bay.rot * Math.PI / 180;
    const R = ([x, y]) => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
    const rp = pts.map(R), a = rp[0], z = rp[rp.length - 1], [bx, by, bw, bh] = bay.box;
    assert(pts.length > 5 && bay.d > 0 && !("view" in bay), "Bucht " + bay.n);
    assert(Math.abs(a[1] - bay.top) < 1 && Math.abs(z[1] - bay.top) < 1, "Öffnung oben, Bucht " + bay.n);
    assert(rp.every((p) => p[1] >= bay.top - 1 && p[0] >= bx && p[0] <= bx + bw && p[1] <= by + bh), "Küste unter der Öffnung, Bucht " + bay.n);
    const my = rp.reduce((s, p) => s + p[1], 0) / rp.length;
    assert(my > bay.top + 1, "Land unten, Bucht " + bay.n);
    assert(bay.isl.every((k) => k >= 0 && k < MAP.land.length));
  }
  const draw = { strokes: [{ t: "p", c: "#1f2933", w: 2, p: [10, 10, 200, 300, 400, 120] }, { t: "e", c: "#ffffff", w: 3, p: [50, 50, 60, 60] }] };
  assert.strictEqual(T.phase(BG, null), 1);
  tbf("q-mac-2", null, { type: "start", bay: "b99" }, "Anna");
  let b = tb("q-mac-2", null, { type: "start", bay: "b4" }, "Anna");
  assert(!JSON.stringify(b).includes('"b4"'), "Bucht nur verschleiert");
  assert.strictEqual(T.phase(BG, b), 1);
  tbf("q-mac-2", b, { type: "start", bay: "b5" }, "Anna");          // schon ausgelost
  tbf("q-mac-2", b, { type: "fix", drawing: { strokes: [] } }, "Anna");
  tbf("q-mac-2", b, { type: "fix", drawing: { strokes: [{ t: "x", c: "#000000", w: 2, p: [1, 2] }] } }, "Anna");
  tbf("q-mac-2", b, { type: "guess", bay: "b4" }, "Ben");            // noch nichts gezeichnet
  b = tb("q-mac-2", b, { type: "fix", drawing: draw }, "Anna");
  assert.deepStrictEqual([T.phase(BG, b), b.drawing.strokes.length, b.drawing.strokes[0].p], [2, 2, [10, 10, 200, 300, 400, 120]]);
  tbf("q-mac-2", b, { type: "guess", bay: "zz" }, "Ben");
  const wrong = tb("q-mac-2", b, { type: "guess", bay: "b2" }, "Ben"), right = tb("q-mac-2", b, { type: "guess", bay: "b4" }, "Carla");
  assert.deepStrictEqual([T.phase(BG, wrong), T.result(BG, wrong, 0).ok, T.result(BG, wrong, 0).bay, T.result(BG, right, 0).ok], [3, false, "b4", true]);
  tbf("q-mac-2", right, { type: "accept" }, "Ben");
  assert.strictEqual(T.result(BG, tb("q-mac-2", wrong, { type: "accept" }, "Ben"), 0).ok, true); // „Trotzdem richtig“
  const nr = tb("q-mac-2", wrong, { type: "newRound" }, "Ben");
  assert.deepStrictEqual([T.phase(BG, nr), nr.drawing, nr.secret, nr.guess], [1, null, null, null]);  // Zeichnung gelöscht
  assert(T.bayChoices(BG, nr).indexOf("b4") < 0 && T.bayChoices(BG, nr).length === 8);              // b4 erst wieder, wenn alle dran waren
  tbf("q-mac-2", nr, { type: "start", bay: "b4" }, "Ben");
  // alle durchspielen: danach wieder alle außer der zuletzt gezeichneten
  let all = nr;
  for (const id of BG.bays.filter((x) => x !== "b4")) {
    all = tb("q-mac-2", all, { type: "start", bay: id }, "A");
    all = tb("q-mac-2", all, { type: "newRound" }, "A");
  }
  const last = BG.bays.filter((x) => x !== "b4").pop();
  assert.deepStrictEqual(T.bayChoices(BG, all), BG.bays.filter((x) => x !== last));
}
// ---- Stapel-Quests: Zähler, Timer, Regionen-Liste, Höhe (Ziele wie im Quest-Text)
{
  const IXS = L.index(C).stack;
  const want = { "s-e07": [10, 0], "s-e05": [3, 0], "s-s03": [3, 60], "s-m08": [5, 60], "s-s06": [10, 0], "s-s04": [5, 0], "s-e10": [0, 5], "s-m03": [0, 30] };
  Object.keys(want).forEach((id) => {
    const c = T.config(id, C);
    assert(IXS[id] && c, "Hilfsmittel für " + id);
    assert.strictEqual(c.target || 0, want[id][0], id + " Ziel");
    assert.strictEqual(c.minutes || 0, want[id][1], id + " Minuten");
  });
  assert(T.config("s-m02", C).kind === "altitude" && T.config("s-s05", C).kind === "altitude" && !T.hasState(T.config("s-m02", C)));
  assert.throws(() => tu("s-m02", null, { type: "inc" }, 0), T.ToolError);           // Höhe speichert nichts
  // Zähler
  let c = tu("s-e07", null, { type: "inc" }, 0);
  for (let i = 0; i < 9; i++) c = tu("s-e07", c, { type: "inc" }, 0);
  assert.strictEqual(c.count, 10);
  assert.strictEqual(T.result(T.config("s-e07"), c, 0).ok, true);
  c = tu("s-e07", c, { type: "dec" }, 0);
  assert.strictEqual(T.result(T.config("s-e07"), c, 0), null);
  tf("s-e07", { count: 0 }, { type: "dec" }, 0);
  // Timer: rechnet mit der Startzeit, Pause/Weiter, Zurücksetzen, Ende
  const TC = T.config("s-e10");
  let tm = tu("s-e10", null, { type: "tStart" }, 1000);
  assert.strictEqual(T.timerLeft(TC, tm, 61000), 240000);                           // 1 min gelaufen
  tf("s-e10", tm, { type: "tStart" }, 2000);
  tm = tu("s-e10", tm, { type: "tPause" }, 61000);
  assert.strictEqual(T.timerLeft(TC, tm, 999999), 240000);                          // pausiert: bleibt stehen
  tm = tu("s-e10", tm, { type: "tStart" }, 100000);
  assert.strictEqual(T.timerEnd(TC, tm), 340000);
  assert(T.timerRunning(TC, tm, 339999) && !T.timerRunning(TC, tm, 340000));
  assert.strictEqual(T.result(TC, tm, 340000).ok, true);
  tf("s-e10", tm, { type: "tStart" }, 400000);                                      // abgelaufen: erst zurücksetzen
  tm = tu("s-e10", tm, { type: "tReset" }, 400000);
  assert.strictEqual(T.timerLeft(TC, tm, 500000), 300000);
  // Zähler + Timer (Wine-Tasting)
  let w = tu("s-s03", null, { type: "tStart" }, 0);
  w = tu("s-s03", w, { type: "inc" }, 10);
  assert(w.count === 1 && T.timerRunning(T.config("s-s03"), w, 3599999) && !T.timerRunning(T.config("s-s03"), w, 3600000));
  // Regionen-Liste
  let rg = tu("s-s04", null, { type: "toggle", region: "funchal" }, 0);
  ["machico", "santana", "calheta", "funchal"].forEach((r) => { rg = tu("s-s04", rg, { type: "toggle", region: r }, 0); });
  assert.deepStrictEqual(rg.regions, ["machico", "santana", "calheta"]);
  tf("s-s04", rg, { type: "toggle", region: "<b>" }, 0);
  // Abhaken / Tauschen setzen zurück, Rückgängig holt den Stand zurück, Reset löscht alles
  let gs = L.newGame(C, 5, t);
  const sid = gs.open[0];
  gs.tools = { [sid]: { count: 4 }, "q-cal-2": { startedAt: 1 } };
  gs = L.apply(gs, C, { type: "stack", questId: sid }, "A", t);
  assert(!gs.tools[sid] && gs.tools["q-cal-2"], "Abhaken setzt nur das Hilfsmittel dieser Stapel-Quest zurück");
  gs = L.apply(gs, C, { type: "undo", logId: gs.log[gs.log.length - 1].id }, "A", t);
  assert.deepStrictEqual(gs.tools[sid], { count: 4 });
  const sid2 = gs.open.find((x) => x && x !== sid);
  gs.tools[sid2] = { count: 2 };
  gs = L.apply(gs, C, { type: "quest", questId: C.regions[0].quests[0].id }, "A", t);   // Punkte für den Tausch
  gs = L.apply(gs, C, { type: "swap", questId: sid2 }, "A", t);
  assert(!gs.tools[sid2], "Tauschen setzt zurück");
  gs = L.apply(gs, C, { type: "undo", logId: gs.log.filter((e) => e.type === "swap").pop().id }, "A", t);
  assert.deepStrictEqual(gs.tools[sid2], { count: 2 });
  assert(!L.apply(gs, C, { type: "reset", seed: 3 }, "A", t).tools, "Reset löscht alle Hilfsmittel");
  // Wo bin ich? Region aus den Gemeindegrenzen, Höhe über dem Meeresspiegel
  const MW = {}; require("vm").runInNewContext(require("fs").readFileSync(__dirname + "/../public/map-data.js", "utf8"), { window: MW });
  const MAPD = MW.MADEIRA_MAP;
  C.regions.forEach((r) => assert(MAPD.regions[r.name], "Grenzen für " + r.name));
  assert.strictEqual(T.regionAt(MAPD, -50, -50), null);                                 // Meer / außerhalb
  // ein Punkt in jeder Region (Mitte eines Dreiecks am Rand) wird dieser Region zugeordnet
  C.regions.forEach((r) => {
    const ring = T.pathRings(MAPD.regions[r.name][0])[0];
    let found = null;
    for (let i = 0; i < ring.length && !found; i += 3) {
      const [ax, ay] = ring[i], [bx, by] = ring[(i + ring.length / 3 | 0) % ring.length], [cx, cy] = ring[(i + 2 * ring.length / 3 | 0) % ring.length];
      const x = (ax + bx + cx) / 3, y = (ay + by + cy) / 3;
      if (T.regionAt(MAPD, x, y) === r.name) found = [x, y];
    }
    assert(found, "Punkt in " + r.name);
  });
  assert.deepStrictEqual([T.seaLevelAltitude(1048.4, false), T.seaLevelAltitude(1000, true), T.seaLevelAltitude(null, false)], [1000, 1000, null]);
}
console.log("Alle Logik-Tests bestanden ✓");
