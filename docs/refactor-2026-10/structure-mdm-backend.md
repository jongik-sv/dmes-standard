# 구조 변경 기록 — MDM 백엔드·엔진 레인

레인: MDM 백엔드·엔진(세션 dmes-standard-b9) / 브랜치: `refactor/mdm-backend` / 기준 태그: `refactor-2026-10-base`.
형식은 `docs/refactor-2026-10/README.md` §6.1 을 따른다. 이 문서는 1차 머지분이며, 이후 머지에서 항목이 늘어난다.

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
  - 이 커밋 시점 이후에도 같은 이름의 private 사본이 남은 파일: RuleConfirmService·RuleSetConfirmService·CodeConfirmService(`trimToNull`), RuleSetEditService(`blankToNull`), CodeConfirmService·RuleTableService·RuleCellsCodec(`invalid`, 반환 타입·메시지 처리가 같은지 확인 필요), `str(BigDecimal)`(CodeItemEditService·CodeCateEditService, 인자 타입이 달라 대상 아님), RuleColumnsSaveRequest.`str`. 남긴 이유는 커밋 본문에 없다 — 확인 필요.
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

## 메모
- 항목 1(마스터코드 선분 flush, a139fe07·8db3e93c·0daad719)은 구조 변경이 아니라 쓰기 시점 변경이라 S 에 넣지 않는다. 성능 기록 P1 에 있다.
