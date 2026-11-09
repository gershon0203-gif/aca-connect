-- =============================================================================
-- ACA Connect — 0005 · Storage (profile photos)
-- =============================================================================
-- A single private bucket `avatars` holds both profile pictures and member
-- photos. Objects are stored as a PATH in the database (profiles.avatar_url /
-- members.avatar_url) and resolved to short-lived signed URLs at read time by
-- the storage service — nothing is publicly enumerable.
--
-- Layout:
--   <user_id>/avatar-<timestamp>.<ext>          — a user's own profile photo
--   members/<member_code>/avatar-<timestamp>.<ext> — a member's photo
--
-- Write rules:
--   * admin/editor may write any object in the bucket
--   * any authenticated user may write inside their own <user_id>/ folder
-- Read rule:
--   * any authenticated user with a role may read (needed to sign URLs)
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880, -- 5 MiB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Read: staff only (bucket is private; reads happen through signed URLs).
drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and public.current_user_role() is not null
  );

-- Insert: admins/editors anywhere, everyone inside their own folder.
drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      public.can_edit_members()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- Update: admins/editors anywhere, owners on their own objects.
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (public.can_edit_members() or owner = auth.uid())
  )
  with check (
    bucket_id = 'avatars'
    and (
      public.can_edit_members()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

-- Delete: admins/editors anywhere, owners on their own objects.
drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (public.can_edit_members() or owner = auth.uid())
  );
