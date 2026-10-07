// aggrid_docs 시험용 로컬 가짜 서버(시험 전용). 사용: node _aggrid_server.mjs --serve <fixtures/aggrid 폴더>
// 시작하면 stdout 에 `PORT <번호>` 한 줄을 쓰고 127.0.0.1 에서 기록된 입력(픽스처)만 돌려준다. 인자 없이 실행하면 아무것도 하지 않는다
// (`node --test <폴더>` 가 폴더의 모든 .mjs 를 실행하는 node 버전에서 서버가 남지 않도록).
//
//  GET /agdev/<파일>                                   → <fixtures>/agdev/<파일>
//  GET /site/archive/<버전>/<fw>-data-grid/<slug>/     → <fixtures>/site/archive/<버전>/<fw>/<slug>.html(.gz)
//       slug 접미 `__crlf` 면 줄끝을 CRLF 로 바꿔 보낸다
//       slug `__500__` → 500, `__403__` → 403, `__redirect__` → column-definitions 로 301, `__empty__` → 204
//  GET /site/<fw>-data-grid/<slug>.md                  → <fixtures>/site/latest/<fw>/<slug>.md
//  GET /__log  → 지금까지 받은 요청(JSON), GET /__reset → 기록 비움
// 고아 방지: 시험 부모가 stdin 파이프로 띄운다. 부모가 (강제 종료 포함) 사라져 파이프가 닫히면 stdin 'end'/'close' 로 스스로 끝낸다.
// 보조 장치로 부모 pid(ppid)가 바뀌면(고아가 되어 init 에 입양) 1초 간격 점검에서도 끝낸다.
// User-Agent 가 aggrid_docs 의 UA 가 아니면 403(ag-grid.com 이 기본 UA 를 막는 것과 같음).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';

export const EXPECTED_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128 Safari/537.36';

function serve(root) {
  const log = [];
  const send = (res, code, body, type = 'text/plain; charset=utf-8', extra = {}) => {
    res.writeHead(code, { 'content-type': type, ...extra });
    res.end(body);
  };
  const readIf = (file) => (fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : null);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (url === '/__log') return send(res, 200, JSON.stringify(log), 'application/json');
    if (url === '/__reset') { log.length = 0; return send(res, 200, 'ok'); }
    log.push({ url, ua: req.headers['user-agent'] ?? null });
    if (req.headers['user-agent'] !== EXPECTED_UA) return send(res, 403, 'forbidden');
    if (url.startsWith('/agdev/__500__/')) return send(res, 500, 'boom');
    let m;
    if ((m = /^\/agdev\/([\w.-]+)$/.exec(url))) {
      const b = readIf(path.join(root, 'agdev', m[1]));
      return b ? send(res, 200, b, 'text/markdown; charset=utf-8') : send(res, 404, 'nf');
    }
    if ((m = /^\/site\/archive\/([\w.-]+)\/(\w+)-data-grid\/([\w.-]+)\/$/.exec(url))) {
      const [, ver, fw] = m;
      let slug = m[3];
      if (slug === '__500__') return send(res, 500, 'boom');
      if (slug === '__403__') return send(res, 403, 'no');
      if (slug === '__empty__') { res.writeHead(204); return res.end(); }
      if (slug === '__redirect__') return send(res, 301, '', 'text/plain', { location: `/site/archive/${ver}/${fw}-data-grid/column-definitions/` });
      const crlf = slug.endsWith('__crlf');
      if (crlf) slug = slug.slice(0, -6);
      const dir = path.join(root, 'site', 'archive', ver, fw);
      let body = readIf(path.join(dir, `${slug}.html`));
      if (!body) {
        const gz = readIf(path.join(dir, `${slug}.html.gz`));
        if (gz) body = zlib.gunzipSync(gz);
      }
      if (!body) return send(res, 404, 'nf');
      if (crlf) body = Buffer.from(body.toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
      return send(res, 200, body, 'text/html; charset=utf-8');
    }
    if ((m = /^\/site\/(\w+)-data-grid\/([\w.-]+)\.md$/.exec(url))) {
      if (m[2] === '__500__') return send(res, 500, 'boom');
      const b = readIf(path.join(root, 'site', 'latest', m[1], `${m[2]}.md`));
      return b ? send(res, 200, b, 'text/markdown; charset=utf-8') : send(res, 404, 'nf');
    }
    return send(res, 404, 'nf');
  });
  server.listen(0, '127.0.0.1', () => {
    process.stdout.write(`PORT ${server.address().port}\n`);
  });
  guardOrphan(() => process.exit(0));
}

/** 부모가 사라지면 onGone 을 부른다(stdin 파이프 닫힘 + ppid 변화 점검). */
export function guardOrphan(onGone) {
  const ppid = process.ppid;
  process.stdin.on('end', onGone);
  process.stdin.on('close', onGone);
  process.stdin.on('error', onGone);
  process.stdin.resume();
  setInterval(() => { if (process.ppid !== ppid) onGone(); }, 1000).unref();
}

const i = process.argv.indexOf('--serve');
if (i > 0 && process.argv[1] && path.basename(process.argv[1]) === '_aggrid_server.mjs') serve(path.resolve(process.argv[i + 1]));
