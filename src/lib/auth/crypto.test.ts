import { describe, expect, it } from 'vitest';
import { generateCode, hashCode, hashPassword, hashSessionToken, newSessionToken, safeEqualHex, sign, unsign, verifyPassword } from './crypto';

describe('hash de senha', () => {
  it('confere a senha certa e recusa a errada', async () => {
    const hash = await hashPassword('Zk9#mPq2vL');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('Zk9#mPq2vL', hash)).toBe(true);
    expect(await verifyPassword('Zk9#mPq2vl', hash)).toBe(false);
  });

  it('gera hashes diferentes para a mesma senha (sal)', async () => {
    expect(await hashPassword('Zk9#mPq2vL')).not.toBe(await hashPassword('Zk9#mPq2vL'));
  });

  it('recusa hash ausente ou mal formado sem lançar erro', async () => {
    expect(await verifyPassword('x', null)).toBe(false);
    expect(await verifyPassword('x', 'qualquer-coisa')).toBe(false);
  });
});

describe('códigos e tokens', () => {
  it('gera códigos de 6 dígitos, inclusive com zeros à esquerda', () => {
    for (let i = 0; i < 200; i += 1) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it('o hash do código depende do usuário e do código', () => {
    expect(hashCode('u1', '123456')).toBe(hashCode('u1', '123456'));
    expect(hashCode('u1', '123456')).not.toBe(hashCode('u2', '123456'));
    expect(hashCode('u1', '123456')).not.toBe(hashCode('u1', '123457'));
    expect(safeEqualHex(hashCode('u1', '1'), hashCode('u1', '1'))).toBe(true);
    expect(safeEqualHex(hashCode('u1', '1'), 'ff')).toBe(false);
  });

  it('o token de sessão é aleatório e só o hash dele é guardado', () => {
    const a = newSessionToken();
    expect(a).not.toBe(newSessionToken());
    expect(hashSessionToken(a)).not.toBe(a);
    expect(hashSessionToken(a)).toBe(hashSessionToken(a));
  });

  it('valor assinado é aceito intacto e recusado se alterado', () => {
    const signed = sign('abc.123');
    expect(unsign(signed)).toBe('abc.123');
    expect(unsign(signed.replace('abc', 'abd'))).toBeNull();
    expect(unsign('semassinatura')).toBeNull();
  });
});
