import { z } from 'zod';

const TemplateFeatureDefSchema = z.object({
  label: z.string(),
  dirs: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
  deps: z.array(z.string()).optional(),
  devDeps: z.array(z.string()).optional(),
  incompatibleWith: z.array(z.string()).optional(),
});

export const TemplateConfigSchema = z.object({
  id: z.string(),
  platform: z.enum(['web', 'mobile']),
  compatibleCliVersions: z.string(),
  variables: z.record(z.string()),
  features: z.record(TemplateFeatureDefSchema),
  entryFiles: z.record(z.string()),
});

export type TemplateConfigInput = z.input<typeof TemplateConfigSchema>;
