// ============================================================================
//  Operação Madeira - Das Spiel – Hilfsmittel (Tools) für einzelne regionale Quests
//  Reine Logik ohne Oberfläche: Konfiguration, Zustandsänderungen, Auswertung.
//  Der Zustand liegt im Spielstand unter state.tools[questId] und wird wie der
//  Spielstand über den Server geteilt. Tools geben keine Punkte und haken nie ab.
// ============================================================================
(function (root) {
  "use strict";

  const ARRIVALS_URL = "https://www.madeiraairport.pt/en/fnc/arrivals";
  const UNESCO_URL = "https://whc.unesco.org/en/criteria/";

  // Welche Quest welches Hilfsmittel bekommt. label + icon = antippbare Zeile im Quest-Fenster.
  // penalty = Strafzeit in Minuten; sie startet automatisch, sobald ein Versuch daneben ist.
  const TOOLS = {
    "q-cal-2": { kind: "countdown", seconds: 10, label: "Countdown: 10 Sekunden", icon: "timer" },   // Light Show
    "q-san-2": { kind: "countdown", seconds: 10, label: "Countdown: 10 Sekunden", icon: "timer" },   // Dreieck auf Dreieck
    "q-rbr-1": { kind: "countdown", seconds: 30, label: "Countdown: 30 Sekunden", icon: "timer" },   // Werdet brava an der Ribeira Brava!
    "q-svi-3": { kind: "countdown", seconds: 30, label: "Countdown: 30 Sekunden", icon: "timer" },   // Treibgutkreuz
    "q-rbr-2": { kind: "cablecar", tolerance: 15, label: "Fahrzeit schätzen und stoppen", icon: "timer" }, // Seilbahn-Sekunden-Sakrileg
    "q-svi-2": { kind: "traffic", seconds: 60, tolerance: 1, label: "Autos zählen", icon: "car" },     // Höllen- oder wenig Verkehr
    // Die echte Höhe steht in content.js bei der Quest (height) und wird erst bei „Geschafft!“ gezeigt.
    "q-cdl-3": { kind: "height", tolerancePct: 10, penalty: 5, label: "Höhe schätzen", icon: "mountain" }, // Angsthase oder Augenmaß?
    "q-scr-2": { kind: "compass", target: 208, tolerance: 50, penalty: 5, label: "Kompass: Wo liegt Rio?", icon: "navigation" }, // Grüße nach Rio
    "q-rbr-3": { kind: "tictactoe", label: "Tic-Tac-Toe-Spielfeld", icon: "grid-3x3" },               // Tic-Tac-São-Bento
    "q-scr-1": { kind: "link", url: ARRIVALS_URL, label: "Aktuelle Ankünfte am Flughafen Madeira", icon: "plane-landing" }, // Halb gelandet
    "q-san-3": { kind: "link", url: UNESCO_URL, label: "Die zehn UNESCO-Kriterien", icon: "landmark" } // Mit Lorbeeren und UNESCO gekrönt
  };

  class ToolError extends Error {}
  const fail = (msg) => { throw new ToolError(msg); };

  // Konfiguration einer Quest; mit content kommen Werte aus content.js dazu (z. B. die echte Höhe)
  function config(questId, content) {
    const base = TOOLS[questId];
    if (!base || !content) return base || null;
    let quest = null;
    content.regions.forEach((r) => r.quests.forEach((q) => { if (q.id === questId) quest = q; }));
    return quest && quest.height != null ? Object.assign({}, base, { answer: quest.height }) : base;
  }
  function hasState(cfg) { return cfg && cfg.kind !== "link"; }

  // ---------------------------------------------------------------- Auswertung
  function penaltyLeft(ts, now) {
    return ts && ts.penaltyUntil && ts.penaltyUntil > now ? ts.penaltyUntil - now : 0;
  }
  // kleinster Winkel zwischen zwei Richtungen (0–180°)
  function angleDiff(a, b) {
    const d = Math.abs(((a - b) % 360 + 360) % 360);
    return Math.min(d, 360 - d);
  }
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  function tttBoard(moves) {
    const b = Array(9).fill(null);
    (moves || []).forEach((c, i) => { b[c] = i % 2 === 0 ? "X" : "O"; });
    return b;
  }
  // { winner: "X"|"O"|null, line: [..]|null, draw: bool, turn: "X"|"O" }
  function tttStatus(moves) {
    const b = tttBoard(moves);
    for (const l of LINES) {
      if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { winner: b[l[0]], line: l, draw: false, turn: null, board: b };
    }
    const n = (moves || []).length;
    return { winner: null, line: null, draw: n === 9, turn: n === 9 ? null : (n % 2 === 0 ? "X" : "O"), board: b };
  }

  // Ergebnis einer Runde: null (noch offen) oder { ok, ... }
  function result(cfg, ts, now) {
    ts = ts || {};
    switch (cfg.kind) {
      case "cablecar": {
        if (ts.guess == null || ts.startedAt == null || ts.stoppedAt == null) return null;
        const measured = Math.round((ts.stoppedAt - ts.startedAt) / 1000);
        const diff = Math.abs(measured - ts.guess);
        return { ok: diff <= cfg.tolerance, measured, diff };
      }
      case "traffic": {
        if (ts.guess == null || ts.startedAt == null || now < ts.startedAt + cfg.seconds * 1000) return null;
        const diff = Math.abs((ts.count || 0) - ts.guess);
        return { ok: diff <= cfg.tolerance, count: ts.count || 0, diff };
      }
      case "height":
        // Ein Fehlversuch landet gleich in lastMiss (mit Strafzeit) – hier steht nur ein Treffer
        return ts.guess != null ? { ok: true } : null;
      case "compass":
        return (ts.measures || []).some((m) => compassHit(cfg, m.deg)) ? { ok: true } : null;
      case "tictactoe": {
        const st = tttStatus(ts.moves);
        return st.winner ? { ok: true, winner: st.winner } : null;
      }
      default:
        return null;
    }
  }
  function compassHit(cfg, deg) { return angleDiff(deg, cfg.target) <= cfg.tolerance; }
  function heightHit(cfg, guess) { return Math.abs(guess - cfg.answer) <= cfg.answer * cfg.tolerancePct / 100 + 1e-9; }

  // ---------------------------------------------------------------- Zustandsänderungen
  const num = (v, what) => {
    const n = Number(String(v).replace(",", "."));
    if (!isFinite(n) || n < 0 || n > 100000) fail("Bitte eine gültige Zahl für " + what + " eingeben.");
    return Math.round(n * 10) / 10;
  };
  const round0 = { guess: null, answer: null, startedAt: null, stoppedAt: null, count: 0, measures: [] };

  // Liefert den neuen Zustand eines Tools; wirft ToolError, wenn es gerade nicht geht.
  function update(cfg, oldTs, op, now, by) {
    if (!hasState(cfg)) fail("Dieses Hilfsmittel speichert nichts.");
    const ts = JSON.parse(JSON.stringify(oldTs || {}));
    const locked = penaltyLeft(ts, now) > 0;
    if (locked) fail("Die Strafzeit läuft noch – danach geht es weiter.");

    // Strafzeit: startet automatisch bei einem Fehlversuch (oder per Knopf „Daneben“, wenn
    // Spieler selbst urteilen). Danach beginnt eine neue Runde, die alte verfällt.
    const startPenalty = (miss) => Object.assign(ts, round0, { penaltyUntil: now + cfg.penalty * 60000, penaltyBy: by, lastMiss: miss || null });
    if (op.type === "penalty") {
      if (!cfg.penalty) fail("Hier gibt es keine Strafzeit.");
      return startPenalty(null);
    }
    if (op.type === "newRound") {
      if (cfg.kind === "tictactoe") {
        const st = tttStatus(ts.moves);
        if (!st.draw && !st.winner && (ts.moves || []).length) fail("Die Runde läuft noch.");
        return Object.assign(ts, { moves: [], round: (ts.round || 1) + 1 });
      }
      // Festgeschriebenes bleibt bis zur Auflösung
      const begun = ts.guess != null || (ts.measures || []).length > 0;
      if (begun && !result(cfg, ts, now)) fail("Erst auflösen – eine festgeschriebene Schätzung bleibt bis dahin stehen.");
      return Object.assign(ts, round0);
    }

    switch (cfg.kind) {
      case "countdown":
        if (op.type === "start") {
          if (ts.startedAt != null && now < ts.startedAt + cfg.seconds * 1000) fail("Der Countdown läuft schon.");
          return Object.assign(ts, { startedAt: now, by });
        }
        if (op.type === "restart") return Object.assign(ts, { startedAt: now, by });
        if (op.type === "cancel") return Object.assign(ts, { startedAt: null });
        break;

      case "cablecar":
      case "traffic":
      case "height":
        if (op.type === "fix") {
          if (ts.guess != null) fail("Die Schätzung ist schon festgeschrieben.");
          const v = num(op.value, "die Schätzung");
          if (cfg.kind === "height") {
            if (cfg.answer == null) fail("Die Höhe fehlt in content.js.");
            // sofort auswerten: Treffer bleibt stehen, daneben → Strafzeit
            if (!heightHit(cfg, v)) return startPenalty({ guess: v, by });
            return Object.assign(ts, { guess: v, guessBy: by, lastMiss: null });
          }
          return Object.assign(ts, { guess: Math.round(v), guessBy: by });
        }
        if (ts.guess == null) fail("Erst die Schätzung festschreiben.");
        if (cfg.kind !== "height" && op.type === "start") {
          if (ts.startedAt != null) fail("Läuft schon.");
          return Object.assign(ts, { startedAt: now, stoppedAt: null, count: 0 });
        }
        if (cfg.kind === "cablecar" && op.type === "stop") {
          if (ts.startedAt == null || ts.stoppedAt != null) fail("Die Stoppuhr läuft nicht.");
          return Object.assign(ts, { stoppedAt: now });
        }
        if (cfg.kind === "traffic" && op.type === "inc") {
          if (ts.startedAt == null) fail("Erst die Minute starten.");
          // kleine Kulanz für Antippen in der letzten Sekunde
          if (now > ts.startedAt + cfg.seconds * 1000 + 1500) fail("Die Minute ist vorbei.");
          return Object.assign(ts, { count: Math.max(0, (ts.count || 0) + (op.d < 0 ? -1 : 1)) });
        }
        break;

      case "compass":
        if (op.type === "measure") {
          const ms = ts.measures || [];
          if (ms.length >= 2) fail("Es gibt schon zwei Messungen – für einen neuen Versuch „Neue Runde“.");
          if (result(cfg, ts, now)) fail("Schon geschafft.");
          const deg = ((Math.round(Number(op.deg)) % 360) + 360) % 360;
          if (!isFinite(deg)) fail("Ungültige Richtung.");
          ms.push({ by, deg, manual: !!op.manual, t: now });
          // Eine Runde = die Messungen der beiden zeigenden Personen; beide daneben → Strafzeit
          if (ms.length >= 2 && !ms.some((m) => compassHit(cfg, m.deg))) return startPenalty({ measures: ms });
          return Object.assign(ts, { measures: ms, lastMiss: null });
        }
        break;

      case "tictactoe":
        if (op.type === "players") {
          const x = String(op.x || "").trim(), o = String(op.o || "").trim();
          if (!x || !o) fail("Bitte zwei Spielende auswählen.");
          if (x.toLowerCase() === o.toLowerCase()) fail("Bitte zwei verschiedene Personen auswählen.");
          return Object.assign(ts, { players: [x.slice(0, 24), o.slice(0, 24)], moves: [], round: 1 });
        }
        if (op.type === "newGame") return {};
        if (!ts.players) fail("Erst die beiden Spielenden auswählen.");
        if (op.type === "move") {
          const st = tttStatus(ts.moves);
          if (st.winner || st.draw) fail("Die Runde ist vorbei.");
          const c = Number(op.cell);
          if (!(c >= 0 && c <= 8) || st.board[c]) fail("Dieses Feld ist schon besetzt.");
          ts.moves = (ts.moves || []).concat(c);
          return ts;
        }
        if (op.type === "undoMove") {
          if (!(ts.moves || []).length) fail("Noch kein Zug gemacht.");
          ts.moves = ts.moves.slice(0, -1);
          return ts;
        }
        break;
    }
    fail("Das geht hier nicht.");
  }

  const api = { TOOLS, ARRIVALS_URL, UNESCO_URL, ToolError, config, hasState, update, result, penaltyLeft, angleDiff, compassHit, tttStatus };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.QuestTools = api;
})(typeof window !== "undefined" ? window : globalThis);
