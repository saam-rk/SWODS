import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export async function retryPhotoCleanup(photoId?: string) {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return;
  let query = supabase.from('photo_file_cleanup').select('photo_id, storage_path, thumbnail_path').limit(100);
  if (photoId) query = query.eq('photo_id', photoId);
  const {data, error} = await query;
  if (error) throw error;
  for (const job of data ?? []) {
    const removed = await supabase.storage.from('photos').remove([job.storage_path, job.thumbnail_path]);
    if (removed.error) throw removed.error;
    const cleared = await supabase.from('photo_file_cleanup').delete().eq('photo_id', job.photo_id);
    if (cleared.error) throw cleared.error;
  }
}
