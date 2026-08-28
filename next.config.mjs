/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone server bundle for an efficient Docker image. Vercel does its own
  // packaging and output-file-tracing, and "standalone" breaks its builder
  // (missing .nft.json), so only enable standalone when not building on Vercel.
  output: process.env.VERCEL ? undefined : "standalone",
  images: {
    // Item/champion icons load directly from the Data Dragon CDN as plain <img>.
    // Skipping the optimizer keeps the Docker image lean (no sharp) and avoids
    // per-request work for tiny, cacheable CDN assets.
    unoptimized: true,
  },
};

export default nextConfig;
