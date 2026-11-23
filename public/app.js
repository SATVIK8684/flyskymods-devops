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
 * Loads mods when the page opens.
 * (Rendering the mod cards is added in the next commit.)
 */
async function loadCatalog() {
  try {
    const mods = await fetchMods();
    console.log("Mods loaded from API:", mods);
    updateCount(mods.length);
  } catch (error) {
    console.error(error);
    showError("Please make sure the FlySkyMods server is running (npm start) and try again.");
  }
}

loadCatalog();
