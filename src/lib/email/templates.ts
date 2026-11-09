import type { Email } from './mailer';

/** E-mail com o link para criar uma nova senha. Texto provisório, para revisão. */
export function passwordResetEmail({ name, email, link }: { name: string; email: string; link: string }): Email {
  const firstName = name.trim().split(/\s+/)[0];
  return {
    to: email,
    subject: 'Redefina sua senha do Garnic',
    text: [
      `Olá, ${firstName}.`,
      '',
      'Recebemos um pedido para criar uma nova senha para a sua conta no Garnic. Para continuar, abra o link:',
      '',
      link,
      '',
      'O link vale por 30 minutos e só pode ser usado uma vez.',
      'Se você não fez esse pedido, é só ignorar este e-mail: a sua senha continua a mesma.',
    ].join('\n'),
  };
}

/** E-mail com o código de 6 dígitos. Texto provisório, para revisão (ver `04_conteudo/microcopy/login-e-cadastro.md`). */
export function verificationEmail({ name, email, code }: { name: string; email: string; code: string }): Email {
  const firstName = name.trim().split(/\s+/)[0];
  return {
    to: email,
    subject: 'Seu código de verificação do Garnic',
    text: [
      `Olá, ${firstName}.`,
      '',
      `Seu código de verificação é: ${code}`,
      '',
      'Ele vale por 10 minutos e só pode ser usado uma vez.',
      'Se você não criou uma conta no Garnic, é só ignorar este e-mail.',
    ].join('\n'),
  };
}
