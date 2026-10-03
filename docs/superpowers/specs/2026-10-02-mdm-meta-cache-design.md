# MDM 메타 제공과 업무 모듈 캐시 설계 (하위 프로젝트 A)

> 작성: 2026-10-02 · 브랜치 `feat/mdm-meta-cache` · 상태: 설계 확정, 구현 계획 대기
> 상위 요구: `docs/idea.md` 의 "MDM 캐시관리 / UI 캡션 자동 연동 / 룰 엔진 실행 검증 / Form·Grid 헤더 툴팁"

## 1. 목적과 범위

### 1.1 상위 요구 네 가지와 분해

| # | 상위 요구 | 하위 프로젝트 |
|---|---|---|
| 1 | MDM 캐시 관리: 룰·도메인·컬럼사전·룰세트·전문을 요청 시 적재하고 재사용, 캐시 등록·삭제·재등록 | **A (이 문서)** |
| 2 | UI 캡션·라벨을 MDM 에서 자동으로 가져옴 | B |
| 4 | Form·Grid 헤더에 마우스를 올리면 컬럼·도메인 정보를 툴팁으로 표시 | B |
| 3 | 룰 엔진 실행 검증: 화면 값 자동 검증, BE 값 검증 | C |

A 는 B 와 C 가 공통으로 딛는 기반이다. 업무 모듈이 MDM 메타를 받아 캐시하고, 화면과 BE 가 그 캐시를 쓰게 만드는 데까지가 A 의 범위다. 캡션 적용, 툴팁 표시, 화면·BE 검증 실행은 B·C 가 한다. 단, A 는 B·C 가 쓸 메타의 모양(§4)을 이 문서에서 고정한다.

### 1.2 현재 상태 (2026-10-02 조사)

- 업무 모듈(mcm·mls·mqc·mpp·mpn)은 MDM 을 전혀 참조하지 않는다. 라이브러리·HTTP·DB 어느 경로도 없다.
- MDM(8096, 전용 SQLite)은 원장 관리 화면 + 엔진 + 내부 룰세트 실행기 단계다. 메타를 다른 모듈에 내주는 API 가 없다.
- MDM 안에 룰·도메인·컬럼 정의 캐시가 없다. 룰세트 실행도 호출마다 DB 를 읽는다.
- 업무 화면의 라벨·그리드 헤더는 모두 한글 하드코딩이다. 프론트 데이터 캐시 도구(react-query 등)도 없다.
- 컬럼 하나의 엔진 `ColumnDefinition` 을 DB 에서 조립하는 운영 코드가 없다(`StoredDefinitionLookup.column()` 은 빈 값). 테스트 케이스용 합성(`DomainTestCaseRunner.definition`)만 있다.

### 1.3 확정한 결정 (2026-10-02 사용자 결정)

| # | 결정 | 내용 |
|---|---|---|
| D1 | 배포 구조: 하이브리드 | 정의는 MDM 서버에 HTTP 로 요청해 받고, 업무 모듈은 받은 정의를 자기 로컬 캐시에 두고 엔진 jar 로 직접 검증한다 |
| D2 | 무효화: 리비전 확인 | MDM 이 변경 기록(증가 순번)을 남기고, 업무 모듈은 짧은 주기로 "순번 N 이후 변경"을 받아 해당 키만 지운다 |
| D3 | FE 경로: 업무 BE 경유 | 화면 → 업무 모듈 BFF → 업무 BE(로컬 캐시). 화면과 BE 검증이 같은 캐시를 본다 |
| D4 | 캐시 위치: MES 모듈에만 | MDM 서버에는 캐시를 두지 않는다. 늘 DB 최신 값을 돌려준다. 이전에 고른 "MDM 캐시 + 모듈 반영 상태"는 이 결정으로 대체됐다 |
| D5 | 관리 화면: MES 포털 | 캐시 관리 화면은 m-mcm 시스템관리(csa) 메뉴에 둔다. 모듈별 캐시 상태와 항목을 보여 준다 |
| D6 | 삭제·재등록 범위: 모든 모듈 | 화면의 삭제·재등록은 MDM 변경 기록에 강제 기록을 추가하는 방식이다. 그 키를 가진 모든 모듈·인스턴스가 다음 폴링에서 반영한다 |
| D7 | 화면 연결 키: 자동 매칭 + 명시 우선 | 그리드 key·폼 필드명을 물리명으로 바꿔(`codeNm` → `CODE_NM`) 컬럼사전 `PHYS_NAME` 과 맞춘다. 화면이 `meta="..."` 로 명시하면 그것이 우선한다(B 에서 구현) |
| D8 | 검증 분담: 엔진 계약 §10 | 필수·타입·길이·코드 허용값·도메인 표준식은 화면에서 즉시 검사한다. 비즈니스식·룰·룰세트·화면 미지원 식은 업무 BE 가 한다. 저장 시 BE 가 전부 다시 검증하고, 다르면 서버가 기준이다(C 에서 구현) |
| D9 | 구현 위치: cactus-core | 업무 모듈 쪽 클라이언트는 새 모듈이 아니라 cactus-core 의 `com.dongkuk.dmes.cactus.mdm` 패키지에 둔다. 모든 MES 모듈이 이미 cactus-core 를 소스로 포함하므로 모듈별 빌드 배선이 필요 없다 |

## 2. 전체 구조

```
[MDM 서버 8096]                               [업무 모듈 mcm·mls·… (인스턴스 N개)]
 원장 저장·버전 확정 서비스                       cactus-core  com.dongkuk.dmes.cactus.mdm
   └ 본문에서 MetaRevisionRecorder 호출          ├ MdmMetaCache (대상별, 요청 시 적재)
 TB_MDM_META_REV                                ├ MdmRevisionPoller (기본 10초) ── changes(since) ─┐
  (REV_SEQ·TARGET_TYPE·TARGET_KEY·CHANGE_KIND) ◀──────────────────────────────────────────────────┘
 OASIS dmf/metaFeed  ◀───────── 캐시에 없는 키를 묶어서 조회 ── MdmMetaClient (RestClient)
  changes · columns · domains · rules ·          ├ MdmDefinitionLookup (엔진 spi 구현)
  ruleSets · codes · layouts · force             └ 엔드포인트 /api/{module}/mdmMeta/*
        ▲                                              ▲ 화면 메타 조회(B), 캐시 관리(D5)
        │ force (삭제·재등록)                          │
 [MES 포털 m-mcm csa/mdmCacheMng 화면] ────────────────┘ 모듈 상태·항목 조회, 미리 적재
```

## 3. MDM 서버 쪽

### 3.1 변경 기록 테이블 `TB_MDM_META_REV`

| 칼럼 | 타입 | 설명 |
|---|---|---|
| `REV_SEQ` | 정수 PK, 자동 증가 | 전역 증가 순번 |
| `TARGET_TYPE` | VARCHAR(20) | `COLUMN`·`DOMAIN`·`RULE`·`RULE_SET`·`CODE`·`LAYOUT` |
| `TARGET_KEY` | VARCHAR(100) | 대상 키(§4.1) |
| `CHANGE_KIND` | VARCHAR(10) | `SAVE`(원장 변경), `EVICT`(화면 삭제), `RELOAD`(화면 재등록) |
| `REG_DT` | 일시 | 기록 시각 |
| `REG_ID` | VARCHAR | 기록한 사용자 |

- Flyway 는 `flyway-migration-add` 스킬로 채번한다(작성 때 SQLite 마지막 V16 → V17 예상이었으나, dev 의 V17 `rule_version_decimal`(D-144)·V18 `rule_set_version`(D-144 2단계)을 합치고 레이아웃 버전 관리(3단계)가 V19 를 잡아 **V20** `create_mdm_meta_rev` 로 바뀌었다). 인덱스는 PK 하나로 충분하다(조회는 늘 `REV_SEQ > :since`).
- 보관: 30일이 지난 행은 정리할 수 있다. 정리로 생긴 공백은 클라이언트가 §5.3 규칙으로 처리한다. 정리 작업 자체는 이번 범위에 넣지 않는다.

### 3.2 기록 서비스 `MetaRevisionRecorder`

mdm 서비스는 `@Transactional` 을 쓰지 않는다(CGLIB 프록시가 OASIS 파라미터 이름을 지운다). 원장 쓰기는 OASIS action 트랜잭션(`cactus.oasis.transactional: true`) 또는 `TransactionTemplate`(REQUIRED) 안에서 일어난다. 그래서 기록은 **각 쓰기 메서드 본문에서 원장 쓰기 직후 `MetaRevisionRecorder` 를 직접 호출**한다. 같은 트랜잭션에 합류하므로 원장이 롤백되면 기록도 롤백된다.

`MetaRevisionRecorder` 는 키 펼침을 맡는다. 호출하는 서비스는 "무엇이 바뀌었는지"만 넘긴다.

| 메서드 | 기록하는 키 |
|---|---|
| `column(oldPhysName, newPhysName, layoutFeedMayChange)` | 두 물리명 모두(같으면 하나). 신규는 새 이름만. 펼침이 켜지면 두 물리명을 항목으로 쓰는 RELEASED 레이아웃 버전(지난 구간 포함, LEGACY 스냅샷 버전 제외)의 전문 ID, 헤더면 헤더 + 그 헤더를 쌓은 전문(`LayoutQueries.withStackingMessages`)을 LAYOUT 키로 더한다(D-144 3단계 최종 검토 I1 — 전문 합성의 타입·단위·소수가 그때의 사전에서 왔다. D-151 이후 확정한 버전은 항목 행에 고정돼 사전과 무관하므로 펼침은 값이 바뀌지 않는 키까지 거는 무해한 무효화로 남긴다). 2인자 판은 펼침을 켠다 |
| `domain(domainId, layoutFeedMayChange)` | 그 도메인 + `DomainImpactQueries.subtree(domainId)` 의 하위 도메인 전부 + 그 도메인들을 참조하는 컬럼의 물리명 전부. 펼침이 켜지면 그 컬럼들로 위와 같이 LAYOUT 키를 더한다. 1인자 판은 펼침을 켠다. `code(…)` 의 도메인 펼침은 LAYOUT 으로 펼치지 않는다(코드 변경은 타입·단위·소수를 바꾸지 않는다) |
| `rule(ruleId)` | 그 룰 |
| `ruleSet(setId)` | 그 룰세트(버전 구분 없이 세트 키 하나 — 클라이언트는 RELEASED 버전 목록째 다시 받는다) |
| `code(maruCodeId)` | 그 코드 + `MARU_CODE_ID` 로 직접 참조하는 도메인 각각에 대해 `domain(…)` 펼침(상속받는 하위 도메인·컬럼까지) |
| `layouts(layoutIds)` | 넘겨받은 전문 전부 |
| `force(type, keys, kind)` | 화면 요청(§3.4). 펼치지 않는다 |

- 시스템 별칭(2026-10-03 [별칭 매칭](2026-10-03-mdm-column-system-alias-design.md) L6): `column(…, systemAliases)` 4인자 판은 그 컬럼의 시스템 별칭을 COLUMN 키(대문자)로 더한다 — 컬럼 저장은 바뀌기 전·뒤 별칭을 모두 넘긴다(별칭이 그대로여도). `domain`·`code` 펼침도 참조 컬럼의 모든 시스템 별칭을 한 번에 읽어(`DomainImpactQueries.systemAliases`) 더한다. 별칭은 LAYOUT 펼침에 쓰지 않는다.

### 3.3 호출 지점

판정에 쓰이는 값(RELEASED 버전, 유효 도메인, 컬럼 속성, 룰세트 정의, 전문)이 바뀌는 쓰기에만 건다. DRAFT 편집·선점·테스트 케이스 저장은 캐시 값에 영향이 없으므로 걸지 않는다. 의심스러우면 거는 쪽을 택한다(과잉 기록은 캐시 재적재 한 번이 비용이고, 누락은 오래된 값이 남는다).

| 대상 | 호출 지점 |
|---|---|
| 컬럼 | `ColumnMngService.save` — 변경 전 물리명·도메인을 저장 전에 읽어 둔다(물리명 변경 가능, :308-310). 신규·물리명 변경·도메인 교체면 그 물리명을 쓰는 RELEASED 전문(헤더면 쌓은 전문까지)을 LAYOUT 키로 펼친다(`LayoutColumnUsersSpi`, 최종 검토 I1). 이름·라벨·설명만 바뀐 저장은 펼치지 않는다 |
| 도메인 | `DomainMngService.save` — 변경 분류가 COMPATIBLE(이름·정의·예시·테스트 케이스만)이 아니면 참조 컬럼을 쓰는 RELEASED 전문까지 LAYOUT 키로 펼친다(최종 검토 I1, 의심스러우면 거는 쪽) |
| 룰 | `DefaultVersionStateService.confirm`·`cancelConfirm`(룰·코드 공통, 대상 종류로 분기), `RuleHeaderService.saveHeader`·`deprecate`, `RuleVersionService` 의 RELEASED 에 영향을 주는 경로 |
| 룰세트 | `DefaultVersionStateService.confirm`·`cancelConfirm`(룰과 같은 공통 확정 — 세트 확정 화면 `RuleSetConfirmService`·확정 취소 `RuleSetVersionService.cancelConfirm` 이 이 한 곳을 지난다), `RuleSetEditService.delete`(target SET 폐기)·`restore`(부모 상태가 피드의 `status` 를 바꾼다). D-144 2단계 뒤 등록(`RuleSetMngService.register`, CREATED + 1.000 DRAFT)·저장(내 DRAFT 에만)·새 버전·선점·해제·넘기기·DRAFT 삭제는 RELEASED 를 바꾸지 않아 걸지 않는다 |
| 마스터코드 | 위 공통 확정·확정 취소, `CodeEditService.saveHeader`·`deprecate`·`deleteCode`, `CodeItemEditService.patch`(RELEASED 행 제자리 수정), `CodeCateEditService` 의 RELEASED 영향 경로 |
| 전문 | D-144 3단계 뒤: `DefaultVersionStateService.confirm`·`cancelConfirm`(레이아웃·헤더 확정 `LayoutConfirmService`·확정 취소 `LayoutVersionService.cancelConfirm` 이 이 한 곳을 지난다 — 헤더면 그 헤더를 쌓은 MESSAGE 전문까지 `LayoutQueries.withStackingMessages` 로 펼친다), `LayoutMngService.save`·`HeaderMngService.save` 는 버전 무관 부모 칸(전문 이름·송수신 시스템, 헤더 이름 — 합성 스냅샷에 실린다)이 바뀌고 RELEASED 가 있을 때만(헤더는 쌓은 전문까지). DRAFT 저장·새 버전·선점·해제·넘기기·DRAFT 삭제는 RELEASED 를 바꾸지 않아 걸지 않는다(3단계 전에는 `LayoutMngService.save`, `HeaderMngService.save`(헤더 + `recalculateUsers` 가 돌려준 MESSAGE 전문 전부)) |

- 로컬 샘플 적재(`MdmLocalSampleLoader`)는 기록하지 않는다. 클라이언트는 기동 직후 캐시가 비어 있으므로 영향이 없다.
- 기록 누락에 대비한 안전망으로 클라이언트 캐시에 긴 최대 수명(기본 60분, §5.2)을 둔다.

### 3.4 메타 제공 OASIS 서비스 `dmf/metaFeed`

`services/dmf/metaFeed.bpmn` + `@Service("metaFeedService")`. 선례는 `dmd/dataHistory`. `dmf` 는 "MDM 메타 제공(feed)" 서비스 그룹이다. 조회 action 은 `TransactionTemplate.setReadOnly(true)` 로 읽는다.

| action | params | 응답 |
|---|---|---|
| `changes` | `since`(정수), `limit`(기본 1000) | `latestSeq`, `items[{seq, type, key, kind}]`, `truncated`(limit 초과 여부) |
| `columns` | `physNames[]`, 선택 `systemCode` | 찾은 컬럼의 메타 목록(§4.2). 없는 키는 응답에서 빠진다. `systemCode` 가 있으면 표준 물리명으로 못 찾은 키를 그 시스템의 `TB_MDM_COLUMN_SYSTEM` 별칭(대소문자 무시)으로 찾고, 한 별칭이 여러 컬럼을 가리키면 없음+WARN 이다(2026-10-03 [별칭 매칭](2026-10-03-mdm-column-system-alias-design.md)). 구현은 `metaFeed/view` 의 `params.type=COLUMN`·`params.systemCode` |
| `domains` | `domainIds[]` | 유효 도메인 메타 목록(§4.3) |
| `rules` | `ruleIds[]` | 룰별 RELEASED 버전 **전체**의 `RuleDefinition` 목록(적용 기간 포함) |
| `ruleSets` | `setIds[]` | 세트별 RELEASED 버전 **전체**의 `RuleSetDefinition` 목록(`ver`·적용 기간 포함, D-144 2단계) |
| `codes` | `maruCodeIds[]` | 엔진 `CodeLookup.CodeRows`(헤더·버전·항목·카테고리·카테고리 항목, 해석 전 원본)의 RELEASED 투영(`CodeRowsProjection.releasedOnly`, D-152 — RELEASED 가 아닌 버전(DRAFT·REQUESTED·APPROVED·CANCELLED)과 그 버전에서만 유효한 행은 싣지 않는다) |
| `layouts` | `layoutIds[]` | 전문별 RELEASED 버전 **전체**(D-144 3단계) — 버전마다 `ver`(문자열 `"1.000"`)·`applyFrom`·`applyTo` 와, 그 구간을 쌓은 헤더 버전 경계로 나눈 합성 구간 `segments[{applyFrom, applyTo, snapshot}]`(`MdmLayoutSnapshot`). 헤더 레이아웃은 빠지고, 어느 구간이든 합성이 깨진 전문은 그 키만 failed(Ruling R4). 정상 운영 경로의 구간 빈틈(쌓인 헤더의 첫 버전 확정 취소 등)은 헤더 확정 취소 가드(판정 P3-22 — 쌓은 RELEASED 전문의 적용 구간이 합성되지 않게 되면 원장에서 거부)가 막으므로, failed 는 원장 손상 같은 예외 상황에서만 생긴다 |
| `force` | `type`, `keys[]`, `kind`(`EVICT`·`RELOAD`) | 추가된 `REV_SEQ` 범위. SYSADMIN 만 |

- 조립 재사용: 유효 도메인은 `DefaultMdmEffectiveDomainResolver`·`EffectiveDomainView`, 룰은 `RuleQueries.versions` + `StoredRuleDefinitions`·`RuleDefinitionAssembler`, 룰세트는 `StoredDefinitionLookup.releasedSets`(같은 클래스의 `ruleSet(setId, evalTs)` 와 같은 `toDefinition`·`RuleSetVersionQueries`), 코드는 `MdmCodeLookup.code` 와 같은 쿼리(`MasterCodeLedgerQueries`). `MdmCodeLookup`·`StoredDefinitionLookup` 을 빈으로 만들면 안 된다(D-077, ADR-0005 가드 테스트). 서비스 안에서 `new` 로 쓴다.
- 컬럼 메타 조립은 새 코드다. `DomainTestCaseRunner.definition` 의 규칙(유효 표준식은 `chainStdExpr`, 비즈니스식·필수 변수·코드 참조·타입·소수 자리는 `EffectiveDomainView`)을 따르고, 테이블 칼럼 `REQUIRED`·`DEFAULT_VALUE`·`REF_KIND/TARGET/CATE_ID`·표시명·설명을 더한다. 도메인 없는 컬럼(V16 이후 nullable)은 도메인 칸을 비운다.
- 인증: 기존 채널 그대로다. 호출자는 `X-Client-Key` + `X-Authenticated-User`(`system:{모듈}`) + `X-Authenticated-Role` 을 보낸다. `X-Authenticated-User` 가 없으면 JWT 흐름으로 빠져 401 이 나므로 클라이언트가 반드시 넣는다.

## 4. 캐시 대상과 메타 모양

### 4.1 대상과 키

| 대상 | 키 | 캐시 값 | 비고 |
|---|---|---|---|
| 컬럼 | `PHYS_NAME` | §4.2 | 엔진 `ColumnDefinition` 과 화면 메타를 이 값에서 만든다 |
| 도메인 | `DOMAIN_ID`(문자열) | §4.3 | 툴팁 도메인 정보 |
| 룰 | `MARU_RULE_ID` | RELEASED 버전 전체 | 평가 시각으로 그때그때 고른다. "현재 버전"을 캐시하지 않는다 — 적용 시작일 도래는 쓰기가 없어 기록이 남지 않기 때문이다. `ver` 는 major/minor 소수(D-144, `NUMERIC(7,3)`, JSON number `1.000`·`1.001`)이고 목록 정렬·여럿일 때 최대 고르기는 수 비교(`BigDecimal.compareTo`)다 |
| 룰세트 | `MARU_RULE_SET_ID` | RELEASED 버전 전체 | 룰과 같다(D-144 2단계부터 세트도 버전이 있다). 엔진 `RuleSetDefinition` 에 `ver`·`applyFrom`·`applyTo` 를 더했고, 업무 모듈은 판정 시각으로 그때그때 고른다(`APPLY_FROM <= t < APPLY_TO`, 여럿이면 VER 최대). `status` 는 버전마다 부모의 계산 상태(저장 CREATED → INUSE) |
| 마스터코드 | `MARU_CODE_ID` | `CodeRows` 원본의 RELEASED 투영 | 엔진 `CodeResolver` 가 기준일로 해석한다. 버전 적용 기간도 같은 이유로 원본째 둔다. 2026-10-03 D-152 부터 RELEASED 버전과 그 버전에서 유효한 행만 싣는다(룰·룰세트·전문과 같다). 단 TABLE 카테고리의 소속 행은 같은 카테고리의 남은 TABLE 정의 fromVer(취소 버전일 수 있다)에서 유효한 행도 싣는다(소급 경로가 읽는다) — 초안 사본 행이 캐시를 부풀리고, 초안 전용 카테고리 정의가 최초 소급으로 RELEASED 판정에 새던 결함을 막는다 |
| 전문 | `LAYOUT_ID`(MESSAGE) | RELEASED 버전 전체 + 버전별 합성 구간 | 룰과 같다(D-144 3단계, 2026-10-03 반영). MDM 이 전문 버전 구간을 쌓은 헤더의 RELEASED 버전 경계(적용 시작·끝)로 나눠 구간마다 미리 합성하므로 업무 모듈은 판정 시각 하나로 버전(`APPLY_FROM <= t < APPLY_TO`, 여럿이면 VER 최대)과 그 안의 구간을 고른다(`MdmDefinitionLookup.layout(id, t)`). 헤더 확정·확정 취소는 그 헤더를 쌓은 전문 키로 펼쳐 기록하므로 구간 경계가 바뀌면 무효화된다. 예약 버전의 적용 시작 도래는 목록에 이미 있어 기록이 필요 없다. 소비 연동(직렬화·파싱)은 범위 밖. **배포 순서**: 값 모양이 3단계 전(스냅샷 하나)과 호환되지 않으므로 MDM 과 cactus-core 는 같은 릴리스로 배포한다. 섞이는 동안에는 LAYOUT 키만 failed 이고 캐시 관리 화면(mdmCacheMng)에도 그렇게 보인다. 캐시는 메모리에만 있으므로 재시작하면 정리된다 |

### 4.2 컬럼 메타

```
physName, columnName(논리명), labelLong, labelMid, labelShort,
description, usageNote,
dataType, length, scale,                 ← 도메인에서
required, defaultValue,
refKind, refTarget, refCateId,
domain: { domainId, domainName, domainKind } | null,
stdExpr: { text, ast } | null,           ← 유효 표준식(chainStdExpr)
bizExpr: { text } | null,                ← 서버 전용. 화면 응답에는 존재 여부만 싣는다
bizRequiredVars[],
codeRef: { maruCodeId, cateId } | null,
matchedSystem, systemPhysName            ← 별칭으로 찾았을 때 시스템 코드·저장된 별칭 원문. 표준 매칭이면 null(2026-10-03)
```

- 엔진용 `ColumnDefinition` 은 이 값에서 변환한다(테이블 인자는 무시한다. 컬럼사전은 테이블과 무관한 표준 컬럼이다).
- 화면용 응답(§5.5)은 이 값에서 `bizExpr.text` 를 빼고 `bizRuleOnServer: true/false` 만 싣는다. 코드 참조가 있으면 `allowedCodes[{code, name}]` 를 클라이언트가 `CodeResolver.codeList(id, cate, now)` 로 풀어서 더한다.
- **예외(2026-10-02 사용자 결정)**: 캐시 관리 화면의 항목 상세 보기(§5.5 `entry`, SYSADMIN 만)는 항목 하나의 캐시 값 전체를 싣는다 — 컬럼은 `bizExpr.text` 까지, 룰은 정의 전체. 관리자가 캐시에 무엇이 들어 있는지 확인하려면 원문이 필요하기 때문이다. 목록(`entries`)과 화면 메타(`columns`)는 여전히 값·원문을 싣지 않는다.

### 4.3 도메인 메타

`domainId, domainName, stdName, domainKind, dataType, length, scale, unitCode, description, stdExpr{text, ast}, bizRuleOnServer, codeRef`

## 5. 업무 모듈 쪽 (cactus-core `com.dongkuk.dmes.cactus.mdm`)

### 5.1 켜는 조건과 설정

```yaml
cactus:
  mdm:
    enabled: true                 # 기본 false. 업무 모듈이 켠다. MDM 서버 자신은 켜지 않는다
    base-url: ${MDM_WAS_URL:http://localhost:8096}
    client-key: ${BACKEND_CLIENT_KEY:...}
    poll-interval: 10s
    max-entries: 20000            # 대상 합계 상한
    max-age: 24h                  # 적재 뒤 절대 상한 — 기록 누락 대비 안전망(조회가 많아도 이 시간 뒤에는 다시 받는다)
    max-idle: 60m                 # 마지막 조회 뒤 유휴 수명 — 조회될 때마다 연장
    connect-timeout: 2s
    read-timeout: 5s
```

- `@AutoConfiguration` + `@ConditionalOnProperty(prefix="cactus.mdm", name="enabled", havingValue="true")`. 기본이 꺼짐이라 mdm 서버(`MdmBusinessRuleMigrationTest` 의 `DefinitionLookup` 빈 0개 가드)에 영향이 없다.
- 설정 클래스는 `MdmClientProperties`(`@ConfigurationProperties("cactus.mdm")`). 선례는 `CaravanHubClientProperties`.
- cactus-core 에 `maru-mdm-engine` 의존을 `api` 로 더한다. 엔진은 순수 Java(EvalEx 하나)다. 각 모듈의 `settings.gradle` 이 엔진을 찾도록 하는 방법(중첩 includeBuild 전달 여부)은 구현 계획 첫 단계에서 실측해 정한다.
- 수명(A2, 2026-10-02 사용자 결정 — "히트가 많이 되는 캐시일수록 오래 남아 있어야"): 항목은 `now >= 마지막 조회 + max-idle` 또는 `now >= 적재 + max-age` 이면 만료다. 마지막 조회 시각은 적재 직후 적재 시각이고 업무 조회(`get` 히트)마다 옮긴다. 관리 화면 읽기(`entries`·`entry`)는 옮기지 않는다. `max-age` 는 처음(60m, 적재 뒤 수명)과 뜻이 바뀌어 절대 상한이 되었고 기본값을 24h 로 올렸다 — 폴링이 오래 끊겨 지움 기록을 놓친 경우의 안전망.
- 캐시는 Caffeine 을 쓰지 않고 자체 구현한다. cactus-core 의 Caffeine 은 `compileOnly` 이고, 업무 모듈에 Caffeine 이 들어가면 `MasterCodeCacheAutoConfiguration` 이 함께 켜져 `CacheManager`·`@EnableCaching` 이 모든 모듈에 생긴다.

### 5.2 구성 요소

| 클래스 | 역할 |
|---|---|
| `MdmMetaClient` | `RestClient` 로 `POST {base-url}/oasis/metaFeed/{action}` 호출. 인증 헤더 3종, 요청 UUID(`X-Tx-Id`) 부착. OASIS 응답 봉투를 풀어 DTO 로 돌려준다. 선례는 caravan-hub 클라이언트 |
| `MdmMetaCache` | 대상 종류별 `ConcurrentHashMap<String, Entry>`. Entry 는 값 또는 "없음", 적재 시각, 마지막 조회 시각, 조회 수, 추정 크기. 수명(§5.1 — 유휴 `max-idle`·절대 상한 `max-age`)이 지난 항목은 조회 때 버리고, 다시 조회되지 않는 항목도 남지 않게 폴링마다(`markApplied`, 약 10초) 쓸어 낸다(`remove(key, entry)` — 살아 있는 항목·지움 기록·세대는 그대로). 폴링이 실패해 쓸지 못하는 동안에도 상태의 항목 수·추정 크기(`sizes`·`bytes`)는 만료 항목을 세지 않는다(목록 `entries` 와 같은 기준). 합계가 `max-entries` 를 넘으면 한 번에 95% 까지 줄인다 — 만료 항목을 먼저 지우고, 그다음 오래 조회되지 않은 순(LRU, 마지막 조회 시각 스냅샷으로 정렬)으로 지운다. 추정 크기는 적재 때 값을 `MdmJson` 으로 직렬화한 UTF-8 바이트 수(잠금 밖에서 한 번 잰다, "없음" 0, 직렬화 실패 -1 — 합계에서 뺀다). JVM 실제 점유는 객체 머리·참조 때문에 이보다 크다 |
| `MdmMetaService` | 조회 입구. `columns(names)` 처럼 여러 키를 받아 캐시에 없는 키만 모아 MDM 에 한 번 요청하고, 응답에 없는 키는 "없음"으로 캐시한다. 같은 키 동시 적재는 한 번만 한다 |
| `MdmRevisionPoller` | `poll-interval` 마다 `changes(since=appliedSeq)`. 받은 키를 지우고, `RELOAD` 는 지운 뒤 바로 다시 적재한다. `appliedSeq`, 마지막 성공 시각, 연속 실패 수를 상태로 둔다 |
| `MdmDefinitionLookup` | 엔진 spi `DefinitionLookup`·`CodeLookup` 구현. `rule(id, evalTs)` 는 캐시된 RELEASED 버전 중 적용 기간이 `evalTs` 를 포함하는 것을 고른다(`RuleVersions.currentReleased` 와 같은 규칙) |
| `MdmMetaController` | `/api/{module}/mdmMeta/{action}` 엔드포인트(§5.5). 등록 방식은 `DmomReceiveController` 선례(클래스 레벨 `@RequestMapping` + `@ResponseBody`, 자동 설정에서 `@Bean`) |

### 5.3 리비전 규칙

1. **기동:** 첫 폴링에서 `latestSeq` 를 받아 `appliedSeq` 로 삼는다. 그 전까지 적재한 항목이 있으면 비운다. MDM 이 꺼져 있어 첫 폴링이 실패하면, 처음 성공할 때 같은 규칙을 적용한다.
2. **정상:** `items` 의 키를 지우고 `appliedSeq = 마지막 seq`.
3. **truncated:** 한 번에 다 받지 못했으면 캐시를 전부 비우고 `appliedSeq = latestSeq`.
4. **역행:** `latestSeq < appliedSeq`(MDM DB 초기화 등)면 캐시를 전부 비우고 `appliedSeq = latestSeq`.
5. **적재와 경합:** 항목은 적재 직전의 `appliedSeq` 를 기억한다. 적재 도중 들어온 변경은 다음 폴링이 지우므로 옛 값이 남지 않는다.

### 5.4 MDM 장애 시 동작

- 캐시에 있는 항목은 계속 쓴다. MDM 이 멈춰도 업무 처리는 멈추지 않는다.
- 캐시에 없는 키는 `MdmUnavailableException` 을 던진다. "없음"으로 캐시하지 않는다. 같은 오류가 반복되면 30초 동안 MDM 호출을 건너뛰고 바로 예외를 던진다.
- 화면 메타 조회 엔드포인트는 실패한 키를 `unavailable[]` 로 돌려준다. 화면(B)은 하드코딩 캡션으로 표시한다.
- BE 검증(C)이 캐시에 없는 정의를 만났을 때의 정책(저장 거부 / 경고 후 통과)은 C 에서 정한다.
- 폴링이 계속 실패해도 캐시를 비우지 않는다. 상태에 연속 실패 수와 마지막 성공 시각을 남겨 관리 화면이 "최신 아님"으로 보여 준다.

### 5.5 엔드포인트 `/api/{module}/mdmMeta/{action}`

포털 BFF 의 catch-all 프록시(`app/api/[module]/[...path]`)가 경로를 그대로 넘기므로 BE 경로가 `/api/{module}/...` 로 시작해야 한다. `{module}` 은 `cactus.oasis.service-group` 과 같아야 하며 다르면 404 다.

| action | 메서드 | 입력 | 출력 | 권한 |
|---|---|---|---|---|
| `columns` | POST | `names[]`(물리명 또는 camelCase, 서버가 정규화) | `items{요청이름: 화면용 컬럼 메타}`, `missing[]`, `unavailable[]` | 로그인 사용자 |
| `domains` | POST | `domainIds[]` | 도메인 메타 | 로그인 사용자 |
| `status` | GET | — | 모듈, 인스턴스 ID, `appliedSeq`, MDM `latestSeq`(마지막 폴링 값), 마지막 성공 시각, 연속 실패 수, 대상별 항목 수 `counts`(만료 항목 제외), 대상별 추정 크기 합계 `bytes`(counts 와 같은 모양·같은 항목)·전체 `totalBytes`, JVM 힙 `heap{usedBytes, maxBytes}`(`totalMemory-freeMemory`, `maxMemory`), `maxEntries`, `maxAgeSeconds`(절대 상한), `maxIdleSeconds`(유휴 수명) | SYSADMIN |
| `entries` | GET | `type`, `q`, `sort`, `page`, `size` | 항목 목록(키, 있음/없음 `absent`, 적재 시각 `loadedAt`, 마지막 조회 `lastAccessAt`, 조회 수, 남은 수명 `remainingSeconds` — 두 기한 중 이른 쪽까지, 추정 크기 `bytes`). `sort` 는 `key`(기본, 종류·키 순)·`bytes`(큰 순)·`hits`(많은 순) — 쪽을 자르기 전에 전체를 정렬하고 같은 값은 종류·키 순, 그 밖의 값은 400. 캐시 값은 싣지 않는다 | SYSADMIN |
| `entry` | GET | `type`, `key`(컬럼은 camelCase 도 정규화) | 항목 하나 `{type, key, absent, loadedAt, lastAccessAt, hits, remainingSeconds, loadSeq, bytes, value}` — `value` 는 캐시 값 전체(§4.2 예외, `MdmJson` 설정: 소수 자리수 유지·날짜 ISO). 캐시를 읽기만 한다(조회 수·마지막 조회 시각·적재·지움 상태 불변 — 수명을 연장하지 않는다, 캐시에 없거나 수명이 지났으면 MDM 에서 받지 않고 404, 본문 `code: MDM_ENTRY_NOT_CACHED` — 화면은 이 code 가 있는 404 만 "캐시에 없음"으로 본다). 잘못된 `type`·빈 `key` 400 | SYSADMIN |
| `load` | POST | `type`, `keys[]` | 이 인스턴스에 미리 적재한 결과 | SYSADMIN |

- 이름 정규화: 소문자가 섞인 이름은 camelCase 로 보고 `UPPER_SNAKE` 로 바꾼다(`codeNm` → `CODE_NM`). 이미 대문자면 그대로 쓴다.
- 권한 연결: `mdmCacheMng` OBJECT 를 mcm `DataInitializer` 에 시드하고 SYSADMIN 에 매핑한다. `columns`·`domains` 는 BFF `proxy.ts` 의 로그인 전용 경로에 추가한다. mcm BE 의 `EndpointPermissionFilter` 가 3-segment 경로를 permKey 로 검사하므로, 두 objId(`mdmMeta`, `mdmCacheMng`)가 어떻게 판정되는지 구현 계획에서 실측하고 맞춘다.

## 6. 캐시 관리 화면 (m-mcm `page-components/csa/mdmCacheMng`)

- 메뉴: 시스템관리 > MDM 캐시 관리. `DataInitializer` 에 OBJECT·메뉴(csa 대역 다음 번호 1020190 — dev 의 화면 사용 통계가 1020180)·SYSADMIN 매핑을 시드한다. 선례는 `commSyncMng`.
- 모듈 목록: 새 상수 `MDM_CACHE_MODULES = ["mcm","mls","mqc","mpp","mpn"]`. 응답하지 않는 모듈은 "연결 안 됨"으로 표시한다.
- 위쪽 그리드: 모듈별 상태(§5.5 `status`). MDM 최신 순번은 응답한 모듈들의 `latestSeq`(마지막 폴링 값) 가운데 최댓값으로 보여 주고, `appliedSeq` 가 그보다 뒤처진 모듈을 강조한다. 화면이 MDM 을 따로 호출하지 않는다. "캐시 추정 크기"(`totalBytes`)·"힙 사용/최대"(`heap`) 열을 둔다(A2, 2026-10-02 사용자 요구 "모듈 상태, 캐시 항목에서 얼마나 메모리를 많이 사용하는지도 보여주면 좋겠어").
- 아래쪽 그리드: 선택한 모듈의 항목(`entries`), 대상 종류 필터·키 검색·정렬(키·크기·조회 수 — `sort`). "마지막 조회"·"추정 크기"(우측 정렬) 열을 둔다.
- 크기 표기: `formatBytes` — 1024 단위 B/KB/MB/GB, KB 부터 소수 1자리, 음수(-1 잴 수 없음)·null 은 "-". 크기 값은 숫자로 두고 셀 표시만 바꾼다(열 정렬이 숫자 순). 라벨은 "추정 크기"이고 머리 툴팁에 "JSON 직렬화 크기 기준, 실제 힙 점유는 이보다 큼"을 적는다. shared `formatBytes`(libFormat)는 표기("Bytes"·소수 2자리)가 달라 화면 폴더 `utils.ts` 에 둔다.
- "남은 수명" 도움말(머리 툴팁·상세 요약 title): "마지막 조회 뒤 {max-idle}분 동안 조회 없으면 만료, 조회될 때마다 연장(적재 뒤 최대 {max-age}시간)".
- 옛 모듈(A2 전 cactus)이 크기·힙·유휴 수명을 주지 않으면 그 칸만 비운다.
- 항목 상세(2026-10-02 사용자 결정): 항목 행을 누르면 오른쪽 상세 패널에 요약(대상·키·상태·적재 시각·적재 순번·추정 크기·조회 수·마지막 조회·남은 수명)과 캐시 값 전체(`entry`, shared `JsonView` 트리)를 보인다. 404 는 "캐시에 없음(만료·삭제됨)"으로 보이고 로그인 화면으로 보내지 않는다. 삭제·재등록·등록·조회 뒤 열린 상세를 다시 받는다(강제 기록은 다음 확인 때 반영되므로 바로 다시 받은 값은 옛 값일 수 있다).
- 버튼:
  - **등록**: 대상 종류와 키를 입력해 선택한 모듈 인스턴스에 미리 적재(`load`).
  - **삭제**: 선택 항목을 MDM `force(kind=EVICT)` 로 기록. 모든 모듈·인스턴스가 다음 폴링에서 지운다.
  - **재등록**: MDM `force(kind=RELOAD)`. 모든 모듈·인스턴스가 지운 뒤 다시 적재한다.
  - 삭제·재등록은 확인 대화 상자를 거친다(Local-Rules 중요 액션 UX).
- 화면은 shared 컴포넌트만 쓴다(`mantine-aggrid-ui` 스킬, 커밋 전 audit 0건).

## 7. 테스트

| 층 | 무엇을 | 어떻게 |
|---|---|---|
| MDM 기록 | 대상별 펼침(도메인 하위·참조 컬럼, 코드 → 도메인 → 컬럼, 헤더 → 전문, 물리명 변경 전후) | `MetaRevisionRecorder` 단위 테스트(SQLite) |
| MDM 기록 지점 | 각 쓰기 action 이 기록을 남기고, 원장 롤백 때 기록도 사라지는지 | 기존 서비스 테스트에 단언 추가, 대표 action 은 BPMN 액션 테스트 |
| MDM metaFeed | action 별 응답 모양, `truncated`, 없는 키, force 권한 | `DmaBpmnActionTest` 선례의 OASIS HTTP 테스트 |
| cactus 캐시 | 적재·없음 캐시·상한(LRU — 최근 조회 항목이 남는다)·동시 적재 1회, 수명(히트가 연장·히트 없이 max-idle 뒤 만료·히트를 계속해도 max-age 뒤 만료·peek·entries 는 연장 안 함·남은 수명은 두 기한 중 이른 쪽), 추정 크기(없음 0·직렬화 실패 -1 합계 제외), 만료 항목 쓸기(`markApplied` 뒤 맵·합계에서 빠짐, 살아 있는 항목·지움 기록·세대 불변, 쓸기 전에도 `sizes`·`bytes` 는 만료 제외) | 단위 테스트(가짜 클라이언트, 가짜 시계) |
| cactus 폴러 | §5.3 규칙 다섯 가지, RELOAD, 장애 시 유지·건너뛰기 | 단위 테스트(가짜 클라이언트, 가짜 시계) |
| cactus 클라이언트 | 헤더 3종, OASIS 봉투 해석, 시간 초과 | `MockRestServiceServer` |
| cactus 자동 설정 | 기본 꺼짐, 켰을 때 빈 구성, `DefinitionLookup` 이 꺼진 상태에서 등록되지 않음, `max-idle`·`max-age` 바인딩과 기본값(60m·24h)이 캐시 빈에 닿음 | `ApplicationContextRunner` |
| cactus 엔드포인트 | status 의 `bytes`·`totalBytes`·`heap`·`maxIdleSeconds`(만료 항목은 counts·bytes 에서 빠짐), entries `sort`(bytes·hits·잘못된 값 400, 쪽 자르기 전 정렬), entry·entries 의 `bytes`·`lastAccessAt`(읽기만 해서 옮기지 않음) | MockMvc 단위 테스트 |
| 엔진 연동 | `MdmDefinitionLookup` 으로 `DomainValidator.validate` 가 도는지, 적용 기간 경계 | 단위 테스트 |
| 화면 | 캐시 관리 화면 API 매핑(크기·힙·마지막 조회·sort, 옛 모듈 응답), `formatBytes`·수명 도움말 | Vitest, audit 2종 0건 |
| 통합 | 로컬 mdm + mls 기동, MDM 에서 컬럼 표시명 변경 → 10초 안에 mls 캐시 반영, 화면에서 재등록 | 수동 E2E(ego-browser), 끝나면 브라우저 닫기 |

- 도커는 쓰지 않는다. DB 는 SQLite 만 쓴다.
- MES 모듈 OASIS 를 건드리면 `oasis-contract-check` 를 ERROR 0 으로 통과시킨다.

## 8. 함께 남길 기록

- **ADR**: "MDM 메타 하이브리드 배포와 리비전 무효화"를 `adr-write` 로 `docs/mdm/adr/0007-…` 에 발행한다(작성 때 0006 이었으나 dev 의 ADR-0006 `object-versioning-major-minor` 와 겹쳐 0007 로 바꿨다)(되돌리기 어려운 모듈 간 결정).
- **Flyway**: `flyway-migration-add` 로 V20 채번(dev 두 번째 병합 뒤 번호, V19 는 레이아웃 버전 3단계 예약). 운영 DDL(`application-wildfly.yml` 은 Flyway 꺼짐)은 운영 DB 확정 때 수동으로 맞춘다.
- **가이드**: `docs/guide/BackEnd` 에 "업무 모듈에서 MDM 메타 켜기"(설정 블록, 엔드포인트) 짧은 절을 추가한다.

## 9. 범위 밖과 미결

- 범위 밖: 캡션 적용·툴팁(B), 화면·BE 검증 실행과 실패 정책(C), 마스터데이터(`MasterLookup`) 캐시 — 룰의 `MASTER` 함수가 마루 데이터를 가리키면 필요하므로 C 에서 다룬다, 전문 소비 연동, 변경 기록 보관 정리 작업, 엔진 패키지 이름 변경(`kr.dongkuk.maru` → `com.dongkuk.maru`, 별도 작업).
- 미결(구현 계획에서 실측): 중첩 includeBuild 로 엔진이 업무 모듈 빌드에 전달되는지, mcm `EndpointPermissionFilter` 의 `mdmMeta`·`mdmCacheMng` 판정.
- 화면의 삭제·재등록은 MDM `force` 를 부르므로 포털 BFF 의 `/api/mdm/oasis/metaFeed/force` 경로와 MDM 쪽 SYSADMIN 확인이 필요하다. MDM 은 BFF 가 넘긴 `X-Authenticated-Role` 로 판정한다.
