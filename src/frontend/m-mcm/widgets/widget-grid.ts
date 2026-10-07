/**
 * 위젯 안 AgDataGrid 의 개인화 속성 — 배치 인스턴스(`instanceId`)마다 저장 키를 나눠 「그리드 설정」 메뉴(컬럼 설정·자동 설정 저장·설정 초기화)를 켠다.
 * 같은 유형을 한 탭에 여러 번 놓아도 `gridId` 가 인스턴스마다 달라 키가 겹치지 않는다(저장 키 `dmes:grid:v1:{userId}:{화면}:{gridId}`).
 * 인스턴스 ID 는 배치할 때 한 번 만들어져 레이아웃에 저장되므로 새로 고침해도 그대로다. 위젯을 지우고 다시 놓거나 탭을 가져오기하면 새 ID 라 설정이 처음부터 시작한다.
 * 관리 화면 미리보기(`preview`)는 실제 배치가 아니고 여러 개가 같은 ID 라서 개인화를 끈다.
 */

/** 관리 화면 미리보기의 위젯·인스턴스 ID — unit-converter 의 기억 규칙과 같다. */
const PREVIEW_WIDGET_ID = "def.preview";
const PREVIEW_INST_ID = "preview";

export interface WidgetGridPersonalizeProps {
  personalize?: false;
  gridId?: string;
}

export function widgetGridPersonalize(widgetId: string | undefined, instanceId: string | undefined): WidgetGridPersonalizeProps {
  if (!instanceId || instanceId === PREVIEW_INST_ID || widgetId === PREVIEW_WIDGET_ID) return { personalize: false };
  return { gridId: `widget-${instanceId}` };
}
