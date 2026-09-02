---
name: adr-write
description: "ADR(설계 결정 기록)을 발행·개정·확정할 때 사용합니다. 전 모듈(aps/mcm/mls/mqc/mpp/mas) 공용입니다. 번호 채번, 필수 절 스캐폴딩, 규약 린트, README 인덱스 정합 확인을 다룹니다. 되돌리기 어려운 설계 결정을 남길 때, PROPOSED를 ACCEPTED로 전환할 때 진입합니다."
---

# ADR 작성 (dmes-standard 전 모듈)

> **본 문서가 ADR 규약의 정본이다** (2026-07-20 표준화). ADR 은 원래 APS 전용이었으나
> 전 모듈 공용 체계가 됐고, 규약 본문을 여기로 옮겼다. 각 모듈의
> `docs/{module}/design/adr/README.md` 는 그 모듈의 **인덱스**만 유지한다.

## 0. 목적과 불변 원칙

되돌리기 어려운 설계 결정을 추적·기록한다.

**한 번 ACCEPTED 된 결정(Decision/D-항)은 변경하지 않는다.** 결정을 바꾸려면 새 ADR 을
발행하거나 이전 ADR 의 Status 를 SUPERSEDED 로 전이한다. 단 구현 상태·근거·정합성
보강은 검토 후 본문에 반영할 수 있다.

파일명은 `NNNN-{kebab-case-slug}.md`, 위치는 `docs/{module}/design/adr/`.

## 1. 번호는 모듈별 독립이다

**모듈마다 `0001` 부터 따로 매긴다. 접두어를 붙이지 않는다.**
모듈별로 문서를 따로 관리하므로 디렉터리가 모듈을 구분한다.

```
docs/aps/design/adr/0059-...md     ← APS 의 59 번
docs/mls/design/adr/0001-...md     ← MLS 의 1 번 (별개 문서)
```

⚠️ 따라서 **`ADR-0001` 은 모듈 안에서만 일의적이다.** 다른 모듈에서 인용할 때는
반드시 경로 링크를 함께 쓴다 — 번호만 쓰면 어느 모듈 결정인지 알 수 없다.

```markdown
같은 모듈 안:  ADR-0019 참조
모듈 밖에서:   [APS ADR-0019](../aps/design/adr/0019-item-level-substitution.md)
```

APS 는 이미 0001~0059 를 쓰고 있고 문서·코드에 인용이 2,774 건 있다. 소급 개명하지 않는다.

## 2. 현황과 채번

```bash
python3 .claude/skills/adr-write/scripts/adr_tool.py status --module mls
```

번호 공백, 같은 번호를 공유하는 파일(본 ADR + 부속 문서 관행), 다음 번호를 낸다.

## 3. 발행

```bash
python3 .../adr_tool.py new --module mls --slug stock-id-surrogate-key \
    --title "슬리팅 재고 대리키 도입" --date 2026-07-20 --tags "MLS, inventory"
```

- 기본 Status 는 `PROPOSED` — Trigger 절이 포함된다.
- `--status ACCEPTED` 면 Trigger 절을 뺀 뼈대를 만든다.
- 모듈에 ADR 디렉터리가 없으면 만든다(`docs/{module}/design/adr/`).

## 4. 필수 절과 순서

```
# ADR-NNNN: {제목}
- **Status** / **Date** / **Decision Date** / **Context Tags**
## 쉬운 설명 (현업용 요약)
## Context (배경)
## Decision (결정)
## Consequences (결과)
## Alternatives Considered (대안)
## Trigger (PROPOSED 인 경우만)
## References
```

**쉬운 설명이 먼저다.** 현업 담당자가 기술 배경 없이 읽고 "무엇이 문제였고 무엇을
결정했는지" 를 이해할 수 있는 업무 언어로 쓴다. 구현 용어·클래스명·코드 인용 금지.
기술 상세는 그 뒤에 둔다.

규약 외 절(`용어 정의`, `Open Questions`, `구현 지점`, `Acceptance Evidence` 등)은
필요하면 추가해도 된다 — 최근 ADR 들이 실제로 쓰고 있다. 린트는 필수 절 누락만 본다.

## 5. Status 는 상태값만 쓴다

```
PROPOSED | ACCEPTED | REJECTED | DEPRECATED | SUPERSEDED by ADR-XXXX
```

구현 진척·회귀 결과·개정 이력을 Status 칸에 쓰지 않는다. 본문에 쓴다.

⚠️ **기존 APS ADR 59 건 중 35 건이 Status 칸에 산문을 담고 있다.** 이는 소급 정리
대상이 아니다(사용자 결정 2026-07-20: 신규부터 규율). 린트는 지정한 파일만 검사하므로
기존 문서를 건드리지 않는다.

전이는 `PROPOSED → ACCEPTED → (DEPRECATED | SUPERSEDED by ADR-XXXX)`.
전이할 때 본문은 그대로 두고 Status 만 바꾸고 후속 ADR 링크를 추가한다.
**ACCEPTED 된 Decision/D-항은 변경하지 않는다** — 결정을 바꾸려면 새 ADR 을 낸다.

## 6. 린트

작성한 파일을 지정해서 검사한다.

```bash
python3 .../adr_tool.py lint docs/mls/design/adr/0001-stock-id-surrogate-key.md
```

모듈 전체 현황(참고용, 기존 문서 포함):

```bash
python3 .../adr_tool.py lint --module aps --all
```

`--all` 은 보고만 하고 exit 0 이다. 기존 문서의 ERROR 로 작업이 막히지 않게 하기 위함이다.

## 7. 인덱스 정합

```bash
python3 .../adr_tool.py index --module aps
```

파일과 README 인덱스 표의 어긋남(미등재·유령 행·가리켜지지 않는 부속 문서)을 보고한다.

**표를 자동 재생성하지 않는다.** Status 열에 손으로 쌓아온 서술이 있어(최대 1,900 자)
재생성하면 그 내용이 사라진다. 어긋남만 알리고 수정은 사람이 한다.

현재 aps 에서 `0019` 번호가 이 검사에 걸린다 — 파일 2 개(본 ADR + 핸드오버)에 인덱스
행은 1 개뿐이라 하나를 가리키지 못한다.

## 8. 확정 전 적대적 검토는 필수다

새 ADR 발행 · 본문 개정 · `PROPOSED → ACCEPTED` 확정 전에 **팀 에이전트(멀티에이전트
적대적 검토)** 로 논리·정합성·회귀를 검증하고 확정된 결함을 반영한다.
이 스킬의 린트는 형식만 본다 — 내용 검증을 대신하지 않는다.

상세 규칙은 [`Aps-Guide.md` §설계 문서 개정 규칙](../../../docs/aps/Aps-Guide.md).
(APS 문서에 있으나 전 모듈에 적용한다.)

## 9. 인용 표기

코드에서는 `ADR-0054` 를 식별자로 쓸 수 없어 변형이 자연발생했다. 모두 정상이다:

| 위치 | 표기 | 예 |
|---|---|---|
| 문서·주석 | `ADR-NNNN` | `// ADR-0038 D1: 스케줄링 진단 필드` |
| 테스트 클래스 | `Adr{NNNN}` | `Adr0054ConfirmAxisPinTest.java` |
| 파일·SQL | `adr{nnnn}` | `fix-mpn-adr0054-allocation-ownership.sql` |

결정 항목까지 인용하는 `ADR-0053 D1~D3` 형식이 코드 전반의 사실상 표준이다. 권장한다.

## 10. 도구 자체 검증

```bash
python3 .claude/skills/adr-write/scripts/selftest.py
```

규약 위반을 하나씩 심어 린트가 실제로 잡는지 확인한다(RED-first). 린트 규칙을
고쳤으면 반드시 다시 돌린다.
