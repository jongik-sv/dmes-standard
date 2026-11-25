package com.dongkuk.dmes.mqc.qcd.rule.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.mdm.MdmUnavailableException;
import com.dongkuk.dmes.cactus.mdm.MdmVersions;
import com.dongkuk.dmes.mqc.qcd.rule.domain.QcdRuleGateway;
import com.dongkuk.dmes.mqc.qcd.rule.dto.QcdCodeSearchRequest;
import com.dongkuk.dmes.mqc.qcd.rule.dto.QcdRuleHistoryRequest;
import com.dongkuk.dmes.mqc.qcd.rule.dto.QcdRuleJudgeRequest;
import com.dongkuk.dmes.mqc.qcd.rule.dto.QcdRuleSearchRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.rule.CellSummary;
import kr.dongkuk.maru.mdm.engine.rule.RuleResult;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;
import org.springframework.stereotype.Service;

/**
 * 품질설계 기준 공용 서비스(OASIS qcdRule) — Maru 룰 정의 조회(search)·판정(judge)·버전 이력(history)·코드 항목(codes).
 * 룰 원본은 Maru(MDM)이고 이 서비스는 읽기와 평가만 한다. 화면마다 쓰는 룰 ID·코드 ID 는 화면이 정한다.
 * 진입 빈이라 @Transactional 을 두지 않는다(02-structure-naming-constraints §6-B-1).
 */
@Service("qcdRule")
public class QcdRuleService {

    static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    static final ZoneId KST = ZoneId.of("Asia/Seoul");
    static final String MDM_UNAVAILABLE = "MDM 에서 기준 정의를 받을 수 없습니다";
    static final int MAX_IDS = 40;

    private final QcdRuleGateway gateway;
    private final ObjectMapper json = new ObjectMapper();

    public QcdRuleService(QcdRuleGateway gateway) {
        this.gateway = gateway;
    }

    /** 평가 시각에 RELEASED 인 룰 정의 여러 개. 정의가 없는 룰은 vars·rows 가 빈 줄로 둔다. */
    public Map<String, Object> search(QcdRuleSearchRequest req) {
        Instant evalTs = parseEvalTs(req.getEvalTs());
        List<Map<String, Object>> rules = new ArrayList<>();
        for (String id : ids(req.getRuleIds(), "ruleIds")) {
            Optional<RuleDefinition> def;
            try { def = gateway.rule(id, evalTs); }
            catch (MdmUnavailableException e) { throw mdmUnavailable(); }
            rules.add(def.map(QcdRuleService::ruleView).orElseGet(() -> emptyRuleView(id)));
        }
        return Map.of("rules", rules);
    }

    /** 룰 하나의 RELEASED 버전 이력(ver 오름차순)과 버전별 행 요약. */
    public Map<String, Object> history(QcdRuleHistoryRequest req) {
        String ruleId = required(req.getRuleId(), "ruleId");
        List<Map<String, Object>> versions = new ArrayList<>();
        try {
            for (QcdRuleGateway.RuleVersion v : gateway.versions(ruleId)) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("ver", v.ver());
                m.put("applyFrom", v.applyFrom() == null ? null : TS.format(v.applyFrom()));
                m.put("applyTo", v.applyTo() == null ? null : TS.format(v.applyTo()));
                Optional<RuleDefinition> d = gateway.ruleAt(ruleId, v.ver());
                m.put("vars", d.map(QcdRuleService::varViews).orElse(List.of()));
                m.put("rows", d.map(QcdRuleService::rowViews).orElse(List.of()));
                versions.add(m);
            }
        } catch (MdmUnavailableException e) {
            throw mdmUnavailable();
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ruleId", ruleId);
        out.put("versions", versions);
        return out;
    }

    /**
     * 판정. 입력은 변수명→값 JSON 객체다. 정의(변수·입력 계약)가 숫자로 선언한 변수만 숫자로 바꾸고 나머지는 가공하지 않는다.
     * status: MATCHED(적중 또는 기본 행) / NO_MATCH / INPUT_ERROR / RULE_NOT_FOUND / UNAVAILABLE.
     */
    public Map<String, Object> judge(QcdRuleJudgeRequest req) {
        String ruleId = required(req.getRuleId(), "ruleId");
        Instant evalTs = parseEvalTs(req.getEvalTs());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ruleId", ruleId);
        out.put("evalTs", TS.format(LocalDateTime.ofInstant(evalTs, KST)));

        Map<String, Object> raw;
        try {
            raw = req.getInputJson() == null || req.getInputJson().isBlank() ? Map.of()
                    : json.readValue(req.getInputJson(), new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (JsonProcessingException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "입력 형식이 올바르지 않습니다");
        }

        RuleDefinition def;
        try {
            Optional<RuleDefinition> found = gateway.rule(ruleId, evalTs);
            if (found.isEmpty()) return fail(out, "RULE_NOT_FOUND", "평가 시각에 적용 중인 룰 버전이 없습니다");
            def = found.get();
        } catch (MdmUnavailableException e) {
            return fail(out, "UNAVAILABLE", MDM_UNAVAILABLE);
        }

        // 엔진은 조건 변수 키가 모두 있어야 판정한다(없으면 MISSING_KEY). 빈 값은 null 로 넘겨야 IS_NULL·NOT_NULL 이 뜻대로 맞는다.
        // 그래서 입력에 없는 조건 변수는 null 로 채우고, null·빈 숫자도 null 로 둔다. 문자열 빈 값("")은 가공하지 않는다.
        Map<String, DataType> types = inputTypes(def);
        Map<String, Object> record = new LinkedHashMap<>();
        for (RuleVar v : def.vars()) {
            if (v.varKind() == VarKind.COND && v.varName() != null) record.put(v.varName(), null);
        }
        if (def.contract() != null) {
            for (VarType t : def.contract().always()) record.putIfAbsent(t.name(), null);
        }
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            Object v = e.getValue();
            if (v == null) { record.put(e.getKey(), null); continue; }
            String text = String.valueOf(v);
            if (types.get(e.getKey()) == DataType.NUMBER) {
                if (text.isBlank()) { record.put(e.getKey(), null); continue; }
                try { record.put(e.getKey(), new BigDecimal(text.trim())); }
                catch (NumberFormatException ex) { return fail(out, "INPUT_ERROR", e.getKey() + " 값이 숫자가 아닙니다: " + text); }
            } else {
                record.put(e.getKey(), text);
            }
        }

        RuleResult result;
        try {
            result = gateway.engine().evaluate(ruleId, record, evalTs);
        } catch (MdmUnavailableException e) {
            return fail(out, "UNAVAILABLE", MDM_UNAVAILABLE);
        } catch (EngineEvaluationException e) {
            return fail(out, "INPUT_ERROR", "입력값이 룰 입력 조건에 맞지 않습니다: " + e.violations().size() + "건");
        }
        out.put("ver", MdmVersions.key(result.ver()));

        Map<Integer, String> varName = new HashMap<>();
        for (RuleVar v : def.vars()) varName.put(v.varId(), v.varName());
        List<Map<String, Object>> trace = new ArrayList<>();
        for (RuleResult.RowTrace t : result.trace()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("rowId", t.rowId()); row.put("seq", t.seq()); row.put("evaluated", t.evaluated()); row.put("hit", t.hit());
            row.put("firstFalseVar", t.firstFalseVarId() == null ? null : varName.get(t.firstFalseVarId()));
            trace.add(row);
        }
        out.put("trace", trace);
        out.put("results", plain(result.results()));
        out.put("defaultApplied", result.defaultApplied());

        List<Map<String, Object>> hits = new ArrayList<>();
        if (result.defaultApplied()) {
            def.rows().stream().filter(r -> r.rowKind() == RowKind.DEFAULT).findFirst()
                    .ifPresent(r -> hits.add(Map.of("rowId", r.rowId(), "seq", r.seq())));
        } else {
            for (RuleResult.Hit h : result.hits()) hits.add(Map.of("rowId", h.rowId(), "seq", h.seq()));
        }
        out.put("hits", hits);
        if (hits.isEmpty() && !result.defaultApplied()) {
            out.put("status", "NO_MATCH");
            out.put("message", "조건에 맞는 행이 없습니다");
        } else {
            out.put("status", "MATCHED");
            out.put("message", result.defaultApplied() ? "기본 행이 적용됐습니다" : null);
        }
        return out;
    }

    /** 마루 코드 여러 개의 현재 RELEASED 버전 항목. 코드가 없거나 RELEASED 버전이 없으면 items 가 빈 줄이다. */
    public Map<String, Object> codes(QcdCodeSearchRequest req) {
        List<Map<String, Object>> codes = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now(KST);
        for (String id : ids(req.getCodeIds(), "codeIds")) {
            Optional<CodeRows> rows;
            try { rows = gateway.code(id); }
            catch (MdmUnavailableException e) { throw mdmUnavailable(); }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("codeId", id);
            Optional<CodeVersionRow> ver = rows.flatMap(r -> r.versions().stream()
                    .filter(v -> "RELEASED".equals(v.status()))
                    .filter(v -> v.applyFrom() == null || !now.isBefore(v.applyFrom()))
                    .max(Comparator.comparing(CodeVersionRow::ver)));
            m.put("ver", ver.map(v -> MdmVersions.key(v.ver())).orElse(null));
            List<Map<String, Object>> items = new ArrayList<>();
            Optional<CodeRows> body;
            try { body = ver.isPresent() ? gateway.codeAt(id, ver.get().ver()) : Optional.empty(); }
            catch (MdmUnavailableException e) { throw mdmUnavailable(); }
            if (body.isPresent()) {
                BigDecimal v = ver.get().ver();
                body.get().items().stream()
                        .filter(i -> i.fromVer().compareTo(v) <= 0 && v.compareTo(i.toVer()) < 0)
                        .sorted(Comparator.comparing((CodeItemRow i) -> i.seq() == null ? Integer.MAX_VALUE : i.seq())
                                .thenComparing(CodeItemRow::code))
                        .forEach(i -> {
                            Map<String, Object> im = new LinkedHashMap<>();
                            im.put("code", i.code()); im.put("name", i.name()); im.put("alterName", i.alterName());
                            im.put("seq", i.seq()); im.put("lvl", i.lvl()); im.put("attrs", i.attrs());
                            items.add(im);
                        });
            }
            m.put("items", items);
            codes.add(m);
        }
        return Map.of("codes", codes);
    }

    // ── 보기 모양 ──────────────────────────────────────────────

    private static Map<String, Object> ruleView(RuleDefinition d) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ruleId", d.ruleId()); m.put("ver", MdmVersions.key(d.ver()));
        m.put("applyFrom", d.applyFrom() == null ? null : TS.format(d.applyFrom()));
        m.put("hitPolicy", d.hitPolicy() == null ? null : d.hitPolicy().name());
        m.put("vars", varViews(d));
        m.put("rows", rowViews(d));
        return m;
    }

    private static Map<String, Object> emptyRuleView(String ruleId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ruleId", ruleId); m.put("ver", null); m.put("applyFrom", null); m.put("hitPolicy", null);
        m.put("vars", List.of()); m.put("rows", List.of());
        return m;
    }

    private static List<Map<String, Object>> varViews(RuleDefinition d) {
        List<Map<String, Object>> vars = new ArrayList<>();
        for (RuleVar v : d.vars()) {
            Map<String, Object> vm = new LinkedHashMap<>();
            vm.put("varId", v.varId()); vm.put("kind", v.varKind().name()); vm.put("name", v.varName());
            vm.put("dataType", v.dataType() == null ? null : v.dataType().name());
            vm.put("dispType", v.dispType() == null ? null : v.dispType().name()); vm.put("seq", v.seq());
            vars.add(vm);
        }
        vars.sort(Comparator.comparing((Map<String, Object> x) -> "COND".equals(x.get("kind")) ? 0 : 1)
                .thenComparing(x -> (Integer) x.get("seq")));
        return vars;
    }

    /** 행마다 셀(저장 모양 + 엔진 요약), 조건 열 요약을 열 seq 순으로 이은 summary, 결과 변수명→값. */
    private static List<Map<String, Object>> rowViews(RuleDefinition d) {
        Map<Integer, RuleVar> varById = new HashMap<>();
        for (RuleVar v : d.vars()) varById.put(v.varId(), v);
        List<RuleVar> condVars = d.vars().stream().filter(v -> v.varKind() == VarKind.COND)
                .sorted(Comparator.comparingInt(RuleVar::seq)).toList();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (RuleRow r : d.rows()) {
            Map<String, Object> rm = new LinkedHashMap<>();
            rm.put("rowId", r.rowId()); rm.put("seq", r.seq()); rm.put("rowKind", r.rowKind().name());
            Map<String, Map<String, Object>> cells = new LinkedHashMap<>();
            Map<String, Object> results = new LinkedHashMap<>();
            for (Map.Entry<Integer, RuleCell> e : r.cells().entrySet()) {
                RuleVar v = varById.get(e.getKey());
                RuleCell c = e.getValue();
                Map<String, Object> cm = new LinkedHashMap<>();
                if (c.op() != null) cm.put("op", c.op());
                if (c.left() != null) cm.put("left", c.left());
                if (c.right() != null) cm.put("right", c.right());
                if (c.list() != null) cm.put("list", c.list());
                if (c.expr() != null) cm.put("expr", c.expr());
                if (c.val() != null) cm.put("val", c.val());
                cm.put("summary", v == null ? null : CellSummary.of(v, c));
                cells.put(String.valueOf(e.getKey()), cm);
                if (v != null && v.varKind() == VarKind.RESULT && v.varName() != null) results.put(v.varName(), numText(c.val()));
            }
            List<String> condSummaries = new ArrayList<>();
            for (RuleVar cv : condVars) {
                RuleCell c = r.cells().get(cv.varId());
                condSummaries.add(c == null ? "-" : CellSummary.of(cv, c));
            }
            rm.put("cells", cells);
            rm.put("summary", String.join(" · ", condSummaries));
            rm.put("results", results);
            rows.add(rm);
        }
        return rows;
    }

    /** 입력 계약·조건 변수에서 이름→타입. 판정 입력의 숫자 변환에 쓴다. */
    private static Map<String, DataType> inputTypes(RuleDefinition d) {
        Map<String, DataType> types = new HashMap<>();
        for (RuleVar v : d.vars()) if (v.varName() != null && v.dataType() != null) types.put(v.varName(), v.dataType());
        if (d.contract() != null) {
            List<VarType> all = new ArrayList<>(d.contract().always());
            d.contract().rows().forEach(r -> { all.addAll(r.required()); all.addAll(r.optional()); });
            for (VarType t : all) if (t.dataType() != null) types.putIfAbsent(t.name(), t.dataType());
        }
        return types;
    }

    private static Map<String, Object> plain(Map<String, Object> results) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (results == null) return out;
        results.forEach((k, v) -> out.put(k, v instanceof BigDecimal b ? b.stripTrailingZeros().toPlainString() : v));
        return out;
    }

    /** 결과 val(저장 문자열) → 끝 0 을 뗀 숫자 문자열. 숫자가 아니면 그대로. */
    private static String numText(String v) {
        if (v == null || v.isBlank()) return v;
        try { return new BigDecimal(v.trim()).stripTrailingZeros().toPlainString(); }
        catch (NumberFormatException e) { return v; }
    }

    private static Map<String, Object> fail(Map<String, Object> out, String status, String message) {
        out.putIfAbsent("ver", null);
        out.put("status", status); out.put("message", message);
        out.put("hits", List.of()); out.put("results", Map.of()); out.put("trace", List.of()); out.put("defaultApplied", false);
        return out;
    }

    private static List<String> ids(String text, String name) {
        List<String> ids = Arrays.stream(required(text, name).split(",")).map(String::trim).filter(s -> !s.isEmpty()).distinct().toList();
        if (ids.size() > MAX_IDS) throw new BusinessException(ErrorCode.INVALID_VALUE, name + " 는 " + MAX_IDS + "개까지 받습니다");
        return ids;
    }

    private static String required(String v, String name) {
        if (v == null || v.isBlank()) throw new BusinessException(ErrorCode.REQUIRED_VALUE, name + " 값이 없습니다");
        return v.trim();
    }

    private static BusinessException mdmUnavailable() {
        return new BusinessException(ErrorCode.BUSINESS_ERROR, MDM_UNAVAILABLE);
    }

    static Instant parseEvalTs(String s) {
        if (s == null || s.isBlank()) return Instant.now();
        try { return LocalDateTime.parse(s.trim(), TS).atZone(KST).toInstant(); }
        catch (DateTimeParseException e) { throw new BusinessException(ErrorCode.INVALID_VALUE, "평가 시각 형식은 yyyy-MM-dd HH:mm:ss 입니다: " + s); }
    }
}
