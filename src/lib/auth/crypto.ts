import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const R = 8;
const P = 1;
const KEY_LENGTH = 64;

/** Custo do scrypt como potência de 2. Padrão 15 (N = 32768); os testes usam um valor menor. */
const cost = () => Number(process.env.PASSWORD_HASH_COST ?? 15);

/** Segredo da aplicação (cookies assinados e hash dos códigos). Em produção é obrigatório. */
export function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET não está definido (use um texto aleatório de 32 caracteres ou mais).');
  }
  return 'segredo-somente-para-desenvolvimento-local-nao-usar-em-producao';
}

const b64 = (buffer: Buffer) => buffer.toString('base64url');

/** Hash de senha com scrypt: `scrypt$N$r$p$sal$hash`. */
export async function hashPassword(password: string): Promise<string> {
  const n = 2 ** cost();
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, { N: n, r: R, p: P, maxmem: 256 * n * R });
  return `scrypt$${n}$${R}$${P}$${b64(salt)}$${b64(key)}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = stored?.split('$');
  if (!parts || parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scryptAsync(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 256 * Number(n) * Number(r),
  });
  return timingSafeEqual(key, expected);
}

/**
 * Hash falso para igualar o tempo de resposta do login quando o e-mail não existe
 * (evita descobrir quais e-mails têm conta pelo tempo da resposta).
 */
let dummy: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword('senha-falsa-para-igualar-o-tempo');
  return dummy;
}

/** Código numérico de 6 dígitos, sorteado com `crypto.randomInt`. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** HMAC do código, amarrado ao usuário. O código em si nunca é gravado. */
export function hashCode(userId: string, code: string): string {
  return createHmac('sha256', authSecret()).update(`${userId}:${code}`).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Token de sessão aleatório (vai no cookie) e o hash dele (vai no banco). */
export const newSessionToken = () => randomBytes(32).toString('base64url');
export const hashSessionToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Valor assinado `dados.assinatura`, para o cookie de cadastro pendente. */
export function sign(value: string): string {
  const signature = createHmac('sha256', authSecret()).update(value).digest('base64url');
  return `${value}.${signature}`;
}

export function unsign(signed: string): string | null {
  const index = signed.lastIndexOf('.');
  if (index < 0) return null;
  const value = signed.slice(0, index);
  const expected = Buffer.from(signed.slice(index + 1));
  const actual = Buffer.from(createHmac('sha256', authSecret()).update(value).digest('base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? value : null;
}
