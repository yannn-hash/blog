import { z } from 'astro/zod';

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gunakan tanggal YYYY-MM-DD dalam tanda kutip.').refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Tanggal kalender tidak valid.').transform((value) => new Date(`${value}T00:00:00.000+07:00`));

export const postSchema = z.object({
  title: z.string().trim().min(1, 'Judul wajib diisi.'),
  description: z.string().trim().min(1, 'Deskripsi wajib diisi.'),
  pubDate: calendarDate,
  tags: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Tag harus berupa huruf kecil, angka, atau tanda hubung.')).default([]).transform((tags) => [...new Set(tags)]),
  draft: z.boolean().default(false),
  example: z.boolean().default(false),
});
