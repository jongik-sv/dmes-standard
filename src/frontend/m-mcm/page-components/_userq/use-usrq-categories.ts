"use client";

/**
 * 공용 쿼리 분류(USRQ_CTG) LoV — 관리 화면 조회조건·상세·목록 칸과 사용자 화면 목록 묶음이 함께 쓴다.
 * commWidgetMng/use-widget-categories.ts 와 같은 규칙이다: 조회는 모듈 수준에서 한 번(성공한 비지 않은 결과만 보관),
 * 실패·빈 결과·시간 초과는 보관하지 않아 다음 마운트에서 다시 조회하고, 실패해도 화면은 멈추지 않는다(분류는 부가 정보).
 */
import { useEffect, useMemo, useState } from "react";

import { apiLovMaster } from "@dk-oasis/shared/http";

export interface UsrqCategoryOption {
  value: string;
  label: string;
}

interface LovResponse {
  data?: { value: string; displayValue: string }[] | null;
}

export const USRQ_CATEGORY_GROUP = "USRQ_CTG";
export const USRQ_CATEGORY_TIMEOUT_MS = 8000;

let fetching: Promise<UsrqCategoryOption[]> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("usrq category lookup timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export function fetchUsrqCategories(): Promise<UsrqCategoryOption[]> {
  if (!fetching) {
    const current: Promise<UsrqCategoryOption[]> = withTimeout(
      apiLovMaster<LovResponse>("mcm", USRQ_CATEGORY_GROUP),
      USRQ_CATEGORY_TIMEOUT_MS
    )
      .then((res) => {
        const rows = (res?.data ?? [])
          .filter((d) => d && d.value)
          .map((d) => ({ value: d.value, label: d.displayValue || d.value }));
        if (rows.length === 0 && fetching === current) fetching = null;
        return rows;
      })
      .catch(() => {
        if (fetching === current) fetching = null;
        return [] as UsrqCategoryOption[];
      });
    fetching = current;
  }
  return fetching;
}

/** 분류 옵션과 코드→이름 변환. 첫 그림에는 빈 값, 조회가 끝나면 채워진다. */
export function useUsrqCategories() {
  const [options, setOptions] = useState<UsrqCategoryOption[]>([]);
  useEffect(() => {
    let alive = true;
    void fetchUsrqCategories().then((o) => {
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
