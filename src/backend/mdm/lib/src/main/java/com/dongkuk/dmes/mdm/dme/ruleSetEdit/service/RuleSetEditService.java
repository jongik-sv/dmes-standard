package com.dongkuk.dmes.mdm.dme.ruleSetEdit.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.CondIo;
import com.dongkuk.dmes.mdm.common.rule.RuleCaseJudge;
import com.dongkuk.dmes.mdm.common.rule.RuleIdRules;
import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIoReader;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCaseJudge;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleSetGuide;
import com.dongkuk.dmes.mdm.common.rule.RuleSetRunner;
import com.dongkuk.dmes.mdm.common.rule.RuleSetTestCaseQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleCaseInputs;
import com.dongkuk.dmes.mdm.common.rule.RunTraceJson;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionException;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleExprParseRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleExprParseResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditService;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetCondIoRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetCondIoResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetEditSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetGuideResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetPickResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetRuleSearchResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetWrites.SetState;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetTestCase;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 룰 세트 편집({@code ruleSetEdit}) OASIS 진입 서비스 — TSK-08-06 design §6.6. BPMN {@code services/dme/ruleSetEdit.bpmn} 의
 * {@code search}·{@code view}·{@code save}·{@code delete}(폐기)·{@code restore}(되살리기)·{@code validate}({@link #condIo} 조건식 IO)·
 * {@code execute}({@link #simulate} 기록 실행 = 디버거) 일곱 분기와 1:1(흐름도 2단계 P5).
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
    private final RuleSetRunner runner;
    private final RuleSetTestCaseService caseService;
    private final RuleSetTestCaseQueries caseQueries;
    private final RuleEditService ruleEditService;
    private final TransactionTemplate tx;

    public RuleSetEditService(MdmRuleSetRepository setRepository, RuleQueries queries, RuleIoReader ioReader,
                              RuleStewardCheck stewardCheck, RuleSetWrites writes, RuleSetRunner runner,
                              RuleSetTestCaseService caseService, RuleSetTestCaseQueries caseQueries, RuleEditService ruleEditService,
                              PlatformTransactionManager transactionManager) {
        this.caseService = caseService;
        this.caseQueries = caseQueries;
        this.ruleEditService = ruleEditService;
        this.setRepository = setRepository;
        this.queries = queries;
        this.ioReader = ioReader;
        this.stewardCheck = stewardCheck;
        this.writes = writes;
        this.runner = runner;
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
        // 지침이 룰을 거슬러 올라가며 하나씩 묻는다(다음 룰은 앞 룰의 입력을 봐야 안다) — 룰 ID 를 미리 모을 수 없어 한 번에 읽지 못하고,
        // 해석 범위 하나로 도메인 트리·결과 변수·컬럼 사전 조회만 같이 쓴다.
        RuleVarTypeResolver.Scope scope = ioReader.scope();
        Function<String, RuleIo> io = id -> cache.computeIfAbsent(id, k -> ioReader.read(List.of(k), scope).get(k));
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
        RuleVarTypeResolver.Scope scope = ioReader.scope();
        Map<String, RuleIo> io = ioReader.read(ruleIds, scope);
        FlowDefinition flow = storedFlow(setId, set.getFlowJson());
        Map<String, CondIo> condIo = flow == null ? Map.of() : ioReader.condIo(flow, scope);
        List<RuleSetCheck> checks = flowChecks(ruleIds, io, flow, condIo);
        boolean steward = stewardCheck.isSteward();
        RuleSetViewResult.Header header = new RuleSetViewResult.Header(set.getMaruRuleSetId(), set.getMaruRuleSetName(),
                set.getDescription(), set.getStatus(), set.getRowVersion(), ruleIds,
                flow == null ? null : RuleSetFlowJson.toMap(set.getFlowJson()), flow != null && RuleSetFlowJson.branched(flow));
        return new RuleSetViewResult(header, List.copyOf(io.values()), checks,
                steward && INUSE.equals(set.getStatus()), steward && DEPRECATED.equals(set.getStatus()),
                condIo, cases(setId));
    }

    /** 저장된 테스트 케이스 — 세트 상태와 무관하게 싣는다(폐기 세트도, P-D8). */
    private List<RuleSetViewResult.Case> cases(String setId) {
        return caseQueries.cases(setId).stream()
                .map(c -> new RuleSetViewResult.Case(c.getCaseId(), c.getCaseName(), c.getInputJson(), c.getEvalTs(), c.getExpectedJson(),
                        c.getDescription(), c.getRowVersion()))
                .toList();
    }

    // ────────────────────────────────────────────────────────────────
    // action: save — 요청 검사(I13) → 담당자 → 서버 재계산 검사(I12) → 조건부 UPDATE
    // ────────────────────────────────────────────────────────────────

    public RuleSetSaveResult save(RuleSetSaveRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "저장할 값이 없습니다.");
        }
        String part = blankToNull(request.getPart());
        if ("CASE".equals(part)) {
            return caseService.save(request);
        }
        if (part != null && !"SET".equals(part)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "save part 는 SET·CASE 중 하나여야 합니다: " + part);
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
            RuleVarTypeResolver.Scope scope = ioReader.scope();
            checks = RuleSetAnalyzer.checks(flow, ioReader.read(ids, scope), ioReader.condIo(flow, scope));
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
            RuleVarTypeResolver.Scope scope = ioReader.scope();
            Map<String, RuleIo> io = ioReader.read(ids, scope);
            List<RuleSetCheck> checks = flowChecks(ids, io, flow, flow == null ? Map.of() : ioReader.condIo(flow, scope));
            rejectIfAny(checks);
            if (writes.restore(setId, rv) == 0) {
                throw writeMissed(setId, rv, DEPRECATED);
            }
            return warnings(checks);
        });
        return new RuleSetStatusResult(setId, INUSE, rv + 1, warns);
    }

    // ────────────────────────────────────────────────────────────────
    // action: validate(조건식 IO) — 편집 중인 흐름의 IF 갈래 조건식 입력. 읽기만 해 담당자 검사를 하지 않는다(권한 action 이 막는다, P5).
    // ────────────────────────────────────────────────────────────────

    public RuleSetCondIoResult condIo(RuleSetCondIoRequest request) {
        String exprText = request == null ? null : blankToNull(request.getExprText());
        if (exprText != null) {
            // 식 텍스트 파싱(P-D1) — 룰 편집 화면의 parseExpr 와 같은 코드. 파싱 오류는 그 서비스의 INVALID_VALUE 그대로.
            RuleExprParseRequest parse = new RuleExprParseRequest();
            parse.setText(exprText);
            parse.setSlot("RULE_COND_EXPR");
            RuleExprParseResult parsed = ruleEditService.parseExpr(parse);
            return new RuleSetCondIoResult(Map.of(), parsed);
        }
        FlowDefinition flow = requestFlow(requireFlowJson(request == null ? null : request.getFlowJson()));
        return new RuleSetCondIoResult(ioReader.condIo(flow));
    }

    // ────────────────────────────────────────────────────────────────
    // action: execute(기록 실행 = 디버거) — 저장 전 흐름을 원장의 RELEASED 룰로 기록 실행한다. 원장에 쓰지 않고 담당자 검사를 하지 않는다(P5).
    // ────────────────────────────────────────────────────────────────

    /**
     * 흐름·판정 오류는 던지지 않고 기록에 담는다(흐름을 읽지 못하면 {@code nodes=[]}·FLOW_INVALID). 저장된 룰 정의가 깨졌으면 MDM026(P-D9).
     * 경고는 폐기 룰(흐름에서 처음 나온 순서) → IF 갈래 조건식 NULL(기록 순서) → 룰 경고(RULE 노드 seq 순)다.
     * 고친 값({@code editsJson}, 4단계 E4)이 있으면 끼워 처음부터 다시 실행하고 기록 {@code edits} 로 되돌려 준다.
     */
    public RuleSetSimulateResult simulate(RuleSetSimulateRequest request) {
        String flowJson = requireFlowJson(request == null ? null : request.getFlowJson());
        if (Boolean.TRUE.equals(request.getRunCases())) {
            return runCases(flowJson, request);
        }
        String recordJson = request.getRecordJson();
        Map<String, Object> record = recordJson == null || recordJson.isBlank() ? Map.of() : RuleCaseJudge.object(recordJson);
        if (record == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "레코드 JSON 은 객체여야 합니다: " + recordJson);
        }
        Instant ts = request.getEvalTs() == null || request.getEvalTs().isBlank() ? null : RuleSetRunner.parseKst(request.getEvalTs());
        List<RunTrace.TraceEdit> edits = edits(request.getEditsJson());
        RuleSetRunner.Session session = runner.session();
        RunTrace trace;
        try {
            trace = session.trace(flowJson, record, ts, edits);
        } catch (StoredDefinitionException e) {
            throw MdmErrors.of(MdmErrorCode.STORED_DEFINITION_CORRUPT, "룰 세트 흐름의 저장된 룰 정의를 읽을 수 없어 실행하지 않습니다 — " + e.getMessage(),
                    List.of());
        }
        return new RuleSetSimulateResult(RunTraceJson.toMap(trace), simulateWarnings(session, flowJson, trace));
    }

    /**
     * 4단계 E4 — {@code editsJson}(JSON 배열 문자열)을 고친 값 목록으로. 비었거나 공백이면 빈 목록. 항목은 {@code {beforeSeq: 1 이상 정수,
     * nodeId: 글자, values: 객체}} 이고 values 는 {@code recordJson} 과 같은 변환기({@link RuleCaseJudge#array})로 푼다. 모양이 틀리면
     * {@code recordJson} 과 같은 INVALID_VALUE 로 거부한다(실행하지 않는다).
     */
    private static List<RunTrace.TraceEdit> edits(String editsJson) {
        if (editsJson == null || editsJson.isBlank()) {
            return List.of();
        }
        List<Object> items = RuleCaseJudge.array(editsJson);
        if (items == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "고친 값 JSON 은 배열이어야 합니다: " + editsJson);
        }
        List<RunTrace.TraceEdit> out = new ArrayList<>(items.size());
        for (int i = 0; i < items.size(); i++) {
            RunTrace.TraceEdit e = edit(items.get(i));
            if (e == null) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "고친 값 JSON 의 " + (i + 1)
                        + "번째 항목은 {beforeSeq: 1 이상 정수, nodeId: 글자, values: 객체} 여야 합니다: " + editsJson);
            }
            out.add(e);
        }
        return List.copyOf(out);
    }

    /** 레코드 입력(RecordKeys)이 막는 예약 이름(EvalEx 상수·EVAL_TS·'_' 접두)은 고친 값 이름으로도 받지 않는다. */
    private static void requireEditableName(String name) {
        String upper = name.toUpperCase(java.util.Locale.ROOT);
        String why = ReservedNames.CONSTANTS.contains(upper) ? "EvalEx 상수 이름이다"
                : upper.equals(ReservedNames.EVAL_TS) ? "평가 시각 예약 이름이다"
                : name.startsWith(ReservedNames.RESERVED_PREFIX) ? "'" + ReservedNames.RESERVED_PREFIX + "' 로 시작한다"
                : null;
        if (why != null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "고친 값 이름 '" + name + "' 는 " + why);
        }
    }

    /** 고친 값 항목 하나 — 모양이 틀리면 null. values 의 null 값(비우기)을 지키려고 Map.copyOf 를 쓰지 않는다. */
    private static RunTrace.TraceEdit edit(Object item) {
        if (!(item instanceof Map<?, ?> m)) {
            return null;
        }
        if (!(m.get("beforeSeq") instanceof Integer seq) || seq < 1) {
            return null;
        }
        if (!(m.get("nodeId") instanceof String nodeId) || nodeId.isBlank()) {
            return null;
        }
        if (!(m.get("values") instanceof Map<?, ?> values)) {
            return null;
        }
        Map<String, Object> copy = new LinkedHashMap<>();
        values.forEach((k, v) -> copy.put(String.valueOf(k), v));
        copy.keySet().forEach(RuleSetEditService::requireEditableName);
        return new RunTrace.TraceEdit(seq, nodeId, Collections.unmodifiableMap(copy));
    }

    /**
     * 저장된 케이스를 화면이 보낸 흐름으로 돌린다(P7, P-D12). 거른 케이스가 상한을 넘으면 아무것도 돌리지 않고 MDM021 로 거부한다.
     * 입력이 JSON 객체가 아니면(저장 뒤 손상) 그 케이스만 INVALID_INPUT_JSON 오류로 답한다.
     */
    private RuleSetSimulateResult runCases(String flowJson, RuleSetSimulateRequest request) {
        String setId = requireSetId(request.getSetId());
        List<Integer> wanted = request.caseIdList();
        List<MdmRuleSetTestCase> picked = caseQueries.cases(setId).stream()
                .filter(c -> wanted.isEmpty() || wanted.contains(c.getCaseId()))
                .toList();
        if (picked.size() > RuleSetTestCaseService.MAX_CASES_PER_SET) {
            throw RuleCaseInputs.limit("한 번에 " + picked.size() + "건을 돌리려 한다. " + RuleSetTestCaseService.MAX_CASES_PER_SET + "건까지 돌린다");
        }
        // 케이스 사이에 룰 정의 조회기를 같이 쓴다 — 판정 시각은 케이스마다 정하고 조회기가 시각마다 버전을 고르므로 결과는 케이스마다 새로 돌린 것과 같다.
        RuleSetRunner.Session session = runner.session();
        List<Map<String, Object>> out = new ArrayList<>();
        for (MdmRuleSetTestCase c : picked) {
            Map<String, Object> record = RuleCaseJudge.object(c.getInputJson());
            if (record == null) {
                out.add(invalidInputCase(c));
                continue;
            }
            Instant ts = c.getEvalTs() == null ? null : RuleSetRunner.parseKst(c.getEvalTs());
            RunTrace trace;
            try {
                trace = session.trace(flowJson, record, ts);
            } catch (StoredDefinitionException e) {
                throw MdmErrors.of(MdmErrorCode.STORED_DEFINITION_CORRUPT,
                        "룰 세트 흐름의 저장된 룰 정의를 읽을 수 없어 실행하지 않습니다 — " + e.getMessage(), List.of());
            }
            out.add(RuleSetCaseJudge.judge(c.getCaseId(), c.getCaseName(), c.getExpectedJson(), trace));
        }
        return new RuleSetSimulateResult(null, List.of(), out);
    }

    private static Map<String, Object> invalidInputCase(MdmRuleSetTestCase c) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("stage", "INPUT_CHECK");
        error.put("code", "INVALID_INPUT_JSON");
        error.put("rowId", null);
        error.put("name", null);
        error.put("message", "케이스 입력이 JSON 객체가 아니다");
        error.put("detail", "케이스 입력이 JSON 객체가 아니다");
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("caseId", c.getCaseId());
        m.put("caseName", c.getCaseName());
        m.put("outcome", "ERROR");
        m.put("pass", false);
        m.put("mismatches", List.of());
        m.put("finalValues", Map.of());
        m.put("errors", List.of(error));
        return m;
    }

    /** 흐름 파싱 결과·룰 헤더는 기록 실행이 쓴 {@code session} 의 것을 다시 쓴다(다시 파싱하거나 다시 읽지 않는다). */
    private static List<Map<String, Object>> simulateWarnings(RuleSetRunner.Session session, String flowJson, RunTrace trace) {
        List<Map<String, Object>> out = new ArrayList<>();
        List<String> ruleIds;
        try {
            ruleIds = session.ruleIds(flowJson);
        } catch (IllegalArgumentException e) {
            ruleIds = List.of(); // 흐름을 읽지 못함 — 기록이 FLOW_INVALID 를 담는다
        }
        out.addAll(session.deprecatedWarnings(ruleIds));
        for (RunTrace.NodeTrace n : trace.nodes()) {
            if (n.branches() == null) {
                continue;
            }
            for (RunTrace.BranchTrace b : n.branches()) {
                if (b.outcome() == RunTrace.BranchOutcome.NULL) {
                    out.add(RuleSetRunner.warning("BRANCH_COND_NULL", null,
                            "IF " + n.nodeId() + " 갈래 " + b.edgeId() + " 조건식 결과가 NULL 이라 거짓으로 봤다"));
                }
            }
        }
        for (RunTrace.NodeTrace n : trace.nodes()) {
            if (n.result() != null) {
                n.result().warnings().forEach(w -> out.add(RuleSetRunner.warning(w.code().name(), w.ruleId(), w.message())));
            }
        }
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // 공통
    // ────────────────────────────────────────────────────────────────

    private static String requireFlowJson(String flowJson) {
        if (flowJson == null || flowJson.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "흐름은 필수입니다.");
        }
        return flowJson;
    }

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

    /** 흐름이 있으면 흐름 기준(조건식 IO {@code condIo}), 없으면 목록 기준 검사. */
    private static List<RuleSetCheck> flowChecks(List<String> ids, Map<String, RuleIo> io, FlowDefinition flow, Map<String, CondIo> condIo) {
        return flow == null ? RuleSetAnalyzer.checks(ids, io) : RuleSetAnalyzer.checks(flow, io, condIo);
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
