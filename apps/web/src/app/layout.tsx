import '@hubkeep/ui/estilo.css';
import { PSEUDO_IDIOMA, criarTradutor, mensagensDe } from '@hubkeep/i18n';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { ProvedorDeIdioma } from '../i18n/cliente';
import { idiomaDaRequisicao, pseudoIdiomaLiberado } from '../i18n/servidor';
import { COOKIE_TEMA, temaDoCookie } from '../tema';

export async function generateMetadata(): Promise<Metadata> {
  return { title: criarTradutor(await idiomaDaRequisicao()).t('app.nome') };
}

// Fontes, tokens e componentes vêm do @hubkeep/ui (ADR-038). O tema sai do
// cookie hk_tema já no HTML do servidor: escuro por padrão.
export default async function Layout({ children }: { children: ReactNode }) {
  const [idioma, c] = await Promise.all([idiomaDaRequisicao(), cookies()]);
  const tema = temaDoCookie(c.get(COOKIE_TEMA)?.value);
  return (
    <html
      lang={idioma === PSEUDO_IDIOMA ? 'en' : idioma}
      {...(tema === 'claro' ? { 'data-tema': 'claro' } : {})}
    >
      <body>
        <ProvedorDeIdioma
          idioma={idioma}
          mensagens={mensagensDe(idioma)}
          pseudoLiberado={pseudoIdiomaLiberado()}
        >
          {children}
        </ProvedorDeIdioma>
      </body>
    </html>
  );
}
