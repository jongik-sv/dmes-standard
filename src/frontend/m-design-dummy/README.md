# DMES UI 디자인 검토 프로젝트

디자이너·퍼블리셔에게 현행 DMES 화면 패턴과 `@dk-oasis/shared`를 함께 전달하기 위한 독립 프론트엔드 모듈입니다.

## 실행

저장소 안에서는:

```bash
cd src/frontend
pnpm install
pnpm --filter @dk-oasis/shared build
pnpm design-dummy
```

루트에서 공유 ZIP을 만들려면:

```bash
pnpm export-design-dummy
```

ZIP을 받은 디자이너는 압축 해제 후 아래 명령만 실행합니다.

```bash
npm install
npm run dev
```

`npm install` 과정에서 포함된 `shared`가 자동 빌드됩니다.

## 포함 화면

| 화면                   | 대표 패턴                                  | 하드코딩 동작                             |
| ---------------------- | ------------------------------------------ | ----------------------------------------- |
| 디자인 시작점          | 토큰·화면·컴포넌트 사용범위                | 전체 샘플 위치 확인                       |
| 폼·피드백 컴포넌트     | Form·Lookup·Tree·Tabs·Modal·Progress 전체  | 입력, 검색, 메시지, 오류, 로딩            |
| 데이터 표시 컴포넌트   | AG·MUI·Custom Grid·Badge·Pagination·Matrix | Grid 전환, 다중 선택, 도움말, 페이지 전환 |
| 레이아웃·스플리터      | ContentBody·ResizableFormPanel·MaxHandle   | 드래그 크기 조정, 패널 최대화, 상세 편집  |
| 단일 조회·편집         | 검색 + 단일 Grid CRUD                      | 조회, 행 추가/복사/삭제, 인라인 편집, CSV |
| 마스터–상세            | 상하 연동 Grid + ResizableFormPanel        | 워크센터 선택, 자원 할당/해제, 상세 편집  |
| 운영 대시보드          | KPI + Chart + 예외 Grid                    | 조건 전환, 예외 선택/확인                 |
| KPI·차트 종합 대시보드 | shared의 5종 Chart 전체                    | 공장·교대·기간별 지표 전환                |
| 스케줄 간트            | 스케줄 목록 + 작업장·자원 간트             | 목록 조회, 보기 전환, Zoom, 공정 상세     |
| 작업지시 간트          | 공정·자원 Lane + 작업지시 Bar              | 공정 필터, 그룹 전환, 시간·일·주 Zoom     |
| 검토·승인              | 조회 Grid + 검토 SET Modal                 | 가공검토내역 입력 및 상태 변경            |

모든 데이터는 `src/data/mock-data.ts`에 있으며 백엔드나 외부 서비스를 호출하지 않습니다.

프로젝트의 상단바, 사이드바, 메뉴 트리, 탭 바는 별도로 만든 더미 외형이
아니라 운영 포털이 사용하는 `@dk-oasis/shared/portal-shell`을 직접
사용합니다. 폰트와 기본 디자인 토큰도 `shared` 값을 그대로 따릅니다.

## 현행 소스 대응

대표 화면은 새 업무 화면을 발명한 것이 아니라 아래 현행 구현의 반복 패턴을
오프라인 데이터로 재조합합니다.

| 대표 화면      | 현행 참조 소스                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| 단일 조회·편집 | `m-mpn/pages/master/material-page.tsx`                                                                             |
| 마스터–상세    | `m-mpn/pages/master/workcenter-page.tsx`, `src/master/workcenter/WorkcenterForm.tsx`                               |
| 운영 대시보드  | `m-mpn/src/scheduling/summary/ScheduleDashboard.tsx`, `simulation/kpi-dashboard-page.tsx`                          |
| 스케줄 간트    | `m-mpn/pages/scheduling/gantt-page.tsx`, `src/scheduling/gantt/GanttChart.tsx`, `gantt.css`                        |
| 작업지시 간트  | `m-mpn/pages/workorder/work-order-resource-gantt-page.tsx`, `src/workorder/resource-gantt/WorkOrderGanttChart.tsx` |
| 검토·승인      | `m-mqc/pages/qcd/abnrProcReview-page.tsx`, `m-mqc/src/qcd/abnrProcReview/FabDisposalDialog.tsx`                    |

두 간트는 서로 다른 현행 화면을 기준으로 합니다. 스케줄 간트는 스케줄
사이드바·작업장·자원·공정 블록을, 작업지시 간트는 공정·자원 Lane,
제품유형별 작업지시 Bar, Anchor, 상세정보 구성을 사용합니다.

## shared 사용 범위

재사용 가능한 시각 컴포넌트는 모두 실제로 렌더링됩니다. `DataGrid`는
`AgDataGrid`의 export 별칭이므로 데이터 표시 화면에서 두 이름의 관계를
명시하고 같은 구현을 사용합니다.

인증·로그인, HTTP/OASIS 클라이언트, 보안 저장소, React hook과 데이터
유틸리티는 시각 컴포넌트가 아니거나 서버 연결을 전제로 하므로 오프라인
디자인 샘플 범위에서 제외합니다.

## 디자이너 수정분 반영

수정 권장 순서와 저장소 반영 범위는 [DESIGN-HANDOFF.md](./DESIGN-HANDOFF.md)를 참고합니다.
