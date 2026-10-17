// ============================================================================
//  INHALTE DES SPIELS – regionale Quests, Stapel-Quests und Belohnungen.
//
//  Regionale Quests: je 3 pro Region, an einen Ort gebunden.
//    title    Titel
//    location Standort (wird angezeigt)
//    pin      [Breitengrad, Längengrad] der Markierung auf der Inselkarte
//    maps     Suchbegriff für den Google-Maps-Link (Name des Eintrags);
//             null = der Link öffnet stattdessen die Pin-Koordinaten
//    mapsUrl  optional: fester Google-Maps-Link, wird statt des Such-Links verwendet
//    Bild     optional: public/images/quests/<ID>.jpg (siehe README dort)
//    desc     Beschreibung
//    task     Aufgabe ("Eure Aufgabe: …")
//    link     optional: {text, href} – dieser Text in der Aufgabe wird ein Link
//    height   nur „Angsthase oder Augenmaß?“: echte Höhe in Metern für das Hilfsmittel „Höhe schätzen“
//             (Hilfsmittel und ihre Links stehen in public/tools.js)
//
//  Stapel-Quests: überall machbar, liegen im gemischten Stapel.
//    difficulty "einfach" (15 P) | "mittel" (25 P) | "schwer" (50 P)
//
//  Die IDs (q-…, s-…) bitte nicht ändern, sobald ihr spielt,
//  sonst passen gespeicherte Spielstände nicht mehr.
// ============================================================================

window.GAME_CONTENT = {
  // Reihenfolge = Reihenfolge in Listen und in der Übersicht
  regions: [
    {
      id: "calheta", name: "Calheta",
      quests: [
        {
          id: "q-cal-1", title: `Levada-Lava-Wasserfälle`,
          location: `Levada das 25 Fontes, Rabaçal (Calheta)`, pin: [32.7613, -17.1355], maps: "Lagoa das 25 Fontes, Rabaçal, Madeira",
          desc: `Madeira ist eine Vulkaninsel, und das Wasser, das von ihren Bergen herabstürzt, wird seit Jahrhunderten über Levadas, schmale Wasserkanäle, über die ganze Insel verteilt. Die Wanderung zu den 25 Fontes im Hochland von Rabaçal ist eine der berühmtesten davon: Sie endet an einem grünen Felskessel, in den unzählige kleine Wasserfälle in einen See stürzen.`,
          task: `Eure Aufgabe: Nähert euch einem Wasserfall auf bis zu drei Meter und macht ein Foto, auf dem sowohl sein Anfang als auch sein Ende zu sehen sind. Wird einer von euch dabei nass, müsst ihr es an einem anderen Wasserfall noch einmal versuchen.`
        },
        {
          id: "q-cal-2", title: `Light Show`,
          location: `Leuchtturm Ponta do Pargo (Farol da Ponta do Pargo)`, pin: [32.8139, -17.2626], maps: "Farol da Ponta do Pargo, Madeira",
          desc: `Ganz im Westen Madeiras steht der Leuchtturm von Ponta do Pargo hoch über den Klippen und blickt auf den offenen Atlantik. Hier geht die Sonne über dem Meer unter, und wenn es dämmert, beginnt der Leuchtturm zu leuchten.`,
          task: `Eure Aufgabe: Bringt drei Lichter zusammen: den Leuchtturm, den Sonnenuntergang und eure Handy-Taschenlampe. Stapelt mindestens fünf Steine aufeinander und legt ein Handy mit eingeschalteter Taschenlampe darauf. Geschafft ist die Quest, wenn euer Bauwerk mindestens 10 Sekunden lang hält. Stürzt es ein, baut ihr neu.`
        },
        {
          id: "q-cal-3", title: `Betrunken nach Marokko`,
          location: `Engenho da Calheta / Strand von Calheta (Praia da Calheta)`, pin: [32.7210, -17.1780], maps: "Engenho da Calheta, Madeira",
          desc: `Im Engenho da Calheta, einer der ältesten Zuckerrohrmühlen Madeiras, wird bis heute Rum aus heimischem Zuckerrohr gebrannt. Ganz in der Nähe liegt der Strand von Calheta, und der ist künstlich angelegt: Sein goldener Sand wurde eigens aus Marokko herbeigeschafft.`,
          task: `Eure Aufgabe: Besucht das Engenho und probiert dort Rum (mindestens eine Person). Danach geht ihr gemeinsam an den Strand. Wer getrunken hat, greift in den Sand und lallt vor sich hin, dass man in Marokko sei.`
        }
      ]
    },
    {
      id: "pontadosol", name: "Ponta do Sol",
      quests: [
        {
          id: "q-pds-1", title: `Windstärke 5`,
          location: `Windpark auf der Hochebene Paul da Serra, auf dem Teil der Hochebene, der zu Ponta do Sol gehört`, pin: [32.75644, -17.05469], maps: "Miradouro da Bica da Cana",
          desc: `Madeira besteht fast nur aus Steilhängen, mit einer großen Ausnahme: der Paul da Serra, der einzigen Hochebene der Insel auf rund 1.500 Metern. Sie erstreckt sich über mehrere Gemeinden, darunter Ponta do Sol. Weil der Wind hier oben ungebremst über die flache Ebene pfeift, steht hier der größte Windpark Madeiras.`,
          task: `Eure Aufgabe: Macht ein Foto, auf dem mindestens fünf Windräder zu sehen sind.`
        },
        {
          id: "q-pds-2", title: `Waschstraße`,
          location: `Cascata dos Anjos (alte Küstenstraße ER101 bei Ponta do Sol)`, pin: [32.6866, -17.1138], maps: "Cascata dos Anjos, Ponta do Sol, Madeira",
          desc: `Kurz hinter Ponta do Sol stürzt die Cascata dos Anjos, der „Engelswasserfall", direkt auf die alte Küstenstraße. Wegen dieser Besonderheit ist er als kostenlose Autowäsche bekannt geworden und gehört zu den meistfotografierten Orten der Insel. Die Straße wird wegen Steinschlaggefahr allerdings immer wieder gesperrt.`,
          task: `Eure Aufgabe: Ist die Straße für Autos offen, fahrt ihr mit dem Mietwagen unter dem Wasserfall durch und filmt es von innen. Ist sie nur für Fußgänger offen, lauft ihr alle drei durch.`
        },
        {
          id: "q-pds-3", title: `Bananenversteck`,
          location: `Bananenplantagen an den Hängen um den Ort Ponta do Sol`, pin: [32.6785, -17.088], maps: "Banana Museum of Madeira (BAM)",
          desc: `Ponta do Sol ist bekannt für seine Bananen und hat ihnen sogar ein eigenes Museum gewidmet. Überall an den sonnigen Hängen wachsen die Stauden mit ihren riesigen Blättern, und die sind perfekt, um sich darin zu verstecken.`,
          task: `Eure Aufgabe: Eine Person versteckt sich am Rand einer Bananenplantage zwischen den Blättern, eine zweite Person macht ein Foto. Die dritte Person bekommt das Foto zu sehen und versucht, die versteckte Person darauf zu finden. Gelingt ihr das nicht, ist die Quest geschafft. Findet sie die Person, versteckt ihr euch neu.`
        }
      ]
    },
    {
      id: "ribeirabrava", name: "Ribeira Brava",
      quests: [
        {
          id: "q-rbr-1", title: `Werdet brava an der Ribeira Brava!`,
          location: `Fluss Ribeira Brava`, pin: [32.72644, -17.00831], maps: "Waterwerken Levada do Norte",
          desc: `„Ribeira Brava" bedeutet „wilder Fluss". In der Regenzeit kann er so stark anschwellen, dass er auf seinen acht Kilometern alles mitreißt, was ihm im Weg steht.`,
          task: `Eure Aufgabe: Sucht euch irgendwo am Fluss eine Stelle und werdet genauso wild wie er: Tanzt, schreit, tobt 30 Sekunden lang so verrückt ihr könnt. Eine Person filmt. Dabei darf euch niemand sehen. Taucht jemand auf, fangt ihr woanders neu an.`
        },
        {
          id: "q-rbr-2", title: `Vermeidet ein Seilbahn-Sekunden-Sakrileg`,
          location: `Fajã dos Padres (untere Seilbahnstation)`, pin: [32.6555, -17.0205], maps: "Fajã dos Padres, Madeira",
          desc: `Die Fajã dos Padres, die „Fajã der Priester", gehörte einst Jesuiten und war bis 1998 nur übers Meer erreichbar. Heute führt eine Panorama-Seilbahn rund 300 Meter die Klippe hinunter, und zwar von Câmara de Lobos direkt nach Ribeira Brava.`,
          task: `Eure Aufgabe: Schätzt, wie lange die Seilbahn von oben nach unten braucht, vom Losfahren bis zum vollständigen Stillstand. Ihr dürft vorher andere Fahrten beobachten. Stoppt die Fahrt dann mit dem Handy. Liegt ihr höchstens 15 Sekunden daneben, ist die Quest geschafft. Wenn nicht, habt ihr auf dem Rückweg eine zweite Chance.`
        },
        {
          id: "q-rbr-3", title: `Tic-Tac-São-Bento`,
          location: `Igreja de São Bento, Ribeira Brava`, pin: [32.6729, -17.0644], maps: "Igreja de São Bento, Ribeira Brava, Madeira",
          desc: `Die Igreja de São Bento ist eine der ältesten ländlichen Kirchen im Bistum Funchal und eine der meistbesuchten auf Madeira. Innen hängen zwei riesige Kristall-Kronleuchter, außen wartet der Platz vor der Kirche mit seinem gemusterten Steinpflaster.`,
          task: `Eure Aufgabe: Verwandelt den Platz in ein Spielfeld und spielt Tic-Tac-Toe in echt. Zwei Personen treten gegeneinander an, die dritte ist Schiedsrichter. Wer am Zug ist, stellt sich auf ein Feld, um es zu markieren. Gespielt wird, bis eine Person gewinnt.`
        }
      ]
    },
    {
      id: "camara", name: "Câmara de Lobos",
      quests: [
        {
          id: "q-cdl-1", title: `Aussicht auf virtuelle Aussicht`,
          location: `Madeira Experiências Imersivas, Ortszentrum Curral das Freiras`, pin: [32.7205, -16.9690], maps: "Madeira Experiências Imersivas, Curral das Freiras",
          desc: `Curral das Freiras, das „Nonnental", ist ein abgelegenes Dorf im Herzen der Insel, eingeschlossen von steilen Bergen und bekannt für seine malerischen Aussichten. Ausgerechnet hier gibt es ein Zentrum für Virtual Reality, das Madeira auf ganz neue Weise zeigt.`,
          task: `Eure Aufgabe: Erlebt im Madeira Experiências Imersivas eine der virtuellen Touren über die Insel.`
        },
        {
          id: "q-cdl-2", title: `Was Churchill sah`,
          location: `Churchill-Aussichtspunkt oberhalb des Hafens von Câmara de Lobos`, pin: [32.6489, -16.9748], maps: "Miradouro Winston Churchill, Câmara de Lobos, Madeira",
          desc: `1950 stellte Winston Churchill oberhalb des Hafens von Câmara de Lobos seine Staffelei auf und malte die Bucht. Eine Plakette markiert die Stelle, und der Blick hat sich seitdem kaum verändert.`,
          task: `Eure Aufgabe: Eine Person überlegt sich fünf Dinge, die sie an der Bucht besonders schön findet, und schreibt sie auf. Die anderen beiden haben je drei Tipps, um mindestens drei der fünf Begriffe zu erraten. Gelingt das nicht, wählt die Person fünf neue, ungenannte Begriffe.`
        },
        {
          id: "q-cdl-3", title: `Angsthase oder Augenmaß?`,
          location: `Aussichtspunkt Cabo Girão (Skywalk)`, pin: [32.6557, -17.0046], maps: "Cabo Girão Skywalk, Madeira",
          desc: `Cabo Girão gehört zu den höchsten Meeresklippen Europas. Auf dem Aussichtspunkt befindet sich ein Glasboden direkt über dem Abgrund, mit freiem Blick bis hinunter aufs Meer.`,
          task: `Eure Aufgabe: Schätzt, wie hoch ihr hier oben seid. Liegt die gemeinsame Schätzung höchstens 10% daneben, ist die Quest geschafft. Wenn nicht, wartet ihr 5 Minuten und schätzt neu. Aber Vorsicht: Die Antwort wird groß ausgeschildert. Eine Person übernimmt deshalb die Rolle des Spoiler-Schutzes und lotst die beiden anderen über den Aussichtspunkt.`,
          height: 589 // echte Höhe in Metern für das Hilfsmittel „Höhe schätzen“ (wird erst bei „Geschafft!“ gezeigt)
        }
      ]
    },
    {
      id: "funchal", name: "Funchal",
      quests: [
        {
          id: "q-fun-1", title: `Gespür für die richtige Tür`,
          location: `Rua de Santa Maria, Altstadt (Zona Velha) von Funchal`, pin: [32.6484, -16.9016], maps: "Rua de Santa Maria, Funchal, Madeira",
          desc: `In der Rua de Santa Maria, einer der ältesten Straßen Funchals, lädt die Stadt seit 2010 Künstler ein, die alten Türen zu bemalen. Inzwischen sind es über 200, und jede ist ein eigenes Kunstwerk.`,
          task: `Eure Aufgabe: Eine Person geht voraus und fotografiert für jede von euch dreien eine Tür, die zu ihrem Charakter, Aussehen oder ihren Eigenschaften passt. Die anderen beiden bekommen die drei Fotos zu sehen und müssen erraten, welche Tür zu wem gehört. Liegen sie falsch, fotografiert die Person drei neue Türen.`
        },
        {
          id: "q-fun-2", title: `Rodeln will gelernt sein`,
          location: `Start der Korbschlitten in Monte (bei der Kirche Nossa Senhora do Monte)`, pin: [32.6764, -16.9017], maps: "Associação dos Carreiros do Monte, Funchal, Madeira",
          desc: `Seit dem 19. Jahrhundert geht es in Monte auf ungewöhnliche Weise bergab: in Korbschlitten, den Carros de Cesto, über die steilen Straßen hinunter Richtung Funchal. Gelenkt werden sie von den Carreiros do Monte, Männern in weißer Kleidung mit Strohhut.`,
          task: `Eure Aufgabe: Fahrt mit einem der Korbschlitten den Berg hinunter.`
        },
        {
          id: "q-fun-3", title: `Früchteschweiger`,
          location: `Mercado dos Lavradores, Funchal`, pin: [32.6497, -16.9055], maps: "Mercado dos Lavradores, Funchal, Madeira",
          desc: `Der Mercado dos Lavradores ist Funchals bunter Bauernmarkt, voll mit exotischen Früchten, die man zu Hause kaum bekommt. Bekannt ist er auch für seine eifrigen Händler und deren Kostproben.`,
          task: `Eure Aufgabe: Eine Person kauft drei verschiedene Früchte und legt eine Rangfolge fest, von der besten bis zur schlechtesten, die sie verschweigt. Die anderen beiden probieren alle drei und müssen die Rangfolge erraten. Liegen sie falsch, versucht ihr es mit drei anderen Früchten.`
        }
      ]
    },
    {
      id: "santacruz", name: "Santa Cruz",
      quests: [
        {
          id: "q-scr-1", title: `Halb gelandet`,
          location: `kleiner Hafen von Santa Cruz direkt unter der Landebahn des Flughafens`, pin: [32.68806, -16.78356], maps: "Porto Recreio Santa Cruz",
          desc: `Der Flughafen von Madeira gilt als einer der anspruchsvollsten Europas: kurze Landebahn, starke Winde, Berge auf der einen und das Meer auf der anderen Seite. Seine Landebahn ruht teilweise auf hohen Pfeilern über der Küste, und direkt darunter liegt der kleine Hafen von Santa Cruz.`,
          task: `Eure Aufgabe: Fotografiert vom Hafen aus ein landendes Flugzeug, das auf dem Foto nur halb zu sehen ist, weil ein Teil davon schon von der Landebahn verdeckt wird.`
        },
        {
          id: "q-scr-2", title: `Grüße nach Rio`,
          location: `Cristo Rei, Ponta do Garajau (Caniço)`, pin: [32.6408, -16.8505], maps: "Cristo Rei do Garajau, Madeira",
          desc: `Auf der Landspitze von Garajau steht eine Christusstatue mit ausgebreiteten Armen und blickt über den Atlantik. Ihre berühmte große Schwester steht rund 6.800 Kilometer entfernt, auf der anderen Seite des Ozeans in Rio de Janeiro.`,
          task: `Eure Aufgabe: Zwei Personen zeigen ohne Hilfsmittel in die Richtung, in der Rio liegt. Die dritte Person prüft mit einer Kompass-App: Rio liegt bei 208°. Weicht deren Schätzung um höchstens 50° ab, ist die Quest geschafft. Wenn nicht, wartet ihr 5 Minuten und versucht es erneut.`
        },
        {
          id: "q-scr-3", title: `Torfabrik neben alter Korbfabrik`,
          location: `Largo da Achada, Camacha`, pin: [32.6788, -16.8462], maps: "Largo da Achada, Camacha, Madeira",
          desc: `1875 organisierte Harry Hinton auf dem Largo da Achada in Camacha das erste offizielle Fußballspiel Portugals. Eine Gedenkmauer erinnert heute daran. Von hier aus verbreitete sich das Spiel über ganz Madeira und bis aufs portugiesische Festland. Gut ein Jahrhundert später wurde auf derselben Insel Cristiano Ronaldo geboren. Camacha ist aber auch für eine ganz andere Tradition bekannt: die Korbflechterei, die genau in dieser Gegend entstanden ist und bis heute im Ortszentrum gepflegt wird.`,
          task: `Eure Aufgabe: Spielt euch auf dem Largo da Achada mit den Füßen einen Ball oder einen anderen Gegenstand zu, bis jede Person ihn einmal berührt hat.`
        }
      ]
    },
    {
      id: "machico", name: "Machico",
      quests: [
        {
          id: "q-mac-1", title: `Inselneuentdeckung`,
          location: `Bucht und Hafen von Machico`, pin: [32.7155, -16.76], maps: "Oceanodroma - Birds, Whales and Dolphins Watching, Porto de Recreio de, 9200-000 Machico",
          desc: `In der Bucht von Machico gingen 1419 die portugiesischen Seefahrer Zarco und Teixeira zum ersten Mal auf Madeira an Land. Heute schützen Hafenmauern die Bucht, an der zwei Strände liegen: der Sandstrand Banda d'Além und der Kiesstrand São Roque.`,
          task: `Eure Aufgabe: Werft von einer Hafenmauer ein Stück Holz ins Wasser. Wird es an Land gespült, ist die Quest geschafft. Treibt es aufs Meer hinaus, versucht ihr es mit einem neuen.`
        },
        {
          id: "q-mac-2", title: `Bucht gesucht`,
          location: `Halbinsel Ponta de São Lourenço, zwischen Caniçal und der Spitze`, pin: [32.7445, -16.7050], maps: "Ponta de São Lourenço, Madeira",
          desc: `Ganz im Osten läuft Madeira in einer schmalen, zerklüfteten Halbinsel aus: der Ponta de São Lourenço. Statt grüner Steilhänge prägen hier rötliche, karge Felsen die Landschaft. Zwischen dem Dorf Caniçal und der Spitze reiht sich Bucht an Bucht, jede mit ihrer eigenen Form.`,
          task: `Eure Aufgabe: Das Hilfsmittel lost geheim eine Bucht zwischen Caniçal und der Spitze der Halbinsel aus. Eine Person sieht nur deren Küstenausschnitt und zeichnet ihn nach. Die anderen beiden müssen anhand der Zeichnung auf der Karte der Halbinsel herausfinden, welche Bucht gemeint ist, ohne dabei mit der zeichnenden Person zu sprechen. Erraten sie die falsche Bucht, wird eine neue ausgelost und gezeichnet. Alle dürfen Tools wie Google Maps verwenden.`
        },
        {
          id: "q-mac-3", title: `Steinadler`,
          location: `Porto da Cruz, mit Blick auf den Penha d'Águia`, pin: [32.77538, -16.82668], maps: "Furna do Porto da Cruz",
          desc: `An der Nordostküste ragt der Penha d'Águia, der „Adlerfelsen", rund 580 Meter steil aus dem Meer. Der gewaltige Felsblock liegt zwischen Porto da Cruz und Faial und prägt die Landschaft dieser Küste wie kaum etwas anderes.`,
          task: `Eure Aufgabe: Sucht euch in Porto da Cruz einen Platz, von dem aus der Adlerfelsen zu sehen ist. Eine Person sammelt dort drei Steine und erklärt einen davon zum Adler, wegen seiner Form, Farbe oder anderer Merkmale. Die anderen beiden müssen erraten, welcher Stein der Adler ist. Liegen sie falsch, sucht die Person drei neue Steine.`
        }
      ]
    },
    {
      id: "santana", name: "Santana",
      quests: [
        {
          id: "q-san-1", title: `Meistert eine Sisyphus-Aufgabe`,
          location: `Wanderweg Pico do Areeiro – Pico Ruivo`, pin: [32.7593, -16.9425], maps: "Pico Ruivo, Madeira",
          desc: `Im Herzen der Insel ragen die höchsten Gipfel Madeiras auf: der Pico do Areeiro mit 1.818 Metern und der Pico Ruivo, mit 1.862 Metern der höchste Punkt der Insel. Verbunden sind sie durch die berühmteste Wanderung Madeiras, über schroffe Grate, durch Felstunnel und oft hoch über den Wolken.`,
          task: `Eure Aufgabe: Nehmt auf dem einen Gipfel einen Stein auf und tragt ihn bis auf den anderen, ohne dass dieser wieder runterrollt.`
        },
        {
          id: "q-san-2", title: `Dreieck auf Dreieck`,
          location: `Casas de Santana (Núcleo de Casas Típicas beim Rathaus von Santana)`, pin: [32.805, -16.88279], maps: "Casas Típicas de Santana",
          desc: `Die kleinen Häuser mit den strohgedeckten, dreieckigen Dächern sind das Wahrzeichen von Santana. Früher lebten darin Bauernfamilien, und das steile Dach, das fast bis zum Boden reicht, ließ den Regen des feuchten Nordens schnell ablaufen.`,
          task: `Eure Aufgabe: Baut vor einem der Dreieckshäuser ein Kartenhaus mit drei Stockwerken. Es muss mindestens 10 Sekunden stehen, ohne einzustürzen. Fällt es zusammen, baut ihr so lange neu, bis es klappt. Macht danach ein Foto von eurem Kartenhaus mit einem Dreieckshaus im Hintergrund.`
        },
        {
          id: "q-san-3", title: `Mit Lorbeeren und UNESCO gekrönt`,
          location: `Parque Florestal das Queimadas`, pin: [32.7835, -16.9050], maps: "Parque Florestal das Queimadas, Santana, Madeira",
          desc: `Im Waldpark Queimadas wächst Laurissilva, ein uralter Lorbeerwald, der seit 1999 als UNESCO-Welterbe geschützt ist. Solche Wälder bedeckten einst große Teile Südeuropas, heute gibt es sie fast nur noch auf den Atlantikinseln.`,
          task: `Eure Aufgabe: Um Welterbe zu werden, muss ein Ort mindestens eines von zehn Kriterien erfüllen. Der Lorbeerwald erfüllt zwei davon. Eine Person schlägt die Lösung auf der UNESCO-Seite zum Lorbeerwald nach, die anderen beiden müssen im Wald beide Kriterien richtig benennen. Liegen sie falsch, müssen sie 10 Minuten warten, bevor sie erneut raten dürfen.`
        }
      ]
    },
    {
      id: "saovicente", name: "São Vicente",
      quests: [
        {
          id: "q-svi-1", title: `Kapelle im Stein von Kapelle auf Stein`,
          location: `Kapelle Nossa Senhora de Fátima auf dem Hügel über São Vicente (Blick auf die Felsenkapelle Capela de São Vicente an der Flussmündung)`, pin: [32.7988, -17.0450], maps: "Capelinha de Nossa Senhora de Fátima, São Vicente, Madeira",
          desc: `An der Mündung des Flusses São Vicente steht eine kleine Kapelle, die in einen einzelnen Basaltblock hineingebaut ist. Sie wurde um 1694 an der Stelle errichtet, an der der Überlieferung nach der Märtyrer São Vicente erschien. Hoch über dem Ort thront eine zweite Kapelle in Form eines Turms: die Kapelle Nossa Senhora de Fátima.`,
          task: `Eure Aufgabe: Fotografiert von der Fátima-Kapelle auf dem Hügel aus die kleine Felsenkapelle unten an der Flussmündung.`
        },
        {
          id: "q-svi-2", title: `Höllen- oder wenig Verkehr`,
          location: `Brücke der Küstenstraße über die Ribeira do Inferno`, pin: [32.81119, -17.06569], maps: "Ribeira do Inferno",
          desc: `Die Ribeira do Inferno, der „Höllenbach", entspringt in den Bergen von São Vicente und bildet die Grenze zum Nachbarort Seixal. Er hat sich eine tiefe, enge Schlucht mit steilen Felswänden gegraben. Die Küstenstraße überwindet sie fast unsichtbar: aus einem Tunnel heraus, über eine Brücke und gleich wieder hinein in den Berg.`,
          task: `Eure Aufgabe: Sucht euch auf der Seite von São Vicente einen Platz mit Blick auf die Brücke. Schätzt gemeinsam, wie viele Autos innerhalb einer Minute über die Brücke fahren, und zählt dann nach. Liegt ihr höchstens ein Auto daneben, ist die Quest geschafft. Wenn nicht, schätzt ihr für die nächste Minute neu.`
        },
        {
          id: "q-svi-3", title: `Treibgutkreuz`,
          location: `Igreja Matriz / Kirche Bom Jesus in Ponta Delgada (São Vicente) an der Küste`, pin: [32.8287, -16.9856], maps: "Igreja do Senhor Bom Jesus, Ponta Delgada, Madeira",
          desc: `Der Legende nach fand ein Fischer in Ponta Delgada ein Kruzifix im Meer und brachte es ins Dorf, wo es verschwand und erst in einem Zuckerrohrfeld direkt am Meer wieder auftauchte. Die Bewohner deuteten das als Zeichen und bauten genau an dieser Stelle eine Kapelle, aus der die heutige Kirche wurde.`,
          task: `Eure Aufgabe: Baut am Ufer bei der Igreja Matriz da Ponta Delgada aus angespültem Treibgut ein Kreuz, das mindestens 30 Sekunden aufrecht stehen bleibt. Macht ein Foto mit dem Meer im Hintergrund.`
        }
      ]
    },
    {
      id: "portomoniz", name: "Porto Moniz",
      quests: [
        {
          id: "q-pmz-1", title: `Klopf, klopf am Fenster`,
          location: `Ilhéus da Ribeira da Janela (Mündung der Ribeira da Janela)`, pin: [32.85544, -17.15294], maps: "Miradouro Ilhéus da Ribeira da Janela",
          desc: `An der Mündung des längsten Flusses der Insel ragen bizarre Felsen aus dem Meer, die Ilhéus da Ribeira da Janela. Ihr Name, „Fenster", soll von einer Öffnung in einem der Felsen stammen, durch die man wie durch ein Fenster blicken kann.`,
          task: `Eure Aufgabe: Werft mit einem Stein vom Ufer aus einen der Felsen im Wasser ab. Trefft ihr, ist die Quest geschafft.`
        },
        {
          id: "q-pmz-2", title: `Gischt ins Gesicht`,
          location: `Naturpools (Piscinas Naturais) von Porto Moniz`, pin: [32.8682, -17.1705], maps: "Piscinas Naturais do Porto Moniz", mapsUrl: "https://maps.app.goo.gl/CRShE5G3Ngwnvs9s5",
          desc: `Die Naturpools sind das Wahrzeichen von Porto Moniz: Becken im schwarzen Vulkangestein, zusammen rund 3.800 m² groß, in die der Atlantik bei Flut hineinschwappt.`,
          task: `Eure Aufgabe: Geht im Becken bis an den äußeren Rand, wo die Wellen gegen das Gestein schlagen, und wartet, bis euch eine Welle Wasser ins Gesicht spritzt. Geschafft ist die Quest, wenn es jede von euch erwischt hat.`
        },
        {
          id: "q-pmz-3", title: `Baumstaben`,
          location: `Fanal (Lorbeerwald am Rand der Paul da Serra)`, pin: [32.8105, -17.1440], maps: "Fanal, Porto Moniz, Madeira",
          desc: `Fanal liegt auf rund 1.200 Metern am Rand der Hochebene Paul da Serra. Der Wald ist berühmt für seinen Nebel, der die jahrhundertealten Lorbeerbäume mit ihren verdrehten, bizarren Formen und die zwischen ihnen grasenden Kühe zu gespenstischen Gestalten macht.`,
          task: `Eure Aufgabe: Eine Person denkt sich ein Wort mit mindestens fünf Buchstaben aus und sucht für jeden Buchstaben einen Baum oder Ast, dessen Form ihn darstellt. Davon macht sie Fotos in der richtigen Reihenfolge. Die anderen beiden müssen anhand der Fotos das Wort erraten. Liegen sie falsch, denkt sich die Person ein neues Wort aus und macht neue Fotos.`
        }
      ]
    }
  ],

  // Stapel-Quests: überall machbar, keine Beschreibung, nur Titel und Aufgabe.
  stackQuests: [
    // Einfach (15 Punkte)
    { id: "s-e01", difficulty: "einfach", title: `Brisa-Pause`, task: `Trinkt eine Brisa, Madeiras eigene Limonade, am besten in der Sorte Maracuja.` },
    { id: "s-e02", difficulty: "einfach", title: `Knoblauchbrot`, task: `Esst Bolo do Caco, das typische Fladenbrot der Insel, mit Knoblauchbutter.` },
    { id: "s-e03", difficulty: "einfach", title: `Honigkuchen`, task: `Probiert Bolo de Mel, den dunklen Madeira-Kuchen aus Zuckerrohrhonig.` },
    { id: "s-e04", difficulty: "einfach", title: `Paradiesblume`, task: `Findet eine Strelitzie, die Paradiesvogelblume, und fotografiert sie.` },
    { id: "s-e05", difficulty: "einfach", title: `Obrigado`, task: `Bedankt euch bei drei verschiedenen Einheimischen auf Portugiesisch.` },
    { id: "s-e06", difficulty: "einfach", title: `Atlantik-Taufe`, task: `Badet alle drei im offenen Meer.` },
    { id: "s-e07", difficulty: "einfach", title: `Tunnelblick`, task: `Fahrt durch 10 unterschiedliche Tunnel.` },
    { id: "s-e08", difficulty: "einfach", title: `Gelbe Flotte`, task: `Fotografiert ein Taxi in Madeiras typischem Kanariengelb.` },
    { id: "s-e09", difficulty: "einfach", title: `Flagge zeigen`, task: `Macht ein Gruppenfoto mit der Flagge Madeiras, blau-gelb-blau mit rotem Kreuz.` },
    { id: "s-e10", difficulty: "einfach", title: `Fußdurchblutung`, task: `Geht alle drei ununterbrochen für 5 Minuten barfuß über einen Kieselstrand.` },

    // Mittel (25 Punkte)
    { id: "s-m01", difficulty: "mittel", title: `Steine-Profi`, task: `Lasst einen Stein mindestens zehnmal auf dem Wasser springen.` },
    { id: "s-m02", difficulty: "mittel", title: `Gipfelgruß`, task: `Macht ein Gruppenfoto an einem Ort, der höher als 1.000 Meter liegt.` },
    { id: "s-m03", difficulty: "mittel", title: `Levada-Spaziergang`, task: `Folgt irgendeiner Levada mindestens 30 Minuten lang.` },
    { id: "s-m04", difficulty: "mittel", title: `Kachelkunst`, task: `Findet ein Bild aus Azulejos, den blau bemalten Kacheln, mit dem Abbild von mindestens einer Person.` },
    { id: "s-m05", difficulty: "mittel", title: `Fotograph`, task: `Macht ein Foto von einer fremden Person oder Gruppe mit deren Kamera.` },
    { id: "s-m06", difficulty: "mittel", title: `Eidechsen-Safari`, task: `Fotografiert eine der Eidechsen, die überall auf Madeira in der Sonne liegen.` },
    { id: "s-m07", difficulty: "mittel", title: `Inselumriss`, task: `Findet die Umrisse Madeiras irgendwo abgebildet, auf einem Schild, Souvenir oder einer Karte, und macht ein Foto davon.` },
    { id: "s-m08", difficulty: "mittel", title: `Sprachensammler`, task: `Hört innerhalb einer Stunde fünf verschiedene Sprachen von anderen Menschen.` },
    { id: "s-m09", difficulty: "mittel", title: `Hängebrücke`, task: `Überquert zu Fuß eine Brücke über einen Fluss oder eine Schlucht, die nur für Fußgänger gebaut ist.` },
    { id: "s-m10", difficulty: "mittel", title: `Fischers Fang`, task: `Beobachtet, wie ein Fischerboot im Hafen seinen Fang an Land bringt.` },

    // Schwer (50 Punkte)
    { id: "s-s01", difficulty: "schwer", title: `Schrittmacher`, task: `Lauft an einem Tag jeder mindestens 20.000 Schritte.` },
    { id: "s-s02", difficulty: "schwer", title: `Meeresbewohner`, task: `Seht einen Delfin, Orca oder Wal vom Land oder vom Boot aus.` },
    { id: "s-s03", difficulty: "schwer", title: `Wine-Tasting`, task: `Probiert mindestens 3 verschiedene Weine in einer Stunde.` },
    { id: "s-s04", difficulty: "schwer", title: `Fünf auf einen Streich`, task: `Besucht an einem Tag fünf verschiedene Regionen des Spiels.` },
    { id: "s-s05", difficulty: "schwer", title: `Ups & Downs`, task: `Seid an einem Tag sowohl 1000 als auch -1 Meter über/unter dem Meeresspiegel.` },
    { id: "s-s06", difficulty: "schwer", title: `Wasserfall-Marathon`, task: `Seht an einem Tag mindestens zehn verschiedene Wasserfälle.` }
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
