package com.dongkuk.dmes.mdm.dme.ruleSetEdit.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.RuleIdRules;
import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIoReader;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleSetGuide;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetEditSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetGuideResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetPickResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetRuleSearchResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetWrites.SetState;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 룰 세트 편집({@code ruleSetEdit}) OASIS 진입 서비스 — TSK-08-06 design §6.6. BPMN {@code services/dme/ruleSetEdit.bpmn} 의
 * {@code search}·{@code view}·{@code save}·{@code delete}(폐기)·{@code restore}(되살리기) 다섯 분기와 1:1.
 *
 * <p>세트에는 버전·DRAFT·선점이 없다(I3) — 공통 버전 서비스를 부르지 않고, 쓰기는 {@link RuleSetWrites} 의 {@code ROW_VERSION} 조건부
 * UPDATE 하나로 {@code TB_MDM_RULE_SET} 한 행만 바꾼다(I23, 배포하지 않는다 D11). 저장·되살리기 검사는 화면 결과를 받지 않고 서버가
 * {@link RuleIoReader} → {@link RuleSetAnalyzer#checks} 로 다시 계산한다(I12·I15).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — OASIS 파라미터 이름 바인딩이 깨진다. 쓰기는 {@link TransactionTemplate}.
 * 흐름 세트(FLOW_JSON)는 흐름 기준으로 검사하고 RULE_IDS 는 서버가 흐름에서 펼친다(흐름도 계획 Task 10). 흐름이 저장된 세트를 목록으로 저장하면
 * FLOW_READONLY 로 거부한다. 담당자 역할 판단은 {@link RuleStewardCheck} 한 곳으로만 한다(I19).
 */
@Service("ruleSetEditService")
public class RuleSetEditService {

    static final int PICK_LIMIT = 20;
    static final int NAME_MAX = 100;
    static final String INUSE = "INUSE";
    static final String DEPRECATED = "DEPRECATED";
    static final String FLOW_READONLY_MESSAGE = "분기가 있는 세트는 룰 목록으로 저장할 수 없다. 흐름도 편집기에서 저장한다";
    static final String FLOW_LIST_SAVE_MESSAGE = "흐름도로 저장한 세트는 룰 목록으로 저장할 수 없다. 흐름도 편집기에서 저장한다";

    private final MdmRuleSetRepository setRepository;
    private final RuleQueries queries;
    private final RuleIoReader ioReader;
    private final RuleStewardCheck stewardCheck;
    private final RuleSetWrites writes;
    private final TransactionTemplate tx;

    public RuleSetEditService(MdmRuleSetRepository setRepository, RuleQueries queries, RuleIoReader ioReader,
                              RuleStewardCheck stewardCheck, RuleSetWrites writes, PlatformTransactionManager transactionManager) {
        this.setRepository = setRepository;
        this.queries = queries;
        this.ioReader = ioReader;
        this.stewardCheck = stewardCheck;
        this.writes = writes;
        this.tx = new TransactionTemplate(transactionManager);
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — target SET(기본)·RULE·GUIDE. 새 action 은 어휘 밖이라 여기서 가른다(F12).
    // ────────────────────────────────────────────────────────────────

    public Object search(RuleSetEditSearchRequest request) {
        RuleSetEditSearchRequest r = request != null ? request : new RuleSetEditSearchRequest();
        String target = blankToNull(r.getTarget());
        if (target == null || "SET".equals(target)) {
            return searchSets(blankToNull(r.getKeyword()));
        }
        if ("RULE".equals(target)) {
            return searchRules(blankToNull(r.getKeyword()));
        }
        if ("GUIDE".equals(target)) {
            return guide(blankToNull(r.getResultVar()));
        }
        throw new BusinessException(ErrorCode.INVALID_VALUE, "search target 은 SET·RULE·GUIDE 중 하나여야 합니다: " + target);
    }

    /** 세트 고르기 — ID 대문자 포함 또는 세트명 포함, 세트 ID 순 20건. */
    private RuleSetPickResult searchSets(String keyword) {
        String upper = keyword == null ? null : keyword.toUpperCase(Locale.ROOT);
        List<RuleSetPickResult.Pick> picks = new ArrayList<>();
        for (MdmRuleSet s : queries.allSets()) {
            if (picks.size() >= PICK_LIMIT) {
                break;
            }
            boolean hit = keyword == null
                    || s.getMaruRuleSetId().toUpperCase(Locale.ROOT).contains(upper)
                    || (s.getMaruRuleSetName() != null && s.getMaruRuleSetName().contains(keyword));
            if (hit) {
                picks.add(new RuleSetPickResult.Pick(s.getMaruRuleSetId(), s.getMaruRuleSetName(), s.getStatus()));
            }
        }
        return new RuleSetPickResult(picks);
    }

    /** 룰 추가 후보 — 룰 ID·룰명 앞부분 20건과 그 입출력. */
    private RuleSetRuleSearchResult searchRules(String keyword) {
        List<String> ids = queries.searchPrefix(keyword, PICK_LIMIT).stream().map(MdmRule::getMaruRuleId).toList();
        return new RuleSetRuleSearchResult(List.copyOf(ioReader.read(ids).values()));
    }

    /** 구성 지침(§6.4) — 결과 변수에서 거슬러 올라간 제안 순서. 저장하지 않는다. */
    private RuleSetGuideResult guide(String target) {
        if (target == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "결과 변수는 필수입니다.");
        }
        Map<String, List<String>> producers = ioReader.producersOfActiveRules();
        Map<String, RuleIo> cache = new HashMap<>();
        Function<String, RuleIo> io = id -> cache.computeIfAbsent(id, k -> ioReader.read(List.of(k)).get(k));
        RuleSetGuide.GuideResult g = RuleSetGuide.suggest(target, n -> producers.getOrDefault(n, List.of()), io);
        List<RuleIo> rules = g.order().stream().map(io).toList();
        return new RuleSetGuideResult(target, g.order(), g.ambiguous(), g.error(), rules);
    }

    // ────────────────────────────────────────────────────────────────
    // action: view
    // ────────────────────────────────────────────────────────────────

    public RuleSetViewResult view(RuleSetViewRequest request) {
        String setId = requireSetId(request == null ? null : request.getSetId());
        MdmRuleSet set = setRepository.findById(setId).orElseThrow(() -> notFound(setId));
        List<String> ruleIds = ruleIdsOf(set.getRuleIds());
        Map<String, RuleIo> io = ioReader.read(ruleIds);
        FlowDefinition flow = storedFlow(setId, set.getFlowJson());
        List<RuleSetCheck> checks = flowChecks(ruleIds, io, flow);
        boolean steward = stewardCheck.isSteward();
        RuleSetViewResult.Header header = new RuleSetViewResult.Header(set.getMaruRuleSetId(), set.getMaruRuleSetName(),
                set.getDescription(), set.getStatus(), set.getRowVersion(), ruleIds,
                flow == null ? null : RuleSetFlowJson.toMap(set.getFlowJson()), flow != null && RuleSetFlowJson.branched(flow));
        return new RuleSetViewResult(header, List.copyOf(io.values()), checks,
                steward && INUSE.equals(set.getStatus()), steward && DEPRECATED.equals(set.getStatus()),
                flow == null ? Map.of() : ioReader.condIo(flow));
    }

    // ────────────────────────────────────────────────────────────────
    // action: save — 요청 검사(I13) → 담당자 → 서버 재계산 검사(I12) → 조건부 UPDATE
    // ────────────────────────────────────────────────────────────────

    public RuleSetSaveResult save(RuleSetSaveRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "저장할 값이 없습니다.");
        }
        String setId = requireSetId(request.getSetId());
        long rv = requireRowVersion(request.getRowVersion());
        String name = validName(request.getSetName());
        List<String> ids;
        List<RuleSetCheck> checks;
        String flowJson;
        if (request.getFlowJson() != null && !request.getFlowJson().isBlank()) {
            FlowDefinition flow = requestFlow(request.getFlowJson());
            ids = RuleSetFlowJson.ruleIds(flow);
            ids.forEach(RuleIdRules::validateRuleId);
            stewardCheck.requireSteward();
            checks = RuleSetAnalyzer.checks(flow, ioReader.read(ids), ioReader.condIo(flow));
            flowJson = requestFlowJson(request.getFlowJson());
        } else {
            ids = requestRuleIds(request.getRules());
            stewardCheck.requireSteward();
            rejectListSaveOverFlow(setId);
            checks = RuleSetAnalyzer.checks(ids, ioReader.read(ids));
            flowJson = null;
        }
        rejectIfAny(checks);
        String description = blankToNull(request.getDescription());
        tx.executeWithoutResult(status -> {
            if (writes.update(setId, name, DomainJson.write(ids), flowJson, description, rv) == 0) {
                throw writeMissed(setId, rv, INUSE);
            }
        });
        return new RuleSetSaveResult(setId, rv + 1, warnings(checks));
    }

    // ────────────────────────────────────────────────────────────────
    // action: delete(폐기) — INUSE → DEPRECATED. 검사를 돌리지 않는다(I14).
    // ────────────────────────────────────────────────────────────────

    public RuleSetStatusResult delete(RuleSetStatusRequest request) {
        String setId = requireSetId(request == null ? null : request.getSetId());
        long rv = requireRowVersion(request.getRowVersion());
        stewardCheck.requireSteward();
        tx.executeWithoutResult(status -> {
            if (writes.deprecate(setId, rv) == 0) {
                throw writeMissed(setId, rv, INUSE);
            }
        });
        return new RuleSetStatusResult(setId, DEPRECATED, rv + 1, List.of());
    }

    // ────────────────────────────────────────────────────────────────
    // action: restore(되살리기) — 저장된 목록의 검사에 거부가 없을 때만 DEPRECATED → INUSE(I15)
    // ────────────────────────────────────────────────────────────────

    public RuleSetStatusResult restore(RuleSetStatusRequest request) {
        String setId = requireSetId(request == null ? null : request.getSetId());
        long rv = requireRowVersion(request.getRowVersion());
        stewardCheck.requireSteward();
        List<RuleSetCheck> warns = tx.execute(status -> {
            SetState state = writes.state(setId).orElseThrow(() -> notFound(setId));
            if (!DEPRECATED.equals(state.status())) {
                throw transition("폐기하지 않은 룰 세트는 되살릴 수 없습니다: " + setId);
            }
            if (state.rowVersion() != rv) {
                throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
            }
            List<String> ids = ruleIdsOf(state.ruleIds());
            FlowDefinition flow = storedFlow(setId, state.flowJson());
            List<RuleSetCheck> checks = flowChecks(ids, ioReader.read(ids), flow);
            rejectIfAny(checks);
            if (writes.restore(setId, rv) == 0) {
                throw writeMissed(setId, rv, DEPRECATED);
            }
            return warnings(checks);
        });
        return new RuleSetStatusResult(setId, INUSE, rv + 1, warns);
    }

    // ────────────────────────────────────────────────────────────────
    // 공통
    // ────────────────────────────────────────────────────────────────

    private static String requireSetId(String setId) {
        String id = blankToNull(setId);
        if (id == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 세트 ID 는 필수입니다.");
        }
        return id;
    }

    private static long requireRowVersion(Long rowVersion) {
        if (rowVersion == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "row_version 은 필수입니다.");
        }
        return rowVersion;
    }

    private static String validName(String setName) {
        String name = blankToNull(setName);
        if (name == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "세트명은 필수입니다.");
        }
        if (name.length() > NAME_MAX) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "세트명은 " + NAME_MAX + "자 이하여야 합니다.");
        }
        return name;
    }

    /** grids.rules.rows 의 룰 ID(요청 순서). 형식은 룰 ID 규칙, 같은 룰 두 번은 MDM021(I13, D15). 행이 없으면 빈 목록(검사 EMPTY 가 거부한다). */
    private static List<String> requestRuleIds(List<Map<String, Object>> rows) {
        if (rows == null) {
            return List.of();
        }
        List<String> ids = new ArrayList<>(rows.size());
        Set<String> seen = new HashSet<>();
        for (Map<String, Object> row : rows) {
            Object raw = row == null ? null : row.get("ruleId");
            String id = raw == null ? null : raw.toString();
            RuleIdRules.validateRuleId(id);
            if (!seen.add(id)) {
                throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "같은 룰을 세트에 두 번 담을 수 없습니다: " + id, List.of());
            }
            ids.add(id);
        }
        return ids;
    }

    /** 저장된 RULE_IDS JSON → 룰 ID 목록(저장 순서). */
    private static List<String> ruleIdsOf(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        return DomainJson.readList(json).stream().map(String::valueOf).toList();
    }

    /** 흐름이 있으면 흐름 기준, 없으면 목록 기준 검사. */
    private List<RuleSetCheck> flowChecks(List<String> ids, Map<String, RuleIo> io, FlowDefinition flow) {
        return flow == null ? RuleSetAnalyzer.checks(ids, io) : RuleSetAnalyzer.checks(flow, io, ioReader.condIo(flow));
    }

    /**
     * 저장된 FLOW_JSON → 엔진 정의(없으면 null). 읽지 못하면 입력 오류가 아니라 저장값 손상이다 — MDM026, 문구에 세트 ID(Ruling 5, P-D9).
     * 저장값은 코덱이 정규화해 쓴 것이라 parse 가 통과하면 toMap 도 통과한다.
     */
    private static FlowDefinition storedFlow(String setId, String flowJson) {
        if (flowJson == null) {
            return null;
        }
        try {
            return RuleSetFlowJson.parse(flowJson);
        } catch (IllegalArgumentException e) {
            throw MdmErrors.of(MdmErrorCode.STORED_DEFINITION_CORRUPT, "룰 세트 " + setId + " 의 저장된 흐름을 읽을 수 없습니다 — " + e.getMessage(),
                    List.of());
        }
    }

    /** 요청 흐름 → 엔진 정의. 형식 오류는 MDM021(I13). */
    private static FlowDefinition requestFlow(String flowJson) {
        try {
            return RuleSetFlowJson.parse(flowJson);
        } catch (IllegalArgumentException e) {
            throw invalidFlow(e);
        }
    }

    /** 저장할 문자열 — 요청 JSON 이 아니라 파싱한 정의로 다시 만든 정규 JSON(P2). */
    private static String requestFlowJson(String flowJson) {
        try {
            return RuleSetFlowJson.canonical(flowJson);
        } catch (IllegalArgumentException e) {
            throw invalidFlow(e);
        }
    }

    private static BusinessException invalidFlow(IllegalArgumentException e) {
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, "흐름 형식이 올바르지 않습니다: " + e.getMessage(), List.of());
    }

    /**
     * 흐름(FLOW_JSON)이 저장된 세트를 목록으로 덮어쓰지 못하게 한다(Review Focus 1) — 한 줄이라도 배치·메모가 사라진다. 분기면 기존 문구, 한 줄이면
     * 새 문구. 저장된 흐름을 읽지 못하면 덮어쓰지 않는 쪽(분기 문구)으로 거부한다. 없는 세트는 여기서 보지 않는다(쓰기 0행이 가른다).
     */
    private void rejectListSaveOverFlow(String setId) {
        writes.state(setId).map(SetState::flowJson).filter(json -> json != null).ifPresent(json -> {
            boolean branched;
            try {
                branched = RuleSetFlowJson.branched(RuleSetFlowJson.parse(json));
            } catch (IllegalArgumentException e) {
                branched = true;
            }
            throw RuleSetRejections.saveRejected(List.of(new RuleSetCheck(RuleSetCheck.FLOW_READONLY, RuleSetCheck.REJECT, null, null,
                    null, branched ? FLOW_READONLY_MESSAGE : FLOW_LIST_SAVE_MESSAGE)));
        });
    }

    private static void rejectIfAny(List<RuleSetCheck> checks) {
        List<RuleSetCheck> rejects = checks.stream().filter(RuleSetCheck::rejected).toList();
        if (!rejects.isEmpty()) {
            throw RuleSetRejections.saveRejected(rejects);
        }
    }

    private static List<RuleSetCheck> warnings(List<RuleSetCheck> checks) {
        return checks.stream().filter(c -> !c.rejected()).toList();
    }

    /** 조건부 UPDATE 가 0행 — DB 에서 다시 읽어 없음·상태(MDM009)·row_version(MDM001) 으로 가른다(I12). */
    private BusinessException writeMissed(String setId, long rv, String expectedStatus) {
        SetState state = writes.state(setId).orElse(null);
        if (state == null) {
            return notFound(setId);
        }
        if (!expectedStatus.equals(state.status())) {
            return transition(DEPRECATED.equals(state.status())
                    ? "폐기한 룰 세트는 고칠 수 없고 되살리기만 합니다: " + setId
                    : "폐기하지 않은 룰 세트는 되살릴 수 없습니다: " + setId);
        }
        return MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
    }

    private static BusinessException transition(String detail) {
        return MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, detail, List.of());
    }

    private static BusinessException notFound(String setId) {
        return new BusinessException(ErrorCode.INVALID_VALUE, "룰 세트를 찾을 수 없습니다: " + setId);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
