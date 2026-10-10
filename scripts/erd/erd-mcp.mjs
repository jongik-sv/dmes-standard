#!/usr/bin/env node
// ERD 모델 읽기용 stdio MCP 서버(단계 1). MDM 서버 OASIS erdEdit 를 감싸기만 한다(스펙 2.3).
// stdout 은 MCP 프로토콜 전용이다. 로그는 stderr(console.error)로만 쓴다.
// 환경변수: ERD_BASE(기본 http://localhost:8096) · ERD_USER(erd-mcp) · ERD_ROLE(MDM_STEWARD)
//           · BACKEND_CLIENT_KEY(dmes-bff-local-client-key-2026) · ERD_SESSION(mcp-<ERD_USER>)
// 의존성: @modelcontextprotocol/sdk·zod(루트 package.json). 처음 한 번 저장소 루트에서 pnpm install 을 돌린다.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { configFromEnv, createOasisClient, describeError } from "./lib/oasis.mjs";
import { formatChanges, formatCurrentView, formatDbDiff, formatInferred, formatViolations, getModelText } from "./lib/model-text.mjs";

/** 스펙 4.6 "LLM 이 쓰는 순서". 단계 1 서버는 읽기 도구만 있다. */
export const INSTRUCTIONS = [
  "ERD 모델(모듈 하나 = 모델 하나, 예: mcm·mdm)을 읽는 서버다. 이 서버는 읽기만 한다.",
  "쓰는 순서:",
  "1. getCurrentView 로 사용자가 화면에서 보는 다이어그램과 선택한 표를 확인하거나, getModelText 로 모델을 읽는다.",
  "2. claimTable 로 작업할 표를 선언한다. (단계 2 에서 추가)",
  "3. apply 로 명령을 묶어 보낸다. (단계 2 에서 추가)",
  "4. CONFLICT 를 받으면 getChangesSince(rev) 로 최신 상태를 확인하고 다시 보낸다.",
  "5. 끝나면 releaseTable 로 선언을 푼다. 선언은 만료 시간이 지나면 저절로 풀린다. (단계 2 에서 추가)",
  "표준 위반은 listViolations, 사람이 확인할 추정 관계는 listInferredRelations, DB 와 모델의 차이는 getDbDiff 로 본다.",
].join("\n");

const modelId = z.string().min(1).max(50).describe("ERD 모델 ID. 모듈 이름과 같다(예: mcm, mdm)");

export const TOOLS = {
  getModelText: {
    description:
      "모델을 DBML 비슷한 텍스트로 읽는다. 컬럼 줄: 물리명 논리명 타입 [PK] [NN] [FK>부모표.부모컬럼(?=추정)] [도메인] [!표준상태]. " +
      "끝에 Ref 줄(관계 상태와 근거)이 붙는다. 순서 1단계: 화면 상태가 없으면 이 도구로 시작한다. diagram 을 주면 그 다이어그램의 표만 쓴다.",
    inputSchema: { modelId, diagram: z.string().min(1).optional().describe("다이어그램 id, 이름, 또는 '업무영역/이름'") },
  },
  getCurrentView: {
    description:
      "사용자가 m-mdm ERD 화면에서 보고 있는 다이어그램과 선택한 표(물리명·논리명)를 세션마다 돌려준다. 순서 1단계: 사용자가 '이 표', '선택한 표' 라고 하면 먼저 부른다.",
    inputSchema: { modelId, session: z.string().min(1).optional().describe("화면 세션 이름. 주지 않으면 화면 세션 전부") },
  },
  getChangesSince: {
    description:
      "rev 이후의 변경 목록을 요약 텍스트와 JSON 으로 돌려준다. 순서 4단계: CONFLICT 를 받았거나 오래 쉬었으면 부른다. reload 가 오면 getModelText 로 다시 읽는다.",
    inputSchema: { modelId, rev: z.number().int().min(0).describe("마지막으로 본 rev") },
  },
  listViolations: {
    description:
      "표준 상태가 OK·ALIAS 가 아닌 컬럼(NEW 사전에 없는 새 이름, TYPE 같은 이름 다른 타입, DOMAIN 도메인과 다른 타입, MISS 사전에 없는 토막)을 돌려준다. 모델을 읽은 뒤(순서 1단계 다음) 부른다.",
    inputSchema: { modelId, status: z.enum(["NEW", "TYPE", "DOMAIN", "MISS"]).optional().describe("이 상태만 본다") },
  },
  listInferredRelations: {
    description:
      "사람이 확정·기각할 추정(INFERRED) 관계를 관계 id·근거·후보 순위와 함께 돌려준다. 허브 컬럼의 2순위 이하 후보는 includeFolded=true 일 때만 나온다. 모델을 읽은 뒤(순서 1단계 다음) 부른다.",
    inputSchema: { modelId, includeFolded: z.boolean().optional().describe("접힌 후보(candidateRank 2 이상)도 볼지") },
  },
  getDbDiff: {
    description:
      "DB 딕셔너리와 모델의 차이(표·컬럼 추가·사라짐·타입 변경, FK 추가·사라짐)를 돌려준다. 읽기만 한다. 반영은 단계 2 에서 추가한다.",
    inputSchema: { modelId },
  },
};

const ok = (...texts) => ({ content: texts.map((text) => ({ type: "text", text })) });

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

/** 도구 처리기. OASIS 오류는 던지지 않고 isError 결과로 돌려준다. */
export function handlers(client) {
  return {
    async getModelText({ modelId, diagram }) {
      const view = await client.call("view", { modelId });
      const status = needStatus(await client.call("view", { modelId, kind: "STATUS", ver: view.ver }));
      return ok(getModelText(view, status, { diagram }));
    },
    async getCurrentView({ modelId, session }) {
      return ok(formatCurrentView(await client.call("view", { modelId }), { session }));
    },
    async getChangesSince({ modelId, rev }) {
      const changes = await client.call("view", { modelId, sinceRev: rev });
      return ok(formatChanges(changes, rev), JSON.stringify(changes));
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
  };
}

export function createErdServer(client) {
  const server = new McpServer({ name: "erd", version: "0.1.0" }, { instructions: INSTRUCTIONS });
  const h = handlers(client);
  for (const [name, def] of Object.entries(TOOLS)) {
    server.registerTool(name, def, async (args) => {
      try {
        return await h[name](args);
      } catch (e) {
        const text = e instanceof UnsupportedResponseError ? e.message : describeError(e, client.config);
        return { isError: true, content: [{ type: "text", text }] };
      }
    });
  }
  return server;
}

async function main() {
  const config = configFromEnv(process.env);
  const server = createErdServer(createOasisClient(config));
  await server.connect(new StdioServerTransport());
  console.error(`erd-mcp 시작: ${config.base} · 사용자 ${config.user} · 역할 ${config.role} · 세션 ${config.session}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((e) => {
    console.error(`erd-mcp 시작 실패: ${e?.stack ?? e}`);
    process.exitCode = 1;
  });
}
