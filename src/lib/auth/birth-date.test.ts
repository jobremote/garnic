import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db/connect';
import { users } from '@/lib/db/schema';
import { createTestDb, validSignup } from '@/test/db';
import { ageOn, checkBirthDate, MIN_AGE, parseBirthDate } from './birth-date';
import { completeGoogleSignup } from './google';
import { registerUser } from './users';
import { birthDateError } from './validation';
import { messages } from './messages';

// 27/11/2026 ao meio-dia em Brasília.
const NOW = new Date('2026-11-27T15:00:00.000Z');

describe('data de nascimento', () => {
  it('lê o que a pessoa digita e o formato do banco; recusa datas impossíveis', () => {
    expect(parseBirthDate('10/05/1995')).toBe('1995-05-10');
    expect(parseBirthDate('1995-05-10')).toBe('1995-05-10');
    expect(parseBirthDate('29/02/2008')).toBe('2008-02-29');
    expect(parseBirthDate('29/02/2009')).toBeNull();
    expect(parseBirthDate('31/04/2000')).toBeNull();
    expect(parseBirthDate('1/5/1995')).toBeNull();
    expect(parseBirthDate('abc')).toBeNull();
  });

  it('a idade conta o aniversário no dia, pela data de Brasília', () => {
    expect(ageOn('2010-11-27', NOW)).toBe(16);
    expect(ageOn('2010-11-28', NOW)).toBe(15);
    // 23h30 de 27/11 em Brasília ainda é 27/11 (em UTC já é dia 28).
    expect(ageOn('2010-11-28', new Date('2026-11-28T02:30:00.000Z'))).toBe(15);
  });

  it(`só a partir de ${MIN_AGE} anos; vazio, inválido, futuro e absurdo são erro de campo`, () => {
    expect(checkBirthDate('27/11/2010', NOW)).toEqual({ ok: true, birthDate: '2010-11-27' });
    expect(checkBirthDate('28/11/2010', NOW)).toEqual({ ok: false, problem: 'under-age' });
    expect(checkBirthDate('', NOW)).toEqual({ ok: false, problem: 'required' });
    expect(checkBirthDate('31/02/2000', NOW)).toEqual({ ok: false, problem: 'invalid' });
    expect(checkBirthDate('01/01/2030', NOW)).toEqual({ ok: false, problem: 'invalid' });
    expect(checkBirthDate('01/01/1890', NOW)).toEqual({ ok: false, problem: 'invalid' });
    expect(birthDateError('', NOW)).toBe(messages.signup.birthDateRequired);
    expect(birthDateError('31/02/2000', NOW)).toBe(messages.signup.birthDateInvalid);
    // Menos de 16 não é erro de campo: leva à tela da idade mínima.
    expect(birthDateError('28/11/2010', NOW)).toBeUndefined();
  });
});

describe('cadastro com idade mínima', () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });

  it('com 16 anos ou mais, a conta guarda a data', async () => {
    const result = await registerUser(db, { ...validSignup, username: 'idade.ok', email: 'idade.ok@email.com', birthDate: '27/11/2010' }, NOW);
    if (!result.ok) throw new Error(JSON.stringify(result));
    const [row] = await db.select({ birthDate: users.birthDate }).from(users).where(eq(users.id, result.user.id));
    expect(row.birthDate).toBe('2010-11-27');
  });

  it('com menos de 16 anos, nada é gravado, mesmo com outros campos errados', async () => {
    const result = await registerUser(db, { ...validSignup, username: 'Errado!', email: 'menor@email.com', birthDate: '28/11/2010' }, NOW);
    expect(result).toEqual({ ok: false, underAge: true });
    expect(await db.select().from(users).where(eq(users.email, 'menor@email.com'))).toHaveLength(0);
  });

  it('sem data, é erro do campo', async () => {
    const result = await registerUser(db, { ...validSignup, username: 'sem.data', email: 'sem.data@email.com', birthDate: '' }, NOW);
    expect(result.ok === false && 'errors' in result && result.errors.birthDate).toBe(messages.signup.birthDateRequired);
  });

  it('Google: menos de 16 anos não cria a conta; com 16, guarda a data', async () => {
    const profile = { sub: 'google-idade-1', email: 'g.menor@email.com', name: 'G Menor' };
    expect(await completeGoogleSignup(db, profile, { username: 'g.menor', acceptedTerms: true, birthDate: '01/01/2015' }, NOW)).toEqual({ ok: false, underAge: true });
    expect(await db.select().from(users).where(eq(users.email, 'g.menor@email.com'))).toHaveLength(0);

    const missing = await completeGoogleSignup(db, profile, { username: 'g.maior', acceptedTerms: true, birthDate: '' }, NOW);
    expect(missing.ok === false && 'errors' in missing && missing.errors.birthDate).toBe(messages.signup.birthDateRequired);

    const ok = await completeGoogleSignup(db, profile, { username: 'g.maior', acceptedTerms: true, birthDate: '01/01/2000' }, NOW);
    if (!ok.ok) throw new Error(JSON.stringify(ok));
    expect(ok.user.birthDate).toBe('2000-01-01');
  });
});
