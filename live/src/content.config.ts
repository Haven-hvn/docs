import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

/**
 * THE CODEX — protocol documentation.
 *
 * Structured as a reference work rather than a blog: every entry belongs to a
 * numbered part, carries its own folio, and declares which files in the source
 * repository it was transcribed from. That last field is the point — a reader
 * can always get back to the primary source.
 */
const codex = defineCollection({
  loader: glob({ base: './src/content/codex', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    /** Entry title, as it appears in the running head. */
    title: z.string(),
    /** One sentence. Used in the index, search, and metadata. */
    summary: z.string(),
    /** Part of the work this entry belongs to. */
    part: z.enum([
      'Foundations',
      'The Rule Set',
      'Surfaces',
      'Contracts',
      'Operations',
    ]),
    /** Folio within the part — controls ordering and is printed in the margin. */
    folio: z.string(),
    /** Sort key inside the part. */
    order: z.number(),
    /** Editorial state, printed as a stamp when not settled. */
    status: z.enum(['settled', 'revising', 'proposed']).default('settled'),
    /** Files in the source repository this entry transcribes. */
    sources: z.array(z.string()).default([]),
    /** Optional epigraph, set in the editorial face above the first paragraph. */
    epigraph: z.string().optional(),
  }),
})

export const collections = { codex }
