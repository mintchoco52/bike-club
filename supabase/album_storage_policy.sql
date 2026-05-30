-- ============================================================
-- album-photos Storage 버킷 정책
--
-- Supabase 대시보드 > SQL Editor 에서 실행
-- (버킷을 Public으로 만들었어도 INSERT/UPDATE/DELETE는 별도 정책 필요)
-- ============================================================

-- 1) 누구나 읽기 (public bucket이라면 사실상 자동이지만 명시)
create policy "album_photos_public_read"
  on storage.objects for select
  using (bucket_id = 'album-photos');

-- 2) 로그인한 회원이 자기 폴더에만 업로드 (path: {album_id}/{user_id}/...)
create policy "album_photos_authenticated_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'album-photos'
    and auth.uid()::text = (storage.foldername(name))[2]
  );

-- 3) 본인이 올린 파일만 삭제
create policy "album_photos_authenticated_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'album-photos'
    and auth.uid()::text = (storage.foldername(name))[2]
  );
