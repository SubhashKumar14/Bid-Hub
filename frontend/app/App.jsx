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
          throw new Error("Invalid token");
        })
        .then((user) => {
          setCurrentUser(user);
          // Sync role switcher to user's registered role initially
          setRole(user.role);
        })
        .catch((err) => {
          console.error(err);
          localStorage.removeItem("token");
          setToken("");
          setCurrentUser(null);
        });
    } else {
      setCurrentUser(null);
    }
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken("");
    setCurrentUser(null);
    setPage("landing");
  };

  const navigateDashboard = (r) => setPage(r);

  // Helper to ensure authenticated access
  const requireAuth = (targetPage, action) => {
    if (!token) {
      setPage("auth");
    } else {
      action();
    }
  };

  return (
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
  );
}
