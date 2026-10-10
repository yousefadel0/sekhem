import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * PrismaService
 *
 * Centralized, singleton-scoped database client for the SEKHEM backend.
 * Manages database connection pool lifecycle via NestJS module hooks.
 * All feature services must receive this service via dependency injection.
 * No feature service may directly call `new PrismaClient()`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log("PrismaService connected to database engine");
    } catch {
      // In development/test environments without active PostgreSQL, connection is deferred
      if (process.env.NODE_ENV === "production") {
        this.logger.error("Production database connection unavailable; startup rejected");
        throw new Error("PRODUCTION_DATABASE_UNAVAILABLE");
      }
      this.logger.warn("Prisma connection deferred or engine unavailable");
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
      this.logger.log("PrismaService disconnected from database engine");
    } catch {
      this.logger.warn("Prisma disconnect failed");
    }
  }
}
