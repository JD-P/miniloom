class TreeNav {
  constructor(onNodeClick, { getLoomTree, getFocus } = {}) {
    this.onNodeClick = onNodeClick;
    this.getLoomTree = getLoomTree;
    this.getFocus = getFocus;

    // Track if collapsed parents are expanded to preserve state during re-renders
    this.collapsedParentsExpanded = false;
    this.lastFocusedNodeId = null;

    // Initialize when DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    // DOM elements
    this.loomTreeView = document.getElementById("loom-tree-view");
    if (!this.loomTreeView) {
      throw new Error("loom-tree-view element not found");
    }
  }

  renderTree(node, container) {
    const parentIds = [];
    const hiddenParentIds = [];
    const loomTree = this.getLoomTree();

    // Move up 2 parents to show context around the focused node
    for (let i = 0; i < 2; i++) {
      if (node.parent === null) {
        break; // Stop at root node
      }
      parentIds.push(node.parent);
      node = loomTree.nodeStore[node.parent];
    }

    // Find all hidden parents above the current node
    // Walk up from the original focused node to find all parents not in parentIds
    const originalFocus = this.getFocus();
    let currentNode = originalFocus;
    while (currentNode.parent !== null) {
      const parent = loomTree.nodeStore[currentNode.parent];
      if (parent && !parentIds.includes(parent.id)) {
        hiddenParentIds.push(parent.id);
      }
      currentNode = parent;
    }

    const ul = document.createElement("ul");

    // Render hidden parents if any exist
    if (hiddenParentIds.length > 0) {
      const hiddenParentsLi = this.createHiddenParentsLi(hiddenParentIds);
      ul.appendChild(hiddenParentsLi);

      // Add horizontal rule after hidden parents
      const hr = document.createElement("hr");
      hr.classList.add("hidden-parents-divider");
      ul.appendChild(hr);
    }

    const li = this.createTreeLi(node, 1, false, parentIds);

    if (node.parent) {
      li.classList.add("hidden-parents");
    }

    ul.appendChild(li);
    this.renderChildren(node, li, 5, parentIds);
    container.appendChild(ul);
  }

  renderChildren(node, container, maxChildrenDepth, parentIds) {
    if (maxChildrenDepth <= 0 || node.children.length === 0) {
      return;
    }

    const childrenUl = document.createElement("ul");
    const loomTree = this.getLoomTree();
    const currentFocus = this.getFocus();

    // Check if this node should be compressed (downvoted and not focused/parent)
    const shouldCompress =
      node.rating === false &&
      node.id !== currentFocus.id &&
      !parentIds.includes(node.id);

    if (shouldCompress) {
      // Create compressed children indicator
      const compressedLi = this.createCompressedChildrenLi(node);
      childrenUl.appendChild(compressedLi);
    } else {
      // Render children normally
      for (let i = 0; i < node.children.length; i++) {
        const child = loomTree.nodeStore[node.children[i]];
        const li = this.createTreeLi(
          child,
          i + 1,
          maxChildrenDepth <= 1,
          parentIds
        );
        childrenUl.appendChild(li);
        this.renderChildren(child, li, maxChildrenDepth - 1, parentIds);
      }
    }

    container.appendChild(childrenUl);
  }

  createTreeLi(node, index, isMaxDepth, parentIds) {
    const li = document.createElement("li");
    const nodeSpan = this.createNodeSpan(node, parentIds, isMaxDepth);
    const link = this.createNodeLink(node, index);

    nodeSpan.appendChild(link);
    li.appendChild(nodeSpan);

    return li;
  }

  createNodeSpan(node, parentIds, isMaxDepth) {
    const nodeSpan = document.createElement("span");
    const currentFocus = this.getFocus();

    // Set focused node ID
    if (node.id === currentFocus.id) {
      nodeSpan.id = "focused-node";
    }

    // Add data attribute for node identification
    nodeSpan.setAttribute("data-node-id", node.id);

    // Add base classes
    nodeSpan.classList.add(`type-${node.type}`);

    // Add conditional classes
    if (parentIds && parentIds.includes(node.id)) {
      nodeSpan.classList.add("parent-of-focused");
    }

    if (node.rating === true || node.rating === false) {
      nodeSpan.classList.add(node.rating ? "upvoted" : "downvoted");
    }

    if (isMaxDepth && node.children && node.children.length > 0) {
      nodeSpan.classList.add("hidden-children");
    }

    return nodeSpan;
  }

  createNodeLink(node, index) {
    const link = document.createElement("a");

    // Special treatment for Root Node
    if (node.id === "1") {
      link.textContent = "🌳 Root Node";
      link.classList.add("root-node-link");
      link.title = "Root Node - Start Here";

      link.onclick = event => {
        event.stopPropagation();
        this.onNodeClick(node.id);
      };

      return link;
    }

    const displayText = window.utils.getNodeSummaryDisplayText(
      node.summary,
      index
    );

    const statusSpan = this.createStatusSpan(node);
    const ratingSpan = this.createRatingSpan(node);

    // Add author span for user nodes
    if (node.type === "user") {
      const authorSpan = document.createElement("span");
      authorSpan.classList.add("author-indicator");
      authorSpan.textContent = "👤 ";
      link.appendChild(authorSpan);
    }

    const textSpan = document.createElement("span");

    // Add 🛑 emoji to the text content if the node is Complete (finishReason === "stop")
    if (node.finishReason === "stop") {
      textSpan.textContent = displayText + " 🛑";
      textSpan.title = "Complete - this branch is ended";
    } else {
      textSpan.textContent = displayText;
    }

    // Make new/unread nodes normal weight and style
    if (node.read === false) {
      textSpan.classList.add("unread-node");
    }

    // Add elements in new order: status (now includes badge), author (if user), text, ratings
    link.appendChild(statusSpan);

    // Add author span for user nodes (already created above)
    if (node.type === "user") {
      // authorSpan already added above
    }

    link.appendChild(textSpan);

    // Add rating last (on the right)
    link.appendChild(ratingSpan);

    // Create comprehensive hover tooltip
    link.title = this.createNodeTooltip(node, displayText);

    link.onclick = event => {
      event.stopPropagation();
      this.onNodeClick(node.id);
    };

    return link;
  }

  createStatusSpan(node) {
    const statusSpan = document.createElement("span");
    statusSpan.classList.add("node-status");

    // Determine status - combine with badge functionality
    if (node.error) {
      statusSpan.classList.add("status-error");
      statusSpan.textContent = "⚠️";
    } else if (node.generationPending) {
      statusSpan.classList.add("status-pending");
      statusSpan.textContent = "🎲";
    } else if (node.read === false) {
      statusSpan.classList.add("status-unread");
      statusSpan.textContent = "🌱";
    } else if (node.children && node.children.length > 0) {
      // Show badge with subtree count
      statusSpan.classList.add("status-badge");
      const totalSubtreeNodes = node.treeStats.totalChildNodes;
      statusSpan.textContent = ` ${window.utils.formatNumber(totalSubtreeNodes)}`;

      // Add red class if there are recent nodes
      if (node.treeStats.recentNodes > 0) {
        statusSpan.classList.add("status-badge-unread");
      }
    } else {
      statusSpan.classList.add("status-normal");
      statusSpan.textContent = "";
    }

    return statusSpan;
  }

  createRatingSpan(node) {
    const ratingSpan = document.createElement("span");
    ratingSpan.classList.add("node-rating");

    if (node.rating === true) {
      ratingSpan.classList.add("rating-star");
      ratingSpan.textContent = "👍";
    } else if (node.rating === false) {
      ratingSpan.classList.add("rating-no");
      ratingSpan.textContent = "👎";
    } else {
      ratingSpan.classList.add("rating-none");
      ratingSpan.textContent = "";
    }

    return ratingSpan;
  }

  createNodeTooltip(node, displayText) {
    const lines = [];

    // Node summary
    lines.push(displayText);

    // Author if available
    if (node.type === "user") {
      lines.push("Author: User");
    }

    // Timestamp
    if (node.timestamp) {
      const formattedTime = window.utils.formatTimestamp(node.timestamp);
      lines.push(`Generated: ${formattedTime}`);
    }

    // Add subtree stats using the shared utility function
    if (node.children && node.children.length > 0) {
      lines.push(""); // Empty line separator
      lines.push(window.utils.generateSubtreeTooltipText(node));
    } else {
      // Just the basic ID info for nodes without children
      lines.push(`ID: ${node.id || "unknown"}`);
    }

    return lines.join("\n");
  }

  createSubtreeBadge(node) {
    const badgeSpan = document.createElement("span");
    badgeSpan.classList.add("subtree-badge");

    // Add red class if there are recent nodes
    if (node.treeStats.recentNodes > 0) {
      badgeSpan.classList.add("subtree-badge-unread");
    }

    // Use the pre-calculated totalChildNodes from treeStats
    const totalSubtreeNodes = node.treeStats.totalChildNodes;

    // Get the last change timestamp for the subtree
    const lastChangeTime = node.treeStats.lastChildUpdate || node.timestamp;
    const formattedLastChange = window.utils.formatTimestamp(lastChangeTime);

    badgeSpan.textContent = ` ${window.utils.formatNumber(totalSubtreeNodes)}`;
    badgeSpan.title = `${window.utils.formatNumber(node.children.length)} immediate children, ${window.utils.formatNumber(totalSubtreeNodes)} total nodes in subtree${node.treeStats.unreadChildNodes > 0 ? `, ${window.utils.formatNumber(node.treeStats.unreadChildNodes)} unread` : ""}${node.treeStats.recentNodes > 0 ? `, ${window.utils.formatNumber(node.treeStats.recentNodes)} recent (5min)` : ""}\n🕐 Last change: ${formattedLastChange}`;

    return badgeSpan;
  }

  createCompressedChildrenLi(node) {
    const li = document.createElement("li");
    const span = document.createElement("span");

    span.classList.add("compressed-children-indicator");
    span.classList.add("tree-node");

    const link = document.createElement("a");
    const count = node.children.length;
    const text = count === 1 ? "1 child node" : `${count} child nodes`;
    link.innerHTML = `[${text}]`;
    link.title = `Click to expand and show ${count} child node${count > 1 ? "s" : ""}`;
    link.classList.add("compressed-children-link");

    link.onclick = event => {
      event.stopPropagation();
      this.onNodeClick(node.id);
    };

    span.appendChild(link);
    li.appendChild(span);

    return li;
  }

  createHiddenParentsLi(hiddenParentIds) {
    const li = document.createElement("li");

    if (this.collapsedParentsExpanded) {
      // Show expanded parents
      this.createExpandedParentsContainer(hiddenParentIds, li);
      li.classList.add("expanded");
    } else {
      // Show collapsed indicator
      const span = document.createElement("span");
      span.classList.add("hidden-parents-indicator");
      span.classList.add("tree-node");

      const link = document.createElement("a");
      const count = hiddenParentIds.length;
      const text =
        count === 1 ? "1 parent node above" : `${count} parent nodes above`;
      link.innerHTML = `⬆️ [${text}]`;
      link.title = `Click to expand and show ${count} parent node${count > 1 ? "s" : ""}`;
      link.classList.add("hidden-parents-link");

      link.onclick = event => {
        event.stopPropagation();
        this.expandHiddenParents(hiddenParentIds, li);
      };

      span.appendChild(link);
      li.appendChild(span);
    }

    return li;
  }

  createExpandedParentsContainer(hiddenParentIds, container) {
    const loomTree = this.getLoomTree();
    const expandedContainer = document.createElement("div");
    expandedContainer.classList.add("expanded-parents-container");

    // Create the parent nodes in reverse order (highest to lowest)
    for (let i = hiddenParentIds.length - 1; i >= 0; i--) {
      const parentId = hiddenParentIds[i];
      const parentNode = loomTree.nodeStore[parentId];

      if (parentNode) {
        // Create a flat structure without nested ul/li to avoid tree dashes
        const parentDiv = document.createElement("div");
        parentDiv.classList.add("expanded-parent-node");

        const nodeSpan = this.createNodeSpan(parentNode, [], false);
        // Add parent-of-focused class to get the red styling
        nodeSpan.classList.add("parent-of-focused");
        const link = this.createNodeLink(parentNode, 1);

        nodeSpan.appendChild(link);
        parentDiv.appendChild(nodeSpan);

        expandedContainer.appendChild(parentDiv);
      }
    }

    container.appendChild(expandedContainer);
  }

  updateTreeView() {
    const currentFocus = this.getFocus();

    // Clear collapsed parents expansion state if we've navigated to a different node
    if (
      this.lastFocusedNodeId !== null &&
      this.lastFocusedNodeId !== currentFocus.id
    ) {
      this.collapsedParentsExpanded = false;
    }
    this.lastFocusedNodeId = currentFocus.id;

    this.loomTreeView.innerHTML = "";
    this.renderTree(currentFocus, this.loomTreeView);
  }

  // Update tree view when node status changes
  updateNodeStatus(nodeId) {
    // Find the node element in the tree and update its status
    const nodeElements = this.loomTreeView.querySelectorAll(
      `[data-node-id="${nodeId}"]`
    );
    if (nodeElements.length > 0) {
      // If the node is visible in the tree, update the whole tree view
      this.updateTreeView();
    }
  }

  expandHiddenParents(hiddenParentIds, indicatorLi) {
    // Set the flag to preserve expansion state during re-renders
    this.collapsedParentsExpanded = true;

    // Replace the indicator with the expanded parents
    indicatorLi.innerHTML = "";
    this.createExpandedParentsContainer(hiddenParentIds, indicatorLi);
    indicatorLi.classList.add("expanded");
  }

  hide() {
    this.loomTreeView.style.display = "none";
  }

  show() {
    this.loomTreeView.style.display = "block";
  }
}

// Export the TreeNav class
window.TreeNav = TreeNav;
