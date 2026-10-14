export interface Publishable { draft: boolean; pubDate: Date }

// Satu aturan publikasi untuk seluruh halaman, feed, dan sumber pencarian.
export function isPublished(data: Publishable, now: Date = new Date()): boolean {
  return !data.draft && data.pubDate.getTime() <= now.getTime();
}
