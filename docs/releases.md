# Versions et releases

## Politique de version

La version affichée dans le menu du compte provient de `package.json` au moment de la
construction. Elle identifie donc le bundle effectivement chargé, y compris si le
navigateur utilise une version mise en cache. La version courante `0.0.0` reste affichée
jusqu’à la publication de la première release automatisée `v0.1.0`.

Les titres de pull request suivent Conventional Commits. Les types usuels sont
`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`
et `revert`; un scope facultatif et le marqueur `!` sont acceptés, par exemple
`feat(menu)!: modifier les actions du compte`. Le titre de la pull request fusionnée
doit être conservé comme titre du commit squash : les commits de développement n’ont
pas à suivre cette convention.

Avant `1.0.0`, `feat:` incrémente la version mineure, `fix:` la version corrective,
et une modification incompatible signalée par `!` ou `BREAKING CHANGE:` incrémente
la version mineure. Ces versions restent pré-1.0 ; elles ne promettent pas une API
stable. Après la première release, Release Please crée ou met à jour une pull request
de release avec les changements de `package.json`, `package-lock.json`, du manifeste
et de `CHANGELOG.md`. Sa fusion est l’approbation de publication ; elle crée le tag
`vX.Y.Z` et la release GitHub correspondante. Aucun commit existant ni tag n’est
réécrit.

## Mise à jour de l’application installée

En production, le service worker est enregistré dès le démarrage. L’application
cherche une nouvelle version au lancement, au retour au premier plan et toutes
les 30 minutes tant qu’elle est visible. Ces vérifications concernent les PWA
installées (iOS et Android) comme les onglets du navigateur ; elles ne tournent
pas en arrière-plan.
Le point d’entrée `visible-worker.js` conserve le worker Angular standard et
refuse ses requêtes de manifeste lorsqu’aucun client de l’application n’est visible,
y compris les vérifications qu’Angular planifie lui-même.

Une version entièrement téléchargée est appliquée par un rechargement silencieux,
sans réinstallation. Le rechargement conserve l’URL, la connexion et les données
locales ; il attend la sortie de la série d’entraînement, y compris son bilan,
et la confirmation des écritures de progression et de tentatives. Les écritures
restaurées du cache Firestore ou en attente dans un autre onglet du même compte
sont également attendues. Une écriture non confirmée ou échouée bloque la mise à
jour automatique, sans délai qui forcerait le rechargement.
Les identités et champs attendus des sauvegardes non confirmées sont conservés
localement, sans texte de réponse et sans seconde file d’écriture. Avant le
rechargement, leurs documents sont vérifiés auprès du serveur : vider la file
Firestore ne suffit pas, car un rejet la vide aussi. Les confirmations restent
donc vérifiables après une fermeture ou dans un autre onglet.
Une session déconnectée attend la connexion au compte concerné si des sauvegardes
restent non confirmées. Le dernier contrôle et le rechargement sont coordonnés
avec l’enregistrement de ces confirmations dans les autres onglets via Web Locks ;
aucun verrou n’est conservé pendant l’attente de synchronisation hors ligne.
Un ancien navigateur sans Web Locks conserve l’application utilisable et affiche
une erreur plutôt que de procéder à un rechargement automatique non sécurisé.

Les mises à jour réussies n’affichent aucune notification. Un échec d’installation
affiche un message bilingue non bloquant avec une action pour réessayer ; une
vérification ordinaire sans réseau attend une prochaine occasion. La version
visible dans « À propos » reste celle du bundle chargé, pas celle du dernier
déploiement disponible.

Les tests `e2e/pwa-update.spec.ts` servent deux builds indépendants sur une
origine isolée avec le vrai service worker Angular et vérifient le code exécuté
via la version affichée dans « À propos ». Ils vérifient la transition,
les limites de temps, le premier plan, les sauvegardes hors ligne et une
installation incomplète suivie d’un nouvel essai. Le projet Playwright `ios-pwa`
les exécute sous WebKit avec un profil iPhone ; cela ne remplace pas une
vérification sur un iPhone physique.

## Configuration GitHub requise

Dans **Settings → Secrets and variables → Actions**, créer le secret de dépôt
`RELEASE_PLEASE_TOKEN`. Il doit appartenir à un compte ou à une GitHub App qui peut
écrire le contenu et les pull requests du dépôt. Un fine-grained token doit disposer
de **Contents: read and write** et **Pull requests: read and write**. Release Please
l’utilise pour créer les pull requests et releases ; contrairement au `GITHUB_TOKEN`
standard, ce token permet aux vérifications de pull request et au workflow de
publication de se déclencher sur les événements générés par Release Please.
Ne jamais enregistrer le token dans le dépôt.

Activer la fusion squash dans les paramètres de pull request, et demander aux
mainteneurs de conserver le titre Conventional Commit de la pull request comme titre
du commit squash. Le workflow `CI` vérifie ce titre sur chaque ouverture et
modification de pull request, y compris les pull requests Release Please.
Configurer la protection de `main` pour exiger la vérification `CI / browser-tests`
avant fusion ; ne pas imposer aux commits de développement une convention qui ne
s’applique qu’au titre de pull request.

Chaque push sur `main` déclenche le déploiement du dernier commit du push. La
publication d’une release avec un tag `vX.Y.Z` déclenche également le déploiement du
SHA exact de ce tag. Dans les deux cas, le workflow vérifie le dernier `CI` de type
push sur `main` pour ce SHA. Le déploiement échoue si ce workflow est absent, en
attente au-delà du délai, échoué, annulé, ignoré ou associé à un autre commit. Le
build et le déploiement utilisent ce même SHA, même si `main` a avancé. Une nouvelle
exécution du workflow depuis la release réessaie le même tag. Les déploiements sont
sérialisés, mais GitHub ne garantit pas l’ordre des exécutions en attente. La route
manuelle **Actions → Deploy Firebase Hosting → Run workflow** reste limitée à `main`
pour récupération et conserve ses contrôles Firebase existants. Ces routes déploient
Hosting et les règles Firestore, jamais la configuration Authentication.

La publication et le déploiement ne sont pas exécutés pendant les tests locaux.
Les variables et identifiants Firebase requis par le workflow sont documentés dans
[firebase-setup.md](firebase-setup.md#déployer-avec-github-actions).
