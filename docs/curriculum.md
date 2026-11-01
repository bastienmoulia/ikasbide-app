# Contrat et import du curriculum

Le contenu pédagogique n’est pas dans ce dépôt. Les sources JSON sont conservées dans le
dépôt privé [`bastienmoulia/ikasbide-content`](https://github.com/bastienmoulia/ikasbide-content),
validées, puis publiées dans Firestore par la commande d’import. Une fois publié, le
contenu est lisible par **tout compte Google connecté** : le dépôt privé protège les
sources, pas le contenu publié.

Le seul exemple versionné ici est le dossier
[`tests/fixtures/curriculum.sample`](../tests/fixtures/curriculum.sample), un contenu
fictif original utilisé par les tests. Les types TypeScript du contrat sont dans
[`src/app/curriculum/curriculum.model.ts`](../src/app/curriculum/curriculum.model.ts).

## Hiérarchie et source v2

```text
A1/
├─ book.json { $schema?, schemaVersion: 2, id, title, chapters[] }
└─ chapters/
   └─ <chapterId>.json { $schema?, schemaVersion: 2, title, objectives[], sequences[] }
      └─ sequence { id, letter, title, contents[] }
         └─ content : ressource ou activité
            └─ item { id, objectiveIds[], ... }
```

`book.json` porte l’identifiant explicite du livre (`a1`), son titre (`eu` obligatoire,
`fr` facultatif) et la liste ordonnée des identifiants de chapitres. Chaque identifiant
correspond à un fichier `chapters/<chapterId>.json`. Le numéro du chapitre est sa position
dans la liste (à partir de 1) : aucun numéro n’est répété dans les sources. Les fichiers
JSON de `chapters/` doivent tous être référencés par le livre. Un identifiant de chapitre
est unique dans son livre : deux livres différents peuvent réutiliser le même identifiant.

La version 1 monolithique est refusée : les deux types de fichiers exigent
`schemaVersion: 2`. Lorsque les dépôts `ikasbide-content` et `ikasbide-app` sont
frères, le fichier `ikasbide-content/A1/book.json` peut référencer son schéma :

```json
{
  "$schema": "../../ikasbide-app/tools/curriculum/book.schema.json",
  "schemaVersion": 2,
  "id": "a1",
  "title": { "eu": "Liburua" },
  "chapters": ["chapter-1"]
}
```

Pour `chapters/<chapterId>.json`, la référence est
`../../../ikasbide-app/tools/curriculum/chapter.schema.json`.

Chaque texte affiché, sauf le titre éventuellement unilingue du livre, est bilingue :
`{ "eu": "…", "fr": "…" }`, les deux valeurs non vides. Le basque est affiché en premier,
le français en dessous.

## Types de contenus

| `kind`            | Nature   | Champs propres                                                              |
| ----------------- | -------- | --------------------------------------------------------------------------- |
| `note`            | Resource | `title`, `body`                                                             |
| `dialogue`        | Resource | `title`, `lines[] { speaker, text }`                                        |
| `external-link`   | Resource | `title`, `description`, `url` (HTTPS uniquement, aucun fichier hébergé)     |
| `gap-fill`        | Activity | `items[] { prompt, acceptedAnswers[] }`, `prompt.eu` contient un seul `___` |
| `translation`     | Activity | `items[] { direction (`eu-fr`ou`fr-eu`), source, acceptedAnswers[] }`       |
| `multiple-choice` | Activity | `items[] { prompt, choices[] { id, lang, text }, correctChoiceIds[] }`      |
| `word-order`      | Activity | `items[] { prompt, words[], acceptedAnswers[] }`                            |
| `oral-prompt`     | Activity | `instructions` seulement : facultative, non corrigée, sans `items`          |

Les ressources ont `type: "resource"`, `id`, `kind` et `title` ; les activités ont
`type: "activity"`, `id`, `kind`, `title` et `instructions`. Chaque item corrigé a
un `id` et des `objectiveIds` qui référencent des objectifs du même chapitre.

### Aide facultative (`hint`)

Chaque item corrigé (`gap-fill`, `translation`, `multiple-choice`, `word-order`) peut porter
un champ facultatif `hint` : une liste non vide de lignes bilingues courtes, rédigées par
l’auteur, qui apportent du vocabulaire ou une tournure illustrée par un autre exemple.
L’aide ne doit jamais révéler la réponse attendue, le bon choix ou l’ordre des mots.

```json
"hint": [
  { "eu": "Donostia", "fr": "Saint-Sébastien" },
  { "eu": "Baionakoa naiz.", "fr": "Je viens de Bayonne." }
]
```

Sans `hint`, aucun bouton d’aide n’est affiché. Sinon, un bouton « Laguntza / Aide »
ouvre et referme la zone juste avant la saisie ou les choix ; chaque ligne affiche le basque
puis le français en plus petit. L’aide est masquée au départ et à chaque changement de
question, y compris lors de la relecture d’une question déjà répondue. La consulter n’est
pas enregistrée et ne modifie ni la correction ni la progression.

## Règles de validation

L’import refuse le livre entier s’il contient une incohérence et liste toutes les erreurs
avec leur chemin source. Aucune écriture n’a lieu si le livre ou un chapitre est invalide.

- Clés inconnues interdites ; les textes bilingues doivent être complets.
- Identifiants en kebab-case, uniques dans leur portée (chapitres, objectifs, séquences,
  contenus, items, choix d’un item).
- Les numéros de chapitre sont déduits de la position dans `book.json`.
- Lettres de séquences : une majuscule, en ordre alphabétique.
- QCM : au moins deux choix, réponses correctes existantes.
- `hint`, s’il est présent : au moins une ligne, chacune bilingue et complète.
- Remise en ordre : au moins deux mots ; chaque réponse acceptée utilise exactement ces
  mots (casse et ponctuation finale ignorées).
- Chaque objectif est évalué par au moins trois items corrigés, sans quoi il ne pourrait
  jamais être acquis.
- Le livre entier est validé quel que soit le nombre de chapitres. Chaque publication
  est limitée à 400 écritures, suppressions comprises, dans sa transaction atomique.

## Schémas JSON

[`tools/curriculum/book.schema.json`](../tools/curriculum/book.schema.json) décrit le
manifest `book.json` ; [`tools/curriculum/chapter.schema.json`](../tools/curriculum/chapter.schema.json)
décrit un chapitre. Les deux utilisent JSON Schema 2020-12 et doivent rester dans le même
dossier : le schéma de chapitre référence celui du livre. Ils vérifient la structure ; la
validation TypeScript reste la référence pour les fichiers manquants ou non référencés,
l’unicité des identifiants, les références aux objectifs et aux choix, les mots des remises
en ordre et les trois items par objectif.

## Correction des réponses

Une réponse libre est correcte si elle correspond à l'une des réponses acceptées après
normalisation Unicode NFC, passage en minuscules, réduction des espaces répétés et retrait
de la ponctuation finale. Les accents, les lettres, les suffixes et la ponctuation interne
restent significatifs. Une seule transposition de deux lettres adjacentes, à l'intérieur
d'un mot d'au moins cinq caractères et avant ses deux derniers caractères, peut afficher
« Presque ! » ; elle reste incorrecte et ne fournit aucun indice de maîtrise.

Les items `gap-fill`, `translation` et `word-order` peuvent ajouter un champ facultatif
`warningAnswers`, une liste non vide de variantes acceptées avec avertissement. Par exemple :
`"acceptedAnswers": ["zara"], "warningAnswers": ["zira"]`. Les réponses déjà présentes dans
`acceptedAnswers` restent correctes sans avertissement, même si elles figurent aussi dans
`warningAnswers`.

En basque, `zira` est également reconnu automatiquement avec avertissement lorsque la réponse
attendue contient le mot `zara` (par exemple `Zu ez zira Pantxoa` pour `Zu ez zara Pantxoa`).
La réponse attendue affichée reste `acceptedAnswers[0]`, ce qui recommande la forme standard
`zara` sans rejeter la variante dialectale. Cette règle s'applique à toutes les questions à
réponse libre comparables, même sans champ `warningAnswers`.

Une correspondance exacte avec `warningAnswers`, après la même normalisation, affiche un
avertissement distinct et la réponse attendue (`acceptedAnswers[0]`), en conservant le basque
en premier et le français en dessous pour les libellés. La réponse attendue conserve sa
langue propre. Le résultat `correct-with-warning` compte comme correct pour la maîtrise,
mais la tentative n’est enregistrée et l’item n’est terminé qu’au clic sur « Continuer ».
L’item ne sera pas reposé. Avant ce clic, recharger ou reprendre la série restaure
l’avertissement sans enregistrer la tentative. Les approximations de ces variantes ne sont
pas acceptées : « Presque ! » reste calculé uniquement à partir d’`acceptedAnswers`.
Pour une remise en ordre, les variantes de `warningAnswers` doivent elles aussi utiliser
exactement les mots proposés. Sans ce champ, le comportement existant reste inchangé.

## Données publiées

| Document                                  | Contenu                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `books/{bookId}`                          | titre (`eu`, `fr` facultatif), sommaire ordonné (`id`, `number`, `title`)       |
| `books/{bookId}/chapters/{chapterId}`     | `bookId`, `number`, `title`, `objectives`, `sequences` avec tous leurs contenus |
| `chapters/{chapterId}` (ancienne version) | document historique figé conservant la preuve du livre propriétaire             |

Sans `--chapter`, l’import publie le livre et tous ses chapitres dans une transaction atomique.
Les chapitres du livre absents de sa source et les documents de l’ancienne collection
`units` sont supprimés dans la même transaction. Avec `--chapter`, seul le livre et les
chapitres sélectionnés sont publiés ; aucune suppression n’a lieu. Les documents d’autres
livres restent inchangés.

Le sommaire republié doit rester cohérent avec les chapitres non ciblés : chacun doit déjà
être publié pour ce livre avec le même numéro et le même titre que dans la source. Un chapitre
historique non ciblé reste utilisable s’il appartient à ce livre et correspond au sommaire.
Sinon, l’import partiel est refusé avant toute écriture ; cibler aussi les chapitres
concernés ou publier le livre complet. Ces vérifications et les écritures partagent la
même transaction, y compris en cas de publications simultanées. Chaque transaction comprend
au plus 400 écritures, y compris les suppressions : un grand livre peut donc être validé et
publié par chapitre même si sa publication complète dépasse cette limite.

Les réponses acceptées sont publiées pour la correction côté client (ticket #4) mais ne
sont jamais affichées pendant la navigation. Après le changement de chemin, un chapitre
déjà mis en cache peut nécessiter une nouvelle consultation en ligne avant d’être disponible
hors ligne.

Les [règles Firestore](../firestore.rules) autorisent la lecture des livres et chapitres
aux seuls comptes connectés avec Google et interdisent leur écriture depuis l’application.
Seul l’import, avec des identifiants d’administration, peut publier.

## Navigation et transition multi-livres

Un chapitre utilise l’URL `/{bookId}/{chapterId}` et une séquence l’URL
`/{bookId}/{chapterId}/{sequenceId}`. `/` reste le seul sommaire : le retour depuis un
chapitre, le logo et l’actualisation conservent le livre courant dans cet onglet. Un nouvel
onglet ouvert directement sur `/` utilise le livre configuré par défaut (`a1` dans
`src/app/curriculum/book-context.ts`). Il n’y a pas de sélecteur de livre ni de sommaire
`/{bookId}`. Si le livre par défaut manque alors que d’autres sont publiés, une erreur
est affichée. Les anciennes URL ne sont pas maintenues.

Les nouvelles tentatives portent `bookId` et la progression synchronisée est rangée sous
`learners/{uid}/books/{bookId}/chapters/{chapterId}/sequenceProgress/{sequenceId}`.
Les données synchronisées avant la transition sont automatiquement lues pour leur livre
d’origine lorsque le document historique `chapters/{chapterId}` en prouve la propriété.
Les enregistrements dont l’origine ne peut pas être établie restent stockés séparément,
sans attribution. Ne pas supprimer ni modifier les anciens documents `chapters` et ne pas
utiliser un ancien importeur susceptible de les écraser ou de les supprimer.

Avant le déploiement, reconnecter les anciens clients pour synchroniser leurs écritures
en attente et publier chaque livre avec un import complet utilisant le nouvel importeur.
Un `sync` dont le SHA est déjà enregistré ne republie rien : il ne suffit donc pas à créer
les nouveaux documents sans modification du contenu. Déployer ensuite l’application et ses
règles ensemble, puis actualiser les clients. Il n’y a **aucune période de compatibilité** :
une ancienne application ou des écritures hors ligne encore en attente peuvent être refusées
après le changement de règles. Les anciennes sauvegardes locales ne sont pas reprises.
Voir [ADR 0006](adr/0006-book-scoped-identities.md).

## Valider et importer

Depuis ce dépôt, avec le dépôt de contenu cloné à côté :

```bash
npm run curriculum:validate -- ../ikasbide-content/A1
```

Pour publier en production, utiliser les identifiants par défaut de Google Cloud
(aucune clé de compte de service dans un fichier) :

```bash
gcloud auth application-default login
npm run curriculum:import -- ../ikasbide-content/A1 --project PROJECT_ID
```

Pour ne republier que certains chapitres, après une publication initiale complète :

```bash
npm run curriculum:import -- ../ikasbide-content/A1 --project PROJECT_ID \
  --chapter chapter-1 chapter-2
```

L’option `--chapter` peut aussi être répétée (`--chapter chapter-1 --chapter chapter-2`).
La validation porte toujours sur tous les fichiers du livre, même ceux qui ne sont pas
sélectionnés.

La commande refuse un projet `demo-…` sans émulateur, et un vrai projet si
`FIRESTORE_EMULATOR_HOST` est défini. Pour essayer l’import en local :

```bash
npm run emulators
# dans un autre terminal
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  npm run curriculum:import -- tests/fixtures/curriculum.sample --project demo-ikasbide
```

## Republication automatique depuis Git

```bash
npm run curriculum:sync -- /chemin/ikasbide-content --project PROJECT_ID
```

`sync` exige la racine d’un dépôt Git et une révision HEAD propre. Il découvre tous les
livres versionnés, y compris dans des sous-dossiers, à partir de `book.json` et
`chapters/<id>.json`. Les sources référencées doivent appartenir au commit, pas seulement
exister localement. Il compare HEAD au dernier SHA publié avec succès, conservé dans
`curriculumPublications/ikasbide-content`. Ce document technique n’est pas lisible par
l’application ; il ne contient aucun texte pédagogique.

Un manifeste modifié sélectionne le livre complet ; des chapitres seuls sélectionnent
une publication partielle unique par livre. Tous les livres concernés sont validés en
entier avant la première écriture. Les identifiants des livres et l’unicité des chapitres
dans chaque livre sont également vérifiés dans tous les manifestes versionnés, y compris
ceux des livres non ciblés ; les identifiants de chapitres peuvent être réutilisés d’un
livre à l’autre. Une suppression de chapitre exige un manifeste cohérent. Un livre
supprimé entièrement est refusé lorsque sa suppression est détectée : la suppression
automatique de livres n’est pas prise en charge.

Le SHA de réussite n’avance qu’après toutes les publications. Si un import échoue,
l’exécution suivante reprend le cumul des différences depuis ce SHA ; les imports déjà
réussis peuvent être rejoués. La sélection inclut tous les chemins touchés par les commits
intermédiaires, même si un changement a ensuite été annulé : un livre écrit avant l’échec
doit être réconcilié avec HEAD. L’atomicité reste **par livre**, pas multi-livres. Les échecs
d’import (permissions, collision avec un document existant, limite de transaction, etc.)
restent explicites et peuvent survenir après la publication d’un autre livre valide.

Une révision déjà publiée ou ancêtre du SHA publié ne fait aucune écriture. Sans base
utilisable (premier lancement, commit absent, SHA invalide ou historique divergent), tous
les livres présents sont publiés complètement, avec un message explicite dans les logs.
Sans changement de source, aucun document, même le checkpoint, n’est écrit. Cette
absence de mise à jour du checkpoint n’omet pas les changements suivants.

**Les appels doivent être sérialisés par l’appelant.** Le workflow dans le dépôt privé
utilise un groupe de concurrence sans annulation de l’exécution active et récupère la
dernière source de `main` au démarrage du job, pas le SHA de l’événement ancien.
Ne pas lancer simultanément un import manuel et ce workflow.

Le CLI utilise directement `@google-cloud/firestore` et ses Application Default
Credentials : cette voie accepte les identifiants temporaires WIF de
`google-github-actions/auth`, sans passer par l’authentification Firebase Admin.
L’import manuel et les protections des projets émulateur restent identiques.
Voir [la configuration OIDC et l’activation](curriculum-publication.md).
