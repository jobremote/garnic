import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
    /** Enquadramento vertical da capa, de 0 (topo) a 100 (base). 50 = centro. */
    coverPosition: smallint('cover_position').notNull().default(50),
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

/**
 * Jogo conhecido pelo Garnic: cópia local dos dados do IGDB, criada na primeira vez que alguém adiciona o jogo.
 * `igdbId` identifica o jogo no IGDB. A capa é só o `image_id` do IGDB (a URL é montada na hora, em `src/lib/igdb`).
 */
export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    igdbId: integer('igdb_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug'),
    coverImageId: text('cover_image_id'),
    /** Data do primeiro lançamento (o IGDB manda um Unix timestamp). */
    releasedAt: instant('released_at'),
    /** Nomes das plataformas em que o jogo saiu. */
    platforms: text('platforms').array().notNull().default([]),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('games_igdb_id_key').on(table.igdbId)],
);

/**
 * Entrada da Game Shelf: um jogo na estante de uma pessoa. Uma entrada por jogo por usuário (rejogo é da v2).
 * `status` é um de `quero-jogar`, `parado`, `jogando`, `zerado` (ver `src/lib/shelf/status.ts`).
 * `statusChangedAt` marca a última mudança de coluna: ordena os cards (mais recente primeiro) e, em Zerado, é a data
 * de conclusão usada pelo contador "Zerados no ano" enquanto não houver data de fim informada.
 */
export const shelfEntries = pgTable(
  'shelf_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    status: text('status').notNull(),
    statusChangedAt: instant('status_changed_at').notNull().defaultNow(),
    createdAt: instant('created_at').notNull().defaultNow(),
    /** Plataforma em que a pessoa jogou: um dos nomes de `games.platforms`. Opcional. */
    platform: text('platform'),
    /** Nota de 1 a 5, inteira. Opcional, em qualquer status. */
    rating: smallint('rating'),
    review: text('review'),
    reviewSpoiler: boolean('review_spoiler').notNull().default(false),
    /** Início e fim da jogatina, em mês/ano. Cada par vem completo ou vazio; fim não anterior ao início. */
    startedMonth: smallint('started_month'),
    startedYear: smallint('started_year'),
    endedMonth: smallint('ended_month'),
    endedYear: smallint('ended_year'),
    /** Tempo de jogo em minutos. Só se informa em Zerado, mas é mantido ao sair de Zerado. */
    playMinutes: integer('play_minutes'),
    /** Screenshot da entrada: uma por entrada, pública (referência da imagem no armazenamento). */
    screenshotRef: text('screenshot_ref'),
    screenshotSpoiler: boolean('screenshot_spoiler').notNull().default(false),
  },
  (table) => [
    uniqueIndex('shelf_entries_user_game_key').on(table.userId, table.gameId),
    index('shelf_entries_user_status_idx').on(table.userId, table.status, table.statusChangedAt),
  ],
);

/**
 * Tag do usuário na Game Shelf: nome e cor (neutral, wine, petrol, olive, rose, sky). São da pessoa e separadas das
 * categorias do IGDB. O nome é único por pessoa sem diferenciar maiúsculas de minúsculas.
 */
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('neutral'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('tags_user_name_key').on(table.userId, sql`lower(${table.name})`)],
);

/** Tags de uma entrada. Excluir a tag (ou a entrada) remove só a associação; o jogo continua na Game Shelf. */
export const shelfEntryTags = pgTable(
  'shelf_entry_tags',
  {
    entryId: uuid('entry_id')
      .notNull()
      .references(() => shelfEntries.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.entryId, table.tagId] }), index('shelf_entry_tags_tag_idx').on(table.tagId)],
);

/**
 * Denúncia de screenshot. Só registra (decisão de 11/11/2026): quem denunciou, qual imagem e o motivo, para revisão
 * posterior. Não esconde a imagem nem tem painel de moderação. A referência da imagem é guardada junto, para a denúncia
 * continuar fazendo sentido se a entrada for trocada ou removida (o entry_id fica nulo se a entrada sair).
 */
export const screenshotReports = pgTable(
  'screenshot_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id').references(() => shelfEntries.id, { onDelete: 'set null' }),
    screenshotRef: text('screenshot_ref').notNull(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** inappropriate, spam, spoiler ou other. */
    reason: text('reason').notNull(),
    details: text('details'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('screenshot_reports_reporter_image_key').on(table.reporterId, table.screenshotRef), index('screenshot_reports_entry_idx').on(table.entryId)],
);

export type User = typeof users.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Game = typeof games.$inferSelect;
export type ShelfEntry = typeof shelfEntries.$inferSelect;
