# 구조 변경 기록 — MDM 백엔드·엔진 레인

레인: MDM 백엔드·엔진(세션 dmes-standard-b9) / 브랜치: `refactor/mdm-backend` / 기준 태그: `refactor-2026-10-base`.
형식은 `docs/refactor-2026-10/README.md` §6.1 을 따른다. 이 문서는 1차 머지분(S1·S2)에 2차 머지분(S3~S6)과 그 뒤 엔진 변경(S7·S8)을 더한 것이며, 이후 머지에서 항목이 늘어난다.

## S1. 서비스 private 보조 메서드를 common/support 공용 메서드로 모음
- 커밋: db95bc1e
- 바뀌기 전: 서비스·규칙 클래스마다 본문이 같은 private(또는 package-private) 보조 메서드 사본을 따로 두었다.
  - `invalid(detail)` — `MdmErrors.of(MdmErrorCode.INVALID_INPUT, detail, List.of())` 사본 (예: ColumnMngService 의 `private static RuntimeException invalid`)
  - `trimToNull` — `trim()` 결과가 비면 null (ColumnMngService 는 이름이 `blankToNull` 이었으나 본문은 trim 기준, TermMngService 등. 나머지 서비스 사본의 옛 이름은 db95bc1e diff 로 확인 필요)
  - `blankToNull` — `isBlank()` 이면 null, 아니면 `trim()` (DefaultMdmEffectiveDomainResolver, RuleScreenSupport, DataItemRows 등)
  - `str(Object)` — null 이면 null, 아니면 `toString()` (RuleAnalysisInputMapper, RuleCellRules, RuleGenerateTry, RuleDefinitionAssembler, ledger 패키지의 `LedgerCells.str` 등. LedgerCells 사본은 `String.valueOf`)
- 바뀐 뒤: `com.dongkuk.dmes.mdm.common.support` 에 공용 정본을 둔다.
  - `MdmErrors.invalid(String)` 추가(`BusinessException` 반환, INVALID_INPUT)
  - 새 `MdmStrings` — `blankToNull`(isBlank 기준) · `trimToNull`(trim 기준) · `str`
  - 호출부는 static import 로 치환하고 private 사본을 지웠다. 서비스 쪽 변경 파일은 아래 영향 범위 참고.
  - public 메서드 `RuleScreenSupport.blankToNull`·`DataItemRows.blankToNull` 은 시그니처를 두고 `MdmStrings` 에 위임만 한다.
- 합치지 않은 변형(동작을 지키려고 이름을 둘로 나눔·일부는 남김):
  - `blankToNull`(isBlank 기준)과 `trimToNull`(trim 기준)은 하나로 합치지 않았다. 유니코드 공백만 있는 문자열의 판정이 달라지기 때문이다. 호출부가 쓰던 기준 그대로 이름을 골라 치환했다(ColumnMngService 의 옛 `blankToNull` 은 trim 기준이므로 `trimToNull` 로 치환).
  - `RuleCellRules.blankToNull` 은 `trim()` 하지 않고 원문을 돌려주는 다른 본문이라 남겼다(db95bc1e diff 에서 `str` 만 지움).
  - db95bc1e 이후에도 남은 private 사본(2026-10-04 grep: `private static … (invalid|trimToNull|blankToNull|str)(` 로 `src/backend/mdm` 전체 확인). 본문은 현재 파일에서 읽어 `MdmStrings`·`MdmErrors.invalid` 와 대조했다.

    | 파일 | 남은 메서드 | 본문 대조 | 남긴 이유 |
    |---|---|---|---|
    | RuleConfirmService:470 | `trimToNull` | `MdmStrings.trimToNull` 과 같음 | 레인 금지 파일(확정 서비스 4종) — 조정 지시 기준, 코드·커밋 본문으로는 확인 못 함 |
    | RuleSetConfirmService:323 | `trimToNull` | 같음 | 위와 같음 |
    | CodeConfirmService:404·408 | `invalid`, `trimToNull` | 둘 다 같음(`invalid` 는 `MdmErrors.of(INVALID_INPUT, detail, List.of())` 로 `MdmErrors.invalid` 와 같은 호출이고 반환 선언 타입만 `RuntimeException`) | 위와 같음 |
    | LayoutConfirmService | (사본 없음) | grep 에 안 걸림 | 해당 없음 |
    | RuleSetEditService:863 | `blankToNull` | `MdmStrings.blankToNull` 과 같음 | 레인 금지 파일 — 조정 지시 기준, 확인 필요(금지 목록 원문은 이 저장소 문서에 없음) |
    | RuleTableService:357 | `invalid` | 다름 — `new BusinessException(ErrorCode.INVALID_VALUE, message)`(cactus 공통 코드, MDMnnn 코드·기본 문구 접두 없음) | 본문이 달라 합치지 않음 |
    | RuleCellsCodec:186 | `invalid` | 다름 — 위와 같은 `ErrorCode.INVALID_VALUE` | 본문이 달라 합치지 않음 |
    | RuleCellRules:356 | `blankToNull` | 다름 — `isBlank` 이면 null, 아니면 `trim()` 없이 원문 | 본문이 달라 합치지 않음(위에 적음) |
    | RuleColumnsSaveRequest:47 | `str(Object)` | 다름 — `String.valueOf(v).trim()` 후 빈 문자열이면 null | 본문이 달라 합치지 않음 |
    | CodeItemEditService:593·CodeCateEditService:409 | `str(BigDecimal)` | 다름 — 버전 숫자를 `setScale(VER_SCALE).toPlainString()` 으로 만듦 | 이름만 같고 인자·용도가 달라 대상 아님 |
    | DataItemRows:26·RuleScreenSupport:101 | public `blankToNull` | `MdmStrings` 에 위임 | 시그니처 유지(위에 적음) |

    남은 확정 서비스 사본 4곳(`trimToNull` 셋(RuleConfirm·RuleSetConfirm·CodeConfirm)과 CodeConfirm 의 `invalid`) 과 RuleSetEditService 는 본문이 같아 금지가 풀리면 기계적으로 치환할 수 있다.
- 바꾼 이유: 같은 본문 사본 27곳이 흩어져 있어 한쪽만 고쳐지는 드리프트가 생길 수 있다. 정본 하나로 모은다.
- 동작 보존 근거: `MdmStringsTest`(db95bc1e 에서 추가, 신규 41줄)가 세 메서드의 경계(null·빈 문자열·공백만·앞뒤 공백)를 고정한다. 리뷰에서 치환 전후 본문 동일성을 확인했고, mdm 시험이 통과했다(조정 지시 기준 기록, 시험 로그 원문은 확인 필요).
- 영향 범위: 호출부 29개 파일(db95bc1e `--stat`: 소스 27 + 신규 `MdmStrings` + 시험 `MdmStringsTest`, 159 추가·165 삭제). 영역은 common(dictionary·rule·rule/check·rule/definition·support), dma(columnMng·termMng·termRegPop·unitMng), dmc(codeCateEdit·codeEdit·codeItemEdit·codeMng), dmd(dataCateEdit·dataEdit·dataHistory·dataItemMng·dataMng), dme(ruleMng·ruleSetMng), feed/metaFeed. BPMN 연결 이름(`camunda:class`·메서드 이름)은 그대로다. 화면·API·설정 변경 없음. 다른 레인과 겹치는 파일 없음(mdm 모듈 안).
- 되돌리는 방법: `git revert db95bc1e`. 이후 커밋이 `MdmStrings`·`MdmErrors.invalid` 를 쓰기 시작하면 그 커밋을 먼저 되돌려야 한다.

## S2. LayoutHeaderImpact 의 합성 호출 경로를 묶음 조회로 변경
- 커밋: 7f598bdf(변경), ea1955c5(동치 시험, 변경 전 기준선)
- 바뀌기 전: `LayoutHeaderImpact.evaluate` 가 영향받는 전문 버전마다 `composer.compose`(변경 전 합성)·`composer.composeDetailed`(헤더 DRAFT 고정 합성)를 불러, 호출마다 `LayoutComposer` 가 전문 레이아웃·버전 행·적층·헤더 레이아웃·헤더 버전·헤더 항목·상수 재정의·컬럼 사전을 개별 쿼리로 읽었다. 전문 버전 수 E, 헤더 수 H 에 비례해 쿼리가 늘었다. `LayoutHeaderImpact` 는 전문 버전 행도 `store.versionsOf` 로 따로 읽고 전문 레이아웃은 `layoutRepository.findById` 로 읽었다.
- 바뀐 뒤:
  - `LayoutComposer` 의 합성 규칙을 `composeWith(Source, …)` 한 곳으로 모으고, 읽는 곳을 둘로 나눴다 — `Direct`(단건, 옛 순서 그대로 DB 를 읽음, 기존 `compose`·`composeDetailed` 가 사용)와 `Batch`(묶음).
  - `composer.batch(keys)` 가 전문·적층·헤더 레이아웃·버전 행·항목(헤더는 모든 버전)·재정의를 IN(500개씩) JPQL 로 한 번씩 읽고, 읽어 둔 항목의 물리명으로 컬럼 사전(`LayoutDictionary.Cache`)을 미리 한 번 읽는다. 이후 합성은 메모리에서 고른다.
  - `LayoutHeaderImpact.evaluate` 는 `batch` 를 하나 만들어 전문 버전마다 `batch.compose`·`batch.composeDetailed`·`batch.versions`·`batch.layout` 을 쓴다.
  - 보조 변경: `LayoutQueries`(`constsOf(Collection<LayoutKey>)`·`layoutsByIds` 추가), `LayoutSnapshotAssembler`(컬럼 사전 함수를 받는 `assemble` 오버로드·`dictionaryCache()` 추가). 변경 파일 4개, 256 추가·36 삭제.
  - 묶음 밖 키는 단건처럼 DB 를 읽는다. 버전 구간 판정(releasedAt·고정 버전)과 거부 순서·문구는 단건과 같다.
- 바꾼 이유: 헤더 확정 영향도 조회의 쿼리 수를 전문 버전 수와 무관하게 만든다(수치는 perf-mdm-backend.md P2). 커밋 본문 기록: 동치 시험 기준 그대로·추가·삭제·변경 121→9, 경계 134→9, 첫 확정 13→9, 영향 없음 3→3, 같은 트랜잭션 148→17.
- 동작 보존 근거: `LayoutHeaderImpactEquivalenceSqliteTest`(ea1955c5, 8건) — `LayoutHeaderImpact.evaluate` 의 Result 전체(영향 행·오류·경고·EAI)를 정규화 글로 비교한다. 변경 전 코드에서 먼저 통과시킨 기준선이고, 변경 후에도 같은 시험으로 확인한다(변경 후 통과 결과 원문은 확인 필요). 고정 경우: 전문 여러 개, 헤더 여러 개·버전 경계, 전문 버전 거르기(apply_to 경계·미래 RELEASED·DRAFT·LEGACY), minor 버전, 항목 추가·삭제·변경, 첫 확정·HEADER_UNRESOLVED, 영향 없음, EAI 표준 헤더 전환, 같은 트랜잭션 flush 전 JPA 변경.
- 영향 범위: `LayoutComposer` 의 공개 메서드(`compose`·`composeDetailed`·`headerAlone`·`eaiHeaderAt`·`eaiHeadersAt`·`headerAt`)는 시그니처를 유지하고 `batch`·`Batch` 가 추가됐다(코드 확인). 변경 호출부는 `LayoutHeaderImpact` 하나. 묶음은 읽은 뒤 변경이 보이지 않으므로 요청 안에서 만들어 쓰고 버린다(필드에 두지 않는다 — 클래스 Javadoc). 화면·API·설정 변경 없음.
- 되돌리는 방법: `git revert 7f598bdf`(시험 ea1955c5 는 남겨도 된다 — 쿼리 수는 단언하지 않고 출력만 한다).

## S3. 용어 JSON 목록 파서 네 곳을 공용 코덱 MdmJsonLists 로 모음
- 커밋: cd6aca56(변경), 29a613ba(변경 전 동작을 고정한 특성 시험)
- 바뀌기 전: DB 의 JSON 배열 칸을 읽는 private 파서가 네 곳에 따로 있었고 클래스마다 `ObjectMapper` 를 따로 두었다.
  - `TermMngService`·`TermRecommendationCache` — 엄격 문자열 목록 파서(`readStringList`)와 쓰기(`writeJson`)
  - `TermDictionary.parseSurfaces` — 배열을 원소 단위로 관대하게 읽음
  - `ColumnMngService.parseTermIds` — ID 목록 읽기
- 바뀐 뒤: `com.dongkuk.dmes.mdm.common.support.MdmJsonLists`(신규 110줄) 하나에 호출부별 동작을 메서드로 나눠 보존한다. 합치지 않고 나눈 이유는 호출부마다 동작이 달라서다(커밋 본문).
  - `readStrings` — 엄격. JSON null 리터럴이면 null(빈 목록 아님) — 이 절의 변경 시점 동작이다. D1 수정(3e645c34) 뒤에는 null 리터럴도 빈 목록 `List.of()`(로그 없음). 원소 null(`[null]`)은 D2 수정(d2c7b283) 전에는 null 원소로 남았고, 뒤에는 파싱 뒤 `removeIf(Objects::isNull)` 로 버린다(공백·빈 문자열 원소는 남는다). 깨진 JSON·배열 아님은 빈 목록 + 경고 로그
  - `readArrayElements` — 원소 단위 관대 읽기(용어 사전 표면형)
  - `readLongs` — ID 목록, null 원소 자리 유지
  - 쓰기(옛 `writeJson` → `MdmJsonLists.writeStrings`)도 여기로 옮김. 표면형의 이름 추출·괄호 떼기는 `TermDictionary` 에 남겼다. 옛 private 파서와 클래스별 `ObjectMapper` 는 지웠다. 기본 설정의 classic `ObjectMapper` 를 쓴다(Spring Boot 4 가 이 타입 빈을 자동 등록하지 않음 — 클래스 javadoc).
- 바꾼 이유: 같은 일을 하는 파서가 네 곳에 흩어져 있어 한쪽만 고쳐질 수 있다.
- 동작 보존 근거: 29a613ba 가 같은 입력 행렬로 네 파서를 먼저 고정했다 — `TermJsonListCharacterizationTest`·`TermJsonListParserCharacterizationTest`(termMng), `TermDictionaryParseSurfacesCharacterizationTest`(naming), `ColumnMngParseTermIdsCharacterizationTest`(columnMng). 저장 JSON 이 한글을 이스케이프하지 않음과 SQLite `json_valid` CHECK 도 고정한다. JSON null 리터럴·`[null]` 시스템 원소의 NPE 는 기존 결함으로 `assertThrows` 에 남겼다(고치지 않음. null 리터럴 쪽은 뒤에 D1 수정 3e645c34, 원소 null 쪽은 D2 수정 d2c7b283 에서 새 동작 기대로 바꿨다 — 아래 결함 후보 1·2번). 커밋 본문: "특성 시험은 그대로 통과한다"(시험 로그 원문은 확인 필요).
- 영향 범위: mdm lib 의 dma(termMng·naming·columnMng) 4개 파일 + 신규 1개(134 추가·97 삭제). 화면·API·설정·다른 레인 변경 없음.
- 되돌리는 방법: `git revert cd6aca56`. S5 의 0ec7a57b 는 `ParsedTerm` 에서 `readStrings` 를 새로 부르고, S6 의 c273897e 는 `parseTermIds` 호출을 옮겼으며 이 메서드는 `MdmJsonLists.readLongs` 에 위임한다(ColumnMngService:710-711). 그래서 S5·S6 을 먼저 되돌려야 한다(S5·S6 은 코드로 확인함). S4(2153ebb7)는 `MdmJsonLists` 를 쓰지 않지만 cd6aca56 과 같은 ColumnMngService 를 고쳐 되돌릴 때 글자 충돌이 날 수 있다.

## S4. 컬럼 사전·용어 등록 팝업의 용어 사전 읽기 사본을 TermDictionaryLoader 하나로 합침
- 커밋: 2153ebb7(변경), f2392a4a(특성 시험, 7a3e0570 완성), 7a3e0570(wip — 컬럼 검색 특성 시험을 이동 준비로 중간에 남긴 커밋. 미검증 상태였고 f2392a4a 에서 완성·검증됨. 이 커밋을 단독 체크아웃하면 시험이 미완성이다)
- 바뀌기 전: `ColumnMngService`·`TermRegPopService` 가 용어 표 전체를 `TermDictionary` 로 만드는 private `loadDictionary` 를 각자 가졌다. 글자 그대로 같은 코드였다(1단계 특성 시험으로 차이 없음 확인 — 커밋 본문).
- 바뀐 뒤: `dma.support.TermDictionaryLoader.load(MdmTermRepository)`(신규 30줄) 하나. `findAll()` 순서를 그대로 넘기고 정렬하지 않는다. `dma.naming` 은 DB 에 기대지 않는 순수 패키지라 로더는 `dma.support` 에 둔다.
- 캐시를 넣지 않은 이유: 설계 불변 규칙 I26(요청마다 새로 읽음) 때문이다(`TermDictionaryLoader` javadoc, 커밋 본문). 그래서 이 항목은 성능 항목(P)이 아니라 구조 변경이다.
- 바꾼 이유: 같은 코드 사본 둘의 드리프트 방지.
- 동작 보존 근거: `ColumnMngLookupCharacterizationTest`(f2392a4a 신규)가 두 서비스의 사본 결과 동일과 "I26 요청마다 새로 읽기"를 고정한다. 2153ebb7 에서 이 시험을 "합치기 전 사본 코드를 시험 안 기준 사전으로 옮겨 공용 로더와 비교"하도록 고쳐 썼다. 통과 결과 원문은 확인 필요.
- 영향 범위: mdm lib 의 `columnMng`·`termRegPop` 서비스 둘과 신규 로더(52 추가·36 삭제). 화면·API·설정 변경 없음.
- 되돌리는 방법: `git revert 2153ebb7`(시험 f2392a4a 는 사본 비교 부분이 로더 기준으로 바뀐 상태라 되돌린 뒤 시험도 맞춰야 할 수 있음 — 확인 필요).

## S5. 용어 검색에 DB 1차 거름(TermSearchPrefilter) 도입
- 커밋: 0ec7a57b(변경), 64bcf6cc(NPE 행 보존 보정), 시험 29a613ba·f8087cce(변경 전 코드에서 통과 확인한 특성 시험 추가)
- 바뀌기 전: `TermMngService.search` 가 `termRepository.findAll()` 로 용어 전체(로컬 8,152행)를 읽어 Java 에서 키워드 → 시스템 → 상황 순서로 거르고, 행마다 JSON 칸(동의어·별칭·시스템)을 단계마다 다시 파싱했다. 정렬은 `findAll()` 의 SQLite 기본 순서에 기댔다.
- 바뀐 뒤: 호출 경로가 `termRepository.findAll(Specification, Sort)` 로 바뀐다.
  - 새 `TermSearchPrefilter`(Specification)가 키워드·상황 조건을 `UPPER … LIKE … ESCAPE '!'` 로 먼저 줄인다. 최종 판정은 기존 Java 비교가 그대로 한다(필요조건만 DB 에 건다).
  - `MdmTermRepository` 가 `JpaSpecificationExecutor` 를 더 확장한다. 정렬은 `ORDER BY TERM_ID` 로 명시한다.
  - 남은 행은 `ParsedTerm` 으로 JSON 세 칸을 한 번만 파싱해 키워드·시스템·응답 변환에 재사용한다.
- 바꾼 이유: 검색마다 용어 전체를 읽고 파싱하던 비용을 줄인다. 커밋 본문: 로컬 DB(8,152행) 기준 후보가 '코일' 22행, 'coil' 249행.
- 리뷰에서 확인한 대소문자·ESCAPE 처리(커밋 본문·javadoc 요약):
  - 대소문자: Java `toUpperCase(ROOT)` 는 ß→SS·ſ→S·ı→I·합자처럼 ASCII 밖 글자를 ASCII 로 바꾸지만 SQL `UPPER` 는 그렇지 않다(SQLite 는 ASCII 만 접음). 그래서 대문자 키워드에서 그런 변환 결과로 나올 수 없는 글자만 이어진 가장 긴 구간을 "바늘"로 쓰고, 그런 구간이 없으면 DB 에서 거르지 않는다.
  - ESCAPE: `%`·`_` 는 `ESCAPE '!'` 로 처리한다. 역슬래시를 이스케이프 문자로 쓰지 않은 것은 방언마다 문자열 리터럴의 역슬래시 해석이 달라서다. 쓰는 함수는 `UPPER`·`LIKE`·`ESCAPE` 뿐이라 Oracle·PostgreSQL·SQLite 공통 문법이라고 커밋 본문이 적었다.
  - JSON 칸: 이스케이프된 원소를 놓치지 않게 원문에 역슬래시가 든 행은 늘 남긴다.
  - 기존 결함 보존: JSON null 리터럴 NPE 동작을 바꾸지 않으려고 원문에 `null` 이 든 행도 남기고, 64bcf6cc 에서 키워드 단계 NPE 행을 상황 조건이 빼지 않도록 고쳤다(D1·D2 수정 뒤 90e507e5 에서 걷었다. 걷은 뒤에는 원문에 null 이 든 행도 다른 행처럼 키워드·상황 칸 LIKE 로만 판정되고, `of(...)` 의 시스템 조건 인자도 없어졌다. 검색 결과는 같다).
- 동작 보존 근거: `TermMngSearchCharacterizationTest`(29a613ba 354줄, 64bcf6cc 에서 2건 추가 — 옛 검색 코드에서는 통과하고 0ec7a57b 에서는 실패하던 것을 확인)·f8087cce 가 더한 3건(ASCII 로 바뀌는 원본 글자·느낌표·퍼센트·밑줄 섞인 키워드·상황 조건 뒤 시스템 NPE, 옛 코드에서 통과 확인. 커밋 본문의 21건은 그 시점 클래스 전체(18+3)가 옛 코드에서 통과한 수)·`TermSearchPrefilterTest`·`TermSearchPrefilterSqliteTest`(0ec7a57b). **SQLite 로만 확인함. Oracle·PostgreSQL 의 LIKE 대소문자 구분·ESCAPE·CLOB 비교는 정적 리뷰 결과이며 운영 DB 확인이 필요하다.** 시험 통과 로그 원문도 확인 필요.
- 영향 범위: `TermMngService`·신규 `TermSearchPrefilter`·`MdmTermRepository`(0ec7a57b 6개 파일). 가짜 저장소 파서 특성 시험은 새 조회 메서드를 스텁하도록만 고쳤다. 화면·API 응답 모양 변경 없음.
- 되돌리는 방법: 64bcf6cc 를 먼저, 이어 0ec7a57b 를 되돌린다(`git revert 64bcf6cc 0ec7a57b`). 특성 시험 29a613ba·f8087cce 는 남겨도 된다.

## S6. 컬럼 검색에 DB 1차 거름(ColumnSearchPrefilter)과 반복문 단건 조회 세 곳의 IN 조회 도입
- 커밋: c273897e(변경), 시험 f2392a4a(wip 7a3e0570 완성분)
- 바뀌기 전: `ColumnMngService.search` 는 도메인·용어·시스템 매핑·컬럼을 모두 `findAll()` 로 읽고 Java 에서 거렀다(옛 javadoc: 방언별 LIKE·대소문자 비교 차이와 `_` 와일드카드를 피하려고 Java 에서 거른다, 규모 수천 행). 엔티티 로드가 전체 행 수에 비례했고, 반복문 안에서 단건 조회를 불렀다 — `save` 의 용어 ID `existsById`(행마다), 매핑 충돌 소유 컬럼 `findById`, `compare(REVERSE)` 중복의 `findById`.
- 바뀐 뒤: 호출 경로가 바뀐다.
  - `search`: 조건이 있으면 새 `ColumnSearchPrefilter`(Specification)가 후보 컬럼과 그 매핑만 읽고(필요조건, 상관 `EXISTS`), 도메인은 후보가 가리키는 것만, 용어는 남은 컬럼의 `TERM_IDS` 에 든 것만 IN 으로 읽는다. 최종 판정·정렬은 기존 Java 비교 그대로다. `MdmColumnRepository`·`MdmColumnSystemRepository` 가 `JpaSpecificationExecutor` 를 확장한다.
  - `save` 용어 ID 존재 검사: 행마다 `existsById` → `MdmTermRepository.findExistingTermIds`(ID 투영 IN, 신규)를 한 번.
  - 매핑 충돌 소유 컬럼 `findById` → `findAllById` 한 번. `compare(REVERSE)` 중복의 `findById` → `findAllById` 한 번.
  - IN 은 500개씩 나눠 Oracle IN 1,000개 제한 안이다. 캐시는 넣지 않았다(I26).
- 바꾼 이유: 검색의 엔티티 로드와 반복문 안 왕복을 줄인다(수치는 perf-mdm-backend.md P4).
- 리뷰에서 확인한 대소문자·ESCAPE 처리(커밋 본문·javadoc 요약):
  - 대소문자: Java `toLowerCase(ROOT)` 와 SQL `LOWER` 가 다르다(SQLite 는 ASCII 만 접음, Java 는 Ä→ä·İ→i̇·K(켈빈)→k 처럼 ASCII 밖도 접음). 그래서 소문자로 바꿔 자기가 되는 원본 글자가 자기 자신과 ASCII 대문자뿐인 "안전 글자" 구간만 바늘로 쓰고, 그리스 어말 시그마(ς)는 문자열 문맥에서만 나오므로 따로 뺀다. 안전 구간이 없으면 글자로 거르지 않는다.
  - ESCAPE: `%`·`_`·`\` 를 글자 그대로 보려고 `ESCAPE '!'` 로 `!`·`%`·`_` 를 이스케이프한다. 역슬래시를 쓰지 않는 이유는 S5 와 같다. 함수는 `LOWER`·`LIKE` 만 쓴다.
  - 하위 조회는 상관 `EXISTS` 로만 쓴다(Criteria 의 `expr.in(subquery)` 는 Hibernate 가 `IN ((select …))` 로 그려 Oracle 에서 단일 행 하위 조회로 읽힐 수 있다는 javadoc 근거). 숫자·`-` 만 있는 도메인 키워드는 CAST 없이 도메인 행 존재만 본다.
- 동작 보존 근거: `ColumnMngSearchCharacterizationTest`(검색어·도메인 키워드 조건마다 일치·불일치·대소문자·한글·`%`·`_`·역슬래시·trim, 조건 없음, 결과 순서·건수·응답 13개 키)와 `ColumnMngLookupCharacterizationTest`(save 용어 `existsById` 경우들·충돌 소유 컬럼·REVERSE 중복)를 변경 전 코드로 먼저 고정했고(f2392a4a), `ColumnSearchPrefilterTest` 가 추가됐다. **SQLite 로만 확인함. Oracle·PostgreSQL 의 LIKE 대소문자 구분·ESCAPE·CLOB 비교는 정적 리뷰 결과이며 운영 DB 확인이 필요하다.** 시험 통과 로그 원문은 확인 필요.
- 영향 범위: `ColumnMngService`·신규 `ColumnSearchPrefilter`·저장소 세 개(`MdmColumn`·`MdmColumnSystem`·`MdmTerm`, 371 추가·40 삭제). 응답 모양·화면·설정 변경 없음.
- 되돌리는 방법: `git revert c273897e`. 특성 시험은 남겨도 된다(쿼리 수는 기록만 하고 단언하지 않음(코드 확인 — Lookup 400행·Search 355행 javadoc "단언하지 않는다 — 2단계가 바꿀 값이다")).

## S7. MdmRuleEngine.evaluateSet 의 세트 판정 준비를 엔진 안에 기억
- 커밋: d56dde59(변경), 시험 262ca6df(변경 전 특성 시험·측정 시험)·c2f3a3b0(적중·무효화를 같은 객체 여부로 단언, 시험용 접근자 `cachedTree`·`cachedKeys` 를 `MdmRuleEngine` 에 추가)·023d4185(지연 목록 분리 단언). 측정 기록 커밋 cf1c962c·87ac5868·7b771189 와 6ad94faa 는 문서·측정 시험이라 구조 변경이 아니다.
- 바뀌기 전: `MdmRuleEngine.prepare` 가 판정(`evaluateSet`)마다 `FlowParser.parse` 로 흐름 트리를 만들고 `new FlowKeys(defs, expressions)` 로 입력 키 검사기를 만들었다.
- 바뀐 뒤(d56dde59 코드 확인):
  - `MdmRuleEngine` 이 `ConcurrentHashMap<String, Plan> plans`(키 = 세트 ID)를 가진다. `Plan` 은 세트 정의 객체·흐름 트리·고른 룰 정의 맵(읽기 전용 복사본)·`FlowKeys` 원본을 든다.
  - 적중 조건: 세트 정의 객체가 기억한 것과 같은 객체(`p.set == set`, `cachedPlan`)이고 흐름 트리를 쓴다. 입력 키 검사기 원본은 그 호출이 고른 룰 정의 맵이 기억한 것과 같은 룰 ID·순서·같은 객체(`Plan.sameDefs`)일 때 쓴다. 세트 정의만 같고 룰 정의가 바뀌면 흐름 트리는 쓰고 검사기만 새로 만든다. 세트 정의가 바뀌면 둘 다 새로 만든다(c2f3a3b0 시험이 이 구분을 단언).
  - 무효화: 별도 무효화 호출이 없다. 재등록·RELOAD·상태 변화로 새 정의 객체가 오면 동일성이 깨져 새로 만들고 `plans.put` 으로 바꿔 넣는다.
  - 크기 상한: `MAX_PLANS = 512`. 새 세트 ID 를 넣을 때 크기가 512 이상이면 `plans.clear()` 뒤 다시 채운다(LRU 아님). 세트 ID 가 null 이면 기억하지 않는다.
  - 파싱 실패 비기억: 흐름 파싱은 private `parse(set)` 로 나눴고, 트리가 null 이면 `FLOW_INVALID` 를 던져 `remember` 에 닿지 않는다.
  - 스레드 안전: `ConcurrentHashMap` 이고 `Plan` 의 필드는 모두 final·읽기 전용이다. `FlowKeys` 는 정의 부분(룰 정의·선언 타입)을 사본끼리 나눠 쓰고 지연 목록만 새로 가진 `forRun()` 사본을 판정마다 쓴다(원본에는 `check` 를 부르지 않음). 같은 세트를 처음 동시에 부르면 둘 다 새로 만들어 마지막 것이 남는다(조회 뒤 put, 한쪽 결과가 버려질 뿐 결과는 같음 — 코드로 추론한 것이라 동시성 시험으로 확인한 사실은 아님. 32 가상 스레드 시험 262ca6df 는 결과 동일만 본다).
  - 호출마다 그대로 하는 것: 상태 검사(폐기 세트)·룰 조회·레코드 키 검사·입력 키 검사.
  - 호출부 무수정: 커밋 변경 파일은 `MdmRuleEngine`·`FlowKeys`·시험 1개뿐이고 public API·cactus `MdmValidator` 는 바뀌지 않았다(커밋 본문·`--stat`).
- 바꾼 이유: 오래 사는 엔진에 같은 정의 객체가 계속 올 때 판정마다 파싱·검사기 생성을 되풀이하지 않게 한다(수치는 perf-mdm-backend.md P5).
- 동작 보존 근거: `RuleSetPrepareCharacterizationTest` 9건(반복 호출·정의 변경·폐기·파싱 실패·가상 스레드 32개 동시, 262ca6df 로 변경 전 코드에서 먼저 고정)과 `RuleSetPreparePlanCacheTest` 5건(적중 assertSame·교체 assertNotSame·상한·파싱 실패 비기억·사본 분리). 커밋 본문: engine 1,620(건너뜀 1)·mdm lib 1,648·api 1,613 통과, oasis-contract-check ERROR 0(로그 원문은 확인 필요). c2f3a3b0·023d4185 는 기억을 늘 놓치게 하거나 지연 목록을 공유하게 한 변형에서 시험이 실패함을 커밋 본문이 밝힌다.
- 영향 범위: engine 모듈(`MdmRuleEngine`·`FlowKeys`)만. 호출부·설정·화면·다른 레인 변경 없음.
- 알려진 한계: 정의 객체를 만든 뒤 안의 List·Map 을 고치는 생산자가 있으면 옛 트리를 다시 쓴다. 운영 경로(cactus `MdmCachedDefinitions`, mdm `StoredDefinitionLookup`)에서는 찾지 못했다(측정 문서 기록 — `MdmCachedDefinitions` 에 정의 객체를 고치는 생산자가 없다는 서술은 다시 보지 못했다, 확인 필요). mdm 의 `StoredDefinitionLookup.ruleSet` 은 `setCache` 를 키 `setId + "@" + evalTs` 로 두고(149~157행), `RuleSetRunner` 는 엔진과 조회기를 요청마다 새로 만든다(130·338행). 그래서 한 요청 안에서 판정 시각이 같은 호출끼리는 적중하고, 시각이 다르거나 요청이 다르면 놓친다(코드 확인).
- 되돌리는 방법: `git revert 023d4185 c2f3a3b0 87ac5868 d56dde59`(새것부터). c2f3a3b0 이 같은 `MdmRuleEngine.java` 에 접근자를 더했고 87ac5868 의 `RuleSetPrepareBenchTest` 가 `cachedPlans()` 를 쓰므로 d56dde59 만 되돌리면 충돌하거나 컴파일되지 않는다. 시험 262ca6df 의 특성 시험은 남겨도 된다.

## S8. RuleAnalyzer.analyze·FlowParser.parse 긴 메서드를 검사 단계별 private 메서드로 분리
- 커밋: b79d9cc9(`RuleAnalyzer`), 50c5d09e(`FlowParser`), 분할 전 특성 시험 cc1d1936.
- 바뀌기 전: `RuleAnalyzer.analyze` 가 약 190줄, `FlowParser.parse` 가 약 170줄(커밋 본문)의 한 메서드였다.
- 바뀐 뒤: 두 메서드는 단계 호출 순서만 남기고, 이슈 리스트를 인자로 넘겨 순서대로 append 한다. 이슈 순서·문구·코드와 public 시그니처는 그대로다(Builder 도 불변).
  - `RuleAnalyzer.analyze` 호출 순서(b79d9cc9 diff): `columnsOf` → `dropAllNaRows`(1. 전부 NA 행) → `cellSets` → `checkUnresolvedCells`(2. 못 푸는 셀) → `checkOverlaps`(3. 겹침, 겹침 행 쌍 색인을 돌려줌) → `checkUnreachable`(4. 도달 불가, `first` 일 때만) → `checkValueGaps`(5. 값 빈틈; 안에서 `gapGroups`·`addGridGaps`) → `checkNullGaps`. 마지막에 `List.copyOf(issues)`.
  - `FlowParser.parse` 호출 순서(50c5d09e 커밋 본문·diff): `indexNodes`(a) → `attachedCatches` → `checkStartEnd`(b1·b2) → `linkEdges`(c) → `checkNodes`(d·e·f1) → `checkSplits`(f2·g1..g5·f4; 안에서 `checkIfBranches`/`checkParallelBranches` → `checkBranchOrders` → `checkSameTarget`) → `checkCatchNodes`(h1..h5) → `checkCatchTargets`(h6·h7) → `buildTree`. `linkEdges` 의 위치는 HEAD `FlowParser.parse` 65행에서 확인했다(코드 확인).
- 바꾼 이유: 긴 메서드를 검사 단계별로 읽고 시험할 수 있게 한다. 성능 목적이 아니다.
- 동작 보존 근거: cc1d1936 의 `RuleAnalyzerOrderCharacterizationTest`(여섯 단계 이슈가 함께 날 때의 순서·문구, 빈 셀·Equal 열 EQ 요약·Expression 열 이름 대체·못 푸는 칸이 낀 값 빈틈 묶음 건너뛰기)와 `FlowParserStageOneCharacterizationTest`(1단계 a→b→c→노드별→분기별→받는 노드별→붙은 노드별 순서 전체와 문구). 기존 코퍼스 시험: b79d9cc9 본문 engine `*RuleAnaly*` 34건·mdm `RuleAnalysisCorpusTest` 46건 통과, 50c5d09e 본문 engine 전체 1,629건(건너뜀 1) 통과(로그 원문은 확인 필요).
- 영향 범위: `RuleAnalyzer`·`FlowParser` 두 파일(b79d9cc9 117 추가·72 삭제). 호출부·설정·화면 변경 없음.
- 되돌리는 방법: `git revert 50c5d09e b79d9cc9`. 시험 cc1d1936 은 남겨도 된다.

## 메모
- 항목 1(마스터코드 선분 flush, a139fe07·8db3e93c·0daad719)은 구조 변경이 아니라 쓰기 시점 변경이라 S 에 넣지 않는다. 성능 기록 P1 에 있다.

## 발견한 기존 결함 후보(고치지 않음, 수정분 표시)
2차 구조 변경 작업(워크플로 wf_4800545b-5b2·wf_0bfb5e10-6f5 단계 보고)에서 찾은 기존 결함 후보다. 모두 "동작 변경이라 fix 커밋 대상, 이번 레인에서는 고치지 않음". 특성 시험이 현재 동작 그대로 고정해 두었으므로 고칠 때는 시험도 함께 고친다. 보고서 기반이며 코드로 다시 확인하지 않은 항목은 "확인 필요"로 표시했다.

1. JSON null 리터럴 저장 시 NPE(용어 JSON 칸) — **수정됨(3e645c347c9bdfd82ec7100a2748f22f79fe36f9, fix/refactor-followups)** — 수정 전에는 그런 행이 하나만 있어도 `recommend` 전체가 실패했다. 이하는 수정 전 상태 기록. `json_valid` 를 통과하는 `null` 리터럴이 저장되면 목록이 null 이 되어 키워드 검색·시스템 조건 검색·`recommend` 1차 추천(캐시 synonyms for-each)이 NPE 로 실패한다. 근거: `MdmJsonLists.readStrings`(null 리터럴이면 null), `TermMngService.search`, `TermRecommendationCache`; 시험 `TermMngSearchCharacterizationTest`·`TermJsonListCharacterizationTest`(assertThrows). 수정은 파서가 null 대신 빈 목록을 돌려주게 했다(`readStrings`). `TermSearchPrefilter` 의 `%null%` 보존 OR 조건(64bcf6cc 포함)은 D1·D2 수정 뒤에는 결과를 바꾸지 않고 남는 행만 늘려서 90e507e5 에서 걷었다(2번 참고). 운영 방언은 `json_valid` CHECK 가 SQLite 마이그레이션에만 있어 저장값이 유효 JSON 이라고 가정할 수 없다.
2. 목록 원소 null(`[null]`) NPE — **수정됨(d2c7b283, fix/refactor-followups)**. 수정 방침은 파서 `readStrings` 가 파싱 뒤 null 원소를 버리는 것이다(공백·빈 문자열 원소는 남기고, 자리를 지켜야 하는 `readLongs`·`readArrayElements` 는 바꾸지 않음). 이하는 수정 전 상태 기록. 파서는 `[null]` 을 null 원소 하나짜리 목록으로 읽었다(D1 수정 뒤에도 그대로). 두 경로가 실패했다.
   - 시스템 조건 검색: SYSTEMS 에 `[null]` 이 있으면 `s.equalsIgnoreCase` 에서 NPE. 근거: `TermMngService.search` 시스템 단계, `TermDictionaryParseSurfacesCharacterizationTest`·`TermMngSearchCharacterizationTest`(`[null]` 시스템 고정 시험 있음).
   - `recommend` 1차 추천: SYNONYMS 에 `[null]` 인 행이 캐시에 하나라도 있으면 `recommendStage1` 의 `TRAILING_PAREN.matcher(syn)` 이 `matcher(null)` NPE 를 내 모든 추천 요청이 실패한다(D1 수정 전과 같은 범위). 근거: `TermMngService.recommendStage1` 277행, `TermRecommendationCache.toCachedTerm` 이 `readStrings` 결과를 그대로 캐시(코드 확인). 수정 전에는 이 경로를 고정한 특성 시험이 없었고(grep 확인), 수정 때 `TermJsonListCharacterizationTest` 에 재현 시험을 더했다.
   - 고친 방식: 두 경로를 파서 한 곳에서 함께 고쳤다. `TermSearchPrefilter` 의 `%null%` 보존 조건(1번 참고)은 D2 커밋에서는 그대로 두었고 뒤의 90e507e5 에서 걷었다.
3. L16 칸 구분에 항목 순번(seq) 포함 — `l16Cell` 이 L16 칸을 구분할 때 순번을 넣어, 헤더 항목 순서만 바뀌어도 이미 있던 L16 이 새 오류(ERROR)로 올라온다. 예: 삭제 시나리오 M7(LEN3 순번 2→1). 근거: 레이아웃 헤더 확정 영향도(S2 `LayoutHeaderImpact`·`LayoutHeaderImpactEquivalenceSqliteTest`, 시험 주석에 기록. `l16Cell` 은 `mdm/lib/.../dmb/layout/confirm/LayoutHeaderImpact.java:267` 에서 `i.seq()` 를 칸 키에 넣는다, 코드 확인).
4. MDM018 충돌 순서 미정 — 다른 컬럼에 대소문자만 다른 매핑이 둘 있으면 메시지 안 충돌 순서가 정해지지 않는다. 근거: `findBySystemCodeAndUpperPhysNameIn` 에 `ORDER BY` 없음(`ColumnMngService` 매핑 충돌 검사, S6).
5. REVERSE 중복 미병합 — `compare(REVERSE)` 의 중복 목록이 같은 컬럼을 합치지 않아 여러 번 나올 수 있다. 근거: `ColumnMngService.compare`, `ColumnMngLookupCharacterizationTest`.
6. 무관 용어 ID 수용 — `resolveTermIds` 는 논리명과 상관없는 용어 ID 도 존재만 하면 받는다. 근거: `ColumnMngService.resolveTermIds`.
7. 소수 termId 절삭 — termId 가 소수(Number)로 오면 `longValue` 로 잘려 다른 ID 로 저장될 수 있다. 근거: `ColumnMngService.toLong`(742행 부근 `n.longValue()`)을 termId 해석부(426행)가 쓴다.
8. 전각 공백 미절단 — 컬럼 검색어·도메인 키워드 모두 전각 공백을 자르지 않는다. 근거: `ColumnMngService.search` 의 trim 처리, `ColumnMngSearchCharacterizationTest`.
9. FlowParser h6 문구 중복 — 한 받는 노드가 같은 종류를 두 번 적고(`c2=[NO_RESULT, NO_RESULT]`) 같은 대상의 다른 받는 노드도 그 종류를 받으면 "룰 노드 t1에서 예외 종류 NO_RESULT를 c1와 c2가 함께 받는다" 가 두 번 나고 h5 겹침 이슈와도 겹친다. 근거: `FlowParser.checkCatchTargets`(50c5d09e 이전 h6), `FlowParserStageOneCharacterizationTest`. TS `flow-model.ts` 266~274행의 owner 로직도 같다(코드 확인).
10. FlowParser h6·h7 문구 — 대상이 TASK 여도 "룰 노드 t1"·"룰 t1로" 라고 쓴다. 근거: `FlowParser.checkCatchTargets`. 문구 결함이라 우선순위 낮음.
11. RuleAnalyzer 죽은 분기 2곳 — 5단계 `isExpressionColumn` 검사(Expression 열은 영역이 STRING 이라 앞 조건에서 이미 빠짐)와 `describe()` 의 빈 셀 `''` 분기(빈 셀은 exact 가 아니라 OVERLAP 문구에 닿지 않음). 분할 때도 그대로 둠. 근거: `RuleAnalyzer.checkValueGaps`·`describe`; 커버리지 도구 없이 코드 읽기로 판정했다. `domainOf` 가 Expression 열에 STRING 을 주므로 `isExpressionColumn` 분기는 죽었고, 빈 셀은 `UNKNOWN_NULL`(exact 아님)이라 `crosses` 가 YES 를 줄 수 없어 `describe` 의 `""` 분기에 닿지 않는다(코드 확인).

추가 수정(위 목록 밖): `TermMngService.afterCommitOrNow` 의 커밋 뒤 캐시 갱신 예외가 S001 로 번지던 문제를 c5c26f156a996306145ec5e9080f631a6be40e76 로 고쳤다(경고 로그만 남기고 삼킴).

기록만 하고 결함은 아닌 것: 0ec7a57b 단독 시점의 "상황 조건 + 키워드 단계 NPE 행" 동작 변화는 64bcf6cc 가 바로잡았다(HEAD 는 정상, bisect 로 그 커밋에 멈출 때만 해당).
