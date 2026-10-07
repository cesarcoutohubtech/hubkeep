import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@hubkeep/ui/estilo.css';
import { App } from './App';
import './estilo.css';

// Service worker da casca offline; atualiza sozinho quando há versão nova.
registerSW({ immediate: true });

const raiz = document.getElementById('app');
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
