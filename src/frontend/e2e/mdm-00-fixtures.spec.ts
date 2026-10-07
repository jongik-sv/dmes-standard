import { test } from "@playwright/test";

import { loadMdmFixture, verifyMdmRbacSeed } from "./support/mdm-e2e";

/**
 * mdm E2E 의 mcm 시험 사용자 투입 — 다른 mdm 스펙보다 먼저 돈다(파일 이름순: `mdm-00-` 은 `mdm-c…`·`mdm-h…` 보다 앞).
 * mcm 을 새 PDB 로 띄워 Flyway·기동 시드가 끝난 뒤, 다음 순서로 MCMAPUSER 에 넣는다(support/mdm-e2e.ts 머리 주석의 env 필요).
 *   1. verifyMdmRbacSeed — MDM 메뉴·RBAC 시드를 .expected.txt 와 대조한다. 마지막 SELECT(e2e 사용자 0명)가 사용자 투입 전에만 참이므로 반드시 먼저다.
 *      같은 PDB 로 다시 돌리면 사용자가 이미 있어 여기서 실패한다 — 새 PDB(시험 PDB 복제본)로 시작한다.
 *   2. mdm-rbac-users.sql(e2e_mdm_none·steward·stdadmin)·mdm-ruleEdit-users.sql(e2e_mdm_steward2) — NOT EXISTS 멱등.
 * mdm 쪽 픽스처(MDMAPUSER)는 각 스펙이 beforeAll 에서 스스로 넣는다. 한 스펙만 골라 돌릴 때는 이 파일도 함께 돌려야 사용자가 있다.
 * 순서는 파일 이름순과 단일 워커(playwright.config.ts workers: 1)에 기댄다 — workers 를 늘리거나 샤딩하면 이 파일이 먼저 돈다는 보장이 깨진다.
 */
test("mcm 시드 대조 뒤 시험 사용자를 넣는다", async () => {
  await verifyMdmRbacSeed();
  await loadMdmFixture("mdm-rbac-users.sql");
  await loadMdmFixture("mdm-ruleEdit-users.sql");
});
