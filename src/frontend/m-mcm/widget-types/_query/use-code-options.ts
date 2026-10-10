"use client";

/**
 * 공통코드 그룹 LoV 훅 — 조건 칸(select·multi 의 codeGroup)과 코드 표시 열, 분류 칸이 함께 쓴다.
 * 규칙(그룹마다): 조회는 모듈 수준에서 한 번(성공한 비지 않은 결과만 보관), 8초 시간 상한,
 * 실패·빈 결과·시간 초과는 보관하지 않아 다음 마운트에서 다시 조회하고, 실패해도 화면은 멈추지 않는다(코드는 부가 정보).
 * 선택지는 `apiLovMaster("mcm", 그룹)`(권한키 없음, 인증한 사용자 누구나)로 얻는다.
 */
import { useEffect, useMemo, useState } from "react";

import { apiLovMaster } from "@dk-oasis/shared/http";

export interface CodeOption {
  value: string;
  label: string;
}

interface LovResponse {
  data?: { value: string; displayValue: string }[] | null;
}

export const CODE_LOOKUP_TIMEOUT_MS = 8000;

const NO_OPTIONS: CodeOption[] = [];
const fetching = new Map<string, Promise<CodeOption[]>>();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("code lookup timeout")), ms);
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

export function fetchCodeOptions(group: string): Promise<CodeOption[]> {
  let current = fetching.get(group);
  if (!current) {
    const mine: Promise<CodeOption[]> = withTimeout(apiLovMaster<LovResponse>("mcm", group), CODE_LOOKUP_TIMEOUT_MS)
      .then((res) => {
        const rows = (res?.data ?? []).filter((d) => d && d.value).map((d) => ({ value: d.value, label: d.displayValue || d.value }));
        if (rows.length === 0 && fetching.get(group) === mine) fetching.delete(group);
        return rows;
      })
      .catch(() => {
        if (fetching.get(group) === mine) fetching.delete(group);
        return [] as CodeOption[];
      });
    fetching.set(group, mine);
    current = mine;
  }
  return current;
}

/** 시험용 — 보관한 조회를 비운다. */
export function resetCodeOptionsCache(): void {
  fetching.clear();
}

/** 그룹의 코드 선택지. 첫 그림에는 빈 배열, 조회가 끝나면 채워진다. group 이 비면 조회하지 않는다. */
export function useCodeOptions(group: string | undefined): CodeOption[] {
  const [loaded, setLoaded] = useState<{ group: string; options: CodeOption[] } | null>(null);
  useEffect(() => {
    if (!group) return;
    let alive = true;
    void fetchCodeOptions(group).then((o) => {
      if (alive) setLoaded({ group, options: o });
    });
    return () => {
      alive = false;
    };
  }, [group]);
  return group && loaded?.group === group ? loaded.options : NO_OPTIONS;
}

/** 코드 값 → 이름 표. */
export function codeTitles(options: readonly CodeOption[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const o of options) m[o.value] = o.label;
  return m;
}

/** 여러 그룹의 코드 이름 표 — 그룹 → (값 → 이름). 표 열의 코드 표시용. 그룹 목록이 같은 값이면 다시 만들지 않는다. */
export function useCodeLabels(groups: readonly string[]): Record<string, Record<string, string>> {
  const key = [...new Set(groups)].sort().join(",");
  const [labels, setLabels] = useState<{ key: string; value: Record<string, Record<string, string>> }>({ key: "", value: {} });
  useEffect(() => {
    if (key === "") return;
    let alive = true;
    const list = key.split(",");
    void Promise.all(list.map((g) => fetchCodeOptions(g))).then((all) => {
      if (!alive) return;
      const value: Record<string, Record<string, string>> = {};
      list.forEach((g, i) => (value[g] = codeTitles(all[i])));
      setLabels({ key, value });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return useMemo(() => (key !== "" && labels.key === key ? labels.value : EMPTY_LABELS), [key, labels]);
}

const EMPTY_LABELS: Record<string, Record<string, string>> = {};
