// Menus de la semaine (module Santé) : un plat par repas (déjeuner, dîner, souper, collation),
// faits d'aliments peu acides. Une semaine sans menu enregistré montre le menu proposé ;
// la changer l'enregistre. Les aliments de la semaine vont dans la liste d'épicerie.
//
// Rangé dans health : menus = { [lundi ISO]: { [0..6]: { breakfast, lunch, dinner, snack: idDuPlat|null } } }
//                     dishes = [{ id, name, kind, foods: [foodIds] }]   (plats ajoutés par l'utilisateur)

import { addDays, parseISODate, startOfWeek, toISODate } from "../core/dates.js";
import { newId } from "../data/item.js";

export const MENU_KINDS = ["breakfast", "lunch", "dinner", "snack"];
const LANGS = ["fr", "en", "es", "pt", "de", "vi", "ko"];

// [id, repas, [noms fr, en, es, pt, de, vi, ko], [aliments]]
const DISHES = [
  ["b1", "breakfast", ["Gruau, banane et beurre d'amande", "Oatmeal, banana and almond butter", "Avena, plátano y mantequilla de almendra", "Mingau de aveia, banana e pasta de amêndoa", "Haferbrei, Banane und Mandelmus", "Cháo yến mạch, chuối và bơ hạnh nhân", "오트밀, 바나나, 아몬드 버터"], ["f-gruau", "f-banane", "f-beurre-d-amande"]],
  ["b2", "breakfast", ["Œufs brouillés, rôtie de blé entier et melon", "Scrambled eggs, whole wheat toast and melon", "Huevos revueltos, tostada integral y melón", "Ovos mexidos, torrada integral e melão", "Rührei, Vollkorntoast und Melone", "Trứng bác, bánh mì nguyên cám nướng và dưa lưới", "스크램블드에그, 통밀 토스트, 멜론"], ["f-ufs", "f-pain-de-ble-entier", "f-melon-cantaloup-miel"]],
  ["b3", "breakfast", ["Yogourt nature et mangue", "Plain yogurt and mango", "Yogur natural y mango", "Iogurte natural e manga", "Naturjoghurt und Mango", "Sữa chua không đường và xoài", "플레인 요거트와 망고"], ["f-yogourt-nature", "f-mangue-mure"]],
  ["b4", "breakfast", ["Gruau, poire et cannelle", "Oatmeal, pear and cinnamon", "Avena, pera y canela", "Mingau de aveia, pera e canela", "Haferbrei, Birne und Zimt", "Cháo yến mạch, lê và quế", "오트밀, 배, 계피"], ["f-gruau", "f-poire", "f-cannelle"]],
  ["b5", "breakfast", ["Rôtie, œuf et avocat", "Toast, egg and avocado", "Tostada, huevo y aguacate", "Torrada, ovo e abacate", "Toast, Ei und Avocado", "Bánh mì nướng, trứng và bơ", "토스트, 달걀, 아보카도"], ["f-pain-de-ble-entier", "f-ufs", "f-avocat"]],
  ["b6", "breakfast", ["Crêpes au sarrasin et banane", "Buckwheat pancakes and banana", "Crepes de trigo sarraceno y plátano", "Panquecas de trigo-sarraceno e banana", "Buchweizenpfannkuchen und Banane", "Bánh kếp kiều mạch và chuối", "메밀 팬케이크와 바나나"], ["f-sarrasin", "f-ufs", "f-banane"]],
  ["b7", "breakfast", ["Œufs, pommes de terre rissolées et melon", "Eggs, home fries and melon", "Huevos, patatas salteadas y melón", "Ovos, batatas salteadas e melão", "Eier, Bratkartoffeln und Melone", "Trứng, khoai tây áp chảo và dưa lưới", "달걀, 감자볶음, 멜론"], ["f-ufs", "f-pomme-de-terre", "f-melon-cantaloup-miel"]],
  ["l1", "lunch", ["Wrap au poulet, concombre et avocat", "Chicken wrap, cucumber and avocado", "Wrap de pollo, pepino y aguacate", "Wrap de frango, pepino e abacate", "Hähnchen-Wrap mit Gurke und Avocado", "Bánh cuốn gà, dưa leo và bơ", "닭고기 랩, 오이, 아보카도"], ["f-poulet", "f-concombre", "f-avocat", "f-laitue"]],
  ["l2", "lunch", ["Salade de quinoa, poulet, légumes, huile d'olive et herbes", "Quinoa salad with chicken, vegetables, olive oil and herbs", "Ensalada de quinoa, pollo, verduras, aceite de oliva y hierbas", "Salada de quinoa, frango, legumes, azeite e ervas", "Quinoasalat mit Hähnchen, Gemüse, Olivenöl und Kräutern", "Salad diêm mạch, gà, rau, dầu ô liu và rau thơm", "퀴노아 샐러드 (닭고기, 채소, 올리브유, 허브)"], ["f-quinoa", "f-poulet", "f-concombre", "f-carotte", "f-huile-d-olive", "f-persil"]],
  ["l3", "lunch", ["Soupe aux légumes maison (sans tomate) et pain", "Homemade vegetable soup (no tomato) and bread", "Sopa de verduras casera (sin tomate) y pan", "Sopa de legumes caseira (sem tomate) e pão", "Hausgemachte Gemüsesuppe (ohne Tomate) und Brot", "Súp rau nhà làm (không cà chua) và bánh mì", "집에서 만든 채소 수프(토마토 없이)와 빵"], ["f-carotte", "f-celeri", "f-courgette", "f-pomme-de-terre", "f-pain-de-ble-entier"]],
  ["l4", "lunch", ["Restes de poisson, riz et légumes", "Leftover fish, rice and vegetables", "Sobras de pescado, arroz y verduras", "Sobras de peixe, arroz e legumes", "Fischreste, Reis und Gemüse", "Cá còn lại, cơm và rau", "남은 생선, 밥, 채소"], ["f-poisson-blanc", "f-riz", "f-brocoli"]],
  ["l5", "lunch", ["Sandwich à la dinde, laitue et concombre", "Turkey sandwich, lettuce and cucumber", "Sándwich de pavo, lechuga y pepino", "Sanduíche de peru, alface e pepino", "Putensandwich mit Salat und Gurke", "Bánh mì kẹp gà tây, xà lách và dưa leo", "칠면조 샌드위치, 상추, 오이"], ["f-dinde", "f-pain-de-ble-entier", "f-laitue", "f-concombre"]],
  ["l6", "lunch", ["Salade de pâtes, poulet, légumes et huile d'olive", "Pasta salad with chicken, vegetables and olive oil", "Ensalada de pasta, pollo, verduras y aceite de oliva", "Salada de massa, frango, legumes e azeite", "Nudelsalat mit Hähnchen, Gemüse und Olivenöl", "Salad mì ống, gà, rau và dầu ô liu", "파스타 샐러드 (닭고기, 채소, 올리브유)"], ["f-pates", "f-poulet", "f-concombre", "f-brocoli", "f-huile-d-olive", "f-basilic"]],
  ["l7", "lunch", ["Soupe poulet et riz", "Chicken and rice soup", "Sopa de pollo y arroz", "Sopa de frango e arroz", "Hühnersuppe mit Reis", "Súp gà nấu cơm", "닭고기 쌀 수프"], ["f-poulet", "f-riz", "f-carotte", "f-celeri", "f-persil"]],
  ["d1", "dinner", ["Saumon au four, riz et haricots verts", "Baked salmon, rice and green beans", "Salmón al horno, arroz y judías verdes", "Salmão assado, arroz e vagem", "Ofenlachs, Reis und grüne Bohnen", "Cá hồi nướng, cơm và đậu que", "오븐 연어, 밥, 그린빈"], ["f-saumon", "f-riz", "f-haricots-verts", "f-aneth"]],
  ["d2", "dinner", ["Dinde hachée, pâtes et courgettes (sans sauce tomate)", "Ground turkey, pasta and zucchini (no tomato sauce)", "Pavo picado, pasta y calabacín (sin salsa de tomate)", "Peru moído, massa e abobrinha (sem molho de tomate)", "Putenhack, Nudeln und Zucchini (ohne Tomatensoße)", "Gà tây xay, mì ống và bí ngòi (không sốt cà chua)", "칠면조 다짐육, 파스타, 애호박 (토마토소스 없이)"], ["f-dinde", "f-pates", "f-courgette", "f-huile-d-olive"]],
  ["d3", "dinner", ["Poisson blanc, patate douce et brocoli", "White fish, sweet potato and broccoli", "Pescado blanco, batata y brócoli", "Peixe branco, batata-doce e brócolis", "Weißfisch, Süßkartoffel und Brokkoli", "Cá thịt trắng, khoai lang và bông cải xanh", "흰살 생선, 고구마, 브로콜리"], ["f-poisson-blanc", "f-patate-douce", "f-brocoli"]],
  ["d4", "dinner", ["Poulet rôti aux herbes, pommes de terre et carottes", "Herb roast chicken, potatoes and carrots", "Pollo asado a las hierbas, patatas y zanahorias", "Frango assado com ervas, batatas e cenouras", "Kräuter-Brathähnchen, Kartoffeln und Karotten", "Gà nướng rau thơm, khoai tây và cà rốt", "허브 로스트 치킨, 감자, 당근"], ["f-poulet", "f-pomme-de-terre", "f-carotte", "f-thym"]],
  ["d5", "dinner", ["Tofu sauté au gingembre doux, riz et bok choy", "Tofu stir-fry with mild ginger, rice and bok choy", "Tofu salteado con jengibre suave, arroz y bok choy", "Tofu salteado com gengibre suave, arroz e bok choy", "Tofu-Pfanne mit mildem Ingwer, Reis und Pak Choi", "Đậu phụ xào gừng nhẹ, cơm và cải thìa", "순한 생강 두부볶음, 밥, 청경채"], ["f-tofu", "f-gingembre-frais-un-peu", "f-riz", "f-bok-choy"]],
  ["d6", "dinner", ["Filet de porc, purée de patate douce et asperges", "Pork tenderloin, mashed sweet potato and asparagus", "Solomillo de cerdo, puré de batata y espárragos", "Lombo de porco, purê de batata-doce e aspargos", "Schweinefilet, Süßkartoffelpüree und Spargel", "Thăn heo, khoai lang nghiền và măng tây", "돼지 안심, 고구마 퓌레, 아스파라거스"], ["f-porc-maigre", "f-patate-douce", "f-asperges"]],
  ["d7", "dinner", ["Saumon, quinoa et épinards", "Salmon, quinoa and spinach", "Salmón, quinoa y espinacas", "Salmão, quinoa e espinafre", "Lachs, Quinoa und Spinat", "Cá hồi, diêm mạch và rau bina", "연어, 퀴노아, 시금치"], ["f-saumon", "f-quinoa", "f-epinards"]],
  ["s1", "snack", ["Poire", "Pear", "Pera", "Pera", "Birne", "Lê", "배"], ["f-poire"]],
  ["s2", "snack", ["Yogourt nature et bleuets", "Plain yogurt and blueberries", "Yogur natural y arándanos", "Iogurte natural e mirtilos", "Naturjoghurt und Heidelbeeren", "Sữa chua không đường và việt quất", "플레인 요거트와 블루베리"], ["f-yogourt-nature", "f-bleuets"]],
  ["s3", "snack", ["Amandes", "Almonds", "Almendras", "Amêndoas", "Mandeln", "Hạnh nhân", "아몬드"], ["f-amandes"]],
  ["s4", "snack", ["Banane", "Banana", "Plátano", "Banana", "Banane", "Chuối", "바나나"], ["f-banane"]],
  ["s5", "snack", ["Melon", "Melon", "Melón", "Melão", "Melone", "Dưa lưới", "멜론"], ["f-melon-cantaloup-miel"]],
  ["s6", "snack", ["Fromage doux et craquelins", "Mild cheese and crackers", "Queso suave y galletas saladas", "Queijo suave e bolachas salgadas", "Milder Käse und Cracker", "Phô mai nhẹ và bánh quy giòn", "순한 치즈와 크래커"], ["f-fromage-doux", "f-craquelins"]],
];

// Menu proposé, du lundi au dimanche
const DEFAULT_WEEK = [
  ["b1", "l1", "d1", "s1"], ["b2", "l2", "d2", "s2"], ["b3", "l3", "d3", "s3"], ["b4", "l4", "d4", "s4"],
  ["b5", "l5", "d5", "s5"], ["b6", "l6", "d6", "s6"], ["b7", "l7", "d7", "s1"],
];

export const BUILT_IN_DISHES = DISHES.map(([id, kind, names, foods]) => ({ id, kind, names, foods, builtIn: true }));
const byId = new Map(BUILT_IN_DISHES.map((d) => [d.id, d]));

export const allDishes = (health) => [...BUILT_IN_DISHES, ...(health.dishes ?? [])];
export const findDish = (health, id) => byId.get(id) ?? (health.dishes ?? []).find((d) => d.id === id) ?? null;
export const dishName = (dish, lang) => (dish?.names ? dish.names[Math.max(0, LANGS.indexOf(lang))] : dish?.name ?? "");

export const weekStartOf = (iso) => toISODate(startOfWeek(parseISODate(iso)));
export const weekDays = (start) => [0, 1, 2, 3, 4, 5, 6].map((i) => toISODate(addDays(parseISODate(start), i)));

const defaultDay = (i) => Object.fromEntries(MENU_KINDS.map((k, j) => [k, DEFAULT_WEEK[i][j]]));

// Le menu d'une semaine : enregistré, sinon le menu proposé
export function weekPlan(health, start) {
  const saved = health.menus?.[start];
  return [0, 1, 2, 3, 4, 5, 6].map((i) => ({ ...defaultDay(i), ...(saved?.[i] ?? {}) }));
}
export const isSavedWeek = (health, start) => Boolean(health.menus?.[start]);

// Changer un plat (null : aucun) ; la semaine est enregistrée à partir du menu affiché
export function setSlot(health, start, day, kind, dishId) {
  if (!MENU_KINDS.includes(kind) || day < 0 || day > 6) return health;
  const plan = weekPlan(health, start);
  plan[day] = { ...plan[day], [kind]: dishId && findDish(health, dishId) ? dishId : null };
  return { ...health, menus: { ...(health.menus ?? {}), [start]: Object.fromEntries(plan.map((d, i) => [i, d])) } };
}

// Revenir au menu proposé pour cette semaine
export function resetWeek(health, start) {
  const menus = { ...(health.menus ?? {}) };
  delete menus[start];
  return { ...health, menus };
}

export function addDish(health, { name, kind, foods }) {
  const clean = String(name ?? "").trim();
  const ids = new Set(health.foods.map((f) => f.id));
  if (!clean || !MENU_KINDS.includes(kind)) return { health, dish: null };
  const dish = { id: newId(), name: clean, kind, foods: [...new Set((foods ?? []).filter((x) => ids.has(x)))] };
  return { health: { ...health, dishes: [...(health.dishes ?? []), dish] }, dish };
}

// Aliments de la semaine (pour la liste d'épicerie), sans doublon, sans l'eau
export function weekFoods(health, start) {
  const ids = new Set();
  for (const day of weekPlan(health, start)) {
    for (const k of MENU_KINDS) for (const id of findDish(health, day[k])?.foods ?? []) if (id !== "f-eau") ids.add(id);
  }
  return [...ids].map((id) => health.foods.find((f) => f.id === id)).filter(Boolean);
}

// Aliments d'un plat à surveiller : « à éviter » ou qui te font réagir (statut)
export function dishWarnings(health, dish) {
  return (dish?.foods ?? []).map((id) => health.foods.find((f) => f.id === id))
    .filter((f) => f && (f.status === "react" || (f.level === "avoid" && f.status !== "ok")));
}

// Validation (dans normalizeHealth)
export function normalizeMenus(raw, foodIds) {
  const dishes = (Array.isArray(raw?.dishes) ? raw.dishes : [])
    .filter((d) => d && String(d.name ?? "").trim() && MENU_KINDS.includes(d.kind))
    .map((d) => ({ id: String(d.id || newId()), name: String(d.name).trim(), kind: d.kind, foods: (Array.isArray(d.foods) ? d.foods : []).filter((x) => foodIds.has(x)) }));
  const dishIds = new Set([...byId.keys(), ...dishes.map((d) => d.id)]);
  const menus = {};
  for (const [start, week] of Object.entries(raw?.menus && typeof raw.menus === "object" ? raw.menus : {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !week || typeof week !== "object") continue;
    menus[start] = {};
    for (let i = 0; i < 7; i++) {
      const day = week[i] ?? {};
      menus[start][i] = Object.fromEntries(MENU_KINDS.map((k) => [k, dishIds.has(day[k]) ? day[k] : day[k] === null ? null : defaultDay(i)[k]]));
    }
  }
  return { menus, dishes };
}
