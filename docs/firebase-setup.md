# Connecter et déployer Firebase

Le socle utilise Firebase Authentication (Google) et Hosting. Aucun contenu pédagogique,
compte de service ou jeton privé ne doit être ajouté aux fichiers publics. Firestore et
l’import du curriculum viendront avec le ticket #3 : il n’est pas nécessaire de créer
une base pour déployer ce socle.

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
correspond au projet configuré, puis déploie uniquement Hosting avec `--project default`
(indépendamment du projet actif dans la CLI). Une commande directe
`firebase deploy` contournerait ces vérifications.

Ouvrir l’URL HTTPS affichée par la CLI. Vérifier la connexion Google, l’accueil vide,
la persistance après rechargement, puis la déconnexion. Sur un autre appareil,
utiliser cette URL HTTPS et non une adresse IP locale en HTTP.

## Installer la PWA

- Chrome/Edge sur ordinateur ou Android : utiliser l’action **Installer** du navigateur.
- Safari sur iPhone/iPad : **Partager → Sur l’écran d’accueil**.

Le manifeste comporte les icônes originales, les couleurs et le mode autonome ; le
service worker Angular distribue le shell de production. L’installation dépend du
navigateur. La lecture hors ligne du curriculum et la synchronisation sont les
tickets #5 et #6, pas des fonctionnalités de ce socle. Le cache du shell ne contient
ni programme pédagogique, ni données personnelles de progression.

## Vérification sans projet de production

```bash
npx playwright install chromium
npm run typecheck
npm test
```

`npm test` construit la PWA, écrit une configuration fictive **uniquement dans `dist/`**,
et démarre les émulateurs Authentication (`127.0.0.1:9099`) et Hosting
(`127.0.0.1:5100`) avec `demo-ikasbide`. La fenêtre Google de l’émulateur crée des
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
npx firebase emulators:exec --project demo-ikasbide --only auth,hosting \
  "playwright test e2e/auth.spec.ts --project=desktop"
```

Les tests couvrent les vues mobile et bureau, le parcours Google émulé, la persistance,
la déconnexion, l’annulation de la fenêtre, les configurations absentes/invalides et
l’installabilité Chromium de la PWA réellement servie par Hosting. Ils ne valident
pas l’écran OAuth Google de production ni les menus d’installation propres à iOS.
La CI exécute les mêmes commandes sans secrets.

## Dépannage

| Symptôme                               | Action                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Connexion indisponible dès l’ouverture | Vérifier le JSON, sa présence dans `public/`, l’accès réseau, puis reconstruire. Le détail technique est dans la console du navigateur. |
| `auth/operation-not-allowed`           | Activer le fournisseur Google dans Authentication.                                                                                      |
| `auth/unauthorized-domain`             | Ajouter le domaine exact dans les domaines autorisés.                                                                                   |
| Fenêtre de connexion bloquée           | Autoriser les popups pour l’application, puis réessayer.                                                                                |
| Port déjà occupé pendant les tests     | Arrêter son propre service utilisant 5100 ou 9099 ; ne pas réutiliser un émulateur lié à un vrai projet.                                |
| Installation non proposée              | Vérifier HTTPS, le navigateur, et que l’application n’est pas déjà installée.                                                           |

Ce dépôt ne déploie aucune règle Firestore : ne jamais activer une base en mode test
pour ce socle. L’authentification de l’interface ne remplace pas les futures règles
d’accès aux données.
