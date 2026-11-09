'use client';

import { useEffect, useState } from 'react';
import { Button } from 'nogasds';

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Botão de reenvio com a contagem de espera (ex.: "Reenviar código em 0:42"). Remontado a cada resposta do
 * servidor (`key`), então a contagem reinicia sozinha. Serve para o código e para o link de recuperar senha.
 */
export function ResendButton({
  initialSeconds,
  label,
  variant = 'outline',
  blocked = false,
  name,
  value,
}: {
  initialSeconds: number;
  label: string;
  variant?: 'outline' | 'primary';
  /** Bloqueia de vez (por exemplo, o limite de pedidos por hora). */
  blocked?: boolean;
  name?: string;
  value?: string;
}) {
  const [left, setLeft] = useState(initialSeconds);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  const waiting = left > 0;
  return (
    <Button type="submit" name={name} value={value} variant={variant} disabled={waiting || blocked} formNoValidate>
      {waiting ? `${label} em ${clock(left)}` : label}
    </Button>
  );
}
