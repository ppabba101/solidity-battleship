import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
