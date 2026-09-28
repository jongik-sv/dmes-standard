/**
 * 화면 간 파라미터 넘김(TSK-06-02 design.md §6.10, D12) — 06-03·06-05 가 같은 규약으로 받는다.
 *
 * 포털에는 파라미터를 들고 탭을 여는 API 가 없다. 여는 쪽은 전역 저장소에 값을 두고 `portal-open-tab` 을 내며,
 * 받는 쪽은 마운트 때와 자기 탭이 다시 활성화될 때(`portal-tab-activated`, 이미 열린 탭은 다시 마운트되지 않는다)
 * 값을 한 번만 꺼낸다. pageId = `mdm:` + componentPath(예: `mdm:dmc/codeMng`).
 * 받은 값은 받는 화면이 자기 snapshot 에 넣어 새로고침 뒤에도 유지한다(초기값 우선순위: handoff > snapshot).
 */
import { useEffect, useRef } from "react";

export type MdmPageParams = Record<string, string>;

const KEY = "__mdmPageHandoff__";

function store(): Record<string, MdmPageParams> {
  const g = globalThis as Record<string, unknown>;
  if (!g[KEY]) g[KEY] = {};
  return g[KEY] as Record<string, MdmPageParams>;
}

function pageIdOf(componentPath: string): string {
  return `mdm:${componentPath}`;
}

/** 대상 화면 탭을 연다. params 가 있으면 대상 화면이 한 번 꺼내 갈 수 있게 둔다. */
export function openMdmPage(componentPath: string, params?: MdmPageParams): void {
  const pageId = pageIdOf(componentPath);
  if (params) store()[pageId] = { ...params };
  window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId } }));
}

/** 넘겨받은 값을 꺼내고 지운다(한 번만). 없으면 null. */
export function takeMdmPageParams(componentPath: string): MdmPageParams | null {
  const s = store();
  const pageId = pageIdOf(componentPath);
  const params = s[pageId];
  if (!params) return null;
  delete s[pageId];
  return params;
}

/** 마운트 때, 그리고 자기 탭(tabId)이 활성화될 때 넘겨받은 값을 소비한다. */
export function useMdmPageParams(
  componentPath: string,
  tabId: string | undefined,
  onParams: (params: MdmPageParams) => void,
): void {
  const callback = useRef(onParams);
  callback.current = onParams;

  useEffect(() => {
    const take = () => {
      const params = takeMdmPageParams(componentPath);
      if (params) callback.current(params);
    };
    take();
    const onActivated = (e: Event) => {
      const detail = (e as CustomEvent<{ tabId?: string }>).detail;
      if (tabId && detail?.tabId === tabId) take();
    };
    window.addEventListener("portal-tab-activated", onActivated);
    return () => window.removeEventListener("portal-tab-activated", onActivated);
  }, [componentPath, tabId]);
}
