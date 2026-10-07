import { defineConfig } from "@playwright/test";

/**
 * 마루 MDM 사용자 여정 E2E — e2e/mdm-user/*.user.ts.
 *
 *   pnpm test:e2e:mdm-user                       전체(setup → common → dma → dmb → dmc → dmd → dme)
 *   pnpm test:e2e:mdm-user --project=dmc         한 그룹만(setup 은 의존성으로 먼저 돈다)
 *
 * 파일 접미어를 .user.ts 로 두어 기본 playwright.config.ts(e2e/**.spec.ts)에 섞이지 않는다.
 * 전제: 포털(SMOKE_MCM_BASE_URL, 기본 http://localhost:5100)·mcm·mdm 백엔드가 떠 있다. 결과물은 e2e/mdm-user/.out (git 제외).
 * 전제 DB: 포털·mcm·mdm 이 보는 Oracle PDB(이 여정은 DB 에 직접 접속하지 않는다 — SQL 픽스처도 넣지 않는다).
 *   여정이 기대는 샘플 데이터(dmb 의 표준 컬럼 길이·이름과 EAI GLUE, dme RO-01 의 확정 룰 WID_CHK 등)는 PDB 에 미리 적재한다:
 *   Flyway V1 뒤 `scripts/db-snapshot/snapshot.py import --pdb <PDB> MDMAPUSER MCMAPUSER`(TPL_DATA 템플릿이 생기면 그 복제).
 *   자동 샘플 로더는 없다. 자세한 절차는 e2e/mdm-user/TEST-CASES.md.
 */
const group = (name: string) => ({ name, testMatch: new RegExp(`${name}\\.user\\.ts$`), dependencies: ["setup"] });

export default defineConfig({
  testDir: "./e2e/mdm-user",
  outputDir: "./e2e/mdm-user/.out/results",
  // 공유 PDB 한 벌에 로그인·쓰기가 겹치지 않게, setup 이 만든 사용자·로그인 상태를 쓰며 그룹을 차례로(common → dma … dme) 돌린다.
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
