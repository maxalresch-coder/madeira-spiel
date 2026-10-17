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

# Buchten: Name (nur echte Namen), Markierung (lon, lat) in der Bucht und die beiden Landspitzen am Buchteingang (lon, lat).
# Die Öffnung (Linie zwischen den Landspitzen) bestimmt die Drehung des Ausschnitts: Meer der Bucht oben, Land unten/seitlich.
BAYS = [
    # Nordküste, von West nach Ost
    (None, (-16.7246, 32.7493), (-16.72766, 32.75161), (-16.72232, 32.74899)),   # weite Bucht östlich von Caniçal
    (None, (-16.7122, 32.7502), (-16.71394, 32.74928), (-16.71004, 32.75190)),   # Bucht vor der Landzunge mit Felsen
    (None, (-16.6897, 32.7505), (-16.68932, 32.75075), (-16.68820, 32.74756)),   # enger, tiefer Einschnitt nördlich der Abra
    (None, (-16.6788, 32.7423), (-16.68019, 32.74415), (-16.68040, 32.74216)),   # kleine Einschnitte an der Ostflanke
    (None, (-16.6737, 32.7362), (-16.67606, 32.73653), (-16.67191, 32.73596)),   # runde Bucht mit kleinen Inseln
    (None, (-16.66999, 32.73411), (-16.66937, 32.73503), (-16.66897, 32.73438)),   # runde, fast geschlossene Bucht hinter einem Haken
    # Südküste, von Ost nach West
    (None, (-16.6672, 32.7306), (-16.66865, 32.73031), (-16.66705, 32.73013)),   # Einschnitt kurz vor der Spitze
    ("Baía d'Abra", (-16.6935, 32.7438), (-16.69744, 32.74117), (-16.68547, 32.74221)),  # große Bucht (32°44,734'N 16°41,684'W)
    ("Prainha", (-16.7126, 32.7416), (-16.71418, 32.74051), (-16.71394, 32.74108)),      # kleiner Sandstrand hinter dem Damm
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
    out = {"source": "Küstenlinie: CAOP (Direção-Geral do Território), Freguesia Caniçal, via github.com/nmota/caop_GeoJSON; vereinfacht auf ~%.1f m" % TOL,
           "w": round(MAP_W), "h": round(MAP_H), "land": paths, "bays": [{k: v for k, v in b.items() if not k.startswith("_")} for b in bays]}
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
        s = 1600 / MAP_W; img = Image.new("RGB", (1600, int(MAP_H * s)), (200, 225, 240)); dr = ImageDraw.Draw(img)
        for r in rings: dr.polygon([(x * s, y * s) for x, y in r], fill=(230, 215, 180), outline=(60, 40, 20))
        for b in bays:
            dr.polygon([(x * s, y * s) for x, y in b["_poly"]], fill=(150, 220, 160), outline=(0, 120, 0))
            dr.text((b["x"] * s - 4, b["y"] * s - 6), str(b["n"]), fill=(0, 0, 0))
        img.save(os.path.join(preview, "uebersicht.png"))
        for b in bays: b["_img"].save(os.path.join(preview, "bucht%d.png" % b["n"]))

def inside(pt, poly):
    x, y = pt; c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i - 1], poly[i]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c

def bay_geometry(i, bay, rings, px=400):
    """Wasserfläche, Inseln, Drehung und Ausschnitt einer Bucht; prüft per Raster, dass keine fremde Küste sichtbar ist."""
    from PIL import Image, ImageDraw, ImageChops
    name, mark, ha, hb = bay
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
    mx_, my_ = to_m(*mark)
    rd = lambda v: round(v, 1)
    return {"id": "b%d" % (i + 1), "n": i + 1, "name": name, "x": round(mx_), "y": round(my_),
            "poly": "M" + " ".join("%d,%d" % p for p in poly), "isl": isl, "rot": rot, "d": d, "top": rd(top),
            "box": [rd(v) for v in box], "_chain": chain, "_poly": poly, "_foreign": nforeign, "_img": img}

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
