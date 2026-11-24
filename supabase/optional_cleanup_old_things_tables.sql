-- =============================================================================
-- OPCIONAL: Limpeza das tabelas antigas do projeto Things
-- ATENÇÃO: Só execute após confirmar que seu backup em backups/ e no Google Drive
-- está íntegro. As tabelas do Meu Dia NÃO conflitam com estas tabelas.
-- =============================================================================

drop table if exists public.checklists cascade;
drop table if exists public.items cascade;
drop table if exists public.contexts cascade;
drop function if exists public.set_current_timestamp_updated_at() cascade;
