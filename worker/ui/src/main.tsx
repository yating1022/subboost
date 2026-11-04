import * as React from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@subboost/ui/components/ui/toaster";
import { App } from "./app";
import "./styles.css";

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
      <Toaster />
    </React.StrictMode>
  );
}
