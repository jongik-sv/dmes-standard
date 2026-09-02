# MES Design Guide Index

MES 화면 설계 분기에서 사용하는 가이드 인덱스다. 이 폴더는 5종 설계 산출물(분석리포트, 기능설계서, 디자인설계서, BPMN설계서, 정합체크서)을 만들기 위한 정본이다.

## 1. 읽기 순서

| 순서 | 문서 | 역할 |
|---:|---|---|
| 0 | [`DESIGN_USER_GUIDE.md`](DESIGN_USER_GUIDE.md) | 사용자가 화면 설계를 요청·보완·완료 확인할 때 쓰는 시작 가이드. |
| 1 | [`00_Agent지시_가이드.md`](00_Agent지시_가이드.md) | 상위 실행 지시서. 분석리포트 선행, 게이트, 산출물 생성 순서를 정의한다. |
| 2 | [`01_Agent부속_가이드.md`](01_Agent부속_가이드.md) | 식별자 부속서. `moduleId`, `screenId`, `pageId`, `serviceId`, 테이블명 등 명명 정본이다. |
| 3 | [`02_화면_기능설계_가이드.md`](02_화면_기능설계_가이드.md) | 기능설계서 규칙. 산출물 저장 경로와 파일명 규칙도 여기서 확인한다. |
| 4 | [`03_화면_디자인설계_가이드.md`](03_화면_디자인설계_가이드.md) | 디자인설계서 규칙. 화면 레이아웃, 컴포넌트, 반응형, 아이콘 기준을 정의한다. |
| 5 | [`04_백단_BPMN_기능설계_가이드.md`](04_백단_BPMN_기능설계_가이드.md) | BPMN설계서 규칙. `serviceId`, `action`, API 패턴, 서버 처리 흐름을 정의한다. |

`01_Agent부속_가이드.md` 는 기능설계서가 아니다. 기능/디자인/BPMN 3종 설계 가이드는 `02`, `03`, `04` 이다.

## 2. 산출물 생성 순서

| 순서 | 산출물 | 템플릿 |
|---:|---|---|
| 1 | `{screenId}_분석리포트.md` | [`templates/분석리포트.template.md`](templates/분석리포트.template.md) 조립 허브 |
| 2 | `{screenId}_기능설계서.md` | [`templates/기능설계서.template.md`](templates/기능설계서.template.md) |
| 3 | `{screenId}_디자인설계서.md` | [`templates/디자인설계서.template.md`](templates/디자인설계서.template.md) |
| 4 | `{screenId}_BPMN설계서.md` | [`templates/BPMN설계서.template.md`](templates/BPMN설계서.template.md) |
| 5 | `{screenId}_정합체크.md` | [`templates/정합체크서.template.md`](templates/정합체크서.template.md) 조립 허브 |

개발 단계 진입 시에는 필요에 따라 [`templates/개발체크리스트.template.md`](templates/개발체크리스트.template.md) 를 6번째 산출물로 만든다.

## 3. Agent 진입 게이트

- 분석리포트 없이 기능/디자인/BPMN 설계서를 먼저 작성하지 않는다.
- 원본 자료 `docs/external/KsmErpK/` 를 확인하지 못하면 설계를 시작하지 않는다.
- 분석완료 게이트 G1~G7 이 통과하지 않으면 후속 설계서 작성으로 넘어가지 않는다.
- 분석리포트에 없는 조회조건, 그리드 컬럼, 버튼, 팝업, 상태값, action 을 후속 설계서에 임의 추가하지 않는다.
- 정합체크서가 불일치 항목을 남기면 설계 완료로 판정하지 않는다.

## 4. 빠른 선택표

| 필요한 판단 | 정본 위치 |
|---|---|
| 산출물 경로와 파일명 | `02_화면_기능설계_가이드.md` 의 "설계 산출물 저장 위치" |
| `moduleId` / 화면식별자 / `pageId` / `serviceId` | `01_Agent부속_가이드.md` |
| 분석리포트 선행 원칙과 G1~G7 | `00_Agent지시_가이드.md` |
| 기능 요구, 필드, 버튼, 상태, 검증 | `02_화면_기능설계_가이드.md` |
| 화면 레이아웃과 shared 컴포넌트 | `03_화면_디자인설계_가이드.md` |
| OASIS vs Phase 7 API 패턴 | `04_백단_BPMN_기능설계_가이드.md` |
| 개발 분기 진입 가능 여부 | [`../MES/Mes-Guide.md`](../MES/Mes-Guide.md) |

## 5. 유지보수 규칙

- 새 설계 규칙은 먼저 어느 문서가 정본인지 정하고, 다른 문서에는 링크만 둔다.
- 템플릿 구조를 바꾸면 `00_Agent지시_가이드.md` 의 템플릿 잠금 규칙과 이 README 를 함께 갱신한다.
- 파일명 번호 체계는 유지한다. `01` 은 부속서, `02~04` 는 3종 설계 가이드다.
