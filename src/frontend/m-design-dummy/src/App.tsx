import { useCallback } from "react";
import { PortalShell } from "@dk-oasis/shared/portal-shell";
import type {
  PortalShellMenuItem,
  PortalShellMenuResponse,
  PortalShellPageComponent,
} from "@dk-oasis/shared/portal-shell-core";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { OverviewScreen } from "./screens/OverviewScreen";
import { MasterDataScreen } from "./screens/MasterDataScreen";
import { MasterDetailScreen } from "./screens/MasterDetailScreen";
import { OperationsDashboardScreen } from "./screens/OperationsDashboardScreen";
import { ScheduleGanttScreen } from "./screens/ScheduleGanttScreen";
import { QualityWorkflowScreen } from "./screens/QualityWorkflowScreen";
import { FormFeedbackCatalogScreen } from "./screens/FormFeedbackCatalogScreen";
import { DataDisplayCatalogScreen } from "./screens/DataDisplayCatalogScreen";
import { ResizableLayoutCatalogScreen } from "./screens/ResizableLayoutCatalogScreen";
import { ChartDashboardScreen } from "./screens/ChartDashboardScreen";
import { WorkOrderGanttScreen } from "./screens/WorkOrderGanttScreen";
import { JobSchedulerScreen } from "./screens/JobSchedulerScreen";

const MODULE_ID = "design-dummy";
const HOME_PAGE_ID = `${MODULE_ID}:guide/overview`;
const MASTER_DATA_PAGE_ID = `${MODULE_ID}:sample/master-data`;

function directory(
  id: string,
  displayText: string,
  items: PortalShellMenuItem[],
): PortalShellMenuItem {
  return {
    id,
    name: id,
    displayText,
    type: "dir",
    items,
    parentId: null,
    expended: true,
    path: "/",
    moduleId: null,
    pageName: null,
    componentPath: null,
  };
}

function page(
  id: string,
  displayText: string,
  componentPath: string,
  parentId: string,
): PortalShellMenuItem {
  const segments = componentPath.split("/");
  return {
    id,
    name: id,
    displayText,
    type: "page",
    items: [],
    parentId,
    expended: null,
    path: `/${segments.slice(0, -1).join("/")}`,
    moduleId: MODULE_ID,
    pageName: segments.at(-1) ?? id,
    componentPath,
  };
}

const PORTAL_MENU: PortalShellMenuResponse = {
  items: [
    directory("design-guide", "디자인 검토", [
      page("overview", "UI 디자인 기준", "guide/overview", "design-guide"),
      page(
        "form-feedback",
        "폼·피드백 컴포넌트",
        "catalog/form-feedback",
        "design-guide",
      ),
      page(
        "data-display",
        "데이터 표시 컴포넌트",
        "catalog/data-display",
        "design-guide",
      ),
      page(
        "resizable-layout",
        "레이아웃·스플리터",
        "catalog/resizable-layout",
        "design-guide",
      ),
    ]),
    directory("dashboards", "대시보드", [
      page(
        "operations",
        "스케줄 현황(대시보드)",
        "sample/operations",
        "dashboards",
      ),
      page(
        "chart-dashboard",
        "KPI·차트 종합 대시보드",
        "sample/chart-dashboard",
        "dashboards",
      ),
    ]),
    directory("gantt-screens", "간트차트", [
      page("gantt", "스케줄 현황(간트차트)", "sample/gantt", "gantt-screens"),
      page(
        "work-order-gantt",
        "작업지시 현황(간트차트)",
        "sample/work-order-gantt",
        "gantt-screens",
      ),
    ]),
    directory("sample-screens", "업무 화면", [
      page(
        "master-data",
        "품목 기준정보 관리",
        "sample/master-data",
        "sample-screens",
      ),
      page(
        "master-detail",
        "작업장·자원 관리",
        "sample/master-detail",
        "sample-screens",
      ),
      page("quality", "부적합가공검토", "sample/quality", "sample-screens"),
    ]),
    directory("system-screens", "시스템관리(시안)", [
      page(
        "job-scheduler",
        "예약 작업 관리",
        "system/job-scheduler",
        "system-screens",
      ),
    ]),
  ],
};

function openPortalPage(pageId: string) {
  window.dispatchEvent(
    new CustomEvent("portal-open-tab", {
      detail: { pageId },
    }),
  );
}

const OverviewPage: PortalShellPageComponent = () => (
  <OverviewScreen
    onOpenRepresentative={() => openPortalPage(MASTER_DATA_PAGE_ID)}
  />
);
const MasterDataPage: PortalShellPageComponent = () => <MasterDataScreen />;
const MasterDetailPage: PortalShellPageComponent = () => <MasterDetailScreen />;
const OperationsPage: PortalShellPageComponent = () => (
  <OperationsDashboardScreen />
);
const GanttPage: PortalShellPageComponent = () => <ScheduleGanttScreen />;
const QualityPage: PortalShellPageComponent = () => <QualityWorkflowScreen />;
const FormFeedbackPage: PortalShellPageComponent = () => (
  <FormFeedbackCatalogScreen />
);
const DataDisplayPage: PortalShellPageComponent = () => (
  <DataDisplayCatalogScreen />
);
const ResizableLayoutPage: PortalShellPageComponent = () => (
  <ResizableLayoutCatalogScreen />
);
const ChartDashboardPage: PortalShellPageComponent = () => (
  <ChartDashboardScreen />
);
const WorkOrderGanttPage: PortalShellPageComponent = () => (
  <WorkOrderGanttScreen />
);

const JobSchedulerPage: PortalShellPageComponent = () => <JobSchedulerScreen />;

const PAGE_COMPONENTS = new Map<string, PortalShellPageComponent>([
  [HOME_PAGE_ID, OverviewPage],
  [`${MODULE_ID}:catalog/form-feedback`, FormFeedbackPage],
  [`${MODULE_ID}:catalog/data-display`, DataDisplayPage],
  [`${MODULE_ID}:catalog/resizable-layout`, ResizableLayoutPage],
  [MASTER_DATA_PAGE_ID, MasterDataPage],
  [`${MODULE_ID}:sample/master-detail`, MasterDetailPage],
  [`${MODULE_ID}:sample/operations`, OperationsPage],
  [`${MODULE_ID}:sample/chart-dashboard`, ChartDashboardPage],
  [`${MODULE_ID}:sample/gantt`, GanttPage],
  [`${MODULE_ID}:sample/work-order-gantt`, WorkOrderGanttPage],
  [`${MODULE_ID}:sample/quality`, QualityPage],
  [`${MODULE_ID}:system/job-scheduler`, JobSchedulerPage],
]);

export function App() {
  const { showMessage } = useMessage();

  const resolvePage = useCallback(
    async (pageId: string) => PAGE_COMPONENTS.get(pageId) ?? null,
    [],
  );

  const handleLocalLogout = useCallback(() => {
    showMessage({
      message: "공유용 프로젝트에서는 로그인과 로그아웃을 사용하지 않습니다.",
      alertType: "info",
      toast: true,
    });
  }, [showMessage]);

  return (
    <PortalShell
      appName="{CLIENT} APS SYSTEM"
      menu={PORTAL_MENU}
      resolvePage={resolvePage}
      defaultHomePageId={HOME_PAGE_ID}
      storageKey="dmes.design-dummy.portal"
      userName="디자인 검토"
      userLoginId="designer"
      onBeforeLogout={handleLocalLogout}
    />
  );
}
