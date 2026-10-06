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
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.springframework.stereotype.Service;

/**
 * 조업 계산기 서비스({@code ruleCalc}) — 계약 정본 {@code docs/widget-2026-10/rule-calc-api.md}. BPMN {@code services/dme/ruleCalc.bpmn} 의
 * {@code io}(method {@link #io})·{@code run}(method {@link #run}) 두 분기와 1:1. 룰 또는 룰 세트의 입출력 모양을 알려 주고({@code io}), 그
 * 입력 값으로 계산한다({@code run}). 읽기 전용이다.
 *
 * <p>버전은 RELEASED 만 쓴다(룰·세트마다 판정 시각에 적용되는 RELEASED). {@code preview=true} 일 때만 로그인 사용자({@link MdmCurrentUser})의 내
 * DRAFT 를 먼저 쓴다({@link RuleVersionPick#myDraft}). 사용자 ID 를 요청으로 받지 않는다. 확정 버전이 없거나(NO_RELEASED) 대상이 없거나
 * (NOT_FOUND) 입력이 비었거나(INPUT_MISSING) 판정이 실패해도 예외가 아니라 응답 본문의 {@code messages} 로 돌려준다. 저장 정의가 깨진 경우만
 * 오류(MDM026)다.
 *
 * <p>세트의 입력·최종 결과는 {@link RuleSetInterface#of}(앞 룰 결과 이름 제외·{@code CATCH_*} 제외)가 정하고, IF 갈래 조건식이 읽는 변수 중 앞
 * 결과가 만들지 않은 이름은 입력에 더한다. 실행은 {@link RuleSetRunner.Session#traceDefinition} 의 기록({@link RunTrace})으로 한다.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — OASIS 파라미터 이름 바인딩이 깨진다(읽기만 한다).
 */
@Service("ruleCalcService")
public class RuleCalcService {

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
    // action: io — 입력·출력 모양 조회(판정 시각은 지금)
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
    // action: run — 계산
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
        Map<String, Object> values = valuesOf(request);

        // 입력 검사 — 키 없음·null·빈 글자는 엔진을 부르지 않고 돌려준다. 이름은 io 가 알려 준 표기 그대로 찾는다.
        Map<String, Object> record = new LinkedHashMap<>();
        List<RuleCalcMessage> problems = new ArrayList<>();
        for (RuleCalcIoResult.Item in : s.inputs()) {
            Object raw = values.get(in.getName());
            if (raw == null || raw instanceof CharSequence cs && cs.toString().isBlank()) {
                problems.add(new RuleCalcMessage(RuleCalcMessage.INPUT_MISSING, "입력 " + in.getName() + " 값이 비어 있습니다. "
                        + in.getName() + " 값을 넣으세요."));
                continue;
            }
            try {
                record.put(in.getName(), toInput(raw, in.getDataType()));
            } catch (IllegalArgumentException e) {
                problems.add(new RuleCalcMessage(RuleCalcMessage.INPUT_INVALID, "입력 " + in.getName() + " 에는 " + typeText(in.getDataType())
                        + " 값이 와야 합니다(지금 값: '" + raw + "'). " + typeText(in.getDataType()) + " 값으로 고치세요."));
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
        collectSteps(trace, out.getSteps(), executed);
        List<Violation> violations = trace.violations();
        if (violations == null || violations.isEmpty()) {
            out.setOk(true);
            Set<String> inputKeys = new HashSet<>(record.keySet());
            trace.finalValues().forEach((k, v) -> {
                if (!inputKeys.contains(k)) {
                    out.getResult().put(k, format(v));
                }
            });
        } else {
            for (Violation v : violations) {
                out.getMessages().add(violationMessage(v));
            }
        }
        out.getMessages().addAll(deprecated(executed.stream().distinct().toList(), session));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // 대상 → 입출력 모양
    // ────────────────────────────────────────────────────────────────

    private record Target(String tp, String id) {
    }

    /** 입출력 모양 계산 결과. {@code ok=false} 면 {@code flow} 는 null 이고 {@code messages} 에 사유가 있다. */
    private record Shape(boolean ok, RuleCalcIoResult.Target target, List<RuleCalcIoResult.Item> inputs, List<RuleCalcIoResult.Item> outputs,
                         List<RuleCalcIoResult.Step> steps, List<RuleCalcMessage> messages, FlowDefinition flow, List<String> ruleIds) {

        static Shape fail(RuleCalcIoResult.Target target, String code, String text) {
            return new Shape(false, target, List.of(), List.of(), List.of(), List.of(new RuleCalcMessage(code, text)), null, List.of());
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
     * 입력 값 — {@code values}(객체)가 있으면 그것, 없으면 {@code valuesJson}(JSON 객체 글자, 소수는 BigDecimal). 둘 다 없으면 빈 맵(필수 입력은
     * INPUT_MISSING). {@code valuesJson} 이 JSON 객체가 아니면 INVALID_VALUE.
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
            throw new BusinessException(ErrorCode.INVALID_VALUE, "입력 값(valuesJson) 은 {\"이름\": 값} 모양의 JSON 객체여야 합니다.");
        }
        return parsed;
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
        List<RuleCalcIoResult.Item> inputs = items(io.conds(), units, true);
        List<RuleCalcIoResult.Item> outputs = items(io.results(), units, false);
        return new Shape(true, head, inputs, outputs, List.of(), List.of(), FlowParser.linear(List.of(id)), List.of(id));
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
        Units units = new Units(scope, queries.varsOf(vers));

        SetCallIo sio = RuleSetInterface.of(id, set.get().getMaruRuleSetName(), true, status, flow, rules, calls);
        List<RuleCalcIoResult.Item> inputs = items(sio.inputs(), units, true);
        List<RuleCalcIoResult.Item> outputs = new ArrayList<>();
        for (SetCallIo.OutputName o : sio.outputs()) {
            outputs.add(item(o.name(), labelOfResult(o.name(), ruleIds, rules), o.dataType(), o.scale(), units.unit(o.name()), false));
        }
        addConditionInputs(flow, sio, rules, calls, id, scope, inputs);

        List<RuleCalcIoResult.Step> steps = new ArrayList<>();
        for (String r : ruleIds) {
            RuleIo io = rules.get(r);
            RuleCalcIoResult.Step st = new RuleCalcIoResult.Step();
            st.setRuleId(r);
            st.setName(io.ruleName());
            st.setOutputs(items(io.results(), units, false));
            steps.add(st);
        }
        return new Shape(true, head, inputs, outputs, steps, List.of(), flow, ruleIds);
    }

    /**
     * IF 갈래 조건식이 읽는 변수 가운데 앞 결과가 만들지 않은 이름을 입력에 더한다(문서 §2.1). EVAL_TS·{@code _} 접두는
     * {@link RuleIoReader#condIo} 가 이미 뺐고, {@code CATCH_*} 는 뺀다. 이미 입력이거나 어느 룰·하위 세트가 만드는 이름이면 더하지 않는다.
     */
    private void addConditionInputs(FlowDefinition flow, SetCallIo sio, Map<String, RuleIo> rules, Map<String, SetCallIo> calls, String setId,
                                    RuleVarTypeResolver.Scope scope, List<RuleCalcIoResult.Item> inputs) {
        boolean hasIf = flow.nodes().stream().anyMatch(n -> n.kind() == NodeKind.IF);
        if (!hasIf) {
            return;
        }
        Set<String> known = new HashSet<>();
        inputs.forEach(i -> known.add(upper(i.getName())));
        rules.values().forEach(io -> io.results().forEach(r -> known.add(upper(r.name()))));
        calls.values().forEach(c -> c.outputs().forEach(o -> known.add(upper(o.name()))));
        int seq = 0;
        for (CondIo c : ioReader.condIo(flow, scope).values()) {
            if (!c.ok()) {
                continue;
            }
            for (IoName v : c.vars()) {
                String key = upper(v.name());
                if (ReservedNames.CATCH_NAMES.contains(key) || !known.add(key)) {
                    continue;
                }
                MdmRuleVar probe = new MdmRuleVar(setId, BigDecimal.ONE.setScale(3), -(++seq), "COND", seq);
                probe.setVarName(v.name());
                ResolvedVar r = scope.resolve(setId, BigDecimal.ONE.setScale(3), List.of(probe)).get(0);
                inputs.add(item(v.name(), r.label(), r.dataType(), r.scale(), unitOfDomain(r.domainId(), scope, v.name()), true));
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

    /** 요청 값 → 엔진 입력. NUMBER 는 BigDecimal(double 을 거치지 않는다), BOOLEAN 은 불린, 그 밖은 글자. 못 바꾸면 {@link IllegalArgumentException}. */
    static Object toInput(Object raw, String dataType) {
        String type = dataType == null ? "STRING" : dataType;
        switch (type) {
            case "NUMBER":
                if (raw instanceof BigDecimal d) {
                    return d;
                }
                if (raw instanceof Integer || raw instanceof Long || raw instanceof Short || raw instanceof Byte) {
                    return BigDecimal.valueOf(((Number) raw).longValue());
                }
                if (raw instanceof Double || raw instanceof Float) {
                    double d = ((Number) raw).doubleValue();
                    if (Double.isNaN(d) || Double.isInfinite(d)) {
                        throw new IllegalArgumentException("숫자가 아닙니다");
                    }
                    return new BigDecimal(raw.toString());      // 최단 표기(0.1 → 0.1). new BigDecimal(double) 은 쓰지 않는다
                }
                if (raw instanceof Number n) {
                    return new BigDecimal(n.toString());
                }
                if (raw instanceof CharSequence s) {
                    try {
                        return new BigDecimal(s.toString().trim());
                    } catch (NumberFormatException e) {
                        throw new IllegalArgumentException("숫자가 아닙니다", e);
                    }
                }
                throw new IllegalArgumentException("숫자가 아닙니다");
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
                return raw instanceof BigDecimal d ? d.toPlainString() : raw.toString();
        }
    }

    private static String typeText(String dataType) {
        return switch (dataType == null ? "" : dataType) {
            case "NUMBER" -> "숫자";
            case "BOOLEAN" -> "참/거짓(TRUE·FALSE)";
            default -> "문자";
        };
    }

    /** 엔진 값 → 응답 값. BigDecimal 은 반올림 없이 {@code toPlainString}, 불린·글자는 그대로, null 은 null, 목록은 원소마다. */
    static Object format(Object v) {
        if (v == null || v instanceof Boolean || v instanceof String) {
            return v;
        }
        if (v instanceof BigDecimal d) {
            return d.toPlainString();
        }
        if (v instanceof List<?> list) {
            List<Object> out = new ArrayList<>(list.size());
            list.forEach(e -> out.add(format(e)));
            return out;
        }
        if (v instanceof Number n) {
            return new BigDecimal(n.toString()).toPlainString();
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

    /** 실행한 룰 노드(OK 만, 받는 노드로 넘긴 CAUGHT 는 제외)를 실행 순서로 담는다. SET 노드는 하위 기록을 펼친다. */
    private static void collectSteps(RunTrace trace, List<RuleCalcRunResult.Step> out, List<String> ruleIds) {
        for (NodeTrace n : trace.nodes()) {
            if (n.kind() == NodeKind.RULE && n.status() == NodeStatus.OK && n.result() != null) {
                RuleCalcRunResult.Step st = new RuleCalcRunResult.Step();
                st.setRuleId(n.ruleId());
                st.setInputs(formatAll(n.reads()));
                st.setOutputs(formatAll(n.result().results()));
                st.setHit(n.result().hits() != null && !n.result().hits().isEmpty());
                st.setDefaultApplied(n.result().defaultApplied());
                out.add(st);
                ruleIds.add(n.ruleId());
            } else if (n.kind() == NodeKind.SET && n.sub() != null) {
                collectSteps(n.sub(), out, ruleIds);
            }
        }
    }

    /** 위반 한 건 → 메시지. 입력 타입 변환 실패는 INPUT_INVALID, 입력 키·NULL 은 INPUT_MISSING, 그 밖은 EVAL_ERROR. */
    private static RuleCalcMessage violationMessage(Violation v) {
        String text = (v.ruleId() == null ? "" : "[" + v.ruleId() + "] ")
                + RuleErrorText.describe(v.stage().name(), v.code().name(), v.rowId(), v.name(), v.message());
        String code = v.code() == Code.TYPE_CONVERSION ? RuleCalcMessage.INPUT_INVALID
                : v.code() == Code.MISSING_KEY || v.code() == Code.REQUIRED_NULL ? RuleCalcMessage.INPUT_MISSING
                : RuleCalcMessage.EVAL_ERROR;
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
