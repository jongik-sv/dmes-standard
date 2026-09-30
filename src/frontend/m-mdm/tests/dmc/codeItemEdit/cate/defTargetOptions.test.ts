// 마스터코드(04) 대상 칸 후보 — 서버 CategoryOwner.MASTER_CODE 허용 집합(CODE·LVLn·ATTRn) 안에 definition 만 준다.
// KEY·NAME 은 이 영역의 허용값이 아니다(CategoryOwner.MASTER_CODE.allowedDefTargets 에 없음).
import { describe, expect, it } from "vitest";
import { buildDefTargetOptions } from "../../../../pages/dmc/codeItemEdit/cate/defTargetOptions";

describe("buildDefTargetOptions (마스터코드)", () => {
  it("CODE 는 항상 있고, lvlCnt 만큼 LVLn 이 붙는다", () => {
    expect(buildDefTargetOptions(2, []).map((o) => o.value)).toEqual(["CODE", "LVL1", "LVL2"]);
  });

  it("lvlCnt 가 0 이면 CODE 만 남는다", () => {
    expect(buildDefTargetOptions(0, []).map((o) => o.value)).toEqual(["CODE"]);
  });

  it("저장은 키로 하고 화면에는 그 칸의 이름을 보여준다", () => {
    // PROC_CD: attr01=공장, attr02=공정 그룹
    expect(buildDefTargetOptions(2, [{ no: 1, label: "공장" }, { no: 2, label: "공정 그룹" }])).toEqual([
      { value: "CODE", label: "코드" },
      { value: "LVL1", label: "1차" },
      { value: "LVL2", label: "2차" },
      { value: "ATTR01", label: "공장" },
      { value: "ATTR02", label: "공정 그룹" },
    ]);
  });

  it("STEEL_STD 처럼 lvlCnt 만큼 1차·2차·3차가 이름을 갖는다", () => {
    expect(buildDefTargetOptions(3, [{ no: 1, label: "인장강도" }]).map((o) => o.label))
      .toEqual(["코드", "1차", "2차", "3차", "인장강도"]);
  });

  it("라벨이 빈 attr 은 후보에서 빠진다", () => {
    const options = buildDefTargetOptions(0, [{ no: 1, label: "공장" }, { no: 2, label: "  " }]);
    expect(options.map((o) => o.value)).toEqual(["CODE", "ATTR01"]);
  });

  it("서버가 거부하는 KEY·NAME 은 절대 후보에 없다", () => {
    const values = buildDefTargetOptions(5, [{ no: 1, label: "공장" }]).map((o) => o.value);
    expect(values).not.toContain("KEY");
    expect(values).not.toContain("NAME");
  });
});
