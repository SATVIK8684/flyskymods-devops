/* =========================================================
   FlySkyMods - Admin Dashboard
   The SERVER decides who is allowed on every request:
     401 = not signed in, 403 = signed in but not an admin.
   ========================================================= */

const adminWelcome = document.getElementById("admin-welcome");
const adminBlocked = document.getElementById("admin-blocked");
const blockedTitle = document.getElementById("blocked-title");
const blockedText = document.getElementById("blocked-text");
const adminContent = document.getElementById("admin-content");
const usersBody = document.getElementById("users-body");

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/* ---------------- Helpers ---------------- */

/**
 * Escapes text so user-entered data can never run as HTML (prevents XSS).
 */
function escapeHTML(text) {
  return String(text ?? "")
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

function formatPrice(price) {
  return price === 0 ? "Free" : "₹" + Number(price).toLocaleString("en-IN");
}

function formatSize(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * fetch() wrapper for our JSON API. Returns { ok, status, data }.
 */
async function api(path, { method = "GET", body, headers } = {}) {
  const isJson = body !== undefined && !(body instanceof Blob);
  const response = await fetch(path, {
    method,
    headers: isJson ? { "Content-Type": "application/json" } : headers,
    body: isJson ? JSON.stringify(body) : body
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // empty response
  }
  return { ok: response.ok, status: response.status, data };
}

function errorText(data) {
  if (Array.isArray(data.details) && data.details.length > 0) return data.details.join(". ") + ".";
  return data.error || "Something went wrong.";
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

/* ---------------- Tabs ---------------- */

const tabs = document.querySelectorAll(".admin-tab");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".admin-panel").forEach((panel) => {
      panel.hidden = panel.id !== tab.dataset.panel;
    });
  });
});

/* ---------------- Users ---------------- */

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

/* ---------------- Products ---------------- */

const productsBody = document.getElementById("products-body");
const productForm = document.getElementById("product-form");
const productFormTitle = document.getElementById("product-form-title");
const productMessage = document.getElementById("product-message");
const imagePicker = document.getElementById("image-picker");
const filePicker = document.getElementById("file-picker");
const storageHint = document.getElementById("storage-hint");

let products = [];
let editingId = null;          // null = adding a new product
let pickerProductId = null;    // which row's picture/file button was clicked

const field = (id) => document.getElementById(id);

function showProductMessage(text) {
  productMessage.textContent = text;
  productMessage.className = "auth-message error";
  productMessage.hidden = false;
}

function renderProducts() {
  if (products.length === 0) {
    productsBody.innerHTML = `<tr><td colspan="5" class="admin-empty">No products yet. Click "+ Add product".</td></tr>`;
    return;
  }

  productsBody.innerHTML = products
    .map((p) => {
      const thumb = p.imageUrl
        ? `<img class="admin-thumb" src="${escapeHTML(p.imageUrl)}" alt="">`
        : `<span class="admin-thumb admin-thumb-empty" aria-hidden="true">✈</span>`;
      const file = p.hasFile
        ? `${escapeHTML(p.fileName)}<br><span class="admin-muted">${formatSize(p.fileSize)}</span>`
        : `<span class="admin-muted">No file</span>`;

      return `
        <tr data-id="${p.id}">
          <td>
            <div class="admin-product">
              ${thumb}
              <div>
                <strong>${escapeHTML(p.name)}</strong><br>
                <span class="admin-muted">v${escapeHTML(p.version)} · ${escapeHTML(p.developer)}</span>
              </div>
            </div>
          </td>
          <td>${escapeHTML(p.category)}</td>
          <td>${formatPrice(p.price)}</td>
          <td class="file-cell">${file}<div class="upload-progress" hidden></div></td>
          <td class="admin-actions">
            <button type="button" class="admin-action" data-action="edit">Edit</button>
            <button type="button" class="admin-action" data-action="image">Picture</button>
            <button type="button" class="admin-action" data-action="file">Upload file</button>
            <button type="button" class="admin-action danger" data-action="delete">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function loadProducts() {
  const { ok, data } = await api("/api/admin/products");
  if (ok) {
    products = data;
    renderProducts();
  }
}

function openProductForm(product = null) {
  editingId = product ? product.id : null;
  productFormTitle.textContent = product ? `Edit "${product.name}"` : "Add product";
  field("p-name").value = product ? product.name : "";
  field("p-version").value = product ? product.version : "1.0";
  field("p-category").value = product ? product.category : "Aircraft";
  field("p-price").value = product ? product.price : "";
  field("p-developer").value = product ? product.developer : "";
  field("p-description").value = product ? product.description : "";
  productMessage.hidden = true;
  productForm.hidden = false;
  field("p-name").focus();
}

document.getElementById("add-product-btn").addEventListener("click", () => openProductForm());
document.getElementById("cancel-product-btn").addEventListener("click", () => { productForm.hidden = true; });

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const body = {
    name: field("p-name").value,
    version: field("p-version").value,
    category: field("p-category").value,
    price: field("p-price").value === "" ? "" : Number(field("p-price").value),
    developer: field("p-developer").value,
    description: field("p-description").value
  };

  const { ok, data } = editingId
    ? await api(`/api/admin/products/${editingId}`, { method: "PUT", body })
    : await api("/api/admin/products", { method: "POST", body });

  if (!ok) {
    showProductMessage(errorText(data));
    return;
  }

  productForm.hidden = true;
  await loadProducts();
});

/* --- Row buttons: one listener for the whole table (event delegation) --- */
productsBody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const id = Number(button.closest("tr").dataset.id);
  const product = products.find((p) => p.id === id);

  if (button.dataset.action === "edit") {
    openProductForm(product);
  } else if (button.dataset.action === "image") {
    pickerProductId = id;
    imagePicker.click();
  } else if (button.dataset.action === "file") {
    pickerProductId = id;
    filePicker.click();
  } else if (button.dataset.action === "delete") {
    if (!confirm(`Delete "${product.name}"? This also deletes its download file.`)) return;
    const { ok, data } = await api(`/api/admin/products/${id}`, { method: "DELETE" });
    if (!ok) alert(errorText(data));
    await loadProducts();
  }
});

/* --- Picture upload: the image file itself is the request body --- */
imagePicker.addEventListener("change", async () => {
  const image = imagePicker.files[0];
  imagePicker.value = "";
  if (!image) return;

  if (image.size > 2 * 1024 * 1024) {
    alert("Pictures must be 2 MB or smaller.");
    return;
  }

  const { ok, data } = await api(`/api/admin/products/${pickerProductId}/image`, {
    method: "PUT",
    body: image,
    headers: { "Content-Type": image.type }
  });
  if (!ok) alert(errorText(data));
  await loadProducts();
});

/* --- Mod file upload: straight from the browser to Cloudflare R2 --- */

/**
 * Uploads one piece with XMLHttpRequest (fetch cannot report upload progress).
 * Resolves with the ETag header that R2 returns for the piece.
 */
function putWithProgress(url, blob, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.getResponseHeader("ETag"))
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed - check the R2 CORS settings"));
    xhr.send(blob);
  });
}

async function uploadModFile(productId, file) {
  const row = productsBody.querySelector(`tr[data-id="${productId}"]`);
  const progress = row.querySelector(".upload-progress");
  const showProgress = (text) => { progress.hidden = false; progress.textContent = text; };
  const contentType = file.type || "application/octet-stream";

  showProgress("Preparing upload...");
  const start = await api(`/api/admin/products/${productId}/file/start`, {
    method: "POST",
    body: { fileName: file.name, size: file.size, contentType }
  });
  if (!start.ok) {
    showProgress(errorText(start.data));
    return;
  }

  const { key, mode, url, uploadId, partSize, urls } = start.data;
  const percent = (loaded) => showProgress(`Uploading... ${Math.floor((loaded / file.size) * 100)}%`);

  try {
    let parts;

    if (mode === "single") {
      await putWithProgress(url, file, contentType, percent);
    } else {
      // Big file: send it in parts, one after another
      parts = [];
      for (let i = 0; i < urls.length; i++) {
        const piece = file.slice(i * partSize, (i + 1) * partSize);
        const etag = await putWithProgress(urls[i], piece, null, (loaded) => percent(i * partSize + loaded));
        if (!etag) throw new Error("R2 did not return an ETag - add ETag to the CORS ExposeHeaders");
        parts.push({ PartNumber: i + 1, ETag: etag });
      }
    }

    showProgress("Finishing...");
    const done = await api(`/api/admin/products/${productId}/file/complete`, {
      method: "POST",
      body: { key, uploadId, parts, fileName: file.name, size: file.size }
    });
    if (!done.ok) throw new Error(errorText(done.data));

    await loadProducts();
  } catch (error) {
    if (uploadId) {
      await api(`/api/admin/products/${productId}/file/abort`, { method: "POST", body: { key, uploadId } });
    }
    showProgress(error.message);
  }
}

filePicker.addEventListener("change", () => {
  const file = filePicker.files[0];
  filePicker.value = "";
  if (file) uploadModFile(pickerProductId, file);
});

/* ---------------- Start ---------------- */

async function loadDashboard() {
  try {
    const { ok, status, data: users } = await api("/api/admin/users");

    if (status === 401) {
      showBlocked("Please sign in", "Sign in with an admin account on the store page, then come back here.");
      return;
    }
    if (status === 403) {
      showBlocked("Admin access only", "Your account does not have permission to view this page.");
      return;
    }
    if (!ok) {
      showBlocked("Dashboard unavailable", "The admin service is not available right now. Please try again later.");
      return;
    }

    const me = await api("/api/auth/me");
    adminWelcome.textContent = `Signed in as ${me.data.user ? me.data.user.name : "admin"}.`;

    renderStats(users);
    renderUsers(users);
    adminContent.hidden = false;

    // Tell the admin if mod file uploads are switched off
    const health = await api("/api/health");
    storageHint.textContent = health.data.files && health.data.files.storage
      ? ""
      : "Mod file uploads are switched off until the Cloudflare R2 keys are added (see .env.example). Pictures work already.";

    await loadProducts();
  } catch {
    showBlocked("Could not reach the server", "Check your connection and try again.");
  }
}

loadDashboard();
