import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useToast } from "./use-toast";
import { useAuth, ADMIN_EMAIL, ADMIN_PASSWORD } from "./auth";
import { ShieldAlert, KeyRound } from "lucide-react";

export function useDeleteAuth() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [pendingFn, setPendingFn] = useState<(() => void) | null>(null);
  const { toast } = useToast();
  const { user, allUsers } = useAuth();

  function confirmDelete(fn: () => void | Promise<void>) {
    setPendingFn(() => fn);
    setEmail(user?.email || ADMIN_EMAIL);
    setPassword("");
    setOpen(true);
  }

  async function handleVerify() {
    if (!email || !password) {
      toast({ title: "Enter email and password", variant: "destructive" });
      return;
    }
    setChecking(true);
    const cleanEmail = email.trim().toLowerCase();

    // Check system admin credentials first
    if (
      (cleanEmail === ADMIN_EMAIL.toLowerCase() || cleanEmail === "admin") &&
      password === ADMIN_PASSWORD
    ) {
      setOpen(false);
      setChecking(false);
      pendingFn?.();
      return;
    }

    try {
      const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
      let authenticated = false;

      if (apiKey) {
        const res = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: cleanEmail, password, returnSecureToken: false }),
          }
        );
        if (res.ok) {
          authenticated = true;
        }
      }

      // Check against local users
      const matchedUser = allUsers.find(
        (u) => u.email?.toLowerCase() === cleanEmail || u.name?.toLowerCase() === cleanEmail
      );

      if (!authenticated && !matchedUser) {
        toast({
          title: "Invalid credentials",
          description: "Email or password is incorrect. Use admin@nexusstock.com / Admin@123456",
          variant: "destructive",
        });
        return;
      }

      const canDelete =
        matchedUser?.role === "admin" ||
        matchedUser?.permissions?.includes("*") ||
        matchedUser?.permissions?.includes("delete") ||
        cleanEmail === ADMIN_EMAIL.toLowerCase();

      if (!canDelete) {
        toast({
          title: "Permission denied",
          description: "This account does not have delete permission.",
          variant: "destructive",
        });
        return;
      }

      setOpen(false);
      pendingFn?.();
    } catch {
      // Fallback check
      if (
        (cleanEmail === ADMIN_EMAIL.toLowerCase() || cleanEmail === "admin") &&
        password === ADMIN_PASSWORD
      ) {
        setOpen(false);
        pendingFn?.();
      } else {
        toast({
          title: "Verification failed",
          description: "Could not verify credentials. Use admin@nexusstock.com / Admin@123456",
          variant: "destructive",
        });
      }
    } finally {
      setChecking(false);
    }
  }

  const DeleteAuthDialog = (
    <Dialog open={open} onOpenChange={(v) => { if (!checking) setOpen(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            <DialogTitle>Confirm Delete</DialogTitle>
          </div>
          <DialogDescription>
            Enter authorized admin credentials to proceed with this deletion.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Email / Username (የተጠቃሚ ስም ወይም ኢሜይል)</Label>
            <Input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@nexusstock.com or Username"
              disabled={checking}
            />
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin@123456"
              disabled={checking}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            />
          </div>

          <div className="p-2.5 rounded-md bg-muted/60 border border-border text-[11px] text-muted-foreground flex items-start gap-2">
            <KeyRound className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground">Default Admin:</span>
              <div>Email: <code className="text-primary font-mono text-[10px]">admin@nexusstock.com</code></div>
              <div>Password: <code className="text-primary font-mono text-[10px]">Admin@123456</code></div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={checking}>Cancel</Button>
          <Button variant="destructive" onClick={handleVerify} disabled={checking}>
            {checking ? "Verifying…" : "Confirm Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirmDelete, DeleteAuthDialog };
}
