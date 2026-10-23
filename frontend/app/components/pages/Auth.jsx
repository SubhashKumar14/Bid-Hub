import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useState, useRef, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { BrandLogo } from "../../brand/BrandLogo";
import { BrandIcon } from "../../brand/BrandIcon";
import { toast } from "sonner";

export function Auth({ onDone, setToken, initialRole = "student" }) {
  const [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [showPassword, setShowPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [role, setRole] = useState(initialRole === "client" ? "client" : "student");
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
      toast.error("Please enter your email and password");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!active.current) return;

      if (!res.ok) {
        throw new Error(data.message || "Failed to log in");
      }

      localStorage.setItem("token", data.token);
      setToken(data.token);
      toast.success("Welcome back to Bid·Hub");
      onDone(data.role);
    } catch (err) {
      if (!active.current) return;
      setError(err.message);
      toast.error(err.message);
    } finally {
      if (active.current) setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerEmail || !registerPassword || !registerFirstName.trim() || !registerLastName.trim()) {
      toast.error("Please fill in your name, email, and password");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const name = `${registerFirstName.trim()} ${registerLastName.trim()}`;
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: registerEmail.trim(),
          password: registerPassword,
          role,
          college: registerCollege.trim(),
        }),
      });
      const data = await res.json();
      if (!active.current) return;

      if (!res.ok) {
        throw new Error(data.message || "Registration failed");
      }

      localStorage.setItem("token", data.token);
      setToken(data.token);
      toast.success("Account created successfully");
      onDone(data.role);
    } catch (err) {
      if (!active.current) return;
      setError(err.message);
      toast.error(err.message);
    } finally {
      if (active.current) setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-72px)] grid lg:grid-cols-12 bg-background">
      {error && <p role="alert" className="lg:col-span-12 px-5 py-3 text-sm text-destructive">{error}</p>}
      {/* Editorial Identity Side */}
      <aside className="hidden lg:flex lg:col-span-5 flex-col justify-between p-12 bg-secondary/50 border-r border-border relative">
        <div>
          <BrandLogo width={140} decorative />
          <div className="mt-16 max-w-sm space-y-4">
            <span className="eyebrow text-xs text-[var(--brand-accent)] font-semibold">
              Independent student work exchange
            </span>
            <h1 className="font-serif text-4xl text-foreground font-normal tracking-tight leading-snug">
              Good work shouldn't wait for graduation.
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Structured project briefs, transparent milestone agreements, and verified delivery evidence for campus talent.
            </p>
          </div>
        </div>

        <div className="space-y-4 max-w-sm">
          <div className="p-4 bg-card border border-border rounded-[8px] space-y-2">
            <div className="flex items-center gap-2 text-foreground font-medium text-xs">
              <BrandIcon name="milestone" size={16} className="text-[var(--brand-accent)]" />
              <span>Milestone Protection</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Escrow funding is locked before kick-off and released only when submitted deliverables are reviewed and approved.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">© Bid·Hub · Bengaluru, India</p>
        </div>
      </aside>

      {/* Main Authentication Form */}
      <main className="lg:col-span-7 flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-[420px] space-y-6">
          <div>
            <span className="eyebrow text-xs">Account Workspace</span>
            <h2 className="text-2xl font-medium tracking-tight text-foreground mt-1">
              Access your workspace
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Sign in with your email or register as a student freelancer or project client.
            </p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid grid-cols-2 w-full h-11 p-1 bg-secondary rounded-[5px] border border-border">
              <TabsTrigger value="login" className="rounded-[4px] text-xs font-medium cursor-pointer">
                Sign in
              </TabsTrigger>
              <TabsTrigger value="register" className="rounded-[4px] text-xs font-medium cursor-pointer">
                Create account
              </TabsTrigger>
            </TabsList>

            {/* Sign in Tab */}
            <TabsContent value="login" className="mt-5 space-y-4">
              <form
                className="space-y-3.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLogin();
                }}
              >
                <div>
                  <label htmlFor="login-email" className="text-xs font-medium text-foreground block mb-1">
                    Email Address
                  </label>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    required
                    placeholder="name@college.edu or name@company.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="login-password" className="text-xs font-medium text-foreground block mb-1">
                    Password
                  </label>
                  <div className="relative">
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
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  variant="default"
                  className="w-full rounded-[5px] h-11 text-sm font-medium mt-2"
                >
                  {loading ? "Signing in…" : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            {/* Registration Tab */}
            <TabsContent value="register" className="mt-5 space-y-4">
              <form
                className="space-y-3.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRegister();
                }}
              >
                {/* Role Selection */}
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">
                    Select Your Role
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole("student")}
                      className={`p-3 rounded-[5px] border text-left transition-colors cursor-pointer ${
                        role === "student"
                          ? "border-[var(--brand-accent)] bg-secondary/70 font-medium"
                          : "border-border bg-card hover:bg-secondary/40 text-muted-foreground"
                      }`}
                    >
                      <p className="text-xs font-medium text-foreground">Student Freelancer</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Find projects & earn</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRole("client")}
                      className={`p-3 rounded-[5px] border text-left transition-colors cursor-pointer ${
                        role === "client"
                          ? "border-[var(--brand-accent)] bg-secondary/70 font-medium"
                          : "border-border bg-card hover:bg-secondary/40 text-muted-foreground"
                      }`}
                    >
                      <p className="text-xs font-medium text-foreground">Project Client</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Post briefs & hire</p>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="reg-first-name" className="text-xs font-medium text-foreground block mb-1">
                      First Name
                    </label>
                    <Input
                      id="reg-first-name"
                      autoComplete="given-name"
                      required
                      placeholder="e.g. Rahul"
                      value={registerFirstName}
                      onChange={(e) => setRegisterFirstName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-last-name" className="text-xs font-medium text-foreground block mb-1">
                      Last Name
                    </label>
                    <Input
                      id="reg-last-name"
                      autoComplete="family-name"
                      required
                      placeholder="e.g. Verma"
                      value={registerLastName}
                      onChange={(e) => setRegisterLastName(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-email" className="text-xs font-medium text-foreground block mb-1">
                    Email Address
                  </label>
                  <Input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder={role === "student" ? "student@university.edu" : "client@company.com"}
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="reg-college" className="text-xs font-medium text-foreground block mb-1">
                    {role === "student" ? "College / University" : "Company / Organization"}
                  </label>
                  <Input
                    id="reg-college"
                    autoComplete="organization"
                    placeholder={role === "student" ? "e.g. RV College of Engineering" : "e.g. Studio Vertex"}
                    value={registerCollege}
                    onChange={(e) => setRegisterCollege(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="reg-password" className="text-xs font-medium text-foreground block mb-1">
                    Create Password
                  </label>
                  <div className="relative">
                    <Input
                      id="reg-password"
                      type={showRegisterPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      placeholder="At least 8 characters"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                      aria-label={showRegisterPassword ? "Hide password" : "Show password"}
                    >
                      {showRegisterPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  variant="default"
                  className="w-full rounded-[5px] h-11 text-sm font-medium mt-2"
                >
                  {loading ? "Creating account…" : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
