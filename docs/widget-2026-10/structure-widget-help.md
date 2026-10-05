# widget-help 구조 변경 기록

## S1. 목차 있는 문서 보기 공통 부품(MarkdownDocViewer) 등록
- 커밋: 53630e81
- 바뀌기 전: shared `markdown-editor` 서브패스에 편집기·칸·읽기 전용 뷰만 있고, 긴 문서를 목차와 함께 보여 주는 부품이 없었다.
- 바뀐 뒤: 같은 서브패스에 `MarkdownDocViewer`(왼쪽 목차 + 오른쪽 본문, 목차 클릭 이동·현재 절 표시)와 순수 함수 `splitMarkdownSections`·`tocOf`(`doc-sections.ts`)를 추가했다. 기존 export 는 그대로다(추가만).
- 바꾼 이유: 도움말·가이드처럼 긴 마크다운 문서를 여러 화면이 쓸 수 있고(CLAUDE.md 「공통 컴포넌트 행동강령」), 업무 도메인에 묶이지 않는다.
- 동작 보존 근거: 기존 shared 변경 없음. 신규 시험 `shared/tests/unit/markdown-doc-viewer.unit.test.ts` 5건 통과.
- 영향 범위: shared 새 export. `mantine-aggrid-ui` 스킬 문서(`markdown-editor.md`·`SKILL.md`·`llms.txt`·`llms-full.txt`) 갱신.
- 되돌리는 방법: 53630e81 revert(위젯 관리 도움말이 이 부품을 쓰므로 H1 커밋도 함께).

## S2. 위젯 관리 도움말(모달)과 가이드 문서 번들
- 커밋: 3a617a79, 8d327335(dev 반영 뒤 문서 보정)
- 바뀌기 전: 위젯 만드는 방법을 안내하는 문서·화면이 없었다.
- 바뀐 뒤: 위젯 관리 탭 줄 오른쪽에 「도움말」 버튼을 두고 모달로 「위젯 만드는 여러 가지 방법」을 보여 준다. 원문은 `docs/guide/FrontEnd/Widget-Authoring-Guide.md`, 화면 번들 `commWidgetMng/help/widget-guide-content.ts` 는 `scripts/gen-widget-guide.mjs`(`pnpm --filter @dk-oasis/mcm gen:widget-guide`)가 만든 사본이며 `widget-guide-sync.test.ts` 가 어긋남을 막는다.
- 바꾼 이유: 포털이 모듈 정적 파일을 서빙하지 않고 Next 설정에 `.md` 로더가 없어, 원문을 정본으로 두고 번들 사본을 생성한다. 도움말 버튼은 업무 권한(PageButton action)과 무관해 페이지 버튼이 아니라 탭 줄에 둔다.
- 동작 보존 근거: 기존 commWidgetMng 시험 8개 파일 129건 + 신규 8건 통과(137).
- 영향 범위: commWidgetMng/page.tsx(버튼·모달), m-mcm package.json(scripts 1줄).
- 되돌리는 방법: 3a617a79 revert.

## S3. 분류 LoV 조회가 빈 결과·시간 초과로 굳지 않게 함(H2)
- 커밋: a2898570
- 바뀌기 전: `use-widget-categories` 가 성공한 빈 결과도 모듈에 영구 보관했고 멈춘 응답에 탈출구가 없었다.
- 바뀐 뒤: 빈 결과·실패·8초 시간 초과는 보관하지 않고 다음 마운트에서 다시 조회한다. 반환 형식(options·titles)은 그대로다.
- 바꾼 이유: 위젯 관리 분류 Select 가 INFO 위젯에서 「없음」 으로 보이던 결함. 실제 원인은 메인 포털 5100 dev 서버 상태(/api/*/lov/** 응답 멈춤, 재기동으로 해소)였고 BFF·BE 코드 결함은 아니었다. 이 수정은 같은 상황에서 화면이 영구히 굳지 않게 하는 방어다.
- 동작 보존 근거: `use-widget-categories.test.ts` 5건.
- 영향 범위: 위젯 관리 상세·목록 칸, 홈 위젯 서랍 분류(categoryTitles).
- 되돌리는 방법: a2898570 revert.
