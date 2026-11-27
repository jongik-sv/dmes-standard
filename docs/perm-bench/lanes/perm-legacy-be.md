# perm-legacy-be 레인 정본 메모

- 레인 = perm-legacy-be · 브랜치 `perm/perm-legacy-be` · 워크트리 `/Users/jji/project/dmes-perm-legacy` · Mac 조정 `dmes-standard-9a`
- 착수 지시 = `/Users/jji/.coord/perm-bench-mac/lanes/perm-legacy-be/brief.md`(지시 perm-legacy-be-1)
- 갱신: 2026-11-27 lb-merge 끝(91535e95b), l6·l8 끝. 통합 aec22600c 합침. 다음 = lf-merge 머지 요청

## 진행

| id | 상태 | 커밋 | 메모 |
|---|---|---|---|
| l0 | 끝 | 297eb967f | 서비스 4종 읽음, 시험 뼈대 `BT/csa/commObjMng/support/**` + `CommObjMngServiceTest`(clone 1/1 통과), 이 메모 |
| l4 | 끝 | 0bf34f72b·135057889 | roleGroupMenu → ROLE_PERM, SYSADMIN 전부, 옛 빈 트리 결함 고침. 시험 3/3 |
| l3 | 끝 | 030d656b2·3099ef160 | 시험 13/13. 7인자 생성자, MenuChangedEventPublishTest 최소 수정(승인) |
| l1 | 끝 | 59d06cda3·3099ef160 | 시험 11/11 |
| l2 | 끝 | 127920264·3099ef160 | 시험 14/14 |
| l5 | 끝 | 위 커밋 | 리뷰 수정 뒤 4종 + MenuChangedEventPublishTest = 58 통과, mcm/api MenuCatalogOasisSaveIntegrationTest 3 통과(clone) |
| l7 | 끝 | bd1e46eb7 | 8개 설계서에 퍼미션 절 덧붙임 |
| lb-merge | 끝 | 91535e95b | 통합 머지 완료(ff) |
| l6 | 끝 | 5db38bfe4·위 fix | 리뷰(opus/high) MED 2·LOW 10 고침(Excel 숨은 칸 내보내기·aria-describedby 2건 남김). useOpenWith 받는 쪽·openBench 보내는 쪽 |
| l8 | 끝 | | 규칙 점검·audit 의심 0·screens.mjs 등록 정보 조정에 보냄. 프로파일링 = 회차 마감 |
| lf-merge | | | |

## 1. 받은 결정(조정)

- Q1 = (b): c5 소유 `Sec*Repository`(SecRoleGroupMappingNativeRepository:179·SecRoleRepository.countRoleMappingByRoleId·SecObjRepository.countRoleMappingByObjectId) 는 건드리지 않는다. 대체 쿼리 = 전부 `BE/repository/CommPermQueryRepository.java`(새, 내 소유). 서비스가 그것을 부른다.
- Q2 = (a), win30 결정 7: 새 action(= BPMN sequenceFlow name = 게이트 토큰) 이름 확정
  - commObjMng: `searchObjPerm`·`searchObjMenu`
  - commRoleMng: `searchFolderObj`·`searchRoleGroups`
  - commPermMng: `lov`·`searchPermOne`(perm-fe-b 계약, Mac 조정이 perm-core 반영 요청)
  - 이름을 바꾸거나 새 action 이 생기면 Mac 조정에 바로 보고한다.
- D36: 목록 입력 = grids. 기존 저장 4종 = `grids.master.rows`. 새 퍼미션 저장 = `grids.perms.rows`(FE 계약).
- 삭제 검사 = 옛 검사 유지 + 새 테이블 검사 덧붙임(브리프 그대로). 옛 `TB_MCM_SEC_ROLE_MAPPING` 에 FK 없음(V1 PK 만) → 옛 줄 남아도 ORA-02292 없음.

## 2. 현재 코드(l0 조사)

- 게이트 토큰 = sequenceFlow `name`. 예: commObjMng `searchCmObj` 의 URL action = `search`, 저장 = `save`(FE `api.ts`).
- commPermMng: search·save. `SecPermRepository` 옛 PERMISSION_ID 묶음. ROLE_ID scalar = 옛 매핑.
- commRoleMng: search·save·searchCmRoleMap·saveCmRoleMap·searchCmPerm·lov·searchObjectLov. 옛 3-table JOIN(`SecRoleMappingNativeRepository`). saveCmRoleMap 만 RoleChangedEvent. saveCmRole(USE_TP) 는 이벤트 없음 → D30 로 더한다.
- commObjMng: search·save·lov·searchSystemLov. save 가 SYSADMIN·PERM_ALL 자동 매핑(D13 로 삭제). 삭제 검사 = 메뉴 수 + 비-SYSADMIN 옛 매핑 수. USE_TP 변경은 MenuChangedEvent 만.
- commRoleGrpMng: searchCmRoleGrpMenu 가 옛 매핑 JOIN(c5 파일 :179). saveCmRoleGrpMap 은 RoleChangedEvent 발행.
- 시험: 4종 서비스 시험 없음. Oracle 시험 기반 `McmCoreOraTestDb` = JVM 당 Flyway clean+migrate → V20 표도 생긴다.

## 3. API 설계(l1~l4)

공통: 토큰 정규화 = `PermTokens.parse`·`join`. 1000자 초과 = 거절. ⊆ 검사 = `PermTokens.notIn(values, obj.BTN ∪ obj.POPUP 각각)`. 저장 뒤 `RoleChangedEvent`(D30). 「조회만」 = `PermTokens.readPreset(obj.BTN)` → `OBJ_READ_PERM`.

### commPermMng (l1, FE 계약 perm-fe-b)
- `lov` → grids `roles`(ROLE_ID·ROLE_NM·USE_TP, SYSADMIN 제외) · `menus`(MENU_ID·MENU_NM·PARENT_MENU_ID·MENU_LV·MENU_PATH, 모듈·폴더만)
- `search` params roleId·menuId·objectQ·codeQ·showEmpty·pageNo·pageSize → grids `perms`(ROLE_ID·ROLE_NM·OBJECT_ID·OBJECT_NM·MENU_PATH·MENU_NM·OBJ_BTN_PERM·OBJ_POPUP_PERM·OBJ_READ_PERM·BTN_PERM·POPUP_PERM·DATA_PERM·HAS_PERM) + data `TOTAL_CNT`. 정렬 = 역할 → 메뉴 순서
- `searchPermOne` params roleId·objectId → grids `others`(ROLE_ID·ROLE_NM·BTN_PERM·POPUP_PERM) · `groups`(ROLE_GROUP_ID·ROLE_GROUP_NM·USER_CNT) + data `USER_CNT`
- `save` grids `perms.rows`(ROLE_ID·OBJECT_ID·BTN_PERM·POPUP_PERM·DATA_PERM·OP_TP MERGE|DEL) → data `cnt_merge`·`cnt_delete`. 거절 UserException `PERM_NOT_IN_OBJ`·`PERM_EMPTY_BTN`. SYSADMIN 행 = 거절(퍼미션 행 없이 계산, D13)

### commRoleMng (l2, FE 계약 perm-fe-b)
- `search` = 옛 ds_main + GROUP_CNT·USER_CNT·PERM_CNT(SYSADMIN = -1)
- `save` = 옛 grids `master`. USE_TP 바뀌면 RoleChangedEvent
- `searchRoleGroups` params roleId → grids `groups`(ROLE_GROUP_ID·ROLE_GROUP_NM·USE_TP·USER_CNT) + data `USER_CNT`(그룹 겹침 뺀 사람 수)
- `searchCmRoleMap` params roleId → grids `perms`(ROLE_ID·OBJECT_ID·OBJECT_NM·MENU_FOLDER_ID·MENU_PATH·MENU_NM·OBJ_BTN_PERM·OBJ_POPUP_PERM·OBJ_READ_PERM·BTN_PERM·POPUP_PERM·DATA_PERM)
- `saveCmRoleMap` params roleId + grids `perms.rows`(commPermMng save 줄과 같음) → data `cnt_merge`·`cnt_delete`
- `searchFolderObj` params roleId·menuFolderId → grids `objs`(OBJECT_ID·OBJECT_NM·MENU_NM·MENU_PATH·OBJ_BTN_PERM·OBJ_POPUP_PERM·OBJ_READ_PERM·USE_TP·HAS_PERM)
- `lov` = 옛 `ds_lovMenuId` + grids `menus`(commPermMng lov menus 와 같음)
- 옛 `searchCmPerm`·`searchObjectLov` = f6 이 안 쓰면 다음 회차에 뺀다(이번 회차는 남김)

### commObjMng (l3, 이 레인이 정함 → l6 이 씀)
- `search` params edtOBJECTID·cboUSETP·menuFolderId(새, 빈 값 = 전체) → grids `ds_main`(옛 칸 + BTN_PERM·POPUP_PERM·DATA_PERM·MENU_CNT·PERM_CNT)
- `save` grids `master.rows`(옛 칸 + BTN_PERM·POPUP_PERM·DATA_PERM) → data `cnt_merge` + grids `ds_main`(재조회) · `impacts`(OBJECT_ID·KIND BTN|POPUP|USE_TP·CODE·PERM_CNT·USER_CNT — 뺀 값·사용 안 함 영향). SYSADMIN 자동 매핑 삭제. 값·USE_TP 가 바뀌면 RoleChangedEvent
- 삭제 검사 = 메뉴 수 + 옛 비-SYSADMIN 매핑 수(그대로) + 새 퍼미션 수(덧붙임)
- `searchObjPerm` params objectId → grids `perms`(ROLE_ID·ROLE_NM·ROLE_USE_TP·BTN_PERM·POPUP_PERM·DATA_PERM·EFF_BTN_PERM·EFF_POPUP_PERM·USER_CNT) + data `USER_CNT`(겹침 뺀 사람 수 — 사용 안 함 확인용)
- `searchObjMenu` params objectId → grids `menus`(MENU_ID·MENU_NM·PARENT_MENU_ID·MENU_PATH·MENU_TP·MENU_VIEW_YN·USE_TP)

### commRoleGrpMng (l4)
- `searchCmRoleGrpMenu` → CommPermQueryRepository 의 새 쿼리(ROLE_PERM 기준, 칸 8개 그대로). 옛 Native 저장소 메서드는 부르지 않는다
- 그 밖 = 옛 매핑 참조 없음(saveCmRoleGrpMap 이벤트 이미 있음)

### CommPermQueryRepository
- `@Repository` 클래스 + `EntityManager` 네이티브 SQL(SecRoleMappingNativeRepository 모양). 구역을 화면별로 나눠 l1·l2 병렬 agent 가 서로 다른 구역에만 메서드를 더한다.

## 4. l7 설계 문서 초안(각 화면 기능설계서·BPMN설계서에 더할 「퍼미션」 절)

- commPermMng 기능설계서: 화면 뜻 변경(PERMISSION_ID 묶음 → 역할×오브젝트 한 건), 조회 조건 4개 + showEmpty, 페이지, 저장 MERGE·DEL, ⊆·빈 BTN 거절, SYSADMIN 제외. BPMN설계서: action 4개(lov·search·searchPermOne·save) 표 + grids 이름·칸 + 오류 코드
- commRoleMng 기능설계서: 집계 칸 3개, 들어 있는 그룹, 「이 역할의 퍼미션」 한 칸(옛 세 칸 대체), 메뉴 폴더에서 오브젝트 추가, USE_TP N 영향. BPMN설계서: action 표(새 2개·바뀐 3개)
- commObjMng 기능설계서: 새 칼럼 3개(허용 값), 값 빼기 영향, 이 오브젝트의 퍼미션·가리키는 메뉴, SYSADMIN 자동 매핑 삭제(D13), 삭제 검사. BPMN설계서: action 표(새 2개·바뀐 2개)
- commRoleGrpMng BPMN설계서: searchCmRoleGrpMenu 의 원천 표 변경(옛 매핑 → TB_MCM_SEC_ROLE_PERM)
- 공통 근거: decompose.md D7·D8·D13·D14·D15·D18·D30, §0.4

## 4.1 l1~l3 구현 결과(agent 보고 요약)

- 오류 형식(win30 확정) = `BusinessException(ErrorCode.BUSINESS_ERROR, "CODE: 상세")`. 코드: 계약 PERM_NOT_IN_OBJ·PERM_EMPTY_BTN·PERM_SYSADMIN + 레인이 정한 PERM_NO_ROLE·PERM_NO_OBJ·PERM_TOO_LONG·PERM_BAD_ROW·PERM_ROLE_MISMATCH(FE 는 메시지 그대로 보여 줌). ⊆ = 엄격(밖 값 있으면 거절, 조정 지시).
- 저장(l1 save·l2 saveCmRoleMap) = 모든 줄 먼저 검사 → 하나라도 틀리면 쓰지 않음. 쓴 역할만 RoleChangedEvent.
- l1: search 의 필터·정렬·페이지 = 메모리(이유 javadoc). SecPermRepository 안 씀. 화면 SQL = `csa/commPermMng/query/CommPermMngQuery`.
- l2: params+grid = BPMN `dto` 속성 + `saveCmRoleMap(CommRoleMngRoleRequest request, List perms)`(commUserMng pwdinit 패턴). 생성자에서 SecRoleMappingRepository 뺌(옛 표 쓰기 없음). searchCmRoleMap 요청 키 roleId 우선, 비면 ROLE_ID. 계약과 다른 점 2: searchFolderObj 의 MENU_NM·MENU_PATH = 고른 폴더 안 대표 메뉴 · save 응답 ds_main 에도 집계 3칸.
- l3: CommObjMngService 생성자 7인자(+SecRolePermRepository·CommPermQueryRepository·CommObjMngQuery). 소유 밖 `BT/csa/MenuChangedEventPublishTest.java` 최소 수정(생성자 mock, SYSADMIN 자동 매핑 기대 2건 제거) — 조정·win30 승인, 머지 요청 「겹칠 수 있는 파일」 에 적는다.
- BPMN: bpmn-tool 이 XML 주석을 지워 agent 가 손으로 다시 넣음. validate 유효, oasis-contract-check ERROR 0(agent 실행).
- 고친 결함: 네이티브 쿼리의 varchar2(1) 칸(USE_TP·MENU_VIEW_YN)이 Character 로 옴 → `CAST(... AS VARCHAR2(10))`.
- 시드: 새 action 6개(searchObjPerm·searchObjMenu·searchFolderObj·searchRoleGroups·lov·searchPermOne)는 perm-core c2·c4 가 오브젝트 BTN_PERM·allActions 에 넣기로 함(win30 결정 8). 머지 전 들어갔는지 확인.

## 5. 다음 순서(재개용)

1. 리뷰 1회: l1·l2·l3·l4 diff = `git diff 3e5c01fcd..127920264 -- src/backend`(l4 0bf34f72b 포함). 리뷰 M/L = opus/high agent 1개. 지적 수정 → 수정분 시험만.
2. l7 설계 문서 갱신(§4 초안 + §4.1 결과) — sonnet/medium agent, 대상 `docs/mcm/design/comm{Perm,Role,Obj,RoleGrp}Mng/**` 기능설계서·BPMN설계서.
3. lb-merge: `git fetch origin` → `origin/claude/perm-bench`(12cd7bd23 이상) 합치기 → mcm-core 모듈 시험(heavy 경유, `-Pdmes.ora.test=clone`) + oasis-contract-check → `node .claude/skills/_shared/node/squash-branch.mjs --onto origin/claude/perm-bench --subject "feat(mcm-csa): 권한 관리 옛 화면 4종 BE 를 퍼미션 모델 v2 로 옮긴다" --rebase` → 머지 요청(겹칠 수 있는 파일 = CommObjMngService·MenuChangedEventPublishTest).
4. l6 commObjMng FE(lgObjNext, f1 토큰 칩 편집기 import, l3 계약 §3) → l8 렌더 점검(screens.mjs 등록 정보는 조정에) → lf-merge. 받는 쪽 이동 훅은 nav.ts 머지 뒤.

## 6. 남은 일 메모

- 조정 알림(l6): 통합 tip 12cd7bd23 에 f1(shared token-chip-input 등) 들어감 → l6 선행 풀림. l6 착수 전 `git fetch origin` + `origin/claude/perm-bench` 합치기. commObjMng 받는 쪽 이동 계약 = `/Users/jji/.coord/perm-bench-mac/contracts/open-with.md`(l6 = 이 레인, win30 결정 15). nav.ts 는 작업대 머지 뒤에 들어오므로 받는 쪽 훅은 그 뒤에 한다.

- c0+c1 머지 통지 → `git fetch origin` → `origin/claude/perm-bench` 합치기 → l4·l3 착수
- c0 뒤 시험 구성에 `SecRolePermRepository`·`CommPermQueryRepository` 더하기
- f1 커밋 통지 → l6

## 7. 리뷰 1회 결과(2026-11-27, opus/high, HIGH 2·MED 5·LOW 12)

- 고침(3099ef160): commObjMng 저장 = 추가·삭제·BTN/POPUP/USE_TP/SYSTEM_CODE/날짜 변경 때 SYSADMIN 포함 RoleChangedEvent(D30, 조정·win30 승인). 퍼미션 저장 2종 = 같은 키 두 줄 PERM_BAD_ROW·역할 존재 PERM_NO_ROLE·오류 코드 통일(commRoleMng 도 PERM_BAD_ROW·PERM_NO_OBJ)·모든 줄 검사 뒤 쓰기(시험도 롤백 없이 확인). 사람 수 = 사용 역할만. 미리보기 = 사용 오브젝트만·LEV 뿌리 0. IN 목록 → 재귀 SQL. LPAD 30. SYSADMIN 판정 = `CommPermQueryRepository.isSysadmin`(별칭 ROLE_SYSADMIN). searchFolderObj + MENU_FOLDER_ID(perm-fe-b 요청).
- 소유 밖 수정(승인): `mcm/api/.../menu/MenuCatalogOasisSaveIntegrationTest.java`(7인자 생성자·bean·SecRolePerm 엔티티 등록·:191 D30 단언), `BT/csa/MenuChangedEventPublishTest.java`.
- 남김: 엄격 ⊆ + D15 → FE 가 저장 전 OBJ 밖 값을 빼야 함(조정에 알림). 런타임 UserPermCache 는 r3 전까지 옛 표 → 실제 반영은 r3 뒤(win30: BE 머지는 r3 안 기다림).
- 시드: 새 action 6개 시드가 통합 d06ddda7c 에 아직 없음(c2·c4 몫).
