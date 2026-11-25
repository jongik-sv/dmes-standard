package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import com.dongkuk.dmes.cactus.mdm.MdmUnavailableException;
import com.dongkuk.dmes.cactus.mdm.MdmVersions;
import com.dongkuk.dmes.mqc.qcd.rule.domain.QcdRuleGateway;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
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
import org.springframework.stereotype.Component;

/**
 * 파이프라인이 Maru 룰을 부르는 입구. {@link QcdRuleGateway} 엔진을 직접 쓴다 — 조건 변수는 모두 키로 넣고(없으면 NULL),
 * NUMBER 변수만 숫자로 바꾼다(주문정합성처럼 IS_NULL 을 보는 룰 때문). 룰이 없거나 MDM 이 응답하지 않아도 예외를 던지지 않고
 * 상태(RULE_NOT_FOUND·UNAVAILABLE·INPUT_ERROR)를 담은 {@link RuleHit} 을 돌려준다(단계는 「기준 없음」으로 내려앉는다).
 * 한 번의 파이프라인 실행 동안 정의를 기억한다({@link #session()}).
 */
@Component
public class RuleCaller {

    static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private final QcdRuleGateway gateway;

    public RuleCaller(QcdRuleGateway gateway) {
        this.gateway = gateway;
    }

    /** 실행 한 번의 호출 묶음 — 정의·코드를 기억하고 부른 룰 목록을 남긴다. */
    public Session session(Instant evalTs) {
        return new Session(evalTs);
    }

    public final class Session {
        private final Instant evalTs;
        private final Map<String, Optional<RuleDefinition>> defs = new HashMap<>();
        private final Map<String, List<CodeItemRow>> codes = new HashMap<>();
        private final Map<String, String> statusByRule = new LinkedHashMap<>();
        private boolean unavailable;

        Session(Instant evalTs) {
            this.evalTs = evalTs;
        }

        public Instant evalTs() {
            return evalTs;
        }

        /** 이번 실행에서 부른 룰 ID → 마지막 상태. */
        public Map<String, String> calls() {
            return statusByRule;
        }

        public boolean unavailable() {
            return unavailable;
        }

        /** 정의(없으면 빈 값). MDM 을 받을 수 없으면 빈 값이고 unavailable 이 켜진다. */
        public Optional<RuleDefinition> definition(String ruleId) {
            return defs.computeIfAbsent(ruleId, id -> {
                try {
                    return gateway.rule(id, evalTs);
                } catch (MdmUnavailableException e) {
                    unavailable = true;
                    return Optional.empty();
                }
            });
        }

        /** 판정. input 은 변수명 → 값(문자·숫자·null). 정의에 있는 조건 변수는 모두 키로 넣는다. */
        public RuleHit judge(String ruleId, Map<String, ?> input) {
            Map<String, String> shown = new LinkedHashMap<>();
            input.forEach((k, v) -> shown.put(k, v == null ? null : PipelineText.plain(v)));
            Optional<RuleDefinition> found;
            try {
                found = gateway.rule(ruleId, evalTs);
                defs.put(ruleId, found);
            } catch (MdmUnavailableException e) {
                unavailable = true;
                return record(RuleHit.failed(ruleId, "UNAVAILABLE", "MDM 에서 기준 정의를 받을 수 없습니다", shown));
            }
            if (found.isEmpty()) {
                return record(RuleHit.failed(ruleId, "RULE_NOT_FOUND", "기준 없음 — Maru 에 적용 중인 룰 버전이 없습니다", shown));
            }
            RuleDefinition def = found.get();
            String ver = MdmVersions.key(def.ver());
            Map<String, Object> record = new LinkedHashMap<>();
            for (RuleVar v : def.vars()) {
                if (v.varKind() != VarKind.COND || v.varName() == null) continue;
                record.put(v.varName(), null);
            }
            for (Map.Entry<String, ?> e : input.entrySet()) {
                if (!record.containsKey(e.getKey())) continue;
                Object raw = e.getValue();
                DataType type = typeOf(def, e.getKey());
                if (raw == null || String.valueOf(raw).isBlank()) {
                    record.put(e.getKey(), null);
                } else if (type == DataType.NUMBER) {
                    BigDecimal n = PipelineText.num(raw);
                    if (n == null) {
                        return record(RuleHit.failed(ruleId, "INPUT_ERROR", e.getKey() + " 값이 숫자가 아닙니다: " + raw, shown).withVer(ver));
                    }
                    record.put(e.getKey(), n);
                } else {
                    record.put(e.getKey(), String.valueOf(raw).trim());
                }
            }
            RuleResult result;
            try {
                result = gateway.engine().evaluate(ruleId, record, evalTs);
            } catch (MdmUnavailableException e) {
                unavailable = true;
                return record(RuleHit.failed(ruleId, "UNAVAILABLE", "MDM 에서 기준 정의를 받을 수 없습니다", shown).withVer(ver));
            } catch (EngineEvaluationException e) {
                return record(RuleHit.failed(ruleId, "INPUT_ERROR", "입력값이 룰 입력 조건에 맞지 않습니다: " + e.violations().size() + "건", shown).withVer(ver));
            }
            List<RuleRow> hitRows = new ArrayList<>();
            if (result.defaultApplied()) {
                def.rows().stream().filter(r -> r.rowKind() == RowKind.DEFAULT).findFirst().ifPresent(hitRows::add);
            } else {
                Map<Integer, RuleRow> byId = new HashMap<>();
                for (RuleRow r : def.rows()) byId.put(r.rowId(), r);
                for (RuleResult.Hit h : result.hits()) {
                    RuleRow r = byId.get(h.rowId());
                    if (r != null) hitRows.add(r);
                }
            }
            Map<Integer, String> resultNames = new HashMap<>();
            for (RuleVar v : def.vars()) if (v.varKind() == VarKind.RESULT && v.varName() != null) resultNames.put(v.varId(), v.varName());
            List<Map<String, String>> rows = new ArrayList<>();
            for (RuleRow r : hitRows) {
                Map<String, String> values = new LinkedHashMap<>();
                for (Map.Entry<Integer, String> rn : resultNames.entrySet()) {
                    RuleCell c = r.cells().get(rn.getKey());
                    values.put(rn.getValue(), c == null ? null : PipelineText.tidyNumber(c.val()));
                }
                rows.add(values);
            }
            if (hitRows.isEmpty()) {
                return record(new RuleHit(ruleId, ver, "NO_MATCH", null, null, Map.of(), List.of(), shown, "조건에 맞는 행이 없습니다"));
            }
            RuleRow first = hitRows.get(0);
            return record(new RuleHit(ruleId, ver, "MATCHED", first.seq(), first.rowId(), rows.get(0), rows, shown,
                    result.defaultApplied() ? "기본 행이 적용됐습니다" : null));
        }

        /** 마루 코드의 평가 시각 RELEASED 버전 항목(seq 순). 없거나 받을 수 없으면 빈 목록. */
        public List<CodeItemRow> codeItems(String codeId) {
            return codes.computeIfAbsent(codeId, id -> {
                Optional<CodeRows> rows;
                try {
                    rows = gateway.code(id);
                } catch (MdmUnavailableException e) {
                    unavailable = true;
                    return List.of();
                }
                if (rows.isEmpty()) return List.of();
                LocalDateTime at = LocalDateTime.ofInstant(evalTs, KST);
                Optional<CodeVersionRow> ver = rows.get().versions().stream()
                        .filter(v -> "RELEASED".equals(v.status()))
                        .filter(v -> v.applyFrom() == null || !at.isBefore(v.applyFrom()))
                        .max(Comparator.comparing(CodeVersionRow::ver));
                if (ver.isEmpty()) return List.of();
                BigDecimal v = ver.get().ver();
                List<CodeItemRow> items = rows.get().items();
                if (items == null || items.isEmpty()) {
                    try {
                        items = gateway.codeAt(id, v).map(CodeRows::items).orElse(List.of());
                    } catch (MdmUnavailableException e) {
                        unavailable = true;
                        return List.of();
                    }
                }
                return items.stream()
                        .filter(i -> i.fromVer().compareTo(v) <= 0 && v.compareTo(i.toVer()) < 0)
                        .sorted(Comparator.comparing((CodeItemRow i) -> i.seq() == null ? Integer.MAX_VALUE : i.seq())
                                .thenComparing(CodeItemRow::code))
                        .toList();
            });
        }

        private RuleHit record(RuleHit hit) {
            statusByRule.put(hit.ruleId(), hit.status());
            return hit;
        }
    }

    private static DataType typeOf(RuleDefinition def, String name) {
        for (RuleVar v : def.vars()) if (name.equals(v.varName())) return v.dataType();
        return DataType.STRING;
    }
}
