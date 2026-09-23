# mdm ADR 인덱스

본 폴더는 **mdm(마루 MDM) 모듈 안에서만 유효한 설계 결정**을 담는다. 번호는 mdm 모듈 독립 시퀀스로
`0001` 부터 매긴다. 다른 모듈에서 인용할 때는 번호만 쓰지 말고 경로 링크를 함께 쓴다
(예: `[mdm ADR-0001](../mdm/adr/0001-physical-naming-audit-dialect.md)`).

번호 채번·필수 절·Status 표기·린트 규약은 [`adr-write` 스킬](../../../.claude/skills/adr-write/SKILL.md)
이 정본이다. 본 인덱스도 그 규약을 그대로 따르되, 표는 자동 재생성하지 않고 사람이 직접 갱신한다.

## 위치·발행 방식 이탈 (2026-09-24, mdm/TSK-02-01)

- **위치**: adr-write 스킬의 기본 위치는 `docs/{module}/design/adr/` 이지만, mdm 은 `docs/mdm/adr/` 에 둔다.
  `docs/mdm/design` 은 외부 mdm 프로젝트로 가는 로컬 링크이고 `.gitignore` 로 통째 무시되므로, 그 안에 둔 ADR 은
  저장소에 커밋되지 않는다. `docs/guide/adr/`(모듈 횡단용)과 같은 평평한 구조다.
- **발행 도구**: `adr_tool.py` 는 ADR 경로를 `docs/{module}/design/adr` 로 고정한다. 그래서 `new`·`status`·`index`
  를 `--module mdm` 으로 실행하면 커밋되지 않는 외부 링크 자리에 파일이 생긴다. mdm ADR 은 스킬 §4 의 절 구조를
  손으로 만들고, 채번은 이 폴더의 파일 목록으로 손으로 한다. 검사는 파일 경로를 지정한 lint 로만 한다.

  ```bash
  python3 .claude/skills/adr-write/scripts/adr_tool.py lint docs/mdm/adr/NNNN-{slug}.md
  ```

- 인덱스 정합(`index`)도 도구가 이 경로를 보지 못하므로, 파일을 추가할 때 아래 표를 손으로 맞춘다.

| 번호 | 제목 | Status | Date | 요약 |
|---|---|---|---|---|
| [0001](0001-physical-naming-audit-dialect.md) | MDM 물리 명명·공통 관리 속성·방언 규칙 | PROPOSED | 2026-09-24 | 테이블 `TB_MDM_*` 대문자·칼럼 UPPER_SNAKE·제약 명명, 감사 9칼럼을 `CactusAuditEntity` 로 채우고 `McmAuditStatementInspector` 는 적용하지 않음, 방언 규칙표([naming-dialect-rules.md](../naming-dialect-rules.md))를 정본으로 둠, JPA + native 쿼리(MyBatis 미사용), 코드·키 칼럼 BIN2. |
| [0002](0002-version-confirm-without-approval.md) | 결재·배포·수신 보류 하의 버전 확정 규칙과 보류 테이블 원칙 | PROPOSED | 2026-09-24 | 04·06 버전을 담당자가 직접 확정(DRAFT→RELEASED)하는 트랜잭션·검사, 미적용 버전 = DRAFT + 미래 RELEASED, 결재 칸은 `requested_*`·`released_at` 만 채움, CREATED→INUSE 전이 시점, 보류 테이블 DDL-only·배포 칸 `DEFAULT 0`. |
| [0003](0003-module-boundary-screens-roles.md) | MDM 모듈 경계 — 화면 그룹·산출물 위치·As-Is 병존·권한 역할 | PROPOSED | 2026-09-24 | 화면 그룹 `dma~dme`, 산출물 `docs/mdm/screens/{screenId}/`, mcm `cma`/`cmb` As-Is 와 병존 6원칙, 역할 `MDM_STD_ADMIN`·`MDM_STEWARD` 와 권한 세트 3종·그룹 매트릭스. |
