// Listes à cocher (commissions, choses à emporter en voyage…).
//
// Rangées dans item.data.checklist : [{ id, text, done }]. Fonctions pures :
// elles retournent toujours une nouvelle liste.

import { newId } from "./item.js";

// `field` : la liste « À préparer » (checklist) ou une autre liste du même genre
// (idées cadeaux, invités d'un événement).
export const getChecklist = (item, field = "checklist") => (Array.isArray(item?.data?.[field]) ? item.data[field] : []);

export function addEntry(list, text) {
  const clean = String(text ?? "").trim();
  return clean ? [...list, { id: newId(), text: clean, done: false }] : list;
}

export const toggleEntry = (list, id) => list.map((e) => (e.id === id ? { ...e, done: !e.done } : e));
export const removeEntry = (list, id) => list.filter((e) => e.id !== id);

export function progress(list) {
  const done = list.filter((e) => e.done).length;
  return { done, total: list.length, complete: list.length > 0 && done === list.length };
}

export const pending = (list) => list.filter((e) => !e.done);

// Texte du formulaire (un article par ligne) -> liste. Les articles déjà
// présents gardent leur identifiant et leur état « coché ».
export function fromLines(text, previous = []) {
  const unused = [...previous];
  return String(text ?? "")
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean)
    .map((line) => {
      const k = unused.findIndex((e) => e.text.toLowerCase() === line.toLowerCase());
      if (k >= 0) return { ...unused.splice(k, 1)[0], text: line };
      return { id: newId(), text: line, done: false };
    });
}

export const toLines = (list) => list.map((e) => e.text).join("\n");
