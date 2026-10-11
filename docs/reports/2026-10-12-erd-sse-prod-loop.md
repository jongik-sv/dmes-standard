# ERD SSE production 끊김 반복 조사 (deferred 121)

- 작성: 2026-10-12, 레인 erd2-sse(지시 erd2-sse-1)
- 상태: 정적 조사 끝, 목 서버 production 재현 끝(BFF 무죄). 최초 원인은 미확정 — 실제 BE·브라우저 재현이 남았다.
- 근거 로그: `~/.coord/erd-ux15-1011/close/` (`prodSseLoop-excerpt.txt`, `next-5100.log`, `be-run.log`)

## 현상

- FE 를 `next build` + `next start` 로 띄우면 ERD 실시간 연결(`/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/mcm`)이 몇 분에 386번 끊기고 다시 붙는다.
- BFF 로그 `[BFF] BACKEND_TIMEOUT: This operation was aborted` 590건. BE 로그 `ERD SSE 전달 실패 … 구독 해제` 18건, `response is already committed` 2150건, 5분에 47MB.
- 같은 코드를 `next dev` 로 띄우면 안정(20초 0건).

## 확인한 사실

| # | 사실 | 근거 |
|---|---|---|
| F1 | ERD SSE BFF timeout 은 24시간이다. 이 수정(40c3d90c4, 2026-10-11 00:48) 전 값은 기본 2분이었다. | `src/frontend/m-mcm/lib/http/be-proxy.ts:48,51` |
| F2 | `BACKEND_TIMEOUT` 로그는 `fetch()` 가 응답 헤더를 받기 전에 AbortError 로 거절될 때만 찍힌다. 스트림 도중 abort 는 `streamBackendResponse` 의 `target.error` 로 가서 이 로그를 만들지 않는다. 따라서 590건 = 헤더 전에 요청이 취소된 것이다. abort 원인은 클라이언트 끊김(`req.signal`) 또는 타이머이며, 타이머는 24시간이라 해당하지 않는다. 클라이언트 끊김도 같은 코드명 `BACKEND_TIMEOUT` 으로 찍힌다(이름이 원인을 가린다). | `be-proxy.ts:144-164,323-354` |
| F3 | `next start` 의 압축은 chunk 마다 `res.flush()` 를 부르므로 이벤트가 압축에 갇히지 않는다. `req.signal` 은 응답 `close` 때만 abort 되며 dev 와 같은 코드다. 「압축·버퍼링」 가설은 기각. | `next@16.3.8 dist/server/pipe-readable.js`, `dist/server/web/spec-extension/adapters/next-request.js` |
| F4 | BE `ErdEventHub.send()` 의 catch 블록이 `emitter.completeWithError(e)` 를 부른다. Tomcat 이 이미 `onError` 를 처리한 뒤면 이 호출이 `IllegalStateException`(non-container thread … after an error) 을 던져 catch 를 벗어난다. 그 예외를 `drain()` 의 `catch (RuntimeException)` 이 「ERD SSE 전달 실패」 WARN + 스택으로 남긴다. | `ErdEventHub.java:810-819,761-766`, `be-run.log:33138` |
| F5 | SSE 요청이 끝나거나 오류가 나면 Tomcat 이 ASYNC/ERROR 디스패치로 Security 필터 체인을 다시 지난다. 이때 `AuthorizationDeniedException` 이 나고 응답이 이미 커밋되어 「Unable to handle the Spring Security Exception because the response is already committed」 스택이 남는다. 스택 1건이 수백 줄이라 로그 47MB 의 주범이다. | `be-run.log:13606,13711` |
| F6 | FE 는 EventSource `error` 마다 연결을 닫고 1·2·4·8·15·30초 backoff 로 다시 연다. backoff 초기화는 hello·change·reload·ping 을 받을 때만이다. | `src/frontend/m-mdm/pages/dma/erdEdit/state/useErdStream.ts:109-173` |

## 원인 판단

- 끊김 반복의 직접 장면: 요청이 응답 헤더 전에 취소됨(F2) → BE 는 닫힌 연결에 쓰다 실패(F4) → 비동기 오류 디스패치가 매번 스택을 남김(F5) → FE 가 backoff 로 다시 붙음(F6).
- **BFF·`next start`·압축·타이머는 원인이 아니다**(목 서버 재현 0건, 아래 「재현」).
- 헤더 전에 요청이 취소되는 **최초 원인은 확정하지 못했다.** 남은 후보:
  1. FE 되먹임: `ErdViewer` 가 `reload` 이벤트마다 `erd.reload({dropMine:true})` 를 부르고, 모델을 다시 읽는 동안 `ready` 가 false 가 되면 `useErdStream` 의 effect 정리가 `client.stop()` 으로 연결을 닫는다. 다시 연 연결이 `sinceRev` 때문에 또 `reload` 를 받으면(500건 초과·DRAFT 표시 건넘) 닫기·열기가 끝없이 돈다. 이 경우 요청은 헤더 전에 브라우저가 취소하므로 F2 와 맞는다. 화면에서 `reload` 후 `state.rev` 가 `reload.rev` 까지 올라가는지가 열쇠다.
  2. 헤더 지연: BE `subscribe()` 가 DB 읽기(`currentRev`)를 거친 뒤에야 `hello` 를 보낸다. Hikari 풀(로컬 3)이 다른 저장·재생 읽기로 차면 헤더가 늦어지고, 재연결이 겹쳐 더 막히는 되먹임이 가능하다.
  3. 같은 PDB·BE 에 사용자 `next dev`(5100)와 production FE 가 동시에 붙어 세션이 겹침. 덜 유력.
  - 2번이 `next dev` 에서도 나야 하는데 dev 20초 0건이므로, 1번(production 빌드에서 `state.rev`·`ready` 갱신 순서가 달라진 경우)이나 모델 상태 차이(측정 시점 DB)가 더 맞다. 이 둘은 실제 BE 와 브라우저 없이는 가를 수 없다.

## 재현

2026-10-12 실행(조정 세션 허가: 목 서버 8197, FE 5197, 빌드 15분·측정 5분 상한).

- 구성: SSE 목 서버(node, `hello` 1건 + 1초 ping, Spring 과 같은 `text/event-stream;charset=UTF-8`·`Cache-Control: no-cache, no-store…`) + `next build` → `next start --port 5197`(m-mcm, production). `MDM_WAS_URL`·`MCM_WAS_URL` 은 목 서버. 세션 쿠키는 `AUTH_SECRET` 으로 만든 JWT. DB·BE·5100·8096·PDB 무접촉.
- 측정: 같은 쿠키로 stream 4개를 동시에 5분 연다. 끊기면 FE 와 같은 1·2·4·8·15·30초 backoff 로 다시 연다.
- 결과(production):

| 항목 | 값 |
|---|---|
| 연결 수 | 4개 × 1회(재연결 0) |
| 첫 응답까지 | 178–294ms |
| 5분간 받은 chunk | 연결마다 300개(hello 1 + ping 299) |
| 끊김·오류·`BACKEND_TIMEOUT` | 0건 |
| 응답 `content-encoding` | 없음(`text/event-stream` 은 압축 안 됨) |

- 해석: `next start` 의 BFF(proxy.ts 인증·RBAC → `forwardToBackend` → 스트림 전달) 자체는 정상 BE 와 함께면 5분 끊김 0이다. F2·F3 의 정적 결론과 맞는다. 따라서 deferred 121 의 production 특이성은 BFF 코드가 아니라 **BE 응답 내용·타이밍 또는 FE(브라우저) 쪽**에서 온다.
- 측정하지 않은 것: 실제 `ErdEventHub`(재생·presence·claim·version 이벤트, DB 읽기), 브라우저 EventSource 와 화면 상태(`ready`·`reload`).
- 다음 재현 후보(허가 필요): 복제 PDB 위 BE 를 별도 포트로 띄우고 ego-browser 로 production FE 의 erdEdit 화면을 5분 열어 `reload` 이벤트 수·EventSource 재연결 수를 센다. 모델 상태(rev·DRAFT)를 사용자 장애 때와 같게 맞춰야 한다.

## 수정안(후보, 원인 확정 뒤 다듬는다)

- 수정안 A — BE 노이즈 제거(erd2-be 소유. 조정 세션이 backlog `bl-sse-be` 로 등록, 이 레인은 BE 를 고치지 않는다)
  - 파일: `ErdEventHub.java` (`send()` 의 `completeWithError` 를 try/catch 로 감싸 IllegalStateException 을 삼킴), Security 설정(ASYNC·ERROR 디스패치 `permitAll`)
  - 효과: 스택·로그 폭증(47MB/5분) 제거. 끊김 자체는 못 고침.
  - 위험: Security 설정은 공용. ASYNC 디스패치만 열고 요청 시작 디스패치의 인증은 그대로 둔다.
- 수정안 B — BFF 진단 개선(포털 공용 코드, 사용자 승인 필요)
  - 파일: `src/frontend/m-mcm/lib/http/be-proxy.ts` (`req.signal` abort 와 timeout abort 를 구분해 로그 코드를 `CLIENT_ABORTED`/`BACKEND_TIMEOUT` 으로 나눔), 시험 `tests/http/be-proxy*.test.ts`
  - 효과: 로그가 원인을 가리지 않음. 동작 변화 없음(응답 코드 그대로).
  - 위험: 낮음. 로그 문자열을 보는 기존 시험 확인 필요.
- 최초 원인 수정은 재현 결과에 따라 후보 1~3 중 하나로 정한다.

## 확인 방법

- 목 서버 + production 빌드로 curl 5분 끊김 0회.
- 브라우저(ego-browser)로 화면을 5분 열어 「읽기 전용 — 연결 끊김」 없음, BFF 로그에 `BACKEND_TIMEOUT`·`CLIENT_ABORTED` 0건.
- BE 로그에 `response is already committed` 0건.

## 결론

원인 미확정 · 다음 확인 = bl-sse-fe(FE 시험)·BE 헤더 지연
