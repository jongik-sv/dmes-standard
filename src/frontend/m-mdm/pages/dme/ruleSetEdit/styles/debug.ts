/**
 * 디버그 모드 스타일(3단계 계획 Task 10 이 채운다).
 *
 * `LEGACY_SIM_CSS` 는 2단계 시뮬레이션 탭(`SimulationPanel`·`TraceStepper`)에서만 쓰는 **탭 전용** 규칙(`.rsim`·`.rsim-bar*`·`.rsim-scroll`·
 * `.rsim-input`·`.rsim-main`·`.rsim-field*`·`.rsim-evalts*`·`.rsim-stepper*`·`.rsim-progress`·`.rsim-status`·`.rsim-error` 등·`.rsf-sim-slot`)을
 * `rsf-styles.ts` 에서 그대로 옮긴 것이다. 시뮬레이션 탭을 지우는 Task 12 가 이 상수를 지운다. 노드 상세(`TraceDetail`)·값 표(`ValueTable`)가
 * 쓰는 `.rsim-list`·`.rsim-values`·`.rsim-pairs` 등은 `base.ts` 에 남긴다.
 */
export const LEGACY_SIM_CSS = `
/* 시뮬레이션 탭 — 본문은 스크롤하지 않고 SimulationPanel 이 버튼 줄 고정 + 아래 영역 스크롤로 나눈다 */
.rsf-bottom-body[data-tab="sim"] { overflow: hidden; display: flex; flex-direction: column; padding-top: 0; padding-bottom: 0; }
.rsf-sim-slot { min-height: 40px; }
.rsf-bottom-body[data-tab="sim"] > .rsf-sim-slot { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }

/* 룰 세트 디버거 시뮬레이션 탭(2단계 계획 Task 11 — SimulationPanel·TraceStepper). 색은 의미 토큰만 쓴다. 한 변 색 바는 쓰지 않는다(Local-Rules §8). */
.rsim { display: flex; flex-direction: column; flex: 1 1 0; min-height: 0; min-width: 0; outline: none; }
/* 고정 버튼 줄 — [실행]·[표시 지우기] | 따라가기(처음·이전·다음·끝·진행 막대·상태 문구) */
.rsim-bar {
  flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs) var(--spacing-sm);
  padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--color-border-light);
}
.rsim-bar-run { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); }
.rsim-bar-sep { align-self: stretch; width: 1px; margin: 2px 0; background: var(--color-border); }
.rsim-bar .rsim-stepper { flex: 1 1 420px; min-width: 0; flex-direction: row; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs) var(--spacing-sm); }
.rsim-bar .rsim-stepper-row { flex: 1 1 320px; min-width: 0; }
.rsim-bar .rsim-status { flex: 1 1 200px; min-width: 0; }
/* 스크롤 영역 — 입력 폼 | 실행 결과(오류·값 표·경고) */
.rsim-scroll {
  flex: 1 1 0; min-height: 0; overflow: auto; display: flex; flex-wrap: wrap; gap: var(--spacing-md); align-items: flex-start;
  padding: var(--spacing-xs) 0;
}
.rsim-input { flex: 0 1 380px; min-width: 260px; display: flex; flex-direction: column; gap: var(--spacing-xs); }
.rsim-main { flex: 1 1 420px; min-width: 0; display: flex; flex-direction: column; gap: var(--spacing-xs); }
.rsim-title { margin: 0; font-weight: 600; }
.rsim-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: var(--spacing-xs) var(--spacing-sm); }
.rsim-fields { list-style: none; margin: 0; padding: 0; }
.rsim-field { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--spacing-xs); padding: 2px 0; border-bottom: 1px solid var(--color-border-light); }
.rsim-field-name { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); min-width: 0; }
.rsim-field-label, .rsim-field-type { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.rsim-field-edit { display: inline-flex; align-items: center; gap: var(--spacing-xs); }
.rsim-send { display: inline-flex; }
.rsim-evalts { display: inline-flex; flex-wrap: wrap; align-items: flex-start; gap: var(--spacing-xs); }
.rsim-evalts-label { line-height: var(--form-height); font-size: var(--font-size-sm); color: var(--color-text-secondary); }

/* 따라가기 */
.rsim-stepper { display: flex; flex-direction: column; gap: var(--spacing-xs); }
.rsim-stepper-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--spacing-xs); }
.rsim-progress { flex: 1 1 120px; min-width: 100px; }
.rsim-status { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.rsim-status[data-end="stopped"], .rsim-status[data-end="before"], .rsim-error { color: var(--color-danger); }
.rsim-error { margin: 0; overflow-wrap: anywhere; }
`;

/** 디버그 모드 규칙 — 디버그 툴바·입력 패널·변수 패널·테스트 케이스·실행 비교. */
const DEBUG_MODE_CSS = ""; // SEAM(T10): 디버그 툴바·입력·변수 패널·케이스·실행 비교 스타일

export const DEBUG_CSS = [LEGACY_SIM_CSS, DEBUG_MODE_CSS].join("\n");
