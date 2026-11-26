/* =========================================================
   FlySkyMods - User accounts (frontend)
   Talks to the account API:
     POST /api/auth/register   POST /api/auth/login
     POST /api/auth/logout     GET  /api/auth/me
   The login token is an httpOnly cookie set by the server,
   so this JavaScript never sees or stores it.
   ========================================================= */

const accountBtn = document.getElementById("account-btn");
const accountLabel = document.getElementById("account-label");
const authDialog = document.getElementById("auth-dialog");
const authClose = document.getElementById("auth-close");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const authMessage = document.getElementById("auth-message");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const authTabs = document.querySelectorAll(".auth-tab");
const accountMenu = document.getElementById("account-menu");
const accountName = document.getElementById("account-name");
const accountEmail = document.getElementById("account-email");
const accountRole = document.getElementById("account-role");
const adminLink = document.getElementById("admin-link");
const logoutBtn = document.getElementById("logout-btn");

// The logged-in user ({ id, name, email, role, createdAt }) or null
let currentUser = null;

/**
 * Small helper around fetch() for our JSON API.
 * Returns { ok, status, data } instead of throwing on 4xx/5xx.
 */
async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // empty or non-JSON response
  }

  return { ok: response.ok, status: response.status, data };
}

/* ---------------- Navbar account button ---------------- */

/**
 * Shows "Sign In" when logged out, or the user's first name when logged in.
 */
function renderAccountButton() {
  if (currentUser) {
    accountLabel.textContent = currentUser.name.split(" ")[0];
    accountBtn.classList.add("signed-in");
    accountBtn.setAttribute("aria-label", `Account: ${currentUser.name}`);
  } else {
    accountLabel.textContent = "Sign In";
    accountBtn.classList.remove("signed-in");
    accountBtn.setAttribute("aria-label", "Sign in or create an account");
  }
}

/* ---------------- Account menu (signed in) ---------------- */

/**
 * Fills the account menu with the user's details.
 * textContent (not innerHTML) is used, so names can never inject HTML.
 */
function renderAccountMenu() {
  if (!currentUser) return;

  accountName.textContent = currentUser.name;
  accountEmail.textContent = currentUser.email;
  accountRole.textContent = currentUser.role === "admin" ? "Admin" : "Pilot";
  accountRole.classList.toggle("admin", currentUser.role === "admin");

  // Only admins see the dashboard link (the server checks again on every admin request)
  adminLink.hidden = currentUser.role !== "admin";
}

function setAccountMenuOpen(open) {
  accountMenu.hidden = !open;
  accountBtn.setAttribute("aria-expanded", open);
}

async function logOut() {
  await apiRequest("/api/auth/logout", { method: "POST" });
  currentUser = null;
  setAccountMenuOpen(false);
  renderAccountButton();
}

/**
 * Asks the server who is logged in (the browser sends the cookie automatically).
 */
async function loadCurrentUser() {
  try {
    const { ok, data } = await apiRequest("/api/auth/me");
    currentUser = ok ? data.user : null;
  } catch {
    currentUser = null;           // server unreachable
  }
  renderAccountButton();
}

/* ---------------- Sign in / create account popup ---------------- */

function showAuthMessage(text, type = "error") {
  authMessage.textContent = text;
  authMessage.className = `auth-message ${type}`;
  authMessage.hidden = false;
}

function hideAuthMessage() {
  authMessage.hidden = true;
}

/**
 * Switches the popup between the "login" and "register" forms.
 */
function setAuthMode(mode) {
  const isLogin = mode === "login";

  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;

  authTitle.textContent = isLogin ? "Welcome back, pilot" : "Join FlySkyMods";
  authSubtitle.textContent = isLogin
    ? "Sign in to your FlySkyMods account."
    : "Create a free account to save and download mods.";

  authTabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active);
  });

  hideAuthMessage();
}

function openAuthDialog(mode = "login") {
  setAuthMode(mode);
  authDialog.showModal();
}

/**
 * Turns an API error response into a readable message.
 * 400 responses include a "details" list of what was wrong.
 */
function errorText(status, data) {
  if (status === 503) {
    return "Accounts are temporarily unavailable. Please try again later.";
  }
  if (Array.isArray(data.details) && data.details.length > 0) {
    return data.details.join(". ") + ".";
  }
  return data.error || "Something went wrong. Please try again.";
}

/**
 * Sends a form to the API and logs the user in on success.
 */
async function submitAuthForm(form, path, body) {
  // Browser's built-in checks first (required, email format, min length)
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const submitButton = form.querySelector("button[type=submit]");
  submitButton.disabled = true;
  hideAuthMessage();

  try {
    const { ok, status, data } = await apiRequest(path, { method: "POST", body });

    if (!ok) {
      showAuthMessage(errorText(status, data));
      return;
    }

    currentUser = data.user;
    renderAccountButton();
    form.reset();
    authDialog.close();
  } catch {
    showAuthMessage("Could not reach the server. Check your connection.");
  } finally {
    submitButton.disabled = false;
  }
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuthForm(loginForm, "/api/auth/login", {
    email: document.getElementById("login-email").value,
    password: document.getElementById("login-password").value
  });
});

registerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuthForm(registerForm, "/api/auth/register", {
    name: document.getElementById("register-name").value,
    email: document.getElementById("register-email").value,
    password: document.getElementById("register-password").value
  });
});

authTabs.forEach((tab) => {
  tab.addEventListener("click", () => setAuthMode(tab.dataset.mode));
});

authClose.addEventListener("click", () => authDialog.close());

// Close when clicking the dark backdrop outside the popup
authDialog.addEventListener("click", (event) => {
  if (event.target === authDialog) authDialog.close();
});

accountBtn.addEventListener("click", () => {
  if (!currentUser) {
    openAuthDialog("login");
    return;
  }

  renderAccountMenu();
  setAccountMenuOpen(accountMenu.hidden);   // toggle
});

logoutBtn.addEventListener("click", logOut);

// Close the account menu when clicking anywhere else, or pressing Escape
document.addEventListener("click", (event) => {
  if (!event.target.closest(".account-wrap")) setAccountMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setAccountMenuOpen(false);
});

// Check the login state when the page opens
loadCurrentUser();
