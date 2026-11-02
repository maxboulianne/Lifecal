import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addPurchases, classifyPurchase, csvRows, merchantKey, parseDesjardinsCsv, purchaseTaxes, purchaseTotals, quarterPurchases, suggest,
} from "../js/timesheet/purchases.js";
import { emptyTimesheet, normalizeTimesheet } from "../js/timesheet/timesheet.js";

// Relevés inventés, au format des CSV d'AccèsD (Visa, puis compte de la Caisse)
const VISA = `
"VISA**** **** **** 1000","","","2026/04/27","1","PAIEMENT AUTORISÉ - PRÉLÈVEMENT EFFECTUÉ","","","","","","",-500.00,""
"VISA**** **** **** 1000","","","2026/04/30","1","FRAIS DE CRÉDIT","","","","","",12.00,"",""
"VISA**** **** **** 1234","","","2026/04/01","1","QUINCAILLERIE TEST #12 SAINT-JEROME QC","","","","","",114.98,"",""
"VISA**** **** **** 1234","","","2026/04/02","1","HOTEL SOLEIL 866-5551234 AZ","","","","","",169.31,"",""
"VISA**** **** **** 1234","","","2026/04/02","2","USD","","","","","",118.25,"",""
"VISA**** **** **** 1234","","","2026/04/05","1","RESTAURANT LE TEST LAVAL QC","","","","","",57.49,"",""
"VISA**** **** **** 1234","","","2026/05/05","1","QUINCAILLERIE TEST #12 SAINT-JEROME QC","","","","","",229.95,"",""
"VISA**** **** **** 1234","","","2026/07/02","1","QUINCAILLERIE TEST #13 LAVAL QC","","","","","",11.50,"",""
`;
const CAISSE = `

"Succursale test","0000001","EOP","2026/04/02",00001,"Paiement facture - AccèsD Internet /S.A.A.Q. PERCEPTIONS","",363.30,"","","","","",1000.00
"Succursale test","0000001","EOP","2026/04/15",00002,"Remise gouvernementale TPS-TVQ /TPS-TVQ","",900.00,"","","","","",100.00
"Succursale test","0000001","EOP","2026/04/16",00003,"Assurance /ASSUREUR EXEMPLE","",159.69,"","","","","",50.00
"Succursale test","0000001","EOP","2026/04/27",00004,"Transfert de fonds reçu /ENTREPRISE ABC /","","",6000.00,"","","","",6050.00
"Succursale test","0000001","EOP","2026/04/30",00005,"Frais fixes d'utilisation","",3.00,"","","","","",6047.00
`;

test("Relevés : lecture des CSV de la Visa et de la Caisse", () => {
  assert.deepEqual(csvRows('"a","b ""c""",3\n"x",,y'), [["a", 'b "c"', "3"], ["x", "", "y"]]);
  const visa = parseDesjardinsCsv(VISA);
  assert.equal(visa.length, 7); // la ligne « USD » n'est pas un achat
  assert.equal(visa.find((p) => p.description.startsWith("HOTEL")).orig, "118,25 USD");
  assert.equal(visa[0].amount, -500); // paiement : un crédit
  assert.deepEqual(visa[2], { source: "visa", account: "1234", date: "2026-04-01", seq: "1", description: "QUINCAILLERIE TEST #12 SAINT-JEROME QC", amount: 114.98, orig: "" });
  const caisse = parseDesjardinsCsv(CAISSE);
  assert.equal(caisse.length, 5);
  assert.equal(caisse[3].amount, -6000); // dépôt
  assert.equal(caisse[0].source, "caisse");
});

test("Relevés : classement proposé", () => {
  const cls = (description, amount = 10, extra = {}) => suggest({ source: "visa", description, amount, orig: "", ...extra });
  assert.equal(cls("PAIEMENT AUTORISÉ", -500).category, "excluded");
  assert.deepEqual(cls("FRAIS DE CRÉDIT"), { category: "exempt", pct: 1, status: "ok", note: "bankFees" });
  assert.equal(cls("Paiement facture - AccèsD Internet /S.A.A.Q. PERCEPTIONS").category, "exempt");
  assert.equal(cls("Remise gouvernementale TPS-TVQ /TPS-TVQ").category, "excluded");
  assert.equal(cls("Assurance /ASSUREUR EXEMPLE").note, "insurance");
  assert.deepEqual(cls("RESTAURANT LE TEST LAVAL QC"), { category: "meal", pct: 0.5, status: "check", note: "meal" });
  assert.equal(cls("HOTEL SOLEIL 866-5551234 AZ").note, "foreign"); // commerçant hors du Canada
  assert.equal(cls("LOGICIEL X 800-5551234 CA", 10, { orig: "23,00 USD" }).note, "foreign"); // payé en devise
  assert.deepEqual(cls("QUINCAILLERIE TEST #12 SAINT-JEROME QC"), { category: "taxable", pct: 1, status: "check", note: "new" });
  assert.equal(merchantKey("QUINCAILLERIE TEST #13 LAVAL QC"), "QUINCAILLERIE TEST");
});

test("Relevés : doublons, choix retenu par commerce, crédits et totaux du trimestre", () => {
  let ts = emptyTimesheet();
  ts = addPurchases(ts, parseDesjardinsCsv(VISA)).ts;
  let r = addPurchases(ts, [...parseDesjardinsCsv(VISA), ...parseDesjardinsCsv(CAISSE)]);
  assert.deepEqual([r.added, r.skipped], [5, 7]); // le relevé Visa réimporté n'ajoute rien
  ts = r.ts;
  // La quincaillerie : usage mixte 50 %, retenu ; ses autres achats suivent
  const first = ts.purchases.find((p) => p.description.includes("#12"));
  ts = classifyPurchase(ts, first.id, { category: "taxable", pct: 0.5 });
  const hw = ts.purchases.filter((p) => merchantKey(p.description) === "QUINCAILLERIE TEST");
  assert.deepEqual(hw.map((p) => [p.pct, p.status]), [[0.5, "ok"], [0.5, "ok"], [0.5, "ok"]]);
  assert.deepEqual(ts.merchantRules["QUINCAILLERIE TEST"], { category: "taxable", pct: 0.5 });
  // Un relevé plus tard : la quincaillerie est classée toute seule
  r = addPurchases(ts, [{ source: "visa", account: "1234", date: "2026-08-01", seq: "1", description: "QUINCAILLERIE TEST #12 SAINT-JEROME QC", amount: 50, orig: "" }]);
  assert.deepEqual(["category", "pct", "status"].map((k) => r.ts.purchases.at(-1)[k]), ["taxable", 0.5, "ok"]);
  // Crédits : 114,98 $ taxes comprises = 100 $ avant taxes ; à 50 % : 2,50 $ de TPS et 4,99 $ de TVQ
  const x = purchaseTaxes(ts.purchases.find((p) => p.id === first.id));
  assert.deepEqual([x.base, x.tps, x.tvq].map((n) => Math.round(n * 100) / 100), [50, 2.5, 4.99]);
  const q2 = quarterPurchases(ts, "2026-T2");
  assert.equal(q2.length, 11); // la quincaillerie de juillet est au trimestre suivant
  const totals = purchaseTotals(q2);
  assert.equal(totals.groups.mixed.count, 2);
  assert.deepEqual([totals.groups.meal.tps, totals.groups.meal.tvq], [1.25, 2.49]); // resto 57,49 $ : 50 %
  assert.equal(totals.groups.excluded.count, 3); // paiement de la carte, remise, dépôt
  assert.equal(totals.tps, 8.75); // 2,50 + 5,00 (mixte) + 1,25 (resto)
  // gardé dans les données
  const back = normalizeTimesheet(JSON.parse(JSON.stringify(ts)));
  assert.equal(back.purchases.length, ts.purchases.length);
  assert.deepEqual(back.merchantRules, ts.merchantRules);
});

// Relevé Visa en PDF inventé, tel que pdf.js le rend (une ligne par rangée de texte)
const PDF_LINES = [
  "CARTE AFFAIRES VISA DESJARDINS",
  "30  01  2027  27  02  2027  4530 92** **** 9999",
  "DATE DU RELEVÉ  Jour  30  Mois  01  Année 2027  Page : 1 de 2",
  "Transactions effectuées avec la carte de : CLIENT TEST",
  "28  12  29  12  001  HOTEL SOLEIL  866-5551234  AZ  1 167,65",
  "823,25 DOLLAR AMERICAIN  TX: 1.417758",
  "04  01  04  01  002  QUINCAILLERIE TEST #12  SAINT-JEROME QC  79,51",
  "29  01  30  01  003  CAFE EXEMPLE  HO CHI MINH  VN  13,06",
  "236 380,00 DONG  TX: 0.000055",
  "Total  1 260,22",
  "Opérations au compte  4530 92** **** 9999",
  "15  01  15  01  001  PAIEMENT CAISSE  4 500,00CR",
  "30  01  30  01  002  FRAIS DE CRÉDIT  12,45",
  "001  FRE  13 000,00  24 05 2024  24 05 2027  ACCORD D CAISSE  10,40 %",
];

test("Relevé Visa en PDF : achats, devises, opérations au compte, total vérifié", async () => {
  const { parseDesjardinsVisaPdf } = await import("../js/timesheet/purchases.js");
  const r = parseDesjardinsVisaPdf(PDF_LINES);
  assert.equal(r.rows.length, 5); // la ligne du plan de financement n'est pas une transaction
  assert.deepEqual([r.total, r.expected], [1260.22, 1260.22]);
  assert.deepEqual(r.rows[0], { source: "visa", account: "9999", date: "2026-12-28", seq: "001", description: "HOTEL SOLEIL 866-5551234 AZ", amount: 1167.65, orig: "823,25 USD" }); // relevé de janvier : décembre de l'année d'avant
  assert.equal(r.rows[2].orig, "236 380,00 VND");
  assert.deepEqual(r.rows.slice(3).map((p) => [p.seq, p.amount]), [["A001", -4500], ["A002", 12.45]]);
  assert.deepEqual(parseDesjardinsVisaPdf(["Bonjour"]), { rows: [], total: 0, expected: null });
});

test("PDF : morceaux de texte regroupés en lignes", async () => {
  const { groupLines } = await import("../js/scan/pdf-text.js");
  const item = (str, x, y, width = str.length * 5) => ({ str, transform: [1, 0, 0, 1, x, y], width });
  assert.deepEqual(groupLines([
    item("79,51", 500, 700), item("02", 40, 700.8), item("06", 60, 700), item("DISSAN", 120, 700), item("Total", 40, 650), item("1 260,22", 500, 650),
  ]), ["02  06  DISSAN  79,51", "Total  1 260,22"]);
});

// Relevé personnel inventé (compte avec sous-comptes : épargne, marge de crédit)
const PERSO = `
"Succursale test","000999","EOP","2026/04/03",00001,"Achat /RESTAURANT LE TEST","",57.49,"","","","","",100.00
"Succursale test","000999","EOP","2026/04/03",00002,"Achat /EPICERIE EXEMPLE","",84.96,"","","","","",15.04
"Succursale test","000999","EOP","2026/04/24",00003,"Achat /CAFE TEST","",14.30,"","","","","",0.74
"Succursale test","000999","EOP","2026/04/24",00004,"Achat /CAFE TEST","",14.30,"","","","","",-13.56
"Succursale test","000999","EOP","2026/04/29",00005,"Paiement internet de /ENTREPRISE ABC/P20260429","","",2500.00,"","","","",2486.44
"Succursale test","000999","ES2","2026/04/30",00001,"Intérêt sur ES","","",0.02,"","","","",235.38
"Succursale test","000999","MC3","2026/04/27",00001,"Avance au compte EOP","","","","","",262.88,"",262.88
`;

test("Relevé personnel : personnel par défaut, sous-comptes ignorés, commerces d'affaires proposés ensuite", async () => {
  const { addPurchases, classifyPurchase, merchantKey, parseDesjardinsCsv, purchaseTotals } = await import("../js/timesheet/purchases.js");
  const rows = parseDesjardinsCsv(PERSO);
  assert.equal(rows.length, 5); // épargne et marge de crédit : ignorées
  assert.equal(merchantKey("Achat /THE HOME DEPOT #7147"), "THE HOME DEPOT");
  let ts = addPurchases(emptyTimesheet(), rows, { source: "perso" }).ts;
  assert.deepEqual(ts.purchases.map((p) => [p.source, p.category, p.status]).slice(0, 2), [["perso", "excluded", "ok"], ["perso", "excluded", "ok"]]);
  // Les deux cafés identiques du même jour restent deux ; un relevé qui chevauche n'ajoute rien
  assert.equal(ts.purchases.filter((p) => p.description === "Achat /CAFE TEST").length, 2);
  const again = addPurchases(ts, parseDesjardinsCsv(PERSO), { source: "perso" });
  assert.deepEqual([again.added, again.skipped], [0, 5]);
  // Le resto coché pour l'entreprise : compté (50 %) ; l'épicerie reste personnelle
  const resto = ts.purchases.find((p) => p.description.includes("RESTAURANT"));
  ts = classifyPurchase(ts, resto.id, { category: "meal", pct: 0.5 });
  const totals = purchaseTotals(ts.purchases);
  assert.deepEqual(Object.keys(totals.groups), ["persoMeal"]); // personnel et dépôt : hors du calcul
  assert.deepEqual([totals.tps, totals.tvq], [1.25, 2.49]);
  assert.deepEqual(ts.personalRules, { "RESTAURANT LE TEST": { category: "meal", pct: 0.5 } });
  assert.deepEqual(ts.merchantRules ?? {}, {}); // les règles de Maxxam ne changent pas
  // Relevé suivant : le resto est proposé (à confirmer), pas imposé
  const next = addPurchases(ts, [{ source: "caisse", account: "0999", date: "2026-05-02", seq: "1", description: "Achat /RESTAURANT LE TEST", amount: 30, orig: "" }], { source: "perso" }).ts;
  assert.deepEqual(["category", "status", "note"].map((k) => next.purchases.at(-1)[k]), ["meal", "check", "businessBefore"]);
});

test("Recharge à la maison : part de chaque période d'Hydro-Québec au prorata des jours", async () => {
  const { addHomeCharging, quarterHomeCharging, removeHomeCharging } = await import("../js/timesheet/purchases.js");
  let ts = emptyTimesheet();
  for (const [from, to, amount] of [["2026-02-18", "2026-04-20", 58], ["2026-04-21", "2026-06-17", 34], ["2026-06-18", "2026-08-19", 39]]) ts = addHomeCharging(ts, { from, to, amount });
  const q = quarterHomeCharging(ts, "2026-T2");
  assert.deepEqual(q.rows.map((r) => [r.inQuarter, r.days, r.share]), [[20, 62, 18.71], [58, 58, 34], [13, 63, 8.05]]);
  assert.deepEqual([q.base, q.tps, q.tvq], [60.76, 3.04, 6.06]); // montants avant taxes
  assert.equal(quarterHomeCharging(ts, "2026-T3").rows.length, 1); // juillet-sept. : la 3e période seulement
  assert.equal(quarterHomeCharging(removeHomeCharging(ts, q.rows[0].id), "2026-T2").rows.length, 2);
  assert.equal(addHomeCharging(ts, { from: "2026-05-01", to: "2026-04-01", amount: 5 }).homeCharging.length, 3); // période à l'envers : refusée
});
