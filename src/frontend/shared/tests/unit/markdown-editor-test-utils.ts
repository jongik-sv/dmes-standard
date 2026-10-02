// 마크다운 편집기(markdown-editor) 렌더 시험 도우미(happy-dom).
import { act } from "react";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * Node 25+ 는 `--localstorage-file` 없이 전역 `localStorage` 를 undefined 로 두고(실험 기능), happy-dom 의 window 도 그 값을 본다.
 * 편집 방식 기억(edit-mode)이 localStorage 를 쓰므로 시험 동안 메모리 저장소를 넣는다.
 */
export class MemoryStorage implements Storage {
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
      Object.defineProperty(globalThis, name, {
        value: new MemoryStorage(),
        configurable: true,
        writable: true,
      });
    }
  }
}

/**
 * ProseMirror(Tiptap)가 고르기·스크롤 위치를 잴 때 부르는 DOM API — happy-dom 에 없거나 빈 값이라 0 크기 사각형으로 채운다.
 * 이미 있는 것은 건드리지 않는다.
 */
export function polyfillLayout(): void {
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  } as DOMRect;
  const list = Object.assign([rect], { item: () => rect }) as unknown as DOMRectList;
  for (const proto of [Range.prototype, Element.prototype] as unknown as {
    getClientRects?: () => DOMRectList;
    getBoundingClientRect?: () => DOMRect;
  }[]) {
    if (!proto.getClientRects) proto.getClientRects = () => list;
    if (!proto.getBoundingClientRect) proto.getBoundingClientRect = () => rect;
  }
  if (!document.elementFromPoint)
    (document as unknown as { elementFromPoint: () => null }).elementFromPoint = () => null;
}

/** React 가 onChange 로 받도록 네이티브 setter 로 값을 넣고 input 이벤트를 보낸다. */
export async function typeInto(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
): Promise<void> {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
