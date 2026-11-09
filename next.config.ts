import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // O Postgres embutido (WebAssembly) precisa rodar como pacote externo do servidor.
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default nextConfig;
