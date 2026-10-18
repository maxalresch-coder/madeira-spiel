#!/usr/bin/env python3
"""Straßennetz für den Urlaubs-Rückblick (public/roads.js) aus einer OSRM-Route.

Eingabe: OSRM-Antwort (GeoJSON-Geometrie, Daten © OpenStreetMap-Mitwirkende) einer Rundfahrt
Calheta – Ponta do Sol – Ribeira Brava – Câmara de Lobos – Funchal – Santa Cruz – Machico – Santana – São Vicente –
Porto Moniz – Calheta plus Querungen (Ribeira Brava – São Vicente, Santana – Funchal).
Vorgehen: Die Gesamtlinie wird an den Wegpunkten in Teilstücke zerlegt; gleiche Wegpunkte sind gemeinsame Knoten.
Jede Region des Spiels (Mittelpunkt ihrer drei Quest-Pins) wird dem nächsten Wegpunkt zugeordnet. Für jedes Paar von
Regionen wird mit Dijkstra die kürzeste Verbindung über die Teilstücke berechnet. Die Teilstücke werden vereinfacht
(Ramer–Douglas–Peucker, ~40 m) und gespeichert; die Paare verweisen nur auf Teilstücke (kompakt).

Aufruf: python3 tools/strassen_netz.py madeira-route.json   → schreibt public/roads.js
"""
import heapq
import json
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOL_M = 40.0


def load_regions():
    """Regionen und Quest-Pins aus public/content.js (einfaches Auslesen, ohne JS-Ausführung)."""
    src = open(os.path.join(ROOT, "public", "content.js"), encoding="utf-8").read()
    regions = []
    for m in re.finditer(r'\{\s*id:\s*"([a-z]+)",\s*name:\s*`?"?([^`",]+)', src):
        regions.append((m.start(), m.group(1)))
    pins = [(m.start(), float(m.group(1)), float(m.group(2))) for m in re.finditer(r"pin:\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]", src)]
    out = {}
    for i, (pos, rid) in enumerate(regions):
        end = regions[i + 1][0] if i + 1 < len(regions) else len(src)
        ps = [(la, lo) for p, la, lo in pins if pos < p < end]
        if len(ps) == 3:
            out[rid] = ps
    return out


def meters(a, b):  # a, b = (lon, lat)
    k = 111320.0
    return math.hypot((b[0] - a[0]) * k * math.cos(math.radians((a[1] + b[1]) / 2)), (b[1] - a[1]) * k)


def rdp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    lat0 = math.radians(pts[0][1])
    xy = [(p[0] * 111320 * math.cos(lat0), p[1] * 111320) for p in pts]
    while stack:
        i, j = stack.pop()
        (x1, y1), (x2, y2) = xy[i], xy[j]
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy) or 1e-9
        best, bi = -1.0, -1
        for k in range(i + 1, j):
            d = abs(dy * (xy[k][0] - x1) - dx * (xy[k][1] - y1)) / L
            if d > best:
                best, bi = d, k
        if best > tol:
            keep[bi] = True
            stack += [(i, bi), (bi, j)]
    return [p for p, k in zip(pts, keep) if k]


def main(path):
    doc = json.load(open(path, encoding="utf-8"))
    if doc.get("code") != "Ok" or not doc.get("routes") or not doc.get("waypoints"):
        raise SystemExit("Keine gültige OSRM-Antwort.")
    coords = doc["routes"][0]["geometry"]["coordinates"]
    wps = [tuple(w["location"]) for w in doc["waypoints"]]
    legs = doc["routes"][0]["legs"]
    if len(legs) != len(wps) - 1 or len(coords) < 100:
        raise SystemExit("Route und Wegpunkte passen nicht zusammen.")
    # Gesamtlinie an den Wegpunkten zerlegen (der Reihe nach, jeweils nächster Punkt ab dem vorigen)
    idx, start = [], 0
    for w in wps:
        best = min(range(start, len(coords)), key=lambda i: meters(coords[i], w))
        if meters(coords[best], w) > 300:
            raise SystemExit("Wegpunkt %s liegt nicht auf der Route." % (w,))
        idx.append(best)
        start = best
    # Knoten = verschiedene Wegpunkte (gleiche Koordinaten = gemeinsamer Punkt)
    nodes, node_of = [], []
    for w in wps:
        found = next((n for n, q in enumerate(nodes) if meters(q, w) < 30), None)
        if found is None:
            nodes.append(w)
            found = len(nodes) - 1
        node_of.append(found)
    edges = []
    for k in range(len(legs)):
        seg = coords[idx[k]:idx[k + 1] + 1]
        length = sum(meters(seg[i], seg[i + 1]) for i in range(len(seg) - 1))
        if abs(length - legs[k]["distance"]) > max(800, 0.08 * legs[k]["distance"]):
            raise SystemExit("Teilstück %d: Länge %.0f m passt nicht zu OSRM %.0f m." % (k, length, legs[k]["distance"]))
        a, b = node_of[k], node_of[k + 1]
        if a != b:
            edges.append({"a": a, "b": b, "len": length, "pts": rdp(seg, TOL_M)})
    # Regionen dem nächsten Wegpunkt zuordnen
    regions = load_regions()
    if len(regions) != 10:
        raise SystemExit("Regionen in content.js nicht gefunden.")
    region_node = {}
    for rid, ps in regions.items():
        c = (sum(p[1] for p in ps) / 3, sum(p[0] for p in ps) / 3)
        region_node[rid] = min(range(len(nodes)), key=lambda n: meters(nodes[n], c))
    if len(set(region_node.values())) != 10:
        raise SystemExit("Zwei Regionen teilen sich einen Wegpunkt: %s" % region_node)
    # Kürzeste Wege (Dijkstra) zwischen allen Regions-Knoten
    adj = {}
    for e, ed in enumerate(edges):
        adj.setdefault(ed["a"], []).append((ed["b"], e, 1))
        adj.setdefault(ed["b"], []).append((ed["a"], e, -1))

    def shortest(s, t):
        dist, prev, pq = {s: 0.0}, {}, [(0.0, s)]
        while pq:
            d, u = heapq.heappop(pq)
            if u == t:
                break
            if d > dist.get(u, 1e18):
                continue
            for v, e, dr in adj.get(u, []):
                nd = d + edges[e]["len"]
                if nd < dist.get(v, 1e18):
                    dist[v], prev[v] = nd, (u, e, dr)
                    heapq.heappush(pq, (nd, v))
        if t not in dist:
            raise SystemExit("Keine Verbindung %s – %s." % (s, t))
        steps, u = [], t
        while u != s:
            p, e, dr = prev[u]
            steps.append([e, dr])
            u = p
        return steps[::-1], dist[t]

    ids = sorted(region_node)
    paths = {}
    for i, r1 in enumerate(ids):
        for r2 in ids[i + 1:]:
            steps, d = shortest(region_node[r1], region_node[r2])
            paths[r1 + "|" + r2] = steps
            print("%-12s – %-12s %5.1f km" % (r1, r2, d / 1000))
    out = {
        "source": "OSRM-Route, Daten © OpenStreetMap-Mitwirkende (ODbL)",
        "regions": {r: [round(nodes[n][1], 5), round(nodes[n][0], 5)] for r, n in region_node.items()},
        "edges": [[v for p in ed["pts"] for v in (round(p[1], 5), round(p[0], 5))] for ed in edges],  # lat, lon, lat, lon …
        "paths": paths,
    }
    js = ("// Straßennetz für den Urlaubs-Rückblick – erzeugt von tools/strassen_netz.py, nicht von Hand ändern.\n"
          "// Quelle: OSRM-Route, Daten © OpenStreetMap-Mitwirkende (ODbL). edges: [lat, lon, …] (vereinfacht ~40 m);\n"
          "// paths[\"regionA|regionB\"] (alphabetisch) = Teilstücke [Index, Richtung 1/−1] der kürzesten Verbindung.\n"
          "window.MADEIRA_ROADS = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
    target = os.path.join(ROOT, "public", "roads.js")
    open(target, "w", encoding="utf-8").write(js)
    print("Knoten:", len(nodes), "Teilstücke:", len(edges), "Punkte:", sum(len(e["pts"]) for e in edges), "→", target, len(js) // 1024, "KB")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "madeira-route.json"))
