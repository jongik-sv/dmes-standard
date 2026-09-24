# mdm/TSK-04-03 도메인 관리 — 상속·검증식·테스트 케이스·영향도
> stage: as · category: dev · domain: fullstack · priority: high · model: opus
> prd-ref: [02 「속성과 상속 규칙」](design/basic/02-term-domain-column.md) · [02 「도메인 종류」](design/basic/02-term-domain-column.md) · [02 「검증식 계약」](design/basic/02-term-domain-column.md) · [02 「파생값을 저장하지 않는다」](design/basic/02-term-domain-column.md) · [02 「생명주기와 변경 관리」](design/basic/02-term-domain-column.md) · PRD FR-A2 · 시안: [02 「도메인 관리」](design/basic/html/02-term-domain-column.html) · 시안: [02 「도메인 관리 — 검증식·테스트 케이스」](design/basic/html/02-term-domain-column.html) · 시안: [02 「도메인 관리 — 영향도 표」](design/basic/html/02-term-domain-column.html)
> entry-point: /portal → mdt/domainMng (메뉴: MDM > 용어·도메인 > 도메인 관리)
> depends: mdm/TSK-04-01, mdm/TSK-01-03, mdm/TSK-03-02, mdm/TSK-03-04

## 요구사항
- 상속 트리 그리드(들여쓰기, 유효 식 표시), 기본 속성 폼
- 상속 규칙: 종류·타입·단위 고정, 길이·소수 좁히기, CODE 참조(maru_code_id+cate_id) 대체
- 변경 분류(호환/좁히기·넓히기/구조 변경 금지)
- 표준식(화면+서버)·비즈니스식(서버 전용) 두 칸, 저장 시 파싱·화이트리스트·AST 저장
- 저장 거부 조건 10종, 빈 말단 경고
- 테스트 케이스 그리드 실행, 부모 수정 시 하위 테스트 케이스를 같은 트랜잭션에서 재실행
- 화면 JS 미리보기 + 비즈니스식 서버 미리보기(디바운스)
- 재귀 CTE 로 하위 도메인·참조 컬럼·룰 결과 변수·레이아웃 조회
- 저장 전 diff 와 변경 분류 표시

## API 스펙
OASIS 서비스 `domainMng` — `/api/mdm/oasis/{serviceId}/{action}`

## 데이터 모델
TB_MDM_DOMAIN

## 수용 기준
- [ ] 상속 순환·길이 확대·구조 변경 저장 거부
- [ ] CODE 도메인은 체인 어딘가에 참조가 있어야 저장
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-domainMng.spec.ts` 가 통과한다
- [ ] 거부 조건 10종 각각 서버 테스트
- [ ] 하위 테스트 케이스 실패 시 부모 저장 롤백
- [ ] 03·06 테이블이 비어 있어도 조회가 동작한다(참조 0건)
