import 'server-only';
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
}

/** Usuário da sessão atual, ou `null`. Lê o cookie: use dentro de um `<Suspense>`. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  await connection(); // a validade da sessão depende da hora: nunca pré-renderizar
  const token = await readSessionToken();
  if (!token) return null;
  const user = await getSessionUser(await getDb(), token);
  return user && { id: user.id, name: user.name, username: user.username, email: user.email };
}
