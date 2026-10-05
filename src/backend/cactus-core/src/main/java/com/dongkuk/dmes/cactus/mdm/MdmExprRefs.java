package com.dongkuk.dmes.cactus.mdm;

import com.ezylang.evalex.config.ExpressionConfiguration;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MasterBaseDt;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;

/**
 * 식이 참조하는 마루 코드 ID 찾기(하위 프로젝트 C spec §6.2-3) — 저장 검증의 미리 받기가 평가 전에 받아 둘 {@code CODE} 키를 고른다. 식 AST
 * (모양: docs/mdm/engine-contract.md §9, {@code AstExporter})에서 {@code FUNCTION} 노드 {@code CODE}·{@code MASTER}·{@code MASTER_AT} 의
 * 첫 인자가 문자열 상수({@code STRING_LITERAL}, 이스케이프를 푼 값)면 그 값을 모은다. 첫 인자가 변수면 미리 알 수 없다 — 평가 중 부재 기록이
 * 검증 불가로 잡는다.
 *
 * <p>엔진은 식 <b>텍스트</b>를 평가한다(룰 op-code 셀도 생성된 텍스트 — {@code CODE_IN} 은 {@code MASTER(…)} 텍스트다). 그래서 AST 가 있으면 AST
 * 를, 텍스트가 있으면 텍스트를 엔진 설정으로 풀어 함께 훑는다(AST 가 비었거나 자리표시인 정의도 놓치지 않게). 텍스트 풀이 결과는 텍스트를 키로
 * 캐시한다(상한 {@value #MAX_CACHED}, 차면 비운다). 풀리지 않는 식은 건너뛴다 — 엔진이 판정 오류로 알린다.
 *
 * <p>D-154 — {@code MASTER_AT} 의 넷째 인자(문자열 상수는 {@link MasterBaseDt} 로 푼 시각, 변수는 이름)도 모은다(스펙 §7.3).
 */
final class MdmExprRefs {

    static final int MAX_CACHED = 10_000;
    private static final Set<String> CODE_FUNCTIONS = Set.of("CODE", "MASTER", "MASTER_AT");

    private final ExpressionConfiguration configuration;
    private final Map<String, Refs> byText = new ConcurrentHashMap<>();

    /** {@code MASTER_AT} 의 미리 받을 수 있는 기준 시각 — 문자열 상수({@code at})이거나 변수 이름({@code var}, 행 칸으로 푼다). */
    record MasterAtRef(String codeId, LocalDateTime at, String var) {
    }

    /** 식 하나에서 찾은 코드 ID 와 MASTER_AT 기준 시각. */
    private record Refs(Set<String> codeIds, Set<MasterAtRef> masterAt) {
    }

    MdmExprRefs(ExpressionConfiguration configuration) {
        this.configuration = configuration;
    }

    /** 컬럼 — 코드 참조(CODE 도메인 자동 MASTER), 표준식 AST·텍스트, 비즈니스식 텍스트. */
    Set<String> columnCodes(MdmColumnMeta m) {
        Set<String> out = new LinkedHashSet<>();
        column(m, out, new LinkedHashSet<>());
        return out;
    }

    /** 컬럼 식의 {@code MASTER_AT} 기준 시각. */
    Set<MasterAtRef> columnMasterAt(MdmColumnMeta m) {
        Set<MasterAtRef> at = new LinkedHashSet<>();
        column(m, new LinkedHashSet<>(), at);
        return at;
    }

    private void column(MdmColumnMeta m, Set<String> out, Set<MasterAtRef> at) {
        if (m.codeRef() != null && m.codeRef().maruCodeId() != null && !m.codeRef().maruCodeId().isBlank()) {
            out.add(m.codeRef().maruCodeId());
        }
        if (m.stdExpr() != null) {
            scan(m.stdExpr().ast(), out, at);
            text(m.stdExpr().text(), out, at);
        }
        if (m.bizExpr() != null) {
            text(m.bizExpr().text(), out, at);
        }
    }

    /** 룰 세트 흐름 — IF·PARALLEL 선의 조건식. */
    Set<String> flowCodes(RuleSetDefinition set) {
        Set<String> out = new LinkedHashSet<>();
        flow(set, out, new LinkedHashSet<>());
        return out;
    }

    /** 룰 세트 흐름 조건식의 {@code MASTER_AT} 기준 시각. */
    Set<MasterAtRef> flowMasterAt(RuleSetDefinition set) {
        Set<MasterAtRef> at = new LinkedHashSet<>();
        flow(set, new LinkedHashSet<>(), at);
        return at;
    }

    private void flow(RuleSetDefinition set, Set<String> out, Set<MasterAtRef> at) {
        if (set.flow() != null && set.flow().edges() != null) {
            for (FlowEdge e : set.flow().edges()) {
                text(e.cond(), out, at);
            }
        }
    }

    /** 룰 — 식 변수, 결과 열 그룹 조건, 셀(AST·식·생성 텍스트), 행 입력 계약 조건. */
    Set<String> ruleCodes(RuleDefinition rule) {
        Set<String> out = new LinkedHashSet<>();
        rule(rule, out, new LinkedHashSet<>());
        return out;
    }

    /** 룰 식의 {@code MASTER_AT} 기준 시각. */
    Set<MasterAtRef> ruleMasterAt(RuleDefinition rule) {
        Set<MasterAtRef> at = new LinkedHashSet<>();
        rule(rule, new LinkedHashSet<>(), at);
        return at;
    }

    private void rule(RuleDefinition rule, Set<String> out, Set<MasterAtRef> at) {
        if (rule.vars() != null) {
            for (RuleVar v : rule.vars()) {
                scan(v.exprAst(), out, at);
                text(v.exprText(), out, at);
                scan(v.grpCondAst(), out, at);
                text(v.grpCond(), out, at);
            }
        }
        if (rule.rows() != null) {
            for (RuleRow r : rule.rows()) {
                if (r.cells() == null) {
                    continue;
                }
                for (RuleCell c : r.cells().values()) {
                    scan(c.ast(), out, at);
                    text(c.expr(), out, at);
                    text(c.text(), out, at);
                }
            }
        }
        if (rule.contract() != null && rule.contract().rows() != null) {
            for (RowContract rc : rule.contract().rows()) {
                text(rc.cond(), out, at);
            }
        }
    }

    /** 세트가 실행할 수 있는 룰 — {@code ruleIds}(흐름을 펼친 목록)와 흐름 RULE 노드. */
    static Set<String> ruleIds(RuleSetDefinition set) {
        Set<String> out = new LinkedHashSet<>();
        if (set.ruleIds() != null) {
            set.ruleIds().stream().filter(id -> id != null && !id.isBlank()).forEach(out::add);
        }
        if (set.flow() != null && set.flow().nodes() != null) {
            for (FlowNode n : set.flow().nodes()) {
                if (n.ruleId() != null && !n.ruleId().isBlank()) {
                    out.add(n.ruleId());
                }
            }
        }
        return out;
    }

    /** 세트가 부르는 하위 세트 — 흐름의 {@code SET} 노드 {@code setId}(빈 값 제외), 처음 나온 순서로 중복 없이. */
    static Set<String> setIds(RuleSetDefinition set) {
        Set<String> out = new LinkedHashSet<>();
        if (set.flow() != null && set.flow().nodes() != null) {
            for (FlowNode n : set.flow().nodes()) {
                if (n.kind() == NodeKind.SET && n.setId() != null && !n.setId().isBlank()) {
                    out.add(n.setId());
                }
            }
        }
        return out;
    }

    private void text(String text, Set<String> out, Set<MasterAtRef> at) {
        if (text == null || text.isBlank()) {
            return;
        }
        Refs hit = byText.get(text);
        if (hit == null) {
            Set<String> found = new LinkedHashSet<>();
            Set<MasterAtRef> foundAt = new LinkedHashSet<>();
            try {
                scan(AstExporter.export(text, configuration), found, foundAt);
            } catch (Exception e) {
                // 풀리지 않는 식 — 엔진이 판정 오류로 알린다
            }
            hit = new Refs(Set.copyOf(found), Set.copyOf(foundAt));
            if (byText.size() >= MAX_CACHED) {
                byText.clear();
            }
            byText.put(text, hit);
        }
        out.addAll(hit.codeIds());
        at.addAll(hit.masterAt());
    }

    /** AST(Map) 를 재귀로 훑는다. 모양이 다른 노드는 건너뛴다. */
    static void scan(Object node, Set<String> out) {
        scan(node, out, new LinkedHashSet<>());
    }

    static void scan(Object node, Set<String> out, Set<MasterAtRef> at) {
        if (!(node instanceof Map<?, ?> m)) {
            return;
        }
        Object params = m.get("params");
        if ("FUNCTION".equals(m.get("type")) && m.get("value") instanceof String fn
                && CODE_FUNCTIONS.contains(fn.toUpperCase(Locale.ROOT)) && params instanceof List<?> args && !args.isEmpty()
                && args.get(0) instanceof Map<?, ?> first && "STRING_LITERAL".equals(first.get("type"))
                && first.get("value") instanceof String id && !id.isBlank()) {
            out.add(id);
            if ("MASTER_AT".equals(fn.toUpperCase(Locale.ROOT)) && args.size() >= 4 && args.get(3) instanceof Map<?, ?> fourth) {
                if ("STRING_LITERAL".equals(fourth.get("type")) && fourth.get("value") instanceof String s) {
                    MasterBaseDt.parse(s).ifPresent(dt -> at.add(new MasterAtRef(id, dt, null)));
                } else if ("VARIABLE_OR_CONSTANT".equals(fourth.get("type")) && fourth.get("value") instanceof String v) {
                    at.add(new MasterAtRef(id, null, v));
                }
            }
        }
        if (params instanceof List<?> children) {
            for (Object child : children) {
                scan(child, out, at);
            }
        }
    }
}
