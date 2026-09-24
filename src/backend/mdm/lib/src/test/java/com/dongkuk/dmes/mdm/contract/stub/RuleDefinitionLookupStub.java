package com.dongkuk.dmes.mdm.contract.stub;

import com.dongkuk.dmes.mdm.contract.rule.MdmRuleDefinitionSource;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;

/**
 * TSK-08-01 design.md §3.6·§6.4 — TSK-08-04(값 테스트, {@link MdmRuleDefinitionSource#STORED_VERSION}) 역할 스텁.
 * 메모리의 06 엔티티로 엔진 {@link DefinitionLookup} 을 구현해, 06 칼럼 타입 → 엔진 타입 변환이 서명 변경 없이 성립함을
 * 컴파일로 증명한다(불변 규칙 22). §6.4 매핑표의 스칼라 대응만 한다: 셀 JSON 파싱·생성 텍스트·입력 계약·AST 는 빈 값이다
 * (08-04 몫). {@code column()} 은 02 계약에 위임할 몫이라 비어 있다.
 */
public class RuleDefinitionLookupStub implements DefinitionLookup {

    /** D4 — 06 저장 표기 → 엔진 코드. */
    static final Map<String, DispType> DISP_TYPES = Map.of(
            "Equal", DispType.EQUAL,
            "1", DispType.ONE,
            "2", DispType.TWO,
            "Expression", DispType.EXPRESSION,
            "Value", DispType.VALUE);

    private final MdmRule rule;
    private final MdmRuleVer ver;
    private final List<MdmRuleVar> vars;
    private final List<MdmRuleRow> rows;
    private final MdmRuleSet set;

    public RuleDefinitionLookupStub(MdmRule rule, MdmRuleVer ver, List<MdmRuleVar> vars, List<MdmRuleRow> rows, MdmRuleSet set) {
        this.rule = rule;
        this.ver = ver;
        this.vars = vars;
        this.rows = rows;
        this.set = set;
    }

    public MdmRuleDefinitionSource source() {
        return MdmRuleDefinitionSource.STORED_VERSION;
    }

    @Override
    public Optional<ColumnDefinition> column(String table, String column) {
        return Optional.empty();
    }

    @Override
    public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
        if (!ver.getMaruRuleId().equals(ruleId)) {
            return Optional.empty();
        }
        List<RuleVar> ruleVars = new ArrayList<>();
        vars.stream()
                .sorted(Comparator.comparing(MdmRuleVar::getVarKind).thenComparingInt(MdmRuleVar::getSeq))
                .forEach(v -> ruleVars.add(toRuleVar(v)));
        List<RuleRow> ruleRows = new ArrayList<>();
        rows.stream()
                .sorted(Comparator.comparing((MdmRuleRow r) -> !r.getRowKind().equals("NORMAL"))
                        .thenComparingInt(MdmRuleRow::getSeq).thenComparing(MdmRuleRow::getRowId))
                .forEach(r -> ruleRows.add(new RuleRow(r.getRowId(), r.getSeq(), RowKind.valueOf(r.getRowKind()), Map.of())));
        return Optional.of(new RuleDefinition(
                ver.getMaruRuleId(),
                ver.getVer(),
                RuleKind.valueOf(rule.getRuleKind()),
                ver.getHitPolicy() == null ? null : HitPolicy.valueOf(ver.getHitPolicy()),
                ver.getApplyFrom(),
                ver.getApplyTo(),
                null,
                ruleVars,
                new InputContract(List.of(), List.of()),
                ruleRows));
    }

    @Override
    public Optional<RuleSetDefinition> ruleSet(String setId) {
        if (!set.getMaruRuleSetId().equals(setId)) {
            return Optional.empty();
        }
        return Optional.of(new RuleSetDefinition(set.getMaruRuleSetId(), List.of(), SetStatus.valueOf(set.getStatus())));
    }

    /** §6.4 — VAR_AST 가 NULL 이면 VAR_NAME 은 이름, 아니면 식 텍스트(06:1012). DOMAIN_ID 는 어긋남 ①(Long → String). */
    private static RuleVar toRuleVar(MdmRuleVar v) {
        boolean expression = v.getVarAst() != null;
        return new RuleVar(
                v.getVarId(),
                VarKind.valueOf(v.getVarKind()),
                v.getDispType() == null ? null : DISP_TYPES.get(v.getDispType()),
                expression ? null : v.getVarName(),
                expression ? v.getVarName() : null,
                null,
                List.of(),
                v.getDataType() == null ? null : DataType.valueOf(v.getDataType()),
                null,
                v.getDomainId() == null ? null : String.valueOf(v.getDomainId()),
                v.getCollectAgg() == null ? null : CollectAgg.valueOf(v.getCollectAgg()),
                List.of(),
                v.getResGrp(),
                v.getGrpCond(),
                null,
                v.getSeq());
    }
}
