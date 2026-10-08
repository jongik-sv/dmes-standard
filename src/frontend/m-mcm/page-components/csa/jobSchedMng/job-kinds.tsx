/**
 * 실행 유형 등록부 — 유형마다 이름·한 줄 설명·아이콘·변수 안내를 한곳에 둔다(설계 §5.1).
 * 유형별 편집기는 KindEditors.tsx 가 같은 키로 맡는다.
 */
import type { ReactNode } from "react";

import { IconCloudDownload, IconCode, IconDatabase, IconSitemap } from "@tabler/icons-react";

import { KIND_LABEL, kindLabel } from "./kind-label";
import type { JobKind } from "./types";

export interface JobKindInfo {
  label: string;
  description: string;
  icon: ReactNode;
  /** 변수 표 아래에 보이는 안내 — 변수가 유형마다 쓰이는 방식. */
  variableHint: string;
}

const ICON_SIZE = 14;

export const JOB_KIND_INFO: Record<JobKind, JobKindInfo> = {
  CODE: {
    label: KIND_LABEL.CODE,
    description: "코드에 등록된 처리기를 실행합니다. 같은 처리기를 변수만 달리해 여러 작업으로 쓸 수 있습니다.",
    icon: <IconCode size={ICON_SIZE} />,
    variableHint: "변수 이름·형식은 코드가 정합니다. 화면에서는 값만 바꿀 수 있습니다.",
  },
  BPMN: {
    label: KIND_LABEL.BPMN,
    description: "서비스 ID 와 Action 으로 OASIS 업무 서비스를 호출합니다.",
    icon: <IconSitemap size={ICON_SIZE} />,
    variableHint: "이 변수가 서비스의 입력 파라미터가 됩니다.",
  },
  QUERY: {
    label: KIND_LABEL.QUERY,
    description: "그 모듈 DB 에 INSERT·UPDATE·DELETE·MERGE 한 문장이나 프로시저를 실행하고 영향받은 행 수를 기록합니다.",
    icon: <IconDatabase size={ICON_SIZE} />,
    variableHint: "SQL 안에서 :이름 으로 쓰는 바인드 변수가 됩니다.",
  },
  COLLECT: {
    label: KIND_LABEL.COLLECT,
    description: "SQL·HTTP JSON·환율에서 값을 읽어 수집 값 표(TB_MCM_JOB_COLLECT_DATA)에 저장합니다. 저장하지 않고 읽기만 할 수도 있습니다.",
    icon: <IconCloudDownload size={ICON_SIZE} />,
    variableHint: "원천이 SQL 이면 :이름 바인드 변수가 되고, HTTP 원천에서는 주소의 {{이름}} 자리에 들어갑니다.",
  },
};

/** [새 작업] 에서 고를 수 있는 유형 — 카드 4개. */
export const NEW_JOB_KINDS: readonly JobKind[] = ["CODE", "BPMN", "QUERY", "COLLECT"];

export { kindLabel };
