import { useEffect, useState } from "react";
import { Nav } from "./components/Nav";
import { EscrowDrawer } from "./components/EscrowDrawer";
import { Landing } from "./components/pages/Landing";
import { Browse } from "./components/pages/Browse";
import { ProjectDetail } from "./components/pages/ProjectDetail";
import { PostProject } from "./components/pages/PostProject";
import { StudentDashboard } from "./components/pages/StudentDashboard";
import { ClientDashboard } from "./components/pages/ClientDashboard";
import { Profile } from "./components/pages/Profile";
import { Auth } from "./components/pages/Auth";
import { Toaster } from "./components/ui/sonner";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BrandLogo } from "./brand/BrandLogo";
import { Button } from "./components/ui/button";

export default function App() {
  const readInitialPage = () => {
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    if (path.startsWith("/project/")) { localStorage.setItem("currentProjectId", path.split("/").pop()); return "detail"; }
    return ({ "/": "landing", "/landing": "landing", "/browse": "browse", "/student": "student", "/client": "client", "/profile": "profile", "/post": "post", "/auth": "auth" })[path] || "landing";
  };
  const [page, setPageState] = useState(readInitialPage);
  const [authError, setAuthError] = useState(false);
  const [authRetry, setAuthRetry] = useState(0);
  const setPage = (next) => {
    const target = next === "landing" ? "/" : next === "detail" ? "/project/" + localStorage.getItem("currentProjectId") : "/" + next;
    if ((window.location.pathname.replace(/\/$/, "") || "/") !== target) window.history.pushState({}, "", target);
    setPageState(next);
  };
  const [role, setRole] = useState("student");
  const [theme, setTheme] = useState(() => localStorage.getItem("bidhub-theme") || "light");
  const [escrowOpen, setEscrowOpen] = useState(false);
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("bidhub-theme", theme);
  }, [theme]);

  // Load user profile on mount / token change
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 10000);
    setAuthError(false);
    if (token) {
      fetch("/api/auth/me", {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => {
          if (res.ok) return res.json();
          const err = new Error("Auth check failed");
          err.status = res.status;
          throw err;
        })
        .then((user) => {
          if (!active) return;
          setCurrentUser(user);
          // Sync role switcher to user's registered role initially
          setRole(user.role);
          // Auto-redirect if page doesn't match role
          let path = window.location.pathname;
          if (path.length > 1 && path.endsWith("/")) {
            path = path.slice(0, -1);
          }
          if (path === "/student" && user.role !== "student") setPage("client");
          if (path === "/client" && user.role !== "client") setPage("student");
          if (path === "/post" && user.role !== "client") setPage("student");
          if (path === "/auth") setPage(user.role);
        })
        .catch((err) => {
          if (!active) return;
          setAuthError(true);
          // Only clear token/logout if status is 401 or 403
          if (err.status === 401 || err.status === 403) {
            localStorage.removeItem("token");
            setToken("");
            setCurrentUser(null);
            setPage("landing");
          }
        });
    } else {
      setCurrentUser(null);
    }
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [token, authRetry]);

  // Synchronize browser history and pathing
  useEffect(() => {
    const handlePopState = () => {
      let path = window.location.pathname;
      if (path.length > 1 && path.endsWith("/")) {
        path = path.slice(0, -1);
      }
      const isPrivate = ["/student", "/client", "/profile", "/post"].includes(path) || path.startsWith("/project/");
      
      const activeToken = token || localStorage.getItem("token");
      if (isPrivate && !activeToken) {
        setPage("auth");
        return;
      }

      if (path === "/" || path === "/landing") {
        setPage("landing");
      } else if (path === "/browse") {
        setPage("browse");
      } else if (path === "/student") {
        requireAuth("student", () => setPage("student"));
      } else if (path === "/client") {
        requireAuth("client", () => setPage("client"));
      } else if (path === "/profile") {
        requireAuth("profile", () => setPage("profile"));
      } else if (path === "/post") {
        requireAuth("post", () => setPage("post"));
      } else if (path === "/auth") {
        if (activeToken) {
          if (currentUser) {
            setPage(currentUser.role);
          } else {
            setPage("landing");
          }
        } else {
          setPage("auth");
        }
      } else if (path.startsWith("/project/")) {
        const id = path.split("/").pop();
        if (id) {
          localStorage.setItem("currentProjectId", id);
          setPage("detail");
        }
      }
    };

    handlePopState();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [token, currentUser]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken("");
    setCurrentUser(null);
    setPage("landing");
  };

  const navigateDashboard = (r) => setPage(r);

  // Helper to ensure authenticated access and role separation
  const requireAuth = (targetPage, action) => {
    if (!token) {
      setPage("auth");
      return;
    }

    if (currentUser) {
      if (targetPage === "student" && currentUser.role !== "student") {
        setPage("client");
        return;
      }
      if (targetPage === "client" && currentUser.role !== "client") {
        setPage("student");
        return;
      }
      if (targetPage === "post" && currentUser.role !== "client") {
        setPage("student");
        return;
      }
    }

    action();
  };

  if (token && !currentUser && authError) {
    return (
      <div role="alert" className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 p-6">
        <BrandLogo width={140} />
        <p className="text-sm text-muted-foreground mt-2">We could not restore your workspace session.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAuthRetry(n => n + 1)} className="rounded-[5px]">
            Retry
          </Button>
          <Button size="sm" onClick={handleLogout} className="rounded-[5px]">
            Sign out
          </Button>
        </div>
      </div>
    );
  }
  if (token && !currentUser) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 p-6">
        <BrandLogo width={140} />
        <p className="text-sm text-muted-foreground animate-pulse">
          Opening workspace…
        </p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground">
        <Nav
          page={page}
          setPage={(p) => {
            if (["student", "client", "post", "profile"].includes(p)) {
              requireAuth(p, () => { setPage(p); window.scrollTo({ top: 0 }); });
            } else {
              setPage(p);
              window.scrollTo({ top: 0 });
            }
          }}
          role={role}
          setRole={(r) => { setRole(r); navigateDashboard(r); }}
          theme={theme}
          toggleTheme={() => setTheme(t => t === "dark" ? "light" : "dark")}
          onOpenEscrow={() => requireAuth("escrow", () => setEscrowOpen(true))}
          currentUser={currentUser}
          onLogout={handleLogout}
          token={token}
        />

        <main>
          {page === "landing" && <Landing setPage={setPage} />}
          {page === "browse" && <Browse setPage={setPage} />}
          {page === "detail" && <ProjectDetail setPage={setPage} role={role} token={token} currentUser={currentUser} />}
          {page === "post" && <PostProject token={token} onDone={() => setPage("client")} />}
          {page === "student" && (
            <StudentDashboard
              setPage={setPage}
              onOpenEscrow={() => setEscrowOpen(true)}
              token={token}
              currentUser={currentUser}
            />
          )}
          {page === "client" && (
            <ClientDashboard
              setPage={setPage}
              onOpenEscrow={() => setEscrowOpen(true)}
              token={token}
              currentUser={currentUser}
            />
          )}
          {page === "profile" && <Profile token={token} currentUser={currentUser} />}
          {page === "auth" && <Auth onDone={(userRole) => setPage(userRole || "landing")} setToken={setToken} />}
        </main>

        <EscrowDrawer open={escrowOpen} onClose={() => setEscrowOpen(false)} token={token} currentUser={currentUser} />
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}
