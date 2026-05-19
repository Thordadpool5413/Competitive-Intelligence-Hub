import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const strictBuild = process.env.CIH_STRICT_BUILD === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  typescript: {
    ignoreBuildErrors: !strictBuild
  },
  eslint: {
    ignoreDuringBuilds: !strictBuild
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': __dirname
    };
    return config;
  }
};

export default nextConfig;
