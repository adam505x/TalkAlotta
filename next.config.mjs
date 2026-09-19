/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module; it must not be bundled by webpack/turbopack.
  serverExternalPackages: ['better-sqlite3'],
  images: { unoptimized: true },
};

export default nextConfig;
