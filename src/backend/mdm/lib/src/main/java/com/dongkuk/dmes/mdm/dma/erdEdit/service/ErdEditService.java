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
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

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
    private final ErdEventHub hub;
    /**
     * 바깥 트랜잭션을 멈추고 부르는 틀. OASIS(CactusSpringTransactionHandler)는 프로세스 전체를 트랜잭션 하나로 감싸는데,
     * apply·undo 는 자기 TransactionTemplate 으로 커밋·롤백하고 거절을 예외 없이 결과로 돌려준다. REQUIRED 로 합류하면
     * 거절 때마다 바깥 트랜잭션이 rollback-only 가 되어 커밋이 UnexpectedRollbackException(S001)이 된다.
     * 서비스에 {@code @Transactional} 을 붙이면 프록시가 OASIS 파라미터 이름 바인딩을 깨므로 프로그램으로 멈춘다.
     */
    private final TransactionTemplate outsideTx;

    public ErdEditService(ErdModelStore store, ErdVersionService versions, ErdCommandService commands,
                          ErdConfirmCheck confirmCheck, ErdDictionaryLoader dictionaries, VersionStateService stateService,
                          DraftOwnershipService ownership, MdmCurrentUser currentUser, JdbcTemplate jdbc,
                          ErdEventHub hub, PlatformTransactionManager transactionManager) {
        this.store = store;
        this.versions = versions;
        this.commands = commands;
        this.confirmCheck = confirmCheck;
        this.dictionaries = dictionaries;
        this.stateService = stateService;
        this.ownership = ownership;
        this.currentUser = currentUser;
        this.jdbc = jdbc;
        this.hub = hub;
        this.outsideTx = new TransactionTemplate(transactionManager);
        this.outsideTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
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
                v.getRowVersion(), v.getModelJson(), diagrams, nodes, hub.presence(modelId));
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
        if (!notBlank(r.getModuleId()) || !notBlank(r.getSchemaName()) || !notBlank(r.getModelName())) {
            throw MdmErrors.invalid("moduleId·schemaName·modelName 은 필수입니다");
        }
        // 칸 크기(V6)를 넘으면 ORA-12899(S001) 대신 입력 오류로 돌려준다.
        String modelId = requireText(r.getModelId(), "modelId", 50);
        String moduleId = requireText(r.getModuleId(), "moduleId", 20);
        String schema = requireText(r.getSchemaName(), "schemaName", 128).toUpperCase(Locale.ROOT);
        String name = requireText(r.getModelName(), "modelName", 200);
        versions.createModel(modelId, moduleId, schema, name, currentUser.userId());
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
        String session = session(r, me);
        String source = source(r);
        return plain(outsideTx.execute(status -> commands.apply(modelId, r.getBaseRev(), me, session, source, list)));
    }

    /** 변경 기록에서 고른 명령 하나를 역명령으로 되돌린다(D14). */
    public Map<String, Object> restore(ErdEditRequest r) {
        String modelId = requireModelId(r);
        if (r.getRev() == null) throw MdmErrors.invalid("rev 는 필수입니다");
        String me = currentUser.userId();
        String session = session(r, me);
        String source = source(r);
        return plain(outsideTx.execute(status -> commands.undo(modelId, r.getRev(), me, session, source)));
    }

    static final long CLAIM_TTL_SECONDS = 600;

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
                // 칸 크기(TABLE_UUID 50, SESSION_NM 100)를 넘으면 ORA-12899(S001) 대신 입력 오류. DB 를 읽기 전에 본다.
                String tableId = requireText(r.getTableId(), "tableId", 50);
                String session = requireMax(session(r, me), "session", 100);
                store.rev(modelId); // 없는 모델이면 FK 오류 대신 ERD_MODEL_NOT_FOUND
                // 바깥(OASIS) 트랜잭션 밖에서 부른다 — 허브가 쓰기 직후 SSE 로 알리므로, 쓰기가 커밋된 뒤에 알려야 한다.
                Boolean claimed = outsideTx.execute(status -> hub.claim(modelId, tableId, session, me, CLAIM_TTL_SECONDS));
                return Map.of("ok", Boolean.TRUE.equals(claimed));
            }
            case "RELEASE" -> {
                String tableId = requireText(r.getTableId(), "tableId");
                String session = session(r, me);
                outsideTx.executeWithoutResult(status -> hub.release(modelId, tableId, session)); // CLAIM 과 같은 이유
            }
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

    /** 필수 + 길이 상한(저장 칸의 문자 수). */
    private static String requireText(String v, String name, int max) {
        return requireMax(requireText(v, name), name, max);
    }

    private static String requireMax(String v, String name, int max) {
        if (v.length() > max) throw MdmErrors.invalid(name + " 은 " + max + "자 이하여야 합니다(지금 " + v.length() + "자)");
        return v;
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
