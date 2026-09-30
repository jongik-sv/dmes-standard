/**
 * REGEX defTarget 드롭다운 후보(D5 — 서버 `cateDefIssues` 는 LVLn 이 lvlCnt 를 넘는지, ATTRn 에 라벨이 있는지
 * 검사하지 않으므로 화면이 드롭다운 후보 자체를 제한해 막는다). 순수 함수라 단위 시험 대상이다.
 */

export interface DefTargetOption {
  value: string;
  label: string;
}

/** KEY + LVL1~lvlCnt + 라벨이 있는 ATTR01~10 만 후보로 준다. 라벨은 키가 아니라 그 칸의 이름이다. */
export function buildDefTargetOptions(lvlCnt: number, attrLabels: (string | null | undefined)[]): DefTargetOption[] {
  const out: DefTargetOption[] = [{ value: "KEY", label: "키" }];
  for (let i = 1; i <= lvlCnt; i++) {
    out.push({ value: `LVL${i}`, label: `${i}차` });
  }
  attrLabels.forEach((label, idx) => {
    if (label && label.trim()) {
      const no = String(idx + 1).padStart(2, "0");
      out.push({ value: `ATTR${no}`, label: label.trim() });
    }
  });
  return out;
}
