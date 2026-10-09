-- ============================================================================
-- HubKeep — Migração 0035: CNPJ alfanumérico no fornecedor (fase 1b, depois
-- da I4)
-- ----------------------------------------------------------------------------
-- Decisão do Cesar de 09/10/2026: aceitar o CNPJ alfanumérico, que a Receita
-- emite desde julho de 2026. Os 12 primeiros caracteres passam a aceitar
-- letras maiúsculas e dígitos; os dois verificadores continuam numéricos. O
-- CNPJ só de dígitos, que já existe, continua valendo. O cálculo dos
-- verificadores, a conversão para maiúsculas e a máscara são do domínio
-- (validarCnpj, packages/dominio/src/fornecedores.ts); aqui fica só o formato,
-- como garantia. O índice fornecedor_cnpj_unico não muda.
-- Só estrutura: nenhuma função, trigger ou regra de negócio.
-- ============================================================================

alter table app.fornecedor drop constraint fornecedor_cnpj_formato;
alter table app.fornecedor
  add constraint fornecedor_cnpj_formato check (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$');
