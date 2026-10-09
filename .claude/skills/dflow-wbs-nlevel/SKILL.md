---
name: dflow-wbs-nlevel
description: N단(5~8단) 대형 프로젝트의 wbs.md 를 levels 계약(frontmatter 단계 선언·접두어 판정·진도 역할·업로드 범위)으로 생성·검증할 때 사용. PMO 골격(--skeleton)과 PL 모듈 파일 두 모드. 트리거 - "/dflow-wbs-nlevel", "N단 WBS", "8단 WBS", "골격 WBS", "PL WBS", "levels frontmatter". 3~4단 기존 흐름은 dflow-wbs(동결)를 쓴다. 사용법 - /dflow-wbs-nlevel [--skeleton 시스템목록 | 모듈경로] [--programs 경로]
---

# /dflow-wbs-nlevel — N단 WBS 생성 (levels 계약)

> 문체: 산출 문서 → `../_shared/style/Korean-STE-Writing-Guide.md`.

> **계약 정본 = `.claude/skills/dflow-wbs-nlevel/references/wbs-nlevel-md-contract.md`** (wbs-web docs/superpowers/specs 사본 — 갱신 시 둘 다).
> - 생성 전 Read 필수. 이 파일과 다르면 계약 문서 우선.
> - 기존 `dflow-wbs`(3~4단 WSF) = **동결**. 규약 다름 → 섞지 않음.
>
> **업로드 게이트 (2026-08-22 갱신)**: import v2.2(levels·attach·fold) 서버 랜딩 완료.
> - 스테이징(dflow-staging): 코드·DB(0089) 적용 → 업로드 가능.
> - **운영: 0089 운영 적용 + main merge 전까지 금지.**
> - 업로드 전 `wbs-nlevel-parse.mjs validate` 통과 필수 (§검증·업로드).

## 참조 — 언제 무엇을 Read 하는가

| 문서 (`references/`) | 읽는 때 |
|---|---|
| wbs-nlevel-md-contract.md | 생성·검증 전 항상 (계약 정본) |
| contract-summary.md | wbs.md 쓰기 직전 (frontmatter 예·표기·ID 채번·WSF 배치 요약) |
| skeleton-mode.md | `--skeleton` 모드 (skeleton.yaml·methodology·wsf 골격 구성) |
| skeleton-sample.md | 골격 모드에서 wbs.md 쓸 때 |
| pl-programs-input.md | PL 모드에서 `programs.*` 읽을 때 |

## 모드 — 인자로 판정

| 모드 | 인자 | 산출물 | 소유 |
|---|---|---|---|
| **골격** | `--skeleton {시스템목록}` | Phase·System 골격 wbs.md + 시스템 키 목록 + levels 정본 + PL 파일 템플릿(배포 킷) | PMO/PM |
| **PL** (기본) | `{모듈 디렉토리}` (예: `docs/mes/조업`) `[--programs 경로]` | 그 모듈 wbs.md (Subsystem 이하) | 담당 PL |

PL 모드 **levels·시스템 키 조회 사슬** (2026-08-22 확정 — 위가 우선):

1. **서버 직조회**: `GET /api/v1/wbs/structure?project_id=...` (PAT `work:read`, 멤버)
   - 반환: levels 정본 + Phase·System 노드(external_ref·name).
   - 골격 업로드 끝난 프로젝트의 정본.
2. **골격 파일 폴백**: 같은 프로젝트 루트 골격 wbs.md 에서 levels·시스템 키 복사.
3. 둘 다 없으면 **에러 후 중단** (골격 선행 원칙). levels 임의 작성 금지.

**코드는 이름으로 고름** — PL 에게 시스템 코드 묻지 않음.
- 조회 결과 시스템 목록을 이름으로 제시 (①공통 ②품질 …).
- 선택하면 attach·module 을 정본에서 자동 기입.
- 골격에 없는 업무 답변 → 코드 생성 금지, "PMO 에 skeleton.yaml 추가 요청"으로 중단 (fail-closed — 시스템 신설 = 조직 결정).
- SUB 이하 약어만 스킬이 제안 (§programs.*).

예외 — 사용자가 골격 부재를 알고도 초안 명시 요구:
- 스펙 정본 샘플 levels 를 "임시 사본"으로 복사.
- 파일 머리·리포트에 명시: **골격 발행 후 대조 필수 (불일치 시 골격 우선) · 대조 전 업로드 금지**.
- 임시 사본 없이 levels 창작은 여전히 금지.

## 계약 요약 (정본: 스펙 문서)

→ references/contract-summary.md (참조 표 참고)

## 골격 정의 파일 (`skeleton.yaml`)

→ references/skeleton-mode.md (참조 표 참고)

## 실행 플로우

1. 스펙 문서 Read (계약 로드).
2. 모드 판정 (`--skeleton` 유무).
3. **골격 모드**:
   1. skeleton.yaml 로드 (없으면 skeleton-mode.md 의 대화 수집 → 파일 생성 후 종료)
   2. PH + System 노드 생성
   3. levels·credits 정본 작성
   4. PL 템플릿 생성 (모듈별, attach·levels 채움)
   5. 키 목록 표 출력 + "키는 이후 불변" 경고
4. **PL 모드**:
   1. levels·시스템 키 조회 (§조회 사슬 — 서버 structure → 골격 파일 → 에러)
   2. 시스템을 **이름으로 선택**받아 attach·module 자동 기입
   3. **프로그램 리스트 로드** (`{모듈 디렉토리}/programs.{yaml|csv|xlsx|md|json}`)
      - 없으면 빈 템플릿 programs.yaml 생성 후 정지, "채워서 재실행" 안내 (skeleton.yaml 과 동일 패턴).
   4. 프로그램 Task + 모듈 Fall 생성 → attach 기입
   - PRD/TRD = 선택. 있으면 requirements·acceptance 인용 보강.
   - 없으면 한 줄 Task 로 두고 리포트에 "명세 미충전" 표기 (창작 금지).

### PL 입력 파일 (`programs.*`)

→ references/pl-programs-input.md (참조 표 참고)

5. **검증 게이트** — 파서 스크립트 = 정본 (수동 체크리스트 대체, 2026-08-22):
   ```bash
   node .claude/skills/dflow-wbs-nlevel/scripts/wbs-nlevel-parse.mjs validate \
     --wbs docs/mes/조업/wbs.md --role pl        # 골격은 --role skeleton
   ```
   - errors 0 이면 통과.
   - warnings 는 리포트에 전량 나열 (생략 금지).
   - 정상 경고: 얕은 비대칭 골격의 "필수층 건너뜀", 분리 업로드 과도기의 "rollup leaf".
6. 생성 리포트에 업로드 게이트 상태 (스테이징 가능 / 운영 대기) 한 줄.

## 업로드 — export → import v2.2 (2026-08-22 게이트 부분 해제)

```bash
# 1) export — 검증 게이트 내장(에러 시 payload 안 나옴). attach_ref 는 골격 module 로 자동 조립.
node .claude/skills/dflow-wbs-nlevel/scripts/wbs-nlevel-parse.mjs export \
  --wbs docs/mes/조업/wbs.md --skeleton docs/mes/skel/wbs.md > "$SCRATCHPAD/nlevel-op.json"   # 골격 경로는 프로젝트마다 다름

# 2) 봉투 완성(project_id) 후 전송 — PAT 규칙·바인딩은 dflow-export SKILL.md 준용(값 비출력)
node .claude/skills/dflow-export/scripts/wbs-envelope.mjs \
  --in "$SCRATCHPAD/nlevel-op.json" --out "$SCRATCHPAD/nlevel-op-import.json" --set "project_id=<UUID>"
PAT="$(echo "${DFLOW_PATS:-$DFLOW_PAT}" | cut -d',' -f1)"
curl -sS -X POST "$DFLOW_API_BASE/api/v1/wbs/import" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  -d @"$SCRATCHPAD/nlevel-op-import.json"
```

- **봉투 완성(2) 실패하면 업로드 안 함**.
  - `wbs-envelope.mjs` 비 0 종료 (1 입력·출력 오류, 2 사용 오류 — `--set` 없음 등) → `curl` 금지.
  - 앞 실행이 남긴 `nlevel-op-import.json` = 옛 파일. 전송 금지.
  - 셸에서 두 명령을 `&&` 로 잇거나 종료 코드 확인 뒤에만 전송.
  - `--set` 값은 `<`·`>` 때문에 반드시 따옴표.
- **골격 먼저**:
  - 골격 파일 = attach 없이 export (levels 가 project_settings 시드).
  - PL 파일 = attach_ref 필수. 골격 미업로드면 서버가 400 `attach_not_found` 로 거부 (fail-closed).
- PL 파일 levels ≠ 서버 정본 → 400 `levels_mismatch`. 골격 levels 를 다시 복사.
- fold(STK)·마일스톤·w:·credit:·if-id: = export 가 자동 변환. payload 수동 조작 금지.
- 대상 서버: **스테이징만** (운영은 0089 운영 적용 + main merge 후 — 게이트 상단 참조).

## 자주 틀리는 것 (베이스라인 실측 2026-08-21)

| 스킬 없이 나온 발명 | 교정 |
|---|---|
| ID 세그먼트 경로(`P1.OP.EN.PR.A1.T1`)로 층 판정 | 접두어 정본. ID 는 짧게, 층은 prefix |
| 산문 "계층 규약" 표 | frontmatter levels |
| Task 마다 `progress: input` 필드 | 층별 선언 — 노드에 반복 기재 금지 |
| `dflow: skip` 노드 마커 | 층별 `upload` — 노드 단위 제외는 계약에 없음 |
| 헤딩 `######` 캡으로 두 단계 겹침 | Task 이하는 리스트 — 구조 모호 금지 |
