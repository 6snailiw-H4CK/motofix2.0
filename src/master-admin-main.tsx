import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MasterAdminApp } from "./MasterAdminApp";
import "./index.css";

const enableStrictMode = import.meta.env.VITE_ENABLE_STRICT_MODE !== "false";

createRoot(document.getElementById("root")!).render(
  enableStrictMode ? (
    <StrictMode>
      <MasterAdminApp />
    </StrictMode>
  ) : (
    <MasterAdminApp />
  ),
);
