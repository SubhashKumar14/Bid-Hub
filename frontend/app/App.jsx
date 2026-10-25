import { useEffect, useState } from "react";
import { useCapabilities } from "../api/capabilities";
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
  const capabilities = useCapabilities();
  const readInitialPage = () => {
    const path = window.location.pathname.replace(/\/$/, "") || "/";
    if (path.startsWith("/project/")) { localStorage.setItem("currentProjectId", path.split("/").pop()); return "detail"; }
    return ({ "/": "landing", "/landing": "landing", "/browse": "browse", "/student": "student", "/client": "client", "/profile": "profile", "/post": "post", "/auth": "auth" })[path] || "landing";
  };
  const [page, setPageState] = useState(readInitialPage);
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const [authError, setAuthError] = useState(false);
  const [authRetry, setAuthRetry] = useState(0);
  const setPage = (next) => {
    if (["post", "profile", "student", "client"].includes(next) && !localStorage.getItem("token")) {
      sessionStorage.setItem("bidhub-return", `/${next}`);
      next = "auth";
    }
    if (currentUser && ((["post", "client"].includes(next) && currentUser.role !== "client") || (next === "student" && currentUser.role !== "student"))) next = currentUser.role;
    if (next === "auth" && window.location.pathname !== "/auth" && !sessionStorage.getItem("bidhub-return")) sessionStorage.setItem("bidhub-return", window.location.pathname);
    const target = next === "landing" ? "/" : next === "detail" ? "/project/" + localStorage.getItem("currentProjectId") : "/" + next;
    if ((window.location.pathname.replace(/\/$/, "") || "/") !== target) window.history.pushState({}, "", target);
    setRoutePath(target);
    setPageState(next);
  };
  const [role, setRole] = useState("student");
  const [theme, setTheme] = useState(() => localStorage.getItem("bidhub-theme") || "light");
  const [escrowOpen, setEscrowOpen] = useState(false);
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const sync = event => { if (event.key === "token") { setCurrentUser(null); setToken(event.newValue || ""); } };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

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
    setCurrentUser(null);
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
          if (path === "/auth") {
            const returnPath = sessionStorage.getItem("bidhub-return");
            sessionStorage.removeItem("bidhub-return");
            if (returnPath && /^\/(project\/[a-f\d]{24}|browse|profile|student|client|post)$/.test(returnPath)) {
              window.history.replaceState({}, "", returnPath);
              const target = readInitialPage();
              setPageState((target === "post" || target === "client") && user.role !== "client" ? "student" : target === "student" && user.role !== "student" ? "client" : target);
            } else setPage(user.role);
          }
        })
        .catch((err) => {
          if (!active) return;
          setAuthError(true);
          // Only clear token/logout if status is 401 or 403
          if (err.status === 401 || err.status === 403) {
            localStorage.removeItem("token");
            setToken("");
            setCurrentUser(null);
            setPage("auth");
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
      const isPrivate = ["/student", "/client", "/profile", "/post"].includes(path);
      
      const activeToken = token || localStorage.getItem("token");
      if (isPrivate && !activeToken) {
        sessionStorage.setItem("bidhub-return", path);
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
    sessionStorage.removeItem("bidhub-return");
    localStorage.removeItem("token");
    setToken("");
    setCurrentUser(null);
    setPage("landing");
  };

  const navigateDashboard = (r) => setPage(r);

  // Helper to ensure authenticated access and role separation
  const requireAuth = (targetPage, action) => {
    if (!token) {
      const path = targetPage === "detail" ? `/project/${localStorage.getItem("currentProjectId")}` : `/${targetPage}`;
      if (["post", "profile", "student", "client", "detail"].includes(targetPage)) sessionStorage.setItem("bidhub-return", path);
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

        <p role="status" className="px-4 py-2 text-center text-xs text-muted-foreground border-b border-border">{capabilities ? (capabilities.isolatedTest ? "Automated test fixture · Mock provider. No real payments or payouts." : "Test workspace · Live payments and payouts are disabled.") : "Financial capabilities unavailable · Do not send real money."}</p>
        <main key={token}>
          {page === "landing" && <Landing setPage={setPage} />}
          {page === "browse" && <Browse setPage={setPage} />}
          {page === "detail" && <ProjectDetail key={`${routePath}:${token}`} setPage={setPage} role={role} token={token} currentUser={currentUser} />}
          {page === "post" && <PostProject currentUser={currentUser} token={token} onDone={() => setPage("client")} />}
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
          {page === "profile" && <Profile token={token} currentUser={currentUser} onUserUpdate={setCurrentUser} />}
          {page === "auth" && <Auth initialRole={role} onDone={() => {}} setToken={setToken} />}
        </main>

        <EscrowDrawer open={escrowOpen} onClose={() => setEscrowOpen(false)} token={token} currentUser={currentUser} />
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}
