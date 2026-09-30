import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @shelf/ui ships TypeScript sources; @shelf/shared is compiled to dist but is listed as spec §7.5 asks
  transpilePackages: ['@shelf/shared', '@shelf/ui'],
  // keep `next dev` from generating extra instruction files in this folder
  agentRules: false,
};

export default nextConfig;
