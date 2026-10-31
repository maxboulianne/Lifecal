// Fenêtre « Scanner un reçu » : la facture et la preuve de transaction (photo ou PDF),
// leur lecture (OCR) et la dépense préremplie à vérifier avant de l'enregistrer.
//
//   state : { slots: { invoice, proof }, values }
//     slot   : { url, type, name, status: reading | done | failed | pdf, progress }
//     values : ce que la dépense contiendra (voir expenseForm, mode « receipt »)

import { esc } from "../../core/dom.js";
import { fmt, getLanguage, t } from "../../i18n/index.js";
import { OCR_LANGUAGES, OCR_LANGUAGE_TAGS } from "../../scan/ocr.js";
import { expenseForm } from "../pages/timesheet.js";

export const RECEIPT_SLOTS = ["invoice", "proof"];

// Montant dans la devise du reçu : « 151 200 ₫ », « 46,00 CN¥ » ; en dollars canadiens comme ailleurs
function money(n, currency) {
  if (!currency || currency === "CAD") return fmt.money(n);
  try {
    return new Intl.NumberFormat(getLanguage(), { style: "currency", currency }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}

export function slotStatus(slot) {
  if (slot.status === "reading") return `⏳ ${esc(t("receipt.reading"))}${slot.progress ? ` ${Math.round(slot.progress * 100)} %` : ""}`;
  if (slot.status === "failed") return `⚠️ ${esc(t("receipt.failed"))}`;
  if (slot.status === "pdf") return `📄 ${esc(t("receipt.pdfNotRead"))}`;
  if (!slot.total) return `✓ ${esc(t("receipt.noAmount"))}`;
  return `✓ ${esc(t(slot.tip ? "receipt.foundTip" : "receipt.found", { amount: money(slot.total, slot.currency), tip: money(slot.tip ?? 0, slot.currency) }))}`;
}

function slotView(kind, slot) {
  const title = `${kind === "invoice" ? "🧾" : "💳"} ${esc(t(`attach.kind.${kind}`))}`;
  if (!slot) {
    return `<div class="receipt-slot empty" data-slot="${kind}">
      <p class="receipt-slot-title">${title}</p>
      <p class="hint">${esc(t(`receipt.${kind}Hint`))}</p>
      <div class="actions start">
        <label class="btn soft">📷 ${t("receipt.photo")}
          <input type="file" accept="image/*" capture="environment" data-action="ts-receipt-file" data-kind="${kind}" hidden></label>
        <label class="btn ghost">🖼️ ${t("receipt.file")}
          <input type="file" accept="image/*,application/pdf" data-action="ts-receipt-file" data-kind="${kind}" hidden></label>
      </div>
    </div>`;
  }
  return `<div class="receipt-slot" data-slot="${kind}">
    <div class="receipt-thumb">${slot.type === "application/pdf" ? "📄" : `<img src="${esc(slot.url)}" alt="">`}</div>
    <div class="receipt-slot-text">
      <p class="receipt-slot-title">${title}</p>
      <p class="hint" data-role="slot-status">${slotStatus(slot)}</p>
      <button type="button" class="btn link danger" data-action="ts-receipt-clear" data-kind="${kind}">🗑 ${t("ts.delete")}</button>
    </div>
  </div>`;
}

// Nom d'une langue dans la langue de l'application (« vietnamien », « chinois (simplifié) »)
function languageName(code) {
  try {
    return new Intl.DisplayNames([getLanguage(), "en"], { type: "language" }).of(OCR_LANGUAGE_TAGS[code]) ?? code;
  } catch {
    return code;
  }
}

export function receiptView(state, ts, date, projects, chosen) {
  return `<div class="receipt">
    <h2 id="receipt-title">🧾 ${t("receipt.title")}</h2>
    <p class="hint">${t("receipt.hint")}</p>
    <label class="receipt-lang">🌐 ${t("receipt.language")}
      <select data-action="ts-receipt-lang">${OCR_LANGUAGES.map((l) => `<option value="${l}" ${l === state.lang ? "selected" : ""}>${esc(languageName(l))}</option>`).join("")}</select>
      <span class="hint">${t("receipt.languageHint")}</span></label>
    <div class="receipt-slots">${RECEIPT_SLOTS.map((k) => slotView(k, state.slots[k])).join("")}</div>
    <p class="hint receipt-check">${t("receipt.check")}</p>
    ${expenseForm(ts, date, projects, chosen, null, state.values)}
  </div>`;
}
