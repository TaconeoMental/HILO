"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_LIMIT = 10;

export function useProjects() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const pollingRef = useRef(null);
  const offsetRef = useRef(0);
  const initializedRef = useRef(false);

  const load = useCallback(
    async (options = {}) => {
      const reset = options.reset === true;
      const replace = options.replace === true;
      const silent = options.silent === true;
      const nextLimit = options.limit ?? DEFAULT_LIMIT;
      const nextOffset = reset ? 0 : offsetRef.current;
      const nextQuery = options.query ?? query;
      const nextStatus = options.status ?? status;
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(nextLimit),
          offset: String(nextOffset)
        });
        if (nextQuery) params.append("q", nextQuery);
        if (nextStatus) params.append("status", nextStatus);

        const res = await fetch(`/api/projects?${params.toString()}`, {
          credentials: "include"
        });
        const data = await res.json();
        if (!data.ok) {
          throw new Error(data.error || "Error cargando proyectos");
        }
        setTotal(data.total || 0);
        if (reset || replace) {
          setItems(data.projects || []);
        } else {
          setItems((prev) => [...prev, ...(data.projects || [])]);
        }
        const newOffset = nextOffset + nextLimit;
        offsetRef.current = newOffset;
        setOffset(newOffset);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [query, status]
  );

  // Carga inicial - solo una vez al montar
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      load({ reset: true });
    }
  }, [load]);

  useEffect(() => {
    const hasInProgress = items.some((project) =>
      ["queued", "processing"].includes(project.job_status || project.status)
    );
    if (!hasInProgress) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }
    if (!pollingRef.current) {
      pollingRef.current = setInterval(() => {
        const currentLimit = items.length || DEFAULT_LIMIT;
        load({ reset: true, replace: true, silent: true, limit: currentLimit });
      }, 3000);
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [items, load]);

  const applyFilters = useCallback((nextQuery, nextStatus) => {
    setQuery(nextQuery);
    setStatus(nextStatus);
    setOffset(0);
    setItems([]);
    setTotal(0);
  }, []);

  return {
    items,
    total,
    offset,
    limit: DEFAULT_LIMIT,
    loading,
    query,
    status,
    load,
    applyFilters
  };
}
