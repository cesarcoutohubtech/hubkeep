import type { ReactNode } from 'react';

export const metadata = { title: 'HubKeep' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          margin: '2rem auto',
          maxWidth: 560,
          padding: '0 16px',
        }}
      >
        {children}
      </body>
    </html>
  );
}
