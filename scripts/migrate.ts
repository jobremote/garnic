/**
 * Aplica as migrações em `drizzle/` no banco apontado por DATABASE_URL (Neon).
 * Roda na publicação, primeiro em homologação e depois em produção: `npm run db:migrate`.
 */
import { connect } from '../src/lib/db/connect';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não está definida. Este comando migra o banco Neon; o banco local migra sozinho ao abrir.');
    process.exit(1);
  }

  const { migrate } = await connect({ url });
  await migrate();
  console.log('Migrações aplicadas.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
