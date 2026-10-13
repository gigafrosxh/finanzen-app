import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './models';
import { Store } from './store';

// Daniels Zahlen als Testgrundlage (die App selbst hat keine Vorgaben mehr)
const SETTINGS = {
  ...DEFAULT_SETTINGS,
  allowance: 250,
  lunchRate: 7.9,
  schoolDays: 13,
  fixedCosts: [
    { name: 'ChatGPT', amount: 23 },
    { name: 'Snapchat+', amount: 2.99 },
    { name: 'Claude Pro', amount: 21.6 },
  ],
  budgets: { food: 60.3, fuel: 45, misc: 116 },
  skippedLunchGoal: 3,
  savingsTarget: 1000,
  setupDone: true,
};

describe('Store / Chat', () => {
  let store: Store;
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('finanzen-app-data', JSON.stringify({ version: 1, settings: SETTINGS, months: [] }));
    TestBed.resetTestingModule();
    store = TestBed.inject(Store);
  });
  const entries = () => store.month()!.entries;

  it('bucht und beantwortet Fragen', () => {
    store.send('Döner 7,50, Mäcci 9,80');
    expect(entries()).toHaveLength(2);
    expect(store.send('wie viel für essen übrig?')).toContain('43,00');
    expect(store.send('was hab ich für essen ausgegeben?')).toContain('17,30');
    expect(entries()).toHaveLength(2);
  });

  it('ändert und löscht per Chat', () => {
    store.send('Döner 7,50');
    store.send('Billa 3');
    store.send('döner war 8');
    expect(entries().find((e) => e.note.startsWith('Döner'))!.amount).toBe(8);
    store.send('letzten auf 4 ändern');
    expect(entries().find((e) => e.note.startsWith('Billa'))!.amount).toBe(4);
    store.send('lösch den döner');
    expect(entries().map((e) => e.note)).toEqual(['Billa 3']);
    store.send('rückgängig');
    expect(entries()).toHaveLength(0);
  });

  it('Einstellungen per Chat', () => {
    store.send('essensbudget 70');
    expect(store.month()!.budgets.food).toBe(70);
    expect(store.data().settings.budgets.food).toBe(70);
    store.send('50 aufs Sparbuch');
    store.send('sparbuch stand 400');
    expect(store.totalSavings()).toBe(400);
  });

  it('Mittagessen setzen und zurücknehmen', () => {
    const id = store.month()!.id;
    store.send(`am 5. und 6. nicht gegessen`);
    expect(store.month()!.skippedLunchDates).toEqual([`${id}-05`, `${id}-06`]);
    store.send('am 5. doch gegessen');
    expect(store.month()!.skippedLunchDates).toEqual([`${id}-06`]);
  });

  it('Tankgutschein zählt nicht', () => {
    store.send('getankt 40 mit 20 gutschein');
    expect(entries()[0]).toMatchObject({ category: 'fuel', amount: 20 });
  });

  it('kann ich mir das leisten', () => {
    expect(store.send('kann ich mir 30 € schuhe leisten?')).toMatch(/^Ja/);
    expect(store.send('kann ich mir 500 leisten?')).toMatch(/^Eher nicht/);
  });

  it('Unklares bekommt Vorschläge statt Buchung', () => {
    store.send('hallo');
    expect(entries()).toHaveLength(0);
    expect(store.month()!.chat.at(-1)!.chips).toContain('hilfe');
  });
});
