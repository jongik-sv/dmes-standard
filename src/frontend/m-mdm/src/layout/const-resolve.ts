/**
 * 3층 기본값 해석(TSK-05-02 design.md F9 — 불변 I10). 정본은 Java `LayoutConstResolver`:
 * CONST 는 이 전문의 재정의 ?? 헤더 기본값, AUTO 는 송신 시 채움 표시(재정의 무시), DATA·FILLER 는 값 없음. 빈 재정의는 "재정의 없음".
 */
import type { FillKind } from "./types";

export function effectiveConst(kind: FillKind, headerDefault: string | null | undefined, override: string | null | undefined): string | null {
  switch (kind) {
    case "CONST":
      return override != null && override.trim() !== "" ? override : (headerDefault ?? null);
    case "AUTO":
      return `(송신 시 채움: ${headerDefault ?? ""})`;
    default:
      return null;
  }
}
