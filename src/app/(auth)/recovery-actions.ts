'use server';

import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { passwordResetLink } from '@/lib/auth/app-url';
import { messages } from '@/lib/auth/messages';
import { requestPasswordReset, resetPassword, RESET_COOLDOWN_MS } from '@/lib/auth/password-reset';
import { checkEmail, normalizeEmail } from '@/lib/auth/validation';
import { getDb } from '@/lib/db';
import { sendEmail } from '@/lib/email/mailer';
import { passwordResetEmail } from '@/lib/email/templates';
import type { RequestResetState, ResetPasswordState } from './state';

const text = (data: FormData, key: string) => {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
};

/**
 * "Esqueci a senha". A resposta é sempre a mesma, haja ou não conta para o e-mail (e haja ou não e-mail enviado):
 * só um e-mail com formato inválido é recusado. O envio acontece depois da resposta (`after`), para o tempo de
 * resposta também não revelar nada. Serve também para o "Reenviar link".
 */
export async function requestResetAction(_previous: RequestResetState, data: FormData): Promise<RequestResetState> {
  const raw = text(data, 'email');
  const problem = checkEmail(raw);
  if (problem) {
    return {
      status: 'form',
      email: raw,
      error: problem === 'required' ? messages.login.emailRequired : messages.signup.emailInvalid,
      resendInSeconds: 0,
      nonce: Date.now(),
    };
  }

  const email = normalizeEmail(raw);
  const db = await getDb();
  const request = await requestPasswordReset(db, email);
  if (request) {
    after(async () => {
      try {
        const link = passwordResetLink(request.token);
        await sendEmail(db, passwordResetEmail({ name: request.user.name, email: request.user.email, link }));
      } catch (error) {
        // Falha de envio não pode mudar a resposta da tela (revelaria que a conta existe).
        console.error('Falha ao enviar o e-mail de recuperar senha:', error);
      }
    });
  }
  return { status: 'sent', email, resendInSeconds: RESET_COOLDOWN_MS / 1000, nonce: Date.now() };
}

/** Salva a nova senha. Sucesso: vai para "Senha atualizada" (os logins abertos já foram encerrados). */
export async function resetPasswordAction(_previous: ResetPasswordState, data: FormData): Promise<ResetPasswordState> {
  const result = await resetPassword(await getDb(), text(data, 'token'), text(data, 'password'), text(data, 'confirmPassword'));
  if (result.ok) redirect('/redefinir-senha/concluida');
  if (result.reason === 'invalid') return { errors: {}, expired: true };
  return { errors: result.errors, expired: false };
}
