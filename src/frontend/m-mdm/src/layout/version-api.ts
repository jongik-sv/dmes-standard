/**
 * 레이아웃·헤더 두 화면 공용 버전 액션 호출(D-144 3단계) — `POST /api/mdm/oasis/{screen}/{action}`.
 * 봉투 해제·빈 값 제거는 두 화면의 `callAction` 과 같은 규칙이다(data 와 data.result 를 합치고, null·빈 문자열 키는 뺀다).
 */
import { apiRequest } from "@dk-oasis/shared/http";

export type LayoutScreen = "layoutMng" | "headerMng";
export interface LayoutVersionResult {
  layoutId: number;
  ver: string;
  verKind?: string | null;
  rowVersion?: number | null;
}

interface Envelope {
  meta?: { success?: boolean; message?: string | null };
  data?: Record<string, unknown>;
}

async function call(screen: LayoutScreen, action: string, params: Record<string, unknown>): Promise<LayoutVersionResult> {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "")));
  const res = (await apiRequest<unknown>(`/api/mdm/oasis/${screen}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: screen }, params: cleaned }),
  })) as Envelope;
  if (res?.meta && res.meta.success === false) throw new Error(res.meta.message?.trim() || "요청이 거부되었습니다.");
  const out: Record<string, unknown> = {};
  if (res?.data) {
    Object.assign(out, res.data);
    const inner = res.data["result"];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) Object.assign(out, inner as Record<string, unknown>);
  }
  return out as unknown as LayoutVersionResult;
}

export const newLayoutVersion = (s: LayoutScreen, layoutId: number, verKind: "MAJOR" | "MINOR") => call(s, "copy", { layoutId, verKind });
export const deleteLayoutDraft = (s: LayoutScreen, layoutId: number, ver: string, rowVersion: number) =>
  call(s, "delete", { layoutId, ver, rowVersion, target: "VERSION" });
export const cancelLayoutConfirm = (s: LayoutScreen, layoutId: number, ver: string, rowVersion: number) =>
  call(s, "delete", { layoutId, ver, rowVersion, target: "CONFIRM" });
export const lockLayoutDraft = (s: LayoutScreen, layoutId: number, ver: string, rowVersion: number) => call(s, "lock", { layoutId, ver, rowVersion });
export const unlockLayoutDraft = (s: LayoutScreen, layoutId: number, ver: string, rowVersion: number) => call(s, "unlock", { layoutId, ver, rowVersion });
export const handoverLayoutDraft = (s: LayoutScreen, layoutId: number, ver: string, rowVersion: number, newOwnerId: string) =>
  call(s, "handover", { layoutId, ver, rowVersion, newOwnerId });
