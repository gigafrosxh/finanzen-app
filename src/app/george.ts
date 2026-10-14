import { Entry, ExpenseCategory, FixedCost, ImportCategory, Settings } from './models';
import { detectCategory } from './parser';

// Import der Umsatzliste aus George (Erste Bank / Sparkasse).
// Alles passiert im Browser. Gespeichert werden nur Datum, Betrag, Händler, Kategorie
// und ein Hash pro Buchung, nie IBANs oder die Rohzeilen.

export interface BankTx {
  hash: string;
  bookingDate: string; // YYYY-MM-DD
  date: string; // Kaufdatum bei Kartenzahlungen, sonst Buchungsdatum
  amount: number; // negativ = Ausgabe
  merchant: string; // kurzer Händlername für die Notiz
  key: string; // Schlüssel für gemerkte Regeln
  partner: string; // nur im Speicher für die Regeln, wird nicht gespeichert
  details: string;
}

export type ImportReason = 'internal' | 'fixed' | 'allowance' | 'lunch' | 'cash' | 'duplicate' | 'zero';

export interface ImportRow {
  tx: BankTx;
  category: ImportCategory;
  reason?: ImportReason; // warum standardmäßig nicht angehakt
  selected: boolean;
}

export const REASON_TEXT: Record<ImportReason, string> = {
  internal: 'Umbuchung zwischen deinen Konten',
  fixed: 'schon in den Fixkosten',
  allowance: 'Taschengeld, schon eingeplant',
  lunch: 'Essensgeld, schon eingeplant',
  cash: 'Bargeld, Ausgaben damit trägst du selbst ein',
  duplicate: 'schon eingetragen',
  zero: 'Abschlussbuchung',
};

// ---------- Datei lesen ----------

/** George exportiert UTF-16 LE mit BOM, sonst UTF-8 annehmen. */
export function decodeFile(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  return new TextDecoder('utf-8').decode(b).replace(/^﻿/, '');
}

/** CSV mit "…"-Feldern und "" als Escape. Trennzeichen wird aus der Kopfzeile erkannt. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf('\n') >>> 0);
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

/** „1.038,16“ → 1038.16 */
export function parseGermanAmount(s: string): number {
  return Number(s.trim().replace(/\./g, '').replace(',', '.'));
}

function germanDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** Kaufdatum aus „… K1 12.10. 07:44“, Jahr vom Buchungsdatum (Jahreswechsel beachtet). */
export function purchaseDate(details: string, bookingDate: string): string {
  const m = details.match(/\bK\d\s+(\d{2})\.(\d{2})\.?\s+\d{2}:\d{2}/);
  if (!m) return bookingDate;
  let year = Number(bookingDate.slice(0, 4));
  const month = Number(m[2]);
  if (month > Number(bookingDate.slice(5, 7))) year--;
  const iso = `${year}-${m[2]}-${m[1]}`;
  return iso <= bookingDate ? iso : bookingDate;
}

function hashString(s: string): string {
  // FNV-1a, 2 × 32 Bit, reicht um Buchungen wiederzuerkennen
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x811c9dc5);
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

const COMPANY = /\b(GMBH|KG|AG|OG|E\.?U\.?|LTD|INC)\b/i;

const PRETTY: [RegExp, string][] = [
  [/^MC ?DONALDS?\b/i, "McDonald's"],
  [/^OPENAI\b/i, 'ChatGPT'],
  [/^APPLE\.COM/i, 'Apple'],
  [/^STEAM/i, 'Steam'],
  [/^(KFC|BP|OMV|ENI|JET|OBI)\b/i, ''],
];

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-/+*.])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

/** „BILLA DANKT 0009100“ → „Billa“, „CAFE+CO AT 330185“ → „Cafe+Co“ */
export function shortMerchant(partner: string, details: string): string {
  const card = /^(POS|E-COMM)\b|\bK\d\s+\d{2}\.\d{2}\./.test(details);
  const d = details.trim();
  if (!partner.trim()) {
    if (/^(ATM|BANKOMAT|AUTOMAT)\b/i.test(d)) return 'Bargeld abgehoben';
    if (/eigenerlag|einzahlung/i.test(d)) return 'Bareinzahlung';
    return d.split(/\s+/).slice(0, 3).join(' ') || 'Buchung';
  }
  if (card || COMPANY.test(partner) || partner === partner.toUpperCase()) {
    const name = partner
      .replace(/^(SUMUP|SQ|WL|PAYPAL|ZETTLE)\s*\*\s*/i, '')
      .replace(/\s+(DANKT|SAGT DANKE|DANKE)\b.*$/i, '')
      .replace(/\s+AT\s+\d+$/i, '')
      .replace(/\s+\d+$/g, '')
      .replace(/\s+\*.*$/, '')
      .trim();
    const n = name || partner;
    const pretty = PRETTY.find(([re]) => re.test(n));
    if (pretty) return pretty[1] || n.match(pretty[0])![0].toUpperCase() + titleCase(n.slice(n.match(pretty[0])![0].length));
    return titleCase(n);
  }
  // Überweisung an oder von einer Person: nur Vorname, dazu der Verwendungszweck, falls er etwas sagt
  const first = partner.trim().split(/\s+/)[0];
  const generic = !d || /^(George-)?Überweisung\b/i.test(d);
  return generic ? `Überweisung ${first}` : `${d} (${first})`;
}

function merchantKey(partner: string, details: string): string {
  return shortMerchant(partner, details).toLowerCase();
}

/** Liest einen George-Umsatzexport. Spalten werden über die Kopfzeile gefunden. */
export function parseGeorge(text: string): BankTx[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('Die Datei ist leer.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const iDate = col('buchungsdatum', 'datum');
  const iPartner = col('partnername', 'partner', 'empfänger');
  const iAmount = col('betrag');
  const iDetails = col('buchungs-details', 'buchungsdetails', 'verwendungszweck', 'details');
  if (iDate < 0 || iAmount < 0) throw new Error('Das sieht nicht wie ein George-Export aus (Buchungsdatum oder Betrag fehlt).');

  const seen = new Map<string, number>();
  const out: BankTx[] = [];
  for (const r of rows.slice(1)) {
    const bookingDate = germanDate(r[iDate] ?? '');
    const amount = parseGermanAmount(r[iAmount] ?? '');
    if (!bookingDate || !Number.isFinite(amount)) continue;
    const partner = (iPartner >= 0 ? r[iPartner] : '')?.trim() ?? '';
    const details = (iDetails >= 0 ? r[iDetails] : '')?.trim() ?? '';
    // Gleiche Zeile zweimal im Export: Laufnummer anhängen, damit beide zählen
    const base = `${bookingDate}|${amount.toFixed(2)}|${details}|${partner}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({
      hash: hashString(n ? `${base}#${n}` : base),
      bookingDate,
      date: purchaseDate(details, bookingDate),
      amount,
      merchant: shortMerchant(partner, details),
      key: merchantKey(partner, details),
      partner,
      details,
    });
  }
  if (out.length === 0) throw new Error('Keine Buchungen in der Datei gefunden.');
  return out;
}

// ---------- Kategorien ----------

const FUEL = /\b(ENI|JET|BP|OMV|TURMOEL|SHELL|AVANTI|AGIP|DOPPLER|GENOL)\b/;
const SUBSCRIPTION = /OPENAI|CHATGPT|APPLE\.COM|SPOTIFY|ANTHROPIC|CLAUDE\.AI|NETFLIX|DISNEY|YOUTUBE ?PREMIUM/;
const FOOD =
  /BILLA|\bSPAR\b|INTERSPAR|EUROSPAR|MCDONALD|BUFFET|CAFE\+CO|KEBA[BP]|PIZ(Z|\b)|BURGER|NOODLE|\bKFC\b|HOFER|LIDL|PENNY|\bOKAY\b|DISKONT|SUBWAY|STARBUCKS|BÄCK|BAECK|ANKER|STRÖCK/;
const CASH = /^(ATM|BANKOMAT|AUTOMAT)\b/;
const SAVINGS = /SPAR\w*KONTO|SPARBUCH/;

/** Eigener Name: häufigster Partner, der mit dem Vornamen aus „Girokonto von Daniel“ anfängt. */
export function guessOwnName(text: string, txs: BankTx[]): string {
  const rows = parseCsv(text);
  const head = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
  const i = head.indexOf('eigener kontoname');
  const first = i >= 0 ? (rows[1]?.[i] ?? '').match(/\bvon\s+(\S+)/i)?.[1] : undefined;
  if (!first) return '';
  const counts = new Map<string, number>();
  for (const t of txs) {
    if (t.partner.toLowerCase().startsWith(first.toLowerCase() + ' ')) counts.set(t.partner, (counts.get(t.partner) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

export type RuleCategory = 'savings' | 'internal' | 'fuel' | 'subscription' | 'food' | 'cash' | 'allowance' | 'lunch' | 'other';

/** Eingebaute Regeln, erste passende gewinnt. */
export function ruleCategory(tx: BankTx, ownName: string): RuleCategory {
  const p = tx.partner.toUpperCase();
  const d = tx.details.toUpperCase();
  const both = `${p} ${d}`;
  if (SAVINGS.test(p) || (!p && SAVINGS.test(d))) return 'savings';
  // Nur der exakte Name, „Daniel X Klassenkonto“ ist kein eigenes Konto
  if (ownName && tx.partner.trim().toLowerCase() === ownName.trim().toLowerCase()) return 'internal';
  if (FUEL.test(p)) return 'fuel';
  if (SUBSCRIPTION.test(both)) return 'subscription';
  if (FOOD.test(both)) return 'food';
  if (CASH.test(d)) return 'cash';
  if (tx.amount > 0 && /^TG\s*\d{1,2}\s*\/\s*\d{2}/.test(d)) return 'allowance';
  if (tx.amount > 0 && /^ESSENSGELD\b/.test(d)) return 'lunch';
  return 'other';
}

function nearAmount(a: number, b: number) {
  return Math.abs(Math.abs(a) - Math.abs(b)) < 0.005;
}

function daysBetween(a: string, b: string) {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
}

/** Vorschläge für die Vorschau: Kategorie, Häkchen und Grund. */
export function buildRows(txs: BankTx[], settings: Settings, existing: Entry[], ownName = ''): ImportRow[] {
  const known = new Set(settings.importedHashes ?? []);
  const rules = settings.importRules ?? {};
  // Bestehende Einträge, die nicht aus einem Import kommen, für die Duplikatsuche
  const manual = existing.filter((e) => e.source !== 'george').map((e) => ({ e, used: false }));

  return txs
    .filter((tx) => !known.has(tx.hash))
    .map((tx) => {
      const rule = ruleCategory(tx, ownName);
      let category: ImportCategory;
      let reason: ImportReason | undefined;
      const out = tx.amount < 0;
      switch (rule) {
        case 'savings':
          category = 'savings';
          break;
        case 'internal':
          category = 'skip';
          reason = 'internal';
          break;
        case 'fuel':
          category = 'fuel';
          break;
        case 'food':
          category = 'food';
          break;
        case 'subscription':
          category = 'misc';
          if (settings.fixedCosts.some((f) => nearAmount(f.amount, tx.amount))) reason = 'fixed';
          break;
        case 'cash':
          category = 'misc';
          reason = 'cash';
          break;
        case 'allowance':
          category = 'income';
          reason = 'allowance';
          break;
        case 'lunch':
          category = 'income';
          reason = 'lunch';
          break;
        default:
          category = out ? (detectCategory(tx.merchant) ?? 'misc') : 'income';
      }
      if (rules[tx.key] && rule !== 'internal') {
        category = rules[tx.key];
        if (category !== 'skip' && (reason === 'fixed' || reason === 'cash')) reason = undefined;
      }
      if (tx.amount === 0) reason = 'zero';
      if (!reason && category !== 'skip') {
        const kind = category === 'income' ? 'income' : category === 'savings' ? 'savings' : 'expense';
        const dup = manual.find(
          (m) => !m.used && m.e.kind === kind && nearAmount(m.e.amount, tx.amount) && daysBetween(m.e.date, tx.date) <= 2,
        );
        if (dup) {
          dup.used = true;
          reason = 'duplicate';
        }
      }
      return { tx, category, reason, selected: !reason && category !== 'skip' };
    });
}

/** Macht aus einer Zeile einen Eintrag für die App. */
export function toEntry(row: ImportRow): Omit<Entry, 'id'> | null {
  const { tx, category } = row;
  if (category === 'skip' || tx.amount === 0) return null;
  const amount = Math.round(Math.abs(tx.amount) * 100) / 100;
  if (category === 'income') return { date: tx.date, kind: 'income', amount: tx.amount > 0 ? amount : -amount, note: tx.merchant, source: 'george' };
  if (category === 'savings')
    // Abbuchung vom Girokonto = aufs Sparbuch, Eingang vom Sparkonto = Abhebung
    return { date: tx.date, kind: 'savings', amount: tx.amount < 0 ? amount : -amount, note: tx.merchant, source: 'george' };
  // Gutschrift in einer Ausgaben-Kategorie (z. B. Rückerstattung) zählt als negative Ausgabe
  return {
    date: tx.date,
    kind: 'expense',
    category: category as ExpenseCategory,
    amount: tx.amount < 0 ? amount : -amount,
    note: tx.merchant,
    source: 'george',
  };
}

// ---------- Einstellungen aus dem Export vorschlagen ----------

export interface SetupSuggestion {
  settings: Partial<Settings>;
  months: number; // abgedeckter Zeitraum in Monaten
  lunchPerMonth: number | null; // Essensgeld laut Konto
}

export function spanDays(txs: BankTx[]): number {
  const dates = txs.map((t) => t.bookingDate).sort();
  return daysBetween(dates[0], dates[dates.length - 1]) + 1;
}

const SUB_NAMES: [RegExp, string][] = [
  [/OPENAI|CHATGPT/, 'ChatGPT'],
  [/ANTHROPIC|CLAUDE/, 'Claude'],
  [/SPOTIFY/, 'Spotify'],
  [/NETFLIX/, 'Netflix'],
  [/APPLE/, 'Apple-Abo'],
];

export function suggestSettings(txs: BankTx[], ownName: string): SetupSuggestion {
  const months = Math.max(1, spanDays(txs) / 30.44);
  const latest = (rule: RuleCategory) =>
    txs.filter((t) => ruleCategory(t, ownName) === rule).sort((a, b) => b.bookingDate.localeCompare(a.bookingDate))[0]?.amount ?? null;

  // Abos: gleicher Händler und Betrag in mindestens zwei Monaten
  const subs = new Map<string, Set<string>>();
  for (const t of txs) {
    if (t.amount >= 0 || ruleCategory(t, ownName) !== 'subscription') continue;
    const k = `${t.key}|${(-t.amount).toFixed(2)}`;
    subs.set(k, (subs.get(k) ?? new Set()).add(t.bookingDate.slice(0, 7)));
  }
  const fixedCosts: FixedCost[] = [];
  for (const [k, ms] of subs) {
    if (ms.size < 2) continue;
    const [key, amount] = k.split('|');
    const up = key.toUpperCase();
    const name = SUB_NAMES.find(([re]) => re.test(up))?.[1] ?? titleCase(key);
    fixedCosts.push({ name, amount: Number(amount) });
  }

  // Budgets: Durchschnitt pro Monat, auf ganze Euro aufgerundet
  const perMonth = (pred: (t: BankTx, r: RuleCategory) => boolean) =>
    Math.ceil(txs.filter((t) => t.amount < 0 && pred(t, ruleCategory(t, ownName))).reduce((s, t) => s - t.amount, 0) / months);
  const food = perMonth((_, r) => r === 'food');
  const fuel = perMonth((_, r) => r === 'fuel');
  // Sonstiges ohne große Einzelposten (über 100 €), die sind meist einmalig
  const misc = perMonth(
    (t, r) =>
      t.amount > -100 &&
      (r === 'other' || r === 'cash' || (r === 'subscription' && !fixedCosts.some((f) => nearAmount(f.amount, t.amount)))),
  );

  const allowance = latest('allowance');
  const lunch = latest('lunch');
  return {
    months: Math.round(months * 10) / 10,
    lunchPerMonth: lunch,
    settings: {
      ...(allowance ? { allowance } : {}),
      fixedCosts,
      budgets: { food, fuel, misc },
    },
  };
}
