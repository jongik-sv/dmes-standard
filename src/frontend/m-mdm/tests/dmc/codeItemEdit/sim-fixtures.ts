// TSK-06-03 design.md §1.4·§3 커밋 D — 시뮬레이터 docs/mdm/design/basic/sql/04-hier-tree-sim.py 의 입력 행과 출력 전문.
// SIM_OUTPUT 은 2026-09-24 실행 결과를 글자 그대로 옮겼다(앞 공백 2칸은 시뮬레이터의 들여쓰기). 수용 기준 4 의 기대값 원천이다.
import type { HierRow } from "../../../pages/dmc/codeItemEdit/code-tree";

/** 시뮬레이터 TB_MDM_CODE_ITEM — STEEL_STD 8행. */
export const STEEL_STD: HierRow[] = [
  { code: "KS-9", name: "규격 외 KS", seq: 9, lvl1: "KS", lvl2: null, lvl3: null, lvl4: null, lvl5: null },
  { code: "KS-3-CGCC", name: "CGCC", seq: 1, lvl1: "KS", lvl2: "KS-3", lvl3: null, lvl4: null, lvl5: null },
  { code: "KS-3-CGCD", name: "CGCD", seq: 2, lvl1: "KS", lvl2: "KS-3", lvl3: null, lvl4: null, lvl5: null },
  { code: "KS-3-CGCH", name: "CGCH(기본)", seq: 3, lvl1: "KS", lvl2: "KS-3", lvl3: null, lvl4: null, lvl5: null },
  { code: "KS-3-CGCH-Z12", name: "CGCH Z12", seq: 1, lvl1: "KS", lvl2: "KS-3", lvl3: "KS-3-CGCH", lvl4: null, lvl5: null },
  { code: "KS-3-CGCH-Z27", name: "CGCH Z27", seq: 2, lvl1: "KS", lvl2: "KS-3", lvl3: "KS-3-CGCH", lvl4: null, lvl5: null },
  { code: "JIS-3-CGCC", name: "CGCC(JIS)", seq: 1, lvl1: "JIS", lvl2: "JIS-3", lvl3: null, lvl4: null, lvl5: null },
  { code: "JIS-4-SPCC", name: "SPCC", seq: 1, lvl1: "JIS", lvl2: "JIS-4", lvl3: null, lvl4: null, lvl5: null },
];

/** 시뮬레이터 TB_MDM_DATA_ITEM — ORG 5행(모두 closed_at NULL). */
export const ORG: HierRow[] = [
  { code: "HQ-PLN", name: "기획팀", seq: 1, lvl1: "HQ", lvl2: null, lvl3: null, lvl4: null, lvl5: null },
  { code: "PH-B", name: "B공장", seq: 1, lvl1: "PH", lvl2: null, lvl3: null, lvl4: null, lvl5: null },
  { code: "PH-A", name: "A공장", seq: 2, lvl1: "PH", lvl2: null, lvl3: null, lvl4: null, lvl5: null },
  { code: "PH-A-PRD", name: "A공장 생산팀", seq: 1, lvl1: "PH", lvl2: "PH-A", lvl3: null, lvl4: null, lvl5: null },
  { code: "PH-A-MNT", name: "A공장 정비팀", seq: 2, lvl1: "PH", lvl2: "PH-A", lvl3: null, lvl4: null, lvl5: null },
];

/** python3 04-hier-tree-sim.py 표준 출력 전문. */
export const SIM_OUTPUT = `== STEEL_STD 콤보 (코드 먼저, 그다음 그룹)
  고른 값 (없음)       → JIS(그룹), KS(그룹)
  고른 값 KS         → KS-9(코드, 규격 외 KS), KS-3(그룹)
  고른 값 KS-3       → KS-3-CGCC(코드, CGCC), KS-3-CGCD(코드, CGCD), KS-3-CGCH(그룹+코드, CGCH(기본))
  고른 값 KS-3-CGCH  → KS-3-CGCH-Z12(코드, CGCH Z12), KS-3-CGCH-Z27(코드, CGCH Z27)
  고른 값 JIS        → JIS-3(그룹), JIS-4(그룹)

== STEEL_STD 트리
  ▸  JIS
     ▸  JIS-3
         · JIS-3-CGCC  (CGCC(JIS))
     ▸  JIS-4
         · JIS-4-SPCC  (SPCC)
  ▸  KS
      · KS-9  (규격 외 KS)
     ▸  KS-3
         · KS-3-CGCC  (CGCC)
         · KS-3-CGCD  (CGCD)
        ▸· KS-3-CGCH  (CGCH(기본))
            · KS-3-CGCH-Z12  (CGCH Z12)
            · KS-3-CGCH-Z27  (CGCH Z27)

== ORG 콤보·트리 (05, closed_at IS NULL 행만. 항목은 seq 순)
  고른 값 (없음)   → HQ(그룹), PH(그룹)
  고른 값 PH     → PH-A(그룹+코드), PH-B(코드)
  고른 값 PH-A   → PH-A-MNT(코드), PH-A-PRD(코드)
  ▸  HQ
      · HQ-PLN  (기획팀)
  ▸  PH
      · PH-B  (B공장)
     ▸· PH-A  (A공장)
         · PH-A-PRD  (A공장 생산팀)
         · PH-A-MNT  (A공장 정비팀)

== 저장 검사
  ('KS', None, 'KS-3-CGCH')                X-1              → 거부: 중간 칸이 비었다
  ('JIS', 'KS-3', None)                    X-2              → 거부: KS-3는 이미 KS 아래에 있다
  ('KS', 'KS-3', 'KS-3-CGCH')              KS-3-CGCH-Z50    → 통과
  ('JIS', None, None)                      KS-3             → 거부: KS-3는 이미 KS 아래에 있다

모든 확인 통과`;

/** 제목 줄 `== <title>` 다음부터 빈 줄 전까지. */
export function simBlock(title: string): string[] {
  const lines = SIM_OUTPUT.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`== ${title}`));
  if (start < 0) throw new Error(`블록 없음: ${title}`);
  const out: string[] = [];
  for (let i = start + 1; i < lines.length && lines[i] !== ""; i++) out.push(lines[i]);
  return out;
}
