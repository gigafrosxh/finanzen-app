import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { eur, r2 } from './budget';
import { CATEGORY_ICONS, CATEGORY_LABELS, Entry, EntryKind, ExpenseCategory, Settings } from './models';
import { isoDate } from './parser';
import { Store, fmtDate, monthLabel } from './store';

type View = 'overview' | 'chat' | 'calendar' | 'entries' | 'settings';

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
  protected readonly formOpen = signal(false);
  protected readonly planOpen = signal(true);

  protected message = '';
  protected form = this.emptyForm();
  protected settingsDraft: Settings = structuredClone(this.store.data().settings);

  private readonly chatEnd = viewChild<ElementRef<HTMLElement>>('chatEnd');
  private toastTimer?: ReturnType<typeof setTimeout>;

  protected readonly sortedEntries = computed(() =>
    [...(this.store.month()?.entries ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
  );

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
    this.store.createMonth(this.store.nextMonthId());
    this.show('overview');
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

  protected showToast(text: string) {
    this.toast.set(text);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 5000);
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
    this.form = this.emptyForm();
    this.formOpen.set(true);
  }

  protected submitForm() {
    const f = this.form;
    if (!f.amount || f.amount <= 0) return;
    const entry: Omit<Entry, 'id'> = {
      date: f.date,
      kind: f.kind,
      amount: r2(f.amount),
      note: f.note.trim() || (f.kind === 'expense' ? CATEGORY_LABELS[f.category] : f.kind === 'income' ? 'Einnahme' : 'Sparbuch'),
      ...(f.kind === 'expense' ? { category: f.category } : {}),
    };
    this.store.addEntry(entry);
    this.formOpen.set(false);
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
    const num = (v: unknown) => this.numberInput(v ?? 0);
    s.fixedCosts = s.fixedCosts.filter((f) => f.name.trim()).map((f) => ({ name: f.name.trim(), amount: num(f.amount) }));
    for (const k of ['allowance', 'lunchRate', 'schoolDays', 'skippedLunchGoal', 'savingsStart', 'savingsTarget'] as const) {
      s[k] = num(s[k]);
    }
    for (const k of ['food', 'fuel', 'misc'] as const) s.budgets[k] = num(s.budgets[k]);
    this.store.saveSettings(structuredClone(s));
    if (applyToMonth) {
      this.store.setFixedCosts(structuredClone(s.fixedCosts));
      this.store.setMonthBudget('food', s.budgets.food);
      this.store.setMonthBudget('fuel', s.budgets.fuel);
      this.store.setMonthBudget('misc', s.budgets.misc);
      this.store.setMonthField('allowance', s.allowance);
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
