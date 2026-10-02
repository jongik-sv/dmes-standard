"use client";

import { useCallback, useEffect, useRef } from "react";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { patchConfig, previewOf, validateQueryConfig, type QueryResult, type QueryTypeId } from "./format";

export interface ConfigEditorApi {
  /** 정의 설정 일부를 바꾼다(다른 키·`__preview` 는 지킨다). 비동기([쿼리 시험]) 뒤에 불러도 최신 값 위에 얹는다. */
  patch: (p: Record<string, unknown>) => void;
  /** [쿼리 시험] 결과(`__preview`) — 없으면 null. */
  preview: QueryResult | null;
  /** 필드 고르기 선택지 — `__preview.columns`(없으면 빈 목록 → 직접 입력 칸). */
  columns: string[];
}

/**
 * 쿼리 유형 편집기 공용 — 값 고치기와 저장 막기용 검사 보고(WidgetTypeEditorProps.onValidate).
 * 검사 결과가 바뀔 때만 onValidate 를 부른다(부모가 렌더마다 새 함수를 넘겨도 되풀이하지 않는다).
 */
export function useConfigEditor(typeId: QueryTypeId, { value, onChange, onValidate }: WidgetTypeEditorProps): ConfigEditorApi {
  const latest = useRef<unknown>(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  const patch = useCallback(
    (p: Record<string, unknown>) => {
      const next = patchConfig(latest.current, p);
      latest.current = next;
      onChange(next);
    },
    [onChange]
  );

  const report = useRef(onValidate);
  useEffect(() => {
    report.current = onValidate;
  }, [onValidate]);
  const errorKey = validateQueryConfig(typeId, value).join("\n");
  useEffect(() => {
    report.current?.(errorKey === "" ? [] : errorKey.split("\n"));
  }, [errorKey]);

  const preview = previewOf(value);
  return { patch, preview, columns: preview?.columns ?? [] };
}
