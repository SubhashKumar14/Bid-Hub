import { Clock, Users, MapPin, ArrowUpRight } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { StatusBadge } from "./StatusBadge";

export const formatCurrency = (val) => {
  if (val === undefined || val === null) return "";
  if (typeof val === "number") {
    return `₹${val.toLocaleString("en-IN")}`;
  }
  if (val.toString().includes("₹")) return val;
  const num = parseFloat(val.toString().replace(/[₹$,\s]/g, ""));
  return isNaN(num) ? val : `₹${num.toLocaleString("en-IN")}`;
};

export function ProjectRow({ project, onOpen }) {
  const poster = project.poster || {
    name: project.clientId?.name || "Client",
    org: project.clientId?.college || "Independent",
    initials: project.clientId?.name
      ? project.clientId.name.split(" ").map((x) => x[0]).slice(0, 2).join("")
      : "CL",
  };

  const skillsList = Array.isArray(project.skills) ? project.skills : [];
  const status = project.status || "OPEN";

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(); } }}
      className="group w-full text-left bg-card border border-border rounded-[8px] p-4 lg:p-5 transition-colors duration-150 hover:bg-secondary/40 hover:border-input focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)] cursor-pointer"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Main Brief Info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {project.category || "General"}
            </span>
            {project.level && (
              <>
                <span className="text-muted-foreground/40 text-xs">·</span>
                <span className="text-xs text-muted-foreground">{project.level}</span>
              </>
            )}
            {project.status && project.status !== "OPEN" && (
              <StatusBadge
                tone={
                  project.status === "COMPLETED" ? "success" :
                  project.status === "ASSIGNED" || project.status === "IN_PROGRESS" ? "info" : "warning"
                }
                className="text-[10px] py-0"
              >
                {project.status}
              </StatusBadge>
            )}
          </div>

          <h3 className="text-base sm:text-lg font-medium text-foreground tracking-tight group-hover:text-[var(--brand-accent)] transition-colors flex items-center gap-1.5">
            <span className="truncate">{project.title}</span>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/60 group-hover:text-[var(--brand-accent)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </h3>

          {project.excerpt && (
            <p className="text-xs text-muted-foreground line-clamp-1 max-w-3xl">
              {project.excerpt}
            </p>
          )}

          {/* Skills metadata line */}
          {skillsList.length > 0 && (
            <div className="pt-0.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground/70">Skills:</span>
              {skillsList.slice(0, 5).map((s) => (
                <span
                  key={s}
                  className="inline-block text-[11px] px-1.5 py-0.5 rounded-[3px] bg-secondary text-foreground font-mono"
                >
                  {s}
                </span>
              ))}
              {skillsList.length > 5 && (
                <span className="text-[11px] text-muted-foreground font-mono">
                  +{skillsList.length - 5}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Details & Budget Columns */}
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between lg:justify-end gap-3 sm:gap-6 pt-3 lg:pt-0 border-t lg:border-t-0 border-border/60 lg:shrink-0">
          {/* Client & Metadata */}
          <div className="flex items-center gap-2.5">
            <Avatar className="size-8 rounded-[4px] border border-border">
              <AvatarFallback className="text-[11px] font-medium bg-secondary text-foreground rounded-[4px]">
                {poster.initials}
              </AvatarFallback>
            </Avatar>
            <div className="text-left text-xs">
              <p className="font-medium text-foreground leading-tight">{poster.name}</p>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  Delivery: {project.deadline || "Not set"}
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3" />
                  {project.bids ?? 0} {project.bids === 1 ? "proposal" : "proposals"}
                </span>
                {project.location ? (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" />
                      {project.location}
                    </span>
                  </>
                ) : typeof project.remote === "boolean" && (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" />
                      {project.remote ? "Remote" : "On-site"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Budget column */}
          <div className="text-right pl-4 border-l border-border/60 min-w-[100px]">
            <p className="text-lg font-medium text-foreground num leading-tight">
              {formatCurrency(project.budget)}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
              Client Budget
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ProjectCard is an alias to ProjectRow for clean index-first representation
export const ProjectCard = ProjectRow;

export const SAMPLE_PROJECTS = [
  {
    id: "p1",
    title: "Redesign the onboarding flow for a campus fintech app",
    category: "Product Design",
    budget: "₹18,000",
    bids: 12,
    deadline: "14 days",
    skills: ["UX/UI", "UX Writing", "Prototyping", "Mobile"],
    poster: { name: "Meera Bhat", org: "Plume Finance", initials: "MB" },
    remote: true,
    level: "Intermediate",
    excerpt: "Campus banking project: restructure 4-screen onboarding into a clear step-by-step verified flow.",
  },
  {
    id: "p2",
    title: "Build a MERN admin panel for an NGO volunteer system",
    category: "Web Development",
    budget: "₹32,000",
    bids: 9,
    deadline: "3 weeks",
    skills: ["React", "MongoDB", "Express", "Tailwind"],
    poster: { name: "Asha Foundation", org: "Youth Initiatives", initials: "AF" },
    remote: true,
    level: "Advanced",
    excerpt: "Clean administration dashboard for shift rosters, volunteer attendance, and reporting.",
  },
  {
    id: "p3",
    title: "Edit a 6-minute brand documentary for a coffee startup",
    category: "Video & Motion",
    budget: "₹12,500",
    bids: 21,
    deadline: "10 days",
    skills: ["Premiere", "DaVinci", "Color", "Sound"],
    poster: { name: "Saanvi Rao", org: "Roast Republic", initials: "SR" },
    remote: false,
    location: "Bengaluru",
    level: "Intermediate",
    excerpt: "Footage shot on location. Looking for a concise editorial documentary cut with clean audio mastering.",
  },
  {
    id: "p4",
    title: "Ghostwrite a 7-part LinkedIn series on climate careers",
    category: "Writing & Content",
    budget: "₹9,000",
    bids: 18,
    deadline: "2 weeks",
    skills: ["Long-form", "Research", "Editing"],
    poster: { name: "Kunal Mehta", org: "Energy Insights", initials: "KM" },
    remote: true,
    level: "Beginner",
    excerpt: "Analytical articles covering the energy transition and graduate engineering roles in India.",
  },
  {
    id: "p5",
    title: "Design a poster suite for our college film festival",
    category: "Graphic Design",
    budget: "₹7,500",
    bids: 27,
    deadline: "9 days",
    skills: ["Illustration", "Typography", "Print"],
    poster: { name: "FTII Society", org: "Film Club", initials: "FT" },
    remote: true,
    level: "Intermediate",
    excerpt: "Three promotional posters and one programme layout with a restrained typographic treatment.",
  },
  {
    id: "p6",
    title: "Run a 4-week growth experiment on a Notion workspace store",
    category: "Marketing",
    budget: "₹15,000",
    bids: 7,
    deadline: "1 month",
    skills: ["SEO", "Analytics", "Copywriting"],
    poster: { name: "Notion Stash", org: "Digital Tools", initials: "NS" },
    remote: true,
    level: "Advanced",
    excerpt: "Funnel analysis, customer discovery, and conversion optimization for student study templates.",
  },
];
