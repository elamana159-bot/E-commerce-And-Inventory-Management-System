import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { auth } from "./firebase";
import { getAll, getById, createWithId, update, remove, COLLECTIONS } from "./firestore";
import type { AppUser } from "./types";

export const ADMIN_EMAIL = "admin@nexusstock.com";
export const ADMIN_PASSWORD = "Admin@123456";

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isAuditor: boolean;
  canAudit: boolean;
  hasPermission: (page: string) => boolean;
  createUser: (
    email: string,
    password: string,
    name: string,
    permissions: string[],
    role?: "user" | "auditor" | "admin",
    canAudit?: boolean
  ) => Promise<void>;
  updateUserPermissions: (
    uid: string,
    name: string,
    permissions: string[],
    role?: "user" | "auditor" | "admin",
    canAudit?: boolean,
    newPassword?: string
  ) => Promise<void>;
  deleteUser: (uid: string) => Promise<void>;
  allUsers: AppUser[];
  reloadUsers: () => Promise<void>;
  registeredAuditors: AppUser[];
  activeAuditorName: string;
  switchUser: (targetUser: AppUser) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const ALL_PERMISSIONS = [
  { key: "dashboard", label: "Dashboard (ዳሽቦርድ)" },
  { key: "audit", label: "Audit & Verify Records (ማጣራትና ራይት ማድረግ)" },
  { key: "stock-in", label: "Stock In (ዕቃ ገቢ)" },
  { key: "pos-sales", label: "POS Sales (የመሸጫ ሽያጭ)" },
  { key: "direct-sales", label: "Direct Sales (ቀጥታ ሽያጭ)" },
  { key: "order-vouchers", label: "Order Vouchers (የትዕዛዝ ሰነዶች)" },
  { key: "transfers", label: "Transfers (የመደብር ዝውውር)" },
  { key: "damage-returns", label: "Damage & Returns (ተመላሽና ብልሽት)" },
  { key: "expenses", label: "Expenses (ወጪዎች)" },
  { key: "payment-transactions", label: "Payment Transactions (የክፍያ ዝርዝር)" },
  { key: "accounts", label: "Accounts (የባንክ ሂሳቦች)" },
  { key: "accounting", label: "Accounting & ERP Ledger (አካውንቲንግ እና ሌጀር)" },
  { key: "store-requests", label: "Store Requests (የመደብር ጥያቄዎች)" },
  { key: "bincard", label: "Bincard (ቢንካርድ)" },
  { key: "bincard-summary", label: "Bincard Summary (የቢንካርድ ማጠቃለያ)" },
  { key: "store-balance", label: "Store Balance (የመደብር ክምችት)" },
  { key: "inventory", label: "Inventory (ክምችት ማጠቃለያ)" },
  { key: "reports", label: "Reports (ሪፖርቶች)" },
  { key: "products", label: "Products (ምርቶች)" },
  { key: "categories", label: "Categories (ምድቦች)" },
  { key: "pricing", label: "Pricing (ዋጋ ማስተካከያ)" },
  { key: "cost-unit", label: "Cost Unit (የዕቃ ወጪ ዋጋ)" },
  { key: "stores", label: "Stores (መደብሮች)" },
  { key: "suppliers", label: "Suppliers (አቅራቢዎች)" },
  { key: "customers", label: "Customers (ደንበኞች)" },
  { key: "amendment", label: "Amendment (የሰነድ ማሻሻያ)" },
  { key: "binning", label: "Binning (ቦታ አመዳደብ)" },
  { key: "promotions", label: "Promotions (ማስታወቂያዎች)" },
  { key: "backup", label: "Backup & Restore (ባክአፕ)" },
  { key: "settings", label: "Settings (ቅንብሮች)" },
  { key: "delete", label: "Delete Records (መሰረዝ)" },
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => {
    try {
      if (typeof window !== "undefined") {
        if (localStorage.getItem("nexus_signed_out") === "true") {
          return null;
        }
        const savedUserStr = localStorage.getItem("nexus_session_user");
        if (savedUserStr) {
          try {
            const parsed = JSON.parse(savedUserStr);
            if (parsed && (parsed.id || parsed.uid)) {
              return parsed;
            }
          } catch {
            localStorage.removeItem("nexus_session_user");
          }
        }
        // Auto-initialize default system administrator session for demo / instant preview
        const defaultAdmin: AppUser = {
          id: "user-admin-001",
          uid: "user-admin-001",
          email: ADMIN_EMAIL,
          name: "System Administrator",
          role: "admin",
          canAudit: true,
          permissions: ["*"],
        };
        try {
          localStorage.setItem("nexus_session_user", JSON.stringify(defaultAdmin));
        } catch {}
        return defaultAdmin;
      }
    } catch {}
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);

  async function loadUsers() {
    try {
      let users = await getAll<AppUser>(COLLECTIONS.USERS);
      const hasAdmin = users.some(u => (u.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase());
      if (!hasAdmin) {
        const defaultAdmin: AppUser = {
          id: "admin-system-uid",
          uid: "admin-system-uid",
          email: ADMIN_EMAIL,
          name: "Administrator",
          role: "admin",
          canAudit: true,
          permissions: ["*"],
        };
        users = [defaultAdmin, ...users];
      }
      setAllUsers(users);
      return users;
    } catch {
      const defaultAdmin: AppUser = {
        id: "admin-system-uid",
        uid: "admin-system-uid",
        email: ADMIN_EMAIL,
        name: "Administrator",
        role: "admin",
        canAudit: true,
        permissions: ["*"],
      };
      setAllUsers([defaultAdmin]);
      return [defaultAdmin];
    }
  }

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let fallbackTimeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const savedUserStr = localStorage.getItem("nexus_session_user");
      if (savedUserStr) {
        try {
          const parsed = JSON.parse(savedUserStr);
          setUser(parsed);
        } catch {
          localStorage.removeItem("nexus_session_user");
        }
      }

      // Safety fallback to prevent hanging in sandboxed/offline environments
      fallbackTimeout = setTimeout(() => {
        setLoading(false);
      }, 1200);

      unsubscribe = onAuthStateChanged(
        auth,
        async (firebaseUser) => {
          if (fallbackTimeout) clearTimeout(fallbackTimeout);
          if (firebaseUser) {
            try {
              let profile = await getById<AppUser>(COLLECTIONS.USERS, firebaseUser.uid);
              if (!profile) {
                // If the user signed in, auto-provision user record in Firestore if missing
                const isSystemAdmin = firebaseUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
                const newUser: AppUser = {
                  id: firebaseUser.uid,
                  uid: firebaseUser.uid,
                  email: firebaseUser.email || "",
                  name: firebaseUser.displayName || (isSystemAdmin ? "Administrator" : "Staff Member"),
                  role: isSystemAdmin ? "admin" : "user",
                  permissions: isSystemAdmin ? ["*"] : ["dashboard", "pos-sales", "products"],
                };
                try {
                  await createWithId(COLLECTIONS.USERS, firebaseUser.uid, newUser as unknown as Record<string, unknown>);
                } catch {
                  // Ignore firestore write error in demo
                }
                profile = { ...newUser, id: firebaseUser.uid };
              }
              if (profile) {
                setUser(profile);
                localStorage.setItem("nexus_session_user", JSON.stringify(profile));
                loadUsers();
              }
            } catch {
              // On profile load error, build a baseline user profile from Firebase User
              const isSystemAdmin = firebaseUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
              const fallbackProfile: AppUser = {
                id: firebaseUser.uid,
                uid: firebaseUser.uid,
                email: firebaseUser.email || "",
                name: firebaseUser.displayName || (isSystemAdmin ? "Administrator" : "Staff Member"),
                role: isSystemAdmin ? "admin" : "user",
                permissions: isSystemAdmin ? ["*"] : ["dashboard", "pos-sales"],
              };
              setUser(fallbackProfile);
              localStorage.setItem("nexus_session_user", JSON.stringify(fallbackProfile));
            }
          } else {
            // When explicitly signed out in Firebase or deliberately logged out
            if (localStorage.getItem("nexus_signed_out") === "true" || !localStorage.getItem("nexus_session_user")) {
              setUser(null);
            }
          }
          setLoading(false);
        },
        (error) => {
          if (fallbackTimeout) clearTimeout(fallbackTimeout);
          console.warn("Firebase Auth listener error:", error);
          setLoading(false);
        }
      );
    } catch (err) {
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      console.warn("Firebase Auth initialization failed:", err);
      setLoading(false);
    }

    return () => {
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    localStorage.removeItem("nexus_signed_out");
    const cleanEmail = email.trim().toLowerCase();
    const authEmail = cleanEmail === "admin" ? ADMIN_EMAIL.toLowerCase() : cleanEmail;
    const isAdminCredentials =
      (cleanEmail === ADMIN_EMAIL.toLowerCase() || cleanEmail === "admin") &&
      password === ADMIN_PASSWORD;

    try {
      // 1. Standard Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(auth, authEmail, password);
      if (userCredential.user) {
        let profile = await getById<AppUser>(COLLECTIONS.USERS, userCredential.user.uid);
        if (!profile) {
          const isSystemAdmin = userCredential.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
          profile = {
            id: userCredential.user.uid,
            uid: userCredential.user.uid,
            email: userCredential.user.email || cleanEmail,
            name: userCredential.user.displayName || (isSystemAdmin ? "Administrator" : "Staff User"),
            role: isSystemAdmin ? "admin" : "user",
            permissions: isSystemAdmin ? ["*"] : ["dashboard", "pos-sales", "products"],
          };
          try {
            await createWithId(COLLECTIONS.USERS, userCredential.user.uid, profile as unknown as Record<string, unknown>);
          } catch {}
        }
        setUser(profile);
        localStorage.setItem("nexus_session_user", JSON.stringify(profile));
        return;
      }
    } catch (err: any) {
      const code = err?.code || "";
      
      // If Firebase auth fails because user does not exist in Firebase yet but default credentials are used
      if (
        isAdminCredentials &&
        (code === "auth/user-not-found" ||
          code === "auth/invalid-email" ||
          code === "auth/invalid-credential" ||
          code === "auth/invalid-login-credentials" ||
          code === "auth/network-request-failed" ||
          code === "auth/configuration-not-found" ||
          code === "auth/invalid-api-key" ||
          code === "auth/operation-not-allowed" ||
          !import.meta.env.VITE_FIREBASE_API_KEY)
      ) {
        // Attempt to create the Firebase Auth user if apiKey exists
        try {
          if (import.meta.env.VITE_FIREBASE_API_KEY) {
            const createdCred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD);
            if (createdCred.user) {
              const adminUser: AppUser = {
                id: createdCred.user.uid,
                uid: createdCred.user.uid,
                email: ADMIN_EMAIL,
                name: "Administrator",
                role: "admin",
                permissions: ["*"],
              };
              await createWithId(COLLECTIONS.USERS, createdCred.user.uid, adminUser as unknown as Record<string, unknown>);
              setUser(adminUser);
              localStorage.setItem("nexus_session_user", JSON.stringify(adminUser));
              return;
            }
          }
        } catch {
          // If creation fails or already exists with different flow, establish admin session
        }

        const adminUser: AppUser = {
          id: "admin-system-uid",
          uid: "admin-system-uid",
          email: ADMIN_EMAIL,
          name: "Administrator",
          role: "admin",
          permissions: ["*"],
        };
        setUser(adminUser);
        localStorage.setItem("nexus_session_user", JSON.stringify(adminUser));
        return;
      }

      // Check if user is created via local mock storage or Firestore users
      const mockUserStr = localStorage.getItem(`user_${cleanEmail}`);
      if (mockUserStr) {
        try {
          const mockUser = JSON.parse(mockUserStr);
          if (!mockUser.password || mockUser.password === password) {
            setUser(mockUser);
            localStorage.setItem("nexus_session_user", JSON.stringify(mockUser));
            return;
          }
        } catch {}
      }

      // Check users from Firestore / local users list
      try {
        const usersList = allUsers.length > 0 ? allUsers : await loadUsers();
        const matched = usersList.find(
          u => (u.email || "").trim().toLowerCase() === cleanEmail ||
               (u.name || "").trim().toLowerCase() === cleanEmail
        );
        if (matched) {
          if (!matched.password || matched.password === password) {
            setUser(matched);
            localStorage.setItem("nexus_session_user", JSON.stringify(matched));
            return;
          } else {
            throw new Error("Incorrect password for this user account");
          }
        }
      } catch (checkErr) {
        if (checkErr instanceof Error && checkErr.message.includes("Incorrect password")) {
          throw checkErr;
        }
      }

      if (
        code === "auth/user-not-found" ||
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/invalid-login-credentials"
      ) {
        throw new Error("Invalid email or password");
      }
      throw err;
    }
  }

  async function signOut() {
    try {
      await firebaseSignOut(auth);
    } catch {
      // Ignore firebase signOut error
    }
    localStorage.setItem("nexus_signed_out", "true");
    localStorage.removeItem("nexus_session_user");
    setUser(null);
  }

  async function createUser(
    email: string,
    password: string,
    name: string,
    permissions: string[],
    role: "user" | "auditor" | "admin" = "user",
    canAudit: boolean = false
  ) {
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
    const cleanEmail = email.trim().toLowerCase();
    let uid = "";

    // 1. Try Firebase Auth REST SignUp
    try {
      if (apiKey) {
        const res = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: cleanEmail, password, returnSecureToken: true }),
          }
        );
        const data = await res.json();
        if (res.ok && data.localId) {
          uid = data.localId as string;
        }
      }
    } catch (e) {
      console.warn("Firebase Auth REST signup failed, using generated UID fallback:", e);
    }

    if (!uid) {
      uid = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }

    const newUserDoc: AppUser = {
      id: uid,
      uid,
      email: cleanEmail,
      name,
      role,
      canAudit: role === "auditor" ? true : canAudit,
      password, // Retained for resilient direct & offline authentication
      permissions: role === "admin" ? ["*"] : permissions,
    };

    // Store in Firestore and IndexedDB
    try {
      await createWithId(COLLECTIONS.USERS, uid, newUserDoc as unknown as Record<string, unknown>);
    } catch (fsErr) {
      console.warn("Could not write user to Firestore, persisting locally:", fsErr);
    }

    // Persist in localStorage for instant fallback login
    localStorage.setItem(`user_${cleanEmail}`, JSON.stringify(newUserDoc));

    await loadUsers();
  }

  async function updateUserPermissions(
    uid: string,
    name: string,
    permissions: string[],
    role?: "user" | "auditor" | "admin",
    canAudit?: boolean,
    newPassword?: string
  ) {
    const updatePayload: Record<string, unknown> = {
      name,
      permissions,
    };
    if (role !== undefined) updatePayload.role = role;
    if (canAudit !== undefined) updatePayload.canAudit = canAudit;
    if (newPassword && newPassword.trim().length >= 6) updatePayload.password = newPassword.trim();

    try {
      await update(COLLECTIONS.USERS, uid, updatePayload);
    } catch (err) {
      console.warn("Firestore user update warning:", err);
    }

    // Update local cache if current user
    if (user && user.uid === uid) {
      const updatedUser: AppUser = {
        ...user,
        name,
        permissions,
        ...(role !== undefined ? { role } : {}),
        ...(canAudit !== undefined ? { canAudit } : {}),
        ...(newPassword ? { password: newPassword } : {}),
      };
      setUser(updatedUser);
      localStorage.setItem("nexus_session_user", JSON.stringify(updatedUser));
    }

    await loadUsers();
  }

  async function deleteUser(uid: string) {
    await remove(COLLECTIONS.USERS, uid);
    await loadUsers();
  }

  async function reloadUsers() {
    await loadUsers();
  }

  const registeredAuditors = allUsers.filter(u =>
    u.role === "auditor" ||
    Boolean(u.canAudit) ||
    (Array.isArray(u.permissions) && u.permissions.includes("audit"))
  );

  const isAdmin = user?.role === "admin";
  const isAuditor = Boolean(
    user && (user.role === "auditor" || user.canAudit === true || (Array.isArray(user.permissions) && user.permissions.includes("audit")))
  );
  // Rite (ራይት) + Checked is strictly reserved for the Auditor registered under "Add Auditor (አጣሪ ጨምር)"
  // Admin is also granted management check authority if a registered auditor exists or when delegating
  const canAudit = isAuditor || (isAdmin && registeredAuditors.length > 0);
  const activeAuditorName = isAuditor
    ? (user?.name || user?.displayName || user?.email || "Auditor")
    : (registeredAuditors[0]?.name || "");

  function switchUser(targetUser: AppUser) {
    setUser(targetUser);
    try {
      localStorage.setItem("nexus_session_user", JSON.stringify(targetUser));
      localStorage.removeItem("nexus_signed_out");
    } catch {}
  }

  function hasPermission(page: string): boolean {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (user.permissions.includes("*")) return true;
    if (page === "audit") return canAudit;
    return user.permissions.includes(page);
  }

  return (
    <AuthContext.Provider value={{
      user, loading, signIn, signOut, isAdmin, isAuditor, canAudit, hasPermission,
      createUser, updateUserPermissions, deleteUser, allUsers, reloadUsers,
      registeredAuditors, activeAuditorName, switchUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
