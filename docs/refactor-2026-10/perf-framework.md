# 프레임워크 레인 성능 비교 기록

기준(before)은 태그 `refactor-2026-10-base`(b557ccbd)이고, 변경(after)은 `refactor/framework` 의 머지 대상 커밋이다. 기준은 별도 워크트리에서 잰다.
**수치는 조정 세션의 「측정 시작」 신호 뒤에 잰다.** 지금은 항목·지표·절차만 적었고 수치 칸은 비워 둔다.

공통 절차(README §6.2):
- 기준과 변경을 A·B·A·B… 로 번갈아 각 3회 이상 재고, 회차마다 값과 `uptime` 의 1분 load 를 적는다. 결론은 중앙값으로 낸다.
- 쿼리 횟수·로그 줄 수처럼 편차가 없는 결정적 지표는 1회로 충분하다.
- 이 PC(MacBook Air M5)는 같은 설정 벤치가 2배까지 흔들리므로 반복 측정 없이 결론을 내지 않는다. 다른 레인이 조용할 때 전원을 연결하고 단독으로 잰다.
- gradle 은 `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 를 붙이고 `--max-workers=2` 로 돌린다. 도커는 쓰지 않는다.

기준 워크트리 준비(한 번):
1. `/usr/bin/git worktree add <경로> refactor-2026-10-base` 로 기준 워크트리를 만든다.

## P1. OASIS 서비스 캐시 적중 처리량
- 관련 구조 변경: S3
- 지표(Mops/s): 캐시 적중 경로 처리량. 스레드 1·4·8 각각.
- 측정 절차:
  - 하네스는 `CacheHitThroughputManualTest`(`src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/oasis/provider/`, 커밋 8a488e0d)다. 환경 변수 `CACTUS_CACHE_BENCH=1` 일 때만 돈다. 키 52개(mdm BPMN 수)를 먼저 로드한 뒤 여러 스레드가 돌아가며 조회하고, 워밍업 300ms·측정 500ms·5회 반복의 최소~최대 범위를 표준 출력 `[cache-bench]` 줄로 남긴다.
  - 변경 쪽: 변경 워크트리에서 다음을 돌린다. `CACTUS_CACHE_BENCH=1 JAVA_HOME=… ./gradlew :cactus-core:test --tests '*CacheHitThroughputManualTest' --rerun --max-workers=2 -i`
  - 기준 쪽: 기준 워크트리에는 이 테스트가 없다. 기준에서 쓰는 캐시가 `SizeBaseCacheService` 이므로, 변경 워크트리의 테스트 파일 `CacheHitThroughputManualTest.java` 와 `FakeServices.java`(같은 폴더, `CountingProvider` 가 들어 있음)를 기준 워크트리의 같은 경로로 복사한다. 복사한 파일이 쓰는 `new CactusCachingServiceProvider(delegate, cacheSize)` 편의 생성자는 기준에서 `SizeBaseCacheService` 를 쓰고, 새 구현을 직접 참조하는 줄(`new CactusCachingServiceProvider(new CountingProvider(), 100)` 은 편의 생성자라 기준에서도 컴파일된다)을 확인한다. 복사한 파일은 기준 워크트리에서 커밋하지 않는다. 같은 명령(`--rerun`)으로 돌린다.
  - 한 번 돌리면 파일 안에서 old(`SizeBaseCacheService`)와 new 를 번갈아 5회 재므로, 기준·변경 두 워크트리 각각 3회 이상 돌려 얻은 값의 중앙값을 쓴다. 한 워크트리 안의 old/new 비교는 보조 자료로만 쓴다.
- 기준 커밋: refactor-2026-10-base / 변경 커밋: 8a488e0d 이후 `refactor/framework` 머지 커밋
- 측정 환경: (측정 때 적는다 — 단독 여부, 전원 연결, 일시)

| 스레드 | 회차 | 기준(Mops/s) | 변경(Mops/s) | load(1분) |
|---|---|---|---|---|
| 1 | 1 | | | |
| 1 | 2 | | | |
| 1 | 3 | | | |
| 4 | 1 | | | |
| 4 | 2 | | | |
| 4 | 3 | | | |
| 8 | 1 | | | |
| 8 | 2 | | | |
| 8 | 3 | | | |

- 중앙값: 스레드 1 / 4 / 8 별로 기준 <값> → 변경 <값> (<증감 %>)
- 판정: (측정 뒤)

## P2. analog 검색 동시 요청
- 관련 구조 변경: S2
- 지표: (a) `/log/range/time` 동시 N 요청의 요청 지연 중앙값(ms)과 p95, (b) 측정 중 JVM 스레드 수 최대값(요청별 풀 생성·폐기 비용의 대리 지표), (c) `/log/range/time/tree` 동시 N 요청의 지연 중앙값과 503 건수(변경 쪽만 해당, 기준은 상한이 없다), (d) `/tree` 처리 중·유휴 시 analog 프로세스 CPU 사용량(바쁜 대기 제거 전후, 기준·1차 dev·2차 세 시점).
- 측정 절차:
  - 같은 로그 파일 집합과 같은 질의(시간 구간·키워드)를 기준·변경 양쪽에 쓴다. 로컬 `analog/api` 를 각각 기동한다(포트가 겹치지 않게 순서대로 기동·종료한다. 메인 저장소의 실행 중 서버는 건드리지 않는다).
  - N 은 1·4·8·16 로 둔다. 각 N 에서 동시 요청을 한꺼번에 보내고 각 요청의 응답 시간을 기록한다. 시작 직후 1회는 워밍업으로 버린다.
  - 스레드 수는 요청을 보내는 동안 `jcmd <pid> Thread.print` 의 스레드 수를 1초 간격으로 읽어 최대값을 쓴다.
  - 같은 N·같은 질의로 기준·변경을 번갈아 3회 이상 잰다. 큰 파일이 멀티스레드 검색(`minimum_mega_bytes_for_multi_thread` 이상)을 타는 경우와 작은 파일만 있는 경우를 나눠 적는다.
  - 응답 본문이 기준과 같은지 함께 확인한다(특성 시험 JSON 과 같은 질의 기준).
  - CPU 지표(2차 S11, /tree 바쁜 대기 제거): `/tree` 처리 중과 유휴 시 analog 프로세스의 CPU 사용량을 잰다. 유휴는 서버 기동 뒤 요청 없이 30초, 처리 중은 `/tree` 를 연속으로 40초 보내는 동안 `ps -o time=` 의 CPU 시간 증가분을 경과 시간으로 나눈다(처리 중은 요청당 CPU ms 도 함께 적는다). 기준(refactor-2026-10-base)·1차 dev 머지(bb8ee036)·2차(레인 HEAD) 세 시점을 같은 로그·같은 질의로 번갈아 3회 이상 잰다. 측정 스크립트는 저장소 밖 scratchpad 에 있어 이 문서에는 절차만 적는다.
- 기준 커밋: refactor-2026-10-base / 변경 커밋: 24317974 이후 `refactor/framework` 머지 커밋
- 측정 환경: (측정 때 적는다)

| N | 회차 | 기준 지연 중앙값(ms) | 변경 지연 중앙값(ms) | 기준 최대 스레드 | 변경 최대 스레드 | load(1분) |
|---|---|---|---|---|---|---|
| 1 | 1 | | | | | |
| 4 | 1 | | | | | |
| 8 | 1 | | | | | |
| 16 | 1 | | | | | |

`/tree` 동시 요청은 같은 표 형식으로 별도로 적는다(변경 쪽 503 건수 열을 더한다).

- 중앙값: (측정 뒤)
- 판정: (측정 뒤)

## P3. OASIS 서비스 호출당 로그 줄 수
- 관련 구조 변경: S1
- 지표(줄/호출): OASIS 서비스 1회 호출당 `com.dongkuk.oasis.methodinvoker` 가 남기는 로그 줄 수. 결정적 지표라 1회로 충분하다.
- 측정 절차: mdm 의 `DmeOasisHttpTest` 기준으로 같은 서비스 호출 1회를 기준·변경 양쪽에서 돌리고, 로그에서 `methodinvoker` 로거 줄 수를 센다. INFO(Try binding·Strategy) 줄과 그 밖 레벨을 나눠 적는다.
- 이미 있는 측정치(작업 지시에 따른 기록): methodinvoker 로그 54줄 + 162줄 → 0줄. 출처 측정을 이 절차로 다시 확인해 아래 표에 옮긴다.
- 기준 커밋: refactor-2026-10-base / 변경 커밋: bf7df033 이후 `refactor/framework` 머지 커밋

| 항목 | 기준(줄) | 변경(줄) |
|---|---|---|
| methodinvoker 로그(호출 구간 1) | 54(기록) | |
| methodinvoker 로그(호출 구간 2) | 162(기록) | |
| methodinvoker 로그 합계 | 216(기록) | |

- 판정: (측정 뒤)

(커밋 실패 처리·errors[] 는 성능 항목이 아니므로 이 문서에 넣지 않는다.)
