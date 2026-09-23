# PRD — 마루 MDM (dmes-standard 개발분)

> version: 1.0 · 작성: 2026-09-23 · 상태: WBS 부트스트랩용
> 원천 설계가 정본이고, 이 문서는 범위와 우선순위를 확정한 요약본이다.
> 원천 위치는 `docs/mdm/design/basic/` 이다. 이 경로는 `/Users/jji/project/mdm/docs/design/basic/` 으로 가는 심볼릭 링크다.
> 설계가 바뀌면 이 문서가 아니라 원천 설계를 고치고, 이 문서는 범위·우선순위만 다시 맞춘다.

## 0. 참고 문서 (Reference)

아래 링크는 이 파일(`docs/mdm/PRD.md`) 기준 상대 경로다.

| 영역 | 설계 문서 | HTML 시안 |
|---|---|---|
| A. 용어·도메인·컬럼 | [02-term-domain-column.md](design/basic/02-term-domain-column.md) | [02-term-domain-column.html](design/basic/html/02-term-domain-column.html) |
| B. 인터페이스 레이아웃 | [03-interface-layout.md](design/basic/03-interface-layout.md) | [03-interface-layout.html](design/basic/html/03-interface-layout.html) |
| C. 마스터코드 (전체 방식) | [04-master-code-deploy-full.md](design/basic/04-master-code-deploy-full.md) | [04-master-code.html](design/basic/html/04-master-code.html) |
| D. 마스터데이터 | [05-master-data.md](design/basic/05-master-data.md) | [05-master-data.html](design/basic/html/05-master-data.html) |
| E. 업무기준(룰) | [06-business-rule.md](design/basic/06-business-rule.md) | [06-business-rule.html](design/basic/html/06-business-rule.html) |

맥락 문서:
- [01-mdm-overview.md](design/basic/01-mdm-overview.md): 역할, 화면 총괄, 아키텍처
- [07-deploy.md](design/basic/07-deploy.md): 배포 방법. 아직 미결이다
- [08-approval.md](design/basic/08-approval.md): 결재. 04·06 규칙을 모은 문서다
- [evalex-guide.md](design/basic/evalex-guide.md): EvalEx 표현식 계약
- [workrule-column-design.md](design/basic/workrule-column-design.md): 작업기준 열 설계
- [README.md](design/basic/README.md): 설계 문서 구성
- 검증 자산: [sql/04-code-exists.sql](design/basic/sql/04-code-exists.sql), [sql/04-chg-seq-sim.py](design/basic/sql/04-chg-seq-sim.py), [sql/04-hier-tree-sim.py](design/basic/sql/04-hier-tree-sim.py)
- 기술 요구사항: [TRD.md](TRD.md)
- 작업 목록: [wbs.md](wbs.md)

## 1. 목적

MDM 은 시스템(ERP·MES·APS 등) 사이에서 필드명·코드·용어·업무기준의 의미를 일치시키는 **표준 원장과 중계 역할**이다.
이번 개발 범위는 다섯 영역이다.

| 영역 | 원천 설계 | 한 줄 요약 |
|---|---|---|
| A. 용어·도메인·컬럼 사전 | 02 | 용어 → 도메인(타입·길이·단위·EvalEx 검증식, 단일 상속) → 컬럼(용어 조합 + 도메인 참조) 3계층 사전과 단위 마스터. 저장 즉시 변경분 배포 |
| B. 인터페이스 레이아웃 | 03 | 고정 길이 전문(EAI 헤더 + 업무 본문) 정의. 항목 타입·길이는 컬럼 사전→도메인에서 파생, 오프셋 자동 계산, 스냅샷 버전 배포 |
| C. 마스터코드 | 04 (배포 **전체 방식**) | 승인 단위 버전 + 행 단위 선분 이력, 카테고리(REGEX/TABLE), 상신·결재·적용시점, 마루 코드 단위 전체 동기화 |
| D. 마스터데이터 | 05 | 버전·승인 없이 저장 즉시 변경분 배포, 일시 축 선분 이력, 원천(MDM/EXTERNAL)별 입력·수신 |
| E. 업무기준(룰) | 06 | 의사결정표·산출 룰·룰 세트, 룰 단위 버전·승인·배포, 공통 평가 엔진 `maru-mdm-engine` |

공통 기반: 시스템 원장 `TB_MDM_SYSTEM`, 결재·버전 상태기계(08, C·E 공유), 배포 순번·묶음·수신 API 골격(A·B·C·D·E 공유), 평가 엔진 jar(A·B·C·D·E 공유).

## 2. 원천 문서 간 우선순위 (충돌 해소 규칙)

1. 영역 문서 02~06 이 우선한다 (01 머리말, 사용자 결정 2026-09-09).
2. 08(결재)은 04·06 규칙의 모음이다. 08 과 04·06 이 다르면 04·06 이 이긴다. 예: 상신 시 검사는 04 의 8항을 따른다(08 은 5항).
3. 01 은 요구의 출처일 뿐이고, 02~08 이 조정한 내용이 우선한다.
4. HTML 목업은 화면 구성 참고용이다. 목업에만 있고 문서 「화면」 절에 없는 화면은 이번 범위에서 **개발 Task 를 만들지 않고** 조사 Task 하나로 묶는다(§5).
5. 마스터코드 배포는 사용자가 지정한 `04-master-code-deploy-full.md`(전체 방식)를 따른다. 02·05 는 각 문서대로 변경분(`chg_seq`) 방식이다.
6. 테이블 이름은 `TB_MDM_*` 를 쓴다(사용자 결정 2026-09-23. 예전 표기 `MD_UNIT` → `TB_MDM_UNIT`). 원천 설계 문서·HTML 시안·sql 도 같은 날 `TB_MDM_*` 로 바꿨다.

## 3. 사용자와 역할

| 역할 | 하는 일 | 근거 |
|---|---|---|
| 표준 관리자 | 용어·도메인·컬럼·단위·레이아웃 등록·수정(저장 즉시 배포) | 01 원칙 3, 02·03 |
| 담당자 | 마루 코드·마루 데이터·룰의 정의 편집, DRAFT 작성·상신 | 04·05·06, 08 |
| 결재자 | 마루 코드·룰 버전 승인·반려·승인 취소 | 08 |
| 원천 시스템(API) | EXTERNAL 원천의 코드·데이터·룰을 수신 API 로 전송 | 04·05·06 「수신」 |

역할을 기존 RBAC(`TB_MCM_SEC_*`)에 어떻게 두는지는 TRD §6 과 설계 Task 에서 정한다.

## 4. 기능 요구사항 (Functional Requirements)

### FR-A 용어·도메인·컬럼 사전 (02)
설계 [02-term-domain-column.md](design/basic/02-term-domain-column.md) · 시안 [02-term-domain-column.html](design/basic/html/02-term-domain-column.html)

- FR-A1 용어 관리: (표기, 의미 번호) 키, 정의 필수, 약어 유일, 동의어·별칭·사용 시스템, 유사어 추천(1차 문자열, 2차 임베딩), 동의어 확정.
- FR-A2 도메인 관리: 단일 상속 트리(종류·타입·단위 고정, 길이·소수 좁히기, 식 AND 누적, CODE 참조 대체), 표준식(화면+서버)·비즈니스식(서버 전용) 두 칸, 저장 거부 조건 10종, 테스트 케이스 실행, 영향도(하위 도메인·참조 컬럼·룰 결과 변수·레이아웃·배포 시스템).
- FR-A3 컬럼 사전: 한국어 논리명 → 최장 일치 분해 → 동의어 치환 → 미등록 용어(`***`) 인라인 등록 → 물리명 자동 생성·도메인 추천·중복 검사, 역분해, 표시명 3종(24/12/6), 시스템별 실제 필드명 매핑.
- FR-A4 단위 마스터: 차원·기준 단위·환산 계수, 같은 차원 안에서만 변환.
- FR-A5 사전 수신 시스템 지정(`TB_MDM_DICT_SYSTEM`)과 변경분 배포(배포 순번 `TB_MDM_DICT_SEQ`, 사건 하나에 순번 하나, 부모 변경 시 하위 트리 전체).
- FR-A6 초기 적재: `TB_MDM_SYSTEM`, SAP 데이터 엘리먼트 기반 용어·도메인·컬럼 후보 추출.

### FR-B 인터페이스 레이아웃 (03)
설계 [03-interface-layout.md](design/basic/03-interface-layout.md) · 시안 [03-interface-layout.html](design/basic/html/03-interface-layout.html)

- FR-B1 전문 헤더 정의(EAI·인코딩·패딩, 헤더 항목은 컬럼 사전 검색으로 추가).
- FR-B2 전문 레이아웃: 헤더 구성(구성 잠김, 상수만 재정의), 본문 항목(fill_kind DATA/CONST/AUTO/FILLER), 오프셋·총 길이 자동 계산.
- FR-B3 등록 검증 7종과 샘플 전문 렌더.
- FR-B4 버전 이력, 레이아웃 스냅샷 JSON·엑셀 출력, 영향도.
- FR-B5 직렬화기·파서 라이브러리(인코딩 바이트 길이, 암묵 소수점, AUTO 채움, 단위 경계 변환)와 스냅샷 배포.
- 헤더 다중 적층(목업) 대 전문당 헤더 하나(md)는 설계 Task 에서 먼저 확정한다.

### FR-C 마스터코드 (04, 전체 방식)
설계 [04-master-code-deploy-full.md](design/basic/04-master-code-deploy-full.md) · 시안 [04-master-code.html](design/basic/html/04-master-code.html)

- FR-C1 마루 코드 조회·등록(MDM 원천 / EXTERNAL 원천), 수정(헤더·배포 대상·추가 컬럼 라벨·폐기).
- FR-C2 버전: major/minor 채번, 새 버전(빈 버전 / 복원), 미적용 버전 하나 규칙, DRAFT 선점·해제·넘기기.
- FR-C3 코드 편집: 선분(from_ver–to_ver) 조작, 행 되돌리기, 계층 칸 lvl1–5, 추가 컬럼 attr01–10, 트리 보기, 경미 수정(결재 없음).
- FR-C4 카테고리: BASE 예약, REGEX(정규식 전체 일치), TABLE(이중 목록 소속 관리), 해석 결과 미리보기.
- FR-C5 상신(검사 8항, 적용시점 하한, 긴급), 결재(diff, 승인·반려·승인 취소), 배포·철회, CREATED→INUSE 자동 전이.
- FR-C6 전체 방식 배포(한 스냅샷, `to_ver`·`apply_to` 가림, 묶음 헤더의 원장 코드), EXTERNAL 수신 API(VERSION/CANCEL/DEPRECATE)와 수신 로그 화면.

### FR-D 마스터데이터 (05)
설계 [05-master-data.md](design/basic/05-master-data.md) · 시안 [05-master-data.html](design/basic/html/05-master-data.html)

- FR-D1 마루 데이터 조회·등록·수정(헤더·배포 대상·라벨·계층 칸 수·폐기), 카테고리 편집(REGEX/TABLE, 선분).
- FR-D2 항목 관리: 서버 페이징 목록·트리 보기, 인라인 편집, 닫기·다시 열기, 원천별 읽기 전용, 낙관적 잠금.
- FR-D3 CSV 업로드(검증 후 오류 0건일 때 한 트랜잭션·순번 하나), 항목 이력(선분 타임라인).
- FR-D4 EXTERNAL 수신 API(요청 단위 거부, 행별 action)와 수신 로그 화면, 변경분 동기화 송신.

### FR-E 업무기준 (06)
설계 [06-business-rule.md](design/basic/06-business-rule.md) · 시안 [06-business-rule.html](design/basic/html/06-business-rule.html) · 엔진 [evalex-guide.md](design/basic/evalex-guide.md)

- FR-E1 룰 조회·등록(MDM/EXTERNAL), 룰 화면 골격(헤더·버전 목록·소유권·배포 대상·활용처).
- FR-E2 의사결정표 편집(조건 열 표시 타입 Equal/1/2/Expression, 적중 정책 5종, 기본 행), 열 설정 표, 피벗 보기, 결과 열 그룹, 산출 룰(DERIVE), 입력 계약 표.
- FR-E3 저장 시 검사 20여 종(겹침·빈틈·도달 불가 포함), Expression 자동완성·서버 미리보기.
- FR-E4 값 테스트(편집본/저장 버전)·테스트 케이스, 상신(테스트 케이스 전부 통과, 룰 참조 검사, 적용시점 하한).
- FR-E5 룰 세트 조회·등록·편집(실행 순서, 입출력 표, 위상 정렬 제안), 저장 즉시 배포.
- FR-E6 룰 배포 스냅샷·정의 조회 API(`view`), EXTERNAL 수신 API·수신 로그.
- FR-E7 평가 엔진 `maru-mdm-engine`: EvalEx 3.7.0 설정 고정, 허용 함수 집합, `MASTER`/`MASTER_AT`/`CODE_LIST`, 카테고리 해석·버전 선택, 도메인 검증기, 의사결정표 엔진, op-code 생성기, DB·네트워크 무의존.

### FR-F 공통
설계 [08-approval.md](design/basic/08-approval.md) · [07-deploy.md](design/basic/07-deploy.md) · [01-mdm-overview.md](design/basic/01-mdm-overview.md)

- FR-F1 결재 공통 화면(상신 목록, diff, 승인·반려·승인 취소)과 버전 상태기계 서비스(04·06 공유).
- FR-F2 배포 코어: 배포 순번 발급, 한 스냅샷 읽기, 묶음 헤더(원장 코드), 전달 어댑터, 주기 pull 안전망.
- FR-F3 수신 API 골격: 인증으로 원천 시스템 확인, 수신 로그 2단 커밋(수신 즉시 1행 → 처리 트랜잭션 → 실패 시 FAILED 별도 커밋).

## 5. 범위 밖 (Out of Scope)

| 항목 | 이유 |
|---|---|
| 계산수식 표준·결과값 상호 검증(01 §5) | 사용자가 지정한 설계 문서 범위 밖 |
| 작업기준 표준 vs 실적 비교, DKMS 연계 조회(01 §7) | 같은 이유. 작업기준 **표현**(결과 열 그룹 등)은 06 에 포함 |
| 2안 판정 서비스(`deploy_kind=RESULT`) | 07 미결. 06 결정대로 DEF 만 구현 |
| 시험 사본·머지(06) | 보류 |
| 채번(고객마스터 등) | 01 결정 2026-09-09, 따로 구현 |
| 시스템 마스터 화면, 통합 검색 | 01 결정 2026-09-09. `TB_MDM_SYSTEM` 은 초기 적재 |
| 하위 시스템 쪽 사본 수신 워커·사본 조회 API | 하위 시스템 몫. 통합테스트용 **수신 스텁**만 만든다 |
| 목업 전용 화면: 04 「배포와 사본」, 05 「배포 순번」, 02 사전 수신 시스템의 `last_seq_received` 표시 | 문서 「화면」 절에 없고 07 §6-1 전달 로그 결정에 종속. 배포·수신 설계 Task 에서 결정 후 추가 여부를 정한다 |
| 기존 As-Is 마스터코드·업무기준(mcm `cma`/`cmb`) 이관 | 신규 MDM 과 병존. 이관은 별도 과제(06 미결 10) |

## 6. 인수 조건 (Acceptance Criteria)

- AC-1 각 영역 문서의 샘플·예시가 테스트 케이스로 재현된다.
  - 02 「배포 순번」 예시 D1~D6
  - 04 「샘플 데이터」 해석 결과와 판정 표. `sql/04-code-exists.sql` 결과와 일치하고, `sql/04-chg-seq-sim.py --mode full` 시뮬레이터 9,000회에서 불일치 0건
  - 05 「예」 E1~E6·X1~X4, PORT 판정 7케이스
  - 06 샘플 룰(QLTY_GRD_JDG, COIL_WGT_CALC, PROD_WGT_CALC, BASE_SPD_LKP)의 값 테스트 결과
- AC-2 저장 거부 조건은 문서에 열거된 전부가 서버에서 거부된다. 화면 검사만으로 통과시키지 않는다.
  - 02 도메인 10종, 03 등록 검증 7종, 04 저장 검사와 상신 검사 8항, 05 검사 1~7, 06 저장 시 검사
- AC-3 서버 엔진과 화면 JS 평가기가 정합성 코퍼스에서 같은 결과를 낸다(불일치 0건). 다를 때는 서버가 기준이다.
- AC-4 결재 대상(04·06 MDM 원천)은 승인 없이 RELEASED 가 되지 않는다. 결재 비대상(02·03·05·룰 세트)은 저장 커밋이 곧 배포 시작이다.
- AC-5 배포 묶음은 한 스냅샷에서 읽고 원장 코드를 헤더에 싣는다. 수신 스텁이 옛 묶음을 버리고 멱등 적용한다.
- AC-6 EXTERNAL 원천 대상은 화면에서 편집 버튼이 없고, MDM 원천 대상은 수신 API 가 거부한다.

## 7. 비기능 요구사항 (Non-functional Requirements)

- NFR-1 성능: 화면 AST 평가 1건 0.3~2.7µs, 1만 행 판정 100 ms 이내(02 「실행 지점」). 서버 룰 판정은 컴파일 캐시를 쓴다.
- NFR-2 결정성: op-code 생성기는 같은 입력에 바이트 단위로 같은 EvalEx 텍스트를 낸다.
- NFR-3 동시성: 배포 순번은 한 문장 갱신으로 직렬화한다. 편집 충돌은 `row_version` 낙관적 잠금으로 막는다.
- NFR-4 가용성: MDM 은 단일 장애점이 아니다. 하위 시스템은 마지막 배포본으로 독립 운영하고, MDM 은 실시간 조회 API 를 하위 시스템 판정 경로에 두지 않는다(01 원칙 1).
- NFR-5 보안: 모든 업무 API 는 RBAC PermKey 로 인가하고, 수신 API 는 호출 시스템을 인증으로 확인한다.
- NFR-6 이식성: 원장 DDL 은 SQLite(로컬)와 MSSQL(운영) 두 방언으로 작성한다. 엔진 jar 는 EvalEx 외 의존이 없다.

## 8. 제약 사항 (Constraints)

- dmes-standard 저장소 규칙(RULE.md)을 따른다: MES 개발 분기, 화면별 설계 산출물 5종, OASIS BPMN 업무 API, RBAC 경로 규약.
- 원장 내부 FK 는 걸고, 하위 업무 테이블에서 MDM 으로 가는 FK 는 걸지 않는다(02 「ERD 읽는 법」).
- 파생값(유효 식·유효 AST·요구 변수 등)은 저장하지 않는다(02).
- 마스터코드·마스터데이터는 도메인에 의존하지 않는다(01 원칙 8).

## 9. 용어 정의 (Glossary)

| 용어 | 뜻 |
|---|---|
| 마루 코드 / 마루 데이터 / 마루 룰 | MDM 이 관리하는 코드 묶음·데이터 묶음·룰 하나의 단위(ID 이름 공간은 코드와 데이터가 공유) |
| 원천(source_kind) | MDM(화면 입력) 또는 EXTERNAL(수신 API) |
| 선분 | 행의 유효 구간. 04 는 버전 축(from_ver–to_ver), 05 는 일시 축(valid_from–valid_to) |
| 배포 순번(chg_seq) | 배포 사건마다 하나씩 오르는 번호. 받는 쪽은 자기가 받은 순번보다 작거나 같은 묶음을 버린다 |
| 전체 방식 / 변경분 방식 | 마루 코드 전체를 보내 사본 교체 / 바뀐 행만 보냄 |
| 적용시점(apply_from) | 버전이 효력을 갖기 시작하는 시각. 하한 규칙은 08 |
| op-code | 의사결정표 셀의 구조화된 조건. 생성기가 EvalEx 텍스트로 바꾼다 |
