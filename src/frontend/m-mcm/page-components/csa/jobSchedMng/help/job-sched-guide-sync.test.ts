import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { JOB_SCHED_DEV_GUIDE_MARKDOWN, JOB_SCHED_USER_GUIDE_MARKDOWN } from "./job-sched-guide-content";

const USER_SOURCE = fileURLToPath(new URL("../../../../../../../docs/guide/FrontEnd/Job-Scheduler-User-Guide.md", import.meta.url));
const DEV_SOURCE = fileURLToPath(new URL("../../../../../../../docs/guide/FrontEnd/Job-Scheduler-Developer-Guide.md", import.meta.url));

/** 코드 블록(``` 울타리)과 백틱 구간을 지운 글 — 경로·정규식의 물결표는 검사하지 않는다. */
function stripCode(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

const chapters = (markdown: string): string[] => markdown.split("\n").filter((l) => /^## /.test(l));

describe("예약 작업 도움말 문서 번들", () => {
  // 어긋나면: pnpm --filter @dk-oasis/mcm gen:job-sched-guide
  it("저장소 원문(Job-Scheduler-User-Guide.md)과 화면 번들 사본이 같다", () => {
    expect(JOB_SCHED_USER_GUIDE_MARKDOWN).toBe(readFileSync(USER_SOURCE, "utf8"));
  });

  it("저장소 원문(Job-Scheduler-Developer-Guide.md)과 화면 번들 사본이 같다", () => {
    expect(JOB_SCHED_DEV_GUIDE_MARKDOWN).toBe(readFileSync(DEV_SOURCE, "utf8"));
  });

  it("목차가 될 장(##)이 충분하다", () => {
    expect(chapters(JOB_SCHED_USER_GUIDE_MARKDOWN).length).toBeGreaterThanOrEqual(10);
    expect(chapters(JOB_SCHED_DEV_GUIDE_MARKDOWN).length).toBeGreaterThanOrEqual(8);
  });

  it("사용 방법 문서에 「실행기별 설명」 장과 실행기 네 개의 설명이 있다", () => {
    expect(chapters(JOB_SCHED_USER_GUIDE_MARKDOWN)).toContain("## 실행기별 설명");
    for (const heading of ["### 코드 실행", "### 서비스 실행(BPMN)", "### 쿼리 실행", "### 수집"]) {
      expect(JOB_SCHED_USER_GUIDE_MARKDOWN.split("\n")).toContain(heading);
    }
  });

  it.each([
    ["Job-Scheduler-User-Guide.md", USER_SOURCE],
    ["Job-Scheduler-Developer-Guide.md", DEV_SOURCE],
  ])("%s 에 이스케이프 안 된 물결표 하나(~)가 없다 — 범위는 하이픈, 인용 문구는 \\~(GFM 이 취소선으로 그린다)", (_name, path) => {
    const text = stripCode(readFileSync(path, "utf8")).replace(/~~/g, "").replace(/\\~/g, "");
    expect(text.split("\n").filter((l) => l.includes("~"))).toEqual([]);
  });
});
