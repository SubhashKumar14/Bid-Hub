import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { useState } from "react";
import { Quote } from "lucide-react";
import { toast } from "sonner";

export function Auth({ onDone, setToken }) {
  const [role, setRole] = useState("student");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerFirstName, setRegisterFirstName] = useState("");
  const [registerLastName, setRegisterLastName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerCollege, setRegisterCollege] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to log in");
      }

      localStorage.setItem("token", data.token);
      setToken(data.token);
      toast.success("Welcome back to Bid·Hub!");
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerEmail || !registerPassword || !registerFirstName || !registerLastName) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const name = `${registerFirstName} ${registerLastName}`;
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: registerEmail,
          password: registerPassword,
          role,
          college: registerCollege,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Registration failed");
      }

      localStorage.setItem("token", data.token);
      setToken(data.token);
      toast.success("Account created successfully!");
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      {/* Left — editorial */}
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-[var(--brand-espresso)] text-[#f1e8cf] relative overflow-hidden grain">
        <div className="absolute -top-32 -left-32 size-80 rounded-full bg-[var(--brand-gold)]/15 blur-3xl" />
        <div>
          <span className="font-serif text-2xl">Bid<span className="text-[var(--brand-gold)]">·</span>Hub</span>
        </div>
        <div className="max-w-md">
          <span className="eyebrow text-[var(--brand-gold)]">A handmade marketplace</span>
          <h1 className="display text-5xl mt-4">
            Small money, <span className="italic text-[var(--brand-gold)]">real work</span>, kept honest by escrow.
          </h1>
          <div className="mt-12 paper rounded-2xl p-5 bg-[#27250f]/70 backdrop-blur border border-[var(--brand-gold)]/20">
            <Quote className="text-[var(--brand-gold)] size-5" />
            <p className="font-serif italic mt-3 leading-relaxed">"I funded my final-year thesis with five Bid·Hub gigs. The escrow made strangers feel like colleagues."</p>
            <p className="text-xs text-[var(--brand-sand)] mt-3">— Nidhi K · NID, '26</p>
          </div>
        </div>
        <div className="text-xs text-[#f1e8cf]/60">© Bid·Hub · Made in Bengaluru</div>
      </aside>

      {/* Right — form */}
      <main className="flex items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-sm">
          <span className="eyebrow">Welcome</span>
          <h2 className="font-serif text-3xl mt-2">Step into the marketplace</h2>
          <p className="text-sm text-muted-foreground mt-2">Use your college email — we verify quietly in the background.</p>

          <Tabs defaultValue="login" className="mt-6">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="register">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-3 mt-5">
              <div>
                <label className="text-xs text-muted-foreground">Email</label>
                <Input
                  className="mt-1"
                  placeholder="you@college.edu"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Password</label>
                <Input
                  className="mt-1"
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
              </div>
              <Button
                onClick={handleLogin}
                disabled={loading}
                className="w-full rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90"
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </TabsContent>

            <TabsContent value="register" className="space-y-3 mt-5">
              <div className="grid grid-cols-2 gap-2">
                {["student", "client"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    type="button"
                    className={`hairline rounded-xl p-3 text-left transition-colors ${
                      role === r
                        ? "bg-[var(--brand-espresso)] text-[var(--brand-gold)]"
                        : "bg-card hover:bg-secondary"
                    }`}
                  >
                    <p className="font-serif capitalize">{r}</p>
                    <p className="text-[11px] opacity-70 mt-0.5">
                      {r === "student" ? "I'm here to earn" : "I'm here to hire"}
                    </p>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="First name"
                  value={registerFirstName}
                  onChange={(e) => setRegisterFirstName(e.target.value)}
                />
                <Input
                  placeholder="Last name"
                  value={registerLastName}
                  onChange={(e) => setRegisterLastName(e.target.value)}
                />
              </div>
              <Input
                placeholder="College / company email"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
              />
              <Input
                placeholder="College / university name"
                value={registerCollege}
                onChange={(e) => setRegisterCollege(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Create password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
              />
              <Button
                onClick={handleRegister}
                disabled={loading}
                className="w-full rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90"
              >
                {loading ? "Creating account..." : "Create account"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">By continuing you agree to our terms and our promise to never spam.</p>
            </TabsContent>
          </Tabs>

          <div className="my-6 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>
          <Button variant="outline" className="w-full rounded-full" onClick={() => toast.info("Google sign-in is simulated. Please create an email account.")}>
            Continue with Google
          </Button>
        </div>
      </main>
    </div>
  );
}
