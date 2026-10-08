# 전 모듈 횡단 ADR 인덱스

본 폴더는 **특정 모듈에 속하지 않고 전 모듈(aps/mcm/mls/mqc/mpp/mas)에 걸쳐
적용되는 설계 결정**을 담는다. 모듈 내부에서만 유효한 결정은 여기가 아니라
`docs/{module}/design/adr/` 에 모듈별로 번호를 따로 매겨 기록한다.

번호 채번·필수 절·Status 표기·린트 규약은 [`adr-write` 스킬](../../../.claude/skills/adr-write/SKILL.md)
이 정본이다. 본 인덱스도 그 규약을 그대로 따르되, 표는 자동 재생성하지 않고
사람이 직접 갱신한다.

| 번호 | 제목 | Status | Date | 요약 |
|---|---|---|---|---|
| [0001](0001-ui-library-mantine9-aggrid.md) | 공통 UI 기반 Mantine 9 채택과 그리드 ag-grid-community 유지 | ACCEPTED | 2026-09-07 | 화면 코드 계약을 바꾸지 않는 선에서 `@dk-oasis/shared` 공통 UI 를 Mantine 9 로 재구현하고, 그리드는 ag-grid-community v33 유지, MUI·MuiDataGrid 제거. |
| [0002](0002-analog-readonly-db-viewer.md) | analog 읽기전용 DB 뷰어 분리 (MES 밖 관리자 전용) | ACCEPTED | 2026-10-08 | mcm 업무 화면 대신 analog에 화이트리스트·SELECT-only·200건 상한·감사로그 조건으로 테이블 브라우저 분리. |
