"use client";

import { useCallback, useState } from "react";

export function useAdminOverview() {
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/admin/overview", { credentials: "include" });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Error cargando overview");
      }
      setStats(data.stats || {});
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadChart = useCallback(async (dateValue) => {
    setLoadingChart(true);
    try {
      const params = new URLSearchParams({ date: dateValue });
      const res = await fetch(`/api/admin/overview/projects-hourly?${params.toString()}`, {
        credentials: "include"
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Error cargando gráfico");
      }
      setChartData({
        hours: data.hours || [],
        projectCounts: data.project_counts || [],
        photoCounts: data.photo_counts || []
      });
    } finally {
      setLoadingChart(false);
    }
  }, []);

  return {
    stats,
    chartData,
    loadingStats,
    loadingChart,
    loadStats,
    loadChart
  };
}
