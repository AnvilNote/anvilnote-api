import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export class ProjectRepository {
  list() {
    return prisma.project.findMany({
      orderBy: { createdAt: "asc" },
    });
  }

  create(data: Prisma.ProjectCreateInput) {
    return prisma.project.create({ data });
  }

  findById(id: string) {
    return prisma.project.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.ProjectUpdateInput) {
    return prisma.project.update({
      where: { id },
      data,
    });
  }

  // Deleting a project unfiles its documents via the SET NULL foreign key.
  delete(id: string) {
    return prisma.project.delete({
      where: { id },
    });
  }
}
