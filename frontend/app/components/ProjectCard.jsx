import { Clock, Users, MapPin, ArrowUpRight } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { StatusBadge } from "./StatusBadge";

export function ProjectCard({ project, onOpen }) {
  return (
    <button onClick={onOpen}
      className="group text-left paper rounded-2xl p-5 hairline relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-30px_rgba(39,37,15,0.4)]">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <span className="eyebrow">{project.category}</span>
          <h3 className="font-serif text-xl leading-tight pr-6">{project.title}</h3>
        </div>
        <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>

      {project.excerpt && (
        <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{project.excerpt}</p>
      )}

      <div className="mt-5 flex flex-wrap gap-1.5">
        {project.skills.slice(0,4).map(s => (
          <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{s}</span>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-[10px] bg-[var(--brand-bronze)] text-[var(--brand-gold)]">{project.poster.initials}</AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <p className="text-xs">{project.poster.name}</p>
            <p className="text-[11px] text-muted-foreground">{project.poster.org}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-serif text-lg num">{project.budget}</p>
          <p className="text-[11px] text-muted-foreground">est. budget</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" />{project.deadline}</span>
        <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />{project.bids} bids</span>
        <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" />{project.remote ? "Remote" : "On-campus"}</span>
      </div>
    </button>
  );
}

export const SAMPLE_PROJECTS = [
  { id: "p1", title: "Redesign the onboarding flow for a campus fintech app",
    category: "Product Design", budget: "₹18,000", bids: 12, deadline: "14 days",
    skills: ["UX/UI","UX Writing","Prototyping","Mobile"],
    poster: { name: "Meera Bhat", org: "Plume Finance · Founder", initials: "MB" },
    remote: true, level: "Intermediate",
    excerpt: "We're a Y-combinator backed campus banking startup. Rework the 4-screen onboarding into a calmer, story-driven flow." },
  { id: "p2", title: "Build a MERN admin panel for an NGO volunteer system",
    category: "Web Development", budget: "₹32,000", bids: 9, deadline: "3 weeks",
    skills: ["React","MongoDB","Express","Tailwind"],
    poster: { name: "Asha Foundation", org: "Verified NGO", initials: "AF" },
    remote: true, level: "Advanced",
    excerpt: "Looking for a senior student to ship a clean admin dashboard with shifts, attendance, and impact reports." },
  { id: "p3", title: "Edit a 6-minute brand documentary for a coffee startup",
    category: "Video & Motion", budget: "₹12,500", bids: 21, deadline: "10 days",
    skills: ["Premiere","DaVinci","Color","Sound"],
    poster: { name: "Saanvi Rao", org: "Roast Republic", initials: "SR" },
    remote: false, level: "Intermediate",
    excerpt: "Footage already shot in Bengaluru. Need a warm, editorial cut with subtitles and a 30s teaser." },
  { id: "p4", title: "Ghostwrite a 7-part LinkedIn series on climate careers",
    category: "Writing & Content", budget: "₹9,000", bids: 18, deadline: "2 weeks",
    skills: ["Long-form","Research","LinkedIn"],
    poster: { name: "Kunal Mehta", org: "Indie operator", initials: "KM" },
    remote: true, level: "Beginner",
    excerpt: "Looking for a thoughtful writer with strong opinions on energy transition and Indian climate-tech." },
  { id: "p5", title: "Design a poster suite for our college film festival",
    category: "Graphic Design", budget: "₹7,500", bids: 27, deadline: "9 days",
    skills: ["Illustration","Typography","Print"],
    poster: { name: "FTII Society", org: "Pune", initials: "FT" },
    remote: false, level: "Intermediate",
    excerpt: "Three posters, one programme booklet, and Instagram cutdowns. Editorial, warm, slightly retro." },
  { id: "p6", title: "Run a 4-week growth experiment on a Notion workspace store",
    category: "Marketing", budget: "₹15,000", bids: 7, deadline: "1 month",
    skills: ["SEO","Analytics","Copy","Email"],
    poster: { name: "Notion Stash", org: "Indie SaaS", initials: "NS" },
    remote: true, level: "Advanced",
    excerpt: "Own the funnel end-to-end. We'll share data, you propose three experiments and report weekly." },
];
