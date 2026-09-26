import { PSEUDO_IDIOMA, criarTradutor, mensagensDe } from '@hubkeep/i18n';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ProvedorDeIdioma } from '../i18n/cliente';
import { idiomaDaRequisicao, pseudoIdiomaLiberado } from '../i18n/servidor';

export async function generateMetadata(): Promise<Metadata> {
  return { title: criarTradutor(await idiomaDaRequisicao()).t('app.nome') };
}

export default async function Layout({ children }: { children: ReactNode }) {
  const idioma = await idiomaDaRequisicao();
  return (
    <html lang={idioma === PSEUDO_IDIOMA ? 'en' : idioma}>
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          margin: '2rem auto',
          maxWidth: 560,
          padding: '0 16px',
        }}
      >
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
