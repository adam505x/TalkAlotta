/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module; it must not be bundled by webpack/turbopack.
  // @elastic/elasticsearch is pure JS but pulls in undici and its own transport,
  // which bundle badly and gain nothing from being bundled on the server.
  serverExternalPackages: ['better-sqlite3', '@elastic/elasticsearch'],
  images: { unoptimized: true },

  // Dev only. Next blocks cross-origin requests to dev assets, so an iPad
  // opening the LAN address gets the HTML but none of the client bundle, and
  // the page sits on its loading state forever because it never hydrates.
  // A `*` matches exactly one hostname label, which for an IP is one octet,
  // so these cover the usual private ranges and the laptop's address does not
  // have to be re-added every time the wifi changes.
  allowedDevOrigins: ['10.*.*.*', '192.168.*.*', '172.16.*.*', '172.20.10.*'],
};

export default nextConfig;
