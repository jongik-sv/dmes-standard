---
screenId: masterRuleListPop
asIsId: MasterRuleListPop
moduleId: mcm
moduleGroup: cmb
pageName: masterRuleListPop
pageId: masterRuleListPop
serviceId: masterRuleListPop
작성일: 2026-06-04
작성자: Agent
---

# 업무기준 List조회 (masterRuleListPop) 정합체크서

> 본 문서는 5종 산출물 간 식별자 / SQL ID / 액션 / 명명 / As-Is 누락 / To-Be 변환점의 정합성을 점검한다.
> 단일 원천 = [분석리포트](./masterRuleListPop_분석리포트.md).

---

## §A. 분석리포트 단일 원천 정합

### §A.1 5종 산출물 식별자 (frontmatter)

| 산출물 | screenId | asIsId | moduleId | moduleGroup | 정합 |
|---|---|---|---|---|---|
| 분석리포트 | masterRuleListPop | MasterRuleListPop | mcm | cmb | ○ |
| 기능설계서 | masterRuleListPop | MasterRuleListPop | mcm | cmb | ○ |
| 디자인설계서 | masterRuleListPop | MasterRuleListPop | mcm | cmb | ○ |
| BPMN설계서 | masterRuleListPop | MasterRuleListPop | mcm | cmb | ○ |
| 정합체크서 | masterRuleListPop | MasterRuleListPop | mcm | cmb | ○ |

### §A.2 5종 단일 원천 인용

| 산출물 | 분석리포트 인용 항목 | 정합 |
|---|---|---|
| 기능설계서 §3 (조회) | 분석리포트 §3.2 (S-001~S-004) | ○ |
| 기능설계서 §4 (CRUD=조회 단독) | 분석리포트 §6 (SQL) / §4 (반환) | ○ |
| 기능설계서 §5 (action) | 분석리포트 §4.5 | ○ |
| 기능설계서 §10 (메시지) | 분석리포트 §xfdl:135~136 직접 인용 | ○ |
| 디자인설계서 §3 (조회조건) | 분석리포트 §3.2 | ○ |
| 디자인설계서 §4 (그리드) | 분석리포트 §3.3 | ○ |
| 디자인설계서 §5 (버튼) | 분석리포트 §4 | ○ |
| BPMN설계서 §1 (액션) | 분석리포트 §4.5 / §8.4 | ○ |
| BPMN설계서 §3 (flow) | 분석리포트 §8.2 / §8.3 | ○ |
| BPMN설계서 §4 (Java=해당없음) | 분석리포트 §7 | ○ |

---

## §B. 식별자 정합

### §B.1 화면 식별자

| 항목 | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 정합 |
|---|---|---|---|---|---|
| screenId | masterRuleListPop | masterRuleListPop | masterRuleListPop | masterRuleListPop | ○ |
| asIsId | MasterRuleListPop | MasterRuleListPop | MasterRuleListPop | MasterRuleListPop | ○ |
| pageId | masterRuleListPop | masterRuleListPop | masterRuleListPop | masterRuleListPop | ○ |
| pageName | masterRuleListPop | masterRuleListPop | masterRuleListPop | masterRuleListPop | ○ |
| serviceId | masterRuleListPop | masterRuleListPop | masterRuleListPop | masterRuleListPop | ○ |
| 화면명 (titletext) | 업무기준 List조회 | 업무기준 List조회 | 업무기준 List조회 | 업무기준 List조회 | ○ |

### §B.2 영역 / 버튼 / 그리드 ID 정합

| ID | 분석리포트 | 기능설계서 | 디자인설계서 | BPMN설계서 | 정합 |
|---|---|---|---|---|---|
| A-001~A-005 | ✓ §3.1 | (간접 인용) | ✓ §2 | - | ○ |
| S-001~S-004 | ✓ §3.2 | ✓ §3.1 | ✓ §3.1 | - | ○ |
| G-001 (3 cols) | ✓ §3.3 | ✓ §3.2 | ✓ §4 | - | ○ |
| B-001~B-004 | ✓ §4 | ✓ §5 | ✓ §5 | ✓ §1.1/§1.2 | ○ |
| GB-001~GB-002 | ✓ §4.4 | ✓ §5.2 | (포함) | ✓ §1.2 | ○ |
| MSG-001~MSG-002 | (분석리포트 §xfdl 직접) | ✓ §10 | ✓ §7 | - | ○ |

---

## §C. SQL ID 일치 (Mapper.xml ↔ BPMN ↔ Java)

### §C.1 Mapper.xml ↔ BPMN

| Mapper.xml SQL ID | BPMN sqlKey | BPMN 노드 | 정합 |
|---|---|---|---|
| GetRuleMasterList (Mapper:7) | #{serviceId}Mapper.GetRuleMasterList (bpmn:18) | Task_2 "Main조회" (bpmn:10) | ○ |

### §C.2 Java ↔ Mapper.xml

| Java 호출 | Mapper.xml SQL ID | 정합 |
|---|---|---|
| (해당 없음 — UserTask 부재) | GetRuleMasterList 는 BPMN CommonSelectTask 가 직접 호출 | ○ (Java 경유 없음) |

### §C.3 xfdl ↔ BPMN (sOutDatasets ↔ resultKey)

| xfdl sOutDatasets | BPMN resultKey | 정합 |
|---|---|---|
| ds_grdMain=ds_GetRuleMasterList (xfdl:119) | Task_2.resultKey = ds_GetRuleMasterList (bpmn:19) | ○ |

### §C.4 송신 파라미터 정합

| xfdl 송신 (xfdl:120~122) | Mapper 사용 | 정합 |
|---|---|---|
| pRuleId | `<if test='pRuleId...'>` LIKE (Mapper:26~28) | ○ |
| pRuleNm | `<if test='pRuleNm...'>` LIKE (Mapper:29~31) | ○ |
| sSchema | `<choose><when test='sSchema...'>` (Mapper:17~24) | ○ |

---

## §D. 식별자 명명 정합 (D1~D5)

### §D.1 screenId 명명 규칙 (`{화면명}` 단일 토큰)

- 정본: MasterRuleListPop → masterRuleListPop (모듈명 토큰 ✗) → ○
- moduleId = `mcm` (한글명 **"공통관리"**) / moduleGroup = `cmb` (한글명 **"업무기준 관리(원장)"** — 사용자 결정 등재; 01_Agent부속_가이드.md:80 `mcm`→`cma`/`cmb`/...)
- 메뉴 계층: 공통관리 (mcm) > 업무기준 관리(원장) (cmb) > 업무기준 List조회 (masterRuleListPop)

### §D.2 BPMN 기능 식별자 명명 규칙 (`{screenId}_{기능명}`)

| To-Be 식별자 | 원천 (As-Is action) | 명명 정합 |
|---|---|---|
| masterRuleListPop_search | search (bpmn:33) | ○ |
| (process id) masterRuleListPop | As-Is `MasterJudgRuleListPop` (bpmn:3) — Form id 불일치 → 통일 정정 | ○ (정정) |

### §D.3 테이블 명명

| 항목 | As-Is | To-Be 권장 |
|---|---|---|
| 업무기준 마스터 | MCA_SOURCE.TB_MCA_RULE_MASTER (synonym) / `${sSchema}.TB_MCA_RULE_MASTER` (동적) | **MCAAPUSER.TB_MCA_RULE_MASTER 보존** (DMES-SECTION-MCA sheet135 정본 — owner/26 컬럼 확정, 분석 §9.1) |

→ TB_{모듈명}_{역할} 패턴 부합 (모듈명 MCA / 역할 RULE_MASTER). ○ (단, 본 모듈 폴더는 cmb, 테이블 prefix 는 MCA — As-Is prefix 보존)

### §D.4 manifest 9 파일 정합

| 항목 | 결과 | 사유 |
|---|---|---|
| manifest.lock.json | ✗ | Runner 미실행 — 사용자 결정 |
| index.json | ✗ | 〃 |
| discover.trace.json | ✗ | 〃 |
| classify.trace.json | ✗ | 〃 |
| fallback.trace.json | ✗ | 〃 |
| q-stable-key.json | ✗ | 〃 |
| conflict-report.json | (해당 없음) | 〃 |
| verify-report.json | ✗ | 〃 |
| error.log | (해당 없음) | 〃 |

**§D.4 종합 = ✗ (Runner 미적용 — 사용자 결정에 따라 deferred. 추후 Runner 적용 시 9 파일 생성하여 본 표 갱신)**.

### §D.5 frontmatter 6 필드 (screenId / asIsId / moduleId / moduleGroup / 작성일 / 작성자) — 5종 모두 작성

| 산출물 | screenId | asIsId | moduleId | moduleGroup | 작성일 | 작성자 | 결과 |
|---|---|---|---|---|---|---|---|
| 분석리포트 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 기능설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 디자인설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| BPMN설계서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |
| 정합체크서 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ○ |

(BPMN설계서 / 기능설계서 / 디자인설계서 / 정합체크서는 pageName/pageId/serviceId 3 추가 필드 포함 — frontmatter 9 필드. 분석리포트는 6 필드.)

---

## §E. As-Is 누락 0 점검

### §E.1 xfdl 전수 정합

| 항목 | xfdl 카운트 | 본 산출물 반영 | 결과 |
|---|---:|---:|---|
| Form 컴포넌트 (Layouts/Layout 내부) | 8 (btn_fold + div_main + div_title + div_bottom + div_search + Grid grd_main + div_topMenu + edt_title) | 분석리포트 §3.1 (A-001~A-005) + §3.5 (C-001~C-003) + §3.3 Grid | ○ |
| 조회조건 입력 컴포넌트 | 4 (stc 2 + edt 2) | 분석리포트 §3.2 (S-001~S-004) | ○ |
| Grid columns | 3 cols (head/body 각 3) | 분석리포트 §3.3 (col 0~2) | ○ |
| Dataset ds_grdMain ColumnInfo | 0 (빈 Dataset 선언 — 서버 응답 9 컬럼 동적) | 분석리포트 §3.3 dataset 비고 | ○ |
| Script 함수 | 9 (MasterRuleListPop_onload, fn_formAfterOnload, fn_button, fn_search, fn_callBack, div_main_grd_main_oncelldblclick, fn_confirm, fn_close, btn_fold_onclick, div_main_grd_main_onheadclick) | 기능설계서 §2 흐름도 + §5 (action) 에 전 핸들러 반영 | ○ (전수) |

비고: Script 함수 전수 = 10 (MasterRuleListPop_onload / fn_formAfterOnload / fn_button / fn_search / fn_callBack / div_main_grd_main_oncelldblclick / fn_confirm / fn_close / btn_fold_onclick / div_main_grd_main_onheadclick — xfdl:82, 88, 104, 114, 129, 143, 152, 161, 166, 172). 모두 분석리포트/기능서/디자인서/BPMN서 어디서든 명시.

### §E.2 Java 메서드 전수

| 메서드 | 본 산출물 반영 | 결과 |
|---|---|---|
| (해당 없음 — UserTask 부재) | 분석리포트 §7 "해당 없음" 명시 + BPMN설계서 §4 | ○ |

→ Java 클래스 메서드 = 0 (조회 전용 팝업) — 명시 반영. ○

### §E.3 Mapper.xml SQL 전수

| SQL ID | 본 산출물 반영 | 결과 |
|---|---|---|
| GetRuleMasterList | 분석리포트 §6 #1 / §6.1 #1 | ○ |

→ Mapper.xml SQL 1/1 모두 반영. ○

### §E.4 BPMN flow 전수

| 노드 / flow | 본 산출물 반영 | 결과 |
|---|---|---|
| StartEvent_1, EndEvent_1, ExclusiveGateway_1 | 분석리포트 §8.2 / BPMN설계서 §3 | ○ |
| Task_2 | 분석리포트 §8.2 / BPMN설계서 §3.1 | ○ |
| SequenceFlow 3개 (1, 0grwghu, 0lnje1n) | 분석리포트 §8.3 + BPMN설계서 §3.2 | ○ |
| BPMN Diagram 좌표 4 노드 | 분석리포트 §8.5 | ○ |

→ BPMN 노드 4 + flow 3 모두 반영. ○

### §E.5 As-Is 주석 / 미사용 코드 / 잔재 보존 점검

| 항목 | 처리 |
|---|---|
| edt_ruleId / edt_ruleNm `text="결함 코드"` 잔재 | 분석리포트 §3.2/§11/§12 + 기능 §3.1 + 디자인 §3.2/§7.4 모두 "To-Be 빈 값 정정" 명시 (사용자 결정) |
| BPMN process id `MasterJudgRuleListPop` ≠ Form id | 분석리포트 §0/§8.1/§11/§12 + BPMN §6.2/§D.2 "To-Be masterRuleListPop 통일" 명시 |
| 그리드 col editmaxlength/editimemode 잔재 (편집 핸들러 ✗) | 분석리포트 §3.3 + 디자인 §4.2 "To-Be 읽기 전용" 명시 |
| SELECT 9 컬럼 vs 표시 2 컬럼 | 분석리포트 §6.1 — 미표시 7 컬럼 보존 명시 |
| ref_Audit fragment | 본 SQL 미사용 (SELECT 1 개) — 해당 없음 |

---

## §F. To-Be 변환점

### §F.1 DB 변환점 (As-Is Oracle → To-Be MSSQL)

| 변환점 | As-Is | To-Be | 분석리포트 §11 |
|---|---|---|---|
| 문자열 결합 `\|\|` → `+` 또는 CONCAT | LIKE '%' \|\| #{x} \|\| '%' | LIKE '%' + #{x} + '%' or CONCAT | ○ |
| NULL 치환 NVL → ISNULL/COALESCE | `NVL(OLD_RULE_ID,' ')` | `ISNULL(OLD_RULE_ID,' ')` | ○ |
| 대소문자 무시 UPPER | `UPPER(col) LIKE UPPER(...)` | `UPPER(col) LIKE UPPER(...)` (collation CI 면 생략 가능, 동작 보존 위해 유지) | ○ |
| 동적 스키마 `${sSchema}` | `${sSchema}.TB_MCA_RULE_MASTER` else `MCA_SOURCE.` | **As-Is 동일 유지** — sSchema 전달 시 해당 스키마, 미전달 시 `MCAAPUSER` (사용자 확정 2026-06-04). 동적 경로 `${}` 치환 화이트리스트 가드 | ○ (Q-002 해소) |
| 스키마명 | MCA_SOURCE (synonym) | **MCAAPUSER 확정** (DMES-SECTION-MCA sheet135 정본) | ○ (Q-002 해소된 owner 부분) |
| PK 정의 | (MCA sheet135 r24 RULE_ID NULL=N) | RULE_ID 단일 PK 확정 (MCA 정본 — 분석 §9.1) | ○ (Q-001 해소) |

### §F.2 식별자 변환점

| 항목 | As-Is | To-Be |
|---|---|---|
| Form id | MasterRuleListPop | masterRuleListPop |
| process id (불일치) | MasterJudgRuleListPop | masterRuleListPop (통일 정정) |
| Mapper namespace | MasterRuleListPopMapper | masterRuleListPopMapper |
| serviceId 변수 치환 | "MasterRuleListPop" | "masterRuleListPop" |
| sqlKey (BPMN) | `#{serviceId}Mapper.GetRuleMasterList` | `#{serviceId}Mapper.GetRuleMasterList` (식 보존, 주입 값 변경) |
| BPMN action 식별자 | search | masterRuleListPop_search |
| edt "결함 코드" 잔재 | text="결함 코드" | (빈 값) |

### §F.3 결정 누적

활성 확인필요 = **0 건**. Q-003(부모 호출 화면)은 호출관계 조사로 **해소(호출자 = masterRuleFrame·masterRuleData·masterRuleDataList, 2026-06-05)**. Q-001(PK)·owner·Q-002(동적 스키마)·영속성(JPA)은 사용자 확정 2026-06-04. 결정 누적 표는 분석리포트 §12 참조.

**To-Be 적용**: process id 통일(masterRuleListPop) / edt "결함 코드" 잔재 정정 / 그리드 읽기 전용 / SELECT 9 컬럼 보존 / 통신채널 REST / 권한 외부 위임 / Entity·Repository = `com.dongkuk.dmes.mcm.{entity,repository}.*` 평탄 + 조회 Service·DTO = `com.dongkuk.dmes.mcm.cmb.masterRuleListPop.{service,dto}.*` (RULE.md §"패키지 명명 규칙" §3-1).

---

## §G. 종합

| 게이트 | 결과 |
|---|---|
| §A 단일 원천 정합 | ○ |
| §B 식별자 정합 | ○ |
| §C SQL ID 일치 | ○ (단일 SELECT GetRuleMasterList) |
| §D 명명 정합 D1~D3 / D5 | ○ |
| §D.4 manifest 9 파일 | ✗ (Runner 미실행 — 사용자 결정) |
| §E As-Is 누락 0 | ○ |
| §F To-Be 변환점 | ○ (Q-003 호출자 식별 해소 2026-06-05 — Q-001·owner·Q-002·영속성 해소) |

**최종 정합 결과 = ○ (설계 완료 — §A~§F ✓ / 활성 확인필요 0건. Q-001(PK)·owner·Q-002(동적 스키마)·영속성(JPA) 사용자 확정 2026-06-04, Q-003(부모 화면)=호출자 식별 해소 2026-06-05. §D.4 manifest ✗ 는 R-14 Runner 미적용 사용자 결정에 따른 의도된 면제로 설계 완결성에 영향 없음 — 타 6화면과 동일 처리)**.

---

## §H. Phase 종료 자동 고해성사

| # | 질문 | 답 |
|---|---|---|
| 1 | 사용자 요구사항 14항 위반? | No — As-Is xfdl 컴포넌트 8 / 조회조건 4 / Grid columns 3 / Dataset(빈 선언) / Java 메서드 0(UserTask 부재) / Mapper SQL 1 / BPMN 노드 4 / SequenceFlow 3 / Script 함수 10 모두 전수 인용 + 모든 본문 file:line cite. |
| 2 | 검증 안 한 부분? | 초기 DMES-SECTION-MCM 오참조로 "미등재 fail-fast" 기록했던 것을 **DMES-SECTION-MCA sheet135 정본으로 정정** — TB_MCA_RULE_MASTER 26 컬럼(MCAAPUSER) 존재 확인, owner/PK 해소(§9.1). 잔여: 동적 스키마 치환 정책(Q-002)·부모 호출 화면(Q-003) 보류. 임의 추정 금지 준수. |
| 3 | 그대로 수용? | mui 자료 본문/표/컬럼/SQL/flow 1:1 보존 (수정 ✗ / 병합 ✗). "결함 코드" 잔재 / process id 불일치 / 그리드 편집 속성 잔재 / SELECT 9 컬럼 모두 보존 후 To-Be 정정 결정 명시. |
| 4 | 임의 합리화? | No — 초기 테이블 오참조는 MCA 정본으로 정정(합리화 없이 출처 교체), PK·owner 정본 확정. 잔여 부모 화면 불명·동적 스키마 치환 정책은 skip 없이 Q 보류로 처리. process id 불일치/잔재 정정은 사용자 결정으로 기록. |

→ 1·3·4 No, 2 는 초기 MCM 오참조를 MCA sheet135 정본으로 정정 완료(테이블 존재·PK·owner 해소) → 결과 반환 (잔여 §F 2건 Q-002/Q-003 은 개발 진입 전 해소 필요로 명시).
