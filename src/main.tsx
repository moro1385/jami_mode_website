import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import {ApplicationErrorBoundary} from "./shared/presentation/ApplicationErrorBoundary";
import "./assets/fonts/Vazirmatn-FD-custom.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<ApplicationErrorBoundary><App /></ApplicationErrorBoundary>);
