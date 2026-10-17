// Rang-Figuren als Strichzeichnung (Inline-SVG) – dieselbe Person, die sich hocharbeitet:
// 0 = Landstreicher, 1 = Abenteurer, 2 = Inselkönig.
// Strichstärke wie bei den Icons (2 px, unabhängig von der Größe), wenig Farbe:
// Linien in der Textfarbe, nur ein kleiner Akzent (Flicken, Kompass, Krone).
(function () {
  "use strict";
  // Gemeinsame Person: gleiches Gesicht, gleicher Körperbau
  const FACE = '<circle cx="24" cy="13" r="5"/>' +
    '<circle class="dot" cx="22.2" cy="12.6" r=".55"/><circle class="dot" cx="25.8" cy="12.6" r=".55"/>' +
    '<path d="M22.4 15.2q1.6 1.2 3.2 0"/>';
  const BODY = '<path d="M24 18v3"/><path d="M19.5 21h9l1.5 12h-12z"/>';
  const LEGS = '<path d="M21.5 33l-1.5 10.5"/><path d="M26.5 33l1.5 10.5"/><path d="M17.5 43.5h3"/><path d="M27.5 43.5h3"/>';

  const PARTS = [
    // Landstreicher: zerknautschter Hut, Bündel am Stock über der Schulter, Flicken
    '<path d="M18 9.6l12.4-1.4"/><path d="M19.6 9.3c.3-2.9 1.8-4.6 4-4.4 1.2.1 1.6 1.1 2.6.6 1.4-.6 2.6.8 2.6 2.9"/>' +
      '<path class="accent-fill" d="M21.3 24.4h3.4v3.4h-3.4z"/><path class="thin" d="M21.3 25.5h3.4M22.5 24.4v3.4"/>' +
      '<path d="M19.5 22l-2.5 6.5"/><path d="M28.5 22l-1.5 5.5"/>' +
      '<path d="M26.2 28.5L37.5 8.5"/>' +
      '<path d="M37.2 9.2c-2.6.4-4.4 2.6-4.1 5.3.3 2.6 2.6 4.3 5.3 4 2.8-.3 4.6-2.7 4.2-5.4-.3-2.3-2.2-3.9-4.5-3.9z"/>' +
      '<path class="thin" d="M36 9.6l-.9-1.8M38.4 9.4l1.2-1.6"/>',
    // Abenteurer: Wanderhut, Rucksack, Kompass
    '<path d="M16.5 9.5h15"/><path d="M19.8 9.5c0-3.4 1.8-5.3 4.2-5.3s4.2 1.9 4.2 5.3"/><path d="M20 7.8h8"/>' +
      '<path d="M18.6 21.5h-3.1a1.5 1.5 0 0 0-1.5 1.5v8.5a1.5 1.5 0 0 0 1.5 1.5h3.6"/><path d="M14 26h4.5"/>' +
      '<path d="M28.5 22l3.5 4.5"/><path d="M19.5 22l-1 4"/>' +
      '<circle class="accent-fill" cx="33.5" cy="28" r="3"/><path class="thin" d="M32.4 29.1l2.2-2.2"/>',
    // Inselkönig: Krone, Umhang, stolze Haltung (Hände in die Hüften)
    '<path class="accent-fill" d="M19.4 8.6l-.6-4.6 2.8 2 2.4-3.2 2.4 3.2 2.8-2-.6 4.6z"/>' +
      '<path d="M19.5 21L13 41.5h22L28.5 21"/>' +
      '<path d="M19.5 22l-3.5 4.5 3.5 3.5"/><path d="M28.5 22l3.5 4.5-3.5 3.5"/>' +
      '<path class="thin" d="M21 24.5h6"/>'
  ];
  const NAMES = ["Landstreicher", "Abenteurer", "Inselkönig"];

  window.rankFigure = function (rank, cls) {
    const i = Math.max(0, Math.min(2, rank | 0));
    // Der Umhang liegt hinter dem Körper -> beim Inselkönig zuerst zeichnen
    const back = i === 2 ? PARTS[2] : "";
    const front = i === 2 ? "" : PARTS[i];
    return '<svg class="fig' + (cls ? " " + cls : "") + '" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="' + NAMES[i] + '">' +
      '<g class="fig-lines">' + back + LEGS + BODY + FACE + front + "</g></svg>";
  };
})();
