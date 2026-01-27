"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
            <span className="text-sm lg:text-xl font-semibold tracking-[0.3em] text-accent">HILO</span>
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
