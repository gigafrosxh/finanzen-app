import { describe, expect, it } from 'vitest';
import { parseAmount, parseMessage, parseMessages } from './parser';

// Dienstag, 13.10.2026
const today = new Date(2026, 9, 13);
const p = (t: string) => parseMessage(t, today);

describe('Beträge', () => {
  it.each([
    ['Döner 7,50', 7.5],
    ['döner 7.5€', 7.5],
    ['€ 7,50 döner', 7.5],
    ['döner 7 euro 50', 7.5],
    ['döner 7€50', 7.5],
    ['zehn euro billa', 10],
    ['ein fünfer billa', 5],
    ['n zehner fürs tanken', 10],
    ['20 eier für schuhe', 20],
    ['fünfundzwanzig euro gewand', 25],
    ['Hoodie Zara 129,99', 129.99],
  ])('%s → %s', (t, n) => expect(parseAmount(t)).toBe(n));
});

describe('Ausgaben', () => {
  it('Kategorien', () => {
    expect(p('Döner 7,50')).toMatchObject({ type: 'entry', entry: { kind: 'expense', category: 'food', amount: 7.5, date: '2026-10-13' } });
    expect(p('tanken 38 €')).toMatchObject({ entry: { category: 'fuel', amount: 38 } });
    expect(p('OMV 40')).toMatchObject({ entry: { category: 'fuel' } });
    expect(p('Hoodie Zara 29,99')).toMatchObject({ entry: { category: 'clothes' } });
    expect(p('neue hosen 40')).toMatchObject({ entry: { category: 'clothes' } });
    expect(p('Barber 18')).toMatchObject({ entry: { category: 'haircut' } });
    expect(p('Red Bull 1,89')).toMatchObject({ entry: { category: 'food' } });
    expect(p('Spar 4,20')).toMatchObject({ entry: { kind: 'expense', category: 'food' } });
    expect(p('Kino 12')).toMatchObject({ entry: { kind: 'expense', category: 'misc' } });
    expect(p('Reinigung 8')).toMatchObject({ entry: { kind: 'expense', category: 'misc' } });
    expect(p('Wasser 1,50')).toMatchObject({ type: 'entry', entry: { kind: 'expense' } });
  });
  it('Tippfehler', () => {
    expect(p('doner 7')).toMatchObject({ entry: { category: 'food' } });
    expect(p('tankn 30')).toMatchObject({ entry: { category: 'fuel' } });
    expect(p('mäcces 9')).toMatchObject({ entry: { category: 'food' } });
    expect(p('frisör 15')).toMatchObject({ entry: { category: 'haircut' } });
    expect(p('50 aufs sparbuh')).toMatchObject({ entry: { kind: 'savings', amount: 50 } });
  });
  it('+/- Kurzbefehle', () => {
    expect(p('+15 Pfand')).toMatchObject({ entry: { kind: 'income', amount: 15 } });
    expect(p('-12 Kino')).toMatchObject({ entry: { kind: 'expense', category: 'misc', amount: 12 } });
    expect(p('€12 ausgegeben')).toMatchObject({ entry: { kind: 'expense', amount: 12 } });
  });
  it('Tankgutschein', () => {
    expect(p('getankt 40 mit 20 gutschein')).toMatchObject({ voucher: 20, entry: { category: 'fuel', amount: 20 } });
    expect(p('tanken 45, davon 25 tankgutschein')).toMatchObject({ voucher: 25, entry: { amount: 20 } });
  });
});

describe('Einnahmen und Sparbuch', () => {
  it('Einnahmen', () => {
    for (const t of ['Oma 20 geschenkt', 'Papa hat 30 überwiesen', 'Handy verkauft 80', 'Trinkgeld 5', 'Max hat mir 10 zurückgezahlt', '20 bekommen', '20 rein']) {
      expect(p(t), t).toMatchObject({ entry: { kind: 'income' } });
    }
    expect(p('Geschenk für Mama 20 gekauft')).toMatchObject({ entry: { kind: 'expense' } });
  });
  it('Sparbuch', () => {
    expect(p('50 aufs Sparbuch')).toMatchObject({ entry: { kind: 'savings', amount: 50 } });
    expect(p('30 vom Sparbuch abgehoben')).toMatchObject({ entry: { kind: 'savings', amount: -30 } });
  });
});

describe('Datum', () => {
  it.each([
    ['gestern döner 7', '2026-10-12'],
    ['vorgestern billa 4', '2026-10-11'],
    ['am 5. döner 7', '2026-10-05'],
    ['5.10. döner 7', '2026-10-05'],
    ['am 05.10.2026 döner 7', '2026-10-05'],
    ['am montag döner 7', '2026-10-12'],
    ['letzten dienstag döner 7', '2026-10-06'],
    ['vor 3 tagen döner 7', '2026-10-10'],
  ])('%s → %s', (t, d) => expect(p(t)).toMatchObject({ entry: { date: d } }));
});

describe('Mittagessen', () => {
  it('ein Tag', () => {
    expect(p('heute kein Mittagessen')).toEqual({ type: 'skipLunch', dates: ['2026-10-13'] });
    expect(p('gestern nicht gegessen')).toEqual({ type: 'skipLunch', dates: ['2026-10-12'] });
    expect(p('am 5. kein mittag')).toEqual({ type: 'skipLunch', dates: ['2026-10-05'] });
  });
  it('mehrere Tage', () => {
    expect(p('mo und di kein mittag')).toEqual({ type: 'skipLunch', dates: ['2026-10-12', '2026-10-13'] });
    expect(p('am 5. und 6. nicht gegessen')).toEqual({ type: 'skipLunch', dates: ['2026-10-05', '2026-10-06'] });
    expect(p('diese woche 2 tage kein mittag')).toEqual({ type: 'lunchUnclear' });
  });
  it('wieder rausnehmen', () => {
    expect(p('gestern doch gegessen')).toEqual({ type: 'unskipLunch', dates: ['2026-10-12'] });
  });
  it('Schultage', () => {
    expect(p('11 Schultage')).toEqual({ type: 'schoolDays', days: 11 });
  });
});

describe('Fragen', () => {
  it.each([
    ['wie viel hab ich noch?', 'balance'],
    ['wieviel geld hab ich noch', 'balance'],
    ['wie viel für essen übrig?', 'food'],
    ['wie viel kann ich noch tanken?', 'fuel'],
    ['was hab ich diesen monat ausgegeben?', 'spent'],
    ['wie viel hab ich gespart?', 'savings'],
    ['schaff ich das sparziel?', 'goal'],
    ['wie viele tage ohne mittag?', 'lunch'],
    ['wie viel kann ich heute noch essen?', 'daily'],
    ['was war meine größte ausgabe?', 'biggest'],
    ['wie viel hab ich bekommen?', 'income'],
  ])('%s → %s', (t, topic) => expect(p(t)).toMatchObject({ type: 'question', topic }));
  it('leisten', () => {
    expect(p('kann ich mir 30 € schuhe leisten?')).toMatchObject({ type: 'question', topic: 'afford', amount: 30 });
  });
  it('Ausgaben pro Kategorie', () => {
    expect(p('wie viel hab ich für essen ausgegeben?')).toMatchObject({ type: 'question', topic: 'spent', category: 'food' });
  });
});

describe('Einstellungen per Chat', () => {
  it.each([
    ['essensbudget 70', 'food', 70],
    ['tankbudget auf 50', 'fuel', 50],
    ['budget für sonstiges 100', 'misc', 100],
    ['taschengeld ist jetzt 260', 'allowance', 260],
    ['sparziel 2000', 'savingsTarget', 2000],
    ['sparbuch stand 340', 'savingsBalance', 340],
    ['auf dem sparbuch sind 512,40', 'savingsBalance', 512.4],
    ['essensgeld pro tag 8,20', 'lunchRate', 8.2],
  ])('%s', (t, key, value) => expect(p(t)).toEqual({ type: 'setting', key, value }));
});

describe('Ändern und Löschen', () => {
  it('rückgängig', () => {
    expect(p('rückgängig')).toEqual({ type: 'undo' });
    expect(p('das war falsch')).toEqual({ type: 'undo' });
  });
  it('letzten ändern', () => {
    expect(p('letzten auf 8 ändern')).toEqual({ type: 'editLast', amount: 8 });
    expect(p('das war 8,50')).toEqual({ type: 'editLast', amount: 8.5 });
  });
  it('bestimmten ändern', () => {
    expect(p('döner war 8')).toEqual({ type: 'editMatch', query: 'döner', amount: 8 });
  });
  it('bestimmten löschen', () => {
    expect(p('lösch den döner')).toEqual({ type: 'deleteMatch', query: 'döner' });
  });
  it('Hilfe', () => {
    expect(p('Hilfe')).toEqual({ type: 'help' });
    expect(p('was kann ich schreiben?')).toEqual({ type: 'help' });
  });
});

describe('Unklares', () => {
  it('ohne Betrag', () => {
    expect(p('döner')).toEqual({ type: 'unknown', reason: 'noAmount' });
    expect(p('hallo')).toEqual({ type: 'unknown', reason: 'unclear' });
  });
});

describe('Mehrere Einträge', () => {
  it('getrennt mit Komma und und', () => {
    const r = parseMessages('Döner 7,50, getankt 30 und Oma 20 geschenkt', today);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ entry: { category: 'food', amount: 7.5 } });
    expect(r[1]).toMatchObject({ entry: { category: 'fuel', amount: 30 } });
    expect(r[2]).toMatchObject({ entry: { kind: 'income', amount: 20 } });
  });
  it('mit Zeilenumbruch', () => {
    expect(parseMessages('mäcci 9\nbilla 3,20\nheute kein mittag', today)).toHaveLength(3);
  });
  it('"und" ohne zweiten Betrag bleibt ein Eintrag', () => {
    const r = parseMessages('Billa und Döner 12', today);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ entry: { category: 'food', amount: 12 } });
  });
  it('Wochentage mit und bleiben zusammen', () => {
    expect(parseMessages('mo und di kein mittag', today)).toEqual([{ type: 'skipLunch', dates: ['2026-10-12', '2026-10-13'] }]);
  });
});
