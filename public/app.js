/* =========================================================
   FlySkyMods - Frontend JavaScript
   Connects the website to the Express backend REST API.
   ========================================================= */

// Base URL of the backend API. It is a relative path because the same
// Express server serves both the website (public/) and the API (/api).
const API_URL = "/api/mods";

// References to elements in index.html
const catalogGrid = document.getElementById("catalog-grid");
const catalogCount = document.getElementById("catalog-count");
const catalogSearch = document.getElementById("catalog-search");
const navSearchForm = document.getElementById("nav-search");
const navSearchInput = document.getElementById("nav-search-input");
const categoryChips = document.querySelectorAll("#category-filters .chip");
const priceChips = document.querySelectorAll("#price-filters .chip");
const modDialog = document.getElementById("mod-dialog");
const dialogContent = document.getElementById("dialog-content");
const dialogClose = document.getElementById("dialog-close");

// Current search text typed by the user
let searchTerm = "";

// Currently selected category ("" means All)
let selectedCategory = "";

// Currently selected price filter: "" (all), "free" or "paid"
let selectedPrice = "";

// Counts requests so that only the newest response is displayed
// (a slow old response must not overwrite a newer search result)
let latestRequestId = 0;

// Timer used to "debounce" typing (wait until the user pauses)
let searchTimer = null;

// Visual style for each category: thumbnail gradient class + icon.
// Category names match the backend's CATEGORIES list in server.js.
const CATEGORY_STYLES = {
  Aircraft:     { thumb: "thumb-aircraft",    icon: "✈️" },
  Liveries:     { thumb: "thumb-livery",      icon: "🎨" },
  Airports:     { thumb: "thumb-airport",     icon: "🛫" },
  Scenery:      { thumb: "thumb-scenery",     icon: "🏔️" },
  Utilities:    { thumb: "thumb-utility",     icon: "🧭" },
  Enhancements: { thumb: "thumb-enhancement", icon: "☁️" }
};

// Fallback style if the API ever returns an unknown category
const DEFAULT_STYLE = { thumb: "thumb-aircraft", icon: "✈️" };

/**
 * Builds the API URL with optional query parameters.
 *   nothing selected   -> /api/mods
 *   search "boeing"     -> /api/mods?search=boeing
 *   Aircraft + "boeing" -> /api/mods?category=Aircraft&search=boeing
 *   Free only           -> /api/mods?price=free
 */
function buildApiUrl() {
  const params = new URLSearchParams();

  if (selectedCategory) {
    params.set("category", selectedCategory);
  }

  if (searchTerm) {
    params.set("search", searchTerm);
  }

  if (selectedPrice) {
    params.set("price", selectedPrice);
  }

  const query = params.toString();
  return query ? `${API_URL}?${query}` : API_URL;
}

/**
 * Fetches the list of mods from the backend API.
 * Returns an array of mod objects, e.g.
 *   [{ id: 1, name: "A320 Neo Pro", category: "Aircraft", price: 24.99, ... }]
 */
async function fetchMods() {
  const response = await fetch(buildApiUrl());

  // fetch() only throws on network errors, so check the HTTP status too
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Escapes special HTML characters so text from the API is shown as plain
 * text and can never be run as HTML/JavaScript (prevents XSS attacks).
 */
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Formats download numbers: 15230 -> "15.2K", 950 -> "950".
 */
function formatDownloads(count) {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return String(count);
}

/**
 * Builds the HTML for one mod card.
 * Uses the same CSS classes as the static Featured Mods cards.
 */
function createModCard(mod) {
  const style = CATEGORY_STYLES[mod.category] || DEFAULT_STYLE;
  const isFree = mod.price === 0;

  const badge = isFree
    ? `<span class="badge badge-free">Free</span>`
    : `<span class="badge badge-premium">$${mod.price.toFixed(2)}</span>`;

  // New mods (added through the API) start with rating 0
  const rating = mod.rating > 0 ? `★ ${mod.rating.toFixed(1)}` : "★ New";

  return `
    <article class="mod-card" data-id="${mod.id}">
      <div class="mod-card-image ${style.thumb}">
        <span class="mod-icon" aria-hidden="true">${style.icon}</span>
        ${badge}
      </div>
      <div class="mod-card-body">
        <span class="mod-category">${escapeHTML(mod.category)}</span>
        <h3 class="mod-title">${escapeHTML(mod.name)}</h3>
        <p class="mod-author">by ${escapeHTML(mod.developer)}</p>
        <p class="mod-description">${escapeHTML(mod.description)}</p>
        <div class="mod-meta">
          <span class="rating">${rating}</span>
          <span class="downloads">${formatDownloads(mod.downloads)} downloads</span>
        </div>
        <button type="button" class="btn btn-card">View Details</button>
      </div>
    </article>
  `;
}

/**
 * Replaces the grid content with real mod cards,
 * or a "no results" message when the list is empty.
 */
function renderMods(mods) {
  if (mods.length === 0) {
    catalogGrid.innerHTML = `
      <div class="catalog-message">
        <h3>No mods found</h3>
        <p>No mods match your current search and filters. Try changing them.</p>
      </div>
    `;
    return;
  }

  catalogGrid.innerHTML = mods.map(createModCard).join("");
}

/**
 * Updates the results bar text, e.g. "Showing 8 mods",
 * "Showing 2 free Aircraft mods" or 'Showing 1 Aircraft mod for "boeing"'.
 */
function updateCount(total) {
  const label = total === 1 ? "mod" : "mods";
  const price = selectedPrice ? `${selectedPrice} ` : "";
  const category = selectedCategory ? `${selectedCategory} ` : "";
  const suffix = searchTerm ? ` for "${searchTerm}"` : "";
  catalogCount.textContent = `Showing ${total} ${price}${category}${label}${suffix}`;
}

/**
 * Shows a friendly error message inside the catalog grid.
 */
function showError(message) {
  catalogCount.textContent = "Mods unavailable";
  catalogGrid.innerHTML = `
    <div class="catalog-message">
      <h3>Could not load mods</h3>
      <p>${message}</p>
    </div>
  `;
}

/**
 * Fetches ONE mod by id from the backend: GET /api/mods/:id
 * The backend returns 404 if the mod does not exist.
 */
async function fetchModById(id) {
  const response = await fetch(`${API_URL}/${id}`);

  if (response.status === 404) {
    throw new Error("This mod no longer exists.");
  }
  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Builds the HTML shown inside the details popup.
 */
function createModDetails(mod) {
  const style = CATEGORY_STYLES[mod.category] || DEFAULT_STYLE;
  const isFree = mod.price === 0;
  const price = isFree ? "Free" : `$${mod.price.toFixed(2)}`;
  const rating = mod.rating > 0 ? mod.rating.toFixed(1) : "New";

  return `
    <div class="dialog-banner ${style.thumb}">
      <span class="dialog-icon" aria-hidden="true">${style.icon}</span>
    </div>
    <div class="dialog-body">
      <span class="mod-category">${escapeHTML(mod.category)}</span>
      <h2 class="dialog-title" id="dialog-title">${escapeHTML(mod.name)}</h2>
      <p class="mod-author">by ${escapeHTML(mod.developer)}</p>
      <p class="dialog-description">${escapeHTML(mod.description)}</p>

      <ul class="dialog-stats">
        <li><strong>★ ${rating}</strong><span>Rating</span></li>
        <li><strong>${formatDownloads(mod.downloads)}</strong><span>Downloads</span></li>
        <li><strong>${price}</strong><span>Price</span></li>
      </ul>

      <button type="button" class="btn btn-lg btn-full">${isFree ? "Download Mod" : `Buy Now · ${price}`}</button>
      <p class="dialog-note">Demo marketplace: downloads and payments are not enabled.</p>
    </div>
  `;
}

/**
 * Opens the details popup for a mod.
 * Data is loaded fresh from the API so it is always up to date.
 */
async function openModDetails(id) {
  dialogContent.innerHTML = `<p class="dialog-loading">Loading mod details...</p>`;
  modDialog.showModal();                 // built-in <dialog> method

  try {
    const mod = await fetchModById(id);
    dialogContent.innerHTML = createModDetails(mod);
  } catch (error) {
    console.error(error);
    dialogContent.innerHTML = `
      <div class="dialog-body">
        <h2 class="dialog-title" id="dialog-title">Could not load mod</h2>
        <p class="dialog-description">${escapeHTML(error.message)}</p>
      </div>
    `;
  }
}

/**
 * Loads mods from the API (using the current search) and displays them.
 */
async function loadCatalog() {
  const requestId = ++latestRequestId;

  try {
    const mods = await fetchMods();

    // Ignore this response if a newer search has started meanwhile
    if (requestId !== latestRequestId) return;

    renderMods(mods);
    updateCount(mods.length);
  } catch (error) {
    console.error(error);
    showError("Please make sure the FlySkyMods server is running (npm start) and try again.");
  }
}

/**
 * Sets the search text and reloads the catalog.
 */
function applySearch(text) {
  searchTerm = text.trim();
  loadCatalog();
}

/**
 * Highlights the chip whose data value matches, and un-highlights the rest.
 * Shared by the category chips and the price chips.
 */
function highlightChip(chips, key, value) {
  chips.forEach((chip) => {
    const isActive = chip.dataset[key] === value;
    chip.classList.toggle("active", isActive);
    chip.setAttribute("aria-pressed", isActive);
  });
}

/**
 * Selects a category, highlights the matching chip and reloads the catalog.
 * An empty string means "All".
 */
function applyCategory(category) {
  selectedCategory = category;
  highlightChip(categoryChips, "category", category);
  loadCatalog();
}

/**
 * Selects a price filter ("", "free" or "paid") and reloads the catalog.
 */
function applyPrice(price) {
  selectedPrice = price;
  highlightChip(priceChips, "price", price);
  loadCatalog();
}

// ---- Category filters ----
// Any element with a data-category attribute selects that category:
// the filter chips, the Categories section tiles and the navbar dropdown links.
// (Tiles and dropdown links are <a href="#catalog">, so the browser also
// scrolls down to the catalog for them.)
document.querySelectorAll("[data-category]").forEach((element) => {
  element.addEventListener("click", () => applyCategory(element.dataset.category));
});

// ---- Price filters: All prices / Free / Paid ----
priceChips.forEach((chip) => {
  chip.addEventListener("click", () => applyPrice(chip.dataset.price));
});

// ---- Mod details popup ----
// Event delegation: ONE listener on the grid handles clicks on every card,
// including cards that are added later when filters change.
catalogGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".mod-card");
  if (card) {
    openModDetails(card.dataset.id);
  }
});

// Close with the X button
dialogClose.addEventListener("click", () => modDialog.close());

// Close when clicking the dark backdrop outside the popup
modDialog.addEventListener("click", (event) => {
  if (event.target === modDialog) {
    modDialog.close();
  }
});
// (The Escape key closes a <dialog> automatically.)

// ---- Catalog search box: search while typing ----
// Debounce: wait 300 ms after the last key press before calling the API,
// so typing "boeing" sends 1 request instead of 6.
catalogSearch.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => applySearch(catalogSearch.value), 300);
});

// ---- Navbar search: press Enter to search the catalog ----
navSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();                       // stop the page from reloading

  catalogSearch.value = navSearchInput.value;   // copy text into catalog search
  applySearch(navSearchInput.value);

  document.getElementById("catalog").scrollIntoView({ behavior: "smooth" });
});

// Load all mods when the page opens
loadCatalog();
