# DMES UI 디자인 검토 프로젝트

디자이너·퍼블리셔에게 현행 DMES 화면 패턴과 `@dk-oasis/shared`를 함께 전달하기 위한 독립 프론트엔드 모듈입니다.

## UI 기반

이 프로젝트는 **Mantine 9**(컴포넌트 기반)와 **ag-grid-community 33**(그리드)을 사용합니다. 샌드박스 루트는 `DmesUiProvider`로 감싸야 합니다.

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
| 데이터 표시 컴포넌트   | AG Grid·Custom Grid·Badge·Pagination·Matrix | Grid 전환, 다중 선택, 도움말, 페이지 전환 |
| 레이아웃·스플리터      | ContentBody·ResizableFormPanel·MaxHandle   | 드래그 크기 조정, 패널 최대화, 상세 편집  |
| 단일 조회·편집         | 검색 + 단일 Grid CRUD                      | 조회, 행 추가/복사/삭제, 인라인 편집, CSV |
| 마스터–상세            | 상하 연동 Grid + ResizableFormPanel        | 워크센터 선택, 자원 할당/해제, 상세 편집  |
| 운영 대시보드          | KPI + Chart + 예외 Grid                    | 조건 전환, 예외 선택/확인                 |
| KPI·차트 종합 대시보드 | shared의 5종 Chart 전체                    | 공장·교대·기간별 지표 전환                |
| 스케줄 간트            | 스케줄 목록 + 작업장·자원 간트             | 목록 조회, 보기 전환, Zoom, 공정 상세     |
| 작업지시 간트          | 공정·자원 Lane + 작업지시 Bar              | 공정 필터, 그룹 전환, 시간·일·주 Zoom     |
| 검토·승인              | 조회 Grid + 검토 SET Modal                 | 가공검토내역 입력 및 상태 변경            |

### 부재료관리(M30) 이관 시안

현행 MES M30 화면의 레이아웃(조회조건·그리드 배치·컬럼)을 옮긴 시안입니다. 데이터는 운영 화면 조회 결과에서 뽑은 표본이며 `src/data/m30-mock-data.ts`에 있습니다. 운전자명·전화번호·차량번호·RFID·사번·처리자명은 가상 값으로 바꿨습니다.

| 화면 (현행 ID)                     | 레이아웃                                  | 표본                                   |
| ---------------------------------- | ----------------------------------------- | -------------------------------------- |
| 배차정보 조회 (M301001010)         | 배차 공통(위) + 배차 상세(아래, 2단 헤더) | 배차 82건, 상세는 공급업체별 10건 배차 |
| 수입검사대상조회 (M301004020)      | 라디오 조회조건 + 판정 목록 1개           | 2,218건 중 60건                        |
| 소모실적조회 (M302001010)          | 목록 + 아래 합계 줄, 사유 2칸 편집        | 874건 중 60건                          |
| 재고현황(그룹별)조회 (M303001010)  | 그룹별 재고(위) + ID별 재고(아래)         | PCM도료 2,308건 중 41그룹              |

### 역할 관리 개선 시안 (메뉴 「역할 관리 시안」)

현행 역할 관리(`m-mcm/page-components/csa/commRoleMng`)를 알기 쉽게 바꾸는 시안 3종입니다(C 역할 소개 카드는 2026-11-26 검토에서 뺐습니다). 권한은 「사람 → 역할 그룹 → 역할 → 화면별 권한 수준」 으로 흐릅니다. 시안은 권한 묶음(PERMISSION)을 「없음·조회·편집·편집·확정·전체」 수준으로, OBJECT 를 「화면」 으로 바꿔 보입니다. 데이터는 `src/data/role-mgmt-mock.ts`(가상 이름)에 있고, 화면은 `src/screens/role-mgmt/`, 스타일은 `src/styles/role-mgmt.css` 입니다.

| 시안 | 생각 | 그리드·영역 사이 상호작용 |
| --- | --- | --- |
| A. 표로 관리(일반형) | 역할 목록 + 탭(쓸 수 있는 화면·받은 사람·기본 정보). 화면마다 권한 수준 칸 하나만 고른다 | 역할 → 모든 탭, 메뉴 → 화면 목록, 화면 → 같은 화면을 쓰는 역할(누르면 역할 전환), 역할 그룹 → 사람, 사람 → 실제 받는 권한, 저장 확인 창 행 → 그 역할·화면으로 이동 |
| B. 권한 흐름도 | 사람·그룹·역할·화면 네 줄을 선으로 잇는다. 선 굵기·색이 권한 수준 | 무엇이든 누르면 이어진 길만 밝아지고 설명판이 문장으로 풀어 준다. 역할 설명판의 칩을 누르면 선이 바로 바뀐다 |
| D. 그 사람 눈으로 보기 | 결과부터 보인다: 그 사람의 메뉴와 화면 버튼 | 역할을 켜고 끄면 메뉴에 「새로 보임」·「사라짐」 이 붙고 버튼이 잠기거나 풀린다. 버튼 툴팁이 그 버튼을 주는 역할을 알려 준다 |

M30·역할 관리 데이터 외의 모든 데이터는 `src/data/mock-data.ts`에 있습니다. 어느 화면도 백엔드나 외부 서비스를 호출하지 않습니다.

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
