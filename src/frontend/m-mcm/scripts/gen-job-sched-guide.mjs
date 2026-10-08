#!/usr/bin/env node
/**
 * 예약 작업 관리 도움말 문서 번들 생성 — 저장소 문서(docs/guide/FrontEnd/Job-Scheduler-*.md)를 화면 번들용 TS 모듈로 옮긴다.
 * 위젯 도움말(gen-widget-guide.mjs)과 같은 이유다: 포털이 모듈 패키지의 정적 파일을 서빙하지 않고 Next 설정에 .md 로더도 없으므로
 * 원문(.md)이 정본이고 아래 .ts 는 이 스크립트가 만든 사본이다.
 *   - Job-Scheduler-User-Guide.md → JOB_SCHED_USER_GUIDE_MARKDOWN (「사용 방법」 탭)
 *   - Job-Scheduler-Developer-Guide.md → JOB_SCHED_DEV_GUIDE_MARKDOWN (「처리기·BPMN 만들기」 탭)
 *   둘 다 page-components/csa/jobSchedMng/help/job-sched-guide-content.ts 한 파일에 담긴다.
 * 문서를 고치면 `pnpm --filter @dk-oasis/mcm gen:job-sched-guide` 로 다시 만든다(어긋나면 시험이 실패한다: job-sched-guide-sync.test.ts).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const docs = resolve(here, "../../../../docs/guide/FrontEnd");

export const USER_GUIDE_SOURCE = resolve(docs, "Job-Scheduler-User-Guide.md");
export const DEV_GUIDE_SOURCE = resolve(docs, "Job-Scheduler-Developer-Guide.md");
export const GUIDE_TARGET = resolve(here, "../page-components/csa/jobSchedMng/help/job-sched-guide-content.ts");

/** 사본 모듈 글 — 머리 주석 + `export const {이름}: string = "…"` 두 개. */
export function renderModule(userMarkdown, devMarkdown) {
  return [
    "/**",
    " * 자동 생성 파일 — 직접 고치지 않는다. 원문: docs/guide/FrontEnd/Job-Scheduler-User-Guide.md, Job-Scheduler-Developer-Guide.md",
    " * 다시 만들기: pnpm --filter @dk-oasis/mcm gen:job-sched-guide (scripts/gen-job-sched-guide.mjs)",
    " */",
    `export const JOB_SCHED_USER_GUIDE_MARKDOWN: string = ${JSON.stringify(userMarkdown)};`,
    `export const JOB_SCHED_DEV_GUIDE_MARKDOWN: string = ${JSON.stringify(devMarkdown)};`,
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const user = readFileSync(USER_GUIDE_SOURCE, "utf8");
  const dev = readFileSync(DEV_GUIDE_SOURCE, "utf8");
  writeFileSync(GUIDE_TARGET, renderModule(user, dev));
  console.log(`생성: ${GUIDE_TARGET} (사용 방법 ${user.length}자, 처리기·BPMN ${dev.length}자)`);
}
