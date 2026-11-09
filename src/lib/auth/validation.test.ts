import { describe, expect, it } from 'vitest';
import { messages } from './messages';
import { checkPassword, checkUsername, validateSignup, type SignupInput } from './validation';

const valid: SignupInput = {
  name: 'Ana Souza',
  username: 'ana.souza',
  email: 'ana@email.com',
  password: 'Zk9#mPq2vL',
  confirmPassword: 'Zk9#mPq2vL',
  acceptedTerms: true,
};

describe('@usuário', () => {
  it('aceita letras minúsculas, números, ponto e underline de 3 a 20 caracteres', () => {
    for (const ok of ['ana', 'ana.souza', 'ana_souza', 'a1b', 'x'.repeat(20), 'a.b_c9']) expect(checkUsername(ok)).toBeNull();
  });

  it('recusa maiúscula, espaço, acento e outros símbolos (formato)', () => {
    for (const bad of ['Ana', 'ana souza', 'ana!', 'ana-souza', 'aná', '@ana']) expect(checkUsername(bad)).toBe('format');
  });

  it('recusa menos de 3 e mais de 20 caracteres (tamanho)', () => {
    expect(checkUsername('ab')).toBe('length');
    expect(checkUsername('x'.repeat(21))).toBe('length');
  });

  it('bloqueia nomes reservados e vazio', () => {
    for (const reserved of ['admin', 'garnic', 'suporte']) expect(checkUsername(reserved)).toBe('reserved');
    expect(checkUsername('')).toBe('required');
  });
});

describe('senha', () => {
  it('exige 8 caracteres, maiúscula, minúscula, número e caractere especial', () => {
    expect(checkPassword('Zk9#mPq2vL')).toBeNull();
    expect(checkPassword('Zk9#mP')).toBe('weak'); // curta
    expect(checkPassword('zk9#mpq2vl')).toBe('weak'); // sem maiúscula
    expect(checkPassword('ZK9#MPQ2VL')).toBe('weak'); // sem minúscula
    expect(checkPassword('Zkx#mPqzvL')).toBe('weak'); // sem número
    expect(checkPassword('Zk9ampq2vL')).toBe('weak'); // sem especial
  });

  it('bloqueia senhas muito comuns, mesmo as que cumprem a composição', () => {
    expect(checkPassword('Senha@123')).toBe('common');
    expect(checkPassword('Password1!')).toBe('common');
    expect(checkPassword('QwErTy@123')).toBe('common'); // sem diferenciar maiúsculas e minúsculas
  });

  it('bloqueia senha igual ao @usuário ou ao e-mail', () => {
    expect(checkPassword('Ana.Souza#9', { username: 'ana.souza#9' })).toBe('same_as_identity');
    expect(checkPassword('Ana#9@email.com', { email: 'ana#9@email.com' })).toBe('same_as_identity');
  });
});

describe('cadastro', () => {
  it('não acusa erro quando tudo está certo', () => {
    expect(validateSignup(valid)).toEqual({});
  });

  it('devolve uma mensagem do protótipo por campo', () => {
    const errors = validateSignup({
      name: 'Ana Souza',
      username: 'Ana Souza!',
      email: 'ana@email',
      password: 'abc123',
      confirmPassword: 'abc12',
      acceptedTerms: false,
    });
    expect(errors).toEqual({
      username: messages.signup.usernameFormat,
      email: messages.signup.emailInvalid,
      password: messages.signup.passwordWeak,
      terms: messages.signup.termsRequired,
    });
  });

  it('acusa senhas diferentes só quando a senha em si é válida', () => {
    expect(validateSignup({ ...valid, confirmPassword: 'Outra#senha9' }).confirmPassword).toBe(messages.signup.confirmMismatch);
    expect(validateSignup({ ...valid, password: 'fraca', confirmPassword: 'diferente' }).confirmPassword).toBeUndefined();
  });

  it('exige nome e e-mail', () => {
    const errors = validateSignup({ ...valid, name: '  ', email: '' });
    expect(errors.name).toBe(messages.signup.nameRequired);
    expect(errors.email).toBe(messages.signup.emailRequired);
  });

  it('ignora maiúsculas e espaços do e-mail', () => {
    expect(validateSignup({ ...valid, email: '  ANA@Email.com ' }).email).toBeUndefined();
  });
});
