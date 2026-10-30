// Lire un reçu à partir du texte de l'OCR : le commerce, la date et les montants.
// L'OCR se trompe parfois (« Paurhoire », « 2626-18-15 ») : on ne garde que ce qui
// a du sens, et la personne vérifie toujours avant d'enregistrer.
//
//   parseReceipt(text) -> { merchant, date, total, amounts, currency }
//     total   : le total payé (lignes « Total », « Vente », « Montant »… mais pas
//               « Sous-total ») ; à défaut, le plus grand montant
//   receiptExpense({ invoice, proof }) -> { description, date, amount, currency }
//     Le montant réclamé est celui de la preuve de transaction (pourboire compris) ;
//     la facture sert si la preuve est absente ou illisible.

// Un montant a toujours deux décimales : « 99,65 », « 1 075,02 », « $170.16 »
const AMOUNT = /(?<![\d.,])(\d{1,3}(?:[  .,]\d{3})+|\d+)[.,](\d{2})(?![.,]?\d)/g;
const TOTAL_WORDS = /total|vente|montant|achat|amount|paid|pay[ée]|purchase|sale|card|carte|due/i;
const SUBTOTAL = /sous[\s-]*total|sub[\s-]*total/i;
const SKIP_MERCHANT = /transaction|re[çc]u|receipt|facture|invoice|bienvenue|welcome|copie|copy|client|merci|thank/i;

const MONTHS = [
  ["janv", "jan"], ["févr", "fevr", "feb"], ["mars", "mar"], ["avr", "apr"], ["mai", "may"], ["juin", "jun"],
  ["juil", "jul"], ["août", "aout", "aug"], ["sept", "sep"], ["oct"], ["nov"], ["déc", "dec"],
];

export function amountsIn(line) {
  return [...line.matchAll(AMOUNT)].map((m) => Number(`${m[1].replace(/[  .,]/g, "")}.${m[2]}`)).filter((n) => n > 0);
}

const pad = (n) => String(n).padStart(2, "0");
function validDate(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || y > 2100 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function monthNumber(word) {
  const w = word.toLowerCase().replace(/\.$/, "");
  const i = MONTHS.findIndex((names) => names.some((n) => w.startsWith(n)));
  return i < 0 ? null : i + 1;
}

// Première date lisible : « 2026-09-22 », « 15-oct.-2026 », « 22 Sept 2026 », « Oct 15, 2026 », « 15/10/2026 »
export function findDate(text) {
  const patterns = [
    [/(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})/g, (m) => validDate(+m[1], +m[2], +m[3])],
    [/(\d{1,2})[\s.-]+([a-zéû]{3,9})\.?[\s.-]+(20\d\d)/gi, (m) => (monthNumber(m[2]) ? validDate(+m[3], monthNumber(m[2]), +m[1]) : null)],
    [/([a-zéû]{3,9})\.?\s+(\d{1,2}),?\s+(20\d\d)/gi, (m) => (monthNumber(m[1]) ? validDate(+m[3], monthNumber(m[1]), +m[2]) : null)],
    // jj/mm/aaaa (usage québécois), sauf si le premier nombre ne peut pas être un jour… de mois
    [/(\d{1,2})[/.-](\d{1,2})[/.-](20\d\d)/g, (m) => (+m[2] > 12 ? validDate(+m[3], +m[1], +m[2]) : validDate(+m[3], +m[2], +m[1]))],
  ];
  let best = null;
  for (const [re, read] of patterns) {
    for (const m of text.matchAll(re)) {
      const date = read(m);
      if (date && (!best || m.index < best.index)) best = { date, index: m.index };
    }
  }
  return best?.date ?? null;
}

const titleCase = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : s);

// Le commerce : la première ligne qui ressemble à un nom (au moins 3 lettres, pas un numéro)
export function findMerchant(text) {
  for (const raw of text.split(/\r?\n/).slice(0, 8)) {
    const line = raw.replace(/^[^\p{L}\d]+|[^\p{L}\d)]+$/gu, "").replace(/\s+/g, " ").trim();
    const letters = (line.match(/\p{L}/gu) ?? []).length;
    if (letters < 3 || letters < line.length / 2 || SKIP_MERCHANT.test(line)) continue;
    return titleCase(line);
  }
  return "";
}

function findCurrency(text) {
  if (/€|\bEUR\b/.test(text)) return "EUR";
  if (/\bUSD\b|US\s?\$/.test(text)) return "USD";
  if (/\bCAD\b|CA\s?\$/.test(text)) return "CAD";
  return null;
}

export function parseReceipt(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const amounts = lines.flatMap(amountsIn);
  const totals = lines.filter((l) => TOTAL_WORDS.test(l) && !SUBTOTAL.test(l)).flatMap(amountsIn);
  const pick = totals.length ? totals : amounts;
  return {
    merchant: findMerchant(String(text ?? "")),
    date: findDate(String(text ?? "")),
    total: pick.length ? Math.max(...pick) : null,
    amounts,
    currency: findCurrency(String(text ?? "")),
  };
}

// Ce que l'on propose pour la dépense : la preuve de transaction d'abord pour le montant
// et la date (c'est ce qui a été payé), la facture d'abord pour le nom du commerce.
export function receiptExpense({ invoice = null, proof = null } = {}) {
  return {
    description: invoice?.merchant || proof?.merchant || "",
    date: proof?.date ?? invoice?.date ?? null,
    amount: proof?.total ?? invoice?.total ?? null,
    currency: proof?.currency ?? invoice?.currency ?? null,
  };
}
