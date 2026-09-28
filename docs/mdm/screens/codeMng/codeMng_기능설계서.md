---
screenId: codeMng
asIsId: 해당 없음 (As-Is 레거시 없음 — 04 설계 문서 기반 신규 화면)
moduleId: mdm
moduleGroup: dmc
작성일: 2026-09-24
수정일: 2026-09-28 (codeMng+codeEdit 통합 — D-101·D-102. 검토 반영: 등록 [취소]·선택과 상세 정합·적용된 조회 조건)
작성자: Agent
---

# mdm — 마루 코드 기능설계서

> **인용 정본 예외 (DEC-001 선례 준용, TSK-06-02 design.md 담당자 확인 필요 결정 D11)**: As-Is 레거시가 없는 신규
> 화면이라 5종 설계 산출물을 **기능설계서 1종**으로 줄인다(unitMng·termMng·domainMng·columnMng 선례). 표의 근거는
> 원천 설계 `docs/mdm/design/basic/04-master-code-deploy-full.md`(이하 `04:행`)와 선행 Design 산출물
> `docs/mdm/tasks/TSK-06-02/design.md`(이하 `design`)다.
>
> **2026-09-28 사용자 결정: 4화면 → 2화면 통합(D-101·D-102, `docs/mdm/decisions.md`)** — D-101: 마루 코드 한 건을 다루던
> 화면 4개(codeMng 조회·등록, codeEdit 수정, codeItemEdit 코드 편집, codeCateEdit 카테고리 편집)를 2개로 줄인다. 이
> 문서가 다루는 절반은 옛 `codeMng`(조회·등록)과 옛 `codeEdit`(수정)을 화면 하나 `codeMng` 로 합친 것이다 — 왼쪽
> 목록에서 행을 고르면 오른쪽에 옛 codeEdit 본문(헤더·추가 컬럼 라벨·버전 목록)이 보이고 새 탭을 열지 않으며, 버전
> 버튼의 [코드 편집]·[카테고리 편집]도 [코드 편집] 하나로 줄인다. 나머지 절반(codeItemEdit+codeCateEdit → codeItemEdit
> 탭 통합)은 이 문서 밖의 별도 작업이다. D-102: 한 번도 RELEASED 된 적이 없는 코드는 [폐기] 자리에 [삭제]를 보인다(§7·§8).
> 이 문서는 옛 `docs/mdm/screens/codeEdit/codeEdit_기능설계서.md` 의 내용을 흡수했고, 그 폴더는 지웠다.
>
> **Frontend 개발 연계 값** (§1.2 정본) — mesModule `m-mdm` / moduleGroup `dmc` / pageName `codeMng` /
> pageId `codeMng` / 페이지 유형 `B` / tsup entry key `pages/dmc/codeMng/page`. 옛 `codeEdit` 의 tsup entry ·
> 메뉴 leaf 는 없앤다(`DataInitializer.removeMergedMdmCodeMenus`, D-101). BFF **OBJECT** `codeEdit` 자체·역할
> 매핑·서버 서비스 경로는 그대로 남는다(이 화면이 계속 그 서비스를 부른다 — §5·§8).

## 1. 화면 개요

### 1.1 업무/설계 측면

| 항목 | 내용 |
|---|---|
| 화면명 | 마루 코드 |
| 화면 식별자 | `codeMng` |
| 모듈 | `mdm`(마루 MDM) / moduleGroup `dmc`(마스터코드) |
| 화면 목적 | 마루 코드(`TB_MDM_CODE`) 목록을 현재 버전·미적용 버전·상태와 함께 조회하고, MDM 원천 마루 코드를 새로 등록하며, 목록에서 고른 코드 한 건의 헤더(이름·설명·계층 칸 수)·추가 컬럼 라벨(attr01~attr10)을 경미 수정하고 폐기(DEPRECATED)하거나(한 번도 RELEASED 된 적이 없으면 대신 코드 자체를 삭제) 버전 목록을 보며 새 버전(빈·복원)·DRAFT 삭제·선점·해제·넘기기를 한다. 등록하면 첫 버전 1.000 DRAFT 와 예약 카테고리 BASE 가 함께 생기고 등록자가 DRAFT 를 선점한다. 확정과 코드 행 편집은 다른 화면으로 이동만 한다 |
| 주요 사용자 | 담당자(`MDM_STEWARD`, 조회·등록·수정) / 표준 관리자(`MDM_STD_ADMIN`, 조회만) |
| 접근 경로 | 포털 → 마루 MDM > 마스터코드 > 마루 코드 |

근거: 04 「화면」(04:812) "탭1 조회·등록"·"탭2 수정 — 카드 ①~③", 04 「구조: 마루 코드 → 버전 · 코드 · 카테고리」(04:18),
04 「추가 컬럼」(04:157), 04 「코드 삭제와 마루 코드 폐기」(04:485), 04 「버전 상태와 적용시점」(04:227),
04 「경미 수정(패치)」(04:522), design §6.7·§6.8·§6.11·§6.12, `MdmPermissions.MATRIX` DMC 그룹
(`STD_ADMIN→READ`, `STEWARD→CONFIRM`), 2026-09-28 사용자 결정(D-101·D-102, 4화면→2화면 통합).

### 1.2 Frontend 개발 연계 값

| 항목 | 값 | 근거 / 룰 |
|---|---|---|
| moduleId / moduleGroup | `mdm` / `dmc` | `docs/mdm/screens/README.md` §2, design D1 |
| mesModule | `m-mdm` | 01 A.4.5 |
| screenId / pageId | `codeMng` | MES 룰(동일값). 옛 `codeEdit` 은 화면 식별자로 더 안 쓴다 |
| 페이지 유형 | `B`(조회·등록 + 상세 카드 3개) | |
| API path (UI→BFF, 목록·등록) | `POST /api/mdm/oasis/codeMng/{action}` | spec API 스펙. action `search`·`reg`(method `register`) |
| API path (UI→BFF, 상세) | `POST /api/mdm/oasis/codeEdit/{action}` | 옛 codeEdit 그대로 — action `view`·`save`(saveHeader)·`execute`(deprecate)·`reg`(createVersion)·`restore`(restoreVersion)·`delete`(deleteDraft 또는 `target:"CODE"` 로 코드 삭제)·`lock`(acquire)·`unlock`(release)·`handover`(handover). `lock`·`unlock`·`handover` 권한은 TSK-08-02 머지 뒤 연결(D-075) |
| Frontend 파일 | `m-mdm/pages/dmc/codeMng/page.tsx`(+ `CodeDetail.tsx`·`api.ts`·`edit-api.ts`·`buttons.ts`·`types.ts`·`edit-types.ts`·`NewVersionModal.tsx`·`HandoverModal.tsx`) | 모달은 스크린이 아니다(메뉴·OBJECT 없음). `edit-*` 접두는 옛 codeEdit 파일과 이름이 겹쳐 붙였다 |
| tsup entry key | `pages/dmc/codeMng/page` | `m-mdm/tsup.config.ts`. 옛 `pages/dmc/codeEdit/page` 엔트리는 없앤다 |
| 메뉴 계층 | 마루 MDM(`mdm`) > 마스터코드(`dmc`) > 마루 코드(`codeMng`, 순번 001) | `DataInitializer.seedMdmMenus()` 코드 시드. 옛 "마루 코드 수정"(`codeEdit`, 순번 002) 메뉴는 없앤다 — BFF **OBJECT** `codeEdit` 자체는 버튼 권한 판정용으로 남는다 |

## 2. 화면 영역 정의

| 영역ID | 영역명 | 설명 |
|---|---|---|
| `A-FILTER` | 조회조건 | 마루 코드(ID·이름)·상태 |
| `A-GRID` | 목록 그리드(`code-list`) | 조회 결과. 행을 클릭하면 오른쪽 `A-DETAIL` 이 그 코드로 바뀐다(같은 탭, ComboBox 없음) |
| `A-REG` | 등록 폼 | 상단 [신규] 를 누르면 목록 선택이 풀리고 오른쪽이 등록 폼(ID·이름·설명·계층 칸 수·원천 MDM 읽기 전용)으로 바뀐다. 폼 아래 [취소]·[저장](승인 시안) |
| `A-DETAIL` | 상세(카드 ①~③, `CodeDetail.tsx`) | 목록에서 고른 코드의 헤더·추가 컬럼 라벨·버전 목록. 아무것도 안 고르고 [신규] 도 안 눌렀으면 안내만 보인다. 코드를 고르면 이전 코드의 상세를 바로 비우고 불러오는 동안 `detail-loading` 을 보인다 |
| `A-BTN` | 상단 버튼 | `PageLayout.buttons` — [조회]·[신규](`canDoButton(rbac,"codeMng","reg")` 있을 때만) |
| `A-MODAL` | 새 버전·넘기기 모달 | `NewVersionModal`·`HandoverModal`(상세 안에서 연다) |

레이아웃: `ContentBody root resizable storageKey="mdm.dmc.codeMng"` 로 목록(왼쪽)과 오른쪽(등록 폼 / 상세 / 안내, 모드에
따라 바뀐다)을 나눈다. 상세는 `ContentBody direction="column" resizable storageKey="mdm.dmc.codeMng.detail"` 로
위(헤더|라벨, `storageKey="mdm.dmc.codeMng.detail.top"`)·아래(버전 목록)를 나눈다.

## 3. 조회조건 정의 (영역: A-FILTER)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| S-001 | `MARU_CODE_ID`, `MARU_CODE_NAME` | 마루 코드 | TextBox(`code-search-keyword`) | N | (빈값) | ID 대소문자 무시·이름 부분 일치. LIKE 와일드카드 문자는 글자로 본다 |
| S-002 | (계산) | 상태 | Select(`code-search-status`) | N | 전체 | CREATED/INUSE/DEPRECATED — **계산 상태** 기준(저장 CREATED 라도 적용된 RELEASED 가 있으면 INUSE) |

### 3.2 조회 결과 (그리드 컬럼, `code-list`)

| 컬럼 | 원천 | 설명 |
|---|---|---|
| 마루 코드 ID | `MARU_CODE_ID` | 행 클릭 = 선택(옛 링크 버튼 없앰) |
| 이름 | `MARU_CODE_NAME` | |
| 원천 | `SOURCE_KIND` | MDM/EXTERNAL |
| 현재 버전 | 계산 | `apply_from ≤ now < apply_to` 인 RELEASED 번호 "v1.001". 없고 RELEASED 가 있으면 "배포 대기 v{최대 RELEASED}", RELEASED 가 없으면 "미확정"(I17, 04 「버전 상태와 적용시점」 04:227) |
| 상태 | 계산 | 표시 상태(I18). 조회는 DB 를 쓰지 않는다 |
| 미적용 버전 | 계산 | DRAFT 또는 미래 적용 RELEASED. "없음" / "v1.000 DRAFT" / 여럿이면 ", " 연결 |

건수는 GridPanel 머리의 "N건", 0건이면 `code-list-empty` "조회된 마루 코드가 없습니다". 배포 대상 수 열은 두지 않는다
(PRD §2 규칙 7 보류, `screens/README.md` §6). 헤더 저장·폐기·새 버전·DRAFT 삭제·코드 삭제·등록처럼 상태·현재·미적용
칸이 바뀌는 액션 뒤에는 목록도 다시 조회한다. 이때 조건은 마지막으로 [조회]에 쓴 조건(적용된 조건)이다 — 입력만 하고
[조회] 하지 않은 값은 쓰지 않는다.

## 4. 등록 폼 필드 정의 (영역: A-REG)

| 필드ID | DB 컬럼명 | 화면 표시명 | 입력 방식 | 필수 | 기본값 | 설명 |
|---|---|---|---|---|---|---|
| D-001 | `MARU_CODE_ID` | 마루 코드 ID | TextBox(`code-reg-id`, 50자) | Y | | 안내 "영문 대문자·숫자·_ 만. 점·공백·콤마 불가. 마루 데이터 ID 와 한 이름 공간". 형식 검사는 서버(I9) |
| D-002 | `MARU_CODE_NAME` | 이름 | TextBox(`code-reg-name`, 100자) | Y | | |
| D-003 | `DESCRIPTION` | 설명 | Textarea(`code-reg-desc`) | N | | |
| D-004 | `LVL_CNT` | 계층 칸 수 | Select 0~5(`code-reg-lvl`) | N | 0 | 04 「계층과 다목적 분류」(04:97) |
| D-005 | `SOURCE_KIND` | 원천 | 읽기 전용 "MDM"(`code-reg-source`) | — | MDM | 서버로 보내지 않는다. 배포 대상 시스템·원천 선택·EXTERNAL 등록 없음(보류) |

등록 저장이 끝나면: 토스트 "등록했습니다" → 폼 초기화 → 목록 재조회 → **같은 화면 오른쪽에** 그 코드를 고른 상태로
상세를 보인다(옛 codeEdit 탭을 새로 여는 방식이 아니다). 새 코드의 상세가 올 때까지 버튼은 잠긴 채다.
[취소](`code-reg-cancel`)는 입력을 버리고 폼을 닫는다 — [신규] 를 누르기 전에 고른 코드가 있으면 그 코드(고른 버전 포함)를
다시 불러오고, 없었으면 안내로 돌아간다.

## 5. 상세 카드 ①·② 필드 (영역: A-DETAIL, 옛 codeEdit §3)

| 필드ID | DB 컬럼명 | 표시명 | 입력 | 검증 |
|---|---|---|---|---|
| D-006 | `MARU_CODE_NAME` | 이름 | TextBox(`header-name`) | 필수 1~100자 |
| D-007 | `DESCRIPTION` | 설명 | Textarea(`header-desc`) | |
| D-008 | `LVL_CNT` | 계층 칸 수 | Select 0~5(`header-lvl`) | 줄이기: 현재 적용 버전 번호보다 `TO_VER` 가 큰 코드 행(열린 행 포함, 현재 적용 버전이 없으면 모든 행) 중 새 값 뒤 LVL 칸에 값이 있으면 MDM021(I19) |
| D-009~018 | `ATTR01_NAME`~`ATTR10_NAME` | attr01~attr10 | TextBox(`label-attr01`~`label-attr10`) | 0~100자, 공백은 NULL |

낙관적 잠금: 헤더 저장·폐기·삭제는 `auditVer`(TB_MDM_CODE 감사 카운터 VER)를 보낸다. 다르면 MDM001 "다른 사용자가
수정했습니다. 다시 불러오세요" — 오류 모달을 닫으면 화면이 그 코드를 다시 불러온다(이전 선택 버전 유지). 헤더 저장은
저장 CREATED 이고 적용된 RELEASED 가 있으면 같은 트랜잭션에서 INUSE 로 저장한다(I18). DEPRECATED 이후에도 헤더 경미
수정은 허용한다(design D10).

## 6. 상세 카드 ③ 버전 목록 (`version-list`, 옛 codeEdit §4)

| 컬럼 | 원천 | 표시 |
|---|---|---|
| 버전 | `VER`, `RESTORED_FROM` | "v1.001" + 복원이면 "(v1.000 복원)" |
| 종류 | `VER_KIND` | MAJOR/MINOR |
| 상태 | `STATUS`, `APPLY_FROM` | `VersionStatusBadge`(미래 적용 RELEASED 는 "적용 대기") |
| 적용 구간 | `APPLY_FROM`~`APPLY_TO` | |
| 확정 일시 | `RELEASED_AT` | |
| 소유자 | `OWNER_ID` | `DraftLockBadge`("선점 가능"/"편집 중(나)"/"잠김 · {owner} 편집 중"), DRAFT 에서만 |
| 설명 | `DESCRIPTION` | |

0행이면 `version-empty` "버전이 없습니다". 미적용 버전이 2개면 `ver-unapplied-warning` "미적용 버전이 2개입니다.
하나를 삭제하세요".

**이 화면에는 서버가 고르는 "기본 버전"이 없다.** `codeEdit` view 는 선택 버전(`selectedVer` 류)을 내려주지 않고
`versions[]` 각 행에 `unapplied`·`cancelConfirmable` 판정값만 실어 보낸다(§7 확정 취소 행). 선택은 화면이 들고 있다 —
목록 행을 누르면 `selectedVer=null`(미선택), 버전 행을 누르면 그 `ver`(handoff·snapshot 이 `ver` 를 주면 그것부터).
미선택 상태에서는 §7 의 버전 동작 버튼이 전부 비활성이고 [코드 편집] 도 꺼진다(D-102, 시험
`version-buttons.test.ts` "버전을 고르지 않으면 코드 편집도 비활성"). 곧 **첫 진입에서 확정 취소까지 한 번의 행 클릭이 더
필요하다** — 룰 화면처럼 서버가 고르지 않기 때문에 벌이는 일이 아니라, 코드가 3단계(목록·상세·버전) 화면이기 때문이다.
무엇을 먼저 골라야 하는지는 서버가 이미 정해 준다 — 예정 확정(미래 적용 RELEASED) 버전이 `unapplied=true`·
`cancelConfirmable=true` 로 내려온다(룰 영역과 같은 `미적용 = DRAFT·결재 중·apply_from > now 인 RELEASED` 정의,
회귀 시험 `CodeEditVersionSqliteTest.D8_예정_확정_RELEASED_는_미적용이고_확정_취소할_수_있다`).

## 7. 버튼 및 기능 동작 정의

| 버튼 | action | 권한 | 동작 |
|---|---|---|---|
| 조회(`btn_search`) | `search` | READ | §3 조건으로 목록 재조회 |
| 신규(`btn_new`) | `reg` | `canDoButton(rbac,"codeMng","reg")` | 목록 선택을 풀고 오른쪽을 등록 폼으로 바꾼다. 이 버튼 자체는 권한이 없으면 안 보인다 |
| 등록 저장(`code-reg-save`) | `reg` | 위와 같음 | §4. 성공: 토스트 → 폼 초기화 → 목록 재조회 → 그 코드를 고른 채 상세를 보인다. 실패: `ErrorModal`(서버 `meta.message`) |
| 등록 취소(`code-reg-cancel`) | — | 없음(서버 호출 없음) | §4. 폼을 닫고 [신규] 전 선택(있으면)이나 안내로 돌아간다. 요청 진행 중에는 비활성 |

상세(`A-DETAIL`) 버튼은 모두 `flags.editable`(원천 MDM && 담당자)이 거짓이면 비활성이고, 권한은
`canDoButton(rbac,"codeEdit",action)` 으로 더 판정한다(§1.2 — 서버 OBJECT `codeEdit` 를 그대로 쓴다). 판정 순수 함수는
`buttons.ts` `versionButtons(view, selectedVer)`.
**예외: `unlock`(해제)만 `flags.editable` 을 보지 않는다** — 원천이 MDM 이고 `owner_id` 가 나인 DRAFT 면 담당자 역할과
무관하게 켠다(ADR-0002 D3, §8). 그래야 소유자가 자기 잠금을 풀 수 있다.

| 버튼(action) | 활성 조건 |
|---|---|
| 새버전(major)(`reg`) | `flags.canNewMajor` |
| 새버전(minor)(`reg`) | `flags.canNewMinor`. `minorLimit` 이면 비활성 + "major 를 올리십시오" |
| 삭제(DRAFT, `delete`) | 선택 DRAFT && owner==me(미적용 2개여도 활성) |
| 선점(`lock`) | 선택 DRAFT && owner 없음 && 미적용 1개 |
| 해제(`unlock`) | 선택 DRAFT && owner==me && 미적용 1개. **담당자 역할은 보지 않는다**(ADR-0002 D3 예외 — 아래 §8) |
| 넘기기(`handover`) | 선택 DRAFT && owner==me && 미적용 1개. D2 결정으로 지금은 버튼 자체를 끄고 "넘기기(준비 중)"(`HANDOVER_AVAILABLE`) |
| 확정 이동(이동만, action `confirm`) | 선택 DRAFT && owner==me && 미적용 1개 → `openMdmPage("dmc/codeConfirm",{maruCodeId,ver})` |
| **확정 취소**(`ver-cancel-confirm`, action `delete`, danger) | **서버 판정값 `versions[].cancelConfirmable` 만 따른다**(ADR-0002 D8, TSK-02-01 D4-1). 화면이 적용 시각 경계·미적용 개수·소유자를 다시 계산하지 않는다 — 서버(`CodeEditService.buildView`)가 `RELEASED && apply_from > now && owner==me && 미적용 1개` 로 판정해 내려준다. 확인창(적용 시각 표기·이미 적용된 뒤에는 못 되돌림·취소해도 확정 기록은 남음) → `callMdmOasis("codeEdit","delete",{maruCodeId,ver,rowVersion,target:"CONFIRM"})`. 성공: "확정을 취소했습니다" → 목록 재조회 |
| **코드 편집**(이동만, action `view`, `ver-item-edit`) | **버전을 하나 고르면 늘 활성**(2026-09-28 D-101 — 옛 itemEdit·cateEdit 두 버튼을 하나로 줄였다. 편집 가능 여부는 `codeItemEdit` 화면이 스스로 판단해 읽기 전용으로 연다). 권한은 쓰기 액션이 아닌 `view` 로 본다 — `MdmPermissions.READ_ACTIONS` 에 있어 DMC 그룹의 STD_ADMIN(READ)·STEWARD(CONFIRM) 모두 통과한다, EXTERNAL 원천 등 `editable=false` 여도 켠다 → `openMdmPage("dmc/codeItemEdit",{maruCodeId,ver})` |
| 저장(`header-save`, 옛 "경미 수정 저장") | 미적용 < 2 |
| 폐기(`header-deprecate`, action `execute`) | `!flags.neverReleased` 일 때만 보인다. 저장 상태 ≠ DEPRECATED && 미적용 0(확인 "폐기하면 새 버전을 만들 수 없습니다. 폐기할까요?") |
| **삭제**(`header-delete-code`, action `delete`, danger) | **`flags.neverReleased` 가 true 일 때만 [폐기] 자리에 보인다**(2026-09-28 D-102). `flags.canDeleteCode && canDoButton(rbac,"codeEdit","delete")` 로 켠다. 확인 "이 마루 코드를 삭제하면 되돌릴 수 없습니다. 삭제할까요?" → `callMdmOasis("codeEdit","delete",{maruCodeId,auditVer,target:"CODE"})`. 응답 `{deleted:"CODE",maruCodeId}`. 성공: "삭제했습니다" → (삭제한 코드가 아직 선택돼 있을 때만) 선택을 비우고 목록을 다시 조회 |

미적용 버전이 있어 새버전이 비활성이면 안내 "미적용 버전 {label} 이 있어 새 버전을 만들 수 없습니다". RELEASED·CANCELLED
행을 고르면 코드 편집·확정 취소 말고 버전 조작 버튼은 모두 비활성이다. **예외: `cancelConfirmable=true` 인 미래 적용
RELEASED 행은 확정 취소만 켠다**(D8).

선택과 상세의 정합(2026-09-28 검토 반영): 목록 강조와 상세·쓰기 대상은 늘 같은 코드다. 코드를 바꾸면 이전 코드의
상세·버전 선택·열린 모달을 바로 비우고, 상세 조회·쓰기 응답은 요청 순번이 지금 것과 다르면 버린다(늦게 온 이전 코드
응답이 화면을 덮지 않는다). 조회가 실패하면 오류 모달을 보이고 선택을 비운다. 버튼 잠금(busy)은 진행 중인 요청 수로
센다. 쓰기(저장·폐기·새 버전·DRAFT 액션·코드 삭제·등록)가 진행 중이면 목록 행 클릭(↑/↓ 이동 포함)은 받지 않는다 —
누른 쓰기의 결과(토스트, MDM001 모달 뒤 다시 불러오기)를 그 코드 위에서 보이기 위해서다. handoff 는 쓰기 중에도 받는다.

새 버전 모달: 종류(major/minor, 불가한 쪽 비활성), 새 번호(`nextMajor`/`nextMinor`, 서버 값), 내용("빈 버전" 또는
RELEASED 버전마다 "v1.001 내용으로 채우기(복원)"), 안내 "가장 큰 번호는 확정 취소된 버전과 작성 중 버전을 포함한다. 복원은 원본과
현재의 차이를 DRAFT 에 채운다". [확인] → 빈 버전이면 `reg`, 복원이면 `restore`. 넘기기 모달: 받는 사람 사용자 ID →
`handover`.

## 8. 서버 규칙 요약(design §5·§6.7·§6.8)

| 규칙 | 오류 |
|---|---|
| 모든 쓰기 액션은 담당자 역할(I12). **단 해제(`unlock`)만 예외다** — ADR-0002 D3 "해제·넘기기·저장·삭제·확정은 소유자만 한다. 관리자 강제 해제·넘기기는 없다. 소유권은 역할이 아니라 `owner_id` 로 판정하고" 에 따라 `OWNER_ID` 가 나인 DRAFT 는 담당자 역할이 없어도 풀 수 있다(공통 `DefaultDraftOwnershipService`·룰 영역 `RuleVersionService.unlock` 과 같은 판정). 이 게이트가 있으면 `OWNER_ID='admin'` 인 PROC_CD 2.000 DRAFT 를 소유자 본인(admin)이 자기 잠금을 영영 못 풀었다 — 서버 MDM013 + 화면 `buttons.ts` 의 `unlock` 비활성. 원천 MDM(I8)·소유자 일치·미적용 1개(I6·D7) 조건은 그대로 둔다 | MDM013 |
| 원천이 MDM 이 아닌 코드는 모든 쓰기 거부(I8) | MDM021 |
| ID 형식 `^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`, 1~50자, 점·콤마·공백 없음(등록, design D8) | MDM021 |
| ID 이름 공간 — TB_MDM_CODE·TB_MDM_DATA 어디에도 없을 것(등록, I10) | MDM011 "마루 코드·마루 데이터에 같은 ID 가 있습니다" |
| 등록: 담당자 가드 → 입력 정규화 → ID·이름·계층 칸 수·원천 검증 → 중복 검사 → `TB_MDM_CODE`(CREATED, MDM) → `TB_MDM_CODE_VER`(1.000, DRAFT, MAJOR, OWNER_ID=요청 사용자, ROW_VERSION 0) → `TB_MDM_CODE_CATE`(BASE, REGEX `.*`, CODE, from 1.000, to 9999). 세 INSERT 는 트랜잭션 하나(I7) | |
| 미적용 2개 이상: 헤더 저장·폐기·삭제·선점·해제·넘기기 거부, 새 버전 거부, DRAFT 삭제·조회 허용(I6, D7) | MDM007 / 새 버전 MDM006 |
| **확정 취소**(D8): 담당자 가드(I12) → 소유자 → row_version → RELEASED 여부 → 미래 적용(`apply_from > now`, 경계 포함) 순으로 검사. `RELEASED` 가 아니면 MDM002(문구 "확정(RELEASED)된 미래 적용 버전만 확정 취소할 수 있습니다"), 이미 적용됐으면 MDM025. 성공: `DRAFT`·`apply_from/to` NULL·`row_version`+1, 확정 칸(`requested_*`·`released_at`)은 남김, 직전 RELEASED 의 `apply_to` 는 `9999-12-31` 로 복회(확정 때 닫힌 값과 다르면 MDM001 로 멈춤), 상위 CREATED/INUSE 불변 | MDM002 / MDM025 / MDM001 / MDM003 / MDM013 |
| 새 버전·복원: 미적용(DRAFT 또는 미래 적용 RELEASED)이 있으면 거부(I5) | MDM006 |
| 채번: major = floor(max)+1, minor = max+0.001(소수부 999 상한 "major 를 올리십시오"), max 는 CANCELLED·DRAFT 포함 전체, major 상한 9998, 버전이 없으면 major 1.000 만 + BASE 재생성(I1~I4) | MDM021 |
| 폐기(`execute`): 미적용 0개일 때만(2개 MDM007, 1개 MDM009 "미적용 버전이 있어 폐기할 수 없습니다"), 이미 DEPRECATED 면 MDM009 "이미 폐기된 마루 코드입니다", 행(VER·ITEM·CATE)은 지우지 않는다. 서버는 `neverReleased` 를 따로 보지 않는다 — 그 구분은 화면이 [폐기]/[삭제] 버튼을 고르는 데만 쓴다(D-102). 폐기 뒤 새 버전·복원 MDM009(I13) | |
| 폐기 뒤 CODE_LIST 는 빈 목록, MASTER 판정은 유지(I16) | |
| **코드 삭제(`target:"CODE"`, 2026-09-28 D-102, `CodeEditService.deleteCode`)**: 검사 순서 — 담당자·원천 MDM → RELEASED·CANCELLED 이력 없음("RELEASED 된 적 있으면 삭제 불가, 폐기하세요") → 다른 사용자가 소유한 DRAFT 없음 → `auditVer` 일치 → 이 코드를 참조하는 도메인 없음 → 수신 이력(`TB_MDM_CODE_RECV`) 없음 → `MASTER` 식 참조 없음. 모두 통과하면 자식 표(CATE_ITEM·CATE·ITEM·VER·SYSTEM)부터 `TB_MDM_CODE` 순으로 지운다(목록에서도 사라진다). 되돌릴 수 없다 | 담당자 아님 MDM013, RELEASED 이력·도메인 참조·수신 이력·식 참조 MDM009, 남의 DRAFT MDM004, `auditVer` 충돌 MDM001 |
| 복원: 원본은 RELEASED 이고 새 번호보다 작아야 한다. 세 표(코드·카테고리·CATE_ITEM)를 키로 비교해 차이만 DRAFT 에 채운다(I15) | MDM021 |
| DRAFT 삭제: 세 표에서 `FROM_VER=V` 행 삭제, `TO_VER=V` 행을 9999 로 되돌림(I14) | 소유자 아님 MDM003, rv MDM001 |
| 넘기기 대상은 담당자여야 한다 — 운영은 대상 조회 어댑터가 없어 늘 거부(design D3) | MDM005 |

## 9. 화면 간 이동·인계(handoff)

- 목록 행 클릭 → 같은 탭 오른쪽에 그 코드 상세(새 탭·ComboBox 없음).
- 등록 성공 → 같은 탭 오른쪽에 새 코드 상세.
- [확정 이동] → `openMdmPage("dmc/codeConfirm",{maruCodeId,ver})`.
- [코드 편집] → `openMdmPage("dmc/codeItemEdit",{maruCodeId,ver})`(D-101, 옛 itemEdit·cateEdit 두 이동을 하나로).
- **받는 쪽**(`m-mdm/src/shell/page-handoff.ts`, design §6.10): `useMdmPageParams("dmc/codeMng", tabId, ...)` 로
  `{maruCodeId, ver?}` 를 한 번 받으면 목록을 조회하고 그 코드를(ver 가 있으면 그 버전까지) 고른다. 진입 값 우선순위는
  handoff(한 번만) > snapshot 이고, 받은 값은 자기 snapshot 에도 남겨 새로고침 뒤에도 유지한다(옛 codeEdit 규약 그대로
  옮겼다). 버전 카드에서 고른 ver 도 snapshot 에 남긴다. snapshot 의 코드가 없어졌으면(조회 실패) 오류 모달을 한 번
  보이고 snapshot 의 maruCodeId·ver 를 지운다. `codeConfirm` 등에서 이 화면으로 돌아오는 인계가 있으면 `dmc/codeEdit` 대신 `dmc/codeMng` 를 쓴다.

## 10. 상태 정의

표시 상태는 §3.2 의 계산값이다. 저장 상태 전이(CREATED→INUSE 저장, →DEPRECATED, 코드 삭제)는 이 화면(상세)과
확정(06-05)이 한다.

## 11. 결정 이력

- **2026-09-28 D-101**(`docs/mdm/decisions.md`): 마루 코드 한 건을 다루던 화면 4개(codeMng·codeEdit·codeItemEdit·
  codeCateEdit)를 2개로 줄인다. 이 화면은 그중 codeMng+codeEdit 절반이다 — 목록+상세(헤더·추가 컬럼 라벨·버전 목록)+
  [신규] 등록 폼을 화면 하나로 합치고, 버전 버튼의 [코드 편집]·[카테고리 편집]을 [코드 편집] 하나로 줄여 버전을 고르면
  늘 켠다(편집 가능 여부는 codeItemEdit 이 판단). codeItemEdit+codeCateEdit 절반은 이 작업 밖이다. 서버 서비스·BPMN
  4개는 그대로 두고 codeEdit 는 메뉴 leaf 만 없앤다(OBJECT·역할 매핑은 유지 — 이 화면이 그 서비스를 계속 부른다).
- **2026-09-28 D-102**(`docs/mdm/decisions.md`): 원천 04 「코드 삭제와 마루 코드 폐기」는 물리 삭제 규정이 없어 폐기만
  다루지만, 한 번도 RELEASED 된 적 없는 마루 코드까지 폐기로만 남기면 잘못 등록한 코드가 계속 쌓인다. 확정된 적 없는
  코드는 과거 기준일 판정·배포 사본에 흔적이 없어 행을 남길 이유가 없다(사용자 결정 근거). 그래서 `TB_MDM_CODE_VER`
  에 RELEASED·CANCELLED 행이 없는 코드(버전 0개 포함, `flags.neverReleased`)는 헤더의 [폐기] 자리에 [삭제] 를 보이고
  코드를 통째로 지운다(§7·§8). 한 번이라도 RELEASED 됐으면 지금처럼 폐기만 된다. 원천 04 의 그 절은 이 저장소가
  아니라 다른 저장소(`/Users/jji/project/mdm`)에 있어 아직 못 고쳤다 — decisions.md 가 반영 필요로 남겨 두었다.
