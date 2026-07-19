import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "../../config/env";
import type { TemplateManifest, TemplateSummary } from "./template.types";

const templateFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "textarea", "date", "boolean", "select", "color"]),
  scope: z.enum(["metadata", "option"]),
  required: z.boolean().optional(),
  default: z.union([z.string(), z.boolean()]).optional(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  // Only render this field while another field (by key) holds `value`.
  dependsOn: z
    .object({ key: z.string(), value: z.union([z.string(), z.boolean(), z.null()]) })
    .optional(),
});

const templateManifestSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  engine: z.object({
    kind: z.enum(["typst-package", "local"]),
    package: z.string().optional(),
    entry: z.string().default("template.typ"),
  }),
  category: z.string(),
  tags: z.array(z.string()).default([]),
  fonts: z.array(z.string()).default([]),
  headingOffset: z.number().int().default(0),
  // Mirrors anvilnote-renderer's own template-loader.ts schema addition —
  // each template's content/text-column width (page width minus its own
  // margins), in cm. Required (no default): every template's manifest.json
  // now has a real measured value (see that repo's own commit for how it
  // was measured), so a template missing it should fail loudly, not
  // silently guess.
  textWidthCm: z.number().positive(),
  // Optional, unlike textWidthCm above: only plain-note has a real
  // measured value so far (see anvilnote-renderer's templates/plain-note/
  // manifest.json) — every other template's manifest.json simply omits
  // this field, and that's fine; question-block's written-answer
  // "blank space" feature just isn't available under those templates
  // (see anvilnote-web's question.ts writtenHeightCm attr, which falls
  // back to null when this is absent).
  textHeightCm: z.number().positive().optional(),
  fields: z.array(templateFieldSchema),
  // Mirrors anvilnote-renderer's own template-loader.ts schema — whether
  // this template's adapter chain actually applies a numbered-headings/
  // margin override. Exposed to the web app so its metadata panel can hide
  // a control that would otherwise silently do nothing (or, for a couple
  // of templates whose wrapped package forbids `set page` inside its own
  // layout container, actually fail to render).
  supportsNumberedHeadings: z.boolean().default(false),
  supportsCustomMargins: z.boolean().default(false),
});

function templatesDir() {
  return path.join(env.ANVILNOTE_RENDERER_PATH, "templates");
}

// Templates present in the renderer but intentionally not offered in the app.
const HIDDEN_SLUGS = new Set(["kunskap", "minimal-lecture"]);

// "@preview/{name}:{version}" -> https://typst.app/universe/package/{name}
function universeUrlFor(engine: TemplateManifest["engine"]): string | undefined {
  if (engine.kind !== "typst-package" || !engine.package) return undefined;
  const name = engine.package.replace(/^@preview\//, "").split(":")[0];
  return name ? `https://typst.app/universe/package/${name}` : undefined;
}

function toSummary(manifest: TemplateManifest): TemplateSummary {
  return {
    slug: manifest.slug,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    category: manifest.category,
    tags: manifest.tags,
    fields: manifest.fields,
    textWidthCm: manifest.textWidthCm,
    textHeightCm: manifest.textHeightCm,
    universeUrl: universeUrlFor(manifest.engine),
    supportsNumberedHeadings: manifest.supportsNumberedHeadings,
    supportsCustomMargins: manifest.supportsCustomMargins,
  };
}

/**
 * File-based template registry. Replaces the former DB `Template` table +
 * ensurePlaceholder so there is a single source of truth: the renderer's
 * template folders. Manifests are scanned once and cached in memory (a small,
 * fixed set; changes require an API restart, acceptable for MVP).
 */
class TemplateRegistry {
  private cache: Map<string, TemplateManifest> | null = null;

  private load(): Map<string, TemplateManifest> {
    if (this.cache) {
      return this.cache;
    }

    const map = new Map<string, TemplateManifest>();
    const dir = templatesDir();

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      console.warn(`template-registry: cannot read templates dir ${dir}`, error);
      this.cache = map;
      return map;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || HIDDEN_SLUGS.has(entry.name)) {
        continue;
      }
      const manifestPath = path.join(dir, entry.name, "manifest.json");
      let raw: string;
      try {
        raw = fs.readFileSync(manifestPath, "utf8");
      } catch {
        continue; // no manifest.json in this dir
      }

      const parsed = templateManifestSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        // Skip (don't crash) on a malformed/legacy manifest; log for visibility.
        console.warn(
          `template-registry: skipping invalid manifest ${manifestPath}: ${parsed.error.message}`,
        );
        continue;
      }

      map.set(parsed.data.slug, parsed.data as TemplateManifest);
    }

    this.cache = map;
    return map;
  }

  /** Force a re-scan (used by tests; the app scans lazily on first access). */
  reload() {
    this.cache = null;
    this.load();
  }

  list(): TemplateSummary[] {
    const items = Array.from(this.load().values()).map(toSummary);
    // Surface the default template (plain-note) first; keep the rest stable.
    const def = env.DEFAULT_TEMPLATE_SLUG;
    return items.sort(
      (a, b) => (a.slug === def ? 0 : 1) - (b.slug === def ? 0 : 1),
    );
  }

  get(slug: string): TemplateManifest | undefined {
    return this.load().get(slug);
  }

  has(slug: string): boolean {
    return this.load().has(slug);
  }

  /** Absolute path to a template's preview.png (existence not guaranteed). */
  previewPath(slug: string): string | null {
    if (!this.has(slug)) {
      return null;
    }
    return path.join(templatesDir(), slug, "preview.png");
  }
}

export const templateRegistry = new TemplateRegistry();
