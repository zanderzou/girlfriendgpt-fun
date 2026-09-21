import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date(),
    category: z.string(),
    readTime: z.string(),
    accent: z.enum(["rose", "violet", "amber"]),
    answer: z.string(),
    keywords: z.array(z.string()),
    sources: z.array(z.object({ name: z.string(), url: z.string().url() })),
  }),
});

export const collections = { blog };
