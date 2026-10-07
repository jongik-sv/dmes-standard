/**
 * 링크 모음 위젯의 항목 모델·검사·편집 순수 함수(스펙 2026-10-02-widget-admin-generic §6).
 * 항목 { label, kind: "page"|"url", pageId?, url? } — page 는 포털 화면(openPortalPage), url 은 새 탭.
 * 링크 모음은 새 탭으로 열므로 포털과 같은 출처 주소도 된다(웹 주소 위젯과 다르다).
 * `@dk-oasis/shared` 를 런타임 import 하지 않는다(시험 환경 — 팀 운영 규칙 7). 메뉴 트리 노드는 모양만 받는다.
 */
import { isHttpUrl } from "./web";

export type LinkKind = "page" | "url";

export interface LinkItem {
  label: string;
  kind: LinkKind;
  /** kind="page" — 포털 pageId(예: "mcm:lsh/noticeMgmt"). */
  pageId?: string;
  /** kind="url" — http(s) 절대 주소. */
  url?: string;
}

export type LinkTarget = { kind: "page"; pageId: string } | { kind: "url"; url: string };

export const LINKS_EMPTY_MESSAGE = "링크를 하나 이상 추가하세요";

/** 편집기 검사 — 빈 배열이면 저장 가능. 메시지는 「n번째 링크의 …」. */
export function validateLinkItems(items: readonly LinkItem[]): string[] {
  if (items.length === 0) return [LINKS_EMPTY_MESSAGE];
  const errors: string[] = [];
  items.forEach((item, i) => {
    const n = i + 1;
    if (!item.label.trim()) errors.push(`${n}번째 링크의 이름을 입력하세요`);
    if (item.kind === "page") {
      if (!(item.pageId ?? "").trim()) errors.push(`${n}번째 링크의 화면을 고르세요`);
    } else if (!isHttpUrl(item.url ?? "")) {
      errors.push(`${n}번째 링크의 주소는 http:// 또는 https:// 로 시작해야 합니다`);
    }
  });
  return errors;
}

/** index 항목을 delta(-1 위, +1 아래)만큼 옮긴다. 끝·범위 밖이면 순서 그대로(새 배열). */
export function moveLinkItem(items: readonly LinkItem[], index: number, delta: -1 | 1): LinkItem[] {
  const next = [...items];
  const to = index + delta;
  if (index < 0 || index >= next.length || to < 0 || to >= next.length) return next;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function removeLinkItem(items: readonly LinkItem[], index: number): LinkItem[] {
  return items.filter((_, i) => i !== index);
}

/** 끝에 빈 화면 링크를 더한다. */
export function addLinkItem(items: readonly LinkItem[]): LinkItem[] {
  return [...items, { label: "", kind: "page", pageId: "" }];
}

export function updateLinkItem(items: readonly LinkItem[], index: number, patch: Partial<LinkItem>): LinkItem[] {
  return items.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

/** 종류를 바꾼다 — 이름은 남기고 다른 종류의 값(pageId·url)은 버린다. 같은 종류면 그대로. */
export function changeLinkKind(item: LinkItem, kind: LinkKind): LinkItem {
  if (item.kind === kind) return item;
  return kind === "page" ? { label: item.label, kind, pageId: "" } : { label: item.label, kind, url: "" };
}

/** 렌더러가 누를 때 할 일. 열 수 없는 항목(빈 화면·http(s) 아닌 주소)은 null. */
export function linkTarget(item: LinkItem): LinkTarget | null {
  if (item.kind === "page") {
    const pageId = (item.pageId ?? "").trim();
    return pageId ? { kind: "page", pageId } : null;
  }
  const url = (item.url ?? "").trim();
  return isHttpUrl(url) ? { kind: "url", url } : null;
}

/** 메뉴 트리 노드의 최소 모양(PortalShellMenuItem 과 맞다). */
export interface MenuNodeLike {
  name: string;
  items?: MenuNodeLike[];
}

export interface MenuPageOption {
  value: string;
  label: string;
}

/**
 * 메뉴 트리 → 화면 고르기 목록. pageIdOf 가 null 이 아닌 노드만 화면이다. 라벨은 「상위 > 이름」,
 * 같은 pageId 가 여러 메뉴에 있으면 처음 것만 남긴다.
 */
export function flattenMenuPages<N extends MenuNodeLike>(
  nodes: readonly N[],
  pageIdOf: (node: N) => string | null
): MenuPageOption[] {
  const out: MenuPageOption[] = [];
  const seen = new Set<string>();
  const walk = (list: readonly N[], trail: string[]) => {
    for (const node of list) {
      const path = [...trail, node.name];
      const id = pageIdOf(node);
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push({ value: id, label: path.join(" > ") });
      }
      if (node.items?.length) walk(node.items as N[], path);
    }
  };
  walk(nodes, []);
  return out;
}
