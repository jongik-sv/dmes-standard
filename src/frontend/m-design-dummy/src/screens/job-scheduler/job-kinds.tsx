/**
 * 실행 유형 등록부 — 위젯 유형 등록부처럼 유형마다 이름·한 줄 설명·아이콘을 한곳에 둔다.
 * 유형별 편집기는 KindEditors.tsx 가 같은 키로 맡는다.
 */
import type { ReactNode } from "react";
import {
  IconCloudDownload,
  IconCode,
  IconDatabase,
  IconSitemap,
  IconTrash,
  IconWebhook,
} from "@tabler/icons-react";
import type { JobKind } from "../../data/job-scheduler-mock";

export interface JobKindInfo {
  label: string;
  description: string;
  icon: ReactNode;
  /** 변수 표 아래에 보이는 안내 — 변수가 유형마다 다르게 쓰이는 방식. */
  variableHint: string;
}

const ICON_SIZE = 22;

export const JOB_KIND_INFO: Record<JobKind, JobKindInfo> = {
  CODE: {
    label: "코드 작업",
    description: "개발자가 Java 로 등록한 작업입니다. 일정·사용·시간 초과·변수 기본값만 바꿉니다.",
    icon: <IconCode size={ICON_SIZE} />,
    variableHint: "변수 이름·형식은 코드가 정합니다. 화면에서는 값(기본값)만 바꿀 수 있습니다.",
  },
  BPMN: {
    label: "BPMN 서비스",
    description: "서비스 ID 와 Action 으로 업무 서비스를 호출합니다.",
    icon: <IconSitemap size={ICON_SIZE} />,
    variableHint: "이 변수가 서비스의 입력 파라미터가 됩니다.",
  },
  QUERY: {
    label: "쿼리",
    description: "모듈 DB 에 INSERT·UPDATE·DELETE·MERGE 한 문장이나 프로시저를 실행하고 결과 건수를 기록합니다.",
    icon: <IconDatabase size={ICON_SIZE} />,
    variableHint: "SQL 안에서 :이름 으로 쓰는 바인드 변수가 됩니다.",
  },
  COLLECT: {
    label: "수집",
    description: "SQL·HTTP JSON·환율에서 값을 모아 수집 값 표에 저장합니다. 위젯이 이 값을 보여 줍니다.",
    icon: <IconCloudDownload size={ICON_SIZE} />,
    variableHint: "원천이 SQL 이면 :이름 바인드 변수가 되고, 그 밖의 원천에서는 값 칸의 실행 변수로 쓸 수 있습니다.",
  },
  HTTP: {
    label: "HTTP 호출",
    description: "외부 시스템을 GET·POST 로 호출합니다. 트리거나 웹훅에 씁니다.",
    icon: <IconWebhook size={ICON_SIZE} />,
    variableHint: "본문(JSON) 안에서 :이름 으로 쓰면 실행할 때 값으로 바뀝니다.",
  },
  PURGE: {
    label: "보관 삭제",
    description: "대상 표에서 보관 일수가 지난 행을 SQL 없이 정리합니다.",
    icon: <IconTrash size={ICON_SIZE} />,
    variableHint: "보관 일수 같은 값을 변수로 둘 수 있습니다.",
  },
};

/** [새 작업] 에서 고를 수 있는 유형 — 코드 작업은 개발자가 코드로만 등록한다. */
export const NEW_JOB_KINDS: JobKind[] = ["BPMN", "QUERY", "COLLECT", "HTTP", "PURGE"];
