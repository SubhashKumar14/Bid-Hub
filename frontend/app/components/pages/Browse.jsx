import { CATEGORIES } from "../../../../shared/categories.js";
import { Search, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { ProjectRow } from "../ProjectCard";
import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { BrandState } from "../../brand/BrandState";
import { BrandIcon } from "../../brand/BrandIcon";

const categories = ["All", ...CATEGORIES];

export function Browse({ setPage }) {
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState(() => {
    return localStorage.getItem("bidhub_category_filter") || "All";
  });
  const [search, setSearch] = useState(() => {
    return localStorage.getItem("bidhub_search_query") || "";
  });
  const [sortBy, setSortBy] = useState("newest");
  const [locationFilter, setLocationFilter] = useState("all");
  const [page, setResultPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [projects, setProjects] = useState([]);
  useEffect(()=>{const update=event=>{setSearch(event.detail.search);setActiveCategory("All");setLocationFilter("all");setResultPage(1);localStorage.removeItem("bidhub_search_query");};window.addEventListener("bidhub:directory-search",update);return()=>window.removeEventListener("bidhub:directory-search",update);},[]);
  const [loading, setLoading] = useState(true);

  // Clear query cache on mount after reading
  useEffect(() => {
    if (localStorage.getItem("bidhub_category_filter")) {
      localStorage.removeItem("bidhub_category_filter");
    }
    if (localStorage.getItem("bidhub_search_query")) {
      localStorage.removeItem("bidhub_search_query");
    }
  }, []);

  const requestSequence = useRef(0);
  const fetchProjects = async () => {
    const request = ++requestSequence.current;
    setError("");
    setLoading(true);
    try {
      let url = `/api/projects?status=OPEN&page=${page}&limit=50&sort=${sortBy}&location=${locationFilter}`;
      if (activeCategory && activeCategory !== "All") {
        url += `&category=${encodeURIComponent(activeCategory)}`;
      }
      if (search.trim()) {
        url += `&search=${encodeURIComponent(search.trim())}`;
      }

      const res = await fetch(url);
      const data = await res.json();
      if (request !== requestSequence.current) return;
      if (!res.ok) throw new Error(data.message || "Failed to load project index");
      setTotal(Number(res.headers.get("X-Total-Count")) || 0);
      setProjects(Array.isArray(data) ? data : []);
    } catch (err) {
      if (request !== requestSequence.current) return;
      setError(err.message);
      toast.error(err.message);
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [activeCategory, search, page, locationFilter, sortBy]);

  useEffect(() => setResultPage(1), [activeCategory, search, locationFilter, sortBy]);
  // Client-side filtering & sorting
  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projects];

    if (locationFilter === "remote") {
      result = result.filter((p) => p.remote === true || /remote/i.test(p.location || ""));
    } else if (locationFilter === "onsite") {
      result = result.filter((p) => p.remote === false || (p.remote == null && p.location && !/remote/i.test(p.location)));
    }

    if (sortBy === "budget-desc") {
      result.sort((a, b) => Number(b.budget || 0) - Number(a.budget || 0));
    } else if (sortBy === "budget-asc") {
      result.sort((a, b) => Number(a.budget || 0) - Number(b.budget || 0));
    } else if (sortBy === "proposals") {
      result.sort((a, b) => Number(b.bidsCount || 0) - Number(a.bidsCount || 0));
    } else {
      // Default newest
      result.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    return result;
  }, [projects, locationFilter, sortBy]);

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10">
      {error && <div role="alert" className="border border-destructive rounded p-4 text-sm">{error} <Button variant="outline" onClick={fetchProjects} disabled={loading}>Retry</Button></div>}
      <div className="flex gap-3 text-xs"><Button variant="outline" disabled={page === 1 || loading} onClick={() => setResultPage(n => n - 1)}>Previous results</Button><span>Page {page} · {total} projects · filtered results</span><Button variant="outline" disabled={page * 50 >= total || loading} onClick={() => setResultPage(n => n + 1)}>Next results</Button></div>
      {/* Index Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-border">
        <div>
          <span className="eyebrow text-xs inline-flex items-center gap-1.5">
            <BrandIcon name="project-index" size={14} className="text-brand-accent" />
            {error ? "Projects could not be loaded" : loading ? "Loading projects…" : `${total} open projects`}
          </span>
          <h1 className="text-3xl font-medium tracking-tight text-foreground mt-1">
            Find a project
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Compare the work, budget and delivery date. Open a project to ask a question or send a proposal.
          </p>
        </div>
        <Button
          onClick={() => setPage("post")}
          variant="default"
          className="rounded-[5px] text-xs h-9 px-4 font-medium shrink-0"
        >
          Post a project
        </Button>
      </div>

      {/* Control Bar: Search & Sorting */}
      <div className="py-4 my-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            aria-label="Filter project directory"
            placeholder="Filter by title, skill, client…"
            className="pl-9 h-10 text-xs bg-card border-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Location Selector */}
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="h-10 px-3 rounded-[5px] border border-input bg-card text-xs font-medium text-foreground focus:outline-none focus:border-[var(--brand-accent)] cursor-pointer"
          >
            <option value="all">All Locations</option>
            <option value="remote">Remote Only</option>
            <option value="onsite">On-Site Only</option>
          </select>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 h-10 px-3 rounded-[5px] border border-input bg-card text-xs font-medium text-foreground">
            <ArrowUpDown className="size-3.5 text-muted-foreground" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-xs font-medium text-foreground focus:outline-none cursor-pointer"
            >
              <option value="newest">Sort: Newest</option>
              <option value="budget-desc">Budget: High to Low</option>
              <option value="budget-asc">Budget: Low to High</option>
              <option value="proposals">Most Proposals</option>
            </select>
          </div>
        </div>
      </div>

      {/* Category Pills Rail */}
      <div className="flex flex-wrap gap-1.5 pb-6 border-b border-border/60">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCategory(c)}
            className={`px-3 py-1.5 rounded-[5px] text-xs font-medium transition-colors cursor-pointer border ${
              activeCategory === c
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border bg-card hover:bg-secondary text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Projects Index List */}
      <div className="mt-6">
        {error ? null : loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-card border border-border rounded-[8px] p-5 animate-pulse space-y-3">
                <div className="flex justify-between items-center">
                  <div className="h-3 w-28 bg-muted rounded" />
                  <div className="h-5 w-20 bg-muted rounded" />
                </div>
                <div className="h-5 w-3/5 bg-muted rounded" />
                <div className="h-3 w-4/5 bg-muted/60 rounded" />
                <div className="flex gap-2 pt-2">
                  <div className="h-4 w-12 bg-muted rounded" />
                  <div className="h-4 w-16 bg-muted rounded" />
                  <div className="h-4 w-14 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredAndSortedProjects.length === 0 ? (
          <div className="bg-card border border-border rounded-[8px] mt-4">
            <BrandState
              name="no-projects"
              title="No projects match your search"
              description="Try a different skill or keyword, choose another category, or clear the filters."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setActiveCategory("All");
                    setLocationFilter("all");
                    setSortBy("newest");
                  }}
                  className="rounded-[5px] text-xs h-8 px-4"
                >
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAndSortedProjects.map((p) => (
              <ProjectRow
                key={p._id}
                project={{
                  id: p._id,
                  title: p.title,
                  category: p.category,
                  budget: p.budget,
                  bids: p.bidsCount || 0,
                  deadline: p.deadline,
                  skills: p.skillsRequired,
                  status: p.status,
                  remote: p.remote,
                  location: p.location,
                  level: p.level,
                  duration: p.duration,
                  poster: {
                    name: p.clientId?.name || "Client",
                    org: p.clientId?.college || "Client",
                    initials: p.clientId?.name
                      ? p.clientId.name.split(" ").map((n) => n[0]).slice(0, 2).join("")
                      : "CL",
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
    </div>
  );
}
