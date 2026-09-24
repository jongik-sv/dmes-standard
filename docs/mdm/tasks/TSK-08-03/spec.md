# mdm/TSK-08-03 열 설정·피벗·결과 열 그룹·산출 룰·입력 계약
> stage: as · category: dev · domain: fullstack · priority: high · model: sonnet
> prd-ref: [06 「테이블 설계」](design/basic/06-business-rule.md) · [06 「화면」](design/basic/06-business-rule.md) · [workrule 「2. 개념 매핑」](design/basic/workrule-column-design.md) · [06 「룰 구성 요소」](design/basic/06-business-rule.md) · [evalex-guide 「8. 화면(JS)에서 EvalEx 규칙을 실행하는 방법」](design/basic/evalex-guide.md) · [06 「입력 계약」](design/basic/06-business-rule.md) · PRD FR-E2 · PRD FR-E2, FR-E3 · 시안: [06 「룰 화면 — 열 설정 표」](design/basic/html/06-business-rule.html) · 시안: [06 「피벗 보기·결과 열 그룹(BASE_SPD_LKP)」](design/basic/html/06-business-rule.html) · 시안: [06 「산출 룰·조건별 수식 변형」](design/basic/html/06-business-rule.html) · 시안: [06 「룰 화면 — 입력 계약 표·행 상세」](design/basic/html/06-business-rule.html)
> entry-point: /portal → mdr/ruleEdit (메뉴: MDM > 업무기준 > 룰 화면)
> depends: mdm/TSK-08-01, mdm/TSK-01-03, mdm/TSK-03-02, mdm/TSK-03-04

## 요구사항
- 열 전체 일괄 편집(var_id·구분·순서·표시 타입·변수/식·표시명·값 타입·axis·집계/순위·설명)
- 초안 → 전체 검사 → 원자 적용/초안 버리기, 도메인 검색
- axis ROW/COL 피벗(조건이 맞을 때만 편집, 평탄화 저장)
- 결과 열 그룹 머리 병합·열 조건(grp_cond) 편집(S4d)
- DERIVE 결과식 seq 편집·산출 순서 검사(S4b), 조건별 수식(S4c)
- Expression 자동완성, 화이트리스트 밖 이름 표시, 디바운스 서버 파싱·평가 미리보기
- 조건 변수의 행별 필수/선택 표, 같은 행 묶기
- RELEASED 대비 계약 변경 경고

## API 스펙
OASIS 서비스 `ruleEdit` — `/api/mdm/oasis/{serviceId}/{action}`

## 수용 기준
- [ ] 변수명은 컬럼 사전 표준 물리명, 프로그램 변수는 타입 선언 필수
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-ruleEdit.spec.ts` 가 통과한다
- [ ] BASE_SPD_LKP 샘플 표시·편집 왕복 일치
- [ ] COIL_WGT_CALC·PROD_WGT_CALC 샘플 저장·미리보기 일치
- [ ] 계약 변경 시 확정 화면 확인란으로 연결
