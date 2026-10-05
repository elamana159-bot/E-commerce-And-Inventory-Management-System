import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, setLogLevel } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
import { logEnvironmentDiagnostics } from "./lib/envValidation";

// Silence verbose connection warnings in offline mode
try {
  setLogLevel("silent");
} catch {}

try {
  logEnvironmentDiagnostics();
} catch {}

export interface FirebaseRuntimeConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export function getStoredFirebaseConfig(): FirebaseRuntimeConfig | null {
  try {
    const raw = localStorage.getItem("nexus_firebase_config");
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

export function saveStoredFirebaseConfig(config: FirebaseRuntimeConfig): void {
  try {
    localStorage.setItem("nexus_firebase_config", JSON.stringify(config));
  } catch {}
}

const storedConfig = getStoredFirebaseConfig();

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || storedConfig?.apiKey;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || storedConfig?.authDomain;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || storedConfig?.projectId;
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || storedConfig?.storageBucket;
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || storedConfig?.messagingSenderId;
const appId = import.meta.env.VITE_FIREBASE_APP_ID || storedConfig?.appId;

export const isFirebaseConfigured: boolean = Boolean(
  apiKey &&
  authDomain &&
  projectId &&
  appId &&
  typeof apiKey === "string" &&
  apiKey.trim().length > 0 &&
  !apiKey.includes("DemoKey")
);

const firebaseConfig = {
  apiKey: apiKey || "none",
  authDomain: authDomain || `${projectId || "nexus-stock"}.firebaseapp.com`,
  projectId: projectId || "nexus-stock",
  storageBucket: storageBucket || `${projectId || "nexus-stock"}.appspot.com`,
  messagingSenderId: messagingSenderId || "0000000000",
  appId: appId || "1:0000000000:web:00000000000000",
};

let appInstance: any;
try {
  appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (err) {
  console.warn("Firebase app initialization fallback mode:", err);
  try {
    appInstance = getApps().length > 0 ? getApp() : initializeApp({ apiKey: "none", projectId: "local-app", appId: "1:0:web:0" }, "fallback");
  } catch {
    appInstance = { name: "fallback", options: {} };
  }
}

let dbInstance: any;
try {
  dbInstance = getFirestore(appInstance);
} catch (err) {
  console.warn("Firestore initialization fallback mode:", err);
  dbInstance = {} as any;
}

let storageInstance: any;
try {
  storageInstance = getStorage(appInstance);
} catch (err) {
  console.warn("Firebase Storage initialization fallback mode:", err);
  storageInstance = {} as any;
}

let authInstance: any;
try {
  authInstance = getAuth(appInstance);
} catch (err) {
  console.warn("Firebase Auth initialization fallback mode:", err);
  authInstance = {} as any;
}

export const app = appInstance;
export const db = dbInstance;
export const storage = storageInstance;
export const auth = authInstance;

export default appInstance;
