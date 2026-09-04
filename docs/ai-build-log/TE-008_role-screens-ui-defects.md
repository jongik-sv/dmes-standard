# TE-008 — 권한 4화면의 UI·저장 결함 묶음 (상세 잘림 / 행추가 기본값 소실 / 무음 실패 / 셔틀 방향)

- 일자: 2026-09-04
- 대상: `commRoleMng` / `commRoleGrpMng` / `commUserMng` / `commUserRoleCopy`
- 상태: 해결
- 관련: [TE-007](./TE-007_rbac-cache-never-invalidated.md) (같은 점검에서 나온 최우선 결함)

사용자 지적("상세정보가 짤려있다 / 메뉴ID 선택하면 어떻게 되나 / 화살표 방향이 이상하다")에서 출발해
권한 체인 4화면을 전수 점검한 결과다. 결함별로 증상 → 원인(파일:줄) → 조치 순으로 남긴다.

---

## ① 상세정보 하단 필드가 잘려 입력 자체가 불가 — `commRoleMng`

상세 wrapper 에 높이 제한도 스크롤도 없어 필드 수가 row 높이를 넘으면 그대로 잘렸다.
`유효 기한일` 이 화면 밖으로 나가 클릭조차 못 하는 상태.

조치: wrapper 를 `height: calc(100% - 32px)` + `minHeight: 0` 으로 패널 높이에 고정하고,
본문 div 만 `flex: 1 1 0 / overflowY: auto` 로 스크롤시킨다.

> 같은 `marginTop:32 + 높이 무제한` 패턴이 csa 전 화면에 복제돼 있다. 필드가 늘어나면 동일 증상이
> 재발하므로, 상세 패널을 쓰는 화면은 이 스크롤 가드를 함께 넣는 것이 안전하다.

## ② 행추가 시 기본값이 전부 사라짐 — `commRoleMng`, `commRoleGrpMng`

`GridPanel.createEmptyRow` (`GridPanel.tsx:89-97`) 는 `columns` 전 컬럼을 `""` 로 채워 넘긴다.
화면이 `{...emptyRow(), ...base}` 순서로 spread 하고 있어서 `base` 의 빈 문자열이
`emptyRow()` 의 기본값(`USE_TP='Y'` / 유효개시일=오늘 / 유효기한일=9999-12-31)을 전부 덮었다.

- 사용여부 라디오가 아무것도 선택 안 된 상태로 보인다 (`String(x.USE_TP ?? "Y")` 는 `""` 를 못 걸러낸다)
- 그대로 저장하면 `USE_TP=''` 가 길이 1 컬럼에 들어간다

조치: 빈 값만 기본값으로 되메우는 병합으로 교체. 행복사(원본 값 보유)는 그대로 보존된다.

```ts
const merged = { ...emptyRow() };
for (const [k, v] of Object.entries(base)) {
  if (v !== "" && v !== null && v !== undefined) merged[k] = v;
}
```

부수: 신규 행에 `__rowId` 가 안 붙어 AgDataGrid `getRowId` (`AgDataGrid.tsx:560-566`) 가
`""` → `"0"` 으로 떨어졌다. 2행 이상 추가 시 rowId 가 중복된다. `__rowId = tempId` 로 채웠다.

## ③ 서버가 조용히 건너뛰는데 화면엔 "0건 저장되었습니다" — `commRoleMng`, `commRoleGrpMng`

매핑 저장 Service 는 중복 PK / PK 누락 / 미지원 status 를 `log.warn` 후 `continue` 하고
`meta.success=true` 로 응답한다. 버튼을 눌러도 아무 일이 없는데 화면에는 성공 메시지만 뜬다.
(저장소에 이미 기록된 `commMenuMng` 무음 실패와 같은 계열)

조치: 응답에 `cnt_skip` 을 추가하고, FE 가
`"N건 저장되었습니다. (M건은 이미 부여됐거나 대상이 없어 처리되지 않았습니다)"` 로 표시한다.

## ④ 셔틀 화살표 방향이 레이아웃과 반대 — `commRoleGrpMng`, `commRoleMng`

두 그리드가 **좌(현재) ↔ 우(후보)** 로 나란히 놓였는데 버튼은 `▲` / `▼` 였다.
AsIs 컨트롤 이름은 `btn_left` / `btn_right` 로 애초에 좌우 의미다.

조치: `◀` (우→좌, 추가) / `▶` (좌→우, 제외) 로 정정. `commRoleMng` 의 `"▼ 권한 삭제"` 도
`"권한 삭제 ▶"` 로 바꿨다.

## ⑤ OBJECT 후보에서 이미 부여된 것을 권한 무관 제외 — `commRoleMng`

권한 매핑의 PK 는 `(ROLE_ID, OBJECT_ID, PERMISSION_ID)` 인데, FE 는 "sub1 에 한 번이라도 등장한
OBJECT" 를 전부 숨기고 있었다. 그 결과 모든 OBJECT 에 권한이 하나씩 부여된 역할(예: `SYSADMIN`)에서는
OBJECT 목록이 **0 건**이 되어 두 번째 PERMISSION 을 부여할 방법 자체가 사라졌다.

조치: 선택된 PERMISSION 기준으로만 제외하고(권한 미선택이면 전체 표시), 왜 안 보이는지 알 수 있게
패널에 `선택 권한: TEST_NOTICE (부여됨 제외)` 힌트를 노출한다.

검증: `role_lsh_notic` 에서 권한 미선택 = 22건 → `TEST_NOTICE` 선택 = 21건 (`noticeMgmt` 제외).

## ⑥ 역할 ID 를 임의로 입력해 합성 규칙을 무력화 — `commRoleMng`

AsIs `xfdl:243` 은 `readonly="true"` 이고 `ROLE_ID` 는 `"role_" + MENU_ID + "_" + ID` 자동 합성이
정본이다. ToBe 는 신규 행에서 직접 입력을 열어 놨고, 저장 시 `MENU_ID` / `ID` 필수 검증도 없었다.
→ 메뉴 ID 없이 임의 `ROLE_ID` 로 저장되는 행이 만들어진다.

조치: `역할 ID` 는 항상 readOnly, 신규 행에 `MENU_ID` / `ID` 필수 검증 추가(기존 행은 제외 —
`MENU_ID` 가 PK 구성요소라 변경 불가이므로 기존 행에 강제하면 수정 자체가 막힌다).

기존 행의 `메뉴 ID` 는 빈 콤보 대신 읽기전용 라벨(`lsh (공지)` / `(미지정 — 기존 역할은 변경 불가)`)로
표기해 "선택이 안 된 것" 으로 오해되지 않게 했다.

> **메뉴 ID 의 정체**: `TB_MCM_SEC_MENU_FLD` 의 **메뉴 폴더**다 (AsIs 컨트롤명도 `cbo_folder`).
> 현재 7개 — `csa/cma/cmb/cme/cmz/anl/lsh`. "이 역할이 이 메뉴만 본다" 는 뜻이 아니라 `ROLE_ID` 의
> 접두 토큰일 뿐이고, 실제 권한은 `TB_MCM_SEC_ROLE_MAPPING` (OBJECT × PERMISSION) 이 결정한다.

## ⑦ 저장 후 목록이 전체·무정렬로 튀고 선택이 풀림 — `commRoleMng`, `commRoleGrpMng`

BE 의 저장 후 재조회가 `findAll()` 이다 (`CommRoleGrpMngService.java:209`, `CommRoleMngService` 동일).
조회용 `searchByFilter` 와 달리 필터도 `ORDER BY` 도 없다. 조건 조회 후 저장하면 갑자기 전체 목록이
임의 순서로 뜬다. 게다가 저장 직후 `setSelectedKey(null)` 이라 상세와 하단 그리드가 통째로 비워진다.

조치: FE 가 응답의 `ds_main` 을 버리고 **현재 검색조건으로 재조회**하고, 저장한 행의 선택을 유지한다.
`조회` 버튼도 결과에 남아 있으면 보던 행을 유지한다(없을 때만 첫 행).

부수: 하단 권한 그리드의 갱신 트리거를 `selectedKey` → `ROLE_ID` 로 바꿨다. 저장하면 행 key(`__rowId`)가
바뀌는데 이전 구현은 `selectedKey` 만 보고 있어 같은 역할을 선택 중인데도 갱신되지 않았다.

## ⑧ 사용자 관리 — 선택 표시 없음 / 삭제 행이 안 사라짐 / 비밀번호 초기화 실패

- **추가 가능 역할그룹 그리드에 선택 표시가 전혀 없었다** (`page.tsx:1225-1245`). `onRowClick` 으로
  Set 만 토글해서, 무엇을 골랐는지 알 수 없고 두 번 누르면 조용히 해제된다. 그 상태로 "역할추가" 를
  누르면 "선택된 Role 그룹이 없습니다" 만 뜬다 → "역할 추가가 안 된다" 로 체감.
  → `selectable multiSelect onRowSelect` 로 교체 (`commUserRoleCopy` 정본 패턴).
- **삭제 표시 행이 목록에 그대로 남았다** — 건수(`count`)만 deleted 를 제외하고 `data` 는 원본 `rows`
  를 넘기고 있었다. 같은 파일 안에서 우측 역할 그리드는 이미 필터하고 있어 동작이 갈렸다.
  → `visibleRows` 로 통일.
- **비밀번호 초기화가 항상 실패** — BE `pwdinit(request, master)` 는 2-arg 이고 OASIS
  `StrictMethodInvoker` 는 전 파라미터 필수인데, FE 가 비-SSO 경로에서 `grids` 를 생략했다
  (`api.ts:194-196`). context 에 `master` 키가 없어 메서드 해석이 실패하고
  HTTP 200 + `meta.success=false` 로 떨어진다. → 항상 `{master:{rows:[]}}` 를 보낸다.
- **역할조회가 미저장 변경을 말없이 삭제** — `loadRoleGrids` 가 두 그리드를 통째로 교체한다.
  → 미저장 행이 있으면 confirm.

## ⑨ 권한 일괄 등록 — 사번 NULL 사용자가 목록에서 증발

`CommUserRoleCopyService.java:151` 의 `AND S.USER_EMP_NO <> :pUserIdCopy`.
`NULL <> 'x'` 는 TRUE 가 아니라 UNKNOWN 이라 WHERE 가 그 행을 통째로 버린다. source 를 고르는 순간
사번 미등록 사용자들이 대상 목록에서 전부 사라진다.

조치: `AND (S.USER_EMP_NO IS NULL OR S.USER_EMP_NO <> :pUserIdCopy)`.

## ⑩ 계정을 삭제해도 목록에 남고 "계정 재생성" 버튼이 영영 안 열림 — `commUserMng`

`applyDelete` 는 `END_ACTIVE_DATE` 만 마감하고 `USE_TP` 는 'Y' 로 남겼다. 그런데

- 목록 조회의 기본 필터는 `USE_TP='Y'` (`page.tsx:114`) 이고 `searchByFilter` 의 WHERE 에는
  `END_ACTIVE_DATE` 조건이 없다 → 삭제한 계정이 계속 "사용 여부 Yes" 로 목록에 남는다
- "계정 재생성" 버튼은 `selected?.USE_TP === "Y"` 면 비활성 (`page.tsx:1148`)
  → `USE_TP` 가 'Y' 로 남으므로 **재생성 버튼이 영영 열리지 않는다**

조치(2026-09-04 사용자 결정): 논리삭제 시 `USE_TP='N'` 을 동시 SET 한다.

```java
// SecUserRepository
@Query("UPDATE McmSecUser u SET u.endActiveDate = :endActiveDate, u.useTp = :useTp WHERE u.userId = :userId")
int updateEndActiveDate(String userId, LocalDateTime endActiveDate, String useTp);

// CommUserMngService.applyDelete
int affected = secUserRepository.updateEndActiveDate(userId, endDt, "N");
```

되돌리는 경로는 손댈 필요가 없었다 — `reRegCmUser` 가 이미
`updateReRegUser(userId, today, END_OF_TIME, "Y")` 로 `USE_TP='Y'` 를 복원한다.
삭제 후 그 계정을 다시 찾으려면 조회조건 `사용 여부` 를 `No` 또는 `전체` 로 두면 된다.

---

## 남겨둔 것 (미조치)

| 항목 | 근거 | 왜 남겼나 |
|---|---|---|
| `searchCmRoleGrpMenu` 가 SQLite 에서 100% 실패 | `SecRoleGroupMappingNativeRepository.java:172-205` 가 MSSQL 전용 (`OPTION (MAXRECURSION 32)`, `RIGHT()`+`+` 결합, `WITH RECURSIVE` 누락). `McmAuditStatementInspector.toSqlite` 는 3가지만 치환 | FE 가 이 action 을 import 하지 않아 현재 잠복. `api.ts` 에 공개 함수로 남아 있어 누가 쓰면 즉시 터진다 |
| `admin` 계정 자기 행 저장 불가 | DB 실측 `admin.EMAIL = NULL` 인데 FE 필수 검증(`page.tsx:462-464`)이 EMAIL 을 요구 | 데이터 문제. EMAIL 을 채우면 해소 |

## 교훈

- **"버튼을 눌러도 아무 일이 없다" 는 대부분 성공 응답 뒤에 숨은 silent skip 이다.** 서버가
  `continue` 로 넘긴 행 수를 응답에 실어야 화면에서 원인을 볼 수 있다.
- **공유 그리드 컴포넌트가 채워 보내는 빈 문자열이 화면의 기본값을 덮는다.** `{...defaults, ...fromGrid}`
  순서는 거의 항상 틀린다.
- **복합 PK 를 다루는 후보 목록 필터는 PK 전체를 기준으로 해야 한다.** 일부 컬럼만으로 제외하면
  나머지 조합을 만들 수단이 사라진다.
- 좌우로 배치한 셔틀에 상하 화살표를 쓰지 않는다. AsIs 컨트롤 이름(`btn_left`/`btn_right`)이
  이미 답을 갖고 있었다.
