# Activation de la publication du curriculum

Le workflow `.github/workflows/publish-curriculum.yml` vit dans le dépôt privé
[`bastienmoulia/ikasbide-content`](https://github.com/bastienmoulia/ikasbide-content).
Chaque push sur `main`, sans filtre de chemins, lance le
[CLI de synchronisation](curriculum.md#republication-automatique-depuis-git) public
de ce dépôt. Il ne déploie ni l’application, ni Hosting, ni les règles Firestore.

Le code ne crée aucune infrastructure GCP. Les étapes ci-dessous sont des prérequis
à réaliser par un administrateur, d’abord dans **un projet GCP de test**, puis en
production. Aucun credential de production n’est nécessaire aux tests automatisés.

## Identité dédiée sans clé persistante

Créer un compte de service dédié, un pool et un provider Workload Identity Federation.
Activer les API Firestore, IAM, IAM Service Account Credentials et Security Token
Service dans le projet approprié. Ne créer aucune clé JSON de compte de service et
ne donner ni rôle Owner/Editor, ni rôle Firebase/Hosting à cette identité.

Exemple de configuration administrative, avec des identifiants de projet à remplacer :

```bash
PROJECT_ID=YOUR_TEST_PROJECT_ID
PROJECT_NUMBER=YOUR_TEST_PROJECT_NUMBER
POOL_ID=github-curriculum
PROVIDER_ID=ikasbide-content
SA_NAME=curriculum-publisher
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# Identifiants numériques stables : évitent une confiance dans un nom réutilisable.
CONTENT_REPOSITORY_ID=$(gh api repos/bastienmoulia/ikasbide-content --jq .id)
CONTENT_OWNER_ID=$(gh api repos/bastienmoulia/ikasbide-content --jq .owner.id)

gcloud services enable firestore.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com --project "$PROJECT_ID"
gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT_ID"
gcloud iam workload-identity-pools create "$POOL_ID" \
  --project "$PROJECT_ID" --location global --display-name "GitHub curriculum"
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project "$PROJECT_ID" --location global --workload-identity-pool "$POOL_ID" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref" \
  --attribute-condition "assertion.repository == 'bastienmoulia/ikasbide-content' && assertion.ref == 'refs/heads/main' && assertion.event_name == 'push' && assertion.repository_id == '$CONTENT_REPOSITORY_ID' && assertion.repository_owner_id == '$CONTENT_OWNER_ID'"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project "$PROJECT_ID" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_ID/attribute.repository_id/$CONTENT_REPOSITORY_ID"
```

Le binding d’impersonation ne suffit pas à lui seul : **conserver la condition du
provider sur le dépôt, les identifiants numériques et `refs/heads/main`**.
Une autre branche, un autre dépôt et les événements de pull request doivent être refusés.
Le pool doit être dédié ou ses autres providers doivent appliquer une confiance
équivalente : leurs mappings ne doivent pas permettre d’usurper ce principalSet.
Protéger également `main` et les modifications du workflow dans le dépôt de contenu.

## Permissions Firestore minimales

Le publisher lit des documents et des collections, démarre des transactions et
crée/met à jour/supprime des documents, y compris son checkpoint de publication.
Créer un rôle personnalisé avec uniquement :

```bash
gcloud iam roles create curriculumPublisher --project "$PROJECT_ID" \
  --title "Curriculum Firestore publisher" --stage GA \
  --permissions "datastore.databases.get,datastore.entities.get,datastore.entities.list,datastore.entities.create,datastore.entities.update,datastore.entities.delete"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:$SA_EMAIL" \
  --role "projects/$PROJECT_ID/roles/curriculumPublisher"
```

Les règles Firestore côté client ne limitent pas le SDK serveur : ce rôle donne des
droits sur les données Firestore du projet, pas uniquement les collections du
curriculum. Il n’accorde aucun droit de déploiement Hosting, de règles ou d’index.
Ne pas remplacer ce rôle par un rôle Firebase administrateur. Le compte de service
doit être réservé à cette publication ; ne pas lui ajouter de droits supplémentaires.

## Variables du dépôt privé et révision publique du CLI

Configurer ces **variables Actions**, pas des secrets JSON :

| Variable                         | Valeur                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`                 | Projet Firestore cible                                                                                          |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID`                  |
| `GCP_SERVICE_ACCOUNT`            | Adresse du compte de service dédié                                                                              |
| `CURRICULUM_CLI_REF`             | SHA complet de 40 caractères hexadécimaux minuscules d’un commit public relu de `ikasbide-app` contenant `sync` |

Le CLI doit être disponible publiquement avant l’activation : publier/fusionner son
commit puis configurer le SHA immuable. L’archive du dépôt public est téléchargée sans
token GitHub inter-dépôts. Les actions sont également épinglées par SHA.
`npm ci` précède l’authentification pour ne pas consommer la durée du jeton pendant
l’installation. Le job n’accorde que `contents: read` et `id-token: write`.
Le fichier ADC temporaire exporté par l’action est consommé directement par le client
Google Cloud Firestore ; `gha-creds-*.json` doit rester ignoré, hors logs et artefacts.

## Contrôle WIF non destructif avant activation

Dans un workflow de vérification **du dépôt de contenu, sur `main`, dans le projet de
test**, après `google-github-actions/auth` et depuis le checkout public de l’application,
exécuter cette lecture seule :

```bash
node --input-type=module <<'NODE'
import { Firestore } from '@google-cloud/firestore';
const db = new Firestore({ projectId: process.env.GCP_PROJECT_ID });
try {
  await db.doc('curriculumPublications/ikasbide-content').get();
  console.log('WIF Firestore read succeeded (no writes).');
} finally {
  await db.terminate();
}
NODE
```

L’absence du document est normale ; l’appel doit réussir sans clé persistante. Vérifier
les refus d’authentification depuis une branche différente et un autre dépôt contre ce
même provider de test. Contrôler le rôle personnalisé et les bindings IAM, puis exécuter
une publication de contenu fictif dans le projet de test pour vérifier les permissions
d’écriture et de transaction. Ne pas utiliser le projet de production pour ce test.

**Cette vérification GCP nécessite une fédération configurée et n’est pas remplacée
par les tests émulateur.** Ceux-ci vérifient le flux CLI/Git/Firestore réel, mais pas la
confiance OIDC ni l’échange de jetons GCP. Sans environnement WIF de test, la compatibilité
du client est implémentée, mais l’activation de production reste à vérifier.

Après ces contrôles, configurer les variables de production et fusionner le workflow.
La première exécution publie complètement tous les livres pour établir le checkpoint.
Les logs affichent les identifiants de livres/chapitres, les validations et les échecs,
pas les textes complets des cours. En cas d’échec, le prochain push reprend les différences
depuis la dernière réussite ; ne pas modifier le checkpoint pour masquer un échec.

## Vérification locale

Avec les ports émulateur libres (ne jamais réutiliser ni vider un émulateur partagé) :

```bash
npx firebase emulators:exec --project demo-ikasbide --only firestore \
  "npx playwright test --project=firestore tests/firestore/curriculum-sync.spec.ts tests/firestore/curriculum-import.spec.ts tests/firestore/curriculum-partial-import.spec.ts"
```

Chaque scénario de synchronisation utilise un dépôt Git temporaire avec des sources
fictives et un projet émulateur distinct. Les tests observent les documents et leurs
horodatages pour vérifier l’absence d’écritures, l’atomicité par livre, les suppressions,
la reprise cumulée, les événements réordonnés et la validation avant publication.

## Références

- [Action officielle d’authentification et limite Firebase Admin](https://github.com/google-github-actions/auth)
- [WIF pour les pipelines et conditions de confiance](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [IAM Firestore : permissions par méthode](https://cloud.google.com/firestore/native/docs/security/iam)
- [Client serveur Firestore et ADC](https://cloud.google.com/firestore/native/docs/authentication)
- [Concurrence GitHub Actions sans ordre garanti](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
