-- REST initial schema. Apply in the Supabase SQL editor before enabling cloud sync.
-- The app has no gym or branch table by product decision: it serves one personal gym setup.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 32),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'username', 'OREZ'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create table if not exists public.user_settings (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  locale text not null default 'ar',
  weight_unit text not null default 'kg' check (weight_unit = 'kg'),
  default_rep_min smallint not null default 8 check (default_rep_min between 1 and 100),
  default_rep_max smallint not null default 12 check (default_rep_max between 1 and 100),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  equipment_type text not null default 'machine' check (equipment_type in ('machine', 'cable', 'free_weight', 'bar', 'bodyweight', 'other')),
  primary_muscle text not null check (char_length(primary_muscle) between 1 and 60),
  secondary_muscles text[] not null default '{}',
  weight_increment_kg numeric(7,2) check (weight_increment_kg is null or weight_increment_kg > 0),
  min_weight_kg numeric(7,2) check (min_weight_kg is null or min_weight_kg >= 0),
  max_weight_kg numeric(7,2) check (max_weight_kg is null or max_weight_kg > 0),
  setup_notes text,
  technique_notes text,
  safety_notes text,
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.equipment_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  storage_path text not null unique,
  alt_text text,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  primary_muscle text not null,
  rep_min smallint not null default 8 check (rep_min between 1 and 100),
  rep_max smallint not null default 12 check (rep_max between 1 and 100 and rep_max >= rep_min),
  instructions text,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.exercise_muscles (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  muscle text not null,
  contribution smallint not null check (contribution between 1 and 100),
  role text not null check (role in ('primary', 'secondary', 'stabilizer')),
  primary key (exercise_id, muscle)
);

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  template_id uuid not null references public.workout_templates(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position smallint not null check (position >= 0),
  target_sets smallint check (target_sets between 1 and 20),
  rep_min smallint check (rep_min between 1 and 100),
  rep_max smallint check (rep_max between 1 and 100),
  target_rir smallint check (target_rir between 0 and 10),
  unique (template_id, position)
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  template_id uuid references public.workout_templates(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  started_at timestamptz not null,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  position smallint not null check (position >= 0),
  unique (session_id, position)
);

create table if not exists public.set_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  position smallint not null check (position >= 0),
  set_type text not null default 'working' check (set_type in ('warmup', 'working')),
  weight_kg numeric(7,2) not null check (weight_kg >= 0),
  reps smallint not null check (reps between 1 and 1000),
  rir smallint check (rir between 0 and 10),
  rpe numeric(3,1) check (rpe between 1 and 10),
  note text,
  completed_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (workout_exercise_id, position)
);

create table if not exists public.nutrition_targets (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  calories_kcal integer not null default 0 check (calories_kcal >= 0),
  protein_g numeric(7,1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(7,1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(7,1) not null default 0 check (fat_g >= 0),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  category text not null,
  calories_kcal integer not null check (calories_kcal >= 0),
  protein_g numeric(7,1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(7,1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(7,1) not null default 0 check (fat_g >= 0),
  notes text,
  logged_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.recovery_check_ins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  muscle text not null,
  soreness smallint check (soreness between 0 and 10),
  fatigue smallint check (fatigue between 0 and 10),
  note text,
  recorded_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sync_operations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  client_mutation_id uuid not null unique,
  client_updated_at timestamptz not null,
  applied_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists equipment_owner_name_idx on public.equipment (owner_id, name);
create index if not exists exercises_owner_name_idx on public.exercises (owner_id, name);
create index if not exists sessions_owner_completed_idx on public.workout_sessions (owner_id, completed_at desc);
create index if not exists meals_owner_logged_idx on public.meals (owner_id, logged_at desc);
create index if not exists set_logs_owner_completed_idx on public.set_logs (owner_id, completed_at desc);

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.equipment enable row level security;
alter table public.equipment_photos enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_muscles enable row level security;
alter table public.workout_templates enable row level security;
alter table public.workout_template_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.set_logs enable row level security;
alter table public.nutrition_targets enable row level security;
alter table public.meals enable row level security;
alter table public.recovery_check_ins enable row level security;
alter table public.sync_operations enable row level security;

create policy "profile owner only" on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "settings owner only" on public.user_settings for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "equipment owner only" on public.equipment for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "equipment photos owner only" on public.equipment_photos for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "exercises owner only" on public.exercises for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "exercise muscles owner only" on public.exercise_muscles for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "templates owner only" on public.workout_templates for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "template exercises owner only" on public.workout_template_exercises for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "sessions owner only" on public.workout_sessions for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "workout exercises owner only" on public.workout_exercises for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "set logs owner only" on public.set_logs for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "nutrition target owner only" on public.nutrition_targets for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "meals owner only" on public.meals for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "recovery owner only" on public.recovery_check_ins for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "sync operation owner only" on public.sync_operations for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger settings_updated_at before update on public.user_settings for each row execute function public.set_updated_at();
create trigger equipment_updated_at before update on public.equipment for each row execute function public.set_updated_at();
create trigger exercises_updated_at before update on public.exercises for each row execute function public.set_updated_at();
create trigger templates_updated_at before update on public.workout_templates for each row execute function public.set_updated_at();
create trigger sessions_updated_at before update on public.workout_sessions for each row execute function public.set_updated_at();
create trigger meal_updated_at before update on public.meals for each row execute function public.set_updated_at();
create trigger nutrition_target_updated_at before update on public.nutrition_targets for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipment-media', 'equipment-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "private equipment media read" on storage.objects for select to authenticated using (
  bucket_id = 'equipment-media' and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy "private equipment media upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'equipment-media' and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy "private equipment media update" on storage.objects for update to authenticated using (
  bucket_id = 'equipment-media' and (storage.foldername(name))[1] = (select auth.uid()::text)
) with check (
  bucket_id = 'equipment-media' and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy "private equipment media delete" on storage.objects for delete to authenticated using (
  bucket_id = 'equipment-media' and (storage.foldername(name))[1] = (select auth.uid()::text)
);
