#!/usr/bin/env python3
"""Verkleinert die Quest-Bilder in public/images/quests/ auf ca. 1.200 Pixel Breite
und unter 300 KB und speichert sie als <Quest-ID>.jpg.

Benutzung (z. B. in der Bash-Konsole auf PythonAnywhere):
    cd ~/madeira-spiel && python3 tools/bilder_verkleinern.py

- Erlaubte Eingaben: q-cal-1.jpg, q-cal-1.JPG, q-cal-1.jpeg, q-cal-1.png, q-cal-1.webp …
- Ergebnis: q-cal-1.jpg (passende Bilder werden nicht angefasst)
- Originale, die verändert wurden, landen in public/images/quests/originale/
Braucht Pillow (auf PythonAnywhere schon installiert; sonst: pip install Pillow).
"""
import io
import os
import re
import shutil
import sys

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow fehlt. Installieren mit:  pip3 install --user Pillow")

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOLDER = os.path.join(BASE, "public", "images", "quests")
ORIG = os.path.join(FOLDER, "originale")
MAX_WIDTH = 1200
MAX_BYTES = 300 * 1024
EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff")


def quest_ids():
    with open(os.path.join(BASE, "public", "content.js"), encoding="utf-8") as f:
        return set(re.findall(r'id: "(q-[a-z]+-\d)"', f.read()))


def encode(img, quality):
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def main():
    ids = quest_ids()
    done = 0
    for name in sorted(os.listdir(FOLDER)):
        path = os.path.join(FOLDER, name)
        stem, ext = os.path.splitext(name)
        if not os.path.isfile(path) or ext.lower() not in EXTS:
            continue
        qid = stem.lower()
        if qid not in ids:
            print(f"⚠  {name}: unbekannter Name – erwartet z. B. q-cal-1.jpg (siehe README.md)")
            continue
        target = os.path.join(FOLDER, qid + ".jpg")
        size = os.path.getsize(path)
        with Image.open(path) as im:
            width = im.width
            if name == qid + ".jpg" and width <= MAX_WIDTH and size <= MAX_BYTES:
                print(f"✓  {name}: passt schon ({width} px, {size // 1024} KB)")
                continue
            img = ImageOps.exif_transpose(im).convert("RGB")  # Handy-Drehung übernehmen
        if img.width > MAX_WIDTH:
            img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)), Image.LANCZOS)
        data = b""
        for quality in (85, 80, 75, 70, 65, 60, 55, 50):
            data = encode(img, quality)
            if len(data) <= MAX_BYTES:
                break
        os.makedirs(ORIG, exist_ok=True)
        shutil.move(path, os.path.join(ORIG, name))
        with open(target, "wb") as f:
            f.write(data)
        print(f"→  {name}: {width} px, {size // 1024} KB  ⇒  {qid}.jpg: {img.width} px, {len(data) // 1024} KB")
        done += 1
    missing = sorted(i for i in ids if not os.path.exists(os.path.join(FOLDER, i + ".jpg")))
    print(f"\nFertig: {done} Bild(er) verkleinert. Ohne Bild: {len(missing)} von {len(ids)} Quests.")


if __name__ == "__main__":
    main()
