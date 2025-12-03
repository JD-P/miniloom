const { contextBridge, ipcRenderer } = require("electron");

const DiffMatchPatch = require("diff-match-patch");
const MiniSearch = require("minisearch");

// Store MiniSearch instance in preload script
let searchIndex = null;

// Safely expose only the necessary APIs
contextBridge.exposeInMainWorld("electronAPI", {
  // File operations (need main process)
  saveFile: data => ipcRenderer.invoke("save-file", data),
  loadFile: () => ipcRenderer.invoke("load-file"),
  loadRecentFile: filePath => ipcRenderer.invoke("load-recent-file", filePath),
  importLoomsidianFile: () => ipcRenderer.invoke("import-loomsidian-file"),
  newLoom: () => ipcRenderer.invoke("new-loom"),
  rendererReady: () => ipcRenderer.invoke("renderer-ready"),
  autoSave: data => ipcRenderer.invoke("auto-save", data),

  // Settings operations
  loadSettings: () => ipcRenderer.invoke("load-settings"),
  saveSettings: settings => ipcRenderer.invoke("save-settings", settings),
  openSettings: () => ipcRenderer.invoke("open-settings"),
  openSettingsToTab: tabName =>
    ipcRenderer.invoke("open-settings-to-tab", tabName),
  closeSettingsWindow: () => ipcRenderer.send("close-settings-window"),

  // Read prompt files (needed for AI operations)
  readPromptFile: filename => ipcRenderer.invoke("read-prompt-file", filename),

  // Events
  onSettingsUpdated: callback => {
    ipcRenderer.on("settings-updated", callback);
    return () => ipcRenderer.removeAllListeners("settings-updated");
  },
  onOpenToTab: callback => {
    ipcRenderer.on("open-to-tab", callback);
    return () => ipcRenderer.removeAllListeners("open-to-tab");
  },

  onUpdateFilename: callback => {
    ipcRenderer.on("update-filename", callback);
    return () => ipcRenderer.removeAllListeners("update-filename");
  },

  onInvokeAction: callback => {
    ipcRenderer.on("invoke-action", callback);
    return () => ipcRenderer.removeAllListeners("invoke-action");
  },

  onLoadInitialData: callback => {
    ipcRenderer.on("load-initial-data", callback);
    return () => ipcRenderer.removeAllListeners("load-initial-data");
  },

  onImportLoomsidianData: callback => {
    ipcRenderer.on("import-loomsidian-data", callback);
    return () => ipcRenderer.removeAllListeners("import-loomsidian-data");
  },

  onResetToNewLoom: callback => {
    ipcRenderer.on("reset-to-new-loom", callback);
    return () => ipcRenderer.removeAllListeners("reset-to-new-loom");
  },

  onRequestFinalSave: callback => {
    ipcRenderer.on("request-final-save", callback);
    return () => ipcRenderer.removeAllListeners("request-final-save");
  },

  // Context menu
  showContextMenu: () => ipcRenderer.send("show-context-menu"),

  // Utility libraries
  DiffMatchPatch: DiffMatchPatch,
  MiniSearch: MiniSearch,

  // DiffMatchPatch methods (since class methods don't serialize through context bridge)
  patch_make: (text1, text2) => {
    const dmp = new DiffMatchPatch();
    return dmp.patch_make(text1, text2);
  },
  patch_apply: (patch, text) => {
    const dmp = new DiffMatchPatch();
    return dmp.patch_apply(patch, text);
  },

  // MiniSearch methods (managed entirely in preload script)
  createMiniSearch: options => {
    searchIndex = new MiniSearch(options);
    return true; // Return success indicator
  },
  searchIndexAdd: document => {
    if (searchIndex) {
      return searchIndex.add(document);
    }
    return false;
  },
  searchIndexSearch: (query, options) => {
    if (searchIndex) {
      return searchIndex.search(query, options);
    }
    return [];
  },
  searchIndexAutoSuggest: (query, options) => {
    if (searchIndex) {
      return searchIndex.autoSuggest(query, options);
    }
    return [];
  },
  searchIndexReplace: document => {
    if (searchIndex) {
      return searchIndex.replace(document);
    }
    return false;
  },
  searchIndexRemove: document => {
    if (searchIndex) {
      return searchIndex.remove(document);
    }
    return false;
  },
  searchIndexRemoveAll: () => {
    if (searchIndex) {
      searchIndex.removeAll();
      return true;
    }
    return false;
  },
});
