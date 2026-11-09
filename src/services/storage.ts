import { BUCKETS, getSupabaseClient } from '@/lib/supabase'

/**
 * Storage service (profile photos)
 * ================================
 *
 * The `avatars` bucket is private. The database stores a PATH; images are only
 * ever displayed through short-lived signed URLs, so nothing is publicly
 * enumerable.
 *
 * Paths follow:
 *   <user_id>/avatar-<timestamp>.<ext>              — a user's own picture
 *   members/<member_code>/avatar-<timestamp>.<ext>  — a member's picture
 */

/** Signed URLs stay valid for one hour; screens refetch on each load. */
const SIGNED_URL_TTL_SECONDS = 60 * 60

/**
 * Whether a stored value is an object path (as opposed to an absolute URL).
 * Legacy/demo records may already hold full URLs; those are passed through.
 */
export function isStoragePath(value: string | null | undefined): boolean {
  if (!value) return false
  return !/^https?:\/\//i.test(value)
}

function extensionFor(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : ''
  const safe = (fromName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (safe) return safe
  const byType: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  return byType[file.type] ?? 'png'
}

/** Upload a photo into `folder` and return its storage path. */
export async function uploadAvatar(folder: string, file: File): Promise<string> {
  const supabase = getSupabaseClient()
  if (!supabase) throw new Error('Supabase is not configured.')

  const cleanFolder = folder.replace(/^\/+|\/+$/g, '')
  const path = `${cleanFolder}/avatar-${Date.now()}.${extensionFor(file)}`

  const { error } = await supabase.storage
    .from(BUCKETS.avatars)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || undefined,
    })
  if (error) throw new Error(error.message)
  return path
}

/** Delete a previously uploaded photo. Paths/URLs that are not ours are ignored. */
export async function removeAvatar(path: string | null | undefined): Promise<void> {
  if (!isStoragePath(path)) return
  const supabase = getSupabaseClient()
  if (!supabase) return
  const { error } = await supabase.storage.from(BUCKETS.avatars).remove([path!])
  if (error) throw new Error(error.message)
}

/** Resolve a single stored path to a signed URL (or pass a URL through). */
export async function signAvatarUrl(
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null
  if (!isStoragePath(path)) return path
  const supabase = getSupabaseClient()
  if (!supabase) return null
  const { data, error } = await supabase.storage
    .from(BUCKETS.avatars)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data) return null
  return data.signedUrl
}

/**
 * Resolve many paths to signed URLs in one round-trip, keyed by path.
 * Returns an empty map when nothing needs signing.
 */
export async function signAvatarUrls(
  paths: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const unique = Array.from(
    new Set(paths.filter((p): p is string => isStoragePath(p)),
  ))
  if (unique.length === 0) return {}

  const supabase = getSupabaseClient()
  if (!supabase) return {}

  const { data, error } = await supabase.storage
    .from(BUCKETS.avatars)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS)
  if (error || !data) return {}

  const map: Record<string, string> = {}
  for (const item of data) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl
  }
  return map
}
