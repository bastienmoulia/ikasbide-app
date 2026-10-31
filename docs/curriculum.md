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
JSON de `chapters/` doivent tous être référencés par le livre. Les identifiants de
chapitres restent globaux et uniques, car les tentatives les référencent seuls.

La version 1 monolithique est refusée : les deux types de fichiers exigent
`schemaVersion: 2`. Chaque fichier peut référencer son schéma avec `$schema` :

```json
// book.json
{
  "$schema": "../ikasbide-app/tools/curriculum/book.schema.json",
  "schemaVersion": 2,
  "id": "a1",
  "title": { "eu": "Liburua" },
  "chapters": ["chapter-1"]
}
```

Pour `chapters/<chapterId>.json`, la référence est
`../../ikasbide-app/tools/curriculum/chapter.schema.json`.

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

## Règles de validation

L’import refuse le livre entier s’il contient une incohérence et liste toutes les erreurs
avec leur chemin source. Aucune écriture n’a lieu si le livre ou un chapitre est invalide.

- Clés inconnues interdites ; les textes bilingues doivent être complets.
- Identifiants en kebab-case, uniques dans leur portée (chapitres, objectifs, séquences,
  contenus, items, choix d’un item).
- Les numéros de chapitre sont déduits de la position dans `book.json`.
- Lettres de séquences : une majuscule, en ordre alphabétique.
- QCM : au moins deux choix, réponses correctes existantes.
- Remise en ordre : au moins deux mots ; chaque réponse acceptée utilise exactement ces
  mots (casse et ponctuation finale ignorées).
- Chaque objectif est évalué par au moins trois items corrigés, sans quoi il ne pourrait
  jamais être acquis.
- Au plus 400 documents de livre et de chapitre publiés. Le nombre de suppressions
  nécessaires est aussi vérifié avant de créer le lot atomique.

## Schémas JSON

[`tools/curriculum/book.schema.json`](../tools/curriculum/book.schema.json) décrit le
manifest `book.json` ; [`tools/curriculum/chapter.schema.json`](../tools/curriculum/chapter.schema.json)
décrit un chapitre. Les deux utilisent JSON Schema 2020-12. Ils vérifient la structure ;
la validation TypeScript reste la référence pour les fichiers manquants ou non référencés,
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
`warningAnswers` : aucun changement implicite de leur équivalence.

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

| Document         | Contenu                                                                         |
| ---------------- | ------------------------------------------------------------------------------- |
| `books/{bookId}` | titre (`eu`, `fr` facultatif), sommaire ordonné (`id`, `number`, `title`)       |
| `chapters/{id}`  | `bookId`, `number`, `title`, `objectives`, `sequences` avec tous leurs contenus |

Chaque import publie le livre et tous ses chapitres dans un seul lot atomique. Les chapitres
du livre absents de sa source sont supprimés dans le même lot ; les documents de l’ancienne
collection `units` sont supprimés lors de la transition vers v2. Les documents d’autres
livres restent inchangés. Les réponses acceptées sont publiées pour la correction côté client
(ticket #4) mais ne sont jamais affichées pendant la navigation.

Les [règles Firestore](../firestore.rules) autorisent la lecture de `books` et `chapters`
aux seuls comptes connectés avec Google et interdisent toute écriture depuis l’application.
Seul l’import, avec des identifiants d’administration, peut publier.

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

La commande refuse un projet `demo-…` sans émulateur, et un vrai projet si
`FIRESTORE_EMULATOR_HOST` est défini. Pour essayer l’import en local :

```bash
npm run emulators
# dans un autre terminal
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  npm run curriculum:import -- tests/fixtures/curriculum.sample --project demo-ikasbide
```
