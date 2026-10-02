import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/**
 * 메모장 유형(스펙 2026-10-02-widget-admin-generic §17). 공용 메모는 관리자가 쓴 글을 모두가 읽고,
 * 개인 메모는 사용자가 홈의 위젯 안에서 쓰고 자기만 본다. 초기 설정은 memo-model.ts MEMO_DEFAULT_CONFIG 와 같다(시험이 같음을 확인).
 */
export const meta: WidgetTypeMeta = {
  id: "memo",
  title: "메모장",
  description: "공용 안내 메모 또는 사용자별 개인 메모(텍스트·md·html)",
  defaultSize: { w: 8, h: 10 },
  minSize: { w: 4, h: 6 },
  initialConfig: { scope: "personal", format: "text", content: "" },
};
