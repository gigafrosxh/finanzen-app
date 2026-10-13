import { Injectable, computed, effect, signal } from '@angular/core';
import { eur, goals, summarize, tips, totalSavings } from './budget';
import { AppData, CATEGORY_LABELS, DEFAULT_SETTINGS, Entry, ExpenseCategory, Month, Settings } from './models';
import { HELP_TEXT, ParseResult, isoDate, parseMessages } from './parser';

const KEY = 'finanzen-app-data';

export function monthId(d: Date): string {
  return isoDate(d).slice(0, 7);
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as AppData;
      data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
      return data;
    }
  } catch {
    // kaputte oder fehlende Daten: neu starten
  }
  return { version: 1, settings: structuredClone(DEFAULT_SETTINGS), months: [] };
}

@Injectable({ providedIn: 'root' })
export class Store {
  readonly data = signal<AppData>(load());
  readonly currentId = signal<string>(monthId(new Date()));

  readonly months = computed(() => [...this.data().months].sort((a, b) => b.id.localeCompare(a.id)));
  readonly month = computed(() => this.data().months.find((m) => m.id === this.currentId()) ?? null);
  readonly summary = computed(() => {
    const m = this.month();
    return m ? summarize(m) : null;
  });
  readonly tips = computed(() => {
    const m = this.month();
    const s = this.summary();
    return m && s ? tips(m, s) : [];
  });
  readonly goals = computed(() => {
    const m = this.month();
    const s = this.summary();
    return m && s ? goals(m, s, this.data()) : [];
  });
  readonly totalSavings = computed(() => totalSavings(this.data()));

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data()));
      } catch {
        // Speicher voll oder gesperrt
      }
    });
    navigator.storage?.persist?.();
    if (!this.month()) this.createMonth(this.currentId());
  }

  private update(fn: (d: AppData) => void) {
    const copy = structuredClone(this.data());
    fn(copy);
    this.data.set(copy);
  }

  private updateMonth(fn: (m: Month) => void) {
    this.update((d) => {
      const m = d.months.find((x) => x.id === this.currentId());
      if (m) fn(m);
    });
  }

  createMonth(id: string) {
    if (!this.data().months.some((m) => m.id === id)) {
      const s = this.data().settings;
      const month: Month = {
        id,
        allowance: s.allowance,
        lunchRate: s.lunchRate,
        schoolDays: s.schoolDays,
        fixedCosts: structuredClone(s.fixedCosts),
        budgets: { ...s.budgets },
        skippedLunchGoal: s.skippedLunchGoal,
        skippedLunchDates: [],
        entries: [],
        chat: [
          {
            from: 'app',
            text: 'Neuer Monat angelegt. Schreib mir einfach, was passiert ist, z. B. „Döner 7,50“, „getankt 38“, „Oma 20 geschenkt“ oder „50 aufs Sparbuch“. Mit „hilfe“ siehst du alle Befehle.',
            at: new Date().toISOString(),
          },
        ],
      };
      this.update((d) => d.months.push(month));
    }
    this.currentId.set(id);
  }

  nextMonthId(): string {
    const latest = this.months()[0]?.id ?? monthId(new Date());
    const [y, m] = latest.split('-').map(Number);
    const candidate = monthId(new Date(y, m, 1));
    const now = monthId(new Date());
    return this.data().months.some((x) => x.id === now) ? candidate : now;
  }

  deleteMonth(id: string) {
    this.update((d) => (d.months = d.months.filter((m) => m.id !== id)));
    if (this.currentId() === id) {
      const first = this.months()[0];
      if (first) this.currentId.set(first.id);
      else this.createMonth(monthId(new Date()));
    }
  }

  setMonthField<K extends 'schoolDays' | 'allowance' | 'skippedLunchGoal'>(key: K, value: number) {
    this.updateMonth((m) => (m[key] = value));
  }

  setMonthBudget(key: keyof Month['budgets'], value: number) {
    this.updateMonth((m) => (m.budgets[key] = value));
  }

  setFixedCosts(costs: Month['fixedCosts']) {
    this.updateMonth((m) => (m.fixedCosts = costs));
  }

  addEntry(entry: Omit<Entry, 'id'>) {
    this.updateMonth((m) => m.entries.push({ ...entry, id: newId() }));
  }

  removeEntry(id: string) {
    this.updateMonth((m) => (m.entries = m.entries.filter((e) => e.id !== id)));
  }

  toggleSkippedLunch(date: string) {
    this.updateMonth((m) => {
      m.skippedLunchDates = m.skippedLunchDates.includes(date)
        ? m.skippedLunchDates.filter((d) => d !== date)
        : [...m.skippedLunchDates, date].sort();
    });
  }

  saveSettings(settings: Settings) {
    this.update((d) => (d.settings = settings));
  }

  /** Verarbeitet eine Chat-Eingabe und gibt die Antwort zurück. */
  send(text: string): string {
    const month = this.month();
    if (!month) return '';
    const today = new Date();
    const ref = monthId(today) === month.id ? today : new Date(Number(month.id.slice(0, 4)), Number(month.id.slice(5)) - 1, 1);
    const results = parseMessages(text, ref);
    const answers = results.map((r) => this.apply(r));
    let answer = answers.join(results.length > 1 ? '\n' : '');
    const s = this.summary();
    const touched = results.flatMap((r) => (r.type === 'entry' && r.entry.kind === 'expense' ? [budgetKey(r.entry.category)] : []));
    if (s) {
      if (results.length > 1) answer = `${results.length} Einträge:\n` + answers.map((a) => `• ${a}`).join('\n');
      for (const key of new Set(touched)) {
        const b = s.budgets.find((x) => x.key === key)!;
        answer += `\n${b.label}: noch ${eur(b.budget - b.spent)} von ${eur(b.budget)}.`;
        const warning = this.tips().find((t) => t.text.startsWith(b.label + ':'));
        if (warning) answer += `\n\n⚠️ ${warning.text}`;
      }
      if (s.balance < 0 && results.some((r) => r.type === 'entry')) answer += `\n\n⚠️ ${this.tips()[0].text}`;
    }
    this.updateMonth((m) => {
      const at = new Date().toISOString();
      m.chat.push({ from: 'user', text, at }, { from: 'app', text: answer, at });
      m.chat = m.chat.slice(-200);
    });
    return answer;
  }

  private apply(r: ParseResult): string {
    const month = this.month()!;
    switch (r.type) {
      case 'help':
        return HELP_TEXT;
      case 'undo': {
        const last = month.entries.at(-1);
        if (!last) return 'Es gibt diesen Monat noch keinen Eintrag zum Löschen.';
        this.removeEntry(last.id);
        return `Gelöscht: „${last.note}“ (${eur(Math.abs(last.amount))}).`;
      }
      case 'skipLunch': {
        if (month.skippedLunchDates.includes(r.date)) return `Der ${fmtDate(r.date)} ist schon als Tag ohne Mittagessen eingetragen.`;
        this.toggleSkippedLunch(r.date);
        const n = month.skippedLunchDates.length + 1;
        return `${fmtDate(r.date)} ohne Mittagessen eingetragen. Das sind ${n} von ${month.skippedLunchGoal} Tagen, ${eur(n * month.lunchRate)} gespart.`;
      }
      case 'schoolDays':
        this.setMonthField('schoolDays', r.days);
        return `${r.days} lange Schultage gespeichert. Essensgeld diesen Monat: ${eur(r.days * month.lunchRate)}.`;
      case 'entry': {
        this.addEntry(r.entry);
        const e = r.entry;
        if (e.kind === 'savings' && e.amount < 0) return `${eur(-e.amount)} am ${fmtDate(e.date)} vom Sparbuch abgehoben.`;
        const what = e.kind === 'income' ? 'Einnahme' : e.kind === 'savings' ? 'Aufs Sparbuch' : CATEGORY_LABELS[e.category ?? 'misc'];
        return `${what}: ${eur(e.amount)} am ${fmtDate(e.date)} eingetragen.`;
      }
      default:
        return 'Das hab ich nicht verstanden. Schreib einen Betrag dazu, z. B. „Döner 7,50“ oder „Oma 20 geschenkt“. Mit „hilfe“ siehst du alle Befehle.';
    }
  }

  exportJson(): string {
    return JSON.stringify(this.data(), null, 2);
  }

  importJson(json: string) {
    const parsed = JSON.parse(json) as AppData;
    if (!parsed || !Array.isArray(parsed.months) || !parsed.settings) throw new Error('Keine gültige Sicherung');
    parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
    this.data.set(parsed);
    const first = this.months()[0];
    if (first) this.currentId.set(first.id);
    else this.createMonth(monthId(new Date()));
  }
}

function budgetKey(c?: ExpenseCategory): 'food' | 'fuel' | 'misc' {
  return c === 'food' || c === 'fuel' ? c : 'misc';
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-AT', { day: 'numeric', month: 'numeric' });
}

export function monthLabel(id: string): string {
  const [y, m] = id.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
}
