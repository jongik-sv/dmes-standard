# SAP 제품 기준 품질 보류 전 생애주기 BPMN

SAP S/4HANA Quality Management(QM)와 SAP Digital Manufacturing(DM)을 중심으로 품질활동과 보류·해제 관문을 다음 네 단계로 정리한 제품 참조모델이다.

- 생산 전 품질(Pre-Production)
- 생산 중 품질(In-Process)
- 생산 후 품질(Post-Production)
- 고객 불만(Customer Complaint)

선택적으로 SAP Extended Warehouse Management(EWM), Advanced Returns Management(ARM), Batch Management, SAP Cloud Integration이 연결된다.

이 문서는 SAP 제품 표준 기능을 설명하는 개념모델이다. 특정 회사의 MES, 로컬 품질 모듈, 데이터 모델, 승인체계는 포함하지 않는다. 실제 적용 시 사용 중인 S/4HANA 에디션·릴리스와 SAP DM 릴리스에 맞춰 검사유형, Usage Decision 코드, 재고이동, NC Routing, 권한을 구성해야 한다.

## 1. BPMN 산출물

| 구분 | BPMN | 생성 스펙 | 핵심 내용 |
|---|---|---|---|
| 통합 E2E | [00-quality-hold-e2e.bpmn](00-quality-hold-e2e.bpmn) | [00-quality-hold-e2e.bpmn_spec.json](00-quality-hold-e2e.bpmn_spec.json) | 생산 전 → 생산 중 → 생산 후 → 고객불만 |
| 생산 전 | [01-pre-production-quality.bpmn](01-pre-production-quality.bpmn) | [01-pre-production-quality.bpmn_spec.json](01-pre-production-quality.bpmn_spec.json) | 품질계획, 공급자 Release, Source Inspection, DM 실행준비 |
| 생산 중 | [02-in-process-quality.bpmn](02-in-process-quality.bpmn) | [02-in-process-quality.bpmn_spec.json](02-in-process-quality.bpmn_spec.json) | 검사 lot 03, 결과 동기화, SFC Hold, NC, Disposition |
| 생산 후 | [03-post-production-quality.bpmn](03-post-production-quality.bpmn) | [03-post-production-quality.bpmn_spec.json](03-post-production-quality.bpmn_spec.json) | 검사 lot 04, Quality Inspection Stock, Usage Decision, Batch Release |
| 고객 불만 | [04-customer-complaint-quality.bpmn](04-customer-complaint-quality.bpmn) | [04-customer-complaint-quality.bpmn_spec.json](04-customer-complaint-quality.bpmn_spec.json) | Q1, 추적·봉쇄, ARM/RMA, 반품검사, 원인·조치·효과검증 |
| 품질보류와 PP/DS 마스터 개정 | [05-quality-hold-ppds-master-change.bpmn](05-quality-hold-ppds-master-change.bpmn) | [05-quality-hold-ppds-master-change.bpmn_spec.json](05-quality-hold-ppds-master-change.bpmn_spec.json) | 생산중단, 착수 여부 판정, BOM/라우팅 개정, PDS·기존 오더 재전개, 종속자재·부모오더 재계획 |
| 고객 설명용 품질보류 통합 흐름 | [06-quality-hold-customer-view.bpmn](06-quality-hold-customer-view.bpmn) | [06-quality-hold-customer-view.bpmn_spec.json](06-quality-hold-customer-view.bpmn_spec.json) | 05의 배치와 통제 원칙을 유지하면서 SAP 비전문가가 이해하도록 업무용어로 단순화 |

모든 BPMN은 실행 구현물이 아닌 제품 참조 프로세스이므로 `isExecutable=false`로 생성한다.

## 2. SAP에서 “품질 보류”를 이해하는 기준

SAP 제품 전체에 공통으로 적용되는 단일 `Quality Hold` 객체는 없다. 보류 대상에 따라 서로 다른 표준 객체와 상태를 사용한다.

| 보류 대상 | SAP 제품/객체 | 주요 효과 | 해제 수단 |
|---|---|---|---|
| 공급자 전체 | S/4HANA Supplier Master의 품질사유 Block | RFQ, 구매오더, 입고 등을 설정 범위대로 차단 | 공급자 Block 제거 |
| 자재-공급자 관계 | S/4HANA QM Quality Info Record | 공급관계 Release/Block, 입고검사·Source Inspection 제어 | Q-Info Record Release/유효성 회복 |
| DM Material | SAP DM Material Status `Hold` | 해당 Material의 오더/SFC Release 차단 | Material을 `Releasable`로 변경 |
| DM Routing | SAP DM Routing Status `Hold` | 해당 Routing으로 SFC Release 차단 | Routing을 `Releasable`로 변경 |
| DM Operation Activity | SAP DM Operation Activity Status `Hold` | 해당 Operation에서 작업자/설비 작업 차단 | Operation을 `Releasable`로 변경 |
| 생산 중 WIP | SAP DM SFC Status `Hold` | SFC Start/Complete 차단 | Manage Holds에서 Release Hold |
| 검사대상 재고 | S/4HANA Quality Inspection Stock | 검사완료 전 일반 사용·출하 방지 | QM Usage Decision과 Stock Posting |
| 불합격/의심 재고 | S/4HANA Blocked Stock | 일반 사용·출하 방지 | 승인된 Transfer Posting/후속조치 |
| Batch 전체 | S/4HANA Batch Status `Restricted` | 생산투입·납품·이동 가능성을 Batch 단위로 제한 | Batch Status 변경 또는 QM Usage Decision |
| 반품품 | Blocked Stock Returns 또는 Inspection Stock | 고객 반품품을 정상재고와 격리 | 반품검사 결정과 물류 Follow-Up Action |

### 구분해야 하는 세 가지

1. **Inspection Lot**는 검사요청과 결과를 관리하는 객체다.
2. **Stock Type/Batch Status**는 재고 사용가능성을 제어한다.
3. **SAP DM SFC Hold**는 생산 중 WIP의 실행을 제어한다.

Inspection Lot이 존재한다고 항상 재고가 보류되는 것은 아니다. 특히 공정검사 lot 원산지 `03`은 재고 비관련이다.

## 3. SAP 제품별 책임

| 제품/컴포넌트 | 품질 프로세스 책임 |
|---|---|
| SAP S/4HANA QM | 검사계획, Inspection Lot, 결과/결함, Usage Decision, Quality Notification, 품질수준과 Follow-Up Action |
| SAP S/4HANA MM/Inventory Management | 공급자·구매·입고, Quality Inspection/Blocked Stock, 재고전기 |
| SAP S/4HANA PP/PP-PI | 생산/공정오더, Routing/Recipe, 오더 Release, 생산입고 |
| SAP S/4HANA Batch Management | Batch `Unrestricted/Restricted`, Batch Classification, Batch 사용가능성 |
| SAP S/4HANA SD/ARM | 고객불만 참조 Delivery, Returns Order/Delivery, Replacement/Credit/Repair 프로세스 |
| SAP EWM/QIE | 물리적 격리, Quality Work Center, Inspection Document, Putaway/Scrap/Posting Change |
| SAP Digital Manufacturing for execution | SFC/WIP, 작업 실행, Data Collection, Buyoff, Quality Inspection Result, Nonconformance와 Disposition Routing |
| SAP Cloud Integration | S/4HANA와 SAP DM 사이의 Master/Order/Inspection Characteristic/Result 메시지 연계 |

SAP 공식 통합 경계에서 S/4HANA/ERP는 Master Data의 System of Record이고 SAP DM은 WIP 실행 데이터의 System of Record다. 검사특성은 S/4HANA에서 SAP DM으로 전달하고, SAP DM에서 기록한 검사결과는 S/4HANA QM으로 동기화할 수 있다.

## 4. 생산 전 품질(Pre-Production)

### 4.1 Quality Planning

생산 또는 구매를 Release하기 전에 S/4HANA QM에서 다음 기준을 준비한다.

- Material Master의 QM View와 Inspection Setup
- Inspection Type 활성화
- Master Inspection Characteristic(MIC)
- Inspection Method와 Catalog/Selected Set
- Inspection Plan 또는 Material Specification
- Sampling Procedure와 Sampling Scheme
- Dynamic Modification Rule
- Inspection Point 정의
- 품질인증서 요구사항
- Routing/Recipe의 품질 관련 Operation/Characteristic

### 4.2 공급자 품질관리

- Supplier Master 품질사유 Block
- QM in Procurement Control Key
- Quality Info Record
- 공급자 Release와 유효기간
- Quality Assurance Agreement
- Source Inspection
- 입고검사 수행/생략/강화 정책
- 공급자 평가와 품질수준에 따른 Dynamic Modification

Quality Info Record는 Material-Supplier-Plant 조합을 기준으로 구매/입고 가능 여부와 Source Inspection/입고검사를 제어한다.

### 4.3 SAP DM 실행 준비

- S/4HANA의 Material, BOM, Routing/Recipe, Work Center 전송
- 생산/공정오더와 Inspection Characteristic 전송
- Data Collection 정의
- Quality Inspection POD Plugin 구성
- Buyoff 정의와 권한자 할당
- Work Instruction과 작업자 자격
- Material/Routing/Operation Activity 상태가 `Releasable`인지 확인

### 4.4 생산 전 보류 관문

다음 중 하나라도 충족하지 않으면 생산 또는 구매 Release를 차단한다.

- 승인된 품질계획이 없음
- 공급자/Q-Info가 Block 또는 만료
- Source Inspection/Qualification 결과가 불합격
- 검사특성 또는 허용범위가 누락
- SAP DM Material/Routing/Operation이 `New`, `Hold`, `Obsolete`
- 필수 Data Collection/Buyoff/Work Instruction이 준비되지 않음

이 단계의 보류는 아직 존재하지 않는 WIP나 재고를 격리하는 것이 아니라 공급관계와 실행 마스터의 Release를 막는 예방적 통제다.

## 5. 생산 중 품질(In-Process)

### 5.1 정상 흐름

1. S/4HANA에서 생산오더 또는 공정오더 Release
2. QM Inspection Lot 원산지 `03 Production` 생성
3. Order Operation/Phase와 Inspection Characteristic을 SAP DM으로 전송
4. SAP DM에서 Order 확인·Release 및 SFC 생성
5. 작업자가 SFC를 Start하고 생산 실행
6. Inspection Point, Data Collection, Quality Inspection Result, Buyoff 기록
7. 검사결과를 S/4HANA QM으로 전송
8. S/4HANA의 Characteristic Valuation 결과 확인
9. 적합하면 Operation Complete 및 다음 Operation 진행

공정검사 lot 03은 재고 비관련이다. 따라서 생산 중 품질이상을 실제로 정지시키려면 SAP DM의 SFC Hold 또는 Material/Routing/Operation Hold가 필요하다.

### 5.2 이상 및 부적합 흐름

트리거 예:

- 검사값이 허용범위를 벗어남(OOL)
- Control Limit 이탈
- Buyoff Reject
- 육안/기능검사 불합격
- 잘못된 Component/Tool/Work Instruction 사용
- 작업자 또는 설비 품질 이상

처리:

1. SAP DM Nonconformance Code 기록
2. 대상 SFC에 Hold 적용
3. 필요 시 관련 SFC도 영향범위에 따라 Hold
4. S/4HANA QM 내부문제 Quality Notification Q3 생성 또는 연계
5. 결함, 원인, 책임자, Task/Activity 기록
6. 품질/기술조직이 Disposition 결정

### 5.3 SAP DM Disposition

| 처분 | SAP DM 처리 |
|---|---|
| Rework | NC Routing 또는 Special Routing으로 SFC Disposition → 수리/재작업 → 재검사 → 원 Routing Return |
| Use As Is | 승인정보 기록 → NC Close → SFC Hold Release → 정상공정 계속 |
| Scrap | Disposition Function Routing 또는 Scrap Action → SFC `Scrapped` |
| Return | Return Action으로 이전 Operation 또는 지정 Operation 복귀 |

SFC Hold, SAP DM NC, S/4HANA Quality Notification은 서로 다른 객체다. 한 객체의 상태 변경이 다른 객체를 자동으로 종결한다고 가정하면 안 되며, 필요한 경우 SAP 표준 Integration/API 또는 구성된 Workflow로 연결한다.

## 6. 생산 후 품질(Post-Production)

### 6.1 생산입고 검사

1. 최종 Operation 완료 및 생산입고
2. Inspection Lot 원산지 `04 Goods Receipt from Production` 생성
3. 생산입고 수량을 Quality Inspection Stock으로 전기
4. Batch/Serial/Genealogy와 생산실적 정합 확인
5. 최종검사, 포장검사, 출하검사, 품질인증서 확인
6. 검사결과 및 Defect 기록
7. Inspection Completion
8. Usage Decision
9. Usage Decision에 따른 Stock Posting

### 6.2 Usage Decision과 재고처분

| 판정 | 대표 후속조치 |
|---|---|
| Accept | Unrestricted-Use Stock 또는 허용된 Stock으로 전기 |
| Partial Accept | 합격수량만 Release하고 잔량은 Inspection/Blocked 상태 유지 |
| Restricted Use | Batch Status/Stock Type 정책에 따라 Restricted 사용 |
| Rework | Rework Storage/Order로 이동 후 재작업·재검사 |
| Reject | Blocked Stock, Return, Scrap 등으로 전기 |

Quality Inspection Stock에서 재고를 빼는 정식 관문은 Usage Decision과 Stock Posting이다. Usage Decision이 입력됐더라도 미전기 잔량이 남을 수 있으므로 Outstanding Stock Posting을 별도로 감시한다.

### 6.3 Batch와 반복검사

- Batch Status `Unrestricted/Restricted`
- Batch Classification에 검사결과 반영
- Batch Determination에서 품질특성 사용
- 품질인증서 생성
- Inspection Lot 원산지 `09 Recurring Inspection`
- 유효기간/Next Inspection Date 도래 시 재검사
- 새 품질신호 발생 시 Batch Restricted 또는 재고 재보류

## 7. 고객 불만(Customer Complaint)

### 7.1 접수와 초기 봉쇄

1. S/4HANA QM Customer Complaint Quality Notification `Q1` 생성
2. Customer, Material, Batch, Delivery, Sales Order, Inspection Lot, Serial Number 등 참조객체 연결
3. Problem/Defect Item, Priority, Partner, Coordinator 기록
4. 고객 접수 회신과 내부 영향범위 추적을 병렬 수행
5. 영향 Batch/재고는 Restricted/Inspection/Blocked 상태로 제어
6. 아직 생산 중인 관련 SFC가 있으면 SAP DM Hold

### 7.2 반품과 검사

- SD/ARM에서 Returns Order와 Returns Delivery 생성
- 반품입고를 Blocked Stock Returns 또는 Inspection Stock으로 격리
- QM Inspection Lot 원산지 `06 Return from Customer` 또는 물류 시나리오에 따른 `05`
- EWM을 쓰면 Quality Work Center로 이동해 Inspection Document 처리
- 기술검사, 결과, Defect, Decision 기록
- Putaway, Blocked Stock, Repair, Return, Scrap 등 Follow-Up Action

### 7.3 원인·조치·종결

Quality Notification에서 다음 정보를 관리한다.

- Defect Item
- Cause
- Task
- Activity
- Partner/Responsible Person
- Due Date와 Response Monitoring
- Action Log
- Follow-Up Action

처분은 Repair/Rework, Replacement/Credit, No Fault Found Return, Scrap/Field Action 등으로 나뉠 수 있다.

종결 전 확인:

1. 직접 원인과 근본원인 확인
2. 즉시조치와 시정/예방 Task 완료
3. 공정·Inspection Plan·공급자 관리기준 변경
4. 효과검증과 재발 모니터링 완료
5. 조사 완료된 Batch/Serial/SFC만 선택적으로 Hold 해제
6. 고객 최종회신과 Q1 Notification 완료

## 8. 횡단 품질활동

| 활동 | SAP 제품 기능 |
|---|---|
| 품질기본정보 | Material QM View, MIC, Inspection Method, Catalog, Selected Set |
| 검사계획 | Inspection Plan, Material Specification, Sampling, Dynamic Modification |
| 공급자 품질 | Supplier Block, QM Procurement Key, Quality Info Record, Source Inspection, Q2 Supplier Complaint |
| 내부 부적합 | Defect Recording, Q3 Internal Problem, Follow-Up Action |
| WIP 품질 | SAP DM Data Collection, Quality Inspection, Buyoff, NC, SFC Hold |
| 재고 품질 | Inspection Lot, Quality Inspection/Blocked Stock, Usage Decision |
| Batch 품질 | Batch Status, Classification, Batch Determination |
| 고객 품질 | Q1 Customer Complaint, ARM/EWM Return, Repair/Replacement |
| 감사 | Inspection Lot 원산지 `07 Audit` 및 Audit Management 시나리오 |
| 반복검사 | Inspection Lot 원산지 `09 Recurring Inspection` |
| 교정검사 | Maintenance Order 기반 원산지 `14` Calibration Inspection |
| 출하검사 | 원산지 `10/11/12` Delivery Inspection 시나리오 |
| 품질문서 | Quality Certificate, Inspection Instruction, Result/Defect Record |
| 분석 | Quality Score, Quality Level, Control Chart/SPC, Notification/Defect 분석 |

## 9. 적용 시 반드시 결정할 항목

1. Material별 활성 Inspection Type과 Lot Origin
2. Inspection Lot이 Stock-Relevant인지 여부
3. Usage Decision Code와 Stock Posting/Follow-Up Action 매핑
4. Supplier/Q-Info Block 범위와 유효기간
5. SAP DM에서 Hold를 적용할 대상: Material, Routing, Operation, SFC
6. NC Code Hierarchy와 NC/Special/Disposition Function Routing
7. Use As Is, Rework, Scrap 승인 권한
8. S/4HANA Quality Notification과 SAP DM NC의 상호참조 방식
9. Batch Restricted와 Quality Inspection/Blocked Stock의 병행 규칙
10. 부분수량 Hold/Release와 Serial/Batch 처리
11. EWM/QIE 또는 ARM 사용 여부
12. Integration 실패 시 재처리, 중복방지, 상태불일치 모니터링

## 10. 품질보류 후 BOM·라우팅 개정과 PP/DS 재계획

### 10.1 스윔레인과 책임 경계

[05-quality-hold-ppds-master-change.bpmn](05-quality-hold-ppds-master-change.bpmn)은 시스템 간 책임을 다음 5개 수평 스윔레인으로 구분한다. 시스템 경계를 명확히 하기 위해 각 스윔레인을 BPMN Participant/Pool로 표현하고, 시스템 간 전달은 Message Flow로 연결했다.

| 스윔레인 | 책임 |
|---|---|
| 품질·기술변경 관리 | NCR/Q3와 PP/DS 영향 검토, Change Number/Revision, 신규 BOM·Routing·생산버전 승인, 최종 생산재개 승인 |
| SAP S/4HANA QM·PP | Q3·검사 Lot·Batch/재고 봉쇄, 오더 착수사실 확인, PP Master Data 재읽기 또는 대체오더 생성, 구성품·부모오더 실행조치 |
| SAP S/4HANA PP/DS | 보류 생산입고 조정, Pegging 영향추적, PDS 생성, 미착수 계획오더 재전개, 자재·능력·상위오더 재계획 |
| SAP Digital Manufacturing | NC 기록, SFC Hold, 실제 착수이력 판정, Order BOM/Routing Upversion, 미착수 SFC 선별 변경과 Release |
| 생산관리·현장 | 설비/WIP 안전정지, 구성품·Batch 물리격리, 실제 착수·투입상태 확인, 승인 개정과 작업문서 확인 후 재개 |

### 10.2 핵심 분기

1. 품질이상이 검출되면 SAP DM에서 영향 SFC를 Hold하고 S/4HANA QM에서 Q3, 검사 Lot, Batch와 재고 영향범위를 봉쇄한다.
2. S/4HANA의 Confirmation, GI/Backflush, GR/Delivery, 외주 PO, 검사 Lot과 SAP DM SFC 이력을 함께 확인한다. `REL` 상태만으로 미착수를 판정하지 않는다.
3. 생산을 시작했거나 상태가 불명확한 오더/SFC는 신규 개정 적용대상에서 제외하고 기존 Order BOM·Routing으로 재작업, 특채 또는 폐기한다.
4. 완전 미착수 오더만 신규 생산버전과 PDS 적용대상으로 선택한다.
5. PP/DS 계획오더는 Firming과 Fixed Pegging을 검토한 후 신규 PDS로 재전개하거나 삭제·재생성한다.
6. S/4HANA 생산오더는 `Read PP Master Data`가 허용되면 신규 Production Version, Revision, Explosion Date로 BOM·Routing을 다시 읽고 재검증·재릴리즈한다.
7. 확정, 자재불출, 외주 PO, 검사 Lot 등으로 재읽기가 제한되면 미착수 잔량을 신규 생산오더로 생성하고 기존 오더의 잔량, 예약과 페깅을 정리한다.
8. SAP DM에 이미 릴리즈된 미착수 SFC는 `SupportChangeAfterRelease`와 Order BOM/Routing Upversion을 사용한다. 동일 오더에 착수 SFC가 섞였으면 Production Change API로 미착수 SFC만 선별하거나 잔량 오더를 분리한다.

### 10.3 종속자재와 부모오더

- 이미 투입·불출된 구성품은 SFC Hold나 마스터 재읽기만으로 자동 원복되지 않는다. 기존 오더 소비, 불출취소, 재작업 또는 폐기 중 하나로 명시적으로 처분한다.
- 미투입 구성품은 신규 BOM 기준으로 예약을 재생성하고, 라인 공급분은 반납 또는 재할당한다.
- 의심 Batch/수량만 Quality Inspection, Blocked 또는 Restricted 상태로 격리한다. 공용 정상재고와 다른 오더용 공급 전체를 일괄 보류하지 않는다.
- PP/DS에서는 보류된 생산품의 예상입고일을 지연하거나 예상수량을 줄인 뒤 Dynamic/Fixed Pegging을 다시 평가한다.
- PP/DS가 부모오더의 부족과 지연을 산출해도 부모오더가 자동 Hold되지는 않는다. S/4HANA와 SAP DM에서 영향받는 부모오더/SFC만 명시적으로 지연, Hold 또는 대체공급 처리한다.

### 10.4 생산재개 관문

다음 조건이 모두 충족된 후 신규 개정 SFC를 Release한다.

1. 신규 BOM, Routing, Production Version과 PDS의 유효성·Lot Size 정합
2. 미착수 계획오더와 생산오더의 신규 개정 적용 완료
3. 구성품 가용성, 대체자원, 능력과 상세일정 검증
4. Dynamic/Fixed Pegging과 부모오더 영향조치 완료
5. SAP DM Order BOM/Routing Upversion 및 SFC별 버전 할당 완료
6. 작업지시, 품질특성, Batch와 현장 문서 준비 완료
7. 품질·기술 조직의 생산재개 승인

### 10.5 고객 설명용 06 다이어그램

[06-quality-hold-customer-view.bpmn](06-quality-hold-customer-view.bpmn)은 05의 기술 상세를 삭제하거나 대체한 문서가 아니다. 고객 협의와 업무 설명에 먼저 사용할 수 있도록 05에서 조정한 좌우 배치와 위·아래 예외 분기를 따르면서, 화면에 보이는 문구를 업무용어 중심으로 다시 구성한 버전이다.

왼쪽에서 오른쪽으로 다음 순서로 읽는다.

1. 생산 전, 생산 중, 생산 후 또는 고객 불만에서 품질문제를 접수한다.
2. 문제 제품·재고·배치를 격리하고 SAP DM의 현장 작업을 즉시 중단한다.
3. 작업실적과 자재투입 이력으로 생산 착수 여부를 확인한다.
4. 생산 중인 작업은 기존 생산기준을 유지하고, 완전히 미착수한 오더만 변경대상으로 선택한다.
5. 변경이 승인되면 새 자재목록·작업순서를 계획오더, 생산오더와 현장 작업에 반영한다.
6. PP/DS가 종속자재, 상위제품, 설비능력과 고객 납기를 다시 계산한다.
7. 변경오더, 실행가능 일정, 자재·현장 준비와 품질승인이 모두 갖춰진 뒤 생산을 재개한다.

| 고객 설명 용어 | SAP 용어 |
|---|---|
| 자재목록 | BOM |
| 작업순서 | Routing 또는 Recipe |
| 적용조합 | Production Version |
| 계획용 생산구조 | PDS |
| 공급과 상위제품 수요의 연결관계 | Pegging |
| 현장 개별 작업단위 | SFC |
| 현장 작업중단 | SFC Hold |
| 생산오더에 새 기준 다시 읽기 | Read PP Master Data |

## 11. SAP 공식 근거

확인 기준일: 2026-07-29. 적용 전 실제 사용 릴리스의 SAP Help와 SAP Note를 다시 확인한다.

### SAP S/4HANA QM

- [Quality Planning](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/9905622a5c1f49ba84e9076fc83a9c2c/6b8fee002c984e159a57f39f1617b691.html)
- [Quality Information Record](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/2bc3ee8d1c83404e8cf62418640004f2/494cbf53f106b44ce10000000a174cb4.html)
- [Blocking a Supplier](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/2bc3ee8d1c83404e8cf62418640004f2/9717bf53d25ab64ce10000000a174cb4.html)
- [Inspection Lot Origin](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/2bc3ee8d1c83404e8cf62418640004f2/3a14c453f57eb44ce10000000a174cb4.html)
- [Inspections During Production](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/2bc3ee8d1c83404e8cf62418640004f2/1f14c453f57eb44ce10000000a174cb4.html)
- [Early Inspection for a Goods Receipt](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/2bc3ee8d1c83404e8cf62418640004f2/1214c453f57eb44ce10000000a174cb4.html)
- [Inspection for a Goods Receipt](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/2bc3ee8d1c83404e8cf62418640004f2/2514c453f57eb44ce10000000a174cb4.html)
- [Inspection Lot Completion](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/2bc3ee8d1c83404e8cf62418640004f2/c164ba53422bb54ce10000000a174cb4.html)
- [Batch Status Management](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/4eb099dbc8a6435c9b36a854a7e05522/04feb753128eb44ce10000000a174cb4.html)
- [Customer Complaint](https://help.sap.com/docs/SAP_S4HANA_ONPREMISE/2bc3ee8d1c83404e8cf62418640004f2/046db6535fe6b74ce10000000a174cb4.html)
- [Quality Notification](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/21aead0c98bd4755abdacd91c99e3393/1c78b8535c39b44ce10000000a174cb4.html)
- [Inspection for a Customer Return](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/2bc3ee8d1c83404e8cf62418640004f2/2e14c453f57eb44ce10000000a174cb4.html)
- [Inspections After Goods Receipt](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/9832125c23154a179bfa1784cdc9577a/63ab871fb5be41b793aa9f8da569a8b0.html)
- [Customer Returns with Quality Inspections](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/9832125c23154a179bfa1784cdc9577a/4b85271f29dd419e8688650174a8376c.html)

### SAP Digital Manufacturing

- [Business Integration with SAP S/4HANA or SAP ERP](https://help.sap.com/docs/sap-digital-manufacturing/integration-guide/business-integration-with-sap-s-4hana-or-sap-erp)
- [Manage Materials](https://help.sap.com/docs/sap-digital-manufacturing/execution/manage-materials)
- [Creating Routings](https://help.sap.com/docs/sap-digital-manufacturing/execution/creating-routings)
- [Manage Operation Activities](https://help.sap.com/docs/sap-digital-manufacturing/execution/manage-operation-activities)
- [Transferring Inspection Characteristics](https://help.sap.com/docs/sap-digital-manufacturing/integration-guide/inspection-characteristics-integration-process-order-and-order-based-production-order)
- [Recording Quality Inspection Results](https://help.sap.com/docs/sap-digital-manufacturing/execution/recording-quality-inspection-results)
- [Placing and Releasing Holds](https://help.sap.com/docs/sap-digital-manufacturing/execution/placing-and-releasing-holds)
- [Manage Holds](https://help.sap.com/docs/sap-digital-manufacturing/execution/manage-holds)
- [SFC Statuses](https://help.sap.com/docs/sap-digital-manufacturing/execution/sfc-statuses)
- [Nonconformances](https://help.sap.com/docs/sap-digital-manufacturing/execution/nonconformances-c10c7cea906f45dfa17801b4141c4a1e)
- [Nonconformance Disposition Routings](https://help.sap.com/docs/sap-digital-manufacturing/execution/nonconformance-disposition-routings)
- [Manage Buyoffs](https://help.sap.com/docs/sap-digital-manufacturing/execution/manage-buyoffs)
- [Updating Orders After the Release](https://help.sap.com/docs/sap-digital-manufacturing/execution/updating-orders-after-release)
- [Enabling the Upversioning of Order BOMs](https://help.sap.com/docs/sap-digital-manufacturing/execution/enabling-upversioning-of-order-boms-for-production-orders)
- [Production Change API](https://help.sap.com/docs/sap-digital-manufacturing/apis/production-change)

### SAP S/4HANA PP와 PP/DS

- [Reading Master Data](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/34de0103497c4b80a7c7fbf6952ff971/bb01b753128eb44ce10000000a174cb4.html)
- [Criteria for a Single Order](https://help.sap.com/docs/PRODUCT_ID/bfece09273bd474d82fdd97bae070c25/2201b753128eb44ce10000000a174cb4.html)
- [Production Data Structure (PDS)](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/f899ce30af9044299d573ea30b533f1c/e52ff9504a62eb5ee10000000a44538d.html)
- [Conversion from PP/DS with Forced BOM Explosion](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/f899ce30af9044299d573ea30b533f1c/d839c95360267614e10000000a174cb4.html)
- [Pegging](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/f899ce30af9044299d573ea30b533f1c/02e4ab50135e0c0be10000000a423f68.html)
