import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { initTheme } from "@/app/theme";

initTheme();
createRoot(document.getElementById("root")).render(
  <StrictMode><main className="p-6"><h1 className="text-2xl font-bold">نسمات — لوحة الإدارة</h1></main></StrictMode>
);
