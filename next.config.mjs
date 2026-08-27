/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produce a minimal standalone server bundle for an efficient Docker image.
  output: "standalone",
  images: {
    // Item/champion icons load directly from the Data Dragon CDN as plain <img>.
    // Skipping the optimizer keeps the Docker image lean (no sharp) and avoids
    // per-request work for tiny, cacheable CDN assets.
    unoptimized: true,
  },
};

export default nextConfig;
