/**
 * 위젯 도크 브라우저 저장(1차 구현) — 사용자 ID 를 키에 넣어 secure-storage(localStorage, base64) 에 둔다.
 * 저장값 모양을 검사해 손상된 값·모르는 칸은 버린다. 읽기·쓰기 실패(저장소 없음·용량 초과 등)는 조용히 무시한다.
 * 서버 저장으로 바꿀 때는 같은 WidgetDockStore 계약을 구현해 PortalShell widgetDock.store 로 넘긴다.
 */
import { readSecureJson, writeSecureJson } from "../secure-storage";
import { DOCK_MAX_WINDOWS, DOCK_WINDOW_ID_PATTERN } from "./dock-model";
import type { DockWindow, WidgetDockStore } from "./types";

/** 저장 키 앞부분. 실제 키 = `${prefix}.${userId}`. */
export const DOCK_STORAGE_PREFIX = "oasis.widget-dock.v1";
const STORED_VERSION = 1;

interface StoredDock {
  version: number;
  windows: unknown;
}

export function dockStorageKey(userId: string, prefix: string = DOCK_STORAGE_PREFIX): string {
  return `${prefix}.${userId}`;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 저장값 → 창 목록. 모양이 맞지 않는 항목은 버리고, 통째로 틀리면 빈 배열. */
export function parseDockWindows(raw: unknown): DockWindow[] {
  if (!raw || typeof raw !== "object") return [];
  const stored = raw as StoredDock;
  if (stored.version !== STORED_VERSION || !Array.isArray(stored.windows)) return [];
  const out: DockWindow[] = [];
  const ids = new Set<string>();
  for (const item of stored.windows) {
    if (out.length >= DOCK_MAX_WINDOWS) break;
    if (!item || typeof item !== "object") continue;
    const w = item as Record<string, unknown>;
    if (typeof w.id !== "string" || !DOCK_WINDOW_ID_PATTERN.test(w.id) || ids.has(w.id)) continue;
    if (typeof w.widgetId !== "string" || !w.widgetId) continue;
    if (!isNum(w.x) || !isNum(w.y) || !isNum(w.w) || !isNum(w.h) || !isNum(w.z)) continue;
    if (w.w <= 0 || w.h <= 0) continue;
    ids.add(w.id);
    out.push({
      id: w.id,
      widgetId: w.widgetId,
      x: w.x,
      y: w.y,
      w: w.w,
      h: w.h,
      collapsed: w.collapsed === true,
      z: w.z,
    });
  }
  return out;
}

/** 사용자 한 명의 브라우저 저장소. userId 가 비어 있으면 아무것도 읽거나 쓰지 않는다. */
export function createBrowserDockStore(
  userId: string,
  prefix: string = DOCK_STORAGE_PREFIX
): WidgetDockStore {
  const key = dockStorageKey(userId, prefix);
  return {
    async load() {
      if (!userId) return [];
      try {
        return parseDockWindows(readSecureJson<unknown>(key));
      } catch {
        return [];
      }
    },
    async save(windows) {
      if (!userId) return;
      try {
        const value: StoredDock = {
          version: STORED_VERSION,
          windows: windows.map(({ id, widgetId, x, y, w, h, collapsed, z }) => ({
            id,
            widgetId,
            x,
            y,
            w,
            h,
            collapsed,
            z,
          })),
        };
        writeSecureJson(key, value);
      } catch {
        // 용량 초과·저장소 막힘 — 배치 저장은 편의 기능이라 화면을 막지 않는다.
      }
    },
  };
}
