import { useMemo, useRef, useState } from "react";
import { PageLayout } from "@dk-oasis/shared/layout";
import { Button } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";
import {
  GANTT_OPERATIONS,
  GANTT_RESOURCES,
  GANTT_SCHEDULES,
  type GanttOperation,
} from "../data/mock-data";
import { StatusBadge } from "../components/StatusBadge";

type ViewMode = "workCenter" | "resource" | "order";
type ZoomLevel = "hours" | "days" | "weeks";

type ChartRow =
  | {
      type: "group";
      key: string;
      label: string;
      meta: string;
      operations: [];
    }
  | {
      type: "data";
      key: string;
      label: string;
      meta: string;
      operations: GanttOperation[];
    };

const HOURS = Array.from({ length: 12 }, (_, index) => index);
const STATUS_LABEL: Record<GanttOperation["status"], string> = {
  SCHEDULED: "계획",
  FROZEN: "동결",
  STARTED: "시작",
  COMPLETED: "완료",
};
const ORDER_COLORS = [
  "#4a90d9",
  "#d47a28",
  "#28876f",
  "#8b61b1",
  "#c95650",
  "#2f8f9d",
];

function orderColor(orderId: string) {
  const hash = [...orderId].reduce(
    (value, character) => value + character.charCodeAt(0),
    0,
  );
  return ORDER_COLORS[hash % ORDER_COLORS.length];
}

function scheduleTone(status: string) {
  if (status === "확정") return "success" as const;
  if (status === "부분확정") return "warning" as const;
  return "neutral" as const;
}

function operationTone(status: GanttOperation["status"]) {
  if (status === "COMPLETED") return "neutral" as const;
  if (status === "STARTED") return "success" as const;
  if (status === "FROZEN") return "warning" as const;
  return "info" as const;
}

function formatHour(offsetHour: number) {
  const totalMinutes = Math.round((offsetHour + 6) * 60);
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function ScheduleGanttScreen() {
  const { showMessage } = useMessage();
  const timelineRef = useRef<HTMLDivElement>(null);
  const [operations, setOperations] = useState(GANTT_OPERATIONS);
  const [scheduleQuery, setScheduleQuery] = useState("");
  const [selectedScheduleId, setSelectedScheduleId] = useState(
    GANTT_SCHEDULES[0].id,
  );
  const [selectedOperationId, setSelectedOperationId] = useState<string | null>(
    null,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("workCenter");
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("hours");
  const [zoom, setZoom] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [resourceQuery, setResourceQuery] = useState("");
  const [colorByOrder, setColorByOrder] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

  const selectedSchedule =
    GANTT_SCHEDULES.find((schedule) => schedule.id === selectedScheduleId) ??
    GANTT_SCHEDULES[0];
  const selectedOperation =
    operations.find((operation) => operation.id === selectedOperationId) ?? null;
  const visibleSchedules = GANTT_SCHEDULES.filter((schedule) =>
    `${schedule.id} ${schedule.title} ${schedule.plant}`
      .toLowerCase()
      .includes(scheduleQuery.toLowerCase()),
  );
  const scheduleOperations = operations.filter(
    (operation) =>
      operation.scheduleId === selectedScheduleId &&
      (!statusFilter || operation.status === statusFilter),
  );

  const rows = useMemo<ChartRow[]>(() => {
    const query = resourceQuery.trim().toLowerCase();
    if (viewMode === "order") {
      const orderMap = new Map<string, GanttOperation[]>();
      for (const operation of scheduleOperations) {
        const current = orderMap.get(operation.plannedOrderId) ?? [];
        current.push(operation);
        orderMap.set(operation.plannedOrderId, current);
      }
      return [...orderMap.entries()]
        .filter(([orderId, orderOperations]) =>
          `${orderId} ${orderOperations[0]?.itemCode ?? ""}`
            .toLowerCase()
            .includes(query),
        )
        .map(([orderId, orderOperations]) => ({
          type: "data",
          key: orderId,
          label: orderId,
          meta: orderOperations[0]?.itemCode ?? "",
          operations: orderOperations,
        }));
    }

    const resources = GANTT_RESOURCES.filter((resource) =>
      `${resource.code} ${resource.name} ${resource.workCenter}`
        .toLowerCase()
        .includes(query),
    );
    if (viewMode === "resource") {
      return resources.map((resource) => ({
        type: "data",
        key: resource.code,
        label: resource.name,
        meta: resource.code,
        operations: scheduleOperations.filter(
          (operation) => operation.resourceCode === resource.code,
        ),
      }));
    }

    const workCenters = new Map<string, typeof resources>();
    for (const resource of resources) {
      const current = workCenters.get(resource.workCenter) ?? [];
      current.push(resource);
      workCenters.set(resource.workCenter, current);
    }
    const result: ChartRow[] = [];
    for (const [workCenter, childResources] of workCenters.entries()) {
      result.push({
        type: "group",
        key: `group-${workCenter}`,
        label: workCenter,
        meta: `${childResources.length}개 자원`,
        operations: [],
      });
      if (!collapsedGroups.includes(workCenter)) {
        result.push(
          ...childResources.map((resource) => ({
            type: "data" as const,
            key: resource.code,
            label: resource.name,
            meta: resource.code,
            operations: scheduleOperations.filter(
              (operation) => operation.resourceCode === resource.code,
            ),
          })),
        );
      }
    }
    return result;
  }, [
    collapsedGroups,
    resourceQuery,
    scheduleOperations,
    viewMode,
  ]);

  const timelineWidth = Math.round(
    (zoomLevel === "hours" ? 880 : zoomLevel === "days" ? 720 : 600) * zoom,
  );

  const selectSchedule = (scheduleId: string) => {
    setSelectedScheduleId(scheduleId);
    setSelectedOperationId(null);
  };

  const toggleGroup = (label: string) => {
    setCollapsedGroups((current) =>
      current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label],
    );
  };

  const toggleFreeze = () => {
    if (!selectedOperation) return;
    const nextStatus =
      selectedOperation.status === "FROZEN" ? "SCHEDULED" : "FROZEN";
    setOperations((current) =>
      current.map((operation) =>
        operation.id === selectedOperation.id
          ? { ...operation, status: nextStatus }
          : operation,
      ),
    );
    showMessage({
      message: `${selectedOperation.plannedOrderId} 공정을 ${
        nextStatus === "FROZEN" ? "동결" : "동결 해제"
      }했습니다.`,
      toast: true,
    });
  };

  return (
    <PageLayout
      title="스케줄 현황(간트차트)"
      className="scheduling-gantt"
      breadcrumb="공정계획 > 스케줄링 > 스케줄 현황(간트차트)"
      screenId="MPC-GANTT-VIEW"
      buttons={[
        {
          id: "btn_search",
          label: "조회",
          type: "primary",
          action: "search",
          onClick: () =>
            showMessage({
              message: `${selectedSchedule.id}의 ${scheduleOperations.length}개 공정을 조회했습니다.`,
              toast: true,
            }),
        },
      ]}
    >
      <div className="canonical-gantt-page">
        <aside
          className={`canonical-gantt-sidebar${
            sidebarCollapsed ? " is-collapsed" : ""
          }`}
        >
          {sidebarCollapsed ? (
            <>
              <button
                type="button"
                className="canonical-gantt-sidebar__toggle"
                aria-label="스케줄 목록 펼치기"
                onClick={() => setSidebarCollapsed(false)}
              >
                ▶
              </button>
              <span className="canonical-gantt-sidebar__vertical">
                스케줄 목록
              </span>
            </>
          ) : (
            <>
              <header className="canonical-gantt-sidebar__header">
                <strong>스케줄 목록</strong>
                <button
                  type="button"
                  className="canonical-gantt-sidebar__toggle"
                  aria-label="스케줄 목록 접기"
                  onClick={() => setSidebarCollapsed(true)}
                >
                  ◀
                </button>
              </header>
              <div className="canonical-gantt-sidebar__filter">
                <label htmlFor="schedule-search">스케줄 검색</label>
                <input
                  id="schedule-search"
                  name="scheduleSearch"
                  type="search"
                  autoComplete="off"
                  placeholder="스케줄 ID 또는 제목…"
                  value={scheduleQuery}
                  onChange={(event) => setScheduleQuery(event.target.value)}
                />
              </div>
              <div className="canonical-gantt-sidebar__list">
                {visibleSchedules.map((schedule) => (
                  <button
                    type="button"
                    className={`canonical-gantt-schedule${
                      schedule.id === selectedScheduleId ? " is-selected" : ""
                    }`}
                    key={schedule.id}
                    onClick={() => selectSchedule(schedule.id)}
                  >
                    <span className="canonical-gantt-schedule__top">
                      <StatusBadge
                        value={schedule.status}
                        tone={scheduleTone(schedule.status)}
                      />
                      <strong>{schedule.id}</strong>
                    </span>
                    <span className="canonical-gantt-schedule__title">
                      {schedule.title}
                    </span>
                    <span className="canonical-gantt-schedule__meta">
                      <span>
                        {schedule.plant} · 공정 {schedule.operationCount}
                      </span>
                      <span className={schedule.lateCount ? "is-late" : ""}>
                        지연 {schedule.lateCount}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <footer className="canonical-gantt-sidebar__footer">
                {visibleSchedules.length}건
              </footer>
            </>
          )}
        </aside>

        <section className="canonical-gantt-container">
          <div className="canonical-gantt-toolbar">
            <div className="canonical-gantt-filter">
              <div
                className="canonical-gantt-view-toggle"
                role="group"
                aria-label="간트 보기 기준"
              >
                {(
                  [
                    ["workCenter", "작업장별"],
                    ["resource", "설비별"],
                    ["order", "오더별"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    className={viewMode === value ? "is-active" : ""}
                    key={value}
                    onClick={() => setViewMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <input
                name="resourceSearch"
                type="search"
                autoComplete="off"
                aria-label="자원 또는 오더 검색"
                placeholder="자원 또는 오더 검색…"
                value={resourceQuery}
                onChange={(event) => setResourceQuery(event.target.value)}
              />
              <select
                name="operationStatus"
                aria-label="공정 상태"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">전체 상태</option>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="canonical-gantt-controls">
              <label className="canonical-gantt-color-toggle">
                <input
                  type="checkbox"
                  checked={colorByOrder}
                  onChange={(event) => setColorByOrder(event.target.checked)}
                />
                오더별 색상
              </label>
              <span className="canonical-gantt-toolbar__separator" />
              {(
                [
                  ["hours", "시간"],
                  ["days", "일"],
                  ["weeks", "주"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  className={`canonical-gantt-zoom-level${
                    zoomLevel === value ? " is-active" : ""
                  }`}
                  key={value}
                  onClick={() => setZoomLevel(value)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="canonical-gantt-icon-button"
                aria-label="축소"
                onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}
              >
                −
              </button>
              <span className="canonical-gantt-zoom-value">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                className="canonical-gantt-icon-button"
                aria-label="확대"
                onClick={() => setZoom((value) => Math.min(1.75, value + 0.25))}
              >
                +
              </button>
              <button
                type="button"
                className="canonical-gantt-now-button"
                onClick={() =>
                  timelineRef.current?.scrollTo({
                    left: Math.round(timelineWidth * 0.24),
                    behavior: "smooth",
                  })
                }
              >
                현재
              </button>
            </div>
          </div>

          <div className="canonical-gantt-legend">
            <span>
              <i className="status-SCHEDULED" /> 계획
            </span>
            <span>
              <i className="status-FROZEN" /> 동결
            </span>
            <span>
              <i className="status-STARTED" /> 시작
            </span>
            <span>
              <i className="status-COMPLETED" /> 완료
            </span>
            <span>
              <i className="is-manual">★</i> 수동 조정
            </span>
            <span>
              <i className="is-late" /> 납기 지연
            </span>
            <strong>{selectedSchedule.horizon}</strong>
          </div>

          <div className="canonical-gantt-main">
            <div className="canonical-gantt-resource-panel">
              <div className="canonical-gantt-resource-header">
                {viewMode === "order" ? "계획오더" : "작업장 / 자원"}
              </div>
              <div className="canonical-gantt-resource-rows">
                {rows.map((row) =>
                  row.type === "group" ? (
                    <button
                      type="button"
                      className="canonical-gantt-resource-row is-group"
                      key={row.key}
                      onClick={() => toggleGroup(row.label)}
                    >
                      <span aria-hidden="true">
                        {collapsedGroups.includes(row.label) ? "▶" : "▼"}
                      </span>
                      <strong>{row.label}</strong>
                      <small>{row.meta}</small>
                    </button>
                  ) : (
                    <div
                      className="canonical-gantt-resource-row"
                      key={row.key}
                      title={`${row.label} (${row.meta})`}
                    >
                      <span className="canonical-gantt-resource-dot" />
                      <strong>{row.label}</strong>
                      <small>{row.meta}</small>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="canonical-gantt-timeline" ref={timelineRef}>
              <div
                className="canonical-gantt-timeline__canvas"
                style={{ width: timelineWidth }}
              >
                <div className="canonical-gantt-time-header">
                  <div className="canonical-gantt-time-parent-row">
                    <span>2026년 7월 30일 목요일</span>
                  </div>
                  <div className="canonical-gantt-time-child-row">
                    {HOURS.map((hour) => (
                      <span key={hour}>
                        {String(hour + 6).padStart(2, "0")}:00
                      </span>
                    ))}
                  </div>
                </div>
                <div className="canonical-gantt-timeline-rows">
                  <i
                    className="canonical-gantt-now-line"
                    style={{ left: `${(3.75 / 12) * 100}%` }}
                  >
                    <span>NOW</span>
                  </i>
                  {rows.map((row) => (
                    <div
                      className={`canonical-gantt-row${
                        row.type === "group" ? " is-group" : ""
                      }`}
                      key={row.key}
                    >
                      {HOURS.map((hour) => (
                        <i
                          className="canonical-gantt-gridline"
                          key={hour}
                          style={{ left: `${(hour / 12) * 100}%` }}
                        />
                      ))}
                      {row.operations.map((operation) => {
                        const duration =
                          operation.endHour - operation.startHour;
                        return (
                          <button
                            type="button"
                            className={[
                              "canonical-gantt-operation",
                              `status-${operation.status}`,
                              operation.isLate ? "is-late" : "",
                              operation.isManual ? "is-manual" : "",
                              selectedOperationId === operation.id
                                ? "is-selected"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={operation.id}
                            style={{
                              left: `${(operation.startHour / 12) * 100}%`,
                              width: `${(duration / 12) * 100}%`,
                              background: colorByOrder
                                ? orderColor(operation.plannedOrderId)
                                : undefined,
                            }}
                            title={`${operation.plannedOrderId} · ${operation.operationName} · ${operation.resourceCode}`}
                            onClick={() =>
                              setSelectedOperationId(operation.id)
                            }
                            onDoubleClick={() =>
                              showMessage({
                                message: `${operation.plannedOrderId} 수동 조정 화면 진입을 확인했습니다.`,
                                toast: true,
                              })
                            }
                          >
                            {operation.setupHours ? (
                              <span
                                className="canonical-gantt-operation__setup"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (operation.setupHours / duration) * 100,
                                  )}%`,
                                }}
                              />
                            ) : null}
                            <span className="canonical-gantt-operation__label">
                              <strong>{operation.operationName}</strong>
                              <small>
                                {operation.plannedOrderId.replace(
                                  "PO-260730-",
                                  "#",
                                )}
                              </small>
                            </span>
                            {operation.isManual ? (
                              <i
                                className="canonical-gantt-operation__manual"
                                aria-hidden="true"
                              >
                                ★
                              </i>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {selectedOperation ? (
              <aside className="canonical-gantt-detail">
                <header>
                  <div>
                    <strong>{selectedOperation.operationName}</strong>
                    <span>
                      {selectedOperation.plannedOrderId} · #
                      {selectedOperation.operationSeq}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="공정 상세 닫기"
                    onClick={() => setSelectedOperationId(null)}
                  >
                    ×
                  </button>
                </header>
                <div className="canonical-gantt-detail__status">
                  <StatusBadge
                    value={STATUS_LABEL[selectedOperation.status]}
                    tone={operationTone(selectedOperation.status)}
                  />
                  {selectedOperation.isLate ? (
                    <StatusBadge value="납기 지연" tone="danger" />
                  ) : null}
                </div>
                <dl>
                  <div>
                    <dt>품목</dt>
                    <dd>{selectedOperation.itemCode}</dd>
                  </div>
                  <div>
                    <dt>품목명</dt>
                    <dd>{selectedOperation.itemName}</dd>
                  </div>
                  <div>
                    <dt>자원</dt>
                    <dd>{selectedOperation.resourceCode}</dd>
                  </div>
                  <div>
                    <dt>계획 시간</dt>
                    <dd>
                      {formatHour(selectedOperation.startHour)} –{" "}
                      {formatHour(selectedOperation.endHour)}
                    </dd>
                  </div>
                  <div>
                    <dt>계획 수량</dt>
                    <dd>{selectedOperation.quantity.toLocaleString("ko-KR")}</dd>
                  </div>
                  <div>
                    <dt>조정 방식</dt>
                    <dd>
                      {selectedOperation.isManual ? "수동 조정" : "자동 계획"}
                    </dd>
                  </div>
                </dl>
                <footer>
                  <Button onClick={toggleFreeze}>
                    {selectedOperation.status === "FROZEN"
                      ? "동결 해제"
                      : "공정 동결"}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() =>
                      showMessage({
                        message: `${selectedOperation.plannedOrderId} 조정 Dialog 동작을 확인했습니다.`,
                        toast: true,
                      })
                    }
                  >
                    수동 조정
                  </Button>
                </footer>
              </aside>
            ) : null}
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
