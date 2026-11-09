/**
 * Exclui as contas que não validaram o e-mail em 24 h (regra de cadastro). Também acontece sozinho a cada cadastro;
 * este comando serve para rodar em agendamento (por exemplo, uma tarefa diária) quando houver ambiente publicado.
 * Uso: DATABASE_URL=... npm run db:purge
 */
import { purgeUnverifiedUsers } from '../src/lib/auth/users';
import { connect } from '../src/lib/db/connect';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não está definida.');
    process.exit(1);
  }

  const { db } = await connect({ url });
  const removed = await purgeUnverifiedUsers(db);
  console.log(`${removed} conta(s) não validada(s) excluída(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
