// Fenêtre « Scanner un reçu » : la facture et la preuve de transaction (photo ou PDF),
// leur lecture (OCR) et la dépense préremplie à vérifier avant de l'enregistrer.
//
//   state : { slots: { invoice, proof }, values }
//     slot   : { url, type, name, status: reading | done | failed | pdf, progress }
//     values : ce que la dépense contiendra (voir expenseForm, mode « receipt »)

import { esc } from "../../core/dom.js";
import { fmt, t } from "../../i18n/index.js";
import { expenseForm } from "../pages/timesheet.js";

export const RECEIPT_SLOTS = ["invoice", "proof"];

export function slotStatus(slot) {
  if (slot.status === "reading") return `⏳ ${esc(t("receipt.reading"))}${slot.progress ? ` ${Math.round(slot.progress * 100)} %` : ""}`;
  if (slot.status === "failed") return `⚠️ ${esc(t("receipt.failed"))}`;
  if (slot.status === "pdf") return `📄 ${esc(t("receipt.pdfNotRead"))}`;
  if (!slot.total) return `✓ ${esc(t("receipt.noAmount"))}`;
  return `✓ ${esc(t(slot.tip ? "receipt.foundTip" : "receipt.found", { amount: fmt.money(slot.total), tip: fmt.money(slot.tip ?? 0) }))}`;
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

export function receiptView(state, ts, date, projects, chosen) {
  return `<div class="receipt">
    <h2 id="receipt-title">🧾 ${t("receipt.title")}</h2>
    <p class="hint">${t("receipt.hint")}</p>
    <div class="receipt-slots">${RECEIPT_SLOTS.map((k) => slotView(k, state.slots[k])).join("")}</div>
    <p class="hint receipt-check">${t("receipt.check")}</p>
    ${expenseForm(ts, date, projects, chosen, null, state.values)}
  </div>`;
}
