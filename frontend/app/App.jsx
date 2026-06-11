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

export default function App() {
  const [page, setPage] = useState("landing");
  const [role, setRole] = useState("student");
  const [theme, setTheme] = useState("dark");
  const [escrowOpen, setEscrowOpen] = useState(false);
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Load user profile on mount / token change
  useEffect(() => {
    if (token) {
      fetch("/api/auth/me", {
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
          setCurrentUser(user);
          // Sync role switcher to user's registered role initially
          setRole(user.role);
          // Auto-redirect if page doesn't match role
          const path = window.location.pathname;
          if (path === "/student" && user.role !== "student") setPage("client");
          if (path === "/client" && user.role !== "client") setPage("student");
          if (path === "/post" && user.role !== "client") setPage("student");
          if (path === "/auth") setPage(user.role);
        })
        .catch((err) => {
          console.error("Auth check failed error:", err);
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
  }, [token]);

  // Synchronize browser history and pathing
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
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

  useEffect(() => {
    let targetPath = "/";
    if (page === "browse") targetPath = "/browse";
    else if (page === "student") targetPath = "/student";
    else if (page === "client") targetPath = "/client";
    else if (page === "profile") targetPath = "/profile";
    else if (page === "post") targetPath = "/post";
    else if (page === "auth") targetPath = "/auth";
    else if (page === "detail") {
      const pid = localStorage.getItem("currentProjectId");
      targetPath = pid ? `/project/${pid}` : "/browse";
    }

    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, "", targetPath + window.location.search);
    }
  }, [page]);

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

  if (token && !currentUser) {
    return (
      <div className="min-h-screen bg-[var(--brand-deep)] text-[#f1e8cf] flex items-center justify-center font-serif text-xl animate-pulse">
        Initializing secure marketplace session...
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
