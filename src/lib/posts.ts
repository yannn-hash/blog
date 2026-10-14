import { getCollection, type CollectionEntry } from 'astro:content';
import { isPublished } from './publication';

export type Post = CollectionEntry<'blog'>;
const buildTime = new Date();

export async function getPublicPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data }) => isPublished(data, buildTime));
  return posts.sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime() || a.id.localeCompare(b.id));
}
export function postUrl(post: Post): string { return `/blog/${post.id}/`; }
export function tagUrl(tag: string): string { return `/tag/${encodeURIComponent(tag)}/`; }
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date);
}
export function collectTags(posts: Post[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const post of posts) for (const tag of post.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, 'id-ID'));
}
