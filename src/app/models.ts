export type ExpenseCategory = 'food' | 'fuel' | 'clothes' | 'haircut' | 'misc';
export type EntryKind = 'expense' | 'income' | 'savings';

export interface Entry {
  id: string;
  date: string; // YYYY-MM-DD
  kind: EntryKind;
  category?: ExpenseCategory; // nur bei Ausgaben
  amount: number;
  note: string;
  source?: 'george'; // aus einem Bank-Export importiert
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
  chips?: string[]; // antippbare Vorschläge
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
  lastExport?: string; // ISO-Datum der letzten Sicherung
  setupDone?: boolean; // Begrüßung erledigt (mit oder ohne Export)
  importRules?: Record<string, ImportCategory>; // Händler → Kategorie, vom Nutzer korrigiert
  importedHashes?: string[]; // schon importierte Buchungen
  lastImport?: string; // jüngstes importiertes Buchungsdatum (YYYY-MM-DD)
}

/** Kategorie einer Bankbuchung beim Import. */
export type ImportCategory = ExpenseCategory | 'income' | 'savings' | 'skip';

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

// Keine Vorgaben: alles kommt aus dem George-Export oder wird selbst eingetragen
export const DEFAULT_SETTINGS: Settings = {
  allowance: 0,
  lunchRate: 0,
  schoolDays: 0,
  fixedCosts: [],
  budgets: { food: 0, fuel: 0, misc: 0 },
  skippedLunchGoal: 0,
  savingsStart: 0,
  savingsTarget: 0,
};
