import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows the Next.js dev server to accept requests coming from origins other
  // than localhost — needed because we expose this app publicly through a
  // Cloudflare Tunnel, whose *.trycloudflare.com address changes each time the
  // tunnel is restarted. Without this, the dev server silently blocks some
  // cross-origin requests/assets, which breaks client-side interactivity (e.g.
  // the login form falling back to a full page reload instead of using AJAX).
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
