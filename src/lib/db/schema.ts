import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const instant = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Usuário. `email` e `username` são guardados em minúsculas (a normalização é feita antes de gravar).
 * Conta só vira usável quando `emailVerifiedAt` está preenchido; contas não validadas são excluídas após 24 h.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    username: text('username').notNull(),
    email: text('email').notNull(),
    /** Nulo para contas criadas só com Google (entrega futura). */
    passwordHash: text('password_hash'),
    emailVerifiedAt: instant('email_verified_at'),
    /** Última troca de @usuário: a troca só é permitida uma vez a cada 30 dias. */
    usernameChangedAt: instant('username_changed_at'),
    /** Bio do perfil: só texto, até 160 caracteres. */
    bio: text('bio'),
    /** Chave da imagem de avatar no armazenamento (`avatars/<uuid>.jpg`). Nulo: avatar com a inicial do nome. */
    avatarKey: text('avatar_key'),
    /** Chave da imagem de capa no armazenamento (`covers/<uuid>.jpg`). Nulo: capa de cor sólida. */
    coverKey: text('cover_key'),
    termsAcceptedAt: instant('terms_accepted_at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_username_key').on(table.username),
    uniqueIndex('users_email_key').on(table.email),
    index('users_unverified_created_idx').on(table.emailVerifiedAt, table.createdAt),
  ],
);

/**
 * Histórico interno de nome e @usuário (decisão de 10/11/2026). Uma linha por troca, mais uma linha inicial no
 * cadastro (`oldValue` nulo). Não aparece em nenhuma tela: serve à moderação e à regra de uma troca de nome a cada
 * 60 dias (a última troca vem daqui). Sai junto com a conta (cascata) até a política de retenção ser definida.
 */
export const profileNameChanges = pgTable(
  'profile_name_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `name` ou `username`. */
    field: text('field').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value').notNull(),
    changedAt: instant('changed_at').notNull().defaultNow(),
  },
  (table) => [index('profile_name_changes_user_field_idx').on(table.userId, table.field, table.changedAt)],
);

/**
 * Código de validação do e-mail: 6 dígitos, 10 minutos, uso único.
 * Só o hash (HMAC) é guardado. 5 tentativas erradas invalidam o código.
 */
export const emailVerificationCodes = pgTable(
  'email_verification_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    usedAt: instant('used_at'),
    invalidatedAt: instant('invalidated_at'),
    /** `attempts` (5 erros) ou `replaced` (um código novo foi pedido). */
    invalidatedReason: text('invalidated_reason'),
  },
  (table) => [index('email_verification_codes_user_created_idx').on(table.userId, table.createdAt)],
);

/**
 * Link de recuperar senha: token aleatório de uso único, 30 minutos. O e-mail leva o token; aqui fica só o hash dele.
 * Um pedido novo invalida o anterior (`invalidatedReason = replaced`); usar o link marca `usedAt`.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    usedAt: instant('used_at'),
    invalidatedAt: instant('invalidated_at'),
    invalidatedReason: text('invalidated_reason'),
  },
  (table) => [
    uniqueIndex('password_reset_tokens_hash_key').on(table.tokenHash),
    index('password_reset_tokens_user_created_idx').on(table.userId, table.createdAt),
  ],
);

/**
 * Contas de login externas (Google). Uma conta do Google (`provider_account_id` = o `sub` dela) pertence a um só
 * usuário; um usuário pode entrar por Google e por e-mail e senha.
 */
export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('oauth_accounts_provider_account_key').on(table.provider, table.providerAccountId),
    index('oauth_accounts_user_idx').on(table.userId),
  ],
);

/** Sessão de login. O cookie leva um token aleatório; aqui fica só o hash dele. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: instant('expires_at').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

/** Caixa de saída de desenvolvimento: guarda os e-mails que, em produção, seriam enviados. Só é gravada fora de produção. */
export const devEmails = pgTable('dev_emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  createdAt: instant('created_at').notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
