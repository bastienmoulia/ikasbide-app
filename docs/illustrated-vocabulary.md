# Vocabulaire illustré

## Parcours apprenant

Les noms concrets, faciles à reconnaître sans texte dans l’image, sont travaillés
d’abord par QCM (`image-choice`), puis par saisie (`image-write`), dans l’ordre
du contenu. La forme de dictionnaire est la cible par défaut. Les variantes sont
explicitement rédigées et validées ; les petites fautes ne sont pas des réussites.
Le QCM comporte une bonne réponse et cinq distracteurs basques, éventuellement
issus d’un autre chapitre. Aucun synonyme ou autre mot décrivant correctement
l’illustration ne doit être un distracteur.

Les images nécessaires sont téléchargées au démarrage du parcours, avec quatre
téléchargements simultanés maximum et un délai réseau de dix secondes par image.
Une seule copie de chaque image est conservée dans Cache Storage, identifiée par son
SHA-256. Les octets et le décodage sont vérifiés avant affichage, y compris au retour
depuis le cache. Une image inchangée n’est pas téléchargée de nouveau.

Si une image manque, les autres questions restent accessibles. Le nombre de questions
disponibles et indisponibles est affiché ; les questions non jouées restent dans la file,
sans tentative, sans erreur et sans complétion artificielle. « Réessayer » recharge les
images manquantes. La reprise conserve les questions déjà faites, même incorrectes.
Sans aucune image disponible, un état explicite « Parcours incomplet » est affiché.

La version d’une séquence illustrée commencée est conservée localement, par compte,
livre, chapitre et séquence, tant qu’elle reste incomplète. Une mise à jour publiée ne
remplace pas ses questions ou images à la reprise sur ce même appareil. La progression
continue d’être synchronisée par les mécanismes existants ; le contenu épinglé, comme
le cache des images, est propre à l’appareil. Les identifiants doivent changer lorsque
le sens d’un item change, comme pour les autres activités.

Le navigateur peut supprimer son stockage. Le cache ne garantit donc pas une
disponibilité hors ligne permanente. Si le stockage échoue, l’application le signale
explicitement ; les images qui ont pu être chargées restent utilisables en ligne.
Le cache de contenu reste sur l’appareil à la déconnexion, conformément à
l’[ADR 0003](adr/0003-device-cache-for-offline-reading.md).

## Préparation à la demande dans le dépôt privé

La préparation ne contacte aucun fournisseur IA et ne génère aucune image payante.
Pour un chapitre choisi, l’agent prépare un brouillon à partir du vocabulaire du
chapitre : noms concrets uniquement, sens précis, forme de dictionnaire, traduction
française et cinq distracteurs. Une personne vérifie le résultat avant publication.

La bibliothèque commune est `illustrations/library.json`, à la racine
d’`ikasbide-content`. Sa clé est un identifiant de **sens**, par exemple
`dog-animal`. Les livres et chapitres réutilisent cette entrée sans régénérer l’image.
Deux sens distincts ont deux identifiants. Les fichiers sont
`illustrations/<sha256>.png` ; les anciennes versions restent disponibles pour les
parcours en cours.

Le brouillon suit
[`illustrations-draft.schema.json`](../tools/curriculum/illustrations-draft.schema.json) :

```json
{
  "sequenceId": "objects",
  "objectiveIds": ["name-objects"],
  "words": [
    {
      "senseId": "dog-animal",
      "word": { "eu": "txakur", "fr": "chien" },
      "imageFile": "drafts/dog.png",
      "distractors": ["katu", "zaldi", "ardi", "behi", "txori"]
    }
  ]
}
```

`imageFile` est relatif au dépôt privé et ne peut pas en sortir, même par lien
symbolique. Pour un sens existant, omettre `imageFile` et réutiliser la bibliothèque.
`word` est alors facultatif, mais ne peut pas contredire l’entrée existante.
Une régénération volontaire exige `regenerate: true` et un nouvel `imageFile`.
`acceptedAnswers` est facultatif et vaut par défaut `[word.eu]`.

L’illustration doit être simple, cohérente avec les autres, montrer un seul objet sur
fond neutre, sans lettre, mot ni indice écrit. Les vérifications automatiques ne
remplacent pas la validation humaine du sens et de la qualité de l’image.

Depuis le checkout de l’application :

```bash
npm run curriculum:images -- /path/to/ikasbide-content \
  --book A1 --chapter objects --draft /path/to/draft.json \
  --bucket YOUR_PROJECT.firebasestorage.app
```

La commande valide le livre entier, puis met à jour le chapitre et la bibliothèque
locale, sans téléversement. Elle ajoute les deux activités à la fin de la séquence
choisie, QCM avant saisie, sans modifier les autres contenus. Relancer la commande
remplace ces deux activités préparées, sans les dupliquer. Le brouillon doit donc
contenir tous les mots souhaités pour cette séquence.

La sortie standard est un aperçu Markdown à placer dans le répertoire du livre
(par exemple `A1/illustrations-review.md`) pour conserver les chemins relatifs.
L’aperçu montre les images locales, les mots, les variantes et les six propositions.
Inclure cet aperçu, le chapitre, la bibliothèque et les PNG dans une PR du dépôt
**privé** ; ne pas recopier le contenu privé dans l’application publique.
Faire relire puis approuver la PR avant fusion. La génération n’est jamais relancée
automatiquement par un changement de chapitre.

## Publication et prérequis Firebase

Le `sync` existant publie les images référencées par les livres sélectionnés avant
toute écriture Firestore. Tous les fichiers doivent appartenir au commit publié ;
les images absentes ou dont l’empreinte est fausse font échouer la publication.
Un échec de téléversement empêche la publication du curriculum et l’avancement
du checkpoint. Les images déjà envoyées sont inoffensives et réutilisées à la reprise.

Les objets sont créés avec la précondition `ifGenerationMatch: 0` : aucune version
existante n’est écrasée. En cas d’objet préexistant, son empreinte en métadonnées et sa
taille sont vérifiées. Ne pas supprimer les anciennes images encore référencées par
des parcours épinglés.

Avant activation, un administrateur doit :

- Activer le forfait **Blaze**, créer le bucket et configurer les alertes budgétaires
  (elles ne constituent pas un plafond de dépense).
- Déployer `storage.rules` avec `firebase deploy --project YOUR_PROJECT --only storage`.
  Les comptes Google connectés peuvent lire les PNG dont le nom est une empreinte ;
  les clients ne peuvent ni lister, ni écrire, ni supprimer les objets.
- Configurer le CORS du bucket pour les origines de l’application, les méthodes
  `GET` et `HEAD`, et l’en-tête de réponse `Content-Type`, par exemple :

```json
[
  {
    "origin": ["https://YOUR_PROJECT.web.app", "https://YOUR_CUSTOM_DOMAIN"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

Appliquer ce fichier avec
`gcloud storage buckets update gs://YOUR_BUCKET --cors-file=cors.json`.
Les téléchargements Firebase utilisent l’identité du compte connecté, jamais une
URL publique avec jeton permanent.

Le compte WIF décrit dans [la publication du curriculum](curriculum-publication.md)
a également besoin de `storage.objects.create` et `storage.objects.get` sur **ce
bucket uniquement**, idéalement avec une condition IAM limitée au préfixe
`illustrations/`. Il n’a pas besoin de supprimer, modifier ni lister les objets.
Utiliser un rôle personnalisé contenant ces deux permissions ; ne pas accorder
Storage Admin au publisher.

Après fusion de la version publique du CLI, mettre à jour `CURRICULUM_CLI_REF` dans le
dépôt privé vers son SHA complet relu. Le workflow `curriculum:sync` existant n’a pas
besoin d’un fournisseur IA ni d’une clé API supplémentaire. La protection de `main`
et l’approbation humaine des PR doivent être activées dans le dépôt de contenu :
le CLI ne peut pas prouver à lui seul qu’une revue humaine a eu lieu.

Aucun bucket, droit IAM, réglage de facturation, règle distante ou variable GitHub
n’est créé ou modifié par ces commandes de préparation ni par les tests.

## Vérification

`npm run test:images` couvre le contrat, la préparation/réutilisation et la frontière
de téléversement, avec des images fictives. `npm test` inclut les parcours navigateur
mobile/PC, la reprise partielle, le cache hors ligne et les règles Storage dans les
émulateurs. Aucun appel IA payant ni upload de production n’est exécuté.
