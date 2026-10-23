// Français — langue de référence. Toute clé absente d'une autre langue
// s'affiche en français. Les accolades {nom} sont remplacées par des valeurs ;
// { one, other } donne les formes du singulier et du pluriel.

export default {
  // Navigation
  "nav.prev": "Précédent",
  "nav.next": "Suivant",
  "nav.today": "Aujourd'hui",
  "nav.views": "Choix de la vue",
  "nav.add": "Ajouter un élément",
  "nav.habits": "Mes habitudes",
  "nav.settings": "Paramètres",
  "nav.calendar": "Calendrier",
  "nav.modules": "Modules",

  "view.day": "Jour",
  "view.week": "Semaine",
  "view.month": "Mois",
  "view.year": "Année",

  // Modules
  "module.rdv": "Rendez-vous",
  "module.habitude": "Habitude",
  "module.commission": "Commission",
  "module.evenement": "Événement spécial",
  "module.voyage": "Voyage",
  "module.journal": "Journal",

  // Comptes
  "count.items": { one: "{count} élément", other: "{count} éléments" },
  "count.done": { one: "{count} fait", other: "{count} faits" },
  "count.days": { one: "{count} jour", other: "{count} jours" },
  "count.weeks": { one: "{count} semaine", other: "{count} semaines" },

  // Vue jour
  "day.empty": "Rien de prévu. Profite de la journée 🌿",
  "day.add": "Ajouter quelque chose",
  "day.progress": { one: "{done} sur {total} fait", other: "{done} sur {total} faits" },
  "day.allDone": "{total} sur {total} — tout est fait, bravo ✨",

  // États
  "state.done": "Fait ✓",
  "state.cancelled": "Annulé",
  "state.skipped": "Sauté",
  "state.optional": "Facultatif",

  // Formulaire
  "form.newTitle": "Nouvel élément",
  "form.editTitle": "Modifier",
  "form.title": "Titre",
  "form.titlePlaceholder": "ex. Méditation, épicerie, dentiste…",
  "form.module": "Module",
  "form.repeat": "Répétition",
  "form.repeatHint": "La répétition commence à la date choisie ci-dessous.",
  "form.date": "Date",
  "form.time": "Heure",
  "form.place": "Lieu",
  "form.optional": "(facultatif)",
  "form.placePlaceholder": "ex. IGA Laval",
  "form.usePosition": "Utiliser ma position",
  "form.locating": "Recherche…",
  "form.removePosition": "Retirer",
  "form.notes": "Notes",
  "form.cancel": "Annuler",
  "form.save": "Enregistrer",
  "form.saveError": "Impossible d'enregistrer pour l'instant.",

  "repeat.none": "Une seule fois",
  "repeat.daily": "Tous les jours",
  "repeat.weekly": "Certains jours",
  "repeat.flexible": "X fois par semaine",
  "repeat.timesPerWeek": "Combien de fois par semaine ?",

  "rule.daily": "Tous les jours",
  "rule.flexible": { one: "{count} fois par semaine", other: "{count} fois par semaine" },

  "errors.title": "Donne un petit titre à cet élément.",
  "errors.date": "Choisis une date.",
  "errors.coords": "Coordonnées incomplètes.",
  "errors.days": "Choisis au moins un jour.",

  // Détails
  "detail.markDone": "✅ Marquer comme fait",
  "detail.markUndone": "Marquer comme non fait",
  "detail.edit": "Modifier",
  "detail.cancel": "Annuler l'élément",
  "detail.restore": "Rétablir",
  "detail.delete": "Supprimer",
  "detail.close": "Fermer",
  "detail.positionSaved": "Position enregistrée",
  "detail.viewMap": "Voir sur la carte",
  "detail.syncedWith": "Synchronisé avec {provider}",
  "detail.streak": "{streak} de suite",
  "detail.thisWeek": "Cette semaine : {done} sur {target}",
  "detail.skip": "Sauter ce jour",
  "detail.unskip": "Ne plus sauter ce jour",
  "detail.editHabit": "Modifier l'habitude",
  "detail.seeStats": "Voir mes statistiques",
  "detail.stopHabit": "Arrêter l'habitude",
  "detail.deleteHabit": "Supprimer l'habitude",

  "confirm.delete": "Supprimer cet élément pour de bon ?",
  "confirm.deleteHabit": "Supprimer cette habitude et tout son historique ?",
  "confirm.stopHabit": "Arrêter cette habitude à partir de ce jour ? Son historique est conservé.",
  "confirm.import": "Remplacer toutes tes données par celles de ce fichier ?",

  // Messages éphémères
  "toast.cheers": ["Bravo 🌱", "Bien joué ✨", "Un pas de plus 💪", "Super, c'est fait 🌿", "Fier de toi 🙌"],
  "toast.streak": { one: "🌱 {count} jour de suite, bravo !", other: "🌱 {count} jours de suite, bravo !" },
  "toast.weekGoal": "🎯 Objectif de la semaine atteint, bravo !",
  "toast.skipped": "Jour sauté. Prendre soin de soi, ça compte aussi 🌿",
  "toast.stopped": "Habitude arrêtée. Son historique est conservé.",
  "toast.cancelled": "Élément annulé. Pas de souci 🌿",
  "toast.deleted": "Élément supprimé",
  "toast.error": "Oups, quelque chose n'a pas fonctionné.",
  "toast.noPosition": "Position introuvable. Tu peux simplement écrire le lieu.",
  "toast.proximityPaused": "Je n'arrive pas à connaître ta position. Les rappels de proximité sont en pause.",
  "toast.settingFailed": "Oups, le réglage n'a pas pu être enregistré.",
  "toast.imported": { one: "{count} élément importé ✨", other: "{count} éléments importés ✨" },
  "toast.importFailed": "Ce fichier ne semble pas être une copie LifeCal.",
  "toast.migrated": { one: "Ton élément du prototype a été récupéré 🌿", other: "Tes {count} éléments du prototype ont été récupérés 🌿" },
  "toast.noStorage": "Attention : tes données ne seront pas conservées dans ce mode de navigation.",
  "boot.failed": "LifeCal n'a pas pu démarrer. Recharge la page ; tes données sont en sécurité.",

  // Coups de pouce
  "nudge.travel": "{title}, c'est {when}. Envie de commencer à préparer tranquillement ?",
  "nudge.travelAction": "Voir le voyage",
  "nudge.event": "{title} arrive {when}. Un petit mot ou un cadeau à prévoir ?",
  "nudge.eventAction": "Voir",
  "nudge.missedHabit": {
    one: "Hier, {names} n'a pas eu lieu, et c'est correct. Chaque jour est une nouvelle chance 🌿",
    other: "Hier, {names} n'ont pas eu lieu, et c'est correct. Chaque jour est une nouvelle chance 🌿",
  },
  "nudge.weekReview": "La semaine dernière : {done} sur {target} pour {title}. Chaque pas compte 🌱",
  "nudge.nearby": "Tu passes près de {place}. Voici ta liste : {list}.",
  "nudge.dismiss": "Masquer pour aujourd'hui",

  // Page Mes habitudes
  "habits.title": "Mes habitudes",
  "habits.empty": "Pas encore d'habitude. Une petite routine peut faire une grande différence 🌱",
  "habits.add": "Créer une habitude",
  "habits.current": "Série en cours",
  "habits.best": "Meilleure série",
  "habits.week": "Cette semaine",
  "habits.month": "Ce mois-ci",
  "habits.year": "Cette année",
  "habits.stopped": "Arrêtée",
  "habits.history": "Historique des {count} dernières semaines",
  "habits.cheer.new": "C'est le début. Bravo d'avoir commencé 🌱",
  "habits.cheer.high": "Tu es sur une belle lancée ✨",
  "habits.cheer.mid": "Tu avances, un jour à la fois 🌿",
  "habits.cheer.low": "Chaque petit pas compte. Tu peux reprendre aujourd'hui 🌱",

  "grid.done": "Fait",
  "grid.missed": "Pas fait",
  "grid.skipped": "Sauté",
  "grid.off": "Pas prévu",
  "grid.today": "Aujourd'hui",
  "grid.future": "À venir",

  // Paramètres
  "settings.title": "Paramètres",
  "settings.language": "Langue",
  "settings.proximity": "Rappels de proximité",
  "settings.beta": "bêta",
  "settings.proximityHint": "Quand tu passes près d'un lieu enregistré pour une commission, LifeCal te montre ta liste. Fonctionne pendant que l'application est ouverte.",
  "settings.proximityToggle": "Activer les rappels de proximité",
  "settings.noGeolocation": "La géolocalisation n'est pas disponible sur cet appareil.",
  "settings.calendars": "Calendriers externes",
  "settings.soon": "bientôt",
  "settings.data": "Mes données",
  "settings.dataHint": {
    one: "{count} élément, enregistré {where}. Pense à faire une copie de temps en temps.",
    other: "{count} éléments, enregistrés {where}. Pense à faire une copie de temps en temps.",
  },
  "settings.export": "Exporter une copie",
  "settings.import": "Importer une copie",
  "storage.browser": "dans ce navigateur",
  "storage.memory": "temporairement (stockage du navigateur indisponible)",

  "provider.google": "Google Agenda",
  "provider.outlook": "Outlook",
  "provider.yahoo": "Yahoo Agenda",

  // Accueil
  "welcome.title": "Bienvenue dans LifeCal",
  "welcome.chooseLanguage": "Ta vie, un jour à la fois. Choisis ta langue :",
  "welcome.later": "Tu pourras la changer à tout moment dans les Paramètres.",
  "welcome.start": "Commencer",
};
