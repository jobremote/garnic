/**
 * Build da publicação na Vercel: `npm run build:deploy`.
 *
 * Nas branches `develop` (homologação) e `main` (produção) aplica as migrações no banco Neon do ambiente
 * (DATABASE_URL) antes de gerar o build; se a migração falhar, a publicação para e a versão anterior continua no ar.
 * Em qualquer outra branch (pull requests) só gera o build, sem tocar em banco nenhum.
 */
import { spawnSync } from 'node:child_process';
import { connect } from '../src/lib/db/connect';

const branch = process.env.VERCEL_GIT_COMMIT_REF;
const migrates = branch === 'develop' || branch === 'main';

async function main() {
  if (migrates) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error(`DATABASE_URL não está definida para a branch ${branch}. Configure-a nas variáveis de ambiente da Vercel.`);
      process.exit(1);
    }
    const { migrate } = await connect({ url });
    await migrate();
    console.log(`Migrações aplicadas (${branch}).`);
  } else {
    console.log(`Branch ${branch ?? 'local'}: sem migração de banco.`);
  }

  const build = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell: true });
  process.exit(build.status ?? 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
