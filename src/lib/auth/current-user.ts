import 'server-only';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getDb } from '@/lib/db';
import { readSessionToken } from './cookies';
import { getSessionUser } from './sessions';

/** O que as telas podem saber do usuário logado. Nunca devolva o registro inteiro (tem o hash da senha). */
export interface CurrentUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarKey: string | null;
  /** Falta nas contas criadas antes da idade mínima (27/11/2026): elas informam no próximo acesso. */
  hasBirthDate: boolean;
}

/** Usuário da sessão atual, ou `null`. Lê o cookie: use dentro de um `<Suspense>`. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  await connection(); // a validade da sessão depende da hora: nunca pré-renderizar
  const token = await readSessionToken();
  if (!token) return null;
  const user = await getSessionUser(await getDb(), token);
  return user && { id: user.id, name: user.name, username: user.username, email: user.email, avatarKey: user.avatarKey, hasBirthDate: user.birthDate !== null };
}

/**
 * Quem está vendo uma tela de quem está logado. Sem sessão, vai para o login; conta sem data de nascimento vai
 * informar a data antes de seguir (idade mínima de 16 anos, ECA Digital).
 */
export async function requireViewer(): Promise<CurrentUser> {
  const viewer = await getCurrentUser();
  if (!viewer) redirect('/entrar');
  if (!viewer.hasBirthDate) redirect('/completar-cadastro');
  return viewer;
}
