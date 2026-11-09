import { connect } from '@/lib/db/connect';

/** Banco novo em memória (PGlite) com as migrações aplicadas. Cada chamada devolve um banco isolado. */
export async function createTestDb() {
  const { db, migrate } = await connect();
  await migrate();
  return db;
}

export const validSignup = {
  name: 'Ana Souza',
  username: 'ana.souza',
  email: 'ana@email.com',
  password: 'Zk9#mPq2vL',
  confirmPassword: 'Zk9#mPq2vL',
  acceptedTerms: true,
};
