#!/usr/bin/env node
// ERD 모델 CLI(스펙 2.3 "CLI 기본 dry-run", README S2-23). MCP 도구와 같은 흐름(lib/flows.mjs)을 셸에서 부른다.
// MCP SDK·zod 를 import 하지 않는다 — pnpm install 없이 돈다(단계 1 S16 예외는 erd-mcp.mjs 만).
// 쓰기(apply·confirm·reject·undo)의 기본은 서버 시험 실행(dryRun)이다. --apply 를 줄 때만 저장하고, 그때는 --user 나 ERD_USER 가 있어야 한다.
// 작업 중 표시(claim·release)는 모델을 바꾸지 않으므로 --apply 없이 보낸다.
// 종료 코드: 0 = 반영·시험 통과·읽기 성공, 1 = 거절·실패, 2 = 사용 오류. 사용 안내는 --help.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { applyFlow, changesFlow, claimFlow, InputError, newState, releaseFlow, undoFlow } from "./lib/flows.mjs";
import { deleteModelFlow, diagramCommand, importFlow, listDiagramsFlow, listModelsFlow, registerFlow } from "./lib/models.mjs";
import { formatDbDiff, formatInferred, formatViolations, getModelText } from "./lib/model-text.mjs";
import { configFromEnv, createOasisClient, describeError } from "./lib/oasis.mjs";

export const USAGE = `사용: node scripts/erd/erd-cli.mjs <명령> --model mcm [옵션]
  models                                     모델 목록(search: 상태·확정본 버전·만든 사람 포함)
  diagrams  --model M                        다이어그램 목록(id·업무영역/이름·표 수·경유점 수)
  text      [--tables A,B*] [--diagram D] [--audit]   getModelText 와 같은 글(감사 컬럼 8개는 표마다 한 줄로 접는다. --audit 이면 펼친다. --diagram 이면 관계 경유점이 Ref 줄 아래 "  via (x,y) → (x,y)" 로 붙는다)
  changes   --since R [--session S]          getChangesSince 와 같은 글. 여기의 --session 은 "그 세션의 변경만" 거르기다
  violations [--status NEW|TYPE|DOMAIN|MISS]
  inferred  [--include-folded]
  db-diff
  apply     --file batch.json|- [--base-rev R] [--apply]
  confirm|reject <관계> --base-rev R [--apply]
  undo      [--rev R] [--apply]
  claim|release <표>...                      (--apply 없이 보낸다)
  diagram-rename <다이어그램> --base-rev R [--name 새이름] [--area 새업무영역] [--apply]
  diagram-delete <다이어그램> --base-rev R [--apply]
  diagram-copy   <다이어그램> --base-rev R [--name 새이름] [--area 업무영역] [--id d-새id] [--apply]
                                             (다이어그램은 d- id·"업무영역/이름"·이름. 복사 기본 이름은 「<이름> 복사」, 업무영역은 원본과 같다. 노드·꺾임점도 함께 복사한다)
  register  --module M --schema S --name N [--model ID] [--apply]   모델 등록(reg). --model 을 빼면 모듈 이름. 모듈 하나에 모델 하나만 된다. --apply 없으면 reg 를 보내지 않는다
  import    --model M [--base-rev R] [--apply]   DB 스키마에서 표·관계 첫 가져오기(import FROM_DB). 표가 없는 모델에만 된다. --apply 없으면 import 를 보내지 않는다
  delete-model --model M --yes               모델 완전 삭제(delete kind=MODEL). 되돌릴 수 없다. --yes 가 없으면 거절한다
공통: --base URL --user ID --role R --client-key K --session S --json

묶음 파일: {"modelId":"mcm","baseRev":212,"commands":[...]} 또는 명령 배열(이때 --base-rev 필수). --file - 는 표준 입력이다.
  명령 모양은 MCP apply 와 같다. 요소는 id 나 이름(표 물리명, "표.컬럼", "자식표.컬럼 > 부모표.컬럼", "표:PK", "업무영역/이름")으로 쓴다.
  addTable 은 감사 컬럼 8개(C_USR_ID C_AT C_SVC_ID C_PGM_ID U_USR_ID U_AT U_SVC_ID U_PGM_ID)를 표 끝에 자동으로 붙인다. 끄려면 "audit":false 를 준다.
  관계 경유점: {"op":"setRoute","diagram":"업무영역/이름","relation":"자식표.컬럼 > 부모표.컬럼","points":[{"x":120,"y":40},{"x":120,"y":200}]}(1~50개, 캔버스 절대 좌표)
  지우기: {"op":"clearRoutes","diagram":"업무영역/이름","relations":["자식표.컬럼 > 부모표.컬럼"]}. 같은 묶음에서 addRelation 으로 만든 관계도 글로 가리킬 수 있다.
  baseRev 는 마지막으로 읽은 rev 다(text 머리줄, changes 끝 줄, 마지막 --apply 결과). 더 큰 rev 를 짐작하지 않는다.
쓰기(apply·confirm·reject·undo·diagram-*)의 기본은 서버 시험 실행(dryRun)이다. 서버가 잠금·편집자·충돌·표준 검사를 모두 하고 저장하지 않는다.
  register·import 는 서버에 시험 실행이 없다. --apply 가 없으면 reg·import 는 보내지 않고, 읽기(search·view)로 겹침·표 유무만 확인해 "시험 실행: 서버에 보내지 않음, --apply 로 실행" 을 낸다
    (겹치거나 표가 있어 실제로는 거절될 것이면 종료 1). 이 경우 종료 0 은 "겹침이 없다" 일 뿐 서버 검사를 통과했다는 뜻이 아니다.
모델 삭제(delete-model)는 되돌릴 수 없다: 모든 버전·다이어그램·경유점·명령 기록이 지워진다. 권한은 서버가 가린다(관리자 = MDM_STD_ADMIN 또는 SYSADMIN 이면 항상, 아니면 RELEASED·REQUESTED·APPROVED 버전이 하나도 없고 DRAFT 소유자일 때만).
  --yes 와 --user(또는 ERD_USER)가 둘 다 있어야 보낸다. 먼저 models 로 지울 모델을 확인한다.
  시험 실행도 서버가 편집자 검사를 한다. ERD_USER(또는 --user)가 그 DRAFT 의 소유자나 공동 편집자여야 "통과" 가 나온다.
  기본 사용자 erd-mcp 로 돌리면 NOT_EDITOR 거절이다.
--apply 는 저장한다(register·import 는 실행한다). --user 나 ERD_USER 를 꼭 준다(명령 기록에 남고, 권한을 그 사용자로 판정한다).
세션 이름: --session > ERD_SESSION(비어 있지 않고 auto 가 아니면) > cli-<사용자>. 충돌은 세션 이름으로 가린다.
환경변수: ERD_BASE(기본 http://localhost:8096) ERD_USER(기본 erd-mcp) ERD_ROLE(기본 MDM_STEWARD) BACKEND_CLIENT_KEY ERD_SESSION
종료 코드: 0 = 반영·시험 통과·읽기 성공, 1 = 거절·실패, 2 = 사용 오류. --json 은 서버 결과 JSON 을 그대로 낸다.
윈도우 콘솔에서 한글이 깨지면 chcp 65001 을 먼저 한다.`;

/** 인자가 틀렸다. 종료 코드 2. */
export class UsageError extends Error {
  /** bare 이면 사용 안내(USAGE)를 덧붙이지 않는다(delete-model 거절처럼 설명이 안내를 대신할 때). */
  constructor(message, { bare = false } = {}) {
    super(message);
    this.name = "UsageError";
    this.bare = bare;
  }
}

const VALUE_OPTS = {
  "--model": "model", "--tables": "tables", "--diagram": "diagram", "--since": "since", "--status": "status",
  "--file": "file", "--base-rev": "baseRev", "--rev": "rev", "--base": "base", "--user": "user", "--role": "role",
  "--client-key": "clientKey", "--session": "session",
  "--module": "module", "--schema": "schema", "--name": "name", "--area": "area", "--id": "id",
};
const COMMANDS = [
  "models", "diagrams", "text", "changes", "violations", "inferred", "db-diff", "apply", "confirm", "reject", "undo", "claim", "release",
  "diagram-rename", "diagram-delete", "diagram-copy", "register", "import", "delete-model",
];
const WRITES = new Set(["apply", "confirm", "reject", "undo"]);
/** apply 로 명령 하나를 보내는 얇은 다이어그램 명령. */
const DIAGRAM_WRITES = new Set(["diagram-rename", "diagram-delete", "diagram-copy"]);
/** --apply 를 받는 명령: 서버 시험 실행이 있는 것(WRITES·DIAGRAM_WRITES)과 실행 여부만 가르는 것(register·import). */
const APPLYING = new Set([...WRITES, ...DIAGRAM_WRITES, "register", "import"]);
/** 특정 명령에만 쓰는 값 옵션. */
const ONLY_FOR = {
  module: ["register"], schema: ["register"], name: ["diagram-rename", "diagram-copy", "register"], area: ["diagram-rename", "diagram-copy"], id: ["diagram-copy"],
};
const STATUSES = new Set(["NEW", "TYPE", "DOMAIN", "MISS"]);

/** argv → 옵션. 손으로 짠 고리다(node 18 의 내장 인자 해석기는 안정판이 아니다. scripts/mdm-meta/register-columns.mjs 선례). */
export function readArgs(argv) {
  const opt = { cmd: null, pos: [], apply: false, json: false, includeFolded: false, audit: false, yes: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (Object.hasOwn(VALUE_OPTS, a)) {
      // 뒤가 또 다른 옵션이면 값이 없는 것이다(--file --apply 가 파일 이름 "--apply" 가 되지 않는다). "-" 는 값이다.
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new UsageError(`${a} 에 값이 없습니다`);
      opt[VALUE_OPTS[a]] = argv[++i];
    } else if (a === "--apply") opt.apply = true;
    else if (a === "--json") opt.json = true;
    else if (a === "--include-folded") opt.includeFolded = true;
    else if (a === "--audit") opt.audit = true;
    else if (a === "--yes") opt.yes = true;
    else if (a === "-h" || a === "--help") opt.help = true;
    else if (a.startsWith("--")) throw new UsageError(`알 수 없는 인자: ${a}`);
    else if (opt.cmd === null) opt.cmd = a;
    else opt.pos.push(a);
  }
  return opt;
}

function count(v, name, min = 0) {
  if (!/^\d+$/.test(String(v)) || Number(v) < min) throw new UsageError(`${name} 는 ${min} 이상의 정수입니다: ${v}`);
  return Number(v);
}

/** 서버를 부르기 전에 볼 수 있는 사용 오류. */
export function checkArgs(opt, env) {
  if (opt.help) return;
  if (opt.cmd === null) throw new UsageError("명령을 주세요");
  if (!COMMANDS.includes(opt.cmd)) throw new UsageError(`모르는 명령: ${opt.cmd}`);
  const c = opt.cmd;
  if (c !== "models" && c !== "apply" && c !== "register" && !opt.model) throw new UsageError("--model 이 필요합니다");
  if (opt.audit && c !== "text") throw new UsageError("--audit 는 text 에만 씁니다");
  if (opt.yes && c !== "delete-model") throw new UsageError("--yes 는 delete-model 에만 씁니다");
  for (const [key, cmds] of Object.entries(ONLY_FOR)) {
    if (opt[key] !== undefined && !cmds.includes(c)) throw new UsageError(`--${key} 은 ${cmds.join("·")} 에만 씁니다`);
  }
  if (opt.apply && !APPLYING.has(c)) {
    throw new UsageError(
      `--apply 는 쓰기 명령(apply·confirm·reject·undo·diagram-rename·diagram-delete·diagram-copy·register·import)에만 씁니다(${
        c === "claim" || c === "release" ? "작업 중 표시는 모델을 바꾸지 않아 --apply 없이 보낸다" : c === "delete-model" ? "delete-model 은 --yes 로 실행한다" : `${c} 는 읽기다`
      })`,
    );
  }
  if (c === "delete-model" && !opt.yes) {
    throw new UsageError(
      `delete-model 은 --yes 를 줘야 합니다. 모델 ${opt.model} 의 모든 버전·다이어그램·관계 경유점·명령 기록을 완전히 지우며 되돌릴 수 없습니다.\n` +
        "정말 지우려면 같은 명령에 --yes 를 붙이세요. 먼저 models 로 지울 모델을 확인하세요.",
      { bare: true },
    );
  }
  if ((opt.apply || opt.yes) && !(opt.user || env.ERD_USER)) {
    throw new UsageError(`${opt.yes ? "--yes" : "--apply"} 에는 --user 나 ERD_USER(명령 기록에 남고 권한을 판정할 사용자)가 필요합니다`);
  }
  const positional = c === "confirm" || c === "reject" ? 1 : c === "claim" || c === "release" ? -1 : DIAGRAM_WRITES.has(c) ? 2 : 0;
  if (positional === 1 && opt.pos.length !== 1) throw new UsageError(`${c} 에는 관계 하나가 필요합니다(r- id 또는 "자식표.컬럼 > 부모표.컬럼")`);
  if (positional === 2 && opt.pos.length !== 1) throw new UsageError(`${c} 에는 다이어그램 하나가 필요합니다(d- id 또는 "업무영역/이름", 이름이 유일하면 이름)`);
  if (positional === -1 && opt.pos.length === 0) throw new UsageError(`${c} 에는 표가 하나 이상 필요합니다(물리명 또는 t- id)`);
  if (positional === 0 && opt.pos.length) throw new UsageError(`알 수 없는 인자: ${opt.pos[0]}`);
  if (c === "register") {
    for (const [key, flag] of [["module", "--module"], ["schema", "--schema"], ["name", "--name"]]) {
      if (!opt[key]) throw new UsageError(`register 에는 ${flag} 값이 필요합니다(${{ module: "모듈 이름", schema: "Oracle 스키마 이름", name: "모델 이름" }[key]})`);
    }
  }
  if (c === "diagram-rename" && opt.name === undefined && opt.area === undefined) throw new UsageError("diagram-rename 에는 --name(새 이름)이나 --area(새 업무영역)가 필요합니다");
  if (opt.id !== undefined && !/^d-[0-9a-zA-Z-]{1,48}$/.test(opt.id)) throw new UsageError(`--id 는 d- 로 시작하는 새 다이어그램 id 입니다(빼면 만든다): ${opt.id}`);
  if (c === "apply" && !opt.file) throw new UsageError("apply 에는 --file 이 필요합니다(표준 입력은 --file -)");
  if (c === "changes") count(opt.since ?? "", "--since");
  if ((c === "confirm" || c === "reject" || DIAGRAM_WRITES.has(c)) && opt.baseRev === undefined) throw new UsageError(`${c} 에는 --base-rev 가 필요합니다`);
  if (opt.baseRev !== undefined) count(opt.baseRev, "--base-rev");
  if (opt.rev !== undefined) count(opt.rev, "--rev", 1);
  if (opt.status !== undefined && !STATUSES.has(opt.status)) throw new UsageError(`--status 는 NEW·TYPE·DOMAIN·MISS 중 하나입니다: ${opt.status}`);
}

/** 묶음 파일 → { modelId, baseRev, commands }. 객체({modelId, baseRev, commands}) 또는 명령 배열(--base-rev 필수). */
export function readBatch(opt, readStdin) {
  let text;
  try {
    text = opt.file === "-" ? readStdin() : readFileSync(opt.file, "utf8");
  } catch (e) {
    throw new UsageError(`묶음 파일을 읽을 수 없습니다(${opt.file}): ${e.code ?? e.message}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new UsageError(`묶음 파일이 JSON 이 아닙니다(${opt.file}): ${e.message}`);
  }
  const bare = Array.isArray(data);
  const commands = bare ? data : data?.commands;
  if (!Array.isArray(commands)) throw new UsageError('묶음은 {"modelId","baseRev","commands":[...]} 또는 명령 배열이어야 합니다');
  const fileModel = bare ? undefined : data.modelId;
  if (opt.model && fileModel && opt.model !== fileModel) throw new UsageError(`--model(${opt.model})과 묶음의 modelId(${fileModel})가 다릅니다`);
  const modelId = opt.model ?? fileModel;
  if (!modelId) throw new UsageError("--model 이나 묶음의 modelId 가 필요합니다");
  let baseRev = opt.baseRev !== undefined ? Number(opt.baseRev) : bare ? undefined : data.baseRev;
  if (baseRev === undefined || baseRev === null) {
    throw new UsageError(bare ? "명령 배열만 준 묶음은 --base-rev 가 필요합니다" : "묶음에 baseRev 가 없습니다. --base-rev 로 주세요");
  }
  baseRev = count(baseRev, "baseRev");
  return { modelId, baseRev, commands };
}

const needStatus = (st) => {
  if (!st || typeof st.statuses !== "object" || st.statuses === null) {
    throw new Error("view kind=STATUS 응답 모양이 다릅니다. MDM 서버가 단계 1 백엔드를 포함해 떠 있는지 확인하세요.");
  }
  return st;
};

/** 명령마다: (client, opt, io) → { text, json, isError }. */
const RUN = {
  async models(client) {
    const r = await listModelsFlow(client);
    return { text: r.text, json: r.result, isError: false };
  },
  async diagrams(client, opt) {
    const r = await listDiagramsFlow(client, { modelId: opt.model });
    return { text: r.text, json: r.result, isError: false };
  },
  async "diagram-rename"(client, opt) {
    return diagramWrite(client, opt, "rename");
  },
  async "diagram-delete"(client, opt) {
    return diagramWrite(client, opt, "delete");
  },
  async "diagram-copy"(client, opt) {
    return diagramWrite(client, opt, "copy");
  },
  async register(client, opt) {
    return plan(await registerFlow(client, { modelId: opt.model, moduleId: opt.module, schemaName: opt.schema, modelName: opt.name, dryRun: !opt.apply }));
  },
  async import(client, opt) {
    return plan(await importFlow(client, { modelId: opt.model, baseRev: opt.baseRev === undefined ? undefined : Number(opt.baseRev), dryRun: !opt.apply }));
  },
  async "delete-model"(client, opt, io) {
    return plan(await deleteModelFlow(client, { modelId: opt.model, warn: (t) => io.stderr.write(`${t}\n`) }));
  },
  async text(client, opt) {
    const view = await client.call("view", { modelId: opt.model });
    const status = needStatus(await client.call("view", { modelId: opt.model, kind: "STATUS", ver: view.ver }));
    return { text: getModelText(view, status, { tables: opt.tables, diagram: opt.diagram, audit: opt.audit === true }), json: { view, status }, isError: false };
  },
  async changes(client, opt) {
    const r = await changesFlow(client, { modelId: opt.model, rev: Number(opt.since), session: opt.session });
    return { text: r.text, json: r.result, isError: false };
  },
  async violations(client, opt) {
    const view = await client.call("view", { modelId: opt.model });
    const status = needStatus(await client.call("view", { modelId: opt.model, kind: "STATUS", ver: view.ver }));
    return { text: formatViolations(view, status, { only: opt.status }), json: status, isError: false };
  },
  async inferred(client, opt) {
    const view = await client.call("view", { modelId: opt.model });
    return { text: formatInferred(view, { includeFolded: opt.includeFolded }), json: view, isError: false };
  },
  async "db-diff"(client, opt) {
    const diff = await client.call("compare", { modelId: opt.model, kind: "DB_DIFF" });
    if (!diff || !Array.isArray(diff.items)) throw new Error("compare kind=DB_DIFF 응답 모양이 다릅니다.");
    return { text: formatDbDiff(diff), json: diff, isError: false };
  },
  async apply(client, opt, io) {
    return write(await applyFlow(client, newState(), { ...io.batch, dryRun: !opt.apply }));
  },
  async confirm(client, opt) {
    return write(await applyFlow(client, newState(), { modelId: opt.model, baseRev: Number(opt.baseRev), commands: [{ op: "confirmRelation", id: opt.pos[0] }], dryRun: !opt.apply }));
  },
  async reject(client, opt) {
    return write(await applyFlow(client, newState(), { modelId: opt.model, baseRev: Number(opt.baseRev), commands: [{ op: "rejectRelation", id: opt.pos[0] }], dryRun: !opt.apply }));
  },
  async undo(client, opt) {
    return write(await undoFlow(client, newState(), { modelId: opt.model, rev: opt.rev === undefined ? undefined : Number(opt.rev), dryRun: !opt.apply }));
  },
  async claim(client, opt) {
    return write(await claimFlow(client, newState(), { modelId: opt.model, tables: opt.pos }));
  },
  async release(client, opt) {
    return write(await releaseFlow(client, newState(), { modelId: opt.model, tables: opt.pos }));
  },
};

/** 다이어그램 이름 바꾸기·지우기·복사: view 로 이름을 풀어 명령 하나를 apply 흐름에 태운다(기본 시험 실행). */
async function diagramWrite(client, opt, kind) {
  // rename·delete 는 이름을 apply 흐름(resolveCommands)이 풀게 글 그대로 싣는다 — 모델 전체 view 를 두 번 읽지 않는다.
  // copy 는 기본 이름·업무영역(원본 기준)이 필요할 때만 먼저 읽는다.
  const view = kind === "copy" && (opt.name === undefined || opt.area === undefined) ? await client.call("view", { modelId: opt.model }) : null;
  const cmd = diagramCommand(view, kind, opt.pos[0], { name: opt.name, area: opt.area, id: opt.id });
  return write(await applyFlow(client, newState(), { modelId: opt.model, baseRev: Number(opt.baseRev), commands: [cmd], dryRun: !opt.apply }));
}

/** 모델 관리 흐름 결과 → 출력. 서버를 부르지 않은 시험 실행(result 없음)은 --json 에 dryRun 글을 싣는다. */
function plan(r) {
  return { text: r.text, json: r.result ?? (r.isError ? { error: r.text } : { dryRun: true, text: r.text }), isError: r.isError };
}

/** 흐름 결과 → 출력. 이름 풀기 실패처럼 서버 결과가 없으면 --json 도 글을 error 로 싣는다. */
function write(r) {
  return { text: r.text, json: r.result ?? { error: r.text }, isError: r.isError };
}

function modeOf(opt) {
  if (opt.cmd === "register") return opt.apply ? "반영(--apply)" : "시험 실행(등록은 보내지 않음, 등록하려면 --apply)";
  if (opt.cmd === "import") return opt.apply ? "반영(--apply)" : "시험 실행(가져오기는 보내지 않음, 가져오려면 --apply)";
  if (opt.cmd === "delete-model") return "모델 완전 삭제(--yes, 되돌릴 수 없음)";
  if (WRITES.has(opt.cmd) || DIAGRAM_WRITES.has(opt.cmd)) return opt.apply ? "반영(--apply)" : "시험 실행(저장 안 함, 저장하려면 --apply)";
  if (opt.cmd === "claim" || opt.cmd === "release") return "작업 중 표시(모델을 바꾸지 않아 --apply 없이 보낸다)";
  return "읽기";
}

/** 옵션이 환경변수를 덮는다. */
function envOf(opt, env) {
  const out = { ...env };
  if (opt.base) out.ERD_BASE = opt.base;
  if (opt.user) out.ERD_USER = opt.user;
  if (opt.role) out.ERD_ROLE = opt.role;
  if (opt.clientKey) out.BACKEND_CLIENT_KEY = opt.clientKey;
  return out;
}

/** CLI 본체. 종료 코드를 돌려준다. 시험은 프로세스로 띄운다(tests/erd-cli.test.mjs). */
export async function run(argv, { env = process.env, stdout = process.stdout, stderr = process.stderr, readStdin = () => readFileSync(0, "utf8") } = {}) {
  const fail = (message, bare = false) => {
    stderr.write(bare ? `오류: ${message}\n` : `오류: ${message}\n\n${USAGE}\n`);
    return 2;
  };
  let opt;
  let config;
  let batch;
  try {
    opt = readArgs(argv);
    checkArgs(opt, env);
    if (opt.help) {
      stdout.write(`${USAGE}\n`);
      return 0;
    }
    // changes 의 --session 은 거르기다. 내 세션 이름은 ERD_SESSION 이나 cli-<사용자>.
    config = configFromEnv(envOf(opt, env), { kind: "cli", session: opt.cmd === "changes" ? undefined : opt.session });
    // 묶음 파일 오류는 모드 머리줄보다 먼저 낸다(사용 오류는 머리줄 없이 종료 코드 2).
    if (opt.cmd === "apply") batch = readBatch(opt, readStdin);
  } catch (e) {
    if (e instanceof UsageError || /세션 이름은/.test(e.message)) return fail(e.message, e.bare === true);
    throw e;
  }
  const client = createOasisClient(config);
  stderr.write(`erd-cli ${opt.cmd}: ${modeOf(opt)} · ${config.base} · 사용자 ${config.user} · 세션 ${config.session}\n`);
  try {
    const out = await RUN[opt.cmd](client, opt, { batch, stderr });
    stdout.write(`${opt.json ? JSON.stringify(out.json, null, 2) : out.text}\n`);
    return out.isError ? 1 : 0;
  } catch (e) {
    if (e instanceof UsageError || e instanceof InputError) return fail(e.message);
    stderr.write(`${describeError(e, config)}\n`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(`erd-cli 실패: ${e?.stack ?? e}`);
      process.exitCode = 1;
    },
  );
}
