/* =========================================================
   FlySkyMods - Frontend JavaScript
   Connects the website to the Express backend REST API.
   ========================================================= */

// Base URL of the backend API. It is a relative path because the same
// Express server serves both the website (public/) and the API (/api).
const API_URL = "/api/mods";

// References to the catalog elements in index.html
const catalogGrid = document.getElementById("catalog-grid");
const catalogCount = document.getElementById("catalog-count");

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
 * Fetches the list of mods from the backend API.
 * Returns an array of mod objects, e.g.
 *   [{ id: 1, name: "A320 Neo Pro", category: "Aircraft", price: 24.99, ... }]
 */
async function fetchMods() {
  const response = await fetch(API_URL);

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
        <a href="#" class="btn btn-card">${isFree ? "Download" : "Buy Now"}</a>
      </div>
    </article>
  `;
}

/**
 * Replaces the skeleton cards with real mod cards.
 */
function renderMods(mods) {
  catalogGrid.innerHTML = mods.map(createModCard).join("");
}

/**
 * Updates the results bar text, e.g. "Showing 8 mods".
 */
function updateCount(total) {
  const label = total === 1 ? "mod" : "mods";
  catalogCount.textContent = `Showing ${total} ${label}`;
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
 * Loads mods from the API and displays them when the page opens.
 */
async function loadCatalog() {
  try {
    const mods = await fetchMods();
    renderMods(mods);
    updateCount(mods.length);
  } catch (error) {
    console.error(error);
    showError("Please make sure the FlySkyMods server is running (npm start) and try again.");
  }
}

loadCatalog();
