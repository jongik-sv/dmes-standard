/**
 * ERD 설계(erdEdit) 화면 타입 — 서버 응답·모델 JSON·SSE 본문의 모양.
 * 정본: 단계 1 계획 README "인터페이스", 단계 0 DTO(ErdModelView·ErdChangesView·ErdApplyResult·ErdDelta·ErdChange·ErdPresence·ErdClaimView),
 * 모델 JSON(스펙 3.1, ErdModel). 시각 필드는 ISO 문자열이다(Local-Rules §48).
 */
export type ErdColumnStatus = "OK" | "ALIAS" | "NEW" | "TYPE" | "DOMAIN" | "MISS";
export type ErdRelationState = "DB" | "INFERRED" | "CONFIRMED" | "REJECTED";
export type ErdFoldMode = "NONE" | "KEYS" | "NAME";
export type ErdSource = "UI" | "MCP" | "CLI" | "SYSTEM";

/** 속성마다 마지막으로 바꾼 [rev, 세션](스펙 4.3). */
export interface PropRev { rev: number; session: string }
type Revs = Record<string, PropRev>;

export interface ErdTable { phys: string; logical: string; comment: string | null; columnOrder: string[]; _rev?: Revs }

export interface ErdColumn {
  table: string; phys: string; logical: string; domainId: number | null;
  dataType: string | null; length: number | null; scale: number | null; notNull: boolean;
  default: string | null; comment: string | null; _rev?: Revs;
}

export interface ErdKey { table: string; kind: "PK" | "UK" | "IX"; name: string; columns: string[]; _rev?: Revs }

export interface ErdEvidence { kind: "DB_FK" | "DOC" | "SQL_JOIN" | "NAME_RULE"; ref: string }

export interface ErdRelation {
  child: string;
  parent: string;
  /** [자식 컬럼 id, 부모 컬럼 id] 쌍. */
  pairs: [string, string][];
  identifying: boolean;
  cardinality: { parent: string; child: string };
  state: ErdRelationState;
  dbFk: boolean;
  evidence: ErdEvidence[];
  parentRef: { model: string; table: string; columns: string[] } | null;
  /** 허브 후보 순위(S7). 허브가 아니면 null, 가장 가까운 후보 1, 나머지 2..n. 단계 0 모델에는 없다. */
  candidateRank?: number | null;
  _rev?: Revs;
}

export interface ErdModelJson {
  schemaVersion: number;
  model: { module: string; schema: string };
  tables: Record<string, ErdTable>;
  columns: Record<string, ErdColumn>;
  keys: Record<string, ErdKey>;
  relations: Record<string, ErdRelation>;
  _tombstones?: Record<string, PropRev>;
}

export interface ErdDiagram { id: string; areaName: string; diagramName: string; sortSeq: number }
export interface ErdDiagramNode { diagram: string; table: string; x: number; y: number; foldMode: ErdFoldMode }
/** 접속자. expiresAt: SSE 구독자는 null, MCP·CLI 시한 항목은 만료 시각(S2-11). 단계 1 서버는 이 칸을 싣지 않는다. */
export interface ErdPresence {
  session: string; userId: string; source: ErdSource; diagramId: string | null; selectedTables: string[]; at: string; expiresAt?: string | null;
}
export interface ErdClaim { tableId: string; session: string; userId: string; expiresAt: string }

/** search 응답 행. */
export interface ErdModelRow {
  modelId: string; moduleId: string; schemaName: string; modelName: string; rev: number; draftVer: string | null; ownerId: string | null;
}

/** view(kind 없음) 응답. model 은 MODEL_JSON 문자열이다. */
export interface ErdModelView {
  modelId: string; rev: number; ver: string; status: string; ownerId: string | null; editors: string[]; rowVersion: number;
  model: string; diagrams: ErdDiagram[]; nodes: ErdDiagramNode[]; presence: ErdPresence[];
}

export type ErdChangeKind = "table" | "column" | "key" | "relation" | "diagram" | "diagramNode";

/** 델타 한 건. upsert 면 요소 JSON 전체, delete 면 null, patch 면 바뀐 속성만(되돌리기). diagramNode id 는 "다이어그램:표". */
export interface ErdChange { kind: ErdChangeKind; id: string; op: "upsert" | "delete" | "patch"; value: Record<string, unknown> | null }
/** rowVersion: 실시간 발행만 값이 있다. 재전송·getChangesSince·다이어그램만 바꾼 델타는 null 이거나 없다(S2-16). */
export interface ErdDelta {
  modelId: string; rev: number; userId: string; session: string; source: ErdSource; rowVersion?: number | null; changes: ErdChange[];
  /** 쓴 시각(yyyy-MM-ddTHH:mm:ss, 서버 지역 시각). UX 1차 U28. 옛 서버는 없다 — 읽을 때 `?? null`. */
  at?: string | null;
}
/**
 * view sinceRev 응답. fromRev: 요청 구간 앞에 다시 읽기 지점(새 DRAFT·DRAFT 삭제)이 있거나 500건을 넘어 reload 일 때, 기록을 줄 수 있는
 * 가장 이른 sinceRev. 그 밖에는 null(옛 서버는 싣지 않는다 — 읽을 때 `?? null`). 변경 기록 화면은 그 값으로 다시 읽은 결과에 fromRev 를 남겨 안내문에 쓴다.
 */
export interface ErdChangesView { rev: number; reload: boolean; deltas: ErdDelta[]; fromRev?: number | null }

export interface ErdRejection {
  code: string; commandIndex: number; message: string; hint: string | null; elementId: string | null; property: string | null;
  /** byUserId: byRev 의 명령 기록 USER_ID(S2-13). 단계 1 서버는 싣지 않는다 — 읽을 때 `?? null`. */
  byRev: number | null; bySession: string | null; byUserId: string | null; current: unknown; choices: unknown; ownerId: string | null;
  /** 사람이 읽는 안내(UX 1차 U27·U28). 옛 서버는 없다 — 읽을 때 `?? null`. */
  userHint?: string | null;
}
export interface ErdWarning { code: string; elementId: string | null; message: string; claimedBy: string | null; expiresAt: string | null }
/** save·restore 응답. rowVersion 은 DRAFT 행 ROW_VERSION 을 올렸을 때만 값이 있다(다이어그램만·거절·dryRun 은 null). */
export interface ErdApplyResult {
  applied: boolean; rev: number; rowVersion: number | null; dryRun?: boolean;
  changes: ErdChange[]; warnings: ErdWarning[]; rejection: ErdRejection | null;
}

export interface ErdImportSummary {
  tables: number; columns: number; keys: number; relations: Partial<Record<"DB" | "INFERRED", number>>; diagramId: string;
}
/** import 응답 = ErdApplyResult + summary(거절이면 null). */
export interface ErdImportResult extends ErdApplyResult { summary: ErdImportSummary | null }

export interface ErdStatusView {
  modelId: string;
  ver: string;
  rev: number;
  statuses: Record<string, ErdColumnStatus>;
  /** 모델에 쓰인 domainId 만. 키는 domainId 문자열. */
  domains: Record<string, { name: string; dataType: string | null; length: number | null; scale: number | null }>;
  counts: Record<ErdColumnStatus, number>;
  elapsedMs: number;
}

export type ErdDbDiffKind =
  | "TABLE_ADDED" | "TABLE_REMOVED" | "COLUMN_ADDED" | "COLUMN_REMOVED" | "COLUMN_CHANGED" | "FK_ADDED" | "FK_REMOVED";
export interface ErdColumnSpec { dataType: string | null; length: number | null; scale: number | null; notNull: boolean }
export interface ErdDbDiffItem {
  id: string; kind: ErdDbDiffKind; table: string; column: string | null; before: ErdColumnSpec | null; after: ErdColumnSpec | null;
}
export interface ErdDbDiffView { modelId: string; rev: number; schema: string; items: ErdDbDiffItem[] }

/** SET_VIEW 본문(viewJson). */
export interface ErdViewState { diagramId: string | null; selectedTables: string[] }

/** 화면이 들고 있는 모델(스펙 4.4 아래층). nodes 키는 "다이어그램:표"(ErdChange diagramNode id 와 같다). */
export interface ErdState {
  modelId: string; rev: number; ver: string; status: string; ownerId: string | null; editors: string[]; rowVersion: number;
  model: ErdModelJson;
  diagrams: Record<string, ErdDiagram>;
  nodes: Record<string, ErdDiagramNode>;
  presence: ErdPresence[];
  claims: ErdClaim[];
}

// ── 단계 2(README "화면 내부 계약") ──
export type ErdVersionReason = "SUBSCRIBE" | "CONFIRM" | "LOCK" | "UNLOCK" | "HANDOVER" | "ADD_EDITOR" | "REMOVE_EDITOR";
/** SSE version(S2-12) — rev 를 올리지 않는다. 값은 그 시점 view(ver 없음)가 돌려줄 값과 같다. */
export interface ErdVersionEvent {
  modelId: string; ver: string; status: string; ownerId: string | null; editors: string[];
  rowVersion: number; reason: ErdVersionReason; userId: string; at: string;
}
/** execute kind=CLAIM 응답(S2-26). ok 와 상관없이 지금 그 표를 쥔 세션을 준다. */
export interface ErdClaimResult { ok: boolean; claimedBy: string | null; userId: string | null; expiresAt: string | null }
export interface ErdDiffApplySummary {
  items: number; tablesAdded: number; tablesRemoved: number; columnsAdded: number; columnsRemoved: number;
  columnsChanged: number; relationsAdded: number; dbFkSet: number; dbFkCleared: number; removedIds: string[];
}
/** import kind=APPLY_DIFF 응답(S2-14). summary 는 거절이면 null. */
export interface ErdDiffApplyResult extends ErdApplyResult { summary: ErdDiffApplySummary | null }
export interface ErdTermRef { termId: number; termName: string; engAbbr: string | null }
export interface ErdNameToken {
  seq: number; surface: string; status: "MATCHED" | "SYNONYM" | "AMBIGUOUS" | "NO_ABBR" | "UNKNOWN";
  selected: ErdTermRef | null; abbr: string; candidates: { term: ErdTermRef; via: "NAME" | "SYNONYM" | "ALIAS" }[];
}
/** compare(kind 없음) 응답 — 논리명·물리명 미리보기. */
export interface ErdNamePreview {
  physName: string; logicalName: string; tokens: ErdNameToken[]; recommendedDomainId: number | null; status: ErdColumnStatus;
}
export interface ErdCheckIssue { code: string; message: string; field: string | null; itemKey: string | null }
/** validate 응답(ConfirmCheckResult). errors 가 비면 확정할 수 있다. */
export interface ErdConfirmCheck { errors: ErdCheckIssue[]; warnings: ErdCheckIssue[] }
/** 명령 JSON 한 건(스펙 4.1). 모양은 서버가 판정한다. */
export type ErdCommandJson = { op: string } & Record<string, unknown>;
