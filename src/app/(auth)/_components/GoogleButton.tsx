'use client';

import { Button, Logo } from 'nogasds';

/**
 * Botão do Google do protótipo. O login e o cadastro com Google são a próxima entrega, então por enquanto
 * ele aparece desabilitado, para a tela ficar igual ao desenho.
 */
export function GoogleButton({ children }: { children: string }) {
  return (
    <Button variant="outline" type="button" disabled leadingIcon={<Logo name="google" />}>
      {children}
    </Button>
  );
}
