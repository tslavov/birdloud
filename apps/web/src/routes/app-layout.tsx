import { Bird, BookOpen, ShieldCheck } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router";
import { API_BASE_URL } from "@/lib/api";
import { cn } from "@/lib/cn";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Bird className="h-5 w-5" aria-hidden="true" />
            </span>
            BirdLoud
          </Link>
          <nav className="flex items-center gap-1" aria-label="Primary navigation">
            <NavLink
              to="/organizer"
              className={({ isActive }) =>
                cn("nav-link", isActive && "bg-muted text-foreground")
              }
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Organizer</span>
            </NavLink>
            <a className="nav-link" href={`${API_BASE_URL}/docs`} target="_blank" rel="noreferrer">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">API docs</span>
            </a>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-5 py-8 text-sm text-muted-foreground sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <p>BirdLoud V1 — fast for voters, visible and limited for attackers.</p>
          <p>Verified credentials reduce abuse; they do not prove unique real-world personhood.</p>
        </div>
      </footer>
    </div>
  );
}
