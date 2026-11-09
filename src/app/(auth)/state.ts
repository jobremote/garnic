import type { SignupErrors } from '@/lib/auth/validation';

/** Estados que as ações de servidor devolvem para os formulários (useActionState). */

export interface SignupState {
  /** Campos de texto devolvidos para o formulário não ficar vazio depois de um erro. Senhas nunca voltam. */
  values: { name: string; username: string; email: string; terms: boolean };
  errors: SignupErrors;
}

export const initialSignupState: SignupState = {
  values: { name: '', username: '', email: '', terms: false },
  errors: {},
};

export interface LoginState {
  email: string;
  /** E-mail ou senha incorretos (banner). */
  failed: boolean;
  errors: { email?: string; password?: string };
}

export const initialLoginState: LoginState = { email: '', failed: false, errors: {} };

export interface RequestResetState {
  /** `form`: pedindo o link. `sent`: "Verifique seu e-mail". */
  status: 'form' | 'sent';
  email: string;
  /** Erro de formato do e-mail (só aparece no formulário). */
  error?: string;
  /** Segundos até liberar o reenvio do link. */
  resendInSeconds: number;
  /** Muda a cada resposta; reinicia a contagem do reenvio. */
  nonce: number;
}

export const initialRequestResetState: RequestResetState = { status: 'form', email: '', resendInSeconds: 0, nonce: 0 };

export interface ResetPasswordState {
  errors: { password?: string; confirmPassword?: string };
  /** O link deixou de valer enquanto a pessoa preenchia (usado, substituído ou vencido). */
  expired: boolean;
}

export const initialResetPasswordState: ResetPasswordState = { errors: {}, expired: false };

export interface VerifyState {
  /** `normal`: há um código válido. `expired`: venceu. `invalidated`: 5 erros. */
  mode: 'normal' | 'expired' | 'invalidated';
  /** Já houve 5 códigos na última hora. */
  limitReached: boolean;
  /** Segundos até liberar o reenvio (0 = liberado). Calculado no servidor no momento da resposta. */
  resendInSeconds: number;
  /** Mensagem sob o campo do código (errado, incompleto). */
  codeError?: string;
  /** Acabou de enviar um código novo. */
  sent: boolean;
  /** Muda a cada resposta; serve para reiniciar o campo do código e o contador. */
  nonce: number;
}
