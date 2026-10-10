# ERD 도구 단계 0 — Task 10~12: OASIS 서비스·실시간 채널·마감

> 공통 제약(Global Constraints)·스펙과 다르게 정한 점(P1~P10)·Review Focus·파일 구조는 [README](README.md) 에 있다. 이 문서의 모든 Task 는 README 의 Global Constraints 를 따른다.
> 이전: [05-command-service.md](05-command-service.md) · [README](README.md)

### Task 10: OASIS `erdEdit` 서비스·BPMN·권한 시드

**Files:**
- Create: `src/backend/mdm/api/src/main/resources/services/dma/erdEdit.bpmn`
- Create: `.../dma/erdEdit/service/ErdEditService.java` (`@Service("erdEditService")`)
- Create: `.../dma/erdEdit/dto/ErdEditRequest.java`, `ErdModelView.java`
- Create: `.../dma/erdEdit/stream/ErdPresence.java` (`ErdModelView` 가 쓰므로 Task 11 에서 이 Task 로 당겼다)
- Modify: `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/seed/MdmMenuSeeder.java` (OBJ·RBAC 만, 메뉴 leaf 는 단계 1)
- Modify: `MdmOasisActionVocabularyTest` 가 요구하는 목록(실패 메시지를 보고 맞춘다)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/ErdEditOasisHttpTest.java`

**Interfaces:**
- Consumes: Task 8·9 서비스.
- Produces: `POST /api/mdm/oasis/erdEdit/{action}`.

| 액션 | Java 메서드 | params | 응답(`data.result`) |
|---|---|---|---|
| search | `search(ErdEditRequest)` | — | `[{modelId, moduleId, schemaName, modelName, rev, draftVer, ownerId}]` (grids.result) |
| view | `view(ErdEditRequest)` | `modelId`, `sinceRev?`, `ver?` | `sinceRev` 없으면 `ErdModelView{modelId, rev, ver, status, ownerId, editors, rowVersion, model(JSON 문자열), diagrams, nodes, presence}`. 있으면 `ErdChangesView` |
| compare | `compare(ErdEditRequest)` | `logical` 또는 `phys` | `{physName, tokens, recommendedDomainId, status}` |
| validate | `validate(ErdEditRequest)` | `modelId` | `ConfirmCheckResult` |
| reg | `reg(ErdEditRequest)` | `modelId, moduleId, schemaName, modelName` | `{modelId}` |
| save | `save(ErdEditRequest)` | `modelId, baseRev, session, source, commandsJson` | `ErdApplyResult` 를 Map 으로 바꾼 것 |
| restore | `restore(ErdEditRequest)` | `modelId, rev, session, source` | `ErdApplyResult` 를 Map 으로 바꾼 것 |
| execute | `execute(ErdEditRequest)` | `modelId, kind(ADD_EDITOR·REMOVE_EDITOR·SET_VIEW·CLAIM·RELEASE), userId?, session?, viewJson?, tableId?` | `{ok:true}` (SET_VIEW·CLAIM·RELEASE 는 Task 11 이 채운다. 이 Task 에서는 ADD/REMOVE_EDITOR 만) |
| copy | `copy(ErdEditRequest)` | `modelId, verKind` | `{ver}` |
| delete | `delete(ErdEditRequest)` | `modelId, ver, rowVersion` | `{ok:true}` (`VersionStateService.deleteDraft`) |
| lock / unlock / handover | 같은 이름 | `modelId, ver, rowVersion, newOwnerId?` | `{rowVersion}` (`DraftOwnershipService`) |
| confirm | `confirm(ErdEditRequest)` | `modelId, ver, rowVersion, applyFrom, warningsAcknowledged` | `{ok:true}` (`VersionStateService.confirm`) |

`commandsJson` 은 명령 배열 JSON 문자열이다(OASIS params 는 배열을 못 담는다). `userId` 는 요청 params 가 아니라 `MdmCurrentUser.userId()` 로 얻는다.

- [ ] **Step 1: 실패하는 시험 작성**

`DmeOasisHttpTest` 의 헤더·호출 도우미를 그대로 따른다(`api/src/test/java/.../dme/DmeOasisHttpTest.java` 와 `DmeTestSupport.java` 를 열어 `TEST_CLIENT_KEY` 와 POST 도우미를 복사한다).

```java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.*;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdEditOasisHttpTest.KEY)
@ActiveProfiles("local")
class ErdEditOasisHttpTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-test-key";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    final ObjectMapper om = new ObjectMapper();
    final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void clean() {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
    }

    JsonNode call(String action, String user, Map<String, Object> params) throws Exception {
        String body = om.writeValueAsString(Map.of("meta", Map.of("menuId", "erdEdit"), "params", params));
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/erdEdit/" + action))
                .header("Content-Type", "application/json").header("X-Client-Key", KEY)
                .header("X-Authenticated-User", user).header("X-Authenticated-Role", "MDM_STEWARD")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return om.readTree(http.send(req, HttpResponse.BodyHandlers.ofString()).body());
    }

    @Test
    void regSaveViewAndChanges() throws Exception {
        assertThat(call("reg", "owner", Map.of("modelId", "mcm", "moduleId", "mcm", "schemaName", "MCMAPUSER", "modelName", "MCM"))
                .at("/meta/success").asBoolean()).isTrue();
        JsonNode saved = call("save", "owner", Map.of("modelId", "mcm", "baseRev", 0, "session", "ui-owner", "source", "UI",
                "commandsJson", "[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        assertThat(saved.at("/data/result/applied").asBoolean()).isTrue();
        assertThat(saved.at("/data/result/changes/0/value/phys").asText()).isEqualTo("TB_A"); // JsonNode 가 Jackson 3 응답에서도 객체로 나온다
        JsonNode view = call("view", "viewer", Map.of("modelId", "mcm"));
        assertThat(view.at("/data/result/rev").asLong()).isEqualTo(1);
        assertThat(view.at("/data/result/model").asText()).contains("TB_A");
        JsonNode changes = call("view", "viewer", Map.of("modelId", "mcm", "sinceRev", 0));
        assertThat(changes.at("/data/result/deltas/0/changes/0/id").asText()).isEqualTo("t-1");
    }

    @Test
    void rejectionIsSuccessResponseWithRejection() throws Exception {
        call("reg", "owner", Map.of("modelId", "mcm", "moduleId", "mcm", "schemaName", "MCMAPUSER", "modelName", "MCM"));
        JsonNode r = call("save", "stranger", Map.of("modelId", "mcm", "baseRev", 0, "session", "x", "source", "MCP",
                "commandsJson", "[{\"op\":\"addTable\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        assertThat(r.at("/meta/success").asBoolean()).isTrue();
        assertThat(r.at("/data/result/rejection/code").asText()).isEqualTo("NOT_EDITOR");
    }

    @Test
    void compareGivesPhysPreview() throws Exception {
        JsonNode r = call("compare", "owner", Map.of("logical", "역할아이디"));
        assertThat(r.at("/meta/success").asBoolean()).isTrue();
        assertThat(r.at("/data/result").has("tokens")).isTrue();
    }
}
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `… heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdEditOasisHttpTest'`
Expected: FAIL(서비스 없음).

- [ ] **Step 3: BPMN 작성**

`services/dma/unitMng.bpmn` 을 복사해 `erdEdit.bpmn` 을 만들고 아래만 바꾼다. 구조 변경은 `bpmn-skill`(bpmn-tool CLI)로 하고, 끝나면 `oasis-contract-check` 를 돌린다.
- process id `erdEdit`.
- `actionGateway` 의 나가는 흐름을 표의 액션 15개(`search, view, compare, validate, reg, save, restore, execute, copy, delete, lock, unlock, handover, confirm, import` 중 `import` 를 뺀 14개)로 만든다. `import` 는 단계 1 에서 더한다.
- 각 serviceTask: `camunda:class="erdEditService"`, `method` = 표의 메서드 이름, `output` = `result`, `dto` = `com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdEditRequest`.

```bash
node .claude/skills/oasis-contract-check/scripts/check_oasis_contract.mjs --root .
```
Expected: ERROR 0.

- [ ] **Step 4: `ErdEditRequest`·`ErdModelView`·`ErdPresence`·`ErdEditService` 작성**

`ErdEditRequest` 는 표의 params 를 모두 담는다. `UnitSearchRequest` 처럼 필드 + 한 줄 getter/setter 로 쓴다. `ver` 는 `VersionRules.requireVer(String)` 에 넘기므로 문자열이고, `applyFrom` 은 `RuleConfirmService.parseApplyFrom(String)` 형식(`yyyy-MM-dd HH:mm:ss`) 문자열이다.

```java
// dto/ErdEditRequest.java
package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

/** {@code erdEdit} 모든 액션의 요청(계획 Task 10 표). 액션마다 쓰는 칸만 채워 온다. */
public class ErdEditRequest {

    private String modelId;
    private String moduleId;
    private String schemaName;
    private String modelName;
    private String ver;
    private Long rowVersion;
    private Long baseRev;
    private Long sinceRev;
    private Long rev;
    private String session;
    private String source;
    /** 명령 배열 JSON 문자열 — OASIS params 는 배열을 담지 못한다. */
    private String commandsJson;
    private String logical;
    private String phys;
    /** execute 종류: ADD_EDITOR·REMOVE_EDITOR·SET_VIEW·CLAIM·RELEASE. */
    private String kind;
    private String userId;
    private String viewJson;
    private String tableId;
    private String verKind;
    private String newOwnerId;
    private String applyFrom;
    private Boolean warningsAcknowledged;

    public String getModelId() { return modelId; }
    public String getModuleId() { return moduleId; }
    public String getSchemaName() { return schemaName; }
    public String getModelName() { return modelName; }
    public String getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public Long getBaseRev() { return baseRev; }
    public Long getSinceRev() { return sinceRev; }
    public Long getRev() { return rev; }
    public String getSession() { return session; }
    public String getSource() { return source; }
    public String getCommandsJson() { return commandsJson; }
    public String getLogical() { return logical; }
    public String getPhys() { return phys; }
    public String getKind() { return kind; }
    public String getUserId() { return userId; }
    public String getViewJson() { return viewJson; }
    public String getTableId() { return tableId; }
    public String getVerKind() { return verKind; }
    public String getNewOwnerId() { return newOwnerId; }
    public String getApplyFrom() { return applyFrom; }
    public Boolean getWarningsAcknowledged() { return warningsAcknowledged; }

    public void setModelId(String v) { this.modelId = v; }
    public void setModuleId(String v) { this.moduleId = v; }
    public void setSchemaName(String v) { this.schemaName = v; }
    public void setModelName(String v) { this.modelName = v; }
    public void setVer(String v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setBaseRev(Long v) { this.baseRev = v; }
    public void setSinceRev(Long v) { this.sinceRev = v; }
    public void setRev(Long v) { this.rev = v; }
    public void setSession(String v) { this.session = v; }
    public void setSource(String v) { this.source = v; }
    public void setCommandsJson(String v) { this.commandsJson = v; }
    public void setLogical(String v) { this.logical = v; }
    public void setPhys(String v) { this.phys = v; }
    public void setKind(String v) { this.kind = v; }
    public void setUserId(String v) { this.userId = v; }
    public void setViewJson(String v) { this.viewJson = v; }
    public void setTableId(String v) { this.tableId = v; }
    public void setVerKind(String v) { this.verKind = v; }
    public void setNewOwnerId(String v) { this.newOwnerId = v; }
    public void setApplyFrom(String v) { this.applyFrom = v; }
    public void setWarningsAcknowledged(Boolean v) { this.warningsAcknowledged = v; }
}

// dto/ErdModelView.java
package com.dongkuk.dmes.mdm.dma.erdEdit.dto;

import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdPresence;
import java.util.List;
import java.util.Map;

/** view 응답. model 은 MODEL_JSON 문자열 그대로다(큰 중첩 맵을 OASIS 가 다시 직렬화하지 않도록). */
public record ErdModelView(String modelId, long rev, String ver, String status, String ownerId, List<String> editors,
                           long rowVersion, String model, List<Map<String, Object>> diagrams,
                           List<Map<String, Object>> nodes, List<ErdPresence> presence) {
}

// stream/ErdPresence.java
package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import java.util.List;

/**
 * 접속자 한 세션의 화면 상태(스펙 D16·D18). getCurrentView(MCP, 단계 1)가 이 값을 읽는다.
 * at 은 ISO-8601 문자열이다 — SSE 는 Jackson 2(ErdModelCodec, java.time 모듈 없음), OASIS 응답은 Jackson 3 으로 나가므로 둘 다 그대로 쓰는 형식으로 둔다.
 */
public record ErdPresence(String session, String userId, String source, String diagramId, List<String> selectedTables,
                          String at) {
}
```

`ErdEditService` 는 판정을 하지 않는다. 입력을 읽어 Task 8·9 서비스와 공통 버전 서비스에 넘긴다. 호출 형태는 `RuleSetVersionService` 의 `deleteDraft`·`lock`·`unlock`·`handover`(130~166행)와 `RuleSetConfirmService.confirm`(192~215행)을 따랐다.

```java
// service/ErdEditService.java
package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.common.version.VersionRules;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCommand;
import com.dongkuk.dmes.mdm.contract.version.DraftOwnershipService;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdEditRequest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdModelView;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdTable;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdColumnStatus;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionary;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionaryLoader;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdStandardJudge;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdDomainSpec;
import com.dongkuk.dmes.mdm.dma.naming.NameComposition;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.service.RuleConfirmService;
import com.dongkuk.dmes.mdm.entity.MdmErdModelVer;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** OASIS {@code erdEdit} 서비스(계획 Task 10 표). 판정은 Task 8·9 서비스와 공통 버전 서비스가 하고, 여기서는 입력을 읽어 넘긴다. */
@Service("erdEditService")
public class ErdEditService {

    private static final Set<String> SOURCES = Set.of("UI", "MCP", "CLI");

    private final ErdModelStore store;
    private final ErdVersionService versions;
    private final ErdCommandService commands;
    private final ErdConfirmCheck confirmCheck;
    private final ErdDictionaryLoader dictionaries;
    private final VersionStateService stateService;
    private final DraftOwnershipService ownership;
    private final MdmCurrentUser currentUser;
    private final JdbcTemplate jdbc;

    public ErdEditService(ErdModelStore store, ErdVersionService versions, ErdCommandService commands,
                          ErdConfirmCheck confirmCheck, ErdDictionaryLoader dictionaries, VersionStateService stateService,
                          DraftOwnershipService ownership, MdmCurrentUser currentUser, JdbcTemplate jdbc) {
        this.store = store;
        this.versions = versions;
        this.commands = commands;
        this.confirmCheck = confirmCheck;
        this.dictionaries = dictionaries;
        this.stateService = stateService;
        this.ownership = ownership;
        this.currentUser = currentUser;
        this.jdbc = jdbc;
    }

    /** 모델 목록 — 모델마다 DRAFT 가 있으면 그 번호와 소유자를 붙인다. */
    public List<Map<String, Object>> search(ErdEditRequest r) {
        return jdbc.query("""
                SELECT M.ERD_MODEL_ID
                     , M.MODULE_ID
                     , M.SCHEMA_NAME
                     , M.MODEL_NAME
                     , M.REV
                     , D.VER
                     , D.OWNER_ID
                  FROM TB_MDM_ERD_MODEL M
                     , TB_MDM_ERD_MODEL_VER D
                 WHERE D.ERD_MODEL_ID(+) = M.ERD_MODEL_ID
                   AND D.STATUS(+) = 'DRAFT'
                 ORDER BY M.ERD_MODEL_ID
                """, (rs, i) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("modelId", rs.getString("ERD_MODEL_ID"));
            row.put("moduleId", rs.getString("MODULE_ID"));
            row.put("schemaName", rs.getString("SCHEMA_NAME"));
            row.put("modelName", rs.getString("MODEL_NAME"));
            row.put("rev", rs.getLong("REV"));
            BigDecimal draftVer = rs.getBigDecimal("VER");
            row.put("draftVer", draftVer == null ? null : VersionNumbers.plain(draftVer));
            row.put("ownerId", rs.getString("OWNER_ID"));
            return row;
        });
    }

    /**
     * sinceRev 가 있으면 그 뒤 델타(ErdChangesView 를 plain 으로), 없으면 모델 전체(ErdModelView).
     * rev 를 MODEL_JSON 보다 먼저 읽는다 — 사이에 명령이 끼면 화면이 같은 델타를 한 번 더 받을 뿐 빠지지는 않는다(델타는 upsert·delete 라 두 번 적용해도 같다).
     */
    public Object view(ErdEditRequest r) {
        String modelId = requireModelId(r);
        if (r.getSinceRev() != null) return plain(commands.changesSince(modelId, r.getSinceRev()));
        long rev = store.rev(modelId);
        MdmErdModelVer v = r.getVer() == null ? store.current(modelId)
                : store.find(ref(modelId, r.getVer())).orElseThrow(() -> MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND));
        List<String> editors = jdbc.queryForList(
                "SELECT USER_ID FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID = ? AND VER = ? ORDER BY USER_ID",
                String.class, modelId, v.getVer());
        List<Map<String, Object>> diagrams = jdbc.query("""
                SELECT DIAGRAM_ID
                     , AREA_NAME
                     , DIAGRAM_NAME
                     , SORT_SEQ
                  FROM TB_MDM_ERD_DIAGRAM
                 WHERE ERD_MODEL_ID = ?
                 ORDER BY SORT_SEQ, DIAGRAM_ID
                """, (rs, i) -> {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("id", rs.getString("DIAGRAM_ID"));
            d.put("areaName", rs.getString("AREA_NAME"));
            d.put("diagramName", rs.getString("DIAGRAM_NAME"));
            d.put("sortSeq", rs.getInt("SORT_SEQ"));
            return d;
        }, modelId);
        List<Map<String, Object>> nodes = jdbc.query("""
                SELECT N.DIAGRAM_ID
                     , N.TABLE_UUID
                     , N.POS_X
                     , N.POS_Y
                     , N.FOLD_MODE
                  FROM TB_MDM_ERD_DIAGRAM_NODE N
                     , TB_MDM_ERD_DIAGRAM D
                 WHERE D.DIAGRAM_ID = N.DIAGRAM_ID
                   AND D.ERD_MODEL_ID = ?
                """, (rs, i) -> {
            Map<String, Object> n = new LinkedHashMap<>();
            n.put("diagram", rs.getString("DIAGRAM_ID"));
            n.put("table", rs.getString("TABLE_UUID"));
            n.put("x", rs.getInt("POS_X"));
            n.put("y", rs.getInt("POS_Y"));
            n.put("foldMode", rs.getString("FOLD_MODE"));
            return n;
        }, modelId);
        return new ErdModelView(modelId, rev, VersionNumbers.plain(v.getVer()), v.getStatus(), v.getOwnerId(), editors,
                v.getRowVersion(), v.getModelJson(), diagrams, nodes, List.of()); // presence 는 Task 11 이 채운다
    }

    /** 논리명 → 물리명(또는 반대) 미리보기. 사전은 이 요청에서 한 번만 읽는다(계획 P3). */
    public Map<String, Object> compare(ErdEditRequest r) {
        ErdDictionary d = dictionaries.load();
        NameComposition nc;
        if (notBlank(r.getLogical())) nc = d.forward(r.getLogical().trim()).orElseThrow();
        else if (notBlank(r.getPhys())) nc = d.reverse(r.getPhys().trim().toUpperCase(Locale.ROOT));
        else throw MdmErrors.invalid("logical 또는 phys 를 입력하세요");
        Optional<ErdDomainSpec> dom = nc.placeholder() ? Optional.empty() : d.recommendDomain(nc.physName());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("physName", nc.physName());
        out.put("logicalName", nc.logicalName());
        out.put("tokens", nc.tokens());
        out.put("recommendedDomainId", dom.map(ErdDomainSpec::domainId).orElse(null));
        out.put("status", nc.placeholder() ? ErdColumnStatus.MISS.name() : previewStatus(d, nc.physName(), dom).name());
        return out;
    }

    /** 컬럼 하나짜리 임시 모델로 표준 판정을 부른다. 타입은 추천 도메인 것을 쓴다(아직 타입을 고르지 않은 입력이므로). */
    private static ErdColumnStatus previewStatus(ErdDictionary d, String phys, Optional<ErdDomainSpec> dom) {
        ErdModel m = ErdModel.empty("preview", "preview");
        ErdTable t = new ErdTable();
        t.phys = "TB_PREVIEW";
        m.tables.put("t-preview", t);
        ErdColumn c = new ErdColumn();
        c.table = "t-preview";
        c.phys = phys;
        dom.ifPresent(x -> {
            c.domainId = x.domainId();
            c.dataType = x.dataType();
            c.length = x.length();
            c.scale = x.scale();
        });
        m.columns.put("c-preview", c);
        t.columnOrder.add("c-preview");
        return ErdStandardJudge.judge(m, d).get("c-preview");
    }

    /** 확정 전 검사 — 확정 때와 같은 SPI 를 미리 부른다(D19). */
    public ConfirmCheckResult validate(ErdEditRequest r) {
        String modelId = requireModelId(r);
        MdmErdModelVer draft = store.draft(modelId).orElseThrow(() -> MdmErrors.of(MdmErrorCode.NOT_DRAFT));
        VersionRef ref = new VersionRef(VersionTarget.ERD_MODEL, modelId, draft.getVer());
        return confirmCheck.check(new ConfirmCheckRequest(ref, null, null, currentUser.userId(), LocalDateTime.now()));
    }

    public Map<String, Object> reg(ErdEditRequest r) {
        String modelId = requireModelId(r);
        if (!notBlank(r.getModuleId()) || !notBlank(r.getSchemaName()) || !notBlank(r.getModelName())) {
            throw MdmErrors.invalid("moduleId·schemaName·modelName 은 필수입니다");
        }
        versions.createModel(modelId, r.getModuleId().trim(), r.getSchemaName().trim().toUpperCase(Locale.ROOT),
                r.getModelName().trim(), currentUser.userId());
        return Map.of("modelId", modelId);
    }

    /** 명령 묶음 적용. 거절도 성공 응답(meta.success=true)에 rejection 을 담아 돌려준다(스펙 4.5). */
    public Map<String, Object> save(ErdEditRequest r) {
        String modelId = requireModelId(r);
        if (r.getBaseRev() == null) throw MdmErrors.invalid("baseRev 는 필수입니다");
        String me = currentUser.userId();
        List<JsonNode> list = new ArrayList<>();
        try {
            JsonNode arr = ErdModelCodec.MAPPER.readTree(r.getCommandsJson() == null ? "" : r.getCommandsJson());
            if (arr == null || !arr.isArray()) throw MdmErrors.invalid("commandsJson 은 명령 배열 JSON 이어야 합니다");
            arr.forEach(list::add);
        } catch (JsonProcessingException e) {
            throw MdmErrors.invalid("commandsJson 을 읽을 수 없습니다: " + e.getOriginalMessage());
        }
        return plain(commands.apply(modelId, r.getBaseRev(), me, session(r, me), source(r), list));
    }

    /** 변경 기록에서 고른 명령 하나를 역명령으로 되돌린다(D14). */
    public Map<String, Object> restore(ErdEditRequest r) {
        String modelId = requireModelId(r);
        if (r.getRev() == null) throw MdmErrors.invalid("rev 는 필수입니다");
        String me = currentUser.userId();
        return plain(commands.undo(modelId, r.getRev(), me, session(r, me), source(r)));
    }

    /** 공동 편집자 관리. SET_VIEW·CLAIM·RELEASE 는 Task 11 에서 더한다. */
    public Map<String, Object> execute(ErdEditRequest r) {
        String modelId = requireModelId(r);
        String me = currentUser.userId();
        String kind = r.getKind() == null ? "" : r.getKind().trim().toUpperCase(Locale.ROOT);
        switch (kind) {
            case "ADD_EDITOR" -> versions.addEditor(modelId, requireText(r.getUserId(), "userId"), me);
            case "REMOVE_EDITOR" -> versions.removeEditor(modelId, requireText(r.getUserId(), "userId"), me);
            default -> throw MdmErrors.invalid("지원하지 않는 kind 입니다: " + r.getKind());
        }
        return Map.of("ok", true);
    }

    /** 새 버전(DRAFT) — 직전 RELEASED 를 복사한다. verKind 는 MAJOR·MINOR. */
    public Map<String, Object> copy(ErdEditRequest r) {
        BigDecimal next = versions.newVersion(requireModelId(r), requireText(r.getVerKind(), "verKind"), currentUser.userId());
        return Map.of("ver", VersionNumbers.plain(next));
    }

    /** DRAFT 삭제 — 소유자·상태·row_version·삭제 SPI(ErdDraftDeletion)는 공통 서비스가 본다. */
    public Map<String, Object> delete(ErdEditRequest r) {
        stateService.deleteDraft(ref(requireModelId(r), r.getVer()), rowVersion(r), currentUser.userId());
        return Map.of("ok", true);
    }

    public Map<String, Object> lock(ErdEditRequest r) {
        return Map.of("rowVersion", ownership.acquire(ref(requireModelId(r), r.getVer()), rowVersion(r), currentUser.userId()));
    }

    public Map<String, Object> unlock(ErdEditRequest r) {
        return Map.of("rowVersion", ownership.release(ref(requireModelId(r), r.getVer()), rowVersion(r), currentUser.userId()));
    }

    public Map<String, Object> handover(ErdEditRequest r) {
        return Map.of("rowVersion", ownership.handover(ref(requireModelId(r), r.getVer()), rowVersion(r), currentUser.userId(),
                requireText(r.getNewOwnerId(), "newOwnerId")));
    }

    /** 소유자 직접 확정(계획 P8). 확정 검사는 공통 서비스가 ErdConfirmCheck 를 부른다. */
    public Map<String, Object> confirm(ErdEditRequest r) {
        VersionRef ref = ref(requireModelId(r), r.getVer());
        LocalDateTime applyFrom = RuleConfirmService.parseApplyFrom(r.getApplyFrom());
        stateService.confirm(new ConfirmCommand(ref, rowVersion(r), applyFrom, currentUser.userId(),
                Boolean.TRUE.equals(r.getWarningsAcknowledged())));
        return Map.of("ok", true);
    }

    /**
     * Jackson 2 {@code JsonNode}(ErdChange.value, ErdRejection.current·choices)를 일반 Map·List 로 바꾼다.
     * Spring Boot 4 의 HTTP JSON 은 Jackson 3 이라 Jackson 2 노드를 그대로 넘기면 제대로 직렬화되지 않는다(MdmJsonLists 주석).
     */
    private static Map<String, Object> plain(Object result) {
        return ErdModelCodec.MAPPER.convertValue(result, new TypeReference<LinkedHashMap<String, Object>>() { });
    }

    private static VersionRef ref(String modelId, String ver) {
        return new VersionRef(VersionTarget.ERD_MODEL, modelId, VersionNumbers.scaled(VersionRules.requireVer(ver)));
    }

    private static long rowVersion(ErdEditRequest r) {
        if (r.getRowVersion() == null) throw MdmErrors.invalid("rowVersion 은 필수입니다");
        return r.getRowVersion();
    }

    private static String requireModelId(ErdEditRequest r) {
        return requireText(r.getModelId(), "modelId");
    }

    private static String requireText(String v, String name) {
        if (!notBlank(v)) throw MdmErrors.invalid(name + " 은 필수입니다");
        return v.trim();
    }

    private static String session(ErdEditRequest r, String me) {
        return notBlank(r.getSession()) ? r.getSession().trim() : "ui-" + me;
    }

    private static String source(ErdEditRequest r) {
        String s = notBlank(r.getSource()) ? r.getSource().trim().toUpperCase(Locale.ROOT) : "UI";
        if (!SOURCES.contains(s)) throw MdmErrors.invalid("source 는 UI·MCP·CLI 중 하나입니다: " + r.getSource());
        return s;
    }

    private static boolean notBlank(String v) {
        return v != null && !v.isBlank();
    }
}
```

확인할 점:
- `ErdDomainSpec` 은 Task 4 의 `engine` 패키지에 있다. `MdmErrorCode.NOT_DRAFT`(MDM002)·`INVALID_INPUT`(MDM021)은 이미 있는 상수다.
- `RuleConfirmService.parseApplyFrom` 은 `dme` 패키지의 `public static` 메서드다. 적용 일시 형식 규칙을 한 곳에 두려고 복사하지 않고 그대로 부른다.
- `search` 응답은 OASIS 가 `data.result` 목록으로 감싼다. 화면은 단계 1 에서 그리드에 넣는다.

- [ ] **Step 5: 권한 시드(OBJ·RBAC)**

`MdmMenuSeeder` 에 메서드를 더하고 `seedMdmMenus()` 끝에서 부른다. 메뉴 leaf(`insertMcmSecMenuIfAbsent`)는 화면이 생기는 단계 1 에서 더한다. 인자는 같은 파일의 columnMng 블록(118~131행)과 같고 objectId 만 다르다.
```java
    /** ERD 설계(erdEdit) — 단계 0 은 OBJECT·권한만. 메뉴 leaf 는 화면과 함께 단계 1 에서 넣는다. */
    private void seedMdmErdObject() {
        String objectId = "erdEdit";
        insertMcmSecObjIfAbsent(objectId, "ERD 설계", "mdm");
        insertIfAbsentComposite(
                "TB_MCM_SEC_ROLE_MAPPING",
                new String[]{"ROLE_ID",  "OBJECT_ID", "PERMISSION_ID"},
                new String[]{"SYSADMIN", objectId,    "PERM_ALL"},
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING (ROLE_ID, OBJECT_ID, PERMISSION_ID" + AUDIT_COLS + ") " +
                "VALUES ('SYSADMIN', '" + objectId + "', 'PERM_ALL'" + AUDIT_VALS + ")");
        seedMdmObjectRbac(objectId, "dma");
        log.info("[DataInitializer] ERD 설계(erdEdit) 시드 — OBJECT 1 + RBAC(SYSADMIN 1 + MDM 역할 4)");
    }
```
`seedMdmMenus()` 의 마지막 줄 다음에 `seedMdmErdObject();` 를 더한다. `MdmOasisActionVocabularyTest` 를 돌려 실패하면 메시지가 요구하는 목록(BPMN 액션 ↔ 시더)을 맞춘다.

- [ ] **Step 6: 시험 통과 확인**

Run: Step 2 명령. Expected: 3건 PASS.
Run: `… --tests '*MdmOasisActionVocabularyTest'`. Expected: PASS.
Run: `cd src/backend/mcm && ../gradlew :api:test --max-workers=2 --tests '*MdmMenuSeeder*'` (시더 시험이 있으면. 없으면 `../gradlew :api:compileJava`). Expected: PASS.

- [ ] **Step 7: 커밋**

```bash
/usr/bin/git add src/backend/mdm src/backend/mcm
/usr/bin/git commit -m "feat(mdm): erdEdit OASIS 서비스·BPMN 14액션·OBJ 권한 시드"
```

---

### Task 11: 실시간 채널(SSE)·접속자·작업 중 표시

**Files:**
- Modify: `.../dma/erdEdit/stream/ErdEventHub.java` (전체 교체)
- Create: `.../dma/erdEdit/stream/{ErdClaimView,ErdStreamController}.java` (`ErdPresence` 는 Task 10 에서 만들었다)
- Modify: `.../dma/erdEdit/service/ErdEditService.java` (`execute` 의 SET_VIEW·CLAIM·RELEASE, `view` 의 presence)
- Modify: `.../dma/erdEdit/service/ErdCommandService.java` (`apply` 끝에 `CLAIMED` 경고)
- Test: `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/ErdStreamTest.java`

**Interfaces:**
- Consumes: Task 9 `ErdDelta`, `ErdCommandService.changesSince`.
- Produces:
  - `GET {/erd,/mdm/erd,/api/mdm/erd}/stream/{modelId}?session=&sinceRev=` → `text/event-stream`. 사용자는 `X-Authenticated-User` 헤더(ClientKeyFilter 가 만든 인증)에서 읽는다.
  - 이벤트: `change`(ErdDelta JSON), `presence`(접속자 목록), `claim`(작업 중 표시 목록), `reload`(`{rev}`), `ping`(15초마다).
  - `record ErdPresence(String session, String userId, String source, String diagramId, List<String> selectedTables, String at)`(Task 10), `record ErdClaimView(String tableId, String session, String userId, String expiresAt)`. 시각은 ISO-8601 문자열이다(SSE 의 Jackson 2 매퍼에 java.time 모듈이 없다).
  - `ErdEventHub.subscribe(modelId, session, userId, source, sinceRev) : SseEmitter`, `updateView(modelId, session, diagramId, selectedTables) : boolean`(채널에 붙은 세션만), `presence(modelId) : List<ErdPresence>`, `claim(modelId, tableId, session, userId, ttlSeconds) : boolean`(다른 세션의 유효한 표시는 빼앗지 않음), `release(modelId, tableId, session)`, `claims(modelId) : List<ErdClaimView>`.
  - 연결이 시작되면 `sinceRev` 이후 델타를 먼저 순서대로 보내고, 그 뒤 실시간 델타를 보낸다. 사이에 새 델타가 끼어도 빠지거나 겹치지 않도록, 구독 등록 → 재생 → 재생보다 rev 가 작거나 같은 실시간 델타는 버림 순서로 한다.
  - 접속자는 연결이 끊기면 지운다(`SseEmitter` 의 onCompletion·onTimeout·onError, 그리고 15초마다 보내는 `ping` 의 보내기 실패). SSE 는 클라이언트가 응답하지 않으므로 "응답 없음" 은 보내기 실패로 판단한다.
  - 작업 중 표시는 `TB_MDM_ERD_CLAIM` 에 쓰고(MERGE), 만료가 지난 행은 읽을 때 무시한다. 기본 TTL 600초. 다른 세션이 작업 중인 표를 고치는 명령에는 `ErdCommandService.apply` 결과에 `CLAIMED` 경고를 더한다(이 Task 에서 `apply` 마지막에 `claims` 를 읽어 바뀐 표와 대조).

- [ ] **Step 1: 실패하는 시험 작성**

```java
package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdStreamTest.KEY)
@ActiveProfiles("local")
class ErdStreamTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-test-key";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ErdVersionService versions;
    @Autowired ErdCommandService commands;
    @Autowired ErdEventHub hub;
    final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void clean() {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
    }

    /** SSE 를 열고 data 줄을 큐로 모은다. "event:이름|data" 형식으로 넣는다. */
    BlockingQueue<String> open(String session, long sinceRev) {
        BlockingQueue<String> q = new LinkedBlockingQueue<>();
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/mdm/erd/stream/mcm?session=" + session + "&sinceRev=" + sinceRev))
                .header("X-Client-Key", KEY).header("X-Authenticated-User", "u-" + session)
                .header("X-Authenticated-Role", "MDM_STEWARD").header("Accept", "text/event-stream").GET().build();
        HttpClient.newHttpClient().sendAsync(req, HttpResponse.BodyHandlers.ofInputStream()).thenAccept(res -> {
            try (var br = new BufferedReader(new InputStreamReader(res.body()))) {
                String line, event = "message";
                while ((line = br.readLine()) != null) {
                    if (line.startsWith("event:")) event = line.substring(6).trim();
                    else if (line.startsWith("data:")) { q.add(event + "|" + line.substring(5).trim()); event = "message"; }
                }
            } catch (Exception ignored) {
            }
        });
        return q;
    }

    String next(BlockingQueue<String> q, String event) throws InterruptedException {
        long until = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < until) {
            String s = q.poll(500, TimeUnit.MILLISECONDS);
            if (s != null && s.startsWith(event + "|")) return s.substring(event.length() + 1);
        }
        throw new AssertionError(event + " 이벤트가 오지 않았습니다");
    }

    List<com.fasterxml.jackson.databind.JsonNode> cmd(String json) throws Exception {
        List<com.fasterxml.jackson.databind.JsonNode> out = new ArrayList<>();
        om.readTree(json).forEach(out::add);
        return out;
    }

    @Test
    void twoSubscribersReceiveSameDelta() throws Exception {
        var a = open("a", 0);
        var b = open("b", 0);
        next(a, "presence");
        next(b, "presence");
        commands.apply("mcm", 0, "owner", "ui-owner", "UI", cmd("[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"x\"}]"));
        assertThat(om.readTree(next(a, "change")).get("rev").asLong()).isEqualTo(1);
        assertThat(om.readTree(next(b, "change")).get("rev").asLong()).isEqualTo(1);
    }

    @Test
    void reconnectReplaysMissedDeltas() throws Exception {
        for (int i = 0; i < 3; i++) commands.apply("mcm", i, "owner", "ui", "UI", cmd("[{\"op\":\"addTable\",\"phys\":\"TB_A" + i + "\",\"logical\":\"x\"}]"));
        var q = open("late", 1);
        assertThat(om.readTree(next(q, "change")).get("rev").asLong()).isEqualTo(2);
        assertThat(om.readTree(next(q, "change")).get("rev").asLong()).isEqualTo(3);
    }

    @Test
    void reconnectTooFarSendsReload() throws Exception {
        jdbc.update("UPDATE TB_MDM_ERD_MODEL SET REV = 9999 WHERE ERD_MODEL_ID='mcm'");
        var q = open("late", 1);
        assertThat(om.readTree(next(q, "reload")).get("rev").asLong()).isEqualTo(9999);
    }

    @Test
    void presenceListsSessionsWithView() throws Exception {
        var a = open("a", 0);
        next(a, "presence");
        var b = open("claude-b", 0);
        String p = next(a, "presence");
        assertThat(p).contains("claude-b");
    }

    @Test
    void claimByOtherSessionWarnsButDoesNotBlock() throws Exception {
        commands.apply("mcm", 0, "owner", "ui-owner", "UI", cmd("[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"x\"}]"));
        assertThat(hub.claim("mcm", "t-1", "claude-b", "owner", 600)).isTrue();
        assertThat(hub.claim("mcm", "t-1", "ui-owner", "owner", 600)).isFalse(); // 유효한 표시는 빼앗지 않는다
        ErdApplyResult r = commands.apply("mcm", 1, "owner", "ui-owner", "UI",
                cmd("[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"comment\":\"c\"}}]"));
        assertThat(r.applied()).isTrue();
        assertThat(r.warnings()).extracting(ErdWarning::code).contains("CLAIMED");
        hub.release("mcm", "t-1", "claude-b");
        assertThat(hub.claims("mcm")).isEmpty();
    }
}
```

- [ ] **Step 2: 시험이 실패하는지 확인**

Run: `… heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests '*ErdStreamTest'`
Expected: FAIL(404).

- [ ] **Step 3: 구현**

```java
// stream/ErdStreamController.java
package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * ERD 실시간 채널 — MDM 의 첫 @RestController(계획 P10). OASIS 프록시는 응답을 모아서 보내므로 스트림을 넘기지 못한다.
 * 포털 경유: /api/mdm/rest/erdEdit/view/api/mdm/erd/stream/{modelId} (RBAC 키 mdm/erdEdit/view).
 */
@RestController
@RequestMapping({"/erd", "/mdm/erd", "/api/mdm/erd"})
public class ErdStreamController {

    private final ErdEventHub hub;
    private final MdmCurrentUser currentUser;

    public ErdStreamController(ErdEventHub hub, MdmCurrentUser currentUser) {
        this.hub = hub;
        this.currentUser = currentUser;
    }

    @GetMapping(path = "/stream/{modelId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@PathVariable String modelId, @RequestParam String session,
                             @RequestParam(defaultValue = "-1") long sinceRev,
                             @RequestParam(defaultValue = "UI") String source) {
        return hub.subscribe(modelId, session, currentUser.userId(), source, sinceRev);
    }
}
```

`ErdEventHub` 를 아래 전체 클래스로 바꾼다(Task 9 의 `publish`·`addListenerForTest` 는 그대로 남는다).

```java
// stream/ErdClaimView.java
package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

/** 작업 중 표시 한 건(스펙 D17). 권고용이라 다른 세션의 명령을 막지 않고 경고만 붙인다. expiresAt 은 ISO-8601 문자열(ErdPresence 와 같은 이유). */
public record ErdClaimView(String tableId, String session, String userId, String expiresAt) {
}

// stream/ErdEventHub.java
package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdChangesView;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdCommandService;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdModelStore;
import jakarta.annotation.PreDestroy;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 모델별 실시간 구독자 묶음(스펙 4.4·D16·D17). 서버 1대 가정(스펙 5절) — 구독·접속자는 메모리에, 작업 중 표시는 표에 둔다.
 * 델타는 rev 순서로 빠짐없이 보낸다: 구독 등록 → 재생 → 쌓인 실시간 델타, 그리고 중간이 빈 델타가 오면 명령 기록에서 채운다.
 */
@Component
public class ErdEventHub {

    private static final Logger log = LoggerFactory.getLogger(ErdEventHub.class);
    static final long PING_MS = 15_000;

    /** 구독 하나. 이 객체로 동기화한다 — SseEmitter 는 동시 send 를 허용하지 않는다. */
    static final class Sub {
        final String modelId;
        final String session;
        final SseEmitter emitter;
        long lastRev = -1;
        boolean replaying = true;
        final List<ErdDelta> pending = new ArrayList<>();
        volatile boolean dropped;

        Sub(String modelId, String session, SseEmitter emitter) {
            this.modelId = modelId;
            this.session = session;
            this.emitter = emitter;
        }
    }

    private final Map<String, List<Consumer<ErdDelta>>> listeners = new ConcurrentHashMap<>();
    private final Map<String, List<Sub>> subs = new ConcurrentHashMap<>();
    /** 키: modelId + "\u0000" + session. */
    private final Map<String, ErdPresence> presence = new ConcurrentHashMap<>();
    private final ObjectProvider<ErdCommandService> commandsProvider;
    private final ErdModelStore store;
    private final JdbcTemplate jdbc;
    private final ScheduledExecutorService pinger;

    /** ErdCommandService 는 이 허브를 받으므로 ObjectProvider 로 늦게 꺼낸다(순환 의존 회피). */
    public ErdEventHub(ObjectProvider<ErdCommandService> commandsProvider, ErdModelStore store, JdbcTemplate jdbc) {
        this.commandsProvider = commandsProvider;
        this.store = store;
        this.jdbc = jdbc;
        // MDM 앱에는 @EnableScheduling 이 없다 — 허브가 스레드 하나를 직접 둔다.
        this.pinger = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "erd-sse-ping");
            t.setDaemon(true);
            return t;
        });
        pinger.scheduleAtFixedRate(this::pingAll, PING_MS, PING_MS, TimeUnit.MILLISECONDS);
    }

    @PreDestroy
    void close() {
        pinger.shutdownNow();
        subs.values().forEach(list -> list.forEach(s -> s.emitter.complete()));
    }

    // ── 델타 ──────────────────────────────────────────────────────────

    public void publish(ErdDelta delta) {
        listeners.getOrDefault(delta.modelId(), List.of()).forEach(l -> l.accept(delta));
        for (Sub s : subs.getOrDefault(delta.modelId(), List.of())) {
            synchronized (s) {
                if (s.replaying) s.pending.add(delta);
                else deliver(s, delta);
            }
        }
    }

    /** 시험·내부 구독. 돌려준 Runnable 로 해지한다. */
    public Runnable addListenerForTest(String modelId, Consumer<ErdDelta> listener) {
        listeners.computeIfAbsent(modelId, k -> new CopyOnWriteArrayList<>()).add(listener);
        return () -> listeners.getOrDefault(modelId, List.of()).remove(listener);
    }

    /**
     * 구독. sinceRev ≥ 0 이면 그 뒤 델타를 먼저 재생하고, 500건을 넘으면 reload 하나만 보낸다.
     * 반환한 뒤에도 send 가 가능하다 — SseEmitter 는 핸들러 초기화 전 send 를 모아 두었다가 보낸다.
     */
    public SseEmitter subscribe(String modelId, String session, String userId, String source, long sinceRev) {
        long currentRev = store.rev(modelId); // 없는 모델이면 ERD_MODEL_NOT_FOUND
        SseEmitter emitter = new SseEmitter(0L); // 0 = 시간 제한 없음. 끊김은 ping 보내기 실패로 잡는다
        Sub sub = new Sub(modelId, session, emitter);
        subs.computeIfAbsent(modelId, k -> new CopyOnWriteArrayList<>()).add(sub); // 1. 먼저 등록(실시간 델타는 pending 에 쌓인다)
        Runnable drop = () -> drop(sub);
        emitter.onCompletion(drop);
        emitter.onTimeout(drop);
        emitter.onError(e -> drop.run());
        presence.put(key(modelId, session), new ErdPresence(session, userId, source, null, List.of(), Instant.now().toString()));
        synchronized (sub) {
            if (sinceRev >= 0) {                                                        // 2. 재생
                catchUp(sub, sinceRev);
            } else {
                sub.lastRev = currentRev;
            }
            sub.replaying = false;                                                      // 3. 쌓인 실시간 델타 중 lastRev 보다 큰 것만
            sub.pending.sort(Comparator.comparingLong(ErdDelta::rev));
            for (ErdDelta d : sub.pending) deliver(sub, d);
            sub.pending.clear();
        }
        broadcastPresence(modelId);
        send(sub, "claim", claims(modelId));
        return emitter;
    }

    /** rev 순서로 하나씩 보낸다. 중간이 비면(다른 트랜잭션의 afterCommit 이 늦게 온 경우) 명령 기록에서 채운다. 호출자가 sub 를 잡고 있다. */
    private void deliver(Sub s, ErdDelta d) {
        if (d.rev() <= s.lastRev) return;
        if (d.rev() > s.lastRev + 1) {
            catchUp(s, s.lastRev);
            if (d.rev() <= s.lastRev) return;
        }
        if (send(s, "change", d)) s.lastRev = d.rev();
    }

    /** 명령 기록에서 sinceRev 뒤를 읽어 보낸다. 500건을 넘으면 reload 만 보내고 lastRev 를 현재 rev 로 맞춘다. */
    private void catchUp(Sub s, long sinceRev) {
        ErdChangesView v = commandsProvider.getObject().changesSince(s.modelId, sinceRev);
        if (v.reload()) {
            if (send(s, "reload", Map.of("rev", v.rev()))) s.lastRev = v.rev();
            return;
        }
        s.lastRev = Math.max(s.lastRev, sinceRev);
        for (ErdDelta d : v.deltas()) {
            if (d.rev() <= s.lastRev) continue;
            if (!send(s, "change", d)) return;
            s.lastRev = d.rev();
        }
    }

    // ── 접속자 ────────────────────────────────────────────────────────

    public List<ErdPresence> presence(String modelId) {
        String prefix = modelId + "\u0000";
        return presence.entrySet().stream().filter(e -> e.getKey().startsWith(prefix)).map(Map.Entry::getValue)
                .sorted(Comparator.comparing(ErdPresence::session)).toList();
    }

    /** 화면 상태 갱신(SET_VIEW). 실시간 채널에 붙은 세션만 바꿀 수 있다 — 없으면 false. */
    public boolean updateView(String modelId, String session, String diagramId, List<String> selectedTables) {
        ErdPresence updated = presence.computeIfPresent(key(modelId, session),
                (k, p) -> new ErdPresence(p.session(), p.userId(), p.source(), diagramId, List.copyOf(selectedTables),
                        Instant.now().toString()));
        if (updated == null) return false;
        broadcastPresence(modelId);
        return true;
    }

    private void broadcastPresence(String modelId) {
        List<ErdPresence> list = presence(modelId);
        for (Sub s : subs.getOrDefault(modelId, List.of())) send(s, "presence", list);
    }

    /** 구독 해제. 여러 번 불려도 한 번만 처리한다(onCompletion·onError·보내기 실패가 겹친다). */
    private void drop(Sub sub) {
        sub.dropped = true;
        List<Sub> list = subs.getOrDefault(sub.modelId, List.of());
        if (!list.remove(sub)) return;
        // 같은 세션이 다시 붙어 있으면(재연결이 겹친 경우) 접속자 표시는 남긴다.
        if (list.stream().noneMatch(s -> s.session.equals(sub.session))) {
            presence.remove(key(sub.modelId, sub.session));
            broadcastPresence(sub.modelId);
        }
    }

    // ── 작업 중 표시(TB_MDM_ERD_CLAIM) ──────────────────────────────────

    /** 표 하나를 작업 중으로 표시한다. 다른 세션이 아직 만료되지 않은 표시를 갖고 있으면 빼앗지 않고 false. */
    public boolean claim(String modelId, String tableId, String session, String userId, long ttlSeconds) {
        Timestamp now = Timestamp.from(Instant.now());
        Timestamp until = Timestamp.from(Instant.now().plusSeconds(ttlSeconds));
        int n = jdbc.update("""
                MERGE INTO TB_MDM_ERD_CLAIM T
                USING (
                       SELECT ? AS ERD_MODEL_ID
                            , ? AS TABLE_UUID
                         FROM DUAL
                      ) S
                   ON (T.ERD_MODEL_ID = S.ERD_MODEL_ID AND T.TABLE_UUID = S.TABLE_UUID)
                 WHEN MATCHED THEN UPDATE
                         SET T.SESSION_NM = ?
                           , T.USER_ID    = ?
                           , T.EXPIRES_AT = ?
                           , T.U_USR_ID   = ?
                           , T.U_AT       = ?
                       WHERE T.SESSION_NM = ?
                          OR T.EXPIRES_AT <= ?
                 WHEN NOT MATCHED THEN INSERT
                       (ERD_MODEL_ID, TABLE_UUID, SESSION_NM, USER_ID, EXPIRES_AT, C_USR_ID, C_AT, U_USR_ID, U_AT, VER)
                       VALUES (S.ERD_MODEL_ID, S.TABLE_UUID, ?, ?, ?, ?, ?, ?, ?, 0)
                """, modelId, tableId, session, userId, until, userId, now, session, now,
                session, userId, until, userId, now, userId, now);
        if (n > 0) broadcastClaims(modelId);
        return n > 0;
    }

    public void release(String modelId, String tableId, String session) {
        int n = jdbc.update("DELETE FROM TB_MDM_ERD_CLAIM WHERE ERD_MODEL_ID = ? AND TABLE_UUID = ? AND SESSION_NM = ?",
                modelId, tableId, session);
        if (n > 0) broadcastClaims(modelId);
    }

    /** 만료가 지나지 않은 표시만. 시각 비교는 애플리케이션 시각으로 한다(쓰기와 같은 시계). */
    public List<ErdClaimView> claims(String modelId) {
        return jdbc.query("""
                SELECT TABLE_UUID
                     , SESSION_NM
                     , USER_ID
                     , EXPIRES_AT
                  FROM TB_MDM_ERD_CLAIM
                 WHERE ERD_MODEL_ID = ?
                   AND EXPIRES_AT > ?
                 ORDER BY TABLE_UUID
                """, (rs, i) -> new ErdClaimView(rs.getString(1), rs.getString(2), rs.getString(3), rs.getTimestamp(4).toInstant().toString()),
                modelId, Timestamp.from(Instant.now()));
    }

    private void broadcastClaims(String modelId) {
        List<ErdClaimView> list = claims(modelId);
        for (Sub s : subs.getOrDefault(modelId, List.of())) send(s, "claim", list);
    }

    // ── 보내기 ────────────────────────────────────────────────────────

    private void pingAll() {
        Map<String, Object> body = Map.of("at", Instant.now().toString());
        subs.values().forEach(list -> list.forEach(s -> send(s, "ping", body)));
    }

    /**
     * 이벤트 하나를 보낸다. 본문은 ErdModelCodec(Jackson 2)으로 만든 JSON 문자열이다 — Spring 의 Jackson 3 변환기를 거치지 않는다.
     * 직렬화 오류는 코드 결함이므로 그대로 던진다. 보내기(IO) 오류만 연결 끊김으로 보고 구독을 지운다.
     */
    private boolean send(Sub s, String name, Object body) {
        if (s.dropped) return false;
        String json;
        try {
            json = ErdModelCodec.MAPPER.writeValueAsString(body);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("ERD SSE 본문 직렬화 실패: " + name, e);
        }
        try {
            synchronized (s) {
                s.emitter.send(SseEmitter.event().name(name).data(json));
            }
            return true;
        } catch (Exception e) {
            log.debug("[erd-sse] {} {} 보내기 실패 — 구독 해제: {}", s.modelId, s.session, e.toString());
            s.dropped = true;
            s.emitter.completeWithError(e);
            // 해제는 다른 구독자에게 presence 를 보내므로, 지금 잡은 잠금 밖(ping 스레드)에서 한다 — 두 구독의 잠금이 엇갈려 멈추지 않게.
            pinger.execute(() -> drop(s));
            return false;
        }
    }

    private static String key(String modelId, String session) {
        return modelId + "\u0000" + session;
    }
}
```

설계 메모:
- `deliver`·`catchUp` 은 `synchronized (sub)` 안에서만 부른다. `send` 도 같은 객체로 동기화하므로 재진입이다. 보내기에 실패한 구독의 해제는 ping 스레드로 넘긴다. 한 구독의 잠금을 쥔 채 다른 구독에 presence 를 보내다가 서로 기다리는 일을 막는다.
- 두 명령의 커밋 순서는 모델 행 잠금으로 정해지지만, 커밋 뒤 `afterCommit` 이 부르는 `publish` 는 스레드마다 늦게 올 수 있다. rev N+1 이 N 보다 먼저 오면 `deliver` 가 빈 칸을 보고 명령 기록에서 N 부터 채운다. N 은 이미 커밋됐으므로 기록에 있다. 늦게 온 N 은 `lastRev` 보다 작아 버려진다.
- `ErdModelStore.rev` 는 트랜잭션 밖에서 읽기만 한다.
- `SseEmitter` 의 비동기 디스패치에서 `ClientKeyFilter` 가 다시 돌며 403 이 나면, 필터가 비동기 디스패치를 건너뛰는지(`shouldNotFilterAsyncDispatch`) 확인한다. 고칠 때는 MDM 전체 필터를 바꾸게 되므로 레인 보고에 적는다.

`ErdEditService` 를 고친다. 생성자에 `ErdEventHub hub` 를 더하고(필드 `private final ErdEventHub hub;`), `view` 의 마지막 인자 `List.of()` 를 `hub.presence(modelId)` 로 바꾼다. `getCurrentView`(MCP, 단계 1)는 이 `presence` 를 읽는다. `execute` 는 아래로 바꾼다.

```java
    static final long CLAIM_TTL_SECONDS = 600;

    /** 공동 편집자 관리(ADD/REMOVE_EDITOR), 화면 상태(SET_VIEW), 작업 중 표시(CLAIM·RELEASE). */
    public Map<String, Object> execute(ErdEditRequest r) {
        String modelId = requireModelId(r);
        String me = currentUser.userId();
        String kind = r.getKind() == null ? "" : r.getKind().trim().toUpperCase(Locale.ROOT);
        switch (kind) {
            case "ADD_EDITOR" -> versions.addEditor(modelId, requireText(r.getUserId(), "userId"), me);
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
                store.rev(modelId); // 없는 모델이면 FK 오류 대신 ERD_MODEL_NOT_FOUND
                boolean claimed = hub.claim(modelId, requireText(r.getTableId(), "tableId"), session(r, me), me, CLAIM_TTL_SECONDS);
                return Map.of("ok", claimed);
            }
            case "RELEASE" -> hub.release(modelId, requireText(r.getTableId(), "tableId"), session(r, me));
            default -> throw MdmErrors.invalid("지원하지 않는 kind 입니다: " + r.getKind());
        }
        return Map.of("ok", true);
    }

    private static JsonNode readJson(String text, String name) {
        try {
            JsonNode n = ErdModelCodec.MAPPER.readTree(text == null ? "" : text);
            if (n == null || !n.isObject()) throw MdmErrors.invalid(name + " 은 JSON 객체여야 합니다");
            return n;
        } catch (JsonProcessingException e) {
            throw MdmErrors.invalid(name + " 을 읽을 수 없습니다: " + e.getOriginalMessage());
        }
    }
```

`ErdCommandService.apply` 의 트랜잭션 람다에서 마지막 `return new ErdApplyResult(true, newRev, changes, warnings, null);` 바로 앞에 작업 중 표시 경고를 더한다(`hub` 필드는 Task 9 에 이미 있다).
```java
            Set<String> touchedTables = changes.stream().filter(c -> c.kind().equals("table") || c.kind().equals("column"))
                    .map(c -> c.kind().equals("table") ? c.id() : (c.value() == null ? null : c.value().path("table").asText(null)))
                    .filter(Objects::nonNull).collect(java.util.stream.Collectors.toSet());
            hub.claims(modelId).stream()
                    .filter(cl -> touchedTables.contains(cl.tableId()) && !cl.session().equals(session))
                    .forEach(cl -> warnings.add(new ErdWarning("CLAIMED", cl.tableId(),
                            cl.session() + " 가 " + cl.expiresAt() + " 까지 작업 중인 표입니다")));
```

- [ ] **Step 4: 시험 통과 확인**

Run: Step 2 명령. Expected: 5건 PASS.

- [ ] **Step 5: 포털 경유 SSE 확인(수동, 확인 항목)**

로컬 포털(5100)과 MDM 백엔드(8096, `./be-run.sh --mdm --pdb=<레인 PDB>`), MCM 백엔드(시드용)를 띄운 상태에서 확인한다. 공용 서버를 띄우거나 내릴 때는 띄운 pid 만 다룬다(넓은 `pkill` 금지).
```bash
curl -N -H 'Accept: text/event-stream' -b '<포털 로그인 쿠키>' \
  'http://localhost:5100/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/mcm?session=curl-1&sinceRev=0'
```
다른 터미널에서 `save` 를 한 번 부르고 `event:change` 가 바로 찍히는지 본다. 결과(바로 옴 / 응답이 끝나야 옴 / 403)를 레인 보고와 스펙 5절 확인 항목에 적는다. 바로 오지 않으면 단계 1 계획에서 폴링(`view` + `sinceRev`)으로 바꾼다. 이 단계는 계획 실패가 아니라 확인 결과를 남기는 단계다.

- [ ] **Step 6: 커밋**

```bash
/usr/bin/git add src/backend/mdm
/usr/bin/git commit -m "feat(mdm): ERD 실시간 채널(SSE)·접속자·작업 중 표시"
```

---

### Task 12: 단계 0 마감 — 바뀐 모듈 시험과 문서

**Files:**
- Modify: `docs/superpowers/specs/2026-10-10-erd-tool-design.md` (5절 확인 항목에 결과 기록, 끝에 "계획에서 정한 구현 세부" 한 줄로 이 계획의 P1~P10 링크)
- Modify: `docs/erd-tool/deferred.md` (처리한 항목 없음 확인. 단계 0 에서 새로 미룬 것이 있으면 추가)

- [ ] **Step 1: 바뀐 모듈 전체 시험 1회**

```bash
cd src/backend/mdm && ../gradlew :lib:test --max-workers=2
cd src/backend/mdm && DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone
cd src/backend/mcm && ../gradlew :api:compileJava --max-workers=2
node .claude/skills/oasis-contract-check/scripts/check_oasis_contract.mjs --root .
```
Expected: 모두 PASS·ERROR 0. 실패가 이번 변경과 무관한 기존 실패면 이름과 근거(dev 에서도 실패하는지)를 레인 보고에 적는다.

- [ ] **Step 2: 스펙 확인 항목 갱신**

스펙 5절 표의 "포털 SSE" 행에 Task 11 Step 5 결과를, "표준 검사기 일괄 판정 시간" 행에 `ErdDictionaryLoader.load()` 한 번의 시간(로컬 L_MAIN 기준, `view` 요청 로그로 잼)을 적는다.

- [ ] **Step 3: 커밋**

```bash
/usr/bin/git add docs
/usr/bin/git commit -m "docs(erd): 단계 0 확인 항목 결과 기록"
```
