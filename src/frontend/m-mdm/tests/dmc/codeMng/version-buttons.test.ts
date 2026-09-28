// TSK-06-02 design.md §6.12·I25 — 버전 버튼 활성 매트릭스(순수 함수). 권한(canDoButton)은 화면이 따로 더 본다.
// 2026-09-28 통합 D-102: itemEdit(코드 편집)은 옛 itemEdit·cateEdit 두 버튼을 하나로 줄였고, 다른 버전 버튼과 달리
// 버전을 하나 고르면 편집 불가·소유자와 무관하게 늘 켠다 — 그래서 VERSION_KEYS 목록에서 따로 뺀다.
import { describe, expect, it } from "vitest";
import { versionButtons } from "../../../pages/dmc/codeMng/buttons";
import type { CodeEditView, CodeVersionRow } from "../../../pages/dmc/codeMng/edit-types";

function row(ver: string, status: string, ownerId: string | null, extra: Partial<CodeVersionRow> = {}): CodeVersionRow {
  return {
    ver, verLabel: `v${ver}`, verKind: "MAJOR", status, ownerId, applyFrom: null, applyTo: null, releasedAt: null,
    restoredFrom: null, restoredLabel: null, rowVersion: 0, unapplied: status === "DRAFT", description: null,
    ...extra,
  };
}

function view(opts: {
  versions?: CodeVersionRow[];
  unappliedCount?: number;
  canNewMajor?: boolean;
  canNewMinor?: boolean;
  minorLimit?: boolean;
  editable?: boolean;
  sourceKind?: string;
  storedStatus?: string;
  unappliedLabel?: string;
  neverReleased?: boolean;
  canDeleteCode?: boolean;
} = {}): CodeEditView {
  return {
    header: {
      maruCodeId: "PROC_CD", maruCodeName: "공정", description: null, lvlCnt: 0, sourceKind: opts.sourceKind ?? "MDM",
      status: "INUSE",
      storedStatus: opts.storedStatus ?? "INUSE", auditVer: 0, currentVerLabel: "v1.000",
      unappliedLabel: opts.unappliedLabel ?? "없음",
    },
    versions: opts.versions ?? [row("1.000", "RELEASED", "stw1")],
    flags: {
      unappliedCount: opts.unappliedCount ?? 0, canNewMajor: opts.canNewMajor ?? true, canNewMinor: opts.canNewMinor ?? true,
      nextMajor: "2.000", nextMinor: "1.001", minorLimit: opts.minorLimit ?? false, canDeprecate: true,
      editable: opts.editable ?? true, neverReleased: opts.neverReleased, canDeleteCode: opts.canDeleteCode,
    },
    restoreSources: ["1.000"],
    me: "me",
    steward: true,
  };
}

const VERSION_KEYS = ["delete", "lock", "unlock", "handover", "confirmMove"] as const;

describe("versionButtons", () => {
  it("미적용 0개·RELEASED 선택: 새 버전·헤더 저장·폐기·코드 편집만 활성", () => {
    const b = versionButtons(view(), "1.000");
    expect(b.newMajor.enabled).toBe(true);
    expect(b.newMinor.enabled).toBe(true);
    expect(b.headerSave.enabled).toBe(true);
    expect(b.deprecate.enabled).toBe(true);
    expect(b.itemEdit.enabled).toBe(true);
    for (const k of VERSION_KEYS) expect(b[k].enabled, k).toBe(false);
    expect(b.warning).toBeNull();
  });

  it("버전을 고르지 않으면 코드 편집도 비활성", () => {
    const b = versionButtons(view(), null);
    expect(b.itemEdit.enabled).toBe(false);
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

  it("DEPRECATED·EXTERNAL(편집 불가)은 버전 버튼 모두 비활성이지만 코드 편집은 선택만 있으면 켜진다", () => {
    const deprecated = versionButtons(view({ storedStatus: "DEPRECATED", canNewMajor: false, canNewMinor: false }), "1.000");
    expect(deprecated.newMajor.enabled).toBe(false);
    expect(deprecated.deprecate.enabled).toBe(false);
    expect(deprecated.itemEdit.enabled).toBe(true);

    // 편집 불가의 두 원인을 나눈다 — 원천 EXTERNAL(I8)과 담당자 아님(I12). 둘 다 쓰기를 잠그지만 해제만 예외다(ADR-0002 D3).
    const external = versionButtons(
      view({ editable: false, sourceKind: "EXTERNAL", versions: [row("1.000", "DRAFT", "me")], unappliedCount: 1 }),
      "1.000",
    );
    for (const k of [...VERSION_KEYS, "newMajor", "newMinor", "headerSave", "deprecate"] as const) {
      expect(external[k].enabled, k).toBe(false);
    }
    expect(external.itemEdit.enabled, "편집 불가여도 코드 편집은 읽기 전용으로 켠다").toBe(true);
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
    expect(b.lock.enabled).toBe(false);
  });

  it("소유자 없는 DRAFT: 선점만(코드 편집은 선택만 있으면 켠다)", () => {
    const b = versionButtons(view({ versions: [row("1.001", "DRAFT", null)], unappliedCount: 1, canNewMajor: false, canNewMinor: false }), "1.001");
    expect(b.lock.enabled).toBe(true);
    for (const k of ["delete", "unlock", "handover", "confirmMove"] as const) expect(b[k].enabled, k).toBe(false);
    expect(b.itemEdit.enabled).toBe(true);
  });

  it("남의 DRAFT: 버전 조작 버튼은 모두 비활성이지만 코드 편집은 켠다", () => {
    const b = versionButtons(view({ versions: [row("1.001", "DRAFT", "other")], unappliedCount: 1, canNewMajor: false, canNewMinor: false }), "1.001");
    for (const k of VERSION_KEYS) expect(b[k].enabled, k).toBe(false);
    expect(b.itemEdit.enabled).toBe(true);
  });

  it("미적용 2개: 경고 + 내 DRAFT 삭제만(선점·해제·넘기기·확정 이동·새버전·헤더 저장·폐기 비활성)", () => {
    const versions = [row("1.002", "DRAFT", "other"), row("1.001", "DRAFT", "me"), row("1.000", "RELEASED", "x")];
    const b = versionButtons(view({ versions, unappliedCount: 2, canNewMajor: false, canNewMinor: false }), "1.001");
    expect(b.warning).toBe("미적용 버전이 2개입니다. 하나를 삭제하세요");
    expect(b.delete.enabled).toBe(true);
    for (const k of ["lock", "unlock", "handover", "confirmMove", "newMajor", "newMinor", "headerSave", "deprecate"] as const) {
      expect(b[k].enabled, k).toBe(false);
    }
    const free = versionButtons(view({ versions: [row("1.002", "DRAFT", null), row("1.001", "DRAFT", "me")], unappliedCount: 2 }), "1.002");
    expect(free.lock.enabled).toBe(false);
  });

  it("해제(unlock)만 담당자 게이트 밖이다 — 내가 소유한 DRAFT 면 roles.editable=false 여도 켜진다(ADR-0002 D3)", () => {
    // 재현 조건: TB_MDM_CODE_VER.OWNER_ID='admin' 인 PROC_CD 2.000 DRAFT 를 소유자 본인(admin)이 열었는데
    // 담당자(MDM_STEWARD) 역할이 없어 flags.editable=false → 편집자·선점·넘기기·확정 이동은 꺼지고,
    // 해제까지 꺼져 DRAFT 가 영구히 묶였다. 해제만 소유자(owner_id) 판정으로 되돌린다.
    const b = versionButtons(
      view({ versions: [row("2.000", "DRAFT", "me")], unappliedCount: 1, editable: false, canNewMajor: false, canNewMinor: false }),
      "2.000",
    );
    expect(b.unlock.enabled, "내 DRAFT 해제는 역할과 무관해야 한다").toBe(true);
    // 나머지 쓰기 액션은 I12 담당자 게이트를 유지한다.
    for (const k of ["delete", "lock", "handover", "confirmMove"] as const) expect(b[k].enabled, k).toBe(false);
    expect(b.itemEdit.enabled).toBe(true);
  });

  it("해제도 원천이 EXTERNAL 이면 꺼진다(I8)", () => {
    const b = versionButtons(
      view({ versions: [row("2.000", "DRAFT", "me")], unappliedCount: 1, sourceKind: "EXTERNAL" }),
      "2.000",
    );
    expect(b.unlock.enabled).toBe(false);
  });

  it("담당자가 아니어도 남의 DRAFT 의 해제는 꺼진다(해제는 소유자 전용, MDM003)", () => {
    const b = versionButtons(
      view({ versions: [row("2.000", "DRAFT", "other")], unappliedCount: 1, editable: false }),
      "2.000",
    );
    expect(b.unlock.enabled).toBe(false);
  });

  // ── 확정 취소(ADR-0002 D8, TSK-02-01 D4-1) ──
  // 확정 취료를 "RELEASED 면 전부 꺼짐" 규칙과 분리한다 — 미래 적용 RELEASED 에서 켜져야 하므로(아래 시험).
  // ── 확정 취소(ADR-0002 D8, TSK-02-01 D4-1) ──
  // 확정 취료를 "RELEASED 면 전부 꺼짐" 규칙과 분리한다 — 미래 적용 RELEASED 에서 켜져야 하므로(아래 시험).
  it("확정 취소는 서버 판정값(cancelConfirmable)이 true 일 때만 켜진다", () => {
    const future = row("2.000", "RELEASED", "me", { cancelConfirmable: true, applyFrom: "2026-12-01 00:00:00" });
    const b = versionButtons(view({ versions: [future], unappliedCount: 1 }), "2.000");
    expect(b.cancelConfirm.enabled).toBe(true);
    // 다른 버전 조작은 그대로 꺼진다(DRAFT 전용).
    for (const k of VERSION_KEYS) expect(b[k].enabled, k).toBe(false);
  });

  it("확정 취소 판정값이 없거나 false 면 꺼진다 — 화면이 자체 재계산하지 않는다", () => {
    // 적용 시각 경계·미적용 개수·소유자 판정을 화면에서 다시 하면 서버와 어긋난다.
    const noFlag = versionButtons(view({ versions: [row("2.000", "RELEASED", "me")] }), "2.000");
    expect(noFlag.cancelConfirm.enabled, "판정값 없음").toBe(false);
    const falseFlag = versionButtons(
      view({ versions: [row("2.000", "RELEASED", "me", { cancelConfirmable: false })] }), "2.000",
    );
    expect(falseFlag.cancelConfirm.enabled, "false").toBe(false);
    // 남의 소유 버전이어도 서버가 true 라면 화면은 따른다.
    const otherOwner = versionButtons(
      view({ versions: [row("2.000", "RELEASED", "other", { cancelConfirmable: true })] }), "2.000",
    );
    expect(otherOwner.cancelConfirm.enabled, "서버 판정을 따른다").toBe(true);
  });

  it("RELEASED·CANCELLED 선택: 버전 조작 버튼 비활성, 코드 편집은 켠다", () => {
    for (const status of ["RELEASED", "CANCELLED"]) {
      const b = versionButtons(view({ versions: [row("1.000", status, "me")] }), "1.000");
      for (const k of VERSION_KEYS) expect(b[k].enabled, `${status} ${k}`).toBe(false);
      expect(b.cancelConfirm.enabled, status).toBe(false);
      expect(b.itemEdit.enabled, status).toBe(true);
    }
  });
});
