# 권한 작업대 마감 결과: z2 실제 로그인 확인 · z3 2단계 끝 기준

이 문서는 [`runbook-z2-z3.md`](runbook-z2-z3.md) 를 Mac 에서 실행한 결과입니다.

- 실행: 2026-11-28 06:10–06:55 (KST), 레인 perm-z2z3, 브랜치 `perm/perm-fe-z2` (기준 `baa044070`)
- DB: 복제 PDB `L_PERM_Z4` (런북의 `L_Z2` 자리). 쓰기 SQL 은 이 PDB 에만 실행했습니다.
- 서버: `be-run.sh --mcm --mdm --mls --pdb=L_PERM_Z4` + `--analog`(로그 뷰어 화면용으로 추가), `fe-run.sh --all -q`. `mcm.security.sysadmin-freepass` = false.
- 브라우저: ego-browser, `http://localhost:5100`. 로그인은 로그인 화면에 아이디·비밀번호를 넣고 「로그인」을 눌렀습니다(06:22 이후 전부). 06:22 전 기준선 1회만 API 로그인이었고, 같은 기준선을 화면 로그인으로 다시 했습니다.
- 판정 자료: 작업대 화면(미리보기 글·버튼 title) + 작업대 서버 응답(`searchMenuTree`·`explain`), 실제 로그인 화면(왼쪽 메뉴·버튼 켜짐/꺼짐과 `title="권한이 없습니다"`) + `secUser/myMenusTree`·`myButtonEndpoints` + 403 요청.
- 캡처: [`z2-z3-shots/`](z2-z3-shots/) (긴 변 1400px, 128색으로 줄임)

## 요약

| 구분 | 통과 | 실패 |
|---|---|---|
| z0 준비(§1 실제 DB) | 1 | 0 |
| z2 사람 기준선(admin·steward·z2_user·none·empty) | 5 | 0 |
| z2 1단계 6사례 + 덧붙임 (1·2-a·2-b·2-c·3·4·5·6-a·6-b·덧붙임) | 8 | 2 (6-a = F2, 6-b = F1) |
| z3 5.1·5.2.1·5.2.2·5.3·5.4 | 5 | 0 |
| z3 중 새로 찾은 결함 | — | 1 (F3) |
| 합계 | 19 | 3 |

실패 목록은 [실패 목록](#실패-목록) 에 있습니다.

## 환경 메모

- `src/frontend/m-mcm/.env` 8행 `NEXTAUTH_URL` 이 `http://localhost:5300` 이라 브라우저 로그인 뒤 5300 으로 넘어갔습니다. 조정 지시로 `http://localhost:5100` 으로 고치고(커밋 안 함, git 무시 파일) 프론트를 다시 띄웠습니다. 그 뒤 화면 로그인이 5100 에 머무는 것을 확인했습니다.
- ego-browser 는 사용자와 프로필을 함께 씁니다. 시험 중 포털 탭 7개를 닫았습니다: 룰, 룰 화면, 룰 세트, 룰 세트 편집, 용어 관리, 위젯 관리, 예약 작업 관리. 사용자가 다시 열어야 합니다. 「아이디 저장」 값(`oasis.login.savedUserId`)은 시험 계정으로 바뀌었다가 마지막에 원래 값으로 되돌렸습니다(저장 켜짐 그대로).
- 외부 변경: 06:33:25 사용자가 admin 으로 사용자 `e2e_search`(「e2e 조회 테스트」)를 만들고, 06:38:22 admin 초안(USER_GRP ADD `e2e_search` → `Z2_RG_B`, 1건)을 저장했습니다. 사용자 결정으로 z3 시작 전에 작업대 「초안 버리기」로 그 초안을 버렸습니다. `e2e_search` 계정은 그대로 둡니다.
- 06:54:52 에 같은 내용(USER_GRP ADD `e2e_search` → `Z2_RG_B`)의 admin 초안이 다시 생겼습니다. 지우지 않았습니다. 근거: mcm 로그에 06:54:35–06:54:52 사이 `commPermBench/saveDraft` 가 8번 있습니다. 같은 시간 이 레인 스크립트는 5.4 이력 열람(`searchHistory` 06:54:40, `searchHistoryDtl` 06:54:44)만 하고 편집하지 않았습니다. 이 레인 페이지의 localStorage·sessionStorage 에는 작업대 초안 캐시나 `e2e_search` 가 없습니다. 그래서 다른 클라이언트가 admin 으로 저장한 것으로 판단합니다. 주체는 확인하지 못했습니다.
- 로그 뷰어는 analog 모듈 화면입니다. API 경로는 `/api/analog/rest/logViewer/{action}` 이고, 화면을 그리려면 analog 백엔드(8191)가 필요해 추가로 띄웠습니다. `/api/analog/rest/logViewer/search`(POST) 는 권한을 통과하면 analog 가 404 를 돌려줍니다(경로 없음). 이 문서에서 로그 뷰어 403 판정은 「403 = 막힘, 404 = BFF 권한 통과」로 읽습니다.
- `mdmSample` 은 mdm 모듈 화면입니다. 403 확인 경로는 `/api/mdm/oasis/mdmSample/{action}` 입니다(런북 3.3절의 `/api/mcm/oasis/...` 로 보내면 모듈 키가 `mcm/mdmsample/...` 이 되어 늘 403).
- admin 은 시드에서 `ROLE_GROUP_MDM_STEWARD` 에도 들어 있습니다(역할 `MDM_STEWARD`, `SYSADMIN`).
- 역할 그룹 관리(`commRoleGrpMng`)는 역할이 연결된 그룹을 미사용으로 저장하면 「현재 연결된 역할이 존재 합니다. 삭제 후 처리하세요.」로 거절합니다. 그래서 사례 2-b·5 는 런북 SQL(UPDATE `USE_TP`) + mcm 재기동으로 했습니다.
- 메뉴 관리(`commMenuMng`)의 저장 확인은 브라우저 기본 confirm 창(「저장하시겠습니까?」)입니다. 다른 관리 화면은 Mantine 창입니다.
- OBJECT 관리에서 버튼 칩을 다시 넣으면 저장 값이 입력 순서(`save,search,changeStatus`)로 남습니다. 정렬하지 않습니다. 사례 4 되돌리기 뒤 SQL 로 원래 문자열 `changeStatus,save,search` 로 맞췄습니다.
- BFF 권한 캐시(`m-mcm/lib/auth/api-permission-cache.ts`)는 TTL 60초입니다. BE → BFF 무효화 호출은 이번 실행 내내 실패했습니다(아래 WARN 18회). 그래서 회수·부여가 BFF 403 판정에 반영되기까지 최대 60초 걸립니다(사례 2-c 참고).

BE → BFF invalidate-role WARN 원문(토큰·비밀번호 없음). 메시지에 URL·상태 코드는 찍히지 않습니다. 설정된 URL 은 `application-local.yml` 의 `mcm.bff.invalidate-role-url: http://localhost:5100/api/mcm/internal/cache/invalidate-role` 입니다. 프론트 로그에는 이 경로로 들어온 요청 기록이 없습니다.

```
[be-mcm] 2026-11-28 06:30:01.035 [SimpleAsyncTaskExecutor-1] [] [] WARN  c.d.d.m.l.RoleChangedEventListener - BFF invalidate-role 호출 실패 (swallow): roleId=SYSADMIN, msg=HTTP/1.1 header parser received no bytes
[be-mcm] 2026-11-28 06:38:10.072 [SimpleAsyncTaskExecutor-1] [] [] WARN  c.d.d.m.l.RoleChangedEventListener - BFF invalidate-role 호출 실패 (swallow): roleId=Z2_ROLE_B, msg=HTTP/1.1 header parser received no bytes
```

## z0 준비

| 단계 | 결과 |
|---|---|
| 서버 기동(시드) | mcm·mdm·mls 기동. 시드 완료 |
| `mdm-rbac-users.sql` + §2.4 SQL + COMMIT | 모두 성공(픽스처 3·3·2행, 역할 2, 그룹 3, 그룹→역할 3, 퍼미션 3, 사용자 3, 비밀번호 3, 사람→그룹 4) |
| mcm 재기동 | 성공 |
| §1 실제 DB 확인 | 통과. 사람 칸에 관리자·Z2 일반 사용자·Z2 빈 퍼미션 사용자·E2E MDM 표준관리자가 보임. 가짜 자료 없음. 캡처 `z0-bench-real-db.png` |

## z2: 사람 기준선 (4.1절)

| 사람 | 화면 | 작업대 메뉴 보임 | 실제 메뉴 보임 | 작업대 켜진 버튼 | 실제 켜진 버튼 | 403 확인 action·결과 | 같음 |
|---|---|---|---|---|---|---|---|
| admin | 공지사항 관리 | Y | Y | changeStatus·save·search (`SYSADMIN`, 길 = 시스템관리자 그룹 → 시스템관리자) | 조회·신규 켜짐, 저장·게시중지 상태로 꺼짐, 삭제 권한없음. myButtons = changeStatus·save·search | `noticeMgmt/delete` 403, `noticeMgmt/search` 200 | Y |
| admin | 권한 작업대 | Y | Y | 11개 action 모두 `SYSADMIN` | myButtons 11개 | — | Y |
| admin | 로그 뷰어 | Y | Y | search `SYSADMIN` | myButtons search | `logViewer/search` 404(통과), `logViewer/delete` 403 | Y |
| e2e_mdm_steward | MDM 샘플 | Y | Y | compare·copy·export·search·view (`PERM`), 나머지 `NO_PERM` | myButtons 같음. 화면에 버튼 줄 없음(스캐폴드 화면) | `mdmSample/search` 200, `mdmSample/save` 403, `commUserMng/search` 403 | Y |
| e2e_mdm_steward | 레이아웃 확정 | Y | Y | 16개 모두 `PERM` | myButtons 16개 | — | Y |
| z2_user | 공지사항 관리 | Y | Y | changeStatus·save·search (`PERM`, 길 = Z2 그룹 A → Z2 공지 담당, Z2 그룹 A2 → Z2 공지 담당) | 조회·신규 켜짐, 삭제 권한없음, 저장·게시중지 상태로 꺼짐 | `noticeMgmt/delete` 403, `noticeMgmt/search` 200 | Y |
| z2_user | 로그 뷰어 | Y | Y | search `PERM` | myButtons search | `logViewer/search` 404(통과) | Y |
| z2_user | 권한 작업대 | N (`NO_PERM`) | N | 모두 `NO_PERM` | 없음 | `commPermBench/searchBench` 403 | Y |
| e2e_mdm_none | 공지사항 관리 | N (`NO_ROLE`) | 메뉴 없음 | 모두 `NO_ROLE` | 없음 | `noticeMgmt/search` 403 | Y |
| z2_empty | 공지사항 관리 | Y | Y | search 만 `PERM` | 조회 켜짐, 신규·저장·삭제·게시중지 권한없음 | `noticeMgmt/search` 200, `noticeMgmt/save` 403 | Y |

- 런북 4.1절은 MDM_STEWARD 의 `mdmSample` 을 「search 만 켜짐」으로 적었습니다. 이 PDB 의 시드 퍼미션은 `compare,copy,export,search,view` 이고 오브젝트 값에 다섯 값이 다 있습니다. 작업대와 실제 모두 다섯 개라 「같음」은 Y 입니다. 런북 기대값이 틀렸습니다.
- 「신규」 버튼 action 은 `save` 입니다(z2_empty 에서 save 가 없을 때 신규도 권한없음).
- 캡처: `z2-admin-noticeMgmt.png`, `z2-steward-mdmSample.png`, `z2-z2_user-noticeMgmt.png`, `z2-z2_user-logViewer.png`, `z2-z2_empty-noticeMgmt.png`, `z2-bench-z2_user-noticeMgmt.png`

## z2: 1단계 끝 기준 6사례 (4.2절)

| 사례 | 바꾼 방법 | 기대 | 실제 | 통과 | 캡처 |
|---|---|---|---|---|---|
| 1 SYSADMIN | 없음 | 오브젝트 값마다 `SYSADMIN`, 없는 action 403 | 작업대 `GRANTED=Y REASON=SYSADMIN`. 실제 오브젝트 값 버튼 켜짐, 삭제(`delete`) 권한없음·403 | Y | `z2-admin-noticeMgmt.png` |
| 2-a 역할 사용 안 함 | 역할 관리 화면 「미사용」→「사용 안 함으로 두기」→ 저장 | 메뉴에서 공지·로그 뷰어 사라짐, `ROLE_UNUSED`, search 403 | 작업대 「열 수 없습니다」·잠긴 이유 「역할 사용 안 함」, 서버 `ROLE_UNUSED`. 실제 메뉴 없음, `noticeMgmt/search` 403 | Y | `c2a-role-unused-saved.png`, `c2a-bench-z2_user.png` |
| 2-b 그룹 사용 안 함 | 화면 거절 → SQL + mcm 재기동 | 메뉴 사라짐, `GROUP_UNUSED`, 403 | 작업대 「그룹 사용 안 함」, 서버 `GROUP_UNUSED`. 실제 메뉴 없음, 403 | Y | `c2b-bench-z2_user.png` |
| 2-c 오브젝트 사용 안 함 | OBJECT 관리 화면 No → 확인 → 저장 | 두 사람 모두 로그 뷰어 사라짐, `OBJ_UNUSED`, 403 | 작업대 「오브젝트 사용 안 함」(z2_user·admin 둘 다 `OBJ_UNUSED`). 실제 두 사람 메뉴에서 사라짐, myButtons 비어 있음. z2_user 403. admin 은 저장 직후 404(BFF 통과), 약 60초 뒤 403 | Y (지연 메모) | `c2c-bench-z2_user.png` |
| 3 숨김 메뉴 | 메뉴 관리 화면 「미표시」 → 저장(기본 confirm) | 실제 메뉴에 없음, 작업대 「숨김」·search 켜짐, 403 아님 | 재기동 없이 바로: 실제 왼쪽 메뉴에서 로그 뷰어 사라짐(빈 폴더 「로그 조회」는 남음), myMenusTree `hiddenYn=Y`. 작업대 「숨김」, 「메뉴에서 숨김(주소로 연 화면)」, search 켜짐(`MENU_HIDDEN` 은 메뉴 줄 REASON). `logViewer/search` 404(통과) | Y | `c3-bench-z2_user.png`, `c3-actual-z2_user-menu.png` |
| 4 오브젝트에서 빠진 값 | OBJECT 관리 화면 changeStatus 칩 삭제 → 저장(막지 않음) | changeStatus `ALLOWED=N` `NOT_IN_OBJ`, 두 사람 게시중지 꺼짐, 403 | 작업대 「changeStatus · 오브젝트에 없음」, 서버 `ANGN:NOT_IN_OBJ`. 실제 두 사람 게시중지 권한없음, `noticeMgmt/changeStatus` 403(둘 다) | Y | `c4-objmng-save.png`, `c4-bench-z2_user.png`, `c4-actual-z2_user.png` |
| 5 여러 그룹 같은 역할 | (1-2) 기준선, (3-4) `Z2_RG_A` 만 SQL 로 끄고 재기동 | 길 2개 → `Z2_RG_A2` 하나, 버튼 그대로 | 기준선 title 「쓰는 길: Z2 그룹 A → Z2 공지 담당, Z2 그룹 A2 → Z2 공지 담당」, `GROUPS=Z2_RG_A,Z2_RG_A2`. 끈 뒤 「Z2 그룹 A2 → Z2 공지 담당」 하나, 버튼 3개 그대로, `noticeMgmt/search` 200 | Y | `z2-bench-z2_user-noticeMgmt.png`, `c5-bench-z2_user.png` |
| 6-a 빈 BTN 저장 거절 | PERMISSION 관리에서 `Z2_ROLE_B`×`noticeMgmt` 의 search 칩 끔 → 저장 | `PERM_EMPTY_BTN` 거절 | 거절 없음. 확인 창 없이 저장되어 퍼미션 행이 삭제됨(`saveCmPermTask` MERGE·DEL). SQL 로 복원 | N (F2) | `c6a-permmng-empty-btn.png` |
| 6-b 효과가 빈 퍼미션 행 | SQL `BTN_PERM='print'` + 재기동 | 메뉴 보임, 버튼 모두 꺼짐, 작업대에 화면 보이고 3개 「켠 역할 없음」, print 「오브젝트에 없음」, 403 | 서버 `searchMenuTree` VISIBLE=Y, explain 3개 `NO_PERM` + print `ANGN:NOT_IN_OBJ`. 실제 메뉴 보임, 버튼 5개 모두 권한없음, `noticeMgmt/search` 403. 작업대 미리보기는 메뉴 목록에 화면을 보이면서도 본문에 「현재 이 화면을 열 수 없습니다. 메뉴에도 보이지 않습니다. 잠긴 이유: 켠 역할 없음」 | N (F1) | `c6b-bench-z2_empty-current.png`, `c6b-actual-z2_empty.png` |
| 덧붙임 역할 없는 사람 | 없음 | `NO_ROLE`, 메뉴 없음, 403 | 작업대 「잠긴 이유: 받은 역할 없음」, 「열 수 있는 화면이 없습니다」. 실제 메뉴 없음, 403 | Y | — |

- 모든 사례 값은 사례 끝에 되돌렸습니다. z3 시작 전 6.1·6.2·6.3절 SQL 결과가 2.4절과 같았습니다.
- 사람 기준 미리보기에서 메뉴에 없는 화면은 미리보기 메뉴에서 고를 수 없습니다. 메뉴(오브젝트) 칸의 줄을 눌러 골랐습니다.

## z3: 2단계 끝 기준 (5절)

시작 전: admin 초안(사용자 것)을 버림, z3_admin2 초안 0건.

### 5.1 적용 결과 = 시뮬레이션 — 통과

| 항목 | 기대 | 실제 |
|---|---|---|
| 초안 막대 | 바꾼 것 2건 | 「바꾼 것 2건 · 영향 얻는 사람 2 잃는 사람 0 · 화면 1개」 |
| 타일 | 2 · 2 · 0 · 1 | 바꾼 것 2, 얻는 사람 2, 잃는 사람 0, 바뀌는 화면 1 |
| 영향받는 사람 | none `+save,search`, z2_empty `+save` | 「E2E MDM 권한없음 공지사항 관리 +save,search」, 「Z2 빈 퍼미션 사용자 공지사항 관리 +save」 |
| 초안 미리보기 | none 공지 새로 보임, save·search | 저장·조회에 「새로」, changeStatus 「켠 역할 없음」. 서버 DRAFT explain 두 사람 모두 save·search `PERM` |
| 적용 창 | 「초안 2건을 현재 값으로 적용합니다.」 | 같음 + 「얻는 사람 2명 · 잃는 사람 0명 · 바뀌는 화면 1개」 |
| 적용 | 확인 창 없이 성공 | 「초안 2건을 적용했습니다. (PA20261128064241683303)」, 초안 막대 「바꾼 것 없음」 |
| 실제 로그인 | 두 계정 조회·신규·저장 켜짐, 게시중지·삭제 꺼짐 | 두 계정: 메뉴 공지사항 관리, 조회·신규 켜짐, 저장 상태로 꺼짐(행 미선택), 삭제·게시중지 권한없음. myButtons save·search. `noticeMgmt/search` 200, `noticeMgmt/changeStatus` 403 |
| DB | USER_MAPPING 1줄, ROLE_PERM `save,search` | (`e2e_mdm_none`, `Z2_RG_B`) 생김, `Z2_ROLE_B`×`noticeMgmt` = `save,search` |
| 이력 | 2 · 2 · 0 · `z3-a`, USER_GRP ADD N→Y, ROLE_OBJ UPD | 같음. `BTN=search\|POPUP=` → `BTN=save,search\|POPUP=` |

캡처: `z3-51-draft-impact.png`, `z3-51-apply-dialog.png`, `z3-51-applied.png`, `z3-51-actual-none.png`, `z3-51-actual-z2_empty.png`

### 5.2.1 충돌 안내 (`PERM_CONFLICT`) — 통과 (절차 바꿈)

- 런북 절차(두 관리자가 같은 값 changeStatus 를 켬)로는 충돌이 재현되지 않았습니다. 창 1 적용 뒤 창 2 가 작업대를 다시 열면 현재 값과 같아진 초안 줄이 지워져 「바꾼 것 없음」이 되고 「초안 적용」이 꺼집니다(§8 13번).
- 같은 범위(`role:Z2_ROLE_B`)에 다른 값으로 다시 했습니다. 창 2(z3_admin2): `Z2_ROLE_B`×공지 changeStatus 끔(초안 저장 06:47:21). 창 1(admin): 같은 줄 save 끔 → 잃는 사람 확인 → 「초안 1건을 적용했습니다. (PA20261128064756667305)」. 창 2: 적용.
- 결과: 서버 `PERM_CONFLICT: role:Z2_ROLE_B` (HTTP 200, meta.success=false, code E010). 적용 창 닫힘, 초안 남음. 초안 막대 「다른 관리자가 먼저 바꾼 범위가 있습니다: 역할 Z2 공지 조회. 초안은 그대로 둡니다. 현재 값을 다시 읽고 초안을 확인한 뒤 다시 적용합니다.」 + 「현재 값 다시 읽기」. 이력 머리 늘지 않음.
- 「현재 값 다시 읽기」 뒤에도 줄은 남고(값이 현재와 다름), 다시 적용하면 또 `PERM_CONFLICT`. 「초안 버리기」로 끝냈습니다(런북 예상대로).
- 캡처: `z3-521-w2-draft.png`, `z3-521-w1-applied.png`, `z3-521-w2-conflict.png`

### 5.2.2 잠금 시간 안의 적용 (`PERM_BUSY`) — 통과

- 런북 1단계(창 2 `Z2_ROLE_B`×로그 뷰어 search 켜기)는 F3 때문에 할 수 없어 `Z2_ROLE_B`×공지 save 켜기(gain 2명)로 바꿨습니다.
- SQL 세션이 `SELECT ROLE_ID FROM TB_MCM_SEC_ROLE WHERE ROLE_ID='Z2_ROLE_B' FOR UPDATE` 를 40초 쥐는 동안 창 2 적용.
- 결과: 약 5.1초 뒤 `PERM_BUSY: 다른 적용이 진행 중입니다`. 화면 「다른 적용이 진행 중입니다. 잠시 뒤 다시 시도해 주세요.」, 적용 창은 열린 채. 이력 늘지 않음.
- ROLLBACK 뒤 같은 창 「적용」 → 「초안 1건을 적용했습니다. (PA20261128065234759306)」(적용한 사람 z3_admin2).
- 실제 로그인: z2_empty·e2e_mdm_none 둘 다 공지 myButtons changeStatus·save·search, `noticeMgmt/search` 200.
- 캡처: `z3-522-busy.png`, `z3-522-actual-z2_empty.png`

### 5.3 잃는 사람 재확인 (`PERM_NEED_CONFIRM`) — 통과

- 창 1(admin) 역할 기준 `Z2_ROLE_A`×로그 뷰어 search 끔 → 초안 「등록 해제」(DEL). 타일 1 · 0 · 1 · 1, 영향 「Z2 일반 사용자 로그 뷰어 −search」.
- 적용(`confirmLoss=N`) → `PERM_NEED_CONFIRM: 1`. 같은 창이 「버튼을 잃는 사람이 1명 있습니다. 한 번 더 확인합니다. (잃는 사람 1명)」, 명단 「Z2 일반 사용자 로그 뷰어 −search」, 버튼 「취소」·「잃는 사람이 있어도 적용」. 이력 늘지 않음.
- 「취소」 → 창 닫힘, 초안 남음. 다시 적용 → 같은 확인 → 「잃는 사람이 있어도 적용」(`confirmLoss=Y`) → 「초안 1건을 적용했습니다. (PA20261128065401953307)」.
- 실제 로그인 z2_user: 메뉴에서 로그 뷰어 사라짐, myButtons 비어 있음, `logViewer/search` 403.
- DB: `Z2_ROLE_A`×`logViewer` 행 없음. 이력 `LOSE_USER_CNT=1`, 줄 `ROLE_OBJ`·`DEL`, 전 `BTN=search|POPUP=`, 뒤 NULL.
- 문구 차이(작음): 런북은 「(1)」로 적었고 실제는 「(잃는 사람 1명)」.
- 메모: 확인 단계에서 다시 연 적용 창의 메모 칸은 비어 있어 이 적용의 메모는 빈 값으로 남았습니다(첫 시도에 넣은 `z3-d` 는 이어지지 않음).
- 캡처: `z3-53-draft-impact.png`, `z3-53-need-confirm.png`

### 5.4 이력 확인 — 통과

- 기간 기본값 2026-10-29 ~ 2026-11-28 (오늘 − 30일 ~ 오늘).
- 목록 6건 = DB `TB_MCM_SEC_PERM_HIS` 6건과 같음(이 PDB 에 원래 있던 `PA20261127233522953903` 포함). 충돌·BUSY·확인 전 실패는 없음.
- `PA20261128064241683303` 상세: 「사람 ↔ 그룹 · 더함 · E2E MDM 권한없음 (e2e_mdm_none) · Z2 그룹 B (Z2_RG_B) · N · Y」, 「퍼미션 · 바꿈 · Z2 공지 조회 (Z2_ROLE_B) · noticeMgmt · BTN=search|POPUP= · BTN=save,search|POPUP=」 = 6.5절 SQL 과 같음.
- 캡처: `z3-54-history.png`, `z3-54-history-dtl.png`

z3 이 남긴 값(되돌리지 않음, PDB 는 조정이 닫음): `Z2_ROLE_B`×`noticeMgmt` = `changeStatus,save,search`, (`e2e_mdm_none`, `Z2_RG_B`) 소속, `Z2_ROLE_A`×`logViewer` 없음, 이력 5건.

## 실패 목록

### F1 작업대 미리보기가 효과가 빈 퍼미션 화면을 「열 수 없음」으로 그림 (사례 6-b)

- 판정(win30): FE 결함 확정. 미리보기는 서버 `VISIBLE`·`REASON` 을 따라야 한다. 효과가 빈 퍼미션 = 「화면은 열림, 쓸 수 있는 버튼 없음」. z3 뒤 별도 수정 커밋.
- 기대: 화면이 보이고 search·save·changeStatus 「켠 역할 없음」, print 「오브젝트에 없음」 (D14).
- 실제: 미리보기 메뉴 목록에는 공지사항 관리가 있는데, 본문은 「「Z2 빈 퍼미션 사용자」은(는) 현재 이 화면을 열 수 없습니다. 메뉴에도 보이지 않습니다. 잠긴 이유: 켠 역할 없음」. 같은 때 서버 `searchMenuTree` 는 VISIBLE=Y·REASON=null, 실제 로그인은 메뉴 보임.
- 재현: 2.4절 자료 → `UPDATE TB_MCM_SEC_ROLE_PERM SET BTN_PERM='print' WHERE ROLE_ID='Z2_ROLE_B' AND OBJECT_ID='noticeMgmt'` → 백엔드 재기동 → admin 작업대 사람 기준 「Z2 빈 퍼미션 사용자」 × 공지사항 관리, 「현재」.
- 캡처: `c6b-bench-z2_empty-current.png`(현재), `c6b-bench-z2_empty.png`(초안 보기), `c6b-actual-z2_empty.png`(실제)

### F2 PERMISSION 관리에서 마지막 버튼 칩을 끄고 저장하면 확인 없이 퍼미션 행이 지워짐 (사례 6-a)

- 판정(win30): D14 대로 삭제가 맞다. `commPermMng` 에 확인 창 추가가 할 일. z3 뒤 별도 수정 커밋. 런북 6-a 기대(`PERM_EMPTY_BTN` 거절)는 고친다.
- 기대(런북): `PERM_EMPTY_BTN` 거절.
- 실제: 확인 창·거절 없이 저장. `saveCmPermTask`(퍼미션 일괄 저장 MERGE·DEL)가 `Z2_ROLE_B`×`noticeMgmt` 행을 지움.
- 재현: admin → PERMISSION 관리 → 오브젝트 `noticeMgmt` 조회 → `Z2_ROLE_B` 줄의 search 칩 끔 → 「저장」.
- 캡처: `c6a-permmng-empty-btn.png`(저장 뒤 목록에 `Z2_ROLE_A` 줄만 남음)

### F3 역할 기준에서 퍼미션 행이 없는 화면의 오브젝트 버튼을 읽지 못해 등록할 수 없음 (5.2.2 준비 중 발견)

- 기대: 역할 기준 `Z2_ROLE_B`(Z2 공지 조회) × 로그 뷰어를 고르면 오브젝트 버튼(search) 칩이 나오고 켜서 등록할 수 있다(런북 5.2.2 1단계).
- 실제: 미리보기 「버튼을 읽는 중입니다.」, 퍼미션 「오브젝트 버튼을 읽는 중입니다.」가 끝나지 않음. 「모두·조회만·없음」 꺼짐. 메뉴(오브젝트) 칸 「로그 뷰어 등록」 체크 → 「버튼이 없는 화면이라 등록할 수 없습니다」. 메뉴 칸 「버튼」 열이 퍼미션 없는 화면 모두 「—」.
- 서버는 값을 줄 수 있음: `searchRolePerm`(roleId=`Z2_ROLE_B`, menuFolderId=`anl`) 응답에 `logViewer` `OBJ_BTN_PERM=search` 가 있음. menuFolderId 빈 값으로 부르면 퍼미션 있는 `noticeMgmt` 1줄만 옴. 화면이 폴더 단위 값을 부르지 않는 것으로 보임(`useBenchState.ts` `toggleRegister` → `setRegister` 의 skipped, `PermCol.tsx:126`). 원인 확정은 안 함.
- 재현: admin 작업대 → 「역할 기준」 → Z2 공지 조회 → 보기 「모두」 → 모두 펼치기 → 로그 뷰어.
- 캡처: `z3-f3-role-view-loading.png`

### 실패가 아닌 확인 사항

- 사례 2-c: OBJECT 관리 저장 직후 admin 의 `logViewer/search` 가 BFF 를 통과(404)했다가 약 60초 뒤 403. BE myButtons·perm-keys 는 바로 반영. BFF 캐시 TTL(60초)과 무효화 호출 실패(위 WARN)가 겹친 지연입니다.
- 런북 보완: 4.1절 MDM_STEWARD 기대값, 3.3절 403 경로(모듈별), 5.2.1 절차(같은 값이면 충돌 재현 불가), 5.2.2 1단계(F3), 6-a 기대값(F2 판정).

## §8 확인 필요 15건의 답

| 번호 | 답 |
|---|---|
| 1 | 기준 `baa044070` 은 이미 실연결입니다(USE_MOCK 없음). 사람 칸에 admin·Z2 계정이 보여 실제 DB 로 확인. |
| 2 | 확인 안 함. 이번 사례에 SYSADMIN 소속 변경이 없었습니다. admin(SYSADMIN) 으로 Z2 역할·그룹·사람 편집과 적용은 모두 되었습니다. |
| 3 | `explain` 응답 경로 = `data.result.buttons`(줄 배열), 쓰는 길은 `data.result.paths`. 줄 칸: CODE·KIND·ALLOWED·GRANTED·REASON·ROLES·GROUPS. |
| 4 | 예. SYSADMIN 에게도 「삭제」는 `title="권한이 없습니다"` 로 꺼지고 `noticeMgmt/delete` 403. |
| 5 | `anl` 폴더 이름 = 「로그 조회」(위 「로그 분석」). 로그 뷰어는 analog 모듈 화면이고 PageLayout 버튼 줄이 없습니다. 「검색」·워크스페이스 버튼이 화면 안에 있고 권한 꺼짐 표시는 없습니다. API = `/api/analog/rest/logViewer/{action}`. |
| 6 | 따로 확인 안 함(매번 다시 로그인). 관찰: 버튼 권한 캐시는 사용자 ID 로 갈아 끼우고 페이지를 다시 열면 다시 읽습니다. BFF 403 판정은 TTL 60초 캐시라 최대 60초 늦습니다(2-c). |
| 7 | 예, 바로 바뀝니다. 메뉴 관리 저장 뒤 재기동 없이 다시 로그인한 z2_user 메뉴에서 로그 뷰어가 사라졌고 작업대도 바로 「숨김」. |
| 8 | 찾지 못함. 숨긴 화면은 메뉴 검색에도 안 나옵니다. 주소로 여는 경로는 확인 못 함. |
| 9 | 막지 않습니다. 저장 뒤 「저장 영향 1건 저장되었습니다. 「noticeMgmt」 버튼 「changeStatus」을(를) 빼서 퍼미션 1건(사람 1명)에서 꺼집니다.」 안내. 사용 안 함으로 바꿀 때는 저장 전에 「퍼미션 1건이 멈추고 사람 1명이 이 화면을 못 씁니다. 바꿀까요?」 확인 창. |
| 10 | 문구 없음. 거절하지 않고 행을 지웁니다(F2). |
| 11 | 확인 안 함(SQL 로 넣음). 대신 역할 그룹 관리가 역할 연결된 그룹 미사용 저장을 거절하는 것을 확인. |
| 12 | 범위 이름 문구가 나옵니다: 「다른 관리자가 먼저 바꾼 범위가 있습니다: 역할 Z2 공지 조회. …」. 응답은 메시지 문자열 `PERM_CONFLICT: role:Z2_ROLE_B` 뿐이었습니다(관찰. 화면이 범위를 어디서 읽는지는 코드로 확인하지 않음). |
| 13 | 같은 값이 된 초안 줄은 작업대를 다시 열 때(초안을 읽을 때) 이미 지워집니다. 그래서 런북 절차로는 충돌이 안 납니다. 다른 값 줄은 「현재 값 다시 읽기」 뒤에도 남고, 다시 적용하면 또 충돌 → 「초안 버리기」 필요. |
| 14 | 오브젝트 단위로 셉니다. 5.1 에서 두 사람이 같은 화면(공지사항 관리)을 얻어 「바뀌는 화면 1」. |
| 15 | 확인 안 함. 7절 되돌리기는 하지 않았습니다(PDB 는 조정이 닫음). |
