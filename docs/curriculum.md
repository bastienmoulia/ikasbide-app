# Contrat et import du curriculum

Le contenu pédagogique n’est pas dans ce dépôt. Les sources JSON sont conservées dans le
dépôt privé [`bastienmoulia/ikasbide-content`](https://github.com/bastienmoulia/ikasbide-content),
validées, puis publiées dans Firestore par la commande d’import. Une fois publié, le
contenu est lisible par **tout compte Google connecté** : le dépôt privé protège les
sources, pas le contenu publié.

Le seul exemple versionné ici est [`tests/fixtures/curriculum.sample.json`](../tests/fixtures/curriculum.sample.json),
un contenu fictif original utilisé par les tests. Il sert de modèle complet du format.
Les types TypeScript du contrat sont dans
[`src/app/curriculum/curriculum.model.ts`](../src/app/curriculum/curriculum.model.ts).

## Hiérarchie

```text
curriculum { $schema?, schemaVersion: 1, units[] }
└─ unit { id, number, title, chapters[] }            nombre de chapitres libre
   └─ chapter { id, number, title, objectives[], sequences[] }
      ├─ objective { id, label }
      └─ sequence { id, letter, title, contents[] }
         └─ content : ressource ou activité
```

Chaque texte affiché est bilingue : `{ "eu": "…", "fr": "…" }`, les deux valeurs non vides.
Le basque est affiché en premier, le français en dessous.

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

L’import refuse tout le fichier s’il contient une incohérence et liste toutes les erreurs
avec leur chemin JSON. Aucune écriture n’a lieu si le fichier est invalide.

- Clés inconnues interdites ; textes bilingues complets.
- Identifiants en kebab-case, uniques dans leur portée (unités, chapitres, objectifs,
  séquences, contenus, items, choix d’un item).
- Numéros d’unités et de chapitres entiers positifs, strictement croissants dans l’ordre
  du livre. L’appartenance d’un chapitre à une unité vient de l’imbrication, pas du numéro.
- Lettres de séquences : une majuscule, en ordre alphabétique.
- QCM : au moins deux choix, réponses correctes existantes.
- Remise en ordre : au moins deux mots ; chaque réponse acceptée utilise exactement ces
  mots (casse et ponctuation finale ignorées).
- Chaque objectif est évalué par au moins trois items corrigés, sans quoi il ne pourrait
  jamais être acquis.
- Au plus 400 documents publiés (limite d’un lot Firestore atomique).

## Schéma JSON

[`tools/curriculum/curriculum.schema.json`](../tools/curriculum/curriculum.schema.json)
décrit la structure ci-dessus (JSON Schema 2020-12) pour la complétion et les erreurs dans
l’éditeur. Le fichier source peut le référencer par une clé racine facultative, ignorée à
la publication :

```json
{ "$schema": "../ikasbide-app/tools/curriculum/curriculum.schema.json", "schemaVersion": 1, … }
```

Le schéma ne vérifie pas les règles croisées (unicité des identifiants, références aux
objectifs et aux choix, ordre du livre, mots des remises en ordre, trois items par
objectif) : `npm run curriculum:validate` reste la référence avant tout import.

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
l’avertissement sans enregistrer la tentative. Les approximations de ces variantes ne
sont pas acceptées : « Presque ! » reste calculé uniquement à partir d’`acceptedAnswers`.
Pour une remise en ordre, les variantes de `warningAnswers` doivent elles aussi utiliser
exactement les mots proposés. Sans ce champ, le comportement existant reste inchangé.

## Données publiées

| Document         | Contenu                                                                         |
| ---------------- | ------------------------------------------------------------------------------- |
| `units/{unitId}` | `number`, `title`, résumé des chapitres (`id`, `number`, `title`)               |
| `chapters/{id}`  | `unitId`, `number`, `title`, `objectives`, `sequences` avec tous leurs contenus |

L’import est un remplacement complet et atomique : les unités et chapitres absents du
fichier sont supprimés dans le même lot. Les réponses acceptées sont publiées pour la
correction côté client (ticket #4) mais ne sont jamais affichées pendant la navigation.

Les [règles Firestore](../firestore.rules) autorisent la lecture de `units` et `chapters`
aux seuls comptes connectés avec Google et interdisent toute écriture depuis
l’application. Seul l’import, avec des identifiants d’administration, peut publier.

## Valider et importer

Depuis ce dépôt, avec le dépôt de contenu cloné à côté :

```bash
npm run curriculum:validate -- ../ikasbide-content/curriculum.json
```

Pour publier en production, utiliser les identifiants par défaut de Google Cloud
(aucune clé de compte de service dans un fichier) :

```bash
gcloud auth application-default login
npm run curriculum:import -- ../ikasbide-content/curriculum.json --project PROJECT_ID
```

La commande refuse un projet `demo-…` sans émulateur, et un vrai projet si
`FIRESTORE_EMULATOR_HOST` est défini. Pour essayer l’import en local :

```bash
npm run emulators
# dans un autre terminal
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  npm run curriculum:import -- tests/fixtures/curriculum.sample.json --project demo-ikasbide
```
