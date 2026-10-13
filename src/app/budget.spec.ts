import { describe, expect, it } from 'vitest';
import { dailyFood, goals, summarize, tips } from './budget';
import { AppData, DEFAULT_SETTINGS, Month, Settings } from './models';

// Daniels Zahlen als Testgrundlage (die App selbst hat keine Vorgaben mehr)
const SETTINGS: Settings = {
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
};

function month(overrides: Partial<Month> = {}): Month {
  const s = SETTINGS;
  return {
    id: '2026-10',
    allowance: s.allowance,
    lunchRate: s.lunchRate,
    schoolDays: s.schoolDays,
    fixedCosts: s.fixedCosts.map((f) => ({ ...f })),
    budgets: { ...s.budgets },
    skippedLunchGoal: s.skippedLunchGoal,
    skippedLunchDates: [],
    entries: [],
    chat: [],
    ...overrides,
  };
}

describe('summarize', () => {
  it('rechnet den Plan ohne Claude Pro (81,71 € Sparen)', () => {
    const m = month({
      fixedCosts: [
        { name: 'ChatGPT', amount: 23 },
        { name: 'Snapchat+', amount: 2.99 },
      ],
      budgets: { food: 84, fuel: 45, misc: 116 },
    });
    const s = summarize(m, new Date(2026, 9, 1));
    expect(s.lunchMoney).toBe(102.7);
    expect(s.incomeTotal).toBe(352.7);
    expect(s.fixedTotal).toBe(25.99);
    expect(s.plannedSavings).toBe(81.71);
  });

  it('rechnet den Plan mit Claude Pro (83,81 € Sparen)', () => {
    const s = summarize(month(), new Date(2026, 9, 1));
    expect(s.fixedTotal).toBe(47.59);
    expect(s.plannedSavings).toBe(83.81);
  });

  it('zählt Ausgaben, Einnahmen und Sparbuch', () => {
    const m = month({
      entries: [
        { id: '1', date: '2026-10-02', kind: 'expense', category: 'food', amount: 9.5, note: 'Mäcci' },
        { id: '2', date: '2026-10-03', kind: 'expense', category: 'clothes', amount: 30, note: 'Hose' },
        { id: '3', date: '2026-10-04', kind: 'income', amount: 20, note: 'Oma' },
        { id: '4', date: '2026-10-05', kind: 'savings', amount: 50, note: 'Sparbuch' },
      ],
    });
    const s = summarize(m, new Date(2026, 9, 10));
    expect(s.incomeTotal).toBe(372.7);
    expect(s.expensesTotal).toBe(39.5);
    expect(s.deposited).toBe(50);
    expect(s.balance).toBe(r(372.7 - 47.59 - 39.5 - 50));
    expect(s.budgets.find((b) => b.key === 'misc')!.spent).toBe(30);
  });

  it('warnt, wenn das Essensbudget fast weg ist', () => {
    const m = month({
      entries: [{ id: '1', date: '2026-10-02', kind: 'expense', category: 'food', amount: 55, note: 'Mäcci' }],
    });
    const s = summarize(m, new Date(2026, 9, 20));
    expect(s.budgets[0].status).toBe('warn');
    expect(tips(m, s).some((t) => t.text.startsWith('Essen'))).toBe(true);
  });

  it('erkennt erreichte Ziele', () => {
    const m = month({ skippedLunchDates: ['2026-10-01', '2026-10-02', '2026-10-03'] });
    const data: AppData = { version: 1, settings: { ...SETTINGS, savingsStart: 1000 }, months: [m] };
    const g = goals(m, summarize(m), data);
    expect(g.find((x) => x.label.startsWith('Tage ohne'))!.done).toBe(true);
    expect(g.find((x) => x.label === 'Gesamt-Sparziel')!.done).toBe(true);
  });
});

describe('vergangener Monat', () => {
  it('rechnet keine offenen Budgets mehr ab', () => {
    const m = month({ id: '2026-09' });
    const s = summarize(m, new Date(2026, 9, 13));
    expect(s.forecastLeftover).toBe(s.balance);
    expect(tips(m, s).some((t) => t.text.includes('lass noch'))).toBe(false);
  });
});

describe('Tagesbudget', () => {
  it('teilt das Essensbudget auf die restlichen Schultage', () => {
    const m = month();
    const d = dailyFood(m, summarize(m, new Date(2026, 9, 26)), new Date(2026, 9, 26))!;
    // 26.–30.10.2026 sind 5 von 22 Werktagen → 13 × 5 / 22 ≈ 3 Schultage
    expect(d).toEqual({ left: 60.3, days: 3, perDay: 20.1 });
  });
});

const r = (n: number) => Math.round(n * 100) / 100;
