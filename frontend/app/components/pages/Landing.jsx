import { ArrowRight, Sparkles, Briefcase, Quote } from "lucide-react";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { StatusBadge } from "../StatusBadge";

const stats = [
  { k: "Students on the platform", v: "12,840" },
  { k: "Projects posted this term", v: "3,217" },
  { k: "Held in escrow", v: "₹4.8 Cr" },
  { k: "Average review", v: "4.86 / 5" },
];

const steps = [
  { n: "01", t: "Post or browse", d: "Clients write a short brief. Students browse a curated wall of real, paid work." },
  { n: "02", t: "Bid with intent", d: "Send a short proposal — your timeline, your price, why you're the one." },
  { n: "03", t: "Lock in escrow", d: "Money sits in trust until milestones are signed off by both sides." },
  { n: "04", t: "Ship, get paid", d: "Release on completion. Reviews build a portfolio you actually own." },
];

const categories = ["Product Design", "Frontend", "Backend", "Writing", "Video", "Branding", "Research", "Data", "Marketing", "Illustration"];

export function Landing({ setPage }) {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-5 lg:px-8 pt-16 lg:pt-24 pb-20 lg:pb-28 grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-2 mb-6">
              <span className="eyebrow">Issue №12 · Summer term</span>
              <span className="h-px w-12 bg-border" />
              <span className="eyebrow">For students who freelance</span>
            </div>
            <h1 className="display text-5xl md:text-6xl lg:text-7xl">
              A quieter marketplace for <span className="italic text-[var(--brand-gold)]">student talent</span>, built on trust and small money.
            </h1>
            <p className="mt-6 max-w-xl text-muted-foreground text-lg">
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
              <div className="flex -space-x-2">
                {["AR","MN","SK","JP"].map(i => (
                  <Avatar key={i} className="size-7 ring-2 ring-background">
                    <AvatarFallback className="text-[10px] bg-[var(--brand-bronze)] text-[var(--brand-gold)]">{i}</AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <p>Joined this week by students from <span className="text-foreground">BITS Pilani, NID, IIM-A</span> and 41 more.</p>
            </div>
          </div>

          {/* Featured project card */}
          <div className="lg:col-span-5 relative">
            <div className="absolute -top-4 -right-4 size-28 rounded-full blur-3xl bg-[var(--brand-gold)]/20" />
            <div className="paper hairline rounded-3xl p-6 relative grain overflow-hidden">
              <div className="flex items-center justify-between">
                <StatusBadge tone="gold">Featured this week</StatusBadge>
                <span className="text-xs text-muted-foreground num">#PRJ-208</span>
              </div>
              <h3 className="font-serif text-2xl mt-4 leading-tight">
                Design and ship a landing site for a slow-fashion label out of Jaipur.
              </h3>
              <p className="text-sm text-muted-foreground mt-3">
                Editorial direction, soft palettes, 6 pages, Framer or Next.js. Two senior designers shortlisting.
              </p>
              <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <div><p className="eyebrow">Budget</p><p className="font-serif text-lg num mt-1">₹42,000</p></div>
                <div><p className="eyebrow">Timeline</p><p className="font-serif text-lg mt-1">3 weeks</p></div>
                <div><p className="eyebrow">Bids</p><p className="font-serif text-lg num mt-1">17</p></div>
              </div>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {["UX/UI","Framer","Editorial","E-commerce"].map(s =>
                  <span key={s} className="text-xs px-2 py-1 rounded-full bg-secondary">{s}</span>)}
              </div>
              <div className="mt-5 pt-5 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="size-8"><AvatarFallback className="bg-[var(--brand-espresso)] text-[var(--brand-gold)] text-xs">RV</AvatarFallback></Avatar>
                  <div className="leading-tight">
                    <p className="text-sm">Raha Vastra</p>
                    <p className="text-xs text-muted-foreground">Verified client · 4.9 ★</p>
                  </div>
                </div>
                <Button size="sm" onClick={async () => {
                  try {
                    const res = await fetch("/api/projects");
                    const data = await res.json();
                    if (res.ok && data.length > 0) {
                      localStorage.setItem("currentProjectId", data[0]._id);
                      setPage("detail");
                    } else {
                      setPage("browse");
                    }
                  } catch (e) {
                    setPage("browse");
                  }
                }} className="rounded-full bg-foreground text-background hover:bg-foreground/85">
                  View brief
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Trust strip */}
        <div className="border-y border-border bg-card/40">
          <div className="mx-auto max-w-7xl px-5 lg:px-8 grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
            {stats.map(s => (
              <div key={s.k} className="py-6 px-4 text-center md:text-left">
                <p className="font-serif text-3xl num">{s.v}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.k}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-5 lg:px-8 py-20">
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
      <section className="mx-auto max-w-7xl px-5 lg:px-8 pb-16">
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
            <button key={c} className="px-4 py-2 rounded-full hairline bg-card hover:bg-secondary text-sm transition-colors">
              {c}
            </button>
          ))}
        </div>
      </section>

      {/* Journey cards */}
      <section className="mx-auto max-w-7xl px-5 lg:px-8 py-16 grid lg:grid-cols-2 gap-6">
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

      {/* Testimonial */}
      <section className="mx-auto max-w-5xl px-5 lg:px-8 py-20 text-center">
        <Quote className="mx-auto text-[var(--brand-gold)] size-8" />
        <p className="font-serif text-2xl md:text-3xl leading-snug mt-6">
          "I paid my last semester's fees from three Bid·Hub gigs. The escrow made me trust strangers, and the reviews now sit on top of my résumé."
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Avatar className="size-9"><AvatarFallback className="bg-[var(--brand-bronze)] text-[var(--brand-gold)] text-xs">NK</AvatarFallback></Avatar>
          <div className="text-left">
            <p className="text-sm">Nidhi Kapoor</p>
            <p className="text-xs text-muted-foreground">Final year · NID Ahmedabad</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-5 lg:px-8 py-10 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
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
