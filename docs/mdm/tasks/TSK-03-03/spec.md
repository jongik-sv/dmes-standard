# mdm/TSK-03-03 룰 판정 엔진 — 의사결정표·op-code 생성·룰 세트
> stage: as · category: dev · domain: backend · priority: high · model: opus
> prd-ref: [06 「엔진 골격 (Java, 서버)」](design/basic/06-business-rule.md) · [workrule 「2. 개념 매핑」](design/basic/workrule-column-design.md) · [06 「EvalEx 생성 규칙」](design/basic/06-business-rule.md) · [06 「룰 구성 요소」](design/basic/06-business-rule.md) · PRD FR-E2, FR-E7 · PRD FR-E2 · PRD FR-E5, FR-E6
> entry-point: -
> depends: mdm/TSK-03-01

## 요구사항
- 4단계 판정(조건 검사 → 행 고르기 → 결과 검사 → 결과 평가), 적중 정책 FIRST/UNIQUE/PRIORITY/COLLECT/ANY
- 기본 행, NULL 정책(`V != NULL &&` 가드), EVAL_TS 주입, 식 변수 `_V<var_id>` 사전 계산
- 결과 열 그룹(res_grp·grp_cond) 선택, 산출 룰(DERIVE) 순차 평가
- 표시 타입 Equal/1/2/Expression 셀 → EvalEx 텍스트, 2 타입은 부등호 쌍 4종
- `=` 값의 `%`·`_` 패턴(단순형 3종/정규식), CONTAINS/INSTR, `IN 카테고리`(CODE_IN)
- ReDoS 제한, 결정적 바이트 동일 출력
- 세트 순차 실행, 실행 전 입력 키 일괄 확인, 최종·중간 결과 반환, 폐기 세트는 판정 오류
- `view(ruleId, evalTs, {TEXT, AST, CONTRACT})`, `setView`

## 수용 기준
- [ ] 06 샘플 룰 QLTY_GRD_JDG·COIL_WGT_CALC·PROD_WGT_CALC·BASE_SPD_LKP 값 테스트 일치
- [ ] 같은 셀 입력에 바이트 동일 출력(회귀 스냅샷 테스트)
- [ ] 생성 텍스트가 EvalEx 파싱을 통과
- [ ] 세트 LS_A3 샘플 실행 결과 일치
- [ ] 폐기된 세트 판정 시 명시적 오류
