import type { Email } from './mailer';

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
