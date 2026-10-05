import { useState, useEffect, useRef } from "react";
import {
  ShoppingCart, X, Printer, Package, LogIn, Share2, Search, Star,
  Shield, Truck, ChevronRight, Minus, Plus, Megaphone, Bell,
  Zap, Heart, ArrowRight, CheckCircle2, Sparkles, CheckSquare,
  Square, Download, Copy, Images, Send, FileText, Check, Layers,
  ExternalLink, Eye, Camera, CheckCheck, Maximize2, Minimize2,
  ZoomIn, ZoomOut, RotateCcw, ChevronLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getAll, create, COLLECTIONS, generateVoucherId, generateSerialVoucherId, where, query, collection, getDocs } from "@/lib/firestore";
import { shareAsImage, shareAsPdf } from "@/lib/shareImage";
import { db } from "@/lib/firestore";
import { computeStockBalances } from "@/lib/stockUtils";
import { fmt } from "@/lib/currency";
import type { Product, PricingRecord, EcommerceOrder, Category, Promotion, AppSettings, Store } from "@/lib/types";
import { Link } from "wouter";
import { printElement } from "@/lib/printUtils";
import { BarcodeScannerButton } from "@/components/BarcodeScannerButton";

interface CartItem {
  product: Product;
  price: number;
  quantity: number;
  sellByCarton: boolean;
}

export default function Ecommerce() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showReceipt, setShowReceipt] = useState<EcommerceOrder | null>(null);
  const [quickView, setQuickView] = useState<Product | null>(null);
  const [isFullScreenQV, setIsFullScreenQV] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; idx: number; zoom: number } | null>(null);
  const [showPopup, setShowPopup] = useState<Promotion | null>(null);
  const [popupPromos, setPopupPromos] = useState<Promotion[]>([]);
  const [popupIdx, setPopupIdx] = useState(0);
  const [shopStockMap, setShopStockMap] = useState<Record<string, number>>({});
  const [shopOnlyStockMap, setShopOnlyStockMap] = useState<Record<string, number>>({});
  const [bannerIdx, setBannerIdx] = useState(0);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [checkoutForm, setCheckoutForm] = useState({ customerName: "", customerPhone: "", customerAddress: "" });
  const [placing, setPlacing] = useState(false);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"default" | "piece">("default");
  const receiptRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);

  // Multi-select & Photo Sharing state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingCollage, setSharingCollage] = useState(false);
  const [sharingPdfCollage, setSharingPdfCollage] = useState(false);
  const [sharingFiles, setSharingFiles] = useState(false);
  const [copiedCatalog, setCopiedCatalog] = useState(false);
  const [shareTab, setShareTab] = useState<"catalog" | "gallery">("catalog");
  const collageRef = useRef<HTMLDivElement>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [prods, prices, balanceMap, cats, promos, setts, stores] = await Promise.all([
        getAll<Product>(COLLECTIONS.PRODUCTS),
        getAll<PricingRecord>(COLLECTIONS.PRICING),
        computeStockBalances(),
        getAll<Category>(COLLECTIONS.CATEGORIES),
        getAll<Promotion>(COLLECTIONS.PROMOTIONS),
        getAll<AppSettings>(COLLECTIONS.APP_SETTINGS),
        getAll<Store>(COLLECTIONS.STORES),
      ]);
      if (setts.length > 0) setSettings(setts[0]);
      const sMap: Record<string, number> = {};
      for (const [pid, bal] of Object.entries(balanceMap)) sMap[pid] = bal.quantity;
      setStockMap(sMap);
      setProducts(prods.filter(p => !p.isVoided && (sMap[p.id] || 0) > 0));
      setPricing(prices);
      setCategories(cats);
      const activePromos = promos.filter(p => !p.isVoided && p.isActive);
      setPromotions(activePromos);
      const pPromos = activePromos.filter(p => p.showPopup);
      setPopupPromos(pPromos);
      if (pPromos.length > 0) setTimeout(() => { setPopupIdx(0); setShowPopup(pPromos[0]); }, 2000);
      const shopOnlyStores = stores.filter(s => s.level === "Shop");
      const shopAndBranchStores = stores.filter(s => s.level === "Shop" || s.level === "Branch");
      if (shopAndBranchStores.length > 0) {
        const allBalances = await Promise.all(shopAndBranchStores.map(s => computeStockBalances(s.id)));
        const ssMap: Record<string, number> = {};
        for (const bal of allBalances)
          for (const [pid, b] of Object.entries(bal)) ssMap[pid] = (ssMap[pid] || 0) + b.quantity;
        setShopStockMap(ssMap);

        // Shop-only map — used to decide if "By Piece" is available
        const shopOnlyIds = new Set(shopOnlyStores.map(s => s.id));
        const shopOnlyBalances = allBalances.filter((_, i) => shopOnlyIds.has(shopAndBranchStores[i].id));
        const soMap: Record<string, number> = {};
        for (const bal of shopOnlyBalances)
          for (const [pid, b] of Object.entries(bal)) soMap[pid] = (soMap[pid] || 0) + b.quantity;
        setShopOnlyStockMap(soMap);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setSelectedImageIdx(0); }, [quickView?.id]);
  useEffect(() => {
    const bp = promotions.filter(p => p.showBanner && p.photoUrl);
    if (bp.length <= 1) return;
    const id = setInterval(() => setBannerIdx(i => (i + 1) % bp.length), 15000);
    return () => clearInterval(id);
  }, [promotions]);
  useEffect(() => {
    if (popupPromos.length <= 1) return;
    const id = setInterval(() => setPopupIdx(i => {
      const next = (i + 1) % popupPromos.length;
      setShowPopup(popupPromos[next]);
      return next;
    }), 5000);
    return () => clearInterval(id);
  }, [popupPromos]);

  const PIECE_STEP = 6;
  function getPrice(pid: string) {
    const rec = pricing.find(p => p.productId === pid);
    if (!rec) return 0;
    return (rec.ecommercePiecePrice && rec.ecommercePiecePrice > 0) ? rec.ecommercePiecePrice : rec.sellingPrice;
  }
  function getStock(pid: string) { return stockMap[pid] || 0; }
  function getShopStock(pid: string) { return shopStockMap[pid] || 0; }
  function getQpc(p: Product) { return Math.max(1, p.quantityPerCarton || 1); }
  function actualUnits(item: CartItem) { return item.sellByCarton ? item.quantity * getQpc(item.product) : item.quantity; }
  function itemTotal(item: CartItem) { return item.price * actualUnits(item); }

  function addToCart(product: Product, byCarton = false) {
    const price = getPrice(product.id);
    if (price === 0) { toast({ title: "No price set for this product" }); return; }
    const stock = getStock(product.id);
    const qpc = getQpc(product);
    const step = byCarton ? 1 : PIECE_STEP;
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id && i.sellByCarton === byCarton);
      if (existing) {
        const newUnits = actualUnits(existing) + (byCarton ? qpc : step);
        if (newUnits > stock) { toast({ title: `Only ${byCarton ? Math.floor(stock / qpc) : stock} available` }); return prev; }
        return prev.map(i => i.product.id === product.id && i.sellByCarton === byCarton ? { ...i, quantity: i.quantity + step } : i);
      }
      const initQty = step;
      if (byCarton ? qpc > stock : initQty > stock) { toast({ title: `Only ${byCarton ? Math.floor(stock / qpc) : stock} available` }); return prev; }
      return [...prev, { product, price, quantity: initQty, sellByCarton: byCarton }];
    });
    toast({ title: "✓ Added to cart", description: product.name });
  }

  function updateQty(productId: string, byCarton: boolean, qty: number) {
    if (qty <= 0) { setCart(prev => prev.filter(i => !(i.product.id === productId && i.sellByCarton === byCarton))); return; }
    setCart(prev => prev.map(i => i.product.id === productId && i.sellByCarton === byCarton ? { ...i, quantity: qty } : i));
  }

  function toggleWishlist(pid: string) {
    setWishlist(prev => { const n = new Set(prev); n.has(pid) ? n.delete(pid) : n.add(pid); return n; });
  }

  function openQuickView(product: Product) {
    setSelectedImageIdx(0);
    setQuickView(product);
  }

  const total = cart.reduce((s, i) => s + itemTotal(i), 0);
  const cartCount = cart.reduce((s, i) => s + actualUnits(i), 0);

  async function findOrCreateCustomer(name: string, phone: string, address: string): Promise<string> {
    if (!name) return "";
    if (phone) {
      const snap = await getDocs(query(collection(db, COLLECTIONS.CUSTOMERS), where("phone", "==", phone)));
      if (!snap.empty) return snap.docs[0].id;
    }
    return create(COLLECTIONS.CUSTOMERS, { name, phone: phone || "", address: address || "", totalPaid: 0, totalBalance: 0, voucherId: generateVoucherId("CUST") });
  }

  async function handleCheckout() {
    if (!checkoutForm.customerName) { toast({ title: "Please enter your name", variant: "destructive" }); return; }
    setPlacing(true);
    try {
      const liveStock = await computeStockBalances();
      for (const item of cart) {
        const available = liveStock[item.product.id]?.quantity || 0;
        const units = actualUnits(item);
        if (units > available) {
          toast({ title: "Item no longer available", description: `"${item.product.name}" only has ${available} unit(s)`, variant: "destructive" });
          return;
        }
      }
      const customerId = await findOrCreateCustomer(checkoutForm.customerName, checkoutForm.customerPhone, checkoutForm.customerAddress);
      const orderId = await generateSerialVoucherId("ORD");
      const order: Omit<EcommerceOrder, "id"> = {
        orderVoucherId: orderId,
        customerId: customerId || "",
        customerName: checkoutForm.customerName,
        customerPhone: checkoutForm.customerPhone,
        customerAddress: checkoutForm.customerAddress || "",
        items: cart.map(i => ({
          productId: i.product.id, productName: i.product.name, productCode: i.product.code || "",
          photoUrl: i.product.photoUrl || "", price: i.price, quantity: actualUnits(i),
          sellByCarton: i.sellByCarton, cartonQty: i.sellByCarton ? i.quantity : 0, totalPrice: itemTotal(i),
        })),
        totalAmount: total,
        status: "pending",
      };
      await create(COLLECTIONS.ORDER_VOUCHERS, order as Record<string, unknown>);
      setCart([]); setShowCheckout(false); setShowCart(false);
      setShowReceipt({ ...order, id: orderId } as EcommerceOrder);
      toast({ title: "🎉 Order placed!", description: `Order ID: ${orderId}` });
    } finally { setPlacing(false); }
  }

  function handlePrint() {
    if (!receiptRef.current) return;
    printElement(receiptRef.current, "Order_Receipt");
  }
  async function handleShare() {
    if (!receiptRef.current) return;
    setSharing(true);
    const r = await shareAsImage(receiptRef.current, "ecommerce_receipt.png");
    if (r === "failed") toast({ title: "Share failed", variant: "destructive" });
    setSharing(false);
  }

  const baseFiltered = products.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !search || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.barcodeValue || "").toLowerCase().includes(q);
    const matchCat = selectedCategory === "all" || p.categoryId === selectedCategory;
    const hasShopStock = (shopStockMap[p.id] || 0) > 0;
    return matchSearch && matchCat && hasShopStock;
  });

  const filtered = [...baseFiltered].sort((a, b) => {
    const aShopOnly = shopOnlyStockMap[a.id] || 0;
    const bShopOnly = shopOnlyStockMap[b.id] || 0;
    if (sortBy === "piece") {
      // sort by piece count descending when toggle is active
      const aShop = shopStockMap[a.id] || 0;
      const bShop = shopStockMap[b.id] || 0;
      return bShop - aShop;
    }
    // default: Shop-level items (with shop-only stock) come first
    if (aShopOnly > 0 && bShopOnly <= 0) return -1;
    if (bShopOnly > 0 && aShopOnly <= 0) return 1;
    return 0;
  });

  const usedCategoryIds = new Set(products.map(p => p.categoryId).filter(Boolean));
  const visibleCategories = categories.filter(c => usedCategoryIds.has(c.id));

  const bannerPromos = promotions.filter(p => p.showBanner && (p.photoUrl || (p.showVideo && p.videoUrl)));
  const bannerPromo = bannerPromos.length > 0 ? bannerPromos[bannerIdx % bannerPromos.length] : null;
  const storeName = settings?.ecommerceName || "NexusStock Store";
  const tagline = settings?.ecommerceTagline || "Your trusted supply partner";

  const quickViewPrice = quickView ? getPrice(quickView.id) : 0;
  const quickViewStock = quickView ? getStock(quickView.id) : 0;
  const quickViewQpc = quickView ? getQpc(quickView) : 1;
  const cartPiece = quickView ? cart.find(i => i.product.id === quickView.id && !i.sellByCarton) : undefined;
  const cartCarton = quickView ? cart.find(i => i.product.id === quickView.id && i.sellByCarton) : undefined;
  const canBuyPieceQV = quickView ? (shopOnlyStockMap[quickView.id] || 0) > 0 : false;

  const highlightedIds = new Set(promotions.filter(p => p.showHighlight).flatMap(p => p.productIds));
  const featuredProducts = products.filter(p => highlightedIds.has(p.id)).slice(0, 6);

  function toggleSelectProduct(pid: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedProductIds(new Set(filtered.map(p => p.id)));
  }

  function clearSelectedProducts() {
    setSelectedProductIds(new Set());
  }

  const selectedProducts = products.filter(p => selectedProductIds.has(p.id));

  function generateCatalogText(items: Product[]) {
    const header = `🛍️ *${storeName}*\n${tagline ? `_${tagline}_\n` : ""}✨ *Featured Products Catalog (${items.length} items)*\n──────────────────────\n\n`;
    const list = items.map((p, idx) => {
      const price = getPrice(p.id);
      const qpc = getQpc(p);
      const priceStr = price > 0 ? `${fmt(price)}/pc` : "Price on request";
      const ctnStr = qpc > 1 && price > 0 ? ` · ${fmt(price * qpc)}/ctn (${qpc} pcs)` : "";
      const photo = p.photoUrl ? `\n📷 Photo: ${p.photoUrl}` : "";
      return `${idx + 1}. *${p.name}* [Code: \`${p.code}\`]\n   💰 ${priceStr}${ctnStr}${photo}`;
    }).join("\n\n");
    const footer = `\n\n──────────────────────\n📞 Contact us to place your order!`;
    return `${header}${list}${footer}`;
  }

  async function handleShareCollageImage() {
    if (!collageRef.current || selectedProducts.length === 0) return;
    setSharingCollage(true);
    try {
      const filename = `ecommerce_catalog_${selectedProducts.length}_items.png`;
      const res = await shareAsImage(collageRef.current, filename);
      if (res === "shared") toast({ title: "✓ Product showcase image shared" });
      else if (res === "downloaded") toast({ title: "Product showcase image downloaded" });
      else toast({ title: "Image generated successfully" });
    } catch (err) {
      toast({ title: "Failed to generate catalog image", variant: "destructive" });
    } finally {
      setSharingCollage(false);
    }
  }

  async function handleShareCollagePdf() {
    if (!collageRef.current || selectedProducts.length === 0) return;
    setSharingPdfCollage(true);
    try {
      const filename = `ecommerce_catalog_${selectedProducts.length}_items.pdf`;
      const res = await shareAsPdf(collageRef.current, filename);
      if (res === "shared") toast({ title: "✓ Product catalog PDF shared" });
      else if (res === "downloaded") toast({ title: "Product catalog PDF downloaded" });
      else toast({ title: "PDF export completed" });
    } catch (err) {
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    } finally {
      setSharingPdfCollage(false);
    }
  }

  async function handleSharePhotoFilesDirectly() {
    if (selectedProducts.length === 0) return;
    setSharingFiles(true);
    try {
      const files: File[] = [];
      for (let i = 0; i < selectedProducts.length; i++) {
        const p = selectedProducts[i];
        const photoUrl = p.photoUrl || (p.photoUrls && p.photoUrls[0]);
        if (photoUrl) {
          try {
            const res = await fetch(photoUrl, { mode: "cors" });
            const blob = await res.blob();
            const ext = blob.type.includes("jpeg") || blob.type.includes("jpg") ? "jpg" : "png";
            const filename = `${p.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_${p.code || i + 1}.${ext}`;
            files.push(new File([blob], filename, { type: blob.type || "image/png" }));
          } catch (e) {
            console.warn("Could not fetch photo for", p.name, e);
          }
        }
      }

      const catalogText = generateCatalogText(selectedProducts);

      if (files.length > 0 && typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({
          title: `${storeName} — Selected Products`,
          text: catalogText,
          files: files,
        });
        toast({ title: "✓ Photos shared to app successfully" });
      } else if (collageRef.current) {
        await handleShareCollageImage();
      } else {
        navigator.clipboard.writeText(catalogText);
        toast({ title: "Product list copied to clipboard" });
      }
    } catch (err) {
      console.warn("Direct file share cancelled or unsupported", err);
    } finally {
      setSharingFiles(false);
    }
  }

  function handleShareTelegram() {
    const text = generateCatalogText(selectedProducts);
    const url = `https://t.me/share/url?url=${encodeURIComponent(window.location.origin + "/ecommerce")}&text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  function handleShareWhatsApp() {
    const text = generateCatalogText(selectedProducts);
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  function handleCopyCatalogText() {
    const text = generateCatalogText(selectedProducts);
    navigator.clipboard.writeText(text);
    setCopiedCatalog(true);
    toast({ title: "✓ Catalog text copied to clipboard" });
    setTimeout(() => setCopiedCatalog(false), 2500);
  }

  function handleDownloadSingleImage(url: string, name: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.jpg`;
    a.target = "_blank";
    a.click();
    toast({ title: "Downloading image..." });
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* ───── HEADER ───── */}
      <header className="sticky top-0 z-40" style={{ background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" }}>
        {/* Subtle shimmer overlay */}
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.15) 0%, transparent 60%), radial-gradient(circle at 80% 50%, rgba(168,85,247,0.2) 0%, transparent 60%)" }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          {/* Logo & Name */}
          <div className="flex items-center gap-2.5 flex-shrink-0 mr-2">
            {settings?.ecommerceLogo
              ? <img src={settings.ecommerceLogo} alt="logo" className="w-9 h-9 rounded-xl object-contain ring-2 ring-white/20" />
              : <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                  <Sparkles className="w-5 h-5 text-white" />
                </div>}
            <span className="text-white font-bold text-base hidden sm:block tracking-tight">{storeName}</span>
          </div>

          {/* Search Bar — scanner icon embedded inside on the right */}
          <div className="flex-1 max-w-xl">
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none z-10" />
              <input
                className="w-full pl-10 pr-11 py-2 rounded-full text-sm text-white placeholder-white/40 outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
                onFocus={e => (e.target.style.background = "rgba(255,255,255,0.14)")}
                onBlur={e => (e.target.style.background = "rgba(255,255,255,0.08)")}
                placeholder="Search products or scan barcode…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && filtered.length === 1) setQuickView(filtered[0]); }}
                data-testid="input-search-ecommerce"
              />
              {/* Scanner button sitting inside the right edge of the search bar */}
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
                <BarcodeScannerButton
                  onScan={val => {
                    const exact = products.find(p =>
                      (p.barcodeValue || "").toLowerCase() === val.toLowerCase() ||
                      p.code.toLowerCase() === val.toLowerCase()
                    );
                    if (exact) setQuickView(exact); else setSearch(val);
                  }}
                />
              </div>
            </div>
          </div>

          {/* Cart + Login */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowCart(true)}
              className="relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95"
              style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
              data-testid="button-cart"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Cart</span>
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white text-red-500 text-xs font-extrabold rounded-full flex items-center justify-center shadow-md">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </button>
            <Link href="/login">
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-all" data-testid="button-sign-in">
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Sign In</span>
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* ───── HERO ───── */}
      <section
        className="relative overflow-hidden text-white"
        style={bannerPromo && bannerPromo.photoUrl && !(bannerPromo.showVideo && bannerPromo.videoUrl)
          ? { backgroundImage: `linear-gradient(rgba(15,12,41,0.7),rgba(48,43,99,0.7)), url(${bannerPromo.photoUrl})`, backgroundSize: "cover", backgroundPosition: "center", transition: "background-image 0.8s" }
          : { background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }
        }
      >
        {/* Video banner overlay */}
        {bannerPromo && bannerPromo.showVideo && bannerPromo.videoUrl && (
          <video
            key={bannerPromo.id}
            src={bannerPromo.videoUrl}
            autoPlay
            muted
            loop
            className="absolute inset-0 w-full h-full object-cover opacity-50 pointer-events-none"
          />
        )}
        {/* Decorative blobs */}
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle, #7c3aed, transparent)", transform: "translate(30%, -30%)" }} />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle, #f59e0b, transparent)", transform: "translate(-30%, 30%)" }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
            <div className="max-w-lg">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4"
                style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24" }}>
                <Zap className="w-3 h-3" />
                Live Inventory · Only In-Stock Items
              </div>
              <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight mb-3 tracking-tight">
                {storeName}
              </h1>
              <p className="text-white/60 text-sm sm:text-base mb-6 leading-relaxed">{tagline}</p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
                {[{ icon: Shield, label: "Secure Orders" }, { icon: Truck, label: "Fast Delivery" }, { icon: Star, label: "Quality Products" }].map(({ icon: Icon, label }) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-amber-400" /> {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Stats card */}
            <div className="flex-shrink-0">
              <div className="rounded-2xl p-6 text-center min-w-[140px]"
                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}>
                <div className="text-5xl font-extrabold text-white mb-1" style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  {products.length}
                </div>
                <div className="text-white/50 text-xs font-medium uppercase tracking-wider">Products in Stock</div>
              </div>
              {/* Banner dots */}
              {bannerPromos.length > 1 && (
                <div className="flex gap-1.5 justify-center mt-3">
                  {bannerPromos.map((_, i) => (
                    <button key={i} onClick={() => setBannerIdx(i)}
                      className={`rounded-full transition-all ${i === bannerIdx % bannerPromos.length ? "w-5 h-2 bg-amber-400" : "w-2 h-2 bg-white/30 hover:bg-white/60"}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ───── CATEGORY PILLS ───── */}
      {visibleCategories.length > 0 && (
        <div className="bg-white border-b shadow-sm sticky top-16 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex gap-2 overflow-x-auto py-3 scrollbar-none">
              {[{ id: "all", name: "All Products" }, ...visibleCategories].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap"
                  style={selectedCategory === cat.id
                    ? { background: "linear-gradient(135deg, #302b63, #7c3aed)", color: "white", boxShadow: "0 2px 8px rgba(124,58,237,0.35)" }
                    : { background: "#f1f5f9", color: "#64748b" }
                  }
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ───── FEATURED SECTION ───── */}
      {!loading && !search && featuredProducts.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}>
                <Star className="w-4 h-4 text-white fill-white" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Featured Products</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {featuredProducts.map(p => {
              const price = getPrice(p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => setQuickView(p)}
                  className="group cursor-pointer rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 relative"
                  style={{ border: "1.5px solid rgba(245,158,11,0.4)" }}
                >
                  <div className="absolute top-2 left-2 z-10">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white flex items-center gap-0.5"
                      style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}>
                      <Star className="w-2 h-2 fill-white" /> HOT
                    </span>
                  </div>
                  <div className="aspect-square overflow-hidden bg-slate-50">
                    {p.photoUrl
                      ? <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      : <div className="w-full h-full flex items-center justify-center"><Package className="w-8 h-8 text-slate-200" /></div>}
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] font-semibold text-slate-800 line-clamp-2 mb-1 leading-tight">{p.name}</p>
                    {price > 0 && <p className="text-[11px] font-bold" style={{ color: "#7c3aed" }}>{fmt(price)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ───── PRODUCT GRID ───── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          {search ? (
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-800">{filtered.length}</span> result{filtered.length !== 1 ? "s" : ""} for "<span className="font-semibold text-slate-800">{search}</span>"
              <button onClick={() => setSearch("")} className="ml-3 text-violet-600 hover:underline text-xs">Clear</button>
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-700">All Products</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">{filtered.length}</span>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {/* Multi-Select & Share Photos Toggle Button */}
            <button
              onClick={() => {
                if (selectMode && selectedProductIds.size === 0) {
                  setSelectMode(false);
                } else if (!selectMode) {
                  setSelectMode(true);
                } else {
                  setSelectMode(false);
                  clearSelectedProducts();
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all shadow-sm"
              style={selectMode || selectedProductIds.size > 0
                ? { background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "white", boxShadow: "0 2px 10px rgba(124,58,237,0.35)" }
                : { background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }
              }
              title="Select any products and share their photos"
              data-testid="button-toggle-photo-select"
            >
              <Images className="w-4 h-4" />
              <span>{selectMode ? "Exit Select Mode" : "Select & Share Photos (ፎቶ አጋራ)"}</span>
              {selectedProductIds.size > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-amber-400 text-slate-900 font-extrabold">
                  {selectedProductIds.size}
                </span>
              )}
            </button>

            <button
              onClick={() => setSortBy(s => s === "piece" ? "default" : "piece")}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all"
              style={sortBy === "piece"
                ? { background: "linear-gradient(135deg, #302b63, #7c3aed)", color: "white", boxShadow: "0 2px 8px rgba(124,58,237,0.35)" }
                : { background: "#f1f5f9", color: "#64748b" }
              }
              title="Sort products by piece availability"
            >
              <ShoppingCart className="w-4 h-4" />
              Sort by Piece
              {sortBy === "piece" && <span className="ml-1 text-xs opacity-80">✓</span>}
            </button>
          </div>
        </div>

        {/* Selection Toolbar Banner when in Select Mode or has selections */}
        {(selectMode || selectedProductIds.size > 0) && (
          <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {selectedProductIds.size === 0
                    ? "Select products to share photos & catalog"
                    : `${selectedProductIds.size} product${selectedProductIds.size > 1 ? "s" : ""} selected for photo sharing`}
                </h4>
                <p className="text-xs text-slate-500">
                  Click on any product to select or deselect. Then click "Share Selected Photos".
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs bg-white hover:bg-slate-50"
                onClick={selectAllFiltered}
              >
                <CheckSquare className="w-3.5 h-3.5 mr-1.5 text-violet-600" /> Select All ({filtered.length})
              </Button>
              {selectedProductIds.size > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs bg-white text-slate-600 hover:text-red-500"
                  onClick={clearSelectedProducts}
                >
                  <X className="w-3.5 h-3.5 mr-1" /> Clear ({selectedProductIds.size})
                </Button>
              )}
              <Button
                size="sm"
                disabled={selectedProductIds.size === 0}
                onClick={() => setShowShareModal(true)}
                className="rounded-xl text-xs font-bold text-white shadow-md hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                data-testid="button-open-photo-share-modal"
              >
                <Share2 className="w-3.5 h-3.5 mr-1.5" />
                Share Photos ({selectedProductIds.size})
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <Skeleton className="h-44 w-full rounded-none" />
                <div className="p-3 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-8 w-full" /></div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 bg-slate-100">
              <Package className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">No products found</h3>
            <p className="text-slate-400 text-sm">{search ? `No results for "${search}"` : "Check back soon for new arrivals."}</p>
            {search && <Button variant="outline" className="mt-5" onClick={() => setSearch("")}>Clear Search</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map(p => {
              const price = getPrice(p.id);
              const stock = getStock(p.id);
              const shopStock = getShopStock(p.id);
              const qpc = getQpc(p);
              const pieceInCart = cart.find(i => i.product.id === p.id && !i.sellByCarton);
              const cartonInCart = cart.find(i => i.product.id === p.id && i.sellByCarton);
              const hasCarton = qpc > 1;
              const canBuyPiece = (shopOnlyStockMap[p.id] || 0) > 0;
              const inWishlist = wishlist.has(p.id);
              const isLowStock = stock <= 5;
              const isSelected = selectedProductIds.has(p.id);

              return (
                <div key={p.id}
                  className={`group bg-white rounded-2xl overflow-hidden transition-all duration-300 flex flex-col relative ${
                    isSelected
                      ? "ring-2 ring-violet-600 shadow-lg scale-[1.01] bg-violet-50/10"
                      : "shadow-sm hover:shadow-xl hover:-translate-y-0.5"
                  }`}
                  data-testid={`card-ecom-product-${p.id}`}
                  style={{ border: isSelected ? "1px solid rgba(124,58,237,0.4)" : "1px solid rgba(0,0,0,0.06)" }}
                  onClick={selectMode ? () => toggleSelectProduct(p.id) : undefined}
                >
                  {/* Image & Quick Select Action */}
                  <div
                    className="relative overflow-hidden bg-slate-50 cursor-pointer aspect-square"
                    onClick={() => {
                      if (selectMode) toggleSelectProduct(p.id);
                      else openQuickView(p);
                    }}
                  >
                    {p.photoUrl
                      ? <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      : <div className="w-full h-full flex items-center justify-center"><Package className="w-12 h-12 text-slate-200" /></div>}

                    {/* Stock badge */}
                    <div className="absolute top-2 left-2 pointer-events-none">
                      {isLowStock
                        ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm" style={{ background: "linear-gradient(135deg, #ef4444, #f97316)" }}>Only {stock} left</span>
                        : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shadow-sm" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>In Stock</span>}
                    </div>

                    {/* Multi-Select Checkbox in Corner */}
                    <button
                      type="button"
                      onClick={e => toggleSelectProduct(p.id, e)}
                      title={isSelected ? "Unselect product" : "Select product for photo sharing"}
                      className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-all ${
                        isSelected
                          ? "bg-violet-600 text-white ring-2 ring-white scale-110 opacity-100"
                          : selectMode
                            ? "bg-white/90 text-slate-400 border border-slate-300 opacity-100 hover:scale-110 hover:border-violet-500 hover:text-violet-600"
                            : "bg-white/80 text-slate-400 border border-slate-200 opacity-0 group-hover:opacity-100 hover:scale-110 hover:border-violet-500 hover:text-violet-600"
                      }`}
                    >
                      {isSelected ? <Check className="w-4 h-4 stroke-[3]" /> : <Square className="w-3.5 h-3.5" />}
                    </button>

                    {/* Wishlist button (shifted down if checkbox is visible) */}
                    {!selectMode && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleWishlist(p.id); }}
                        className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        <Heart className={`w-3.5 h-3.5 ${inWishlist ? "fill-red-500 text-red-500" : "text-slate-400"}`} />
                      </button>
                    )}

                    {/* Quick view overlay */}
                    {!selectMode && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-end justify-center pb-3 pointer-events-none">
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full">Quick View</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3 flex-1 flex flex-col">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-mono text-slate-400 font-medium">#{p.code}</span>
                      {p.categoryName && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 truncate max-w-[90px]">
                          {p.categoryName}
                        </span>
                      )}
                    </div>

                    <h3
                      className="text-sm font-semibold text-slate-800 line-clamp-2 mb-1 cursor-pointer leading-snug"
                      style={{ minHeight: "2.5rem" }}
                      onClick={() => {
                        if (selectMode) toggleSelectProduct(p.id);
                        else openQuickView(p);
                      }}
                    >{p.name}</h3>

                    {/* Price */}
                    <div className="mb-2 mt-auto">
                      {price > 0 ? (
                        <>
                          <span className="text-sm font-extrabold" style={{ color: "#7c3aed" }}>{fmt(price)}</span>
                          <span className="text-[10px] text-slate-400 ml-1">/pc</span>
                          {hasCarton && <div className="text-[10px] text-amber-600 font-semibold">{fmt(price * qpc)}<span className="text-slate-400 font-normal"> /ctn</span></div>}
                        </>
                      ) : <span className="text-xs text-slate-400">Price on request</span>}
                    </div>

                    {/* Buttons */}
                    {price > 0 && !selectMode && (
                      <div className="space-y-1.5">
                        {/* Piece */}
                        {canBuyPiece && (pieceInCart ? (
                          <div className="flex items-center justify-between rounded-xl px-2 py-1" style={{ background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)" }}>
                            <button onClick={() => updateQty(p.id, false, pieceInCart.quantity - PIECE_STEP)} className="w-5 h-5 rounded-lg flex items-center justify-center" style={{ color: "#7c3aed" }}><Minus className="w-3 h-3" /></button>
                            <span className="text-xs font-bold" style={{ color: "#7c3aed" }}>{pieceInCart.quantity} pc</span>
                            <button onClick={() => { if (actualUnits(pieceInCart) + PIECE_STEP <= stock) updateQty(p.id, false, pieceInCart.quantity + PIECE_STEP); }} disabled={actualUnits(pieceInCart) + PIECE_STEP > stock} className="w-5 h-5 rounded-lg flex items-center justify-center disabled:opacity-30" style={{ color: "#7c3aed" }}><Plus className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(p, false)}
                            className="w-full py-1.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95 flex items-center justify-center gap-1"
                            style={{ background: "linear-gradient(135deg, #302b63, #7c3aed)" }}
                          >
                            <ShoppingCart className="w-3 h-3" /> By Piece ({PIECE_STEP}+)
                          </button>
                        ))}
                        {/* Carton */}
                        {hasCarton && (cartonInCart ? (
                          <div className="flex items-center justify-between rounded-xl px-2 py-1 bg-amber-50" style={{ border: "1px solid rgba(245,158,11,0.35)" }}>
                            <button onClick={() => updateQty(p.id, true, cartonInCart.quantity - 1)} className="w-5 h-5 rounded-lg flex items-center justify-center text-amber-600"><Minus className="w-3 h-3" /></button>
                            <span className="text-xs font-bold text-amber-700">{cartonInCart.quantity} ctn</span>
                            <button onClick={() => { if (actualUnits(cartonInCart) + qpc <= stock) updateQty(p.id, true, cartonInCart.quantity + 1); }} disabled={actualUnits(cartonInCart) + qpc > stock} className="w-5 h-5 rounded-lg flex items-center justify-center text-amber-600 disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(p, true)}
                            className="w-full py-1.5 rounded-xl text-xs font-bold transition-all hover:opacity-90 active:scale-95"
                            style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#78350f" }}
                          >
                            By Carton ({qpc} pcs)
                          </button>
                        ))}
                      </div>
                    )}

                    {selectMode && (
                      <button
                        onClick={e => toggleSelectProduct(p.id, e)}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? "bg-violet-600 text-white shadow-sm"
                            : "bg-slate-100 text-slate-700 hover:bg-violet-50 hover:text-violet-600"
                        }`}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5 stroke-[3]" /> Selected
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" /> Select for Share
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ───── TRUST BAR ───── */}
      {!loading && filtered.length > 0 && (
        <div className="border-t bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { icon: Shield, label: "Secure Ordering", desc: "Your details are safe", color: "#7c3aed" },
              { icon: Truck, label: "Fast Delivery", desc: "Quick order processing", color: "#2563eb" },
              { icon: Star, label: "Quality Assured", desc: "Verified products only", color: "#d97706" },
              { icon: Package, label: "Live Inventory", desc: "Only in-stock items", color: "#059669" },
            ].map(({ icon: Icon, label, desc, color }) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: `${color}15` }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
                <p className="text-sm font-bold text-slate-800">{label}</p>
                <p className="text-xs text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ───── FOOTER ───── */}
      <footer style={{ background: "linear-gradient(135deg, #0f0c29, #302b63)" }} className="text-white/60 py-8 mt-2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-sm">
          {settings?.ecommerceFooterText || `© ${new Date().getFullYear()} ${storeName}. All rights reserved.`}
        </div>
      </footer>

      {/* ───── QUICK VIEW / FULL SCREEN PRODUCT MODAL ───── */}
      <Dialog open={!!quickView} onOpenChange={(open) => { if (!open) { setQuickView(null); setIsFullScreenQV(false); } }}>
        <DialogContent
          className={`p-0 bg-white transition-all duration-200 overflow-y-auto ${
            isFullScreenQV
              ? "fixed inset-0 w-screen h-screen max-w-none max-h-none rounded-none top-0 left-0 translate-x-0 translate-y-0 z-50 border-0 m-0"
              : "fixed inset-0 sm:inset-auto sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] w-full h-full sm:h-auto sm:max-h-[92vh] max-w-full sm:max-w-4xl rounded-none sm:rounded-3xl border-0 sm:border shadow-2xl top-0 left-0 translate-x-0 translate-y-0 z-50"
          }`}
        >
          {quickView && (() => {
            const allImages = [quickView.photoUrl, ...(quickView.photoUrls || [])].filter(Boolean) as string[];
            const mainImg = allImages[selectedImageIdx] || null;
            const thumbs = allImages.slice(0, 12);
            const isSelected = (i: number) => selectedImageIdx === i;
            const thumbStyle = (i: number): React.CSSProperties => ({
              border: isSelected(i) ? "2.5px solid #7c3aed" : "2px solid #e2e8f0",
              boxShadow: isSelected(i) ? "0 0 0 1px #7c3aed, 0 2px 6px rgba(124,58,237,0.2)" : "0 1px 3px rgba(0,0,0,0.06)",
              outline: "none", borderRadius: 12, overflow: "hidden", flexShrink: 0, cursor: "pointer",
            });
            return (
              <div className="flex flex-col min-h-full">
                {/* ══ TOP BAR WITH FULLSCREEN & CLOSE CONTROLS ══ */}
                <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md px-4 py-3 border-b flex items-center justify-between gap-2 shadow-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                      #{quickView.code || "PRODUCT"}
                    </span>
                    {quickView.categoryName && (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 font-medium truncate max-w-[140px]">
                        {quickView.categoryName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* Full Screen Toggle Button */}
                    <button
                      type="button"
                      onClick={() => setIsFullScreenQV(prev => !prev)}
                      title={isFullScreenQV ? "Exit Full Screen" : "Fill Full Screen"}
                      className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors"
                    >
                      {isFullScreenQV ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                    {/* Wishlist Button */}
                    <button
                      type="button"
                      onClick={() => toggleWishlist(quickView.id)}
                      title={wishlist.has(quickView.id) ? "In Wishlist" : "Add to Wishlist"}
                      className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
                    >
                      <Heart className={`w-4 h-4 ${wishlist.has(quickView.id) ? "fill-red-500 text-red-500" : "text-slate-500"}`} />
                    </button>
                    {/* Close Button */}
                    <button
                      type="button"
                      onClick={() => { setQuickView(null); setIsFullScreenQV(false); }}
                      title="Close Product View"
                      className="w-9 h-9 rounded-xl bg-slate-900 text-white hover:bg-slate-800 flex items-center justify-center transition-colors ml-1"
                    >
                      <X className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row flex-1">
                  {/* ══ PHOTO GALLERY SECTION ══ */}
                  <div className="sm:w-[50%] flex-shrink-0 flex flex-col bg-slate-50/70 border-b sm:border-b-0 sm:border-r border-slate-200">
                    {/* Main High-Impact Photo Container */}
                    <div
                      className="relative w-full h-[45vh] min-h-[290px] sm:min-h-[420px] sm:h-full bg-slate-100/90 flex items-center justify-center overflow-hidden cursor-zoom-in group select-none"
                      onClick={() => {
                        if (allImages.length > 0) {
                          setLightbox({ urls: allImages, idx: selectedImageIdx, zoom: 1 });
                        }
                      }}
                    >
                      {mainImg ? (
                        <img
                          src={mainImg}
                          alt={quickView.name}
                          className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-300 p-8 text-center">
                          <Package className="w-20 h-20 text-slate-300 mb-2 stroke-1" />
                          <span className="text-xs text-slate-400 font-medium">No photo available</span>
                        </div>
                      )}

                      {/* Stock Badge Overlay */}
                      <span
                        className="absolute top-3 left-3 text-xs font-bold px-3 py-1 rounded-full backdrop-blur-md shadow-sm z-10"
                        style={quickViewStock <= 5
                          ? { background: "rgba(239,68,68,0.9)", color: "#fff" }
                          : { background: "rgba(16,185,129,0.9)", color: "#fff" }}
                      >
                        {quickViewStock <= 5 ? `Only ${quickViewStock} left in stock` : `${quickViewStock} units in stock`}
                      </span>

                      {/* Tap to View Full Screen Photo Badge */}
                      {mainImg && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLightbox({ urls: allImages, idx: selectedImageIdx, zoom: 1 });
                          }}
                          className="absolute bottom-3 right-3 flex items-center gap-1.5 text-xs font-bold text-white bg-slate-950/80 hover:bg-slate-900 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg transition-transform active:scale-95 z-10"
                        >
                          <ZoomIn className="w-3.5 h-3.5" /> Full Photo Zoom
                        </button>
                      )}

                      {/* Photo counter if multiple */}
                      {allImages.length > 1 && (
                        <span className="absolute bottom-3 left-3 text-[11px] font-semibold text-white/90 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full z-10">
                          {selectedImageIdx + 1} / {allImages.length}
                        </span>
                      )}
                    </div>

                    {/* Thumbnail Strip */}
                    {thumbs.length > 1 && (
                      <div className="flex gap-2.5 p-3 bg-white border-t border-slate-200 overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
                        {thumbs.map((url, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedImageIdx(i)}
                            style={{ ...thumbStyle(i), width: 56, height: 56 }}
                            className="transition-transform hover:scale-105 active:scale-95 bg-slate-100 flex-shrink-0"
                          >
                            <img src={url} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ══ PRODUCT DETAILS & ACTIONS COLUMN ══ */}
                  <div className="flex-1 flex flex-col p-5 sm:p-7 justify-between">
                    <div>
                      {/* Product Title */}
                      <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-1 leading-snug tracking-tight">
                        {quickView.name}
                      </h1>
                      <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold text-slate-500 mb-4">
                        <span className="font-mono">Item #{quickView.code}</span>
                        {quickView.barcodeValue && (
                          <span className="font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                            Barcode: {quickView.barcodeValue}
                          </span>
                        )}
                      </div>

                      {/* Description Box */}
                      {quickView.description && (
                        <div className="mb-5 p-3.5 rounded-2xl bg-slate-100/80 border border-slate-200/80">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Details & Specifications</h4>
                          <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-line">
                            {quickView.description}
                          </p>
                        </div>
                      )}

                      {/* Pricing Block */}
                      {quickViewPrice > 0 ? (
                        <div className="mb-6 p-4 rounded-2xl bg-violet-50/60 border border-violet-100">
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-black text-violet-700 tracking-tight">
                              {fmt(quickViewPrice)}
                            </span>
                            <span className="text-sm font-bold text-violet-500 uppercase">/ piece</span>
                          </div>
                          {quickViewQpc > 1 && (
                            <div className="mt-1.5 text-sm font-bold text-amber-700 flex items-center gap-1.5">
                              <span>Carton Price: {fmt(quickViewPrice * quickViewQpc)}</span>
                              <span className="text-xs font-normal text-amber-600 bg-amber-100/80 px-2 py-0.5 rounded-md">
                                {quickViewQpc} pcs per carton
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mb-6 p-4 rounded-2xl bg-slate-100 border border-slate-200 text-slate-500 font-semibold text-sm">
                          Price not set for this product
                        </div>
                      )}
                    </div>

                    {/* Quantity Selector and Action Buttons */}
                    {quickViewPrice > 0 && (
                      <div className="space-y-3 pt-2">
                        {quickViewQpc > 1 && canBuyPieceQV ? (
                          <div className="flex flex-col sm:flex-row gap-3">
                            {/* Buy by Carton */}
                            {cartCarton ? (
                              <div className="flex items-center gap-2 flex-1 rounded-2xl px-4 py-3 bg-amber-50 border-2 border-amber-300 shadow-sm">
                                <button onClick={() => updateQty(quickView.id, true, cartCarton.quantity - 1)} className="text-amber-700 hover:bg-amber-100 rounded-xl p-1.5 transition-colors">
                                  <Minus className="w-4 h-4 stroke-[2.5]" />
                                </button>
                                <div className="flex-1 text-center font-bold text-base text-amber-800">
                                  {cartCarton.quantity} ctn <span className="text-xs text-amber-600 font-normal">({cartCarton.quantity * quickViewQpc} pcs)</span>
                                </div>
                                <button onClick={() => { if (actualUnits(cartCarton) + quickViewQpc <= quickViewStock) updateQty(quickView.id, true, cartCarton.quantity + 1); }} disabled={actualUnits(cartCarton) + quickViewQpc > quickViewStock} className="text-amber-700 hover:bg-amber-100 rounded-xl p-1.5 transition-colors disabled:opacity-30">
                                  <Plus className="w-4 h-4 stroke-[2.5]" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => addToCart(quickView, true)}
                                className="flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-95 active:scale-[0.98] shadow-md flex items-center justify-center gap-2"
                                style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#78350f" }}
                              >
                                <Package className="w-4 h-4" /> Add by Carton ({quickViewQpc} pcs)
                              </button>
                            )}

                            {/* Buy by Piece */}
                            {cartPiece ? (
                              <div className="flex items-center gap-2 flex-1 rounded-2xl px-4 py-3 bg-violet-50 border-2 border-violet-400 shadow-sm">
                                <button onClick={() => updateQty(quickView.id, false, cartPiece.quantity - PIECE_STEP)} className="text-violet-700 hover:bg-violet-100 rounded-xl p-1.5 transition-colors">
                                  <Minus className="w-4 h-4 stroke-[2.5]" />
                                </button>
                                <div className="flex-1 text-center font-bold text-base text-violet-800">
                                  {cartPiece.quantity} pcs
                                </div>
                                <button onClick={() => { if (actualUnits(cartPiece) + PIECE_STEP <= quickViewStock) updateQty(quickView.id, false, cartPiece.quantity + PIECE_STEP); }} disabled={actualUnits(cartPiece) + PIECE_STEP > quickViewStock} className="text-violet-700 hover:bg-violet-100 rounded-xl p-1.5 transition-colors disabled:opacity-30">
                                  <Plus className="w-4 h-4 stroke-[2.5]" />
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => addToCart(quickView, false)}
                                className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-95 active:scale-[0.98] shadow-md flex items-center justify-center gap-2"
                                style={{ background: "linear-gradient(135deg, #302b63, #7c3aed)" }}
                              >
                                <ShoppingCart className="w-4 h-4" /> Add by Piece ({PIECE_STEP}+)
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            {canBuyPieceQV && (cartPiece ? (
                              <div className="flex items-center justify-between rounded-2xl p-3 bg-violet-50 border-2 border-violet-400 shadow-sm">
                                <span className="text-sm font-bold text-violet-800 ml-2">Quantity in Cart:</span>
                                <div className="flex items-center gap-3">
                                  <button onClick={() => updateQty(quickView.id, false, cartPiece.quantity - PIECE_STEP)} className="w-10 h-10 rounded-xl bg-white border border-violet-200 flex items-center justify-center text-violet-700 hover:bg-violet-100"><Minus className="w-4 h-4 stroke-[2.5]" /></button>
                                  <span className="font-extrabold text-lg w-16 text-center text-violet-900">{cartPiece.quantity} pc</span>
                                  <button onClick={() => { if (actualUnits(cartPiece) + PIECE_STEP <= quickViewStock) updateQty(quickView.id, false, cartPiece.quantity + PIECE_STEP); }} disabled={actualUnits(cartPiece) + PIECE_STEP > quickViewStock} className="w-10 h-10 rounded-xl bg-white border border-violet-200 flex items-center justify-center text-violet-700 hover:bg-violet-100 disabled:opacity-30"><Plus className="w-4 h-4 stroke-[2.5]" /></button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(quickView, false)} className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-95 active:scale-[0.98] shadow-md flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, #302b63, #7c3aed)" }}>
                                <ShoppingCart className="w-4 h-4" /> Add to Cart by Piece ({PIECE_STEP}+)
                              </button>
                            ))}
                            {quickViewQpc > 1 && (cartCarton ? (
                              <div className="flex items-center justify-between rounded-2xl p-3 bg-amber-50 border-2 border-amber-400 shadow-sm">
                                <span className="text-sm font-bold text-amber-800 ml-2">Cartons in Cart:</span>
                                <div className="flex items-center gap-3">
                                  <button onClick={() => updateQty(quickView.id, true, cartCarton.quantity - 1)} className="w-10 h-10 rounded-xl bg-white border border-amber-200 flex items-center justify-center text-amber-700 hover:bg-amber-100"><Minus className="w-4 h-4 stroke-[2.5]" /></button>
                                  <span className="font-extrabold text-lg w-16 text-center text-amber-900">{cartCarton.quantity} ctn</span>
                                  <button onClick={() => { if (actualUnits(cartCarton) + quickViewQpc <= quickViewStock) updateQty(quickView.id, true, cartCarton.quantity + 1); }} disabled={actualUnits(cartCarton) + quickViewQpc > quickViewStock} className="w-10 h-10 rounded-xl bg-white border border-amber-200 flex items-center justify-center text-amber-700 hover:bg-amber-100 disabled:opacity-30"><Plus className="w-4 h-4 stroke-[2.5]" /></button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(quickView, true)} className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all hover:opacity-95 active:scale-[0.98] shadow-md flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#78350f" }}>
                                <Package className="w-4 h-4" /> Add by Carton ({quickViewQpc} pcs)
                              </button>
                            ))}
                          </>
                        )}

                        {/* View Cart Quick Link */}
                        {(cartPiece || cartCarton) && (
                          <button
                            onClick={() => { setQuickView(null); setIsFullScreenQV(false); setShowCart(true); }}
                            className="w-full py-3 rounded-2xl text-sm font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-all flex items-center justify-center gap-2 shadow-xs"
                          >
                            <ShoppingCart className="w-4 h-4" /> View Cart ({cartCount} total pcs) <ChevronRight className="w-4 h-4" />
                          </button>
                        )}

                        {/* Bottom Utility Actions: Share & Multi-select */}
                        <div className="pt-3 flex items-center gap-2 border-t border-slate-200 mt-4">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 rounded-xl text-xs h-10 font-semibold"
                            onClick={() => {
                              setSelectedProductIds(new Set([quickView.id]));
                              setShowShareModal(true);
                              setQuickView(null);
                              setIsFullScreenQV(false);
                            }}
                          >
                            <Share2 className="w-3.5 h-3.5 mr-1.5 text-violet-600" /> Share Photo & Info
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl text-xs h-10 font-semibold"
                            onClick={() => {
                              toggleSelectProduct(quickView.id);
                              setSelectMode(true);
                            }}
                          >
                            {selectedProductIds.has(quickView.id) ? (
                              <span className="text-violet-600 font-bold">✓ Selected</span>
                            ) : (
                              <span>+ Select for Share</span>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ───── FULLSCREEN PHOTO LIGHTBOX VIEWER ───── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex flex-col justify-between select-none animate-in fade-in-0 duration-200"
          onClick={() => setLightbox(null)}
        >
          {/* Lightbox Top Controls Bar */}
          <div
            className="w-full p-4 flex items-center justify-between text-white z-10"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold bg-white/20 px-3 py-1 rounded-full backdrop-blur-md">
                Photo {lightbox.idx + 1} of {lightbox.urls.length}
              </span>
              {lightbox.zoom > 1 && (
                <span className="text-xs text-violet-300 font-mono">
                  {Math.round(lightbox.zoom * 100)}% Zoom
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Zoom In */}
              <button
                type="button"
                onClick={() => setLightbox(prev => prev ? { ...prev, zoom: Math.min(3, prev.zoom + 0.5) } : null)}
                title="Zoom In"
                className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              {/* Zoom Out */}
              <button
                type="button"
                onClick={() => setLightbox(prev => prev ? { ...prev, zoom: Math.max(1, prev.zoom - 0.5) } : null)}
                title="Zoom Out"
                className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              {/* Reset Zoom */}
              {lightbox.zoom > 1 && (
                <button
                  type="button"
                  onClick={() => setLightbox(prev => prev ? { ...prev, zoom: 1 } : null)}
                  title="Reset Zoom"
                  className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              {/* Close Lightbox */}
              <button
                type="button"
                onClick={() => setLightbox(null)}
                title="Close Lightbox"
                className="w-9 h-9 rounded-full bg-white/30 hover:bg-white/40 flex items-center justify-center transition-colors ml-2"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Lightbox Center Image Stage */}
          <div
            className="flex-1 flex items-center justify-center p-2 sm:p-6 overflow-hidden relative"
            onClick={e => e.stopPropagation()}
          >
            {lightbox.urls.length > 1 && (
              <button
                type="button"
                onClick={() => setLightbox(prev => prev ? { ...prev, idx: (prev.idx - 1 + prev.urls.length) % prev.urls.length, zoom: 1 } : null)}
                className="absolute left-3 sm:left-6 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md transition-all shadow-lg"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <div className="w-full h-full flex items-center justify-center overflow-auto">
              <img
                src={lightbox.urls[lightbox.idx]}
                alt="Product High-Res"
                style={{ transform: `scale(${lightbox.zoom})`, transition: "transform 0.2s ease-out" }}
                className="max-w-full max-h-full object-contain cursor-grab active:cursor-grabbing rounded-lg shadow-2xl"
              />
            </div>

            {lightbox.urls.length > 1 && (
              <button
                type="button"
                onClick={() => setLightbox(prev => prev ? { ...prev, idx: (prev.idx + 1) % prev.urls.length, zoom: 1 } : null)}
                className="absolute right-3 sm:right-6 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md transition-all shadow-lg"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Lightbox Bottom Thumbnail Navigator */}
          {lightbox.urls.length > 1 && (
            <div
              className="w-full p-4 flex justify-center gap-2 overflow-x-auto bg-black/50 backdrop-blur-md z-10"
              onClick={e => e.stopPropagation()}
            >
              {lightbox.urls.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setLightbox(prev => prev ? { ...prev, idx, zoom: 1 } : null)}
                  className={`w-14 h-14 rounded-xl overflow-hidden border-2 transition-all flex-shrink-0 bg-slate-900 ${
                    lightbox.idx === idx
                      ? "border-violet-500 scale-110 shadow-lg ring-2 ring-violet-500/40"
                      : "border-white/30 opacity-60 hover:opacity-100"
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ───── CART DIALOG ───── */}
      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #302b63, #7c3aed)" }}>
                <ShoppingCart className="w-4 h-4 text-white" />
              </div>
              Shopping Cart
              {cart.length > 0 && <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{cart.length} item{cart.length !== 1 ? "s" : ""}</span>}
            </DialogTitle>
          </DialogHeader>
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <ShoppingCart className="w-8 h-8 text-slate-300" />
              </div>
              <p className="font-semibold text-slate-600 mb-1">Your cart is empty</p>
              <p className="text-sm text-slate-400 mb-5">Add some products to get started</p>
              <Button variant="outline" onClick={() => setShowCart(false)}>Browse Products</Button>
            </div>
          ) : (
            <div className="overflow-y-auto flex-1 -mx-6 px-6 space-y-3 py-2">
              {cart.map((item, idx) => (
                <div key={idx} className="flex gap-3 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors">
                  {item.product.photoUrl
                    ? <img src={item.product.photoUrl} alt={item.product.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                    : <div className="w-14 h-14 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0"><Package className="w-6 h-6 text-slate-400" /></div>}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 truncate">{item.product.name}</p>
                    <p className="text-xs text-slate-400">{fmt(item.price)}/pc{item.sellByCarton ? ` · ${item.quantity} ctn (${actualUnits(item)} pcs)` : ""}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <button onClick={() => updateQty(item.product.id, item.sellByCarton, item.quantity - 1)} className="w-6 h-6 rounded-lg border flex items-center justify-center hover:bg-white"><Minus className="w-3 h-3" /></button>
                      <span className="text-sm font-bold w-7 text-center">{item.quantity}</span>
                      <button onClick={() => { if (actualUnits(item) + (item.sellByCarton ? item.product.quantityPerCarton : 1) <= getStock(item.product.id)) updateQty(item.product.id, item.sellByCarton, item.quantity + 1); }} className="w-6 h-6 rounded-lg border flex items-center justify-center hover:bg-white"><Plus className="w-3 h-3" /></button>
                      <span className="text-xs text-slate-400">{item.sellByCarton ? "ctn" : "pc"}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-sm text-slate-800">{fmt(itemTotal(item))}</p>
                    <button onClick={() => updateQty(item.product.id, item.sellByCarton, 0)} className="text-slate-300 hover:text-red-400 mt-2 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {cart.length > 0 && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-slate-600">Total</span>
                <span className="text-2xl font-extrabold" style={{ color: "#7c3aed" }}>{fmt(total)}</span>
              </div>
              <button
                onClick={() => { setShowCart(false); setShowCheckout(true); }}
                className="w-full py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg, #302b63, #7c3aed)" }}
              >
                Proceed to Checkout <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ───── CHECKOUT DIALOG ───── */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              Checkout
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold text-slate-700">Your Name *</Label>
              <Input className="mt-1 rounded-xl" value={checkoutForm.customerName} onChange={e => setCheckoutForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Full name" />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700">Phone</Label>
              <Input className="mt-1 rounded-xl" value={checkoutForm.customerPhone} onChange={e => setCheckoutForm(f => ({ ...f, customerPhone: e.target.value }))} placeholder="+1..." />
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700">Delivery Address</Label>
              <Input className="mt-1 rounded-xl" value={checkoutForm.customerAddress} onChange={e => setCheckoutForm(f => ({ ...f, customerAddress: e.target.value }))} placeholder="Street, City…" />
            </div>
            <div className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(124,58,237,0.04)", border: "1px solid rgba(124,58,237,0.12)" }}>
              {cart.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-slate-600">{item.product.name} × {item.quantity}{item.sellByCarton ? " ctn" : " pc"}</span>
                  <span className="font-semibold">{fmt(itemTotal(item))}</span>
                </div>
              ))}
              <div className="flex justify-between font-extrabold text-base border-t pt-2 mt-1" style={{ color: "#7c3aed" }}>
                <span>Total</span><span>{fmt(total)}</span>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowCheckout(false)} disabled={placing}>Back</Button>
            <button
              onClick={handleCheckout}
              disabled={placing}
              className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #302b63, #7c3aed)" }}
            >
              {placing ? "Placing Order…" : "Place Order"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── RECEIPT DIALOG ───── */}
      <Dialog open={!!showReceipt} onOpenChange={() => setShowReceipt(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-sm rounded-3xl">
          {showReceipt && (
            <div ref={receiptRef} className="receipt-a4 p-4 space-y-3">
              <div className="text-center border-b pb-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
                  <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-lg font-extrabold text-slate-900">Order Confirmed!</h2>
                <p className="text-xs text-slate-400 font-mono mt-1">{showReceipt.orderVoucherId}</p>
              </div>
              <div className="text-sm space-y-1">
                <div><span className="text-slate-400">Customer: </span><span className="font-semibold">{showReceipt.customerName}</span></div>
                {showReceipt.customerPhone && <div><span className="text-slate-400">Phone: </span>{showReceipt.customerPhone}</div>}
              </div>
              <table className="w-full text-xs border-collapse border rounded-lg overflow-hidden">
                <thead><tr className="bg-slate-50"><th className="border px-2 py-1.5 text-left">Item</th><th className="border px-2 py-1.5 text-center">Qty</th><th className="border px-2 py-1.5 text-right">Total</th></tr></thead>
                <tbody>
                  {showReceipt.items?.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="border px-2 py-1.5">{item.productName}</td>
                      <td className="border px-2 py-1.5 text-center">{item.quantity}</td>
                      <td className="border px-2 py-1.5 text-right font-medium">{fmt(item.totalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between font-extrabold text-base pt-1" style={{ color: "#7c3aed" }}>
                <span>Total</span><span>{fmt(showReceipt.totalAmount)}</span>
              </div>
              <p className="text-xs text-slate-400 text-center bg-slate-50 rounded-xl p-3 leading-relaxed">Your order is pending admin approval. You will be contacted shortly.</p>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={handleShare} disabled={sharing}>
              <Share2 className="w-4 h-4 mr-1" />{sharing ? "Sharing…" : "Share"}
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => handlePrint()}>
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
            <Button size="sm" className="rounded-xl" onClick={() => setShowReceipt(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───── PROMOTION POPUP ───── */}
      {showPopup && (
        <div className="fixed bottom-4 right-4 z-50 max-w-xs w-full" style={{ animation: "slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
          <span className="absolute -top-2 -right-2 flex h-5 w-5 z-10">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-5 w-5 bg-pink-500 items-center justify-center">
              <Bell className="w-2.5 h-2.5 text-white" />
            </span>
          </span>
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden" style={{ border: "1.5px solid rgba(236,72,153,0.2)" }}>
            {showPopup.showVideo && showPopup.videoUrl ? (
              <video
                key={showPopup.id}
                src={showPopup.videoUrl}
                autoPlay
                muted
                loop
                playsInline
                className="w-full object-cover"
                style={{ height: 160, background: "#000" }}
              />
            ) : showPopup.photoUrl ? (
              <img src={showPopup.photoUrl} alt={showPopup.title} className="w-full h-28 object-cover" />
            ) : null}
            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(236,72,153,0.1)" }}>
                    <Megaphone className="w-3.5 h-3.5 text-pink-500" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm leading-tight">{showPopup.title}</h3>
                </div>
                <button onClick={() => setShowPopup(null)} className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0"><X className="w-4 h-4" /></button>
              </div>
              {showPopup.description && <p className="text-xs text-slate-500 mb-3 leading-relaxed">{showPopup.description}</p>}
              {showPopup.productIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {showPopup.productNames.map((name, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full border" style={{ background: "rgba(236,72,153,0.05)", borderColor: "rgba(236,72,153,0.2)", color: "#db2777" }}>{name}</span>
                  ))}
                </div>
              )}
              <button onClick={() => { setShowPopup(null); if (showPopup.productIds.length > 0) { const p = products.find(pr => pr.id === showPopup.productIds[0]); if (p) setQuickView(p); } }}
                className="w-full py-2 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #ec4899, #db2777)" }}>
                Shop Now →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── FLOATING BOTTOM BAR FOR MULTI-PRODUCT PHOTO SHARING ───── */}
      {selectedProductIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[94%] max-w-xl animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-2xl p-3 sm:p-3.5 shadow-2xl border border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex -space-x-2 overflow-hidden flex-shrink-0">
                {selectedProducts.slice(0, 4).map((p, idx) => (
                  <div key={idx} className="w-8 h-8 rounded-full ring-2 ring-slate-900 bg-slate-800 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                ))}
                {selectedProducts.length > 4 && (
                  <div className="w-8 h-8 rounded-full ring-2 ring-slate-900 bg-violet-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    +{selectedProducts.length - 4}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {selectedProducts.length} Product{selectedProducts.length > 1 ? "s" : ""} Selected
                </p>
                <p className="text-[10px] text-slate-300 truncate">
                  Ready to export & share photos
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={clearSelectedProducts}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 transition-colors"
                title="Clear selection"
              >
                Clear
              </button>
              <button
                onClick={() => setShowShareModal(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-lg hover:opacity-90 active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                data-testid="button-share-photos-floating"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share Photos ({selectedProducts.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── SHARE SELECTED PRODUCTS & PHOTOS MODAL ───── */}
      <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
        <DialogContent className="max-h-[92vh] overflow-y-auto max-w-4xl rounded-3xl p-4 sm:p-6">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="flex items-center gap-2.5 text-lg sm:text-xl font-extrabold text-slate-900">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                <Camera className="w-5 h-5" />
              </div>
              <span>Share Selected Products & Photos</span>
              <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">
                {selectedProducts.length} Selected
              </span>
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-1">
              Export high-resolution catalog photos, download images, or share directly to Telegram, WhatsApp, and social channels.
            </p>
          </DialogHeader>

          {selectedProducts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-slate-500 mb-4">No products selected yet.</p>
              <Button onClick={() => setShowShareModal(false)}>Back to Store</Button>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {/* Tabs Switcher */}
              <div className="flex items-center gap-2 border-b pb-2">
                <button
                  onClick={() => setShareTab("catalog")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    shareTab === "catalog"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Images className="w-3.5 h-3.5" /> Branded Photo Catalog (Collage)
                </button>
                <button
                  onClick={() => setShareTab("gallery")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    shareTab === "gallery"
                      ? "bg-violet-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> Individual Photos & Downloads ({selectedProducts.length})
                </button>
              </div>

              {/* TAB 1: BRANDED PHOTO CATALOG COLLAGE */}
              {shareTab === "catalog" && (
                <div className="space-y-4">
                  {/* Action Buttons Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        onClick={handleShareCollageImage}
                        disabled={sharingCollage}
                        className="rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-90"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                        data-testid="button-share-collage-png"
                      >
                        <Images className="w-3.5 h-3.5 mr-1.5" />
                        {sharingCollage ? "Generating PNG..." : "Share Catalog Image (PNG)"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleShareCollagePdf}
                        disabled={sharingPdfCollage}
                        className="rounded-xl text-xs font-semibold bg-white hover:bg-slate-50"
                      >
                        <FileText className="w-3.5 h-3.5 mr-1.5 text-red-500" />
                        {sharingPdfCollage ? "Generating PDF..." : "Export PDF Catalog"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSharePhotoFilesDirectly}
                        disabled={sharingFiles}
                        className="rounded-xl text-xs font-bold text-white shadow-sm"
                        style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
                      >
                        <Share2 className="w-3.5 h-3.5 mr-1.5" />
                        {sharingFiles ? "Sharing to App..." : "Share to Device / App"}
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleShareTelegram}
                        className="rounded-xl text-xs text-[#229ED9] border-[#229ED9]/30 hover:bg-[#229ED9]/10"
                      >
                        <Send className="w-3.5 h-3.5 mr-1 text-[#229ED9]" /> Telegram
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleShareWhatsApp}
                        className="rounded-xl text-xs text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/10"
                      >
                        <Send className="w-3.5 h-3.5 mr-1 text-[#25D366]" /> WhatsApp
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopyCatalogText}
                        className="rounded-xl text-xs text-slate-700 bg-white"
                      >
                        <Copy className="w-3.5 h-3.5 mr-1" />
                        {copiedCatalog ? "Copied!" : "Copy Text"}
                      </Button>
                    </div>
                  </div>

                  {/* VISUAL COLLAGE SHEET (Captured for Image/PDF Export) */}
                  <div className="overflow-x-auto p-1 bg-slate-200/60 rounded-2xl">
                    <div
                      ref={collageRef}
                      className="bg-white rounded-xl p-6 shadow-sm min-w-[340px] max-w-3xl mx-auto space-y-5"
                      style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
                    >
                      {/* Branded Header */}
                      <div className="flex items-center justify-between border-b pb-4 gap-4 flex-wrap" style={{ borderColor: "#e2e8f0" }}>
                        <div className="flex items-center gap-3">
                          {settings?.ecommerceLogo ? (
                            <img src={settings.ecommerceLogo} alt="Logo" className="w-12 h-12 rounded-xl object-contain ring-1 ring-slate-200" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                              <Sparkles className="w-6 h-6" />
                            </div>
                          )}
                          <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">{storeName}</h2>
                            <p className="text-xs text-slate-500 font-medium">{tagline}</p>
                          </div>
                        </div>

                        <div className="text-right text-xs text-slate-500 space-y-0.5">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                            PRODUCT SHOWCASE
                          </span>
                          <p className="text-[11px] text-slate-400 font-mono mt-1">
                            {new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                          </p>
                        </div>
                      </div>

                      {/* Collage Grid of Selected Products */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                        {selectedProducts.map((p, idx) => {
                          const price = getPrice(p.id);
                          const qpc = getQpc(p);
                          const hasCarton = qpc > 1;

                          return (
                            <div
                              key={idx}
                              className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col shadow-xs"
                              style={{ pageBreakInside: "avoid" }}
                            >
                              {/* Product Photo */}
                              <div className="relative aspect-square bg-slate-50 overflow-hidden flex items-center justify-center">
                                {p.photoUrl ? (
                                  <img
                                    src={p.photoUrl}
                                    alt={p.name}
                                    className="w-full h-full object-cover"
                                    crossOrigin="anonymous"
                                  />
                                ) : (
                                  <Package className="w-10 h-10 text-slate-200" />
                                )}
                                <div className="absolute top-1.5 left-1.5">
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-xs">
                                    #{p.code}
                                  </span>
                                </div>
                              </div>

                              {/* Details */}
                              <div className="p-2.5 flex-1 flex flex-col justify-between">
                                <div>
                                  {p.categoryName && (
                                    <span className="text-[9px] text-slate-400 uppercase tracking-wider font-semibold block mb-0.5 truncate">
                                      {p.categoryName}
                                    </span>
                                  )}
                                  <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                                    {p.name}
                                  </h4>
                                </div>

                                <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-baseline justify-between">
                                  <div>
                                    {price > 0 ? (
                                      <div>
                                        <span className="text-xs font-extrabold text-violet-700">
                                          {fmt(price)}
                                        </span>
                                        <span className="text-[9px] text-slate-400 ml-0.5">/pc</span>
                                        {hasCarton && (
                                          <div className="text-[9px] text-amber-600 font-semibold">
                                            {fmt(price * qpc)} <span className="text-slate-400 font-normal">/ctn ({qpc} pcs)</span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-slate-400">Contact for price</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Branded Footer */}
                      <div className="border-t pt-3 flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-2">
                        <div>
                          <span>📞 For orders & inquiries: </span>
                          <span className="font-semibold text-slate-800">
                            {settings?.companyPhone || settings?.phone || "Contact Store"}
                          </span>
                        </div>
                        <div className="text-slate-400 text-[10px]">
                          Powered by NexusStock E-Commerce
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: INDIVIDUAL PHOTOS GALLERY */}
              {shareTab === "gallery" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {selectedProducts.map((p, idx) => {
                      const price = getPrice(p.id);
                      const qpc = getQpc(p);

                      return (
                        <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col shadow-xs">
                          <div className="relative aspect-video sm:aspect-square bg-slate-50 rounded-xl overflow-hidden mb-2.5">
                            {p.photoUrl ? (
                              <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-10 h-10 text-slate-300" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1">
                            <span className="text-[10px] font-mono text-slate-400 font-medium">#{p.code}</span>
                            <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{p.name}</h4>
                            <p className="text-xs font-extrabold text-violet-700 mt-1">
                              {price > 0 ? fmt(price) : "Contact for price"}
                              {qpc > 1 && price > 0 && (
                                <span className="text-[10px] text-amber-600 font-semibold ml-1.5">
                                  ({fmt(price * qpc)}/ctn)
                                </span>
                              )}
                            </p>
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-1.5">
                            {p.photoUrl ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 rounded-xl text-[11px] h-8"
                                  onClick={() => handleDownloadSingleImage(p.photoUrl!, p.name)}
                                >
                                  <Download className="w-3 h-3 mr-1" /> Download
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-xl text-[11px] h-8 px-2"
                                  onClick={() => {
                                    navigator.clipboard.writeText(p.photoUrl!);
                                    toast({ title: "Photo URL copied" });
                                  }}
                                  title="Copy Image URL"
                                >
                                  <Copy className="w-3 h-3" />
                                </Button>
                              </>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">No image uploaded</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="border-t pt-3 flex-wrap gap-2">
            <Button
              variant="outline"
              className="rounded-xl text-xs"
              onClick={() => setShowShareModal(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
