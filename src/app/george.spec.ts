import { describe, expect, it } from 'vitest';
import { buildRows, decodeFile, guessOwnName, parseCsv, parseGeorge, purchaseDate, ruleCategory, shortMerchant, suggestSettings, toEntry } from './george';
import { DEFAULT_SETTINGS, Entry } from './models';

// Erfundene Buchungen im George-Format (keine echten IBANs oder Namen)
const HEAD =
  '"Eigener Kontoname","Eigene IBAN","Buchungsdatum","Partnername","Partner IBAN","BIC/SWIFT","Partner Kontonummer","Bankleitzahl","Betrag","Währung","Buchungs-Details","Empfänger-Überprüfung","Diese IBAN ist registriert auf"';
const row = (date: string, partner: string, amount: string, details: string) =>
  `"Girokonto von Max","AT00TEST","${date}","${partner}","","","","","${amount}","EUR","${details}","",""`;

const ROWS = [
  row('13.10.2026', 'BILLA DANKT 0001234', '-3,93', 'POS 3,93 AT K1 12.10. 07:44 BILLA DANKT 0001234 TESTSTADT 1000 040'),
  row('13.10.2026', 'MCDONALDS 4000001', '-12,60', 'E-COMM 12,60 AT K1 12.10. 16:55 MCDONALDS 4000001 TESTSTADT 1000 040'),
  row('12.10.2026', 'KEM KEBAP', '-6,00', 'KEM KEBAP 2370 K1 12.10. 12:39'),
  row('08.10.2026', 'Eva Muster Karl Muster', '250,00', 'TG 10/26'),
  row('06.10.2026', 'Max Muster', '12,10', 'George-Überweisung'),
  row('05.10.2026', 'JET 0001', '-50,00', 'JET 0001 2140 K1 03.10. 15:09'),
  row('02.10.2026', 'APPLE.COM/BILL', '-2,99', 'E-COMM 2,99 IE K1 01.10. 00:00 APPLE.COM/BILL CORK 372'),
  row('01.10.2026', 'Eva Muster Karl Muster', '72,00', 'Essensgeld 10/26'),
  row('30.09.2026', '', '0,00', '*** Abschlussbuchung per 30.09.2026 ****'),
  row('28.09.2026', '', '-40,00', 'ATM 40,00 AT K1 25.09. 21:54 EVENT ATM 3'),
  row('22.09.2026', 'OPENAI *CHATGPT SUBSCR', '-23,00', 'E-COMM 23,00 IE K1 21.09. 16:49 OPENAI *CHATGPT SUBSCR DUBLIN'),
  row('16.09.2026', 'Max Muster Klassenkonto HTL', '-380,00', 'George-Überweisung'),
  row('15.09.2026', 'Lisa Beispiel', '-35,00', 'Eintritte Krakau'),
  row('08.09.2026', 'Eva Muster Karl Muster', '250,00', 'TG 9/26'),
  row('02.09.2026', 'Sparrrkonto von Max', '-100,00', 'Überweisung Sparrrkonto von Max'),
  row('01.09.2026', 'APPLE.COM/BILL', '-2,99', 'E-COMM 2,99 IE K1 31.08. 00:00 APPLE.COM/BILL CORK 372'),
  row('28.08.2026', 'Firma Test GmbH', '1.038,16', 'GEHALT 8/2026'),
  row('24.08.2026', 'OPENAI *CHATGPT SUBSCR', '-23,00', 'E-COMM 23,00 IE K1 21.08. 16:49 OPENAI *CHATGPT SUBSCR DUBLIN'),
  row('01.08.2026', 'BP TANKSTELLE', '-33,59', 'POS 33,59 AT K1 01.08. 15:04 BP TANKSTELLE TESTORT 4320 040'),
];
const CSV = [HEAD, ...ROWS].join('\r\n') + '\r\n';

function utf16(text: string): ArrayBuffer {
  const buf = new Uint8Array(2 + text.length * 2);
  buf[0] = 0xff;
  buf[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    buf[2 + i * 2] = c & 0xff;
    buf[3 + i * 2] = c >> 8;
  }
  return buf.buffer;
}

describe('George-Datei lesen', () => {
  it('erkennt UTF-16 LE mit BOM', () => {
    expect(decodeFile(utf16(CSV))).toBe(CSV);
  });

  it('liest UTF-8 ebenfalls', () => {
    expect(decodeFile(new TextEncoder().encode('﻿' + CSV).buffer as ArrayBuffer)).toBe(CSV);
  });

  it('versteht Anführungszeichen und "" als Escape', () => {
    expect(parseCsv('"a","b ""c"", d"\n"1","2"')).toEqual([
      ['a', 'b "c", d'],
      ['1', '2'],
    ]);
  });

  it('liest alle Buchungen mit deutschem Betrag', () => {
    const txs = parseGeorge(CSV);
    expect(txs).toHaveLength(ROWS.length);
    expect(txs.find((t) => t.amount > 1000)?.amount).toBe(1038.16);
    expect(txs[0]).toMatchObject({ bookingDate: '2026-10-13', date: '2026-10-12', amount: -3.93, merchant: 'Billa' });
  });

  it('findet Spalten über die Kopfzeile', () => {
    const swapped = '"Betrag","Buchungsdatum","Buchungs-Details","Partnername"\n"-5,00","03.10.2026","POS","SPAR DANKT 1"';
    expect(parseGeorge(swapped)[0]).toMatchObject({ amount: -5, bookingDate: '2026-10-03', merchant: 'Spar' });
  });

  it('meldet Dateien, die kein Export sind', () => {
    expect(() => parseGeorge('"Name","Wert"\n"a","b"')).toThrow();
  });

  it('nimmt das Kaufdatum und beachtet den Jahreswechsel', () => {
    expect(purchaseDate('POS 3,93 AT K1 30.12. 07:44 BILLA', '2027-01-02')).toBe('2026-12-30');
    expect(purchaseDate('George-Überweisung', '2026-10-06')).toBe('2026-10-06');
  });

  it('gibt gleichen Zeilen unterschiedliche Hashes und ist stabil', () => {
    const twice = [HEAD, ROWS[0], ROWS[0]].join('\n');
    const [a, b] = parseGeorge(twice);
    expect(a.hash).not.toBe(b.hash);
    expect(parseGeorge(twice)[0].hash).toBe(a.hash);
  });
});

describe('Händlernamen', () => {
  it('kürzt Filialnummern und Zusätze', () => {
    expect(shortMerchant('BILLA DANKT 0001234', 'POS')).toBe('Billa');
    expect(shortMerchant('CAFE+CO AT 330185', 'POS')).toBe('Cafe+Co');
    expect(shortMerchant('MCDONALDS 4000001', 'E-COMM')).toBe("McDonald's");
    expect(shortMerchant('SUMUP  *LA CASA DE PIZ', 'POS')).toBe('La Casa De Piz');
    expect(shortMerchant('', 'ATM 40,00 AT K1 25.09. 21:54')).toBe('Bargeld abgehoben');
  });

  it('speichert bei Personen nur den Vornamen', () => {
    expect(shortMerchant('Lisa Beispiel', 'Eintritte Krakau')).toBe('Eintritte Krakau (Lisa)');
    expect(shortMerchant('Lisa Beispiel', 'George-Überweisung')).toBe('Überweisung Lisa');
  });
});

describe('Kategorien', () => {
  const txs = parseGeorge(CSV);
  const own = guessOwnName(CSV, txs);
  const cat = (partner: string) => ruleCategory(txs.find((t) => t.partner === partner)!, own);

  it('erkennt den eigenen Namen, aber nicht das Klassenkonto', () => {
    expect(own).toBe('Max Muster');
    expect(cat('Max Muster')).toBe('internal');
    expect(cat('Max Muster Klassenkonto HTL')).toBe('other');
  });

  it('ordnet nach den Regeln zu', () => {
    expect(cat('BILLA DANKT 0001234')).toBe('food');
    expect(cat('KEM KEBAP')).toBe('food');
    expect(cat('JET 0001')).toBe('fuel');
    expect(cat('BP TANKSTELLE')).toBe('fuel');
    expect(cat('APPLE.COM/BILL')).toBe('subscription');
    expect(cat('Sparrrkonto von Max')).toBe('savings');
    expect(ruleCategory(txs.find((t) => t.details.startsWith('ATM'))!, own)).toBe('cash');
    expect(ruleCategory(txs.find((t) => t.details === 'TG 10/26')!, own)).toBe('allowance');
    expect(ruleCategory(txs.find((t) => t.details.startsWith('Essensgeld'))!, own)).toBe('lunch');
  });
});

describe('Vorschau', () => {
  const txs = parseGeorge(CSV);
  const settings = { ...DEFAULT_SETTINGS, fixedCosts: [{ name: 'Snapchat+', amount: 2.99 }] };
  const byPartner = (rows: ReturnType<typeof buildRows>, p: string) => rows.find((r) => r.tx.partner === p)!;

  it('hakt Umbuchungen, Fixkosten, Taschengeld und Bargeld nicht an', () => {
    const rows = buildRows(txs, settings, [], 'Max Muster');
    expect(byPartner(rows, 'Max Muster')).toMatchObject({ category: 'skip', reason: 'internal', selected: false });
    expect(byPartner(rows, 'APPLE.COM/BILL')).toMatchObject({ reason: 'fixed', selected: false });
    expect(rows.find((r) => r.tx.details === 'TG 10/26')).toMatchObject({ category: 'income', reason: 'allowance', selected: false });
    expect(rows.find((r) => r.tx.details.startsWith('ATM'))).toMatchObject({ reason: 'cash', selected: false });
    expect(byPartner(rows, 'BILLA DANKT 0001234')).toMatchObject({ category: 'food', selected: true });
    expect(byPartner(rows, 'Firma Test GmbH')).toMatchObject({ category: 'income', selected: true });
  });

  it('überspringt schon eingetragene Ausgaben (Betrag gleich, Datum ±2 Tage)', () => {
    const manual: Entry = { id: 'x', date: '2026-10-11', kind: 'expense', category: 'food', amount: 12.6, note: 'Mäcci' };
    const rows = buildRows(txs, settings, [manual], 'Max Muster');
    expect(byPartner(rows, 'MCDONALDS 4000001')).toMatchObject({ reason: 'duplicate', selected: false });
    const later = { ...manual, date: '2026-10-01' };
    expect(byPartner(buildRows(txs, settings, [later], 'Max Muster'), 'MCDONALDS 4000001').selected).toBe(true);
  });

  it('zeigt schon importierte Buchungen nicht noch einmal', () => {
    const rows = buildRows(txs, { ...settings, importedHashes: [txs[0].hash] }, [], 'Max Muster');
    expect(rows).toHaveLength(txs.length - 1);
  });

  it('wendet gemerkte Regeln an', () => {
    const lisa = txs.find((t) => t.partner === 'Lisa Beispiel')!;
    const rows = buildRows(txs, { ...settings, importRules: { [lisa.key]: 'clothes' } }, [], 'Max Muster');
    expect(byPartner(rows, 'Lisa Beispiel').category).toBe('clothes');
  });

  it('macht passende Einträge', () => {
    const rows = buildRows(txs, settings, [], 'Max Muster');
    expect(toEntry(byPartner(rows, 'BILLA DANKT 0001234'))).toEqual({
      date: '2026-10-12',
      kind: 'expense',
      category: 'food',
      amount: 3.93,
      note: 'Billa',
      source: 'george',
    });
    expect(toEntry(byPartner(rows, 'Sparrrkonto von Max'))).toMatchObject({ kind: 'savings', amount: 100 });
    expect(toEntry(byPartner(rows, 'Max Muster'))).toBeNull();
  });
});

describe('Einrichtung aus dem Export', () => {
  it('schlägt Taschengeld, Abos und Budgets vor', () => {
    const txs = parseGeorge(CSV);
    const s = suggestSettings(txs, 'Max Muster');
    expect(s.settings.allowance).toBe(250);
    expect(s.lunchPerMonth).toBe(72);
    expect(s.settings.fixedCosts).toEqual(
      expect.arrayContaining([
        { name: 'ChatGPT', amount: 23 },
        { name: 'Apple-Abo', amount: 2.99 },
      ]),
    );
    expect(s.months).toBeGreaterThan(2);
    expect(s.settings.budgets!.fuel).toBeGreaterThan(0);
    expect(s.settings.budgets!.food).toBeGreaterThan(0);
  });
});
