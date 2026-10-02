# Badge

그리드 밖(카드·패널 머리·목록 항목)에서 분류·상태·형식을 작은 알약 모양 배지로 보일 때 쓴다. 그리드 셀 안은 GridBadge 다.

- import: `import { Badge, type BadgeProps, type BadgeTone, type BadgeVariant } from "@dk-oasis/shared/form";` (CSS import 없음 — 컴포넌트가 자기 `<style>` 을 넣는다)
- 소스: `src/frontend/shared/src/components/form/Badge.tsx`
- 내부 구현: 일반 `span`. 색은 의미 토큰 쌍(배경 `--color-*-soft` + 글자 `--color-*`)으로만 칠한다. Mantine `Badge` 를 쓰지 않는다
- `form` 서브패스(Part B §1 MUST)에 들어 있다. 따로 서브패스를 두지 않은 이유: shared `.d.ts` 빌드가 entry 수에 민감해 기본 힙(4GB)을 넘었다(2026-10-02).

## 언제 쓰나

- 쓴다: 카드 머리의 "구현 예정"·"위험 2" 표지, 목록 항목의 분류(일반·점검·긴급), 형식 표지(TXT·MD·HTML), KPI 의 "주의".
- 쓰지 않는다: 그리드 셀 안 → [GridBadge](grid-badge.md)(스타일이 `.cm-data-grid` 안에서만 적용되므로 둘을 바꿔 쓰지 않는다). 행 전체 강조 → `AgDataGrid getRowClassExtra`.
- 클릭 동작이 필요하면 배지가 아니라 [Button](button.md) 이다.

## 표준 사용

```tsx
import { Badge } from "@dk-oasis/shared/form";

export function NoticeTags({ category, format }: { category: "NORMAL" | "MAINT" | "URGENT"; format: string }) {
  const tone = category === "URGENT" ? "danger" : category === "MAINT" ? "warning" : "neutral";
  return (
    <>
      <Badge tone={tone} label={category === "URGENT" ? "긴급" : category === "MAINT" ? "점검" : "일반"} />
      <Badge variant="outline" mono label={format} />
    </>
  );
}
```

## 변형

### 의미 색(tone)

| 의미 | tone |
|---|---|
| 기본·대기·일반 | `neutral`(기본) |
| 진행·정보 | `primary` |
| 완료·정상 | `success` |
| 주의·점검·샘플 표시 | `warning` |
| 위험·긴급·오류 | `danger` |

### 외곽선·고정폭

`variant="outline"` 은 흰 바탕 + 1px 테두리의 작은 각진 표지(형식·코드 표지용), `mono` 는 고정폭 글꼴이다.

## Props

| Prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| label | `ReactNode` | 필수 | 배지 내용 |
| tone | `BadgeTone` (`"neutral" \| "primary" \| "success" \| "warning" \| "danger"`) | `"neutral"` | 의미 색 |
| variant | `BadgeVariant` (`"soft" \| "outline"`) | `"soft"` | 옅은 배경 · 외곽선 |
| mono | `boolean` | `false` | 고정폭 글꼴 |
| title | `string` | - | 마우스오버 설명 |
| className | `string` | - | 뿌리에 더할 클래스(`cm-badge cm-badge--{tone}` 은 늘 붙는다) |
| testId | `string` | - | 뿌리 `data-testid` |

## 표준값: 모든 화면 동일

- 색은 `tone` 으로만 정한다. 16진수·`style` 로 색을 덮지 않는다.
- 한 변 컬러 바 대신 배지로 상태를 보인다(Local-Rules §8).

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 그리드 셀 `render` 에 `Badge` 를 넣는다 | `GridBadge` 를 쓴다 |
| 카드 머리에 `GridBadge` 를 넣는다 | 스타일이 빠진 글자로 보인다. `Badge` 를 쓴다 |
| 화면 CSS 로 배지 색을 바꾼다 | `tone` 을 고른다. 맞는 의미가 없으면 shared 에 tone 을 더한다(사용자 승인) |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/home/NoticeCard.tsx`: 공지 분류(`tone`)·형식(`variant="outline" mono`).
- `src/frontend/m-mcm/page-components/home/page.tsx`: 인사말 줄 "샘플 데이터" 표지, 설비 알람 심각도·건수.
