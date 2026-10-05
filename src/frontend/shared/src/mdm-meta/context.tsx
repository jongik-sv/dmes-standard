"use client";

/**
 * MDM 화면 메타 공급자와 훅(spec B4·B5·B6·B7).
 *
 * 포털 탭마다 `MdmMetaProvider` 가 자동으로 씌워진다(portal-shell). 공급자 밖(포털 밖 단독 실행·시험)에서는 훅이 아무것도 부르지 않고
 * `{ column: null, domain: null, loading: false }` 를 돌려준다 — 그리드·폼이 예전과 똑같이 그려진다.
 *
 * React 컨텍스트는 `globalThis.__dkOasisMdmMetaContext__` 로 하나만 만든다(TabPageContext 와 같은 방식 — tsup 분리 빌드에서 공급자와
 * 소비자가 다른 컨텍스트를 보지 않게).
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type Context, type ReactNode } from "react";
import { useTabPage } from "../portal-shell/tab-page-context";
import { toPhysName } from "./names";
import { peekColumn, peekDomain, requestColumns, requestDomains } from "./store";
import type { MdmCaptionPriority, MdmDomainMeta, MdmScreenColumn } from "./types";

/** 공급자가 정한 범위. 공급자 밖이면 훅이 null 을 본다. */
export interface MdmMetaScope {
  /** 메타를 받을 업무 모듈. 정할 수 없으면 null(부르지 않는다). */
  module: string | null;
  captionPriority: MdmCaptionPriority;
  disabled: boolean;
}

const GLOBAL_KEY = "__dkOasisMdmMetaContext__";
const cache = globalThis as unknown as Record<string, Context<MdmMetaScope | null> | undefined>;
const MdmMetaContext: Context<MdmMetaScope | null> =
  cache[GLOBAL_KEY] ?? (cache[GLOBAL_KEY] = createContext<MdmMetaScope | null>(null));

export interface MdmMetaProviderProps {
  /** 메타를 받을 모듈. 비우면 바깥 공급자 값, 그것도 없으면 포털 탭 pageId(`모듈:화면`)의 `:` 앞부분. */
  module?: string;
  /** 캡션 우선순위(spec B1). 비우면 바깥 공급자 값, 없으면 "explicit". */
  captionPriority?: MdmCaptionPriority;
  /** true 면 이 아래에서 메타를 받지 않는다. 비우면 바깥 공급자 값. */
  disabled?: boolean;
  children: ReactNode;
}

function moduleOfPageId(pageId: string): string | null {
  const i = pageId.indexOf(":");
  if (i <= 0) return null;
  const m = pageId.slice(0, i).trim();
  return m || null;
}

/**
 * 포털 탭 모듈 중 메타를 pageId 모듈 그대로 받지 않는 모듈 → 메타 모듈. `null` 이면 그 탭은 메타를 부르지 않는다(요청 0). 표에 없는 모듈은 pageId 모듈 그대로다.
 * - `mdm` → `mcm`: MDM 서버 자신은 `cactus.mdm.enabled` 를 켜지 않아(spec 2026-10-02 §5.1) `/api/mdm/mdmMeta` 가 404 이고, `/api/mcm/mdmMeta` 가 같은
 *   컬럼 사전을 준다(2026-10-05 실측).
 * - `analog` → 끔: analog BE 는 cactus-core 를 쓰지 않아 엔드포인트가 없다. 예전에는 첫 404 뒤 세션 동안 끄는 방식(spec 2026-10-03 B5)에 맡겨 세션마다
 *   첫 탭에서 404 가 한 번 남았다(2026-10-05 F7). store 의 404 끄기는 표에 없는 모듈을 위한 방어로 그대로 둔다.
 * 모듈이 엔드포인트를 새로 얻으면 여기서 뺀다.
 */
const MDM_META_TAB_MODULES: ReadonlyMap<string, string | null> = new Map([
  ["mdm", "mcm"],
  ["analog", null],
]);

/** 포털 탭이 그 탭의 `MdmMetaProvider` 에 넘길 값(pageId `모듈:화면` 기준). 표에 없는 모듈이면 빈 객체 — 공급자가 pageId 모듈을 그대로 쓴다. */
export function mdmMetaTabProps(pageId: string): { module?: string; disabled?: true } {
  const m = moduleOfPageId(pageId);
  if (m == null || !MDM_META_TAB_MODULES.has(m)) return {};
  const target = MDM_META_TAB_MODULES.get(m);
  return target == null ? { disabled: true } : { module: target };
}

export function MdmMetaProvider({ module, captionPriority, disabled, children }: MdmMetaProviderProps) {
  const parent = useContext(MdmMetaContext);
  const { pageId } = useTabPage();
  const resolvedModule = module?.trim() || parent?.module || moduleOfPageId(pageId);
  const resolvedPriority = captionPriority ?? parent?.captionPriority ?? "explicit";
  const resolvedDisabled = disabled ?? parent?.disabled ?? false;
  const value = useMemo<MdmMetaScope>(
    () => ({ module: resolvedModule, captionPriority: resolvedPriority, disabled: resolvedDisabled }),
    [resolvedModule, resolvedPriority, resolvedDisabled]
  );
  return <MdmMetaContext.Provider value={value}>{children}</MdmMetaContext.Provider>;
}

/** 지금 공급자 범위. 공급자 밖이면 null. */
export function useMdmMetaScope(): MdmMetaScope | null {
  return useContext(MdmMetaContext);
}

/** 캡션 우선순위. 공급자 밖이면 "explicit". */
export function useMdmCaptionPriority(): MdmCaptionPriority {
  return useContext(MdmMetaContext)?.captionPriority ?? "explicit";
}

export interface MdmColumnInfo {
  column: MdmScreenColumn | null;
  domain: MdmDomainMeta | null;
  loading: boolean;
}

const NONE: MdmColumnInfo = Object.freeze({ column: null, domain: null, loading: false }) as MdmColumnInfo;

/** 화면 키(또는 명시 meta)를 물리명으로. meta=false 면 null(끈다), meta 문자열이 이름을 이긴다(spec B6). */
export function resolveMdmPhysName(name: string | null | undefined, meta?: string | false): string | null {
  if (meta === false) return null;
  if (typeof meta === "string" && meta.trim()) return toPhysName(meta);
  return toPhysName(name);
}

function sameInfo(a: MdmColumnInfo | undefined, b: MdmColumnInfo): boolean {
  return !!a && a.column === b.column && a.domain === b.domain && a.loading === b.loading;
}

/**
 * 여러 칸의 메타. 키 = entries 의 name. 모든 이름을 한 번에 요청한다(store 가 같은 틱의 다른 칸 요청과도 묶는다).
 * 결과 Map 은 내용이 바뀔 때만 새로 만든다 — 그리드 열 정의가 렌더마다 다시 만들어지지 않게.
 */
export function useMdmColumns(entries: Array<{ name: string; meta?: string | false }>): Map<string, MdmColumnInfo> {
  const scope = useContext(MdmMetaContext);
  const active = scope && scope.module && !scope.disabled ? scope.module : null;
  const resolved = entries.map((e) => ({ name: e.name, phys: active ? resolveMdmPhysName(e.name, e.meta) : null }));
  const sig = `${active ?? ""}|${resolved.map((r) => `${r.name}=${r.phys ?? ""}`).join(",")}`;
  const [doneSig, setDoneSig] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!active) return;
    const physNames = [...new Set(resolved.map((r) => r.phys).filter((p): p is string => !!p))];
    if (physNames.length === 0) return;
    let alive = true;
    void (async () => {
      const cols = await requestColumns(active, physNames);
      const domainIds = [
        ...new Set([...cols.values()].map((c) => c?.domain?.domainId).filter((d): d is string => !!d)),
      ];
      if (domainIds.length > 0) {
        if (alive) setVersion((v) => v + 1);
        await requestDomains(active, domainIds);
      }
      if (alive) setDoneSig(sig);
    })();
    return () => {
      alive = false;
    };
    // sig 가 active·이름·물리명을 모두 담는다 — entries 배열 identity 로 다시 부르지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const prevRef = useRef<Map<string, MdmColumnInfo> | null>(null);
  return useMemo(() => {
    const done = doneSig === sig;
    const next = new Map<string, MdmColumnInfo>();
    for (const r of resolved) {
      if (!active || !r.phys) {
        next.set(r.name, NONE);
        continue;
      }
      const column = peekColumn(active, r.phys);
      if (column === undefined) {
        next.set(r.name, done ? NONE : { column: null, domain: null, loading: true });
        continue;
      }
      const domainId = column?.domain?.domainId;
      const domain = domainId ? peekDomain(active, domainId) : null;
      next.set(r.name, {
        column,
        domain: domain ?? null,
        loading: domain === undefined && !done,
      });
    }
    const prev = prevRef.current;
    if (prev && prev.size === next.size && [...next].every(([k, v]) => sameInfo(prev.get(k), v))) return prev;
    prevRef.current = next;
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, doneSig, version]);
}

/** 칸 하나의 메타. 공급자 밖이거나 이름이 없거나 meta=false 면 {null,null,false}. */
export function useMdmColumn(name: string | null | undefined, meta?: string | false): MdmColumnInfo {
  const key = name ?? "";
  const entries = name || (typeof meta === "string" && meta) ? [{ name: key, meta }] : [];
  return useMdmColumns(entries).get(key) ?? NONE;
}
