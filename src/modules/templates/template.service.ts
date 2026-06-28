import { Prisma, type Template } from "@prisma/client";
import { HttpError } from "../../lib/http-error";
import type { CreateTemplateInput, UpdateTemplateInput } from "./template.schemas";
import type { TemplateConfig, TemplateRecord } from "./template.types";
import { TemplateRepository } from "./template.repository";

function normalizeTemplateConfig(value: unknown): TemplateConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as TemplateConfig;
}

function mapTemplate(template: Template): TemplateRecord {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    config: normalizeTemplateConfig(template.config),
    typstBody: template.typstBody,
    isBuiltIn: template.isBuiltIn,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

function toTemplateConfigInput(config: TemplateConfig | null | undefined) {
  if (config === undefined) {
    return undefined;
  }

  if (config === null) {
    return Prisma.DbNull;
  }

  return config as Prisma.InputJsonValue;
}

export class TemplateService {
  private readonly templateRepository = new TemplateRepository();

  async listTemplates() {
    const templates = await this.templateRepository.list();
    return templates.map(mapTemplate);
  }

  async createTemplate(input: CreateTemplateInput) {
    const template = await this.templateRepository.create({
      name: input.name,
      description: input.description ?? null,
      config: toTemplateConfigInput(input.config) ?? Prisma.DbNull,
      typstBody: input.typstBody ?? null,
      isBuiltIn: input.isBuiltIn,
    });

    return mapTemplate(template);
  }

  async getTemplate(id: string) {
    const template = await this.templateRepository.findById(id);

    if (!template) {
      throw new HttpError(404, "Template not found");
    }

    return mapTemplate(template);
  }

  async updateTemplate(id: string, input: UpdateTemplateInput) {
    await this.ensureTemplateExists(id);

    const template = await this.templateRepository.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.config !== undefined ? { config: toTemplateConfigInput(input.config) } : {}),
      ...(input.typstBody !== undefined ? { typstBody: input.typstBody } : {}),
      ...(input.isBuiltIn !== undefined ? { isBuiltIn: input.isBuiltIn } : {}),
    });

    return mapTemplate(template);
  }

  async deleteTemplate(id: string) {
    await this.ensureTemplateExists(id);
    const template = await this.templateRepository.delete(id);
    return { id: template.id };
  }

  private async ensureTemplateExists(id: string) {
    const template = await this.templateRepository.findById(id);
    if (!template) {
      throw new HttpError(404, "Template not found");
    }
    return template;
  }
}
