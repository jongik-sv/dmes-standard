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
