/**
 * Seed data utility.
 * Mock/demo product seeding is disabled to ensure Firebase Cloud Firestore
 * is the single source of truth across all devices.
 */
export async function initializeDemoDataIfEmpty(): Promise<void> {
  // Production mode: No hardcoded demo data is injected.
  // Data is loaded live and directly from Firebase Cloud Firestore.
}
