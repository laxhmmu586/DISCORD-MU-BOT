const auth = window.firebase?.apps?.length && window.firebase?.auth ? firebase.auth() : null;
      function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[char]);
      }

      function resolveApiBase() {
        const fromWindow = window.MU_API_BASE || "";
        return (fromWindow.trim() || "https://api.mufcapp.net").replace(/\/$/, "");
      }

      async function authHeaders(timeoutMs = 10000) {
        const headers = {};
        if (auth?.currentUser) {
          let timer;
          try {
            const token = await Promise.race([
              auth.currentUser.getIdToken(),
              new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error("Authentication timed out. Please reload the page and sign in again.")), timeoutMs);
              }),
            ]);
            headers.Authorization = `Bearer ${token}`;
          } finally {
            clearTimeout(timer);
          }
        }
        return headers;
      }

      async function apiJson(path, options = {}) {
        const apiBase = resolveApiBase();
        const { authTimeoutMs = 10000, ...fetchOptions } = options;
        const res = await fetch(`${apiBase}${path}`, {
          cache: "no-store",
          ...fetchOptions,
          headers: {
            ...(await authHeaders(authTimeoutMs)),
            ...(options.headers || {}),
          },
        });
        const type = res.headers.get("content-type") || "";
        if (!res.ok) {
          let detail = "";
          if (type.includes("application/json")) {
            try {
              const body = await res.json();
              detail = body?.error ? `: ${body.error}` : "";
            } catch (_) {
              detail = "";
            }
          }
          throw new Error(`HTTP ${res.status} ${res.statusText}${detail}`);
        }
        if (!type.includes("application/json")) throw new Error(`API returned non-JSON from ${apiBase}.`);
        return res.json();
      }

      function rowsTable(rows, columns, emptyText) {
        if (!rows.length) return `<p class="panel-muted">${escapeHtml(emptyText || "No data found.")}</p>`;
        return `<table class="data-table"><thead><tr>${columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((col) => `<td>${escapeHtml(col.value(row) || "-")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      }

      function ymdFromDate(date) {
        return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
      }

      function reviewerDisplayName(value) {
        return String(value || "MUFC").trim().replace(/@.*$/, "") || "MUFC";
      }
function requireServiceLogin(onReady) {
  const login = () => location.replace("/login.html?next=" + encodeURIComponent(location.pathname + location.search));
  if (!auth) return login();
  auth.onAuthStateChanged(user => { if (!user) login(); else onReady?.(user); });
}
