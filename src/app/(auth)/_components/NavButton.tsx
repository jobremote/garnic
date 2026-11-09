'use client';

import { useRouter } from 'next/navigation';
import { Button, type ButtonProps } from 'nogasds';

/** Botão do NogasDS que navega para outra página (o `Button` é um `<button>`, não um link). */
export function NavButton({ href, ...props }: ButtonProps & { href: string }) {
  const router = useRouter();
  return <Button {...props} onClick={() => router.push(href)} />;
}
