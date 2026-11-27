"use client";

/**
 * 선택한 OBJECT 의 아래 두 칸 데이터 — 「이 오브젝트의 퍼미션」(searchObjPerm) · 「이 오브젝트를 가리키는 메뉴」(searchObjMenu).
 * 두 호출은 서로 필요 없어 한꺼번에 부른다. 선택이 바뀌는 동안 낡은 응답은 버린다(화면 성능 가이드 R1).
 * 결과는 어느 오브젝트 것인지(objectId)를 달고 있어, 선택이 바뀐 직후에는 비어 있는 것으로 본다(effect 안 동기 setState 없음).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { searchObjMenu, searchObjPerm } from "./api";
import type { ObjPermInfo } from "./ObjDetailForm";
import type { ObjMenuRow, ObjPermRow } from "./types";

interface PanelState {
  objectId: string;
  perms: ObjPermRow[];
  userCnt: number;
  menus: ObjMenuRow[];
  permError: string | null;
  menuError: string | null;
}

const NO_PERMS: ObjPermRow[] = [];
const NO_MENUS: ObjMenuRow[] = [];

function messageOf(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function useObjPanels(objectId: string) {
  const [state, setState] = useState<PanelState | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!objectId) return;
    let cancelled = false;
    void (async () => {
      const [p, m] = await Promise.allSettled([searchObjPerm(objectId), searchObjMenu(objectId)]);
      if (cancelled) return;
      setState({
        objectId,
        // 행마다 OBJECT_ID 를 달아 둔다 — 「퍼미션 관리 →」 단추가 열 정의 안에서 이 값을 읽는다.
        perms: p.status === "fulfilled" ? (p.value.perms ?? []).map((r) => ({ ...r, OBJECT_ID: objectId })) : NO_PERMS,
        userCnt: p.status === "fulfilled" ? Number(p.value.USER_CNT ?? 0) || 0 : 0,
        menus: m.status === "fulfilled" ? (m.value.menus ?? NO_MENUS) : NO_MENUS,
        permError: p.status === "rejected" ? messageOf(p.reason, "퍼미션 조회 실패") : null,
        menuError: m.status === "rejected" ? messageOf(m.reason, "메뉴 조회 실패") : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [objectId, tick]);

  const current = objectId && state?.objectId === objectId ? state : null;
  const perms = current?.perms ?? NO_PERMS;
  const userCnt = current?.userCnt ?? 0;
  const perm = useMemo<ObjPermInfo>(
    () => ({ objectId: current ? objectId : null, rows: perms, userCnt, failed: current?.permError != null }),
    [current, objectId, perms, userCnt],
  );

  /** 같은 오브젝트를 다시 읽는다(저장 뒤). 읽는 동안 이전 값을 그대로 보인다. */
  const reload = useCallback(() => setTick((t) => t + 1), []);

  return {
    perm,
    menus: current?.menus ?? NO_MENUS,
    loading: objectId !== "" && current === null,
    permError: current?.permError ?? null,
    menuError: current?.menuError ?? null,
    reload,
  };
}
