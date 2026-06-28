import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export class DocumentRepository {
  list() {
    return prisma.document.findMany({
      orderBy: { updatedAt: "desc" },
    });
  }

  create(data: Prisma.DocumentCreateInput) {
    return prisma.document.create({ data });
  }

  findById(id: string) {
    return prisma.document.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.DocumentUpdateInput) {
    return prisma.document.update({
      where: { id },
      data,
    });
  }

  delete(id: string) {
    return prisma.document.delete({
      where: { id },
    });
  }
}
