# 공지사항(noticeMgmt·noticeBoard) MLS → MCM 이전 설계

- 일자: 2026-10-07 · 레인 notice-to-mcm(회차 notice-fill2) · 브랜치 `feat/notice-to-mcm`
- 사용자 결정(2026-10-07): 「공지사항이 왜 MLS 에 있어? MCM 에 있어야 하는 거 아냐?」 → 「옮기자. 임시 조치(.run.env 에 --mls)는 필요 없다.」
- 배경: [DEC-001](../../ai-build-log/DEC-001_noticeMgmt-on-mls.md) 은 09-03 에 빈 mls 모듈을 재활용했고 재검토 조건을 「실제 업무로 승격되면 옮긴다」로 두었다.
  10-02 부터 포털 홈 공지 위젯·긴급 공지 띠가 `noticeBoard` 를 부르므로, MLS(8092)가 꺼지면 홈에 「공지사항을 불러오지 못했습니다」가 뜬다(10-07 실제 발생).

## 1. 결정 요약

| 항목 | 결정 | 근거 |
|---|---|---|
| Java 위치 | **mcm-core** `com.dongkuk.dmes.mcm.notice.*` | 위젯·즐겨찾기·조회 기본값(secSrchDflt) 선례. mcm JpaConfig 가 `com.dongkuk.dmes.mcm` 을 스캔하고, 다른 호스트는 mcm-core 를 스캔하지 않으므로 빈이 퍼지지 않는다(McmCoreAutoConfiguration javadoc) |
| BPMN 위치 | **mcm/api** `services/lsh/{noticeMgmt,noticeBoard}.bpmn` | mcm-core 리소스에 두면 mcm-core 를 쓰는 모든 호스트가 로드한다. 폴더는 화면 그룹명(`lsh`), serviceId 는 그대로 |
| 화면 ID·그룹 | **`lsh/noticeMgmt` 유지** (결정 D1) | 메뉴 폴더 `lsh` 가 이미 공통관리(mcm) 아래 있다. componentPath·즐겨찾기 FULL_ID 가 바뀌지 않는다 |
| pageId | `mls:lsh/noticeMgmt` → `mcm:lsh/noticeMgmt` | pageId 는 `{SYSTEM_CODE}:{componentPath}` 다. 메인 mcm.db 에 `mls:lsh` 를 가진 행 0건(10-07 덤프 확인) → 코드만 바꾼다 |
| 테이블 | `TB_MLS_NOTICE`·`TB_MLS_NOTICE_TARGET` → **`TB_MCM_NOTICE`·`TB_MCM_NOTICE_TARGET`** (`schema="MCMAPUSER"`) | mcm 명명 규칙(`TB_MCM_*`), WidgetDef 선례. SQLite 에서는 mcm.db 에 생긴다 |
| 스키마 관리 | mcm ddl-auto update. `@Table(indexes=…)` 로 인덱스 2개 선언, 기본값은 엔티티 초기값으로 보장 | ddl-auto 는 DEFAULT·인덱스를 DDL 에서 만들지 않는다 |
| mls Flyway V2~V4 | **mls 에 그대로 둔다** | mls.db 이력에 V2~V4 가 적용됨으로 남아 있어 파일을 빼면 validate 단계에서 mls 기동이 실패한다 |
| 데이터 이전 | 1회 스크립트 `scripts/data/notice-mls-to-mcm.mjs`(node:sqlite, INSERT OR IGNORE, dry-run 기본) | mls.db 행은 지우지 않는다. 기동 시 자동 복사는 mcm 이 mls DB 경로에 묶이므로 쓰지 않는다 |
| 기존 DB 보정 | mcm `ModuleMenuSeeder` 에 멱등 UPDATE: `TB_MCM_SEC_OBJ.SYSTEM_CODE='mls'` → `'mcm'` (OBJECT_ID in noticeMgmt·noticeBoard) | 시드가 insert-if-absent 라 기존 행이 그대로 남는다. 권한키 모듈 = OBJECT SYSTEM_CODE(UserPermCache) 이므로 보정이 없으면 `/api/mcm/oasis/noticeMgmt/*` 가 403 |
| MLS 뒤처리 | 공지 코드만 git mv 로 옮기고 mls 모듈·m-mls 앱·포털 등재·BFF 라우팅은 남긴다 (결정 D2) | 파일·모듈 삭제 금지. 빈 껍데기 정리는 조정자 선택 |

## 2. 옮길 것 (git mv, 이력 보존)

### 백엔드 — mls → mcm-core / mcm-api

| 옛 위치(mls) | 새 위치 |
|---|---|
| `lib/.../mls/entity/Notice.java`, `NoticeTarget.java` | `mcm-core/.../mcm/notice/entity/` |
| `lib/.../mls/repository/NoticeRepository.java`, `NoticeTargetRepository.java` | `mcm-core/.../mcm/notice/repository/` |
| `lib/.../mls/lsh/common/{NoticeCodes,NoticeHtmlSanitizer}.java` | `mcm-core/.../mcm/notice/common/` |
| `lib/.../mls/lsh/noticeMgmt/{dto,service}/*` | `mcm-core/.../mcm/notice/noticeMgmt/{dto,service}/` |
| `lib/.../mls/lsh/noticeBoard/{dto,service}/*` | `mcm-core/.../mcm/notice/noticeBoard/{dto,service}/` |
| `lib/src/test/.../lsh/common/NoticeHtmlSanitizerTest.java` | `mcm-core/src/test/.../mcm/notice/common/` |
| `api/.../resources/services/lsh/{noticeMgmt,noticeBoard}.bpmn` | `mcm/api/.../resources/services/lsh/` |
| `api/src/test/.../lsh/noticeMgmt/{NoticeMgmtServiceTest,NoticeMgmtMdmSaveTest,NoticeMgmtMdmRealValidatorTest}.java`, `noticeBoard/NoticeBoardServiceTest.java` | `mcm-core/src/test/.../mcm/notice/...` (JPA 시험 설정은 `SrchDfltJpaTestConfig`·`WidgetMemoJpaTestConfig` 선례로 새로 둔다) |
| `api/src/test/.../lsh/{NoticeBpmnActionTest,NoticeOasisHttpTest}.java` | `mcm/api/src/test/.../mcm/notice/` (`SecSrchDfltBpmnActionTest`·`OasisPathActionBpmnTest` 선례로 고쳐 쓴다) |

- `MlsTestDb.java`(Flyway 로 mls.db 사본을 만드는 시험 도우미)는 공지 시험만 쓰지만 mls Flyway 전용이라 mcm 에서는 쓸 수 없다. mls 에 남기고 D2 정리 때 함께 판단한다.
- jsoup 의존(`NoticeHtmlSanitizer`)을 mcm-core `build.gradle` 에 추가한다. mls `lib/build.gradle` 의 jsoup 은 쓰는 곳이 없어지지만 삭제하지 않는다(D2 정리 때).
- 트랜잭션: mcm 도 `cactus.oasis.transactional: true` 라 공지 save(공지 1행 + 게시 대상 여러 행)의 원자성은 mls 와 같다. 서비스에 `@Transactional` 을 새로 붙이지 않는다.
- MDM 저장 검증: `MdmValidator`(cactus) 는 mcm 에도 있다(`cactus.mdm.module: mcm`). 검사 컬럼은 `TITLE` 하나로 표준 물리명 매칭이라 모듈 이름과 무관하다.
- 주석·javadoc 의 `TB_MLS_NOTICE`·`mls` 언급은 새 이름으로 고친다.

### 화면 — m-mls → m-mcm

| 옛 위치 | 새 위치 |
|---|---|
| `m-mls/pages/lsh/noticeMgmt/*` (9 파일) | `m-mcm/page-components/lsh/noticeMgmt/*` |
| `m-mls/tests/lsh/noticeMgmt/*` (7 파일) | `m-mcm/tests/lsh/noticeMgmt/*` |

- `m-mls/tsup.config.ts` 의 `pages/lsh/noticeMgmt/page` entry 를 뺀다. page-registry 를 재생성해 `"lsh/noticeMgmt"` 가 m-mcm 경로를 가리키게 한다.
- `SearchArea`·`defaultKey="postStartDt"`·`autoSearch` 등 조회 기본값 선언은 내용 그대로 옮긴다(search-defaults 레인 단계 4 머지 뒤 dev 를 합친다).
- 홈: `page-components/home/api.ts`·`types.ts` 의 `/api/mls/oasis/noticeBoard/search` → `/api/mcm/...`, `NOTICE_MGMT_PAGE_ID` → `mcm:lsh/noticeMgmt`. `widgets/home/notice/widget.meta.ts` linkPageId 도 같다.
- `proxy.ts` authOnlyPrefixes `/api/mls/oasis/noticeBoard/search` → `/api/mcm/oasis/noticeBoard/search`. `tests/http/path-guard.test.ts` 의 통과·우회 경로도 mcm 으로 바꾼다. mcm-core `EndpointPermissionFilter` 의 `noticeboard/search` 는 모듈 무관이라 그대로 두고 주석만 고친다.
- 예시 문자열(`mls:lsh/noticeMgmt` placeholder·시험 픽스처)은 `mcm:lsh/noticeMgmt` 로 바꾼다. 위젯 링크 해석은 문자열을 그대로 쓰므로 동작 차이는 없다.
- `m-mdm/tests/fixtures/ui-meta-lock.json` 은 dev 합친 뒤 `UPDATE_UI_META_LOCK=1` 로 재기록한다.

### 메뉴·권한 seed (mcm `ModuleMenuSeeder`)

- `seedMlsMenus()` → `seedNoticeMenus()` 로 이름을 바꾸고 `insertMcmSecObjIfAbsent("noticeMgmt", "공지사항 관리", "mcm")`.
- 새 멱등 보정 `moveNoticeObjectsToMcm()`: `UPDATE TB_MCM_SEC_OBJ SET SYSTEM_CODE='mcm' WHERE OBJECT_ID IN ('noticeMgmt','noticeBoard') AND SYSTEM_CODE='mls'`. 삭제 없음. 메뉴 관리 화면에서 사용자가 다른 값으로 바꾼 경우(mls 가 아닌 값)는 건드리지 않는다.
- 폴더 `lsh`·leaf `noticeMgmt`·`SYSADMIN × PERM_ALL` 은 그대로. `CoreRbacSeeder` 의 changeStatus 주석만 고친다.
- 권한 캐시(UserPermCache, TTL 10분)·BFF 권한 캐시는 mcm 재기동으로 비워진다.

## 3. 스키마

`TB_MCM_NOTICE`(공지)·`TB_MCM_NOTICE_TARGET`(게시 대상 역할)은 mls V2~V4 를 합친 최종형과 컬럼이 같다.
`docs/mcm/erd/` 에 `notice.dbml`·`notice-tables.md` 로 등재하고, 운영 DDL(Oracle·PostgreSQL)은 `notice-tables.md` 에 문서로만 둔다.
기본값(`CONTENT_FORMAT='TEXT'`, `NOTICE_CATEGORY='NORMAL'`, `PIN_YN='N'`, `TARGET_SCOPE='ALL'`)은 운영 DDL 에 DEFAULT 로 적고, 로컬(ddl-auto)은 엔티티 초기값으로 보장한다.
인덱스: `IX_TB_MCM_NOTICE_STATUS(NOTICE_STATUS)`, `IX_TB_MCM_NOTICE_TARGET_ROLE(ROLE_ID)`.
mls V2 의 시드 3건은 mcm 에 다시 시드하지 않는다(DEC-001 TE-005 — 업무 데이터는 시드가 아니라 이전 대상).

## 4. 데이터 이전

- 대상(10-07 메인 mls.db): `TB_MLS_NOTICE` 6행, `TB_MLS_NOTICE_TARGET` 0행.
- 첨부·이미지: 공지 코드에 업로드·첨부 저장소가 없다(`upload|attach|multipart` grep 0건). HTML 본문 1건의 `<img>` 는 src 가 없는 빈 태그다. 함께 옮길 파일은 없다.
- 도구: `node scripts/data/notice-mls-to-mcm.mjs --mls <mls.db> --mcm <mcm.db> [--apply]`
  - 기본은 dry-run: 원본 건수, 이미 있는 NOTICE_ID 수, 넣을 건수를 표로 보여 준다.
  - `--apply`: 한 트랜잭션에서 `INSERT OR IGNORE` 로 복사한다. 같은 NOTICE_ID 가 이미 있으면 덮어쓰지 않고 건너뛴 ID 를 목록으로 보고한다(mcm 에서 먼저 만든 공지와 채번이 겹친 경우 사람이 판단).
  - mcm 쪽 테이블이 없으면(mcm 을 새 코드로 한 번도 띄우지 않음) 아무것도 쓰지 않고 멈춘다.
  - `busy_timeout` 5초, mls.db 는 읽기 전용으로 연다. 행 삭제 없음.
  - node 22.13 이상 내장 `node:sqlite` 를 쓴다(윈도우도 같은 명령, 외부 패키지 없음).
- 순서(메인): ① 머지 → ② mcm 재기동(테이블 생성·SYSTEM_CODE 보정) → ③ 조정자 알림 뒤 dry-run → `--apply` → ④ 홈 공지 확인. MLS 는 공지와 무관해지므로 단독 기동(8092)을 내려도 된다.
- 운영: 같은 내용을 `INSERT INTO MCMAPUSER.TB_MCM_NOTICE SELECT … FROM <mls 스키마>.TB_MLS_NOTICE WHERE NOT EXISTS …` 로 문서화한다(`notice-tables.md`).

## 5. 결정 필요 항목 (추천안으로 진행)

- **D1 화면 그룹**: A(추천) `lsh` 유지 — mcm 아래 `lsh` 는 식별자 사전 A.2.1 MUST(`cm?` 접두) 예외다. 식별자 사전 A.2.3 에 mcm·lsh 행을 「mls 에서 이전, 메뉴 폴더·즐겨찾기 보존 위해 예외 유지」로 등재하고 DEC-001 에 기록한다(mcm 에는 이미 `csa` 라는 비-`cm` 그룹이 있다).
  B `cm?` 새 코드 — 메뉴 폴더 ID·leaf 부모·componentPath·즐겨찾기 FULL_ID·page-registry 를 함께 바꾸는 UPDATE 보정이 더 든다.
- **D2 MLS 빈 껍데기**: A(추천) 그대로 둔다 — 샘플(SampleInventoryItem)·포털 등재·BFF 라우팅·mls Flyway 이력·cactus 설정 유지, 기동은 선택 사항이 된다. B 별도 정리 레인에서 mls 의 cactus·MDM 설정과 jsoup 의존을 걷어 낸다. C 모듈·앱 삭제(사용자 승인 필요).

## 6. 확인

- 시험: mcm-core 공지 JPA 시험, mcm/api BPMN·HTTP 시험, oasis-contract-check, m-mcm vitest·tsc(바뀐 파일), 골든(FINGERPRINT·MSSQL·ui-meta-lock) 충돌 시 재생성, 머지 직전 heavy.sh 전체 1회.
- 브라우저(brief §4 — 공통 방식의 「조정자가 기동」보다 brief 가 우선): 워크트리 포털 5108 + 워크트리 전용 백엔드 포트·DB 사본, **MLS 미기동** 상태에서 (a) 홈 공지 위젯·긴급 공지 띠, (b) 공지 관리 조회·등록·수정, (c) 메뉴 진입, (d) 조회 기본값 설정 아이콘.
