import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  allExpandable,
  bindParams,
  cleanSql,
  defaultExpanded,
  firstSelection,
  flattenRows,
  heatLevel,
  normalizeRunTime,
  propsOf,
  sqlTitle,
  toTreeRequests,
  type TreeNode,
} from "../../src/anl/log-viewer/tree-model";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

function collect(node: TreeNode, kind: string, out: TreeNode[] = []): TreeNode[] {
  if (node.kind === kind) out.push(node);
  node.children.forEach((c) => collect(c, kind, out));
  return out;
}

const NO_FILTER = { query: "", errOnly: false, bizOnly: false };

describe("toTreeRequests (실제 응답)", () => {
  const [req] = toTreeRequests(fixture("tree-real-bind.json"));

  it("Request 요약: 루트 라벨 = 첫 문자열, 수행시간 = 자식 Process runTime, 태그·스레드", () => {
    expect(req.name).toBe("metaFeed/view");
    expect(req.serviceTag).toBe("vPPB");
    expect(req.thread).toBe("http-nio-8096-exec-7");
    expect(req.runTime).toBe(589);
    expect(req.start).toBe("2026-10-12 11:54:51.861");
    expect(req.end).toBe("2026-10-12 11:54:52.450");
    expect(req.sqlCount).toBe(5);
    expect(req.errorCount).toBe(0);
  });

  it("objectType → 배지 대응: Request=REQ · Process=SVC · Task=TSK · Query=SQL", () => {
    const svc = req.root.children.find((c) => c.kind === "SVC");
    expect(req.root.kind).toBe("REQ");
    expect(svc?.label).toBe("MDM 메타 제공 (metaFeed)");
    expect(svc?.runTime).toBe(589); // 문자열 runTime → 숫자
    const tsk = svc?.children.filter((c) => c.kind === "TSK") ?? [];
    expect(tsk.length).toBe(4);
    expect(collect(req.root, "ACT")).toHaveLength(0);
  });

  it("Query: SQL 정리·라벨·바인딩 값 추출, binding 문자열은 BND 자식으로 묶고 형제 MSG 에서는 빠진다", () => {
    const sqls = collect(req.root, "SQL");
    expect(sqls).toHaveLength(5);
    const q = sqls.find((n) => (n.params?.length ?? 0) > 0) as TreeNode;
    expect(q).toBeDefined();
    expect(q.sql?.startsWith("select")).toBe(true);
    expect(q.label).toMatch(/^SELECT · /);
    expect(q.params?.[0]).toMatchObject({ idx: 1, type: expect.stringMatching(/^[A-Z_]+$/), value: expect.any(String) });
    expect(q.children.every((c) => c.kind === "BND")).toBe(true);
    expect(q.children).toHaveLength(q.params?.length ?? -1);
    const bnd = collect(req.root, "BND").length;
    const msgWithBinding = collect(req.root, "MSG").filter((m) => m.text?.startsWith("binding parameter"));
    expect(bnd).toBeGreaterThan(0);
    expect(msgWithBinding).toHaveLength(0);
  });

  it("작은 응답에서 Query runTime 숫자 그대로", () => {
    const [small] = toTreeRequests(fixture("tree-real-small.json"));
    const sql = collect(small.root, "SQL")[0];
    expect(typeof sql.runTime).toBe("number");
  });

  it("읽을 수 없는 입력은 빈 배열", () => {
    expect(toTreeRequests(null)).toEqual([]);
    expect(toTreeRequests("x")).toEqual([]);
  });
});

describe("합성 응답", () => {
  const raw = [
    {
      property: { objectType: "Request", timestamp: "2026-10-12 10:00:00.000" },
      child: [
        "svc/run",
        {
          property: { objectType: "Process", objectName: "P", objectId: "p", runTime: "5", timestamp: "2026-10-12 10:00:00.001" },
          child: [
            {
              property: { objectType: "Query", query: "\n   update tb_a set x = ?\n    where y = ?\n", runTime: 2 },
            },
            "binding parameter (1:VARCHAR) <- [it's]",
            "binding parameter (2:INTEGER) <- [7]",
            "More......",
            { property: { objectType: "Weird" } },
            { property: { exception: ["boom\n\tat a.B(B.java:1)"] } },
          ],
        },
      ],
    },
  ];
  const [req] = toTreeRequests(raw);

  it("바인딩 문자열 묶기·모르는 종류 원문 배지·exception → ERR·More...... 는 MSG", () => {
    const [sql] = collect(req.root, "SQL");
    expect(sql.sql).toBe("update tb_a set x = ?\n where y = ?");
    expect(sql.params).toHaveLength(2);
    const weird = collect(req.root, "Weird");
    expect(weird).toHaveLength(1);
    expect(weird[0].hasError).toBe(false);
    // objectType 없이 exception 만 있는 노드는 ERR 배지
    const errs = collect(req.root, "ERR");
    expect(errs).toHaveLength(1);
    expect(errs.every((e) => e.children.length === 0)).toBe(true);
    expect(req.errorCount).toBe(1);
    expect(collect(req.root, "MSG").map((m) => m.text)).toEqual(["svc/run", "More......"]);
  });

  it("flattenRows: 접힘 · 검색 · 오류 경로만 · 업무 노드만", () => {
    expect(flattenRows(req.root, new Set(), NO_FILTER)).toHaveLength(1);
    const open = defaultExpanded(req.root);
    expect(flattenRows(req.root, open, NO_FILTER).length).toBeGreaterThan(1);
    const found = flattenRows(req.root, new Set(), { ...NO_FILTER, query: "tb_a" });
    expect(found.map((r) => r.node.kind)).toEqual(["REQ", "SVC", "SQL"]);
    const err = flattenRows(req.root, new Set(), { ...NO_FILTER, errOnly: true });
    expect(err.map((r) => r.node.kind)).toEqual(["REQ", "SVC", "ERR"]);
    const biz = flattenRows(req.root, open, { ...NO_FILTER, bizOnly: true });
    expect(biz.some((r) => r.node.kind === "MSG" || r.node.kind === "BND")).toBe(false);
  });

  it("firstSelection = 첫 SQL", () => {
    expect(firstSelection(req.root)?.kind).toBe("SQL");
  });
});

describe("작은 변환 함수", () => {
  it("cleanSql · sqlTitle", () => {
    expect(cleanSql("\n    select a\n      from t\n")).toBe("select a\n  from t");
    expect(sqlTitle("select a from tb_mdm_domain d")).toBe("SELECT · tb_mdm_domain");
    expect(sqlTitle("insert into x.y (a) values (?)")).toBe("INSERT · x.y");
  });

  it("bindParams: 숫자 타입은 따옴표 없이, 나머지는 '값'(따옴표 이스케이프), 값이 모자라면 ?", () => {
    const p = [
      { idx: 1, type: "BIGINT", value: "185" },
      { idx: 2, type: "VARCHAR", value: "it's" },
    ];
    expect(bindParams("a = ? and b = ? and c = ?", p)).toBe("a = 185 and b = 'it''s' and c = ?");
  });

  it("normalizeRunTime · heatLevel", () => {
    expect(normalizeRunTime("12")).toBe(12);
    expect(normalizeRunTime("x")).toBeUndefined();
    expect([undefined, 999, 1000, 2000, 3000, 4000, 5000].map(heatLevel)).toEqual([0, 0, 1, 2, 3, 4, 5]);
  });
});

describe("characterization 모양 (Service·property.params)", () => {
  const raw = [
    {
      property: { objectType: "Request", timestamp: "2026-05-15 09:30:00.000" },
      child: [
        "POST /api/order/save",
        {
          property: { objectType: "Service", objectName: "SVC01", runTime: "100", timestamp: "2026-05-15 09:30:00.010" },
          child: [
            { property: { objectType: "Query", query: "select * from item where id = ? and n = ?", runTime: 10, params: ["A01", "7"] } },
          ],
        },
      ],
    },
  ];
  const [req] = toTreeRequests(raw);

  it("Service → SVC, 요약 수행시간·기본 펼침", () => {
    expect(req.root.children[1].kind).toBe("SVC");
    expect(req.runTime).toBe(100);
    expect(defaultExpanded(req.root).has(req.root.children[1].id)).toBe(true);
  });

  it("property.params → Param, 타입 모르면 숫자 모양만 따옴표 없이 바인딩", () => {
    const sql = req.root.children[1].children[0];
    expect(sql.params).toHaveLength(2);
    expect(bindParams(sql.sql ?? "", sql.params ?? [])).toBe("select * from item where id = 'A01' and n = 7");
    expect(propsOf(sql).some((p) => p.key === "Params")).toBe(false);
  });

  it("검색 결과가 없으면 행이 없다", () => {
    expect(flattenRows(req.root, new Set(), { query: "zzz", errOnly: false, bizOnly: false })).toEqual([]);
  });
});

describe("연속 MSG 묶음", () => {
  const raw = [
    {
      property: { objectType: "Request" },
      child: [
        "req",
        {
          property: { objectType: "Process", objectName: "P" },
          child: [
            "a1",
            "a2",
            "a3",
            { property: { objectType: "Query", query: "select 1 from t" } },
            "binding parameter (1:BIGINT) <- [1]",
            "solo",
            { property: { objectType: "Task", objectName: "T" } },
            "b1",
            "b2",
          ],
        },
      ],
    },
  ];
  const [req] = toTreeRequests(raw);
  const svc = req.root.children.find((c) => c.kind === "SVC") as TreeNode;

  it("연속 2개 이상은 묶고, 단독은 두며, 다른 노드에서 끊는다. 개수 요약은 개별 MSG 수", () => {
    expect(svc.children.map((c) => c.kind)).toEqual(["MSGS", "SQL", "MSG", "TSK", "MSGS"]);
    expect(svc.children[0].children.map((m) => m.text)).toEqual(["a1", "a2", "a3"]);
    expect(svc.children[0].label).toBe("a1");
    expect(svc.children[1].children.every((c) => c.kind === "BND")).toBe(true);
    expect(req.msgCount).toBe(7);
  });

  it("묶음은 접힌 기본, 검색 일치 시 펼침, 업무 노드만에서 숨김", () => {
    const open = defaultExpanded(req.root);
    const base = flattenRows(req.root, open, NO_FILTER);
    expect(base.some((r) => r.node.text === "a2")).toBe(false);
    expect(base.find((r) => r.node.kind === "MSGS")?.open).toBe(false);
    const found = flattenRows(req.root, new Set(), { ...NO_FILTER, query: "a2" });
    expect(found.map((r) => r.node.kind)).toEqual(["REQ", "SVC", "MSGS", "MSG"]);
    const biz = flattenRows(req.root, open, { ...NO_FILTER, bizOnly: true });
    expect(biz.some((r) => r.node.kind === "MSGS")).toBe(false);
  });

  it("실제 응답: 묶음 안 MSG 수 합 + 단독 MSG = 요약 MSG 수", () => {
    const [big] = toTreeRequests(fixture("tree-real-bind.json"));
    const groups = collect(big.root, "MSGS");
    const inGroups = groups.reduce((s, g) => s + g.children.length, 0);
    expect(groups.every((g) => g.children.length >= 2)).toBe(true);
    expect(collect(big.root, "MSG")).toHaveLength(big.msgCount);
    expect(inGroups).toBeLessThanOrEqual(big.msgCount);
  });
});

describe("SubService (Task 안에서 부른 서비스 — objectType Service 중첩 + 부모 hasSubService)", () => {
  const raw = [
    {
      property: { objectType: "Request", hasSubService: "y" },
      child: [
        "req",
        {
          property: { objectType: "Service", objectName: "Main", hasSubService: "y" },
          child: [
            {
              property: { objectType: "Task", objectName: "call", objectId: "callTask", hasSubService: "y" },
              child: [
                {
                  property: { objectType: "Service", objectName: "Sub", runTime: 3, hasSubService: "y" },
                  child: [
                    "m1",
                    "m2",
                    {
                      property: { objectType: "Task", objectName: "inner", hasSubService: "y" },
                      child: [
                        { property: { objectType: "Service", objectName: "Deep" }, child: [{ property: { objectType: "Query", query: "select 1 from deep_t" } }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
  const [req] = toTreeRequests(raw);

  it("Request 바로 아래 Service 는 SVC, 중첩된 Service 는 SUB(2단 재귀) — ObjectType 은 원문 Service", () => {
    const tsk = collect(req.root, "TSK")[0];
    expect(tsk.children[0].kind).toBe("SUB");
    expect(req.root.children.find((c) => c.kind === "SVC")?.label).toBe("Main");
    expect(collect(req.root, "SVC").map((n) => n.label)).toEqual(["Main"]);
    expect(collect(req.root, "SUB").map((n) => n.label)).toEqual(["Sub", "Deep"]);
    expect(propsOf(tsk.children[0])[0]).toEqual({ key: "ObjectType", value: "Service" });
    expect(req.sqlCount).toBe(1);
    expect(req.msgCount).toBe(3);
  });

  it("subMark: hasSubService 부모에만, Request 는 제외", () => {
    expect(req.root.subMark).toBe(false);
    expect(collect(req.root, "SVC")[0].subMark).toBe(true);
    expect(collect(req.root, "TSK").every((t) => t.subMark)).toBe(true);
    expect(collect(req.root, "SUB").map((n) => n.subMark)).toEqual([true, false]);
  });

  it("플래그가 없어도 SUB 자식이 있으면 subMark", () => {
    const [r] = toTreeRequests([
      {
        property: { objectType: "Request" },
        child: [{ property: { objectType: "Service" }, child: [{ property: { objectType: "Task" }, child: [{ property: { objectType: "Service" } }] }] }],
      },
    ]);
    expect(collect(r.root, "TSK")[0].subMark).toBe(true);
    expect(collect(r.root, "SVC")[0].subMark).toBe(false);
  });

  it("기본 펼침·검색·업무 노드만이 SUB 까지 동작", () => {
    const open = defaultExpanded(req.root);
    expect(open.has(collect(req.root, "TSK")[0].id)).toBe(true);
    expect(collect(req.root, "SUB").every((n) => open.has(n.id))).toBe(true);
    const found = flattenRows(req.root, new Set(), { ...NO_FILTER, query: "deep_t" });
    expect(found.map((r) => r.node.kind)).toEqual(["REQ", "SVC", "TSK", "SUB", "TSK", "SUB", "SQL"]);
    const biz = flattenRows(req.root, allExpandable(req.root), { ...NO_FILTER, bizOnly: true });
    expect(biz.some((r) => r.node.kind.startsWith("MSG"))).toBe(false);
    expect(biz.filter((r) => r.node.kind === "SUB").map((r) => r.node.label)).toEqual(["Sub", "Deep"]);
  });
});

describe("SUB 판정 범위 (Task 바로 아래 Service 만)", () => {
  it("Request > Service(top) > Process > Task > Service(sub) → SVC, SVC, TSK, SUB", () => {
    const [r] = toTreeRequests([
      {
        property: { objectType: "Request" },
        child: [
          {
            property: { objectType: "Service", objectName: "Top", serviceTag: "T1" },
            child: [
              {
                property: { objectType: "Process", objectName: "Proc" },
                child: [
                  {
                    property: { objectType: "Task", objectName: "call", hasSubService: "y" },
                    child: [{ property: { objectType: "Service", objectName: "Sub" } }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    const top = r.root.children[0];
    const proc = top.children[0];
    const tsk = proc.children[0];
    expect([top.kind, proc.kind, tsk.kind, tsk.children[0].kind]).toEqual(["SVC", "SVC", "TSK", "SUB"]);
  });
});

describe("노드 앞 표식 (queryMark·errorMark)", () => {
  const mk = (child: unknown[], extra: Record<string, unknown> = {}) => ({ property: { objectType: "Task", ...extra }, child });
  const sql = { property: { objectType: "SQL", query: "select 1" } };
  const build = (task: unknown) =>
    toTreeRequests([{ property: { objectType: "Request" }, child: [{ property: { objectType: "Service" }, child: [task] }] }])[0];

  it("queryMark: 직접 SQL 자식만 true, 손자 SQL 은 조부모에서 false", () => {
    const r = build(mk([sql, "msg"]));
    expect(collect(r.root, "TSK")[0].queryMark).toBe(true);
    expect(collect(r.root, "SVC")[0].queryMark).toBe(false);
    const r2 = build(mk([mk([sql])]));
    const [outer, inner] = collect(r2.root, "TSK");
    expect(outer.queryMark).toBe(false);
    expect(inner.queryMark).toBe(true);
  });

  it("errorMark: 자기 exception 은 true, 하위 오류만 있으면 false 이고 hasError 는 true", () => {
    const own = build(mk([], { exception: "java.lang.Boom\n at x" }));
    expect(collect(own.root, "TSK")[0].errorMark).toBe(true);
    const nested = build(mk([mk([], { exception: "Boom" })]));
    const [outer, inner] = collect(nested.root, "TSK");
    expect(outer.errorMark).toBe(false);
    expect(outer.hasError).toBe(true);
    expect(inner.errorMark).toBe(true);
  });

  it("직접 ERR 자식(objectType 없는 exception 노드)도 errorMark", () => {
    const r = build(mk([{ property: { exception: "Boom" } }]));
    expect(collect(r.root, "TSK")[0].errorMark).toBe(true);
  });

  it("subMark 유지, REQ·말단 노드는 표식 모두 false", () => {
    const r = build(mk([sql, { property: { exception: "x" } }, "m1", "m2"], { hasSubService: "y" }));
    const t = collect(r.root, "TSK")[0];
    expect([t.subMark, t.queryMark, t.errorMark]).toEqual([true, true, true]);
    const all: TreeNode[] = [];
    const walk = (n: TreeNode) => {
      all.push(n);
      n.children.forEach(walk);
    };
    walk(r.root);
    const leaves = all.filter((x) => ["REQ", "SQL", "ERR", "MSG", "MSGS", "BND"].includes(x.kind));
    expect(leaves.length).toBeGreaterThanOrEqual(4);
    for (const n of leaves) expect([n.kind, n.subMark, n.queryMark, n.errorMark]).toEqual([n.kind, false, false, false]);
  });
});
