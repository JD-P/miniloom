/**
 * File Manager - Handles all file operations and data persistence
 */

class FileManager {
  constructor(dependencies = {}) {
    this.appState = dependencies.appState;
    this.updateUI = dependencies.updateUI;
    this.updateSearchIndex = dependencies.updateSearchIndex;
    this.updateSearchIndexForNode = dependencies.updateSearchIndexForNode;
    this.treeNav = dependencies.treeNav;
    this.searchManager = dependencies.searchManager;
    this.DOM = dependencies.DOM;

    // Auto-save timer
    this.autoSaveIntervalId = null;
  }

  /**
   * Save current loom data to file
   */
  async saveFile() {
    const data = {
      loomTree: this.appState.loomTree.serialize(),
      focus: this.appState.focusedNode,
    };
    try {
      await window.electronAPI.saveFile(data);
    } catch (err) {
      console.error("Save File Error:", err);
    }
  }

  /**
   * Load loom data from file
   */
  async loadFile() {
    try {
      const data = await window.electronAPI.loadFile();
      if (data) {
        await this.loadFileData(data);
      }
      // If data is null, user cancelled the operation
    } catch (err) {
      console.error("Load File Error:", err);
    }
  }

  /**
   * Load recent file by path
   */
  async loadRecentFile(filePath) {
    try {
      const data = await window.electronAPI.loadRecentFile(filePath);
      if (data) {
        await this.loadFileData(data);
      }
    } catch (err) {
      console.error("Load Recent File Error:", err);
    }
  }

  /**
   * Import Loomsidian file
   */
  async importLoomsidianFile() {
    try {
      const data = await window.electronAPI.importLoomsidianFile();
      if (data) {
        await this.processImportedLoomsidianData(data);
      }
    } catch (err) {
      console.error("Import Loomsidian File Error:", err);
    }
  }

  /**
   * Process imported Loomsidian data
   */
  async processImportedLoomsidianData(loomsidianData) {
    try {
      const { loomTree, idMapping } =
        this.convertLoomsidianToMiniLoom(loomsidianData);

      // Update global state
      this.appState.loomTree = loomTree;

      // Set focus to the current node from Loomsidian or the Loomsidian root
      const currentId = loomsidianData.current;
      const loomsidianRootId = Object.keys(loomsidianData.nodes).find(
        id => !loomsidianData.nodes[id].parentId
      );
      const loomsidianRootMiniLoomId = idMapping[loomsidianRootId];

      const focusedNode =
        currentId &&
        idMapping[currentId] &&
        loomTree.nodeStore[idMapping[currentId]]
          ? loomTree.nodeStore[idMapping[currentId]]
          : loomTree.nodeStore[loomsidianRootMiniLoomId];

      this.appState.focusedNode = focusedNode;

      // Ensure the focused node is properly rendered
      if (this.appState.focusedNode) {
        this.appState.focusedNode.cachedRenderText = loomTree.renderNode(
          this.appState.focusedNode
        );
      }

      // Update existing services with new data
      if (this.searchManager) {
        this.searchManager.updateLoomTree(loomTree);
        this.searchManager.rebuildIndex();
      }
      if (this.treeNav) {
        this.treeNav.renderTree(loomTree.root, this.DOM.loomTreeView);
      }

      // Render the new state
      this.updateUI();

      // Trigger an auto-save to create the temp file
      await this.autoSave();
    } catch (error) {
      console.error("Error in processImportedLoomsidianData:", error);
      throw error;
    }
  }

  /**
   * Convert Loomsidian data to MiniLoom format
   */
  convertLoomsidianToMiniLoom(loomsidianData) {
    const loomTree = new LoomTree();

    // Find the root node (node with parentId: null)
    const rootNodeId = Object.keys(loomsidianData.nodes).find(
      id => loomsidianData.nodes[id].parentId === null
    );

    if (!rootNodeId) {
      throw new Error("No root node found in Loomsidian data");
    }

    // Create a mapping from Loomsidian IDs to MiniLoom IDs
    const idMapping = {};
    let nextMiniLoomId = 2; // Start from 2 to avoid conflict with MiniLoom root (ID "1")

    // First pass: create all nodes with null parent (will fix in second pass)
    Object.keys(loomsidianData.nodes).forEach(loomsidianId => {
      const loomsidianNode = loomsidianData.nodes[loomsidianId];
      const miniLoomId = String(nextMiniLoomId++);
      idMapping[loomsidianId] = miniLoomId;

      // Generate simple summary from words 2-5, stripping punctuation but preserving apostrophes
      const cleanText = loomsidianNode.text.trim().replace(/[^\w\s']/g, " ");
      const words = cleanText
        .split(/\s+/)
        .filter(word => word.length > 0)
        .slice(1, 5); // Skip first word, take next 4
      let summary = words.join(" ");

      // If summary is empty, we'll generate a branch number later
      if (!summary || summary.trim() === "") {
        summary = ""; // Will be set to Branch X in second pass
      }

      // Create the node with null parent for now
      const node = new Node(
        miniLoomId,
        "import", // Imported nodes are marked as "import" type
        null, // Will be set in second pass
        "", // Will be set below
        summary
      );

      // Set additional properties from Loomsidian data
      node.timestamp = loomsidianNode.lastVisited || Date.now();
      node.read = !loomsidianNode.unread;

      // Map bookmarked to rating (bookmarked = thumbs up)
      if (loomsidianNode.bookmarked) {
        node.rating = true;
      }

      // Map collapsed to rating (collapsed = thumbs down)
      if (loomsidianNode.collapsed) {
        node.rating = false;
      }

      loomTree.nodeStore[miniLoomId] = node;
    });

    // Second pass: set up parent relationships
    Object.keys(loomsidianData.nodes).forEach(loomsidianId => {
      const loomsidianNode = loomsidianData.nodes[loomsidianId];
      const miniLoomId = idMapping[loomsidianId];
      const node = loomTree.nodeStore[miniLoomId];

      if (loomsidianNode.parentId) {
        const parentId = idMapping[loomsidianNode.parentId];
        const parent = loomTree.nodeStore[parentId];

        // Set the parent relationship
        node.parent = parentId;

        // Add this node to parent's children
        parent.children.push(miniLoomId);
      } else {
        // Loomsidian root node becomes a child of MiniLoom root
        node.parent = loomTree.root.id;
        loomTree.root.children.push(miniLoomId);
      }
    });

    // Third pass: create patches by walking down the tree recursively
    const createPatchesRecursively = (
      nodeId,
      parentText = "",
      branchIndex = 1
    ) => {
      const node = loomTree.nodeStore[nodeId];
      const loomsidianId = Object.keys(idMapping).find(
        id => idMapping[id] === nodeId
      );
      const loomsidianNode = loomsidianData.nodes[loomsidianId];

      // Generate branch number for empty summaries
      if (!node.summary || node.summary.trim() === "") {
        node.summary = `Branch ${branchIndex}`;
      }

      // Create patch: parent text + this node's text
      const childFullText = parentText + loomsidianNode.text;
      node.patch = dmp.patch_make(parentText, childFullText);

      // Process children recursively with the new full text as their parent text
      node.children.forEach((childId, index) => {
        createPatchesRecursively(childId, childFullText, index + 1);
      });
    };

    // Start patch creation from the Loomsidian root node
    createPatchesRecursively(idMapping[rootNodeId]);

    // Calculate all node stats starting from the MiniLoom root
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    loomTree.calculateAllNodeStats(loomTree.root, fiveMinutesAgo);

    return { loomTree, idMapping };
  }

  /**
   * Load and process file data
   */
  async loadFileData(data) {
    try {
      const newLoomTree = new LoomTree();
      newLoomTree.loadFromData(data.loomTree);

      // Update global state
      this.appState.loomTree = newLoomTree;

      // Set focus to saved focus or root
      const savedFocus =
        data.focus && data.focus.id
          ? newLoomTree.nodeStore[data.focus.id]
          : newLoomTree.root;

      if (!savedFocus) {
        console.warn("Saved focus node not found, using root");
        this.appState.focusedNode = newLoomTree.root;
      } else {
        this.appState.focusedNode = savedFocus;
      }

      // Ensure the focused node is properly rendered
      if (this.appState.focusedNode) {
        this.appState.focusedNode.cachedRenderText = newLoomTree.renderNode(
          this.appState.focusedNode
        );
      }

      // Update existing services with new data
      if (this.searchManager) {
        this.searchManager.updateLoomTree(newLoomTree);
        this.searchManager.rebuildIndex();
      }
      if (this.treeNav) {
        this.treeNav.renderTree(newLoomTree.root, this.DOM.loomTreeView);
      }

      // Render the new state
      this.updateUI();

      // Trigger an auto-save to create the temp file
      await this.autoSave();
    } catch (error) {
      console.error("Error in loadFileData:", error);
      throw error;
    }
  }

  /**
   * Auto-save current state
   */
  async autoSave() {
    if (!this.appState.focusedNode) {
      console.warn("Cannot auto-save: no focused node");
      return;
    }

    const data = {
      loomTree: this.appState.loomTree.serialize(),
      focus: this.appState.focusedNode,
      samplerSettingsStore: this.appState.samplerSettingsStore,
    };

    try {
      await window.electronAPI.autoSave(data);
    } catch (err) {
      console.error("Auto-save Error:", err);
    }
  }

  /**
   * Auto-save timer tick
   */
  async autoSaveTick() {
    this.appState.secondsSinceLastSave += 1;
    if (this.appState.secondsSinceLastSave >= 30) {
      this.autoSave();
      this.appState.secondsSinceLastSave = 0;
    }
  }

  /**
   * Initialize a fresh loom state
   */
  initializeFreshLoom() {
    // Create fresh loom tree
    this.appState.loomTree = new LoomTree();
    this.appState.focusedNode = this.appState.loomTree.root;

    // Reset editor to empty state
    this.DOM.editor.value = "";
    this.DOM.editor.readOnly = false;

    // Update existing services with fresh data
    if (this.searchManager) {
      this.searchManager.updateLoomTree(this.appState.loomTree);
      this.searchManager.rebuildIndex();
    }
    if (this.treeNav) {
      this.treeNav.renderTree(
        this.appState.loomTree.root,
        this.DOM.loomTreeView
      );
    }

    // Update all UI components
    this.updateUI();

    // Trigger auto-save to create temp file
    this.autoSave();
  }

  /**
   * Initialize file manager and load initial data
   */
  async init() {
    // Notify main process that renderer is ready and get any initial data (used to restore temp file after error)
    const initialData = await window.electronAPI.rendererReady();
    if (initialData) {
      await this.loadFileData(initialData);
    } else {
      // No temp file exists, create basic fresh state
      this.appState.loomTree = new LoomTree();
      this.appState.focusedNode = this.appState.loomTree.root;
      this.DOM.editor.value = "";
      this.DOM.editor.readOnly = false;
    }
  }

  /**
   * Set up file-related event handlers
   */
  setupEventHandlers() {
    // Set up main action handler
    window.electronAPI.onInvokeAction((event, action, ...args) => {
      switch (action) {
        case "save-file":
          this.saveFile();
          break;
        case "load-file":
          this.loadFile();
          break;
        case "load-recent-file":
          if (args.length > 0) {
            this.loadRecentFile(args[0]);
          }
          break;
        case "import-loomsidian":
          this.importLoomsidianFile();
          break;
        case "new-loom":
          window.electronAPI.newLoom();
          break;
        default:
          console.warn("FileManager: Action not recognized:", action);
      }
    });

    window.electronAPI.onLoadInitialData(async (event, initialData) => {
      try {
        if (initialData && initialData.data) {
          await this.loadFileData(initialData.data);
        }
      } catch (error) {
        console.error("Error loading initial data:", error);
        console.error("Error stack:", error.stack);
      }
    });

    window.electronAPI.onImportLoomsidianData(async (event, importData) => {
      try {
        if (importData && importData.data) {
          await this.processImportedLoomsidianData(importData.data);
        }
      } catch (error) {
        console.error("Error importing Loomsidian data:", error);
        console.error("Error stack:", error.stack);
      }
    });

    window.electronAPI.onResetToNewLoom(async event => {
      try {
        this.initializeFreshLoom();
      } catch (error) {
        console.error("Error resetting to new loom:", error);
        console.error("Error stack:", error.stack);
      }
    });

    // Set up final save request handler
    window.electronAPI.onRequestFinalSave(async event => {
      try {
        await this.autoSave();
      } catch (error) {
        console.error("Error in final save:", error);
      }
    });
  }

  /**
   * Start auto-save timer
   */
  startAutoSaveTimer() {
    if (this.autoSaveIntervalId) {
      clearInterval(this.autoSaveIntervalId);
    }
    this.autoSaveIntervalId = setInterval(() => this.autoSaveTick(), 1000);
  }

  /**
   * Clean up timers
   */
  cleanup() {
    if (this.autoSaveIntervalId) {
      clearInterval(this.autoSaveIntervalId);
      this.autoSaveIntervalId = null;
    }
  }
}

// Export for use in other modules
if (typeof window !== "undefined") {
  window.FileManager = FileManager;
}
