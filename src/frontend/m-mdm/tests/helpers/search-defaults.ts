// 조회 칸 사용자 기본값 시험 보조 — 포털 탭 pageId·현재 사용자·거울 규칙을 흉내 낸다(설계 2026-10-07-search-defaults §6).
import { createElement, type ReactNode } from "react";
import { setSearchDefaultsLocalForDev, type PageRules } from "@dk-oasis/shared/layout";
import { TabPageContext } from "@dk-oasis/shared/portal-shell";

export const SEARCH_DEFAULTS_USER = "u1";

/** 현재 사용자를 심는다(shared 의 사용자 저장소 키). */
export function setSearchDefaultsUser(userId: string): void {
  (globalThis as Record<string, unknown>).__dkOasisCurrentUserStore__ = {
    user: { id: userId, name: null },
    inflight: null,
    generation: 0,
    listeners: new Set(),
  };
}

/** 현재 사용자(u1)를 심고, 그 사용자의 한 화면 규칙을 거울에 넣는다 — 저장소가 바로 ready 라 마운트 때 넣는다. */
export function givenSearchDefaults(pageId: string, rules: PageRules): void {
  setSearchDefaultsUser(SEARCH_DEFAULTS_USER);
  setSearchDefaultsLocalForDev(SEARCH_DEFAULTS_USER, pageId, rules);
}

export function clearSearchDefaultsUser(): void {
  delete (globalThis as Record<string, unknown>).__dkOasisCurrentUserStore__;
}

/**
 * 거울이 없는 첫 사용 PC 흉내: 서버 응답(secSrchDflt/search)이 delayMs 뒤에 온다 — 기본값이 마운트보다 늦게 들어가는 경로.
 * 이 사용자는 거울이 없어야 하므로 시험마다 다른 userId 를 쓴다. 나머지 요청은 base fetch 로 넘긴다.
 */
export function withLateServerRules(
  userId: string,
  pageId: string,
  rules: PageRules,
  base: typeof fetch,
  delayMs = 400,
): typeof fetch {
  setSearchDefaultsUser(userId);
  const rows = Object.entries(rules).map(([fieldKey, rule]) => ({ pageId, fieldKey, ruleJson: JSON.stringify(rule) }));
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/oasis/secSrchDflt/search")) {
      await new Promise((r) => setTimeout(r, delayMs));
      return new Response(JSON.stringify({ meta: { success: true }, data: { result: { rows } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return base(input, init);
  }) as typeof fetch;
}

/** 화면을 포털 탭 안처럼 pageId 가 있는 상태로 감싼다(pageId 가 없으면 기본값을 넣지 않는다). */
export function inTabPage(pageId: string, node: ReactNode): ReactNode {
  return createElement(TabPageContext.Provider, { value: { pageId, serviceId: "" } }, node);
}
