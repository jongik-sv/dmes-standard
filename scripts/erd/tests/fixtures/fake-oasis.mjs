// 가짜 MDM OASIS 서버. POST /api/mdm/oasis/erdEdit/{action} 만 받고, 받은 요청을 기록한다.
import { createServer } from "node:http";

export const success = (result) => ({ status: 200, body: { meta: { success: true }, data: { result } } });
export const failure = (code, message) => ({ status: 200, body: { meta: { success: false, code, message } } });

/**
 * @param {(action: string, params: object, req: import("node:http").IncomingMessage) => {status:number, body:any, delayMs?:number}} route
 * @returns {Promise<{url: string, requests: Array<{action, params, headers, body}>, close: () => Promise<void>}>}
 */
export async function startFakeOasis(route) {
  const requests = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const m = /^\/api\/mdm\/oasis\/erdEdit\/(\w+)$/.exec(req.url);
      if (req.method !== "POST" || !m) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
        return;
      }
      const body = JSON.parse(raw);
      requests.push({ action: m[1], params: body.params, headers: req.headers, body });
      const out = route(m[1], body.params, req);
      const send = () => {
        const text = typeof out.body === "string" ? out.body : JSON.stringify(out.body);
        res.writeHead(out.status, { "Content-Type": typeof out.body === "string" ? "text/plain" : "application/json" }).end(text);
      };
      if (out.delayMs) setTimeout(send, out.delayMs);
      else send();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
