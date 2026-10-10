import { Injectable, NotFoundException } from "@nestjs/common";
import type { KnowledgeItemDto } from "./knowledge.dto";
import { knowledgeItemFixtures } from "./knowledge.fixtures";

@Injectable()
export class KnowledgeService {
  listItems(): KnowledgeItemDto[] {
    return knowledgeItemFixtures.map((item) => ({ ...item }));
  }

  getItem(knowledgeItemId: string): KnowledgeItemDto {
    const item = knowledgeItemFixtures.find((fixture) => fixture.knowledgeItemId === knowledgeItemId);
    if (!item) {
      throw new NotFoundException("Knowledge item not found");
    }

    return { ...item };
  }
}
