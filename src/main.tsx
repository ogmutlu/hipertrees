import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, Recovery } from "./App";
import { Workspace } from "./storage";
import "./style.css";

const element = document.getElementById("root");
if (!element) throw new Error("App root is missing");
const root = createRoot(element);
try {
  const workspace = new Workspace(localStorage, Date.now());
  root.render(
    <StrictMode>
      <App workspace={workspace} />
    </StrictMode>,
  );
} catch (error: unknown) {
  root.render(<Recovery error={error} />);
}
