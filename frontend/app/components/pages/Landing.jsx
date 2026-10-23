import { ArrowRight, Sparkles, Briefcase, Quote } from "lucide-react";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { StatusBadge } from "../StatusBadge";
import { BrandLogo } from "../../brand/BrandLogo";
import { BrandIcon } from "../../brand/BrandIcon";
import { useState, useEffect } from "react";

const steps = [
  { n: "01", t: "Publish or explore", d: "Clients publish clear, milestone-driven briefs. Students compare scope, deadlines, and budgets along a consistent index." },
  { n: "02", t: "Propose with intent", d: "Submit a focused proposal outlining your delivery approach, schedule, and relevant portfolio evidence." },
  { n: "03", t: "Confirm test funding", d: "Accept an exact proposal and confirm simulated funding before work begins. No live payments or payouts." },
  { n: "04", t: "Deliver and approve", d: "Submit checkpoints for client review. Participants may leave feedback after work is completed. Approval never asserts a real payout." },
];

const categories = ["Product Design", "Web Development", "Backend & APIs", "Writing & Editing", "Video & Motion", "Brand Identity", "Research", "Data & AI", "Growth & Marketing", "Graphic Design"];

export function Landing({ setPage }) {
  const [statsData, setStatsData] = useState(null);
  const [featuredProject, setFeaturedProject] = useState(null);
  const [reviewsList, setReviewsList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLandingData = async () => {
      try {
        const statsRes = await fetch("/api/projects/public/stats");
        if (statsRes.ok) {
          const sData = await statsRes.json();
          setStatsData(sData);
        }

        const projectsRes = await fetch("/api/projects?status=OPEN");
        if (projectsRes.ok) {
          const pData = await projectsRes.json();
          if (pData && pData.length > 0) {
            setFeaturedProject(pData[0]);
          }
        }

        const reviewsRes = await fetch("/api/reviews/public");
        if (reviewsRes.ok) {
          const rData = await reviewsRes.json();
          setReviewsList(rData || []);
        }
      } catch (err) {
        console.error("Failed to load landing page dynamic data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLandingData();
  }, []);

  const displayStats = [
    { k: "Active Student Profiles", v: statsData ? statsData.studentsCount.toLocaleString() : "—" },
    { k: "Open Project Briefs", v: statsData ? statsData.projectsCount.toLocaleString() : "—" },
    { k: "Completed Projects", v: statsData ? statsData.completedCount.toLocaleString() : "—" },
    { k: "Test Funding Recorded", v: statsData ? `₹${statsData.totalEscrow.toLocaleString("en-IN")}` : "—" },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pt-12 lg:pt-20 pb-16 lg:pb-24 grid lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div className={featuredProject ? "lg:col-span-7" : "lg:col-span-12"}>
            <div className="flex items-center gap-2 mb-4">
              <span className="eyebrow text-xs">An independent student work exchange</span>
              <span className="h-px w-8 bg-border" />
              <span className="eyebrow text-xs">Agreed Milestones</span>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-foreground font-normal tracking-tight leading-[1.08]">
              Good work shouldn’t wait for graduation.
            </h1>

            <p className="mt-5 text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl">
              Bid·Hub bridges ambitious college students with clients who value craftsmanship. Compare structured project briefs, propose directly, and collaborate with clear, agreed milestones.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                variant="default"
                onClick={() => setPage("browse")}
                className="rounded-[5px] px-6 h-11 text-sm font-medium"
              >
                Find a project <ArrowRight className="ml-1 size-4" />
              </Button>
              <Button
                onClick={() => setPage("post")}
                variant="outline"
                className="rounded-[5px] px-6 h-11 text-sm font-medium"
              >
                Post a project
              </Button>
            </div>

            <div className="mt-8 pt-6 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
              <p>Designed for student engineers, designers, researchers, and writers delivering real work.</p>
            </div>
          </div>

          {/* Featured / Latest project card */}
          {featuredProject && (
            <div className="lg:col-span-5 relative">
              <div className="bg-card border border-border rounded-[8px] p-6 shadow-xs relative">
                <div className="flex items-center justify-between pb-3 border-b border-border/70">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--brand-accent)]">
                    Latest project
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">#OPEN</span>
                </div>

                <h3 className="text-xl font-medium mt-4 leading-snug text-foreground">
                  {featuredProject.title}
                </h3>

                <p className="text-xs text-muted-foreground mt-2 line-clamp-3 leading-relaxed">
                  {featuredProject.description}
                </p>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm p-3 bg-secondary/40 rounded-[5px] border border-border/50">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Budget</p>
                    <p className="text-base font-medium num mt-0.5 text-foreground">
                      ₹{featuredProject.budget?.toLocaleString("en-IN") || featuredProject.budget}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</p>
                    <p className="text-sm font-medium mt-0.5 truncate text-foreground">
                      {featuredProject.category}
                    </p>
                  </div>
                </div>

                {featuredProject.skillsRequired?.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {featuredProject.skillsRequired.slice(0, 4).map((s) => (
                      <span key={s} className="text-[11px] px-2 py-0.5 rounded-[3px] bg-secondary text-foreground font-mono">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-8 rounded-[4px] border border-border">
                      {featuredProject.clientId?.avatarUrl ? (
                        <img src={featuredProject.clientId.avatarUrl} alt="" className="size-full object-cover rounded-[4px]" />
                      ) : (
                        <AvatarFallback className="bg-secondary text-foreground text-xs font-medium rounded-[4px]">
                          {featuredProject.clientId?.name?.charAt(0).toUpperCase() || "C"}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="leading-tight text-xs">
                      <p className="font-medium text-foreground truncate max-w-[140px]">
                        {featuredProject.clientId?.name || "Client"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {featuredProject.clientId?.college || "Client"}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      localStorage.setItem("currentProjectId", featuredProject._id);
                      setPage("detail");
                    }}
                    className="rounded-[5px] text-xs h-8 px-3"
                  >
                    View brief
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Directory Stats Strip */}
        <div className="border-y border-border bg-card/60">
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
            {displayStats.map((s) => (
              <div key={s.k} className="py-5 px-4 text-left">
                <p className="text-xl sm:text-2xl font-medium num text-foreground">{s.v}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.k}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4 space-y-3">
            <span className="eyebrow text-xs">Process</span>
            <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground leading-tight">
              A straightforward process from brief to release.
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every assignment is anchored by agreed deliverables and review checkpoints, so students and clients stay aligned.
            </p>
          </div>
          <ol className="lg:col-span-8 grid sm:grid-cols-2 gap-x-8 gap-y-6">
            {steps.map((s) => (
              <li key={s.n} className="bg-card border border-border rounded-[8px] p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium text-[var(--brand-accent)]">{s.n}</span>
                </div>
                <h3 className="text-base font-medium text-foreground">{s.t}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pb-16">
        <div className="flex items-end justify-between mb-6 pb-2 border-b border-border">
          <div>
            <span className="eyebrow text-xs">Project Directory</span>
            <h2 className="text-2xl font-medium tracking-tight mt-1 text-foreground">Explore by Discipline</h2>
          </div>
          <button
            onClick={() => setPage("browse")}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 cursor-pointer font-medium"
          >
            All categories <ArrowRight className="size-3" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => {
                localStorage.setItem("bidhub_category_filter", c);
                setPage("browse");
              }}
              className="px-3.5 py-2 rounded-[5px] border border-border bg-card hover:bg-secondary text-xs font-medium text-foreground transition-colors cursor-pointer"
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {/* Role Workspaces */}
      <section className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12 grid lg:grid-cols-2 gap-6">
        {[
          {
            icon: <BrandIcon name="project-brief" size={20} className="text-[var(--brand-accent)]" />,
            eyebrow: "For Students",
            title: "Build verified experience while studying.",
            body: "Review technical and creative briefs, propose your terms, and complete projects that produce demonstrable work evidence.",
            cta: "View student workspace",
            page: "student",
          },
          {
            icon: <BrandIcon name="contract" size={20} className="text-[var(--brand-accent)]" />,
            eyebrow: "For Clients",
            title: "Delegate scoped work to campus talent.",
            body: "Define deliverables and milestones in minutes. Proposals arrive with student portfolios; work is approved per checkpoint; funding is simulated.",
            cta: "Post a project brief",
            page: "post",
          },
        ].map((j, i) => (
          <div key={i} className="bg-card border border-border rounded-[8px] p-6 lg:p-8 space-y-4">
            <div className="flex items-center gap-2">
              {j.icon}
              <span className="eyebrow text-xs">{j.eyebrow}</span>
            </div>
            <h3 className="text-xl font-medium text-foreground">{j.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{j.body}</p>
            <Button
              onClick={() => setPage(j.page)}
              variant="outline"
              className="mt-2 rounded-[5px] text-xs h-9 px-4 font-medium"
            >
              {j.cta} <ArrowRight className="ml-1 size-3.5" />
            </Button>
          </div>
        ))}
      </section>

      {/* Dynamic Testimonials */}
      {reviewsList.length > 0 && (
        <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 text-center border-t border-border">
          <Quote className="mx-auto text-[var(--brand-accent)] size-6" />
          <div className="mt-5 space-y-6">
            {reviewsList.slice(0, 1).map((r, i) => (
              <div key={i} className="max-w-2xl mx-auto space-y-4">
                <p className="font-serif text-xl sm:text-2xl leading-relaxed text-foreground">
                  "{r.comment || "Milestones were delivered on schedule with rigorous attention to requirements."}"
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Avatar className="size-8 rounded-[4px] border border-border">
                    {r.reviewerId?.avatarUrl ? (
                      <img src={r.reviewerId.avatarUrl} alt="" loading="lazy" className="size-full object-cover rounded-[4px]" />
                    ) : (
                      <AvatarFallback className="bg-secondary text-foreground text-xs font-medium rounded-[4px]">
                        {r.reviewerId?.name?.charAt(0).toUpperCase() || "R"}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="text-left text-xs">
                    <p className="font-medium text-foreground">{r.reviewerId?.name || "Client"}</p>
                    <p className="text-muted-foreground text-[11px]">
                      {r.reviewerId?.college || "Client"} · {r.rating} / 5 Rating
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
          <div className="space-y-2">
            <BrandLogo width={132} decorative />
            <p className="text-xs text-muted-foreground">
              An independent student work exchange. Built in Bengaluru.
            </p>
          </div>
          <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
            <button onClick={() => setPage("browse")} className="hover:text-foreground cursor-pointer">Find projects</button>
            <button onClick={() => setPage("post")} className="hover:text-foreground cursor-pointer">Post a project</button>
            <button onClick={() => setPage("auth")} className="hover:text-foreground cursor-pointer">Account</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
