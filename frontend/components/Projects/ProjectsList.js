"use client";

import { useEffect, useState } from "react";
import ProjectCard from "./ProjectCard";
import ProjectsFilters from "./ProjectsFilters";
import { useProjects } from "@/hooks/useProjects";
import Modal from "@/components/common/Modal";

export default function ProjectsList() {
  const { items, total, limit, loading, load, applyFilters } = useProjects();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    load({ reset: true });
  }, [load]);

  const canLoadMore = items.length < total;

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const res = await fetch(`/api/project/${deleteTarget.project_id}`, {
      method: "DELETE",
      credentials: "include"
    });
    const data = await res.json();
    setDeleteLoading(false);
    if (data.ok) {
      setDeleteTarget(null);
      load({ reset: true });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text-primary">Mis Proyectos</h1>
          <a
            href="/record"
            className="rounded-full border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-light"
          >
            Nueva grabación
          </a>
        </div>
        {total > limit ? (
          <ProjectsFilters
            onApply={(q, s) => {
              applyFilters(q, s);
              load({ reset: true, query: q, status: s });
            }}
          />
        ) : null}
      </div>

      {items.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-bg-surface-light p-10 text-center">
          <p className="text-lg font-semibold text-text-primary">No hay proyectos</p>
          <p className="mt-2 text-sm text-text-muted">Crea una nueva grabación para comenzar</p>
        </div>
      ) : null}

      <div className="grid gap-6">
        {items.map((project) => (
          <ProjectCard
            key={project.project_id}
            project={project}
            onRequestDelete={setDeleteTarget}
          />
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Cargando proyectos...</p>
      ) : null}

      {canLoadMore && !loading ? (
        <button
          onClick={() => load({ reset: false })}
          className="w-full rounded-xl border border-bg-surface-light px-4 py-3 text-sm font-semibold text-text-secondary hover:border-accent"
        >
          Cargar más
        </button>
      ) : null}

      <Modal
        open={Boolean(deleteTarget)}
        title="Eliminar proyecto"
        onClose={() => setDeleteTarget(null)}
      >
        <div className="space-y-4 text-sm text-text-secondary">
          <p>
            ¿Eliminar proyecto? Se eliminará permanentemente "
            {deleteTarget?.project_name || "Sin título"}" y todos sus archivos asociados.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleteLoading}
              className="rounded-lg border border-error/40 bg-error/10 px-4 py-2 text-xs font-semibold text-error"
            >
              {deleteLoading ? "Eliminando..." : "Eliminar"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
