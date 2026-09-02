/**
 * 상세정보 폼 (Detail Form) 공통 스타일 — 2026-06-01.
 *
 * <p>mcm csa 9 화면 + cma 4 화면의 Detail 영역 표 그리드 + 활성 input 정합 적용용 공통 스타일.
 * W1 (commObjMng) / W2 (commMenuMng) 정본을 단일 source 로 통일.
 *
 * <p>사용 패턴:
 * <pre>
 *   import {
 *     DETAIL_TABLE_STYLE,
 *     DETAIL_LABEL_CELL,
 *     DETAIL_VALUE_CELL,
 *     INPUT_BASE,
 *     INPUT_READONLY,
 *     INPUT_DISABLED,
 *   } from "@dk-oasis/shared/layout";
 *
 *   &lt;table style={DETAIL_TABLE_STYLE}&gt;
 *     &lt;tbody&gt;
 *       &lt;tr&gt;
 *         &lt;th style={DETAIL_LABEL_CELL}&gt;라벨&lt;/th&gt;
 *         &lt;td style={DETAIL_VALUE_CELL}&gt;
 *           &lt;input ... style={INPUT_BASE} /&gt;
 *         &lt;/td&gt;
 *       &lt;/tr&gt;
 *     &lt;/tbody&gt;
 *   &lt;/table&gt;
 * </pre>
 *
 * <p>As-Is xfdl 의 회색 배경 라벨 셀 + 흰 배경 값 셀 + 활성 input 패턴 정합.
 */
import type { CSSProperties } from "react";

/** Detail 영역 표 그리드 컨테이너 — 셀 경계 collapse + 12px 폰트 + 흰 배경. */
export const DETAIL_TABLE_STYLE: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
  background: "#fff",
};

/** 라벨 셀 — 회색 배경 + 테두리 + 좌측 정렬 + 130px 고정 너비. */
export const DETAIL_LABEL_CELL: CSSProperties = {
  background: "#f4f6f8",
  border: "1px solid #d4dae0",
  padding: "6px 10px",
  fontWeight: 500,
  color: "#333",
  width: 130,
  whiteSpace: "nowrap",
  textAlign: "left",
};

/** 값 셀 — 흰 배경 + 테두리 + 작은 padding (input 이 셀 내부를 거의 채움). */
export const DETAIL_VALUE_CELL: CSSProperties = {
  border: "1px solid #d4dae0",
  padding: "4px 6px",
  background: "#fff",
};

/** 활성 input/select — 흰 배경 + 명시 테두리 + 검정 텍스트. */
export const INPUT_BASE: CSSProperties = {
  width: "100%",
  padding: "4px 6px",
  border: "1px solid #c0c6cc",
  borderRadius: 2,
  background: "#ffffff",
  color: "#222",
  outline: "none",
  fontSize: 12,
};

/** readonly input — 옅은 회색 배경 + 옅은 회색 텍스트. */
export const INPUT_READONLY: CSSProperties = {
  ...INPUT_BASE,
  background: "#f0f2f5",
  color: "#666",
};

/** disabled input — readonly 보다 더 옅은 텍스트. */
export const INPUT_DISABLED: CSSProperties = {
  ...INPUT_BASE,
  background: "#f0f2f5",
  color: "#888",
};
