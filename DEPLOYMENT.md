# NexusStock — Production Deployment Guide for Vercel

This guide outlines everything required to deploy NexusStock (Stock & Inventory Management System) to **Vercel** with **Firebase (Firestore & Auth)** and **Cloudinary**.

---

## A. Required Vercel Environment Variables

Set these environment variables in your **Vercel Project Settings > Environment Variables**:

| Variable Name | Description | Example / Source |
| :--- | :--- | :--- |
| `VITE_FIREBASE_API_KEY` | Firebase Web API Key | `AIzaSy...` (Firebase Project Settings) |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID | `your-project` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket | `your-project.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Cloud Messaging Sender ID | `123456789012` |
| `VITE_FIREBASE_APP_ID` | Firebase Web Application ID | `1:123456789012:web:abcdef...` |
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloudinary Cloud Name | `dis7rvtue` (Cloudinary Dashboard) |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Cloudinary Unsigned Upload Preset | `inventory_upload` (Cloudinary Settings > Upload) |

---

## B. Environment Variable Target Environments

Make sure to select **all three environments** when adding each variable in Vercel:
- ✅ **Production**
- ✅ **Preview**
- ✅ **Development**

---

## C. Firebase Configuration Requirements

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Select your Firebase project (or create one).
3. Under **Project Settings (Gear icon) > General**:
   - Scroll down to **Your apps**.
   - If no Web App exists, click **Add app** (Select the `</>` Web icon), name it (e.g. `NexusStock Web`), and register it.
   - Copy the `firebaseConfig` keys into your Vercel Environment Variables.

---

## D. Firestore Requirements

1. In the Firebase Console, navigate to **Build > Firestore Database**.
2. Click **Create database** (Start in **Production mode** or with the provided security rules).
3. Select your Cloud Firestore location (e.g., `europe-west2`, `us-central1`, etc.).
4. Under the **Rules** tab in Firestore, paste the rules from `firestore.rules` located in this repository and click **Publish**.

---

## E. Firebase Authentication Requirements

1. In the Firebase Console, navigate to **Build > Authentication**.
2. Click **Get Started** and enable **Email/Password** under Sign-in method.
3. Under **Users**, you can manually create an initial Admin user or use the system defaults:
   - **Default Admin Email:** `admin@nexusstock.com`
   - **Default Admin Password:** `Admin@123456`
4. Under **Settings > Authorized domains**, add your Vercel domain (e.g., `your-app.vercel.app`).

---

## F. Cloudinary Configuration

1. Log in to [Cloudinary Console](https://cloudinary.com/console).
2. Copy your **Cloud Name** into `VITE_CLOUDINARY_CLOUD_NAME`.
3. Go to **Settings (Gear icon) > Upload > Upload presets**:
   - Click **Add upload preset**.
   - Set **Signing Mode** to **Unsigned**.
   - Set the preset name (e.g., `inventory_upload`).
   - Set the folder to `inventory`.
   - Save and copy the preset name into `VITE_CLOUDINARY_UPLOAD_PRESET`.

---

## G. Gemini / Google AI Configuration (If Applicable)

- If server-side Gemini features are enabled in the future, supply `GEMINI_API_KEY` as a server-side environment variable.
- Client-side code never exposes private Gemini API keys.

---

## H. Vercel Build Settings

When importing the project in Vercel, use the following configuration:

| Setting | Value |
| :--- | :--- |
| **Framework Preset** | `Vite` |
| **Build Command** | `npm run build` (or `vite build`) |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |
| **Node.js Version** | `18.x` or `20.x` |

---

## I. How to Deploy from GitHub to Vercel

1. Push this repository to your GitHub account:
   ```bash
   git add .
   git commit -m "Prepare production build for Vercel deployment"
   git push origin main
   ```
2. Log in to [Vercel Dashboard](https://vercel.com).
3. Click **Add New > Project** and select your GitHub repository.
4. Expand **Environment Variables** and add all 8 variables listed in Section A.
5. Click **Deploy**.

---

## J. How to Redeploy After Changing Environment Variables

1. In Vercel, go to your project dashboard.
2. Go to **Settings > Environment Variables** and update or add the required keys.
3. Navigate to the **Deployments** tab.
4. Click the three dots `...` next to the latest deployment and click **Redeploy** (or trigger a new commit in GitHub).
5. Ensure **"Use existing Build Cache"** is unchecked if updating fundamental environment dependencies.

---

## K. Production Testing Checklist

After your Vercel deployment goes live:
- [ ] **SPA Route Refresh:** Visit `/products`, `/pos-sales`, `/stock-in`, `/settings` and hit browser refresh to confirm no 404 occurs.
- [ ] **Admin Authentication:** Sign in using `admin@nexusstock.com` and password `Admin@123456`.
- [ ] **Cloud Persistence Test:**
  - Create a new Product or Stock In on Device A / Browser 1.
  - Open the Vercel app on Device B / Incognito window.
  - Verify that the newly created record is immediately visible.
- [ ] **Offline & Auto-Sync Test:**
  - Disable network connection in browser DevTools (Network > Offline).
  - Create a record (e.g. POS Sale or Stock In).
  - Re-enable network connection.
  - Confirm the banner shows "Internet connected — Synchronizing local data to Cloud..." and data syncs to Firestore.
- [ ] **Image Upload Test:**
  - Edit or add a product and upload an image.
  - Confirm the Cloudinary image URL loads properly across different devices.
