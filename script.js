const DATA_URL = "data/rmfp-data.json";
const GRAPH_SETTINGS = {
  margin: { top: 40, right: 48, bottom: 40, left: 20 },
  nodeHeight: 86,
  horizontalGap: 290,
  verticalGap: 104,
  rootWidth: 220,
  branchWidth: 250,
  leafWidth: 320,
};

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
  graphShell: document.getElementById("graph-shell"),
  graphSvg: document.getElementById("graph-svg"),
  graphEmpty: document.getElementById("graph-empty"),
  recenterGraphButton: document.getElementById("recenter-graph"),
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
  elements.recenterGraphButton.addEventListener("click", recenterGraphOnCurrentTarget);
  elements.treeRoot.addEventListener("click", onTreeClick);
  elements.searchResults.addEventListener("click", onSearchResultClick);
  window.addEventListener("resize", onWindowResize);
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
  render({ centerNodeId: getDefaultGraphTargetId() });
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
  hideSearchResults();

  if (options.updateSearchField) {
    elements.searchInput.value = record.intitule_metier_fp;
  }

  selectNode(node, {
    focusElementId: getLeafButtonId(node.id),
    centerNodeId: node.id,
  });
}

function selectNode(node, options = {}) {
  state.selectedId = node.id;
  render({
    focusElementId: options.focusElementId || null,
    centerNodeId: options.centerNodeId || node.id,
  });
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
    toggleBranch(node, {
      focusElementId: getToggleButtonId(node.id),
      centerNodeId: node.id,
    });
    return;
  }

  if (button.dataset.action === "select") {
    hideSearchResults();
    selectNode(node, {
      focusElementId: getLeafButtonId(node.id),
      centerNodeId: node.id,
    });
  }
}

function toggleBranch(node, options = {}) {
  const isExpanded = state.expandedIds.has(node.id);

  if (isExpanded) {
    state.expandedIds.delete(node.id);
    if (state.selectedId && isNodeInBranch(state.nodesById.get(state.selectedId), node)) {
      state.selectedId = null;
    }
    render({
      focusElementId: options.focusElementId || null,
      centerNodeId: options.centerNodeId || node.id,
    });
    updateStatus(`Branche repliee : ${node.name}.`);
    return;
  }

  state.expandedIds.add(node.id);
  render({
    focusElementId: options.focusElementId || null,
    centerNodeId: options.centerNodeId || node.id,
  });
  updateStatus(`Branche deployee : ${node.name}.`);
}

function collapseAll(refresh = true) {
  state.expandedIds.clear();
  state.selectedId = null;

  if (refresh) {
    render({ centerNodeId: getDefaultGraphTargetId() });
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
    render({ centerNodeId: getDefaultGraphTargetId() });
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
  renderGraph();

  if (options.focusElementId) {
    focusElement(options.focusElementId);
  }

  if (options.centerNodeId) {
    centerGraphOnNode(options.centerNodeId);
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

function renderGraph() {
  const graphUnavailable = typeof window.d3 === "undefined" || !state.root;
  elements.graphEmpty.hidden = !graphUnavailable;
  elements.graphShell.hidden = graphUnavailable;
  elements.recenterGraphButton.disabled = graphUnavailable;

  if (graphUnavailable) {
    elements.graphSvg.innerHTML = "";
    return;
  }

  const hierarchy = createVisibleHierarchy();
  const allNodes = hierarchy.descendants();
  const nodes = allNodes.filter((node) => node.depth > 0);
  const links = hierarchy.links().filter((link) => link.source.depth > 0);

  if (nodes.length === 0) {
    elements.graphEmpty.hidden = false;
    elements.graphShell.hidden = true;
    elements.recenterGraphButton.disabled = true;
    elements.graphSvg.innerHTML = "";
    return;
  }

  const treeLayout = d3.tree().nodeSize([GRAPH_SETTINGS.verticalGap, GRAPH_SETTINGS.horizontalGap]);
  treeLayout(hierarchy);

  const top = d3.min(nodes, (node) => node.x) ?? 0;
  const bottom = d3.max(nodes, (node) => node.x) ?? 0;
  const maxRenderedX =
    d3.max(nodes, (node) => getGraphNodeX(node) + getGraphNodeWidth(node.data)) ?? 0;

  const width = Math.max(
    elements.graphShell.clientWidth,
    GRAPH_SETTINGS.margin.left + maxRenderedX + GRAPH_SETTINGS.margin.right
  );
  const height = Math.max(
    340,
    bottom - top + GRAPH_SETTINGS.margin.top + GRAPH_SETTINGS.margin.bottom + GRAPH_SETTINGS.nodeHeight
  );
  const verticalOffset = GRAPH_SETTINGS.margin.top - top;
  const selectedPathIds = getSelectedPathIds();

  const svg = d3.select(elements.graphSvg);
  svg.selectAll("*").remove();
  svg.attr("width", width).attr("height", height).attr("viewBox", [0, 0, width, height]);

  const rootGroup = svg
    .append("g")
    .attr("transform", `translate(${GRAPH_SETTINGS.margin.left}, ${verticalOffset})`);

  rootGroup
    .selectAll("path.rmfp-graph-link")
    .data(links, (link) => link.target.data.id)
    .enter()
    .append("path")
    .attr("class", (link) => {
      const classes = ["rmfp-graph-link"];
      if (selectedPathIds.has(link.source.data.id) && selectedPathIds.has(link.target.data.id)) {
        classes.push("is-path");
      }
      return classes.join(" ");
    })
    .attr("d", (link) => graphLinkPath(link));

  const nodeSelection = rootGroup
    .selectAll("g.rmfp-graph-node")
    .data(nodes, (node) => node.data.id)
    .enter()
    .append("g")
    .attr("id", (node) => getGraphNodeId(node.data.id))
    .attr("class", (node) => getGraphNodeClass(node, selectedPathIds))
    .attr("transform", (node) => `translate(${getGraphNodeX(node)}, ${node.x})`)
    .style("cursor", "pointer")
    .on("click", (event, node) => {
      event.preventDefault();
      onGraphNodeClick(node.data);
    });

  nodeSelection
    .append("rect")
    .attr("x", 0)
    .attr("y", -GRAPH_SETTINGS.nodeHeight / 2)
    .attr("rx", 18)
    .attr("ry", 18)
    .attr("width", (node) => getGraphNodeWidth(node.data))
    .attr("height", GRAPH_SETTINGS.nodeHeight);

  nodeSelection
    .append("text")
    .attr("class", "rmfp-graph-title")
    .attr("x", 18)
    .attr("y", -12);

  nodeSelection
    .append("text")
    .attr("class", "rmfp-graph-subtitle")
    .attr("x", 18)
    .attr("y", 24)
    .text((node) => getNodeMeta(node.data));

  nodeSelection.each(function renderGraphText(node) {
    const titleText = d3.select(this).select(".rmfp-graph-title");
    titleText.selectAll("tspan").remove();
    wrapSvgText(titleText, node.data.name, getGraphNodeWidth(node.data) - 36, 2);
  });
}

function createVisibleHierarchy() {
  return d3.hierarchy(state.root, (node) => {
    if (!hasChildren(node)) {
      return null;
    }

    if (node.id === state.root.id || state.expandedIds.has(node.id)) {
      return node.children;
    }

    return null;
  });
}

function onGraphNodeClick(node) {
  if (hasChildren(node)) {
    toggleBranch(node, { centerNodeId: node.id });
    return;
  }

  hideSearchResults();
  selectNode(node, { centerNodeId: node.id });
}

function onWindowResize() {
  if (typeof window.d3 === "undefined" || !state.root) {
    return;
  }

  window.requestAnimationFrame(() => {
    renderGraph();
    recenterGraphOnCurrentTarget();
  });
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
  elements.recenterGraphButton.disabled = true;
  elements.graphEmpty.hidden = false;
  elements.graphShell.hidden = true;
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
    case "root":
      return "Vue";
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

function getSelectedPathIds() {
  const ids = new Set();
  let current = state.selectedId ? state.nodesById.get(state.selectedId) : null;

  while (current) {
    ids.add(current.id);
    current = current.parentId ? state.nodesById.get(current.parentId) : null;
  }

  return ids;
}

function getGraphNodeClass(node, selectedPathIds) {
  const classes = ["rmfp-graph-node", `rmfp-graph-node--${sanitizeLevel(node.data.level)}`];

  if (selectedPathIds.has(node.data.id)) {
    classes.push("is-path");
  }

  if (state.selectedId === node.data.id) {
    classes.push("is-selected");
  }

  if (!hasChildren(node.data)) {
    classes.push("is-leaf");
  }

  return classes.join(" ");
}

function getGraphNodeWidth(node) {
  if (node.level === "root") {
    return GRAPH_SETTINGS.rootWidth;
  }

  if (!hasChildren(node)) {
    return GRAPH_SETTINGS.leafWidth;
  }

  return GRAPH_SETTINGS.branchWidth;
}

function getGraphNodeX(node) {
  return Math.max(0, node.y - GRAPH_SETTINGS.horizontalGap);
}

function graphLinkPath(link) {
  const sourceX = getGraphNodeX(link.source) + getGraphNodeWidth(link.source.data);
  const sourceY = link.source.x;
  const targetX = getGraphNodeX(link.target);
  const targetY = link.target.x;
  const delta = Math.max(36, (targetX - sourceX) / 2);
  const bendX = sourceX + delta;

  return `M${sourceX},${sourceY} H${bendX} C${bendX + 18},${sourceY} ${bendX + 18},${targetY} ${targetX},${targetY}`;
}

function wrapSvgText(textSelection, text, width, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) {
    return;
  }

  const x = Number(textSelection.attr("x")) || 0;
  const measurement = textSelection
    .append("tspan")
    .attr("x", x)
    .attr("dy", 0)
    .style("visibility", "hidden");
  const lines = [];
  let index = 0;

  while (index < words.length && lines.length < maxLines) {
    let line = words[index];
    index += 1;

    while (index < words.length) {
      const candidate = `${line} ${words[index]}`;
      measurement.text(candidate);
      if (measurement.node().getComputedTextLength() > width) {
        break;
      }
      line = candidate;
      index += 1;
    }

    lines.push(line);
  }

  if (index < words.length) {
    const remainingText = `${lines.pop() || ""} ${words.slice(index).join(" ")}`.trim();
    lines.push(truncateSvgText(measurement, remainingText, width));
  }

  measurement.remove();

  lines.forEach((line, lineIndex) => {
    textSelection
      .append("tspan")
      .attr("x", x)
      .attr("dy", lineIndex === 0 ? "0em" : "1.16em")
      .text(line);
  });
}

function truncateSvgText(measurementSelection, text, width) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return "";
  }

  measurementSelection.text(normalized);
  if (measurementSelection.node().getComputedTextLength() <= width) {
    return normalized;
  }

  let shortened = normalized;
  while (shortened.length > 1) {
    shortened = shortened.slice(0, -1).trimEnd();
    measurementSelection.text(`${shortened}...`);
    if (measurementSelection.node().getComputedTextLength() <= width) {
      return `${shortened}...`;
    }
  }

  return "...";
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

function getGraphNodeId(nodeId) {
  return `graph-node-${nodeId}`;
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

function centerGraphOnNode(nodeId) {
  window.requestAnimationFrame(() => {
    if (elements.graphShell.hidden) {
      return;
    }

    const nodeElement = nodeId ? document.getElementById(getGraphNodeId(nodeId)) : null;
    if (!nodeElement) {
      return;
    }

    const shellRect = elements.graphShell.getBoundingClientRect();
    const nodeRect = nodeElement.getBoundingClientRect();
    const nextLeft =
      elements.graphShell.scrollLeft +
      (nodeRect.left - shellRect.left) -
      (elements.graphShell.clientWidth / 2 - nodeRect.width / 2);
    const nextTop =
      elements.graphShell.scrollTop +
      (nodeRect.top - shellRect.top) -
      (elements.graphShell.clientHeight / 2 - nodeRect.height / 2);

    elements.graphShell.scrollTo({
      left: Math.max(0, nextLeft),
      top: Math.max(0, nextTop),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  });
}

function recenterGraphOnCurrentTarget() {
  const targetId = state.selectedId || getDefaultGraphTargetId();
  if (targetId) {
    centerGraphOnNode(targetId);
  }
}

function getDefaultGraphTargetId() {
  return state.root?.children?.[0]?.id || null;
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
