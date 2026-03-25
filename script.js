const DATA_URL = "data/rmfp-data.json";
const NODE_WIDTH = 328;
const NODE_HEIGHT = 92;
const LEAF_WIDTH = 360;
const LEVEL_GAP = 430;
const VERTICAL_GAP = 118;
const TRANSITION_DURATION = 260;
const NODE_RADIUS = 20;
const LINK_BEND = 58;
const ACTION_OFFSET_X = 22;
const ACTION_PANEL_PADDING = 10;
const ACTION_BUTTON_WIDTH = 122;
const ACTION_BUTTON_HEIGHT = 34;
const ACTION_BUTTON_GAP = 10;
const ACTION_PANEL_WIDTH =
  ACTION_PANEL_PADDING * 2 + ACTION_BUTTON_WIDTH * 2 + ACTION_BUTTON_GAP;
const ACTION_PANEL_HEIGHT = ACTION_PANEL_PADDING * 2 + ACTION_BUTTON_HEIGHT;
const ACTION_AREA_WIDTH = ACTION_OFFSET_X + ACTION_PANEL_WIDTH + 40;
const FOCUS_PADDING = { top: 72, right: 132, bottom: 72, left: 96 };
const SEARCH_FOCUS_PADDING = { top: 96, right: 164, bottom: 96, left: 110 };
const MARGIN = { top: 48, right: 280, bottom: 56, left: 76 };

const treeShell = document.getElementById("tree-shell");
const svg = d3.select("#tree-svg");
const statusText = document.getElementById("status-text");
const currentPath = document.getElementById("current-path");
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
const clearSearchButton = document.getElementById("clear-search");
const collapseAllButton = document.getElementById("collapse-all");
const expandFirstLevelButton = document.getElementById("expand-first-level");
const modal = document.getElementById("pdf-modal");
const closeModalButton = document.getElementById("close-modal");
const pdfFrame = document.getElementById("pdf-frame");
const modalDownloadLink = document.getElementById("modal-download-link");
const modalTitle = document.getElementById("modal-title");

let root;
let treeGroup;
let treeLayout;
let dataset;
let selectedNode = null;
let records = [];
let fallbackPdf = "pdf/sample.pdf";
let internalNodeId = 0;
let viewportSyncFrame = 0;
let visibleNodeIds = new Set();
let layoutState = {
  width: 0,
  height: 0,
  topOffset: MARGIN.top,
};

init().catch((error) => {
  console.error(error);
  statusText.textContent = "Impossible de charger les donn\u00e9es JSON.";
});

async function init() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Chargement impossible : ${response.status}`);
  }

  dataset = await response.json();
  fallbackPdf = dataset.fallbackPdf || dataset.meta?.fallback_pdf || fallbackPdf;
  records = (dataset.records || []).map((record) => ({
    ...record,
    _search: normalizeText(
      [
        record.domaine_fonctionnel,
        record.famille,
        record.intitule_er,
        record.intitule_metier_fp,
      ].join(" ")
    ),
  }));

  prepareTreeData(dataset.tree);
  buildTree();
  bindUi();
  statusText.textContent = getDefaultStatusText();
}

function prepareTreeData(treeData) {
  internalNodeId = 0;
  annotateTree(treeData, null);
  root = d3.hierarchy(treeData, (d) => d.children);
  root.x0 = 0;
  root.y0 = 0;
  expandNode(root);
  root.children?.forEach(collapseEntireBranch);
}

function annotateTree(node, parent = null) {
  node.parentId = parent?.id || null;

  if (!node.id) {
    internalNodeId += 1;
    node.id = `node-${internalNodeId}`;
  }

  if (Array.isArray(node.children) && node.children.length > 0) {
    node.children.forEach((child) => annotateTree(child, node));
  }

  node.leafCount = computeLeafCount(node);
}

function computeLeafCount(node) {
  if (!node.children || node.children.length === 0) {
    return 1;
  }

  return node.children.reduce((sum, child) => sum + computeLeafCount(child), 0);
}

function bindUi() {
  searchInput.addEventListener("input", onSearchInput);
  clearSearchButton.addEventListener("click", clearSearch);

  collapseAllButton.addEventListener("click", () => {
    collapseEntireBranch(root);
    clearSelection(false);
    update(root);
    queueViewportFocus(root, { preferCenter: true });
  });

  expandFirstLevelButton.addEventListener("click", () => {
    expandNode(root);
    root.children?.forEach(collapseEntireBranch);
    clearSelection(false);
    update(root);
    queueViewportFocus(root, { preferCenter: true });
  });

  closeModalButton.addEventListener("click", closePdfModal);
  modal.addEventListener("click", (event) => {
    if (event.target.dataset.closeModal === "true") {
      closePdfModal();
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-box")) {
      hideSearchResults();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePdfModal();
      hideSearchResults();
    }
  });
}

function buildTree() {
  treeLayout = d3.tree().nodeSize([VERTICAL_GAP, LEVEL_GAP]);
  svg.selectAll("*").remove();
  treeGroup = svg.append("g").attr("class", "tree-root");
  update(root);
}

function update(source) {
  treeLayout(root);

  const nodes = root.descendants();
  const links = root.links();
  visibleNodeIds = new Set(nodes.map((node) => node.data.id));

  let leftNode = root;
  let rightNode = root;
  root.eachBefore((node) => {
    if (node.x < leftNode.x) leftNode = node;
    if (node.x > rightNode.x) rightNode = node;
  });

  const maxDepth = d3.max(nodes, (node) => node.depth) ?? 0;
  const selectedActionWidth =
    selectedNode && isLeaf(selectedNode) && visibleNodeIds.has(selectedNode.data.id)
      ? ACTION_AREA_WIDTH
      : 0;

  const width = Math.max(
    treeShell.clientWidth,
    MARGIN.left +
      maxDepth * LEVEL_GAP +
      LEAF_WIDTH +
      MARGIN.right +
      selectedActionWidth
  );
  const height = Math.max(
    720,
    rightNode.x - leftNode.x + MARGIN.top + MARGIN.bottom + NODE_HEIGHT
  );

  layoutState = {
    width,
    height,
    topOffset: MARGIN.top - leftNode.x,
  };

  svg.attr("width", width).attr("height", height).attr("viewBox", [0, 0, width, height]);
  treeGroup.attr("transform", `translate(${MARGIN.left}, ${layoutState.topOffset})`);

  const linkSelection = treeGroup
    .selectAll("path.link-path")
    .data(links, (link) => link.target.data.id);

  linkSelection
    .enter()
    .append("path")
    .attr("class", "link-path")
    .attr("d", () => {
      const origin = { x: source.x0 ?? source.x, y: source.y0 ?? source.y };
      return elbowPath({ source: origin, target: origin });
    })
    .merge(linkSelection)
    .transition()
    .duration(TRANSITION_DURATION)
    .attr("d", (link) => elbowPath(link));

  linkSelection
    .exit()
    .transition()
    .duration(TRANSITION_DURATION - 40)
    .attr("d", () => {
      const origin = { x: source.x, y: source.y };
      return elbowPath({ source: origin, target: origin });
    })
    .remove();

  const nodeSelection = treeGroup.selectAll("g.node").data(nodes, (node) => node.data.id);

  const nodeEnter = nodeSelection
    .enter()
    .append("g")
    .attr("class", (node) => nodeGroupClass(node))
    .attr(
      "transform",
      () => `translate(${source.y0 ?? source.y}, ${source.x0 ?? source.x})`
    )
    .style("cursor", "pointer")
    .on("click", (_, node) => handleNodeClick(node));

  nodeEnter
    .append("rect")
    .attr("class", (node) => nodeCardClass(node))
    .attr("x", 0)
    .attr("y", -NODE_HEIGHT / 2)
    .attr("rx", NODE_RADIUS)
    .attr("ry", NODE_RADIUS)
    .attr("width", (node) => getNodeWidth(node))
    .attr("height", NODE_HEIGHT);

  nodeEnter.append("text").attr("class", "node-title").attr("x", 22).attr("y", -12);
  nodeEnter.append("text").attr("class", "node-subtitle").attr("x", 22).attr("y", 28);

  nodeEnter
    .append("circle")
    .attr("class", "node-toggle")
    .attr("r", 12)
    .attr("cx", (node) => getNodeWidth(node) - 18)
    .attr("cy", 0)
    .style("display", (node) => (hasChildren(node) ? "block" : "none"));

  nodeEnter
    .append("text")
    .attr("class", "node-toggle-text")
    .attr("x", (node) => getNodeWidth(node) - 18)
    .attr("y", 5)
    .attr("text-anchor", "middle")
    .text((node) => getToggleSymbol(node));

  nodeEnter.append("title").text((node) => fullNodeLabel(node));

  const nodeMerge = nodeEnter.merge(nodeSelection);

  nodeMerge.attr("class", (node) => nodeGroupClass(node));

  nodeMerge
    .transition()
    .duration(TRANSITION_DURATION)
    .attr("transform", (node) => `translate(${node.y}, ${node.x})`);

  nodeMerge
    .select("rect")
    .attr("class", (node) => nodeCardClass(node))
    .attr("width", (node) => getNodeWidth(node));

  nodeMerge
    .select("circle")
    .attr("cx", (node) => getNodeWidth(node) - 18)
    .style("display", (node) => (hasChildren(node) ? "block" : "none"));

  nodeMerge
    .select(".node-toggle-text")
    .attr("x", (node) => getNodeWidth(node) - 18)
    .text((node) => getToggleSymbol(node));

  nodeMerge.select("title").text((node) => fullNodeLabel(node));

  nodeMerge.each(function renderNodeContent(node) {
    const group = d3.select(this);
    const titleText = group.select(".node-title");
    const subtitleText = group.select(".node-subtitle");

    titleText.selectAll("tspan").remove();
    wrapSvgText(titleText, node.data.name, getNodeTextWidth(node), 2);
    subtitleText.text(getNodeSubtitle(node));
  });

  nodeSelection
    .exit()
    .transition()
    .duration(TRANSITION_DURATION - 40)
    .attr("transform", () => `translate(${source.y}, ${source.x})`)
    .remove();

  renderInlineActions();

  root.eachBefore((node) => {
    node.x0 = node.x;
    node.y0 = node.y;
  });
}

function handleNodeClick(node) {
  const wasExpanded = Boolean(node.children);

  selectedNode = node;
  updateHeaderPath(node);

  if (hasChildren(node)) {
    if (wasExpanded) {
      node._children = node.children;
      node.children = null;
      update(node);
      queueViewportFocus(node, { includeActions: false });
      return;
    }

    node.children = node._children;
    node._children = null;
    update(node);
    queueViewportFocus(node, {
      includeChildren: true,
      includeActions: false,
    });
    return;
  }

  update(node);
  queueViewportFocus(node, {
    includeActions: true,
  });
}

function updateHeaderPath(node) {
  const path = node?.data?.path || buildPathFromHierarchy(node);
  currentPath.textContent = path?.length ? path.join(" \u2192 ") : "";
}

function clearSelection(refreshTree = true) {
  selectedNode = null;
  currentPath.textContent = "";
  if (refreshTree) {
    update(root);
  }
}

function buildPathFromHierarchy(node) {
  const labels = [];
  let current = node;

  while (current && current.depth >= 0) {
    labels.unshift(current.data.name);
    current = current.parent;
  }

  return labels;
}

function onSearchInput(event) {
  const rawQuery = event.target.value || "";
  const query = normalizeText(rawQuery);

  if (!query) {
    hideSearchResults();
    statusText.textContent = getDefaultStatusText();
    return;
  }

  const matches = records.filter((record) => record._search.includes(query)).slice(0, 8);
  statusText.textContent = `${matches.length} r\u00e9sultat(s) affich\u00e9(s) pour "${rawQuery.trim()}".`;

  if (!matches.length) {
    searchResults.innerHTML =
      '<div class="search-result-item"><div class="result-title">Aucun r\u00e9sultat</div><div class="result-path">Essayez un autre mot-cl\u00e9.</div></div>';
    searchResults.classList.remove("hidden");
    return;
  }

  renderSearchResults(matches);
}

function renderSearchResults(matches) {
  searchResults.innerHTML = "";

  matches.forEach((record) => {
    const item = document.createElement("div");
    item.className = "search-result-item";
    item.innerHTML = `
      <div class="result-title">${escapeHtml(record.intitule_metier_fp)}</div>
      <div class="result-path">${escapeHtml(record.path.join(" \u2192 "))}</div>
    `;
    item.addEventListener("click", () => {
      focusRecord(record);
      hideSearchResults();
      searchInput.value = record.intitule_metier_fp;
    });
    searchResults.appendChild(item);
  });

  searchResults.classList.remove("hidden");
}

function focusRecord(record) {
  const path = findPathToId(root, record.id);
  if (!path) {
    return;
  }

  path.forEach(expandNode);
  const targetNode = path[path.length - 1];
  selectedNode = targetNode;
  updateHeaderPath(targetNode);
  update(targetNode);
  queueViewportFocus(targetNode, {
    includeActions: isLeaf(targetNode),
    preferCenter: true,
  });
}

function findPathToId(node, targetId, currentPath = []) {
  const path = [...currentPath, node];
  if (node.data.id === targetId) {
    return path;
  }

  const children = [...(node.children || []), ...(node._children || [])];
  for (const child of children) {
    const result = findPathToId(child, targetId, path);
    if (result) {
      return result;
    }
  }

  return null;
}

function expandNode(node) {
  if (node._children) {
    node.children = node._children;
    node._children = null;
  }
}

function collapseEntireBranch(node) {
  const descendants = [...(node.children || []), ...(node._children || [])];
  descendants.forEach(collapseEntireBranch);

  if (node.children) {
    node._children = node.children;
    node.children = null;
  }
}

function queueViewportFocus(node, options = {}) {
  cancelAnimationFrame(viewportSyncFrame);
  viewportSyncFrame = requestAnimationFrame(() => {
    requestAnimationFrame(() => focusNodeInView(node, options));
  });
}

function focusNodeInView(node, options = {}) {
  if (!node) {
    return;
  }

  const bounds = getFocusBounds(node, options);
  if (!bounds) {
    return;
  }

  const behavior = prefersReducedMotion() ? "auto" : "smooth";
  const maxScrollLeft = Math.max(0, treeShell.scrollWidth - treeShell.clientWidth);
  const maxScrollTop = Math.max(0, treeShell.scrollHeight - treeShell.clientHeight);
  const viewport = {
    left: treeShell.scrollLeft,
    top: treeShell.scrollTop,
    right: treeShell.scrollLeft + treeShell.clientWidth,
    bottom: treeShell.scrollTop + treeShell.clientHeight,
  };

  const padding = options.preferCenter ? SEARCH_FOCUS_PADDING : FOCUS_PADDING;
  let nextLeft = viewport.left;
  let nextTop = viewport.top;

  if (options.preferCenter) {
    nextLeft = bounds.left - Math.max(padding.left, (treeShell.clientWidth - bounds.width) / 2);
    nextTop = bounds.top - Math.max(padding.top, (treeShell.clientHeight - bounds.height) / 2);
  } else {
    if (bounds.left < viewport.left + padding.left) {
      nextLeft = bounds.left - padding.left;
    } else if (bounds.right > viewport.right - padding.right) {
      nextLeft = bounds.right + padding.right - treeShell.clientWidth;
    }

    if (bounds.top < viewport.top + padding.top) {
      nextTop = bounds.top - padding.top;
    } else if (bounds.bottom > viewport.bottom - padding.bottom) {
      nextTop = bounds.bottom + padding.bottom - treeShell.clientHeight;
    }
  }

  nextLeft = clamp(nextLeft, 0, maxScrollLeft);
  nextTop = clamp(nextTop, 0, maxScrollTop);

  focusTreeShell();

  if (
    Math.abs(nextLeft - treeShell.scrollLeft) < 2 &&
    Math.abs(nextTop - treeShell.scrollTop) < 2
  ) {
    return;
  }

  treeShell.scrollTo({
    left: nextLeft,
    top: nextTop,
    behavior,
  });
}

function getFocusBounds(node, options = {}) {
  if (!visibleNodeIds.has(node.data.id)) {
    return null;
  }

  let bounds = getNodeBounds(node);

  if (options.includeChildren && Array.isArray(node.children) && node.children.length > 0) {
    node.children.forEach((child) => {
      bounds = mergeBounds(bounds, getNodeBounds(child));
    });
  }

  if (options.includeActions && isLeaf(node)) {
    bounds = mergeBounds(bounds, getActionBounds(node));
  }

  return {
    ...bounds,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

function getNodeBounds(node) {
  const left = node.y + MARGIN.left;
  const top = node.x + layoutState.topOffset - NODE_HEIGHT / 2;

  return {
    left,
    top,
    right: left + getNodeWidth(node),
    bottom: top + NODE_HEIGHT,
  };
}

function getActionBounds(node) {
  const left = node.y + MARGIN.left + getNodeWidth(node) + ACTION_OFFSET_X;
  const top = node.x + layoutState.topOffset - ACTION_PANEL_HEIGHT / 2;

  return {
    left,
    top,
    right: left + ACTION_PANEL_WIDTH,
    bottom: top + ACTION_PANEL_HEIGHT,
  };
}

function mergeBounds(boundsA, boundsB) {
  return {
    left: Math.min(boundsA.left, boundsB.left),
    top: Math.min(boundsA.top, boundsB.top),
    right: Math.max(boundsA.right, boundsB.right),
    bottom: Math.max(boundsA.bottom, boundsB.bottom),
  };
}

function focusTreeShell() {
  if (document.activeElement === treeShell) {
    return;
  }

  try {
    treeShell.focus({ preventScroll: true });
  } catch (error) {
    treeShell.focus();
  }
}

function renderInlineActions() {
  const actionNodes =
    selectedNode && isLeaf(selectedNode) && visibleNodeIds.has(selectedNode.data.id)
      ? [selectedNode]
      : [];

  const actionSelection = treeGroup
    .selectAll("g.inline-actions")
    .data(actionNodes, (node) => node.data.id);

  const actionEnter = actionSelection
    .enter()
    .append("g")
    .attr("class", "inline-actions")
    .style("pointer-events", "all");

  actionEnter
    .append("rect")
    .attr("class", "inline-actions-panel")
    .attr("rx", 18)
    .attr("ry", 18)
    .attr("width", ACTION_PANEL_WIDTH)
    .attr("height", ACTION_PANEL_HEIGHT);

  const viewGroup = actionEnter
    .append("g")
    .attr("class", "inline-action-button action-view")
    .style("cursor", "pointer")
    .on("click", (event, node) => {
      event.stopPropagation();
      openPdfModal(resolvePdfPath(node.data.file_pdf), node.data.name);
    });

  viewGroup
    .append("rect")
    .attr("x", ACTION_PANEL_PADDING)
    .attr("y", ACTION_PANEL_PADDING)
    .attr("rx", 12)
    .attr("ry", 12)
    .attr("width", ACTION_BUTTON_WIDTH)
    .attr("height", ACTION_BUTTON_HEIGHT);

  viewGroup
    .append("text")
    .attr("x", ACTION_PANEL_PADDING + ACTION_BUTTON_WIDTH / 2)
    .attr("y", ACTION_PANEL_PADDING + ACTION_BUTTON_HEIGHT / 2 + 4)
    .attr("text-anchor", "middle")
    .text("Visualiser");

  const downloadGroup = actionEnter
    .append("g")
    .attr("class", "inline-action-button action-download")
    .style("cursor", "pointer")
    .on("click", (event, node) => {
      event.stopPropagation();
      triggerPdfDownload(resolvePdfPath(node.data.file_pdf));
    });

  downloadGroup
    .append("rect")
    .attr("x", ACTION_PANEL_PADDING + ACTION_BUTTON_WIDTH + ACTION_BUTTON_GAP)
    .attr("y", ACTION_PANEL_PADDING)
    .attr("rx", 12)
    .attr("ry", 12)
    .attr("width", ACTION_BUTTON_WIDTH)
    .attr("height", ACTION_BUTTON_HEIGHT);

  downloadGroup
    .append("text")
    .attr(
      "x",
      ACTION_PANEL_PADDING +
        ACTION_BUTTON_WIDTH +
        ACTION_BUTTON_GAP +
        ACTION_BUTTON_WIDTH / 2
    )
    .attr("y", ACTION_PANEL_PADDING + ACTION_BUTTON_HEIGHT / 2 + 4)
    .attr("text-anchor", "middle")
    .text("T\u00e9l\u00e9charger");

  actionEnter
    .merge(actionSelection)
    .attr(
      "transform",
      (node) =>
        `translate(${node.y + getNodeWidth(node) + ACTION_OFFSET_X}, ${node.x - ACTION_PANEL_HEIGHT / 2})`
    );

  actionSelection.exit().remove();
}

function triggerPdfDownload(pdfPath) {
  const link = document.createElement("a");
  link.href = encodeUriSafe(pdfPath);
  link.download = extractFileName(pdfPath);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function openPdfModal(pdfPath, title) {
  const safePath = encodeUriSafe(pdfPath);
  pdfFrame.src = safePath;
  modalDownloadLink.href = safePath;
  modalDownloadLink.setAttribute("download", extractFileName(pdfPath));
  modalTitle.textContent = title || "Fiche PDF";
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closePdfModal() {
  if (modal.classList.contains("hidden")) {
    return;
  }

  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  pdfFrame.src = "";
  document.body.classList.remove("modal-open");
}

function clearSearch() {
  searchInput.value = "";
  hideSearchResults();
  statusText.textContent = getDefaultStatusText();
}

function hideSearchResults() {
  searchResults.classList.add("hidden");
  searchResults.innerHTML = "";
}

function resolvePdfPath(filePdf) {
  return filePdf && String(filePdf).trim() ? String(filePdf).trim() : fallbackPdf;
}

function hasChildren(node) {
  return Boolean(node.children || node._children);
}

function isLeaf(node) {
  return !hasChildren(node);
}

function getNodeWidth(node) {
  return isLeaf(node) ? LEAF_WIDTH : NODE_WIDTH;
}

function getNodeTextWidth(node) {
  return getNodeWidth(node) - (hasChildren(node) ? 74 : 44);
}

function getToggleSymbol(node) {
  if (node.children) {
    return "\u2212";
  }

  if (node._children) {
    return "+";
  }

  return "";
}

function nodeGroupClass(node) {
  const classes = ["node", getLevelClass(node)];

  if (isLeaf(node)) {
    classes.push("is-leaf");
  }

  if (selectedNode?.data?.id === node.data.id) {
    classes.push("is-selected");
  }

  return classes.join(" ");
}

function nodeCardClass(node) {
  const classes = ["node-card", getLevelClass(node)];

  if (isLeaf(node)) {
    classes.push("leaf");
  }

  if (selectedNode?.data?.id === node.data.id) {
    classes.push("selected");
  }

  return classes.join(" ");
}

function getLevelClass(node) {
  const level = String(node.data.level || "unknown").replace(/[^a-z0-9_-]/gi, "_");
  return `level-${level}`;
}

function elbowPath(link) {
  const bendX = Math.max(link.source.y, link.target.y - LINK_BEND);
  return `M${link.source.y},${link.source.x}
    H${bendX}
    C${bendX + 12},${link.source.x} ${bendX + 12},${link.target.x} ${link.target.y},${link.target.x}`;
}

function fullNodeLabel(node) {
  if (isLeaf(node)) {
    return `${node.data.name} - ${resolvePdfPath(node.data.file_pdf)}`;
  }

  return `${node.data.name} - ${node.data.leafCount} m\u00e9tier(s)`;
}

function getNodeSubtitle(node) {
  const levelLabel = getCompactLevelLabel(node);

  if (isLeaf(node)) {
    return `${levelLabel} \u00b7 ${
      hasDedicatedPdf(node) ? "Fiche d\u00e9di\u00e9e" : "Fiche standard"
    }`;
  }

  return `${levelLabel} \u00b7 ${node.data.leafCount ?? 0} m\u00e9tier(s)`;
}

function getCompactLevelLabel(node) {
  switch (node.data.level) {
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

function hasDedicatedPdf(node) {
  return Boolean(node.data.file_pdf && node.data.file_pdf !== fallbackPdf);
}

function wrapSvgText(textSelection, text, width, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) {
    return 0;
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
      .attr("dy", lineIndex === 0 ? "0em" : "1.24em")
      .text(line);
  });

  return lines.length;
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

function getDefaultStatusText() {
  return `${records.length} fiche(s) disponible(s). Cliquez sur un n\u0153ud pour ouvrir ou replier l'arborescence.`;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function encodeUriSafe(path) {
  return /^(https?:)?\/\//i.test(path) ? path : encodeURI(path);
}

function extractFileName(path) {
  return String(path || "").split(/[\\/]/).pop() || "document.pdf";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
