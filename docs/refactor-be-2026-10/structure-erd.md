# 구조 변경 기록 — erd-term 레인 (BE 리팩토링 2회차)

레인 erd-term(브랜치 `refactor-be/mdm-erd`, 세션 rbe-mdm-erd-a5, 모듈 `src/backend/mdm`)의 구조 변경과 동작 변경을 항목마다 적는다. 형식은 1회차 [README §6.1](../refactor-2026-10/README.md#61-구조-변경-기록) 을 따르고, 항목 ID 는 [README.md](./README.md) 의 표를 따른다. 경로의 `mdm/lib/…/mdm/` 는 `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/` 를 줄인 것이다.

## 기준선 (2026-10-16, 태그 `refactor-be-2026-10-base` = 40fa5061a)

| 대상 | 명령 | 결과 |
|---|---|---|
| mdm lib | `cd src/backend && ./gradlew -p mdm :lib:test :api:test -Pdmes.ora.test=clone --continue` | 2279건, 실패 0 |
| mdm api | 위와 같은 명령 | 2081건, 실패 1, 건너뜀 13. 실패는 `CodeCateEditPerformanceSqliteTest#AC4_1000건_소속_이동_저장은_중앙값이_800ms_미만이다`(성능 상한, PC 부하 추정, dmc 영역이라 이 레인 밖) |

## S1. F1 — ERD 사전이 도메인 상속 길이·소수·타입을 쓴다 (동작 변경)

- 커밋: `1c1e8990b`(refactor, `DomainChainAssembler.typeOf` 추출) · `4361db3f3`(test, 현재 동작 고정) · `a30723929`(fix) · `85e8c94f8`(test, 리뷰 후속) · `b3b6f0b58`(docs, 리뷰 후속)
- 바뀌기 전: `dma/erdEdit/standard/ErdDictionaryLoader` 가 `MdmDomain` 행의 원값(`getDataType`·`getLength`·`getScale`)으로 `ErdDomainSpec` 을 만들었다. 길이·소수를 비워 두고 부모에서 물려받는 자식 도메인은 길이 null 로 읽혔다.
  - 자식 STRING 도메인(길이 null)이 `ErdTypeMapping.physicalOf` 에서 CLOB 으로 매핑돼, 그 도메인을 고른 새 컬럼이 CLOB 으로 채워졌다.
  - `ErdStandardJudge` 가 상속값에 맞는 컬럼을 DOMAIN 위반으로 냈다(예: 자식이 길이만 정할 때 소수 0 으로 비교).
- 바뀐 뒤: `common/dictionary/DomainChainAssembler.typeOf` 로 유효 타입(최상위 도메인)·길이·소수(가장 가까운 non-null 값)를 쓴다. 도메인 화면·레이아웃과 같은 규칙이다. 순환 체인이면 그 도메인만 자기 행 원값을 써서, 사전 적재 전체가 실패하지 않게 한다(`ErdDomainSpec` Javadoc 에 적음).
- 바꾼 이유: 도메인 상속 규칙의 정본은 `DomainChainAssembler` 이다. ERD 만 다른 규칙을 쓰면 같은 도메인이 화면마다 다른 타입으로 보인다.
- 동작 변경 범위(정확히): 상속값은 `ErdDictionary.domain`·`recommendDomain` 을 거치는 곳에만 쓰인다.
  - 바뀌는 곳: 표준 판정(`ErdStandardJudge`, 확정 검사 포함), 도메인 지정 명령의 컬럼 채우기(`ErdCommandEngine.copyDomain`), 새 컬럼 이름 미리보기(`ErdEditService.previewColumn`).
  - 바뀌지 않는 곳: 가져오기(`ErdImportBuilder.columnOf`)·DB 차이 반영(`ErdDiffApplier`)은 타입·길이·소수를 DB 메타에서 그대로 읽고 사전에서는 논리명·도메인 ID 만 쓴다. 그래서 만들어지는 모델은 같고, 그 뒤 판정 경고만 상속값을 본다. 커밋 `a30723929` 메시지의 「가져오기·DB 차이 반영이 모두 상속값을 보게 된다」는 이 뜻으로 읽는다(메시지가 부정확하다).
- 동작 보존 근거(바뀌지 않는 부분): `4361db3f3` 에서 변환을 순수 함수 `ErdDictionaryLoader.specs` 로 빼고 현재 동작(결함 포함)을 `ErdDictionaryLoaderSpecsTest` 로 먼저 고정한 뒤, fix 커밋에서 기대값만 상속값으로 바꿨다. 상속이 없는 도메인의 결과는 같다. `DomainChainAssemblerTest` 에 `typeOf` 리터럴 단언을 더했다.
- 저장된 모델 영향 조회(L_MAIN, 읽기 전용, 2026-10-16): 도메인 171개 가운데 상속 때문에 스펙이 바뀌는 도메인 5개, ERD 모델 4개의 컬럼 1762개 가운데 그 5개 도메인을 쓰는 컬럼 0개. 저장된 ERD 모델 JSON 은 바꿀 필요가 없다. 조회 SQL 은 아래 「F1 영향 조회 SQL」에 둔다.
- 영향 범위: `ErdDictionaryLoader`·`ErdDomainSpec`(주석)·`DomainChainAssembler`. 공개 API·응답 JSON 모양은 그대로다.
- 되돌리는 방법: `b3b6f0b58` → `85e8c94f8` → `a30723929` 순서로 revert 하면 원값 동작으로 돌아간다. `1c1e8990b`·`4361db3f3` 은 동작을 바꾸지 않으므로 남겨도 된다.

### F1 영향 조회 SQL (Oracle, SELECT 만)

```sql
WITH anc (self_id, cur_id, lvl) AS (
  SELECT DOMAIN_ID, DOMAIN_ID, 0 FROM TB_MDM_DOMAIN
  UNION ALL
  SELECT a.self_id, d.PARENT_DOMAIN_ID, a.lvl + 1 FROM anc a JOIN TB_MDM_DOMAIN d ON d.DOMAIN_ID = a.cur_id
  WHERE d.PARENT_DOMAIN_ID IS NOT NULL AND a.lvl < 50
) CYCLE cur_id SET is_cycle TO 'Y' DEFAULT 'N',
eff AS (
  SELECT a.self_id,
         MAX(d.LENGTH) KEEP (DENSE_RANK FIRST ORDER BY CASE WHEN d.LENGTH IS NULL THEN 1 ELSE 0 END, a.lvl) eff_len,
         MAX(d.SCALE)  KEEP (DENSE_RANK FIRST ORDER BY CASE WHEN d.SCALE IS NULL THEN 1 ELSE 0 END, a.lvl) eff_scale,
         MAX(d.DATA_TYPE) KEEP (DENSE_RANK FIRST ORDER BY a.lvl DESC) eff_type
  FROM anc a JOIN TB_MDM_DOMAIN d ON d.DOMAIN_ID = a.cur_id GROUP BY a.self_id
),
changed AS (
  SELECT d.DOMAIN_ID, d.DATA_TYPE own_type, d.LENGTH own_len, d.SCALE own_scale, e.eff_type, e.eff_len, e.eff_scale
  FROM TB_MDM_DOMAIN d JOIN eff e ON e.self_id = d.DOMAIN_ID
  WHERE DECODE(d.DATA_TYPE, e.eff_type, 0, 1) = 1 OR DECODE(d.LENGTH, e.eff_len, 0, 1) = 1 OR DECODE(d.SCALE, e.eff_scale, 0, 1) = 1
),
cols AS (
  SELECT v.ERD_MODEL_ID, j.domain_id
  FROM TB_MDM_ERD_MODEL_VER v,
       JSON_TABLE(v.MODEL_JSON, '$.columns.*' COLUMNS (domain_id NUMBER PATH '$.domainId')) j
)
SELECT 'domains_spec_changed' k, COUNT(*) n FROM changed
UNION ALL SELECT 'erd_columns_total', COUNT(*) FROM cols
UNION ALL SELECT 'erd_columns_on_changed_domain', COUNT(*) FROM cols c JOIN changed ch ON ch.DOMAIN_ID = c.domain_id;
```

운영·다른 PC 의 DB 에 F1 을 반영하기 전에 이 조회를 돌려 마지막 값이 0 인지 본다. 0 이 아니면 그 컬럼은 다음 판정에서 DOMAIN 경고가 바뀔 수 있다(모델 JSON 자체는 바뀌지 않는다).

## S2. D1 — 참조 없는 ERD Repository 5개를 archive 로

- 커밋: `438435e5a`
- 바뀌기 전: `mdm/lib/…/mdm/repository/` 에 `MdmErdClaimRepository`·`MdmErdCmdLogRepository`·`MdmErdDiagramRepository`·`MdmErdDiagramNodeRepository`·`MdmErdDiagramRouteRepository` 가 있었다. main·test 참조는 0건이다(grep 재확인).
- 바뀐 뒤: 5개 파일을 `src/backend/mdm/archive/java/com/dongkuk/dmes/mdm/repository/` 로 `git mv` 했다(R100, 본문 그대로). archive 는 빌드·시험 소스가 아니다.
- 바꾼 이유: ERD 는 이 표들을 `JdbcTemplate`·`EntityManager` 로 직접 다룬다. 쓰지 않는 Repository 는 Spring Data 가 기동 때 프록시를 만들고, 읽는 사람이 쓰이는 경로로 오해한다.
- 동작 보존 근거: 참조 0건이고, Repository 빈을 이름으로 찾는 코드도 없다. mdm lib·api 시험 결과는 머지 요청에 적는다.
- 영향 범위: 이 5개 파일만. 엔티티 5개(`MdmErdClaim`·`MdmErdCmdLog`·`MdmErdDiagram`·`MdmErdDiagramNode`·`MdmErdDiagramRoute`)는 그대로 둔다(아래 후보).
- 되돌리는 방법: 이 커밋을 revert 한다.

## S3. C9 — 용어 쓰기를 `TermWriter` 하나로

- 커밋: `cb77b4f03`(test, 특성 시험) · `2921dc66d`(refactor) · `86933dc53`(test, 리뷰 후속) · `573cd03f9`(refactor, 리뷰 후속)
- 바뀌기 전: 용어 관리(`dma/termMng/service/TermMngService`)가 저장 → (인코딩 입력이 바뀌면) 임베딩 지우기 → (인코더가 켜져 있으면) 인코딩·갱신 → 커밋 뒤 캐시 갱신, 삭제 → 커밋 뒤 캐시 제거, 재인코딩 배치 한 행을 자기 안에서 했다. 추천 캐시 `TermRecommendationCache` 는 화면 패키지 `dma/termMng` 에 있었다.
- 바뀐 뒤: 쓰기 순서는 `dma/support/TermWriter` 하나에 있다(저장·삭제·재인코딩 한 행). 캐시도 `dma/support/TermRecommendationCache` 로 옮겼다. 입력 검사·중복 판정·권한·오류 코드는 화면 서비스에 그대로 둔다(2026-10-16 사용자 결정: 화면별 정책).

  ```mermaid
  graph LR
    TM[dma.termMng.TermMngService] --> TW[dma.support.TermWriter]
    TP[dma.termRegPop.TermRegPopService] --> TW
    TW --> CA[dma.support.TermRecommendationCache]
    TM --> CA
  ```
- 바꾼 이유: 용어를 저장하는 화면이 둘이고, 팝업은 임베딩·캐시 갱신을 빠뜨렸다(F3). 쓰기 순서를 한 곳에 두면 다음 화면이 같은 실수를 하지 않는다. 캐시를 `dma/support` 로 옮긴 것은 `TermWriter`(support) → `termMng`(화면) 순환과 팝업 → 용어 관리 화면 의존을 없애기 위해서다.
- 동작 보존 근거: `TermMngSaveWriteCharacterizationTest` 로 저장·삭제·재인코딩의 쓰기 순서·호출 횟수·실패 조건(갱신 행이 1이 아니면 실패)·약어 중복 경고·재인코딩 셈(`processed` 는 갱신된 행만)을 옮기기 전에 고정했다. 캐시 갱신 실패 로그 앞머리만 `[termMng]` → `[termWriter]` 로 바뀌었다(두 화면이 함께 쓰므로).
- 영향 범위: `TermMngService`(생성자에 `TermWriter` 추가), `TermWriter`·`TermRecommendationCache`(이동), 시험의 import·생성자 줄. 응답 JSON·오류 코드는 그대로다.
- 되돌리는 방법: `573cd03f9` → `86933dc53` → `2921dc66d` 순서로 revert 한다. 그 사이에 F3 커밋(`c4ce04bee`)이 들어왔으면 그것을 먼저 revert 한다(팝업이 `TermWriter` 를 쓴다).
- 남은 점(고치지 않음): `TermMngService` 가 `TermEmbeddingEncoder` 를 따로 받아 `isEnabled` 를 직접 확인한다(추천 2차 단계용). 쓰기 경로는 아니라 이번 범위에서 뺐다.

## S4. F3 — 용어 인라인 등록 팝업의 임베딩·캐시, 관리 화면 약어 중복 대소문자 (동작 변경)

- 커밋: `c4ce04bee`(fix ①②) · `c22f650f8`(fix ③)
- 바뀌기 전:
  - 팝업(`dma/termRegPop/service/TermRegPopService.reg`)은 `termRepository.save` 만 했다. 등록한 용어가 재기동 전까지 용어 관리 추천(캐시)에 나오지 않았고, `EMBEDDING` 도 재인코딩 배치 전까지 비어 있었다. Javadoc 은 「EMBEDDING 은 NULL 로 남는다」고 적었다(F22).
  - 용어 관리의 약어 중복 경고(`ENG_ABBR_DUP`, 저장은 막지 않음)는 대소문자를 구분했다(`findByEngAbbr`). 팝업의 약어 중복 거부는 대소문자를 무시한다(`usedAbbrUpper`). 그래서 `coil` 이 있을 때 `COIL` 은 팝업에서는 거부, 관리 화면에서는 경고 없이 저장됐다.
- 바뀐 뒤:
  - ①② 팝업 저장이 `TermWriter.save` 를 거친다: 저장 → (인코더가 켜져 있으면) 임베딩 → 커밋 뒤 캐시 갱신. 인코더가 꺼진 환경(시험 기본값)에서는 `EMBEDDING` 이 전처럼 NULL 이다. Javadoc 을 고쳤고, `docs/mdm/tasks/TSK-04-04/design.md` F22 에 개정 표시를 달았다.
  - 새 실패 경우: 인코더가 켜진 환경(`mdm.embedding.encoder=onnx`)에서 인코딩이 실패하면(`OnnxKureEmbeddingEncoder` 의 `IllegalStateException`) 팝업 등록 전체가 롤백되고 MDM 코드가 아닌 일반 내부 오류가 나간다. 전에는 팝업 저장이 성공했다. 용어 관리 화면은 이미 이렇게 동작하므로 두 화면이 같아진 것이다. 운영 기본값은 `none` 이라 지금은 바뀌는 것이 없다. 캐시 갱신 실패는 경고 로그만 남기고 저장을 실패시키지 않는다.
  - ③ 관리 화면의 약어 중복 경고가 대소문자를 무시한다(`MdmTermRepository.findByEngAbbrIgnoreCase`). 경고만 내고 저장은 막지 않는 것은 그대로다.
- 바꾸지 않은 것(사용자 결정 2026-10-16): 팝업의 약어 중복 거부(`TERM_DUPLICATED`)와 관리 화면의 경고(`ENG_ABBR_DUP`)는 화면별 정책으로 둔다. 이름·약어 형식 검사(팝업만), `guard.requireStdAdmin()`(팝업만)도 그대로다.
- 바꾼 이유: 팝업으로 등록한 용어가 바로 추천에 나와야 한다. 같은 약어 판정이 화면마다 대소문자 규칙이 다르면 한쪽에서만 중복이 보인다.
- 트랜잭션: 두 서비스 모두 `@Transactional` 이 없고 OASIS 프로세스 트랜잭션 안에서 돈다(`termRegPop.bpmn`·`termMng.bpmn` 모양이 같다). `TermWriter` 는 트랜잭션 동기화가 켜져 있으면 커밋 뒤에, 없으면 바로 캐시를 갱신한다.
- 시험: lib `TermRegPopServiceWriteTest`(검사를 모두 통과한 뒤에만 `TermWriter.save(term, true)` 로 넘기는지, 약어 대소문자 중복이면 MDM020 으로 거부하고 넘기지 않는지), api `TermRegPopServiceSqliteTest` R8(커밋 뒤 캐시에 보임 — F3 수정을 잡는 시험)·R9(롤백이면 캐시를 건드리지 않음 — 옛 코드에서도 통과하는 보호 시험), api `TermMngServiceTest#I8_대소문자만_다른_영문약어도_중복으로_경고한다`(Oracle 은 문자열을 대소문자 구분해 비교하므로 옛 코드에서는 실패한다).
- 영향 범위: `TermRegPopService`, `TermMngService`(약어 중복 조회 한 줄), `MdmTermRepository`(파생 쿼리 이름). Spring Data 가 `UPPER(ENG_ABBR) = UPPER(?)` 로 만든다(Oracle. 시험도 Oracle 시험 PDB 에서 돈다). 응답 JSON 모양은 그대로다.
- 되돌리는 방법: `c22f650f8`, `c4ce04bee` 를 각각 revert 한다(서로 독립).

## 감사 정정

### F3 (findings F3, 「미확인」 → 코드 확인)

- 「중복 약어: 팝업은 거부, 관리 화면은 경고」는 맞다. 덧붙여 대소문자 규칙이 달랐다(팝업 무시, 관리 화면 구분). 이것이 fix ③ 이다.
- 「팝업은 임베딩·캐시 갱신을 하지 않는다」는 맞다. fix ①② 이다.
- 권한·형식 검사 차이는 맞지만 사용자 결정으로 화면별 정책으로 둔다.

### C8 (findings C8, 착수 전 재확인)

- 「`ErdEventHub` 가 SSE·스레드 풀·접속자·선점 저장·버전 읽기를 한 클래스에 섞는다」, 「`stream` ↔ `service` 순환」, 「`ErdEditService` 인라인 SQL」은 맞다. 순환에서 허브가 `service` 쪽에 기대는 것은 `ErdCommandService.changesSince` 하나뿐이다.
- 「다이어그램 JSON 매퍼 두 벌」은 키·순서가 같고 담는 그릇만 다르다(`LinkedHashMap` 대 `ObjectNode`). 보기 쿼리의 노드 조회에 `ORDER BY` 가 없다. undo 는 저장소 쪽 행만 비교한다(`JsonNode.equals` 는 숫자 타입까지 본다). 하나로 합칠 때 이 차이를 시험으로 먼저 고정한다.
- 「편집자 쿼리 사본: `ErdEventHub`, `ErdEditService`, `ErdModelStore:84-135`」는 일부 틀렸다. `ErdEventHub` 와 `ErdEditService` 의 편집자 목록 SQL 은 같다. `ErdModelStore:84-135` 에는 편집자 SQL 이 없고 버전 고르기다. 허브의 `versionNow` 와 `ErdModelStore.current` 는 고르는 규칙이 달라 합치지 않는다.
- 「요청 출처·길이 검사 3곳」은 규칙이 서로 다르다(`ErdEditService` 는 trim·대문자, `ErdCommandService` 는 그대로 비교, 허브 `isTimedSource` 는 다른 개념, `ErdStreamController` 에 네 번째가 있다). 동작을 지키기 위해 출처 상수만 한 곳(`ErdSources`)에 모으고 검사 규칙은 합치지 않는다.
- 「이름 미리보기 두 벌(선택)」은 두 화면의 응답 계약이 달라 합치지 않는다.

## 후보 (이번에 하지 않음)

- D1 엔티티 5개(`MdmErdClaim`·`MdmErdCmdLog`·`MdmErdDiagram`·`MdmErdDiagramNode`·`MdmErdDiagramRoute`): D1 범위가 Repository 뿐이라 엔티티는 남겼다(조정자 결정 2026-10-16). 엔티티를 빼면 Hibernate 스키마 검증·엔티티 스캔 결과가 바뀔 수 있으므로, 쓰는 코드가 없는지와 함께 다음 회차에 따로 본다.
- C9 남은 점: `TermMngService` 의 인코더 직접 확인(위 S3).
- F3 fix ③ 뒤: `UPPER(ENG_ABBR)` 조건은 `IX_TB_MDM_TERM_ABBR` 를 쓰지 못해 용어 관리 저장마다 표 전체를 읽는다. 용어가 1만 건 수준이면 문제가 없고, 팝업은 이미 저장마다 표 전체를 읽는다. 느려지면 새 Flyway 버전으로 함수 기반 인덱스를 더한다.
