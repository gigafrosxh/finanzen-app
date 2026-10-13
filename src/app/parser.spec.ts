import { describe, expect, it } from 'vitest';
import { parseMessage } from './parser';

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
});
