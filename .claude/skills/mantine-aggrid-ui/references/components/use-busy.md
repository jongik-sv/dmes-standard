# useBusy

목록 조회·저장·삭제처럼 서로 다른 비동기 작업의 진행 상태를 키별로 나눠, 하나가 끝나는 것이 다른 부품을 다시 그리지 않게 할 때 쓴다.

- import: `import { useBusy } from "@dk-oasis/shared/form";`
- 소스: `src/frontend/shared/src/components/form/useBusy.ts`
- 근거: [Screen-Performance-Guide R5](../../../../../docs/guide/FrontEnd/Screen-Performance-Guide.md)

## 언제 쓰나

- 쓴다: 화면 루트에 `busy`/`isSaving` 하나를 두려던 모든 화면. 목록 `loading` 은 `run("list", …)`, 저장 단추는 `run("save", …)` 로 나눈다.
- 쓰지 않는다: 그리드 자체의 `loading` 표시(그리드 prop 에 `isBusy("list")` 를 넘기는 것은 맞다).

## 표준 사용

```tsx
const { isBusy, run } = useBusy();
const search = () => run("list", async () => setRows(await api.list(cond)));
const save = () => run("save", () => api.save(formRef.current!.getDraft()!));
<AgDataGrid loading={isBusy("list")} … />
<Button loading={isBusy("save")} onClick={save}>저장</Button>
```

## 규칙

- `run(key, fn)`: `fn` 이 끝날 때까지 `key` 를 busy 로 두고 결과·오류를 그대로 돌려준다(실패해도 풀린다).
- 같은 키를 겹쳐 부르면 횟수를 세어 마지막 작업이 끝날 때 풀린다.
- `isBusy(key?)`: 키를 생략하면 어느 작업이든 진행 중인지.
- 상태가 바뀌면 이 훅을 쓰는 컴포넌트가 다시 그려진다. busy 를 읽는 단추 줄·목록 머리는 작은 `memo` 컴포넌트로 나눠 거기서 `useBusy` 를 부른다.
- 언마운트 뒤에 작업이 끝나도 state 를 건드리지 않는다.
