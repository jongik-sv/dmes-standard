/**
 * 의사결정표 묶음 머리 — 맨 윗줄 「조건 IF · 모든 조건 셀이 참이면」「결과 THEN · 결과 변수에 대입」(06 시안 `tr.grp`)과
 * 결과 열 그룹 머리 「기준 속도 BASE_SPD 열 조건으로 한 열을 고른다」. ag-grid 열 그룹 머리 컴포넌트로 쓰고, 색은 열 정의의
 * `headerStyle` 이 칸 전체에 칠한다.
 */
export interface BlockHeaderProps {
  title: string;
  /** 제목 옆에 옅게 붙는 이름(결과 열 그룹의 물리명). */
  name?: string;
  hint: string;
}

export function BlockHeader({ title, name, hint }: BlockHeaderProps) {
  return (
    <span style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 6, width: "100%", whiteSpace: "nowrap", overflow: "hidden" }}>
      <strong>{title}</strong>
      {name ? <span style={{ fontWeight: 400 }}>{name}</span> : null}
      <span style={{ fontWeight: 400, fontSize: "var(--font-size-xs)", opacity: 0.8 }}>{hint}</span>
    </span>
  );
}
