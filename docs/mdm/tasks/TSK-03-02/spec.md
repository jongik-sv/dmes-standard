# mdm/TSK-03-02 식 평가 코어 — EvalEx 설정·MASTER 계열·카테고리 해석·도메인 검증기
> stage: as · category: dev · domain: backend · priority: high · model: opus
> prd-ref: [evalex-guide 「6. 문법에 영향을 주는 설정 (`ExpressionConfiguration`)」](design/basic/evalex-guide.md) · [06 「엔진 모듈: 별도 jar로 분리」](design/basic/06-business-rule.md) · [04 「판정 참고 구현(사본 쿼리)」](design/basic/04-master-code-deploy-full.md) · [05 「판정 참고 구현(사본 쿼리)」](design/basic/05-master-data.md) · [02 「제약 관리: 값 · 필수 · 참조 · 유일성」](design/basic/02-term-domain-column.md) · [02 「검증식 계약」](design/basic/02-term-domain-column.md) · PRD FR-E7 · PRD FR-C4, FR-D1, FR-E7 · PRD FR-A2
> entry-point: -
> depends: mdm/TSK-03-01

## 요구사항
- precision 68/HALF_EVEN, allowOverwriteConstants=false 설정 팩토리
- 칸별 허용 함수 화이트리스트, Java 전용 정규식 거부, 예약 변수명 금지
- AstExporter, 컴파일 캐시 + copy(), 평가 타임아웃
- REGEX(전체 일치, def_target 칸)·TABLE 카테고리 해석, BASE 예약
- 기준일로 버전 선택(04 선분 from_ver–to_ver), 일시 선분(05 valid_from–to) 판정, 최초 행 소급
- `MASTER(id,cate,key[,attr])`, `MASTER_AT(...base_dt...)`, `CODE_LIST` — 첫 인자로 코드·데이터 구분
- `validate(column, record)` 순서: 빈 값 정규화 → 필수 → 타입 변환 → 유효 표준식 → 유효 비즈니스식
- 상속 체인 AND 누적 유효 식 조립(파생값, 저장하지 않음)
- 비즈니스식 변수 누락은 검증 실패

## 수용 기준
- [ ] 화이트리스트 밖 함수는 파싱 단계에서 거부
- [ ] 동시 평가 1,000 스레드에서 결과 일치(캐시 copy 검증)
- [ ] 04 판정 표(2024-06-01~2026-09-10)가 `sql/04-code-exists.sql` 결과와 일치
- [ ] 05 PORT 판정 7케이스 통과
- [ ] 02 「도메인 종류」 예시 전부 테스트
- [ ] 타입 변환 계약이 06 룰 엔진과 같은 함수를 쓴다
