# SearchSettings (조회 기본값 설정 메뉴·창)

조회 영역 오른쪽 위의 설정 아이콘 「조회 기본값」과 그 메뉴·확인 창·설정 창이다. 사용자가 칸마다 기본값 규칙(고정 값·상대 날짜·마지막 조회값)을 정하는 UI 이고, SearchArea 가 스스로 그린다. 화면이 직접 쓰지 않는 내부 부품이다.

- import: 없음. `@dk-oasis/shared/layout` 의 index 로 내보내지 않는다(Part B §18 등록 대상이 아니다). 화면은 [SearchArea](search-area.md) 만 쓰면 이 부품이 따라 그려진다.
- 소스: `src/frontend/shared/src/layout/search-defaults/SearchSettings.tsx`(아이콘·메뉴·확인 창·설정 창), `settings-model.ts`(설정 창 줄 모델·저장 합치기), `search-settings-labels.ts`(메뉴·창의 글을 한곳에 모은 파일)
- 내부 구현: Mantine `Menu`·`ActionIcon`(아이콘과 메뉴), shared [Modal](modal.md)(설정 창, `size="lg"`)·`MessageModal`(확인·오류 창), shared [Select](select.md)·[Input](input.md)·[DatePicker](date-picker.md)·`Button`. 스타일은 부품이 `<style href="cm-search-settings" precedence="default">` 로 직접 넣는다(포털이 원격 모듈의 CSS 파일을 싣지 않는다, Part B §18-3)
- 모습과 조작감은 그리드 설정 아이콘(`GridSettingsMenu`·`GridSettingsOverlay`, [grid-panel](grid-panel.md) §그리드 설정)과 맞췄다.

## 언제 쓰나

- **화면은 직접 쓸 일이 없다.** 조회 영역에 대상 칸(`name` 또는 `defaultKey` 가 있고 `value`·`onChange` 가 묶인 칸)이 하나라도 있으면 SearchArea 가 아이콘을 그린다. 화면이 하는 일은 칸 선언뿐이다(자세한 판정은 [search-area](search-area.md) §사용자 기본값).
- 아이콘을 없애려면 `<SearchArea defaults={false}>` 로 영역 전체를 끄거나, 칸 하나는 `<SearchField defaultable={false}>` 로 뺀다. 이 부품에 줄 prop 은 없다.
- 쓰지 않는다: 조회 기본값이 아닌 그리드 열 설정 → [column-settings-modal](column-settings-modal.md)·「그리드 설정」 메뉴.

## 그려지는 조건

| 조건 | 아이콘 |
|---|---|
| 등록된 대상 칸이 하나 이상, `defaults` 가 `false` 가 아님, `pageId` 와 사용자 ID 가 있음 | 그린다 |
| 등록된 칸이 없음, `defaults={false}`, 포털 밖(`pageId` 없음), 사용자 ID 없음 | 그리지 않는다 |
| 대화 상자(`role="dialog"`) 안의 SearchArea | 그리지 않는다(기본값 기능 전체가 꺼진다. 팝업은 부모 탭과 같은 `pageId` 를 써서 부모 규칙이 섞이는 일과 모달 위 모달의 Esc·Tab 꼬임을 피한다) |

- 자리: 조회 영역(`.search-area`) 오른쪽 위 모서리에 겹친 `IconSettings` 16px `ActionIcon`(subtle·gray·24px, `data-testid="search-settings-menu"`, 툴팁·`aria-label` 「조회 기본값」). 평소에는 흐리고 조회 영역에 마우스가 오거나 초점이 들어오면 진해진다. 마지막 칸과 겹치지 않게 조건 칸 영역 오른쪽에 아이콘 폭만큼 여백을 둔다.
- 조회 `form` 안에 있으므로 아이콘은 `type="button"` 이다. 메뉴와 창은 portal 로 그려지고 안에 `form`·submit 단추가 없어 조회가 일어나지 않는다.
- 조건부 칸이 나타나거나 사라지면 렌더마다 다시 판정한다. 아이콘이 사라지면 열려 있던 설정 창·확인 창도 닫는다.

## 메뉴 항목

항목 이름은 `search-settings-labels.ts` 한곳에 두고 메뉴·확인 창·설정 창이 같은 이름을 쓴다.

| 순서 | 항목 | `data-testid` | 동작 |
|---|---|---|---|
| 1 | 기본값 설정… | `search-settings-open` | 설정 창을 연다 |
| 2 | 지금 조건을 기본값으로 | `search-settings-save-current` | 등록된 칸의 지금 값을 「고정 값」 규칙으로 저장한다. 확인 창을 거친다. 날짜 칸이 있으면 오늘 날짜로 고정된다고 알리고 상대 날짜는 설정 창에서 고르라고 안내한다 |
| 3 | 내 기본값 초기화… (빨강) | `search-settings-reset` | 확인 뒤 이 조회 영역에 지금 보이는 칸의 내 규칙을 지운다. 지금 칸 값은 바꾸지 않는다 |

2·3번 항목은 서버에서 규칙을 받은 뒤에만 눌린다(아래 「저장 범위와 서버 값 대기」).

## 설정 창

제목은 「조회 기본값 설정」(`data-testid="search-defaults-dialog"`)이다. 열 때마다 지금 칸 값과 저장된 규칙으로 처음부터 시작하고, 표 한 줄이 칸 하나다. 기간(`label="~"` 짝)은 한 줄로 묶는다.

| 열 | 내용 |
|---|---|
| 칸 | 라벨. 기간 줄은 「조회 기간 (시작 ~ 끝)」 형태 |
| 방식 | `Select`: 사용 안 함 / 고정 값 / 상대 날짜(날짜 칸만) / 마지막 조회값. 기간 줄은 「묶음」 선택지도 함께 보인다 |
| 값 | 방식에 맞는 입력. 텍스트는 `Input`, select·radio 는 그 칸의 선택지를 쓴 `Select`, 날짜 고정은 `DatePicker`, 상대 날짜는 이름표 `Select` 와 N 입력 |
| 오늘 기준 | 계산 결과 미리보기(예: `2026-09-01 ~ 2026-09-30`). 「마지막 조회값」은 저장된 값이나 「없음」 |

- 상대 날짜 이름표: 당일, 전일, N일 전, N일 후(N 은 0~366), 당월 1일, 당월 말일, 전월 1일, 전월 말일, N개월 전 같은 날(N 은 1~120).
- 기간 묶음 선택지: 당일~당일, 전일~전일, 최근 7일, 최근 30일, 당월(1일~당일), 당월 전체, 전월 전체. 두 칸의 규칙이 한꺼번에 채워지고, 저장은 칸 단위다.
- 일괄 옵션: 창 머리에 「이 화면 모든 칸: [사용 안 함] [마지막 조회값]」 이 있다. 누르면 모든 줄(기간 짝 포함)의 방식을 그것으로 채우는 입력 편의일 뿐이고 저장 모양(칸별 규칙)은 같다. 고정 값과 상대 날짜는 칸마다 직접 고른다.
- 아래쪽 단추: [이 화면 초기화] [취소] [저장]. [이 화면 초기화] 는 창 안의 모든 줄을 「사용 안 함」 으로 돌릴 뿐이고 [저장] 을 눌러야 서버에 반영된다.
- 저장 검사: 기간의 시작이 끝보다 늦으면 그 줄에 오류를 보이고 저장을 막는다. 선택지에 없는 고정 값은 「(선택지에 없음)」 으로 표시한다.
- 이름표로 나타낼 수 없는 규칙(예: JSON 으로 직접 넣은 값)은 「사용자 지정(그대로 둠)」 으로 보이고, 그 줄을 고치지 않으면 그대로 저장한다.
- [저장] 은 서버에 저장하고 브라우저 사본을 갱신한 뒤, 규칙이 바뀐 칸(과 기간 짝)만 지금 칸에 바로 넣는다. 조회는 하지 않는다. 규칙을 그대로 둔 칸의 지금 입력은 덮지 않는다.
- 저장에 실패하면 메시지를 보이고 창을 닫지 않는다. 창을 연 뒤 서버 값이 오면 사용자가 고치지 않은 줄만 서버 규칙으로 다시 만든다(낡은 사본으로 다른 칸 규칙을 덮지 않게).

## 저장 범위와 서버 값 대기

- 저장·초기화는 이 조회 영역의 칸 규칙만 바꾼다. 서버는 화면(`pageId`) 단위로 행 전체를 교체하므로, 같은 화면의 다른 영역(`defaultsScope`)과 지금 등록되지 않은 칸(조건부 칸)의 규칙은 합쳐서 함께 보낸다. 합친 결과가 비면 화면 규칙을 지운다.
- 남기는 행에는 서버에서 받은 칸 메타·이름을 이어 붙인다. 기간의 두 번째 칸 이름은 「{시작 칸 이름} (끝)」 으로 저장한다.
- 저장소가 서버 값을 받기 전이거나 받기에 실패한 상태에서는 저장·초기화를 막는다. 사본만으로 합쳐 저장하면 서버의 다른 규칙을 지우기 때문이다. 메뉴의 2·3번 항목은 비활성이 되고, 설정 창은 「조회 기본값을 아직 서버에서 받지 못했습니다. 잠시 뒤 다시 시도하세요.」 안내와 함께 [저장] 을 막는다(메뉴를 열면 서버 값을 다시 받아 온다).
- 다른 창(분리 창)이 사본을 바꾸면 이 창은 서버에서 다시 받고, 다시 받기 전에는 저장을 막는다.

## 규칙

- 메뉴·창의 글을 코드에 직접 쓰지 않고 `search-settings-labels.ts` 의 `SEARCH_SETTINGS_LABELS` 를 쓴다.
- 이 부품을 화면에서 import 하거나 따라 만들지 않는다. 설정 UI 를 고치려면 shared 에서 고치고, 모습·동작을 바꾸는 일은 사용자 승인 뒤에 한다(공통 컴포넌트 행동강령).
- e2e 는 위 표의 `data-testid`(`search-settings-menu`, `search-settings-open`, `search-defaults-dialog`, `search-defaults-dialog-save`, 줄별 `sd-row-{칸 키}`·`sd-mode-{칸 키}`)로 잡는다. shared `DatePicker` 는 `data-testid` 를 넘기지 않아 날짜 입력은 감싼 요소(`sd-fixed-{칸 키}`)에 testid 가 있다.

## 흔한 실수

| 실수 | 바로잡기 |
|---|---|
| 화면에서 설정 아이콘·창을 직접 만든다 | 만들지 않는다. 대상 칸을 선언하면 SearchArea 가 그린다. |
| 팝업(대화 상자) 안의 조회 영역에서 설정 아이콘이 없다고 버그로 본다 | 의도된 동작이다. 팝업 안의 SearchArea 는 기본값 기능이 전체 꺼진다. |
| 설정 아이콘이 안 보인다 | 대상 칸이 하나도 없거나(`name`·`defaultKey`·`value`·`onChange` 확인), `defaults={false}`, 사용자 ID·`pageId` 가 없는 경우다. [search-area](search-area.md) §대상 칸 판정을 본다. |
| 저장이 막힌다 | 서버에서 규칙을 아직 받지 못한 상태다. 잠시 뒤 다시 시도하면 된다. |

## 실제 사용 예

- `src/frontend/m-mcm/page-components/csa/searchDefaultsSample/page.tsx`: 모든 칸 형식을 모은 확인용 샘플. 설정 아이콘·창을 눈으로 확인할 수 있다.
- 대상 칸이 있는 모든 SearchArea 화면(예: `commUserMng`, `screenUsageStat`, `dataItemMng`)에서 같은 아이콘이 보인다.
