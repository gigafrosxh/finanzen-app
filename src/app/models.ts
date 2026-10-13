export type ExpenseCategory = 'food' | 'fuel' | 'clothes' | 'haircut' | 'misc';
export type EntryKind = 'expense' | 'income' | 'savings';

export interface Entry {
  id: string;
  date: string; // YYYY-MM-DD
  kind: EntryKind;
  category?: ExpenseCategory; // nur bei Ausgaben
  amount: number;
  note: string;
}

export interface FixedCost {
  name: string;
  amount: number;
}

export interface Budgets {
  food: number;
  fuel: number;
  misc: number; // Sonstiges inkl. Gewand und Friseur
}

export interface ChatMessage {
  from: 'user' | 'app';
  text: string;
  at: string;
}

export interface Month {
  id: string; // YYYY-MM
  allowance: number;
  lunchRate: number;
  schoolDays: number;
  fixedCosts: FixedCost[];
  budgets: Budgets;
  skippedLunchGoal: number;
  skippedLunchDates: string[];
  entries: Entry[];
  chat: ChatMessage[];
}

export interface Settings {
  allowance: number;
  lunchRate: number;
  schoolDays: number;
  fixedCosts: FixedCost[];
  budgets: Budgets;
  skippedLunchGoal: number;
  savingsStart: number;
  savingsTarget: number;
}

export interface AppData {
  version: 1;
  settings: Settings;
  months: Month[];
}

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: 'Essen',
  fuel: 'Tanken',
  clothes: 'Gewand',
  haircut: 'Friseur',
  misc: 'Sonstiges',
};

export const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  food: '🍔',
  fuel: '⛽',
  clothes: '👕',
  haircut: '💇',
  misc: '🧾',
};

export const DEFAULT_SETTINGS: Settings = {
  allowance: 250,
  lunchRate: 7.9,
  schoolDays: 13,
  fixedCosts: [
    { name: 'ChatGPT', amount: 23 },
    { name: 'Snapchat+', amount: 2.99 },
    { name: 'Claude Pro', amount: 21.6 },
  ],
  // Essen: 84 € minus 3 ausgelassene Tage (3 × 7,90 €) für Claude Pro
  budgets: { food: 60.3, fuel: 45, misc: 116 },
  skippedLunchGoal: 3,
  savingsStart: 0,
  savingsTarget: 1000,
};
