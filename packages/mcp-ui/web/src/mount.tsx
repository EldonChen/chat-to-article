import { createRoot } from "react-dom/client";
import "./index.css";
import { ReviewApp, type ViewMap } from "./shell/ReviewApp.tsx";

export function mount(views: ViewMap) {
  createRoot(document.getElementById("root")!).render(<ReviewApp views={views} />);
}
