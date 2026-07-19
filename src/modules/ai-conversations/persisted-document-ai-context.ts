import {
  AnvilNoteDocumentV1Schema,
  type AnvilNoteDocumentV1,
} from "@anvilnote/ai-writer/document";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function children(node: JsonRecord): unknown[] {
  return Array.isArray(node.content) ? node.content : [];
}

function optionalNullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

function normalizeMark(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (value.type !== "link") return { type: value.type };
  const attrs = record(value.attrs);
  return {
    type: "link",
    attrs: {
      href: attrs.href,
      ...(attrs.title !== undefined ? { title: attrs.title } : {}),
      ...(attrs.target !== undefined ? { target: attrs.target } : {}),
    },
  };
}

function normalizeInline(value: unknown): unknown {
  if (!isRecord(value)) return value;
  switch (value.type) {
    case "text":
      return {
        type: "text",
        text: value.text,
        ...(Array.isArray(value.marks)
          ? { marks: value.marks.map(normalizeMark) }
          : {}),
      };
    case "hardBreak":
      return { type: "hardBreak" };
    case "inlineMath":
      return {
        type: "inlineMath",
        attrs: { latex: record(value.attrs).latex },
      };
    default:
      return value;
  }
}

function normalizeCellAttrs(value: unknown) {
  const attrs = record(value);
  return {
    colspan: attrs.colspan ?? 1,
    rowspan: attrs.rowspan ?? 1,
    ...(attrs.colwidth !== undefined ? { colwidth: attrs.colwidth } : {}),
  };
}

function normalizeBlock(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const attrs = record(value.attrs);
  const content = children(value);
  switch (value.type) {
    case "paragraph":
      return { type: "paragraph", content: content.map(normalizeInline) };
    case "heading":
      return {
        type: "heading",
        attrs: {
          level: attrs.level,
          ...(attrs.id !== undefined
            ? { id: optionalNullableString(attrs.id) }
            : {}),
        },
        content: content.map(normalizeInline),
      };
    case "bulletList":
    case "listItem":
    case "blockquote":
      return { type: value.type, content: content.map(normalizeBlock) };
    case "orderedList":
      return {
        type: "orderedList",
        ...(attrs.start !== undefined ? { attrs: { start: attrs.start } } : {}),
        content: content.map(normalizeBlock),
      };
    case "codeBlock":
      return {
        type: "codeBlock",
        attrs: { language: attrs.language ?? "plaintext" },
        content: content.map(normalizeInline),
      };
    case "blockMath":
      return {
        type: "mathBlock",
        attrs: {
          latex: attrs.latex,
          ...(attrs.id !== undefined
            ? { id: optionalNullableString(attrs.id) }
            : {}),
          ...(attrs.equationNumber !== undefined
            ? { equationNumber: optionalNullableString(attrs.equationNumber) }
            : {}),
          ...(attrs.refName !== undefined
            ? { refName: optionalNullableString(attrs.refName) }
            : {}),
        },
      };
    case "table":
      return {
        type: "table",
        ...(Object.keys(attrs).length > 0
          ? {
              attrs: {
                ...(attrs.id !== undefined
                  ? { id: optionalNullableString(attrs.id) }
                  : {}),
                ...(attrs.caption !== undefined
                  ? { caption: attrs.caption }
                  : {}),
                ...(attrs.variant !== undefined
                  ? { variant: attrs.variant }
                  : {}),
                ...(attrs.align !== undefined ? { align: attrs.align } : {}),
              },
            }
          : {}),
        content: content.map(normalizeBlock),
      };
    case "tableRow":
      return {
        type: "tableRow",
        ...(attrs.rowHeight !== undefined
          ? { attrs: { rowHeight: attrs.rowHeight } }
          : {}),
        content: content.map(normalizeBlock),
      };
    case "tableHeader":
    case "tableCell":
      return {
        type: value.type,
        attrs: normalizeCellAttrs(value.attrs),
        content: content.map(normalizeBlock),
      };
    case "horizontalRule":
      return {
        type: "horizontalRule",
        ...(Object.keys(attrs).length > 0
          ? {
              attrs: {
                ...(attrs.thicknessPt !== undefined
                  ? { thicknessPt: attrs.thicknessPt }
                  : {}),
                ...(attrs.lineStyle !== undefined
                  ? { lineStyle: attrs.lineStyle }
                  : {}),
              },
            }
          : {}),
      };
    default:
      return value;
  }
}

/**
 * Documents are persisted as a one-element array containing a Tiptap `doc`.
 * Conversation execution owns loading that trusted current document, so this
 * boundary converts the stored editor shape into the public AI AST before the
 * writer request is assembled. The public schema remains the final authority:
 * unknown nodes, unsafe marks, invalid attrs and bad placement still fail.
 */
export function persistedDocumentToAIContext(
  persistedContent: unknown[],
): AnvilNoteDocumentV1 {
  const wrapped =
    persistedContent.length === 1 &&
    isRecord(persistedContent[0]) &&
    persistedContent[0].type === "doc"
      ? persistedContent[0]
      : { type: "doc", content: persistedContent };

  return AnvilNoteDocumentV1Schema.parse({
    schemaVersion: "anvilnote.document.v1",
    type: "doc",
    content: children(wrapped).map(normalizeBlock),
  });
}
