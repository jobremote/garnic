/**
 * Endereço público do app, usado nos links dos e-mails. Vem de `APP_URL` (nunca do cabeçalho da requisição,
 * que quem faz o pedido controla). Em desenvolvimento, sem a variável, usa http://localhost:3000.
 */
export function appUrl(): string {
  const url = process.env.APP_URL?.trim();
  if (url) return url.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_URL não está definida (por exemplo, https://garnic.vercel.app).');
  }
  return 'http://localhost:3000';
}

export const passwordResetLink = (token: string) => `${appUrl()}/redefinir-senha?token=${encodeURIComponent(token)}`;
