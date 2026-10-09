# 성공 기준 (dflow-wbs 에서 옮김)

> SKILL.md `## 성공 기준` 절에서 분리. 원문 그대로.

## 성공 기준

- PRD 전 기능 Task 커버, Task 1일-1주, prd-ref 추적성, 자기 완결성
- fullstack/frontend Task `entry-point` 필수 (orphan page 방지)
- 공유 계약 전부 선행 분리 + 계약 전용 관례 준수 (tags: contract)
- DB(ERD) 설계가 그룹 설계에서 분리됨 (계약 파이프라인)
- depends 전부 FS + 겹침 검증식 통과
- 기능 구간 내부 `max_chain_depth ≤ 3` (공정 양끝 +2 허용, 예외는 근거 명시)
- 기능 WP 2+ 면 마지막 WP = 통합테스트, depends 는 기능 체인 말단 (프로그램 리스트 모드는 기능 WP 1개여도 필수)
- 모든 Task `status: [ ]`, ID 숫자만
- **재생성 시 기존 Task/WP/ACT ID 보존** — ID = D'Flow `external_ref` 매칭 키 (`## D'Flow 연동 표기`)

**프로그램 리스트 모드 추가 기준:**

- 입력 프로그램 수 = 생성된 **기능 Task 수** (1:1). 한 프로그램을 2개 Task 로 쪼개지 않음
- 모든 기능 Task `domain` = `fullstack` 또는 `backend` — "API"/"UI" 로 나뉜 Task 0건
- 모든 기능 Task 가 `prd-ref: program:{program_id}` 보유, 그 값이 중복 없이 입력 ID 집합과 일치
- `assignee` = email 또는 `-` — 이름 문자열 Task 0건
- `## 입력 매핑 리포트` 챕터 존재 + 다섯 표 모두 채움 (해당 없으면 "해당 없음")
- 모듈 계약 Task 가 모듈마다 1개씩 존재, 기능 Task 전부 자기 모듈 계약 Task 에 depends

**명세 블록 파싱 계약 (import 유실 방지):**

- 4단계면 명세 블록 헤딩 `#####`, 3단계면 `####` — TSK 헤딩보다 반드시 깊음
- 명세 필드 줄 전부 열 0 시작, bullet 항목은 2칸 들여쓰기
- 빈 리스트 생략 없이 `- field: -` 로 명시

**`--export-xlsx` 사용 시:**

- 엑셀 행 수 = WP 수 + ACT 수 + Task 수 (헤더·주석 행 제외)
- 상태 라벨·진척 환산 = `docs/state-machine.json` 에서 읽은 값, 스킬에 하드코딩 안 함 (파일 없으면 상태 코드 그대로 + 진척 0 + 리포트)
- 사람이 실적%를 입력하는 컬럼 없음
