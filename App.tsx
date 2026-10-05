import { useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/toaster";
import { initializeDemoDataIfEmpty } from "./seedData";

import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Categories from "./pages/Categories";
import Amendment from "./pages/Amendment";
import Stores from "./pages/Stores";
import Suppliers from "./pages/Suppliers";
import Customers from "./pages/Customers";
import StockIn from "./pages/StockIn";
import Pricing from "./pages/Pricing";
import CostUnit from "./pages/CostUnit";
import PosSales from "./pages/PosSales";
import OrderVouchers from "./pages/OrderVouchers";
import Transfers from "./pages/Transfers";
import DamageReturns from "./pages/DamageReturns";
import Expenses from "./pages/Expenses";
import PaymentTransactions from "./pages/PaymentTransactions";
import StoreBalance from "./pages/StoreBalance";
import Bincard from "./pages/Bincard";
import BincardSummary from "./pages/BincardSummary";
import Reports from "./pages/Reports";
import Inventory from "./pages/Inventory";
import StoreRequests from "./pages/StoreRequests";
import Accounts from "./pages/Accounts";
import Accounting from "./pages/Accounting";
import Promotions from "./pages/Promotions";
import DirectSales from "./pages/DirectSales";
import Binning from "./pages/Binning";
import Settings from "./pages/Settings";
import Backup from "./pages/Backup";
import UserManagement from "./pages/UserManagement";
import Login from "./pages/Login";
import Ecommerce from "./pages/Ecommerce";
import DigitalReceipt from "./pages/DigitalReceipt";
import NotFound from "./pages/not-found";
import { initializeAutoBackupDaemon } from "./lib/backupService";
import { loadAndCacheBrandSettings } from "./lib/brandConfig";
import { seedChartOfAccountsIfEmpty } from "./lib/accountingEngine";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function ProtectedRoute({ component: Component, page }: { component: React.ComponentType; page?: string }) {
  const { user, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin text-primary font-medium text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (page && page !== "dashboard" && !hasPermission(page)) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <Layout>
      <ErrorBoundary>
        <Component />
      </ErrorBoundary>
    </Layout>
  );
}

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin text-primary font-medium text-sm">Loading NexusStock...</div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login">
        {user ? <Redirect to="/dashboard" /> : <Login />}
      </Route>
      <Route path="/ecommerce" component={Ecommerce} />
      <Route path="/receipt/:id" component={DigitalReceipt} />
      <Route path="/receipt" component={DigitalReceipt} />

      <Route path="/">
        {user ? <ProtectedRoute component={Dashboard} page="dashboard" /> : <Login />}
      </Route>

      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} page="dashboard" />
      </Route>
      <Route path="/products">
        <ProtectedRoute component={Products} page="products" />
      </Route>
      <Route path="/categories">
        <ProtectedRoute component={Categories} page="categories" />
      </Route>
      <Route path="/amendment">
        <ProtectedRoute component={Amendment} page="amendment" />
      </Route>
      <Route path="/stores">
        <ProtectedRoute component={Stores} page="stores" />
      </Route>
      <Route path="/suppliers">
        <ProtectedRoute component={Suppliers} page="suppliers" />
      </Route>
      <Route path="/customers">
        <ProtectedRoute component={Customers} page="customers" />
      </Route>
      <Route path="/stock-in">
        <ProtectedRoute component={StockIn} page="stock-in" />
      </Route>
      <Route path="/pricing">
        <ProtectedRoute component={Pricing} page="pricing" />
      </Route>
      <Route path="/cost-unit">
        <ProtectedRoute component={CostUnit} page="cost-unit" />
      </Route>
      <Route path="/pos-sales">
        <ProtectedRoute component={PosSales} page="pos-sales" />
      </Route>
      <Route path="/order-vouchers">
        <ProtectedRoute component={OrderVouchers} page="order-vouchers" />
      </Route>
      <Route path="/transfers">
        <ProtectedRoute component={Transfers} page="transfers" />
      </Route>
      <Route path="/damage-returns">
        <ProtectedRoute component={DamageReturns} page="damage-returns" />
      </Route>
      <Route path="/expenses">
        <ProtectedRoute component={Expenses} page="expenses" />
      </Route>
      <Route path="/payment-transactions">
        <ProtectedRoute component={PaymentTransactions} page="payment-transactions" />
      </Route>
      <Route path="/store-balance">
        <ProtectedRoute component={StoreBalance} page="store-balance" />
      </Route>
      <Route path="/bincard">
        <ProtectedRoute component={Bincard} page="bincard" />
      </Route>
      <Route path="/bincard-summary">
        <ProtectedRoute component={BincardSummary} page="bincard-summary" />
      </Route>
      <Route path="/reports">
        <ProtectedRoute component={Reports} page="reports" />
      </Route>
      <Route path="/inventory">
        <ProtectedRoute component={Inventory} page="inventory" />
      </Route>
      <Route path="/store-requests">
        <ProtectedRoute component={StoreRequests} page="store-requests" />
      </Route>
      <Route path="/accounts">
        <ProtectedRoute component={Accounts} page="accounts" />
      </Route>
      <Route path="/accounting">
        <ProtectedRoute component={Accounting} page="accounting" />
      </Route>
      <Route path="/promotions">
        <ProtectedRoute component={Promotions} page="promotions" />
      </Route>
      <Route path="/direct-sales">
        <ProtectedRoute component={DirectSales} page="direct-sales" />
      </Route>
      <Route path="/binning">
        <ProtectedRoute component={Binning} page="binning" />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={Settings} page="settings" />
      </Route>
      <Route path="/backup">
        <ProtectedRoute component={Backup} page="backup" />
      </Route>
      <Route path="/users">
        <ProtectedRoute component={UserManagement} />
      </Route>

      <Route path="*" component={NotFound} />
    </Switch>
  );
}

export default function App() {
  useEffect(() => {
    initializeDemoDataIfEmpty();
    initializeAutoBackupDaemon();
    loadAndCacheBrandSettings();
    seedChartOfAccountsIfEmpty().catch(() => {});
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </ErrorBoundary>
  );
}
