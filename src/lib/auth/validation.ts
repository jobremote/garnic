import { z } from 'zod';
import { commonPasswords } from './common-passwords';
import { messages } from './messages';

/** Regras de cadastro (`01_produto/regras-de-negocio/cadastro.md`). Sem dependência de servidor: também roda no cliente. */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
/** Nomes que ninguém pode usar como @usuário. */
export const RESERVED_USERNAMES: readonly string[] = ['admin', 'garnic', 'suporte'];

const USERNAME_PATTERN = /^[a-z0-9._]+$/;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Aparas e espaços repetidos viram um só: "  Ana   Souza " vira "Ana Souza". */
export const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ');

/** Partículas que podem aparecer no meio de um nome e que não contam como nome ("Maria da Silva"). */
const NAME_PARTICLES: ReadonlySet<string> = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const NAME_MIN_LETTERS = 2;
const NAME_MIN_WORDS = 2;
/** Uma palavra do nome: letras (com acento), com hífen ou apóstrofo só entre letras ("Anne-Marie", "D'Ávila"). */
const NAME_WORD = /^\p{L}+(?:['’-]\p{L}+)*$/u;

/**
 * Nome completo: nome e sobrenome (pelo menos 2 nomes, cada um com pelo menos 2 letras). As partículas
 * (de, da, do, das, dos, e) são liberadas e não contam. Só letras, espaço, hífen e apóstrofo; até 100 caracteres.
 */
export function checkName(input: string): 'required' | 'long' | 'chars' | 'names' | 'short' | null {
  const name = normalizeName(input);
  if (name === '') return 'required';
  if (name.length > NAME_MAX) return 'long';

  const words = name.split(' ');
  if (!words.every((word) => NAME_WORD.test(word))) return 'chars';

  const names = words.filter((word) => !NAME_PARTICLES.has(word.toLowerCase()));
  if (names.length < NAME_MIN_WORDS) return 'names';
  if (names.some((word) => word.replace(/['’-]/g, '').length < NAME_MIN_LETTERS)) return 'short';
  return null;
}

export type PasswordProblem = 'weak' | 'common' | 'same_as_identity';

/** Mínimo de 8 caracteres, com maiúscula, minúscula, número e caractere especial; bloqueia senhas comuns e igual ao @usuário ou e-mail. */
export function checkPassword(password: string, identity: { username?: string; email?: string } = {}): PasswordProblem | null {
  const complete =
    password.length >= PASSWORD_MIN &&
    /\p{Lu}/u.test(password) &&
    /\p{Ll}/u.test(password) &&
    /\p{N}/u.test(password) &&
    /[^\p{L}\p{N}]/u.test(password);
  if (!complete) return 'weak';

  const lower = password.toLowerCase();
  if (commonPasswords.has(lower)) return 'common';

  const same = [identity.username, identity.email].some((value) => value && lower === value.trim().toLowerCase());
  return same ? 'same_as_identity' : null;
}

/** Formato do @usuário: só letras minúsculas, números, ponto e underline; de 3 a 20 caracteres; sem nomes reservados. */
export function checkUsername(username: string): 'required' | 'format' | 'length' | 'reserved' | null {
  if (username === '') return 'required';
  if (!USERNAME_PATTERN.test(username)) return 'format';
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) return 'length';
  if (RESERVED_USERNAMES.includes(username)) return 'reserved';
  return null;
}

export type SignupField = 'name' | 'username' | 'email' | 'password' | 'confirmPassword' | 'terms';
export type SignupErrors = Partial<Record<SignupField, string>>;

export interface SignupInput {
  name: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
}

const emailSchema = z.email();

/** Valida o cadastro e devolve uma mensagem por campo. Só olha o formato; "já em uso" é checado com o banco. */
export function validateSignup(input: SignupInput): SignupErrors {
  const errors: SignupErrors = {};
  const m = messages.signup;

  const name = checkName(input.name);
  if (name === 'required') errors.name = m.nameRequired;
  else if (name === 'long') errors.name = m.nameLong;
  else if (name === 'chars') errors.name = m.nameChars;
  else if (name === 'names') errors.name = m.nameNames;
  else if (name === 'short') errors.name = m.nameShort;

  const username = checkUsername(input.username);
  if (username === 'required') errors.username = m.usernameRequired;
  else if (username === 'format') errors.username = m.usernameFormat;
  else if (username === 'length') errors.username = m.usernameLength;
  else if (username === 'reserved') errors.username = m.usernameReserved;

  const email = normalizeEmail(input.email);
  if (email === '') errors.email = m.emailRequired;
  else if (email.length > EMAIL_MAX || !emailSchema.safeParse(email).success) errors.email = m.emailInvalid;

  if (input.password === '') {
    errors.password = m.passwordRequired;
  } else {
    const problem = checkPassword(input.password, { username: input.username, email });
    if (problem === 'weak') errors.password = m.passwordWeak;
    else if (problem === 'common') errors.password = m.passwordCommon;
    else if (problem === 'same_as_identity') errors.password = m.passwordSameAsIdentity;
  }

  if (!errors.password && input.confirmPassword !== input.password) errors.confirmPassword = m.confirmMismatch;
  if (!input.acceptedTerms) errors.terms = m.termsRequired;
  return errors;
}
