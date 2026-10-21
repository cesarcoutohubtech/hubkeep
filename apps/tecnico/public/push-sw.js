// Push no service worker do PWA (1c, ADR-046, C4), importado pelo sw.js que o
// vite-plugin-pwa gera (vite.config.ts, workbox.importScripts). O servidor
// manda o título e a linha já no idioma de quem recebe; aqui não há texto
// próprio. O toque abre o caminho do aviso no PWA, só caminho deste site.
/* global self, clients, URL */

const caminhoSeguro = (c) => (typeof c === 'string' && /^\/(?!\/)/.test(c) ? c : '/');

self.addEventListener('push', (evento) => {
  let dados;
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = {};
  }
  const titulo = typeof dados.titulo === 'string' ? dados.titulo : '';
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: typeof dados.corpo === 'string' ? dados.corpo : '',
      icon: '/icones/icone-192.png',
      badge: '/icones/icone-192.png',
      data: { caminho: caminhoSeguro(dados.caminho) },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const url = new URL(caminhoSeguro(evento.notification.data?.caminho), self.location.origin).href;
  evento.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      const janela = janelas.find((j) => 'navigate' in j);
      if (janela) return janela.navigate(url).then((j) => (j ?? janela).focus());
      return clients.openWindow(url);
    }),
  );
});
