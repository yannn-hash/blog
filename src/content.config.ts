import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { postSchema } from './lib/post-schema';

const blog = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: './src/content/blog',
    generateId: ({ entry }) => {
      const slug = entry.replace(/\.md$/, '');
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(slug)) {
        throw new Error(`Nama file artikel tidak valid: ${entry}. Gunakan huruf kecil, angka, dan tanda hubung.`);
      }
      return slug;
    },
  }),
  schema: postSchema,
});
export const collections = { blog };
