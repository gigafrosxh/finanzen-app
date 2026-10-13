import { Injectable, computed, effect, signal } from '@angular/core';
import { Tip, dailyFood, eur, foodPlaces, goals, history, r2, summarize, tips, totalSavings } from './budget';
import { AppData, CATEGORY_LABELS, ChatMessage, DEFAULT_SETTINGS, Entry, ExpenseCategory, ImportCategory, Month, Settings } from './models';
import { HELP_TEXT, ParseResult, SettingKey, detectCategory, isoDate, parseMessages } from './parser';

const KEY = 'finanzen-app-data';

export function monthId(d: Date): string {
  return isoDate(d).slice(0, 7);
}

function newMonth(id: string, s: Settings): Month {
  return {
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
        text: 'Neuer Monat angelegt. Schreib mir einfach, was passiert ist, z. B. „Döner 7,50“, „getankt 38“, „Oma 20 geschenkt“ oder „50 aufs Sparbuch“. Du kannst mich auch fragen: „Wie viel hab ich noch?“',
        at: new Date().toISOString(),
        chips: ['hilfe', 'Wie viel hab ich noch?'],
      },
    ],
  };
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

interface Reply {
  text: string;
  chips?: string[];
}

const DEFAULT_CHIPS = ['Mäcci', 'Döner', 'Billa', 'Getankt'];
const STOPWORDS = new Set(['überweisung', 'bargeld', 'bareinzahlung', 'ein', 'eine', 'einen', 'der', 'die', 'das', 'den', 'ich', 'hab', 'habe', 'neue', 'neuer', 'neues', 'noch', 'mal']);

function leftText(budget: number, spent: number): string {
  if (budget <= 0) return `${eur(spent)} ausgegeben, noch kein Budget festgelegt`;
  return spent <= budget ? `noch ${eur(budget - spent)} von ${eur(budget)}` : `${eur(spent - budget)} über dem Budget von ${eur(budget)}`;
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
  readonly tips = computed<Tip[]>(() => {
    const m = this.month();
    const s = this.summary();
    if (!m || !s) return [];
    const out = tips(m, s);
    const backup = this.backupReminder();
    return backup ? [...out.filter((t) => t.level !== 'good'), backup, ...out.filter((t) => t.level === 'good')] : out;
  });
  readonly goals = computed(() => {
    const m = this.month();
    const s = this.summary();
    return m && s ? goals(m, s, this.data()) : [];
  });
  readonly totalSavings = computed(() => totalSavings(this.data()));
  readonly dailyFood = computed(() => {
    const m = this.month();
    const s = this.summary();
    return m && s ? dailyFood(m, s) : null;
  });
  readonly foodPlaces = computed(() => foodPlaces(this.data().months));
  readonly history = computed(() => history(this.data().months));

  /** Erster Start: noch nichts eingetragen und Begrüßung nicht erledigt. */
  readonly needsSetup = computed(() => {
    const d = this.data();
    return !d.settings.setupDone && d.months.every((m) => m.entries.length === 0);
  });

  /** Monatsende: Rest kann mit einem Tipp aufs Sparbuch. */
  readonly closeOffer = computed(() => {
    const s = this.summary();
    if (!s || s.monthProgress < 0.85) return null;
    // Laufender Monat: nur was nach den restlichen Budgets sicher übrig bleibt
    const rest = s.monthProgress >= 1 ? s.balance : Math.min(s.balance, s.forecastLeftover);
    return rest >= 1 ? r2(rest) : null;
  });

  /** Häufigste Einträge als Schnell-Chips über dem Eingabefeld. */
  readonly quickChips = computed(() => {
    const counts = new Map<string, number>();
    const entries = this.data()
      .months.flatMap((m) => m.entries)
      .filter((e) => e.kind === 'expense')
      .slice(-80);
    for (const e of entries) {
      const word = e.note
        .replace(/[\d.,€+\-−]+/g, ' ')
        .replace(/\b(euro|eur|am|gestern|heute|vorgestern|für|mit|um)\b/gi, ' ')
        .trim()
        .split(/\s+/)[0];
      if (!word || word.length < 3 || STOPWORDS.has(word.toLowerCase())) continue;
      const key = word[0].toUpperCase() + word.slice(1).toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const top = [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([w]) => w);
    const chips = [...new Set([...top, ...DEFAULT_CHIPS])].slice(0, 4);
    return [...chips, 'Kein Mittag'];
  });

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

  private backupReminder(): Tip | null {
    const d = this.data();
    const count = d.months.reduce((n, m) => n + m.entries.length, 0);
    if (count < 15) return null;
    const last = d.settings.lastExport ? new Date(d.settings.lastExport).getTime() : 0;
    if (Date.now() - last < 30 * 86400000) return null;
    return {
      level: 'info',
      text: 'Du hast länger keine Sicherung gemacht. Tipp in den Einstellungen auf „Exportieren“, damit deine Daten nicht verloren gehen.',
    };
  }

  private update(fn: (d: AppData) => void) {
    const copy = structuredClone(this.data());
    fn(copy);
    this.data.set(copy);
  }

  private updateMonth(fn: (m: Month) => void, id = this.currentId()) {
    this.update((d) => {
      const m = d.months.find((x) => x.id === id);
      if (m) fn(m);
    });
  }

  createMonth(id: string) {
    if (!this.data().months.some((m) => m.id === id)) {
      const month = newMonth(id, this.data().settings);
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

  setMonthField<K extends 'schoolDays' | 'allowance' | 'skippedLunchGoal' | 'lunchRate'>(key: K, value: number) {
    this.updateMonth((m) => (m[key] = value));
  }

  setMonthBudget(key: keyof Month['budgets'], value: number) {
    this.updateMonth((m) => (m.budgets[key] = value));
  }

  setFixedCosts(costs: Month['fixedCosts']) {
    this.updateMonth((m) => (m.fixedCosts = costs));
  }

  /** Bucht in den Monat des Datums, falls es den gibt, sonst in den aktuellen. */
  addEntry(entry: Omit<Entry, 'id'>): string {
    const target = this.data().months.some((m) => m.id === entry.date.slice(0, 7)) ? entry.date.slice(0, 7) : this.currentId();
    const id = newId();
    this.updateMonth((m) => m.entries.push({ ...entry, id }), target);
    return target;
  }

  updateEntry(id: string, patch: Partial<Omit<Entry, 'id'>>) {
    this.update((d) => {
      for (const m of d.months) {
        const e = m.entries.find((x) => x.id === id);
        if (e) {
          Object.assign(e, patch);
          if (e.kind !== 'expense') delete e.category;
        }
      }
    });
  }

  removeEntry(id: string): { entry: Entry; monthId: string } | null {
    let removed: { entry: Entry; monthId: string } | null = null;
    this.update((d) => {
      for (const m of d.months) {
        const i = m.entries.findIndex((e) => e.id === id);
        if (i >= 0) {
          removed = { entry: m.entries[i], monthId: m.id };
          m.entries.splice(i, 1);
        }
      }
    });
    return removed;
  }

  restoreEntry(entry: Entry, id: string) {
    this.updateMonth((m) => m.entries.push(entry), id);
  }

  toggleSkippedLunch(date: string) {
    this.updateMonth((m) => {
      m.skippedLunchDates = m.skippedLunchDates.includes(date)
        ? m.skippedLunchDates.filter((d) => d !== date)
        : [...m.skippedLunchDates, date].sort();
    });
  }

  private setSkipped(dates: string[], skipped: boolean): string[] {
    const month = this.month()!;
    const changed = dates.filter((d) => month.skippedLunchDates.includes(d) !== skipped);
    if (changed.length) {
      this.updateMonth((m) => {
        const set = new Set(m.skippedLunchDates);
        for (const d of changed) {
          if (skipped) set.add(d);
          else set.delete(d);
        }
        m.skippedLunchDates = [...set].sort();
      });
    }
    return changed;
  }

  saveSettings(settings: Settings) {
    this.update((d) => (d.settings = settings));
  }

  /** Begrüßung abschließen, optional mit Werten aus dem Export (gelten für den aktuellen und neue Monate). */
  finishSetup(patch: Partial<Settings> = {}) {
    this.update((d) => {
      d.settings = { ...d.settings, ...structuredClone(patch), setupDone: true };
      const m = d.months.find((x) => x.id === this.currentId());
      if (m && Object.keys(patch).length) {
        const s = d.settings;
        Object.assign(m, {
          allowance: s.allowance,
          lunchRate: s.lunchRate,
          schoolDays: s.schoolDays,
          fixedCosts: structuredClone(s.fixedCosts),
          budgets: { ...s.budgets },
          skippedLunchGoal: s.skippedLunchGoal,
        });
      }
    });
  }

  /** Bankbuchungen übernehmen. Fehlende Monate werden angelegt, ohne den aktuellen zu wechseln. */
  importBank(entries: Omit<Entry, 'id'>[], hashes: string[], rules: Record<string, ImportCategory>, lastDate: string) {
    this.update((d) => {
      for (const e of entries) {
        const id = e.date.slice(0, 7);
        let m = d.months.find((x) => x.id === id);
        if (!m) {
          m = newMonth(id, d.settings);
          d.months.push(m);
        }
        m.entries.push({ ...e, id: newId() });
      }
      const s = d.settings;
      s.importedHashes = [...new Set([...(s.importedHashes ?? []), ...hashes])];
      s.importRules = { ...(s.importRules ?? {}), ...rules };
      if (!s.lastImport || lastDate > s.lastImport) s.lastImport = lastDate;
    });
  }

  markExported() {
    this.update((d) => (d.settings.lastExport = new Date().toISOString()));
  }

  /** Monatsrest aufs Sparbuch legen. */
  closeMonth(): number {
    const amount = this.closeOffer();
    if (!amount) return 0;
    const m = this.month()!;
    const [y, mo] = m.id.split('-').map(Number);
    const last = new Date(y, mo, 0);
    const date = monthId(new Date()) === m.id ? isoDate(new Date()) : isoDate(last);
    this.addEntry({ date, kind: 'savings', amount, note: 'Monatsrest aufs Sparbuch' });
    return amount;
  }

  /** Verarbeitet eine Chat-Eingabe und gibt die Antwort zurück. */
  send(text: string): string {
    const month = this.month();
    if (!month) return '';
    const today = new Date();
    const ref = monthId(today) === month.id ? today : new Date(Number(month.id.slice(0, 4)), Number(month.id.slice(5)) - 1, 15);
    const results = parseMessages(text, ref);
    const replies = results.map((r) => this.apply(r));
    let answer = replies.length > 1 ? `${replies.length} Einträge:\n` + replies.map((a) => `• ${a.text}`).join('\n') : replies[0].text;
    const chips = replies.flatMap((r) => r.chips ?? []);

    const s = this.summary();
    const touched = results.flatMap((r) => (r.type === 'entry' && r.entry.kind === 'expense' ? [budgetKey(r.entry.category)] : []));
    if (s) {
      for (const key of new Set(touched)) {
        const b = s.budgets.find((x) => x.key === key)!;
        answer += `\n${b.label}: ${leftText(b.budget, b.spent)}.`;
        const warning = this.tips().find((t) => t.text.startsWith(b.label + ':'));
        if (warning) answer += `\n\n⚠️ ${warning.text}`;
      }
      if (s.balance < 0 && results.some((r) => r.type === 'entry')) answer += `\n\n⚠️ ${this.tips()[0].text}`;
    }
    this.updateMonth((m) => {
      const at = new Date().toISOString();
      const reply: ChatMessage = { from: 'app', text: answer, at, ...(chips.length ? { chips: [...new Set(chips)] } : {}) };
      m.chat.push({ from: 'user', text, at }, reply);
      m.chat = m.chat.slice(-200);
    }, month.id);
    return answer;
  }

  private findEntry(query: string): Entry | null {
    const q = query.toLowerCase().replace(/^(den|die|das|meinen|meine|letzten|letzte)\s+/, '');
    const cat = detectCategory(q);
    const entries = [...this.month()!.entries].reverse();
    return (
      entries.find((e) => e.note.toLowerCase().includes(q)) ??
      entries.find((e) => q.split(' ').some((w) => w.length >= 3 && e.note.toLowerCase().includes(w))) ??
      (cat ? entries.find((e) => e.category === cat) : undefined) ??
      null
    );
  }

  private apply(r: ParseResult): Reply {
    const month = this.month()!;
    switch (r.type) {
      case 'help':
        return { text: HELP_TEXT };
      case 'undo': {
        const last = month.entries.at(-1);
        if (!last) return { text: 'Es gibt diesen Monat noch keinen Eintrag zum Löschen.' };
        this.removeEntry(last.id);
        return { text: `Gelöscht: „${last.note}“ (${eur(Math.abs(last.amount))}).` };
      }
      case 'editLast': {
        const last = month.entries.at(-1);
        if (!last) return { text: 'Es gibt diesen Monat noch keinen Eintrag zum Ändern.' };
        const amount = last.amount < 0 ? -r.amount : r.amount;
        this.updateEntry(last.id, { amount });
        return { text: `Geändert: „${last.note}“ von ${eur(Math.abs(last.amount))} auf ${eur(r.amount)}.` };
      }
      case 'editMatch': {
        const e = this.findEntry(r.query);
        if (!e) return { text: `Ich finde diesen Monat keinen Eintrag zu „${r.query}“.`, chips: ['Einträge zeigen'] };
        this.updateEntry(e.id, { amount: e.amount < 0 ? -r.amount : r.amount });
        return { text: `Geändert: „${e.note}“ (${fmtDate(e.date)}) von ${eur(Math.abs(e.amount))} auf ${eur(r.amount)}.` };
      }
      case 'deleteMatch': {
        const e = this.findEntry(r.query);
        if (!e) return { text: `Ich finde diesen Monat keinen Eintrag zu „${r.query}“.` };
        this.removeEntry(e.id);
        return { text: `Gelöscht: „${e.note}“ vom ${fmtDate(e.date)} (${eur(Math.abs(e.amount))}).`, chips: ['rückgängig'] };
      }
      case 'skipLunch': {
        const outside = r.dates.filter((d) => d.slice(0, 7) !== month.id);
        const changed = this.setSkipped(
          r.dates.filter((d) => d.slice(0, 7) === month.id),
          true,
        );
        const n = this.month()!.skippedLunchDates.length;
        let text = changed.length
          ? `${changed.map(fmtDate).join(', ')} ohne Mittagessen eingetragen. Das sind ${n} von ${month.skippedLunchGoal} Tagen, ${eur(n * month.lunchRate)} gespart.`
          : `${r.dates.map(fmtDate).join(', ')} ${r.dates.length > 1 ? 'sind' : 'ist'} schon als Tag ohne Mittagessen eingetragen.`;
        if (outside.length) text += ` ${outside.map(fmtDate).join(', ')} liegt in einem anderen Monat, wechsle dafür links den Monat.`;
        return { text, chips: changed.length ? ['doch gegessen'] : undefined };
      }
      case 'unskipLunch': {
        const changed = this.setSkipped(r.dates, false);
        return {
          text: changed.length
            ? `${changed.map(fmtDate).join(', ')} wieder als normaler Tag mit Mittagessen eingetragen.`
            : `${r.dates.map(fmtDate).join(', ')} war gar nicht als Tag ohne Mittagessen eingetragen.`,
        };
      }
      case 'lunchUnclear':
        return {
          text: 'An welchen Tagen? Schreib z. B. „mo und di kein Mittag“ oder „am 5. und 6. nicht gegessen“, oder tipp die Tage im Mittagessen-Kalender an.',
          chips: ['Kalender öffnen'],
        };
      case 'schoolDays':
        this.setMonthField('schoolDays', r.days);
        return { text: `${r.days} lange Schultage gespeichert. Essensgeld diesen Monat: ${eur(r.days * month.lunchRate)}.` };
      case 'setting':
        return { text: this.applySetting(r.key, r.value) };
      case 'question':
        return this.answer(r);
      case 'entry': {
        const target = this.addEntry(r.entry);
        const e = r.entry;
        const where = target !== month.id ? ` (in ${monthLabel(target)})` : '';
        if (e.kind === 'savings' && e.amount < 0) return { text: `${eur(-e.amount)} am ${fmtDate(e.date)} vom Sparbuch abgehoben${where}.` };
        const what = e.kind === 'income' ? 'Einnahme' : e.kind === 'savings' ? 'Aufs Sparbuch' : CATEGORY_LABELS[e.category ?? 'misc'];
        let text = `${what}: ${eur(e.amount)} am ${fmtDate(e.date)} eingetragen${where}.`;
        if (r.voucher) text += ` Den Gutschein über ${eur(r.voucher)} habe ich nicht mitgezählt.`;
        const chips = e.kind === 'expense' && e.category === 'misc' ? ['rückgängig'] : undefined;
        if (chips) text += ' Falls das keine sonstige Ausgabe war, schreib es mit Kategorie, z. B. „Essen 12“.';
        return { text, chips };
      }
      default:
        if (r.reason === 'noAmount') return { text: 'Wie viel war das? Schreib den Betrag dazu, z. B. „Döner 7,50“.' };
        return {
          text: 'Das hab ich nicht ganz verstanden. Schreib z. B. „Döner 7,50“, „Oma 20 geschenkt“ oder frag mich „Wie viel hab ich noch?“.',
          chips: ['hilfe', 'Wie viel hab ich noch?'],
        };
    }
  }

  private applySetting(key: SettingKey, value: number): string {
    const labels: Record<string, string> = { food: 'Essen', fuel: 'Tanken', misc: 'Sonstiges' };
    const d = this.data().settings;
    switch (key) {
      case 'food':
      case 'fuel':
      case 'misc':
        this.setMonthBudget(key, value);
        this.saveSettings({ ...d, budgets: { ...d.budgets, [key]: value } });
        return `Budget für ${labels[key]} ist jetzt ${eur(value)}, für diesen und alle neuen Monate.`;
      case 'allowance':
        this.setMonthField('allowance', value);
        this.saveSettings({ ...d, allowance: value });
        return `Taschengeld ist jetzt ${eur(value)} pro Monat.`;
      case 'lunchRate':
        this.setMonthField('lunchRate', value);
        this.saveSettings({ ...d, lunchRate: value });
        return `Essensgeld ist jetzt ${eur(value)} pro Schultag.`;
      case 'savingsTarget':
        this.saveSettings({ ...d, savingsTarget: value });
        return `Dein Sparziel ist jetzt ${eur(value)}. Aktuell hast du ${eur(this.totalSavings())}.`;
      case 'savingsBalance': {
        const deposits = r2(this.totalSavings() - d.savingsStart);
        this.saveSettings({ ...d, savingsStart: r2(value - deposits) });
        return `Sparbuch-Stand auf ${eur(value)} gesetzt.`;
      }
    }
  }

  private answer(r: Extract<ParseResult, { type: 'question' }>): Reply {
    const m = this.month()!;
    const s = this.summary()!;
    const budget = (k: 'food' | 'fuel' | 'misc') => s.budgets.find((b) => b.key === k)!;
    switch (r.topic) {
      case 'balance':
        return {
          text: `Gerade hast du ${eur(s.balance)} übrig. Wenn du alle Budgets ausschöpfst, bleiben am Monatsende ${eur(s.forecastLeftover)} fürs Sparbuch.`,
        };
      case 'food': {
        const b = budget('food');
        const daily = this.dailyFood();
        return {
          text:
            `Essen: ${leftText(b.budget, b.spent)}.` +
            (daily ? ` Das sind etwa ${eur(daily.perDay)} pro Schultag für die restlichen ${daily.days} Tage.` : ''),
        };
      }
      case 'daily': {
        const daily = this.dailyFood();
        return {
          text: daily
            ? `Heute kannst du etwa ${eur(daily.perDay)} fürs Essen ausgeben (${eur(daily.left)} für ${daily.days} Schultage).`
            : 'Für diesen Monat sind keine Schultage mehr übrig.',
        };
      }
      case 'fuel':
      case 'misc': {
        const b = budget(r.topic);
        return { text: `${b.label}: ${leftText(b.budget, b.spent)}.` };
      }
      case 'spent': {
        if (r.category) {
          const list = m.entries.filter((e) => e.kind === 'expense' && e.category === r.category);
          const total = r2(list.reduce((a, e) => a + e.amount, 0));
          return { text: `Für ${CATEGORY_LABELS[r.category]} hast du diesen Monat ${eur(total)} ausgegeben (${list.length} Einträge).` };
        }
        const lines = (Object.keys(s.spentByCategory) as ExpenseCategory[])
          .filter((c) => s.spentByCategory[c] > 0)
          .map((c) => `• ${CATEGORY_LABELS[c]}: ${eur(s.spentByCategory[c])}`);
        return {
          text: `Diesen Monat hast du ${eur(s.expensesTotal)} ausgegeben, dazu ${eur(s.fixedTotal)} Fixkosten.${lines.length ? '\n' + lines.join('\n') : ''}`,
        };
      }
      case 'income':
        return {
          text: `Einnahmen diesen Monat: ${eur(s.incomeTotal)} (Taschengeld ${eur(m.allowance)}, Essensgeld ${eur(s.lunchMoney)}${s.extraIncome ? `, dazu bekommen ${eur(s.extraIncome)}` : ''}).`,
        };
      case 'savings':
        return {
          text: `Diesen Monat hast du ${eur(s.deposited)} aufs Sparbuch gelegt, geplant sind ${eur(s.plannedSavings)}. Insgesamt sind ${eur(this.totalSavings())} am Sparbuch.`,
        };
      case 'goal': {
        const total = this.totalSavings();
        const target = this.data().settings.savingsTarget;
        if (total >= target) return { text: `Ja! Mit ${eur(total)} hast du dein Sparziel von ${eur(target)} schon erreicht. 🎉` };
        const perMonth = Math.max(s.plannedSavings, 1);
        const months = Math.ceil((target - total) / perMonth);
        return {
          text: `Dir fehlen noch ${eur(target - total)} bis ${eur(target)}. Wenn du jeden Monat ${eur(perMonth)} sparst, schaffst du es in etwa ${months} ${months === 1 ? 'Monat' : 'Monaten'}.`,
        };
      }
      case 'lunch':
        return {
          text: `Diesen Monat ${s.skippedLunchDays} von ${m.skippedLunchGoal} Tagen ohne Mittagessen, dadurch ${eur(s.skippedLunchSaved)} gespart.`,
        };
      case 'biggest': {
        const top = m.entries
          .filter((e) => e.kind === 'expense')
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3);
        if (!top.length) return { text: 'Diesen Monat gibt es noch keine Ausgaben.' };
        return { text: 'Deine größten Ausgaben diesen Monat:\n' + top.map((e) => `• ${e.note} (${fmtDate(e.date)}): ${eur(e.amount)}`).join('\n') };
      }
      case 'afford': {
        const amount = r.amount ?? 0;
        const misc = budget('misc');
        const miscLeft = r2(misc.budget - misc.spent);
        if (amount <= miscLeft) {
          return { text: `Ja. Aus Sonstiges bleiben dann noch ${eur(miscLeft - amount)}, dein Sparplan bleibt gleich.` };
        }
        if (amount <= s.forecastLeftover + Math.max(0, miscLeft)) {
          return {
            text: `Geht, aber dann legst du diesen Monat ${eur(amount - Math.max(0, miscLeft))} weniger aufs Sparbuch. Am Monatsende blieben noch ${eur(s.forecastLeftover - amount + Math.max(0, miscLeft))}.`,
          };
        }
        return {
          text: `Eher nicht. Dir fehlen dafür ${eur(amount - s.forecastLeftover - Math.max(0, miscLeft))}, wenn du deine anderen Budgets einhältst. Vielleicht nächsten Monat?`,
        };
      }
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
