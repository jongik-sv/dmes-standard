# mdm/TSK-04-02 용어·단위 관리 (유사어 추천 포함)
> stage: as · category: dev · domain: fullstack · priority: high · model: sonnet
> prd-ref: [02 「단위: 저장 단위와 표시 단위의 분리」](design/basic/02-term-domain-column.md) · [02 「용어(단어) 속성」](design/basic/02-term-domain-column.md) · [02 「컬럼명 속성」](design/basic/02-term-domain-column.md) · [02 「TB_MDM_TERM (용어집)」](design/basic/02-term-domain-column.md) · PRD FR-A4 · PRD FR-A1 · 시안: [02 「단위 마스터」](design/basic/html/02-term-domain-column.html) · 시안: [02 「용어 관리」](design/basic/html/02-term-domain-column.html)
> entry-point: /portal → mdt/unitMng (메뉴: MDM > 용어·도메인 > 단위 마스터); /portal → mdt/termMng (메뉴: MDM > 용어·도메인 > 용어 관리)
> depends: mdm/TSK-04-01, mdm/TSK-01-03, mdm/TSK-02-02

## 요구사항
- 차원·기준 단위·환산 계수 CRUD, 차원 선택 시 기준 단위 고정
- 환산 미리보기(같은 차원만)
- (표기, 의미 번호) 키 CRUD, 정의 필수, 동의어·별칭·사용 시스템·영문명·약어
- 1차 문자열 유사어 추천 패널(디바운스), 동의어로 확정
- KURE-v1 ONNX INT8 서버 내장 인코딩(등록·수정 시 1회)
- 최초 일괄 구축 배치, 모델 교체 시 재인코딩 배치
- 용어 관리 화면 2차 추천 API

## API 스펙
OASIS 서비스 `unitMng` — `/api/mdm/oasis/{serviceId}/{action}`
OASIS 서비스 `termMng` — `/api/mdm/oasis/{serviceId}/{action}`

## 데이터 모델
TB_MDM_UNIT
TB_MDM_TERM

## 수용 기준
- [ ] 차원이 다른 변환 거부
- [ ] 월·년·영업일 단위 등록 거부
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-unitMng.spec.ts` 가 통과한다
- [ ] (표기, 의미 번호) 중복 저장 거부
- [ ] 약어 중복 경고
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-termMng.spec.ts` 가 통과한다
- [ ] 용어 1만 건 추천 응답 500 ms 이내
- [ ] embedding_model 이 다른 행은 재인코딩 대상으로 잡힌다
