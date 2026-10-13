// ============================================================================
//  INHALTE DES SPIELS – hier könnt ihr Quests, Bonus-Karten und Belohnungen
//  bearbeiten. Die IDs (q-…, b-…) bitte nicht ändern, sobald ihr spielt,
//  sonst passen gespeicherte Spielstände nicht mehr.
//  Alle Texte sind ENTWÜRFE (im Spieldesign noch "offene Punkte").
// ============================================================================

window.GAME_CONTENT = {
  // Reihenfolge = Reihenfolge in Listen
  regions: [
    {
      id: "calheta", name: "Calheta",
      quests: [
        { id: "q-cal-1", title: "Goldener Strand", text: "Legt euch an den hellen Sandstrand von Calheta (einer der wenigen mit goldenem Sand) und baut gemeinsam eine Sandburg, die mindestens 10 Minuten steht." },
        { id: "q-cal-2", title: "Kunst & Klippen", text: "Besucht das Kunstzentrum Casa das Mudas und sucht euch jeder ein Werk aus, das ihr den anderen in genau einem Satz erklärt." },
        { id: "q-cal-3", title: "Levada der 25 Quellen", text: "Wandert in Rabaçal zur Levada das 25 Fontes oder zum Risco-Wasserfall und zählt unterwegs, wer die meisten kleinen Wasserfälle entdeckt." }
      ]
    },
    {
      id: "camara", name: "Câmara de Lobos",
      quests: [
        { id: "q-cdl-1", title: "Poncha-Taufe", text: "Trinkt in einer Bar in Câmara de Lobos (z. B. in Estreito oder am Hafen) eine echte Poncha und lasst euch zeigen, wie sie mit dem Caralhinho gerührt wird." },
        { id: "q-cdl-2", title: "Churchills Blick", text: "Stellt euch an die Stelle, an der Winston Churchill den bunten Fischerhafen gemalt hat, und malt oder skizziert ihn selbst – Talent egal." },
        { id: "q-cdl-3", title: "Über dem Abgrund", text: "Betretet die Glasplattform am Cabo Girão (580 m über dem Meer) und haltet es mindestens eine Minute aus, ohne auf das Handy zu schauen." }
      ]
    },
    {
      id: "funchal", name: "Funchal",
      quests: [
        { id: "q-fun-1", title: "Markt-Mutprobe", text: "Probiert im Mercado dos Lavradores eine Frucht, die keiner von euch vorher kannte (z. B. Maracuja-Banane oder Anona) – und verhandelt höflich den Preis." },
        { id: "q-fun-2", title: "Schlittenfahrt", text: "Fahrt mit der Seilbahn nach Monte und rauscht mit den Korbschlitten (Carros de Cesto) wieder hinunter – oder lauft tapfer zu Fuß." },
        { id: "q-fun-3", title: "Bemalte Türen", text: "Findet in der Rua de Santa Maria in der Altstadt drei bemalte Türen, die euch als Team repräsentieren – eine pro Person." }
      ]
    },
    {
      id: "machico", name: "Machico",
      quests: [
        { id: "q-mac-1", title: "Ans Ende der Insel", text: "Wandert auf der Ponta de São Lourenço bis zum Aussichtspunkt am Ende des Wegs (ca. 3 Std. hin und zurück) und ruft dort gemeinsam „Madeira!“." },
        { id: "q-mac-2", title: "Gelber Sand aus Afrika", text: "Badet am Strand von Machico (der Sand stammt aus Marokko) und schwimmt bis zur Boje oder so weit, wie ihr euch traut." },
        { id: "q-mac-3", title: "Landung", text: "Sucht euch in Machico/Santa Cruz einen Platz mit Blick auf die Landebahn und schaut einem Flugzeug bei der Landung zu – applaudiert gemeinsam." }
      ]
    },
    {
      id: "pontadosol", name: "Ponta do Sol",
      quests: [
        { id: "q-pds-1", title: "Sonnenuntergang", text: "Schaut euch in Ponta do Sol – dem sonnigsten Ort der Insel – einen kompletten Sonnenuntergang an, ohne zu reden, bis die Sonne weg ist." },
        { id: "q-pds-2", title: "Wasserfall-Dusche", text: "Fahrt die alte Küstenstraße bei Ponta do Sol/Madalena do Mar und lasst euch von einem der Wasserfälle über die Straße kurz nassregnen (nur wenn es sicher ist)." },
        { id: "q-pds-3", title: "Bananen-Expedition", text: "Lauft durch die Bananenplantagen bei Lombada oder Madalena do Mar und findet heraus, wie viele Bananen an einer Staude hängen (geschätzt reicht)." }
      ]
    },
    {
      id: "portomoniz", name: "Porto Moniz",
      quests: [
        { id: "q-pmz-1", title: "Lava-Bad", text: "Badet in den natürlichen Lavaschwimmbecken von Porto Moniz und lasst euch von einer Welle über den Beckenrand überraschen." },
        { id: "q-pmz-2", title: "Feenwald", text: "Lauft durch den Nebelwald von Fanal und macht ein Foto, das aussieht wie aus einem Fantasy-Film (für euch, nicht als Beweis)." },
        { id: "q-pmz-3", title: "Die alte Nordküste", text: "Fahrt über die Hochebene Paul da Serra hinunter nach Porto Moniz und zählt unterwegs die Kühe, Ziegen oder Windräder – Gewinner wählt das Mittagessen." }
      ]
    },
    {
      id: "ribeirabrava", name: "Ribeira Brava",
      quests: [
        { id: "q-rbr-1", title: "Inselmitte", text: "Steht am Encumeada-Pass, von dem man (bei gutem Wetter) Nord- und Südküste gleichzeitig sieht, und zeigt gleichzeitig auf beide Meere." },
        { id: "q-rbr-2", title: "Kirchturm-Rätsel", text: "Besucht die Kirche São Bento in Ribeira Brava mit dem blau-weiß gekachelten Turm und denkt euch eine Legende aus, warum er so bunt ist." },
        { id: "q-rbr-3", title: "Uferpromenade", text: "Esst in Ribeira Brava an der Promenade etwas Typisches (Bolo do Caco, Lapas oder Espetada) und vergebt Noten von 1 bis 10." }
      ]
    },
    {
      id: "santacruz", name: "Santa Cruz",
      quests: [
        { id: "q-scr-1", title: "Seilbahn ins Paradies", text: "Fahrt mit der kleinen Seilbahn von Garajau/Rocha do Navio oder zu einer Fajã hinunter ans Meer und sucht dort den schönsten Stein." },
        { id: "q-scr-2", title: "Christus-Blick", text: "Besucht die Christus-Statue (Cristo Rei) in Garajau und imitiert gemeinsam die Pose für ein Gruppenfoto." },
        { id: "q-scr-3", title: "Wasserspaß", text: "Badet an der Promenade/Strand von Santa Cruz oder im Aquaparque und lasst den mutigsten von euch zuerst ins Wasser." }
      ]
    },
    {
      id: "santana", name: "Santana",
      quests: [
        { id: "q-san-1", title: "Dreieckshäuser", text: "Stellt euch vor eines der typischen strohgedeckten Dreieckshäuser in Santana und überlegt, wie ihr drei darin wohnen würdet." },
        { id: "q-san-2", title: "Über den Wolken", text: "Seid zum Sonnenaufgang (oder zumindest früh) auf dem Pico do Arieiro – oder wandert zum Pico Ruivo, dem höchsten Gipfel der Insel." },
        { id: "q-san-3", title: "Lorbeerwald", text: "Wandert eine Strecke der Levada do Caldeirão Verde oder rund um Queimadas im Lorbeerwald (UNESCO-Weltnaturerbe) und findet einen Baum, der älter aussieht als 500 Jahre." }
      ]
    },
    {
      id: "saovicente", name: "São Vicente",
      quests: [
        { id: "q-svi-1", title: "Unter der Erde", text: "Erkundet die Lavahöhlen (Grutas) von São Vicente und findet heraus, wie alt sie ungefähr sind." },
        { id: "q-svi-2", title: "Kapelle im Fels", text: "Findet in São Vicente die kleine Kapelle, die direkt in einen Felsen an der Flussmündung gebaut ist, und zündet (wenn möglich) eine Kerze an." },
        { id: "q-svi-3", title: "Nordküsten-Brandung", text: "Sucht euch zwischen Seixal und São Vicente einen Aussichtspunkt an der Nordküste und schaut zu, wie die Brandung gegen die schwarzen Klippen knallt – jeder benennt eine Welle." }
      ]
    }
  ],

  // Bonus-Karten: überall machbar. difficulty: "leicht" | "mittel" | "schwer"
  bonusCards: [
    // 10 leicht (15 Punkte)
    { id: "b-01", difficulty: "leicht", title: "Bom dia!", text: "Bestellt einen kompletten Kaffee (Bica, Galão oder Chinesa) ausschließlich auf Portugiesisch." },
    { id: "b-02", difficulty: "leicht", title: "Bolo do Caco", text: "Esst ein frisches Bolo do Caco mit Knoblauchbutter." },
    { id: "b-03", difficulty: "leicht", title: "Nationalblume", text: "Findet eine Strelitzie (Paradiesvogelblume) und benennt sie nach einem Mitspieler." },
    { id: "b-04", difficulty: "leicht", title: "Eidechsen-Safari", text: "Zählt bei einer Pause die Eidechsen in eurer Nähe – mindestens 5." },
    { id: "b-05", difficulty: "leicht", title: "Postkarte", text: "Schreibt gemeinsam eine Postkarte an jemanden zu Hause und werft sie ein." },
    { id: "b-06", difficulty: "leicht", title: "Maracuja-Mix", text: "Probiert jeder eine Maracuja-Sorte (Banane, Tomate, Limette …) und kürt einen Sieger." },
    { id: "b-07", difficulty: "leicht", title: "Fliesen-Detektive", text: "Findet ein Azulejo-Bild (Kachelbild), auf dem ein Tier zu sehen ist." },
    { id: "b-08", difficulty: "leicht", title: "Atlantik festhalten", text: "Macht ein Foto, auf dem alle drei so tun, als würden sie den Atlantik festhalten." },
    { id: "b-09", difficulty: "leicht", title: "Kurven-Zähler", text: "Zählt auf einer Autofahrt die Haarnadelkurven – wer am nächsten schätzt, darf die Musik wählen." },
    { id: "b-10", difficulty: "leicht", title: "Obrigado/a", text: "Jeder von euch bedankt sich heute mindestens dreimal korrekt mit Obrigado bzw. Obrigada." },

    // 10 mittel (25 Punkte)
    { id: "b-11", difficulty: "mittel", title: "Espetada", text: "Esst eine traditionelle Espetada (Rindfleischspieß am Lorbeerstab), die von der Decke hängt." },
    { id: "b-12", difficulty: "mittel", title: "Schwarzer Degenfisch", text: "Probiert Espada com Banana (Degenfisch mit Banane) – auch wer skeptisch ist." },
    { id: "b-13", difficulty: "mittel", title: "Tunnel-Ralley", text: "Fahrt durch mindestens 15 Tunnel an einem Tag und zählt laut mit." },
    { id: "b-14", difficulty: "mittel", title: "Atlantik-Bad", text: "Jeder taucht mindestens einmal komplett im offenen Atlantik unter." },
    { id: "b-15", difficulty: "mittel", title: "Madeirawein", text: "Macht eine kleine Weinprobe (z. B. Blandy's, Pereira d'Oliveira) und erratet einmal die Rebsorte." },
    { id: "b-16", difficulty: "mittel", title: "Levada-Kilometer", text: "Wandert mindestens 5 km am Stück an einer Levada entlang." },
    { id: "b-17", difficulty: "mittel", title: "Fremder Tipp", text: "Fragt einen Einheimischen nach seinem Lieblingsort auf der Insel – und fahrt diese Woche wirklich hin." },
    { id: "b-18", difficulty: "mittel", title: "Fado-Abend", text: "Hört live Fado oder madeirensische Volksmusik (z. B. in Funchal)." },
    { id: "b-19", difficulty: "mittel", title: "Picknick mit Aussicht", text: "Macht ein Picknick an einem Miradouro, eingekauft nur auf einem lokalen Markt oder Minimercado." },
    { id: "b-20", difficulty: "mittel", title: "Wolkengrenze", text: "Fahrt oder wandert durch eine Wolkendecke hindurch und steht darüber in der Sonne." },

    // 6 schwer (50 Punkte)
    { id: "b-21", difficulty: "schwer", title: "Pico-Ruivo-Gipfel", text: "Steht auf dem Pico Ruivo (1.862 m), dem höchsten Punkt Madeiras." },
    { id: "b-22", difficulty: "schwer", title: "Delfin-Moment", text: "Seht Delfine oder Wale in freier Natur (z. B. bei einer Bootstour ab Funchal oder Calheta)." },
    { id: "b-23", difficulty: "schwer", title: "Sonnenaufgang auf dem Arieiro", text: "Erlebt den Sonnenaufgang auf dem Pico do Arieiro – Wecker vor 6 Uhr inklusive." },
    { id: "b-24", difficulty: "schwer", title: "Canyoning oder Coasteering", text: "Macht eine geführte Canyoning-, Coasteering- oder Kajak-Tour." },
    { id: "b-25", difficulty: "schwer", title: "Die große Levada", text: "Lauft eine Wanderung von mindestens 12 km an einem Tag." },
    { id: "b-26", difficulty: "schwer", title: "Inselumrundung", text: "Fahrt an einem einzigen Tag einmal komplett um die Insel (Nord- und Südküste)." }
  ],

  // Belohnungen am Ende. kind: "time" (Minuten) | "count" (Stück)
  rewards: [
    { id: "massage", name: "Massage", type: "Vorteil", kind: "time", per100: 3, unit: "Minuten", step: 5, voucher: "Massage" },
    { id: "photoshop", name: "Photoshop-Bild", desc: "ein Urlaubsfoto sorgfältig bearbeitet", type: "Vorteil", kind: "count", per100: 1, unit: "Bild", unitPlural: "Bilder", step: 100, voucher: "Photoshop-Bild" },
    { id: "staendchen", name: "Live-Ständchen", desc: "die anderen wählen die Lieder", type: "Neutral", kind: "time", per100: 3, unit: "Minuten", step: 5, voucher: "Live-Ständchen" },
    { id: "drink", name: "Mystery-Drink", desc: "die anderen bestimmen, was reingemischt wird, und ich trinke es", type: "Strafe", kind: "count", per100: 1, unit: "Zutat", unitPlural: "Zutaten", step: 100, voucher: "Mystery-Drink",
      rules: "Nur Lebensmittel und Getränke, nichts Ungenießbares oder Gesundheitsschädliches, höchstens 5 Zutaten pro Glas. Mehr Zutaten bedeuten mehrere Gläser." },
    { id: "profilbild", name: "Profilbild-Diktat", desc: "die anderen wählen mein WhatsApp-Profilbild, ich darf es nicht ändern", type: "Strafe", kind: "count", per100: 1, unit: "Tag", unitPlural: "Tage", step: 100, voucher: "Profilbild-Diktat" }
  ]
};
