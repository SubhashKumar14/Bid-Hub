import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { useState } from "react";
import { Quote, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export function Auth({ onDone, setToken }) {
  const [showPassword, setShowPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
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
      onDone(data.role); // redirect to correct dashboard
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
      onDone(data.role); // redirect to correct dashboard
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      {/* Sign-in information */}
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-primary text-primary-foreground relative overflow-hidden">
        <div className="flex items-center gap-3">
          <img src="/bidhublogo.png" alt="Bid·Hub Logo" className="size-10 object-contain rounded-md" />
          <span className="font-serif text-2xl">Bid<span className="text-[var(--brand-gold)]">·</span>Hub</span>
        </div>
        <div className="max-w-md">
          <span className="eyebrow text-[var(--brand-gold)]">A handmade marketplace</span>
          <h1 className="display text-5xl mt-4">
            Small money, <span className="italic text-[var(--brand-gold)]">real work</span>, kept honest by escrow.
          </h1>
          <div className="mt-12 rounded-xl p-5 bg-primary-foreground/10 border border-primary-foreground/20">
            <Quote className="text-[var(--brand-gold)] size-5" />
            <p className="font-serif italic mt-3 leading-relaxed">"I funded my final-year thesis with five Bid·Hub gigs. The escrow made strangers feel like colleagues."</p>
            <p className="text-xs text-[var(--brand-sand)] mt-3">— Nidhi K · NID, '26</p>
          </div>
        </div>
        <div className="text-xs text-primary-foreground/70">© Bid·Hub · Made in Bengaluru</div>
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

            <TabsContent value="login" className="mt-5">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLogin();
                }}
              >
                <div>
                  <label htmlFor="login-email" className="text-xs text-muted-foreground">Email</label>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    required
                    className="mt-1"
                    placeholder="you@college.edu"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="login-password" className="text-xs text-muted-foreground">Password</label>
                  <div className="relative mt-1">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="mt-5">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRegister();
                }}
              >
                <div className="grid grid-cols-2 gap-2">
                  {["student", "client"].map((r) => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      type="button"
                      aria-pressed={role === r}
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
                  <div>
                    <label htmlFor="register-first-name" className="sr-only">First name</label>
                    <Input
                      id="register-first-name"
                      autoComplete="given-name"
                      placeholder="First name"
                      value={registerFirstName}
                      onChange={(e) => setRegisterFirstName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="register-last-name" className="sr-only">Last name</label>
                    <Input
                      id="register-last-name"
                      autoComplete="family-name"
                      placeholder="Last name"
                      value={registerLastName}
                      onChange={(e) => setRegisterLastName(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="register-email" className="sr-only">College or company email</label>
                  <Input
                    id="register-email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="College / company email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="register-college" className="sr-only">College or university name</label>
                  <Input
                    id="register-college"
                    autoComplete="organization"
                    placeholder="College / university name"
                    value={registerCollege}
                    onChange={(e) => setRegisterCollege(e.target.value)}
                  />
                </div>
                <div className="relative">
                  <label htmlFor="register-password" className="sr-only">Create password</label>
                  <Input
                    id="register-password"
                    type={showRegisterPassword ? "text" : "password"}
                    autoComplete="new-password"
                    aria-label="Create password"
                    required
                    placeholder="Create password"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label={showRegisterPassword ? "Hide password" : "Show password"}
                  >
                    {showRegisterPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90"
                >
                  {loading ? "Creating account..." : "Create account"}
                </Button>
                <p className="text-[11px] text-muted-foreground text-center">By continuing you agree to our terms and our promise to never spam.</p>
              </form>
            </TabsContent>
          </Tabs>

        </div>
      </main>
    </div>
  );
}
