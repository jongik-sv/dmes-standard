# Phase 0 — 사전조사 & 인프라 결과

> 작성일: 2026-05-29
> 플랜: [03_전문송신_구현플랜.md](./03_전문송신_구현플랜.md) Phase 0
> 출처: cactus-section 레거시 소스 + 실 DB(10.10.80.241/ksm_dmes) + cactus-core 소스

---

## 0.1 직렬화 규칙 (확정) — `MessageSerializer` 정본

출처: `cactus-section` `DMomSendUtil.getMsgFromSendFormat` + `DMomCreateMessage.CreateBodyMessage`.

### 구분자·반복 구조 (`CreateBodyMessage`)
- 구분자 `iterator = "|"` — **각 항목값 뒤에 부착**(마지막 포함 → trailing `|`).
- FORMAT_LAYOUT 을 `ITEM_SEQ` 순회. `ITEM_TP`:
  - **`E`(Element)**: `getMsgFromSendFormat(itemId, dataTp, momParam.get(itemId)|"", dataLen, prec)` → `값 + "|"` append.
  - **`G`(Group 헤더)**: 메시지에 **아무것도 append 안 함**. `groupSize = DATA_LEN`(반복 횟수). 뒤따르는 `GE` 개수(`geTotCnt`) 계산. 그룹 데이터 = `momParam.get(itemId)` = `ArrayList<HashMap>`(반복당 1 Map). 첫 `groupMap = groupList[0]`.
  - **`GE`(Group 항목)**: 현재 `groupMap.get(itemId)|""` 로 변환 → `값 + "|"` append. `geSeq++`. GE 블록 끝(`geSeq==geTotCnt`)이고 다음 반복 있으면 `itemSeq -= geTotCnt`(GE 블록 되감기) + `groupSeq++` + `groupMap=groupList[groupSeq]`. 마지막 반복이면 그룹 종료.
  - → 그룹은 `groupSize` 회 × `GE` 개수 만큼 필드 생성. `groupList`/`groupMap` null 이면 해당 GE = `""`.
- 특수처리(레거시 유지): `itemId=="SNDR_INFORM_EDIT_PGM_ID"` 且 길이>14 → 14자 절단. 변환 결과가 `"ERROR"`로 시작하면 `UserException`.
- `DATA_DECIMAL_PREC` null → 0.

### DATA_TP 변환 (`getMsgFromSendFormat`)

| DATA_TP | 의미 | 규칙 |
|---|---|---|
| `1` String | 그대로 | `resultMsgData = msgData` (패딩/trim 없음) |
| `4` String2 | trim | `msgData.trim()` |
| `2` Number | **고정폭 zero-pad** | 정수부 `(DataLen-DataPrec)` 자리 `%0Nd` + 소수부 `DataPrec` 자리. **소수점 미포함**. 소수입력은 `.`로 split, 소수부는 `(소수부 + 0패딩).substring(0,DataPrec)`. 빈값 → `""`. (`Long.parseLong` 사용) |
| `3` Date | 숫자추출+우측0패딩+절단 | `-,/,:,공백,.` 제거 → 값 있으면 뒤에 0 20개 append → `substring(0, DataLen)` |
| `5` Number2 | 그대로 | `resultMsgData = msgData` |

### null 처리 (특이점)
- `msgData == null` → `""`.
- `msgData` 에 `"NULL"` 포함 시: `NULL`,`,`,`[`,`]` 제거 후 trim 이 비면 → `""`. (예: `"[NULL]"`, `"NULL,NULL"` → `""`)

> Phase 1 에서 위 규칙으로 단위테스트(레거시 산출물 byte 동등성) 작성.

---

## 0.2 WowContext API (확정)

`com.dongkuk.oasis.context.WowContext`:
```java
public interface WowContext {
    TypedObject get(String key);          // 컨텍스트 데이터 (예: paramKey 의 입력 Map)
    Object getPropertyValue(String name); // 태스크 camunda:property 값
}
```
→ `DmomCreateMessageTask implements Wow` 구현 가능:
```java
public TypedObject run(WowContext ctx) {
    String tc        = (String) ctx.getPropertyValue("transactionCode");
    String ifId      = (String) ctx.getPropertyValue("interfaceId");
    SeraiTransport t = SeraiTransport.valueOf(((String) ctx.getPropertyValue("transport")).toUpperCase());
    String paramKey  = (String) ctx.getPropertyValue("paramKey");
    Map<String,Object> data = ctx.get(paramKey).getObject(Map.class);   // TypedObject.getObject(Class)
    String msg = dmom.createMsg(DmomSendRequest.builder()
                    .transactionCode(tc).interfaceId(ifId).transport(t).data(data).build());
    return new TypedObject(msg);
}
```
(`TypedObject.getObject(Class)` 패턴은 `SpringTransactionHandler` 등에서 확인.)

> ⚠️ **Phase 4 정정**: 위 `Wow` 구현 방식은 폐기. OASIS `WowJavaServiceTaskExecutable` 이 `Class.newInstance()`
> 로 생성 → **DI 불가**. `DmomMessageService` 주입이 필요하므로 실제 태스크는 **Spring 빈 + method 스타일**
> (`PlainJavaServiceTaskExecutable`)로 구현한다 → `task/DmomMessageTask` 참조.

---

## 0.3 `EAIUSER.IF_MMQCMMCMTT01` 실측 — ✅ 결정: IF_SEQ **NULL 허용**

- **PK = `(TRANSACTION_CODE, U_AT)`** (IF_SEQ 아님). Serai 폴러 `updateSuccess` WHERE 도 `U_AT + TRANSACTION_CODE`. 정렬은 `C_AT ASC`.
- `IF_FLAG` DEFAULT `'N'` 존재 (INSERT 시 생략 가능, 명시도 무방).
- **`IF_SEQ` : DEFAULT / IDENTITY / SEQUENCE 전혀 없음 (NULL)**. ⚠️ "IF_SEQ는 DB 시퀀스 채번" 기대와 **실제 테이블 불일치**.
  - 기능상으로는 NULL 이어도 무방(Serai 가 IF_SEQ 미사용, PK·정렬 무관).
  - **결정(확정): IF_SEQ NULL 허용** — INSERT 에서 IF_SEQ 제외(채번 안 함). 시퀀스/DEFAULT 미도입. (AS-IS Oracle 테이블별 시퀀스는 미재현)
- INSERT 가 채우는 컬럼(확정): `TRANSACTION_CODE / INTERFACE_ID / INTERFACE_MSG / IF_FLAG('N') / C_*·U_*(audit) / VER(0)`. `KEY_DATA1~3`·`IF_SEQ`·`IF_DATE`·`IF_TIME` 제외.
- ⚠️ PK가 `(TC, U_AT)` 이므로 **같은 TC 다건을 같은 tx 에서 INSERT 시 U_AT(=Instant.now()) 충돌 가능성**(저확률). Serai 자체 INSERT 도 동일 특성. → 동일 TC 다건 송신 패턴이면 인지 필요.

---

## 0.4 SEQUENCE 생성 (완료)

```sql
CREATE SEQUENCE MCMAPUSER.SEQ_MCM_MOM_TC_ERROR AS NUMERIC(19) START WITH 1 INCREMENT BY 1 NO CACHE;
```
- 멱등 생성, `sys.sequences` 존재 확인 = YES. TC_ERROR INSERT 시 `NEXT VALUE FOR MCMAPUSER.SEQ_MCM_MOM_TC_ERROR`.

---

## 0.5 cactus MyBatis 설정 (`cactus-mybatis-config.xml`) — ★ 영향

- `mapUnderscoreToCamelCase=true` → **resultType=map SELECT 결과 키가 camelCase**. `getFormatLayout` 결과는 `formatId / formatVer / itemSeq / itemTp / itemId / itemNm / dataTp / dataLen / dataDecimalPrec` 로 옴 → `DmomFormatRepository` 가 **camelCase 키**로 읽어 `FormatItem` 매핑해야 함(컬럼명 대문자 X).
- `callSettersOnNulls=true`, `cacheEnabled=false`, `jdbcTypeForNull=NULL`, `localCacheScope=STATEMENT`.
- `Instant`(audit `cAt/uAt`) → MSSQL `datetime2`: MyBatis 기본 `InstantTypeHandler` 로 바인딩(별도 등록 불요). `jdbcTypeForNull=NULL` 로 null 파라미터 처리. (pilotAuditTest 경로와 동일 → OK)

---

## 0.6 GRANT smoke (완료)

- MCMAPUSER 로그인으로 `EAIUSER.IF_MMQCMMCMTT01` INSERT 성공(rowcount=1) → `ROLLBACK`.
- → **cross-schema INSERT 권한 정상 확인** (DB 방식 원자 아웃박스 전제 충족).

---

## Phase 0 종합 / Exit

| 항목 | 결과 |
|---|---|
| 0.1 직렬화 규칙 | ✅ 확정 (DATA_TP 1~5 + E/G/GE + null) |
| 0.2 WowContext | ✅ API 확정, Task 구현 가능 |
| 0.3 IF 테이블 | ✅ 실측. PK=(TC,U_AT), IF_FLAG DEFAULT 'N'. **IF_SEQ = NULL 허용(확정)** |
| 0.4 SEQUENCE | ✅ 생성 완료 |
| 0.5 MyBatis 설정 | ✅ camelCase 결과키 / Instant 핸들러 확인 |
| 0.6 GRANT | ✅ cross-schema INSERT 확인 |

**열린 결정 없음** (IF_SEQ = NULL 허용 확정). → **Phase 0 종료, Phase 1 착수 가능.**
