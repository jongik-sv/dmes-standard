"use client";

/**
 * 주문정합성관리 — 포털 pageId mqc:qdf/orderConsistency, 레지스트리 키 qdf/orderConsistency.
 * 포털 레지스트리가 pages/{group}/{leaf}/page.tsx 만 찾으므로 여기는 얇은 래퍼다. 화면 본체는 src/qdf/orderConsistency/OrderConsistencyPage.tsx 에 둔다
 * (이 파일은 고치지 않는다 — 화면 담당은 src/qdf/orderConsistency/ 만 바꾼다).
 */
import type { PageProps } from "@dk-oasis/shared/portal-shell-core";

import { OrderConsistencyPage } from "@/qdf/orderConsistency/OrderConsistencyPage";

export default function Page(props: PageProps) {
  return <OrderConsistencyPage {...props} />;
}
