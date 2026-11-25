"use client";

/**
 * 주문단중에러관리 — 포털 pageId mqc:qdf/orderWeightError, 레지스트리 키 qdf/orderWeightError.
 * 포털 레지스트리가 pages/{group}/{leaf}/page.tsx 만 찾으므로 여기는 얇은 래퍼다. 화면 본체는 src/qdf/orderWeightError/OrderWeightErrorPage.tsx 에 둔다
 * (이 파일은 고치지 않는다 — 화면 담당은 src/qdf/orderWeightError/ 만 바꾼다).
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { OrderWeightErrorPage } from "@/qdf/orderWeightError/OrderWeightErrorPage";

export default function Page(props: PageProps) {
  return <OrderWeightErrorPage {...props} />;
}
