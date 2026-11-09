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
