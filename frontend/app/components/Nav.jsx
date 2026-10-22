import { Bell, Search, Moon, Sun, Wallet, Menu, ChevronDown, CheckCheck } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "./ui/dropdown-menu";
import { useState, useEffect, useCallback } from "react";
import { cn } from "./ui/utils";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../../api/notificationApi";
import { BrandLogo } from "../brand/BrandLogo";
import { BrandState } from "../brand/BrandState";

const links = [
  { label: "Find a project", page: "browse" },
  { label: "Post a project", page: "post" },
  { label: "Workspace", page: "student" },
];

const notifMeta = {
  BID_RECEIVED: { label: "New Proposal", color: "bg-[var(--status-info)]" },
  BID_ACCEPTED: { label: "Proposal Accepted", color: "bg-[var(--status-success)]" },
  BID_REJECTED: { label: "Proposal Rejected", color: "bg-[var(--status-danger)]" },
  MILESTONE_SUBMITTED: { label: "Work Submitted", color: "bg-[var(--status-warning)]" },
  MILESTONE_RELEASED: { label: "Funds Released", color: "bg-[var(--status-success)]" },
  MILESTONE_CHANGES_REQUESTED: { label: "Changes Requested", color: "bg-[var(--status-danger)]" },
  PROJECT_COMPLETED: { label: "Project Complete", color: "bg-[var(--status-success)]" },
  REVIEW_RECEIVED: { label: "New Review", color: "bg-[var(--status-info)]" },
  PROJECT_ASSIGNED: { label: "Assigned", color: "bg-[var(--status-info)]" },
  MESSAGE_RECEIVED: { label: "New Message", color: "bg-[var(--status-warning)]" },
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
      // Silently fail - non-critical
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchNotifications();
  }, [token, fetchNotifications]);

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
      // ignore
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
      // ignore
    }
  };

  if (!token) {
    return (
      <Button variant="ghost" size="icon" aria-label="Notifications" className="relative rounded-[5px]">
        <Bell className="size-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={(o) => { setOpen(o); if (o) fetchNotifications(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative rounded-[5px]">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 min-w-[16px] h-4 px-1 rounded-full bg-[var(--brand-accent)] text-white text-[10px] font-medium flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[440px] overflow-hidden flex flex-col p-0 rounded-[8px] bg-popover border-border shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-medium text-foreground">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <CheckCheck className="size-3" />
              Mark all read
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {loading && notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">Loading notifications…</div>
          ) : notifications.length === 0 ? (
            <BrandState
              name="no-notifications"
              title="All caught up"
              description="No unread notifications at this time."
              compact
            />
          ) : (
            notifications.map((n) => {
              const meta = notifMeta[n.type] || { label: "Update", color: "bg-muted-foreground" };
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
                    "w-full text-left px-4 py-3 flex gap-3 hover:bg-secondary/60 transition-colors border-b border-border/60 last:border-0 cursor-pointer",
                    !n.read && "bg-secondary/30"
                  )}
                >
                  <div className="mt-1 shrink-0">
                    <span className={cn("block size-2 rounded-full", meta.color, n.read && "opacity-30")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {meta.label}
                    </p>
                    <p className="text-xs leading-relaxed mt-0.5 line-clamp-2 text-foreground">{n.message}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {new Date(n.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {!n.read && (
                    <span className="mt-1.5 shrink-0 size-1.5 rounded-full bg-[var(--brand-accent)]" />
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
  const [navSearch, setNavSearch] = useState("");

  const filteredLinks = links.filter(l => {
    if (l.page === "post") {
      return currentUser && currentUser.role === "client";
    }
    return true;
  });

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (navSearch.trim()) {
      localStorage.setItem("bidhub_search_query", navSearch.trim());
      setPage("browse");
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-xs border-b border-border">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 h-[72px] flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setPage("landing")}
            className="flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)] rounded-[4px]"
            aria-label="Bid·Hub Home"
          >
            <BrandLogo width={138} decorative />
          </button>

          <nav className="hidden md:flex items-center gap-1">
            {filteredLinks.map(l => {
              const isActive = page === l.page || (l.page === "student" && (page === "student" || page === "client"));
              return (
                <button
                  key={l.page}
                  onClick={() => setPage(l.page === "student" ? (currentUser ? currentUser.role : (role === "client" ? "client" : "student")) : l.page)}
                  className={cn(
                    "px-3 py-1.5 rounded-[4px] text-sm font-medium transition-colors cursor-pointer relative",
                    isActive
                      ? "text-foreground after:absolute after:bottom-[-20px] after:left-3 after:right-3 after:h-[2px] after:bg-[var(--brand-accent)]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {l.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex-1 max-w-sm hidden lg:block">
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              aria-label="Search project index"
              placeholder="Search project index by title, skill…"
              className="pl-9 h-9 text-xs bg-card border-input focus:border-[var(--brand-accent)]"
            />
          </form>
        </div>

        <div className="flex items-center gap-2">
          {!currentUser && (
            <div className="hidden md:flex items-center gap-0.5 rounded-[5px] bg-secondary p-0.5 text-xs border border-border">
              {["student", "client"].map(r => (
                <button
                  key={r}
                  onClick={() => { setRole(r); if (page === "student" || page === "client") setPage(r); }}
                  className={cn(
                    "px-2.5 py-1 rounded-[4px] font-medium transition-colors capitalize cursor-pointer",
                    role === r ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenEscrow}
            aria-label="Trust & Escrow Ledger"
            className="rounded-[5px]"
            title="Escrow Overview"
          >
            <Wallet className="size-4" />
          </Button>

          <NotificationBell token={token} setPage={setPage} />

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme appearance"
            className="rounded-[5px]"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          {currentUser ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-[5px] hover:bg-secondary cursor-pointer">
                  <Avatar className="size-7 rounded-[4px]">
                    {currentUser.avatarUrl ? (
                      <img src={currentUser.avatarUrl} alt={currentUser.name} className="rounded-[4px] object-cover size-full" />
                    ) : (
                      <AvatarFallback className="bg-secondary text-foreground text-xs font-medium rounded-[4px]">
                        {currentUser.name ? currentUser.name.split(" ").map(x => x[0]).slice(0, 2).join("") : "U"}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <ChevronDown className="size-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-[8px] bg-popover border-border p-1 shadow-lg">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-foreground truncate">{currentUser.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{currentUser.college || currentUser.role}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setPage("profile")} className="cursor-pointer">
                  Profile & Evidence
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPage(currentUser.role)} className="cursor-pointer">
                  Workspace Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onOpenEscrow} className="cursor-pointer">
                  Escrow & Milestone Funds
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="cursor-pointer text-destructive focus:text-destructive">
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => setPage("auth")}
              className="rounded-[5px] text-xs px-3.5 h-9 font-medium"
            >
              Sign in
            </Button>
          )}

          <button
            type="button"
            className="md:hidden size-11 inline-grid place-items-center rounded-[5px] text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-navigation" className="md:hidden border-t border-border px-4 py-3 space-y-2 bg-card">
          <form onSubmit={handleSearchSubmit} className="mb-3">
            <Input
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              placeholder="Search projects…"
              className="h-10 text-xs"
            />
          </form>
          {filteredLinks.map(l => (
            <button
              key={l.page}
              onClick={() => {
                setPage(l.page === "student" ? (currentUser ? currentUser.role : role) : l.page);
                setOpen(false);
              }}
              className="block w-full text-left py-2 px-2 rounded-[4px] text-sm text-foreground hover:bg-secondary"
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
