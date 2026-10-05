"use client";

/**
 * 위젯 분류(WIDGET_CTG) LoV — 위젯 관리 입력칸·목록 칸이 공통코드 이름을 쓴다(2026-10-05 위젯 개선 §6).
 * LayoutTab(widget-tabs 소유) 을 거치지 않고 각 칸이 스스로 불러 온다.
 * 조회는 모듈 수준에서 한 번만 돌고(여러 칸이 같은 약속을 본다), 실패해도 화면이 멈추지 않게 빈 목록으로 남긴다(분류는 부가 정보).
 */
import { useEffect, useMemo, useState } from "react";

import { apiLovMaster } from "@dk-oasis/shared/http";

export interface WidgetCategoryOption {
  value: string;
  label: string;
}

/** REST ApiResponse 봉투({success, data, …}) — data 가 Lov[{value, displayValue}] 행. */
interface LovResponse {
  data?: { value: string; displayValue: string }[] | null;
}

let fetching: Promise<WidgetCategoryOption[]> | null = null;

function fetchWidgetCategories(): Promise<WidgetCategoryOption[]> {
  if (!fetching) {
    fetching = apiLovMaster<LovResponse>("mcm", "WIDGET_CTG")
      .then((res) =>
        (res?.data ?? [])
          .filter((d) => d && d.value)
          .map((d) => ({ value: d.value, label: d.displayValue || d.value }))
      )
      .catch(() => {
        // 실패한 결과는 캐시하지 않는다 — 다음 마운트에서 다시 조회한다(일시 오류에서 스스로 회복).
        fetching = null;
        return [] as WidgetCategoryOption[];
      });
  }
  return fetching;
}

/** 분류 옵션과 코드→이름 변환. 첫 그림에는 빈 값, 조회가 끝나면 채워진다. */
export function useWidgetCategories() {
  const [options, setOptions] = useState<WidgetCategoryOption[]>([]);
  useEffect(() => {
    let alive = true;
    fetchWidgetCategories().then((o) => {
      if (alive) setOptions(o);
    });
    return () => {
      alive = false;
    };
  }, []);
  const titles = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of options) m[o.value] = o.label;
    return m;
  }, [options]);
  return { options, titles };
}
