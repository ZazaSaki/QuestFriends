import { getUploadUrl } from './api';

/**
 * Upload a file straight to MinIO via a presigned PUT and return its durable
 * public URL (the bucket is public-read, so this URL renders forever).
 */
export async function uploadMedia(file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const pre = await getUploadUrl(ext);
  const put = await fetch(pre.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
  });
  if (!put.ok) throw new Error(`MinIO upload failed (${put.status})`);
  return pre.publicUrl;
}
