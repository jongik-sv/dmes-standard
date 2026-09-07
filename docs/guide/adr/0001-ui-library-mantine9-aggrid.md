# ADR-0001: 공통 UI 기반 Mantine 9 채택과 그리드 ag-grid-community 유지

- **Status**: ACCEPTED
- **Date**: 2026-09-07
- **Decision Date**: 2026-09-07
- **Context Tags**: FRONTEND, UI-LIBRARY, 전모듈횡단

## 쉬운 설명 (현업용 요약)

지금까지 프론트엔드 화면은 버튼·입력창·모달 같은 공통 부품 일부를 MUI 로,
일부를 자체 제작 CSS 로 섞어 만들어 왔다. 이 방식은 화면마다 부품이 조금씩
다르게 보이고, 새 부품을 만들 때마다 다시 그려야 하는 비효율이 있었다.

이번 결정으로 화면의 모든 공통 부품(버튼·입력창·모달·탭·트리·레이아웃 등)의
내부 구현을 "Mantine 9" 라는 단일 부품 라이브러리로 통일한다. 다만 데이터를
표 형태로 보여주는 "그리드"만은 지금 쓰고 있는 "ag-grid" 를 그대로 둔다 —
그리드는 이미 잘 동작하고 있고, 다른 대안으로 바꾸면 얻는 이득보다 다시
만드는 비용이 훨씬 크기 때문이다. 함께 쓰이던 MUI 는 실제로 화면에서 쓰이는
곳이 없어 완전히 걷어낸다.

**사용자가 화면에서 체감하는 변화는 없다.** 화면 배치, 버튼 이름과 위치,
조회·저장 동작은 그대로다. 바뀌는 것은 화면 뒤편의 구현 방식과, 그 부품들을
계속 안전하게 유지보수할 수 있는가 하는 부분이다.

## Context (배경)

- Antigravity 분석 보고서(`mantine_vs_shadcn_analysis.md`)는 "Mantine + Mantine
  React Table(MRT)" 조합을 권고했다. 그러나 2026-09-07 시점 재확인 결과 MRT 는
  사실상 유지보수가 멈춘 상태였다(아래 표, 스펙 §1).

  | 항목 | 확인 값 |
  |---|---|
  | MRT 마지막 배포 | 2.0.0-beta.9 (2025-02-17), peer `@mantine/core ^7.9` |
  | MRT 저장소 | 2026-06 CI 워크플로 삭제 이후 커밋 없음 |
  | Mantine 최신 | 9.6.0 (2026-08-31), peer `react ^19.2` |
  | 현재 프론트 | Next 16.1.6 · React 19.2.3 · Tailwind v4 · pnpm 10 |

- 현황 조사 결과(스펙 §2):
  - 화면 모듈(m-mcm 22개 화면, m-mpn/mqc/mls/mpp sample, m-analog)은 UI 를 전량
    `@dk-oasis/shared/*` 서브패스로만 소비한다. `@mui`·`ag-grid` 직접 import 는
    화면 코드에 0건이다.
  - ag-grid 의존은 `components/grid/AgDataGrid.tsx` 와 이를 재사용하는
    `components/lookup/LookupModal.tsx` 두 파일뿐이다. 화면에서 그리드 ref API 를
    직접 호출하는 곳은 없다.
  - 그리드 외 공통 UI(폼 13종, modal, message-provider, tabs, tree, layout 12종,
    portal-shell, 로그인 폼, charts 5종, matrix-table)는 전부 순수 React + 전역
    CSS 자체 구현으로, 부품마다 완성도와 접근성 수준이 제각각이었다.
  - 단위 테스트 `shared/tests/unit` 17개, e2e `e2e/` 32 spec 이 shared 의 클래스명·
    role/label 을 셀렉터로 쓰고 있어, 교체 시 화면·테스트 계약을 유지해야 하는
    제약이 있다.
  - 전 모듈 횡단 결정을 담을 ADR 위치가 그동안 없었다(모듈별
    `docs/{module}/design/adr/` 만 존재). 본 ADR 로 `docs/guide/adr/` 를 신설한다.

## Decision (결정)

- **D1** 그리드를 제외한 `@dk-oasis/shared` 의 공통 UI(폼·모달·메시지·탭·트리·
  레이아웃·portal-shell·로그인 폼)를 **Mantine 9**(`^9.6.0` 고정) 위에서 재구현한다.
- **D2** 그리드는 이미 shared 에 있는 **ag-grid-community v33**(MIT 라이선스)을
  그대로 유지한다. `mantine-react-table`(MRT)은 채택하지 않는다.
- **D3** MUI 계열 의존(`@mui/material`, `@mui/x-data-grid`, `@emotion/*`)과
  `MuiDataGrid` 컴포넌트를 제거한다. 실사용 화면이 0건이기 때문이다.
- **D4** 1단계 범위는 `@dk-oasis/shared` 내부 구현 교체로 한정한다. shared 의
  export 이름·props 인터페이스·CSS 서브패스는 바꾸지 않아, 화면 코드와 e2e
  셀렉터는 무변경으로 둔다. 화면이 Mantine 컴포넌트를 직접 쓰는 방식으로의
  전환, 화면 inline style 정리, 다크 모드 등은 2단계 후속 과제로 분리한다.
- **D5** 디자인 토큰(`variables.css`)은 Mantine theme 값의 별칭으로 옮겨, ag-grid
  테마와 잔존 CSS 가 같은 색상·타이포그래피 토큰을 공유하게 한다.

## Consequences (결과)

- shared 의 폼·모달·탭·트리·레이아웃·portal-shell·로그인 폼 구현이 Mantine 9
  API 기반으로 전면 교체되고, 호스트 앱(`m-mcm`, `m-design-dummy`)은 루트에서
  `DmesUiProvider` 로 한 번만 감싸면 된다.
- MUI·`@emotion/*` 의존과 `MuiDataGrid` 가 제거되어 번들·유지보수 대상이
  줄어든다.
- 그리드는 변경이 없어 ag-grid 기반 기능(대용량 렌더링, 정렬/필터, 행 상태
  관리)과 관련 e2e 셀렉터(`.ag-*`, `.cm-data-grid` 등)가 그대로 유지된다.
- shared export 계약을 유지하는 어댑터 레이어(예: `TreeNode`→`TreeNodeData`
  변환)가 당분간 필요하다. 이는 2단계에서 화면이 Mantine 컴포넌트를 직접 쓰게
  되면 재검토 대상이다.
- Mantine 은 화면 앱마다 단일 인스턴스여야 하므로 버전(`^9.6.0`)을 shared·
  호스트 전체에서 고정 관리해야 한다. 버전이 어긋나면 런타임 경고나 스타일
  불일치가 발생할 수 있다.
- 향후 그리드 요구사항이 커져 ag-grid 로 감당 못 하는 상황이 오면, 별도 ADR 로
  재논의한다(D2 는 지금 시점의 결정이며 향후 변경 시 새 ADR 을 낸다).

## Alternatives Considered (대안)

- **A안: MRT(mantine-react-table) 채택 + Mantine 7 고정** — 애초 분석 보고서의
  권고안. 그러나 MRT 마지막 배포가 2.0.0-beta.9(2025-02-17)로 1년 넘게
  정지 상태이고 peer 가 `@mantine/core ^7.9` 로 최신 Mantine 9 계열과 맞지
  않는다. 이를 채택하면 신규 도입 시점부터 구버전 Mantine 에 묶이고, 향후
  Mantine 9 로 올라가려면 다시 그리드를 갈아엎어야 한다. 유지보수가 멈춘
  라이브러리에 신규 의존을 추가하는 위험이 이득보다 크다고 판단해 기각.
- **B안: `mantine-datatable` 채택** — Mantine 생태계 안의 경량 테이블
  라이브러리다. 그러나 현재 그리드는 `AgDataGrid`/`GridPanel`/
  `useGridDataManager`/`useRowStateManager` 로 대용량 조회, 행 상태(추가/수정/
  삭제) 관리, LOV 팝업 연동까지 이미 구현·검증되어 있고 ag-grid 직접 참조는
  2개 파일뿐이라 교체 압박이 없다. `mantine-datatable` 로 옮기면 이 기능들을
  다시 구현해야 하는데, 그럴 이유(성능 문제·라이선스 문제 등)가 현재 없어
  기각.
- **C안: TanStack Table 을 headless 로 직접 조립** — 가장 유연하지만 정렬·
  필터·페이징·행 상태·테마 연동을 처음부터 다시 짜야 한다. 이미 동작하는
  ag-grid-community v33(MIT)을 교체할 실익이 없고, 재작성 리스크와 회귀
  테스트 부담만 커져 기각.

## References

- [설계 스펙: 공통 UI 기반 전환 설계 — Mantine 9 + ag-grid-community](../../superpowers/specs/2026-09-07-mantine9-ui-migration-design.md)
- [FrontEnd 표준 Part B: `@dk-oasis/shared` 사용 정책](../FrontEnd/standard-v2/part-b-shared-policy.md)
- `.claude/skills/adr-write/SKILL.md` — ADR 규약 정본
