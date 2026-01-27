"use client";

import { useState } from "react";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "recording", label: "Grabando" },
  { value: "queued", label: "En cola" },
  { value: "processing", label: "En proceso" },
  { value: "done", label: "Finalizado" },
  { value: "error", label: "Error" }
];

export default function ProjectsFilters({ onApply }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const onSubmit = (event) => {
    event.preventDefault();
    onApply(query.trim(), status);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 md:flex-row md:items-center">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por nombre"
        className="w-full rounded-lg border border-bg-surface-light bg-bg-surface/70 px-4 py-2 text-sm text-text-primary outline-none focus:border-accent"
      />
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="w-full rounded-lg border border-bg-surface-light bg-bg-surface/70 px-4 py-2 text-sm text-text-primary outline-none focus:border-accent md:w-56"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-lg border border-accent bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-light"
      >
        Buscar
      </button>
    </form>
  );
}
