// scripts/glm-preflight.sh 의 node 판(스위치 COORD_JS_GLM_PREFLIGHT — js-bridge.sh _jsb_exec).
//   1) zsh -ic 'alias <launch.glm>' 로 alias 를 읽는다  2) ANTHROPIC_BASE_URL 호스트가 api.z.ai 인지
//   3) curl POST <base>/v1/messages(max_tokens 1, 제한 glm.timeout_s 초) → HTTP 200 · 응답 model 에 glm 이 있는지.
//   stdout: `ok <host> <model> <초>` 또는 `fail <alias|host|call|model> <사유>`(모두 종료 코드 0). 결과는 회차가 있으면 state `.glm` 에 남긴다.
// 비밀값(토큰)은 어떤 출력·임시 파일 이름·이벤트에도 남기지 않는다. curl·zsh 는 spawn 으로 그대로(Node fetch 로 바꾸지 않는다 — 실패 문구가 달라진다).
// 헤더는 chmod 600 임시 파일로 curl 에 넘긴다(윈도우는 권한 건너뛴다). 이 파일에 디버그 출력을 넣지 않는다.
// node 18.17 이상, 외부 패키지 없음.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as J from './lib/jq-json.mjs';
import { Ctx, cfgSub, nowIso } from './lib/common.mjs';
import { whichSync } from './lib/compat.mjs';
import { coordLog, coordStateCall, fmtFixed, runSync } from './lib/common-ext.mjs';
import { isMain, scriptMain } from './lib/js-cli.mjs';

const stripNl = (s) => s.replace(/\n+$/, '');

/** zsh alias 출력(`name='…'`)에서 몸통: `name=` 떼고, 감싼 작은따옴표를 벗기고, `'\''` 을 `'` 로 */
export function aliasBody(raw) {
  const eq = raw.indexOf('=');
  let body = eq < 0 ? raw : raw.slice(eq + 1);
  if (body.length >= 2 && body[0] === "'" && body.endsWith("'")) body = body.slice(1, -1);   // bash case `'"*"'` 는 두 글자부터 (한 글자 ' 는 그대로)
  return body.replaceAll("'\\''", "'");
}

const SP = '\\t\\n\\v\\f\\r ';   // POSIX [[:space:]] 의 내용(대괄호 없음) — 쓸 때 [${SP} ;&] 꼴로 싼다
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** getv — alias 몸통에서 VAR="x" | VAR='x' | VAR=x 값(비밀값이므로 돌려주기만 한다). 못 찾으면 '' */
export function getv(body, name) {
  const p = `(^|[${SP} ;&])${esc(name)}=`;
  const bare = `([^${SP} ;&"']*)`;
  for (const re of [new RegExp(`${p}"([^"]*)"`), new RegExp(`${p}'([^']*)'`), new RegExp(`${p}${bare}`)]) {
    const m = re.exec(body);
    if (m) return m[2];
  }
  return '';
}

/** printf '%.1f' (시험·호환용 이름) */
export const fmt1f = (secs) => fmtFixed(secs, 1);

/** record — 결과를 state `.glm` 에 남기고 이벤트를 낸다(at 은 정규화 대상이라 그냥 nowIso) */
function record(c, st, detail) {
  const at = stripNl(nowIso(c));
  const json = J.stringify(new Map([['status', st], ['at', at], ['detail', detail]]), { indent: 0 });
  coordStateCall(c, ['set', '.glm', json]);
  coordStateCall(c, ['event', 'glm-preflight', '-', json]);
}

/** main — 종료 코드(늘 0). {env, cwd} 는 맥락 */
export async function main(_argv, { env, cwd } = {}) {
  const c = new Ctx(env, cwd);
  const fail = (st, why) => { process.stdout.write(`fail ${st} ${why}\n`); record(c, 'fail', `${st} ${why}`); return 0; };

  let name = stripNl(cfgSub(c, '.launch.glm'));
  if (name === '') name = 'glm';
  if (/[^A-Za-z0-9_.-]/.test(name)) return fail('alias', 'launch.glm 이 alias 이름 꼴이 아니다');
  if (!whichSync('zsh', env)) return fail('alias', 'zsh 없음');
  if (!whichSync('curl', env)) return fail('call', 'curl 없음');

  const zr = runSync('zsh', ['-ic', `alias ${name}`], { env });
  const raw = stripNl(zr.out.toString('latin1'));
  if (raw === '') return fail('alias', `alias ${name} 없음`);
  const body = aliasBody(raw);

  const base = getv(body, 'ANTHROPIC_BASE_URL');
  const model = getv(body, 'ANTHROPIC_DEFAULT_HAIKU_MODEL');
  let tokvar = 'ANTHROPIC_AUTH_TOKEN';
  let tok = getv(body, 'ANTHROPIC_AUTH_TOKEN');
  if (tok === '') { tok = getv(body, 'ANTHROPIC_API_KEY'); tokvar = 'ANTHROPIC_API_KEY'; }
  if (base === '') return fail('alias', 'ANTHROPIC_BASE_URL 없음');
  if (tok === '') return fail('alias', 'ANTHROPIC_AUTH_TOKEN·ANTHROPIC_API_KEY 없음');
  if (model === '') return fail('alias', 'ANTHROPIC_DEFAULT_HAIKU_MODEL 없음');

  let host = base;
  const i = host.indexOf('://');
  if (i >= 0) host = host.slice(i + 3);
  const s = host.indexOf('/'); if (s >= 0) host = host.slice(0, s);
  const k = host.indexOf(':'); if (k >= 0) host = host.slice(0, k);
  if (host !== 'api.z.ai') return fail('host', host);

  let tmpdir = '';
  try { tmpdir = mkdtempSync(`${env.TMPDIR ?? '/tmp'}/coord-glm.`); }
  catch { return fail('call', '임시 폴더 실패'); }
  try {
    const hdr = join(tmpdir, 'h');
    const out = join(tmpdir, 'o');
    const head = `x-api-key: ${tok}\nauthorization: Bearer ${tok}\nanthropic-version: 2023-06-01\ncontent-type: application/json\n`;
    try { writeFileSync(hdr, head, { mode: 0o600 }); if (process.platform !== 'win32') chmodSync(hdr, 0o600); } catch { return fail('call', '임시 폴더 실패'); }
    const data = J.stringify(new Map([['model', model], ['max_tokens', 1], ['messages', [new Map([['role', 'user'], ['content', 'ok']])]]]), { indent: 0 });
    let timeoutS = stripNl(cfgSub(c, '.glm.timeout_s'));
    if (timeoutS === '') timeoutS = '10';

    const cr = runSync('curl', ['-sS', '-m', timeoutS, '-o', out, '-w', '%{http_code} %{time_total}', '-H', `@${hdr}`, '-X', 'POST', '--data', data, `${base.replace(/\/$/, '')}/v1/messages`], { env });
    try { rmSync(hdr, { force: true }); } catch { /* 무시 */ }
    if (cr.rc !== 0) {
      if (cr.rc === 28) return fail('call', `timeout ${timeoutS}s`);
      if (cr.rc === 6) return fail('call', 'dns');
      if (cr.rc === 7) return fail('call', 'connect');
      return fail('call', `curl-rc=${cr.rc}`);
    }
    const wout = stripNl(cr.out.toString('latin1'));
    const sp = wout.indexOf(' ');
    const code = sp < 0 ? wout : wout.slice(0, sp);
    let secs = sp < 0 ? wout : wout.slice(wout.lastIndexOf(' ') + 1);
    if (code !== '200') return fail('call', `http=${code}`);

    let rmodel = '';
    try {
      const otext = readFileSync(out, 'latin1');   // jq -r '.model // empty' 를 jq-json 으로(파일을 못 읽거나 깨졌으면 '')
      for (const d of J.parseStreamPartial(otext).values) {
        let v;
        try { v = J.alt(J.index(d, 'model'), undefined); } catch { continue; }
        if (v !== undefined) rmodel += `${typeof v === 'string' ? v : J.tostring(v)}\n`;
      }
      rmodel = stripNl(rmodel);
    } catch { rmodel = ''; }
    const lower = rmodel.replace(/[A-Z]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 32));
    if (!lower.includes('glm')) return fail('model', rmodel === '' ? 'none' : rmodel);

    const f = fmtFixed(secs, 1);
    secs = f == null ? `0.0${secs}` : f;   // printf '%.1f' 은 줄바꿈이 없어 echo 원문이 바로 붙는다
    process.stdout.write(`ok ${host} ${rmodel} ${secs}\n`);
    coordLog(c, [`(토큰 변수: ${tokvar}, 요청 모델: ${model})`]);
    record(c, 'ok', `${host} ${rmodel} ${secs}s`);
    return 0;
  } finally {
    try { rmSync(tmpdir, { recursive: true, force: true }); } catch { /* 무시 */ }
  }
}
if (isMain(import.meta.url)) scriptMain(main);
