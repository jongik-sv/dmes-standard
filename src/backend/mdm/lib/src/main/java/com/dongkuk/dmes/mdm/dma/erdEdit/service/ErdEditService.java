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
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMetaReader;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDbDiffView;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdEditRequest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdStatusView;
import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdDbDiff;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdImportResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import com.dongkuk.dmes.mdm.dma.erdEdit.importing.ErdImportBuilder;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.ErdHintsLoader;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.ErdRelationInferrer;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.InferredRelation;
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

/**
 * OASIS {@code erdEdit} 서비스(계획 Task 10 표). 판정은 Task 8·9 서비스와 공통 버전 서비스가 하고, 여기서는 입력을 읽어 넘긴다.
 *
 * <p>트랜잭션: 모든 액션이 OASIS(CactusSpringTransactionHandler)가 프로세스마다 여는 바깥 트랜잭션 안에서 돈다. 저장·복원·가져오기
 * ({@link ErdCommandService})와 작업 중 표시({@link ErdEventHub#claim})도 그 트랜잭션에 합류해 요청 하나가 연결 하나만 쓴다(deferred 27).
 * 예전에는 바깥 트랜잭션을 NOT_SUPPORTED 로 멈추고 새로 열어, 멈춘 바깥 연결과 안쪽 연결 2개를 쥐었다 — 동시 저장 수가 풀 크기에 닿으면
 * 모두 서로의 연결을 기다리다 S001 로 끝났다. 거절의 되돌리기는 ErdCommandService 가 savepoint 로 하고, SSE 방송은 커밋 뒤에 한다.
 * 그래서 erdEdit BPMN 은 액션마다 이 서비스 단계 하나 뒤에 바로 끝나야 한다 — 모델 행 잠금이 OASIS 커밋까지 가고, 거절 때의 em.clear() 가
 * 앞 단계의 엔티티를 분리한다(ErdCommandService 의 Discard 주석).
 * 서비스에 {@code @Transactional} 을 붙이지 않는다 — 프록시가 OASIS 파라미터 이름 바인딩을 깬다.
 */
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
    private final ErdDbMetaReader metaReader;
    private final ErdHintsLoader hintsLoader;

    public ErdEditService(ErdModelStore store, ErdVersionService versions, ErdCommandService commands,
                          ErdConfirmCheck confirmCheck, ErdDictionaryLoader dictionaries, VersionStateService stateService,
                          DraftOwnershipService ownership, MdmCurrentUser currentUser, JdbcTemplate jdbc,
                          ErdEventHub hub, ErdDbMetaReader metaReader, ErdHintsLoader hintsLoader) {
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
        this.metaReader = metaReader;
        this.hintsLoader = hintsLoader;
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
            case "STATUS" -> {
                return status(r);
            }
            default -> throw MdmErrors.invalid("view 가 지원하지 않는 kind 입니다: " + r.getKind());
        }
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

    /** 논리명 → 물리명(또는 반대) 미리보기. 사전은 이 요청에서 한 번만 읽는다(계획 P3). */
    public Map<String, Object> compare(ErdEditRequest r) {
        if (notBlank(r.getKind())) {
            if (isKind(r, "DB_DIFF")) return dbDiff(r);
            throw MdmErrors.invalid("지원하지 않는 kind 입니다: " + r.getKind());
        }
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
    /**
     * 컬럼별 표준 상태(README S5). 사전을 이 요청에서 한 번 읽어 모델 전체를 판정한다(P3, 캐시 없음).
     * elapsedMs 는 사전 적재 + 판정 시간이다 — 단계 1 마감(Task 12)이 L_MAIN 에서 이 값으로 판정 시간을 잰다.
     */
    private Map<String, Object> status(ErdEditRequest r) {
        String modelId = requireModelId(r);
        long rev = store.rev(modelId);
        MdmErdModelVer v = r.getVer() == null ? store.current(modelId)
                : store.find(ref(modelId, r.getVer())).orElseThrow(() -> MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND));
        ErdModel m = ErdModelCodec.read(v.getModelJson());
        long started = System.nanoTime();
        ErdDictionary d = dictionaries.load();
        Map<String, ErdColumnStatus> judged = ErdStandardJudge.judge(m, d);
        long elapsedMs = (System.nanoTime() - started) / 1_000_000;
        Map<String, String> statuses = new LinkedHashMap<>();
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (ErdColumnStatus s : ErdColumnStatus.values()) counts.put(s.name(), 0);
        judged.forEach((id, s) -> {
            statuses.put(id, s.name());
            counts.merge(s.name(), 1, Integer::sum);
        });
        Map<String, ErdStatusView.Domain> domainsUsed = new LinkedHashMap<>();
        for (ErdColumn c : m.columns.values()) {
            if (c.domainId == null || domainsUsed.containsKey(String.valueOf(c.domainId))) continue;
            d.domain(c.domainId).ifPresent(x -> domainsUsed.put(String.valueOf(c.domainId),
                    new ErdStatusView.Domain(x.domainName(), x.dataType(), x.length(), x.scale())));
        }
        return plain(new ErdStatusView(modelId, VersionNumbers.plain(v.getVer()), rev, statuses, domainsUsed, counts, elapsedMs));
    }

    /** DB 와 지금 보이는 버전(DRAFT 우선)의 차이(README S4). 읽기만 한다 — 반영은 단계 2 의 import kind=APPLY_DIFF 다. */
    private Map<String, Object> dbDiff(ErdEditRequest r) {
        String modelId = requireModelId(r);
        long rev = store.rev(modelId);
        String schema = moduleAndSchema(modelId)[1];
        ErdModel m = ErdModelCodec.read(store.current(modelId).getModelJson());
        return plain(new ErdDbDiffView(modelId, rev, schema, ErdDbDiff.diff(m, metaReader.read(schema))));
    }

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
        return plain(commands.apply(modelId, r.getBaseRev(), me, session, source, list));
    }

    /** 변경 기록에서 고른 명령 하나를 역명령으로 되돌린다(D14). */
    public Map<String, Object> restore(ErdEditRequest r) {
        String modelId = requireModelId(r);
        if (r.getRev() == null) throw MdmErrors.invalid("rev 는 필수입니다");
        String me = currentUser.userId();
        String session = session(r, me);
        String source = source(r);
        return plain(commands.undo(modelId, r.getRev(), me, session, source));
    }

    /**
     * 첫 가져오기(S2·S3). 메타 읽기·관계 추정·요소 만들기는 모델 행을 잠그기 전에 하고, 쓰기는 applyImport 한 번이다.
     * 사전은 여기(논리명)와 applyImport(엔진 경고)에서 두 번 읽는다. 거절은 성공 응답에 rejection 을 담는다(save 와 같다).
     */
    public Map<String, Object> importModel(ErdEditRequest r) {
        String modelId = requireModelId(r);
        if (!isKind(r, "FROM_DB")) throw MdmErrors.invalid("import 의 kind 는 FROM_DB 입니다: " + r.getKind());
        if (r.getBaseRev() == null) throw MdmErrors.invalid("baseRev 는 필수입니다");
        long baseRev = r.getBaseRev();
        String me = currentUser.userId();
        String session = session(r, me);
        String source = source(r);
        String[] moduleSchema = moduleAndSchema(modelId);
        ErdDbMeta meta = metaReader.read(moduleSchema[1]);
        if (meta.tables().isEmpty()) {
            throw MdmErrors.invalid("스키마 " + moduleSchema[1] + " 에 가져올 표가 없습니다(스키마 이름과 읽기 권한을 확인하세요)");
        }
        List<InferredRelation> inferred = new ErdRelationInferrer().infer(meta, hintsLoader.load(moduleSchema[0]));
        ErdImportBuilder.Built built = ErdImportBuilder.build(meta, inferred, dictionaries.load(), baseRev);
        ErdApplyResult res = commands.applyImport(modelId, baseRev, me, session, source,
                built.restore(), built.diagramCommands());
        List<ErdWarning> warnings = new ArrayList<>(res.warnings());
        if (res.applied()) warnings.addAll(built.skipped());
        return plain(new ErdImportResult(res.applied(), res.rev(), res.changes(), warnings, res.rejection(),
                res.applied() ? built.summary() : null));
    }

    /** 모델 행의 [MODULE_ID, SCHEMA_NAME]. 없으면 ERD_MODEL_NOT_FOUND. */
    private String[] moduleAndSchema(String modelId) {
        List<String[]> rows = jdbc.query("SELECT MODULE_ID, SCHEMA_NAME FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = ?",
                (rs, i) -> new String[]{rs.getString(1), rs.getString(2)}, modelId);
        if (rows.isEmpty()) throw MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND);
        if (rows.get(0)[1] == null || rows.get(0)[1].isBlank()) throw MdmErrors.invalid("모델에 스키마 이름이 없습니다: " + modelId);
        return rows.get(0);
    }

    /** 요청 kind 가 k 인가(앞뒤 공백·대소문자 무시). */
    private static boolean isKind(ErdEditRequest r, String k) {
        return r.getKind() != null && k.equals(r.getKind().trim().toUpperCase(Locale.ROOT));
    }

    static final long CLAIM_TTL_SECONDS = 600;

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
                // 칸 크기(TABLE_UUID 50, SESSION_NM 100)를 넘으면 ORA-12899(S001) 대신 입력 오류. DB 를 읽기 전에 본다.
                String tableId = requireText(r.getTableId(), "tableId", 50);
                String session = requireMax(session(r, me), "session", 100);
                store.rev(modelId); // 없는 모델이면 FK 오류 대신 ERD_MODEL_NOT_FOUND
                // OASIS 트랜잭션 연결로 쓰고, 허브는 커밋 뒤에 SSE 로 알린다(deferred 27 — 연결 하나).
                return Map.of("ok", hub.claim(modelId, tableId, session, me, CLAIM_TTL_SECONDS));
            }
            case "RELEASE" -> {
                String tableId = requireText(r.getTableId(), "tableId");
                String session = session(r, me);
                hub.release(modelId, tableId, session); // CLAIM 과 같다
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

    /** kind 를 대문자로. 없으면 빈 문자열(각 액션의 기본 동작). */
    private static String kind(ErdEditRequest r) {
        return r.getKind() == null ? "" : r.getKind().trim().toUpperCase(Locale.ROOT);
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
