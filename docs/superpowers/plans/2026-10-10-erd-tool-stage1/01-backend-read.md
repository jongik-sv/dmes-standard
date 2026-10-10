# ERD 도구 단계 1 — Task 1~3: 화면 상태 공유·DB 메타 조회·관계 추정

> 공통 제약(Global Constraints)·단계 1 에서 정한 점(S1~S17)·Review Focus·파일 구조·인터페이스는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [README](README.md) · 다음: [02-backend-import.md](02-backend-import.md)

이 문서의 경로 약어:
- `E/` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/`
- `LT/` = `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/`
- `AT/` = `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/`

모든 Gradle 명령은 먼저 `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` 를 한 셸에서 부른다.

---

### Task 1: 읽기 전용 화면 공유 — `SET_VIEW` 를 `view` 로 옮긴다

deferred 38번. `SET_VIEW` 는 단계 0 에서 `execute`(EDIT 권한) 아래에 있었다. 읽기 전용 사용자도 자기 화면을 알려야 Claude 가 `getCurrentView` 로 고른 표를 안다(D14). 단계 1 S1 대로 READ 권한 액션인 `view` 의 `kind=SET_VIEW` 로 옮기고, `execute` 의 `SET_VIEW` 는 지운다. BPMN 흐름·어휘(`MdmActions`)·권한 시드는 바꾸지 않는다. RBAC 키는 OASIS 액션 이름이고 `view` 는 이미 `READ_ACTIONS` 에 있다.

**Files:**
- Modify: `E/service/ErdEditService.java` (`view` 에 `kind` 분기, `setView` 새 메서드, `execute` 의 `SET_VIEW` 삭제, `kind` 도우미)
- Modify: `AT/ErdEditOasisHttpTest.java` (`setViewNeedsConnectedSessionAndValidJson`)
- Modify: `AT/ErdStreamTest.java` (`setViewThroughOasisBroadcastsPresence` → `setViewThroughViewActionBroadcastsPresence`)
- Modify: `src/backend/mdm/api/src/main/resources/services/dma/erdEdit.bpmn` (`bpmn:documentation` 문장만)
- Modify: `docs/mdm/screens/erdEdit/erdEdit_기능설계서.md` (§1 `view`·`execute` 행)
- Modify: `docs/erd-tool/deferred.md` (38번 "처리" 칸)

**Interfaces:**
- Consumes: 단계 0 `ErdEventHub.updateView(String modelId, String session, String diagramId, List<String> selectedTables) : boolean`, `MdmErrors.invalid(String)`(코드 MDM021).
- Produces: OASIS `view` + `kind=SET_VIEW`(요청 `modelId`·`session`·`viewJson`, 응답 `{"ok":true}`). SSE 에 연결되지 않은 세션이면 MDM021. `view` 의 모르는 `kind` 는 MDM021. `kind` 가 없으면 단계 0 동작 그대로다. Task 5 는 같은 `switch` 에 `STATUS` 를 더한다.

- [ ] **Step 1: 실패하는 시험으로 바꾸기 — `ErdEditOasisHttpTest`**

`AT/ErdEditOasisHttpTest.java` 의 import 에 한 줄을 더한다.

```java
import com.dongkuk.dmes.mdm.contract.security.MdmPermissions;
```

`setViewNeedsConnectedSessionAndValidJson` 전체를 아래로 바꾼다.

```java
    /** 단계 1 S1: 화면 상태 공유는 읽기 액션 view 의 kind 다. execute 는 더 이상 SET_VIEW 를 받지 않는다. */
    @Test
    void setViewNeedsConnectedSessionAndValidJson() throws Exception {
        reg();
        // RBAC 키는 OASIS 액션 이름이다. view 가 READ 세트에 있으므로 읽기 전용 사용자도 부를 수 있다.
        assertThat(MdmPermissions.READ_ACTIONS).contains("view");
        JsonNode noSse = call("view", "viewer", Map.of("modelId", "mcm", "kind", "SET_VIEW", "session", "no-sse",
                "viewJson", "{\"diagramId\":\"d-1\",\"selectedTables\":[\"t-1\"]}"));
        assertThat(noSse.at("/meta/code").asText()).as(noSse.toString()).isEqualTo("MDM021");
        assertThat(noSse.at("/meta/message").asText() + noSse).contains("실시간 채널");
        JsonNode bad = call("view", "viewer", Map.of("modelId", "mcm", "kind", "SET_VIEW", "session", "no-sse", "viewJson", "{oops"));
        assertThat(bad.at("/meta/code").asText()).as(bad.toString()).isEqualTo("MDM021");
        JsonNode notObj = call("view", "viewer", Map.of("modelId", "mcm", "kind", "SET_VIEW", "session", "no-sse", "viewJson", "[1]"));
        assertThat(notObj.at("/meta/code").asText()).as(notObj.toString()).isEqualTo("MDM021");

        JsonNode old = call("execute", "owner", Map.of("modelId", "mcm", "kind", "SET_VIEW", "session", "no-sse",
                "viewJson", "{\"diagramId\":\"d-1\",\"selectedTables\":[\"t-1\"]}"));
        assertThat(old.at("/meta/code").asText()).as(old.toString()).isEqualTo("MDM021");
        assertThat(old.at("/meta/message").asText() + old).contains("지원하지 않는 kind");

        JsonNode unknown = call("view", "viewer", Map.of("modelId", "mcm", "kind", "BOGUS"));
        assertThat(unknown.at("/meta/code").asText()).as(unknown.toString()).isEqualTo("MDM021");
        assertThat(unknown.at("/meta/message").asText() + unknown).contains("지원하지 않는 kind");

        // kind 가 없으면 단계 0 그대로 모델 전체를 돌려준다.
        JsonNode plain = call("view", "viewer", Map.of("modelId", "mcm"));
        assertThat(plain.at("/data/result/model").isTextual()).as(plain.toString()).isTrue();
    }
```

- [ ] **Step 2: 실패하는 시험으로 바꾸기 — `ErdStreamTest`**

`AT/ErdStreamTest.java` 의 `setViewThroughOasisBroadcastsPresence` 전체를 아래로 바꾼다. 바뀐 곳은 이름, 부르는 액션(`execute` → `view`), 사용자다. 편집자가 아닌 사용자도 보낼 수 있음을 보인다.

```java
    @Test
    void setViewThroughViewActionBroadcastsPresence() throws Exception {
        var a = open("a", 0);
        next(a, "presence");
        String body = om.writeValueAsString(Map.of("meta", Map.of("menuId", "erdEdit"), "params", Map.of(
                "modelId", "mcm", "kind", "SET_VIEW", "session", "a",
                "viewJson", "{\"diagramId\":\"d-9\",\"selectedTables\":[\"t-1\"]}")));
        // 단계 1 S1: 읽기 액션 view 로 보낸다. 모델 소유자·공동 편집자가 아닌 사용자(u-a)다.
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/erdEdit/view"))
                .header("Content-Type", "application/json").header("X-Client-Key", KEY).header("X-Authenticated-User", "u-a")
                .header("X-Authenticated-Role", "MDM_STEWARD").POST(HttpRequest.BodyPublishers.ofString(body)).build();
        var res = om.readTree(HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString()).body());
        assertThat(res.at("/meta/success").asBoolean()).as(res.toString()).isTrue();
        assertThat(res.at("/data/result/ok").asBoolean()).as(res.toString()).isTrue();
        String p = next(a, "presence");
        assertThat(p).contains("d-9").contains("t-1");
    }
```

- [ ] **Step 3: 시험이 실패하는지 확인**

Run: `cd src/backend/mdm && DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdEditOasisHttpTest' --tests '*ErdStreamTest'`
Expected: FAIL. `setViewNeedsConnectedSessionAndValidJson` 는 `view` 가 `kind` 를 무시하고 모델 전체를 돌려주므로 MDM021 단언에서 실패한다. `setViewThroughViewActionBroadcastsPresence` 는 `/data/result/ok` 가 없어서 실패한다.

- [ ] **Step 4: 구현 — `ErdEditService`**

`E/service/ErdEditService.java` 의 `view` 메서드 머리(javadoc 과 첫 두 줄)를 아래로 바꾼다. `long rev = store.rev(modelId);` 부터 끝까지는 그대로 둔다.

```java
    /**
     * kind 가 없으면 단계 0 그대로다. sinceRev 가 있으면 그 뒤 델타(ErdChangesView 를 plain 으로), 없으면 모델 전체(ErdModelView).
     * kind=SET_VIEW 면 화면 상태(보는 다이어그램·선택한 표)를 알린다. view 는 READ 권한 액션이라 읽기 전용 사용자도 자기 화면을
     * 알릴 수 있다(단계 1 S1, deferred 38). 모르는 kind 는 입력 오류다.
     * rev 를 MODEL_JSON 보다 먼저 읽는다 — 사이에 명령이 끼면 화면이 같은 델타를 한 번 더 받을 뿐 빠지지는 않는다(델타는 upsert·delete 라 두 번 적용해도 같다).
     */
    public Object view(ErdEditRequest r) {
        String modelId = requireModelId(r);
        switch (kind(r)) {
            case "" -> { }
            case "SET_VIEW" -> {
                return setView(modelId, r);
            }
            default -> throw MdmErrors.invalid("view 가 지원하지 않는 kind 입니다: " + r.getKind());
        }
        if (r.getSinceRev() != null) return plain(commands.changesSince(modelId, r.getSinceRev()));
```

`view` 메서드 바로 뒤(`compare` 앞)에 `setView` 를 더한다. 본문은 단계 0 `execute` 의 `SET_VIEW` 가지를 옮긴 것이다.

```java
    /**
     * 화면 상태 공유(D14). viewJson = {"diagramId":"d-1","selectedTables":["t-1"]}.
     * 접속자 목록은 SSE 구독이 만든다. 구독하지 않은 세션이면 거절한다(접속자가 없으면 알릴 곳이 없다).
     */
    private Map<String, Object> setView(String modelId, ErdEditRequest r) {
        String session = session(r, currentUser.userId());
        JsonNode v = readJson(r.getViewJson(), "viewJson");
        List<String> tables = new ArrayList<>();
        v.path("selectedTables").forEach(t -> tables.add(t.asText()));
        if (!hub.updateView(modelId, session, v.path("diagramId").asText(null), tables)) {
            throw MdmErrors.invalid("실시간 채널에 연결된 세션만 화면 상태를 보낼 수 있습니다: " + session);
        }
        return Map.of("ok", true);
    }
```

`execute` 의 javadoc·`kind` 계산·`SET_VIEW` 가지를 바꾼다. 아래는 바꾸기 전과 뒤다.

```java
// 바꾸기 전
    /** 공동 편집자 관리(ADD/REMOVE_EDITOR), 화면 상태(SET_VIEW), 작업 중 표시(CLAIM·RELEASE). */
    public Map<String, Object> execute(ErdEditRequest r) {
        String modelId = requireModelId(r);
        String me = currentUser.userId();
        String kind = r.getKind() == null ? "" : r.getKind().trim().toUpperCase(Locale.ROOT);
        switch (kind) {
            case "ADD_EDITOR" -> versions.addEditor(modelId, requireText(r.getUserId(), "userId", 50), me); // USER_ID 50자
            case "REMOVE_EDITOR" -> versions.removeEditor(modelId, requireText(r.getUserId(), "userId"), me);
            case "SET_VIEW" -> {
                // viewJson = {"diagramId":"d-1","selectedTables":["t-1"]}
                JsonNode v = readJson(r.getViewJson(), "viewJson");
                List<String> tables = new ArrayList<>();
                v.path("selectedTables").forEach(t -> tables.add(t.asText()));
                if (!hub.updateView(modelId, session(r, me), v.path("diagramId").asText(null), tables)) {
                    throw MdmErrors.invalid("실시간 채널에 연결된 세션만 화면 상태를 보낼 수 있습니다: " + session(r, me));
                }
            }
            case "CLAIM" -> {

// 바꾼 뒤
    /**
     * 공동 편집자 관리(ADD/REMOVE_EDITOR), 작업 중 표시(CLAIM·RELEASE). 편집자 전용이라 EDIT 권한 액션에 둔다.
     * 화면 상태 공유(SET_VIEW)는 단계 1 에서 읽기 액션 view 의 kind 로 옮겼다(S1).
     */
    public Map<String, Object> execute(ErdEditRequest r) {
        String modelId = requireModelId(r);
        String me = currentUser.userId();
        switch (kind(r)) {
            case "ADD_EDITOR" -> versions.addEditor(modelId, requireText(r.getUserId(), "userId", 50), me); // USER_ID 50자
            case "REMOVE_EDITOR" -> versions.removeEditor(modelId, requireText(r.getUserId(), "userId"), me);
            case "CLAIM" -> {
```

`execute` 의 `default` 가지(`"지원하지 않는 kind 입니다: "`)는 그대로 둔다. `SET_VIEW` 는 이제 이 가지로 간다.

`session` 도우미 바로 뒤에 `kind` 도우미를 더한다.

```java
    /** kind 를 대문자로. 없으면 빈 문자열(각 액션의 기본 동작). */
    private static String kind(ErdEditRequest r) {
        return r.getKind() == null ? "" : r.getKind().trim().toUpperCase(Locale.ROOT);
    }
```

- [ ] **Step 5: 시험이 통과하는지 확인**

Run: `cd src/backend/mdm && DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdEditOasisHttpTest' --tests '*ErdStreamTest' --tests '*MdmOasisActionVocabularyTest'`
Expected: PASS. 어휘 시험(`dma_erdEdit_bpmn_의_액션은_어휘_안의_14개다`)은 BPMN 흐름을 바꾸지 않았으므로 그대로 통과한다.

- [ ] **Step 6: 문서 고치기**

`src/backend/mdm/api/src/main/resources/services/dma/erdEdit.bpmn` 8번째 줄의 문장만 바꾼다(흐름·도형은 건드리지 않는다).

```text
바꾸기 전: execute 는 kind(ADD_EDITOR·REMOVE_EDITOR, 이어서 SET_VIEW·CLAIM·RELEASE)로 갈린다. import 는 단계 1 에서 더한다.</bpmn:documentation>
바꾼 뒤:   execute 는 kind(ADD_EDITOR·REMOVE_EDITOR·CLAIM·RELEASE)로 갈린다. 화면 상태 공유(SET_VIEW)는 읽기 액션 view 의 kind 다(단계 1 S1). import 는 단계 1 에서 더한다.</bpmn:documentation>
```

`docs/mdm/screens/erdEdit/erdEdit_기능설계서.md` §1 표의 두 행을 바꾼다.

```text
바꾸기 전:
| view | 모델 하나(JSON·다이어그램·rev·편집자·접속자) 또는 `sinceRev` 이후 델타 | READ |
| execute | 세션 명령(선택 상태·작업 중 표시)과 공동 편집자 등록·해제. `kind` 값은 ADD_EDITOR·REMOVE_EDITOR·SET_VIEW·CLAIM·RELEASE | EDIT |
바꾼 뒤:
| view | 모델 하나(JSON·다이어그램·rev·편집자·접속자) 또는 `sinceRev` 이후 델타. `kind=SET_VIEW` 면 내 화면 상태(보는 다이어그램·선택한 표)를 알린다. 읽기 전용 사용자도 부를 수 있다 | READ |
| execute | 작업 중 표시와 공동 편집자 등록·해제. `kind` 값은 ADD_EDITOR·REMOVE_EDITOR·CLAIM·RELEASE | EDIT |
```

`docs/erd-tool/deferred.md` 38번 행의 마지막 칸(처리)을 채운다. 행의 다른 칸은 그대로 둔다.

```text
바꾸기 전 끝부분: ... | 최종 검토 | |
바꾼 뒤 끝부분:   ... | 최종 검토 | 단계 1 Task 1 커밋 — `view` 의 `kind=SET_VIEW` 로 옮겼다 |
```

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/backend/mdm docs/mdm/screens/erdEdit/erdEdit_기능설계서.md docs/erd-tool/deferred.md
/usr/bin/git commit -m "feat(mdm): ERD 화면 상태 공유를 view 읽기 경로로 옮김" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r"
```

---

### Task 2: DB 메타 조회 — `ErdDbMeta`·`ErdDbMetaReader`

스키마 하나의 표·컬럼·키·FK·인덱스·주석을 딕셔너리 뷰(`ALL_*`)로 읽는다. 행 데이터는 읽지 않는다(스펙 2.1-4). analog DB 뷰어의 템플릿은 쓰지 않고 MDM 의 `JdbcTemplate` 을 쓴다(Global Constraints). 다른 스키마를 읽는 권한은 로컬의 `SELECT ANY TABLE` 에 기댄다(스펙 5절, deferred 17).

Review Focus 2: 같은 이름의 표·제약·인덱스가 여러 스키마에 있다(`TB_MCM_CODE_*` 가 MCM_SOURCE 와 MCMAPUSER 에 모두 있다). 모든 조인을 OWNER 로 묶지 않으면 컬럼·키·주석이 섞인다. 시험 PDB(TPL_EMPTY 복제)에는 다른 스키마에 표가 없으므로, 시험이 MCM_SOURCE 에 MDM 과 같은 이름의 표·제약·인덱스를 직접 만들어 섞임을 일으킨다.

**Files:**
- Create: `E/dbmeta/ErdDbMeta.java`
- Create: `E/dbmeta/ErdDbMetaReader.java`
- Create: `AT/ErdV1Meta.java` (시험 도우미: V1 기준선 표만 남기기. Task 3 회귀 시험도 쓴다)
- Test: `AT/ErdDbMetaReaderTest.java`

**Interfaces:**
- Consumes: Spring `JdbcTemplate`(MDM 데이터소스).
- Produces (README "메타 조회·추정기" 그대로):
  - `record ErdDbMeta(String owner, List<Table> tables, List<Constraint> constraints, List<Index> indexes)` 와 중첩 record `Table`·`Column`·`Constraint`·`Index`.
  - `ErdDbMetaReader.read(String owner) : ErdDbMeta` (`@Component`).
- 이 Task 에서 정한 값 규칙(Task 4·5 가 기대어 쓴다):
  - `owner` 는 앞뒤 공백을 지우고 대문자로 바꾼다. `^[A-Z][A-Z0-9_$#]{0,127}$` 가 아니면 `IllegalArgumentException`.
  - 표: `DROPPED='NO'`, 이름이 `BIN$` 로 시작하지 않음, `UPPER(이름) <> 'FLYWAY_SCHEMA_HISTORY'`, 중첩·보조·IOT 넘침 표가 아님. 뷰는 넣지 않는다. 컬럼·제약·인덱스도 이 표들의 것만 남긴다.
  - `Column.dataType` 은 `DATA_TYPE` 그대로다(예 `TIMESTAMP(6)`). 모델 타입으로 바꾸는 일은 Task 4 가 한다.
  - `Column.length`: `CHAR_USED='C'` 면 `CHAR_LENGTH`(문자 수), `CHAR_USED='B'` 이거나 `RAW` 면 `DATA_LENGTH`, 나머지는 null.
  - `Column.precision`·`scale`: `DATA_PRECISION`·`DATA_SCALE` 그대로(null 가능).
  - `Column.defaultValue`: `DATA_DEFAULT_VC` 의 앞뒤 공백을 지운 값. IDENTITY 컬럼은 null 이다. 시퀀스 이름이 DB 마다 달라 DB 차이(Task 5)가 흔들리기 때문이다.
  - `Constraint`: P·U·R 만 읽는다(CHECK 는 읽지 않으므로 `SYS_` NOT NULL CHECK 도 자연히 빠진다). `columns` 는 `POSITION` 순이다. R 은 `refTable`·`refColumns`(같은 위치 짝)를 채우고, P·U 는 `refTable=null`·`refColumns=[]` 이다. 부모가 다른 스키마인 R(`R_OWNER <> OWNER`)은 읽지 않는다.
  - `Index`: 함수 기반·LOB·도메인 인덱스와 PK·UK 를 받치는 인덱스는 넣지 않는다. 키는 `constraints` 로 이미 온다.
  - 정렬: SQL 의 `ORDER BY` 를 따른다(표 이름, 컬럼 `COLUMN_ID`, 제약 (표, 이름, 위치), 인덱스 (표, 이름, 위치)). 이름 순서는 세션 NLS_SORT 에 따라 다를 수 있으므로, 순서에 기대는 쪽(추정기)은 스스로 정렬한다.

- [ ] **Step 1: 시험 도우미 작성 — `ErdV1Meta`**

```java
// AT/ErdV1Meta.java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.core.io.ClassPathResource;

/**
 * V1 기준선이 만든 표만 남기는 시험 도우미. 시험 PDB(TPL_EMPTY 복제)의 MDMAPUSER 에는 V6 ERD 표(FK 6개)도 있어서,
 * 연구 정답(FK 53개)과 맞추려면 V1 원문의 CREATE TABLE 이름으로 걸러야 한다(MdmBaselineConstraintsOraTest 와 같은 방식).
 */
final class ErdV1Meta {

    private static final Pattern CREATE_TABLE = Pattern.compile("CREATE\\s+TABLE\\s+(\\w+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern FOREIGN_KEY = Pattern.compile("FOREIGN\\s+KEY");

    private ErdV1Meta() {
    }

    /** 주석 줄을 뺀 V1 원문. */
    static String text() {
        try {
            return new ClassPathResource("db/migration/mdm/oracle/V1__baseline.sql").getContentAsString(StandardCharsets.UTF_8)
                    .lines().filter(l -> !l.stripLeading().startsWith("--")).collect(Collectors.joining("\n"));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static Set<String> tables() {
        Set<String> out = new TreeSet<>();
        Matcher m = CREATE_TABLE.matcher(text());
        while (m.find()) out.add(m.group(1).toUpperCase(Locale.ROOT));
        if (out.size() < 39) throw new IllegalStateException("V1 에서 표 이름을 읽지 못했다: " + out.size());
        return out;
    }

    /** V1 원문의 FOREIGN KEY 수(연구 정답 53). */
    static long foreignKeyCount() {
        return FOREIGN_KEY.matcher(text()).results().count();
    }

    /** keep 에 든 표와 그 표끼리의 제약·인덱스만 남긴다. */
    static ErdDbMeta restrict(ErdDbMeta m, Set<String> keep) {
        return new ErdDbMeta(m.owner(),
                m.tables().stream().filter(t -> keep.contains(t.name())).toList(),
                m.constraints().stream()
                        .filter(c -> keep.contains(c.table()) && (c.refTable() == null || keep.contains(c.refTable())))
                        .toList(),
                m.indexes().stream().filter(i -> keep.contains(i.table())).toList());
    }
}
```

- [ ] **Step 2: 실패하는 시험 작성 — `ErdDbMetaReaderTest`**

```java
// AT/ErdDbMetaReaderTest.java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Column;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Constraint;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Index;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta.Table;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMetaReader;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** ERD 메타 조회 — 시험 PDB 의 MDMAPUSER(V1 기준선)와, 시험이 MCM_SOURCE 에 만든 같은 이름의 표로 OWNER 묶음을 본다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class ErdDbMetaReaderTest extends AbstractMdmSharedDbTest {

    /** 시험 PDB 에 사용자만 있고 표는 없는 스키마(scripts/oracle/pdb.mjs SCHEMA_USERS, CREATE TABLE 권한 있음). */
    static final String OTHER = "MCM_SOURCE";
    static final List<String> OTHER_TABLES = List.of("TB_MDM_COLUMN_SYSTEM", "TB_MDM_SYSTEM"); // 지우는 순서(자식 먼저)

    @Autowired ErdDbMetaReader reader;
    @Value("${spring.datasource.url}") String url;
    @Value("${spring.datasource.password}") String password;

    static Table table(ErdDbMeta m, String name) {
        List<Table> found = m.tables().stream().filter(t -> t.name().equals(name)).toList();
        assertThat(found).as("표 " + name + " 는 한 번만 나와야 한다").hasSize(1);
        return found.get(0);
    }

    static Column column(Table t, String name) {
        return t.columns().stream().filter(c -> c.name().equals(name)).findFirst()
                .orElseThrow(() -> new AssertionError(t.name() + "." + name + " 가 없다"));
    }

    static Constraint constraint(ErdDbMeta m, String name) {
        List<Constraint> found = m.constraints().stream().filter(c -> c.name().equals(name)).toList();
        assertThat(found).as("제약 " + name + " 는 한 번만 나와야 한다").hasSize(1);
        return found.get(0);
    }

    static Index index(ErdDbMeta m, String name) {
        List<Index> found = m.indexes().stream().filter(i -> i.name().equals(name)).toList();
        assertThat(found).as("인덱스 " + name + " 는 한 번만 나와야 한다").hasSize(1);
        return found.get(0);
    }

    static <T> void assertUniqueNames(List<T> list, Function<T, String> name, String what) {
        Set<String> dup = list.stream().collect(Collectors.groupingBy(name, Collectors.counting()))
                .entrySet().stream().filter(e -> e.getValue() > 1).map(e -> e.getKey()).collect(Collectors.toSet());
        assertThat(dup).as(what + " 이름이 겹친다(조인이 다른 스키마 행을 끌어왔다)").isEmpty();
    }

    @Test
    void readsV1TablesColumnsKeysAndIndexes() {
        ErdDbMeta all = reader.read(" mdmapuser ");
        assertThat(all.owner()).isEqualTo("MDMAPUSER");
        assertThat(all.tables()).extracting(Table::name)
                .noneMatch(n -> n.startsWith("BIN$") || n.equalsIgnoreCase("FLYWAY_SCHEMA_HISTORY"));
        assertThat(all.constraints()).extracting(Constraint::table)
                .noneMatch(n -> n.equalsIgnoreCase("FLYWAY_SCHEMA_HISTORY"));

        Set<String> v1 = ErdV1Meta.tables();
        ErdDbMeta m = ErdV1Meta.restrict(all, v1);
        assertThat(m.tables()).extracting(Table::name).containsExactlyInAnyOrderElementsOf(v1); // V1 표가 모두 있다
        assertThat(m.constraints().stream().filter(c -> c.type().equals("R")).count()).isEqualTo(ErdV1Meta.foreignKeyCount());

        Constraint composite = constraint(m, "FK_TB_MDM_CODE_CATE_ITEM_VER");
        assertThat(composite.table()).isEqualTo("TB_MDM_CODE_CATE_ITEM");
        assertThat(composite.type()).isEqualTo("R");
        assertThat(composite.columns()).containsExactly("MARU_CODE_ID", "FROM_VER");
        assertThat(composite.refTable()).isEqualTo("TB_MDM_CODE_VER");
        assertThat(composite.refColumns()).containsExactly("MARU_CODE_ID", "VER");

        Constraint toUnique = constraint(m, "FK_TB_MDM_LAYOUT_ITEM_COLUMN"); // 부모가 UNIQUE(UX_TB_MDM_COLUMN_PHYS_NAME)
        assertThat(toUnique.columns()).containsExactly("COLUMN_PHYS");
        assertThat(toUnique.refTable()).isEqualTo("TB_MDM_COLUMN");
        assertThat(toUnique.refColumns()).containsExactly("PHYS_NAME");

        Constraint self = constraint(m, "FK_TB_MDM_DOMAIN_DOMAIN");
        assertThat(self.table()).isEqualTo("TB_MDM_DOMAIN");
        assertThat(self.refTable()).isEqualTo("TB_MDM_DOMAIN");
        assertThat(self.columns()).containsExactly("PARENT_DOMAIN_ID");
        assertThat(self.refColumns()).containsExactly("DOMAIN_ID");

        Constraint pk = constraint(m, "PK_TB_MDM_COLUMN_SYSTEM");
        assertThat(pk.type()).isEqualTo("P");
        assertThat(pk.columns()).containsExactly("COLUMN_ID", "SYSTEM_CODE", "PHYS_NAME");
        assertThat(pk.refTable()).isNull();
        assertThat(pk.refColumns()).isEmpty();
        Constraint uk = constraint(m, "UX_TB_MDM_COLUMN_PHYS_NAME");
        assertThat(uk.type()).isEqualTo("U");
        assertThat(uk.columns()).containsExactly("PHYS_NAME");

        Table code = table(m, "TB_MDM_CODE");
        assertThat(code.columns().get(0).name()).isEqualTo("MARU_CODE_ID");
        assertThat(code.columns().get(0).position()).isEqualTo(1);
        Column status = column(code, "STATUS");          // VARCHAR2(20 CHAR) DEFAULT 'CREATED' NOT NULL
        assertThat(status.dataType()).isEqualTo("VARCHAR2");
        assertThat(status.length()).isEqualTo(20);
        assertThat(status.nullable()).isFalse();
        assertThat(status.defaultValue()).isEqualTo("'CREATED'");
        Column name = column(code, "MARU_CODE_NAME");    // VARCHAR2(4000 BYTE)
        assertThat(name.length()).isEqualTo(4000);
        Column cAt = column(code, "C_AT");               // TIMESTAMP(6)
        assertThat(cAt.dataType()).isEqualTo("TIMESTAMP(6)");
        assertThat(cAt.length()).isNull();
        assertThat(cAt.scale()).isEqualTo(6);
        assertThat(cAt.nullable()).isTrue();

        Column domainId = column(table(m, "TB_MDM_DOMAIN"), "DOMAIN_ID"); // NUMBER(19) IDENTITY
        assertThat(domainId.dataType()).isEqualTo("NUMBER");
        assertThat(domainId.precision()).isEqualTo(19);
        assertThat(domainId.scale()).isEqualTo(0);
        assertThat(domainId.length()).isNull();
        assertThat(domainId.defaultValue()).isNull();

        Table dict = table(m, "TB_MDM_COLUMN");          // V5 주석
        assertThat(dict.comment()).isEqualTo("컬럼 사전");
        assertThat(column(dict, "COLUMN_ID").comment()).isEqualTo("컬럼 아이디");

        Index ix = index(m, "IX_TB_MDM_COLUMN_SYSTEM_SYS_PHYS");
        assertThat(ix.table()).isEqualTo("TB_MDM_COLUMN_SYSTEM");
        assertThat(ix.unique()).isFalse();
        assertThat(ix.columns()).containsExactly("SYSTEM_CODE", "PHYS_NAME");
        assertThat(m.indexes()).extracting(Index::name)
                .doesNotContain("PK_TB_MDM_COLUMN", "UX_TB_MDM_COLUMN_PHYS_NAME") // 키를 받치는 인덱스
                .doesNotContain("IX_TB_MDM_COLUMN_UP_PHYS");                      // V2 함수 기반 인덱스
    }

    /** Review Focus 2. 다른 스키마에 이름이 같은 표·제약·인덱스·주석이 있어도 섞이지 않는다. */
    @Test
    void readerJoinsEveryDictionaryViewOnOwner() throws Exception {
        try (Connection con = DriverManager.getConnection(url, OTHER, password); Statement st = con.createStatement()) {
            dropOtherTables(st);
            try {
                // MDM 과 이름이 같지만 컬럼·키 구성이 다른 표 두 개. 제약·인덱스 이름도 MDM 것과 같게 만든다.
                st.execute("""
                        CREATE TABLE TB_MDM_SYSTEM (
                            OTHER_CODE   VARCHAR2(7 CHAR) NOT NULL,
                            SYSTEM_CODE  NUMBER(5),
                            CONSTRAINT PK_TB_MDM_SYSTEM PRIMARY KEY (OTHER_CODE))""");
                st.execute("""
                        CREATE TABLE TB_MDM_COLUMN_SYSTEM (
                            X_NOTE      VARCHAR2(9 CHAR) NOT NULL,
                            SYSTEM_REF  VARCHAR2(7 CHAR),
                            CONSTRAINT PK_TB_MDM_COLUMN_SYSTEM PRIMARY KEY (X_NOTE),
                            CONSTRAINT FK_TB_MDM_COLUMN_SYSTEM_SYSTEM FOREIGN KEY (SYSTEM_REF) REFERENCES TB_MDM_SYSTEM (OTHER_CODE))""");
                st.execute("CREATE INDEX IX_TB_MDM_COLUMN_SYSTEM_SYS_PHYS ON TB_MDM_COLUMN_SYSTEM (SYSTEM_REF, X_NOTE)");
                st.execute("COMMENT ON TABLE TB_MDM_SYSTEM IS '다른 스키마 표'");
                st.execute("COMMENT ON COLUMN TB_MDM_SYSTEM.SYSTEM_CODE IS '다른 스키마 컬럼'");

                ErdDbMeta mdm = reader.read("MDMAPUSER");
                assertUniqueNames(mdm.tables(), Table::name, "표");
                assertUniqueNames(mdm.constraints(), Constraint::name, "제약");
                assertUniqueNames(mdm.indexes(), Index::name, "인덱스");
                Table sys = table(mdm, "TB_MDM_SYSTEM");
                assertThat(sys.comment()).isEqualTo("시스템");
                assertThat(sys.columns()).extracting(Column::name).doesNotContain("OTHER_CODE");
                assertUniqueNames(sys.columns(), Column::name, "TB_MDM_SYSTEM 컬럼");
                Column code = column(sys, "SYSTEM_CODE");
                assertThat(code.dataType()).isEqualTo("VARCHAR2");
                assertThat(code.length()).isEqualTo(20);
                assertThat(code.comment()).isEqualTo("시스템 코드");
                assertThat(constraint(mdm, "PK_TB_MDM_SYSTEM").columns()).containsExactly("SYSTEM_CODE");
                assertThat(constraint(mdm, "PK_TB_MDM_COLUMN_SYSTEM").columns()).containsExactly("COLUMN_ID", "SYSTEM_CODE", "PHYS_NAME");
                Constraint fk = constraint(mdm, "FK_TB_MDM_COLUMN_SYSTEM_SYSTEM");
                assertThat(fk.columns()).containsExactly("SYSTEM_CODE");
                assertThat(fk.refTable()).isEqualTo("TB_MDM_SYSTEM");
                assertThat(fk.refColumns()).containsExactly("SYSTEM_CODE");
                assertThat(index(mdm, "IX_TB_MDM_COLUMN_SYSTEM_SYS_PHYS").columns()).containsExactly("SYSTEM_CODE", "PHYS_NAME");

                ErdDbMeta other = reader.read(OTHER);
                assertThat(other.owner()).isEqualTo(OTHER);
                assertThat(other.tables()).extracting(Table::name).filteredOn(n -> n.startsWith("TB_MDM_"))
                        .containsExactly("TB_MDM_COLUMN_SYSTEM", "TB_MDM_SYSTEM");
                Table oSys = table(other, "TB_MDM_SYSTEM");
                assertThat(oSys.comment()).isEqualTo("다른 스키마 표");
                assertThat(oSys.columns()).extracting(Column::name).containsExactly("OTHER_CODE", "SYSTEM_CODE");
                Column oCode = column(oSys, "SYSTEM_CODE");
                assertThat(oCode.dataType()).isEqualTo("NUMBER");
                assertThat(oCode.precision()).isEqualTo(5);
                assertThat(oCode.comment()).isEqualTo("다른 스키마 컬럼");
                assertThat(other.constraints()).filteredOn(c -> c.table().startsWith("TB_MDM_")).extracting(Constraint::name)
                        .containsExactlyInAnyOrder("PK_TB_MDM_SYSTEM", "PK_TB_MDM_COLUMN_SYSTEM", "FK_TB_MDM_COLUMN_SYSTEM_SYSTEM");
                assertThat(constraint(other, "PK_TB_MDM_SYSTEM").columns()).containsExactly("OTHER_CODE");
                Constraint oFk = constraint(other, "FK_TB_MDM_COLUMN_SYSTEM_SYSTEM");
                assertThat(oFk.columns()).containsExactly("SYSTEM_REF");
                assertThat(oFk.refTable()).isEqualTo("TB_MDM_SYSTEM");
                assertThat(oFk.refColumns()).containsExactly("OTHER_CODE");
                assertThat(index(other, "IX_TB_MDM_COLUMN_SYSTEM_SYS_PHYS").columns()).containsExactly("SYSTEM_REF", "X_NOTE");
            } finally {
                dropOtherTables(st);
            }
        }
    }

    @Test
    void ownerIsValidatedAndUnknownOwnerIsEmpty() {
        ErdDbMeta none = reader.read("NO_SUCH_OWNER_ERD");
        assertThat(none.tables()).isEmpty();
        assertThat(none.constraints()).isEmpty();
        assertThat(none.indexes()).isEmpty();
        assertThatThrownBy(() -> reader.read("MDMAPUSER' OR '1'='1")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> reader.read(" ")).isInstanceOf(IllegalArgumentException.class);
    }

    /** 휴지통에 남기지 않는다(PURGE). 없으면 넘어간다(ORA-00942). */
    private static void dropOtherTables(Statement st) throws SQLException {
        for (String t : OTHER_TABLES) {
            try {
                st.execute("DROP TABLE " + t + " CASCADE CONSTRAINTS PURGE");
            } catch (SQLException e) {
                if (e.getErrorCode() != 942) throw e;
            }
        }
    }
}
```

- [ ] **Step 3: 시험이 실패하는지 확인**

Run: `cd src/backend/mdm && DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdDbMetaReaderTest'`
Expected: 컴파일 실패(`ErdDbMeta`·`ErdDbMetaReader` 가 없다).

- [ ] **Step 4: 구현 — `ErdDbMeta`**

```java
// E/dbmeta/ErdDbMeta.java
package com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta;

import java.util.List;

/**
 * 스키마 하나의 딕셔너리 메타(스펙 2.1-4). 행 데이터는 담지 않는다. {@link ErdDbMetaReader} 가 만들고, 관계 추정기·가져오기·DB 차이가 읽는다.
 * 이름은 DB 그대로(대문자 물리명)다. 정렬: 표 이름 순, 컬럼 COLUMN_ID 순, 제약·인덱스 (표, 이름) 순.
 */
public record ErdDbMeta(String owner, List<Table> tables, List<Constraint> constraints, List<Index> indexes) {

    public ErdDbMeta {
        tables = List.copyOf(tables);
        constraints = List.copyOf(constraints);
        indexes = List.copyOf(indexes);
    }

    /** comment 는 ALL_TAB_COMMENTS 값(없으면 null). */
    public record Table(String name, String comment, List<Column> columns) {
        public Table {
            columns = List.copyOf(columns);
        }
    }

    /**
     * dataType 은 ALL_TAB_COLUMNS.DATA_TYPE 그대로다(예 TIMESTAMP(6)). 모델 타입으로 바꾸는 일은 가져오기가 한다.
     * length: CHAR_USED='C' 면 CHAR_LENGTH(문자 수), 'B' 이거나 RAW 면 DATA_LENGTH(바이트), 나머지 null.
     * precision·scale: DATA_PRECISION·DATA_SCALE 그대로. defaultValue: DATA_DEFAULT_VC 앞뒤 공백을 지운 값, IDENTITY 컬럼은 null.
     */
    public record Column(String name, int position, String dataType, Integer length, Integer precision, Integer scale,
                         boolean nullable, String defaultValue, String comment) {
    }

    /** type 은 P|U|R. columns 는 POSITION 순. refTable·refColumns 는 R 만 채운다(같은 위치끼리 짝). P·U 는 null·빈 목록. */
    public record Constraint(String name, String table, String type, List<String> columns, String refTable, List<String> refColumns) {
        public Constraint {
            columns = List.copyOf(columns);
            refColumns = refColumns == null ? List.of() : List.copyOf(refColumns);
        }
    }

    /** PK·UK 를 받치는 인덱스와 함수 기반·LOB 인덱스는 넣지 않는다. columns 는 COLUMN_POSITION 순. */
    public record Index(String name, String table, boolean unique, List<String> columns) {
        public Index {
            columns = List.copyOf(columns);
        }
    }
}
```

- [ ] **Step 5: 구현 — `ErdDbMetaReader`**

아래 네 SQL 은 2026-10-11 에 L_MAIN 에서 MDMAPUSER 로 글자 그대로 돌려 확인했다. 결과는 표 39, 컬럼 756행, 제약 P 40개/78행(flyway 이력 표 PK 1개 포함, 자바에서 뺀다), U 2개/4행, R 53개/62행(부모 컬럼 62개 모두 짝지음), 인덱스 36개/45행이다. `DATA_DEFAULT_VC`·`IDENTITY_COLUMN` 은 26ai 의 `ALL_TAB_COLUMNS` 에 있다. IDENTITY 컬럼(`TB_MDM_DOMAIN.DOMAIN_ID`)의 기본값은 `"MDMAPUSER"."ISEQ$$_…".nextval` 이라 null 로 바꾼다.

```java
// E/dbmeta/ErdDbMetaReader.java
package com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Component;

/**
 * ERD 가져오기용 딕셔너리 메타 조회(스펙 2.1-4). ALL_* 뷰만 읽고 행 데이터는 읽지 않는다. 다른 스키마는 로컬의 SELECT ANY TABLE 로 보인다.
 *
 * <p>같은 이름의 표·제약·인덱스가 여러 스키마에 있으므로(TB_MCM_CODE_* 는 MCM_SOURCE·MCMAPUSER 모두에 있다) 모든 조인을 OWNER 로 묶는다
 * (Review Focus 2). analog DB 뷰어 템플릿(maxRows·허용 스키마·10초 제한)은 쓰지 않는다. 쿼리는 네 번이다(표·컬럼·제약·인덱스).
 */
@Component
public class ErdDbMetaReader {

    private static final Pattern OWNER = Pattern.compile("^[A-Z][A-Z0-9_$#]{0,127}$");
    private static final int FETCH_SIZE = 500;

    static final String TABLES_SQL = """
            SELECT T.TABLE_NAME
                 , C.COMMENTS
              FROM ALL_TABLES T
                 , ALL_TAB_COMMENTS C
             WHERE T.OWNER = ?
               AND T.DROPPED = 'NO'
               AND T.NESTED = 'NO'
               AND T.SECONDARY = 'N'
               AND (T.IOT_TYPE IS NULL OR T.IOT_TYPE = 'IOT')
               AND T.TABLE_NAME NOT LIKE 'BIN$%'
               AND UPPER(T.TABLE_NAME) <> 'FLYWAY_SCHEMA_HISTORY'
               AND C.OWNER(+) = T.OWNER
               AND C.TABLE_NAME(+) = T.TABLE_NAME
             ORDER BY T.TABLE_NAME
            """;

    /** 뷰의 컬럼도 나오지만 표 목록에 없는 행은 자바에서 버린다. */
    static final String COLUMNS_SQL = """
            SELECT C.TABLE_NAME
                 , C.COLUMN_NAME
                 , C.COLUMN_ID
                 , C.DATA_TYPE
                 , C.DATA_LENGTH
                 , C.CHAR_LENGTH
                 , C.CHAR_USED
                 , C.DATA_PRECISION
                 , C.DATA_SCALE
                 , C.NULLABLE
                 , C.IDENTITY_COLUMN
                 , C.DATA_DEFAULT_VC
                 , M.COMMENTS
              FROM ALL_TAB_COLUMNS C
                 , ALL_COL_COMMENTS M
             WHERE C.OWNER = ?
               AND M.OWNER(+) = C.OWNER
               AND M.TABLE_NAME(+) = C.TABLE_NAME
               AND M.COLUMN_NAME(+) = C.COLUMN_NAME
             ORDER BY C.TABLE_NAME, C.COLUMN_ID
            """;

    /** 부모가 다른 스키마인 FK 는 읽지 않는다(모듈 사이 FK 없음, ADR-0003). R 의 부모 컬럼은 같은 POSITION 으로 짝짓는다. */
    static final String CONSTRAINTS_SQL = """
            SELECT K.TABLE_NAME
                 , K.CONSTRAINT_NAME
                 , K.CONSTRAINT_TYPE
                 , CC.COLUMN_NAME
                 , CC.POSITION
                 , R.TABLE_NAME AS REF_TABLE
                 , RC.COLUMN_NAME AS REF_COLUMN
              FROM ALL_CONSTRAINTS K
                 , ALL_CONS_COLUMNS CC
                 , ALL_CONSTRAINTS R
                 , ALL_CONS_COLUMNS RC
             WHERE K.OWNER = ?
               AND K.CONSTRAINT_TYPE IN ('P', 'U', 'R')
               AND (K.CONSTRAINT_TYPE <> 'R' OR K.R_OWNER = K.OWNER)
               AND CC.OWNER = K.OWNER
               AND CC.TABLE_NAME = K.TABLE_NAME
               AND CC.CONSTRAINT_NAME = K.CONSTRAINT_NAME
               AND R.OWNER(+) = K.R_OWNER
               AND R.CONSTRAINT_NAME(+) = K.R_CONSTRAINT_NAME
               AND RC.OWNER(+) = R.OWNER
               AND RC.CONSTRAINT_NAME(+) = R.CONSTRAINT_NAME
               AND RC.POSITION(+) = CC.POSITION
             ORDER BY K.TABLE_NAME, K.CONSTRAINT_NAME, CC.POSITION
            """;

    /** 함수 기반·LOB·도메인 인덱스와 PK·UK 를 받치는 인덱스는 뺀다. */
    static final String INDEXES_SQL = """
            SELECT I.TABLE_NAME
                 , I.INDEX_NAME
                 , I.UNIQUENESS
                 , IC.COLUMN_NAME
                 , IC.COLUMN_POSITION
              FROM ALL_INDEXES I
                 , ALL_IND_COLUMNS IC
             WHERE I.TABLE_OWNER = ?
               AND I.OWNER = I.TABLE_OWNER
               AND I.INDEX_TYPE IN ('NORMAL', 'NORMAL/REV', 'BITMAP')
               AND IC.INDEX_OWNER = I.OWNER
               AND IC.INDEX_NAME = I.INDEX_NAME
               AND IC.TABLE_OWNER = I.TABLE_OWNER
               AND IC.TABLE_NAME = I.TABLE_NAME
               AND NOT EXISTS (SELECT 1
                                 FROM ALL_CONSTRAINTS K
                                WHERE K.OWNER = I.TABLE_OWNER
                                  AND K.TABLE_NAME = I.TABLE_NAME
                                  AND K.INDEX_OWNER = I.OWNER
                                  AND K.INDEX_NAME = I.INDEX_NAME
                                  AND K.CONSTRAINT_TYPE IN ('P', 'U'))
             ORDER BY I.TABLE_NAME, I.INDEX_NAME, IC.COLUMN_POSITION
            """;

    private final JdbcTemplate jdbc;

    public ErdDbMetaReader(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public ErdDbMeta read(String owner) {
        String o = owner == null ? "" : owner.trim().toUpperCase(Locale.ROOT);
        if (!OWNER.matcher(o).matches()) throw new IllegalArgumentException("스키마 이름이 올바르지 않습니다: " + owner);

        Map<String, String> comments = new LinkedHashMap<>();
        query(TABLES_SQL, o, rs -> {
            String name = rs.getString("TABLE_NAME");
            // 같은 표가 두 번 나오면 주석 조인이 OWNER 로 묶이지 않은 것이다. 마지막 행이 이기게 두면 섞임을 숨긴다.
            if (comments.containsKey(name)) {
                throw new IllegalStateException("표 " + name + " 가 두 번 나왔다 — 딕셔너리 조인이 OWNER 로 묶이지 않았다");
            }
            comments.put(name, rs.getString("COMMENTS"));
        });

        Map<String, List<ErdDbMeta.Column>> columns = new LinkedHashMap<>();
        comments.keySet().forEach(t -> columns.put(t, new ArrayList<>()));
        query(COLUMNS_SQL, o, rs -> {
            List<ErdDbMeta.Column> list = columns.get(rs.getString("TABLE_NAME"));
            if (list == null) return; // 뺀 표 또는 뷰
            String type = rs.getString("DATA_TYPE");
            String def = "YES".equals(rs.getString("IDENTITY_COLUMN")) ? null : trimToNull(rs.getString("DATA_DEFAULT_VC"));
            list.add(new ErdDbMeta.Column(rs.getString("COLUMN_NAME"), rs.getInt("COLUMN_ID"), type,
                    length(type, rs.getString("CHAR_USED"), rs.getInt("DATA_LENGTH"), rs.getInt("CHAR_LENGTH")),
                    intOrNull(rs, "DATA_PRECISION"), intOrNull(rs, "DATA_SCALE"),
                    "Y".equals(rs.getString("NULLABLE")), def, rs.getString("COMMENTS")));
        });
        List<ErdDbMeta.Table> tables = new ArrayList<>();
        comments.forEach((name, comment) -> tables.add(new ErdDbMeta.Table(name, comment, columns.get(name))));

        // computeIfAbsent 람다 안에서는 SQLException 을 던질 수 없으므로 값을 먼저 읽는다.
        Map<String, ConstraintAcc> cons = new LinkedHashMap<>();
        query(CONSTRAINTS_SQL, o, rs -> {
            String table = rs.getString("TABLE_NAME");
            if (!comments.containsKey(table)) return; // flyway 이력 표 PK 등
            String name = rs.getString("CONSTRAINT_NAME");
            String type = rs.getString("CONSTRAINT_TYPE");
            String refTable = rs.getString("REF_TABLE");
            ConstraintAcc a = cons.computeIfAbsent(name, n -> new ConstraintAcc(n, table, type, refTable));
            a.columns.add(rs.getString("COLUMN_NAME"));
            String ref = rs.getString("REF_COLUMN");
            if (ref != null) a.refColumns.add(ref);
        });
        List<ErdDbMeta.Constraint> constraints = new ArrayList<>();
        for (ConstraintAcc a : cons.values()) {
            if ("R".equals(a.type) && !comments.containsKey(a.refTable)) continue; // 부모 표를 뺐다
            constraints.add(new ErdDbMeta.Constraint(a.name, a.table, a.type, a.columns,
                    "R".equals(a.type) ? a.refTable : null, "R".equals(a.type) ? a.refColumns : List.of()));
        }

        Map<String, IndexAcc> idx = new LinkedHashMap<>();
        query(INDEXES_SQL, o, rs -> {
            String table = rs.getString("TABLE_NAME");
            if (!comments.containsKey(table)) return;
            String name = rs.getString("INDEX_NAME");
            boolean unique = "UNIQUE".equals(rs.getString("UNIQUENESS"));
            idx.computeIfAbsent(name, n -> new IndexAcc(n, table, unique)).columns.add(rs.getString("COLUMN_NAME"));
        });
        List<ErdDbMeta.Index> indexes = idx.values().stream()
                .map(a -> new ErdDbMeta.Index(a.name, a.table, a.unique, a.columns)).toList();

        return new ErdDbMeta(o, tables, constraints, indexes);
    }

    /** 공유 JdbcTemplate 의 설정을 바꾸지 않고 문장마다 fetch 크기만 키운다(컬럼 수백 행). */
    private void query(String sql, String owner, RowCallbackHandler handler) {
        PreparedStatementCreator psc = con -> {
            PreparedStatement ps = con.prepareStatement(sql);
            ps.setFetchSize(FETCH_SIZE);
            ps.setString(1, owner);
            return ps;
        };
        jdbc.query(psc, handler);
    }

    static Integer length(String type, String charUsed, int dataLength, int charLength) {
        if ("C".equals(charUsed)) return charLength;
        if ("B".equals(charUsed) || "RAW".equals(type)) return dataLength;
        return null;
    }

    private static Integer intOrNull(ResultSet rs, String col) throws SQLException {
        int v = rs.getInt(col);
        return rs.wasNull() ? null : v;
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static final class ConstraintAcc {
        final String name;
        final String table;
        final String type;
        final String refTable;
        final List<String> columns = new ArrayList<>();
        final List<String> refColumns = new ArrayList<>();

        ConstraintAcc(String name, String table, String type, String refTable) {
            this.name = name;
            this.table = table;
            this.type = type;
            this.refTable = refTable;
        }
    }

    private static final class IndexAcc {
        final String name;
        final String table;
        final boolean unique;
        final List<String> columns = new ArrayList<>();

        IndexAcc(String name, String table, boolean unique) {
            this.name = name;
            this.table = table;
            this.unique = unique;
        }
    }
}
```

- [ ] **Step 6: 시험이 통과하는지 확인**

Run: `cd src/backend/mdm && DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdDbMetaReaderTest'`
Expected: PASS(3개). `readerJoinsEveryDictionaryViewOnOwner` 가 연결에서 실패하면(ORA-01017·ORA-01045) 시험 PDB 에 MCM_SOURCE 사용자가 없거나 권한이 없는 것이다. `node scripts/oracle/pdb.mjs list` 로 템플릿을 확인하고, 시험을 건너뛰지 말고 원인을 고친다.

경계 확인(시험이 OWNER 묶음 누락을 실제로 잡는지). 아래 두 줄을 하나씩 잠시 지우고 같은 명령을 돌린다. 두 경우 모두 `readerJoinsEveryDictionaryViewOnOwner` 가 실패해야 한다. 확인한 뒤 줄을 되돌린다.
1. `CONSTRAINTS_SQL` 의 `AND CC.OWNER = K.OWNER` — `FK_TB_MDM_COLUMN_SYSTEM_SYSTEM` 의 컬럼에 `SYSTEM_REF` 가 섞여 컬럼 단언에서 실패한다.
2. `TABLES_SQL` 의 `AND C.OWNER(+) = T.OWNER` — `TB_MDM_SYSTEM` 이 두 번 나와 `IllegalStateException`("두 번 나왔다")으로 실패한다.

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -m "feat(mdm): ERD 가져오기용 DB 딕셔너리 메타 조회" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r"
```

---

### Task 3: 관계 추정기와 회귀 시험

메타(Task 2)와 근거 파일(Task 10 이 만든다)로 관계 후보를 만든다. 추정기는 DB·파일을 읽지 않는 순수 계산이다. 순서는 DB FK → 문서(DOC) → SQL 조인(SQL_JOIN) → 칼럼명 규칙(NAME_RULE)이다(스펙 2.1-4). 칼럼명 규칙은 연구 변형 `x` 를 그대로 옮긴다. 회귀 시험은 S10 대로 MDM V1 표(FK 53개)에서 DB FK 를 숨기고 **표 짝** 정밀도 ≥ 0.57, 재현율 ≥ 0.78 을 단언한다.

**Files:**
- Modify: `E/model/ErdRelation.java` (`candidateRank`)
- Create: `E/infer/InferredRelation.java`, `E/infer/ErdHints.java`, `E/infer/ErdHintsLoader.java`, `E/infer/ErdRelationInferrer.java`
- Modify: `LT/model/ErdModelCodecTest.java` (`candidateRankIsOptional`)
- Test: `LT/infer/ErdRelationInferrerTest.java`, `LT/infer/ErdHintsLoaderTest.java`
- Create: `src/backend/mdm/lib/src/test/resources/erd/hints/test-ok.json`, `test-bad.json`, `test-broken.json`
- Test: `AT/ErdInferRegressionTest.java`

**Interfaces:**
- Consumes: Task 2 `ErdDbMeta`·`ErdDbMetaReader`, `AT/ErdV1Meta`. 단계 0 `ErdEvidence(String kind, String ref)`.
- Produces (README 그대로):
  - `ErdRelation.candidateRank : Integer`(JSON `candidateRank`, null 이면 쓰지 않는다).
  - `record InferredRelation(String childTable, List<String> childColumns, String parentTable, List<String> parentColumns, String state, List<ErdEvidence> evidence, Integer candidateRank)`.
  - `record ErdHints(List<Ref> refs)`, `ErdHints.EMPTY`, `record ErdHints.Ref(String kind, String childTable, List<String> childColumns, String parentTable, List<String> parentColumns, String ref)`.
  - `ErdHintsLoader.load(String module) : ErdHints` (`@Component`). 클래스패스 `erd/hints/<module>.json`. 파일이 없으면 `ErdHints.EMPTY`, 형식이 틀리면 `IllegalStateException`, 모듈 이름이 `^[a-z0-9][a-z0-9-]{0,19}$` 가 아니면 `IllegalArgumentException`.
  - `ErdRelationInferrer.infer(ErdDbMeta meta, ErdHints hints) : List<InferredRelation>` (`@Component`, 상태 없음).

추정 규칙(이 Task 에서 정한다):
1. **합치기 열쇠:** (자식 표, 부모 표, `자식컬럼=부모컬럼` 짝들을 정렬한 집합). 같은 열쇠는 관계 하나로 합치고 근거를 단계 순으로 덧붙인다(같은 근거는 한 번). 상태는 처음 만든 단계가 정한다. DB FK 면 `DB`, 나머지는 `INFERRED` 다.
2. **DB FK:** 자식·부모 표가 메타에 있는 R 제약마다 `DB` 관계 하나, 근거 `DB_FK`(ref = 제약 이름). 자기 참조와 UNIQUE 부모도 그대로 넣는다. (자식 표, 제약 이름) 순으로 넣는다.
3. **DOC → SQL_JOIN:** 근거 파일의 `refs` 를 kind 별로 `ref` 순으로 넣는다. 표나 컬럼이 메타에 없거나, 짝 수가 다르거나, 같은 표의 같은 컬럼끼리면 버린다(낡은 근거). SQL 조인은 방향이 없다. 그래서 부모 쪽 컬럼이 그 표의 PK·UK 가 아니고 자식 쪽 컬럼이 PK·UK 면 자식과 부모를 바꾼다.
4. **NAME_RULE(변형 x):**
   - 부모 후보는 P 제약이 있는 표다. UK 는 부모로 보지 않는다.
   - 자식 후보는 모든 표다(PK 없는 표 포함). 자기 자신은 빼고, 1:1 표는 두 방향을 모두 낸다.
   - 단일 PK `k`: 자식에 같은 이름의 컬럼이 있으면 후보다. `k` 가 `ID` 이거나 감사 칼럼 10개(`C_USR_ID C_SVC_ID C_PGM_ID C_AT U_USR_ID U_SVC_ID U_PGM_ID U_AT VER ROW_VERSION`)면 내지 않는다. 근거 ref 는 `PK 이름 일치` 다.
   - 복합 PK: 자식에 PK 컬럼이 모두 있으면 관계 하나(짝 여러 개)를 낸다. 감사 칼럼은 빼지 않는다(변형 x 그대로). 근거 ref 는 `복합 PK 이름 일치` 다.
   - 앞 단계(1~3)가 같은 (자식 표, 부모 표)를 다른 짝으로 이미 이었으면 이 후보는 버린다. 짝까지 같으면 근거만 붙인다.
5. **허브 순위(`candidateRank`):**
   - 관계를 (자식 표, 정렬한 자식 컬럼 집합)으로 묶는다. 묶음이 2개 이상이면 그 안의 `INFERRED` 에 순위를 준다. 순서는 아래 6단계다.
     1. 문서·SQL 조인 근거가 있는 후보가 먼저다.
     2. 자식 표 이름과 부모 표 이름을 `_` 로 나눴을 때 앞에서부터 같은 토막이 많은 후보가 먼저다.
     3. 부모 표 이름의 토막 수가 적은 후보가 먼저다.
     4. 부모 표 이름이 사전 순으로 앞서는 후보가 먼저다.
     5. 부모 컬럼이 사전 순으로 앞서는 후보가 먼저다.
   - 묶음에 `DB` 관계가 없으면 1 부터, 있으면 2 부터 매긴다. `DB` 관계는 순위를 받지 않는다(null). 그래서 화면은 null·1 을 그리고 2 이상을 "다른 후보 n개" 로 접는다.
   - 묶음이 하나뿐이면 null 이다.
   - 예: `TB_MCM_SEC_USER_WIDGET.USER_ID` 의 부모 후보가 `TB_MCM_SEC_USER`(같은 토막 4, 토막 수 4), `TB_MCM_SEC_USER_PWD`(같은 토막 4, 토막 수 5), `TB_SEC_USER`(같은 토막 1)이면 순위는 1·2·3 이다.
6. **출력 순서:** (자식 표, 자식 컬럼, 순위(null 은 0), 부모 표, 부모 컬럼). 입력 순서가 달라도 결과가 같다.

- [ ] **Step 1: 실패하는 시험 작성 — `candidateRank`**

`LT/model/ErdModelCodecTest.java` 에 시험 하나를 더한다.

```java
    /** 단계 1 S7. 단계 0 모델 JSON(필드 없음)을 그대로 읽고, null 이면 쓰지 않아 단계 0 JSON 과 같은 글자로 남는다. */
    @Test
    void candidateRankIsOptional() {
        String withRelation = JSON.replace("\"relations\":{}", """
                "relations":{"r-1":{"child":"t-1","parent":"t-1","pairs":[],"identifying":false,
                  "cardinality":{"parent":"ONE","child":"ZERO_OR_MORE"},"state":"INFERRED","dbFk":false,
                  "evidence":[],"parentRef":null,"_rev":{}}}""");
        ErdModel m = ErdModelCodec.read(withRelation);
        assertThat(m.relations.get("r-1").candidateRank).isNull();
        assertThat(ErdModelCodec.write(m)).doesNotContain("candidateRank");
        m.relations.get("r-1").candidateRank = 2;
        assertThat(ErdModelCodec.write(m)).contains("\"candidateRank\":2");
        assertThat(ErdModelCodec.read(ErdModelCodec.write(m)).relations.get("r-1").candidateRank).isEqualTo(2);
    }
```

- [ ] **Step 2: 실패하는 시험 작성 — `ErdRelationInferrerTest`**

```java
// LT/infer/ErdRelationInferrerTest.java
package com.dongkuk.dmes.mdm.dma.erdEdit.infer;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

/** 관계 추정기 — 순서(DB FK → DOC → SQL_JOIN → NAME_RULE), 변형 x, 합치기, 허브 순위, 결정성. */
class ErdRelationInferrerTest {

    final ErdRelationInferrer inferrer = new ErdRelationInferrer();

    static List<String> l(String... s) {
        return List.of(s);
    }

    static ErdDbMeta.Table table(String name, String... cols) {
        List<ErdDbMeta.Column> list = new ArrayList<>();
        for (int i = 0; i < cols.length; i++) {
            list.add(new ErdDbMeta.Column(cols[i], i + 1, "VARCHAR2", 30, null, null, true, null, null));
        }
        return new ErdDbMeta.Table(name, null, list);
    }

    static ErdDbMeta.Constraint pk(String table, String... cols) {
        return new ErdDbMeta.Constraint("PK_" + table, table, "P", l(cols), null, List.of());
    }

    static ErdDbMeta.Constraint uk(String name, String table, String... cols) {
        return new ErdDbMeta.Constraint(name, table, "U", l(cols), null, List.of());
    }

    static ErdDbMeta.Constraint fk(String name, String table, List<String> cols, String ref, List<String> refCols) {
        return new ErdDbMeta.Constraint(name, table, "R", cols, ref, refCols);
    }

    static ErdDbMeta meta(List<ErdDbMeta.Table> tables, List<ErdDbMeta.Constraint> cons) {
        return new ErdDbMeta("S", tables, cons, List.of());
    }

    static ErdHints.Ref doc(String ct, List<String> cc, String pt, List<String> pc, String ref) {
        return new ErdHints.Ref("DOC", ct, cc, pt, pc, ref);
    }

    static ErdHints.Ref sql(String ct, List<String> cc, String pt, List<String> pc, String ref) {
        return new ErdHints.Ref("SQL_JOIN", ct, cc, pt, pc, ref);
    }

    static List<InferredRelation> between(List<InferredRelation> rs, String child, String parent) {
        return rs.stream().filter(r -> r.childTable().equals(child) && r.parentTable().equals(parent)).toList();
    }

    static InferredRelation one(List<InferredRelation> rs, String child, String parent) {
        List<InferredRelation> found = between(rs, child, parent);
        assertThat(found).as(child + " > " + parent).hasSize(1);
        return found.get(0);
    }

    /** Review Focus 1 의 추정기 몫. PK 없는 표·복합 PK·UNIQUE 부모·자기 참조 FK 가 모두 DB 관계로 들어온다. */
    @Test
    void importBuildsCompositeUniqueAndSelfReference() {
        var m = meta(
                List.of(table("TB_LAYOUT", "LAYOUT_ID", "VER"),
                        table("TB_HEADER", "H_SEQ", "LAYOUT_ID", "VER", "HEADER_LAYOUT_ID"),
                        table("TB_CONST", "CONST_ID", "LAYOUT_ID", "VER", "HEADER_LAYOUT_ID"),
                        table("TB_FOLDER", "FOLDER_ID", "PARENT_FOLDER_ID"),
                        table("TB_LOG", "LOG_TEXT", "FOLDER_ID")),                     // PK 없음
                List.of(pk("TB_LAYOUT", "LAYOUT_ID", "VER"),
                        pk("TB_HEADER", "H_SEQ"),
                        uk("UX_TB_HEADER_HDR", "TB_HEADER", "LAYOUT_ID", "VER", "HEADER_LAYOUT_ID"),
                        pk("TB_CONST", "CONST_ID"),
                        pk("TB_FOLDER", "FOLDER_ID"),
                        fk("FK_TB_HEADER_LAYOUT", "TB_HEADER", l("LAYOUT_ID", "VER"), "TB_LAYOUT", l("LAYOUT_ID", "VER")),
                        fk("FK_TB_CONST_HEADER", "TB_CONST", l("LAYOUT_ID", "VER", "HEADER_LAYOUT_ID"),
                                "TB_HEADER", l("LAYOUT_ID", "VER", "HEADER_LAYOUT_ID")),
                        fk("FK_TB_FOLDER_PARENT", "TB_FOLDER", l("PARENT_FOLDER_ID"), "TB_FOLDER", l("FOLDER_ID"))));
        var rs = inferrer.infer(m, ErdHints.EMPTY);

        var composite = one(rs, "TB_HEADER", "TB_LAYOUT");
        assertThat(composite.state()).isEqualTo("DB");
        assertThat(composite.childColumns()).containsExactly("LAYOUT_ID", "VER");
        assertThat(composite.parentColumns()).containsExactly("LAYOUT_ID", "VER");
        // DB FK 와 짝이 같은 이름 규칙 후보는 근거만 붙는다.
        assertThat(composite.evidence()).containsExactly(new ErdEvidence("DB_FK", "FK_TB_HEADER_LAYOUT"),
                new ErdEvidence("NAME_RULE", "복합 PK 이름 일치"));
        // UNIQUE 부모: TB_CONST 는 TB_LAYOUT 의 PK(LAYOUT_ID, VER)도 다 가지지만 그 후보는 TB_CONST > TB_LAYOUT 로 따로 남는다.
        var toUnique = one(rs, "TB_CONST", "TB_HEADER");
        assertThat(toUnique.state()).isEqualTo("DB");
        assertThat(toUnique.childColumns()).containsExactly("LAYOUT_ID", "VER", "HEADER_LAYOUT_ID");
        assertThat(toUnique.evidence()).containsExactly(new ErdEvidence("DB_FK", "FK_TB_CONST_HEADER"));
        var self = one(rs, "TB_FOLDER", "TB_FOLDER");
        assertThat(self.state()).isEqualTo("DB");
        assertThat(self.childColumns()).containsExactly("PARENT_FOLDER_ID");
        assertThat(self.parentColumns()).containsExactly("FOLDER_ID");
        // PK 없는 표는 자식이 될 수 있지만 부모는 되지 않는다.
        var fromLog = one(rs, "TB_LOG", "TB_FOLDER");
        assertThat(fromLog.state()).isEqualTo("INFERRED");
        assertThat(rs).noneMatch(r -> r.parentTable().equals("TB_LOG"));
        assertThat(rs).filteredOn(r -> r.state().equals("DB")).allMatch(r -> r.candidateRank() == null);
    }

    @Test
    void nameRuleFollowsVariantX() {
        var m = meta(
                List.of(table("TB_USER", "USER_ID", "USER_NM"),
                        table("TB_USER_PWD", "USER_ID", "PWD"),
                        table("TB_SEQ_ONLY", "ID", "USER_ID"),
                        table("TB_AUDITED", "VER", "NOTE"),
                        table("TB_UK", "UK_CODE"),
                        table("TB_REF", "REF_ID", "UK_CODE", "ID", "NOTE"),
                        table("TB_CV", "CODE_ID", "VER"),
                        table("TB_X", "X_ID", "CODE_ID", "VER"),
                        table("TB_Y", "Y_ID", "CODE_ID")),
                List.of(pk("TB_USER", "USER_ID"), pk("TB_USER_PWD", "USER_ID"), pk("TB_SEQ_ONLY", "ID"),
                        pk("TB_AUDITED", "VER"), uk("UX_TB_UK", "TB_UK", "UK_CODE"), pk("TB_REF", "REF_ID"),
                        pk("TB_CV", "CODE_ID", "VER"), pk("TB_X", "X_ID"), pk("TB_Y", "Y_ID")));
        var rs = inferrer.infer(m, ErdHints.EMPTY);

        assertThat(rs).allMatch(r -> r.state().equals("INFERRED"));
        assertThat(rs).allMatch(r -> r.evidence().size() == 1 && r.evidence().get(0).kind().equals("NAME_RULE"));
        assertThat(rs).noneMatch(r -> r.childTable().equals(r.parentTable()));                // 자기 자신 제외
        assertThat(one(rs, "TB_USER_PWD", "TB_USER").evidence()).containsExactly(new ErdEvidence("NAME_RULE", "PK 이름 일치"));
        assertThat(between(rs, "TB_USER", "TB_USER_PWD")).hasSize(1);                         // 1:1 은 두 방향
        assertThat(rs).noneMatch(r -> r.parentTable().equals("TB_SEQ_ONLY"));                 // PK 가 ID
        assertThat(rs).noneMatch(r -> r.parentTable().equals("TB_AUDITED"));                  // PK 가 감사 칼럼
        assertThat(rs).noneMatch(r -> r.parentTable().equals("TB_UK"));                       // UK 는 부모가 아니다
        var full = one(rs, "TB_X", "TB_CV");                                                  // 복합 PK 전체, VER 도 뺀 적 없다
        assertThat(full.childColumns()).containsExactly("CODE_ID", "VER");
        assertThat(full.parentColumns()).containsExactly("CODE_ID", "VER");
        assertThat(full.evidence()).containsExactly(new ErdEvidence("NAME_RULE", "복합 PK 이름 일치"));
        assertThat(between(rs, "TB_Y", "TB_CV")).isEmpty();                                   // 일부만 있으면 없다
        assertThat(one(rs, "TB_SEQ_ONLY", "TB_USER").candidateRank()).isNotNull();            // USER_ID 는 부모 후보 2개
    }

    @Test
    void hintsMergeInOrderAndSqlJoinTurnsTowardKey() {
        var m = meta(
                List.of(table("TB_MCM_SEC_OBJ", "OBJECT_ID", "OBJ_NM"),
                        table("TB_MCM_SEC_MENU", "MENU_ID", "OBJECT_ID"),
                        table("TB_MCM_SEC_MENU_FLD", "FLD_ID", "PARENT_FLD_ID")),
                List.of(pk("TB_MCM_SEC_OBJ", "OBJECT_ID"), pk("TB_MCM_SEC_MENU", "MENU_ID"), pk("TB_MCM_SEC_MENU_FLD", "FLD_ID")));
        var hints = new ErdHints(List.of(
                // SQL 조인은 방향이 없다. 키(PK) 쪽을 부모로 돌린다.
                sql("TB_MCM_SEC_OBJ", l("OBJECT_ID"), "TB_MCM_SEC_MENU", l("OBJECT_ID"), "src/backend/mcm/MenuQuery.java:10"),
                doc("TB_MCM_SEC_MENU", l("OBJECT_ID"), "TB_MCM_SEC_OBJ", l("OBJECT_ID"), "docs/mcm/erd/csa-menu.dbml:494"),
                doc("TB_MCM_SEC_MENU_FLD", l("PARENT_FLD_ID"), "TB_MCM_SEC_MENU_FLD", l("FLD_ID"), "docs/mcm/erd/csa-menu.dbml:492")));
        var rs = inferrer.infer(m, hints);

        var menuObj = one(rs, "TB_MCM_SEC_MENU", "TB_MCM_SEC_OBJ");
        assertThat(menuObj.state()).isEqualTo("INFERRED");
        assertThat(menuObj.evidence()).containsExactly(
                new ErdEvidence("DOC", "docs/mcm/erd/csa-menu.dbml:494"),
                new ErdEvidence("SQL_JOIN", "src/backend/mcm/MenuQuery.java:10"),
                new ErdEvidence("NAME_RULE", "PK 이름 일치"));
        assertThat(between(rs, "TB_MCM_SEC_OBJ", "TB_MCM_SEC_MENU")).isEmpty();
        var self = one(rs, "TB_MCM_SEC_MENU_FLD", "TB_MCM_SEC_MENU_FLD");                     // 문서의 자기 참조
        assertThat(self.childColumns()).containsExactly("PARENT_FLD_ID");
        assertThat(self.evidence()).containsExactly(new ErdEvidence("DOC", "docs/mcm/erd/csa-menu.dbml:492"));
    }

    @Test
    void staleHintsAreIgnored() {
        var m = meta(List.of(table("TB_A", "A_ID"), table("TB_B", "B_ID", "A_ID")),
                List.of(pk("TB_A", "A_ID"), pk("TB_B", "B_ID")));
        var stale = new ErdHints(List.of(
                doc("TB_GONE", l("A_ID"), "TB_A", l("A_ID"), "d:1"),                 // 없는 표
                doc("TB_B", l("NO_COL"), "TB_A", l("A_ID"), "d:2"),                  // 없는 컬럼
                doc("TB_B", l("A_ID", "B_ID"), "TB_A", l("A_ID"), "d:3"),            // 짝 수가 다름
                sql("TB_B", l("A_ID"), "TB_B", l("A_ID"), "s:1")));                  // 같은 표 같은 컬럼
        assertThat(inferrer.infer(m, stale)).isEqualTo(inferrer.infer(m, ErdHints.EMPTY));
    }

    static ErdDbMeta hubMeta(ErdDbMeta.Constraint... extra) {
        List<ErdDbMeta.Constraint> cons = new ArrayList<>(List.of(
                pk("TB_MCM_SEC_USER", "USER_ID"), pk("TB_SEC_USER", "USER_ID"), pk("TB_MCM_SEC_USER_PWD", "USER_ID"),
                pk("TB_MCM_SEC_USER_WIDGET", "WIDGET_ID"), pk("TB_MCM_DEPT", "DEPT_CD")));
        cons.addAll(List.of(extra));
        return meta(List.of(table("TB_MCM_SEC_USER", "USER_ID", "USER_NM"),
                        table("TB_SEC_USER", "USER_ID"),
                        table("TB_MCM_SEC_USER_PWD", "USER_ID", "PWD"),
                        table("TB_MCM_SEC_USER_WIDGET", "WIDGET_ID", "USER_ID", "DEPT_CD"),
                        table("TB_MCM_DEPT", "DEPT_CD", "DEPT_NM")),
                cons);
    }

    @Test
    void hubColumnRanksNearestParentFirst() {
        var rs = inferrer.infer(hubMeta(), ErdHints.EMPTY);
        assertThat(one(rs, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_SEC_USER").candidateRank()).isEqualTo(1);
        assertThat(one(rs, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_SEC_USER_PWD").candidateRank()).isEqualTo(2);
        assertThat(one(rs, "TB_MCM_SEC_USER_WIDGET", "TB_SEC_USER").candidateRank()).isEqualTo(3);
        assertThat(one(rs, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_DEPT").candidateRank()).isNull();  // 후보 하나
        // 출력 순서: 같은 자식 컬럼 묶음 안에서는 순위 순.
        assertThat(rs.stream().filter(r -> r.childTable().equals("TB_MCM_SEC_USER_WIDGET") && r.childColumns().equals(l("USER_ID")))
                .map(InferredRelation::parentTable).toList())
                .containsExactly("TB_MCM_SEC_USER", "TB_MCM_SEC_USER_PWD", "TB_SEC_USER");
    }

    @Test
    void docEvidenceOutranksNameAndDbRelationKeepsNull() {
        var withDoc = inferrer.infer(hubMeta(), new ErdHints(List.of(
                doc("TB_MCM_SEC_USER_WIDGET", l("USER_ID"), "TB_SEC_USER", l("USER_ID"), "docs/x.dbml:1"))));
        assertThat(one(withDoc, "TB_MCM_SEC_USER_WIDGET", "TB_SEC_USER").candidateRank()).isEqualTo(1);
        assertThat(one(withDoc, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_SEC_USER").candidateRank()).isEqualTo(2);
        assertThat(one(withDoc, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_SEC_USER_PWD").candidateRank()).isEqualTo(3);

        var withDb = inferrer.infer(hubMeta(fk("FK_WIDGET_USER", "TB_MCM_SEC_USER_WIDGET", l("USER_ID"), "TB_SEC_USER", l("USER_ID"))),
                ErdHints.EMPTY);
        var db = one(withDb, "TB_MCM_SEC_USER_WIDGET", "TB_SEC_USER");
        assertThat(db.state()).isEqualTo("DB");
        assertThat(db.candidateRank()).isNull();
        assertThat(one(withDb, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_SEC_USER").candidateRank()).isEqualTo(2);
        assertThat(one(withDb, "TB_MCM_SEC_USER_WIDGET", "TB_MCM_SEC_USER_PWD").candidateRank()).isEqualTo(3);
    }

    @Test
    void resultIsDeterministic() {
        ErdDbMeta m = hubMeta();
        var hints = new ErdHints(List.of(
                doc("TB_MCM_SEC_USER_WIDGET", l("DEPT_CD"), "TB_MCM_DEPT", l("DEPT_CD"), "docs/b.dbml:2"),
                sql("TB_MCM_SEC_USER_PWD", l("USER_ID"), "TB_MCM_SEC_USER", l("USER_ID"), "src/a.java:1")));
        List<ErdDbMeta.Table> tables = new ArrayList<>(m.tables());
        List<ErdDbMeta.Constraint> cons = new ArrayList<>(m.constraints());
        List<ErdHints.Ref> refs = new ArrayList<>(hints.refs());
        Collections.reverse(tables);
        Collections.reverse(cons);
        Collections.reverse(refs);
        assertThat(inferrer.infer(new ErdDbMeta("S", tables, cons, List.of()), new ErdHints(refs)))
                .isEqualTo(inferrer.infer(m, hints));
    }
}
```

- [ ] **Step 3: 실패하는 시험 작성 — `ErdHintsLoaderTest` 와 시험 근거 파일**

`src/backend/mdm/lib/src/test/resources/erd/hints/test-ok.json`:

```json
{ "module": "test-ok", "generatedBy": "scripts/erd/erd-hints.mjs", "generatedAt": "2026-10-11T10:00:00Z",
  "refs": [
    { "kind": "DOC", "child": { "table": "TB_MCM_SEC_MENU", "columns": ["OBJECT_ID"] },
      "parent": { "table": "TB_MCM_SEC_OBJ", "columns": ["OBJECT_ID"] }, "ref": "docs/mcm/erd/csa-menu.dbml:494" },
    { "kind": "SQL_JOIN", "child": { "table": "tb_mcm_sec_user_widget", "columns": ["user_id", "tab_id"] },
      "parent": { "table": "TB_MCM_SEC_USER_WIDGET_TAB", "columns": ["USER_ID", "TAB_ID"] }, "ref": "src/backend/mcm/X.java:12" } ] }
```

`src/backend/mdm/lib/src/test/resources/erd/hints/test-bad.json`:

```json
{ "module": "test-bad", "refs": [
    { "kind": "GUESS", "child": { "table": "TB_A", "columns": ["A_ID"] },
      "parent": { "table": "TB_B", "columns": ["A_ID"] }, "ref": "x:1" } ] }
```

`src/backend/mdm/lib/src/test/resources/erd/hints/test-broken.json` (일부러 깨진 JSON):

```text
{ "module": "test-broken", "refs": [
```

```java
// LT/infer/ErdHintsLoaderTest.java
package com.dongkuk.dmes.mdm.dma.erdEdit.infer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class ErdHintsLoaderTest {

    final ErdHintsLoader loader = new ErdHintsLoader();

    @Test
    void readsNestedRefsIntoFlatRecordsAndUpperCasesNames() {
        ErdHints h = loader.load("test-ok");
        assertThat(h.refs()).containsExactly(
                new ErdHints.Ref("DOC", "TB_MCM_SEC_MENU", List.of("OBJECT_ID"), "TB_MCM_SEC_OBJ", List.of("OBJECT_ID"),
                        "docs/mcm/erd/csa-menu.dbml:494"),
                new ErdHints.Ref("SQL_JOIN", "TB_MCM_SEC_USER_WIDGET", List.of("USER_ID", "TAB_ID"), "TB_MCM_SEC_USER_WIDGET_TAB",
                        List.of("USER_ID", "TAB_ID"), "src/backend/mcm/X.java:12"));
    }

    @Test
    void missingFileIsEmpty() {
        assertThat(loader.load("no-such-module")).isEqualTo(ErdHints.EMPTY);
    }

    @Test
    void malformedFileFails() {
        assertThatThrownBy(() -> loader.load("test-bad")).isInstanceOf(IllegalStateException.class).hasMessageContaining("kind");
        assertThatThrownBy(() -> loader.load("test-broken")).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("erd-hints.mjs");
    }

    @Test
    void moduleNameIsValidated() {
        assertThatThrownBy(() -> loader.load("../secret")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> loader.load("")).isInstanceOf(IllegalArgumentException.class);
    }
}
```

- [ ] **Step 4: 시험이 실패하는지 확인**

Run: `cd src/backend/mdm && ../gradlew :lib:test --max-workers=2 --tests '*ErdRelationInferrerTest' --tests '*ErdHintsLoaderTest' --tests '*ErdModelCodecTest'`
Expected: 컴파일 실패(`infer` 패키지와 `candidateRank` 가 없다).

- [ ] **Step 5: 구현 — `ErdRelation.candidateRank`**

`E/model/ErdRelation.java` 의 `parentRef` 필드 뒤에 더하고, import 에 `com.fasterxml.jackson.annotation.JsonInclude` 를 더한다.

```java
    /**
     * 허브 칼럼 후보 순위(단계 1 S7). 허브가 아니거나 DB 관계면 null, 그릴 후보 1, 접는 후보 2..n.
     * 엔진 명령은 이 값을 쓰지 않는다. null 이면 JSON 에 쓰지 않아 단계 0 모델 JSON 이 바뀌지 않는다.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public Integer candidateRank;
```

- [ ] **Step 6: 구현 — `InferredRelation`, `ErdHints`, `ErdHintsLoader`**

```java
// E/infer/InferredRelation.java
package com.dongkuk.dmes.mdm.dma.erdEdit.infer;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import java.util.List;

/** 추정기 결과 하나. 컬럼 목록은 같은 위치끼리 짝이다. state 는 DB|INFERRED. 가져오기(Task 4)가 ErdRelation 으로 바꾼다. */
public record InferredRelation(String childTable, List<String> childColumns, String parentTable, List<String> parentColumns,
                               String state, List<ErdEvidence> evidence, Integer candidateRank) {

    public InferredRelation {
        childColumns = List.copyOf(childColumns);
        parentColumns = List.copyOf(parentColumns);
        evidence = List.copyOf(evidence);
    }
}
```

```java
// E/infer/ErdHints.java
package com.dongkuk.dmes.mdm.dma.erdEdit.infer;

import java.util.List;

/** 리포 문서·SQL 조인에서 뽑은 관계 근거(단계 1 S6). 파일 형식은 README "근거 파일" 절. 이름은 대문자 물리명이다. */
public record ErdHints(List<Ref> refs) {

    public static final ErdHints EMPTY = new ErdHints(List.of());

    public ErdHints {
        refs = List.copyOf(refs);
    }

    /** kind 는 DOC|SQL_JOIN. ref 는 근거 위치(예 docs/mcm/erd/csa-menu.dbml:494). */
    public record Ref(String kind, String childTable, List<String> childColumns, String parentTable, List<String> parentColumns,
                      String ref) {
        public Ref {
            childColumns = List.copyOf(childColumns);
            parentColumns = List.copyOf(parentColumns);
        }
    }
}
```

```java
// E/infer/ErdHintsLoader.java
package com.dongkuk.dmes.mdm.dma.erdEdit.infer;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * 클래스패스 erd/hints/&lt;module&gt;.json 을 읽는다(단계 1 S6). 배포 서버에는 docs·소스가 없어서 scripts/erd/erd-hints.mjs 가 만든 파일을 커밋해 둔다.
 * 파일이 없으면 그 근거만 빠진다(빈 값). 형식이 틀리면 조용히 넘기지 않고 실패한다(낡은 생성기를 알아채게).
 * 파일 모양은 child·parent 를 객체로 감싸고 ErdHints.Ref 는 평평하므로, record 에 바로 묶지 않고 노드를 읽어 옮긴다.
 */
@Component
public class ErdHintsLoader {

    private static final Pattern MODULE = Pattern.compile("^[a-z0-9][a-z0-9-]{0,19}$");
    private static final Set<String> KINDS = Set.of("DOC", "SQL_JOIN");

    public ErdHints load(String module) {
        String m = module == null ? "" : module.trim().toLowerCase(Locale.ROOT);
        if (!MODULE.matcher(m).matches()) throw new IllegalArgumentException("모듈 이름이 올바르지 않습니다: " + module);
        ClassPathResource res = new ClassPathResource("erd/hints/" + m + ".json");
        if (!res.exists()) return ErdHints.EMPTY;
        try (InputStream in = res.getInputStream()) {
            return parse(ErdModelCodec.MAPPER.readTree(in), res.getPath());
        } catch (IOException e) {
            throw bad(res.getPath(), "JSON 을 읽을 수 없습니다: " + e.getMessage());
        }
    }

    static ErdHints parse(JsonNode root, String where) {
        JsonNode refs = root == null ? null : root.get("refs");
        if (refs == null || !refs.isArray()) throw bad(where, "refs 배열이 없습니다");
        List<ErdHints.Ref> out = new ArrayList<>();
        for (int i = 0; i < refs.size(); i++) {
            JsonNode r = refs.get(i);
            String kind = r.path("kind").asText("");
            if (!KINDS.contains(kind)) throw bad(where, "refs[" + i + "].kind 는 DOC·SQL_JOIN 중 하나여야 합니다: " + kind);
            out.add(new ErdHints.Ref(kind,
                    name(r.path("child").path("table"), where, i, "child.table"),
                    names(r.path("child").path("columns"), where, i, "child.columns"),
                    name(r.path("parent").path("table"), where, i, "parent.table"),
                    names(r.path("parent").path("columns"), where, i, "parent.columns"),
                    r.path("ref").asText("")));
        }
        return new ErdHints(out);
    }

    private static String name(JsonNode n, String where, int i, String field) {
        String v = n.asText("").trim().toUpperCase(Locale.ROOT);
        if (v.isEmpty()) throw bad(where, "refs[" + i + "]." + field + " 가 비었습니다");
        return v;
    }

    private static List<String> names(JsonNode arr, String where, int i, String field) {
        if (!arr.isArray() || arr.isEmpty()) throw bad(where, "refs[" + i + "]." + field + " 는 비지 않은 배열이어야 합니다");
        List<String> out = new ArrayList<>();
        for (JsonNode c : arr) out.add(name(c, where, i, field));
        return out;
    }

    private static IllegalStateException bad(String where, String why) {
        return new IllegalStateException("근거 파일 " + where + " 이 올바르지 않습니다: " + why
                + ". scripts/erd/erd-hints.mjs 로 다시 만드세요");
    }
}
```

- [ ] **Step 7: 구현 — `ErdRelationInferrer`**

```java
// E/infer/ErdRelationInferrer.java
package com.dongkuk.dmes.mdm.dma.erdEdit.infer;

import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.stereotype.Component;

/**
 * 관계 추정기(스펙 2.1-4, 단계 1 S7). 메타와 근거만 보는 순수 계산이다. DB·파일을 읽지 않고 상태도 없다.
 *
 * <p>순서는 DB FK → 문서(DOC) → SQL 조인(SQL_JOIN) → 칼럼명 규칙(NAME_RULE)이다. 같은 (자식 표, 부모 표, 컬럼 짝 집합)은 관계 하나로
 * 합치고 근거를 단계 순으로 붙인다. 칼럼명 규칙은 연구 변형 x 와 같다(docs/erd-tool/research-2026-10-09/J-relation-inference.md 2절,
 * MDM 표 짝 정밀도 0.57·재현율 0.78). 바꾸면 ErdInferRegressionTest 가 막는다.
 */
@Component
public class ErdRelationInferrer {

    /** 감사 칼럼(cactus CactusAuditEntity 9개 + ROW_VERSION). 단일 PK 규칙에서만 뺀다(변형 x). */
    static final Set<String> AUDIT = Set.of("C_USR_ID", "C_SVC_ID", "C_PGM_ID", "C_AT",
            "U_USR_ID", "U_SVC_ID", "U_PGM_ID", "U_AT", "VER", "ROW_VERSION");
    static final String RULE_SINGLE = "PK 이름 일치";
    static final String RULE_COMPOSITE = "복합 PK 이름 일치";

    /** 허브 후보 순서: 문서·SQL 근거 → 앞 토막이 많이 같은 부모 → 토막이 적은 부모 → 부모 이름 → 부모 컬럼. */
    private static final Comparator<Rel> NEAREST = Comparator
            .comparing((Rel r) -> !r.hasHintEvidence())
            .thenComparingInt(r -> -commonLeadingTokens(r.child, r.parent))
            .thenComparingInt(r -> r.parent.split("_").length)
            .thenComparing(r -> r.parent)
            .thenComparing(r -> String.join(",", r.parentCols));

    private static final Comparator<Rel> OUTPUT = Comparator
            .comparing((Rel r) -> r.child)
            .thenComparing(r -> String.join(",", r.childCols))
            .thenComparingInt(r -> r.rank == null ? 0 : r.rank)
            .thenComparing(r -> r.parent)
            .thenComparing(r -> String.join(",", r.parentCols));

    public List<InferredRelation> infer(ErdDbMeta meta, ErdHints hints) {
        Map<String, Set<String>> cols = new HashMap<>();
        for (ErdDbMeta.Table t : meta.tables()) {
            Set<String> s = new HashSet<>();
            t.columns().forEach(c -> s.add(c.name()));
            cols.put(t.name(), s);
        }
        Map<String, List<String>> pk = new TreeMap<>();
        Set<String> keys = new HashSet<>(); // PK·UK 컬럼 집합(SQL 조인 방향 정하기)
        for (ErdDbMeta.Constraint c : meta.constraints()) {
            if (!cols.containsKey(c.table())) continue;
            if ("P".equals(c.type())) pk.put(c.table(), c.columns());
            if ("P".equals(c.type()) || "U".equals(c.type())) keys.add(keyId(c.table(), c.columns()));
        }
        Acc acc = new Acc();

        // 1. DB FK
        meta.constraints().stream()
                .filter(c -> "R".equals(c.type()) && cols.containsKey(c.table()) && cols.containsKey(c.refTable()))
                .sorted(Comparator.comparing(ErdDbMeta.Constraint::table).thenComparing(ErdDbMeta.Constraint::name))
                .forEach(c -> acc.add(c.table(), c.columns(), c.refTable(), c.refColumns(), "DB",
                        new ErdEvidence("DB_FK", c.name())));

        // 2·3. 문서 → SQL 조인
        for (String kind : List.of("DOC", "SQL_JOIN")) {
            hints.refs().stream().filter(r -> kind.equals(r.kind()))
                    .sorted(Comparator.comparing(ErdHints.Ref::ref)
                            .thenComparing(r -> r.childTable() + r.childColumns() + ">" + r.parentTable() + r.parentColumns()))
                    .forEach(r -> addHint(acc, cols, keys, r));
        }

        // 4. 칼럼명 규칙(변형 x)
        Set<String> linked = acc.tablePairs();
        List<String> children = new ArrayList<>(cols.keySet());
        Collections.sort(children);
        for (Map.Entry<String, List<String>> e : pk.entrySet()) {
            String parent = e.getKey();
            List<String> k = e.getValue();
            for (String child : children) {
                if (child.equals(parent)) continue;
                Set<String> cs = cols.get(child);
                String rule;
                if (k.size() == 1) {
                    String col = k.get(0);
                    if (!cs.contains(col) || AUDIT.contains(col) || "ID".equals(col)) continue;
                    rule = RULE_SINGLE;
                } else {
                    if (!cs.containsAll(k)) continue;
                    rule = RULE_COMPOSITE;
                }
                // 앞 단계가 같은 표 짝을 다른 짝으로 이었으면 버린다. 짝까지 같으면 근거만 붙는다.
                if (acc.has(child, k, parent, k) || !linked.contains(child + ">" + parent)) {
                    acc.add(child, k, parent, k, "INFERRED", new ErdEvidence("NAME_RULE", rule));
                }
            }
        }
        return rank(acc.rels.values());
    }

    private static void addHint(Acc acc, Map<String, Set<String>> cols, Set<String> keys, ErdHints.Ref r) {
        String ct = r.childTable();
        String pt = r.parentTable();
        List<String> cc = r.childColumns();
        List<String> pc = r.parentColumns();
        if (cc.isEmpty() || cc.size() != pc.size() || !has(cols, ct, cc) || !has(cols, pt, pc)) return; // 낡은 근거
        if (ct.equals(pt) && cc.equals(pc)) return; // 같은 컬럼끼리 — 관계가 아니다
        if ("SQL_JOIN".equals(r.kind()) && !keys.contains(keyId(pt, pc)) && keys.contains(keyId(ct, cc))) {
            String t = ct;
            ct = pt;
            pt = t;
            List<String> c = cc;
            cc = pc;
            pc = c;
        }
        acc.add(ct, cc, pt, pc, "INFERRED", new ErdEvidence(r.kind(), r.ref()));
    }

    /** 허브 순위. 묶음 = (자식 표, 정렬한 자식 컬럼). DB 관계는 null, INFERRED 는 DB 가 있으면 2 부터 없으면 1 부터. */
    private static List<InferredRelation> rank(Collection<Rel> rels) {
        Map<String, List<Rel>> groups = new LinkedHashMap<>();
        for (Rel r : rels) {
            List<String> sorted = new ArrayList<>(r.childCols);
            Collections.sort(sorted);
            groups.computeIfAbsent(r.child + "|" + String.join(",", sorted), g -> new ArrayList<>()).add(r);
        }
        for (List<Rel> g : groups.values()) {
            if (g.size() < 2) continue;
            boolean hasDb = g.stream().anyMatch(r -> "DB".equals(r.state));
            int n = hasDb ? 2 : 1;
            for (Rel r : g.stream().filter(x -> !"DB".equals(x.state)).sorted(NEAREST).toList()) r.rank = n++;
        }
        List<Rel> out = new ArrayList<>(rels);
        out.sort(OUTPUT);
        return out.stream()
                .map(r -> new InferredRelation(r.child, r.childCols, r.parent, r.parentCols, r.state, r.evidence, r.rank))
                .toList();
    }

    static int commonLeadingTokens(String a, String b) {
        String[] x = a.split("_");
        String[] y = b.split("_");
        int n = 0;
        while (n < x.length && n < y.length && x[n].equals(y[n])) n++;
        return n;
    }

    private static boolean has(Map<String, Set<String>> cols, String table, List<String> columns) {
        Set<String> s = cols.get(table);
        return s != null && s.containsAll(columns);
    }

    private static String keyId(String table, List<String> columns) {
        List<String> sorted = new ArrayList<>(columns);
        Collections.sort(sorted);
        return table + "|" + String.join(",", sorted);
    }

    /** 관계를 합치기 열쇠로 모은다. 넣은 순서를 지킨다. */
    private static final class Acc {
        final Map<String, Rel> rels = new LinkedHashMap<>();

        boolean has(String ct, List<String> cc, String pt, List<String> pc) {
            return rels.containsKey(id(ct, cc, pt, pc));
        }

        void add(String ct, List<String> cc, String pt, List<String> pc, String state, ErdEvidence ev) {
            Rel r = rels.computeIfAbsent(id(ct, cc, pt, pc), k -> new Rel(ct, cc, pt, pc, state));
            if (!r.evidence.contains(ev)) r.evidence.add(ev);
        }

        Set<String> tablePairs() {
            Set<String> out = new HashSet<>();
            rels.values().forEach(r -> out.add(r.child + ">" + r.parent));
            return out;
        }

        static String id(String ct, List<String> cc, String pt, List<String> pc) {
            List<String> pairs = new ArrayList<>();
            for (int i = 0; i < cc.size(); i++) pairs.add(cc.get(i) + "=" + pc.get(i));
            Collections.sort(pairs);
            return ct + ">" + pt + ":" + String.join(",", pairs);
        }
    }

    private static final class Rel {
        final String child;
        final List<String> childCols;
        final String parent;
        final List<String> parentCols;
        final String state;
        final List<ErdEvidence> evidence = new ArrayList<>();
        Integer rank;

        Rel(String child, List<String> childCols, String parent, List<String> parentCols, String state) {
            this.child = child;
            this.childCols = List.copyOf(childCols);
            this.parent = parent;
            this.parentCols = List.copyOf(parentCols);
            this.state = state;
        }

        boolean hasHintEvidence() {
            return evidence.stream().anyMatch(e -> "DOC".equals(e.kind()) || "SQL_JOIN".equals(e.kind()));
        }
    }
}
```

- [ ] **Step 8: 단위 시험이 통과하는지 확인**

Run: `cd src/backend/mdm && ../gradlew :lib:test --max-workers=2 --tests '*ErdRelationInferrerTest' --tests '*ErdHintsLoaderTest' --tests '*ErdModelCodecTest'`
Expected: PASS.

Run: `cd src/backend/mdm && ../gradlew :lib:test --max-workers=2`
Expected: PASS. `candidateRank` 는 null 이면 JSON 에 쓰지 않으므로 단계 0 엔진·코덱 시험은 바뀌지 않는다.

- [ ] **Step 9: 회귀 시험 작성 — `ErdInferRegressionTest`**

정답은 V1 의 FK 53개(표 짝 51개)다. 이름 규칙만 재려고 메타에서 R 제약을 지우고 근거 파일은 비운다(`ErdHints.EMPTY` — Task 10 이 커밋한 `mdm.json` 이 수치를 바꾸지 않게 로더를 부르지 않는다). 순위와 상관없이 이름 규칙 후보를 모두 센다. 연구 실측은 예측 표 짝 70, 맞음 40 이다(0.5714, 0.7843). 문턱과의 여유가 없으므로 실패하면 오탐·놓침 목록을 보고 원인을 찾는다.

```java
// AT/ErdInferRegressionTest.java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMetaReader;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.ErdHints;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.ErdRelationInferrer;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.InferredRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * 관계 추정기 회귀(스펙 시험 3, 단계 1 S10). MDM V1 표의 DB FK 를 정답으로 두고, FK 를 숨긴 채 칼럼명 규칙만 돌려 표 짝 정밀도·재현율을 잰다.
 * 기준은 연구 변형 x 의 표 짝 수치(0.57·0.78)다. 컬럼 짝 수치(0.43·0.69)가 아니다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class ErdInferRegressionTest extends AbstractMdmSharedDbTest {

    @Autowired ErdDbMetaReader reader;
    final ErdRelationInferrer inferrer = new ErdRelationInferrer();

    ErdDbMeta v1() {
        return ErdV1Meta.restrict(reader.read("MDMAPUSER"), ErdV1Meta.tables());
    }

    static Set<String> pairs(List<InferredRelation> rels) {
        return rels.stream().map(r -> r.childTable() + ">" + r.parentTable()).collect(Collectors.toCollection(TreeSet::new));
    }

    @Test
    void nameRuleKeepsResearchPrecisionAndRecallOnMdmV1() {
        ErdDbMeta meta = v1();
        List<ErdDbMeta.Constraint> fks = meta.constraints().stream().filter(c -> "R".equals(c.type())).toList();
        assertThat(fks).as("V1 FK 수(정답)").hasSize((int) ErdV1Meta.foreignKeyCount());
        assertThat(fks).hasSize(53);
        Set<String> truth = fks.stream().map(c -> c.table() + ">" + c.refTable()).collect(Collectors.toCollection(TreeSet::new));
        assertThat(truth).as("정답 표 짝 수").hasSize(51);

        ErdDbMeta hidden = new ErdDbMeta(meta.owner(), meta.tables(),
                meta.constraints().stream().filter(c -> !"R".equals(c.type())).toList(), meta.indexes());
        List<InferredRelation> rels = inferrer.infer(hidden, ErdHints.EMPTY);
        assertThat(rels).allSatisfy(r -> {
            assertThat(r.state()).isEqualTo("INFERRED");
            assertThat(r.evidence()).extracting(ErdEvidence::kind).containsOnly("NAME_RULE");
        });

        Set<String> predicted = pairs(rels);
        Set<String> hit = new TreeSet<>(predicted);
        hit.retainAll(truth);
        Set<String> falsePositive = new TreeSet<>(predicted);
        falsePositive.removeAll(truth);
        Set<String> missed = new TreeSet<>(truth);
        missed.removeAll(predicted);
        double precision = (double) hit.size() / predicted.size();
        double recall = (double) hit.size() / truth.size();
        String report = String.format("표 짝 예측 %d, 정답 %d, 맞음 %d, 정밀도 %.4f, 재현율 %.4f%n오탐 %s%n놓침 %s",
                predicted.size(), truth.size(), hit.size(), precision, recall, falsePositive, missed);
        System.out.println("[ErdInferRegressionTest] " + report);
        assertThat(precision).as(report).isGreaterThanOrEqualTo(0.57);
        assertThat(recall).as(report).isGreaterThanOrEqualTo(0.78);
    }

    /** 완료 기준 "MDM FK 는 DB 상태로 들어온다". FK 마다 DB 관계가 있고, 같은 표 짝에 다른 짝의 추정 관계가 남지 않는다. */
    @Test
    void everyV1ForeignKeyComesInAsDbRelation() {
        ErdDbMeta meta = v1();
        List<InferredRelation> rels = inferrer.infer(meta, ErdHints.EMPTY);
        for (ErdDbMeta.Constraint fk : meta.constraints().stream().filter(c -> "R".equals(c.type())).toList()) {
            assertThat(rels).as(fk.name()).anySatisfy(r -> {
                assertThat(r.state()).isEqualTo("DB");
                assertThat(r.evidence()).contains(new ErdEvidence("DB_FK", fk.name()));
                assertThat(r.childTable()).isEqualTo(fk.table());
                assertThat(r.childColumns()).isEqualTo(fk.columns());
                assertThat(r.parentTable()).isEqualTo(fk.refTable());
                assertThat(r.parentColumns()).isEqualTo(fk.refColumns());
            });
        }
        Set<String> dbPairs = pairs(rels.stream().filter(r -> "DB".equals(r.state())).toList());
        assertThat(pairs(rels.stream().filter(r -> "INFERRED".equals(r.state())).toList())).doesNotContainAnyElementsOf(dbPairs);
        assertThat(rels).filteredOn(r -> "DB".equals(r.state())).allMatch(r -> r.candidateRank() == null);
    }
}
```

- [ ] **Step 10: 회귀 시험 실행**

Run: `cd src/backend/mdm && DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdInferRegressionTest' --tests '*ErdDbMetaReaderTest'`
Expected: PASS. 시험 보고서의 표준 출력에 `표 짝 예측 70, 정답 51, 맞음 40, 정밀도 0.5714, 재현율 0.7843` 이 찍힌다.

수치가 다르면 문턱을 고치지 말고 아래 순서로 원인을 찾는다.
1. 예측 수가 70 이 아니면 변형 x 규칙과 비교한다. 부모가 P 제약 표뿐인지, 단일 PK 에서 `ID`·감사 10개를 뺐는지, 복합 PK 에서 감사 칼럼을 빼지 않았는지, 자기 자신을 뺐는지 확인한다.
2. 정답이 53·51 이 아니면 V1 거르기(`ErdV1Meta.restrict`)와 Task 2 의 R 조인을 확인한다.
3. 출력의 오탐·놓침 목록을 연구 문서 J 2절의 FP·FN 원인(형제 표 PK 이름, 버전 표 이중 부모, 이름이 다른 참조, UNIQUE 부모)과 맞춰 본다.

- [ ] **Step 11: 커밋**

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -m "feat(mdm): ERD 관계 추정기와 칼럼명 규칙 회귀 시험" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LwjQ9j9MkMEgwDJGD4Ut4r"
```

---

## 계획 작성자 메모

- README 의 "모르는 kind 는 일반 오류 `INVALID_ARGUMENT`" 는 실제 코드에서 `MdmErrors.invalid` → `MdmErrorCode.INVALID_INPUT`(MDM021)이다. Task 1 시험은 MDM021 로 단언한다.
- erdEdit 권한은 dmb 매트릭스라 READ 만 가진 역할이 아직 없다. RBAC 도 MDM 서버가 아니라 포털이 본다. 그래서 Task 1 은 경로만 고치고, 읽기 전용 사용자로 끝까지 확인하는 일은 메뉴 시드(Task 9)·Task 12 몫이다.
- Review Focus 1 의 시험 이름 `importBuildsCompositeUniqueAndSelfReference` 는 README 가 Task 3 에 붙였지만 내용(표·키 들어옴, 무결성 검사)은 가져오기(Task 4) 몫이다. Task 3 에는 같은 이름으로 추정기 몫(DB 관계·UNIQUE 부모·자기 참조·PK 없는 표)만 넣었다. Task 4 에도 같은 이름의 시험이 있어야 한다.
- `ErdDbMetaReader` 는 부모가 다른 스키마인 FK(`R_OWNER <> OWNER`)를 읽지 않고 버린다(모듈 사이 FK 없음, ADR-0003). 가져오기·DB 차이에도 나오지 않는다.
- `ErdDbMetaReader` 는 PK·UK 를 받치는 인덱스와 함수 기반 인덱스를 `indexes` 에서 뺀다. Task 4 는 `indexes` 를 그대로 `IX` 키로 만들면 된다.
- `ErdDbMeta.Column` 에는 바이트·문자 길이 구분(`CHAR_USED`)이 없다. `VARCHAR2(4000 BYTE)` 와 `VARCHAR2(4000 CHAR)` 가 같은 length 4000 이 된다. 이 구분이 필요하면 README 인터페이스를 고쳐야 한다.
- `ErdRelation.candidateRank` 는 `@JsonInclude(NON_NULL)` 이라 null 이면 JSON 에 필드가 없다(README 의 "기본 null" 과 같은 뜻이지만, 화면 타입은 `candidateRank?: number | null` 로 받아야 한다).
- `restore` upsert 는 요소 JSON 의 모든 필드에 `_rev` 를 찍는다(`ErdCommandEngine` 엔진 코드). 그래서 가져오기 뒤에는 `_rev.candidateRank` 도 생긴다. README 의 "`_rev` 대상 속성이 아니다" 는 명령 충돌 판정에 쓰지 않는다는 뜻으로만 맞다.
- 허브 순위 규칙은 이 문서에서 정했다. 묶음에 DB 관계가 있으면 DB 는 null, 추정 후보는 2 부터 받는다. 화면(Task 8·9)과 `getModelText`(Task 11)는 "null·1 은 그리고 2 이상은 접는다" 로 읽어야 한다.
- 회귀 문턱(0.57·0.78)은 연구 실측(40/70, 40/51)과 여유가 없다. 실측은 2026-10-09 L_MAIN 덤프를 연구 스크립트(methodA.mjs 변형 x)로 다시 돌려 확인했다. 그 스크립트는 리포에 없고 사라질 수 있는 세션 임시 폴더에만 있다.
- `ErdHintsLoaderTest` 와 시험 근거 파일 3개는 README 파일 구조 표에 없는 새 파일이다(로더 시험용).
- Task 3 은 약 870줄로 권장 상한(700줄)을 넘는다. 대부분이 실제 코드(추정기·시험 2개·로더)라 줄이지 않았다.
