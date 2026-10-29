# Connecter et déployer Firebase

L’application utilise Firebase Authentication (Google), Firestore et Hosting. Aucun
contenu pédagogique, compte de service ou jeton privé ne doit être ajouté aux fichiers
publics. Le curriculum est publié dans Firestore par une commande d’import décrite dans
[curriculum.md](curriculum.md).

## Préparer le projet

1. Créer le projet dans la console Firebase. Google Analytics est facultatif.
2. Dans **Paramètres du projet → Général → Vos applications**, enregistrer une
   application **Web**. Récupérer `apiKey`, `authDomain`, `projectId` et `appId`
   dans la configuration du SDK.
3. Dans **Authentication → Commencer → Mode de connexion**, activer **Google**,
   renseigner le nom public et l’adresse d’assistance demandés, puis enregistrer.
   Tous les comptes Google peuvent se connecter, sans liste d’invités.
4. Dans **Authentication → Paramètres → Domaines autorisés**, vérifier que les domaines
   d’hébergement du projet sont présents (`PROJECT_ID.web.app` et
   `PROJECT_ID.firebaseapp.com`). Ajouter tout domaine personnalisé utilisé.
   Ajouter `localhost` uniquement si la connexion Google réelle est souhaitée en local.
   Les projets récents ne l’ajoutent pas toujours automatiquement.
5. Si un écran de consentement OAuth est demandé dans Google Cloud, compléter les
   informations et choisir un mode de publication compatible avec le public visé.
   Un écran limité aux utilisateurs de test ne permet pas l’accès à tous les comptes.
6. Dans **Firestore Database → Créer une base de données**, choisir l’édition standard,
   un emplacement européen et le **mode production**. Ne jamais choisir le mode test :
   les règles du dépôt sont déployées par `npm run deploy`.

## Configuration locale

Depuis la racine du dépôt, avec Node 24.15+ (ou 22.22.3+) :

```bash
npm ci
cp firebase-config.example.json public/firebase-config.json
```

Remplacer les quatre valeurs `YOUR_…` par celles de l’application Web. Conserver
`"useEmulators": false`. Le fichier local est ignoré par Git mais **publié par Hosting** :
ces identifiants de configuration Web ne sont pas des secrets. Ne jamais y placer une
clé privée, un compte de service, un secret OAuth ou un jeton Firebase CLI.

L’application charge ce JSON au démarrage, sans le mettre en cache dans son service worker.
Un fichier absent ou invalide affiche explicitement « Connexion indisponible ».
La configuration des émulateurs n’est acceptée que sur `localhost` ou `127.0.0.1`
avec le projet fictif `demo-ikasbide`.

Pour développer avec le vrai projet :

```bash
npm start
```

Ouvrir `http://localhost:4200`. Le service worker est désactivé en développement ;
utiliser la construction de production via Hosting pour vérifier l’installation.

## Premier déploiement

```bash
npx firebase login
npx firebase use --add
# Choisir le projet correspondant au JSON et lui donner l’alias default.
npm run deploy
```

Ne pas relancer `firebase init` : `firebase.json` contient déjà le dossier de sortie
Angular, la réécriture SPA et les en-têtes de cache. `.firebaserc`, créé par
`firebase use --add`, reste local. `npm run deploy` reconstruit l’application,
vérifie que la configuration n’est pas celle des émulateurs et que l’alias `default`
correspond au projet configuré, puis déploie Hosting et les règles Firestore avec
`--project default`
(indépendamment du projet actif dans la CLI). Une commande directe
`firebase deploy` contournerait ces vérifications.

Publier ensuite le curriculum depuis le dépôt privé de contenu (voir
[curriculum.md](curriculum.md#valider-et-importer)) :

```bash
gcloud auth application-default login
npm run curriculum:import -- ../ikasbide-content/curriculum.json --project PROJECT_ID
```

Ouvrir l’URL HTTPS affichée par la CLI. Vérifier la connexion Google, la liste des
chapitres publiés, la persistance après rechargement, puis la déconnexion. Sur un autre appareil,
utiliser cette URL HTTPS et non une adresse IP locale en HTTP.

## Déployer avec GitHub Actions

Le workflow `.github/workflows/deploy.yml` construit et déploie uniquement Hosting
depuis `main`. Il est **manuel uniquement** pour commencer : aucun push ni aucune
pull request ne déclenche de déploiement.

Dans **Settings → Secrets and variables → Actions** du dépôt, configurer :

- La variable de dépôt `FIREBASE_CONFIG` : le JSON complet de la configuration Web
  décrit plus haut, avec les vraies valeurs et `"useEmulators": false`. Le workflow
  accepte aussi l’objet JavaScript `firebaseConfig` fourni par Firebase, avec ou sans
  déclaration `const` et accolades externes.
- Le secret de dépôt `FIREBASE_SERVICE_ACCOUNT` : le JSON d’une clé de compte de
  service Google Cloud dédié au déploiement, appartenant au même projet. Lui attribuer
  les rôles **Firebase Hosting Admin** (`roles/firebasehosting.admin`) et
  **API Keys Viewer** (`roles/serviceusage.apiKeysViewer`) sur ce projet, plutôt
  qu’un rôle Owner ou Editor. Ne jamais placer ce JSON dans une variable, le dépôt
  ou `public/`.

Une fois le workflow présent sur la branche par défaut, ouvrir **Actions →
Deploy Firebase Hosting → Run workflow**, sélectionner **main**, puis lancer.
Un lancement sur une autre branche est ignoré. Le workflow récupère `main`, installe
les dépendances verrouillées avec `npm ci`, génère la configuration locale et
réutilise `npm run deploy` avec ses vérifications. Le compte de service est écrit
dans un fichier temporaire privé, utilisé via Application Default Credentials,
puis supprimé même en cas d’échec. Aucun `firebase login` interactif n’est nécessaire.
Les déploiements sont sérialisés pour ne pas interrompre une publication en cours.

Pour activer plus tard le déploiement à chaque changement de `main`, ajouter le
déclencheur suivant sous `on:`, en conservant `workflow_dispatch:` :

```yaml
push:
  branches: [main]
```

Le workflow ne déploie ni règles Firestore ni configuration Authentication.
Après le premier lancement, vérifier l’application sur son URL HTTPS comme pour
le déploiement local.

## Installer la PWA

- Chrome/Edge sur ordinateur ou Android : utiliser l’action **Installer** du navigateur.
- Safari sur iPhone/iPad : **Partager → Sur l’écran d’accueil**.

Le manifeste comporte les icônes originales, les couleurs et le mode autonome ; le
service worker Angular distribue le shell de production. L’installation dépend du
navigateur. Le cache du shell ne contient ni programme pédagogique, ni données
personnelles de progression. Les chapitres consultés en ligne sont conservés dans le
cache IndexedDB de Firestore sur l’appareil, et la dernière configuration Firebase
validée dans le `localStorage`, ce qui permet de les relire hors ligne avec la session
Google déjà ouverte. La synchronisation des tentatives relève du ticket #6.

## Vérification sans projet de production

```bash
npx playwright install chromium
npm run typecheck
npm test
```

`npm test` construit la PWA, écrit une configuration fictive **uniquement dans `dist/`**,
et démarre les émulateurs Authentication (`127.0.0.1:9099`), Firestore
(`127.0.0.1:8080`) et Hosting (`127.0.0.1:5100`) avec `demo-ikasbide`. Le curriculum
fictif `tests/fixtures/curriculum.sample.json` y est importé avant les tests. La fenêtre Google de l’émulateur crée des
identités synthétiques `example.test` ; aucun compte Google ou accès à la production
n’est nécessaire. Les émulateurs sont arrêtés à la fin, même en cas d’échec.
Ne saisir aucun compte réel dans cette fenêtre. Un test ne modifie jamais
`public/firebase-config.json` ni l’alias du vrai projet.

Pour explorer manuellement cette même construction :

```bash
npm run build:e2e
npm run emulators
```

Ouvrir `http://127.0.0.1:5100`, puis arrêter les émulateurs avec Ctrl-C.
Pour exécuter un seul fichier après construction :

```bash
npx firebase emulators:exec --project demo-ikasbide --only auth,firestore,hosting \
  "playwright test e2e/curriculum.spec.ts --project=desktop"
```

Les règles Firestore et l’import se testent sans construire l’application :

```bash
npx firebase emulators:exec --project demo-ikasbide --only firestore \
  "playwright test --project=firestore"
```

Les tests couvrent les vues mobile et bureau, le parcours Google émulé, la navigation
dans les unités, chapitres et séquences, les droits de lecture Firestore, l’import et
ses refus de fichiers invalides, la persistance,
la déconnexion, l’annulation de la fenêtre, les configurations absentes/invalides et
l’installabilité Chromium de la PWA réellement servie par Hosting. Ils ne valident
pas l’écran OAuth Google de production ni les menus d’installation propres à iOS.
La CI exécute les mêmes commandes sans secrets.

## Dépannage

| Symptôme                                          | Action                                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Connexion indisponible dès l’ouverture            | Vérifier le JSON, sa présence dans `public/`, l’accès réseau, puis reconstruire. Le détail technique est dans la console du navigateur. |
| `auth/operation-not-allowed`                      | Activer le fournisseur Google dans Authentication.                                                                                      |
| `auth/unauthorized-domain`                        | Ajouter le domaine exact dans les domaines autorisés.                                                                                   |
| Fenêtre de connexion bloquée                      | Autoriser les popups pour l’application, puis réessayer.                                                                                |
| Port déjà occupé pendant les tests                | Arrêter son propre service utilisant 5100, 8080 ou 9099 ; ne pas réutiliser un émulateur lié à un vrai projet.                          |
| Import : `Could not load the default credentials` | Exécuter `gcloud auth application-default login` avec un compte ayant accès au projet.                                                  |
| Chapitres en échec de chargement                  | Vérifier que la base Firestore existe, que les règles sont déployées et que l’import a réussi.                                          |
| Installation non proposée                         | Vérifier HTTPS, le navigateur, et que l’application n’est pas déjà installée.                                                           |

Les règles Firestore (`firestore.rules`) n’autorisent que la lecture du curriculum par
les comptes Google connectés et interdisent toute écriture depuis l’application.
L’authentification de l’interface ne remplace pas ces règles : toujours les déployer
avec `npm run deploy`.
