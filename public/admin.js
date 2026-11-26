/* =========================================================
   FlySkyMods - Admin Dashboard
   Loads GET /api/admin/users. The SERVER decides who is allowed:
     401 = not signed in, 403 = signed in but not an admin.
   ========================================================= */

const adminWelcome = document.getElementById("admin-welcome");
const adminBlocked = document.getElementById("admin-blocked");
const blockedTitle = document.getElementById("blocked-title");
const blockedText = document.getElementById("blocked-text");
const adminContent = document.getElementById("admin-content");
const usersBody = document.getElementById("users-body");

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Escapes text so user-entered names can never run as HTML (prevents XSS).
 */
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

/**
 * Shows a message instead of the dashboard.
 */
function showBlocked(title, text) {
  adminWelcome.textContent = "";
  blockedTitle.textContent = title;
  blockedText.textContent = text;
  adminBlocked.hidden = false;
  adminContent.hidden = true;
}

function renderStats(users) {
  const now = Date.now();
  document.getElementById("stat-users").textContent = users.length;
  document.getElementById("stat-admins").textContent = users.filter((u) => u.role === "admin").length;
  document.getElementById("stat-new").textContent =
    users.filter((u) => now - new Date(u.createdAt).getTime() < ONE_WEEK_MS).length;
}

function renderUsers(users) {
  usersBody.innerHTML = users
    .map(
      (user) => `
        <tr>
          <td>${escapeHTML(user.name)}</td>
          <td>${escapeHTML(user.email)}</td>
          <td><span class="role-badge${user.role === "admin" ? " admin" : ""}">${user.role === "admin" ? "Admin" : "Pilot"}</span></td>
          <td>${formatDate(user.createdAt)}</td>
        </tr>
      `
    )
    .join("");
}

async function loadDashboard() {
  try {
    const response = await fetch("/api/admin/users");

    if (response.status === 401) {
      showBlocked("Please sign in", "Sign in with an admin account on the store page, then come back here.");
      return;
    }
    if (response.status === 403) {
      showBlocked("Admin access only", "Your account does not have permission to view this page.");
      return;
    }
    if (!response.ok) {
      showBlocked("Dashboard unavailable", "The admin service is not available right now. Please try again later.");
      return;
    }

    const users = await response.json();

    // Find the signed-in admin's name for the greeting
    const me = await (await fetch("/api/auth/me")).json();
    adminWelcome.textContent = `Signed in as ${me.user ? me.user.name : "admin"}.`;

    renderStats(users);
    renderUsers(users);
    adminContent.hidden = false;
  } catch {
    showBlocked("Could not reach the server", "Check your connection and try again.");
  }
}

loadDashboard();
