import type { Metadata } from 'next';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';
import 'nogasds/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Garnic', template: '%s · Garnic' },
  description: 'Catalogue o que você joga e escreva sobre isso, no mesmo lugar.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
