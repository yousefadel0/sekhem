import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/data-access/prisma.service";

/** HTTP contract fixtures use the memory repositories and an empty durable ledger.
 * Actual authorization/receipt persistence has separate opt-in database tests.
 * Missing delegates fail explicitly; this adapter cannot write to a database. */
export async function createContractTestApp(options: { rawBody?: boolean;
  projectScope?: { id: string; organizationId: string; userId: string; role: string } } = {}) {
  const { projectScope, ...appOptions } = options;
  // Prisma's generated client can load deployment env on import. Contract tests
  // explicitly select their existing staging fixtures after imports, before DI.
  process.env.SEKHEM_RUNTIME_MODE = "memory";
  process.env.SEKHEM_DATA_SOURCE = "memory";
  process.env.SEKHEM_DB_WRITE_MODE = "none";
  process.env.SEKHEM_AUTH_DB_MODE = "false";
  process.env.NODE_ENV = "test";
  const empty = { findMany: async () => [], findUnique: async () => null };
  const db = { agentArtifact: empty, agentRun: empty, auditEvent: empty,
    project: { ...empty, findUnique: async ({ where }: { where: { id: string } }) =>
      projectScope && where.id === projectScope.id
        ? { id: projectScope.id, organizationId: projectScope.organizationId, personalOwnerId: null } : null },
    user: { ...empty, findUnique: async ({ where }: { where: { id: string } }) =>
      projectScope && where.id === projectScope.userId
        ? { id: projectScope.userId, organizationId: projectScope.organizationId, status: "active" } : null },
    projectMember: { ...empty, findUnique: async ({ where }: { where: { projectId_userId: { projectId: string; userId: string } } }) =>
      projectScope && where.projectId_userId.projectId === projectScope.id && where.projectId_userId.userId === projectScope.userId
        ? { role: projectScope.role } : null },
    $executeRawUnsafe: async () => 0, $queryRawUnsafe: async () => [],
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(db) };
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(db).compile();
  return module.createNestApplication({ logger: false, ...appOptions });
}
