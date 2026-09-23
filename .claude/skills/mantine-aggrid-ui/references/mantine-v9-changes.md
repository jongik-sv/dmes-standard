# Mantine 9 변경점 요약 (8.x → 9.x, 7.x 이전 잔재 포함)

원문: `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py get guides-8x-to-9x` (https://mantine.dev/llms/guides-8x-to-9x.md).
`audit` 서브커맨드가 아래 표의 "자동 점검" 항목을 잡는다.

## 전제

- React **19.2 이상** 필요. `@mantine/*` 패키지는 모두 같은 버전으로 맞춘다.
- `@mantine/charts` 는 recharts 3.x, `@mantine/tiptap` 는 `@tiptap/*` 3.x 가 필요하다.

## 8 → 9 깨지는 변경

| 8.x (동작 안 함) | 9.x | 자동 점검 |
|---|---|---|
| `<Text color="red">` · `<Anchor color>` | `c="red"` (style prop) | O |
| `<Collapse in={open}>` | `<Collapse expanded={open}>` | O |
| `<Spoiler initialState>` | `defaultExpanded` | O |
| `<Grid gutter="xl">` | `gap` (새로 `rowGap` · `columnGap`) | O |
| `<Grid overflow="hidden">` | 삭제 (음수 margin 대신 CSS `gap`) | O |
| `TypographyStylesProvider` | `Typography` | O |
| Popover/Tooltip `positionDependencies` | 삭제 (자동 재계산) | O |
| `zodResolver` 등 `mantine-form-*-resolver` | `schemaResolver(schema, { sync: true })` (Standard Schema: Zod v4 · Valibot · ArkType) | O |
| `const pinned = useHeadroom()` | `const { pinned, scrollProgress } = useHeadroom()` | O |
| `UseScrollSpyReturnType` · `StateHistory` · `OS` | `UseScrollSpyReturnValue` · `UseStateHistoryValue` · `UseOSReturnValue` | 일부 |
| `useLocalStorage({ key })` → `T` | `T \| undefined` (없애려면 `defaultValue` 지정) | X |
| `use-fullscreen` · `use-mouse` · `use-mutation-observer` 시그니처 | 원문 해당 절 확인 | X |

## 8 → 9 동작(시각) 변경 — 코드는 그대로 돌지만 모습이 바뀐다

| 항목 | 9.x 기본 | 8.x 동작 유지 방법 |
|---|---|---|
| `theme.defaultRadius` | `md`(8px) | `createTheme({ defaultRadius: 'sm' })` |
| `light` variant 색 | 투명도 대신 불투명 색 | `MantineProvider cssVariablesResolver={v8CssVariablesResolver}` |
| Notifications hover | 하나에 hover 하면 **전체** 타이머 정지 | `<Notifications pauseResetOnHover="notification" />` |
| Notifications 컨테이너 | 위치별 6개를 모두 렌더 | 위치 한정 스타일은 `[data-position="…"]` 선택자로만 준다 |

## 7.x 이전 API — 모델 학습 데이터에 자주 섞여 나온다

| 옛 API | 현재 | 자동 점검 |
|---|---|---|
| `createStyles`, `sx`, emotion | CSS modules · style props · Styles API(`classNames`/`styles`) | O |
| `<Group spacing>` · `<Stack spacing>` | `gap` (SimpleGrid 는 여전히 `spacing`/`verticalSpacing`) | O |
| `<Group position="apart">` | `justify="space-between"` | O |
| `<Group noWrap>` | `wrap="nowrap"` | O |
| `leftIcon` · `rightIcon` · input `icon` | `leftSection` · `rightSection` | O |
| `<MediaQuery>` | `hiddenFrom` / `visibleFrom` 또는 CSS | O |
| `DatePickerInput` 값이 `Date` | 8.x 부터 `'YYYY-MM-DD'` 문자열(`DateStringValue`) | X |
