"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ToastList from "@/components/common/ToastList";
import ScriptPreview from "@/components/Results/ScriptPreview";

const POLL_INTERVAL = 2000;

export default function ResultClient({
  projectId,
  initialStatus,
  initialError,
  initialOutputFile,
  initialFallbackFile,
  projectName
}) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState(initialError);
  const [outputFile, setOutputFile] = useState(initialOutputFile);
  const [fallbackFile, setFallbackFile] = useState(initialFallbackFile);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [toasts, setToasts] = useState([]);
  const previewRef = useRef(null);

  const dismissToast = useCallback((id) => {
    setToasts((prev) =>
      prev.map((toast) => (toast.id === id ? { ...toast, visible: false } : toast))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 300);
  }, []);

  const addToast = useCallback(
    (message, type = "info") => {
      const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      setToasts((prev) => [...prev, { id, message, type, visible: false }]);
      setTimeout(() => {
        setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, visible: true } : toast)));
      }, 10);
      setTimeout(() => {
        dismissToast(id);
      }, 2000);
    },
    [dismissToast]
  );

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/project/${projectId}/status`, {
        credentials: "include"
      });
      const data = await res.json();
      if (!data.ok) return;
      if (data.status !== status || data.error !== error) {
        setStatus(data.status);
        setError(data.error || "");
        setOutputFile(data.output_file || "");
        setFallbackFile(data.fallback_file || "");
      }
    } catch (err) {
      // ignore polling errors
    }
  }, [projectId, status, error]);

  useEffect(() => {
    if (status === "queued" || status === "processing") {
      const interval = setInterval(fetchStatus, POLL_INTERVAL);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [status, fetchStatus]);

  useEffect(() => {
    if (status !== "done") return;
    let active = true;
    const loadPreview = async () => {
      setPreviewLoading(true);
      setPreviewError("");
      try {
        const res = await fetch(`/api/project/${projectId}/preview`, {
          credentials: "include"
        });
        const data = await res.json();
        if (!active) return;
        if (data.ok) {
          setPreviewHtml(data.html || "");
        } else {
          setPreviewError(data.error || "Error cargando preview");
        }
      } catch (err) {
        if (!active) return;
        setPreviewError("Error cargando preview");
      } finally {
        if (active) setPreviewLoading(false);
      }
    };
    loadPreview();
    return () => {
      active = false;
    };
  }, [status, projectId]);

  const copyPreview = async () => {
    if (!previewRef.current) return;
    const html = previewRef.current.innerHTML;
    const text = previewRef.current.innerText;
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const blobInput = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" })
        });
        await navigator.clipboard.write([blobInput]);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(html);
      } else {
        const range = document.createRange();
        range.selectNodeContents(previewRef.current);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("copy");
        selection.removeAllRanges();
      }
      addToast("Copiado al portapapeles", "success");
    } catch (err) {
      addToast("Error al copiar. Intenta seleccionar manualmente.", "error");
    }
  };

  const subtitleName = projectName || "Tu guión";

  if (status === "queued" || status === "processing") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center rounded-3xl border border-bg-surface-light bg-bg-surface/70 px-6 py-12 text-center shadow-xl">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-accent/30 border-t-accent" />
        <h1 className="text-2xl font-semibold text-text-primary">Procesando...</h1>
        <p className="mt-2 text-sm text-text-muted">Generando tu guión. Esto puede tomar unos segundos.</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-bg-surface-light bg-bg-surface/70 px-6 py-10 text-center shadow-xl">
        <h1 className="text-2xl font-semibold text-text-primary">Error al procesar</h1>
        {error ? (
          <div className="mt-4 rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </div>
        ) : null}
        <p className="mt-4 text-sm text-text-muted">Hubo un problema generando el guion.</p>
        {fallbackFile ? (
          <div className="mt-6">
            <a
              href={`/r/${projectId}/download/${fallbackFile}`}
              className="inline-flex items-center justify-center rounded-full border border-accent bg-accent px-5 py-2 text-xs font-semibold text-white hover:bg-accent-light"
            >
              Descargar Transcripción
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="mx-auto w-full max-w-4xl rounded-3xl border border-bg-surface-light bg-bg-surface/70 px-6 py-10 text-center shadow-xl">
        <h1 className="text-2xl font-semibold text-text-primary">¡Guion listo!</h1>
        <p className="mt-2 text-sm text-text-muted">{subtitleName} ha sido generado exitosamente.</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {outputFile ? (
            <a
              href={`/r/${projectId}/download/${outputFile}`}
              className="inline-flex items-center justify-center rounded-full border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-secondary hover:border-accent"
            >
              Descargar MD
            </a>
          ) : null}
          {fallbackFile ? (
            <a
              href={`/r/${projectId}/download/${fallbackFile}`}
              className="inline-flex items-center justify-center rounded-full border border-bg-surface-light px-4 py-2 text-xs font-semibold text-text-secondary hover:border-accent"
            >
              Transcripción
            </a>
          ) : null}
          <button
            type="button"
            onClick={copyPreview}
            className="inline-flex items-center justify-center rounded-full border border-accent bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-light"
          >
            Copiar
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl rounded-3xl border border-bg-surface-light bg-bg-surface/70 px-6 py-6 shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Vista previa</h2>
        </div>

        <div
          ref={previewRef}
          className="mt-4 rounded-2xl border border-black/10 bg-white px-5 py-6 text-sm text-black"
        >
          {previewLoading ? (
            <p className="text-text-muted">Cargando...</p>
          ) : previewError ? (
            <p className="text-error">{previewError}</p>
          ) : (
            <ScriptPreview html={previewHtml} />
          )}
        </div>
      </div>

      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
