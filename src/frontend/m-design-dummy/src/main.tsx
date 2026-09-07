import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import "@dk-oasis/shared/variables.css";
import "@dk-oasis/shared/portal-shell.css";
import "@dk-oasis/shared/layout.css";
import "@dk-oasis/shared/form.css";
import "@dk-oasis/shared/grid.css";
import "@dk-oasis/shared/modal.css";
import "@dk-oasis/shared/tree.css";
import "./styles/app.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DmesUiProvider>
      <App />
    </DmesUiProvider>
  </StrictMode>,
);
