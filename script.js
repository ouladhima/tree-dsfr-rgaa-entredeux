const DATA_URL = "data/rmfp-data.json";

const elements = {
  searchInput: document.getElementById("search-input"),
  searchStatus: document.getElementById("search-status"),
  searchResultsRegion: document.getElementById("search-results-region"),
  searchResults: document.getElementById("search-results"),
  clearSearchButton: document.getElementById("clear-search"),
  collapseAllButton: document.getElementById("collapse-all"),
  expandFirstLevelButton: document.getElementById("expand-first-level"),
  treeRoot: document.getElementById("tree-root"),
  datasetBadge: document.getElementById("dataset-badge"),
  selectionSummary: document.getElementById("selection-summary"),
  selectionState: document.getElementById("selection-state"),
  detailsEmpty: document.getElementById("details-empty"),
  detailsContent: document.getElementById("details-content"),
  detailPath: document.getElementById("detail-path"),
  detailLevel: document.getElementById("detail-level"),
  detailDomain: document.getElementById("detail-domain"),
  detailFamily: document.getElementById("detail-family"),
  detailEmployment: document.getElementById("detail-employment"),
  detailDocument: document.getElementById("detail-document"),
  detailOpenLink: document.getElementById("detail-open-link"),
  detailDownloadLink: document.getElementById("detail-download-link"),
  detailPdfNote: document.getElementById("detail-pdf-note"),
};

const state = {
  root: null,
  records: [],
  fallbackPdf: "pdf/sample.pdf",
  nodesById: new Map(),
  expandedIds: new Set(),
  selectedId: null,
  searchMatches: [],
  searchQuery: "",
};

bindUi();
init().catch(handleInitError);

function bindUi() {
  elements.searchInput.addEventListener("input", onSearchInput);
  elements.searchInput.addEventListener("keydown", onSearchKeyDown);
  elements.clearSearchButton.addEventListener("click", clearSearch);
  elements.collapseAllButton.addEventListener("click", () => collapseAll());
  elements.expandFirstLevelButton.addEventListener("click", () => expandFirstLevel());
  elements.treeRoot.addEventListener("click", onTreeClick);
  elements.searchResults.addEventListener("click", onSearchResultClick);
}

async function init() {
  setBadge("Chargement", "info");
  updateStatus("Chargement des donnees...");

  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Chargement impossible : ${response.status}`);
  }

  const dataset = await response.json();
  prepareDataset(dataset);
  collapseAll(false);
  render();
  setBadge(`${state.records.length} fiches`, "success");
  updateStatus(getDefaultStatusText());
}

function prepareDataset(dataset) {
  state.fallbackPdf = dataset.fallbackPdf || dataset.meta?.fallback_pdf || state.fallbackPdf;
  state.nodesById = new Map();
  state.root = annotateNode(dataset.tree, null);
  state.records = (dataset.records || []).map((record) => {
    const node = state.nodesById.get(record.id);
    const path = Array.isArray(node?.path)
      ? node.path
      : Array.isArray(record.path)
        ? record.path
        : [];

    return {
      ...record,
      path,
      _search: normalizeText(
        [
          record.domaine_fonctionnel,
          record.famille,
          record.intitule_er,
          record.intitule_metier_fp,
          path.join(" "),
        ].join(" ")
      ),
    };
  });
}

function annotateNode(node, parent) {
  const children = Array.isArray(node.children) ? node.children : [];
  const annotatedNode = {
    ...node,
    parentId: parent ? parent.id : null,
    path: parent ? [...parent.path, node.name] : [node.name],
    children: [],
  };

  state.nodesById.set(annotatedNode.id, annotatedNode);

  annotatedNode.children = children.map((child) => annotateNode(child, annotatedNode));
  annotatedNode.leafCount =
    annotatedNode.children.length > 0
      ? annotatedNode.children.reduce((count, child) => count + child.leafCount, 0)
      : 1;

  return annotatedNode;
}

function onSearchInput(event) {
  const rawQuery = String(event.target.value || "").trim();
  state.searchQuery = rawQuery;

  if (!rawQuery) {
    state.searchMatches = [];
    renderSearchResults();
    updateStatus(getDefaultStatusText());
    return;
  }

  const query = normalizeText(rawQuery);
  state.searchMatches = state.records.filter((record) => record._search.includes(query)).slice(0, 8);
  renderSearchResults();

  if (state.searchMatches.length) {
    updateStatus(`${state.searchMatches.length} resultat(s) affiche(s) pour "${rawQuery}".`);
  } else {
    updateStatus(`Aucun resultat pour "${rawQuery}".`);
  }
}

function onSearchKeyDown(event) {
  if (event.key === "Escape" && state.searchQuery) {
    clearSearch();
    return;
  }

  if (event.key === "Enter" && state.searchMatches.length > 0) {
    event.preventDefault();
    selectRecord(state.searchMatches[0], { updateSearchField: true });
  }
}

function renderSearchResults() {
  elements.searchResults.innerHTML = "";

  if (!state.searchQuery) {
    elements.searchResultsRegion.hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();

  if (state.searchMatches.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "rmfp-result-item rmfp-result-item--empty";
    emptyItem.textContent = "Aucun resultat. Essayez un autre mot-cle.";
    fragment.appendChild(emptyItem);
  } else {
    state.searchMatches.forEach((record) => {
      const item = document.createElement("li");
      item.className = "rmfp-result-item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "rmfp-result-button";
      button.dataset.recordId = record.id;

      const title = document.createElement("span");
      title.className = "rmfp-result-title";
      title.textContent = record.intitule_metier_fp;

      const path = document.createElement("span");
      path.className = "rmfp-result-path";
      path.textContent = record.path.join(" \u2192 ");

      button.appendChild(title);
      button.appendChild(path);
      item.appendChild(button);
      fragment.appendChild(item);
    });
  }

  elements.searchResults.appendChild(fragment);
  elements.searchResultsRegion.hidden = false;
}

function onSearchResultClick(event) {
  const button = event.target.closest("button[data-record-id]");
  if (!button) {
    return;
  }

  const record = state.records.find((item) => item.id === button.dataset.recordId);
  if (!record) {
    return;
  }

  selectRecord(record, { updateSearchField: true });
}

function selectRecord(record, options = {}) {
  const node = state.nodesById.get(record.id);
  if (!node) {
    return;
  }

  expandPathToNode(node);
  state.selectedId = node.id;
  hideSearchResults();

  if (options.updateSearchField) {
    elements.searchInput.value = record.intitule_metier_fp;
  }

  render({ focusElementId: getLeafButtonId(node.id) });
  updateStatus(`Metier selectionne : ${node.name}.`);
}

function onTreeClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const node = state.nodesById.get(button.dataset.nodeId);
  if (!node) {
    return;
  }

  if (button.dataset.action === "toggle") {
    toggleBranch(node);
    return;
  }

  if (button.dataset.action === "select") {
    state.selectedId = node.id;
    hideSearchResults();
    render({ focusElementId: getLeafButtonId(node.id) });
    updateStatus(`Metier selectionne : ${node.name}.`);
  }
}

function toggleBranch(node) {
  const isExpanded = state.expandedIds.has(node.id);

  if (isExpanded) {
    state.expandedIds.delete(node.id);
    if (state.selectedId && isNodeInBranch(state.nodesById.get(state.selectedId), node)) {
      state.selectedId = null;
    }
    render({ focusElementId: getToggleButtonId(node.id) });
    updateStatus(`Branche repliee : ${node.name}.`);
    return;
  }

  state.expandedIds.add(node.id);
  render({ focusElementId: getToggleButtonId(node.id) });
  updateStatus(`Branche deployee : ${node.name}.`);
}

function collapseAll(refresh = true) {
  state.expandedIds.clear();
  state.selectedId = null;

  if (refresh) {
    render();
    updateStatus(getDefaultStatusText());
  }
}

function expandFirstLevel(refresh = true) {
  state.expandedIds.clear();
  state.selectedId = null;

  (state.root?.children || []).forEach((child) => {
    if (hasChildren(child)) {
      state.expandedIds.add(child.id);
    }
  });

  if (refresh) {
    render();
    updateStatus("Le premier niveau de la cartographie a ete deploye.");
  }
}

function expandPathToNode(node) {
  let current = node;
  while (current && current.parentId) {
    const parent = state.nodesById.get(current.parentId);
    if (parent && parent.id !== state.root.id) {
      state.expandedIds.add(parent.id);
    }
    current = parent;
  }
}

function render(options = {}) {
  renderTree();
  renderDetails();

  if (options.focusElementId) {
    focusElement(options.focusElementId);
  }
}

function renderTree() {
  elements.treeRoot.innerHTML = "";

  const children = state.root?.children || [];
  if (children.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "rmfp-empty-state";
    emptyItem.textContent = "Aucune donnee n'est disponible pour la cartographie.";
    elements.treeRoot.appendChild(emptyItem);
    return;
  }

  const fragment = document.createDocumentFragment();
  children.forEach((node) => {
    fragment.appendChild(createTreeItem(node));
  });

  elements.treeRoot.appendChild(fragment);
}

function createTreeItem(node) {
  const item = document.createElement("li");
  item.className = `rmfp-tree-item rmfp-tree-item--${sanitizeLevel(node.level)}`;

  const button = document.createElement("button");
  const isBranch = hasChildren(node);
  const isExpanded = state.expandedIds.has(node.id);
  const isSelected = state.selectedId === node.id;

  button.type = "button";
  button.dataset.nodeId = node.id;
  button.dataset.action = isBranch ? "toggle" : "select";
  button.id = isBranch ? getToggleButtonId(node.id) : getLeafButtonId(node.id);
  button.className = isBranch ? "rmfp-branch-toggle" : "rmfp-leaf-button";

  if (isBranch) {
    button.setAttribute("aria-expanded", String(isExpanded));
  } else {
    button.setAttribute("aria-pressed", String(isSelected));
  }

  const marker = document.createElement("span");
  marker.className = "rmfp-node-marker";
  marker.setAttribute("aria-hidden", "true");
  marker.textContent = isBranch ? (isExpanded ? "\u2212" : "+") : "\u2022";

  const text = document.createElement("span");
  text.className = "rmfp-node-text";

  const label = document.createElement("span");
  label.className = "rmfp-node-label";
  label.textContent = node.name;

  const meta = document.createElement("span");
  meta.className = "rmfp-node-meta";
  meta.textContent = getNodeMeta(node);

  text.appendChild(label);
  text.appendChild(meta);

  button.appendChild(marker);
  button.appendChild(text);
  item.appendChild(button);

  if (isBranch && isExpanded) {
    const childrenList = document.createElement("ul");
    childrenList.className = "rmfp-tree-list rmfp-tree-list--nested";
    node.children.forEach((child) => {
      childrenList.appendChild(createTreeItem(child));
    });
    item.appendChild(childrenList);
  }

  return item;
}

function renderDetails() {
  const node = state.selectedId ? state.nodesById.get(state.selectedId) : null;

  if (!node) {
    elements.selectionSummary.textContent =
      "Selectionnez un metier FP dans l'arborescence ou via la recherche.";
    elements.selectionState.textContent = "Aucune selection";
    elements.selectionState.className = "fr-badge rmfp-badge rmfp-badge--neutral fr-mb-0";
    elements.detailsEmpty.classList.remove("hidden");
    elements.detailsContent.classList.add("hidden");
    return;
  }

  const pdfPath = resolvePdfPath(node.file_pdf);
  const dedicatedPdf = hasDedicatedPdf(node);

  elements.selectionSummary.textContent = `Metier selectionne : ${node.name}.`;
  elements.selectionState.textContent = dedicatedPdf ? "Fiche dediee" : "Fiche standard";
  elements.selectionState.className = dedicatedPdf
    ? "fr-badge rmfp-badge rmfp-badge--success fr-mb-0"
    : "fr-badge rmfp-badge rmfp-badge--info fr-mb-0";

  elements.detailPath.textContent = node.path.join(" \u2192 ");
  elements.detailLevel.textContent = "Metier FP";
  elements.detailDomain.textContent = node.path[1] || "Non renseigne";
  elements.detailFamily.textContent = node.path[2] || "Non renseignee";
  elements.detailEmployment.textContent = node.path[3] || "Non renseigne";
  elements.detailDocument.textContent = `${extractFileName(pdfPath)} (${dedicatedPdf ? "fichier specifique" : "fichier standard"})`;
  elements.detailOpenLink.href = encodeUriSafe(pdfPath);
  elements.detailDownloadLink.href = encodeUriSafe(pdfPath);
  elements.detailDownloadLink.setAttribute("download", extractFileName(pdfPath));
  elements.detailPdfNote.textContent =
    "Le document PDF s'ouvre dans un nouvel onglet. Ces PDF ne sont pas inclus dans la premiere declaration d'accessibilite du service web.";

  elements.detailsEmpty.classList.add("hidden");
  elements.detailsContent.classList.remove("hidden");
}

function handleInitError(error) {
  console.error(error);
  setBadge("Erreur", "error");
  updateStatus("Impossible de charger les donnees JSON.");
  elements.searchInput.disabled = true;
  elements.clearSearchButton.disabled = true;
  elements.collapseAllButton.disabled = true;
  elements.expandFirstLevelButton.disabled = true;
  elements.treeRoot.innerHTML = "";

  const errorItem = document.createElement("li");
  errorItem.className = "rmfp-empty-state";
  errorItem.textContent =
    "Le chargement des donnees a echoue. Verifiez le serveur HTTP local et le fichier data/rmfp-data.json.";
  elements.treeRoot.appendChild(errorItem);
}

function clearSearch() {
  elements.searchInput.value = "";
  hideSearchResults();
  updateStatus(getDefaultStatusText());
}

function hideSearchResults() {
  state.searchQuery = "";
  state.searchMatches = [];
  renderSearchResults();
}

function setBadge(text, kind) {
  elements.datasetBadge.textContent = text;
  elements.datasetBadge.className = `fr-badge rmfp-badge rmfp-badge--${kind} fr-mb-0`;
}

function updateStatus(message) {
  elements.searchStatus.textContent = message;
}

function getDefaultStatusText() {
  return `${state.records.length} fiche(s) disponible(s). Ouvrez une branche puis selectionnez un metier FP pour afficher la fiche associee.`;
}

function getNodeMeta(node) {
  const level = getCompactLevelLabel(node);
  if (hasChildren(node)) {
    return `${level} \u00b7 ${node.leafCount} metier(s)`;
  }

  return `${level} \u00b7 ${hasDedicatedPdf(node) ? "fiche dediee" : "fiche standard"}`;
}

function getCompactLevelLabel(node) {
  switch (node.level) {
    case "domaine":
      return "Domaine";
    case "famille":
      return "Famille";
    case "emploi_reference":
      return "ER";
    case "metier_fp":
      return "Metier FP";
    default:
      return "Niveau";
  }
}

function hasDedicatedPdf(node) {
  return Boolean(node.file_pdf && String(node.file_pdf).trim() && node.file_pdf !== state.fallbackPdf);
}

function hasChildren(node) {
  return Array.isArray(node.children) && node.children.length > 0;
}

function isNodeInBranch(node, branch) {
  let current = node;

  while (current) {
    if (current.id === branch.id) {
      return true;
    }

    current = current.parentId ? state.nodesById.get(current.parentId) : null;
  }

  return false;
}

function resolvePdfPath(filePdf) {
  return filePdf && String(filePdf).trim() ? String(filePdf).trim() : state.fallbackPdf;
}

function encodeUriSafe(path) {
  return /^(https?:)?\/\//i.test(path) ? path : encodeURI(path);
}

function extractFileName(path) {
  return String(path || "").split(/[\\/]/).pop() || "document.pdf";
}

function getToggleButtonId(nodeId) {
  return `toggle-${nodeId}`;
}

function getLeafButtonId(nodeId) {
  return `leaf-${nodeId}`;
}

function focusElement(elementId) {
  window.requestAnimationFrame(() => {
    const element = document.getElementById(elementId);
    if (!element) {
      return;
    }

    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
    }

    element.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  });
}

function sanitizeLevel(value) {
  return String(value || "unknown").replace(/[^a-z0-9_-]/gi, "_");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
