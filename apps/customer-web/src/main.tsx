import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { App, AppProviders, createQueryClient } from "./App";
import "./index.css";

const client = createQueryClient();
const container = document.getElementById("root")!;
const tree = (
  <StrictMode>
    <BrowserRouter>
      <AppProviders client={client}>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>
);

// Prerender edilmiş HTML tarayıcılar için SEO içeriğidir; istemci oturum/sepet durumuyla yeniden çizer
// (localStorage durumu nedeniyle hydration uyuşmazlığı riskine girilmez).
container.innerHTML = "";
createRoot(container).render(tree);

if ("serviceWorker" in navigator) {
  registerSW({ immediate: true });
}
