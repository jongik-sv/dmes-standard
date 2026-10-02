# 마루 MDM (dmes-standard 개발분) 문서

- [PRD.md](PRD.md) — 기능 범위와 인수 조건
- [TRD.md](TRD.md) — 기술 설계 요약(모듈 배치·스택·API·DB·권한·가정)
- [wbs.md](wbs.md) — 작업 분해(Task 37개)
- [decisions.md](decisions.md) — 결정 감사 기록(append-only)
- [naming-dialect-rules.md](naming-dialect-rules.md) — 명명·감사 칼럼·방언·영속성·Flyway 규칙표(DB 설계 Task 인용 정본)
- [engine-contract.md](engine-contract.md) — 평가 엔진 공유 계약(spi·EvalEx 설정·허용 함수·AST 스키마·화면 JS 범위·코퍼스 형식). 계약 파일 [engine-contract/](engine-contract/)
- [term-embedding.md](term-embedding.md) — 용어 임베딩 모델·저장·검색 방식(TRD T6)
- [adr/](adr/README.md) — mdm ADR(설계 결정 기록)
- 메타 제공·업무 모듈 캐시 — OASIS `metaFeed`(`services/feed/`)와 변경 기록 `TB_MDM_META_REV`, 업무 모듈 cactus 캐시. 결정 [adr/0006](adr/0006-mdm-meta-hybrid-cache-revision.md), 설계 [spec](../superpowers/specs/2026-10-02-mdm-meta-cache-design.md)
- [screens/](screens/README.md) — 화면 그룹 코드·screenId 목록·경로 규약, 화면별 설계 산출물 `screens/{screenId}/`
- [tasks/](tasks/) — Task 별 spec·design

주의: `design/` 은 외부 mdm 프로젝트로 가는 로컬 링크이며 저장소에 커밋되지 않는다(원천 설계 정본은 `/Users/jji/project/mdm/docs/design/basic/`).
