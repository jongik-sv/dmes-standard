/**
 * 검사증명서(MTC) 인쇄 양식(A4) — 머리(코일·Heat·적용 규격), 기계적 성질 표, 화학 성분 표(가로), 서명란.
 * 발행 전(검토중·보류)은 지금 검사값을 보이고 미리보기 표시를 붙인다.
 */
import { SheetFields, SheetHeader, SheetNote, SheetSection, SheetSignature, SheetTable, SheetWatermark } from "@/common/print/sheet";
import { num } from "@/qpr/shared/status";

import type { MtcDetail } from "./types";

export function MtcSheet({ detail }: { detail: MtcDetail }) {
  const c = detail.cert;
  const en = c.langCd === "EN";
  const watermark = c.status === "REVIEW" ? "검토중 — 발행 전 미리보기" : c.status === "HOLD" ? "보류 — 효력 없음" : null;
  const chemRow: Record<string, unknown> = {};
  for (const ch of detail.chemistry) chemRow[ch.elemCd] = ch.value;
  return (
    <>
      {watermark ? <SheetWatermark text={watermark} /> : null}
      <SheetHeader
        title={en ? "INSPECTION CERTIFICATE" : "검 사 증 명 서"}
        subtitle={en ? "Mill Test Certificate (EN 10204 3.1)" : "Mill Test Certificate"}
        issuer="DMES 품질보증"
        docNo={`${c.mtcNo}${c.docRev > 1 ? ` (rev.${c.docRev})` : ""}`}
      />
      <SheetFields
        fields={[
          [en ? "Certificate No." : "증명서번호", c.mtcNo],
          [en ? "Standard" : "적용 규격", c.stdCd],
          [en ? "Coil No." : "코일번호", c.coilNo],
          [en ? "Heat No." : "Heat No.", c.heatNo],
          [en ? "Customer" : "수요가", c.cusNm],
          [en ? "Order No." : "주문번호", c.ordNo],
          [en ? "Product" : "품명 · 규격", [c.prdLabel, c.specCd].filter(Boolean).join(" · ")],
          [en ? "Size (mm)" : "두께 × 폭", c.sizeText],
          [en ? "Weight (kg)" : "중량 (kg)", num(c.wgt)],
          [en ? "Test Source" : "시험 성적 출처", c.srcNm],
          [en ? "Inspection Date" : "검사일", c.inspDate],
          [en ? "Issue Date" : "발행일", c.issueAt?.slice(0, 10) ?? "—"],
        ]}
      />
      <SheetSection title={en ? "Mechanical Properties" : "기계적 성질"}>
        <SheetTable
          columns={[
            { key: "itemNm", header: en ? "Item" : "항목" },
            { key: "critTxt", header: en ? "Requirement" : "기준", align: "center" },
            { key: "value", header: en ? "Result" : "시험값", align: "right" },
            { key: "resultNm", header: en ? "Judge" : "판정", align: "center", width: 60 },
          ]}
          rows={detail.mech}
        />
      </SheetSection>
      <SheetSection title={en ? "Chemical Composition (wt%)" : "화학 성분 (wt%)"}>
        <SheetTable columns={detail.chemistry.map((ch) => ({ key: ch.elemCd, header: ch.elemCd, align: "center" as const }))} rows={detail.chemistry.length ? [chemRow] : []} />
      </SheetSection>
      <SheetNote>
        {en
          ? "We hereby certify that the material described above has been tested and complies with the requirements of the standard."
          : "위 제품은 적용 규격에 따라 시험·검사되었으며 그 결과가 위와 같음을 증명합니다."}
      </SheetNote>
      <SheetSignature labels={en ? ["Inspector", "QA Manager"] : ["검사원", "품질보증팀장"]} date={c.issueAt?.slice(0, 10)} />
    </>
  );
}
