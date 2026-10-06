package com.dongkuk.dmes.mdm.dme.ruleCalc.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.CondIo;
import com.dongkuk.dmes.mdm.common.rule.RuleCaseJudge;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleErrorText;
import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import com.dongkuk.dmes.mdm.common.rule.RuleIoReader;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleSetInterface;
import com.dongkuk.dmes.mdm.common.rule.RuleSetRunner;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.rule.SetCallIo;
import com.dongkuk.dmes.mdm.common.rule.SetCallIoReader;
import com.dongkuk.dmes.mdm.common.rule.definition.RuleVersionPick;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionException;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcIoResult;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcMessage;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcRequest;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcRunResult;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcSearchResult;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetVer;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.exc.StreamConstraintsException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.Guarded;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.SetStep;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.flow.Step;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.springframework.stereotype.Service;

/**
 * 조업 계산기 서비스({@code ruleCalc}) — 계약 정본 {@code docs/widget-2026-10/rule-calc-api.md}. BPMN {@code services/dme/ruleCalc.bpmn} 의
 * {@code view}(method {@link #io})·{@code execute}(method {@link #run})·{@code search}(method {@link #search}) 세 분기와 1:1(액션 이름은 RBAC
 * 어휘, 자바 메서드명은 그대로). 룰 또는 룰 세트의 입출력 모양을 알려 주고({@code io}), 그 입력 값으로 계산하고({@code run}), 계산할 수 있는 룰·세트 ID 를
 * 찾아 준다({@code search}). 읽기 전용이다.
 *
 * <p>버전은 RELEASED 만 쓴다(룰·세트마다 판정 시각에 적용되는 RELEASED). {@code preview=true} 일 때만 로그인 사용자({@link MdmCurrentUser})의 내
 * DRAFT 를 먼저 쓴다({@link RuleVersionPick#myDraft}). 사용자 ID 를 요청으로 받지 않는다. 확정 버전이 없거나(NO_RELEASED) 대상이 없거나
 * (NOT_FOUND) 엔진이 입력 부족(INPUT_MISSING)·평가 오류로 판정하지 못해도 예외가 아니라 응답 본문의 {@code messages} 로 돌려준다. 저장 정의가 깨진 경우만
 * 오류(MDM026)다.
 *
 * <p>세트의 입력·최종 결과는 {@link RuleSetInterface#of}(앞 룰 결과 이름 제외·{@code CATCH_*} 제외)가 정하고, IF 갈래 조건식이 읽는 변수 중 <b>그 IF
 * 앞에서</b> 만들어지지 않은 이름은 입력에 더한다(흐름을 걸으며 정의된 이름을 쌓는다 — 엔진 {@code FlowKeys}·{@code RuleSetInterface} 와 같은 방식). 실행은 {@link RuleSetRunner.Session#traceDefinition} 의 기록({@link RunTrace})으로 한다.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — OASIS 파라미터 이름 바인딩이 깨진다(읽기만 한다).
 */
@Service("ruleCalcService")
public class RuleCalcService {

    /** valuesJson 이 JSON 객체로 안 읽힐 때 원인이 숫자 길이 제한인지 가려내는 파서({@link RuleCaseJudge} 와 같은 설정). */
    private static final ObjectMapper NUMBER_PROBE = new ObjectMapper().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);

    static final String RULE = "RULE";
    static final String SET = "SET";

    private final MdmRuleRepository ruleRepository;
    private final MdmRuleSetRepository setRepository;
    private final RuleQueries queries;
    private final RuleSetVersionQueries setVersions;
    private final RuleIoReader ioReader;
    private final SetCallIoReader setCallReader;
    private final RuleSetRunner runner;
    private final MdmDomainRepository domainRepository;
    private final MdmCurrentUser currentUser;
    private final Clock clock;

    public RuleCalcService(MdmRuleRepository ruleRepository, MdmRuleSetRepository setRepository, RuleQueries queries,
                           RuleSetVersionQueries setVersions, RuleIoReader ioReader, SetCallIoReader setCallReader, RuleSetRunner runner,
                           MdmDomainRepository domainRepository, MdmCurrentUser currentUser, Clock clock) {
        this.ruleRepository = ruleRepository;
        this.setRepository = setRepository;
        this.queries = queries;
        this.setVersions = setVersions;
        this.ioReader = ioReader;
        this.setCallReader = setCallReader;
        this.runner = runner;
        this.domainRepository = domainRepository;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    // ────────────────────────────────────────────────────────────────
    // action: view(메서드 io) — 입력·출력 모양 조회(판정 시각은 지금)
    // ────────────────────────────────────────────────────────────────

    public RuleCalcIoResult io(RuleCalcRequest request) {
        Target t = target(request);
        Instant at = now();
        Shape s = shape(t, atKst(at), pickOf(request));
        RuleCalcIoResult out = new RuleCalcIoResult();
        out.setOk(s.ok());
        out.setTarget(s.target());
        out.setInputs(s.inputs());
        out.setOutputs(s.outputs());
        out.setSteps(s.steps());
        out.getMessages().addAll(s.messages());
        if (s.ok()) {
            out.getMessages().addAll(deprecated(s.ruleIds(), null));
        }
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: execute(메서드 run) — 계산
    // ────────────────────────────────────────────────────────────────

    public RuleCalcRunResult run(RuleCalcRequest request) {
        Target t = target(request);
        Instant at = request.getEvalTs() == null || request.getEvalTs().isBlank() ? now() : RuleSetRunner.parseKst(request.getEvalTs().trim());
        RuleVersionPick pick = pickOf(request);
        Shape s = shape(t, atKst(at), pick);
        RuleCalcRunResult out = new RuleCalcRunResult();
        out.getMessages().addAll(s.messages());
        if (!s.ok()) {
            return out;
        }
        Map<String, Object> values;
        try {
            values = valuesOf(request);
        } catch (NumberTooBig e) {
            out.getMessages().add(new RuleCalcMessage(RuleCalcMessage.INPUT_INVALID, e.getMessage()));
            return out;
        }

        // 입력 검사 — 키 없음·null·빈 글자는 막지 않고 null 로 엔진에 넘긴다(M47 룰은 분기 행마다 쓰는 변수가 달라 일부만 넣고 계산하는 것이 정상이다).
        // 엔진이 그 null 때문에 판정하지 못하면 위반으로 돌아와 아래에서 메시지가 된다. 값이 있는데 선언 타입으로 못 바꾸면 INPUT_INVALID 다.
        // 이름은 io 가 알려 준 표기 그대로 찾는다.
        Map<String, Object> record = new LinkedHashMap<>();
        List<RuleCalcMessage> problems = new ArrayList<>();
        Set<String> inputNames = new HashSet<>();
        for (RuleCalcIoResult.Item in : s.inputs()) {
            inputNames.add(upper(in.getName()));
            Object raw = values.get(in.getName());
            if (raw == null || raw instanceof CharSequence cs && cs.toString().isBlank()) {
                record.put(in.getName(), null);
                continue;
            }
            try {
                // 타입을 풀지 못한 입력(컬럼 사전에도 세트 안 어느 룰의 선언에도 없다)은 글자로 바꾸지 않고 받은 타입 그대로 엔진에 넘긴다.
                String key = upper(in.getName());
                record.put(in.getName(), s.untyped().contains(key) ? passThrough(raw, s.boolText().contains(key)) : toInput(raw, in.getDataType()));
            } catch (NumberTooBig e) {
                problems.add(new RuleCalcMessage(RuleCalcMessage.INPUT_INVALID, "입력 " + in.getName() + " 의 숫자가 너무 큽니다(자릿수·지수는 "
                        + MAX_DIGITS + " 이하). 값을 줄이세요."));
            } catch (IllegalArgumentException e) {
                problems.add(new RuleCalcMessage(RuleCalcMessage.INPUT_INVALID, "입력 " + in.getName() + " 에는 " + typeText(in.getDataType())
                        + " 값이 와야 합니다(지금 값: '" + shown(raw) + "'). " + typeText(in.getDataType()) + " 값으로 고치세요."));
            }
        }
        if (!problems.isEmpty()) {
            out.getMessages().addAll(problems);
            return out;
        }

        RuleSetRunner.Session session = runner.session(pick);
        RunTrace trace;
        try {
            trace = session.traceDefinition(t.id(), s.flow(), record, at);
        } catch (StoredDefinitionException e) {
            throw MdmErrors.of(MdmErrorCode.STORED_DEFINITION_CORRUPT, t.id() + " 의 저장된 정의를 읽을 수 없어 판정하지 않습니다 — " + e.getMessage(),
                    List.of());
        }

        List<String> executed = new ArrayList<>(s.ruleIds());
        collectSteps(trace, runningValues(trace.input()), out.getSteps(), executed, new StepIo(s.ios(), atKst(at), pick));
        List<Violation> violations = trace.violations();
        if (violations == null || violations.isEmpty()) {
            out.setOk(true);
            out.setResult(resultOf(trace.finalValues(), s.outputs()));
        } else {
            for (Violation v : violations) {
                out.getMessages().add(violationMessage(v, inputNames));
            }
        }
        out.getMessages().addAll(deprecated(executed.stream().distinct().toList(), session));
        return out;
    }

    /**
     * 응답 {@code result} — io 가 알려 준 최종 결과 이름(세트는 {@code outputs}, 룰은 룰 결과 전부)만, 그 이름의 값이 판정 끝에 있을 때. 세트의 중간값은
     * {@code steps[].outputs} 에서만 보이고 {@code CATCH_*} 이름은 {@code outputs} 에 없으므로 여기에도 없다.
     */
    private static Map<String, Object> resultOf(Map<String, Object> finalValues, List<RuleCalcIoResult.Item> outputs) {
        Map<String, Object> byName = runningValues(finalValues);
        Map<String, Object> out = new LinkedHashMap<>();
        for (RuleCalcIoResult.Item o : outputs) {
            if (byName.containsKey(o.getName())) {
                out.put(o.getName(), format(byName.get(o.getName())));
            }
        }
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — 룰·세트 찾기(편집기에서 ID 를 고르는 용도)
    // ────────────────────────────────────────────────────────────────

    static final String ALL = "ALL";
    static final int DEFAULT_LIMIT = 50;
    static final int MAX_LIMIT = 200;

    /**
     * 판정 시각(지금)에 적용 중인 RELEASED 가 있는 룰·세트 가운데 ID·이름에 키워드가 든 것을 ID 순으로 {@code limit} 건 돌려준다. 폐기(DEPRECATED) 룰·세트는
     * 뺀다. {@code preview=true} 면 내 DRAFT 가 있는 것도 넣고 그 행의 {@code ver}·{@code verStatus} 는 {@code view} 와 같이 그 DRAFT 다. 읽기만 한다.
     */
    public RuleCalcSearchResult search(RuleCalcSearchRequest request) {
        RuleCalcSearchRequest req = request == null ? new RuleCalcSearchRequest() : request;
        String tp = req.getTargetTp() == null || req.getTargetTp().isBlank() ? ALL : req.getTargetTp().trim().toUpperCase(Locale.ROOT);
        if (!ALL.equals(tp) && !RULE.equals(tp) && !SET.equals(tp)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "대상 종류(targetTp) 는 RULE·SET·ALL 중 하나여야 합니다: " + req.getTargetTp());
        }
        int limit = req.getLimit() == null || req.getLimit() < 1 ? DEFAULT_LIMIT : Math.min(req.getLimit(), MAX_LIMIT);
        String keyword = req.getKeyword() == null || req.getKeyword().isBlank() ? null : req.getKeyword().trim();
        RuleVersionPick pick = req.isPreview() ? RuleVersionPick.myDraft(currentUser.userId()) : RuleVersionPick.RELEASED;
        LocalDateTime at = atKst(now());

        List<RuleCalcSearchResult.Row> rows = new ArrayList<>();
        if (!SET.equals(tp)) {
            List<MdmRule> rules = queries.searchCallable(keyword, pick.draftOwner(), at, limit);
            Map<String, List<MdmRuleVer>> versions = new HashMap<>();
            queries.versionsOf(rules.stream().map(MdmRule::getMaruRuleId).toList())
                    .forEach(v -> versions.computeIfAbsent(v.getMaruRuleId(), k -> new ArrayList<>()).add(v));
            for (MdmRule r : rules) {
                pick.pick(versions.getOrDefault(r.getMaruRuleId(), List.of()), MdmRuleVer::getOwnerId, at)
                        .ifPresent(v -> rows.add(row(RULE, r.getMaruRuleId(), r.getMaruRuleName(), v.getVer(), v.getStatus(), r.getDescription())));
            }
        }
        if (!RULE.equals(tp)) {
            List<MdmRuleSet> sets = setVersions.searchCallable(keyword, pick.draftOwner(), at, limit);
            Map<String, List<MdmRuleSetVer>> versions = setVersions.versionsOf(sets.stream().map(MdmRuleSet::getMaruRuleSetId).toList());
            for (MdmRuleSet s : sets) {
                pick.pick(versions.getOrDefault(s.getMaruRuleSetId(), List.of()), MdmRuleSetVer::getOwnerId, at)
                        .ifPresent(v -> rows.add(row(SET, s.getMaruRuleSetId(), s.getMaruRuleSetName(), v.getVer(), v.getStatus(), s.getDescription())));
            }
        }
        if (ALL.equals(tp)) { // 룰·세트 두 목록을 합칠 때만 자바에서 다시 정렬한다. 한 종류만이면 DB 의 ID 정렬을 그대로 쓴다.
            rows.sort(Comparator.comparing(RuleCalcSearchResult.Row::getId).thenComparing(RuleCalcSearchResult.Row::getTp));
        }
        RuleCalcSearchResult out = new RuleCalcSearchResult();
        out.setOk(true);
        out.getRows().addAll(rows.size() > limit ? rows.subList(0, limit) : rows);
        return out;
    }

    private static RuleCalcSearchResult.Row row(String tp, String id, String name, BigDecimal ver, String verStatus, String description) {
        RuleCalcSearchResult.Row x = new RuleCalcSearchResult.Row();
        x.setTp(tp);
        x.setId(id);
        x.setName(name);
        x.setVer(VersionNumbers.plain(ver));
        x.setVerStatus(verStatus);
        x.setDesc(description == null || description.isBlank() ? null : description);
        return x;
    }

    // ────────────────────────────────────────────────────────────────
    // 대상 → 입출력 모양
    // ────────────────────────────────────────────────────────────────

    private record Target(String tp, String id) {
    }

    /**
     * 입출력 모양 계산 결과. {@code ok=false} 면 {@code flow} 는 null 이고 {@code messages} 에 사유가 있다.
     *
     * @param ios     최상위 룰 ID → 룰 입출력(run 의 steps[].inputs 가 룰의 입력 이름을 찾는 데 쓴다)
     * @param untyped  타입을 풀지 못한 입력 이름(대문자) — 컬럼 사전에도, 세트 안 어느 룰의 선언(조건·결과)에도 없는 것. run 이 받은 타입 그대로 넘긴다
     * @param boolText untyped 이면서 IF 조건에만 쓰이는 변수(CondWalk 가 더한 이름, 대문자) — 글자 {@code TRUE}·{@code FALSE} 를 불린으로 읽는다
     */
    private record Shape(boolean ok, RuleCalcIoResult.Target target, List<RuleCalcIoResult.Item> inputs, List<RuleCalcIoResult.Item> outputs,
                         List<RuleCalcIoResult.Step> steps, List<RuleCalcMessage> messages, FlowDefinition flow, List<String> ruleIds,
                         Map<String, RuleIo> ios, Set<String> untyped, Set<String> boolText) {

        static Shape fail(RuleCalcIoResult.Target target, String code, String text) {
            return new Shape(false, target, List.of(), List.of(), List.of(), List.of(new RuleCalcMessage(code, text)), null, List.of(), Map.of(),
                    Set.of(), Set.of());
        }
    }

    private static Target target(RuleCalcRequest request) {
        if (request == null || request.getTargetId() == null || request.getTargetId().isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "대상 ID(targetId) 는 필수입니다.");
        }
        String tp = request.getTargetTp() == null ? "" : request.getTargetTp().trim().toUpperCase(Locale.ROOT);
        if (!RULE.equals(tp) && !SET.equals(tp)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "대상 종류(targetTp) 는 RULE 또는 SET 이어야 합니다: " + request.getTargetTp());
        }
        return new Target(tp, request.getTargetId().trim());
    }

    /**
     * 입력 값 — {@code values}(객체)가 있으면 그것, 없으면 {@code valuesJson}(JSON 객체 글자, 소수는 BigDecimal). 둘 다 없으면 빈 맵(빈 입력은 null 로 엔진에 넘긴다). {@code valuesJson} 이 JSON 객체가 아니면 INVALID_VALUE.
     */
    private static Map<String, Object> valuesOf(RuleCalcRequest request) {
        if (request.getValues() != null) {
            return request.getValues();
        }
        String json = request.getValuesJson();
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        Map<String, Object> parsed = RuleCaseJudge.object(json);
        if (parsed == null) {
            if (numberTooLong(json)) {
                throw new NumberTooBig("valuesJson 숫자가 너무 큼 — 따옴표 없는 숫자 하나는 " + MAX_DIGITS + "자 이하여야 합니다. 자릿수를 줄이세요.");
            }
            throw new BusinessException(ErrorCode.INVALID_VALUE, "입력 값(valuesJson) 은 {\"이름\": 값} 모양의 JSON 객체여야 합니다.");
        }
        return parsed;
    }

    /** 따옴표 없는 JSON 숫자가 Jackson 의 숫자 길이 제한(1000자)을 넘어 {@link RuleCaseJudge#object} 가 null 을 돌려준 경우인가. */
    private static boolean numberTooLong(String json) {
        try {
            NUMBER_PROBE.readValue(json, Object.class);
            return false;
        } catch (JsonProcessingException e) {
            Throwable t = e instanceof StreamConstraintsException ? e : e.getCause();
            return t instanceof StreamConstraintsException && String.valueOf(t.getMessage()).startsWith("Number");
        }
    }

    private RuleVersionPick pickOf(RuleCalcRequest request) {
        return request.isPreview() ? RuleVersionPick.myDraft(currentUser.userId()) : RuleVersionPick.RELEASED;
    }

    private Shape shape(Target t, LocalDateTime at, RuleVersionPick pick) {
        return RULE.equals(t.tp()) ? ruleShape(t.id(), at, pick) : setShape(t.id(), at, pick);
    }

    private static RuleCalcIoResult.Target head(String tp, String id) {
        RuleCalcIoResult.Target x = new RuleCalcIoResult.Target();
        x.setTp(tp);
        x.setId(id);
        return x;
    }

    private static String noReleased(String what, boolean draftAllowed) {
        return "확정 버전 없음: " + what + " — 판정 시각에 적용되는 확정(RELEASED) 버전이 없습니다"
                + (draftAllowed ? "(내 DRAFT 도 없습니다)." : ". 확정된 뒤에 쓸 수 있습니다.");
    }

    private Shape ruleShape(String id, LocalDateTime at, RuleVersionPick pick) {
        RuleCalcIoResult.Target head = head(RULE, id);
        Optional<MdmRule> rule = ruleRepository.findById(id);
        if (rule.isEmpty()) {
            return Shape.fail(head, RuleCalcMessage.NOT_FOUND, "룰 " + id + " 을(를) 찾을 수 없습니다. 룰 ID 를 확인하세요.");
        }
        head.setName(rule.get().getMaruRuleName());
        List<MdmRuleVer> versions = queries.versions(id);
        head.setStatus(RuleVersions.effectiveStatus(rule.get().getStatus(), versions, at));
        Optional<MdmRuleVer> ver = pick.pick(versions, MdmRuleVer::getOwnerId, at);
        if (ver.isEmpty()) {
            return Shape.fail(head, RuleCalcMessage.NO_RELEASED, noReleased("룰 " + id, pick.draftFirst()));
        }
        head.setVer(VersionNumbers.plain(ver.get().getVer()));
        head.setVerStatus(ver.get().getStatus());

        RuleVarTypeResolver.Scope scope = ioReader.scope();
        RuleIo io = ioReader.read(List.of(id), at, pick, scope).get(id);
        Units units = new Units(scope, queries.varsOf(Map.of(id, ver.get().getVer())));
        List<RuleCalcIoResult.Item> inputs = items(io.conds(), units, false);
        List<RuleCalcIoResult.Item> outputs = items(io.results(), units, false);
        return new Shape(true, head, inputs, outputs, List.of(), List.of(), FlowParser.linear(List.of(id)), List.of(id), Map.of(id, io),
                untypedOf(io.conds(), Set.of(), scope), Set.of());
    }

    private Shape setShape(String id, LocalDateTime at, RuleVersionPick pick) {
        RuleCalcIoResult.Target head = head(SET, id);
        Optional<MdmRuleSet> set = setRepository.findById(id);
        if (set.isEmpty()) {
            return Shape.fail(head, RuleCalcMessage.NOT_FOUND, "룰 세트 " + id + " 을(를) 찾을 수 없습니다. 세트 ID 를 확인하세요.");
        }
        head.setName(set.get().getMaruRuleSetName());
        List<MdmRuleSetVer> versions = setVersions.versions(id);
        String status = RuleVersions.effectiveStatus(set.get().getStatus(), versions, at);
        head.setStatus(status);
        Optional<MdmRuleSetVer> ver = pick.pick(versions, MdmRuleSetVer::getOwnerId, at);
        if (ver.isEmpty()) {
            return Shape.fail(head, RuleCalcMessage.NO_RELEASED, noReleased("룰 세트 " + id, pick.draftFirst()));
        }
        head.setVer(VersionNumbers.plain(ver.get().getVer()));
        head.setVerStatus(ver.get().getStatus());
        FlowDefinition flow;
        try {
            flow = RuleSetVersionQueries.flow(ver.get());
        } catch (IllegalArgumentException e) {
            throw MdmErrors.of(MdmErrorCode.STORED_DEFINITION_CORRUPT, "룰 세트 " + id + " 의 저장된 정의를 읽을 수 없어 판정하지 않습니다 — "
                    + e.getMessage(), List.of());
        }

        List<String> ruleIds = RuleSetFlowJson.ruleIds(flow);
        RuleVarTypeResolver.Scope scope = ioReader.scope();
        Map<String, RuleIo> rules = ioReader.read(ruleIds, at, pick, scope);
        Map<String, SetCallIo> calls = setCallReader.callsOf(flow, at);
        List<String> missing = new ArrayList<>();
        for (String r : ruleIds) {
            RuleIo io = rules.get(r);
            if (io == null || !io.exists() || io.releasedVer() == null) {
                missing.add("룰 " + r);
            }
        }
        calls.forEach((c, io) -> {
            if (!io.exists()) {
                missing.add("하위 세트 " + c);
            }
        });
        if (!missing.isEmpty()) {
            return Shape.fail(head, RuleCalcMessage.NO_RELEASED, noReleased("룰 세트 " + id + " 에 든 " + String.join(", ", missing), pick.draftFirst()));
        }

        Map<String, BigDecimal> vers = new LinkedHashMap<>();
        rules.forEach((r, io) -> vers.put(r, VersionNumbers.parse(io.releasedVer())));
        Map<String, List<MdmRuleVar>> varsByRule = queries.varsOf(vers);
        Units units = new Units(scope, varsByRule);

        SetCallIo sio = RuleSetInterface.of(id, set.get().getMaruRuleSetName(), true, status, flow, rules, calls);
        List<RuleCalcIoResult.Item> inputs = items(sio.inputs(), units, false);
        List<RuleCalcIoResult.Item> outputs = new ArrayList<>();
        for (SetCallIo.OutputName o : sio.outputs()) {
            outputs.add(item(o.name(), labelOfResult(o.name(), ruleIds, rules), o.dataType(), o.scale(), units.unit(o.name()), false));
        }
        Set<String> declared = declaredIn(rules, calls, varsByRule);
        Set<String> untyped = untypedOf(sio.inputs(), declared, scope);
        Set<String> boolText = new HashSet<>();
        addConditionInputs(flow, rules, calls, id, scope, inputs, untyped, boolText, declared);

        List<RuleCalcIoResult.Step> steps = new ArrayList<>();
        for (String r : ruleIds) {
            RuleIo io = rules.get(r);
            RuleCalcIoResult.Step st = new RuleCalcIoResult.Step();
            st.setRuleId(r);
            st.setName(io.ruleName());
            st.setOutputs(items(io.results(), units, false));
            steps.add(st);
        }
        return new Shape(true, head, inputs, outputs, steps, List.of(), flow, ruleIds, rules, untyped, boolText);
    }

    /**
     * 타입을 풀지 못한 입력 이름(대문자) — 처음 읽은 룰의 출처가 NONE 이고, 컬럼 사전에도 {@code declared}(세트 안 어느 룰이든 선언한 이름)에도
     * 없는 것. 처음 읽은 룰만 보면 다른 룰이 타입을 선언한 이름도 타입 없음으로 오판한다.
     */
    private static Set<String> untypedOf(List<IoName> names, Set<String> declared, RuleVarTypeResolver.Scope scope) {
        Set<String> out = new HashSet<>();
        for (IoName n : names) {
            String key = upper(n.name());
            if (RuleIo.NONE.equals(n.source()) && !declared.contains(key) && scope.column(n.name()).isEmpty()) {
                out.add(key);
            }
        }
        return out;
    }

    /**
     * 세트 안 어느 룰이든 타입(도메인·데이터 타입)을 선언한 이름(대문자) — 룰 입출력의 컬럼 사전 출처(DICT)·조건 열 선언(PROG), 결과 변수 선언,
     * 하위 세트 입출력의 타입. 엔진 {@code FlowKeys.declared} 가 세트 안 룰의 선언에서 이름마다 타입을 모으는 것과 같은 범위다.
     */
    private static Set<String> declaredIn(Map<String, RuleIo> rules, Map<String, SetCallIo> calls, Map<String, List<MdmRuleVar>> varsByRule) {
        Set<String> out = new HashSet<>();
        rules.values().forEach(io -> {
            if (io != null && io.conds() != null) {
                io.conds().stream().filter(c -> c.source() != null && !RuleIo.NONE.equals(c.source())).forEach(c -> out.add(upper(c.name())));
            }
        });
        varsByRule.values().forEach(vars -> vars.forEach(v -> {
            if (v.getDomainId() == null && (v.getDataType() == null || v.getDataType().isBlank())) {
                return;
            }
            if ("RESULT".equals(v.getVarKind())) {
                String name = v.getResGrp() != null && !v.getResGrp().isBlank() ? v.getResGrp() : v.getVarName();
                if (name != null) {
                    out.add(upper(name));
                }
            } else if ("COND".equals(v.getVarKind()) && !"Expression".equals(v.getDispType()) && (v.getVarAst() == null || v.getVarAst().isBlank())
                    && v.getVarName() != null) {
                out.add(upper(v.getVarName()));
            }
        }));
        calls.values().forEach(c -> {
            c.inputs().stream().filter(i -> i.source() != null && !RuleIo.NONE.equals(i.source())).forEach(i -> out.add(upper(i.name())));
            c.outputs().stream().filter(o -> o.dataType() != null && !o.dataType().isBlank()).forEach(o -> out.add(upper(o.name())));
        });
        return out;
    }

    /**
     * IF 갈래 조건식이 읽는 변수 가운데 <b>그 IF 앞에서</b> 만들어지지 않은 이름을 입력에 더한다(문서 §2.1). 흐름 트리를 실행 순서로 걸으며 지금까지
     * 만들어진 이름을 쌓는다(엔진 {@code FlowKeys} 가 걸으며 정의된 이름을 추적하는 방식 — 일부 갈래에서만 만들어지는 이름도 정의된 것으로 친다).
     * IF 뒤 룰이 만드는 이름을 IF 가 읽으면 그것은 입력이다. EVAL_TS·{@code _} 접두는 {@link RuleIoReader#condIo} 가 이미 뺐고 {@code CATCH_*}
     * 는 뺀다. 이미 입력인 이름은 더하지 않는다. 구조 오류로 트리가 없으면 더하지 않는다(실행이 FLOW_INVALID 로 막는다).
     */
    private void addConditionInputs(FlowDefinition flow, Map<String, RuleIo> rules, Map<String, SetCallIo> calls, String setId,
                                    RuleVarTypeResolver.Scope scope, List<RuleCalcIoResult.Item> inputs, Set<String> untyped,
                                    Set<String> boolText, Set<String> declared) {
        if (flow.nodes().stream().noneMatch(n -> n.kind() == NodeKind.IF)) {
            return;
        }
        FlowParse parse = FlowParser.parse(flow);
        if (parse.tree() == null) {
            return;
        }
        Set<String> known = new HashSet<>();
        inputs.forEach(i -> known.add(upper(i.getName())));
        CondWalk w = new CondWalk(ioReader.condIo(flow, scope), rules, calls, setId, scope, inputs, untyped, boolText, declared, known);
        w.seq(parse.tree().root(), new HashSet<>());
    }

    /** 흐름을 실행 순서로 걸으며 만들어진 이름(대문자)을 쌓고, IF 갈래 조건식의 변수 가운데 아직 만들어지지 않은 것을 입력으로 더한다. */
    private final class CondWalk {
        private final Map<String, CondIo> condIo;
        private final Map<String, RuleIo> rules;
        private final Map<String, SetCallIo> calls;
        private final String setId;
        private final RuleVarTypeResolver.Scope scope;
        private final List<RuleCalcIoResult.Item> inputs;
        private final Set<String> untyped;
        private final Set<String> boolText;
        private final Set<String> declared;
        private final Set<String> known;
        private int seq;

        CondWalk(Map<String, CondIo> condIo, Map<String, RuleIo> rules, Map<String, SetCallIo> calls, String setId, RuleVarTypeResolver.Scope scope,
                 List<RuleCalcIoResult.Item> inputs, Set<String> untyped, Set<String> boolText, Set<String> declared, Set<String> known) {
            this.condIo = condIo;
            this.rules = rules;
            this.calls = calls;
            this.setId = setId;
            this.scope = scope;
            this.inputs = inputs;
            this.untyped = untyped;
            this.boolText = boolText;
            this.declared = declared;
            this.known = known;
        }

        /** {@code made} 는 이 지점까지 만들어진 이름(대문자) — 걸으며 늘어난다. */
        void seq(Seq s, Set<String> made) {
            for (Block b : s.items()) {
                if (b instanceof Step st) {
                    made.addAll(produced(st));
                } else if (b instanceof Seq q) {
                    seq(q, made);
                } else if (b instanceof Split sp) {
                    if (sp.kind() == NodeKind.IF) {
                        for (Branch br : sp.branches()) {
                            if (!br.otherwise()) {
                                condInputs(br.edgeId(), made);
                            }
                        }
                    }
                    Set<String> after = new HashSet<>();
                    for (Branch br : sp.branches()) {
                        Set<String> inBranch = new HashSet<>(made);       // 갈래는 분기 직전까지 만들어진 이름만 본다(병렬 형제 결과는 보지 않는다)
                        seq(br.body(), inBranch);                         // 끝내는 갈래도 걷는다 — 안쪽 IF 조건 변수는 입력으로 모은다
                        if (!br.ends()) {                                 // 끝내는 IF 갈래는 블록 뒤로 이어지지 않는다(엔진 FlowKeys.walk 와 같다)
                            after.addAll(inBranch);
                        }
                    }
                    made.addAll(after);
                } else if (b instanceof Guarded g) {
                    Set<String> before = new HashSet<>(made);
                    made.addAll(produced(g.step()));
                    Set<String> normal = new HashSet<>(made);
                    seq(g.normal(), normal);
                    Set<String> after = new HashSet<>(normal);
                    for (Guarded.Handler h : g.handlers()) {
                        Set<String> inHandler = new HashSet<>(before);
                        inHandler.addAll(ReservedNames.CATCH_NAMES);
                        seq(h.body(), inHandler);
                        inHandler.removeAll(ReservedNames.CATCH_NAMES);
                        if (!h.ends()) {                                  // END 로 가는 처리 갈래는 받는 노드 블록 뒤로 이어지지 않는다(엔진 FlowKeys.guardAll 과 같다)
                            after.addAll(inHandler);
                        }
                    }
                    made.addAll(after);
                }
            }
        }

        /** 단계가 만드는 이름 — RULE 은 결과 전부, SET 은 하위 세트의 모든 출력, 빈 단계는 없음. */
        private Set<String> produced(Step st) {
            Set<String> out = new HashSet<>();
            if (st instanceof RuleStep r) {
                RuleIo io = rules.get(r.ruleId());
                if (io != null && io.results() != null) {
                    io.results().forEach(x -> out.add(upper(x.name())));
                }
            } else if (st instanceof SetStep sp && sp.setId() != null) {
                SetCallIo c = calls.get(sp.setId());
                if (c != null) {
                    c.outputs().forEach(o -> out.add(upper(o.name())));
                }
            }
            return out;
        }

        private void condInputs(String edgeId, Set<String> made) {
            CondIo c = condIo.get(edgeId);
            if (c == null || !c.ok()) {
                return;
            }
            for (IoName v : c.vars()) {
                String key = upper(v.name());
                if (ReservedNames.CATCH_NAMES.contains(key) || made.contains(key) || !known.add(key)) {
                    continue;
                }
                MdmRuleVar probe = new MdmRuleVar(setId, BigDecimal.ONE.setScale(3), -(++seq), "COND", seq);
                probe.setVarName(v.name());
                ResolvedVar r = scope.resolve(setId, BigDecimal.ONE.setScale(3), List.of(probe)).get(0);
                inputs.add(item(v.name(), r.label(), r.dataType(), r.scale(), unitOfDomain(r.domainId(), scope, v.name()), true));
                if (RuleVarTypeResolver.UNRESOLVED.equals(r.typeSource()) && !declared.contains(key)) {
                    untyped.add(key);
                    boolText.add(key);        // IF 조건에만 쓰이는 타입 없는 변수 — 글자 TRUE·FALSE 를 불린으로 읽는다
                }
            }
        }
    }

    private static String upper(String s) {
        return s.toUpperCase(Locale.ROOT);
    }

    /** 세트 최종 결과 이름의 표시명 — 그 이름을 처음 만드는 룰의 결과 표시명. */
    private static String labelOfResult(String name, List<String> ruleIds, Map<String, RuleIo> rules) {
        for (String r : ruleIds) {
            for (IoName x : rules.get(r).results()) {
                if (x.name().equals(name)) {
                    return x.label();
                }
            }
        }
        return null;
    }

    private static List<RuleCalcIoResult.Item> items(List<IoName> names, Units units, boolean required) {
        List<RuleCalcIoResult.Item> out = new ArrayList<>(names.size());
        for (IoName n : names) {
            out.add(item(n.name(), n.label(), n.dataType(), n.scale(), units.unit(n.name()), required));
        }
        return out;
    }

    private static RuleCalcIoResult.Item item(String name, String label, String dataType, Integer scale, String unit, boolean required) {
        RuleCalcIoResult.Item x = new RuleCalcIoResult.Item();
        String type = dataType == null || dataType.isBlank() ? "STRING" : dataType.toUpperCase(Locale.ROOT);
        x.setName(name);
        x.setLabel(label == null || label.isBlank() ? null : label);
        x.setDataType(type);
        x.setScale("NUMBER".equals(type) ? scale : null);
        x.setUnit(unit == null ? "" : unit);
        x.setRequired(required);
        return x;
    }

    // ────────────────────────────────────────────────────────────────
    // 단위(문서 §5) — 컬럼 사전의 도메인 UNIT_CODE, 없으면 룰이 선언한 도메인의 UNIT_CODE, 없으면 ""
    // ────────────────────────────────────────────────────────────────

    private String unitOfDomain(Long domainId, RuleVarTypeResolver.Scope scope, String name) {
        if (domainId != null) {
            return domainRepository.findById(domainId).map(MdmDomain::getUnitCode).filter(u -> !u.isBlank()).orElse("");
        }
        return scope.column(name).map(MdmColumn::getDomainId).map(d -> unitOfDomain(d, scope, name)).orElse("");
    }

    /** 이름 → 단위. 한 요청에서 읽은 컬럼 사전·룰 변수·도메인을 같이 쓴다. */
    private final class Units {
        private final RuleVarTypeResolver.Scope scope;
        private final List<MdmRuleVar> vars = new ArrayList<>();
        private final Map<String, String> byDomain = new HashMap<>();

        Units(RuleVarTypeResolver.Scope scope, Map<String, List<MdmRuleVar>> varsByRule) {
            this.scope = scope;
            varsByRule.values().forEach(vars::addAll);
        }

        String unit(String name) {
            Optional<MdmColumn> column = scope.column(name);
            if (column.isPresent() && column.get().getDomainId() != null) {
                return domainUnit(column.get().getDomainId());
            }
            for (MdmRuleVar v : vars) {
                if (v.getDomainId() != null && declares(v, name)) {
                    return domainUnit(v.getDomainId());
                }
            }
            return "";
        }

        private boolean declares(MdmRuleVar v, String name) {
            if ("RESULT".equals(v.getVarKind())) {
                String resName = v.getResGrp() != null && !v.getResGrp().isBlank() ? v.getResGrp() : v.getVarName();
                return name.equals(resName);
            }
            return "COND".equals(v.getVarKind()) && !"Expression".equals(v.getDispType()) && (v.getVarAst() == null || v.getVarAst().isBlank())
                    && name.equalsIgnoreCase(v.getVarName());
        }

        private String domainUnit(Long domainId) {
            return byDomain.computeIfAbsent(String.valueOf(domainId), k -> unitOfDomain(domainId, scope, null));
        }
    }

    // ────────────────────────────────────────────────────────────────
    // 값 표현(문서 §4)
    // ────────────────────────────────────────────────────────────────

    /** NUMBER 값의 자릿수 방어선 — precision 이 이 값을 넘거나 |scale| 이 이 값을 넘는 BigDecimal 은 받지도 내보내지도 않는다(1e999999999 류 메모리 폭주). */
    static final int MAX_DIGITS = 1000;
    /** 글자 숫자의 길이 상한 — 자릿수 {@link #MAX_DIGITS} 와 부호·소수점·지수 표기를 담고도 남는다. 이보다 길면 파싱하지 않고 거절한다. */
    private static final int MAX_NUMBER_TEXT = 2000;

    static boolean oversized(BigDecimal d) {
        return d.precision() > MAX_DIGITS || Math.abs((long) d.scale()) > MAX_DIGITS;
    }

    /** 숫자 크기 방어에 걸렸다 — 응답 메시지가 「숫자가 너무 큽니다」 로 따로 나간다. */
    static final class NumberTooBig extends IllegalArgumentException {
        NumberTooBig(String message) {
            super(message);
        }
    }

    private static BigDecimal checked(BigDecimal d) {
        if (oversized(d)) {
            throw new NumberTooBig("숫자가 너무 큽니다");
        }
        return d;
    }

    /**
     * 글자 값이 BigDecimal 로 읽히는 모양이면 크기 방어를 적용한다 — 선언 타입이 글자여도 같은 이름을 다른 룰이 NUMBER 로 선언해 엔진이 바꿀 수 있어
     * 우회로가 된다. 비용 때문에 길이 {@link #MAX_NUMBER_TEXT} 를 넘는 글자는 파싱하지 않고, 숫자 문자로만 이루어졌으면 거절하고 아니면 보통 글자다.
     */
    private static void rejectOversizedText(String raw) {
        String text = raw.trim();
        if (text.isEmpty()) {
            return;
        }
        if (text.length() > MAX_NUMBER_TEXT) {
            if (text.chars().allMatch(c -> c >= '0' && c <= '9' || c == '+' || c == '-' || c == '.' || c == 'e' || c == 'E')) {
                throw new NumberTooBig("숫자가 너무 큽니다");
            }
            return;
        }
        char first = text.charAt(0);
        if (!(first >= '0' && first <= '9' || first == '+' || first == '-' || first == '.')) {
            return;                                           // 숫자로 시작하지 않으면 BigDecimal 로 읽히지 않는다
        }
        BigDecimal d;
        try {
            d = new BigDecimal(text);
        } catch (NumberFormatException e) {
            return;                                           // 숫자 모양이 아니다 — 보통 글자
        }
        checked(d);
    }

    /** 숫자 값 → BigDecimal(double 을 거치지 않는다). 숫자가 아니면 {@link IllegalArgumentException}. 자릿수가 너무 크면 거절. */
    private static BigDecimal toNumber(Object raw) {
        if (raw instanceof BigDecimal d) {
            return checked(d);
        }
        if (raw instanceof Integer || raw instanceof Long || raw instanceof Short || raw instanceof Byte) {
            return BigDecimal.valueOf(((Number) raw).longValue());
        }
        if (raw instanceof Double || raw instanceof Float) {
            double d = ((Number) raw).doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) {
                throw new IllegalArgumentException("숫자가 아닙니다");
            }
            return checked(new BigDecimal(raw.toString()));     // 최단 표기(0.1 → 0.1). new BigDecimal(double) 은 쓰지 않는다
        }
        if (raw instanceof Number n) {
            return checked(new BigDecimal(n.toString()));
        }
        if (raw instanceof CharSequence s) {
            String text = s.toString().trim();
            if (text.length() > MAX_NUMBER_TEXT) {
                throw new NumberTooBig("숫자가 너무 큽니다");
            }
            try {
                return checked(new BigDecimal(text));
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("숫자가 아닙니다", e);
            }
        }
        throw new IllegalArgumentException("숫자가 아닙니다");
    }

    /**
     * 요청 값 → 엔진 입력. NUMBER 는 BigDecimal(double 을 거치지 않는다), BOOLEAN 은 불린, 그 밖은 글자. 못 바꾸거나 숫자 자릿수가 너무 크면
     * {@link IllegalArgumentException}.
     */
    static Object toInput(Object raw, String dataType) {
        String type = dataType == null ? "STRING" : dataType;
        switch (type) {
            case "NUMBER":
                return toNumber(raw);
            case "BOOLEAN":
                if (raw instanceof Boolean b) {
                    return b;
                }
                if (raw instanceof CharSequence s && s.toString().trim().equalsIgnoreCase("TRUE")) {
                    return Boolean.TRUE;
                }
                if (raw instanceof CharSequence s && s.toString().trim().equalsIgnoreCase("FALSE")) {
                    return Boolean.FALSE;
                }
                throw new IllegalArgumentException("참/거짓이 아닙니다");
            default:
                if (raw instanceof BigDecimal d) {
                    return checked(d).toPlainString();
                }
                String text = raw.toString();
                rejectOversizedText(text);                  // 글자 칸이어도 BigDecimal 로 읽히는 모양이면 같은 방어(타입 선언 우회 방지)
                return text;
        }
    }

    /**
     * 타입을 풀지 못한 입력(컬럼 사전에도 세트 안 어느 룰의 선언에도 없다)은 글자로 바꾸지 않고 받은 타입 그대로 넘긴다 — 불린은 불린, 숫자는
     * BigDecimal(자릿수 방어는 그대로), 글자는 글자(숫자 모양이면 크기 방어). 그 밖의 JSON(배열·객체)은 거절한다.
     *
     * @param boolText 이 입력이 IF 조건에만 쓰이는 변수인가 — 맞으면 앞뒤 공백을 떼고 대소문자 무시로 {@code TRUE}·{@code FALSE} 인 글자를 불린으로
     *                 읽는다(IF 조건 전용 불린 변수는 타입 선언이 없어 입력 칸이 글자로만 오기 때문이다). 아니면 글자는 늘 글자 그대로다
     */
    static Object passThrough(Object raw, boolean boolText) {
        if (raw instanceof Boolean) {
            return raw;
        }
        if (raw instanceof CharSequence cs) {
            String text = cs.toString();
            if (boolText && text.trim().equalsIgnoreCase("TRUE")) {
                return Boolean.TRUE;
            }
            if (boolText && text.trim().equalsIgnoreCase("FALSE")) {
                return Boolean.FALSE;
            }
            rejectOversizedText(text);
            return text;
        }
        return toNumber(raw);
    }

    /** 오류 문구에 싣는 받은 값 — 길면 줄인다(거대한 입력을 그대로 되돌리지 않는다). */
    private static String shown(Object raw) {
        String text = String.valueOf(raw);
        return text.length() > 40 ? text.substring(0, 40) + "…" : text;
    }

    private static String typeText(String dataType) {
        return switch (dataType == null ? "" : dataType) {
            case "NUMBER" -> "숫자";
            case "BOOLEAN" -> "참/거짓(TRUE·FALSE)";
            default -> "문자";
        };
    }

    /**
     * 엔진 값 → 응답 값. BigDecimal 은 반올림 없이 {@code toPlainString}(자릿수가 {@link #MAX_DIGITS} 를 넘으면 과학 표기 {@code toString} 으로 두고
     * 펼치지 않는다), 불린·글자는 그대로, null 은 null, 목록은 원소마다.
     */
    static Object format(Object v) {
        if (v == null || v instanceof Boolean || v instanceof String) {
            return v;
        }
        if (v instanceof BigDecimal d) {
            return oversized(d) ? d.toString() : d.toPlainString();
        }
        if (v instanceof List<?> list) {
            List<Object> out = new ArrayList<>(list.size());
            list.forEach(e -> out.add(format(e)));
            return out;
        }
        if (v instanceof Number n) {
            return format(new BigDecimal(n.toString()));
        }
        return v.toString();
    }

    private static Map<String, Object> formatAll(Map<String, Object> map) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (map != null) {
            map.forEach((k, v) -> out.put(k, format(v)));
        }
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // 실행 기록 → 응답
    // ────────────────────────────────────────────────────────────────

    /** 이름 대소문자를 가리지 않는 값 맵 — 실행 중 값(입력 레코드 + 앞 단계 결과 누적)과 판정 끝 값을 이름으로 찾는 데 쓴다. */
    private static Map<String, Object> runningValues(Map<String, Object> init) {
        Map<String, Object> m = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        if (init != null) {
            m.putAll(init);
        }
        return m;
    }

    /** steps[].inputs 가 룰의 입력 이름을 찾는 데 쓰는 룰 입출력 — 최상위 룰은 이미 읽었고, 하위 세트 안 룰은 처음 만날 때 읽는다. */
    private final class StepIo {
        private final Map<String, RuleIo> ios;
        private final LocalDateTime at;
        private final RuleVersionPick pick;
        /** 요청 하나가 쓰는 타입 해석 범위 — 하위 세트 룰마다 새로 만들지 않고 처음 필요할 때 한 번 만들어 나눠 쓴다. */
        private RuleVarTypeResolver.Scope scope;

        StepIo(Map<String, RuleIo> known, LocalDateTime at, RuleVersionPick pick) {
            this.ios = new HashMap<>(known);
            this.at = at;
            this.pick = pick;
        }

        RuleIo of(String ruleId) {
            RuleIo known = ios.get(ruleId);
            if (known == null) {
                if (scope == null) {
                    scope = ioReader.scope();
                }
                known = ioReader.read(List.of(ruleId), at, pick, scope).get(ruleId);
                ios.put(ruleId, known);
            }
            return known;
        }
    }

    /**
     * 실행한 룰 노드(OK 만, 받는 노드로 넘긴 CAUGHT 는 제외)를 실행 순서로 담는다. SET 노드는 하위 기록을 펼친다.
     *
     * <p>{@code steps[].inputs} 는 그 룰의 입력 이름({@link RuleIo#conds}, 식 칸 변수 포함)마다 엔진이 그 시점에 기록한 읽은 값
     * ({@link NodeTrace#reads()} — 병렬 형제 값·{@code CATCH_*} 값까지 정확하다)을 먼저 쓰고, 거기에 없는 이름(식 칸 변수)만 실행 중 값 맵
     * ({@code running} — 입력 레코드와 앞 단계 결과의 누적)에서 채운다. 하위 세트는 자기 입력 레코드({@code sub.input()})에서 시작하는 별도 값 맵을 쓰고, 끝나면 넘겨받은
     * 이름({@code outputs})만 부모 값 맵에 더한다.
     */
    private void collectSteps(RunTrace trace, Map<String, Object> running, List<RuleCalcRunResult.Step> out, List<String> ruleIds, StepIo io) {
        for (NodeTrace n : trace.nodes()) {
            if (n.kind() == NodeKind.RULE && n.status() == NodeStatus.OK && n.result() != null) {
                RuleCalcRunResult.Step st = new RuleCalcRunResult.Step();
                st.setRuleId(n.ruleId());
                st.setInputs(inputsOf(n, running, io));
                st.setOutputs(formatAll(n.result().results()));
                st.setHit(n.result().hits() != null && !n.result().hits().isEmpty());
                st.setDefaultApplied(n.result().defaultApplied());
                out.add(st);
                ruleIds.add(n.ruleId());
                running.putAll(n.result().results());
            } else if (n.kind() == NodeKind.SET && n.sub() != null) {
                collectSteps(n.sub(), runningValues(n.sub().input()), out, ruleIds, io);
                if (n.outputs() != null) {
                    running.putAll(n.outputs());
                }
            }
        }
    }

    private Map<String, Object> inputsOf(NodeTrace n, Map<String, Object> running, StepIo io) {
        RuleIo rio = io.of(n.ruleId());
        if (rio == null || !rio.exists() || rio.conds() == null) {
            return formatAll(n.reads());                   // 룰 입출력을 못 읽으면 엔진이 기록한 읽은 값으로 대신한다
        }
        Map<String, Object> reads = runningValues(n.reads());
        Map<String, Object> out = new LinkedHashMap<>();
        for (IoName c : rio.conds()) {
            if (reads.containsKey(c.name())) {
                out.put(c.name(), format(reads.get(c.name())));
            } else if (running.containsKey(c.name())) {
                out.put(c.name(), format(running.get(c.name())));
            }
        }
        return out;
    }

    /**
     * 위반 한 건 → 메시지. 위반의 이름이 io 가 알려 준 입력 이름일 때만 입력 타입 변환 실패는 INPUT_INVALID, 입력 키·NULL 은 INPUT_MISSING 이다. 그
     * 밖(앞 룰 결과·중간 값이 비었거나 타입이 안 맞음)과 다른 위반은 EVAL_ERROR 다.
     *
     * @param inputNames io 입력 이름(대문자)
     */
    static RuleCalcMessage violationMessage(Violation v, Set<String> inputNames) {
        String text = (v.ruleId() == null ? "" : "[" + v.ruleId() + "] ")
                + RuleErrorText.describe(v.stage().name(), v.code().name(), v.rowId(), v.name(), v.message());
        boolean isInput = v.name() != null && inputNames.contains(upper(v.name()));
        String code = RuleCalcMessage.EVAL_ERROR;
        if (isInput) {
            if (v.code() == Code.TYPE_CONVERSION) {
                code = RuleCalcMessage.INPUT_INVALID;
            } else if (v.code() == Code.MISSING_KEY || v.code() == Code.REQUIRED_NULL) {
                code = RuleCalcMessage.INPUT_MISSING;
            }
        }
        return new RuleCalcMessage(code, text);
    }

    /** 폐기(DEPRECATED) 룰 경고 — 계산을 막지 않는다. 룰 ID 는 처음 나온 순서, 같은 룰은 한 번. */
    private List<RuleCalcMessage> deprecated(List<String> ruleIds, RuleSetRunner.Session session) {
        List<String> ids = ruleIds.stream().distinct().toList();
        List<Map<String, Object>> warnings = session == null ? runner.deprecatedWarnings(ids) : session.deprecatedWarnings(ids);
        List<RuleCalcMessage> out = new ArrayList<>();
        for (Map<String, Object> w : warnings) {
            out.add(new RuleCalcMessage(RuleSetRunner.RULE_DEPRECATED, String.valueOf(w.get("message"))));
        }
        return out;
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.SECONDS);
    }

    private static LocalDateTime atKst(Instant at) {
        return LocalDateTime.ofInstant(at, MdmClockConfig.KST);
    }
}
