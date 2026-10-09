# ERD 도구 AI·MCP 연동 조사 (D-ai-mcp)

조사일: 2026-10-09. 웹 검색 결과와 페이지 조회에 근거한다. 2차 자료(디렉터리·블로그·미러) 가 많아서 실제 서버 소스·공식 문서로 대조하지 못한 항목은 "확인 안 됨" 으로 표시했다.

---

## 1. 기존 DB 스키마·ERD MCP 사례

| 사례 | 상태 | 확인된 tool 목록 / 입력 형식 | 근거 |
|---|---|---|---|
| Azimutt MCP | **확인 안 됨** | 검색 2회 모두 Azimutt MCP 관련 결과 없음. GitHub 저장소 페이지는 404 였다. Azimutt 자체는 DBML 과 연관된 제품(azimutt.app 비교 페이지 존재) 이라는 것만 확인. | 검색 결과 azimutt.app/vs/database-design-language/dbml |
| ChartDB AI 기능 | MCP 없음 확인 | AI 기능은 DDL 을 다른 방언으로 변환하는 export 용. OpenAI 키 또는 vLLM 엔드포인트 필요. 라이선스 AGPL-3.0. MCP 언급 없음(검색 결과 기준). 지원 DB: PostgreSQL, MySQL, SQL Server, MariaDB, SQLite, ClickHouse 등(출처별 차이). | https://www.linuxlinks.com/chartdb-web-based-database-diagramming-editor/ , https://alternativeto.net/software/chartdb/about |
| dbdiagram AI | **확인 안 됨** | 조사하지 않음(검색 미실시). | - |
| Liam ERD | 공식 스키마 설계 MCP 없음(검색 기준) | 공식 `@liam-hq/mcp-server` 의 tool 은 `list_components` 한 개로 UI 컴포넌트 목록용. 스키마 설계 agent(dbAgent)는 앱 내부 LangGraph 워크플로이며 외부 MCP tool 아님. 커뮤니티 `iberianpig/mcp_liam` 은 Liam 이 내보낸 schema.json 을 읽기 전용으로 분석(테이블 목록·테이블 스키마·FK 조회), 편집 없음. | https://lobehub.com/mcp/iberianpig-mcp_liam , Liam 문서 https://docsearch.algolia.com/mcp/docs/repo/liam-hq/liam |
| AI-ERD (ai-erd.com, Liam 과 다른 제품) | 부분 확인 | 호스티드 MCP 가 DBML 기반으로 스키마 생성·관리를 한다고 검색 스니펫에 나옴. 직접 조회(https://ai-erd.com/mcp) 는 401 로 실패해 tool 목록 **확인 안 됨**. 로컬 패키지 MCPBundles "ai-erd-mcp" 는 자연어로 ERD 생성·편집이라는 설명만 있고 tool 목록은 서버 연결 시점에만 나온다고 함. | https://www.getdrio.com/mcp/com-ai-erd-ai-erd/md , https://pulsemcp.com/servers/ai-erd |
| SchemaCrawler AI (Docker MCP) | 읽기 전용 탐색 | tool: `list`, `describe_tables`, `describe_routines`, `list_across_tables`, `describe_entities`(ER 모델 문서화). 편집 tool 없음. | https://hub.docker.com/mcp/server/schemacrawler-ai/tools |
| Supabase MCP | 확인됨(2차 미러 기준) | feature group: account, database, debugging, development, docs, functions, branching(기본값). database 그룹의 핵심: `list_tables`(스키마 지정 테이블 목록), `apply_migration`(DDL 전용, 이력으로 기록), `execute_sql`(스키마 안 바꾸는 일반 질의). `read_only=true`(CLI 는 `--read-only`) 면 쓰기 도구 비활성. `features=database,docs`, `project_ref` 로 범위 제한. 서버는 1.0 미만. | https://github.com/supabase/mcp (공식), https://glama.ai/mcp/servers/@supabase-community/mcp-supabase/blob/199a0c4243c9f29528899aca2ef1209126bcbed3/README.md , https://supabase.com/mcp |
| Prisma MCP | 확인됨(미러 기준) | 로컬 `npx -y prisma mcp`: `migrate-status`, `migrate-dev`(인자 name), `migrate-reset`(force, 파괴적), Prisma Postgres 계정·DB 생성 도구. 원격 `mcp.prisma.io`: 백업·복구·DB 삭제 도구(단일 출처). 입력은 CLI 인자 기반. | https://mcpservers.org/servers/prisma/mcp , https://glama.ai/mcp/servers/g1pi4izexx |
| Oracle SQLcl MCP (`sql -mcp`) | 확인됨(공식 문서 SQL Developer for VS Code 25.3 기준) | tool 5개: `list-connections`(저장된 연결 목록), `connect`(이름 있는 연결로 세션), `run-sql`(SQL/PL/SQL 실행), `run-sqlcl`(SQLcl 명령), `disconnect`. MCP 모드 기본 restrict level 4(가장 제한적), `-R` 로 변경. 연결 정보는 `~/.dbtools`, 무인 사용은 `-savepwd`. **스키마 설계·DDL 전용 tool 은 문서에 없음.** 다른 글은 `describe-schema`(일부 빌드는 `schema-information`) 도 언급 — 버전마다 이름이 다름. 최소 SQLcl 25.2 (2차 출처). | https://docs.oracle.com/en/database/oracle/sql-developer-vscode/25.3/sqdnx/sqlcl-mcp-server-tools.html , https://blogs.oracle.com/developers/controlled-oracle-actions-with-sqlcl-mcp |
| Oracle Autonomous DB MCP | 설명만 확인 | 커스텀 tool(Select AI Agent 로 정의), 메타데이터 tool(schema·object 목록·상세), read-only SQL tool 을 설명. 실제 tool 이름·파라미터 문서 없음. | https://docs.oracle.com/en-us/iaas/autonomous-database-serverless/doc/mcp-server-use-cases.html |
| DBHub (Bytebase) | 확인됨 | `execute_sql`(세미콜론 구분 다중 문장, 트랜잭션, read-only, row limit), `search_objects`(스키마·테이블·컬럼·프로시저·인덱스 탐색, 이름만 먼저 주고 상세는 요청 시), 선택: `explain_sql`, `health_check`, 사용자 정의 tool(dbhub.toml 의 `[[tools]]`). 다중 DB 는 `source_id` 파라미터. 전송: stdio(`--transport stdio --dsn ...`), HTTP(`--transport http --port`). 기본 2개 tool 약 1.4k 토큰. 입력 파라미터 상세는 확인 안 됨. | https://github.com/bytebase/dbhub , https://www.mintlify.com/bytebase/dbhub/introduction |
| 기타 DB MCP (manohar02/mcp-database) | 참고 | 스키마를 resource 로 제공(Mermaid ER 다이어그램 포함), 자연어→SQL 도구. | https://glama.ai/mcp/servers/@shailesh5050/mcp-database-server (검색 결과) |

**요약 관찰**
- 읽기(탐색·조회) tool 은 거의 모든 서버에 있다. **구조화 모델을 명령 단위로 편집하는 tool 을 가진 공개 서버는 이번 조사에서 찾지 못했다.** 대부분 raw SQL 실행(`execute_sql`/`run-sql`) 이나 마이그레이션 적용(`apply_migration`, `migrate-dev`) 이다.
- 편집 tool 을 두는 서버는 안전장치를 기본으로 둔다: read-only 모드, restrict level, 파괴적 tool 분리.
- DBHub 의 `search_objects` 처럼 "이름만 먼저, 상세는 요청 시" 는 토큰 절약 패턴으로 참고할 만하다.

---

## 2. LLM 에 스키마를 읽기 좋은 표현

확인된 자료:
- **정량 비교 실험은 찾지 못함.** DBML vs SQL DDL vs Mermaid 의 정확도·토큰을 같은 스키마로 비교한 공개 연구는 검색에서 없었다. (확인 안 됨)
- 관련 연구:
  - Rajkumar et al.: 테이블·컬럼 이름을 어떻게 제시하느냐가 SQL 생성 정확도에 직접 영향. (arXiv 2607.18029 에서 인용)
  - Wretblad et al.: 컬럼 설명(주석)을 붙이면 의미 없는 컬럼명에서 정확도 20% 이상 개선. DBML 의 inline note 가 같은 효과를 낼 수 있다는 근거이지만 DBML 을 직접 검증한 것은 아님. (arXiv 2607.18029 에서 인용)
  - DAIL-SQL: 정확도와 토큰 수의 절충을 실험. 토큰 수는 질문 표현·예시 구성에 주로 좌우된다. https://bolinding.github.io/papers/vldb24dailsql.pdf
- 벤더·블로그 주장(실험 아님):
  - DBML 은 간결하지만 실행 가능한 DDL 이 아니므로 컴파일이 필요. https://www.tqdev.com/2026-dbml-database-schema-plain-text-genai/ , https://talkingschema.ai/docs/glossary/dbml
  - Mermaid erDiagram 은 LLM 이 생성하기 쉽다는 주장. 단 NOT NULL, 길이·정밀도 등 제약을 표현하지 못한다. https://hackolade.com/help/GenAI-createdMermaidERdiagram.html
  - SQL DDL 은 방언 종속이고 장황하다.

**권장 (추론, 실험 근거는 약함)**
- 읽기 기본: DBML 비슷한 간결 텍스트. 테이블·컬럼·타입·PK/FK·NOT NULL·기본값·코멘트를 담는다. 제약 손실이 없어야 하므로 Mermaid 단독은 쓰지 않는다.
- 편집 결과 검증과 최종 생성은 방언별 DDL 로 변환(서버 측 컴파일). 모델 입출력은 DBML 같은 텍스트, 저장은 구조화 JSON 으로 둔다.
- 컬럼 설명을 반드시 포함(Wretblad 근거). 토큰 수는 자기 스키마로 실측할 것.

---

## 3. 구조화 모델 편집 API 패턴

**세밀한 명령 vs 전체 교체 vs diff**
- 명령(command) 방식은 의도가 명확해 검증·실행 취소 기록(행위자 구분)이 쉽다. 전체 문서 교체는 LLM 이 큰 JSON 을 매번 다시 쓰므로 토큰이 많고 동시 편집 충돌이 크다. JSON Patch(RFC 6902) 는 경로 기반이라 이름 변경에 취약하다. 이 부분은 일반 설계 지식으로 판단하며 출처 검증은 하지 못함. (확인 안 됨)
- 추천: 명령 단위 API(addTable, addColumn, addRelation, renameColumn, moveToDiagram 등) 를 기본으로, 전체 교체는 "스키마 가져오기" 같은 관리 작업에만.

**실패 처리(검증 오류를 LLM 에게)**
- 검증 오류는 프로토콜 오류가 아니라 tool 실행 결과로 돌려줘야 모델이 보고 고친다. MCP 쪽 SEP-1303 제안도 입력 검증 오류를 Tool Execution Error 로 돌리자는 방향. https://modelcontextprotocol.io/seps/1303-input-validation-errors-as-tool-execution-errors
- 형식: `{ok:false, errors:[{code, path(예: tables[2].columns[1].name), expected, received, recoverable, suggestedAction}]}`. recoverable 플래그가 있어야 모델이 재시도/포기를 바르게 고른다. https://apxml.com/courses/building-advanced-llm-agent-tools/chapter-1-llm-agent-tooling-foundations/tool-error-handling 등 블로그 출처.
- 빈 결과로 실패를 숨기지 말 것(성공·실패 구조 분리).
- JSON Schema 로 못 잡는 규칙(예: 이름 중복, 참조 무결성)은 도구 경계에서 런타임 검증.

**batch(한 번에 여러 명령)**
- 원자성: 전부 성공 또는 전부 실패(트랜잭션) 가 기본. 부분 성공이 필요하면 항목별 결과를 돌려준다. 항목별 결과 응답에 대한 좋은 출처는 찾지 못함. (확인 안 됨)
- 한 batch 안에서 앞 명령의 임시 ID 를 뒤 명령이 참조할 수 있게 하면 LLM 이 편하다(추론).

**dry-run / preview**
- 같은 검증 경로를 타되 커밋하지 않는 모드를 두고, 결과로 영향 목록(추가·삭제·변경 건수, 검증 오류)을 준다. 구체 사례 출처는 찾지 못함. (확인 안 됨)

**멱등성**
- 변경 tool 은 두 번 호출돼도 안전해야 한다. 재시도·응답 유실에 대비. 출처: https://urandom.io/blog/2026-04-14-agent-reliability-idempotent-tools-checkpoints , https://tianpan.co/blog/2026/04/23/agent-idempotency-orchestration-contract
- 멱등 키는 모델이 만들지 말고 런타임(오케스트레이터)이 run ID + 단계 ID + tool 이름 + 범위로 만든다. 같은 키 재요청은 같은 성공 응답.
- 작업 상태: pending / succeeded / failed / unknown 을 기록.

---

## 4. 실시간 반영·협업

**전송 방식**
- 한쪽 방향(서버→클라이언트) 이면 SSE 가 가장 단순. 일반 HTTP 라 프록시·인증 미들웨어가 그대로 동작, EventSource 가 Last-Event-ID 로 재연결. 편집은 일반 POST. 출처: https://www.designgurus.io/answers/detail/what-are-the-different-techniques-for-real-time-updates-websockets-vs-server-sent-events-vs-long-polling , https://codemia.io/archive/polling-vs-sse-vs-websocket
- WebSocket 은 양방향·고빈도·저지연 ack, 커서·프레즌스가 필요할 때. 메시지 형식·재연결·재생을 직접 설계해야 한다.
- 폴링은 드문 변경이나 폴백용.
- 추천: 캔버스 뷰어는 SSE(명령 로그 이벤트 스트림, 마지막 revision 이후 재생), 편집은 POST. 커서가 필요해지면 그때 WebSocket.

**낙관적 잠금**
- 모든 명령에 base revision 을 실어 보내고, 불일치면 충돌 오류(현재 revision 과 최신 변경 요약) 를 돌려준다. 연결 재생은 revision 번호 기반. (일반 패턴, 출처 미확인 — 추론)

**이벤트 소싱·커맨드 로그**
- 명령 로그를 정본으로 두면 실행 취소·행위자 구분·재생·SSE 재전송이 같은 자료에서 나온다. 행위 기록에 actor(human/claude + 세션 ID) 를 남긴다. (추론)

**CRDT(Yjs) 필요성**
- Excalidraw: Socket.IO 로 클라이언트가 AES-GCM 으로 암호화한 메시지를 중계, 요소 단위 조정(로컬 편집 우선, 그다음 높은 version, 동률이면 nonce). CRDT 아님. https://blog.websoft9.com/?p=2195 , https://pyshine.com/Excalidraw-Virtual-Whiteboard-Source-Tour/ (2차 자료)
- tldraw: 서버 권위(authoritative) + push/pull/rebase 엔진. CRDT 가 아니라 git 식 rebase 에 가깝다고 설명. Yjs 는 대체 백엔드로 지원. Durable Object 하나가 방 하나. https://grida.co/docs/wg/research/crdt/tldraw , https://tldraw.dev/blog/20-things-i-wish-ai-chatbots-knew-about-tldraw , https://docs.tldraw.dev/docs/collaboration
- 판단: 관계형 스키마 편집은 "명령 + 낙관적 잠금 + 서버 권위" 로 충분해 보인다. 동시 편집이 같은 칸을 치는 빈도가 낮다고 가정하면 CRDT 는 과하다. 단 오프라인 편집·다중 서버 쓰기가 필요해지면 재검토. (추론)

**Yjs UndoManager 주의점**
- trackedOrigins 로 로컬 트랜잭션만 추적 가능. 스택은 문서 단위로 공유 — 사용자별 독립 스택은 기본 기능이 아니다. 원격 변경은 기본적으로 덮어쓰지 않음.
- 충돌 시 "남의 수정이 있는 것을 되돌리기" 정책을 직접 정해야 한다.
- 출처: https://docs.yjs.dev/api/undo-manager , https://discuss.yjs.dev/t/how-is-undomanager-being-used/1851
- 우리 구상처럼 명령 로그로 행위자를 구분하려면 Yjs 를 쓰지 않는 쪽이 자연스럽다(추론).

---

## 5. Claude Code 에서 MCP 서버를 node 로 만들기

- 공식 TypeScript SDK: `@modelcontextprotocol/sdk` (구 레이아웃, `server/mcp.js`, `server/stdio.js`, `server/streamableHttp.js`). 최근에는 `@modelcontextprotocol/server` 와 `@modelcontextprotocol/client` 로 분리되었다는 출처(Context7)가 있으니 설치 버전에서 import 경로를 확인할 것. https://ts.sdk.modelcontextprotocol.io/documents/server.html , https://context7.com/modelcontextprotocol/typescript-sdk
- tool 등록은 `registerTool(name, {inputSchema, outputSchema?, ...}, handler)`. 버전마다 시그니처가 달라 블로그 예제를 그대로 복사하면 안 된다는 경고가 있다.
- 전송:
  - stdio: 로컬. Claude Code 가 자식 프로세스로 띄운다. `.mcp.json` 에 `command`, `args`, `env`.
  - Streamable HTTP: 원격·여러 클라이언트 공유. `claude mcp add --transport http <name> <url>`. `type` 필드 필요(출처별 alias `streamable-http`).
- 인증: 원격은 OAuth(첫 호출 때 브라우저 로그인, `/mcp` 로 재시작). 고정 토큰은 `--header`. `.mcp.json` 은 커밋 대상이므로 토큰을 직접 넣지 말고 환경변수 참조(`$VAR`) 를 쓴다. 출처: https://zuplo.com/docs/mcp-gateway/connect-clients/claude-code.md (2차). Claude Code 공식 문서(code.claude.com) 는 직접 조회하지 못함 — 확인 안 됨.
- scope: local(기본, 프로젝트·현재 폴더 기준으로만 보임), project(`.mcp.json`, 팀 공유, 승인 필요), user(모든 프로젝트).

**MCP vs CLI + 스킬 논의 자료**
- Checkly 실험(Playwright): MCP 와 CLI 스킬 흐름의 토큰 차이가 거의 없었다(세션 컨텍스트 48~50k vs 45~48k). https://www.checklyhq.com/blog/mcp-vs-cli-token-efficiency/
- Scalekit(gh CLI vs GitHub MCP, Sonnet 4): 10,000 operation 기준 MCP 약 $55.20 vs CLI 약 $3.20. https://firecrawl.dev/blog/mcp-vs-cli (2차 인용)
- Arize(Claude Opus 4.6, Agent SDK): 스킬은 허용 도구 안에서 99% 이상 동작, MCP 는 그렇지 못했다고 보고. https://arize.com/blog/mcp-vs-cli-skills-for-agents-what-our-eval-found-and-which-you-should-use/
- Anthropic 의 code-execution 글(150,000 → 2,000 토큰) 은 2차 인용만 확인, 원문 확인 안 됨.
- Claude Code 는 tool 정의를 지연 로드한다는 언급(2차). 예전 비교 수치는 낡았을 수 있음.

**우리 상황 판단 (추론)**
- MCP 가 필요한 이유: 세 입구(화면·MCP·CLI) 가 같은 편집 API 를 쓰고 실행 중 캔버스에 실시간 반영해야 함 → 서버가 상태를 가진 쪽이 맞다. 이 경우 CLI 는 로컬 서버 HTTP 호출 얇은 래퍼로 두고, MCP 도 같은 API 를 감싼다.
- CLI + 스킬만으로 충분한 경우: 단발 조회·편집, 세션 간 공유 상태가 필요 없을 때. 캔버스 실시간 반영은 CLI 만으로는 안 된다(서버 필요).
- 권장 조합: 핵심은 HTTP(또는 로컬 소켓) 명령 API 한 벌. 그 위에 MCP 서버(stdio 로컬) 와 CLI 를 얇게. 스킬은 사용 지침·DBML 규칙을 담는다.

---

## 6. 핵심 URL 모음

- Supabase MCP: https://github.com/supabase/mcp
- Oracle SQLcl MCP tools: https://docs.oracle.com/en/database/oracle/sql-developer-vscode/25.3/sqdnx/sqlcl-mcp-server-tools.html
- Oracle SQLcl MCP 블로그: https://blogs.oracle.com/developers/controlled-oracle-actions-with-sqlcl-mcp
- DBHub: https://github.com/bytebase/dbhub
- Prisma MCP(미러): https://mcpservers.org/servers/prisma/mcp
- ChartDB: https://www.linuxlinks.com/chartdb-web-based-database-diagramming-editor/
- Liam 커뮤니티 MCP: https://lobehub.com/mcp/iberianpig-mcp_liam
- SchemaCrawler AI: https://hub.docker.com/mcp/server/schemacrawler-ai/tools
- MCP TS SDK: https://ts.sdk.modelcontextprotocol.io/documents/server.html
- MCP SEP-1303: https://modelcontextprotocol.io/seps/1303-input-validation-errors-as-tool-execution-errors
- Yjs UndoManager: https://docs.yjs.dev/api/undo-manager
- tldraw 협업: https://docs.tldraw.dev/docs/collaboration
- Excalidraw 협업(2차): https://blog.websoft9.com/?p=2195
- Text-to-SQL 스키마 표현 관련 논문: https://arxiv.org/pdf/2607.18029 , https://bolinding.github.io/papers/vldb24dailsql.pdf
- Mermaid ER 제약 한계: https://hackolade.com/help/GenAI-createdMermaidERdiagram.html
- 멱등성 글: https://urandom.io/blog/2026-04-14-agent-reliability-idempotent-tools-checkpoints
- MCP vs CLI: https://www.checklyhq.com/blog/mcp-vs-cli-token-efficiency/ , https://arize.com/blog/mcp-vs-cli-skills-for-agents-what-our-eval-found-and-which-you-should-use/

---

## 7. 확인 안 됨 목록

- Azimutt MCP 존재 여부와 tool 목록
- dbdiagram AI 기능
- AI-ERD(ai-erd.com/mcp) tool 목록·입력 형식 (401 로 실패, 검색 스니펫만)
- DBML vs DDL vs Mermaid 의 정확도·토큰 정량 비교
- dry-run·batch 항목별 결과 응답의 구체 사례
- tldraw·Excalidraw 공식 문서 원문 (2차 자료만)
- Claude Code 공식 MCP 문서 원문 (code.claude.com 직접 조회 안 함)
- Anthropic code-execution 글 원문
- DBHub 입력 파라미터 상세
