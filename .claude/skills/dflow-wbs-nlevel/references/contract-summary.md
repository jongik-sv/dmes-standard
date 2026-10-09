# 계약 요약 (dflow-wbs-nlevel 에서 옮김)

> SKILL.md `## 계약 요약` 절 (§1~§5)에서 분리. 원문 그대로.

## 계약 요약 (정본: 스펙 문서)

### 1. frontmatter — 단계는 여기서만 선언한다

```yaml
---
project: MES
module: mes-op                  # PL 모드 필수 — external_ref 네임스페이스
attach: PH-03/SYS-OP            # PL 모드 필수 — 골격의 부착점 노드
levels:                         # 골격이 정본, PL 파일은 복사본(불일치 = 업로드 거부)
  - { name: Phase,     prefix: PH,  progress: rollup }
  - { name: System,    prefix: SYS, progress: rollup }
  - { name: Subsystem, prefix: SUB, progress: rollup }
  - { name: WP,        prefix: WP,  progress: rollup, report: weekly }
  - { name: Activity,  prefix: ACT, progress: rollup, optional: true }
  - { name: Task,      prefix: TSK, progress: input }
  - { name: SubTask,   prefix: STK, progress: checklist, optional: true, upload: fold }
credits:
  default: { 대기: 0, 설계: 20, 구현중: 50, 구현완료: 70, 테스트완료: 90, 검수완료: 100 }
  if:      { 대기: 0, 구현중: 30, 구현완료: 50, 연동검증: 100 }
  doc:     { 미착수: 0, 작성중: 30, 제출: 50, 검수완료: 100 }
---
```

- 산문 표·본문 절로 단계 선언 금지. 기계 파싱 대상 = frontmatter 뿐.
- `progress` 4종:
  - `input`: leaf 입력·발행 대상
  - `rollup`: 집계 전용 — leaf 면 에러
  - `checklist`: 완료 ○/× 만, 집계 불개입, leaf 전용
  - `none`: 마일스톤
- `upload` 3종: `true`(기본) / `false`(파일 전용) / `fold`(부모 acceptance 로 접힘).
  - **아래에서 위로만** 끌 수 있음.
  - `input` 층은 `true` 강제.
  - 노드 단위 skip 마커 발명 금지.

### 2. 단계 판정 — 접두어가 정본

- `TSK-` 접두 = Task. **ID 세그먼트 수·헤딩 깊이로 층 판정 금지.**
- 헤딩 깊이·리스트 들여쓰기 = **부모 판정(구조)** 에만 사용.
- 검증: 자식 단계 순번 > 부모 단계 순번. 건너뛰기 허용 (선택층). 역행·동급 금지.
- 헤딩 6단 한계는 **리스트 들여쓰기가 흡수**.
  - Task 이하를 `- [ ]` 리스트로 쓰면 헤딩 캡·중복 깊이 없음.
  - 같은 헤딩 깊이에 두 단계 겹침 금지.
- ID = external_ref 매칭 키. 재번호매김 금지, 사라진 ID 재사용 금지 (dflow-wbs 와 동일).
- **ID 채번 관례** (2026-08-21 확정): `{접두}-{SYS약어}-{경로꼬리}-{순번}`
  - 예: 조업>입측>화면>1번 = `TSK-OP-IN-UI-01`, 그 SubTask = `STK-OP-IN-UI-01-1`.
  - PL 파일 SUB·WP 도 시스템 약어 포함 (`SUB-OP-IN`, `WP-OP-IN-UI`).
  - 골격(전사 항목)은 시스템 없음 → `TSK-AN-RQ-01` 형.
  - 경로 조각 = **생성 시점 소속 힌트**. 단계·부모 판정 정본 = 접두어+구조. 노드 이동해도 ID 불변 (힌트 낡음 감수).
  - module 이 네임스페이스라 기술적으론 중복. ID 가 화면·회의에서 단독 유통 → 사람용 자기완결성 위해 시스템 포함.
  - 개요 번호(1.3.4.12) = ID 아님, **표시 파생값**. 화면·엑셀이 트리 위치에서 자동 계산. 파일에 쓰지 않음.

### 3. 본문 표기 (한 줄 요약 — 전체 표는 스펙)

```markdown
## PH-03: 구축                       ← 헤딩: 상위 층
##### WP-IN-PR: 프로세스
###### ACT-IN-PR-1: 실적 관리
- [ ] TSK-IN-001: 입측 실적 수집 @홍길동 w:5 ~2026-10-17 credit:default
  - [ ] STK-IN-001-1: 중복 수신 방어   ← checklist (fold)
- [M] TSK-AN-IF-90: 분석 완료 보고회 ~2026-09-30   ← 마일스톤 — ID 필수(external_ref)
```

`@담당` `w:가중치(MD, 생략=1)` `~종료일` 또는 `시작~종료일` `credit:크레딧표키` `if-id:I/F대장ID`.
- 생성기 = **`시작~종료일` 로 씀**.
  - 종료만 쓰면 import 가 시작 파생 (선행 종료 다음 영업일 → `start_date`).
  - 선행이 더 늦게 끝나는 계획 → 시작=종료로 접혀 0일 막대.
  - 일정 산정했으면 둘 다 적음.
- 상태는 항상 `[ ]`. 전이 정본 = D'Flow (dflow-wbs 와 동일). 실적 % 를 파일에 쓰지 않음.

**Task 상세 블록** — 한 줄 밑에 들여쓴 `- key: value` 필드.
- 체크박스 없는 리스트 = 필드, `- [ ]` = SubTask. 둘 공존.
- import 필드를 여기에 실음: category·domain·model·priority·tags·depends·prd-ref·entry-point·requirements·acceptance·spec·note.

```markdown
- [ ] TSK-IN-001: 입측 실적 수집 프로세스 @홍길동 w:5 ~2026-11-14
  - category: dev
  - domain: backend
  - depends: TSK-L2-221
  - requirements: L2 인입 통보 수신 시 입고 실적 생성·재고 반영, 불일치는 예외 큐
  - acceptance: 수신→실적→재고 단일 트랜잭션 / 중복 전문 멱등 처리
  - [ ] STK-IN-001-1: 중복 수신 방어 로직
```

- 상세 블록 = **선택**. 골격·초안 단계는 한 줄 유지.
- **개발 착수 전 input 층 Task 는 requirements·acceptance 필수** (검증기 경고 대상).
- 명세 재료 = PRD/프로그램 리스트 입력. 입력 없이 명세 창작 금지 (초안은 한 줄로 두고 리포트에 "명세 미충전" 표기).

### 4. WSF 배치 — 모드가 샌드위치를 나눠 갖는다

- `--skeleton` = **빵**:
  - Water: PH-01 분석 · PH-02 설계 골격 + 전사 아키텍처·공통 계약 Task
  - Fall: PH-04 통합테스트 · PH-05 적용 골격 + 시스템 관통·컷오버
- PL 모드 = **속**:
  - 모듈 Water 꼬리: 모듈 요건분석·상세설계·DB(ERD)·모듈 공유 계약(계약 전용)
  - Scrum: 프로그램 Task (1 프로그램 = 1 fullstack Task 수직 슬라이스)
  - 모듈 Fall: 모듈 통합 시나리오
- depends 사슬·경계 규칙 ("2+ 모듈 공유만 선행", 통테 결함은 defect 되돌림) = dflow-wbs §전체 구조 계승.
- category 7종 · 수직 슬라이스 · FS 전용 depends 도 동일.

### 5. 분리 업로드 전제

- 골격 먼저, PL 파일들은 무순서.
- module = 디렉토리 세그먼트 (`docs/mes/조업` → 조업 매핑표 or 영문 코드).
- PL 파일 최상위 노드 = attach 가 가리키는 골격 노드의 자식. 골격 층(PH·SYS)을 PL 파일 본문에 쓰면 에러.
- module 1개 = 파일 1개. ID 는 모듈 안에서만 유일하면 됨.
