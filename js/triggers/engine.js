// Moteur de déclencheurs.
//
// Un déclencheur est un objet { id, kind, evaluate(context) } où evaluate
// retourne une liste de « petits coups de pouce » (nudges) :
//   { id, triggerId, tone, icon, messageKey, params, itemIds, actionKey?, actionItemId? }
// messageKey et actionKey sont des clés de traduction (voir js/i18n).
//
// kind = "calendar"  : se base sur les dates (voyage dans 3 semaines…)
// kind = "proximity" : se base sur la position actuelle (près de l'épicerie…)
//
// Le contexte contient : { items, today, position, settings }.
// Ajouter un déclencheur = écrire un objet et l'enregistrer avec register().

export class TriggerEngine {
  #triggers = [];

  register(...triggers) {
    this.#triggers.push(...triggers);
    return this;
  }

  evaluate(context) {
    const dismissed = context.settings?.dismissedNudges ?? {};
    return this.#triggers
      .filter((t) => t.kind !== "proximity" || context.position)
      .flatMap((t) => {
        try {
          return t.evaluate(context).map((n) => ({ triggerId: t.id, ...n }));
        } catch (err) {
          console.warn(`Déclencheur ${t.id} en erreur`, err);
          return [];
        }
      })
      // Un coup de pouce écarté ne revient pas de la journée.
      .filter((n) => dismissed[n.id] !== context.today);
  }
}
