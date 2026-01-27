"use client";

import { useCallback, useState } from "react";

const DEFAULT_LIMIT = 10;

export function useAdminAudit() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (options = {}) => {
      const reset = options.reset === true;
      const nextOffset = reset ? 0 : offset;
      const nextQuery = options.query ?? query;
      const nextLimit = options.limit ?? limit;

      setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(nextLimit),
          offset: String(nextOffset)
        });
        if (nextQuery) params.append("q", nextQuery);

        const res = await fetch(`/api/admin/audit?${params.toString()}`, {
          credentials: "include"
        });
        const data = await res.json();
        if (!data.ok) {
          throw new Error(data.error || "Error cargando auditoría");
        }
        setTotal(data.total || 0);
        if (reset) {
          setItems(data.logs || []);
        } else {
          setItems((prev) => [...prev, ...(data.logs || [])]);
        }
        setOffset(nextOffset + nextLimit);
        setLimit(nextLimit);
      } finally {
        setLoading(false);
      }
    },
    [offset, query, limit]
  );

  const applyFilters = useCallback((nextQuery, nextLimit) => {
    setQuery(nextQuery);
    setLimit(nextLimit);
    setOffset(0);
    setItems([]);
    setTotal(0);
  }, []);

  return {
    items,
    total,
    offset,
    limit,
    query,
    loading,
    load,
    applyFilters
  };
}
