/**
 * 품질보증서 인쇄 양식(A4 한 장) — 머리(수요가·PO·주문·규격), 실린 코일 표, 보증 항목 표, 서명란.
 * 영문(EN) 양식은 라벨을 영문으로 바꾼다. 초안·회수 상태는 미리보기 표시를 붙인다.
 */
import { SheetFields, SheetHeader, SheetNote, SheetSection, SheetSignature, SheetTable, SheetWatermark } from "@/common/print/sheet";
import { num } from "@/qpr/shared/status";

import type { CertDetail } from "./types";

const KO = {
  title: "품 질 보 증 서",
  sub: "QUALITY CERTIFICATE",
  no: "보증서번호",
  cus: "수요가",
  po: "발주번호(PO)",
  ord: "주문번호",
  prd: "품명 · 규격",
  size: "두께 × 폭",
  tmpl: "양식",
  date: "발행일",
  coils: "대상 코일",
  guarantee: "보증 항목",
  statement: "위 제품은 해당 규격과 주문 조건에 따라 제조·검사되었으며 그 품질을 보증합니다.",
  sign: ["담당", "검사원", "품질보증팀장"],
};
const EN = {
  title: "QUALITY CERTIFICATE",
  sub: "품질보증서",
  no: "Certificate No.",
  cus: "Customer",
  po: "PO No.",
  ord: "Order No.",
  prd: "Product · Spec.",
  size: "Thk × Width",
  tmpl: "Template",
  date: "Issue Date",
  coils: "Coils",
  guarantee: "Guaranteed Properties",
  statement: "We hereby certify that the products were manufactured and inspected in accordance with the specification and order.",
  sign: ["Prepared", "Inspector", "QA Manager"],
};

export function CertificateSheet({ detail }: { detail: CertDetail }) {
  const c = detail.cert;
  const t = c.langCd === "EN" ? EN : KO;
  const watermark = c.status === "DRAFT" ? "초안 — 발행 전 미리보기" : c.status === "RECALLED" ? "회수된 보증서 — 효력 없음" : null;
  return (
    <>
      {watermark ? <SheetWatermark text={watermark} /> : null}
      <SheetHeader title={t.title} subtitle={t.sub} issuer="DMES 품질보증" docNo={`${c.qcNo} ${c.revText}`} />
      <SheetFields
        fields={[
          [t.no, `${c.qcNo} (${c.revText})`],
          [t.cus, c.cusNm],
          [t.po, c.poNo],
          [t.ord, c.ordNo],
          [t.prd, [c.prdLabel, c.specCd].filter(Boolean).join(" · ")],
          [t.size, c.sizeText],
          [t.tmpl, c.tmplNm],
          [t.date, c.issueDate ?? "—"],
        ]}
      />
      <SheetSection title={`${t.coils} (${detail.coils.length})`}>
        <SheetTable
          columns={[
            { key: "no", header: "No", align: "center", width: 36 },
            { key: "coilNo", header: "Coil No.", align: "center" },
            { key: "sizeText", header: t.size, align: "center" },
            { key: "wgtText", header: "Weight (kg)", align: "right" },
            { key: "heatNo", header: "Heat No.", align: "center" },
            { key: "yp", header: "YP (MPa)", align: "right" },
            { key: "ts", header: "TS (MPa)", align: "right" },
            { key: "el", header: "EL (%)", align: "right" },
            { key: "coat", header: "Coating (g/㎡)", align: "right" },
          ]}
          rows={detail.coils.map((r, i) => ({ ...r, no: i + 1, wgtText: num(r.wgt) }))}
        />
      </SheetSection>
      <SheetSection title={t.guarantee}>
        <SheetTable
          columns={[
            { key: "itemNm", header: "항목 / Item" },
            { key: "crit", header: "기준 / Requirement", align: "center" },
            { key: "value", header: "대표값 / Result", align: "right" },
            { key: "resultNm", header: "판정", align: "center", width: 60 },
          ]}
          rows={detail.guarantee.map((g) => ({ ...g, crit: g.critTxt ? `${g.basis} (${g.critTxt})` : g.basis }))}
        />
      </SheetSection>
      <SheetNote>{t.statement}</SheetNote>
      <SheetSignature labels={t.sign} date={c.issueDate ?? undefined} />
    </>
  );
}
