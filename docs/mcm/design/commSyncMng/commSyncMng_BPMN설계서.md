---
screenId: commSyncMng
asIsId: CommSyncMng
moduleId: mcm
moduleGroup: csa
작성일: 2026-05-29
작성자: Agent
---

# 동기화 관리 (CommSyncMng) BPMN설계서

> 본 설계서는 [분석리포트](./commSyncMng_분석리포트.md) §0.1.3 + As-Is BPMN (`docs/external/SampleErp/orgErpSource/mui/src/main/resources/services/csa/CommSyncMng.bpmn`) 기반으로 작성되었다. cactus-core 표준 + OASIS BPMN 표준 적용.
> action 1 enum (`reg`) 만 보유 — 일반적 6 enum 대비 단순화 구조.

---

## §0. 환경 제약

[분석리포트 §0](./commSyncMng_분석리포트.md#0-환경-제약) 인용.

---

## §1. BPMN 개요

### §1.1 As-Is BPMN 구조

| 항목 | 값 | 근거 |
|---|---|---|
| BPMN process id | `CommSyncMng` | bpmn:3 |
| BPMN process name | "동기화 관리" | bpmn:3 |
| isExecutable | false | bpmn:3 |
| exporter | Camunda Modeler 3.1.2 | bpmn:2 |
| 노드 수 | 4 (StartEvent 1 + EndEvent 1 + ExclusiveGateway 1 + UserTask 1) | bpmn:4~28 |
| SequenceFlow 수 | 3 | bpmn:17 / 18 / 29 |
| action 수 | 1 (`reg`) | bpmn:18 sequenceFlow name |
| UserTask 클래스 | `#{basePackage}SaveCommSyncMng` | bpmn:23 |

### §1.2 To-Be BPMN 구조 (As-Is 1:1 + UserTask id 명명 개선 — Q-006 해소)

- As-Is 노드 수 / SequenceFlow 수 그대로 유지
- **UserTask id `UserTask_pwdinit` → `UserTask_runSync` (Q-006 해소 — 2026-05-31 사용자 결정)**
- **camunda class 경로는 그대로 `#{basePackage}SaveCommSyncMng` 유지 — basePackage 는 To-Be 패키지 `com.dongkuk.dmes.mcm.csa.commSyncMng.service.` 로 SpEL 치환 (Q-007 해소)**. Entity 는 본 화면 자체 작성 ✗ — cma 4 화면 (masterCodeMng) entity (`com.dongkuk.dmes.mcm.entity.TbMcmCode{Master|Category|Detail}`) 재사용 (정책 #6 (A))
- BPMN .bpmn 파일 본문 정정 (UserTask id 변경) 은 후속 BE 개발 단계에서 위임 — 본 .md 산출물 갱신 사이클은 메타만 반영

---

## §2. BPMN 노드 전수

> 분석 §8.1 인용 — 4 노드 1:1.

| ID | 종류 | name | camunda 속성 | incoming | outgoing | 근거 |
|---|---|---|---|---|---|---|
| StartEvent_1 | startEvent | "Start Event" | - | - | SequenceFlow_1 | bpmn:4~6 |
| EndEvent_1 | endEvent | "End Event" | - | SequenceFlow_0v64ch1 | - | bpmn:7~9 |
| ExclusiveGateway_1 | exclusiveGateway (Diverging) | "분기" (label) | extensionElements style shapeBackground="#ffff00" (노란색 강조) | SequenceFlow_1 | SequenceFlow_0eh8isc (action `reg`) | bpmn:10~16 |
| **UserTask_pwdinit (As-Is) → UserTask_runSync (To-Be — Q-006 해소)** | userTask | "동기화 관리" | modelerTemplate=`com.dongkuk.dmes.UserTask` / class=`#{basePackage}SaveCommSyncMng` / nextBranchSpel="" | SequenceFlow_0eh8isc | SequenceFlow_0v64ch1 | bpmn:19~28 |

> **UserTask id 명명 해소 (Q-006 — 2026-05-31 사용자 결정)**: As-Is id `UserTask_pwdinit` 은 다른 화면 (비밀번호 초기화) 복사 흔적. **To-Be 개명: `UserTask_runSync`** (의미있는 명명). BPMN .bpmn 파일 본문 정정 (id 치환) 은 후속 위임 — 본 .md 산출물은 메타만 반영.

---

## §3. SequenceFlow 전수

> 분석 §8.2 인용 — 3 flow 1:1.

| sequenceFlow id | name (action) | sourceRef (As-Is / **To-Be**) | targetRef (As-Is / **To-Be**) | 근거 |
|---|---|---|---|---|
| SequenceFlow_1 | (없음) | StartEvent_1 | ExclusiveGateway_1 | bpmn:17 |
| SequenceFlow_0eh8isc | **reg** | ExclusiveGateway_1 | UserTask_pwdinit / **UserTask_runSync** | bpmn:18 |
| SequenceFlow_0v64ch1 | (없음) | UserTask_pwdinit / **UserTask_runSync** | EndEvent_1 | bpmn:29 |

---

## §4. action 분기 (1 enum — 일반 6 enum 대비 단순화 사유 명시)

> 일반 MES 화면은 search / save / saveDetail / delete / deleteDetail / popup / export 등 6 enum 분기를 BPMN ExclusiveGateway 로 라우팅하나, 본 화면은 **단일 action `reg`** 만 보유한다 — 분석 §1 / §8.3 명시.
>
> **사유**: 본 화면은 일반적 CRUD 화면 ✗ — **메타 동기화 화면**. 6 처리유형별 분기 (MASTER / RULE / RULE_JUDGE / INTERFACE / FORMAT / OBJECT) 가 모두 **Java 코드 내부 if/else 로 구현** (java:58~70) — BPMN 은 사실상 단일 진입점 라우터.

### §4.1 action 6 enum 매트릭스 (가이드 표준 vs 본 화면)

| action enum (가이드 표준) | 본 화면 사용 | 사유 |
|---|---|---|
| search | ✗ | fn_search 는 As-Is 빈 함수 (xfdl:108~118 — 주석 코드만) → To-Be 제거 |
| save | ✗ | 일반 CRUD save ✗ (동기화 시점은 reg 1 종) |
| saveDetail | ✗ | 상세 그리드 없음 |
| delete | ✗ | 일반 CRUD delete ✗ (동기화는 SOURCE→TARGET delete 만 — `reg` 내부 분기) |
| popup | ✗ | 팝업 없음 (분석 §5 동치) |
| export | ✗ | export 버튼 없음 (Excel up/down 버튼 ✗) |
| **reg** (본 화면 신규 enum — As-Is BPMN 그대로 보존) | ✓ | 동기화 실행 (이행) — bpmn:18 sequenceFlow name |

> **`reg` enum 추가 결정**: As-Is BPMN 의 sequenceFlow name 그대로 보존 (가이드 §외 신설 ✗ — As-Is 보존 원칙으로 가이드 6 enum 외 추가 enum 허용). 사용자 결정 누적 — Q-006 과 별개 결정 (As-Is `reg` 명명 보존).

### §4.2 reg action 흐름 (To-Be 명명 — UserTask_runSync)

```
StartEvent_1 → SequenceFlow_1 → ExclusiveGateway_1
                                       ↓ (name="reg")
                                  SequenceFlow_0eh8isc
                                       ↓
                            UserTask_runSync  (As-Is: UserTask_pwdinit — Q-006 해소)
                            (SaveCommSyncMng.java — 내부 6 처리유형 분기)
                                       ↓
                                  SequenceFlow_0v64ch1
                                       ↓
                                EndEvent_1
```

### §4.3 reg action 내부 — Java 6 처리유형 분기 (BPMN 외부)

> 분석 §7.1~§7.5 인용. BPMN UserTask 1 회 진입 후, Java 코드 (java:54~73) 가 `pSyncTarget` 으로 6 분기 + 각 분기 내부에서 LOC/PRD 서버 분기 + ds_object loop / ds_main loop 처리.

| pSyncTarget | Java 메서드 | LOC 분기 SQL | PRD 분기 SQL | 차단 조건 |
|---|---|---|---|---|
| MASTER | `syncMasterCode` (java:94~193) | getCodeVer / TB_MCM_CODE_MASTER_Mapper.update / TB_MCM_CODE_DETAIL_Mapper.update / deleteSourceData × N / insertSourceData × N (MCMAPUSER, MCM_BACKUP) | (동일 + ds_main loop / DB Link) | - |
| RULE | `syncRule (MCA)` (java:207~392) | selectMasterCodeData (인천 차단) / getRuleVer / TB_MCA_RULE_MASTER_Mapper.update / TB_MCA_RULE_COL_LIST_Mapper.update / TB_MCA_{Object}_Mapper.update / deleteSourceData (주석) / insertSourceData (주석) | (동일 + ds_main loop / DB Link) | 인천 RULE: UserException / 존재하지 않는 업무기준: UserException |
| RULE_JUDGE | `syncRule (MCB)` | (위와 동일 MCB 치환) | (동일 MCB) | (동일) |
| INTERFACE | `syncNui (INTERFACE)` (java:399~504) | deleteSourceData / insertSourceData (MCM_SOURCE, MCM_BACKUP) | (동일 + ds_main loop / DB Link) | - |
| FORMAT | `syncNui (FORMAT)` | getFormatVer / updateFormatVer × 2 (TB_MCM_MOM_FORMAT_LIST + LAYOUT) / deleteSourceData / insertSourceData | (동일 + ds_main loop) | - |
| OBJECT | `syncObj` (java:506~564) | (LOC 차단 UserException) | deleteObjectData (LIKE) / insertObjectData (LIKE) × ObjectTable 3 종 × ds_main loop | LOC 차단: UserException |

---

## §5. camunda 속성 (UserTask)

### §5.1 UserTask_pwdinit (As-Is) → UserTask_runSync (To-Be — Q-006 해소) — bpmn:19~28

| 속성 | 값 | 근거 |
|---|---|---|
| id | `UserTask_pwdinit` (As-Is) → **`UserTask_runSync` (To-Be — Q-006 해소 / 2026-05-31)** | bpmn:19 |
| name | "동기화 관리" | bpmn:19 |
| camunda:modelerTemplate | `com.dongkuk.dmes.UserTask` | bpmn:19 |
| camunda:property `nextBranchSpel` | `""` (비분기 — 단일 종료) | bpmn:22 |
| camunda:property `class` | `#{basePackage}SaveCommSyncMng` (SpEL — basePackage 는 §5.2 To-Be 패키지로 치환) | bpmn:23 |
| incoming | SequenceFlow_0eh8isc | bpmn:26 |
| outgoing | SequenceFlow_0v64ch1 | bpmn:27 |

### §5.2 To-Be basePackage SpEL 치환 (Q-007 해소)

| As-Is | To-Be |
|---|---|
| `#{basePackage}SaveCommSyncMng` | **`com.dongkuk.dmes.mcm.csa.commSyncMng.service.SaveCommSyncMng` (Q-007 해소 — 2026-05-31)**. 가이드 §3-1 패키지 명명 룰 = `{base-package}/{moduleGroup}/{screenId}/service`. dto = `com.dongkuk.dmes.mcm.csa.commSyncMng.dto`. **Entity = cma 4 화면 재사용 `com.dongkuk.dmes.mcm.entity.TbMcmCode{Master\|Category\|Detail}` (정책 #6 (A) — 자체 Entity 작성 ✗)** |

---

## §6. cactus-core 적용 (To-Be)

### §6.1 ref_Audit 폐기

| As-Is | To-Be |
|---|---|
| Mapper.xml `<include refid="ref_Audit.update">` 1 회 호출 (xml:40 updateFormatVer) | cactus-core `CactusAuditEntity` 의 JPA `@PreUpdate` 자동 처리 — Mapper.xml include 폐기 |
| 17 컬럼 audit (생성 4 + 수정 4 + 만료 4 + 아카이브 4 + 버전 1) | 9 컬럼 audit (C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER) |

### §6.2 SOURCE → TARGET INSERT 시 audit 처리 정책 (Q-008 해소 — 2026-05-31 (b) 안 채택)

> 분석 §11.6 인용 — `INSERT INTO ... SELECT *` 단순 복사 시 cactus-core `@PrePersist` 가 동작하지 않음 (JPA Bulk INSERT 우회).
>
> **결정 정책 (Q-008 해소 — (b) 안)**:
> 1. SOURCE → TARGET INSERT (`INSERT INTO ... SELECT *`) 그대로 수행 — audit 컬럼 SOURCE 그대로 복사
> 2. **직후 별도 UPDATE 로 동기화 시점의 `U_USR_ID` (현재 사용자) / `U_AT = GETDATE()` / `U_SVC_ID="commSyncMng"` / `U_PGM_ID="commSyncMng"` 덮어쓰기 — Service.java 명시 호출**
> 3. `C_USR_ID` / `C_AT` 는 SOURCE 원작자/원작시각 보존 (덮어쓰기 ✗)
> 4. To-Be 신규 SQL `updateSyncAudit` 추가 (분석 §11.6 정의) — 화이트리스트 검증 후 호출

### §6.3 OASIS BPMN 표준

| 항목 | As-Is | To-Be |
|---|---|---|
| Wow 인터페이스 | `com.dongkuk.oasis.task.Wow` (java:17) | (보존) |
| Context | `com.dongkuk.oasis.domain.Context` (java:11) | (보존) |
| TransactionalDao | `com.dongkuk.oasis.persistence.TransactionalDao` (java:15) | (보존) — JPA EntityManager 와 병행 사용 (cactus-core 표준) |
| CommonDaoUtil | `com.dongkuk.oasis.persistence.CommonDaoUtil` (java:14) | (보존) — `addDaoResultIntoContext` 으로 cnt_save 반환 |
| IllegalTaskException | `com.dongkuk.oasis.exception.IllegalTaskException` (java:12) | (보존) |
| UserException | `com.dongkuk.oasis.exception.UserException` (java:13) | (보존) — 인천 RULE / 존재하지 않는 업무기준 / LOC OBJECT 차단 3 케이스 |
| `CactusConstants.MYBATIS_WHERE` | `com.dongkuk.cactus.constants.CactusConstants` (java:9) | (보존) |
| `ApplicationUtils.getServerConfig` | `com.dongkuk.cactus.util.ApplicationUtils` (java:10) | (보존 또는 Spring `@ConfigurationProperties` 로 대체 — Q-007 해소 / 패키지 결정). **단일 MSSQL `sample_dmes` 환경 (Q-002 해소) 에서는 `targetServer` 가 LOC 단일 분기로 합쳐짐 — Q-005 해소 동치 (LOC 차단 폐기 / PRD 분기는 DB Link 의존이므로 사실상 No-op)** |

---

## §7. To-Be 변환점 (BPMN 영역)

### §7.1 BPMN 그래픽 (BPMNDiagram) — As-Is 그대로 보존

분석 §8 + bpmn:31~74 — Camunda Modeler 좌표 정보 (Bounds / waypoint) 그대로 보존.

### §7.2 SequenceFlow name 결정

| sequenceFlow | As-Is name | To-Be name | 결정 |
|---|---|---|---|
| SequenceFlow_1 | (없음) | (그대로) | 보존 |
| SequenceFlow_0eh8isc | **reg** | (그대로) | 보존 — action enum 6 가이드 표준 외이나 As-Is 보존 우선 |
| SequenceFlow_0v64ch1 | (없음) | (그대로) | 보존 |

> **참고 (Q-006 해소)**: SequenceFlow name 자체는 보존이며, 본 sequenceFlow 의 target UserTask id 만 `UserTask_pwdinit` → `UserTask_runSync` 로 개명됨 (§3 / §5.1).

### §7.3 ExclusiveGateway 단순화 결정

> ExclusiveGateway_1 은 outgoing 이 1 개 (reg) 뿐이므로 사실상 분기 없음. 가이드 표준대로 단순화 (Gateway 제거 + Start → UserTask 직결) 도 가능하나, **As-Is 1:1 보존 우선** 으로 ExclusiveGateway_1 유지.

### §7.4 Mapper.xml 12 SQL ID — BPMN sqlKey 연관 (해당 없음)

> 본 화면의 UserTask 는 `CommonSelectTask` / `CommonDeleteTask` 등 sqlKey 직접 등록 ✗ — Java 코드 (`SaveCommSyncMng.java`) 내부에서 `dao.selectOne` / `dao.update` / `dao.delete` / `dao.insert` 로 12 SQL 동적 호출. 따라서 BPMN sqlKey 매트릭스는 비어있음 (UserTask class 만 등록).
>
> 분석 §6 SQL 12 종 호출 위치는 모두 Java 코드 내부 (UserTask 단일 트랜잭션 경계 내).

---

## §6.14 4질문 검증 (Phase 4 종료)

| # | 질문 | 답변 |
|---|---|---|
| 1 | 14항 위반? | ✗ (분석 §8 1:1 / cite file:line / 가이드 §외 신설 ✗ — `reg` action 은 As-Is BPMN sequenceFlow name 보존 / OASIS+cactus-core 표준 적용 / Q 10건 해소 갱신 본문 반영 완료 — 2026-05-31) |
| 2 | 검증 안 한 부분? | ✗ (노드 4 / SequenceFlow 3 / action 1 (reg) 모두 §2/§3/§4 등재 + Java 6 처리유형 분기 §4.3 등재 + camunda 속성 §5 등재 + cactus-core 변환 §6 등재) |
| 3 | 그대로 수용? | ✗ (UserTask id `UserTask_pwdinit` → `UserTask_runSync` 개명 결정 Q-006 해소 / ExclusiveGateway 단순화 가능성 §7.3 명시 + As-Is 보존 결정 / `reg` action 가이드 6 enum 외 신설 사유 §4.1 명시 / cactus-core audit (b) 안 결정 Q-008 해소 §6.2) |
| 4 | 임의 합리화? | ✗ ("주요/대표/등" 0 회 / "해당 없음" §7.4 sqlKey 매트릭스 명시 / Q 10건 전수 해소 (활성 0)) |

> Phase 4 통과 — Phase 5 진입. **2026-05-31 Q 10건 해소 갱신 반영 완료 (Q-002 / Q-005 / Q-006 / Q-007 / Q-008 본 설계서 직접 영향).**

### action 6 enum 매트릭스 일치 검증

| action enum | As-Is BPMN | 본 설계서 등재 | 일치 |
|---|---|---|---|
| reg | ✓ (bpmn:18) | ✓ (§3 / §4.1 / §4.2) | ✓ |
| (그 외 5 enum — search / save / saveDetail / delete / popup / export) | ✗ | ✗ ("해당 없음" 명시) | ✓ |

> action 1 enum 모두 일치 ✓ (As-Is 그대로).
