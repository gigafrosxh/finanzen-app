import { AppData, CATEGORY_LABELS, ExpenseCategory, Month } from './models';

export const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));

export function eur(n: number): string {
  return n.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
}

export type BudgetKey = 'food' | 'fuel' | 'misc';
export type Status = 'ok' | 'warn' | 'over';

export interface BudgetLine {
  key: BudgetKey;
  label: string;
  budget: number;
  spent: number;
  ratio: number;
  status: Status;
}

export interface Summary {
  lunchMoney: number;
  extraIncome: number;
  incomeTotal: number;
  fixedTotal: number;
  spentByCategory: Record<ExpenseCategory, number>;
  expensesTotal: number;
  deposited: number;
  plannedSavings: number;
  balance: number;
  forecastLeftover: number;
  skippedLunchDays: number;
  skippedLunchSaved: number;
  monthProgress: number;
  budgets: BudgetLine[];
}

export interface Tip {
  level: 'info' | 'warn' | 'danger' | 'good';
  text: string;
}

export interface Goal {
  label: string;
  detail: string;
  progress: number; // 0..1
  done: boolean;
}

/** Anteil des Monats, der schon vorbei ist (0..1). */
export function monthProgress(monthId: string, today: Date): number {
  const [y, m] = monthId.split('-').map(Number);
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  if (ty * 12 + tm < y * 12 + m) return 0;
  if (ty * 12 + tm > y * 12 + m) return 1;
  const days = new Date(y, m, 0).getDate();
  return today.getDate() / days;
}

export function summarize(month: Month, today = new Date()): Summary {
  const lunchMoney = r2(month.schoolDays * month.lunchRate);
  const extraIncome = sum(month.entries.filter((e) => e.kind === 'income').map((e) => e.amount));
  const fixedTotal = sum(month.fixedCosts.map((f) => f.amount));
  const expenses = month.entries.filter((e) => e.kind === 'expense');
  const spentByCategory = { food: 0, fuel: 0, clothes: 0, haircut: 0, misc: 0 } as Record<ExpenseCategory, number>;
  for (const e of expenses) {
    const c = e.category ?? 'misc';
    spentByCategory[c] = r2(spentByCategory[c] + e.amount);
  }
  const expensesTotal = sum(expenses.map((e) => e.amount));
  const deposited = sum(month.entries.filter((e) => e.kind === 'savings').map((e) => e.amount));
  const { food, fuel, misc } = month.budgets;
  const plannedSavings = r2(month.allowance + lunchMoney - fixedTotal - fuel - food - misc);
  const incomeTotal = r2(month.allowance + lunchMoney + extraIncome);
  const balance = r2(incomeTotal - fixedTotal - expensesTotal - deposited);

  const spent: Record<BudgetKey, number> = {
    food: spentByCategory.food,
    fuel: spentByCategory.fuel,
    misc: r2(spentByCategory.misc + spentByCategory.clothes + spentByCategory.haircut),
  };
  const progress = monthProgress(month.id, today);
  const budgets: BudgetLine[] = (['food', 'fuel', 'misc'] as BudgetKey[]).map((key) => {
    const budget = month.budgets[key];
    const ratio = budget > 0 ? spent[key] / budget : spent[key] > 0 ? 2 : 0;
    const ahead = ratio - progress > 0.2 && ratio > 0.3;
    const status: Status = spent[key] > budget ? 'over' : ratio >= 0.8 || ahead ? 'warn' : 'ok';
    return { key, label: key === 'misc' ? 'Sonstiges' : CATEGORY_LABELS[key], budget, spent: spent[key], ratio, status };
  });
  // Ist der Monat vorbei, wird nichts mehr ausgegeben
  const stillPlanned = progress >= 1 ? 0 : sum(budgets.map((b) => Math.max(0, b.budget - b.spent)));
  const skippedLunchDays = month.skippedLunchDates.length;

  return {
    lunchMoney,
    extraIncome,
    incomeTotal,
    fixedTotal,
    spentByCategory,
    expensesTotal,
    deposited,
    plannedSavings,
    balance,
    forecastLeftover: r2(balance - stillPlanned),
    skippedLunchDays,
    skippedLunchSaved: r2(skippedLunchDays * month.lunchRate),
    monthProgress: progress,
    budgets,
  };
}

const ADVICE: Record<BudgetKey, string> = {
  food: 'Billa oder Döner statt Mäcci streckt das Budget, oder lass einen weiteren Tag das Mittagessen aus.',
  fuel: 'Nimm einen Tankgutschein oder fahr ein paar Strecken mit Öffis oder Rad. Sonst kommt es aus Sonstiges.',
  misc: 'Verschieb Gewand oder Friseur auf nächsten Monat, wenn es nicht dringend ist.',
};

export function tips(month: Month, s: Summary): Tip[] {
  const out: Tip[] = [];
  if (s.balance < 0) {
    out.push({
      level: 'danger',
      text: `Du bist ${eur(-s.balance)} im Minus. Leg diesen Monat weniger aufs Sparbuch oder gleich es nächsten Monat aus.`,
    });
  }
  for (const b of s.budgets) {
    if (b.status === 'over') {
      out.push({ level: 'danger', text: `${b.label}: ${eur(b.spent - b.budget)} über dem Budget. ${ADVICE[b.key]}` });
    } else if (b.status === 'warn') {
      out.push({
        level: 'warn',
        text: `${b.label}: nur noch ${eur(b.budget - b.spent)} übrig (${Math.round(b.ratio * 100)} % verbraucht). ${ADVICE[b.key]}`,
      });
    }
  }
  if (s.balance >= 0 && s.forecastLeftover < 0) {
    out.push({
      level: 'warn',
      text: `Wenn du alle Budgets ausschöpfst, fehlen dir am Monatsende ${eur(-s.forecastLeftover)}. Spar am besten bei Sonstiges.`,
    });
  }
  const missing = month.skippedLunchGoal - s.skippedLunchDays;
  if (missing > 0 && s.monthProgress >= 1) {
    out.push({
      level: 'info',
      text: `Diesen Monat ${s.skippedLunchDays} von ${month.skippedLunchGoal} Tagen ohne Mittagessen. Nächsten Monat klappt's besser!`,
    });
  } else if (missing > 0 && s.monthProgress >= 0.5) {
    out.push({
      level: 'info',
      text: `Erst ${s.skippedLunchDays} von ${month.skippedLunchGoal} Tagen ohne Mittagessen. Damit sich Claude Pro ausgeht, lass noch ${missing} ${missing === 1 ? 'Tag' : 'Tage'} aus.`,
    });
  }
  if (out.length === 0) {
    out.push({
      level: 'good',
      text:
        s.forecastLeftover > 0
          ? `Alles im grünen Bereich. Voraussichtlich kannst du am Monatsende noch ${eur(s.forecastLeftover)} aufs Sparbuch legen.`
          : 'Alles im grünen Bereich.',
    });
  }
  return out;
}

export function totalSavings(data: AppData): number {
  return r2(
    data.settings.savingsStart +
      sum(data.months.flatMap((m) => m.entries.filter((e) => e.kind === 'savings').map((e) => e.amount))),
  );
}

export function goals(month: Month, s: Summary, data: AppData): Goal[] {
  const out: Goal[] = s.budgets.map((b) => ({
    label: `${b.label} im Budget`,
    detail: `${eur(b.spent)} von ${eur(b.budget)}`,
    progress: Math.min(1, b.ratio),
    done: b.spent <= b.budget && s.monthProgress >= 1,
  }));
  out.push({
    label: 'Tage ohne Mittagessen (Claude Pro)',
    detail: `${s.skippedLunchDays} von ${month.skippedLunchGoal} Tagen`,
    progress: month.skippedLunchGoal > 0 ? Math.min(1, s.skippedLunchDays / month.skippedLunchGoal) : 1,
    done: s.skippedLunchDays >= month.skippedLunchGoal,
  });
  out.push({
    label: 'Monats-Sparziel',
    detail: `${eur(s.deposited)} von ${eur(s.plannedSavings)} aufs Sparbuch gelegt`,
    progress: s.plannedSavings > 0 ? Math.min(1, s.deposited / s.plannedSavings) : 1,
    done: s.deposited >= s.plannedSavings,
  });
  const total = totalSavings(data);
  const target = data.settings.savingsTarget;
  out.push({
    label: 'Gesamt-Sparziel',
    detail: `${eur(total)} von ${eur(target)} am Sparbuch`,
    progress: target > 0 ? Math.min(1, total / target) : 1,
    done: total >= target,
  });
  return out;
}

/** Werktage (Mo–Fr) von heute bis Monatsende, heute mitgezählt. */
export function remainingWeekdays(monthId: string, today: Date): number {
  const [y, m] = monthId.split('-').map(Number);
  const progress = monthProgress(monthId, today);
  if (progress >= 1) return 0;
  const start = progress === 0 ? 1 : today.getDate();
  const days = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = start; d <= days; d++) {
    const wd = new Date(y, m - 1, d).getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

export interface DailyFood {
  left: number;
  days: number;
  perDay: number;
}

/** Wie viel pro Schultag noch fürs Essen bleibt. Schultage werden auf die Werktage begrenzt. */
export function dailyFood(month: Month, s: Summary, today = new Date()): DailyFood | null {
  const weekdays = remainingWeekdays(month.id, today);
  if (weekdays === 0) return null;
  const food = s.budgets.find((b) => b.key === 'food')!;
  const left = r2(Math.max(0, food.budget - food.spent));
  const days = Math.max(1, Math.min(weekdays, month.schoolDays));
  return { left, days, perDay: r2(left / days) };
}

const FOOD_PLACES: [string, RegExp][] = [
  ["McDonald's", /mc ?d|mäc|mec|macc?i|mcdonald/],
  ['Döner', /döner|doner|dürüm|kebap|kebab/],
  ['Billa', /billa/],
  ['Spar', /\bspar\b|eurospar|interspar/],
  ['Hofer / Lidl / Penny', /hofer|lidl|penny/],
  ['Bäcker', /bäck|semmel|ströck|anker|backwerk/],
  ['Pizza', /pizza/],
  ['Asia / Sushi', /asia|sushi|nudel/],
  ['Getränke', /red ?bull|monster|cola|kaffee|getränk|starbucks|bubble/],
];

export interface PlaceStat {
  place: string;
  count: number;
  total: number;
  avg: number;
}

export function foodPlaces(months: Month[]): PlaceStat[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const e of months.flatMap((m) => m.entries)) {
    if (e.kind !== 'expense' || e.category !== 'food') continue;
    const note = e.note.toLowerCase();
    const place = FOOD_PLACES.find(([, re]) => re.test(note))?.[0] ?? 'Anderes Essen';
    const cur = map.get(place) ?? { count: 0, total: 0 };
    map.set(place, { count: cur.count + 1, total: r2(cur.total + e.amount) });
  }
  return [...map.entries()]
    .map(([place, v]) => ({ place, ...v, avg: r2(v.total / v.count) }))
    .sort((a, b) => b.total - a.total);
}

export interface MonthHistory {
  id: string;
  spent: number; // Fixkosten + Ausgaben
  saved: number; // aufs Sparbuch (abzüglich Abhebungen)
}

export function history(months: Month[], count = 6): MonthHistory[] {
  return [...months]
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(-count)
    .map((m) => {
      const s = summarize(m);
      return { id: m.id, spent: r2(s.fixedTotal + s.expensesTotal), saved: s.deposited };
    });
}
