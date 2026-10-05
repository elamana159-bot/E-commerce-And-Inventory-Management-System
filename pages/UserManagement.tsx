import { useState } from "react";
import { Plus, Edit, Trash2, Shield, User, Loader2, CheckCircle2, ShieldAlert, Eye, EyeOff, CheckSquare, Search, FileCheck, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useDeleteAuth } from "@/hooks/useDeleteAuth";
import { useAuth, ALL_PERMISSIONS } from "@/lib/auth";
import type { AppUser } from "@/lib/types";

// Core transaction & inventory pages suitable for auditors
const AUDIT_TRANSACTION_PAGES = [
  "audit",
  "stock-in",
  "pos-sales",
  "direct-sales",
  "order-vouchers",
  "transfers",
  "damage-returns",
  "expenses",
  "payment-transactions",
  "accounts",
  "store-requests",
  "bincard",
  "bincard-summary",
  "store-balance",
  "inventory",
  "reports",
];

export default function UserManagement() {
  const { user: currentUser, allUsers, createUser, updateUserPermissions, deleteUser, reloadUsers, switchUser } = useAuth();
  const { toast } = useToast();
  const { confirmDelete, DeleteAuthDialog } = useDeleteAuth();

  const [showDialog, setShowDialog] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "auditor" as "user" | "auditor" | "admin",
    canAudit: true,
    permissions: [] as string[],
  });

  function openAdd(roleType: "auditor" | "user" | "admin" = "auditor") {
    setEditUser(null);
    setShowPassword(false);
    setForm({
      name: "",
      email: "",
      password: "",
      role: roleType,
      canAudit: roleType === "auditor" || roleType === "admin",
      permissions: roleType === "auditor" 
        ? [...AUDIT_TRANSACTION_PAGES]
        : roleType === "admin"
        ? ALL_PERMISSIONS.map(p => p.key)
        : ["dashboard", "pos-sales", "products"],
    });
    setShowDialog(true);
  }

  function openEdit(u: AppUser) {
    setEditUser(u);
    setShowPassword(false);
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role || (u.canAudit ? "auditor" : "user"),
      canAudit: Boolean(u.canAudit || u.role === "auditor" || u.role === "admin"),
      permissions: [...(u.permissions || [])],
    });
    setShowDialog(true);
  }

  function handleRoleChange(newRole: "user" | "auditor" | "admin") {
    setForm(f => {
      let newPermissions = [...f.permissions];
      if (newRole === "auditor") {
        // Pre-fill with all transaction & audit permissions
        newPermissions = Array.from(new Set([...newPermissions, ...AUDIT_TRANSACTION_PAGES]));
      } else if (newRole === "admin") {
        newPermissions = ALL_PERMISSIONS.map(p => p.key);
      }
      return {
        ...f,
        role: newRole,
        canAudit: newRole === "auditor" || newRole === "admin" || f.canAudit,
        permissions: newPermissions,
      };
    });
  }

  function togglePermission(key: string) {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter(p => p !== key)
        : [...f.permissions, key],
    }));
  }

  function selectAll() {
    setForm(f => ({ ...f, permissions: ALL_PERMISSIONS.map(p => p.key) }));
  }

  function selectAuditPreset() {
    setForm(f => ({
      ...f,
      canAudit: true,
      permissions: Array.from(new Set([...AUDIT_TRANSACTION_PAGES])),
    }));
  }

  function selectSalesPreset() {
    setForm(f => ({
      ...f,
      permissions: ["pos-sales", "direct-sales", "order-vouchers", "customers", "pricing", "reports"],
    }));
  }

  function selectInventoryPreset() {
    setForm(f => ({
      ...f,
      permissions: ["stock-in", "transfers", "damage-returns", "store-balance", "bincard", "bincard-summary", "inventory", "store-requests"],
    }));
  }

  function clearAll() {
    setForm(f => ({ ...f, permissions: [] }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Full Name required", variant: "destructive" });
      return;
    }
    if (!editUser) {
      if (!form.email.trim()) {
        toast({ title: "Email / Username required", variant: "destructive" });
        return;
      }
      if (!form.password || form.password.length < 6) {
        toast({ title: "Password must be at least 6 characters", description: "እባክዎ ቢያንስ 6 ፊደላት/ቁጥሮች ያለው የይለፍ ቃል ያስገቡ", variant: "destructive" });
        return;
      }
    } else {
      if (form.password && form.password.length < 6) {
        toast({ title: "Password must be at least 6 characters", variant: "destructive" });
        return;
      }
    }

    setSaving(true);
    try {
      if (editUser) {
        await updateUserPermissions(
          editUser.uid,
          form.name.trim(),
          form.permissions,
          form.role,
          form.canAudit,
          form.password ? form.password : undefined
        );
        toast({ title: "User updated successfully", description: `${form.name} permissions have been saved.` });
      } else {
        await createUser(
          form.email.trim(),
          form.password,
          form.name.trim(),
          form.permissions,
          form.role,
          form.canAudit
        );
        toast({
          title: form.role === "auditor" ? "Auditor account created!" : "User account created!",
          description: `${form.name} can now sign in and ${form.role === "auditor" ? "audit/verify records with 'Checked By' stamp." : "access assigned pages."}`,
        });
      }
      setShowDialog(false);
      await reloadUsers();
    } catch (err) {
      toast({
        title: "Error saving user",
        description: String(err instanceof Error ? err.message : err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(u: AppUser) {
    if (u.uid === currentUser?.uid) {
      toast({ title: "Cannot delete your own account", variant: "destructive" });
      return;
    }
    confirmDelete(async () => {
      try {
        await deleteUser(u.uid);
        toast({ title: "User removed successfully" });
      } catch (err) {
        toast({ title: "Error", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
      }
    });
  }

  const otherUsers = allUsers.filter(u => u.uid !== currentUser?.uid);
  const filteredUsers = otherUsers.filter(u => {
    const matchesSearch =
      (u.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (roleFilter === "auditor") return u.role === "auditor" || u.canAudit;
    if (roleFilter === "staff") return u.role === "user" && !u.canAudit;
    if (roleFilter === "admin") return u.role === "admin";
    return true;
  });

  const auditorCount = otherUsers.filter(u => u.role === "auditor" || u.canAudit).length;
  const staffCount = otherUsers.filter(u => u.role === "user" && !u.canAudit).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            User Management & Auditing (የተጠቃሚዎችና አጣሪዎች አስተዳደር)
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Create staff & auditor accounts. Set page permissions, review records, and stamp receipts with "Checked By: [Name]".
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => openAdd("auditor")}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5 shadow-sm"
            data-testid="button-add-auditor"
          >
            <CheckCircle2 className="w-4 h-4" />
            + Add Auditor (አጣሪ ጨምር)
          </Button>
          <Button
            variant="outline"
            onClick={() => openAdd("user")}
            data-testid="button-add-user"
          >
            <Plus className="w-4 h-4 mr-1" /> Add Staff (ሰራተኛ)
          </Button>
        </div>
      </div>

      {/* How Auditing Works Banner */}
      <div className="rounded-xl border border-amber-300 bg-amber-50/80 dark:bg-amber-950/30 p-4 text-amber-950 dark:text-amber-200 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-800 dark:text-amber-300 mt-0.5">
            <FileCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1.5 text-xs sm:text-sm">
            <div className="font-bold text-amber-950 dark:text-amber-100 text-sm sm:text-base flex items-center gap-2 flex-wrap">
              <span>የአጣሪ (Auditor) እና የደረሰኝ ራይት (Rite / Checked By) አሰራር መመሪያ</span>
              <Badge className="bg-amber-600 text-white font-bold text-xs">
                Auditor Only Rite (ራይት)
              </Badge>
            </div>
            <p className="text-amber-900/90 dark:text-amber-200/90 leading-relaxed font-medium">
              • <strong>Rite (ራይት)</strong> እና <strong>Checked By</strong> ማድረጊያ ቁልፍ የሚሰራው እዚህ በ <strong>"+ Add Auditor (አጣሪ ጨምር)"</strong> ለተመዘገበው አጣሪ ተጠቃሚ (User) ብቻ ነው!
              <br />
              • ሰነዶች ወይም ደረሰኞች ራይት (Check) ሲደረጉ በህትመት (Print)፣ በPDF እና በExcel ላይ <strong>"Checked By: [የተመዘገበው አጣሪ ስም]"</strong> በራስ-ሰር ይተክላል።
              <br />
              • አዲስ አጣሪ ከፈጠሩ በኋላ ከታች ባለው ካርድ ላይ <strong>"በዚህ አጣሪ ግባ (Switch)"</strong> የሚለውን በመጫን ወዲያውኑ በአጣሪው አካውንት ገብተው ማረጋገጥ ይችላሉ።
            </p>
          </div>
        </div>
      </div>

      {/* Current User Card */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
          Currently Signed In Account (የእርስዎ አካውንት)
        </h2>
        <Card className="border-primary/40 bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-lg">
                {(currentUser?.name || currentUser?.email || "U").charAt(0).toUpperCase()}
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <span>{currentUser?.name || "User"}</span>
                  <Badge className={currentUser?.role === "auditor" || currentUser?.canAudit ? "bg-amber-600 text-white font-bold" : currentUser?.role === "admin" ? "bg-primary text-white" : "bg-secondary text-secondary-foreground"}>
                    {currentUser?.role === "auditor" || currentUser?.canAudit ? "Official Auditor (አጣሪ)" : currentUser?.role === "admin" ? "System Administrator" : "Staff User"}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">{currentUser?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentUser?.role === "auditor" || currentUser?.canAudit ? (
                <Badge variant="outline" className="border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline" /> Rite (ራይት) & Check Authority
                </Badge>
              ) : currentUser?.role === "admin" ? (
                <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-950/40 font-semibold">
                  Admin Authority
                </Badge>
              ) : (
                <Badge variant="outline" className="border-slate-300 text-slate-600">
                  Standard Access
                </Badge>
              )}
              {currentUser?.role !== "admin" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-semibold"
                  onClick={() => {
                    const adminUser = allUsers.find(u => u.role === "admin");
                    if (adminUser) {
                      switchUser(adminUser);
                      toast({ title: "Switched back to System Administrator" });
                    }
                  }}
                >
                  Switch to Admin (ወደ Admin ተመለስ)
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-1">
            <span>Role: <strong>{currentUser?.role || "user"}</strong></span>
            <span>Audit Authority: <strong>{currentUser?.role === "auditor" || currentUser?.canAudit ? "Official Auditor (ራይት ማድረግ የተፈቀደለት)" : currentUser?.role === "admin" ? "System Admin" : "None"}</strong></span>
          </CardContent>
        </Card>
      </div>

      {/* Staff & Auditor Accounts Section */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Staff & Auditor Accounts ({otherUsers.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              {auditorCount} Auditor{auditorCount === 1 ? "" : "s"} · {staffCount} Staff Member{staffCount === 1 ? "" : "s"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search user name / email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
            <Tabs value={roleFilter} onValueChange={setRoleFilter} className="w-auto">
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs">All ({otherUsers.length})</TabsTrigger>
                <TabsTrigger value="auditor" className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  Auditors ({auditorCount})
                </TabsTrigger>
                <TabsTrigger value="staff" className="text-xs">Staff ({staffCount})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="text-center py-14 px-4 text-muted-foreground border-2 border-dashed rounded-xl bg-card">
            <User className="w-12 h-12 mx-auto mb-3 opacity-25" />
            <p className="font-semibold text-base text-foreground">No accounts found</p>
            <p className="text-xs mt-1 max-w-sm mx-auto">
              {searchQuery ? "No user matches your search query." : "Click '+ Add Auditor' to register a new auditor with password and verify rights."}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button size="sm" onClick={() => openAdd("auditor")} className="bg-amber-600 hover:bg-amber-700 text-white">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Add Auditor
              </Button>
              <Button size="sm" variant="outline" onClick={() => openAdd("user")}>
                Add Staff
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredUsers.map(u => {
              const isAuditorUser = u.role === "auditor" || u.canAudit;
              const hasAll = u.permissions?.includes("*");
              return (
                <Card key={u.uid} className={`relative overflow-hidden transition-all shadow-sm ${isAuditorUser ? "border-amber-300/80 bg-amber-50/20 dark:bg-amber-950/10" : "border"}`} data-testid={`card-user-${u.uid}`}>
                  <CardHeader className="flex flex-row items-start justify-between pb-2 space-y-0">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${isAuditorUser ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-muted text-muted-foreground"}`}>
                        {isAuditorUser ? <CheckCircle2 className="w-5 h-5 text-amber-600" /> : (u.name || "U").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base font-bold">{u.name}</CardTitle>
                          {isAuditorUser ? (
                            <Badge className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold">
                              Auditor (አጣሪ)
                            </Badge>
                          ) : u.role === "admin" ? (
                            <Badge className="bg-primary text-white text-[11px]">Administrator</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[11px]">Staff</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => openEdit(u)}>
                        <Edit className="w-3.5 h-3.5 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(u)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-1 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                      <span className="font-medium">Verification Privilege:</span>
                      {isAuditorUser ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Can Check & Stamp (ራይት ማድረግ ይችላል)
                        </span>
                      ) : (
                        <span>Standard Operator</span>
                      )}
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-muted-foreground block mb-1">
                        Assigned Pages ({hasAll ? "All Pages" : u.permissions?.length || 0}):
                      </span>
                      <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                        {hasAll ? (
                          <Badge variant="secondary" className="text-[10px]">All System Pages (*)</Badge>
                        ) : !u.permissions || u.permissions.length === 0 ? (
                          <span className="text-[11px] text-muted-foreground italic">No pages assigned</span>
                        ) : (
                          u.permissions.map(p => {
                            const found = ALL_PERMISSIONS.find(ap => ap.key === p);
                            return (
                              <Badge key={p} variant="outline" className="text-[10px] bg-background/80">
                                {found ? found.label.split("(")[0].trim() : p}
                              </Badge>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Quick Session Switch for Testing & Operation */}
                    {isAuditorUser && (
                      <div className="border-t pt-2.5 flex items-center justify-between gap-2">
                        {currentUser?.uid === u.uid ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-1 px-2.5">
                            ✓ Currently Active Auditor (አሁን የገባህበት አጣሪ)
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5 shadow-xs"
                            onClick={() => {
                              switchUser(u);
                              toast({
                                title: `Switched to Auditor: ${u.name}`,
                                description: `በ ${u.name} (አጣሪ) ተቀይሯል። አሁን ደረሰኞችን 'Rite (ራይት)' ማድረግ ይችላሉ!`,
                              });
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            በዚህ አጣሪ ግባ (Sign In as this Auditor)
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit User Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-h-[92vh] overflow-y-auto max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              {editUser ? <Edit className="w-5 h-5 text-primary" /> : <Plus className="w-5 h-5 text-primary" />}
              <span>{editUser ? `Edit Account — ${editUser.name}` : "Create Account / አዲስ ተጠቃሚ መዝግብ"}</span>
            </DialogTitle>
            <CardDescription>
              {editUser ? "Update profile, role, password or assigned page permissions." : "Enter full name, login email, password (min 6 characters) and select the pages this user will audit or manage."}
            </CardDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Role Selection */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Role (የስራ ዘርፍ / ኃላፊነት) *</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => handleRoleChange("auditor")}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${form.role === "auditor" ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 ring-2 ring-amber-500/20" : "border-muted hover:border-slate-300"}`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-amber-800 dark:text-amber-200">
                    <CheckCircle2 className="w-4 h-4 text-amber-600" />
                    Auditor (አጣሪ)
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Can review & stamp vouchers with Right</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleChange("user")}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${form.role === "user" ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-muted hover:border-slate-300"}`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                    <User className="w-4 h-4 text-primary" />
                    Staff (ሰራተኛ)
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Standard operator for assigned pages</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleChange("admin")}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${form.role === "admin" ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40 ring-2 ring-blue-500/20" : "border-muted hover:border-slate-300"}`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-blue-800 dark:text-blue-300">
                    <Shield className="w-4 h-4 text-blue-600" />
                    Admin (አስተዳዳሪ)
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Full control of users, settings & data</p>
                </button>
              </div>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="input-full-name">Full Name (ሙሉ ስም) *</Label>
                <Input
                  id="input-full-name"
                  placeholder="e.g. Abebe Kebede"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  data-testid="input-user-name"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="input-email">Email / Login ID (ኢሜይል / መለያ) *</Label>
                <Input
                  id="input-email"
                  type="text"
                  placeholder="e.g. auditor1@nexusstock.com"
                  value={form.email}
                  disabled={Boolean(editUser)}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  data-testid="input-user-email"
                  className="mt-1 font-mono text-sm"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="input-user-password">
                  {editUser ? "New Password (የይለፍ ቃል መቀየሪያ - አማራጭ)" : "Password * (min 6 characters / ቢያንስ 6 ፊደላት)"}
                </Label>
                {form.password && form.password.length < 6 && (
                  <span className="text-red-500 text-xs font-semibold">Min 6 characters required</span>
                )}
              </div>
              <div className="relative mt-1">
                <Input
                  id="input-user-password"
                  type={showPassword ? "text" : "password"}
                  placeholder={editUser ? "Leave blank to keep current password" : "At least 6 characters (e.g. Pass@123)"}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  data-testid="input-user-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(p => !p)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Verification Capability toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer" htmlFor="cb-can-audit">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Enable "Right / Checked" Privilege (ሰነዶችን ራይት ማድረግ ይችላል)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Allows this user to verify transaction records and display their name as "Checked By: {form.name || '[Name]'}" on receipts.
                </p>
              </div>
              <Checkbox
                id="cb-can-audit"
                checked={form.canAudit}
                onCheckedChange={checked => setForm(f => ({ ...f, canAudit: Boolean(checked) }))}
              />
            </div>

            {/* Page Permissions */}
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Page Permissions (የሚያጣራቸው / የሚደርስባቸው ገጾች)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Selected: <strong>{form.permissions.length}</strong> page{form.permissions.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={selectAuditPreset}>
                    Audit All (ሁሉንም የሚያጣራ)
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={selectAll}>
                    Select All
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={clearAll}>
                    Clear
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border rounded-xl p-3 bg-muted/20 max-h-56 overflow-y-auto">
                {ALL_PERMISSIONS.map(p => {
                  const isChecked = form.permissions.includes(p.key);
                  const isAuditRelated = AUDIT_TRANSACTION_PAGES.includes(p.key);
                  return (
                    <div
                      key={p.key}
                      onClick={() => togglePermission(p.key)}
                      className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${isChecked ? "bg-primary/10 border-primary/40 font-medium" : "bg-card border-transparent hover:border-border"}`}
                    >
                      <Checkbox
                        id={`perm-${p.key}`}
                        checked={isChecked}
                        onCheckedChange={() => togglePermission(p.key)}
                      />
                      <label htmlFor={`perm-${p.key}`} className="flex-1 cursor-pointer flex items-center justify-between">
                        <span>{p.label}</span>
                        {isAuditRelated && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40">
                            Auditable
                          </Badge>
                        )}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between pt-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-primary-foreground font-semibold px-6"
              data-testid="button-save-user"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editUser ? "Save Changes (አዘምን)" : "Create User (ተጠቃሚ መዝግብ)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {DeleteAuthDialog}
    </div>
  );
}
