# TSK-04-04 설계 — 컬럼 사전 (자동 생성·역분해·시스템 매핑)

> 작성 2026-09-24 · Phase 02 Design · 브랜치 `agent/88a2e470-column-dictionary`(기점 origin/dev 3d08db7)
> 입력: `spec.md`(요구사항 데이터), `docs/mdm/wbs.md` `### TSK-04-04`(v1.3 정본), 원천 `docs/mdm/design/basic/02-term-domain-column.md` 「컬럼명 속성」·「TB_MDM_COLUMN」·「TB_MDM_COLUMN_SYSTEM」, 시안 `html/02-term-domain-column.html` 「3. 컬럼 사전 관리」
> 경로 기본값(팀장 지시, D 항목 아님): spec.md 의 `mdt/columnMng`·`mdt/termRegPop` 대신 wbs v1.3·`screens/README.md` 의 `dma/columnMng`·`dma/termRegPop` 을 쓴다.

Build 는 이 문서만 보고 구현한다. 원천 문서를 다시 읽지 않아도 되게 규칙·경로·클래스 이름·함정을 여기에 적었다.

---

## 0. 조사로 확인한 사실

| # | 사실 | 근거 |
|---|---|---|
| F1 | **FK 문제는 이미 해소돼 있다.** `TB_MDM_DOMAIN.MARU_CODE_ID → TB_MDM_CODE` FK 는 V3 두 방언 어디에도 없다(TSK-04-01 D1, decisions D-035). 그래서 테스트·E2E 에서 `TB_MDM_DOMAIN`·`TB_MDM_COLUMN` INSERT 가 막히지 않는다. 남은 FK 는 `TB_MDM_COLUMN.DOMAIN_ID → TB_MDM_DOMAIN`, `TB_MDM_COLUMN_SYSTEM.COLUMN_ID → TB_MDM_COLUMN`, `TB_MDM_COLUMN_SYSTEM.SYSTEM_CODE → TB_MDM_SYSTEM`, `TB_MDM_DOMAIN.UNIT_CODE → TB_MDM_UNIT`(NULL 허용) 이다. SQLite 는 Hikari 속성 `foreign_keys=true` 로 FK 를 강제한다 | `db/migration/mdm/sqlite/V3__create_mdm_term_domain_column.sql:86-89,121,143-144`, `application-local.yml:5-9`, `decisions.md` D-035 |
| F2 | `TB_MDM_COLUMN`: `COLUMN_ID` IDENTITY, `COLUMN_NAME` NOT NULL **유일**(`UX_TB_MDM_COLUMN_NAME`), `PHYS_NAME VARCHAR(50)` NOT NULL **유일**(`UX_TB_MDM_COLUMN_PHYS_NAME`), `LABEL_LONG/MID/SHORT`(SQLite TEXT, MSSQL `NVARCHAR(24)/(12)/(6)`), `DOMAIN_ID` NOT NULL, `REQUIRED`(SQLite INTEGER CK 0/1, MSSQL BIT), `DEFAULT_VALUE VARCHAR(50)`, `REF_KIND VARCHAR(20)`, `REF_TARGET VARCHAR(50)`, `REF_CATE_ID VARCHAR(50)`, `TERM_IDS` JSON(CK `json_valid`/`ISJSON`), `USAGE_NOTE`, `CHG_SEQ` NOT NULL DEFAULT 0, 감사 9칼럼. MSSQL `COLUMN_NAME NVARCHAR(100)` | sqlite V3:95-125, mssql V3:102-134 |
| F3 | `TB_MDM_COLUMN_SYSTEM`: PK `(COLUMN_ID, SYSTEM_CODE, PHYS_NAME)`, `(SYSTEM_CODE, PHYS_NAME)` 에는 **비유일** 인덱스 `IX_TB_MDM_COLUMN_SYSTEM_SYS_PHYS` 뿐이다. 따라서 "한 시스템 안 같은 필드명의 두 번째 등록 거부"는 DB 가 강제하지 않는다. 원천도 "저장 검증이 이것을 강제한다"고 적었다(ERD 가 IX 를 고른 것은 테이블 칸 부활 경로를 열어 두려는 것). **이 Task 는 새 마이그레이션을 내지 않고 서비스 검증으로 강제한다** | sqlite V3:127-146, `02-term-domain-column.md:916`, `erd/02-term-domain-column.sqlite.sql:140` |
| F4 | 대소문자: SQLite 는 기본 BINARY, MSSQL `PHYS_NAME`·`SYSTEM_CODE`·`ENG_ABBR`·`STD_NAME` 은 `Latin1_General_100_BIN2` 라 **두 방언 모두 대소문자를 구분**한다(`'AbC'`/`'ABC'` 가 서로 다른 행, TSK-04-01 실측). 필드명 중복 판정은 이에 맞춰 **정확 일치**로 한다. **2026-10-03 변경(D-149)**: 다른 컬럼과의 충돌은 같은 시스템 안에서 대소문자를 무시해 본다(별칭 매칭이 대소문자를 무시하므로). 한 요청 안·같은 컬럼의 대소문자만 다른 이름은 그대로 허용한다 | `naming-dialect-rules.md:71`(#19), mssql V3:108,139 |
| F5 | 감사 카운터 이름은 이 네 테이블에서 `VER` 그대로다. D-034(`AUD_VER`)는 업무 `VER` 칼럼이 있는 04·06 버전 테이블 6개에만 해당한다. `CactusAuditListener` 가 INSERT 때 `VER=0`, UPDATE 때 +1 을 채우고, `C_USR_ID` 등은 `AuditHolder` 가 있을 때만 채운다(OASIS 요청 밖 테스트에서는 NULL) | `decisions.md:270-276`, `cactus-core/.../audit/CactusAuditListener.java`, TSK-04-01 design F14 |
| F6 | 엔티티·리포지토리는 TSK-04-01 이 만들었다: `com.dongkuk.dmes.mdm.entity.{MdmColumn, MdmColumnSystem(+MdmColumnSystemId @IdClass), MdmDomain, MdmTerm, MdmUnit}`, `com.dongkuk.dmes.mdm.repository.Mdm*Repository`(파생 쿼리 없는 선언만). 연관관계 매핑 금지(원시 ID 필드, `MdmEntityArchitectureTest`). `MdmTerm` 은 `EMBEDDING*` 을 매핑하지 않는다. `TB_MDM_SYSTEM` 엔티티는 없다 | `mdm/lib/.../entity/*.java`, `repository/*.java`, `MdmEntityArchitectureTest.java:33-62` |
| F7 | `TB_MDM_TERM`: `(TERM_NAME, SENSE_NO)` 유일, `ENG_ABBR` 는 NULL 이 아닐 때 유일(대소문자 구분), `SYNONYMS`·`ALIASES`·`SYSTEMS` 는 JSON 텍스트(CK). MSSQL 길이: `TERM_NAME`·`CONTEXT`·`ENG_NAME NVARCHAR(100)`, `ENG_ABBR VARCHAR(50)`, `SRC_ORIGIN NVARCHAR(200)`. 원천은 동의어를 "`명칭(시스템)` 형식, 여러 시스템이면 `명칭(ERP, APS)`"으로만 적었고, **JSON 원소 모양을 정한 곳은 저장소 어디에도 없다**(용어 CRUD 는 아직 착수 전인 TSK-04-02 몫) | sqlite V3:27-55, mssql V3:26-52, `02-term-domain-column.md:813-815`, D3 |
| F8 | `contract.dictionary` 의 `MdmColumnDictionaryLookup` 는 javadoc 이 "구현은 TSK-05-01·08-01 등 소비자가 제공한다"고 지정했다. 두 곳에서 구현하면 빈이 중복된다. **이 Task 는 구현하지 않는다**(한 줄 기본값). `MdmEffectiveDomainResolver`·`MdmDomainImpactLookup` 는 TSK-04-03 몫이다 | `contract/dictionary/MdmColumnDictionaryLookup.java:8`, TSK-04-01 design §8 |
| F9 | 버전 상태 서비스(TSK-01-03)는 컬럼 사전에 **적용하지 않는다.** V3 의 컬럼·매핑 테이블에는 상태·소유자·적용 구간 칼럼이 없고, 원천도 용어·도메인·컬럼·매핑은 "승인 없음, 표준 관리자가 저장하면 바로 배포"라고 적었다. `CHG_SEQ` 발급(배포 순번)은 보류(PRD FR-A5, `TB_MDM_DICT_SEQ` 는 배포 안 함)라 0 을 유지한다 | V3, `02-term-domain-column.md:523,944`, PRD FR-A5 |
| F10 | **mdm 에는 아직 OASIS 서비스·BPMN 이 하나도 없다.** 이 Task 가 첫 번째다. 설정은 이미 있다: `cactus.oasis.service-group: mdm`, `service-path: /services`, `transactional: true`(프로세스 단위 트랜잭션). 경로 규약: BE 패키지 `com.dongkuk.dmes.mdm.{group}.{screenId}.{dto,service}`(lib 모듈), BPMN `src/backend/mdm/api/src/main/resources/services/{group}/{screenId}.bpmn`, process id = serviceId = screenId | `mdm/api/.../application.yml:19-36`, `screens/README.md:71-81`, `MdmOasisConventions.java` |
| F11 | 선례 `mls noticeMgmt`: 서비스는 lib 에 `@Service("noticeMgmtService")`(빈 이름 = `{screenId}Service`), **`@Transactional` 금지**(CGLIB 프록시가 파라미터 이름을 지워 `ParameterName must not be null`), 반환은 `Map<String,Object>` + BPMN `output="result"` → 응답 `data.result.{...}`. 조회 DTO 는 serviceTask `dto` 속성(FQCN)으로 **타입** 바인딩, 그리드는 `grids.{이름}.rows` 가 메서드 파라미터 이름과 **글자 단위로 같아야** 바인딩된다. 분기는 sequenceFlow `name` 만 쓴다. serviceTask 에 `grid` 속성 금지. DTO 는 getter/setter 일반 클래스(record·Lombok 없음). `params` 에 배열을 넣으면 `Generic type` 예외 | `mls/lib/.../lsh/noticeMgmt/service/NoticeMgmtService.java:42-52,86,121`, `mls/api/.../services/lsh/noticeMgmt.bpmn`, `mcm-core/.../cmb/masterRuleFrame/service/MasterRuleFrameService.java:98-100`, `docs/guide/BackEnd/standard-v2/backend-standard/02-structure-naming-constraints.md` §6 |
| F12 | **OASIS 오류 경로(가장 큰 함정).** BPMN serviceTask 안에서 던진 예외는 `StrictMethodInvoker` 가 그대로 다시 던지고, `CoreServiceStarter.start` 의 `catch (Exception e)` 가 잡아 `SYSTEM_ERROR` + `serviceResultMessage = e.getMessage()` 로 바꾼다. `CactusResponseConverter.convertError` 는 `meta.code="S001"`(UserException 만 `E001`)과 `meta.message` 만 싣고 **`errors[]` 를 비운다.** 그래서 `OasisServiceExecutor` 의 `catch (BusinessException)`(`errors` 를 싣는 분기)은 이 경로에서 동작하지 않는다. 결론: **화면까지 오는 것은 `meta.success=false` 와 `meta.message`(= 예외 message) 뿐이다.** MDMnnn 코드와 행 단위 상세는 오지 않는다. TSK-01-03 F13·`MdmErrors` javadoc("화면은 `errors[].code` 로 원인을 가린다")은 이 경로에 대해서는 틀렸다 | `oasis/oasis-core/.../service/CoreServiceStarter.java:100-119`, `oasis-core/.../StrictMethodInvoker.java:68-73`, `cactus-core/.../oasis/CactusResponseConverter.java:92-100`, `cactus-core/.../oasis/OasisServiceExecutor.java:108-118`, `mdm/lib/.../common/support/MdmErrors.java:11-14` |
| F13 | `MdmErrorCode` 는 계약 enum 이고 14개(MDM001~014)다. `CommonContractTest` 가 `assertEquals(14, values().length)` 로 **정확히** 단언한다. TSK-01-03 이 MDM013·014 를 더할 때 12→14 로 갱신한 선례가 있다. `MdmErrors.of(code, issues)` 는 예외 message 를 `code.defaultMessage()` 로 고정한다 | `contract/common/MdmErrorCode.java:14-30`, `lib/src/test/.../contract/common/CommonContractTest.java:48`, `decisions.md:321`, `MdmErrors.java:21-32` |
| F14 | **권한 구조.** API 액션 권한은 BFF 한 곳이 검사한다: 권한키 `mdm/oasis/{objectId}/{action}`(소문자 비교), 없으면 HTTP 403 `{success:false,error:{code:"FORBIDDEN"}}`. 키는 `UserPermCache` 가 역할 매핑(OBJECT × 권한 세트)에서 만들고 **메뉴 leaf 를 보지 않는다.** 권한 세트: `PERM_MDM_READ = search,view,export,compare`, `PERM_MDM_EDIT = READ + save,delete,reg,import,validate,execute,copy,restore`. dma 매트릭스: `MDM_STD_ADMIN → EDIT`, `MDM_STEWARD → READ`. SYSADMIN 은 매트릭스에 없어 화면마다 `PERM_ALL` 행을 따로 넣는다. `PERM_ALL`(`allActions`)에 search·view·compare·save·reg 가 이미 있어 목록을 고칠 필요가 없다 | `mcm-core/.../security/endpoint/UserPermCache.java:25-50`, `shared/src/auth/rbac-policy.ts:94-113`, `m-mcm/proxy.ts:103-109`, `mcm/api/.../init/DataInitializer.java:298-329,912-1003`, `contract/security/MdmPermissions.java` |
| F15 | **버튼 권한도 역할 매핑에서 온다.** `useUserButtonRbac` → `secUser/myButtonEndpoints` → `SecUserService.getMyButtonEndpoints` 가 `SecRoleMapping`(OBJECT_ID, PERMISSION_ID)을 펼쳐 `{objId, action}` 행을 만든다. 메뉴 leaf 와 무관하다. `canDoButton(state, objId, action)` 은 objId 를 **대소문자 그대로** 비교한다. 평시 SYSADMIN 도 와일드카드가 아니라 실제 매핑 행(PERM_ALL)을 받는다. 따라서 팝업 `termRegPop` 은 **OBJECT + 역할 매핑만 있으면** 버튼·API 권한이 동작하고 메뉴 leaf 는 필요 없다(`screens/README.md:31,76` 의 "팝업은 page.tsx·메뉴 leaf 없음"과 맞는다) | `mcm-core/.../security/service/SecUserService.java:456-510`, `shared/src/portal-shell/use-user-button-rbac.ts:190-204` |
| F16 | 서버 쪽 역할 판정 수단: `MdmCurrentUser.roleIds()`(구현 `CactusMdmCurrentUser` @Component, `UserContextHolder` 의 역할에서 `ROLE_` 한 번 제거). 역할은 BFF 가 `X-Authenticated-Role`(콤마 구분)로 보내고 `ClientKeyFilter` 가 파싱한다. 선례 `VersionPreconditions.requireSteward()` 는 `roleIds().contains(MdmRoles.STEWARD)` 로만 판정하고 **"SYSADMIN·MDM_STD_ADMIN 만으로는 거부한다"** 고 명시했다 | `common/security/CactusMdmCurrentUser.java:11-37`, `cactus-core/.../ClientKeyFilter.java:127-160`, `common/version/VersionPreconditions.java:26-32` |
| F17 | 메뉴 시드: `DataInitializer.seedMdmMenus()` 가 루트 `mdm`·그룹 폴더 `dma`("용어·도메인") 를 이미 넣는다. 화면 Task 는 `insertMcmSecObjIfAbsent(objectId, name, "mdm")` → `insertMcmSecMenuIfAbsent(menuId, menuSeq, fullSeq, name, "dma", objectId)` → SYSADMIN `PERM_ALL` 행 → `seedMdmObjectRbac(objectId, "dma")` 를 **추가**한다. `seedMdmObjectRbac` 는 `seedMdmRbac()` 뒤에 불러야 한다. OBJECT_ID 는 `^[a-z][a-zA-Z0-9]*$` 이어야 기동한다. componentPath 는 조회 때 `PARENT_MENU_ID/OBJECT_ID` 로 만들어진다. FULL_SEQ 는 부팅 끝 `recomputeMenuFullSeq()` 가 다시 매긴다. `run()` 은 트랜잭션 하나라 SQL 오타 하나로 mcm 기동이 실패한다 | `DataInitializer.java:866-901,980-1003,1179-1211`, `mcm-core/.../SecUserService.java:397-405`, TSK-01-03 design F32 |
| F18 | E2E 시드 대조(`e2e/fixtures/mdm-rbac-seed-check.sql`)는 폴더·역할·권한 세트와 `OBJECT_ID='mdmSample'` 매핑만 조회한다. columnMng·termRegPop 을 추가해도 `.expected.txt` 는 바뀌지 않는다. `mdm-shell-rbac-smoke` T2·T3 는 메뉴 ID 를 `toContain`/`not.toContain` 으로 보므로 새 leaf 에 깨지지 않는다 | `e2e/fixtures/mdm-rbac-seed-check.sql:7-12`, `e2e/mdm-shell-rbac-smoke.spec.ts:109-135` |
| F19 | FE: 포털 page-registry 는 코드젠 파일 `src/frontend/m-mcm/lib/generated/page-registry.ts`(커밋 대상)이고 `pnpm --filter @dk-oasis/mcm generate:page-registry` 로 다시 만든다(`pages/{a}/{b}/page.tsx` 만 수집). m-mdm 은 화면마다 `tsup.config.ts` 에 entry 한 줄을 더한다. `tests/tsup-entries.smoke.test.ts` 가 디스크의 `page.tsx` 와 tsup entry 를 1:1 로 비교한다(팝업처럼 page.tsx 가 없는 폴더는 대상 밖). 팝업 경로 규약은 `pages/{group}/{screenId}/{screenId}.tsx` + `index.ts`, page.tsx 금지 | `m-mcm/scripts/generate-page-registry.mjs:191-257`, `m-mcm/package.json:6`, `m-mdm/tsup.config.ts:26-29`, `m-mdm/tests/tsup-entries.smoke.test.ts:53-58`, `screens/README.md:75-76` |
| F20 | FE 관례: 화면은 `MdmPageLayout`(`import { MdmPageLayout } from "@/shell"`, props `group·screenId·title·buttons`, objId = screenId)을 쓴다. `PageButton.action` 을 빠뜨리면 RBAC 페이지에서 **자동 비활성**이다. shared 래퍼만 쓴다: layout(`ContentBody`·`ContentPanel`·`SearchArea`·`SearchField`·`ErrorModal`·`DETAIL_*`·`canDoButton`·`useUserButtonRbac`), grid(`AgDataGrid`·`GridPanel`), form(`Input`·`Select`·`Textarea`), modal(`Modal`), message-provider(`useMessage`). `@mantine/*`·`ag-grid-*` 직접 import 금지(TSK-01-03 D11). OASIS 호출은 화면별 `api.ts` 에서 `apiRequest`(`@dk-oasis/shared/http`, non-2xx 만 throw)로 하고 **`meta.success===false` 를 직접 판정**해 throw 한다. vitest 는 `tests/**/*.test.ts` 만 수집한다 | `m-mdm/src/shell/MdmPageLayout.tsx:13-35`, `shared/src/layout/PageLayout.tsx:27-41`, `m-mls/pages/lsh/noticeMgmt/{page.tsx:14-26,api.ts:47-88}`, `m-mcm/page-components/cmz/masterRuleListPop/masterRuleListPop.tsx:1-60`, `m-mdm/vitest.config.ts` |
| F21 | OASIS 계약 검사기의 기본 모듈 목록에 mdm 이 없다(`MES_MODULES`). 기준선 명령으로는 mdm 을 검사하지 않으므로 **`--module mdm` 을 붙여 따로 돌려야** 한다. 편집 훅도 mdm 을 보지 않는다 | `.claude/skills/oasis-contract-check/scripts/check_oasis_contract.py:20,248,260` |
| F22 | 임베딩 2차 유사어 추천은 TSK-04-02 몫이다(wbs TSK-04-02 "용어 임베딩 유사어 추천", KURE-v1 런타임). TRD 는 "모델이 없으면 2차 추천을 끄고 1차 문자열 추천만 한다"고 정했다. 이 Task 의 팝업은 1차 문자열 추천만 한다. 등록한 용어의 `EMBEDDING` 은 NULL 로 남는다 | `wbs.md:531-555`, `TRD.md:137` |
| F23 | TSK-04-05 산출물(`batch/sapdict`)에는 재사용할 분해·명명 유틸이 없다(공백·괄호 분리만 있고 최장 일치·약어 조합 없음). 분해·조합 로직은 이 Task 가 새로 만든다 | `mdm/lib/.../batch/sapdict/SapDictCandidateExtractor.java`, TSK-04-05 design §1.1 |
| F24 | 백엔드 테스트 선례: 서비스+SQLite 는 `@SpringBootTest(webEnvironment=MOCK)` + `@ActiveProfiles("local")` + `@TempDir` + `@DynamicPropertySource`(`spring.datasource.url=jdbc:sqlite:<temp>`) + `@TestConfiguration` 의 `@Primary` 가짜 `MdmCurrentUser`. BPMN 까지 태우는 HTTP 테스트는 `MdmSecurityChainTest` 패턴(RANDOM_PORT, `cactus.security.client-key` 속성 고정, 환경변수 `BACKEND_CLIENT_KEY` 우선, 헤더 `X-Client-Key`·`X-Authenticated-User`·`X-Authenticated-Role`, 본문 `{"meta":{},"params":{...},"grids":{...}}`, URL `/oasis/{serviceId}/{action}`). Jackson 은 `com.fasterxml.jackson.databind` 다 | `api/src/test/.../common/version/VersionStateServiceSqliteTest.java:30-50`, `api/src/test/.../common/security/MdmSecurityChainTest.java:34-100` |
| F25 | 원천 알고리즘(한국어 → 물리명): ① 띄어쓰기로 나누고 붙여 쓴 덩어리는 용어집 기준 최장 일치 ② 동의어면 표준어로 치환 제안, 동음이의어면 의미 번호 선택, 미등록은 `***` ③ 약어를 `_` 로 연결 ④ 용어 조합의 꼬리와 가장 길게 일치하는 도메인 추천 ⑤ 같은 물리명 컬럼이 있으면 재사용 제안. 역방향: 물리명을 약어로 분해해 논리명·도메인을 보이고, 분해가 안 되면 시스템별 실제 필드명 매핑에서 찾는 폴백. `***` 가 하나라도 남으면 저장 불가. 용어 등록(인라인 포함)은 표준 관리자 역할만. 라벨은 비면 짧은 → 중간 → 긴 → 논리명 순으로 올라가고, 길이는 한글 글자 수 24/12/6 | `02-term-domain-column.md:460-545` |
| F26 | 시안: 목록(논리명·표준 물리명·표시명 긴/중간/짧은·도메인·필수·구성 용어), 자동 생성 패널(토큰 표 순서·토큰·매칭·약어·처리, 물리명 미리보기, 추천 도메인, 중복 검사), 상세 폼(논리명*·표준 물리명*·표시명 3종·도메인*·필수·기본값·참조 종류/대상/카테고리·설명·활용처 메모·라벨 파생 미리보기), 시스템별 실제 필드명 그리드(시스템·실제 필드명·변환 규칙·note·삭제, + 행 추가, 저장). 시안의 자동 생성 예시는 `편차` 가 미등록인데도 추천 도메인으로 `11 원재료 코일 두께` 를 보인다(D4) | `html/02-term-domain-column.html:416-600` |
| F27 | **화면 설계 산출물 5종이 없다.** wbs 공통 규칙은 "화면마다 설계 산출물 5종(RULE.md)을 Task 설계 단계에서 작성한다"고 했고 Mes-Guide 「개발 진입 가드」는 설계 폴더가 없으면 구현 금지다. 현재 `docs/mdm/screens/` 에는 README 뿐이다. As-Is 가 없는 신규 화면에 대해서는 mls `noticeMgmt` 가 "분석리포트 미작성(기능설계서 1종 축소 — 사용자 결정)"으로 줄인 선례가 있다(D5) | `wbs.md:28`, `docs/guide/MES/Mes-Guide.md:51-62`, `RULE.md:24-26`, `docs/guide/design/identifier-dictionary/01-modules-and-screens.md:230` |
| F28 | 새 화면은 식별자 사전 §A.3.2 표에 행을 등재한다(ADR-0003 인계, screens/README §3). 마지막 행은 `noticeMgmt`(To-Be only) 다 | `docs/guide/design/identifier-dictionary/01-modules-and-screens.md:200-230`, `adr/0003-module-boundary-screens-roles.md:86` |

---

## 1. 접근 방식

화면 하나와 팝업 하나를 mdm 의 첫 OASIS 서비스 두 개(`columnMng`, `termRegPop`)로 만든다. 분해·조합·도메인 추천·라벨 제안·유사어·약어 제안은 **Spring 과 DB 에 기대지 않는 순수 클래스**로 `com.dongkuk.dmes.mdm.dma.naming` 에 모으고, 서비스는 용어·도메인을 읽어 이 클래스에 넘기기만 한다. 이렇게 하면 규칙마다 단위 테스트로 변이 검증을 할 수 있고, TSK-04-02(용어 관리)가 같은 사전 해석을 재사용할 수 있다. 수용 기준의 두 서버 규칙(`***` 저장 불가, 권한 없는 사용자의 인라인 등록 불가)은 화면 차단과 별도로 **서버 저장 경로에서 다시 판정**한다. `***` 는 물리명 문자열만 보지 않고 저장 직전에 논리명을 서버가 다시 분해해 확인하므로, 화면을 거치지 않은 요청도 막힌다. 권한은 BFF 액션 권한(1차)에 더해 서비스가 `MdmCurrentUser.roleIds()` 에 `MDM_STD_ADMIN` 이 있는지 직접 본다(TSK-01-03 `requireSteward` 와 같은 모양, D1). 분해·역분해·유사어 조회는 READ 등급 액션(`compare`, 팝업 `search`)으로 두어 담당자도 `***` 까지 도달해 비활성 등록 버튼을 보게 하고, 쓰기는 `save`·`reg` 두 액션뿐이다(D6). OASIS 오류는 `meta.message` 만 화면에 오므로(F12), 모든 업무 오류는 **고유한 기본 문구로 시작하는 예외 message** 로 싣고 행 단위 상세는 그 문자열 뒤에 붙인다. 시스템별 실제 필드명 그리드는 행 상태(C/U/D) 대신 **컬럼의 전체 매핑 목록을 보내고 서버가 차분(diff)** 을 적용한다. PK 에 `PHYS_NAME` 이 들어 있어 "필드명 수정 = 삭제 + 삽입"이 되는데, 차분 방식이면 같은 키를 지웠다가 다시 넣는 일이 없어 Hibernate flush 순서(삽입이 삭제보다 먼저) 함정을 피한다. 스키마는 바꾸지 않는다(F3). 판단 순서는 근거 강도(spec > 승인된 선행 산출물 > 리포 관례 > 미승인 선행 산출물)를 따랐다.

### 1.1 범위 밖 (명시)

| 항목 | 이유 |
|---|---|
| `MdmColumnDictionaryLookup` 구현 | F8(소비자 몫, 빈 중복 위험) |
| 버전·상태·배포 순번(`CHG_SEQ`) 발급 | F9 |
| 임베딩 2차 유사어 추천, 용어 `EMBEDDING` 생성 | F22(TSK-04-02) |
| 용어의 동의어·별칭·사용 시스템 **입력**(팝업은 표기·의미 번호·정의·맥락·영문명·약어만) | 용어 전체 편집은 TSK-04-02 `termMng`. 팝업은 `***` 를 메우는 최소 입력 |
| 컬럼 삭제 | 시안·spec 에 없다. 시스템 매핑 행 삭제는 그리드 안에서 한다 |
| "SAP 데이터 엘리먼트 후보 제안" 버튼 | TSK-04-05 는 CSV 배치다. 화면 연결은 범위 밖 |
| 라벨 파생 미리보기의 단위 병기("(mm)") | 유효 단위는 도메인 상속 해석(TSK-04-03 `MdmEffectiveDomainResolver`)이 필요하다 |
| `REF_TARGET` 콤보 | 05 마루 데이터(TSK-07-*)가 없다. 텍스트 입력으로 두고, `MaruIdNamespace`(MASTER_DATA) 구현체가 있을 때만 존재 확인을 한다 |
| 새 Flyway 마이그레이션 | F3. `flyway-migration-add` 를 쓰지 않는다 |
| `termMng`·`domainMng`·`unitMng` 패키지·페이지·BPMN | 팀장 범위 경계(TSK-04-02·04-03) |

---

## 2. 변경 파일 목록

Build 는 아래 커밋 단위 순서대로 커밋한다. 각 커밋은 스스로 테스트가 초록이어야 한다. 경로 약칭: `LIB` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`, `LIBT` = `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm`, `APIR` = `src/backend/mdm/api/src/main/resources`, `APIT` = `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm`, `FE` = `src/frontend/m-mdm`.

### 커밋 A — 순수 명명 로직 + 단위 테스트 (`feat(mdm): 컬럼명 분해·조합 규칙을 구현한다`)

| 구분 | 경로 | 내용 |
|---|---|---|
| 생성 | `LIB/dma/naming/package-info.java` | dma 그룹 공유 명명 규칙. Spring·JPA·DB import 금지. screenId 가 아닌 그룹 공유 패키지라 ArchUnit·계약 검사기가 거부하면 `com.dongkuk.dmes.mdm.common.naming` 으로 옮기고 설계 이탈로 기록한다 |
| 생성 | `LIB/dma/naming/NamingRules.java` | 상수·정규식·정규화 유틸(§6.3) |
| 생성 | `LIB/dma/naming/TermEntry.java` (record) | `(Long termId, String termName, int senseNo, String definition, String context, String engName, String engAbbr, String synonymsJson, String aliasesJson)` |
| 생성 | `LIB/dma/naming/DomainEntry.java` (record) | `(Long domainId, String domainName, String stdName)` |
| 생성 | `LIB/dma/naming/TermDictionary.java` | 용어 목록 → 표면형 색인·약어 색인(§6.4) |
| 생성 | `LIB/dma/naming/NameToken.java`, `TermCandidate.java`, `NameComposition.java` (record), `TokenStatus.java`, `MatchVia.java`, `Direction.java` (enum) | 분해 결과 모양(§6.5) |
| 생성 | `LIB/dma/naming/ColumnNameComposer.java` | `forward(String)`·`reverse(String)`(§6.5·§6.6) |
| 생성 | `LIB/dma/naming/DomainSuggester.java` | 꼬리 최장 일치(§6.7) |
| 생성 | `LIB/dma/naming/LabelSuggester.java` | 표시명 3종 제안(§6.8) |
| 생성 | `LIB/dma/naming/SimilarTermFinder.java` | 유사어 1차 문자열 추천(§6.9) |
| 생성 | `LIB/dma/naming/AbbrSuggester.java` | 약어 제안·대안(§6.10) |
| 생성 | `LIBT/dma/naming/{TermDictionaryTest, ColumnNameComposerTest, DomainSuggesterTest, LabelSuggesterTest, SimilarTermFinderTest, AbbrSuggesterTest}.java` | §3.2 |

### 커밋 B — 오류 코드·권한 가드·서비스·BPMN·서버 테스트 (`feat(mdm): 컬럼 사전·용어 인라인 등록 OASIS 서비스를 추가한다`)

첫 테스트는 **HTTP 파이프 테스트**(§3.3 P1)다. BPMN 을 하나 만든 즉시 이 테스트로 "예외 message 가 `meta.message` 로 그대로 오고, 실패한 저장이 롤백된다"를 실측한 뒤 나머지를 쌓는다. 실측이 F12 와 다르면(예: message 가 감싸져 온다) 멈추고 설계 이탈로 기록한 뒤 화면 오류 문구 처리만 맞춘다.

| 구분 | 경로 | 내용 |
|---|---|---|
| 수정(추가만) | `LIB/contract/common/MdmErrorCode.java` | MDM016~MDM021 추가(§6.11, D2). 기존 14개 줄은 바꾸지 않는다 |
| 수정(추가만) | `LIB/common/support/MdmErrors.java` | `of(MdmErrorCode code, String detail, List<MdmCheckIssue> issues)` 오버로드: message = `defaultMessage + ": " + detail`(detail 이 비면 기존과 같음). 첫 `ErrorDetail` 과 이슈 detail 은 기존 방식 그대로 싣는다. javadoc 에 F12(OASIS 경로에서는 message 만 도달) 한 줄 추가 |
| 생성 | `LIB/common/security/MdmStdAdminGuard.java` | `@Component`. `MdmCurrentUser` 주입, `void requireStdAdmin()`: `roleIds()` 에 `MdmRoles.STD_ADMIN` 이 없으면 `MdmErrors.of(STD_ADMIN_ROLE_REQUIRED)`. SYSADMIN 우회 없음(D1) |
| 수정(추가만) | `LIB/repository/MdmColumnRepository.java` | `Optional<MdmColumn> findByColumnName(String)`, `Optional<MdmColumn> findByPhysName(String)` |
| 수정(추가만) | `LIB/repository/MdmColumnSystemRepository.java` | `List<MdmColumnSystem> findByColumnId(Long)`, `List<MdmColumnSystem> findBySystemCodeAndPhysName(String, String)`(2026-10-03 D-149 로 `findBySystemCodeAndUpperPhysNameIn` 으로 바뀌고 지워짐), `List<MdmColumnSystem> findByPhysNameIn(Collection<String>)` |
| 수정(추가만) | `LIB/repository/MdmTermRepository.java` | `boolean existsByTermNameAndSenseNo(String, int)`, `List<MdmTerm> findByTermName(String)` |
| 생성 | `LIB/dma/columnMng/dto/{ColumnMngSearchRequest, ColumnMngViewRequest, ColumnMngCompareRequest, ColumnMngSaveRequest}.java` | getter/setter 일반 클래스(§6.1) |
| 생성 | `LIB/dma/columnMng/service/ColumnMngService.java` | `@Service("columnMngService")`, `@Transactional` 금지. `search`·`view`·`compare`·`save`(§6.1·§6.12) |
| 생성 | `LIB/dma/termRegPop/dto/{TermRegPopSearchRequest, TermRegPopRegRequest}.java` | §6.2 |
| 생성 | `LIB/dma/termRegPop/service/TermRegPopService.java` | `@Service("termRegPopService")`. `search`·`reg`(§6.2·§6.13) |
| 생성 | `APIR/services/dma/columnMng.bpmn` | process `columnMng`, 액션 search·view·compare·save(§6.14). **`bpmn-skill`(bpmn-tool CLI)로 생성**, 손 편집 금지 |
| 생성 | `APIR/services/dma/termRegPop.bpmn` | process `termRegPop`, 액션 search·reg |
| 수정 | `LIBT/contract/common/CommonContractTest.java` | 개수 14 → 20, MDM016~021 의 code·httpStatus·transport·defaultMessage 단언 추가(새 코드 반영이며 완화가 아니다) |
| 수정 | `LIBT/common/support/MdmErrorsTest.java` | 오버로드 테스트 추가 |
| 생성 | `APIT/dma/DmaTestSupport.java` | 테스트 공용: `@TestConfiguration` 의 `@Primary MutableCurrentUser implements MdmCurrentUser`(`set(userId, Set<String> roles)`), 용어·도메인·컬럼 삽입 헬퍼(엔티티 save) |
| 생성 | `APIT/dma/columnMng/ColumnMngServiceSqliteTest.java` | §3.3 |
| 생성 | `APIT/dma/termRegPop/TermRegPopServiceSqliteTest.java` | §3.3 |
| 생성 | `APIT/dma/DmaOasisHttpTest.java` | BPMN 까지 태우는 파이프 테스트(§3.3) |
| 생성 | `APIT/dma/DmaBpmnActionTest.java` | 두 BPMN 의 게이트웨이 분기 이름이 허용 목록과 같은지(§3.3) |

### 커밋 C — 메뉴·OBJECT·RBAC 시드 (`feat(mdm): 컬럼 사전 메뉴와 권한을 시드한다`)

| 구분 | 경로 | 내용 |
|---|---|---|
| 수정(블록 추가만) | `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` | `seedMdmMenus()` 안, `seedMdmObjectRbac("mdmSample", "dma");` **다음 줄**부터 §6.15 블록을 추가한다. 기존 줄(로그 문구 포함)은 고치지 않는다 |

### 커밋 D — 화면·팝업 (`feat(mdm): 컬럼 사전 화면과 용어 인라인 등록 팝업을 추가한다`)

| 구분 | 경로 | 내용 |
|---|---|---|
| 생성 | `FE/pages/dma/columnMng/page.tsx` | 화면(§6.16) |
| 생성 | `FE/pages/dma/columnMng/api.ts` | OASIS 래퍼, `unwrap` export(§6.17) |
| 생성 | `FE/pages/dma/columnMng/types.ts` | 응답·폼 타입 |
| 생성 | `FE/pages/dma/columnMng/labels.ts` | `resolveLabels(row)` 폴백(I11) |
| 생성 | `FE/pages/dma/columnMng/tokens.ts` | `composePhysName`·`composeLogicalName`·`hasPlaceholder`·`replaceToken`(§6.16) |
| 생성 | `FE/pages/dma/termRegPop/termRegPop.tsx` | `TermRegPopModal`(§6.18) |
| 생성 | `FE/pages/dma/termRegPop/index.ts` | 배럴: `TermRegPopModal`, `OBJ_ID = "termRegPop"`, 타입 |
| 생성 | `FE/pages/dma/termRegPop/api.ts` | `search`·`reg` 래퍼 |
| 수정 | `FE/tsup.config.ts` | entry 한 줄 `"pages/dma/columnMng/page": "pages/dma/columnMng/page.tsx"` 추가 |
| 생성 | `FE/tests/dma/columnMng/{labels,tokens,api}.test.ts` | §3.4 |
| 수정(코드젠) | `src/frontend/m-mcm/lib/generated/page-registry.ts` | `( cd src/frontend && pnpm --filter @dk-oasis/mcm generate:page-registry )` 결과. `"dma/columnMng"` 한 줄이 늘어야 한다. 손으로 고치지 않는다 |
| 수정(행 추가) | `docs/guide/design/identifier-dictionary/01-modules-and-screens.md` | §A.3.2 표 마지막 행(230) 뒤에 두 행: `` | `columnMng` | — (To-Be only) | `mdm` | `dma` | `columnMng` | 2026-09-24 | 컬럼 사전 — As-Is 없음(신규). TSK-04-04 | `` 와 `` | `termRegPop` | — (To-Be only) | `mdm` | `dma` | `termRegPop` | 2026-09-24 | 용어 인라인 등록 팝업(columnMng 에서 호출, 메뉴 leaf 없음). TSK-04-04 | `` |

### 커밋 E — E2E (`test(mdm): 컬럼 사전 E2E 를 추가한다`)

| 구분 | 경로 | 내용 |
|---|---|---|
| 생성 | `src/frontend/e2e/mdm-columnMng.spec.ts` | §3.5 |
| 생성 | `src/frontend/e2e/fixtures/mdm-columnMng-dict.sql` | mdm.db 용 용어·도메인 픽스처(§3.6). 운영 Flyway 시드가 아니다 |
| 생성 | `docs/mdm/tasks/TSK-04-04/screens/*.png` | E2E 가 남기는 스크린샷 |

### 변경하지 않음 (참고만)

`db/migration/**`(V1~V3 두 방언), `MdmActions`·`MdmPermissions`·`MdmRoles`, `DataInitializer` 의 `allActions`·`seedMdmRbac`·`seedMdmObjectRbac` 본문, `e2e/fixtures/mdm-rbac-seed-check.*`, `mdm-rbac-users.sql`, `m-mdm/package.json`, `m-mdm/src/shell/**`, cactus-core·oasis-core, `docs/mdm/tasks/TSK-04-04/state.json`.

---

## 3. 테스트 전략

### 3.1 게이트 (기준선 대비 신규 실패 0 + 총수 미감소)

| 게이트 | 명령 | 기준선 → 기대 |
|---|---|---|
| 백엔드 전체 | `( cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --console=plain )` 후 TEST-*.xml 합산 | 1274 / 0 → 1274 + 신규, 실패 0 |
| FE m-mdm test | `( cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test )` | 5 files / 26 → 8 files 이상, 실패 0 |
| FE m-mdm lint | `( cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint )` | pass |
| FE shared | `( cd src/frontend && pnpm test:unit:shared )` | 23 / 156 그대로 |
| OASIS 계약(기준선) | `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` | ERROR 0 / WARN 0 |
| **OASIS 계약(mdm, 신규)** | `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root . --module mdm` | ERROR 0 (F21. `Map` 반환 INFO 는 허용) |
| page-registry 동기 | 코드젠을 다시 돌린 뒤 `/usr/bin/git diff --exit-code src/frontend/m-mcm/lib/generated/page-registry.ts` | 커밋 뒤 diff 없음 |
| 마이그레이션 불변 | `/usr/bin/git diff --stat origin/dev -- src/backend/mdm/api/src/main/resources/db/migration` | 출력 없음(I24) |
| E2E | §3.6 절차 | `mdm-shell-rbac-smoke`(4) + `mdm-sample-smoke`(1) + `mdm-columnMng`(6) = 11 passed, 시드 diff 없음 |

MSSQL 수동 게이트(`:api:mssqlMigrationTest`)는 마이그레이션을 바꾸지 않으므로 대상이 아니다.

### 3.2 순수 로직 단위 테스트 (`LIBT/dma/naming/`, 커밋 A)

기본 사전 픽스처(테스트 안 상수): 원재료(1, RMTL, synonyms `["원자재(ERP)"]`), 원재(1, RMJ — 최장 일치 대조용), 코일(1, COIL, synonyms `["배치(ERP)","배치넘버(ERP)"]`, aliases `["코일ID"]`), 소둔배치(1, ANN_BATCH, synonyms `["배치(MES 소둔 화면)"]`), 두께(1, THK), 아이디(1, ID), 편성(1, 약어 없음), 오차(1, ERR, engName `Error`). F8b 만 기본 사전에 차(1, CHA)를 더한 별도 사전을 쓴다(기본 사전에 넣으면 F2 의 `편차` 가 쪼개진다).

| 테스트 | 케이스 | 단언 |
|---|---|---|
| `TermDictionaryTest` | T1 동의어 `"배치(ERP)"`·`"배치(ERP, APS)"`·`"배치"` 가 모두 표면형 `배치` | 표면형 색인에 `배치 → 코일(SYNONYM)` |
| | T2 객체 원소 `{"name":"배치","systems":["ERP"]}`·`{"term":"배치"}` 도 읽는다 | 같은 결과(D3 관대 파서) |
| | T3 잘못된 JSON·null·숫자 원소 | 예외 없이 무시 |
| | T4 별칭 `"코일ID"` → 표면형 `코일ID`(대문자 정규화 키 `코일ID`) | ALIAS |
| | T5 약어 색인은 대소문자 무시, 같은 약어가 대소문자만 다르게 둘이면 termId 가 작은 쪽 | |
| `ColumnNameComposerTest` | F1 `"원재료 코일두께"` | 토큰 3개(원재료·코일·두께) MATCHED, physName `RMTL_COIL_THK`, logicalName `원재료 코일 두께`, placeholder=false |
| | F2 `"원재료 코일두께 편차"` | 4번째 UNKNOWN `편차`, physName `RMTL_COIL_THK_***`, placeholder=true |
| | F3 `"원재료코일"`(사전에 `원재`·`원재료` 둘 다) | 첫 토큰 `원재료`(최장), `원재`+`료…` 아님 |
| | F4 `"원자재 두께"`(원재료 synonyms `["원자재(ERP)"]`) | 첫 토큰 SYNONYM, 선택 용어 원재료, 약어 RMTL, logicalName `원재료 두께` |
| | F5 `"배치"`(코일·소둔배치 두 용어의 동의어) | AMBIGUOUS, 후보 2개, 기본 선택은 정렬 첫째(§6.5 정렬: via 같음 → senseNo → termId), physName 은 선택 용어 약어 |
| | F6 빈 사전 + `"원재료 코일두께"` | 토큰 2개 모두 UNKNOWN(`원재료`, `코일두께`), physName `***_***`, 예외 없음 |
| | F7 `"두께(mm)/코일"` | 구분자 `(`·`)`·`/` 로 덩어리 `두께`·`mm`·`코일` |
| | F8a `"편차두께"`(사전에 `차` 없음) | UNKNOWN `편차`(표면형이 시작되는 위치 2 에서 멈춤) + MATCHED `두께` |
| | F8b `"편차두께"`(사전에 `차` 있음) | UNKNOWN `편` + MATCHED `차` + MATCHED `두께`. 규칙 I3 이 "다음 표면형 시작 위치"에서 멈춘다는 것을 고정하는 대조 케이스다 |
| | F9 `"편성 두께"` | `편성` NO_ABBR, physName `***_THK`, placeholder=true |
| | R1 reverse `"RMTL_COIL_THK"` | 원재료·코일·두께, logicalName `원재료 코일 두께` |
| | R2 reverse `"ANN_BATCH_ID"` | `ANN_BATCH`(2부분 약어 최장) + `ID` |
| | R3 reverse `"RMTL_COIL_THK_DEV"`(DEV 없음) | 마지막 UNKNOWN, logicalName `원재료 코일 두께 ***`, placeholder=true |
| | R4 reverse `" rmtl_coil_thk "` | 대문자·트림 정규화 후 R1 과 같음 |
| `DomainSuggesterTest` | D1 `RMTL_COIL_THK` + 도메인 {10 COIL_THK, 11 RMTL_COIL_THK} | 순서 [11(3), 10(2)], 추천 11 |
| | D2 `RMTL_COIL_THK_***` | 결과 없음, 추천 null(D4) |
| | D3 같은 길이 일치 둘 | domainId 오름차순 |
| | D4 `COIL_THK` + 도메인 `RMTL_COIL_THK` | 일치 안 함(도메인이 더 길다) |
| | D5 빈 도메인 목록 | 빈 결과 |
| `LabelSuggesterTest` | L1 `원재료 코일 두께` | long `원재료 코일 두께`, mid 같음, short `코일두께` |
| | L2 25자 이상 논리명 | long 빈 문자열 |
| | L3 짧은 규칙에 맞는 후보가 없음(마지막 단어가 7자 이상) | short 빈 문자열 |
| | L4 길이는 code point 수 | |
| `SimilarTermFinderTest` | S1 `편차` → 오차(표기 유사, 편집 거리 1) | reason `NAME_SIMILAR` |
| | S2 `코일두` → 코일(부분 일치) | `NAME_PARTIAL` |
| | S3 `배치넘버` → 코일(동의어 일치) | `SYNONYM_ALIAS` |
| | S4 engName `error` → 오차 | `ENG_NAME` |
| | S5 정렬(score 내림, termName, senseNo)·최대 20건·빈 사전 빈 결과 | |
| `AbbrSuggesterTest` | A1 `Deviation`, 사용 약어 없음 | base `DEV`, baseTaken=false, suggested `DEV` |
| | A2 `DEV` 사용 중 | baseTaken=true, suggested `DEVI`, alternatives `[DEVI, DEVIA, DEVIAT]` |
| | A3 사용 약어 `dev`(소문자) | 사용 중으로 본다 |
| | A4 `Raw-Material 2` | 영숫자만 남겨 `RAWMATERIAL2` → base `RAW` |
| | A5 빈 문자열·숫자로 시작 | suggested null |
| | A6 base 가 3자 미만(`Id`) | base `ID`, 사용 중이면 `ID2`…`ID9` |

### 3.3 서버 테스트 (`APIT/dma/`, 커밋 B)

두 서비스 테스트(`ColumnMngServiceSqliteTest`·`TermRegPopServiceSqliteTest`) 공통: `@SpringBootTest(MOCK)` + `@ActiveProfiles("local")` + `@TempDir` SQLite + `@Import(DmaTestSupport.Config.class)`. **`DmaOasisHttpTest` 는 이 설정을 가져오지 않는다.** 가짜 `MdmCurrentUser` 없이 `X-Authenticated-Role` 헤더 → `ClientKeyFilter` → `CactusMdmCurrentUser` 실제 경로로 역할을 주어야 P1·P6 가 서버 권한 검사의 증거가 된다(데이터 준비는 `JdbcTemplate` 또는 리포지토리 빈으로 한다). 각 테스트 전 `MutableCurrentUser` 를 설정하고, 테스트 데이터는 리포지토리 save 로 넣는다(Flyway 운영 시드 금지). ThreadLocal 정리(`UserContextHolder.clear()`, `AuditHolder.remove()`)는 `AbstractVersionStateScenarioTest.java:100-119` 선례를 따른다. 예외 단언은 `BusinessException` 의 message 가 해당 `MdmErrorCode.defaultMessage()` 로 **시작**하는지로 한다.

**`ColumnMngServiceSqliteTest`**

| # | 시나리오 | 기대 |
|---|---|---|
| C1 | 빈 DB 에서 search | `list=[]`, `domains=[]`, `systems` = ERP·MES·APS·DKMS·L2(MDM 제외, 코드 오름차순) |
| C2 | STD_ADMIN 으로 정상 저장(systems 2행, terms 3행) → view | 컬럼 필드 왕복, `TERM_IDS` 가 `"[1,2,3]"` 형태(공백 없음, 순서 보존), systems 2행 |
| C3 | **담당자(STEWARD)만** 으로 save | MDM016, 행 0(아무 읽기·쓰기 전에 거부) |
| C4 | **SYSADMIN 만** 으로 save | MDM016(D1) |
| C5 | physName `RMTL_COIL_THK_***` 로 save(나머지 정상) | **MDM017**(MDM021 아님) |
| C6 | physName 은 `RMTL_COIL_THK_DEV` 지만 논리명 `원재료 코일 두께 편차`(편차 미등록) | MDM017(서버 재분해) |
| C7 | terms 에 없는 termId | MDM017 |
| C7b | 논리명 `원재료 코일 두께 ***`(역분해 결과를 그대로 적용한 모양), 물리명 `RMTL_COIL_THK_DEV`, terms 비움 | MDM017(`*` 는 분해 구분자라 재분해만으로는 잡히지 않는다 → ④ 조건) |
| C8 | terms 그리드 비어 있음 | 서버가 재분해 기본 선택으로 TERM_IDS 를 채워 저장 |
| C9 | 다른 컬럼이 이미 ERP·`MATNR` 을 가진 상태에서 새 컬럼에 ERP·`MATNR` | **MDM018**, 새 컬럼도 저장되지 않음(롤백 대신 저장 전에 검사하므로 행 0) |
| C10 | 한 요청 안에 ERP·`MATNR` 두 번 | MDM018 |
| C11 | 같은 컬럼에 ERP·`MATNR`, ERP·`CHARG` | 성공(한 컬럼·한 시스템·여러 이름 허용) |
| C12 | 다른 컬럼이 ERP·`MATNR` 인데 새 컬럼에 ERP·`matnr` | MDM018(2026-10-03 D-149 로 바뀜 — 다른 컬럼과는 대소문자 무시) |
| C13 | 자기 컬럼을 다시 저장(같은 매핑 유지) | 자기 자신과는 충돌하지 않음 |
| C14 | 매핑 차분: 기존 {ERP·A(transform X), MES·B} → 요청 {ERP·A(transform Y), APS·C} | ERP·A 는 UPDATE(transform Y, VER+1), MES·B 삭제, APS·C 삽입 |
| C15 | 같은 논리명 또는 같은 물리명의 다른 컬럼 존재 | MDM019 |
| C16 | 표시명 긴 25자 / 중간 13자 / 짧은 7자(각각) | MDM021, 메시지에 칸 이름 |
| C17 | domainId 없음·존재하지 않는 domainId | MDM021 |
| C18 | physName 소문자 `rmtl_thk` | MDM021(형식) |
| C19 | 시스템 코드 `MDM`(자기 행)·`XXX` | MDM021 |
| C20 | 완전히 빈 매핑 행(systemCode·physName 모두 공백) | 무시하고 저장 |
| C21 | search keyword `matnr`(소문자) | ERP·MATNR 을 가진 컬럼이 나온다(실제 필드명 검색, 대소문자 무시) |
| C22 | search keyword `두께`, domainId 필터 | 논리명 부분 일치 + 도메인 필터 |
| C23 | compare FORWARD `원재료 코일두께`(사전·도메인 픽스처) | tokens·physName·labels·domains·recommendedDomainId·duplicates |
| C24 | compare 빈 사전 | 모든 토큰 UNKNOWN, 예외 없음 |
| C25 | compare REVERSE `CHARG`(용어로 분해 불가, 매핑에 ERP·CHARG 존재) | duplicates 에 `matchedBy=SYSTEM_FIELD`, systemCode `ERP`, 그 컬럼의 도메인 |
| C26 | compare FORWARD 결과 물리명과 같은 컬럼이 이미 있음 | duplicates 에 `matchedBy=PHYS_NAME` |
| C27 | REF_KIND `MASTER` 인데 REF_TARGET 없음 / REF_KIND 비었는데 REF_TARGET 있음 / REF_KIND `OTHER` | MDM021 |
| C28 | `MaruIdNamespace`(MASTER_DATA) 테스트 빈이 `contains=false` | MDM021. 빈이 없으면 검사 생략(별도 케이스) |

**`TermRegPopServiceSqliteTest`**

| # | 시나리오 | 기대 |
|---|---|---|
| R1 | STD_ADMIN 으로 `편차`/1/정의/`Deviation`/`DEV` 등록 | 행 1, `SRC_ORIGIN='MDM:columnMng'`, SYNONYMS·ALIASES·SYSTEMS·EMBEDDING NULL, 반환 `term.termId` |
| R2 | **STEWARD 만**·SYSADMIN 만·역할 없음 | MDM016, 행 0 |
| R3 | 같은 (표기, 의미 번호) | MDM020 |
| R4 | 약어 `dev` 가 이미 있는데 `DEV` 등록 | MDM020, message 에 대안(`DEVI` …) |
| R5 | 표기에 공백·기호(`두께 편차`, `편차!`), 약어 소문자·`_` 로 시작, 정의 공백, 의미 번호 0 | MDM021 |
| R6 | search `편차` + engName `Deviation`(오차 존재) | similar 에 오차, nextSenseNo 1, abbr.suggested `DEV` |
| R7 | 등록 직후 columnMng compare `원재료 코일두께 편차` | 편차가 MATCHED, physName `RMTL_COIL_THK_DEV`(요청마다 사전을 새로 읽음, I26) |

**`DmaOasisHttpTest`**(RANDOM_PORT, `MdmSecurityChainTest` 패턴, 본문은 `{"meta":{"menuId":"columnMng"},"params":{…},"grids":{…}}`)

| # | 요청 | 기대 |
|---|---|---|
| P1 | **(가장 먼저 작성)** 역할 `MDM_STEWARD` 로 `/oasis/columnMng/save` 정상 본문 | HTTP 200, `meta.success=false`, `meta.message` 가 MDM016 기본 문구로 시작, DB 컬럼 0행 |
| P2 | 역할 `MDM_STD_ADMIN` 으로 save, physName 에 `***` | `meta.message` 가 MDM017 문구로 시작, 행 0 |
| P3 | STD_ADMIN 정상 save | `meta.success=true`, `data.result.columnId` 숫자 |
| P4 | STD_ADMIN save 인데 `grids.terms` 를 **빼고** 보냄 | 성공(서비스가 null 그리드를 빈 목록으로 다룬다). 바인딩이 실패하면 설계 이탈로 기록하고 FE 가 항상 두 그리드를 보내는 규칙(I16)으로만 막는다 |
| P5 | STEWARD 로 search·view·compare | 모두 `meta.success=true`(읽기에는 서버 역할 검사 없음) |
| P6 | STEWARD 로 `/oasis/termRegPop/reg` | MDM016 문구 |
| P7 | STD_ADMIN 으로 termRegPop search·reg | 성공, `data.result.term.termId` |
| P8 | 저장 중 뒤 단계 실패(C9 조건)가 앞 단계 쓰기를 남기지 않는다 | 행 수 불변(프로세스 트랜잭션 롤백 실측) |

**`DmaBpmnActionTest`**: 클래스패스의 `services/dma/columnMng.bpmn`·`termRegPop.bpmn` 을 XML 로 읽어 `sourceRef="actionGateway"` 인 sequenceFlow 의 `name` 집합이 각각 `{search, view, compare, save}`·`{search, reg}` 와 **정확히 같은지**, 모두 `MdmActions` 상수인지, 쓰기 액션(`save`·`reg`)을 뺀 나머지가 `MdmPermissions.READ_ACTIONS` 에 속하는지, 모든 serviceTask 에 `output=result` 가 있고 `grid` 속성이 없는지 단언한다.

### 3.4 FE 단위 테스트 (vitest, 커밋 D)

| 파일 | 케이스 |
|---|---|
| `tests/dma/columnMng/labels.test.ts` | 짧은 비면 중간, 중간도 비면 긴, 셋 다 비면 논리명, 공백만 있는 값은 빈 값, 원값이 있으면 그대로 |
| `tests/dma/columnMng/tokens.test.ts` | 약어 `_` 연결, UNKNOWN·NO_ABBR 은 `***`, `replaceToken` 으로 `***` 자리를 용어로 바꾸면 물리명·논리명이 다시 계산됨, `hasPlaceholder` |
| `tests/dma/columnMng/api.test.ts` | `unwrap`: `meta.success=false` 면 `meta.message` 로 throw, 성공이면 `data.result` 펼침. `fetch` 는 vi mock |

tsup entry 는 기존 `tsup-entries.smoke.test.ts` 가 자동으로 검사한다.

### 3.5 브라우저 E2E — `src/frontend/e2e/mdm-columnMng.spec.ts`

`mdm-shell-rbac-smoke.spec.ts` 의 `login`·메뉴 이동 방식을 복제한다(`BASE_URL = SMOKE_MCM_BASE_URL`, 사용자 `SMOKE_MDM_STDADMIN_USER ?? "e2e_mdm_stdadmin"`, `SMOKE_MDM_STEWARD_USER ?? "e2e_mdm_steward"`, 비밀번호 `admin123`). `test.describe.configure({ mode: "serial" })`, `test.setTimeout(150_000)`. 스크린샷은 `path.resolve(__dirname, "../../..", "docs/mdm/tasks/TSK-04-04/screens", name)`, fullPage. 머리 주석에 "새 mdm.db + 픽스처 전제, 같은 DB 로 재실행 불가"를 적는다. 쓰기 단계는 **모두 표준 관리자**로 한다(admin=SYSADMIN 은 서버가 거부한다, D1).

| # | 사용자 | 절차 | 단언 | 스모크 넷·수용 기준 |
|---|---|---|---|---|
| E1 | 표준 관리자 | 사이드바 `마루 MDM` → `용어·도메인` → `컬럼 사전` | breadcrumb `마루 MDM > 용어·도메인 > 컬럼 사전`, 목록 빈 상태 표시(`data-testid="column-list-empty"` 또는 그리드 no-rows 문구) | 넷1, 넷2(빈 상태), AC3 · `dma-columnMng-empty.png` |
| E2 | 표준 관리자 | 자동 생성에 `원재료 코일두께 편차` → [분해] | 토큰 4행, 4번째 `***`(`data-testid="token-placeholder-4"`), 미리보기 `RMTL_COIL_THK_***`, 추천 도메인 없음. [상세에 적용] → [저장] | 화면 오류 `미등록 용어(***)가 남아 있어 저장할 수 없습니다` 표시, 목록 변화 없음 | AC4(화면) · `dma-columnMng-generate.png` |
| E3 | 표준 관리자 | `***` 클릭 → 팝업 | 유사어 표에 `오차`, 표기 `편차`·의미 번호 1 미리 채움. 영문명 `Deviation` → [약어 제안] → `DEV`. 정의 입력 → [등록] | 팝업 닫힘, 미리보기 `RMTL_COIL_THK_DEV`, 추천 도메인 `두께 편차 (THK_DEV)` | `dma-termRegPop.png` |
| E4 | 표준 관리자 | [상세에 적용] → 짧은 표시명 비우기 → 시스템 행 추가 MES·`RMTL_COIL_THK_DEV`, ERP·`ZZ_RMTL_COIL_THK_DEV` → [저장] | 성공 메시지, 목록에 새 행, 표시명 칸이 `…/…/<중간값>`(짧은 칸 폴백) | 넷3, AC2 · `dma-columnMng-saved.png` |
| E5 | 표준 관리자 | [신규] → `코일 두께` 분해 → 적용 → 도메인 `코일 두께` → 시스템 행 ERP·`ZZ_RMTL_COIL_THK_DEV` → [저장] | 오류 모달에 MDM018 기본 문구, 목록에 `코일 두께` 없음. 이어서 검색어 `zz_rmtl_coil_thk_dev` 조회 → E4 컬럼 1건. 역분해 `CHARG` 대신 `ZZ_RMTL_COIL_THK_DEV` 역분해 → 중복 목록에 `SYSTEM_FIELD` 매치 | 넷4, AC1 · `dma-columnMng-dup-error.png` |
| E6 | 담당자 | 메뉴로 화면 진입 → `코일 너비` 분해 → `***` 클릭 | 팝업 [등록] 비활성, 안내 문구 `용어 등록은 표준 관리자만 할 수 있습니다`, 화면 [저장] 비활성. `page.request.post(BASE_URL + "/api/mdm/oasis/termRegPop/reg", {data:{params:{…}}})` 와 `/columnMng/save` 가 **403** + `error.code="FORBIDDEN"` | AC5(화면·BFF. 서버 거부는 P6·R2) · `dma-termRegPop-steward.png` |

화면이 조작 대상에 붙일 `data-testid`(Build 는 이 이름을 그대로 쓴다): `column-search-keyword`, `column-list`, `gen-direction`, `gen-input`, `gen-decompose`, `gen-apply`, `gen-preview`, `gen-domain`, `token-row-{seq}`, `token-placeholder-{seq}`, `form-column-name`, `form-phys-name`, `form-label-long`, `form-label-mid`, `form-label-short`, `form-domain`, `system-grid`, `term-pop`, `term-pop-similar`, `term-pop-eng-name`, `term-pop-abbr`, `term-pop-abbr-suggest`, `term-pop-definition`, `term-pop-reg`, `term-pop-no-permission`.

### 3.6 E2E 서버 절차

공통 프롬프트 절차를 그대로 쓰고 **두 단계만 더한다.** 서버 스크립트(`be-run.sh`·`fe-run.sh`)는 쓰지 않는다.

```bash
W=/Users/jji/project/dmes-standard/dflow-88a2e470
SP=<자기 scratchpad 폴더>
J=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
# 0) 빈 포트 확인(기준선 18404·18496·15404). LISTEN 이 있으면 다른 번호
lsof -iTCP:18404 -sTCP:LISTEN; lsof -iTCP:18496 -sTCP:LISTEN; lsof -iTCP:15404 -sTCP:LISTEN
# 1) 새 DB 로 시작한다(추가 단계 ①). 기존 파일은 지우지 않고 옮긴다. 이 spec 은 용어·컬럼을 만들기 때문에 같은 mdm.db 로는 재실행할 수 없다
mkdir -p $W/src/backend/data
[ -f $W/src/backend/data/mcm.db ] && mv $W/src/backend/data/mcm.db $SP/mcm.db.$(date +%s)
[ -f $W/src/backend/data/mdm.db ] && mv $W/src/backend/data/mdm.db $SP/mdm.db.$(date +%s)
# 2)·3) mcm·mdm 백엔드 기동 — 공통 프롬프트 2)·3) 그대로. 두 로그에 "Started ... in" 확인, SQLite 경로가 워크트리 src/backend/data 인지 확인
# 4) mcm 시드 대조 + 시험 사용자 — 공통 프롬프트 4) 그대로
# 4b) mdm 사전 픽스처(추가 단계 ②) — mdm 기동(Flyway V3 적용) 뒤에만
( cd $W/src/frontend && sqlite3 $W/src/backend/data/mdm.db < e2e/fixtures/mdm-columnMng-dict.sql )
sqlite3 $W/src/backend/data/mdm.db "SELECT COUNT(*) FROM TB_MDM_TERM; SELECT COUNT(*) FROM TB_MDM_DOMAIN;"   # 5 / 4 기대
# 5) 포털 — 공통 프롬프트 5) 그대로(pnpm build:libs 먼저)
# 6) 스모크 — 자기 포털, --workers=1
( cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15404 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  pnpm exec playwright test e2e/mdm-shell-rbac-smoke.spec.ts e2e/mdm-sample-smoke.spec.ts e2e/mdm-columnMng.spec.ts --workers=1 )
# 7) 부산물 복원 — 공통 프롬프트 7) 그대로(TSK-01-02·01-03 스크린샷, next-env.d.ts, test-results). TSK-04-04 스크린샷은 커밋한다
# 8) 정리 — 자기 PID, 그다음 자기 포트 리스너만. 전역 gradlew --stop·pkill·killall·pgrep -f 금지
```

- mdm 백엔드 코드를 바꾸면 mdm 만 다시 띄우되 **mdm.db 를 다시 옮기고 4b 를 다시** 한다. DataInitializer 를 바꾸면 mcm 을 새 DB 로 다시 띄우고 4) 를 다시 한다.
- 권한 캐시: BFF 권한 캐시 60초, `UserPermCache` 10분(TSK-01-03 §6). 시드를 바꾼 뒤에는 mcm 을 새로 띄워 캐시 영향을 없앤다.

**픽스처 `e2e/fixtures/mdm-columnMng-dict.sql` 내용**(INSERT 만, DELETE 없음. 재실행 안전을 위해 용어는 `INSERT OR IGNORE`(유일 인덱스 있음), 도메인은 `INSERT … SELECT … WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_DOMAIN WHERE STD_NAME = …)`(도메인에는 이름 유일 인덱스가 없다)):

| 용어 | 의미 | 정의 | 영문명 | 약어 | 동의어(JSON) |
|---|---|---|---|---|---|
| 원재료 | 1 | 제품 생산에 투입되는 재료 | Raw Material | RMTL | `["원자재(ERP)"]` |
| 코일 | 1 | 생산·이동 단위인 코일 한 개 | Coil | COIL | `["배치(ERP)","배치넘버(ERP)"]` |
| 두께 | 1 | 대상의 두꺼운 정도 | Thickness | THK | NULL |
| 아이디 | 1 | 대상을 유일하게 식별하는 값 | Identifier | ID | NULL |
| 오차 | 1 | 측정값과 참값의 차이 | Error | ERR | NULL |

| 도메인명 | 표준명 | 종류 | 데이터 타입 | 길이 | 소수 |
|---|---|---|---|---|---|
| 코일 두께 | COIL_THK | QTY | NUMBER | 3 | 1 |
| 원재료 코일 두께 | RMTL_COIL_THK | QTY | NUMBER | 3 | 1 |
| 두께 편차 | THK_DEV | QTY | NUMBER | 3 | 1 |
| 코일 식별자 | COIL_ID | ID | STRING | 20 | NULL |

감사 칼럼은 `C_USR_ID='e2e-fixture'`, `C_PGM_ID='mdm-columnMng-dict.sql'`, `VER=0`, 나머지 NULL. `PARENT_DOMAIN_ID`·`UNIT_CODE`·`MARU_CODE_ID` NULL(CK 두 개를 통과한다: CODE·FLAG 가 아니다).

### 3.7 화면 스모크 넷 판정

| 넷 | 판정 | 시험 |
|---|---|---|
| 1 메뉴 이동 | 적용 | E1, E6 |
| 2 목록 서버 데이터 / 빈 상태 | 적용 | E1(빈 상태), E4(저장 후 목록), E5(실제 필드명 검색) |
| 3 등록·수정 1회 | 적용 | E4 |
| 4 서버 오류 표시 | 적용 | E5(MDM018 문구) |

---

## 4. 수용 기준 매핑

| 수용 기준 | 서버 검증 | 화면 검증 |
|---|---|---|
| AC1 한 시스템 안 같은 필드명의 두 번째 등록 거부 | C9·C10(거부), C11·C12·C13(허용 경계), P8(롤백) | E5 |
| AC2 라벨이 비면 더 긴 쪽으로 대체해 표시 | 해당 없음(원천 "사전은 셋을 다 내려보내고 고르지 않는다" → 폴백은 표시 쪽 책임) | `labels.test.ts`, E4 |
| AC3 포털 메뉴에서 화면이 열리고 e2e `mdm-columnMng.spec.ts` 가 통과 | 시드(§6.15) | E1~E6 전체 통과 |
| AC4 `***` 가 남으면 저장 불가 | C5·C6·C7, P2 | E2 |
| AC5 권한 없는 사용자는 인라인 등록 불가 | R2, P6(서비스 역할 검사), BFF 403 | E6 |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

변이 검증은 이 표를 순회한다. "잡는 테스트"가 변이 뒤 빨강이 되어야 한다.

| # | 규칙 | 잡는 테스트 | 변이 예시 |
|---|---|---|---|
| I1 | 자리 표시자는 글자 그대로 `***` 다. UNKNOWN·NO_ABBR 토큰은 물리명에서 정확히 `***` 한 조각이 되고, 역분해 논리명에서도 `***` 다 | F2, F9, R3, `tokens.test.ts` | `"??"` 로 바꿈, NO_ABBR 을 빈 문자열로 |
| I2 | 덩어리 분해는 왼쪽부터 **최장 일치(greedy)** 다 | F3 | 최단 일치로 바꿈 |
| I3 | 미등록 구간은 "다음에 사전 표면형이 시작되는 위치 직전"까지다(덩어리 끝까지도, 한 글자도 아님) | F8 | 덩어리 끝까지 묶음, 한 글자씩 끊음 |
| I4 | 덩어리 구분자는 공백과 `[가-힣A-Za-z0-9]` 밖의 모든 문자다. 비교 키는 영문 대문자화 | F7, T4 | `(` 를 글자로 취급 |
| I5 | 표면형 = 표기 + 동의어 + 별칭. 동의어는 끝의 `(…)` 를 떼어 쓰고, JSON 원소는 문자열 또는 `name`/`term` 필드 객체를 받으며 잘못된 JSON 은 무시한다(D3) | T1~T4 | 별칭 제외, 괄호 미제거, 파싱 오류 전파 |
| I6 | 후보 정렬은 via(NAME < SYNONYM < ALIAS) → senseNo → termId, termId 중복 제거. 후보 2개 이상이면 AMBIGUOUS 이고 첫 후보를 기본 선택한다 | F5 | 정렬 뒤집기, 첫 후보 대신 null |
| I7 | 후보 1개가 동의어로 잡히면 SYNONYM 이고 표준 용어의 약어·표기를 쓴다 | F4 | 동의어 표면형을 그대로 논리명에 씀 |
| I8 | 역분해는 `_` 조각 여러 개로 된 약어까지 최장 일치하고 대소문자를 무시한다 | R2, R4 | 조각 1개씩만 대조 |
| I9 | 도메인 추천 = 물리명 `_` 토큰 목록의 **꼬리**와 도메인 표준명 토큰 목록이 같은 것 중 가장 긴 것. 동률은 domainId 오름차순. `***` 는 어떤 토큰과도 같지 않다. 없으면 null(D4) | D1~D5, C23 | 머리 일치, 부분 문자열 일치, `***` 무시 |
| I10 | 표시명 제안: 긴 = 논리명(24자 초과면 빈 값), 중간·짧은 = 논리명 → 공백 제거 → 앞 단어부터 하나씩 떼고 공백 제거 순으로 12·6자 이하 첫 후보, 없으면 빈 값. 길이는 code point | L1~L4 | 한도 뒤바꿈, 뒤 단어부터 뗌 |
| I11 | 표시 폴백은 짧은 → 중간 → 긴 → 논리명. 공백만 있는 값은 빈 값 | `labels.test.ts`, E4 | 짧은이 비면 논리명으로 바로 감 |
| I12 | 저장은 `***` 가 남으면 **MDM017** 으로 거부한다: ① 물리명에 `*` 포함 ② 서버가 논리명을 다시 분해해 UNKNOWN/NO_ABBR 이 있음 ③ terms 의 termId 가 없음 ④ 논리명에 `*` 포함. 이 검사는 역할·필수값 검사 다음, 형식·길이 검사보다 **먼저**다 | C5·C6·C7·C7b, P2 | 검사 삭제(→ MDM021 이나 성공이 되어 단언 실패), ② 만 삭제(C6 실패), ④ 만 삭제(C7b 가 저장 성공) |
| I13 | 한 시스템 안 한 필드명은 한 컬럼에만 붙는다: 다른 컬럼과 충돌하면, 또는 요청 안에서 겹치면 **MDM018**. 같은 컬럼·같은 시스템의 다른 이름은 허용. 비교는 트림 뒤, 다른 컬럼과는 대소문자 무시(2026-10-03 D-149), 요청 안·같은 컬럼은 정확 일치 | C9~C13, E5 | 자기 컬럼 제외 누락(C13), 다른 컬럼 대소문자 구분(C12), 요청 내 중복 미검사(C10) |
| I14 | 쓰기(`columnMng.save`, `termRegPop.reg`)는 `MdmCurrentUser.roleIds()` 에 `MDM_STD_ADMIN` 이 있어야 한다. SYSADMIN·STEWARD 만으로는 **MDM016**. 이 검사는 서비스 메서드의 **첫 문장**이다 | C3·C4, R2, P1·P6 | 검사 삭제, SYSADMIN 허용 추가(C4), 검증 뒤로 이동(C3 의 "행 0" 은 같아도 P1 메시지가 MDM021 등으로 바뀜) |
| I15 | 읽기 액션(`search`·`view`·`compare`, 팝업 `search`)에는 서버 역할 검사가 없다 | P5 | 읽기에 가드 추가 |
| I16 | 액션 이름은 columnMng `{search, view, compare, save}`, termRegPop `{search, reg}` 로 고정이며 모두 `MdmActions` 에 있다. 쓰기는 save·reg 뿐이다. FE 저장 요청은 `systems`·`terms` 두 그리드를 **항상**(빈 rows 여도) 보낸다 | `DmaBpmnActionTest`, P4, `api.test.ts` | `searchDetail` 같은 새 이름(→ BFF 403), 분해를 `validate`(EDIT) 로 |
| I17 | 시드: OBJECT `columnMng`·`termRegPop`(SYSTEM_CODE `mdm`), 메뉴 leaf 는 `columnMng` 하나(부모 `dma`, 이름 `컬럼 사전`), 두 OBJECT 모두 SYSADMIN `PERM_ALL` + `seedMdmObjectRbac(…, "dma")` | E1, E3(표준 관리자 등록 성공), E6(담당자 403) | termRegPop 매트릭스 누락(E3 등록 403), leaf 이름 변경(E1) |
| I18 | 용어 등록 유일성: (표기, 의미 번호) 중복과 약어의 **대소문자 무시** 중복은 MDM020. 표기는 `^[가-힣A-Za-z0-9]+$`(100자 이하), 약어는 `^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`(50자 이하), 정의 필수, 의미 번호 ≥ 1 | R3·R4·R5 | 약어 비교를 대소문자 구분으로(R4) |
| I19 | 약어 제안 알고리즘(§6.10) | A1~A6 | 대안 길이 증가 순서 변경 |
| I20 | 서버 길이 검증: 표시명 24/12/6, 논리명 100, 물리명·시스템 필드명·기본값·REF_TARGET·REF_CATE_ID·TRANSFORM 50(code point) | C16 | 한도 변경 |
| I21 | 시스템 매핑 저장은 차분이다: 같은 키는 UPDATE, 새 키는 INSERT, 빠진 키는 DELETE. 같은 키를 지웠다 다시 넣지 않는다 | C14 | 전체 삭제 후 전체 삽입(VER 가 0 으로 돌아가 C14 실패) |
| I22 | `TERM_IDS` 는 토큰 순서대로 숫자 JSON 배열(공백 없음) | C2 | 문자열 배열, 정렬 |
| I23 | 용어·도메인이 0건이어도 분해·추천·조회가 예외 없이 동작한다 | F6, D5, C1, C24 | 빈 사전에서 NPE |
| I24 | Flyway 마이그레이션(V1~V3 두 방언)과 `MdmFlywayVersionParityTest` 등 버전 단언은 바뀌지 않는다 | §3.1 "마이그레이션 불변" diff 게이트 | V4 추가 |
| I25 | 업무 오류의 예외 message 는 해당 `MdmErrorCode.defaultMessage()` 로 **시작**한다(화면에는 message 만 오기 때문). 상세는 `": "` 뒤에 붙인다 | P1·P2·P6, `MdmErrorsTest` | 상세만 message 로 |
| I26 | 용어 사전은 요청마다 DB 에서 새로 읽는다(캐시 없음) | R7, E3 | 정적 캐시 추가 |
| I27 | 유사어 규칙(§6.9) | S1~S5 | 편집 거리 한도 2 |
| I28 | MDM016~021 의 코드·HTTP 의미 상태·운반 코드·기본 문구는 §6.11 표 그대로, 기존 14개는 불변 | `CommonContractTest` | 문구·번호 변경 |
| I29 | 팝업 [등록] 은 `canDoButton(rbac, "termRegPop", "reg")` 일 때만 활성, 화면 [저장]·[신규] 는 `action: "save"`, [분해] 는 `canDoButton(rbac, "columnMng", "compare")` | E6 | 등록 버튼 권한 판정 제거 |
| I30 | 목록 검색어는 논리명·표준 물리명·시스템별 실제 필드명에 대소문자 무시 부분 일치한다 | C21·C22, E5 | 시스템 필드명 제외 |

---

## 6. 상세 명세

### 6.1 `columnMng` 서비스 계약 (`POST /api/mdm/oasis/columnMng/{action}`)

모든 메서드는 `Map<String,Object>` 를 돌려주고 BPMN `output="result"` 라 응답은 `data.result.{…}` 다. 요청 DTO 는 `com.dongkuk.dmes.mdm.dma.columnMng.dto` 의 getter/setter 클래스다.

| action | 시그니처 | 요청(`params`/`grids`) | 응답 `result` |
|---|---|---|---|
| `search` | `search(ColumnMngSearchRequest request)` | `keyword: String`, `domainId: Long` | `list`, `domains`, `systems` |
| `view` | `view(ColumnMngViewRequest request)` | `columnId: Long` | `column`, `systems`, `terms` |
| `compare` | `compare(ColumnMngCompareRequest request)` | `direction: "FORWARD"\|"REVERSE"`, `input: String` | §6.5 모양 + `domains`, `recommendedDomainId`, `duplicates`, (FORWARD 만) `labels` |
| `save` | `save(ColumnMngSaveRequest request, List<Map<String,Object>> systems, List<Map<String,Object>> terms)` | params: `columnId`(신규면 null), `columnName`, `physName`, `labelLong`, `labelMid`, `labelShort`, `description`, `domainId`, `required: Boolean`, `defaultValue`, `refKind`, `refTarget`, `refCateId`, `usageNote` / grids: `systems.rows=[{systemCode, physName, transform, note}]`, `terms.rows=[{termId}]` | `columnId` |

- `list` 행: `columnId, columnName, physName, labelLong, labelMid, labelShort, domainId, domainName, domainStdName, required("Y"/"N"), termNames("원재료 + 코일 + 두께", TERM_IDS 해석. 없는 ID 는 "?"), systemFields("ERP:MATNR, MES:COIL_ID", 시스템·필드명 오름차순), usageNote`. 정렬: columnName 오름차순, columnId.
- 검색은 컬럼·매핑·용어·도메인을 읽어 **Java 에서 거른다**(방언별 LIKE·BIN2 차이와 `_` 와일드카드 문제를 피한다. 규모는 수천 행). 검색어는 트림 후 비면 전체, 아니면 I30.
- `domains`: `{domainId, domainName, stdName, label: "<id> <domainName> (<stdName>)"}`, domainName 오름차순. `systems`: `JdbcTemplate` 로 `SELECT SYSTEM_CODE, SYSTEM_NAME FROM TB_MDM_SYSTEM WHERE SELF_YN = 'N' ORDER BY SYSTEM_CODE` → `{systemCode, systemName}`.
- `view`: 없는 columnId 는 MDM021("컬럼을 찾을 수 없습니다"). `column` 은 저장 요청 params 와 같은 키(required 는 Boolean). `systems` 는 systemCode·physName 오름차순. `terms`: `{termId, termName, senseNo, engAbbr, missing}`.
- `compare`: input 트림 후 비면 MDM021. FORWARD 는 `ColumnNameComposer.forward`, REVERSE 는 `reverse`. `domains` 는 `DomainSuggester` 결과 `{domainId, domainName, stdName, matchLength}`. `duplicates` 는 `{columnId, columnName, physName, usageNote, domainId, domainName, matchedBy, systemCode}`: FORWARD 는 COLUMN_NAME = logicalName(`COLUMN_NAME`), placeholder 가 없을 때 PHYS_NAME = physName(`PHYS_NAME`). REVERSE 는 PHYS_NAME = 정규화 입력(`PHYS_NAME`)과 매핑 PHYS_NAME ∈ {트림 입력, 대문자 입력}(`SYSTEM_FIELD`, systemCode 포함). 같은 컬럼이 여러 근거로 잡히면 행을 나눈다.
- 서비스 필드: `MdmColumnRepository`, `MdmColumnSystemRepository`, `MdmDomainRepository`, `MdmTermRepository`, `JdbcTemplate`, `MdmStdAdminGuard`, `ObjectProvider<MaruIdNamespace>`(`orderedStream()` 으로 순회. 현재 구현 빈이 0개라 `List` 직접 주입보다 이쪽으로 고정한다. Build 는 첫 부팅에서 기동을 확인한다).

### 6.2 `termRegPop` 서비스 계약 (`POST /api/mdm/oasis/termRegPop/{action}`)

| action | 시그니처 | 요청 | 응답 `result` |
|---|---|---|---|
| `search` | `search(TermRegPopSearchRequest request)` | `termName`, `engName`(선택) | `similar`, `nextSenseNo`, `abbr`(engName 이 있을 때만, 아니면 null) |
| `reg` | `reg(TermRegPopRegRequest request)` | `termName`, `senseNo: Integer`, `definition`, `context`, `engName`, `engAbbr` | `term: {termId, termName, senseNo, engAbbr}` |

- `similar` 행: `{termId, termName, senseNo, definition, context, engName, engAbbr, reason, score}`(§6.9).
- `nextSenseNo` = 같은 표기 용어의 최대 senseNo + 1, 없으면 1.
- `abbr`: `{base, baseTaken, suggested, alternatives}`(§6.10). 사용 중 약어 집합은 모든 용어의 ENG_ABBR 대문자.

### 6.3 `NamingRules` 상수·정규화

- `PLACEHOLDER = "***"`.
- `CHUNK_SEPARATOR = [^가-힣A-Za-z0-9]+`. `normalizeKey(s)` = 구분자 문자를 모두 없애고 `toUpperCase(Locale.ROOT)`.
- `normalizeLogicalName(s)` = 트림 + 연속 공백을 한 칸으로.
- `STD_PHYS_NAME = ^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`, `ENG_ABBR = ` 같은 식, `TERM_NAME = ^[가-힣A-Za-z0-9]+$`.
- `LABEL_LONG_MAX=24`, `LABEL_MID_MAX=12`, `LABEL_SHORT_MAX=6`, `COLUMN_NAME_MAX=100`, `CODE_MAX=50`(물리명·필드명·기본값·REF·TRANSFORM), `TERM_NAME_MAX=100`, `CONTEXT_MAX=100`, `ENG_NAME_MAX=100`.
- `length(s)` = `s.codePointCount(0, s.length())`.
- `physTokens(s)` = `s.split("_")` 에서 빈 조각을 뺀 대문자 목록.

### 6.4 `TermDictionary`

- `static TermDictionary of(List<TermEntry> terms)`.
- 표면형 색인 `Map<String, List<TermCandidate>>`: 키 = `normalizeKey(표면형)`, 값 = `(TermEntry term, MatchVia via)`. 표기(NAME), 동의어(SYNONYM), 별칭(ALIAS) 을 넣는다. 키가 비면 넣지 않는다. `maxSurfaceLength` 를 함께 둔다.
- 동의어·별칭 JSON 파싱(D3): Jackson 으로 배열을 읽는다. 원소가 문자열이면 끝의 `\s*\([^()]*\)\s*$` 를 떼고 트림한다. 객체면 `name`, 없으면 `term` 문자열 필드를 같은 방식으로 쓴다. 그 밖(숫자, 배열 아님, 파싱 오류)은 조용히 건너뛴다.
- 약어 색인 `Map<String, TermEntry>`: 키 = `engAbbr.toUpperCase(Locale.ROOT)`, 충돌하면 termId 가 작은 쪽. `maxAbbrParts` = 약어의 `_` 조각 수 최댓값.
- `Set<String> usedAbbrUpper()`, `List<TermEntry> all()`.

### 6.5 정방향 분해 `ColumnNameComposer.forward(String input)`

1. `normalizeLogicalName(input)` 뒤 `CHUNK_SEPARATOR` 로 덩어리를 나눈다(빈 조각 제외). 덩어리는 `toUpperCase(Locale.ROOT)` 로 비교한다(한글은 그대로).
2. 덩어리마다 `i=0` 부터: `L = min(maxSurfaceLength, 남은 길이)` 에서 1 까지 줄이며 `chunk.substring(i, i+L)` 이 색인에 있으면 토큰으로 자르고 `i += L`. 하나도 없으면 `j = i+1` 부터 "j 에서 시작하는 표면형이 하나라도 있는 위치"를 찾아 그 직전까지(없으면 덩어리 끝까지) UNKNOWN 토큰 하나로 자르고 `i = j`(I2·I3). 문자열 인덱스는 BMP 기준 char 로 충분하다(한글 음절·영숫자만 남는다).
3. 토큰 후보 = 색인 값에서 termId 중복을 없앤 목록, 정렬 via(NAME<SYNONYM<ALIAS) → senseNo → termId(I6). 상태: 후보 1개면 via 가 SYNONYM 이면 `SYNONYM`, 아니면 `MATCHED`. 2개 이상이면 `AMBIGUOUS`(첫 후보 선택). 선택 용어의 engAbbr 가 비면 `NO_ABBR`(상태 덮어씀).
4. `NameToken(seq(1부터), surface(원 입력 글자), status, selected(TermEntry 또는 null), abbr(선택 약어 또는 "***"), candidates)`.
5. `physName` = 토큰 abbr 을 `_` 로 연결. `logicalName` = 해결 토큰은 선택 용어 표기, UNKNOWN 은 surface 를 공백으로 연결. `placeholder` = UNKNOWN 또는 NO_ABBR 이 하나라도 있음.
6. `NameComposition(direction, input, tokens, logicalName, physName, placeholder)`.

응답 Map 변환(서비스): 토큰 → `{seq, surface, status, termId, termName, senseNo, engAbbr, abbr, candidates:[{termId, termName, senseNo, definition, context, engAbbr, via}]}`.

### 6.6 역분해 `ColumnNameComposer.reverse(String input)`

1. 트림·대문자화, `physTokens`.
2. `i` 부터 `n = min(maxAbbrParts, 남은 조각 수)` 에서 1 까지 줄이며 `join("_", parts[i..i+n))` 가 약어 색인에 있으면 MATCHED 토큰(surface = 그 약어), `i += n`. 없으면 UNKNOWN 토큰(surface = `parts[i]`, abbr = `parts[i]`), `i += 1`.
3. `logicalName` = MATCHED 는 용어 표기, UNKNOWN 은 `***` 를 공백으로 연결. `physName` = 정규화 입력. `placeholder` = UNKNOWN 존재.

### 6.7 도메인 추천 `DomainSuggester.suggest(String physName, List<DomainEntry> domains)`

`colTokens = physTokens(physName)`. 각 도메인 `dTokens = physTokens(stdName)` 이 비어 있지 않고 `dTokens.size() <= colTokens.size()` 이며 `colTokens` 의 끝 `dTokens.size()` 개와 원소별로 같으면 `matchLength = dTokens.size()` 로 채택. `***` 는 어떤 표준명 토큰과도 같지 않다(표준명은 `STD_PHYS_NAME` 형식이라 `*` 를 갖지 않지만, 방어로 `***` 토큰은 비교에서 항상 불일치로 처리). 정렬 matchLength 내림 → domainId 오름. 추천 = 첫째 또는 null.

### 6.8 표시명 제안 `LabelSuggester.suggest(String logicalName)`

`name = normalizeLogicalName`, `words = name.split(" ")`. long = `length(name) <= 24 ? name : ""`. `pick(limit)` 후보 순서: `name`, `name` 공백 제거, `k=1..words.length-1` 에 대해 `words[k..]` 공백 없이 연결. `length <= limit` 인 첫 후보, 없으면 `""`. mid = `pick(12)`, short = `pick(6)`.

### 6.9 유사어 `SimilarTermFinder.find(String termName, String engName, TermDictionary dict)`

용어마다 해당하는 이유 중 최고 점수를 쓴다. 토큰 `t = normalizeKey(termName)`.

| reason | 조건 | score |
|---|---|---|
| `EXACT` | 표기 키 = t (다른 의미 번호로 새로 등록하려는 경우) | 1.0 |
| `ENG_NAME` | engName 이 있고 용어 영문명과 대소문자 무시 일치 / 포함(양방향, 짧은 쪽 3자 이상) | 0.95 / 0.6 |
| `SYNONYM_ALIAS` | 동의어·별칭 키 = t / 포함(양방향, 짧은 쪽 2자 이상) | 0.9 / 0.75 |
| `NAME_PARTIAL` | 표기 키가 t 를 포함하거나 t 가 표기 키를 포함(짧은 쪽 2자 이상) | 0.8 |
| `NAME_SIMILAR` | 두 키 모두 2자 이상, code point 기준 Levenshtein 거리 ≤ 1 | 0.7 |

점수 0 인 용어는 뺀다. 정렬 score 내림 → termName → senseNo, 최대 20건.

### 6.10 약어 제안 `AbbrSuggester.suggest(String engName, Set<String> usedUpper)`

`base0 = engName` 에서 `[A-Za-z0-9]` 만 남긴 대문자. 비었거나 첫 글자가 A-Z 가 아니면 `{base:null, baseTaken:false, suggested:null, alternatives:[]}`. 후보열: `base0[0..min(3,len))`, 이어서 길이를 1씩 늘린 접두(len 까지), 이어서 `base0 + "2"` … `base0 + "9"`. `base` = 첫 후보, `baseTaken = usedUpper.contains(base)`, `alternatives` = 사용 중이 아닌 후보를 순서대로 최대 3개, `suggested = alternatives[0]`(없으면 null).

### 6.11 오류 코드 (D2)

| 코드 | enum | 의미 HTTP | 운반 `ErrorCode` | 기본 문구 |
|---|---|---|---|---|
| MDM016 | `STD_ADMIN_ROLE_REQUIRED` | 403 | `ACCESS_DENIED` | `표준 관리자 역할이 있어야 할 수 있습니다` |
| MDM017 | `NAME_PLACEHOLDER_REMAINS` | 400 | `INVALID_VALUE` | `미등록 용어(***)가 남아 있어 저장할 수 없습니다` |
| MDM018 | `SYSTEM_FIELD_ALREADY_MAPPED` | 409 | `DUPLICATE_DATA` | `한 시스템 안에서 필드명 하나는 컬럼 하나에만 붙일 수 있습니다` |
| MDM019 | `COLUMN_DUPLICATED` | 409 | `DUPLICATE_DATA` | `같은 논리명 또는 물리명의 컬럼이 이미 있습니다` |
| MDM020 | `TERM_DUPLICATED` | 409 | `DUPLICATE_DATA` | `같은 표기·의미 번호 또는 영문 약어의 용어가 이미 있습니다` |
| MDM021 | `INVALID_INPUT` | 400 | `INVALID_VALUE` | `입력값이 올바르지 않습니다` |

상세 문구 예: MDM018 `": ERP·MATNR → 컬럼 '코일 아이디'"`(여러 건은 `, ` 로), MDM020 `": 약어 DEV 사용 중. 대안 DEVI, DEVIA"`, MDM021 `": 표시명(짧은)은 6자 이하여야 합니다"`, MDM017 `": 편차"`(미해결 토큰 surface 목록). 이슈 목록(`MdmCheckIssue`)도 함께 싣되 화면은 쓰지 않는다(F12).

### 6.12 `columnMng.save` 처리 순서 (고정)

1. `guard.requireStdAdmin()` → MDM016.
2. 필수: `columnName`(정규화 후), `physName`(트림 후), `domainId` 가 비면 MDM021.
3. 자리 표시자(I12): `physName.contains("*")`, 또는 `columnName.contains("*")`, 또는 `forward(columnName)` 에 UNKNOWN/NO_ABBR, 또는 terms 그리드의 termId 중 DB 에 없는 것 → MDM017. terms 그리드가 null 이거나 비면 재분해 결과의 선택 용어 ID 를 쓴다.
4. 형식·길이·존재(MDM021): `STD_PHYS_NAME`, 길이(I20), 도메인 존재, `refKind` ∈ {null, `MASTER`}, `MASTER` 면 `refTarget` 필수, `refKind` 가 비면 `refTarget`·`refCateId` 도 비어야 함, `MaruIdNamespace`(kind `MASTER_DATA`) 구현체가 있으면 `contains(refTarget)` 확인(없으면 생략).
5. 컬럼 유일성: `findByColumnName`·`findByPhysName` 결과가 자기(columnId) 아닌 행이면 MDM019.
6. 매핑 행: 각 행 트림, systemCode·physName 모두 비면 버림, 한쪽만 비면 MDM021, 시스템 코드가 `SELF_YN='N'` 목록에 없으면 MDM021, 길이 초과 MDM021. 요청 안 (systemCode, physName) 중복 → MDM018. 행마다 `findBySystemCodeAndPhysName` 에서 columnId ≠ 자기인 행 → MDM018(모두 모아 한 번에). 2026-10-03 D-149 부터는 시스템마다 대문자 이름 묶음으로 `findBySystemCodeAndUpperPhysNameIn` 을 한 번 불러 대소문자 무시로 본다.
7. 저장: 신규면 `new MdmColumn(columnName, physName, domainId)` 후 나머지 setter, `save` 로 IDENTITY 키 확보. 수정이면 `findById`(없으면 MDM021) 후 setter. `TERM_IDS` = 숫자 JSON 배열. `CHG_SEQ` 는 건드리지 않는다. 빈 문자열 입력은 NULL 로 저장(표시명 포함 — 폴백이 동작하게).
8. 매핑 차분(I21): 기존 `findByColumnId` 를 (systemCode, physName) 키로 맵핑. 요청 키가 기존에 있으면 transform·note 가 다를 때만 setter, 없으면 `new MdmColumnSystem(columnId, systemCode, physName)` save, 요청에 없는 기존 행은 delete.
9. 반환 `{columnId}`.

### 6.13 `termRegPop.reg` 처리 순서 (고정)

1. `requireStdAdmin()` → MDM016. 2. 입력(I18) → MDM021. 3. `existsByTermNameAndSenseNo` → MDM020. 4. 약어 대문자가 `usedAbbrUpper()` 에 있으면 MDM020(상세에 `AbbrSuggester` 대안, engName 이 없으면 약어 자체를 base 로). 5. `new MdmTerm(termName, senseNo, definition)` + context·engName·engAbbr·`srcOrigin="MDM:columnMng"` save. 6. 반환 `{term}`.

### 6.14 BPMN

`noticeMgmt.bpmn` 구조를 따른다: `startEvent` → `exclusiveGateway id="actionGateway"`(`camunda:property name="input" value="action"`) → 액션별 `serviceTask camunda:class="columnMngService"`(빈 이름) 속성 `method`·`output="result"`·(`dto` = DTO FQCN) → 액션별 `endEvent`. 분기는 `sequenceFlow name="<action>"` 만. `documentation` 에 액션표를 적는다. **`bpmn-skill` 로 생성·검증**한다.

| 파일 | process id / name | 액션 → 태스크 → method / dto |
|---|---|---|
| `services/dma/columnMng.bpmn` | `columnMng` / 컬럼 사전 | search → searchTask → `search` / `…columnMng.dto.ColumnMngSearchRequest`; view → viewTask → `view` / `ColumnMngViewRequest`; compare → compareTask → `compare` / `ColumnMngCompareRequest`; save → saveTask → `save` / `ColumnMngSaveRequest`(그리드 `systems`·`terms` 는 파라미터 이름 바인딩) |
| `services/dma/termRegPop.bpmn` | `termRegPop` / 용어 인라인 등록 | search → searchTask → `search` / `…termRegPop.dto.TermRegPopSearchRequest`; reg → regTask → `reg` / `TermRegPopRegRequest` |

### 6.15 DataInitializer 추가 블록

`seedMdmMenus()` 의 `seedMdmObjectRbac("mdmSample", "dma");` 바로 다음, 기존 `log.info(...)` 앞에 넣는다(기존 줄 불변).

```java
// ── TSK-04-04 — 컬럼 사전(columnMng) + 용어 인라인 등록 팝업(termRegPop). 팝업은 메뉴 leaf 없이 OBJECT·권한만
//    둔다(screens/README §3·§5 — 버튼·API 권한은 역할 매핑에서 오고 메뉴를 보지 않는다, design.md F14·F15).
insertMcmSecObjIfAbsent("columnMng", "컬럼 사전", "mdm");
insertMcmSecObjIfAbsent("termRegPop", "용어 인라인 등록", "mdm");
insertMcmSecMenuIfAbsent("columnMng", "004", "5010140", "컬럼 사전", "dma", "columnMng");
for (String objectId : new String[]{"columnMng", "termRegPop"}) {
    insertIfAbsentComposite(
            "TB_MCM_SEC_ROLE_MAPPING",
            new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
            new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
            "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
            "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
    seedMdmObjectRbac(objectId, "dma");
}
log.info("[DataInitializer] TSK-04-04 MDM 컬럼 사전 시드 — OBJECT 2 + 메뉴 leaf 1 + RBAC(SYSADMIN 2 + MDM 역할 4)");
```

### 6.16 화면 `pages/dma/columnMng/page.tsx`

화면 명세(영역·조회조건·목록 열·상세 필드·자동 생성 영역·버튼과 동작·선검사·역할별 활성·팝업 연동)는 **[columnMng 기능설계서](../../screens/columnMng/columnMng_기능설계서.md)** §2~§8 로 옮겼다(D5 ②). 여기에는 구현에 필요한 결정만 남긴다.

- `<MdmPageLayout group="dma" screenId="columnMng" title="컬럼 사전" buttons={[조회(action "search", primary), 신규(action "save", light), 저장(action "save", save)]}>`. 페이지 안 권한 판정은 `const rbac = useUserButtonRbac(true)`, [분해]는 `canDoButton(rbac, "columnMng", "compare")`.
- shared 래퍼만 쓴다: `SearchArea`·`SearchField`(검색어는 children 으로 `Input` 을 넣어 `data-testid` 를 붙임), `ContentBody`·`ContentPanel`, `AgDataGrid`·`GridPanel`(`showAddButton showDeleteButton`, `.grid-panel` 은 부모 높이 필요 — B8), `Input`·`Select`·`Textarea`·`Button`, `ErrorModal`, `useMessage().showMessage({ message: "저장했습니다", toast: true })`.
- `tokens.ts`: `composePhysName(tokens)`, `composeLogicalName(tokens)`, `hasPlaceholder(tokens)`, `replaceToken(tokens, seq, term)`(토큰 status 를 MATCHED 로, abbr 를 용어 약어로. 약어가 없으면 NO_ABBR). FE 는 분해 규칙을 따로 구현하지 않는다. 팝업에서 용어를 고른 뒤의 재계산은 `compare` 재호출로 서버에 맡긴다.
- `labels.ts`: `resolveLabels(row)`·`formatLabels(row)` — 폴백 규칙은 기능설계서 §3.3(I11).

### 6.17 `api.ts`

`noticeMgmt/api.ts` 를 따른다: `OASIS_BASE = "/api/mdm/oasis/columnMng"`, 본문 `{ meta: { menuId: "columnMng" }, params, grids? }`, `unwrap` 은 `meta.success === false` 면 `meta.message`(비면 `요청이 거부되었습니다.`)로 throw, 아니면 `data.result` 를 펼친다. `unwrap` 은 테스트를 위해 export 한다. 함수: `searchColumns`, `viewColumn`, `compareName`, `saveColumn(params, systems, terms)`(두 그리드를 항상 넣는다, I16).

### 6.18 팝업 `pages/dma/termRegPop/termRegPop.tsx`

팝업 명세(유사어 확인·새 용어 등록 필드·버튼·검증·권한·반환)는 **[columnMng 기능설계서](../../screens/columnMng/columnMng_기능설계서.md)** §9 로 옮겼다(D5 ②). 구현 결정만 남긴다.

- `export const OBJ_ID = "termRegPop"`. `TermRegPopModal({ open, token, onSelect, onClose })`, `onSelect(term: {termId, termName, senseNo, engAbbr})`. shared `Modal` 사용(`masterRuleListPop` 선례), 본문을 `data-testid="term-pop"` 로 감싼다.
- 열릴 때 `search({termName: token})` 자동 호출(사용자 조작이 아니라 권한 가드 없음). [등록] `disabled={!canDoButton(rbac, OBJ_ID, "reg")}`(I29), [약어 제안] `canDoButton(rbac, OBJ_ID, "search")`(B10).
- `index.ts`: `export { TermRegPopModal, OBJ_ID } from "./termRegPop"; export type { … }`.

---

## 7. 함정과 관례 (Build 가 반드시 알아야 할 것)

1. **서비스 클래스에 `@Transactional` 금지**(F11). 트랜잭션은 OASIS 가 프로세스 단위로 건다. 저장 중 예외가 나면 전부 롤백된다(P8 로 실측).
2. **오류는 message 만 화면에 온다**(F12). FE 는 `meta.code`·`errors[]` 에 기대지 않는다. MDMnnn 은 로그·테스트용이다.
3. `grids` 이름은 메서드 파라미터 이름과 글자 단위로 같아야 한다(`systems`, `terms`). `params` 에 배열 금지. DTO 는 `dto` 속성으로 타입 바인딩된다.
4. BPMN 액션 이름은 `MdmActions` 안에서만 고른다. 다른 이름은 SYSADMIN 도 BFF 403 이다(F14).
5. Hibernate flush 순서는 INSERT → UPDATE → DELETE 다. 같은 PK 를 지웠다 다시 넣으면 제약 위반이 난다. 매핑 저장은 차분으로만 한다(I21).
6. 신규 컬럼은 IDENTITY 라 `save` 직후 `getColumnId()` 가 채워진다. 매핑 행은 그 뒤에 만든다(FK).
7. `C_AT`·`U_AT` 는 SQLite 에 epoch millis INTEGER 로 들어간다(TSK-04-01 D10). 네이티브 SQL 로 시각을 다루지 않는다.
8. 서비스 테스트에서 `AuditHolder` 가 없으면 `C_USR_ID` 는 NULL 이다. 감사 칼럼 값을 단언하지 않는다(HTTP 테스트에서는 채워진다).
9. `canDoButton` 은 objId 대소문자를 그대로 비교한다. `"termRegPop"`·`"columnMng"` 를 정확히 쓴다. 액션 없는 `PageButton` 은 자동 비활성이다.
10. `pnpm build:libs` 를 먼저 돌리지 않으면 m-mdm vitest 3파일이 실패한다(기준선 기록).
11. E2E 는 반드시 자기 포털(`SMOKE_MCM_BASE_URL`)로 돌린다. 기본값 5100 은 메인 체크아웃이라 거짓 통과가 된다. `mdm-sample-smoke`·`mdm-shell-rbac-smoke` 가 다른 Task 스크린샷을 덮어쓰므로 7) 에서 되돌린다.
12. `mdm-columnMng.spec.ts` 는 데이터를 만든다. 같은 mdm.db 로 두 번 돌리면 E2(`편차` 가 이미 등록) 부터 어긋난다. 재실행은 §3.6 1)·4b) 부터 다시 한다.
13. OASIS 계약 검사는 `--module mdm` 을 붙여야 mdm 을 본다(F21).
14. 겪은 문제는 `.issues` 에 쓰지 않고 끝 보고에 올린다.

---

## 8. 인계 (다음 Task 로)

| 받는 Task | 내용 |
|---|---|
| TSK-04-02(termMng) | 용어 표면형·동의어 해석은 `com.dongkuk.dmes.mdm.dma.naming.TermDictionary` 를 재사용한다. 동의어·별칭 JSON 원소는 이 Task 가 문자열 배열 `["명칭(시스템)"]` 로 가정하고 `name`/`term` 객체도 읽는다(D3). 다른 모양을 정하면 `TermDictionary` 파서와 `TermDictionaryTest` T1~T3 을 함께 고친다. 인라인 등록 용어는 `SRC_ORIGIN='MDM:columnMng'`, `EMBEDDING` NULL 이므로 임베딩 재생성 대상에 포함한다. 팝업 유사어에 2차(임베딩) 추천을 붙이려면 `termRegPop.search` 결과에 합친다 |
| TSK-04-03(domainMng) | 도메인 추천은 표준명 `_` 토큰 꼬리 일치다(D4). 표준명이 약어 조합 규칙을 벗어나면 추천에 잡히지 않는다 |
| TSK-05-01·08-01 | `MdmColumnDictionaryLookup` 구현은 여전히 소비자 몫이다(F8). 컬럼 물리명은 이 화면에서 바뀔 수 있으므로(참조 무결성 검사 없음) 물리명으로 참조한다면 영향 검사를 그쪽에서 요구해야 한다 |
| 모든 mdm 화면 Task | ① 오류는 `meta.message` 만 화면에 온다(F12). ② 쓰기 서버 가드는 `MdmStdAdminGuard`(또는 같은 모양)로 역할을 직접 본다. ③ 계약 검사에 `--module mdm`. ④ 팝업은 OBJECT + 역할 매핑만으로 권한이 동작한다(F15). ⑤ (Build 추기) OASIS `params` 에 `null` 값을 넣지 않는다(B3), 이름 바인딩 그리드는 빈 rows 로라도 항상 보낸다(B1) |
| cactus-core 담당 | `OasisServiceExecutor` 가 BPMN 경로의 `BusinessException` 코드·`errors[]` 를 잃는 문제(F12). 고친다면 `serviceStarter.start` 결과의 `exception()` 이 `BusinessException` 인지 보고 옮겨 담는 것이 가장 작다. 이 Task 에서는 고치지 않는다 |

---

## 담당자 확인 필요 결정

### D1 — 서버 쓰기 가드에서 SYSADMIN 을 허용할 것인가, 컬럼 저장에도 가드를 둘 것인가
- **질문**: 용어 인라인 등록과 컬럼 저장을 서버가 `MDM_STD_ADMIN` 역할로만 허용할지, SYSADMIN 도 허용할지. 컬럼 저장에도 같은 가드를 둘지.
- **선택지**: ① 두 쓰기 모두 `MDM_STD_ADMIN` 만(SYSADMIN 거부). **강도: 강** — 원천 "용어 등록은 표준 관리자 역할만"(02:523), 용어·도메인·컬럼은 "표준 관리자가 저장하면 바로 배포"(02:944), 승인된 선행 TSK-01-03 `requireSteward` 가 "SYSADMIN·MDM_STD_ADMIN 만으로는 거부"로 같은 모양을 택했다. ② SYSADMIN 도 허용. **강도: 약** — 운영 편의뿐, 근거 문서 없음. ③ 인라인 등록만 가드, 컬럼 저장은 BFF 에만 맡김. **강도: 약** — spec 문구는 인라인 등록만 말하지만 서버 검사 없는 쓰기 경로가 남는다.
- **택한 것**: ①.
- **결과로 생기는 것**: admin(SYSADMIN)은 `PERM_ALL` 이라 버튼이 활성이지만 저장하면 서버가 MDM016 로 거부한다. E2E 쓰기 단계는 표준 관리자 시험 사용자로 한다.
- **반려 시 재작업**: `MdmStdAdminGuard.requireStdAdmin()` 에 `SYSADMIN` 허용을 더하고 C4·R2 의 SYSADMIN 케이스 기대값을 성공으로 바꾼다(③ 이면 `ColumnMngService.save` 의 가드 호출과 C3·C4·P1 을 뺀다).

### D2 — 계약 enum `MdmErrorCode` 에 MDM016~021 을 추가

- **머지 해소(resolution.md 시도 1)**: 개발 브랜치에 TSK-04-03 의 `DOMAIN_SAVE_REJECTED`(MDM015)가 먼저 들어와, 이 Task 의 코드 6개를 MDM015~020 에서 MDM016~021 로 한 칸씩 옮겼다(TSK-04-03 design.md X3·"다음 번호" 규칙). 이 문서의 코드 번호도 모두 옮긴 값이며, 개수 단언은 14→20 이 아니라 15→21 이 됐다. 이름·HTTP 상태·운반 코드·문구는 그대로다.
- **질문**: 새 업무 오류를 공유 계약 enum 에 코드로 더할지, cactus `ErrorCode` 로 바로 던질지.
- **선택지**: ① MDM016~021 6개 추가, `CommonContractTest` 개수 14→20 갱신. **강도: 강** — decisions D-029(`MdmErrorCode` 가 mdm 오류를 싣는 한 곳)와 D-040(TSK-01-03 이 MDM013·014 를 같은 방식으로 더함) 선례. ② cactus `BusinessException(ErrorCode.DUPLICATE_DATA, …)` 직접. **강도: 약** — mdm 오류 표기가 둘로 갈린다.
- **택한 것**: ①. 문구·번호는 §6.11.
- **반려 시 재작업**: 코드를 빼고 서비스가 cactus 예외를 직접 던지게 바꾸며, 테스트의 message 시작 단언(I25)을 새 문구로 바꾼다.

### D3 — 동의어·별칭 JSON 원소 모양 가정
- **질문**: `TB_MDM_TERM.SYNONYMS`·`ALIASES` 의 JSON 원소를 무엇으로 읽을지. 아직 누구도 정하지 않았고(F7) 쓰는 쪽(TSK-04-02)은 착수 전이다.
- **선택지**: ① 문자열 배열 `["배치(ERP)", "배치넘버(ERP)"]` 를 기본으로 읽고, `{"name":…}`·`{"term":…}` 객체도 받아들이는 관대한 파서. **강도: 중** — 원천이 "`명칭(시스템)` 형식"이라는 문자열 표기만 적었다. ② 객체 배열 `[{"name":"배치","systems":["ERP"]}]` 로 확정. **강도: 약** — 원천에 없는 구조를 이 Task 가 정하게 된다. ③ 이 Task 에서 동의어를 쓰지 않음. **강도: 약** — 요구사항 "동의어 표준어 치환"을 어긴다.
- **택한 것**: ①. 이 Task 는 동의어를 **읽기만** 하고 쓰지 않는다.
- **반려 시 재작업**: `TermDictionary` 의 파서와 `TermDictionaryTest` T1~T3, E2E 픽스처의 동의어 값을 확정된 모양으로 바꾼다.

### D4 — `***` 가 꼬리에 있을 때의 도메인 추천
- **질문**: "용어 조합의 꼬리와 가장 길게 일치하는 도메인"(원천 02:508)을 미등록 자리가 있을 때 어떻게 적용할지. 시안은 `편차` 가 미등록인데 `11 원재료 코일 두께` 를 추천한다(F26).
- **선택지**: ① 물리명 `_` 토큰 꼬리를 그대로 비교하고 `***` 는 어떤 토큰과도 같지 않다(꼬리가 미등록이면 추천 없음). **강도: 중** — 원천 문장을 문자 그대로 적용하고, 등록을 마치면 추천이 자연히 나온다(E3 에서 `THK_DEV`). ② `***` 토큰을 빼고 비교(시안과 같음). **강도: 약** — "편차" 의 값 정의를 "두께" 도메인으로 추천해 틀린 도메인 지정을 부른다. 시안은 예시 화면일 뿐이다.
- **택한 것**: ①.
- **반려 시 재작업**: `DomainSuggester` 가 `***` 토큰을 걸러낸 뒤 비교하게 바꾸고 D2 테스트 기대값과 E2 의 "추천 없음" 단언을 바꾼다.

### D5 — 화면 설계 산출물을 기능설계서 1종으로 줄임(5종 중 나머지 4종은 쓰지 않음)
- **질문**: wbs 공통 규칙("화면마다 설계 산출물 5종을 Task 설계 단계에서 작성")과 Mes-Guide 개발 진입 가드("설계 폴더 없음 → 구현 금지")를 이 Task 가 어떻게 충족할지(F27).
- **선택지**: ① 이 design.md 가 기능·디자인·BPMN 설계를 모두 담고, `docs/mdm/screens/columnMng/` 5종은 쓰지 않는다. **강도: 중** — As-Is 가 없어 분석리포트·G1~G7 게이트가 성립하지 않고, As-Is 없는 신규 화면 `noticeMgmt` 를 사용자가 1종으로 줄인 선례가 있으며, 팀장 지시의 산출물 범위가 design.md 다. ② 기능설계서 1종만 추가(noticeMgmt 선례). **강도: 중** — 선례와 정확히 같지만 design.md 와 내용이 겹친다. ③ 5종 전부. **강도: 약** — As-Is 분석 전제 템플릿이라 대부분 "해당 없음"으로 채워진다.
- **택한 것**: ②(팀장 지시로 ①에서 변경, 2026-09-24 Build 뒤). 기능설계서 1종을 **[`docs/mdm/screens/columnMng/columnMng_기능설계서.md`](../../screens/columnMng/columnMng_기능설계서.md)** 에 두고(팝업 `termRegPop` 절 포함), 이 문서의 화면 명세 절(§6.16·§6.18)은 그 파일로 가는 링크와 구현 결정만 남긴다.
  - 근거 ① 자리: [`docs/mdm/screens/README.md`](../../screens/README.md) §1·§5 가 ADR-0003·decisions D-015 에 따라 mdm 화면 설계 산출물의 자리를 `docs/mdm/screens/{screenId}/` 로 정했다.
  - 근거 ② 1종 축소: As-Is 가 없는 신규 화면은 [DEC-001](../../../ai-build-log/DEC-001_noticeMgmt-on-mls.md) 결정 2 에서 5종을 기능설계서 1종으로 줄인 선례가 있다(`noticeMgmt`).
  - 분석리포트·디자인설계서·BPMN설계서·정합체크서는 만들지 않는다. 이 설계 체계는 As-Is 원본 grep 을 전제하므로(DEC-001 결정 2) As-Is 가 없는 이 화면에서는 성립하지 않는다. BPMN 액션표는 §6.14 와 BPMN 파일 `documentation` 이 대신한다.
  - 기능설계서의 근거 칸은 원천 설계(`02-term-domain-column.md` 등)의 행 번호를 인용한다. 원천은 As-Is 가 아니라 요구사항 원천이다.
  - mdm 모듈 전체의 5종 면제 여부는 팀장이 사람에게 확인받는 중이다. 결과가 달라지면 **문서만 보완한다**(코드 변경 없음).
  - 식별자 사전 §A.3.2 `columnMng` 행 비고를 "기능설계서 1종"으로 맞췄다. `docs/mdm/screens/README.md` §3 표에는 비고 칸이 없어 고치지 않았다.
- **반려 시 재작업**: ③(5종 전부)이면 나머지 4종을 템플릿으로 추가한다. ①(design.md 만)이면 기능설계서를 지우고 §6.16·§6.18 을 되살린다. 어느 쪽이든 코드는 바뀌지 않는다.

### D6 — 분해·역분해를 READ 등급 액션 `compare` 로 둠
- **질문**: 분해·역분해·중복 검사·도메인 추천을 어떤 액션 이름에 둘지. 권한 세트를 바꿀 수 없으므로(공유 시드 불변) `MdmActions` 13개 안에서 골라야 한다.
- **선택지**: ① `compare`(READ). **강도: 중** — 용어집·기존 컬럼과 "대조"하는 읽기라 의미가 맞고, 담당자도 `***` 까지 가서 등록 불가를 확인할 수 있어 수용 기준 5 를 화면에서 의미 있게 시험할 수 있다. ② `validate`(EDIT). **강도: 약** — 담당자가 분해조차 못 해 "권한 없는 사용자는 인라인 등록 불가"가 "화면 자체를 못 쓴다"로 바뀐다. ③ `search` 에 `mode` 파라미터로 합침. **강도: 약** — 한 메서드가 두 응답 모양을 갖게 된다.
- **택한 것**: ①.
- **반려 시 재작업**: BPMN 분기 이름과 FE `api.ts` 액션, `DmaBpmnActionTest` 허용 목록, [분해] 버튼 권한 판정 액션을 바꾼다.

---

## Build 이탈

Build(Phase 03, 2026-09-24)가 이 문서에서 벗어난 지점과 그 사유다. 실측으로 설계 가정과 다른 사실이 나온 항목은 "실측"으로 표시했다.

| # | 설계 | 실제 구현 | 사유 |
|---|---|---|---|
| B1 | P4 — `grids.terms` 를 빼고 보내도 저장된다(바인딩이 실패하면 이탈로 기록) | **실측: 바인딩이 실패한다.** P4 를 둘로 나눴다: P4(빈 rows 로 보내면 서버가 재분해로 TERM_IDS 를 채움)·P4b(그리드를 빼면 `No suitable method` 로 실패). FE `saveColumn` 이 두 그리드를 항상 보내는 규칙(I16)을 `api.test.ts` 가 고정한다 | `camunda:class`(빈 이름) 경로의 `NamedObjectJavaServiceTaskExecutable` 은 `opt` 속성을 `MethodInvokerContext` 에 넘기지 않는다(`oasis-core/.../executors/NamedObjectJavaServiceTaskExecutable.java:89-93`). 그래서 선택 파라미터를 표시할 방법이 없다 |
| B2 | C1 기대 `systems` = ERP·MES·APS·DKMS·L2 이면서 "코드 오름차순" | §6.1 SQL(`ORDER BY SYSTEM_CODE`) 그대로 APS·DKMS·ERP·L2·MES 로 단언한다 | 설계 본문 안의 모순. SQL 쪽을 따랐다 |
| B3 | (설계에 없음) | **실측:** OASIS 는 `params` 안의 `null` 값의 타입을 정하지 못해 요청 전체를 `The type cannot be determined because object is null` 로 거부한다. FE `callOasis` 가 `null`·`undefined` 키를 빼고 보낸다(`api.test.ts` 가 고정). 서버 DTO 에서는 빠진 키가 곧 null 이다 | 첫 E2E 실행에서 검색(`domainId: null`)이 실패해 드러났다. 다른 mdm 화면도 같은 규칙이 필요하다(§8 인계 「모든 mdm 화면 Task」 ⑤에 추기) |
| B4 | P1 로 F12 를 실측하고 다르면 멈춘다 | **실측 결과 F12 와 같다.** 역할 거부는 HTTP 200 + `meta.success=false` + `meta.code="S001"` + `meta.message` = 예외 message 로 온다. P3 에서 `C_USR_ID` 가 `X-Authenticated-User` 값으로 채워지는 것도 확인했다 | 설계대로 진행 |
| B5 | P8 — C9 조건으로 "뒤 단계 실패가 앞 단계 쓰기를 남기지 않는다" 실측 | P8 은 시험 전용 SQLite 트리거로 매핑 INSERT 를 실패시켜, 먼저 INSERT 된 컬럼 행이 프로세스 트랜잭션과 함께 롤백되는 것을 실측한다. C9 조건(쓰기 전 검사로 아무것도 쓰지 않음)은 P8b 로 따로 둔다 | §6.12 는 모든 검증을 쓰기 전에 끝내므로 C9 조건에서는 쓰기가 일어나지 않아 롤백을 증명하지 못한다 |
| B6 | E2E E1~E6 여섯 시험 → 스모크 합계 11 passed | E2·E3·E4 를 한 시험(`E2~E4`)으로 묶었다. `mdm-columnMng` 4건 + 기존 5건 = **9 passed** | E3 는 E2 의 분해 결과(같은 화면 상태)에서 팝업을 열고, E4 는 E3 가 바꾼 토큰으로 적용한다. 시험마다 새 페이지가 열리므로 나누면 앞 단계를 다시 해야 한다. 단언 내용은 §3.5 표와 같다 |
| B7 | [저장] 화면 선검사: 순서 명시 없음 | `***` 선검사를 필수값 검사보다 먼저 한다 | E2 처럼 미등록 꼬리는 추천 도메인이 없어(D4) 필수 누락 문구가 원인(`***`)을 가린다. 서버 순서(§6.12)는 그대로다 |
| B8 | 시스템별 실제 필드명 그리드는 화면 맨 아래 전체 폭 | 오른쪽 "컬럼 상세" 패널 안, 폼 아래에 둔다. `GridPanel` 을 감싸는 요소에 높이를 준다 | `.grid-panel` 이 `contain: strict; height: 100%` 라 부모 높이가 없으면 0 이 되어 [행추가]가 표 뒤로 숨는다(E2E 실측). 1280×720 에서 네 영역을 세로로 쌓으면 패널마다 높이가 모자란다 |
| B9 | AMBIGUOUS 후보 `Select` 를 바꾸면 `replaceToken` | 후보 선택은 화면 안에서만 바꾸고 compare 를 다시 부르지 않는다. compare 재호출은 팝업에서 용어를 고른 뒤에만 한다(옮기기 전 §6.16 문구 그대로, 지금은 기능설계서 §5.1-1 GB-002·§5.2) | 재호출하면 서버 기본 선택으로 되돌아간다. 사용자가 고른 후보는 `seq`·`surface` 가 같을 때 되살린다 |
| B10 | 팝업 권한 판정은 [등록](`reg`)만 | [약어 제안]도 `termRegPop × search` 로 판정한다 | 사용자 조작으로 서버를 부르는 버튼이라 masterRuleListPop 선례(자기 objId × 실제 액션명)를 따랐다. 담당자도 READ 라 동작은 같다 |
| B11 | `bpmn-skill`(bpmn-tool CLI)로 생성 | `npx -p @cothe/bpmn-tool bpmn-tool create/validate` 로 생성·검증했다(전역 설치 없음). 경고 1건 "default flow 미설정"은 `noticeMgmt.bpmn` 선례와 같다 | 전역 환경을 바꾸지 않으려고 npx 캐시로 실행했다 |
| B12 | `data-testid` 목록 | 목록 외에 `token-candidate-{seq}`, `gen-duplicates`, `form-label-preview`, `form-required`, `term-pop-term-name`, `term-pop-sense-no`, `term-pop-context`, `term-pop-error`, `term-pop-use-{termId}` 를 더했다 | E2E 단언 대상 |
| B13 | MDM021 상세 예 "표시명(짧은)은 6자 이하여야 합니다" | "표시명(짧은)은(는) 6자 이하여야 합니다" 모양으로 칸 이름을 싣는다 | 칸 이름마다 조사를 고르지 않으려고 한 모양으로 통일했다. 단언은 칸 이름 포함 여부다 |
| B14 | 시험 파일 목록 | 설계 목록 외에 `LIBT/common/security/MdmStdAdminGuardTest`, `LIBT/dma/naming/NamingFixtures`(픽스처), C2b·P4b·P8b·R7 강화를 더했다. C2b·R7 강화는 변이 검증에서 살아남은 변이를 덮으려고 넣었다(아래 기록) | 새 테스트 추가이며 기대값 완화가 아니다 |
| B15 | (공통) MSSQL 실측 | **사용자 결정: 도커 금지로 MSSQL 실측 생략.** `mssqlMigrationTest` 등 Testcontainers·docker 명령은 돌리지 않았다. 이 Task 는 새 마이그레이션이 없어 MSSQL SQL 이 생기지 않았다(§3.1 도 이 게이트를 대상 밖으로 둠) | 2026-09-24 사용자 결정(팀장 전달) |
| B16 | D5 ①(design.md 만) | D5 ②(기능설계서 1종)로 변경, 화면 명세 절을 기능설계서로 옮김 | 팀장 지시(2026-09-24). D5 절 참고 |

`com.dongkuk.dmes.mdm.dma.naming` 패키지는 ArchUnit·계약 검사기가 거부하지 않아 옮기지 않았다(§2 커밋 A 조건부 이탈 없음).

## Build 변이 검증 기록

§5 불변 규칙마다 틀린 구현을 넣고 해당 시험을 돌린 뒤 `git checkout` 으로 되돌렸다. 하네스는 변이 하나마다 대상 시험 묶음(`dma.naming.*`, `dma.columnMng.*`, `dma.termRegPop.*`, `DmaOasisHttpTest`, `DmaBpmnActionTest`, vitest 파일)을 돌리고 실패한 시험 이름을 기록했다. 매 변이 뒤 작업 트리가 깨끗한 것을 확인했다. E2E 로만 잡히는 규칙(I17·I29)은 새 mcm.db·mdm.db 로 서버를 다시 띄워 E2E 를 돌렸다.

| 규칙 | 변이 | 잡은 시험 | 결과 |
|---|---|---|---|
| I1 | `PLACEHOLDER` 를 `??` 로 | F2·F6·F7·F9·R3·D2 등 | 잡음 |
| I1 | NO_ABBR 약어를 빈 문자열로 | F9 | 잡음 |
| I1 | FE `PLACEHOLDER` 를 `??` 로 | `tokens.test.ts`(4건) | 잡음 |
| I2 | 최장 일치 → 최단 일치 | F1·F2·F3·영문 덩어리 | 잡음 |
| I3 | 미등록 구간을 덩어리 끝까지 | F8a·F8b | 잡음 |
| I3 | 미등록 구간을 한 글자씩 | F2·F6·F7·F8a | 잡음 |
| I4 | `(` 를 글자로 취급 | F7 | 잡음 |
| I5 | 별칭 제외 | T4·F5b·영문 덩어리 | 잡음 |
| I5 | 동의어 끝 괄호 미제거 | T1·T2·F4·F5·S3 | 잡음 |
| I5 | JSON 파싱 오류 전파 | T3 | 잡음 |
| I6 | 후보 정렬 뒤집기 | F5·F5b·표기+동의어 중복 제거 | 잡음 |
| I6 | AMBIGUOUS 기본 선택을 null 로 | F5·F5b | 잡음 |
| I7 | 동의어 표면형을 논리명에 씀 | F4 | 잡음 |
| I8 | 역분해를 조각 1개씩만 대조 | R2 | 잡음 |
| I8 | 약어 색인 대소문자 구분 | T5 | 잡음 |
| I8 | 역분해 입력 대문자화 제거 | R4 | 잡음 |
| I9 | 꼬리 대신 머리 일치 | D1·D2·D3·머리/중간 | 잡음 |
| I9 | 부분 문자열 일치 | D2·머리/중간 | 잡음 |
| I9 | `***` 토큰을 빼고 비교 | D2 | 잡음 |
| I9 | 동률을 domainId 내림차순 | D3 | 잡음 |
| I10 | 중간·짧은 한도 뒤바꿈 | L1·L3·중간 후보 | 잡음 |
| I10 | 뒤 단어부터 뗌 | L1·L3·중간 후보 | 잡음 |
| I10 | 길이를 UTF-16 char 수로 | L4 | 잡음 |
| I11 | 짧은이 비면 바로 논리명 | `labels.test.ts`(4건) | 잡음 |
| I11 | 공백만 있는 값을 값으로 | `labels.test.ts` 공백 | 잡음 |
| I12 | 자리 표시자 검사 삭제 | C5·C6·C7b·약어 없는 용어 | 잡음 |
| I12 | ② 재분해 검사만 삭제 | C6·약어 없는 용어 | 잡음 |
| I12 | ④ 논리명 `*` 검사만 삭제 | C7b | 잡음 |
| I12 | ③ 없는 termId 허용 | C7 | 잡음 |
| I12 | 형식 검사를 자리 표시자 검사보다 먼저 | C5 | 잡음 |
| I13 | 자기 컬럼 제외 누락 | C13·C14 | 잡음 |
| I13 | 필드명 비교 대소문자 무시 | C12 | 잡음 |
| I13 | 요청 안 중복 미검사 | C10 | 잡음 |
| I14 | save 가드 삭제 | C3·C4 | 잡음 |
| I14 | 가드에 SYSADMIN 허용 | C4·R2 | 잡음 |
| I14 | save 가드를 형식 검증 뒤로 | C3·C5·C17 | 잡음 |
| I14 | reg 가드 삭제 | R2 | 잡음 |
| I14 | save 가드 삭제(HTTP 경로) | P1 | 잡음 |
| I15 | 읽기(search)에 가드 추가 | P5 | 잡음 |
| I16 | BPMN 분해 액션을 `validate` 로 | `DmaBpmnActionTest` | 잡음 |
| I16 | BPMN 액션 이름 `searchDetail` | `DmaBpmnActionTest` | 잡음 |
| I16 | FE 빈 그리드 생략 | `api.test.ts` 두 그리드 | 잡음 |
| I17 | termRegPop 의 SYSADMIN·매트릭스 시드 누락(mcm 새 DB) | E2E `E2~E4`(팝업 유사어 조회부터 BFF 403 으로 빈 표) | 잡음 |
| I17 | 메뉴 leaf 이름 변경(`컬럼사전`, mcm 새 DB) | E2E E1(메뉴 이동 실패) | 잡음 |
| I18 | 약어 중복 비교 대소문자 구분 | R4 | 잡음 |
| I18 | 표기에 공백 허용 | R5 | 잡음 |
| I18 | 의미 번호 0 허용 | R5 | 잡음 |
| I18 | (표기, 의미 번호) 중복 미검사 | R3 | 잡음 |
| I19 | 대안 길이 증가 순서 뒤집기 | A1·A2·A3·A4 | 잡음 |
| I19 | 숫자 접미 대안 제거 | A6 | 잡음 |
| I20 | 표시명(긴) 한도 25 | C16 | 잡음 |
| I20 | 코드 칸 한도 51 | 코드 칸 길이 | 잡음 |
| I20 | 표시명(짧은) 한도 7 | C16·C23 | 잡음 |
| I21 | 매핑 전체 삭제 후 전체 삽입 | C14(VER 0) | 잡음 |
| I22 | TERM_IDS 를 문자열 배열로 | C2·C8 | 잡음 |
| I22 | TERM_IDS 정렬 | 1차 **생존** → C2b 추가 후 C2b | 잡음(보강 뒤) |
| I23 | 빈 사전이면 색인 null | 빈 사전 | 잡음 |
| I24 | V4 추가·V1~V3 수정 | 시험이 아니라 §3.1 "마이그레이션 불변" diff 게이트가 잡는다. 기점(3d08db7) 대비 `git diff --stat 3d08db7 -- …/db/migration` 출력 없음. `origin/dev` 는 기점 뒤 TSK-05-01 이 V4(`create_mdm_interface_layout`)를 더해 앞서 있으므로, 설계 명령(`origin/dev` 대비)은 그 V4 를 "삭제"로 보인다 — 이 브랜치가 지운 것이 아니다 | 게이트 |
| I25 | message 를 상세만으로 | `MdmErrorsTest`(상세 붙임) | 잡음 |
| I26 | 용어 사전 정적 캐시 | 1차 **생존**(R7 이 등록 뒤에만 분해해 캐시가 등록 뒤에 채워짐) → R7 이 등록 전에도 분해하게 고친 뒤 R7 | 잡음(보강 뒤) |
| I27 | 편집 거리 한도 2 | S1·편집 거리 1 까지 | 잡음 |
| I27 | 동의어 일치 점수 0.9 → 0.75 | S3 | 잡음 |
| I28 | MDM017 문구 변경 | `CommonContractTest` MDM016~021 | 잡음 |
| I29 | 팝업 [등록] 권한 판정 제거(m-mdm 재빌드) | E2E E6(`toBeDisabled` 실패) | 잡음 |
| I30 | 검색에서 시스템 필드명 제외 | C21 | 잡음 |

요약: 변이 65건(시험으로 잡는 64 + 게이트 1). 1차에 살아남은 변이 2건(I22 정렬, I26 캐시)은 시험을 보강해 잡았다. 최종 생존 0건. 처음 넣은 I3 "한 글자씩" 변이(`while (false)`)는 Java 도달 불가 문장이라 컴파일 오류였고, 도달 가능한 모양(`while (j < i)`)으로 바꿔 다시 돌렸다.

## Verify 기록 (Phase 04, 2026-09-24 재시도 — sonnet 승격, 실측)

이전 Verify(haiku, 17분)는 변이를 하나도 다시 넣지 않고 Build 의 변이 기록을 인용만 했고, E2E 를
새 DB 로 돌렸다는 근거(워크트리 `src/backend/data/` 의 mcm.db·mdm.db)가 없어 오케스트레이터가
반려했다. 이 절은 그 반려를 받은 뒤 **이 Verify 담당이 직접 실행해 얻은 결과**로 통째로 다시 썼다.
스크래치패드 하네스: `mutate_backend.py`(백엔드 변이 스윕, ElementTree 로 JUnit XML 을 정확히 파싱),
`mutate_fe.py`(FE 변이 스윕), `e2e-cycle.sh`(E2E 사이클, 재사용).

### 게이트 결과

전체 게이트를 포그라운드로 끝까지 돌렸다. 기준선·Build 수치 대비 신규 실패 0, 총수 미감소.

| 게이트 | 명령 | 결과 | 기준선/Build 대비 |
|---|---|---|---|
| 백엔드 전체 | `./gradlew testAll --console=plain` + XML 집계 | **1387 tests / 0 failures** | Build 수치와 동일, 신규 0 ✓ |
| FE m-mdm test(`pnpm build:libs` 먼저) | `pnpm --filter @dk-oasis/m-mdm test` | **8 files / 46 passed** | Build 수치와 동일 ✓ |
| FE m-mdm lint | `pnpm --filter @dk-oasis/m-mdm lint` | pass(`tsc --noEmit`) | 통과 ✓ |
| FE shared | `pnpm test:unit:shared` | **23 files / 156 passed** | 기준선과 동일 ✓ |
| OASIS 기본 | `check_oasis_contract.py --root .` | ERROR 0 / WARN 0 / INFO 29 | 기준선과 동일 ✓ |
| OASIS mdm 모듈 | `check_oasis_contract.py --root . --module mdm` | ERROR 0 / WARN 0 / INFO 2 | Build 수치와 동일 ✓ |
| page-registry 동기 | codegen 재실행 후 `git diff --exit-code` | diff 없음(22 pages) | 통과 ✓ |
| 마이그레이션 불변(기점 3d08db7 대비) | `git diff --stat 3d08db7 HEAD -- .../db/migration` | 출력 없음 | 통과 ✓(I24) |

세 게이트(백엔드 전체·FE m-mdm test·OASIS mdm 모듈)는 변이 스윕을 모두 끝낸 뒤 **한 번 더 재실행**해
게이트가 여전히 초록임을 재확인했다(위 표의 수치가 그 재확인 결과다).

### E2E 전체 스위트 (최종 클린 사이클)

§3.6 절차대로 새 mcm.db·mdm.db 로 서버 셋(mcm 18404 / mdm 18496 / 포털 15404)을 직접 띄우고 세
스펙을 `--workers=1` 로 한 번에 돌렸다. 아래는 변이 사이클을 모두 마친 뒤 마지막에 돌린 **클린
사이클**(스크래치패드 `e2e-final/`)의 결과이며, 이 사이클의 mcm.db·mdm.db 와 스크린샷을 그대로
남겼다.

| 스펙 | 결과 |
|---|---|
| `mdm-shell-rbac-smoke.spec.ts` | T1·T2·T3·T4 — 4 passed ✓ |
| `mdm-sample-smoke.spec.ts` | login → mdmSample — 1 passed ✓ |
| `mdm-columnMng.spec.ts` | E1·E2~E4·E5·E6 — 4 passed ✓ |
| **합계** | **9 passed**(29.5s) ✓ |

거짓 통과 방지 증거(요구된 ①~④):
1. **SQLite 경로**: mcm 로그가 절대 경로를 직접 찍는다 —
   `[Cactus] extras DataSource — bean='cactusDataSourceCmn' alias='cmn' url=jdbc:sqlite:/Users/jji/project/dmes-standard/dflow-88a2e470/src/backend/data/mcm.db`.
   mdm 로그는 상대 경로 `Database: jdbc:sqlite:../data/mdm.db` 를 찍는데, mdm 서버는
   `$W/src/backend/mdm` 에서 기동했으므로 `../data/mdm.db` 는 `os.path.normpath` 로 확인한 대로
   정확히 `/Users/jji/project/dmes-standard/dflow-88a2e470/src/backend/data/mdm.db`(워크트리)로
   풀린다 — `ls -la` 로 이 파일이 사이클 실행 시각(10:50~10:52)에 갱신된 것도 확인했다.
2. **포털 포트**: `fe.log` — `- Local: http://localhost:15404`(자체 포트, 5100 메인 체크아웃 아님).
3. **playwright 출력**: `9 passed (29.5s)`(위 표, `e2e-final/playwright.log`).
4. **E2E 뒤 DB 상태**: `sqlite3 src/backend/data/mdm.db "SELECT COUNT(*) FROM TB_MDM_COLUMN"` →
   **1**행, `1|원재료 코일 두께 편차|RMTL_COIL_THK_DEV` — E4 가 저장한 행이 그대로 남아 있다. mcm
   시드 대조(`mdm-rbac-seed-check.sql`)는 diff 0줄, mdm 사전 픽스처는 term 5건·domain 4건 정확히
   로드됐다.

### 변이 검증(직접 재실행)

Build 의 변이 기록을 인용하지 않고 **65건 중 30건**(백엔드 27 + FE 3, 규칙 I1~I30 전부를 최소 1건씩
덮음)을 이 Verify 가 직접 다시 넣고 스위트를 돌려 빨강을 확인한 뒤 되돌렸다. 매 변이마다
`git diff --stat` 으로 적용을 확인하고, 실행 뒤 `git diff --stat` 으로 되돌림과
`git status --short`(state.json 제외)로 작업 트리 청결을 확인했다 — 전 건 이상 없음. E2E 로만
잡히는 I17(2건)·I29 는 요구대로 새 mcm.db·mdm.db 로 서버를 다시 띄운 **전체 E2E 스위트**(세 스펙,
`--workers=1`)로 검증했다. 나머지는 `:mdm:lib:test :mdm:api:test --rerun-tasks --no-daemon
--continue --console=plain`(백엔드, mdm 모듈 전체 388 tests 기준) 또는
`pnpm --filter @dk-oasis/m-mdm test`(FE) 로 검증했다.

I24 는 앞 절의 마이그레이션 불변 diff 게이트가 그대로 잡는다(diff 없음 재확인, 코드 변이 대상이
아니다).

| 규칙 | 넣은 변이 | 스위트 | 잡은 시험(대표) | 결과 |
|---|---|---|---|---|
| I1 | `NamingRules.PLACEHOLDER` `"***"`→`"??"` | 백엔드 | D2, R3, F6, F7 외 12건 | KILLED |
| I1(FE) | `tokens.ts PLACEHOLDER` `"***"`→`"??"` | FE vitest | tokens.test.ts | KILLED |
| I2 | 최장 일치 루프를 최단 일치로 뒤집음 | 백엔드 | F1, F3, F2, 영문 덩어리 | KILLED |
| I3 | 미등록 구간 탐색을 덩어리 끝까지로 | 백엔드 | F8a, F8b | KILLED |
| I4 | `CHUNK_SEPARATOR` 에서 `(` 제외(글자 취급) | 백엔드 | F7 | KILLED |
| I5 | 별칭을 표면형 색인에서 제외 | 백엔드 | T4, F5b, 영문 덩어리 | KILLED |
| I6 | `CANDIDATE_ORDER` 에 `.reversed()` | 백엔드 | TermDictionaryTest, F5b, F5 | KILLED |
| I7 | 논리명에 항상 표면형(`surface()`)만 사용 | 백엔드 | F4 | KILLED |
| I8 | 역분해 다중 조각 대조를 1개로 고정 | 백엔드 | R2 | KILLED |
| I9 | 꼬리 정렬 대신 머리(`offset=0`) 정렬 | 백엔드 | D2, D3, D1, 머리/중간 케이스 | KILLED |
| I10 | `LabelSuggester` 중간·짧은 한도 인자 교체 | 백엔드 | L1, L3, 중간 후보, C23 | KILLED |
| I11(FE) | `labels.ts` 짧은 폴백이 중간을 건너뛰고 논리명으로 | FE vitest | labels.test.ts | KILLED |
| I12 | 저장 시 자리 표시자 검사(`if (...)`)를 `if (false)` 로 | 백엔드 | C5, C6, C7b, 약어 없는 용어 | KILLED |
| I13 | 매핑 충돌 검사에서 자기 컬럼 제외 삭제 | 백엔드 | C13, C14 | KILLED |
| I14 | `ColumnMngService.save` 의 `guard.requireStdAdmin()` 주석 처리 | 백엔드 | C3, C4, P1 | KILLED |
| I15 | `search` 첫 줄에 `guard.requireStdAdmin()` 추가 | 백엔드 | P5 | KILLED |
| I16 | BPMN `flow_compare` 의 `name` 을 `compare`→`validate` | 백엔드 | DmaBpmnActionTest, P5 | KILLED |
| I16(FE) | `saveColumn` 이 빈 `terms` 그리드를 생략하게 | FE vitest | api.test.ts | KILLED |
| I18 | `TermDictionary` 약어 색인을 대소문자 구분으로 | 백엔드 | R4 | KILLED |
| I19 | `AbbrSuggester` 대안 길이 증가 순서를 감소로 | 백엔드 | A1, A2, A3, A4 | KILLED |
| I20 | `LABEL_SHORT_MAX` 6→7 | 백엔드 | L1, L3, C16, C23 | KILLED |
| I21 | 매핑 차분 저장을 전체 삭제 후 전체 삽입으로 | 백엔드 | C14(VER 리셋) | KILLED |
| I22 | 저장 전 `termIds` 를 정렬 | 백엔드 | C2b(보강 시험) | KILLED |
| I23 | `TermDictionary.of` 가 빈 사전이면 NPE 던지게 | 백엔드 | 빈 사전 테스트, F6, C24, S5 | KILLED |
| I25 | `MdmErrors.of` 의 message 를 상세만으로 | 백엔드 | MdmErrorsTest, C27, C19, C17 | KILLED |
| I26 | `ColumnMngService.loadDictionary()` 에 인스턴스 캐시 추가 | 백엔드 | R7(보강 시험), C8, C23, C24 | KILLED |
| I27 | 유사어 편집 거리 한도 1→2 | 백엔드 | S1, "편집 거리는 1 까지만" | KILLED |
| I28 | `MdmErrorCode.NAME_PLACEHOLDER_REMAINS` 기본 문구 변경 | 백엔드 | CommonContractTest | KILLED |
| I30 | 검색에서 시스템 필드명 매치 제거(`return false`) | 백엔드 | C21 | KILLED |
| **I17a** | `DataInitializer` RBAC 루프에서 `"termRegPop"` 제거 | **E2E 전체**(mcm 새 DB) | E2~E4(팝업 유사어 표 빈 채로 타임아웃) | KILLED |
| **I17b** | 메뉴 leaf 이름 `"컬럼 사전"`→`"컬럼사전"` | **E2E 전체**(mcm 새 DB) | E1(메뉴 클릭 실패) | KILLED |
| **I29** | `termRegPop.tsx` `disabled={busy \|\| !canReg}`→`disabled={busy}`(m-mdm 재빌드) | **E2E 전체**(mdm 재빌드+포털 재기동) | E6(`toBeDisabled` 실패) | KILLED |

요약: **30건 실행, 30건 KILLED, 생존 0건, 무효 0건**(전부 `git diff --stat` 으로 적용 확인, 컴파일
실패 없음). I17a·I17b·I29 는 예상한 정확한 이유로 죽었다 — I17a 는 E2~E4 가 termRegPop 검색 403 으로
유사어 표가 비어 타임아웃, I17b 는 E1 이 정규식 `/^컬럼 사전$/` 로 메뉴를 못 찾아 실패, I29 는 E6 의
`toBeDisabled()` 단언이 실패했다(각 로그는 `e2e-i17a/`, `e2e-i17b/`, `e2e-i29b/` 에 있다). 남은
65-30=35건(주로 Build 표의 보조 케이스·중복 근거)은 시간 제약으로 다시 넣지 않았다 — Build 1차
스윕에서 이미 KILLED 로 기록됐고, 이번에 다시 넣은 30건이 각 규칙(I1~I30)을 최소 1건씩 덮었으므로
빠뜨린 규칙은 없다. I22·I26(Build 1차 스윕 생존 뒤 보강)도 이번에 다시 넣어 보강 시험(C2b·R7)이
여전히 잡는 것을 재확인했다.

인프라 메모(변이 결과가 아님): 첫 I29 사이클(`e2e-i29`)은 이전 사이클 종료 직후 곧바로 시작해
mcm.db 조회가 `database is locked`·`no such table` 로 오염되었다(mcm 프로세스 종료 타이밍과 포트
재사용 경합으로 추정). `e2e-cycle.sh` 에 포트 대기 루프(0단계)와 시드 조회 재시도(4단계, 최대 8회)를
추가한 뒤 `e2e-i29b` 로 다시 돌려 깨끗하게 재현했다(위 표는 i29b 결과). 이 사고는 하네스 문제이며
I29 자체의 판정과는 무관하다.

### 수용 기준 매핑(실측)

| 수용 기준 | 서버 시험(testAll, 1387/0 안에 포함) | E2E |
|---|---|---|
| AC1 한 시스템 안 같은 필드명의 두 번째 등록 거부 | `ColumnMngServiceSqliteTest#C9·C10·C11·C12·C13`, `DmaOasisHttpTest#P8` 통과 | `mdm-columnMng.spec.ts` E5 통과(MDM018 문구) ✓ |
| AC2 라벨이 비면 더 긴 쪽으로 대체해 표시 | `labels.test.ts`(FE, 46 passed 안에 포함) | E4 통과(표시명 칸이 중간값으로 폴백) ✓ |
| AC3 포털 메뉴에서 화면이 열리고 E2E 가 통과 | 시드 시험(`DataInitializer` 기동 성공, mcm 시드 diff 0) | E1~E6 9 passed 전체 ✓ |
| AC4 `***` 가 남으면 저장 불가 | `ColumnMngServiceSqliteTest#C5·C6·C7·C7b`, `DmaOasisHttpTest#P2` 통과 | E2~E4 통과(오류 문구 표시, 목록 불변) ✓ |
| AC5 권한 없는 사용자는 인라인 등록 불가 | `TermRegPopServiceSqliteTest#R2`, `DmaOasisHttpTest#P6`(서버 403 상당), BFF 403 은 `mdm-shell-rbac-smoke#T3` 패턴과 동일 | E6 통과(팝업 비활성·저장 비활성) ✓ |

---

**Verify Phase 판정**: **PASS**

게이트 8개 전부 기준선/Build 대비 신규 실패 0, E2E 최종 클린 사이클 9 passed(증거 ①~④ 확보), 변이
30건(백엔드 27+FE 3, I1~I30 전 규칙 최소 1건, E2E 전용 I17a·I17b·I29 포함) 전부 KILLED·생존 0, 수용
기준 5개 전부 실측 시험명으로 대조 완료.

