"use client";

/**
 * 예약 작업 관리 「도움말」 — 운영자용 「사용 방법」과 개발자용 「처리기·BPMN 만들기」 두 문서를 탭으로 보여 준다.
 * 원문은 docs/guide/FrontEnd/Job-Scheduler-User-Guide.md, Job-Scheduler-Developer-Guide.md 이고 job-sched-guide-content.ts 는
 * scripts/gen-job-sched-guide.mjs 가 만든 사본이다. 모달 틀은 lib/help/GuideHelpModal 이 맡는다(위젯 관리 도움말과 같은 모습).
 */
import { GuideHelpModal, type GuideHelpDoc } from "@/lib/help/GuideHelpModal";

import { JOB_SCHED_DEV_GUIDE_MARKDOWN, JOB_SCHED_USER_GUIDE_MARKDOWN } from "./job-sched-guide-content";

const DOCS: readonly GuideHelpDoc[] = [
  { key: "use", tab: "사용 방법", title: "예약 작업 관리 사용 방법", ariaLabel: "예약 작업 관리 사용 방법", markdown: JOB_SCHED_USER_GUIDE_MARKDOWN, testId: "job-sched-help-doc" },
  { key: "dev", tab: "처리기·BPMN 만들기", title: "예약 작업 처리기·BPMN 만들기", ariaLabel: "예약 작업 처리기와 BPMN 만들기", markdown: JOB_SCHED_DEV_GUIDE_MARKDOWN, testId: "job-sched-help-dev-doc" },
];

export interface JobSchedHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function JobSchedHelpModal({ open, onClose }: JobSchedHelpModalProps) {
  return <GuideHelpModal open={open} onClose={onClose} docs={DOCS} className="cm-job-sched-help-modal" testIdPrefix="job-sched-help" />;
}
