# MDM 환율 마스터 · 통화 카테고리 · 예약 작업 샘플 · 환율 위젯 연결 설계

- 레인: fx-master (브랜치 `feat/mdm-fx-master`), 지시 `fx-master-1`, 작성일 2026-10-09
- 사용자 지시 원문: 「스케줄 작업에 다른 모듈(MDM)에 대한 작업을 샘플로 만들자. 환율을 마스터 데이터로 만들고 각 화폐에 대해서 카테고리도 만들자. 위젯도 이 데이터를 보도록 하자.」
- 상태: 설계 확정 대기(조정 보고용). 결정마다 선택지·권장·근거를 적는다.

## 1. 조사 결과 요약 (설계의 전제)

| 항목 | 사실 | 근거 |
|---|---|---|
| MDM 의 마스터 정의 방식 | 마스터마다 표를 만들지 않는다. `TB_MDM_DATA`(정의 1행)와 `TB_MDM_DATA_ITEM`(범용 항목, 문자열 칸 `ATTR01~10`·`LVL1~5`)을 공유한다. 화면은 `dataMng`(정의)·`dataItemMng`(항목) 하나로 모든 마스터를 다룬다 | `mdm/api/.../db/migration/mdm/oracle/V1__baseline.sql:253,336`, `m-mdm/pages/dmd/dataItemMng/columns.tsx` |
| 항목 이력 | 선분 이력이다. `VALID_FROM`~`VALID_TO`(열린 끝 `9999-12-31`). 시각은 저장 시각이라 과거 날짜로 소급해 넣을 수 없다 | `DataItemSaveCore` |
| 카테고리 | 마스터 안의 분류다. `TB_MDM_DATA_CATE`(`REGEX`: 대상 칸+정규식, `TABLE`: 명시 소속) 와 `TB_MDM_DATA_CATE_ITEM`. 기본 카테고리 ID 는 `BASE` | `V1:291`, `CategoryConventions` |
| 외부 원천 마스터 | `SOURCE_KIND='EXTERNAL'` + `SOURCE_SYSTEM` 인 마스터는 화면 수정이 막히고, `DataItemSaveCore.upsert(마스터, API, 호출시스템, 행들, dryRun)` 로만 쓴다(없으면 INSERT·바뀌면 UPDATE·같으면 NONE, 한 트랜잭션). API 경로는 칸 길이만 검사한다 | `DataItemChecks.requireSourcePath`, `DataItemSaveCore.java:154` |
| 마스터 데이터 캐시 | 마스터데이터(DATA)는 메타 캐시(`TB_MDM_META_REV`) 대상이 아니다. 쓰기 서비스(`dmd`)도 기록기를 부르지 않는다 | 캐시 설계 2026-10-02 §범위 밖, `MetaTargetType` |
| mdm 앱의 mcm-core 사용 | `mdm/lib` 이 `api libs.mcm.core` 로 의존한다. mcm-core 는 `McmCoreAutoConfiguration` 으로만 들어와 `JobConfig` 는 올라오지만, 위젯 `widget/ext` 빈(`@Component`)은 스캔되지 않는다 | `mdm/lib/build.gradle:24`, `McmCoreAutoConfiguration` |
| 외부 환율 수집기 | `FrankfurterProvider`·`KoreaEximProvider` 는 public 클래스이고 public 생성자 `(WidgetExtProperties)` 가 있다. `WidgetExtProperties` 도 public(`dmes.widget.ext.*`) | `widget/ext/*.java` |
| 기존 환율 저장 | `MCMAPUSER.TB_MCM_EXCHANGE_RATE`(BASE_CUR·QUOTE_CUR·RATE_DATE PK, RATE number(20,8)). `ExchangeService` 가 요청 때 빠진 영업일을 외부에 물어 `ExchangeRateWriter` 로 쓰고 읽는다. 위젯 응답 `{latest[{cur,rate,diff,date}], history[{date,cur,rate}], stale?, disabled?}` | `widget/ext/ExchangeService.java` |
| 예약 작업 | `ScheduledJob` 빈을 앱 모듈 패키지 `@Configuration` 에 `@Bean` 으로 두면 기동 때 `TB_MCM_JOB_HANDLER` 등록과 `defaultCron` 이 있으면 `TB_MCM_JOB_DEF` CODE 작업 자동 생성. mdm 에는 아직 빈이 없다. `dmes.job.module: mdm`·`cactus.oasis.transactional: true` 는 이미 켜져 있다 | `JobHandlerRegistrar`, `mdm/api/application.yml:41,66` |
| Flyway | mdm Oracle 위치 `mdm/api/src/main/resources/db/migration/mdm/oracle/` 의 최신은 V2, 다음은 **V3** | `flyway-migration-add` 스킬 |
| 메뉴·권한 | 마루 데이터 화면 메뉴는 이미 `dataMng`·`dataItemMng` 로 등록돼 있다(MCM `MdmMenuSeeder`) | `MdmMenuSeeder.java:171` |

## 2. 결정

### D1. 데이터 모델 — 마스터 두 개를 `TB_MDM_DATA` 방식으로 등록한다 (새 표·새 방식 없음)

| 선택지 | 내용 | 판단 |
|---|---|---|
| **A (권장)** | 마루 데이터 두 개: **`CUR` 통화**(MDM 원천, 사람이 `dataItemMng` 로 관리) 와 **`FX_RATE` 환율**(EXTERNAL 원천, 출처 시스템 `MDM`(§6 R1), 예약 작업만 씀) | 기존 마스터 관리 화면으로 둘 다 볼 수 있어 새 화면이 필요 없다. 지시 4번 충족 |
| B | 환율 전용 새 표 `TB_MDM_FX_RATE` + 전용 화면 | 「기존 방식을 그대로 따른다 — 새 방식 금지」 위반 |
| C | 환율을 통화 마스터 하나의 선분 이력(통화 키, 값=환율)으로 | 선분 시각이 저장 시각이라 과거 소급 입력이 불가하고, 30·90일 이력(스파크라인)을 못 채운다 |

**`CUR` 통화** (SOURCE_KIND=MDM, `CODE_PATTERN=^[A-Z]{3}$`, LVL_CNT=0)

| 칸 | 의미 |
|---|---|
| 키 `CODE` | ISO 4217 통화 코드(USD) |
| `NAME` | 통화 이름(미국 달러) |
| `ALTER_NAME` | 영문명 |
| `SEQ` | 표시 순서 |
| `ATTR01` 지역 | `ASIA` `EUROPE` `AMERICAS` `OCEANIA` `LOCAL`(KRW) |
| `ATTR02` 고시 단위 | 외부 고시 기준 수량(JPY=100, 그 밖 1). 환율은 모두 1단위 기준으로 정규화해 저장하므로 참고 정보 |
| `ATTR03` 소수 자릿수 | 화면 표시용(KRW 0, 그 밖 2) |
| `ATTR04` 환율 수집 | `Y`/`N`. 예약 작업이 이 값이 `Y` 인 통화만 수집한다(KRW 는 `N`) |

초기 항목은 지금 위젯 편집기가 고르는 11개(USD EUR JPY CNY GBP AUD CAD CHF HKD SGD THB)와 기준통화 KRW 다.

**통화 카테고리** (`TB_MDM_DATA_CATE`, 사용자 지시 「각 화폐에 대해서 카테고리」)

| 카테고리 | 종류 | 정의 | 소속 |
|---|---|---|---|
| `BASE` | 기본 | 마스터 등록 때 기본으로 생기는 전체 | 전부 |
| `MAJOR` 주요 통화 | REGEX | 대상 `KEY`, `^(USD|EUR|JPY|CNY)$` | USD EUR JPY CNY (위젯 초기 설정과 같은 4통화) |
| `ASIA` 아시아 | REGEX | 대상 `ATTR01`, `^ASIA$` | JPY CNY HKD SGD THB |
| `EUROPE` 유럽 | REGEX | 대상 `ATTR01`, `^EUROPE$` | EUR GBP CHF |
| `AMERICAS` 아메리카 | REGEX | 대상 `ATTR01`, `^AMERICAS$` | USD CAD |
| `OCEANIA` 오세아니아 | REGEX | 대상 `ATTR01`, `^OCEANIA$` | AUD |

카테고리를 REGEX 로 정의하는 이유는 소속이 항목 칸에서 자동으로 정해져 통화를 추가해도 카테고리 쓰기가 따로 필요 없고, 현재 MDM 의 `dataItemMng` 카테고리 탭이 REGEX 를 1급으로 지원하기 때문이다(`cate/defTargetOptions.ts`).

**`FX_RATE` 환율** (SOURCE_KIND=EXTERNAL, SOURCE_SYSTEM=`MDM`, LVL_CNT=0)

| 칸 | 의미 |
|---|---|
| 키 `CODE` | `<통화><기준일 yyyyMMdd>` 예 `USD20261009`(11자, 키 칸 50자 이내). 같은 통화·같은 날은 항상 같은 키라 재수집이 멱등 upsert 가 된다 |
| `NAME` | `USD 2026-10-09`(사람이 읽는 이름) |
| `ATTR01` 통화 | `USD` |
| `ATTR02` 기준일 | `20261009` |
| `ATTR03` 환율 | `1384.51000000` — 1 대상통화당 원화, **소수 8자리 고정 문자열**(저장 때 `BigDecimal.setScale(8)` 로 문자열화해 `sameAs` 비교가 흔들리지 않게 한다) |
| `ATTR04` 기준통화 | `KRW` |
| `ATTR05` 출처 | 제공자 ID(`koreaexim`/`frankfurter`) |

카테고리: `BASE` 와, 환율 전체를 통화별로 걸러 볼 수 있게 `MAJOR`(대상 `ATTR01`, `^(USD|EUR|JPY|CNY)$`) 만 둔다. 환율 쪽에 지역 카테고리까지 중복하지 않는다(통화 분류는 `CUR` 가 정본).

값이 문자열인 한계는 알고 간다: 환율은 `ATTR03` 문자열을 읽는 쪽에서 `BigDecimal` 로 파싱한다. 기준일(`ATTR02`)은 `yyyyMMdd` 고정 문자열이라 사전순 비교가 날짜순 비교와 같아 범위 조회가 된다.

### D2. 시드 방식 — Flyway V3 로 정의·카테고리·초기 통화 항목을 넣는다

| 선택지 | 판단 |
|---|---|
| **A (권장)** | `V3__fx_master_seed.sql`(Oracle 전용, MERGE 로 멱등). 정의 2행 + 카테고리 + `CUR` 항목 12행. 운영 WildFly 는 DBA 가 같은 V 파일을 적용하는 기존 흐름과 같다 |
| B | 로컬 샘플 SQL 이나 E2E 픽스처에만 넣기 | 작업이 마스터 정의가 없으면 실패하므로 공용 DB 에도 반드시 있어야 한다. 샘플 파일은 Flyway 밖이고 SQLite 문법이라 부적합 |

`FX_RATE` 항목(환율 값)은 시드하지 않는다. 예약 작업이 채운다. 메타 캐시 대상이 아니므로 `META_REV` 기록은 필요 없다(근거: §1 표).

### D3. 예약 작업 `mdm.exchangeRateSync`

- 위치: `mdm/lib/.../mdm/job/` (`MdmJobConfig` 의 `@Bean ScheduledJob` + `ExchangeRateSyncService`). JobModule.MDM, 이름 「환율 마스터 동기화」.
- **defaultCron `10 11 * * 1-5` (평일 11:10 KST)**. 근거: 한국수출입은행 현물환율 API 는 영업일 오전 11시 이후에 당일 고시분을 준다(11시 이전·비영업일 호출은 빈 결과). 10분 여유를 둔다. 재시도는 화면의 재시도 옵션(0~5회·1~120분)으로 사용자가 정한다(권장 2회·10분).
- 변수 `defaultVars`: `lookbackDays`(기본 5), `provider`(비우면 설정 `dmes.widget.ext.exchange.provider` 규칙: koreaexim 키가 있으면 koreaexim, 아니면 frankfurter).
- 실행 순서
  1. `CUR` 에서 현재 유효하고 `ATTR04=Y` 인 통화를 읽는다(`KRW` 제외). 없으면 예외.
  2. `[오늘-lookbackDays, 오늘]` 구간을 제공자에게 묻는다. 제공자 호출은 mcm-core 의 `ExchangeRateProvider.fetch(base=KRW, symbols, from, to)` 를 그대로 쓴다(중복 구현 없음).
  3. 결과를 `UpsertRow(code=통화+yyyyMMdd, value)` 로 만들어 `DataItemSaveCore.upsert("FX_RATE", API, "MDM", rows, false)` 를 **한 번** 호출한다.
  4. 처리 건수 = 이번 호출로 INSERT·UPDATE 가 된 행 수(NONE 제외)를 돌려준다. 새 값이 없으면 0 이다(정상).
- 실패: 제공자 오류(`WidgetExtException`), 일부만 받은 경우(`WidgetExtPartialException`)는 받은 만큼을 쓰고 예외를 던져 FAIL 로 남긴다(재시도 규칙 적용). 마스터 정의가 없거나 upsert 이슈가 있으면 예외. 메시지에 URL·인증키를 넣지 않는다.
- 제공자 빈 조립: mdm 앱에는 `widget/ext` 빈이 없으므로 `MdmJobConfig` 가 `@EnableConfigurationProperties(WidgetExtProperties.class)` 로 설정을 바인딩하고 두 제공자를 `new` 로 만들어 빈으로 둔다. **mcm-core 코드는 바꾸지 않는다**(공개 범위 변경도 불필요).
- 트랜잭션: `upsert` 자체가 한 트랜잭션이다. 외부 HTTP 호출은 트랜잭션 밖에서 먼저 끝낸다.

### D4. 환율 위젯 원천 전환

현재: 위젯 요청 → `ExchangeService`(mcm 앱) → `TB_MCM_EXCHANGE_RATE` 읽기 + 빠진 날 외부 조회·저장.
전환: `ExchangeService` 가 `MDMAPUSER.TB_MDM_DATA_ITEM`(`MARU_DATA_ID='FX_RATE'`)의 현재 유효 행을 읽는다.

| 결정 | 선택지 | 권장 |
|---|---|---|
| 읽는 방법 | (a) mcm 앱이 `MDMAPUSER.` 접두로 직접 SELECT (b) mcm→mdm OASIS HTTP | **(a)** 읽기 전용 1개 쿼리(`FxMasterReader`, `widget/ext`). 앱 간 런타임 의존이 없고, 스키마 간 접두 읽기는 oracle-1007 연결 규약이 허용한다. 운영은 DBA 가 `MCMAPUSER` 에 `MDMAPUSER.TB_MDM_DATA_ITEM` SELECT 를 부여해야 한다(적용 절차에 명시) |
| 마스터에 값이 없을 때 | (i) 빈 상태 안내 (ii) 기존 실시간 조회 폴백 | **(i) 빈 상태 + 낡음 표시.** 폴백은 마스터를 우회해 값이 갈리고 작업 실패가 가려진다. 응답 `disabled`(데이터 없음 안내)를 재사용하고, 가장 최근 기준일이 4영업일 넘게 낡았으면 `stale:true` 로 기존 「갱신 실패」 배지를 켠다 |
| 외부 조회 코드 | 제거 vs 유지 | `ExchangeService` 에서 외부 제공자 호출·사용자 한도·시도 기록 경로를 걷어낸다. `ExchangeRateProvider` 류와 `ExchangeCollectSource`(예약 수집)는 그대로 둔다 |
| 기존 `TB_MCM_EXCHANGE_RATE` | DROP vs 보존 | **보존(DROP 금지, 지시).** 더 이상 쓰지 않는 표로 두고, 정리는 사용자 결정 후속으로 올린다. `ExchangeRateWriter`·`ExchangeRateRepository` 도 코드는 남기되 위젯 경로에서 호출하지 않는다 |

- 응답 모양·위젯 설정·화면은 그대로다: `{latest[{cur,rate,diff,date}], history[{date,cur,rate}], stale?, disabled?}`. `rate`·`diff` 는 지금처럼 double. `latest` 는 통화별 최신 기준일 1건과 직전 기준일 대비 차이.
- 요청 검증(`ExchangeAllowList`: 허용 통화·기간·개수)은 그대로 둔다.
- 통화 목록 근거를 `CUR` 로 옮기는 것(위젯 편집기 통화 선택지를 마스터에서 읽기)은 이번 범위 밖이다(후속). 편집기의 하드코딩 11개는 시드 `CUR` 와 같다.
- 현재 유효 행 판정: 열린 행(`VALID_TO = TIMESTAMP '9999-12-31 00:00:00'`)만 읽는다(§6 R5). DB 시각 함수·칼럼 함수를 쓰지 않는다. 범위는 `ATTR02 BETWEEN :from AND :to`(문자열 사전순), 통화는 `ATTR01 IN (...)`. 항목 수(통화 11 × 영업일 연 260 ≈ 연 2,900행)가 작아 `MARU_DATA_ID` 접두 PK 스캔으로 충분하다. 인덱스 추가는 하지 않는다(필요하면 실측 뒤 후속).

### D5. 메뉴·권한

새 화면을 만들지 않는다. 마스터 관리는 기존 `dataMng`/`dataItemMng` 메뉴로 보이고, `FX_RATE` 는 EXTERNAL 이라 화면에서 읽기 전용이다. 예약 작업은 기존 「예약 작업 관리」(`csa/jobSchedMng`) 목록에 모듈 `MDM` 으로 뜬다. 메뉴·권한 시드는 변경 없음. 새 OASIS 액션도 없다.

## 3. 구현 묶음 (파일이 겹치지 않게)

| 묶음 | 소유 파일 | 내용 |
|---|---|---|
| B1 마스터 시드 | `mdm/api/src/main/resources/db/migration/mdm/oracle/V3__fx_master_seed.sql` + Oracle 시험 | 정의·카테고리·`CUR` 항목 MERGE, 멱등 시험 |
| B2 동기화 작업 | `mdm/lib/.../mdm/job/*` + 단위·Oracle 시험, `JobAgentWiringTest` 보강 | D3 |
| B3 위젯 원천 | `mcm-core/.../widget/ext/FxMasterReader.java`·`ExchangeService.java`·시험, 프런트 `widget-types/exchange`·`_ext`(빈 상태 문구만) | D4 |

B1 이 먼저 끝나야 B2·B3 의 Oracle 시험이 마스터를 볼 수 있다. B2·B3 는 병행 가능.

## 4. 시험·확인 계획

- B1: Flyway 적용 뒤 정의 2행·카테고리·`CUR` 12행, 재적용 멱등.
- B2: 가짜 제공자로 upsert 건수·재실행 시 NONE(0건)·통화 필터(`ATTR04`)·제공자 실패 시 예외 시험. 실제 외부 호출은 단위 시험에서 하지 않는다.
- B3: 마스터 행을 넣고 `ExchangeService.exchange` 응답 모양(latest·diff·history)·빈 상태·낡음 시험.
- 화면: 워크트리 서버(백엔드 18096·18100, 프런트 5112)로 환율 위젯, `dataMng`/`dataItemMng` 의 `CUR`·`FX_RATE`, 예약 작업 관리 목록의 mdm 작업을 ego-browser 로 확인하고 작업 공간을 닫는다.
- DB 는 레인 PDB(`pdb.mjs clone`)만 쓴다. 공용 L_MAIN 은 쓰지 않는다.

## 5. 사용자 결정이 필요한 것 / 후속

- 필요 없음(권장안으로 진행): 위 D1~D5.
- 후속 후보(이번에 하지 않음): ① 기존 `TB_MCM_EXCHANGE_RATE` 정리 ② 위젯 편집기 통화 목록을 `CUR` 에서 읽기 ③ 마스터 데이터(DATA) 메타 캐시 편입 ④ 운영 `MDMAPUSER` SELECT GRANT(DBA).

## 6. 설계 검토(opus/high) 반영 — 확정 변경

검토에서 블로커 4건과 놓친 결정 4건이 나왔다. 아래로 본문을 덮어쓴다(충돌하면 이 절이 우선).

| 번호 | 지적 | 결정 |
|---|---|---|
| R1 | `SOURCE_SYSTEM` 은 `TB_MDM_SYSTEM`(ERP·MES·APS·DKMS·L2·MDM) 외래 키라 `FXSYNC` 가 ORA-02291. 새 코드를 넣으면 `MdmSystemCodes.SEEDED`·시스템 선택 목록이 바뀐다 | **기존 코드 `MDM` 재사용.** 환율은 MDM 앱 안의 예약 작업이 직접 채우는 값이라 원천 시스템이 MDM 이다. `callerSystem` 도 `"MDM"` |
| R2 | `run()` 은 OASIS 트랜잭션 안이라, upsert 뒤 예외를 던지면 일부 수신분도 롤백된다. HTTP 도 그 안에서 돈다 | upsert 만 `TransactionTemplate(REQUIRES_NEW)` 로 감싸 먼저 커밋하고, 제공자 부분 실패면 커밋 뒤에 예외를 던진다. HTTP 는 OASIS 트랜잭션 안에서 도는 것을 감수한다(호출은 구간당 1회·제한 시간 짧음) |
| R3 | 시험 하니스(`MdmSharedTestDb.resetForTestClass`)는 V1 시드만 복원한다 | B2·B3 시험은 정의·`CUR`·`FX_RATE` 행을 시험 안에서 직접 넣는다. V3 시드는 별도 Flyway 적용 시험(B1)으로만 확인한다 |
| R4 | mcm-core 에 `MDMAPUSER.` 를 박지 않는다. 표 주인 V 파일이 GRANT 를 포함하는 것이 관례 | 스키마명은 설정 `dmes.widget.ext.exchange.mdm-schema`(기본 `MDMAPUSER`, `^[A-Z][A-Z0-9_]{0,29}$` 검사). mdm V3 끝에 `MCMAPUSER` 가 있을 때만 `GRANT SELECT ON TB_MDM_DATA_ITEM` 하는 PL/SQL 블록을 둔다(없으면 건너뜀). MDM 표를 못 읽는 사이트는 `ExchangeService` 가 「데이터 없음」 응답으로 내려간다(ORA-00942 를 위젯 오류로 올리지 않는다) |
| R5 | 유효 행 판정에 DB 시각 함수 금지(S10) | 열린 행만(`VALID_TO` = 열린 끝) 읽는다. 통화별 기본 키 범위(`CODE BETWEEN 'USD20260901' AND 'USD20261009'`)로 읽는다. 조건: `ATTR04='KRW'`, `ATTR03` 이 숫자가 아닌 행은 건너뛴다 |
| R6 | 시드 불변식 | V3 는 `STATUS='INUSE'`, `LVL_CNT=0`, `CHG_SEQ=0`, `LAST_CHG_SEQ=0`, `VER=0`, 감사 칸을 채우고, 쓰는 `ATTRnn_NAME` 라벨을 모두 채운다. `BASE` 카테고리는 `CATE_NAME='전체'`, `REGEX`, `.*`, `KEY`. 선분은 `VALID_FROM` 초 단위 고정값·`VALID_TO='9999-12-31 00:00:00'`·`ROW_VERSION=0`. MERGE 키에 `VALID_FROM` 을 넣지 않는다(열린 행 중복 방지). `CUR`·`FX_RATE` 가 `TB_MDM_CODE` 에 없는지 확인한다 |
| R7 | upsert 이슈는 예외가 아니라 `written=false` 로 온다. NAME 비면 ORA-01400. 같은 키가 한 번에 둘이면 CHK6 | 작업이 `written`/이슈를 검사해 예외로 바꾼다. NAME 은 항상 채우고 키는 넘기기 전에 중복 제거한다 |
| R8 | `disabled` 문구가 「데이터 없음」과 안 맞고 `_ext/types.ts` 는 날씨와 공유. 4영업일 기준은 연휴에 오탐 | 응답에 `empty:true`(마스터에 값 없음)를 더하고 위젯은 `disabled` 와 구분된 안내(「환율 마스터에 값이 없습니다. 예약 작업 mdm.exchangeRateSync 를 확인하세요」)를 보인다. 낡음은 최신 기준일이 **10일 넘게** 지났을 때 `stale:true` |
| R9 | mdm `application.yml` 에 `dmes.widget.ext.*` 가 없다 | mcm `application.yml` 과 같은 블록(수출입은행 키 `WIDGET_KOREAEXIM_KEY`, provider, enabled)을 mdm 에 더한다. 작업은 `enabled=false` 면 건너뛴다(0건 반환, 로그). 운영은 mdm 서버의 외부망 허용이 필요하다(적용 절차에 명시) |
| R10 | 처음 이력이 비어 있다 | 작업 시작 때 `FX_RATE` 에 수집 대상 항목이 하나도 없으면 `lookbackDays` 대신 90일(첫 실행 백필)로 한 번 돌린다. 옛 `TB_MCM_EXCHANGE_RATE` 값 이관은 하지 않는다(제공자·기준이 다를 수 있음) |
| R11 | 정본 제공자 | 기존 규칙을 그대로 쓴다(수출입은행 키가 있으면 수출입은행 매매기준율, 없으면 Frankfurter). 실제 제공자는 `ATTR05` 에 남긴다. 제공자가 바뀌면 같은 날 키는 UPDATE 로 덮어쓴다 |
| R12 | D1 모델 | A 유지. C(통화 한 키 + 선분 이력)는 선분 시각이 저장 시각이라 과거 소급이 안 되고 이력 표시가 막힌다. 사용자가 다른 모양을 원하면 후속 |

추가 주의(문서화만): 수집 경로가 둘이 된다(`ExchangeCollectSource`→`TB_MCM_JOB_COLLECT_DATA` 와 이 작업). `TB_MDM_DATA_RECV` 수신 이력은 남지 않는다(수신 API 경로는 보류 상태). `FX_RATE` 는 연 약 2,900행씩 늘며 보관 정책은 후속이다. `FX_RATE` 폐기(deprecate)를 누가 하면 작업이 CHK1 로 실패한다. 쓰지 않게 되는 `ExchangeRateWriter`·`ExchangeRateRepository`·`TB_MCM_EXCHANGE_RATE` 는 삭제하지 않고 `@Deprecated` 와 주석으로 남긴다(조정 지시).

## 7. 날짜 한 행 전환 (레인 fx-pivot, 지시 fx-pivot-1, 2026-10-09)

사용자 결정: 「환율에 날짜가 없어」 → 「추가 컬럼 라벨에 통화가 더 들어가면 되겠다」 → 「날짜 한 행, 통화는 칼럼」. §2 D1 의 `FX_RATE` 모양(통화+기준일이 키)을 이 절이 덮어쓴다. 충돌하면 §7 이 우선한다.

### 7.1 새 모양

| 항목 | 값 |
|---|---|
| 키 `CODE` | 기준일 `yyyyMMdd` (예 `20261008`). `CODE_PATTERN = ^[0-9]{8}$` |
| `NAME` | `2026-10-08` |
| `DESCRIPTION` | `기준통화 KRW · 출처 frankfurter` (칼럼이 없는 기준통화·출처는 여기에 남긴다) |
| `ATTRnn_NAME`(정의) | 통화 코드. 순서 `USD EUR JPY CNY GBP AUD CAD CHF HKD SGD` (ATTR01~10) |
| `ATTRnn`(항목) | 그 통화 1단위당 원화, 소수 8자리 고정 문자열 |

추가 컬럼이 10개뿐이라 수집 통화 11개에서 **THB 를 뺀다**(철강 거래 비중이 가장 낮다는 조정자 판단). `CUR` 의 THB 는 환율 수집(`ATTR04`)을 `N` 으로 바꾼다. 통화를 바꾸려면 정의의 라벨만 바꾸면 된다(코드에 통화→칼럼 대응을 박지 않는다).

`FX_RATE` 카테고리 `MAJOR`(대상 `ATTR01` 의 통화 정규식)는 새 모양에서 뜻이 없어 **닫는다**(삭제 아님). 열린 카테고리는 `BASE` 만 남는다.

### 7.2 이전 방법 (Flyway `V4__fx_rate_by_date.sql`, V3 는 수정하지 않는다)

1. `FX_RATE` 정의: 키 정규식·설명·`ATTR01~10_NAME` 갱신(이미 갱신됐으면 건너뜀).
2. `FX_RATE` 카테고리 `MAJOR` 의 열린 행을 `VALID_TO` 로 닫는다.
3. `CUR` 의 `THB`: 열린 행(수집 `Y`)을 닫고 같은 값에 수집 `N` 인 새 열린 행을 연다(선분 이력 규칙, `ROW_VERSION` +1).
4. 옛 모양(`통화3자+기준일8자`) 열린 행을 모두 닫는다. **삭제하지 않는다.** 새 모양 행은 예약 작업이 다시 채운다(열린 행이 없으므로 첫 실행은 90일 백필).
5. `MCMAPUSER` 가 있으면 `TB_MDM_DATA` 읽기 권한을 준다(위젯이 라벨을 읽는다. V3 는 항목 표만 준다).

닫는 시각은 DB 시각 함수 없이 `GREATEST(고정 시각, VALID_FROM + 1초)` 라 `VALID_TO > VALID_FROM` 이 항상 맞고, 모든 문장이 「아직 바뀌지 않은 행」만 대상으로 삼아 재적용하면 0행이다(멱등).

### 7.3 예약 작업 `mdm.exchangeRateSync`

- 통화→칼럼 대응은 `TB_MDM_DATA`(FX_RATE) 의 라벨에서 읽는다. 수집 대상은 `CUR` 에서 열린 행·`ATTR04=Y` 이고 **라벨에 있는** 통화다(라벨에 없으면 경고를 남기고 건너뛴다).
- 제공자가 준 점을 날짜별로 모은다. 날짜 하나가 `UpsertRow` 하나이고, 그 날짜의 기존 열린 행이 있으면 읽어서 **받은 통화 칼럼만 덮어쓰고 나머지는 보존**한다(`ALTER_NAME`·`SEQ` 도 그대로). 같은 값이면 `NONE`(멱등).
- 반환 건수는 INSERT·UPDATE·REOPEN 된 **날짜 행** 수다. 90일 백필 판정은 `FX_RATE` 의 **열린** 행이 있는지로 본다(V4 가 옛 행을 닫으므로 전환 직후 한 번 백필).
- 그대로 유지: `REQUIRES_NEW` 커밋 뒤 부분 실패 예외, `WidgetExtException` 메시지 정책, 제공자 선택, `lookbackDays` 상한.

### 7.4 환율 위젯 (`FxMasterReader`)

- 라벨 1회 + 기준일 키 범위 1회, 두 쿼리로 읽는다. 요청 통화 → 라벨이 가리키는 칼럼만 고르고 날짜 행마다 통화별 점으로 편다. 라벨에 없는 통화·날짜가 아닌 키·숫자가 아닌 칼럼은 건너뛴다.
- 기준통화는 KRW 고정이라 `base` 인자는 쓰지 않는다. 응답 모양(`latest[{cur,rate,diff,date}]`, `history[{date,cur,rate}]`)과 `ExchangeService`·프런트 위젯은 바뀌지 않는다.
- 통화 선택지(편집기 하드코딩 11개)에 THB 가 남아 있지만 마스터에 값이 없어 빈 값이 된다. 편집기 선택지를 `CUR` 에서 읽는 일은 §5 후속 ② 에 이어서 한다.

### 7.5 적용 순서 (L_MAIN)

mdm 재기동(Flyway V4 적용) → mcm 재기동(리더 교체) → 예약 작업 「환율 마스터 동기화」 지금 실행(90일 백필). 운영은 DBA 가 V4 를 적용하고 `TB_MDM_DATA` SELECT 권한이 `MCMAPUSER` 에 있는지 확인한다.

### 7.6 운영 규칙

`FX_RATE` 정의의 `ATTRnn_NAME` 라벨은 칼럼↔통화 대응의 유일한 근거이고 정의에는 이력이 없다. 이미 값이 들어간 칼럼의 라벨을 다른 통화로 바꾸면 과거 날짜 행이 새 통화로 읽힌다. 통화를 바꿀 때는 빈 칼럼(현재 10개 모두 사용 중이므로 칼럼을 늘릴 수 없다)의 라벨만 쓰거나, 기존 칼럼을 비운 뒤 바꾼다.
