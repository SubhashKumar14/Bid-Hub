import { ArrowRight, Sparkles, Briefcase, Quote } from "lucide-react";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { StatusBadge } from "../StatusBadge";
import { useState, useEffect } from "react";

const steps = [
  { n: "01", t: "Post or browse", d: "Clients write a short brief. Students browse a curated wall of real, paid work." },
  { n: "02", t: "Bid with intent", d: "Send a short proposal — your timeline, your price, why you're the one." },
  { n: "03", t: "Lock in escrow", d: "Money sits in trust until milestones are signed off by both sides." },
  { n: "04", t: "Ship, get paid", d: "Release on completion. Reviews build a portfolio you actually own." },
];

const categories = ["Product Design", "Frontend", "Backend", "Writing", "Video", "Branding", "Research", "Data", "Marketing", "Illustration"];

export function Landing({ setPage }) {
  const [statsData, setStatsData] = useState(null);
  const [featuredProject, setFeaturedProject] = useState(null);
  const [reviewsList, setReviewsList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLandingData = async () => {
      try {
        // 1. Fetch public stats
        const statsRes = await fetch("/api/projects/public/stats");
        if (statsRes.ok) {
          const sData = await statsRes.json();
          setStatsData(sData);
        }

        // 2. Fetch latest open project for featured card
        const projectsRes = await fetch("/api/projects?status=OPEN");
        if (projectsRes.ok) {
          const pData = await projectsRes.json();
          if (pData && pData.length > 0) {
            setFeaturedProject(pData[0]); // Most recent open project
          }
        }

        // 3. Fetch latest public reviews
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
    { k: "Registered Students", v: statsData ? statsData.studentsCount.toLocaleString() : "0" },
    { k: "Open Briefs", v: statsData ? statsData.projectsCount.toLocaleString() : "0" },
    { k: "Completed Gigs", v: statsData ? statsData.completedCount.toLocaleString() : "0" },
    { k: "Escrow Secured", v: statsData ? `₹${statsData.totalEscrow.toLocaleString("en-IN")}` : "₹0" },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl 2xl:max-w-[1440px] min-[1920px]:max-w-[1680px] min-[2560px]:max-w-[2200px] min-[3400px]:max-w-[2800px] px-5 lg:px-8 pt-16 lg:pt-24 pb-20 lg:pb-28 grid lg:grid-cols-12 gap-10">
          <div className={featuredProject ? "lg:col-span-7" : "lg:col-span-12"}>
            <div className="flex items-center gap-2 mb-6">
              <span className="eyebrow">Summer term marketplace</span>
              <span className="h-px w-12 bg-border" />
              <span className="eyebrow">For college students who freelance</span>
            </div>
            <h1 className="display text-5xl md:text-6xl lg:text-7xl">
              A quieter marketplace for <span className="italic text-[var(--brand-gold)]">student talent</span>, built on trust and small money.
            </h1>
            <p className={`mt-6 text-muted-foreground text-lg ${featuredProject ? "max-w-xl" : "max-w-3xl lg:max-w-4xl"}`}>
              Bid·Hub is where college students take on real, paid briefs — design, code, writing, video — with escrow, milestones, and reviews that travel with them after graduation.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={() => setPage("browse")}
                className="rounded-full px-6 h-11 bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90">
                Browse open briefs <ArrowRight className="ml-1 size-4" />
              </Button>
              <Button onClick={() => setPage("post")} variant="outline" className="rounded-full px-6 h-11">
                Post a project
              </Button>
            </div>
            <div className="mt-8 flex items-center gap-4 text-sm text-muted-foreground">
              <p>Trusted on campuses in <span className="text-foreground font-semibold">Bengaluru, Delhi, Mumbai, Ahmedabad</span> and beyond.</p>
            </div>
          </div>

          {/* Featured project card */}
          {featuredProject && (
            <div className="lg:col-span-5 relative">
              <div className="absolute -top-4 -right-4 size-28 rounded-full blur-3xl bg-[var(--brand-gold)]/20" />
              <div className="paper hairline rounded-3xl p-6 relative grain overflow-hidden">
                <div className="flex items-center justify-between">
                  <StatusBadge tone="gold">Featured this week</StatusBadge>
                  <span className="text-xs text-muted-foreground num">#OPEN</span>
                </div>
                <h3 className="font-serif text-2xl mt-4 leading-tight">
                  {featuredProject.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-3 line-clamp-3">
                  {featuredProject.description}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="eyebrow">Budget</p>
                    <p className="font-serif text-lg num mt-1">₹{featuredProject.budget?.toLocaleString("en-IN") || featuredProject.budget}</p>
                  </div>
                  <div>
                    <p className="eyebrow">Category</p>
                    <p className="font-serif text-lg mt-1 truncate">{featuredProject.category}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {featuredProject.skillsRequired?.slice(0, 3).map(s =>
                    <span key={s} className="text-xs px-2 py-1 rounded-full bg-secondary">{s}</span>)}
                </div>
                <div className="mt-5 pt-5 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-8">
                      {featuredProject.clientId?.avatarUrl ? (
                        <img src={featuredProject.clientId.avatarUrl} alt="" className="size-full object-cover rounded-full" />
                      ) : (
                        <AvatarFallback className="bg-[var(--brand-espresso)] text-[var(--brand-gold)] text-xs">
                          {featuredProject.clientId?.name?.charAt(0).toUpperCase() || "C"}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="leading-tight">
                      <p className="text-sm font-semibold truncate max-w-[150px]">{featuredProject.clientId?.name || "Client"}</p>
                      <p className="text-xs text-muted-foreground">{featuredProject.clientId?.college || "Verified Client"}</p>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => {
                    localStorage.setItem("currentProjectId", featuredProject._id);
                    setPage("detail");
                  }} className="rounded-full bg-foreground text-background hover:bg-foreground/85">
                    View brief
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Trust strip */}
        <div className="border-y border-border bg-card/40">
          <div className="mx-auto max-w-7xl 2xl:max-w-[1440px] min-[1920px]:max-w-[1680px] min-[2560px]:max-w-[2200px] min-[3400px]:max-w-[2800px] px-5 lg:px-8 grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
            {displayStats.map(s => (
              <div key={s.k} className="py-6 px-4 text-center md:text-left">
                <p className="font-serif text-3xl num">{s.v}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.k}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl 2xl:max-w-[1440px] min-[1920px]:max-w-[1680px] min-[2560px]:max-w-[2200px] min-[3400px]:max-w-[2800px] px-5 lg:px-8 py-20">
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4">
            <span className="eyebrow">Method</span>
            <h2 className="font-serif text-4xl mt-2 leading-tight">A short, calm process from brief to payout.</h2>
            <p className="mt-4 text-muted-foreground">No clutter, no hustle theatre. Just a clean loop students and clients both understand.</p>
          </div>
          <div className="lg:col-span-8 grid sm:grid-cols-2 gap-4">
            {steps.map(s => (
              <div key={s.n} className="paper hairline rounded-2xl p-6">
                <p className="font-serif text-3xl text-[var(--brand-gold)] num">{s.n}</p>
                <h3 className="font-serif text-xl mt-3">{s.t}</h3>
                <p className="text-sm text-muted-foreground mt-2">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl 2xl:max-w-[1440px] min-[1920px]:max-w-[1680px] min-[2560px]:max-w-[2200px] min-[3400px]:max-w-[2800px] px-5 lg:px-8 pb-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <span className="eyebrow">Where students earn</span>
            <h2 className="font-serif text-3xl mt-1">Skills in motion this term</h2>
          </div>
          <button onClick={() => setPage("browse")} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            See all categories <ArrowRight className="size-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map(c => (
            <button key={c} onClick={() => setPage("browse")} className="px-4 py-2 rounded-full hairline bg-card hover:bg-secondary text-sm transition-colors">
              {c}
            </button>
          ))}
        </div>
      </section>

      {/* Journey cards */}
      <section className="mx-auto max-w-7xl 2xl:max-w-[1440px] min-[1920px]:max-w-[1680px] min-[2560px]:max-w-[2200px] min-[3400px]:max-w-[2800px] px-5 lg:px-8 py-16 grid lg:grid-cols-2 gap-6">
        {[
          { icon: <Sparkles className="size-4" />, eyebrow: "For students", title: "Earn while you study, on your own terms.",
            body: "Browse curated briefs, bid with a short proposal, and ship work that builds a portfolio you actually own.",
            cta: "Explore as a student", page: "student" },
          { icon: <Briefcase className="size-4" />, eyebrow: "For clients", title: "Hire campus talent, without the cold-mail chase.",
            body: "Post a brief in ten minutes. Bids arrive within hours. Pay only when milestones land.",
            cta: "Post your first brief", page: "post" },
        ].map((j,i) => (
          <div key={i} className="paper hairline rounded-3xl p-8 relative overflow-hidden">
            <div className="absolute -bottom-12 -right-12 size-48 rounded-full bg-[var(--brand-gold)]/10 blur-2xl" />
            <div className="flex items-center gap-2 text-[var(--brand-gold)]">
              {j.icon}<span className="eyebrow">{j.eyebrow}</span>
            </div>
            <h3 className="font-serif text-3xl mt-4 leading-tight">{j.title}</h3>
            <p className="mt-3 text-muted-foreground">{j.body}</p>
            <Button onClick={() => setPage(j.page)} variant="outline" className="mt-6 rounded-full">
              {j.cta} <ArrowRight className="ml-1 size-4" />
            </Button>
          </div>
        ))}
      </section>

      {/* Dynamic Testimonials */}
      {reviewsList.length > 0 && (
        <section className="mx-auto max-w-5xl 2xl:max-w-[1100px] min-[1920px]:max-w-[1280px] px-5 lg:px-8 py-20 text-center">
          <Quote className="mx-auto text-[var(--brand-gold)] size-8" />
          <div className="mt-6 space-y-8">
            {reviewsList.slice(0, 1).map((r, i) => (
              <div key={i} className="max-w-2xl 2xl:max-w-4xl mx-auto">
                <p className="font-serif text-2xl md:text-3xl leading-snug">
                  "{r.comment || "Excellent collaboration. Milestones delivered on schedule with premium quality."}"
                </p>
                <div className="mt-6 flex items-center justify-center gap-3">
                  <Avatar className="size-9">
                    {r.reviewerId?.avatarUrl ? (
                      <img src={r.reviewerId.avatarUrl} alt="" className="size-full object-cover rounded-full" />
                    ) : (
                      <AvatarFallback className="bg-[var(--brand-bronze)] text-[var(--brand-gold)] text-xs">
                        {r.reviewerId?.name?.charAt(0).toUpperCase() || "R"}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="text-left">
                    <p className="text-sm font-semibold">{r.reviewerId?.name || "Verified Client"}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.reviewerId?.college || "Client"} · {"★".repeat(r.rating)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl 2xl:max-w-[1440px] min-[1920px]:max-w-[1680px] min-[2560px]:max-w-[2200px] min-[3400px]:max-w-[2800px] px-5 lg:px-8 py-10 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/bidhublogo.png" alt="Bid·Hub Logo" className="size-10 object-contain rounded-md" />
            <div>
              <p className="font-serif text-xl leading-none">Bid<span className="text-[var(--brand-gold)]">·</span>Hub</p>
              <p className="text-xs text-muted-foreground mt-1.5">A handmade marketplace for student work. Made in Bengaluru.</p>
            </div>
          </div>
          <div className="flex gap-6 text-xs text-muted-foreground">
            <a>About</a><a>Trust & safety</a><a>Pricing</a><a>For colleges</a><a>Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
