/** @type {import('next').NextConfig} */
const isExport = process.env.NEXT_EXPORT === 'true';

const nextConfig = {
  ...(isExport ? { output: 'export' } : { serverExternalPackages: ['better-sqlite3'] }),
  images: {
    unoptimized: true,
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

