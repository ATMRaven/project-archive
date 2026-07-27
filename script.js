// ============================================================================
// Selected Work - Cloudflare API & Capacitor Mobile App Logic
// ============================================================================

// Base API URL handling (for both Web and Native Capacitor Mobile App)
const API_BASE_URL =
  window.location.origin.includes("localhost") ||
  window.location.protocol === "file:" ||
  (window.Capacitor && window.Capacitor.isNativePlatform())
    ? "https://project-archive.atmr.workers.dev"
    : "";

// SHA-256 hash of the admin password.
const ADMIN_PASSWORD_HASHES = [
  "37b049e345aaf2c5bba83fa43054427eac0a7a6018c6c4db722b7f6d4f6c5366", // atmr
  "4ae84b3129a7b28b2855306d50a413373ac5b261a592b706c3d002f3e715700f", // 0440
];

// Local cache key for offline fallback
const CACHE_KEY = "projects_cache";
const CACHE_ORDERS_KEY = "category_orders_cache";

// ============================================================================
// State
// ============================================================================
let projects = [];
let categoryOrders = [];
let tempCategories = [];
let isAdmin = sessionStorage.getItem("isAdmin") === "true";
let pendingDeleteId = null;
let searchQuery = "";
let selectedCategory = "all";

// ============================================================================
// Native Haptics Helper (Capacitor)
// ============================================================================
async function triggerHaptic(type = "light") {
  try {
    if (window.Capacitor && window.Capacitor.isPluginAvailable("Haptics")) {
      const Haptics = window.Capacitor.Plugins.Haptics;
      if (Haptics) {
        if (type === "medium") await Haptics.impact({ style: "MEDIUM" });
        else if (type === "heavy") await Haptics.impact({ style: "HEAVY" });
        else if (type === "success") await Haptics.notification({ type: "SUCCESS" });
        else await Haptics.impact({ style: "LIGHT" });
      }
    }
  } catch (e) {}
}

// ============================================================================
// DOM references
// ============================================================================
const $ = (id) => document.getElementById(id);

const grid = $("grid");
const emptyState = $("emptyState");
const adminBar = $("adminBar");
const adminToolbar = $("adminToolbar");
const themeToggle = $("themeToggle");
const secretTrigger = $("secretTrigger");

const searchInput = $("searchInput");
const categoryChips = $("categoryChips");
const categoryInput = $("categoryInput");
const categorySuggestions = $("categorySuggestions");

const loginOverlay = $("loginOverlay");
const loginForm = $("loginForm");
const passwordInput = $("passwordInput");
const loginError = $("loginError");

const projectOverlay = $("projectOverlay");
const projectForm = $("projectForm");
const projectEyebrow = $("projectEyebrow");
const projectModalTitle = $("projectModalTitle");
const projectId = $("projectId");
const titleInput = $("titleInput");
const descriptionInput = $("descriptionInput");
const urlInput = $("urlInput");
const hiddenSwitch = $("hiddenSwitch");

const deleteOverlay = $("deleteOverlay");
const deleteProjectName = $("deleteProjectName");

const toast = $("toast");

// ============================================================================
// Theme
// ============================================================================
function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
}
themeToggle.addEventListener("click", () => {
  triggerHaptic("light");
  const current =
    document.documentElement.getAttribute("data-theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
});
initTheme();

// ============================================================================
// View mode
// ============================================================================
const viewToggles = $("viewToggles");

function initView() {
  const saved = localStorage.getItem("viewMode") || "grid";
  setView(saved);
}

function setView(mode) {
  grid.setAttribute("data-view", mode);
  viewToggles.querySelectorAll(".view-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === mode);
  });
  localStorage.setItem("viewMode", mode);
}

viewToggles.addEventListener("click", (e) => {
  const btn = e.target.closest(".view-btn");
  if (!btn) return;
  triggerHaptic("light");
  setView(btn.dataset.view);
});

initView();

// ============================================================================
// Toast
// ============================================================================
let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

// ============================================================================
// Offline cache helpers
// ============================================================================
function saveToCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {}
}

function loadFromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ============================================================================
// Data loading via Cloudflare API (with offline fallback)
// ============================================================================
async function loadProjects() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/projects?isAdmin=${isAdmin}`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);

    const data = await res.json();
    projects = data.projects || [];
    categoryOrders = data.categoryOrders || [];

    saveToCache(projects);
    try {
      localStorage.setItem(CACHE_ORDERS_KEY, JSON.stringify(categoryOrders));
    } catch (e) {}

    updateCategoryFilters();
    render();
  } catch (err) {
    console.error("Failed to load projects from Cloudflare API:", err);

    // Offline fallback — show cached data
    const cached = loadFromCache();
    try {
      const cachedOrders = localStorage.getItem(CACHE_ORDERS_KEY);
      if (cachedOrders) categoryOrders = JSON.parse(cachedOrders);
    } catch (e) {}

    if (cached.length > 0) {
      projects = isAdmin ? cached : cached.filter((p) => !p.hidden);
      showToast("Offline — showing cached projects.");
      updateCategoryFilters();
    } else {
      showToast("Couldn't load projects. Check connection.");
      projects = [];
    }
    render();
  }
}

// ============================================================================
// Category Filters & Search Initialization
// ============================================================================
function updateCategoryFilters() {
  const categories = [...new Set(projects
    .map(p => p.category ? p.category.trim() : "")
    .filter(c => c !== "")
  )];

  categories.sort((a, b) => {
    const orderA = categoryOrders.find(co => co.category.toLowerCase() === a.toLowerCase());
    const orderB = categoryOrders.find(co => co.category.toLowerCase() === b.toLowerCase());
    const valA = orderA ? orderA.display_order : 999999;
    const valB = orderB ? orderB.display_order : 999999;
    
    if (valA !== valB) return valA - valB;
    return a.localeCompare(b);
  });

  categoryChips.innerHTML = `
    <button class="chip ${selectedCategory === "all" ? "is-active" : ""}" data-category="all">All</button>
    ${categories.map(cat => `
      <button class="chip ${selectedCategory.toLowerCase() === cat.toLowerCase() ? "is-active" : ""}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>
    `).join("")}
  `;

  categorySuggestions.innerHTML = categories.map(cat => `
    <option value="${escapeHtml(cat)}">
  `).join("");
}

categoryChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  
  triggerHaptic("light");
  selectedCategory = chip.dataset.category;
  
  categoryChips.querySelectorAll(".chip").forEach(el => {
    el.classList.toggle("is-active", el.dataset.category === selectedCategory);
  });
  
  render();
});

searchInput.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  render();
});

// ============================================================================
// Rendering
// ============================================================================
function escapeHtml(str = "") {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function ensureAbsoluteUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function thumbnailUrl(url) {
  return `https://s0.wp.com/mshots/v1/${encodeURIComponent(ensureAbsoluteUrl(url))}?w=600&h=400`;
}

function render() {
  grid.innerHTML = "";
  adminToolbar.hidden = !isAdmin;
  adminBar.hidden = !isAdmin;

  const filtered = projects.filter(p => {
    if (selectedCategory !== "all") {
      if (!p.category || p.category.trim().toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = p.title && p.title.toLowerCase().includes(q);
      const descMatch = p.description && p.description.toLowerCase().includes(q);
      const categoryMatch = p.category && p.category.toLowerCase().includes(q);
      const urlMatch = p.url && p.url.toLowerCase().includes(q);
      if (!titleMatch && !descMatch && !categoryMatch && !urlMatch) {
        return false;
      }
    }
    return true;
  });

  emptyState.hidden = filtered.length > 0;

  filtered.forEach((p, i) => {
    const card = document.createElement("article");
    card.className = "card";
    card.style.animationDelay = `${Math.min(i * 60, 480)}ms`;

    const showHiddenBadge = isAdmin && p.hidden;
    const formattedUrl = ensureAbsoluteUrl(p.url);
    const thumb = thumbnailUrl(p.url);

    card.innerHTML = `
      <div class="card__thumb">
        <img class="card__thumb-img" src="${thumb}" alt="" loading="lazy" onload="this.classList.add('loaded')" onerror="this.style.display='none'">
      </div>
      <div class="card__body">
        <div class="card__head">
          <h3 class="card__title">
            <a class="card__title-link" href="${escapeHtml(formattedUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.title)}</a>
          </h3>
          <div class="card__badges">
            ${p.category ? `<span class="badge badge--category">${escapeHtml(p.category)}</span>` : ""}
            ${showHiddenBadge ? '<span class="badge badge--hidden">Hidden</span>' : ""}
          </div>
        </div>
        ${p.description ? `<p class="card__desc">${escapeHtml(p.description)}</p>` : ""}
        <div class="card__links">
          <a class="card__url" href="${escapeHtml(formattedUrl)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(displayUrl(p.url))}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17 17 7M8 7h9v9"/></svg>
          </a>
          <button class="icon-btn icon-btn--copy" data-action="copy" data-url="${escapeHtml(formattedUrl)}" aria-label="Copy URL">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        </div>
        ${isAdmin ? `
          <div class="card__admin-controls">
            <button class="icon-btn" data-action="edit" data-id="${p.id}" aria-label="Edit ${escapeHtml(p.title)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <button class="icon-btn" data-action="toggle" data-id="${p.id}" aria-label="Toggle visibility for ${escapeHtml(p.title)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="icon-btn icon-btn--danger" data-action="delete" data-id="${p.id}" aria-label="Delete ${escapeHtml(p.title)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
            </button>
          </div>
        ` : ""}
      </div>
    `;
    grid.appendChild(card);
  });
}

function displayUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url;
  }
}

// ============================================================================
// Card action delegation
// ============================================================================
grid.addEventListener("click", (e) => {
  const btn = e.target.closest(".icon-btn");
  const link = e.target.closest("a");

  if (btn) {
    triggerHaptic("light");
    if (btn.dataset.action === "copy") {
      const url = btn.dataset.url;
      navigator.clipboard.writeText(url).then(() => {
        showToast("URL copied!");
        triggerHaptic("success");
      }).catch(() => {
        showToast("Couldn't copy URL.");
      });
      return;
    }

    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const project = projects.find((p) => String(p.id) === String(id));
    if (!project) return;

    if (action === "edit") openProjectModal(project);
    if (action === "delete") openDeleteModal(project);
    if (action === "toggle") toggleHidden(project);
    return;
  }

  if (link) return;

  const card = e.target.closest(".card");
  if (card && grid.getAttribute("data-view") === "minimal") {
    triggerHaptic("light");
    card.classList.toggle("is-expanded");
  }
});

async function toggleHidden(project) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: !project.hidden }),
    });

    if (!res.ok) throw new Error("API error");
    triggerHaptic("success");
    showToast(project.hidden ? "Project shown publicly" : "Project hidden");
    await loadProjects();
  } catch (err) {
    console.error(err);
    showToast("Couldn't update visibility.");
  }
}

// ============================================================================
// Secret trigger → login modal
// ============================================================================
secretTrigger.addEventListener("click", () => {
  if (isAdmin) return;
  triggerHaptic("medium");
  openLoginModal();
});

function openLoginModal() {
  loginError.hidden = true;
  passwordInput.value = "";
  loginOverlay.hidden = false;
  setTimeout(() => passwordInput.focus(), 80);
}
function closeLoginModal() {
  loginOverlay.hidden = true;
}
$("loginClose").addEventListener("click", closeLoginModal);
$("loginCancel").addEventListener("click", closeLoginModal);
loginOverlay.addEventListener("click", (e) => {
  if (e.target === loginOverlay) closeLoginModal();
});

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const hash = await sha256(passwordInput.value);
  if (ADMIN_PASSWORD_HASHES.includes(hash)) {
    isAdmin = true;
    sessionStorage.setItem("isAdmin", "true");
    closeLoginModal();
    triggerHaptic("success");
    showToast("Welcome back.");
    await loadProjects();
  } else {
    triggerHaptic("heavy");
    loginError.hidden = false;
    passwordInput.value = "";
    passwordInput.focus();
  }
});

$("logoutBtn").addEventListener("click", async () => {
  triggerHaptic("light");
  isAdmin = false;
  sessionStorage.removeItem("isAdmin");
  showToast("Logged out.");
  await loadProjects();
});

// ============================================================================
// Add / Edit project modal
// ============================================================================
$("addProjectBtn").addEventListener("click", () => {
  triggerHaptic("light");
  openProjectModal();
});

function openProjectModal(project = null) {
  projectForm.reset();
  hiddenSwitch.setAttribute("aria-checked", "false");

  if (project) {
    projectEyebrow.textContent = "Edit Entry";
    projectModalTitle.textContent = "Edit Project";
    projectId.value = project.id;
    titleInput.value = project.title;
    descriptionInput.value = project.description || "";
    urlInput.value = project.url;
    categoryInput.value = project.category || "";
    hiddenSwitch.setAttribute("aria-checked", String(!!project.hidden));
  } else {
    projectEyebrow.textContent = "New Entry";
    projectModalTitle.textContent = "Add Project";
    projectId.value = "";
    categoryInput.value = "";
  }

  projectOverlay.hidden = false;
  setTimeout(() => titleInput.focus(), 80);
}
function closeProjectModal() {
  projectOverlay.hidden = true;
}
$("projectClose").addEventListener("click", closeProjectModal);
$("projectCancel").addEventListener("click", closeProjectModal);
projectOverlay.addEventListener("click", (e) => {
  if (e.target === projectOverlay) closeProjectModal();
});

hiddenSwitch.addEventListener("click", () => {
  triggerHaptic("light");
  const checked = hiddenSwitch.getAttribute("aria-checked") === "true";
  hiddenSwitch.setAttribute("aria-checked", String(!checked));
});

projectForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    title: titleInput.value.trim(),
    description: descriptionInput.value.trim(),
    url: urlInput.value.trim(),
    category: categoryInput.value.trim() || null,
    hidden: hiddenSwitch.getAttribute("aria-checked") === "true",
  };

  try {
    let res;
    if (projectId.value) {
      res = await fetch(`${API_BASE_URL}/api/projects/${projectId.value}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update project");
      showToast("Project updated.");
    } else {
      res = await fetch(`${API_BASE_URL}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create project");
      showToast("Project added.");
    }
    triggerHaptic("success");
    closeProjectModal();
    await loadProjects();
  } catch (err) {
    console.error(err);
    showToast("Couldn't save project.");
  }
});

// ============================================================================
// Delete modal
// ============================================================================
function openDeleteModal(project) {
  pendingDeleteId = project.id;
  deleteProjectName.textContent = project.title;
  deleteOverlay.hidden = false;
}
function closeDeleteModal() {
  deleteOverlay.hidden = true;
  pendingDeleteId = null;
}
$("deleteClose").addEventListener("click", closeDeleteModal);
$("deleteCancel").addEventListener("click", closeDeleteModal);
deleteOverlay.addEventListener("click", (e) => {
  if (e.target === deleteOverlay) closeDeleteModal();
});

$("deleteConfirm").addEventListener("click", async () => {
  if (!pendingDeleteId) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/projects/${pendingDeleteId}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete");

    triggerHaptic("success");
    showToast("Project deleted.");
    closeDeleteModal();
    await loadProjects();
  } catch (err) {
    console.error(err);
    showToast("Couldn't delete project.");
  }
});

// ============================================================================
// Reorder Categories modal
// ============================================================================
const categoriesOverlay = $("categoriesOverlay");
const categoriesOrderList = $("categoriesOrderList");

$("manageCategoriesBtn").addEventListener("click", () => {
  triggerHaptic("light");
  const uniqueCats = [...new Set(projects
    .map(p => p.category ? p.category.trim() : "")
    .filter(c => c !== "")
  )];

  uniqueCats.sort((a, b) => {
    const orderA = categoryOrders.find(co => co.category.toLowerCase() === a.toLowerCase());
    const orderB = categoryOrders.find(co => co.category.toLowerCase() === b.toLowerCase());
    const valA = orderA ? orderA.display_order : 999999;
    const valB = orderB ? orderB.display_order : 999999;
    
    if (valA !== valB) return valA - valB;
    return a.localeCompare(b);
  });

  tempCategories = uniqueCats;
  renderCategoriesOrderList();
  categoriesOverlay.hidden = false;
});

function renderCategoriesOrderList() {
  categoriesOrderList.innerHTML = tempCategories.map((cat, index) => `
    <li class="category-order-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.8rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); margin-bottom: 6px;">
      <span style="font-weight: 500; font-size: 0.95rem; color: var(--text-main);">${escapeHtml(cat)}</span>
      <div style="display: flex; gap: 8px;">
        <button class="icon-btn category-move-btn" data-direction="up" data-index="${index}" ${index === 0 ? 'disabled style="opacity:0.3; cursor:default;"' : ''} type="button" aria-label="Move Up">
          ▲
        </button>
        <button class="icon-btn category-move-btn" data-direction="down" data-index="${index}" ${index === tempCategories.length - 1 ? 'disabled style="opacity:0.3; cursor:default;"' : ''} type="button" aria-label="Move Down">
          ▼
        </button>
      </div>
    </li>
  `).join("");
}

categoriesOrderList.addEventListener("click", (e) => {
  const btn = e.target.closest(".category-move-btn");
  if (!btn) return;
  
  triggerHaptic("light");
  const index = parseInt(btn.dataset.index, 10);
  const direction = btn.dataset.direction;
  
  if (direction === "up" && index > 0) {
    const temp = tempCategories[index];
    tempCategories[index] = tempCategories[index - 1];
    tempCategories[index - 1] = temp;
    renderCategoriesOrderList();
  } else if (direction === "down" && index < tempCategories.length - 1) {
    const temp = tempCategories[index];
    tempCategories[index] = tempCategories[index + 1];
    tempCategories[index + 1] = temp;
    renderCategoriesOrderList();
  }
});

function closeCategoriesModal() {
  categoriesOverlay.hidden = true;
  tempCategories = [];
}

$("categoriesClose").addEventListener("click", closeCategoriesModal);
$("categoriesCancel").addEventListener("click", closeCategoriesModal);
categoriesOverlay.addEventListener("click", (e) => {
  if (e.target === categoriesOverlay) closeCategoriesModal();
});

$("categoriesSave").addEventListener("click", async () => {
  const upsertData = tempCategories.map((cat, index) => ({
    category: cat,
    display_order: index
  }));

  try {
    const res = await fetch(`${API_BASE_URL}/api/categories/orders`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryOrders: upsertData }),
    });

    if (!res.ok) throw new Error("Failed to save order");

    triggerHaptic("success");
    showToast("Category order saved.");
    closeCategoriesModal();
    await loadProjects();
  } catch (err) {
    console.error(err);
    showToast("Failed to save category order.");
  }
});

// ============================================================================
// Escape key closes any open modal
// ============================================================================
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!loginOverlay.hidden) closeLoginModal();
  if (!projectOverlay.hidden) closeProjectModal();
  if (!deleteOverlay.hidden) closeDeleteModal();
  if (!categoriesOverlay.hidden) closeCategoriesModal();
});

// ============================================================================
// Init
// ============================================================================
loadProjects();

// Register service worker for PWA / offline support
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
