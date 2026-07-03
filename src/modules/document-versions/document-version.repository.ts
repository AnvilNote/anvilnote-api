import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export class DocumentVersionRepository {
  listSummariesByDocument(documentId: string) {
    return prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentId: true, title: true, createdAt: true },
    });
  }

  findById(id: string) {
    return prisma.documentVersion.findUnique({ where: { id } });
  }

  create(data: Prisma.DocumentVersionCreateInput) {
    return prisma.documentVersion.create({ data });
  }

  // Keeps only the `keep` most recent versions for a document, deleting the
  // rest — an unbounded version history for a frequently-edited document
  // would otherwise grow forever. Called after every create, so at most one
  // batch of overflow rows (rarely more than one) needs deleting each time.
  async pruneToLatest(documentId: string, keep: number) {
    const overflow = await prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      skip: keep,
      select: { id: true },
    });
    if (overflow.length === 0) return;
    await prisma.documentVersion.deleteMany({
      where: { id: { in: overflow.map((v) => v.id) } },
    });
  }
}
