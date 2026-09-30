import type { NextConfig } from 'next';

// Without the variable the deployed site would silently talk to http://localhost:4000 (src/lib/config.ts).
if (process.env.VERCEL && !process.env.NEXT_PUBLIC_API_URL?.trim()) {
  throw new Error('NEXT_PUBLIC_API_URL is not set: give the Vercel project the address of the deployed API.');
}

const nextConfig: NextConfig = {
  // @shelf/ui ships TypeScript sources; @shelf/shared is compiled to dist but is listed as spec §7.5 asks
  transpilePackages: ['@shelf/shared', '@shelf/ui'],
  // keep `next dev` from generating extra instruction files in this folder
  agentRules: false,
};

export default nextConfig;
