// VITRINE DESCARTÁVEL: escolhe a tela e o tema pela URL (?tela=lista|investigacao|ativo&tema=claro).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@hubkeep/ui/estilo.css';
import './estilo.css';
import { DetalheDoAtivo, ListaDeInsights, PainelDeInvestigacao } from './telas';

const params = new URLSearchParams(location.search);
if (params.get('tema') === 'claro') document.documentElement.dataset['tema'] = 'claro';
const tela = params.get('tela') ?? 'lista';
const Tela = tela === 'ativo' ? DetalheDoAtivo : tela === 'investigacao' ? PainelDeInvestigacao : ListaDeInsights;

const raiz = document.getElementById('app');
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <Tela />
    </StrictMode>,
  );
}
