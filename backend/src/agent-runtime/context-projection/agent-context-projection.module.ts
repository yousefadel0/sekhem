import { Module } from '@nestjs/common';
import { DataAccessModule } from '../../data-access/data-access.module';
import { AgentContextProjectionService } from './agent-context-projection.service';

@Module({ imports: [DataAccessModule], providers: [AgentContextProjectionService], exports: [AgentContextProjectionService] })
export class AgentContextProjectionModule {}
