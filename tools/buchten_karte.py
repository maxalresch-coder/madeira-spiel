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

# Buchten: Nummer, Name (nur echte Namen), Markierung (lon, lat) in der Bucht und Zoom-Ausschnitt (lon/lat-Rechteck)
BAYS = [
    # Nordküste, von West nach Ost
    (None, (-16.7246, 32.7493), (-16.7290, 32.7465, -16.7195, 32.7515)),   # weite Bucht östlich von Caniçal
    (None, (-16.7122, 32.7502), (-16.7165, 32.7475, -16.7075, 32.7530)),   # Bucht vor der Landzunge mit Felsen
    (None, (-16.6897, 32.7505), (-16.6945, 32.7450, -16.6850, 32.7545)),   # enger, tiefer Einschnitt nördlich der Abra
    (None, (-16.6788, 32.7423), (-16.6845, 32.7395, -16.6755, 32.7450)),   # kleine Einschnitte an der Ostflanke
    (None, (-16.6737, 32.7362), (-16.6790, 32.7330, -16.6690, 32.7390)),   # runde Bucht mit kleinen Inseln
    # Südküste, von Ost nach West
    (None, (-16.6672, 32.7306), (-16.6720, 32.7280, -16.6630, 32.7335)),   # Einschnitt kurz vor der Spitze
    (None, (-16.6811, 32.7378), (-16.6860, 32.7350, -16.6765, 32.7410)),   # Einschnitt hinter dem schmalen Sporn
    ("Baía d'Abra", (-16.6935, 32.7438), (-16.7015, 32.7385, -16.6835, 32.7500)),  # große Bucht (32°44,734'N 16°41,684'W)
    ("Prainha", (-16.7126, 32.7416), (-16.7170, 32.7380, -16.7075, 32.7440)),      # kleiner Sandstrand hinter dem Damm
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
    paths = ["M" + " ".join("%d,%d" % (round(x), round(y)) for x, y in r) + "Z" for r in rings]
    bays = []
    for i, (name, mark, view) in enumerate(BAYS):
        x0, y0 = to_m(view[0], view[3]); x1, y1 = to_m(view[2], view[1])
        mx, my = to_m(*mark)
        bays.append({"id": "b%d" % (i + 1), "n": i + 1, "name": name, "x": round(mx), "y": round(my),
                     "view": [round(x0), round(y0), round(x1 - x0), round(y1 - y0)]})
    out = {"source": "Küstenlinie: CAOP (Direção-Geral do Território), Freguesia Caniçal, via github.com/nmota/caop_GeoJSON; vereinfacht auf ~%.1f m" % TOL,
           "w": round(MAP_W), "h": round(MAP_H), "land": paths, "bays": bays}
    js = ("// Küstenkarte Ponta de São Lourenço für „Bucht gesucht“ – erzeugt mit tools/buchten_karte.py (nicht von Hand ändern).\n"
          "// " + out["source"] + ". Koordinaten in Metern (x nach Osten, y nach Süden).\n"
          "window.BAY_MAP = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    target = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "bay-map.js")
    open(target, "w", encoding="utf-8").write(js)
    print("Ringe:", len(rings), "Punkte:", sum(len(r) for r in rings), "Datei:", len(js) // 1024, "KB", "Karte:", round(MAP_W), "x", round(MAP_H), "m")
    if preview:
        from PIL import Image, ImageDraw
        os.makedirs(preview, exist_ok=True)
        def render(vx, vy, vw, vh, W_, marks):
            s = W_ / vw; img = Image.new("RGB", (W_, int(vh * s)), (200, 225, 240)); dr = ImageDraw.Draw(img)
            for r in rings: dr.polygon([((x - vx) * s, (y - vy) * s) for x, y in r], fill=(230, 215, 180), outline=(60, 40, 20))
            for b in marks:
                cx, cy = (b["x"] - vx) * s, (b["y"] - vy) * s
                dr.ellipse([cx - 11, cy - 11, cx + 11, cy + 11], fill=(11, 95, 120)); dr.text((cx - 4, cy - 6), str(b["n"]), fill=(255, 255, 255))
                if b["name"]: dr.text((cx + 13, cy - 6), b["name"], fill=(0, 0, 0))
            return img
        img = render(0, 0, MAP_W, MAP_H, 1600, bays)
        for b in bays:
            vx, vy, vw, vh = b["view"]
            dr = ImageDraw.Draw(img); s = 1600 / MAP_W
            dr.rectangle([vx * s, vy * s, (vx + vw) * s, (vy + vh) * s], outline=(200, 0, 0))
        img.save(os.path.join(preview, "uebersicht.png"))
        for b in bays: render(*b["view"], 500, []).save(os.path.join(preview, "bucht%d.png" % b["n"]))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
