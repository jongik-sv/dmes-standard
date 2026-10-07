/**
 * 조회 기본값 샘플 화면의 예시 규칙(설계 2026-10-07-search-defaults-design §7.5).
 * 칸 형식마다 쓸 수 있는 규칙을 한 번씩 담는다. 키는 SearchField 의 `defaultKey ?? name`, 기간 To 는 `{From 키}~to`,
 * 영역 B 는 `tab2.` 접두다. remark(defaultable=false)·itemSel(묶지 않은 children)·영역 C 는 규칙이 있어도 넣지 않아야 한다.
 */
import type { PageRules } from "@dk-oasis/shared/layout";

export const SAMPLE_RULES: PageRules = {
  itemCd: { kind: "fixed", value: "P-100" },
  status: { kind: "fixed", value: "Y" },
  kind: { kind: "fixed", value: "B" },
  baseDt: { kind: "relative", base: "today", days: -1 },
  fromDt: { kind: "relative", base: "monthStart" },
  "fromDt~to": { kind: "relative", base: "today" },
  workCenter: { kind: "fixed", value: "WC-01" },
  procCd: { kind: "fixed", value: "P20" },
  regFromDt: { kind: "relative", base: "monthStart", months: -1 },
  "regFromDt~to": { kind: "relative", base: "monthEnd", months: -1 },
  memo: { kind: "last" },
  remark: { kind: "fixed", value: "넣으면 안 됨" },
  itemSel: { kind: "fixed", value: "넣으면 안 됨" },
  "tab2.itemCd": { kind: "fixed", value: "TAB2" },
  "tab2.baseDt": { kind: "relative", base: "monthEnd" },
};

/** 예외 확인용: 선택지에 없는 고정 값, 시작이 끝보다 늦은 기간. 둘 다 넣지 않아야 한다. */
export const SAMPLE_EDGE_RULES: PageRules = {
  status: { kind: "fixed", value: "Z" },
  fromDt: { kind: "relative", base: "today", days: 1 },
  "fromDt~to": { kind: "relative", base: "today" },
};
