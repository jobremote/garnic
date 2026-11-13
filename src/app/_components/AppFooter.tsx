import { PageFooter } from 'nogasds';

/**
 * Rodapé das telas de quem está logado (Figma: Rodapé da página, decisão de 13/11/2026). A documentação do IGDB pede
 * atribuição "visible to your users and located in a static location": por isso o "Powered by IGDB" fica aqui,
 * fixo, em todas as telas com dados do IGDB (feed e perfil). Segurança infantil e Suporte entram quando existirem.
 */
export function AppFooter() {
  return (
    <PageFooter
      attribution={
        <>
          Powered by{' '}
          <a href="https://www.igdb.com" target="_blank" rel="noopener noreferrer" aria-label="IGDB, abre em uma nova aba">
            IGDB
          </a>
        </>
      }
      links={[
        { label: 'Termos', href: '/termos' },
        { label: 'Privacidade', href: '/privacidade' },
      ]}
    />
  );
}
