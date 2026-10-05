// 세트 탭(하위 세트 spec §10) 화면 시험 도우미 — 계획 Task 7 Step 4 의 `activateTab`·`inPanel` 과 탭 안 세트 고르기.
// 공용 도우미(`../helpers/rule-set-page.ts`)는 이 레인 소유 밖이라 고치지 않고 여기 둔다(ui:7 계획 조정 5). `.test.ts` 가 아니라 수집되지 않는다.
// 여러 탭이 같은 testid 를 가지므로 `click`·`byTestId`(문서 순서 첫 요소)는 첫 패널이 지금 탭일 때만 쓰고, 그 밖에는 `inPanel`·`activePanel` 을 쓴다.
import { act } from "react";

import { findButton, flush, typeInto } from "../helpers/render";
import { byTestId, ok, settle, srv } from "../helpers/rule-set-page";

/** 포털이 이 화면 탭을 다시 고른 것처럼 알린다 — 넘김 값(handoff)을 다시 읽는다(useMdmPageParams). */
export async function activateTab(tabId: string): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("portal-tab-activated", { detail: { tabId } }));
  });
  await flush();
  await settle();
}

/** 세트 탭 패널 안에서 testid 를 찾는다(여러 탭이 같은 testid 를 갖는다). */
export function inPanel<T extends Element = HTMLElement>(tabKey: string, id: string): T {
  const el = byTestId(`set-tab-panel-${tabKey}`).querySelector(`[data-testid="${id}"]`) as T | null;
  if (!el) throw new Error(`탭 ${tabKey} 안에 data-testid ${id} 없음`);
  return el;
}

/** 탭 패널 안에서 testid 를 찾는다(없으면 null). */
export function qPanel<T extends Element = HTMLElement>(tabKey: string, id: string): T | null {
  return byTestId(`set-tab-panel-${tabKey}`).querySelector(`[data-testid="${id}"]`) as T | null;
}

/** 탭 머리 key 목록(왼쪽부터). */
export function tabKeys(): string[] {
  return Array.from(byTestId("set-tabs").querySelectorAll('[role="tab"]')).map((t) => t.getAttribute("data-testid")!.slice("set-tab-".length));
}

/** 지금 고른 탭 key. */
export function activeKey(): string {
  const t = byTestId("set-tabs").querySelector('[role="tab"][aria-selected="true"]');
  if (!t) throw new Error("고른 탭 없음");
  return t.getAttribute("data-testid")!.slice("set-tab-".length);
}

/** 탭 패널 안 요소를 누른다. */
export async function clickIn(tabKey: string, id: string): Promise<void> {
  await act(async () => {
    inPanel(tabKey, id).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

/**
 * 지금 탭의 툴바 세트 고르기(`IdPicker`)로 세트를 고른다 — 찾기 응답(`search:SET`)을 그 세트 한 건으로 두고 찾기 → 후보 누르기.
 * 고르기는 탭 틀(`pickSet`)이 받는다: 그 세트가 다른 탭에 열려 있으면 그 탭으로, 아니면 이 탭에서 연다.
 */
export async function pickInActive(setId: string): Promise<void> {
  const key = activeKey();
  srv.replies["search:SET"] = ok({ sets: [{ setId, setName: `${setId} 세트`, status: "INUSE" }] });
  await typeInto(inPanel<HTMLInputElement>(key, "set-pick-keyword"), setId);
  await act(async () => {
    findButton(byTestId(`set-tab-panel-${key}`), "찾기").click();
  });
  await flush();
  await clickIn(key, `set-pick-${setId}`);
  await settle();
}
