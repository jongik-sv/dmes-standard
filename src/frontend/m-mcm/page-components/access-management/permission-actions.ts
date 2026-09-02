/**
 * 권한 버튼 표준 액션 코드 + 한글 라벨 매핑.
 * 권한관리·OBJ 관리 화면이 공유한다.
 *
 * 사용자는 표준 액션 외 커스텀 액션 코드를 자유 입력할 수 있다 (datalist).
 * 표준 코드면 라벨이 자동 표기되고, 커스텀이면 코드 자체를 라벨로 표시.
 */

export interface ActionDefinition {
  code: string;
  label: string;
}

export const STANDARD_ACTIONS: readonly ActionDefinition[] = [
  { code: "search", label: "조회" },
  { code: "save", label: "저장" },
  { code: "delete", label: "삭제" },
  { code: "export", label: "엑셀 다운로드" },
  { code: "import", label: "엑셀 업로드" },
  { code: "print", label: "인쇄" },
  { code: "approve", label: "승인" },
  { code: "reject", label: "반려" },
  { code: "confirm", label: "확정" },
  { code: "cancel", label: "취소" },
  { code: "copy", label: "복사" },
  // mpn 화면 RBAC 적용(2026-06)으로 추가된 커스텀 액션 — 권한관리 화면에서 라벨 표기/datalist 제안용
  { code: "execute", label: "실행" },
  { code: "validate", label: "검증" },
  { code: "analyze", label: "분석" },
  { code: "view", label: "보기" },
  { code: "activate", label: "활성화" },
  { code: "deactivate", label: "비활성화" },
  { code: "compare", label: "비교" },
  { code: "restore", label: "복원" },
  { code: "apply", label: "적용" },
  { code: "release", label: "해제" },
  { code: "calculate", label: "계산" },
] as const;

const ACTION_LABEL_MAP: ReadonlyMap<string, string> = new Map(
  STANDARD_ACTIONS.map((a) => [a.code, a.label])
);

export function actionLabelOf(code: string): string {
  if (!code) return "";
  return ACTION_LABEL_MAP.get(code) ?? code;
}

export const ACTION_DATALIST_ID = "perm-action-codes";
export const ENDPOINT_DATALIST_ID = "perm-endpoint-pool";

/**
 * 모듈 옵션 — 권한 ID 조립의 두번째 segment.
 * 현행 사이트 기준. 다른 사이트는 본 상수만 교체하면 됨.
 */
export const MODULE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "mcm", label: "공통관리" },
  { code: "mqc", label: "품질관리" },
  { code: "mpp", label: "생산계획" },
  { code: "mpn", label: "공정관리" },
  { code: "aps", label: "스케줄링" },
  { code: "portal", label: "포털" },
] as const;

/**
 * 권한 레벨 옵션 — 권한 ID 조립의 마지막 segment.
 */
export const PERMISSION_LEVEL_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "admin", label: "관리자" },
  { code: "user", label: "일반사용자" },
] as const;

/**
 * 권한ID 자동 조립 — perm_{module}_{service}_{screen}_{level}.
 * 빈 segment 는 제외. service 가 비어있으면 legacy 4-segment 형식 (perm_{module}_{screen}_{level}).
 */
export function buildPermId(
  moduleCode: string,
  serviceId: string,
  screenId: string,
  level: string
): string {
  const parts = ["perm", moduleCode, serviceId, screenId, level]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  return parts.join("_");
}

/**
 * 기존 permId 를 segment 들로 분해.
 *
 * <p>지원 포맷:
 * <ul>
 *   <li>5-segment 신규: {@code perm_{module}_{service}_{screen}_{level}} → service 추출</li>
 *   <li>4-segment 레거시: {@code perm_{module}_{screen}_{level}} → service = ""</li>
 * </ul>
 * 형식이 안 맞으면 빈 값들을 반환.
 */
export function parsePermId(permId: string): {
  moduleCode: string;
  serviceId: string;
  screenId: string;
  level: string;
} {
  const parts = (permId ?? "").split("_");
  if (parts[0] !== "perm") {
    return { moduleCode: "", serviceId: "", screenId: "", level: "" };
  }
  // 5-segment 신규
  if (parts.length === 5) {
    return {
      moduleCode: parts[1],
      serviceId: parts[2],
      screenId: parts[3],
      level: parts[4],
    };
  }
  // 4-segment 레거시 (service 없음)
  if (parts.length === 4) {
    return {
      moduleCode: parts[1],
      serviceId: "",
      screenId: parts[2],
      level: parts[3],
    };
  }
  return { moduleCode: "", serviceId: "", screenId: "", level: "" };
}
