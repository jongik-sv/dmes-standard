---
screenId: commSyncMng
asIsId: CommSyncMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# 동기화 관리 (CommSyncMng) 디자인설계서

> 본 설계서는 [분석리포트](./commSyncMng_분석리포트.md) §0.1.3 단일 원천 + [기능설계서](./commSyncMng_기능설계서.md) §2~§9 기반으로 작성되었다. 신규 컴포넌트 신설 ✗ — 분석/기능 도출 컴포넌트 1:1 반영.

---

## §0. 환경 제약

[분석리포트 §0](./commSyncMng_분석리포트.md#0-환경-제약) 인용.

---

## §0. W5 패턴 축소 적용 (2026-06-04 사용자 검수 Round 2 + 2026-06-04~05 Round 7 btn_close 제거 반영 이력)

> **본 디자인설계서는 commSyncMng Round 2 + Round 7 사용자 검수 결과를 본문 반영한다.** Round 2 변경 카탈로그 4 항목 (W5 축소 적용 / btn_close 추가 / btn_sync pre-disabled 제거 / 자동조회 marker) + Round 7 1 항목 (btn_close 완전 제거 — portal 탭 host 위임) — 상세 이력 = 정합체크서 §J.

### 0.1 W5 A~G 적용 매핑 (csa 8 화면 정책 — 본 화면 축소판)

> **본 화면은 단일 그리드 + 정적 16 행 dataset + Detail 폼 부재 구조**이므로 W5 7 항목 중 **A + E 만 실효**, B/C/G 는 N/A. csa 자동조회 정책은 정적 dataset 노출 marker 로 대체.

| Pattern | 적용 여부 | 적용 위치 | 적용 결과 |
|---|---|---|---|
| **A** PageLayout 단일 그리드 | ✓ (실효) | 본 §1.1 / §2 / §3.2 | `<PageLayout title="동기화 관리" buttons={topButtons}>` + SearchArea + ContentBody **단일 ContentPanel (`flex:1`)** — A-MAIN 16 행 grd_main 1 개만 노출. ContentPanel 분할 ✗ (좌·우 패널 ✗). |
| **B** Detail wrapper | **N/A** | (해당 없음) | 본 화면 Detail 폼 부재 — D-NNN 0 건 (분석 §3.4 / 디자인 §3.5 D 행 ✗). BindItem `setValue`/`watch` 양방향 ✗. |
| **C** Form row (label 140 + input left=143) | **N/A** | (해당 없음) | Detail 부재로 form row 정책 미적용. 조회조건 S-001~S-004 4 컨트롤은 `<SearchField>` 단일 행 (label+input 인라인). |
| **D** Grid | ✓ (실효 — 단일) | 본 §3.2 / §3.6 | `AgDataGrid × 1` (grd_main G-001~G-009 9 col / 16 row 정적). G-002~G-009 read-only / G-001 (CHK) 만 checkbox 편집. 추가 그리드 ✗. |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| **E** Buttons (commonTopButton + 사용자정의) | ✓ (실효) | 본 §3.3 / §5 | **Round 7 (CHG-005): btn_close 완전 제거** — PageLayout `buttons` 배열에서 B-002 entry 삭제 + unused `handleClose` dead code 제거. ToBe 3 버튼 표준 (조회/초기화/저장 — 본 화면은 사용자정의 B-001 "이행" + 화면 자체 토글 B-003 "fold" 2 버튼 + commonTopButton 기본 표준 4 버튼 중 닫기 1 entry 제거). 가이드 §6-E 4 버튼 표준 (조회/초기화/저장/닫기) → ToBe 3 버튼 표준 (조회/초기화/저장). 사유: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼은 의미 ✗. commonLeft / commonRight ✗ (그리드 인라인 ✗). |
| **F** Auto-search (csa 자동조회 정책) | ✓ (marker — transaction ✗) | 본 §1.2 UX-001 marker | **정적 16 행 dataset 이므로 onload transaction 호출 ✗.** AsIs xfdl `gfn_formOnLoad(obj,true)` 등가는 `ds_main.set_rowposition(-1)` (xfdl:104) — ToBe React 는 `INITIAL_SYNC_ROWS` mount 즉시 노출 + `cbo_SyncTarget=-1` 초기화로 등가. **csa 자동조회 정책 (project_csa_cme_iter_propagation) 정합 marker — transaction 미호출 사유 명시 (정적 dataset)**. |
| **G** Detail wrapper overflow + height | **N/A** | (해당 없음) | Detail 부재로 wrapper overflow / height 정책 ✗. ContentPanel 단일 + grd_main `flex:1` 만 적용. |

> **실효 패턴 = A + D + E + F(marker)** (4 항) / **N/A = B + C + G** (3 항). 본 화면은 csa 8 화면 W5 패턴 전파 정책의 **축소 적용판**으로 분류.

### 0.2 변경 카탈로그 (Round 2 — 2026-06-04 / Round 7 — 2026-06-04~05)

| Change | 적용 위치 | As-Is (Round 1) | To-Be (Round 2/7) | 사유 |
|---|---|---|---|---|
| **CHG-001** btn_close 추가 | 본 §3.3 B-002 | (B-002 row 누락 — commonTopButton basic 인용만) | B-002 `btn_close` 명시 등재 — `fn_close` 핸들러 + commonTopButton 자동 주입 표시 | AsIs commonTopButton basic 정합. ToBe 누락 보정 (xfdl:10 / 103 / 249~253) |
| **CHG-002** btn_sync pre-disabled 제거 | 본 §3.3 B-001 / §5 UX-005 | `!pSyncTarget` 사전차단 + isSyncing | **isSyncing 만 유지** — `!pSyncTarget` 사전차단 제거. 핸들러 진입 시 V-001 (OBJECT 검증) + V-002 (cbo_SyncTarget null) 검증 → ErrorModal | feedback_design_thoroughness — 권한 있는 버튼은 항상 활성, 클릭 시 validation (commUserMng J-004 정합) |
| **CHG-003** 자동조회 marker | 본 §1.2 UX-001 / §0.1 F 행 | onload transaction 호출 여부 미명시 | **정적 dataset → transaction ✗ + INITIAL_SYNC_ROWS mount 즉시 노출 marker** 명시 | csa 자동조회 정책 정합 marker (정적 dataset 예외 사유 명시) |
| **CHG-004** W5 패턴 N/A 분기 명시 | 본 §0.1 | (W5 패턴 매핑 미존재) | B/C/G N/A + 사유 (Detail 부재 / 단일 그리드) 명시 | csa 8 화면 W5 패턴 전파 일관성 — N/A 사유 명시로 회귀 방지 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| **CHG-005** btn_close 완전 제거 (Round 7) | 본 §0.1 E 행 / §3.3 B-002 / §5 UX-007 | Round 2 B-002 `btn_close` 명시 등재 (commonTopButton basic 4 의 마지막) | **B-002 row 폐기** — PageLayout `buttons` 배열에서 entry 삭제 + unused `handleClose` dead code 제거. ToBe 3 버튼 표준 (조회/초기화/저장) — 닫기 entry ✗. AsIs xfdl:10 / 103 / 249~253 은 As-Is 잔존 코드로만 명시 (ToBe 미반영). | portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼은 의미 ✗. 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준 변경 (2026-06-04~05 Round 7) |

---

## §1. UX 흐름 개요

### §1.1 화면 구성 다이어그램 (텍스트)

```
┌─────────────────────────────────────────────────────────────────────┐
│ A-TITLE: 동기화 관리 [Bottom Edge buttons: 이행 / 닫기]              │ ← Div div_title (xfdl:6~13)
├─────────────────────────────────────────────────────────────────────┤
│ A-FILTER: [처리유형 ▼ Combo] [처리대상 [Input "AA_TEST"        ]]  │ ← Div div_search (xfdl:14~23)
├─────────────────────────────────────────────────────────────────────┤
│ A-FOLD: [▲ 접기/펴기 토글 버튼]                                       │ ← Button btn_fold (xfdl:24)
├─────────────────────────────────────────────────────────────────────┤
│ A-MAIN: "이행대상 선택"  Label                                       │ ← Div div_main (xfdl:25~68)
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │선택│SOURCE (FROM)              │TARGET (TO)                  │  │
│ ├─┼──┬──┬──┬──┬──┬──┬──┬──┬──┼──┬──┬──┬──┬──┬──┬──┤  │
│ │ ☐│가동계│원장│MEPP_MCM│MCM_SOURCE│가동계│가동│MEPP_MCM│MCMAPUSER│  │ ← MA1
│ │ ☐│가동계│원장│MEPP_MCM│MCM_SOURCE│가동계│백업│MEPP_MCM│MCM_BACKUP│  │ ← MA2
│ │ ... 16 행 (정적 데이터)                                         │  │
│ │ ☐│개발계│가동│DPMESA1_MCM│MCMAPUSER│테스트계│가동│TSTMPH_MCM│MCMAPUSER│ ← NU4
│ └───────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│ A-FOOTER: [bottom status: "{N}건 저장 되었습니다."]                 │ ← Div div_bottom (xfdl:69)
└─────────────────────────────────────────────────────────────────────┘
```

### §1.2 사용자 시나리오 (UX 흐름)

| 단계 | 사용자 액션 | 시스템 반응 | UX-001 ~ UX-005 |
|---:|---|---|---|
| 1 | 화면 진입 | div_search 의 처리유형 콤보 미선택 (index=-1) + edt_Target 기본값 "AA_TEST" 표시. **`INITIAL_SYNC_ROWS` (정적 16 행) mount 즉시 노출 + 모두 CHK=0 — onload transaction 호출 ✗ (정적 dataset 사유 — csa 자동조회 정책 marker, §0.1 F 행 정합)** | UX-001 (form 진입) — xfdl:87~96 / **W5-F marker (Round 2)** |
| 2 | 처리유형 콤보 선택 | onitemchanged 트리거 → 분석 §5.4 분기로 자동 CHK=1 세트 (예: MASTER 선택 시 MA1~MA4 4행 자동 체크, 나머지 자동 해제). 빨간 배경 표시 (cssclass `cellBody_BgColor_red`) | UX-002 (자동 선택) — xfdl:191~246 |
| 3 | (선택) edt_Target 수정 | 기본값 "AA_TEST" 를 실제 동기화 대상 ID 로 수정 (예: "USD" or "csa::CommSyncMng" or "USD,JPY") — 콤마 다중 입력 지원 | UX-003 (대상 수정) — 분석 §4.5 (4) |
| 4 | (선택) 개별 행 CHK 토글 | 자동 선택 결과 + 사용자 수동 토글로 최종 동기화 대상 결정 | UX-004 (수동 조정) — G-001 displaytype=checkboxcontrol |
| 5 | "이행" 버튼 클릭 | (a) OBJECT 검증 → (b) confirm 메시지 "[{처리유형명}] 이행 하시겠습니까?" → (c) OK 시 처리유형 null 재검증 → (d) 트랜잭션 `reg` 호출 (CHK=1 행만 ds_main:U 전송) | UX-005 (실행) — fn_sync xfdl:121~168 |
| 6 | 트랜잭션 응답 | cnt_save==0: warning "데이터 이행 미처리 되었습니다." / cnt_save > 0: bottom status "{N}건 저장 되었습니다." + info 모달 "데이터 이행 정상완료 되었습니다." / error: bottom status 에 strErrorMsg | UX-006 (응답) — fn_callBack xfdl:171~189 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| ~~7~~ | ~~(선택) "닫기" 버튼~~ | **Round 7 (CHG-005): step 폐기** — btn_close 완전 제거로 본 사용자 step ToBe 미적용. portal 탭 close 는 host 가 처리. | ~~UX-007~~ — Round 7 폐기 |
| 8 | (선택) "접기" 버튼 | btn_fold 토글 — div_search 영역 접기/펴기 | UX-008 (조회조건 접기) — xfdl:255~258 |

---

## §2. 영역 구성 (Layout)

> 분석 §3.1 인용 — 5 영역 (가이드 5 표준 영역 enum + A-TITLE / A-FOOTER 2 추가 — 사용자 결정 가이드 §외 신설 ✗ 적용).

| 영역 ID | 컨테이너 | 좌표 / 크기 | 역할 | 근거 |
|---|---|---|---|---|
| A-TITLE | `Div div_title` | top=0 / height=40 / left=20 / right=20 | 화면 타이틀 + 공통 topMenu (이행 / 닫기 버튼) | xfdl:6~13 |
| A-FILTER | `Div div_search` | top=`div_title:10` / height=43 / left=20 / right=20 / cssclass=`div_WFSA_Box` | 조회조건 (처리유형 + 처리대상) | xfdl:14~23 |
| A-FOLD | `Button btn_fold` | top=93 / height=10 / left=20 / right=20 / cssclass=`btn_WFSA_Fold` | 조회조건 접기/펴기 토글 | xfdl:24 |
| A-MAIN | `Div div_main` | top=`btn_fold:5` / bottom=40 / left=20 / right=20 | 이행대상 선택 그리드 영역 (Label `이행대상 선택` 30 + Grid `grd_main` 25~bottom) | xfdl:25~68 |
| A-FOOTER | `Div div_bottom` | bottom=0 / height=20 / cssclass=`div_WF_Footer` | 공통 bottom status | xfdl:69 |

---

## §3. 컴포넌트 카탈로그 (UX-NNN 매핑)

### §3.1 조회조건 (S-NNN — 기능 §2 동치)

| S-ID | xfdl id | React 컴포넌트 (To-Be 추정) | 표시 텍스트 | 컨트롤 종류 | 데이터 / LoV | 이벤트 |
|---|---|---|---|---|---|---|
| S-001 | `stc_bizSystemCode` | `<Label>` | "처리유형" | Label (read-only) | - | - |
| S-002 | `cbo_SyncTarget` | `<Select>` | (선택) | Combo (6 LoV) | ds_lovSyncTarget (정적 6 행 — §9 LV-001) | onChange → 자동 행 선택 (분석 §5.4) |
| S-003 | `sts_roleId` | `<Label>` | "처리대상" | Label (read-only) | - | - |
| S-004 | `edt_Target` | `<TextInput>` (font 14pt) | (입력) | TextBox | 기본값 "AA_TEST" / maxlength 200 | - (변경 검증 ✗ — 클릭 시 일괄 검증) |

### §3.2 그리드 (G-NNN — 기능 §3 동치)

| G-ID | xfdl bind | head text | width | edit | css | 비고 |
|---|---|---|---|---|---|---|
| G-001 | CHK | 선택 (col=0) | 20px | checkbox | CHK=1 시 red bg | 단일 편집 컬럼 |
| G-002 | from1 | SOURCE (FROM) col 1 colspan=4 | 80px | (read-only) | CHK 동기화 red | "가동계" 등 정적값 |
| G-003 | from2 | (colspan 흡수) | 80px | (read-only) | (동일) | "원장" 등 |
| G-004 | from3 | (colspan 흡수) | 80px | (read-only) | (동일) | DB Link 명 |
| G-005 | from4 | (colspan 흡수) | 80px | (read-only) | (동일) | 스키마명 |
| G-006 | to1 | TARGET (TO) col 5 colspan=4 | 80px | (read-only) | (동일) | "가동계" 등 |
| G-007 | to2 | (colspan 흡수) | 80px | (read-only) | (동일) | "가동/원장/백업" |
| G-008 | to3 | (colspan 흡수) | 80px | (read-only) | (동일) | DB Link 명 |
| G-009 | to4 | (colspan 흡수) | 80px | (read-only) | (동일) | 스키마명 |

> head Row size=30, body Row size=24, head 폰트 Bold 16px Malgun Gothic, body 폰트 14px + CHK=1 시 빨간 배경.

### §3.3 버튼 (B-NNN — 기능 §5 동치)

| B-ID | xfdl id | 표시명 | 위치 | cssclass | 동작 |
|---|---|---|---|---|---|
| B-001 | `btn_sync` | "이행" | div_topMenu (사용자정의) | `btn_WF_Point, btn_WF_confirm` (Point + Confirm 강조) | fn_sync — 트랜잭션 `reg`. **Round 2 (CHG-002): pre-disabled (`!pSyncTarget`) 제거 — `isSyncing` 만 유지. 핸들러 진입 시 V-001 (OBJECT) + V-002 (cbo_SyncTarget null) 검증 → 미충족 시 ErrorModal. (commUserMng J-004 정합 — 권한 있는 버튼은 항상 활성)** |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| ~~B-002~~ | ~~`btn_close`~~ | ~~"닫기"~~ | ~~div_topMenu~~ | ~~(commonTopButton 표준)~~ | **Round 7 (CHG-005): B-002 row 폐기** — PageLayout `buttons` 배열에서 entry 삭제 + unused `handleClose` dead code 제거. ToBe 3 버튼 표준 (조회/초기화/저장) — 본 화면은 B-001 (이행) + B-003 (fold) 만 잔존. 사유: portal 탭 close 는 host 가 처리. AsIs xfdl:10 (commonTopButton include) + 103 (btn_close text=닫기) + 249~253 (fn_close `gv_AppTabPath.form.fn_closeForm()`) 은 As-Is 잔존 코드로만 명시 — ToBe 미반영. |
| B-003 | `btn_fold` | (text 없음, 접기 토글) | div_main 상단 | `btn_WFSA_Fold` | gfn_fold |

### §3.4 GB-NNN (그리드 인라인 버튼)

해당 없음 — 분석 §4.2 동치.

### §3.5 라벨 / 외부 컴포넌트

| 위치 | xfdl id | 컴포넌트 | 표시 텍스트 | 근거 |
|---|---|---|---|---|
| div_title 좌측 | `edt_title` | Label (edi_WFHD_Title) | "동기화 관리" | xfdl:9 |
| div_topMenu | (외부 url include) | `_com_div::commonTopButton.xfdl` | (B-001 / B-002 자동 배치) | xfdl:10 |
| div_main 상단 | `edt_rol_list` | Label (edi_WF_Title1) | "이행대상 선택" | xfdl:28 |
| div_bottom | (외부 url include) | `_com_div::commonBottomStatus.xfdl` | (status 메시지) | xfdl:69 |

### §3.6 ds_main 정적 데이터 16 행 (G-NNN 표시 데이터)

> 분석 §3.7 DS-001 표 인용 — 본 디자인설계서는 표시 형태만 명시. **To-Be 결정**: xfdl 자산 폐기 + React State 상수 `INITIAL_SYNC_ROWS` 16 행 정적 (수정 빈도 매우 낮음 — DB master code 화 불필요).

| targetid | (FROM 4 컬럼) | (TO 4 컬럼) |
|---|---|---|
| MA1 | 가동계 / 원장 / MEPP_MCM / MCM_SOURCE | 가동계 / 가동 / MEPP_MCM / MCMAPUSER |
| MA2 | (동일 FROM) | 가동계 / 백업 / MEPP_MCM / MCM_BACKUP |
| MA3 | (동일 FROM) | 개발계 / 가동 / DPMESA1_MCM / MCMAPUSER |
| MA4 | (동일 FROM) | 테스트계 / 가동 / TSTMPH_MCM / MCMAPUSER |
| RA1~RA4 | 가동계 / 원장 / MEPP_MCM / MCA_SOURCE | (대응) |
| RB1~RB4 | 가동계 / 원장 / MEPP_MCM / MCB_SOURCE | (대응) |
| NU1~NU4 | 개발계 / 가동 / DPMESA1_MCM / MCMAPUSER | (대응) |

> 분석 §3.7 의 정적 16 행 표 동치.

---

## §4. 컴포넌트별 상세 스타일

### §4.1 cssclass 매핑

| xfdl cssclass | 의미 | To-Be Tailwind / shadcn 추정 |
|---|---|---|
| `edi_WFHD_Title` | 화면 타이틀 Edit (read-only label) | `text-2xl font-bold` |
| `div_WFSA_Box` | 조회조건 박스 (그레이 배경) | `bg-slate-100 rounded p-2` |
| `edi_WFSA_Label` | 조회조건 라벨 Edit (read-only) | `text-sm font-medium` |
| `btn_WFSA_Fold` | 접기 토글 버튼 | `cursor-pointer h-2 bg-gradient-to-b from-slate-300` |
| `edi_WF_Title1` | 그리드 상단 타이틀 Edit | `text-base font-semibold` |
| `div_WF_Footer` | 하단 status 박스 | `bg-slate-200 text-xs px-2` |
| `btn_WF_Point` | Point 강조 버튼 | `bg-orange-500 text-white` |
| `btn_WF_confirm` | Confirm 강조 (조합) | `font-semibold` |
| `cellBody_BgColor_red` | 셀 빨간 배경 (CHK==1) | `bg-red-100` |
| `cellControl_fontSize_14` | 셀 폰트 14px | `text-sm` |

### §4.2 자료형 / 표시 형식

> 기능 §3.2 동치 — 모든 컬럼 STRING(256) (xfdl Dataset Columns 정의 그대로).

---

## §5. 이벤트 매트릭스 (UX-NNN)

> 분석 §4.4 28 메서드 표를 UX 이벤트로 매핑 — mui 환경 (xfdl + java) 등가 + 클라이언트/서버 분리.

| UX-ID | 이벤트 | 트리거 | 처리 | 트랜잭션 | 근거 |
|---|---|---|---|---|---|
| UX-001 | Form onload | 화면 진입 | gfn_formOnLoad → fn_button (commonTopButton 등록) + ds_main.set_rowposition(-1). **Round 2 (CHG-003): ToBe React = `INITIAL_SYNC_ROWS` (정적 16 행) mount 즉시 노출 + `cbo_SyncTarget=-1` 초기화. onload transaction 호출 ✗ — 정적 dataset 사유 (csa 자동조회 정책 marker 정합, §0.1 F).** | - | xfdl:87~96 / 92~96 / 99~104 |
| UX-002 | Combo onChange (S-002) | cbo_SyncTarget 선택 변경 | 분석 §5.4 분기로 ds_main 의 CHK 자동 세트 (MA/RA/RB/NU prefix 매칭) | - (클라이언트) | xfdl:191~246 |
| UX-003 | TextBox onChange (S-004) | edt_Target 입력 | (validation ✗ — 클릭 시 일괄 검증) | - | xfdl:20 |
| UX-004 | Grid cell click (G-001 CHK) | grd_main CHK 셀 클릭 | checkbox 토글 (xfdl default) | - | xfdl:53 |
| UX-005 | Button Click (B-001 "이행") | btn_sync onclick | fn_sync — 5 단계 (분석 §4.5). **Round 2 (CHG-002): pre-disabled (`!pSyncTarget`) 제거 — 핸들러 진입 시 V-001 (OBJECT "::" 포함 검증 → MSG-001 error 모달) + V-002 (cbo_SyncTarget null 검증 → MSG-003 warning 모달) 즉시 차단. `isSyncing` 토글만 disabled 잔존 (transaction 진행 중 중복 클릭 방지).** | reg | xfdl:121~168 |
| UX-006 | Transaction Callback | gfn_transaction 응답 | fn_callBack — cnt_save 분기로 메시지 표시 | reg 콜백 | xfdl:171~189 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| ~~UX-007~~ | ~~Button Click (B-002 "닫기")~~ | ~~btn_close onclick~~ | **Round 7 (CHG-005): UX-007 폐기** — B-002 row 삭제로 본 UX 이벤트 ToBe 미적용. portal 탭 close 는 host 가 처리. As-Is fn_close (xfdl:249~253) 는 As-Is 잔존 코드로만 명시 — ToBe 핸들러 ✗ (unused `handleClose` dead code 제거). | - | xfdl:249~253 (As-Is 만) |
| UX-008 | Button Click (B-003 fold) | btn_fold onclick | gfn_fold — div_search 접기/펴기 토글 | - | xfdl:255~258 |

---

## §6. 메시지 / 다이얼로그

> 분석 §4.5 + §10.4 + java:217/246/515 인용 — UX-009 ~ UX-016 모달/메시지 8 종.

| ID | 표시 메시지 | 트리거 위치 | 다이얼로그 유형 | 결과 처리 |
|---|---|---|---|---|
| MSG-001 | "OBJECT FULLNAME을 입력해주세요. \n ex)csa::CommSyncMng" | fn_sync 진입 시 OBJECT + "::" 미포함 | error 모달 | return (트랜잭션 진행 ✗) |
| MSG-002 | "[{처리유형명}] 이행 하시겠습니까?" | fn_sync 의 cbo_SyncTarget 값 존재 시 | confirm 모달 | OK → 콜백 fn_msgSaveCallBack 진입 / Cancel → return |
| MSG-003 | "처리유형을 선택하세요." | fn_msgSaveCallBack 진입 시 cbo_SyncTarget null | warning 모달 | return |
| MSG-004 | "데이터 이행 미처리 되었습니다." | fn_callBack 의 cnt_save==0 | warning 모달 | return |
| MSG-005 | "{N}건 저장 되었습니다." | fn_callBack 의 cnt_save > 0 | bottom status (모달 ✗) | (이어서 MSG-006) |
| MSG-006 | "데이터 이행 정상완료 되었습니다." | fn_callBack 의 cnt_save > 0 (MSG-005 다음) | info 모달 | (정상 종료) |
| MSG-007 | "{strErrorMsg}" (server error 그대로) | fn_callBack 의 nErrorCode != 0 | bottom status (모달 ✗) | (에러 표시만) |
| MSG-008 | "DB링크로 인해 LOCAL에서 실행할 수 없습니다." (As-Is) | java:515 — As-Is 서버 LOC + OBJECT 처리유형 (As-Is). **To-Be (Q-005 해소): DB Link 폐기로 차단 사유 ✗ → LOC 차단 폐기 → 본 MSG 사용 ✗.** As-Is 메시지는 §10.5 인용 보존 (코드 잔존). | (server UserException → FE error 모달 표시 — As-Is). **To-Be: MSG 사용 ✗** | return (트랜잭션 실패 — As-Is 동작) |
| MSG-009 | "인천 업무기준 관리 대상입니다. \r\n[인천 MES]에서 이행 부탁드립니다." | java:224 — RULE/RULE_JUDGE + 인천 차단 대상 OBJECT | (server UserException → FE error 모달 표시) | return |
| MSG-010 | "존재하지 않는 업무기준 입니다." | java:246 — RULE/RULE_JUDGE + 테이블 미존재 (Mapper update 실패) | (server UserException → FE error 모달 표시) | return |

> MSG-001 / MSG-002 / MSG-003 / MSG-004 / MSG-006 은 xfdl `gfn_message` (modal) / MSG-005 / MSG-007 은 `gfn_commonBottomStatus_msg` (모달 ✗) / MSG-008 ~ MSG-010 은 java UserException → FE error 모달.

---

## §6.14 4질문 검증 (Phase 3 종료)

| # | 질문 | 답변 |
|---|---|---|
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 1 | 14항 위반? | ✗ (분석/기능 단일 원천 / 컴포넌트 신규 신설 ✗ — UX-001~UX-008 + MSG-001~MSG-010 모두 분석/기능 원천 매핑 / cite file:line / 가이드 5 표준 영역 + A-TITLE/A-FOOTER 2 추가는 사용자 결정 신설 / Q 10건 해소 갱신 반영 — 2026-05-31 / Round 2 W5 축소 적용 + 변경 카탈로그 4 항목 본문 반영 — 2026-06-04 / **Round 7 btn_close 완전 제거 + CHG-005 본문 반영 — 2026-06-04~05**) |
| 2 | 검증 안 한 부분? | ✗ (영역 5 + S 4 + G 9 + B 3 + GB 0 + 라벨 4 + 정적 데이터 16 + cssclass 10 + UX 8 + MSG 10 모두 등재 / §0.1 W5 7 항목 매핑 (실효 4 + N/A 3) + §0.2 변경 카탈로그 5 항목 모두 등재 / **Round 7 영향 § (§0.1 E 행 / §0.2 CHG-005 / §3.3 B-002 폐기 / §5 UX-007 폐기 / §1.2 step 7 폐기) 5 § 모두 갱신**) |
| 3 | 그대로 수용? | ✗ (분석 §3.4/§3.5/§3.6/§4.2/§5 의 "해당 없음" 5 회 명시 / MSG-008 LOC 차단 메시지 To-Be 사용 ✗ 명시 — Q-005 해소 / W5 N/A 분기 3 항 (B/C/G) 사유 명시 / **Round 7 ToBe 3 버튼 표준 (조회/초기화/저장) 명시 — 가이드 §6-E 4 버튼 표준 from 변경 / B-002 row 취소선 보존 + As-Is xfdl:10/103/249~253 As-Is 잔존 코드로만 명시**) |
| 4 | 임의 합리화? | ✗ ("주요/대표/등" 0 회 / shadcn / Tailwind 추정 표기는 "(To-Be 추정)" 명시 / 정적 데이터 16 행은 분석 §3.7 표 동치 보존 / W5 패턴 매핑은 csa 8 화면 전파 정책 정합 인용 / **Round 7 btn_close 제거 사유 = portal 탭 host 위임 명시 인용 — 임의 합리화 ✗**) |

> Phase 3 통과 — Phase 4 진입. **2026-05-31 Q 10건 해소 갱신 반영 완료. 2026-06-04 Round 2 W5 축소 적용 + 변경 카탈로그 4 항목 본문 반영 완료. 2026-06-04~05 Round 7 btn_close 완전 제거 (CHG-005) — §0.1 E 행 + §0.2 + §3.3 B-002 + §5 UX-007 + §1.2 step 7 갱신 완료.**
