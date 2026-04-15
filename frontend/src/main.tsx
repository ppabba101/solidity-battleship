import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import App from "./App";
import { router } from "./router";
import "./index.css";

// --- CRS proxy shim ---------------------------------------------------------
// @aztec/bb.js fetches the BN254 CRS from crs.aztec-cdn.foundation (a 6.4 GB
// file, queried with Range requests). In the dev/demo context that cross-
// origin HTTP/2 range request is fragile (observed ERR_HTTP2_PROTOCOL_ERROR).
// We ship a pre-trimmed slice of g1.dat + full g2.dat under /crs/* and rewrite
// any bb.js fetch to the local copies.
const CRS_HOSTS = [
  "https://crs.aztec-cdn.foundation",
  "https://crs.aztec-labs.com",
];
const origFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
  for (const host of CRS_HOSTS) {
    if (url.startsWith(host + "/g1.dat")) {
      return origFetch("/crs/g1.dat", init);
    }
    if (url.startsWith(host + "/g2.dat")) {
      return origFetch("/crs/g2.dat", init);
    }
  }
  return origFetch(input as RequestInfo, init);
}) as typeof window.fetch;
// ---------------------------------------------------------------------------

const env = import.meta.env as Record<string, string | undefined>;
const privyAppId = env.VITE_PRIVY_APP_ID;
const localHotseat = env.VITE_LOCAL_HOTSEAT === "1";

// Hot-seat bypass: when explicitly requested OR when no Privy app id is
// configured, mount the legacy single-page <App /> at root. This keeps
// `scripts/demo-fast.sh` working without a Privy account and gives dev a
// zero-config path.
const bypassPrivy = localHotseat || !privyAppId;

const root = createRoot(document.getElementById("root")!);

if (bypassPrivy) {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  root.render(
    <React.StrictMode>
      <PrivyProvider
        appId={privyAppId!}
        config={{
          embeddedWallets: {
            ethereum: { createOnLogin: "users-without-wallets" },
          },
          loginMethods: ["email", "wallet"],
        }}
      >
        <RouterProvider router={router} />
      </PrivyProvider>
    </React.StrictMode>,
  );
}
