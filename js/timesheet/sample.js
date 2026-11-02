// Documents d'exemple, pour montrer l'application à d'autres : une facture et un rapport
// TPS / TVQ faits de données entièrement fictives (entreprise, client, heures, achats).
// Rien ici ne lit ni ne modifie les données de l'utilisateur.

import { invoiceData } from "./invoice.js";
import { addHomeCharging, normalizePurchases } from "./purchases.js";
import { recordInvoice, salesTaxes } from "./taxes.js";
import { emptyTimesheet, normalizeTimesheet } from "./timesheet.js";

export const SAMPLE_QUARTER = "2026-T3";

const CLIENT = "sample-client";
const PROJECT = "sample-project";

// Semaines du 31 août au 11 septembre 2026 : 8 jours de 7,5 h
const DAYS = [
  ["2026-08-31", "QA03", "Revue du devis technique et des normes applicables"],
  ["2026-09-01", "QA02", "Revue du plan qualité du fournisseur"],
  ["2026-09-02", "QA05", "Rencontre technique avec le fournisseur"],
  ["2026-09-03", "QA01", "Inspection des soudures, lot A"],
  ["2026-09-08", "QA01", "Inspection des soudures, lot B"],
  ["2026-09-09", "QA04", "Vérification de la peinture et des épaisseurs"],
  ["2026-09-10", "QA06", "Coordination avec l'ingénierie et les achats"],
  ["2026-09-11", "QA01", "Rapport d'inspection final"],
];

export const SAMPLE_INVOICE = { clientId: CLIENT, from: "2026-08-31", to: "2026-09-13", number: "2026-003", date: "2026-09-15", po: "PO-45678", sample: true };

export function sampleTimesheet() {
  const base = normalizeTimesheet({
    ...emptyTimesheet(),
    business: {
      name: "Atelier Boréal inc.", contact: "Alex Exemple", address: "123, rue de l'Exemple\nVille-Exemple (Québec)  A1A 1A1",
      phone: "555 555-0123", email: "bonjour@exemple.com", tpsNumber: "000000000 RT0001", tvqNumber: "0000000000 TQ0001", terms: 30,
    },
    clients: [{ id: CLIENT, name: "Les Constructions Fictives ltée", contact: "Sam Modèle", email: "comptes@exemple.org",
      address: "456, boulevard Imaginaire\nCité-Fictive (Québec)  B2B 2B2", po: "PO-45678" }],
    projects: [{ id: PROJECT, number: "P-100", name: "Inspection qualité — usine Exemple", clientId: CLIENT, rate: 95 }],
    entries: DAYS.map(([date, taskCode, work], i) => ({ id: `sample-e${i}`, date, projectId: PROJECT, hours: 7.5, taskCode, work })),
    expenses: [
      { id: "sample-x1", date: "2026-09-02", type: "hotel", description: "Hôtel Exemple (1 nuit)", projectId: PROJECT, amount: 189 },
      { id: "sample-x2", date: "2026-09-02", type: "food", meal: "dinner", description: "", projectId: PROJECT, amount: 38.5 },
      { id: "sample-x3", date: "2026-09-03", type: "food", meal: "lunch", description: "", projectId: PROJECT, amount: 21.75 },
      { id: "sample-x4", date: "2026-09-08", type: "mileage", description: "Bureau — usine Exemple (aller-retour)", projectId: PROJECT, qty: 240, unitPrice: 0.72 },
    ],
  });
  // Registre des factures du trimestre : deux factures précédentes + celle de l'exemple
  let ts = base;
  const { totals } = invoiceData(ts, SAMPLE_INVOICE);
  for (const [number, date, subtotal] of [["2026-001", "2026-07-15", 4275], ["2026-002", "2026-08-14", 5320], ["2026-003", "2026-09-15", totals.due]]) {
    ts = recordInvoice(ts, { number, date, clientId: CLIENT, client: "Les Constructions Fictives ltée", subtotal, ...salesTaxes(subtotal) }).ts;
  }
  // Achats du trimestre : une transaction par genre, pour montrer chaque catégorie
  const purchases = normalizePurchases([
    ["visa", "2026-07-08", "BUREAU EN GROS #000 VILLE-EXEMPLE QC", 287.44, "taxable", 1],
    ["visa", "2026-07-20", "TELECOM EXEMPLE (CELLULAIRE)", 91.98, "taxable", 0.5],
    ["visa", "2026-08-05", "RESTAURANT LE FICTIF VILLE-EXEMPLE QC", 68.99, "meal", 0.5],
    ["visa", "2026-08-12", "HOTEL MODELE TORONTO ON", 339, "taxable", 1, "on"],
    ["visa", "2026-08-13", "BISTRO IMAGINAIRE OTTAWA ON", 56.5, "meal", 0.5, "on"],
    ["visa", "2026-08-25", "LOGICIEL EXEMPLE INC (19,99 USD)", 27.4, "exempt", 1],
    ["caisse", "2026-09-02", "QUINCAILLERIE FICTIVE QC", 149.47, "taxable", 1],
    ["visa", "2026-09-10", "BORNE DE RECHARGE EXEMPLE", 50, "taxable", 1],
    ["caisse", "2026-09-18", "ASSURANCE EXEMPLE", 145, "exempt", 1],
    ["perso", "2026-09-22", "CAFE DU COIN VILLE-EXEMPLE", 22.99, "meal", 0.5],
    ["visa", "2026-09-25", "PAIEMENT CAISSE", -1500, "excluded", 0],
  ].map(([source, date, description, amount, category, pct, tax], i) => ({ id: `sample-p${i}`, source, date, description, amount, category, pct, tax, status: "ok" })));
  ts = { ...ts, purchases };
  ts = addHomeCharging(ts, { from: "2026-06-20", to: "2026-08-19", amount: 45 });
  ts = addHomeCharging(ts, { from: "2026-08-20", to: "2026-10-19", amount: 52 });
  return ts;
}
