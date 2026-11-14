-- =====================================================================
--  RONDAS · Esquema de base de datos para Supabase
--  Pega este archivo entero en Supabase → SQL Editor → New query → Run
--
--  ⚠️  ANTES DE EJECUTAR: cambia el código de invitación.
--      Busca  CAMBIA-ESTE-CODIGO  (aparece una sola vez, más abajo)
--      y pon el código que vais a usar los 13 para registraros.
-- =====================================================================

-- ---------- Perfiles ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null check (username ~ '^[a-z0-9_.]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url   text,
  bio          text not null default '' check (char_length(bio) <= 160),
  created_at   timestamptz not null default now()
);

-- ---------- Consumiciones ----------
create table if not exists public.drinks (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  type        text not null check (type in ('cerveza','copa','vino','coctel','chupito','otro')),
  name        text not null check (char_length(name) between 1 and 80),
  place       text check (char_length(place) <= 80),
  price       numeric(7,2) check (price >= 0),
  quantity    int not null default 1 check (quantity between 1 and 50),
  rating      smallint not null check (rating between 1 and 10),
  note        text check (char_length(note) <= 1000),
  photo_url   text,
  thumb_url   text,
  photo_path  text,
  drunk_at    timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists drinks_created_idx on public.drinks (created_at desc);
create index if not exists drinks_user_drunk_idx on public.drinks (user_id, drunk_at desc);

-- ---------- Brindis (likes) ----------
create table if not exists public.likes (
  drink_id   bigint not null references public.drinks(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (drink_id, user_id)
);

-- ---------- Comentarios ----------
create table if not exists public.comments (
  id         bigint generated always as identity primary key,
  drink_id   bigint not null references public.drinks(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists comments_drink_idx on public.comments (drink_id, created_at);

-- ---------- Permisos ----------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.drinks, public.likes, public.comments to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- Seguridad por filas (RLS) ----------
-- Solo los usuarios registrados (la peña) pueden ver nada. Cada uno solo edita lo suyo.
alter table public.profiles enable row level security;
alter table public.drinks   enable row level security;
alter table public.likes    enable row level security;
alter table public.comments enable row level security;

drop policy if exists "profiles_read"   on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_read"   on public.profiles for select to authenticated using (true);
create policy "profiles_update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "drinks_read"   on public.drinks;
drop policy if exists "drinks_insert" on public.drinks;
drop policy if exists "drinks_update" on public.drinks;
drop policy if exists "drinks_delete" on public.drinks;
create policy "drinks_read"   on public.drinks for select to authenticated using (true);
create policy "drinks_insert" on public.drinks for insert to authenticated with check (user_id = auth.uid());
create policy "drinks_update" on public.drinks for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "drinks_delete" on public.drinks for delete to authenticated using (user_id = auth.uid());

drop policy if exists "likes_read"   on public.likes;
drop policy if exists "likes_insert" on public.likes;
drop policy if exists "likes_delete" on public.likes;
create policy "likes_read"   on public.likes for select to authenticated using (true);
create policy "likes_insert" on public.likes for insert to authenticated with check (user_id = auth.uid());
create policy "likes_delete" on public.likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists "comments_read"   on public.comments;
drop policy if exists "comments_insert" on public.comments;
drop policy if exists "comments_delete" on public.comments;
create policy "comments_read"   on public.comments for select to authenticated using (true);
create policy "comments_insert" on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy "comments_delete" on public.comments for delete to authenticated using (user_id = auth.uid());

-- ---------- Alta de usuarios (con código de invitación) ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 👇👇👇  CAMBIA AQUÍ EL CÓDIGO DE INVITACIÓN  👇👇👇
  if coalesce(new.raw_user_meta_data->>'invite', '') <> 'CAMBIA-ESTE-CODIGO' then
    raise exception 'INVITE_INVALID';
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    lower(new.raw_user_meta_data->>'username'),
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), new.raw_user_meta_data->>'username')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Comprobar si un nombre de usuario está libre (se usa en el registro)
create or replace function public.username_available(u text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select not exists (select 1 from public.profiles where username = lower(u));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------- Fotos (Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "photos_read"   on storage.objects;
drop policy if exists "photos_insert" on storage.objects;
drop policy if exists "photos_update" on storage.objects;
drop policy if exists "photos_delete" on storage.objects;
create policy "photos_read" on storage.objects for select
  using (bucket_id = 'photos');
create policy "photos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Listo 🍻
