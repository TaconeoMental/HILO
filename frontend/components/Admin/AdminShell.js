"use client";

import { useCallback, useMemo, useState } from "react";
import OverviewPanel from "@/components/Admin/OverviewPanel";
import UsersPanel from "@/components/Admin/UsersPanel";
import SessionsPanel from "@/components/Admin/SessionsPanel";
import AuditPanel from "@/components/Admin/AuditPanel";
import ToastList from "@/components/common/ToastList";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Usuarios" },
  { id: "sessions", label: "Sesiones" },
  { id: "audit", label: "Auditoría" }
];

export default function AdminShell() {
  const [activeTab, setActiveTab] = useState("overview");
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, visible: false } : toast)));
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
      }, 4000);
    },
    [dismissToast]
  );

  const panel = useMemo(() => {
    switch (activeTab) {
      case "users":
        return <UsersPanel onToast={addToast} />;
      case "sessions":
        return <SessionsPanel onToast={addToast} />;
      case "audit":
        return <AuditPanel onToast={addToast} />;
      default:
        return <OverviewPanel onToast={addToast} />;
    }
  }, [activeTab, addToast]);

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-3">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                isActive
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-bg-surface-light bg-bg-surface-light/40 text-text-secondary hover:border-accent/40 hover:text-accent"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {panel}

      <ToastList toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
