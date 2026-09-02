# docs/mls — 물류/재고(MLS) 모듈 문서

실 프로젝트에서 이 디렉터리는 물류·재고 모듈의 업무 분석 산출물을 담는다.
재고 모델 정리 같은 심층 업무 분석 문서, 테이블 설계 스프레드시트,
레거시 분석 결과를 모으는 `analysis/`, 현업 협의 기록을 두는 `consult/`,
화면별 분석 보고서(BPA)를 모으는 `screens/`, 프로세스 그룹별 디렉터리로 구성된다.

본 템플릿에서는 고객사 재고 모델·테이블 설계·협의 기록을 모두 제거하고,
화면 분석 보고서 형식을 보여 주는 샘플 1건만 남겼다.

## 샘플

- [`screens/SAMPLE001_샘플재고조회.md`](./screens/SAMPLE001_샘플재고조회.md) — 화면 분석 보고서(BPA) 형식 예시

> 실제 BPA 는 `analyze-service` 로 레거시 화면 데이터를 수집한 뒤
> `generate-bpa` 스킬이 `screens/{화면ID}_{화면명}.md` 형식으로 생성한다.
> 프로세스 그룹 정의는 `define-process-groups`, 그룹별 통합 분석은 `generate-process-group` 을 쓴다.
