import { HttpError } from "../../lib/http-error";
import type { TemplateField } from "../templates/template.types";

export type FieldValue = string | boolean | null;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Resolve each field's value with precedence override > data > field.default >
 * empty. `default: "today"` is kept literal here and converted in resolveDates.
 */
export function applyDefaults(
  fields: TemplateField[],
  data: Record<string, FieldValue> = {},
  override: Record<string, FieldValue> = {},
): Record<string, FieldValue> {
  const result: Record<string, FieldValue> = {};

  for (const field of fields) {
    if (field.key in override) {
      result[field.key] = override[field.key];
    } else if (field.key in data) {
      result[field.key] = data[field.key];
    } else if (field.default !== undefined && field.default !== null) {
      result[field.key] = field.default;
    } else {
      result[field.key] = field.type === "boolean" ? false : null;
    }
  }

  return result;
}

/** Throw HttpError(400) listing the keys of any required-but-empty fields. */
export function validateRequiredFields(
  fields: TemplateField[],
  values: Record<string, FieldValue>,
): void {
  const missing = fields
    .filter((field) => field.required)
    .filter((field) => {
      const value = values[field.key];
      return value === null || value === undefined || value === "";
    })
    .map((field) => field.key);

  if (missing.length > 0) {
    throw new HttpError(400, "Missing required template fields", { missing });
  }
}

/**
 * Convert date fields whose value is "today" (incl. the `default: "today"`
 * sentinel) into an actual YYYY-MM-DD string. The renderer must never receive
 * the literal "today".
 */
export function resolveDates(
  fields: TemplateField[],
  values: Record<string, FieldValue>,
): Record<string, FieldValue> {
  const result = { ...values };

  for (const field of fields) {
    if (field.type === "date" && result[field.key] === "today") {
      result[field.key] = todayIso();
    }
  }

  return result;
}
