import type { KnowledgeItemSourceType } from "../knowledge.dto";

export type RagIndexingStatus = "preview_only";

export interface IndexableSourceChunkDto {
  chunkId: string;
  knowledgeItemId: string;
  sourceType: KnowledgeItemSourceType;
  sourceLabel: string;
  title: string;
  chunkTextPreview: string;
  citationLabel: string;
  citationRef: string;
  permissionsScope: string;
  indexedAt: string | null;
  indexingStatus: RagIndexingStatus;
}

export interface RagIndexPreviewResponseDto {
  chunks: IndexableSourceChunkDto[];
  safety: {
    noEmbedding: true;
    noVectorDb: true;
    noAiAnswer: true;
    readOnly: true;
  };
}

export interface RagAnswerPreviewRequestDto {
  question: string;
}

export interface RagAnswerPreviewCitationDto {
  chunkId: string;
  citationLabel: string;
  citationRef: string;
}

export interface RagAnswerPreviewResponseDto {
  answerPreview: string;
  citations: RagAnswerPreviewCitationDto[];
  sourceChunks: IndexableSourceChunkDto[];
  safetyFlags: {
    aiGenerated: false;
    noAiProvider: true;
    noEmbedding: true;
    noVectorDb: true;
    readOnly: true;
    previewOnly: true;
  };
}
