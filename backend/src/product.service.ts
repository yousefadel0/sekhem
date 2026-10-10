import { Inject, Injectable, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { MemoryProductReadRepository } from "./data-access/memory-product-read.repository";
import { PostgresProductReadRepository } from "./data-access/postgres-product-read.repository";
import { PRODUCT_READ_REPOSITORY } from "./data-access/product-read.repository";
import type { ProductReadRepository } from "./data-access/product-read.repository";
import { PrismaService } from "./data-access/prisma.service";
import { RuntimeConfigService } from "./runtime-config.service";
import type { RuntimeConfigEnv } from "./runtime-config.service";
import type {
  ActivityEventDto,
  ApprovalSummaryDto,
  AuditEventDto,
  BlockerSummaryDto,
  DbReadinessDto,
  HealthDto,
  InitiativeBlockersResponseDto,
  InitiativeDetailDto,
  InitiativeSummaryDto,
  InitiativeTasksResponseDto,
  ListQuery,
  ModuleDetailDto,
  ModuleSummaryDto,
  ProjectDashboardDto,
  ProjectSummaryDto,
  ReleaseCandidateDetailDto,
  ReleaseCandidateSummaryDto,
  SecurityGateDetailDto
} from "./dto";

type DbReadinessProbe = () => Promise<void>;

@Injectable()
export class ProductService {
  private repository: ProductReadRepository;
  private readonly runtimeConfig = new RuntimeConfigService();
  private dbReadinessProbe: DbReadinessProbe;
  private runtimeEnv: RuntimeConfigEnv = process.env;

  constructor(
    @Optional() @Inject(PRODUCT_READ_REPOSITORY) repository?: ProductReadRepository,
    @Optional() @Inject(PrismaService) private readonly prismaService?: PrismaService
  ) {
    if (repository) {
      this.repository = repository;
    } else {
      this.repository = this.resolveRepository();
    }

    this.dbReadinessProbe = async () => {
      if (!this.prismaService) {
        throw new Error("Database client unavailable");
      }
      const expectedTables = Prisma.dmmf.datamodel.models.map(model => model.dbName ?? model.name);
      const missing = await this.prismaService.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM jsonb_array_elements_text(${JSON.stringify(expectedTables)}::jsonb) AS expected(table_name)
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_class
          WHERE oid = to_regclass(format('%I', table_name)) AND relkind IN ('r', 'p')
        )
      `;
      if (missing.length > 0) throw new Error("Database schema incomplete");
    };
  }

  setDbReadinessProbeForTest(probe: DbReadinessProbe): void {
    this.dbReadinessProbe = probe;
  }

  setRuntimeEnvForTest(env: RuntimeConfigEnv): void {
    this.runtimeEnv = env;
    this.repository = this.resolveRepository();
  }

  getRepository(): ProductReadRepository {
    return this.repository;
  }

  private resolveRepository(): ProductReadRepository {
    const config = this.runtimeConfig.load(this.runtimeEnv);
    if (config.runtimeMode === "postgres_read") {
      if (this.prismaService) {
        return new PostgresProductReadRepository(this.prismaService);
      }
      // Fallback to in‑memory repository for test environments where Prisma is absent
      return new MemoryProductReadRepository();
    }

    if (config.runtimeMode === "memory") {
      return new MemoryProductReadRepository();
    }

    return new MemoryProductReadRepository();
  }

  health(): HealthDto {
    return {
      status: "ok",
      service: "sekhem-product-api",
      version: "0.1.0",
      environment: this.environment(),
      uptimeSeconds: Math.floor(process.uptime())
    };
  }

  async dbReadiness(): Promise<DbReadinessDto> {
    const checkedAt = new Date().toISOString();

    try {
      const config = this.runtimeConfig.load(this.runtimeEnv);

      if (config.runtimeMode !== "postgres_read" || config.dataSource !== "postgres_read") {
        return {
          status: "degraded",
          db: "not_ready",
          runtimeMode: config.runtimeMode,
          dataSource: "fallback",
          component: "postgres",
          checkedAt
        };
      }

      await this.dbReadinessProbe();

      return {
        status: "ok",
        db: "ready",
        runtimeMode: "postgres_read",
        dataSource: "postgres_read",
        component: "postgres",
        checkedAt
      };
    } catch {
      return {
        status: "unavailable",
        db: "not_ready",
        runtimeMode: this.safeRuntimeMode(this.runtimeEnv.SEKHEM_RUNTIME_MODE),
        dataSource: this.safeDataSource(this.runtimeEnv.SEKHEM_DATA_SOURCE),
        component: "postgres",
        checkedAt
      };
    }
  }

  // Overloads for synchronous or asynchronous repository operations
  listProjects(projectIds?: string[]): Promise<ProjectSummaryDto[]> & ProjectSummaryDto[];
  listProjects(projectIds?: string[]): Promise<ProjectSummaryDto[]> | ProjectSummaryDto[] {
    return this.repository.listProjects(projectIds) as Promise<ProjectSummaryDto[]> & ProjectSummaryDto[];
  }

  getDashboard(id: string): Promise<ProjectDashboardDto> & ProjectDashboardDto;
  getDashboard(id: string): Promise<ProjectDashboardDto> | ProjectDashboardDto {
    return this.repository.getDashboard(id) as Promise<ProjectDashboardDto> & ProjectDashboardDto;
  }

  listModules(): Promise<ModuleSummaryDto[]> & ModuleSummaryDto[];
  listModules(): Promise<ModuleSummaryDto[]> | ModuleSummaryDto[] {
    return this.repository.listModules() as Promise<ModuleSummaryDto[]> & ModuleSummaryDto[];
  }

  getModule(slug: string): Promise<ModuleDetailDto> & ModuleDetailDto;
  getModule(slug: string): Promise<ModuleDetailDto> | ModuleDetailDto {
    return this.repository.getModule(slug) as Promise<ModuleDetailDto> & ModuleDetailDto;
  }

  listInitiatives(query: ListQuery): Promise<InitiativeSummaryDto[]> & InitiativeSummaryDto[];
  listInitiatives(query: ListQuery): Promise<InitiativeSummaryDto[]> | InitiativeSummaryDto[] {
    return this.repository.listInitiatives(query) as Promise<InitiativeSummaryDto[]> & InitiativeSummaryDto[];
  }

  getInitiative(slug: string): Promise<InitiativeDetailDto> & InitiativeDetailDto;
  getInitiative(slug: string): Promise<InitiativeDetailDto> | InitiativeDetailDto {
    return this.repository.getInitiative(slug) as Promise<InitiativeDetailDto> & InitiativeDetailDto;
  }

  getInitiativeTasks(slug: string): Promise<InitiativeTasksResponseDto> & InitiativeTasksResponseDto;
  getInitiativeTasks(slug: string): Promise<InitiativeTasksResponseDto> | InitiativeTasksResponseDto {
    return this.repository.getInitiativeTasks(slug) as Promise<InitiativeTasksResponseDto> & InitiativeTasksResponseDto;
  }

  getInitiativeActivity(slug: string): Promise<ActivityEventDto[]> & ActivityEventDto[];
  getInitiativeActivity(slug: string): Promise<ActivityEventDto[]> | ActivityEventDto[] {
    return this.repository.getInitiativeActivity(slug) as Promise<ActivityEventDto[]> & ActivityEventDto[];
  }

  getInitiativeBlockers(slug: string): Promise<InitiativeBlockersResponseDto> & InitiativeBlockersResponseDto;
  getInitiativeBlockers(slug: string): Promise<InitiativeBlockersResponseDto> | InitiativeBlockersResponseDto {
    return this.repository.getInitiativeBlockers(slug) as Promise<InitiativeBlockersResponseDto> & InitiativeBlockersResponseDto;
  }

  listApprovals(query: ListQuery): Promise<ApprovalSummaryDto[]> & ApprovalSummaryDto[];
  listApprovals(query: ListQuery): Promise<ApprovalSummaryDto[]> | ApprovalSummaryDto[] {
    return this.repository.listApprovals(query) as Promise<ApprovalSummaryDto[]> & ApprovalSummaryDto[];
  }

  getSecurityGate(id: string): Promise<SecurityGateDetailDto> & SecurityGateDetailDto;
  getSecurityGate(id: string): Promise<SecurityGateDetailDto> | SecurityGateDetailDto {
    return this.repository.getSecurityGate(id) as Promise<SecurityGateDetailDto> & SecurityGateDetailDto;
  }

  listReleaseCandidates(query: ListQuery): Promise<ReleaseCandidateSummaryDto[]> & ReleaseCandidateSummaryDto[];
  listReleaseCandidates(query: ListQuery): Promise<ReleaseCandidateSummaryDto[]> | ReleaseCandidateSummaryDto[] {
    return this.repository.listReleaseCandidates(query) as Promise<ReleaseCandidateSummaryDto[]> & ReleaseCandidateSummaryDto[];
  }

  getReleaseCandidate(id: string): Promise<ReleaseCandidateDetailDto> & ReleaseCandidateDetailDto;
  getReleaseCandidate(id: string): Promise<ReleaseCandidateDetailDto> | ReleaseCandidateDetailDto {
    return this.repository.getReleaseCandidate(id) as Promise<ReleaseCandidateDetailDto> & ReleaseCandidateDetailDto;
  }

  listBlockers(query: ListQuery): Promise<BlockerSummaryDto[]> & BlockerSummaryDto[];
  listBlockers(query: ListQuery): Promise<BlockerSummaryDto[]> | BlockerSummaryDto[] {
    return this.repository.listBlockers(query) as Promise<BlockerSummaryDto[]> & BlockerSummaryDto[];
  }

  listAuditEvents(query: ListQuery): Promise<AuditEventDto[]> & AuditEventDto[];
  listAuditEvents(query: ListQuery): Promise<AuditEventDto[]> | AuditEventDto[] {
    return this.repository.listAuditEvents(query) as Promise<AuditEventDto[]> & AuditEventDto[];
  }

  private environment(): HealthDto["environment"] {
    const value = process.env.NODE_ENV;
    if (value === "test" || value === "staging" || value === "production") {
      return value;
    }

    return "development";
  }

  private safeRuntimeMode(value: string | undefined): DbReadinessDto["runtimeMode"] {
    if (value === "postgres_read" || value === "memory") {
      return value;
    }

    return "unknown";
  }

  private safeDataSource(value: string | undefined): DbReadinessDto["dataSource"] {
    if (value === "postgres_read") {
      return "postgres_read";
    }

    if (value === "memory" || value === undefined) {
      return "fallback";
    }

    return "unknown";
  }
}
