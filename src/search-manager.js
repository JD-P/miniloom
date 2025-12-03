class SearchManager {
  constructor({ focusOnNode, loomTree, treeNav } = {}) {
    // Private state
    this.searchResultsMode = false;
    this.currentSearchQuery = "";

    // Required dependencies
    this.focusOnNode = focusOnNode;
    this.loomTree = loomTree;
    this.treeNav = treeNav;

    // Initialize when DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    // DOM elements
    this.searchInput = document.getElementById("search-input");
    this.searchClearButton = document.getElementById("search-clear");
    this.searchContainer = document.getElementById("search-container");
    this.noResultsElement = document.getElementById("search-no-results");
    this.resultsContainer = document.getElementById("search-results-container");

    if (this.loomTree) {
      this.initializeSearchInput();
      this.initializeSearchIndex();
    } else {
      console.warn("loomTree isn't available for search initialization");
    }
  }

  // Extract meaningful content from diff patches
  extractPatchContent(patch) {
    if (!patch || typeof patch === "string") {
      return patch || "";
    }

    try {
      if (Array.isArray(patch)) {
        return patch
          .map(p => {
            if (p.diffs) {
              return p.diffs
                .filter(diff => diff[0] === 1)
                .map(diff => diff[1])
                .join(" ");
            }
            return "";
          })
          .join(" ");
      }
      return "";
    } catch (error) {
      console.warn("Error extracting patch content:", error);
      return "";
    }
  }

  addNodeToSearchIndex(node, fullText) {
    if (!node) return;

    const patchContent = this.extractPatchContent(node.patch);
    if (!patchContent.trim() && !node.summary) return;

    try {
      window.electronAPI.searchIndexAdd({
        id: node.id,
        content: patchContent,
        summary: window.utils.getNodeSummaryDisplayText(node.summary),
        type: node.type,
        timestamp: node.timestamp,
        fullContent: fullText,
      });
    } catch (error) {
      console.warn("Error adding node to search index:", error);
    }
  }

  initializeSearchIndex() {
    try {
      window.electronAPI.createMiniSearch({
        fields: ["content", "summary"],
        storeFields: ["content", "summary", "type", "timestamp", "fullContent"],
        searchOptions: {
          boost: {
            content: 3,
            summary: 2,
          },
          prefix: true,
          fuzzy: 0.2,
        },
      });

      // Add all existing nodes to the index
      Object.keys(this.loomTree.nodeStore).forEach(nodeId => {
        const node = this.loomTree.nodeStore[nodeId];
        if (node) {
          this.addNodeToSearchIndex(node, this.loomTree.renderNode(node));
        }
      });
    } catch (error) {
      console.error("Failed to initialize search index:", error);
    }
  }

  performSearch(query) {
    if (!query.trim()) {
      return [];
    }

    try {
      const results = window.electronAPI.searchIndexSearch(query, {
        boost: {
          content: 3,
          summary: 2,
        },
        prefix: true,
        fuzzy: 0.2,
      });

      return results.map(result => {
        const node = this.loomTree.nodeStore[result.id];
        return {
          node: node,
          score: result.score,
          highlightedContent: window.utils.highlightText(
            result.content || this.extractPatchContent(node.patch),
            query
          ),
          highlightedSummary: window.utils.highlightText(
            window.utils.getNodeSummaryDisplayText(result.summary),
            query
          ),
        };
      });
    } catch (error) {
      console.warn("Search error:", error);
      return [];
    }
  }

  renderSearchResults(query) {
    const results = this.performSearch(query);

    // Hide the tree view and show search results
    if (this.treeNav) {
      this.treeNav.hide();
    }

    if (results.length === 0) {
      this.noResultsElement.style.display = "block";
      this.resultsContainer.style.display = "none";
      return;
    }

    // Show results container and hide no results
    this.noResultsElement.style.display = "none";
    this.resultsContainer.style.display = "block";
    this.resultsContainer.innerHTML = "";

    results.forEach(result => {
      const resultItem = document.createElement("div");
      resultItem.className = "search-result-item";

      const header = document.createElement("div");
      header.className = "search-result-header";
      header.innerHTML = `📍 ${result.node.id}: ${result.highlightedSummary || window.utils.getNodeSummaryDisplayText(result.node.summary)}`;

      const content = document.createElement("div");
      content.className = "search-result-content";
      content.innerHTML = window.utils.truncateText(
        result.highlightedContent,
        150
      );

      const meta = document.createElement("div");
      meta.className = "search-result-meta";
      const formattedDate = window.utils.formatTimestamp(result.node.timestamp);

      // Get author info
      const authorEmoji =
        result.node.type === "gen"
          ? "🤖"
          : result.node.type === "import"
            ? "📥"
            : "👤";
      const authorName =
        result.node.type === "user"
          ? "Human"
          : result.node.type === "import"
            ? "Imported"
            : result.node.model || "Unknown";

      // Add rating indicators
      let ratingHtml = "";
      if (result.node.rating === true) {
        ratingHtml = '<span class="search-result-rating-positive">👍</span>';
      } else if (result.node.rating === false) {
        ratingHtml = '<span class="search-result-rating-negative">👎</span>';
      }

      let subtreeHtml = "";
      if (result.node.children && result.node.children.length > 0) {
        subtreeHtml = ` | 🍃 ${result.node.treeStats.totalChildNodes}`;
      }

      // Build the metadata line with proper separators
      let metadataLine = `🕐 ${formattedDate} | 📏 ${result.node.depth}`;
      if (ratingHtml) {
        metadataLine += ` | ${ratingHtml}`;
      }
      if (subtreeHtml) {
        metadataLine += subtreeHtml;
      }

      meta.innerHTML = `
        <div>${authorEmoji} ${authorName}</div>
        <div>${metadataLine}</div>
        <div class="search-result-date">Score: ${result.score.toFixed(3)}</div>
      `;

      resultItem.appendChild(header);
      resultItem.appendChild(content);
      resultItem.appendChild(meta);

      resultItem.onclick = () => {
        this.focusOnNode(result.node.id);
      };

      this.resultsContainer.appendChild(resultItem);
    });
  }

  clearSearchState() {
    this.currentSearchQuery = "";
    this.searchResultsMode = false;

    if (this.treeNav) {
      this.treeNav.show();
    }
    if (this.noResultsElement) this.noResultsElement.style.display = "none";
    if (this.resultsContainer) this.resultsContainer.style.display = "none";
  }

  initializeSearchInput() {
    if (!this.searchInput || !this.searchClearButton) {
      console.warn("Search elements not found in DOM");
      return;
    }

    // Search as you type with debouncing
    let searchTimeout;
    this.searchInput.addEventListener("input", e => {
      clearTimeout(searchTimeout);
      const query = e.target.value;

      // Show/hide clear button based on input content
      this.searchClearButton.style.display = query.trim() ? "block" : "none";

      searchTimeout = setTimeout(() => {
        this.currentSearchQuery = query;
        this.searchResultsMode = query.trim().length > 0;

        if (this.searchResultsMode) {
          this.renderSearchResults(query);
        } else {
          this.clearSearchState();
        }
      }, 200);
    });

    // Handle clear button click
    this.searchClearButton.addEventListener("click", () => {
      this.searchInput.value = "";
      this.searchClearButton.style.display = "none";
      this.clearSearchState();
    });

    // Handle keyboard navigation
    this.searchInput.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        e.target.value = "";
        this.searchClearButton.style.display = "none";
        this.clearSearchState();
      } else if (e.key === "Enter") {
        // Re-run search on Enter, even if text hasn't changed
        const query = e.target.value.trim();
        if (query) {
          this.currentSearchQuery = query;
          this.searchResultsMode = true;
          this.renderSearchResults(query);
        }
      }
    });

    // Clear search and restore tree view when clicking outside
    document.addEventListener("click", e => {
      if (this.searchContainer && !this.searchContainer.contains(e.target)) {
        if (this.searchResultsMode) {
          this.clearSearchState();
        }
      }
    });
  }

  updateNode(node, fullText) {
    if (!node) return;

    try {
      window.electronAPI.searchIndexReplace({
        id: node.id,
        content: this.extractPatchContent(node.patch),
        summary: window.utils.getNodeSummaryDisplayText(node.summary),
        type: node.type,
        timestamp: node.timestamp,
        fullContent: fullText,
      });
    } catch (error) {
      console.warn("Error updating node in search index:", error);
    }
  }

  removeNode(node) {
    try {
      window.electronAPI.searchIndexRemove(node);
    } catch (error) {
      console.warn("Error removing node from search index:", error);
    }
  }

  rebuildIndex() {
    window.electronAPI.searchIndexRemoveAll();
    Object.keys(this.loomTree.nodeStore).forEach(nodeId => {
      const node = this.loomTree.nodeStore[nodeId];
      if (node) {
        this.addNodeToSearchIndex(node, this.loomTree.renderNode(node));
      }
    });
  }

  getSearchState() {
    return {
      isActive: this.searchResultsMode,
      query: this.currentSearchQuery,
    };
  }

  updateLoomTree(newLoomTree) {
    this.loomTree = newLoomTree;
  }
}

// Export the SearchManager class
window.SearchManager = SearchManager;
