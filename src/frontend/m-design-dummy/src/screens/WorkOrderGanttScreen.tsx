import { useMemo, useState } from "react";
import { PageLayout, SearchArea, SearchField } from "@dk-oasis/shared/layout";
import { Button, MultiSelectComboBox } from "@dk-oasis/shared/form";
import { GridBadge } from "@dk-oasis/shared/grid";
import { useMessage } from "@dk-oasis/shared/message-provider";

type ZoomLevel = "hour" | "day" | "week";
type ProductType = "FINISHED" | "SEMI" | "METAL";
type WorkStatus =
  | "ORDERED"
  | "ISSUED"
  | "RELEASED"
  | "IN_PROGRESS"
  | "COMPLETED";

type WorkOrder = {
  id: string;
  pdNo: string;
  item: string;
  itemName: string;
  operation: string;
  operationName: string;
  resource: string;
  resourceName: string;
  productType: ProductType;
  status: WorkStatus;
  start: number;
  duration: number;
  quantity: number;
  due: string;
  anchor?: boolean;
};

const WORK_ORDERS: WorkOrder[] = [
  {
    id: "wo-01",
    pdNo: "PD-260730-001",
    item: "FG-AL-1250",
    itemName: "알루미늄 코일 1,250mm",
    operation: "SLT",
    operationName: "Slitting",
    resource: "SLT-101",
    resourceName: "1호 슬리터",
    productType: "FINISHED",
    status: "IN_PROGRESS",
    start: 4,
    duration: 16,
    quantity: 120,
    due: "07-31 14:00",
    anchor: true,
  },
  {
    id: "wo-02",
    pdNo: "PD-260730-002",
    item: "SF-AL-980",
    itemName: "알루미늄 반제품 980mm",
    operation: "SLT",
    operationName: "Slitting",
    resource: "SLT-102",
    resourceName: "2호 슬리터",
    productType: "SEMI",
    status: "RELEASED",
    start: 17,
    duration: 20,
    quantity: 96,
    due: "08-01 10:00",
  },
  {
    id: "wo-03",
    pdNo: "PD-260730-003",
    item: "SF-CU-600",
    itemName: "동박 반제품 600mm",
    operation: "ANN",
    operationName: "Annealing",
    resource: "ANN-201",
    resourceName: "소둔로 1호기",
    productType: "SEMI",
    status: "ISSUED",
    start: 10,
    duration: 31,
    quantity: 75,
    due: "08-02 08:00",
    anchor: true,
  },
  {
    id: "wo-04",
    pdNo: "PD-260730-004",
    item: "RM-AL-INGOT",
    itemName: "알루미늄 잉곳",
    operation: "ANN",
    operationName: "Annealing",
    resource: "ANN-202",
    resourceName: "소둔로 2호기",
    productType: "METAL",
    status: "ORDERED",
    start: 42,
    duration: 22,
    quantity: 210,
    due: "08-03 17:00",
  },
  {
    id: "wo-05",
    pdNo: "PD-260730-005",
    item: "FG-AL-980",
    itemName: "알루미늄 코일 980mm",
    operation: "INS",
    operationName: "Inspection",
    resource: "INS-301",
    resourceName: "자동 검사기",
    productType: "FINISHED",
    status: "COMPLETED",
    start: 2,
    duration: 13,
    quantity: 88,
    due: "07-30 18:00",
  },
  {
    id: "wo-06",
    pdNo: "PD-260730-006",
    item: "FG-CU-600",
    itemName: "동박 제품 600mm",
    operation: "INS",
    operationName: "Inspection",
    resource: "INS-302",
    resourceName: "수동 검사대",
    productType: "FINISHED",
    status: "IN_PROGRESS",
    start: 25,
    duration: 17,
    quantity: 64,
    due: "08-01 15:00",
  },
  {
    id: "wo-07",
    pdNo: "PD-260730-007",
    item: "FG-AL-1250",
    itemName: "알루미늄 코일 1,250mm",
    operation: "PKG",
    operationName: "Packing",
    resource: "PKG-401",
    resourceName: "포장 1호기",
    productType: "FINISHED",
    status: "RELEASED",
    start: 48,
    duration: 15,
    quantity: 108,
    due: "08-03 12:00",
  },
];

const OPERATION_OPTIONS = [
  { code: "SLT", name: "Slitting" },
  { code: "ANN", name: "Annealing" },
  { code: "INS", name: "Inspection" },
  { code: "PKG", name: "Packing" },
];

const PRODUCT_LABEL: Record<ProductType, string> = {
  FINISHED: "제품",
  SEMI: "반제품",
  METAL: "원소재",
};

const STATUS_LABEL: Record<WorkStatus, string> = {
  ORDERED: "지시",
  ISSUED: "발행",
  RELEASED: "릴리즈",
  IN_PROGRESS: "진행",
  COMPLETED: "완료",
};

const ZOOM_LABELS: Record<ZoomLevel, string[]> = {
  hour: ["06", "12", "18", "00", "06", "12", "18", "00"],
  day: ["07/30", "07/31", "08/01", "08/02", "08/03", "08/04", "08/05"],
  week: ["7월 5주", "8월 1주", "8월 2주", "8월 3주", "8월 4주"],
};

export function WorkOrderGanttScreen() {
  const { showMessage } = useMessage();
  const [plant, setPlant] = useState("GMP");
  const [operations, setOperations] = useState(["SLT", "ANN", "INS", "PKG"]);
  const [zoom, setZoom] = useState<ZoomLevel>("day");
  const [query, setQuery] = useState("");
  const [groupByOperation, setGroupByOperation] = useState(true);
  const [selectedId, setSelectedId] = useState(WORK_ORDERS[0].id);

  const visibleOrders = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return WORK_ORDERS.filter(
      (order) =>
        operations.includes(order.operation) &&
        (!keyword ||
          `${order.pdNo} ${order.item} ${order.itemName} ${order.resource}`
            .toLowerCase()
            .includes(keyword)),
    );
  }, [operations, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, WorkOrder[]>();
    for (const order of visibleOrders) {
      const key = groupByOperation
        ? `${order.operation}|${order.operationName}`
        : `${order.resource}|${order.resourceName}`;
      groups.set(key, [...(groups.get(key) ?? []), order]);
    }
    return [...groups.entries()];
  }, [groupByOperation, visibleOrders]);

  const selected =
    WORK_ORDERS.find((order) => order.id === selectedId) ?? WORK_ORDERS[0];

  return (
    <PageLayout
      title="작업지시 현황(간트차트)"
      className="work-order-gantt-page"
      breadcrumb="생산실행 > 작업지시 > 작업지시 현황(간트차트)"
      screenId="MPP-WO-GANTT"
      buttons={[
        {
          id: "search",
          label: "조회",
          type: "primary",
          action: "search",
          onClick: () =>
            showMessage({
              message: `${visibleOrders.length}개 작업지시를 조회했습니다.`,
              toast: true,
            }),
        },
      ]}
    >
      <SearchArea>
        <SearchField
          label="공장"
          type="select"
          value={plant}
          onChange={setPlant}
          options={[
            { value: "GMP", label: "김포공장" },
            { value: "PH", label: "포항공장" },
          ]}
        />
        <SearchField label="작업지시">
          <input
            name="workOrderQuery"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="PD번호, 품목, 자원"
          />
        </SearchField>
        <SearchField label="공정">
          <MultiSelectComboBox
            data={OPERATION_OPTIONS}
            valueField="code"
            labelField="name"
            value={operations}
            onChange={setOperations}
            style={{ minWidth: 250 }}
          />
        </SearchField>
      </SearchArea>

      <div className="work-order-gantt">
        <div className="work-order-gantt__toolbar">
          <div className="work-order-gantt__toggle">
            <button
              type="button"
              className={groupByOperation ? "is-active" : ""}
              onClick={() => setGroupByOperation(true)}
            >
              공정별
            </button>
            <button
              type="button"
              className={!groupByOperation ? "is-active" : ""}
              onClick={() => setGroupByOperation(false)}
            >
              자원별
            </button>
          </div>
          <div className="work-order-gantt__legend">
            {(Object.keys(PRODUCT_LABEL) as ProductType[]).map((type) => (
              <span key={type}>
                <i className={`wo-color wo-color--${type.toLowerCase()}`} />
                {PRODUCT_LABEL[type]}
              </span>
            ))}
            <span>
              <b>★</b> Anchor
            </span>
          </div>
          <div className="work-order-gantt__zoom">
            {(Object.keys(ZOOM_LABELS) as ZoomLevel[]).map((level) => (
              <button
                type="button"
                className={zoom === level ? "is-active" : ""}
                key={level}
                onClick={() => setZoom(level)}
              >
                {level === "hour" ? "시간" : level === "day" ? "일" : "주"}
              </button>
            ))}
          </div>
        </div>

        <div className="work-order-gantt__main">
          <section className="work-order-chart">
            <div className="work-order-chart__header">
              <div>공정 / 자원</div>
              <div className="work-order-chart__axis">
                {ZOOM_LABELS[zoom].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </div>
            <div className="work-order-chart__rows">
              {grouped.map(([groupKey, orders]) => {
                const [code, name] = groupKey.split("|");
                return (
                  <div className="work-order-group" key={groupKey}>
                    <div className="work-order-group__title">
                      <strong>{code}</strong>
                      <span>
                        {name} · {orders.length}건
                      </span>
                    </div>
                    {orders.map((order) => (
                      <button
                        type="button"
                        className={`work-order-row${
                          selectedId === order.id ? " is-selected" : ""
                        }`}
                        key={order.id}
                        onClick={() => setSelectedId(order.id)}
                      >
                        <span className="work-order-row__label">
                          <strong>
                            {groupByOperation
                              ? order.resource
                              : order.operation}
                          </strong>
                          <small>
                            {groupByOperation
                              ? order.resourceName
                              : order.operationName}
                          </small>
                        </span>
                        <span className="work-order-row__timeline">
                          <span
                            className={`work-order-bar work-order-bar--${order.productType.toLowerCase()}`}
                            style={{
                              left: `${order.start}%`,
                              width: `${order.duration}%`,
                            }}
                          >
                            {order.anchor ? (
                              <b className="work-order-bar__anchor">★</b>
                            ) : null}
                            <strong>{order.pdNo}</strong>
                            <small>{order.item}</small>
                          </span>
                          <i className="work-order-now-line" />
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="work-order-detail cm-data-grid">
            <header>
              <span>선택 작업지시</span>
              <GridBadge
                label={STATUS_LABEL[selected.status]}
                strong
                bg={
                  selected.status === "COMPLETED"
                    ? "#e6f3ed"
                    : selected.status === "IN_PROGRESS"
                      ? "#e8f1fb"
                      : "#f1f2f4"
                }
              />
            </header>
            <strong>{selected.pdNo}</strong>
            <p>{selected.itemName}</p>
            <dl>
              <div>
                <dt>품목코드</dt>
                <dd>{selected.item}</dd>
              </div>
              <div>
                <dt>제품유형</dt>
                <dd>{PRODUCT_LABEL[selected.productType]}</dd>
              </div>
              <div>
                <dt>공정</dt>
                <dd>{selected.operationName}</dd>
              </div>
              <div>
                <dt>자원</dt>
                <dd>{selected.resourceName}</dd>
              </div>
              <div>
                <dt>지시수량</dt>
                <dd>{selected.quantity.toLocaleString()} t</dd>
              </div>
              <div>
                <dt>요청납기</dt>
                <dd>{selected.due}</dd>
              </div>
            </dl>
            <div className="work-order-detail__actions">
              <Button
                size="sm"
                onClick={() =>
                  showMessage({
                    message: `${selected.pdNo} 상세 화면을 여는 샘플 동작입니다.`,
                    toast: true,
                  })
                }
              >
                상세보기
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  showMessage({
                    message: `${selected.pdNo}를 Anchor로 설정했습니다.`,
                    toast: true,
                  })
                }
              >
                Anchor 설정
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </PageLayout>
  );
}
