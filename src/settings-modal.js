// DOM Elements
const servicesTab = document.getElementById("services-tab");
const samplersTab = document.getElementById("samplers-tab");
const apiKeysTab = document.getElementById("api-keys-tab");
const favoritesTab = document.getElementById("favorites-tab");
const servicesForm = document.getElementById("services-form");
const samplersForm = document.getElementById("samplers-form");
const serviceSelect = document.getElementById("service-select");
const samplerSelect = document.getElementById("sampler-select");

// Default configurations
const SERVICE_DEFAULTS = {
  base: {
    "sampling-method": "base",
    "service-api-url": "http://localhost:5000/",
    "service-model-name": "togethercomputer/llama-2-70b",
    "service-api-delay": "3000",
  },
  together: {
    "sampling-method": "together",
    "service-api-url": "https://api.together.xyz/inference",
    "service-model-name": "togethercomputer/llama-2-70b",
    "service-api-delay": "3000",
  },
  openrouter: {
    "sampling-method": "openrouter",
    "service-api-url": "https://openrouter.ai/api/v1/completions",
    "service-model-name": "deepseek/deepseek-v3-base:free",
    "service-api-delay": "3000",
  },
  "openrouter-chat": {
    "sampling-method": "openrouter-chat",
    "service-api-url": "https://openrouter.ai/api/v1/chat/completions",
    "service-model-name": "deepseek/deepseek-v3-base:free",
    "service-api-delay": "3000",
  },
  openai: {
    "sampling-method": "openai",
    "service-api-url": "https://api.openai.com/v1/completions",
    "service-model-name": "gpt-3.5-turbo-instruct",
    "service-api-delay": "3000",
  },
  "openai-chat": {
    "sampling-method": "openai-chat",
    "service-api-url": "https://api.openai.com/v1/chat/completions",
    "service-model-name": "gpt-5",
    "service-api-delay": "3000",
  },
  anthropic: {
    "sampling-method": "anthropic",
    "service-api-url": "https://api.anthropic.com/v1/messages",
    "service-model-name": "claude-3-5-sonnet-20241022",
    "service-api-delay": "3000",
  },
  google: {
    "sampling-method": "google",
    "service-api-url":
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    "service-model-name": "gemini-2.0-flash",
    "service-api-delay": "3000",
  },
};

const DEFAULT_SAMPLER = {
  "output-branches": "2",
  "tokens-per-branch": "256",
  temperature: "0.9",
  "top-p": "1",
  "top-k": "100",
  "repetition-penalty": "1",
  "system-prompt": "",
  "reasoning-enabled": "false",
  "reasoning-effort": "medium",
};

// State
let samplerSettingsStore = {};
let currentEditingService = null;
let currentEditingSampler = null;
let originalServiceData = null;
let originalSamplerData = null;
let activeTab = null;
let previousSamplingMethod = null;

// Utility functions
function flashSaved(message, type = "success") {
  const footer = document.getElementById("footer");
  if (!footer) return;

  footer.textContent = message;
  footer.className = `footer ${type}`;

  setTimeout(() => {
    footer.textContent = "";
    footer.className = "footer";
  }, 3000);
}

function getValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value;
}

function setDisplay(id, show) {
  const element = document.getElementById(id);
  if (element) element.style.display = show ? "inline-block" : "none";
}

// Data access functions
function getServices() {
  if (!samplerSettingsStore.services) {
    samplerSettingsStore.services = {};
  }
  return samplerSettingsStore.services;
}

function getSamplers() {
  if (!samplerSettingsStore.samplers) {
    samplerSettingsStore.samplers = {};
  }
  return samplerSettingsStore.samplers;
}

function getApiKeys() {
  if (!samplerSettingsStore["api-keys"]) {
    samplerSettingsStore["api-keys"] = {};
  }
  return samplerSettingsStore["api-keys"];
}

function getFavorites() {
  if (!samplerSettingsStore.favorites) {
    samplerSettingsStore.favorites = [];
  }
  return samplerSettingsStore.favorites;
}

// Shared form management
function populateSelect(selectElement, items, placeholder) {
  selectElement.innerHTML = `<option value="">${placeholder}</option>`;
  Object.keys(items).forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    selectElement.appendChild(option);
  });
}

function showForm(formElement, show = true) {
  formElement.style.display = show ? "block" : "none";
}

// Service management
function applyServiceDefaults(serviceType) {
  return SERVICE_DEFAULTS[serviceType] || SERVICE_DEFAULTS.base;
}

function populateServiceSelect() {
  populateSelect(serviceSelect, getServices(), "-- Select a service --");
}

function populateServiceForm(serviceName = null, serviceData = null) {
  if (serviceName && serviceData) {
    // Editing existing service
    currentEditingService = serviceName;
    setValue("service-name", serviceName);
    setValue("sampling-method", serviceData["sampling-method"] || "openai");
    setValue("service-api-url", serviceData["service-api-url"] || "");
    setValue("service-model-name", serviceData["service-model-name"] || "");
    setValue("service-api-delay", serviceData["service-api-delay"] || "");
    setDisplay("delete-service-btn", true);
    originalServiceData = { ...serviceData };
    previousSamplingMethod = serviceData["sampling-method"] || "openai";
  } else {
    // Adding new service
    currentEditingService = null;
    setValue("service-name", "");
    setValue("sampling-method", "openai");
    setValue("service-api-url", "");
    setValue("service-model-name", "");
    setValue("service-api-delay", "");
    setDisplay("delete-service-btn", false);
    originalServiceData = null;
    previousSamplingMethod = "openai";
  }
}

function applyServiceDefaultsToForm(serviceType) {
  const newDefaults = applyServiceDefaults(serviceType);
  const previousDefaults = previousSamplingMethod
    ? applyServiceDefaults(previousSamplingMethod)
    : null;

  const fieldsToUpdate = [
    "service-api-url",
    "service-model-name",
    "service-api-delay",
  ];

  fieldsToUpdate.forEach(fieldId => {
    const currentValue = getValue(fieldId);
    // A field is considered at default if it's empty or matches the previous method's default
    const previousDefault = previousDefaults ? previousDefaults[fieldId] : "";
    const isAtDefault = currentValue === "" || currentValue === previousDefault;

    // Only update if the field is at its default value
    if (isAtDefault) {
      setValue(fieldId, newDefaults[fieldId]);
    }
  });

  // Update the previous sampling method tracker
  previousSamplingMethod = serviceType;
}

function saveService() {
  const name = getValue("service-name");
  const method = getValue("sampling-method");
  const url = getValue("service-api-url");
  const model = getValue("service-model-name");
  const delay = getValue("service-api-delay");

  if (!utils.validateFieldStringType(name, "modelNameType")) {
    alert(
      "Invalid service name. Use letters, digits, '-', '_', or '.' (max 20 characters)."
    );
    return;
  }

  if (!utils.validateFieldStringType(url, "URLType")) {
    alert("Invalid API URL.");
    return;
  }

  const services = getServices();
  if (services[name] && name !== currentEditingService) {
    alert("A service with this name already exists.");
    return;
  }

  const serviceData = {
    "sampling-method": method,
    "service-api-url": url,
    "service-model-name": model,
    "service-api-delay": delay,
  };

  services[name] = serviceData;

  if (currentEditingService && currentEditingService !== name) {
    delete services[currentEditingService];
  }

  persistStore();
  populateServiceSelect();
  serviceSelect.value = name;
  populateServiceForm(name, serviceData);

  // Refresh favorites table if it's currently visible
  if (activeTab === "favorites") {
    renderFavoritesTable();
  }

  flashSaved(currentEditingService ? "Service updated." : "Service created.");
}

function deleteService() {
  if (!currentEditingService) return;

  if (
    confirm(
      `Are you sure you want to delete the service "${currentEditingService}"?`
    )
  ) {
    const services = getServices();
    delete services[currentEditingService];
    persistStore();
    populateServiceSelect();
    showServiceForm(false);

    // Refresh favorites table if it's currently visible
    if (activeTab === "favorites") {
      renderFavoritesTable();
    }

    flashSaved("Service deleted.");
  }
}

function cancelService() {
  if (originalServiceData && currentEditingService) {
    const hasChanges = checkServiceChanges();
    if (hasChanges) {
      populateServiceForm(currentEditingService, originalServiceData);
      flashSaved("Changes reverted.");
    } else {
      showServiceForm(false);
    }
  } else {
    showServiceForm(false);
  }

  currentEditingService = null;
  originalServiceData = null;
}

function checkServiceChanges() {
  const currentName = getValue("service-name");
  const currentMethod = getValue("sampling-method");
  const currentUrl = getValue("service-api-url");
  const currentModel = getValue("service-model-name");
  const currentDelay = getValue("service-api-delay");

  return (
    currentName !== currentEditingService ||
    currentMethod !== originalServiceData["sampling-method"] ||
    currentUrl !== originalServiceData["service-api-url"] ||
    currentModel !== originalServiceData["service-model-name"] ||
    currentDelay !== originalServiceData["service-api-delay"]
  );
}

function showServiceForm(show = true) {
  showForm(servicesForm, show);
}

// Sampler management
function getDefaultSampler() {
  return { ...DEFAULT_SAMPLER };
}

function populateSamplerSelect() {
  populateSelect(samplerSelect, getSamplers(), "-- Select a sampler --");
}

function populateSamplerForm(samplerName = null, samplerData = null) {
  if (samplerName && samplerData) {
    // Editing existing sampler
    currentEditingSampler = samplerName;
    setValue("sampler-name", samplerName);
    setValue("output-branches", samplerData["output-branches"] || "");
    setValue("tokens-per-branch", samplerData["tokens-per-branch"] || "");
    setValue("temperature", samplerData["temperature"] || "");
    setValue("top-p", samplerData["top-p"] || "");
    setValue("top-k", samplerData["top-k"] || "");
    setValue("repetition-penalty", samplerData["repetition-penalty"] || "");
    setValue("system-prompt", samplerData["system-prompt"] || "");
    setValue("reasoning-enabled", samplerData["reasoning-enabled"] || "false");
    setValue("reasoning-effort", samplerData["reasoning-effort"] || "medium");
    setDisplay("delete-sampler-btn", true);
    originalSamplerData = { ...samplerData };
  } else {
    // Adding new sampler
    currentEditingSampler = null;
    const defaults = getDefaultSampler();
    setValue("sampler-name", "");
    setValue("output-branches", defaults["output-branches"]);
    setValue("tokens-per-branch", defaults["tokens-per-branch"]);
    setValue("temperature", defaults["temperature"]);
    setValue("top-p", defaults["top-p"]);
    setValue("top-k", defaults["top-k"]);
    setValue("repetition-penalty", defaults["repetition-penalty"]);
    setValue("system-prompt", defaults["system-prompt"]);
    setValue("reasoning-enabled", defaults["reasoning-enabled"]);
    setValue("reasoning-effort", defaults["reasoning-effort"]);
    setDisplay("delete-sampler-btn", false);
    originalSamplerData = null;
  }
}

function saveSampler() {
  const name = getValue("sampler-name");
  const branches = getValue("output-branches");
  const tokens = getValue("tokens-per-branch");
  const temp = getValue("temperature");
  const topP = getValue("top-p");
  const topK = getValue("top-k");
  const penalty = getValue("repetition-penalty");
  const systemPrompt = getValue("system-prompt");
  const reasoningEnabled = getValue("reasoning-enabled");
  const reasoningEffort = getValue("reasoning-effort");

  if (!utils.validateFieldStringType(name, "modelNameType")) {
    alert(
      "Invalid sampler name. Use letters, digits, '-', '_', or '.' (max 20 characters)."
    );
    return;
  }

  // Required fields: branches and tokens must have values
  if (
    !utils.validateFieldStringType(branches, "intType") ||
    !utils.validateFieldStringType(tokens, "intType")
  ) {
    alert(
      "Output Branches and Tokens Per Branch are required and must be integers."
    );
    return;
  }

  // Optional fields: validate only if they have values (empty is allowed)
  if (temp !== "" && !utils.validateFieldStringType(temp, "floatType")) {
    alert("Temperature must be a valid number or left empty.");
    return;
  }
  if (topP !== "" && !utils.validateFieldStringType(topP, "floatType")) {
    alert("Top-P must be a valid number or left empty.");
    return;
  }
  if (topK !== "" && !utils.validateFieldStringType(topK, "intType")) {
    alert("Top-K must be a valid integer or left empty.");
    return;
  }
  if (penalty !== "" && !utils.validateFieldStringType(penalty, "floatType")) {
    alert("Repetition Penalty must be a valid number or left empty.");
    return;
  }

  const samplers = getSamplers();
  if (samplers[name] && name !== currentEditingSampler) {
    alert("A sampler with this name already exists.");
    return;
  }

  const samplerData = {
    "output-branches": branches,
    "tokens-per-branch": tokens,
    temperature: temp,
    "top-p": topP,
    "top-k": topK,
    "repetition-penalty": penalty,
    "system-prompt": systemPrompt,
    "reasoning-enabled": reasoningEnabled,
    "reasoning-effort": reasoningEffort,
  };

  samplers[name] = samplerData;

  if (currentEditingSampler && currentEditingSampler !== name) {
    delete samplers[currentEditingSampler];
  }

  persistStore();
  populateSamplerSelect();
  samplerSelect.value = name;
  populateSamplerForm(name, samplerData);

  // Refresh favorites table if it's currently visible
  if (activeTab === "favorites") {
    renderFavoritesTable();
  }

  flashSaved(currentEditingSampler ? "Sampler updated." : "Sampler created.");
}

function deleteSampler() {
  if (!currentEditingSampler) return;

  const samplers = getSamplers();
  const samplerCount = Object.keys(samplers).length;

  if (samplerCount <= 1) {
    flashSaved(
      "Cannot delete the last sampler. At least one sampler is required.",
      "error"
    );
    return;
  }

  if (
    confirm(
      `Are you sure you want to delete the sampler "${currentEditingSampler}"?`
    )
  ) {
    delete samplers[currentEditingSampler];
    persistStore();
    populateSamplerSelect();
    showSamplerForm(false);

    // Refresh favorites table if it's currently visible
    if (activeTab === "favorites") {
      renderFavoritesTable();
    }

    flashSaved("Sampler deleted.");
  }
}

function cancelSampler() {
  if (originalSamplerData && currentEditingSampler) {
    const hasChanges = checkSamplerChanges();
    if (hasChanges) {
      populateSamplerForm(currentEditingSampler, originalSamplerData);
      flashSaved("Changes reverted.");
    } else {
      showSamplerForm(false);
    }
  } else {
    showSamplerForm(false);
  }

  currentEditingSampler = null;
  originalSamplerData = null;
}

function checkSamplerChanges() {
  const currentName = getValue("sampler-name");
  const currentBranches = getValue("output-branches");
  const currentTokens = getValue("tokens-per-branch");
  const currentTemp = getValue("temperature");
  const currentTopP = getValue("top-p");
  const currentTopK = getValue("top-k");
  const currentPenalty = getValue("repetition-penalty");
  const currentSystemPrompt = getValue("system-prompt");
  const currentReasoningEnabled = getValue("reasoning-enabled");
  const currentReasoningEffort = getValue("reasoning-effort");

  return (
    currentName !== currentEditingSampler ||
    currentBranches !== originalSamplerData["output-branches"] ||
    currentTokens !== originalSamplerData["tokens-per-branch"] ||
    currentTemp !== originalSamplerData["temperature"] ||
    currentTopP !== originalSamplerData["top-p"] ||
    currentTopK !== originalSamplerData["top-k"] ||
    currentPenalty !== originalSamplerData["repetition-penalty"] ||
    currentSystemPrompt !== (originalSamplerData["system-prompt"] || "") ||
    currentReasoningEnabled !==
      (originalSamplerData["reasoning-enabled"] || "false") ||
    currentReasoningEffort !==
      (originalSamplerData["reasoning-effort"] || "medium")
  );
}

function showSamplerForm(show = true) {
  showForm(samplersForm, show);
}

// API Keys management
function renderApiKeysList() {
  const tbody = document.getElementById("keys-tbody");
  tbody.innerHTML = "";
  const apiKeys = getApiKeys();
  const entries = Object.entries(apiKeys);

  if (entries.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "muted";
    td.textContent = "No API keys saved.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  entries.forEach(([name, secret]) => {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.textContent = name;

    const tdSecret = document.createElement("td");
    const mask = document.createElement("span");
    mask.textContent = "•".repeat(Math.min(secret?.length || 0, 12)) || "—";
    mask.dataset.revealed = "0";
    tdSecret.appendChild(mask);

    const tdActions = document.createElement("td");
    const showBtn = document.createElement("button");
    showBtn.className = "btn";
    showBtn.textContent = "Show";
    showBtn.addEventListener("click", () => {
      const revealed = mask.dataset.revealed === "1";
      mask.textContent = revealed
        ? "•".repeat(Math.min(secret?.length || 0, 12))
        : secret || "";
      mask.dataset.revealed = revealed ? "0" : "1";
      showBtn.textContent = revealed ? "Show" : "Hide";
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn";
    delBtn.style.marginLeft = "6px";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      if (confirm(`Are you sure you want to delete the API key "${name}"?`)) {
        const apiKeys = getApiKeys();
        delete apiKeys[name];
        await persistStore();
        renderApiKeysList();

        // Refresh favorites table if it's currently visible
        if (activeTab === "favorites") {
          renderFavoritesTable();
        }

        flashSaved("API key deleted.");
      }
    });

    tdActions.appendChild(showBtn);
    tdActions.appendChild(delBtn);

    tr.appendChild(tdName);
    tr.appendChild(tdSecret);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
}

// Favorites management
function renderFavoritesTable() {
  const tbody = document.getElementById("favorites-tbody");
  tbody.innerHTML = "";

  const favorites = getFavorites();
  const services = getServices();
  const apiKeys = getApiKeys();
  const samplers = getSamplers();

  // Create 8 rows (numbered 1-8)
  for (let i = 0; i < 8; i++) {
    const tr = document.createElement("tr");
    const favorite = favorites[i] || {
      name: "",
      service: "",
      key: "",
      sampler: "",
    };

    // Row number
    const tdNumber = document.createElement("td");
    tdNumber.textContent = i + 1;
    tdNumber.style.textAlign = "center";
    tdNumber.style.fontWeight = "600";

    // Name input
    const tdName = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "modelNameType";
    nameInput.placeholder = "Name";
    nameInput.maxLength = 8;
    nameInput.value = favorite.name || "";
    nameInput.dataset.rowIndex = i;
    nameInput.dataset.field = "name";
    nameInput.addEventListener("input", updateFavorite);
    tdName.appendChild(nameInput);

    // Service dropdown
    const tdService = document.createElement("td");
    const serviceSelect = document.createElement("select");
    serviceSelect.dataset.rowIndex = i;
    serviceSelect.dataset.field = "service";
    serviceSelect.addEventListener("change", updateFavorite);

    const serviceOption = document.createElement("option");
    serviceOption.value = "";
    serviceOption.textContent = "-- Select Service --";
    serviceSelect.appendChild(serviceOption);

    Object.keys(services).forEach(serviceName => {
      const option = document.createElement("option");
      option.value = serviceName;
      option.textContent = serviceName;
      if (serviceName === favorite.service) {
        option.selected = true;
      }
      serviceSelect.appendChild(option);
    });
    tdService.appendChild(serviceSelect);

    // Key dropdown
    const tdKey = document.createElement("td");
    const keySelect = document.createElement("select");
    keySelect.dataset.rowIndex = i;
    keySelect.dataset.field = "key";
    keySelect.addEventListener("change", updateFavorite);

    const keyOption = document.createElement("option");
    keyOption.value = "";
    keyOption.textContent = "None";
    if (favorite.key === "" || favorite.key === undefined) {
      keyOption.selected = true;
    }
    keySelect.appendChild(keyOption);

    Object.keys(apiKeys).forEach(keyName => {
      const option = document.createElement("option");
      option.value = keyName;
      option.textContent = keyName;
      if (keyName === favorite.key) {
        option.selected = true;
      }
      keySelect.appendChild(option);
    });
    tdKey.appendChild(keySelect);

    // Sampler dropdown
    const tdSampler = document.createElement("td");
    const samplerSelect = document.createElement("select");
    samplerSelect.dataset.rowIndex = i;
    samplerSelect.dataset.field = "sampler";
    samplerSelect.addEventListener("change", updateFavorite);

    const samplerOption = document.createElement("option");
    samplerOption.value = "";
    samplerOption.textContent = "-- Select Sampler --";
    samplerSelect.appendChild(samplerOption);

    Object.keys(samplers).forEach(samplerName => {
      const option = document.createElement("option");
      option.value = samplerName;
      option.textContent = samplerName;
      if (samplerName === favorite.sampler) {
        option.selected = true;
      }
      samplerSelect.appendChild(option);
    });
    tdSampler.appendChild(samplerSelect);

    tr.appendChild(tdNumber);
    tr.appendChild(tdName);
    tr.appendChild(tdService);
    tr.appendChild(tdKey);
    tr.appendChild(tdSampler);
    tbody.appendChild(tr);
  }
}

function updateFavorite(event) {
  const element = event.target;
  const rowIndex = parseInt(element.dataset.rowIndex);
  const field = element.dataset.field;
  let value = element.value;

  // Limit name field to 8 characters
  if (field === "name" && value.length > 8) {
    value = value.substring(0, 8);
    element.value = value;
  }

  const favorites = getFavorites();

  // Ensure the array has enough elements
  while (favorites.length <= rowIndex) {
    favorites.push({ name: "", service: "", key: "", sampler: "" });
  }

  favorites[rowIndex][field] = value;

  // Auto-save when a field changes
  persistStore();
}

// Tab management
function showTab(tabElement) {
  servicesTab.classList.remove("visible-tab");
  samplersTab.classList.remove("visible-tab");
  apiKeysTab.classList.remove("visible-tab");
  favoritesTab.classList.remove("visible-tab");
  tabElement.classList.add("visible-tab");
}

function setActiveTab(tabName) {
  activeTab = tabName;

  for (const btn of document.querySelectorAll("#settings-tabs .tab-btn")) {
    btn.classList.remove("active");
  }

  // Add active class to the correct button
  const activeButton = document.querySelector(
    `#settings-tabs .tab-btn[data-tab="${activeTab}"]`
  );
  if (activeButton) {
    activeButton.classList.add("active");
  }

  if (activeTab === "services") {
    showTab(servicesTab);
    populateServiceSelect();
  } else if (activeTab === "samplers") {
    showTab(samplersTab);
    populateSamplerSelect();
  } else if (activeTab === "favorites") {
    showTab(favoritesTab);
    renderFavoritesTable();
  } else {
    showTab(apiKeysTab);
    renderApiKeysList();
  }
}

// Data persistence
async function loadSettings() {
  try {
    const data = await window.electronAPI.loadSettings();
    if (data != null) {
      samplerSettingsStore = data;
    }
  } catch (err) {
    console.error("Load Settings Error:", err);
  }
}

async function persistStore() {
  try {
    await window.electronAPI.saveSettings(samplerSettingsStore);
  } catch (err) {
    console.error("Settings save Error:", err);
  }
}

// New user detection
function checkForNewUserInSettings() {
  const hasServices =
    samplerSettingsStore?.services &&
    Object.keys(samplerSettingsStore.services).length > 0;

  if (!hasServices) {
    const welcomeMessage = document.getElementById("welcome-message");
    if (welcomeMessage) {
      welcomeMessage.style.display = "block";
    }

    setTimeout(() => {
      showServiceForm(true);
      populateServiceForm();
    }, 100);
  }
}

// Event listeners
document.addEventListener("DOMContentLoaded", function () {
  // Service event listeners
  document.getElementById("add-service-btn")?.addEventListener("click", () => {
    serviceSelect.value = "";
    showServiceForm(true);
    populateServiceForm();
  });

  document
    .getElementById("save-service-btn")
    ?.addEventListener("click", saveService);
  document
    .getElementById("cancel-service-btn")
    ?.addEventListener("click", cancelService);
  document
    .getElementById("delete-service-btn")
    ?.addEventListener("click", deleteService);

  serviceSelect?.addEventListener("change", () => {
    const selected = serviceSelect.value;
    if (selected) {
      const services = getServices();
      const serviceData = services[selected];
      populateServiceForm(selected, serviceData);
      showServiceForm(true);
    } else {
      showServiceForm(false);
    }
  });

  document.getElementById("sampling-method")?.addEventListener("change", () => {
    applyServiceDefaultsToForm(
      document.getElementById("sampling-method").value
    );
  });

  // Sampler event listeners
  document.getElementById("add-sampler-btn")?.addEventListener("click", () => {
    samplerSelect.value = "";
    showSamplerForm(true);
    populateSamplerForm();
  });

  document
    .getElementById("save-sampler-btn")
    ?.addEventListener("click", saveSampler);
  document
    .getElementById("cancel-sampler-btn")
    ?.addEventListener("click", cancelSampler);
  document
    .getElementById("delete-sampler-btn")
    ?.addEventListener("click", deleteSampler);

  samplerSelect?.addEventListener("change", () => {
    const selected = samplerSelect.value;
    if (selected) {
      const samplers = getSamplers();
      const samplerData = samplers[selected];
      populateSamplerForm(selected, samplerData);
      showSamplerForm(true);
    } else {
      showSamplerForm(false);
    }
  });

  // API Keys event listeners
  document
    .getElementById("add-key-btn")
    ?.addEventListener("click", async () => {
      const name = getValue("key-name");
      const value = getValue("key-value");

      if (!utils.validateFieldStringType(name, "modelNameType")) {
        alert(
          "Invalid key name. Use letters, digits, '-', '_', or '.' (max 20 characters)."
        );
        return;
      }
      if (!value) {
        alert("Secret cannot be empty.");
        return;
      }

      const apiKeys = getApiKeys();
      if (apiKeys[name]) {
        alert("An API key with this name already exists.");
        return;
      }

      apiKeys[name] = value;
      await persistStore();
      setValue("key-name", "");
      setValue("key-value", "");
      renderApiKeysList();

      // Refresh favorites table if it's currently visible
      if (activeTab === "favorites") {
        renderFavoritesTable();
      }

      flashSaved("API key added.");
    });

  // Tab switching
  document.getElementById("settings-tabs")?.addEventListener("click", e => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    setActiveTab(btn.dataset.tab);
  });

  // Close button
  document.getElementById("close-settings")?.addEventListener("click", () => {
    window.electronAPI.closeSettingsWindow();
  });

  // Listen for open-to-tab event from main process
  window.electronAPI.onOpenToTab((event, tabName) => {
    if (
      tabName &&
      ["services", "api-keys", "samplers", "favorites"].includes(tabName)
    ) {
      setActiveTab(tabName);
    }
  });

  // Initialize
  loadSettings().then(() => {
    // Only set default tab if no tab was already set via event
    if (!activeTab) {
      setActiveTab("services");
    }

    // Check if this is a new user (no services configured)
    checkForNewUserInSettings();
  });
});
