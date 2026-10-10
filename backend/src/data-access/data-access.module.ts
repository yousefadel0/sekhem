import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * DataAccessModule
 *
 * Core module providing centralized database access and persistence primitives.
 * Marked as @Global() so PrismaService is accessible across all modules without
 * redundant provider registrations.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService]
})
export class DataAccessModule {}
