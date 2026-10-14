export interface SearchablePost { title: string; description: string; tags: string[] }

export function matchesSearch(post: SearchablePost, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('id-ID');
  return !needle || `${post.title} ${post.description} ${post.tags.join(' ')}`.toLocaleLowerCase('id-ID').includes(needle);
}
