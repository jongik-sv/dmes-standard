# ClosableTabs

여러 문서(세트·코드 묶음 등)를 한 화면에 열어 두고 오가며 편집할 때 쓴다. 탭 머리(제목·저장 안 한 변경 점·닫기 단추)와 모든 탭의 패널을 함께 그리고, 고르지 않은 패널도 마운트한 채 숨긴다.

- import: `import { ClosableTabs, type ClosableTabItem, type ClosableTabsProps } from "@dk-oasis/shared/closable-tabs";` (CSS import 없음)
- 소스: `src/frontend/shared/src/components/closable-tabs/ClosableTabs.tsx`
- 내부 구현: Mantine `Tabs` 를 쓰지 않는 네이티브 요소다. `div role="tablist"` 안에 탭마다 감싸개 `div(data-active)`, 그 안에 `button role="tab"` 과 형제 닫기 `button` 이 있다. 패널은 `div role="tabpanel"`. 스타일은 컴포넌트가 `<style href="cm-closable-tabs" precedence="default">` 로 직접 넣는다(클래스 접두어 `cm-closable-tabs`).
- Part B 허용 목록(§1): `closable-tabs` SHOULD (§18 등록, 2026-10-06).

## 언제 쓰나

- 쓴다: 사용자가 문서를 여러 개 열어 두고 오가는 편집 화면(예: 룰 세트 여러 개를 탭으로 열기). 숨은 탭의 편집 상태·`useEffect` 리스너(`beforeunload`·`keydown`)·캔버스 상태가 탭을 바꿔도 남아 있어야 할 때 쓴다.
- `tabs`(`Tabs`)와 나누는 기준:
  - 한 영역 안의 정해진 보기 전환("기본정보 / 변경이력")이면 `tabs` 를 쓴다. 탭이 고정이고 닫지 않으며, 본문은 화면이 활성 키로 골라 그린다. 숨은 본문은 언마운트된다.
  - 탭이 열리고 닫히거나, 숨은 탭의 상태와 효과를 유지해야 하면 `closable-tabs` 를 쓴다.
- 쓰지 않는다: 포털 최상위 화면 탭(포털 프레임이 맡는다), 단계 표시(스텝), 탭이 수십 개 넘게 열리는 목록(모든 패널이 마운트되므로 무겁다. 목록 + 상세로 바꾼다).
- Mantine `Tabs` 의 `keepMounted` 로 대신하지 않는다. 기본값인 `'activity'` 모드는 숨은 패널을 React Activity 로 감싸 효과를 내리므로, 숨은 탭의 리스너가 사라진다.

## 표준 사용

```tsx
import { useState } from "react";
import { ClosableTabs, type ClosableTabItem } from "@dk-oasis/shared/closable-tabs";
import { useMessage } from "@dk-oasis/shared/message-provider";

interface OpenDoc {
  id: string;
  name: string;
  dirty: boolean;
}

export function DocTabs({ docs, onCloseDoc }: { docs: OpenDoc[]; onCloseDoc: (id: string) => void }) {
  const { showMessage } = useMessage();
  const [active, setActive] = useState(docs[0]?.id ?? "");
  const items: ClosableTabItem[] = docs.map((d) => ({ key: d.id, label: d.name, dirty: d.dirty }));

  const doClose = (id: string) => {
    if (id === active) {
      const rest = docs.filter((d) => d.id !== id);
      setActive(rest[0]?.id ?? "");
    }
    onCloseDoc(id);
  };

  const close = (id: string) => {
    const doc = docs.find((d) => d.id === id);
    if (!doc?.dirty) return doClose(id);
    showMessage({
      title: "확인",
      message: `${doc.name} 의 저장하지 않은 변경을 버리고 닫으시겠습니까?`,
      alertType: "confirm",
      onConfirm: () => doClose(id),
    });
  };

  return (
    <ClosableTabs
      items={items}
      activeKey={active}
      onSelect={setActive}
      onClose={close}
      ariaLabel="열린 문서"
      testIdPrefix="doc-tab"
      renderPanel={(it) => <div>{/* it.key 문서 편집기 */}</div>}
    />
  );
}
```

- 열린 탭 목록과 활성 키는 화면이 소유한다. 이 부품은 목록을 바꾸지 않는다.
- 닫기 확인(저장 안 한 변경 등)은 `onClose` 안에서 화면이 한다. 지금 탭을 닫으면 다음에 고를 탭도 화면이 정한다.
- 뿌리는 `flex: 1 1 0; min-height: 0` 인 세로 flex 다. 높이가 정해진 부모(`ContentBody`·`ContentPanel` 등) 안에 두면 패널이 남은 높이를 채운다. 패널도 세로 flex 이므로 패널 안에 `ContentBody` 를 넣어도 높이가 맞는다.

## 변형

### 상태 메시지

`message` 는 탭 머리 줄 오른쪽 끝에 `role="status"` 로 보인다(예: "저장했습니다"). 이 영역은 비어 있어도 늘 그려 두므로, 문구가 바뀌면 화면 읽기 프로그램이 읽어 준다.

### 닫기 단추 숨기기

- `onClose` 를 주지 않으면 닫기 단추를 그리지 않는다.
- `closable: false` 를 준 탭은 그 탭의 닫기 단추만 숨긴다(예: 고정된 첫 탭).
- `keepLast`(기본 `true`)가 켜져 있으면 탭이 하나뿐일 때 닫기 단추를 그리지 않는다. 마지막 탭도 닫게 하려면 `keepLast={false}` 를 준다.

### 키보드

- 탭 단추에서 ←/→ 를 누르면 이웃 탭을 고르고 초점도 옮긴다. 끝에서 누르면 반대쪽 끝으로 간다. 지금 탭만 `tabIndex=0` 이다(roving tabindex).
- 닫기 단추도 같은 규칙이다 — 지금 탭의 닫기 단추만 `tabIndex=0`, 나머지는 -1. Tab 으로 지금 탭 단추 다음에 그 닫기 단추로 가 Enter·Space 로 닫는다(키보드만으로 닫을 수 있다). Delete 키 닫기는 없다.

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| items | `ClosableTabItem[]` | 필수 | 열린 탭 목록 |
| activeKey | `string` | 필수 | 지금 탭 key. 목록에 없으면 어떤 패널도 보이지 않고, 첫 탭이 Tab 초점을 받는다 |
| onSelect | `(key: string) => void` | 필수 | 탭을 누르거나 ←/→ 로 옮길 때 호출한다. 이미 고른 탭을 누르면 부르지 않는다 |
| onClose | `(key: string) => void` | - | 닫기 단추를 누르면 호출한다. 없으면 닫기 단추를 그리지 않는다 |
| renderPanel | `(item: ClosableTabItem) => ReactNode` | 필수 | 탭마다 패널 내용을 그린다. 모든 탭에 대해 늘 호출한다 |
| message | `ReactNode` | - | 머리 줄 끝 상태 메시지(`role="status"`) |
| keepLast | `boolean` | `true` | 탭이 하나뿐이면 닫기 단추를 숨긴다 |
| ariaLabel | `string` | - | tablist 의 `aria-label` |
| testIdPrefix | `string` | `"closable-tab"` | testid 접두어 `p`: 머리 줄 `${p}s`, 탭 단추 `${p}-${key}`, 점 `${p}-dirty-${key}`, 닫기 `${p}-close-${key}`, 패널 `${p}-panel-${key}`, 메시지 `${p}s-message` |
| closeLabel | `(item: ClosableTabItem) => string` | `` `${label} 탭 닫기` `` | 닫기 단추의 `aria-label`·`title`. `label` 이 문자열이 아니면 key 를 쓴다 |
| dirtyLabel | `string` | `"저장하지 않은 변경"` | 변경 점(●)의 `aria-label` |
| className | `string` | - | 뿌리에 덧붙일 클래스(`cm-closable-tabs` 는 늘 붙는다) |
| style | `CSSProperties` | - | 뿌리 스타일 |

`ClosableTabItem`: `key: string`(필수), `label: ReactNode`(필수), `title?: string`(탭 머리 툴팁), `dirty?: boolean`(● 표시), `closable?: boolean`(`false` 면 이 탭만 닫기 단추 숨김, 기본 `true`).

## 표준값: 모든 화면 동일

- 지금 탭은 흰 배경·테두리·굵은 글자로 구분한다. 한 변 색 바(밑줄·왼쪽 바)는 쓰지 않는다.
- 색·간격은 공통 토큰만 쓴다. 화면 CSS 로 탭 머리 모습을 덮지 않는다.
- 탭 key 는 화면 안에서 고유한 식별자로 둔다(문서 ID 등). testid 와 DOM id 가 key 로 만들어진다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| `onClose` 에서 확인 없이 바로 목록에서 뺀다 | 저장하지 않은 변경이 있으면 화면이 먼저 확인한다. 이 부품은 확인하지 않는다 |
| 지금 탭을 닫은 뒤 `activeKey` 를 그대로 둔다 | 남은 탭 중 하나로 바꾼다. 그대로 두면 아무 패널도 보이지 않는다 |
| `renderPanel` 안에서 `it.key === activeKey` 일 때만 내용을 그린다 | 그러면 마운트 유지 효과가 사라진다. 늘 그린다. 숨기는 일은 부품이 한다 |
| 패널 안 부품이 숨은 상태에서 크기를 재다가 0 을 얻는다 | 숨은 패널은 `display:none` 이다. 다시 보일 때 크기를 다시 재거나 `ResizeObserver` 로 따라간다 |
| 영역 안 고정 보기 전환에 쓴다 | 닫지 않고 상태 유지가 필요 없으면 `tabs` 를 쓴다 |
| Mantine `Tabs keepMounted` 로 직접 만든다 | 화면은 Mantine 을 import 하지 않는다. 기본 `'activity'` 모드는 숨은 패널 효과를 내린다 |

## 실제 사용 예

- 아직 없음. 룰 세트 편집 화면(`m-mdm/pages/dme/ruleSetEdit`)의 여러 세트 열기 탭에 쓸 예정이다(2026-10-06 등록).
