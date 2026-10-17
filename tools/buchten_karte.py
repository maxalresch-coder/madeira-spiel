#!/usr/bin/env python3
"""Erzeugt public/bay-map.js – Küstenkarte der Halbinsel Ponta de São Lourenço für „Bucht gesucht“ (Machico).

Quelle der Küstenlinie: CAOP (Carta Administrativa Oficial de Portugal, Direção-Geral do Território), Freguesia Caniçal,
als GeoJSON von github.com/nmota/caop_GeoJSON (geograficas/Madeira/MadeiraFreguesias.geojson). OpenStreetMap war in der
Arbeitsumgebung nicht erreichbar; die CAOP-Küste ist dort sehr fein (~8.800 Punkte nur für die Halbinsel).
Die Daten liegen danach lokal in bay-map.js – während des Spiels wird nichts abgefragt.

Aufruf:  python3 tools/buchten_karte.py <MadeiraFreguesias.geojson> [vorschau-ordner]
"""
import json, math, sys, os

W, E, S, N = -16.733, -16.6505, 32.7255, 32.7555     # Ausschnitt: ab Caniçal/Prainha bis zur Spitze inkl. Ilhéus
LAT0 = (S + N) / 2
KX = math.cos(math.radians(LAT0)) * 111320           # Meter je Grad Länge
KY = 110574                                          # Meter je Grad Breite
TOL = 1.6                                            # Vereinfachung in Metern – Buchten bleiben erhalten

def to_m(lon, lat):
    return ((lon - W) * KX, (N - lat) * KY)

MAP_W, MAP_H = to_m(E, S)

# Buchten: Name (nur echte Namen) und die beiden Landspitzen am Buchteingang (lon, lat). Nummern-Platz: siehe place_labels.
# Die Öffnung (Linie zwischen den Landspitzen) bestimmt die Drehung des Ausschnitts: Meer der Bucht oben, Land unten/seitlich.
BAYS = [
    # Nordküste, von West nach Ost
    (None, (-16.72766, 32.75161), (-16.72232, 32.74899)),   # weite Bucht östlich von Caniçal
    (None, (-16.71394, 32.74928), (-16.71004, 32.75190)),   # Bucht vor der Landzunge mit Felsen
    (None, (-16.68932, 32.75075), (-16.68820, 32.74756)),   # enger, tiefer Einschnitt nördlich der Abra
    (None, (-16.68019, 32.74415), (-16.68040, 32.74216)),   # kleine Einschnitte an der Ostflanke
    (None, (-16.67606, 32.73653), (-16.67191, 32.73596)),   # runde Bucht mit kleinen Inseln
    (None, (-16.66937, 32.73503), (-16.66897, 32.73438)),   # runde, fast geschlossene Bucht hinter einem Haken
    # Südküste, von Ost nach West
    (None, (-16.66865, 32.73031), (-16.66705, 32.73013)),   # Einschnitt kurz vor der Spitze
    ("Baía d'Abra", (-16.69744, 32.74117), (-16.68547, 32.74221)),  # große Bucht (32°44,734'N 16°41,684'W)
    ("Prainha", (-16.71418, 32.74051), (-16.71394, 32.74108)),      # kleiner Sandstrand hinter dem Damm
]

def clip(ring):  # Sutherland–Hodgman am Kartenrechteck (in Metern)
    def cut(pts, inside, inter):
        out = []
        for i in range(len(pts)):
            a, b = pts[i - 1], pts[i]
            if inside(b):
                if not inside(a): out.append(inter(a, b))
                out.append(b)
            elif inside(a): out.append(inter(a, b))
        return out
    def ix(a, b, x): t = (x - a[0]) / (b[0] - a[0]); return (x, a[1] + t * (b[1] - a[1]))
    def iy(a, b, y): t = (y - a[1]) / (b[1] - a[1]); return (a[0] + t * (b[0] - a[0]), y)
    pts = ring
    for inside, inter in [(lambda p: p[0] >= 0, lambda a, b: ix(a, b, 0)), (lambda p: p[0] <= MAP_W, lambda a, b: ix(a, b, MAP_W)),
                          (lambda p: p[1] >= 0, lambda a, b: iy(a, b, 0)), (lambda p: p[1] <= MAP_H, lambda a, b: iy(a, b, MAP_H))]:
        if not pts: break
        pts = cut(pts, inside, inter)
    return pts

def rdp(pts, tol):
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); (x1, y1), (x2, y2) = pts[a], pts[b]; dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1e-9
        best, bi = 0, -1
        for i in range(a + 1, b):
            d = abs(dy * (pts[i][0] - x1) - dx * (pts[i][1] - y1)) / L
            if d > best: best, bi = d, i
        if best > tol: keep[bi] = True; stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

def area(r): return abs(sum(r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1] for i in range(len(r)))) / 2

def main(src, preview=None):
    d = json.load(open(src, encoding="utf-8"))
    rings = []
    for f in d["features"]:
        if f["properties"].get("Freguesia") not in ("Caniçal", "Machico"): continue
        g = f["geometry"]; polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            r = [to_m(lon, lat) for lon, lat in poly[0]]
            if r[0] == r[-1]: r = r[:-1]
            r = clip(r)
            if len(r) < 3 or area(r) < 60: continue      # winzige Felsen weglassen
            k = max(range(len(r)), key=lambda i: (r[i][0] - r[0][0]) ** 2 + (r[i][1] - r[0][1]) ** 2)  # geschlossenen Ring teilen
            r = rdp(r[:k + 1], TOL)[:-1] + rdp(r[k:] + [r[0]], TOL)[:-1]
            if len(r) >= 3: rings.append(r)
    rings = [[(round(x), round(y)) for x, y in r] for r in rings]   # genau die Punkte, die auch angezeigt werden
    paths = ["M" + " ".join("%d,%d" % p for p in r) + "Z" for r in rings]
    bays = [bay_geometry(i, b, rings) for i, b in enumerate(BAYS)]
    view, label_r = place_labels(bays, rings)
    out = {"source": "Küstenlinie: CAOP (Direção-Geral do Território), Freguesia Caniçal, via github.com/nmota/caop_GeoJSON; vereinfacht auf ~%.1f m" % TOL,
           "w": round(MAP_W), "h": round(MAP_H), "view": view, "r": label_r, "land": paths, "bays": [{k: v for k, v in b.items() if not k.startswith("_")} for b in bays]}
    js = ("// Küstenkarte Ponta de São Lourenço für „Bucht gesucht“ – erzeugt mit tools/buchten_karte.py (nicht von Hand ändern).\n"
          "// " + out["source"] + ". Koordinaten in Metern (x nach Osten, y nach Süden).\n"
          "// Je Bucht: poly = Küste der Bucht von Landspitze zu Landspitze (mit Z geschlossen = Wasserfläche), isl = Inseln darin (Index in land),\n"
          "// rot = Drehung in Grad (Öffnung nach oben), d = Breite des sichtbaren Landstreifens, top = Schnittkante oberhalb der\n"
          "// Öffnung und box = Ausschnitt, beides im gedrehten System.\n"
          "window.BAY_MAP = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    target = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "bay-map.js")
    open(target, "w", encoding="utf-8").write(js)
    print("Ringe:", len(rings), "Punkte:", sum(len(r) for r in rings), "Datei:", len(js) // 1024, "KB", "Karte:", round(MAP_W), "x", round(MAP_H), "m")
    ok = True
    for b in bays:
        print("Bucht %d: Drehung %6.1f°, Küste %d Punkte, Inseln %d, Landstreifen %d m, Fehler (Land in der Bucht / Küste jenseits der Öffnung): %d"
              % (b["n"], b["rot"], len(b["_chain"]), len(b["isl"]), b["d"], b["_foreign"]))
        ok = ok and b["_foreign"] == 0
    print("Prüfung:", "Buchten sauber" if ok else "ACHTUNG: Öffnung führt über Land")
    if preview:
        from PIL import Image, ImageDraw
        os.makedirs(preview, exist_ok=True)
        vx, vy, vw, vh = view; s = 2000 / vw
        img = Image.new("RGB", (2000, int(vh * s)), (200, 225, 240)); dr = ImageDraw.Draw(img)
        P = lambda x, y: ((x - vx) * s, (y - vy) * s)
        for r in rings: dr.polygon([P(x, y) for x, y in r], fill=(230, 215, 180), outline=(60, 40, 20))
        for b in bays:
            dr.polygon([P(x, y) for x, y in b["_poly"]], fill=(150, 220, 160), outline=(0, 120, 0))
            dr.line([P(b["x"], b["y"]), P(b["tx"], b["ty"])], fill=(11, 95, 120), width=1)
            cx, cy = P(b["x"], b["y"]); rr = label_r * s
            dr.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(11, 95, 120)); dr.text((cx - 3, cy - 6), str(b["n"]), fill=(255, 255, 255))
            if b["name"]:
                x0, y0, x1, y1 = b["_namebox"]; dr.rectangle([P(x0, y0), P(x1, y1)], outline=(200, 0, 0)); dr.text(P(x0, y0), b["name"], fill=(0, 0, 0))
        img.save(os.path.join(preview, "uebersicht.png"))
        for b in bays: b["_img"].save(os.path.join(preview, "bucht%d.png" % b["n"]))

def place_labels(bays, rings, R=190, GAP=45):
    """Setzt jede Nummer ins offene Wasser vor ihre Bucht (Nordküste nach Norden, Südküste nach Süden) mit Linie zur Buchtmitte.
    Prüft: Nummer/Linie/Name berühren keine Küste, Insel oder andere Bucht und überlappen sich nicht. R = Radius der Nummer."""
    import numpy as np
    S = np.array([(*r[j - 1], *r[j]) for r in rings for j in range(len(r))], float)
    bay_close = [(b["_poly"][-1], b["_poly"][0]) for b in bays]          # Öffnungen (Grenze der Wasserflächen zum Meer)
    def seg_dist(p, A):                                                  # Abstand Punkt → viele Strecken
        ax, ay, bx, by = A.T; dx, dy = bx - ax, by - ay; L = dx * dx + dy * dy + 1e-9
        t = np.clip(((p[0] - ax) * dx + (p[1] - ay) * dy) / L, 0, 1)
        return np.hypot(ax + t * dx - p[0], ay + t * dy - p[1])
    def crosses(p, q, A):                                                # schneidet Strecke p–q eine der Strecken?
        ax, ay, bx, by = A.T
        d1 = (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax); d2 = (bx - ax) * (q[1] - ay) - (by - ay) * (q[0] - ax)
        d3 = (q[0] - p[0]) * (ay - p[1]) - (q[1] - p[1]) * (ax - p[0]); d4 = (q[0] - p[0]) * (by - p[1]) - (q[1] - p[1]) * (bx - p[0])
        return bool(np.any((d1 * d2 < 0) & (d3 * d4 < 0)))
    def pt_seg(p, a, b): return float(seg_dist(p, np.array([[*a, *b]], float))[0])
    def seg_seg(p, q, a, b): return crosses(p, q, np.array([[*a, *b]], float))
    def on_land(p): return any(inside(p, r) for r in rings if min(x for x, _ in r) <= p[0] <= max(x for x, _ in r))
    def in_bay(p): return any(inside(p, b["_poly"]) for b in bays)
    def free(p, clear):                                                  # Wasser, weit genug von Küste und Buchten
        if seg_dist(p, S).min() < clear or on_land(p) or in_bay(p): return False
        return all(pt_seg(p, a, b) >= clear for a, b in bay_close)
    # Ziel der Linie: Punkt in der Bucht, möglichst weit von der Küste und von der Öffnungsmitte aus frei sichtbar
    for b in bays:
        poly = b["_poly"]; A, B = poly[0], poly[-1]; m = ((A[0] + B[0]) / 2, (A[1] + B[1]) / 2)
        E = np.array([(*poly[j - 1], *poly[j]) for j in range(len(poly))], float)
        xs = [p[0] for p in poly]; ys = [p[1] for p in poly]; st = max(3, max(max(xs) - min(xs), max(ys) - min(ys)) / 60)
        best, bd = m, -1
        for gx in np.arange(min(xs), max(xs), st):
            for gy in np.arange(min(ys), max(ys), st):
                p = (gx, gy)
                if not inside(p, poly) or any(inside(p, rings[k]) for k in b["isl"]): continue
                dd = seg_dist(p, E).min()
                if dd > bd and not crosses(m, p, S): best, bd = p, dd
        b["tx"], b["ty"] = round(best[0]), round(best[1]); b["_m"] = m
    # Kandidaten je Bucht: Kreis frei im Wasser, auf der richtigen Seite, Linie zur Mitte kreuzt keine Küste/Bucht
    cands = []
    for b in bays:
        north = b["n"] <= 6; t = (b["tx"], b["ty"]); m = b["_m"]; out = []
        for ang in range(0, 360, 4):
            u = (math.cos(math.radians(ang)), math.sin(math.radians(ang)))
            for dist in range(R + GAP, 1800, 30):
                p = (m[0] + u[0] * dist, m[1] + u[1] * dist)
                if (p[1] >= t[1] - R) if north else (p[1] <= t[1] + R): continue
                if not (R + 60 <= p[0] <= MAP_W + 400 and -1000 <= p[1] <= MAP_H + 1000): continue
                if not free(p, R + GAP): continue
                if crosses(p, t, S) or any(seg_seg(p, t, a, c) for k, (a, c) in enumerate(bay_close) if bays[k] is not b): continue
                if seg_dist(t, S).min() < 2: continue
                L = math.dist(p, t); out.append((L + 0.3 * abs(dist - (R + GAP + 120)), p)); break   # je Richtung der nächste freie Platz
        out.sort(key=lambda c: c[0]); cands.append([p for _, p in out[:40]])
        assert out, "Bucht %d: kein Platz für die Nummer" % b["n"]
    order = sorted(range(len(bays)), key=lambda i: len(cands[i]))
    chosen = {}
    def ok(i, p):
        ti = (bays[i]["tx"], bays[i]["ty"])
        for j, q in chosen.items():
            tj = (bays[j]["tx"], bays[j]["ty"])
            if math.dist(p, q) < 2 * R + 70: return False
            if pt_seg(q, p, ti) < R + 30 or pt_seg(p, q, tj) < R + 30: return False
            if seg_seg(p, ti, q, tj): return False
        return True
    def dfs(k):
        if k == len(order): return True
        i = order[k]
        for p in cands[i]:
            if ok(i, p):
                chosen[i] = p
                if dfs(k + 1): return True
                del chosen[i]
        return False
    assert dfs(0), "Keine überlappungsfreie Anordnung der Nummern gefunden"
    for i, b in enumerate(bays): b["x"], b["y"] = round(chosen[i][0]), round(chosen[i][1])
    # Namen (nur echte) neben die Nummer ins Wasser, ohne Küste, Nummern oder Linien zu berühren
    FS = R * 1.05
    def box_ok(x0, y0, x1, y1, own):
        pts = [(x, y) for x in np.linspace(x0, x1, 12) for y in np.linspace(y0, y1, 4)]
        if any(not free(p, 25) for p in pts): return False
        for j, b in enumerate(bays):
            c = (b["x"], b["y"]); t = (b["tx"], b["ty"])
            if any(math.dist(p, c) < R + 20 for p in pts): return False
            if any(pt_seg(p, c, t) < 20 for p in pts): return False
            if j != own and "_namebox" in b:
                X0, Y0, X1, Y1 = b["_namebox"]
                if not (x1 < X0 or X1 < x0 or y1 < Y0 or Y1 < y0): return False
        return True
    for i, b in enumerate(bays):
        if not b["name"]: continue
        w = len(b["name"]) * FS * 0.58; x, y = b["x"], b["y"]
        for anchor, x0, yb in [("start", x + R * 1.3, y + FS * 0.35), ("end", x - R * 1.3 - w, y + FS * 0.35),
                               ("middle", x - w / 2, y + R + FS * 1.1), ("middle", x - w / 2, y - R - FS * 0.4)]:
            box = (x0, yb - FS * 0.85, x0 + w, yb + FS * 0.25)
            if box_ok(*box, i):
                b["_namebox"] = box; b["nx"] = round(x0 if anchor == "start" else x0 + w if anchor == "end" else x0 + w / 2)
                b["ny"] = round(yb); b["na"] = anchor; break
        assert "na" in b, "Kein Platz für den Namen %s" % b["name"]
    xs = [0, MAP_W] + [b["x"] - R for b in bays] + [b["x"] + R for b in bays] + [v for b in bays if "_namebox" in b for v in b["_namebox"][::2]]
    ys = [0, MAP_H] + [b["y"] - R for b in bays] + [b["y"] + R for b in bays] + [v for b in bays if "_namebox" in b for v in b["_namebox"][1::2]]
    x0, y0 = max(0, min(xs) - 60), min(ys) - 60
    view = [round(x0), round(y0), round(max(xs) + 60 - x0), round(max(ys) + 60 - y0)]
    for b in bays:
        print("Nummer %d: Platz (%d, %d), Linie %d m zur Buchtmitte%s" % (b["n"], b["x"], b["y"], math.dist((b["x"], b["y"]), (b["tx"], b["ty"])),
              ", Name " + b["na"] if b["name"] else ""))
    return view, R

def inside(pt, poly):
    x, y = pt; c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i - 1], poly[i]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c

def bay_geometry(i, bay, rings, px=400):
    """Wasserfläche, Inseln, Drehung und Ausschnitt einer Bucht; prüft per Raster, dass keine fremde Küste sichtbar ist."""
    from PIL import Image, ImageDraw, ImageChops
    name, ha, hb = bay
    A, B = to_m(*ha), to_m(*hb)
    def nearest(p):
        return min(((ri, vi) for ri, r in enumerate(rings) for vi in range(len(r))),
                   key=lambda t: (rings[t[0]][t[1]][0] - p[0]) ** 2 + (rings[t[0]][t[1]][1] - p[1]) ** 2)
    (ra, ia), (rb, ib) = nearest(A), nearest(B)
    assert ra == rb, "Landspitzen von Bucht %d liegen nicht auf derselben Küste" % (i + 1)
    r = rings[ra]; n = len(r)
    fwd = [r[(ia + k) % n] for k in range((ib - ia) % n + 1)]            # Küste A → B in beide Richtungen; die kürzere ist die Bucht
    bwd = [r[(ia - k) % n] for k in range((ia - ib) % n + 1)]
    length = lambda c: sum(math.dist(c[k], c[k + 1]) for k in range(len(c) - 1))
    chain = fwd if length(fwd) < length(bwd) else bwd
    # Öffnung genau an die äußersten Landspitzen legen: ragt Küste über die Linie hinaus, wird dieser Punkt zur Landspitze
    while True:
        A, B = chain[0], chain[-1]
        cx, cy = sum(p[0] for p in chain) / len(chain), sum(p[1] for p in chain) / len(chain)
        nx, ny = -(B[1] - A[1]), B[0] - A[0]; L = math.hypot(nx, ny) or 1
        if nx * (cx - A[0]) + ny * (cy - A[1]) > 0: nx, ny = -nx, -ny
        out = [((p[0] - A[0]) * nx + (p[1] - A[1]) * ny) / L for p in chain]
        j = max(range(len(chain)), key=lambda t: out[t])
        if out[j] <= 0.5: break
        chain = chain[j:] if j < len(chain) / 2 else chain[:j + 1]
    poly = chain                                                         # geschlossen durch die Öffnung B → A
    isl = [k for k, rr in enumerate(rings) if k != ra and any(inside(p, poly) for p in rr)]   # Inseln ganz oder teilweise in der Bucht
    # Drehung: Normale der Öffnung, die vom Buchtinneren weg zeigt, soll nach oben (−y) zeigen. Nur Drehung, keine Spiegelung.
    mx, my = (A[0] + B[0]) / 2, (A[1] + B[1]) / 2
    cx, cy = sum(p[0] for p in chain) / len(chain), sum(p[1] for p in chain) / len(chain)
    nx, ny = -(B[1] - A[1]), B[0] - A[0]
    if nx * (cx - mx) + ny * (cy - my) > 0: nx, ny = -nx, -ny
    rot = -90 - math.degrees(math.atan2(ny, nx))
    rot = round((rot + 180) % 360 - 180, 2)                              # so gespeichert, so gerechnet
    t = math.radians(rot); cs, sn = math.cos(t), math.sin(t)
    R = lambda p: (p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs)
    pr = [R(p) for p in poly]
    ir = [[R(p) for p in rings[k]] for k in isl]
    xs = [p[0] for p in pr]; ys = [p[1] for p in pr]
    size = max(max(xs) - min(xs), max(ys) - min(ys))
    d = round(min(50, max(15, size * 0.06)))                             # schmaler Landstreifen entlang der Buchtküste
    y_open = R(A)[1]                                                     # Öffnung liegt nach der Drehung waagrecht oben
    top = y_open
    allx = xs + [p[0] for q in ir for p in q]; ally = ys + [p[1] for q in ir for p in q]
    x0, x1 = min(allx) - d, max(allx) + d
    y0 = top; y1 = max(ally) + d                                       # oberhalb der Öffnung wird alles abgeschnitten
    pad = 0.02 * max(x1 - x0, y1 - y0)
    box = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad]
    # Prüfung: Liegt außer den Inseln Land in der Wasserfläche (z. B. weil die Öffnung über Land führt), wäre der Ausschnitt falsch.
    chain_set = set(chain)
    foreign = sum(1 for rk, rr in enumerate(rings) if rk not in isl for p in rr if p not in chain_set and inside(p, poly))
    # Vorschau genau wie in der App: gleichmäßiger Landstreifen (Breite d) entlang der Buchtküste, Wasser der Bucht, Küstenlinie,
    # Inseln; alles oberhalb der Öffnung abgeschnitten (außer Inseln). Grau = unsichtbar.
    k = px / max(box[2], box[3]); Wp, Hp = int(box[2] * k) + 2, int(box[3] * k) + 2
    T = lambda p: ((p[0] - box[0]) * k, (p[1] - box[1]) * k)
    img = Image.new("RGB", (Wp, Hp), (225, 225, 225)); dr = ImageDraw.Draw(img)
    q = [T(p) for p in pr]; rad = d * k
    dr.line(q + [q[0]], fill=(230, 215, 180), width=int(2 * rad), joint="curve")
    for x, y in q: dr.ellipse([x - rad, y - rad, x + rad, y + rad], fill=(230, 215, 180))
    dr.polygon(q, fill=(200, 225, 240))
    dr.line(q, fill=(90, 60, 30), width=2)
    for qq in ir: dr.polygon([T(p) for p in qq], fill=(230, 215, 180), outline=(90, 60, 30))
    dr.rectangle([0, 0, Wp, (top - box[1]) * k], fill=(225, 225, 225))
    dr.text((4, 4), "Bucht %d  Drehung %.1f" % (i + 1, rot), fill=(0, 0, 0))
    above = sum(1 for p in pr if p[1] < top - 1)                         # Küste jenseits der Öffnung würde abgeschnitten
    nforeign = foreign + above
    rd = lambda v: round(v, 1)
    return {"id": "b%d" % (i + 1), "n": i + 1, "name": name,
            "poly": "M" + " ".join("%d,%d" % p for p in poly), "isl": isl, "rot": rot, "d": d, "top": rd(top),
            "box": [rd(v) for v in box], "_chain": chain, "_poly": poly, "_foreign": nforeign, "_img": img}

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
