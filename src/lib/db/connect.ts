import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Connection {
  db: Db;
  /** Aplica as migrações da pasta `drizzle/`. */
  migrate: () => Promise<void>;
}

export interface ConnectOptions {
  /** Neon (produção e homologação). Sem ele, usa o Postgres embutido (PGlite). */
  url?: string;
  /** Pasta do PGlite em disco. Sem ela, o banco fica só em memória (testes). */
  dataDir?: string;
}

const migrationsFolder = () => path.join(process.cwd(), 'drizzle');

/**
 * Abre o banco: Neon quando há `url`, senão o Postgres embutido (PGlite).
 * Os drivers são carregados sob demanda, então produção não carrega o PGlite e vice-versa.
 * Não importe este arquivo em componentes de cliente.
 */
export async function connect({ url, dataDir }: ConnectOptions = {}): Promise<Connection> {
  if (url) {
    const [{ neon }, { drizzle }, { migrate }] = await Promise.all([
      import('@neondatabase/serverless'),
      import('drizzle-orm/neon-http'),
      import('drizzle-orm/neon-http/migrator'),
    ]);
    const db = drizzle({ client: neon(url), schema });
    return { db: db as unknown as Db, migrate: () => migrate(db, { migrationsFolder: migrationsFolder() }) };
  }

  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
    import('drizzle-orm/pglite/migrator'),
  ]);
  // O PGlite não cria as pastas pai sozinho.
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle({ client, schema });
  return { db: db as unknown as Db, migrate: () => migrate(db, { migrationsFolder: migrationsFolder() }) };
}
