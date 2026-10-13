# Finanzen

Persönliche Finanzen-App im ChatGPT-Stil: Taschengeld, Essensgeld, Fixkosten, Budgets, Tage ohne Mittagessen, Sparbuch und Ziele.
Läuft komplett offline im Browser, ohne Server. Alle Daten bleiben lokal auf dem Gerät.

## Installieren

**iPhone:** Die App-Adresse in Safari öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.
**Mac:** Die App-Adresse in Safari öffnen → Menü „Ablage“ → „Zum Dock hinzufügen“.

Danach funktioniert die App auch ohne Internet.

## Daten zwischen iPhone und Mac übertragen

Einstellungen → „Exportieren“ speichert eine JSON-Datei (z. B. in iCloud Drive oder per AirDrop).
Auf dem anderen Gerät Einstellungen → „Importieren“.

## Eingabe im Chat

| Eingabe | Ergebnis |
|---|---|
| `Döner 7,50`, `Mäcci 9,80`, `Billa 4,20` | Ausgabe Essen |
| `tanken 38` | Ausgabe Tanken |
| `Gewand 35`, `Friseur 15`, `Kino 12` | Gewand, Friseur, Sonstiges |
| `Oma 20 geschenkt`, `50 bekommen` | Einnahme |
| `50 aufs Sparbuch` | Wirklich aufs Sparbuch gelegt |
| `heute kein Mittagessen`, `gestern nicht gegessen`, `am 5. kein Mittag` | Tag ohne Mittagessen |
| `11 Schultage` | Lange Schultage (Essensgeld) für den Monat |

## Entwicklung

```bash
npm install
npm start          # http://localhost:4200
npx ng test        # Rechenlogik und Chat-Erkennung
```

Jeder Push auf `main` baut die App und veröffentlicht sie über GitHub Pages (Branch `gh-pages`).
