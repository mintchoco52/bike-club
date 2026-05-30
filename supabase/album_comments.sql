-- ============================================================
-- 모임 앨범 사진 댓글
-- Supabase 대시보드 > SQL Editor 에서 실행
-- ============================================================

create table if not exists public.album_photo_comments (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references public.album_photos(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  user_name   text not null default '',                 -- 비정규화: 회원 탈퇴 후에도 누가 단 댓글인지 흔적
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_apc_photo on public.album_photo_comments (photo_id, created_at);

alter table public.album_photo_comments enable row level security;

-- 누구나 조회
create policy "apc_select" on public.album_photo_comments for select using (true);
-- 로그인한 회원이 본인 이름으로 작성
create policy "apc_insert" on public.album_photo_comments for insert with check (auth.uid() = user_id);
-- 본인 댓글만 삭제
create policy "apc_delete" on public.album_photo_comments for delete using (auth.uid() = user_id);
