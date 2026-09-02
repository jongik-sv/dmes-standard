---
name: git-commit
description: "변경사항을 논리적 단위(기능/모듈)로 자동 분류하여 개별 커밋을 생성합니다. dmes-standard의 Conventional Commits 관례(type(scope): subject)를 따릅니다."
---

# Git Commit (dmes-standard)

변경사항을 논리적 단위로 분류해 개별 커밋을 만든다. 이 저장소의 커밋 관례가 이 스킬의 정본이다.

## 대원칙 (반드시 준수)

1. **사용자 승인 필수** — 커밋은 분류안을 제시하고 사용자가 승인한 뒤에만 실행한다. 자동 커밋 금지.
2. **push 금지** — 사용자가 명시적으로 요청하지 않는 한 `git push`는 하지 않는다.
3. **staged 범위 확인** — `git commit` 직전 항상 `git diff --cached --stat`으로 이 커밋에 들어갈 파일이 의도한 그룹과 정확히 일치하는지 검증한다. 혼입 발견 시 커밋하지 말고 재분류한다.
4. **민감정보 차단** — diff에 API 키·비밀번호·토큰이 있으면 중단하고 사용자에게 알린다.

## 사용 방법

```bash
/git-commit              # 현재 변경사항을 자동 분류 후 (승인받아) 커밋
/git-commit --staged     # 이미 staged된 파일만 대상으로
```

## 동작 프로세스

### 1단계 — 변경사항 수집

```bash
git status --short          # 변경 파일 목록
git diff --stat             # unstaged 규모
git diff --cached --stat    # staged 규모 (--staged 모드)
```

필요하면 `git diff <파일>`로 실제 내용을 확인해 커밋 메시지 근거를 잡는다.

### 2단계 — 논리 단위 분류

**기준: "하나의 커밋 = 하나의 논리적 변경"**. 파일 위치가 아니라 *변경 의도*로 묶는다.

- 같은 기능/버그/문서 주제에 속하면 서로 다른 디렉터리라도 한 그룹.
- 무관한 변경은 별도 커밋으로 분리 (설정 잡변경이 기능 커밋에 섞이지 않게).
- 모듈 경계(aps-core, mpn, mls, mcm …)가 다르면 원칙적으로 분리.

참고용 힌트 (절대 규칙 아님):

| 성격 | 대표 경로 |
|------|-----------|
| 백엔드 코드 | `src/backend/**` (aps-core, mpn, mls, mcm …) |
| 프런트엔드 | `src/frontend/**`, `m-mpn`, `m-mcm` |
| 문서/ADR | `docs/**`, `adr/**`, `*.md` |
| 마이그레이션 | `**/db/migration/**`, `V*.sql` |
| 테스트 | `*Test.java`, `*.test.*`, `*.spec.*` |
| 도구/스크립트 | `tools/**`, `scripts/**`, `*.sh` |

### 3단계 — 커밋 메시지 (Conventional Commits)

형식: `type(scope): subject`

- **subject(요약)는 한글로 작성한다.** `type(scope):` 접두어만 영문 규약을 쓰고, 요약 문장은 한국어로 쓴다.
- **본문 첫 줄에 "쉬운 설명"을 넣는다.** 무엇을 왜 바꿨는지, 개발을 모르는 현업 담당자도 이해할 수 있게 한두 문장으로 아주 쉽게 풀어 쓴다. 그다음 상세 변경 목록을 붙인다.

```
type(scope): 한글 한 줄 요약

쉬운 설명: (개발 용어 없이) 왜 이 변경이 필요했고 무엇이 좋아지는지 한두 문장.

- 상세 변경 1
- 상세 변경 2

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

예시:

```
fix(mpn): 콘솔 폴링 중복 실행 방지

쉬운 설명: 시뮬레이션 실행 중 화면을 여러 번 열면 이전 실행 결과가
겹쳐 보이던 문제를 막았습니다. 이제 항상 최신 실행 결과만 표시됩니다.

- 폴링 세대(generation) 토큰으로 이전 응답 무시
- 관련 테스트 DOM 런타임 선언

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

**type** (저장소 실측 빈도순): `docs` · `feat` · `fix` · `test` · `chore` · `refactor` · `perf` · `style`

**scope** = 변경 대상 모듈. 저장소에서 실제 쓰는 값:
`aps`(또는 세분화 `aps-planning`·`aps-scheduling`·`aps-bom`·`aps-master`) · `mpn` · `mpp` · `mls` · `mcm` · `mqc` · `shared` · `frontend` · `tools` · `adr` · `kafka` · `portal` · `sqlite` · `caravan`(-hub) · `cactus`(-core)

- 적절한 scope가 없으면 새 모듈명을 써도 되나, 기존 값 재사용을 우선한다.
- 정말 애매하면 scope를 생략(`docs: …`)해도 되지만 지양한다.

**Co-Authored-By 트레일러 규칙**:
- Claude가 작성 → `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Codex가 작성 → `Co-Authored-By: Codex <noreply@openai.com>`
- 세션 모델이 다르면 그 모델명으로 맞춘다.

### 4단계 — 사용자 승인

분류안을 다음 형태로 제시하고 승인을 받는다.

```
분류된 변경사항 (3개 커밋 예정):

[1] fix(mpn): 콘솔 폴링 세대 가드
    - src/frontend/m-mpn/.../console.ts
    - src/frontend/m-mpn/.../console.test.ts

[2] docs(aps): ADR-0057 오더합치기 정책 갱신
    - adr/ADR-0057-order-merge.md

[3] chore(tools): bp-sync 조건부 GET 옵션 추가
    - tools/bp-sync

이대로 커밋할까요? (y / n / e=그룹 편집)
```

### 5단계 — 커밋 실행

그룹마다 반복:

```bash
git add <그룹 파일들>
git diff --cached --stat        # 4번 원칙: staged 범위 재확인
git commit -m "type(scope): 한글 한 줄 요약" -m "쉬운 설명: 왜 바꿨고 무엇이 좋아지는지 쉬운 한두 문장.

- 상세1
- 상세2

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

전부 끝나면 `git log --oneline -N`으로 결과를 사용자에게 보고한다. push는 하지 않는다.

## 사후 수정

- **직전 커밋 메시지 수정**: `git commit --amend`
- **의도치 않게 섞여 커밋 + 아직 미push**: `git reset --soft HEAD~1` 후 재분류. (혼입 커밋을 push하지 않은 상태에서만 안전.)
- ⚠️ 이 환경은 대화형 리베이스(`git rebase -i`)를 지원하지 않는다. 커밋 재구성이 필요하면 `reset --soft`/`--mixed`와 재커밋 조합으로 처리한다.

## 주의사항 요약

1. 커밋 전 `git diff --cached`로 범위 확인 — 저장소에서 실제로 발생한 혼입 사고의 재발 방지 항목이다.
2. 하나의 커밋 = 하나의 논리적 변경.
3. push·머지는 별도 명시 요청이 있을 때만.
4. 민감정보(키·비밀번호) diff 검사.
5. Co-Authored-By 트레일러는 작성 주체(Claude/Codex)에 맞춘다.
6. 요약은 한글로, 본문 첫 줄엔 현업도 이해할 "쉬운 설명"을 넣는다.
