import 'server-only';
import { connect, type Db } from './connect';

export type { Db } from './connect';

/**
 * Banco da aplicação, uma instância por processo.
 * - Com `DATABASE_URL`: Neon. As migrações rodam na publicação (`npm run db:migrate`), não aqui.
 * - Sem `DATABASE_URL` (desenvolvimento local): Postgres embutido em `.data/pglite`, migrado ao abrir.
 * - Em produção sem `DATABASE_URL`: erro, para nunca cair no banco local sem querer.
 */
const globalForDb = globalThis as unknown as { garnicDb?: Promise<Db> };

async function open(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) return (await connect({ url })).db;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL não está definida. Em produção o Garnic exige o banco Neon.');
  }
  const { db, migrate } = await connect({ dataDir: '.data/pglite' });
  await migrate();
  return db;
}

export function getDb(): Promise<Db> {
  // Guardado no globalThis para sobreviver ao recarregamento do servidor de desenvolvimento.
  globalForDb.garnicDb ??= open().catch((error: unknown) => {
    // Uma falha ao abrir o banco não pode ficar em cache: a próxima chamada tenta de novo.
    globalForDb.garnicDb = undefined;
    throw error;
  });
  return globalForDb.garnicDb;
}
