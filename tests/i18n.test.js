import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, detectLanguage, fmt, setLanguage, t } from "../js/i18n/index.js";
import fr from "../js/i18n/locales/fr.js";

const params = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const forms = (v) => (typeof v === "object" && !Array.isArray(v) ? Object.values(v) : Array.isArray(v) ? v : [v]);

for (const { code, dict } of LANGUAGES) {
  test(`${code} : toutes les clés, mêmes paramètres`, () => {
    const missing = Object.keys(fr).filter((k) => !(k in dict));
    assert.deepEqual(missing, [], `clés manquantes en ${code}`);
    const extra = Object.keys(dict).filter((k) => !(k in fr));
    assert.deepEqual(extra, [], `clés inconnues en ${code}`);
    for (const [key, ref] of Object.entries(fr)) {
      if (Array.isArray(ref)) {
        assert.ok(Array.isArray(dict[key]) && dict[key].length, `${code} ${key} : liste attendue`);
        continue;
      }
      const expected = new Set(forms(ref).flatMap(params));
      for (const text of forms(dict[key])) {
        for (const p of params(text)) assert.ok(expected.has(p), `${code} ${key} : paramètre inconnu {${p}}`);
      }
      if (typeof dict[key] === "object") assert.ok(dict[key].other, `${code} ${key} : forme « other » requise`);
    }
  });
}

test("pluriels et interpolation", () => {
  setLanguage("fr");
  assert.equal(t("count.items", { count: 1 }), "1 élément");
  assert.equal(t("count.items", { count: 3 }), "3 éléments");
  setLanguage("en");
  assert.equal(t("rule.flexible", { count: 1 }), "Once a week");
  assert.equal(t("rule.flexible", { count: 3 }), "3 times a week");
  setLanguage("ko");
  assert.equal(t("count.days", { count: 5 }), "5일");
  assert.equal(t("clé.inconnue"), "clé.inconnue");
  setLanguage("fr");
});

test("formatage selon la langue", () => {
  const d = new Date(2026, 9, 23, 12);
  setLanguage("fr");
  assert.equal(fmt.longDate(d), "Vendredi 23 octobre");
  assert.equal(fmt.inDays(1), "demain");
  setLanguage("de");
  assert.equal(fmt.longDate(d), "Freitag, 23. Oktober");
  setLanguage("es");
  assert.equal(fmt.list(["A", "B", "C"]), "A, B y C");
  setLanguage("fr");
  assert.equal(fmt.decimal(3.5), "3,5");
  setLanguage("en");
  assert.equal(fmt.decimal(3.5), "3.5");
  setLanguage("fr");
});

test("détection de la langue de l'appareil", () => {
  assert.equal(detectLanguage(["pt-BR", "en"]), "pt");
  assert.equal(detectLanguage(["ja-JP", "ko-KR"]), "ko");
  assert.equal(detectLanguage(["ja-JP"]), "fr");
});
