# Cartographie RMFP interactive

Projet statique prêt à être déposé sur GitHub pour être hébergé gratuitement via GitHub Pages.

## Ce que fait le projet

- arborescence interactive : **Domaine fonctionnel → Famille → Emploi Référence → Métier FP**
- ouverture / repli des branches au clic
- barre de recherche simple
- panneau d’action au dernier niveau
- bouton **Visualiser** avec affichage du PDF dans une modale intégrée
- bouton **Télécharger**
- prise en charge future de la colonne `file_pdf`
- fallback automatique sur `pdf/sample.pdf` si `file_pdf` est vide

## Structure du projet

```text
.
├── .github/
│   └── workflows/
│       └── deploy.yml
├── data/
│   └── rmfp-data.json
├── pdf/
│   └── sample.pdf
├── scripts/
│   └── convert_excel_to_json.py
├── .gitignore
├── .nojekyll
├── index.html
├── script.js
├── styles.css
└── README.md
```

## Étape 1 — Préparer les PDF

Dépose tes fiches PDF dans le dossier `pdf/`.

Exemples de valeurs possibles dans la colonne Excel `file_pdf` :

```text
pdf/sample.pdf
pdf/fiche_er001.pdf
pdf/gestion_financiere.pdf
```

Le chemin doit être **relatif au site**.

## Étape 2 — Préparer le fichier Excel

Le script attend par défaut un fichier nommé :

```text
Correspondance RMFP.xlsx
```

Colonnes attendues :

- `Domaine fonctionnel`
- `Famille`
- `Intitulé Emploi Référence (ERxxxxxx)`
- `Intitulé Métier FPxxxxxx`
- `file_pdf` (optionnelle pour l’instant, mais déjà prévue)

La colonne `file_pdf` peut rester vide : le site utilisera alors automatiquement `pdf/sample.pdf`.

## Étape 3 — Générer le JSON

Depuis le dossier du projet :

```bash
python scripts/convert_excel_to_json.py
```

Si ton fichier Excel n’est pas à la racine ou porte un autre nom :

```bash
python scripts/convert_excel_to_json.py "mon_dossier/Correspondance RMFP.xlsx" "data/rmfp-data.json"
```

Tu peux aussi personnaliser le PDF de fallback :

```bash
python scripts/convert_excel_to_json.py "Correspondance RMFP.xlsx" "data/rmfp-data.json" --fallback-pdf "pdf/sample.pdf"
```

## Étape 4 — Tester localement

Comme le site charge un fichier JSON, il faut le lancer avec un petit serveur HTTP local.

```bash
python -m http.server 8000
```

Puis ouvre :

```text
http://localhost:8000
```

## Étape 5 — Déployer sur GitHub Pages

### Option recommandée
Le dépôt contient déjà un workflow GitHub Actions pour déployer automatiquement le site.

1. crée un dépôt GitHub
2. dépose tous les fichiers du projet
3. pousse sur la branche `main`
4. dans GitHub, active **Pages** avec la source **GitHub Actions**

Le site sera ensuite publié automatiquement.

### Option simple
Tu peux aussi héberger directement depuis la branche `main` si tu préfères, mais le workflow fourni est déjà prêt.

## Comportement actuel

- au chargement, seul le premier niveau est déplié
- cliquer sur un nœud intermédiaire ouvre ou replie la branche
- cliquer sur un **Métier FP** met à jour le panneau de droite
- le bouton **Visualiser** ouvre le PDF dans une modale intégrée
- le bouton **Télécharger** lance le téléchargement du même fichier

## Personnalisation rapide

### Modifier le titre de la racine
Dans `data/rmfp-data.json`, clé :

```json
"tree": {
  "name": "Cartographie RMFP"
}
```

### Modifier le PDF par défaut
Dans `data/rmfp-data.json` :

```json
"fallbackPdf": "pdf/sample.pdf"
```

### Modifier les couleurs / le style
Dans `styles.css`.

## Remarques importantes

- GitHub Pages est un hébergement **statique** : le fichier Excel n’est pas lu directement en ligne
- la bonne méthode est donc :
  1. convertir l’Excel en JSON
  2. commit/push le JSON généré
  3. publier le site
- le projet est déjà prêt pour faire pointer chaque feuille métier vers un PDF spécifique via la colonne `file_pdf`

## Prochaine évolution facile

Quand tu voudras brancher les vrais PDF, il suffira de renseigner la colonne `file_pdf` dans l’Excel avec les bons chemins. Aucun changement structurel du front ne sera nécessaire.
