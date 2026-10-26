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

### Sans Internet

Le service worker (`sw.js`) garde une copie de l'application : après une première visite, LifeCal s'ouvre et fonctionne sans connexion. Avec Internet, il charge toujours la dernière version, donc les mises à jour arrivent toutes seules. Les données, elles, ne passent jamais par le service worker : elles restent dans le stockage du navigateur.

Au démarrage, l'app demande aussi au navigateur de protéger ses données contre l'effacement automatique (`navigator.storage.persist`). Le dimanche, si la dernière copie exportée date de plus d'un mois, un rappel doux propose d'en faire une.

## Tests

```bash
npm test             # node --test (Node 18+)
```

Ils couvrent les dates, le dépôt de données, la migration du prototype, les habitudes (répétition, séries, bilans), les déclencheurs, la synchronisation et la complétude des 7 langues.

## Ce qui fonctionne

- Vues Jour, **Semaine** (par défaut), Mois et Année. Les boutons flèches en haut, un glissement du doigt vers la gauche ou la droite sur le calendrier, ou les flèches du clavier font avancer ou reculer d'un jour, d'une semaine, d'un mois ou d'une année selon la vue ; « Aujourd'hui » y revient.
- Un toucher sur l'en-tête d'un jour ouvre la vue Jour. Le bouton « retour » du navigateur ramène à la vue précédente.
- Un toucher sur un élément ouvre ses détails. On peut alors le marquer comme fait, le modifier, l'annuler (il reste visible, barré) ou le supprimer.
- Le bouton « + » ajoute un élément. Le lieu est facultatif et le bouton « Utiliser ma position » enregistre les coordonnées.
- Vue Mois : une pastille de couleur par élément. Vue Année : le nombre d'éléments et d'éléments faits pour chaque mois.
- Petits coups de pouce (déclencheurs) :
  - un voyage dans 3 semaines ou moins propose de commencer à préparer ;
  - à 3 jours du départ, si la valise n'est pas prête, un rappel doux avec le pourcentage déjà prêt ;
  - une fête, un anniversaire ou un événement : un rappel 2 semaines avant (idée cadeau), 2 jours avant, puis le jour même ;
  - une habitude manquée la veille donne lieu à un encouragement ;
  - les rappels de proximité (bêta, à activer dans ⚙︎ Réglages) : « tu passes près de l'IGA, voici ta liste ».
- **Habitudes** : répétition « tous les jours », « certains jours » ou « X fois par semaine ».
  - Chaque jour, on coche l'habitude, ou on saute le jour (un jour sauté ne casse pas la série).
  - Page 🌱 **Mes habitudes** : série en cours, meilleure série, bilans de la semaine, du mois et de l'année, grille des 12 dernières semaines et un mot d'encouragement.
  - Une habitude arrêtée garde tout son historique.
- **Listes à cocher** pour les commissions (« Ma liste ») et les voyages (« À emporter ») :
  - Page 🛒 **Mes commissions**, en trois onglets :
    - **Liste d'épicerie** : chaque produit est placé dans l'épicerie où il est le moins cher (prix au kg, au litre ou à l'unité), avec l'économie par rapport à l'épicerie suivante et le détail de la comparaison. On coche au magasin. « Imprimer ou PDF » donne une liste avec des cases à cocher. La liste d'épicerie apparaît aussi dans le calendrier (commission « Liste d'épicerie », pour aujourd'hui) : on peut y cocher, retirer ou ajouter des articles, et les deux restent identiques ; « Liste terminée » retire les articles pris.
    - **Carnet de prix** : on note un prix (« 4,99 $ pour 1 lb », « 3,49 $ pour 450 g »), en rabais jusqu'au mercredi de la circulaire ou en prix régulier. La recherche montre où un produit est le moins cher (« steak haché » trouve aussi « bœuf haché »). Les rabais terminés ne comptent plus.
    - **Mes épiceries** (dans le carnet) : Maxi, Super C, IGA, Metro, Mayrand, 5 Saveurs, Aubut, Bourassa et Walmart, à cocher, avec un lien vers leur circulaire.
    - **Liste personnalisée** : 317 articles courants en 15 catégories (fruits, légumes, fines herbes et épices, produits laitiers et œufs, viandes et volailles, poissons et fruits de mer, boulangerie, garde-manger, pâtisserie, condiments et sauces, surgelés, collations, boissons, hygiène et soins, entretien ménager), dans les 7 langues, triés par ordre alphabétique de la langue. Chaque catégorie s'ouvre ou se ferme avec sa flèche (état retenu sur l'appareil), avec « Tout ouvrir » et « Tout fermer », et une recherche (« persil »). Cocher un article l'ajoute à la liste d'épicerie, le décocher l'en retire. On peut ajouter ses propres articles dans chaque catégorie.
  - On tape les articles dans le formulaire, un par ligne, ou on les ajoute un à un dans la fiche de l'élément.
  - On les coche au magasin. Un compteur s'affiche dans le calendrier (☑ 2/5).
  - Le rappel de proximité montre les articles qui restent à acheter.
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
  - Ambiances générées dans le navigateur : pluie, océan, forêt. Elles sont calculées d'avance puis jouées par un lecteur audio ordinaire, que la voix de l'iPad ne peut pas couper pour de bon.
  - Humeur avant et après, séries, minutes totales ; chaque séance s'inscrit dans le calendrier et peut cocher l'habitude du jour.
  - **Barre d'avancement glissante** : on recule ou on avance dans une séance avec le doigt.
  - Une séance compte comme **terminée au complet** si elle est allée jusqu'au bout et qu'au moins 80 % de sa durée a vraiment été écoutée. Les séances partielles comptent dans le temps de méditation, pas dans la progression du parcours.
  - **Mes statistiques** (📊) : temps de méditation par semaine, mois et année (graphiques en barres avec les chiffres, périodes précédentes, détail d'une barre au toucher), temps par type de pratique, progression de chaque parcours.
- **Voyages** :
  - Page ✈️ **Mes voyages** : les voyages à venir (compte à rebours, valise, lieux visités) et les souvenirs de voyage. Le bouton + y crée directement un voyage.
  - Une **date de retour** (facultative) : le voyage s'étend sur chaque jour du séjour dans le calendrier (« 2/5 »).
  - Page du voyage (« 🗺️ Ouvrir le voyage ») : dates, compte à rebours (« Départ dans 9 jours »), puis « Jour 2 sur 5 » pendant le séjour.
  - Préparation : la liste « À emporter », avec 90 idées d'articles courants par catégorie (documents, vêtements, toilette, santé, électronique, pratique, plage) à cocher, dans les 7 langues ; « Imprimer ou PDF » n'imprime que cette liste, « Partager » l'envoie dans Notes, Messages ou un courriel.
  - Chaque section de la page (carte, lieux, lieux célèbres, hôtels, préparation, catégories d'idées) s'ouvre ou se ferme avec sa flèche ; l'état est retenu sur l'appareil.
  - **Lieux à visiter** : on les ajoute, on les coche une fois visités, 📍 les place sur la carte (recherche par nom avec OpenStreetMap), ↗ les ouvre dans une carte.
  - **Carte** centrée sur la destination (le lieu du voyage, sinon son titre : « Milan », « Calgary »), avec les lieux et les hôtels (Leaflet et OpenStreetMap, chargés seulement à l'ouverture). Sans Internet, un petit message et « Réessayer » ; les lieux restent enregistrés.
  - **Lieux célèbres à proximité** : suggérés automatiquement d'après Wikipédia (les articles géolocalisés les plus lus des 30 derniers jours, sans gares, rues ni la ville elle-même) ; « Ajouter » les met dans les lieux, déjà placés sur la carte.
  - **Hôtels** : une ou deux grandes chaînes au choix (Marriott, Hilton, IHG, Hyatt, Accor, Best Western, Radisson, Wyndham, Choice) ; leurs hôtels à moins de 25 km (OpenStreetMap : tous les hôtels autour, reconnus par marque ou nom ; un 2e serveur prend le relais si le 1er est saturé) s'affichent sur la carte et en liste, avec la distance et le lien vers le site web.
  - La destination, les suggestions et les hôtels trouvés sont gardés dans le voyage : pas de nouvelle recherche en revenant.
- **Événements et anniversaires** (bouton 🎂) :
  - Trois types : 🎂 Fête, 💍 Anniversaire (mariage, rencontre…) et 🎉 Événement.
  - Une fête ou un anniversaire revient chaque année. Le formulaire demande la « Date de la fête » (jour et mois) et, à part, l'« Année de naissance » (ou du mariage), facultative : avec elle, l'âge s'affiche (« 62 ans »). Le 29 février tombe le 28 les autres années.
  - Dans la fiche : 🎁 idées cadeaux (cochées une fois achetées), budget cadeau, 👥 invités (cochés quand ils confirment) et ✅ à préparer.
  - Page « À venir » : les 12 prochains mois, mois par mois, avec le compte à rebours.
- **Mes heures** (bouton ⏱️) : feuille de temps pour facturer.
  - **Clients** (nom, contact, courriel, adresse ; TPS 5 % et TVQ 9,975 % à facturer ou non) et **projets** (numéro, nom, client, taux horaire).
  - **Ma journée** : choisir le projet, écrire les heures (« 2,5 », « 2:30 », « 2h30 ») ou toucher +¼, +½, +1, ajouter une note. Total du jour en grand, total de la semaine à côté. Les heures se corrigent directement dans la liste. Un jour vide propose de reprendre la dernière journée travaillée.
  - Rappel doux en semaine à partir de 16 h si rien n'est noté.
  - **Exporter en Excel** : cette semaine, la semaine dernière, ce mois-ci, le mois dernier ou d'autres dates, pour tous les clients ou un seul. Le fichier `.xlsx` contient l'onglet « Heures » (jour par jour, total de chaque jour) et « Par projet » (heures × taux = montant), avec de vraies formules Excel. Sur iPhone et iPad, il s'ouvre dans la feuille de partage (Fichiers, Mail…).
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
js/data/checklist.js       Listes à cocher (commissions, voyages)
js/data/recurrence.js      Règles de répétition et occurrences calculées
js/data/habit-stats.js     Séries, bilans par période, grille d'historique
js/data/repository.js      Dépôt : seule porte d'entrée vers les données
js/data/migrations.js      Versions du schéma et migrations
js/data/storage/           Adaptateurs de stockage (localStorage, mémoire)
js/triggers/               Moteur de déclencheurs + déclencheurs calendrier et proximité
js/geo/geo.js              Position, distances, lien vers la carte
js/sync/                   Fournisseurs externes (Google, Outlook, Yahoo) + fusion
js/grocery/                Épicerie : épiceries suivies, catalogue d'articles (7 langues), prix unitaires, comparaison, liste par épicerie
js/timesheet/              Mes heures : clients, projets, heures, totaux, contenu du classeur Excel
js/export/xlsx.js          Création d'un fichier Excel (.xlsx) sans bibliothèque externe
js/events/                 Événements : types, âge, prochains événements, moments de rappel
js/travel/                 Voyages : dates, lieux à visiter, recherche d'un lieu, carte
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

Les données sont stockées dans un document versionné, `{ schemaVersion, items, settings, grocery }` (version 3 : `grocery` contient les épiceries choisies, le carnet de prix et la liste d'épicerie), sous la clé `lifecal:data`.

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
| Élément sur plusieurs jours | `data.endDate` (voir `spanEnd` dans `js/data/recurrence.js`) et la fonction `range` du module |

## Prochaines étapes (après le pilote)

Sauvegarde automatique et rappels (notifications), suite des parcours de méditation, synchronisation avec Google, Outlook et Yahoo.
