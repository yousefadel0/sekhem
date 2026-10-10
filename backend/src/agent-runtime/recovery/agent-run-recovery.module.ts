import { Module } from '@nestjs/common';
import { DataAccessModule } from '../../data-access/data-access.module';
import { AgentContextProjectionModule } from '../context-projection/agent-context-projection.module';
import { AgentRunRecoveryService } from './agent-run-recovery.service';

@Module({ imports: [DataAccessModule, AgentContextProjectionModule], providers: [AgentRunRecoveryService], exports: [AgentRunRecoveryService] })
export class AgentRunRecoveryModule {}
