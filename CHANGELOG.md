# Änderungen

Versionen nach [Semantic Versioning](https://semver.org/lang/de/): neue Funktion = mittlere Zahl, Fehlerbehebung = letzte Zahl.
Die Liste in der App steht in `src/app/version.ts`, die Versionsnummer in `package.json`.

**So kommt eine neue Version raus:** Version in `package.json` erhöhen, Eintrag hier und in `src/app/version.ts` ergänzen, auf `main` pushen. GitHub Actions testet, veröffentlicht die App und legt automatisch das Release `vX.Y.Z` mit diesen Notizen an. Fehlt der Eintrag hier, schlägt der Build fehl.

## 1.3.0 (13.10.2026)
- Jede Version wird automatisch als GitHub-Release veröffentlicht
- Chat-Leiste sitzt am iPhone tiefer

## 1.2.1 (13.10.2026)
- Versionsnummer ganz unten, antippen zeigt diese Liste
- Tagesbudget fürs Essen rechnet mit den restlichen Schultagen

## 1.2.0 (13.10.2026)
- Chat versteht Tippfehler, Beträge in Worten, Wochentage und Fragen
- Einträge per Chat ändern und löschen, Einstellungen per Chat
- Tankgutschein wird nicht mitgezählt
- Einträge antippen zum Bearbeiten, Suche und Filter
- Statistik, Schnell-Chips, Tagesbudget, Monatsrest aufs Sparbuch
- 6 Fehler behoben

## 1.1.1 (13.10.2026)
- Updates werden beim Öffnen automatisch geladen

## 1.1.0 (13.10.2026)
- Mehr Chat-Befehle: +/−, Sparbuch abheben, mehrere Einträge, rückgängig, hilfe

## 1.0.1 (13.10.2026)
- Überweisungen werden als Einnahme erkannt

## 1.0.0 (13.10.2026)
- Erste Version: Übersicht, Budgets, Mittagessen-Kalender, Ziele, Chat-Eingabe
