export function initAdminAudit() {
  const auditBody = document.querySelector("#audit-table tbody");
  if (!auditBody) {
    return;
  }

  let auditTable = null;
  const detailsMap = new Map();
  const detailModal = document.getElementById("audit-detail-modal");
  const detailCode = document.getElementById("audit-detail-code");
  const detailClose = document.getElementById("audit-detail-close");

  function showToast(message) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
            <i class="bi bi-info-circle-fill toast-icon info"></i>
            <span class="toast-message">${message}</span>
        `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short"
    });
  }

  function renderLogs(logs) {
    detailsMap.clear();
    const rowsHtml = logs
      .map((entry) => {
        const actor = entry.actor_username || entry.actor_user_id || "-";
        const target = entry.target_username || entry.target_user_id || "-";
        const detailsId = entry.id || `${entry.created_at}-${entry.action}`;
        detailsMap.set(String(detailsId), entry.details || null);
        return `
                <tr>
                    <td>${formatDate(entry.created_at)}</td>
                    <td>${entry.action}</td>
                    <td>${actor}</td>
                    <td>${target}</td>
                    <td>
                        <button class="btn btn-action btn-small" data-detail-id="${detailsId}">Detalle</button>
                    </td>
                </tr>
            `;
      })
      .join("");

    if (auditTable) {
      const tempBody = document.createElement("tbody");
      tempBody.innerHTML = rowsHtml;
      auditTable.clear();
      auditTable.rows.add($(tempBody).children());
      auditTable.draw();
      return;
    }

    auditBody.innerHTML = rowsHtml;
    auditTable = $("#audit-table").DataTable({
      pageLength: 10,
      order: [[0, "desc"]],
      language: {
        search: "Buscar",
        lengthMenu: "Mostrar _MENU_",
        info: "Mostrando _START_ a _END_ de _TOTAL_",
        paginate: { previous: "Anterior", next: "Siguiente" }
      }
    });
  }

  function openDetailModal(details) {
    if (!detailModal || !detailCode) return;
    if (!details) {
      detailCode.className = "";
      detailCode.textContent = "Sin detalle";
    } else {
      const pretty = JSON.stringify(details, null, 2);
      detailCode.textContent = pretty;
      if (window.hljs) {
        detailCode.className = "language-json";
        detailCode.removeAttribute("data-highlighted");
        window.hljs.highlightElement(detailCode);
      }
    }
    detailModal.style.display = "flex";
  }

  function closeDetailModal() {
    if (!detailModal || !detailCode) return;
    detailModal.style.display = "none";
    detailCode.textContent = "";
  }

  async function loadLogs() {
    const res = await fetch("/api/admin/audit");
    const data = await res.json();
    if (!data.ok) {
      showToast(data.error || "Error cargando auditoría");
      return;
    }
    renderLogs(data.logs || []);
  }

  document.getElementById("clear-logs")?.addEventListener("click", () => {
    confirmAction({
      title: "Borrar auditoría",
      message: "Esta acción eliminará todos los logs.",
      confirmText: "Borrar",
      onConfirm: async () => {
        const res = await fetch("/api/admin/audit/clear", { method: "POST" });
        const data = await res.json();
        if (!data.ok) {
          showToast(data.error || "Error al borrar auditoría");
          return;
        }
        loadLogs();
        showToast("Auditoría vaciada");
      }
    });
  });

  document.getElementById("cleanup-events")?.addEventListener("click", () => {
    confirmAction({
      title: "Limpiar eventos",
      message: "Elimina eventos con más de 90 días.",
      confirmText: "Limpiar",
      onConfirm: async () => {
        const res = await fetch("/api/admin/cleanup-events", { method: "POST" });
        const data = await res.json();
        if (!data.ok) {
          showToast(data.error || "Error al limpiar eventos");
          return;
        }
        loadLogs();
        showToast(`Eventos eliminados: ${data.deleted || 0}`);
      }
    });
  });

  function confirmAction({ title, message, confirmText, onConfirm }) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
            <div class="modal-card">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="confirm-cancel">Cancelar</button>
                    <button class="btn btn-action warning" id="confirm-apply">${confirmText}</button>
                </div>
            </div>
        `;
    document.body.appendChild(overlay);

    overlay
      .querySelector("#confirm-cancel")
      .addEventListener("click", () => overlay.remove());
    overlay.querySelector("#confirm-apply").addEventListener("click", async () => {
      await onConfirm();
      overlay.remove();
    });
  }

  document.addEventListener("click", (event) => {
    const detailBtn = event.target.closest("[data-detail-id]");
    if (!detailBtn) return;
    const detailId = detailBtn.getAttribute("data-detail-id");
    const details = detailsMap.get(String(detailId));
    openDetailModal(details);
  });

  if (detailClose) {
    detailClose.addEventListener("click", closeDetailModal);
  }
  if (detailModal) {
    detailModal.addEventListener("click", (event) => {
      if (event.target === detailModal) {
        closeDetailModal();
      }
    });
  }

  loadLogs();
}
