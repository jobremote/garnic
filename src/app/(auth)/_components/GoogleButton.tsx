'use client';

import { Button, Logo } from 'nogasds';

/**
 * Botão do Google do protótipo. Leva para `/api/auth/google`, que manda a pessoa para o Google
 * (ou para o Google simulado, em desenvolvimento sem credenciais). É navegação completa, não de rota do app.
 */
export function GoogleButton({ children }: { children: string }) {
  return (
    <Button
      variant="outline"
      type="button"
      leadingIcon={<Logo name="google" />}
      onClick={() => {
        // Navegação completa de propósito: a rota redireciona para fora do app (Google), o que o roteador do Next não faz.
        // Um formulário nativo não serve: o botão fica dentro do formulário de login e mandaria e-mail e senha na URL.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/api/auth/google');
      }}
    >
      {children}
    </Button>
  );
}
