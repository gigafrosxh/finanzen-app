import { Entry, ExpenseCategory } from './models';

export type ParseResult =
  | { type: 'entry'; entry: Omit<Entry, 'id'> }
  | { type: 'skipLunch'; date: string }
  | { type: 'schoolDays'; days: number }
  | { type: 'undo' }
  | { type: 'help' }
  | { type: 'unknown' };

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const CATEGORY_WORDS: [ExpenseCategory, RegExp][] = [
  ['fuel', /tank|getankt|sprit|benzin|diesel|\bomv\b|\bshell\b|\bbp\b|\beni\b|\bjet\b|\bavia\b|turmöl/],
  [
    'food',
    /essen|mc ?d|mäc+i|macc?i|mcdonald|döner|doner|dürüm|kebap|kebab|billa|spar\b|eurospar|interspar|hofer|lidl|penny|merkur|pizza|burger|kfc|subway|jause|mittag|frühstück|abendessen|snack|bäcker|semmel|leberkäs|wurst|asia|sushi|nudeln|kantine|buffet|getränk|trinken|red ?bull|monster|cola|kaffee|eis\b|süßes|chips/,
  ],
  ['clothes', /gewand|kleid|hose|jeans|schuh|sneaker|jacke|pulli|pullover|shirt|hoodie|socken|kappe|zara|h ?& ?m|nike|adidas|zalando|primark|bershka/],
  ['haircut', /friseur|frisör|barber|haar/],
];

// Reihenfolge zählt: Abheben vor Einzahlen, Sparbuch vor Einnahmen
const WITHDRAW = /abgehoben|abheben|vom sparbuch|sparbuch\b.*\b(raus|genommen|geholt)/;
const SAVINGS = /sparbuch|gespart|angespart|sparen|eingezahlt|einzahlen|zurückgelegt|weggelegt/;
const INCOME =
  /geschenk|bekommen|gekriegt|erhalten|geburtstag|einnahme|verdient|überwies|überweisung|zurückgezahlt|zurückbekommen|zurück bekommen|verkauft|lohn|gehalt|job|trinkgeld|pfand|gewonnen|bonus|extra taschengeld|\brein\b|\bplus\b/;
const EXPENSE = /ausgabe|ausgegeben|bezahlt|\bgezahlt|gekauft|\bkauf|gekostet|kostet|\braus\b|\bminus\b|abo\b/;

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

const AMOUNT = /(?:€\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro|eur)?/;

export function parseMessage(input: string, today = new Date()): ParseResult {
  const text = input.toLowerCase().trim();
  if (!text) return { type: 'unknown' };
  if (/^(hilfe|help|\?|befehle|was kann ich (schreiben|eingeben)\??)$/.test(text)) return { type: 'help' };
  if (/^(rückgängig|undo|zurück|ups|letzte[n]? (eintrag )?löschen|lösch (das|den letzten)( eintrag)?)!?$/.test(text)) {
    return { type: 'undo' };
  }
  const date = isoDate(parseDate(text, today));

  if (/(kein|nicht|ohne)\s*(\w+\s+)?mittag|nicht (zu mittag )?gegessen|mittag (ausgelassen|übersprungen)/.test(text)) {
    return { type: 'skipLunch', date };
  }

  const schoolDays = text.match(/(\d{1,2})\s*(lange )?schultage|schultage\s*:?\s*(\d{1,2})/);
  if (schoolDays) return { type: 'schoolDays', days: Number(schoolDays[1] ?? schoolDays[3]) };

  const amountMatch = stripDate(text).match(AMOUNT);
  if (!amountMatch) return { type: 'unknown' };
  const amount = Number(amountMatch[1].replace(',', '.'));
  if (!(amount > 0)) return { type: 'unknown' };
  const note = input.trim();
  const sign = text.match(/^([+\-−])\s*€?\s*\d/)?.[1];
  const category = (): ExpenseCategory => CATEGORY_WORDS.find(([, re]) => re.test(text))?.[0] ?? 'misc';

  if (WITHDRAW.test(text)) return { type: 'entry', entry: { date, kind: 'savings', amount: -amount, note } };
  if (SAVINGS.test(text)) return { type: 'entry', entry: { date, kind: 'savings', amount, note } };
  if (sign === '+' || (!sign && INCOME.test(text) && !EXPENSE.test(text))) {
    return { type: 'entry', entry: { date, kind: 'income', amount, note } };
  }
  return { type: 'entry', entry: { date, kind: 'expense', category: category(), amount, note } };
}

/**
 * Mehrere Einträge in einer Nachricht: getrennt durch Zeilenumbruch, ";", ", " oder " und ".
 * Wenn ein Teil keinen Betrag hat ("Billa und Döner 12"), gilt die ganze Nachricht als ein Eintrag.
 */
export function parseMessages(input: string, today = new Date()): ParseResult[] {
  const parts = input
    .split(/\n|;|,\s+|\s+und\s+|\s+&\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    const results = parts.map((p) => parseMessage(p, today));
    if (results.every((r) => r.type !== 'unknown' && r.type !== 'help' && r.type !== 'undo')) return results;
  }
  return [parseMessage(input, today)];
}

export const HELP_TEXT = `So kannst du mir schreiben (Datum geht mit „gestern“, „vorgestern“ oder „am 5.“):

Ausgaben
• „Döner 7,50“, „Mäcci 9,80“, „Billa 4,20“ → Essen
• „getankt 38“, „OMV 40“ → Tanken
• „Hoodie 35“, „Friseur 15“ → Gewand, Friseur
• „Kino 12“, „-12 Kino“, „12 ausgegeben“ → Sonstiges

Einnahmen
• „Oma 20 geschenkt“, „Papa hat 30 überwiesen“
• „+15 Pfand“, „Handy verkauft 80“, „Trinkgeld 5“

Sparbuch
• „50 aufs Sparbuch“ → eingezahlt
• „30 vom Sparbuch abgehoben“ → wieder rausgenommen

Sonstiges
• „heute kein Mittagessen“ → Tag ohne Mittagessen
• „11 Schultage“ → Essensgeld für den Monat
• Mehrere auf einmal: „Döner 7,50, getankt 30“
• „rückgängig“ → letzten Eintrag löschen`;
