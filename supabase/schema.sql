-- ============================================================
-- 기선자 모임 - Supabase Schema
-- Supabase 대시보드 > SQL Editor 에서 실행하세요
-- ============================================================

-- 프로필 테이블 (auth.users 와 1:1 연결)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '',
  bio         text not null default '',
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- 모임 테이블
create table if not exists public.meetings (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  date             date not null,
  time             time not null default '09:00',
  location         text not null,
  lat              float8 not null default 37.5665,
  lng              float8 not null default 126.9780,
  description      text not null default '',
  max_participants int not null default 10,
  difficulty       text not null default '초급',
  distance         text not null default '',
  image            text,
  creator_name     text not null default '',
  created_by       uuid not null references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now()
);

-- 모임 참가자 테이블
create table if not exists public.meeting_participants (
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  user_name   text not null default '',
  joined_at   timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

-- 갤러리 사진 테이블
create table if not exists public.photos (
  id             uuid primary key default gen_random_uuid(),
  url            text not null,
  title          text not null,
  meeting_title  text not null default '',
  uploader_name  text not null default '',
  uploaded_by    uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now()
);

-- 사진 좋아요 테이블
create table if not exists public.photo_likes (
  photo_id  uuid not null references public.photos(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  primary key (photo_id, user_id)
);

-- ============================================================
-- 회원가입 시 자동으로 프로필 생성하는 트리거
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Row Level Security (RLS) 설정
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.meetings           enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.photos             enable row level security;
alter table public.photo_likes        enable row level security;

-- Profiles 정책
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- Meetings 정책
create policy "meetings_select" on public.meetings for select using (true);
create policy "meetings_insert" on public.meetings for insert with check (auth.uid() = created_by);
create policy "meetings_update" on public.meetings for update using (auth.uid() = created_by);
create policy "meetings_delete" on public.meetings for delete using (auth.uid() = created_by);

-- Meeting participants 정책
create policy "mp_select" on public.meeting_participants for select using (true);
create policy "mp_insert" on public.meeting_participants for insert with check (auth.uid() = user_id);
create policy "mp_delete" on public.meeting_participants for delete using (auth.uid() = user_id);

-- Photos 정책
create policy "photos_select" on public.photos for select using (true);
create policy "photos_insert" on public.photos for insert with check (auth.uid() = uploaded_by);
create policy "photos_delete" on public.photos for delete using (auth.uid() = uploaded_by);

-- Photo likes 정책
create policy "likes_select" on public.photo_likes for select using (true);
create policy "likes_insert" on public.photo_likes for insert with check (auth.uid() = user_id);
create policy "likes_delete" on public.photo_likes for delete using (auth.uid() = user_id);

-- ============================================================
-- Storage 버킷 설정 (Supabase 대시보드 > Storage 에서 직접 생성)
--   1. "avatars"  버킷 생성 → Public 체크
--   2. "photos"   버킷 생성 → Public 체크
-- ============================================================
