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

Mit „hilfe“ zeigt die App alle Befehle. Ein Datum geht mit „gestern“, „vorgestern“ oder „am 5.“.

| Eingabe | Ergebnis |
|---|---|
| `Döner 7,50`, `Mäcci 9,80`, `Billa 4,20`, `Red Bull 1,89` | Ausgabe Essen |
| `getankt 38`, `OMV 40` | Ausgabe Tanken |
| `Hoodie 35`, `Friseur 15`, `Barber 18` | Gewand, Friseur |
| `Kino 12`, `-12 Kino`, `12 ausgegeben` | Sonstiges |
| `Oma 20 geschenkt`, `Papa hat 30 überwiesen`, `+15 Pfand`, `Handy verkauft 80`, `Trinkgeld 5` | Einnahme |
| `50 aufs Sparbuch` | Wirklich aufs Sparbuch gelegt |
| `30 vom Sparbuch abgehoben` | Vom Sparbuch genommen |
| `heute kein Mittagessen`, `am 5. nicht gegessen` | Tag ohne Mittagessen |
| `11 Schultage` | Lange Schultage (Essensgeld) für den Monat |
| `Döner 7,50, getankt 30 und Oma 20 geschenkt` | Mehrere Einträge auf einmal |
| `rückgängig` | Letzten Eintrag löschen |

## Entwicklung

```bash
npm install
npm start          # http://localhost:4200
npx ng test        # Rechenlogik und Chat-Erkennung
```

Jeder Push auf `main` baut die App und veröffentlicht sie über GitHub Pages (Branch `gh-pages`).
