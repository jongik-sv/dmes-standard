# 2026-10 시스템 리팩토링 마감 요약

## 머리말

- 범위: 2026-10-04 조사(성능·구조·품질 5개 영역)로 나눈 5개 레인(프레임워크, MDM 백엔드, mcm, 빌드·스크립트·E2E, 프론트)의 구조 변경(S)과 성능 비교(P)를 한 문서에 모은다.
- 기준 태그: `refactor-2026-10-base` (b557ccbd). 모든 성능 기준(before)은 이 태그의 코드로 얻었다.
- 작성 기준: 2026-10-04, dev `a41ced41`. 5개 레인의 코드·측정 기록이 모두 dev 에 들어간 시점이다.
- 정본: 이 문서는 요약이다. 구조 변경의 정본은 `docs/refactor-2026-10/structure-<레인>.md`, 성능 수치의 정본은 `docs/refactor-2026-10/perf-<레인>.md` 다. 값이 어긋나면 그쪽이 우선한다.
- 대조 상태: 모든 성능 수치는 dev 의 `perf-*.md` 와 대조했고 어긋난 값은 없었다. 대조하지 못한 값에는 `‡` 를 붙였다. 이 문서의 커밋 해시는 모두 `git cat-file -t` 로 존재를 확인했다. 1b 2차(S18~S24)와 1b 측정 수치는 저장소의 structure-build.md·perf-build.md 와 대조했다.
- 이 문서에서 새로 계산한 값은 없다. 증감 %는 perf 문서에 적힌 값이다.

### 한눈 요약

| 레인 | 결과 |
|---|---|
| 프레임워크 | OASIS 캐시 적중 처리량 최대 약 250배(스레드 8). analog 동시 검색 지연 최대 -38%. methodinvoker 로그 216줄이 0줄. 커밋 실패가 SUCCESS 로 숨던 문제를 S001 로 드러냄. |
| MDM 백엔드 | 마스터코드 배치 저장 flush 998회가 3회(N=500, 시간 -94%). 헤더 확정 영향도 쿼리가 E·H 와 무관하게 9회 고정(E=64·H=5 시험 값 1,928 → 9). 용어 검색(조건 있을 때) 응답 -93~-96%. 조건 없는 컬럼 검색은 SQL 문 수와 맞바꿈이 생겨 k 가 크면 악화. |
| mcm | 메뉴·OBJ 전수 로드 SELECT 14회가 2회. `getMyMenus` 캐시 적중 시 -69%, 저장 직후 첫 조회는 +14%. 사용자 관리 N+1 제거. |
| 빌드·E2E | 1차·2차(버전 카탈로그·build-logic·buildAll 15개·mybatis 3.0.5 통일)·E2E·측정 하네스 머지 완료. 기동 콜드는 기준이 재측정 0/3 성공(첫 시도 포함 5번 중 1번), 변경 3/3 성공(중앙값 43.7초). 웜은 +12%(24.9 → 27.9초, 편차와 같은 크기). 종료 때 다른 워크트리 빌드 실패 1건이 0건. |
| 프론트 | m-mdm 콜드 빌드 -73%, 웜 빌드 -90%, 최대 메모리 -80~-85%. 오류 문구 통일. 브라우저 확인 62건 중 통과 56·실패 2(둘 다 기존 동작)·보류 4. |

### 레인과 세션 대응표

| 레인 | 세션 | 브랜치 | dev 머지 커밋 | 기록 문서 |
|---|---|---|---|---|
| 프레임워크(cactus·oasis 조립 경로, analog) | dmes-standard-a8 | `refactor/framework` | 1차 bb8ee036, 2차 f2c11dd1, 3차 b20b16cd, 측정 기록 d529e992, 하네스 편입 0d1b1980 | structure-framework.md · perf-framework.md |
| MDM 백엔드·엔진 | dmes-standard-b9 | `refactor/mdm-backend` | 1차 1c124361, 2차 923aa9a0, 문서 수정 efb39f2c, 측정 기록 6ed698e2, 하네스 15fb4e09 | structure-mdm-backend.md · perf-mdm-backend.md |
| mcm-core·mcm | dmes-standard-a6 | `refactor/mcm` | 1단계 5f619b2a, 2단계 efb09d29, 3번 bfd25e48, P3 측정 기록 8b2dec1c, 하네스는 a8 이 0d1b1980 에 편입 | structure-mcm.md · perf-mcm.md |
| 빌드·스크립트·E2E | dmes-standard-1b | `refactor/build` (2차 포함 모두 dev 에 병합, 브랜치 정리됨) | 1차 bb0d1dd6, cactus 시험 의존 540ca923, E2E dd3f59e5, 부수 트랙 959bf24c, 2차 114f909e, 2차 gates c936f629, 측정 기록·하네스 a41ced41 | structure-build.md · perf-build.md |
| 프론트 shared·화면 | dmes-standard-c3 | `refactor/frontend` | 1차 f2056fbf, 2차 72a0b65b, 기록 문서 f4e5c4da, 마지막 기록 1ca202f7, 하네스는 a8 이 0d1b1980 에 편입 | structure-frontend.md · perf-frontend.md |

머지 조정은 조정 세션 dmes-standard-cb 가 맡았다. 레인 브랜치와 워크트리는 모두 정리됐고, 남은 보관 브랜치는 `archive/a8-backup-e71aa0b0`, `archive/1b-build-logic-pre-slotfix` 둘뿐이다.

### 레인 밖 머지

| 커밋 | 내용 | 비고 |
|---|---|---|
| 7d27869c | 후속 결함 수정 `fix/refactor-followups`(a8 세션 수행): D1 용어 JSON null 리터럴, D2 null 원소, 커밋 뒤 캐시 갱신 예외의 S001 번짐, `%null%` 보존 조건 걷음. 커밋은 3e645c34(D1)·c5c26f15(afterCommit)·d2c7b283(D2)·90e507e5(`%null%` 걷음)·7c5572af(javadoc) | mdm lib 1683·api 1711 통과 ‡. 새 재현 시험이 수정 전 코드에서 실패하는지는 정적 확인만 했다 |
| 0d1b1980 | 측정 하네스 framework·mcm·frontend 를 `scripts/perf/` 로 편입 | 새 경로에서 실측은 돌려 보지 않았다 |
| 15fb4e09 | 측정 하네스 mdm-backend 를 `scripts/perf/mdm-backend` 로 편입 | 같음 |
| 95e7740d, e9855616 | 조정자 스킬 설계 문서(리팩토링 범위 밖) | ④ 후속에 한 줄만 둔다 |

---

## ① 한눈에 보는 성능 전후 표

- 지표 칸의 `[결정]` 은 쿼리 수·로그 줄 수·렌더 횟수처럼 편차가 없는 지표(1회로 확정), `[측정]` 은 시간·처리량·메모리·스레드 수처럼 반복 측정과 중앙값이 필요한 지표다.
- 빈 칸은 해당 값이 없다는 뜻이다. '측정 전'·'측정 안 함'은 레인 기록 표기를 그대로 옮겼다.

### 프레임워크

| 항목(P 번호와 지표) | 기준 → 변경 | 증감 | 판정 |
|---|---|---|---|
| P1 [측정] 캐시 적중 처리량, 스레드 1 (Mops/s) | 59.41 → 149.03 | +151%(2.5배) | 개선 |
| P1 [측정] 같은 지표, 스레드 4 | 2.93 → 493.31 | 약 169배 | 개선 |
| P1 [측정] 같은 지표, 스레드 8 | 2.92 → 729.37 | 약 250배 | 개선 |
| P2 [측정] `/log/range/time` 지연 중앙값(ms), 큰 로그 N=1/4/8/16 | 175.7 / 292.9 / 575.2 / 1132.7 → B 150 / 278.9 / 494.55 / 796.7, C 152.6 / 273.1 / 431.8 / 699.2 | B -15% / -5% / -14% / -30%, C -13% / -7% / -25% / -38% | 개선 |
| P2 [측정] 같은 지표, 작은 로그 N=1/4/8/16 | 18.9 / 35.6 / 28.5 / 33.2 → B 17.1 / 33.45 / 20.2 / 28.1, C 18.7 / 31.1 / 18.3 / 28.7 | B -10% / -6% / -29% / -15%, C -1% / -13% / -36% / -14% | 개선 |
| P2 [측정] 측정 중 JVM 최대 스레드 수(ps), 큰 로그 N=1/4/8/16 | 56 / 72 / 92 / 132 → B 76 / 84 / 84 / 84, C 77 / 84 / 84 / 84 | 공유 풀 때문에 84 에서 멈춘다 | 개선 |
| P2 [측정] 같은 지표, 작은 로그 | 46 / 47 / 47 / 47 → B 46.5 / 49.5 / 54.5 / 54.5, C 48 / 50 / 55 / 55 | 공유 풀이 미리 떠 있어 1~8개 많다 | 소폭 증가 |
| P2 [측정] `/log/range/time/tree` 지연 중앙값(ms), 큰 로그 N=1/4/8/16 | 267.2 / 720.8 / 1216.8 / 2404.8 → B 271.3 / 716 / 1149.05 / 1287.15, C 191.7 / 493.6 / 901.7 / 879.8 | B +2% / -1% / -6% / -46%, C -28% / -32% / -26% / -63% | 개선(N=16 은 503 8건 제외) |
| P2 [측정] 같은 지표, 작은 로그 | 121.6 / 128.7 / 143.9 / 149.4 → B 111.3 / 118.05 / 131.55 / 127.05, C 16.7 / 32.7 / 44.2 / 42 | B -8% / -8% / -9% / -15%, C -86% / -75% / -69% / -72% | 개선(N=16 은 503 8건 제외) |
| P2 [측정] `/tree` 503 건수(변경 쪽만) | 0(N=16 포함) → B·C 모두 N=16 에서 8건, N=1·4·8 은 0 | 트리 파싱 동시 상한 8 초과분 | 대가 |
| P2 [측정] `/tree` 연속 40초 중 analog CPU(코어 1개=100%) | 185.8% → B 179.4%(-3%), C 213.4%(+15%) | C 는 같은 40초에 요청 47% 더 처리(156 → 229건) | 처리량 증가에 따른 상승 |
| P2 [측정] `/tree` 요청당 CPU(ms) | 479.6 → B 459.1(-4%), C 374.3(-22%) | C -22% | 개선(공정한 비교 지표) |
| P2 [측정] `/tree` 처리 중 지연 중앙값(ms) | 257.4 → B 256.55(-0%), C 171.8(-33%) | C -33% | 개선 |
| P2 [측정] `/tree` 유휴 시 analog CPU(%, 30초) | 0.13 → B 0.13, C 0.13 | +0% | 차이 없음 |
| P3 [결정] methodinvoker 로그 줄 수, StrictMethodResolver / TypeMatchableMethodArgumentBinder / 합계(모두 INFO) | 54 / 162 / 216 → 0 / 0 / 0 | -54 / -162 / -216줄 | 개선 |

- B 는 1차 bb8ee036, C 는 레인 최종(dev efb39f2c 와 같은 코드), 기준 A 는 b557ccbd 다.
- p95 지연(큰 로그·작은 로그 모두)은 같은 방향으로 줄었다. 표는 perf-framework.md 에 있다.

### MDM 백엔드

| 항목(P 번호와 지표) | 기준 → 변경 | 증감 | 판정 |
|---|---|---|---|
| P1 [결정] 배치 저장 1회당 flush 수, `applyItems` N=10/100/500 | 19 / 199 / 998 → 3 / 3 / 3 | -84% / -98.5% / -99.7% | 개선(상수화, "한 번"은 아님) |
| P1 [결정] 같은 시나리오 SQL 문 수 | 29 / 269 / 1,335 → 같음 | 0% | 문 수 동일 |
| P1 [측정] N행 배치 저장 시간(ms, 3회 중앙값, 보조) | 5.67 / 51.76 / 983.94 → 4.51 / 13.73 / 58.40 | -20% / -73% / -94% | 개선 |
| P2 [결정] 헤더 영향도 쿼리 수, 그대로·추가·삭제·변경 | 121 → 9 | -92.6% | 개선 |
| P2 [결정] 같은 지표, 버전 경계 | 134 → 9 | -93.3% | 개선 |
| P2 [결정] 같은 지표, 첫 확정 | 13 → 9 | -30.8% | 개선 |
| P2 [결정] 같은 지표, 영향 없음 | 3 → 3 | 0% | 차이 없음 |
| P2 [결정] 같은 지표, 같은 트랜잭션(시험 flush DML 포함) | 148 → 17 | -88.5% | 개선 |
| P3 [결정] 읽은 용어 행 수, 키워드 `코일` / `coil` / 상황 `도금` | 8,152 → 22 / 249 / 147 | -99.7% / -96.9% / -98.2% | 개선 |
| P3 [결정] 읽은 용어 행 수, 조건 없음 / 시스템 `ERP` 만 | 8,152 → 8,152 / 8,152 | 0% | 이득 없음(1차 거름이 안 걸림) |
| P3 [결정] JSON 파싱 횟수 | 미측정 | | 미측정(셀 자리 없음) |
| P3 [측정] 응답 시간(ms, 3회 중앙값), `코일` / `coil` / `도금` / 복합 | 74.97 / 75.08 / 71.87 / 75.62 → 3.24 / 5.46 / 2.97 / 5.01 | -95.7% / -92.7% / -95.9% / -93.4% | 개선 |
| P3 [측정] 응답 시간(ms), 조건 없음 / 시스템 `ERP` 만 | 76.32 / 78.19 → 77.33 / 77.46 | +1.3% / -0.9% | 차이 없음 |
| P4 [결정] `save` 용어 존재 검사 Hibernate 문 수, 용어 3행 / 6행 | 11 / 14 → 9 / 9 | -18.2% / -35.7% | 개선 |
| P4 [결정] 같은 지표, 용어 30행 / 600행(로컬 DB 규모) | 38 / 608 → 9 / 10 | 입력 수 비례에서 상수로 | 개선 |
| P4 [결정] 충돌 소유 컬럼 문 수, 3개 | 8 → 6 | -25.0% | 개선 |
| P4 [결정] 같은 지표, 30개(로컬 DB 규모) | 20 → 6 | 입력 수 비례에서 상수로 | 개선 |
| P4 [결정] `compare(REVERSE)` 문 수, 3컬럼·5매핑 | 7 → 5 | -28.6% | 개선 |
| P4 [결정] 같은 지표, 50컬럼(로컬 DB 규모) | 54 → 5 | 입력 수 비례에서 상수로 | 개선 |
| P4 [결정] `search` 검색어 조건 엔티티 로드, 13컬럼 / 33컬럼 | 24 / 64 → 5 / 5 | -79.2% / -92.2% | 개선 |
| P4 [결정] `search` 도메인 키워드 조건 엔티티 로드, 13컬럼 | 24 → 10 | -58.3% | 개선 |
| P4 [결정] `search` 조건 없음, 시험 규모 SQL 문 수 | 4 → 4 | 0% | 시험 규모에서만 같음 |
| P4 [결정] `search` 조건 없음, 실제 데이터(k=1,461) | 4문·27,341행 → 6문·20,650행 | 문 +2, 읽는 행 -24%, 응답 255.8 → 253.1ms(1회, 차이 없음) | 맞바꿈(손익분기 부근) |
| P4 [결정] 같은 지표, k=8,000(용어 거의 전부 참조) | 4문·27,341행·259.9ms → 19문·27,189행·587.7ms | 문 +15, 응답 +126%(1회) | 악화 |
| P4 [결정] 같은 지표, k=10 / 500 / 501 / 2,000 | 27,341행 → 19,199 / 19,689 / 19,690 / 21,189행, 응답 253.1·255.5·257.5·267.7ms → 202.7 / 208.0 / 220.6 / 273.4ms(1회) | 행 -30% / -28% / -28% / -23%, 응답 -20% / -19% / -14% / +2% | 응답은 k 가 커지며 이득이 사라짐 |
| P4 [결정] `search` 조건 있는 검색(실제 데이터), 검색어 `두께` / 도메인 키워드 `coil` | 27,341행·241.4ms / 240.0ms → 549행·24.3ms / 440행·10.8ms(1회) | 응답 -90% / -95% | 개선 |
| P5 [측정] 세트 판정 1회 시간(µs/호출, 3회 중앙값), N=1/5/20 | 310.20 / 310.37 / 308.53 → 293.20 / 294.43 / 295.52 | -5.5% / -5.1% / -4.2% | 개선(작음) |
| P5 [측정] 준비 몫 기준값 C(파싱 + `new FlowKeys`, µs/호출) | 약 14(N=1·5·20 모두 13.7~14.1) | 총 시간 약 300µs 의 약 4.5% | 절약 상한 |

- 기준 `b557ccbd`, 변경 `923aa9a0`, SQLite 임시 파일 DB, 로컬 MDM DB 사본(용어 8,152·도메인 164·컬럼 7,857·매핑 11,168) 기준이다.
- P3 의 변경 쪽은 `%null%` 조건을 걷기 전(90e507e5 앞) 코드다. 걷은 뒤에는 후보 행 수가 같거나 적다. 다시 재지 않았다.
- P5 는 오래 사는 엔진(cactus `MdmValidator` 형)에서 쟀다. mdm 서비스 경로(`StoredDefinitionLookup`)는 판정 시각이 다르면 놓쳐 효과가 이보다 작다. 재지 않았다.
- P4 의 응답 시간(`ms_ref`)은 기준·변경 교대 반복이 아닌 1회 값이다. 문 수·읽은 행 수는 결정적 값이다.

### mcm

| 항목(P 번호와 지표) | 기준 → 변경 | 증감 | 판정 |
|---|---|---|---|
| P1 [결정] 사용자 관리 `searchCmUser` 부서 표 SELECT 수(사용자 6명·부서 3개) | 4 → 1 | 4 → 1 | 개선 |
| P1 [결정] SELECT 수(K=30, 사용자 200) | 측정 전 | | 측정 전 |
| P2 [결정] 사용자 삭제 매핑 표 SELECT 수(매핑 3개씩 가진 사용자 2명 삭제) | 8 → 0 | 8 → 0 | 개선 |
| P2 [결정] 같은 시나리오 매핑 DELETE 수 | 6 → 2 | 6 → 2 | 개선 |
| P2 [결정] DELETE·선행 SELECT 수(N=20, M=5) | 측정 전 | | 측정 전 |
| P3 [결정] 메뉴·OBJ 전수 로드 SELECT 문장 수(4곳 각 2회 호출 합계) | 14 → 2 (MENU 1 + OBJ 1) | 14 → 2 | 개선 |
| P3 [측정] `getMyMenus` 응답 시간(ms, 중앙값, 캐시 적중) | 4.00 → 1.23 (dev d529e992) | 약 -69%(회차별 0.30·0.31·0.34배) | 개선 |
| P3 [측정] 같은 지표, 매 호출 전 무효화(저장 직후 첫 조회 모사) | 4.00 → 4.41 | 약 +14%(회차별 비율 1.25·1.10·1.14배의 중앙값, 중앙값끼리 나누면 1.10배) | 저장 직후 첫 조회 1회만 소폭 악화 |
| P4 [측정] pwdinit SSO 일괄 1,000행 처리 시간(초) | 측정 안 함 → 구현 안 함 | | 해당 없음 |

- mcm P1~P3 의 SELECT·DELETE 수는 시험 실측 1회로 확정했다. 기준 값(P1·P2)은 b557ccbd 워크트리에서 따로 재지 않고 변경 전 코드에 같은 시험을 돌려 얻었다. P3 기준 14 는 옛 호출 구조에서 계산한 값이다.

### 빌드·스크립트·E2E

| 항목(P 번호와 지표) | 기준 → 변경 | 증감 | 판정 |
|---|---|---|---|
| P1 [측정] `be-run.sh --all` 백엔드 7개 LISTEN 완료까지 시간(초), 콜드 | 재측정 0/3 성공(rc 7) → 3/3 성공, 중앙값 43.7(42.5~43.9). 중단한 첫 시도까지 합치면 기준은 5번 중 1번 성공(66.9초) | 시간 비교 불가 | 기준이 안정적으로 안 올라옴. 시간 단축이라고 말하지 않는다 |
| P1 [측정] 같은 지표, 웜 | 24.9(23.6~25.1) → 27.9(25.6~28.0) | +12.0% | 변경이 느림. 회차 편차(기준 1.5초·변경 2.4초)와 비슷한 크기라 확정된 악화로 읽지 않음, 세 회차 모두 변경이 느린 방향은 같음 |
| P2 [결정] `--all` 콜드 기동 중 cactus-core compileJava 실행 횟수(세 태스크 합), 회차 1/2/3 | 5 / 2 / 3 → 3 / 3 / 3 | 감소율 말하지 않음 | 변경은 선빌드 한 곳에서 고정. 기준 값은 실패 회차의 하한 |
| P2 [결정] `:mcm-core:compileJava` / `:maru-mdm-engine:compileJava` 실행 횟수 | 4 / 1 / 1 와 2 / 2 / 1 → 1 / 1 / 1 와 1 / 1 / 1 | 같음 | 변경은 고정 |
| P2 [결정] 선빌드 단계 compileJava 실행 횟수(전 태스크) | 선빌드 없음(0) → 21 / 21 / 21 | | 결정적 |
| P3 [결정] be-run 종료 중 다른 워크트리 gradle 빌드 실패 건수 | 1(rc 1) → 0(rc 0, 시험 성공) | 1 → 0 | 개선 |
| P3 [결정] `Gradle build daemon has been stopped` 메시지 / 정리 전후 gradle 데몬 수 | 1건, 1 → 0 → 0건, 1 → 1 | | 개선(변경은 데몬 유지) |

- 기준 `b557ccbd`, 변경 dev `114f909e`(빌드 레인 2차 머지), 측정 일시 2026-10-04 16:13~16:37. 전원 연결(AC), lowpowermode 0, 측정 전용 Gradle 홈, 워커 2, 콜드는 빌드 캐시 끔·단발 데몬·`build/` 정리, 회차 전 1분 load 3.0 이하 대기.
- 콜드 기준이 실패한 이유: 모듈 7개가 각자 Gradle 프로세스로 공유 includeBuild 를 동시에 컴파일하다 산출물 폴더를 지우지 못했다(`Unable to delete directory`, 12~20초 만에 `BUILD FAILED`). S3 선빌드가 없애려던 문제라 실패 자체가 관측 결과다.
- 웜 해석 주의: 로그로 확인한 결과 웜은 데몬 유지 조건이 아니다. 기준은 종료 때 `gradlew --stop` 을 불러 회차마다 7개 프로세스가 모두 새 데몬을 띄웠고, 변경은 호출 8개(선빌드 1·모듈 7) 중 6개가 새 데몬을 띄웠다. 선빌드 비용은 따로 재지 않아 +12% 가 선빌드 때문인지 구분하지 못한다.
- 측정 사고: 첫 시도(15:41~16:13)는 스크립트가 모듈 조기 종료를 감지 못해 막혀 중단했다. 이 스크립트 결함은 rc 7 감지와 벽시계 600초 상한을 넣어 고친 뒤 처음부터 재측정했다. P3 희생 빌드는 처음 두 번이 25초 안에 끝나 무효(rc 6)였고 세 번째(`mdm :lib:test :api:test --rerun-tasks`) 값만 쓴다.
- P2 기준 횟수는 하한이고, P3 는 대상별 1회라 우연히 어긋날 여지가 남는다. 측정 규칙(교대 3회·load 기록·중앙값)은 부분 충족이다(콜드는 기준 성공 회차가 없고 웜은 데몬 유지 조건 미충족).
- 측정 스크립트는 `scripts/perf/build/` 에 있다(⑥).

### 프론트

| 항목(P 번호와 지표) | 기준 → 변경 | 증감 | 판정 |
|---|---|---|---|
| P1 [결정] 모달 열고 닫을 때 `useMessage` memo 소비자 다시 그리기 횟수 | 3 → 1 | -67% | 개선 |
| P2 [측정] m-mdm 콜드 빌드 시간(초, 중앙값) | 15.23 → 4.14 (dev efb39f2c) | -73% | 개선 |
| P2 [측정] m-mdm 콜드 빌드 최대 RSS(GB, 중앙값) | 3.35 → 0.67 | -80% | 개선 |
| P2 [측정] m-mdm 증분(웜) 빌드 시간(초, 중앙값) | 15.52 → 1.51 | -90% | 개선 |
| P2 [측정] m-mdm 증분(웜) 빌드 최대 RSS(GB, 중앙값) | 3.12 → 0.46 | -85% | 개선 |

### 측정 공통 조건

측정 PC 는 팬 없는 MacBook Air M5(16GB)다. 조정 세션의 「측정 시작」 신호 뒤 다른 레인이 조용한 때 단독으로 쟀다.

| 레인 | 측정 시각(2026-10-04) | 방식 | 1분 load | 비고 |
|---|---|---|---|---|
| 프레임워크 | 11:45~12:16 | `heavy.sh --exclusive`, 전원 연결, A·B·A·B 각 3회 이상 | 남긴 회차 2.7~4.8(5 초과는 버리고 다시) | P2 는 합성 로그(작은 5MB, 큰 200MB), P1 은 키 52개 하네스 값 |
| 프론트 P2 | 12:18~12:22 | `heavy.sh --exclusive`, 전원 연결, ABBA 4회 | 2.80~4.88 | 예열 1회(load 5.08)는 버리고 다시 |
| mcm P3 | 12:23~12:24 | 단독, A·B 번갈아 3회, warmup 300·iters 500 | 3.88~5.28 | 시험 JVM 이 C1 전용(`-XX:TieredStopAtLevel=1`)이라 절대값은 비관적 |
| MDM 백엔드 | 12:33~12:56 | `heavy.sh --exclusive` 한 번 안에서 `run-measure.sh ab all 3`, P1·P3·P5 교대 3회, P2·P4 1회 | 1.8~3.4 | SQLite 임시 파일 DB. 전원 연결 여부는 기록하지 않음 |
| 빌드·스크립트(1b) | 16:15~16:37(P1·P2 16:13~16:31, P3 16:33~16:36) | `scripts/perf/build` 원본, 서버 창에서 단독, A·B 교대 3회(P3 는 대상별 1회), 측정 전용 Gradle 홈 | 회차 전 3.0 이하로 대기, 기록 1.55~2.96 | 전원 연결(AC)·lowpowermode 0 확인. 기준 콜드는 3회 모두 실패라 중앙값 없음 |

공통 주의:

- 이 PC 는 같은 설정이 2배 흔들릴 수 있고 팬이 없어 회차가 지날수록 조금씩 느려졌다. 그래서 같은 회차 안의 비율이나 중앙값으로 비교했다.
- 쿼리 수·로그 줄 수·렌더 횟수 같은 결정적 지표는 1회로 확정했다.
- 프레임워크 P1 은 캐시 조회만 재는 하네스 값이라 실제 응답 시간 개선으로 읽지 않는다.
- 프레임워크 `/tree` N=16 의 B·C 지연은 503 을 뺀 8건만의 값이라, 16건을 모두 처리한 A 와 같은 조건이 아니다.
- DB 관련 확인은 모두 SQLite 로만 했다. 운영 DB(Oracle·PostgreSQL)와 운영 서버 수치가 같다는 보장은 없다.

### ①-2 통합 확인(브라우저) 결과

dev 를 로컬 서버(포털 5100, mcm 8100, mdm 8096, mls 8092)로 띄워 ego-browser 로 확인했다. 시나리오는 62건이다.

| 결과 | 건수 | 내용 |
|---|---|---|
| 통과 | 56 | 포털 탭·전체 화면·즐겨찾기·기본 화면, 오류 문구(S7), 전송 목록(S9·S10), 룰 화면, 컬럼 사전 설명 칸, 확정 화면 4곳 등 |
| 실패 | 2 | D-06(코드 저장 거부 오류창에 서버 코드 `CODE_FORBIDDEN_CHAR` 노출), T-06(dmd 소속 편집 팝업에서 [적용] 없이 닫으면 미적용 이동이 서버 값으로 돌아감). 둘 다 기준 태그에도 있는 기존 동작이며 리팩토링 회귀가 아니다 |
| 보류 | 4 | E-02·D-10(용어 추가는 KURE 기준 건수 8,152 유지를 위해 조정 세션이 보류), H-05(서버가 미등록 용어로 저장 거부, MDM017), E-05 의 룰 세트 편집 1곳(빈 룰 세트는 저장 단추가 꺼져 있고 흐름도 캔버스 조작이 필요해 하지 않음) |

- errors[] 실림: m-mls 공지(D-05)에서 응답 errors[] 와 화면 「- 제목: 제목은 필수입니다.」 줄을 실제로 확인했다. MDM 단위 마스터 거부 응답에는 errors[] 가 없었다.
- 서버 쓰기는 조정 세션이 승인한 범위(시험 계정 CHK_STD·CHK_STW, `CHK_` 접두 데이터, 확정·삭제 없음, 공지 비게시)로만 했다. 만들어진 `CHK_` 행은 로컬 SQLite(mcm·mdm·mls)에만 있으며 삭제는 사용자 결정이다(④).
- 브라우저 프로필이 사용자(41000132) 로그인 세션을 공유해서, 로그아웃 시나리오 때 사용자 포털 세션이 끊겼다. 지금 프로필은 admin 세션이다.

15:4x 재확인: dev `23420158` 로 서버를 다시 띄워 확인했다. 기동 ERROR 0, menuCatalog 로그 `트랜잭션 단계 등록=true`, AOP 검사 위반 0(mcm BPMN 35·mdm 26). 브라우저 8화면이 통과했다(용어 코일 22, 컬럼 7,858·두께 185, 레이아웃 확정 5, dmd 18·BASE 소속 5, 코드 17, 사용자 11, 공지 6). 콘솔 오류 0.

---

## ② 레인별 구조 변경 요약과 머지 커밋

상세(바뀌기 전·뒤, 이유, 동작 보존 근거, 되돌리는 방법)는 각 `docs/refactor-2026-10/structure-<레인>.md` 를 본다. 머지 해시는 dev 에 들어간 머지 커밋이다.

### 프레임워크 레인(a8, `refactor/framework`)

| 번호 | 한 줄 내용 | 동작 변화 | 머지 해시 |
|---|---|---|---|
| S1 | mcm·mdm·mls api 에서 methodinvoker 로그 레벨을 WARN 으로 설정 | 있음(INFO 로그 감소, 설정 변경) | 1차 bb8ee036 |
| S2 | analog 검색 풀 공유화(AnalogSearchExecutors)와 LogPattern 인스턴스 전달 | 있음(트리 파싱 동시 상한 초과 시 503, 설정 키 3개 신설, LogPattern 공개 API 삭제) | 1차 bb8ee036 |
| S3 | cactus OASIS 서비스 캐시를 CactusConcurrentCacheService 로 교체 | 있음(`cactus.oasis.cache.size` 1 미만이면 기동 실패, 상한 초과 시 FIFO) | 1차 bb8ee036 |
| S4 | OASIS ServiceStarter 를 cactus(CactusServiceStarterFactory)에서 직접 조립 | 없음 | 1차 bb8ee036 |
| S5 | cactus 특성 테스트 추가(트랜잭션·데이터소스·마이바티스·마스터코드·JPA) | 없음(시험만) | 1차 bb8ee036 |
| S6 | caravanhub 연동 클라이언트 통합(조사만, 사용자 보류, docs/idea.md 기록 6d96e86b) | 없음(보류) | 해당 없음 |
| S7 | 커밋 실패 처리 핸들러(CactusSpringTransactionHandler) | 있음(롤백된 커밋이 SUCCESS 에서 S001 비성공 응답으로, 트랜잭션 누수 정리) | 1차 bb8ee036, 재현 시험 이동은 3차 b20b16cd |
| S8 | AOP 기동 검사(`cactus.oasis.aop-check`, 기본 warn) | 설정으로 선택 | 1차 bb8ee036 |
| S9 | errors[] 보강(BusinessException 필드별 오류를 응답에 실음) | 있음(비던 errors[] 가 채워질 수 있음) | 1차 bb8ee036 |
| S10 | 결함 4건 수정(`_NM` 접미사 디코딩, alias 기본 TxMgr @Primary, 중간 Entity 삭제, MyBatis 자동설정 순서) | 있음(fix) | 1차 bb8ee036 |
| S11 | analog /tree 소비 루프(폴링 제거, 줄 유실 수정) | 있음(fix: 응답 26바이트 증가) | 2차 f2c11dd1 |
| S12 | 1차 리뷰 minor 정리(경고 문구, javadoc, 시험 추가) | 있음(AOP 경고 로그 내용만) | 2차 f2c11dd1 |

측정 기록(P1~P3, S3 BPMN 수·S9 소비 위치 정정)은 d529e992 로 들어갔다. 측정 하네스는 0d1b1980 으로 `scripts/perf/framework` 에 편입됐다.

### MDM 백엔드 레인(b9, `refactor/mdm-backend`)

| 번호 | 한 줄 내용 | 동작 변화 | 머지 해시 |
|---|---|---|---|
| S1 | 서비스 private 보조 메서드를 `MdmErrors`·`MdmStrings` 공용 메서드로 통합 | 없음 | 1차 1c124361 |
| S2 | LayoutHeaderImpact 합성 호출 경로를 묶음 조회(`composer.batch`)로 변경 | 없음(쿼리 수만 감소) | 1차 1c124361 |
| S3 | 용어 JSON 목록 파서 네 곳을 공용 코덱 `MdmJsonLists` 로 통합 | 없음(이후 D1·D2 수정으로 null 처리가 바뀜, 아래 후속 수정) | 2차 923aa9a0 |
| S4 | 용어 사전 읽기 사본을 `TermDictionaryLoader` 하나로 통합 | 없음 | 2차 923aa9a0 |
| S5 | 용어 검색 DB 1차 거름(`TermSearchPrefilter`) 도입 | 결과 동일 설계, 정렬이 `ORDER BY TERM_ID` 명시로 바뀜(운영 DB 확인 필요) | 2차 923aa9a0 |
| S6 | 컬럼 검색 DB 1차 거름(`ColumnSearchPrefilter`)과 반복문 단건 조회 세 곳의 IN 조회 | 없음(조건 없는 `search` 의 SQL 문 수는 늘 수 있음, ① 참조) | 2차 923aa9a0 |
| S7 | `MdmRuleEngine.evaluateSet` 세트 판정 준비를 엔진 안에 기억 | 없음 | 2차 923aa9a0 |
| S8 | `RuleAnalyzer.analyze`·`FlowParser.parse` 긴 메서드를 단계별 private 메서드로 분리 | 없음 | 2차 923aa9a0 |

- S 에 넣지 않은 항목: 마스터코드 선분 flush 정리(0daad719·a139fe07·8db3e93c)는 쓰기 시점 변경이라 성능 P1 에만 있고 1차 1c124361 로 들어갔다.
- 문서 수정 브랜치(`refactor/mdm-backend-docfix`, TSK-04-04 설계 F12 인용 줄 정정)는 efb39f2c, 성능 본 측정 수치는 6ed698e2, 측정 하네스는 15fb4e09 로 병합됐다.

후속 결함 수정(`fix/refactor-followups`, a8 세션이 수행, 머지 7d27869c). 구조 변경이 아니라 `fix` 이므로 S 번호가 없다.

| 항목 | 커밋 | 동작 변화 |
|---|---|---|
| D1 용어 JSON 칸 `null` 리터럴: 목록 null 로 읽혀 검색·추천이 NPE 나던 것을 빈 목록으로 읽음. 행 하나만 있어도 모든 추천 요청이 실패하던 문제 | 3e645c34 | 있음(fix). 해당 값을 가진 행도 검색·추천에서 정상 처리 |
| D2 목록 원소 `[null]`: 시스템 조건 검색과 추천 NPE. 파서가 null 원소를 버림(공백·빈 문자열 원소는 유지) | d2c7b283 | 있음(fix) |
| 커밋 뒤 캐시 갱신(`TermMngService.afterCommitOrNow`) 예외가 커밋 실패(S001)로 번지던 것을 경고 로그만 남기고 삼킴 | c5c26f15 | 있음(fix). DB 는 반영됐는데 화면은 실패로 보이던 불일치 해소. 대신 캐시가 낡을 수 있음(삭제 실패분은 추천 후보에 남을 수 있음) |
| `TermSearchPrefilter` 의 `%null%` 보존 조건 세 가지를 걷음 | 90e507e5, javadoc 7c5572af | 없음(결과 동일, 후보 행 수는 같거나 적음) |

시험 통과 수는 mdm lib 1683·api 1711 이다 ‡. 새 재현 시험이 수정 전 코드에서 실제로 실패하는지는 정적 확인만 했다.

### mcm 레인(a6, `refactor/mcm`)

| 번호 | 한 줄 내용 | 동작 변화 | 머지 해시 |
|---|---|---|---|
| S1 | 복제 값 변환 유틸을 `common.util.McmValues` 로 통합 | 없음(경고 로거 이름이 `McmValues` 로 바뀜) | 1단계 5f619b2a |
| S2 | `DataInitializer`(3,690줄)를 `init.seed` 패키지 단계 클래스로 분할 | 없음(시드 지문·SQL 골든 일치) | 1단계 5f619b2a |
| S3 | 메뉴 카탈로그 캐시(`MenuCatalog`): SEC_MENU·SEC_OBJ 전수 로드 4곳 통합, TTL 5분, 이벤트 무효화 | 있음(캐시 도입, 기동 로그 신설, 생성자 변경) | 3번 bfd25e48 |
| S4 | `CommUserMngService` 를 퍼사드 + 조회·저장·비밀번호·SSO 위임 클래스로 분할 | 없음 | 2단계 efb09d29 |
| S5 | 시드 단계 이동 후속(`MdmMenuSeeder`·`ScreenUsageSchemaArtifacts`·`PERM_ALL` 을 `init/seed/` 로) | 없음 | 2단계 efb09d29 |
| S6 | N+1·전수 로드 정리와 공개 API 확장(부서명 일괄 조회, 삭제 매핑 벌크 삭제, `searchByActor` 선택 page·size) | 있음('D' 행 둘 이상 요청의 flush 시점 차이, 현재 호출 화면 없음) | 2단계 efb09d29 |

P3 응답 시간 측정 기록 병합은 8b2dec1c 이다.

### 빌드·스크립트·E2E 레인(1b, `refactor/build`)

| 번호 | 한 줄 내용 | 동작 변화 | 머지 해시 |
|---|---|---|---|
| S1 | restart-all.sh 를 scripts/archive 로 보관 | 없음 | 1차 bb0d1dd6 |
| S2 | frontend test-results 산출물 추적 해제와 .gitignore | 없음 | 1차 bb0d1dd6 |
| S3 | be-run --all 선빌드와 dmes-up.ps1 직렬 warm-up 제거 | 있음(선빌드 실패 시 전체 미기동, `--dry-run` 추가) | 1차 bb0d1dd6 |
| S4 | be-run 종료 때 전역 `gradlew --stop` 제거, 이 체크아웃의 앱 JVM 만 정리 | 있음(데몬 최대 10분 유휴 뒤 종료) | 1차 bb0d1dd6 |
| S5 | 공통 함수 scripts/lib 추출, 모듈·포트 단일 원본, 포털 포트 5100 결함 수정 | 있음(ps1 정리·대기 대상이 5000 에서 5100 으로) | 1차 bb0d1dd6 |
| S6 | cactus-core 시험에 sqlite-jdbc 추가 | 없음(시험 전용) | 1차 bb0d1dd6 |
| S7 | mdm/api 시험 입력에 mcm 시드 파일 2개 추가 | 없음 | 1차 bb0d1dd6 |
| S8 | mcm-core 시험 입력에 mcm/api 시드 소스 세 파일 선언 | 없음 | 1차 bb0d1dd6 |
| S9 | cactus-core 시험의 sqlite-jdbc 를 실행 범위로 옮기고 hibernate SQLite 방언 추가 | 없음(시험 클래스패스) | 540ca923 |
| S10 | 일회성 스펙 17개를 e2e/archive 로 이동하고 testIgnore 추가 | 있음(E2E 기본 실행 217 에서 175개) | dd3f59e5 |
| S11 | E2E 공통 헬퍼 통합 | 없음 | dd3f59e5 |
| S12 | dmd 소속 편집 팝업 TransferList testid 반영 | 없음 | dd3f59e5 |
| S13 | E2E 기본값 결함 수정(포털 주소 localhost, 기본 아이디 admin 등) | 있음(fix) | dd3f59e5 |
| S14 | README 실행 안내 보강 | 없음(문서) | 959bf24c |
| S15 | dmes-up.ps1 -Detach 에서 백엔드가 포트를 열기 전에 끝나면 FE 정리 | 있음(pwsh 없어 미검증) | 959bf24c |
| S16 | Windows ps1 확인 체크리스트 문서(windows-ps1-checklist.md) | 없음(문서, 결과 칸 비어 있음) | 959bf24c |
| S17 | E2E mdm 스모크 스크린샷 기본 출력 위치를 test-results 로 이동 | 있음(기본 실행은 추적 png 를 덮어쓰지 않음) | 959bf24c |

머지 열은 각 커밋이 속한 가장 이른 dev 머지 하나다.

1b 2차(S18~S24, dev 에 병합됨). 머지 열의 114f909e 는 2차 머지, c936f629 는 2차 입력 선언에 맞춘 `.dflow-gates` 수정, a41ced41 은 측정 기록과 하네스다. 판정 방법은 의존성·설정값 덤프 404개 파일 diff 와 서브프로젝트 시험 수 비교이고, 기준선은 2차 직전 dev `dd3f59e5` 다.

| 번호 | 한 줄 내용 | 동작 변화 | 커밋 | 머지 해시 |
|---|---|---|---|---|
| S18 | 백엔드 버전 카탈로그 `gradle/libs.versions.toml` 도입(14개 모듈, 버전이 다른 좌표 6개는 별칭 분리, analog 제외) | 없음(덤프 404개 파일 diff 0, 허용 차이는 카탈로그 표시와 caravan-hub `camelVersion` 이동) | 1adfcf85 | 2차 114f909e |
| S19 | build-logic convention plugin(`dmes.test-conventions` 14개 모듈, `dmes.business-module` 5개 모듈)과 settings 헬퍼 `dmesIncludeBuild` | 없음(덤프 diff 0, 14개 모듈 시험 수 기준선과 같음). Gradle 9.3.1 제약으로 test-slot 은 각 모듈 루트 `apply from` 유지 | d456a866, 00461248, 03abab9b, d77c94d9, 25b89567 | 2차 114f909e |
| S20 | `buildAll`·`testAll`·`cleanAll` 에 mcm-core·mls·caravan-console·analog 추가(11개에서 15개) | 있음(대상 증가, `buildAll` 1회 실행 성공 1분 52초). `testAll` 은 서브프로젝트 시험을 여전히 안 돌림(④b) | 01c3d678, 54e6f2ca | 2차 114f909e |
| S21 | 시험 입력 정리: mdm/api 에서 `DataInitializer.java` 제거(C1), mcm-core 에 BPMN 2개 선언(C2). 게이트 줄은 후속 커밋 56078726 | 없음(입력 선언만 바뀌어 최신 여부 판정이 달라짐) | 8bb30ee4, 5c6f2383, 54e6f2ca | 2차 114f909e, `.dflow-gates` c936f629 |
| S22 | mybatis-spring-boot-starter 3.0.5 통일 | 있음(해석 4좌표 변화: starter·autoconfigure·mybatis-spring 3.0.4 에서 3.0.5, mybatis 3.5.17 에서 3.5.19. 전이 선언 spring-boot 3.4.0 에서 3.5.0 은 해석 4.0.6 불변). 회귀 시 2a95c5e7 만 되돌림 | 2a95c5e7 | 2차 114f909e |
| S23 | 빌드 불변 판정 도구 `scripts/build-verify` 보관 | 없음(도구 추가) | 7cf41d92 | 2차 114f909e |
| S24 | 성능 측정 스크립트 `scripts/perf/build` 보관(P1~P3 하네스 6개와 README, `.gitignore` 예외 한 줄) | 없음(도구 추가, `bash -n` 만 확인). 원본 대비 기본값 둘 변경: 변경 커밋 기본이 HEAD, P3 희생 빌드가 `mdm :lib:test :api:test --rerun-tasks` | 4101c516, a4abb99e | 측정 기록·하네스 a41ced41 |

- 2차 시험 결과: mcm-core 887, mcm lib 18·api 43, mls lib 8·api 50, mdm lib 1652·api 1638, cactus-core 853, oasis-core 686, caravan-hub 78 등 모두 실패 0, 기준선과 같다. analog 의 기준선 실패 83건은 그대로다.
- 기존 빌드 실패 2건(cactus-core 단독 빌드의 oasis checkstyle 설정 파일 없음, caravan-hub 단독 빌드의 caravan-core 해석 실패)은 2차 이전부터 있었고 고치지 않았다.

### 프론트 레인(c3, `refactor/frontend`)

| 번호 | 한 줄 내용 | 동작 변화 | 머지 해시 |
|---|---|---|---|
| S1 | portal-shell 거대 컴포넌트(1218줄)를 훅 4개로 분리 | 없음 | 1차 f2056fbf |
| S2 | m-mdm 타입 선언 생성을 tsup dts 에서 tsc 로 전환 | 없음(새 화면은 tsup entry 와 exports 두 곳에 등록) | 1차 f2056fbf |
| S3 | shared 루트 index 를 이름 나열 export 로 바꾸고 @deprecated 표시 | 없음(에디터·lint 경고 신규) | 1차 f2056fbf |
| S4 | ErrorModal 본문이 줄바꿈을 줄로 나눠 보임(`white-space: pre-line`) | 있음(표시 변경, 사용자 승인) | 1차 f2056fbf |
| S5 | OASIS 호출 계층을 `@dk-oasis/shared/http` 로 모음 | 없음 | 2차 72a0b65b |
| S6 | message 없는 errors 항목을 오류 문구에서 버림 | 있음(fix) | 2차 72a0b65b |
| S7 | OASIS 오류 문구 통일(안 C: 기본 문구 + 항목별 줄) | 있음(오류 문구 형식 변경) | 2차 72a0b65b |
| S8 | shared 새 컴포넌트 등록(card·transfer-list·HtmlFormatField)과 화면 교체 | 없음 | 2차 72a0b65b |
| S9 | 전송 목록 행 안 체크박스를 직접 눌러도 선택되게 함 | 있음(fix) | 2차 72a0b65b |
| S10 | dmd 소속 편집 패널을 shared TransferList 로 교체(안 B) | 있음(모습·testid 변경, 사용자 승인) | 2차 72a0b65b |

- P1(MessageProvider context 값 고정, 46b21c9b)은 구조 변경이 아니라 S 에 넣지 않았고 1차 f2056fbf 에 포함됐다.
- 기록 문서 병합은 f4e5c4da, 마지막 기록(S7 알려진 제약 D-06, 브라우저 통합 확인 결과)은 1ca202f7 이다.

---

## ③ 사용자 결정 (확정된 것)

### 사용자 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 오류 문구 | 안 C: 기본 문구 + `- 항목명: 메시지` 줄. 서버 errors[](a8)와 화면(c3)을 실제로 확인(D-05) | S7, ①-2 |
| ErrorModal 줄바꿈 | `white-space: pre-line` 승인 | S4 |
| dmd 소속 편집 패널 | 안 B: shared TransferList 로 교체(dmc 와 같은 모습). E2E 통과 | S10 |
| Nexus 비밀번호(admin/admin123) | 실서버 적용 때 처리. 구현 커밋 없음 | 2026-10-04 결정 |
| caravanhub 연동 클라이언트 통합 | 이번 리팩토링에서는 보류. 설정 prefix 가 다른지 확인한 뒤 다시 다룬다 | 6d96e86b(docs/idea.md) |
| m-mcm OASIS 호출 복사본 20개 공통화 | 이번에는 미룸. 정리 문서만 남김 | aea84d44 |
| `SecUserService.searchUsers` 죽은 경로 정리 | 미룸 | |
| 화면 렌더링 시간 측정 | 리팩토링이 끝난 뒤 따로 시작 | e6884bbd(docs/idea.md) |
| 삭제 대신 archive | 쓰지 않는 파일은 `git mv` 로 archive 이동 | README.md §3 |
| 작업 방식 | 레인은 Workflow 로, 단계마다 model·effort 명시 | README.md §1 |
| 1b 2차 ② 전이 선언 | mybatis 3.0.5 의 pom 이 전이로 선언하는 spring-boot 계열 선언 버전 3.4.0 → 3.5.0 을 승인(해석 버전 4.0.6 불변, Spring Boot BOM 이 덮음). org.mybatis 변경의 일부로 조정 세션이 승인 | S22 |

### 조정 세션(cb) 결정 — 마감 보고에 올린 것

| 레인 | 결정 |
|---|---|
| 공통 | 머지 순서는 '준비된 레인부터'(79531709). 1b 는 전용 heavy 칸(`DFLOW_HEAVY_DIR=~/.dflow/locks/heavy-1b`, `DMES_TEST_SLOTS=0`)을 쓴다. 측정은 「측정 시작」 신호 뒤 단독 |
| 프레임워크(a8) | split package 다리 클래스(`CactusTransactionWarehouseView`·`Cleaner`)는 유지. 다중 TxMgr 는 첫 실패 시 나머지를 롤백하고 alwaysCommit 은 삼킴 유지. 화면은 일반 문구, 상세는 로그. errors[] 는 BusinessException 만. begin() 시작 실패도 정리 |
| 프레임워크(a8) | 직접 등록 afterCommit 중 예외가 날 수 있던 `TermMngService` 한 곳은 경고 로그로 삼키게 수정(c5c26f15). 다른 두 곳은 이미 예외를 삼킨다 |
| 후속 결함(a8) | D1 은 TERM 행 하나로 recommend 전체가 NPE 라 수정. D2([null] 원소)도 함께 수정 |
| mcm(a6) | `ScreenMenuCatalog` 범위 확대, 시험 3개 경로, `.dflow-gates` 변경 승인 |
| 프론트(c3) | shared 루트 index 는 이름 나열로 고정(S3). 브라우저 쓰기 시나리오는 CHK_ 접두 데이터만, 용어 추가·확정 전이 금지, 공지 비게시 |
| 빌드(1b) | 단계별 시험 축소(의존성·설정값 덤프 차이 0 으로 판정). testAll 이 서브프로젝트 시험을 안 돌리는 문제(④b)는 2차 범위 밖 후속. pwsh 설치 금지. mybatis 통일은 맨 끝. E2E C군은 ①안만. 성능 측정은 전원을 연결한 상태에서 한다(사용자 결정, 측정은 AC·lowpowermode 0 으로 수행) |
| MDM(b9) | 용어 추가 시험 보류(KURE 기준 건수 8,152 유지) |

---

## ④ 사용자 결정 대기·후속 목록

우선순위(작성자 제안, 사용자가 조정):

- 높음: 운영 반영 전에 확인·결정해야 하거나, 두면 사용자에게 보이는 문제나 숨은 실패가 남는 것
- 중간: 동작에 영향이 있는 후속이거나 판정이 필요한 것
- 낮음: 정리·문서·선택 사항

번호는 레인 초안의 번호를 따랐다(a8-N, b9-N, a6-N, 1b-N, c3-N). 같은 일을 여러 레인이 적은 경우 합쳤다.

### 4.1 사용자 결정 대기

| 우선 | 번호 | 항목 | 현재 상태 | 결정할 것 |
|---|---|---|---|---|
| 높음 | c3-D06 | D-06 코드 저장 거부 오류창에 서버 코드 노출 | 기존 동작(기준 태그도 같음). 서버가 `meta.message` 에 `<키>[<칸>] <이슈 코드> <문구>` 를 이어 붙여 S7 포함 판정으로 한 줄만 보임. 룰 세트·도메인 저장 거부도 같은 모양일 것으로 추정(정적, 화면 확인은 D-06 만) | ① 서버가 `meta.message` 를 기본 문구만 두고 상세는 errors[] 에만 싣는다(cb 권장, shared 변경 없음, 서버 시험·E2E 문구 단언도 수정). ② shared/http 에서 분해한다(공개 동작 변경이라 승인 대상) |
| 높음 | b9-2 | S5·S6 검색 쿼리를 SQLite 로만 확인 | `UPPER`·`LIKE ... ESCAPE '!'`·상관 `EXISTS`·IN·`ORDER BY TERM_ID`. Oracle·PostgreSQL 은 정적 리뷰뿐 | 운영과 같은 DB 에서 대소문자·ESCAPE·CLOB 비교와 결과 동일성을 확인한 뒤 반영할지, 확인 전 반영 보류할지 |
| 높음 | 1b-4 | Nexus 자격증명 하드코딩(cactus-core·caravan-core·caravan-console build.gradle) | 사용자 결정으로 실서버 적용 때 처리. 비밀번호가 git 이력에 남아 있음 | Nexus 쪽 비밀번호 교체. 구현은 `credentials(PasswordCredentials)` + `~/.gradle/gradle.properties` 안, 검증은 `publish --dry-run` 까지만 |
| 높음 | 1b-4b | `testAll`·full 게이트가 mcm·mls·mpn·mpp·mqc·analog 의 lib·api 시험을 안 돌림 | 루트 `:test` 만 가리켜 NO-SOURCE 0건(mdm 만 집계). 게이트가 초록이어도 이 시험들은 돌지 않는다(저장소를 읽어 정적으로 확인했고 2차 판정에서 시험 수로도 확인). cb 가 2차 범위 밖 후속으로 정함 | 안 A(각 모듈 루트 `:test` 에 mdm 식 dependsOn, 숨은 실패가 드러나 full 게이트가 빨개질 수 있음) 또는 안 B(게이트 명령을 서브프로젝트 경로로 변경). analog(상시 실패 83건)를 집계에 넣을지. 1b 권고는 안 A, analog 제외 |
| 높음 | 1b-1 | ps1 미검증(S3·S4·S5·S15) | pwsh 가 없어 구문 분석·실행 모두 못 함. pwsh 설치는 cb 가 금지. 확인 항목은 windows-ps1-checklist.md, 결과 칸 비어 있음 | Windows 에서 체크리스트를 직접 돌려 결과 기입 |
| 중간 | b9-1 | 기존 결함 후보 9건(D3~D11) | D1·D2 는 수정됨. 나머지는 특성 시험이 현재 동작으로 고정. 코드로 재확인해 모두 참(D3 L16 순번 포함, D4 MDM018 충돌 순서 미정, D5 REVERSE 중복, D6 용어 ID 존재만 검사, D7 소수 termId 절삭, D8 전각 공백, D9·D10 FlowParser 문구, D11 죽은 분기) | 항목별 별도 fix 커밋 / 보류 / 결함 아님 종결(D10 은 우선순위 낮음) |
| 중간 | b9-3 | 조건 없는 컬럼 `search` 의 SQL 문 수 맞바꿈(S6, c273897e) | 측정 끝(① 참조). 실제 데이터 k=1,461 은 4→6문·읽는 행 -24%·응답 차이 없음, k=8,000 은 19문·응답 +126%. 조건 있는 검색은 -90~-95%. 커밋 문구 "search 4→4" 는 시험 규모 기준이라 미수정. 운영 DB·호출 빈도는 미확인 | (가) 유지하고 k 가 수천으로 늘 때 용어 읽기를 한 번에 합치는 보정을 후속으로(제안, 미구현) (나) 운영 DB 에서 교대 반복 측정 뒤 유지 또는 `git revert c273897e`. b9 권고는 유지 + 운영 확인 |
| 중간 | c3-T06 | T-06 dmd [편집] 클릭이 행 선택으로 번져 미적용 이동이 서버 값으로 덮임 | 기존 동작(기준 태그도 같고 관련 파일 변경 없음). 닫을 때·다시 열 때 view 요청 횟수는 정적 추정이라 네트워크 탭 확인 권장 | (가) 결함으로 보고 번짐을 막거나 미적용 변경이 있으면 다시 읽지 않게 고친다 (나) 의도라면 체크리스트 T-06 기대를 고친다 |
| 중간 | a8-4 | analog fixture 미커밋으로 시험 83건 상시 실패(api 4, core 79) | 기준과 dev 에서 똑같이 실패해 회귀 아님. fixture-logs 가 어느 ref 에도 커밋된 적이 없어 출처·반출 가능 여부는 원 작성자 확인 필요 | (a) fixture 를 커밋·생성한다 (b) 시험을 제외·삭제한다 (c) 그대로. a8 권고는 (a) |
| 중간 | a6-2 | pwdinit SSO 일괄 분기 개선안 | 행마다 bcrypt(약 50~100ms)와 단건 UPDATE, 한 요청이 트랜잭션 하나. 구현 안 함(P4 측정 안 함). 없는 USER_ID 에도 비밀번호 행이 만들어지는 결함 의심 | 구현 여부와 범위(해시 병렬화, JDBC batch 등) |
| 중간 | a6-6 | mcm 결함 의심 목록(고치지 않음, 현재 동작 고정) | `searchRoleGrp` 의 MSSQL 전용 함수(운영이 Oracle·PostgreSQL 이면 실패 가능), `saveCmUser` null 덮어쓰기, 같은 날 이력 덮어쓰기, `reRegCmUser` 0건 무예외, `auditLog.bpmn` 분기 충돌 의심(확인 안 됨), `McmValues.toIntOrNull` 절단 등 | 우선순위와 `fix(...)` 커밋 여부 |
| 중간 | 1b-3 | E2E 후속 | 스위트 정리 단계 없음(접미 E2EX 고정), `e2e-clean-data.sh` 누락, TC-DMA-COL-02 공용 DB 의존, 공통관리 메뉴 4개 미시드, `local-run --mdm` 이 mls 를 안 띄워 mdm-user setup 실패, C군 실행 잔여 행 | 처리 순서와 범위(삭제 계열은 사용자 결정) |
| 중간 | DB-1 | 공용 로컬 DB 에 남은 시험 행 | c3 브라우저 확인의 `CHK_` 행(사용자 CHK_STD·CHK_STW 등, mdm 단위·도메인·헤더·레이아웃·코드·데이터·룰·세트 모두 DRAFT 또는 INUSE, mls 공지 NT202610040001 비게시)과 1b E2E 잔여 행. 목록은 c3 `chk-rows.md` | 삭제할지 둘지(삭제는 사용자 결정). 확정(RELEASED)된 것은 없음 |
| 중간 | mdm-404 | `/api/mdm/mdmMeta/columns` 404 | MDM 화면을 열 때 shared 의 mdm-meta store 가 mdm 모듈에도 메타를 요청하지만 mdm(8096)에는 그 엔드포인트가 없다. 기준 태그부터 같은 코드라 기존 동작이고 화면 영향은 없다(우선순위는 낮음~중간) | mdm 에 엔드포인트를 둘지, store 가 mdm 모듈을 건너뛰게 할지 |
| 중간 | 공통 | main·dev 원격 푸시 | `6a016622` 까지 원격(origin/dev·origin/main)에 푸시됨. 그 뒤 머지(1b 2차 114f909e, c936f629, a41ced41 등)는 아직 원격에 없다 | 푸시할 시점과 범위 |
| 중간 | c3-3 | m-mcm OASIS 호출 복사본 20개 공통화 | 미룸(확정). 문서 `m-mcm-api-commonization.md` 의 전제는 S5 머지(72a0b65b)에 맞춰 갱신 확인 필요. 공통 계층에 `basePath` 필수 유지, 경로 통일 금지 | 문서 §7 의 6건: 1~3단계 시기, 4단계(HTTP 계층 통일) 여부, `ObjectPickerModal` 오류 노출, `userId:"admin"` 제거, 선택 C 켜는 시점, 가이드 §7-A-2·예제 갱신 |
| 낮음 | a8-3 | 백업 브랜치 `archive/a8-backup-e71aa0b0`, `archive/1b-build-logic-pre-slotfix` | `branch -D` 금지 규칙으로 남아 있음. a8 백업은 코드 차이가 없음 | 지울지 남길지 |
| 낮음 | a8-5 | 시작 단계 예외 메시지가 TxMgr 별칭을 `meta.message` 로 노출 | 기존 동작. 프론트에 이 문자열을 읽는 호출부는 없음(코드 확인) | 일반 문구와 ERROR 로그로 맞출지 |
| 낮음 | b9-4 | S1 남은 private 사본 5곳(RuleConfirm·RuleSetConfirm·CodeConfirm·RuleSetEdit) | 본문은 정본과 같지만 레인 금지 파일이라 치환 못 함. 금지 목록 원문은 저장소에 없어 확인 불명(조정 세션 메시지가 정본) | 금지를 풀고 기계 치환할지 |
| 낮음 | b9-5 | S7 기억 효과의 서비스 경로 미측정 | 측정은 오래 사는 엔진 경로만. mdm `StoredDefinitionLookup` 경로는 키·요청마다 새 엔진 때문에 놓칠 수 있음. `MdmCachedDefinitions` 변경 생산자 없음은 정적 grep 기준 | 호출 경로별 측정 뒤 유지 여부 |
| 낮음 | a6-1 | `SecUserService.searchUsers` 죽은 경로 | 실제 `@Primary` 구현의 `findAll()` 이 빈 리스트라 항상 빈 결과. 정리는 미룸(확정) | 삭제할지, 보관할지 |
| 낮음 | a6-3 | AuditLog `searchByActor` page·size | `src/frontend` 호출 0건. 인자 없으면 이전과 같음 | 화면이 page·size 를 보내게 할지 |
| 낮음 | a6-4 | MSSQL DDL·시드 SQL 은 실제 MSSQL 로 안 돌림 | 가짜 EntityManager SQL 골든 4시나리오와 SQLite 시드 지문(51테이블·245행)으로만 확인 | 실제 시드 실행을 확인할지(MSSQL 은 거의 안 쓰는 방언, 필요성 포함) |
| 낮음 | a6-7 | mdm 시드 위치 목록 | 지시의 '117곳'은 재현 안 됨(호출 지점 99, 첫 부팅 행 약 140) | 세는 기준과 '117곳' 출처 확인 |
| 낮음 | a6-8 | 메뉴 캐시 스칼라 투영 적재 | 현재 BPMN 이 요청당 한 번만 부르고 open-in-view=false 라 한계는 열리지 않음. 호출부 타입 변경 필요 | 후속으로 할지 |
| 낮음 | 1b-2 | dmes-up -Detach 8분 시간 초과 분기에서 FE 잔존 | `dmes-down.cmd` 로 정리. 빈 `~/.gradle` 의 새 PC 는 선빌드 때문에 8분을 넘길 수 있음 | 시간 초과 분기에서도 FE 를 정리하게 고칠지, 안내만 둘지 |
| 낮음 | 1b-5 | E2E 스크린샷 출력 위치 확대 | S17 은 mdm 스모크 두 스펙만. docs/mdm/tasks 에 쓰는 스펙 15개는 추적 png 를 계속 덮어씀 | 같은 도우미(taskScreenshotPath)로 옮길지(1b 권고) |
| 낮음 | c3-2 | m-mcm eslint 23건(react-hooks 규칙) | 동작 영향이 있는 수정(B)이라 고치지 않음. cb 수용 | 그대로 보류 / 별도 작업으로 정리 |
| 낮음 | c3-4 | m-mdm 단위 마스터 거부 응답에는 errors[] 가 없음 | 화면 쪽은 끝. 서버 경로가 상세를 안 싣는 곳 | 필요하면 해당 경로가 `BusinessException.getErrors()` 를 채우게 할지(mdm 후속) |

### 4.2 후속 작업(결정이 이미 났거나 결정이 필요 없는 일)

| 우선 | 레인 | 후속 | 비고 |
|---|---|---|---|
| 중간 | b9 | 정식 성능 측정은 끝났으나 운영 DB(Oracle·PostgreSQL)에서의 재측정은 남음 | 본 측정은 SQLite |
| 중간 | 공통 | 측정 하네스를 새 경로(`scripts/perf/`)에서 실제로 한 번 돌려 확인 | framework·mcm·frontend·mdm-backend 는 편입 때 경로·환경변수 방식만 바꿨고 실측은 안 함. 처음에는 dry 로 돌린다(⑥). 빌드(1b)는 원본으로 쟀고 저장소 판은 `bash -n` 만 확인 |
| 중간 | 프레임워크(a8) | oasis 버전 업 체크리스트에 다리 클래스 2개가 기대는 메서드 확인 항목 추가 | cb 가 다리 클래스 유지로 결정한 데 따른 후속 |
| 낮음 | mcm(a6) | 가이드 04·02 문서의 옛 `DataInitializer.java` 위치 안내 갱신, 이동한 본문 안 줄 번호 주석·javadoc `{@link}` 정리, `UserPermCache` 가 `RoleChangedEvent` 만 구독하는 기존 한계 | 빌드 영향 없음 |
| 낮음 | 프론트(c3) | `structure-frontend.md` 「진행 중」 절과 S7 의 서버 errors[] 서술은 f4e5c4da·1ca202f7 에서 고침. 남은 확인은 D-06 방향 결정 뒤 | |
| 낮음 | 1b | 기존 빌드 실패 2건: cactus-core 의 oasis checkstyle config 없음, caravan-hub 단독 빌드의 caravan-core 해석 실패 | structure-build.md 「2차 공통」 에 기록됨. 2차에서 고치지 않았다 |
| 낮음 | 사용자 환경 | 브라우저 프로필(사용자 41000132)이 admin 세션으로 바뀌어 있어 재로그인 필요 | ①-2 참조 |
| 중간 | 범위 밖 | 화면 렌더링 시간 측정: 진행 중(opencode 워커, 브랜치 `perf/render-mdm`, 결과는 `docs/perf-render/`) | 리팩토링 끝난 뒤 따로 시작하기로 한 항목(e6884bbd) |
| 낮음 | 범위 밖 | 조정자 스킬 설계(docs/superpowers/specs/2026-10-04-coordinator-skill-design.md, 95e7740d·e9855616·6a016622)는 리팩토링 범위 밖 후속 | 결정 대기 항목은 해당 문서에 있다 |

---

## ⑤ 운영 반영 주의

### 레인별 상위 항목

레인 초안의 '운영 반영 때 주의할 점' 중 운영자에게 꼭 필요한 것만 레인별 3개 이내로 골랐다. 전체는 각 structure 문서와 레인 초안을 본다.

#### 프레임워크(a8)
1. 커밋 실패가 숨어 있던 업무가 SUCCESS 에서 S001 비성공 응답으로 바뀐다(S7). 다중 TxMgr 에서 첫 실패 시 나머지는 롤백하고 커밋된 것은 남으며, "일부만 반영" 은 ERROR 로그에서 txId·requestId 로 찾는다.
2. 기동 설정과 로그가 바뀐다. `cactus.oasis.cache.size` 1 미만이면 transactional 모드에서 기동 실패(S3), `cactus.oasis.aop-check` 기본 warn 으로 기동 경고 신규(S8), mcm·mdm·mls api 의 methodinvoker 로그는 WARN 이라 줄어든다(S1, 되돌리려면 `logging.level.com.dongkuk.oasis.methodinvoker` 를 올린다).
3. analog 는 검색 풀을 공유하고 트리 파싱 동시 수가 상한(`tree_parse_pool_size`, 기본 8)을 넘으면 503 이 나온다. 설정 키 `file_search_pool_size`·`range_search_pool_size`·`tree_parse_pool_size` 가 신설됐고 `LogPattern.getInstance`·`loadPattern` 이 사라졌다.

#### MDM 백엔드(b9)
1. 용어·컬럼 검색 쿼리가 `UPPER`·`LIKE ... ESCAPE '!'`·상관 `EXISTS`·IN 으로 DB 에 걸리므로 Oracle·PostgreSQL 에서 대소문자·ESCAPE·CLOB 비교와 결과 동일성을 먼저 확인한다(SQLite 에서만 시험).
2. 용어 검색 정렬이 DB 기본 순서에서 `ORDER BY TERM_ID` 명시로 바뀌고, 조건 없는 컬럼 `search` 는 SQL 문 수가 4 에서 3 + ⌈k/500⌉ 로 늘 수 있다(k = 결과가 참조하는 서로 다른 용어 ID 수, 용어가 수천이면 느려질 수 있음).
3. 마스터코드 선분 조작은 flush 시점이 바뀌는 쓰기 시점 변경이다. 데이터 영향은 없으나 행 단위 DB 오류보다 뒤 행의 업무 검사 예외가 먼저 나올 수 있다. 용어 JSON 칸의 `null` 리터럴·`[null]` 원소는 이제 NPE 대신 빈 목록·무시로 처리된다(D1·D2 수정, 운영 방언에는 `json_valid` CHECK 가 없어 운영 DB 의 실제 저장값은 확인 필요). 용어 저장·삭제 뒤 캐시 갱신 실패는 이제 응답을 실패로 만들지 않고 로그만 남기므로 캐시가 낡을 수 있다.

#### mcm(a6)
1. 메뉴·OBJ 변경은 같은 JVM 에서는 즉시 반영되지만 다중 서버의 다른 인스턴스와 운영자의 직접 SQL 변경은 TTL 5분 뒤에 반영된다.
2. 기동 후 `[menuCatalog] 트랜잭션 끝 무효화 리스너` 로그가 `트랜잭션 단계 등록=true` 인지 확인한다. 적재 잠금 대기가 2초를 넘으면 WARN 을 남기고 직접 적재로 물러난다.
3. `parseLocalDateTime` 실패 경고의 로거가 서비스 로거에서 `[McmValues.parseLocalDateTime]` 로 바뀌었으므로 서비스 로거 이름을 보는 로그 필터·알림을 확인한다.

#### 빌드·E2E(1b)
1. be-run --all(모듈 2개 이상)은 선빌드나 계획이 실패하면 아무 모듈도 띄우지 않고 exit 1 로 끝난다(S3). 우회는 `BE_PREBUILD=0`, `BE_PREBUILD_CONTINUE=1` 이다.
2. be-run 종료 때 전역 `gradlew --stop` 을 부르지 않아 다른 워크트리 빌드가 죽지 않는 대신 데몬이 최대 10분 유휴 뒤 내려간다(S4).
3. ps1 변경(S3·S4·S5·S15)은 pwsh 가 없어 미검증이고 포털 기본 포트는 5100 이다. scripts/lib 가 없으면 sh 스크립트가 `[error] scripts/lib 없음` 으로 종료하므로 심볼릭 링크는 디렉터리 단위로 건다.

#### 프론트(c3)
1. 오류 문구가 `기본 문구\n- 항목명: 메시지` 형식의 여러 줄로 보일 수 있다(S4·S7). 서버가 errors[] 를 싣는 경로만 해당하고 `shared` 를 쓰는 모든 화면의 오류 문구에 줄이 늘 수 있다. 코드 저장 거부 등 서버가 `meta.message` 에 이슈 코드를 붙이는 경로는 전과 같이 코드가 보인다(D-06).
2. dmd 데이터 항목 소속 편집 화면의 모습·testid 가 바뀌고(체크박스 선택, `>`·`<` 는 선택이 있어야 활성, `>>`·`<<` 와 건수 추가), 전송 목록 체크박스를 직접 누르면 이제 선택된다(S9·S10). 운영자 안내가 필요할 수 있다.
3. m-mdm 빌드 구조가 바뀌었다(S2). 새 화면은 tsup entry 와 package.json exports 두 곳에 넣어야 하고, 서브패스 3개(card, transfer-list, html-editor)를 쓰는 모듈은 shared 를 먼저 빌드해야 한다.

### 운영 확인 체크리스트

| 항목 | 내용 | 출처 레인 |
|---|---|---|
| mcm 기동 로그 | 머지 뒤 첫 dev 기동 로그에서 `grep -F '[menuCatalog] 트랜잭션 끝 무효화 리스너'` 가 `트랜잭션 단계 등록=true` 인지, `=false` 면 원인 조사 | a6 |
| 검색 쿼리 방언 | Oracle·PostgreSQL 에서 용어·컬럼 검색의 대소문자·ESCAPE·CLOB 비교, 후보 행 수·결과 동일성, `ORDER BY TERM_ID` 응답 순서 | b9 |
| 용어 JSON 저장값 | 운영 DB 에 `null` 리터럴·`[null]` 이 실제로 저장돼 있는지(D1·D2 입력 가능 여부) | b9 |
| 마스터코드 선분 flush | 쓰기 시점이 바뀌었으므로 flush 순서에 기댄 동작과 오류 선후 변화가 없는지 | b9 |
| 커밋 실패 동작 | 운영 DB(Oracle·PostgreSQL)에서의 커밋 실패 동작과 예외 타입(시험은 SQLite 만) | a8 |
| `cactus.oasis.aop-check` | 기본 warn, 운영 값은 사용자 결정. WildFly 시스템 프로퍼티·환경변수로 덮었는지 | a8 |
| 호스트 설정 | `cactus.oasis.cache.size` 1 미만 호스트(기동 실패), 커밋 실패 응답을 SUCCESS 로 기대하던 호출부, analog 를 라이브러리로 쓰는 외부 코드 | a8 |
| Windows ps1 | windows-ps1-checklist.md 를 Windows 에서 실행하고 결과 칸 기입 | 1b |
| Nexus 비밀번호 | 실서버 적용 때 교체(④ 1b-4) | 1b |
| mybatis 3.0.5 통일 | 3.0.4 를 쓰던 모듈(cactus-core·mcm-core 경유 업무 모듈)이 3.0.5 로, mybatis 가 3.5.17 에서 3.5.19 로 바뀐다. 시험은 기준선과 같지만 운영 DB 동작은 반영 때 확인 | 1b |
| 로그 필터·알림 | mcm `parseLocalDateTime` 경고 로거 이름 변경, methodinvoker 로그 레벨 | a6, a8 |

---

## ⑥ 재현 방법 (`scripts/perf/`)

측정 하네스는 모두 저장소 `scripts/perf/` 에 있다. 편입할 때 PC 마다 다른 경로는 환경변수로 받게 바꿨다. 새 경로에서 실제 측정은 돌려 보지 않았으므로(빌드는 원본으로 잼), 처음에는 dry 로 가동을 확인한다.

| 레인 | 경로 | 재는 것 | 실행 | 가동 확인 |
|---|---|---|---|---|
| 프레임워크 | `scripts/perf/framework/` | P1 캐시 적중, P2 analog 동시 검색, P3 로그 줄 수 | `run_all.sh`(P1·P2·P3 일괄) 또는 `p1_cache.sh 3`·`p3_logs.sh`·`p2_build.sh`→`p2_run.sh 3`→`p2_cleanup.sh`. 전체 합계 약 35~45분 | `DRY=1` |
| MDM 백엔드 | `scripts/perf/mdm-backend/` | P1~P5 | `run-measure.sh ab all 3 --exclusive`. 워크트리 2개(`MEASURE_BASE_WT`·`MEASURE_DEV_WT`)와 로컬 MDM DB 사본(`MDM_MEASURE_SOURCE_DB`)이 필요. 정식 측정은 약 23분 | `--dry-run` |
| mcm | `scripts/perf/mcm/` | P3 `getMyMenus` 응답 시간(SELECT 수는 `MenuCatalogCallersSelectCountTest` 가 맡음) | `perf-mcm-p3.sh all 3 --cleanup` | `perf-mcm-p3.sh all 1 refactor-2026-10-base HEAD --cleanup 20 50` |
| 프론트 | `scripts/perf/frontend/` | P2 m-mdm 콜드·웜 빌드 시간·최대 RSS | `bash scripts/perf/frontend/p2-measure.sh 4`(ABBA 4회). 2026-10-04 측정 구간은 약 4분 30초(의존성 설치·shared 빌드 제외) | dry 옵션 없음 |
| 빌드·스크립트 | `scripts/perf/build/` | P1 `be-run.sh --all` 7개 포트 LISTEN 까지 시간(콜드·웜), P2 콜드 기동 중 includeBuild compileJava 횟수, P3 be-run 종료가 다른 워크트리 빌드에 주는 영향 | `run_all.sh [변경 커밋]`(P1~P3 일괄과 요약) 또는 `p1_boot.sh both 3`→`p2_count.sh`→`p3_stop.sh`→`summarize.sh`. 서버 창(포트 8092~8191 비움), JDK 21, 저장소 밖 절대 경로 `PERF_RESULTS`, 레인 전용 heavy 칸이 전제. 2026-10-04 본 측정과 같게 재려면 `run_all.sh 114f909e` | 없음(`bash -n` 만 확인) |

공통 사항:

- 기준은 `refactor-2026-10-base`, 변경은 지정 커밋(frontend·mcm 의 기본값은 `dev`, framework 는 `HEAD`, mdm-backend 는 `923aa9a0`, build 는 저장소 현재 `HEAD`)이다. 이전 측정 때 쓴 커밋은 각 README 에 적혀 있다.
- 측정 전에 PC 를 조용하게 하고(다른 레인·서버·빌드 없음, 전원 연결) 같은 설정을 3회 이상 번갈아 잰다. load(1분) 5 를 넘은 회차는 버린다. 독점은 `.claude/skills/dflow-dev/scripts/heavy.sh --exclusive` 로 한다.
- 결과 파일은 저장소 밖(`${TMPDIR}/dmes-perf/...` 등)에 쌓이며 저장소에 넣지 않는다. 수치는 `docs/refactor-2026-10/perf-<레인>.md` 에 옮겨 적는다.
- 도커는 쓰지 않는다. DB 시험은 SQLite 로만 한다.
- `HEAVY_CMD` 환경변수는 framework·mcm 에서는 gradle 을 감싸는 줄 세우기 명령이고 frontend 에서는 상태 기록용 경로라 뜻이 다르다. 한 셸에 공용으로 export 하지 않는다.
- mdm-backend 의 P3·P4 는 로컬 MDM DB 사본이 있어야 시작한다(합성으로 대신하지 않는다). 사본은 `sqlite3 <본 체크아웃>/src/backend/mdm/data/mdm.db ".backup '<저장소 밖>/mdm-copy.db'"` 로 만든다.

---

참고한 정본 파일(절대 경로)
- `/Users/jji/project/dmes-standard/docs/refactor-2026-10/perf-framework.md`, `perf-mdm-backend.md`, `perf-mcm.md`, `perf-frontend.md`, `perf-build.md`, `structure-build.md`, `README.md`
- `/Users/jji/project/dmes-standard/scripts/perf/{framework,mcm,frontend,mdm-backend,build}/README.md`
