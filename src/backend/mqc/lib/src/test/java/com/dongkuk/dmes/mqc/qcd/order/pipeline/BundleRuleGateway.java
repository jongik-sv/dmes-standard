package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import com.dongkuk.dmes.cactus.mdm.MdmUnavailableException;
import com.dongkuk.dmes.mqc.qcd.rule.domain.QcdRuleGateway;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.CellTextGenerator;
import kr.dongkuk.maru.mdm.engine.rule.InputContracts;
import kr.dongkuk.maru.mdm.engine.rule.MdmRuleEngine;
import kr.dongkuk.maru.mdm.engine.rule.RuleEngine;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;

/**
 * 시험용 게이트웨이 — 저장소의 Maru 등록 묶음(scripts/mqc-demo/mdm/bundles/*.json, 데이터 담당이 Maru 에 올린 것과 같은 정본)을
 * 룰 정의·코드로 읽어 실제 Maru 엔진을 돌린다. drop() 으로 룰을 빼면 「기준 없음」, unavailable=true 면 MDM 응답 없음을 흉내 낸다.
 */
final class BundleRuleGateway implements QcdRuleGateway, DefinitionLookup, CodeLookup, CodeEffLookup {

    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private final Map<String, RuleDefinition> rules = new HashMap<>();
    private final Map<String, CodeRows> codes = new HashMap<>();
    private final Set<String> dropped = new HashSet<>();
    boolean unavailable;
    private final RuleEngine engine = new MdmRuleEngine(
            new MdmEvaluator(new EngineLookups(this, this, this, MasterLookup.NONE, FunctionProvider.NONE)), this);

    static Path bundles() {
        for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path p = dir.resolve("scripts/mqc-demo/mdm/bundles");
            if (Files.isDirectory(p)) return p;
        }
        throw new IllegalStateException("scripts/mqc-demo/mdm/bundles 를 찾지 못했다");
    }

    static BundleRuleGateway load() {
        BundleRuleGateway g = new BundleRuleGateway();
        ObjectMapper om = new ObjectMapper();
        try (Stream<Path> files = Files.list(bundles())) {
            for (Path f : files.filter(p -> p.toString().endsWith(".json")).toList()) {
                JsonNode root = om.readTree(f.toFile());
                if (f.getFileName().toString().equals("codes.json")) {
                    for (JsonNode c : root.path("codes")) g.codes.put(c.path("codeId").asText(), code(c));
                } else {
                    for (JsonNode r : root.path("rules")) g.rules.put(r.path("ruleId").asText(), rule(r));
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        return g;
    }

    BundleRuleGateway drop(String ruleId) {
        dropped.add(ruleId);
        return this;
    }

    private static RuleDefinition rule(JsonNode r) {
        HitPolicy hp = HitPolicy.valueOf(r.path("hitPolicy").asText());
        List<RuleVar> vars = new ArrayList<>();
        Map<String, Integer> ids = new LinkedHashMap<>();
        int id = 1, condSeq = 1, resSeq = 1;
        for (JsonNode c : r.path("columns")) {
            String name = c.path("varName").asText();
            VarKind kind = VarKind.valueOf(c.path("varKind").asText());
            DataType dt = DataType.valueOf(c.path("dataType").asText());
            String disp = c.path("dispType").asText();
            DispType dispType = kind == VarKind.RESULT ? DispType.VALUE : "2".equals(disp) ? DispType.TWO : DispType.ONE;
            vars.add(new RuleVar(id, kind, dispType, name, null, null, List.of(), dt, null, null,
                    kind == VarKind.RESULT && hp == HitPolicy.COLLECT ? CollectAgg.LIST : null, List.of(), null, null, null,
                    kind == VarKind.COND ? condSeq++ : resSeq++));
            ids.put(name, id++);
        }
        List<RuleRow> rows = new ArrayList<>();
        int seq = 1;
        for (JsonNode row : r.path("rows")) {
            Map<Integer, RuleCell> cells = new LinkedHashMap<>();
            row.path("cells").fields().forEachRemaining(e -> {
                Integer vid = ids.get(e.getKey());
                if (vid == null) return;
                JsonNode c = e.getValue();
                List<String> list = null;
                if (c.has("list")) {
                    list = new ArrayList<>();
                    for (JsonNode x : c.path("list")) list.add(x.asText());
                }
                cells.put(vid, new RuleCell(text(c, "op"), text(c, "left"), text(c, "right"), list, null, null, text(c, "val"), null));
            });
            rows.add(new RuleRow(100 + seq, seq, "DEFAULT".equals(row.path("rowKind").asText()) ? RowKind.DEFAULT : RowKind.NORMAL, cells));
            seq++;
        }
        Function<String, VarType> type = name -> vars.stream().filter(v -> name.equals(v.varName())).findFirst()
                .map(v -> new VarType(v.varName(), v.dataType(), null, null)).orElse(null);
        InputContract contract = InputContracts.compute(vars, rows, RuleKind.DECISION, type);
        LocalDateTime from = LocalDateTime.parse(r.path("applyFrom").asText("2020-01-01 00:00:00"), TS);
        return CellTextGenerator.withTexts(new RuleDefinition(r.path("ruleId").asText(), new BigDecimal("1.000"), RuleKind.DECISION, hp,
                from, null, "1", vars, contract, rows), d -> null);
    }

    private static CodeRows code(JsonNode c) {
        List<CodeItemRow> items = new ArrayList<>();
        for (JsonNode i : c.path("items")) {
            List<String> lvl = new ArrayList<>();
            for (JsonNode x : i.path("lvls")) lvl.add(x.asText());
            while (lvl.size() < 5) lvl.add(null);
            List<String> attrs = new ArrayList<>();
            for (JsonNode x : i.path("attrs")) attrs.add(x.isNull() ? null : x.asText());
            while (attrs.size() < 10) attrs.add(null);
            items.add(new CodeItemRow(i.path("code").asText(), new BigDecimal("1.000"), new BigDecimal("9999.999"), i.path("name").asText(),
                    null, i.path("seq").isMissingNode() ? null : i.path("seq").asInt(), lvl, attrs));
        }
        return new CodeRows(new CodeHeader(c.path("codeId").asText(), "INUSE"),
                List.of(new CodeVersionRow(new BigDecimal("1.000"), "RELEASED", LocalDateTime.of(2020, 1, 1, 0, 0), null)), items, List.of(), List.of());
    }

    private static String text(JsonNode c, String k) {
        return c.has(k) && !c.get(k).isNull() ? c.get(k).asText() : null;
    }

    @Override public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
        if (unavailable) throw new MdmUnavailableException("시험: MDM 응답 없음");
        if (dropped.contains(ruleId)) return Optional.empty();
        RuleDefinition d = rules.get(ruleId);
        if (d == null) return Optional.empty();
        LocalDateTime t = LocalDateTime.ofInstant(evalTs, ZoneId.of("Asia/Seoul"));
        return t.isBefore(d.applyFrom()) ? Optional.empty() : Optional.of(d);
    }
    @Override public List<RuleVersion> versions(String ruleId) { return List.of(); }
    @Override public Optional<RuleDefinition> ruleAt(String ruleId, String ver) { return Optional.ofNullable(rules.get(ruleId)); }
    @Override public RuleEngine engine() {
        if (unavailable) throw new MdmUnavailableException("시험: MDM 응답 없음");
        return engine;
    }
    @Override public Optional<CodeRows> code(String maruCodeId) {
        if (unavailable) throw new MdmUnavailableException("시험: MDM 응답 없음");
        return Optional.ofNullable(codes.get(maruCodeId));
    }
    @Override public Optional<CodeRows> codeAt(String maruCodeId, BigDecimal ver) { return code(maruCodeId); }
    @Override public Optional<ColumnDefinition> column(String table, String column) { return Optional.empty(); }
    @Override public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) { return Optional.empty(); }
    @Override public Optional<Set<String>> codes(String maruCodeId, BigDecimal ver, String cateId) { return Optional.empty(); }
}
