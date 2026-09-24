// TSK-06-02 design.md §6.12·I25 — 버전 버튼 활성 매트릭스(순수 함수). 권한(canDoButton)은 화면이 따로 더 본다.
import { describe, expect, it } from "vitest";
import { versionButtons } from "../../../pages/dmc/codeEdit/buttons";
import type { CodeEditView, CodeVersionRow } from "../../../pages/dmc/codeEdit/types";

function row(ver: string, status: string, ownerId: string | null): CodeVersionRow {
  return {
    ver, verLabel: `v${ver}`, verKind: "MAJOR", status, ownerId, applyFrom: null, applyTo: null, releasedAt: null,
    restoredFrom: null, restoredLabel: null, rowVersion: 0, unapplied: status === "DRAFT", description: null,
  };
}

function view(opts: {
  versions?: CodeVersionRow[];
  unappliedCount?: number;
  canNewMajor?: boolean;
  canNewMinor?: boolean;
  minorLimit?: boolean;
  editable?: boolean;
  storedStatus?: string;
  unappliedLabel?: string;
} = {}): CodeEditView {
  return {
    header: {
      maruCodeId: "PROC_CD", maruCodeName: "공정", description: null, lvlCnt: 0, sourceKind: "MDM", status: "INUSE",
      storedStatus: opts.storedStatus ?? "INUSE", auditVer: 0, currentVerLabel: "v1.000",
      unappliedLabel: opts.unappliedLabel ?? "없음",
    },
    versions: opts.versions ?? [row("1.000", "RELEASED", "stw1")],
    flags: {
      unappliedCount: opts.unappliedCount ?? 0, canNewMajor: opts.canNewMajor ?? true, canNewMinor: opts.canNewMinor ?? true,
      nextMajor: "2.000", nextMinor: "1.001", minorLimit: opts.minorLimit ?? false, canDeprecate: true,
      editable: opts.editable ?? true,
    },
    restoreSources: ["1.000"],
    me: "me",
    steward: true,
  };
}

const VERSION_KEYS = ["delete", "lock", "unlock", "handover", "confirmMove", "itemEdit", "cateEdit"] as const;

describe("versionButtons", () => {
  it("미적용 0개·RELEASED 선택: 새 버전·헤더 저장·폐기만 활성", () => {
    const b = versionButtons(view(), "1.000");
    expect(b.newMajor.enabled).toBe(true);
    expect(b.newMinor.enabled).toBe(true);
    expect(b.headerSave.enabled).toBe(true);
    expect(b.deprecate.enabled).toBe(true);
    for (const k of VERSION_KEYS) expect(b[k].enabled, k).toBe(false);
    expect(b.warning).toBeNull();
  });

  it("미적용이 있으면 새 버전 비활성 + 안내, 폐기 비활성", () => {
    const b = versionButtons(
      view({ versions: [row("1.001", "DRAFT", "me"), row("1.000", "RELEASED", "x")], unappliedCount: 1,
        canNewMajor: false, canNewMinor: false, unappliedLabel: "v1.001 DRAFT" }),
      null,
    );
    expect(b.newMajor.enabled).toBe(false);
    expect(b.newMinor.enabled).toBe(false);
    expect(b.newVersionHint).toBe("미적용 버전 v1.001 DRAFT 이 있어 새 버전을 만들 수 없습니다");
    expect(b.deprecate.enabled).toBe(false);
    expect(b.headerSave.enabled).toBe(true);
  });

  it("DEPRECATED·EXTERNAL(편집 불가)은 모두 비활성", () => {
    const deprecated = versionButtons(view({ storedStatus: "DEPRECATED", canNewMajor: false, canNewMinor: false }), "1.000");
    expect(deprecated.newMajor.enabled).toBe(false);
    expect(deprecated.deprecate.enabled).toBe(false);
    const external = versionButtons(view({ editable: false, versions: [row("1.000", "DRAFT", "me")], unappliedCount: 1 }), "1.000");
    for (const k of [...VERSION_KEYS, "newMajor", "newMinor", "headerSave", "deprecate"] as const) {
      expect(external[k].enabled, k).toBe(false);
    }
  });

  it("버전이 없으면 minor 비활성·major 활성", () => {
    const b = versionButtons(view({ versions: [], canNewMinor: false }), null);
    expect(b.newMajor.enabled).toBe(true);
    expect(b.newMinor.enabled).toBe(false);
  });

  it("minorLimit 이면 minor 비활성 + major 를 올리십시오", () => {
    const b = versionButtons(view({ canNewMinor: false, minorLimit: true }), null);
    expect(b.newMinor.enabled).toBe(false);
    expect(b.newMinor.hint).toBe("major 를 올리십시오");
    expect(b.newVersionHint).toBe("major 를 올리십시오");
  });

  it("내 DRAFT 선택: 삭제·해제·넘기기·확정 이동·코드 편집 활성, 선점 비활성", () => {
    const b = versionButtons(view({ versions: [row("1.001", "DRAFT", "me")], unappliedCount: 1, canNewMajor: false, canNewMinor: false }), "1.001");
    expect(b.delete.enabled).toBe(true);
    expect(b.unlock.enabled).toBe(true);
    expect(b.handover.enabled).toBe(true);
    expect(b.confirmMove.enabled).toBe(true);
    expect(b.itemEdit.enabled).toBe(true);
    expect(b.cateEdit.enabled).toBe(true);
    expect(b.lock.enabled).toBe(false);
  });

  it("소유자 없는 DRAFT: 선점만", () => {
    const b = versionButtons(view({ versions: [row("1.001", "DRAFT", null)], unappliedCount: 1, canNewMajor: false, canNewMinor: false }), "1.001");
    expect(b.lock.enabled).toBe(true);
    for (const k of ["delete", "unlock", "handover", "confirmMove", "itemEdit", "cateEdit"] as const) expect(b[k].enabled, k).toBe(false);
  });

  it("남의 DRAFT: 버전 버튼 모두 비활성", () => {
    const b = versionButtons(view({ versions: [row("1.001", "DRAFT", "other")], unappliedCount: 1, canNewMajor: false, canNewMinor: false }), "1.001");
    for (const k of VERSION_KEYS) expect(b[k].enabled, k).toBe(false);
  });

  it("미적용 2개: 경고 + 내 DRAFT 삭제만(선점·해제·넘기기·확정 이동·코드 편집·새버전·헤더 저장·폐기 비활성)", () => {
    const versions = [row("1.002", "DRAFT", "other"), row("1.001", "DRAFT", "me"), row("1.000", "RELEASED", "x")];
    const b = versionButtons(view({ versions, unappliedCount: 2, canNewMajor: false, canNewMinor: false }), "1.001");
    expect(b.warning).toBe("미적용 버전이 2개입니다. 하나를 삭제하세요");
    expect(b.delete.enabled).toBe(true);
    for (const k of ["lock", "unlock", "handover", "confirmMove", "itemEdit", "cateEdit", "newMajor", "newMinor", "headerSave", "deprecate"] as const) {
      expect(b[k].enabled, k).toBe(false);
    }
    const free = versionButtons(view({ versions: [row("1.002", "DRAFT", null), row("1.001", "DRAFT", "me")], unappliedCount: 2 }), "1.002");
    expect(free.lock.enabled).toBe(false);
  });

  it("RELEASED·CANCELLED 선택: 버전 버튼 비활성", () => {
    for (const status of ["RELEASED", "CANCELLED"]) {
      const b = versionButtons(view({ versions: [row("1.000", status, "me")] }), "1.000");
      for (const k of VERSION_KEYS) expect(b[k].enabled, `${status} ${k}`).toBe(false);
    }
  });
});
