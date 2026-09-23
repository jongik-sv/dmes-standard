# mdm/TSK-01-01 모듈 스캐폴드 (mdm·maru-mdm-engine) + DB 연결 + CI
> stage: as · category: infra · domain: infra · priority: critical · model: sonnet
> prd-ref: [01 「8. 공통 엔진 모듈 (도출)」](design/basic/01-mdm-overview.md) · [06 「엔진 모듈: 별도 jar로 분리」](design/basic/06-business-rule.md) · PRD TRD §1 · PRD FR-E7
> entry-point: -
> depends: 

## 요구사항
- `src/backend/mdm`(lib+api) 생성 — mqc 모듈 구조를 본뜬다
- `src/backend/settings.gradle` includeBuild, 루트 `includedProjectNames` 에 mdm 추가(testAll 대상)
- application.yml 프로파일(local=SQLite, local-db=MSSQL, wildfly=JNDI), Flyway `db/migration/mdm/{sqlite,mssql}` 빈 V1
- `src/frontend/m-mdm`(@dk-oasis/m-mdm) tsup 라이브러리 + Vitest `test` 스크립트, pnpm workspace 등록
- `be-run.sh --mdm`(포트 8096) 추가, m-mcm 이 m-mdm 화면을 page-registry 로 적재
- `src/backend/maru-mdm-engine` 독립 java-library, 의존은 EvalEx 3.7.0 하나
- 패키지 `engine.{expr,rule,domain,code,spi}` 빈 골격
- ArchUnit 으로 EvalEx 외 의존·DB·네트워크 호출 금지 규칙 고정

## 데이터 모델
Flyway V1 (빈 베이스라인)

## 수용 기준
- [ ] `cd src/backend && ./gradlew testAll` 이 mdm 포함으로 통과
- [ ] `./be-run.sh --mdm` 으로 기동 후 헬스 체크 응답
- [ ] `pnpm --filter @dk-oasis/m-mdm test` 와 `pnpm lint` 통과
- [ ] 샘플 빈 화면 1개가 m-mcm 포털에서 열린다
- [ ] `../gradlew test` 통과, ArchUnit 규칙 위반 시 빌드 실패
- [ ] mdm 모듈이 composite build 로 엔진을 의존한다
