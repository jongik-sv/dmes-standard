/**
 * 부모 연결·교체·제거(D-132) 순수 함수. 대화상자는 편집 폼이 아니라 **저장된 행**(view 응답)으로 초안을 만들고 부모만 바꿔
 * `validate`(경고 미리보기) → `save`(확인 후 쓰기)로 보낸다. 연결 제거 때 상속값 복사(구체화)는 서버가 한다.
 */
import { parentCandidates } from "./domain-tree";
import type { DomainDetail, DomainDraft, DomainRow, TestCaseRow } from "./types";

export type ParentLinkMode = "link" | "unlink";

export interface StoredForm {
  draft: DomainDraft;
  cases: TestCaseRow[];
  examples: string[];
}

/** view 응답 → 화면 초안·케이스·예시(행 선택과 대화상자가 같은 변환을 쓴다). */
export function storedForm(d: DomainDetail): StoredForm {
  return {
    draft: {
      domainId: d.DOMAIN_ID, ver: d.VER, domainName: d.DOMAIN_NAME, stdName: d.STD_NAME,
      parentDomainId: d.PARENT_DOMAIN_ID, domainKind: d.DOMAIN_KIND, dataType: d.DATA_TYPE, length: d.LENGTH,
      scale: d.SCALE, unitCode: d.UNIT_CODE, maruCodeId: d.MARU_CODE_ID, cateId: d.CATE_ID,
      stdRule: d.STD_RULE ?? "", bizRule: d.BIZ_RULE ?? "", description: d.DESCRIPTION ?? "",
    },
    cases: (d.TEST_CASES ?? []).map((c) => ({
      VALUE: c.VALUE ?? "", EXPECT: c.EXPECT !== false, VARS: c.VARS ?? "", MEMO: c.MEMO ?? "",
    })),
    examples: d.EXAMPLES ?? [],
  };
}

/** 저장된 행 그대로에 부모만 바꾼 초안. null 이면 연결 제거. */
export function relinkDraft(d: DomainDetail, parentDomainId: number | null): StoredForm {
  const f = storedForm(d);
  return { ...f, draft: { ...f.draft, parentDomainId } };
}

/** 연결 후보 — 기존 부모 후보(자기·자기 하위 제외)에서 지금 부모도 뺀다(같은 부모로 다시 연결은 변경이 아니다). */
export function linkCandidates(rows: DomainRow[], selfId: number, currentParentId: number | null): DomainRow[] {
  return parentCandidates(rows, selfId).filter((r) => r.DOMAIN_ID !== currentParentId);
}

/** 대화상자 제목·실행 단추 문구. 부모가 있는 도메인의 [부모 연결] 은 교체다. */
export function parentLinkLabels(mode: ParentLinkMode, hasParent: boolean): { title: string; action: string } {
  if (mode === "unlink") return { title: "부모 연결 제거", action: "연결 제거" };
  return hasParent ? { title: "부모 교체", action: "교체" } : { title: "부모 연결", action: "연결" };
}
