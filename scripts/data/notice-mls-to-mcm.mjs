#!/usr/bin/env node
/**
 * 공지 데이터 1회 복사 — mls.db TB_MLS_NOTICE(_TARGET) → mcm.db TB_MCM_NOTICE(_TARGET) (2026-10-07, DEC-001 「재검토 → 이전」).
 *
 * 사용:
 *   node scripts/data/notice-mls-to-mcm.mjs --mls <mls.db 경로> --mcm <mcm.db 경로>           # 미리 보기(쓰지 않음)
 *   node scripts/data/notice-mls-to-mcm.mjs --mls <mls.db 경로> --mcm <mcm.db 경로> --apply   # 복사
 *
 * 규칙
 * - mls.db 는 읽기 전용으로 연다. 어느 쪽 행도 지우거나 덮어쓰지 않는다(INSERT OR IGNORE).
 * - 같은 NOTICE_ID 가 mcm 에 이미 있으면 건너뛰고 그 ID 를 보고한다(mcm 에서 먼저 만든 공지와 채번이 겹친 경우 사람이 판단).
 *   건너뛴 공지의 게시 대상 행도 옮기지 않는다 — 다른 공지에 대상이 붙지 않게.
 * - 칸은 두 테이블에 모두 있는 칸만 옮긴다. 날짜 형식은 두 DB 가 같다(날짜 'YYYY-MM-DD', 시각 epoch 밀리초).
 * - mcm 쪽 테이블이 없으면(새 코드로 mcm 을 한 번도 띄우지 않음) 아무것도 쓰지 않고 끝낸다.
 * - 다시 돌려도 결과가 같다(멱등). 서버가 떠 있어도 되지만 잠금이 길면 5초 기다린 뒤 실패한다.
 *
 * 필요: Node 22.13 이상(내장 node:sqlite). 외부 패키지 없음 — 윈도우도 같은 명령이다.
 * 종료 코드: 0 성공 · 2 인자 오류 · 3 테이블 없음 · 4 node:sqlite 없음 · 1 그 밖의 오류.
 */
import { existsSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SRC = { notice: "TB_MLS_NOTICE", target: "TB_MLS_NOTICE_TARGET" };
const DST = { notice: "TB_MCM_NOTICE", target: "TB_MCM_NOTICE_TARGET" };

function usage(msg) {
  if (msg) console.error(`오류: ${msg}`);
  console.error("사용: node scripts/data/notice-mls-to-mcm.mjs --mls <mls.db> --mcm <mcm.db> [--apply]");
  process.exit(2);
}

export function parseArgs(argv) {
  const out = { mls: null, mcm: null, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--mls" || a === "--mcm") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${a} 뒤에 경로가 필요합니다`);
      out[a.slice(2)] = v;
    } else throw new Error(`알 수 없는 인자: ${a}`);
  }
  if (!out.mls || !out.mcm) throw new Error("--mls 와 --mcm 이 모두 필요합니다");
  return out;
}

function columns(db, table) {
  return db.prepare(`PRAGMA table_info("${table}")`).all().map((r) => r.name);
}

function hasTable(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

/**
 * 복사 계획과(apply 면) 실행. 결과 객체를 돌려준다 — 시험이 직접 부른다.
 * @param {typeof import("node:sqlite").DatabaseSync} DatabaseSync
 */
export function run(DatabaseSync, { mls, mcm, apply }) {
  const src = new DatabaseSync(mls, { readOnly: true });
  const dst = new DatabaseSync(mcm);
  try {
    dst.exec("PRAGMA busy_timeout = 5000");
    for (const t of [SRC.notice, SRC.target]) {
      if (!hasTable(src, t)) return { error: `mls.db 에 ${t} 가 없습니다`, code: 3 };
    }
    for (const t of [DST.notice, DST.target]) {
      if (!hasTable(dst, t)) {
        return { error: `mcm.db 에 ${t} 가 없습니다 — 새 코드로 mcm 을 한 번 띄워 테이블을 만든 뒤 다시 실행하세요`, code: 3 };
      }
    }

    const noticeCols = columns(src, SRC.notice).filter((c) => columns(dst, DST.notice).includes(c));
    const targetCols = columns(src, SRC.target).filter((c) => columns(dst, DST.target).includes(c));
    const srcNotices = src.prepare(`SELECT ${noticeCols.map((c) => `"${c}"`).join(", ")} FROM "${SRC.notice}" ORDER BY "NOTICE_ID"`).all();
    const srcTargets = src.prepare(`SELECT ${targetCols.map((c) => `"${c}"`).join(", ")} FROM "${SRC.target}" ORDER BY "NOTICE_ID", "ROLE_ID"`).all();
    const existing = new Set(dst.prepare(`SELECT "NOTICE_ID" FROM "${DST.notice}"`).all().map((r) => r.NOTICE_ID));

    const toInsert = srcNotices.filter((r) => !existing.has(r.NOTICE_ID));
    const skipped = srcNotices.filter((r) => existing.has(r.NOTICE_ID)).map((r) => r.NOTICE_ID);
    const insertIds = new Set(toInsert.map((r) => r.NOTICE_ID));
    const targetsToInsert = srcTargets.filter((r) => insertIds.has(r.NOTICE_ID));

    const result = {
      apply,
      source: { notices: srcNotices.length, targets: srcTargets.length },
      skippedNoticeIds: skipped,
      planned: { notices: toInsert.length, targets: targetsToInsert.length },
      inserted: { notices: 0, targets: 0 },
      noticeColumns: noticeCols,
    };
    if (!apply) return result;

    const insNotice = dst.prepare(
      `INSERT OR IGNORE INTO "${DST.notice}" (${noticeCols.map((c) => `"${c}"`).join(", ")}) VALUES (${noticeCols.map(() => "?").join(", ")})`,
    );
    const insTarget = dst.prepare(
      `INSERT OR IGNORE INTO "${DST.target}" (${targetCols.map((c) => `"${c}"`).join(", ")}) VALUES (${targetCols.map(() => "?").join(", ")})`,
    );
    dst.exec("BEGIN IMMEDIATE");
    try {
      for (const r of toInsert) result.inserted.notices += Number(insNotice.run(...noticeCols.map((c) => r[c])).changes);
      for (const r of targetsToInsert) result.inserted.targets += Number(insTarget.run(...targetCols.map((c) => r[c])).changes);
      dst.exec("COMMIT");
    } catch (e) {
      dst.exec("ROLLBACK");
      throw e;
    }
    return result;
  } finally {
    src.close();
    dst.close();
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    usage(e.message);
  }
  for (const p of [args.mls, args.mcm]) {
    if (!existsSync(p)) usage(`파일이 없습니다: ${p}`);
  }
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    console.error(`오류: 이 Node(${process.version})에는 node:sqlite 가 없습니다. Node 22.13 이상으로 실행하세요.`);
    process.exit(4);
  }
  const r = run(DatabaseSync, args);
  if (r.error) {
    console.error(`오류: ${r.error}`);
    process.exit(r.code);
  }
  console.log(`${r.apply ? "[복사]" : "[미리 보기 — 쓰지 않음, 복사하려면 --apply]"} mls → mcm 공지`);
  console.log(`  원본(mls)      공지 ${r.source.notices}건 · 게시 대상 ${r.source.targets}건`);
  console.log(`  넣을 것        공지 ${r.planned.notices}건 · 게시 대상 ${r.planned.targets}건`);
  console.log(`  이미 있어 건너뜀 공지 ${r.skippedNoticeIds.length}건${r.skippedNoticeIds.length ? ` — ${r.skippedNoticeIds.join(", ")}` : ""}`);
  if (r.apply) console.log(`  실제로 넣음    공지 ${r.inserted.notices}건 · 게시 대상 ${r.inserted.targets}건`);
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    console.error(`오류: ${e?.message ?? e}`);
    process.exit(1);
  });
}
