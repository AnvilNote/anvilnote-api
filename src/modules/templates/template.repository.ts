import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export class TemplateRepository {
  list() {
    return prisma.template.findMany({
      orderBy: [{ isBuiltIn: "desc" }, { updatedAt: "desc" }],
    });
  }

  create(data: Prisma.TemplateCreateInput) {
    return prisma.template.create({ data });
  }

  findById(id: string) {
    return prisma.template.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.TemplateUpdateInput) {
    return prisma.template.update({
      where: { id },
      data,
    });
  }

  delete(id: string) {
    return prisma.template.delete({
      where: { id },
    });
  }

  ensurePlaceholder(id: string) {
    return prisma.template.upsert({
      where: { id },
      update: {},
      create: {
        id,
        name: id,
        description: "Auto-created placeholder template metadata.",
        config: {},
        // Placeholders are not curated built-ins; keep them out of the
        // built-in bucket so they don't sort ahead of real templates.
        isBuiltIn: false,
      },
    });
  }
}
