import { Search, SlidersHorizontal, ChevronDown } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { ProjectCard } from "../ProjectCard";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const categories = ["All", "Product Design", "Web Development", "Writing & Content", "Video & Motion"];
const filters = [
  { label: "Budget", val: "Any" },
  { label: "Deadline", val: "30 days" },
  { label: "Location", val: "Remote" },
  { label: "Skill level", val: "Any" },
];

export function Browse({ setPage }) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      let url = "/api/projects";
      const params = ["status=OPEN"];
      if (activeCategory && activeCategory !== "All") {
        params.push(`category=${encodeURIComponent(activeCategory)}`);
      }
      if (search) {
        params.push(`search=${encodeURIComponent(search)}`);
      }
      if (params.length > 0) {
        url += `?${params.join("&")}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch open briefs");
      setProjects(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    const interval = setInterval(async () => {
      try {
        let url = "/api/projects";
        const params = ["status=OPEN"];
        if (activeCategory && activeCategory !== "All") {
          params.push(`category=${encodeURIComponent(activeCategory)}`);
        }
        if (search) {
          params.push(`search=${encodeURIComponent(search)}`);
        }
        if (params.length > 0) {
          url += `?${params.join("&")}`;
        }

        const res = await fetch(url);
        const data = await res.json();
        if (res.ok) {
          setProjects(data);
        }
      } catch (err) {
        console.error("Browse projects polling error:", err);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [activeCategory, search]);

  return (
    <div className="mx-auto max-w-7xl px-5 lg:px-8 py-12">
      <div className="flex items-end justify-between mb-8">
        <div>
          <span className="eyebrow">{loading ? "..." : projects.length} open briefs</span>
          <h1 className="font-serif text-4xl mt-2">Today's wall of work</h1>
          <p className="text-muted-foreground mt-1 max-w-md">Hand-curated by our team. Updated every six hours.</p>
        </div>
        <Button onClick={() => setPage("post")} variant="outline" className="rounded-full hidden md:inline-flex">
          Post a project
        </Button>
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-16 z-30 -mx-2 px-2 py-3 bg-background/85 backdrop-blur-md border-y border-border">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, skill, or organisation…"
              className="pl-9 bg-input-background border-transparent"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {filters.map((f) => (
            <button
              key={f.label}
              className="inline-flex items-center gap-1.5 hairline rounded-full px-3 py-1.5 text-sm bg-card hover:bg-secondary"
              onClick={() => toast.info("Advanced filtering is simulated. Use categories & search.")}
            >
              <span className="text-muted-foreground">{f.label}:</span> {f.val}
              <ChevronDown className="size-3.5" />
            </button>
          ))}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => toast.info("Filter modal simulated.")}>
            <SlidersHorizontal className="size-4 mr-1.5" />All filters
          </Button>
          <button className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            Sort: Newest <ChevronDown className="size-3.5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                activeCategory === c
                  ? "bg-[var(--brand-espresso)] text-[var(--brand-gold)]"
                  : "hairline bg-card hover:bg-secondary"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        /* Loading skeleton row */
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="paper hairline rounded-2xl p-5 animate-pulse">
              <div className="h-3 w-20 bg-muted rounded" />
              <div className="h-5 w-3/4 bg-muted rounded mt-3" />
              <div className="h-3 w-full bg-muted/70 rounded mt-3" />
              <div className="h-3 w-2/3 bg-muted/70 rounded mt-2" />
              <div className="flex gap-1.5 mt-5">
                <div className="h-5 w-12 bg-muted rounded-full" />
                <div className="h-5 w-14 bg-muted rounded-full" />
                <div className="h-5 w-10 bg-muted rounded-full" />
              </div>
              <div className="h-px bg-border mt-5" />
              <div className="flex items-center justify-between mt-4">
                <div className="h-7 w-24 bg-muted rounded" />
                <div className="h-6 w-16 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        /* Empty State */
        <div className="text-center py-20 paper hairline rounded-3xl mt-8">
          <h3 className="font-serif text-2xl">No open briefs found</h3>
          <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
            Try resetting your search query or choosing another category.
          </p>
          <Button onClick={() => { setSearch(""); setActiveCategory("All"); }} className="mt-5 rounded-full">
            Reset filters
          </Button>
        </div>
      ) : (
        /* Loaded projects grid */
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {projects.map((p) => (
            <ProjectCard
              key={p._id}
              project={{
                id: p._id,
                title: p.title,
                category: p.category,
                budget: p.budget,
                bids: p.bidsCount || 0,
                deadline: p.deadline,
                skills: p.skillsRequired,
                poster: {
                  name: p.clientId?.name || "Client",
                  org: p.clientId?.college || "Verify Organization",
                  initials: (p.clientId?.name || "C").split(" ").map(n => n[0]).join(""),
                },
                excerpt: p.description,
              }}
              onOpen={() => {
                localStorage.setItem("currentProjectId", p._id);
                setPage("detail");
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
