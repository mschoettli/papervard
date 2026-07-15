/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {},
  webpack(config, { isServer }) {
    // Cornerstone's Emscripten codecs contain guarded Node.js branches. They
    // are never executed in the browser, but Webpack still tries to resolve
    // their `fs` and `path` imports while creating the client bundle.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false
      };
    }

    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true
    };

    return config;
  }
};

export default nextConfig;
