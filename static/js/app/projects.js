import { showToast } from "../../app.js";

export function initProjectsPage() {
  const container = document.getElementById("projects-list");
  if (!container) {
    return;
  }

  function formatDate(isoString) {
    if (!isoString) return "-";
    const date = new Date(isoString);
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatExpires(isoString) {
    if (!isoString) return "Sin expiración";
    const now = new Date();
    const expires = new Date(isoString);
    if (Number.isNaN(expires.getTime())) return "Sin expiración";

    const diffMs = expires - now;
    if (diffMs <= 0) return "Expirado";

    const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
    if (diffHours < 24) {
      return `Expira en ${diffHours} hora${diffHours === 1 ? "" : "s"}`;
    }

    const diffDays = Math.ceil(diffHours / 24);
    return `Expira en ${diffDays} día${diffDays === 1 ? "" : "s"}`;
  }

  function getStatusClass(project) {
    const status = project.status || (project.is_active ? "recording" : project.job_status);
    if (status === "recording") return "recording";
    if (status === "queued") return "processing";
    if (status === "processing") return "processing";
    if (status === "done") return "done";
    if (status === "error") return "error";
    return "done";
  }

  function getStatusText(project) {
    const status = project.status || (project.is_active ? "recording" : project.job_status);
    if (status === "recording") return "Grabando";
    if (status === "queued") return "En cola";
    if (status === "processing") return "En proceso";
    if (status === "done") return "Finalizado";
    if (status === "error") return "Error";
    return "Finalizado";
  }

  function getRetentionTag(project) {
    if (!project.expires_at) return null;
    const label = formatExpires(project.expires_at);
    if (!label || label === "Sin expiración") return null;
    return label;
  }

  function formatDuration(totalSeconds) {
    if (totalSeconds === null || totalSeconds === undefined) return "-";
    const seconds = Math.max(0, Number(totalSeconds));
    if (Number.isNaN(seconds)) return "-";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  let pollingInterval = null;

  function startPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    const processingCards = document.querySelectorAll(
      '.project-card[data-job-status="queued"], .project-card[data-job-status="processing"]'
    );
    if (processingCards.length === 0) return;

    pollingInterval = setInterval(async () => {
      const cards = document.querySelectorAll('.project-card[data-job-status="processing"]');

      if (cards.length === 0) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        return;
      }

      for (const card of cards) {
        const projectId = card.dataset.projectId;
        if (!projectId) continue;

        try {
          const res = await fetch(`/api/project/${projectId}/status`);
          const data = await res.json();

          if (data.ok && !["queued", "processing"].includes(data.status)) {
            updateProjectCard(card, data.status);
          }
        } catch (err) {
          console.warn("Polling error:", err);
        }
      }
    }, 3000);
  }

  function updateProjectCard(card, newStatus) {
    card.dataset.jobStatus = newStatus;
    const projectName =
      card.querySelector(".project-title")?.textContent || "Sin título";

    const statusBadge = card.querySelector(".project-status");
    if (statusBadge) {
      const badgeClass = newStatus === "queued" ? "processing" : newStatus;
      statusBadge.className = `project-status ${badgeClass}`;
      statusBadge.textContent =
        newStatus === "done"
          ? "Finalizado"
          : newStatus === "error"
            ? "Error"
            : newStatus === "queued"
              ? "En cola"
              : newStatus;
    }

    const actionsDiv = card.querySelector(".project-actions");
    const projectId = card.dataset.projectId;

    if (newStatus === "done" && actionsDiv && projectId) {
      actionsDiv.innerHTML = `
                    <a href="/r/${projectId}" class="btn-action primary">
                        <i class="bi bi-file-earmark-text"></i>
                        Ver Guion
                    </a>
                    <button class="btn-action danger" data-action="delete-project" data-project-id="${projectId}" data-project-name="${projectName}">
                        <i class="bi bi-trash"></i>
                        Eliminar
                    </button>
                `;
      showToast("¡Guion generado!", "success");
    } else if (newStatus === "error") {
      showToast("Error al generar guion", "error");
    }
  }

  async function loadProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Error loading projects");
      }

      if (data.projects.length === 0) {
        container.innerHTML = `
                    <div class="empty-state">
                        <i class="bi bi-folder2-open"></i>
                        <h2>No hay proyectos</h2>
                        <p>Crea una nueva grabación para comenzar</p>
                    </div>
                `;
        return;
      }

      container.innerHTML = data.projects
        .map((s) => {
          const statusClass = getStatusClass(s);
          const retentionTag = getRetentionTag(s);
          const created = formatDate(s.created_at);
          const duration = formatDuration(s.recording_duration_seconds);
          const projectName = s.project_name || "Sin título";
          return `
                    <div class="project-card" data-id="${s.project_id}" data-project-id="${s.project_id}" data-job-status="${s.job_status || ""}">
                        <div class="project-header">
                            <div>
                                <h3 class="project-title">${projectName}</h3>
                                ${s.participant_name ? `<span class="project-participant">${s.participant_name}</span>` : ""}
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="project-status ${statusClass}">${getStatusText(s)}</span>
                                ${retentionTag ? `<span class="project-tag retention">${retentionTag}</span>` : ""}
                                ${s.stylize_errors > 0 ? `<span class="project-tag warning" title="${s.stylize_errors} foto(s) no se pudieron estilizar">⚠ Fotos</span>` : ""}
                            </div>
                        </div>
                        <div class="project-meta">
                            <span class="project-meta-item">
                                <i class="bi bi-calendar"></i>
                                ${created}
                            </span>
                            <span class="project-meta-item">
                                <i class="bi bi-clock"></i>
                                ${duration}
                            </span>
                            <span class="project-meta-item">
                                <i class="bi bi-camera"></i>
                                ${s.photo_count} fotos
                            </span>
                        </div>
                        <div class="project-actions">
                            ${s.job_status === "done" ? `
                                <a href="/r/${s.project_id}" class="btn-action primary">
                                    <i class="bi bi-file-earmark-text"></i>
                                    Ver Guion
                                </a>
                            ` : ""}
                            ${["queued", "processing"].includes(s.job_status) ? `
                                <a href="/r/${s.project_id}" class="btn-action secondary">
                                    <i class="bi bi-hourglass-split"></i>
                                    Ver Estado
                                </a>
                            ` : ""}
                            ${s.is_active ? `
                                <span class="btn-action secondary" style="cursor: default;">
                                    <i class="bi bi-record-circle"></i>
                                    Grabando
                                </span>
                            ` : ""}
                            <button class="btn-action danger" data-action="delete-project" data-project-id="${s.project_id}" data-project-name="${projectName}">
                                <i class="bi bi-trash"></i>
                                Eliminar
                            </button>
                        </div>
                    </div>
                `;
        })
        .join("");

      startPolling();
    } catch (err) {
      console.error("Error:", err);
      container.innerHTML = `
                <div class="empty-state">
                    <i class="bi bi-x-circle"></i>
                    <h2>Error al cargar proyectos</h2>
                    <p>Intenta recargar la página</p>
                </div>
            `;
    }
  }

  function confirmDelete(projectId, projectName, card) {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
            <div class="confirm-dialog">
                <h3>¿Eliminar proyecto?</h3>
                <p>Se eliminará permanentemente "<strong>${projectName}</strong>" y todos sus archivos asociados.</p>
                <div class="confirm-actions">
                    <button class="btn-action secondary" data-confirm-cancel>Cancelar</button>
                    <button class="btn-action primary" data-confirm-delete>Eliminar</button>
                </div>
            </div>
        `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    const cancelBtn = overlay.querySelector("[data-confirm-cancel]");
    const confirmBtn = overlay.querySelector("[data-confirm-delete]");

    cancelBtn?.addEventListener("click", () => overlay.remove());
    confirmBtn?.addEventListener("click", async () => {
      try {
        const res = await fetch(`/api/project/${projectId}`, {
          method: "DELETE"
        });
        const data = await res.json();

        if (!data.ok) {
          throw new Error(data.error || "Error deleting project");
        }

        card?.remove();
        showToast("Proyecto eliminado", "success");

        if (!container.querySelector(".project-card")) {
          loadProjects();
        }
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        overlay.remove();
      }
    });
  }

  document.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest("[data-action='delete-project']");
    if (!deleteBtn) return;
    const projectId = deleteBtn.dataset.projectId;
    const card = deleteBtn.closest(".project-card");
    const projectName = deleteBtn.dataset.projectName || "Sin título";
    if (!projectId) return;
    confirmDelete(projectId, projectName, card);
  });

  loadProjects();
}
