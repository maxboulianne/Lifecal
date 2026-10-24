# LifeCal

Application de vie centrée sur le calendrier. Elle aide à structurer ses journées avec douceur : chaque élément appartient à un module (code couleur), et des déclencheurs donnent de petits coups de pouce, jamais culpabilisants.

Version web : elle fonctionne dans le navigateur d'un téléphone ou d'un iPad. L'interface est disponible en français, anglais, espagnol, portugais, allemand, vietnamien et coréen.

## Lancer l'application

L'application utilise des modules JavaScript. Elle doit donc être servie par un petit serveur web : l'ouvrir directement en `file://` ne fonctionne pas.

```bash
npm start            # = python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

- **Sur iPad avec Koder** : ouvrir le dossier du projet et utiliser l'aperçu avec serveur local de Koder sur `index.html`.
- **En ligne** : n'importe quel hébergement statique convient, par exemple GitHub Pages (Settings → Pages → branche du projet, dossier racine).
- Sur iPhone ou iPad, Safari → Partager → « Sur l'écran d'accueil » installe LifeCal comme une app.

Aucune dépendance et aucune étape de compilation.

## Tests

```bash
npm test             # node --test (Node 18+)
```

Ils couvrent les dates, le dépôt de données, la migration du prototype, les habitudes (répétition, séries, bilans), les déclencheurs, la synchronisation et la complétude des 7 langues.

## Ce qui fonctionne

- Vues Jour, **Semaine** (par défaut), Mois et Année, avec les flèches ‹ › et le bouton « Aujourd'hui ».
- Un toucher sur l'en-tête d'un jour ouvre la vue Jour. Le bouton « retour » du navigateur ramène à la vue précédente.
- Un toucher sur un élément ouvre ses détails. On peut alors le marquer comme fait, le modifier, l'annuler (il reste visible, barré) ou le supprimer.
- Le bouton « + » ajoute un élément. Le lieu est facultatif et le bouton « Utiliser ma position » enregistre les coordonnées.
- Vue Mois : une pastille de couleur par élément. Vue Année : le nombre d'éléments et d'éléments faits pour chaque mois.
- Petits coups de pouce (déclencheurs) :
  - un voyage dans 3 semaines ou moins propose de commencer à préparer ;
  - un événement spécial dans la semaine fait penser à un mot ou à un cadeau ;
  - une habitude manquée la veille donne lieu à un encouragement ;
  - les rappels de proximité (bêta, à activer dans ⚙︎ Réglages) : « tu passes près de l'IGA, voici ta liste ».
- **Habitudes** : répétition « tous les jours », « certains jours » ou « X fois par semaine ».
  - Chaque jour, on coche l'habitude, ou on saute le jour (un jour sauté ne casse pas la série).
  - Page 🌱 **Mes habitudes** : série en cours, meilleure série, bilans de la semaine, du mois et de l'année, grille des 12 dernières semaines et un mot d'encouragement.
  - Une habitude arrêtée garde tout son historique.
- **Journal** (bouton 📓) :
  - Une page d'écriture par jour, enregistrée automatiquement, qui apparaît dans le calendrier.
  - L'humeur du jour (5 visages), une question pour s'inspirer (12 questions, une différente chaque jour) et « trois petites choses qui ont fait du bien ».
  - **Mon humeur** : courbe des 30 derniers jours, qui réunit le journal et les méditations, et un mot doux sur la tendance de la semaine. Si la semaine semble plus difficile, l'app propose une séance « Moments difficiles ».
  - Le soir, s'il n'y a encore rien d'écrit, une petite invitation à écrire.
  - Le journal reste sur l'appareil.
- **Méditation** (bouton 🧘) :
  - Parcours **Premiers pas** (7 séances : arriver, le souffle, l'esprit qui vagabonde, les sons, le corps, les émotions, la bienveillance) et **Moments difficiles** (ancrage 5-4-3-2-1, respiration apaisante, accueillir une émotion forte).
  - Durée au choix : la séance s'adapte, les silences s'allongent ou raccourcissent.
  - Voix guidée féminine (voix de synthèse de l'appareil), texte affiché à l'écran, cercle de respiration animé.
  - Exercices de respiration : cohérence cardiaque, respiration carrée, 4-7-8.
  - Minuteur silencieux avec bol tibétain (début, fin, intervalles).
  - Ambiances générées dans le navigateur : pluie, océan, forêt.
  - Humeur avant et après, séries, minutes totales ; chaque séance s'inscrit dans le calendrier et peut cocher l'habitude du jour.
- **Langues** : choix à l'accueil au premier lancement, puis dans ⚙︎ **Paramètres**. Les dates et les heures suivent la langue choisie.
- Paramètres : langue, rappels de proximité, calendriers externes, exporter et importer une copie des données (JSON).
- **Les données du prototype `calendrier.html` sont récupérées automatiquement** à la première ouverture, si l'application est servie depuis la même adresse. La copie d'origine sous la clé `items` est conservée.

## Architecture

```
index.html                 Coquille de la page
css/app.css                Styles (téléphone d'abord, mode sombre)
js/main.js                 Assemblage : stockage → dépôt → déclencheurs → interface
js/config/modules.js       Registre des modules (couleur, icône, fonctions futures)
js/core/                   Dates (heure locale), DOM, bus d'événements
js/data/item.js            Modèle d'un élément, normalisation, validation
js/data/recurrence.js      Règles de répétition et occurrences calculées
js/data/habit-stats.js     Séries, bilans par période, grille d'historique
js/data/repository.js      Dépôt : seule porte d'entrée vers les données
js/data/migrations.js      Versions du schéma et migrations
js/data/storage/           Adaptateurs de stockage (localStorage, mémoire)
js/triggers/               Moteur de déclencheurs + déclencheurs calendrier et proximité
js/geo/geo.js              Position, distances, lien vers la carte
js/sync/                   Fournisseurs externes (Google, Outlook, Yahoo) + fusion
js/journal/                Journal : entrée du jour, question du jour, humeur et tendance
js/meditation/             Catalogue, scripts des séances (7 langues), lecteur, voix, sons, progrès
js/i18n/                   Traductions (7 langues) et formatage des dates via Intl
js/ui/                     Contrôleur, vues (jour/semaine/mois/année), pages (habitudes, paramètres), composants
prototype/calendrier.html  Prototype d'origine, gardé pour référence
tests/                     Tests node:test
```

### Modèle d'un élément

```js
{
  id, title, module, date: "AAAA-MM-JJ", time: "HH:MM" | "",
  place, lat, lng, done,             // champs du cahier des charges
  status: "active" | "cancelled",    // annulé ≠ supprimé
  notes,
  recurrence: null | { freq: "daily" | "weekly" | "flexible", days, timesPerWeek, until },
  data: {},                          // contenu propre au module ; pour une habitude :
                                     //   completions { "AAAA-MM-JJ": true }, skipped { … }
  source: { provider: "local" | "google" | "outlook" | "yahoo", externalId, etag },
  createdAt, updatedAt
}
```

Les données sont stockées dans un document versionné, `{ schemaVersion, items, settings }`, sous la clé `lifecal:data`.

### Points d'extension

| Besoin futur | Où intervenir |
|---|---|
| Nouveau module | Ajouter une entrée dans `js/config/modules.js` et son nom `module.xxx` dans chaque langue |
| Nouveau texte à l'écran | Une clé dans `js/i18n/locales/fr.js` puis dans les 6 autres langues (`npm test` signale les oublis) |
| Nouvelle langue | Copier `fr.js`, traduire, l'ajouter à `LANGUAGES` dans `js/i18n/index.js` |
| Nouveau paramètre | Une section dans `js/ui/pages/settings.js` et une valeur par défaut dans `DEFAULT_SETTINGS` |
| Contenu propre à un module (liste à cocher, journal…) | Champ `item.data`, et un composant dans `js/ui/components/` activé selon `module.features` |
| Changer le format des données | Incrémenter `SCHEMA_VERSION` et ajouter une migration dans `js/data/migrations.js` |
| IndexedDB, serveur, compte en ligne | Nouvel adaptateur avec `load()`, `save()` et `clear()` dans `js/data/storage/` |
| Nouveau déclencheur | Un objet `{ id, kind, evaluate(ctx) }` enregistré dans `js/main.js` |
| Google Agenda, Outlook, Yahoo | Implémenter `listEvents`, `upsertEvent` et `deleteEvent` dans `js/sync/providers.js`. La fusion (`SyncService.pull`) est déjà prête et testée. La connexion OAuth demandera un petit serveur. |
| Nouvelle séance de méditation | Son script dans `js/meditation/scripts/fr.js` (phrases, pauses, `SILENCE`, `BELL`, `BREATHE`), son id dans `catalog.js`, puis la traduction dans les 6 autres langues (`npm test` vérifie que la structure est identique) |
| Voix plus naturelles | Ajouter une implémentation `RecordedVoice` dans `js/meditation/voice.js` : un fichier audio par phrase, `audio/<langue>/<séance>/<n>.mp3`. Le reste du lecteur ne change pas. |
| Carte des voyages | `js/geo/geo.js` (coordonnées déjà dans le modèle) + une bibliothèque de cartes comme Leaflet |

## Prochaines étapes (après le pilote)

Listes à cocher pour les commissions, préparation des voyages (lieux, carte, choses à emporter), notifications en arrière-plan (cela demandera un service worker ou l'app native).
