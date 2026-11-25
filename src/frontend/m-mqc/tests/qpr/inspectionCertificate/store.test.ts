/** 검사증명서 화면 상태 — 서버 대역으로 발행·재발행·양식 승인·단건 수정·예외 규칙·이미지·진위 확인 흐름을 확인한다. */
import { beforeEach, describe, expect, it } from "vitest";

import { forge } from "@/qpr/inspectionCertificate/IssuePanel";
import { MtcStore } from "@/qpr/inspectionCertificate/store";

import { FakeMtcServer } from "./fakeApi";

let server: FakeMtcServer;
let store: MtcStore;
beforeEach(async () => {
  server = new FakeMtcServer();
  store = new MtcStore(server.api());
  await store.load();
});

describe("검사증명서 상태", () => {
  it("처음 읽으면 발행본 5건이 최근 발행 먼저, 규칙은 R → S 순서다", () => {
    expect(store.issuedIds()).toEqual(["C4", "C3", "C2", "C1", "C5"]);
    expect(store.data!.rules.map((r) => r.id).slice(0, 3)).toEqual(["R1", "R2", "R3"]);
    expect(store.data!.rules.at(-1)!.id).toBe("S10");
    expect(store.ui.sel).toBe("C1");
  });

  it("신규 수신은 reg → 현재 규칙 계산 → issue 로 발행 목록 맨 위에 온다", async () => {
    const mtc = await store.arrive("C3");
    expect(mtc).toBe("UC1-1-261125-001");
    expect(store.issuedIds()[0]).toBe("N001");
    expect(store.ui.sel).toBe("N001");
    const snap = store.issuedOf("N001")!.snap;
    expect(snap.fk).toBe("es");
    expect(snap.signImg).toBe("Z_MTC_SIGN_20251229.png"); // 오늘 날짜 증명서 → 가장 늦은 발령 서명
    expect(store.issuedOf("N001")!.verifyCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("양식 초안 → 승인 요청 → 승인 이면 적용본 v4, C5 재발행 차이가 생긴다", async () => {
    store.setUi({ formSel: "en" });
    store.setFormText("statement", "We hereby certify");
    expect(store.data!.forms.en.draft).not.toBeNull();
    store.formRequest();
    expect(store.data!.forms.en.pending).toBe(true);
    const v = await store.formApprove();
    expect(v).toBe(4);
    expect(store.data!.forms.en.applied.ver).toBe(4);
    expect(store.data!.forms.en.hist[0].memo).toBe("하단 증명 문구");
    expect(server.calls.filter((c) => c.action === "save").map((c) => (c.params as { act: string }).act)).toContain("FORM_APPROVE");
  });

  it("초안을 적용본과 같게 되돌리면 초안이 사라진다", () => {
    store.setUi({ formSel: "ko" });
    const before = store.data!.forms.ko.applied.title;
    store.setFormText("title", "X");
    store.setFormText("title", before);
    expect(store.data!.forms.ko.draft).toBeNull();
  });

  it("칸 추가는 같은 묶음 옆에 붙고, 순서를 바꿀 수 있다", () => {
    store.setUi({ formSel: "en" });
    store.addCol("Cr");
    const keys = store.data!.forms.en.draft!.cols.map((c) => c.k);
    expect(keys[keys.indexOf("B") + 1]).toBe("Cr");
    store.moveCol(keys.indexOf("heat"), 1);
    expect(store.data!.forms.en.draft!.cols[1].k).toBe("heat");
  });

  it("단건 수정이 있으면 사유를 같이 보내 재발행한다", async () => {
    store.setUi({ ovrSel: "C4" });
    store.setOvrHead("po", "PO-2026-118");
    store.setOvr("reason", "고객 요청 — P/O 번호 추가");
    await store.reissue("C4");
    const I = store.issuedOf("C4")!;
    expect(I.reissueCnt).toBe(1);
    expect(I.reason).toBe("고객 요청 — P/O 번호 추가");
    expect(I.snap.T["h.po"]).toBe("PO-2026-118");
    expect(I.snap.src["h.po"]).toBe("ovr");
  });

  it("사유 없는 단건 수정 재발행은 서버가 막는다", async () => {
    store.setUi({ ovrSel: "C4" });
    store.setOvrHead("po", "PO-1");
    await expect(store.reissue("C4")).rejects.toThrow("수정 사유");
  });

  it("예외 규칙 초안은 미리보기에만, [적용] 하면 계산에 들어간다", () => {
    store.setUi({ rSel: "R3" });
    store.setRuleField("val", "BIS 안내 (IS 15965)");
    expect(store.resolve("C1").T["rm.0"]).toBe("For details of BIS Certification please visit www.bis.gov.in");
    expect(store.resolve("C1", "rule").T["rm.0"]).toBe("BIS 안내 (IS 15965)");
    store.ruleApply();
    expect(store.rule("R3")!.ver).toBe(2);
    expect(store.resolve("C1").T["rm.0"]).toBe("BIS 안내 (IS 15965)");
  });

  it("새 고객 규칙을 만들어 적용하면 그 고객 증명서 REMARK 에 줄이 붙는다", () => {
    store.setUi({ rFilter: "고객" });
    store.ruleAdd();
    expect(store.ui.rSel).toBe("U1");
    store.setRuleField("val", "Packing : Export standard");
    store.ruleApply();
    const lines = Object.entries(store.resolve("C4").T).filter(([k]) => k.startsWith("rm."));
    expect(lines.map(([, v]) => v)).toContain("Packing : Export standard");
  });

  it("이미지를 올리고 그 이미지로 규칙 초안을 만든다", () => {
    const n = store.addImg("new_sign.png", "서명", "data:image/png;base64,AAAA", "업로드");
    expect(store.ui.imgSel).toBe(n);
    store.imgMakeRule();
    const r = store.rule()!;
    expect(store.ui.tab).toBe("rule");
    expect(r.draft!.tgt).toBe("signImg");
    expect(r.draft!.val).toBe(n);
    expect(store.addImg("new_sign.png", "서명", "data:,", "x")).toBe("new_sign_2.png");
  });

  it("진위 확인: 정상 · 위조 흉내 · 재발행 뒤 이전 번호 · 없는 번호", async () => {
    await store.reissue("C1");
    const I = store.issuedOf("C1")!;
    const code = I.verifyCode!;
    expect((await store.confirm(code)).status).toBe("GENUINE");
    expect((await store.confirm(code, I.snap)).status).toBe("GENUINE");
    const f = forge(I.snap);
    expect(f.what).toContain("중량");
    expect((await store.confirm(code, f.snap)).status).toBe("TAMPERED");
    await store.reissue("C1");
    expect((await store.confirm(code)).status).toBe("SUPERSEDED");
    expect((await store.confirm("AAAA-BBBB-CCCC")).status).toBe("NOT_FOUND");
  });

  it("초기화하면 시드로 돌아간다", async () => {
    await store.arrive("C1");
    await store.reset();
    expect(store.issuedIds()).toHaveLength(5);
  });
});
