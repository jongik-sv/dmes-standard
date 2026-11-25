/**
 * 도메인 삭제 확인 문구(B-009). 서버 규칙과 같다.
 *  - 하위 도메인은 지우는 도메인의 상위 아래로 옮긴다. 상위가 없으면 최상위가 된다. 지우는 도메인의 값(길이·단위·검증식)은 하위가 이어받는다.
 *  - 이 도메인을 직접 참조하는 컬럼·룰 변수는 상위 도메인으로 옮긴다. 상위가 없으면 도메인을 비운다.
 */
import type { DomainRow, ImpactTable } from "./types";

export interface DeleteConfirmInput {
  domain: Pick<DomainRow, "DOMAIN_ID" | "DOMAIN_NAME" | "STD_NAME" | "CHILD_COUNT">;
  /** 지우는 도메인의 상위. 없으면 null. */
  parent: Pick<DomainRow, "DOMAIN_NAME" | "STD_NAME"> | null;
  impact: ImpactTable | null;
  /** 저장하지 않은 수정 내용이 있다. */
  dirty: boolean;
}

/** 이 도메인을 직접 참조하는 컬럼 수. 영향도 표는 하위 도메인 참조까지 담으므로 DOMAIN_ID 로 거른다. */
export function directColumnCount(domainId: number, impact: ImpactTable | null): number {
  return (impact?.columns ?? []).filter((c) => c.DOMAIN_ID === domainId).length;
}

export function deleteConfirmMessage({ domain, parent, impact, dirty }: DeleteConfirmInput): string {
  const target = parent ? `상위 도메인 "${parent.DOMAIN_NAME}(${parent.STD_NAME})"` : null;
  const lines = [`도메인 "${domain.DOMAIN_NAME}(${domain.STD_NAME})"을 삭제합니다.`];
  const children = domain.CHILD_COUNT ?? 0;
  if (children > 0) {
    lines.push(target
      ? `- 하위 도메인 ${children}개를 ${target} 아래로 옮깁니다.`
      : `- 하위 도메인 ${children}개는 최상위 도메인이 됩니다.`);
    lines.push("  지우는 도메인의 길이·단위·검증식은 하위 도메인이 이어받습니다.");
  }
  const columns = directColumnCount(domain.DOMAIN_ID, impact);
  if (columns > 0) {
    lines.push(target
      ? `- 참조 컬럼 ${columns}개를 ${target}으로 옮깁니다.`
      : `- 참조 컬럼 ${columns}개의 도메인을 비웁니다.`);
  }
  lines.push(target
    ? "- 이 도메인을 쓰는 룰 변수도 상위 도메인으로 옮깁니다."
    : "- 이 도메인을 쓰는 룰 변수는 도메인을 비우고 데이터 타입만 남깁니다.");
  if (dirty) lines.push("- 저장하지 않은 수정 내용은 버립니다.");
  lines.push("되돌릴 수 없습니다. 삭제할까요?");
  return lines.join("\n");
}
