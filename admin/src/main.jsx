import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { initTheme } from "@/app/theme";
import { App } from "@/app/App";

initTheme();
createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
