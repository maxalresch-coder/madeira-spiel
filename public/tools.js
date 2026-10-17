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
  // fv = Format-Version des gespeicherten Zustands: erhöhen, wenn sich das Format ändert – alte Zustände werden dann verworfen.
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
    // Geheime Eingaben (eine gewählte Person gibt etwas ein, das für die anderen verdeckt bleibt)
    "q-cdl-2": { kind: "secretTerms", fv: 2, count: 5, need: 3, maxTips: 6, label: "Fünf geheime Begriffe", icon: "key-round" }, // Was Churchill sah
    "q-fun-3": { kind: "secretRank", fv: 2, count: 3, label: "Geheime Rangfolge", icon: "list-ordered" },                       // Früchteschweiger
    "q-pmz-3": { kind: "photoWord", fv: 2, minLetters: 5, label: "Buchstaben-Fotos", icon: "camera" },                               // Baumstaben
    // Auswahl: genau 2 der 10 UNESCO-Kriterien; Lösung (ix) + (x) wird bei „Daneben“ nie gezeigt
    "q-san-3": { kind: "choice", pick: 2, solution: ["ix", "x"], penalty: 10, label: "Zwei Kriterien wählen", icon: "list-checks" } // Mit Lorbeeren und UNESCO gekrönt
  };

  // Links als eigene Zeilen im Quest-Fenster (öffnen einen neuen Tab)
  const LINKS = {
    "q-scr-1": [{ url: ARRIVALS_URL, label: "Aktuelle Ankünfte am Flughafen Madeira", icon: "plane-landing" }], // Halb gelandet
    "q-san-3": [{ url: UNESCO_URL, label: "Die zehn UNESCO-Kriterien", icon: "landmark" }]                   // Mit Lorbeeren und UNESCO gekrönt
  };

  // Die zehn Welterbe-Kriterien der UNESCO (Kurzfassung nach whc.unesco.org/en/criteria)
  const UNESCO_CRITERIA = [
    { id: "i", text: "Ein Meisterwerk menschlicher Schöpferkraft." },
    { id: "ii", text: "Zeigt einen bedeutenden Austausch menschlicher Werte über eine Zeitspanne oder in einem Kulturraum – in Architektur, Technik, Monumentalkunst, Städtebau oder Landschaftsgestaltung." },
    { id: "iii", text: "Ein einzigartiges oder zumindest außergewöhnliches Zeugnis einer lebenden oder untergegangenen Kulturtradition oder Zivilisation." },
    { id: "iv", text: "Ein herausragendes Beispiel eines Gebäudetyps, eines architektonischen oder technischen Ensembles oder einer Landschaft, das bedeutende Abschnitte der Menschheitsgeschichte zeigt." },
    { id: "v", text: "Ein herausragendes Beispiel traditioneller Besiedlung oder Land- bzw. Meeresnutzung, typisch für eine Kultur oder das Zusammenspiel von Mensch und Umwelt – besonders wenn es durch unumkehrbaren Wandel gefährdet ist." },
    { id: "vi", text: "Unmittelbar oder greifbar verbunden mit Ereignissen, lebendigen Traditionen, Ideen, Glaubensvorstellungen oder künstlerischen und literarischen Werken von herausragender universeller Bedeutung (möglichst nur zusammen mit anderen Kriterien)." },
    { id: "vii", text: "Enthält überragende Naturerscheinungen oder Gebiete von außergewöhnlicher Naturschönheit und ästhetischer Bedeutung." },
    { id: "viii", text: "Ein herausragendes Beispiel für die großen Abschnitte der Erdgeschichte – mit Spuren des Lebens, laufenden geologischen Prozessen der Landschaftsformung oder bedeutenden geomorphologischen Merkmalen." },
    { id: "ix", text: "Ein herausragendes Beispiel laufender ökologischer und biologischer Prozesse in der Entwicklung von Ökosystemen an Land, im Süßwasser, an Küsten und im Meer sowie von Pflanzen- und Tiergemeinschaften." },
    { id: "x", text: "Enthält die wichtigsten natürlichen Lebensräume für den Erhalt der biologischen Vielfalt vor Ort – auch mit bedrohten Arten von herausragendem universellem Wert für Wissenschaft oder Naturschutz." }
  ];

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
  function hasState(cfg) { return !!cfg; }
  function links(questId) { return LINKS[questId] || []; }

  // ---------------------------------------------------------------- Geheime Eingaben
  // Vergleich von Wörtern: Groß-/Kleinschreibung, Leerzeichen am Rand und Akzente egal; ä=ae, ö=oe, ü=ue, ß=ss
  function norm(s) {
    return String(s == null ? "" : s).trim().toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  }
  const letterCount = (s) => (String(s).match(/\p{L}/gu) || []).length;
  const sameName = (a, b) => norm(a) === norm(b) && norm(a) !== "";
  // Geheimes wird leicht verschleiert gespeichert, damit es nicht zufällig in einer Sicherungsdatei
  // auffällt (Vertrauensbasis – kein echter Schutz).
  function hide(v) { return "h:" + btoa(unescape(encodeURIComponent(JSON.stringify(v)))); }
  function unhide(h) {
    if (typeof h !== "string" || h.indexOf("h:") !== 0) return null;
    try { return JSON.parse(decodeURIComponent(escape(atob(h.slice(2))))); } catch (e) { return null; }
  }
  const usedList = (ts) => unhide(ts.used) || [];
  const isSecret = (cfg) => cfg.kind === "secretTerms" || cfg.kind === "secretRank" || cfg.kind === "photoWord";

  // ---------------------------------------------------------------- Zufall
  // Regel: Jede mögliche Anordnung muss gleich wahrscheinlich sein (auch die richtige Lösung).
  // randomInt zieht ohne Verzerrung (Verwerfen statt Modulo), shuffle ist Fisher-Yates.
  // rand32 liefert eine Zufallszahl 0 … 2^32−1 (im Browser aus crypto.getRandomValues).
  function randomInt(n, rand32) {
    const limit = Math.floor(4294967296 / n) * n;
    let x;
    do { x = rand32(); } while (x >= limit);
    return x % n;
  }
  function shuffle(arr, rand32) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randomInt(i + 1, rand32);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------------------------------------------------------------- Buchstaben (Buchstaben-Fotos)
  // Genau ein Buchstabe A–Z, Ä, Ö, Ü oder ß; gespeichert in Großbuchstaben (ß bleibt ß)
  function letter(v) {
    const t = String(v == null ? "" : v).trim();
    if (!/^[a-zäöüß]$/i.test(t)) return null;
    return t === "ß" || t === "ẞ" ? "ß" : t.toUpperCase();
  }
  const sameLetter = (a, b) => letter(a) != null && letter(a) === letter(b);

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
    ts = sanitize(cfg, ts) || {};
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
      case "secretTerms": {
        if (!ts.secret) return null;
        const n = (ts.guessed || []).filter(Boolean).length;
        if (n >= cfg.need) return { ok: true, guessed: n };
        return (ts.tips || 0) >= cfg.maxTips ? { ok: false, guessed: n } : null;
      }
      case "secretRank": {
        if (!ts.secret || !ts.guess) return null;
        const order = unhide(ts.secret) || [];
        const places = order.map((f, i) => ts.guess[i] === f);
        return { ok: places.every(Boolean), places, order };
      }
      case "photoWord":
        return ts.secret && ts.solved ? { ok: true } : null;
      case "choice":
        return ts.ok ? { ok: true } : null;
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
  const round0 = { guess: null, answer: null, startedAt: null, stoppedAt: null, count: 0, measures: [], picks: null, ok: false };

  // Geheime Eingaben – Rollen hängen nie an einem Handy: Jeder Schritt geht auf jedem Handy, der Ablauf richtet
  // sich nur nach der Phase (1 geheim eingeben → 2 raten → 3 Ergebnis), siehe phase().
  function updateSecret(cfg, ts, op, now, by) {
    const fresh = (words) => { // keine Begriffe aus früheren Runden
      const used = usedList(ts);
      const again = words.filter((w) => used.indexOf(norm(w)) >= 0);
      if (again.length) fail("Schon in einer früheren Runde verwendet: " + again.join(", ") + ". Bitte etwas Neues.");
    };
    const distinct = (words) => { if (new Set(words.map(norm)).size !== words.length) fail("Bitte keine doppelten Einträge."); };
    const round0s = {
      secret: null, fruits: null, guess: null, guessed: null, tips: 0, revealed: false, guessOrder: null,
      photos: null, draft: null, draftLetters: null, attempts: [], solved: false, accepted: false, letters: null
    };
    const ph = phase(cfg, ts);

    switch (op.type) {
      case "reveal":
        if (ph !== 2) fail("Auflösen geht nur beim Raten.");
        return Object.assign(ts, { revealed: true });
      case "newRound": { // in jeder Phase: zurück zu Phase 1 (Begriffe der alten Runde sind danach gesperrt)
        const used = usedList(ts);
        const add = (w) => { const k = norm(w); if (k && used.indexOf(k) < 0) used.push(k); };
        if (ts.secret) {
          if (cfg.kind === "secretTerms") (unhide(ts.secret) || []).forEach(add);
          if (cfg.kind === "photoWord") add((unhide(ts.secret) || []).join(""));
          if (cfg.kind === "secretRank") (ts.fruits || []).forEach(add);
        }
        return Object.assign(ts, round0s, { used: hide(used), round: (ts.round || 1) + 1 });
      }
    }

    if (cfg.kind === "secretTerms") {
      if (op.type === "fix") {
        if (ph !== 1) fail("Die Begriffe sind schon festgeschrieben.");
        const terms = (op.terms || []).map((t) => String(t || "").trim().slice(0, 60));
        if (terms.length !== cfg.count || terms.some((t) => !t)) fail("Bitte alle " + cfg.count + " Begriffe eintragen.");
        distinct(terms); fresh(terms);
        return Object.assign(ts, round0s, { secret: hide(terms), guessed: terms.map(() => false), tips: 0, by });
      }
      if (ph !== 2) fail("Gerade wird nicht geraten.");
      if (op.type === "tip") {
        const n = (ts.tips || 0) + (op.d < 0 ? -1 : 1);
        if (n < 0) fail("Noch kein Tipp gezählt.");
        if (n > cfg.maxTips) fail("Alle " + cfg.maxTips + " Tipps sind verbraucht.");
        return Object.assign(ts, { tips: n });
      }
      if (op.type === "mark") {
        const i = Number(op.i);
        if (!(i >= 0 && i < cfg.count)) fail("Unbekannter Begriff.");
        ts.guessed = (ts.guessed || []).slice();
        ts.guessed[i] = !ts.guessed[i];
        return ts;
      }
    }

    if (cfg.kind === "secretRank") {
      if (op.type === "setFruits") {
        if (ph !== 1) fail("Die Rangfolge ist schon festgeschrieben.");
        const fruits = (op.fruits || []).map((t) => String(t || "").trim().slice(0, 40));
        if (fruits.length !== cfg.count || fruits.some((t) => !t)) fail("Bitte alle " + cfg.count + " Früchte eintragen.");
        distinct(fruits); fresh(fruits);
        return Object.assign(ts, round0s, { fruits });
      }
      if (op.type === "editFruits") { // zurück zur Eingabe der Früchte (nur vor dem Festschreiben)
        if (ph !== 1) fail("Die Rangfolge ist schon festgeschrieben.");
        return Object.assign(ts, { fruits: null });
      }
      if (op.type === "fix") {
        if (ph !== 1 || !ts.fruits) fail(ts.fruits ? "Schon festgeschrieben." : "Erst die Früchte eintragen.");
        // op.start = zufällige Startreihenfolge für das Raten (gleichmäßig gemischt, siehe shuffle)
        return Object.assign(ts, { secret: hide(checkOrder(ts.fruits, op.order)), guessOrder: checkOrder(ts.fruits, op.start), by });
      }
      if (ph !== 2) fail("Gerade wird nicht geraten.");
      if (op.type === "arrange") return Object.assign(ts, { guessOrder: checkOrder(ts.fruits, op.order) });
      if (op.type === "guess") return Object.assign(ts, { guess: checkOrder(ts.fruits, op.order || ts.guessOrder), guessBy: by });
    }

    if (cfg.kind === "photoWord") {
      // Entwurf: Fotos (offen, damit der Server sie nicht löscht) + Buchstaben (verschleiert)
      const draft = (ts.draft || []).slice(), letters = (unhide(ts.draftLetters) || []).slice();
      const saveDraft = () => Object.assign(ts, { draft, draftLetters: hide(letters) });
      const at = (i) => { i = Number(i); if (!(i >= 0 && i < draft.length)) fail("Unbekanntes Foto."); return i; };
      const inPhase1 = () => { if (ph !== 1) fail("Das Wort ist schon festgeschrieben."); };
      switch (op.type) {
        case "addPhoto":
          inPhase1();
          if (!/^p[0-9a-f]{24}$/.test(String(op.photo))) fail("Ungültiges Foto.");
          if (draft.length >= 20) fail("Höchstens 20 Fotos.");
          draft.push({ photo: op.photo });
          letters.push(letter(op.letter) || "");
          return saveDraft();
        case "setLetter": {
          inPhase1();
          const i = at(op.i), l = op.letter === "" ? "" : letter(op.letter);
          if (l == null) fail("Bitte genau einen Buchstaben (A–Z, Ä, Ö, Ü oder ß).");
          letters[i] = l;
          return saveDraft();
        }
        case "removePhoto": {
          inPhase1();
          const i = at(op.i);
          draft.splice(i, 1); letters.splice(i, 1);
          return saveDraft();
        }
        case "movePhoto": {
          inPhase1();
          const i = at(op.i), j = i + (op.d < 0 ? -1 : 1);
          if (j < 0 || j >= draft.length) fail("Geht nicht weiter.");
          [draft[i], draft[j]] = [draft[j], draft[i]];
          [letters[i], letters[j]] = [letters[j], letters[i]];
          return saveDraft();
        }
        case "fix": {
          inPhase1();
          if (draft.length < cfg.minLetters) fail("Mindestens " + cfg.minLetters + " Fotos – eines pro Buchstabe.");
          if (letters.length !== draft.length || letters.some((l) => !l)) fail("Zu jedem Foto fehlt noch ein Buchstabe.");
          fresh([letters.join("")]);
          return Object.assign(ts, round0s, { photos: draft.map((d) => d.photo), secret: hide(letters), letters: letters.length, by });
        }
      }
      if (ph !== 2) fail("Gerade wird nicht geraten.");
      const word = unhide(ts.secret) || [];
      if (op.type === "guess") {
        const g = (op.letters || []).map(letter);
        if (g.length !== word.length || g.some((l) => !l)) fail("Bitte unter jedes Foto genau einen Buchstaben eintragen.");
        const marks = word.map((l, i) => sameLetter(l, g[i]));
        ts.attempts = (ts.attempts || []).concat({ letters: g, marks, by, t: now });
        // geschafft → Runde beendet, die Fotos werden nicht mehr gebraucht (Server löscht sie)
        if (marks.every(Boolean)) Object.assign(ts, { solved: true, photos: [] });
        return ts;
      }
      if (op.type === "accept") {
        const last = (ts.attempts || [])[(ts.attempts || []).length - 1];
        if (!last) fail("Es gibt noch keinen Versuch, der zählen könnte.");
        return Object.assign(ts, { solved: true, accepted: true, photos: [] });
      }
    }
    fail("Das geht hier nicht.");
  }
  // Phase eines Hilfsmittels mit geheimer Eingabe: 1 geheim eingeben, 2 raten, 3 Ergebnis (gelöst oder aufgelöst).
  // Hängt nur am gemeinsamen Zustand – alle Handys zeigen dieselbe Phase.
  function phase(cfg, ts) {
    ts = sanitize(cfg, ts) || {};
    if (!ts.secret) return 1;
    if (ts.revealed) return 3;
    if (cfg.kind === "secretRank") return ts.guess ? 3 : 2;
    if (cfg.kind === "photoWord") return ts.solved ? 3 : 2;
    // Churchill: auch nach dem 6. Tipp darf noch markiert werden (der letzte Tipp kann richtig gewesen sein)
    if (cfg.kind === "secretTerms") { const r = result(cfg, ts, 0); return r && r.ok ? 3 : 2; }
    return 2;
  }
  // Zustände aus einer älteren Version eines Hilfsmittels (anderes Format, z. B. Baumstaben mit
  // eingetipptem Wort) werden verworfen → das Hilfsmittel startet wieder in Phase 1.
  function sanitize(cfg, ts) {
    if (!ts || !cfg || !cfg.fv) return ts;
    return ts.fv === cfg.fv ? ts : null;
  }
  // Rangfolge prüfen: eine Anordnung genau dieser Früchte
  function checkOrder(fruits, order) {
    const o = (order || []).map(String);
    if (o.length !== fruits.length || fruits.some((f) => o.indexOf(f) < 0)) fail("Bitte alle Früchte in eine Reihenfolge bringen.");
    return o;
  }

  // Liefert den neuen Zustand eines Tools; wirft ToolError, wenn es gerade nicht geht.
  function update(cfg, oldTs, op, now, by) {
    if (!hasState(cfg)) fail("Dieses Hilfsmittel speichert nichts.");
    const ts = JSON.parse(JSON.stringify(sanitize(cfg, oldTs) || {}));
    if (cfg.fv) ts.fv = cfg.fv;
    const locked = penaltyLeft(ts, now) > 0;
    if (locked) fail("Die Strafzeit läuft noch – danach geht es weiter.");

    // Strafzeit: startet automatisch bei einem Fehlversuch (oder per Knopf „Daneben“, wenn
    // Spieler selbst urteilen). Danach beginnt eine neue Runde, die alte verfällt.
    const startPenalty = (miss) => Object.assign(ts, round0, { penaltyUntil: now + cfg.penalty * 60000, penaltyBy: by, lastMiss: miss || null });
    if (op.type === "penalty") {
      if (!cfg.penalty) fail("Hier gibt es keine Strafzeit.");
      return startPenalty(null);
    }
    if (isSecret(cfg)) return updateSecret(cfg, ts, op, now, by);
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

      case "choice":
        if (op.type === "fix") {
          const picks = Array.from(new Set((op.picks || []).map(String)));
          if (picks.length !== cfg.pick || !picks.every((p) => UNESCO_CRITERIA.some((c) => c.id === p))) fail("Bitte genau " + cfg.pick + " Kriterien auswählen.");
          // jedes gewählte Kriterium einzeln bewerten; nicht gewählte werden nie verraten
          const marks = picks.map((id) => cfg.solution.indexOf(id) >= 0);
          if (!marks.every(Boolean)) return startPenalty({ picks, marks });
          return Object.assign(ts, { picks, marks, ok: true, by, lastMiss: null });
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

  const api = {
    TOOLS, LINKS, ARRIVALS_URL, UNESCO_URL, UNESCO_CRITERIA, ToolError, config, links, hasState, update, result, penaltyLeft,
    angleDiff, compassHit, tttStatus, norm, letterCount, sameName, hide, unhide, isSecret, randomInt, shuffle, letter, sameLetter,
    phase, sanitize
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.QuestTools = api;
})(typeof window !== "undefined" ? window : globalThis);
