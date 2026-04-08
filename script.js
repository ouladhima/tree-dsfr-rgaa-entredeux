const DATA_URL = "data/rmfp-data.json";
const GRAPH_SETTINGS = {
  margin: { top: 88, right: 72, bottom: 72, left: 32 },
  nodeHeight: 104,
  horizontalGap: 294,
  verticalGap: 128,
  overlayGap: 24,
  rootWidth: 220,
  branchWidth: 264,
  leafWidth: 344,
};
const GRAPH_COLUMNS = [
  { depth: 1, label: "Domaine fonctionnel" },
  { depth: 2, label: "Famille" },
  { depth: 3, label: "Emploi de r\u00e9f\u00e9rence" },
  { depth: 4, label: "M\u00e9tier FP" },
];

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
  graphStage: document.getElementById("graph-stage"),
  graphSvg: document.getElementById("graph-svg"),
  graphEmpty: document.getElementById("graph-empty"),
  graphOverlay: document.getElementById("graph-overlay"),
  graphOverlayBadge: document.getElementById("graph-overlay-badge"),
  graphOverlayTitle: document.getElementById("graph-overlay-title"),
  graphOverlayPath: document.getElementById("graph-overlay-path"),
  graphOffersCount: document.getElementById("graph-offers-count"),
  graphOffersShare: document.getElementById("graph-offers-share"),
  graphOpenLink: document.getElementById("graph-open-link"),
  graphDownloadLink: document.getElementById("graph-download-link"),
  recenterGraphButton: document.getElementById("recenter-graph"),
};

const state = {
  root: null,
  records: [],
  fallbackPdf: "pdf/sample.pdf",
  nodesById: new Map(),
  expandedIds: new Set(),
  selectedId: null,
  graphOverlayNodeId: null,
  searchMatches: [],
  searchQuery: "",
  graphLayout: {
    width: 0,
    height: 0,
    nodeFrames: new Map(),
  },
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
  document.addEventListener("click", onDocumentClick);
  window.addEventListener("resize", onWindowResize);
}

async function init() {
  setBadge("Chargement", "info");
  updateStatus("Chargement des donn\u00e9es...");

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
    updateStatus(`${state.searchMatches.length} r\u00e9sultat(s) affich\u00e9(s) pour "${rawQuery}".`);
  } else {
    updateStatus(`Aucun r\u00e9sultat pour "${rawQuery}".`);
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
    emptyItem.textContent = "Aucun r\u00e9sultat. Essayez un autre mot-cl\u00e9.";
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
  state.graphOverlayNodeId = options.graphOverlayNodeId || null;
  render({
    focusElementId: options.focusElementId || null,
    centerNodeId: options.centerNodeId || node.id,
  });
  updateStatus(`M\u00e9tier s\u00e9lectionn\u00e9 : ${node.name}.`);
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
  state.graphOverlayNodeId = null;
  const isExpanded = state.expandedIds.has(node.id);

  if (isExpanded) {
    state.expandedIds.delete(node.id);
    if (state.selectedId && isNodeInBranch(state.nodesById.get(state.selectedId), node)) {
      state.selectedId = null;
      state.graphOverlayNodeId = null;
    }
    render({
      focusElementId: options.focusElementId || null,
      centerNodeId: options.centerNodeId || node.id,
    });
    updateStatus(`Branche repli\u00e9e : ${node.name}.`);
    return;
  }

  state.expandedIds.add(node.id);
  render({
    focusElementId: options.focusElementId || null,
    centerNodeId: options.centerNodeId || node.id,
  });
  updateStatus(`Branche d\u00e9ploy\u00e9e : ${node.name}.`);
}

function collapseAll(refresh = true) {
  state.expandedIds.clear();
  state.selectedId = null;
  state.graphOverlayNodeId = null;

  if (refresh) {
    render({ centerNodeId: getDefaultGraphTargetId() });
    updateStatus(getDefaultStatusText());
  }
}

function expandFirstLevel(refresh = true) {
  state.expandedIds.clear();
  state.selectedId = null;
  state.graphOverlayNodeId = null;

  (state.root?.children || []).forEach((child) => {
    if (hasChildren(child)) {
      state.expandedIds.add(child.id);
    }
  });

  if (refresh) {
    render({ centerNodeId: getDefaultGraphTargetId() });
    updateStatus("Le premier niveau de la cartographie a \u00e9t\u00e9 d\u00e9ploy\u00e9.");
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
  renderGraphOverlay();

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
    emptyItem.textContent = "Aucune donn\u00e9e n'est disponible pour la cartographie.";
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
    state.graphLayout = { width: 0, height: 0, nodeFrames: new Map() };
    elements.graphStage.style.width = "";
    elements.graphStage.style.height = "";
    elements.graphSvg.innerHTML = "";
    hideGraphOverlay();
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
    state.graphLayout = { width: 0, height: 0, nodeFrames: new Map() };
    elements.graphStage.style.width = "";
    elements.graphStage.style.height = "";
    elements.graphSvg.innerHTML = "";
    hideGraphOverlay();
    return;
  }

  const treeLayout = d3.tree().nodeSize([GRAPH_SETTINGS.verticalGap, GRAPH_SETTINGS.horizontalGap]);
  treeLayout(hierarchy);

  const topEdge = d3.min(nodes, (node) => node.x - GRAPH_SETTINGS.nodeHeight / 2) ?? 0;
  const bottomEdge = d3.max(nodes, (node) => node.x + GRAPH_SETTINGS.nodeHeight / 2) ?? 0;
  const maxRenderedX =
    d3.max(nodes, (node) => getGraphNodeX(node) + getGraphNodeWidth(node.data)) ?? 0;

  const width = Math.max(
    elements.graphShell.clientWidth - 2,
    GRAPH_SETTINGS.margin.left + maxRenderedX + GRAPH_SETTINGS.margin.right
  );
  const height = Math.max(
    420,
    Math.ceil(bottomEdge - topEdge + GRAPH_SETTINGS.margin.top + GRAPH_SETTINGS.margin.bottom)
  );
  const verticalOffset = GRAPH_SETTINGS.margin.top - topEdge;
  const selectedPathIds = getSelectedPathIds();
  const nodeFrames = new Map();

  const svg = d3.select(elements.graphSvg);
  svg.selectAll("*").remove();
  svg.attr("width", width).attr("height", height).attr("viewBox", [0, 0, width, height]);
  elements.graphStage.style.width = `${width}px`;
  elements.graphStage.style.height = `${height}px`;
  state.graphLayout = { width, height, nodeFrames };

  buildGraphDefs(svg);
  renderGraphColumns(svg, height, nodes);

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
      event.stopPropagation();
      onGraphNodeClick(node.data);
    });

  nodeSelection.each((node) => {
    nodeFrames.set(node.data.id, {
      x: GRAPH_SETTINGS.margin.left + getGraphNodeX(node),
      y: verticalOffset + node.x - GRAPH_SETTINGS.nodeHeight / 2,
      width: getGraphNodeWidth(node.data),
      height: GRAPH_SETTINGS.nodeHeight,
    });
  });

  nodeSelection
    .append("rect")
    .attr("class", "rmfp-graph-card")
    .attr("x", 0)
    .attr("y", -GRAPH_SETTINGS.nodeHeight / 2)
    .attr("rx", 18)
    .attr("ry", 18)
    .attr("width", (node) => getGraphNodeWidth(node.data))
    .attr("height", GRAPH_SETTINGS.nodeHeight)
    .attr("filter", "url(#rmfp-graph-shadow)");

  nodeSelection
    .append("rect")
    .attr("class", "rmfp-graph-accent")
    .attr("x", 0)
    .attr("y", -GRAPH_SETTINGS.nodeHeight / 2)
    .attr("rx", 18)
    .attr("ry", 18)
    .attr("width", 10)
    .attr("height", GRAPH_SETTINGS.nodeHeight);

  nodeSelection
    .append("text")
    .attr("class", "rmfp-graph-eyebrow")
    .attr("x", 20)
    .attr("y", -28)
    .text((node) => getGraphNodeEyebrow(node.data));

  nodeSelection
    .append("text")
    .attr("class", "rmfp-graph-title")
    .attr("x", 20)
    .attr("y", -4);

  nodeSelection
    .append("text")
    .attr("class", "rmfp-graph-subtitle")
    .attr("x", 20)
    .attr("y", 36)
    .text((node) => getGraphNodeSummary(node.data));

  nodeSelection
    .filter((node) => !hasChildren(node.data))
    .append("circle")
    .attr("class", "rmfp-graph-status-dot")
    .attr("cx", (node) => getGraphNodeWidth(node.data) - 24)
    .attr("cy", -28)
    .attr("r", 6);

  nodeSelection.each(function renderGraphText(node) {
    const titleText = d3.select(this).select(".rmfp-graph-title");
    titleText.selectAll("tspan").remove();
    wrapSvgText(titleText, node.data.name, getGraphNodeWidth(node.data) - 44, 2);
  });
}

function buildGraphDefs(svg) {
  const defs = svg.append("defs");
  const shadow = defs
    .append("filter")
    .attr("id", "rmfp-graph-shadow")
    .attr("x", "-20%")
    .attr("y", "-30%")
    .attr("width", "160%")
    .attr("height", "180%");

  shadow
    .append("feDropShadow")
    .attr("dx", 0)
    .attr("dy", 10)
    .attr("stdDeviation", 12)
    .attr("flood-color", "#000091")
    .attr("flood-opacity", 0.08);
}

function renderGraphColumns(svg, height, nodes) {
  const columnGroup = svg.append("g").attr("class", "rmfp-graph-columns");
  const visibleDepths = new Set(nodes.map((node) => node.depth));

  GRAPH_COLUMNS.filter((column) => visibleDepths.has(column.depth)).forEach((column) => {
    const bandX = GRAPH_SETTINGS.margin.left + (column.depth - 1) * GRAPH_SETTINGS.horizontalGap - 18;
    const bandWidth = getGraphColumnWidth(column.depth);

    columnGroup
      .append("rect")
      .attr("class", `rmfp-graph-column-band rmfp-graph-column-band--${column.depth}`)
      .attr("x", bandX)
      .attr("y", 16)
      .attr("width", bandWidth)
      .attr("height", Math.max(220, height - 32))
      .attr("rx", 26)
      .attr("ry", 26);

    columnGroup
      .append("text")
      .attr("class", "rmfp-graph-column-label")
      .attr("x", bandX + 20)
      .attr("y", 42)
      .text(column.label);
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
  selectNode(node, {
    centerNodeId: node.id,
    graphOverlayNodeId: node.id,
  });
}

function onDocumentClick(event) {
  if (!state.graphOverlayNodeId || elements.graphOverlay.classList.contains("hidden")) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (target.closest("#graph-overlay") || target.closest("g.rmfp-graph-node")) {
    return;
  }

  closeGraphOverlay();
}

function onWindowResize() {
  if (typeof window.d3 === "undefined" || !state.root) {
    return;
  }

  window.requestAnimationFrame(() => {
    renderGraph();
    renderGraphOverlay();
    recenterGraphOnCurrentTarget();
  });
}

function renderGraphOverlay() {
  const node = state.graphOverlayNodeId ? state.nodesById.get(state.graphOverlayNodeId) : null;
  const frame = node ? state.graphLayout.nodeFrames.get(node.id) : null;

  if (!node || !frame || hasChildren(node) || elements.graphShell.hidden) {
    hideGraphOverlay();
    return;
  }

  const pdfPath = resolvePdfPath(node.file_pdf);
  const stats = getInventedOfferStats(node);

  elements.graphOverlayBadge.textContent = hasDedicatedPdf(node)
    ? "M\u00e9tier FP \u00b7 fiche d\u00e9di\u00e9e"
    : "M\u00e9tier FP \u00b7 fiche standard";
  elements.graphOverlayTitle.textContent = node.name;
  elements.graphOverlayPath.textContent = node.path.join(" \u2192 ");
  elements.graphOffersCount.textContent = new Intl.NumberFormat("fr-FR").format(stats.offers);
  elements.graphOffersShare.textContent = formatShare(stats.share);
  elements.graphOpenLink.href = encodeUriSafe(pdfPath);
  elements.graphDownloadLink.href = encodeUriSafe(pdfPath);
  elements.graphDownloadLink.setAttribute("download", extractFileName(pdfPath));
  elements.graphOverlay.classList.remove("hidden");

  positionGraphOverlay(frame);
}

function hideGraphOverlay() {
  elements.graphOverlay.classList.add("hidden");
  elements.graphOverlay.style.left = "";
  elements.graphOverlay.style.top = "";
}

function closeGraphOverlay() {
  state.graphOverlayNodeId = null;
  hideGraphOverlay();
}

function positionGraphOverlay(frame) {
  window.requestAnimationFrame(() => {
    if (elements.graphOverlay.classList.contains("hidden")) {
      return;
    }

    const overlayWidth = elements.graphOverlay.offsetWidth || 320;
    const overlayHeight = elements.graphOverlay.offsetHeight || 240;
    const stageWidth = state.graphLayout.width || elements.graphStage.clientWidth;
    const stageHeight = state.graphLayout.height || elements.graphStage.clientHeight;
    const margin = 16;
    let left = frame.x + frame.width + GRAPH_SETTINGS.overlayGap;

    if (left + overlayWidth > stageWidth - margin) {
      left = frame.x - overlayWidth - GRAPH_SETTINGS.overlayGap;
    }

    if (left < margin) {
      left = Math.max(
        margin,
        Math.min(stageWidth - overlayWidth - margin, frame.x + frame.width / 2 - overlayWidth / 2)
      );
    }

    let top = frame.y + frame.height / 2 - overlayHeight / 2;
    if (top + overlayHeight > stageHeight - margin) {
      top = stageHeight - overlayHeight - margin;
    }
    if (top < margin) {
      top = margin;
    }

    elements.graphOverlay.style.left = `${Math.round(left)}px`;
    elements.graphOverlay.style.top = `${Math.round(top)}px`;
  });
}

function renderDetails() {
  const node = state.selectedId ? state.nodesById.get(state.selectedId) : null;

  if (!node) {
    elements.selectionSummary.textContent =
      "S\u00e9lectionnez un m\u00e9tier FP dans l'arborescence ou via la recherche.";
    elements.selectionState.textContent = "Aucune s\u00e9lection";
    elements.selectionState.className = "fr-badge rmfp-badge rmfp-badge--neutral fr-mb-0";
    elements.detailsEmpty.classList.remove("hidden");
    elements.detailsContent.classList.add("hidden");
    return;
  }

  const pdfPath = resolvePdfPath(node.file_pdf);
  const dedicatedPdf = hasDedicatedPdf(node);

  elements.selectionSummary.textContent = `M\u00e9tier s\u00e9lectionn\u00e9 : ${node.name}.`;
  elements.selectionState.textContent = dedicatedPdf ? "Fiche d\u00e9di\u00e9e" : "Fiche standard";
  elements.selectionState.className = dedicatedPdf
    ? "fr-badge rmfp-badge rmfp-badge--success fr-mb-0"
    : "fr-badge rmfp-badge rmfp-badge--info fr-mb-0";

  elements.detailPath.textContent = node.path.join(" \u2192 ");
  elements.detailLevel.textContent = "M\u00e9tier FP";
  elements.detailDomain.textContent = node.path[1] || "Non renseign\u00e9";
  elements.detailFamily.textContent = node.path[2] || "Non renseign\u00e9e";
  elements.detailEmployment.textContent = node.path[3] || "Non renseign\u00e9";
  elements.detailDocument.textContent = `${extractFileName(pdfPath)} (${dedicatedPdf ? "fichier sp\u00e9cifique" : "fichier standard"})`;
  elements.detailOpenLink.href = encodeUriSafe(pdfPath);
  elements.detailDownloadLink.href = encodeUriSafe(pdfPath);
  elements.detailDownloadLink.setAttribute("download", extractFileName(pdfPath));
  elements.detailPdfNote.textContent =
    "Le document PDF s'ouvre dans un nouvel onglet. Ces PDF ne sont pas inclus dans la premi\u00e8re d\u00e9claration d'accessibilit\u00e9 du service web.";

  elements.detailsEmpty.classList.add("hidden");
  elements.detailsContent.classList.remove("hidden");
}

function handleInitError(error) {
  console.error(error);
  setBadge("Erreur", "error");
  updateStatus("Impossible de charger les donn\u00e9es JSON.");
  elements.searchInput.disabled = true;
  elements.clearSearchButton.disabled = true;
  elements.collapseAllButton.disabled = true;
  elements.expandFirstLevelButton.disabled = true;
  elements.recenterGraphButton.disabled = true;
  state.graphOverlayNodeId = null;
  elements.graphEmpty.hidden = false;
  elements.graphShell.hidden = true;
  elements.treeRoot.innerHTML = "";

  const errorItem = document.createElement("li");
  errorItem.className = "rmfp-empty-state";
  errorItem.textContent =
    "Le chargement des donn\u00e9es a \u00e9chou\u00e9. V\u00e9rifiez le serveur HTTP local et le fichier data/rmfp-data.json.";
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
  return `${state.records.length} fiche(s) disponible(s). Ouvrez une branche puis s\u00e9lectionnez un m\u00e9tier FP pour afficher la fiche associ\u00e9e.`;
}

function getNodeMeta(node) {
  const level = getCompactLevelLabel(node);
  if (hasChildren(node)) {
    return `${level} \u00b7 ${node.leafCount} m\u00e9tier(s)`;
  }

  return `${level} \u00b7 ${hasDedicatedPdf(node) ? "fiche d\u00e9di\u00e9e" : "fiche standard"}`;
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
      return "M\u00e9tier FP";
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

  if (!hasChildren(node.data) && hasDedicatedPdf(node.data)) {
    classes.push("has-dedicated-pdf");
  }

  return classes.join(" ");
}

function getGraphColumnWidth(depth) {
  const baseWidth = depth >= 4 ? GRAPH_SETTINGS.leafWidth : GRAPH_SETTINGS.branchWidth;
  return baseWidth + 42;
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

function getGraphNodeEyebrow(node) {
  return getCompactLevelLabel(node).toUpperCase();
}

function getGraphNodeSummary(node) {
  if (hasChildren(node)) {
    return `${node.leafCount} m\u00e9tier(s) rattach\u00e9(s)`;
  }

  return hasDedicatedPdf(node) ? "Fiche PDF d\u00e9di\u00e9e" : "Fiche PDF standard";
}

function graphLinkPath(link) {
  const sourceX = getGraphNodeX(link.source) + getGraphNodeWidth(link.source.data);
  const sourceY = link.source.x;
  const targetX = getGraphNodeX(link.target);
  const targetY = link.target.x;
  const delta = Math.max(44, Math.min(96, (targetX - sourceX) / 2));
  const sourceControlX = sourceX + delta;
  const targetControlX = targetX - delta * 0.7;

  return `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
}

function getInventedOfferStats(node) {
  const seed = hashString(node.id || node.name);
  const offers = 100 + (seed % 1901);
  const share = 0.1 + (((seed >> 5) % 50) / 10);

  return {
    offers,
    share: Math.min(5, Number(share.toFixed(1))),
  };
}

function formatShare(value) {
  return `${Number(value || 0).toFixed(1).replace(".", ",")} %`;
}

function hashString(value) {
  return Array.from(String(value || "")).reduce((hash, character) => {
    return (hash * 31 + character.charCodeAt(0)) >>> 0;
  }, 7);
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
