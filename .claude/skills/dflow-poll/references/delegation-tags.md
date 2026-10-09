# 위임 태그·위치 선언·지원 환경 상세

> 출처: SKILL.md 의 「에이전트 위임 플래그」 세부 항목, 「위치 선언」 블록, 「지원 환경」 절을 옮겨 둔 것.

## 에이전트 위임 플래그 세부

- 표준 기동 = `--require-tag agent` 고정. 사용자가 명시적으로 `--all` 이라고 하면 필터 없이 기동 (예전 동작) — 이때 착수 전 판정이 유일한 방어선임을 통지.
- 태그는 D'Flow 웹(WBS 편집)이나 wbs.md import 의 tags 필드로 단다.
- **위임 태그 ≠ 담당자 배정.**
  - poll.mjs 는 `list --scope assigned` 로만 조회 → 태그만 달고 배정을 잊으면 그 작업은 **자동 루프에 영원히 안 걸림**.
  - 목록에 아예 안 떠서 "선행 미충족" 으로 오진하기 쉬움 (2026-08-26 리허설에서 이 오진으로 수 시간 소모).
  - 기동·재기동 시 태그는 있는데 미배정인 ready 가 보이면 한 줄 통지.
- list 응답에 tags 없음 → poll.mjs 가 후보별 show 로 조회.
  - 태그 없어 떨어진 후보는 `--tag-cache-cycles`(기본 3)주기 동안 show 재조회 안 함 → 새로 단 태그는 그만큼 늦게 잡힘.
  - 서버 list 응답에 tags 포함시키는 개선 = 러너 설계 개정 묶음의 후보.

## 위치 선언

> **위치 선언**: 이 스킬 = "깨어 있는 세션이 주기적으로 서버를 확인" 구조 — 자율 러너 설계(wbs-web 리포 docs/superpowers/specs, 킷에는 미동봉)가 **무인용으로는 기각한 B안 구조임을 알고 씀.** 사람이 근처에 있는 낮 시간 반자동 전용. `--until` 상한 없이 방치 금지. 무인 야간 실행 = 러너(launchd) 영역.
>
> 감시 = 결정적 스크립트(`scripts/poll.mjs`) 담당 — 대기 중 LLM 토큰 소모 0. 스크립트가 설정 로드(`.dflow`·`.dflow.local`, 레거시 `.env`)와 dflow.mjs 래핑 담당 → 세션이 env 를 직접 안 다룸.

## 지원 환경: macOS · Linux · Windows (node)

`scripts/poll.mjs` 는 node 로 macOS·Linux·Windows 에서 같이 돎. 필요 도구: node 18.17+, git. 스크립트를 새로 쓸 때 macOS 전용 명령·perl 금지 (정본: `../_shared/platform-support.md`).
