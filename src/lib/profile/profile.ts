import { and, eq, isNotNull, max, sql } from 'drizzle-orm';
import { isUsernameTaken } from '@/lib/auth/users';
import { checkName, normalizeName, usernameError } from '@/lib/auth/validation';
import { messages } from '@/lib/auth/messages';
import type { Db } from '@/lib/db/connect';
import { profileNameChanges, users } from '@/lib/db/schema';
import { profileMessages } from './messages';

/** Regras do perfil (`01_produto/regras-de-negocio/perfil.md`). */
export const BIO_MAX = 160;
export const NAME_COOLDOWN_DAYS = 60;
export const USERNAME_COOLDOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** O que qualquer pessoa logada vê de um perfil (nunca e-mail, hash de senha ou histórico). */
export interface PublicProfile {
  id: string;
  name: string;
  username: string;
  bio: string | null;
  avatarKey: string | null;
  coverKey: string | null;
}

/** Perfil pelo @usuário. Conta que ainda não validou o e-mail não tem perfil. */
export async function getPublicProfile(db: Db, username: string): Promise<PublicProfile | null> {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      bio: users.bio,
      avatarKey: users.avatarKey,
      coverKey: users.coverKey,
    })
    .from(users)
    .where(and(eq(users.username, username), isNotNull(users.emailVerifiedAt)))
    .limit(1);
  return row ?? null;
}

export interface EditLocks {
  /** Quando o nome volta a poder ser trocado; `null` se já pode. */
  nameUnlocksAt: Date | null;
  /** Quando o @usuário volta a poder ser trocado; `null` se já pode. */
  usernameUnlocksAt: Date | null;
}

/** Data da última troca de nome (a linha inicial do cadastro, com `oldValue` nulo, não conta). */
async function lastNameChange(db: Db, userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: max(profileNameChanges.changedAt) })
    .from(profileNameChanges)
    .where(and(eq(profileNameChanges.userId, userId), eq(profileNameChanges.field, 'name'), isNotNull(profileNameChanges.oldValue)));
  return row?.at ? new Date(row.at) : null;
}

const unlockAt = (last: Date | null, days: number, now: Date): Date | null => {
  if (!last) return null;
  const at = new Date(last.getTime() + days * DAY_MS);
  return at.getTime() > now.getTime() ? at : null;
};

/** Até quando nome e @usuário ficam travados (para a tela de editar mostrar a data). */
export async function getEditLocks(db: Db, userId: string, now = new Date()): Promise<EditLocks> {
  const [user] = await db.select({ usernameChangedAt: users.usernameChangedAt }).from(users).where(eq(users.id, userId)).limit(1);
  return {
    nameUnlocksAt: unlockAt(await lastNameChange(db, userId), NAME_COOLDOWN_DAYS, now),
    usernameUnlocksAt: unlockAt(user?.usernameChangedAt ?? null, USERNAME_COOLDOWN_DAYS, now),
  };
}

/** Bio só texto: quebras de linha viram espaço e as pontas são aparadas. */
export const normalizeBio = (bio: string) => bio.replace(/\s*[\r\n]+\s*/g, ' ').trim();

export interface ProfileInput {
  name: string;
  username: string;
  bio: string;
  /** `undefined` mantém a imagem atual; `null` remove; texto é a chave da imagem nova. */
  avatarKey?: string | null;
  coverKey?: string | null;
}

export type ProfileErrors = Partial<Record<'name' | 'username' | 'bio', string>>;

export type UpdateProfileResult =
  | { ok: true; username: string; replacedKeys: string[] }
  | { ok: false; errors: ProfileErrors };

/**
 * Salva o perfil. Nome: uma troca a cada 60 dias; @usuário: uma a cada 30 dias. Cada troca vai para o histórico
 * interno (`profile_name_changes`) na mesma instrução SQL que altera o usuário, então as duas coisas acontecem juntas
 * ou nenhuma (o Neon HTTP não tem transações). Nome igual ao atual não é revalidado (conta do Google pode ter nome de
 * uma palavra só e continuar editando a bio).
 */
export async function updateProfile(db: Db, userId: string, input: ProfileInput, now = new Date()): Promise<UpdateProfileResult> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error('Usuário não encontrado.');

  const errors: ProfileErrors = {};
  const name = normalizeName(input.name);
  const nameChanged = name !== user.name;
  if (nameChanged) {
    const problem = checkName(name);
    const m = messages.signup;
    if (problem === 'required') errors.name = m.nameRequired;
    else if (problem === 'long') errors.name = m.nameLong;
    else if (problem === 'chars') errors.name = m.nameChars;
    else if (problem === 'names') errors.name = m.nameNames;
    else if (problem === 'short') errors.name = m.nameShort;
    else {
      const unlocksAt = unlockAt(await lastNameChange(db, userId), NAME_COOLDOWN_DAYS, now);
      if (unlocksAt) errors.name = profileMessages.nameLocked(unlocksAt);
    }
  }

  const username = input.username;
  const usernameChanged = username !== user.username;
  if (usernameChanged) {
    const problem = usernameError(username);
    if (problem) errors.username = problem;
    else {
      const unlocksAt = unlockAt(user.usernameChangedAt, USERNAME_COOLDOWN_DAYS, now);
      if (unlocksAt) errors.username = profileMessages.usernameLocked(unlocksAt);
      else if (await isUsernameTaken(db, username, now)) errors.username = messages.signup.usernameTaken;
    }
  }

  const bio = normalizeBio(input.bio);
  if (bio.length > BIO_MAX) errors.bio = profileMessages.bioTooLong(bio.length);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const avatarKey = input.avatarKey === undefined ? user.avatarKey : input.avatarKey;
  const coverKey = input.coverKey === undefined ? user.coverKey : input.coverKey;
  const at = now.toISOString();
  try {
    await db.execute(sql`
      WITH changed AS (
        UPDATE users SET
          name = ${name}::text,
          username = ${username}::text,
          bio = ${bio === '' ? null : bio}::text,
          avatar_key = ${avatarKey}::text,
          cover_key = ${coverKey}::text,
          username_changed_at = CASE WHEN ${usernameChanged}::boolean THEN ${at}::timestamptz ELSE username_changed_at END
        WHERE id = ${userId}::uuid
        RETURNING id
      )
      INSERT INTO profile_name_changes (user_id, field, old_value, new_value, changed_at)
      SELECT id, 'name', ${user.name}::text, ${name}::text, ${at}::timestamptz FROM changed WHERE ${nameChanged}::boolean
      UNION ALL
      SELECT id, 'username', ${user.username}::text, ${username}::text, ${at}::timestamptz FROM changed WHERE ${usernameChanged}::boolean
    `);
  } catch (error) {
    // Duas pessoas pegando o mesmo @usuário ao mesmo tempo: o índice único decide.
    const text = String((error as { cause?: { message?: string } })?.cause?.message ?? (error as Error).message);
    if (text.includes('users_username_key')) return { ok: false, errors: { username: messages.signup.usernameTaken } };
    throw error;
  }

  const replacedKeys: string[] = [];
  if (avatarKey !== user.avatarKey && user.avatarKey) replacedKeys.push(user.avatarKey);
  if (coverKey !== user.coverKey && user.coverKey) replacedKeys.push(user.coverKey);
  return { ok: true, username, replacedKeys };
}
