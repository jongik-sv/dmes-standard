// TSK-08-02 — dme 렌더 테스트 공용 도우미(happy-dom).
import { act } from "react";

/**
 * Node 25+ 는 `--localstorage-file` 없이 전역 `localStorage` 를 undefined 로 두고(실험 기능), happy-dom 의 window 도 그 값을
 * 본다. shared `apiRequest` 가 맨 이름 `localStorage.getItem` 을 부르므로 테스트 동안 메모리 저장소를 넣는다.
 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

export function installDomStorage(): void {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    let current: Storage | undefined;
    try {
      current = (globalThis as unknown as Record<string, Storage | undefined>)[name];
    } catch {
      current = undefined;
    }
    if (!current) {
      Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true, writable: true });
    }
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Mantine 이 넣는 <style> 원문은 빼고 보이는 글자만 모은다. */
export function visibleText(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
    else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName;
      if (tag === "STYLE" || tag === "SCRIPT") continue;
      out += visibleText(node as Element);
    }
  }
  return out;
}

/** React 가 onChange 로 받도록 네이티브 setter 로 값을 넣고 input 이벤트를 보낸다. */
export async function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export async function selectValue(el: HTMLSelectElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/**
 * AgDataGrid 가 준비를 마칠 때까지 기다린다 — 행(또는 빈 표 안내)이 보인 뒤, flush 한 번 동안 그리드 DOM 이 바뀌지 않을 때까지.
 *
 * ag-grid 는 행을 그린 뒤 `onGridReady` 를 비동기 이벤트 큐(`setTimeout 0`)로 보내고, AgDataGrid 는 그때 켜지는 효과에서 보이는 행을 한 번
 * 다시 그린다(행 클래스 토큰·행 상태 따라잡기). `flush()` 한 번은 그 타이머보다 먼저 끝날 수 있어, 그 뒤에 잰 행 DOM 이 준비 시점 다시 그리기로
 * 바뀐다. 행이 보이면 그 타이머는 이미 걸려 있으므로, 다음 flush 의 타이머는 그 뒤에 돈다 — 조용한 차례가 나오면 준비가 끝난 것이다.
 * 상한을 넘으면 던진다(조용히 넘어가면 흔들림이 다시 숨는다).
 */
export async function settleGrid(root: Element, maxRounds = 20): Promise<void> {
  let started = false;
  for (let round = 0; round < maxRounds; round++) {
    let changed = false;
    const mo = new MutationObserver(() => {
      changed = true;
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    await flush();
    if (mo.takeRecords().length > 0) changed = true;
    mo.disconnect();
    if (started && !changed) return;
    started = root.querySelector(".ag-row, .ag-overlay-no-rows-wrapper") != null;
  }
  throw new Error(`그리드가 ${maxRounds}번 flush 안에 조용해지지 않았다`);
}

export function findButton(root: ParentNode, label: string): HTMLButtonElement {
  const b = Array.from(root.querySelectorAll("button")).find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`버튼 ${label} 없음`);
  return b as HTMLButtonElement;
}

export const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";

/**
 * ProseMirror(메모 서식 편집기, Tiptap)가 고르기·스크롤 위치를 잴 때 부르는 DOM API — happy-dom 에 없거나 빈 값이라 0 크기 사각형으로 채운다.
 * 이미 있는 것은 건드리지 않는다.
 */
export function polyfillLayout(): void {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
  const list = Object.assign([rect], { item: () => rect }) as unknown as DOMRectList;
  for (const proto of [Range.prototype, Element.prototype] as unknown as { getClientRects?: () => DOMRectList; getBoundingClientRect?: () => DOMRect }[]) {
    if (!proto.getClientRects) proto.getClientRects = () => list;
    if (!proto.getBoundingClientRect) proto.getBoundingClientRect = () => rect;
  }
  if (!document.elementFromPoint) (document as unknown as { elementFromPoint: () => null }).elementFromPoint = () => null;
}
