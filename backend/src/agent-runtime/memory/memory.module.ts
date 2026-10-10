import { Module } from "@nestjs/common";
import { MemoryService } from "./memory.service";
import { HistoricalMemoryService } from "./historical-memory.service";

/**
 * MemoryModule
 *
 * Owns and exports MemoryService.
 * PrismaService is available globally via DataAccessModule (@Global()),
 * so no explicit DataAccessModule import is needed here.
 *
 * Import this module in ConversationModule and AgentRuntimeModule.
 * Do NOT re-declare MemoryService in their providers — it is exported here.
 */
@Module({
  providers: [MemoryService, HistoricalMemoryService],
  exports: [MemoryService, HistoricalMemoryService]
})
export class MemoryModule {}
