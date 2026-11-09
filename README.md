# Garnic

Rede social de gamers: catálogo pessoal de jogos (IGDB) e feed no mesmo lugar. MVP web responsivo, em português.

As regras de produto, o PRD e as decisões ficam na pasta de gestão do projeto (`01_produto`, `00_gestao`), fora deste repositório.

## Estado atual

Entregas feitas: **cadastro por e-mail, validação por código de 6 dígitos, login e recuperar senha**. Entram nas próximas: cadastro e login com Google, e o resto do MVP (perfil, estante, feed).

| Rota | O que é |
| --- | --- |
| `/entrar` | Login com e-mail e senha |
| `/cadastrar` | Cadastro por e-mail |
| `/cadastrar/validar` | Código de 6 dígitos enviado por e-mail |
| `/cadastrar/validado` | E-mail validado |
| `/cadastro-expirado` | Conta não validada em 24 h foi excluída |
| `/recuperar-senha` | Esqueci a senha: pede o e-mail e envia o link |
| `/redefinir-senha?token=…` | Criar nova senha (link de 30 minutos, uso único) |
| `/redefinir-senha/concluida` | Senha atualizada |
| `/termos`, `/privacidade` | Páginas provisórias (os textos ainda serão redigidos) |
| `/` | Início provisório, só para quem está logado |
| `/dev/emails` | Caixa de saída de desenvolvimento (só fora de produção) |

## Stack

Next.js (App Router, Cache Components) + TypeScript, Postgres com Drizzle (Neon na nuvem, Postgres embutido no computador), design system **NogasDS**. Detalhes em `05_tecnico/arquitetura/stack-e-esteira.md`.

## Rodar no computador

Precisa de Node 20 ou superior (testado com Node 24). Não precisa de conta externa nem de Docker.

```bash
npm install
npm run dev        # http://localhost:3000
```

- **Banco:** sem `DATABASE_URL`, o Garnic usa um Postgres embutido (PGlite) em `.data/pglite`, criado e migrado sozinho. Para começar do zero, apague a pasta `.data`.
- **E-mail:** o código de 6 dígitos e o link de recuperar senha não são enviados de verdade. Eles aparecem no terminal e em `http://localhost:3000/dev/emails`.
- **Variáveis:** copie `.env.example` para `.env.local` só se precisar mudar algo (por exemplo, `APP_URL`, se rodar em outra porta, para o link do e-mail apontar certo). Nenhuma senha, chave ou token entra no repositório (ele é público).

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run check` | Lint, tipos, testes e build (o mesmo que o CI roda) |
| `npm test` | Testes (Vitest): regras de cadastro, código, sessão e telas |
| `npm run db:generate` | Gera uma migração a partir de `src/lib/db/schema.ts` |
| `npm run db:migrate` | Aplica as migrações no banco de `DATABASE_URL` (Neon) |
| `npm run db:purge` | Exclui contas não validadas há mais de 24 h |

## Como o código está organizado

```
src/
  app/
    (auth)/            telas de login e cadastro (layout de tela dividida do Figma)
      _components/     formulários e partes das telas
      actions.ts       ações de servidor: cadastro, login, validação e sair
    dev/emails/        caixa de saída de desenvolvimento
  lib/
    auth/              regras de cadastro, código, sessão e senha (sem dependência do Next)
    db/                esquema, conexão (Neon ou PGlite) e migrações
    email/             envio de e-mail (hoje só o de desenvolvimento)
drizzle/               migrações SQL
```

A lógica de cadastro, código e sessão fica em `src/lib/auth` e recebe o banco e a hora como parâmetro: por isso os testes rodam contra um Postgres em memória, sem mocks de banco.

## Design system (NogasDS)

O Garnic só **consome** o NogasDS (`jobremote/nogasds`), instalado por tag do GitHub. Regras:

- Componente que faltar nasce primeiro no Figma e no NogasDS, nunca improvisado numa tela do Garnic.
- Estilos usam só tokens **semânticos** (`--nds-surface-*`, `--nds-text-*`, `--nds-space-gap-*`, `--nds-space-inset-*`, `--nds-stroke-*`, `--nds-radius-*`). Nunca os primitivos (`--nds-space-2`, `--nds-stroke-hairline` etc.).
- Para atualizar: troque a tag em `package.json` (`#vX.Y.Z`) e rode `npm install`.

## Esteira

Branch própria, pull request para `develop` (homologação), pull request para `main` (produção, com aprovação). O CI roda em todo pull request. Segredos ficam só nas configurações de cada ambiente.
