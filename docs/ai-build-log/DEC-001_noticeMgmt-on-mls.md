# DEC-001 — 공지사항 관리(noticeMgmt) 를 mls 모듈에 신설

- 일자: 2026-09-03
- 대상: `mls` / `lsh` / `noticeMgmt`
- 상태: 구현 완료 (메뉴 등록만 사용자 몫)

## 결정 1 — 배치 위치: mls 빈 모듈 재활용

| 선택지 | 판정 | 사유 |
|---|---|---|
| mcm 에 `cmn` 그룹 신설 | × | 배관 추가가 없어 가장 쌌지만, 테스트 모듈을 따로 두려는 사용자 의도와 어긋남 |
| 신규 백엔드 모듈(`mnt` 등) | × | Gradle includeBuild · 포트 · yml · db · `.env` · FE앱 · page-registry · 기동 스크립트 전부 신설. 권한·메뉴는 여전히 mcm 소유라 mcm 도 손대야 함 |
| **mls 빈 모듈 재활용** | ○ | 포트(8092) · SQLite db · `cactus-core`+`mcm-core` 의존 · FE앱(`m-mls`) · BFF 라우팅(`MLS_WAS_URL`)이 이미 존재. 업무 코드만 비어 있었음 |

**사용자 동의**: 있음 (2026-09-03 선택).

**재검토 조건**: 공지사항이 실제 업무로 승격되면 물류(mls) 소속은 의미상 맞지 않는다. 그때 모듈을 옮기면
`screenId` 는 그대로 두고 `moduleGroup` · 패키지 · BPMN 위치 · OBJECT `SYSTEM_CODE` 만 바꾸면 된다.

## 결정 2 — 설계 산출물을 기능설계서 1종으로 축소

`Mes-Guide.md` §4 는 설계 5종을 개발 진입 게이트로 두지만, 이 설계 체계는 **전부 As-Is → To-Be 마이그레이션
전제**다. 공지사항은 신규(To-Be only) 화면이라 As-Is 원본이 없다.

- To-Be only 규정이 있는 곳은 **3군데뿐** — 분석리포트 §17 / 정합체크 §K.5 / analyze-service 면제
- 나머지(§-1 SOP 30 Step, R14 Auto Manifest 9파일, §0.1~§0.5 사전판정표, §4~§6, 게이트 G1~G9)는 전부
  As-Is 파일 grep 을 전제하며 면제 조항이 없다
- 오히려 `agent-directive/07-templates-writing-response.md:180` "As-Is 자료 확인 없이 신규 기능을 창작하지
  않는다", `08-prompt-operations-dispatch.md:27` "신규 창작 금지" 가 MUST 로 걸려 있다

**사용자 결정**: 기능설계서 1종만 작성하고 진행. 가이드 예외 적용 사실을 기록으로 남긴다(본 문서 + 산출물 §11.1).

산출물: `docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md` (템플릿 §1~§11 준수, frontmatter 6필드)

## TE-002 — mls 모듈에 OASIS 를 처음 부팅시키다

**증상(사전 발견)**: `mls/api/application.yml` 에 `cactus` 설정이 전무했다. 그대로 두면
- `CactusWebSecurityAutoConfiguration` 이 `@ConditionalOnProperty(prefix="cactus.jwt", name="secret")` 이라
  비활성 → `SecurityFilterChain` 미등록 → Spring Security 기본 체인(전 요청 인증)이 걸려 BFF 호출이 401
- `OasisAutoConfiguration` 미동작 → BPMN 로더 자체가 없음

**해결**: `application.yml` 에 3 블록 추가.

| 블록 | 켜는 것 |
|---|---|
| `cactus.jwt.secret` | SecurityFilterChain + JwtTokenProvider. **`cactus.auth.enabled` 는 켜지 않는다** — mls 는 로그인을 호스팅하지 않고 토큰 발급 주체는 mcm 이다 |
| `cactus.security.client-key` | `ClientKeyFilter`. BFF 의 `X-Client-Key` 검증 + `X-Authenticated-User`/`-Role` 헤더로 SecurityContext 사전 인증 set (후속 `JwtAuthenticationFilter` 가 "사전 인증 보존" 분기로 통과) |
| `cactus.oasis.*` | BPMN 로더 (`service-group: mls`, `service-path: /services`) |

**교훈**: 비-mcm 모듈에 OASIS 를 붙일 때 참고할 선례는 `analog`(8191)다. analog 도 로그인을 호스팅하지 않고
`cactus.security.client-key` 만으로 BFF 신뢰 채널을 만든다.

## TE-003 — `mls` 는 mcm 과 스키마 관리 방식이 정반대다

| | mcm | mls |
|---|---|---|
| Flyway | `enabled: false` (이력 참고용) | **`enabled: true`** (`locations: classpath:db/migration/mls`) |
| ddl-auto | `update` | **`none`** |
| 새 테이블 | Entity 만 만들면 생성됨 | **DDL 을 직접 써야 함** |

→ `V2__create_notice.sql` 로 `TB_MLS_NOTICE` + 인덱스 + 시드 3건을 작성했다.

**추가 함정**: SQLite 커뮤니티 dialect + xerial 드라이버는 `LocalDate` 라운드트립에 결함이 있어 값이
epoch millis(정수)로 샌다. mcm 은 `JpaConfig` 가 EMF 를 명시 빌드해서 yml 프로퍼티가 안 먹지만,
mls 는 Spring Boot 기본 EMF 라 yml 로 등록된다:

```yaml
spring.jpa.properties.hibernate.metadata_builder_contributor:
  com.dongkuk.dmes.mcm.common.persistence.SqliteTemporalConverterContributor
```

이걸 넣지 않았으면 `POST_START_DT` 가 `1757462400000` 같은 정수로 내려왔을 것이다.

## TE-004 — curl 로 한글을 보내면 UTF-8 이 깨진다 (테스트 하네스 결함)

INSERT 검증이 `HTTP 500 / S999` 로 실패했는데 원인은 코드가 아니라 **Git Bash 에서 `curl -d '{"TITLE":"신규..."}'`
가 cp949 로 인코딩**된 것이었다. 서버 로그에 `Invalid UTF-8 start byte 0xbd` (Jackson `StreamReadException`).

**해결**: 페이로드를 python 으로 UTF-8 파일에 쓰고 `--data-binary @file` 로 전송.
**교훈**: 한글이 든 curl 검증은 인라인 `-d` 를 쓰지 말 것. BE 를 의심하기 전에 로그에서 파서 예외부터 본다.

## 만든 것

**BE** (`mls`)
- `mls/api/.../application.yml` — cactus 3블록 + SQLite temporal 컨버터
- `mls/api/.../db/migration/mls/V2__create_notice.sql` — `TB_MLS_NOTICE` + IX + 시드 3
- `mls/lib/.../mls/entity/Notice.java` — `CactusAuditEntity` 상속 (audit 9컬럼 자동)
- `mls/lib/.../mls/repository/NoticeRepository.java` — JPQL null-guard 검색 + 채번 보조
- `mls/lib/.../mls/lsh/noticeMgmt/dto/{NoticeMgmtSearchRequest,NoticeMgmtChangeStatusRequest}.java`
- `mls/lib/.../mls/lsh/noticeMgmt/service/NoticeMgmtService.java` — `@Service("noticeMgmtService")`, **`@Transactional` 없음**
- `mls/api/.../services/lsh/noticeMgmt.bpmn` — `bpmn-tool create` 로 생성 (XML 손편집 ✗)

**FE** (`m-mls`)
- `pages/lsh/noticeMgmt/{types.ts,api.ts,page.tsx}`
- `tsup.config.ts` entry `pages/lsh/noticeMgmt/page` 1줄
- `m-mcm/scripts/generate-page-registry.mjs` 의 `MODULE_PAGE_PACKAGES` 에 `m-mls` 등록
  (기존엔 `// 향후:` 주석 처리 상태였다)

**시드·사전**
- ~~`DataInitializer.seedMlsNoticeArtifacts()`~~ — **철회 (2026-09-04)**. TE-005 참조. OBJECT · 권한 · 메뉴 **전부 사용자가 화면에서 직접 등록**한다.
- 식별자 사전 `01-modules-and-screens.md` — A.2.2/A.2.3 에 `lsh`(공지관리), A.3.2 에 `noticeMgmt` 등재

## 검증 결과

| 검증 | 결과 |
|---|---|
| `oasis-contract-check` | BPMN 26 / 매칭 bean 26, **ERROR 0 / WARN 0** |
| `bpmn-tool validate` | 유효 true, 경고 1 (actionGateway default flow 미설정 — 저장소 전 BPMN 공통, 정상) |
| `:lib:compileJava` (mls) | BUILD SUCCESSFUL |
| `tsc --noEmit` (m-mls) | 통과 |
| `tsup` (m-mls) | `dist/pages/lsh/noticeMgmt/page.js` 산출 |
| page-registry | `"lsh/noticeMgmt": () => import("@dk-oasis/m-mls/pages/lsh/noticeMgmt/page")` |
| Flyway (mls.db) | V1, V2 success |
| OASIS `search` | 200 / success=true / 3건 → 4건 |
| OASIS `save` (insert) | 200 / cntMerge=1 / 채번 `NT202609030004` / `C_USR_ID='admin'` 자동 |
| OASIS `save` (검증 실패) | 200 + `meta.success=false` "입력값을 확인해주세요." |
| OASIS `save` (게시중 삭제) | 200 + 거부 |
| OASIS `changeStatus` | 200 / POSTED → STOPPED 반영 |
| OASIS `changeStatus` (금지 전이) | 200 + "허용되지 않는 상태 전이입니다. (STOPPED → DRAFT)" |

## TE-005 — 시드 범위를 넘겨짚어 되돌리다 (2026-09-04)

**증상**: 사용자가 "메뉴 등록은 내가 할거지만 코드는 니가 만들어" 라고 했을 때, 나는 *메뉴 행만* 사용자
몫이고 OBJECT · 권한은 코드(시드) 몫이라고 해석해 `DataInitializer.seedMlsNoticeArtifacts()` 를 넣었다.
실제 의도는 **OBJECT · 시스템 권한도 직접 설정**하는 것이었다.

**원인**: "메뉴 등록" 이라는 말의 범위를 내 기준(테이블 단위)으로 좁혀 읽었다. 화면 운영자 입장에서
"메뉴 등록" 은 OBJECT 등록 → 권한 부여 → 메뉴 배치까지의 한 묶음 작업이다.

**조치**:
1. `seedMlsNoticeArtifacts()` 메서드 + 호출부 제거 (`DataInitializer` 에 `noticeMgmt` 참조 0건)
2. `mcm.db` 에 이미 들어간 2행 삭제 — `TB_MCM_SEC_OBJ` 1행 / `TB_MCM_SEC_ROLE_MAPPING` 1행
3. 재컴파일 + 재기동 후 재시드되지 않음을 확인 (양쪽 0건). `mls.db` 의 `TB_MLS_NOTICE` 4건은 유지 —
   그건 화면 동작용 업무 데이터라 권한 설정과 무관하다.

**교훈**: 사용자가 "이건 내가 한다" 고 경계를 그으면, 그 경계를 **좁게** 해석하지 말 것. 애매하면
넘겨짚고 만들지 말고 무엇까지가 그쪽 몫인지 한 줄로 확인한다. 만들어 둔 것을 되돌리는 비용이
물어보는 비용보다 항상 크다.

## 남은 관찰 (미조치)

`meta.code` 가 `BusinessException` 에 실어 보낸 `ErrorCode`(E001/E010)가 아니라 **`S001` 로 고정** 되어
내려온다. 메시지는 그대로 전달되므로 화면 동작에는 영향이 없으나, FE 가 코드로 오류를 분기하려면
`OasisServiceExecutor` 의 BusinessException 분기를 봐야 한다. 본 화면은 메시지만 쓰므로 손대지 않았다.
