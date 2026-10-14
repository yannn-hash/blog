import rss from '@astrojs/rss';
import { SITE } from '../config';
import { getPublicPosts, postUrl } from '../lib/posts';

export async function GET() {
  return rss({
    title: `${SITE.title} — Blog Riskiyanto`,
    description: SITE.description,
    site: SITE.url,
    items: (await getPublicPosts()).map((post) => ({ title: post.data.title, description: post.data.description, pubDate: post.data.pubDate, link: postUrl(post), categories: post.data.tags })),
    customData: '<language>id-ID</language>',
  });
}
