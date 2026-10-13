import pkg from '../../package.json';

/** Aktuelle Version, kommt aus package.json. Bei jeder Änderung dort und im CHANGELOG erhöhen. */
export const VERSION: string = pkg.version;

export interface Release {
  version: string;
  date: string;
  changes: string[];
}

/** Neueste Version zuerst. Spiegelt CHANGELOG.md. */
export const RELEASES: Release[] = [
  {
    version: '1.2.1',
    date: '13.10.2026',
    changes: ['Versionsnummer ganz unten, antippen zeigt diese Liste', 'Tagesbudget fürs Essen rechnet mit den restlichen Schultagen'],
  },
  {
    version: '1.2.0',
    date: '13.10.2026',
    changes: [
      'Chat versteht Tippfehler, Beträge in Worten, Wochentage und Fragen',
      'Einträge per Chat ändern und löschen, Einstellungen per Chat',
      'Tankgutschein wird nicht mitgezählt',
      'Einträge antippen zum Bearbeiten, Suche und Filter',
      'Statistik, Schnell-Chips, Tagesbudget, Monatsrest aufs Sparbuch',
      '6 Fehler behoben',
    ],
  },
  {
    version: '1.1.1',
    date: '13.10.2026',
    changes: ['Updates werden beim Öffnen automatisch geladen'],
  },
  {
    version: '1.1.0',
    date: '13.10.2026',
    changes: ['Mehr Chat-Befehle: +/−, Sparbuch abheben, mehrere Einträge, rückgängig, hilfe'],
  },
  {
    version: '1.0.1',
    date: '13.10.2026',
    changes: ['Überweisungen werden als Einnahme erkannt'],
  },
  {
    version: '1.0.0',
    date: '13.10.2026',
    changes: ['Erste Version: Übersicht, Budgets, Mittagessen-Kalender, Ziele, Chat-Eingabe'],
  },
];
