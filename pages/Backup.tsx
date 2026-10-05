import React, { useState, useEffect, useRef } from "react";
import {
  Cloud,
  CloudUpload,
  RotateCcw,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Clock,
  Shield,
  ShieldCheck,
  HardDrive,
  Database,
  Layers,
  ChevronDown,
  ChevronUp,
  Package,
  ShoppingCart,
  Users,
  Building,
  DollarSign,
  Boxes,
  FileJson,
  Info,
  Laptop,
  Radio,
  FileCheck2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../use-toast";
import { useAuth } from "../auth";
import {
  CloudBackup,
  BackupSettings,
  getBackupSettings,
  saveBackupSettings,
  createCloudBackup,
  getCloudBackupsList,
  deleteCloudBackup,
  restoreFromBackup,
  exportBackupToFile,
  importBackupFromFile,
  formatBytes,
} from "../lib/backupService";
import { formatSafeTime, formatSafeDate } from "@/lib/dateUtils";

export default function BackupPage() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();

  const [backups, setBackups] = useState<CloudBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [customBackupName, setCustomBackupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const [settings, setSettings] = useState<BackupSettings>(getBackupSettings());
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // Restore Modal State
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<CloudBackup | null>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Delete Modal State
  const [selectedBackupForDelete, setSelectedBackupForDelete] = useState<CloudBackup | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Expand snapshot preview
  const [expandedBackupId, setExpandedBackupId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Fetch backups
  async function loadBackups() {
    setLoading(true);
    try {
      const list = await getCloudBackupsList();
      setBackups(list);
      setSettings(getBackupSettings());
    } catch (err) {
      toast({
        title: "Failed to load backups",
        description: (err as Error)?.message || "Could not retrieve backup list.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBackups();
  }, []);

  // Handle manual backup creation
  async function handleCreateBackup() {
    if (!isAdmin) {
      toast({
        title: "Admin Permission Required",
        description: "Only administrators can trigger cloud backups.",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      const result = await createCloudBackup(
        "manual",
        customBackupName.trim() || undefined,
        user?.email || "Admin"
      );

      if (result.success && result.backup) {
        toast({
          title: "Backup Created Successfully",
          description: result.error
            ? result.error
            : `Snapshot #${result.backup.id} saved with ${result.backup.summary.totalRecords} records (${result.backup.sizeFormatted}).`,
        });
        setCustomBackupName("");
        await loadBackups();
      } else {
        throw new Error(result.error || "Failed to create backup.");
      }
    } catch (err) {
      toast({
        title: "Backup Failed",
        description: (err as Error)?.message || "Could not create backup snapshot.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  // Handle Restore
  async function handleExecuteRestore() {
    if (!selectedBackupForRestore) return;
    if (!confirmCheckbox) {
      toast({
        title: "Confirmation Required",
        description: "Please check the confirmation box to proceed with restoring.",
        variant: "destructive",
      });
      return;
    }

    setRestoring(true);
    try {
      const result = await restoreFromBackup(selectedBackupForRestore);

      if (result.success) {
        toast({
          title: "Restore Completed Successfully!",
          description: `Restored ${selectedBackupForRestore.summary.totalRecords} records from backup dated ${selectedBackupForRestore.backupDate}. Safety backup was created.`,
        });

        setIsRestoreModalOpen(false);
        setSelectedBackupForRestore(null);
        setConfirmCheckbox(false);

        // Reload data after brief interval
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        throw new Error(result.error || "Restore execution failed.");
      }
    } catch (err) {
      toast({
        title: "Restore Failed",
        description: (err as Error)?.message || "Local data preserved.",
        variant: "destructive",
      });
    } finally {
      setRestoring(false);
    }
  }

  // Handle Delete
  async function handleExecuteDelete() {
    if (!selectedBackupForDelete) return;
    setDeleting(true);
    try {
      const success = await deleteCloudBackup(selectedBackupForDelete.id);
      if (success) {
        toast({
          title: "Backup Deleted",
          description: `Backup ${selectedBackupForDelete.id} has been permanently removed.`,
        });
        setIsDeleteModalOpen(false);
        setSelectedBackupForDelete(null);
        await loadBackups();
      } else {
        throw new Error("Failed to delete backup from cloud.");
      }
    } catch (err) {
      toast({
        title: "Deletion Failed",
        description: (err as Error)?.message || "Could not remove backup.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  }

  // Handle Settings Update
  function handleSaveSettings(updates: Partial<BackupSettings>) {
    const updated = saveBackupSettings(updates);
    setSettings(updated);
    toast({
      title: "Settings Saved",
      description: "Backup configuration has been updated.",
    });
  }

  // Handle file import
  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const imported = await importBackupFromFile(file);
      setSelectedBackupForRestore(imported);
      setIsRestoreModalOpen(true);
      toast({
        title: "Backup File Loaded",
        description: `Imported "${imported.name || imported.id}" (${imported.summary?.totalRecords || 0} records). Review and confirm restore.`,
      });
    } catch (err) {
      toast({
        title: "Import Error",
        description: (err as Error)?.message || "Invalid backup JSON file.",
        variant: "destructive",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Filter backups
  const filteredBackups = backups.filter((b) => {
    const matchesSearch =
      b.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.backupDate.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.name && b.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (filterType === "all") return matchesSearch;
    if (filterType === "manual") return matchesSearch && b.type === "manual";
    if (filterType === "automatic") return matchesSearch && b.type === "automatic";
    if (filterType === "safety") return matchesSearch && b.type === "safety";
    return matchesSearch;
  });

  const deviceId = user?.id ? `client_${user.id.slice(0, 8)}` : "cloud-client";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ── Top Header & Status ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Database className="h-7 w-7 text-primary" />
              Backup & Restore Center
            </h1>
            <Badge
              variant="outline"
              className={
                isOnline
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 flex items-center gap-1.5 px-2.5 py-0.5"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 flex items-center gap-1.5 px-2.5 py-0.5"
              }
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              {isOnline ? "ONLINE — CLOUD SYNC READY" : "OFFLINE — LOCAL DB ONLY"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Local IndexedDB primary storage with Firebase Firestore cloud backups, manual point-in-time restore, and Cloudinary media management.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadBackups}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".json"
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Import Backup File
          </Button>
        </div>
      </div>

      {/* ── Status KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Primary DB Card */}
        <Card className="shadow-xs border-border bg-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Primary Database
              </span>
              <HardDrive className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-xl font-bold mt-1">IndexedDB Local</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center justify-between">
              <span>Operation Mode:</span>
              <span className="font-medium text-foreground">Offline-First</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Device ID:</span>
              <span className="font-mono text-[11px] text-foreground truncate max-w-[130px]">{deviceId}</span>
            </div>
          </CardContent>
        </Card>

        {/* Cloud Backup Status */}
        <Card className="shadow-xs border-border bg-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cloud Backup
              </span>
              <Cloud className="h-4 w-4 text-sky-500" />
            </div>
            <CardTitle className="text-xl font-bold mt-1">Firebase Firestore</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center justify-between">
              <span>Cloud Status:</span>
              <Badge
                variant="outline"
                className={
                  settings.lastBackupStatus === "completed"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px]"
                    : settings.lastBackupStatus === "offline"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/30 text-[10px]"
                    : "bg-rose-500/10 text-rose-600 border-rose-500/30 text-[10px]"
                }
              >
                {settings.lastBackupStatus ? settings.lastBackupStatus.toUpperCase() : "READY"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Last Snapshot:</span>
              <span className="font-medium text-foreground">
                {settings.lastBackupTimestamp
                  ? formatSafeTime(settings.lastBackupTimestamp, "Not yet")
                  : "Not yet"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Available Backups */}
        <Card className="shadow-xs border-border bg-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Backup History
              </span>
              <Layers className="h-4 w-4 text-violet-500" />
            </div>
            <CardTitle className="text-xl font-bold mt-1">{backups.length} Snapshots</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center justify-between">
              <span>Manual:</span>
              <span className="font-medium text-foreground">
                {backups.filter((b) => b.type === "manual").length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Auto / Safety:</span>
              <span className="font-medium text-foreground">
                {backups.filter((b) => b.type === "automatic").length} / {backups.filter((b) => b.type === "safety").length}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Media Storage Card */}
        <Card className="shadow-xs border-border bg-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Media Storage
              </span>
              <CloudUpload className="h-4 w-4 text-amber-500" />
            </div>
            <CardTitle className="text-xl font-bold mt-1">Cloudinary CDN</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <div className="flex items-center justify-between">
              <span>Role:</span>
              <span className="font-medium text-foreground">Images & Files Only</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Data Protection:</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> URLs in Snapshot
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Create Backup & Settings Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Manual Backup Trigger Box */}
        <Card className="lg:col-span-1 shadow-xs border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CloudUpload className="h-5 w-5 text-primary" />
              Create Cloud Backup
            </CardTitle>
            <CardDescription>
              Capture a complete point-in-time snapshot of all local products, sales, inventory, and accounts into Firebase Firestore.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backupLabel" className="text-xs font-medium">
                Custom Backup Label (Optional)
              </Label>
              <Input
                id="backupLabel"
                placeholder="e.g., Before end-of-month audit"
                value={customBackupName}
                onChange={(e) => setCustomBackupName(e.target.value)}
                disabled={creating || !isAdmin}
              />
            </div>

            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1.5 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Snapshot Scope:</span>
                <span className="font-medium text-foreground">28 Entities</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current Time:</span>
                <span className="font-medium text-foreground">
                  {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })},{" "}
                  {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Target Storage:</span>
                <span className="font-medium text-foreground">IndexedDB + Firestore</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="pt-2">
            <Button
              className="w-full flex items-center justify-center gap-2"
              onClick={handleCreateBackup}
              disabled={creating || !isAdmin}
            >
              {creating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Creating Backup Snapshot...
                </>
              ) : (
                <>
                  <CloudUpload className="h-4 w-4" />
                  Backup Now
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* Backup Settings Box */}
        <Card className="lg:col-span-2 shadow-xs border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Backup Configuration
                </CardTitle>
                <CardDescription>
                  Configure automated cloud backup schedules and retention rules.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs bg-muted">
                Admin Settings
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg border border-border bg-muted/20 gap-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Radio className="h-4 w-4 text-emerald-500" />
                  Automatic Cloud Backup
                </Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, creates cloud backups in the background whenever the device is online.
                </p>
              </div>
              <Switch
                checked={settings.autoBackupEnabled}
                onCheckedChange={(val) => handleSaveSettings({ autoBackupEnabled: val })}
                disabled={!isAdmin}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Backup Frequency</Label>
                <Select
                  value={settings.frequency}
                  onValueChange={(val: any) => handleSaveSettings({ frequency: val })}
                  disabled={!settings.autoBackupEnabled || !isAdmin}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Every Hour</SelectItem>
                    <SelectItem value="every_6_hours">Every 6 Hours</SelectItem>
                    <SelectItem value="daily">Daily (Recommended)</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">Max Cloud Backups to Retain</Label>
                <Select
                  value={String(settings.maxBackupsToKeep)}
                  onValueChange={(val) => handleSaveSettings({ maxBackupsToKeep: parseInt(val, 10) })}
                  disabled={!isAdmin}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Retention Count" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">Keep Latest 5 Backups</SelectItem>
                    <SelectItem value="10">Keep Latest 10 Backups</SelectItem>
                    <SelectItem value="15">Keep Latest 15 Backups</SelectItem>
                    <SelectItem value="25">Keep Latest 25 Backups</SelectItem>
                    <SelectItem value="50">Keep Latest 50 Backups</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <span className="font-semibold">Automatic Restore Policy:</span> Automatic restore is permanently locked OFF. Restores can only be executed manually by an administrator with explicit confirmation and safety backup creation.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── BACKUP HISTORY — RECYCLE BIN INTERFACE ── */}
      <Card className="shadow-xs border-border bg-card">
        <CardHeader className="border-b border-border pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                Backup History & Recycle Snapshots
              </CardTitle>
              <CardDescription>
                Select any historical point-in-time backup to inspect, restore into IndexedDB, or download.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[130px] h-9 text-xs">
                  <SelectValue placeholder="Filter by Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="automatic">Automatic</SelectItem>
                  <SelectItem value="safety">Safety Pre-Restore</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Search backup ID / date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[180px] sm:w-[220px] h-9 text-xs"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : filteredBackups.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground space-y-3">
              <Database className="h-12 w-12 mx-auto text-muted-foreground/40" />
              <div className="font-medium text-foreground">No Backups Found</div>
              <p className="text-xs max-w-md mx-auto">
                {searchQuery
                  ? "No backups matched your search query. Clear filters to see all available snapshots."
                  : "No backups have been created yet. Click 'Backup Now' above to take your first full database snapshot."}
              </p>
              {isAdmin && !searchQuery && (
                <Button size="sm" onClick={handleCreateBackup} disabled={creating} className="mt-2">
                  <CloudUpload className="h-4 w-4 mr-1.5" />
                  Create First Backup
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredBackups.map((backup) => {
                const isExpanded = expandedBackupId === backup.id;
                const isSafety = backup.type === "safety";
                const isAuto = backup.type === "automatic";

                return (
                  <div
                    key={backup.id}
                    className="p-4 sm:p-5 hover:bg-muted/30 transition-colors space-y-3"
                  >
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            {backup.name || `Backup [${backup.backupDate} — ${backup.backupTime}]`}
                          </span>

                          <Badge
                            variant="outline"
                            className={
                              isSafety
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]"
                                : isAuto
                                ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30 text-[10px]"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]"
                            }
                          >
                            {backup.type.toUpperCase()}
                          </Badge>

                          <Badge variant="secondary" className="font-mono text-[10px] text-muted-foreground">
                            {backup.id}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground/70" />
                            {backup.backupDate} — {backup.backupTime}
                          </span>
                          <span>•</span>
                          <span>Size: {backup.sizeFormatted || "N/A"}</span>
                          <span>•</span>
                          <span className="truncate max-w-[150px]">By: {backup.createdBy || "Admin"}</span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setExpandedBackupId(isExpanded ? null : backup.id)
                          }
                          className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3.5 w-3.5 mr-1" />
                              Hide Details
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3.5 w-3.5 mr-1" />
                              Inspect
                            </>
                          )}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportBackupToFile(backup)}
                          className="h-8 text-xs flex items-center gap-1"
                          title="Download standalone JSON backup file"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span className="hidden md:inline">Download</span>
                        </Button>

                        {isAdmin && (
                          <>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
                                setSelectedBackupForRestore(backup);
                                setIsRestoreModalOpen(true);
                                setConfirmCheckbox(false);
                              }}
                              className="h-8 text-xs bg-primary hover:bg-primary/90 flex items-center gap-1"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Restore
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedBackupForDelete(backup);
                                setIsDeleteModalOpen(true);
                              }}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title="Delete this backup"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Summary Metrics Chips */}
                    <div className="flex items-center flex-wrap gap-2 pt-1 text-xs">
                      <span className="px-2.5 py-1 rounded-md bg-muted/50 border border-border text-foreground flex items-center gap-1.5 font-medium">
                        <Package className="h-3.5 w-3.5 text-primary" />
                        Products: <span className="font-bold">{backup.summary?.productsCount || 0}</span>
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-muted/50 border border-border text-foreground flex items-center gap-1.5 font-medium">
                        <ShoppingCart className="h-3.5 w-3.5 text-emerald-500" />
                        Sales: <span className="font-bold">{backup.summary?.salesCount || 0}</span>
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-muted/50 border border-border text-foreground flex items-center gap-1.5 font-medium">
                        <Users className="h-3.5 w-3.5 text-sky-500" />
                        Customers: <span className="font-bold">{backup.summary?.customersCount || 0}</span>
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-muted/50 border border-border text-foreground flex items-center gap-1.5 font-medium">
                        <Building className="h-3.5 w-3.5 text-amber-500" />
                        Suppliers: <span className="font-bold">{backup.summary?.suppliersCount || 0}</span>
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-muted/50 border border-border text-foreground flex items-center gap-1.5 font-medium">
                        <Boxes className="h-3.5 w-3.5 text-violet-500" />
                        Inventory: <span className="font-bold">{backup.summary?.inventoryCount || 0}</span>
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-muted/50 border border-border text-muted-foreground flex items-center gap-1">
                        Total Records: <span className="font-semibold text-foreground">{backup.summary?.totalRecords || 0}</span>
                      </span>
                    </div>

                    {/* Expandable Detailed Breakdown */}
                    {isExpanded && (
                      <div className="mt-3 p-3.5 bg-muted/40 rounded-lg border border-border text-xs space-y-3">
                        <div className="font-semibold text-foreground flex items-center gap-2">
                          <FileJson className="h-4 w-4 text-primary" />
                          Detailed Entity Snapshot Breakdown
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 text-muted-foreground">
                          {backup.snapshot &&
                            Object.entries(backup.snapshot).map(([key, value]) => {
                              const count = Array.isArray(value) ? value.length : 0;
                              return (
                                <div
                                  key={key}
                                  className="flex items-center justify-between p-1.5 px-2 bg-background rounded border border-border/60"
                                >
                                  <span className="capitalize font-mono text-[11px]">
                                    {key.replace(/_/g, " ")}:
                                  </span>
                                  <span className="font-semibold text-foreground">{count}</span>
                                </div>
                              );
                            })}
                        </div>
                        <div className="text-[11px] text-muted-foreground border-t border-border/50 pt-2 flex items-center justify-between">
                          <span>Device: {backup.deviceInfo || "Standard Client"}</span>
                          <span>Schema: DB v{backup.dbVersion || 2}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── RESTORE CONFIRMATION DIALOG (STRICT SAFETY MANDATE) ── */}
      <Dialog open={isRestoreModalOpen} onOpenChange={setIsRestoreModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Database Restore
            </DialogTitle>
            <DialogDescription>
              Carefully review the backup details before proceeding with manual restoration.
            </DialogDescription>
          </DialogHeader>

          {selectedBackupForRestore && (
            <div className="space-y-4 py-2">
              <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive space-y-1.5">
                <p className="font-semibold">
                  WARNING: Local IndexedDB data will be updated/replaced!
                </p>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Restoring this snapshot will replace your active local database with the selected state from{" "}
                  <strong>{selectedBackupForRestore.backupDate} at {selectedBackupForRestore.backupTime}</strong>.
                </p>
              </div>

              <div className="rounded-lg border border-border p-3 text-xs space-y-2 bg-muted/20">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Backup ID:</span>
                  <span className="font-mono font-medium">{selectedBackupForRestore.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Snapshot Date:</span>
                  <span className="font-medium">{selectedBackupForRestore.backupDate} — {selectedBackupForRestore.backupTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Records in Backup:</span>
                  <span className="font-bold text-foreground">{selectedBackupForRestore.summary?.totalRecords || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Products / Sales / Customers:</span>
                  <span className="font-medium">
                    {selectedBackupForRestore.summary?.productsCount || 0} / {selectedBackupForRestore.summary?.salesCount || 0} / {selectedBackupForRestore.summary?.customersCount || 0}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <strong>Automatic Safety Guarantee:</strong> A temporary safety backup of your current local state will be created immediately prior to executing this restore. If anything fails, your database will automatically roll back.
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-2">
                <input
                  type="checkbox"
                  id="confirmRestoreCheckbox"
                  checked={confirmCheckbox}
                  onChange={(e) => setConfirmCheckbox(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                />
                <label
                  htmlFor="confirmRestoreCheckbox"
                  className="text-xs font-medium leading-normal cursor-pointer select-none"
                >
                  I understand that my current local database will be restored to this snapshot point.
                </label>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsRestoreModalOpen(false);
                setSelectedBackupForRestore(null);
                setConfirmCheckbox(false);
              }}
              disabled={restoring}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleExecuteRestore}
              disabled={!confirmCheckbox || restoring}
              className="flex items-center gap-2"
            >
              {restoring ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Restoring Database...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  Restore Backup
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRMATION DIALOG ── */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Cloud Backup
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this backup from Firebase Firestore and local history?
            </DialogDescription>
          </DialogHeader>

          {selectedBackupForDelete && (
            <div className="py-2 text-xs space-y-2">
              <div className="p-3 bg-muted rounded border border-border">
                <div className="font-semibold text-foreground">{selectedBackupForDelete.name || selectedBackupForDelete.id}</div>
                <div className="text-muted-foreground mt-1">
                  Created on {selectedBackupForDelete.backupDate} at {selectedBackupForDelete.backupTime} ({selectedBackupForDelete.sizeFormatted})
                </div>
              </div>
              <p className="text-muted-foreground text-[11px]">
                This action is permanent. Once deleted, this backup cannot be used for restore.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setSelectedBackupForDelete(null);
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleExecuteDelete}
              disabled={deleting}
              className="flex items-center gap-1.5"
            >
              {deleting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete Permanently
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
