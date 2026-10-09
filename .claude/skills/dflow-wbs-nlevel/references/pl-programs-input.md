# PL 입력 파일 programs.* (dflow-wbs-nlevel 에서 옮김)

> SKILL.md `### PL 입력 파일 (programs.*)` 절에서 분리. 원문 그대로.

### PL 입력 파일 (`programs.*`) — dflow-wbs 어댑터 준용 + N단 확장

공통 스키마·한글 헤더 별칭·포맷별 읽기 = dflow-wbs `references/program-list-adapter.md` 준용. N단 배치용 키 2개 추가:

| 키 | 필수 | 역할 |
|---|---|---|
| `subsystem` | ✅ | SUB 배치 — `입측` → `SUB-{SYS}-IN`. 없으면 에러(N단 필수) |
| `target` | I/F 만 | 인터페이스 축 판정 — 공정명(`2CGL`)→L2IF 공정 WP, `ERP`→ERPIF(`group` 이 WP) |

- `type` → WP 판정: 프로세스/배치→`-PR`, 화면/리포트→`-UI`, 인터페이스→`target` 축.
- `id` → Task 의 `prd-ref: program:{id}` 로 보존. 재생성 시 기존 Task ID 복원 키.
- difficulty→`w:` 환산 (하 2 / 중 3 / 상 5). 인터페이스 Task 는 `credit:if` 자동.
- subsystem 값→SUB 약어 매핑: 최초 등장 시 제안, programs 파일 머리에 comment 로 고정 (재실행 안정).
