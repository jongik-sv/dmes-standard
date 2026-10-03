import { defineConfig } from "@playwright/test";

/**
 * 마루 MDM 사용자 여정 E2E — e2e/mdm-user/*.user.ts.
 *
 *   pnpm test:e2e:mdm-user                       전체(setup → common → dma → dmb → dmc → dmd → dme)
 *   pnpm test:e2e:mdm-user --project=dmc         한 그룹만(setup 은 의존성으로 먼저 돈다)
 *
 * 파일 접미어를 .user.ts 로 두어 기본 playwright.config.ts(e2e/**.spec.ts)에 섞이지 않는다.
 * 전제: 포털(SMOKE_MCM_BASE_URL, 기본 http://localhost:5100)·mcm·mdm 백엔드가 떠 있다. 결과물은 e2e/mdm-user/.out (git 제외).
 * 전제 DB: 마루 MDM 로컬 샘플이 든 mdm.db — be-run.sh 로 띄우거나, 새 DB 면 mdm 을
 *   `--mdm.sample.path=sample/mdm-local-sample.sql` 로 띄운다(MdmLocalSampleLoader 가 빈 DB 에 한 번 넣는다). SQL 픽스처는 넣지 않는다.
 *   dmb 여정은 샘플의 표준 컬럼 길이·이름과 EAI GLUE 를 단언에 쓴다 — 샘플 SQL 을 바꾸면 깨질 수 있다. 자세한 절차는 e2e/mdm-user/TEST-CASES.md.
 */
const group = (name: string) => ({ name, testMatch: new RegExp(`${name}\\.user\\.ts$`), dependencies: ["setup"] });

export default defineConfig({
  testDir: "./e2e/mdm-user",
  outputDir: "./e2e/mdm-user/.out/results",
  // 동시 로그인·쓰기에서 SQLite 가 SQLITE_BUSY 를 내므로 한 줄로 돈다.
  workers: 1,
  fullyParallel: false,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "./e2e/mdm-user/.out/report", open: "never" }]],
  use: {
    headless: true,
    viewport: { width: 1600, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
  },
  projects: [
    { name: "setup", testMatch: /00-setup\.user\.ts$/ },
    group("common"),
    group("dma"),
    group("dmb"),
    group("dmc"),
    group("dmd"),
    group("dme"),
  ],
});
