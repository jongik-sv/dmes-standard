"use client";

/**
 * 쿼리 위젯 유형 공용 스타일·빈 상태.
 * m-* 로컬 `.css` import 대신 TS 문자열을 React 19 `<style href precedence>` 로 넣는다(Local-Rules §17 — 같은 href 는 한 번만 실린다).
 * 색·간격은 의미 토큰만 쓴다. 그리드·차트·KPI 타일 모습은 shared 가 정한다.
 */
import { QUERY_EMPTY } from "./format";

export const QUERY_STYLE_HREF = "mcm-widget-query";

/** 필드 칸에 [쿼리 시험] 결과 컬럼 목록이 아직 없을 때 직접 입력 칸에 보이는 안내. */
export const FIELD_INPUT_PLACEHOLDER = "컬럼 이름([쿼리 시험] 뒤에는 목록에서 고릅니다)";

export const QUERY_CSS = `
.wq-note { flex: none; padding: 3px 8px; font-size: var(--font-size-xs); color: var(--color-text-muted); border-top: 1px solid var(--color-border-light); }
.wq-empty { display: flex; align-items: center; justify-content: center; height: 100%; min-height: 48px; box-sizing: border-box; padding: var(--spacing-md); font-size: var(--font-size-sm); color: var(--color-text-muted); text-align: center; }
.wq-center { display: flex; align-items: center; justify-content: center; height: 100%; min-height: 0; }
.wq-lines { display: flex; flex-direction: column; }
.wq-editor { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.wq-hint { font-size: var(--font-size-xs); color: var(--color-text-muted); line-height: 1.5; overflow-wrap: anywhere; }
.wq-hint code { font-family: var(--font-family-mono); color: var(--color-text); }
.wq-tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-sm); }
.wq-summary { font-size: var(--font-size-xs); color: var(--color-text-muted); overflow-wrap: anywhere; }
.wq-shell { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.wq-main { flex: 1 1 0; min-height: 0; overflow: auto; }
.wq-cond-bar { flex: none; display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--spacing-sm); padding-bottom: var(--spacing-sm); }
.wq-cond { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.wq-cond__label { font-size: var(--font-size-xs); color: var(--color-text-muted); }
.wq-cond__req { margin-left: 2px; color: var(--color-danger); }
.wq-cond__ctl { width: 150px; max-width: 100%; }
.wq-cond--range .wq-cond__ctl { width: auto; }
.wq-cond--multi .wq-cond__ctl { width: 220px; }
.wq-cond__range { display: flex; flex-direction: column; gap: 2px; }
/* 값이 빈 칸(선택 안 함) 은 placeholder 처럼 흐린 글자로 보인다. */
.wq-cond__ctl select:has(option[value=""]:checked) { color: var(--color-text-muted); }
.wq-error { flex-direction: column; gap: var(--spacing-sm); color: var(--color-danger); }
.wq-params-hint { color: var(--color-danger); }
`;

export function QueryStyle() {
  return (
    <style href={QUERY_STYLE_HREF} precedence="default">
      {QUERY_CSS}
    </style>
  );
}

/** 결과 0행 — 「표시할 데이터가 없습니다」. */
export function QueryEmpty() {
  return (
    <div className="wq-empty" data-testid="wq-empty">
      {QUERY_EMPTY}
    </div>
  );
}
