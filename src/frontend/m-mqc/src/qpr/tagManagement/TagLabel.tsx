/** Tag 양식(100 × 70 mm) 내용 — 코일 번호를 크게, 나머지는 2열 격자. 미리보기 창과 상세 패널이 함께 쓴다. */
import { SheetBigText, SheetMiniFields } from "@/common/print/sheet";
import { num } from "@/qpr/shared/status";

import type { TagRow } from "./types";

export function TagLabel({ tag }: { tag: TagRow }) {
  return (
    <>
      <SheetBigText caption={`${tag.tagKndNm} · ${tag.tagNo}`}>{tag.coilNo}</SheetBigText>
      <SheetMiniFields
        fields={[
          ["품명 · 규격", `${tag.prdLabel ?? "—"} ${tag.specCd ?? ""}`],
          ["두께 × 폭", tag.sizeText],
          ["중량 (kg)", num(tag.wgt)],
          ["주문번호", tag.ordNo],
          ["수요가", tag.cusNm],
          ["Heat", tag.heatNo],
          ["발행", tag.issueAt ?? "미발행"],
          ["프린터 · 매수", `${tag.prtId ?? "—"} · ${tag.copyCnt}매`],
        ]}
      />
    </>
  );
}
