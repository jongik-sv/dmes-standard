"use client";

/**
 * 포털 머리 「도구」(업무 화면 도구 창)에 넘길 위젯 등록부 — 홈(page-components/home/page.tsx)과 같은 방식으로 만든다.
 * 실행 시 등록부 = 코드 등록부 + 유형 등록부 + widgetDef/list 의 정의·덮어쓰기 행(shared mergeWidgetRegistry).
 * 계산기·단위 변환·메모는 유형(widget-types) 기반 정의 위젯이라 정의 조회가 끝나야 등록부에 생긴다 — 그 전 상태는 loading 으로 알려
 * 셸이 저장된 창을 지우지 않게 한다. 위젯관리에서 정의를 바꾸면(onWidgetDefsChanged) 조용히 다시 받는다.
 * 틀(frame)은 위젯 본체와 같은 진입점(@dk-oasis/shared/widget)의 WidgetFrame 을 넘긴다(틀 컨텍스트를 본체와 같게).
 */
import { useEffect, useMemo, useReducer, useState } from "react";
import type { PortalShellWidgetDock } from "@dk-oasis/shared/portal-shell";
import {
  mergeWidgetRegistry,
  toWidgetDefRow,
  WidgetFrame,
  type WidgetDefRow,
  type WidgetRegistry,
} from "@dk-oasis/shared/widget";

import { WIDGET_REGISTRY } from "@/lib/generated/widget-registry";
import { WIDGET_TYPE_REGISTRY } from "@/lib/generated/widget-type-registry";
import { onWidgetDefsChanged } from "@/lib/widget-defs-events";
import { INITIAL_DEFS_STATE, defsReducer, fetchWidgetDefs } from "@/page-components/home/widget-defs";

export function useDockRegistry(): PortalShellWidgetDock {
  const [defsState, dispatchDefs] = useReducer(defsReducer, INITIAL_DEFS_STATE);

  // 첫 조회 + 위젯관리 변경 알림 때 다시 조회. 다시 받을 때는 로딩으로 바꾸지 않고, 실패하면 지금 등록부를 그대로 둔다.
  useEffect(() => {
    let alive = true;
    const load = (initial: boolean) =>
      fetchWidgetDefs().then(
        (res) => {
          if (alive) dispatchDefs({ type: "loaded", rawDefs: res.rawDefs, homeDefault: res.homeDefault });
        },
        () => {
          if (alive && initial) dispatchDefs({ type: "failed" });
        }
      );
    void load(true);
    const off = onWidgetDefsChanged(() => void load(false));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const defRows = useMemo(
    () => defsState.rawDefs.map((raw) => toWidgetDefRow(raw)).filter((row): row is WidgetDefRow => row !== null),
    [defsState.rawDefs]
  );
  // 지난 등록부를 넘겨 합친 결과가 같으면 같은 객체를 쓴다(셸·창이 바뀐 것으로 보지 않게, 가이드 R7). 렌더 중 파생 상태 방식.
  const [registry, setRegistry] = useState<WidgetRegistry>(() =>
    mergeWidgetRegistry(WIDGET_REGISTRY, WIDGET_TYPE_REGISTRY, defRows)
  );
  const [registryRows, setRegistryRows] = useState(defRows);
  if (registryRows !== defRows) {
    setRegistryRows(defRows);
    setRegistry((prev) => mergeWidgetRegistry(WIDGET_REGISTRY, WIDGET_TYPE_REGISTRY, defRows, prev));
  }

  return useMemo(
    () => ({ registry, registryStatus: defsState.status, frame: WidgetFrame }),
    [registry, defsState.status]
  );
}
