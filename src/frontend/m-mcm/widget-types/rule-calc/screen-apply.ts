/**
 * 화면에 넣기(역방향) — 위젯 props 의 screenApply 읽기. 계약 타입은 shared screen-context(`ScreenApply`)가 정본이다.
 * 도크의 업무 화면이 받는 처리기를 등록했을 때만 available 이고, 보드(위젯 화면)에서는 null 이다.
 * 타입만 가져오므로 런타임에 shared 를 부르지 않는다.
 */
import type { ScreenApply, ScreenApplyResult } from "@dk-oasis/shared/screen-context";

export type { ScreenApply, ScreenApplyResult };

/** props 의 screenApply 가 쓸 수 있는 상태(함수가 있고 available===true)일 때만 돌려주고, 그 밖은 null 이라 단추를 숨긴다. */
export function readScreenApply(props: { screenApply?: ScreenApply | null }): ScreenApply | null {
  const v = props.screenApply;
  return v && typeof v.apply === "function" && v.available === true ? v : null;
}
