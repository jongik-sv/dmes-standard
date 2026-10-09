# useDetailDraft

상세 폼 입력 중에 화면 루트가 다시 그려지지 않게, 입력 초안을 상세 폼 컴포넌트 안에 두고 blur·저장·행 전환 때만 루트에 알릴 때 쓴다.

- import: `import { useDetailDraft, type DetailDraftHandle } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/useDetailDraft.ts`
- 근거: [Screen-Performance-Guide R12](../../../../../docs/guide/FrontEnd/Screen-Performance-Guide.md)

## 언제 쓰나

- 쓴다: 목록에서 고른 행을 상세 폼에서 고치고, 저장 단추가 폼 밖(화면 머리 버튼 줄)에 있는 화면.
- 쓰지 않는다: 입력 칸이 몇 개 없고 루트에 state 를 두어도 그리드·하위 부품이 안 다시 그려지는 작은 폼.

## 표준 사용

```tsx
const OrgForm = memo(function OrgForm({ ref, row, onCommit }: Props) {
  const { draft, setField, containerProps, handle } = useDetailDraft(row, { onCommit, rowKey: (r) => r.id });
  useImperativeHandle(ref, () => handle, [handle]);
  return (
    <div {...containerProps}>
      <Input value={draft?.name ?? ""} onChange={(v) => setField("name", v)} />
    </div>
  );
});
// 루트: const formRef = useRef<DetailDraftHandle<Org>>(null);
//   <OrgForm ref={formRef} row={selected} onCommit={(d) => setRows((p) => p.map((r) => (r.id === d.id ? d : r)))} />
//   저장: formRef.current?.commit(); const draft = formRef.current?.getDraft();  → api.save(draft); formRef.current?.reset(saved);
```

## 반환값

| 이름 | 설명 |
|---|---|
| `draft` | 지금 초안. 행이 없으면 `null`. |
| `dirty` | 렌더용 고친 표시. |
| `setField(key, value)` | 한 칸을 바꾼다. 이 폼 컴포넌트만 다시 그린다. |
| `setDraft(next)` | 초안을 통째로 바꾼다. |
| `containerProps` | 폼 바깥 래퍼에 펼친다. 포커스가 폼 밖으로 나가면 `onCommit`. 폼 안에서 칸을 옮길 때는 부르지 않는다. |
| `handle` | `getDraft()`·`isDirty()`·`commit()`·`reset(next)`. 참조가 안정적이라 `useImperativeHandle` 에 그대로 넘긴다. |

## 옵션

- `onCommit(draft, baseRow)`: 반영 시점에 불린다. 고친 칸이 없으면 부르지 않는다.
- `rowKey(row)`: 행 식별(필수). ID 같은 값을 준다 — 참조를 주면 다시 읽을 때마다 행 전환으로 오인한다.

## 동작 규칙

- 행 전환(`rowKey` 변경): 이전 행의 미반영 초안을 먼저 `onCommit` 한 뒤 새 행으로 바꾼다.
- 같은 행의 `row` 가 밖에서 새로 오면: 고친 칸이 없을 때만 새 값으로 바꾼다. 고치는 중이면 입력을 지킨다.
- 폼 컴포넌트는 `memo` 로 감싼다(루트가 다른 이유로 다시 그려져도 건너뛴다).
- `commit()` 은 저장 직전에 부른다(blur 가 일어나지 않은 채 단추를 누르는 경우 대비).
