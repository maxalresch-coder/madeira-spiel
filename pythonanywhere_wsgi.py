# Vorlage für die WSGI-Datei auf PythonAnywhere (siehe ANLEITUNG.md).
# Inhalt in die Datei unter "Web" -> "WSGI configuration file" kopieren
# und die drei Werte unten anpassen.
import os
import sys

PROJECT = "/home/DEIN_BENUTZERNAME/madeira-spiel"   # <- anpassen
os.environ["MADEIRA_PASSWORD"] = "euer-passwort"      # <- anpassen
os.environ["MADEIRA_LINK_KEY"] = "langer-zufaelliger-teil"  # <- anpassen (nur Buchstaben/Zahlen)

if PROJECT not in sys.path:
    sys.path.insert(0, PROJECT)

from server import application  # noqa: E402,F401
