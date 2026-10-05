import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Package, Eye, EyeOff, Loader2, ShieldCheck, ShoppingBag, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth, ADMIN_EMAIL, ADMIN_PASSWORD } from "@/lib/auth";

export default function Login() {
  const [, setLocation] = useLocation();
  const { signIn, user, loading } = useAuth();
  const { toast } = useToast();

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!loading && user) {
      setLocation("/dashboard");
    }
  }, [user, loading]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Please enter email and password", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email, password);
      setLocation("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("invalid-credential") || msg.includes("wrong-password") || msg.includes("user-not-found") || msg.includes("Invalid email")) {
        toast({ title: "Incorrect email or password", variant: "destructive" });
      } else {
        toast({ title: "Sign in failed", description: msg, variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDemoAdminLogin() {
    setEmail(ADMIN_EMAIL);
    setPassword(ADMIN_PASSWORD);
    setSubmitting(true);
    try {
      await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
      toast({ title: "Logged in as Administrator", description: "Full system permissions granted." });
      setLocation("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Sign in failed", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center justify-center text-center space-y-2">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-1">
            <Package className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">NexusStock</h1>
          <p className="text-sm text-muted-foreground">Multi-Store Inventory, POS & E-Commerce System</p>
        </div>

        <Card className="shadow-sm border">
          <CardHeader className="pb-4">
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Access your inventory management and sales dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center justify-center gap-2 border-primary/30 hover:bg-primary/5 hover:text-primary font-medium py-5"
              onClick={handleDemoAdminLogin}
              disabled={submitting}
              id="btn-quick-admin-login"
            >
              <ShieldCheck className="w-4 h-4 text-primary" />
              <span>One-Click Demo Admin Login</span>
            </Button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-muted"></div>
              <span className="flex-shrink mx-3 text-xs text-muted-foreground uppercase">or sign in manually</span>
              <div className="flex-grow border-t border-muted"></div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="input-email">Email</Label>
                <Input
                  id="input-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@nexusstock.com"
                  autoComplete="username"
                  data-testid="input-login-email"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="input-password">Password</Label>
                <div className="relative mt-1">
                  <Input
                    id="input-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Admin@123456"
                    autoComplete="current-password"
                    data-testid="input-login-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(v => !v)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="bg-muted/50 p-2.5 rounded-md text-xs text-muted-foreground space-y-0.5 border">
                <p className="font-semibold text-foreground">Default Credentials:</p>
                <p>Email: <code className="text-primary font-mono select-all">admin@nexusstock.com</code></p>
                <p>Password: <code className="text-primary font-mono select-all">Admin@123456</code></p>
              </div>

              <Button type="submit" className="w-full" disabled={submitting} data-testid="button-login">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center">
          <Link href="/ecommerce">
            <Button variant="ghost" className="text-xs text-muted-foreground hover:text-foreground gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5" />
              Visit Public E-Commerce Storefront
              <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          NexusStock Enterprise · Multi-Store & Retail Logistics
        </p>
      </div>
    </div>
  );
}

