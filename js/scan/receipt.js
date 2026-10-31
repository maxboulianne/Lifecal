// Lire un reçu à partir du texte de l'OCR : le commerce, la date et les montants.
// L'OCR se trompe parfois (« Paurhoire », « 2626-18-15 ») : on ne garde que ce qui
// a du sens, et la personne vérifie toujours avant d'enregistrer.
//
//   parseReceipt(text, { currency }) -> { merchant, date, time, total, amounts, currency }
//     currency : la devise attendue (formulaire) quand le reçu ne la dit pas ; elle
//                indique si les montants ont des décimales (dong, won, yen : non)
//     time    : l'heure du paiement { hour, minute }, qui dit le repas (déjeuner, dîner, souper)
//     total   : le total payé (lignes « Total », « Vente », « Montant »… mais pas
//               « Sous-total ») ; à défaut, le plus grand montant
//   receiptExpense({ invoice, proof }) -> { invoiceTotal, tip, meal, date, amount, currency }
//     La dépense ne nomme pas le commerce : seulement le repas, selon l'heure.
//     Le montant réclamé est celui de la preuve de transaction (pourboire compris) ;
//     la facture sert si la preuve est absente ou illisible.

import { mealAt } from "../timesheet/expenses.js";

const SEP = "[\\u0020\\u00a0\\u202f.,]"; // séparateurs de milliers : espace, espace insécable, point, virgule
// Un montant a deux décimales : « 99,65 », « 1 075,02 », « $170.16 ».
const AMOUNT = new RegExp(`(?<![\\d.,])(\\d{1,3}(?:${SEP}\\d{3})+|\\d+)[.,](\\d{2})(?![.,]?\\d)`, "g");
// Devises sans décimales (dong, won, yen, roupie) : « 150.000 », « 1,250,000 », « 85000 ».
// Pas un numéro de carte masqué (« ****1041 », « XXXX1041 »).
export const ZERO_DECIMAL = ["VND", "KRW", "JPY", "IDR"];
const WHOLE = new RegExp(`(?<![\\d.,*xX#])(\\d{1,3}(?:${SEP}\\d{3})+|\\d{3,9})(?:[.,](\\d{2}))?(?![.,]?\\d)`, "g");
// Un nombre entier collé à un symbole de devise : « ¥58 », « 58元 », « R$ 45 », « 45.000₫ »
const SYMBOL_BEFORE = new RegExp(`(?:[¥₩₫$€£฿₹₱]|R\\$|Rp)\\s?(\\d{1,3}(?:${SEP}\\d{3})+|\\d+)(?![.,]?\\d)`, "g");
const SYMBOL_AFTER = new RegExp(`(?<![\\d.,])(\\d{1,3}(?:${SEP}\\d{3})+|\\d+)\\s?(?:元|円|원|đ|₫|บาท|VND|KRW|JPY)`, "g");

// Mots entiers seulement (« sale » n'est pas dans « salade ») pour les langues à espaces ;
// le chinois, le japonais, le coréen, le thaï et l'arabe s'écrivent sans espaces entre les mots.
const word = (body, glued = "") => new RegExp(`(?<![\\p{L}\\d])(?:${body})(?![\\p{L}])${glued ? `|${glued}` : ""}`, "iu");
// « Total » dans toutes les langues ; mal lu (T0TAL, TOTAI, 7OTAL…) compte aussi.
const TOTAL = word(
  "[t7][o0][t7][a4][l1iI|]|summe|gesamt|gesamtbetrag|importe|tổng cộng|tổng tiền|tổng|tong cong|jumlah|grand total",
  "合计|合計|总计|總計|总额|總額|お会計|합계|총액|ยอดรวม|รวมทั้งสิ้น|สุทธิ|الإجمالي|الاجمالي|المجموع",
);
// Ce qui a été payé : « Vente », « Montant », « Carte », « A pagar », « Thanh toán »…
const PAID_WORDS = word(
  "vente|montant|achat|amount|paid|pay[ée]|purchase|sale|card|carte|due|a pagar|valor|pagado|pago|betrag|zu zahlen|bezahlt|thanh toán|thanh toan|bayar",
  "实收|實收|应收|應收|实付|實付|金额|金額|支付|결제금액|결제|받을금액|ご請求|ชำระ|المبلغ",
);
const SUBTOTAL = /(sous|sub)[\s-]*[t7][o0][t7]|zwischensumme|tạm tính|tam tinh|小计|小計|소계|المجموع الفرعي/iu;
// L'argent remis et la monnaie rendue : plus grands que le total, à ne pas prendre
const CASH = word(
  "cash|comptant|esp[eè]ces|re[çc]u|rendu|monnaie|change|received|tendered|efectivo|cambio|dinheiro|troco|recebido|rückgeld|gegeben|tiền mặt|tiền khách|khách đưa|tiền thừa|thừa|khach dua|tien thua|tunai|kembali",
  "现金|現金|找零|找赎|お預|お釣|받은금액|거스름|เงินทอน|รับเงิน|نقد|الباقي",
);
const TAX = word("tps|tvq|gst|qst|hst|pst|tax|taxe|taxes|tva|vat|iva|icms|mwst|ust|ppn|thuế|thue", "增值税|增值稅|税|稅|부가세|ภาษี|ضريبة");
const SKIP_MERCHANT = /transaction|re[çc]u|receipt|facture|invoice|bienvenue|welcome|copie|copy|client|merci|thank/i;

// Mois en français, anglais, espagnol, portugais, allemand (début du mot)
const MONTHS = [
  ["janv", "jan", "ene"], ["févr", "fevr", "feb", "fev"], ["mars", "mar", "mrz", "mär"], ["avr", "apr", "abr"],
  ["mai", "may"], ["juin", "jun"], ["juil", "jul"], ["août", "aout", "aug", "ago"], ["sept", "sep", "set"],
  ["oct", "okt", "out"], ["nov"], ["déc", "dec", "dez", "dic"],
];

const toNumber = (int, dec = "") => Number(`${int.replace(/[\s.,]/g, "")}.${dec || "0"}`);

// Montants d'une ligne ; `whole` : la devise n'a pas de décimales (dong, won…)
export function amountsIn(line, { whole = false } = {}) {
  const found = [...line.matchAll(whole ? WHOLE : AMOUNT)].map((m) => toNumber(m[1], m[2]));
  for (const re of [SYMBOL_BEFORE, SYMBOL_AFTER]) found.push(...[...line.matchAll(re)].map((m) => toNumber(m[1])));
  // une année seule (« 2026 ») n'est pas un montant
  const isYear = (n) => Number.isInteger(n) && n >= 1990 && n <= 2100 && new RegExp(`(?<![\\d.,])${n}(?![\\d]|[.,]\\d)`).test(line);
  return [...new Set(found)].filter((n) => n > 0 && !isYear(n));
}

// Chiffres arabes (٠١٢…), persans et pleine largeur (１２：３０) ramenés à 0-9
export function normalizeText(text) {
  return String(text ?? "").normalize("NFKC")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/٫/g, ".").replace(/٬/g, ",")
    // l'OCR met des espaces entre les caractères chinois, japonais, coréens : « 小 计 » -> « 小计 »
    .replace(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]) +(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu, "");
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

// Première date lisible : « 2026-09-22 », « 15-oct.-2026 », « 22 Sept 2026 », « Oct 15, 2026 »,
// « 15/10/2026 », « 2026年10月15日 », « 2026년 10월 15일 », « ngày 15 tháng 10 năm 2026 ».
// `monthFirst` : mm/jj/aaaa (États-Unis) quand le jour et le mois sont ambigus.
export function findDate(text, { monthFirst = false } = {}) {
  const dm = (a, b, y) => (monthFirst
    ? (+a > 12 ? validDate(+y, +b, +a) : validDate(+y, +a, +b))
    : (+b > 12 ? validDate(+y, +a, +b) : validDate(+y, +b, +a)));
  const patterns = [
    [/(20\d\d)\s*[-/.年년]\s*(\d{1,2})\s*[-/.月월]\s*(\d{1,2})/g, (m) => validDate(+m[1], +m[2], +m[3])],
    [/ng[àa]y\s*(\d{1,2})\s*th[áa]ng\s*(\d{1,2})\s*n[ăa]m\s*(20\d\d)/gi, (m) => validDate(+m[3], +m[2], +m[1])],
    [/(\d{1,2})[\s.-]+(?:de\s+)?([a-zéûäç]{3,9})\.?[\s.-]+(?:de\s+)?(20\d\d)/gi, (m) => (monthNumber(m[2]) ? validDate(+m[3], monthNumber(m[2]), +m[1]) : null)],
    [/([a-zéûäç]{3,9})\.?\s+(\d{1,2}),?\s+(20\d\d)/gi, (m) => (monthNumber(m[1]) ? validDate(+m[3], monthNumber(m[1]), +m[2]) : null)],
    // jj/mm/aaaa (Québec, Europe, Asie) ou mm/jj/aaaa (États-Unis) ; aussi l'année sur 2 chiffres
    [/(\d{1,2})[/.-](\d{1,2})[/.-](20\d\d)/g, (m) => dm(m[1], m[2], m[3])],
    [/(?<![\d/.-])(\d{1,2})\/(\d{1,2})\/(\d\d)(?![\d/])/g, (m) => dm(m[1], m[2], 2000 + +m[3])],
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

// Première heure lisible : « 12:44:31 », « 12h39min35s p.m. », « 7:15 PM », « 19時30分 » ;
// « 오후 7:15 », « 下午 7:15 » : l'après-midi s'écrit avant l'heure en Asie.
export function findTime(text) {
  const m = /(?<!\d)([01]?\d|2[0-3])\s?[:h時时시]\s?([0-5]\d)(?!\d)(.{0,12})/i.exec(text);
  if (!m) return null;
  let hour = Number(m[1]);
  const before = text.slice(Math.max(0, m.index - 6), m.index);
  const pm = /p\.?\s?m\b|p\.m/i.test(m[3]) || /오후|下午|午後|chiều|tối|مساء/i.test(before);
  const am = /a\.?\s?m\b|a\.m/i.test(m[3]) || /오전|上午|午前|sáng|صباح/i.test(before);
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  return { hour, minute: Number(m[2]) };
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

// La devise écrite sur le reçu (code, symbole ou mot) ; null si rien de sûr.
// Le ¥ seul est le yuan, sauf sur un reçu japonais (円, 税込…).
const CURRENCY_SIGNS = [
  ["VND", /\bVND\b|₫|\d\s?đ(?!\p{L})|đồng/iu], ["KRW", /\bKRW\b|₩|\d\s?원/u], ["JPY", /\bJPY\b|\d\s?円|税込|お会計/u],
  ["CNY", /\bCNY\b|\bRMB\b|\d\s?元|人民币|¥/u], ["TWD", /\bTWD\b|NT\s?\$/], ["HKD", /\bHKD\b|HK\s?\$/], ["BRL", /\bBRL\b|R\$/],
  ["MXN", /\bMXN\b|MX\s?\$/], ["AED", /\bAED\b|د\.إ|درهم/u], ["SAR", /\bSAR\b|ر\.س|ريال/u], ["THB", /\bTHB\b|฿|บาท/u],
  ["IDR", /\bIDR\b|\bRp\.?\s?\d/], ["MYR", /\bMYR\b|\bRM\s?\d/], ["SGD", /\bSGD\b|S\$/], ["INR", /\bINR\b|₹|\bRs\.?\s?\d/],
  ["PHP", /\bPHP\b|₱/], ["CHF", /\bCHF\b/], ["GBP", /\bGBP\b|£/], ["EUR", /\bEUR\b|€/], ["AUD", /\bAUD\b|A\$/],
  ["NZD", /\bNZD\b|NZ\$/], ["USD", /\bUSD\b|US\s?\$/], ["CAD", /\bCAD\b|CA\s?\$/],
];
export function findCurrency(text) {
  return CURRENCY_SIGNS.find(([, re]) => re.test(text))?.[0] ?? null;
}

export function parseReceipt(raw, { currency = null } = {}) {
  const text = normalizeText(raw);
  const found = findCurrency(text);
  const cur = found ?? currency;
  const whole = ZERO_DECIMAL.includes(cur);
  const lines = text.split(/\r?\n/).filter((l) => !CASH.test(l)); // l'argent remis, la monnaie rendue
  const of = (list) => list.flatMap((l) => amountsIn(l, { whole }));
  const amounts = of(lines);
  // 1. les lignes « Total », « Vente », « Montant », « Carte »… (sur la preuve, la vente
  // comprend le pourboire : on garde le plus grand) ; 2. ce qui suit les taxes (le total
  // vient après) ; 3. le plus grand montant.
  const paid = of(lines.filter((l) => (TOTAL.test(l) || PAID_WORDS.test(l)) && !SUBTOTAL.test(l)));
  const lastTax = lines.findLastIndex((l) => TAX.test(l));
  const afterTaxes = lastTax >= 0 ? of(lines.slice(lastTax + 1)) : [];
  const pick = [paid, afterTaxes, amounts].find((list) => list.length) ?? [];
  return {
    merchant: findMerchant(text),
    date: findDate(text, { monthFirst: cur === "USD" }),
    time: findTime(text),
    total: pick.length ? Math.max(...pick) : null,
    amounts,
    currency: found,
  };
}

// Total de la facture, vérifié avec la preuve de transaction : il ne peut pas dépasser ce
// qui a été payé (le pourboire s'ajoute), ni en être moins de la moitié. Un article mal lu
// (« $26.00 » lu « 826.00 ») est ainsi écarté : on garde le plus grand montant qui convient.
export function invoiceTotal(invoice, paid = null) {
  if (!invoice) return null;
  const fit = (n) => n <= paid + 0.005 && n >= paid / 2;
  if (!paid || (invoice.total && fit(invoice.total))) return invoice.total;
  const fits = invoice.amounts.filter(fit);
  return fits.length ? Math.max(...fits) : null;
}

// Ce que l'on propose pour la dépense : la preuve de transaction d'abord (c'est ce qui a
// été payé, pourboire compris) ; le repas vient de l'heure du paiement.
//   invoiceTotal : le total de la facture (vérifié) ; tip : le pourboire (preuve − facture)
export function receiptExpense({ invoice = null, proof = null } = {}) {
  const time = proof?.time ?? invoice?.time ?? null;
  const billed = invoiceTotal(invoice, proof?.total);
  const tip = billed && proof?.total ? Math.round((proof.total - billed) * 100) / 100 : null;
  return {
    invoiceTotal: billed,
    tip: tip > 0 ? tip : null,
    meal: time ? mealAt(time.hour, time.minute) : null,
    date: proof?.date ?? invoice?.date ?? null,
    amount: proof?.total ?? invoice?.total ?? null,
    currency: proof?.currency ?? invoice?.currency ?? null,
  };
}
