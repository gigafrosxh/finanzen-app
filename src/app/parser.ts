import { Entry, ExpenseCategory } from './models';

export type ParseResult =
  | { type: 'entry'; entry: Omit<Entry, 'id'> }
  | { type: 'skipLunch'; date: string }
  | { type: 'schoolDays'; days: number }
  | { type: 'unknown' };

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const CATEGORY_WORDS: [ExpenseCategory, RegExp][] = [
  ['fuel', /tank|sprit|benzin|diesel/],
  ['food', /essen|mc ?d|mäc+i|macc?i|mcdonald|döner|doner|kebab|billa|spar\b|hofer|lidl|pizza|burger|kfc|subway|jause|mittag|snack|bäcker/],
  ['clothes', /gewand|kleid|hose|schuh|jacke|pulli|shirt|hoodie/],
  ['haircut', /friseur|frisör|haar/],
];

/** Liest Datum aus "gestern", "vorgestern" oder "am 5." / "5.10.". */
function parseDate(text: string, today: Date): Date {
  if (/vorgestern/.test(text)) return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);
  if (/gestern/.test(text)) return new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const m = text.match(/\bam (\d{1,2})\.(?:(\d{1,2})\.)?/);
  if (m) {
    const month = m[2] ? Number(m[2]) - 1 : today.getMonth();
    return new Date(today.getFullYear(), month, Number(m[1]));
  }
  return today;
}

function stripDate(text: string): string {
  return text.replace(/vorgestern|gestern|heute|\bam \d{1,2}\.(\d{1,2}\.)?/g, ' ');
}

export function parseMessage(input: string, today = new Date()): ParseResult {
  const text = input.toLowerCase().trim();
  if (!text) return { type: 'unknown' };
  const date = isoDate(parseDate(text, today));

  if (/(kein|nicht|ohne)\s*(\w+\s+)?mittag|nicht (zu mittag )?gegessen|mittag (ausgelassen|übersprungen)/.test(text)) {
    return { type: 'skipLunch', date };
  }

  const schoolDays = text.match(/(\d{1,2})\s*(lange )?schultage|schultage\s*:?\s*(\d{1,2})/);
  if (schoolDays) return { type: 'schoolDays', days: Number(schoolDays[1] ?? schoolDays[3]) };

  const amountMatch = stripDate(text).match(/(\d+(?:[.,]\d{1,2})?)\s*(€|euro|eur)?/);
  if (!amountMatch) return { type: 'unknown' };
  const amount = Number(amountMatch[1].replace(',', '.'));
  if (!(amount > 0)) return { type: 'unknown' };
  const note = input.trim();

  if (/sparbuch|gespart|angespart|sparen|eingezahlt/.test(text)) {
    return { type: 'entry', entry: { date, kind: 'savings', amount, note } };
  }
  if (/geschenk|bekommen|gekriegt|erhalten|geburtstag|einnahme|verdient|überwies|überweisung|zurückgezahlt/.test(text)) {
    return { type: 'entry', entry: { date, kind: 'income', amount, note } };
  }
  const category = CATEGORY_WORDS.find(([, re]) => re.test(text))?.[0] ?? 'misc';
  return { type: 'entry', entry: { date, kind: 'expense', category, amount, note } };
}
