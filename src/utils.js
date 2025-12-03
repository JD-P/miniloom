/**
 * Validate field values based on their expected type
 * @param {string} fieldValue - The value to validate
 * @param {string} fieldType - The expected type (intType, floatType, modelNameType, URLType, etc.)
 * @returns {boolean|RegExpMatchArray|null} - Validation result
 */
function validateFieldStringType(fieldValue, fieldType) {
  const fieldValueString = String(fieldValue);
  const intPattern = /^[0-9]+$/;
  const floatPattern = /^[0-9]+\.?[0-9]*$/;
  const modelNamePattern = /^[a-zA-Z0-9-\._]+$/;

  let result;
  if (fieldType === "intType") {
    result = fieldValueString.match(intPattern);
  } else if (fieldType === "floatType") {
    result = fieldValueString.match(floatPattern);
  } else if (fieldType === "modelNameType") {
    result =
      fieldValueString.match(modelNamePattern) && fieldValueString.length <= 20;
  } else if (fieldType === "settingsNameType") {
    result = fieldValueString.match(modelNamePattern);
  } else if (fieldType === "URLType") {
    result = isValidUrl(fieldValue);
  } else if (fieldType === "select") {
    result = fieldValue && fieldValue.length > 0;
  } else {
    if (fieldType === "") {
      console.warn(
        "Tried to validate empty field type. Did you forget to type your form field?"
      );
      result = null;
    } else {
      console.warn("Attempted to validate unknown field type");
      result = null;
    }
  }
  return result;
}

/**
 * Validate if a string is a valid URL
 * @param {string} urlString - The URL string to validate
 * @returns {boolean} - True if valid URL, false otherwise
 */
function isValidUrl(urlString) {
  try {
    new URL(urlString);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Count characters in text
 * @param {string} text - The text to count characters in
 * @returns {number} - Number of characters
 */
function countCharacters(text) {
  return text.length;
}

/**
 * Count words in text
 * @param {string} text - The text to count words in
 * @returns {number} - Number of words
 */
function countWords(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0).length;
}

/**
 * Simple text highlighting function for search results
 * @param {string} text - The text to highlight
 * @param {string} query - The search query to highlight
 * @returns {string} - HTML with highlighted text
 */
function highlightText(text, query) {
  if (!query.trim() || !text) return text;

  const words = query.toLowerCase().split(/\s+/);
  let highlighted = text;

  words.forEach(word => {
    const regex = new RegExp(`(${escapeRegex(word)})`, "gi");
    highlighted = highlighted.replace(regex, "<mark>$1</mark>");
  });

  return highlighted;
}

/**
 * Escape special regex characters in a string
 * @param {string} string - The string to escape
 * @returns {string} - Escaped string safe for regex
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Format a timestamp for display
 * @param {number} timestamp - Unix timestamp
 * @returns {string} - Formatted date string in "d MMM yy HH:mm" format
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Truncate text to a specified length with ellipsis
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} - Truncated text with ellipsis if needed
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * Extract the first three words from the first line of text
 * @param {string} text - The text to extract words from
 * @returns {string} - First three words joined by spaces
 */
function extractThreeWords(text) {
  return text.trim().split("\n")[0].split(" ").slice(0, 3).join(" ");
}

/**
 * Calculate comprehensive text statistics for a given text
 * @param {string} text - The text to analyze
 * @returns {Object} - Object containing wordCount, charCount, and other stats
 */
function calculateTextStats(text) {
  const trimmedText = text.trim();
  const wordCount =
    trimmedText.length === 0 ? 0 : trimmedText.split(/\s+/).length;
  const charCount = text.length;

  return {
    wordCount,
    charCount,
    isEmpty: trimmedText.length === 0,
    lineCount: text.split("\n").length,
    averageWordsPerLine: wordCount / Math.max(1, text.split("\n").length),
  };
}

/**
 * Calculate net changes between two texts
 * @param {string} currentText - The current text
 * @param {string} previousText - The previous text to compare against
 * @returns {Object} - Object containing net word and character changes
 */
function calculateNetChanges(currentText, previousText) {
  const currentStats = calculateTextStats(currentText);
  const previousStats = calculateTextStats(previousText);

  return {
    netWordsChange: currentStats.wordCount - previousStats.wordCount,
    netCharsChange: currentStats.charCount - previousStats.charCount,
    netLinesChange: currentStats.lineCount - previousStats.lineCount,
  };
}

/**
 * Format number with thousands separators for display
 * @param {number} num - The number to format
 * @returns {string} - Formatted number with commas as thousands separators
 */
function formatNumber(num) {
  return num.toLocaleString();
}

/**
 * Format net change for display with +/- prefix and number separators
 * @param {number} change - The net change value
 * @returns {string} - Formatted string with +/- prefix and separators
 */
function formatNetChange(change) {
  return `${change > 0 ? "+" : ""}${formatNumber(change)}`;
}

/**
 * Get CSS class for net change styling
 * @param {number} change - The net change value
 * @returns {string} - CSS class name for styling
 */
function getNetChangeClass(change) {
  if (change > 0) return "positive";
  if (change < 0) return "negative";
  return "";
}

/**
 * Generate subtree tooltip text with comprehensive statistics
 * @param {Object} node - The node object with treeStats
 * @returns {string} - Formatted subtree statistics text
 */
function generateSubtreeTooltipText(node) {
  if (!node.children || node.children.length === 0) {
    return `ID: ${node.id || "unknown"}`;
  }

  const subtreeDate = formatTimestamp(
    node.treeStats.lastChildUpdate || node.timestamp
  );

  return (
    `🍃 Total nodes: ${formatNumber(node.treeStats.totalChildNodes)}\n` +
    `👶 Direct children: ${formatNumber(node.children.length)}\n` +
    `📏 Max depth: ${formatNumber(node.treeStats.maxChildDepth)}\n` +
    `🕐 Last: ${subtreeDate}\n` +
    `📝 Max words: ${formatNumber(node.treeStats.maxWordCountOfChildren)}\n` +
    `🔤 Max chars: ${formatNumber(node.treeStats.maxCharCountOfChildren)}\n` +
    `🌱 Unread nodes: ${formatNumber(node.treeStats.unreadChildNodes || 0)}\n` +
    `👍 Rated Good: ${formatNumber(node.treeStats.ratedUpNodes || 0)}\n` +
    `👎 Rated Bad: ${formatNumber(node.treeStats.ratedDownNodes || 0)}\n` +
    `🔥 Recent nodes (5min): ${formatNumber(node.treeStats.recentNodes || 0)}`
  );
}

/**
 * Helper function to convert finish reason codes to user-friendly text
 */
function getFinishReasonDisplayText(finishReason) {
  const reasonMap = {
    stop: "Complete",
    length: "Max Length",
    content_filter: "Content Filtered",
    tool_calls: "Tool Called",
    function_call: "Function Called",
    max_tokens: "Token Limit",
    timeout: "Timed Out",
    user: "User Stopped",
    assistant: "Assistant Stopped",
    system: "System Stopped",
    end_turn: "Turn Ended",
    max_content_length: "Content Limit",
    safety: "Safety Filter",
    recitation: "Recitation Detected",
    network_error: "Network Error",
    server_error: "Server Error",
    rate_limit: "Rate Limited",
    invalid_request: "Invalid Request",
    unknown: "Unknown",
  };

  return reasonMap[finishReason] || finishReason || "Unknown";
}

/**
 * Get standardized display text for node summary with consistent fallback logic
 * @param {string} summary - The node summary
 * @param {number} index - The node index for fallback (optional)
 * @param {string} defaultText - Default text when summary is empty (optional, defaults to "Branch")
 * @returns {string} - Standardized display text
 */
function getNodeSummaryDisplayText(
  summary,
  index = null,
  defaultText = "Branch"
) {
  const trimmedSummary = (summary || "").trim();
  if (trimmedSummary) {
    return trimmedSummary;
  }

  if (index !== null) {
    return `Branch ${index}`;
  }

  return defaultText;
}

if (typeof window !== "undefined") {
  window.utils = {
    validateFieldStringType,
    isValidUrl,
    countCharacters,
    countWords,
    highlightText,
    escapeRegex,
    formatTimestamp,
    truncateText,
    extractThreeWords,
    calculateTextStats,
    calculateNetChanges,
    formatNumber,
    formatNetChange,
    getNetChangeClass,
    generateSubtreeTooltipText,
    getFinishReasonDisplayText,
    getNodeSummaryDisplayText,
  };
}
