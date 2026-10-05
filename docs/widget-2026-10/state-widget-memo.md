# 메모장 위젯 이름 바꾸기 — 상태 메모 (2026-10-05)

- 브랜치: `fix/widget-memo-rename` (fix 브랜치 워크트리)
- 범위: 코드 변경은 `src/frontend/m-mcm/widget-types/memo/` 만 허용, shared·타 폴더 변경 금지

## 1. 10월 3일 기존 구현 인벤토리 (읽은 결과)

- 서버 TITLE: `save` 가 title 을 받음. 앞뒤 공백 절삭 후 빈 값은 null(정의 이름 복귀), 40자(코드 포인트)·제어 문자 거절. `title` 키 없음 = 기존 유지, 지우려면 `""` 전송 (`memo-model.ts:439-446`).
- shared 틀 제목 훅: `useWidgetTitle` — 저장된 제목만 틀 `h3`·`aria-label` 에 덮어씀 (`renderer.tsx:152`). 편집 중 입력은 미리보이지 않음.
- 편집 화면 제목칸: 편집 모드 맨 위 `[제목 입력칸 | 형식 선택]` (`renderer.tsx:386-398`). 입력은 `clampTitle` 로 40 코드 포인트 정리, 저장은 `saveMemo` 로 내용과 함께 (`renderer.tsx:293-325`). 임시본에도 `title` 선택 필드로 보관 (키 v1 유지).

## 2. 판정: 보드 틀 제목 인라인 바꾸기는 없음 — 코드 변경 없음

목표(보드 위 틀 제목을 편집 모드 없이 바로 바꾸기: 제목 줄 더블클릭 또는 연필 → 입력칸, Enter 저장, Esc 취소, 40자, 기존 저장 API)는 현재 코드에 없다.

- 틀(`src/frontend/shared/src/widget/WidgetFrame.tsx:258-259`)은 `<h3 className="cm-widget__title">{shownTitle}</h3>` 고정 출력. 더블클릭 처리·연필 버튼·입력칸 스왑이 없다.
- `frame-context.ts` 의 틀 API는 표시용 `setTitle(title|null)` 뿐. 이름 바꾸기 콜백·저장 연결이 없다.
- 메모 본체 보기 모드(`renderer.tsx:343-368`)에는 제목 줄 자체가 없다(`[편집]` 막대 + 본문 보기만). 몸통에서 틀의 `h3` 를 입력칸으로 바꿀 수 없다(틀 DOM은 shared 소유. `WidgetHeaderActions`·`WidgetTitleExtra` 포털은 `h3` 옆/오른쪽 슬롯일 뿐 `h3` 교체가 안 된다. document 단계 더블클릭 가로채기는 틀 클래스명 의존 해킹이라 부적합).
- 결론: 남은 차이를 memo 폴더만으로 만들 수 없어 지시대로 코드를 고치지 않는다. `git status` 코드 변경 0건.

## 3. 바꾼 파일

- 없음 (코드 미변경).
- 새로 만든 결과 문서: `docs/widget-2026-10/state-widget-memo.md` (본 파일).

## 4. shared 에 필요한 변경 (고치지 않고 내용만 기록)

틀 제목 줄 인라인 개명을 하려면 아래 shared 변경이 필요하다. 본 작업 범위 밖이므로 미수행.

1. `src/frontend/shared/src/widget/frame-context.ts`: 위젯 본체가 개명 의사를 틀에 알리는 선택 콜백 추가 (예: `onRenameTitle?: (title: string) => Promise<void>` 또는 `renameTitle` 훅). 표시용 `setTitle` 과 달리 저장까지 연결되는 통로.
2. `src/frontend/shared/src/widget/WidgetFrame.tsx`: 제목 줄 `h3` 에 더블클릭 + 연필 버튼(`data-action="rename"`) → 입력칸 스왑. 동작은 탭 이름 바꾸기(`WidgetTabs.tsx` `RenameInput`, Enter 확정·Esc 취소·포커스·`aria-label`) 패턴 재사용. 보기 모드에서만 노출, 편집 모드 잠금·빼기 버튼과 충돌 금지.
3. 저장 연결: 메모 본체가 콜백을 받아 기존 `saveMemo({ instId, defId, format: 현재값, content: 현재값, title: 새값 })` 재사용. 40자 제한은 `memo-model.ts` 의 `clampTitle`·`validateTitle` 재사용. 저장 성공 시 `useWidgetTitle` 이 틀 제목을 갱신(기존 경로 그대로).
4. 시험: `src/frontend/shared/tests/unit/widget-frame.unit.test.ts` 에 개명 흐름(더블클릭→입력칸→Enter 저장→Esc 취소→40자 초과 차단) 추가. 메모 측은 기존 `memo-render.test.ts` 틀 제목 대역으로 저장 연결만 확인.

## 5. 시험 결과

- `pnpm vitest run widget-types/memo` (in `src/frontend/m-mcm`): **2 파일·217 시험 전부 통과** (`memo.test.ts` 86, `memo-render.test.ts` 131).
  - 첫 실행 시 `memo-render.test.ts` 가 `@dk-oasis/shared/form` 미해결로 실패 → 원인은 shared `dist` 미빌드(워크트리 fresh install)이며 코드 문제가 아님. `pnpm --filter @dk-oasis/shared build` 후 재실행해 전부 통과.
- `pnpm tsc --noEmit` (in `src/frontend/m-mcm`): **memo 폴더(`widget-types/memo`) 오류 0건**. 전체 22건은 모두 기존 문제로 memo와 무관 (생성 레지스트리 `lib/generated/page-registry.ts` 의 타 패키지 페이지 import, `page-components/anl/logViewer` 의 `@dk-oasis/m-analog` import 등). 코드 미변경이므로 전부 사전 존재 오류.

## 6. 커밋 해시

- `775263cf79f6cbeceeaf25930963be1ed03ce7c1` (해시 기입을 위한 amend 확정본이 HEAD이므로 최종 해시는 `git log -1 --format=%H` 로 확인. `fix(widget-memo)` 로 시작하는 본 작업 단일 커밋, 본 파일 포함)

## 7. 남은 문제

- 틀 제목 인라인 개명 미구현 — §4 shared 변경이 선행되어야 함 (본 작업 범위 밖).
- `tsc --noEmit` 기존 오류 22건 (memo 외, 생성 레지스트리·타 패키지 import).
- 머지·push 미수행 (지시대로 생략).
