import { Entry, ExpenseCategory } from './models';

export type QuestionTopic =
  | 'balance'
  | 'food'
  | 'fuel'
  | 'misc'
  | 'spent'
  | 'income'
  | 'savings'
  | 'goal'
  | 'lunch'
  | 'daily'
  | 'biggest'
  | 'afford';

export type SettingKey = 'food' | 'fuel' | 'misc' | 'allowance' | 'lunchRate' | 'savingsTarget' | 'savingsBalance';

export type ParseResult =
  | { type: 'entry'; entry: Omit<Entry, 'id'>; voucher?: number }
  | { type: 'skipLunch'; dates: string[] }
  | { type: 'unskipLunch'; dates: string[] }
  | { type: 'lunchUnclear' }
  | { type: 'schoolDays'; days: number }
  | { type: 'question'; topic: QuestionTopic; amount?: number; category?: ExpenseCategory }
  | { type: 'setting'; key: SettingKey; value: number }
  | { type: 'editLast'; amount: number }
  | { type: 'editMatch'; query: string; amount: number }
  | { type: 'deleteMatch'; query: string }
  | { type: 'undo' }
  | { type: 'help' }
  | { type: 'unknown'; reason: 'empty' | 'noAmount' | 'unclear' };

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- Wörter und Tippfehler ----------

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function tokens(text: string): string[] {
  return text.split(/[^a-zäöüß&+]+/).filter(Boolean);
}

/**
 * Findet ein Schlüsselwort: kurze Wörter (≤ 4 Zeichen) nur als ganzes Wort,
 * längere auch als Wortteil oder mit Tippfehlern (1 Fehler, ab 8 Zeichen 2).
 */
export function hasKeyword(text: string, keywords: string[]): boolean {
  const toks = tokens(text);
  for (const kw of keywords) {
    if (kw.includes(' ')) {
      if (text.includes(kw)) return true;
      continue;
    }
    if (kw.length <= 4) {
      if (toks.includes(kw)) return true;
      continue;
    }
    if (text.includes(kw)) return true;
    if (kw.length >= 5) {
      const max = kw.length >= 8 ? 2 : 1;
      if (toks.some((t) => t.length >= 4 && levenshtein(t, kw) <= max)) return true;
    }
  }
  return false;
}

const CATEGORY_KEYWORDS: [ExpenseCategory, string[]][] = [
  [
    'fuel',
    ['tanken', 'getankt', 'tank', 'tanke', 'tankstelle', 'sprit', 'benzin', 'diesel', 'omv', 'shell', 'bp', 'eni', 'jet', 'avia', 'turmöl', 'gutschein'],
  ],
  [
    'food',
    [
      'essen', 'mcdonalds', 'mcdonald', 'mcd', 'mc', 'mäcci', 'mäci', 'mecci', 'macci', 'maci', 'mäcces', 'döner', 'doner', 'dürüm',
      'kebap', 'kebab', 'billa', 'spar', 'eurospar', 'interspar', 'hofer', 'lidl', 'penny', 'merkur', 'pizza', 'burger', 'kfc',
      'subway', 'jause', 'mittag', 'frühstück', 'abendessen', 'snack', 'bäcker', 'semmel', 'leberkäse', 'leberkäs', 'wurstsemmel',
      'asia', 'sushi', 'nudeln', 'kantine', 'mensa', 'buffet', 'getränk', 'trinken', 'redbull', 'red bull', 'monster', 'cola',
      'kaffee', 'eis', 'süßes', 'chips', 'nordsee', 'vapiano', 'starbucks', 'backwerk', 'anker', 'ströck', 'pommes', 'wrap',
      'bubble tea', 'bubbletea', 'mittagessen', 'gegessen',
    ],
  ],
  [
    'clothes',
    [
      'gewand', 'kleidung', 'kleid', 'hose', 'hosen', 'jeans', 'schuhe', 'schuh', 'sneaker', 'jacke', 'pulli', 'pullover', 'shirt', 'hoodie',
      'socken', 'kappe', 'cap', 'zara', 'h&m', 'hm', 'nike', 'adidas', 'zalando', 'primark', 'bershka', 'snipes', 'footlocker',
      'unterhose', 'boxershorts', 'gürtel',
    ],
  ],
  ['haircut', ['friseur', 'frisör', 'frisur', 'barber', 'haare', 'haarschnitt']],
];

export function detectCategory(text: string): ExpenseCategory | null {
  return CATEGORY_KEYWORDS.find(([, kws]) => hasKeyword(text, kws))?.[0] ?? null;
}

// ---------- Datum ----------

const WEEKDAYS: [RegExp, number][] = [
  [/^(montag|mo)$/, 1],
  [/^(dienstag|di)$/, 2],
  [/^(mittwoch|mi)$/, 3],
  [/^(donnerstag|do)$/, 4],
  [/^(freitag|fr)$/, 5],
  [/^(samstag|sa)$/, 6],
  [/^(sonntag|so)$/, 0],
];
const WEEKDAY_LONG = /\b(?:(am|letzten|letzte|vergangenen)\s+)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)s?\b/;

function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Letzter vergangener Tag mit diesem Wochentag (heute zählt mit). */
function lastWeekday(today: Date, wd: number, strictlyPast: boolean): Date {
  let diff = (today.getDay() - wd + 7) % 7;
  if (diff === 0 && strictlyPast) diff = 7;
  return addDays(today, -diff);
}

const NUMBER_WORDS: Record<string, number> = {
  null: 0, ein: 1, eins: 1, eine: 1, einen: 1, einem: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8,
  neun: 9, zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18,
  neunzehn: 19, zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80,
  neunzig: 90, hundert: 100, einhundert: 100,
};
const SLANG_AMOUNTS: Record<string, number> = {
  fünfer: 5, zehner: 10, zwanziger: 20, fuffi: 50, fuffziger: 50, fünfziger: 50, hunderter: 100, hunni: 100,
};

function wordNumber(w: string): number | null {
  if (w in NUMBER_WORDS) return NUMBER_WORDS[w];
  const m = w.match(/^(\p{L}+?)und(\p{L}+)$/u);
  if (m && m[1] in NUMBER_WORDS && m[2] in NUMBER_WORDS) return NUMBER_WORDS[m[1]] + NUMBER_WORDS[m[2]];
  return null;
}

interface DateInfo {
  date: Date;
  rest: string; // Text ohne Datumsangaben
}

function parseDate(text: string, today: Date): DateInfo {
  let rest = text;
  let date = today;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => Date) => {
    const m = rest.match(re);
    if (m) {
      date = fn(m);
      rest = rest.replace(re, ' ');
      return true;
    }
    return false;
  };
  take(/\bvorgestern\b/, () => addDays(today, -2)) ||
    take(/\bgestern\b/, () => addDays(today, -1)) ||
    take(/\bvor (\d+|\p{L}+) tag(en)?\b/u, (m) => addDays(today, -(Number(m[1]) || wordNumber(m[1]) || 0))) ||
    take(/\bvor (einer|1) woche\b/, () => addDays(today, -7)) ||
    take(/\b(?:am )?(\d{1,2})\.(\d{1,2})\.(?:(\d{2,4})\b)?/, (m) => {
      const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.getFullYear();
      return new Date(y, Number(m[2]) - 1, Number(m[1]));
    }) ||
    take(/\bam (\d{1,2})\.?(?=\s|$)/, (m) => new Date(today.getFullYear(), today.getMonth(), Number(m[1]))) ||
    take(WEEKDAY_LONG, (m) => {
      const wd = WEEKDAYS.find(([re]) => re.test(m[2]))![1];
      return lastWeekday(today, wd, !!m[1] && m[1] !== 'am');
    }) ||
    take(/\bam (mo|di|mi|do|fr|sa|so)\b/, (m) => lastWeekday(today, WEEKDAYS.find(([re]) => re.test(m[1]))![1], false));
  rest = rest.replace(/\bheute\b/, ' ');
  return { date, rest };
}

// ---------- Beträge ----------

const CURRENCY = '(?:€|euro|eur|eier|ocken|kröten|steine)';

/** Liest einen Betrag. Bevorzugt Zahlen mit Währung, dann Kommazahlen, dann die letzte ganze Zahl. */
export function parseAmount(text: string): number | null {
  const t = text.replace(/−/g, '-');
  let m = t.match(new RegExp(`(\\d+)\\s*${CURRENCY}\\s*(\\d{1,2})\\b(?!\\s*(?:[.,]?\\d|€|euro|eur|gutschein|tankgutschein))`));
  if (m) return Number(m[1]) + Number(m[2].padEnd(2, '0')) / 100;
  m = t.match(new RegExp(`(\\d+(?:[.,]\\d{1,2})?)\\s*${CURRENCY}|€\\s*(\\d+(?:[.,]\\d{1,2})?)`));
  if (m) return Number((m[1] ?? m[2]).replace(',', '.'));
  m = t.match(/(\d+)[.,](\d{1,2})(?!\d)/);
  if (m) return Number(`${m[1]}.${m[2]}`);
  const ints = [...t.matchAll(/(?<![\d.,])(\d+)(?![\d.,])/g)];
  if (ints.length) return Number(ints[ints.length - 1][1]);
  for (const w of tokens(t)) {
    if (w in SLANG_AMOUNTS) return SLANG_AMOUNTS[w];
  }
  const words = tokens(t);
  for (let i = 0; i < words.length; i++) {
    const n = wordNumber(words[i]);
    if (n !== null && n > 0) {
      const next = words[i + 1] ?? '';
      if (new RegExp(`^${CURRENCY}$`).test(next) || /^(ausgegeben|gezahlt|bezahlt|bekommen|geschenkt|gekriegt)$/.test(next)) {
        const cents = wordNumber(words[i + 2] ?? '');
        return cents !== null && new RegExp(`^${CURRENCY}$`).test(next) ? n + cents / 100 : n;
      }
    }
  }
  return null;
}

// ---------- Absichten ----------

const HELP = /^(hilfe|help|\?|befehle|was kann ich (schreiben|eingeben|machen)\??|was kannst du\??)$/;
const UNDO = /^(rückgängig|undo|zurück|ups|oops|hoppla|letzte[nr]? (eintrag )?(löschen|weg|entfernen)|lösch(e)? (das|den letzten|die letzte)( eintrag| buchung)?|das war falsch)!?$/;
const WITHDRAW = ['abgehoben', 'abheben', 'vom sparbuch', 'sparbuch geholt', 'sparbuch genommen', 'vom konto geholt'];
const SAVINGS = ['sparbuch', 'gespart', 'angespart', 'sparen', 'eingezahlt', 'einzahlen', 'zurückgelegt', 'weggelegt', 'auf die seite'];
const INCOME = [
  'geschenk', 'geschenkt', 'bekommen', 'gekriegt', 'kriegt', 'erhalten', 'geburtstag', 'einnahme', 'verdient', 'überwiesen', 'überweisung',
  'zurückgezahlt', 'zurückbekommen', 'zurück bekommen', 'verkauft', 'lohn', 'gehalt', 'job', 'trinkgeld', 'pfand', 'gewonnen', 'bonus',
  'extra taschengeld', 'rein', 'plus', 'gefunden', 'zugesteckt', 'christkind', 'weihnachten', 'ostern', 'zeugnisgeld',
];
const EXPENSE = ['ausgabe', 'ausgegeben', 'bezahlt', 'gezahlt', 'gekauft', 'kauf', 'einkauf', 'eingekauft', 'gekostet', 'kostet', 'raus', 'minus', 'abo', 'geblecht', 'gelatzt', 'verloren'];

function lunchDates(text: string, rest: string, date: Date, today: Date): string[] {
  // "mo und di", "montag, dienstag" → mehrere Tage dieser bzw. letzter Woche
  const wd = tokens(text)
    .map((t) => WEEKDAYS.find(([re]) => re.test(t))?.[1])
    .filter((x): x is number => x !== undefined);
  if (wd.length >= 2) {
    return [...new Set(wd.map((d) => isoDate(lastWeekday(today, d, false))))].sort();
  }
  const range = text.match(/\b(\d{1,2})\.?\s*(?:und|,|bis|-)\s*(\d{1,2})\.(?!\d)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    const days = /bis|-/.test(range[0]) ? Array.from({ length: Math.max(0, b - a) + 1 }, (_, i) => a + i) : [a, b];
    return days.map((d) => isoDate(new Date(today.getFullYear(), today.getMonth(), d)));
  }
  return [isoDate(date)];
}

function question(text: string): ParseResult | null {
  const isQuestion =
    text.endsWith('?') ||
    /^(wie ?viel|was|wo|wann|welche[rs]?|schaff|reicht|kann ich|darf ich|zeig|übersicht|status|bilanz|stand|wie steht|wie schaut|wie sieht)\b/.test(text);
  if (!isQuestion) return null;
  const amount = parseAmount(text) ?? undefined;
  if (/leisten|kaufen|ausgeben|reicht|kann ich/.test(text) && amount) return { type: 'question', topic: 'afford', amount };
  if (/sparziel|ziel/.test(text)) return { type: 'question', topic: 'goal' };
  if (/pro tag|am tag|täglich|heute noch/.test(text)) return { type: 'question', topic: 'daily' };
  if (/mittag|ohne essen/.test(text)) return { type: 'question', topic: 'lunch' };
  if (/größte|teuerste|meiste/.test(text)) return { type: 'question', topic: 'biggest' };
  if (/spar|gespart/.test(text)) return { type: 'question', topic: 'savings' };
  if (/einnahm|bekommen|verdient|geschenkt/.test(text)) return { type: 'question', topic: 'income' };
  const cat = detectCategory(text);
  if (/ausgegeben|ausgaben|verbraucht|verbrannt|gekostet|gelassen/.test(text) && !/übrig|noch/.test(text)) {
    return { type: 'question', topic: 'spent', ...(cat ? { category: cat } : {}) };
  }
  if (cat === 'food') return { type: 'question', topic: 'food' };
  if (cat === 'fuel') return { type: 'question', topic: 'fuel' };
  if (cat === 'clothes' || cat === 'haircut' || /sonstig/.test(text)) return { type: 'question', topic: 'misc' };
  return { type: 'question', topic: 'balance' };
}

function setting(text: string): ParseResult | null {
  const value = parseAmount(text);
  if (value === null) return null;
  const rules: [RegExp, SettingKey][] = [
    [/(essens?budget|budget (für |fürs )?essen)/, 'food'],
    [/(tankbudget|budget (für |fürs )?tanken)/, 'fuel'],
    [/(sonstiges?budget|budget (für )?sonstiges)/, 'misc'],
    [/^taschengeld (ist |auf |jetzt )*\d|taschengeld (ist |jetzt )?(auf )?\d+ ?(€|euro)? ?(pro monat|im monat|monatlich)|neues taschengeld/, 'allowance'],
    [/essensgeld (pro|am|je) tag|pro schultag/, 'lunchRate'],
    [/sparziel/, 'savingsTarget'],
    [/(sparbuch|kontostand)\s*(stand|ist|hat|sind)|stand (am |vom |des )?sparbuch|auf dem sparbuch (sind|ist|hab ich|habe ich)/, 'savingsBalance'],
  ];
  const hit = rules.find(([re]) => re.test(text));
  return hit ? { type: 'setting', key: hit[1], value } : null;
}

export function parseMessage(input: string, today = new Date()): ParseResult {
  const text = input
    .toLowerCase()
    .replace(/[„“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return { type: 'unknown', reason: 'empty' };
  if (HELP.test(text)) return { type: 'help' };
  if (UNDO.test(text)) return { type: 'undo' };

  const { date, rest } = parseDate(text, today);
  const iso = isoDate(date);

  const s = setting(text);
  if (s) return s;
  const q = question(text);
  if (q) return q;

  // Mittagessen
  const lunchWord = /mittag|gegessen|essen ausgelassen/.test(text);
  if (lunchWord && /doch (zu mittag )?gegessen|doch mittag|mittag (doch|wieder) gegessen|hab(e)? (doch )?mittag gegessen/.test(text)) {
    return { type: 'unskipLunch', dates: lunchDates(text, rest, date, today) };
  }
  if (
    lunchWord &&
    /(kein|keine|nicht|ohne|nix|nichts)\s*(\w+\s+)?(mittag|gegessen)|mittag (ausgelassen|übersprungen|gespart|weggelassen)|nicht (zu mittag )?gegessen/.test(text)
  ) {
    const dates = lunchDates(text, rest, date, today);
    if (/\b(\d|zwei|drei|vier|fünf) tage?\b/.test(text) && dates.length === 1) return { type: 'lunchUnclear' };
    return { type: 'skipLunch', dates };
  }

  const schoolDays = text.match(/(\d{1,2})\s*(lange )?schultage|schultage\s*:?\s*(\d{1,2})/);
  if (schoolDays) return { type: 'schoolDays', days: Number(schoolDays[1] ?? schoolDays[3]) };


  // Ändern
  const editLast = text.match(/^(?:ändere?|korrigier(?:e)?|mach)?\s*(?:den |das |die )?(?:letzte[nr]?|das|es)\s*(?:eintrag|buchung)?\s*(?:auf|war|ist|waren|sind|zu)\s+(.+?)\s*(?:ändern|korrigieren|machen)?$/);
  if (editLast) {
    const amount = parseAmount(editLast[1]);
    if (amount !== null) return { type: 'editLast', amount };
  }
  const editMatch = text.match(/^(?:der |die |das )?([a-zäöüß&+ ]+?)\s+(?:war|waren|kostete)\s+(?:nur |eigentlich |doch |aber |in wirklichkeit )*(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?$/);
  if (editMatch) return { type: 'editMatch', query: editMatch[1].trim(), amount: Number(editMatch[2].replace(',', '.')) };
  const del = text.match(/^(?:lösch(?:e)?|entfern(?:e)?|streich(?:e)?)\s+(?:den |die |das )?(.+?)(?:\s+(?:weg|raus))?$/);
  if (del) return { type: 'deleteMatch', query: del[1] };

  let amount = parseAmount(rest);
  if (amount === null || !(amount > 0)) return { type: 'unknown', reason: detectCategory(text) || hasKeyword(text, INCOME) ? 'noAmount' : 'unclear' };
  amount = Math.round(amount * 100) / 100;
  const note = input.trim();
  const sign = text.match(/^([+\-−])\s*€?\s*\d/)?.[1];

  if (hasKeyword(text, WITHDRAW)) return { type: 'entry', entry: { date: iso, kind: 'savings', amount: -amount, note } };
  if (hasKeyword(text, SAVINGS)) return { type: 'entry', entry: { date: iso, kind: 'savings', amount, note } };
  const expenseText = text.replace(/zurück ?gezahlt|zurück ?bekommen|zurück ?überwiesen/g, ' ');
  const income = sign === '+' || (!sign && hasKeyword(text, INCOME) && !hasKeyword(expenseText, EXPENSE));
  if (income) return { type: 'entry', entry: { date: iso, kind: 'income', amount, note } };

  // Tankgutschein: "getankt 40 mit 20 gutschein" → nur 20 selbst bezahlt
  const category = detectCategory(text) ?? 'misc';
  if (/gutschein/.test(text)) {
    const nums = [...rest.matchAll(/(\d+(?:[.,]\d{1,2})?)/g)].map((m) => Number(m[1].replace(',', '.')));
    if (nums.length >= 2) {
      const voucherMatch = rest.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?\s*(?:mit\s+)?(?:dem\s+)?(?:tank)?gutschein|gutschein\s*(?:von|über|mit)?\s*(\d+(?:[.,]\d{1,2})?)/);
      const voucher = voucherMatch ? Number((voucherMatch[1] ?? voucherMatch[2]).replace(',', '.')) : Math.min(...nums);
      const total = Math.max(...nums);
      if (voucher < total) {
        return { type: 'entry', voucher, entry: { date: iso, kind: 'expense', category: 'fuel', amount: Math.round((total - voucher) * 100) / 100, note } };
      }
    }
  }
  return { type: 'entry', entry: { date: iso, kind: 'expense', category, amount, note } };
}

/**
 * Mehrere Einträge in einer Nachricht: getrennt durch Zeilenumbruch, ";", ", " oder " und ".
 * Wenn ein Teil nicht verstanden wird, gilt die ganze Nachricht als ein Eintrag.
 */
export function parseMessages(input: string, today = new Date()): ParseResult[] {
  const parts = input
    .split(/\n|;|,\s+|\s+und\s+|\s+&\s+|\s+\+\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    const results = parts.map((p) => parseMessage(p, today));
    if (results.every((r) => r.type === 'entry' || r.type === 'skipLunch')) return results;
  }
  return [parseMessage(input, today)];
}

export const HELP_TEXT = `Schreib einfach, was passiert ist. Ich verstehe auch Tippfehler, „zehn euro“, „ein fünfer“ und Datumsangaben wie „gestern“, „am montag“, „am 5.“ oder „vor 3 tagen“.

Ausgaben
• „Döner 7,50“, „Mäcci 9,80“, „Billa 4,20“ → Essen
• „getankt 38“, „40 getankt mit 20 Gutschein“ → Tanken
• „Hoodie 35“, „Friseur 15“, „Kino 12“, „-12 Kino“

Einnahmen
• „Oma 20 geschenkt“, „Papa hat 30 überwiesen“, „+15 Pfand“

Sparbuch
• „50 aufs Sparbuch“, „30 vom Sparbuch abgehoben“
• „Sparbuch Stand 340“, „Sparziel 2000“

Mittagessen
• „heute kein Mittagessen“, „mo und di kein mittag“, „doch gegessen“
• „11 Schultage“

Fragen
• „Wie viel hab ich noch?“, „Wie viel für Essen übrig?“
• „Was hab ich diesen Monat ausgegeben?“, „Kann ich mir 30 € leisten?“

Ändern
• „rückgängig“, „letzten auf 8 ändern“, „Döner war 8“, „lösch den Döner“
• „Essensbudget 70“, „Tankbudget 50“, „Taschengeld 260“`;
