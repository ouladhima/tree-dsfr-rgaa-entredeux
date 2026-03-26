# Cartographie RMFP - version DSFR / RGAA

Site statique de consultation de la cartographie RMFP avec :

- shell DSFR local vendore dans `dsfr/`
- navigation HTML accessible pour l'usage conforme
- vue graphique horizontale SVG/D3 synchronisee avec la navigation HTML
- recherche metier / domaine / famille / ER
- pages reglementaires RGAA

## Points clefs

- source de donnees unique : `data/rmfp-data.json`
- aucun framework
- aucun build step
- dependance front retiree : plus de Google Fonts, plus de CDN
- D3 charge localement depuis `vendor/d3.min.js`
- PDF exposes par liens standards "ouvrir" et "telecharger"
- la vue HTML reste la reference pour l'accessibilite; le SVG est une visualisation secondaire

## Structure

```text
.
|-- accessibilite/
|   `-- index.html
|-- data/
|   |-- Correspondance RMFP.xlsx
|   `-- rmfp-data.json
|-- dsfr/
|   |-- dsfr.min.css
|   |-- dsfr.module.min.js
|   |-- dsfr.nomodule.min.js
|   |-- favicon/
|   |-- fonts/
|   |-- icons/
|   `-- utility/
|-- mentions-legales/
|   `-- index.html
|-- pdf/
|   `-- sample.pdf
|-- plan-actions/
|   `-- index.html
|-- plan-du-site/
|   `-- index.html
|-- schema-pluriannuel/
|   `-- index.html
|-- scripts/
|   `-- convert_excel_to_json.py
|-- vendor/
|   `-- d3.min.js
|-- index.html
|-- script.js
|-- styles.css
`-- README.md
```

## Lancer le site en local

Le JSON est charge via HTTP. Il faut donc lancer un serveur local.

```bash
python -m http.server 8000
```

Puis ouvrir :

```text
http://localhost:8000
```

## Donnees

Le contrat JSON n'a pas ete change :

- `tree`
- `records`
- `fallbackPdf`
- `file_pdf`

Le script Python existant peut toujours regenerer `data/rmfp-data.json` depuis l'Excel.

## Pages disponibles

- `/`
- `/accessibilite/`
- `/schema-pluriannuel/`
- `/plan-actions/`
- `/plan-du-site/`
- `/mentions-legales/`

La page d'accueil combine maintenant :

- une vue graphique horizontale SVG/D3 pour la lecture d'ensemble
- une navigation structuree HTML pour la navigation accessible et les actions
- un panneau de detail pour les liens PDF

## Accessibilite

La page `accessibilite/` publie l'etat initial :

- `Accessibilite : non conforme`

Important :

- les pages reglementaires contiennent encore des zones `[A COMPLETER AVANT PUBLICATION]`
- les PDF lies depuis la cartographie ne sont pas inclus dans cette premiere declaration
- un audit RGAA complet reste a conduire avant publication officielle

## Mise a jour du DSFR

Les assets DSFR ont ete vendorises localement depuis le package officiel `@gouvfr/dsfr`.

Si tu veux mettre a jour le bundle plus tard, le principe reste :

1. recuperer la version officielle du package
2. remplacer le contenu du dossier `dsfr/`
3. verifier le rendu des pages et des composants utilises

## Publication

Avant toute mise en ligne officielle, il faut au minimum :

1. completer les mentions legales
2. completer le schema pluriannuel
3. completer le plan d'actions
4. renseigner le vrai contact accessibilite
5. auditer le site web
6. qualifier les PDF ou fournir une alternative accessible
