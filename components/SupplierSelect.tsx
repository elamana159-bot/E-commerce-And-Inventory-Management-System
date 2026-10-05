import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, Plus, MapPin, Phone, UserPlus, Check, ChevronsUpDown, X, Building2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getAll, create, COLLECTIONS, subscribeCollection } from "@/lib/firestore";
import { fmt } from "@/lib/currency";
import type { Supplier } from "@/lib/types";

interface SupplierSelectProps {
  value: string;
  onValueChange: (supplierId: string) => void;
  suppliers?: Supplier[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  required?: boolean;
  label?: string;
  id?: string;
}

export const SupplierSelect: React.FC<SupplierSelectProps> = ({
  value,
  onValueChange,
  suppliers: propSuppliers,
  disabled = false,
  className = "",
  placeholder = "Search & select supplier (አቅራቢ ይምረጡ)...",
  required = false,
  label,
  id,
}) => {
  const [internalSuppliers, setInternalSuppliers] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // New Supplier form state
  const [newForm, setNewForm] = useState({
    name: "",
    address: "",
    phone: "",
    beginningBalance: 0,
    beginningPaid: 0,
  });

  const { toast } = useToast();

  // Load suppliers if not provided via props
  useEffect(() => {
    if (propSuppliers && propSuppliers.length > 0) {
      setInternalSuppliers(propSuppliers);
      return;
    }

    getAll<Supplier>(COLLECTIONS.SUPPLIERS).then(setInternalSuppliers);
    const unsub = subscribeCollection<Supplier>(COLLECTIONS.SUPPLIERS, (data) => {
      setInternalSuppliers(data);
    });
    return () => unsub();
  }, [propSuppliers]);

  const suppliersList = propSuppliers && propSuppliers.length > 0 ? propSuppliers : internalSuppliers;

  // Selected supplier object
  const selectedSupplier = useMemo(() => {
    return suppliersList.find((s) => s.id === value);
  }, [suppliersList, value]);

  // Filtered suppliers matching name, address, or phone
  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return suppliersList;

    return suppliersList.filter((s) => {
      const nameMatch = (s.name || "").toLowerCase().includes(q);
      const addressMatch = (s.address || "").toLowerCase().includes(q);
      const phoneMatch = (s.phone || "").toLowerCase().includes(q);
      return nameMatch || addressMatch || phoneMatch;
    });
  }, [suppliersList, searchQuery]);

  // Focus search input when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      setSearchQuery("");
    }
  }, [open]);

  // Open Quick Add Modal pre-populated with whatever was typed in the search box
  function handleOpenQuickAdd() {
    setNewForm({
      name: searchQuery.trim(),
      address: "",
      phone: "",
      beginningBalance: 0,
      beginningPaid: 0,
    });
    setOpen(false);
    setShowAddDialog(true);
  }

  // Save new supplier & immediately select it
  async function handleSaveNewSupplier(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!newForm.name.trim()) {
      toast({ title: "Supplier name is required (የአቅራቢ ስም ያስፈልጋል)", variant: "destructive" });
      return;
    }

    setSavingNew(true);
    try {
      const bPaid = Number(newForm.beginningPaid) || 0;
      const bBal = Number(newForm.beginningBalance) || 0;
      const today = new Date().toISOString().slice(0, 10);

      const newSupplierId = await create(COLLECTIONS.SUPPLIERS, {
        name: newForm.name.trim(),
        address: newForm.address.trim(),
        phone: newForm.phone.trim(),
        totalPaid: bPaid,
        totalBalance: Math.max(0, bBal - bPaid),
        beginningBalance: bBal,
        beginningDate: bBal > 0 ? today : "",
        beginningPaid: bPaid,
        beginningPaidDate: bPaid > 0 ? today : "",
      });

      toast({
        title: "Supplier Registered & Selected",
        description: `"${newForm.name}" has been added and selected.`,
      });

      // Update state and fire onChange
      onValueChange(newSupplierId);
      setShowAddDialog(false);
      setNewForm({ name: "", address: "", phone: "", beginningBalance: 0, beginningPaid: 0 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create supplier";
      toast({ title: "Error creating supplier", description: msg, variant: "destructive" });
    } finally {
      setSavingNew(false);
    }
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <Label htmlFor={id} className="text-xs font-semibold flex items-center justify-between">
          <span>
            {label} {required && <span className="text-destructive">*</span>}
          </span>
          <button
            type="button"
            onClick={() => {
              setNewForm({ name: "", address: "", phone: "", beginningBalance: 0, beginningPaid: 0 });
              setShowAddDialog(true);
            }}
            className="text-[11px] text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium flex items-center gap-1 hover:underline cursor-pointer"
          >
            <Plus className="w-3 h-3" /> + New Supplier (አዲስ አቅራቢ)
          </button>
        </Label>
      )}

      <div className="flex gap-1.5 items-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className={`w-full justify-between font-normal text-left h-auto min-h-[38px] py-1.5 px-3 bg-background hover:bg-muted/40 ${
                !selectedSupplier ? "text-muted-foreground" : "text-foreground"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Building2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                {selectedSupplier ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 flex-1">
                    <span className="font-semibold text-sm text-foreground truncate">
                      {selectedSupplier.name}
                    </span>
                    {selectedSupplier.address && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded">
                        <MapPin className="w-3 h-3 text-red-500" />
                        <span className="truncate max-w-[150px]">{selectedSupplier.address}</span>
                      </span>
                    )}
                    {selectedSupplier.phone && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded">
                        <Phone className="w-3 h-3 text-green-600" />
                        <span>{selectedSupplier.phone}</span>
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs sm:text-sm truncate">{placeholder}</span>
                )}
              </div>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>

          <PopoverContent className="w-[360px] sm:w-[440px] p-0 shadow-xl border-border z-[100]" align="start">
            {/* Search Box Header */}
            <div className="p-2 border-b bg-muted/20">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search supplier by name, address, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-xs sm:text-sm bg-background"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick Add Action Banner */}
            <div className="px-2 py-1.5 bg-blue-50/60 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/40 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {filteredSuppliers.length} supplier{filteredSuppliers.length !== 1 ? "s" : ""} found
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleOpenQuickAdd}
                className="h-7 px-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-100/60 font-semibold"
              >
                <UserPlus className="w-3.5 h-3.5 mr-1" />
                {searchQuery.trim() ? `+ Add "${searchQuery.trim()}"` : "+ Add New Supplier (አዲስ አቅራቢ)"}
              </Button>
            </div>

            {/* List of Suppliers */}
            <div className="max-h-64 overflow-y-auto divide-y divide-border/60">
              {filteredSuppliers.length === 0 ? (
                <div className="py-6 px-4 text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-foreground">No supplier matching &quot;{searchQuery}&quot;</p>
                    <p className="text-[11px] text-muted-foreground">Register this supplier now without leaving this page.</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleOpenQuickAdd}
                    className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Add &quot;{searchQuery}&quot; as New Supplier
                  </Button>
                </div>
              ) : (
                filteredSuppliers.map((supplier) => {
                  const isSelected = supplier.id === value;
                  return (
                    <div
                      key={supplier.id}
                      onClick={() => {
                        onValueChange(supplier.id);
                        setOpen(false);
                      }}
                      className={`px-3 py-2.5 hover:bg-muted/60 cursor-pointer transition-colors flex items-start justify-between gap-2 ${
                        isSelected ? "bg-blue-50/80 dark:bg-blue-950/40 border-l-4 border-blue-600" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground truncate">
                            {supplier.name}
                          </span>
                          {isSelected && (
                            <Badge variant="outline" className="text-[10px] h-4 bg-blue-100 text-blue-800 border-blue-300">
                              Selected
                            </Badge>
                          )}
                        </div>

                        {/* Prominently show Address to distinguish between same-name suppliers */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {supplier.address ? (
                            <span className="flex items-center gap-1 font-medium text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200/60 dark:border-amber-800/40">
                              <MapPin className="w-3 h-3 text-amber-600 flex-shrink-0" />
                              <span className="truncate max-w-[200px]">{supplier.address}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/60 italic flex items-center gap-0.5">
                              <MapPin className="w-3 h-3 opacity-40" /> No address recorded
                            </span>
                          )}

                          {supplier.phone && (
                            <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                              <Phone className="w-3 h-3 text-green-600 flex-shrink-0" />
                              <span>{supplier.phone}</span>
                            </span>
                          )}
                        </div>

                        {/* Balance Preview */}
                        {(supplier.totalBalance !== undefined && supplier.totalBalance > 0) && (
                          <div className="text-[11px] text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
                            <Wallet className="w-3 h-3" />
                            <span>Outstanding Balance: {fmt(supplier.totalBalance)}</span>
                          </div>
                        )}
                      </div>

                      {isSelected && <Check className="w-4 h-4 text-blue-600 flex-shrink-0 mt-1" />}
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Add button */}
            {filteredSuppliers.length > 0 && (
              <div className="p-2 border-t bg-muted/20">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpenQuickAdd}
                  className="w-full text-xs h-8 text-blue-600 hover:text-blue-800 border-dashed border-blue-300 hover:bg-blue-50"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Register Another New Supplier (አዲስ አቅራቢ መዝግብ)
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Dedicated Quick Add Icon Button beside trigger */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            setNewForm({ name: "", address: "", phone: "", beginningBalance: 0, beginningPaid: 0 });
            setShowAddDialog(true);
          }}
          title="Quick Add New Supplier (አዲስ አቅራቢ መዝግብ)"
          className="h-[38px] w-[38px] flex-shrink-0 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 text-blue-600 dark:text-blue-400"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Quick Add Supplier Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Building2 className="w-5 h-5 text-blue-600" />
              Quick Add Supplier (አዲስ አቅራቢ መመዝገቢያ)
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveNewSupplier} className="space-y-3.5 py-1">
            <div>
              <Label className="text-xs font-semibold">
                Supplier Name (የአቅራቢው ስም) <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Merkato Wholesale, Abebe Trading..."
                value={newForm.name}
                onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 h-9"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-red-500" /> Address (አድራሻ)
                </Label>
                <Input
                  placeholder="e.g. Merkato, Bole, Piassa..."
                  value={newForm.address}
                  onChange={(e) => setNewForm((f) => ({ ...f, address: e.target.value }))}
                  className="mt-1 h-9"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-green-600" /> Phone (ስልክ ቁጥር)
                </Label>
                <Input
                  placeholder="e.g. 0911234567"
                  value={newForm.phone}
                  onChange={(e) => setNewForm((f) => ({ ...f, phone: e.target.value }))}
                  className="mt-1 h-9"
                />
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-muted/40 border space-y-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                Initial Balance (መነሻ ቀሪ ሒሳብ - Optional)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px]">Beginning Debt (ዕዳ)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    value={newForm.beginningBalance || ""}
                    onChange={(e) => setNewForm((f) => ({ ...f, beginningBalance: Number(e.target.value) }))}
                    className="mt-0.5 h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px]">Beginning Paid (የተከፈለ)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    value={newForm.beginningPaid || ""}
                    onChange={(e) => setNewForm((f) => ({ ...f, beginningPaid: Number(e.target.value) }))}
                    className="mt-0.5 h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddDialog(false)}
                disabled={savingNew}
              >
                Cancel (ሰርዝ)
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingNew}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                {savingNew ? "Saving..." : "Save & Select (መዝግብ እና ምረጥ)"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
