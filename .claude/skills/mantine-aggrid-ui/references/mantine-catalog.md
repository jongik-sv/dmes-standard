# Mantine 컴포넌트 → MES 공통 컴포넌트 대응표

[mantine.dev/core/package](https://mantine.dev/core/package/) 의 컴포넌트(설치본 `@mantine/core` 9.6.0 의 117개, `@mantine/dates` 9.6.0)를 MES 화면 관점에서 분류한다. **화면(m-*)은 Mantine 을 직접 import 하지 않는다.** 화면 개발자는 ①표에서 shared 래퍼를 찾아 쓰고, 래퍼가 없으면 ③표를 보고 shared 에 래퍼를 새로 등록한다(Part B §18, 새 컴포넌트는 묻지 않고 진행). 이 표는 shared 를 고치는 개발자가 어떤 Mantine 컴포넌트 위에 래퍼를 만들지 정할 때도 쓴다.

Mantine 문서 조회: `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py get <이름>`. 목록은 mantine.dev 최신판 기준이므로, 새로 쓰려는 컴포넌트는 설치본 `node_modules/@mantine/core/lib/components/<이름>` 이 있는지 먼저 확인한다(작성 시점에는 목록 전부가 설치본에 있다).

## ① shared 래퍼가 있다 — 화면은 래퍼를 쓴다

| Mantine | shared 래퍼 (import) | 문서 |
|---|---|---|
| `Button` | `Button` (`form`) · `PageLayout` 상단 버튼 · `Modal` footer | [button](components/button.md) · [page-layout](components/page-layout.md) |
| `TextInput` | `Input` (`form`) · `LookupTextField` (`lookup`) | [input](components/input.md) · [lookup](components/lookup.md) |
| `NativeSelect` | `Select` (`form`) · `SearchField type="select"` | [select](components/select.md) |
| `Select` | `ComboBox` (`form`, 검색·신규 생성) | [combo-box](components/combo-box.md) |
| `MultiSelect` | `MultiSelectComboBox` (`form`) | [multi-select-combo-box](components/multi-select-combo-box.md) |
| `Checkbox` | `Checkbox` (`form`) | [checkbox](components/checkbox.md) |
| `Radio` (+`Group`) | `Radio` (`form`) · `SearchField type="radio"` | [radio](components/radio.md) |
| `Textarea` | `Textarea` (`form`) | [textarea](components/textarea.md) |
| `Input`·`Popover` | `DateTimePicker` · `FormGroup` 내부 | [date-time-picker](components/date-time-picker.md) |
| `Loader`·`Overlay` | `Spinner` · `LoadingOverlay` (`form`) | [loading](components/loading.md) |
| `Progress` | `ProgressBar` (`form`) | [loading](components/loading.md) |
| `Modal` | `Modal` · `MessageModal` (`modal`) · `ErrorModal` (`layout`) | [modal](components/modal.md) · [message](components/message.md) |
| `notifications` | `useMessage` 의 `toast: true` (`message-provider`) | [message](components/message.md) |
| `Tabs` | `Tabs` (`tabs`) | [tabs](components/tabs.md) |
| `Tree`·`useTree` | `Tree` (`tree`) | [tree](components/tree.md) |
| `Paper` | `SearchArea` · `ContentPanel` (`layout`) | [search-area](components/search-area.md) · [content-body](components/content-body.md) |
| `Group`·`Title`·`Text` | `PageLayout` · `SearchField` 내부 | [page-layout](components/page-layout.md) |
| `ActionIcon` | `LookupIconButton` (`lookup`) | [lookup](components/lookup.md) |
| dates `DateInput` | `DatePicker` (`form`) | [date-picker](components/date-picker.md) |
| dates `InlineDateTimePicker` | `DateTimePicker` (`form`) | [date-time-picker](components/date-time-picker.md) |
| `Table` | **쓰지 않는다** → `AgDataGrid` (`grid`). 라벨-값 표는 `DETAIL_*` | [ag-data-grid](components/ag-data-grid.md) · [detail-form](components/detail-form.md) |
| `Pagination` | **쓰지 않는다** → shared `Pagination` (`grid`, 자체 구현) | [pagination](components/pagination.md) |
| `Splitter` | **쓰지 않는다** → `ContentBody resizable` | [content-body](components/content-body.md) |
| `Badge` (그리드 셀) | `GridBadge` (`grid`, 자체 구현) | [grid-badge](components/grid-badge.md) |
| `Badge` (그리드 밖) | `Badge` (`form`, 자체 구현) | [badge](components/badge.md) |
| `SegmentedControl` | `SegmentedControl` (`form`) | [segmented-control](components/segmented-control.md) |
| `Card`·`SimpleGrid` (대시보드) | **쓰지 않는다** → `DashboardGrid`·`DashboardCard`·`KpiTile` (`dashboard`, 자체 구현) | [dashboard](components/dashboard.md) |
| `CopyButton` | `CopyTextButton` (shared 내부, `ErrorModal` 이 사용) | — |
| `@mantine/tiptap` `RichTextEditor` | **쓰지 않는다** → `MarkdownEditor`·`MarkdownView`·`MarkdownField` (`markdown-editor`, Tiptap 직접 사용) | [markdown-editor](components/markdown-editor.md) |

Mantine 이 아닌 shared 공통 요소: `AgDataGrid`·`GridPanel`·`useGridDataManager`(ag-grid-community), `MatrixTable`, `charts`(자체 SVG), `exportToExcel`(xlsx).

서식 있는 글(메모·설명) 편집은 `@mantine/tiptap` 의 `RichTextEditor` 대신 shared `markdown-editor` 를 쓴다. 이유: ① 포털이 원격 모듈의 CSS 파일을 싣지 않는다 — `RichTextEditor` 는 `@mantine/tiptap/styles.css` 를 따로 불러와야 하는데, shared 래퍼는 자기 `<style>` 을 직접 넣는다(Part B §18-3). ② 화면은 Mantine 을 직접 쓰지 않고 shared 래퍼만 쓴다 — 도구 막대도 shared `Button`·`Input` 으로 그려 다른 입력 칸과 모습이 같다. ③ 저장 형식이 HTML 이 아니라 마크다운 문자열이다(`RichTextEditor` 는 HTML 을 다룬다). `@mantine/tiptap` 은 설치하지 않는다.

## ② 셸·Provider 안에서만 쓴다 — 화면은 의식하지 않는다

`AppShell` · `Menu` · `UnstyledButton` · `ScrollArea` · `Container` · `Stack` · `MantineProvider` · `createTheme` · dates `DatesProvider` · `@mantine/modals` `ModalsProvider` · `@mantine/notifications` `Notifications`. 정본은 `src/frontend/shared/src/{portal-shell,ui-provider}` 다.

## ③ MES 에 쓸모가 있지만 래퍼가 없다 — shared 추가 후보

화면에서 Mantine 을 직접 쓰지 않는다. 필요하면 shared 에 래퍼를 새로 등록하고(Part B §18 절차, 새 컴포넌트는 묻지 않고 진행) 컴포넌트 문서와 [components/llms.txt](components/llms.txt) 에 등재한다. 이미 있는 래퍼를 바꾸는 일은 사용자 승인 뒤에 한다. 우선순위는 MES 화면에서 나올 빈도로 매겼다.

| Mantine | MES 용도 | 우선 | 지금 쓰는 대체 |
|---|---|---|---|
| `NumberInput` | 수량·금액·중량 입력(천 단위 구분, 소수 자리, min/max) | 높음 | `Input type="number"` |
| dates `MonthPickerInput` · `YearPickerInput` | 월별·연도별 실적 조회조건 | 높음 | `DatePicker` 로 일자 입력 |
| `Tooltip` | 아이콘 버튼·잘린 값 설명 | 높음 | `title` 속성, `FormGroup tip` |
| dates `TimeInput` · `TimePicker` | 교대 시작 시각, 설비 가동 시각 | 중간 | `DateTimePicker` |
| `Alert` | 화면 위 안내·경고 상자 | 중간 | 없음(`<p style>` 금지) |
| `Stepper` | 공정·승인 단계 진행 표시 | 중간 | 없음 |
| `Timeline` | 상태 변경 이력 | 중간 | `AgDataGrid` 이력 목록 |
| `FileInput` · `FileButton` | 첨부·CSV 업로드 | 중간 | 원시 `<input type="file">` (`m-mdm/pages/dmd/dataCsvUploadPop`) |
| `TagsInput` | LOT·시리얼 번호 여러 개 입력 | 중간 | `Textarea` 줄바꿈 |
| `Cascader` · `TreeSelect` | 공장 > 라인 > 설비 같은 계층 코드 선택 | 중간 | `ComboBox` 여러 개 · `LookupModal` |
| `Switch` | 사용 여부 즉시 토글 | 낮음 | `Radio`(사용/미사용) |
| `Accordion` · `Fieldset` | 긴 상세 폼의 묶음 | 낮음 | `Tabs` |
| `Drawer` | 옆에서 여는 상세 | 낮음 | `ContentBody` 좌우 분할 |
| `RingProgress` · `SemiCircleProgress` | 대시보드 달성률 | 낮음 | `charts` `DonutChart` |
| `Kbd` | 단축키 안내(F8 조회) | 낮음 | 없음 |
| `Skeleton` · `EmptyState` | 로딩·빈 상태 자리 | 낮음 | `AgDataGrid` `loading`·기본 빈 문구 |
| `Menu` (화면 안) | 버튼이 많을 때 "더보기" | 낮음 | 상단 버튼 |
| `ActionBar` | 선택 행 일괄 작업 바 | 낮음 | `GridPanel buttons` |
| `MaskInput` · `PinInput` | 형식이 고정된 코드 입력 | 낮음 | `Input` + 검증 |

## ④ MES 공통 컴포넌트로 쓰지 않는다

| 묶음 | Mantine | 이유 |
|---|---|---|
| 배치 | `Grid` `SimpleGrid` `Flex` `Group` `Stack` `Center` `Space` `Box` `AspectRatio` `Container` `Paper` `Card` `Divider` | 화면 배치는 `PageLayout`·`ContentBody`·`ContentPanel`·`GridPanel` 이 정한다 |
| 글자 | `Text` `Title` `Anchor` `Blockquote` `Code` `Highlight` `Mark` `List` `Typography` `Spoiler` | 화면 글자 모양은 래퍼·토큰이 정한다 |
| 셸 담당 | `Burger` `NavLink` `Breadcrumbs` `Indicator` `Notification` `Affix` | 포털 셸이 그린다(`PageLayout breadcrumb` 은 문자열) |
| 대체됨 | `Autocomplete` `Combobox` `ComboboxPopover` `Pill` `PillsInput` `Chip` `NumberFormatter` `DataList` `Collapse` `CloseButton` `ThemeIcon` `LoadingOverlay` `CopyButton` | `ComboBox`·`MultiSelectComboBox`·`utils formatNumber`·`DETAIL_*` 표·래퍼가 대신한다. `Combobox` 원시 API 는 shared 래퍼를 만들 때만(`mantine_docs.py official combobox`) |
| 업무에 불필요 | `Avatar` `Image` `BackgroundImage` `Rating` `Slider` `RangeSlider` `AngleSlider` `AlphaSlider` `HueSlider` `ColorInput` `ColorPicker` `ColorSwatch` `JsonInput` `Marquee` `RollingNumber` `TableOfContents` `Menubar` `OverflowList` `Scroller` `FloatingWindow` `FloatingIndicator` `HoverCard` | 산업용 고밀도 화면에 맞지 않거나 쓸 일이 없다 |
| 로그인 전용 | `PasswordInput` | `auth-login-form` 만 쓴다 |
| 내부 원시 | `Portal` `FocusTrap` `Transition` `VisuallyHidden` `Dialog` `Overlay` `InputBase` `ModalBase` `UnstyledButton` | 래퍼 구현용 |
| dates | `Calendar` `MiniCalendar` `DatePicker`(인라인) `DatePickerInput` `DateTimePicker` `MonthPicker` `YearPicker` `TimeGrid` `TimeValue` | 날짜는 `DatePicker`·`DateTimePicker` 래퍼로 통일. 월·연·시각은 ③ |

`Popover`·`Input`·`Loader`·`Progress`·`Modal`·`Tabs`·`Tree`·`Radio`·`Checkbox`·`Textarea`·`TextInput`·`NativeSelect`·`Select`·`MultiSelect`·`ActionIcon`·`Button` 은 ① 의 래퍼 안에서만 쓴다.
