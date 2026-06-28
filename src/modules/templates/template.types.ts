export type TemplateFieldType = "text" | "date" | "select" | "boolean";

export type TemplateField = {
  key: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  placeholder?: string;
  defaultValue?: string | boolean | null;
  options?: string[];
};

export type TemplateConfig = {
  fields?: TemplateField[];
  [key: string]: unknown;
};

export type TemplateRecord = {
  id: string;
  name: string;
  description: string | null;
  config: TemplateConfig | null;
  typstBody: string | null;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
};
