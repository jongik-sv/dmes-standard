# Caravan Hub 연동 개발자 매뉴얼

> 대상: **MES 모듈 개발자**(mcm · mls · mpp · mpn · mqc 등)
> 목적: Caravan Hub를 통해 전문(message)을 **송신/수신**할 때 참고하는 실무 레퍼런스
> 정본 기준: **코드**(worktree `caravan-hub-rename`). `docs/kafka/TABLE/*.md` 등 일부 옛 문서는 리네이밍/타입 표기가 낡았으니 본 문서를 우선한다.
> 작성: 2026-07-06

---

## 0. 30초 요약

- 전문은 **파이프(`|`) 구분 문자열** — 그 구조는 DB의 **FORMAT_LAYOUT**(포맷)이 결정한다.
- **송신**: 업무 코드에서 `DmomMessageService.createMsg(...)` 호출 → (HTTP 또는 DB transport) → caravan-hub → Kafka.
- **수신**: caravan-hub가 Kafka에서 꺼내 모듈의 `POST /dmomApi/v1/receive` 를 호출 → **TRANSACTION_CODE와 같은 이름의 OASIS BPMN 서비스**가 실행됨. 개발자는 그 서비스를 작성한다.
- **에러 철학**: *어떤 에러도 자동 스킵하지 않는다.* 실패하면 **큐막기**(토픽 정지)되고, 운영자가 콘솔에서 skip/resume을 결정한다. → **예외를 던지면 그 토픽이 막힌다.**

```
[송신]  모듈 업무코드 ── createMsg ──▶ dmom ──HTTP(afterCommit)──▶ caravan-hub ──▶ Kafka ──▶ 외부
                                         └─DB(즉시 in-tx)─▶ EAIUSER.IF_* ─(폴러)─▶ caravan-hub ─▶ Kafka
[수신]  외부 ──▶ Kafka ──▶ caravan-hub ──POST /dmomApi/v1/receive──▶ 모듈 OASIS 서비스({TRANSACTION_CODE})
```

---

## 1. 전문 포맷 먼저 정의하기 — `TB_MCM_MOM_FORMAT_LAYOUT`

전문의 필드 구성/변환 규칙은 이 테이블 한 곳에서 결정된다. 송신 직렬화·수신 역직렬화가 **같은 레이아웃**을 쓴다. (스키마: **MCMAPUSER**)

조회 경로: `TRANSACTION_CODE → TB_MCM_MOM_TC_LIST → TB_MCM_MOM_FORMAT_LIST → TB_MCM_MOM_FORMAT_LAYOUT`(활성 최신 `FORMAT_VER`).

### 컬럼
| 컬럼 | 의미 / 입력값 |
|---|---|
| `FORMAT_ID`, `FORMAT_VER` | 포맷 ID + 버전(활성 최신이 선택됨) |
| `ITEM_SEQ` | 항목 순서(1부터). **이 순서 = 전문 필드 순서** |
| `ITEM_TP` | **E / G / GE** (아래) |
| `ITEM_ID` | 항목 ID = **데이터 Map의 key** |
| `ITEM_NM` | 한글명(설명용) |
| `DATA_TP` | 데이터 유형 **1~5** (아래) |
| `DATA_LEN` | **E: 고정폭**, **G: 반복 횟수** (ITEM_TP에 따라 의미 다름) |
| `DATA_DECIMAL_PREC` | 소수 자릿수(Number일 때 정수부 폭 = `DATA_LEN − PREC`) |

> ⚠️ 낡은 문서 주의: `docs/kafka/TABLE/TB_MCM_MOM_FORMAT_LAYOUT.md`는 DATA_TP를 `S/N/D`, ITEM_TP를 `HDR/BDY/FTR`로 적어놨는데 **틀렸다**. 실제는 아래대로 **숫자 1~5 / E·G·GE** 다. 정본은 `FormatItem.java` · `MessageSerializer.java` · `MessageParser.java`.

### ITEM_TP
- **E (단일)**: `data.get(itemId)` 한 값 → `값|`. 토큰 1개.
- **G (반복그룹 헤더)**: 자신은 값 없음. `DATA_LEN` = 반복 횟수. 데이터 = `data.get(itemId)` = `List<Map<String,Object>>`.
- **GE (그룹 내 항목)**: G 바로 뒤 연속 항목들. 반복 횟수만큼 각 행 Map에서 값 출력.

### DATA_TP 변환 규칙
| DATA_TP | 이름 | 송신(직렬화) | 수신(역직렬화) |
|---|---|---|---|
| 1 | String | 원본 그대로 | trim |
| 2 | Number | 고정폭 zero-pad(정수부 `LEN−PREC` + 소수부 `PREC`) | 소수부 복원(÷10^PREC), 앞 0 제거 |
| 3 | Date | 숫자만 추출 + 우측 0패딩 + `LEN` 절단 | `"1900"<t<"9999"`만 유효, 나머지 `""` |
| 4 | String2 | trim | trim |
| 5 | Number2 | 원본 그대로 | 숫자 파싱 후 문자열 |

### 포맷 정의 예시 (반복그룹 포함)
```
(FORMAT_ID='F_SHIP_001', FORMAT_VER=1.00)
SEQ | TP | ITEM_ID    | DATA_TP | LEN | PREC
 10 | E  | PLANT_CD   |   1     |  4  |  0
 20 | E  | SEND_QTY   |   2     | 10  |  2
 30 | E  | SEND_DATE  |   3     | 14  |  0
 40 | G  | ITEM_LIST  |   1     |  5  |  0   ← 반복 5회
 50 | GE | ITEM_CD    |   1     | 20  |  0
 60 | GE | ITEM_QTY   |   2     |  8  |  0
```
→ 데이터 Map: `E`는 `put("PLANT_CD","P1")`, `G`는 `put("ITEM_LIST", List<Map>)`.

### fail-loud 규칙 (조용한 오류 방지 — H-9/10/11)
- 그룹 데이터 행수 > `DATA_LEN` → 예외(초과행 무음손실 방지)
- 값에 구분자 `|` 포함 → 예외(전문 밀림 방지)
- 수신 시 레이아웃보다 토큰이 남음 → 예외 / 숫자칸 비숫자 → 예외

---

## 2. 송신 (OUTBOUND) — 모듈 → 외부

### 2.1 개발자 진입점 — `DmomMessageService.createMsg`

```java
String createMsg(DmomSendRequest request);   // 반환 = 직렬화된 전문(로깅/검증용)
```
- **활성 Spring 트랜잭션 안에서 호출 필수** (없으면 `DmomException`). OASIS는 `cactus.oasis.transactional=true`면 보장.

`DmomSendRequest` (Builder):
| 필드 | 필수 | 의미 |
|---|---|---|
| `transactionCode` | ✔ | TRANSACTION_CODE — **포맷 조회 키** |
| `interfaceId` | ✔ | INTERFACE_ID — **= Kafka topicId**(목적지) |
| `transport` | ✔ | `CaravanHubTransport.HTTP` 또는 `.DB` |
| `data` | (null→빈맵) | FORMAT 항목값 Map (E=scalar, G=`List<Map>`) |
| `transferTc` | 옵션 | 포맷 조회만 다른 TC로 대체(레거시 msgCreate_TransferTC) |

### 2.2 transport — 발송 시점이 다르다 (중요)
| | **DB** | **HTTP** |
|---|---|---|
| 발송 시점 | `createMsg` **즉시**(업무 tx 안) | 업무 **커밋 성공 후**(afterCommit) |
| 원자성 | 업무 tx와 원자적 → 실패 시 함께 롤백 | 커밋 후 별도 전송(롤백 불가) |
| 실제 Kafka 발행 | `EAIUSER.IF_*` INSERT → **DB-inbound 폴러**가 발행 | caravan-hub `POST /caravanHubApi/v1/send` 즉시 발행 |
| 실패 처리 | 예외 → 업무 롤백 | 건별 `TB_MCM_MOM_TC_ERROR`(S) 적재, 나머지 안 막음 |

- **DB 선택 기준**: 업무 데이터와 전송을 **원자적으로** 묶고 싶을 때(실패 시 전부 롤백). 대상 테이블 = `TB_MCM_MOM_INTERFACES.SEND_TABLE_ID`, 없으면 `IF_<INTERFACE_ID>`.
- **HTTP 선택 기준**: 즉시성이 필요하고 커밋 후 전송으로 충분할 때. `CaravanHubIntegrationClient` 빈이 있어야 동작.

### 2.3 예제
```java
@Service
public class ShipmentService {
    private final DmomMessageService dmom;
    ShipmentService(DmomMessageService dmom) { this.dmom = dmom; }

    @Transactional   // 활성 tx 필수
    public void report(String orderNo, List<Row> rows) {
        // ... 업무 DB 갱신 ...
        Map<String,Object> data = new HashMap<>();
        data.put("PLANT_CD", "P1");
        data.put("SEND_QTY", "12.50");
        data.put("ITEM_LIST", rows.stream()
            .map(r -> Map.<String,Object>of("ITEM_CD", r.item(), "ITEM_QTY", r.qty()))
            .toList());

        dmom.createMsg(DmomSendRequest.builder()
            .transactionCode("PQR02012")     // 포맷 결정
            .interfaceId("MMPPMERPTT01")     // = Kafka topic(목적지)
            .transport(CaravanHubTransport.HTTP)   // 또는 .DB
            .data(data)
            .build());
        // HTTP: 이 메서드 커밋 후 전송 / DB: 이 라인에서 IF_* 즉시 INSERT(같은 tx)
    }
}
```
OASIS BPMN에서 Java 없이 쓰려면 `camunda:class="dmomMessageTask"`, `method=createMessage`, inputs 순서 `transactionCode, interfaceId, transport("HTTP"|"DB"), data`.

---

## 3. 수신 (INBOUND) — 외부 → 모듈

caravan-hub가 Kafka에서 꺼내 **모듈의 `POST /dmomApi/v1/receive`** 를 호출한다. 개발자는 **TRANSACTION_CODE와 같은 이름의 OASIS 서비스**를 작성하면 된다.

### 3.1 `/dmomApi/v1/receive` 요청 계약
`POST /dmomApi/v1/receive`, JSON body:
| JSON 키 | 필수 | 의미 |
|---|---|---|
| `TRANSACTION_CODE` | ✔ | = 실행될 OASIS **serviceId** |
| `INTERFACE_ID` | ✔ | 인터페이스 ID(= topicId), 포맷 조회 키 |
| `INTERFACE_MSG` | ✔(non-null, `""`은 OK) | 파이프 구분 raw 전문 |
| `INTERFACE_PROTOCOL` | 선택 | 송신 프로토콜(예 `IF_KAFKA`) |
| `KAFKA_KEYDATA` | 선택 | Kafka 키 |
- 인증: caravan-hub가 `X-Client-Key`(공유키) + `X-Authenticated-User` 헤더 부착 → cactus `ClientKeyFilter` 통과.
- 성공/실패는 **HTTP status**로만 판정(2xx=성공). 필수값 누락 = **400**(재시도 안 함), 처리 실패 = **5xx**(caravan 재시도).

### 3.2 디스패치 규칙
- **serviceId = TRANSACTION_CODE 직결**(매핑 테이블·allowlist 없음) → 같은 이름의 BPMN 서비스를 백엔드 직접 기동.
- context에 적재되는 값: `action="nonui"`, `transactionCode`, `interfaceId`, `interfaceMsg`, (있으면 `kafkaKeyData`, `interfaceProtocol`).
- 감사 주체는 `SYSTEM` 고정.

### 3.3 개발자가 작성하는 것 — `{TRANSACTION_CODE}.bpmn`
1. `action=nonui` 로 분기하는 gateway(선택)
2. **프레임워크 파싱 태스크** `camunda:class="dmomParseMessageTask"`, `method=parse`, `output=parseData` → raw 전문을 `parseData`(Map)로 역직렬화
3. 업무 task: 메서드 파라미터에 `Map<String,Object> parseData` 선언 → 이름 매칭 주입

**`parseData` 구조**: `E` 항목 → `parseData.get("ITEM_ID")`(scalar), `G` 항목 → `parseData.get("GROUP_ID")` = `List<Map<String,Object>>`.

```xml
<bpmn:process id="RCV_LOT_RESULT" isExecutable="true">   <!-- process id = TRANSACTION_CODE -->
  <bpmn:serviceTask id="parseTask" camunda:class="dmomParseMessageTask">
    <bpmn:extensionElements><camunda:properties>
      <camunda:property name="method" value="parse"/>
      <camunda:property name="output" value="parseData"/>
    </camunda:properties></bpmn:extensionElements>
  </bpmn:serviceTask>
  <bpmn:serviceTask id="saveTask" camunda:class="lotResultReceiveService">
    <bpmn:extensionElements><camunda:properties>
      <camunda:property name="method" value="saveReceived"/>
    </camunda:properties></bpmn:extensionElements>
  </bpmn:serviceTask>
  <!-- start → parseTask → saveTask → end -->
</bpmn:process>
```
```java
@Service("lotResultReceiveService")
public class LotResultReceiveService {
    @SuppressWarnings("unchecked")
    public void saveReceived(Map<String,Object> parseData) {
        String lotNo = (String) parseData.get("LOT_NO");                 // E
        List<Map<String,Object>> rows =
            (List<Map<String,Object>>) parseData.get("RESULT_LIST");     // G
        // ... upsert. 실패 시 예외 throw → OASIS 롤백 → 5xx → caravan 재시도/큐막기
    }
}
```
> `.bpmn` 작성/검증은 `bpmn-skill`, OASIS 런타임 계약(gateway/binding/task/test)은 `oasis-project-support` 스킬 사용 권장. `-parameters` 컴파일 옵션 필수(파라미터명 바인딩).

### 3.4 수신 실패 시
서비스 결과가 SUCCESS 아니거나 예외 → `TB_MCM_MOM_TC_ERROR`(ERROR_TYPE=`R`)에 **독립 트랜잭션으로** 적재(수신 롤백돼도 로그는 남음) → **HTTP 5xx** → caravan-hub 재시도 → 소진 시 **큐막기**.

---

## 4. 라우팅 설정 등록 (인프라)

전문 포맷(§1) + 송수신 코드(§2·§3) 외에, **어느 토픽을 어떻게 폴/발행할지**를 DB에 등록해야 한다. (스키마: **CARAVANUSER**, 콘솔 `caravanHubConfig`/`topic`/`appHost` 화면 또는 시드)

### 4.1 `TB_CARAVAN_TOPICS` — 토픽 메타 (PK: TOPIC_ID, BIZ_SYSTEM)
| 컬럼 | 의미 |
|---|---|
| `TOPIC_ID` | Kafka 토픽 ID |
| `BIZ_SYSTEM` | 업무 시스템(예 `HUB1`,`mcm`) — **APP_HOST_ID와 매칭** |
| `GROUP_ID` | Kafka consumer group |
| `SEND_MODULE_ID` / `RECV_MODULE_ID` | 송/수신 모듈 |
| `USE_TP` | `'Y'`일 때만 컨슈머/라우트 활성 |
| `STATUS` | RUNNING/PAUSED/STOPPED/**ERROR**(큐막기) — 재기동 시 RUNNING reset |

### 4.2 `TB_CARAVAN_HUB_CONFIG` — 연동 설정 (PK: TOPIC_ID, DIRECTION)
| 컬럼 | 의미 |
|---|---|
| `DIRECTION` | **INBOUND**(외부→Kafka) / **OUTBOUND**(Kafka→외부) |
| `INTEGRATION_TYPE` | **DB / HTTP / FILE** |
| `POLLING_INTERVAL_MS` | 인바운드 폴 주기(기본 1000) |
| `DB_SCHEMA` + `DB_TABLE_NAME` | DB 연동 대상 |
| `HTTP_URL` + `HTTP_METHOD` + `HTTP_HEADERS` | HTTP 연동 |
| `FTP_HOST/PORT/USER/PASSWORD` + `FILE_PATH` + `BACKUP_PATH` | FILE(SFTP) 연동 |
| `USE_YN` | `'Y'`일 때만 라우트 생성/조회 |

**타입별 필수 필드** (콘솔 저장 시 검증됨):
- DB → `DB_SCHEMA` + `DB_TABLE_NAME`
- HTTP → `HTTP_URL`
- FILE → `FTP_HOST` + `FILE_PATH`
- (같은 토픽의 INBOUND+OUTBOUND가 **같은 테이블** → 무한 증폭 루프이므로 저장 거부)

### 4.3 `TB_CARAVAN_APPHOST` — 호스트 매핑 (PK: APP_HOST_ID, WORKS_CD)
| 컬럼 | 의미 |
|---|---|
| `APP_HOST_ID` | 인스턴스/시스템 ID — **= BIZ_SYSTEM** |
| `WORKS_CD` | 사업장 코드 |
| `APP_HOST_URL` | Base URL(끝 슬래시 없음 권장) |

- 콘솔이 토픽 상태 조회·제어 시 `BIZ_SYSTEM → APP_HOST_URL` 로 대상 인스턴스를 찾는다.
- **대소문자 무관 매칭**(C-6): `HUB1`/`hub1` 동일 취급. → 값은 **일관되게** 쓰되 casing 불일치로 "호스트 미등록" 걱정은 없다.

### 4.4 신규 인터페이스 추가 체크리스트
1. **FORMAT_LAYOUT** 등록(§1) — TRANSACTION_CODE의 전문 구조
2. **TB_CARAVAN_TOPICS** 행 추가(TOPIC_ID, BIZ_SYSTEM, GROUP_ID, USE_TP='Y')
3. **TB_CARAVAN_HUB_CONFIG** 행 추가(DIRECTION + INTEGRATION_TYPE + 타입별 필수필드, USE_YN='Y')
4. **TB_CARAVAN_APPHOST**에 BIZ_SYSTEM(=APP_HOST_ID) 호스트 URL 등록
5. 송신이면 `createMsg` 코드(§2), 수신이면 `{TC}.bpmn` 서비스(§3) 작성

---

## 5. 에러 처리 — 개발자가 꼭 알아야 할 것

### 5.1 핵심 원칙: 자동 스킵 없음 → 큐막기 → 운영자 결정
> *"어떤 에러도 시스템이 자동으로 스킵하지 않는다. 운영자가 확인하고 skip(Y)/수정 후 resume(N·null)을 직접 결정한다."*

**함의(중요)**: 수신 서비스에서 **예외를 던지면 → 재시도(기본 3회) → 그 토픽 전체가 큐막기**(정지)된다. 뒤 메시지도 전부 대기. 이건 **버그가 아니라 의도된 설계**다(Head-of-Line Block으로 유실/오처리를 막음).
→ 그러니 **일시적 오류(연결/타임아웃)만 예외로** 던지고, 데이터가 잘못된 영구 오류는 예외 전에 검증·정제해서 "막힐 값"을 최소화하라. 진짜 막히면 운영자가 콘솔에서 원문 확인 후 복구한다.

세 가지 큐막기: Kafka 소비(pause+seek) / DB 인바운드(`IF_FLAG='E'`) / FILE 인바운드(에러폴더 격리).

### 5.2 에러 로그는 2곳으로 분리된다
| 테이블 | 스키마 | 무엇이 남나 |
|---|---|---|
| `TB_CARAVAN_TC_ERROR` | CARAVANUSER | caravan **Kafka produce(S)/consume(R)** 실패. 소비 실패는 **원문(payload)**까지 저장 |
| `TB_MCM_MOM_TC_ERROR` | MCMAPUSER | MES **dmom 송신(S)/수신(R)** 실패 |
- 콘솔 **"TC Error 조회"** 화면은 `TB_MCM_MOM_TC_ERROR`(MES용)를 본다. caravan Kafka 구간 실패는 별개 테이블.

### 5.3 운영자 알림 (AlertNotifier)
큐막기/DLT 진입 시 운영자 알림이 발동한다(소비 큐막기·파싱실패·DB인바운드'E'·FILE 부분실패·DLT). 현재는 **로그 스텁**(`LoggingAlertNotifier`)이고, SMS 게이트웨이 연동 시 `SmsAlertNotifier`(`caravan-hub.alert.sms.enabled=true`)로 실 발송. **알림 = "사람이 개입해야 한다"** — 정상 스킵엔 알림 없음.

### 5.4 DLT는 안전망일 뿐
비즈니스 실패는 **DLT로 가지 않는다**(큐막기로 원본 토픽에 보존). DLT는 **프레임 레벨 catastrophic**(역직렬화 실패 등) 전용 안전망. 실제 실패 가시성은 **큐막기(STATUS='ERROR')와 알림**으로 본다(대시보드 "큐막기(에러) 토픽" 타일).

### 5.5 알아둘 미해결 (설계 주의)
- **멱등성 없음(C-2)**: `KAFKA_KEYDATA`가 중복제거에 안 쓰인다. 크래시/리밸런스/부분성공 재전달 시 **타깃 중복 INSERT/POST** 가능 → **수신 처리를 upsert/멱등하게** 짜는 걸 권장.
- **/dmomApi 보안(C-4)**: 공유키만 있으면 TRANSACTION_CODE로 임의 OASIS 서비스 기동 가능 → **내부망 채널 전용**. 외부 노출 금지.
- **단일 파티션 전제(H-13)**: offset/skip 로직이 파티션 0 가정. 토픽은 단일 파티션으로 운영.

---

## 6. 콘솔 운영 (화면별 · 언제 쓰나)

`m-mcm > 카프카 콘솔(caravanConsole)`:
| 화면 | 용도 |
|---|---|
| **topic (토픽 제어)** | 토픽 상태 조회 + `pause/resume/stop/start`, **skipOffset**(큐막기 메시지 건너뛰기), sendTest. **큐막기 복구의 주 화면**. |
| **message (메시지 조회)** | 시간/모듈별 메시지 브라우즈 + 상태(WAIT/DONE/ERROR…) + offset peek + 재전송 |
| **caravanHubConfig (연동 설정)** | INBOUND/OUTBOUND × DB/HTTP/FILE 설정 CRUD(저장 시 검증). **새 인터페이스 배선** |
| **appHost (호스트)** | BIZ_SYSTEM → URL 매핑 관리 |
| **dashboard** | 호스트별 상태 + **큐막기(ERROR) 토픽** 집계(원인코드/offset) + LAG |

**운영자 복구 흐름**: 대시보드에서 큐막기 토픽 발견 → message에서 원문 확인 → 데이터 잘못이면 topic에서 **skipOffset**(스킵), 일시 장애였으면 원인 해소 후 **resume**.

---

## 7. 명명 규칙

| 이름 | 규칙 / 역할 |
|---|---|
| **TRANSACTION_CODE** | 전문 ID. **포맷 조회 키** + **수신 시 OASIS serviceId로 직결**(같은 이름 BPMN 실행). |
| **INTERFACE_ID** | 인터페이스 식별자 = **Kafka topicId**(목적지). |
| **TOPIC_ID** | Kafka 토픽. Listener ID = `listener-<topicId>`, DLT = `<topicId>.dlt`. |
| **BIZ_SYSTEM** | 업무 시스템(=APP_HOST_ID). 호스트 매핑에 사용, **대소문자 무관**. `hub` 접두면 caravan-hub 전용 핸들러 라우팅. |
| **GROUP_ID** | Kafka consumer group. offset 조작/상태 조회 단위. |

---

## 8. 스키마 소유자 정리

| 테이블 | 스키마 |
|---|---|
| `TB_MCM_MOM_FORMAT_LAYOUT` (+FORMAT_LIST/TC_LIST/INTERFACES), `TB_MCM_MOM_TC_ERROR` | **MCMAPUSER** |
| `TB_CARAVAN_TOPICS`, `TB_CARAVAN_HUB_CONFIG`, `TB_CARAVAN_TC_ERROR`, `TB_CARAVAN_APPHOST` | **CARAVANUSER** |
| 동적 인터페이스 테이블 `IF_*` | **EAIUSER** |

---

## 9. 참고 (정본 소스)

- 송신: `cactus-core/.../dmom/message/{DmomMessageService,DefaultDmomMessageService,DmomSendRequest,MessageSerializer}.java`, `.../dmom/transport/CaravanHubTransport.java`, `.../dmom/dispatch/*`, `.../integration/caravanhub/*`
- 수신: `cactus-core/.../dmom/receiver/{DmomReceiveController,DmomReceiveDispatcher,DmomReceiveRequest,DmomParseMessageTask,MessageParser}.java`, `.../dmom/error/DmomErrorLogger.java`
- 포맷: `cactus-core/.../dmom/format/{FormatItem,FormatLayout,DmomFormatRepository}.java`, `resources/persistence/dmom/DmomMapper.xml`
- caravan: `caravan-core/.../{consumer,producer,service,alert,config}/*`, `caravan-hub/.../inbound/{db,file}/*`, `caravan-console/.../{dashboard,topic,host,caravanhubconfig}/*`
- 상세 설계: `docs/cactus/002_전문송수신*/`, `docs/kafka/dmes-aps-20260701-caravan-hub_리네이밍+Camel전환_통합개발설계서.md`, 안정성감사리포트 `docs/kafka/dmes-aps-20260703_*.md`
- 스킬: `.bpmn` 작성=`bpmn-skill`, OASIS 서비스=`oasis-project-support`

> ⚠️ `docs/kafka/TABLE/*.md`(FORMAT_LAYOUT·APPHOST)는 리네이밍 이전 표기(SERAIUSER, S/N/D 등)라 **낡음**. 본 매뉴얼(코드 기준)을 우선한다.
