"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDownIcon, UserCircleIcon, LockClosedIcon, ArrowRightOnRectangleIcon } from "@heroicons/react/24/solid";

function UserDropdown({ user }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();
  const dropdownRef = useRef(null);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
      router.push("/login");
    } catch (err) {
      setLoggingOut(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        <UserCircleIcon className="h-5 w-5" />
        {user.username}
        <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 rounded-lg border border-bg-surface-light bg-bg-surface shadow-lg z-50">
          <Link
            href="/change-password"
            className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-bg-surface-light hover:text-text-primary transition-colors rounded-t-lg"
            onClick={() => setOpen(false)}
          >
            <LockClosedIcon className="h-4 w-4" />
            Cambiar contraseña
          </Link>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-bg-surface-light hover:text-text-primary transition-colors rounded-b-lg disabled:opacity-50"
          >
            <ArrowRightOnRectangleIcon className="h-4 w-4" />
            {loggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppShell({
  children,
  user,
  hideNavOnMobile = false,
  showNewRecording = true,
  fullHeight = false
}) {
  const pathname = usePathname();
  const isProjectsActive = pathname.startsWith("/projects");
  const isAdminActive = pathname.startsWith("/admin");

  const linkBase = "px-3 py-2 transition-colors";
  const linkInactive = `${linkBase} text-text-secondary hover:text-text-primary`;
  const linkActive = `${linkBase} text-accent border-b-2 border-accent`;

  return (
    <div className={`bg-bg-primary text-text-primary ${
      fullHeight ? "h-screen overflow-hidden flex flex-col" : "min-h-screen"
    }`}>
      <header
        className={`sticky top-0 z-40 border-b border-bg-surface-light/80 bg-bg-primary/90 backdrop-blur ${
          hideNavOnMobile ? "hidden md:block" : ""
        }`}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm lg:text-xl font-semibold tracking-[0.3em] text-accent">Kiroku</span>
            {showNewRecording && (
              <Link
                href="/record"
                className="hidden md:inline-flex rounded-full bg-accent/20 px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent/30"
              >
                + Nueva grabación
              </Link>
            )}
          </div>
          <nav className="flex items-center gap-2 md:gap-4 text-sm font-medium">
            <Link
              href="/projects"
              className={isProjectsActive ? linkActive : linkInactive}
            >
              Proyectos
            </Link>
            {user?.is_admin ? (
              <Link
                href="/admin"
                className={isAdminActive ? linkActive : linkInactive}
              >
                Admin
              </Link>
            ) : null}
            {user && <UserDropdown user={user} />}
          </nav>
        </div>
      </header>
      <main className={fullHeight 
        ? "flex-1 overflow-hidden" 
        : "mx-auto w-full max-w-6xl px-5 py-6"
      }>
        {children}
      </main>
    </div>
  );
}
