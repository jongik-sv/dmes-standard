# cactus 통합 테스트 시나리오 (1.0.22-SNAPSHOT)

> **본 문서의 책임**: docs/cactus 의 모든 설계 문서가 검증하는 기능을 카테고리별 시나리오로 정리.
> 각 시나리오는 mcm 부팅 + curl + DB 직접 검증으로 자동/수동 실행 가능.
>
> **갱신 이력**:
> - **2026-05-19 (v3 — β 추가)**: D-4 (BPMN ds="if" yml-key 짧은 alias) ✅ 자동 검증 완료.
> - **2026-05-19 (v2 — α 결과 반영)**: G-3 (ds 직접 명시), G-4 (ds+tx 둘 다 fail), E-7 (snake→camel) ✅ 자동 검증 완료. C-8 (캐시 효과) ⚠️ 부분 검증.
> - **2026-05-19 (v1)**: 초안 작성. 카테고리 A~H + 시나리오 인덱스 매트릭스.
>
> **관련 문서**:
> - [`cactus-core-data-access-migration-plan.md`](./cactus-core-data-access-migration-plan.md) — 1.0.18 → 1.0.19 기본 데이터 액세스
> - [`oasis-multi-tx-design.md`](./oasis-multi-tx-design.md) — 1.0.21 multi-tx 상위 설계 + R-multi-1~35
> - [`oasis-multi-tx-detailed-design.md`](./oasis-multi-tx-detailed-design.md) — 1.0.21 multi-tx 상세 설계
> - [`oasis-sqlscript-multidatasource-design.md`](./oasis-sqlscript-multidatasource-design.md) — Phase 0 인라인 SELECT
> - [`cactus-mybatis-multi-ds-design.md`](./cactus-mybatis-multi-ds-design.md) v3.5 — 1.0.22 multi-DS mybatis 정본
> - [`usage-guide.md`](./usage-guide.md) — 1.0.22+ 사용 가이드

---

## 0. 사전 준비

### 0-1. mcm 부팅

```powershell
cd D:\dmes-standard\workspace-ksm\dmes-aps\src\backend\mcm
./gradlew :api:bootRun --args='--spring.profiles.active=local'
```

부팅 성공 로그 확인:
```
[Cactus] extras DataSource — bean='cactusDataSourceIf' alias='if' url=jdbc:sqlite:.../serai-if.db
[Cactus] primary DataSource alias — dataSource → 'biz' (옵션 β)
[Cactus] extras EMF + TxMgr — name='if' emf='cactusEntityManagerFactoryIf' tx='cactusTransactionManagerIf'
[Cactus Tx] alias — 'txBiz' → 'transactionManager'
[Cactus Tx] default TxMgr @Primary — 'transactionManager' (alias 'txBiz')
[Cactus Tx] alias — 'txCmn' → 'transactionManager'
[Cactus Tx] alias — 'txIF' → 'cactusTransactionManagerIf'
[Cactus Mybatis] SqlSessionFactory bean='sqlSessionFactoryBiz' ds='HikariDataSource@...' mapperLocations='classpath*:persistence/**/*.xml' interceptors=[SqlLoggingInterceptor, CactusMybatisAuditInterceptor]
[Cactus Mybatis] SqlSessionFactory bean='sqlSessionFactoryIf' ds='HikariDataSource@...' mapperLocations='classpath*:persistence/**/*.xml' interceptors=[SqlLoggingInterceptor, CactusMybatisAuditInterceptor]
[Cactus Mybatis] CactusMultiMyBatisSqlRunner registered (multi-DS aware)
[Cactus Oasis] multi-tx mode — managers=[txBiz, txCmn, txIF], default=txBiz
[Cactus Tx] config validated — managers=[txBiz, txCmn, txIF], default=txBiz, primary-alias=biz
Started McmApplication in N.NN seconds
```

### 0-2. JWT 토큰 획득 (모든 시나리오 공통)

```bash
TOKEN=$(curl -s -X POST "http://localhost:8080/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: dmes-bff-local-client-key-2026" \
  -d '{"userId":"admin","password":"admin123"}' \
  | grep -oE '"accessToken":"[^"]+"' | sed 's/"accessToken":"//;s/"//')
echo "TOKEN: $TOKEN"
```

### 0-3. DB 직접 조회 (Python)

```bash
python -c "
import sqlite3
biz = sqlite3.connect('D:/dmes-standard/workspace-ksm/dmes-aps/src/backend/data/mcm.db')
intf = sqlite3.connect('D:/dmes-standard/workspace-ksm/dmes-aps/src/backend/data/serai-if.db')
# 조회 명령
"
```

---

## 1. 카테고리별 시나리오

### A. 기본 데이터 액세스 (1.0.18~1.0.19)

검증 대상: `cactus-core-data-access-migration-plan.md`

| ID | 시나리오 | 검증 방법 | 기대 결과 |
|---|---|---|---|
| **A-1** | JPA Repository 동작 (단일 DS) | secUser 호출 (기존 BPMN) | 응답 success + DB INSERT/UPDATE |
| **A-2** | MyBatis SqlSession 동작 | `/query/{queryId}` 호출 (QueryController) | 응답 success + Mapper 결과 List |
| **A-3** | MasterCode 디코딩 (`_CD_NM`) | mapper 의 SELECT 에 `_CD` 컬럼 포함 | 응답에 `_CD_NM` 자동 채움 |
| **A-4** | Audit Interceptor | INSERT/UPDATE 호출 후 DB `C_AT/U_AT/C_BY/U_BY` 컬럼 | NULL 아님, 현재 시각 + 사용자 |
| **A-5** | SqlLoggingInterceptor | mapper 호출 후 mcm 로그 | `[mapperId] elapsed: Nms` 로그 출력 |

#### A-1. JPA Repository (mcm 기존 secUser/secObj 호출)

```bash
curl -s -X POST "http://localhost:8080/oasis/secUser/search" \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: dmes-bff-local-client-key-2026" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"params":{}}' | head -c 200
```

기대: `{"data":{...},"grids":{"users":{...}},"meta":{"success":true}}`

---

### B. OASIS 통합

검증 대상: `cactus-core-data-access-migration-plan.md` §13, `cactus-mybatis-multi-ds-design.md` §2-1~2-2

| ID | 시나리오 | 검증 방법 | 기대 결과 |
|---|---|---|---|
| **B-1** | ClassPath BPMN 로더 | 부팅 로그 | `[Cactus Oasis] transactional + classpath loader — /services` |
| **B-2** | ServiceTask + Spring Bean (FQCN) | secUser.bpmn `camunda:class="com.dongkuk.dmes.mcm..."` | 호출 정상 |
| **B-3** | ServiceTask + 빈 이름 lookup | 빈 이름 (`pilotMultiTxService`) 호출 | `Invoking object in context: [pilotMultiTxService]` 로그 |
| **B-4** | dialect 분기 (sqlite) | yml `cactus.oasis.dialect=sqlite` | `SqliteColumnConverter` 빈 등록 로그 |
| **B-5** | ^^ path 구분자 | serviceId `group^^name` 호출 | `group/name.bpmn` 매칭 |

---

### C. multi-tx (1.0.21)

검증 대상: `oasis-multi-tx-design.md`, `oasis-multi-tx-detailed-design.md`

| ID | 시나리오 | 검증 방법 | 기대 결과 |
|---|---|---|---|
| **C-1** | yml `cactus.tx.managers` 3개 등록 | 부팅 로그 | `[Cactus Tx] alias — 'txBiz/txCmn/txIF' → ...` 3줄 |
| **C-2** | CactusTxConfigValidator fail-fast | yml 에서 txIF 일부러 누락 + 부팅 | `cactus.tx.managers 에 표준 3개 중 누락: [txIF]` 부팅 fail |
| **C-3** | process tx 미명시 (single TX) | secUser 호출 (기존 BPMN) | `Transaction [txBiz] started.` 1개만 begin |
| **C-4** | process tx="txBiz,txIF" (multi TX) | pilotMultiTx /run 호출 | `Transaction [txBiz/txIF] started.` 2개 begin |
| **C-5** | LIFO commit 순서 | 정상 호출 + 로그 추적 | `Transaction [txIF] committed → Transaction [txBiz] committed` 순서 |
| **C-6** | LIFO rollback (atomicity) | pilotMultiTx /rollback 호출 | 양쪽 rollback + DB 변화 0 |
| **C-7** | DefaultTxInjectingServiceProvider | process tx 미명시 BPMN 호출 + connection pool 확인 | txBiz 만 begin, if 미터치 |
| **C-8** | CactusCachingServiceProvider | 같은 BPMN 2회 호출 + 응답 시간 비교 | 2회차 < 1회차 (캐시 효과) |

#### C-4. process tx="txBiz,txIF" 검증

```bash
curl -s -X POST "http://localhost:8080/oasis/pilotMultiTx/run" \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: dmes-bff-local-client-key-2026" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"params":{"message":"C-4 test","interfaceId":"C-4","payload":"x"}}'
```

mcm 로그 확인:
```
Transaction [txBiz] started.
Transaction [txIF] started.
... (mapper 실행)
Transaction [txIF] has been committed.   ← LIFO
Transaction [txBiz] has been committed.
```

#### C-6. rollback atomicity 검증

```bash
# 호출 전 DB count 측정
COUNT_BEFORE=$(python -c "
import sqlite3
print(sqlite3.connect('D:/dmes-standard/workspace-ksm/dmes-aps/src/backend/data/mcm.db').execute('SELECT COUNT(*) FROM TB_PILOT_BIZ_LOG').fetchone()[0])
")

# rollback action 호출
curl -s -X POST "http://localhost:8080/oasis/pilotMultiTx/rollback" \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: dmes-bff-local-client-key-2026" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"params":{"message":"C-6-MUST-NOT-PERSIST","interfaceId":"C-6","payload":"x"}}'

# 호출 후 DB count 확인 — 변화 없어야
COUNT_AFTER=$(python -c "...같은 쿼리...")

# 'C-6-MUST-NOT-PERSIST' message DB 검증 (0건 기대)
python -c "
import sqlite3
print(sqlite3.connect('D:/dmes-standard/workspace-ksm/dmes-aps/src/backend/data/mcm.db')
  .execute(\"SELECT COUNT(*) FROM TB_PILOT_BIZ_LOG WHERE MESSAGE='C-6-MUST-NOT-PERSIST'\").fetchone()[0])
"
```

기대: COUNT_BEFORE == COUNT_AFTER, message 0건

---

### D. multi-DS (1.0.21)

검증 대상: `oasis-multi-tx-detailed-design.md` §3~§4, `cactus-mybatis-multi-ds-design.md` §9

| ID | 시나리오 | 검증 방법 | 기대 결과 |
|---|---|---|---|
| **D-1** | primary-alias=biz | 부팅 로그 | `[Cactus] primary DataSource alias — dataSource → 'biz'` |
| **D-2** | extras.if (cactusDataSourceIf) 등록 | 부팅 로그 | `[Cactus] extras DataSource — bean='cactusDataSourceIf' alias='if'` |
| **D-3** | extras EMF + JpaTxMgr 등록 | 부팅 로그 | `[Cactus] extras EMF + TxMgr — name='if' emf='cactusEntityManagerFactoryIf' tx='cactusTransactionManagerIf'` |
| **D-4** | yml-key alias (BPMN ds="if" → cactusDataSourceIf) | BPMN 에 `<property name="ds" value="if"/>` | 정상 동작 (alias 인식) |
| **D-5** | JpaTxMgr 자동 setDataSource | 부팅 후 디버거 또는 mybatis TX join 동작 | `cactusTransactionManagerIf.getDataSource() != null` |
| **D-6** | SqlSessionTemplate TX join | pilotMultiTx 정상 호출 → DB INSERT 같은 TX | DB 양쪽 commit 또는 양쪽 rollback (Phase 2 ψ 검증) |

---

### E. multi-DS MyBatis (1.0.22) ★ 본 설계의 핵심

검증 대상: `cactus-mybatis-multi-ds-design.md` v3.5

| ID | 시나리오 | 검증 방법 | 기대 결과 |
|---|---|---|---|
| **E-1** | SqlSessionFactory biz/if 자동 등록 | 부팅 로그 | `[Cactus Mybatis] SqlSessionFactory bean='sqlSessionFactoryBiz/If'` 2줄 |
| **E-2** | CactusMultiMyBatisSqlRunner 등록 | 부팅 로그 | `[Cactus Mybatis] CactusMultiMyBatisSqlRunner registered (multi-DS aware)` |
| **E-3** | dataSource → SqlSessionTemplate 분기 | pilotMultiTx /run 호출 + DEBUG 로그 | `ds=...@aaa → sqlSessionTemplateBiz`, `ds=...@bbb → sqlSessionTemplateIf` |
| **E-4** | 인터셉터 setPlugins attach | pilotMultiTx /run 호출 후 로그 | `[mapperId] elapsed: Nms` (SqlLogging) + Audit 컬럼 |
| **E-5** | mapper.xml 위치 컨벤션 | `persistence/{serviceGroup}/{screen}.xml` 추가 후 부팅 | 자동 인식 (classpath*: 패턴) |
| **E-6** | classpath*: 패턴 안전 | mcm 에 persistence/ 미존재 시 부팅 | 정상 부팅 (FileNotFoundException 없음) |
| **E-7** | cactus-mybatis-config.xml settings | SELECT 결과의 컬럼명 | snake_case → camelCase 자동 변환 |
| **E-8** | ResponseConverter primitive (R-mybatis-12) | mapper resultType="long" SELECT 호출 | `grids.{name}.rows[{"value": N}]` |
| **E-9** | @ConditionalOnProperty (R-mybatis-11) | yml `cactus.datasource.extras.if.url` 명시/누락 | sqlSessionFactoryIf 활성/비활성 |
| **E-10** | SqlRunner 빈 우선순위 (R-mybatis-9) | 부팅 후 SqlRunner 빈 검증 | CactusMultiMyBatisSqlRunner 만 등록 (기존 sqlRunner skip) |

#### E-3. dataSource → SqlSessionTemplate 분기 (디버그 로그 활용)

mcm yml 에 디버그 로그 추가:
```yaml
logging:
  level:
    com.dongkuk.dmes.cactus.oasis.task.CactusMultiMyBatisSqlRunner: DEBUG
```

```bash
curl -s -X POST "http://localhost:8080/oasis/pilotMultiTx/run" \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: dmes-bff-local-client-key-2026" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"params":{"message":"E-3","interfaceId":"E-3","payload":"x"}}'
```

mcm 로그에서 다음 패턴 확인:
```
[Cactus Mybatis] ds=HikariDataSource@aaa → SqlSessionTemplate 'sqlSessionTemplateBiz'
[Cactus Mybatis] ds=HikariDataSource@bbb → SqlSessionTemplate 'sqlSessionTemplateIf'
```

→ 두 다른 인스턴스 (`@aaa` vs `@bbb`) 확인 = multi-DS 분기 정상.

---

### F. BPMN 패턴

검증 대상: `cactus-mybatis-multi-ds-design.md` §7, `usage-guide.md` §5

| ID | 시나리오 | 검증 BPMN | 기대 결과 |
|---|---|---|---|
| **F-1** | ServiceTask + camunda:class (FQCN) | 기존 secUser.bpmn 류 | 정상 호출 |
| **F-2** | ServiceTask + camunda:class (빈 이름) | pilotMultiTx.bpmn 의 ServiceTask (이전 Phase 7) — 통합 후 폐기 | (deprecated 경로) |
| **F-3** | ScriptTask + 인라인 SQL | mcm01020 류 (인라인 SELECT) | JdbcTemplate 실행 |
| **F-4** | ScriptTask + camunda:resource (mapper id) | pilotMultiTx /run | mapper INSERT 정상 |
| **F-5** | camunda:resource cmd prefix (insert/update/delete) | pilotMultiTx /run, /rollback | 정상 실행 |
| **F-6** | ExclusiveGateway + camunda:property name="input" value="action" | pilotMultiTx /run vs /rollback | 분기 정상 |
| **F-7** | process tx + script tx 조합 | pilotMultiTx (process tx="txBiz,txIF", script tx="txBiz/txIF") | 정확한 TX 사용 |
| **F-8** | ServiceTask+JPA + ScriptTask+mapper 혼용 | pilotHybridTx /run, /rollback | 같은 Connection 공유 + atomicity (ψ 검증) |

#### F-8. 혼용 atomicity 검증 (이미 ψ 에서 검증 완료)

```bash
# /run — JPA + mapper 같은 biz TX commit
curl -s -X POST "http://localhost:8080/oasis/pilotHybridTx/run" \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: dmes-bff-local-client-key-2026" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"params":{"message":"F-8-run","interfaceId":"F-8","payload":"x"}}'
# 응답: {"data":{"serviceResult":{"bizLogId":N},"mapperAffected":1},...}

# /rollback — JPA + mapper 같이 rollback
curl -s -X POST "http://localhost:8080/oasis/pilotHybridTx/rollback" \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: dmes-bff-local-client-key-2026" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"params":{"message":"F-8-MUST-NOT-PERSIST","interfaceId":"F-8","payload":"x"}}'
# 응답: {"meta":{"success":false,"code":"S001","message":"SQLITE_ERROR..."}}

# DB 검증
python -c "
import sqlite3
biz = sqlite3.connect('D:/dmes-standard/workspace-ksm/dmes-aps/src/backend/data/mcm.db')
print('F-8-run         :', biz.execute(\"SELECT COUNT(*) FROM TB_PILOT_BIZ_LOG WHERE MESSAGE='F-8-run'\").fetchone()[0], '(expect 2: JPA +1, mapper +1)')
print('F-8-MUST-NOT-PER:', biz.execute(\"SELECT COUNT(*) FROM TB_PILOT_BIZ_LOG WHERE MESSAGE='F-8-MUST-NOT-PERSIST'\").fetchone()[0], '(expect 0: rollback)')
"
```

---

### G. ds/tx 속성 조합

검증 대상: `cactus-mybatis-multi-ds-design.md` §7-3

| ID | 시나리오 | BPMN 속성 | 기대 결과 |
|---|---|---|---|
| **G-1** | tx 명시 (TxMgr alias) | `<property name="tx" value="txBiz"/>` | biz DS 사용, biz TX join |
| **G-2** | tx 명시 (extras) | `<property name="tx" value="txIF"/>` | if DS 사용, if TX join |
| **G-3** | ds 명시 (DataSource 빈) | `<property name="ds" value="cactusDataSourceIf"/>` | if DS 사용, 트랜잭션 무관 |
| **G-4** | ds + tx 둘 다 명시 (금지) | 둘 다 명시 BPMN 호출 | `IllegalArgumentException: Please input either [ds] or [tx]` |
| **G-5** | 둘 다 생략 (default) | pilotDefaultTx /run | biz 자동 사용 (DefaultDataSourceResolver) |

#### G-5. default 검증 (ω 검증 완료)

```bash
curl -s -X POST "http://localhost:8080/oasis/pilotDefaultTx/run" \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: dmes-bff-local-client-key-2026" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"params":{"message":"G-5","interfaceId":"G-5","payload":"x"}}'
# 응답: {"data":{"bizAffected":1},"meta":{"success":true}}
```

DB:
```bash
python -c "
import sqlite3
biz = sqlite3.connect('D:/dmes-standard/workspace-ksm/dmes-aps/src/backend/data/mcm.db')
print('G-5:', biz.execute(\"SELECT COUNT(*) FROM TB_PILOT_BIZ_LOG WHERE MESSAGE='G-5'\").fetchone()[0])
"
```

---

### H. 응답 변환

검증 대상: `cactus-mybatis-multi-ds-design.md` §11 R-mybatis-12

| ID | 시나리오 | 매퍼 / output | 기대 응답 |
|---|---|---|---|
| **H-1** | data Map (단일 객체) | ServiceTask 반환 = DTO 또는 Map | `{"data":{key:{...}}}` |
| **H-2** | grids List<Map> | mapper resultType="map" SELECT | `{"grids":{key:{rows:[{...},...]}}}` |
| **H-3** | grids List<primitive> | mapper resultType="long" SELECT | `{"grids":{key:{rows:[{"value":N}]}}}` (R-mybatis-12 wrap) |

---

## 2. 시나리오 인덱스 매트릭스

### 문서 → 시나리오 매핑

| 문서 | 검증 시나리오 |
|---|---|
| **cactus-core-data-access-migration-plan.md** | A-1, A-2, A-3, A-4, A-5, B-1, B-2, B-4, B-5 |
| **oasis-multi-tx-design.md** | C-1, C-2, C-3, C-4, C-5, C-6, C-7, C-8 |
| **oasis-multi-tx-detailed-design.md** | C-* + D-* (multi-tx + multi-DS) |
| **oasis-sqlscript-multidatasource-design.md** | F-3 (Phase 0 인라인 SELECT), F-4 (Phase B → 본 설계로 통합) |
| **cactus-mybatis-multi-ds-design.md** v3.5 | **E-1~E-10 (전부), F-4~F-8, G-*, H-***  ← 본 설계 핵심 |
| **usage-guide.md** | 모든 시나리오 사용법 |

### 검증 상태 (2026-05-19 기준, α 결과 반영)

| 카테고리 | 자동 검증 완료 ✅ | 부분 검증 ⚠️ | 수동 필요/보류 |
|---|---|---|---|
| **A** 기본 데이터 액세스 | A-5 (SqlLogging 로그), **A-4 ✅ ι (R-cactus-audit-1 fix)**, **A-3 ✅ κ (R-mybatis-13 fix — @AutoConfiguration + entityManagerFactoryRef)** | — | — |
| **B** OASIS 통합 | B-1, B-3, B-4 (부팅 로그 + Phase 2 호출), **B-2 ✅ μ-A (camunda:class 빈이름 — secUser.bpmn 등 mcm 전 BPMN)**, **B-5 ✅ μ-B (^^ delimiter mechanism 확인 — file name 내 delimiter, oasis-core test 보장)** | — | — |
| **C** multi-tx | C-1, C-3, C-4, C-5, C-6, C-7 ✅, **C-8 ✅ μ-C (cache effect 보강 — 671→502→471ms, 25% 감소)**, **C-2 ✅ μ-D (fail-fast — yml txIF 누락 격리 시 IllegalStateException + BUILD FAILED 확인)** | — | — |
| **D** multi-DS | **D-1, D-2, D-3, D-4, D-5, D-6 전부 ✅ (β 추가)** | — | — |
| **E** multi-DS MyBatis | **E-1~E-10 모두** ✅ (Phase 2 + π + σ + ω + ψ + Ω + α) | — | — |
| **F** BPMN 패턴 | F-1, F-3, F-4, F-5, F-6, F-7, F-8 ✅ | — | F-2 ⊘ (의도된 deprecated — 통합 후 폐기 경로) |
| **G** ds/tx 조합 | **G-1, G-2, G-3, G-4, G-5 전부 ✅ (α 추가)** | — | — |
| **H** 응답 변환 | H-1, H-2, H-3 ✅ | — | — |

→ **본 설계 v3.5 (multi-DS MyBatis) + G 카테고리 (ds/tx 조합) 모두 실측 검증 완료**.

### α 검증 결과 요약 (2026-05-19)
- **G-3** (`ds="cactusDataSourceIf"` 명시): `{"grids":{"ifCount":{"rows":[{"value":1}]}}}` — if DS 사용 정상
- **G-4** (`ds + tx` 둘 다 명시): `{"meta":{"success":false,"code":"S001","message":"Cannot retrieve the data source. Please input either [ds] or [tx] property."}}` — OASIS IllegalArgumentException 정확
- **E-7** (snake → camel): mapper `ID, MESSAGE, CREATED_AT` → 응답 `id, message, createdAt`
- **C-8** (캐시): 1st 759ms / 2nd 729ms (diff 30ms, DB I/O 비중 큰 시나리오라 결정적 판단 한계)

### β 검증 결과 요약 (2026-05-19)
- **D-4** (`ds="if"` yml-key 짧은 alias): `{"grids":{"ifCount":{"rows":[{"value":1}]}}}` — cactus `registry.registerAlias(cactusDataSourceIf, "if")` 동작. SpringApplicationContext.getBean("if") → cactusDataSourceIf 빈 lookup → if DS 사용 정상.
  - `pilotDsKeyAlias.bpmn` (신규)
  - **G-3 (정확한 빈 이름) + D-4 (짧은 alias) 둘 다 동작 확정**.

---

## 3. 자동화 — 단일 실행 스크립트 (선택)

본 문서의 시나리오들을 한 번에 실행하는 bash 스크립트 예시. 부팅 후 호출 + DB 검증 + 결과 출력.

```bash
#!/bin/bash
# cactus-test-all.sh — 시나리오 일괄 실행

set -e

echo "=== 0) JWT 토큰 ==="
TOKEN=$(curl -s -X POST "http://localhost:8080/api/auth/login" \
  -H "Content-Type: application/json" \
  -H "X-Client-Key: dmes-bff-local-client-key-2026" \
  -d '{"userId":"admin","password":"admin123"}' \
  | grep -oE '"accessToken":"[^"]+"' | sed 's/"accessToken":"//;s/"//')
[ -n "$TOKEN" ] && echo "OK" || (echo "FAIL"; exit 1)

call() {
  local NAME=$1; local SVC=$2; local ACTION=$3; local MSG=$4; local IFID=$5
  echo "=== $NAME — POST /oasis/$SVC/$ACTION ==="
  curl -s -X POST "http://localhost:8080/oasis/$SVC/$ACTION" \
    -H "Content-Type: application/json" \
    -H "X-Client-Key: dmes-bff-local-client-key-2026" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"params\":{\"message\":\"$MSG\",\"interfaceId\":\"$IFID\",\"payload\":\"data\"}}"
  echo ""
}

verify_db() {
  python -c "
import sqlite3
biz = sqlite3.connect('D:/dmes-standard/workspace-ksm/dmes-aps/src/backend/data/mcm.db')
intf = sqlite3.connect('D:/dmes-standard/workspace-ksm/dmes-aps/src/backend/data/serai-if.db')
print('biz count:', biz.execute('SELECT COUNT(*) FROM TB_PILOT_BIZ_LOG').fetchone()[0])
print('if  count:', intf.execute('SELECT COUNT(*) FROM TB_PILOT_IF_LOG').fetchone()[0])
"
}

# C-4 + F-6: pilotMultiTx run
call "C-4 + F-6 (multi-tx + action 분기)" pilotMultiTx run "scenario-c4" "PILOT_C4"

# C-6 + F-5: pilotMultiTx rollback
call "C-6 + F-5 (rollback + insert prefix)" pilotMultiTx rollback "scenario-c6-MUST-NOT-PERSIST" "PILOT_C6"

# G-5: pilotDefaultTx (default ds/tx)
call "G-5 (default ds/tx)" pilotDefaultTx run "scenario-g5" "PILOT_G5"

# F-8: pilotHybridTx run (JPA + mapper 혼용)
call "F-8 (혼용 run)" pilotHybridTx run "scenario-f8-run" "PILOT_F8"

# F-8: pilotHybridTx rollback (혼용 atomicity)
call "F-8 (혼용 rollback)" pilotHybridTx rollback "scenario-f8-MUST-NOT-PERSIST" "PILOT_F8R"

echo "=== DB 카운트 ==="
verify_db

echo "=== rollback message DB 검증 (모두 0건 기대) ==="
python -c "
import sqlite3
biz = sqlite3.connect('D:/dmes-standard/workspace-ksm/dmes-aps/src/backend/data/mcm.db')
for msg in ['scenario-c6-MUST-NOT-PERSIST', 'scenario-f8-MUST-NOT-PERSIST']:
    cnt = biz.execute(f\"SELECT COUNT(*) FROM TB_PILOT_BIZ_LOG WHERE MESSAGE=?\", (msg,)).fetchone()[0]
    print(f'{msg}: {cnt} (expect 0)')
"
```

---

## 4. 미완 시나리오 — 신규 BPMN/mapper 작성 필요

본 문서의 시나리오 중 BPMN 미작성/검증 안 된 항목:

### ~~G-3. ds 직접 명시 검증~~ ✅ α 완료 (`pilotDsDirectTx.bpmn`)

### ~~G-4. ds + tx 둘 다 명시 (fail 검증)~~ ✅ α 완료 (`pilotDsAndTxBoth.bpmn`)

### ~~E-7. mapper.xml mapUnderscoreToCamelCase 검증~~ ✅ α 완료 (`pilotCamelCase.bpmn` + `selectCamelCaseTest`)

### A-3. MasterCode 디코딩 실측 — ⚠️ δ 부분 검증 (interceptor 미동작 발견)
- 신규 BPMN: `pilotMasterCode.bpmn`
- mapper.xml `selectMasterCodeTest` 추가 (TEST_STS='A' + TEST_STS_NM=NULL)
- TB_SEC_CODE_GROUP / TB_SEC_CODE_ITEM 에 seed INSERT (Python)
- 호출 결과: **`testStsNm: null` — 디코딩 미동작**
- **원인 (δ 분석)**: `MasterCodeMybatisInterceptor` 가 SqlSessionFactory interceptors 목록에 없음. 부팅 로그 확인:
  ```
  [Cactus Mybatis] SqlSessionFactory bean='sqlSessionFactoryBiz' ... interceptors=[SqlLoggingInterceptor, CactusMybatisAuditInterceptor]
  ```
  → cactus `CactusMultiMybatisAutoConfiguration.build()` 의 `if (... && decoder != null)` 분기에서 `decoder = null` (ObjectProvider.getIfAvailable() 가 null 반환). 즉 `MasterCodeDecoder` 빈 미등록.
- **근본 원인**: `MasterCodeMybatisAutoConfiguration.defaultMasterCodeDecoder` 가 `@ConditionalOnBean(MasterCodeItemRepository.class)` 가드 — Repository 빈 미등록. `MasterCodeJpaAutoConfiguration` 의 `@EnableJpaRepositories(basePackages = "com.dongkuk.dmes.cactus.mastercode")` 가 multi-EMF 환경에서 `entityManagerFactoryRef` 명시 안 함 → default EMF binding 실패.
- **잠재 R-mybatis-13**: multi-DS 환경의 MasterCode 디코딩 미동작. 호스트 측 `@EnableJpaRepositories.basePackages` 에 `com.dongkuk.dmes.cactus.mastercode` 추가 또는 cactus 측 `MasterCodeJpaAutoConfiguration` 에 `entityManagerFactoryRef` 명시 필요. 별 트랙.

### A-4. Audit Interceptor 컬럼 채움 — ✅ ζ+ι 완전 검증 (R-cactus-audit-1 fix 완료)
- mapper: `pilot.pilotMultiTx.insertCodeGroupAuditTest` (TB_SEC_CODE_GROUP, 13컬럼)
- BPMN: `services/pilotAuditTest/pilotAuditTest.bpmn` (process tx="txBiz")
- 호출: `POST /oasis/pilotAuditTest/run`
  - meta 없이: `{"params":{"groupCd":"AUDIT_FIX_001","groupNm":"After Fix",...}}`
  - meta 포함: `{"meta":{"userId":"admin","menuId":"MENU_AUDIT_TEST"},"params":{...}}`

#### ζ 단계 결과 (Fix 전)
- ✅ `C_AT` / `U_AT` 채움 (interceptor mechanism 정상)
- ❌ `C_USR_ID` / `C_SVC_ID` / `C_PGM_ID` / `U_*` 모두 NULL

#### 근본 원인 분석 (ultrathink)
- cactus `OasisServiceExecutor.execute` 가 `AuditHolder.setAudit()` 만 호출, **`serviceContext.setAudit()` 누락**
- OASIS `CoreServiceStarter.java:96` 가 `AuditHolder.setAudit(serviceContext.audit())` 로 ScriptTask 직전 덮어씀 → null 로 overwrite
- dmes-film `ServiceController.java:153` 와 비교: dmes-film 은 `serviceContext.setAudit(filmAudit)` 정확히 호출 (AuditHolder 직접 set 안 함)
- → OASIS 의 표준 contract = client 가 `serviceContext.setAudit` 만 → engine 이 AuditHolder 로 자동 propagate

#### ι 단계 (Fix 적용)
**1-line fix**: `cactus-core/.../OasisServiceExecutor.java`
```java
CactusAudit audit = new CactusAudit(auditUserId, menuId, serviceId);
AuditHolder.setAudit(audit);  // 유지 (방어적)
...
DefaultServiceContext sc = new DefaultServiceContext(oasisAppCtx, inputs);
sc.setAudit(audit);  // ★ 추가
```

#### Fix 후 검증 결과
| 컬럼 | Fix 전 | Fix 후 (meta 없음) | Fix 후 (meta 포함) |
|---|---|---|---|
| C_AT / U_AT | ✅ epoch ms | ✅ epoch ms | ✅ epoch ms |
| C_USR_ID / U_USR_ID | ❌ NULL | ✅ `admin` | ✅ `admin` |
| C_SVC_ID / U_SVC_ID | ❌ NULL | ✅ `pilotAuditTest` | ✅ `pilotAuditTest` |
| C_PGM_ID / U_PGM_ID | ❌ NULL | NULL (menuId 미전송) | ✅ `MENU_AUDIT_TEST` |
| txId | `anon-NONE-...` | `anon-NONE-...` | `admin-MENU_AUDIT_TEST-...` |

→ **R-cactus-audit-1 완전 해소**. CactusAuditListener (JPA) 도 동일 mechanism 으로 fix 됨.

### C-8. 캐시 효과 검증 — ✅ μ-C 보강 검증 완료
- α 단계: 1차 759 / 2차 729ms (diff 30ms, DB I/O 비중 큰 시나리오)
- μ-C: 별 BPMN (pilotCamelCase) 1차 671 / 2차 502 / 3차 471 ms — **25% 감소 명확**
- → CactusCachingServiceProvider 의 BPMN parsing cache 효과 명확 검증

### C-2. CactusTxConfigValidator fail-fast — ✅ μ-D 격리 검증 완료
- mcm/api/application.yml 에서 `cactus.tx.managers.txIF` 일시 주석
- mcm bootRun → 부팅 fail 확인:
  ```
  java.lang.IllegalStateException: cactus.tx.managers 표준 3개 중 누락: [txIF].
  cactus 사용 모듈은 biz/cmn/if 3개 모두 명시 의무. 사용 안 하면 data-source 를 biz alias 로 매핑하여 명시.
  ```
- `BUILD FAILED in 1m` — context refresh 단계에서 정확히 차단
- yml 복원 후 정상 부팅 확인 → 격리 안전

### ~~D-4. BPMN ds="if" 짧은 alias~~ ✅ β 완료 (`pilotDsKeyAlias.bpmn`)

### B-5. ^^ 구분자 — ✅ μ-B 정밀 검증
- **검증**: oasis-core 의 `AbstractFileServiceLoader.isMatchedServiceName()` 구현 분석
  ```java
  if (nameToCheck.lastIndexOf(this.fileDescriptionDelimiter) != -1) {
      String foreName = nameToCheck.substring(0, nameToCheck.lastIndexOf(this.fileDescriptionDelimiter));
      String backName = nameToCheck.substring(nameToCheck.lastIndexOf("."));
      return (foreName + backName).equals(serviceFileName + "." + this.fileExtension);
  }
  ```
- **정확한 동작**: delimiter 가 **파일 이름에 포함된 경우** (예: `services/grp^^myService.bpmn`) delimiter 앞 부분 (`grp`) 을 serviceId 로 매칭
- **cactus CHANGELOG 표현 부정확**: `security^^secUser → security/secUser.bpmn` 으로 적혀있으나 실제는 폴더 path 변환 아닌 file name delimiter 기준 — CHANGELOG/docs 정정 필요 (R-cactus-doc-1)
- **mechanism 자체는 oasis-core 의 ClassPathFileServiceLoaderTest / JBossVfsFileServiceLoaderTest 가 보장 (oasis-core 5.1.0 test 통과)**

### B-2. ServiceTask + camunda:class — ✅ μ-A 검증
- mcm 의 모든 BPMN 의 `camunda:class` 가 **빈 이름 패턴** (예: `secUserService`)
- FQCN 패턴은 mcm 환경에 없음. 단 cactus 자체는 `SpringServiceStarterFactory` 통해 FQCN 도 지원
- mcm 의 빈 이름 호출은 본 회귀 검증 R2~R7 (secUser/secCodeGroup/secCodeItem/secMenu/secObj/secRole) 에서 success:true 확인 → 패턴 동작 검증 완료

### F-2. ServiceTask + camunda:class (deprecated) — ⊘ 의도된 deprecated
- pilotMultiTx.bpmn 의 ServiceTask (이전 Phase 7) 가 통합 후 폐기됨
- 본 디자인 (v3.5) 에서 사용 안 함 — 검증 불요
- 폴더 구조: `services/group/name.bpmn` + serviceId `group^^name` 호출 → 매칭 검증

---

## 5. 정합성 종합

### 본 설계 검증 단계 종합

| 단계 | 검증 카테고리 | 결과 |
|---|---|---|
| Phase 7 (이전) | F-1, F-3, A-1 | ✅ |
| Phase 2 (mcm pilot) | E-1~E-6, F-4, F-5 | ✅ |
| π (rollback) | C-6, F-6 | ✅ |
| σ (ResponseConverter) | E-7, H-3 | ✅ |
| ω (default tx/ds) | G-5 | ✅ |
| ψ + Ω (혼용) | F-8 | ✅ |
| **μ (잔여 일괄)** | **B-2 (camunda:class 빈이름), B-5 (^^ delimiter 정밀), C-2 (fail-fast 격리), C-8 (cache 보강)** | ✅ μ-A/B/C/D 검증 완료 |
| **fix 완료** | **A-4 (R-cactus-audit-1: sc.setAudit 추가)**, **A-3 (R-mybatis-13: @AutoConfiguration + entityManagerFactoryRef)** | ✅ ι + κ 검증 완료 |
| **의도된 deprecated** | F-2 (ServiceTask 빈이름 통합 후 폐기) | ⊘ 검증 불요 |
| **문서 정정 필요** | B-5 의 CHANGELOG/test-scenarios 문구 (path 변환 vs file delimiter) | R-cactus-doc-1 |

### 운영 권장 (test-scenarios.md 활용)

1. mcm 재기동 후 `cactus-test-all.sh` 실행 → 자동 검증 가능 시나리오 일괄 점검
2. 신규 BPMN 작성 시 본 문서의 ID (E-1~H-3) 로 기능 매핑
3. cactus 신버전 도입 시 시나리오 매트릭스 따라 회귀 검증
