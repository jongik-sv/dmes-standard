# oasis-project-support

OASIS 기반 BPMN 서비스 저장소 작업을 지원하는 Claude Code / Codex skill.

OASIS (BPMN-driven 비즈니스 서비스 런타임) 프로젝트에서 `.bpmn` 흐름을 읽고 수정하거나, `PropertyEL` / `MethodBinding` / `JavaServiceTask` / `ScriptTask` 동작을 디버깅하거나, `ServiceResult` / `path()` / `messages()` 기반 테스트를 설계하거나, `UserException` / Error End/Boundary Event 동작을 해석하거나, 새 OASIS 흐름을 BPMN + 테스트와 함께 추가할 때 LLM 에게 컨텍스트를 제공한다.

`bpmn-skill` 과 함께 쓰는 것을 전제로 한다 — `.bpmn` 파일의 구조 편집은 `bpmn-skill` 이, OASIS 런타임 의미·바인딩·테스트는 이 skill 이 담당한다.

## 설치

Claude Code / Codex 의 skills 디렉토리 아래에 클론해서 사용한다.

```sh
# Claude Code
mkdir -p ~/.claude/skills && cd ~/.claude/skills
git clone git@github.com:oasis-official/oasis-skill.git oasis-project-support

# Codex
mkdir -p ~/.codex/skills && cd ~/.codex/skills
git clone git@github.com:oasis-official/oasis-skill.git oasis-project-support
```

이후 Claude Code 또는 Codex 가 자동으로 `SKILL.md` 의 frontmatter 를 읽어 트리거 조건에 맞을 때 이 skill 을 활성화한다.

## 디렉토리 구조

```
oasis-project-support/
├── SKILL.md                      # entry point + trigger frontmatter + workflow
├── README.md                     # 이 파일
├── agents/
│   └── openai.yaml
└── references/
    ├── core-overview.md          # OASIS runtime 계층 요약
    ├── pattern-map.md            # 행동 패턴별 인덱스
    ├── bpmn-skill-integration.md # bpmn-skill 과의 handoff 계약
    ├── *-playbook.md / *-guide.md (14 개)
    │                             # 문제 해결 가이드 (binding, testing, branching,
    │                             # service-result, exception, list-loop,
    │                             # transaction, subservice, context, auditing,
    │                             # typed-object, state-transition,
    │                             # messaging, parallel)
    ├── source-bpmn-examples.md   # OASIS 참고 구현 inline 예제
    ├── real-project-patterns.md  # 운영 적용 패턴 카탈로그
    ├── examples/
    │   ├── services/             # 합성 BPMN 6 개
    │   ├── mappers/              # MyBatis 매퍼 2 개
    │   └── java/                 # Java 발췌 7 개
    └── upstream/                 # OASIS 공식 레퍼런스 미러 (70 개 .md)
```

## Reference 묶음

`SKILL.md` Workflow §3 의 의사결정 트리에서 네 묶음 중 하나를 먼저 고른 뒤 파일을 선택한다.

- **Overview** — 전체 구조 / 다른 skill 과의 관계 (`core-overview`, `bpmn-skill-integration`, `pattern-map`)
- **Playbook** — 특정 문제를 어떻게 풀지 (14 개의 `*-playbook.md` / `*-guide.md`)
- **Catalog** — 실제 BPMN/Java/매퍼 코드 조각 (`source-bpmn-examples`, `real-project-patterns` + `examples/`)
- **Upstream** — OASIS 공식 레퍼런스의 권위 있는 정의 (`upstream/Properties.md`, `PropertyEL.md`, `SpEL.md` 외 67 개)

“이 프로젝트에서 어떻게 적용했는가” 는 Playbook / Catalog 가, “OASIS 가 무엇을 약속하는가” 는 Upstream 이 답한다. 충돌 시 Upstream 이 정답에 가깝다.

## 트리거 예시 (`SKILL.md` frontmatter 발췌)

- “이 BPMN 이 왜 실패하는지 OASIS 관점에서 봐줘”
- “PropertyEL `names[0] -> name` 이 안 먹는 이유 찾아줘”
- “MethodBinding 에서 어떤 생성자가 선택되는지 설명해줘”
- “병렬 처리 플로우 테스트를 어디서 참고해야 해?”
- “새 OASIS 서비스 플로우를 추가하려는데 BPMN 과 테스트를 어떻게 같이 시작하면 돼?”
- “`bpmn-skill` 로 만든 BPMN 초안을 OASIS 실행 기준으로 검토해줘”
- “리스트를 루프 돌릴 때 `iter` 랑 `multiInstance` 중 뭘 써야 해?”
- “실제 운영 BPMN 에서 비슷한 사례 있어?”

## 출처

`references/upstream/` 의 70 개 마크다운은 OASIS 공식 레퍼런스 ([`oasis-reference-doc`](https://github.com/oasis-official/oasis-reference-doc)) 의 미러다. 외부 노출 시 문제 될 수 있는 식별자(개인 경로, 호스트명, 회사 도메인, 패키지 prefix `com.dongkuk.oasis`) 는 일괄 익명화되었다.

`references/examples/` 의 BPMN/Java/매퍼는 실제 OASIS 적용 사례에서 추출한 합성 예제로, 도메인 식별자는 일반화되었다.

## 라이선스

내부 사용 목적의 skill. OASIS 공식 레퍼런스 부분의 라이선스는 upstream repo 를 따른다.
