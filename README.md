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

Schreib einfach, was passiert ist. Mit „hilfe“ zeigt die App alle Befehle. Sie versteht Tippfehler, Beträge wie „zehn euro“ oder „ein fünfer“ und Datumsangaben wie „gestern“, „am montag“, „am 5.“ oder „vor 3 tagen“.

| Eingabe | Ergebnis |
|---|---|
| `Döner 7,50`, `mäcces 9`, `Billa 4,20`, `Red Bull 1,89` | Ausgabe Essen |
| `getankt 38`, `40 getankt mit 20 Gutschein` | Ausgabe Tanken (Gutschein zählt nicht) |
| `Hoodie 35`, `Friseur 15`, `-12 Kino` | Gewand, Friseur, Sonstiges |
| `Oma 20 geschenkt`, `Papa hat 30 überwiesen`, `+15 Pfand` | Einnahme |
| `50 aufs Sparbuch`, `30 vom Sparbuch abgehoben` | Sparbuch |
| `heute kein Mittagessen`, `mo und di kein mittag`, `doch gegessen` | Tage ohne Mittagessen |
| `Wie viel hab ich noch?`, `Wie viel für Essen übrig?`, `Kann ich mir 30 € leisten?` | Antwort statt Buchung |
| `rückgängig`, `letzten auf 8 ändern`, `Döner war 8`, `lösch den Döner` | Ändern und Löschen |
| `Essensbudget 70`, `Taschengeld 260`, `Sparziel 2000`, `Sparbuch Stand 340` | Einstellungen |
| `Döner 7,50, getankt 30 und Oma 20 geschenkt` | Mehrere Einträge auf einmal |

## Entwicklung

```bash
npm install
npm start          # http://localhost:4200
npx ng test        # Rechenlogik und Chat-Erkennung
```

Jeder Push auf `main` baut die App und veröffentlicht sie über GitHub Pages (Branch `gh-pages`).
