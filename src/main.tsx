import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { ConvexProvider, ConvexReactClient } from "convex/react"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { TooltipProvider } from "@/components/ui/tooltip"

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <ThemeProvider>
        <TooltipProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </ConvexProvider>
  </StrictMode>
)
