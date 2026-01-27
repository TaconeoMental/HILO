"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chart } from "chart.js/auto";
import { useAdminOverview } from "@/hooks/admin/useAdminOverview";

function getTodayValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function OverviewPanel({ onToast }) {
  const { stats, chartData, loadingStats, loadingChart, loadStats, loadChart } =
    useAdminOverview();
  const [dateValue, setDateValue] = useState(getTodayValue);
  const chartRef = useRef(null);
  const canvasRef = useRef(null);

  const loadStatsSafe = useCallback(async () => {
    try {
      await loadStats();
    } catch (error) {
      onToast?.(error.message || "Error cargando overview", "error");
    }
  }, [loadStats, onToast]);

  const loadChartSafe = useCallback(
    async (dateInput) => {
      try {
        await loadChart(dateInput);
      } catch (error) {
        onToast?.(error.message || "Error cargando gráfico", "error");
      }
    },
    [loadChart, onToast]
  );

  useEffect(() => {
    loadStatsSafe();
  }, [loadStatsSafe]);

  useEffect(() => {
    loadChartSafe(dateValue);
  }, [loadChartSafe]);

  const chartConfig = useMemo(() => {
    if (!chartData) return null;
    return {
      type: "line",
      data: {
        labels: chartData.hours,
        datasets: [
          {
            label: "Proyectos",
            data: chartData.projectCounts,
            borderColor: "#F60761",
            backgroundColor: "rgba(246, 7, 97, 0.2)",
            tension: 0.35
          },
          {
            label: "Fotos",
            data: chartData.photoCounts,
            borderColor: "#ffb74d",
            backgroundColor: "rgba(255, 183, 77, 0.2)",
            tension: 0.35
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: "#9da5b4", font: { size: 11 } }
          }
        },
        scales: {
          x: {
            ticks: { color: "#5c6370" },
            grid: { color: "rgba(255,255,255,0.04)" }
          },
          y: {
            ticks: { color: "#5c6370" },
            grid: { color: "rgba(255,255,255,0.04)" }
          }
        }
      }
    };
  }, [chartData]);

  useEffect(() => {
    if (!chartConfig || !canvasRef.current) return;
    if (chartRef.current) {
      chartRef.current.destroy();
    }
    chartRef.current = new Chart(canvasRef.current, chartConfig);
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [chartConfig]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-accent">Admin Overview</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Jobs en proceso", key: "jobs_processing" },
          { label: "Jobs en error", key: "jobs_error" },
          { label: "Imágenes en proceso", key: "images_processing" }
        ].map((card) => (
          <div
            key={card.key}
            className="rounded-2xl border border-accent/40 bg-accent/10 px-4 py-5 text-center"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
              {card.label}
            </p>
            <p className="mt-3 text-2xl font-semibold text-text-primary">
              {loadingStats ? "..." : stats?.[card.key] ?? "--"}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-bg-surface/80 p-5 shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h3 className="text-base font-semibold text-text-primary">Proyectos por hora</h3>
          <div className="flex w-full max-w-md items-center gap-3">
            <input
              type="date"
              className="w-full rounded-lg border border-bg-surface-light bg-bg-surface/70 px-3 py-2 text-sm text-text-primary"
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
            />
            <button
              type="button"
              onClick={() => loadChartSafe(dateValue)}
              className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent hover:bg-accent/20"
            >
              Aplicar
            </button>
          </div>
        </div>

        <div className="mt-4 h-56">
          {loadingChart && !chartData ? (
            <p className="text-sm text-text-muted">Cargando gráfico...</p>
          ) : (
            <canvas ref={canvasRef} />
          )}
        </div>
      </div>
    </div>
  );
}
