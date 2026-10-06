/**
 * 화면에 넣기(역방향) 계약의 위젯 쪽 모양 — screen-context 레인 D5 가 shared 의 WidgetProps.screenApply 로 만들면 그 타입으로 바꾼다.
 * 그때까지 위젯 폴더 안의 로컬 타입으로 두고, 렌더러는 props 에서 이 모양을 읽는다(없거나 null 이면 단추를 숨긴다).
 */
export interface ScreenApplyResult {
  /** 화면 칸에 넣은 항목 이름. */
  applied: string[];
  /** 화면에 맞는 칸이 없거나 넣을 수 없어 건너뛴 항목 이름. */
  skipped: string[];
}

export interface ScreenApply {
  /** 활성 업무 화면이 받을 수 있는 상태인지. false 면 단추를 보이지 않는다. */
  available: boolean;
  apply(values: Record<string, string>, opts?: { label?: string }): Promise<ScreenApplyResult>;
}

/** WidgetProps 에서 screenApply 를 읽는다(shared 타입이 오기 전이라 느슨하게 읽는다). 모양이 틀리면 null. */
export function readScreenApply(props: object): ScreenApply | null {
  const v = (props as { screenApply?: unknown }).screenApply;
  if (v === null || typeof v !== "object") return null;
  const r = v as { available?: unknown; apply?: unknown };
  return typeof r.apply === "function" && r.available === true ? (v as ScreenApply) : null;
}
