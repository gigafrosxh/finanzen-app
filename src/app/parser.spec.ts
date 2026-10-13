import { describe, expect, it } from 'vitest';
import { parseMessage, parseMessages } from './parser';

const today = new Date(2026, 9, 13);

describe('parseMessage', () => {
  it('erkennt Essen', () => {
    const r = parseMessage('Döner 7,50', today);
    expect(r).toMatchObject({ type: 'entry', entry: { kind: 'expense', category: 'food', amount: 7.5, date: '2026-10-13' } });
  });
  it('erkennt Tanken', () => {
    expect(parseMessage('tanken 38 €', today)).toMatchObject({ entry: { category: 'fuel', amount: 38 } });
  });
  it('erkennt Geschenke', () => {
    expect(parseMessage('Oma 20 geschenkt', today)).toMatchObject({ entry: { kind: 'income', amount: 20 } });
  });
  it('erkennt Überweisungen als Einnahme', () => {
    expect(parseMessage('Papa hat 30 überwiesen', today)).toMatchObject({ entry: { kind: 'income', amount: 30 } });
    expect(parseMessage('Überweisung Max 12,50', today)).toMatchObject({ entry: { kind: 'income', amount: 12.5 } });
  });
  it('erkennt Sparbuch', () => {
    expect(parseMessage('50 aufs Sparbuch', today)).toMatchObject({ entry: { kind: 'savings', amount: 50 } });
  });
  it('erkennt ausgelassenes Mittagessen mit Datum', () => {
    expect(parseMessage('gestern kein Mittagessen', today)).toEqual({ type: 'skipLunch', date: '2026-10-12' });
    expect(parseMessage('am 5. nicht gegessen', today)).toEqual({ type: 'skipLunch', date: '2026-10-05' });
  });
  it('erkennt Schultage', () => {
    expect(parseMessage('11 Schultage', today)).toEqual({ type: 'schoolDays', days: 11 });
  });
  it('Datum zählt nicht als Betrag', () => {
    expect(parseMessage('am 3. Friseur 15', today)).toMatchObject({ entry: { category: 'haircut', amount: 15, date: '2026-10-03' } });
  });
  it('ohne Betrag unbekannt', () => {
    expect(parseMessage('hallo', today)).toEqual({ type: 'unknown' });
  });

  it('erkennt +/- Kurzbefehle', () => {
    expect(parseMessage('+15 Pfand', today)).toMatchObject({ entry: { kind: 'income', amount: 15 } });
    expect(parseMessage('-12 Kino', today)).toMatchObject({ entry: { kind: 'expense', category: 'misc', amount: 12 } });
    expect(parseMessage('-8 Döner', today)).toMatchObject({ entry: { kind: 'expense', category: 'food' } });
  });
  it('erkennt mehr Einnahmen', () => {
    for (const t of ['Handy verkauft 80', 'Trinkgeld 5', 'Max hat mir 10 zurückgezahlt', 'Lohn 120', '20 bekommen']) {
      expect(parseMessage(t, today), t).toMatchObject({ entry: { kind: 'income' } });
    }
  });
  it('erkennt mehr Ausgaben', () => {
    expect(parseMessage('Geschenk für Mama 20 gekauft', today)).toMatchObject({ entry: { kind: 'expense' } });
    expect(parseMessage('OMV 40', today)).toMatchObject({ entry: { category: 'fuel' } });
    expect(parseMessage('getankt 35,20', today)).toMatchObject({ entry: { category: 'fuel', amount: 35.2 } });
    expect(parseMessage('Hoodie Zara 29,99', today)).toMatchObject({ entry: { category: 'clothes' } });
    expect(parseMessage('Barber 18', today)).toMatchObject({ entry: { category: 'haircut' } });
    expect(parseMessage('Red Bull 1,89', today)).toMatchObject({ entry: { category: 'food' } });
    expect(parseMessage('€12 ausgegeben', today)).toMatchObject({ entry: { kind: 'expense', amount: 12 } });
  });
  it('erkennt Abheben vom Sparbuch', () => {
    expect(parseMessage('30 vom Sparbuch abgehoben', today)).toMatchObject({ entry: { kind: 'savings', amount: -30 } });
  });
  it('erkennt Rückgängig und Hilfe', () => {
    expect(parseMessage('rückgängig', today)).toEqual({ type: 'undo' });
    expect(parseMessage('Hilfe', today)).toEqual({ type: 'help' });
  });
  it('erkennt mehrere Einträge auf einmal', () => {
    const r = parseMessages('Döner 7,50, getankt 30 und Oma 20 geschenkt', today);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ entry: { category: 'food', amount: 7.5 } });
    expect(r[1]).toMatchObject({ entry: { category: 'fuel', amount: 30 } });
    expect(r[2]).toMatchObject({ entry: { kind: 'income', amount: 20 } });
  });
  it('behandelt "und" ohne zweiten Betrag als einen Eintrag', () => {
    const r = parseMessages('Billa und Döner 12', today);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ entry: { category: 'food', amount: 12 } });
  });
});
