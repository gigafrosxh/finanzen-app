import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SwUpdate } from '@angular/service-worker';
import { eur, r2 } from './budget';
import { CATEGORY_ICONS, CATEGORY_LABELS, Entry, EntryKind, ExpenseCategory, Settings } from './models';
import { isoDate } from './parser';
import { Store, fmtDate, monthLabel } from './store';

type View = 'overview' | 'chat' | 'calendar' | 'entries' | 'stats' | 'settings';
type EntryFilter = 'all' | ExpenseCategory | 'income' | 'savings';

interface CalendarDay {
  iso: string;
  day: number;
  weekend: boolean;
  skipped: boolean;
  today: boolean;
}

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(Store);
  protected readonly eur = eur;
  protected readonly Math = Math;
  protected readonly fmtDate = fmtDate;
  protected readonly monthLabel = monthLabel;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly categoryIcons = CATEGORY_ICONS;
  protected readonly categories = Object.keys(CATEGORY_LABELS) as ExpenseCategory[];
  protected readonly weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  protected readonly view = signal<View>('overview');
  protected readonly sidebarOpen = signal(false);
  protected readonly toast = signal<string | null>(null);
  protected readonly toastUndo = signal<(() => void) | null>(null);
  protected readonly search = signal('');
  protected readonly filter = signal<EntryFilter>('all');
  protected readonly filters: [EntryFilter, string][] = [
    ['all', 'Alle'],
    ['food', 'Essen'],
    ['fuel', 'Tanken'],
    ['clothes', 'Gewand'],
    ['haircut', 'Friseur'],
    ['misc', 'Sonstiges'],
    ['income', 'Einnahmen'],
    ['savings', 'Sparbuch'],
  ];
  protected editingId: string | null = null;
  protected readonly formOpen = signal(false);
  protected readonly planOpen = signal(true);

  protected message = '';
  protected form = this.emptyForm();
  protected settingsDraft: Settings = structuredClone(this.store.data().settings);

  private readonly chatEnd = viewChild<ElementRef<HTMLElement>>('chatEnd');
  private toastTimer?: ReturnType<typeof setTimeout>;

  protected readonly sortedEntries = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    return [...(this.store.month()?.entries ?? [])]
      .filter((e) => f === 'all' || (f === 'income' || f === 'savings' ? e.kind === f : e.kind === 'expense' && e.category === f))
      .filter((e) => !q || e.note.toLowerCase().includes(q) || this.entryLabel(e).toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  protected readonly entriesTotal = computed(() =>
    r2(this.sortedEntries().reduce((sum, e) => sum + (e.kind === 'expense' ? -e.amount : e.amount), 0)),
  );

  protected readonly categoryBars = computed(() => {
    const s = this.store.summary();
    if (!s) return [];
    const rows = this.categories.map((c) => ({ key: c, label: CATEGORY_LABELS[c], icon: CATEGORY_ICONS[c], value: s.spentByCategory[c] }));
    const max = Math.max(1, ...rows.map((r) => r.value));
    return rows.map((r) => ({ ...r, pct: (r.value / max) * 100 }));
  });

  protected readonly historyBars = computed(() => {
    const h = this.store.history();
    const max = Math.max(1, ...h.flatMap((x) => [x.spent, Math.max(0, x.saved)]));
    return h.map((x) => ({ ...x, spentPct: (x.spent / max) * 100, savedPct: (Math.max(0, x.saved) / max) * 100 }));
  });

  protected readonly calendar = computed<(CalendarDay | null)[]>(() => {
    const m = this.store.month();
    if (!m) return [];
    const [y, mo] = m.id.split('-').map(Number);
    const first = new Date(y, mo - 1, 1);
    const days = new Date(y, mo, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const todayIso = isoDate(new Date());
    const cells: (CalendarDay | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, mo - 1, d);
      const iso = isoDate(date);
      cells.push({
        iso,
        day: d,
        weekend: date.getDay() === 0 || date.getDay() === 6,
        skipped: m.skippedLunchDates.includes(iso),
        today: iso === todayIso,
      });
    }
    return cells;
  });

  constructor() {
    // Neue Version automatisch laden: beim Start und immer wenn die App wieder geöffnet wird
    const sw = inject(SwUpdate);
    if (sw.isEnabled) {
      sw.versionUpdates.subscribe((e) => {
        if (e.type === 'VERSION_READY') document.location.reload();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') sw.checkForUpdate().catch(() => {});
      });
    }
    effect(() => {
      // Chat beim Öffnen oder bei neuer Nachricht nach unten scrollen
      this.store.month()?.chat.length;
      if (this.view() === 'chat') {
        queueMicrotask(() => this.chatEnd()?.nativeElement.scrollIntoView({ block: 'end' }));
      }
    });
  }

  protected show(view: View) {
    if (view === 'settings') this.settingsDraft = structuredClone(this.store.data().settings);
    this.view.set(view);
    this.sidebarOpen.set(false);
  }

  protected selectMonth(id: string) {
    this.store.currentId.set(id);
    if (this.view() === 'settings') this.view.set('overview');
    this.sidebarOpen.set(false);
  }

  protected newMonth() {
    const id = this.store.nextMonthId();
    if (!confirm(`${monthLabel(id)} anlegen?`)) return;
    this.store.createMonth(id);
    this.show('overview');
  }

  protected closeMonth() {
    const amount = this.store.closeMonth();
    if (amount) this.showToast(`${eur(amount)} aufs Sparbuch gelegt. 🎉`);
  }

  protected tapChip(chip: string) {
    if (chip === 'Einträge zeigen') return this.show('entries');
    if (chip === 'Kalender öffnen') return this.show('calendar');
    this.message = chip;
    this.send();
  }

  protected quickChip(chip: string, input: HTMLInputElement) {
    if (chip === 'Kein Mittag') {
      this.message = 'heute kein Mittagessen';
      this.send();
      return;
    }
    this.message = chip + ' ';
    input.focus();
  }

  protected deleteEntry(e: Entry) {
    const removed = this.store.removeEntry(e.id);
    if (!removed) return;
    this.showToast(`„${e.note}“ gelöscht.`, () => this.store.restoreEntry(removed.entry, removed.monthId));
  }

  protected undoToast() {
    this.toastUndo()?.();
    this.toast.set(null);
    this.toastUndo.set(null);
  }

  protected deleteMonth() {
    const m = this.store.month();
    if (m && confirm(`${monthLabel(m.id)} mit allen Einträgen löschen?`)) this.store.deleteMonth(m.id);
  }

  protected send() {
    const text = this.message.trim();
    if (!text) return;
    const answer = this.store.send(text);
    this.message = '';
    if (this.view() !== 'chat') this.showToast(answer);
  }

  protected showToast(text: string, undo: (() => void) | null = null) {
    this.toast.set(text);
    this.toastUndo.set(undo);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.set(null);
      this.toastUndo.set(null);
    }, undo ? 7000 : 5000);
  }

  protected emptyForm() {
    return {
      kind: 'expense' as EntryKind,
      category: 'food' as ExpenseCategory,
      amount: null as number | null,
      date: isoDate(new Date()),
      note: '',
    };
  }

  protected openForm() {
    this.editingId = null;
    this.form = this.emptyForm();
    this.formOpen.set(true);
  }

  protected editEntry(e: Entry) {
    this.editingId = e.id;
    this.form = {
      kind: e.kind,
      category: e.category ?? 'misc',
      amount: Math.abs(e.amount),
      date: e.date,
      note: e.note,
    };
    this.formOpen.set(true);
  }

  protected deleteEditing() {
    const id = this.editingId;
    const e = this.store.month()?.entries.find((x) => x.id === id);
    this.formOpen.set(false);
    if (e) this.deleteEntry(e);
  }

  protected submitForm() {
    const f = this.form;
    if (!f.amount || f.amount <= 0) return;
    const original = this.editingId ? this.store.month()?.entries.find((x) => x.id === this.editingId) : null;
    const entry: Omit<Entry, 'id'> = {
      date: f.date,
      kind: f.kind,
      amount: r2(f.kind === 'savings' && original && original.amount < 0 ? -f.amount : f.amount),
      note: f.note.trim() || (f.kind === 'expense' ? CATEGORY_LABELS[f.category] : f.kind === 'income' ? 'Einnahme' : 'Sparbuch'),
      ...(f.kind === 'expense' ? { category: f.category } : {}),
    };
    this.formOpen.set(false);
    if (original) {
      this.store.updateEntry(original.id, entry);
      this.showToast(`${entry.note}: geändert.`);
      return;
    }
    this.store.addEntry(entry);
    this.showToast(`${entry.note}: ${eur(entry.amount)} eingetragen.`);
  }

  protected entryLabel(e: Entry): string {
    if (e.kind === 'income') return 'Einnahme';
    if (e.kind === 'savings') return e.amount < 0 ? 'Vom Sparbuch' : 'Sparbuch';
    return CATEGORY_LABELS[e.category ?? 'misc'];
  }

  protected entryIcon(e: Entry): string {
    if (e.kind === 'income') return '🎁';
    if (e.kind === 'savings') return '🏦';
    return CATEGORY_ICONS[e.category ?? 'misc'];
  }

  protected changeSchoolDays(delta: number) {
    const m = this.store.month();
    if (m) this.store.setMonthField('schoolDays', Math.max(0, Math.min(31, m.schoolDays + delta)));
  }

  protected numberInput(value: unknown): number {
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? r2(n) : 0;
  }

  protected addFixedCost() {
    this.settingsDraft.fixedCosts.push({ name: '', amount: 0 });
  }

  protected removeFixedCost(i: number) {
    this.settingsDraft.fixedCosts.splice(i, 1);
  }

  protected saveSettings(applyToMonth: boolean) {
    const s = this.settingsDraft;
    const old = this.store.data().settings;
    // Leere Felder behalten den alten Wert, statt 0 zu speichern
    const num = (v: unknown, fallback: number) => (v === null || v === undefined || v === '' ? fallback : this.numberInput(v));
    s.fixedCosts = s.fixedCosts.filter((f) => f.name.trim()).map((f) => ({ name: f.name.trim(), amount: num(f.amount, 0) }));
    for (const k of ['allowance', 'lunchRate', 'schoolDays', 'skippedLunchGoal', 'savingsStart', 'savingsTarget'] as const) {
      s[k] = num(s[k], old[k]);
    }
    for (const k of ['food', 'fuel', 'misc'] as const) s.budgets[k] = num(s.budgets[k], old.budgets[k]);
    this.store.saveSettings(structuredClone(s));
    if (applyToMonth) {
      this.store.setFixedCosts(structuredClone(s.fixedCosts));
      this.store.setMonthBudget('food', s.budgets.food);
      this.store.setMonthBudget('fuel', s.budgets.fuel);
      this.store.setMonthBudget('misc', s.budgets.misc);
      this.store.setMonthField('allowance', s.allowance);
      this.store.setMonthField('lunchRate', s.lunchRate);
      this.store.setMonthField('skippedLunchGoal', s.skippedLunchGoal);
    }
    this.showToast('Einstellungen gespeichert.');
  }

  protected exportData() {
    const blob = new Blob([this.store.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finanzen-sicherung-${isoDate(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.store.markExported();
    this.settingsDraft.lastExport = this.store.data().settings.lastExport;
  }

  protected async importData(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!confirm('Alle Daten auf diesem Gerät durch die Sicherung ersetzen?')) return;
    try {
      this.store.importJson(await file.text());
      this.settingsDraft = structuredClone(this.store.data().settings);
      this.showToast('Sicherung geladen.');
    } catch {
      this.showToast('Die Datei ist keine gültige Sicherung.');
    }
  }

  protected percent(ratio: number): number {
    return Math.min(100, Math.round(ratio * 100));
  }
}
