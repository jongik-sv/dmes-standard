import type { WidgetTypeMeta } from "@dk-oasis/shared/widget";

/**
 * AI 챗봇 유형(스펙 2026-10-02-widget-admin-generic §6·§9). 생성 스크립트는 이 파일의 첫 id 문자열을 폴더 이름과 맞춰 보므로
 * 값은 아래 한 번만 쓴다. 초기 설정은 chat-model.ts normalizeChatConfig 의 기본값과 같다(시험이 같음을 확인).
 */
export const meta: WidgetTypeMeta = {
  id: "chat",
  title: "AI 챗봇",
  description: "AI 와 대화하고 포털 화면 안내·데이터 질의를 받는 챗봇",
  defaultSize: { w: 8, h: 18 },
  minSize: { w: 6, h: 10 },
  bodyPadding: false,
  initialConfig: {
    systemPrompt: "",
    welcome: "무엇을 도와드릴까요?",
    pageGuide: true,
    dataQueryDefIds: [],
  },
};
