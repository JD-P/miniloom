class AppState {
  constructor() {
    this.loomTree = new LoomTree();
    this.focusedNode = this.loomTree.root;
    this.samplerSettingsStore = {};
    this.secondsSinceLastSave = 0;
  }

  getFocusedNode() {
    return this.focusedNode;
  }

  getLoomTree() {
    return this.loomTree;
  }

  getSamplerSettingsStore() {
    return this.samplerSettingsStore;
  }

  updateSamplerSettingsStore(newSettings) {
    this.samplerSettingsStore = newSettings;
    window.samplerSettingsStore = this.samplerSettingsStore;
  }
}

// Global state instance
const appState = new AppState();

// Service instances
let llmService;
let treeNav;
let searchManager;
let fileManager;

const DOM = {
  editor: document.getElementById("editor"),
  thumbUp: document.getElementById("thumb-up"),
  thumbDown: document.getElementById("thumb-down"),
  nodeSummary: document.getElementById("node-summary"),
  nodeAuthor: document.getElementById("node-author"),
  nodeAuthorEmoji: document.getElementById("node-author-emoji"),
  nodeDepth: document.getElementById("node-depth"),
  nodePosition: document.getElementById("node-position"),
  nodeCreatedTime: document.getElementById("node-created-time"),
  nodeTimestamp: document.getElementById("node-timestamp"),
  nodeMetadata: document.getElementById("node-metadata"),
  finishReason: document.getElementById("finish-reason"),
  subtreeInfo: document.getElementById("subtree-info"),
  subtreeTotal: document.getElementById("subtree-total"),
  errorMsgEl: document.getElementById("error-message"),
  errorsEl: document.getElementById("errors"),
  errorCloseButton: document.getElementById("error-close"),
  generateButton: document.getElementById("generate-button"),
  serviceLabel: document.querySelector('.control-group label[title="Service"]'),
  apiKeyLabel: document.querySelector('.control-group label[title="API Key"]'),
  samplerLabel: document.querySelector('.control-group label[title="Sampler"]'),
  serviceSelector: document.getElementById("service-selector"),
  samplerSelector: document.getElementById("sampler-selector"),
  apiKeySelector: document.getElementById("api-key-selector"),
  die: document.getElementById("die"),
  filenameElement: document.getElementById("current-filename"),
  loomTreeView: document.getElementById("loom-tree-view"),
  treeTotalNodes: document.getElementById("tree-total-nodes"),
  treeStatsSummary: document.getElementById("tree-stats-summary"),
  treeStatsTooltip: document.getElementById("tree-stats-tooltip"),
  editorWordCount: document.getElementById("editor-word-count"),
  editorWordChange: document.getElementById("editor-word-change"),
  editorCharCount: document.getElementById("editor-char-count"),
  editorCharChange: document.getElementById("editor-char-change"),
};

/*
 * Updates UI focus to the node corresponding to nodeId
 */
function updateFocus(nodeId, reason = "unknown") {
  const node = appState.loomTree.nodeStore[nodeId];
  if (!node) {
    console.warn(`Node ${nodeId} not found for focus change: ${reason}`);
    return;
  }

  // Update state
  appState.focusedNode = node;
  appState.loomTree.markNodeAsRead(nodeId);

  updateUI();

  // Auto-scroll to bottom of editor content when focusing on a new node
  // This ensures users see the fresh new content at the bottom
  DOM.editor.scrollTop = DOM.editor.scrollHeight;

  // Auto-save when focus changes due to content creation
  if (reason === "editor-auto-save") {
    fileManager.autoSave();
  }
}

function updateUI() {
  if (!appState.focusedNode) {
    console.warn("No focused node to render");
    return;
  }

  DOM.editor.value = appState.focusedNode.cachedRenderText;

  updateTreeStatsDisplay();
  updateFocusedNodeStats();
  updateThumbState();
  updateErrorDisplay();

  if (treeNav) {
    treeNav.updateTreeView();
  }
}

/**
 * Tree Statistics Display
 */
function updateTreeStatsDisplay() {
  const rootNode = appState.loomTree.root;
  const lastUpdateTime =
    rootNode.treeStats.lastChildUpdate || new Date(rootNode.timestamp);

  if (DOM.treeTotalNodes) {
    DOM.treeTotalNodes.textContent = window.utils.formatNumber(
      rootNode.treeStats.totalChildNodes
    );
  }
  if (DOM.treeStatsSummary) {
    const tooltipText =
      `🍃 Total nodes: ${window.utils.formatNumber(rootNode.treeStats.totalChildNodes)}\n` +
      `📏 Max depth: ${window.utils.formatNumber(rootNode.treeStats.maxChildDepth)}\n` +
      `🕐 Last: ${lastUpdateTime ? window.utils.formatTimestamp(lastUpdateTime) : "N/A"}\n` +
      `📝 Max words: ${window.utils.formatNumber(rootNode.treeStats.maxWordCountOfChildren)}\n` +
      `🔤 Max chars: ${window.utils.formatNumber(rootNode.treeStats.maxCharCountOfChildren || 0)}\n` +
      `🌱 Unread nodes: ${window.utils.formatNumber(rootNode.treeStats.unreadChildNodes || 0)}\n` +
      `👍 Rated Good: ${window.utils.formatNumber(rootNode.treeStats.ratedUpNodes || 0)}\n` +
      `👎 Rated Bad: ${window.utils.formatNumber(rootNode.treeStats.ratedDownNodes || 0)}\n` +
      `🔥 Recent nodes (5min): ${window.utils.formatNumber(rootNode.treeStats.recentNodes || 0)}`;
    DOM.treeStatsSummary.setAttribute("data-tooltip-content", tooltipText);
  }

  // Update editor footer stats
  if (DOM.editorWordCount)
    DOM.editorWordCount.textContent = window.utils.formatNumber(
      appState.focusedNode.wordCount
    );
  if (DOM.editorWordChange) {
    DOM.editorWordChange.textContent = `(${window.utils.formatNetChange(appState.focusedNode.netWordsAdded)})`;
    DOM.editorWordChange.className = window.utils.getNetChangeClass(
      appState.focusedNode.netWordsAdded
    );
  }
  if (DOM.editorCharCount)
    DOM.editorCharCount.textContent = window.utils.formatNumber(
      appState.focusedNode.characterCount
    );
  if (DOM.editorCharChange) {
    DOM.editorCharChange.textContent = `(${window.utils.formatNetChange(appState.focusedNode.netCharsAdded)})`;
    DOM.editorCharChange.className = window.utils.getNetChangeClass(
      appState.focusedNode.netCharsAdded
    );
  }
}

/**
 * Focused Node Statistics Display
 */
function updateFocusedNodeStats() {
  const focusedNode = appState.focusedNode;

  DOM.nodeSummary.textContent = window.utils.getNodeSummaryDisplayText(
    focusedNode.summary
  );
  DOM.nodeAuthor.textContent =
    focusedNode.type === "user"
      ? "Human"
      : focusedNode.type === "import"
        ? "Imported"
        : focusedNode.model || "Unknown";
  DOM.nodeAuthorEmoji.textContent =
    focusedNode.type === "gen"
      ? "🤖"
      : focusedNode.type === "import"
        ? "📥"
        : "👤";
  DOM.nodePosition.innerHTML = `<strong>📍 ${focusedNode.id}:&nbsp</strong>`;

  // Update timestamp
  const formattedDate = window.utils.formatTimestamp(focusedNode.timestamp);
  if (DOM.nodeTimestamp) {
    DOM.nodeTimestamp.textContent = `🕐 ${formattedDate}`;
  }

  // Update metadata (depth only)
  if (DOM.nodeMetadata) {
    DOM.nodeMetadata.textContent = `📏 ${focusedNode.depth}`;
  }

  // Display finish reason if available
  if (DOM.finishReason) {
    if (
      focusedNode.finishReason &&
      focusedNode.type === "gen" &&
      focusedNode.finishReason !== "length"
    ) {
      const finishReasonText = window.utils.getFinishReasonDisplayText(
        focusedNode.finishReason
      );
      DOM.finishReason.textContent = `| 🛑 ${finishReasonText}`;
      DOM.finishReason.style.display = "inline";
    } else {
      DOM.finishReason.style.display = "none";
    }
  }

  // Update subtree info
  if (DOM.subtreeInfo && DOM.subtreeTotal) {
    if (focusedNode.children && focusedNode.children.length > 0) {
      DOM.subtreeTotal.textContent = focusedNode.treeStats.totalChildNodes;
      DOM.subtreeInfo.style.display = "inline";

      DOM.subtreeInfo.setAttribute(
        "data-tooltip",
        window.utils.generateSubtreeTooltipText(focusedNode)
      );
      DOM.subtreeInfo.textContent = `🍃 ${window.utils.formatNumber(focusedNode.treeStats.totalChildNodes)} nodes`;
    } else {
      DOM.subtreeInfo.style.display = "none";
    }
  }
}

/**
 * Error Display Management
 */
function updateErrorDisplay() {
  if (!DOM.errorMsgEl || !DOM.errorsEl || !appState.focusedNode) {
    return;
  }

  if (appState.focusedNode.error) {
    DOM.errorMsgEl.textContent = appState.focusedNode.error;
    DOM.errorsEl.classList.add("has-error");
  } else {
    DOM.errorMsgEl.textContent = "";
    DOM.errorsEl.classList.remove("has-error");
  }
}

function clearFocusedNodeError() {
  if (appState.focusedNode && appState.focusedNode.error) {
    appState.loomTree.clearNodeError(appState.focusedNode.id);
    updateErrorDisplay();
  }
}

/**
 * Search Index Management
 */
function updateSearchIndex(node, fullText) {
  if (searchManager) {
    searchManager.addNodeToSearchIndex(node, fullText);
  }
}

function updateSearchIndexForNode(node) {
  if (searchManager) {
    searchManager.updateNode(node, appState.loomTree.renderNode(node));
  }
}

/**
 * Thumb Rating Management
 */
function updateThumbState() {
  if (DOM.thumbUp && DOM.thumbDown) {
    DOM.thumbUp.classList.remove("chosen", "thumbs-up");
    DOM.thumbDown.classList.remove("chosen", "thumbs-down");

    if (appState.focusedNode.rating === true) {
      DOM.thumbUp.classList.add("chosen", "thumbs-up");
    } else if (appState.focusedNode.rating === false) {
      DOM.thumbDown.classList.add("chosen", "thumbs-down");
    }
  }
}

function handleThumbRating(isThumbsUp) {
  const currentRating = appState.focusedNode.rating;
  const targetRating = isThumbsUp ? true : false;
  const newRating = currentRating === targetRating ? null : targetRating;

  appState.loomTree.updateNodeRating(appState.focusedNode.id, newRating);
  updateThumbState();
  if (treeNav) {
    treeNav.updateTreeView();
  }
}

/**
 * Editor Event Handlers
 */
function setupEditorHandlers() {
  DOM.editor.addEventListener("input", async e => {
    const prompt = DOM.editor.value;

    // Auto-save user work when writing next prompt
    if (
      appState.focusedNode.children.length > 0 ||
      ["gen", "rewrite", "root"].includes(appState.focusedNode.type)
    ) {
      const child = appState.loomTree.createNode(
        "user",
        appState.focusedNode,
        prompt,
        "New Node"
      );

      updateSearchIndex(child, appState.loomTree.renderNode(child));

      // Update tree stats display to show new recent node
      updateTreeStatsDisplay();

      updateFocus(child.id, "editor-auto-save");
    }
  });

  DOM.editor.addEventListener("keydown", async e => {
    const prompt = DOM.editor.value;
    const params = llmService.prepareGenerationParams();

    // Update user node content while typing
    if (
      appState.focusedNode.children.length === 0 &&
      (appState.focusedNode.type === "user" ||
        appState.focusedNode.type === "import")
    ) {
      appState.loomTree.updateNode(
        appState.focusedNode,
        prompt,
        appState.focusedNode.summary
      );

      updateSearchIndexForNode(appState.focusedNode);
    }

    // Update character/word count on every keystroke
    updateTreeStatsDisplay();

    // Generate summary while user is writing (every 32 characters)
    if (prompt.length % 32 === 0) {
      if (
        appState.focusedNode.children.length === 0 &&
        (appState.focusedNode.type === "user" ||
          appState.focusedNode.type === "import") &&
        ["base"].includes(params["sampling-method"])
      ) {
        try {
          const summary = await llmService.generateSummary(prompt);
          appState.loomTree.updateNode(appState.focusedNode, prompt, summary);

          updateSearchIndexForNode(appState.focusedNode);
        } catch (error) {
          console.error("Summary generation error:", error);
        }
      }
      if (treeNav) {
        treeNav.updateTreeView();
      }
    }

    // Generate on Ctrl/Cmd+Enter
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      llmService.generateNewResponses(appState.focusedNode.id);
    }
  });

  DOM.editor.addEventListener("contextmenu", e => {
    e.preventDefault();
    window.electronAPI.showContextMenu();
  });
}

/**
 * Settings Management
 */
async function loadSettings() {
  try {
    const data = await window.electronAPI.loadSettings();
    appState.updateSamplerSettingsStore(data || {});
    window.samplerSettingsStore = appState.samplerSettingsStore;
  } catch (err) {
    console.error("Load Settings Error:", err);
    appState.updateSamplerSettingsStore({});
    window.samplerSettingsStore = appState.samplerSettingsStore;
  }
}

const onSettingsUpdated = async () => {
  try {
    const data = await window.electronAPI.loadSettings();
    if (data != null) {
      appState.updateSamplerSettingsStore(data);
      window.samplerSettingsStore = appState.samplerSettingsStore;
      populateServiceSelector();
      populateSamplerSelector();
      populateApiKeySelector();
      renderFavoritesButtons();
    }
  } catch (err) {
    console.error("Load Settings Error:", err);
  }
};

// Electron API event handlers
window.electronAPI.onUpdateFilename(
  (event, filename, creationTime, filePath, isTemp, lastSavedTime) => {
    const filenameElement = document.getElementById("current-filename");
    if (filenameElement) {
      // Remove .json extension for display
      const displayName = filename.replace(/\.json$/, "");

      if (isTemp) {
        // For temp files, show "Unsaved" in red with no hover info
        filenameElement.innerHTML = `💾 <span style="color: red;">Unsaved</span>`;
        filenameElement.title = ""; // No hover info for temp files
      } else {
        // For regular files, show filename with hover info
        filenameElement.innerHTML = `💾 ${displayName}`;

        const tooltipLines = [`File: ${filePath || "Unknown"}`];

        if (creationTime) {
          const formattedCreationTime =
            window.utils.formatTimestamp(creationTime);
          tooltipLines.push(`Created: ${formattedCreationTime}`);
        }

        if (lastSavedTime) {
          const formattedLastSavedTime =
            window.utils.formatTimestamp(lastSavedTime);
          tooltipLines.push(`Last Saved: ${formattedLastSavedTime}`);
        }

        filenameElement.title = tooltipLines.join("\n");
      }
    }
  }
);

// Tree stats recalculation timer - recalculate every minute to update recent nodes
function treeStatsRecalcTick() {
  // Trigger full recalculation of tree stats to update recent nodes count
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  appState.loomTree.calculateAllNodeStats(
    appState.loomTree.root,
    fiveMinutesAgo
  );

  // Update the UI to reflect the new stats
  updateTreeStatsDisplay();

  // Re-render the tree navigation to show updated badges
  if (treeNav) {
    treeNav.updateTreeView();
  }
}

var treeStatsRecalcIntervalId = setInterval(treeStatsRecalcTick, 60000); // Every minute

/**
 * Helper function for summary updates
 */
async function updateFocusSummary() {
  if (
    (appState.focusedNode.type === "user" ||
      appState.focusedNode.type === "import") &&
    appState.focusedNode.children.length === 0
  ) {
    const currentFocus = appState.focusedNode;
    const newPrompt = DOM.editor.value;
    const prompt = appState.loomTree.renderNode(currentFocus);

    try {
      let summary = await llmService.generateSummary(prompt);
      if (summary.trim() === "") {
        summary = "Branch Empty";
      }
      appState.loomTree.updateNode(currentFocus, newPrompt, summary);

      updateSearchIndexForNode(currentFocus);
    } catch (error) {
      appState.loomTree.updateNode(currentFocus, newPrompt, "Branch Error");

      updateSearchIndexForNode(currentFocus);
    }
  }
}

async function init() {
  try {
    await loadSettings();

    // Initialize file manager first
    fileManager = new FileManager({
      appState: appState,
      updateUI: updateUI,
      updateSearchIndex: updateSearchIndex,
      updateSearchIndexForNode: updateSearchIndexForNode,
      treeNav: null, // Will be set after treeNav is created
      searchManager: null, // Will be set after searchManager is created
      DOM: DOM,
    });

    // Initialize file manager and load initial data
    await fileManager.init();

    // Initialize services (needed for both loaded files and fresh state)

    llmService = new LLMService({
      // Settings provider - handles configuration access
      settingsProvider: {
        getSamplerSettings: () => ({
          selectedServiceName: DOM.serviceSelector?.value || "",
          selectedSamplerName: DOM.samplerSelector?.value || "",
          selectedApiKeyName: DOM.apiKeySelector?.value || "",
        }),
        getSamplerSettingsStore: () => appState.getSamplerSettingsStore(),
      },

      // Data provider - handles data access without DOM coupling
      dataProvider: {
        getCurrentPrompt: () => DOM.editor.value,
        getLoomTree: () => appState.getLoomTree(),
        getCurrentFocus: () => appState.getFocusedNode(),
      },

      // Event handlers - clean callbacks named from LLM perspective
      eventHandlers: {
        onGenerationStarted: nodeId => {
          // Set loading state when generation starts
          DOM.editor.readOnly = true;
          if (DOM.die) {
            DOM.die.classList.add("rolling");
          }

          // Set node generation pending and clear any errors
          const loomTree = appState.getLoomTree();
          loomTree.setNodeGenerationPending(nodeId, true);
          loomTree.clearNodeError(nodeId);
        },

        onGenerationFinished: nodeId => {
          // Clear loading state when generation finishes
          DOM.editor.readOnly = false;
          if (DOM.die) {
            DOM.die.classList.remove("rolling");
          }

          // Clear node generation pending state
          const loomTree = appState.getLoomTree();
          loomTree.setNodeGenerationPending(nodeId, false);
        },

        onGenerationFailed: (nodeId, errorMessage) => {
          console.warn("LLM generation failed:", errorMessage);

          // Set error on the node
          const loomTree = appState.getLoomTree();
          loomTree.setNodeError(nodeId, errorMessage);

          // Trigger UI update to show the error
          updateErrorDisplay();
        },

        onPreGeneration: async nodeId => {
          // Auto-save and update summary before generation
          await fileManager.autoSaveTick();
          await updateFocusSummary();
        },

        onNodeCreated: (nodeId, nodeData) => {
          // Update node metadata
          if (appState.loomTree.nodeStore[nodeId]) {
            Object.assign(
              appState.loomTree.nodeStore[nodeId],
              nodeData.metadata
            );
          }

          // Update search index
          if (searchManager) {
            searchManager.addNodeToSearchIndex(
              nodeData.node,
              nodeData.fullText
            );
          }
        },

        onTreeViewUpdate: () => {
          // Update tree view to show new badges
          if (treeNav) {
            treeNav.updateTreeView();
          }
          updateTreeStatsDisplay();
        },

        onFocusChanged: (nodeId, reason) => {
          updateFocus(nodeId, reason);
        },
      },
    });

    // Create tree navigation service
    treeNav = new TreeNav(
      nodeId => {
        updateFocus(nodeId, "tree-navigation");
      },
      {
        getFocus: () => appState.getFocusedNode(),
        getLoomTree: () => appState.getLoomTree(),
      }
    );

    // Create search manager
    searchManager = new SearchManager({
      focusOnNode: nodeId => {
        if (nodeId) {
          updateFocus(nodeId, "search-result");
        } else {
          const focusedNode = appState.getFocusedNode();
          if (focusedNode) {
            updateFocus(focusedNode.id, "search-result");
          }
        }
      },
      loomTree: appState.getLoomTree(),
      treeNav: treeNav,
    });

    // Update fileManager with references to other services
    fileManager.treeNav = treeNav;
    fileManager.searchManager = searchManager;

    // Make services globally available
    window.llmService = llmService;
    window.treeNav = treeNav;
    window.searchManager = searchManager;
    window.fileManager = fileManager;

    // Initialize tree view
    treeNav.renderTree(appState.loomTree.root, DOM.loomTreeView);

    // Start file manager timers and set up event handlers
    fileManager.startAutoSaveTimer();
    fileManager.setupEventHandlers();

    // Set up event listeners
    window.electronAPI.onSettingsUpdated(onSettingsUpdated);
    setupEditorHandlers();

    // Populate settings selectors
    populateServiceSelector();
    populateSamplerSelector();
    populateApiKeySelector();
    renderFavoritesButtons();

    // Set up additional event handlers
    if (DOM.thumbUp) {
      DOM.thumbUp.onclick = () => handleThumbRating(true);
    }

    if (DOM.thumbDown) {
      DOM.thumbDown.onclick = () => handleThumbRating(false);
    }

    // Settings labels
    if (DOM.serviceLabel) {
      DOM.serviceLabel.style.cursor = "pointer";
      DOM.serviceLabel.onclick = () =>
        window.electronAPI.openSettingsToTab("services");
    }

    if (DOM.apiKeyLabel) {
      DOM.apiKeyLabel.style.cursor = "pointer";
      DOM.apiKeyLabel.onclick = () =>
        window.electronAPI.openSettingsToTab("api-keys");
    }

    if (DOM.samplerLabel) {
      DOM.samplerLabel.style.cursor = "pointer";
      DOM.samplerLabel.onclick = () =>
        window.electronAPI.openSettingsToTab("samplers");
    }

    // Error close button handler
    if (DOM.errorCloseButton) {
      DOM.errorCloseButton.onclick = clearFocusedNodeError;
    }

    // Generate button handler
    if (DOM.generateButton) {
      DOM.generateButton.onclick = () => {
        if (llmService && appState.focusedNode) {
          llmService.generateNewResponses(appState.focusedNode.id);
        }
      };
    }

    // Tree stats tooltip handlers
    if (DOM.treeStatsSummary && DOM.treeStatsTooltip) {
      DOM.treeStatsSummary.onmouseenter = () => {
        const content = DOM.treeStatsSummary.getAttribute(
          "data-tooltip-content"
        );
        if (content) {
          DOM.treeStatsTooltip.textContent = content;

          // Position tooltip below the stats element
          const rect = DOM.treeStatsSummary.getBoundingClientRect();
          DOM.treeStatsTooltip.style.left = rect.left + rect.width / 2 + "px";
          DOM.treeStatsTooltip.style.top = rect.bottom + 4 + "px";
          DOM.treeStatsTooltip.style.transform = "translateX(-50%)";

          DOM.treeStatsTooltip.style.display = "block";
        }
      };

      DOM.treeStatsSummary.onmouseleave = () => {
        DOM.treeStatsTooltip.style.display = "none";
      };

      // Allow clicking to keep tooltip open
      DOM.treeStatsSummary.onclick = () => {
        const content = DOM.treeStatsSummary.getAttribute(
          "data-tooltip-content"
        );
        if (content) {
          DOM.treeStatsTooltip.textContent = content;

          // Position tooltip below the stats element
          const rect = DOM.treeStatsSummary.getBoundingClientRect();
          DOM.treeStatsTooltip.style.left = rect.left + rect.width / 2 + "px";
          DOM.treeStatsTooltip.style.top = rect.bottom + 4 + "px";
          DOM.treeStatsTooltip.style.transform = "translateX(-50%)";

          DOM.treeStatsTooltip.style.display = "block";
        }
      };

      // Close tooltip when clicking outside
      document.addEventListener("click", e => {
        if (
          !DOM.treeStatsSummary.contains(e.target) &&
          !DOM.treeStatsTooltip.contains(e.target)
        ) {
          DOM.treeStatsTooltip.style.display = "none";
        }
      });
    }

    // Initial render and search index setup
    updateUI();

    // Check for new user setup
    checkForNewUser();
  } catch (error) {
    console.error("Initialization failed:", error);
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  init();
});
