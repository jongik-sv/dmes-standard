# mdm/TSK-02-02 평가 엔진 설계 + 임베딩 방식 조사
> stage: as · category: design · domain: infra · priority: high · model: opus
> prd-ref: [06 「엔진 모듈: 별도 jar로 분리」](design/basic/06-business-rule.md) · [evalex-guide 「8. 화면(JS)에서 EvalEx 규칙을 실행하는 방법」](design/basic/evalex-guide.md) · [02 「TB_MDM_TERM (용어집)」](design/basic/02-term-domain-column.md) · PRD FR-E7 · PRD FR-A1
> entry-point: -
> depends: mdm/TSK-02-01

## 요구사항
- engine.spi 인터페이스(DefinitionLookup/CodeLookup/CodeEffLookup/MasterLookup/FunctionProvider)
- EvalEx 설정 고정값·칸별 허용 함수 집합·AST JSON 스키마
- MASTER/MASTER_AT/CODE_LIST 시그니처(05 기준), 평가 시각(EVAL_TS) 주입
- 화면 JS 평가기 범위(op-code 직접 비교 + AST 인터프리터 미리보기), 정합성 코퍼스 형식
- pgvector 전제를 SQLite·MSSQL 환경으로 옮기는 방법(파일 인덱스, 메모리 전수 비교 등) 비교
- KURE-v1 ONNX INT8 + ONNX Runtime Java CPU 추론 시간 실측(용어 1만 건 기준)

## 수용 기준
- [ ] 엔진 계약 Task 가 그대로 옮길 수 있는 인터페이스 초안
- [ ] 선택안과 근거를 decisions.md 에 기록(TRD 가정 T6 확정)
