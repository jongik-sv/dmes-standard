# 성능 비교 기록 — MDM 백엔드·엔진 레인

레인: MDM 백엔드·엔진 / 브랜치: `refactor/mdm-backend`. 수치는 조정 세션의 「측정 시작」 알림 뒤에 잰다(그 전까지 표의 수치 칸은 비워 둔다). 기준(before)은 태그 `refactor-2026-10-base` 이며 별도 워크트리에서 잰다. 형식은 `docs/refactor-2026-10/README.md` §6.2 를 따른다.

공통: 이 PC(MacBook Air M5)는 측정 편차가 크다. 시간 지표는 기준과 변경을 번갈아(A·B·A·B…) 각 3회 이상 재고 회차마다 `uptime` load 를 남기며 중앙값으로 결론 낸다. 쿼리·flush 횟수 같은 결정적 지표는 1회로 충분하다.

## P1. 마스터코드 선분 조작의 flush 횟수
- 관련 구조 변경: 없음(쓰기 시점 변경)
- 커밋 내용: 소속 연쇄 닫기·다시 열기와 `applyItems` 의 행마다 `saveAndFlush` 를 `save` 로 모으고 public 메서드 끝에서 한 번 flush 한다(0daad719). 특성 시험은 a139fe07·8db3e93c.
- 지표: (결정적) 배치 저장 1회당 flush 수, 또는 SQL 문 수. (보조) N행 배치 저장 시간(ms, A·B 번갈아 3회 이상).
- 측정 절차: 시험 `MasterCodeSegmentFlushSqliteTest`(`src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/mastercode/`)의 시나리오(`applyItems` 여러 행 배치, `removeItem`·`closeCategory`·`revertItem`·`revertCate` 연쇄)를 바탕으로 측정용 시험을 둔다. 측정용 시험은 측정 때 임시로 만들고(커밋 여부는 조정 세션과 정한다), Hibernate Statistics 를 켠다.
  1. 시험 설정에 `spring.jpa.properties.hibernate.generate_statistics=true` 를 준다(`@DynamicPropertySource` 또는 시험용 properties). 확인 필요: 기존 시험이 쓰는 설정 방식.
  2. 시나리오 실행 직전 `Statistics s = entityManagerFactory.unwrap(SessionFactory.class).getStatistics(); s.clear();`
  3. 트랜잭션 안에서 대상 메서드를 N행(예 10·100·500)으로 호출한 뒤 `s.getFlushCount()`·`s.getPrepareStatementCount()`(문 수)·`s.getEntityInsertCount()` 등을 읽어 `[flush-count]` 형식으로 출력한다.
  4. 같은 시험을 기준 워크트리(태그 `refactor-2026-10-base`)와 변경 브랜치에서 각각 돌린다.
  - 실행 명령(저장소 루트, JDK 21 필요): `cd src/backend && ./gradlew :mdm:api:test --tests '*MasterCodeSegmentFlushSqliteTest*' -i`. 확인 필요: 실제 gradle 프로젝트 경로·옵션(다른 레인 충돌을 피하려고 JAVA_HOME 은 JDK 21 경로로 지정). 기준 쪽에는 측정용 시험 파일만 복사해 넣는다.
  - 시간 지표는 같은 시험에서 N행 배치 저장 구간을 `System.nanoTime()` 으로 재서 ms 로 남긴다(SQLite 인메모리가 아닌 임시 파일 DB 사용 여부는 확인 필요).
- 기준 커밋: refactor-2026-10-base / 변경 커밋: 0daad719
- 측정 환경: (측정 시 기입 — 단독 여부, 전원 연결, 측정 일시)

| 회차 | 기준 flush 수 | 변경 flush 수 | 기준 문 수 | 변경 문 수 | load(1분) |
|---|---|---|---|---|---|
| 1 | | | | | |

| 회차 | 기준 N행 저장(ms) | 변경 N행 저장(ms) | load(1분) |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |

- 중앙값: 기준 <값> → 변경 <값> (<증감 %>)
- 판정: (측정 후 기입)

## P2. 헤더 확정 영향도 조회 수
- 관련 구조 변경: S2
- 커밋 내용: 7f598bdf(동치 시험 ea1955c5 가 변경 전 기준선).
- 지표: (결정적) 전문 버전 E개·헤더 H개일 때 `LayoutHeaderImpact.evaluate` 의 쿼리 수. 이전은 대략 E×2×(4+3H)(조정 지시의 근사식, 확정 아님).
- 측정 절차: `LayoutHeaderImpactEquivalenceSqliteTest`(`src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmb/layoutConfirm/`)의 시나리오에서 Hibernate Statistics 로 센다. 이 시험은 이미 쿼리 수(트랜잭션 안)를 `[query-count] headerImpact` 로 출력만 하고 단언하지 않는다(ea1955c5 본문, 전문 버전 키 8개 기준).
  1. 변경 브랜치에서 시험을 실행하고 출력의 `[query-count] headerImpact` 를 모은다: `cd src/backend && ./gradlew :mdm:api:test --tests '*LayoutHeaderImpactEquivalenceSqliteTest*' -i | grep 'query-count'` (경로·옵션은 확인 필요).
  2. 기준은 별도 워크트리에서 태그 `refactor-2026-10-base` 를 열어, 같은 시험 파일(ea1955c5)만 복사해 같은 명령을 돌린다(기준에는 시험이 없다).
  3. E·H 를 바꿔 볼 때는 시험의 전문 버전·헤더 개수를 늘린 시나리오를 임시로 만들어, `generate_statistics=true` 와 `getPrepareStatementCount()` 로 센다.
- 커밋 본문에 적힌 값(참고, 재측정 전까지 표에는 넣지 않는다): 그대로·추가·삭제·변경 121→9, 경계 134→9, 첫 확정 13→9, 영향 없음 3→3, 같은 트랜잭션 148→17(시험의 flush DML 포함).
- 기준 커밋: refactor-2026-10-base / 변경 커밋: 7f598bdf
- 측정 환경: (측정 시 기입)

| 시나리오 | E | H | 기준 쿼리 수 | 변경 쿼리 수 |
|---|---|---|---|---|
| 그대로·추가·삭제·변경 | | | | |
| 버전 경계 | | | | |
| 첫 확정 | | | | |
| 영향 없음 | | | | |
| 같은 트랜잭션 | | | | |

- 중앙값: 해당 없음(결정적 지표 1회)
- 판정: (측정 후 기입)

## P3. 용어 검색(TermMngService.search)의 읽는 행 수·JSON 파싱 횟수
- 관련 구조 변경: S5
- 커밋 내용: 키워드·상황 조건을 DB `LIKE` 로 먼저 거르고(`TermSearchPrefilter`) 남은 행의 JSON 칸을 행마다 한 번만 파싱한다(0ec7a57b). 64bcf6cc 는 NPE 행 보존 보정이라 조건이 약간 넓어진다(상황 조건에 키워드 단계 NPE 행을 OR 로 남김).
- 지표: (결정적) 검색 1회당 읽는 용어 행 수, JSON 파싱 횟수(동의어·별칭·시스템 칸 `readStrings` 호출 수). (보조) 응답 시간 ms(기준·변경 A·B 교대 3회 이상, 회차마다 `uptime` load).
- 측정 절차: 특성 시험 `TermMngSearchCharacterizationTest`(`src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/termMng/`)의 시나리오(키워드·시스템·상황 조건 조합)를 바탕으로 측정용 시험을 둔다. 측정용 시험은 측정 때 임시로 만든다(커밋 여부는 조정 세션과 정한다).
  1. `spring.jpa.properties.hibernate.generate_statistics=true` 를 주고, 시나리오 직전 `Statistics s = entityManagerFactory.unwrap(SessionFactory.class).getStatistics(); s.clear();`
  2. 검색 한 번 뒤 `s.getEntityLoadCount()`(읽은 용어 행 수)·`s.getPrepareStatementCount()` 를 읽는다. JSON 파싱 횟수는 `MdmJsonLists.readStrings` 호출을 세는 방법이 필요하다 — 시험에서 호출 계수를 어떻게 넣을지는 확인 필요(예: 측정용 임시 카운터).
  3. 같은 시험을 기준 워크트리(태그 `refactor-2026-10-base`)와 변경 브랜치에서 각각 돌린다. 기준 쪽은 측정용 시험 파일만 복사하되 기준에는 `MdmJsonLists`·`TermSearchPrefilter` 가 없으므로 파싱 횟수 계수 방식을 맞춰야 한다(확인 필요).
  4. 키워드는 `코일`(로컬 DB 8,152행 중 후보 22행)·`coil`(후보 249행)과 조건 없음, 상황 조건 단독 등으로 나눠 잰다. 로컬 DB 행 수는 측정 시점에 다시 센다.
  - 실행 명령(JDK 21 필요): `cd src/backend && ./gradlew :mdm:api:test --tests '*TermMngSearchCharacterizationTest*' -i`. 확인 필요: 실제 gradle 프로젝트 경로·옵션.
  - 시간 지표: 실제 서비스 `search` 호출 구간을 `System.nanoTime()` 으로 재서 ms 로 남긴다. 기준·변경을 번갈아(A·B·A·B…) 3회 이상.
- 참고(커밋 본문 기록, 정식 측정 전): 로컬 DB(8,152행) 기준 `코일` 키워드 1차 거름 후보 22행, `coil` 후보 249행(0ec7a57b). 변경 전 읽는 행 수는 `findAll()` 이므로 전체 행(코드 확인), 정식 수치는 측정 뒤 기입.
- 동작 보존 한계: DB 1차 거름은 SQLite 로만 확인했다. Oracle·PostgreSQL 에서의 후보 행 수·응답 시간은 운영 DB 에서 따로 재야 한다.
- 기준 커밋: refactor-2026-10-base / 변경 커밋: 0ec7a57b·64bcf6cc
- 측정 환경: (측정 시 기입 — 단독 여부, 전원 연결, 측정 일시)

| 시나리오 | 기준 읽은 행 수 | 변경 읽은 행 수 | 기준 JSON 파싱 | 변경 JSON 파싱 |
|---|---|---|---|---|
| 키워드 `코일` | | | | |
| 키워드 `coil` | | | | |
| 상황 조건만 | | | | |
| 조건 없음 | | | | |

| 회차 | 기준 응답(ms) | 변경 응답(ms) | load(1분) |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |

- 중앙값: 기준 <값> → 변경 <값> (<증감 %>)
- 판정: (측정 후 기입)

## P4. 컬럼 검색(ColumnMngService.search 등)의 쿼리 수·읽는 행 수
- 관련 구조 변경: S6
- 커밋 내용: 검색은 `ColumnSearchPrefilter` 로 후보 컬럼·매핑·도메인·용어만 읽고, `save` 용어 존재 검사·충돌 소유 컬럼·`compare(REVERSE)` 중복의 반복문 단건 조회를 IN 조회로 묶는다(c273897e).
- 지표: (결정적) `search` 1회당 쿼리 수·엔티티 로드 수, 반복문 단건 조회 → IN 조회로 바뀐 세 곳(`save` 용어 `existsById`·충돌 소유 컬럼 `findById`·`compare` REVERSE `findById`)의 쿼리 수.
- 측정 절차: 특성 시험 `ColumnMngSearchCharacterizationTest`(검색)·`ColumnMngLookupCharacterizationTest`(단건 조회 세 곳)(둘 다 `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/columnMng/`)의 시나리오에서 Hibernate Statistics 로 센다. 두 시험은 이미 쿼리 수와 엔티티 로드 수를 기록한다(f2392a4a 본문).
  1. `generate_statistics=true`, 시나리오 직전 `s.clear()`, 호출 뒤 `getPrepareStatementCount()`·`getEntityLoadCount()` 를 읽는다.
  2. 기준은 별도 워크트리에서 태그 `refactor-2026-10-base` 를 열어 같은 시험 파일(f2392a4a)만 복사해 같은 시나리오를 돌린다.
  3. 컬럼 수(예: 13·33)와 용어 행 수(`save` 용어 3·6행), 충돌 소유 컬럼 수, REVERSE 컬럼·매핑 수를 시험의 시나리오 값 그대로 쓴다. 규모를 늘려 볼 때는 시나리오를 임시로 늘린다.
  - 실행 명령(JDK 21 필요): `cd src/backend && ./gradlew :mdm:api:test --tests '*ColumnMng*CharacterizationTest*' -i`. 확인 필요: 실제 gradle 프로젝트 경로·옵션.
- 참고(커밋 본문 기록, 정식 측정 전): Hibernate 문 수 — `save` 용어 3행 11→9, 6행 14→9 / 충돌 소유 컬럼 3개 8→6 / REVERSE 3컬럼·5매핑 7→5 / `search` 는 4→4 이지만 검색어 조건의 엔티티 로드 24→5(13컬럼), 64→5(33컬럼).
- 동작 보존 한계: DB 1차 거름은 SQLite 로만 확인했다. Oracle·PostgreSQL 에서의 쿼리 수·후보 행 수는 운영 DB 에서 따로 재야 한다. IN 은 500개씩 나눈다(Oracle IN 1,000개 제한).
- 기준 커밋: refactor-2026-10-base / 변경 커밋: c273897e
- 측정 환경: (측정 시 기입)

| 시나리오 | 규모 | 기준 쿼리 수 | 변경 쿼리 수 | 기준 엔티티 로드 | 변경 엔티티 로드 |
|---|---|---|---|---|---|
| search 검색어 조건 | | | | | |
| search 도메인 키워드 조건 | | | | | |
| save 용어 존재 검사 | | | | | |
| 충돌 소유 컬럼 | | | | | |
| compare REVERSE 중복 | | | | | |

- 중앙값: 해당 없음(결정적 지표 1회)
- 판정: (측정 후 기입)

## 이후 추가 예정
P5 evaluateSet 은 engine 트랙 합류 뒤 추가.
