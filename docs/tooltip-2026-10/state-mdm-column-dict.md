# mdm-column-dict 레인 정본 메모 — 완료(2026-10-05)

- dev 머지 0fb516aa(--no-ff, 트리 b8cffd1f), 워크트리·브랜치 정리 끝. 서버 재기동·등록·측정은 조정 세션 몫이다.

- 브랜치 `feat/mdm-column-dict`, 워크트리 `/Users/jji/project/dmes-standard-wt/mdm-column-dict`(기준 dev e00a3c7c, dev d1028256 을 b59e29dc 로 합침), 조정 세션 dmes-standard-0f.
- 지시: mdm-column-dict-1(착수), -2(C1 확정 — MDM 별칭은 조회 쪽 C1b 로, WIDGET_ID 용어 등록, TITLE 사전에 있음), -3(화면 예외 4건 반영), -4(정본 갱신), -5(머지 허가 — REFRESH_SEC 신규는 기본안대로 등록).
- git 은 `/usr/bin/git`, gradle 은 `src/backend` 에서 `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../../.claude/skills/dflow-dev/scripts/heavy.sh ./gradlew --max-workers=2`.

## 항목

| 항목 | 상태 | 커밋 | 결과 |
|---|---|---|---|
| C1 분류표 | 끝·확정 | ec4ff90a, b3d28de5, d3e46c5a, f0ea2e6b, 45766055, 8899bce9, 383ff702 | `docs/mdm-column-dict/classification.md`(+json·csv). 키 474(요청 키 416): 사전에 있음 45, MDM 별칭 67, 신규 70(표준 60), MES 별칭 10, 표시용 32, 화면 예외 3, 범용 104, UI 143. 유사어(KURE) 검사: 같은 뜻 기존 컬럼·용어 0건 |
| C1b 시스템 코드 목록 | 끝 | ee705168, 90bb01d9 | 피드 `systemCode` 쉼표 목록(앞 코드 우선, 앞에서 모호하면 뒤로 안 넘어감), mcm `system-code: MES,MDM`. opus 리뷰 결함 없음(배포 순서 주의) |
| C2 등록 묶음·스크립트 | 끝 | 1d4720e5, c9596a7a, 3e61044d | 용어 1(위젯)·신규 60(MES 별칭 60)·기존 별칭 10, dry-run PLAN 71·FAIL 0. CD_V·COLUMN_ID 는 MDM 자기 매핑 때문에 save 불가라 표시용으로 |
| C3 전후 확인 | 끝 | c40c1cd9, c9596a7a, 3e61044d | 고정 키 416·등록 전 hit 61·기대 hit 147(`check-meta.sh --baseline --expect`), `derive-lists.sh` |
| C4 BE 측정 절차 | 끝 | ccefc1e8, 3e61044d | `scripts/perf/mdm-meta/run-measure.sh`(mcm 표준 176·별칭 137, feed MES vs MES,MDM, screen 416). 수치는 조정 세션 측정 창 |
| C5 마감 | 끝 | 622cafda, 743aa35c, 머지 0fb516aa | 리팩토링 리뷰 2회 반영, 재리뷰 CLEAN. 백엔드 시험(feed·cactus mdm) 31묶음 372/372 |

## 남은 일(조정 세션)

1. MDM WAS 먼저, mcm 나중 재기동(C1b). 순서가 어긋나면 mdmCacheMng 에서 다시 읽기.
2. `node scripts/mdm-meta/register-columns.mjs --user <표준관리자 사번> --apply` → 10초 뒤 `scripts/mdm-meta/check-meta.sh --names scripts/mdm-meta/keys-2026-10-05.txt --baseline scripts/mdm-meta/baseline-2026-10-05.json --expect scripts/mdm-meta/expected-gain-2026-10-05.txt`(기대 gained=147 lost=0 not_yet=0).
3. `scripts/perf/mdm-meta/run-measure.sh --tag before/after` 로 `perf-mdm-column-dict.md` 의 P1·P2 표를 채운다.
