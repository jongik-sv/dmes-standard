"use client";

/**
 * 처음 둘러보기(2차 p6) — 4단계 말풍선. 모델 고르기 → 표 추가 → 관계 긋기 → Space 속성 창.
 * 말풍선 부품은 shared `tour` 다. 이 파일은 단계 글과 대상 선택자만 안다. 「다시 보지 않기」 저장은 ErdViewer 가 state/prefs 에 한다.
 */
import { Tour, type TourCloseResult, type TourStep } from "@dk-oasis/shared/tour";

export const ERD_TOUR_STEPS: readonly TourStep[] = [
  {
    id: "model",
    title: "1. 모델 고르기",
    body: "위 막대에서 볼 모델을 고릅니다. 모델이 없으면 [+ 모델] 로 스키마를 등록합니다.",
    target: ".erd-bar__models",
    placement: "bottom",
  },
  {
    id: "table",
    title: "2. 표 추가",
    body: "도구 막대의 [표] 를 누르고 캔버스를 눌러 새 표를 놓습니다. 이름은 논리명·물리명을 함께 넣습니다.",
    target: '[data-testid="erd-tool-table"]',
    placement: "bottom",
  },
  {
    id: "relation",
    title: "3. 관계 긋기",
    body: "관계 도구를 고르고 자식 표에서 부모 표로 끌면 관계가 생깁니다. 추정 관계는 아래 검토 칸에서 확정합니다.",
    target: '[data-testid="erd-tool-relmenu"]',
    placement: "bottom",
  },
  {
    id: "props",
    title: "4. Space 로 속성 창",
    body: "표를 고르고 Space 를 누르면 컬럼 그리드(속성 창)가 열립니다. 논리명·물리명·타입을 표처럼 고칩니다.",
    placement: "center",
  },
];

export interface ErdTourProps {
  open: boolean;
  onClose(result: TourCloseResult): void;
}

export function ErdTour({ open, onClose }: ErdTourProps) {
  return <Tour open={open} steps={ERD_TOUR_STEPS} onClose={onClose} testId="erd-tour" />;
}
