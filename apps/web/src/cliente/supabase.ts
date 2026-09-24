'use client';
// Cliente do Supabase no navegador: só autentica (chave publicável). Nenhuma
// tabela do HubKeep é lida daqui — a Data API está fechada (ADR-002); os dados
// vêm da API /api/v1, que verifica o token no servidor.
import { createBrowserClient } from '@supabase/ssr';

export const supabaseNavegador = () =>
  createBrowserClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] ?? '',
  );
