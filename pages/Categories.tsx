import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Search, Pencil, Trash2, Tag, ChevronDown, MoreHorizontal, Layers, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDeleteAuth } from "@/hooks/useDeleteAuth";
import { getAll, create, update, remove, COLLECTIONS, subscribeCollection } from "@/lib/firestore";
import type { Category } from "@/lib/types";
import { ProductSizeRangeSelector } from "@/components/ProductSizeRangeSelector";

const categorySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  minSize: z.union([z.string(), z.number()]).optional(),
  maxSize: z.union([z.string(), z.number()]).optional(),
  sizeRange: z.string().optional(),
  sizes: z.array(z.string()).optional(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sizeInputString, setSizeInputString] = useState<string>("");
  const { toast } = useToast();
  const { confirmDelete, DeleteAuthDialog } = useDeleteAuth();

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      description: "",
      minSize: "",
      maxSize: "",
      sizeRange: "",
      sizes: [],
    },
  });

  const loadCategories = async () => {
    setLoading(true);
    try {
      const data = await getAll<Category>(COLLECTIONS.CATEGORIES);
      setCategories(data.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    } catch (error) {
      toast({ title: "Error", description: "Failed to load categories", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
    const unsub = subscribeCollection<Category>(COLLECTIONS.CATEGORIES, (data) => {
      setCategories(data.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    });
    return () => unsub();
  }, []);

  const onSubmit = async (values: CategoryFormValues) => {
    try {
      const payload: Partial<Category> = {
        name: values.name.trim(),
        description: values.description ? values.description.trim() : "",
        minSize: values.minSize !== undefined && values.minSize !== "" ? values.minSize : undefined,
        maxSize: values.maxSize !== undefined && values.maxSize !== "" ? values.maxSize : undefined,
        sizeRange: values.sizeRange || "",
        sizes: values.sizes || [],
      };

      if (editingId) {
        await update(COLLECTIONS.CATEGORIES, editingId, payload);
        toast({ title: "Success", description: "Category updated successfully" });
      } else {
        await create(COLLECTIONS.CATEGORIES, payload);
        toast({ title: "Success", description: "Category created successfully" });
      }
      setIsDialogOpen(false);
      form.reset();
      setSizeInputString("");
      setEditingId(null);
      loadCategories();
    } catch (error) {
      toast({ title: "Error", description: "Operation failed", variant: "destructive" });
    }
  };

  const handleEdit = (category: Category) => {
    setEditingId(category.id);
    const existingSizesStr = category.sizes && category.sizes.length > 0
      ? category.sizes.join(", ")
      : (category.sizeRange || "");
    
    setSizeInputString(existingSizesStr);
    form.reset({
      name: category.name,
      description: category.description || "",
      minSize: category.minSize ?? "",
      maxSize: category.maxSize ?? "",
      sizeRange: category.sizeRange || "",
      sizes: category.sizes || [],
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    confirmDelete(async () => {
      try {
        await remove(COLLECTIONS.CATEGORIES, id);
        toast({ title: "Success", description: "Category deleted" });
        loadCategories();
      } catch (error) {
        toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
      }
    });
  };

  const filteredCategories = categories.filter(c => 
    Boolean(c) && (
      (c.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.sizeRange || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.description || "").toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories (የዕቃ ምድቦች)</h1>
          <p className="text-muted-foreground">
            Manage product categories, configure size boundaries (መነሻ - መድረሻ ሳይዞች) and carton distributions
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            form.reset({ name: "", description: "", minSize: "", maxSize: "", sizeRange: "", sizes: [] });
            setSizeInputString("");
            setEditingId(null);
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-category" className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Category (አዲስ ምድብ)
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Category (ምድብ አርትዕ)" : "Add Category (አዲስ ምድብ መዝግብ)"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category Name (የምድቡ ስም) *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. ወንድ ጫማ / Men Shoes or ሴት ጫማ / Women Shoes" {...field} data-testid="input-category-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (መግለጫ)</FormLabel>
                      <FormControl>
                        <Input placeholder="Optional category description" {...field} data-testid="input-category-desc" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Size Boundaries for this Category */}
                <div className="pt-2 border-t">
                  <ProductSizeRangeSelector
                    label="Category Size Range / የዚህ ምድብ ሳይዝ ክልል (መነሻ - መድረሻ)"
                    value={sizeInputString}
                    onChange={(val, sizesArr, rangeSummary) => {
                      setSizeInputString(val);
                      form.setValue("sizeRange", rangeSummary || val);
                      form.setValue("sizes", sizesArr);
                      if (sizesArr.length > 0) {
                        const numList = sizesArr.map(s => parseFloat(s)).filter(n => !isNaN(n));
                        if (numList.length > 0) {
                          form.setValue("minSize", Math.min(...numList));
                          form.setValue("maxSize", Math.max(...numList));
                        }
                      } else {
                        form.setValue("minSize", "");
                        form.setValue("maxSize", "");
                      }
                    }}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    💡 በዚህ ምድብ ስር የሚገቡትን ሳይዞች (ለምሳሌ 39-45) ሲወስኑ፤ አዲስ ዕቃ ሲመዘገብ የተመረጡትን ሳይዞች አይቶ በራስ-ሰር ምድቡን (Category) ይመርጥለታል እንዲሁም በካርቶን ውስጥ ያሉትን ይከፋፍላል።
                  </p>
                </div>

                <Button type="submit" className="w-full mt-4" data-testid="button-submit-category">
                  {editingId ? "Update Category (አዘምን)" : "Create Category (መዝግብ)"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center space-x-2 flex-1 max-w-sm">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search categories or size range..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-categories"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Total: <span className="font-bold text-foreground">{categories.length}</span> categories
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category Name (ምድብ)</TableHead>
                  <TableHead>Size Range Limits (የሳይዝ ወሰን)</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCategories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No categories found. Click "Add Category" above to register your first category with size ranges.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCategories.map((category) => {
                    const hasSizeRange = category.sizeRange || (category.sizes && category.sizes.length > 0) || (category.minSize !== undefined && category.maxSize !== undefined);
                    const rangeDisplay = category.sizeRange 
                      ? category.sizeRange 
                      : (category.minSize !== undefined && category.maxSize !== undefined ? `${category.minSize} – ${category.maxSize}` : "");
                    
                    const sizesCount = category.sizes?.length || 0;

                    return (
                      <TableRow key={category.id} data-testid={`row-category-${category.id}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center">
                              <Tag className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <span className="font-bold text-foreground block">{category.name}</span>
                              <span className="text-[11px] text-muted-foreground">ID: {category.id.slice(0, 8)}</span>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          {hasSizeRange ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="secondary" className="font-mono font-bold text-xs bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200 border border-blue-200 dark:border-blue-900">
                                {rangeDisplay || "Custom Range"}
                              </Badge>
                              {sizesCount > 0 && (
                                <span className="text-[11px] text-muted-foreground">
                                  ({sizesCount} sizes)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              All Sizes (ሁሉንም)
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground">{category.description || "-"}</TableCell>

                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="outline" className="h-8 gap-1 px-2.5 text-xs" data-testid={`button-actions-category-${category.id}`}>
                                Actions
                                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuLabel className="text-xs text-muted-foreground truncate">
                                {category.name}
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleEdit(category)}
                                data-testid={`button-edit-category-${category.id}`}
                              >
                                <Pencil className="w-4 h-4 mr-2" /> Edit (አርትዕ)
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleDelete(category.id)}
                                className="text-destructive focus:text-destructive"
                                data-testid={`button-delete-category-${category.id}`}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Delete (አጥፋ)
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {DeleteAuthDialog}
    </div>
  );
}
