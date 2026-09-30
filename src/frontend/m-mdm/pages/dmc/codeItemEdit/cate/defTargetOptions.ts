/**
 * REGEX defTarget 후보 — 마스터코드(`CategoryOwner.MASTER_CODE`)용. dmd 의 동명이 파일과 같은 규칙이다.
 *
 * 서버 허용 집합은 `CategoryOwner.MASTER_CODE.allowedDefTargets()` = CODE·LVL1~LVL5·ATTR01~ATTR10 이고 KEY·NAME 은
 * 없다. 화면은 이 중에서도 정의에 실제로 있는 칸만 준다 — 서버 `cateDefIssues` 는 LVLn 이 lvlCnt 를 넘거나 ATTRn 에
 * 라벨이 없는 것을 막지 않으므로, 후보를 좁히는 책임은 화면에 있다(dmd `defTargetOptions.ts` 와 짝).
 *
 * 저장은 키(CODE·LVL1·ATTRnn)로 하지만 화면에는 사람이 읽는 이름(코드·1차·공장)을 보여준다 — 코드 그리드의 열 머리
 * 라벨(`cell()` 의 `${i + 1}차`·`a.label`)과 같은 말을 쓴다.
 */

export interface DefTargetOption {
  value: string;
  label: string;
}

/** 라벨 있는 추가 컬럼 하나 — 서버는 `[{ no, label }]` 로 준다. */
export interface AttrLabel {
  no: number;
  label: string;
}

/** CODE + LVL1~lvlCnt + 라벨이 있는 ATTR 만 후보로 준다. 라벨은 키가 아니라 그 칸의 이름이다. */
export function buildDefTargetOptions(lvlCnt: number, attrLabels: AttrLabel[]): DefTargetOption[] {
  const out: DefTargetOption[] = [{ value: "CODE", label: "코드" }];
  for (let i = 1; i <= lvlCnt; i++) {
    out.push({ value: `LVL${i}`, label: `${i}차` });
  }
  attrLabels.forEach((a) => {
    if (!a?.label || !a.label.trim()) return;
    out.push({ value: `ATTR${String(a.no).padStart(2, "0")}`, label: a.label.trim() });
  });
  return out;
}
