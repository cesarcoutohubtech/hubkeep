-- ============================================================================
-- HubKeep — Migração 0004: bucket privado de anexos (F0-10, ADR-024)
-- ----------------------------------------------------------------------------
-- Fotos e anexos de OS, ativos e locais. O bucket é privado e NÃO tem policy
-- para anon, authenticated nem public em storage.objects: ninguém lê nem grava
-- com a chave pública ou com o JWT do usuário. Todo acesso é por URL assinada,
-- emitida pela API depois de conferir o escopo pela RLS (hk_app), para o
-- caminho {tenant_id}/{hotel_id}/{entidade}/{registro_id}/{uuid}.{ext}.
--
-- Limites: 20 MB por arquivo e só os tipos que a API aceita. A foto chega
-- comprimida pelo aparelho (docs/01); o limite pega o que escapar disso.
-- Só estrutura: nenhuma função, trigger ou policy nova.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anexos',
  'anexos',
  false,
  20 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
