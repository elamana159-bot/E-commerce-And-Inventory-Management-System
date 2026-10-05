import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  try {
    const root = createRoot(rootElement);
    root.render(<App />);
  } catch (err) {
    console.error("Critical mounting error:", err);
    rootElement.innerHTML = `
      <div style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; text-align: center;">
        <div style="background: #1e293b; border: 1px solid #334155; padding: 32px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); max-width: 480px; width: 100%;">
          <div style="font-size: 32px; margin-bottom: 12px;">📦</div>
          <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">NexusStock</h2>
          <p style="font-size: 14px; color: #94a3b8; margin-bottom: 24px;">Application is starting up. If this screen persists, click below to refresh.</p>
          <button onclick="window.location.reload()" style="background: #2563eb; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
            Reload Application
          </button>
        </div>
      </div>
    `;
  }
}
