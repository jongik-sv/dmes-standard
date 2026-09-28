package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import static com.dongkuk.dmes.mdm.common.rule.RuleCaseJudge.evaluate;
import static com.dongkuk.dmes.mdm.common.rule.RuleCaseJudge.object;
import static com.dongkuk.dmes.mdm.common.rule.RuleCaseJudge.results;
import static com.dongkuk.dmes.mdm.common.rule.RuleCaseJudge.runCase;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditSupport.requireVer;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleCaseJudge.Evaluated;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleTestCaseQueries;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput.DraftRow;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleLimits;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveValidator;
import com.dongkuk.dmes.mdm.common.rule.definition.RuleDefinitionAssembler;
import com.dongkuk.dmes.mdm.common.rule.definition.RuleDefinitionAssembler.Assembled;
import com.dongkuk.dmes.mdm.common.rule.definition.SingleRuleDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions.Stored;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleTestRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleTestResult;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleTestCase;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import kr.dongkuk.maru.mdm.engine.rule.RuleResult;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;
import org.springframework.stereotype.Service;

/**
 * 값 테스트(action execute, TSK-08-04 design §6.5). 정의는 저장된 버전(VERSION — 원장 읽기, DRAFT 포함, 누구나) 또는 요청 본문(BODY — 편집
 * 중인 행·적중 정책 + 그 버전의 저장된 변수, D4)이고, {@code MdmRuleEngine} 에 요청마다 만든 {@link SingleRuleDefinitionLookup} 을 넣어
 * 운영 판정과 같은 엔진 경로로 판정한다(I20). <b>원장에 한 줄도 쓰지 않는다</b>(I19) — 쓰기 트랜잭션·발급기·{@code beginDraftWrite} 를 부르지
 * 않는다.
 *
 * <p>BODY 행은 표 저장과 같은 모양 검사를 받고 저장 시 검사기(적용 지점 TEST_BODY — 셀·식·생성)를 거친다. 깨진 셀이 든 행은 판정에서 빼고
 * {@code cellErrors}·{@code skippedRows} 로 돌려준다. 셀이 없는 칸은 엔진대로 무관(NA, 결과면 NULL)으로 판정하고 {@code MISSING_CELL_AS_NA}
 * 경고를 붙인다(D5, I22). 상한(D6)은 {@link RuleLimits} 이고 넘으면 MDM021(I23). {@code runCases} 면 이 룰의 테스트 케이스를 같은 정의로
 * 돌려 결과 변수 타입으로 견준다(I24).
 */
@Service
public class RuleValueTestService {

    static final String BODY = "BODY";
    static final String VERSION = "VERSION";
    static final String MISSING_CELL_AS_NA = "MISSING_CELL_AS_NA";

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final RuleEditSupport support;
    private final RuleQueries queries;
    private final StoredRuleDefinitions stored;
    private final RuleSaveValidator validator;
    private final RuleTestCaseQueries caseQueries;
    private final MdmEvaluator evaluator;
    private final Clock clock;

    public RuleValueTestService(RuleEditSupport support, RuleQueries queries, StoredRuleDefinitions stored, RuleSaveValidator validator,
                                RuleTestCaseQueries caseQueries, MdmEvaluator evaluator, Clock clock) {
        this.support = support;
        this.queries = queries;
        this.stored = stored;
        this.validator = validator;
        this.caseQueries = caseQueries;
        this.evaluator = evaluator;
        this.clock = clock;
    }

    public RuleTestResult run(RuleTestRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        String id = rule.getMaruRuleId();
        String target = target(request.getTarget());
        int ver = requireVer(request.getVer());
        boolean body = BODY.equals(target);
        List<Map<String, Object>> requested = body && request.getRows() != null ? request.getRows() : List.of();
        rowLimits(requested);
        Map<String, Object> input = input(request.getInputJson());
        Stored s = stored.read(id, ver)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "룰 " + id + " 에 버전 " + ver + " 이(가) 없습니다."));

        List<Map<String, Object>> cellErrors = new ArrayList<>();
        Set<Integer> skipped = new LinkedHashSet<>();
        String hit;
        List<DraftRow> rows;
        if (body) {
            hit = RuleTableService.hitPolicy(rule.getRuleKind(), request.getHitPolicy());
            Set<Integer> varIds = s.rawVars().stream().map(MdmRuleVar::getVarId).collect(Collectors.toSet());
            List<RuleTableService.RequestedRow> checked = RuleTableService.checkRows(rule, requested, varIds, new HashSet<>(queries.rowIds(id, ver)));
            RuleCheckReport report = validator.validate(new RuleCheckInput(id, ver, rule.getRuleKind(), hit, s.rawVars(), s.vars(),
                    RuleTableService.draftRows(checked), RuleSaveTarget.TEST_BODY));
            Set<Integer> broken = report.brokenRowIds();
            report.errors().forEach(issue -> cellErrors.add(cellError(issue)));
            skipped.addAll(broken);
            rows = report.normalizedRows().stream().filter(r -> !broken.contains(r.rowId())).toList();
        } else {
            hit = s.version().getHitPolicy();
            rows = s.rows();
        }
        Assembled assembled = RuleDefinitionAssembler.assemble(id, ver, rule.getRuleKind(), hit, s.version().getApplyFrom(),
                s.version().getApplyTo(), s.rawVars(), s.vars(), rows, stored.externalTypes(id, ver));
        assembled.failures().forEach(f -> cellErrors.add(cellError(f.rowId(), f.varId(), RuleSaveIssueCode.GENERATE_FAILED.name(), f.message())));
        skipped.addAll(assembled.skippedRows());
        RuleDefinition def = assembled.definition();
        Integer defaultRowId = def.rows().stream().filter(r -> r.rowKind() == RowKind.DEFAULT).map(RuleRow::rowId).findFirst().orElse(null);

        MdmRuleEngine engine = new MdmRuleEngine(evaluator, new SingleRuleDefinitionLookup(def));
        Instant ts = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        Evaluated e = evaluate(engine, id, input, ts);

        RuleTestResult out = new RuleTestResult();
        out.setTarget(target);
        out.setVer(ver);
        out.setEvalTs(LocalDateTime.ofInstant(ts, clock.getZone()).format(TS));
        out.setOutcome(e.ok() ? "OK" : "ERROR");
        List<Map<String, Object>> warnings = new ArrayList<>();
        if (e.ok()) {
            RuleResult r = e.result();
            out.setResults(results(r));
            out.setHits(r.hits().stream().map(RuleValueTestService::hit).toList());
            out.setDefaultApplied(r.defaultApplied());
            out.setTrace(r.trace().stream().map(RuleValueTestService::trace).toList());
            r.warnings().forEach(w -> warnings.add(warning(w)));
        } else {
            out.setErrors(e.errors());
        }
        warnings.addAll(missingCells(def, s.vars()));
        out.setWarnings(warnings);
        out.setCellErrors(cellErrors);
        out.setSkippedRows(List.copyOf(skipped));
        out.setContract(contract(def));
        if (Boolean.TRUE.equals(request.getRunCases())) {
            // caseIds 가 있으면 그 케이스들만 — 카드 ⑥ "실행". 판정은 runCase 가
            // 그대로 하므로 "모두 실행" 과 기대값 비교 기준이 같다(I24).
            List<Integer> only = request.caseIdList();
            List<MdmRuleTestCase> picked = only.isEmpty()
                    ? caseQueries.cases(id)
                    : caseQueries.cases(id).stream().filter(c -> only.contains(c.getCaseId())).toList();
            out.setCases(picked.stream().map(c -> runCase(engine, id, c, ts, defaultRowId)).toList());
        }
        return out;
    }

    // ------------------------------------------------------------------ 요청 검사·상한(D6, I23)

    private static String target(String raw) {
        String t = raw == null ? null : raw.trim();
        if (!BODY.equals(t) && !VERSION.equals(t)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "값 테스트 대상은 BODY·VERSION 중 하나여야 합니다: " + raw);
        }
        return t;
    }

    /** 본문 행 수, 행마다 {@code cells} 문자열 길이, 그 합. 같으면 통과, 넘으면 MDM021. */
    private static void rowLimits(List<Map<String, Object>> rows) {
        if (rows.size() > RuleLimits.MAX_ROWS) {
            throw limit("행이 " + rows.size() + "개다. 한 번에 " + RuleLimits.MAX_ROWS + "개까지 돌린다");
        }
        long total = 0;
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> r = rows.get(i);
            int length = r != null && r.get("cells") instanceof String cells ? cells.length() : 0;
            if (length > RuleLimits.MAX_ROW_CELLS_CHARS) {
                throw limit((i + 1) + "번째 행의 셀 JSON 이 " + length + "자다. 행마다 " + RuleLimits.MAX_ROW_CELLS_CHARS + "자까지 받는다");
            }
            total += length;
        }
        if (total > RuleLimits.MAX_TOTAL_CELLS_CHARS) {
            throw limit("셀 JSON 이 모두 " + total + "자다. 한 번에 " + RuleLimits.MAX_TOTAL_CELLS_CHARS + "자까지 받는다");
        }
    }

    /** 입력 JSON — 길이·객체·키 수. 키 없음과 null 을 그대로 둔다(I21). 숫자는 BigDecimal 로 읽는다. */
    private static Map<String, Object> input(String json) {
        if (json == null || json.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "입력 JSON(inputJson)은 필수입니다.");
        }
        if (json.length() > RuleLimits.MAX_INPUT_JSON_CHARS) {
            throw limit("입력 JSON 이 " + json.length() + "자다. " + RuleLimits.MAX_INPUT_JSON_CHARS + "자까지 받는다");
        }
        Map<String, Object> input = object(json);
        if (input == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "입력 JSON 은 객체여야 합니다: " + json);
        }
        if (input.size() > RuleLimits.MAX_INPUT_KEYS) {
            throw limit("입력 키가 " + input.size() + "개다. " + RuleLimits.MAX_INPUT_KEYS + "개까지 받는다");
        }
        return input;
    }

    private static BusinessException limit(String detail) {
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, "값 테스트 요청 상한 — " + detail, List.of());
    }

    // ------------------------------------------------------------------ 판정

    /** 셀이 없는 칸 — NORMAL 행의 조건 칸은 무관(NA), 결과 칸은 NULL 로 판정된다(엔진 동작). 경고만 붙인다(D5). */
    private static List<Map<String, Object>> missingCells(RuleDefinition def, List<ResolvedVar> vars) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (RuleRow row : def.rows()) {
            for (ResolvedVar v : vars) {
                boolean cond = "COND".equals(v.varKind());
                if (row.cells().containsKey(v.varId()) || (cond && row.rowKind() != RowKind.NORMAL)) {
                    continue;
                }
                out.add(warning(MISSING_CELL_AS_NA, row.rowId(), v.varId(), RuleCheckReport.where(row.rowId(), v)
                        + (cond ? ": 셀이 없어 무관(NA)으로 판정했다" : ": 결과 셀이 없어 NULL 로 냈다")));
            }
        }
        return out;
    }

    // ------------------------------------------------------------------ 응답 모양

    private static Map<String, Object> hit(RuleResult.Hit h) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowId", h.rowId());
        m.put("seq", h.seq());
        m.put("groupChoices", h.groupChoices());
        return m;
    }

    private static Map<String, Object> trace(RuleResult.RowTrace t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowId", t.rowId());
        m.put("seq", t.seq());
        m.put("evaluated", t.evaluated());
        m.put("hit", t.hit());
        m.put("firstFalseVarId", t.firstFalseVarId());
        return m;
    }

    private static Map<String, Object> warning(EngineWarning w) {
        return warning(w.code().name(), w.rowId(), w.varId(), w.message());
    }

    private static Map<String, Object> warning(String code, Integer rowId, Integer varId, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", code);
        m.put("rowId", rowId);
        m.put("varId", varId);
        m.put("message", message);
        return m;
    }

    private static Map<String, Object> cellError(Map<String, Object> issue) {
        Integer rowId = issue.get("rowIds") instanceof List<?> ids && !ids.isEmpty() ? (Integer) ids.get(0) : null;
        return cellError(rowId, (Integer) issue.get("varId"), String.valueOf(issue.get("code")), String.valueOf(issue.get("message")));
    }

    private static Map<String, Object> cellError(Integer rowId, Integer varId, String code, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowId", rowId);
        m.put("varId", varId);
        m.put("code", code);
        m.put("message", message);
        return m;
    }

    private static Map<String, Object> contract(RuleDefinition def) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("always", names(def.contract().always()));
        List<Map<String, Object>> rows = new ArrayList<>();
        for (RowContract rc : def.contract().rows()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("rowId", rc.rowId());
            r.put("required", names(rc.required()));
            r.put("optional", names(rc.optional()));
            rows.add(r);
        }
        m.put("rows", rows);
        return m;
    }

    private static List<String> names(List<VarType> types) {
        return types.stream().map(VarType::name).toList();
    }
}
