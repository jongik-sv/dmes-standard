---
screenId: commMenuMng
asIsId: CommMenuMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# 메뉴 관리 정합체크서

> 본 정합체크서는 4 종 설계서 (분석/기능/디자인/BPMN) 작성 후 작성되었다. **§A ~ §F 6 개 절 모두 ✓ 일 때만 설계 완료** 로 판정한다 (사용자 요구사항 11). §G 활성 확인필요 = 0 건 (사용자 결정 완료 — 분석 §12 결정 누적 표 참조).
> **환경 제약 (사용자 결정 [§10])**: Runner / R14-Step0 / manifest 9 파일 검증 미적용 — 본 §D.4 = ✗ + 사유 명시.

---

## §A. 구조 동일성 + 누락 검증

### A.1 구조 동일성 (절 순서 / 표 헤더 / "해당 없음" 유지)

| 검증 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 결과 | 사유 |
|---|---|---|---|---|---|---|
| 절 순서 (## 헤더) — 사용자 요구사항 §1~§13 / §1~§10 / §1~§7 / §1~§7 와 동일 | ✓ | ✓ | ✓ | ✓ | ✓ | 사용자 요구사항 [5종 산출물 구조] 그대로 |
| 표 헤더 (컬럼명·수·순서) — 분석리포트 §3~§9 의 컬럼 헤더가 4 설계서에 동일 적용 | ✓ | ✓ | ✓ | ✓ | ✓ | - |
| "해당 없음" 유지 (기능 §4.2 L-NNN 해당 없음 / 디자인 §5.5 GB 해당 없음 / 분석 §4.2 GB 해당 없음 / 분석 §7 Java UserTask 부재 명시) | (해당 없음) | ✓ | ✓ | (해당 없음 — Java UserTask 부재 §3 명시) | ✓ | - |
| 임의 ## 헤더 추가 (사용자 요구사항 [§11] 가이드 §외 임의 신설 금지) | ✓ (§0 환경 제약 = 사용자 요구사항 §10에 의해 신설) | ✓ | ✓ | ✓ | ✓ | §0 환경 제약은 사용자 요구사항으로 명시 신설 |
| frontmatter 6 필드 (screenId/asIsId/moduleId/moduleGroup/작성일/작성자) | ✓ | ✓ | ✓ | ✓ | ✓ | 4 산출물 모두 동일 frontmatter |
| **A-T1A**: 분석리포트 §3.1 영역 수 11 (5 표준 + 6 추가: A-TITLE / A-FOOTER / A-FOLD / A-MAIN-TREE / A-MAIN-LIST / A-MAIN-DETAIL / A-MAIN-OBJECT / A-MAIN-LEFTMENU / A-MAIN-RIGHTMENU) | ✓ | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | div_main 내 3 분할 (트리/리스트/상세) + OBJECT 그리드 분할 + 좌/우 공통 메뉴 분할 |
| **A-R12-1**: 사전 판정표 5 종 (분석 §0.1~§0.5) | ✗ (사용자 §10 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: Runner / R-14 manifest 미적용 — 사용자 결정 (§0). 본 분석은 mui 자료 직접 grep 으로 진행 — 사전 판정표 5 종 형식이 mui 환경에 부적합 |
| **A-R12-2**: 예시 행 + 본 화면 마커 분리 — mui 환경에서는 예시 행 없이 본 화면만 작성 | ✓ | ✓ | ✓ | ✓ | ✓ | mui 자료 직접 등재만 |
| **A-R12-3**: 외부 호출 D1~D3 추적 — mui 환경에서는 D1 (xfdl) + D2 (Mapper.xml SQL) + D3 외부 mapper 참조 (CommObjMngMapper) | ✓ (Java D1.5 부재 + D2 As-Is 8 / To-Be 7 SQL — selectCommRoleGrpList To-Be 제거 + D3 외부 mapper As-Is 1 / **To-Be 0** 종 — cross-cutting 정책 #1 폐기) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | D3 외부 mapper 참조 (CommObjMngMapper.selectAppHostId) As-Is 1 종 / To-Be 0 종 (cross-cutting 정책 #1 적용) |
| **A-R12-4**: 이벤트 12종 매트릭스 — mui 환경은 xfdl 이벤트 (onclick / oncellclick / onheadclick / onitemchanged / onmousemove / onkillfocus / onrowposchanged / onload 등) | ✗ (mui 표준 12종 매트릭스 미적용) | (해당 없음) | (해당 없음) | (해당 없음) | ✗ + 사유 | **사유**: WinForms 12 이벤트 (Click/DoubleClick/CellClick/...)는 xfdl 등가 ✗. 분석 §4.4 의 메서드 표 28 행 + onload 보조 + inline 1 = 30 행으로 등가 충족 |
| **A-R12-5**: SP 분기 매트릭스 — mui 환경은 SP ✗ → Mapper.xml SQL ID 매트릭스 (§6) 로 등가 | ✓ (§6 8 SQL 전수) | (해당 없음) | (해당 없음) | (해당 없음) | ✓ | - |
| **A-R12-6**: 자유 서술 0 — 분석 §1 화면 목적은 패턴 1 enum 적용 + 본문 모두 표 분해 | ✓ | ✓ | ✓ | ✓ | ✓ | - |

> **§A.1 결과**: A-R12-1 + A-R12-4 2 행은 사용자 결정 ([§10] 환경 제약)으로 ✗ + 사유 명시. 나머지 모두 ✓.

### A.2 누락 검증 (분석리포트 §13 매트릭스 합 일치)

| 분석 원천 | 분석리포트 발견 수 | 기능설계 반영 수 | 디자인설계 반영 수 | BPMN설계 반영 수 | 코드 구현 수 (To-Be 미구현) | 확인필요 수 | 제외 수 | 합 일치 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 조회조건 (S-NNN) | As-Is 4 / To-Be 3 | 4 (As-Is 보존 + S-001 폐기 marker) | 4 (좌표 As-Is 보존 + S-001 폐기 marker) | (해당 없음) | - | 0 | 1 (S-001 cross-cutting 정책 #1 폐기) | ✓ |
| 그리드 컬럼 (G-NNN — 메뉴 리스트) | 12 | 12 | 12 | (해당 없음) | - | 0 | 0 | ✓ |
| 트리 컬럼 (GT-NNN — 메뉴 트리) | 1 | 1 | 1 | (해당 없음) | - | 0 | 0 | ✓ |
| OBJECT 그리드 (GO-NNN) | As-Is 9 / To-Be 8 | 9 (As-Is 보존 + GO-008 폐기 marker) | 9 (As-Is 보존 + GO-008 폐기 marker) | (해당 없음) | - | 0 | 1 (GO-008 cross-cutting 정책 #1 폐기) | ✓ |
| 상세 필드 (D-NNN) | 18 | 18 | 18 | (해당 없음) | - | 0 | 0 | ✓ |
| 라인 필드 (L-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 버튼 (B-NNN) | 14 (top 4 + left 3 + right 5 + fold 1 + 등록 ✗ 1) | 14 | 14 | (해당 없음) | - | 0 | 0 | ✓ |
| 그리드셀 인라인 (GB-NNN) | 0 | 0 | 0 | (해당 없음) | - | 0 | 0 | ✓ |
| 팝업/탭/연동 (P-NNN) | 1 (dynamic LoV) | 1 | 1 | (해당 없음) | - | 0 | 0 | ✓ |
| 외부 인입 Div (FX-NNN) | 8 (topMenu/leftMenu/rightMenu/bottom/object_id + 3 표시 전용) | (참조만) | (해당 없음 — 디자인 §5.1~§5.3 인용) | (해당 없음) | - | 0 | 0 | ✓ |
| 상태값 (ST-NNN) | 7 | 7 | (해당 없음) | (해당 없음) | - | 0 | 0 | ✓ |
| 코드값/LoV (LV-NNN) | As-Is 7 / To-Be 6 | (참조만) | (참조만) | (해당 없음) | - | 0 (cross-cutting 정책 #1 — LV-004 폐기로 외부 CommObjMngMapper 참조 해소) | 1 (LV-004 cross-cutting 정책 #1 폐기) | ✓ |
| Dataset (DS-NNN) | As-Is 9 / To-Be 8 (ds_menuList / ds_menuTreeList / ds_cboUseYn / ds_menuGrp / ds_menuGrpSub / ds_objMng / ~~ds_lovSubSystem~~ / ds_menuViewYn / cbo_menu_tp 내부 innerdataset) | (참조만) | (참조만) | §5 DTO 매핑 | - | 0 | 1 (DS-007 cross-cutting 정책 #1 폐기) | ✓ |
| Bind (BindItem) | 13 | (참조만) | (좌표 참조) | (해당 없음) | - | 0 | 0 | ✓ |
| Script 메서드 (xfdl) | 30 (named 26 + onload 보조 + inline fn_msgSuccessSave 1) | 메서드별 V/UX cite | (UX cite) | (참조만) | - | 0 (등록 ✗ 함수 3 종 To-Be 제거 결정 + cross-cutting 정책 #1 — fn_lov xfdl:418 추가 폐기) | **4** (div_search_btn_fold_onclick / fn_linkCommMenu / fn_openMenu / **fn_lov** — cross-cutting 정책 #1 추가) | ✓ |
| Mapper.xml SQL ID | 8 | As-Is 7 / To-Be 7 활성 (cross-cutting 정책 #1 은 SQL 분기/컬럼만 폐기, SQL ID 폐기 ✗ — selectAppHostId 만 cross-namespace 호출 폐기) | (해당 없음) | 8 (§6.4 sqlKey) | - | 0 (미사용 1 SQL To-Be 제거 결정 + cross-cutting 정책 #1 cross-namespace 호출 1 종 폐기) | 1 (selectCommRoleGrpList 제거) | ✓ |
| BPMN 노드 / SequenceFlow | As-Is 9 / To-Be 8 노드 (Task_1z04i9v 폐기) / As-Is 13 / To-Be 11 flow (0ug4lxk + 1azff5q 폐기) | (해당 없음) | (해당 없음) | 9 / 13 (§2 전수 As-Is 보존 + To-Be 폐기 marker) | - | 0 | 1 노드 + 2 flow (cross-cutting 정책 #1) | ✓ |
| Java UserTask 클래스 | 0 (부재 명시) | (해당 없음) | (해당 없음) | 0 (§3.1 부재 명시) | - | 0 | 0 | ✓ |
| 사용 테이블 | 5 (TB_MCM_SEC_MENU 15+9 audit / TB_MCM_SEC_OBJ 11+9 audit / TB_MCM_SEC_MENU_FLD 5+9 audit / TB_MCM_SEC_ROLEGROUP 미사용 / TB_MCM_SEC_USER_MAPPING 미사용) | (참조만) | (해당 없음) | (참조만) | - | 0 | 2 (미사용 테이블 2 종 — 본 화면 §9.4 영향 ✗ 명시) | ✓ |

> **§A.2 결과**: 모든 행 합 일치 — 발견 = 반영 + 확인필요 + 제외.

### A.3 manifest 행 수 ↔ 산출물 행 수 검증

| 항목 | 결과 | 사유 |
|---|---|---|
| Runner classify.trace.json items[] 카운트 ↔ 분석.template 행 수 | **✗ (검증 미실시)** | 사용자 결정 [§10] — Runner config mui 미지원 으로 manifest 9 파일 미생성. 본 §A.3 = ✗ + 사유 명시 |

> **§A 결과**: A.1 (2 행 ✗ + 사유) + A.2 ✓ + A.3 (✗ + 사유) — **사용자 결정에 의한 미적용 ✗ 는 설계 미완성으로 판정하지 않는다** ([§10] 환경 제약 명시 + §D.4 동일 사유). 따라서 §A = **✓ (환경 제약 명시 조건)**.

---

## §B. 명명 규칙 검증

### B.1 모듈 룰 결정 (선행 단계)

| 항목 | 값 | 결과 |
|---|---|---|
| moduleId | mcm | ✓ |
| 적용 명명 룰 | MES 단일 룰 | ✓ (mcm ≠ mpn → APS 예외 미적용) |

### B.2 식별자별 검증

| 항목 | 값 | 적용 룰 | 부속서 A 근거 | 검증 결과 |
|---|---|---|---|---|
| moduleId | mcm — 한글명 **"공통관리"** | (전체 공통) | 사용자 결정 + 정본 (5 모듈 mpn/mpp/mls/mqc/mcm) | ✓ |
| moduleGroup | csa — 한글명 **"시스템관리"** | (전체 공통) | xfdl 폴더 `nxuiMui/csa/` + Mapper 폴더 `mappers-csa/` + bpmn 폴더 `services/csa/` 그대로 (사용자 결정 등재) | ✓ |
| 메뉴 계층 | 공통관리 (mcm) > 시스템관리 (csa) > 메뉴 관리 (commMenuMng) | UI 메뉴 트리 | 사용자 결정 | ✓ |
| 화면식별자 (screenId) | commMenuMng | MES: camelCase `{화면명}` (단일 토큰) | 01 A.3 — `CommMenuMng` → `commMenuMng` (첫 글자 소문자) | ✓ |
| pageName | commMenuMng | MES: = screenId | 01 A.4.2 (MES 단일 룰) | ✓ |
| pageId | commMenuMng | MES: = screenId | 01 A.4.3 | ✓ |
| serviceId | commMenuMng | MES: = screenId | 01 A.4.4 | ✓ |
| mesModule | m-mcm | (전체 공통) `m-{moduleId}` | 01 A.4.5 | ✓ |
| Frontend 파일명 | commMenuMng.tsx | MES: `{screenId}.tsx` | 03 컨벤션 | ✓ |
| tsup entry key | pages/csa/commMenuMng | MES: `pages/{moduleGroup}/{pageName}` | 01 A.4.6 | ✓ |
| 팝업 ID 체계 | P-001 (flat) | (전체 공통) | 01 A.4.7 | ✓ |
| 필드/컬럼/버튼 ID | S-001~004 / G-001~012 / GT-001 / GO-001~009 / D-001~018 / B-001~014 / P-001 / FX-001~008 / EX-001~005 / DS-001~009 / LV-001~007 / ST-001~007 / V-001~902 / UX-001~011 / API-001~006 | (전체 공통) | 01 A.4.8 | ✓ |
| DB 컬럼 / API JSON | SNAKE_CASE (As-Is 보존) | (전체 공통) | 01 A.4.9 | ✓ |
| **TB_MCM_SEC_MENU PK** (2026-06-05 / iter#6 / C5) | **MENU_ID 단독** (As-Is 복합 PK (MENU_ID, MENU_SEQ) → To-Be MENU_ID 단독 — 2026-06-05 사용자 결정). MENU_SEQ 는 PK 분리 후 순수 "메뉴 순서" 컬럼. 엔티티 `SecMenu` @IdClass/menuSeq @Id/PK class 제거 / `SecMenuRepository` JpaRepository<SecMenu,String> / 기동 시 자동 마이그레이션(복합 PK 감지 DROP + MENU_ID PK 재생성, 멱등). TB_MCM_SEC_MENU_FLD 는 이미 MENU_ID 단독 PK(변경 없음, 정합 유지) | (전체 공통) | 사용자 결정 + R3 트리 재설계 정합 (§D.3) | ✓ |
| **B-T2A**: 화면 표시명 == As-Is xfdl `Static.text` / Edit.value (라벨) / 그리드 cell `text=` 1byte 일치 | (전수 일치 — 분석 §3.2 / §3.3 / §3.4 / §3.5 / §3.6) | (전체 공통) | 01 A.4.10 | ✓ |
| **B-T2B**: To-Be 컬럼 == As-Is 어간 직역 — DB 컬럼은 As-Is `MENU_ID` / `MENU_NM` 등 그대로 SNAKE_CASE 보존 (변환 ✗) | ✓ | (전체 공통) | 01 A.4.11 | ✓ |
| **B-T3A**: 영역 ID ⊆ 5값 enum + 추가 6 (A-TITLE / A-FOOTER / A-FOLD / A-MAIN-TREE / A-MAIN-LIST / A-MAIN-DETAIL / A-MAIN-OBJECT / A-MAIN-LEFTMENU / A-MAIN-RIGHTMENU) — 사용자 요구사항 [§10] 가이드 §외 신설 ✗ → 디자인설계서 §3.1 에 5 표준 + 6 추가 명시 | ✓ (A-FILTER / A-MAIN / A-BTN 통합 / A-TITLE / A-FOOTER + 6 분할 영역) | (전체 공통) | 01 A.4.8 | ✓ |
| **B-T3B**: 입력 유형 ⊆ 5값 enum — 본 화면은 As-Is Combo 3 (S-001 / S-004 / 그리드 컬럼 G-007 / G-011) → **To-Be Combo 2** (S-001 cross-cutting 정책 #1 폐기) + TextBox 9 + Static 라벨 + Radio 2 + Calendar 2 + TextArea 1 + Dynamic LoV Div 1 | ✓ | (전체 공통) | 01 A.4.12 | ✓ |
| **B-T3C**: 표시 형식 = 자료형(길이) 강제 — varchar(maxlength=300 for edt_MENU_ID/edt_MENU_NM) / number maxlength=3 (edt_lst_seq) / digit (edt_full_seq/edt_parent_menu_id) 모두 cite | ✓ (분석 §9 + 기능 §3.1 + 디자인 §3.2) | (전체 공통) | 01 A.4.13 | ✓ |
| **B-MES-1**: MES 모듈에서 screenId == pageId == serviceId == pageName (4 식별자 1byte 일치) | commMenuMng × 4 | MES 만 적용 | 사용자 결정 | ✓ |
| **B-APS-1**: mpn 모듈에서 pageName = kebab-case | (해당 없음 — mcm ≠ mpn) | APS-mpn 만 적용 | 사용자 결정 | (N/A) |

> **§B 결과**: 모든 행 ✓ — 위반 패턴 (MES 모듈에서 kebab-case / `-page.tsx` 접미사) 0 hits.

---

## §C. 5축 정합 (분석 ↔ 기능 ↔ 디자인 ↔ BPMN ↔ 매핑)

| 일치 키 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 매핑 (As-Is↔To-Be) | 검증 결과 |
|---|---|---|---|---|---|---|
| 화면식별자 | commMenuMng (§1) | commMenuMng (§1.2) | commMenuMng (frontmatter / §1.2) | commMenuMng (process / serviceId) | commMenuMng | ✓ |
| moduleId | mcm | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | csa | ✓ |
| pageName | commMenuMng | commMenuMng | commMenuMng | commMenuMng | commMenuMng | ✓ |
| pageId | commMenuMng | commMenuMng | commMenuMng | commMenuMng | commMenuMng | ✓ |
| serviceId | commMenuMng | commMenuMng | commMenuMng | commMenuMng | commMenuMng | ✓ |
| 필드ID (S-NNN 전수) | §3.2 (As-Is 4 행: S-001~S-004 / To-Be 3 행: S-002~S-004) | §3.1 (As-Is 4 행 보존 + S-001 폐기 marker) | §3.2 (As-Is 4 행 좌표 + S-001 폐기 marker) | (해당 없음 — BPMN 은 컬럼 단위 인용 ✗) | (분석 §11 #14-A cross-cutting 정책 #1 + §12 결정 누적) | ✓ |
| 컬럼ID (G-NNN 전수) | §3.3 (12 행: G-001~G-012) | §3.2 (12 행 동일) | §4.1 (12 행 동일) | (참조만) | (분석 §9.1) | ✓ |
| 트리 컬럼 (GT-NNN) | §3.4 (1 행: GT-001) | §3.2 (1 행 동일) | §4.2 (1 행 동일) | (참조만) | (분석 §9.3) | ✓ |
| OBJECT 그리드 (GO-NNN) | §3.5 (As-Is 9 행: GO-001~GO-009 / To-Be 8 행: GO-008 폐기) | §3.2 (As-Is 9 행 + GO-008 폐기 marker) | §4.3 (As-Is 9 행 + GO-008 폐기 marker) | (참조만) | (분석 §9.2 — 10 행 BIZ_SYSTEM_CODE To-Be 폐기) | ✓ |
| 상세 필드 (D-NNN) | §3.6 (18 행: D-001~D-018) | §4.1 (18 행 동일) | §3.5 (18 행 좌표 포함) | (참조만) | (분석 §9.1) | ✓ |
| 버튼ID (B-NNN 전수) | §4.1 (14 행: B-001~B-014) | §5.1 (14 행 동일) | §5.1~§5.4 (top 4 + left 3 + right 5 + fold 1 + 등록 ✗ 1 = 14) | (참조만 — §1.1 API 트리거 매핑) | - | ✓ |
| 팝업ID (P-NNN 전수) | §5 (1 행: P-001 dynamic LoV) | §9 (1 행 동일) | §6 (1 행 동일) | (참조만) | - | ✓ |
| 외부 인입 (FX-NNN / EX-NNN) | §3.7 (FX 8) + §4.3 (EX 5) | (참조만) | §5 (EX 인용) | (참조만) | - | ✓ |
| DB 컬럼명 (SNAKE_CASE) | §9.1 (TB_MCM_SEC_MENU 본 컬럼 15 + cactus-core audit 9 = 24) / §9.2 (TB_MCM_SEC_OBJ 본 컬럼 11 + cactus-core audit 9 = 20) / §9.3 (TB_MCM_SEC_MENU_FLD 본 컬럼 5 + cactus-core audit 9 = 14) | §3.1 / §3.2 (S + G + GT + GO 인용) | §3.2~§3.6 (영역별 좌표 / Grid 컬럼 인용) | §5 (DTO 매핑) | §11 변환점 (As-Is 스키마 prefix 없음 → To-Be `MCMAPUSER.TB_MCM_SEC_*` 보존 — 사용자 결정) | ✓ |
| **TB_MCM_SEC_MENU PK = MENU_ID 단독** (2026-06-05 / iter#6 / C5) | §9.1 (복합 PK (MENU_ID, MENU_SEQ) → MENU_ID 단독 — MENU_SEQ PK 분리) | (참조만 — saveCmMenu menuId 단독 키 / 신규등록 MENU_ID 중복 차단) | (참조만) | (참조만 — saveCmMenu Task) | §11 (PK 변경 + 기동 시 자동 마이그레이션 멱등) | ✓ |
| **MENU_SEQ 숫자 입력 + 8자리 '0' LPAD** (2026-06-05 / iter#6 / C4·C6) | §9.1 (MENU_SEQ 순수 순서 컬럼 — `00000008` 8자리) | §4.1 D-004 (숫자만 입력 maxLength 8) + §3.x 메뉴 필드 관리 MENU_SEQ 셀 | §3.5 D-004 (숫자 필터) + 메뉴 필드 관리 팝업 | (참조만 — BE lpad8() insert/update 공통) | §11 (BE `lpad8()` + 기동 시 기존 데이터 `normalizeMenuSeqLpad8` 정규화) | ✓ |
| **FULL_SEQ 자동부여** (2026-06-04~05 / iter#6 / C1·C2) | §9.1 / §9.3 (SEC_MENU + SEC_MENU_FLD FULL_SEQ NUMERIC(10,0) — searchMenuFldList/searchMenuFld SELECT 동봉) | §4.1 D-009 (readOnly 자동부여) + 메뉴 필드 관리 FULL SEQ read-only 컬럼 | §3.5 D-009 (readOnly + placeholder "저장 시 자동 부여") | (참조만 — saveCmMenu/saveCmMenuFld 직후 recompute) | §11 + §F (7자리 인코딩: 모듈 ×1,000,000 / 그룹 +j×10,000 / 화면 +100+k×10 — `SecMenuNativeRepository.recomputeMenuFullSeq()` + `DataInitializer` SoT 멱등) | ✓ |
| **saveCmMenu PARENT_MENU_ID 정합 정정** (2026-06-04~05 / iter#6 / C3) | §11 #6 (As-Is 자기참조 `PARENT_MENU_ID = #{MENU_ID}` 폐기 → FE 선택값 보존, blank 시만 self fallback) | §5.2 (saveCmMenu — FE 전송 PARENT_MENU_ID 사용) | §3.3.1 트리 / §6.1 LoV (PARENT_MENU_ID 트리 노드·OBJECT 선택값) | §2.3 (saveCmMenu Task 본문) | §11 #6 (자기참조 폐기 행) + §E.5 결함 #6 (As-Is 보존 → R3 정합 재정) | ✓ |
| 상태코드 (statusCodes) | §10.1 (7 행: ST-001~ST-007) | §7 (7 행 동일) | §4.4 UX-NNN + §7.2 색상 강조 | (참조만 — saveCmMenu rowType 분기) | - | ✓ |
| action 목록 | §1 (As-Is 6 enum: searchCmMenu / searchMenuGrp / saveCmMenu / searchObj / commonList / **~~lov~~** / To-Be 5 enum — lov 폐기) | §5.2 (As-Is 6 / To-Be 5 — lov 폐기 marker) | (참조만) | §1.1 (As-Is 6 API + To-Be 5) + §2.1~§2.6 (2.6 lov 폐기 marker) | §6.2 BPMN 기능 식별자 안 (lov 행 폐기 marker) | ✓ |
| Mapper.xml SQL ID | §6 (8 SQL 전수 — 활성 7 + 미사용 1, **cross-namespace `CommObjMngMapper.selectAppHostId` 호출 1 종 To-Be 폐기**) | §5.2 (action → SQL 매핑 7 활성, lov 행 폐기 marker) | (참조만) | §1.1 (sqlKey 7 활성) + §6.4 (As-Is 8 종 / To-Be 7 + cross-namespace 1 종 폐기) | §11 변환점 (Oracle → MSSQL) + §11 #14-A cross-cutting 정책 #1 | ✓ |
| BPMN 노드 / SequenceFlow | §8 (As-Is 9 노드 + 13 flow / To-Be 8 노드 + 11 flow — Task_1z04i9v + 0ug4lxk + 1azff5q 폐기) | (참조만) | (해당 없음) | §2 (As-Is 흐름 + To-Be 폐기 marker §2.6) + §6.3 (Task_1z04i9v 폐기 marker) | - | ✓ |
| Bind | §3.9 (BindItem 13 행 전수) | (참조만) | §3.5 (D-NNN 본문에 bind item 인용) | (참조만 — Dataset 컬럼 매핑) | - | ✓ |
| Dataset (DS-NNN) | §3.8 (As-Is 9 / To-Be 8 — DS-007 ds_lovSubSystem 폐기) | (참조만) | §1.2 그리드 컴포넌트 인용 | §5 DTO 매핑 | - | ✓ |
| LoV (LV-NNN) | §10 (As-Is 7 / To-Be 6 — LV-004 폐기) | §3.3 (참조 + LV-004 폐기 marker) | §4 그리드 LoV 인용 | §5.5 / ~~§5.6~~ (commonList 만 활성 / lov DTO 폐기) | - | ✓ |

> **§C 결과**: 모든 행 ✓ — 4 설계서가 분석리포트에 **없는 행을 자체 추가 ✗** ([§9] 사용자 요구사항 — 분석리포트 단일 원천 정합).

---

## §D. 반복 설계 결정성 검증

### D.1 핵심 결정 항목 단일 산출 검증

| 항목 | 분석리포트 값 | 기능설계서 등장값 | 디자인설계서 등장값 | BPMN설계서 등장값 | 일치 |
|---|---|---|---|---|---|
| screenId | commMenuMng | commMenuMng | commMenuMng | commMenuMng | ✓ |
| asIsId | CommMenuMng | CommMenuMng | CommMenuMng | CommMenuMng | ✓ |
| moduleId | mcm | mcm | mcm | mcm | ✓ |
| moduleGroup | csa | csa | csa | csa | ✓ |
| serviceId | commMenuMng | commMenuMng | commMenuMng | commMenuMng | ✓ |
| S-NNN 수 (As-Is/To-Be) | 4 / 3 | 4 / 3 | 4 / 3 | (해당 없음) | ✓ |
| G-NNN 수 | 12 | 12 | 12 | (해당 없음) | ✓ |
| GT-NNN 수 | 1 | 1 | 1 | (해당 없음) | ✓ |
| GO-NNN 수 (As-Is/To-Be) | 9 / 8 | 9 / 8 | 9 / 8 | (해당 없음) | ✓ |
| D-NNN 수 | 18 | 18 | 18 | (해당 없음) | ✓ |
| B-NNN 수 | 14 | 14 | 14 (top 4 + left 3 + right 5 + fold 1 + 등록 ✗ 1) | (참조만) | ✓ |
| P-NNN 수 | 1 | 1 | 1 | (참조만) | ✓ |
| ST-NNN 수 | 7 | 7 | (참조만) | (참조만) | ✓ |
| LV-NNN 수 (As-Is/To-Be) | 7 / 6 | (참조만) | (참조만) | (참조만) | ✓ |
| DS-NNN 수 (As-Is/To-Be) | 9 / 8 | (참조만) | (참조만) | (DTO 매핑) | ✓ |
| BindItem 수 | 13 | (참조만) | (좌표 참조) | (해당 없음) | ✓ |
| BPMN action 수 (As-Is/To-Be) | 6 / 5 (lov 폐기) | 6 / 5 | (참조만) | 6 / 5 (§2.1~§2.6 — §2.6 폐기 marker) | ✓ |
| Mapper SQL 수 | 8 (활성 7 + 미사용 1) — cross-namespace 호출 1 종 추가 폐기 | 7 (활성) | (참조만) | 8 (§6.4) | ✓ |
| BPMN 노드 수 (As-Is/To-Be) | 9 / 8 | (참조만) | (참조만) | 9 / 8 (§6.3) | ✓ |
| BPMN sequenceFlow 수 (As-Is/To-Be) | 13 / 11 | (참조만) | (참조만) | 13 / 11 (§2 흐름) | ✓ |
| Java UserTask 수 | 0 (부재) | (참조만) | (참조만) | 0 (§3.1 부재 명시) | ✓ |

### D.2 BPMN 기능 식별자 = `{screenId}_{기능명}` (사용자 요구사항 [명명 규칙 정본])

| As-Is sequenceFlow name | To-Be 기능 식별자 | 검증 |
|---|---|---|
| searchCmMenu | commMenuMng_searchCmMenu | ✓ |
| searchMenuGrp | commMenuMng_searchMenuGrp | ✓ |
| saveCmMenu | commMenuMng_saveCmMenu | ✓ |
| searchObj | commMenuMng_searchObj | ✓ |
| commonList | commMenuMng_commonList | ✓ |
| ~~lov~~ | ~~commMenuMng_lov~~ | **To-Be 폐기** (cross-cutting 정책 #1) |

### D.3 테이블 명명 = `TB_{모듈명}_{역할}` (사용자 요구사항 [명명 규칙 정본])

| As-Is | To-Be 명명 안 |
|---|---|
| TB_MCM_SEC_MENU (스키마 prefix 없음) | MCMAPUSER.TB_MCM_SEC_MENU (사용자 결정 — As-Is 보존) |
| TB_MCM_SEC_OBJ | MCMAPUSER.TB_MCM_SEC_OBJ |
| TB_MCM_SEC_MENU_FLD | MCMAPUSER.TB_MCM_SEC_MENU_FLD |
| TB_MCM_SEC_ROLEGROUP (미사용 SQL 만) | MCMAPUSER.TB_MCM_SEC_ROLEGROUP (To-Be 본 화면 영향 ✗) |
| TB_MCM_SEC_USER_MAPPING (미사용 SQL 만) | MCMAPUSER.TB_MCM_SEC_USER_MAPPING (To-Be 본 화면 영향 ✗) |

> 사용자 결정: `MCMAPUSER` 스키마 + `TB_MCM_SEC_*` 대문자 prefix As-Is 보존. masterCodeMng 와 동일 룰 적용.

### D.4 manifest 9 파일 검증

| 항목 | 결과 | 사유 |
|---|---|---|
| manifest.lock.json hash 검증 | **✗** | Runner config mui 미지원 — 사용자 결정으로 생략 |
| index.json | **✗** | (동일) |
| discover.trace.json | **✗** | (동일) |
| classify.trace.json | **✗** | (동일) |
| fallback.trace.json | **✗** | (동일) |
| q-stable-key.json | **✗** | (동일) |
| conflict-report.json (미존재 확인) | **✗** | (동일) |
| verify-report.json (pass=true 확인) | **✗** | (동일) |
| error.log (ERROR/FATAL 0 확인) | **✗** | (동일) |

> **§D.4 결과**: 9 파일 모두 ✗ + 사유 명시. 사용자 결정 [§10] — Runner config mui 미지원 으로 생략. **본 ✗ 는 설계 미완성으로 판정하지 않는다** (사용자 결정 사항).

### D.5 BPMN sequenceFlow id 표기 (As-Is 보존)

| As-Is sequenceFlow id | 보존 여부 | 결과 |
|---|---|---|
| SequenceFlow_0tt1mbk (searchCmMenu) | ✓ As-Is 보존 | ✓ |
| SequenceFlow_11y43nf (searchMenuGrp) | ✓ | ✓ |
| SequenceFlow_0grwghu (saveCmMenu) | ✓ | ✓ |
| SequenceFlow_043mfni (searchObj) | ✓ | ✓ |
| SequenceFlow_1s6r4vs (commonList) | ✓ | ✓ |
| ~~SequenceFlow_0ug4lxk (lov)~~ | ~~✓~~ | **To-Be 폐기** (cross-cutting 정책 #1) |
| SequenceFlow_1 / 105vwsz / 1tgyodp / 1vkp3qd / 0iw2wut / 18uvv6q / ~~1azff5q~~ (As-Is 7 / **To-Be 6** nameless flow — 1azff5q cross-cutting 정책 #1 폐기) | ✓ As-Is 보존 + To-Be 폐기 marker | ✓ |

> **§D 결과**: D.1 ✓ + D.2 ✓ + D.3 ✓ (스키마 As-Is 보존 결정) + D.4 ✗ + 사유 명시 (사용자 결정) + D.5 ✓ — **사용자 결정 사유에 따른 D.4 ✗ 는 설계 미완성으로 판정하지 않는다** → §D = **✓ (환경 제약 명시 조건)**.

---

## §E. As-Is 누락 0 점검 (사용자 요구사항 [§3, §4])

### E.1 xfdl 컴포넌트 전수

| xfdl 컴포넌트 종류 | 분석 §3 등재 수 | 검증 방법 | 결과 |
|---|---:|---|---|
| Form / Layout / Div (컨테이너) | A-TITLE / A-FILTER / A-FOLD / A-MAIN / A-MAIN-TREE / A-MAIN-LIST / A-MAIN-DETAIL / A-MAIN-OBJECT / A-MAIN-LEFTMENU / A-MAIN-RIGHTMENU / A-FOOTER + div_topMenu / div_leftMenu / div_rightMenu / div_bottom / div_object_id = 11 영역 + 5 외부 Div = 16 (분석 §3.1 + §3.7) | xfdl Div / Layout / Form 전수 grep | ✓ |
| Static (라벨) | Static00~11 + Static00_00 + Static02_00 + Static02_00_00 + Static02_00_00_00 = 16 (분석 §3.6 — div_detail 내 모든 라벨 Static) | xfdl `<Static ...>` 전수 grep | ✓ |
| Edit (TextBox / 라벨) | 라벨 Edit 17 + 입력 TextBox 9 + 표시 전용 Edit 3 (edt_title / edt_srch_cseq / edt_dtl_info) = 29 (분석 §3.6 / §3.7) | xfdl `<Edit ...>` 전수 grep | ✓ |
| Grid | grd_M0F0 (G-001~G-012, 12 컬럼) / grd_M0F1 (GT-001 트리, 1 컬럼) / grd_objectMng (GO-001~GO-009, 9 컬럼) = 3 그리드 + 22 컬럼 (분석 §3.3 / §3.4 / §3.5) | xfdl `<Grid ...>` 전수 grep | ✓ |
| Button | btn_fold = 1 (xfdl:29) — 그 외 모든 버튼은 외부 인입 (commonTopButton 4 + commonLeftButton 3 + commonRightButton 5) (분석 §4.1) | xfdl `<Button ...>` 전수 grep | ✓ |
| Combo | **As-Is**: cbo_bizSystemCode (S-001) / cbo_USE_TP (S-004) / cbo_menu_grp (D-001) / cbo_menu_id (D-002) / cbo_menu_tp (D-011) = 5. **To-Be**: 4 (cbo_bizSystemCode S-001 cross-cutting 정책 #1 폐기) (분석 §3.2 / §3.6) | xfdl `<Combo ...>` 전수 grep | ✓ |
| Radio | rdo_use_tp (D-010) / rdo_menu_view_yn (D-014) = 2 (분석 §3.6) | xfdl `<Radio ...>` 전수 grep | ✓ |
| Calendar | cal_start_active_date (D-012) / cal_end_active_date (D-013) = 2 (분석 §3.6) | xfdl `<Calendar ...>` 전수 grep | ✓ |
| TextArea | txa_menu_desc (D-015) = 1 (분석 §3.6) | xfdl `<TextArea ...>` 전수 grep | ✓ |
| Dataset | ds_menuList / ds_menuTreeList / ds_cboUseYn / ds_menuGrp / ds_menuGrpSub / ds_objMng / ds_lovSubSystem / ds_menuViewYn + cbo_menu_tp 내부 innerdataset = 9 (분석 §3.8) | xfdl `<Dataset ...>` 전수 grep | ✓ |
| Bind (BindItem) | 13 (분석 §3.9) | xfdl `<BindItem ...>` 전수 grep | ✓ |
| Script function | 30 (분석 §4.4 — named 26 + onload 보조 + inline fn_msgSuccessSave 1) | xfdl Script `this.X = function` 전수 grep | ✓ |
| 그리드 columns 전수 | G 12 + GT 1 + GO 9 = 22 컬럼 (§3.3 / §3.4 / §3.5 — formats / fields / 표시명 / bind / displaytype 모두 등재) | xfdl `<Cell ...>` 전수 grep | ✓ |

### E.2 Java 메서드 전수

| 클래스 | 메서드 수 | 분석 §7 등재 | 결과 |
|---|---:|---|---|
| (본 화면 Java UserTask 부재) | 0 | §7.1 부재 명시 + BPMN Task 의 공통 DB Task 클래스 매핑 (§7.2 표 6 행) | ✓ |

### E.3 Mapper.xml SQL ID 전수

| SQL ID | 분석 §6 등재 | 결과 |
|---|---|---|
| selectCommMenuMng | ✓ #1 | ✓ |
| insertCommMenuMng | ✓ #2 | ✓ |
| updateCommMenuMng | ✓ #3 | ✓ |
| deleteCommMenuMng | ✓ #4 | ✓ |
| selectCommRoleGrpList | ✓ #5 (사용 X — To-Be 제거 결정) | ✓ |
| selectMenuFldList | ✓ #6 | ✓ |
| selectMenuObj | ✓ #7 | ✓ |
| selectMenuObjPop | ✓ #8 | ✓ |

> 8 SQL 전수 등재 (사용자 사전 파악 7 SQL 검증 결과 8 SQL 발견 — selectCommRoleGrpList 미사용 추가 발견).

### E.4 BPMN flow 전수

| BPMN 요소 | 분석 §8 등재 수 | 결과 |
|---|---:|---|
| startEvent | 1 (StartEvent_1) | ✓ |
| endEvent | 1 (EndEvent_1) | ✓ |
| exclusiveGateway | 1 (ExclusiveGateway_1, 6 outgoing) | ✓ |
| task (CommonSelectTask 5 + CommonMultiSaveTask 1) | 6 | ✓ |
| userTask | 0 (본 화면은 UserTask 0) | ✓ |
| sequenceFlow | 13 (6 action 분기 + 7 chain/end) | ✓ |

### E.5 결함 처리 (사용자 요구사항 [§4])

| 결함 ID | 위치 | 처리 |
|---|---|---|
| 결함 #1: BPMN process id `sample1` (오기재 — 본 화면명 "메뉴 관리" 와 불일치) | bpmn:3 | As-Is 보존 (분석) + To-Be `commMenuMng` 정정 결정 (§11 #15) | ✓ |
| 결함 #2: BPMN process name "사용자 ROLE 그룹 저장" (오기재) | bpmn:3 | As-Is 보존 (분석) + To-Be "메뉴 관리" 정정 결정 (§11 #16) | ✓ |
| 결함 #3: fn_callBack case "searchCmMenu" 의 break 누락 — searchMenuGrp 분기로 fall-through | xfdl:587 | As-Is 보존 (분석) + As-Is 그대로 보존 (의도된 동작 가능성 — 사용자 결정) (§12 결정 누적) | ✓ |
| 결함 #4: Task_1z04i9v 의 sqlKey 가 본 화면 mapper 가 아닌 외부 `CommObjMngMapper.selectAppHostId` 직접 참조 | bpmn:119 | As-Is 보존 (분석) + **To-Be 폐기** (cross-cutting 정책 #1 — Task_1z04i9v 자체 제거로 cross-namespace 호출 결함 자동 해소) (§11 #14 + §11 #14-A + §12 cross-cutting 정책 #1 행) | ✓ |
| 결함 #5: `selectCommRoleGrpList` SQL 정의만 + 호출 ✗ | xml:111~123 | As-Is 보존 (분석) + To-Be 제거 결정 (§6 #5) | ✓ |
| 결함 #6: `PARENT_MENU_ID = #{MENU_ID}` 자기참조 (insert xml:77 + update xml:96) | xml:77 / 96 | As-Is 보존 (분석) + ~~As-Is 그대로 보존 (의도된 동작 위임)~~ → **(2026-06-04~05 / iter#6 / C3) To-Be 자기참조 폐기로 정합 정정** — FE 가 보낸 그룹 폴더 PARENT_MENU_ID(트리 노드 / OBJECT LoV 선택값) 보존(blank 시만 self fallback). 사유: R3 트리 재설계(폴더=TB_MCM_SEC_MENU_FLD / 화면 PARENT_MENU_ID = 그룹 폴더 MENU_ID)와 자기참조 모순 → 화면이 그룹에서 분리되고 FULL_SEQ 그룹BASE 산출 불가하던 결함 정정 (§J.1 #13 + §C saveCmMenu PARENT_MENU_ID 행) | ✓ |
| 결함 #7: ds_menuList 에 STATUS 컬럼 정의 ✗ but G-001 bind 사용 | DS-001 / G-001 | As-Is 보존 (Nexacro auto row state). **To-Be**: FE 동일 row state 표시 구현 (사용자 결정 — masterCodeMng ST-005 동일 룰) | ✓ |
| 결함 #8: ref_Audit fragment 정의 파일 미동봉 | xml:63 / 81 / 100 | As-Is include (분석) + To-Be cactus-core `CactusAuditEntity` (9 컬럼 자동 JPA `@PrePersist`/`@PreUpdate`) 적용 결정 | ✓ |
| 결함 #9: 등록 ✗ 함수 3 종 (`div_search_btn_fold_onclick` xfdl:443 / `fn_linkCommMenu` xfdl:800 / `fn_openMenu` xfdl:806) — As-Is 호출 안 됨 | xfdl:443 / 800 / 806 | As-Is 보존 (분석) + To-Be 제거 결정 (§11 #19) | ✓ |
| 결함 #10: 주석된 코드 잔존 (`fn_before_save_chk` deleteRow 루프 xfdl:739~745 / `fn_MsgDeleteCallBack` setRowType ROWTYPE_DELETE xfdl:509~511 / `cbo_menu_id` 구버전 substr xfdl:855~857 / Java 라인은 본 화면 부재) | xfdl 다수 | As-Is 보존 (분석) + To-Be 주석 코드 제거 결정 (§11 #18) | ✓ |
| 결함 #11: `cnt`건 "조회 되었습니다." (saveCmMenu 콜백) — 저장 후 "조회" 메시지 사용 | xfdl:619 | As-Is 보존 (분석) + As-Is 그대로 보존 (As-Is 문구 — 사용자 결정) | ✓ |
| 결함 #12: As-Is xfdl S-002 / S-003 text="부산역 CY" (placeholder 추정 — 의도 불명) | xfdl:20 / 22 | As-Is 보존 (분석) + As-Is 그대로 보존 (사용자 결정 위임) | ✓ |

> **§E 결과**: xfdl 모든 컴포넌트 전수 + Java 부재 명시 + Mapper.xml 8 SQL + BPMN 모든 flow + 결함 12 건 모두 As-Is 1:1 보존 + 분석 §12 결정 누적 표 반영 — 누락 0 + 임의 정정 0.

---

## §F. To-Be 변환점 (Oracle → MSSQL) — 분석 §11 영향 SQL 정합

| 변환 항목 | 영향 SQL ID | 기능설계서 반영 | 디자인설계서 반영 | BPMN설계서 반영 | 검증 |
|---|---|---|---|---|---|
| `CONNECT BY PRIOR MENU_ID = PARENT_MENU_ID` → MSSQL **CTE WITH RECURSIVE** | selectMenuFldList | (참조만) | (해당 없음) | §2.2 (xml:136 cite) | ✓ |
| `START WITH PARENT_MENU_ID IS NULL` → CTE anchor member WHERE | selectMenuFldList | (참조만) | (해당 없음) | §2.2 | ✓ |
| `LEVEL - 1 AS LEV` → CTE 누적 LEV 컬럼 | selectMenuFldList | (참조만) | (해당 없음) | §2.2 | ✓ |
| `SYS_CONNECT_BY_PATH(TO_CHAR(MENU_SEQ, '00000000'), '/')` → MSSQL CTE 누적 PATH 컬럼 | selectMenuFldList | (참조만) | (해당 없음) | §2.2 | ✓ |
| `TO_CHAR(MENU_SEQ, '00000000')` → MSSQL `RIGHT('00000000' + CAST(MENU_SEQ AS VARCHAR), 8)` | selectMenuFldList | (참조만) | (해당 없음) | §2.2 | ✓ |
| `(+)` outer join → LEFT JOIN | selectCommMenuMng | (참조만) | (해당 없음) | §2.1 (xml:27 cite) | ✓ |
| `\|\|` 문자열 결합 → `+` 또는 CONCAT | selectCommMenuMng / selectMenuObjPop | (참조만) | (해당 없음) | §2.1 / §2.5 | ✓ |
| `UPPER(...)` — MSSQL 동일 지원 | selectCommMenuMng / selectMenuObjPop | (참조만) | (해당 없음) | §2.1 / §2.5 | ✓ |
| `SYSDATE` → `GETDATE()` | selectCommRoleGrpList (미사용 — To-Be 제거) | - | - | (To-Be 제거) | ✓ |
| `NVL(A.END_ACTIVE_DATE, SYSDATE + 100)` → MSSQL `ISNULL(..., DATEADD(day, 100, GETDATE()))` | selectCommRoleGrpList (미사용 — To-Be 제거) | - | - | (To-Be 제거) | ✓ |
| `NOT EXISTS subquery` — MSSQL 동일 지원 | selectCommRoleGrpList (미사용 — To-Be 제거) | - | - | (To-Be 제거) | ✓ |
| MyBatis `<if>` dynamic SQL — DBMS 무관 | selectCommMenuMng / selectMenuFldList / selectMenuObjPop | - | - | - | ✓ |
| `ref_Audit` fragment 폐기 — To-Be cactus-core `CactusAuditEntity` 9 컬럼 + JPA `@PrePersist`/`@PreUpdate` 자동 처리 | insertCommMenuMng / updateCommMenuMng | - | - | Entity 레이어 자동 | ✓ |
| 외부 mapper 직접 참조 `CommObjMngMapper.selectAppHostId` (As-Is 결함) | (BPMN Task_1z04i9v) | - | - | §6.4 (As-Is 인용 + **To-Be 폐기** — cross-cutting 정책 #1 동기) | ✓ |
| **cross-cutting 정책 #1 — BIZ_SYSTEM_CODE / APP_HOST_ID 도메인 전면 폐기** (mcm 모듈 전역 / 본 화면 영향: S-001 / GO-008 / DS-007 / LV-004 / fn_lov / lov action / Task_1z04i9v / cross-namespace `CommObjMngMapper.selectAppHostId` 호출 + 4 SQL 분기·컬럼) | selectCommMenuMng (xml:21 B.컬럼 + xml:41 `<if>`) / selectMenuFldList (xml:133 `<if>`) / selectMenuObj (xml:144 SELECT 컬럼) | §3.1 (S-001 폐기 marker) + §3.2 (GO-008 폐기 marker) + §3.3 (LV-004 폐기 marker) + §5.2 (lov 폐기 marker) | §3.2 (cbo_bizSystemCode 좌표 폐기 marker) + §3.6 / §4.3 (GO-008 폐기 marker) | §1.1 (API-006 폐기 marker) + §2.6 (lov 흐름 폐기) + §3.2 (Task_1z04i9v 폐기 marker) + §5.1 / §5.4 / §5.6 (DTO 폐기) + §6.2 / §6.3 / §6.4 (BPMN 식별자 폐기) | ✓ |
| Entity / Repository 명명 (cross-cutting 정책 #6 A — TbMcm prefix 제거 단축형) | (BPMN UserTask 부재 — Entity layer 적용) | - | - | §3.3 Entity / Repository / Mapper namespace 행 (SecMenu / SecObj / SecMenuFld) | ✓ |
| BPMN process id `sample1` (오기재) → `commMenuMng` (정정) | (BPMN 전체) | - | - | §6.1 | ✓ |
| BPMN process name "사용자 ROLE 그룹 저장" (오기재) → "메뉴 관리" (정정) | (BPMN 전체) | - | - | §6.1 | ✓ |
| xfdl fn_callBack case "searchCmMenu" break 누락 (As-Is 보존 결정) | (xfdl callback) | (V-805 명시) | - | §2.1 callback 본문 | ✓ |
| 스키마 prefix 없음 → `MCMAPUSER.TB_MCM_SEC_*` (사용자 결정 — As-Is 보존) | (모든 SQL) | (참조만) | (해당 없음) | §6.4 (sqlKey To-Be 명명 안) | ✓ |
| 주석된 deprecated 코드 (xfdl:509 / 739 / 855 등) → To-Be 제거 | (xfdl Script) | - | - | - | ✓ |
| **FULL_SEQ 자동부여** (2026-06-04~05 / iter#6 / C1) — As-Is 사용자 직접 입력 → To-Be 7자리 인코딩 멱등 자동 재계산 (모듈 ×1,000,000 / 그룹 부모BASE+j×10,000 / 화면 그룹BASE+100+k×10). 폴더(TB_MCM_SEC_MENU_FLD)도 FULL_SEQ NUMERIC(10,0) 컬럼 — searchMenuFldList / searchMenuFld SELECT 동봉 | (BE Entity/Native — `SecMenuNativeRepository.recomputeMenuFullSeq()`) + saveCmMenu/saveCmMenuFld 직후 + DataInitializer SoT | §4.1 D-009 (readOnly 자동부여) + 메뉴 필드 관리 FULL SEQ read-only 컬럼 | §3.5 D-009 (readOnly + placeholder) | (참조만 — saveCmMenu Task 직후 recompute) | ✓ |
| **MENU_SEQ 8자리 '0' LPAD** (2026-06-04~05 / iter#6 / C4·C6) — 입력 숫자 → 저장 시 BE `lpad8()` 8자리("12"→"00000012"). C5(PK 단독화) 이후 SEC_MENU·FLD insert/update 모두 적용. 기동 시 기존 데이터 `normalizeMenuSeqLpad8` 일괄 정규화(숫자 8자 미만만, 멱등) | insertCommMenuMng / updateCommMenuMng / saveCmMenuFld (BE lpad8) | §4.1 D-004 (숫자만 maxLength 8) + 메뉴 필드 관리 MENU_SEQ 셀 | §3.5 D-004 (숫자 필터) | (참조만) | ✓ |
| **TB_MCM_SEC_MENU PK = MENU_ID 단독** (2026-06-05 / iter#6 / C5) — As-Is 복합 PK (MENU_ID, MENU_SEQ) → To-Be MENU_ID 단독. 엔티티 `SecMenu` @IdClass/menuSeq @Id/PK class 제거 + `SecMenuRepository` JpaRepository<SecMenu,String> + saveCmMenu menuId 단독 키(신규등록 MENU_ID 중복 차단). 기동 시 자동 마이그레이션(복합 PK 감지 DROP + MENU_ID PK 재생성, 멱등). FLD 는 이미 MENU_ID 단독 PK | (모든 SEC_MENU SQL — PK 키 menuId 단독) | (참조만) | (참조만 — §B.2 PK 행) | (참조만 — saveCmMenu Task) | ✓ |
| **saveCmMenu PARENT_MENU_ID 자기참조 폐기** (2026-06-04~05 / iter#6 / C3) — As-Is xml:77/96 `PARENT_MENU_ID = #{MENU_ID}` 자기참조 → To-Be FE 가 보낸 그룹 폴더 PARENT_MENU_ID(트리 노드 / OBJECT LoV 선택값) 보존(blank 시만 self fallback). R3 트리 재설계 모순 정정 | insertCommMenuMng / updateCommMenuMng | §5.2 (saveCmMenu FE 전송 PARENT_MENU_ID) | §3.3.1 / §6.1 (트리·LoV 선택값) | §2.3 (saveCmMenu Task 본문) | ✓ |
| **오류 팝업 z-index 전역 수정** (2026-06-04~05 / iter#6 / C7) — shared layout/page-layout.css `.error-modal-overlay` z-index 50 → 10001 (일반 Modal 9999 / MessageModal 10000 위). 메뉴 필드 관리 등 모든 팝업 위 오류 표시 | (shared page-layout.css — DBMS 무관 FE cross-cutting) | (FE shared) | (FE shared) | - | ✓ |

> **§F 결과**: 24 변환점 (기존 19 + iter#6 5: FULL_SEQ 자동부여 / MENU_SEQ LPAD8 / PK 단독화 / saveCmMenu PARENT_MENU_ID 자기참조 폐기 / 오류 팝업 z-index) 모두 분석리포트 §11 + iter#6 코드 정본 인용 + 영향 SQL·레이어 1:1 매핑 — 24 행 ✓.

---

## §G. 확인필요 항목 집계 — 결정 완료

> 분석 단계 식별 항목 사용자 결정 완료 — **활성 확인필요 = 0 건**. 결정 누적 표는 분석리포트 §12 참조 (17 행 = 기존 14 + cross-cutting 정책 #1 BIZ_SYSTEM_CODE 폐기 1 + 정책 #4 As-Is/To-Be 표준 우선 1 + 정책 #6 A Entity 명명 1). 본문 반영 위치: §3 (S-001 / GO-008 / DS-007 / LV-004 폐기) / §6 (SQL ID — 미사용 1 SQL To-Be 제거 + 4 SQL `<if>`/SELECT 컬럼 BIZ_SYSTEM_CODE 분기 폐기) / §7 (fn_lov 폐기) / §8 (BPMN — process id/name 오기재 정정 + Task_1z04i9v 자체 제거로 외부 mapper 참조 결함 자동 해소 / BPMN node 9→8 / sequenceFlow 13→11 / action 6→5 / 결함 12 건) / §9 (audit cactus-core 9 컬럼 통일) / §10 (ST-005 row state) / §11 (스키마 `MCMAPUSER.TB_MCM_SEC_*` 보존 / CONNECT BY → MSSQL `WITH RECURSIVE` CTE 변환 / END_ACTIVE_DATE LocalDate.of(9999,12,31) 보존 / Java 패키지 표준 = Entity·Repository `mcm.{entity,repository}.*` 평탄 + Service·DTO `mcm.csa.commMenuMng.*` / Entity 단축명 SecMenu/SecObj/SecMenuFld) / §13 G-G (As-Is/To-Be 표준 우선 원칙 — fn_callBack searchCmMenu fall-through 보존 / PARENT_MENU_ID 자기참조 보존).

---

## §H. 환경 제약 명시 종합 (사용자 요구사항 [§10] / [§13])

| # | 환경 제약 | 영향 절 | 처리 |
|---|---|---|---|
| 1 | Runner / R14-Step0 / manifest 9 파일 검증 미적용 | §A.1 (A-R12-1, A-R12-4) + §A.3 + §D.4 | ✗ + 사유 명시 ("Runner config mui 미지원 — 사용자 결정으로 생략") |
| 2 | 가이드 템플릿 WinForms 전제 항목은 mui 등가물로 매핑 | 분석리포트 §0 + 본 §A.1 (A-T1A / A-R12-3 / A-R12-5) | mui 등가 매핑 (designer.cs → xfdl Layout / cs Click+= → xfdl onclick / sp.sql @Case → BPMN sequenceFlow name 분기 / Mapper.xml inline SQL) |
| 3 | As-Is = Oracle (CONNECT BY / SYS_CONNECT_BY_PATH / SYSDATE / NVL / `(+)` outer join / `\|\|` 결합 / UPPER LIKE) → To-Be = MSSQL `sample_dmes` `MCMAPUSER` 스키마 (As-Is 테이블명 보존) + cactus-core `CactusAuditEntity` audit 자동 적용 | §F + 분석 §11 | 19 변환점 명시 — 모든 결정 사항 본문 반영 |
| 4 | Java UserTask 부재 (본 화면 csa Java 폴더에 CommMenuMng 서브폴더 없음) | 분석 §7 + BPMN §3.1 | UserTask ✗ 명시 + 공통 DB Task 6 종 매핑 (CommonSelectTask 5 + CommonMultiSaveTask 1) |
| 5 | 외부 mapper 참조 결함 (Task_1z04i9v 의 CommObjMngMapper.selectAppHostId 직접 참조) | BPMN §6.4 + 분석 §11 #14 | **To-Be 폐기** (cross-cutting 정책 #1 — Task_1z04i9v 자체 제거로 cross-namespace 참조 결함 자동 해소) |
| 6 | BPMN process id `sample1` / name "사용자 ROLE 그룹 저장" 오기재 | BPMN §6.1 + 분석 §11 #15 #16 | To-Be 정정 결정 (`commMenuMng` / "메뉴 관리") |
| 7 | **cross-cutting 정책 #1 — BIZ_SYSTEM_CODE / APP_HOST_ID 도메인 전면 폐기** (신규 등재) | 분석 §11 #14-A / §12 결정 누적 / 본 §F / §E.5 결함 #4 | mcm 전역 결정 — 본 화면 영향: S-001 / GO-008 / DS-007 / LV-004 / fn_lov / lov action / Task_1z04i9v / cross-namespace 호출 + 4 SQL 분기·컬럼 모두 To-Be 폐기. BPMN node 9→8 / sequenceFlow 13→11 / action 6→5 |
| 8 | **cross-cutting 정책 #6 (A) — Entity 명명** (신규 등재) | 분석 §11.1 / §12 | Entity / Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 직속에 **SecMenu** / **SecObj** / **SecMenuFld** (TbMcm prefix 제거 단축형). 모듈 단축 명명 룰 적용 |

> 모든 환경 제약 명시 + 정합체크서 §A / §D 의 ✗ 사유가 사용자 결정에 의한 미적용임을 명시 — 본 ✗ 는 **설계 미완성으로 판정하지 않는다**.

---

## §I. 정합체크 종합 결과

| 절 | 결과 | 비고 |
|---|---|---|
| §A 구조 동일성 + 누락 | ✓ (환경 제약 명시 조건) | A.1 2 행 ✗ + A.3 ✗ — 모두 사용자 결정 [§10] 사유 |
| §B 명명 규칙 | ✓ | 모든 행 ✓, MES 단일 룰 적용 |
| §C 5축 정합 | ✓ | 26 일치 키 모두 ✓ (기존 22 + iter#6 4: PK 단독화 / MENU_SEQ LPAD8 / FULL_SEQ 자동부여 / saveCmMenu PARENT_MENU_ID 정합) |
| §D 반복 결정성 | ✓ (환경 제약 명시 조건) | D.4 9 파일 ✗ — 사용자 결정 [§10] 사유 |
| §E As-Is 누락 0 | ✓ | xfdl 전수 + Java 부재 + Mapper 8 SQL + BPMN 13 flow + 결함 12 건 모두 As-Is 1:1 보존 |
| §F To-Be 변환점 | ✓ | 24 변환점 모두 cite (기존 19 + iter#6 5) |
| §G 확인필요 항목 집계 | (추적용) | 활성 0 건 — 사용자 결정 완료 (분석 §12 결정 누적 표 17 행 = 기존 14 + 정책 #1 BIZ_SYSTEM_CODE 폐기 + 정책 #4 As-Is/To-Be 표준 우선 + 정책 #6 A Entity 명명) |
| §H 환경 제약 명시 | ✓ | 6 환경 제약 모두 사유 등재 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| §J 사용자 검수 이력 (iter#1~#6 + Round 6~7 + Phase 1~4) | ✓ | iter#1~#5 9 항목 + Round 5 점검 1 항목 + iter#6 (C1~C7) 7 항목 + Round 6 (R6-a/b/c) 3 항목 + Round 7 1 항목 + Phase 1~4 2 항목 = **23 항목** 모두 본문 반영, 미반영 0 (2026-06-02 ~ 2026-06-05) |
| §K Round / Phase cross-ref 매트릭스 | ✓ | Round 1~7 + Phase 1~4 적용 여부 + W5 패턴 변경 + 결함 해소 5 건 cross-ref — 본 화면 적용 6 항목 모두 ✓ |

> **설계 완성 판정**: §A ~ §F 6 개 절 모두 ✓ (환경 제약 ✗ 는 사용자 결정 사유 등재로 우회) → **설계 완성**.

---

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
## §J. 사용자 검수 이력 (iter#1~#6 + Round 6~7 + Phase 1~4)

> **본 절은 2026-06-02 ~ 2026-06-05 csa 8 화면 정합 정책 (iter#1~#5) + commMenuMng 화면 단독 정합 정정 (iter#6, 2026-06-04~05) + Round 6~7 + Phase 1~4 의 적용 이력을 기록한다.** 항목별 변경 내용 + 영향 절 + 결정 일자를 cross-cut 형태로 종합.
> **iter#6 (2026-06-04~05)** = FULL_SEQ 자동부여 (저장 시 + 기동 시) / FULL SEQ read-only / saveCmMenu PARENT_MENU_ID 정합 정정 (R3 트리 재설계 모순 해소) / MENU_SEQ 숫자 입력 + 8자리 '0' LPAD / TB_MCM_SEC_MENU PK = MENU_ID 단독화 (복합 PK 폐기) / 기존 MENU_SEQ 8자리 일괄 정규화 / 오류 팝업 z-index 전역 수정 — 7 항목. 코드 정본 (BE SecMenuNativeRepository / CommMenuMngService / DataInitializer + FE 상세·메뉴필드관리 팝업 + shared page-layout.css).
> **Round 6~7 (2026-06-04~05)** = btn_close 제거 / OBJECT 검색 LookupModal 통일 / 메뉴 트리 3차 정렬 / 메뉴 필드 관리 팝업 + BPMN action 2 신설 + BE Repository 메서드 4 신규 — 4 항목.
> **Phase 1~4 (2026-06-05)** = componentPath derived 필드 / page-registry codegen + module-pages.ts 제거 — 2 항목.

### J.1 항목별 변경 카탈로그

| # | iter / Round | 항목 | 결정 일자 | 본문 반영 절 | 결정 |
|---|---|---|---|---|---|
| 1 | iter#1~#5 (W5 A~G) | 레이아웃 / Detail wrapper / Form row / Grid / Buttons / Auto-search / BE 시간 — 다른 csa/cme 화면과 동일 W5 7 패턴 적용 | 2026-06-02 ~ 2026-06-04 | 디자인 §0.1 + §1.2 + §2.2 + §3.5 + §4 + §5 | csa 8 화면 정책 (commUserMng 제외) — 자동조회 적용. SecMenu list / Detail 분리 + cactus-core audit / commonTop·Left·Right 외부 framework wiring 확정 |
| 2 | Round 2~3 | 메뉴 트리 컴포넌트 — AgGrid LEV 들여쓰기 → shared `<Tree>` + nested TreeNode 구조 + `expand,all` 초기 전개 + `tree.css` import (Tree.tsx 1줄 추가, shared rebuild) | 2026-06-02 ~ 2026-06-03 | 디자인 §3.3.1 | As-Is LEV 평면 컬럼 폐기. nested children[] 재귀 모델 + `<Tree>` 컴포넌트 (`@dk-oasis/shared/tree`) 전환. 폴더 4 행 + leaf 13 화면 다단 표현. shared rebuild 1회 필요 |
| 3 | Round 5 | OBJECT_ID LoV + 자동 매핑 — Detail D-007 OBJECT_ID Input `readOnly` 강제 (직접 입력 차단, 검색 only). LoV 모달에서 OBJECT 선택 시 OBJECT_ID + PARENT_MENU_ID 동시 자동 세트. BE `selectMenuObjPop` SQL 에 PARENT_MENU_ID scalar subquery 추가 | 2026-06-04 | 디자인 §3.5 D-007 행 + §6.1 P-001 LoV 자동 매핑 정책 | OBJECT 변경 시 폴더 (PARENT_MENU_ID) 자동 따라가게 하여 메뉴 트리 정합 보장. SQL 컬럼 추가는 본 화면 모듈 mapper 정본 |
| 4 | Round 3 | FULL_SEQ 인코딩 체계 — 모듈 백만 / 그룹 만 / 화면 100 + 10. mcm=1,000,000, cma/csa/cme=+10,000/+20,000/+30,000, 화면=+nnn00. 17 row (SEC_MENU + SEC_MENU_FLD 시드) 일괄 재인코딩 | 2026-06-03 | 디자인 §0.2 + §3.5 D-009 | 모듈 cross-cutting 정본 인코딩. 본 화면 D-009 표시값 일관성 보장 |
| 5 | Round 3 | 그룹 ID 토큰 룰 — `grp-cma`/`grp-csa`/`grp-cme` → `cma`/`csa`/`cme` 3 글자 토큰만 | 2026-06-03 | 디자인 §0.3 + frontmatter `moduleGroup=csa` | `grp-` 접두 폐기. tsup entry key / xfdl 폴더 / Mapper 폴더 모두 `csa` 일관 |
| 6 | Round 3 | SEC_MENU vs SEC_MENU_FLD 분리 — SEC_MENU = leaf 13 화면만, SEC_MENU_FLD = 폴더 4 행 (mcm + cma/csa/cme). 메인 그리드 = leaf 만 표시 (필요 시 JOIN) | 2026-06-03 | 디자인 §0.4 + §4.1 G-001~G-012 (leaf 표시) | 폴더와 화면 분리 정본화. 메인 그리드는 SEC_MENU 로만 페치. 트리는 SEC_MENU_FLD 노드 + SEC_MENU leaf 결합 |
| 7 | Round 3 | WITH RECURSIVE 후손 조회 — 트리 노드 클릭 시 PARENT_MENU_ID CTE 로 후손 폴더 IDs → SEC_MENU.PARENT_MENU_ID IN 으로 leaf 화면 조회 | 2026-06-03 | 디자인 §0.5 + §3.3.1 (onNodeClick) | As-Is Oracle `CONNECT BY` → MSSQL CTE 변환. 정합체크 §F 변환점 행 등재 |
| 8 | Round 3 | SecMenuFld 컬럼 ADD — FULL_SEQ / USE_TP / MENU_TP / MENU_VIEW_YN 4 컬럼 멱등 ALTER ADD + 시드 보정 | 2026-06-03 | 디자인 §0.4 노트 (마이그레이션 디렉터리 정본) | SecMenu 와 SecMenuFld 컬럼 일관 — getMyMenus 결합 페치 정합 보장 |
| 9 | Round 3 | SecUserService.getMyMenus 결합 — SEC_MENU + SEC_MENU_FLD 결합 반환 (portal 사이드바 트리 정합) | 2026-06-03 | 디자인 §0.4 (결합 반환) + §3.3.1 (Tree 데이터 모델) | portal 사이드바와 본 화면 트리가 동일 데이터 모델 (nested TreeNode) 공유 |
| 10 | Round 5 점검 | MENU_ID readOnly inserted 만 — W5 정합 기존 적용 점검 | 2026-06-04 | 디자인 §3.5 D-002 행 | inserted (신규) 행에서만 편집 가능. updated 행에서는 readOnly. 이미 적용된 W5 패턴 재확인 |
| 11 (C1) | iter#6 | FULL_SEQ 자동부여 (저장 시 + 기동 시) — BE `SecMenuNativeRepository.recomputeMenuFullSeq()` 가 메뉴 트리 전체 FULL_SEQ 를 7자리 인코딩으로 멱등 재계산. 인코딩: 모듈(SEC_MENU_FLD, PARENT_MENU_ID NULL) = i×1,000,000 / 그룹 폴더(FLD child) = 부모BASE + j×10,000 / 화면(SEC_MENU) = 그룹BASE + 100 + k×10. `CommMenuMngService.saveCmMenu`/`saveCmMenuFld` CRUD 직후·재조회 직전 호출 + `DataInitializer` 기동 시 호출(SoT). 폴더(SEC_MENU_FLD)도 FULL_SEQ 컬럼(NUMERIC(10,0)) — searchMenuFldList/searchMenuFld SELECT 동봉 | 2026-06-04~05 | §C (FULL_SEQ 자동부여 행) + §F (인코딩 정본) | 사용자는 FULL_SEQ 직접 입력 ✗ — 저장/기동 시 자동 부여. iter#5 J.1#4 인코딩 체계의 코드 SoT 화 |
| 12 (C2) | iter#6 | FULL SEQ read-only — 상세(D-009) FULL SEQ 입력칸 `readOnly` (자동부여) + placeholder "저장 시 자동 부여". 신규 "메뉴 필드 관리" 팝업 그리드에 FULL SEQ read-only(editable:false) 컬럼 추가 | 2026-06-04~05 | 디자인 §3.5 D-009 행 + 메뉴 필드 관리 팝업 | C1 자동부여의 FE 반영. 직접 입력 차단 |
| 13 (C3) | iter#6 | saveCmMenu PARENT_MENU_ID 정합 정정 — As-Is xml:77/96 자기참조(`PARENT_MENU_ID = #{MENU_ID}`) 폐기 → FE 가 보낸 그룹 폴더 PARENT_MENU_ID(트리 노드 / OBJECT LoV 선택값) 보존(blank 시만 self fallback) | 2026-06-04~05 | §C (saveCmMenu PARENT_MENU_ID 행) + §E.5 결함 #6 (As-Is 보존 → R3 정합 재정) + §F (자기참조 폐기 행) | R3 트리 재설계(폴더=SEC_MENU_FLD / 화면 PARENT_MENU_ID = 그룹 폴더 MENU_ID)와 자기참조 모순 정정 — 화면이 그룹에서 분리되고 FULL_SEQ 그룹BASE 산출 불가하던 결함 해소 |
| 14 (C4) | iter#6 | MENU_SEQ 숫자 입력 + 8자리 '0' LPAD — 상세 메뉴 순서(D-004) + 메뉴 필드 관리 MENU_SEQ 셀 숫자만 입력(FE replace 필터, maxLength 8), 저장 시 '0' LPAD 8자리("12"→"00000012", BE `lpad8()`). C5(PK 단독화) 이후 SEC_MENU·FLD 모두 insert/update LPAD 적용 | 2026-06-04~05 | 디자인 §3.5 D-004 행 + 메뉴 필드 관리 팝업 + §F (LPAD8 변환점) | 이전 "신규만 LPAD" 제약 해소 (C5 PK 단독화로 update 도 LPAD 가능) |
| 15 (C5) | iter#6 | TB_MCM_SEC_MENU PK = MENU_ID 단독 — 복합 PK (MENU_ID, MENU_SEQ) → MENU_ID 단독. MENU_SEQ 는 PK 분리 후 순수 "메뉴 순서" 컬럼. 엔티티 `SecMenu`(@IdClass/menuSeq @Id/PK class 제거), `SecMenuRepository`(JpaRepository<SecMenu,String>), saveCmMenu(menuId 키 + 신규등록 시 MENU_ID 중복이면 오류=무단 덮어쓰기 차단). 기동 시 자동 마이그레이션(복합 PK 감지 DROP + MENU_ID PK 재생성, 멱등) | 2026-06-05 | §B.2 (TB_MCM_SEC_MENU PK 행) + §C (PK 단독화 행) + §D.3 (테이블 명명) | 2026-06-05 사용자 결정. SEC_MENU_FLD 는 이미 MENU_ID 단독 PK(변경 없음, 정합 유지) |
| 16 (C6) | iter#6 | 기존 MENU_SEQ 8자리 일괄 정규화 — 기존 SEC_MENU MENU_SEQ "001" → "00000001" 일괄 UPDATE(기동 시 `normalizeMenuSeqLpad8`). 숫자 8자 미만만 대상(멱등). FLD 는 이미 8자리 | 2026-06-05 | DB migration (기동 시) | C4 LPAD8 정합을 기존 데이터에 소급. FLD 영향 ✗ |
| 17 (C7) | iter#6 | 오류 팝업 z-index 전역 수정 — shared layout/page-layout.css `.error-modal-overlay` z-index 50 → 10001 (일반 Modal 9999 / MessageModal 10000 위). 메뉴 필드 관리 등 모든 팝업 위에 오류 팝업 표시 | 2026-06-04~05 | shared page-layout.css (cross-cutting) | 이전 오류 팝업이 팝업 뒤로 깔려 팝업 닫아야 확인 가능하던 결함 정정. 본 화면 메뉴 필드 관리 팝업 위 오류 표시 보장 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| 18 (R6-a) | **Round 6** | **btn_close 제거** — AsIs xfdl commonTop basic 4 (조회/초기화/저장/닫기) → ToBe 3 (조회/초기화/저장). `PageLayout` buttons 배열에서 btn_close entry **완전 삭제** + unused `handleClose` dead code 제거. 가이드 §6-E 4 버튼 표준 → ToBe 3 버튼 표준. 사유: portal 탭 close 는 host 가 처리 — 화면 내부 닫기 버튼 의미 ✗ | 2026-06-04~05 | 디자인 §1.2 + §5.1 (B-004 폐기 marker) | gather §6-E 4 버튼 표준의 본 화면 예외 — portal host 라우팅 책임 분리 |
| 19 (R6-b) | **Round 6** | **OBJECT 검색 LookupModal 형식 통일** — 기존 inline div overlay → shared `<Modal>` + `<Input>` + `<Button>` + `<AgDataGrid>` 조합 LookupModal (`commUserMng` 부서 검색 폼과 동일 형식) | 2026-06-04 | 디자인 §6 P-001 표 비고 | shared Modal 표준 통일 — 화면 간 UX 일관성 보장 |
| 20 (R6-c) | **Round 6** | **메뉴 트리 정렬 변경** — `buildMenuTree()` 에 **3차 pass 추가**. (1) 부모-자식 구조 그룹핑 → (2) `MENU_SEQ asc` (numeric — `parseInt` 후 비교) → (3) `FULL_SEQ asc` (tiebreak). `CommMenuMngTreeRow` 타입에 **`FULL_SEQ?: string` optional 필드** 추가 | 2026-06-04 | 디자인 §3.3.1 정렬 행 | 동일 MENU_SEQ 노드의 안정 정렬 보장. C1 자동 FULL_SEQ 와 결합 시 트리 노드 순서 결정성 확보 |
| 21 (R7) | **Round 7** | **메뉴 구조 위 "필드 관리" 버튼 + 그리드 batch 팝업 신설** — 좌측 트리 헤더 우측에 "필드 관리" 버튼 (xl size modal) + 그리드 4 컬럼 inline editable (MENU_ID / MENU_SEQ / MENU_NM / PARENT_MENU_ID) + 행추가/행복사/행삭제/행취소 + 닫기/저장 일괄. **BPMN action 2개 신설**: `searchCmMenuFld` (ds_menuFldList 반환) / `saveCmMenuFld` (List<Map> batch rowStatus 분기 INSERT/UPDATE/DELETE). **BE `SecMenuNativeRepository` 신규 메서드 4개**: searchMenuFldList / insertMenuFld / updateMenuFld (자식 가드) / deleteMenuFld. 기존 단건 INSERT (NOT EXISTS 가드) false-positive 결함 (mpn 중복 오탐) → batch INSERT + PK 충돌 시 `IllegalStateException` + FE 메시지로 해소 | 2026-06-04~05 | 디자인 §3.3.2 + §6.2 (P-002) | C1 / C2 / C3 / C4 결합 — FULL_SEQ 자동부여 + LPAD8 + PARENT_MENU_ID 보존 + PK 단독화가 batch 팝업에서 일관 동작 |
| 22 (P1+2) | **Phase 1+2** | **BE `myMenusTree` 응답에 derived `componentPath = ${PARENT_MENU_ID}/${OBJECT_ID}` 추가** → FE `Sidebar` 가 그대로 소비. portal 라우팅 정적 `module-pages.ts` 의존 우회 | 2026-06-05 | 디자인 §0.6 | 신규 화면 등록 시 BE 시드 (FULL_SEQ 자동 인코딩) 만으로 사이드바·라우팅 동작 — 수기 등록 불요 |
| 23 (P3+4) | **Phase 3+4** | **codegen `scripts/generate-page-registry.mjs` 신설** + auto-generated **`lib/generated/page-registry.ts` 도입** + 기존 **`module-pages.ts` 파일 완전 제거** | 2026-06-05 | 디자인 §0.7 | 화면 추가/삭제 시 codegen 재실행만으로 registry 동기. 0.6 componentPath 와 결합 시 BE 시드 + codegen 만으로 신규 화면 등록 완료 |

### J.2 변경 영향 종합

| 영향 영역 | 변경 항목 | 비고 |
|---|---|---|
| Frontend `commMenuMng.tsx` | 1, 2, 3, 10, 12(C2), 13(C3), 14(C4) | shared `<Tree>` import + `expandAll` prop + Detail readOnly 조건부 + FULL SEQ readOnly(D-009) + MENU_SEQ 숫자 필터/maxLength 8(D-004) + PARENT_MENU_ID 트리/LoV 선택값 전송 |
| Frontend 메뉴 필드 관리 팝업 (신규) | 12(C2), 14(C4) | FULL SEQ read-only(editable:false) 컬럼 + MENU_SEQ 셀 숫자 입력 |
| Frontend shared (`@dk-oasis/shared`) | 2 | Tree.tsx 1줄 (`import './tree.css'`) + rebuild 필요 |
| Frontend shared layout (`page-layout.css`) | 17(C7) | `.error-modal-overlay` z-index 50 → 10001 (cross-cutting — 전역) |
| Backend Mapper.xml | 3, 7, 11(C1), 13(C3) | `selectMenuObjPop` PARENT_MENU_ID scalar subquery 추가 / 트리 CTE `WITH FldDesc AS ...` / searchMenuFldList·searchMenuFld FULL_SEQ SELECT 동봉 / saveCmMenu PARENT_MENU_ID 자기참조 폐기(FE 선택값 보존) |
| Backend Repository (`SecMenuNativeRepository`) | 11(C1) | `recomputeMenuFullSeq()` 7자리 인코딩 멱등 재계산 (모듈/그룹/화면 BASE) |
| Backend Service (`CommMenuMngService`) | 11(C1), 13(C3), 14(C4), 15(C5) | saveCmMenu/saveCmMenuFld CRUD 직후 recompute 호출 + PARENT_MENU_ID 보존 + lpad8() + menuId 단독 키(신규 중복 차단) |
| Backend Service (`SecUserService.getMyMenus`) | 9 | SEC_MENU + SEC_MENU_FLD 결합 반환 (portal 사이드바 트리 정합) |
| Backend 기동 (`DataInitializer`) | 11(C1), 15(C5), 16(C6) | recomputeMenuFullSeq SoT 호출 + 복합 PK→MENU_ID 단독 자동 마이그레이션 + MENU_SEQ 8자리 일괄 정규화(normalizeMenuSeqLpad8) — 모두 멱등 |
| Backend Entity / Repository | 15(C5) | `SecMenu` @IdClass/menuSeq @Id/PK class 제거 + `SecMenuRepository` JpaRepository<SecMenu,String> |
| DB migration | 4, 8, 15(C5), 16(C6) | SEC_MENU + SEC_MENU_FLD 시드 17 row 재인코딩 + SecMenuFld 4 컬럼 ALTER ADD + SEC_MENU PK 복합→단독 재생성 + 기존 MENU_SEQ LPAD8 정규화 |
| frontmatter / tsup entry key / Mapper 폴더 | 5 | `moduleGroup=csa` 동기 — 본 정합체크 §B / §C 의 csa 값 모두 본 룰 결과 |
<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
| **PageLayout buttons (Round 6)** | 18(R6-a) | btn_close entry 삭제 + handleClose dead code 제거 — commonTopButton 3 buttons |
| **OBJECT LookupModal (Round 6)** | 19(R6-b) | shared `<Modal>`+`<Input>`+`<Button>`+`<AgDataGrid>` — inline div overlay 폐기 |
| **Tree 정렬 (Round 6)** | 20(R6-c) | `buildMenuTree()` 3차 pass — MENU_SEQ numeric + FULL_SEQ tiebreak. `CommMenuMngTreeRow.FULL_SEQ?: string` 추가 |
| **메뉴 필드 관리 팝업 + BPMN action 신설 (Round 7)** | 21(R7) | FE xl Modal + 4 컬럼 grid + BPMN `searchCmMenuFld` / `saveCmMenuFld` + BE Repository 메서드 4개 |
| **componentPath derived (Phase 1+2)** | 22(P1+2) | BE `SecUserService.getMyMenus` 응답 DTO 에 `componentPath` 필드 추가 + FE `Sidebar` 소비 |
| **page-registry codegen (Phase 3+4)** | 23(P3+4) | `scripts/generate-page-registry.mjs` + `lib/generated/page-registry.ts` (auto-generated) + `module-pages.ts` 완전 제거 |

### J.3 미반영 사유

| # | 미반영 항목 | 사유 |
|---|---|---|
| - | (없음) | 카탈로그 23 항목 (iter#1~#5 10 + iter#6 7 + Round 6~7 4 + Phase 1~4 2) 모두 본문 반영 완료 |

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
> **§J 결과**: iter#1~#5 9 항목 + Round 5 점검 1 항목 + iter#6 (C1~C7) 7 항목 + **Round 6 (R6-a/b/c) 3 항목 + Round 7 1 항목 + Phase 1~4 2 항목** = **23 항목** 모두 디자인/분석/기능 설계서 본문 + 코드 정본 + frontmatter 동기 반영 완료. 미반영 0. Round 6~7 = btn_close 제거 / OBJECT LookupModal 통일 / 메뉴 트리 3차 정렬 / 메뉴 필드 관리 batch 팝업 신설 (BPMN action 2 + BE Repository 4). Phase 1~4 = componentPath derived 필드 + page-registry codegen (module-pages.ts 완전 제거). §K cross-ref 동시 갱신.

---

<!-- 2026-06-04~05 Round 6~7 Phase 1~4 동기화 -->
## §K. Round / Phase cross-ref 매트릭스 (2026-06-04~05)

> 본 절은 Round 1~7 + Phase 1~4 의 본 화면 적용 여부 + 결함 / W5 패턴 / 산출 절을 한눈에 검증하는 cross-ref. ✓ = 본 화면에 적용, ✗ = 미적용, N/A = 해당 사항 없음.

| Round / Phase | 일자 | 변경 결함 / W5 패턴 / 신설 | 본 화면 적용 | 영향 §/ID |
|---|---|---|---|---|
| Round 1 | 2026-06-02 | W5 패턴 A~G + csa 자동조회 정책 | ✓ | 디자인 §0.1 |
| Round 2 | 2026-06-02 | 메뉴 트리 — AgGrid LEV → shared `<Tree>` + nested TreeNode | ✓ | 디자인 §3.3.1 |
| Round 3 | 2026-06-03 | FULL_SEQ 인코딩 / 그룹 ID 토큰 / SEC_MENU·FLD 분리 / WITH RECURSIVE 후손 조회 / SecMenuFld 컬럼 ADD / getMyMenus 결합 / tree.css import | ✓ | 디자인 §0.2 / §0.3 / §0.4 / §0.5 / §3.3.1 |
| Round 4 | (스킵) | (해당 사항 없음 — 결정 없음) | N/A | - |
| Round 5 | 2026-06-04 | OBJECT-LoV 자동 매핑 PARENT_MENU_ID + D-002 MENU_ID readOnly inserted-only | ✓ | 디자인 §3.5 (D-002 / D-007 / D-008) / §6.1 |
| **Round 6** | **2026-06-04~05** | **(a) btn_close 제거 / (b) OBJECT LookupModal 통일 / (c) 메뉴 트리 3차 정렬 (MENU_SEQ numeric + FULL_SEQ tiebreak)** | **✓** | 디자인 §1.2 / §3.3.1 / §5.1 (B-004) / §6 (P-001) |
| **Round 7** | **2026-06-04~05** | **"필드 관리" 버튼 + xl Modal batch 팝업 + BPMN action 2 신설 (`searchCmMenuFld` / `saveCmMenuFld`) + BE Repository 메서드 4 신규 + 단건 INSERT NOT EXISTS false-positive 결함 해소** | **✓** | 디자인 §3.3.2 / §6.2 (P-002) |
| **Phase 1+2** | **2026-06-05** | **BE `myMenusTree` 응답에 derived `componentPath = ${PARENT_MENU_ID}/${OBJECT_ID}` 추가 → FE Sidebar 소비 → 정적 module-pages.ts 의존 우회** | **✓** | 디자인 §0.6 |
| **Phase 3+4** | **2026-06-05** | **codegen `scripts/generate-page-registry.mjs` 신설 + auto-generated `lib/generated/page-registry.ts` + module-pages.ts 완전 제거** | **✓** | 디자인 §0.7 |

### K.1 W5 패턴 변경 / Round 변경 확정 (✓/✗)

| 항목 | W5 패턴 변경 | Round / Phase | 확정 (✓/✗) |
|---|---|---|---|
| commonTopButton 4 → 3 (btn_close 제거) | E (Buttons) — 4 버튼 표준 → 3 버튼 표준 (본 화면 예외) | Round 6 | ✓ |
| OBJECT 검색 LookupModal 형식 통일 | (W5 외 — shared Modal 표준화) | Round 6 | ✓ |
| 메뉴 트리 3차 정렬 (MENU_SEQ + FULL_SEQ) | D (Grid / Tree) — `buildMenuTree` 정렬 pass 강화 | Round 6 | ✓ |
| "필드 관리" 버튼 + xl Modal batch 팝업 | D (Grid) — inline editable batch + B (Detail) — 신설 팝업 | Round 7 | ✓ |
| componentPath derived 필드 | G (BE 시간 — derived) — BE 가 산출 + FE 그대로 소비 | Phase 1+2 | ✓ |
| page-registry codegen | (W5 외 — 빌드 파이프라인 자동화) | Phase 3+4 | ✓ |

### K.2 결함 해소 (✓/✗)

| 결함 | 발생 위치 | 해소 시기 | 확정 (✓/✗) |
|---|---|---|---|
| 단건 INSERT (NOT EXISTS 가드) false-positive — mpn 모듈 중복 오탐 | BE SecMenuNativeRepository 기존 단건 INSERT | Round 7 (batch INSERT + PK 충돌 IllegalStateException) | ✓ |
| inline div overlay 의 UX 비일관성 | OBJECT 검색 LoV 기존 inline overlay | Round 6 (shared Modal 표준화) | ✓ |
| 동일 MENU_SEQ 노드 순서 비결정성 | 트리 정렬 기존 1차 pass | Round 6 (3차 pass 추가) | ✓ |
| 정적 `module-pages.ts` 수기 등록 결함 | portal 라우팅 정적 의존 | Phase 1~4 (componentPath + codegen) | ✓ |
| 화면 내부 닫기 버튼 의미 ✗ (portal 탭 close 책임 중복) | PageLayout buttons btn_close | Round 6 (entry 삭제 + dead code 제거) | ✓ |

> **§K 결과**: Round 6~7 + Phase 1~4 의 본 화면 적용 6 항목 모두 ✓. W5 패턴 변경 (E / D / G) + 결함 해소 5 건 모두 확정. 분석/기능/디자인/BPMN 4 설계서 + 코드 정본 + frontmatter 동기 반영 완료.

---

## §6.14 Phase 5 종료 4질문 자체 검증

1. **14항 위반?** ✗ 위반 없음. §A.1~§F 모두 작성 + §A.3 / §D.4 = ✗ + mui 사유 명시. §C 5축 정합 26 일치 키 모두 ✓ (기존 22 + iter#6 4 cross-ref).
2. **검증 안 한 부분?** §A.2 누락 검증 표 (조회조건 / 그리드 컬럼 / 트리 / OBJECT / 상세 / 버튼 / 팝업 / 외부 인입 / 상태값 / LoV / Dataset / Bind / Script 메서드 / Mapper SQL / BPMN / Java / 사용 테이블 17 행) 모두 합 일치 검증. §E.5 결함 12 건 전수 등재 (결함 #6 iter#6 / C3 To-Be 정합 정정 갱신). §F 24 변환점 모두 cite.
3. **그대로 수용?** As-Is 1:1 보존 — §D.5 BPMN sequenceFlow id 13 개 모두 As-Is 보존 + §E.1~§E.4 전수 검증 + §E.5 결함 12 건 그대로 cite + §H 환경 제약 6 종 모두 사유 명시.
4. **임의 합리화?** ✗. 본 정합체크서는 4 종 설계서 (분석/기능/디자인/BPMN) 의 모든 행 / 표 헤더 / ID 의 1byte 일치를 §A~§D 에서 검증. §E~§F 는 분석리포트 §13 / §11 의 게이트 / 변환점 그대로 인용.

→ ✓ Phase 5 검증 통과 → 설계 완성.
