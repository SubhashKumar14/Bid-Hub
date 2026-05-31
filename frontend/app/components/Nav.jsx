import { Bell, Search, Moon, Sun, Wallet, Menu, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "./ui/dropdown-menu";
import { useState } from "react";
import { cn } from "./ui/utils";

const links = [
  { label: "Browse", page: "browse" },
  { label: "Post a project", page: "post" },
  { label: "Dashboard", page: "student" },
];

export function Nav({ page, setPage, role, setRole, theme, toggleTheme, onOpenEscrow, currentUser, onLogout }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b border-border">
      <div className="mx-auto max-w-7xl px-5 lg:px-8 h-16 flex items-center gap-4">
        <button onClick={() => setPage("landing")} className="flex items-center gap-2 group">
          <span className="grid place-items-center size-8 rounded-md bg-[var(--brand-espresso)] text-[var(--brand-gold)] font-serif text-lg">B</span>
          <span className="font-serif text-xl tracking-tight">Bid<span className="text-[var(--brand-gold)]">·</span>Hub</span>
        </button>

        <nav className="hidden md:flex items-center gap-1 ml-4">
          {links.map(l => (
            <button key={l.page}
              onClick={() => setPage(l.page === "student" ? (role === "client" ? "client" : "student") : l.page)}
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
          <div className="hidden md:flex items-center gap-1 rounded-full bg-secondary p-1 text-xs">
            {["student","client"].map(r => (
              <button key={r} onClick={() => { setRole(r); if (page==="student"||page==="client") setPage(r); }}
                className={cn("px-3 py-1 rounded-full transition-colors capitalize",
                  role===r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
                {r}
              </button>
            ))}
          </div>

          <Button variant="ghost" size="icon" onClick={onOpenEscrow} aria-label="Escrow">
            <Wallet className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
            <Bell className="size-4" />
            <span className="absolute top-2 right-2 size-1.5 rounded-full bg-[var(--brand-gold)]" />
          </Button>
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
                  <p className="text-xs text-muted-foreground">{currentUser.college || "No College"} · {role}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setPage("profile")}>View profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPage(role)}>Dashboard</DropdownMenuItem>
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
          {links.map(l => (
            <button key={l.page} onClick={() => { setPage(l.page === "student" ? role : l.page); setOpen(false); }}
              className="block w-full text-left py-2 text-sm">{l.label}</button>
          ))}
        </div>
      )}
    </header>
  );
}
