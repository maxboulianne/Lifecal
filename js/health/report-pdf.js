// Rapport PDF pour le médecin : période, chiffres clés, aliments suspects, à surveiller,
// semblant tolérés, tendances, repas les plus parlants et méthode. Couleurs des documents
// Maxxam. Le texte suit la langue affichée (les polices du PDF sont latines : en vietnamien
// et en coréen, l'application produit le rapport en anglais).

import { PdfWriter } from "../export/pdf.js";
import { parseISODate } from "../core/dates.js";
import { fmt, t } from "../i18n/index.js";
import { TIME_SLOTS } from "./analysis.js";
import { reactionEnd } from "./health.js";

export const PDF_LANGUAGES = ["fr", "en", "es", "pt", "de"];

const P = { navy: "#2C4A6E", orange: "#E0491A", gray: "#6B7280", ink: "#1F2937", light: "#EEF2F7", line: "#C9D2DE", white: "#FFFFFF", red: "#B4534B", green: "#3F7D5A" };
const W = 612;
const H = 792;
const M = 40;
const RIGHT = W - M;

// a : résultat d'analyzeFoods ; nameOf(id) : nom de l'aliment ; today : date du rapport
export function healthReportPdf(health, a, { nameOf: rawName, today, measure } = {}) {
  // Les émojis (🌶️, 🔥) n'existent pas dans les polices du PDF
  const nameOf = (id) => String(rawName(id)).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").trim();
  const pdf = new PdfWriter({ measure, title: t("health.rep.title") });
  let page = pdf.addPage(W, H);
  let y = M;
  const date = (iso) => fmt.date(parseISODate(iso));
  const short = (iso) => fmt.dayMonth(parseISODate(iso));
  const hm = (time) => (time ? fmt.time(time) : "");
  const fit = (text, width, o) => {
    let s = String(text ?? "");
    if (page.measure(s, o) <= width) return s;
    while (s.length > 1 && page.measure(`${s}…`, o) > width) s = s.slice(0, -1);
    return `${s}…`;
  };
  const newPage = () => {
    page = pdf.addPage(W, H);
    y = M;
  };
  const room = (h) => { if (y + h > H - M - 14) newPage(); };
  const section = (title, color = P.navy) => {
    room(54);
    y += 10;
    page.text(title, M, y, { size: 10, bold: true, color });
    page.line(M, y + 4, RIGHT, y + 4, { color, width: 1 });
    y += 14;
  };
  const paragraph = (text, o = {}) => {
    const opts = { size: 8.5, color: P.gray, ...o };
    for (const line of page.wrap(text, RIGHT - M, opts)) {
      room(12);
      page.text(line, M, y + 8, opts);
      y += 11;
    }
    y += 2;
  };
  // Tableau : colonnes { title, w, right } ; lignes : tableaux de textes (ou { text, lines } pour un texte sur plusieurs lignes)
  const table = (cols, rows) => {
    let x = M;
    const xs = cols.map((c) => { const at = x; x += c.w; return at; });
    const head = () => {
      page.rect(M, y, RIGHT - M, 16, { fill: P.navy });
      cols.forEach((c, i) => page.text(c.title, c.right ? xs[i] + c.w - 4 : xs[i] + 4, y + 11, { size: 7.5, bold: true, color: P.white, align: c.right ? "right" : "left" }));
      y += 16;
    };
    room(36);
    head();
    rows.forEach((cells, n) => {
      const o = { size: 8.5, color: P.ink };
      const wrapped = cells.map((c, i) => (cols[i].wrap ? page.wrap(String(c ?? ""), cols[i].w - 8, o).slice(0, 3) : [fit(c, cols[i].w - 8, o)]));
      const h = 6 + 11 * Math.max(...wrapped.map((l) => l.length));
      if (y + h > H - M - 14) {
        newPage();
        head();
      }
      if (n % 2) page.rect(M, y, RIGHT - M, h, { fill: P.light });
      wrapped.forEach((lines, i) => lines.forEach((line, k) => page.text(line, cols[i].right ? xs[i] + cols[i].w - 4 : xs[i] + 4, y + 11 + k * 11, { ...o, align: cols[i].right ? "right" : "left" })));
      y += h;
      page.line(M, y, RIGHT, y, { color: P.line });
    });
    y += 4;
  };
  const pct = (r) => `${Math.round(r * 100)} %`;
  const dash = (v) => (v === null || v === undefined ? "-" : String(v));

  // En-tête
  page.text(t("health.rep.title"), RIGHT, y + 22, { size: 20, bold: true, color: P.navy, align: "right" });
  page.text(t("health.rep.subtitle"), RIGHT, y + 36, { size: 9, bold: true, color: P.orange, align: "right" });
  page.line(M, y + 46, RIGHT, y + 46, { color: P.orange, width: 2 });
  y += 64;
  page.text(`${t("health.rep.period")} : ${date(a.from)} — ${date(a.to)}`, M, y, { size: 9.5, bold: true, color: P.ink });
  page.text(`${t("health.rep.prepared")} : ${date(today)}`, RIGHT, y, { size: 9, color: P.gray, align: "right" });
  y += 14;
  page.text(`${t("health.rep.patient")} : ______________________________`, M, y, { size: 9, color: P.gray });
  y += 8;

  // Chiffres clés : deux colonnes de libellés et valeurs
  section(t("health.rep.summary"));
  const x = a.totals;
  const facts = [
    [t("health.an.meals"), x.meals],
    [t("health.an.reactedMeals"), x.meals ? `${x.reactedMeals} (${pct(a.baseline)})` : "-"],
    [t("health.an.reactions"), x.reactions],
    [t("health.rep.reactionDays"), x.reactionDays],
    [t("health.sum.intensity"), x.intensity === null ? "-" : `${fmt.decimal(x.intensity)} / 5`],
    [t("health.sum.minutes"), dash(x.minutes)],
    [t("health.an.delay"), dash(x.delay)],
    [t("health.sum.calm"), x.calmMeals],
  ];
  const half = Math.ceil(facts.length / 2);
  const colW = (RIGHT - M) / 2;
  for (let i = 0; i < half; i++) {
    for (const [k, [label, value]] of [[0, facts[i]], [1, facts[i + half]]]) {
      if (!label) continue;
      const left = M + k * colW;
      page.text(label, left, y + 10, { size: 8.5, color: P.gray });
      page.text(String(value), left + colW - 14, y + 10, { size: 9, bold: true, color: P.ink, align: "right" });
    }
    y += 14;
  }
  const where = ["nose", "mouth", "both"].map((w) => `${t(`health.where.${w}`)} : ${a.where[w]}`).join("   ·   ");
  y += 2;
  paragraph(`${t("health.rep.where")} — ${where}`, { color: P.ink });
  if (!a.enough) paragraph(t("health.an.notEnough"), { italic: true });

  // Aliments
  const foodCols = [
    { title: t("health.rep.food"), w: 170 },
    { title: t("health.rep.eaten"), w: 52, right: true },
    { title: t("health.rep.withReaction"), w: 76, right: true },
    { title: t("health.rep.rate"), w: 52, right: true },
    { title: t("health.rep.intensity"), w: 92, right: true },
    { title: t("health.rep.delay"), w: RIGHT - M - 442, right: true },
  ];
  const foodRows = (list) => list.map((s) => [nameOf(s.id), s.eaten, s.reacted, pct(s.rate), s.intensity === null ? "-" : `${fmt.decimal(s.intensity)} / 5`, dash(s.delay)]);
  section(t("health.an.suspects"), P.red);
  paragraph(t("health.an.suspectsHint"));
  if (a.suspects.length) table(foodCols, foodRows(a.suspects));
  else paragraph(t("health.an.noSuspect"), { color: P.ink });
  if (a.watch.length) {
    section(t("health.an.watch"), P.orange);
    paragraph(t("health.an.watchHint"));
    table(foodCols, foodRows(a.watch));
  }
  section(t("health.an.safe"), P.green);
  paragraph(t("health.an.safeHint"));
  if (a.safe.length) {
    table([{ title: t("health.rep.food"), w: 250 }, { title: t("health.rep.eaten"), w: 100, right: true }, { title: t("health.rep.calmConfirmed"), w: RIGHT - M - 350, right: true }],
      a.safe.map((s) => [nameOf(s.id), s.eaten, s.calm]));
  } else paragraph(t("health.an.noSafe"), { color: P.ink });

  // Statut noté par la personne et réintroductions
  const marked = health.foods.filter((f) => f.status !== "unknown");
  if (marked.length) {
    section(t("health.rep.marked"));
    for (const status of ["react", "ok"]) {
      const list = marked.filter((f) => f.status === status).map((f) => nameOf(f.id));
      if (list.length) paragraph(`${t(`health.status.${status}`)} : ${list.join(", ")}`, { color: P.ink });
    }
  }

  // Tendances
  section(t("health.an.trends"));
  table([{ title: t("health.rep.weekOf"), w: 160 }, { title: t("health.an.meals"), w: 110, right: true }, { title: t("health.an.reactions"), w: 110, right: true }, { title: t("health.sum.minutes"), w: RIGHT - M - 380, right: true }],
    a.weeks.map((w) => [short(w.from), w.meals, w.reactions, dash(w.minutes)]));
  paragraph(`${t("health.an.timeOfDay")} — ${TIME_SLOTS.map((s) => `${t(`health.an.slot.${s}`)} : ${a.slots[s]}`).join("   ·   ")}`, { color: P.ink });

  // Repas les plus parlants
  if (a.notable.length) {
    section(t("health.an.notable"));
    table([
      { title: t("health.rep.date"), w: 64 }, { title: t("health.rep.time"), w: 52 }, { title: t("health.rep.meal"), w: 74 },
      { title: t("health.rep.foodsDrinks"), w: 200, wrap: true }, { title: t("health.rep.reaction"), w: RIGHT - M - 390, wrap: true },
    ], a.notable.map(({ meal: m, reactions }) => [
      short(m.date), hm(m.time), t(`health.kind.${m.kind}`),
      [...m.foods, ...(m.drinks ?? []).map((d) => d.foodId).filter(Boolean)].map(nameOf).concat(m.text && !m.foods.length ? [m.text] : [])
        .concat(m.spicy ? [t("health.meal.spicy")] : []).concat(m.hot ? [t("health.meal.hot")] : []).join(", ") || "-",
      reactions.map((r) => `${t(`health.where.${r.where}`)} ${r.intensity}/5${r.time ? `, ${hm(r.time)}${reactionEnd(r) ? ` - ${hm(reactionEnd(r))}` : ""}` : ""}`).join(" ; "),
    ]));
  }

  // Méthode et avertissement
  section(t("health.rep.method"));
  paragraph(t("health.rep.methodText"), { color: P.ink });
  paragraph(t("health.rep.disclaimer"), { italic: true });

  // Pied de page : numéro de page
  pdf.pages.forEach((p, i) => p.text(`LifeCal · ${i + 1} / ${pdf.pages.length}`, RIGHT, H - 22, { size: 7.5, color: P.gray, align: "right" }));
  return pdf.save();
}
