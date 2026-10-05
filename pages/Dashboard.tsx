import React, { useEffect, useState, useMemo } from "react";
import {
  Package, Store, Truck, Users, AlertCircle, DollarSign,
  ShoppingCart, TrendingUp, X, ChevronDown, ChevronUp, BarChart2,
  AlertTriangle, ArrowUpRight, ArrowDownRight, Clock, CheckCircle2, History
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ComposedChart, Line,
} from "recharts";
import { fmt } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAll, subscribeCollection, COLLECTIONS } from "@/lib/firestore";
import { computeStockBalances, StockBalance } from "@/lib/stockUtils";
import type {
  Product, Store as StoreType, Supplier, Customer,
  PosSale, EcommerceOrder, Category, PricingRecord, InventoryMovement
} from "@/lib/types";

type Period = "day" | "week" | "month";

import { toSafeDate, toSafeIsoDate, todayIsoDate, safeDateSort } from "@/lib/dateUtils";

interface ChartPoint {
  label: string;
  revenue: number;
  items: number;
}

function toDate(ts: any): Date | null {
  return toSafeDate(ts);
}

function aggregateSales(sales: PosSale[], period: Period): ChartPoint[] {
  const now = new Date();

  if (period === "week") {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const data: ChartPoint[] = dayNames.map(d => ({ label: d, revenue: 0, items: 0 }));
    for (const sale of sales) {
      const d = toDate(sale.createdAt || sale.voucherDate);
      if (d && d >= startOfWeek) {
        const idx = d.getDay();
        if (data[idx]) {
          data[idx].revenue += sale.totalAmount || 0;
          data[idx].items += (sale.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
        }
      }
    }
    return data;
  }

  if (period === "month") {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const data: ChartPoint[] = Array.from({ length: daysInMonth }, (_, i) => ({
      label: String(i + 1), revenue: 0, items: 0,
    }));
    for (const sale of sales) {
      const d = toDate(sale.createdAt || sale.voucherDate);
      if (d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        const dayIdx = d.getDate() - 1;
        if (data[dayIdx]) {
          data[dayIdx].revenue += sale.totalAmount || 0;
          data[dayIdx].items += (sale.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
        }
      }
    }
    return data;
  }

  // day — show 6am to 10pm
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const hours: ChartPoint[] = Array.from({ length: 24 }, (_, i) => ({
    label: i === 0 ? "12am" : i < 12 ? `${i}am` : i === 12 ? "12pm" : `${i - 12}pm`,
    revenue: 0, items: 0,
  }));
  for (const sale of sales) {
    const d = toDate(sale.createdAt || sale.voucherDate);
    if (d && d >= startOfToday) {
      const hr = d.getHours();
      if (hours[hr]) {
        hours[hr].revenue += sale.totalAmount || 0;
        hours[hr].items += (sale.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
      }
    }
  }
  return hours.slice(6, 23);
}

const fmtShort = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));

export default function Dashboard() {
  const [allSales, setAllSales] = useState<PosSale[]>([]);
  const [orders, setOrders] = useState<EcommerceOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([]);
  const [stockBalances, setStockBalances] = useState<Record<string, StockBalance>>({});
  const [movements, setMovements] = useState<InventoryMovement[]>([]);

  const [customersWithBalance, setCustomersWithBalance] = useState<Customer[]>([]);
  const [showBalancePopup, setShowBalancePopup] = useState(true);
  const [popupExpanded, setPopupExpanded] = useState(true);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<Period>("week");
  const [selectedStore, setSelectedStore] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");

  async function loadStock() {
    try {
      const balances = await computeStockBalances();
      setStockBalances(balances);
    } catch (err) {
      console.error("Dashboard stock computation error:", err);
    }
  }

  // Real-time Firestore Listeners
  useEffect(() => {
    setLoading(true);

    const unsubSales = subscribeCollection<PosSale>(COLLECTIONS.POS_SALES, (sales) => {
      setAllSales(sales.sort((a, b) => safeDateSort(a.createdAt || a.voucherDate, b.createdAt || b.voucherDate, "desc")));
      loadStock();
    });

    const unsubOrders = subscribeCollection<EcommerceOrder>(COLLECTIONS.ORDER_VOUCHERS, (ords) => {
      setOrders(ords.sort((a, b) => safeDateSort(a.createdAt, b.createdAt, "desc")));
    });

    const unsubProducts = subscribeCollection<Product>(COLLECTIONS.PRODUCTS, (prods) => {
      setProducts(prods);
      loadStock();
    });

    const unsubStores = subscribeCollection<StoreType>(COLLECTIONS.STORES, (sts) => {
      setStores(sts);
      loadStock();
    });

    const unsubSuppliers = subscribeCollection<Supplier>(COLLECTIONS.SUPPLIERS, (sups) => {
      setSuppliers(sups);
    });

    const unsubCustomers = subscribeCollection<Customer>(COLLECTIONS.CUSTOMERS, (custs) => {
      setCustomers(custs);
      setCustomersWithBalance(
        custs.filter(c => (c.totalBalance || 0) > 0)
          .sort((a, b) => (b.totalBalance || 0) - (a.totalBalance || 0))
      );
    });

    const unsubCategories = subscribeCollection<Category>(COLLECTIONS.CATEGORIES, (cats) => {
      setCategories(cats);
    });

    const unsubPricing = subscribeCollection<PricingRecord>(COLLECTIONS.PRICING, (prs) => {
      setPricing(prs);
    });

    const unsubMovements = subscribeCollection<InventoryMovement>(COLLECTIONS.INVENTORY_MOVEMENTS, (movs) => {
      setMovements(movs.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    });

    loadStock().finally(() => setLoading(false));

    return () => {
      unsubSales();
      unsubOrders();
      unsubProducts();
      unsubStores();
      unsubSuppliers();
      unsubCustomers();
      unsubCategories();
      unsubPricing();
      unsubMovements();
    };
  }, []);

  const productCatMap = useMemo(() => {
    const map: Record<string, string> = {};
    products.forEach(p => { if (p.categoryId) map[p.id] = p.categoryId; });
    return map;
  }, [products]);

  const filteredSales = useMemo(() => allSales.filter(sale => {
    if (selectedStore !== "all" && sale.storeId !== selectedStore) return false;
    if (selectedCategory !== "all") {
      const ok = sale.items?.some(item => productCatMap[item.productId] === selectedCategory);
      if (!ok) return false;
    }
    return true;
  }), [allSales, selectedStore, selectedCategory, productCatMap]);

  const chartData = useMemo(() => aggregateSales(filteredSales, period), [filteredSales, period]);

  // Key Metrics calculations
  const totalProducts = products.filter(p => !p.isVoided).length;
  const totalInventoryQty = Object.values(stockBalances).reduce((acc, b) => acc + Math.max(0, b.quantity), 0);

  const priceMap = useMemo(() => {
    const map: Record<string, { cost: number; price: number }> = {};
    (pricing || []).forEach(p => {
      if (p && p.productId) {
        map[p.productId] = { cost: p.unitCost || 0, price: p.sellingPrice || 0 };
      }
    });
    return map;
  }, [pricing]);

  // Inventory value (at selling price & cost)
  const totalInventoryValue = useMemo(() => {
    return Object.entries(stockBalances || {}).reduce((acc, [pid, bal]) => {
      const sp = priceMap[pid]?.price || 0;
      return acc + (Math.max(0, bal?.quantity || 0) * sp);
    }, 0);
  }, [stockBalances, priceMap]);

  // Total Sales & Today's Sales
  const todayStr = todayIsoDate();

  const totalSalesRevenue = useMemo(() => {
    return allSales.filter(s => s.status !== "voided").reduce((acc, s) => acc + (s.totalAmount || 0), 0);
  }, [allSales]);

  const todaySales = useMemo(() => {
    return allSales.filter(s => {
      if (s.status === "voided") return false;
      const d = toSafeIsoDate(s.createdAt || s.voucherDate);
      return d === todayStr;
    });
  }, [allSales, todayStr]);

  const todaySalesRevenue = todaySales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);

  // Total Orders & Today's Orders
  const totalOrdersCount = orders.length;
  const todayOrdersCount = orders.filter(o => {
    const d = toSafeIsoDate(o.createdAt);
    return d === todayStr;
  }).length;

  // Low stock & Out of stock lists
  const lowStockProducts = useMemo(() => {
    return products.filter(p => {
      if (p.isVoided) return false;
      const qty = stockBalances[p.id]?.quantity || 0;
      const minAlert = (p.minCartonAlert || 1) * (p.quantityPerCarton || 1);
      return qty > 0 && qty <= minAlert;
    });
  }, [products, stockBalances]);

  const outOfStockProducts = useMemo(() => {
    return products.filter(p => {
      if (p.isVoided) return false;
      const qty = stockBalances[p.id]?.quantity || 0;
      return qty <= 0;
    });
  }, [products, stockBalances]);

  // Top Selling Products ranking
  const topSellingProducts = useMemo(() => {
    const counts: Record<string, { productId: string; name: string; code: string; qty: number; revenue: number; photoUrl?: string }> = {};
    for (const sale of allSales.filter(s => s.status !== "voided")) {
      for (const it of sale.items || []) {
        if (!it.productId) continue;
        if (!counts[it.productId]) {
          const prodObj = products.find(p => p.id === it.productId);
          const photoUrl = prodObj?.photoUrl || prodObj?.photoUrls?.[0] || it.photoUrl || "";
          counts[it.productId] = {
            productId: it.productId,
            name: it.productName || prodObj?.name || "Product",
            code: it.productCode || prodObj?.code || "",
            qty: 0,
            revenue: 0,
            photoUrl,
          };
        }
        counts[it.productId].qty += (it.quantity || 0);
        counts[it.productId].revenue += (it.totalPrice || 0);
      }
    }
    return Object.values(counts).sort((a, b) => b.qty - a.qty).slice(0, 6);
  }, [allSales, products]);

  // Profit Summary (Estimated)
  const totalEstimatedProfit = useMemo(() => {
    let profit = 0;
    for (const sale of allSales.filter(s => s.status !== "voided")) {
      for (const it of sale.items || []) {
        const cost = priceMap[it.productId]?.cost || 0;
        const sp = it.adjustedPrice || it.sellingPrice || (it.totalPrice / (it.quantity || 1)) || 0;
        profit += ((sp - cost) * (it.quantity || 0));
      }
    }
    return profit;
  }, [allSales, priceMap]);

  const periodRevenue = useMemo(() => (chartData || []).reduce((s, d) => s + (d?.revenue || 0), 0), [chartData]);
  const periodLabel = period === "day" ? "Today" : period === "week" ? "This Week" : "This Month";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-28">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Executive Dashboard</h1>
        <p className="text-muted-foreground mt-1">Live enterprise metrics powered by Firebase Cloud Database</p>
      </div>

      {/* Primary KPI Metrics Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}><CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader><CardContent><Skeleton className="h-8 w-16" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Today's Sales</CardTitle>
              <DollarSign className="w-4 h-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{fmt(todaySalesRevenue)}</div>
              <p className="text-xs text-muted-foreground mt-1">{todaySales.length} transaction{todaySales.length !== 1 ? "s" : ""} today</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Total Sales</CardTitle>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{fmt(totalSalesRevenue)}</div>
              <p className="text-xs text-muted-foreground mt-1">Est. Gross Profit: {fmt(totalEstimatedProfit)}</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-indigo-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Inventory Units</CardTitle>
              <Package className="w-4 h-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalInventoryQty.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Value: {fmt(totalInventoryValue)}</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Orders (eCommerce)</CardTitle>
              <ShoppingCart className="w-4 h-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{todayOrdersCount} <span className="text-xs font-normal text-muted-foreground">today</span></div>
              <p className="text-xs text-muted-foreground mt-1">{totalOrdersCount} total orders in system</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Secondary KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Catalog Products</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{totalProducts} items</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Active Stores</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{stores.length} locations</div></CardContent>
        </Card>
        <Card className={lowStockProducts.length > 0 ? "border-amber-200 bg-amber-50/20" : ""}>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-amber-600 font-semibold">Low-Stock Alert</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold text-amber-700">{lowStockProducts.length} items</div></CardContent>
        </Card>
        <Card className={outOfStockProducts.length > 0 ? "border-red-200 bg-red-50/20" : ""}>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-red-600 font-semibold">Out-of-Stock</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold text-red-700">{outOfStockProducts.length} items</div></CardContent>
        </Card>
      </div>

      {/* Sales Analytics Chart */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold tracking-tight">Sales Trends & Analytics</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden bg-background">
              {(["day", "week", "month"] as Period[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {p === "day" ? "Today" : p === "week" ? "Week" : "Month"}
                </button>
              ))}
            </div>

            <Select value={selectedStore} onValueChange={setSelectedStore}>
              <SelectTrigger className="h-8 text-xs w-36 bg-background">
                <SelectValue placeholder="All Stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores</SelectItem>
                {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue & Items Sold — {periodLabel} ({fmt(periodRevenue)})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-60 w-full rounded-md" />
            ) : chartData.every(d => d.revenue === 0) ? (
              <div className="h-60 flex flex-col items-center justify-center text-muted-foreground gap-2">
                <BarChart2 className="w-8 h-8 opacity-30" />
                <p className="text-sm">No sales recorded for {periodLabel.toLowerCase()}</p>
              </div>
            ) : (
              <div className="w-full h-[260px] min-h-[260px]">
                <ResponsiveContainer width="100%" height={260} minWidth={100} minHeight={200}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tickFormatter={fmtShort} tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        name === "revenue" ? fmt(value) : (value ?? 0).toLocaleString(),
                        name === "revenue" ? "Revenue" : "Items Sold",
                      ]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    />
                    <Legend formatter={(v) => v === "revenue" ? "Revenue (ETB)" : "Items Sold"} wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="left" dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={48} name="revenue" />
                    <Line yAxisId="right" type="monotone" dataKey="items" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981", r: 3 }} name="items" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Grid: Top Selling Products & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Selling Products */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" /> Top Selling Products
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-sm">
              {topSellingProducts.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 shrink-0 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>

                    {/* Product Photo Thumbnail */}
                    <div className="w-10 h-10 shrink-0 rounded-md overflow-hidden bg-muted border border-border flex items-center justify-center">
                      {p.photoUrl ? (
                        <img
                          src={p.photoUrl}
                          alt={p.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <Package className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{p.code}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-foreground">{p.qty.toLocaleString()} sold</p>
                    <p className="text-xs text-muted-foreground">{fmt(p.revenue)}</p>
                  </div>
                </div>
              ))}
              {topSellingProducts.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No product sales recorded yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Low & Out of Stock Warnings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" /> Critical Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-sm max-h-[300px] overflow-y-auto">
              {[...outOfStockProducts, ...lowStockProducts].slice(0, 8).map(p => {
                const qty = stockBalances[p.id]?.quantity || 0;
                const isOut = qty <= 0;
                return (
                  <div key={p.id} className="flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">SKU: {p.code}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={isOut ? "destructive" : "outline"} className={!isOut ? "border-amber-500 text-amber-600 bg-amber-50" : ""}>
                        {isOut ? "Out of Stock" : `${qty} left (Min: ${(p.minCartonAlert || 1) * (p.quantityPerCarton || 1)})`}
                      </Badge>
                    </div>
                  </div>
                );
              })}
              {outOfStockProducts.length === 0 && lowStockProducts.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p>All catalog products are adequately stocked</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid: Recent Sales & Recent Inventory Movements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent POS Sales */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" /> Recent Sales
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-sm max-h-[320px] overflow-y-auto">
              {allSales.slice(0, 6).map(s => (
                <div key={s.id} className="flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">{s.voucherId}</span>
                      <span className="text-xs text-muted-foreground">· {s.storeName}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.customerName || "Walk-in Customer"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">{fmt(s.totalAmount)}</p>
                    <Badge variant="outline" className="text-[10px] capitalize">{s.paymentMethod}</Badge>
                  </div>
                </div>
              ))}
              {allSales.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No sales recorded yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Inventory Movements */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600" /> Recent Inventory Movements
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-sm max-h-[320px] overflow-y-auto">
              {movements.slice(0, 6).map(m => {
                const isPos = m.difference > 0;
                return (
                  <div key={m.id} className="flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="font-medium text-xs">{m.productName}</p>
                      <p className="text-[11px] text-muted-foreground">{m.reason || m.type} · {m.storeName}</p>
                    </div>
                    <div className="text-right">
                      <span className={`font-mono font-bold text-xs ${isPos ? "text-emerald-600" : "text-red-600"}`}>
                        {isPos ? `+${m.difference}` : m.difference} units
                      </span>
                      <p className="text-[10px] text-muted-foreground">{m.voucherDate || "Today"}</p>
                    </div>
                  </div>
                );
              })}
              {movements.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  No inventory movements recorded yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer Balance Bottom Notification */}
      {showBalancePopup && customersWithBalance.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <div className="pointer-events-auto w-full max-w-2xl mx-4 mb-0 rounded-t-2xl shadow-2xl border overflow-hidden bg-background">
            <div className="flex items-center justify-between px-4 py-3 bg-red-600 text-white">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span className="font-semibold text-sm">
                  {customersWithBalance.length} Customer{customersWithBalance.length !== 1 ? "s" : ""} with Outstanding Balance
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-1 rounded hover:bg-white/20 transition-colors" onClick={() => setPopupExpanded(e => !e)}>
                  {popupExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
                <button className="p-1 rounded hover:bg-white/20 transition-colors" onClick={() => setShowBalancePopup(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {popupExpanded && (
              <div className="max-h-52 overflow-y-auto divide-y">
                {customersWithBalance.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${i === 0 ? "bg-red-600" : i === 1 ? "bg-orange-500" : "bg-yellow-500"}`}>
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.phone || c.address || "—"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-red-600 text-sm">{fmt(c.totalBalance || 0)}</p>
                      <p className="text-xs text-muted-foreground">Paid: {fmt(c.totalPaid || 0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
