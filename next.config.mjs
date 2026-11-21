/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'dm.takaratomy.co.jp',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;

