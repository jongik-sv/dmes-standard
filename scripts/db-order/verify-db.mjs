#!/usr/bin/env node
// 열린 PDB 의 실제 컬럼 순서를 규칙 데이터(column-order.json)와 대조한다. 컬럼 속성·행 수 스냅숏도 낸다.
//   node scripts/db-order/verify-db.mjs <PDB> [--snapshot <file>]
// 출력: 스키마별 어긋난 표, 숨은(INVISIBLE) 컬럼, INVALID 객체, 함수 기반 인덱스 상태. 어긋나면 exit 1.
// --snapshot: 표마다 컬럼(이름·타입·길이·NULL·기본값, 이름 순)과 행 수를 JSON 으로 쓴다 — 재배치 전후 비교용(순서 무관).
// 컨테이너 sqlplus 를 쓴다(scripts/oracle/pdb.mjs 와 같은 환경 변수).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENGINE = process.env.DMES_ORA_ENGINE || (spawnSync("podman", ["--version"]).status === 0 ? "podman" : "docker");
const CONTAINER = process.env.DMES_ORA_CONTAINER || "oracle-26ai-free";
const SYS_PW = process.env.DMES_ORA_SYS_PASSWORD || "sys_password_123";

/** column-order.json 의 스키마 key → Oracle 사용자. */
export const OWNER = {
  mcmapuser: "MCMAPUSER", mcaapuser: "MCAAPUSER", mcm_backup: "MCM_BACKUP", mcm_source: "MCM_SOURCE", mdm: "MDMAPUSER",
  "aps-core": "APSAPUSER", mls: "MLSAPUSER", mpn: "MPNAPUSER", mpp: "MPPAPUSER", mqc: "MQCAPUSER", caravanuser: "CARAVANUSER", ifuser: "IFUSER",
};

function sqlplus(pdb, body) {
  const script = `whenever sqlerror exit failure\nset pagesize 0 feedback off heading off linesize 32767 trimspool on long 100000 serveroutput on size unlimited\n${body}\nexit\n`;
  const r = spawnSync(ENGINE, ["exec", "-i", CONTAINER, "sqlplus", "-s", `sys/${SYS_PW}@localhost/${pdb} as sysdba`], { input: script, encoding: "utf8", maxBuffer: 256 << 20 });
  if (r.status !== 0) throw new Error(`sqlplus 실패(exit ${r.status})\n${r.stdout}\n${r.stderr}`);
  return r.stdout.split("\n").map((l) => l.trimEnd()).filter((l) => l.startsWith("@@"));
}

export function readDb(pdb, owners) {
  const list = owners.map((o) => `'${o}'`).join(",");
  const lines = sqlplus(
    pdb,
    `begin
  for c in (select owner, table_name, column_name, column_id, hidden_column, data_type, data_length, data_precision, data_scale, char_length, nullable, data_default
              from dba_tab_cols where owner in (${list}) and user_generated = 'YES'
               and table_name in (select table_name from dba_tables t where t.owner = dba_tab_cols.owner)
             order by owner, table_name, column_id nulls last, column_name) loop
    dbms_output.put_line('@@C|' || c.owner || '|' || c.table_name || '|' || c.column_name || '|' || c.column_id || '|' || c.hidden_column || '|' || c.data_type || '|' || c.data_length || '|' || c.data_precision || '|' || c.data_scale || '|' || c.char_length || '|' || c.nullable || '|' || replace(replace(trim(substr(c.data_default, 1, 4000)), chr(10), ' '), '|', '/'));
  end loop;
  for t in (select owner, table_name from dba_tables where owner in (${list}) order by 1, 2) loop
    declare n number; begin
      execute immediate 'select count(*) from "' || t.owner || '"."' || t.table_name || '"' into n;
      dbms_output.put_line('@@R|' || t.owner || '|' || t.table_name || '|' || n);
    end;
  end loop;
  for o in (select owner, object_type, object_name from dba_objects where owner in (${list}) and status <> 'VALID' order by 1, 2, 3) loop
    dbms_output.put_line('@@I|' || o.owner || '|' || o.object_type || '|' || o.object_name);
  end loop;
  for x in (select owner, index_name, table_name, status, funcidx_status from dba_indexes where owner in (${list}) and index_type like 'FUNCTION-BASED%' order by 1, 2) loop
    dbms_output.put_line('@@F|' || x.owner || '|' || x.index_name || '|' || x.table_name || '|' || x.status || '|' || x.funcidx_status);
  end loop;
end;
/`,
  );
  const db = { cols: new Map(), rows: new Map(), invalid: [], funcIdx: [] };
  for (const l of lines) {
    const [kind, ...f] = l.slice(2).split("|");
    if (kind === "C") {
      const k = `${f[0]}.${f[1]}`;
      if (!db.cols.has(k)) db.cols.set(k, []);
      db.cols.get(k).push({ name: f[2], id: f[3] ? Number(f[3]) : null, hidden: f[4] === "YES", type: f[5], len: f[6], prec: f[7], scale: f[8], charLen: f[9], nullable: f[10], dflt: f[11] });
    } else if (kind === "R") db.rows.set(`${f[0]}.${f[1]}`, Number(f[2]));
    else if (kind === "I") db.invalid.push(f.join(" "));
    else if (kind === "F") db.funcIdx.push({ owner: f[0], index: f[1], table: f[2], status: f[3], funcStatus: f[4] });
  }
  return db;
}

export function compare(rules, db) {
  const out = [];
  let bad = 0;
  for (const [key, s] of Object.entries(rules.schemas)) {
    const owner = OWNER[key];
    let ok = 0;
    for (const [t, cols] of Object.entries(s.tables)) {
      const got = db.cols.get(`${owner}.${t}`);
      if (!got) {
        out.push(`- ${owner}.${t}: DB 에 없음`);
        bad++;
        continue;
      }
      const hidden = got.filter((c) => c.hidden || c.id === null).map((c) => c.name);
      const order = got.filter((c) => c.id !== null && !c.hidden).map((c) => c.name);
      const want = cols.map((c) => c.col);
      if (hidden.length) out.push(`- ${owner}.${t}: 숨은 컬럼 ${hidden.join(",")}`);
      if (order.join(",") !== want.join(",") || hidden.length) {
        out.push(`- ${owner}.${t}: 순서 다름\n  - DB  : ${order.join(",")}\n  - 규칙: ${want.join(",")}`);
        bad++;
      } else ok++;
    }
    out.push(`${owner}: 규칙 순서 ${ok}/${Object.keys(s.tables).length}`);
  }
  return { bad, out };
}

export function snapshot(db) {
  const tables = {};
  for (const [k, cols] of [...db.cols].sort(([a], [b]) => a.localeCompare(b))) {
    tables[k] = {
      rows: db.rows.get(k) ?? null,
      cols: cols.map(({ id, hidden, ...c }) => c).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  return tables;
}

function main(argv) {
  const pdb = argv.find((a) => !a.startsWith("--"));
  if (!pdb) {
    console.error("사용법: verify-db.mjs <PDB> [--snapshot <file>]");
    return 2;
  }
  const si = argv.indexOf("--snapshot");
  const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/db-order/column-order.json"), "utf8"));
  const db = readDb(pdb.toUpperCase(), Object.values(OWNER));
  const { bad, out } = compare(rules, db);
  console.log(out.join("\n"));
  console.log(`INVALID 객체 ${db.invalid.length}${db.invalid.length ? `: ${db.invalid.join(", ")}` : ""}`);
  const badIdx = db.funcIdx.filter((x) => x.status !== "VALID" || (x.funcStatus && x.funcStatus !== "ENABLED"));
  console.log(`함수 기반 인덱스 ${db.funcIdx.length}개, 비정상 ${badIdx.length}${badIdx.length ? `: ${badIdx.map((x) => `${x.owner}.${x.index}(${x.status}/${x.funcStatus})`).join(", ")}` : ""}`);
  if (si >= 0) {
    fs.writeFileSync(argv[si + 1], JSON.stringify(snapshot(db), null, 1) + "\n");
    console.log(`스냅숏: ${argv[si + 1]}`);
  }
  console.log(`어긋난 표: ${bad}`);
  return bad || db.invalid.length || badIdx.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
