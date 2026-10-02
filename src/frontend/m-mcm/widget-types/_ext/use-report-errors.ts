"use client";

import { useEffect, useRef } from "react";

/**
 * 편집기 검사 결과를 관리 화면에 알린다(WidgetTypeEditorProps.onValidate — 저장 막기용).
 * 오류 목록이 바뀔 때만 부른다. 부모가 렌더마다 새 함수를 넘겨도 되풀이하지 않는다. 처음 그릴 때도 한 번 부른다.
 */
export function useReportErrors(errors: readonly string[], onValidate?: (errors: string[]) => void): void {
  const report = useRef(onValidate);
  useEffect(() => {
    report.current = onValidate;
  }, [onValidate]);
  const key = errors.join("\n");
  useEffect(() => {
    report.current?.(key === "" ? [] : key.split("\n"));
  }, [key]);
}
