--
-- PostgreSQL database dump
--

\restrict I0uY7gJSZFeUq2d3CrVdwPZe23SuhwZfIA0NGI25zXn3sIHa4cM4kI7BRQRCKhb

-- Dumped from database version 17.4
-- Dumped by pg_dump version 18.0

-- Started on 2025-12-04 09:22:44

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 129 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- TOC entry 4014 (class 0 OID 0)
-- Dependencies: 129
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 380 (class 1259 OID 24811)
-- Name: atletas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.atletas (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    dados_pessoais_id uuid,
    nome text NOT NULL,
    data_nascimento date NOT NULL,
    escalao text,
    alergias text NOT NULL,
    opcao_pagamento text,
    created_at timestamp without time zone DEFAULT now(),
    morada text,
    codigo_postal text,
    contactos_urgencia text,
    emails_preferenciais text,
    genero text,
    user_id uuid,
    nacionalidade text,
    nacionalidade_outra text,
    tipo_doc text,
    num_doc text,
    validade_doc date,
    nif text,
    nome_pai text,
    nome_mae text,
    telefone_opc text,
    email_opc text,
    escola text,
    ano_escolaridade text,
    encarregado_educacao text,
    parentesco_outro text,
    observacoes text,
    epoca integer,
    social boolean DEFAULT false,
    desistiu boolean DEFAULT false,
    CONSTRAINT atletas_codigo_postal_check CHECK (((codigo_postal IS NULL) OR (codigo_postal ~ '^[0-9]{4}-[0-9]{3}$'::text))),
    CONSTRAINT atletas_genero_check CHECK (((genero IS NULL) OR (genero = ANY (ARRAY['Masculino'::text, 'Feminino'::text])))),
    CONSTRAINT atletas_opcao_pagamento_check CHECK ((opcao_pagamento = ANY (ARRAY['Mensal'::text, 'Trimestral'::text, 'Anual'::text])))
);


ALTER TABLE public.atletas OWNER TO postgres;

--
-- TOC entry 496 (class 1255 OID 24841)
-- Name: atletas_upsert(uuid, uuid, text, date, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.atletas_upsert(p_id uuid, p_dados_pessoais_id uuid, p_nome text, p_data_nascimento date, "p_escalão" text, p_alergias text, p_opcao_pagamento text) RETURNS SETOF public.atletas
    LANGUAGE plpgsql
    AS $$begin
  return query
  insert into atletas (id, dados_pessoais_id, nome, data_nascimento, escalao, alergias, opcao_pagamento)
  values (coalesce(p_id, uuid_generate_v4()), p_dados_pessoais_id, p_nome, p_data_nascimento, p_escalao, p_alergias, p_opcao_pagamento)
  on conflict (id) do update
    set dados_pessoais_id = excluded.dados_pessoais_id,
        nome = excluded.nome,
        data_nascimento = excluded.data_nascimento,
        escalao = excluded.escalao,
        alergias = excluded.alergias,
        opcao_pagamento = excluded.opcao_pagamento
  returning *;
end;$$;


ALTER FUNCTION public.atletas_upsert(p_id uuid, p_dados_pessoais_id uuid, p_nome text, p_data_nascimento date, "p_escalão" text, p_alergias text, p_opcao_pagamento text) OWNER TO postgres;

--
-- TOC entry 379 (class 1259 OID 24794)
-- Name: dados_pessoais; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dados_pessoais (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    nome_completo text NOT NULL,
    data_nascimento date NOT NULL,
    genero text,
    morada text,
    codigo_postal text,
    telefone text,
    email text NOT NULL,
    situacao_tesouraria text DEFAULT 'Campo em atualização'::text NOT NULL,
    noticias text,
    created_at timestamp without time zone DEFAULT now(),
    tipo_documento text,
    numero_documento text,
    nif text,
    tipo_socio text,
    profissao text,
    validade_documento date,
    CONSTRAINT dados_pessoais_codigo_postal_check CHECK ((codigo_postal ~ '^[0-9]{4}-[0-9]{3}$'::text)),
    CONSTRAINT dados_pessoais_genero_check CHECK ((genero = ANY (ARRAY['Masculino'::text, 'Feminino'::text, 'Outro'::text])))
);


ALTER TABLE public.dados_pessoais OWNER TO postgres;

--
-- TOC entry 419 (class 1255 OID 24840)
-- Name: dados_pessoais_upsert(uuid, text, date, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.dados_pessoais_upsert(p_id uuid, p_nome_completo text, p_data_nascimento date, p_genero text, p_morada text, p_codigo_postal text, p_telefone text, p_email text, p_situacao_tesouraria text, p_noticias text) RETURNS SETOF public.dados_pessoais
    LANGUAGE plpgsql
    AS $$
begin
  return query
  insert into dados_pessoais (id, nome_completo, data_nascimento, genero, morada, codigo_postal, telefone, email, situacao_tesouraria, noticias)
  values (coalesce(p_id, uuid_generate_v4()), p_nome_completo, p_data_nascimento, p_genero, p_morada, p_codigo_postal, p_telefone, p_email, coalesce(p_situacao_tesouraria, 'Campo em atualização'), p_noticias)
  on conflict (id) do update
    set nome_completo = excluded.nome_completo,
        data_nascimento = excluded.data_nascimento,
        genero = excluded.genero,
        morada = excluded.morada,
        codigo_postal = excluded.codigo_postal,
        telefone = excluded.telefone,
        email = excluded.email,
        situacao_tesouraria = excluded.situacao_tesouraria,
        noticias = excluded.noticias
  returning *;
end;
$$;


ALTER FUNCTION public.dados_pessoais_upsert(p_id uuid, p_nome_completo text, p_data_nascimento date, p_genero text, p_morada text, p_codigo_postal text, p_telefone text, p_email text, p_situacao_tesouraria text, p_noticias text) OWNER TO postgres;

--
-- TOC entry 516 (class 1255 OID 42048)
-- Name: ensure_dados_pessoais_for_atleta(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_dados_pessoais_for_atleta() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  -- se não vier user_id do app, tenta usar auth.uid()
  if NEW.user_id is null then
    begin
      NEW.user_id := auth.uid();
    exception when others then
      -- se não houver auth context, prossegue
    end;
  end if;

  -- cria a linha mínima em dados_pessoais se não existir
  if NEW.user_id is not null then
    insert into public.dados_pessoais (user_id)
    select NEW.user_id
    where not exists (
      select 1 from public.dados_pessoais p where p.user_id = NEW.user_id
    );
  end if;

  return NEW;
end
$$;


ALTER FUNCTION public.ensure_dados_pessoais_for_atleta() OWNER TO postgres;

--
-- TOC entry 492 (class 1255 OID 47180)
-- Name: ensure_inscricao_atleta_if_missing(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_inscricao_atleta_if_missing(p_atleta_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user  uuid;
  v_year  int := extract(year from current_date)::int;
  v_has   boolean;
BEGIN
  IF p_atleta_id IS NULL THEN
    RETURN;
  END IF;

  -- titular do atleta
  SELECT user_id INTO v_user
  FROM public.atletas
  WHERE id = p_atleta_id;

  IF v_user IS NULL THEN
    -- sem titular, não inserimos
    RETURN;
  END IF;

  -- já existe inscrição?
  SELECT EXISTS(
    SELECT 1
    FROM public.pagamentos
    WHERE atleta_id = p_atleta_id
      AND tipo = 'inscricao'
  ) INTO v_has;

  IF NOT v_has THEN
    INSERT INTO public.pagamentos (user_id, atleta_id, tipo, descricao, devido_em, validado)
    VALUES (v_user, p_atleta_id, 'inscricao', 'Taxa de inscrição', make_date(v_year, 9, 30), false);
  ELSE
    -- se já existir, pelo menos garante devido_em preenchido
    UPDATE public.pagamentos
       SET devido_em = COALESCE(devido_em, make_date(v_year, 9, 30))
     WHERE atleta_id = p_atleta_id
       AND tipo = 'inscricao';
  END IF;
END;
$$;


ALTER FUNCTION public.ensure_inscricao_atleta_if_missing(p_atleta_id uuid) OWNER TO postgres;

--
-- TOC entry 505 (class 1255 OID 47446)
-- Name: ensure_pagamentos_agenda(uuid, text, date); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_pagamentos_agenda(p_atleta_id uuid, p_plano text, p_epoca_inicio date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_epoca text := to_char(p_epoca_inicio,'YYYY') || '/' || to_char(p_epoca_inicio + interval '1 year','YY');
BEGIN
  PERFORM public.seed_pagamentos_for_atleta(p_atleta_id, v_epoca, p_plano, true);
END
$$;


ALTER FUNCTION public.ensure_pagamentos_agenda(p_atleta_id uuid, p_plano text, p_epoca_inicio date) OWNER TO postgres;

--
-- TOC entry 418 (class 1255 OID 34289)
-- Name: ensure_pagamentos_for_atleta(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_pagamentos_for_atleta(p_atleta_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_plano  text;
  v_epoca  date;
  v_year   int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
BEGIN
  -- plano atual do atleta
  SELECT opcao_pagamento
    INTO v_plano
  FROM public.atletas
  WHERE id = p_atleta_id;

  IF v_plano IS NULL THEN
    RETURN;
  END IF;

  -- início “canónico” da época financeira: 30/09 do ano corrente
  v_epoca := make_date(v_year, 9, 30);

  -- delega na função já corrigida (que:
  --  - garante só INSCRIÇÃO para Sub-23/Masters e limpa quotas/mensalidades
  --  - cria QUOTAS para os restantes consoante o plano)
  PERFORM public.ensure_pagamentos_agenda(p_atleta_id, v_plano, v_epoca);
END;
$$;


ALTER FUNCTION public.ensure_pagamentos_for_atleta(p_atleta_id uuid) OWNER TO postgres;

--
-- TOC entry 509 (class 1255 OID 36490)
-- Name: fn_pagamentos_fill_user_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_pagamentos_fill_user_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.atleta_id IS NOT NULL AND NEW.user_id IS NULL THEN
    SELECT a.user_id INTO NEW.user_id
    FROM public.atletas a
    WHERE a.id = NEW.atleta_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_pagamentos_fill_user_id() OWNER TO postgres;

--
-- TOC entry 524 (class 1255 OID 32056)
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;


ALTER FUNCTION public.is_admin() OWNER TO postgres;

--
-- TOC entry 517 (class 1255 OID 34168)
-- Name: is_owner_pagamento(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_owner_pagamento(p_user_id uuid, p_atleta_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select coalesce(
    (p_user_id is not null and p_user_id = auth.uid())
    or exists(
      select 1
      from public.atletas a
      where a.id = p_atleta_id
        and a.user_id = auth.uid()
    ),
    false
  );
$$;


ALTER FUNCTION public.is_owner_pagamento(p_user_id uuid, p_atleta_id uuid) OWNER TO postgres;

--
-- TOC entry 473 (class 1255 OID 33686)
-- Name: is_owner_pagamento_by_atleta(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_owner_pagamento_by_atleta(p_atleta_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select exists (
    select 1
    from public.atletas a
    where a.id = p_atleta_id
      and a.user_id = auth.uid()
  )
$$;


ALTER FUNCTION public.is_owner_pagamento_by_atleta(p_atleta_id uuid) OWNER TO postgres;

--
-- TOC entry 381 (class 1259 OID 24826)
-- Name: pagamentos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pagamentos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    atleta_id uuid,
    descricao text NOT NULL,
    comprovativo_url text,
    created_at timestamp without time zone DEFAULT now(),
    validado boolean DEFAULT false NOT NULL,
    validado_em timestamp with time zone,
    validado_por uuid,
    user_id uuid,
    tipo text DEFAULT 'mensalidade'::text NOT NULL,
    devido_em date
);


ALTER TABLE public.pagamentos OWNER TO postgres;

--
-- TOC entry 4028 (class 0 OID 0)
-- Dependencies: 381
-- Name: COLUMN pagamentos.validado; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.validado IS 'Aprovado/validado pelo admin';


--
-- TOC entry 4029 (class 0 OID 0)
-- Dependencies: 381
-- Name: COLUMN pagamentos.validado_por; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagamentos.validado_por IS 'user_id do admin que validou';


--
-- TOC entry 475 (class 1255 OID 24842)
-- Name: pagamentos_upsert(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.pagamentos_upsert(p_id uuid, p_atleta_id uuid, p_descricao text, p_comprovativo_url text) RETURNS SETOF public.pagamentos
    LANGUAGE plpgsql
    AS $$
begin
  return query
  insert into pagamentos (id, atleta_id, descricao, comprovativo_url)
  values (coalesce(p_id, uuid_generate_v4()), p_atleta_id, p_descricao, p_comprovativo_url)
  on conflict (id) do update
    set atleta_id = excluded.atleta_id,
        descricao = excluded.descricao,
        comprovativo_url = excluded.comprovativo_url
  returning *;
end;
$$;


ALTER FUNCTION public.pagamentos_upsert(p_id uuid, p_atleta_id uuid, p_descricao text, p_comprovativo_url text) OWNER TO postgres;

--
-- TOC entry 504 (class 1255 OID 42332)
-- Name: prevent_mensalidade_sub23_masters(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prevent_mensalidade_sub23_masters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_escalao    text;
  v_is_sub23   boolean := false;
  v_is_masters boolean := false;
  v_is_mensalq boolean := false;  -- mensalidade/quotas
begin
  -- Só interessa quando é pagamento de atleta
  if new.atleta_id is null then
    return new;
  end if;

  -- Escalão do atleta
  select a.escalao into v_escalao
  from public.atletas a
  where a.id = new.atleta_id;

  if v_escalao is not null then
    -- Sub-23: "Sub23", "Sub 23", "Sub-23"…
    v_is_sub23   := v_escalao ~* 'sub[[:space:]-]?23';
    -- Masters: cobre "Master", "Masters", etc. (ou troca por igualdade exacta se preferires)
    v_is_masters := v_escalao ~* 'master';
  end if;

  -- Detetar mensalidades/quotas pelo tipo OU descrição (robusto a variações)
  v_is_mensalq := coalesce(new.tipo, '') ~* '(mensal|quota)'
               or coalesce(new.descricao, '') ~* '(mensal|quota)';

  if (v_is_sub23 or v_is_masters) and v_is_mensalq then
    raise exception
      'Mensalidades/quotas não são permitidas para atletas Sub-23/Masters (atleta: %, escalão: %).',
      new.atleta_id, v_escalao
      using errcode = '23514'; -- check_violation
  end if;

  return new;
end;
$$;


ALTER FUNCTION public.prevent_mensalidade_sub23_masters() OWNER TO postgres;

--
-- TOC entry 486 (class 1255 OID 41578)
-- Name: prevent_quotas_for_sub23_masters(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prevent_quotas_for_sub23_masters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE esc_lower text;
BEGIN
  IF NEW.tipo = 'quota' AND NEW.atleta_id IS NOT NULL THEN
    SELECT lower(a.escalao) INTO esc_lower
    FROM public.atletas a
    WHERE a.id = NEW.atleta_id;

    IF esc_lower ~ '(masters|sub[- ]?23|sub23)' THEN
      RAISE EXCEPTION 'Nao e permitido inserir quotas para atletas Sub-23 ou Masters (%).', esc_lower
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END$$;


ALTER FUNCTION public.prevent_quotas_for_sub23_masters() OWNER TO postgres;

--
-- TOC entry 547 (class 1255 OID 42110)
-- Name: prevent_sub23_mensalidade(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prevent_sub23_mensalidade() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_escalao text;
  v_tipo    text := coalesce(new.tipo, '');
  v_desc    text := coalesce(new.descricao, '');
  v_is_sub23  boolean := false;
  v_is_masters boolean := false;
begin
  -- Só interessa quando o pagamento é de ATLETA
  if new.atleta_id is null then
    return new;
  end if;

  -- Vai buscar o escalão do atleta
  select a.escalao into v_escalao
  from public.atletas a
  where a.id = new.atleta_id;

  -- Detetar Sub-23 e Masters (robusto a variações)
  if v_escalao is not null then
    v_is_sub23  := v_escalao ilike '%sub23%';
    v_is_masters := v_escalao ilike '%master%';
    -- Se quiseres ser ultra-estrito:
    -- v_is_masters := v_escalao = 'Masters (<1995)';
  end if;

  -- Bloquear mensalidades
  if (v_is_sub23 or v_is_masters) and (v_tipo ilike '%mensal%' or v_desc ilike '%mensal%') then
    raise exception
      'Mensalidades não são permitidas para atletas Sub-23/Masters (atleta: %, escalão: %).',
      new.atleta_id, v_escalao
      using errcode = '23514'; -- check_violation
  end if;

  return new;
end;
$$;


ALTER FUNCTION public.prevent_sub23_mensalidade() OWNER TO postgres;

--
-- TOC entry 416 (class 1255 OID 29800)
-- Name: rpc_create_atleta(jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rpc_create_atleta(p jsonb) RETURNS public.atletas
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_row   public.atletas;
  v_dp_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sem JWT (auth.uid() = NULL)';
  end if;

  -- apanha o dados_pessoais.id do utilizador (se existir)
  select id
    into v_dp_id
  from public.dados_pessoais
  where user_id = auth.uid()
  order by created_at desc
  limit 1;

  insert into public.atletas (
    user_id, dados_pessoais_id,
    nome, data_nascimento, escalao, alergias, opcao_pagamento,
    morada, codigo_postal, contactos_urgencia, emails_preferenciais, genero,
    nacionalidade, nacionalidade_outra, tipo_doc, num_doc, validade_doc, nif,
    nome_pai, nome_mae, telefone_opc, email_opc, escola, ano_escolaridade,
    encarregado_educacao, parentesco_outro, observacoes
  ) values (
    auth.uid(), v_dp_id,
    p->>'nome',
    (p->>'data_nascimento')::date,
    nullif(p->>'escalao',''),
    coalesce(p->>'alergias',''),
    nullif(p->>'opcao_pagamento',''),
    nullif(p->>'morada',''),
    nullif(p->>'codigo_postal',''),
    nullif(p->>'contactos_urgencia',''),
    nullif(p->>'emails_preferenciais',''),
    nullif(p->>'genero',''),
    nullif(p->>'nacionalidade',''),
    nullif(p->>'nacionalidade_outra',''),
    nullif(p->>'tipo_doc',''),
    nullif(p->>'num_doc',''),
    nullif(p->>'validade_doc','')::date,
    nullif(p->>'nif',''),
    nullif(p->>'nome_pai',''),
    nullif(p->>'nome_mae',''),
    nullif(p->>'telefone_opc',''),
    nullif(p->>'email_opc',''),
    nullif(p->>'escola',''),
    nullif(p->>'ano_escolaridade',''),
    nullif(p->>'encarregado_educacao',''),
    nullif(p->>'parentesco_outro',''),
    nullif(p->>'observacoes','')
  )
  returning * into v_row;

  return v_row;
end;
$$;


ALTER FUNCTION public.rpc_create_atleta(p jsonb) OWNER TO postgres;

--
-- TOC entry 513 (class 1255 OID 29902)
-- Name: rpc_update_atleta(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rpc_update_atleta(p_id uuid, p jsonb) RETURNS public.atletas
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_row public.atletas;
begin
  if auth.uid() is null then
    raise exception 'Sem JWT (auth.uid() = NULL)';
  end if;

  update public.atletas a
     set nome                 = coalesce(nullif(p->>'nome',''), a.nome),
         data_nascimento      = coalesce((nullif(p->>'data_nascimento',''))::date, a.data_nascimento),
         escalao              = coalesce(nullif(p->>'escalao',''), a.escalao),
         alergias             = coalesce(p->>'alergias', a.alergias),
         opcao_pagamento      = coalesce(nullif(p->>'opcao_pagamento',''), a.opcao_pagamento),
         morada               = coalesce(nullif(p->>'morada',''), a.morada),
         codigo_postal        = coalesce(nullif(p->>'codigo_postal',''), a.codigo_postal),
         contactos_urgencia   = coalesce(nullif(p->>'contactos_urgencia',''), a.contactos_urgencia),
         emails_preferenciais = coalesce(nullif(p->>'emails_preferenciais',''), a.emails_preferenciais),
         genero               = coalesce(nullif(p->>'genero',''), a.genero),
         nacionalidade        = coalesce(nullif(p->>'nacionalidade',''), a.nacionalidade),
         nacionalidade_outra  = case when p ? 'nacionalidade_outra' then nullif(p->>'nacionalidade_outra','') else a.nacionalidade_outra end,
         tipo_doc             = coalesce(nullif(p->>'tipo_doc',''), a.tipo_doc),
         num_doc              = coalesce(nullif(p->>'num_doc',''), a.num_doc),
         -- 👇 CAST explícito p/ date (ou mantém o atual)
         validade_doc         = coalesce((nullif(p->>'validade_doc',''))::date, a.validade_doc),
         nif                  = coalesce(nullif(p->>'nif',''), a.nif),
         nome_pai             = case when p ? 'nome_pai' then nullif(p->>'nome_pai','') else a.nome_pai end,
         nome_mae             = case when p ? 'nome_mae' then nullif(p->>'nome_mae','') else a.nome_mae end,
         telefone_opc         = case when p ? 'telefone_opc' then nullif(p->>'telefone_opc','') else a.telefone_opc end,
         email_opc            = case when p ? 'email_opc' then nullif(p->>'email_opc','') else a.email_opc end,
         escola               = case when p ? 'escola' then nullif(p->>'escola','') else a.escola end,
         ano_escolaridade     = case when p ? 'ano_escolaridade' then nullif(p->>'ano_escolaridade','') else a.ano_escolaridade end,
         encarregado_educacao = case when p ? 'encarregado_educacao' then nullif(p->>'encarregado_educacao','') else a.encarregado_educacao end,
         parentesco_outro     = case when p ? 'parentesco_outro' then nullif(p->>'parentesco_outro','') else a.parentesco_outro end,
         observacoes          = case when p ? 'observacoes' then nullif(p->>'observacoes','') else a.observacoes end
   where a.id = p_id
     and a.user_id = auth.uid()
  returning * into v_row;

  if not found then
    raise exception 'Registo inexistente ou sem permissões';
  end if;

  return v_row;
end;
$$;


ALTER FUNCTION public.rpc_update_atleta(p_id uuid, p jsonb) OWNER TO postgres;

--
-- TOC entry 541 (class 1255 OID 47445)
-- Name: seed_pagamentos_for_atleta(uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.seed_pagamentos_for_atleta(p_atleta_id uuid, p_plano text, p_reset boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_epoca text := to_char(current_date,'YYYY') || '/' || to_char(current_date + interval '1 year','YY');
BEGIN
  PERFORM public.seed_pagamentos_for_atleta(p_atleta_id, v_epoca, p_plano, p_reset);
END
$$;


ALTER FUNCTION public.seed_pagamentos_for_atleta(p_atleta_id uuid, p_plano text, p_reset boolean) OWNER TO postgres;

--
-- TOC entry 477 (class 1255 OID 47444)
-- Name: seed_pagamentos_for_atleta(uuid, text, text, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.seed_pagamentos_for_atleta(p_atleta_id uuid, p_epoca text, p_plano text, p_reset boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user         uuid;
  v_now          date := current_date;
  v_year         int;       -- ano base extraído de p_epoca
  v_escalao_norm text;
  v_desc         text;
  i              int;
  v_devido       date;
BEGIN
  IF p_atleta_id IS NULL THEN RETURN; END IF;

  -- titular + escalão (coluna 'escalao' sem acento)
  SELECT a.user_id,
         regexp_replace(lower(coalesce(a.escalao,'')),'[^a-z0-9]+','','g')
  INTO   v_user, v_escalao_norm
  FROM public.atletas a
  WHERE a.id = p_atleta_id;

  IF v_user IS NULL THEN RETURN; END IF;

  -- >>> CORREÇÃO AQUI <<<  (extrai '2025' de '2025/26')
  SELECT COALESCE(
           (substring(p_epoca from '([0-9]{4})'))::int,
           EXTRACT(YEAR FROM v_now)::int
         )
  INTO v_year;

  -- garantir inscrição (vence 30/09 do ano base)
  INSERT INTO public.pagamentos (user_id, atleta_id, tipo, descricao, devido_em, validado)
  VALUES (v_user, p_atleta_id, 'inscricao', 'Taxa de inscrição', make_date(v_year, 9, 30), false)
  ON CONFLICT (atleta_id, descricao) DO NOTHING;

  -- Sub-23 / Masters → só inscrição, sem mensalidades/quotas
  IF v_escalao_norm LIKE '%sub23%' OR v_escalao_norm LIKE '%masters%' OR v_escalao_norm LIKE '%master%' THEN
    DELETE FROM public.pagamentos
    WHERE atleta_id = p_atleta_id AND tipo IN ('mensalidade','quota');
    RETURN;
  END IF;

  -- reset opcional (não mexe na inscrição)
  IF p_reset THEN
    DELETE FROM public.pagamentos
    WHERE atleta_id = p_atleta_id AND tipo IN ('mensalidade','quota');
  END IF;

  -- gerar mensalidades (legado usa tipo='mensalidade')
  IF p_plano = 'Anual' THEN
    v_desc   := 'Pagamento da anuidade';
    v_devido := make_date(v_year, 9, 15);
    INSERT INTO public.pagamentos (user_id, atleta_id, tipo, descricao, devido_em, validado)
    VALUES (v_user, p_atleta_id, 'mensalidade', v_desc, v_devido, false)
    ON CONFLICT (atleta_id, descricao) DO NOTHING;

  ELSIF p_plano = 'Trimestral' THEN
    FOR i IN 1..3 LOOP
      v_desc := format('Pagamento - %sº Trimestre', i);
      IF i = 1 THEN v_devido := make_date(v_year,     9, 15);
      ELSIF i = 2 THEN v_devido := make_date(v_year+1, 1, 15);
      ELSE            v_devido := make_date(v_year+1, 4, 15);
      END IF;

      INSERT INTO public.pagamentos (user_id, atleta_id, tipo, descricao, devido_em, validado)
      VALUES (v_user, p_atleta_id, 'mensalidade', v_desc, v_devido, false)
      ON CONFLICT (atleta_id, descricao) DO NOTHING;
    END LOOP;

  ELSE  -- 'Mensal'
    FOR i IN 1..10 LOOP
      v_desc := format('Pagamento - %sº Mês', i);
      IF i <= 4 THEN
        v_devido := make_date(v_year, 8 + i, 15);   -- Set..Dez (9..12)
      ELSE
        v_devido := make_date(v_year+1, i - 4, 15); -- Jan..Jun (1..6)
      END IF;

      INSERT INTO public.pagamentos (user_id, atleta_id, tipo, descricao, devido_em, validado)
      VALUES (v_user, p_atleta_id, 'mensalidade', v_desc, v_devido, false)
      ON CONFLICT (atleta_id, descricao) DO NOTHING;
    END LOOP;
  END IF;
END
$$;


ALTER FUNCTION public.seed_pagamentos_for_atleta(p_atleta_id uuid, p_epoca text, p_plano text, p_reset boolean) OWNER TO postgres;

--
-- TOC entry 521 (class 1255 OID 29012)
-- Name: set_atletas_user_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_atletas_user_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.user_id := auth.uid();  -- carimba SEMPRE a partir do JWT
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_atletas_user_id() OWNER TO postgres;

--
-- TOC entry 441 (class 1255 OID 28818)
-- Name: set_user_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_user_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end$$;


ALTER FUNCTION public.set_user_id() OWNER TO postgres;

--
-- TOC entry 536 (class 1255 OID 25624)
-- Name: sync_atletas_user_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.sync_atletas_user_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if (tg_op = 'INSERT' or new.dados_pessoais_id is distinct from old.dados_pessoais_id) then
    select dp.user_id into new.user_id
    from public.dados_pessoais dp
    where dp.id = new.dados_pessoais_id;
  end if;
  return new;
end
$$;


ALTER FUNCTION public.sync_atletas_user_id() OWNER TO postgres;

--
-- TOC entry 458 (class 1255 OID 36914)
-- Name: trg_bi_pagamentos_bloqueia_quotas(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trg_bi_pagamentos_bloqueia_quotas() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_escalao_norm text;
begin
  if new.atleta_id is not null and new.tipo = 'quota' then
    select regexp_replace(lower(coalesce(escalao,'')), '[^a-z0-9]+', '', 'g')
      into v_escalao_norm
    from public.atletas
    where id = new.atleta_id;

    if v_escalao_norm in ('masters','master','sub23') then
      raise exception
        'Não são permitidas quotas para atletas do escalão % (apenas taxa de inscrição).',
        v_escalao_norm
        using hint = 'Insere apenas pagamentos com tipo = ''inscricao'' para este atleta.';
    end if;
  end if;

  return new;
end
$$;


ALTER FUNCTION public.trg_bi_pagamentos_bloqueia_quotas() OWNER TO postgres;

--
-- TOC entry 424 (class 1255 OID 34290)
-- Name: trg_call_ensure_pagamentos(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trg_call_ensure_pagamentos() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- after INSERT e on UPDATE do plano → resemear mensalidades (reset = true)
  PERFORM public.seed_pagamentos_for_atleta(NEW.id, NEW.opcao_pagamento::text, true);
  RETURN NEW;
END
$$;


ALTER FUNCTION public.trg_call_ensure_pagamentos() OWNER TO postgres;

--
-- TOC entry 546 (class 1255 OID 39189)
-- Name: trg_cleanup_socio_inscricao(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trg_cleanup_socio_inscricao() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Se for "Não pretendo ser sócio" (com/sem acento) ou NULL → apaga a inscrição de sócio
  IF NEW.tipo_socio IS NULL
     OR NEW.tipo_socio ILIKE '%não%pretendo%'
     OR NEW.tipo_socio ILIKE '%nao%pretendo%' THEN
    DELETE FROM public.pagamentos
    WHERE atleta_id IS NULL
      AND tipo = 'inscricao'
      AND user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.trg_cleanup_socio_inscricao() OWNER TO postgres;

--
-- TOC entry 444 (class 1255 OID 30186)
-- Name: trg_fill_dados_pessoais_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.trg_fill_dados_pessoais_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.dados_pessoais_id is null and new.user_id is not null then
    select id
      into new.dados_pessoais_id
    from public.dados_pessoais
    where user_id = new.user_id
    order by created_at desc
    limit 1;
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.trg_fill_dados_pessoais_id() OWNER TO postgres;

--
-- TOC entry 456 (class 1255 OID 29698)
-- Name: whoami(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.whoami() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ select auth.uid() $$;


ALTER FUNCTION public.whoami() OWNER TO postgres;

--
-- TOC entry 388 (class 1259 OID 31918)
-- Name: admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admins (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.admins OWNER TO postgres;

--
-- TOC entry 387 (class 1259 OID 31584)
-- Name: app_admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_admins (
    user_id uuid NOT NULL
);


ALTER TABLE public.app_admins OWNER TO postgres;

--
-- TOC entry 383 (class 1259 OID 25872)
-- Name: documentos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documentos (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    doc_nivel text NOT NULL,
    atleta_id uuid,
    doc_tipo text NOT NULL,
    page integer DEFAULT 1 NOT NULL,
    file_path text NOT NULL,
    nome text NOT NULL,
    mime_type text,
    file_size bigint,
    uploaded_at timestamp without time zone DEFAULT now(),
    path text NOT NULL,
    CONSTRAINT documentos_atleta_consistency CHECK ((((doc_nivel = 'socio'::text) AND (atleta_id IS NULL)) OR ((doc_nivel = 'atleta'::text) AND (atleta_id IS NOT NULL)))),
    CONSTRAINT documentos_doc_nivel_check CHECK ((doc_nivel = ANY (ARRAY['socio'::text, 'atleta'::text])))
);


ALTER TABLE public.documentos OWNER TO postgres;

--
-- TOC entry 390 (class 1259 OID 41846)
-- Name: documentos_legacy_lixo; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documentos_legacy_lixo (
    id uuid,
    user_id uuid,
    doc_nivel text,
    atleta_id uuid,
    doc_tipo text,
    page integer,
    file_path text,
    nome text,
    mime_type text,
    file_size bigint,
    uploaded_at timestamp without time zone,
    path text
);


ALTER TABLE public.documentos_legacy_lixo OWNER TO postgres;

--
-- TOC entry 391 (class 1259 OID 41851)
-- Name: documentos_legacy_outros; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documentos_legacy_outros (
    id uuid,
    user_id uuid,
    doc_nivel text,
    atleta_id uuid,
    doc_tipo text,
    page integer,
    file_path text,
    nome text,
    mime_type text,
    file_size bigint,
    uploaded_at timestamp without time zone,
    path text
);


ALTER TABLE public.documentos_legacy_outros OWNER TO postgres;

--
-- TOC entry 405 (class 1259 OID 149226)
-- Name: epoca; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.epoca (
    id integer NOT NULL,
    name text DEFAULT ''::text NOT NULL
);


ALTER TABLE public.epoca OWNER TO postgres;

--
-- TOC entry 4052 (class 0 OID 0)
-- Dependencies: 405
-- Name: TABLE epoca; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.epoca IS 'Época de basquetebol';


--
-- TOC entry 406 (class 1259 OID 149229)
-- Name: epoca_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.epoca ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.epoca_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 382 (class 1259 OID 25766)
-- Name: v_atletas_admin; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_atletas_admin AS
 SELECT a.id,
    a.dados_pessoais_id,
    a.nome,
    a.data_nascimento,
    a.escalao,
    a.alergias,
    a.opcao_pagamento,
    a.created_at,
    a.morada,
    a.codigo_postal,
    a.contactos_urgencia,
    a.emails_preferenciais,
    a.genero,
    a.user_id,
    dp.user_id AS owner_user_id,
    dp.email AS owner_email,
    dp.nome_completo AS owner_nome
   FROM (public.atletas a
     JOIN public.dados_pessoais dp ON ((dp.id = a.dados_pessoais_id)));


ALTER VIEW public.v_atletas_admin OWNER TO postgres;

--
-- TOC entry 384 (class 1259 OID 26008)
-- Name: v_documentos_admin; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_documentos_admin AS
 SELECT d.id,
    d.doc_nivel,
    d.doc_tipo,
    d.page,
    d.file_path,
    d.nome AS file_name,
    d.mime_type,
    d.file_size,
    d.uploaded_at,
    dp.user_id AS owner_user_id,
    dp.email AS owner_email,
    dp.nome_completo AS owner_nome,
    a.id AS atleta_id,
    a.nome AS atleta_nome,
    a.escalao AS atleta_escalao,
    a.genero AS atleta_genero
   FROM ((public.documentos d
     LEFT JOIN public.atletas a ON ((a.id = d.atleta_id)))
     LEFT JOIN public.dados_pessoais dp ON (((dp.id = a.dados_pessoais_id) OR ((d.doc_nivel = 'socio'::text) AND (dp.user_id = d.user_id)))));


ALTER VIEW public.v_documentos_admin OWNER TO postgres;

--
-- TOC entry 389 (class 1259 OID 34636)
-- Name: v_tesouraria_atleta; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_tesouraria_atleta AS
 WITH this_month AS (
         SELECT p.atleta_id,
            min(p.devido_em) AS devido_em,
            bool_or(p.validado) AS any_validado,
            bool_or(((p.comprovativo_url IS NOT NULL) AND (p.validado = false))) AS any_pendente
           FROM public.pagamentos p
          WHERE (date_trunc('month'::text, (p.devido_em)::timestamp with time zone) = date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))
          GROUP BY p.atleta_id
        )
 SELECT a.id AS atleta_id,
        CASE
            WHEN t.any_validado THEN 'Regularizado'::text
            WHEN t.any_pendente THEN 'Pendente de validação'::text
            WHEN ((t.devido_em IS NOT NULL) AND (CURRENT_DATE <= t.devido_em)) THEN 'Por regularizar'::text
            WHEN ((t.devido_em IS NOT NULL) AND (CURRENT_DATE > t.devido_em)) THEN 'Em atraso'::text
            ELSE '—'::text
        END AS situacao_tesouraria_atleta
   FROM (public.atletas a
     LEFT JOIN this_month t ON ((t.atleta_id = a.id)));


ALTER VIEW public.v_tesouraria_atleta OWNER TO postgres;

--
-- TOC entry 3772 (class 2606 OID 31923)
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (user_id);


--
-- TOC entry 3770 (class 2606 OID 31588)
-- Name: app_admins app_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_admins
    ADD CONSTRAINT app_admins_pkey PRIMARY KEY (user_id);


--
-- TOC entry 3750 (class 2606 OID 24820)
-- Name: atletas atletas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.atletas
    ADD CONSTRAINT atletas_pkey PRIMARY KEY (id);


--
-- TOC entry 3744 (class 2606 OID 24805)
-- Name: dados_pessoais dados_pessoais_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dados_pessoais
    ADD CONSTRAINT dados_pessoais_pkey PRIMARY KEY (id);


--
-- TOC entry 3764 (class 2606 OID 25882)
-- Name: documentos documentos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_pkey PRIMARY KEY (id);


--
-- TOC entry 3774 (class 2606 OID 149240)
-- Name: epoca epoca_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.epoca
    ADD CONSTRAINT epoca_pkey PRIMARY KEY (id);


--
-- TOC entry 3757 (class 2606 OID 24834)
-- Name: pagamentos pagamentos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT pagamentos_pkey PRIMARY KEY (id);


--
-- TOC entry 3748 (class 2606 OID 36813)
-- Name: dados_pessoais ux_dados_pessoais_user; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dados_pessoais
    ADD CONSTRAINT ux_dados_pessoais_user UNIQUE (user_id);


--
-- TOC entry 3745 (class 1259 OID 25118)
-- Name: dados_pessoais_user_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX dados_pessoais_user_id_key ON public.dados_pessoais USING btree (user_id);


--
-- TOC entry 3746 (class 1259 OID 27134)
-- Name: dados_pessoais_user_id_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX dados_pessoais_user_id_uidx ON public.dados_pessoais USING btree (user_id);


--
-- TOC entry 3762 (class 1259 OID 25896)
-- Name: documentos_atleta_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX documentos_atleta_idx ON public.documentos USING btree (atleta_id);


--
-- TOC entry 3765 (class 1259 OID 25897)
-- Name: documentos_tipo_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX documentos_tipo_idx ON public.documentos USING btree (doc_tipo);


--
-- TOC entry 3766 (class 1259 OID 25894)
-- Name: documentos_unique_page; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX documentos_unique_page ON public.documentos USING btree (user_id, doc_nivel, COALESCE(atleta_id, '00000000-0000-0000-0000-000000000000'::uuid), doc_tipo, page);


--
-- TOC entry 3767 (class 1259 OID 26556)
-- Name: documentos_unique_slot; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX documentos_unique_slot ON public.documentos USING btree (user_id, COALESCE(atleta_id, '00000000-0000-0000-0000-000000000000'::uuid), doc_nivel, doc_tipo, page);


--
-- TOC entry 3768 (class 1259 OID 25895)
-- Name: documentos_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX documentos_user_idx ON public.documentos USING btree (user_id);


--
-- TOC entry 3751 (class 1259 OID 25623)
-- Name: idx_atletas_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_atletas_user_id ON public.atletas USING btree (user_id);


--
-- TOC entry 3752 (class 1259 OID 39188)
-- Name: idx_pagamentos_user_insc; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagamentos_user_insc ON public.pagamentos USING btree (user_id) WHERE ((atleta_id IS NULL) AND (tipo = 'inscricao'::text));


--
-- TOC entry 3753 (class 1259 OID 34165)
-- Name: pagamentos_atleta_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pagamentos_atleta_idx ON public.pagamentos USING btree (atleta_id);


--
-- TOC entry 3754 (class 1259 OID 34288)
-- Name: pagamentos_atleta_tipo_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pagamentos_atleta_tipo_idx ON public.pagamentos USING btree (atleta_id, tipo);


--
-- TOC entry 3755 (class 1259 OID 34163)
-- Name: pagamentos_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pagamentos_created_idx ON public.pagamentos USING btree (created_at DESC);


--
-- TOC entry 3758 (class 1259 OID 34287)
-- Name: pagamentos_tipo_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pagamentos_tipo_idx ON public.pagamentos USING btree (tipo);


--
-- TOC entry 3759 (class 1259 OID 34164)
-- Name: pagamentos_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pagamentos_user_idx ON public.pagamentos USING btree (user_id);


--
-- TOC entry 3760 (class 1259 OID 34722)
-- Name: ux_pagamentos_atleta_descricao; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_pagamentos_atleta_descricao ON public.pagamentos USING btree (atleta_id, descricao);


--
-- TOC entry 3761 (class 1259 OID 38234)
-- Name: ux_pagamentos_socio_inscricao; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX ux_pagamentos_socio_inscricao ON public.pagamentos USING btree (user_id, descricao) WHERE ((atleta_id IS NULL) AND (tipo = 'inscricao'::text));


--
-- TOC entry 3795 (class 2620 OID 36915)
-- Name: pagamentos bi_pagamentos_bloqueia_quotas; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER bi_pagamentos_bloqueia_quotas BEFORE INSERT OR UPDATE ON public.pagamentos FOR EACH ROW EXECUTE FUNCTION public.trg_bi_pagamentos_bloqueia_quotas();

ALTER TABLE public.pagamentos DISABLE TRIGGER bi_pagamentos_bloqueia_quotas;


--
-- TOC entry 3789 (class 2620 OID 42049)
-- Name: atletas trg_atletas_ensure_profile; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_atletas_ensure_profile BEFORE INSERT ON public.atletas FOR EACH ROW EXECUTE FUNCTION public.ensure_dados_pessoais_for_atleta();


--
-- TOC entry 3788 (class 2620 OID 39190)
-- Name: dados_pessoais trg_dados_pessoais_cleanup_socio_inscricao; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_dados_pessoais_cleanup_socio_inscricao AFTER INSERT OR UPDATE OF tipo_socio ON public.dados_pessoais FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_socio_inscricao();


--
-- TOC entry 3790 (class 2620 OID 30268)
-- Name: atletas trg_fill_dados_pessoais_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_fill_dados_pessoais_id BEFORE INSERT OR UPDATE ON public.atletas FOR EACH ROW EXECUTE FUNCTION public.trg_fill_dados_pessoais_id();


--
-- TOC entry 3796 (class 2620 OID 36491)
-- Name: pagamentos trg_pagamentos_fill_user_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_pagamentos_fill_user_id BEFORE INSERT OR UPDATE ON public.pagamentos FOR EACH ROW EXECUTE FUNCTION public.fn_pagamentos_fill_user_id();


--
-- TOC entry 3797 (class 2620 OID 42333)
-- Name: pagamentos trg_prevent_mensalidade_sub23_masters; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_prevent_mensalidade_sub23_masters BEFORE INSERT OR UPDATE ON public.pagamentos FOR EACH ROW EXECUTE FUNCTION public.prevent_mensalidade_sub23_masters();

ALTER TABLE public.pagamentos DISABLE TRIGGER trg_prevent_mensalidade_sub23_masters;


--
-- TOC entry 3798 (class 2620 OID 41579)
-- Name: pagamentos trg_prevent_quotas; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_prevent_quotas BEFORE INSERT OR UPDATE ON public.pagamentos FOR EACH ROW EXECUTE FUNCTION public.prevent_quotas_for_sub23_masters();

ALTER TABLE public.pagamentos DISABLE TRIGGER trg_prevent_quotas;


--
-- TOC entry 3799 (class 2620 OID 42111)
-- Name: pagamentos trg_prevent_sub23_mensalidade; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_prevent_sub23_mensalidade BEFORE INSERT OR UPDATE ON public.pagamentos FOR EACH ROW EXECUTE FUNCTION public.prevent_sub23_mensalidade();

ALTER TABLE public.pagamentos DISABLE TRIGGER trg_prevent_sub23_mensalidade;


--
-- TOC entry 3791 (class 2620 OID 34291)
-- Name: atletas trg_seed_pagamentos_after_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_seed_pagamentos_after_insert AFTER INSERT ON public.atletas FOR EACH ROW EXECUTE FUNCTION public.trg_call_ensure_pagamentos();


--
-- TOC entry 3792 (class 2620 OID 34292)
-- Name: atletas trg_seed_pagamentos_after_update_plano; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_seed_pagamentos_after_update_plano AFTER UPDATE OF opcao_pagamento ON public.atletas FOR EACH ROW WHEN ((old.opcao_pagamento IS DISTINCT FROM new.opcao_pagamento)) EXECUTE FUNCTION public.trg_call_ensure_pagamentos();


--
-- TOC entry 3793 (class 2620 OID 29512)
-- Name: atletas trg_set_atletas_user_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_set_atletas_user_id BEFORE INSERT ON public.atletas FOR EACH ROW EXECUTE FUNCTION public.set_atletas_user_id();


--
-- TOC entry 3794 (class 2620 OID 25625)
-- Name: atletas trg_sync_atletas_user_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_sync_atletas_user_id BEFORE INSERT OR UPDATE OF dados_pessoais_id ON public.atletas FOR EACH ROW EXECUTE FUNCTION public.sync_atletas_user_id();


--
-- TOC entry 3787 (class 2606 OID 31924)
-- Name: admins admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 3786 (class 2606 OID 31589)
-- Name: app_admins app_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_admins
    ADD CONSTRAINT app_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 3776 (class 2606 OID 24821)
-- Name: atletas atletas_dados_pessoais_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.atletas
    ADD CONSTRAINT atletas_dados_pessoais_id_fkey FOREIGN KEY (dados_pessoais_id) REFERENCES public.dados_pessoais(id) ON DELETE CASCADE;


--
-- TOC entry 3777 (class 2606 OID 25618)
-- Name: atletas atletas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.atletas
    ADD CONSTRAINT atletas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 3775 (class 2606 OID 24806)
-- Name: dados_pessoais dados_pessoais_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dados_pessoais
    ADD CONSTRAINT dados_pessoais_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 3783 (class 2606 OID 25888)
-- Name: documentos documentos_atleta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_atleta_id_fkey FOREIGN KEY (atleta_id) REFERENCES public.atletas(id) ON DELETE CASCADE;


--
-- TOC entry 3784 (class 2606 OID 25883)
-- Name: documentos documentos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT documentos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 3778 (class 2606 OID 36829)
-- Name: atletas fk_atletas_dp_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.atletas
    ADD CONSTRAINT fk_atletas_dp_id FOREIGN KEY (dados_pessoais_id) REFERENCES public.dados_pessoais(id) ON DELETE CASCADE;


--
-- TOC entry 3779 (class 2606 OID 36814)
-- Name: atletas fk_atletas_user_id_dados_pessoais; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.atletas
    ADD CONSTRAINT fk_atletas_user_id_dados_pessoais FOREIGN KEY (user_id) REFERENCES public.dados_pessoais(user_id) ON DELETE CASCADE;


--
-- TOC entry 3785 (class 2606 OID 36819)
-- Name: documentos fk_documentos_user_id_dados_pessoais; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT fk_documentos_user_id_dados_pessoais FOREIGN KEY (user_id) REFERENCES public.dados_pessoais(user_id) ON DELETE CASCADE;


--
-- TOC entry 3780 (class 2606 OID 36824)
-- Name: pagamentos fk_pagamentos_user_id_dados_pessoais; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT fk_pagamentos_user_id_dados_pessoais FOREIGN KEY (user_id) REFERENCES public.dados_pessoais(user_id) ON DELETE CASCADE;


--
-- TOC entry 3781 (class 2606 OID 24835)
-- Name: pagamentos pagamentos_atleta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT pagamentos_atleta_id_fkey FOREIGN KEY (atleta_id) REFERENCES public.atletas(id) ON DELETE CASCADE;


--
-- TOC entry 3782 (class 2606 OID 34158)
-- Name: pagamentos pagamentos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagamentos
    ADD CONSTRAINT pagamentos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- TOC entry 3955 (class 0 OID 31918)
-- Dependencies: 388
-- Name: admins; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 3994 (class 3256 OID 34167)
-- Name: admins admins_no_write_from_client; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admins_no_write_from_client ON public.admins TO authenticated USING (false) WITH CHECK (false);


--
-- TOC entry 3993 (class 3256 OID 34166)
-- Name: admins admins_select_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admins_select_self ON public.admins FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- TOC entry 3952 (class 0 OID 24811)
-- Dependencies: 380
-- Name: atletas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.atletas ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 3981 (class 3256 OID 31716)
-- Name: atletas atletas_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY atletas_admin_all ON public.atletas TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.app_admins
  WHERE (app_admins.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.app_admins
  WHERE (app_admins.user_id = auth.uid()))));


--
-- TOC entry 3983 (class 3256 OID 32162)
-- Name: atletas atletas_admin_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY atletas_admin_select ON public.atletas FOR SELECT TO authenticated USING (public.is_admin());


--
-- TOC entry 3980 (class 3256 OID 29557)
-- Name: atletas atletas_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY atletas_delete_own ON public.atletas FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- TOC entry 3977 (class 3256 OID 29554)
-- Name: atletas atletas_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY atletas_insert_own ON public.atletas FOR INSERT TO authenticated WITH CHECK (true);


--
-- TOC entry 3978 (class 3256 OID 29555)
-- Name: atletas atletas_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY atletas_select_own ON public.atletas FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- TOC entry 3992 (class 3256 OID 33956)
-- Name: atletas atletas_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY atletas_update_admin ON public.atletas FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- TOC entry 3979 (class 3256 OID 29556)
-- Name: atletas atletas_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY atletas_update_own ON public.atletas FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 3951 (class 0 OID 24794)
-- Dependencies: 379
-- Name: dados_pessoais; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.dados_pessoais ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 3982 (class 3256 OID 32057)
-- Name: dados_pessoais dados_pessoais_admin_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY dados_pessoais_admin_select ON public.dados_pessoais FOR SELECT TO authenticated USING (public.is_admin());


--
-- TOC entry 3985 (class 3256 OID 33463)
-- Name: dados_pessoais dados_pessoais_admin_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY dados_pessoais_admin_update ON public.dados_pessoais FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins a
  WHERE (a.user_id = auth.uid()))));


--
-- TOC entry 3958 (class 3256 OID 25246)
-- Name: dados_pessoais dados_pessoais_select_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY dados_pessoais_select_self ON public.dados_pessoais FOR SELECT USING ((auth.uid() = user_id));


--
-- TOC entry 3960 (class 3256 OID 25248)
-- Name: dados_pessoais dados_pessoais_update_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY dados_pessoais_update_self ON public.dados_pessoais FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- TOC entry 3959 (class 3256 OID 25247)
-- Name: dados_pessoais dados_pessoais_upsert_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY dados_pessoais_upsert_self ON public.dados_pessoais FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- TOC entry 3973 (class 3256 OID 26762)
-- Name: pagamentos delete own pagamentos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "delete own pagamentos" ON public.pagamentos FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.atletas a
  WHERE ((a.id = pagamentos.atleta_id) AND (a.user_id = auth.uid())))));


--
-- TOC entry 3969 (class 3256 OID 26515)
-- Name: documentos doc_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY doc_delete_own ON public.documentos FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- TOC entry 3966 (class 3256 OID 26512)
-- Name: documentos doc_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY doc_insert_own ON public.documentos FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 3967 (class 3256 OID 26513)
-- Name: documentos doc_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY doc_select_own ON public.documentos FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- TOC entry 3968 (class 3256 OID 26514)
-- Name: documentos doc_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY doc_update_own ON public.documentos FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- TOC entry 3954 (class 0 OID 25872)
-- Dependencies: 383
-- Name: documentos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 3984 (class 3256 OID 32163)
-- Name: documentos documentos_admin_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY documentos_admin_select ON public.documentos FOR SELECT TO authenticated USING (public.is_admin());


--
-- TOC entry 3965 (class 3256 OID 25901)
-- Name: documentos documentos_owner_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY documentos_owner_delete ON public.documentos FOR DELETE USING ((auth.uid() = user_id));


--
-- TOC entry 3963 (class 3256 OID 25899)
-- Name: documentos documentos_owner_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY documentos_owner_insert ON public.documentos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- TOC entry 3962 (class 3256 OID 25898)
-- Name: documentos documentos_owner_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY documentos_owner_select ON public.documentos FOR SELECT USING ((auth.uid() = user_id));


--
-- TOC entry 3964 (class 3256 OID 25900)
-- Name: documentos documentos_owner_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY documentos_owner_update ON public.documentos FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- TOC entry 3991 (class 3256 OID 33914)
-- Name: documentos documentos_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY documentos_update_admin ON public.documentos FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- TOC entry 3975 (class 3256 OID 27136)
-- Name: dados_pessoais dp_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY dp_insert ON public.dados_pessoais FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- TOC entry 3974 (class 3256 OID 27135)
-- Name: dados_pessoais dp_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY dp_select ON public.dados_pessoais FOR SELECT USING ((auth.uid() = user_id));


--
-- TOC entry 3976 (class 3256 OID 27137)
-- Name: dados_pessoais dp_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY dp_update ON public.dados_pessoais FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- TOC entry 3956 (class 0 OID 149226)
-- Dependencies: 405
-- Name: epoca; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.epoca ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 3971 (class 3256 OID 26759)
-- Name: pagamentos insert own pagamentos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "insert own pagamentos" ON public.pagamentos FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.atletas a
  WHERE ((a.id = pagamentos.atleta_id) AND (a.user_id = auth.uid())))));


--
-- TOC entry 3953 (class 0 OID 24826)
-- Dependencies: 381
-- Name: pagamentos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 3990 (class 3256 OID 33691)
-- Name: pagamentos pagamentos_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_admin_all ON public.pagamentos TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins ad
  WHERE (ad.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins ad
  WHERE (ad.user_id = auth.uid()))));


--
-- TOC entry 4000 (class 3256 OID 34176)
-- Name: pagamentos pagamentos_admin_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_admin_delete ON public.pagamentos FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins ad
  WHERE (ad.user_id = auth.uid()))));


--
-- TOC entry 4001 (class 3256 OID 34173)
-- Name: pagamentos pagamentos_admin_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_admin_select ON public.pagamentos FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.app_admins x
  WHERE (x.user_id = auth.uid()))));


--
-- TOC entry 3999 (class 3256 OID 34174)
-- Name: pagamentos pagamentos_admin_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_admin_update ON public.pagamentos FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.admins ad
  WHERE (ad.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admins ad
  WHERE (ad.user_id = auth.uid()))));


--
-- TOC entry 3988 (class 3256 OID 33690)
-- Name: pagamentos pagamentos_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_delete_own ON public.pagamentos FOR DELETE TO authenticated USING (((atleta_id IS NOT NULL) AND public.is_owner_pagamento_by_atleta(atleta_id)));


--
-- TOC entry 4004 (class 3256 OID 34988)
-- Name: pagamentos pagamentos_delete_own_unvalidated; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_delete_own_unvalidated ON public.pagamentos FOR DELETE TO authenticated USING (((user_id = auth.uid()) AND (validado = false)));


--
-- TOC entry 3986 (class 3256 OID 33688)
-- Name: pagamentos pagamentos_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_insert_own ON public.pagamentos FOR INSERT TO authenticated WITH CHECK (((atleta_id IS NOT NULL) AND public.is_owner_pagamento_by_atleta(atleta_id)));


--
-- TOC entry 4002 (class 3256 OID 34986)
-- Name: pagamentos pagamentos_insert_own_athlete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_insert_own_athlete ON public.pagamentos FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.atletas a
  WHERE ((a.id = pagamentos.atleta_id) AND (a.user_id = auth.uid()))))));


--
-- TOC entry 3998 (class 3256 OID 34172)
-- Name: pagamentos pagamentos_owner_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_owner_delete ON public.pagamentos FOR DELETE TO authenticated USING (public.is_owner_pagamento(user_id, atleta_id));


--
-- TOC entry 3996 (class 3256 OID 34170)
-- Name: pagamentos pagamentos_owner_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_owner_insert ON public.pagamentos FOR INSERT TO authenticated WITH CHECK (public.is_owner_pagamento(user_id, atleta_id));


--
-- TOC entry 3995 (class 3256 OID 34169)
-- Name: pagamentos pagamentos_owner_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_owner_select ON public.pagamentos FOR SELECT TO authenticated USING (public.is_owner_pagamento(user_id, atleta_id));


--
-- TOC entry 3997 (class 3256 OID 34171)
-- Name: pagamentos pagamentos_owner_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_owner_update ON public.pagamentos FOR UPDATE TO authenticated USING (public.is_owner_pagamento(user_id, atleta_id)) WITH CHECK (public.is_owner_pagamento(user_id, atleta_id));


--
-- TOC entry 3961 (class 3256 OID 25715)
-- Name: pagamentos pagamentos_owner_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_owner_write ON public.pagamentos FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.atletas a
  WHERE ((a.id = pagamentos.atleta_id) AND (a.user_id = auth.uid())))));


--
-- TOC entry 3989 (class 3256 OID 33687)
-- Name: pagamentos pagamentos_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_select_own ON public.pagamentos FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- TOC entry 3987 (class 3256 OID 33689)
-- Name: pagamentos pagamentos_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_update_own ON public.pagamentos FOR UPDATE TO authenticated USING (((atleta_id IS NOT NULL) AND public.is_owner_pagamento_by_atleta(atleta_id))) WITH CHECK (((atleta_id IS NOT NULL) AND public.is_owner_pagamento_by_atleta(atleta_id)));


--
-- TOC entry 4003 (class 3256 OID 34987)
-- Name: pagamentos pagamentos_update_own_unvalidated; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pagamentos_update_own_unvalidated ON public.pagamentos FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (validado = false))) WITH CHECK (((user_id = auth.uid()) AND (validado = false)));


--
-- TOC entry 3970 (class 3256 OID 26758)
-- Name: pagamentos select own pagamentos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "select own pagamentos" ON public.pagamentos FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.atletas a
  WHERE ((a.id = pagamentos.atleta_id) AND (a.user_id = auth.uid())))));


--
-- TOC entry 3972 (class 3256 OID 26760)
-- Name: pagamentos update own pagamentos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "update own pagamentos" ON public.pagamentos FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.atletas a
  WHERE ((a.id = pagamentos.atleta_id) AND (a.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.atletas a
  WHERE ((a.id = pagamentos.atleta_id) AND (a.user_id = auth.uid())))));


--
-- TOC entry 3957 (class 3256 OID 39000)
-- Name: pagamentos user_can_delete_own_socio_inscricao; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY user_can_delete_own_socio_inscricao ON public.pagamentos FOR DELETE TO authenticated USING (((user_id = auth.uid()) AND (atleta_id IS NULL) AND (tipo = 'inscricao'::text)));


--
-- TOC entry 4015 (class 0 OID 0)
-- Dependencies: 129
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- TOC entry 4016 (class 0 OID 0)
-- Dependencies: 380
-- Name: TABLE atletas; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.atletas TO anon;
GRANT ALL ON TABLE public.atletas TO authenticated;
GRANT ALL ON TABLE public.atletas TO service_role;


--
-- TOC entry 4017 (class 0 OID 0)
-- Dependencies: 496
-- Name: FUNCTION atletas_upsert(p_id uuid, p_dados_pessoais_id uuid, p_nome text, p_data_nascimento date, "p_escalão" text, p_alergias text, p_opcao_pagamento text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.atletas_upsert(p_id uuid, p_dados_pessoais_id uuid, p_nome text, p_data_nascimento date, "p_escalão" text, p_alergias text, p_opcao_pagamento text) TO anon;
GRANT ALL ON FUNCTION public.atletas_upsert(p_id uuid, p_dados_pessoais_id uuid, p_nome text, p_data_nascimento date, "p_escalão" text, p_alergias text, p_opcao_pagamento text) TO authenticated;
GRANT ALL ON FUNCTION public.atletas_upsert(p_id uuid, p_dados_pessoais_id uuid, p_nome text, p_data_nascimento date, "p_escalão" text, p_alergias text, p_opcao_pagamento text) TO service_role;


--
-- TOC entry 4018 (class 0 OID 0)
-- Dependencies: 379
-- Name: TABLE dados_pessoais; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.dados_pessoais TO anon;
GRANT ALL ON TABLE public.dados_pessoais TO authenticated;
GRANT ALL ON TABLE public.dados_pessoais TO service_role;


--
-- TOC entry 4019 (class 0 OID 0)
-- Dependencies: 419
-- Name: FUNCTION dados_pessoais_upsert(p_id uuid, p_nome_completo text, p_data_nascimento date, p_genero text, p_morada text, p_codigo_postal text, p_telefone text, p_email text, p_situacao_tesouraria text, p_noticias text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.dados_pessoais_upsert(p_id uuid, p_nome_completo text, p_data_nascimento date, p_genero text, p_morada text, p_codigo_postal text, p_telefone text, p_email text, p_situacao_tesouraria text, p_noticias text) TO anon;
GRANT ALL ON FUNCTION public.dados_pessoais_upsert(p_id uuid, p_nome_completo text, p_data_nascimento date, p_genero text, p_morada text, p_codigo_postal text, p_telefone text, p_email text, p_situacao_tesouraria text, p_noticias text) TO authenticated;
GRANT ALL ON FUNCTION public.dados_pessoais_upsert(p_id uuid, p_nome_completo text, p_data_nascimento date, p_genero text, p_morada text, p_codigo_postal text, p_telefone text, p_email text, p_situacao_tesouraria text, p_noticias text) TO service_role;


--
-- TOC entry 4020 (class 0 OID 0)
-- Dependencies: 516
-- Name: FUNCTION ensure_dados_pessoais_for_atleta(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.ensure_dados_pessoais_for_atleta() TO anon;
GRANT ALL ON FUNCTION public.ensure_dados_pessoais_for_atleta() TO authenticated;
GRANT ALL ON FUNCTION public.ensure_dados_pessoais_for_atleta() TO service_role;


--
-- TOC entry 4021 (class 0 OID 0)
-- Dependencies: 492
-- Name: FUNCTION ensure_inscricao_atleta_if_missing(p_atleta_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.ensure_inscricao_atleta_if_missing(p_atleta_id uuid) TO anon;
GRANT ALL ON FUNCTION public.ensure_inscricao_atleta_if_missing(p_atleta_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_inscricao_atleta_if_missing(p_atleta_id uuid) TO service_role;


--
-- TOC entry 4022 (class 0 OID 0)
-- Dependencies: 505
-- Name: FUNCTION ensure_pagamentos_agenda(p_atleta_id uuid, p_plano text, p_epoca_inicio date); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.ensure_pagamentos_agenda(p_atleta_id uuid, p_plano text, p_epoca_inicio date) TO anon;
GRANT ALL ON FUNCTION public.ensure_pagamentos_agenda(p_atleta_id uuid, p_plano text, p_epoca_inicio date) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_pagamentos_agenda(p_atleta_id uuid, p_plano text, p_epoca_inicio date) TO service_role;


--
-- TOC entry 4023 (class 0 OID 0)
-- Dependencies: 418
-- Name: FUNCTION ensure_pagamentos_for_atleta(p_atleta_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.ensure_pagamentos_for_atleta(p_atleta_id uuid) TO anon;
GRANT ALL ON FUNCTION public.ensure_pagamentos_for_atleta(p_atleta_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_pagamentos_for_atleta(p_atleta_id uuid) TO service_role;


--
-- TOC entry 4024 (class 0 OID 0)
-- Dependencies: 509
-- Name: FUNCTION fn_pagamentos_fill_user_id(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.fn_pagamentos_fill_user_id() TO anon;
GRANT ALL ON FUNCTION public.fn_pagamentos_fill_user_id() TO authenticated;
GRANT ALL ON FUNCTION public.fn_pagamentos_fill_user_id() TO service_role;


--
-- TOC entry 4025 (class 0 OID 0)
-- Dependencies: 524
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- TOC entry 4026 (class 0 OID 0)
-- Dependencies: 517
-- Name: FUNCTION is_owner_pagamento(p_user_id uuid, p_atleta_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_owner_pagamento(p_user_id uuid, p_atleta_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_owner_pagamento(p_user_id uuid, p_atleta_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_owner_pagamento(p_user_id uuid, p_atleta_id uuid) TO service_role;


--
-- TOC entry 4027 (class 0 OID 0)
-- Dependencies: 473
-- Name: FUNCTION is_owner_pagamento_by_atleta(p_atleta_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_owner_pagamento_by_atleta(p_atleta_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_owner_pagamento_by_atleta(p_atleta_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_owner_pagamento_by_atleta(p_atleta_id uuid) TO service_role;


--
-- TOC entry 4030 (class 0 OID 0)
-- Dependencies: 381
-- Name: TABLE pagamentos; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pagamentos TO anon;
GRANT ALL ON TABLE public.pagamentos TO authenticated;
GRANT ALL ON TABLE public.pagamentos TO service_role;


--
-- TOC entry 4031 (class 0 OID 0)
-- Dependencies: 475
-- Name: FUNCTION pagamentos_upsert(p_id uuid, p_atleta_id uuid, p_descricao text, p_comprovativo_url text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.pagamentos_upsert(p_id uuid, p_atleta_id uuid, p_descricao text, p_comprovativo_url text) TO anon;
GRANT ALL ON FUNCTION public.pagamentos_upsert(p_id uuid, p_atleta_id uuid, p_descricao text, p_comprovativo_url text) TO authenticated;
GRANT ALL ON FUNCTION public.pagamentos_upsert(p_id uuid, p_atleta_id uuid, p_descricao text, p_comprovativo_url text) TO service_role;


--
-- TOC entry 4032 (class 0 OID 0)
-- Dependencies: 504
-- Name: FUNCTION prevent_mensalidade_sub23_masters(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.prevent_mensalidade_sub23_masters() TO anon;
GRANT ALL ON FUNCTION public.prevent_mensalidade_sub23_masters() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_mensalidade_sub23_masters() TO service_role;


--
-- TOC entry 4033 (class 0 OID 0)
-- Dependencies: 486
-- Name: FUNCTION prevent_quotas_for_sub23_masters(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.prevent_quotas_for_sub23_masters() TO anon;
GRANT ALL ON FUNCTION public.prevent_quotas_for_sub23_masters() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_quotas_for_sub23_masters() TO service_role;


--
-- TOC entry 4034 (class 0 OID 0)
-- Dependencies: 547
-- Name: FUNCTION prevent_sub23_mensalidade(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.prevent_sub23_mensalidade() TO anon;
GRANT ALL ON FUNCTION public.prevent_sub23_mensalidade() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_sub23_mensalidade() TO service_role;


--
-- TOC entry 4035 (class 0 OID 0)
-- Dependencies: 416
-- Name: FUNCTION rpc_create_atleta(p jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.rpc_create_atleta(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.rpc_create_atleta(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_create_atleta(p jsonb) TO service_role;


--
-- TOC entry 4036 (class 0 OID 0)
-- Dependencies: 513
-- Name: FUNCTION rpc_update_atleta(p_id uuid, p jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.rpc_update_atleta(p_id uuid, p jsonb) TO anon;
GRANT ALL ON FUNCTION public.rpc_update_atleta(p_id uuid, p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_update_atleta(p_id uuid, p jsonb) TO service_role;


--
-- TOC entry 4037 (class 0 OID 0)
-- Dependencies: 541
-- Name: FUNCTION seed_pagamentos_for_atleta(p_atleta_id uuid, p_plano text, p_reset boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.seed_pagamentos_for_atleta(p_atleta_id uuid, p_plano text, p_reset boolean) TO anon;
GRANT ALL ON FUNCTION public.seed_pagamentos_for_atleta(p_atleta_id uuid, p_plano text, p_reset boolean) TO authenticated;
GRANT ALL ON FUNCTION public.seed_pagamentos_for_atleta(p_atleta_id uuid, p_plano text, p_reset boolean) TO service_role;


--
-- TOC entry 4038 (class 0 OID 0)
-- Dependencies: 477
-- Name: FUNCTION seed_pagamentos_for_atleta(p_atleta_id uuid, p_epoca text, p_plano text, p_reset boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.seed_pagamentos_for_atleta(p_atleta_id uuid, p_epoca text, p_plano text, p_reset boolean) TO anon;
GRANT ALL ON FUNCTION public.seed_pagamentos_for_atleta(p_atleta_id uuid, p_epoca text, p_plano text, p_reset boolean) TO authenticated;
GRANT ALL ON FUNCTION public.seed_pagamentos_for_atleta(p_atleta_id uuid, p_epoca text, p_plano text, p_reset boolean) TO service_role;


--
-- TOC entry 4039 (class 0 OID 0)
-- Dependencies: 521
-- Name: FUNCTION set_atletas_user_id(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_atletas_user_id() TO anon;
GRANT ALL ON FUNCTION public.set_atletas_user_id() TO authenticated;
GRANT ALL ON FUNCTION public.set_atletas_user_id() TO service_role;


--
-- TOC entry 4040 (class 0 OID 0)
-- Dependencies: 441
-- Name: FUNCTION set_user_id(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_user_id() TO anon;
GRANT ALL ON FUNCTION public.set_user_id() TO authenticated;
GRANT ALL ON FUNCTION public.set_user_id() TO service_role;


--
-- TOC entry 4041 (class 0 OID 0)
-- Dependencies: 536
-- Name: FUNCTION sync_atletas_user_id(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.sync_atletas_user_id() TO anon;
GRANT ALL ON FUNCTION public.sync_atletas_user_id() TO authenticated;
GRANT ALL ON FUNCTION public.sync_atletas_user_id() TO service_role;


--
-- TOC entry 4042 (class 0 OID 0)
-- Dependencies: 458
-- Name: FUNCTION trg_bi_pagamentos_bloqueia_quotas(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trg_bi_pagamentos_bloqueia_quotas() TO anon;
GRANT ALL ON FUNCTION public.trg_bi_pagamentos_bloqueia_quotas() TO authenticated;
GRANT ALL ON FUNCTION public.trg_bi_pagamentos_bloqueia_quotas() TO service_role;


--
-- TOC entry 4043 (class 0 OID 0)
-- Dependencies: 424
-- Name: FUNCTION trg_call_ensure_pagamentos(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trg_call_ensure_pagamentos() TO anon;
GRANT ALL ON FUNCTION public.trg_call_ensure_pagamentos() TO authenticated;
GRANT ALL ON FUNCTION public.trg_call_ensure_pagamentos() TO service_role;


--
-- TOC entry 4044 (class 0 OID 0)
-- Dependencies: 546
-- Name: FUNCTION trg_cleanup_socio_inscricao(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trg_cleanup_socio_inscricao() TO anon;
GRANT ALL ON FUNCTION public.trg_cleanup_socio_inscricao() TO authenticated;
GRANT ALL ON FUNCTION public.trg_cleanup_socio_inscricao() TO service_role;


--
-- TOC entry 4045 (class 0 OID 0)
-- Dependencies: 444
-- Name: FUNCTION trg_fill_dados_pessoais_id(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.trg_fill_dados_pessoais_id() TO anon;
GRANT ALL ON FUNCTION public.trg_fill_dados_pessoais_id() TO authenticated;
GRANT ALL ON FUNCTION public.trg_fill_dados_pessoais_id() TO service_role;


--
-- TOC entry 4046 (class 0 OID 0)
-- Dependencies: 456
-- Name: FUNCTION whoami(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.whoami() TO anon;
GRANT ALL ON FUNCTION public.whoami() TO authenticated;
GRANT ALL ON FUNCTION public.whoami() TO service_role;


--
-- TOC entry 4047 (class 0 OID 0)
-- Dependencies: 388
-- Name: TABLE admins; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admins TO anon;
GRANT ALL ON TABLE public.admins TO authenticated;
GRANT ALL ON TABLE public.admins TO service_role;


--
-- TOC entry 4048 (class 0 OID 0)
-- Dependencies: 387
-- Name: TABLE app_admins; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.app_admins TO anon;
GRANT ALL ON TABLE public.app_admins TO authenticated;
GRANT ALL ON TABLE public.app_admins TO service_role;


--
-- TOC entry 4049 (class 0 OID 0)
-- Dependencies: 383
-- Name: TABLE documentos; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.documentos TO anon;
GRANT ALL ON TABLE public.documentos TO authenticated;
GRANT ALL ON TABLE public.documentos TO service_role;


--
-- TOC entry 4050 (class 0 OID 0)
-- Dependencies: 390
-- Name: TABLE documentos_legacy_lixo; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.documentos_legacy_lixo TO anon;
GRANT ALL ON TABLE public.documentos_legacy_lixo TO authenticated;
GRANT ALL ON TABLE public.documentos_legacy_lixo TO service_role;


--
-- TOC entry 4051 (class 0 OID 0)
-- Dependencies: 391
-- Name: TABLE documentos_legacy_outros; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.documentos_legacy_outros TO anon;
GRANT ALL ON TABLE public.documentos_legacy_outros TO authenticated;
GRANT ALL ON TABLE public.documentos_legacy_outros TO service_role;


--
-- TOC entry 4053 (class 0 OID 0)
-- Dependencies: 405
-- Name: TABLE epoca; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.epoca TO anon;
GRANT ALL ON TABLE public.epoca TO authenticated;
GRANT ALL ON TABLE public.epoca TO service_role;


--
-- TOC entry 4054 (class 0 OID 0)
-- Dependencies: 406
-- Name: SEQUENCE epoca_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.epoca_id_seq TO anon;
GRANT ALL ON SEQUENCE public.epoca_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.epoca_id_seq TO service_role;


--
-- TOC entry 4055 (class 0 OID 0)
-- Dependencies: 382
-- Name: TABLE v_atletas_admin; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_atletas_admin TO anon;
GRANT ALL ON TABLE public.v_atletas_admin TO authenticated;
GRANT ALL ON TABLE public.v_atletas_admin TO service_role;


--
-- TOC entry 4056 (class 0 OID 0)
-- Dependencies: 384
-- Name: TABLE v_documentos_admin; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_documentos_admin TO anon;
GRANT ALL ON TABLE public.v_documentos_admin TO authenticated;
GRANT ALL ON TABLE public.v_documentos_admin TO service_role;


--
-- TOC entry 4057 (class 0 OID 0)
-- Dependencies: 389
-- Name: TABLE v_tesouraria_atleta; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.v_tesouraria_atleta TO anon;
GRANT ALL ON TABLE public.v_tesouraria_atleta TO authenticated;
GRANT ALL ON TABLE public.v_tesouraria_atleta TO service_role;


--
-- TOC entry 2525 (class 826 OID 16488)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- TOC entry 2526 (class 826 OID 16489)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- TOC entry 2524 (class 826 OID 16487)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- TOC entry 2528 (class 826 OID 16491)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- TOC entry 2523 (class 826 OID 16486)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- TOC entry 2527 (class 826 OID 16490)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


-- Completed on 2025-12-04 09:22:49

--
-- PostgreSQL database dump complete
--

\unrestrict I0uY7gJSZFeUq2d3CrVdwPZe23SuhwZfIA0NGI25zXn3sIHa4cM4kI7BRQRCKhb

