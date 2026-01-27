import Link from "next/link";

export default function AppShell({ children, user, hideNavOnMobile = false }) {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <header
        className={`sticky top-0 z-40 border-b border-bg-surface-light/80 bg-bg-primary/90 backdrop-blur ${
          hideNavOnMobile ? "hidden md:block" : ""
        }`}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-[0.3em] text-accent">HILO</span>
          </div>
          <nav className="flex items-center gap-4 text-sm font-medium text-text-secondary">
            <Link
              href="/record"
              className="rounded-full border border-bg-surface-light px-4 py-2 hover:border-accent hover:text-accent-light"
            >
              Nueva grabación
            </Link>
            <Link
              href="/projects"
              className="rounded-full border border-bg-surface-light px-4 py-2 hover:border-accent hover:text-accent-light"
            >
              Proyectos
            </Link>
            {user?.is_admin ? (
              <Link
                href="/admin"
                className="rounded-full border border-bg-surface-light px-4 py-2 hover:border-accent hover:text-accent-light"
              >
                Admin
              </Link>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-6">
        {children}
      </main>
    </div>
  );
}
