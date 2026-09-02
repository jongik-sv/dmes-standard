# 디자인 수정 핸드오프

이 프로젝트는 “참고용 캡처”가 아니라 디자이너 변경을 운영 저장소에 되돌려 받을 수 있는 작업본입니다.

## 수정 위치

| 목적                                  | 수정 정본                                      | 운영 반영               |
| ------------------------------------- | ---------------------------------------------- | ----------------------- |
| 색상·간격·타이포·폼 크기              | `shared/src/styles/variables.css`              | 모든 `shared` 소비 화면 |
| 페이지 제목·검색·본문·Grid Panel 배치 | `shared/src/layout/page-layout.css`            | 표준 PageLayout 화면    |
| Input·Select·Button·FormGroup         | `shared/src/components/form/`                  | 모든 표준 폼            |
| Grid 스타일·구조                      | `shared/src/components/grid/`                  | 표준 Grid 화면          |
| Tree·Tabs·Lookup·Chart·Matrix         | `shared/src/components/`의 각 컴포넌트 폴더    | 공통 탐색·표시 화면     |
| Modal·Message                         | `shared/src/components/modal.tsx`, `modal.css` | 공통 팝업·중요 액션     |
| 신규 화면 조합 제안                   | `m-design-dummy/src/screens/`                  | 디자인 제안/검토 기준   |
| 포털 상단바·사이드바·탭               | `shared/src/portal-shell/`                     | 실제 운영 포털          |
| 대표 화면별 보조 표현                 | `m-design-dummy/src/styles/app.css`            | 디자인 더미에만 적용    |

`shared` 수정은 실제 운영 컴포넌트에 직접 반영되는 영역입니다. `m-design-dummy` 수정은 화면 조합 제안으로 보존되며, 개발자가 대응되는 운영 화면군에 적용합니다.

더미에서 별도 폰트를 덮어쓰지 않습니다. 포털과 모든 대표 화면은
`shared/src/styles/variables.css`의 `--font-family`를 동일하게 사용합니다.
상단바·사이드바·탭 역시 더미 전용 외형이 아니라 `shared`의 실제
`PortalShell`을 직접 렌더링합니다.

## 작업 원칙

1. `shared` 컴포넌트를 화면 안에서 복제하지 않습니다.
2. 공통 색상과 크기는 가능하면 `variables.css` 토큰으로 올립니다.
3. 기존 상호작용을 제거하지 않고 Hover, Focus, Disabled, Empty, Error 상태를 함께 확인합니다.
4. 업무 상태 구분에 카드 한쪽 컬러 바를 반복 사용하지 않습니다. 점, 배지, 전체 테두리, 배경 톤을 사용합니다.
5. 백엔드 연결을 추가하지 않습니다. 화면 데이터는 `mock-data.ts`에 추가합니다.
6. 스플리터는 `ResizableFormPanel`, 최대화는 `MaxHandle`을 직접 수정하며 더미 전용 구현으로 복제하지 않습니다.
7. 두 간트는 목적이 다릅니다. 스케줄 간트와 작업지시 간트의 정보구조를 서로 섞지 않습니다.

## 반환 전 확인

```bash
npm run check
npm run design:changes
```

`design:changes`는 공유 시점의 파일 해시와 현재 파일을 비교해 수정·추가·삭제 목록을 출력합니다. 수정한 전체 폴더를 다시 압축해 개발팀에 전달합니다.

개발팀은 저장소 루트에서 아래 명령으로 변경 충돌 여부를 먼저 검사합니다.

```bash
pnpm import-design-dummy -- /path/to/returned-folder
```

충돌이 없을 때만 명시적으로 반영합니다.

```bash
pnpm import-design-dummy -- /path/to/returned-folder --apply
```
