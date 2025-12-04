-- Ajustes para alinhar com o frontend e facilitar o upsert
-- 1) Renomear a coluna com acento (recomendado)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='atletas' and column_name='escalão') then
    execute 'alter table public.atletas rename column "escalão" to escalao';
  end if;
end$$;

-- 2) Índice único para upsert por utilizador na tabela de dados pessoais
create unique index if not exists dados_pessoais_user_id_uidx
  on public.dados_pessoais(user_id);

-- 3) RLS + policies
alter table public.dados_pessoais enable row level security;
alter table public.atletas enable row level security;
alter table public.pagamentos enable row level security;

-- dados_pessoais
do $$
begin
  if not exists (select 1 from pg_policies where tablename='dados_pessoais' and policyname='dp_select_own') then
    create policy dp_select_own on public.dados_pessoais for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='dados_pessoais' and policyname='dp_insert_own') then
    create policy dp_insert_own on public.dados_pessoais for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='dados_pessoais' and policyname='dp_update_own') then
    create policy dp_update_own on public.dados_pessoais for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end$$;

-- atletas
do $$
begin
  if not exists (select 1 from pg_policies where tablename='atletas' and policyname='atl_select_own') then
    create policy atl_select_own on public.atletas for select using (
      exists (select 1 from public.dados_pessoais dp where dp.id = atletas.dados_pessoais_id and dp.user_id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='atletas' and policyname='atl_ins_own') then
    create policy atl_ins_own on public.atletas for insert with check (
      exists (select 1 from public.dados_pessoais dp where dp.id = atletas.dados_pessoais_id and dp.user_id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='atletas' and policyname='atl_upd_own') then
    create policy atl_upd_own on public.atletas for update using (
      exists (select 1 from public.dados_pessoais dp where dp.id = atletas.dados_pessoais_id and dp.user_id = auth.uid())
    ) with check (
      exists (select 1 from public.dados_pessoais dp where dp.id = atletas.dados_pessoais_id and dp.user_id = auth.uid())
    );
  end if;
end$$;

-- pagamentos
do $$
begin
  if not exists (select 1 from pg_policies where tablename='pagamentos' and policyname='pg_all_own') then
    create policy pg_all_own on public.pagamentos for all using (
      exists (
        select 1 from public.atletas a
        join public.dados_pessoais dp on dp.id = a.dados_pessoais_id
        where a.id = pagamentos.atleta_id and dp.user_id = auth.uid()
      )
    ) with check (
      exists (
        select 1 from public.atletas a
        join public.dados_pessoais dp on dp.id = a.dados_pessoais_id
        where a.id = pagamentos.atleta_id and dp.user_id = auth.uid()
      )
    );
  end if;
end$$;

-- 4) Facilitador de upsert nos pagamentos
create unique index if not exists pagamentos_atleta_desc_uniq
  on public.pagamentos(atleta_id, descricao);