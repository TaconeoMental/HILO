"use client";

import { useCallback, useState } from "react";

export function useAdminOverview() {
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [processingChart, setProcessingChart] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [loadingProcessingChart, setLoadingProcessingChart] = useState(false);

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

  const loadProcessingChart = useCallback(async () => {
    setLoadingProcessingChart(true);
    try {
      const res = await fetch("/api/admin/overview/processing-history", {
        credentials: "include"
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Error cargando rendimiento");
      }
      const average = (values = []) => {
        const valid = (values || []).filter(
          (value) => typeof value === "number" && !Number.isNaN(value) && value > 0
        );
        if (valid.length === 0) {
          return 0;
        }
        const sum = valid.reduce((acc, value) => acc + value, 0);
        return Number((sum / valid.length).toFixed(2));
      };
      setProcessingChart({
        labels: data.labels || [],
        pipelineTimes: data.pipeline_times || [],
        segmentTimes: data.segment_times || [],
        photoTimes: data.photo_times || [],
        dateInfo: data.date_info || null,
        averages: {
          pipeline: average(data.pipeline_times || []),
          segment: average(data.segment_times || []),
          photo: average(data.photo_times || [])
        }
      });
    } finally {
      setLoadingProcessingChart(false);
    }
  }, []);

  return {
    stats,
    chartData,
    processingChart,
    loadingStats,
    loadingChart,
    loadingProcessingChart,
    loadStats,
    loadChart,
    loadProcessingChart
  };
}
