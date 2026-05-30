-- ============================================================
-- 기선자 모임 - 모임 앨범 기능 (사후, 자동 생성형)
--
-- 실행 방법:
--   Supabase 대시보드 > SQL Editor > New query 에 통째로 붙여넣고 Run
--
-- 원칙:
--   - 기존 갤러리(photos)는 건드리지 않음. 별도 테이블로 신설.
--   - CASCADE 남용 금지: 회원 탈퇴해도 다른 멤버의 추억(앨범/사진)은 남김.
--   - 앨범 삭제 시 그 안의 사진은 같이 정리 (storage object는 별도 정리 필요).
-- ============================================================

-- 모임 앨범 (사후, 첫 사진 업로드 시 자동 생성됨)
create table if not exists public.albums (
  id            uuid primary key default gen_random_uuid(),
  date          date not null,
  title         text not null,                              -- 예: "5월 30일 라이딩"
  meeting_id    uuid references public.meetings(id) on delete set null,  -- 기존 사전 모임 연결(선택)
  created_by    uuid references auth.users(id) on delete set null,
  creator_name  text not null default '',                   -- 비정규화: 회원 탈퇴 후에도 누가 만든 앨범인지 흔적
  created_at    timestamptz not null default now()
);

-- 앨범에 올라간 사진들 (여러 명이 같은 앨범에 올림)
create table if not exists public.album_photos (
  id             uuid primary key default gen_random_uuid(),
  album_id       uuid not null references public.albums(id) on delete cascade,
  url            text not null,
  uploader_id    uuid references auth.users(id) on delete set null,
  uploader_name  text not null default '',                  -- 비정규화: 탈퇴 후에도 누가 올린 사진인지
  created_at     timestamptz not null default now()
);

-- 인덱스 (성능)
create index if not exists idx_albums_date         on public.albums (date desc);
create index if not exists idx_album_photos_album  on public.album_photos (album_id, created_at desc);

-- ============================================================
-- Row Level Security (기존 테이블 정책과 동일한 톤)
-- ============================================================
alter table public.albums       enable row level security;
alter table public.album_photos enable row level security;

-- 앨범 정책: 누구나 조회 / 본인이 만든 앨범만 수정·삭제
create policy "albums_select" on public.albums for select using (true);
create policy "albums_insert" on public.albums for insert with check (auth.uid() = created_by);
create policy "albums_update" on public.albums for update using (auth.uid() = created_by);
create policy "albums_delete" on public.albums for delete using (auth.uid() = created_by);

-- 앨범 사진 정책: 누구나 조회 / 본인이 올린 사진만 삭제
create policy "album_photos_select" on public.album_photos for select using (true);
create policy "album_photos_insert" on public.album_photos for insert with check (auth.uid() = uploader_id);
create policy "album_photos_delete" on public.album_photos for delete using (auth.uid() = uploader_id);

-- ============================================================
-- Storage 버킷 (대시보드 > Storage 에서 직접 생성)
--   "album-photos" 버킷 생성 → Public 체크
-- ============================================================
