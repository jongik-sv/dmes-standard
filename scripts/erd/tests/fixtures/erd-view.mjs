// model-text·erd-mcp 시험이 함께 쓰는 가짜 OASIS 응답. 모양은 계획 README "인터페이스" 의 ErdModelView·ErdStatusView.

const col = (table, phys, logical, dataType, length, scale, notNull, domainId = null) => ({
  table, phys, logical, domainId, dataType, length, scale, notNull, default: null, comment: "", _rev: {},
});
const rel = (child, parent, pairs, state, evidence, candidateRank = null) => ({
  child, parent, pairs, identifying: false, cardinality: { parent: "ONE", child: "ZERO_OR_MORE" },
  state, dbFk: state === "DB", evidence, parentRef: null, candidateRank, _rev: {},
});

export const MODEL = {
  schemaVersion: 1,
  model: { module: "mcm", schema: "MCMAPUSER" },
  tables: {
    "t-menu": { phys: "TB_MCM_SEC_MENU", logical: "메뉴", comment: "", columnOrder: ["c-m1", "c-m2", "c-m3"], _rev: {} },
    "t-obj": { phys: "TB_MCM_SEC_OBJ", logical: "오브젝트", comment: "", columnOrder: ["c-o1"], _rev: {} },
    "t-fld": { phys: "TB_MCM_SEC_MENU_FLD", logical: "", comment: "", columnOrder: ["c-d1"], _rev: {} },
    "t-user": { phys: "TB_MCM_SEC_USER", logical: "사용자", comment: "", columnOrder: ["c-u1", "c-u2", "c-u3"], _rev: {} },
    "t-fav": { phys: "TB_MCM_SEC_USER_FAVORITE", logical: "즐겨찾기", comment: "", columnOrder: ["c-f1", "c-f2"], _rev: {} },
    "t-wid": { phys: "TB_MCM_SEC_USER_WIDGET", logical: "위젯", comment: "", columnOrder: ["c-w1", "c-w2"], _rev: {} },
    "t-tab": { phys: "TB_MCM_SEC_USER_WIDGET_TAB", logical: "위젯탭", comment: "", columnOrder: ["c-t1", "c-t2"], _rev: {} },
  },
  columns: {
    "c-m1": col("t-menu", "MENU_ID", "메뉴아이디", "VARCHAR2", 30, null, true, 12),
    "c-m2": col("t-menu", "OBJECT_ID", "오브젝트아이디", "VARCHAR2", 50, null, false, 12),
    "c-m3": col("t-menu", "MENU_NM", "메뉴명", "VARCHAR2", 200, null, true, 99),
    "c-o1": col("t-obj", "OBJECT_ID", "오브젝트아이디", "VARCHAR2", 50, null, true),
    "c-d1": col("t-fld", "MENU_ID", "", "VARCHAR2", 30, null, true),
    "c-u1": col("t-user", "USER_ID", "사용자아이디", "VARCHAR2", 30, null, true),
    "c-u2": col("t-user", "PWD_FAIL_CNT", "비밀번호실패수", "NUMBER", 3, 0, false),
    "c-u3": col("t-user", "C_AT", "생성일시", "TIMESTAMP", null, 6, false),
    "c-f1": col("t-fav", "USER_ID", "사용자아이디", "VARCHAR2", 30, null, true),
    "c-f2": col("t-fav", "MENU_ID", "메뉴아이디", "VARCHAR2", 30, null, true),
    "c-w1": col("t-wid", "USER_ID", "사용자아이디", "VARCHAR2", 30, null, true),
    "c-w2": col("t-wid", "TAB_ID", "탭아이디", "VARCHAR2", 30, null, true),
    "c-t1": col("t-tab", "USER_ID", "사용자아이디", "VARCHAR2", 30, null, true),
    "c-t2": col("t-tab", "TAB_ID", "탭아이디", "VARCHAR2", 30, null, true),
  },
  keys: {
    "k-1": { table: "t-menu", kind: "PK", name: "PK_TB_MCM_SEC_MENU", columns: ["c-m1"], _rev: {} },
    "k-2": { table: "t-obj", kind: "PK", name: "PK_TB_MCM_SEC_OBJ", columns: ["c-o1"], _rev: {} },
    "k-3": { table: "t-fld", kind: "PK", name: "PK_TB_MCM_SEC_MENU_FLD", columns: ["c-d1"], _rev: {} },
    "k-4": { table: "t-user", kind: "PK", name: "PK_TB_MCM_SEC_USER", columns: ["c-u1"], _rev: {} },
    "k-5": { table: "t-fav", kind: "PK", name: "PK_TB_MCM_SEC_USER_FAVORITE", columns: ["c-f1", "c-f2"], _rev: {} },
    "k-6": { table: "t-wid", kind: "PK", name: "PK_TB_MCM_SEC_USER_WIDGET", columns: ["c-w1", "c-w2"], _rev: {} },
    "k-7": { table: "t-tab", kind: "PK", name: "PK_TB_MCM_SEC_USER_WIDGET_TAB", columns: ["c-t1", "c-t2"], _rev: {} },
    "k-8": { table: "t-menu", kind: "IX", name: "IX_TB_MCM_SEC_MENU_OBJ", columns: ["c-m2"], _rev: {} },
  },
  relations: {
    "r-1": rel("t-menu", "t-obj", [["c-m2", "c-o1"]], "INFERRED", [
      { kind: "DOC", ref: "docs/mcm/erd/csa-menu.dbml:494" },
      { kind: "NAME_RULE", ref: "PK 이름 일치" },
    ]),
    "r-2": rel("t-fav", "t-user", [["c-f1", "c-u1"]], "CONFIRMED", [{ kind: "DOC", ref: "docs/mcm/erd/csa-menu.dbml:512" }]),
    "r-3": rel("t-fav", "t-menu", [["c-f2", "c-m1"]], "INFERRED", [{ kind: "NAME_RULE", ref: "PK 이름 일치" }], 1),
    "r-4": rel("t-fav", "t-fld", [["c-f2", "c-d1"]], "INFERRED", [{ kind: "NAME_RULE", ref: "PK 이름 일치" }], 2),
    "r-5": rel("t-menu", "t-fld", [["c-m1", "c-d1"]], "REJECTED", [{ kind: "NAME_RULE", ref: "PK 이름 일치" }]),
    "r-6": rel("t-wid", "t-tab", [["c-w1", "c-t1"], ["c-w2", "c-t2"]], "DB", [{ kind: "DB_FK", ref: "FK_TB_MCM_SEC_USER_WIDGET_TAB" }]),
    "r-7": rel("t-wid", "t-user", [["c-w1", "c-u1"]], "INFERRED", [
      { kind: "SQL_JOIN", ref: "src/backend/mcm-core/src/main/java/x/WidgetRepo.java:41" },
      { kind: "NAME_RULE", ref: "PK 이름 일치" },
    ]),
  },
  _tombstones: {},
};

export const VIEW = {
  modelId: "mcm",
  rev: 12,
  ver: "1.000",
  status: "DRAFT",
  ownerId: "41000207",
  editors: [],
  rowVersion: 3,
  model: JSON.stringify(MODEL),
  diagrams: [
    { id: "d-all", areaName: "기본", diagramName: "전체", sortSeq: 0 },
    { id: "d-menu", areaName: "메뉴", diagramName: "메뉴 화면", sortSeq: 1 },
  ],
  nodes: [
    ...Object.keys(MODEL.tables).map((t, i) => ({ diagram: "d-all", table: t, x: (i % 8) * 280, y: Math.floor(i / 8) * 220, foldMode: "NONE" })),
    { diagram: "d-menu", table: "t-menu", x: 0, y: 0, foldMode: "NONE" },
    { diagram: "d-menu", table: "t-obj", x: 280, y: 0, foldMode: "NONE" },
    { diagram: "d-menu", table: "t-fav", x: 560, y: 0, foldMode: "NONE" },
  ],
  presence: [
    { session: "claude-a", userId: "41000207", source: "MCP", diagramId: null, selectedTables: [], at: "2026-10-10T10:00:01Z" },
    { session: "ui-41000207", userId: "41000207", source: "UI", diagramId: "d-menu", selectedTables: ["t-menu", "t-obj"], at: "2026-10-10T10:00:00Z" },
  ],
};

export const STATUS = {
  modelId: "mcm",
  ver: "1.000",
  rev: 12,
  statuses: {
    "c-m1": "OK", "c-m2": "NEW", "c-m3": "MISS", "c-o1": "ALIAS", "c-d1": "OK", "c-u1": "OK", "c-u2": "DOMAIN", "c-u3": "OK",
    "c-f1": "OK", "c-f2": "OK", "c-w1": "OK", "c-w2": "TYPE", "c-t1": "OK", "c-t2": "OK",
  },
  domains: { 12: { name: "아이디", dataType: "VARCHAR2", length: 30, scale: null } },
  counts: { OK: 9, ALIAS: 1, NEW: 1, TYPE: 1, DOMAIN: 1, MISS: 1 },
  elapsedMs: 85,
};

export const GOLDEN = `# MCM 모델 (MCMAPUSER) ver 1.000 DRAFT rev 12
TB_MCM_SEC_MENU 메뉴 {
  MENU_ID 메뉴아이디 VARCHAR2(30) PK NN [아이디]
  OBJECT_ID 오브젝트아이디 VARCHAR2(50) FK>TB_MCM_SEC_OBJ.OBJECT_ID? [아이디] !NEW
  MENU_NM 메뉴명 VARCHAR2(200) NN [도메인 99] !MISS
}
TB_MCM_SEC_MENU_FLD {
  MENU_ID - VARCHAR2(30) PK NN
}
TB_MCM_SEC_OBJ 오브젝트 {
  OBJECT_ID 오브젝트아이디 VARCHAR2(50) PK NN
}
TB_MCM_SEC_USER 사용자 {
  USER_ID 사용자아이디 VARCHAR2(30) PK NN
  PWD_FAIL_CNT 비밀번호실패수 NUMBER(3,0) !DOMAIN
  C_AT 생성일시 TIMESTAMP
}
TB_MCM_SEC_USER_FAVORITE 즐겨찾기 {
  USER_ID 사용자아이디 VARCHAR2(30) PK NN FK>TB_MCM_SEC_USER.USER_ID
  MENU_ID 메뉴아이디 VARCHAR2(30) PK NN FK>TB_MCM_SEC_MENU.MENU_ID?
}
TB_MCM_SEC_USER_WIDGET 위젯 {
  USER_ID 사용자아이디 VARCHAR2(30) PK NN FK>TB_MCM_SEC_USER.USER_ID? FK>TB_MCM_SEC_USER_WIDGET_TAB.USER_ID
  TAB_ID 탭아이디 VARCHAR2(30) PK NN FK>TB_MCM_SEC_USER_WIDGET_TAB.TAB_ID !TYPE
}
TB_MCM_SEC_USER_WIDGET_TAB 위젯탭 {
  USER_ID 사용자아이디 VARCHAR2(30) PK NN
  TAB_ID 탭아이디 VARCHAR2(30) PK NN
}
Ref TB_MCM_SEC_MENU.OBJECT_ID > TB_MCM_SEC_OBJ.OBJECT_ID INFERRED (DOC csa-menu.dbml:494, NAME_RULE)
Ref TB_MCM_SEC_USER_FAVORITE.MENU_ID > TB_MCM_SEC_MENU.MENU_ID INFERRED (NAME_RULE)
Ref TB_MCM_SEC_USER_FAVORITE.USER_ID > TB_MCM_SEC_USER.USER_ID CONFIRMED (DOC csa-menu.dbml:512)
Ref TB_MCM_SEC_USER_WIDGET.(USER_ID, TAB_ID) > TB_MCM_SEC_USER_WIDGET_TAB.(USER_ID, TAB_ID) DB (DB_FK FK_TB_MCM_SEC_USER_WIDGET_TAB)
Ref TB_MCM_SEC_USER_WIDGET.USER_ID > TB_MCM_SEC_USER.USER_ID INFERRED (SQL_JOIN WidgetRepo.java:41, NAME_RULE)`;
