export type VariableType = "STRING" | "NUMBER" | "DATE" | "JSON";

export const VARIABLE_TYPE_LABEL: Record<VariableType, string> = {
  STRING: "문자",
  NUMBER: "숫자",
  DATE: "날짜",
  JSON: "JSON",
};

/** 변수 한 행. 값은 고정값이거나 실행 변수(:today 등)이다. */
export interface JobVarRow {
  name: string;
  type: VariableType;
  value: string;
  desc?: string;
}

/** 값 칸에 쓸 수 있는 실행 변수 — 서버가 선점 때 확정한다(예약 작업 설계 §5.0). 날짜 변수는 예정 시각 기준이다. */
export const RUNTIME_VARIABLES: { name: string; desc: string }[] = [
  { name: ":schedAt", desc: "예정 시각" },
  { name: ":now", desc: "선점 시각" },
  { name: ":today", desc: "예정 날짜" },
  { name: ":yesterday", desc: "예정 전날" },
  { name: ":monthStart", desc: "예정 달 1일" },
  { name: ":prevMonthStart", desc: "예정 전달 1일" },
  { name: ":bizDate", desc: "예정 시각의 전기일(07시 기준)" },
  { name: ":bizYesterday", desc: "예정 시각 전기일의 전날(전일)" },
  { name: ":prevRunAt", desc: "직전 성공 일정 회차의 예정 시각" },
  { name: ":jobId", desc: "작업 ID" },
  { name: ":moduleCd", desc: "실행 모듈" },
];

export const newVariableRow = (): JobVarRow => ({ name: "", type: "STRING", value: "", desc: "" });

/** 이름은 앞뒤 공백을 지우고, 나머지 칸은 글자 그대로 둔다. */
export const normalizeVariableCell = (field: string, value: unknown): string =>
  field === "name" ? String(value ?? "").trim() : String(value ?? "");
