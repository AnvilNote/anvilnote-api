// Template manifests are owned by the renderer (files under
// ANVILNOTE_RENDERER_PATH/templates). The API reads and exposes them; it never
// stores templates in the database.

export type TemplateFieldType =
  | "text"
  | "textarea"
  | "date"
  | "boolean"
  | "select"
  | "color";

export type TemplateFieldScope = "metadata" | "option";

export type TemplateField = {
  key: string;
  label: string;
  type: TemplateFieldType;
  scope: TemplateFieldScope;
  required?: boolean;
  default?: string | boolean;
  placeholder?: string;
  options?: string[];
  dependsOn?: { key: string; value: string | boolean | null };
};

export type TemplateEngine = {
  kind: "typst-package" | "local";
  package?: string;
  entry: string;
};

export type TemplateManifest = {
  slug: string;
  name: string;
  description: string;
  version: string;
  engine: TemplateEngine;
  category: string;
  tags: string[];
  fonts: string[];
  headingOffset: number;
  fields: TemplateField[];
};

// Summary returned by the list endpoint (drops engine/fonts/headingOffset,
// keeps a derived universeUrl for typst-package templates).
export type TemplateSummary = {
  slug: string;
  name: string;
  description: string;
  version: string;
  category: string;
  tags: string[];
  fields: TemplateField[];
  /** Typst Universe page for the wrapped @preview package, when applicable. */
  universeUrl?: string;
};
