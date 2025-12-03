const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  MenuItem,
} = require("electron");
const fs = require("fs");
const path = require("path");

let mainWindow = null;
let tempFilePath = null;
let currentFilePath = null;
let recentFiles = [];
let lastSavedTimestamp = null;
const MAX_RECENT_FILES = 5;

function setCurrentFile(filePath, isTemp = false) {
  currentFilePath = filePath;
  if (!isTemp && filePath !== tempFilePath) {
    addToRecentFiles(filePath);
  }
}

function getFileStats(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return {
      mtime: stats.mtime,
      birthtime: stats.birthtime,
    };
  } catch (error) {
    console.error("Error getting file stats:", error);
    return { mtime: new Date(), birthtime: new Date() };
  }
}

function hasContent(data) {
  return (
    data.loomTree &&
    data.loomTree.nodeStore &&
    Object.keys(data.loomTree.nodeStore).length > 1
  );
}

async function checkUnsavedChanges() {
  if (mainWindow) {
    mainWindow.webContents.send("request-final-save");
    // Give the renderer a moment to process the save
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Only check for unsaved changes if we're working with a temp file
  if (currentFilePath === tempFilePath && fs.existsSync(tempFilePath)) {
    try {
      const content = fs.readFileSync(tempFilePath, "utf8");
      const data = JSON.parse(content);

      if (hasContent(data)) {
        const result = await dialog.showMessageBox(mainWindow, {
          type: "question",
          buttons: ["Discard", "Save As...", "Cancel"],
          defaultId: 1,
          title: "Unsaved Changes",
          message: "You have unsaved changes. What would you like to do?",
          detail:
            "Choose 'Save As...' to save your work, 'Discard' to lose your changes, or 'Cancel' to keep working.",
        });

        if (result.response === 0) {
          // Discard - delete temp file
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
          return true;
        } else if (result.response === 1) {
          // Save As...
          const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: "Save Loom As",
            filters: [{ name: "JSON Files", extensions: ["json"] }],
          });

          if (filePath) {
            fs.writeFileSync(filePath, JSON.stringify(data));
            addToRecentFiles(filePath);
            // Delete temp file after successful save
            if (fs.existsSync(tempFilePath)) {
              fs.unlinkSync(tempFilePath);
            }
            return true;
          } else {
            // User cancelled save dialog
            return false;
          }
        } else {
          // Cancel
          return false;
        }
      }
    } catch (error) {
      console.error("Error checking for unsaved changes:", error);
    }
  }
  return true;
}

// Trigger final auto-save before changing file context
async function finalAutoSave() {
  if (mainWindow && currentFilePath && currentFilePath !== tempFilePath) {
    // Request the renderer to send current data for final save
    mainWindow.webContents.send("request-final-save");
  }
}

function createWindow(initialData = null) {
  try {
    const window = new BrowserWindow({
      title: "MiniLoom",
      icon: path.join(__dirname, "..", "assets/minihf_logo_no_text.png"),
      width: 1200,
      height: 900,
      show: false, // Don't show until ready
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        webSecurity: true,
        allowRunningInsecureContent: false,
        sandbox: false,
        devTools: true, // Enable dev tools for debugging
      },
    });
    mainWindow = window;

    loadRecentFiles();
    const existingMenuTemplate = Menu.getApplicationMenu().items.map(item => {
      return {
        label: item.label,
        submenu: item.submenu.items,
      };
    });
    // Update the File menu
    updateFileMenu(existingMenuTemplate);

    const editMenuItems = [
      {
        label: "LLM Settings",
        accelerator: "CmdOrCtrl+P",
        click: () => openSettingsWindow(),
      },
      { type: "separator" },
      {
        label: "Undo",
        accelerator: "CmdOrCtrl+Z",
        role: "undo",
      },
      {
        label: "Redo",
        accelerator: "CmdOrCtrl+Shift+Z",
        role: "redo",
      },
      { type: "separator" },
      {
        label: "Cut",
        accelerator: "CmdOrCtrl+X",
        role: "cut",
      },
      {
        label: "Copy",
        accelerator: "CmdOrCtrl+C",
        role: "copy",
      },
      {
        label: "Paste",
        accelerator: "CmdOrCtrl+V",
        role: "paste",
      },
      {
        label: "Select All",
        accelerator: "CmdOrCtrl+A",
        role: "selectAll",
      },
      { type: "separator" },
    ];
    const editMenuIndex = existingMenuTemplate.findIndex(
      item => item.label === "Edit"
    );
    if (editMenuIndex >= 0) {
      existingMenuTemplate[editMenuIndex].submenu = [
        ...editMenuItems,
        { type: "separator" },
        ...existingMenuTemplate[editMenuIndex].submenu,
      ];
    }

    // Add Help menu
    const helpMenuItems = [
      {
        label: "Get Help (Discord)",
        click: () => {
          require("electron").shell.openExternal(
            "https://discord.gg/Y3HGwrcPwr"
          );
        },
      },
      {
        label: "Report Issues (GitHub)",
        click: () => {
          require("electron").shell.openExternal(
            "https://github.com/JD-P/miniloom"
          );
        },
      },
    ];

    // Check if Help menu already exists
    const helpMenuIndex = existingMenuTemplate.findIndex(
      item => item.label === "Help"
    );
    if (helpMenuIndex >= 0) {
      // Replace existing Help menu
      existingMenuTemplate[helpMenuIndex] = {
        label: "Help",
        submenu: helpMenuItems,
      };
    } else {
      // Add new Help menu at the end
      existingMenuTemplate.push({
        label: "Help",
        submenu: helpMenuItems,
      });
    }

    // Build and set the new menu
    const newMenu = Menu.buildFromTemplate(existingMenuTemplate);
    Menu.setApplicationMenu(newMenu);

    try {
      mainWindow.loadFile("src/index.html");

      // Add error handler for webContents
      mainWindow.webContents.on(
        "did-fail-load",
        (event, errorCode, errorDescription, validatedURL) => {
          console.error(
            "Failed to load:",
            errorCode,
            errorDescription,
            validatedURL
          );
        }
      );

      mainWindow.webContents.on("crashed", event => {
        console.error("WebContents crashed");
      });

      mainWindow.once("ready-to-show", () => {
        mainWindow.show();
      });

      mainWindow.webContents.on("console-message", event => {
        const { level, message, line, sourceId } = event;
        console.log(`Renderer [${level}]: ${message} (${sourceId}:${line})`);
      });

      mainWindow.on("unresponsive", () => {
        console.error("Window became unresponsive");
      });
    } catch (error) {
      console.error("Error loading index.html:", error);
      throw error;
    }

    initializeTempFile();

    // Handle window close - intercept to check for unsaved changes
    window.on("close", async event => {
      // Prevent the default close behavior
      event.preventDefault();

      const canClose = await checkUnsavedChanges();
      if (canClose) {
        // If user confirmed close, allow the window to close
        window.destroy();
        if (window === mainWindow) {
          mainWindow = null;
        }
      }
      // If user cancelled, the window will remain open
    });

    window.on("closed", function () {
      if (window === mainWindow) {
        mainWindow = null;
      }
    });

    return window;
  } catch (error) {
    console.error("Error in createWindow:", error);
    return null;
  }
}

function initializeTempFile() {
  const appDataPath = app.getPath("appData");
  const miniLoomDir = path.join(appDataPath, "miniloom");
  const tempDir = path.join(miniLoomDir, "temp");

  if (!fs.existsSync(miniLoomDir)) {
    fs.mkdirSync(miniLoomDir);
  }
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  tempFilePath = path.join(tempDir, "temp_tree.json");
  currentFilePath = tempFilePath;
}

function openSettingsWindow(tabName = null) {
  const modal = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    show: false,
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: true,
      allowRunningInsecureContent: false,
      sandbox: false,
    },
  });

  modal.loadFile("src/settings-modal.html");
  modal.once("ready-to-show", () => {
    modal.show();
    // Send the tab name to the settings window if provided
    if (tabName && typeof tabName === "string") {
      modal.webContents.send("open-to-tab", tabName);
    }
  });

  modal.on("closed", () => {
    // Inform the main window to refresh its UI
    mainWindow.webContents.send("settings-updated");
  });
}

// Listen for open-settings request
ipcMain.handle("open-settings", () => openSettingsWindow());

// Listen for open-settings-to-tab request
ipcMain.handle("open-settings-to-tab", (event, tabName) =>
  openSettingsWindow(tabName)
);

// Listen for close-settings-window request
ipcMain.on("close-settings-window", event => {
  const sender = event.sender;
  const window = BrowserWindow.fromWebContents(sender);
  if (window) {
    window.close();
  }
});

ipcMain.handle("read-prompt-file", async (event, filename) => {
  const promptPath = path.join(__dirname, "..", "prompts", filename);
  try {
    return fs.readFileSync(promptPath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read prompt file: ${error.message}`);
  }
});

// Load recent files from settings
function loadRecentFiles() {
  try {
    const appDataPath = app.getPath("appData");
    const miniLoomDir = path.join(appDataPath, "miniloom");
    const recentFilesPath = path.join(miniLoomDir, "recent_files.json");

    if (fs.existsSync(recentFilesPath)) {
      const content = fs.readFileSync(recentFilesPath, "utf8");
      recentFiles = JSON.parse(content);
      // Filter out files that no longer exist
      recentFiles = recentFiles.filter(filePath => fs.existsSync(filePath));
    }
  } catch (error) {
    console.error("Error loading recent files:", error);
    recentFiles = [];
  }
}

// Save recent files to settings
function saveRecentFiles() {
  try {
    const appDataPath = app.getPath("appData");
    const miniLoomDir = path.join(appDataPath, "miniloom");
    const recentFilesPath = path.join(miniLoomDir, "recent_files.json");

    if (!fs.existsSync(miniLoomDir)) {
      fs.mkdirSync(miniLoomDir);
    }

    fs.writeFileSync(recentFilesPath, JSON.stringify(recentFiles));
  } catch (error) {
    console.error("Error saving recent files:", error);
  }
}

// Add file to recent files list
function addToRecentFiles(filePath) {
  if (!filePath || filePath === tempFilePath) return;

  // Remove if already exists
  recentFiles = recentFiles.filter(path => path !== filePath);

  // Add to beginning
  recentFiles.unshift(filePath);

  // Keep only the most recent files
  if (recentFiles.length > MAX_RECENT_FILES) {
    recentFiles = recentFiles.slice(0, MAX_RECENT_FILES);
  }

  saveRecentFiles();
  updateMenu();
}

// Update menu with recent files
function buildFileMenuItems() {
  const fileMenuItems = [
    {
      label: "New",
      accelerator: "CmdOrCtrl+N",
      click() {
        mainWindow.webContents.send("invoke-action", "new-loom");
      },
    },
    {
      label: "Open",
      accelerator: "CmdOrCtrl+O",
      click() {
        mainWindow.webContents.send("invoke-action", "load-file");
      },
    },
    {
      label: "Save As",
      accelerator: "CmdOrCtrl+S",
      click() {
        mainWindow.webContents.send("invoke-action", "save-file");
      },
    },
    {
      label: "Import Loomsidian",
      click() {
        mainWindow.webContents.send("invoke-action", "import-loomsidian");
      },
    },
    { type: "separator" },
  ];

  // Add recent files to menu
  if (recentFiles.length > 0) {
    recentFiles.forEach((filePath, index) => {
      const fileName = path.basename(filePath, ".json");
      fileMenuItems.push({
        label: `${index + 1}. ${fileName}`,
        click() {
          mainWindow.webContents.send(
            "invoke-action",
            "load-recent-file",
            filePath
          );
        },
      });
    });
    fileMenuItems.push({ type: "separator" });
  }

  fileMenuItems.push({
    label: "Close App",
    accelerator: "CmdOrCtrl+Q",
    click: async () => {
      const canQuit = await checkUnsavedChanges();

      if (canQuit) {
        app.quit();
      }
    },
  });

  return fileMenuItems;
}

function updateFileMenu(existingMenuTemplate) {
  const fileMenuItems = buildFileMenuItems();

  const fileMenuIndex = existingMenuTemplate.findIndex(
    item => item.label === "File"
  );

  if (fileMenuIndex >= 0) {
    existingMenuTemplate[fileMenuIndex] = {
      label: "File",
      submenu: fileMenuItems,
    };
  } else {
    // If File menu doesn't exist, add it at the beginning
    existingMenuTemplate.unshift({
      label: "File",
      submenu: fileMenuItems,
    });
  }

  return existingMenuTemplate;
}

function updateMenu() {
  if (!mainWindow) return;

  const existingMenuTemplate = Menu.getApplicationMenu().items.map(item => {
    return {
      label: item.label,
      submenu: item.submenu.items,
    };
  });

  const updatedTemplate = updateFileMenu(existingMenuTemplate);
  const newMenu = Menu.buildFromTemplate(updatedTemplate);
  Menu.setApplicationMenu(newMenu);
}

// File operation handlers
ipcMain.handle("save-file", async (event, data) => {
  // Always show save dialog to save as a new file
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "Save As",
    filters: [{ name: "JSON Files", extensions: ["json"] }],
  });

  if (filePath) {
    fs.writeFileSync(filePath, JSON.stringify(data));
    lastSavedTimestamp = new Date();

    // Only delete temp file if we're saving over the temp file itself
    if (currentFilePath === tempFilePath && filePath === tempFilePath) {
      // This shouldn't happen with the new save-as behavior, but keep for safety
    } else if (currentFilePath === tempFilePath && filePath !== tempFilePath) {
      // When saving temp file to a new location, delete the temp file
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (error) {
        console.error("Error deleting temp file:", error);
      }
    }
    // If saving from a regular file to a new file, leave the original file unchanged

    setCurrentFile(filePath);
    mainWindow.webContents.send(
      "update-filename",
      path.basename(filePath),
      new Date(),
      filePath,
      false,
      lastSavedTimestamp
    );
  }
});

ipcMain.handle("new-loom", async event => {
  // Check for unsaved changes first
  if (await checkUnsavedChanges()) {
    // Reset to temp file for new loom
    setCurrentFile(tempFilePath, true);
    lastSavedTimestamp = null; // No last saved time for new loom
    mainWindow.webContents.send(
      "update-filename",
      "Unsaved",
      null,
      tempFilePath,
      true,
      lastSavedTimestamp
    ); // isTemp = true

    // Send a simple signal to reset the UI
    mainWindow.webContents.send("reset-to-new-loom");
  }
});

ipcMain.handle("load-file", async event => {
  await finalAutoSave();

  // Check for unsaved changes first
  if (await checkUnsavedChanges()) {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Open",
      filters: [{ name: "JSON Files", extensions: ["json"] }],
      properties: ["openFile"],
    });

    if (filePaths && filePaths.length > 0) {
      const filePath = filePaths[0];
      const content = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(content);

      // Load the file in the current window
      const stats = getFileStats(filePath);
      lastSavedTimestamp = stats.mtime; // Use file's modification time as last saved
      setCurrentFile(filePath, false);
      mainWindow.webContents.send(
        "update-filename",
        path.basename(filePath),
        stats.birthtime, // Use birthtime (creation time) for Created timestamp
        filePath,
        false,
        lastSavedTimestamp
      );

      // Send the data to the renderer
      mainWindow.webContents.send("load-initial-data", { filePath, data });
    }
  }
});

ipcMain.handle("import-loomsidian-file", async event => {
  await finalAutoSave();

  // Check for unsaved changes first
  if (await checkUnsavedChanges()) {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: "Import Loomsidian File",
      filters: [{ name: "All Files", extensions: ["*"] }],
      properties: ["openFile"],
    });

    if (filePaths && filePaths.length > 0) {
      const filePath = filePaths[0];
      const content = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(content);

      // Validate that this looks like a Loomsidian file
      if (!data.nodes || typeof data.nodes !== "object") {
        dialog.showErrorBox(
          "Invalid File",
          "This doesn't appear to be a valid Loomsidian export file."
        );
        return;
      }

      // Import as new unsaved loom (don't overwrite the original file)
      setCurrentFile(null, true); // Mark as temp/unsaved
      mainWindow.webContents.send(
        "update-filename",
        path.basename(filePath, ".json") + " (imported)",
        new Date(), // Use current time as creation time
        null, // No file path since it's unsaved
        true, // Mark as unsaved
        null // No last saved timestamp
      );

      // Send the data to the renderer for import processing
      mainWindow.webContents.send("import-loomsidian-data", { data });
    }
  }
});

ipcMain.handle("load-recent-file", async (event, filePath) => {
  try {
    // Trigger final auto-save if we have a proper file
    await finalAutoSave();

    // Check for unsaved changes first
    if (await checkUnsavedChanges()) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8");
        const data = JSON.parse(content);

        // Load the file in the current window
        const stats = getFileStats(filePath);
        lastSavedTimestamp = stats.mtime; // Use file's modification time as last saved
        setCurrentFile(filePath, false);
        mainWindow.webContents.send(
          "update-filename",
          path.basename(filePath),
          stats.birthtime, // Use birthtime (creation time) for Created timestamp
          filePath,
          false,
          lastSavedTimestamp
        );

        // Return the data directly to the renderer
        return data;
      } else {
        console.log("File not found, removing from recent files:", filePath);
        // Remove from recent files if it doesn't exist
        recentFiles = recentFiles.filter(path => path !== filePath);
        saveRecentFiles();
        updateMenu();
        throw new Error("File not found");
      }
    }
  } catch (error) {
    console.error("Error in load-recent-file:", error);
    throw error;
  }
});

// Handle renderer ready to load temp file
ipcMain.handle("renderer-ready", async event => {
  if (fs.existsSync(tempFilePath)) {
    try {
      const content = fs.readFileSync(tempFilePath, "utf8");
      const data = JSON.parse(content);

      if (hasContent(data)) {
        setCurrentFile(tempFilePath, true);
        lastSavedTimestamp = new Date(); // Set current time as last saved for temp file
        mainWindow.webContents.send(
          "update-filename",
          "Unsaved",
          new Date(),
          tempFilePath,
          true,
          lastSavedTimestamp
        );

        // Show warning about restored temp file
        dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "Restored Unsaved Work",
          message:
            "Your previous unsaved work has been restored from a temporary file.",
          detail:
            "This file will be automatically saved as you work. Use 'Save As...' to save it with a proper name.",
        });

        return data;
      }
    } catch (error) {
      console.error("Error loading temp file:", error);
    }
  }

  // Set up for fresh start
  setCurrentFile(tempFilePath, true);
  lastSavedTimestamp = null; // No last saved time for fresh start
  mainWindow.webContents.send(
    "update-filename",
    "Unsaved",
    null,
    tempFilePath,
    true,
    lastSavedTimestamp
  );
  return null;
});

ipcMain.handle("load-settings", async event => {
  const miniLoomSettingsFilePath = path.join(
    app.getPath("appData"),
    "miniloom",
    "settings.json"
  );

  let settings;
  if (fs.existsSync(miniLoomSettingsFilePath)) {
    settings = fs.readFileSync(miniLoomSettingsFilePath, "utf8");
    const parsedSettings = JSON.parse(settings);
    return parsedSettings;
  } else {
    // Return empty settings object if file doesn't exist
    return {
      services: {},
      samplers: {},
      "api-keys": {},
    };
  }
});

// Auto-save handler - saves to current file or temp file
ipcMain.handle("auto-save", (event, data) => {
  const userFileData = {
    loomTree: data.loomTree,
    focus: data.focus,
  };

  // Save to current file if it's a proper file, otherwise save to temp
  const savePath =
    currentFilePath && currentFilePath !== tempFilePath
      ? currentFilePath
      : tempFilePath;
  fs.writeFileSync(savePath, JSON.stringify(userFileData));
  lastSavedTimestamp = new Date();

  // Update current file path if saving to temp
  if (savePath === tempFilePath) {
    currentFilePath = tempFilePath;
  }

  // Update the filename display with the new last saved timestamp
  if (mainWindow && currentFilePath) {
    const isTemp = currentFilePath === tempFilePath;
    const filename = isTemp ? "Unsaved" : path.basename(currentFilePath);
    const creationTime = isTemp
      ? new Date()
      : getFileStats(currentFilePath).birthtime; // Use birthtime (creation time) not mtime (modification time)

    mainWindow.webContents.send(
      "update-filename",
      filename,
      creationTime,
      currentFilePath,
      isTemp,
      lastSavedTimestamp
    );
  }
});

ipcMain.handle("save-settings", (event, miniLoomSettings) => {
  const appDataPath = app.getPath("appData");
  const miniLoomSettingsDir = path.join(appDataPath, "miniloom");
  const miniLoomSettingsFilePath = path.join(
    miniLoomSettingsDir,
    "settings.json"
  );
  if (!fs.existsSync(miniLoomSettingsDir)) {
    fs.mkdirSync(miniLoomSettingsDir);
  }
  fs.writeFileSync(miniLoomSettingsFilePath, JSON.stringify(miniLoomSettings));
});

app
  .whenReady()
  .then(() => {
    app.setName("MiniLoom");
    if (process.platform === "darwin") {
      app.dock.setIcon(
        path.join(__dirname, "..", "assets/minihf_logo_no_text.png")
      );
    }
  })
  .then(createWindow);

// Handle app quit - intercept to check for unsaved changes
app.on("before-quit", async event => {
  // Prevent the default quit behavior
  event.preventDefault();

  const canQuit = await checkUnsavedChanges();
  if (canQuit) {
    // If user confirmed quit, allow the app to quit
    app.exit(0);
  }
  // If user cancelled, the app will continue running
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", function () {
  if (!mainWindow) createWindow();
});

ipcMain.on("show-context-menu", event => {
  try {
    const contextMenu = Menu.buildFromTemplate([
      { label: "Cut", role: "cut" },
      { label: "Copy", role: "copy" },
      { label: "Paste", role: "paste" },
      { type: "separator" },
      { label: "Select All", role: "selectAll" },
    ]);

    contextMenu.popup(BrowserWindow.fromWebContents(event.sender));
  } catch (error) {
    console.error("Error showing context menu:", error);
  }
});
