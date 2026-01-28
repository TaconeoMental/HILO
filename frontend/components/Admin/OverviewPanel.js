"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chart } from "chart.js/auto";

Chart.defaults.animation = false;
Chart.defaults.transitions.active = { animation: { duration: 0 } };
Chart.defaults.transitions.resize = { animation: { duration: 0 } };
import { useAdminOverview } from "@/hooks/admin/useAdminOverview";

function getTodayValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function OverviewPanel({ onToast }) {
  const {
    stats,
    chartData,
    processingChart,
    loadingStats,
    loadingChart,
    loadingProcessingChart,
    loadStats,
    loadChart,
    loadProcessingChart
  } = useAdminOverview();
  const [dateValue, setDateValue] = useState(getTodayValue);
  const chartRef = useRef(null);
  const canvasRef = useRef(null);
  const processingChartRef = useRef(null);
  const processingCanvasRef = useRef(null);

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

  const loadProcessingSafe = useCallback(async () => {
    try {
      await loadProcessingChart();
    } catch (error) {
      onToast?.(error.message || "Error cargando rendimiento", "error");
    }
  }, [loadProcessingChart, onToast]);

  useEffect(() => {
    loadStatsSafe();
    loadChartSafe(dateValue);
    loadProcessingSafe();

    const interval = setInterval(() => {
      const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
      loadStatsSafe();
      loadChartSafe(dateValue);
      loadProcessingSafe();
      if (typeof window !== "undefined") {
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollY });
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [loadStatsSafe, loadChartSafe, loadProcessingSafe, dateValue]);

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
        animation: false,
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
            beginAtZero: true,
            ticks: { color: "#5c6370" },
            grid: { color: "rgba(255,255,255,0.04)" }
          }
        }
      }
    };
  }, [chartData]);

  const processingChartConfig = useMemo(() => {
    if (!processingChart) return null;
    return {
      type: "line",
      data: {
        labels: processingChart.labels,
        datasets: [
          {
            label: "Tiempo total (s)",
            data: processingChart.totalTimes,
            borderColor: "#6c5ce7",
            backgroundColor: "rgba(108, 92, 231, 0.2)",
            tension: 0.35
          },
          {
            label: "Transcripción (s)",
            data: processingChart.transcriptionTimes,
            borderColor: "#00b894",
            backgroundColor: "rgba(0, 184, 148, 0.2)",
            tension: 0.35
          },
          {
            label: "Estilizado (s)",
            data: processingChart.stylizeTimes,
            borderColor: "#ff7675",
            backgroundColor: "rgba(255, 118, 117, 0.2)",
            tension: 0.35
          }
        ]
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: "#9da5b4", font: { size: 11 } }
          }
        },
        scales: {
          x: {
            ticks: { color: "#5c6370", maxRotation: 45, minRotation: 45 },
            grid: { color: "rgba(255,255,255,0.04)" }
          },
          y: {
            beginAtZero: true,
            ticks: { color: "#5c6370" },
            grid: { color: "rgba(255,255,255,0.04)" }
          }
        }
      }
    };
  }, [processingChart]);

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

  useEffect(() => {
    if (!processingChartConfig || !processingCanvasRef.current) return;
    if (processingChartRef.current) {
      processingChartRef.current.destroy();
    }
    processingChartRef.current = new Chart(processingCanvasRef.current, processingChartConfig);
    return () => {
      if (processingChartRef.current) {
        processingChartRef.current.destroy();
      }
    };
  }, [processingChartConfig]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-accent">Admin Overview</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Jobs en proceso", key: "jobs_processing", flavor: "warn" },
          { label: "Jobs en error", key: "jobs_error", flavor: "error" },
          { label: "Imágenes en proceso", key: "images_processing", flavor: "warn" }
        ].map((card) => (
          <div
            key={card.key}
            className={`rounded-2xl px-4 py-5 text-center border ${
              card.flavor === "warn"
                ? "border-yellow-500/40 bg-yellow-500/10"
                : card.flavor === "error"
                  ? "border-error/40 bg-error/10"
                  : "border-accent/40 bg-accent/10"
            }`}
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

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Tiempo medio transcripción", key: "transcription" },
          { label: "Tiempo medio estilizado", key: "stylize" },
          { label: "Tiempo medio total", key: "total" }
        ].map((card) => (
          <div
            key={card.key}
            className="rounded-2xl border border-white/10 bg-bg-surface/80 px-4 py-5 text-center"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
              {card.label}
            </p>
            <p className="mt-3 text-2xl font-semibold text-text-primary">
              {loadingProcessingChart
                ? "..."
                : processingChart?.averages && processingChart.averages[card.key] !== undefined
                  ? `${processingChart.averages[card.key]} s`
                  : "--"}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-bg-surface/80 p-5 shadow-xl">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h3 className="text-base font-semibold text-text-primary">Rendimiento de procesamiento (24 horas)</h3>
          {processingChart?.dateInfo && (
            <p className="text-xs text-text-muted">
              {processingChart.dateInfo.start} → {processingChart.dateInfo.end} · {processingChart.dateInfo.projects_count} proyectos
            </p>
          )}
        </div>
        <div className="mt-4 h-56">
          {loadingProcessingChart && !processingChart ? (
            <p className="text-sm text-text-muted">Cargando rendimiento...</p>
          ) : (
            <canvas ref={processingCanvasRef} />
          )}
        </div>
      </div>
    </div>
  );
}
