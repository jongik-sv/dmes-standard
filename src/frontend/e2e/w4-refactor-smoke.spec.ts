import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, T } from "./support/common";

/**
 * W4 리팩토링 실검증 스모크 — tsup splitting(청크 분리) dist 를 포털이 실제 로드하는지 +
 * W2/W3 이관 화면의 핵심 UI 가 렌더되는지 확인한다.
 *
 * 검증 대상 5화면(도메인 대표):
 *  - 고객 관리(customer)        : W2a 서버 pushdown 전환 + use-master-crud
 *  - 주문 관리(order)           : W2d usePaginatedList + RowStateManager + DateField
 *  - 스케줄 현황 간트(gantt)     : W3 성능 수정(ms 사전계산·rAF·컬링)
 *  - 시뮬레이션 콘솔(console)    : W2f 쌍둥이 통합(탭드 결과패널)
 *  - 설비 비가동(equip-downtime) : W2g useClientPagedSearch + Pagination 신설
 *
 * 판정: 콘솔 error / uncaught pageerror 중 모듈·청크 로드 실패가 없어야 하고,
 * 각 화면의 그리드/컨테이너가 렌더되어야 한다. (데이터 유무에는 관대)
 */

const BASE = process.env.SMOKE_MCM_BASE_URL ?? "http://localhost:5100";
const LOGIN_USER = process.env.SMOKE_LOGIN_USER ?? "admin";
const SNAP_DIR = "test-results/w4-snap";
// 로그인 1회화: 첫 성공 세션의 cookie 를 저장해 이후 테스트가 재사용(반복 로그인 flake 회피)
const STATE_FILE = "test-results/w4-auth-state.json";

interface TargetScreen {
  id: string;
  group: string; // 공정계획 하위 그룹 메뉴 라벨
  label: string; // 화면 메뉴 라벨
  extraAssert?: (page: Page) => Promise<void>;
}

const SCREENS: TargetScreen[] = [
  {
    id: "customerMng",
    group: "마스터 데이터 관리",
    label: "고객 관리",
    extraAssert: async (page) => {
      await expect(page.locator(".ag-root").first()).toBeVisible({ timeout: 15_000 });
    },
  },
  {
    id: "orderMng",
    group: "플래닝",
    label: "주문 관리",
    extraAssert: async (page) => {
      await expect(page.locator(".ag-root").first()).toBeVisible({ timeout: 15_000 });
      // W2d: 인라인 date input → DateField(raw input[type=date]) 유지 확인
      expect(await page.locator('input[type="date"]').count()).toBeGreaterThanOrEqual(2);
    },
  },
  {
    id: "ganttView",
    group: "스케줄링",
    label: "스케줄 현황(간트차트)",
    extraAssert: async (page) => {
      // 간트는 스케줄 미선택 시 사이드바만 보일 수 있음 — 컨테이너 또는 사이드바 존재로 판정
      const gantt = page.locator('[class*="gantt"]').first();
      await expect(gantt).toBeVisible({ timeout: 15_000 });
    },
  },
  {
    id: "simulationConsole",
    group: "시뮬레이션",
    label: "시뮬레이션 콘솔",
  },
  {
    id: "equipDowntimeMng",
    group: "운영 관리",
    label: "설비 비가동",
    extraAssert: async (page) => {
      await expect(page.locator(".ag-root").first()).toBeVisible({ timeout: 15_000 });
      // 데이터 로드를 위해 [조회] 실행
      try {
        await page.getByRole("button", { name: "조회" }).first().click();
        await page.waitForTimeout(3_000);
      } catch {
        /* 조회 버튼 없으면 자동조회 화면 */
      }
      // W2g: Pagination 바 신설 확인 — shared Pagination 은 totalPages<=0 이면 null 렌더라
      // 데이터가 있을 때만 표시를 요구한다(빈 시드면 미표시가 정상).
      const rowCount = await page.locator(".ag-row").count();
      if (rowCount > 0) {
        const pagination = page.locator('[class*="pagination"]').first();
        await expect(pagination).toBeVisible();
      } else {
        console.log("[equipDowntimeMng] 데이터 0건 — Pagination 조건부 미표시(정상)");
      }
    },
  },
];

test.describe.configure({ mode: "serial" });

test.describe("W4 리팩토링 스모크 (청크 dist + 이관 화면)", () => {
  for (const s of SCREENS) {
    test(`${s.label} (${s.id})`, async ({ page, context }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 1600, height: 900 });

      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      const failedModuleLoads: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => pageErrors.push(String(err)));
      page.on("requestfailed", (req) => {
        const url = req.url();
        if (url.includes("/_next/") || url.includes("chunk")) {
          failedModuleLoads.push(`${url} → ${req.failure()?.errorText}`);
        }
      });

      // 폼 로그인 (phase2-planning-smoke 패턴 — 시드 dev 계정, 후보 순차 시도)
      const candidates = [
        { id: LOGIN_USER, pw: PASSWORD },
        { id: "admin@dmes.com", pw: "admin123" },
      ];
      let loggedIn = false;
      // 저장된 세션 cookie 재사용 시도
      try {
        const fs = await import("node:fs");
        if (fs.existsSync(STATE_FILE)) {
          const saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
          if (Array.isArray(saved.cookies) && saved.cookies.length > 0) {
            await context.addCookies(saved.cookies);
            await page.goto(`${BASE}/portal`, { waitUntil: "domcontentloaded" });
            if (/\/portal/.test(page.url())) loggedIn = true;
          }
        }
      } catch {
        /* 세션 재사용 실패 시 폼 로그인 폴백 */
      }
      outer: for (const c of candidates) {
        if (loggedIn) break;
        for (let attempt = 0; attempt < 2; attempt++) {
          await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
          // 세션이 이미 있으면 /portal 로 자동 리다이렉트됨
          if (/\/portal/.test(page.url())) {
            loggedIn = true;
            break outer;
          }
          await page.getByPlaceholder("아이디").fill(c.id);
          await page.getByPlaceholder("비밀번호").fill(c.pw);
          await page.getByRole("button", { name: "로그인" }).click();
          try {
            // 첫 요청은 Next dev 의 /portal 컴파일 지연이 있어 넉넉히 대기
            await page.waitForURL(/\/portal/, { timeout: T.LONG });
            loggedIn = true;
            break outer;
          } catch {
            await page.waitForTimeout(1_500); // 일시 실패(BE 워밍업 등) 재시도
          }
        }
      }
      expect(loggedIn, "시드 dev 계정 로그인 실패").toBe(true);
      try {
        const fs = await import("node:fs");
        fs.mkdirSync("test-results", { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(await context.storageState()));
      } catch {
        /* 상태 저장 실패는 무시(다음 테스트가 폼 로그인) */
      }
      await page.waitForTimeout(2_500);

      // 메뉴 트리: 공정계획 → 그룹 → 화면
      for (const label of ["공정계획", s.group]) {
        try {
          await page.locator(`.tree-item:has-text("${label}")`).first().click();
          await page.waitForTimeout(400);
        } catch {
          /* 이미 펼쳐진 경우 무시 */
        }
      }
      await page.locator(`.tree-item:has-text("${s.label}")`).first().click();
      await page.waitForTimeout(5_000);

      const bodyText = (await page.textContent("body")) ?? "";
      expect(bodyText).not.toContain("등록된 페이지를 찾을 수 없습니다");
      expect(bodyText).not.toContain("Application error");

      if (s.extraAssert) await s.extraAssert(page);

      await page.screenshot({ path: `${SNAP_DIR}/${s.id}.png`, fullPage: false });

      // 모듈/청크 로드 실패 = 즉시 실패
      expect(failedModuleLoads, `모듈 로드 실패: ${failedModuleLoads.join("; ")}`).toHaveLength(0);
      const moduleErrors = [...consoleErrors, ...pageErrors].filter((e) =>
        /module|chunk|import|Cannot find|Failed to fetch dynamically/i.test(e),
      );
      expect(moduleErrors, `모듈 관련 에러: ${moduleErrors.join("; ")}`).toHaveLength(0);

      console.log(
        `[${s.id}] consoleErrors=${consoleErrors.length} pageErrors=${pageErrors.length} (모듈성 0 확인)`,
      );
    });
  }
});
