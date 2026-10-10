import { BadRequestException, Injectable } from "@nestjs/common";
import { knowledgeItemFixtures } from "../knowledge.fixtures";
import type { IndexableSourceChunkDto, RagAnswerPreviewRequestDto, RagAnswerPreviewResponseDto, RagIndexPreviewResponseDto } from "./rag.dto";

@Injectable()
export class RagService {
  indexPreview(): RagIndexPreviewResponseDto {
    return {
      chunks: knowledgeItemFixtures.map((item) => this.toChunk(item)),
      safety: {
        noEmbedding: true,
        noVectorDb: true,
        noAiAnswer: true,
        readOnly: true
      }
    };
  }

  answerPreview(body: unknown): RagAnswerPreviewResponseDto {
    this.assertAnswerPreviewRequest(body);
    const sourceChunks = this.indexPreview().chunks;

    return {
      answerPreview:
        "The available reviewed sources support a controlled readiness assessment path. Repository readiness evidence remains read-only, and human review is required before any promotion or downstream action.",
      citations: sourceChunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        citationLabel: chunk.citationLabel,
        citationRef: chunk.citationRef
      })),
      sourceChunks,
      safetyFlags: {
        aiGenerated: false,
        noAiProvider: true,
        noEmbedding: true,
        noVectorDb: true,
        readOnly: true,
        previewOnly: true
      }
    };
  }

  private toChunk(item: (typeof knowledgeItemFixtures)[number]): IndexableSourceChunkDto {
    return {
      chunkId: `chunk-${item.knowledgeItemId}-001`,
      knowledgeItemId: item.knowledgeItemId,
      sourceType: item.sourceType,
      sourceLabel: item.sourceLabel,
      title: item.title,
      chunkTextPreview: item.customerSafeSummary,
      citationLabel: item.sourceLabel,
      citationRef: `knowledge-item:${item.knowledgeItemId}`,
      permissionsScope: item.permissionsScope,
      indexedAt: null,
      indexingStatus: "preview_only"
    };
  }

  private assertAnswerPreviewRequest(value: unknown): asserts value is RagAnswerPreviewRequestDto {
    if (!this.isRecord(value)) {
      throw new BadRequestException("Request body must be an object");
    }

    this.assertNoForbiddenFields(value);
    if (typeof value.question !== "string" || value.question.trim().length === 0) {
      throw new BadRequestException("question is required");
    }
  }

  private assertNoForbiddenFields(value: unknown): void {
    const forbiddenFields = new Set(["rawhtml", "rawcontent", "fullheaders", "secrets", "token", "authorization", "password", "privatekey"]);
    const inspect = (candidate: unknown): void => {
      if (Array.isArray(candidate)) {
        candidate.forEach(inspect);
        return;
      }

      if (!this.isRecord(candidate)) {
        return;
      }

      for (const [key, nestedValue] of Object.entries(candidate)) {
        if (forbiddenFields.has(key.toLowerCase().replace(/[-_.]/g, ""))) {
          throw new BadRequestException(`${key} is not allowed`);
        }

        inspect(nestedValue);
      }
    };

    inspect(value);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}
