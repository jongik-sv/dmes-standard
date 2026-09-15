# 마루 MDM 기본설계 문서 구성

| 파일 | 내용 |
| --- | --- |
| `01-mdm-overview.md` | MDM의 역할, 마스터코드/마스터데이터 구분, 배포 방식, 필요 화면 및 기능 총괄, 전체 아키텍처 |
| `02-term-domain-column.md` | 용어 → 도메인 → 컬럼 3계층, 도메인 상속·검증식·제약, 단위, 테이블 설계(MD_SYSTEM/MD_UNIT/MD_TERM/MD_DOMAIN/MD_COLUMN/MD_COLUMN_SYSTEM/MD_DICT_SEQ/MD_DICT_SYSTEM), 조회 함수 `CODE_EXISTS` → `MASTER`(2026-09-08), 배포는 **변경분 방식**(행마다 배포 순번, 축은 사전 전체 하나, 2026-09-09) |
| `03-interface-layout.md` | 인터페이스 레이아웃(EAI 헤더 + 업무 본문, fill_kind, MD_EAI/MD_LAYOUT/MD_LAYOUT_ITEM) |
| `04-master-code.md` | 마스터코드(마루 코드·버전·카테고리·코드, 승인·배포). 배포는 **변경분 방식**(행마다 배포 순번), 조회 함수 `CODE_EXISTS` → `MASTER`(2026-09-08) |
| `04-master-code-deploy-full.md` | 위와 같은 범위를 배포 **전체 방식**(마루 코드 전체 전송, 사본 교체)으로 쓴 설계서. 두 문서 중 하나를 고른 뒤 나머지를 버린다. 방식 비교와 권고는 이 문서 부록에 있다, 조회 함수 `CODE_EXISTS` → `MASTER`(2026-09-08) |
| `05-master-data.md` | 마스터데이터(마루 데이터·항목·카테고리·추가 컬럼, 원천 지정, 배포). 버전·승인·적용시점이 없고 저장 커밋이 곧 배포다, 조회 함수 `MASTER(id, cate, key[, attr])`·`MASTER_AT(id, cate, key, base_dt[, attr])`(마루 코드·마루 데이터, 존재·추가 컬럼 값, ID로 구분, 2026-09-08. `attr`은 추가 컬럼 번호 `"attr01"`, `MASTER`는 엔진의 평가 시각으로 판정하고 `MASTER_AT`만 시각을 인자로 받는다, 2026-09-09) |
| `06-business-rule.md` | 업무기준(룰) 의사결정표 모델, 조건 열 표시 타입(Equal/1/2/Expression. One·Two → 1·2, 2026-09-08)과 op-code → EvalEx 생성 규칙(2026-09-07), ERD·테이블 설계 7개(룰 단위 버전·승인·배포, 행 JSON 셀, 세트는 순서 목록, 시험 사본 제외, DRAFT 소유자 1인·넘기기, 2026-09-07. 승인 모델 확정·세트 구성 지침·버전 선택 쿼리 2026-09-08), 엔진 골격, 공통 엔진 모듈 `maru-mdm-engine` 구성, 기존 마루 룰엔진 대응(구 05, 2026-09-03 번호 변경), 05 조회 함수 `MASTER` 반영, 2 타입 op는 부등호 쌍 하나(`<= 변수 <=` 등 넷, 코드=표기, BETWEEN 이름 없음)·범위는 2 타입 열에만·CONTAINS/INSTR op 추가·LIKE는 `=` 값의 `%`·`_` 패턴으로 접음(2026-09-08), 코드 카테고리 소속 op `IN 카테고리`(CODE_IN) 추가·`MASTER`/`MASTER_AT`·평가 시각 반영, 「화면」 절 추가·MD_RULE.usage_note·결과 변수는 도메인 없이 data_type으로 선언 가능(2026-09-09) |
| `07-deploy.md` | 배포 방법(전달 수단 후보, 대상별 배포 기전 현황, 미결 목록, 01 화면 요구와의 충돌). 아직 결정 단계가 아니다 |
| `08-approval.md` | 결재(대상별 결재 여부, 마스터코드 상신·승인·반려·철회 흐름, 상신 시 검사, 적용시점 하한, DRAFT 정책 = 소유자 1인·선점·해제·넘기기, 2026-09-07·09). 규칙의 원장은 04·02·05·06이고 이 문서는 모음이다 |
| `evalex-guide.md` | EvalEx 3 표현식 계약과 화면/서버 실행 지침 |
| `workrule-column-design.md` | 작업기준(라인스피드 등) 칼럼 정의 방식의 룰 모델 반영 |

상세설계는 `../detail/`. 분할 전 원본은 프로젝트 루트 기준 `old/maru-mdm-design.md`(2026-09-02 분할).
