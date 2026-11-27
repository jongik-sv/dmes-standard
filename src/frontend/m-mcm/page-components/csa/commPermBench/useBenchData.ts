"use client";

/**
 * commPermBench 자료 캐시 — 작업대 API 응답을 키별로 한 번만 받아 둔다.
 *
 * - bench: searchBench 한 번(사람·그룹·역할·연결). 서버 현재 값만 있다(초안 소속은 화면이 draft.ts overlayBench 로 얹는다)
 * - menuTrees: searchMenuTree. 키 `r:<ROLE_ID>`(역할 기준·메뉴 칸) · `u:<USER_ID>`(사람 기준 미리보기)
 * - rolePerms: searchRolePerm(역할 하나의 퍼미션 줄 전부). 보는 사람이 받은 역할·고른 역할·초안에 든 역할만 읽는다
 *   menuFolderId 없이 부르면 서버는 퍼미션 있는 줄만 준다(bench-be #13). 퍼미션 없는 화면을 고르면 그 폴더로 한 번 더 불러
 *   (ensureFolderPerms, z2 F5) 오브젝트 허용 값이 든 빈 줄을 얹는다 — 역할 줄 전부에 없는 줄만 채운다.
 * - explains: explain. 키 `<USER_ID>|<OBJECT_ID>`
 *
 * 캐시는 source(현재 CUR / 저장한 초안 DRAFT)마다 따로 둔다. 읽기 함수는 source 를 인자로 받는다(기본 CUR).
 * 칸·칩·역할 기준 미리보기는 CUR + 화면 초안을 쓰고, 사람 기준 미리보기의 「초안」 보기만 서버 DRAFT 를 읽는다.
 * 초안을 저장할 때마다 invalidateDraft 가 DRAFT 세대를 올린다 — 앞 DRAFT 자료는 새 응답이 올 때까지 그대로 보이고
 * (깜빡이지 않는다), 앞 세대의 늦은 응답은 버린다. CUR 읽기는 건드리지 않는다.
 * 다시 읽기(reload)는 세대 번호를 올려 앞 세대의 늦은 응답을 버리고, epoch 를 올려 지금 보는 것의 자료를 다시 요청하게 한다.
 * 읽기에 실패한 키는 failed 에 남아 화면이 「읽지 못했습니다 · 다시 읽기」를 보인다(retry).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildMenuTree, indexBench, toRolePermMap, type BenchIndex, type MenuTree, type RolePermMap } from "./model";
import type { ExplainResult, PermBenchApi, PermSource, RolePermRow } from "./types";

export type BenchKind = "t" | "p" | "e";

export interface BenchData {
  bench: BenchIndex | null;
  /** 처음 읽기·다시 읽기 중. */
  benchLoading: boolean;
  /** 알려 줄 오류 글: 작업대 읽기 실패 또는 읽지 못한 키 하나의 글. 없으면 null. */
  error: string | null;
  /** 현재 값(CUR). */
  menuTrees: ReadonlyMap<string, MenuTree>;
  rolePerms: ReadonlyMap<string, RolePermMap>;
  explains: ReadonlyMap<string, ExplainResult>;
  /** 저장한 초안(DRAFT) — 미리보기 「초안」 보기용. */
  draftTrees: ReadonlyMap<string, MenuTree>;
  draftExplains: ReadonlyMap<string, ExplainResult>;
  /** 다시 읽기 횟수. 읽기 효과가 deps 에 두어, 다시 읽은 뒤 지금 보는 것의 자료를 다시 요청한다. */
  epoch: number;
  /** 다시 읽기: 캐시를 모두 비우고 작업대부터 새로 읽는다. */
  reload: () => void;
  /** 읽지 못한 키만 다시 요청한다(캐시는 두고). */
  retry: () => void;
  /** 초안을 저장·버림·적용한 뒤: DRAFT 자료를 낡은 것으로 표시하고 다시 요청하게 한다. */
  invalidateDraft: () => void;
  /** 이 키(종류 + 키)의 읽기가 실패했는가. kind: t = 메뉴 트리 · p = 역할 퍼미션 · e = explain. */
  hasFailed: (kind: BenchKind, key: string, source?: PermSource) => boolean;
  ensureMenuTree: (key: string, source?: PermSource) => void;
  ensureRolePerms: (roleIds: readonly string[], source?: PermSource) => void;
  /** 역할 하나 × 메뉴 폴더 하나의 퍼미션 줄(퍼미션 없는 오브젝트 줄 포함, CUR). 역할 줄 전부에 없는 줄만 rolePerms 에 얹는다. */
  ensureFolderPerms: (roleId: string, menuFolderId: string) => void;
  /**
   * 폴더 여럿의 퍼미션 줄을 바로 읽어 얹고 읽은 줄(OBJECT_ID → 줄)을 돌려준다 — 접힌 폴더 체크(한꺼번에 등록) 전에 쓴다(z2 F5).
   * 하나라도 실패하면 "failed", 그사이 다시 읽기를 하면 "stale"(자료를 새로 읽으므로 알리지 않는다).
   */
  fetchFolderPerms: (roleId: string, menuFolderIds: readonly string[]) => Promise<ReadonlyMap<string, RolePermRow> | "failed" | "stale">;
  /** 다 읽은 폴더 키(folderPermKey, CUR). */
  folderDone: ReadonlySet<string>;
  ensureExplain: (userId: string, objectId: string, source?: PermSource) => void;
}

export const explainKey = (userId: string, objectId: string): string => `${userId}|${objectId}`;
export const roleTreeKey = (roleId: string): string => `r:${roleId}`;
export const userTreeKey = (userId: string): string => `u:${userId}`;
export const folderPermKey = (roleId: string, menuFolderId: string): string => `${roleId}@${menuFolderId}`;

/**
 * 역할 줄 전부(perms)에 폴더로 읽은 줄(folder)을 얹는다. 역할 줄 전부가 아직 없는 역할은 얹지 않는다(읽는 중으로 둔다).
 * 역할 줄 전부에 이미 있는 줄은 그대로(퍼미션 줄의 정본). 바뀐 게 없으면 같은 객체.
 */
export function withFolderRows(perms: ReadonlyMap<string, RolePermMap>, folder: ReadonlyMap<string, RolePermMap>): ReadonlyMap<string, RolePermMap> {
  if (!folder.size) return perms;
  let out: Map<string, RolePermMap> | null = null;
  for (const [rid, extra] of folder) {
    const base = perms.get(rid);
    if (!base) continue;
    const missing = [...extra.values()].filter((r) => !base.has(r.OBJECT_ID));
    if (!missing.length) continue;
    const m = new Map(base);
    for (const r of missing) m.set(r.OBJECT_ID, r);
    out ??= new Map(perms);
    out.set(rid, m);
  }
  return out ?? perms;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : "조회하지 못했습니다.");

function setIn<V>(prev: ReadonlyMap<string, V>, key: string, value: V): Map<string, V> {
  const next = new Map(prev);
  next.set(key, value);
  return next;
}

/** source 한 쪽의 캐시 묶음. */
interface Bundle {
  trees: ReadonlyMap<string, MenuTree>;
  perms: ReadonlyMap<string, RolePermMap>;
  /** 폴더로 읽은 줄(역할 → 오브젝트 → 줄). 여러 폴더를 읽으면 합친다. */
  folderPerms: ReadonlyMap<string, RolePermMap>;
  /** 다 읽은 폴더 키(folderPermKey). */
  folderDone: ReadonlySet<string>;
  explains: ReadonlyMap<string, ExplainResult>;
}
const EMPTY: Bundle = { trees: new Map(), perms: new Map(), folderPerms: new Map(), folderDone: new Set(), explains: new Map() };
type Caches = Partial<Record<PermSource, Bundle>>;

/** 읽는 중·실패 키. DRAFT 는 세대 번호를 붙여, 초안을 저장하면 같은 키를 다시 읽는다. */
const pendingKey = (source: PermSource, draftGen: number, kind: BenchKind, key: string) =>
  `${source === "DRAFT" ? `DRAFT#${draftGen}` : "CUR"}:${kind}:${key}`;

export function useBenchData(api: PermBenchApi): BenchData {
  const [bench, setBench] = useState<BenchIndex | null>(null);
  const [benchLoading, setBenchLoading] = useState(true);
  const [benchError, setBenchError] = useState<string | null>(null);
  const [caches, setCaches] = useState<Caches>({});
  const [failed, setFailed] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [epoch, setEpoch] = useState(0);
  const [draftGen, setDraftGen] = useState(0);
  const gen = useRef(0);
  const draftGenRef = useRef(0);
  const pending = useRef(new Set<string>());

  /** searchBench 를 부른다. 응답 때만 상태를 바꾼다(효과 안에서 바로 setState 하지 않는다). */
  const fetchBench = useCallback(
    (g: number) => {
      api.searchBench({}).then(
        (res) => {
          if (g !== gen.current) return;
          setBench(indexBench(res));
          setBenchLoading(false);
        },
        (e: unknown) => {
          if (g !== gen.current) return;
          setBenchError(errText(e));
          setBenchLoading(false);
        },
      );
    },
    [api],
  );

  useEffect(() => {
    gen.current += 1;
    pending.current = new Set();
    fetchBench(gen.current);
  }, [fetchBench]);

  /** 다시 읽기(단추·원래 프로그램에서 돌아옴·적용 뒤). 캐시를 모두 비우고, epoch 를 올려 지금 보는 것의 자료를 다시 요청하게 한다. */
  const load = useCallback(() => {
    gen.current += 1;
    pending.current = new Set();
    setBenchLoading(true);
    setBenchError(null);
    setCaches({});
    setFailed(new Map());
    setEpoch((e) => e + 1);
    fetchBench(gen.current);
  }, [fetchBench]);

  /** 읽지 못한 키를 다시 요청한다. 읽기 효과가 epoch 로 다시 돌고, 이미 받은·읽는 중인 키는 건너뛴다. */
  const retry = useCallback(() => {
    setFailed((p) => (p.size ? new Map() : p));
    setEpoch((e) => e + 1);
  }, []);

  const invalidateDraft = useCallback(() => {
    draftGenRef.current += 1;
    for (const k of [...pending.current]) if (k.startsWith("DRAFT")) pending.current.delete(k);
    setDraftGen(draftGenRef.current);
    setFailed((p) => {
      if (![...p.keys()].some((k) => k.startsWith("DRAFT"))) return p;
      return new Map([...p].filter(([k]) => !k.startsWith("DRAFT")));
    });
    setEpoch((e) => e + 1);
  }, []);

  /** 캐시 한 칸을 채운다(그 source 묶음만 바꾼다). */
  const put = useCallback(<V,>(src: PermSource, field: keyof Bundle, key: string, value: V) => {
    setCaches((prev) => {
      const b = prev[src] ?? EMPTY;
      return { ...prev, [src]: { ...b, [field]: setIn(b[field] as ReadonlyMap<string, V>, key, value) } };
    });
  }, []);

  /** 키 하나를 한 번만 읽는다. 실패하면 키를 풀고 failed 에 남긴다(다시 읽기·다시 고르면 다시 읽는다). */
  const once = useCallback(<T,>(src: PermSource, kind: BenchKind, key: string, run: () => Promise<T>, done: (v: T) => void) => {
    const dg = draftGenRef.current;
    const pk = pendingKey(src, dg, kind, key);
    if (pending.current.has(pk)) return;
    pending.current.add(pk);
    const g = gen.current;
    const stale = () => g !== gen.current || (src === "DRAFT" && dg !== draftGenRef.current);
    run().then(
      (v) => {
        if (stale()) return;
        done(v);
        setFailed((p) => {
          if (!p.has(pk)) return p;
          const n = new Map(p);
          n.delete(pk);
          return n;
        });
      },
      (e: unknown) => {
        if (stale()) return;
        pending.current.delete(pk);
        setFailed((p) => setIn(p, pk, errText(e)));
      },
    );
  }, []);

  const ensureMenuTree = useCallback(
    (key: string, source: PermSource = "CUR") => {
      const [kind, id] = [key.slice(0, 1), key.slice(2)];
      if (!id) return;
      once(source, "t", key, () => api.searchMenuTree(kind === "u" ? { userId: id, source } : { roleId: id, source }), (res) =>
        put(source, "trees", key, buildMenuTree(res.menus)),
      );
    },
    [api, once, put],
  );

  const ensureRolePerms = useCallback(
    (roleIds: readonly string[], source: PermSource = "CUR") => {
      for (const roleId of roleIds) {
        if (!roleId) continue;
        once(source, "p", roleId, () => api.searchRolePerm({ roleId, source }), (res) => put(source, "perms", roleId, toRolePermMap(res.perms)));
      }
    },
    [api, once, put],
  );

  /** 폴더로 읽은 줄을 역할의 folderPerms 에 합치고 그 폴더들을 다 읽음으로 둔다(CUR). */
  const putFolderRows = useCallback((roleId: string, folderIds: readonly string[], rows: Iterable<RolePermRow>) => {
    setCaches((prev) => {
      const b = prev.CUR ?? EMPTY;
      const next = new Map(b.folderPerms.get(roleId) ?? []);
      for (const r of rows) next.set(r.OBJECT_ID, r);
      const done = new Set(b.folderDone);
      for (const f of folderIds) done.add(folderPermKey(roleId, f));
      return { ...prev, CUR: { ...b, folderPerms: setIn(b.folderPerms, roleId, next), folderDone: done } };
    });
  }, []);

  const ensureFolderPerms = useCallback(
    (roleId: string, menuFolderId: string) => {
      if (!roleId || !menuFolderId) return;
      once("CUR", "p", folderPermKey(roleId, menuFolderId), () => api.searchRolePerm({ roleId, menuFolderId, source: "CUR" }), (res) =>
        putFolderRows(roleId, [menuFolderId], res.perms),
      );
    },
    [api, once, putFolderRows],
  );

  const fetchFolderPerms = useCallback(
    async (roleId: string, menuFolderIds: readonly string[]): Promise<ReadonlyMap<string, RolePermRow> | "failed" | "stale"> => {
      const g = gen.current;
      try {
        const ids = [...new Set(menuFolderIds)];
        const res = await Promise.all(ids.map((f) => api.searchRolePerm({ roleId, menuFolderId: f, source: "CUR" })));
        if (g !== gen.current) return "stale";
        const rows = new Map<string, RolePermRow>();
        for (const r of res) for (const row of r.perms) rows.set(row.OBJECT_ID, row);
        putFolderRows(roleId, ids, rows.values());
        return rows;
      } catch {
        return g !== gen.current ? "stale" : "failed";
      }
    },
    [api, putFolderRows],
  );

  const ensureExplain = useCallback(
    (userId: string, objectId: string, source: PermSource = "CUR") => {
      if (!userId || !objectId) return;
      const key = explainKey(userId, objectId);
      once(source, "e", key, () => api.explain({ userId, objectId, source }), (res) => put(source, "explains", key, res));
    },
    [api, once, put],
  );

  const hasFailed = useCallback(
    (kind: BenchKind, key: string, source: PermSource = "CUR") => failed.has(pendingKey(source, draftGen, kind, key)),
    [failed, draftGen],
  );
  const error = benchError ?? (failed.size ? [...failed.values()][0] : null);
  const cur = caches.CUR ?? EMPTY;
  const dft = caches.DRAFT ?? EMPTY;
  const curPerms = useMemo(() => withFolderRows(cur.perms, cur.folderPerms), [cur.perms, cur.folderPerms]);

  return useMemo(
    () => ({
      bench, benchLoading, error, menuTrees: cur.trees, rolePerms: curPerms, folderDone: cur.folderDone, explains: cur.explains,
      draftTrees: dft.trees, draftExplains: dft.explains,
      epoch, reload: load, retry, invalidateDraft, hasFailed, ensureMenuTree, ensureRolePerms, ensureFolderPerms, fetchFolderPerms, ensureExplain,
    }),
    [bench, benchLoading, error, cur, curPerms, dft, epoch, load, retry, invalidateDraft, hasFailed, ensureMenuTree, ensureRolePerms, ensureFolderPerms, fetchFolderPerms, ensureExplain],
  );
}
