// 출력물 화면의 순수 도우미와 인쇄 양식 — 재발행 대상 가르기, 판정값 JSON, 상태 톤, 양식이 실은 값.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { buildValuesJson } from "@/qjd/qualityJudgment/api";
import { CertificateSheet } from "@/qpr/qualityCertificate/CertificateSheet";
import type { CertDetail } from "@/qpr/qualityCertificate/types";
import { MtcSheet } from "@/qpr/inspectionCertificate/MtcSheet";
import type { MtcDetail } from "@/qpr/inspectionCertificate/types";
import { toneOf } from "@/qpr/shared/status";
import { reissueParams } from "@/qpr/tagManagement/api";
import { isTagNo } from "@/qpr/tagManagement/types";

describe("재발행 대상", () => {
  it("T- 로 시작하면 Tag번호, 아니면 코일번호로 보낸다", () => {
    expect(isTagNo("T-2609-00110")).toBe(true);
    expect(isTagNo("C260901003")).toBe(false);
    expect(reissueParams({ target: " T-2609-00110 ", reasonCd: "LOST", prtId: "", copies: "2", note: " 분실 " })).toEqual({
      tagNo: "T-2609-00110",
      reasonCd: "LOST",
      prtId: "",
      copies: "2",
      note: "분실",
    });
    expect(reissueParams({ target: "C260901003", reasonCd: "DAMAGE", prtId: "PRT-CGL5-01", copies: "1", note: "" }).coilNo).toBe("C260901003");
  });
});

describe("판정 계산 입력", () => {
  it("고친 값만 JSON 으로, 없으면 빈 문자열", () => {
    expect(buildValuesJson({})).toBe("");
    expect(JSON.parse(buildValuesJson({ YP: " 268 ", THK: "" }))).toEqual({ YP: "268", THK: "" });
  });
});

describe("상태 톤", () => {
  it("합격·발행은 success, 불합격·회수는 danger, 보류·초안은 warning, 모르는 값은 neutral", () => {
    expect(toneOf("PASS")).toBe("success");
    expect(toneOf("ISSUED")).toBe("success");
    expect(toneOf("FAIL")).toBe("danger");
    expect(toneOf("RECALLED")).toBe("danger");
    expect(toneOf("HOLD")).toBe("warning");
    expect(toneOf("DRAFT")).toBe("warning");
    expect(toneOf("??")).toBe("neutral");
  });
});

const QC: CertDetail = {
  cert: {
    qcNo: "QC-2609-0101",
    docRev: 1,
    revText: "v1",
    ordNo: "D260831014-010",
    cusNm: "수요가 A",
    poNo: "PO-A-77812",
    prdLabel: "3 : CCGI",
    specCd: "KS3-CGCC",
    sizeText: "0.450 × 1490",
    coilCount: 1,
    totalWgt: 9340,
    tmplCd: "KS",
    tmplNm: "KS 표준",
    langCd: "KO",
    langNm: "국문",
    status: "DRAFT",
    statusNm: "초안",
    reqBy: "박서연",
    reqAt: "2026-09-02 08:30",
    issueBy: null,
    issueAt: null,
    issueDate: null,
    note: null,
  },
  coils: [{ coilNo: "C260901001", sizeText: "0.450 × 1490", wgt: 9340, heatNo: "5A1207", status: "WAIT", statusNm: "판정대기", yp: null, ts: 312, el: 34, coat: 96 }],
  guarantee: [{ itemCd: "TS", itemNm: "인장강도 TS (MPa)", basis: "규격 하한 이상", critTxt: "270~", value: "312", result: "PASS", resultNm: "합" }],
  actions: { canIssue: false, canReissue: false, canCancel: true, blockReason: "합격하지 않은 코일이 있습니다: C260901001(판정대기)" },
  history: [],
};

describe("인쇄 양식", () => {
  it("품질보증서: 초안 표시, 수요가·PO·코일·보증 항목을 싣는다", () => {
    const html = renderToStaticMarkup(<CertificateSheet detail={QC} />);
    expect(html).toContain("초안 — 발행 전 미리보기");
    expect(html).toContain("품 질 보 증 서");
    expect(html).toContain("PO-A-77812");
    expect(html).toContain("C260901001");
    expect(html).toContain("9,340");
    expect(html).toContain("규격 하한 이상 (270~)");
  });

  it("품질보증서: 영문 양식은 영문 라벨", () => {
    const html = renderToStaticMarkup(<CertificateSheet detail={{ ...QC, cert: { ...QC.cert, langCd: "EN", status: "ISSUED", issueDate: "2026-09-02" } }} />);
    expect(html).toContain("QUALITY CERTIFICATE");
    expect(html).toContain("Customer");
    expect(html).not.toContain("미리보기");
  });

  it("검사증명서: 화학 성분을 원소별 칸으로 싣는다", () => {
    const mtc: MtcDetail = {
      cert: {
        mtcNo: "MTC-260901-07",
        stdCd: "KS D 3506",
        coilNo: "C260901003",
        heatNo: "5A1198",
        ordNo: "D260831021-010",
        cusNm: "수요가 C",
        prdLabel: "G : GI",
        specCd: "KSG-SGC340",
        sizeText: "0.440 × 1225",
        wgt: 7820,
        yp: 312,
        ts: 398,
        el: 29,
        coat: 104,
        fixed: true,
        status: "ISSUED",
        statusNm: "발행",
        judgStatus: "PASS",
        judgStatusNm: "합격",
        inspDate: "2026-09-01",
        inspBy: "박서연",
        srcCd: "SELF",
        srcNm: "자체 시험",
        langCd: "KO",
        langNm: "국문",
        docRev: 1,
        reqBy: "박서연",
        reqAt: "2026-09-01 17:10",
        issueBy: "박서연",
        issueAt: "2026-09-01 17:20",
        note: null,
      },
      mech: [{ itemCd: "YP", itemNm: "항복강도 YP (MPa)", critTxt: "245~", value: 312, result: "PASS", resultNm: "합" }],
      chemistry: [
        { elemCd: "C", value: 0.052 },
        { elemCd: "Mn", value: 0.24 },
      ],
      actions: { canIssue: false, canReissue: true, canCancel: true, blockReason: null },
      history: [],
    };
    const html = renderToStaticMarkup(<MtcSheet detail={mtc} />);
    expect(html).toContain("검 사 증 명 서");
    expect(html).toContain("5A1198");
    expect(html).toContain("0.052");
    expect(html).toContain("2026-09-01");
  });
});
