#!/usr/bin/env node
// ERD 모델 stdio MCP 서버(단계 1 읽기 6개 + 단계 2 쓰기 6개 + 2차 모델 관리 4개). MDM 서버 OASIS erdEdit 를 감싸기만 한다(스펙 2.3).
// stdout 은 MCP 프로토콜 전용이다. 로그는 stderr(console.error)로만 쓴다.
// 환경변수: ERD_BASE(기본 http://localhost:8096) · ERD_USER(erd-mcp) · ERD_ROLE(MDM_STEWARD)
//           · BACKEND_CLIENT_KEY(dmes-bff-local-client-key-2026)
//           · ERD_SESSION(비었거나 auto 면 claude-<CLAUDE_CODE_SESSION_ID 앞 8글자>, 그것도 없으면 mcp-<임의 8글자>, README S2-7)
// 의존성: @modelcontextprotocol/sdk·zod(루트 package.json). 처음 한 번 저장소 루트에서 pnpm install 을 돌린다.
// 쓰기 흐름(이름 풀기·결과 글)은 lib/flows.mjs 에 있다. CLI(erd-cli.mjs)가 같은 흐름을 SDK 없이 쓴다.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { applyFlow, changesFlow, claimFlow, InputError, MAX_COMMANDS, MAX_TABLES, newState, releaseAll, releaseFlow, undoFlow } from "./lib/flows.mjs";
import { importFlow, listDiagramsFlow, listModelsFlow, registerFlow } from "./lib/models.mjs";
import { formatCurrentView, formatDbDiff, formatInferred, formatViolations, getModelText, TEXT_LIMIT } from "./lib/model-text.mjs";
import { configFromEnv, createOasisClient, describeError } from "./lib/oasis.mjs";
import { WRITE_TEXT_LIMIT } from "./lib/results.mjs";

/** 종료 때 잡은 표를 놓는 요청의 시간 상한. 기본 30초를 기다리면 Claude Code 가 프로세스를 먼저 죽인다. */
const RELEASE_TIMEOUT_MS = 3000;

/** 스펙 4.6 "LLM 이 쓰는 순서". 세션 이름과 baseRev 규칙을 적는다(README MCP 표 아래). */
export function instructions(session) {
  return [
    "ERD 모델(모듈 하나 = 모델 하나, 예: mcm·mdm)을 읽고 고치는 서버다.",
    `내 세션 이름: ${session}. 다른 세션이 내 baseRev 뒤에 같은 속성을 바꿨으면 CONFLICT 다. 권한은 ERD_USER(사용자)로, 충돌은 세션 이름으로 가린다.`,
    "쓰는 순서:",
    "1. getCurrentView 로 사용자가 화면에서 보는 다이어그램과 선택한 표를 확인하거나, getModelText 로 모델을 읽는다.",
    "   getModelText 는 큰 모델이면 개요(표 목록·컬럼 수·PK)만 준다. 질문에 표 이름이 있으면 처음부터 tables 에 그 표를 넣어 부른다.",
    "2. claimTable 로 작업할 표를 선언한다. 다른 세션이 그 표를 고치면 그쪽 결과에 CLAIMED 경고가 붙는다.",
    "3. apply 로 명령을 묶어 보낸다. 묶음은 모두 반영되거나 모두 거절된다. 요소는 물리명(표, 표.컬럼, 자식표.컬럼 > 부모표.컬럼, 표:PK)이나 id 로 가리킨다.",
    "   baseRev 는 마지막으로 읽은 rev(getModelText 머리줄, getChangesSince 결과, 마지막 apply 결과)다. 더 큰 rev 를 짐작하지 마세요.",
    "   저장 전에 확인하려면 dryRun=true 로 보낸다(서버가 모든 검사를 하고 저장하지 않는다). 추정 관계는 confirmRelation·rejectRelation, 되돌리기는 undo 다.",
    "4. CONFLICT 를 받으면 getChangesSince(rev) 로 최신 상태를 확인하고 다시 보낸다.",
    "5. 끝나면 releaseTable 로 선언을 푼다. 선언은 600초가 지나면 저절로 풀린다.",
    "모델 관리: listModels 로 모델 목록(상태·확정본·만든 사람)을, listDiagrams 로 한 모델의 다이어그램 목록(id·업무영역/이름·표 수)을 본다.",
    "   새 모델은 registerModel(모듈·스키마·모델 이름)로 등록하고, 그 모델의 DB 스키마에서 표·관계를 가져오려면 importModel 을 한 번 부른다(저장 전 시험 실행은 없다).",
    "   다이어그램 이름 바꾸기·지우기·복사와 관계 경유점은 apply 명령(updateDiagram·deleteDiagram·copyDiagram·setRoute·clearRoutes)으로 한다.",
    "   모델 삭제는 MCP 로 할 수 없다. 되돌릴 수 없어 사용자가 직접 한다. 필요하면 사용자에게 지워 달라고 말하고, 에이전트가 다른 길로 지우지 않는다.",
    "표준 위반은 listViolations, 사람이 확인할 추정 관계는 listInferredRelations, DB 와 모델의 차이는 getDbDiff 로 본다.",
    "쓰기가 NOT_EDITOR 로 거절되면 DRAFT 소유자에게 ERD_USER 를 공동 편집자로 등록해 달라고 한다(execute kind=ADD_EDITOR).",
  ].join("\n");
}

const modelId = z.string().min(1).max(50).describe("ERD 모델 ID. 모듈 이름과 같다(예: mcm, mdm)");
const baseRev = z
  .number()
  .int()
  .min(0)
  .describe("마지막으로 읽은 rev(getModelText 머리줄·getChangesSince 결과·마지막 apply 결과). 더 큰 rev 를 짐작하지 않는다");
const tableNames = z
  .union([z.array(z.string().min(1)).min(1).max(MAX_TABLES), z.string().min(1)])
  .describe(`표 물리명이나 t- id 목록(${MAX_TABLES}개까지). 쉼표로 이은 글도 받는다`);
const relation = z.string().min(1).describe("r- id(listInferredRelations 앞의 id) 또는 '자식표.컬럼 > 부모표.컬럼'(복합은 '자식표.(A, B) > 부모표.(A, B)')");

export const TOOLS = {
  getModelText: {
    description:
      "모델을 DBML 비슷한 텍스트로 읽는다. 컬럼 줄: 물리명 논리명 타입 [PK] [NN] [FK>부모표.부모컬럼(?=추정)] [도메인] [!표준상태]. " +
      "끝에 Ref 줄(관계 상태와 근거)이 붙는다. 순서 1단계: 화면 상태가 없으면 이 도구로 시작한다. 머리줄의 rev 가 apply 의 baseRev 다. " +
      `결과는 ${TEXT_LIMIT}자를 넘지 않는다. 모델 전체가 그보다 크면 tables 없이 부를 때 개요만 온다` +
      "(표 수, PK 없는 표, 표마다 논리명·컬럼 수·PK 컬럼·관계 수·표준 위반 수). 개요에는 컬럼 줄과 Ref 줄이 없다. " +
      "질문에 표 이름이 나오면 처음부터 tables 에 그 물리명을 넣어 부른다(예: tables=[\"TB_MCM_SEC_MENU\"]). " +
      "tables 는 정확한 물리명(대소문자 무관)이고, 끝에 * 를 붙이면 접두사다(예: TB_MCM_SEC_*). " +
      "tables 를 주면 Ref 줄은 고른 표가 자식이든 부모든 나온다. diagram 을 주면 그 다이어그램의 표만 쓰고, 경유점(꺾임점)이 있는 관계는 Ref 줄 아래에 '  via (x,y) → (x,y)' 줄이 붙는다. " +
      "감사 컬럼 8개(C_USR_ID C_AT C_SVC_ID C_PGM_ID U_USR_ID U_AT U_SVC_ID U_PGM_ID)는 표마다 한 줄('감사 컬럼 n개: …')로 접는다. audit=true 면 보통 컬럼 줄로 펼친다.",
    inputSchema: {
      modelId,
      tables: z
        .union([z.array(z.string().min(1)).min(1), z.string().min(1)])
        .optional()
        .describe("읽을 표의 물리명 목록. 끝이 * 면 접두사. 쉼표로 이은 글도 받는다"),
      diagram: z.string().min(1).optional().describe("다이어그램 id, 이름, 또는 '업무영역/이름'"),
      audit: z.boolean().optional().describe("true 면 감사 컬럼 8개를 보통 컬럼 줄로 펼친다(기본: 표마다 한 줄로 접는다)"),
    },
    // Claude Code 가 큰 결과를 파일로 빼는 기준을 올리는 힌트. 결과는 TEXT_LIMIT 안이라 이 값에 기대지 않는다.
    _meta: { "anthropic/maxResultSizeChars": 100000 },
  },
  listModels: {
    description:
      "ERD 모델 목록을 돌려준다(모델 ID·모듈·스키마·이름·rev·DRAFT 버전·소유자, 그리고 상태(status)·최신 확정본 버전·만든 사람). " +
      "확정 칸: 버전이면 그 버전, '확정 없음' 이면 확정본이 없고, '확인 불가' 면 서버가 그 칸을 주지 않은 것이다(없다는 뜻이 아니다). " +
      "어떤 모델이 있는지 모를 때 먼저 부른다. 모델 ID 가 다른 도구의 modelId 다. 모델 삭제는 이 서버에 없다.",
    inputSchema: {},
  },
  listDiagrams: {
    description:
      "한 모델의 다이어그램 목록(id·업무영역/이름·표 수·관계 경유점 수)을 돌려준다. 이름 바꾸기·지우기·복사 apply 명령이 가리킬 다이어그램을 찾을 때 부른다. " +
      "모델 전체를 읽으므로 큰 모델은 조금 걸린다.",
    inputSchema: { modelId },
  },
  registerModel: {
    description:
      "새 ERD 모델을 등록한다(빈 DRAFT 1.000, 소유자는 ERD_USER, rev 는 새 모델이면 0 이고 지운 모델을 다시 등록하면 이어진다). 시험 실행이 없고 MCP 로 모델을 지울 수도 없으니, 사용자가 등록을 요청했을 때만 부른다. " +
      "modelId 를 빼면 moduleId 와 같다(모듈 하나 = 모델 하나). 같은 modelId 가 있거나 같은 모듈의 모델이 이미 있으면 거절된다. 등록 뒤 DB 스키마의 표를 가져오려면 importModel 을 부른다.",
    inputSchema: {
      moduleId: z.string().min(1).max(20).describe("모듈 ID(예: mes)"),
      schemaName: z.string().min(1).max(128).describe("Oracle 스키마 이름. 서버가 대문자로 바꾼다"),
      modelName: z.string().min(1).max(200).describe("모델 이름"),
      modelId: z.string().min(1).max(50).optional().describe("ERD 모델 ID. 빼면 moduleId"),
    },
  },
  importModel: {
    description:
      "모델에 등록된 DB 스키마에서 표·컬럼·키·관계를 한 번에 가져온다(첫 가져오기, kind=FROM_DB) — 저장 전 시험 실행이 없고 바로 반영한다. " +
      "결과에 가져온 표·컬럼·키 수와 관계 상태별 수, 새 다이어그램 id, 경고가 나온다. 이미 가져온 모델의 다시 가져오기·차이 반영은 사람이 화면 DB 차이 탭에서 한다(getDbDiff 로 차이만 본다). " +
      "baseRev 를 빼면 지금 rev 를 읽어 쓴다.",
    inputSchema: { modelId, baseRev: baseRev.optional() },
  },
  getCurrentView: {
    description:
      "사용자가 m-mdm ERD 화면에서 보고 있는 다이어그램과 선택한 표(물리명·논리명)를 세션마다 돌려준다(그 다이어그램의 관계 경유점이 있으면 '경유점 업무영역/이름 n개:' 아래 '  자식표.컬럼 > 부모표.컬럼: (x,y) → …' 줄로 덧붙는다(다이어그램마다 한 번, 50줄까지)). 순서 1단계: 사용자가 '이 표', '선택한 표' 라고 하면 먼저 부른다.",
    inputSchema: { modelId, session: z.string().min(1).optional().describe("화면 세션 이름. 주지 않으면 화면 세션 전부") },
  },
  getChangesSince: {
    description:
      "rev 이후의 변경을 이름(표·표.컬럼·관계 글)과 바뀐 속성으로 요약한다. 순서 4단계: CONFLICT 를 받았거나 오래 쉬었으면 부른다. " +
      `결과는 ${WRITE_TEXT_LIMIT}자를 넘지 않는다. 넘치면 끝에 이어 읽을 rev 를 적는다. 마지막 줄의 rev 가 다음 baseRev 다. ` +
      "reload 가 오면 getModelText 로 다시 읽는다. 원래 JSON 은 raw=true 일 때만 붙는다.",
    inputSchema: {
      modelId,
      rev: z.number().int().min(0).describe("마지막으로 본 rev"),
      session: z.string().min(1).optional().describe("이 세션의 변경만 본다"),
      excludeMine: z.boolean().optional().describe("내 세션(이 MCP 서버)의 변경을 뺀다"),
      tables: z
        .union([z.array(z.string().min(1)).min(1), z.string().min(1)])
        .optional()
        .describe("이 표를 건드린 변경만 본다. 끝이 * 면 접두사"),
      raw: z.boolean().optional().describe("요약 뒤에 변경 JSON 을 붙인다(상한 안에서)"),
    },
  },
  listViolations: {
    description:
      "표준 상태가 OK·ALIAS 가 아닌 컬럼(NEW 사전에 없는 새 이름, TYPE 같은 이름 다른 타입, DOMAIN 도메인과 다른 타입, MISS 사전에 없는 토막)을 돌려준다. 모델을 읽은 뒤(순서 1단계 다음) 부른다.",
    inputSchema: { modelId, status: z.enum(["NEW", "TYPE", "DOMAIN", "MISS"]).optional().describe("이 상태만 본다") },
  },
  listInferredRelations: {
    description:
      "사람이 확정·기각할 추정(INFERRED) 관계를 관계 id·근거·후보 순위와 함께 돌려준다. 허브 컬럼의 2순위 이하 후보는 includeFolded=true 일 때만 나온다. 확정·기각은 confirmRelation·rejectRelation 이다.",
    inputSchema: { modelId, includeFolded: z.boolean().optional().describe("접힌 후보(candidateRank 2 이상)도 볼지") },
  },
  getDbDiff: {
    description:
      "DB 딕셔너리와 모델의 차이(표·컬럼 추가·사라짐·타입 변경, FK 추가·사라짐)를 돌려준다. 읽기만 한다. 반영은 사람이 m-mdm ERD 화면의 DB 차이 탭에서 골라 한다.",
    inputSchema: { modelId },
  },
  apply: {
    description:
      "모델·다이어그램 명령 묶음을 한 번에 반영한다(모두 반영 또는 모두 거절). 순서 3단계. " +
      "명령 예: {\"op\":\"updateColumn\",\"id\":\"TB_X.COL\",\"set\":{\"logical\":\"…\"}}, {\"op\":\"addColumn\",\"table\":\"TB_X\",\"logical\":\"사용여부\"}, " +
      "{\"op\":\"addRelation\",\"child\":\"TB_C\",\"parent\":\"TB_P\",\"pairs\":[[\"TB_C.P_ID\",\"TB_P.P_ID\"]],\"identifying\":false}, {\"op\":\"moveNodes\",\"diagram\":\"업무영역/이름\",\"nodes\":[{\"table\":\"TB_X\",\"x\":0,\"y\":0}]}, " +
      "{\"op\":\"setRoute\",\"diagram\":\"업무영역/이름\",\"relation\":\"TB_C.P_ID > TB_P.P_ID\",\"points\":[{\"x\":120,\"y\":40},{\"x\":120,\"y\":200}]}(관계 선이 지나갈 경유점 1~50개, 캔버스 절대 좌표), {\"op\":\"clearRoutes\",\"diagram\":\"업무영역/이름\",\"relations\":[\"TB_C.P_ID > TB_P.P_ID\"]}(경유점 지우기). " +
      "다이어그램: {\"op\":\"updateDiagram\",\"id\":\"업무영역/이름\",\"set\":{\"diagramName\":\"새 이름\",\"areaName\":\"새 업무영역\"}}(이름 바꾸기), {\"op\":\"deleteDiagram\",\"id\":\"업무영역/이름\"}(지우기), " +
      "{\"op\":\"copyDiagram\",\"from\":\"업무영역/이름\",\"areaName\":\"…\",\"diagramName\":\"…\"}(노드 위치·접기와 경유점까지 복사, 새 id 는 \"id\":\"d-…\" 로 줄 수 있고 빼면 만든다). 다이어그램 목록은 listDiagrams. " +
      "요소는 id 대신 이름으로 써도 된다: 표 = 물리명, 컬럼 = '표.컬럼', 관계 = '자식표.컬럼 > 부모표.컬럼', 키 = 키 이름 또는 '표:PK', 다이어그램 = '업무영역/이름'. " +
      "같은 묶음에서 앞에서 만든 표·컬럼·관계는 뒤 명령이 이름(물리명, '표.컬럼', '자식표.컬럼 > 부모표.컬럼')으로 가리킬 수 있다. " +
      "addTable 은 감사 컬럼 8개(C_USR_ID C_AT C_SVC_ID C_PGM_ID U_USR_ID U_AT U_SVC_ID U_PGM_ID)를 표 끝에 자동으로 붙인다(끄려면 audit:false, 가져오기는 붙이지 않는다). " +
      "position 없는 addColumn·끝으로 가는 moveColumn 은 표 끝이 감사 컬럼 블록이면 그 블록 바로 앞에 넣는다(넣는 컬럼이 감사 컬럼이면 맨 끝. 컬럼 수 이상의 position 도 끝으로 보고, 안쪽 position 은 그대로). " +
      "결과 끝의 '다음 baseRev' 를 다음 apply 에 쓴다. " +
      "거절(CONFLICT·NOT_FOUND·INVALID·BAD_COMMAND·NEEDS_CHOICE·NOT_EDITOR)은 오류 결과이고 '다음:' 줄에 할 일이 있다. BAD_COMMAND = 명령 JSON 형식 오류 또는 서버가 모르는 op(서버가 옛 버전이면 다시 띄운다). dryRun=true 면 저장하지 않고 판정만 본다.",
    inputSchema: {
      modelId,
      baseRev,
      commands: z
        .union([z.array(z.looseObject({ op: z.string().min(1) })).min(1).max(MAX_COMMANDS), z.string().min(2)])
        .describe(`명령 객체 배열(1~${MAX_COMMANDS}개). JSON 배열 글도 받는다`),
      dryRun: z.boolean().optional().describe("true 면 서버가 판정만 하고 저장하지 않는다(rev 그대로)"),
    },
  },
  confirmRelation: {
    description: "추정·기각 관계를 확정한다(apply 의 confirmRelation 명령 하나). 결과는 apply 와 같다.",
    inputSchema: { modelId, baseRev, relation },
  },
  rejectRelation: {
    description: "추정 관계를 기각한다(apply 의 rejectRelation 명령 하나). 결과는 apply 와 같다.",
    inputSchema: { modelId, baseRev, relation },
  },
  undo: {
    description:
      "rev 하나의 변경을 되돌린다. rev 를 빼면 이 세션이 마지막으로 반영한 rev 다. 결과에 누구의 몇 rev 를 되돌렸는지 적는다. " +
      "그 뒤 같은 속성을 다른 변경이 바꿨으면 CONFLICT, 이미 되돌렸으면 INVALID 다.",
    inputSchema: {
      modelId,
      rev: z.number().int().min(1).optional().describe("되돌릴 rev. 빼면 이 세션의 마지막 반영"),
      dryRun: z.boolean().optional().describe("true 면 판정만 하고 되돌리지 않는다"),
    },
  },
  claimTable: {
    description:
      "작업할 표에 작업 중 표시를 한다(순서 2단계). 표마다 잡음 또는 쥔 세션(사용자)·만료 시각을 돌려준다. 못 잡아도 오류가 아니다. 표시는 600초 뒤 저절로 풀린다.",
    inputSchema: { modelId, tables: tableNames },
  },
  releaseTable: {
    description: "작업 중 표시를 푼다(순서 5단계). tables 를 빼면 이 세션이 잡은 표 전부를 푼다.",
    inputSchema: { modelId, tables: tableNames.optional() },
  },
};

const ok = (...texts) => ({ content: texts.map((text) => ({ type: "text", text })) });
const fromFlow = (r) => ({ ...(r.isError ? { isError: true } : {}), content: [{ type: "text", text: r.text }] });

/** 서버가 kind 를 모르는 옛 응답을 돌려줬다. 빈 결과로 오해하지 않게 오류로 올린다. */
export class UnsupportedResponseError extends Error {
  constructor(what) {
    super(`${what} 응답 모양이 다릅니다. MDM 서버가 이 kind 를 아직 지원하지 않을 수 있습니다.\n다음: 서버가 단계 1 백엔드(Task 5)를 포함해 떠 있는지 확인한 뒤 다시 부르세요.`);
    this.name = "UnsupportedResponseError";
  }
}

const needStatus = (st) => {
  if (!st || typeof st.statuses !== "object" || st.statuses === null) throw new UnsupportedResponseError("view kind=STATUS");
  return st;
};
const needDiff = (diff) => {
  if (!diff || !Array.isArray(diff.items)) throw new UnsupportedResponseError("compare kind=DB_DIFF");
  return diff;
};

/** 도구 처리기. OASIS 오류는 던지고 createErdServer 가 isError 결과로 바꾼다. state 는 프로세스 동안 하나다. */
export function handlers(client, state = newState()) {
  return {
    async listModels() {
      return fromFlow(await listModelsFlow(client));
    },
    async listDiagrams({ modelId }) {
      return fromFlow(await listDiagramsFlow(client, { modelId }));
    },
    async registerModel({ modelId, moduleId, schemaName, modelName }) {
      return fromFlow(await registerFlow(client, { modelId, moduleId, schemaName, modelName }));
    },
    async importModel({ modelId, baseRev }) {
      return fromFlow(await importFlow(client, { modelId, baseRev }));
    },
    async getModelText({ modelId, diagram, tables, audit }) {
      const view = await client.call("view", { modelId });
      const status = needStatus(await client.call("view", { modelId, kind: "STATUS", ver: view.ver }));
      return ok(getModelText(view, status, { diagram, tables, audit: audit === true }));
    },
    async getCurrentView({ modelId, session }) {
      return ok(formatCurrentView(await client.call("view", { modelId }), { session }));
    },
    async getChangesSince({ modelId, rev, session, excludeMine, tables, raw }) {
      const r = await changesFlow(client, { modelId, rev, session, excludeMine, tables, raw });
      return r.raw ? ok(r.text, r.raw) : ok(r.text);
    },
    async listViolations({ modelId, status }) {
      const view = await client.call("view", { modelId });
      const st = needStatus(await client.call("view", { modelId, kind: "STATUS", ver: view.ver }));
      return ok(formatViolations(view, st, { only: status }));
    },
    async listInferredRelations({ modelId, includeFolded }) {
      return ok(formatInferred(await client.call("view", { modelId }), { includeFolded }));
    },
    async getDbDiff({ modelId }) {
      return ok(formatDbDiff(needDiff(await client.call("compare", { modelId, kind: "DB_DIFF" }))));
    },
    async apply({ modelId, baseRev, commands, dryRun }) {
      return fromFlow(await applyFlow(client, state, { modelId, baseRev, commands, dryRun: dryRun === true }));
    },
    async confirmRelation({ modelId, baseRev, relation }) {
      return fromFlow(await applyFlow(client, state, { modelId, baseRev, commands: [{ op: "confirmRelation", id: relation }] }));
    },
    async rejectRelation({ modelId, baseRev, relation }) {
      return fromFlow(await applyFlow(client, state, { modelId, baseRev, commands: [{ op: "rejectRelation", id: relation }] }));
    },
    async undo({ modelId, rev, dryRun }) {
      return fromFlow(await undoFlow(client, state, { modelId, rev, dryRun: dryRun === true }));
    },
    async claimTable({ modelId, tables }) {
      return fromFlow(await claimFlow(client, state, { modelId, tables }));
    },
    async releaseTable({ modelId, tables }) {
      return fromFlow(await releaseFlow(client, state, { modelId, tables }));
    },
  };
}

export function createErdServer(client, state = newState()) {
  const server = new McpServer({ name: "erd", version: "0.2.0" }, { instructions: instructions(client.config.session) });
  const h = handlers(client, state);
  for (const [name, def] of Object.entries(TOOLS)) {
    server.registerTool(name, def, async (args) => {
      try {
        return await h[name](args);
      } catch (e) {
        const text =
          e instanceof UnsupportedResponseError
            ? e.message
            : e instanceof InputError
              ? `${e.message}\n다음: 입력을 고쳐 다시 부르세요.`
              : describeError(e, client.config);
        return { isError: true, content: [{ type: "text", text }] };
      }
    });
  }
  return server;
}

async function main() {
  const config = configFromEnv(process.env, { kind: "mcp" });
  const state = newState();
  const server = createErdServer(createOasisClient(config), state);
  await server.connect(new StdioServerTransport());
  console.error(`erd-mcp 시작: ${config.base} · 사용자 ${config.user} · 역할 ${config.role} · 세션 ${config.session}`);
  // 종료(표준 입력 닫힘·SIGTERM·SIGINT) 때 이 프로세스가 잡은 표를 놓아 본다. 실패해도 600초 뒤 만료된다. 한 번만 돈다(n 은 놓아 본 수이며 성공 수가 아니다).
  let stopping = false;
  const stop = async (why) => {
    if (stopping) return;
    stopping = true;
    const n = await releaseAll(createOasisClient({ ...config, timeoutMs: RELEASE_TIMEOUT_MS }), state).catch(() => 0);
    if (n) console.error(`erd-mcp 종료(${why}): 잡은 표 ${n}개를 놓아 봤다`);
    process.exit(0);
  };
  process.stdin.on("end", () => void stop("stdin 닫힘"));
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((e) => {
    console.error(`erd-mcp 시작 실패: ${e?.stack ?? e}`);
    process.exitCode = 1;
  });
}
