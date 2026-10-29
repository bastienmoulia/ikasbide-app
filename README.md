# Ikasbide App

Projet de compagnon web et mobile pour s'entraîner au basque en suivant la progression d'**Ikasbide metodoa**. La première version vise le chapitre 1 : consulter des ressources bilingues, pratiquer des activités interactives et suivre ses objectifs d'apprentissage.

## État actuel

Le socle du ticket [#2](https://github.com/bastienmoulia/ikasbide-app/issues/2) est livré
et déployé : **Angular PWA, Angular Material, connexion/déconnexion Google via Firebase
Authentication**, responsive et bilingue, avec le basque en premier et la traduction
française en dessous. L’application est disponible sur
[ikasbide-app.web.app](https://ikasbide-app.web.app) et peut être installée depuis le
navigateur.

Le ticket [#3](https://github.com/bastienmoulia/ikasbide-app/issues/3) est livré et déployé avec
l’**import et la navigation du curriculum** : une commande valide les sources JSON du
dépôt privé `bastienmoulia/ikasbide-content` et les publie dans Firestore ; les
apprenants connectés parcourent unités, chapitres colorés, objectifs et séquences.
Aucun contenu du livre n’est embarqué dans ce dépôt ; voir
[docs/curriculum.md](docs/curriculum.md). Les quatre formats autocorrigés et les
consignes orales facultatives sont interactifs ; le suivi de progression reste à
réaliser. Un curriculum fictif de démonstration (**1 unité et 2 chapitres**) est publié
pour essayer la navigation ; il ne constitue pas le contenu du livre.

### Démarrer sans compte Firebase

Avec Node 24.15+ (ou 22.22.3+) :

```bash
npm ci
npx playwright install chromium
npm run build:e2e
npm run emulators
```

Ouvrir `http://127.0.0.1:5100`, cliquer sur la connexion Google, puis créer un compte
**fictif** dans la fenêtre de l’émulateur. Ne pas utiliser d’identifiants réels.

Les émulateurs démarrent sans curriculum. Dans un autre terminal, charger le contenu
du dépôt voisin :

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  npm run curriculum:import -- ../ikasbide-content/curriculum.json --project demo-ikasbide
```

Sans accès au dépôt de contenu, utiliser `tests/fixtures/curriculum.sample.json`
à la place. Cet import reste local et ne modifie pas la production.

Pour vérifier le projet :

```bash
npm run typecheck
npm test
npm run format:check
```

La [procédure Firebase](docs/firebase-setup.md) décrit la connexion à votre projet,
le développement avec `npm start`, le déploiement Hosting et l’installation de la PWA.
Les tests automatisés n’utilisent que les émulateurs et ne déploient jamais en production.

### Gérer et publier le curriculum

Conserver les deux dépôts côte à côte, sans cloner le contenu dans l’application :

```text
bastienmoulia/
├── ikasbide-app/
└── ikasbide-content/
    └── curriculum.json
```

Depuis `ikasbide-app`, valider le fichier avant de le publier :

```bash
npm run curriculum:validate -- ../ikasbide-content/curriculum.json
```

Pour publier dans le projet Firebase de production `ikasbide-app`, installer la
[CLI Google Cloud](https://cloud.google.com/sdk/docs/install), puis autoriser
une fois un compte disposant des droits d’écriture Firestore :

```bash
gcloud auth application-default login
env -u FIRESTORE_EMULATOR_HOST npm run curriculum:import -- \
  ../ikasbide-content/curriculum.json --project ikasbide-app
```

Les identifiants restent sur la machine, jamais dans les dépôts. **L’import remplace
tout le curriculum publié** : les unités et chapitres absents du fichier sont
supprimés. Une modification du contenu ne nécessite pas de redéployer l’application ;
rafraîchir la page après l’import. Un commit ou un push du dépôt de contenu ne
déclenche pas cet import automatiquement.

Le format JSON et ses contraintes sont décrits dans
[docs/curriculum.md](docs/curriculum.md).

## Première version prévue

L'application suivra l'organisation du livre : **Unité → Chapitre → Séquence**, avec des ressources pédagogiques et des activités composées d'items. Le glossaire définit ces termes et fait référence pour le projet.

- Interface et contenu bilingues : basque en premier, traduction française dessous en plus petit.
- Chapitre 1 disponible en premier, puis ajout des chapitres au fil de la progression.
- Ordre pédagogique recommandé, sans verrouillage des séquences selon les résultats.
- Couleur d'accent par chapitre, sur fonds neutres : rouge pour le chapitre 1, puis cycle violet, bleu, vert et orange.
- Quatre formats autocorrigés : texte à trous, traduction dans les deux sens, QCM et remise en ordre des mots.
- Activités orales ou collectives conservées comme consignes facultatives, sans prétendre les corriger automatiquement.

### Convention d’affichage bilingue

Les textes de l’interface et les contenus bilingues suivent la présentation du
livre : **texte basque en premier, traduction française directement dessous,
dans une taille plus petite**, jamais côte à côte. Cette règle s’applique aussi
aux titres, boutons, consignes et messages de chargement ou d’erreur. Les noms
propres et les données de compte ne sont pas traduits.

Utiliser le composant `app-bilingual-text` avec ses deux entrées obligatoires
`eu` et `fr` pour conserver cette présentation. Chaque texte porte l’attribut
`lang` de sa langue pour les lecteurs d’écran ; les libellés accessibles des
contrôles conservent les deux langues.

### Correction et progression

Les réponses admises sont définies dans le contenu. La comparaison normalise Unicode
(NFC), la casse, les espaces et la ponctuation finale, tout en préservant les lettres,
accents, suffixes et la ponctuation interne significative. Une transposition unique de
deux lettres adjacentes dans un mot d'au moins cinq caractères peut afficher « Presque ! » ;
elle reste incorrecte et ne fournit aucun indice de maîtrise. Voir
[docs/curriculum.md](docs/curriculum.md) pour le détail.

Une carte de progression remplacera l'autoévaluation déclarative par une estimation des objectifs de communication : **à découvrir**, **en cours**, **acquis**. Le critère convenu pour « acquis » est une réussite sur au moins **trois items distincts**, répartie sur au moins **deux sessions de pratique distinctes**. Cette estimation n'est pas une évaluation complète des capacités orales.

Il n'y aura ni note chiffrée, ni classement, ni série quotidienne imposée.

### Accès, synchronisation et hors ligne

Selon la [décision d'accès acceptée](docs/adr/0001-authenticated-unit-access.md), **tout compte Google connecté pourra lire le contenu publié**. Il ne s'agit pas d'un accès réservé à une liste d'invités. La progression et les tentatives de chaque personne resteront privées à son compte.

Les tentatives conserveront uniquement l'item, le résultat, la date et les identifiants techniques nécessaires, pas le texte des réponses saisies.

La PWA permettra de consulter hors ligne le contenu déjà chargé et d'enregistrer des tentatives en attente de synchronisation. Le contenu jamais consulté et les ressources audio externes ne seront pas garantis hors ligne.

## Stack et validation

| Besoin                                           | Choix                               |
| ------------------------------------------------ | ----------------------------------- |
| Application installable sur mobile et ordinateur | Angular PWA                         |
| Interface                                        | Angular Material                    |
| Connexion                                        | Firebase Authentication avec Google |
| Curriculum, tentatives et progression            | Firestore                           |
| Hébergement                                      | Firebase Hosting                    |
| Tests des parcours utilisateur                   | Playwright et émulateurs Firebase   |

Les tests utiliseront des contenus fictifs originaux et des comptes simulés. Ils couvriront les comportements visibles dans le navigateur, les droits d'accès Firestore et l'import du curriculum, sans dépendre du livre numérisé, d'un compte Google réel ou des services de production.

## Contenu et droits

Cette application est un compagnon pédagogique du livre _Ikasbide metodoa_ : elle ne le remplace pas et doit être utilisée avec le livre. Elle n'est pas conçue pour enseigner la méthode de façon autonome. Pour en savoir plus sur les organismes liés au basque, consulter les sites d'[AEK](https://www.aek.eus/) et d'[IKAS](https://ikas.eus/).

Le moteur applicatif et le contenu pédagogique sont séparés. Les sources JSON du curriculum sont conservées dans le **dépôt privé distinct** [`bastienmoulia/ikasbide-content`](https://github.com/bastienmoulia/ikasbide-content), puis validées et importées dans Firestore. Ce dépôt privé ne rend pas le contenu publié confidentiel : celui-ci est lisible par tout compte Google connecté.

Les cours seront résumés et les exercices adaptés avec des formulations originales, sans reproduire le livre. Aucun scan ou extrait substantiel du livre, illustration protégée, parole de chanson ou fichier audio ne sera ajouté au dépôt public ou aux fichiers statiques de l'application sans autorisation explicite. Une connexion Google ou un dépôt privé ne constitue pas une autorisation de redistribution.

Pour le chapitre 1, l'application proposera uniquement un lien vers la [page audio officielle IKAS/AEK](https://www.ikas.eus/spip.php?article3185&lang=eu), sans télécharger, intégrer ou héberger les MP3. Les cartes seront originales et les portraits utilisés seulement avec les droits nécessaires.

## Feuille de route

Les tickets #2 et #3 sont implémentés ; les autres fonctionnalités ci-dessous
restent **à réaliser**. La [spec V1](https://github.com/bastienmoulia/ikasbide-app/issues/1)
reste la référence détaillée.

| Ticket                                                       | Livrable                                       | État       | Dépend de |
| ------------------------------------------------------------ | ---------------------------------------------- | ---------- | --------- |
| [#2](https://github.com/bastienmoulia/ikasbide-app/issues/2) | PWA authentifiée et premier socle déployable   | Livré      | —         |
| [#3](https://github.com/bastienmoulia/ikasbide-app/issues/3) | Import et navigation du curriculum             | Livré      | #2        |
| [#4](https://github.com/bastienmoulia/ikasbide-app/issues/4) | Quatre formats d'activités autocorrigées       | À réaliser | #3        |
| [#5](https://github.com/bastienmoulia/ikasbide-app/issues/5) | Consultation du contenu déjà chargé hors ligne | À réaliser | #3        |
| [#6](https://github.com/bastienmoulia/ikasbide-app/issues/6) | Sauvegarde et synchronisation des tentatives   | À réaliser | #4, #5    |
| [#7](https://github.com/bastienmoulia/ikasbide-app/issues/7) | Carte de progression par objectif              | À réaliser | #6        |

La répétition espacée viendra plus tard, à partir du vocabulaire et des expressions clés dans les deux sens basque–français. Les applications natives via Capacitor, la reconnaissance vocale et les moteurs dédiés aux jeux oraux ne font pas partie de cette V1.

## Licence

Le code de ce dépôt est sous [licence MIT](LICENSE). Cette licence ne s'étend pas au livre ni aux médias tiers.
