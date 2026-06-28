import { HttpError } from "../../lib/http-error";
import { templateRegistry } from "./template.registry";
import type { TemplateManifest, TemplateSummary } from "./template.types";

// Templates are file-based (owned by the renderer). This service is a thin
// read-only facade over the in-memory registry — no persistence.
export class TemplateService {
  listTemplates(): TemplateSummary[] {
    return templateRegistry.list();
  }

  getTemplate(slug: string): TemplateManifest {
    const manifest = templateRegistry.get(slug);
    if (!manifest) {
      throw new HttpError(404, "Template not found");
    }
    return manifest;
  }

  getPreviewPath(slug: string): string {
    const previewPath = templateRegistry.previewPath(slug);
    if (!previewPath) {
      throw new HttpError(404, "Template not found");
    }
    return previewPath;
  }
}
