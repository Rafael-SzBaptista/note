-- =====================================================================
-- Note — schema Postgres / Supabase
-- Rode os blocos na ordem no SQL Editor (ou tudo de uma vez).
-- =====================================================================

-- ---------- 1. TIPOS ----------
create type regra_mode   as enum ('horas', 'dias', 'ciclo');
create type pay_type     as enum ('plantao', 'hora', 'fixo');
create type shift_status as enum ('normal', 'folga', 'troca');
create type event_kind   as enum ('compromisso', 'extra', 'cobertura');
create type repeat_kind  as enum ('none', 'daily', 'weekly', 'monthly', 'yearly');
create type app_view     as enum ('hoje', 'agenda', 'dia', '3dias', 'semana', 'mes');

-- ---------- 2. TABELAS ----------

-- Escalas (ex.: "Plantão 12x36"); as regras ficam em escala_regras
create table escalas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null default 'Plantão',
  color      text not null default '#039be5',
  end_date   date,                       -- último dia da escala (opcional)
  created_at timestamptz not null default now()
);
create index escalas_user_idx on escalas(user_id);

-- Versões da regra: mudar a escala cria uma nova linha, sem reescrever o histórico
create table escala_regras (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  escala_id   uuid not null references escalas(id) on delete cascade,
  mode        regra_mode not null default 'horas',
  -- modo "horas": X h de trabalho por Y h de descanso
  on_hours    numeric not null default 12,
  off_hours   numeric not null default 36,
  -- modo "dias": X dias trabalhados por Y de folga
  on_days     int     not null default 5,
  off_days    int     not null default 2,
  shift_hours numeric not null default 8,
  -- modo "ciclo": turnos [{id,label,start,hours}] e sequência ['D','D','N','F',...]
  turnos      jsonb   not null default '[{"id":"D","label":"Dia","start":"07:00","hours":12},{"id":"N","label":"Noite","start":"19:00","hours":12}]',
  ciclo       text[]  not null default '{D,D,N,N,F,F,F,F}',
  start_date  date    not null,
  start_time  time    not null default '07:00',
  pay_type    pay_type not null default 'plantao',
  pay_value   numeric not null default 0,
  night       boolean not null default true,   -- adicional noturno
  holiday     boolean not null default true,   -- adicional de feriado
  created_at  timestamptz not null default now()
);
create index escala_regras_escala_idx on escala_regras(escala_id, start_date);

-- Ajustes de um plantão específico (troca, folga/falta, observação, pago, removido)
-- occ_start = início do plantão gerado pela regra (equivale à chave `${escalaId}|${YYYY-MM-DDTHH:MM}`)
create table shift_overrides (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  escala_id  uuid not null references escalas(id) on delete cascade,
  occ_start  timestamp not null,               -- horário local, sem fuso (como no app)
  status     shift_status not null default 'normal',
  note       text not null default '',
  colega     text,                              -- troca: quem cobriu
  paid       boolean not null default false,
  removed    boolean not null default false,
  unique (escala_id, occ_start)
);
create index shift_overrides_user_idx on shift_overrides(user_id);

-- Compromissos, plantões extras e coberturas
create table eventos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind         event_kind not null default 'compromisso',
  title        text not null default '',
  start_at     timestamp not null,              -- horário local, sem fuso
  end_at       timestamp not null,
  all_day      boolean not null default false,
  color        text not null default '#039be5',
  location     text not null default '',
  description  text not null default '',
  -- plantão extra
  value        numeric,
  paid         boolean not null default false,
  -- cobertura
  colega       text,
  escala_id    uuid references escalas(id) on delete set null,
  troca_key    text,
  -- repetição
  repeat       repeat_kind not null default 'none',
  repeat_until date,
  exdates      date[] not null default '{}',
  created_at   timestamptz not null default now(),
  check (end_at >= start_at)
);
create index eventos_user_start_idx on eventos(user_id, start_at);

-- Anotações por dia
create table notas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,
  text       text not null default '',
  color      text not null default '#f6bf26',
  created_at timestamptz not null default now()
);
create index notas_user_date_idx on notas(user_id, date);

-- Configurações (1 linha por usuário) + agendas ocultas + visão atual
create table user_settings (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  night_pct        numeric not null default 20,
  holiday_pct      numeric not null default 100,
  min_rest         numeric not null default 11,
  extra_value      numeric not null default 0,
  reminders        boolean not null default false,
  remind_min       int     not null default 60,
  remind_events    boolean not null default true,
  -- ids ocultos: uuid de escala, 'eventos', 'extras', 'coberturas', 'notas', 'feriados'
  hidden           text[]  not null default '{}',
  view             app_view not null default 'hoje',
  updated_at       timestamptz not null default now()
);

-- ---------- 3. RLS (cada usuário só enxerga e altera o que é seu) ----------
alter table escalas         enable row level security;
alter table escala_regras   enable row level security;
alter table shift_overrides enable row level security;
alter table eventos         enable row level security;
alter table notas           enable row level security;
alter table user_settings   enable row level security;

create policy "own rows" on escalas         for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on escala_regras   for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on shift_overrides for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on eventos         for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on notas           for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on user_settings   for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- 4. EXTRAS ----------

-- Cria a linha de configurações automaticamente no cadastro do usuário
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Mantém updated_at em dia
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger user_settings_touch
  before update on user_settings
  for each row execute function touch_updated_at();
