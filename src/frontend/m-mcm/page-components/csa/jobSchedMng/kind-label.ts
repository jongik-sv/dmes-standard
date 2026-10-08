/** 실행 유형 이름 — 아이콘 없이 글자만 필요한 곳(순수 함수·시험)이 쓴다. 아이콘·설명은 job-kinds.tsx 가 같은 이름을 쓴다. */
import type { JobKind } from "./types";

export const KIND_LABEL: Record<JobKind, string> = {
  CODE: "코드 실행",
  BPMN: "서비스 실행",
  QUERY: "쿼리 실행",
  COLLECT: "수집",
};

export const kindLabel = (kind: string): string => KIND_LABEL[kind as JobKind] ?? kind;
