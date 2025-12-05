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
  chatToggleContainer: document.getElementById("chat-toggle-container"),
  chatToggle: document.getElementById("chat-toggle"),
  chatView: document.getElementById("chat-view"),
  chatMessages: document.getElementById("chat-messages"),
  chatInput: document.getElementById("chat-input"),
  chatSendButton: document.getElementById("chat-send-button"),
  generateButtonContainer: document.getElementById("generate-button-container"),
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

// Chat view state
let chatViewMode = "text"; // "text" or "chat"
let editingMessageIndex = null; // Index of message being edited, or null
let chatGenerationInProgress = false; // Track if generation is in progress

// Validate that required settings are configured before generation
function validateGenerationSettings() {
  const samplerSettingsStore = appState.getSamplerSettingsStore();
  const selectedApiKeyName = DOM.apiKeySelector?.value || "";

  // Check if API key is selected
  if (!selectedApiKeyName || selectedApiKeyName === "") {
    // Flash the API key dropdown
    flashElement(DOM.apiKeySelector, "warning-flash");

    // Show user-friendly error
    showChatError(
      "You must select an API key before you can use chat completions"
    );
    return false;
  }

  // Check if the API key actually has a value
  const apiKey = samplerSettingsStore["api-keys"]?.[selectedApiKeyName] || "";
  if (!apiKey || apiKey.trim() === "") {
    flashElement(DOM.apiKeySelector, "warning-flash");
    showChatError(
      "The selected API key is empty. Please configure it in settings."
    );
    return false;
  }

  return true;
}

// Flash an element with a CSS class for visual feedback
function flashElement(element, className, duration = 2000) {
  if (!element) return;

  element.classList.add(className);
  setTimeout(() => {
    element.classList.remove(className);
  }, duration);
}

// Show error in the chat context
function showChatError(message) {
  // Use the existing error display system
  if (DOM.errorMsgEl && DOM.errorsEl) {
    DOM.errorMsgEl.textContent = message;
    DOM.errorsEl.classList.add("has-error");
  }

  // Also clear the loading state
  setChatGenerationLoading(false);
}

function isChatCompletionMethod() {
  if (!llmService) return false;
  try {
    const params = llmService.prepareGenerationParams();
    return (
      params.samplingMethod === "openai-chat" ||
      params.samplingMethod === "openrouter-chat"
    );
  } catch (error) {
    return false;
  }
}

function updateChatToggleVisibility() {
  const isChatMethod = isChatCompletionMethod();
  if (DOM.chatToggleContainer) {
    const wasVisible =
      DOM.chatToggleContainer.style.display !== "none" &&
      DOM.chatToggleContainer.style.display !== "";
    DOM.chatToggleContainer.style.display = isChatMethod ? "flex" : "none";

    // Initialize toggle buttons if they exist
    if (isChatMethod && DOM.chatToggle) {
      const toggleOptions = DOM.chatToggle.querySelectorAll(".toggle-option");
      const activeOption = DOM.chatToggle.querySelector(
        ".toggle-option.active"
      );

      // If no active option, default to chat mode
      if (!activeOption || toggleOptions.length === 0) {
        chatViewMode = "chat";
        toggleOptions.forEach(option => {
          option.classList.remove("active");
          if (option.dataset.mode === "chat") {
            option.classList.add("active");
          }
        });
      } else {
        // Sync chatViewMode with active toggle option
        chatViewMode = activeOption.dataset.mode || "chat";
      }
    }

    // If toggle just became visible, ensure view mode matches and render
    if (isChatMethod && !wasVisible) {
      // Default to chat mode if toggle just appeared
      chatViewMode = "chat";
      if (DOM.chatToggle) {
        const toggleOptions = DOM.chatToggle.querySelectorAll(".toggle-option");
        toggleOptions.forEach(option => {
          option.classList.remove("active");
          if (option.dataset.mode === "chat") {
            option.classList.add("active");
          }
        });
      }
      // Force render when toggle first appears - use setTimeout to ensure DOM is ready
      setTimeout(() => {
        updateViewMode();
      }, 50);
    }
  }

  if (!isChatMethod && chatViewMode === "chat") {
    chatViewMode = "text";
    updateViewMode();
  }

  // Update generate button visibility
  updateGenerateButtonVisibility();

  // If we're in chat mode and chat method is available, ensure view is rendered
  if (isChatMethod && chatViewMode === "chat") {
    // Ensure chat view is rendered
    setTimeout(() => {
      if (DOM.chatView && DOM.chatView.style.display !== "none") {
        renderChatView();
      }
    }, 10);
  }
}

function updateGenerateButtonVisibility() {
  if (chatViewMode === "chat") {
    // Hide generate button in chat mode
    if (DOM.generateButtonContainer) {
      DOM.generateButtonContainer.style.display = "none";
    }
    if (DOM.generateButton) {
      DOM.generateButton.style.display = "none";
    }
    if (DOM.die) {
      DOM.die.style.display = "none";
    }
  } else {
    // Show generate button in text mode
    if (DOM.generateButtonContainer) {
      DOM.generateButtonContainer.style.display = "flex";
    }
    if (DOM.generateButton) {
      DOM.generateButton.style.display = "flex";
    }
    if (DOM.die) {
      DOM.die.style.display = "flex";
    }
  }
}

function updateViewMode() {
  // Cancel any ongoing editing when switching modes
  editingMessageIndex = null;

  if (!DOM.editor || !DOM.chatView) {
    console.warn(
      "Cannot update view mode: editor or chatView elements not found"
    );
    return;
  }

  if (chatViewMode === "chat") {
    DOM.editor.style.display = "none";
    DOM.chatView.style.display = "flex";
    // Always render chat view when switching to chat mode
    // Use setTimeout to ensure DOM is ready after display change
    setTimeout(() => {
      if (DOM.chatView && DOM.chatView.style.display !== "none") {
        renderChatView();
      }
    }, 10);
  } else {
    DOM.editor.style.display = "block";
    DOM.chatView.style.display = "none";
  }

  // Update generate button visibility
  updateGenerateButtonVisibility();
}

function validateChatML(text) {
  try {
    const data = JSON.parse(text);
    if (!data.messages || !Array.isArray(data.messages)) {
      return { valid: false, error: "ChatML must have a 'messages' array" };
    }
    for (const msg of data.messages) {
      if (!msg.role || !msg.content) {
        return {
          valid: false,
          error: "Each message must have 'role' and 'content' fields",
        };
      }
      if (!["user", "assistant", "system"].includes(msg.role)) {
        return {
          valid: false,
          error: `Invalid role: ${msg.role}. Must be 'user', 'assistant', or 'system'`,
        };
      }
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Invalid JSON: ${error.message}` };
  }
}

function parseChatML(text) {
  // Handle null, undefined, or non-string values
  if (text == null || text === undefined) {
    return [];
  }

  // Convert to string safely
  let textStr = "";
  try {
    if (typeof text === "string") {
      textStr = text;
    } else if (text != null) {
      textStr = String(text);
    } else {
      return [];
    }
  } catch (e) {
    return [];
  }

  // Ensure textStr is a valid string
  if (
    !textStr ||
    typeof textStr !== "string" ||
    textStr === "null" ||
    textStr === "undefined"
  ) {
    return [];
  }

  // Safely trim the string - handle null/undefined before calling trim
  let trimmedText = "";
  try {
    if (textStr && typeof textStr.trim === "function") {
      trimmedText = textStr.trim();
    } else {
      // Fallback: use replace if trim fails
      trimmedText = textStr.replace(/^\s+|\s+$/g, "");
    }
  } catch (e) {
    // Fallback: use replace if trim fails
    try {
      trimmedText = textStr.replace(/^\s+|\s+$/g, "");
    } catch (e2) {
      trimmedText = textStr || "";
    }
  }

  // If empty after trimming, return empty array
  if (!trimmedText || trimmedText.length === 0) {
    return [];
  }

  try {
    const data = JSON.parse(trimmedText);
    if (data && data.messages && Array.isArray(data.messages)) {
      // Validate messages array - filter out invalid messages
      return data.messages.filter(msg => {
        return (
          msg &&
          typeof msg === "object" &&
          msg.role &&
          (msg.content !== undefined ||
            msg.reasoning !== undefined ||
            msg.answer !== undefined)
        );
      });
    }
    // Fallback: treat as single user message if it's not valid JSON
    if (trimmedText && trimmedText.length > 0) {
      return [{ role: "user", content: trimmedText }];
    }
    return [];
  } catch (error) {
    // If not valid JSON, treat as single user message
    if (trimmedText && trimmedText.length > 0) {
      return [{ role: "user", content: trimmedText }];
    }
    return [];
  }
}

// Extract content from message, handling reasoning/answer fields
function getMessageContent(msg) {
  if (!msg) return "";

  // Handle reasoning/answer structure (OpenRouter format) with distinct rendering
  if (msg.reasoning && (msg.answer || msg.content)) {
    const reasoning = String(msg.reasoning);
    const answer = msg.answer
      ? String(msg.answer)
      : msg.content
        ? String(msg.content)
        : "";
    // Return structured format that will be rendered specially
    return { type: "reasoning", reasoning, answer };
  }
  if (msg.content) {
    return String(msg.content);
  }
  if (msg.answer) {
    return String(msg.answer);
  }
  if (msg.reasoning) {
    return String(msg.reasoning);
  }
  return "";
}

// Render message content, handling reasoning blocks specially
function renderMessageContent(contentOrObj) {
  if (!contentOrObj) return "";

  // Handle reasoning/answer structure
  if (typeof contentOrObj === "object" && contentOrObj.type === "reasoning") {
    const reasoningHtml = renderMarkdown(contentOrObj.reasoning);
    const answerHtml = renderMarkdown(contentOrObj.answer);

    return `
      <details class="reasoning-block" open>
        <summary class="reasoning-summary">💭 Reasoning</summary>
        <div class="reasoning-content">${reasoningHtml}</div>
      </details>
      <div class="answer-content">${answerHtml}</div>
    `;
  }

  // Regular string content
  return renderMarkdown(String(contentOrObj));
}

// Configure marked once at startup
let markedConfigured = false;

function configureMarked() {
  if (markedConfigured || !window.marked) return;

  try {
    // Custom code block renderer for marked v17+
    const renderer = {
      code(token) {
        // In marked v17+, code receives a token object
        const text =
          typeof token === "object" ? token.text || "" : String(token || "");
        const lang = typeof token === "object" ? token.lang || "" : "";
        const escaped = escapeHtml(text);
        return `<div class="code-block"><pre><code class="language-${lang}">${escaped}</code></pre></div>`;
      },
    };

    marked.use({
      renderer,
      breaks: true,
      gfm: true,
      async: false, // Ensure synchronous parsing
    });

    markedConfigured = true;
  } catch (e) {
    console.warn("Failed to configure marked:", e);
  }
}

// Whitelist of allowed HTML tags
const ALLOWED_HTML_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "a",
  "div",
];

// Sanitize HTML to only allow whitelisted tags
function sanitizeHtml(html) {
  if (typeof html !== "string") {
    html = String(html || "");
  }
  const div = document.createElement("div");
  div.innerHTML = html;

  const walker = document.createTreeWalker(
    div,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    null
  );

  const nodesToRemove = [];
  let node;

  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (!ALLOWED_HTML_TAGS.includes(node.tagName.toLowerCase())) {
        nodesToRemove.push(node);
      } else {
        const tagName = node.tagName.toLowerCase();
        if (tagName === "a") {
          const href = node.getAttribute("href");
          if (
            href &&
            (href.startsWith("http://") || href.startsWith("https://"))
          ) {
            node.setAttribute("target", "_blank");
            node.setAttribute("rel", "noopener noreferrer");
          } else {
            node.removeAttribute("href");
          }
        }
        // Keep class attribute for code blocks and divs
        const keepClass =
          tagName === "code" || tagName === "div" || tagName === "pre";
        Array.from(node.attributes).forEach(attr => {
          if (
            attr.name !== "href" &&
            attr.name !== "target" &&
            attr.name !== "rel" &&
            !(keepClass && attr.name === "class")
          ) {
            node.removeAttribute(attr.name);
          }
        });
      }
    }
  }

  nodesToRemove.forEach(n => {
    const parent = n.parentNode;
    while (n.firstChild) {
      parent.insertBefore(n.firstChild, n);
    }
    parent.removeChild(n);
  });

  return div.innerHTML;
}

// Safe markdown renderer with whitelist
function renderMarkdown(text) {
  if (!text && text !== 0) return "";

  const textStr = String(text || "");

  if (!window.marked) {
    // Fallback if marked isn't loaded
    return escapeHtml(textStr).replace(/\n/g, "<br>");
  }

  // Configure marked on first use
  configureMarked();

  // Render markdown
  let html;
  try {
    const result = marked.parse(textStr);
    // Handle both sync and async returns, and ensure it's a string
    if (typeof result === "string") {
      html = result;
    } else if (result && typeof result.then === "function") {
      // If it returns a promise, fall back to simple rendering
      console.warn(
        "Marked returned a promise, falling back to simple rendering"
      );
      html = escapeHtml(textStr).replace(/\n/g, "<br>");
    } else if (result && typeof result === "object") {
      // If it's an object (shouldn't happen), try to stringify
      console.warn("Marked returned an object:", result);
      html = escapeHtml(textStr).replace(/\n/g, "<br>");
    } else {
      html = String(result || "");
    }
  } catch (parseError) {
    console.warn("Marked parse error:", parseError);
    html = escapeHtml(textStr).replace(/\n/g, "<br>");
  }

  // Sanitize the HTML
  html = sanitizeHtml(html);

  // Process LaTeX math expressions
  // First handle display math: $$...$$
  html = html.replace(/\$\$([^$]+?)\$\$/g, (match, formula) => {
    return `<div class="math-display">\\[${escapeHtml(formula)}\\]</div>`;
  });

  // Then handle inline math: $...$ (but not $$ which we already processed)
  html = html.replace(/\$([^$\n]+?)\$/g, (match, formula) => {
    return `<span class="math-inline">\\(${escapeHtml(formula)}\\)</span>`;
  });

  // Also handle \(...\) and \[...\] if not already processed
  html = html.replace(/\\\(([^)]+?)\\\)/g, (match, formula) => {
    return `<span class="math-inline">\\(${escapeHtml(formula)}\\)</span>`;
  });
  html = html.replace(/\\\[([^\]]+?)\\\]/g, (match, formula) => {
    return `<div class="math-display">\\[${escapeHtml(formula)}\\]</div>`;
  });

  return html;
}

// Queue MathJax typesetting with debouncing to avoid conflicts
let mathJaxQueue = [];
let mathJaxTimeout = null;

function queueMathJaxTypesetting() {
  if (mathJaxTimeout) {
    clearTimeout(mathJaxTimeout);
  }

  mathJaxTimeout = setTimeout(() => {
    if (window.MathJax && window.MathJax.typesetPromise) {
      // Find all math elements that are currently in the DOM
      const mathElements = document.querySelectorAll(
        ".chat-message-content .math-inline, .chat-message-content .math-display"
      );

      if (mathElements.length > 0) {
        // Filter to only elements that are still in the document
        const validElements = Array.from(mathElements).filter(el =>
          document.body.contains(el)
        );

        if (validElements.length > 0) {
          window.MathJax.typesetPromise(validElements).catch(err => {
            // Only log if it's not a replaceChild error (which happens during re-renders)
            if (!err.message || !err.message.includes("replaceChild")) {
              console.warn("MathJax rendering error:", err);
            }
          });
        }
      }
    }
  }, 200);
}

function escapeHtml(text) {
  if (text == null) return "";
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

function copyToClipboard(text, buttonElement = null) {
  const showCopyFeedback = success => {
    if (!buttonElement) return;

    // Store original content
    const originalContent = buttonElement.innerHTML;

    // Show checkmark feedback
    buttonElement.innerHTML = success ? "✓" : "✗";
    buttonElement.classList.add("copy-success");

    // Animate the button
    buttonElement.style.transform = "scale(1.2)";

    setTimeout(() => {
      buttonElement.style.transform = "scale(1)";
    }, 150);

    // Restore original content after delay
    setTimeout(() => {
      buttonElement.innerHTML = originalContent;
      buttonElement.classList.remove("copy-success");
    }, 1000);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => showCopyFeedback(true))
      .catch(err => {
        console.error("Failed to copy:", err);
        showCopyFeedback(false);
      });
  } else {
    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      showCopyFeedback(true);
    } catch (err) {
      console.error("Failed to copy:", err);
      showCopyFeedback(false);
    }
    document.body.removeChild(textarea);
  }
}

function renderChatView(options = {}) {
  const { preserveScroll = false, scrollToMessage = null } = options;

  // Save scroll position before re-rendering if needed
  let savedScrollTop = 0;
  if (preserveScroll && DOM.chatMessages) {
    savedScrollTop = DOM.chatMessages.scrollTop;
  }

  if (!appState || !appState.focusedNode) {
    console.warn("Cannot render chat view: appState or focusedNode is null");
    if (DOM.chatMessages) {
      DOM.chatMessages.innerHTML =
        '<div class="chat-empty-state">No messages yet. Start a conversation!</div>';
    }
    return;
  }
  if (!DOM.chatMessages) {
    console.warn("Cannot render chat view: chatMessages element not found");
    return;
  }

  let text = "";
  try {
    const node = appState.focusedNode;
    if (
      node &&
      node.cachedRenderText != null &&
      node.cachedRenderText !== undefined
    ) {
      const renderText = node.cachedRenderText;
      if (typeof renderText === "string") {
        text = renderText;
      } else if (renderText != null) {
        text = String(renderText);
      } else {
        text = "";
      }
    } else {
      text = "";
    }
  } catch (e) {
    console.warn("Error getting cachedRenderText:", e);
    text = "";
  }

  // Ensure text is a valid string before parsing
  if (text == null || text === undefined) {
    text = "";
  }
  if (typeof text !== "string") {
    text = String(text || "");
  }

  let messages = [];
  try {
    messages = parseChatML(text);
    if (!Array.isArray(messages)) {
      console.warn("parseChatML returned non-array, using empty array");
      messages = [];
    }
  } catch (e) {
    console.error("Error parsing ChatML:", e);
    messages = [];
  }

  // Show empty state if no messages
  if (!Array.isArray(messages) || messages.length === 0) {
    if (DOM.chatMessages) {
      DOM.chatMessages.innerHTML =
        '<div class="chat-empty-state">No messages yet. Start a conversation!</div>';
    }
    return;
  }

  // Clear any existing content
  DOM.chatMessages.innerHTML = "";

  messages.forEach((msg, index) => {
    if (!msg || typeof msg !== "object") {
      console.warn("Invalid message at index", index, msg);
      return;
    }

    // Ensure msg.role is valid
    const role = msg.role || "user";
    if (!["user", "assistant", "system"].includes(role)) {
      console.warn("Invalid role in message at index", index, role);
      return;
    }

    const messageDiv = document.createElement("div");
    messageDiv.className = `chat-message ${role}`;
    messageDiv.dataset.messageIndex = index;

    const header = document.createElement("div");
    header.className = "chat-message-header";

    // Get model name from the focused node for assistant messages
    let headerText =
      role === "user" ? "User" : role === "system" ? "System" : "AI Assistant";
    if (role === "assistant") {
      // Check if the message itself has a model specified (for future per-message tracking)
      const messageModel =
        msg.model || (appState.focusedNode && appState.focusedNode.model);
      if (messageModel) {
        headerText = `AI Assistant (${messageModel})`;
      }
    }
    header.textContent = headerText;

    // Message actions (copy/edit buttons)
    const actions = document.createElement("div");
    actions.className = "chat-message-actions";

    const messageContent = getMessageContent(msg) || "";
    const isLastMessage = index === messages.length - 1;

    // Get plain text version for copying
    const copyText =
      typeof messageContent === "object" && messageContent.type === "reasoning"
        ? `Reasoning:\n${messageContent.reasoning}\n\nAnswer:\n${messageContent.answer}`
        : String(messageContent);

    const copyBtn = document.createElement("button");
    copyBtn.className = "chat-action-btn copy-btn";
    copyBtn.title = "Copy message";
    copyBtn.innerHTML = "📋";
    copyBtn.addEventListener("click", e => {
      e.stopPropagation();
      copyToClipboard(copyText, copyBtn);
    });

    const editBtn = document.createElement("button");
    editBtn.className = "chat-action-btn edit-btn";
    editBtn.title = "Edit message";
    editBtn.innerHTML = "✏️";
    editBtn.addEventListener("click", e => {
      e.stopPropagation();
      startEditingMessage(index, msg);
    });

    actions.appendChild(copyBtn);

    // Add thumbs up/down buttons only on the last message (syncs with main app rating)
    if (isLastMessage && !chatGenerationInProgress) {
      const thumbUpBtn = document.createElement("button");
      thumbUpBtn.className = "chat-action-btn thumb-btn";
      thumbUpBtn.title = "Rate this branch positively";
      thumbUpBtn.innerHTML =
        appState.focusedNode && appState.focusedNode.rating === true
          ? "👍"
          : "👍";
      if (appState.focusedNode && appState.focusedNode.rating === true) {
        thumbUpBtn.classList.add("active", "thumb-up-active");
      }
      thumbUpBtn.addEventListener("click", e => {
        e.stopPropagation();
        handleThumbRating(true);
        renderChatView(); // Re-render to update button state
      });

      const thumbDownBtn = document.createElement("button");
      thumbDownBtn.className = "chat-action-btn thumb-btn";
      thumbDownBtn.title = "Rate this branch negatively";
      thumbDownBtn.innerHTML = "👎";
      if (appState.focusedNode && appState.focusedNode.rating === false) {
        thumbDownBtn.classList.add("active", "thumb-down-active");
      }
      thumbDownBtn.addEventListener("click", e => {
        e.stopPropagation();
        handleThumbRating(false);
        renderChatView(); // Re-render to update button state
      });

      actions.appendChild(thumbUpBtn);
      actions.appendChild(thumbDownBtn);
    }

    actions.appendChild(editBtn);

    // Add reroll button only on the last message
    if (isLastMessage && !chatGenerationInProgress) {
      const rerollBtn = document.createElement("button");
      rerollBtn.className = "chat-action-btn reroll-btn";
      rerollBtn.title = "Generate more responses from this point";
      rerollBtn.innerHTML = "🎲";
      rerollBtn.addEventListener("click", e => {
        e.stopPropagation();
        rerollFromCurrentChat();
      });
      actions.appendChild(rerollBtn);
    }

    const content = document.createElement("div");
    content.className = "chat-message-content";

    if (editingMessageIndex === index) {
      // Show edit mode - use plain text version for editing
      const editText =
        typeof messageContent === "object" &&
        messageContent.type === "reasoning"
          ? messageContent.answer // Edit just the answer, not the reasoning
          : String(messageContent);

      const editTextarea = document.createElement("textarea");
      editTextarea.className = "chat-message-edit-input";
      editTextarea.value = editText;
      editTextarea.rows = Math.min(editTextarea.value.split("\n").length, 10);

      const editActions = document.createElement("div");
      editActions.className = "chat-edit-actions";

      const saveBtn = document.createElement("button");
      saveBtn.className = "chat-edit-btn save-btn";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => {
        saveEditedMessage(index, editTextarea.value);
      });

      // Show "Save and Resubmit" for the last message (user or assistant)
      if (isLastMessage) {
        const saveResubmitBtn = document.createElement("button");
        saveResubmitBtn.className = "chat-edit-btn save-resubmit-btn";
        saveResubmitBtn.textContent = "Save and Resubmit";
        saveResubmitBtn.addEventListener("click", () => {
          saveAndResubmitMessage(index, editTextarea.value);
        });
        editActions.appendChild(saveResubmitBtn);
      }

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "chat-edit-btn cancel-btn";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => {
        cancelEditing();
      });

      editActions.appendChild(saveBtn);
      editActions.appendChild(cancelBtn);

      content.appendChild(editTextarea);
      content.appendChild(editActions);
    } else {
      // Show rendered markdown (with special handling for reasoning blocks)
      content.innerHTML = renderMessageContent(messageContent);
    }

    content.dataset.messageIndex = index;
    content.dataset.messageRole = role;

    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    messageDiv.appendChild(actions);
    DOM.chatMessages.appendChild(messageDiv);
  });

  // Add loading indicator if generation is in progress
  if (chatGenerationInProgress) {
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "chat-loading-indicator";
    loadingDiv.id = "chat-loading-indicator";
    loadingDiv.innerHTML = `
      <span>AI is thinking</span>
      <span class="loading-dots">
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
      </span>
    `;
    DOM.chatMessages.appendChild(loadingDiv);
  }

  // Handle scroll position
  setTimeout(() => {
    if (DOM.chatMessages) {
      if (scrollToMessage !== null) {
        // Scroll to the specific message being edited
        const messageElement = DOM.chatMessages.querySelector(
          `[data-message-index="${scrollToMessage}"]`
        );
        if (messageElement) {
          messageElement.scrollIntoView({
            block: "center",
            behavior: "instant",
          });
        }
      } else if (preserveScroll) {
        // Restore the saved scroll position
        DOM.chatMessages.scrollTop = savedScrollTop;
      } else {
        // Default: scroll to bottom
        DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
      }
    }
  }, 0);

  // Highlight code blocks
  setTimeout(() => {
    if (window.hljs && DOM.chatMessages) {
      DOM.chatMessages.querySelectorAll("pre code").forEach(block => {
        try {
          hljs.highlightElement(block);
        } catch (e) {
          console.warn("Error highlighting code block:", e);
        }
      });
    }
  }, 100);

  // Queue MathJax typesetting
  queueMathJaxTypesetting();
}

function setChatGenerationLoading(isLoading) {
  chatGenerationInProgress = isLoading;

  // Update send button state
  if (DOM.chatSendButton) {
    if (isLoading) {
      DOM.chatSendButton.classList.add("loading");
      DOM.chatSendButton.disabled = true;
    } else {
      DOM.chatSendButton.classList.remove("loading");
      DOM.chatSendButton.disabled = false;
    }
  }

  // Update chat input state
  if (DOM.chatInput) {
    DOM.chatInput.disabled = isLoading;
    if (isLoading) {
      DOM.chatInput.placeholder = "Generating response...";
    } else {
      DOM.chatInput.placeholder = "Type your message...";
    }
  }

  // If we're in chat mode, re-render to show/hide the loading indicator
  if (
    chatViewMode === "chat" &&
    DOM.chatView &&
    DOM.chatView.style.display !== "none"
  ) {
    renderChatView();
  }
}

function startEditingMessage(index, msg) {
  editingMessageIndex = index;
  renderChatView({ preserveScroll: true, scrollToMessage: index });
}

function cancelEditing() {
  editingMessageIndex = null;
  renderChatView({ preserveScroll: true });
}

async function saveEditedMessage(index, newContent) {
  if (!appState || !appState.focusedNode) return;

  try {
    const node = appState.focusedNode;
    let text = "";
    if (node && node.cachedRenderText != null) {
      text = String(node.cachedRenderText || "");
    }

    const messages = parseChatML(text);

    if (messages[index]) {
      messages[index].content = String(newContent || "").trim();
    }

    const chatML = JSON.stringify({ messages }, null, 2);

    // Check if we need to create a child node (if current node has children or is a gen/root node)
    const needsChildNode =
      node.children.length > 0 ||
      ["gen", "rewrite", "root"].includes(node.type);

    if (needsChildNode) {
      // Create a new child node with the edited content - use temporary summary
      const child = appState.loomTree.createNode(
        "user",
        node,
        chatML,
        "Editing..."
      );

      // Preserve model info from parent if available
      if (node.model) {
        child.model = node.model;
      }

      // Update search index for the new child
      if (searchManager) {
        try {
          searchManager.addNodeToSearchIndex(
            child,
            appState.loomTree.renderNode(child)
          );
        } catch (e) {
          console.warn("Error updating search index:", e);
        }
      }

      // Update focus to the new child node
      editingMessageIndex = null;
      updateFocus(child.id, "chat-edit");

      // Generate proper summary async
      generateSummaryForNode(child, newContent);
    } else {
      // Update the existing node (only for fresh user nodes with no children)
      appState.loomTree.updateNode(node, chatML, node.summary || "Editing...");

      if (DOM.editor) {
        DOM.editor.value = chatML;
      }

      if (searchManager && node) {
        try {
          searchManager.updateNode(node, appState.loomTree.renderNode(node));
        } catch (e) {
          console.warn("Error updating search index:", e);
        }
      }

      editingMessageIndex = null;
      renderChatView();

      // Generate proper summary async
      generateSummaryForNode(node, newContent);
    }

    updateTreeStatsDisplay();
  } catch (error) {
    console.error("Error saving edited message:", error);
    alert("Error saving message: " + (error.message || String(error)));
  }
}

// Generate summary for a node asynchronously
async function generateSummaryForNode(node, content) {
  if (!llmService || !node) return;

  try {
    const summary = await llmService.generateSummary(
      content || node.cachedRenderText
    );
    if (summary && summary !== "Branch Error") {
      // Update the node's summary
      node.summary = summary;

      // Update the tree view to reflect the new summary
      if (treeNav) {
        treeNav.updateTreeView();
      }

      // Update search index
      if (searchManager) {
        try {
          searchManager.updateNode(node, appState.loomTree.renderNode(node));
        } catch (e) {
          console.warn("Error updating search index after summary:", e);
        }
      }
    }
  } catch (error) {
    console.warn("Failed to generate summary for node:", error);
    // Keep the temporary summary if generation fails
  }
}

function saveAndResubmitMessage(index, newContent) {
  if (!appState || !appState.focusedNode) return;

  // Validate settings before attempting to generate
  if (!validateGenerationSettings()) {
    return;
  }

  try {
    const node = appState.focusedNode;
    let text = "";
    if (node && node.cachedRenderText != null) {
      text = String(node.cachedRenderText || "");
    }

    const messages = parseChatML(text);

    if (messages[index]) {
      messages[index].content = String(newContent || "").trim();
    }

    const chatML = JSON.stringify({ messages }, null, 2);

    // Validate the ChatML
    const validation = validateChatML(chatML);
    if (!validation.valid) {
      alert(`Invalid ChatML: ${validation.error}`);
      return;
    }

    // Always create a child node for save and resubmit - use temporary summary
    const child = appState.loomTree.createNode(
      "user",
      node,
      chatML,
      "Resubmitting..."
    );

    // Preserve model info from parent if available
    if (node.model) {
      child.model = node.model;
    }

    // Update search index for the new child
    if (searchManager) {
      try {
        searchManager.addNodeToSearchIndex(
          child,
          appState.loomTree.renderNode(child)
        );
      } catch (e) {
        console.warn("Error updating search index:", e);
      }
    }

    editingMessageIndex = null;

    // Update focus to the new child node
    updateFocus(child.id, "chat-resubmit");

    updateTreeStatsDisplay();

    // Show loading state
    setChatGenerationLoading(true);

    // Generate summary async (in background)
    generateSummaryForNode(child, newContent);

    // Generate new response on the child node
    if (llmService) {
      llmService.generateNewResponses(child.id);
    }
  } catch (error) {
    console.error("Error saving and resubmitting message:", error);
    setChatGenerationLoading(false);
    alert("Error saving message: " + (error.message || String(error)));
  }
}

// Reroll from current chat - generate more children from the current state
function rerollFromCurrentChat() {
  if (!appState || !appState.focusedNode) {
    console.error("Cannot reroll: appState or focusedNode is null");
    return;
  }

  // Validate settings before attempting to generate
  if (!validateGenerationSettings()) {
    return;
  }

  try {
    const node = appState.focusedNode;

    // Validate the current ChatML
    const validation = validateChatML(node.cachedRenderText || "");
    if (!validation.valid) {
      alert(`Invalid ChatML: ${validation.error}`);
      return;
    }

    // Show loading state
    setChatGenerationLoading(true);

    // Generate new responses on the current node
    if (llmService) {
      llmService.generateNewResponses(node.id);
    }
  } catch (error) {
    console.error("Error rerolling chat:", error);
    setChatGenerationLoading(false);
    alert("Error generating response: " + (error.message || String(error)));
  }
}

// Removed updateChatMLFromUI - now using explicit save functions

function sendChatMessage() {
  if (!DOM.chatInput) {
    console.error("Chat input element not found");
    return;
  }

  const inputText = DOM.chatInput.value
    ? String(DOM.chatInput.value).trim()
    : "";
  if (!inputText) return;

  if (!appState || !appState.focusedNode) {
    console.error("Cannot send message: appState or focusedNode is null");
    return;
  }

  // Validate settings before sending
  if (!validateGenerationSettings()) {
    return;
  }

  try {
    const node = appState.focusedNode;
    let currentText = "";
    if (
      node &&
      node.cachedRenderText != null &&
      node.cachedRenderText !== undefined
    ) {
      const renderText = node.cachedRenderText;
      if (typeof renderText === "string") {
        currentText = renderText;
      } else if (renderText != null) {
        currentText = String(renderText);
      }
    }

    let messages = [];
    try {
      messages = parseChatML(currentText);
      if (!Array.isArray(messages)) {
        console.warn("parseChatML returned non-array, creating new array");
        messages = [];
      }
    } catch (e) {
      console.warn("Error parsing current ChatML, starting fresh:", e);
      messages = [];
    }

    // Add new user message
    messages.push({ role: "user", content: inputText });

    const chatML = JSON.stringify({ messages }, null, 2);

    // Clear input immediately for better UX
    DOM.chatInput.value = "";
    if (DOM.chatInput.style) {
      DOM.chatInput.style.height = "auto";
    }

    // Show loading state immediately
    setChatGenerationLoading(true);

    // Check if this is a new leaf node or if we need to create a child
    if (
      node.children.length > 0 ||
      ["gen", "rewrite", "root"].includes(node.type)
    ) {
      // Create a new child node with the updated ChatML
      const child = appState.loomTree.createNode(
        "user",
        node,
        chatML,
        "New message"
      );

      // Preserve model info from parent if available
      if (node.model) {
        child.model = node.model;
      }

      // Update search index for the new child
      if (searchManager) {
        try {
          searchManager.addNodeToSearchIndex(
            child,
            appState.loomTree.renderNode(child)
          );
        } catch (e) {
          console.warn("Error updating search index:", e);
        }
      }

      // Update focus to the new child node
      updateFocus(child.id, "chat-send");

      // Now trigger generation on the new node
      if (llmService) {
        llmService.generateNewResponses(child.id);
      }
    } else {
      // Update the existing node
      appState.loomTree.updateNode(node, chatML, node.summary || "New message");

      // Update editor value to keep in sync
      if (DOM.editor) {
        DOM.editor.value = chatML;
      }

      // Update search index
      if (searchManager && node) {
        try {
          searchManager.updateNode(node, appState.loomTree.renderNode(node));
        } catch (e) {
          console.warn("Error updating search index:", e);
        }
      }

      // Re-render chat view
      renderChatView();

      // Now trigger generation on the current node
      if (llmService) {
        llmService.generateNewResponses(node.id);
      }
    }

    // Update stats
    updateTreeStatsDisplay();
  } catch (error) {
    console.error("Error sending chat message:", error);
    alert("Error sending message: " + (error.message || String(error)));
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

  // Update chat toggle visibility and sync view mode
  // This may change chatViewMode and call updateViewMode()
  updateChatToggleVisibility();

  // If we're in chat mode, ensure it's rendered
  if (chatViewMode === "chat" && isChatCompletionMethod()) {
    setTimeout(() => {
      if (DOM.chatView && DOM.chatView.style.display !== "none") {
        renderChatView();
      }
    }, 10);
  }

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

    // If in chat mode, update chat view
    if (chatViewMode === "chat") {
      renderChatView();
    }

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
      updateChatToggleVisibility();
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

          // Show chat loading indicator
          setChatGenerationLoading(true);
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

          // Hide chat loading indicator
          setChatGenerationLoading(false);

          // Ensure chat view is updated after generation completes
          if (chatViewMode === "chat" && isChatCompletionMethod()) {
            setTimeout(() => {
              renderChatView();
            }, 50);
          }
        },

        onGenerationFailed: (nodeId, errorMessage) => {
          console.warn("LLM generation failed:", errorMessage);

          // Set error on the node
          const loomTree = appState.getLoomTree();
          loomTree.setNodeError(nodeId, errorMessage);

          // Clear chat loading indicator on failure
          setChatGenerationLoading(false);

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
          // Validate ChatML if in chat mode
          if (chatViewMode === "chat" && isChatCompletionMethod()) {
            const validation = validateChatML(DOM.editor.value);
            if (!validation.valid) {
              alert(`Invalid ChatML: ${validation.error}`);
              return;
            }
          }
          llmService.generateNewResponses(appState.focusedNode.id);
        }
      };
    }

    // Chat toggle handlers
    if (DOM.chatToggle) {
      const toggleOptions = DOM.chatToggle.querySelectorAll(".toggle-option");
      toggleOptions.forEach(option => {
        option.addEventListener("click", () => {
          const mode = option.dataset.mode;
          chatViewMode = mode;
          toggleOptions.forEach(opt => opt.classList.remove("active"));
          option.classList.add("active");
          // Force immediate view update when manually toggling
          updateViewMode();
          // Ensure chat view is rendered if switching to chat mode
          if (mode === "chat") {
            setTimeout(() => {
              renderChatView();
            }, 10);
          }
        });
      });
    }

    // Chat send button handler
    if (DOM.chatSendButton) {
      DOM.chatSendButton.addEventListener("click", sendChatMessage);
    }

    // Chat input handlers
    if (DOM.chatInput) {
      DOM.chatInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage();
        }
      });

      // Auto-resize textarea
      DOM.chatInput.addEventListener("input", () => {
        DOM.chatInput.style.height = "auto";
        DOM.chatInput.style.height =
          Math.min(DOM.chatInput.scrollHeight, 120) + "px";
      });

      // Enable context menu (right-click) for chat input
      DOM.chatInput.addEventListener("contextmenu", e => {
        e.preventDefault();
        window.electronAPI.showContextMenu();
      });
    }

    // Update chat toggle visibility when service/sampler changes
    if (DOM.serviceSelector) {
      DOM.serviceSelector.addEventListener(
        "change",
        updateChatToggleVisibility
      );
    }
    if (DOM.samplerSelector) {
      DOM.samplerSelector.addEventListener(
        "change",
        updateChatToggleVisibility
      );
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
