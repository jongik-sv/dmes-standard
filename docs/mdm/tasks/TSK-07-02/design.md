# TSK-07-02 설계 — 마루 데이터 조회·등록·수정·카테고리 편집

> 도커 금지 모드다(출처: 워커 기본). 「도커 금지로 생략한 검증」 절을 본다.
> 마이그레이션: **없음**. 스키마는 TSK-07-01 의 V10(`TB_MDM_DATA`·`TB_MDM_DATA_ITEM`·`TB_MDM_DATA_CATE`·`TB_MDM_DATA_CATE_ITEM`)
> 을 그대로 쓴다.

---

## 0. 조사로 확인한 사실 (Build 가 원천 문서를 다시 읽지 않아도 되게 적는다)

| # | 사실 | 근거 |
|---|---|---|
| F1 | spec entry-point 의 화면 그룹 코드 `mdd`(`mdd/dataMng` 등)는 낡은 값이다. TSK-07-03 design.md D1 이 이미 같은 문제를 풀었다 — 화면 그룹 정본(`docs/mdm/screens/README.md`)·wbs·TRD 패키지(`com.dongkuk.dmes.mdm.dmd.*`)·기존 구현(`dataItemMng`·`dataHistory`)이 모두 **`dmd`**("마스터데이터" 폴더)다. 이 설계도 `dmd` 를 쓴다. e2e 파일명은 수용 기준 문구 그대로 `mdm-dataMng.spec.ts` 등이다(파일명은 화면 ID 기준이라 그룹 코드와 무관) | `docs/mdm/tasks/TSK-07-03/design.md` F1·D1, `com.dongkuk.dmes.mdm.dmd.dataItemMng.*` 실존 |
| F2 | **메뉴 시퀀스가 이미 예약돼 있다.** `mcm/api/.../init/DataInitializer.java` 의 `seedMdmDataItemMenus()`(883행) 주석: "MENU_SEQ 001~003 은 TSK-07-02(dataMng·dataEdit·dataCateEdit) 몫으로 비워 둔다." `dmd` 폴더 FULL_SEQ 베이스는 `5040000`(867행 `insertMpnFld("dmd", "00000400", "마스터데이터", "mdm", 5040000L)`), 004/005 가 `5040400`/`5040500` 을 쓰므로 001~003 은 `5040100`/`5040200`/`5040300` 이다 | `DataInitializer.java:862-964`(폴더)·`955-976`(`seedMdmDataItemMenus`) |
| F3 | `dmd` 그룹 RBAC 은 이미 매트릭스에 있다 — `MdmPermissions.MATRIX`: `STD_ADMIN=READ`, `STEWARD=EDIT`(READ=search/view/export/compare, EDIT=READ+save/delete/reg/…/restore). 새 OBJECT 를 `seedMdmObjectRbac(objectId, "dmd")` 로 등록하면 이 매핑을 그대로 받는다. 새 역할·권한 세트를 만들 필요가 없다 | `MdmPermissions.java:33,47` |
| F4 | 액션 어휘는 `MdmActions` 16종(`SEARCH·VIEW·EXPORT·COMPARE·SAVE·DELETE·REG·IMPORT·VALIDATE·EXECUTE·COPY·RESTORE·LOCK·UNLOCK·HANDOVER·CONFIRM`) 안에서만 BPMN 분기 이름을 쓴다(`DmdBpmnActionTest`·`SecurityScreenContractTest` 가 고정). TSK-07-03 D9 선례대로 **새 액션을 만들지 않고** 닫기=`delete`, 다시 열기=`restore`, 등록=`reg`, 수정=`save` 로 매핑한다 | `MdmActions.java`, TSK-07-03 D9 |
| F5 | `MdmTemporalSegmentStore<K,V>` 의 실 구현체는 TSK-07-03 이 이미 만들어 뒀다 — `common/segment/DataItemSegmentStore`·`DataCateSegmentStore`·`DataCateItemSegmentStore`(선분 등록/수정/닫기/다시열기). **카테고리·소속 선분의 화면용 오케스트레이션도 이미 있다**: `common/segment/DataCategorySegmentCore`(`@Component`, `PlatformTransactionManager` 로 직접 `TransactionTemplate` 을 쥐는 클래스) 가 `registerCate`/`modifyCate`/`closeCate`/`reopenCate`/`addMember`/`removeMember` 6개 메서드를 이미 제공한다. 클래스 주석이 명시적으로 "화면은 TSK-07-02 몫"이라고 적어 뒀다. **이 Task 는 새 선분 저장 로직을 만들지 않는다** — `MdmTemporalSegmentStoreNoImplementationTest`(ArchUnit, "허용 패키지 `common.segment` 의 정해진 세 클래스만 구현체" 로 뒤집힌 상태)를 건드리면 안 되므로 새 구현체를 만들 이유도 없다 | `DataCategorySegmentCore.java` 전문 확인, TSK-07-03 design.md F5·불변 규칙 A3 |
| F6 | `DataCategorySegmentCore.registerCate/modifyCate/closeCate/reopenCate/addMember/removeMember` 는 각각 **자기 트랜잭션**(`tx.execute(...)`, `TransactionTemplate` 기본 전파 `PROPAGATION_REQUIRED`)을 갖는다. Spring 의 `TransactionTemplate` 은 이미 활성 트랜잭션이 있으면 새로 만들지 않고 **참여(join)** 한다 — 이 사실이 아래 F7 과 결합해 dataMng 등록의 "한 트랜잭션" 요구를 만족시키는 방법을 정한다 | Spring `TransactionTemplate`/`DefaultTransactionDefinition` 표준 동작(전파 기본값 REQUIRED), 코드 직접 확인 |
| F7 | **OASIS 디스패치 경로에는 앰비언트 Spring 트랜잭션이 없다.** `grep -rn "@Transactional" src/backend/oasis`, `OasisController`/`ServiceController`/`InboundAutoConfiguration`(cactus-core) 어디에도 `@Transactional` 이 없다. `dmc/codeMng/CodeMngService` 의 주석("트랜잭션은 OASIS 프로세스가 건다")은 **근거를 확인할 수 없다** — 그 서비스가 실제로 원자성을 갖는지는 이번 조사로 확인되지 않았다(기존 코드라 이 Task 가 고칠 대상은 아니다). **이 Task 는 이 가정에 기대지 않는다** — dataMng 등록은 서비스 자신이 `TransactionTemplate` 을 쥐고 `MdmData` 저장과 `registerCate` 호출을 한 트랜잭션으로 직접 묶는다(F6 의 join 동작으로 원자성이 보장된다). 이 방식은 `DataCategorySegmentCore` 자신이 이미 쓰는 검증된 패턴이다 | `grep -rn "@Transactional" src/backend/oasis --include=*.java`(0건), `OasisController.java` 전문 확인 |
| F8 | `DataSegmentLock.lock(maruDataId)` 는 호출 맨 앞에서 `entityManager.flush()` 를 자동으로 한다(별도 flush 불필요). 0행이면 `MdmErrorCode.INVALID_INPUT`("없는 마루 데이터입니다: …")로 거부한다(L3). 그래서 등록 흐름은 `dataRepo.save(new MdmData(...))` 뒤 바로 `categorySegmentCore.registerCate(...)` 를 불러도 된다 — `registerCate` 내부의 `lock.lock()` 이 그 `save()` 를 알아서 플러시해 새로 만든 행을 본다 | `DataSegmentLock.java:34-36` |
| F9 | `TB_MDM_DATA` 에는 항목처럼 별도 `ROW_VERSION` 칼럼이 없다. 대신 `MdmData` 가 상속하는 `CactusAuditEntity.version`(`VER` 칼럼)이 있고, `CactusAuditListener.onPreUpdate` 가 매 UPDATE 마다 `+1` 한다(DB CAS 아님, 애플리케이션 비교). 04 `CodeEditService.requireAuditVer(entity, expectedVer)` 와 정확히 같은 방식을 05 헤더 저장·폐기에도 쓸 수 있다 — `DataSegmentLock` 의 행 잠금(L1~L3)이 이미 동시 쓰기를 직렬화하므로, 잠금 뒤 재조회한 `VER` 과 클라이언트가 보낸 `auditVer` 를 비교하는 것만으로 충분하다(진짜 DB CAS 가 없어도 손실 갱신이 생기지 않는다) | `CactusAuditEntity.java`, `CactusAuditListener.java:46-59`, `CodeEditService.requireAuditVer` |
| F10 | 카테고리 닫기(`DataCateSegmentStore.close`)는 **소속(CATE_ITEM)에 연쇄하지 않는다** — 04(`MasterCodeCateSegmentOps.closeCategory`)와 달리 CATE_ITEM 을 전혀 건드리지 않는 것을 코드로 직접 확인했다. 05 의 "닫힌 카테고리는 소속 보존"은 이미 저절로 만족된다. "판정 false" 는 **읽기 쪽**(매칭 건수·소속 조회)이 항상 "카테고리 자체가 열려 있는가"를 먼저 보고, 닫혀 있으면 무조건 0/미판정으로 응답하는 방식으로 이 Task 가 구현해야 한다(선례: `DataItemListQuery.openCate()` 가 `CateSegmentRow::isOpen` 인 것만 찾는다 — 닫힌 카테고리는 필터에서 사실상 사라진다) | `DataCateSegmentStore.close()` 전문, `DataItemListQuery.java:103-104` |
| F11 | `DataItemChecks.cateDefIssues(cateId, value)` 는 REGEX 문법·허용 `defTarget`(`CategoryOwner.MASTER_DATA.allowedDefTargets()` = KEY/LVL1-5/ATTR01-10)만 검사한다. **`defTarget=LVLn` 이 그 마루 데이터의 `lvl_cnt` 를 넘는지, `ATTRn` 에 라벨이 있는지는 검사하지 않는다.** 이 메서드는 TSK-07-03 소유 공용 코어이고 L1/A3 불변 규칙을 건드릴 위험이 있어 **고치지 않는다** — 화면(FE 드롭다운을 `lvlCnt`·라벨 있는 attr 로만 제한) 선에서 막는다(담당자 확인 필요 결정 D5) | `DataItemChecks.java:138-168` 전문 확인 |
| F12 | `DataSegmentRowStore` 는 `common/segment` 패키지의 공개 컴포넌트로, `dmd` 패키지 서비스가 이미 직접 주입해 쓰고 있다(`DataItemMngService`·`DataHistoryService`). 이 Task 도 직접 주입해 읽기 전용 메서드를 호출한다. 다만 **카테고리 전체 목록(닫힌 것 포함, 최신 행만)** 과 **TABLE 카테고리의 열린 소속 코드 목록**을 돌려주는 메서드가 없다 — `cateRows(md, cateId)`(카테고리 하나의 전 이력), `openCateRows(md)`(열린 카테고리만), `cateItemRows(md, cateId, code)`(코드 하나의 소속 이력) 세 개뿐이다. 이 Task 가 `latestCateRows(maruDataId)`(카테고리별 마지막 행, `latestItemRows` 와 같은 NOT-EXISTS 패턴)와 `openMemberCodes(maruDataId, cateId)`(그 카테고리에 지금 열려 있는 CODE 목록, `DataItemListQuery` 의 TABLE JOIN 과 같은 조건)를 **추가**한다 — 기존 메서드는 건드리지 않는 순수 추가 | `DataSegmentRowStore.java` 시그니처 전수 확인, `DataItemListQuery.java:119-131`(TABLE JOIN 조건 원형) |
| F13 | `TB_MDM_DATA_SYSTEM`(배포 대상 시스템) 은 TSK-07-01 이 "보류 테이블 — DDL·엔티티는 있으나 **서비스·화면·리포지토리는 없다**"(엔티티 javadoc 원문, D-019)고 명시했고, 리포지토리가 실제로 없다(`MdmDataSystemRepository` 미존재). TSK-07-04(`docs/mdm/tasks/TSK-07-04`, phase=ready, spec 미발행)가 "배포" 절(05 문서 「배포와 사본」)을 다룰 다음 Task 로 이미 예약돼 있다 | `MdmDataSystem.java` javadoc, `find … MdmDataSystemRepository` 0건, `TSK-07-04/state.json` |
| F14 | 배포 순번(`chg_seq`/`last_chg_seq`) 발급은 TSK-07-03 도 "보류(PRD §2 규칙 7)"로 명시하고 실제로 발급하지 않는다(`DataSegmentLock.LOCK_SQL` 은 `LAST_CHG_SEQ = LAST_CHG_SEQ` 자기 대입일 뿐 증가시키지 않는다). 이 Task 도 같은 원칙을 따른다 — 05 문서의 "배포 순번 1을 찍는다" 문구는 TSK-07-04 가 풀 때까지 미룬다 | `DataSegmentLock.java` 주석·SQL, TSK-07-03 spec 요구사항 |
| F15 | 마루 코드·마루 데이터 ID 이름 공간 충돌 검사는 04 `CodeMngService.register()` 에 이미 있다: `if (codes.existsById(id) || data.existsById(id)) throw MdmErrors.of(MARU_ID_NAMESPACE_CONFLICT)`(MDM011, "마루 코드·마루 데이터에 같은 ID 가 있습니다"). `MaruIdNamespace`(전사 계약 인터페이스, `contract/category`)의 실 구현체는 `MasterCodeIdNamespace`(04)·`MdmDomain`·`dma/columnMng`뿐이고 05 전용 구현체는 없다 — 04 는 계약 인터페이스를 통하지 않고 **두 리포지토리를 직접 조회**하는 것으로 이 검사를 이미 구현했다. 이 Task 도 대칭으로 `dataRepo.existsById(id) || codeRepo.existsById(id)` 를 쓴다(계약 인터페이스를 새로 구현하지 않는다 — 04 도 안 했다) | `CodeMngService.java:132-166`, `grep -rl "implements MaruIdNamespace"`(4건, 05 없음) |
| F16 | BASE 카테고리 표시 이름은 04 관례가 `"전체"`(`MasterCodeVersionSegments.BASE_CATE_NAME`)다. 05 문서는 표시 이름을 못박지 않는다. 이 Task 는 같은 문자열 `"전체"` 를 쓴다(일관성, 근거 강도: 낮음 — 05 고유 표기가 필요하면 담당자가 바꿀 수 있다) | `MasterCodeVersionSegments.java:34` |
| F17 | `dmc/codeCateEdit` 의 "save = 그리드 diff(ADDED/CHANGED/DELETED) 로 닫기까지 포함" 패턴은 **04 의 버전(from_ver/to_ver) 드래프트 모델 전용**이다(닫힌 카테고리를 "restore" 로 되돌리는 것도 드래프트 되돌리기이지 05 식 "다시 열기"가 아니다). 05 는 드래프트가 없이 매 액션이 즉시 커밋되므로(F5·F6), 04 의 save-covers-close 패턴을 그대로 옮기지 않고 **TSK-07-03 D9 의 개별 액션 매핑**(닫기=`delete`, 다시열기=`restore`)을 따른다(이 설계 §1) | `CodeCateEditService.java:210-253`, TSK-07-03 D9 |
| F18 | `DataItemMngService`·`DataHistoryService`·`DataCategorySegmentCore` 모두 `@Transactional` 을 붙이지 않는다(OASIS 바인딩이 CGLIB 프록시의 파라미터명 손실로 죽는 문제, F11 각주와 동일 사유가 반복 인용됨). 이 Task 의 새 서비스 3개도 `@Transactional` 을 붙이지 않는다 — 원자성이 필요한 지점(F6)은 서비스가 직접 쥐는 `TransactionTemplate` 로만 해결한다 | `DataItemMngService.java` 클래스 주석 |
| F19 | 프런트 `pages/dmd/dataItemMng/api.ts` 의 `callOasis(serviceId, action, params)` → `POST /api/mdm/oasis/{serviceId}/{action}` + `{meta:{menuId}, params: omitNullish(params)}`, `unwrap()` 이 `meta.success===false` 면 `meta.message` 를 그대로 `Error` 로 던지는 패턴을 그대로 복제한다. row_version(05 는 `auditVer`) 충돌 문구 판정은 `ROW_VERSION_CONFLICT.defaultMessage()`("다른 사용자가 수정했습니다. 다시 불러오세요") 접두어 매칭이다 | `DataItemMngPage` 조사 보고, `MdmErrorCode.java:14` |
| F20 | `DataItemListQuery` 의 `targetValue(ItemSegmentRow, String)`(package-private)·`matches(Pattern, String)`(private, **null → false 로 항상 미매칭**)이 REGEX 매칭의 유일한 기존 구현이다. `DataCategoryResolver` 를 별도로 새로 구현하면 null 처리·대상 분기가 갈라질 위험이 있다(05 의 "매칭 0건" 전제가 깨질 수 있다) — **재구현하지 않고 이 두 메서드를 `DataCategoryResolver` 로 옮겨 `public static` 으로 공개하고, `DataItemListQuery` 는 그것을 호출하도록 고친다**(동작 변경 없는 추출) | `DataItemListQuery.java:185-201` 전문 확인 |
| F21 | `src/frontend/m-mcm/lib/generated/page-registry.ts` 는 **자동 생성 파일**(`scripts/generate-page-registry.mjs`, prebuild/predev 훅)이다. `page.tsx` 를 올바른 경로(`pages/dmd/{screen}/page.tsx`)에 두기만 하면 빌드 시 자동으로 항목이 생긴다 — **수동 편집 대상이 아니다**(TSK-07-03 도 손대지 않았다) | 파일 헤더 "AUTO-GENERATED", `dmd/dataItemMng`·`dmd/dataHistory` 항목이 이미 존재 |
| F22 | `e2e/fixtures/mdm-rbac-seed-check.{sql,expected.txt}`(TSK-01-03 계약 대조)은 `dma`/`dmb`/`dmc`/`dmd`/`dme` **폴더**·MDM 역할·권한 **세트**(`PERM_MDM_READ/EDIT/CONFIRM`)·`mdmSample` **OBJECT** 하나만 본다. 새 OBJECT(`dataMng` 등)를 기존 권한 세트로 시드해도 이 대조 대상에 없으므로 **고칠 필요가 없다** | `mdm-rbac-seed-check.sql`·`.expected.txt` 전문 확인 |
| F23 | 화면 스모크 넷은 TSK-07-03 의 `mdm-dataItemMng.spec.ts`/`mdm-dataHistory.spec.ts` 관례를 그대로 따른다: `BASE_URL=http://127.0.0.1:5100`(이미 떠 있는 로컬 포털, 이 세션이 새로 띄우지 않는다 — 도커 금지와 무관, 「로컬 기동 사전조건」 메모 참고), 로그인 계정 `e2e_mdm_steward`/`admin123`, `SUFFIX=Date.now().toString(36)` 로 유니크 키, 픽스처는 `e2e/fixtures/mdm-dataMng.sql`(신설, `INSERT OR IGNORE`)로 최소 데이터를 깔고 e2e 는 그 행을 고치지 않는다(쓰기는 항상 새 키로) | TSK-07-03 design.md §3.1(213-242행) 전문 인용 |
| F24 | `DmdOasisHttpTest.java`(187행)·`DmdScreenMessageParityTest.java`(40행)는 지금 **`dataItemMng` 전용으로 하드코딩**돼 있다(`MESSAGES = Path.of(".../dataItemMng/messages.ts")` 리터럴 하나뿐). 이 Task 가 화면마다 메시지 정합·HTTP 왕복 검증을 받으려면 `DmdScreenMessageParityTest` 를 화면별 루프/파라미터화로 바꿔야 한다(§2 「수정 — 공유 파일」) | 두 파일 전문 확인 |

Build 는 위 F 목록을 그대로 인용하고, 구현 중 새로 확인한 사실은 design.md 를 고치지 않고 build-log.md 에 적는다(공통 규칙 2).

---

## 1. 접근 방식

TSK-07-01(엔티티·저장 계약)과 TSK-07-03(선분 저장 코어 `DataItemSegmentStore`/`DataCateSegmentStore`/`DataCateItemSegmentStore`,
잠금 `DataSegmentLock`, 화면용 오케스트레이션 `DataCategorySegmentCore`, 읽기 `DataSegmentRowStore`)이 이미 병합돼 있다(F5).
이 Task 의 실질은 **세 화면(BPMN + `@Service` 얇은 레이어 + 프런트 + e2e)을 그 위에 얹는 것**이지 새 저장 로직을 설계하는
것이 아니다. 04(`dmc`)의 조회·등록·수정·카테고리편집 네 화면이 구조적으로 가장 가까운 선례이지만, 04 는 버전(from_ver/to_ver)
드래프트 모델이고 05 는 일시(valid_from/valid_to) 즉시-커밋 모델이라 그대로 베끼지 않는다(F17) — 대신 **05 안에서 이미
확립된 TSK-07-03 의 패턴**(개별 액션 = 개별 커밋, `DataSegmentLock` 선잠금, `DataItemChecks`/`DataItemMessages` 재사용,
잠금 뒤 재조회 값으로만 판정)을 그대로 따른다.

세 화면의 책임 경계:
- **dataMng**(조회+등록): `TB_MDM_DATA` 조회, MDM 원천 등록(TB_MDM_DATA INUSE + CATE BASE 한 트랜잭션, F6·F7·F8). 등록 뒤
  프런트가 dataEdit 로 이동한다(라우팅, 서버 책임 아님).
- **dataEdit**(수정): 헤더(이름·설명·키 패턴)·계층 칸 수·추가 컬럼 라벨을 한 저장 액션으로 묶어 저장(04 `saveHeader` 선례,
  F9). 카테고리 목록은 **읽기 전용 카드**로만 보여준다(매칭 건수 포함) — 카테고리 자체의 등록·정의 수정·닫기·다시열기·소속
  편집은 전부 dataCateEdit 화면의 책임이다(화면 간 경계를 흐리지 않는다). 폐기(2단 확인은 FE 전용 UX, 서버는 단일 액션).
- **dataCateEdit**(카테고리 편집): `DataCategorySegmentCore` 의 6개 메서드를 액션별로 얇게 감싼다. REGEX 매칭 미리보기·
  TABLE 소속 일괄 적용(전부-아니면-전무, F6 의 트랜잭션 join 을 다시 활용)을 새로 만든다.

**상단 "마루 데이터 select" 는 새 액션을 만들지 않는다.** dataEdit·dataCateEdit 이 메뉴에서 바로(선행 화면의 이동 상태
없이) 열렸을 때 보여줄 선택 목록은 **dataMng 의 기존 `search` 액션을 그대로 호출**해서 얻는다(같은 `dmd` 그룹이라 RBAC 은
OBJECT 마다 동일하게 시드되므로 권한 문제가 없다, F3). `dataEdit.bpmn`/`dataCateEdit.bpmn` 에 `search` 분기를 새로 만들지
않는다 — 액션 어휘를 화면마다 늘리지 않고(F4), 목록 로직도 한 곳(dataMng)에만 둔다.

공용으로 새로 두는 것(다른 두 화면이 읽기만 하므로 한 곳에서만 만든다, §「구현 단위」B1):
- `DataCategoryResolver`(`common/segment`, 신설) — REGEX 매칭 미리보기·건수 계산(열린 항목만, F10). TABLE 은 `DataSegmentRowStore.openMemberCodes` 로 건수를 센다(리졸버가 필요 없다).
- `DataSegmentRowStore.latestCateRows`·`openMemberCodes`(신설 메서드 2개, 기존 메서드는 손대지 않는다, F12).

---

## 2. 변경 파일 목록

### 생성 — 백엔드 공용(B1)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/segment/DataCategoryResolver.java` — REGEX 후보 매칭(열린 항목만, `rows.latestItemRows(md)` 를 `isOpen()` 으로 거른 뒤 `Pattern.matches`). **새로 만들지 않고 `DataItemListQuery` 에 있던 `targetValue`/`matches` 를 `public static` 으로 옮겨 그대로 쓴다**(F20 — null→false, KEY/LVL n/ATTR n 분기 전부 원본과 글자 그대로 같다). 문법 오류(`PatternSyntaxException`)는 던지지 않고 `invalid=true` 플래그로 응답한다(compare 액션이 사용자가 타이핑 중인 정규식을 실시간으로 보내므로, 04 `MasterCodeCategoryResolver` 와 같은 스타일).
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/common/segment/DataCategoryResolverSqliteTest.java`

### 수정 — 백엔드 공용(B1, 순수 추가·추출만, 기존 동작 변경 없음)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/segment/DataSegmentRowStore.java` — `latestCateRows(String maruDataId)`, `openMemberCodes(String maruDataId, String cateId)` 두 메서드 추가(F12). 기존 메서드 시그니처·SQL 은 한 글자도 바꾸지 않는다.
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmd/dataItemMng/service/DataItemListQuery.java` — `targetValue`/`matches` 두 메서드를 삭제하고 `DataCategoryResolver.targetValue`/`DataCategoryResolver.matches`(새로 `public static` 로 옮긴 것)를 호출하도록 고친다(F20, 순수 추출 — 동작 변경 없음). `DataItemMngServiceSqliteTest` 기존 케이스가 그대로 통과해야 이 추출이 무해했다는 증거다.

### 생성 — dataMng(B1)
- `src/backend/mdm/api/src/main/resources/services/dmd/dataMng.bpmn` — process id `dataMng`, bean `dataMngService`, 액션 `search`·`reg`.
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmd/dataMng/service/DataMngService.java`
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmd/dataMng/dto/{DataMngSearchRequest,DataMngSearchResult,DataMngRow,DataMngRegRequest,DataMngRegResult}.java`
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmd/dataMng/DataMngServiceSqliteTest.java`
- `src/frontend/m-mdm/pages/dmd/dataMng/{api.ts,page.tsx,types.ts,columns.ts}`
- `src/frontend/e2e/mdm-dataMng.spec.ts`
- `src/frontend/e2e/fixtures/mdm-dataMng.sql`(신설, `INSERT OR IGNORE`) — 세 화면(dataMng·dataEdit·dataCateEdit) e2e 가 공유하는 최소 픽스처(TB_MDM_DATA 2행 정도 + BASE 카테고리 + REGEX/TABLE 카테고리 각 1개 + 항목 몇 개, `mdm-dataItem.sql` 과 같은 형식). B1 이 만들고 B2·B3 는 기존 행을 고치지 않는다(모자라면 build-log.md 에 적고 새 `INSERT OR IGNORE` 행만 덧붙인다).

### 생성 — dataEdit(B2)
- `src/backend/mdm/api/src/main/resources/services/dmd/dataEdit.bpmn` — process id `dataEdit`, bean `dataEditService`, 액션 `view`·`save`·`delete`(폐기). (마루 데이터 선택 목록은 dataMng 의 `search` 를 호출한다 — 위 §1 참고, 여기에 `search` 분기를 만들지 않는다.)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmd/dataEdit/service/DataEditService.java` — `save`·`delete`(폐기) 는 **자기 `TransactionTemplate`**(`PlatformTransactionManager` 주입, `DataCategorySegmentCore`·`DataMngService` 와 같은 패턴)으로 `lock → 검사 → 갱신` 을 한 번에 감싼다(F7 — OASIS 앰비언트 트랜잭션에 기대지 않는다). `view` 는 트랜잭션이 필요 없다(읽기 전용, 잠금도 걸지 않는다 — 05 문서에 조회 시 잠금 요구가 없다).
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmd/dataEdit/dto/{DataEditViewRequest,DataEditView,DataEditHeaderSaveRequest,DataEditDeprecateRequest,CategorySummaryRow}.java`
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmd/dataEdit/DataEditServiceSqliteTest.java`
- `src/frontend/m-mdm/pages/dmd/dataEdit/{api.ts,page.tsx,types.ts,messages.ts}`
- `src/frontend/e2e/mdm-dataEdit.spec.ts`

### 생성 — dataCateEdit(B3)
- `src/backend/mdm/api/src/main/resources/services/dmd/dataCateEdit.bpmn` — process id `dataCateEdit`, bean `dataCateEditService`, 액션 `search`(그 마루 데이터의 카테고리 목록, `maruDataId` 필수 파라미터)·`view`·`compare`·`reg`·`save`·`delete`·`restore`. (마루 데이터 선택 목록도 dataMng 의 `search` 를 호출한다 — 여기 `search` 는 이름은 같지만 파라미터가 달라 혼동하지 않도록 DTO 이름을 `CateSearchRequest`(§2 목록)로 명확히 분리한다.)
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmd/dataCateEdit/service/DataCateEditService.java` — `reg`·`save`(REGEX 정의 수정)·`delete`·`restore` 는 **`DataCategorySegmentCore` 를 그대로 호출**한다(그 메서드들이 이미 자기 잠금·검사·트랜잭션을 갖고 있다, F5·F10 — 서비스가 먼저 잠그지 않는다, 이중 잠금 금지 R2′). `save`(TABLE 소속 일괄 적용)만 예외로 **자기 `TransactionTemplate`** 을 새로 쥐어 `addMember`/`removeMember` 호출 N개를 한 트랜잭션으로 묶는다(전부-아니면-전무, F6 의 join 동작을 다시 활용 — 개별 호출은 각자 `DataCategorySegmentCore` 안에서 잠그므로 서비스가 별도로 잠그지 않는다). `search`·`view`·`compare` 는 읽기 전용(트랜잭션·잠금 없음).
- `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dmd/dataCateEdit/dto/{CateSearchRequest,CateSearchResult,CateRow,CateViewRequest,CateViewResult,CateRegRequest,CateSaveRequest,CateCompareRequest,CateCompareResult,MemberApplyRequest}.java`
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmd/dataCateEdit/DataCateEditServiceSqliteTest.java`
- `src/frontend/m-mdm/pages/dmd/dataCateEdit/{api.ts,page.tsx,types.ts,components/{CategoryListPanel,RegexEditPanel,PreviewPanel,TransferListPanel}.tsx}` — 04 `codeCateEdit` 의 컴포넌트 분할을 그대로 본뜨되 카테고리 닫기/다시열기 버튼을 추가한다(04 에는 없다, F17).
- `src/frontend/e2e/mdm-dataCateEdit.spec.ts`

### 수정 — 공유 파일(각 유닛이 자기 화면 항목만 추가, 다른 화면 항목은 건드리지 않는다)
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmd/DmdBpmnActionTest.java` — `dataMng_액션은_search_reg()`(B1)·`dataEdit_액션은_view_save_delete()`(B2)·`dataCateEdit_액션은_...()`(B3) 3개 `@Test` 메서드를 기존 두 메서드 뒤에 추가. 기존 `dataItemMng_...`·`dataHistory_...` 메서드는 한 글자도 바꾸지 않는다.
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmd/DmdOasisHttpTest.java`(187행, 전문 확인함, F24) — 지금 `dataItemMng` 액션 하나만 HTTP 로 왕복시킨다. B1·B2·B3 가 각자 자기 화면의 대표 액션(쓰기 1개) 왕복 테스트 메서드를 기존 메서드 뒤에 추가한다(같은 `@SpringBootTest` 인스턴스를 공유하는 구조라면 기존 헬퍼(`post(...)` 등)를 그대로 재사용 — 새 헬퍼가 필요하면 만들고 기존 메서드는 고치지 않는다).
- `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dmd/DmdScreenMessageParityTest.java`(40행, 전문 확인함, F24) — 지금 `MESSAGES` 경로가 `dataItemMng/messages.ts` 하나로 하드코딩돼 있다. **B2 가 이 테스트를 화면 목록 루프(또는 파라미터화 `@ParameterizedTest`)로 고쳐** `{screen, messagesPath, 검사할 상수 목록}` 형태로 `dataItemMng`·`dataEdit` 둘을 커버하게 만든다(기존 `dataItemMng` 케이스의 단정 내용은 바꾸지 않는다 — 루프 구조만 바뀐다). **B3 는 그 루프에 `dataCateEdit` 한 항목만 추가**한다(루프 구조 자체는 다시 고치지 않는다). 각 화면의 `messages.ts` 에 담을 상수는 그 화면이 실제로 접두어/포함 판정하는 서버 문구만(예: dataEdit 는 `ROW_VERSION_CONFLICT` 접두어, dataCateEdit 는 `RESERVED_CATEGORY`·`ROW_VERSION_CONFLICT` 접두어).
- `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` — 새 메서드 `seedMdmDataMngMenus()`(F2 가 예약한 001~003) 를 추가하고 `seedMdmMenus()` 안에서 `seedMdmDataItemMenus();` 호출 **바로 앞**에 `seedMdmDataMngMenus();` 를 추가한다(B1 이 한 번에 담당 — 세 화면 메뉴 3개를 한 메서드에 같이 넣는다, 표 형식은 `seedMdmDataItemMenus()` 그대로 복제):
  ```java
  insertMcmSecObjIfAbsent("dataMng", "마루 데이터", "mdm");
  insertMcmSecObjIfAbsent("dataEdit", "마루 데이터 수정", "mdm");
  insertMcmSecObjIfAbsent("dataCateEdit", "카테고리 편집", "mdm");
  insertMcmSecMenuIfAbsent("dataMng", "001", "5040100", "마루 데이터", "dmd", "dataMng");
  insertMcmSecMenuIfAbsent("dataEdit", "002", "5040200", "마루 데이터 수정", "dmd", "dataEdit");
  insertMcmSecMenuIfAbsent("dataCateEdit", "003", "5040300", "카테고리 편집", "dmd", "dataCateEdit");
  for (String objectId : new String[]{"dataMng", "dataEdit", "dataCateEdit"}) { ... SYSADMIN PERM_ALL ...; seedMdmObjectRbac(objectId, "dmd"); }
  ```
  Build 는 호출 전에 `seedMdmDataItemMenus()`·`seedMdmRuleMenus()` 주변(960행대)을 먼저 읽어 idempotent 삽입 헬퍼·AUDIT 상수 패턴을 그대로 따른다. 메뉴·RBAC 행 수를 세는 테스트가 있으면(§0 미확인) 같이 갱신한다.

---

## 3. 테스트 전략

### 3.1 백엔드 (SQLite, `testAll`)
- `DataCategoryResolverSqliteTest` — 열린 항목만 대상, KEY/LVL1-5/ATTR01-10 각 대상 매칭, 문법 오류 시 예외 대신 `invalid=true`, 닫힌 항목 제외.
- `DataSegmentRowStore` 신설 메서드 2개는 `DataCateEditServiceSqliteTest` 를 통해 간접 검증(별도 단위 테스트를 새로 만들 필요는 없다 — 기존 클래스에 직접 테스트가 없고 항상 서비스 경유로 쓰인다, 04·`DataItemListQuery` 선례와 같음).
- `DataMngServiceSqliteTest` — 등록 성공(TB_MDM_DATA + CATE BASE 두 행, 같은 트랜잭션임을 **의도적 실패 주입**으로 증명: `categorySegmentCore` 를 스파이/래핑해 `registerCate` 가 예외를 던지게 만들고 `MdmData` 행이 롤백됐는지 확인, F6·F7 근거), ID 중복(자기 테이블·`MdmCodeRepository` 교차) 거부, 목록 조회(ID/이름/상태 조건).
- `DataEditServiceSqliteTest` — 헤더 저장, 라벨 저장, `lvl_cnt` 증가(무조건 허용)·축소(뒤 칸 값 있는 열린 행이 있으면 거부/없으면 허용, `latestItemRows` 로 닫힌 행도 스캔), auditVer 충돌, DEPRECATED 상태에서 헤더·라벨·폐기 전부 거부.
- `DataCateEditServiceSqliteTest` — REGEX/TABLE 등록·수정·닫기·다시열기, BASE 편집·닫기 거부(RESERVED_CATEGORY), 닫힌 카테고리의 매칭 건수 0(소속 행은 DB 에 남아 있는 채로 확인, F10), TABLE 일괄 적용 전부-아니면-전무(addMember 중 하나가 실패하도록 의도적으로 유효하지 않은 코드를 섞어 전체 롤백 확인).

### 3.2 프런트 단위 테스트(`pnpm --filter @dk-oasis/m-mdm test`)
각 화면의 순수 로직(예: dataCateEdit 의 TransferList 추가/해제 diff 계산, dataEdit 의 lvl_cnt 축소 클라이언트측 즉시 경고)을 `dataItemMng`/`codeCateEdit` 선례처럼 훅·유틸 단위로 분리해 테스트한다.

### 3.3 화면 스모크 넷(`references/e2e.md` 「스모크 넷」, 화면마다 4개, 총 12개)
1. **메뉴 이동**: `MDM > 마스터데이터 > 마루 데이터`/`마루 데이터 수정`/`카테고리 편집` 클릭 → breadcrumb·URL 확인.
2. **목록/빈 상태**: dataMng 는 결과 그리드(또는 빈 상태 문구), dataEdit 는 마루 데이터 select 로 전환 시 헤더 채워짐, dataCateEdit 는 카테고리 목록(BASE 1건 이상) 또는 빈 상태.
3. **화면 조작 한 번**: dataMng 는 등록 1건(→ dataEdit 로 이동 확인, F19 라우팅), dataEdit 는 헤더 또는 라벨 저장 1건, dataCateEdit 는 REGEX 카테고리 등록 또는 TABLE 소속 적용 1건 → 목록 재조회로 반영 확인.
4. **서버 오류 노출**: dataMng 는 중복 ID 재등록(MDM011 모달, F15 문구), dataEdit 는 잘못된 코드 패턴 문법(또는 DEPRECATED 후 저장) 오류 모달, dataCateEdit 는 잘못된 REGEX 문법 저장 거부 모달(04 `mdm-codeCateEdit.spec.ts` T4 와 동일 패턴).

로그인 계정은 `e2e_mdm_steward`/`admin123`(F3, EDIT 권한). 스크린샷은 `docs/mdm/tasks/TSK-07-02/screens/dmd-{screen}-{step}.png`.

### 3.4 oasis 계약 검사
`check_oasis_contract.py --root .` — 새 BPMN 3개가 선언한 bean(`dataMngService` 등)이 실제 Spring 빈으로 해석되는지 자동 검사(기존 baseline INFO 29 에 새 BPMN·bean 쌍만큼 늘어날 수 있다, ERROR/WARN 0 유지가 게이트).

---

## 4. 수용 기준 매핑

| 수용 기준 | 검증 방법 |
|---|---|
| 마루 코드와 ID 중복 거부 | `DataMngServiceSqliteTest`(F15, `dataRepo.existsById\|\|codeRepo.existsById` → MDM011) + 스모크 넷 4(dataMng) |
| 등록 후 수정 화면으로 이동 | `mdm-dataMng.spec.ts` 스모크 넷 3(등록 뒤 URL/화면이 dataEdit 로 전환되고 방금 등록한 ID 가 로드됨) |
| 포털 메뉴에서 화면이 열리고 e2e `mdm-dataMng.spec.ts` 가 통과한다 | F2 메뉴 시드 + 스모크 넷 1~4 |
| lvl_cnt 축소는 뒤 칸 값이 있는 행이 없을 때만 | `DataEditServiceSqliteTest`(§3.1, `latestItemRows` 스캔 — 닫힌 행 포함) |
| DEPRECATED 후 저장 거부 | `DataEditServiceSqliteTest`(헤더·라벨·lvl_cnt·폐기 자체 전부 `requireActive` 로 거부) + 스모크 넷 4(dataEdit) |
| 포털 메뉴에서 화면이 열리고 e2e `mdm-dataEdit.spec.ts` 가 통과한다 | F2 메뉴 시드 + 스모크 넷 1~4 |
| BASE 편집·닫기 불가 | `DataCateEditServiceSqliteTest`(`RESERVED_CATEGORY`, `DataCategorySegmentCore.requireNotBase` 재사용) + 스모크 넷(BASE 행에 닫기/수정 버튼 자체가 없음을 e2e testid 카운트 0 으로 확인, 04 `mdm-codeCateEdit.spec.ts` T2 패턴) |
| 닫힌 카테고리는 소속 보존·판정 false | `DataCateEditServiceSqliteTest`(닫기 뒤 `TB_MDM_DATA_CATE_ITEM` 행이 그대로 있음을 직접 SELECT 로 확인 + `openMemberCodes`/매칭 건수가 0 을 반환함을 확인, F10) |
| 포털 메뉴에서 화면이 열리고 e2e `mdm-dataCateEdit.spec.ts` 가 통과한다 | F2 메뉴 시드 + 스모크 넷 1~4 |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

| # | 규칙 | 대상 테스트 |
|---|---|---|
| R1 | dataMng 등록은 `TB_MDM_DATA`(INUSE) + `TB_MDM_DATA_CATE`(BASE) 를 **한 트랜잭션**으로 커밋한다(F6·F7·F8) — `DataMngService` 자신의 `TransactionTemplate` 이 감싼다. 테스트는 `DataMngService` 를 **감싸지 않고 그대로**(OASIS 가 부르는 방식과 같게) 호출해야 한다 — 테스트 쪽에서 `TransactionTemplate`/`@Transactional` 로 한 번 더 감싸면 서비스 자신의 트랜잭션이 없어도(버그) 테스트가 통과해 버린다 | `DataMngServiceSqliteTest`(등록 중 `registerCate` 실패를 주입 → `MdmData` 행도 안 남음을 확인. 서비스에서 `TransactionTemplate` 을 빼는 변이를 넣으면 이 테스트가 빨개져야 한다) |
| R1′ | `DataEditService.save`/`delete`(폐기) 도 같은 이유로 **자기 `TransactionTemplate`** 을 쥔다(F7 — OASIS 앰비언트 트랜잭션 없음) | `DataEditServiceSqliteTest`(서비스를 감싸지 않고 그대로 호출, 헤더 저장 중간에 예외를 주입해 롤백 확인) |
| R2 | `TB_MDM_DATA` 를 쓰는 dataMng·dataEdit 의 모든 경로(등록·헤더·라벨·lvl_cnt·폐기)는 값을 읽기 전에 `DataSegmentLock.lock()` 을 **정확히 한 번** 부른다(L1, TSK-07-03 상속). dataCateEdit 는 스스로 잠그지 않는다 — `DataCategorySegmentCore` 의 6개 메서드가 이미 각자 잠그므로(R2′) 서비스가 앞에서 또 잠그면 **이중 잠금**(L1 위반)이 된다 | `DataEditServiceSqliteTest`: `@SpyBean DataSegmentLock` 을 주입해 `save`/`delete` 각 1회 호출 뒤 `verify(lock, times(1)).lock(id)` 로 정확히 1회를 확인(SQLite 로도 "몇 번 불렀나"는 셀 수 있다 — 동시성 자체(S11·L1·L2 의 실제 직렬화 효과)는 SQLite 로 못 잡아 도커 금지로 생략, TSK-07-03 선례와 동일) |
| R2′ | dataCateEdit 의 `reg`/`save`(REGEX)/`delete`/`restore` 는 `DataCategorySegmentCore` 를 그대로 호출한다(잠금·검사 위임, 새로 만들지 않는다) | `DataCateEditServiceSqliteTest`(정상 흐름이 `DataCategorySegmentCore` 의 기존 단위 테스트와 같은 결과를 낸다는 것으로 간접 확인 — 잠금 재구현이 없다는 것 자체가 코드 리뷰 대상) |
| R3 | `MdmTemporalSegmentStore` 구현체를 새로 만들지 않는다 — `common.segment` 의 기존 세 클래스(`DataItemSegmentStore`·`DataCateSegmentStore`·`DataCateItemSegmentStore`)만 구현체다(F5, A3) | `MdmTemporalSegmentStoreNoImplementationTest`(ArchUnit, 기존 그대로 — 이 Task 는 건드리지 않는다) |
| R4 | 카테고리 닫기는 소속(CATE_ITEM) 행에 연쇄하지 않는다(F10) — 05 의 "소속 보존" 은 이 비연쇄에 의존한다 | `DataCateEditServiceSqliteTest`(닫기 뒤 `TB_MDM_DATA_CATE_ITEM` 행 수를 직접 SELECT 로 재서 닫기 전후 불변임을 확인) |
| R5 | 카테고리 매칭 건수·소속 판정은 항상 "카테고리가 지금 열려 있는가"를 먼저 본다 — 닫힌 카테고리는 REGEX/TABLE 무관하게 매칭 0/소속 미판정이다(F10). 매칭 대상은 **열린 항목만**(`latestItemRows` 를 `isOpen()` 으로 거른 결과, 닫힌 항목은 REGEX 미리보기·건수 어디에도 안 들어간다) | `DataCateEditServiceSqliteTest`, `DataEditServiceSqliteTest`(카드4 매칭 건수) — 열린 항목·닫힌 항목·열린 카테고리·닫힌 카테고리 4조합을 각각 확인 |
| R6 | BASE(`CategoryConventions.BASE_CATE_ID`)는 수정·닫기를 거부한다(기존 `DataCategorySegmentCore.requireNotBase`, 고치지 않는다). BASE 는 `defKind=REGEX`·`defExpr=".*"`·`defTarget=CategoryOwner.MASTER_DATA.baseDefTarget()`(= KEY)·이름 `"전체"`(D4) 로 **등록 시점에 정확히 그 값**으로 만들어진다 | `DataMngServiceSqliteTest`(등록 직후 BASE 행의 네 값을 직접 확인), `DataCateEditServiceSqliteTest`(BASE 수정·닫기 시도 → `RESERVED_CATEGORY`) |
| R7 | DEPRECATED 인 마루 데이터는 dataEdit 의 헤더·라벨·lvl_cnt·폐기(재시도)를 전부 거부한다(검사1, `DataItemChecks.requireActive` 재사용). dataCateEdit 의 등록/수정/닫기/다시열기/소속 편집도 결국 거부된다 — 단 이 Task 가 직접 그 검사를 호출하는 게 아니라 `DataCategorySegmentCore` 내부의 `requireActive` 가 이미 그렇게 한다(R2′와 같은 이유로 이 Task 는 재검사를 추가하지 않는다) | `DataEditServiceSqliteTest`(직접 호출), `DataCateEditServiceSqliteTest`(DEPRECATED 마루 데이터에 카테고리 등록 시도 → 거부되는 것을 서비스 경유로 확인 — 검사 로직 자체는 재테스트하지 않는다, 이미 TSK-07-03 소유) |
| R8 | `DataItemChecks.cateDefIssues` 등 TSK-07-03 소유 공용 코어 파일은 시그니처·검사 내용을 바꾸지 않는다(F11) — LVLn/ATTRn 라벨 정합은 FE 제한으로만 막는다(D5) | 없음(정적 — 코드 리뷰로만. TSK-07-03 의 `DataItemChecksTest` 가 그대로 통과하면 이 규칙이 지켜진 것이다) |
| R9 | 배포 순번(`chg_seq`/`last_chg_seq`)을 발급하지 않는다(F14, TSK-07-04 몫) — 등록 직후 `TB_MDM_DATA.last_chg_seq`·`chg_seq`·`TB_MDM_DATA_CATE.chg_seq` 는 여전히 0 이다 | `DataMngServiceSqliteTest`(등록 뒤 두 칸 모두 0 인지 직접 SELECT 로 확인) |
| R10 | 등록은 MDM 원천만 받는다(spec 문언) — `SOURCE_KIND='MDM'` 고정, `SOURCE_SYSTEM` 은 항상 NULL, EXTERNAL 마루 데이터 생성 UI 를 만들지 않는다 | `DataMngServiceSqliteTest`(등록 뒤 두 칼럼 값 확인), `mdm-dataMng.spec.ts`(등록 폼에 원천 선택 UI 자체가 없음) |
| R11 | `lvl_cnt` 축소는 **`latestItemRows(maruDataId)`(키별 마지막 행, 닫힌 키 포함)** 를 스캔해 줄일 칸(`newLvlCnt+1..5`) 가운데 값이 있는 행이 하나도 없을 때만 허용한다. 늘리기는 항상 허용(F11 각주 대상 아님, 05 문서 원문) | `DataEditServiceSqliteTest`(열린 행에 값 있음 → 거부, 닫힌 행에만 값 있음 → 거부(닫힌 행도 스캔 대상), 아무 행에도 값 없음 → 허용, 늘리기는 항상 허용) — 스캔 범위는 D6 참고 |
| R12 | TABLE 소속 일괄 적용은 전부-아니면-전무다(추가·해제 목록 중 하나라도 실패하면 전체 롤백) | `DataCateEditServiceSqliteTest`(정상 코드와 존재하지 않는 코드를 섞어 보내 전체가 롤백됨을 확인 — 성공한 것처럼 보이는 부분 반영이 없어야 한다) |

---

## 구현 단위

| 단위 | 범위(파일·기능) | 새 테스트 | 담당 불변 규칙 |
|---|---|---|---|
| B1 | 공용(`DataCategoryResolver` 신설 + `DataItemListQuery.targetValue`/`matches` 추출, `DataSegmentRowStore` 메서드 2개 추가) + dataMng 백엔드/프런트/BPMN/e2e + 메뉴 시드 3개(`seedMdmDataMngMenus`) + `e2e/fixtures/mdm-dataMng.sql` 신설 | `DataCategoryResolverSqliteTest`, `DataMngServiceSqliteTest`, `mdm-dataMng.spec.ts` | R1, R3(공용 파일을 건드리지 않았음을 스스로 확인), R6(BASE 값), R9, R10 |
| B2 | dataEdit 백엔드/프런트/BPMN/e2e(공용 파일·픽스처는 B1 산출물을 **읽기만** 한다) + `DmdScreenMessageParityTest` 를 루프 구조로 리팩터(F24) | `DataEditServiceSqliteTest`, `mdm-dataEdit.spec.ts` | R1′, R2, R7(헤더/라벨/lvl_cnt/폐기), R11(lvl_cnt 축소) |
| B3 | dataCateEdit 백엔드/프런트/BPMN/e2e + `DmdScreenMessageParityTest` 루프에 항목 추가 + 세 화면 통합 게이트 스윕(마지막 단위) | `DataCateEditServiceSqliteTest`, `mdm-dataCateEdit.spec.ts` | R2′, R4, R5, R6(BASE 편집·닫기 거부), R7(카테고리), R12 |

B1→B2→B3 순서로 돈다(B2·B3 는 B1 이 만든 `DataCategoryResolver`/`DataSegmentRowStore` 신규 메서드를 호출만 하고 고치지 않는다).
공유 테스트 파일(`DmdBpmnActionTest` 등)은 각 유닛이 **자기 화면 메서드만 추가**한다(§2 「수정 — 공유 파일」). B3 가 끝나면
전체 게이트(`testAll`·`pnpm --filter @dk-oasis/m-mdm test`·`pnpm test:unit:shared`·lint·oasis 계약 검사)를 한 번 더 돌려
세 화면이 서로 깨지지 않았는지 확인한다.

---

## 담당자 확인 필요 결정

### D1 — 배포 대상 시스템 카드를 만들지 않는다
- 질문: 05 문서·HTML 시안은 등록·수정 화면에 "배포 대상 시스템" 필드/카드를 둔다. 수용 기준에는 이 항목이 없다.
- 택한 것: 만들지 않는다.
- 근거: `TB_MDM_DATA_SYSTEM` 은 TSK-07-01 이 "서비스·화면·리포지토리 없음"으로 명시적으로 보류했고(D-019), 실제로
  리포지토리가 없다(F13). TSK-07-04(배포, phase=ready)가 이미 다음 순서로 예약돼 있어 그 Task 가 리포지토리부터 만드는
  것이 자연스럽다. 수용 기준에 없는 기능을 선반영하면 TSK-07-04 와 중복 설계할 위험이 있다.
- 반려 시 재작업: `MdmDataSystemRepository` 신설(B1 범위 밖 새 파일) + dataMng 등록·dataEdit 헤더 카드에 배포 대상
  추가/제거 UI·액션을 더한다. e2e 스모크 넷에도 케이스가 늘어난다.

### D2 — dataMng 목록 열에서 "항목 수·카테고리 수·배포 대상 수·마지막 배포 순번"을 뺀다
- 질문: 05 화면 절은 이 네 열을 포함한다. 수용 기준은 "ID·이름·상태" 조회만 요구한다.
- 택한 것: ID·이름·원천·상태 네 열만 만든다.
- 근거: 배포 대상 수·마지막 배포 순번은 D1·R9(배포 미보류)와 직접 얽힌다. 항목 수·카테고리 수는 배포와 무관하지만
  행마다 집계 질의가 필요해 목록 조회 비용이 늘고, 수용 기준에 없다. 최소 범위로 간다.
- 반려 시 재작업: `DataMngService.search()` 에 `TB_MDM_DATA_ITEM`/`TB_MDM_DATA_CATE` 카운트 서브쿼리(또는 별도 집계
  질의)를 추가하고 `DataMngRow`에 필드 4개를 더한다.

### D3 — dataEdit 저장은 헤더+키 패턴+라벨+lvl_cnt 를 한 액션(`save`)으로 묶는다
- 질문: HTML 시안은 "헤더 저장"과 "라벨 저장" 버튼을 따로 둔다.
- 택한 것: 버튼은 둘(또는 그 이상)이어도 되지만 서버 액션은 하나(`save`)로 묶는다.
- 근거: 04 `CodeEditService.saveHeader()` 가 이름·설명·lvlCnt·attr 라벨을 이미 한 메서드로 묶는 선례다(F9 인용).
  액션을 쪼개면 `auditVer` 낙관적 잠금·`DataSegmentLock` 호출이 두 번 필요해지고, 한쪽만 저장된 반쪽 상태가 생길 수
  있다.
- 반려 시 재작업: `save`(헤더+키패턴+lvl_cnt)와 `save2`(라벨) 같은 액션을 분리하고(13종 액션 안에서 이름을 새로 골라야
  한다 — 여유가 없다), BPMN 분기·`DmdBpmnActionTest` 케이스도 나뉜다.

### D4 — BASE 카테고리 표시 이름은 `"전체"`
- 질문: 05 문서가 표시 이름을 정하지 않는다.
- 택한 것: 04 관례 `"전체"` 를 그대로 쓴다(F16).
- 근거 강도: 낮음 — 05 고유 표기가 필요하면 이 결정만 뒤집으면 된다(다른 결정에 영향 없음).
- 반려 시 재작업: `DataMngService.register()` 의 `DataCateValue.cateName` 리터럴 한 줄만 바꾼다.

### D5 — `cateDefIssues` 가 놓치는 LVLn/ATTRn 정합은 화면 제한으로만 막는다(서버 미검사)
- 질문: `defTarget=LVL3` 인데 `lvl_cnt=2` 이거나, `defTarget=ATTR05` 인데 라벨이 없어도 `cateDefIssues` 는 통과시킨다
  (F11). 서버에 추가 검사를 넣을지, 화면에서만 막을지.
- 택한 것: 화면(dataCateEdit 의 `defTarget` 드롭다운을 그 마루 데이터의 `lvl_cnt`·라벨 있는 attr 로만 채운다)에서만
  막고 서버는 고치지 않는다.
- 근거: `cateDefIssues` 는 TSK-07-03 소유 공용 코어이고 L1/A3 불변 규칙 보호 대상이다(R8). 고치면 그 Task 의 변이
  검증 기록과 어긋날 위험이 있다. 범위를 넘는 `defTarget` 을 골라도 "그 칸에 항상 값이 없는 필드"를 대조할 뿐이라
  실질 피해가 없다(매칭 0건이 나올 뿐 데이터 훼손은 없다).
- 반려 시 재작업: 새 검사 메서드(`cateDefIssues` 를 고치지 않고 `DataCateEditService` 자체에 사전 검사를 추가하는
  방향이 더 안전하다 — `cateDefIssues` 호출 전에 `lockedData.lvlCnt()`/`attrName()` 대조 후 issue 를 직접 만들어
  붙인다)를 더한다.

### D6 — `lvl_cnt` 축소 검사의 스캔 범위: 키별 "마지막 행"만 보는가, 그 키의 **모든** 선분 행을 보는가
- 질문: R11 은 `latestItemRows`(키별 마지막 행 하나, 닫힌 키 포함)만 스캔한다. 그런데 한 코드가 과거에 lvl3 값을 가진
  적이 있다가(선분 행 A) 나중에 lvl3 를 비운 채로 수정됐다면(선분 행 B, 지금 마지막 행) `latestItemRows` 는 B 만 보고
  A 는 안 본다. 05 문서 원문("닫힌 행을 포함해 줄일 칸 뒤에 값이 있는 행이 없을 때만")이 "행"을 **키 단위 마지막 행**으로
  읽을지 **모든 선분 행**(과거분 포함)으로 읽을지 문면만으로는 확정할 수 없다.
- 선택지: (1) `latestItemRows`(키별 마지막 행만, TSK-07-03 이 검사 5-1 에 쓰는 것과 같은 스캔) (2) 그 마루 데이터의
  모든 코드의 **모든** 선분 행(과거분 포함, 새 쿼리 필요).
- 택한 것: (1).
- 근거: 05 「선분과 닫기」 절이 "다시 열기는 **마지막 행의 값을 복사**한다"고 명시한다 — 즉 과거(닫힌) 선분 구간은
  "재현 가능한 기록"일 뿐 "지금 유효한 값"이 아니다. `lvl_cnt` 축소는 "그 칸을 지금부터 못 쓰게 한다"는 미래 지향 규칙
  이므로, 이미 닫혀서 다시 열지 않는 한 되살아나지 않는 과거 선분 행의 값까지 막을 이유가 약하다. TSK-07-03 이 검사
  5-1(계층 일관성)에 이미 `latestItemRows` 를 쓴 선례(F12·TSK-07-03 §5 C)와도 일관된다. **근거 강도: 중** — 05 문서가
  "행"의 범위를 명시적으로 확정하지 않았으므로 담당자 확인이 필요하다.
- 반려 시 재작업: `DataSegmentRowStore` 에 "그 마루 데이터의 모든 선분 행(선택한 lvl 칸만)"을 돌려주는 새 쿼리를 추가하고
  (`latestItemRows` 는 그대로 두고 별도 메서드로 추가), `DataEditServiceSqliteTest` 의 "닫힌 행에만 값 있음" 케이스를
  "과거 선분(지금은 다른 값으로 마지막 행이 갱신됨)에만 값 있음" 케이스로 바꿔 재검증한다.

---

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 도커 금지로 생략: cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain
- 도커 금지로 생략: cd src/backend/mdm && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:compileMssqlTestJava --no-daemon --console=plain

설명:
- 이 Task 는 새 mssqlTest 파일을 추가하지 않지만, 위 두 태스크는 TSK-07-01 이 만든 `MdmMasterDataMssqlMigrationTest`
  등 기존 mssqlTest 소스 전체를 컴파일·실행 대상으로 삼는 태스크라 이 Task 의 변경(엔티티·리포지토리는 그대로, `common.segment`
  에 네이티브 SQL 메서드 2개 추가)도 머지 뒤 팀장 방언 검증(`dialect_check`)에서 처음 컴파일·실행된다. Build 는 새로
  추가하는 `latestCateRows`/`openMemberCodes` 가 기존 `DataSegmentRowStore.query()`/`bindString()`/`MdmTemporalBinder`
  헬퍼만 재사용해 방언 분기를 새로 만들지 않았음을 코드 리뷰로 남긴다(TSK-07-03 이 같은 이유로 개별 신규 메서드마다
  전용 MSSQL 테스트를 따로 만들지 않은 선례, F12).
- 이 Task 는 마이그레이션을 추가하지 않으므로 기존 mssqlTest 의 버전 집합 단언은 고치지 않는다.
- 이 Task 의 수용 기준 9개는 모두 SQLite 로 검증 가능하다 — MSSQL 고유 동시성 경로(행 잠금의 실제 X-lock 효과)는
  TSK-07-03 의 `DataSegmentConcurrencyMssqlTest`(작성만, 미실행)가 이미 다루는 대상이고 이 Task 가 새 동시성 메커니즘을
  추가하지 않는다. 그래서 위 두 생략 줄이 가리는 수용 기준은 없다(해당 줄을 이 절에 별도로 더하지 않는다).
