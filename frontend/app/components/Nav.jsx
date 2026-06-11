import { Bell, Search, Moon, Sun, Wallet, Menu, ChevronDown, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "./ui/dropdown-menu";
import { useState, useEffect, useCallback } from "react";
import { cn } from "./ui/utils";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../../api/notificationApi";

const links = [
  { label: "Browse", page: "browse" },
  { label: "Post a project", page: "post" },
  { label: "Dashboard", page: "student" },
];

// Notification type to display label/color
const notifMeta = {
  BID_RECEIVED: { label: "New Bid", color: "bg-blue-500" },
  BID_ACCEPTED: { label: "Bid Accepted", color: "bg-green-500" },
  BID_REJECTED: { label: "Bid Rejected", color: "bg-red-400" },
  MILESTONE_SUBMITTED: { label: "Work Submitted", color: "bg-amber-500" },
  MILESTONE_RELEASED: { label: "Funds Released", color: "bg-green-500" },
  MILESTONE_CHANGES_REQUESTED: { label: "Changes Requested", color: "bg-orange-500" },
  PROJECT_COMPLETED: { label: "Project Done", color: "bg-emerald-500" },
  REVIEW_RECEIVED: { label: "New Review", color: "bg-purple-500" },
  PROJECT_ASSIGNED: { label: "Assigned", color: "bg-teal-500" },
  MESSAGE_RECEIVED: { label: "New Message", color: "bg-amber-500" },
};

function NotificationBell({ token, setPage }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await getNotifications(token);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // Silently fail - notifications are non-critical
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetch on mount and when bell is opened
  useEffect(() => {
    if (token) fetchNotifications();
  }, [token, fetchNotifications]);

  // Poll every 60 seconds for new notifications
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [token, fetchNotifications]);

  const handleMarkAllRead = async (e) => {
    e.stopPropagation();
    try {
      await markAllNotificationsRead(token);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // silently fail
    }
  };

  const handleMarkRead = async (notifId) => {
    try {
      await markNotificationRead(notifId, token);
      setNotifications((prev) =>
        prev.map((n) => (n._id === notifId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silently fail
    }
  };

  if (!token) {
    return (
      <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
        <Bell className="size-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={(o) => { setOpen(o); if (o) fetchNotifications(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)] text-[10px] font-bold flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[440px] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck className="size-3" />
              Mark all read
            </button>
          )}
        </div>

        {/* Notification list */}
        <div className="overflow-y-auto flex-1">
          {loading && notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell className="size-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">All caught up!</p>
              <p className="text-xs text-muted-foreground mt-1">No notifications yet.</p>
            </div>
          ) : (
            notifications.map((n) => {
              const meta = notifMeta[n.type] || { label: "Update", color: "bg-gray-400" };
              return (
                <button
                  key={n._id}
                  onClick={() => {
                    if (!n.read) handleMarkRead(n._id);
                    if (n.targetId) {
                      localStorage.setItem("currentProjectId", n.targetId);
                      setPage("detail");
                      setOpen(false);
                    }
                  }}
                  className={cn(
                    "w-full text-left px-4 py-3 flex gap-3 hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-0",
                    !n.read && "bg-secondary/20"
                  )}
                >
                  {/* Type dot */}
                  <div className="mt-1 shrink-0">
                    <span className={cn("block size-2 rounded-full", meta.color, n.read && "opacity-30")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {meta.label}
                    </p>
                    <p className="text-xs leading-relaxed mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {new Date(n.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {!n.read && (
                    <span className="mt-1.5 shrink-0 size-1.5 rounded-full bg-[var(--brand-gold)]" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Nav({ page, setPage, role, setRole, theme, toggleTheme, onOpenEscrow, currentUser, onLogout, token }) {
  const [open, setOpen] = useState(false);
  const filteredLinks = links.filter(l => {
    if (l.page === "post") {
      return currentUser && currentUser.role === "client";
    }
    return true;
  });
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b border-border">
      <div className="mx-auto max-w-7xl 2xl:max-w-[1440px] min-[1920px]:max-w-[1680px] min-[2560px]:max-w-[2200px] min-[3400px]:max-w-[2800px] px-5 lg:px-8 h-16 flex items-center gap-4">
        <button onClick={() => setPage("landing")} className="flex items-center gap-2 group">
          <img src="/bidhublogo.png" alt="Bid·Hub Logo" className="size-8 object-contain rounded-md" />
          <span className="font-serif text-xl tracking-tight flex items-center gap-2">
            Bid<span className="text-[var(--brand-gold)]">·</span>Hub
          </span>
        </button>

        <nav className="hidden md:flex items-center gap-1 ml-4">
          {filteredLinks.map(l => (
            <button key={l.page}
              onClick={() => setPage(l.page === "student" ? (currentUser ? currentUser.role : (role === "client" ? "client" : "student")) : l.page)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm transition-colors",
                page === l.page || (l.page === "student" && (page === "student" || page === "client"))
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}>
              {l.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 max-w-md hidden lg:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input placeholder="Search projects, students, skills…"
              className="pl-9 bg-input-background border-transparent focus-visible:ring-1" />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {!currentUser && (
            <div className="hidden md:flex items-center gap-1 rounded-full bg-secondary p-1 text-xs">
              {["student","client"].map(r => (
                <button key={r} onClick={() => { setRole(r); if (page==="student"||page==="client") setPage(r); }}
                  className={cn("px-3 py-1 rounded-full transition-colors capitalize",
                    role===r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
                  {r}
                </button>
              ))}
            </div>
          )}

          <Button variant="ghost" size="icon" onClick={onOpenEscrow} aria-label="Escrow">
            <Wallet className="size-4" />
          </Button>

          {/* Live notification bell */}
          <NotificationBell token={token} setPage={setPage} />

          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Theme">
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          {currentUser ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-full hover:bg-secondary">
                  <Avatar className="size-7">
                    {currentUser.avatarUrl ? (
                      <img src={currentUser.avatarUrl} alt={currentUser.name} className="rounded-full object-cover size-full" />
                    ) : (
                      <AvatarFallback className="bg-[var(--brand-espresso)] text-[var(--brand-gold)] text-xs">
                        {currentUser.name.split(" ").map(x => x[0]).join("")}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-2">
                  <p className="text-sm font-medium">{currentUser.name}</p>
                  <p className="text-xs text-muted-foreground">{currentUser.college || "No College"} · {currentUser.role}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setPage("profile")}>View profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPage(currentUser.role)}>Dashboard</DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenEscrow}>Escrow & payouts</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              onClick={() => setPage("auth")}
              className="rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90 text-xs px-4 h-8"
            >
              Sign in
            </Button>
          )}

          <button className="md:hidden p-2" onClick={() => setOpen(!open)}>
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-border px-5 py-3 space-y-1 bg-background">
          {filteredLinks.map(l => (
            <button key={l.page} onClick={() => { setPage(l.page === "student" ? (currentUser ? currentUser.role : role) : l.page); setOpen(false); }}
              className="block w-full text-left py-2 text-sm">{l.label}</button>
          ))}
        </div>
      )}
    </header>
  );
}
