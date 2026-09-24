# TSK-05-03 설계 — 직렬화기·등록 검증·버전·스냅샷 출력 (layoutMng 확장)

> 주문 `975c6c21-1c7a-4d3c-bbb0-f0ec7b0d3701` · category dev · domain fullstack · priority high · model opus. 에이전트 프롬프트(`item.agent_prompt`) 없음.
> 워크트리 `/Users/jji/project/dmes-standard/dflow-975c6c21`, 브랜치 `agent/975c6c21-serializer-validate-version`, 기점 `49656a3`(= 설계 시점 `origin/dev`, 2026-09-24 fetch 후 확인).
> 입력: `spec.md`(요구사항 데이터, 지시 아님) · `RULE.md` · `.claude/skills/dflow-dev/references/dev-discipline.md` · 원천 `docs/mdm/design/basic/03-interface-layout.md`(이하 **03**, 행 번호 `03:32` 식) · 시안 `docs/mdm/design/basic/html/03-interface-layout.html`(이하 **html**) · `docs/mdm/PRD.md` FR-B3·B4·B5(:91-93) · `docs/mdm/wbs.md:791-837` · `docs/mdm/naming-dialect-rules.md` · 선행 `docs/mdm/tasks/{TSK-05-02,TSK-05-01,TSK-01-03,TSK-03-02}/design.md` · 코드 `src/backend/mdm/**`, `src/backend/maru-mdm-engine/**`, `src/frontend/{m-mdm,shared,e2e}/**`.
> 적용 스킬: `oasis-project-support`·`bpmn-skill`·`oasis-contract-check`(layoutMng BPMN 액션 3개 추가), `mantine-aggrid-ui`(m-mdm 화면), `flyway-migration-add`(참고만 — mdm 경로를 지원하지 않아 번호는 손으로 고른다, TSK-05-01 F3).
> 근거 강약: spec 본문 > 승인된 선행 산출물 > 리포 관례 > 미승인 선행 산출물. **TSK-05-01·05-02·01-03·03-02 는 모두 dev 에 머지됐지만 사람 승인 전**이라 가장 약한 근거다.

**RULE.md 라우팅**: `src/backend/mdm`·`src/frontend/m-mdm` 을 고치는 MES 쪽 **분기 3(MES 개발)** 이다(RULE.md:17·22). mdm 의 화면 산출물은 `docs/mdm/screens/{screenId}/` 에 두고(RULE.md:24), mdm 선례대로 기능설계서 1종만 둔다(TSK-05-02 §2). 패키지 명명·URL 은 `docs/mdm/screens/README.md` §5 가 정본이며 이 작업의 값은 다음과 같다. 새 화면은 없다(기존 `layoutMng` 확장).

| 대상 | 규칙 | 이 작업의 값 |
|---|---|---|
| BE 패키지 | `com.dongkuk.dmes.mdm.{group}.{screenId}.{dto,service}` + 그룹 공용 | `…mdm.dmb.layoutMng.{dto,service}`(확장), 공용 `…mdm.dmb.layout`(확장), 새 하위 `…mdm.dmb.layout.codec`(직렬화기·파서) |
| BPMN | `services/{group}/{screenId}.bpmn` | `services/dmb/layoutMng.bpmn` 에 `validate`·`execute`·`export` 분기 추가 |
| URL | `POST /api/mdm/oasis/{serviceId}/{action}` | `/api/mdm/oasis/layoutMng/{search,view,save,validate,execute,export}` |
| FE 화면 | `m-mdm/pages/{group}/{screenId}/page.tsx` | `pages/dmb/layoutMng/page.tsx`(확장). tsup entry·page-registry·메뉴 시드는 **바꾸지 않는다**(이미 있다) |

---

## 0. 조사로 확인한 사실 (Build 는 원천 문서를 다시 읽지 않아도 된다)

### 0.1 원천(03·html·PRD)의 요구

| # | 사실 | 근거 |
|---|---|---|
| F1 | **등록 거부 7종(원문 순서 그대로)**: ① 본문 항목의 컬럼이 컬럼 사전에 없음 ② CONST 값이 도메인 유효 식 위반 ③ 전송 단위의 차원 불일치 ④ 숫자 표현 자리 부족 ⑤ FILLER 가 아닌 항목에 길이 직접 입력 ⑥ `trans_unit` 과 `unit_item` 동시 입력 ⑦ `unit_item` 이 같은 레이아웃의 항목을 가리키지 않음. html 등록 검증 표는 이 7행에 "M201 통과" 열과 메모를 둔다. 메모: #2 "헤더 재정의 `B1`, `IFL2MES201` 검사", #4 "`COIL_THK` 4자리 ≥ 도메인 3,1". 거부 예시 문구: **"표현 자리 2는 도메인 10 코일 두께(숫자 3,1)를 담지 못합니다."** | 03:38, html `p-check` 표(:465-476) |
| F2 | **암묵 소수점 예시**: "3.5 mm, 소수 1자리 → `0035`"(03:32). html 항목 상세 표현 예시: `3.5 mm → 0035 · 0.1 mm → 0001 · 12.4 mm → 0124`(M201 COIL_THK, 도메인 숫자 3,1, 표현 자리수 4, 왼쪽 0, 부호 없음). 날짜는 DATE 도메인이 문자 8 이라 변환 없이 쓴다(03:33) | 03:32-33, html :398 |
| F3 | **샘플 전문 렌더**(html `render()` :604-651): 숫자는 왼쪽 0, 문자는 오른쪽 공백, 공백은 `·` 로 보인다. 구역 색 4가지(L100 헤더 `#dbeafe`, L110 헤더 `#fef3c7`, 본문 DATA `#dcfce7`, FILLER `#e5e7eb`), 항목에 마우스를 올리면 이름·위치(`159-162`, 길이 1이면 `63`). 예시 입력 COIL_ID `C26A0012345`, PROD_DT `20260922`, COIL_THK `3.5`. html 값: TC코드 `M201`(AUTO LAYOUT_ID), 송신공장구분 `B1`(재정의), EAI인터페이스ID `IFL2MES201`, 전문송신시간 `20260922143015`, 전문순서 `00001`, 전문길이 `000187`, L110 순번 `0001`, 일자 `20260922`, 시각 `143015`, **L110 길이 `00087`("L2 헤더와 본문만 센다고 가정한 값", 미결)**. html 은 넘치는 값을 `slice` 로 자른다(시안 코드) | html :481-509, :600-651 |
| F4 | **버전 이력 표** 열: 버전·저장 일시·저장자·변경·총 길이·전환 방식. 예: v2 "여분 29 → 코일 두께 4 + 여분 25 (여분 쪼개 쓰기)" 187 **순차 전환**, v1 "최초 등록" 187 `-`. **변경 분류 표** 5행: 여분을 쪼개 항목 추가(불변·순차) / 항목 길이 변경·도메인 길이 변경 포함(변함·동시, 새 버전 양측 동시) / 항목 순서 변경(변함·동시) / 헤더 구성 변경·헤더 추가·제거(변함·동시, 그 헤더를 쓰는 전문 전체) / CONST 값 재정의(불변·순차) | html `p-ver` :519-543, 03:47 |
| F5 | **스냅샷 출력**: "배포 대상 스냅샷이며, 파생·계산값이 풀려 들어간다". 예시 JSON 의 본문 항목에 `"unit": "mm"`, `"type": "NUM"`, `num_format{sign,zero_pad,implied_scale}` 이 있다. 버튼 [JSON 내려받기]·[엑셀 내려받기]. AS-IS Export(엑셀 내보내기)는 레이아웃 스냅샷 출력으로 대체한다(03:106) | html :547-565, 03:106 |
| F6 | **영향도**: "도메인 좁히기와 컬럼 변경의 영향도 목록에 그 컬럼을 쓰는 레이아웃과 상대 시스템이 포함된다. 헤더를 바꾸면 그 헤더를 쌓은 전문 전체가 잡힌다." 예시 표 열: 컬럼·레이아웃·항목(`3 코일 두께 (158 / 4)`)·송신 → 수신(`L2 → MES`)·영향(`길이 변경` 새 버전, 양측 동시 전환). 안 쓰는 컬럼도 한 줄로 "(없음) … 레이아웃에서 쓰지 않는다" | html :568-578, 03:48 |
| F7 | **수신 처리**: 파싱(레이아웃 스냅샷) → 단위 역변환 → 저장. **받는 쪽은 도메인 유효 식도 제약도 검사하지 않는다.** `validateMessage` 진입점을 두지 않는다 | 03:42 |
| F8 | **단위**: 저장·검증·인터페이스는 도메인 기준 단위 하나. 전송 단위(`trans_unit`)는 같은 차원만, 계수는 TB_MDM_UNIT. 송신은 기준 → 전송, 수신은 전송 → 기준. `unit_item` 은 같은 전문의 단위 항목(`COIL_WGT_UNIT` 등, SAP `QUAN`↔`MEINS`)에서 단위를 읽어 수신 시 기준 단위로 환산한다 | 03:29-31, html :443-452 |
| F9 | **버전**: 레이아웃도 배포 대상이다(도메인·컬럼 사전 서브셋·**단위 마스터**에 추가 — 단위 계수는 스냅샷과 별도 배포 대상). "송신·수신 양쪽이 같은 스냅샷 버전으로 직렬화·파싱한다." 상태·승인·소유자는 두지 않고 저장하면 바로 배포(03:72) — **배포는 이번 범위 밖**(PRD §2 규칙 7, wbs note) | 03:46, 03:72, PRD:93 |
| F10 | AUTO 는 EvalEx 함수가 아니라 직렬화기가 채우는 열거형(SEND_TIME·MSG_LENGTH·SEQ·LAYOUT_ID). "AUTO(MSG_LENGTH)가 이 계산값(전문 총 길이)을 쓴다"(03:37) | 03:21, 03:25, 03:37 |

### 0.2 선행 코드(05-01·05-02)의 실제 모양

| # | 사실 | 근거 |
|---|---|---|
| F11 | **레이아웃 버전 이력·스냅샷 저장 테이블은 없다.** `TB_MDM_LAYOUT.` `` `VERSION` `` `BIGINT NOT NULL DEFAULT 0`(엔티티 `MdmLayout.layoutVersion`, `@Version` 아님, 감사 `VER` 과 별개)만 있고 이 값을 올리는 운영 코드는 0건이다(05-02 I17 "05-03 몫"). 다른 대상의 버전 표(`TB_MDM_RULE_VER`·`TB_MDM_CODE_VER`)는 상태 기계(DRAFT→…)용이라 레이아웃(상태 없음, 03:72)과 모양이 다르다. `VersionTarget` enum 에 LAYOUT 은 없다 → 새 테이블이 필요하다(D2) | `entity/MdmLayout.java:56`, `sqlite/V4__…:18`, `sqlite/V8__…:62`, `contract/version/VersionTarget.java` |
| F12 | **계약 `contract.layout`**(`LIB = src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`): `MdmLayoutSnapshot(long layoutId, String layoutName, String eaiCode, String sndSystem, String rcvSystem, String encoding, String padRule, long layoutVersion, int totalLength, List<MdmLayoutHeaderRef> headers, List<MdmLayoutItemSnapshot> items)`, `MdmLayoutHeaderRef(int seq, long headerLayoutId, String headerLayoutName, int offset /*메시지 절대*/, int totalLength, List<MdmLayoutItemSnapshot> items /*offset 은 헤더 안 상대*/)`, `MdmLayoutItemSnapshot(int seq, MdmFillKind fillKind, MdmLayoutItemType dataType, String columnPhys, String transUnit, String unitItem, MdmLayoutNumFormat numFormat, String defaultValue, String overrideValue, Integer fillerLength, int offset, int length)`, `MdmLayoutNumFormat(boolean sign, boolean zeroPad, int impliedScale)`(width 없음 — `length` 가 싣는다), `MdmLayoutItemType {CHAR, NUM}`, `MdmLayoutSerializer.serialize(MdmLayoutSnapshot, Map<String,Object> record, MdmLayoutSerializeContext): byte[]`, `MdmLayoutParser.parse(MdmLayoutSnapshot, byte[]): Map<String,Object>`, `MdmLayoutSerializeContext(LocalDateTime sendTime, long seq)`. **구현체는 0개**(테스트 스텁뿐). **항목 스냅샷에 도메인 기준 단위·소수 자리가 없다** — 전송 단위 환산(기준 단위 필요)과 소수점 문자 형식(소수 자리 필요)을 스냅샷만으로 할 수 없다(D3) | `LIB/contract/layout/*.java` |
| F13 | 스냅샷 JSON 스키마 `lib/src/main/resources/com/dongkuk/dmes/mdm/contract/layout/layout-snapshot.schema.json`(draft 2020-12): 모든 객체 `additionalProperties:false`, `MdmLayoutItemSnapshot` 은 12키 모두 required(null 허용 칸도 키는 있어야 한다). 샘플 `lib/src/test/resources/com/dongkuk/dmes/mdm/contract/layout/m201-snapshot-sample.json`. `LayoutSnapshotSchemaStructureTest` 가 **스키마·샘플·record 세 곳의 키 집합이 같은지** 단언한다. record 를 생성하는 코드는 `lib/src/test/.../contract/stub/ContractStubCompileTest.java:234-250` 한 곳뿐이다 | 파일 직접 확인 |
| F14 | **05-02 공용 `dmb.layout`**(재사용 대상): `LayoutOffsetCalculator.{itemLength, placeHeader, placeMessage}`, `LayoutItemRules.check(List<LayoutItemDraft>, Map<String,LayoutColumnInfo>)` → L01~L08, `LayoutIssueCode` enum L01~L11(문구 필드 없음, 문구는 호출처가 만든다), `LayoutIssue(code, seq, field, message)` + `summary()` = `"L01[3] 문구"`, `LayoutRejections.{reject(prefix, issues), notFound}`(`HEADER_PREFIX="헤더 저장 거부: "`, `MESSAGE_PREFIX="전문 저장 거부: "`, `DETAIL_CODE="LAYOUT_SAVE_REJECTED"`, cactus `ErrorCode.BUSINESS_ERROR`), `LayoutNumFormat(sign, zeroPad, impliedScale, width)` + `toContract()`, `LayoutNumFormatCodec`(`^SIGN=([YN]);ZERO=([YN]);SCALE=(\d);WIDTH=([1-9]\d?)$`), `LayoutFillKinds.{cell, parse, AUTO_KINDS, Field{COLUMN("COLUMN_PHYS"), DEFAULT_VALUE, FILLER_LENGTH, TRANS_UNIT, UNIT_ITEM, NUM_FORMAT}}`, `LayoutDictionary.byPhysNames(Collection<String>)` → `Map<String, LayoutColumnInfo(physName, columnName, labelLong, displayName, domainId, domainName, dataType, length, scale, unitCode)>`, `LayoutQueries`(JPQL 은 메서드 안, 네이티브 상수 `COLUMN_SEARCH_SQL`·`COLUMNS_BY_PHYS_SQL`·`SYSTEMS_SQL`·`UNITS_SQL`·`ALL_NATIVE_SQL` — `UNITS_SQL` 은 FACTOR 를 읽지 않는다), `LayoutWriter.{saveLayout, replaceItems, replaceStack, recalculateUsers}`, `LayoutRows.{lengths, entities, drafts, items, units, …}`, `LayoutItemDraft.fromRow(Map, int seq)`(요청의 OFFSET·LENGTH·SEQ 를 읽지 않는다), `LayoutConstResolver.effective(kind, headerDefault, override)` | `LIB/dmb/layout/*.java` |
| F15 | **05-02 거부 코드와 7종의 겹침**: #1 = **L01**, #5 = **L02**(field `FILLER_LENGTH`, FILLER 가 아닌 항목 — F10 행렬의 CLOSED 칸), #6 = **L05**. #2·#3·#4·#7 은 검사하지 않는다(`LayoutIssueCode` javadoc "05-03 몫(유효 식·차원·자리 용량·unit_item 대상)은 여기 없다(D7)"). L02 는 다른 닫힌 칸(DEFAULT_VALUE·UNIT 등)에도 쓰이므로 **#5 는 L02 중 field=FILLER_LENGTH 인 것만** 센다 | `LayoutIssueCode.java:4-28`, `LayoutItemRules.java:48` |
| F16 | **`LayoutMngService`**(`LIB/dmb/layoutMng/service/LayoutMngService.java`, 빈 `layoutMngService`): `search(LayoutMngSearchRequest)`:81(target `COLUMN`·`HEADER`·기본 LAYOUT), `view(LayoutMngViewRequest)`:164(`layout`·`headers`·`items`·`units`), `save(LayoutMngSaveRequest, List<Map> headers, List<Map> consts, List<Map> items)`:235 — ① 대상·`ver` 대조(감사 VER, `ROW_VERSION_CONFLICT`) ② L11 ③ 헤더 구성(EAI 표준 헤더 0번 끼움 :269, L09) ④ 재정의 L10 ⑤ 본문 L01~L08(이슈가 있으면 쓰기 전 거부 :315) ⑥ `placeMessage` ⑦ `saveLayout` ⑧ `replaceStack` ⑨ `replaceItems` ⑩ 응답 `{layoutId, ver, totalLength, headerLength}`. **`setLayoutVersion` 호출 0건**. `HeaderMngService.save(HeaderMngSaveRequest, List<Map> items)`:158 는 ⑩ 에서 `writer.recalculateUsers(headerId)`(:251)로 사용 전문의 오프셋·총 길이를 `saveAndFlush` 한다(응답 `recalculated[{LAYOUT_ID, LAYOUT_NAME, TOTAL_LENGTH_BEFORE, TOTAL_LENGTH_AFTER}]`) | 파일 직접 확인 |
| F17 | **05-02 테스트가 VERSION 0 을 단언하는 곳 3개**(이 작업이 기대값을 바꾼다 — D4): `api/src/test/java/com/dongkuk/dmes/mdm/dmb/headerMng/HeaderMngServiceSqliteTest.java:178`(`헤더_길이가_바뀌면_…다시_계산한다` 안, "업무 버전은 05-03 몫(I17)"), `…/dmb/layoutMng/LayoutMngServiceSqliteTest.java:292-297`(`저장은_전문_버전을_올리지_않는다`), 같은 파일 `:337`(`search_는_헤더_요약과_총_길이를_돌려준다` 안 `LAYOUT_VERSION` 0) | 파일 직접 확인 |
| F18 | **감사 VER**: `CactusAuditListener.onPreUpdate` 가 UPDATE 마다 `VER` 을 조건 없이 +1 한다. 그래서 업무 버전을 올리려고 `TB_MDM_LAYOUT` 을 한 번 더 저장하면 **감사 VER 도 한 번 더 오른다** — save 응답의 `ver` 는 마지막 저장 뒤 값이어야 한다(I16). 감사 필드: `createdBy`(String), `createdAt`(**Instant**), `getVersion()`(Long). `createdBy` 는 요청 문맥(`AuditHolder`)이 있을 때만 찬다 — 서비스 직접 호출 테스트에서는 null | `cactus-core/.../audit/CactusAuditEntity.java:28-64`, TSK-05-01 F25 |
| F19 | **OASIS·BFF 규칙(05-02 F11·F12 그대로)**: 서비스에 `@Transactional` 금지(`LayoutStaticGuardTest` 가 `dmb..` 전체에 ArchUnit 으로 건다), 트랜잭션은 action 한 건. 추가 파라미터 `List<Map<String,Object>>` 는 **파라미터 이름 = grid id**. 화면은 grid 를 빈 배열이라도 보낸다. 서비스 예외는 HTTP 200 + `meta.success=false` + `meta.message` 원문. 액션 이름은 `MdmActions` 13종 안에서만. **권한 행 실측**: `PERM_MDM_READ = search,view,export,compare`, `PERM_MDM_EDIT = …,save,delete,reg,import,validate,execute,copy,restore` (`src/frontend/e2e/fixtures/mdm-rbac-seed-check.expected.txt:12-13`). dmb 는 표준 관리자 EDIT, 담당자 READ. layoutMng OBJECT·메뉴·역할 매핑은 05-02 가 이미 시드했다 → **`validate`·`execute`·`export` 는 새 시드 없이 BFF 를 통과한다**(export 는 담당자도 가능) | `MdmPermissions.java`, `DataInitializer.java:1009-1032` |
| F20 | **값 하나를 도메인 유효 식으로 판정하는 기존 유틸**: `dma/domainMng/service/DomainTestCaseRunner`(`@Component`, 생성자 `(MdmEvaluator, MdmCodeLookupAvailability, Clock)`). `Map<String,Object> preview(EffectiveDomainView view, String column, String value, Map<String,Object> vars)` → `{std:{RESULT: true|false|UNDECIDED|ERROR, MESSAGE}, biz:{…}, valid, step}`. 표준식이 없으면(`chainStdExpr==null` 이고 CODE 가 아님) `std=null` — **타입 변환 검사도 하지 않는다**. `undecided(view)`: 서버 `CodeLookup` 빈이 없으므로(`MdmCodeLookupAvailability.available()==false`) CODE 종류이거나 AST 에 MASTER 가 있으면 늘 `UNDECIDED`. 엔진 `kr.dongkuk.maru.mdm.engine.domain.ValueConverter.convert(String, DataType)` 가 타입 변환을 하고 실패하면 `ValueConversionException`. 엔진은 길이·소수 자리 검사를 하지 않는다(`ValueConverter` 주석). `EffectiveDomainView` 는 `DomainTreeReader.load()` → `DomainTreeSnapshot.chainRootFirst(domainId)` → `DomainChainAssembler.assemble(chain)` 으로 얻는다(05-02 `LayoutDictionary` 가 같은 경로를 쓴다) | `DomainTestCaseRunner.java:40-240`, `DomainChainAssembler.java:30-67` |
| F21 | **표준식 판정은 `STD_RULE` 텍스트만으로 된다**: `DomainChainAssembler` 가 `chainStdExpr = EffectiveExpressions.text(stdRule 목록)` 을 만들고 `DomainTestCaseRunner.judge` 가 그 텍스트를 평가한다. `STD_AST` 는 MASTER 포함 여부(판정 불가) 판단에만 쓰인다 → SQLite 테스트는 `INSERT INTO TB_MDM_DOMAIN (…, STD_RULE) VALUES (…, 'value <= 1')` 처럼 넣으면 된다(선례 `MdmTermDomainColumnMigrationTest.java:421`, 식 예 `value >= 0`·`value <= 30`). **CODE 도메인은 늘 판정 불가**이므로 #2 거부 테스트는 CODE 가 아닌 도메인으로 만든다 | `DomainChainAssembler.java:44-66` |
| F22 | **단위**: `TB_MDM_UNIT(UNIT_CODE VARCHAR(20) PK, DIMENSION VARCHAR(50), BASE_UNIT VARCHAR(20), FACTOR NUMERIC(18,9)/DECIMAL(18,9), CHG_SEQ)`(V3). 엔티티 `LIB/entity/MdmUnit(unitCode, dimension, baseUnit, BigDecimal factor, chgSeq)`, `MdmUnitRepository`(`findByDimension`). **마이그레이션 시드 행은 없다**(mm·μm·inch 모두 없음). 환산 선례는 `dma/unitMng/service/UnitMngService.convertPreview`(:187-217): `value × from.factor ÷ to.factor`, 나눗셈 `MathContext(34, HALF_UP)`, 차원이 다르면 거부. 단위 코드 규칙 `^[A-Za-z0-9_]{1,20}$` 라 **`μm` 은 등록할 수 없다** — 테스트는 `UM`·`INCH`·`TON`·`KG` 를 쓴다. `LayoutTestSupport.dictionary()` 는 `('mm','LENGTH','mm',1,0)` 만 넣고, 도우미 `domain(std, kind, type, length, scale, parent)` 에 **단위 인자가 없다**(COIL_THK 도메인도 단위 없음) → 단위가 있는 도메인은 새 테스트가 `jdbc` 로 직접 넣는다 | V3 DDL, `UnitMngService.java:187-217`, `LayoutTestSupport.java:55-83` |
| F23 | **영향도 SPI**: `contract/dictionary/MdmDomainReferenceSpi.referencesTo(Set<Long> domainIds, Set<String> columnPhysNames): List<MdmDomainReference(String refKind, String refKey)>` — 운영 구현 0개. `DefaultMdmDomainImpactLookup.impact(Long)` 이 `ObjectProvider<MdmDomainReferenceSpi>.orderedStream()` 으로 모두 모으고, `DomainMngService.impactTable`(:444-497)이 refKind `LAYOUT_ITEM` 을 `layoutItems[{REF_KEY}]` 로 나눠 domainMng 영향도 패널(`DomainImpactPanel.tsx` "레이아웃" 행, DETAIL = REF_KEY 를 `, ` 로 이음)에 보인다. 실제 SPI 빈을 더해도 `DomainImpactSpiAggregationTest`(집합 비교)·`DomainImpactQueriesSqliteTest:99`(레이아웃 행이 없는 DB) 는 깨지지 않는다. 도메인 하위 트리의 컬럼은 `common/dictionary/DomainImpactQueries.subtree(domainId)` → `SubtreeRow(domainId, depth, columnId, columnName, physName)` 로 얻는다. columnMng 에는 영향도가 없다 | `DefaultMdmDomainImpactLookup.java:31-50`, `DomainMngService.java:444-510` |
| F24 | **엑셀**: 백엔드에 POI 없음. shared `src/frontend/shared/src/utils/libExcel.ts:20` `exportToExcel(data: Record<string,unknown>[], fileName, sheetName, columns?: {key, header, width?}[]): Promise<void>` — `await import("xlsx")` 후 `XLSX.writeFile`. 진입 `@dk-oasis/shared/utils`. **사용처 0건**. xlsx 는 shared devDependency(tsup external)·m-mcm dependency 이고 m-mdm 에는 없다. m-mdm tsup 은 `/^@dk-oasis\/shared\/.*/` 를 external 로 둔다(`m-mdm/tsup.config.ts:3-12`) → 호스트(m-mcm) 런타임에서 해석된다. JSON 파일 내려받기 유틸은 리포에 없다(선례 `m-design-dummy/src/screens/MasterDataScreen.tsx:249-257` 의 Blob + `a[download]`) | Explore 조사 |
| F25 | **FE 현황**(`FM = src/frontend/m-mdm`): `pages/dmb/layoutMng/page.tsx`(312줄, 탭 없음, 오른쪽 `ContentPanel` 에 기본 속성·헤더 구성·본문 항목·항목 상세), `api.ts`(`callAction(action, params, grids)`, `unwrap`, `cleanParams`, `searchLayouts`·`searchHeaders`·`searchColumns`·`viewLayout`·`saveLayout(draft, headers, consts, items)`), `types.ts`(`ViewResult`·`SaveResult`·`LayoutDraft`·`ConstRow` …), components 6개(`LayoutList`·`LayoutBasicForm`·`HeaderStackGrid`·`BodyItemGrid`·`HeaderPickModal`·`ConstEditModal`). 공용 `FM/src/layout/{types,layout-calc,fill-kind,num-format,const-resolve,item-rows,styles}.ts`, `ColumnPickModal.tsx`, `LayoutItemDetail.tsx`. shared 탭 `@dk-oasis/shared/tabs`(`Tabs{items: {key,label,disabled?}[], activeKey, onChange}`, 탭 목록만 그리고 패널은 호출자가 전환) — m-mdm 사용 선례 없음. vitest 는 `tests/**/*.test.ts` 만(`.tsx` 제외), 렌더 테스트는 첫 줄 `/** @vitest-environment happy-dom */` | Explore 조사 |
| F26 | **E2E 현황**: `src/frontend/e2e/mdm-layoutMng.spec.ts`(263줄) — `test("L1 메뉴로 이동하고 …")`, `test("L2~L8 M201 등록·상수 재정의·동시 수정·드래그")` 두 블록, `describe.configure({mode:"serial"})`, viewport 1680×1200, `setTimeout(180_000)`, `beforeAll(loadFixture)`(`SMOKE_MDM_DB` 에 `fixtures/mdm-layout-m201.sql` 을 sqlite3 로 적재), 도우미 `login`·`openScreen`·`search`·`listRow`·`selectLayout`·`pickColumn`·`bodyCells`·`bodyRow`·`openConst`·`closeDialog`·`stripNulls`·`itemRequestRow`·`findLayoutId`, 상수 `STAMP`·`NEW_LAYOUT`·`FIXTURE_LAYOUT="출측검사 실적 수신(E2E)"`, `screenshot(name)` 은 `docs/mdm/tasks/TSK-05-02/screens` 를 가리킨다. 픽스처: EAI `E2EGLUE`(EUC-KR), 헤더 `GLUE 공통 헤더(E2E)`(100)·`L2 구간 헤더(E2E)`(30), 전문 `출측검사 실적 수신(E2E)`(L2→MES, 187, **VERSION 0, 버전 이력 없음**), 본문 COIL_ID(130,20)·PROD_DT(150,8)·**EXIT_COIL_THK**(158,4, 도메인 `COIL_THK` 숫자 3,1 **단위 없음**, `SIGN=N;ZERO=Y;SCALE=1;WIDTH=4`)·FILLER(162,25). 헤더 항목 도메인은 `E2E_STR_*`·`E2E_NUM_*`(표준식 없음). L6 은 새 전문을 화면으로 저장하고, L7 은 API 로 이름을 바꿔 저장한다 — **이 작업 뒤에는 두 저장 모두 버전을 만들지만 L1~L8 의 단언에는 영향이 없다** | 파일 직접 확인 |
| F27 | **이 기점의 mdm E2E 스펙 8개**와 스크린샷 경로: `mdm-columnMng`(TSK-04-04/screens, 컬럼 사전이 비어 있어야 E1 통과 — m201 픽스처보다 먼저 돌아야 한다), `mdm-domainMng`(TSK-04-03), `mdm-headerMng`·`mdm-layoutMng`(TSK-05-02, beforeAll 픽스처), `mdm-sample-smoke`(TSK-01-02/screens/dma-mdmSample.png), `mdm-shell-rbac-smoke`(TSK-01-03), `mdm-termMng`·`mdm-unitMng`(**TSK-04-02**/screens). `playwright.config.ts`(src/frontend): `testDir ./e2e`, `fullyParallel: true`, timeout 30s — `--workers=1` 이면 파일 이름순으로 돈다 | `grep docs/mdm/tasks src/frontend/e2e/mdm-*.spec.ts` |

### 0.3 마이그레이션·빌드

| # | 사실 | 근거 |
|---|---|---|
| F28 | **Flyway 번호**: `/usr/bin/git fetch origin` 뒤 `/usr/bin/git ls-tree --name-only origin/dev src/backend/mdm/api/src/main/resources/db/migration/mdm/{sqlite,mssql}/` → 두 방언 모두 V1·V2·V3·V4·V8·V9·V10·V11(최대 **V11**). V5~V7 은 비어 있지만 **TSK-06-01 design.md:650 인계 "번호는 origin/dev 머지 뒤 두 방언 폴더의 최대 버전+1 — V9 보다 작은 빈 번호(V5~V7)를 쓰지 않는다"**(작은 번호가 뒤늦게 오면 `FlywayValidateException`, B3-1 실측). 형제 워크트리 5개(`dflow-16de6362`·`68d4a55b`·`7d8179b0`·`f65cffff`·`f93163b8`)의 커밋·디스크 모두 V11 이하 → **이 작업은 `V12`** 를 쓴다(sqlite·mssql 같은 번호 짝). Phase 06 push 직전에 다시 확인한다(dev-discipline 「마이그레이션 버전」) | 2026-09-24 실행 결과 |
| F29 | **V12 를 더하면 고쳐야 하는 버전 단언**: 게이트에서 도는 `api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java:64,79`(`Set.of("1","2","3","4","8","9","10","11")` 완전 일치). 도커 전용(게이트 밖) `api/src/mssqlTest/java/com/dongkuk/dmes/mdm/{MdmMssqlMigrationTest.java:69,76-77,86(migrationsExecuted 8→9, targetSchemaVersion "11"→"12"), MdmInterfaceLayoutMssqlMigrationTest.java:69,80, MdmMasterDataMssqlMigrationTest.java:65,74, MdmTermDomainColumnMssqlMigrationTest.java(같은 집합)}`. `MdmFlywayVersionParityTest` 는 두 방언 폴더 집합이 같기만 하면 되므로 짝을 맞추면 그대로 통과한다 | grep 결과 |
| F30 | `testAll` 은 mssql 소스셋을 **컴파일하지도 돌리지도 않는다**(`mdm/api/build.gradle:29-50` "docker 필요, testAll 비포함"). mssqlTest 소스를 고치면 도커 없이 `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:compileMssqlTestJava --no-daemon --console=plain` 로 컴파일만 확인한다(05-02 선례) | build.gradle |
| F31 | JSON 칼럼 규칙: SQLite `TEXT` + `CHECK (json_valid(COL))`, MSSQL `NVARCHAR(MAX)` + `CHECK (ISJSON(COL) = 1)`, 애플리케이션이 **정규화 직렬화(키 정렬, 공백 없음, UTF-8)** 해 저장(naming-dialect-rules §3 #3·#6). 한글이 들어가는 칼럼은 MSSQL `NVARCHAR`, 코드 칼럼은 `VARCHAR(n) COLLATE Latin1_General_100_BIN2`(#18·#19). 감사 9칼럼 `C_USR_ID … VER BIGINT`(§2). 예약어 칼럼은 새로 만들지 않는다(§1 — `VERSION` 대신 `LAYOUT_VERSION`). 기존 `DomainJson` 은 키를 정렬하지 않는다 → 스냅샷용 정규화 매퍼를 따로 둔다 | `naming-dialect-rules.md` §1~§3 |
| F32 | ArchUnit 선례: `lib/src/test/java/com/dongkuk/dmes/mdm/dmb/layout/LayoutStaticGuardTest.java`(`dmb..` 의 `@Transactional`·`TransactionTemplate`·`DataSource.getConnection` 금지, 네이티브 SQL 예약어 금지, 위반 샘플로 공허 통과 방지). 화면 그룹 간 패키지 의존 금지 규칙은 없다 → `dmb.layout` 이 `dma.domainMng.service.DomainTestCaseRunner` 를 주입받아도 기존 규칙은 깨지지 않는다 | 파일 직접 확인 |

---

## 1. 접근 방식

**직렬화기·파서는 "스냅샷만 보는 순수 코드", 서버 서비스는 "스냅샷을 만들고 저장하는 쪽"으로 나눈다.** 새 하위 패키지 `dmb.layout.codec` 에 계약 `MdmLayoutSerializer`·`MdmLayoutParser` 의 구현을 두고, 이 패키지는 `java.*` 와 `contract.layout` 만 의존하게 ArchUnit 으로 묶는다(I11). 그러면 직렬화·파싱이 라이브 레이아웃 행을 읽을 길이 구조적으로 없고, 수용 기준 2(같은 스냅샷 버전)는 "버전 1 스냅샷을 저장소에서 꺼내 레이아웃을 바꾼 뒤에도 그 스냅샷으로 직렬화·파싱이 일치한다"는 통합 테스트로 증명된다. 바이트 길이·패딩·오프셋은 전부 스냅샷의 `encoding`(EUC-KR 한글 2바이트, UTF-8 3바이트)으로 센 **바이트 단위**이며 문자 수를 쓰지 않는다. 단위 환산 계수만은 03:46 이 단위 마스터를 별도 배포 대상으로 두므로 스냅샷 밖(`TB_MDM_UNIT`)에서 생성자로 받는다(한계로 적는다, D9).

**저장하면 그 자리에서 스냅샷 버전을 만든다.** 새 테이블 `TB_MDM_LAYOUT_VER`(V12)에 버전마다 정규화한 스냅샷 JSON·총 길이·전환 방식·변경 요약을 쌓고, `TB_MDM_LAYOUT.VERSION` 을 최신 버전 번호로 맞춘다(D2). 전환 방식은 이전 버전 스냅샷과 새 스냅샷을 비교하는 순수 함수 `LayoutChangeClassifier` 가 html 변경 분류 표대로 정한다 — FILLER 를 쪼개 항목을 넣으면 총 길이·기존 오프셋이 그대로라 **순차 전환**이다(수용 기준 6). 헤더를 저장하면 05-02 가 이미 다시 계산하는 사용 전문마다 같은 절차로 버전을 만든다(D4). 배포는 만들지 않는다.

**등록 검증 7종은 05-02 의 검사 위에 코드 4개(L12~L15)만 더한다.** #1·#5·#6 은 05-02 의 L01·L02(FILLER_LENGTH)·L05 를 그대로 쓰고, #2(CONST 유효 식)·#3(차원)·#4(자리 용량)·#7(unit_item 대상)을 새 순수 검사 `LayoutRegistrationRules` 로 만든다(D7). #2 는 도메인 화면의 판정기 `DomainTestCaseRunner` 와 엔진 `ValueConverter` 를 그대로 불러 도메인 화면과 같은 판정을 쓴다(D6). 같은 검사가 저장 경로(거부)와 새 액션 `validate`(7행 표, 쓰기 없음)에 함께 걸리고, 샘플 전문 렌더는 새 액션 `execute` 가 초안으로 스냅샷을 조립해 서버 직렬화기로 한 줄을 만든다 — EUC-KR 바이트는 브라우저 `TextEncoder` 로 셀 수 없으므로 서버가 기준이다(D13). 스냅샷 JSON 은 `export`(담당자도 가능), 엑셀은 그 JSON 을 화면이 shared `exportToExcel` 로 만든다. 영향 전문 목록은 layoutMng `search target=IMPACT` 와 `MdmDomainReferenceSpi(LAYOUT_ITEM)` 실구현을 같은 조회로 둔다(D12).

**화면은 05-02 의 편집 화면을 그대로 두고 오른쪽 패널 위에 탭 3개를 얹는다**: `편집`(기존 내용, 기본 탭 — 기존 testid·E2E L1~L8 불변) · `등록 검증·샘플 전문` · `버전·영향도`(html 3·4번 탭에 대응). 기존 action·testid·테스트는 깨지 않고 추가만 하며, 05-02 가 "05-03 몫"이라 적어 둔 VERSION 0 단언 3개만 새 규칙으로 바꾼다(D4).

---

## 2. 변경 파일 목록

경로 약어: `BL = src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`, `BLT = src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm`, `BLR = src/backend/mdm/lib/src/main/resources/com/dongkuk/dmes/mdm`, `BLTR = src/backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm`, `BA = src/backend/mdm/api/src/main/resources`, `BAT = src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm`, `BAM = src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm`, `FM = src/frontend/m-mdm`, `FE = src/frontend/e2e`.

### 생성 — 마이그레이션·엔티티

| 파일 | 내용 |
|---|---|
| `BA/db/migration/mdm/sqlite/V12__create_mdm_layout_version.sql` | `TB_MDM_LAYOUT_VER`(§6.5 DDL). SQLite 문법, JSON `TEXT CHECK (json_valid(SNAPSHOT_JSON))` |
| `BA/db/migration/mdm/mssql/V12__create_mdm_layout_version.sql` | 같은 테이블 MSSQL 문법(`NVARCHAR(MAX)` + `ISJSON`, 코드 칼럼 BIN2, `DATETIME2`) |
| `BL/entity/MdmLayoutVer.java` | `@Entity @Table(name="TB_MDM_LAYOUT_VER") @IdClass(MdmLayoutVerId.class)`, `extends CactusAuditEntity`. 필드 `Long layoutId`, `Long layoutVersion`(칼럼 `LAYOUT_VERSION`), `int totalLength`, `String switchMode`, `String changeKinds`, `String changeSummary`, `String snapshotJson`. 생성자 `(Long layoutId, Long layoutVersion)` + getter/setter |
| `BL/entity/MdmLayoutVerId.java` | `@IdClass`: `Long layoutId, Long layoutVersion`, equals/hashCode(필드명은 엔티티 `@Id` 와 같아야 한다, TSK-05-01 F26) |
| `BL/repository/MdmLayoutVerRepository.java` | `JpaRepository<MdmLayoutVer, MdmLayoutVerId>`(finder 없음 — 조회는 `LayoutVersionStore` 의 JPQL) |

### 생성 — 직렬화기·파서 (`BL/dmb/layout/codec/`, 순수 — `java.*`·`contract.layout` 만 의존, I11)

| 파일 | 내용 |
|---|---|
| `package-info.java` | "03 전문 직렬화기·파서(TSK-05-03). 입력은 스냅샷뿐이다 — 엔티티·리포지토리·Spring 을 보지 않는다(I11)" |
| `LayoutCodecException.java` | `RuntimeException`. 필드 `Integer seq, String columnPhys, String reason`. message = `"[{seq} {columnPhys}] {reason}"` |
| `LayoutUnitTable.java` | `record LayoutUnitTable(Map<String, Unit> units)`, 중첩 `record Unit(String code, String dimension, BigDecimal factor)`, `static LayoutUnitTable of(Collection<Unit>)`, `Unit require(String code)`(없으면 `LayoutCodecException` "단위 마스터에 없는 단위: X"), `static LayoutUnitTable empty()` |
| `LayoutUnitConverter.java` | 순수 static. `BigDecimal convert(BigDecimal value, String fromUnit, String toUnit, LayoutUnitTable)` = `value × from.factor ÷ to.factor`(`MathContext(34, HALF_UP)`, 같은 단위면 그대로, 차원이 다르면 예외 "차원이 다르다: A(길이) → B(무게)"). 송신은 `convert(v, base, trans)`, 수신은 `convert(v, trans, base)`(I8) |
| `LayoutNumSpec.java` | `record LayoutNumSpec(boolean sign, boolean zeroPad, int impliedScale, int domainScale)`. `static LayoutNumSpec of(MdmLayoutItemSnapshot)` — numFormat 이 있으면 그 값, 없으면 `(false, true, scale??0, scale??0)`(03:59 "숫자 왼쪽 0", I3). `boolean pointMode()` = `impliedScale == 0 && domainScale > 0` |
| `LayoutFieldCodec.java` | 순수 static(§6.3). `byte[] encodeChar(String value, int length, Charset cs)`, `String decodeChar(byte[] slice, Charset cs)`, `byte[] encodeNumber(BigDecimal value, int length, LayoutNumSpec spec)`, `BigDecimal decodeNumber(byte[] slice, LayoutNumSpec spec)`, `byte[] blank(int length)`. 인코딩은 `CharsetEncoder` 에 `CodingErrorAction.REPORT` — 담지 못하는 문자는 예외(I6) |
| `LayoutAutoValues.java` | 순수 static. `String sendTime(LocalDateTime t, int length)` — 14 `yyyyMMddHHmmss`, 8 `yyyyMMdd`, 6 `HHmmss`, 그 밖은 예외(D5) |
| `LayoutSegment.java` | `record LayoutSegment(String zone /*HEADER|BODY*/, int headerSeq /*본문 0*/, String headerName, MdmLayoutItemSnapshot item, int offset /*메시지 절대 바이트*/, int length)` |
| `LayoutSegments.java` | `static List<LayoutSegment> of(MdmLayoutSnapshot)` — 헤더 SEQ 순으로 `header.offset + item.offset`, 이어서 본문 항목 `item.offset`. 절대 오프셋 오름차순. 이웃 구간이 겹치거나 비면(합 ≠ totalLength) 예외 |
| `LayoutSerializer.java` | `implements MdmLayoutSerializer`. 생성자 `(LayoutUnitTable units)`. `serialize(snapshot, record, context)`(§6.3) |
| `LayoutParser.java` | `implements MdmLayoutParser`. 생성자 `(LayoutUnitTable units)`. `parse(snapshot, message)`(§6.3) — 결과는 본문 DATA·CONST·AUTO 항목만 `COLUMN_PHYS` 키로(D10) |

### 생성 — 공용 `BL/dmb/layout/` (검사·스냅샷·버전·영향도)

| 파일 | 내용 |
|---|---|
| `LayoutConstJudge.java` | `@Component`. 생성자 `(LayoutQueries, DomainTreeReader, DomainChainAssembler, DomainTestCaseRunner)`. `Judgement judge(String columnPhys, String value)` — ① 컬럼 → 도메인 → `EffectiveDomainView` ② 엔진 `ValueConverter.convert(value, dataType)` 실패면 FAIL("타입 변환: …") ③ 표준식이 있으면 `DomainTestCaseRunner.preview(view, columnPhys, value, Map.of())` 의 `std.RESULT` 가 `false`·`ERROR` 면 FAIL(MESSAGE), `UNDECIDED` 면 UNDECIDED ④ 그 밖 PASS. 비즈니스식은 보지 않는다(D6). 중첩 `record Judgement(String result /*PASS|FAIL|UNDECIDED*/, String message)` |
| `LayoutRegistrationRules.java` | 순수 static(§6.2). `List<LayoutIssue> check(List<LayoutItemDraft> items, Map<String, LayoutColumnInfo> dictionary, LayoutUnitTable units, Charset charset, Map<Integer,Integer> lengthsBySeq, BiFunction<String,String,Judgement> judge, List<LayoutIssue> warnings)` → L12(CONST 기본값)·L13·L14·L15. `List<LayoutIssue> checkOverrides(List<Override> overrides, …)` → 재정의 값의 L12. 중첩 `record Override(long headerLayoutId, int headerSeq, String columnPhys, String value, int length)`. `static int requiredWidth(LayoutColumnInfo col, LayoutNumFormat fmt /*null 허용*/, String transUnit, LayoutUnitTable units)`(I13) |
| `LayoutCheckTable.java` | 순수 static. `static final List<String> CONDITIONS`(F1 원문 7문장), `static Result build(List<LayoutIssue> issues, List<LayoutIssue> warnings)` → `record Result(List<Map<String,Object>> checks /*7행: NO, CONDITION, CODE, RESULT(PASS|FAIL|WARN), MESSAGES*/, List<Map<String,Object>> otherIssues, boolean passed)`. 행 배정은 §6.2 표(I12) |
| `LayoutSnapshotJson.java` | 순수(Jackson). 정규화 매퍼(`MapperFeature.SORT_PROPERTIES_ALPHABETICALLY`, `SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS`, 들여쓰기 없음). `String write(MdmLayoutSnapshot)`, `MdmLayoutSnapshot read(String)`, `static MdmLayoutSnapshot withVersion(MdmLayoutSnapshot, long)`(I15) |
| `LayoutSnapshotAssembler.java` | `@Component`. 생성자 `(LayoutQueries, LayoutDictionary, MdmEaiRepository 또는 LayoutQueries.allEais)`. `MdmLayoutSnapshot read(Long messageId)`(DB 저장본 → 스냅샷, `layoutVersion` 은 `MdmLayout.layoutVersion`), `MdmLayoutSnapshot fromDraft(LayoutDraft draft)`(초안 → 스냅샷, `layoutId` 는 있으면 그 값 없으면 0, `layoutVersion` 0). 항목 변환(§6.4): `dataType` = 도메인 NUMBER → `NUM`, 그 밖 → `CHAR`, FILLER → null. `unitCode`·`scale` = 도메인 파생값(D3). 헤더 항목의 `overrideValue` = 이 전문의 `TB_MDM_LAYOUT_CONST`. `encoding`·`padRule` = 전문 EAI 의 값(EAI 가 없으면 null — 직렬화기가 UTF-8 로 센다, I2) |
| `LayoutDraft.java` | `record LayoutDraft(Long layoutId, String layoutName, String eaiCode, String sndSystem, String rcvSystem, List<Long> headerIds /*EAI 표준 헤더 끼운 뒤*/, List<ConstRow> consts, List<LayoutItemDraft> items, List<Integer> itemLengths, LayoutOffsetCalculator.Stacked placed)`. save·validate·execute 가 공유하는 "검사를 통과한 초안"(I19) |
| `LayoutDraftBuilder.java` | `@Component`. `LayoutMngService.save` ①~⑥ 단계(기본 속성 L11, 헤더 구성·EAI 끼움 L09, 재정의 L10, 본문 L01~L08, 길이·배치)를 **그대로 옮긴** `Built build(LayoutMngSaveRequest, List<Map> headers, List<Map> consts, List<Map> items, boolean forSave)` → `record Built(LayoutDraft draft, List<LayoutIssue> issues, List<LayoutIssue> warnings, MdmLayout target)`. 여기서 L12~L15 도 함께 모은다(`LayoutRegistrationRules`). save 는 issues 가 있으면 `LayoutRejections.reject(MESSAGE_PREFIX, issues)`, validate 는 표로 돌려준다 |
| `LayoutChangeClassifier.java` | 순수 static(§6.6). `static Change classify(MdmLayoutSnapshot prev /*null=최초*/, MdmLayoutSnapshot next, Function<String,String> displayName)` → `record Change(String switchMode /*null|SEQUENTIAL|SIMULTANEOUS*/, List<Kind> kinds, String summary)`, `enum Kind { INITIAL, FILLER_SPLIT, CONST_VALUE, META, ITEM_LENGTH, ITEM_ORDER, HEADER_STACK, FORMAT, ITEM_INSERT, ITEM_REMOVED, TOTAL_LENGTH }` + `boolean simultaneous()` |
| `LayoutVersionStore.java` | `@Component`. `EntityManager` JPQL 읽기 + `MdmLayoutVerRepository` 쓰기. `Optional<MdmLayoutVer> latest(Long layoutId)`(`ORDER BY v.layoutVersion DESC` + `setMaxResults(1)`), `List<MdmLayoutVer> history(Long layoutId)`(최신부터), `Optional<MdmLayoutVer> find(Long layoutId, Long version)`, `MdmLayoutVer save(MdmLayoutVer)`(`saveAndFlush`) |
| `LayoutVersioner.java` | `@Component`. `Outcome record(Long messageId)`(§6.5 절차). `record Outcome(boolean created, long layoutVersion, String switchMode, String changeSummary, long ver /*TB_MDM_LAYOUT 의 마지막 감사 VER*/)`. 쓰기는 `save`·`saveAndFlush` 로 명시한다(05-02 I23) |
| `LayoutCodecs.java` | `@Component`. `MdmUnitRepository.findAll()` 로 `LayoutUnitTable` 을 만들어 `LayoutSerializer`·`LayoutParser` 를 돌려준다(`serializer()`, `parser()`, `units()`) |
| `LayoutSampleRenderer.java` | `@Component`. `Map<String,Object> render(MdmLayoutSnapshot, Map<String,String> samples, LocalDateTime sendTime, long seq, Function<String,String> names)` → §6.1 execute 응답(segments·line·totalBytes·parsed·errors). 값 넘침 등은 항목별 `errors` 로 모으고 그 칸은 `#` 로 채워 보인다(렌더는 멈추지 않는다) |
| `LayoutImpactFinder.java` | `@Component`. `List<Map<String,Object>> search(String keyword)`(§6.7), `List<Map<String,Object>> itemsUsing(Collection<String> physNames)`(JPQL: `MdmLayoutItem` × `MdmLayout`, 헤더면 사용 전문 수). 네이티브 SQL 을 새로 쓰지 않는다(`DomainImpactQueries.subtree` 재사용) |
| `LayoutItemReferenceSpi.java` | `@Component implements MdmDomainReferenceSpi`. `referencesTo(domainIds, physNames)` → `LayoutImpactFinder.itemsUsing(physNames)` 를 `MdmDomainReference("LAYOUT_ITEM", refKey)` 로(빈 집합이면 빈 목록 — JPQL `IN ()` 금지). refKey = `"{LAYOUT_NAME}#{SEQ} {COLUMN_PHYS} ({OFFSET}/{LENGTH})"`, 헤더면 앞에 `"(헤더) "`(D12) |

### 생성 — 화면 서비스 DTO (`BL/dmb/layoutMng/dto/`)

| 파일 | 내용 |
|---|---|
| `LayoutMngExecuteRequest.java` | POJO: `Long layoutId, Long ver, String layoutName, String eaiCode, String sndSystem, String rcvSystem, String sendTime /*yyyyMMddHHmmss, 없으면 서버 시계 KST*/, Long seq /*없으면 1*/` |
| `LayoutMngExportRequest.java` | POJO: `Long layoutId, Long layoutVersion /*없으면 최신*/` |

### 생성 — 테스트 (백엔드, 이름·케이스는 §3)

- `BLT/dmb/layout/codec/{LayoutFieldCodecTest, LayoutUnitConverterTest, LayoutSerializerRoundTripTest, LayoutCodecArchitectureTest}.java`, `BLT/dmb/layout/codec/M201Snapshots.java`(테스트 도우미 — html M201 전체 스냅샷을 손으로 조립, §3.1)
- `BLT/dmb/layout/{LayoutRegistrationRulesTest, LayoutCheckTableTest, LayoutChangeClassifierTest, LayoutSnapshotJsonTest}.java`
- `BAT/dmb/layoutMng/{LayoutRegistrationSqliteTest, LayoutVersionSqliteTest, LayoutSampleSqliteTest, LayoutImpactSqliteTest}.java`, `BAT/MdmLayoutVersionMigrationTest.java`
- `BAM/MdmLayoutVersionMssqlMigrationTest.java` — **작성·컴파일만**(도커 금지로 실행 생략)

### 생성 — 프런트

| 파일 | 내용 |
|---|---|
| `FM/src/layout/sample-line.ts` | `visibleText(text)`(공백 → `·`), `ruler(total)`(html 과 같은 규칙: 10의 배수는 십의 자리 숫자, 5의 배수는 `+`, 나머지 `.`), `zoneKey(seg)` → `"h1"|"h2"|…|"body"|"filler"`, `ZONE_COLORS`(html 4색 + 셋째 헤더 이후 회전), `segmentTitle(seg)`(`"{구역} {이름} {위치}"`) |
| `FM/src/layout/change-class.ts` | `CHANGE_CLASS_TABLE`(html 5행 그대로: 변경·총 길이·기존 오프셋·전환), `switchModeLabel(mode)` → `SEQUENTIAL`="순차 전환", `SIMULTANEOUS`="동시 전환", null="-" |
| `FM/src/layout/snapshot-export.ts` | `snapshotFileBase(layoutId, version)` = `"layout-{id}-v{n}"`, `snapshotJsonText(snapshot)`(2칸 들여쓰기), `snapshotExcelRows(snapshot, names)` → 헤더·본문 항목을 절대 위치 순으로 편 행(`구역, 순서, 항목명, 표준 물리명, fill_kind, 타입, 오프셋, 길이, 위치, 기준 단위, 전송 단위, 단위 항목, 숫자 형식, 값(상수·재정의·AUTO 종류)`), `SNAPSHOT_EXCEL_COLUMNS` |
| `FM/src/layout/download.ts` | `downloadText(fileName, text, mime)` — Blob + `URL.createObjectURL` + 임시 `a[download]` 클릭 + `revokeObjectURL`(F24 선례) |
| `FM/pages/dmb/layoutMng/components/LayoutCheckPanel.tsx` | 등록 검증 표(7행: #·거부 조건·결과 배지·메시지) + [검증 실행] + 기타 이슈 목록. props `result: CheckResult \| null, busy, canRun, onRun` |
| `FM/pages/dmb/layoutMng/components/SampleMessagePanel.tsx` | 예시 값 입력(본문 DATA 항목마다 `Input`, 숫자 도메인이면 기준 단위를 라벨에) + [렌더] + 눈금자 + 색 구간 한 줄(`span` 마다 배경색·`title`) + 범례 + 총 바이트 문구 + 구간 표(위치·구역·항목·fill_kind·값) + 파싱 결과 표 + 항목 오류. props `items, values, onChange, result: SampleResult \| null, busy, canRun, onRender` |
| `FM/pages/dmb/layoutMng/components/VersionPanel.tsx` | 버전 이력 그리드(버전·저장 일시·저장자·변경·총 길이·전환 방식 배지) + 빈 상태 + 변경 분류 표(`CHANGE_CLASS_TABLE`) + 스냅샷 미리보기(`pre`) + [JSON 내려받기]·[엑셀 내려받기]. props `versions, selectedVersion, onSelectVersion, snapshot, onDownloadJson, onDownloadExcel, busy` |
| `FM/pages/dmb/layoutMng/components/ImpactPanel.tsx` | 영향 전문 목록: 검색어(컬럼 표준 물리명 또는 도메인 표준명·이름) + [조회] + 그리드(컬럼·레이아웃·항목·송신 → 수신·영향) + 빈 상태. props `rows, loading, onSearch` |
| `FM/tests/layout/{sample-line,change-class,snapshot-export}.test.ts`, `FM/tests/dmb/layoutMng/tabs-render.test.ts` | §3.5 |
| `docs/mdm/tasks/TSK-05-03/screens/*.png` | E2E 스크린샷(§3.6, 커밋) |

### 수정

| 파일 | 변경 | 규칙 |
|---|---|---|
| `BL/contract/layout/MdmLayoutItemSnapshot.java` | record 끝에 `String unitCode, Integer scale` 두 칸 추가(D3). javadoc 에 "도메인 파생값 — 전송 단위 환산·소수점 문자 형식에 쓴다(TSK-05-03)" | 기존 칸 순서·이름 불변 |
| `BLR/contract/layout/layout-snapshot.schema.json` | `MdmLayoutItemSnapshot.properties` 에 `"unitCode": {"type": ["string","null"]}`, `"scale": {"type": ["integer","null"]}` 추가, `required` 에 두 키 추가 | 다른 키 불변 |
| `BLTR/contract/layout/m201-snapshot-sample.json` | 모든 항목 객체에 `unitCode`·`scale` 추가(COIL_THK `"mm"`·`1`, 숫자 헤더 항목 `null`·`0`, 문자·FILLER `null`·`null`) | html 예시의 `"unit": "mm"` 과 일치 |
| `BLT/contract/stub/ContractStubCompileTest.java` | `:234` `new MdmLayoutItemSnapshot(…)` 에 인자 둘(`null, null`) 추가 | 단언 불변 |
| `BL/dmb/layout/LayoutIssueCode.java` | `L12`·`L13`·`L14`·`L15` 상수 추가(javadoc: 03 거부 #2·#3·#4·#7). 클래스 javadoc 의 "05-03 몫은 여기 없다" 문장을 "05-03 이 L12~L15 로 더했다"로 바꾼다 | 기존 상수 순서·이름 불변(D7) |
| `BL/dmb/layout/LayoutDictionary.java` | 메서드 추가 `Map<String, EffectiveDomainView> views(Collection<String> physNames)`(`byPhysNames` 와 같은 조립 경로, `LayoutConstJudge` 가 쓴다) | 기존 메서드 불변 |
| `BL/dmb/layout/LayoutQueries.java` | JPQL 메서드 추가: `itemsUsingColumns(Collection<String> phys)`(`SELECT i, l FROM MdmLayoutItem i, MdmLayout l WHERE l.layoutId = i.layoutId AND i.columnPhys IN :phys ORDER BY l.layoutName, i.seq`), `messagesStacking(Long headerId)` 개수. **네이티브 SQL 상수는 추가하지 않는다** | `ALL_NATIVE_SQL` 불변 |
| `BL/dmb/layoutMng/service/LayoutMngService.java` | ① `save` 의 ①~⑥ 을 `LayoutDraftBuilder.build(…, true)` 호출로 바꾸고(동작 동일 + L12~L15), ⑨ 뒤에 `versioner.record(id)` → 응답에 `layoutVersion, versionCreated, switchMode, changeSummary` 추가, `ver` 는 `Outcome.ver`(I16) ② `view` 응답에 `versions`(§6.1) 추가 ③ `search` 에 `target=IMPACT` 분기 ④ 새 메서드 `validate(LayoutMngSaveRequest, headers, consts, items)`, `execute(LayoutMngExecuteRequest, headers, consts, items, samples)`, `export(LayoutMngExportRequest)`(§6.1). 생성자 주입 추가 | 기존 응답 키 불변(추가만). `@Transactional` 금지 |
| `BL/dmb/headerMng/service/HeaderMngService.java` | ① 항목 검사 뒤 `LayoutRegistrationRules.check`(L12~L15, 헤더 항목 기준)를 더해 이슈가 있으면 `HEADER_PREFIX` 로 거부 ② ⑩ `recalculateUsers` 뒤 사용 전문마다 `versioner.record(messageId)` → 응답에 `versioned[{LAYOUT_ID, LAYOUT_VERSION, SWITCH_MODE, CREATED}]` 추가 | 기존 응답 키 불변 |
| `BA/services/dmb/layoutMng.bpmn` | `actionGateway` 에 `validate`·`execute`·`export` 분기와 serviceTask 3개 추가(`camunda:class="layoutMngService"`, `method` = 액션 이름, `output=result`, dto = `LayoutMngSaveRequest`·`LayoutMngExecuteRequest`·`LayoutMngExportRequest` FQCN). **`bpmn-tool` 로 수정·`validate`**(손 XML 금지), 뒤에 `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root . --module mdm` ERROR 0 | 기존 분기 3개 불변 |
| `BAT/MdmSharedContractMigrationTest.java` | `:64` 메서드 이름 `flyway_가_V1_V2_V3_V4_V8_V9_V10_V11_V12_를_적용했다`, `:79` 집합에 `"12"` 추가, 주석 한 줄(TSK-05-03 V12) | 새 버전 반영(완화 아님) |
| `BAM/{MdmMssqlMigrationTest, MdmInterfaceLayoutMssqlMigrationTest, MdmMasterDataMssqlMigrationTest, MdmTermDomainColumnMssqlMigrationTest}.java` | 버전 집합에 `"12"`, 메서드 이름의 `_V11_` 뒤에 `V12_`. `MdmMssqlMigrationTest` 는 `migrationsExecuted` 8→9, `targetSchemaVersion` "11"→"12" | 컴파일만 확인(F30) |
| `BAT/dmb/headerMng/HeaderMngServiceSqliteTest.java` | `:178` 단언을 `assertEquals(2L, …VERSION…, "M201 저장 v1 → 헤더 변경으로 v2(TSK-05-03 D4)")` 로 바꾸고, 같은 테스트에 `out.versioned` 1건(`SWITCH_MODE=SIMULTANEOUS`) 단언 추가 | 테스트 이름·개수 불변(D4) |
| `BAT/dmb/layoutMng/LayoutMngServiceSqliteTest.java` | `:292` `저장은_전문_버전을_올리지_않는다` → 이름 `같은_내용을_두_번_저장해도_버전은_1이다`, 단언 `VERSION == 1` 과 `TB_MDM_LAYOUT_VER` 1행. `:337` `LAYOUT_VERSION` 0 → 1 | 테스트 개수 불변(이름만 바뀜, D4) |
| `BAT/dmb/LayoutOasisFlowTest.java` | 테스트 4개 추가(§3.3) | 기존 4개 불변 |
| `BAT/dmb/LayoutTestSupport.java` | 도우미 추가: `long domainWithUnit(String std, String type, int length, Integer scale, String unit)`, `void unit(String code, String dimension, String base, String factor)`, `long ruleDomain(String std, String type, int length, Integer scale, String stdRule)`, `List<Map<String,Object>> versionRows(long layoutId)`, `Map<String,Object> sample(String phys, String value)` | 기존 도우미 불변 |
| `FM/pages/dmb/layoutMng/page.tsx` | 오른쪽 패널 위에 shared `Tabs`(`편집`·`등록 검증·샘플 전문`·`버전·영향도`, 기본 `편집`). 상태 추가: `tab`, `check`, `samples`, `sample`, `versions`, `selectedVersion`, `snapshot`, `impacts`. 핸들러 `runValidate`·`runRender`·`loadSnapshot`·`downloadJson`·`downloadExcel`·`runImpact`. `openLayout` 이 `view.versions` 를 채운다. 저장 성공 토스트 문구는 그대로 둔다(§6.8) | `편집` 탭의 DOM·testid 는 그대로(E2E L1~L8) |
| `FM/pages/dmb/layoutMng/api.ts` | `validateLayout(draft, headers, consts, items)`, `renderSample(draft, headers, consts, items, samples, opts?)`, `exportSnapshot(layoutId, version?)`, `searchImpact(keyword)` 추가 — grid 는 빈 배열이라도 모두 보낸다(`execute` 는 `headers`·`consts`·`items`·`samples` 넷) | 기존 함수 불변 |
| `FM/pages/dmb/layoutMng/types.ts` | `CheckRow`, `CheckResult`, `SampleSegment`, `SampleResult`, `VersionRow`, `ExportResult`, `ImpactRow` 추가. `ViewResult.versions?`, `SaveResult.{layoutVersion?, versionCreated?, switchMode?, changeSummary?}` 추가 | 추가만 |
| `FM/tests/dmb/layoutMng/api.test.ts` | 케이스 추가(§3.5) | 기존 케이스 불변 |
| `FE/mdm-layoutMng.spec.ts` | 파일 머리 주석에 TSK-05-03 한 줄, 상수 `SHOT_0503 = (name) => path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-05-03/screens", name)`, **기존 두 test 블록 뒤에** 새 test 4개(L9~L12, §3.6) | L1~L8 한 글자도 안 고친다 |
| `docs/mdm/screens/layoutMng/layoutMng_기능설계서.md` | 절 추가: 탭 구성, 액션 `validate`·`execute`·`export`·`search(IMPACT)`, 요청·응답 키(§6.1), 거부 코드 L12~L15, 7종 표 배정, 전환 방식 규칙, testid | 기존 절 불변 |
| `docs/mdm/decisions.md` | Build 완료 때 아래 D1~D13 을 **임시 ID 블록** `## D-TSK-05-03-1 (<UTC>)` … `## D-TSK-05-03-13 (<UTC>)` 으로 끝에 추가(필드 Phase·Decision needed·Decision made·Rationale·Reversible·Source — 기존 블록과 같은 모양). 전역 번호 금지, `decision-log.py append` 금지, 기존 블록 수정 금지 | 추가만 |

### 변경하지 않음

기존 마이그레이션 V1~V11, `entity/**`·`repository/**` 의 기존 파일, `contract/**` 중 `MdmLayoutItemSnapshot` 밖의 모든 것(`MdmErrorCode`·`MdmActions`·`MdmPermissions` 포함), `common/**`(호출만), `dma/**`(`DomainTestCaseRunner`·`DomainMngService`·`DomainImpactPanel` 호출·표시만 — 코드 불변), `maru-mdm-engine/**`, `services/dmb/headerMng.bpmn`, `DataInitializer.java`(권한·메뉴 이미 있음, F19), `m-mdm/tsup.config.ts`, `m-mcm/lib/generated/page-registry.ts`, shared 전부(`Tabs`·`exportToExcel` 는 쓰기만), headerMng 화면(`pages/dmb/headerMng/**`), E2E 픽스처(`fixtures/*.sql`) 전부, 다른 E2E 스펙, `docs/mdm/erd/**`(TSK-02-03 소유 — 새 테이블은 인계로 남긴다), `be-run.sh`·`fe-run.sh`, 원천·시안 문서.

### 병렬 충돌 예상 파일 (추가만 한다 — 머지 때 기계적으로 푼다)

| 파일 | 상대 | 성격 |
|---|---|---|
| `V12__*.sql` 두 방언, 버전 집합 단언 5개 파일 | 다른 mdm 마이그레이션 Task(형제 `f93163b8` code-item-edit 등) | 번호 충돌 가능. Phase 06 push 직전 `origin/dev` 최대를 다시 보고 밀린다면 `git mv` 로 옮기고 단언·이 문서 참조를 함께 고친다(F28) |
| `docs/mdm/decisions.md` | 모든 형제 | 임시 ID 라 번호 충돌 없음 |
| `LayoutMngService`·`HeaderMngService`·`LayoutTestSupport`·`mdm-layoutMng.spec.ts` | TSK-05-02 후속 수정(승인 반려 시) | D1 — 05-02 가 바뀌면 이 작업이 그 위로 다시 올라간다 |

---

## 3. 테스트 전략

**게이트 명령(오케스트레이터가 기점 49656a3 에서 실제로 돌린 줄, 글자 그대로)**:

```bash
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain
# 기준선 tests 2427, failures 0 — find src/backend -path '*/build/test-results/*' -name 'TEST-*.xml' 의 testsuite tests/failures/errors 합산
cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint
# 기준선 376 passed(35 files), lint(tsc --noEmit) pass
```

게이트 판정 = 기준선 대비 신규 실패 0 + 테스트 총수 미감소. 두 명령 모두 `heavy.sh` 로 감싸 포그라운드로 돌린다(dev-discipline 「무거운 명령 줄 세우기」·「포그라운드 실행」). 새 백엔드 테스트는 `testAll` 에, 새 vitest 는 m-mdm `test` 에 자동으로 들어간다. **게이트 밖 확인 명령**(판정에 넣지 않고 결과를 보고에 붙인다):

- `cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:compileMssqlTestJava --no-daemon --console=plain` — mssqlTest 소스 5개 수정·1개 생성분의 컴파일(도커 불필요, F30)
- `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root . --module mdm` — ERROR 0
- mantine-aggrid-ui §4 `audit` 두 개(바꾼 FE 파일만) — 0건
- E2E: §3.7 절차(화면 작업 게이트 — 오케스트레이터가 Design 커밋 뒤 기준선을 잰다)

### 3.1 lib 단위 테스트 (Spring 없음)

**`BLT/dmb/layout/codec/M201Snapshots.java`**(도우미): html M201 전체를 계약 record 로 손으로 조립한다 — `layoutId 201`, `encoding "EUC-KR"`, 헤더 L100(offset 0, 100, 13항목 — 05-02 `LayoutTestSupport` §3.2 표의 fill_kind·기본값·길이, SND_FAC_TP `overrideValue "B1"`, EAI_IF_ID `overrideValue "IFL2MES201"`), L110(offset 100, 30, 6항목), 본문 COIL_ID(CHAR 130/20)·PROD_DT(CHAR 150/8)·COIL_THK(NUM 158/4, `numFormat(false,true,1)`, `unitCode "MM"`, `scale 1`)·FILLER(162/25), `totalLength 187`. 변형 도우미 `withBody(…)`, `withEncoding(…)`, `withItem(seq, UnaryOperator)`. **이 도우미는 DB 를 쓰지 않는다** — 직렬화기가 스냅샷만으로 동작함을 보이는 입력이다.

| 클래스 | 테스트(메서드 이름) | 단언 |
|---|---|---|
| `LayoutFieldCodecTest` | `@ParameterizedTest` `암묵_소수점_예시_값을_03_표대로_직렬화한다(String value, String expected)` — **03·html 예시 표 그대로**: `3.5→0035`, `0.1→0001`, `12.4→0124`, 경계 `0→0000`, `99.9→0999` | spec `(false,true,1,1)`, length 4, EUC-KR |
| | `@ParameterizedTest` `암묵_소수점_문자열을_03_표대로_파싱한다(String text, String expected)` — 위 표의 역방향 | `compareTo == 0` |
| | `EUC_KR_한글은_2바이트_UTF_8_은_3바이트로_센다` | `encodeChar("코일", 10, EUC-KR)` = `"코일"` 4바이트 + 공백 6(총 10바이트), UTF-8 은 6 + 4. 두 경우 모두 `decodeChar` → `"코일"` |
| | `문자는_오른쪽_공백_숫자는_왼쪽_0으로_채운다` | `"C26A0012345"` 20 → 뒤 공백 9, `12` NUM(0,0) 5 → `"00012"` |
| | `0_채움이_아니면_숫자는_왼쪽_공백으로_채운다` | `(false,false,1,1)`: 3.5 → `"  35"`, 파싱 3.5 |
| | `부호_자리가_있으면_첫_자리에_부호를_쓴다` | `(true,true,1,1)` length 5: -3.5 → `"-0035"`, 3.5 → `"+0035"`, 파싱 왕복 |
| | `부호_자리가_없는데_음수면_오류다` | `LayoutCodecException` |
| | `소수점_문자_형식은_도메인_소수_자리까지_쓴다` | `(false,true,0,1)` length 4: 3.5 → `"03.5"`, 3 → `"03.0"`, 파싱 3.5 |
| | `자리가_넘치면_잘라내지_않고_오류다` | CHAR `"가나다라마바"` 10 EUC-KR(12바이트) → 예외. NUM `(false,true,1,1)` length 4 에 1234.5(숫자 5자리) → 예외. 경계: 999.9 → `"9999"` 는 통과(직렬화기는 도메인 범위를 보지 않고 자리만 본다) |
| | `인코딩이_담지_못하는_문자는_오류다` | EUC-KR 에 `"😀"` → 예외(`?` 로 바꾸지 않는다) |
| | `빈_값은_공백으로_쓰고_공백은_null_로_읽는다` | null CHAR·NUM → 공백, 공백 → null |
| | `숫자_칸의_숫자가_아닌_글자는_파싱_오류다` | `"00A5"` → 예외 |
| `LayoutUnitConverterTest` | `같은_차원이면_기준에서_전송_단위로_계수를_곱하고_나눈다` | 표 `MM(LENGTH,1)`, `UM(LENGTH,0.001)`, `INCH(LENGTH,25.4)`: 3.5 MM→UM = 3500, 25.4 MM→INCH = 1 |
| | `수신은_전송_단위에서_기준_단위로_역변환한다` | 3500 UM→MM = 3.5 |
| | `차원이_다르면_오류다`, `단위_마스터에_없는_단위는_오류다` | 예외 |
| `LayoutSerializerRoundTripTest` | `M201_예시를_187바이트_한_줄로_직렬화한다` | `serialize(M201, {COIL_ID:"C26A0012345", PROD_DT:"20260922", COIL_THK:3.5}, ctx(2026-09-22T14:30:15, 1))` 가 187바이트이고, 테스트가 html 값(F3)으로 조립한 기대 문자열과 같다. 단 L110 길이는 `00187`(D5), TC_CD 는 `"201     "`(LAYOUT_ID=대리키, D5). 구간별 확인: 158~161 = `0035`, 0~7 = TC_CD, 94~99 = `000187` |
| | `M201_직렬화한_전문을_같은_스냅샷으로_파싱하면_값이_같다` | `parse` 결과 `COIL_ID="C26A0012345"`, `PROD_DT="20260922"`, `COIL_THK` 3.5 |
| | `@ParameterizedTest` `03_예시_값_왕복이_일치한다(String mm)` — `3.5`, `0.1`, `12.4` | 전문 전체를 직렬화 → 파싱한 COIL_THK 가 입력과 같고, 158~161 바이트가 각각 `0035`·`0001`·`0124` (**수용 기준 1**) |
| | `전송_단위_항목은_송신에서_변환하고_수신에서_역변환한다` | COIL_THK `transUnit "UM"`, `numFormat(false,true,1)`, length 5: 3.5 → `"35000"` → 파싱 3.5 |
| | `단위_항목이_가리키는_단위로_변환하고_역변환한다` | 본문 COIL_WGT(NUM 3,1, `unitCode "TON"`, `unitItem "COIL_WGT_UNIT"`, length 6)·COIL_WGT_UNIT(CHAR 4). record `{COIL_WGT:1.5, COIL_WGT_UNIT:"KG"}` → COIL_WGT 칸 `"015000"`(1500.0 kg) → 파싱 COIL_WGT 1.5(TON). 단위 값이 비면 기준 단위 그대로 |
| | `AUTO_는_송신_시각_순번_전문_길이_레이아웃_ID_로_채운다` | SNT_SND_HRP `20260922143015`, SNT_ORD(5) `00001`(seq 1), SNT_LTH(6) `000187`, L110 SEQUENCE_NO(4) `0001`, LENGTH(5) `00187`, DATE `20260922`, TIME `143015`, TC_CD `201` + 공백 |
| | `SEND_TIME_은_항목_길이_14_8_6_에_맞춰_쓰고_다른_길이는_오류다` | 길이 10 → 예외 |
| | `헤더_상수는_재정의가_있으면_재정의_없으면_기본값을_쓴다` | SND_FAC_TP `B1`(재정의), RCV_FAC_TP `B1`(기본값), EAI_IF_ID `IFL2MES201` |
| | `한글_값이_있어도_다음_항목의_바이트_오프셋은_그대로다` | EUC-KR: COIL_ID `"코일A"` → 130~149 가 5바이트 + 공백 15, PROD_DT 가 150~157 에 그대로. UTF-8 스냅샷도 같은 오프셋(7바이트 + 공백 13) |
| | `파싱은_받은_값을_그대로_돌려주고_검증하지_않는다` | 받은 전문의 본문 CONST 칸이 스냅샷 기본값과 달라도(`ZZ`) 결과는 `ZZ`, 숫자 칸 `0999` → 99.9(도메인 범위 식 없음 — 파서는 식을 모른다), 예외 없음(**F7**) |
| | `전문_길이가_총_길이와_다르면_파싱하지_않는다` | 186바이트 → 예외 |
| | `파싱_결과는_본문_항목만_물리명으로_담는다` | 키 집합 = `{COIL_ID, PROD_DT, COIL_THK}`(FILLER·헤더 항목 없음) |
| `LayoutCodecArchitectureTest` | `직렬화기_파서는_스냅샷과_java_만_의존한다` | ArchUnit: `..dmb.layout.codec..` 클래스는 `java..`·`..contract.layout..`·`..dmb.layout.codec..` 에만 의존(엔티티·리포지토리·`EntityManager`·Spring·Jackson 금지) — **수용 기준 2 의 구조 보증**(I11) |
| | `규칙은_위반_샘플을_실제로_잡는다` | 테스트 소스 안의 위반 샘플 클래스(엔티티를 import)를 같은 규칙으로 검사하면 실패(공허 통과 방지, `LayoutStaticGuardTest` 선례). 본 규칙은 `ImportOption.DoNotIncludeTests` 로 main 클래스만 가져오고, 위반 샘플은 그 샘플 클래스만 따로 가져와 검사한다(`M201Snapshots` 같은 테스트 도우미가 본 규칙에 섞이지 않게) |
| `LayoutRegistrationRulesTest` | `거부_2_CONST_값이_판정기에서_거짓이면_L12` | 판정기 스텁이 FAIL → L12, message 에 판정 문구 |
| | `거부_2_CONST_값이_항목_바이트_길이를_넘으면_L12` | STRING 2 항목에 `"ABC"` → L12 |
| | `거부_2_판정_불가는_거부가_아니라_경고다` | UNDECIDED → issues 없음, warnings 에 L12 |
| | `거부_2_상수_재정의_값도_검사한다` | `checkOverrides` 가 FAIL 재정의 → L12(seq = 헤더 항목 SEQ) |
| | `거부_3_전송_단위의_차원이_기준_단위와_다르면_L13`, `거부_3_단위_마스터에_없는_전송_단위는_L13`, `거부_3_기준_단위가_없는_도메인에_전송_단위를_지정하면_L13` | L13 |
| | `거부_4_표현_자리_2는_도메인_3_1을_담지_못해_L14` | W2 → L14, message = `"표현 자리 2는 도메인 코일 두께(숫자 3,1)를 담지 못합니다"`(html 문구 + 도메인 이름) |
| | `@ParameterizedTest` `거부_4_필요_자리수는_정수_소수_소수점_부호_전송_단위를_더한다(p, s, fmt, trans, need)` | `(3,1,SCALE=1,-)→3`, `(3,1,SCALE=0,-)→4`(소수점 문자), `(3,1,SIGN=Y SCALE=1,-)→4`, `(3,1,SCALE=1,UM)→6`(×1000 → 정수 +3), `(3,1,SCALE=1,INCH)→3`(÷25.4 → 0), `(5,0,없음,-)→5`. 각각 need-1 은 L14, need 는 통과 |
| | `거부_4_숫자_형식이_없는_숫자_항목도_전송_단위로_자리가_늘면_L14` | NUMBER 3,1 + trans UM + numFormat 없음(폭 3) → L14 |
| | `거부_7_단위_항목이_같은_레이아웃_항목을_가리키지_않으면_L15`, `거부_7_단위_항목이_자기_자신을_가리키면_L15` | L15 |
| | `M201_은_7종을_모두_통과한다` | 05-02 M201 초안 + 사전 → issues·warnings 없음 |
| `LayoutCheckTableTest` | `검증_표는_03_의_7종을_원문_순서로_7행_낸다` | NO 1~7, CONDITION = F1 문장, 이슈 없으면 전부 PASS, `passed=true` |
| | `L01_L12_L13_L14_L05_L15_는_각각_1_2_3_4_6_7번_행으로_간다` | 코드별 한 이슈 → 그 행만 FAIL |
| | `5번_행은_FILLER_가_아닌_항목의_FILLER_LENGTH_L02_만_센다` | DATA 의 `FILLER_LENGTH` L02 → 5번 FAIL. DATA 의 `DEFAULT_VALUE` L02 → 5번 PASS, `otherIssues` 1건, `passed=false` |
| | `경고만_있으면_WARN_이고_통과다` | L12 경고 → 2번 WARN, `passed=true` |
| `LayoutChangeClassifierTest` | `여분을_쪼개_항목을_추가하면_총_길이_불변_순차_전환이다` | v1 본문 [COIL_ID 20, PROD_DT 8, FILLER 29] → v2 [COIL_ID 20, PROD_DT 8, COIL_THK 4, FILLER 25]: `SEQUENTIAL`, kinds `[FILLER_SPLIT]`, 두 총 길이 187, summary **`"여분 29 → 코일 두께 4 + 여분 25 (여분 쪼개 쓰기)"`**(html v2 그대로) — **수용 기준 6** |
| | `여분_뒤쪽에_항목을_두어도_여분_안이면_순차_전환이다` | v2' [COIL_ID, PROD_DT, FILLER 25, COIL_THK 4] → `SEQUENTIAL`, summary `"여분 29 → 여분 25 + 코일 두께 4 (여분 쪼개 쓰기)"` |
| | `항목_길이가_바뀌면_동시_전환이다` | COIL_THK 4→5, FILLER 25→24(총 길이 불변) → `SIMULTANEOUS`, `[ITEM_LENGTH]` |
| | `항목_순서가_바뀌면_동시_전환이다` | COIL_ID·PROD_DT 자리 바꿈 → `SIMULTANEOUS`, `[ITEM_ORDER]` |
| | `헤더_구성이_바뀌면_동시_전환이다` | L110 제거(본문 오프셋 30 당겨짐) → `SIMULTANEOUS`, kinds 에 `HEADER_STACK` |
| | `CONST_값_재정의는_순차_전환이다` | SND_FAC_TP 재정의 B1→B2 → `SEQUENTIAL`, `[CONST_VALUE]`, summary `"상수 SND_FAC_TP B1 → B2"`(이름 함수가 없으면 물리명) |
| | `숫자_표현_형식이_바뀌면_동시_전환이다` | COIL_THK impliedScale 1→0 → `SIMULTANEOUS`, `[FORMAT]` |
| | `인코딩이_바뀌면_동시_전환이다` | EUC-KR→UTF-8 → `[FORMAT]` |
| | `끝에_항목을_붙여_총_길이가_늘면_동시_전환이다` | → `SIMULTANEOUS`, `[TOTAL_LENGTH]` 또는 `[ITEM_INSERT, TOTAL_LENGTH]` |
| | `여분_밖에_끼워_넣으면_동시_전환이다` | COIL_ID 앞에 항목 삽입 → `[ITEM_INSERT, …]` `SIMULTANEOUS` |
| | `항목을_빼면_동시_전환이다` | → `[ITEM_REMOVED]` |
| | `이름만_바뀌면_순차_전환이다` | layoutName 변경 → `SEQUENTIAL`, `[META]` |
| | `이전_버전이_없으면_최초_등록이다` | prev null → switchMode null, `[INITIAL]`, summary `"최초 등록"` |
| `LayoutSnapshotJsonTest` | `키를_정렬하고_공백_없이_쓴다` | 결과 문자열이 `{"eaiCode":…` 로 시작, `": "`·줄바꿈 없음, 중첩 객체 키도 정렬 |
| | `쓰고_읽으면_같은_스냅샷이다` | M201 → write → read → `equals` |
| | `JSON_키_집합은_스키마와_같다` | 쓴 JSON 의 최상위·헤더·항목·numFormat 키 집합 = 스키마 `properties` 키 집합(스키마 파일을 클래스패스로 읽는다) |
| (수정) `LayoutSnapshotSchemaStructureTest` | 기존 그대로 | 세 곳에 `unitCode`·`scale` 을 함께 더했는지 자동으로 잡는다(D3) |

### 3.2 api SQLite 통합 테스트 (`BAT/dmb/layoutMng/`, 05-02 `LayoutTestSupport` 상속 — `@SpringBootTest(MOCK)` + `@ActiveProfiles("local")` + `@TempDir` DB)

단위·유효 식 도메인은 새 도우미로 넣는다(F21·F22): `unit("MM","LENGTH","MM","1")`, `unit("UM","LENGTH","MM","0.001")`, `unit("KG","WEIGHT","KG","1")`, `domainWithUnit("T_THK_MM", "NUMBER", 3, 1, "MM")`, `ruleDomain("T_FLAG1", "NUMBER", 1, 0, "value <= 1")`. 컬럼은 `column(phys, name, label, domainId)`. 한 클래스가 DB 하나를 공유하므로 이름·EAI 는 `uniq(…)` 로 만든다(05-02 B9).

**`LayoutRegistrationSqliteTest`** — 수용 기준 3(거부 7종, 03 원문 순서) · 4

| 테스트 | 단언 |
|---|---|
| `거부_1_본문_항목의_컬럼이_컬럼_사전에_없으면_L01` | `layoutService.save` → `BusinessException`, message 가 `"전문 저장 거부: L01"` 로 시작, 레이아웃 행·버전 행 0건 |
| `거부_2_CONST_값이_도메인_유효_식을_위반하면_L12` | 본문 CONST(`T_FLAG1`, `value <= 1`)에 `"2"` → `"전문 저장 거부: L12"` |
| `거부_2_CONST_값이_도메인_타입이_아니면_L12` | 같은 항목에 `"AB"` → L12(타입 변환) |
| `거부_2_헤더_상수_재정의_값도_유효_식으로_검사한다` | `T_FLAG1` CONST 를 가진 헤더를 쌓고 재정의 `"9"` → L12. 재정의 `"1"` 은 저장된다 |
| `거부_2_헤더_저장도_CONST_기본값을_유효_식으로_검사한다` | `headerService.save` 에 `T_FLAG1` CONST 기본값 `"5"` → `"헤더 저장 거부: L12"` |
| `CONST_값이_유효하면_저장된다` | `"1"` → 저장 성공(양성 대조 — 검사가 늘 거부하는 변이를 잡는다) |
| `거부_3_전송_단위의_차원이_다르면_L13` | `T_THK_MM` 컬럼에 `TRANS_UNIT=KG` → L13 |
| `거부_4_숫자_표현_자리가_부족하면_L14` | M201 의 COIL_THK `WIDTH=2` → message 에 `"L14[3]"` 와 `"표현 자리 2는 도메인"` |
| `거부_5_FILLER_가_아닌_항목에_길이를_직접_입력하면_L02` | DATA 행에 `FILLER_LENGTH=4` → `"L02[…]"` + `FILLER_LENGTH` |
| `거부_6_전송_단위와_단위_항목을_함께_넣으면_L05` | → L05(DB CHECK 보다 먼저 — 문구가 앱의 것) |
| `거부_7_단위_항목이_같은_레이아웃_항목을_가리키지_않으면_L15` | `UNIT_ITEM="NOPE_UNIT"` → L15 |
| `전송_단위가_같은_차원이면_저장된다` | `T_THK_MM` + `TRANS_UNIT=UM` + `SIGN=N;ZERO=Y;SCALE=1;WIDTH=6` → 성공 |
| `validate_는_7행_표를_돌려주고_아무것도_쓰지_않는다` | M201 초안 → `checks` 7행 전부 PASS, `passed=true`. 호출 전후 `TB_MDM_LAYOUT`·`_ITEM`·`_VER` 행 수 불변 |
| `validate_는_거부_4_를_4번_행에_싣는다` | WIDTH 2 초안 → 4번 FAIL, MESSAGES 에 html 문구, 나머지 PASS, `passed=false` |

**`LayoutVersionSqliteTest`** — 수용 기준 2 · 6, 버전 규칙

| 테스트 | 단언 |
|---|---|
| `처음_저장하면_버전_1_최초_등록_스냅샷이_생긴다` | M201 저장 → `TB_MDM_LAYOUT.VERSION=1`, `TB_MDM_LAYOUT_VER` 1행(`LAYOUT_VERSION=1`, `TOTAL_LENGTH=187`, `SWITCH_MODE` null, `CHANGE_SUMMARY="최초 등록"`), `SNAPSHOT_JSON` 을 `LayoutSnapshotJson.read` 하면 `layoutVersion 1`, `totalLength 187`, 본문 오프셋 [130,150,158,162]. save 응답 `layoutVersion=1`, `versionCreated=true` |
| `같은_내용으로_다시_저장하면_버전을_만들지_않는다` | 두 번째 저장 응답 `versionCreated=false`, `layoutVersion=1`, 버전 행 1개 |
| `여분을_쪼개_항목을_추가하면_버전_2_순차_전환이다` | v1 본문 [COIL_ID, PROD_DT, FILLER 29] → v2 [COIL_ID, PROD_DT, COIL_THK(W4), FILLER 25] 저장 → `VERSION=2`, v2 행 `SWITCH_MODE=SEQUENTIAL`, `TOTAL_LENGTH=187`, `CHANGE_SUMMARY="여분 29 → 코일 두께 4 + 여분 25 (여분 쪼개 쓰기)"`, `CHANGE_KINDS="FILLER_SPLIT"` — **수용 기준 6(서버)** |
| `항목_길이를_바꾸면_동시_전환이다` | COIL_THK W4→W5 + FILLER 25→24 → v3 `SIMULTANEOUS` |
| `헤더를_바꾸면_그_헤더를_쓰는_전문에_새_버전이_생긴다` | M201 v1 뒤 L110 에 항목 추가 저장(`headerService.save`) → M201 `VERSION=2`, v2 `SIMULTANEOUS`·`TOTAL_LENGTH=190`, 헤더 응답 `versioned` 에 M201 |
| `헤더_상수_기본값만_바꾸면_사용_전문은_순차_전환이다` | L100 의 SND_PROC_TP 기본값 L2→L3 → M201 v2 `SEQUENTIAL`, kinds `CONST_VALUE` |
| `저장_응답의_ver_로_다시_저장하면_MDM001_이_나지_않는다` | 저장 응답 `ver` 로 곧바로 다시 저장 → 성공(버전을 올리며 감사 VER 이 한 번 더 올라도 응답이 마지막 값이다, I16). 헤더 저장 뒤에는 `view` 의 `ver` 로 다시 저장 → 성공 |
| `옛_버전_스냅샷으로_직렬화하고_파싱하면_레이아웃을_바꾼_뒤에도_일치한다` | v1 저장 → FILLER 분할로 v2 저장 → `LayoutVersionStore.find(id, 1)` 의 스냅샷으로 `serialize` → 같은 v1 스냅샷으로 `parse` = 입력 값. v1 전문을 v2 스냅샷으로 파싱하면 COIL_ID·PROD_DT 는 같고 COIL_THK 는 null(여분 공백 — 순차 전환의 뜻). v2 스냅샷으로 만든 전문을 v1 로 파싱해도 COIL_ID·PROD_DT 가 같다 — **수용 기준 2** |
| `저장된_스냅샷_JSON_의_키는_스키마와_같다` | 버전 행의 JSON 키 집합 = 스키마(§3.1 과 같은 대조) |
| `초안_스냅샷은_저장_뒤_스냅샷과_같다` | `LayoutSnapshotAssembler.fromDraft(초안)` 과 저장 뒤 `read(id)` 를 `layoutId`·`layoutVersion` 만 맞춰 비교 → `equals`(I19) |
| `view_는_버전_이력을_최신부터_돌려준다` | `versions[0].LAYOUT_VERSION=2`, `SWITCH_MODE=SEQUENTIAL`, `[1]` 은 `CHANGE_SUMMARY="최초 등록"`, `SAVED_AT` 은 `yyyy-MM-dd HH:mm`(KST) |
| `export_는_지정한_버전의_스냅샷을_돌려준다` | `export(layoutId, 1)` → `snapshot.layoutVersion=1`, `fileBase="layout-{id}-v1"`, `names.COIL_ID="코일 ID"`. 버전 생략 → 최신 |
| `export_는_버전이_없으면_거부한다` | VERSION 0·이력 없는 레이아웃(jdbc 로 넣음) → `BusinessException` "저장된 버전이 없습니다" |

**`LayoutSampleSqliteTest`** — 샘플 전문 렌더(`execute`)

| 테스트 | 단언 |
|---|---|
| `execute_는_M201_을_EUC_KR_187바이트_한_줄로_렌더한다` | `sendTime=20260922143015`, samples `COIL_ID=C26A0012345, PROD_DT=20260922, COIL_THK=3.5` → `totalBytes=187`, `encoding=EUC-KR`, 구간 23개, COIL_THK 구간 `OFFSET=158, LENGTH=4, POSITION="159-162", TEXT="0035", ZONE="BODY"`, 첫 구간 `ZONE="HEADER", HEADER_SEQ=1`, FILLER 구간 `FILL_KIND="FILLER"` |
| `execute_는_한글_값을_인코딩_바이트로_센다` | COIL_ID `코일` — EUC-KR EAI: 구간 LENGTH 20, TEXT = `"코일"` + 공백 16. UTF-8 EAI: TEXT = `"코일"` + 공백 14. 두 경우 다음 구간 OFFSET 150 |
| `execute_는_파싱_결과를_함께_돌려준다` | `parsed` 의 COIL_THK `VALUE="3.5"` |
| `execute_는_넘치는_값을_항목_오류로_돌려준다` | COIL_ID 21자 → `errors[0]` 에 COIL_ID, 렌더는 계속(총 187, 그 칸 `#`) |
| `execute_는_초안_이슈가_있으면_렌더하지_않는다` | L01 초안 → `issues` 1건, `segments` 없음 |
| `execute_는_아무것도_쓰지_않는다` | 호출 전후 행 수 불변 |

**`LayoutImpactSqliteTest`** — 영향 전문 목록

| 테스트 | 단언 |
|---|---|
| `search_IMPACT_는_컬럼을_쓰는_전문과_상대_시스템을_돌려준다` | keyword `COIL_THK` → M201 행: `LAYOUT_NAME`, `ITEM="3 코일 두께 (158 / 4)"`, `SND_RCV="L2 → MES"`, `IMPACT` 문구 |
| `search_IMPACT_는_도메인_하위_트리의_컬럼을_모두_보고_안_쓰는_컬럼도_한_줄로_낸다` | 도메인 `COIL_THK` 에 컬럼 둘(COIL_THK, `RMTL_COIL_THK` — 레이아웃 미사용) → 두 줄, 둘째는 `LAYOUT_NAME` null·`IMPACT="레이아웃에서 쓰지 않는다"` |
| `헤더에_쓰인_컬럼은_헤더와_사용_전문_수를_보인다` | keyword `SND_FAC_TP` → L100 행 `LAYOUT_KIND=HEADER`, `USED_BY_COUNT=1` |
| `찾지_못한_키워드는_빈_목록이다` | `impacts` 빈 배열 |
| `도메인_영향도_SPI_는_레이아웃_항목을_LAYOUT_ITEM_으로_낸다` | `DomainMngService.view(COIL_THK 도메인)` 의 `impact.layoutItems[0].REF_KEY` 가 M201 이름·`#3 COIL_THK (158/4)` 를 포함(D12) |

**수정하는 05-02 테스트(D4, 총수 불변)**: `HeaderMngServiceSqliteTest.헤더_길이가_바뀌면_…다시_계산한다`(VERSION 2 + versioned), `LayoutMngServiceSqliteTest.같은_내용을_두_번_저장해도_버전은_1이다`(옛 이름 `저장은_전문_버전을_올리지_않는다`), `LayoutMngServiceSqliteTest.search_는_헤더_요약과_총_길이를_돌려준다`(LAYOUT_VERSION 1).

### 3.3 OASIS 흐름 테스트 (`BAT/dmb/LayoutOasisFlowTest` 에 추가, `RANDOM_PORT`)

BPMN 분기·DTO 바인딩·grid 이름 바인딩·`data.result.*` 모양을 증명한다(05-02 `post(action, params, grids)` 도우미 재사용).

- `validate_는_HTTP_로_7행_표를_돌려준다` — grids `headers`·`consts`·`items` → `data.result.checks` 7행
- `execute_는_HTTP_로_samples_grid_를_받아_렌더한다` — grids 넷(`samples` 포함) → `totalBytes=187`. `samples` 이름 바인딩 실패 시 `ParameterName` 오류로 빨개진다
- `export_는_HTTP_로_스냅샷을_돌려준다` — HTTP save 뒤 `export` → `snapshot.totalLength=187`
- `search_target_IMPACT_는_HTTP_로_영향_목록을_돌려준다`

### 3.4 마이그레이션 테스트

**`BAT/MdmLayoutVersionMigrationTest`**(SQLite, `@SpringBootTest` + `@TempDir`, 선례 `MdmSharedContractMigrationTest`):

- `V12_TB_MDM_LAYOUT_VER_가_있고_PK_는_레이아웃과_버전이다` — `PRAGMA table_info`·`index_list` 로 칼럼·PK
- `SNAPSHOT_JSON_은_JSON_이_아니면_거부한다` — `'not json'` INSERT → 제약 위반
- `SWITCH_MODE_는_순차_동시_NULL_만_받는다` — `'X'` → 위반
- `없는_레이아웃을_가리키면_FK_로_거부한다`
- `엔티티로_저장하고_읽으면_같다` — `MdmLayoutVerRepository.saveAndFlush` → `findById`(한글 `CHANGE_SUMMARY` 포함), 감사 `VER` 0

**`BAM/MdmLayoutVersionMssqlMigrationTest`**(작성·컴파일만): 위 다섯을 MSSQL 에서(`ISJSON` 제약, `NVARCHAR` 한글 왕복, BIN2 `SWITCH_MODE`) — 도커 금지로 실행 생략.

### 3.5 프런트 vitest (`FM/tests/`, `.test.ts` 만 — F25)

| 파일 | 테스트 |
|---|---|
| `tests/layout/sample-line.test.ts` | `공백은 가운뎃점으로 보인다`, `눈금자는 10의 배수에 십의 자리, 5의 배수에 + 를 둔다`(`ruler(20)` = `"....+....1....+....2"`), `구역 색은 헤더 순서·본문·FILLER 로 나뉜다`(h1 `#dbeafe`, h2 `#fef3c7`, body `#dcfce7`, filler `#e5e7eb`), `구간 제목은 구역·이름·1부터 센 위치다`(`"본문 코일 두께 159-162"`) |
| `tests/layout/change-class.test.ts` | `변경 분류 표는 시안 5행 그대로다`, `전환 방식 라벨`(SEQUENTIAL·SIMULTANEOUS·null) |
| `tests/layout/snapshot-export.test.ts` | `파일 이름은 layout-{id}-v{n}`, `엑셀 행은 헤더·본문 항목을 절대 위치 순으로 편다`(M201 JSON 픽스처 → 23행, 첫 행 위치 `1-8`, COIL_THK 행 `159-162`·기준 단위·숫자 형식 `부호 없음·0 채움·암묵 소수 1`), `JSON 텍스트는 2칸 들여쓰기로 다시 읽으면 같다` |
| `tests/dmb/layoutMng/api.test.ts`(추가) | `validate 는 grid 셋을 빈 배열이라도 보낸다`, `execute 는 samples 를 포함한 grid 넷을 보낸다`, `export 는 layoutId·layoutVersion 을 보낸다`, `영향도 검색은 search 의 target=IMPACT 다` |
| `tests/dmb/layoutMng/tabs-render.test.ts` | `/** @vitest-environment happy-dom */`. fetch 스텁(05-02 `page-render.test.ts` 모양): `기본 탭은 편집이고 기존 편집 화면이 그대로 보인다`(`layout-items` 존재), `등록 검증 탭에서 검증을 실행하면 7행이 보이고 거부 행에 메시지가 보인다`(validate 스텁이 4번 FAIL → `layout-check-result-4` = "거부"), `샘플 렌더 결과는 구간마다 색과 가운뎃점으로 보인다`(execute 스텁 → `sample-seg-*` 23개, `data-zone`, `sample-length` 에 `187`), `버전 탭은 이력이 없으면 빈 상태를, 있으면 전환 방식을 보인다` |

### 3.6 브라우저 E2E — `FE/mdm-layoutMng.spec.ts` 에 L9~L12 추가 (스모크 넷)

공통: 기존 도우미(`login`·`openScreen`·`search`·`listRow`·`selectLayout`·`pickColumn`·`bodyCells`·`bodyRow`·`findLayoutId`)와 상수를 그대로 쓰고, **새 test 블록 넷을 기존 두 블록 뒤에** 붙인다(serial). 쓰기 사용자는 기존 `USER`(표준 관리자). 새 스크린샷은 `SHOT_0503(name)` → `docs/mdm/tasks/TSK-05-03/screens/`. 탭 이동은 `layout.getByTestId("layout-tab-check")` 식. 파일 내려받기는 `const [dl] = await Promise.all([page.waitForEvent("download"), 버튼.click()])`, 내용은 `readFileSync(await dl.path(), "utf8")`.

| # | test 제목 · 절차 | 단언 | 스모크 넷·수용 기준 · 스크린샷 |
|---|---|---|---|
| L9 | `"L9 등록 검증 표 7종과 인코딩 바이트 기준 샘플 전문 한 줄"` — 메뉴 이동 → 픽스처 전문 선택 → `등록 검증·샘플 전문` 탭 → [검증 실행] → 예시 값 `sample-input-COIL_ID`=`C26A0012345`, `PROD_DT`=`20260922`, `EXIT_COIL_THK`=`3.5` → [렌더] → COIL_ID 를 `코일A` 로 바꿔 다시 [렌더] | `layout-check-table` 7행, 모든 `layout-check-result-{n}` 이 "통과"(또는 "경고"), "거부" 0개. 첫 렌더: `sample-length` 에 `187`, EXIT_COIL_THK 구간 텍스트 `0035`·title 에 `159-162`, `data-zone` 이 h1·h2·body·filler 네 가지, `sample-parsed-EXIT_COIL_THK` = `3.5`. 둘째 렌더: PROD_DT 구간 title 이 여전히 `151-158`(바이트 기준), COIL_ID 구간 텍스트 `코일A` + `·` | 넷1(메뉴)·AC1(화면)·요구 "인코딩 바이트 기준 한 줄 렌더" · `dmb-layoutMng-check.png`, `dmb-layoutMng-sample.png` |
| L10 | `"L10 표현 자리가 부족하면 검증 표와 저장이 거부를 보인다"` — 픽스처 전문 선택 → EXIT_COIL_THK 행 → `item-detail-width` 2 → `등록 검증·샘플 전문` 탭 [검증 실행] → [저장] | `layout-check-result-4` = "거부", 4번 행에 `표현 자리 2는 도메인`. 저장 → `.error-modal__body` 에 `L14` 와 `표현 자리 2` → "확인". 픽스처는 바뀌지 않는다(다시 선택하면 폭 4) | **넷4(서버 오류 표시)**·AC3(화면) · `dmb-layoutMng-reject.png` |
| L11 | `"L11 여분을 쪼개 항목을 더하면 버전 2 순차 전환, 스냅샷 JSON·엑셀 내려받기"` — 픽스처 전문 선택 → `버전·영향도` 탭(이력 빈 상태 확인) → [신규] → 이름 `버전 ${STAMP}`, EAI `E2EGLUE`, [+ 헤더 추가] `L2 구간 헤더(E2E)`, 송신 L2·수신 MES, 본문 `COIL_ID`·`PROD_DT`·[+ FILLER] 29 → [저장] → `버전·영향도` 탭 → `편집` 탭에서 FILLER 행 길이 25 → [+ 항목 추가] `EXIT_COIL_THK`(0 채움 왼쪽 0, 암묵 소수점 사용, 표현 자리수 4) → [저장] → `버전·영향도` 탭 → [JSON 내려받기] → [엑셀 내려받기] | 픽스처: `version-list-empty` "저장된 버전이 없습니다". 첫 저장 뒤 `version-list` 1행 "최초 등록" 187 `-`. 둘째 저장 뒤 2행 — 첫 행 버전 2·"순차 전환"·187·변경에 `여분 29 → 여분 25 + 출측 코일 두께 4 (여분 쪼개 쓰기)`, 둘째 행 버전 1. JSON 파일 이름 `layout-<id>-v2.json`, 내용 `layoutVersion 2`·`totalLength 187`·본문 4번째 `columnPhys "EXIT_COIL_THK"`·`offset 183`·`length 4`·`numFormat.impliedScale 1`·`scale 1`. 엑셀 파일 이름이 `layout-<id>-v2.xlsx` | **넷2(서버 데이터 목록·빈 상태)·넷3(등록·수정 반영)**·**AC6(화면)** · `dmb-layoutMng-version-empty.png`, `dmb-layoutMng-version.png` |
| L12 | `"L12 컬럼·도메인 변경 영향 전문 목록"` — `버전·영향도` 탭 → `impact-keyword` `EXIT_COIL_THK` [조회] → `COIL_THK`(도메인 표준명) [조회] → `없음-${STAMP}` [조회] | 첫 조회 `impact-list` 에 `출측검사 실적 수신(E2E)`·`L2 → MES`·`158 / 4` 가 있는 행. 둘째 조회도 그 행이 있다(도메인 → 컬럼 → 전문). 셋째 `impact-list-empty` "찾은 컬럼·도메인이 없습니다" | 넷2 · 요구 "컬럼·도메인 변경 영향 전문 목록" · `dmb-layoutMng-impact.png` |

화면이 붙일 `data-testid`(Build 는 이 이름을 그대로 쓴다): 탭 `layout-tab-edit`, `layout-tab-check`, `layout-tab-version` / 검증 `layout-check-run`, `layout-check-table`, `layout-check-result-{1..7}`, `layout-check-message-{1..7}`, `layout-check-other` / 샘플 `sample-input-{COLUMN_PHYS}`, `sample-render`, `sample-ruler`, `sample-line`, `sample-seg-{index}`(속성 `data-zone`, `title`), `sample-length`, `sample-segments`, `sample-parsed-{COLUMN_PHYS}`, `sample-errors` / 버전 `version-list`, `version-list-empty`, `change-class-table`, `snapshot-preview`, `snapshot-download-json`, `snapshot-download-excel` / 영향도 `impact-keyword`, `impact-search`, `impact-list`, `impact-list-empty`. 기존 testid(05-02 §3.5)는 하나도 바꾸지 않는다.

**엑셀 내려받기 위험**: `exportToExcel` 은 리포 사용처가 0건이고 `xlsx` 가 호스트(m-mcm)에서 해석되는지는 L11 이 처음 증명한다. 실패하면 Build 는 m-mdm `package.json` 에 `xlsx ^0.18.5`(m-mcm 과 같은 버전)를 더하고 `snapshot-export.ts` 가 `await import("xlsx")` 로 직접 `writeFile` 하도록 바꾼 뒤 그 이탈을 이 문서 「Build 이탈」 에 적는다(tsup external 에 `xlsx` 추가 포함).

### 3.7 E2E 실행 절차 (명령 줄 확정 — 오케스트레이터 기준선·Build·Verify 공통)

서버 규칙은 dev-discipline 「서버 프로세스」·「무거운 명령 줄 세우기」. **`be-run.sh`·`fe-run.sh` 금지, 전역 `gradlew --stop` 금지, 이름 기반 `pkill`·`killall`·`pgrep -f` 종료 금지, 남의 포트(5100·8100·8096·18521·18596·15521 등) 점유 프로세스 종료 금지. gradle 은 항상 `--no-daemon`.** 포트는 설계 시점(2026-09-24)에 `lsof -iTCP:<p> -sTCP:LISTEN` 출력이 없음을 확인한 18533·18598·15533 이다(05-02 의 18521·18596·15521 과 겹치지 않는다). 기동 직전 다시 확인하고, 차 있으면 다른 빈 번호로 바꾼다. **이 절차는 새 픽스처·새 환경변수에 기대지 않는다** — Design 커밋 시점(새 코드 없음)에도 그대로 돌고, 그때는 layoutMng 스펙이 L1~L8 만 돈다.

```bash
W=/Users/jji/project/dmes-standard/dflow-975c6c21
SP=<자기 scratchpad 폴더 — 워크트리 밖 절대경로>
J=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
BE_MCM=18533; BE_MDM=18598; FE=15533
# 0) 빈 포트 확인 — 세 줄 모두 출력이 없어야 한다(있으면 다른 번호)
lsof -iTCP:$BE_MCM -sTCP:LISTEN; lsof -iTCP:$BE_MDM -sTCP:LISTEN; lsof -iTCP:$FE -sTCP:LISTEN
# 1) PC 전역 슬롯 — HEAVY_ACQUIRED 확인, HEAVY_BUSY 면 같은 명령을 다시 부른다
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh acquire e2e-TSK-05-03
# 2) 격리 DB — 워크트리 로컬. 옛 파일은 지우지 않고 scratchpad 로 옮긴다(없으면 메인 체크아웃 DB 를 잡는다)
mkdir -p $W/src/backend/data
for f in mcm mdm; do [ -f $W/src/backend/data/$f.db ] && mv $W/src/backend/data/$f.db $SP/$f.db.$(date +%s); done
# 3) mcm 백엔드(로그인·메뉴·RBAC 시드)
cd $W/src/backend/mcm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args="--spring.profiles.active=local --server.port=$BE_MCM --mcm.bff.invalidate-role-url=http://127.0.0.1:$FE/api/mcm/internal/cache/invalidate-role --cactus.notify.publish-url=http://127.0.0.1:$BE_MCM/notify/publish" > $SP/be-mcm.log 2>&1 &
echo $! > $SP/be-mcm.pid
# 4) mdm 백엔드 — SQLite ../data/mdm.db = $W/src/backend/data/mdm.db (V12 는 여기서 새 DB 에 적용된다)
cd $W/src/backend/mdm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args="--spring.profiles.active=local --server.port=$BE_MDM" > $SP/be-mdm.log 2>&1 &
echo $! > $SP/be-mdm.pid
# 5) 두 로그에 "Started … in" 이 찍힐 때까지 기다린다(Monitor 또는 짧은 간격 재확인 — 포그라운드 sleep 금지).
#    두 로그의 SQLite 경로가 $W/src/backend/data 인지 확인(아니면 즉시 중단·정리).
#    mcm 시드 대조(기대 파일과 diff 없음) 뒤 시험 사용자
cd $W/src/frontend && sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-seed-check.sql | diff - e2e/fixtures/mdm-rbac-seed-check.expected.txt
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-users.sql
sqlite3 $W/src/backend/data/mcm.db "SELECT ROLE_ID, OBJECT_ID, PERMISSION_ID FROM TB_MCM_SEC_ROLE_MAPPING WHERE OBJECT_ID IN ('headerMng','layoutMng') ORDER BY OBJECT_ID, ROLE_ID;"
#    기대: MDM_STD_ADMIN|…|PERM_MDM_EDIT / MDM_STEWARD|…|PERM_MDM_READ / SYSADMIN|…|PERM_ALL × 2 (05-02 시드 — 이 작업은 바꾸지 않는다)
#    컬럼 사전 스펙 픽스처는 mdm 기동 뒤에 넣는다(m201 픽스처는 layoutMng·headerMng 스펙의 beforeAll 이 넣는다)
sqlite3 $W/src/backend/data/mdm.db < e2e/fixtures/mdm-columnMng-dict.sql
# 6) 포털 — shared·m-mdm 을 먼저 빌드, 레지스트리는 커밋된 것을 쓴다
cd $W/src/frontend && pnpm build:libs
cd $W/src/frontend/m-mcm && AUTH_SECRET=$(openssl rand -hex 32) NEXTAUTH_URL=http://127.0.0.1:$FE OIDC_ISSUER=http://127.0.0.1:$FE \
  MCM_WAS_URL=http://127.0.0.1:$BE_MCM MDM_WAS_URL=http://127.0.0.1:$BE_MDM BACKEND_API_URL=http://127.0.0.1:$BE_MCM \
  BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026 pnpm exec next dev --turbopack --port $FE > $SP/fe.log 2>&1 &
echo $! > $SP/fe.pid
# 7) E2E — mdm 스펙 전부, 반드시 자기 포털, workers 1(파일 이름순). 한 호출이 10분을 넘을 것 같으면 7a→7b→7c 로 나눠 **같은 새 DB 에서 이 순서대로** 잇는다
E2E_ENV="SMOKE_MCM_BASE_URL=http://127.0.0.1:$FE SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 SMOKE_MDM_DB=$W/src/backend/data/mdm.db"
cd $W/src/frontend && env $E2E_ENV pnpm exec playwright test e2e/mdm-*.spec.ts --workers=1
#   나눠 돌릴 때(합치면 위 한 줄과 같은 파일·같은 순서다):
cd $W/src/frontend && env $E2E_ENV pnpm exec playwright test e2e/mdm-columnMng.spec.ts e2e/mdm-domainMng.spec.ts e2e/mdm-headerMng.spec.ts --workers=1   # 7a
cd $W/src/frontend && env $E2E_ENV pnpm exec playwright test e2e/mdm-layoutMng.spec.ts --workers=1                                                        # 7b
cd $W/src/frontend && env $E2E_ENV pnpm exec playwright test e2e/mdm-sample-smoke.spec.ts e2e/mdm-shell-rbac-smoke.spec.ts e2e/mdm-termMng.spec.ts e2e/mdm-unitMng.spec.ts --workers=1   # 7c
# 8) 정리 — 성공·실패·중단과 무관하게. 기록한 PID 먼저, 남은 자식은 자기가 고른 포트의 리스너만
kill $(cat $SP/fe.pid) $(cat $SP/be-mdm.pid) $(cat $SP/be-mcm.pid)
for p in $FE $BE_MDM $BE_MCM; do pid=$(lsof -tiTCP:$p -sTCP:LISTEN); [ -n "$pid" ] && kill $pid; done
cd $W && .claude/skills/dflow-dev/scripts/heavy.sh release
# 9) 기존 스펙이 덮어쓴 추적 파일 되돌리기(이 작업 산출물 아님). TSK-05-03 스크린샷만 커밋한다
cd $W && /usr/bin/git checkout -- docs/mdm/tasks/TSK-01-02/screens/dma-mdmSample.png docs/mdm/tasks/TSK-01-03/screens docs/mdm/tasks/TSK-04-02/screens docs/mdm/tasks/TSK-04-03/screens docs/mdm/tasks/TSK-04-04/screens docs/mdm/tasks/TSK-05-02/screens src/frontend/m-mcm/next-env.d.ts
/usr/bin/git status --short   # 남의 screens 폴더에 새 추적 밖 파일이나 src/frontend/test-results/** 변경이 남으면 /usr/bin/git restore 로 되돌리고, 지울 파일이 있으면 보고에 올린다
```

- **오케스트레이터가 E2E 기준선을 잴 줄은 7)** 이다(1~6 으로 서버를 띄운 뒤). `mdm-columnMng-dict.sql` 은 이 기점에 늘 있다(05-02 §3.7 의 조건부 `if [ -f … ]` 를 뺐다). 같은 DB 로 7) 을 다시 돌리려면 2)~5) 를 다시 한다(스펙들이 행을 만들고, 컬럼 사전 스펙 E1 은 빈 사전이 전제다).
- mdm 백엔드 코드를 바꾸면 mdm 만 다시 띄우되 mdm.db 를 다시 옮기고 5) 의 컬럼 사전 픽스처를 다시 넣는다.
- 통과 기준: 7)(또는 7a~7c 합)이 failed·skipped 0. 거짓 통과 방지 증거 넷을 보고에 붙인다 — ① 두 백엔드 로그의 SQLite 경로가 워크트리 쪽 ② `be-mdm.log` 에 `/oasis/layoutMng/validate`·`/execute`·`/export` 요청이 찍힘 ③ `sqlite3 $W/src/backend/data/mdm.db "SELECT l.LAYOUT_NAME, v.LAYOUT_VERSION, v.SWITCH_MODE, v.TOTAL_LENGTH FROM TB_MDM_LAYOUT_VER v JOIN TB_MDM_LAYOUT l ON l.LAYOUT_ID = v.LAYOUT_ID WHERE l.LAYOUT_NAME LIKE '버전 %' ORDER BY v.LAYOUT_VERSION"` 에 L11 의 `버전 <STAMP>|1||187`, `버전 <STAMP>|2|SEQUENTIAL|187` ④ `ls docs/mdm/tasks/TSK-05-03/screens` 에 §3.6 의 7장.

---

## 4. 수용 기준 매핑

| spec 수용 기준 | 검증 방법 · 테스트 이름 |
|---|---|
| 1. 3.5 mm → `0035` 등 03 예시 왕복(직렬화→파싱) 일치 | 순수: `LayoutFieldCodecTest.암묵_소수점_예시_값을_03_표대로_직렬화한다`·`…파싱한다`(03·html 표 3.5/0.1/12.4), `LayoutSerializerRoundTripTest.03_예시_값_왕복이_일치한다`(전문 전체 왕복), `…M201_예시를_187바이트_한_줄로_직렬화한다`, `…M201_직렬화한_전문을_같은_스냅샷으로_파싱하면_값이_같다`, 단위 경계 `…전송_단위_항목은_…`·`…단위_항목이_가리키는_…`. 서버: `LayoutSampleSqliteTest.execute_는_M201_을_EUC_KR_187바이트_한_줄로_렌더한다`·`…파싱_결과를_함께_돌려준다`. 화면: E2E L9(`0035`, 파싱 3.5) |
| 2. 직렬화와 파싱이 같은 스냅샷 버전으로 동작 | 구조: `LayoutCodecArchitectureTest.직렬화기_파서는_스냅샷과_java_만_의존한다`(라이브 행을 읽을 경로가 없다). 통합: `LayoutVersionSqliteTest.옛_버전_스냅샷으로_직렬화하고_파싱하면_레이아웃을_바꾼_뒤에도_일치한다`, `…저장된_스냅샷_JSON_의_키는_스키마와_같다`, `LayoutSnapshotJsonTest.쓰고_읽으면_같은_스냅샷이다`. **한계**: 단위 환산 계수는 스냅샷 밖(TB_MDM_UNIT)이다(D9) |
| 3. 거부 7종 각각 서버 테스트 | `LayoutRegistrationSqliteTest` 의 7개(03 원문 순서): `거부_1_…_L01`, `거부_2_CONST_값이_도메인_유효_식을_위반하면_L12`, `거부_3_…_L13`, `거부_4_…_L14`, `거부_5_…_L02`, `거부_6_…_L05`, `거부_7_…_L15`. 표 배정: `LayoutCheckTableTest` 3개, `…validate_는_거부_4_를_4번_행에_싣는다`. 순수 경계: `LayoutRegistrationRulesTest`. HTTP: `LayoutOasisFlowTest.validate_는_HTTP_로_7행_표를_돌려준다`. 화면: E2E L9(7행 통과)·L10(4번 거부) |
| 4. CONST 값은 도메인 유효 식으로 검증 | `LayoutRegistrationSqliteTest.거부_2_CONST_값이_도메인_유효_식을_위반하면_L12`(표준식 `value <= 1`, 실제 `DomainTestCaseRunner` 경유), `…거부_2_CONST_값이_도메인_타입이_아니면_L12`, `…거부_2_헤더_상수_재정의_값도_유효_식으로_검사한다`, `…거부_2_헤더_저장도_CONST_기본값을_유효_식으로_검사한다`, `…CONST_값이_유효하면_저장된다`(양성 대조), 순수 `LayoutRegistrationRulesTest.거부_2_*` 4개 |
| 5. 포털 메뉴에서 화면이 열리고 e2e `mdm-layoutMng.spec.ts` 통과 | §3.7 7) 에서 L1~L12 전부 통과(기존 L1~L8 + 새 L9~L12). 메뉴 이동은 L1 과 새 test 마다 `openScreen` |
| 6. FILLER 분할 추가는 총 길이 불변·순차 전환으로 분류 | 순수: `LayoutChangeClassifierTest.여분을_쪼개_항목을_추가하면_총_길이_불변_순차_전환이다`(html v2 요약 문구 그대로)·`…여분_뒤쪽에_항목을_두어도_…`, 대조군(동시 전환) 8개. 서버: `LayoutVersionSqliteTest.여분을_쪼개_항목을_추가하면_버전_2_순차_전환이다`. 화면: E2E L11 |
| (스모크 넷 1 메뉴 이동) | L1(기존), L9~L12 의 `openScreen` |
| (스모크 넷 2 목록 서버 데이터·빈 상태) | L11(픽스처 전문 `version-list-empty` → 저장 뒤 서버 이력 2행), L12(서버 영향 목록 + `impact-list-empty`) |
| (스모크 넷 3 등록·수정 한 번이 화면 조작만으로 → 목록 반영) | L11(두 번 저장 → 버전 이력에 v1·v2) |
| (스모크 넷 4 서버 오류가 화면에 보임) | L10(L14 거부가 검증 표와 `.error-modal__body` 에) |
| (요구) 인코딩 바이트 길이·패딩·AUTO 채움 | `LayoutFieldCodecTest.EUC_KR_한글은_2바이트_UTF_8_은_3바이트로_센다`, `LayoutSerializerRoundTripTest.한글_값이_있어도_다음_항목의_바이트_오프셋은_그대로다`·`…AUTO_는_…`, `LayoutSampleSqliteTest.execute_는_한글_값을_인코딩_바이트로_센다`, E2E L9 둘째 렌더 |
| (요구) 수신 파싱 → 단위 역변환(받는 쪽 검증 없음) | `LayoutSerializerRoundTripTest.파싱은_받은_값을_그대로_돌려주고_검증하지_않는다`, `…전송_단위_…`·`…단위_항목_…` |
| (요구) 스냅샷 JSON·엑셀 내려받기 | `LayoutVersionSqliteTest.export_*`, vitest `snapshot-export.test.ts`, E2E L11 |
| (요구) 컬럼·도메인 변경 영향 전문 목록 | `LayoutImpactSqliteTest` 5개, E2E L12 |
| (요구) 저장 즉시 스냅샷 버전 생성 | `LayoutVersionSqliteTest.처음_저장하면_…`·`같은_내용으로_…`·`헤더를_바꾸면_…` |

도커 금지로 확인하지 못하는 수용 기준은 없다(아래 절). MSSQL 에서 V12 가 적용되는지와 `ISJSON` 제약은 머지 뒤 팀장 방언 검증이 확인한다 — 수용 기준 6개는 모두 SQLite 통합·순수 단위·vitest·E2E 로 확인한다.

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것 (규칙 · 변이 · 빨개지는 테스트)

| # | 규칙 | 변이(일부러 넣는 틀린 구현) | 빨개지는 테스트 |
|---|---|---|---|
| I1 | **03 예시 값**: 숫자 3,1·암묵 소수 1·폭 4·왼쪽 0·부호 없음에서 3.5→`0035`, 0.1→`0001`, 12.4→`0124`, 역방향 같음. M201 한 줄은 187바이트, COIL_THK 는 바이트 158~161 | ① 소수를 버림(3.5→`0003`) ② 오른쪽 0 채움(`3500`) ③ 스케일 대신 폭으로 나눔 | `LayoutFieldCodecTest.암묵_소수점_예시_값을_03_표대로_*` 2개, `LayoutSerializerRoundTripTest.03_예시_값_왕복이_일치한다`, `…M201_예시를_187바이트_…`, E2E L9 |
| I2 | **바이트 길이는 스냅샷 `encoding` 으로 센다**(EUC-KR 한글 2, UTF-8 3). 항목 길이·패딩·오프셋·렌더 구간은 모두 바이트다. `encoding` 이 null 이면 UTF-8 | ① `String.length()` 로 패딩 ② 인코딩을 늘 UTF-8 로 ③ 렌더 오프셋을 문자 위치로 | `LayoutFieldCodecTest.EUC_KR_한글은_2바이트_…`, `LayoutSerializerRoundTripTest.한글_값이_있어도_…`, `LayoutSampleSqliteTest.execute_는_한글_값을_…`, E2E L9 둘째 렌더 |
| I3 | **패딩**: CHAR 는 오른쪽 공백(0x20), NUM 은 zeroPad 면 왼쪽 `0` 아니면 왼쪽 공백, FILLER 는 공백, null 값은 칸 전체 공백. numFormat 이 없는 NUM 항목의 형식 = `(sign=N, zero=Y, impliedScale=도메인 소수, 폭=길이)`(03:59) | 문자 왼쪽 공백 / 숫자 기본 형식을 공백 채움으로 | `…문자는_오른쪽_공백_숫자는_왼쪽_0으로_채운다`, `…0_채움이_아니면_…`, `…빈_값은_공백으로_…`, `…AUTO_는_…`(SNT_ORD `00001`) |
| I4 | **암묵 소수점·소수점 문자**: impliedScale>0 이면 `value × 10^impliedScale` 의 정수 자리만 쓴다(반올림 HALF_UP). impliedScale=0 이고 도메인 소수>0 이면 도메인 소수 자리까지 `.` 과 함께 쓴다 | 소수점 문자 모드에서 스케일을 무시 | `…소수점_문자_형식은_도메인_소수_자리까지_쓴다` |
| I5 | **부호**: SIGN=Y 면 첫 바이트가 `+`/`-`, SIGN=N 인데 음수면 오류 | 음수를 절댓값으로 조용히 씀 | `…부호_자리가_있으면_…`, `…부호_자리가_없는데_음수면_오류다` |
| I6 | **넘침·담지 못하는 문자는 잘라내거나 `?` 로 바꾸지 않고 `LayoutCodecException`**(D10). 렌더(`execute`)는 그 항목을 `errors` 로 보이고 칸을 `#` 로 채운다 | html 처럼 `slice` / `String.getBytes`(대체 문자) | `…자리가_넘치면_잘라내지_않고_오류다`, `…인코딩이_담지_못하는_문자는_오류다`, `LayoutSampleSqliteTest.execute_는_넘치는_값을_항목_오류로_…` |
| I7 | **AUTO 채움**: SEND_TIME = 문맥 `sendTime` 을 길이 14/8/6 형식으로(그 밖 오류), MSG_LENGTH = `snapshot.totalLength`(어느 헤더에 있든 전문 전체, D5), SEQ = 문맥 `seq`, LAYOUT_ID = `snapshot.layoutId`. 수치 AUTO 는 왼쪽 0 | ① MSG_LENGTH 를 그 헤더 이후만 셈(`00087`) ② SEQ 를 0부터 | `LayoutSerializerRoundTripTest.AUTO_는_…`, `…SEND_TIME_은_…`, `…M201_예시를_187바이트_…`(94~99 `000187`) |
| I8 | **단위 경계 변환**: 송신 = 기준 → 전송 `value × base.factor ÷ trans.factor`, 수신 = 역, `MathContext(34,HALF_UP)` 뒤 형식 소수 자리로 HALF_UP. 차원이 다르면 오류. 계수는 TB_MDM_UNIT | 계수 곱·나눗셈 뒤바꿈 / 수신에서 역변환 생략 | `LayoutUnitConverterTest` 4개, `…전송_단위_항목은_…` |
| I9 | **unit_item**: 송신은 record 의 그 단위 항목 값(비면 기준 단위)으로 기준 → 그 단위, 수신은 파싱한 단위 값으로 → 기준(D9) | 수신 환산 생략 | `…단위_항목이_가리키는_단위로_…` |
| I10 | **파서는 검증하지 않는다**: 도메인 유효 식·제약·CONST 기대값을 보지 않고 받은 값을 돌려준다. 구조 오류(길이 ≠ 총 길이, 숫자 칸의 비숫자)만 예외(F7) | 파싱에서 CONST 가 스냅샷 값과 다르면 거부 | `…파싱은_받은_값을_그대로_돌려주고_검증하지_않는다`, `…전문_길이가_총_길이와_다르면_…` |
| I11 | **직렬화기·파서의 입력은 스냅샷(버전)뿐이다**: `dmb.layout.codec` 은 `java.*`·`contract.layout`·자기 패키지만 의존. 저장된 옛 버전 스냅샷으로 레이아웃을 바꾼 뒤에도 왕복이 일치한다 | codec 이 `LayoutQueries`·엔티티로 현재 항목을 읽음 | `LayoutCodecArchitectureTest` 2개, `LayoutVersionSqliteTest.옛_버전_스냅샷으로_…` |
| I12 | **거부 7종 ↔ 코드·표 행**: #1 L01, #2 L12, #3 L13, #4 L14, #5 L02(FILLER 가 아닌 항목의 `FILLER_LENGTH` 만), #6 L05, #7 L15. 나머지 L 이슈는 `otherIssues`. 저장은 쓰기 전에 거부하고 아무것도 쓰지 않는다 | ① 5번 행이 모든 L02 를 셈 ② L14 를 경고로 ③ 검사를 쓰기 뒤로 | `LayoutCheckTableTest` 4개, `LayoutRegistrationSqliteTest.거부_*` 7개(행·버전 0건 단언), `…validate_는_거부_4_를_…` |
| I13 | **#4 필요 자리수 = (p − s) + 전송 단위 증가 자리 + s + (소수점 문자 1) + (부호 1)**. 전송 단위 증가 = `base.factor ÷ trans.factor` 가 1 초과면 `⌈log10(비)⌉`, 아니면 0. 폭 = WIDTH, 형식이 없으면 도메인 길이. 문구 `"표현 자리 {w}는 도메인 {이름}(숫자 {p},{s})를 담지 못합니다"`(D8) | 부호·소수점 문자·전송 단위 항 중 하나 빼기 | `LayoutRegistrationRulesTest.거부_4_필요_자리수는_…`(표 6행), `…숫자_형식이_없는_…`, `…표현_자리_2는_…` |
| I14 | **#2 범위**: 본문 CONST 기본값, 헤더 CONST 기본값(헤더 저장), 전문 상수 재정의 값을 ① 도메인 타입 변환 ② 표준식(`DomainTestCaseRunner`) ③ 인코딩 바이트 길이 ≤ 항목 길이로 검사한다. 판정 불가(UNDECIDED)는 경고(2번 행 WARN)이고 저장을 막지 않는다. 비즈니스식은 보지 않는다(D6) | ① 재정의 값 검사 생략 ② UNDECIDED 를 거부로 ③ 표준식 대신 늘 통과 | `LayoutRegistrationSqliteTest.거부_2_*` 4개 + `CONST_값이_유효하면_저장된다`, `LayoutRegistrationRulesTest.거부_2_판정_불가는_…` |
| I15 | **버전**: 레이아웃을 저장해 스냅샷(버전 번호 제외)이 바뀌면 새 버전 = max(최신 이력, `TB_MDM_LAYOUT.VERSION`) + 1, 같으면 만들지 않는다. 최초 = 1. `TB_MDM_LAYOUT.VERSION` = 최신 이력 번호. 저장된 스냅샷 JSON 의 `layoutVersion` = 행 번호. JSON 은 정규화(키 정렬·공백 없음) | ① 저장마다 +1 ② 비교에 버전 번호를 넣어 늘 다름 ③ 정렬 없이 저장 | `LayoutVersionSqliteTest.처음_저장하면_…`·`같은_내용으로_…`, `LayoutMngServiceSqliteTest.같은_내용을_두_번_저장해도_버전은_1이다`, `LayoutSnapshotJsonTest.키를_정렬하고_…` |
| I16 | **save 응답의 `ver` 는 마지막 감사 VER** — 버전을 올리려 `TB_MDM_LAYOUT` 을 다시 저장한 뒤의 값이다 | 버전 기록 전 `ver` 를 응답 | `LayoutVersionSqliteTest.저장_응답의_ver_로_다시_저장하면_MDM001_이_나지_않는다`, E2E L11(두 번째 저장이 MDM001 없이 성공) |
| I17 | **변경 분류**(html 표 + D11): 이전 없음 → `null`/최초 등록. 새 항목이 모두 이전 FILLER 구간 안이고 총 길이·기존 항목 오프셋·길이·형식 불변 → `SEQUENTIAL`(FILLER_SPLIT). CONST 값만 → `SEQUENTIAL`. 기본 속성(이름·시스템)만 → `SEQUENTIAL`. 항목 길이·순서·헤더 구성·형식(타입·숫자 형식·단위·컬럼·fill_kind·인코딩)·삽입·삭제·총 길이 변경 → `SIMULTANEOUS` | ① FILLER_SPLIT 을 동시로 ② 총 길이만 보고 판정(길이 불변 순서 변경을 순차로) | `LayoutChangeClassifierTest` 13개, `LayoutVersionSqliteTest.여분을_쪼개_…`·`항목_길이를_…`, E2E L11 |
| I18 | **헤더 저장 → 그 헤더를 쌓은 전문마다 같은 규칙으로 버전 기록**(05-02 재계산 뒤, 같은 action) | 헤더 저장에서 버전 기록 생략 | `LayoutVersionSqliteTest.헤더를_바꾸면_…`·`헤더_상수_기본값만_…`, `HeaderMngServiceSqliteTest.헤더_길이가_바뀌면_…`(VERSION 2) |
| I19 | **초안 스냅샷 = 저장 뒤 스냅샷**(validate·execute 가 보는 것과 save 가 쓰는 것이 같다). 검사 단계는 `LayoutDraftBuilder` 한 곳 | validate 만 다른 길이 계산 | `LayoutVersionSqliteTest.초안_스냅샷은_저장_뒤_스냅샷과_같다` |
| I20 | **validate·execute·export·search 는 DB 를 바꾸지 않는다** | execute 에서 버전 기록 | `…validate_는_7행_표를_돌려주고_아무것도_쓰지_않는다`, `…execute_는_아무것도_쓰지_않는다` |
| I21 | **영향 목록**: 키워드가 컬럼 표준 물리명이면 그 컬럼, 도메인 표준명·이름이면 하위 트리의 모든 컬럼. 컬럼마다 쓰는 전문·헤더 행(헤더는 사용 전문 수), 안 쓰는 컬럼은 "레이아웃에서 쓰지 않는다" 한 줄. 같은 조회가 `MdmDomainReferenceSpi(LAYOUT_ITEM)` 를 채운다 | 하위 도메인 무시 / 안 쓰는 컬럼 생략 | `LayoutImpactSqliteTest` 5개, E2E L12 |
| I22 | **스냅샷 계약 = record·스키마·샘플 세 곳의 키 집합 일치**, `unitCode`·`scale` 은 도메인 파생값 | 세 곳 중 한 곳만 고침 | `LayoutSnapshotSchemaStructureTest`(기존), `LayoutSnapshotJsonTest.JSON_키_집합은_스키마와_같다` |
| I23 | **액션은 search·view·save·validate·execute·export 여섯**(모두 `MdmActions` 안, 새 RBAC 시드 없음). 기존 세 액션의 요청·응답 키는 추가만 | 새 액션 이름(`render`) | `LayoutOasisFlowTest` 새 4개(BPMN 분기), E2E L9~L11(권한 밖이면 BFF 403) |
| I24 | **05-02 불변 I1~I16·I18~I23 은 그대로다**(I17 "VERSION 을 올리지 않는다"만 이 작업의 I15 로 대체, D4). `dmb..` 에 `@Transactional` 없음, 네이티브 SQL 추가 없음, 쓰기는 `save`·`saveAndFlush` 명시 | 새 서비스에 `@Transactional` / 버전 행을 setter 만으로 | 05-02 테스트 전부(`LayoutStaticGuardTest` 포함), `MdmLayoutVersionMigrationTest.엔티티로_저장하고_읽으면_같다` |

---

## 6. 결정 상세

### 6.1 API (행 키 UPPER_SNAKE, 05-02 §6.1 에 추가)

| action | 요청 | 응답(`data.result`) |
|---|---|---|
| search(추가) | params `target=IMPACT`, `keyword` | `impacts[{COLUMN_PHYS, COLUMN_NAME, DOMAIN_NAME, LAYOUT_ID, LAYOUT_NAME, LAYOUT_KIND, SEQ, ITEM("3 코일 두께 (158 / 4)"), SND_RCV("L2 → MES"), USED_BY_COUNT(헤더만), IMPACT}]` |
| view(추가 키) | 그대로 | `versions[{LAYOUT_VERSION, SAVED_AT("yyyy-MM-dd HH:mm" KST), SAVED_BY, TOTAL_LENGTH, SWITCH_MODE, CHANGE_KINDS, CHANGE_SUMMARY}]`(최신부터) |
| save(추가 키) | 그대로 | `layoutVersion, versionCreated, switchMode, changeSummary`. `ver` = 마지막 감사 VER(I16) |
| **validate**(새) | params = save 와 같음(`LayoutMngSaveRequest`), grids `headers`·`consts`·`items` | `checks[{NO, CONDITION, CODE, RESULT(PASS/FAIL/WARN), MESSAGES[]}]`(7행), `otherIssues[{CODE, SEQ, FIELD, MESSAGE}]`, `passed` |
| **execute**(새) | params `LayoutMngExecuteRequest`(save 칸 + `sendTime?`, `seq?`), grids `headers`·`consts`·`items`·`samples[{COLUMN_PHYS, VALUE}]` | `encoding, totalBytes, line(디코드한 한 줄), segments[{INDEX, ZONE(HEADER/BODY), HEADER_SEQ, ZONE_LABEL, SEQ, NAME, COLUMN_PHYS, FILL_KIND, OFFSET, LENGTH, POSITION, TEXT}], parsed[{COLUMN_PHYS, NAME, VALUE}], errors[{SEQ, COLUMN_PHYS, MESSAGE}], issues[…]`(초안 이슈가 있으면 segments 없음) |
| **export**(새) | params `layoutId`, `layoutVersion?` | `layoutId, layoutVersion, fileBase("layout-{id}-v{n}"), snapshot(Map), names{COLUMN_PHYS: 표시명}`. 버전이 없으면 거부 "저장된 버전이 없습니다"(L11 모양) |

headerMng.save 응답에 `versioned[{LAYOUT_ID, LAYOUT_VERSION, SWITCH_MODE, CREATED}]` 가 더해진다(화면은 쓰지 않는다 — 기존 확인 창 그대로).

### 6.2 등록 검증 7종 (`LayoutRegistrationRules` + 05-02 `LayoutItemRules`)

| 행 | 03 거부 조건 | 코드 | 판정 | 대상 |
|---|---|---|---|---|
| 1 | 본문 항목의 컬럼이 컬럼 사전에 없음 | L01(05-02) | DATA·CONST·AUTO 의 `COLUMN_PHYS` 가 사전에 없다 | 헤더·본문 항목 |
| 2 | CONST 값이 도메인 유효 식 위반 | **L12** | `LayoutConstJudge`: 타입 변환 실패·표준식 false/ERROR·인코딩 바이트 > 항목 길이 → FAIL, UNDECIDED → WARN | 본문 CONST `DEFAULT_VALUE`, 헤더 CONST `DEFAULT_VALUE`(헤더 저장), 전문 `consts[].CONST_VALUE`(대상 헤더 항목 기준) |
| 3 | 전송 단위의 차원 불일치 | **L13** | `TRANS_UNIT` 이 단위 마스터에 없다 / 도메인 기준 단위가 없다 / 두 단위의 `DIMENSION` 이 다르다 | DATA·CONST |
| 4 | 숫자 표현 자리 부족 | **L14** | 도메인 NUMBER 항목의 폭(WIDTH, 없으면 도메인 길이) < I13 의 필요 자리수 | DATA·CONST·AUTO 의 NUMBER 도메인 |
| 5 | FILLER 가 아닌 항목에 길이 직접 입력 | L02(05-02, field `FILLER_LENGTH` 만) | F10 행렬의 CLOSED 칸 | FILLER 가 아닌 항목 |
| 6 | trans_unit 과 unit_item 동시 입력 | L05(05-02) | 둘 다 값 | 전 항목 |
| 7 | unit_item 이 같은 레이아웃의 항목을 가리키지 않음 | **L15** | `UNIT_ITEM` 이 같은 목록(헤더 저장이면 그 헤더 항목, 전문 저장이면 본문 항목)의 **다른** 항목 `COLUMN_PHYS` 가 아니다 | DATA·CONST |

- 저장 경로의 검사 순서: 05-02 ①~⑤(L11·L09·L10·L01~L08) → L12~L15. 이슈를 **모두 모은 뒤** 하나라도 있으면 쓰기 전에 `LayoutRejections.reject(prefix, issues)`(message `접두어 + "L14[3] …; L12[…] …"`). 경고(WARN)는 저장을 막지 않는다.
- 인코딩(바이트 길이 검사용): 전문은 `eaiCode` 의 EAI 인코딩, 헤더는 요청의 `encoding`(없으면 그 헤더를 표준 헤더로 가리키는 EAI 의 인코딩), 모두 없으면 UTF-8.
- 7종 문구(`LayoutCheckTable.CONDITIONS`)는 F1 의 원문 문장을 그대로 쓴다.

### 6.3 직렬화·파싱 (`dmb.layout.codec`)

**serialize(snapshot, record, ctx)**: ① `Charset cs = forName(encoding ?? "UTF-8")` ② `LayoutSegments.of(snapshot)` 순서대로 칸마다 바이트를 만든다 ③ 칸 값: DATA = `record.get(COLUMN_PHYS)`, CONST = 헤더면 `overrideValue ?? defaultValue`, 본문이면 `defaultValue`, AUTO = I7, FILLER = 공백 ④ NUM 칸(`dataType=NUM` 또는 AUTO 의 MSG_LENGTH·SEQ): 값을 `BigDecimal` 로(Number·String 허용, 아니면 예외) → `unitItem` 이면 record 의 단위 값으로, `transUnit` 이면 전송 단위로 `LayoutUnitConverter.convert(v, unitCode, 목표)` → `encodeNumber` ⑤ CHAR 칸: `String.valueOf`(BigDecimal 은 `toPlainString`) → `encodeChar` ⑥ 결과 길이 = `totalLength`(아니면 예외).

**parse(snapshot, message)**: ① `message.length != totalLength` 면 예외 ② 구간마다 바이트를 잘라 CHAR 는 `decodeChar`(오른쪽 공백만 떼고 비면 null), NUM 은 `decodeNumber` ③ 본문 DATA·CONST·AUTO 만 결과에 넣는다(키 `COLUMN_PHYS`, 순서 SEQ) ④ 둘째 단계에서 `unitItem` 항목은 파싱한 단위 값(비면 기준 단위)에서, `transUnit` 항목은 전송 단위에서 기준 단위로 역변환한 뒤 도메인 소수 자리로 HALF_UP ⑤ 도메인 유효 식·제약·CONST 기대값은 보지 않는다(I10).

**encodeNumber(value, length, spec)**: `bodyWidth = length − (sign?1:0)`. 음수이고 `!sign` 이면 예외. `digits` = impliedScale>0 이면 `|v|.setScale(impliedScale, HALF_UP).unscaledValue()` 의 10진 문자열, pointMode 면 `|v|.setScale(domainScale, HALF_UP).toPlainString()`, 둘 다 아니면 `|v|.setScale(0, HALF_UP).toPlainString()`. `digits.length() > bodyWidth` 면 예외. 채움 = zeroPad ? `0` : 공백(왼쪽). 부호 = `-`/`+` 를 맨 앞(sign 일 때). null → 칸 전체 공백.

**decodeNumber(slice, spec)**: ASCII 로 읽어 전부 공백이면 null. sign 이면 첫 바이트 `+`/`-`. 나머지의 왼쪽 공백을 떼고 `[0-9]+`(pointMode 는 `[0-9]*\.?[0-9]*`)가 아니면 예외. impliedScale>0 이면 `new BigDecimal(new BigInteger(digits), impliedScale)`, 아니면 `new BigDecimal(digits)`.

### 6.4 스냅샷 조립 (`LayoutSnapshotAssembler`)

| 스냅샷 칸 | 값 |
|---|---|
| 최상위 `layoutId`·`layoutName`·`eaiCode`·`sndSystem`·`rcvSystem`·`totalLength` | `TB_MDM_LAYOUT`(초안이면 초안 값, `layoutId` 없으면 0) |
| `encoding`·`padRule` | `eaiCode` 의 `TB_MDM_EAI`(없으면 null) |
| `layoutVersion` | `read` 는 `MdmLayout.layoutVersion`, 저장 직전 비교·초안은 0, 버전 행에 쓸 때 `withVersion(n)` |
| `headers[]` | `TB_MDM_LAYOUT_HEADER` SEQ 순. `offset` = 앞 헤더 `TOTAL_LENGTH` 합, `headerLayoutName`, `totalLength`, `items`(그 헤더 항목, offset 은 헤더 안 상대, `overrideValue` = 이 전문의 `TB_MDM_LAYOUT_CONST`) |
| 항목 `dataType` | FILLER → null, 도메인 `DATA_TYPE=NUMBER` → `NUM`, 그 밖 → `CHAR` |
| 항목 `numFormat` | `LayoutNumFormatCodec.decode(NUM_FORMAT).toContract()`(없으면 null) |
| 항목 `unitCode`·`scale` | 도메인 파생 `LayoutColumnInfo.unitCode`·`scale`(FILLER 는 null) |
| 항목 `offset`·`length`·`seq`·`fillKind`·`columnPhys`·`transUnit`·`unitItem`·`defaultValue`·`fillerLength` | 저장 행 그대로 |

### 6.5 버전 저장 (`V12` · `LayoutVersioner`)

**DDL — SQLite `V12__create_mdm_layout_version.sql`** (MSSQL 은 `LAYOUT_ID BIGINT`, `LAYOUT_VERSION BIGINT`, `SWITCH_MODE VARCHAR(20) COLLATE Latin1_General_100_BIN2`, `CHANGE_KINDS VARCHAR(200) COLLATE Latin1_General_100_BIN2`, `CHANGE_SUMMARY NVARCHAR(1000)`, `SNAPSHOT_JSON NVARCHAR(MAX) NOT NULL CONSTRAINT CK_TB_MDM_LAYOUT_VER_SNAPSHOT_JSON CHECK (ISJSON(SNAPSHOT_JSON) = 1)`, 감사 `C_AT`/`U_AT DATETIME2`, 머리 주석은 V4 모양):

```sql
-- TSK-05-03 — 레이아웃 스냅샷 버전 이력(D2). 저장하면 스냅샷이 바뀔 때마다 한 행. 배포는 보류(PRD §2 규칙 7).
CREATE TABLE TB_MDM_LAYOUT_VER (
    LAYOUT_ID INTEGER NOT NULL,
    LAYOUT_VERSION BIGINT NOT NULL,
    TOTAL_LENGTH INTEGER NOT NULL,
    SWITCH_MODE VARCHAR(20),
    CHANGE_KINDS VARCHAR(200),
    CHANGE_SUMMARY TEXT,
    SNAPSHOT_JSON TEXT NOT NULL CONSTRAINT CK_TB_MDM_LAYOUT_VER_SNAPSHOT_JSON CHECK (json_valid(SNAPSHOT_JSON)),
    C_USR_ID VARCHAR(100), C_AT TIMESTAMP, C_SVC_ID VARCHAR(100), C_PGM_ID VARCHAR(100),
    U_USR_ID VARCHAR(100), U_AT TIMESTAMP, U_SVC_ID VARCHAR(100), U_PGM_ID VARCHAR(100),
    VER BIGINT,
    CONSTRAINT PK_TB_MDM_LAYOUT_VER PRIMARY KEY (LAYOUT_ID, LAYOUT_VERSION),
    CONSTRAINT FK_TB_MDM_LAYOUT_VER_LAYOUT FOREIGN KEY (LAYOUT_ID) REFERENCES TB_MDM_LAYOUT (LAYOUT_ID),
    CONSTRAINT CK_TB_MDM_LAYOUT_VER_SWITCH CHECK (SWITCH_MODE IS NULL OR SWITCH_MODE IN ('SEQUENTIAL','SIMULTANEOUS'))
);
```

예약어 칼럼을 새로 만들지 않는다(`LAYOUT_VERSION`). CASCADE 없음. 저장 일시·저장자는 감사 `C_AT`·`C_USR_ID`(엔티티 `createdAt` Instant → KST 표시, `createdBy`)를 쓴다.

**`LayoutVersioner.record(messageId)`** — save·헤더 저장과 같은 action(트랜잭션) 안에서: ① `next = assembler.read(messageId)`(버전 0) ② `latest = store.latest(messageId)` ③ latest 가 있고 `json(withVersion(next,0)) == json(withVersion(read(latest.json),0))` 이면 `Outcome(false, latest.version, …, layout.ver)` ④ 아니면 `n = max(latest?.version ?? 0, layout.layoutVersion) + 1`, `change = LayoutChangeClassifier.classify(latest 스냅샷 또는 null, next, 표시명)` ⑤ `store.save(new MdmLayoutVer(id, n) + totalLength·switchMode·kinds(쉼표)·summary·json(withVersion(next, n)))` ⑥ `layout.setLayoutVersion(n)` → `layoutRepository.saveAndFlush` ⑦ `Outcome(true, n, change.switchMode, change.summary, layout.getVersion())`.

### 6.6 변경 분류 (`LayoutChangeClassifier`)

1. `prev == null` → `(null, [INITIAL], "최초 등록")`.
2. 기본 속성(`layoutName`·`sndSystem`·`rcvSystem`·`eaiCode`·`padRule`)이 다르면 `META`, `encoding` 이 다르면 `FORMAT`.
3. 헤더 구성: 헤더 id 순서 또는 헤더별 `totalLength`·항목 구조(오프셋·길이·fill_kind·컬럼)가 다르면 `HEADER_STACK`. 헤더 항목의 실효 상수(`overrideValue ?? defaultValue`)만 다르면 `CONST_VALUE`.
4. 본문: 이전의 FILLER 가 아닌 항목을 `COLUMN_PHYS` 로 새 쪽에서 찾는다. 없으면 `ITEM_REMOVED`. 길이가 다르면 `ITEM_LENGTH`. 길이는 같고 절대 오프셋만 다르면 — 이미 `ITEM_LENGTH`·`HEADER_STACK`·`ITEM_INSERT` 가 그 이동을 설명하지 않을 때 `ITEM_ORDER`(순서 비교: 두 쪽 공통 컬럼의 상대 순서가 다르면 `ITEM_ORDER`). `dataType`·`numFormat`·`transUnit`·`unitItem`·`unitCode`·`scale`·`fillKind` 가 다르면 `FORMAT`. CONST 의 `defaultValue` 만 다르면 `CONST_VALUE`.
5. 새로 생긴 FILLER 가 아닌 항목: 이전 FILLER 구간 `[o, o+len)` 안에 완전히 들어가면 `FILLER_SPLIT`, 아니면 `ITEM_INSERT`.
6. `totalLength` 가 다르면 `TOTAL_LENGTH`.
7. 종류가 하나도 없으면(스냅샷이 같다) — 호출자가 이미 버전을 만들지 않으므로 오지 않는다. 방어로 `[META]`.
8. `switchMode` = kinds 중 `ITEM_LENGTH`·`ITEM_ORDER`·`HEADER_STACK`·`FORMAT`·`ITEM_INSERT`·`ITEM_REMOVED`·`TOTAL_LENGTH` 가 하나라도 있으면 `SIMULTANEOUS`, 아니면 `SEQUENTIAL`.
9. 요약(종류 순서대로 `, ` 로 잇는다): FILLER_SPLIT `"여분 {이전 길이} → {그 구간을 채운 새 조각을 오프셋 순으로 '{이름} {길이}'·'여분 {길이}' 를 ' + ' 로} (여분 쪼개 쓰기)"`, CONST_VALUE `"상수 {이름} {이전} → {새}"`, ITEM_LENGTH `"{이름} 길이 {a} → {b}"`, ITEM_ORDER `"항목 순서 변경"`, HEADER_STACK `"헤더 구성 변경"`, FORMAT `"{이름} 형식 변경"`(인코딩이면 `"인코딩 {a} → {b}"`), ITEM_INSERT `"{이름} 추가"`, ITEM_REMOVED `"{이름} 삭제"`, TOTAL_LENGTH `"총 길이 {a} → {b}"`, META `"기본 속성 변경"`. 이름은 `displayName(COLUMN_PHYS)`(서비스는 `LayoutDictionary` 의 표시명 — label_long ?? 논리명, 없으면 물리명).

### 6.7 영향 전문 목록 (`LayoutImpactFinder`)

`search(keyword)`: ① `keyword` 를 대문자로 바꿔 컬럼 표준 물리명과 같은 컬럼이 있으면 그 컬럼 하나 ② 아니면 도메인 `STD_NAME` 또는 `DOMAIN_NAME` 이 같은 도메인마다 `DomainImpactQueries.subtree(domainId)` 의 컬럼 전부 ③ 둘 다 없으면 빈 목록. 컬럼마다 `LayoutQueries.itemsUsingColumns` 행을 만들고(MESSAGE 는 `SND_RCV`, HEADER 는 `USED_BY_COUNT` = 그 헤더를 쌓은 전문 수), 쓰는 곳이 없으면 `LAYOUT_*` 없이 `IMPACT="레이아웃에서 쓰지 않는다"` 한 줄. IMPACT 문구: MESSAGE `"길이·형식 변경 시 새 버전, 양측 동시 전환"`, HEADER `"헤더 변경 — 사용 전문 {n}건 동시 전환"`.

### 6.8 화면 흐름 요점

- 탭은 shared `Tabs`(목록만) + 아래 패널 조건부 렌더. `편집` 탭은 05-02 화면 그대로. mode 가 `none` 이면 검증·샘플 탭은 "전문을 고르거나 [신규] 를 누르세요" 안내.
- `등록 검증·샘플 전문`: [검증 실행](`canDoButton(rbac, SCREEN_ID, "validate")`)은 현재 편집 상태(draft·stack·body)로 `validate`. [렌더](`"execute"` 권한)는 같은 상태 + 예시 값으로 `execute`. 결과 줄은 구간마다 `span`(배경색 = `ZONE_COLORS[zoneKey]`, `title` = `segmentTitle`, 텍스트 = `visibleText`), 위에 눈금자, 아래 범례·`총 {n}바이트 ({인코딩})`. 권한이 없으면(담당자) 두 버튼을 숨기고 "표준 관리자만 실행합니다" 안내.
- `버전·영향도`: 선택 전문의 `view.versions` 로 이력 그리드(전환 방식 배지: 순차=ok 색, 동시=warn 색), 행을 고르면 `export(layoutId, version)` 으로 스냅샷 미리보기. [JSON 내려받기] = `downloadText(fileBase + ".json", snapshotJsonText(snapshot), "application/json")`, [엑셀 내려받기] = `exportToExcel(snapshotExcelRows(snapshot, names), fileBase + ".xlsx", "snapshot", SNAPSHOT_EXCEL_COLUMNS)`. 아래 변경 분류 표(정적)와 영향 목록 패널.
- 저장 성공 토스트 문구 `저장했습니다.` 는 **바꾸지 않는다**(E2E L6·headerMng H2 가 `getByText("저장했습니다.")` 로 기다린다). 새 버전 번호는 기본 속성의 버전 칸(05-02 `LayoutBasicForm` 의 `layoutVersion`, 저장 뒤 다시 여는 view 가 채운다)과 `버전·영향도` 탭 이력에 보인다.

---

## 담당자 확인 필요 결정

### D1 — 승인 전인 TSK-05-02 의 코드 위에 확장한다
- **질문**: layoutMng 서비스·BPMN·화면·E2E(L1~L8)·`dmb.layout` 공용 클래스는 TSK-05-02 가 만들었고 dev 에 머지됐지만 사람 승인 전이다. 그 위에 올릴 것인가, 05-02 와 독립된 경로로 만들 것인가.
- **선택지**: (1) 05-02 코드 위에 추가만 한다(서비스 메서드·BPMN 분기·탭·E2E 블록 추가, `dmb.layout` 재사용). (2) 별도 서비스(`layoutVerMng` 등)·별도 화면으로 만든다. (3) 05-02 승인을 기다린다.
- **택한 것**: (1).
- **근거**: wbs TSK-05-03 tech-spec 이 05-02 와 **같은** `dmb.layoutMng` 패키지·BPMN·page.tsx·E2E 파일을 적었다(wbs:829-831) — 근거 강(spec 계열). 05-02 design F24·§2 가 "05-03 은 `dmb.layout` 을 재사용하고 layoutMng 한 벌 위에 검사·버전·스냅샷을 더한다"를 해소 원칙으로 적었다(미승인 선행, 약). (2) 는 화면 식별자 목록(screens/README §3)에 없는 새 화면을 만들어 메뉴·RBAC 시드가 늘고, (3) 은 자동 실행 워커가 멈춘다. 이 작업이 05-02 에서 바꾸는 것은 05-02 스스로 "05-03 몫"이라 적은 VERSION 단언 3개뿐이다(D4).
- **반려되면 재작업할 방향**: 05-02 가 반려로 바뀌면 이 브랜치를 새 05-02 위로 다시 올린다(rebase). 충돌은 `LayoutMngService`·`HeaderMngService`·`LayoutTestSupport`·`page.tsx`·`mdm-layoutMng.spec.ts` 에 몰린다. 새 클래스(`codec`·검사·버전·영향도)는 05-02 에 의존하는 `LayoutDraftBuilder`·`LayoutSnapshotAssembler` 만 고치면 된다.

### D2 — 버전 이력은 새 테이블 `TB_MDM_LAYOUT_VER`(V12)에 스냅샷 JSON 과 함께 둔다
- **질문**: "저장 즉시 스냅샷 버전 생성"·"버전 이력(전환 방식)"·"같은 스냅샷 버전으로 직렬화·파싱"을 어디에 저장할 것인가. 확정 ERD 에는 이력 테이블이 없다(F11).
- **선택지**: (1) 새 테이블 `TB_MDM_LAYOUT_VER(LAYOUT_ID, LAYOUT_VERSION, TOTAL_LENGTH, SWITCH_MODE, CHANGE_KINDS, CHANGE_SUMMARY, SNAPSHOT_JSON)` + `TB_MDM_LAYOUT.VERSION` = 최신 번호. (2) `TB_MDM_LAYOUT` 에 `SNAPSHOT_JSON` 칼럼만 더해 최신 하나만 둔다(이력 없음). (3) 저장하지 않고 요청 때마다 조립한다(옛 버전 재현 불가).
- **택한 것**: (1).
- **근거**: spec 요구 "버전 이력(전환 방식 순차/동시)"과 수용 기준 2 는 옛 버전의 스냅샷을 다시 꺼낼 수 있어야 성립한다 — (2)·(3) 은 이력이 없다(spec 강). 03:46 "송신·수신 양쪽이 같은 스냅샷 버전으로 직렬화·파싱"은 버전별 스냅샷 보관을 전제한다(원천 강). 모양은 리포의 `TB_MDM_{대상}_VER` 명명(`CODE_VER`·`RULE_VER`)과 JSON 칼럼 규칙(#3)을 따르되, 03:72 "상태·승인·소유자는 두지 않는다"라 상태 칼럼을 두지 않는다. 번호는 F28 규칙대로 V12. 근거 강도: 강(필요성) / 중(칼럼 구성 — ERD 소유자 TSK-02-03 의 확인 전).
- **반려되면 재작업할 방향**: ERD 개정안이 다른 칼럼을 요구하면 V13 `ALTER`(이미 적용됐으면) 또는 V12 수정(머지 전이면)으로 맞추고 엔티티·`LayoutVersionStore` 만 고친다. 스냅샷을 배포 테이블과 합치라는 결정이면 배포 Task 가 이 테이블을 이관한다.

### D3 — 스냅샷 계약 `MdmLayoutItemSnapshot` 에 `unitCode`·`scale` 을 더한다
- **질문**: 전송 단위 환산(기준 단위 필요)·소수점 문자 형식과 수신 반올림(도메인 소수 자리 필요)을 스냅샷만으로 하려면 항목에 도메인 기준 단위·소수 자리가 있어야 하는데 05-01 계약에 없다(F12). 계약을 바꿀 것인가.
- **선택지**: (1) record·스키마·샘플 세 곳과 `ContractStubCompileTest` 생성자에 두 칸을 더한다. (2) 계약은 그대로 두고 직렬화기가 도메인 정보를 따로(DB·인자) 받는다. (3) 소수점 문자 형식·전송 단위를 지원하지 않는다.
- **택한 것**: (1).
- **근거**: html 스냅샷 예시가 이미 항목에 `"unit": "mm"` 을 싣고 "파생·계산값이 풀려 들어간다"고 적었다(F5, 시안 강). (2) 는 수신 쪽이 스냅샷 밖의 도메인 정보에 기대게 돼 "같은 스냅샷 버전으로 파싱"(03:46)이 깨지고 I11 의 구조 보증도 못 한다. (3) 은 spec "단위 경계 변환(trans_unit)"과 어긋난다. 계약 소비자가 아직 없어(배포 보류, 05-01 D6) 지금 바꾸는 비용이 가장 낮다. 이름은 계약 관례(camelCase)대로 `unitCode`·`scale`. 근거 강도: 중(05-01 계약은 미승인이라 약하지만, 바꾸는 방향이 시안과 일치한다).
- **반려되면 재작업할 방향**: 두 칸을 되돌리고 `LayoutSerializer`·`LayoutParser` 생성자에 `Map<String, DomainFacts(unitCode, scale)>` 를 받게 바꾼다. 스냅샷 버전 행에는 그 맵을 별도 JSON 칼럼으로 함께 저장해야 옛 버전 재현이 유지된다(V12 칼럼 추가).

### D4 — 버전 생성 규칙과 05-02 테스트 기대값 교체
- **질문**: 언제 버전을 만들고 번호를 어떻게 매기는가. 그리고 05-02 가 "05-03 몫"이라며 VERSION 0 을 단언한 테스트 3개를 어떻게 다루는가(F17).
- **선택지**: (1) 저장해 스냅샷(버전 번호 제외)이 바뀔 때만 +1, 최초 1, 헤더 저장은 그 헤더를 쌓은 전문마다 같은 규칙. 05-02 테스트 3개는 새 기대값으로 바꾸고(1개는 이름도) 개수는 유지. (2) 저장할 때마다 무조건 +1. (3) 헤더 저장은 사용 전문 버전을 만들지 않는다(다음 전문 저장 때 반영).
- **택한 것**: (1).
- **근거**: spec "저장 즉시 스냅샷 버전 생성"(강). html 버전 이력의 각 행은 "변경"이 있는 버전이다 — 내용이 같은 저장마다 새 버전을 만들면 이력이 노이즈가 되고 상대 시스템이 바뀐 것 없는 버전을 받는다((2) 배제). html 변경 분류 "헤더 구성 변경 → 그 헤더를 쓰는 전문 전체 동시 전환"과 05-02 D7(헤더 저장 트랜잭션에서 사용 전문 재계산)을 이으면, 사용 전문의 스냅샷이 바뀐 순간 버전이 있어야 한다((3) 은 스냅샷과 저장값이 어긋난 채 남는다). 05-02 의 I17 은 스스로 "버전은 TSK-05-03"이라 적은 임시 규칙이라 이 작업이 대체하는 것이 기대값 완화가 아니다. 근거 강도: 중.
- **반려되면 재작업할 방향**: (2) 라면 `LayoutVersioner` 의 ③ 비교를 빼고 테스트 `같은_내용으로_다시_저장하면_…` 을 "버전 2" 로 바꾼다. (3) 이라면 `HeaderMngService` 의 `versioner.record` 호출과 `versioned` 응답을 빼고 `헤더를_바꾸면_…` 테스트를 뒤집는다.

### D5 — AUTO 채움: MSG_LENGTH 는 전문 총 길이, SEND_TIME 은 항목 길이로 형식, LAYOUT_ID 는 대리키 숫자
- **질문**: html 이 미결로 둔 "L110 길이(`00087`)는 L2 헤더와 본문만 센다고 가정", SEND_TIME 을 날짜 8·시각 6 으로 나눠 싣는 경우(미결 배지), TC코드 `M201`(Format ID 폐지 뒤의 LAYOUT_ID) 를 어떻게 채우는가.
- **선택지**: MSG_LENGTH — (a) 어느 헤더에 있든 전문 총 길이 (b) 그 헤더 시작부터 끝까지 (c) 항목별 "세는 범위" 속성 신설. SEND_TIME — (a) 항목 길이 14/8/6 으로 형식 결정 (b) AUTO 종류 신설(SEND_DATE·SEND_TIME). LAYOUT_ID — (a) `TB_MDM_LAYOUT.LAYOUT_ID` 숫자 (b) 레이아웃 이름.
- **택한 것**: 모두 (a).
- **근거**: 03:37 "AUTO(MSG_LENGTH)가 이 계산값(전문 총 길이)을 쓴다"(원천 강) — html 의 `00087` 은 스스로 "가정한 값"이며 미결이다. (b)·(c) 는 칸이 없어 스키마·계약을 더 바꿔야 한다(05-01 D7 이 AUTO 를 문자열로 둔 이유와 같은 미결). SEND_TIME 은 03 이 종류를 넷으로 고정했으므로(03:21) 종류를 늘리지 않고 길이로 가른다. LAYOUT_ID 는 03:21 "← `TB_MDM_LAYOUT.layout_id`"(원천 강). 근거 강도: MSG_LENGTH 중(원천 문장 강, 시안 미결과 충돌), SEND_TIME 중, LAYOUT_ID 강.
- **반려되면 재작업할 방향**: MSG_LENGTH 범위를 헤더별로 둬야 하면 `defaultValue` 에 `MSG_LENGTH:FROM_HERE` 같은 변형을 허용하고(05-02 L04 목록 확장) `LayoutSerializer` 에서 범위 합을 계산한다. SEND_TIME 종류를 나누면 `AUTO_KINDS` 와 L04 를 함께 넓힌다.

### D6 — CONST 유효 식 검증(#2)의 범위: 타입·표준식·바이트 길이, 판정 불가는 경고
- **질문**: "CONST 값이 도메인 유효 식 위반"(03:20·38)을 무엇으로 판정하고, 서버에 코드 원장이 없어 판정할 수 없는 경우(CODE 도메인·MASTER 식, F20)를 어떻게 다루는가.
- **선택지**: (1) 도메인 화면의 판정기(`DomainTestCaseRunner.preview` 의 표준식)와 엔진 `ValueConverter`(타입), 그리고 인코딩 바이트 길이 ≤ 항목 길이로 판정. 비즈니스식은 보지 않는다. UNDECIDED 는 경고(표 WARN)로 저장 허용. (2) 표준식만, UNDECIDED 는 거부. (3) 표준식 + 비즈니스식(요구 변수는 빈 값).
- **택한 것**: (1).
- **근거**: 02 의 도메인 검증 정의가 "유효 표준식"과 "유효 비즈니스식"을 나누고, 비즈니스식은 레코드의 다른 변수가 필요한데 CONST 에는 레코드가 없다((3) 은 늘 `BIZ_VAR_MISSING` 으로 떨어진다). 판정기를 다시 만들지 않고 도메인 화면과 같은 판정을 쓰는 것이 일관적이다(리포 관례 강). UNDECIDED 를 거부하면 CODE 도메인 CONST(송신공장구분 류, 코드값이 흔하다)가 서버에 코드 원장이 생길 때까지 **전부** 저장 불가가 된다 — 도메인 화면도 같은 상태를 경고 W02 로 둔다. 바이트 길이는 도메인 정의의 일부이며 넘치면 직렬화 때 오류가 나므로 등록 때 막는다. 근거 강도: 중.
- **반려되면 재작업할 방향**: UNDECIDED 를 거부로 바꾸려면 `LayoutRegistrationRules` 의 경고 분기를 L12 이슈로 옮기고 테스트 `거부_2_판정_불가는_…` 을 뒤집는다. 비즈니스식을 넣으려면 `LayoutConstJudge` 가 `biz` 도 보되 요구 변수가 있으면 WARN 으로 둔다.

### D7 — 새 거부 코드는 L12~L15 네 개만 더하고, 7종 중 셋은 05-02 코드를 쓴다
- **질문**: 거부 7종의 코드를 어떻게 매기는가.
- **선택지**: (1) `LayoutIssueCode` 에 L12(#2)·L13(#3)·L14(#4)·L15(#7) 를 더하고 #1=L01, #5=L02(FILLER_LENGTH), #6=L05 를 재사용. (2) 7종 전용 코드 R1~R7 을 새로 만든다. (3) `MdmErrorCode` 에 새 코드.
- **택한 것**: (1).
- **근거**: 팀장 지시 "05-02 가 이미 구현한 거부 코드와 겹치면 재사용하고, 코드 체계를 새로 만들지 않는다". 05-02 §6.2 가 #2·#3·#4·#7 을 "05-03 몫"으로 비워 두었다(미승인 선행). (3) 은 05-02 D4 와 같은 이유(공유 enum 줄 충돌)로 배제. #5 가 L02 의 부분집합이라는 점은 표 배정 규칙(I12)으로 못박는다. 근거 강도: 중.
- **반려되면 재작업할 방향**: 전용 코드 체계로 바꾸면 `LayoutIssueCode` 에 별칭을 두지 않고 `LayoutCheckTable` 의 행 배정과 message 접두 단언(테스트 약 15곳)을 새 코드로 바꾼다.

### D8 — 숫자 표현 자리 용량(#4) 공식
- **질문**: "표현 자리수가 도메인의 길이·부호를 담기에 부족하면 거부"(03:32)의 필요 자리수를 어떻게 계산하는가. 도메인에는 부호 칼럼이 없다(F20).
- **선택지**: (1) `(p−s) + 전송 단위 증가 자리 + s + (소수점 문자면 1) + (부호 자리면 1)`. (2) `p + (부호면 1)` 만. (3) 도메인 길이만 비교.
- **택한 것**: (1).
- **근거**: html 거부 예시 "표현 자리 2는 도메인 10 코일 두께(숫자 3,1)를 담지 못합니다"와 메모 "4자리 ≥ 도메인 3,1"을 (1)·(2) 모두 만족한다. 그러나 전송 단위로 mm → μm(×1000)이면 정수 자리가 3 늘어 (2) 로 통과한 항목이 송신 때 넘친다 — 등록 검증이 직렬화 실패를 미리 막는 것이 03 의 취지다("Attr. Check"). 소수점 문자 모드(`03.5`)는 `.` 한 자리를 더 쓴다. 부호는 도메인에 없으니 항목의 SIGN 설정만 센다. 근거 강도: 중(공식 자체는 원천에 없다).
- **반려되면 재작업할 방향**: `LayoutRegistrationRules.requiredWidth` 의 항과 파라미터 테스트 표만 바꾼다. 전송 단위 항을 빼면 넘침은 직렬화 시점 오류(I6)로만 드러난다.

### D9 — 단위 경계 변환 규칙과 계수의 위치
- **질문**: 전송 단위·단위 항목의 변환 식·반올림, unit_item 의 송신 방향, 그리고 환산 계수를 스냅샷에 넣을 것인가.
- **선택지**: 계수 — (a) 스냅샷 밖 `TB_MDM_UNIT`(직렬화기 생성자로 받음) (b) 스냅샷에 쓰인 단위의 계수를 함께 싣는다. unit_item 송신 — (a) record 의 단위 항목 값으로 기준 → 그 단위 변환, 비면 기준 단위 그대로 (b) 송신은 늘 기준 단위로 쓰고 단위 항목에 기준 단위 코드를 채운다.
- **택한 것**: 계수 (a), unit_item (a). 식은 `value × from.factor ÷ to.factor`(`MathContext(34,HALF_UP)`), 형식 자리로 HALF_UP.
- **근거**: 03:46 이 단위 마스터를 레이아웃과 **별도** 배포 대상으로 둔다(원천 강) — 계수를 스냅샷에 넣으면 같은 계수가 두 곳에 산다. 식과 반올림은 단위 화면 `convertPreview` 와 같다(리포 관례 강). unit_item 은 03:30 이 수신 환산만 적었고 송신 방향은 원문이 없다 — (a) 가 수신과 대칭이라 왕복이 성립한다. **한계**: 계수가 바뀌면 옛 스냅샷 버전으로도 새 계수로 환산된다(수용 기준 2 의 범위 밖 — 단위 마스터 배포 버전이 맡는다). 근거 강도: 계수 강, unit_item 중.
- **반려되면 재작업할 방향**: 계수를 스냅샷에 넣으라면 `MdmLayoutSnapshot` 에 `units[{code, dimension, factor}]` 를 더하고(D3 와 같은 세 곳) `LayoutUnitTable.of(snapshot.units())` 로 바꾼다. unit_item 송신 (b) 라면 `LayoutSerializer` 에서 단위 항목 칸을 기준 단위 코드로 덮어쓴다.

### D10 — 넘침·담지 못하는 문자는 오류, 빈 값은 공백, 파싱 결과는 본문 항목만
- **질문**: 값이 칸보다 길거나 인코딩이 담지 못하는 문자가 있을 때, 값이 없을 때, 그리고 파싱이 무엇을 돌려주는가.
- **선택지**: 넘침 — (a) `LayoutCodecException` (b) html 처럼 잘라낸다(멀티바이트면 문자 경계에서). 빈 값 — (a) 칸 전체 공백(숫자도), 파싱은 공백 → null (b) 숫자는 0 채움. 파싱 결과 — (a) 본문 DATA·CONST·AUTO 만 `COLUMN_PHYS` 키 (b) 헤더 항목도 `헤더SEQ.물리명` 키로.
- **택한 것**: 모두 (a).
- **근거**: 잘라내기는 데이터를 조용히 바꾼다 — 03 의 "검증은 값을 만든 쪽이 끝냈다"(03:42)는 받은 쪽이 값을 믿는다는 뜻이라 보내는 쪽이 손실을 만들면 안 된다. html 의 `slice` 는 시안 렌더 코드다(시안 약). 빈 값을 0 으로 쓰면 수신 쪽이 "0"과 "값 없음"을 가를 수 없다. 파싱 결과는 수신 시스템이 저장할 업무 값이며(03:42 "파싱 → 역변환 → 저장"), 헤더 항목은 본문과 물리명이 겹칠 수 있다(L06 은 레이아웃 안에서만 유일). 근거 강도: 중.
- **반려되면 재작업할 방향**: 잘라내기로 바꾸면 `LayoutFieldCodec.encodeChar` 에서 문자 경계까지 자르고 I6 테스트를 뒤집는다. 헤더 값도 필요하면 `LayoutParser` 가 `_headers` 하위 맵을 더한다(계약 반환형 `Map<String,Object>` 안에서 가능).

### D11 — 변경 분류는 html 5행에 형식·삽입·삭제·총 길이·기본 속성을 더해 판정한다
- **질문**: html 변경 분류 표는 5행뿐이다. 그 밖의 변경(숫자 형식·단위·인코딩 변경, 여분 밖 삽입, 삭제, 끝에 추가, 이름만 변경)을 어떻게 분류하는가.
- **선택지**: (1) 상대 시스템의 기존 파서가 깨지는 변경(형식·삽입·삭제·총 길이)은 동시, 전문 바이트 모양이 그대로인 변경(기본 속성)은 순차. (2) 표 5행에 없는 변경은 모두 동시. (3) 표에 없는 변경은 "분류 없음".
- **택한 것**: (1).
- **근거**: 03:47 의 기준 "전문 총 길이와 기존 항목 오프셋이 변하지 않으므로 이전 버전으로 파싱하는 상대 시스템이 깨지지 않고 순차 전환이 가능하다"를 같은 기준으로 넓힌 것이다(원천 강). 숫자 형식·단위·인코딩은 오프셋이 같아도 옛 파서가 값을 틀리게 읽으므로 동시다. 이름·송수신 시스템은 바이트가 같다. (2) 는 이름만 바꿔도 양측 동시 전환을 요구해 과하다. 근거 강도: 중.
- **반려되면 재작업할 방향**: `LayoutChangeClassifier.Kind.simultaneous()` 표와 해당 테스트만 바꾼다.

### D12 — 영향 전문 목록은 layoutMng 조회로 두고, 같은 조회로 `MdmDomainReferenceSpi(LAYOUT_ITEM)` 를 구현한다
- **질문**: "컬럼·도메인 변경 영향 전문 목록"을 어디에 보이는가. columnMng·domainMng 화면을 고칠 것인가.
- **선택지**: (1) layoutMng `search target=IMPACT`(버전·영향도 탭) + `LayoutItemReferenceSpi` 빈 추가 — domainMng 영향도 패널의 기존 "레이아웃" 행이 코드 수정 없이 채워진다. (2) layoutMng 에만 둔다(SPI 미구현). (3) columnMng·domainMng 화면에 영향 패널을 새로 만든다.
- **택한 것**: (1).
- **근거**: 03:48 "도메인 좁히기·컬럼 변경의 **영향도 목록에** 그 컬럼을 쓰는 레이아웃과 상대 시스템이 포함된다" — 도메인 화면의 영향도가 그 목록이다(원천 강). TSK-04-01·05-01·05-02 가 모두 이 SPI 실구현을 03 쪽 Task 몫으로 넘겼고(F23), 도메인 화면에는 이미 "레이아웃" 행이 있다. 빈을 더하는 것은 domainMng 코드를 바꾸지 않는 **추가**다. (3) 은 columnMng 에 영향도 틀이 없어 새 화면 작업이 된다(팀장 지시 "columnMng·domainMng 화면을 고쳐야 하면 추가만"). 근거 강도: 중(domainMng 출력이 바뀌므로 그 화면 승인자가 알아야 한다).
- **반려되면 재작업할 방향**: SPI 를 빼려면 `LayoutItemReferenceSpi` 파일과 테스트 `도메인_영향도_SPI_는_…` 만 지운다. columnMng 에도 보여야 하면 columnMng `view` 에 `LayoutImpactFinder.itemsUsing(physName)` 결과를 더하는 별도 작업으로 한다.

### D13 — 검증·렌더·내려받기는 서버 액션 `validate`·`execute`·`export` 로, 엑셀은 화면이 만든다
- **질문**: 등록 검증 표·샘플 전문 렌더·스냅샷 내려받기를 서버와 화면 중 어디서 계산하고 어느 액션 이름을 쓰는가.
- **선택지**: (1) 서버 액션 셋(`validate`=EDIT, `execute`=EDIT, `export`=READ 포함). 엑셀은 export 의 JSON 으로 화면이 shared `exportToExcel`. (2) 렌더를 화면 JS 로(TS 직렬화기 한 벌 더). (3) `search`/`view` 의 target 인자로 몰아넣는다(05-02 D8 방식).
- **택한 것**: (1).
- **근거**: 브라우저 `TextEncoder` 는 UTF-8 만 인코딩하므로 EUC-KR 바이트 렌더를 화면이 할 수 없다 — 서버 직렬화기가 기준이어야 렌더와 실제 송신이 같다(spec "인코딩 바이트 기준 한 줄 렌더" 강). 세 액션 이름은 `MdmActions` 에 이미 있고 권한 행에도 시드돼 있어(F19) 새 시드가 없다 — 05-02 D8 이 target 으로 우회한 이유(새 액션 이름의 시드 비용)가 여기에는 없다. 쓰기 없는 초안 검사가 `validate`·`execute` 의 뜻과 맞고, 스냅샷 출력은 `export` 의 뜻이다. 대가: 담당자(READ)는 검증·렌더를 못 하고 조회·내려받기만 한다. 백엔드에 POI 가 없어 엑셀은 리포 관례대로 화면이 만든다(F24). 근거 강도: 중.
- **반려되면 재작업할 방향**: 담당자도 렌더해야 하면 `execute` 대신 `view` 에 `samples` grid 를 받는 분기를 두거나 dmb READ 에 execute 를 더하는 권한 결정(ADR-0003)이 필요하다. 엑셀을 서버에서 만들라면 POI 의존성 추가(ADR 대상)가 먼저다.

---

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 도커 금지로 생략: cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain
- 위 명령이 돌릴 이 작업의 변경분: V12 MSSQL 파일의 실제 적용, 새 `MdmLayoutVersionMssqlMigrationTest`(ISJSON 제약·NVARCHAR 한글 왕복·BIN2), 버전 집합을 고친 기존 mssqlTest 4개. 도커 없이 `:api:compileMssqlTestJava` 로 컴파일만 확인한다(F30). 수용 기준 6개는 모두 SQLite 통합·순수 단위·vitest·E2E 로 확인하므로 이 생략 때문에 확인하지 못하는 수용 기준은 없다. MSSQL 방언 확인은 머지 뒤 팀장 방언 검증(`dialect_check`)이 한다.

---

## 인계·후속 (보고에 올린다)

- **ERD 드리프트**: `TB_MDM_LAYOUT_VER` 는 `docs/mdm/erd/03-interface-layout.*`(TSK-02-03 소유)에 없다. 이 작업은 ERD 를 고치지 않는다 — ERD 소유자가 D2 를 확인하며 반영한다.
- **배포**: 스냅샷 버전은 저장까지만 한다. 배포 Task 가 `TB_MDM_LAYOUT_VER.SNAPSHOT_JSON` 을 배포 묶음(도메인·컬럼 서브셋·단위 마스터와 함께, 03:46)으로 싣는다. 직렬화기·파서(`dmb.layout.codec`)는 `java.*`·`contract.layout` 만 의존하므로 배포 라이브러리로 옮기기 쉽다(05-01 D6 의 재판단 지점).
- **html 미결 유지**: "구간 종류", MSG_LENGTH 의 세는 범위(D5), SEND_TIME 분할(D5)은 원천 확정 전까지 이 작업의 기본값으로 둔다.
- **단위 코드 `μm`**: 단위 화면 규칙(`^[A-Za-z0-9_]{1,20}$`)상 등록할 수 없어 테스트는 `UM` 을 쓴다. 시안의 `μm` 표기와 다르다(TSK-04-02 소유 규칙).
- **CONST 값 칼럼 한글 손실**(05-02 인계 유지): MSSQL `VARCHAR(50) BIN2` 라 한글 상수는 저장되지 않는다. #2 의 바이트 길이 검사는 이 제약을 막지 않는다.
- **Phase 06 직전**: `origin/dev` 의 mdm 마이그레이션 최대 번호를 다시 보고, V12 가 선점됐으면 두 방언 파일을 다음 번호로 `git mv` 하고 F29 의 단언 5개 파일과 이 문서의 V12 참조를 함께 고친다.
