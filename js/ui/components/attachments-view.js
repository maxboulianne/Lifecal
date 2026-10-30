// Fenêtre des justificatifs d'une dépense : la facture et la preuve de transaction
// (photos scannées ou PDF), leur type, ajouter (photo, ou fichier) et retirer.
// Les images sont chargées après l'ouverture (elles sont dans IndexedDB).

import { esc } from "../../core/dom.js";
import { fmt, t } from "../../i18n/index.js";
import { ATTACHMENT_KINDS, EXPENSE_ICONS, expenseTotal } from "../../timesheet/expenses.js";

// others : les autres dépenses proches [{ id, label }], pour y déplacer un justificatif.
export function attachmentsView(expense, target, others = []) {
  const list = expense.attachments;
  return `<div class="attachments">
    <h2 id="attach-title">📎 ${t("attach.title")}</h2>
    <p class="attach-expense">${EXPENSE_ICONS[expense.type]} <strong>${esc(t(`ts.expenseType.${expense.type}`))}</strong>
      ${expense.description ? ` · ${esc(expense.description)}` : ""}
      <span class="hint">${esc(expense.date)} · ${esc(target)} · ${esc(fmt.money(expenseTotal(expense)))}</span></p>
    <p class="hint">${t("attach.hint")}</p>
    ${list.length ? `<ul class="attach-list">${list.map((a) => `<li>
        <div class="attach-preview">${a.type === "application/pdf"
          ? `<a class="attach-pdf" data-file-link="${esc(a.id)}" target="_blank" rel="noopener">📄 ${esc(a.name || "PDF")}</a>`
          : `<img data-file="${esc(a.id)}" alt="${esc(t(`attach.kind.${a.kind}`))}">`}</div>
        <div class="attach-meta">
          <select data-action="ts-attach-kind" data-expense="${esc(expense.id)}" data-id="${esc(a.id)}" aria-label="${esc(t("attach.kind"))}">
            ${ATTACHMENT_KINDS.map((k) => `<option value="${k}" ${k === a.kind ? "selected" : ""}>${esc(t(`attach.kind.${k}`))}</option>`).join("")}
          </select>
          ${others.length ? `<select data-action="ts-attach-move" data-expense="${esc(expense.id)}" data-id="${esc(a.id)}" aria-label="${esc(t("attach.moveTo"))}">
            <option value="">↪ ${esc(t("attach.moveTo"))}</option>
            ${others.map((o) => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join("")}
          </select>` : ""}
          <button type="button" class="btn link danger" data-action="ts-attach-remove" data-expense="${esc(expense.id)}" data-id="${esc(a.id)}">🗑 ${t("ts.delete")}</button>
        </div>
      </li>`).join("")}</ul>` : `<p class="ts-empty-export">${t("attach.none")}</p>`}
    ${list.length && expense.type === "mileage" ? `<div class="attach-new">
      <p class="hint">${t("attach.newExpenseHint")}</p>
      <button type="button" class="btn primary" data-action="ts-receipt-from" data-id="${esc(expense.id)}">🧾 ${t("attach.newExpense")}</button>
    </div>` : list.length ? `<div class="actions start">
      <button type="button" class="btn soft" data-action="ts-receipt-from" data-id="${esc(expense.id)}">🧾 ${t("attach.newExpense")}</button>
    </div>` : ""}
    <div class="actions start attach-add">
      <label class="btn primary">📷 ${t("attach.takePhoto")}
        <input type="file" accept="image/*" capture="environment" data-action="ts-attach-file" data-expense="${esc(expense.id)}" hidden></label>
      <label class="btn soft">🖼️ ${t("attach.chooseFile")}
        <input type="file" accept="image/*,application/pdf" data-action="ts-attach-file" data-expense="${esc(expense.id)}" hidden></label>
    </div>
    <div class="actions">
      <button type="button" class="btn ghost" data-action="close">${t("detail.close")}</button>
    </div>
  </div>`;
}
