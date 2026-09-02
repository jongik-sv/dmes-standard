/**
 * 공통 유틸리티 함수
 * - 원본: dmes_react/frontend/src/lib/libUtil.js
 * - Null/Empty 체크, NVL, 텍스트 크기 측정, ID 생성
 */

// ============================================================
// Null/Empty 체크
// ============================================================

export function isNullOrEmpty(sValue: unknown): boolean {
  if (sValue == null) return true;

  const strVal = String(sValue).trim();
  if (strVal === "undefined" || strVal === "null" || strVal === "") {
    return true;
  }

  if (typeof sValue === "object" && !Array.isArray(sValue)) {
    return Object.keys(sValue as Record<string, unknown>).length === 0;
  }

  return false;
}

export function nvl<T>(inVal: T | null | undefined, emptyVal: T): T {
  if (isNullOrEmpty(inVal)) {
    return emptyVal;
  }
  return inVal as T;
}

// ============================================================
// 텍스트 크기 측정 (Canvas API)
// ============================================================

export interface TextSize {
  width: number;
  height: number;
}

export function measureTextSize(sText: string, font?: string): TextSize {
  const actualFont = font?.trim() || "12px '맑은 고딕'";

  if (typeof document === "undefined") {
    return { width: 0, height: parseInt(actualFont, 10) || 12 };
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = actualFont;
  const metrics = context.measureText(sText);

  return {
    width: metrics.width,
    height: parseInt(actualFont, 10) || 12,
  };
}

// ============================================================
// 고유 ID 생성
// ============================================================

let counter = 0;

export function generateId(prefix: string = "cm"): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

// ============================================================
// gfn_ 호환 별칭
// ============================================================
export const gfn_isNull = isNullOrEmpty;
export const gfn_isNvl = nvl;
export const gfn_getTextSize = measureTextSize;
