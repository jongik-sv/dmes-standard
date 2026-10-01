package com.dongkuk.dmes.mdm.dma.domainMng.service;

import com.dongkuk.dmes.mdm.common.dictionary.DomainChainAssembler;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDataType;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainKind;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import org.springframework.stereotype.Component;

/**
 * 초안 + 메모리 스냅샷 → 거부 조건·경고 이슈(TSK-04-03 design.md §3.2). <b>첫 오류에서 멈추지 않고 전부 모은다</b>(불변 I7).
 * 테스트 케이스 실행(R03·R08·W03)은 {@link DomainTestCaseRunner}, 하위 도메인 재검사는 {@link #descendantLengthIssues} 와
 * 서비스의 저장 흐름이 한다. DB 는 {@link DictionaryFacts} 로만 본다 — 순수 계산이다.
 */
@Component
public class DomainRuleChecker {

    private static final Pattern STD_NAME = Pattern.compile("^[A-Z][A-Z0-9_]*$");
    private static final Set<String> KINDS = Arrays.stream(MdmDomainKind.values()).map(Enum::name).collect(Collectors.toSet());
    private static final Set<String> TYPES = Arrays.stream(MdmDataType.values()).map(Enum::name).collect(Collectors.toSet());

    private final DomainExpressionCompiler compiler;
    private final DomainChainAssembler assembler;
    private final CodeCategoryValidator codeCategories;

    public DomainRuleChecker(DomainExpressionCompiler compiler, DomainChainAssembler assembler,
                             CodeCategoryValidator codeCategories) {
        this.compiler = compiler;
        this.assembler = assembler;
        this.codeCategories = codeCategories;
    }

    /** 요청 스레드에서 미리 읽은 사전 사실(단위 원장·컬럼 사전). */
    public interface DictionaryFacts {
        boolean unitExists(String unitCode);

        /** 주어진 이름 중 컬럼 사전에 있는 것(대문자). */
        Set<String> registeredPhysNames(Collection<String> physNames);

        static DictionaryFacts of(Set<String> units, Set<String> physNames) {
            Set<String> upper = physNames.stream().map(n -> n.toUpperCase(Locale.ROOT)).collect(Collectors.toSet());
            return new DictionaryFacts() {
                @Override
                public boolean unitExists(String unitCode) {
                    return units.contains(unitCode);
                }

                @Override
                public Set<String> registeredPhysNames(Collection<String> names) {
                    return names.stream().map(n -> n.toUpperCase(Locale.ROOT)).filter(upper::contains).collect(Collectors.toSet());
                }
            };
        }
    }

    public List<DomainIssue> check(DomainDraft d, DomainTreeSnapshot snapshot, DictionaryFacts facts) {
        List<DomainIssue> out = new ArrayList<>();
        DomainNode stored = null;
        if (d.domainId() != null) {
            stored = snapshot.find(d.domainId()).orElse(null);
            if (stored == null) {
                out.add(DomainIssue.of(DomainIssueCode.S06, "DOMAIN_ID", "수정할 도메인이 없다: " + d.domainId()));
            }
        }
        boolean parentExists = d.parentDomainId() == null || snapshot.find(d.parentDomainId()).isPresent();
        if (!parentExists) {
            out.add(DomainIssue.of(DomainIssueCode.S06, "PARENT_DOMAIN_ID", "부모 도메인이 없다: " + d.parentDomainId()));
        }
        requiredAndFormat(d, facts, out);
        out.addAll(compiler.check(d.stdRule(), Slot.DOMAIN_STD, "STD_RULE"));
        List<DomainIssue> biz = compiler.check(d.bizRule(), Slot.DOMAIN_BIZ, "BIZ_RULE");
        out.addAll(biz);
        if (d.bizRule() != null && biz.stream().noneMatch(i -> i.code() == DomainIssueCode.R01)) {
            columnDictionary(d.bizRule(), facts, out);
        }
        codeShape(d, out);
        if ("FLAG".equals(d.domainKind()) && d.parentDomainId() == null && d.stdRule() == null) {
            out.add(DomainIssue.of(DomainIssueCode.S04, "STD_RULE", null));
        }
        boolean cycle = cycle(d, snapshot);
        if (cycle) {
            out.add(DomainIssue.of(DomainIssueCode.R07, "PARENT_DOMAIN_ID", "부모 " + d.parentDomainId()));
        }
        if (stored != null) {
            structural(stored, d, out);
            if (!cycle && parentExists && !Objects.equals(stored.parentDomainId(), d.parentDomainId())) {
                parentUnit(stored, d, snapshot, out);
            }
        }
        if (!cycle && parentExists) {
            inheritance(d, snapshot, out);
        }
        if ("CODE".equals(d.domainKind()) && d.maruCodeId() != null) {
            switch (codeCategories.check(d.maruCodeId(), d.cateId())) {
                case INVALID -> out.add(DomainIssue.of(DomainIssueCode.R10, "CATE_ID", d.maruCodeId() + "/" + d.cateId()));
                case UNAVAILABLE -> out.add(DomainIssue.of(DomainIssueCode.W02, "CATE_ID", "마스터코드 원장이 없어 카테고리를 확인하지 못했다"));
                default -> { }
            }
        }
        return out;
    }

    /** 저장 경로·검증 미리보기 공용 — 대상의 하위 도메인 명시 길이·소수가 새 부모 유효값보다 크면 R06(ITEM_KEY = 하위 id). */
    public List<DomainIssue> descendantLengthIssues(DomainTreeSnapshot snapshot, long targetId) {
        List<DomainIssue> out = new ArrayList<>();
        for (Long id : snapshot.descendants(targetId)) {
            DomainNode n = snapshot.find(id).orElseThrow();
            if (n.length() == null && n.scale() == null) {
                continue;
            }
            List<DomainNode> chain;
            try {
                chain = snapshot.chainRootFirst(id);
            } catch (DomainTreeSnapshot.CycleException e) {
                continue;
            }
            EffectiveDomainView parent = assembler.assemble(chain.subList(0, chain.size() - 1));
            if (n.length() != null && parent.length() != null && n.length() > parent.length()) {
                out.add(DomainIssue.of(DomainIssueCode.R06, "LENGTH", String.valueOf(id),
                        "하위 도메인 " + n.domainName() + " 길이 " + n.length() + " > 부모 " + parent.length()));
            }
            if (n.scale() != null && parent.scale() != null && n.scale() > parent.scale()) {
                out.add(DomainIssue.of(DomainIssueCode.R06, "SCALE", String.valueOf(id),
                        "하위 도메인 " + n.domainName() + " 소수 " + n.scale() + " > 부모 " + parent.scale()));
            }
        }
        return out;
    }

    private void requiredAndFormat(DomainDraft d, DictionaryFacts facts, List<DomainIssue> out) {
        if (d.domainName() == null) {
            out.add(DomainIssue.of(DomainIssueCode.S06, "DOMAIN_NAME", "도메인명 필수"));
        }
        if (d.stdName() == null) {
            out.add(DomainIssue.of(DomainIssueCode.S06, "STD_NAME", "표준명 필수"));
        } else if (!STD_NAME.matcher(d.stdName()).matches() || d.stdName().length() > 50) {
            out.add(DomainIssue.of(DomainIssueCode.S06, "STD_NAME", "표준명은 ^[A-Z][A-Z0-9_]*$, 50자 이내: " + d.stdName()));
        }
        if (d.domainKind() == null || !KINDS.contains(d.domainKind())) {
            out.add(DomainIssue.of(DomainIssueCode.S06, "DOMAIN_KIND", "종류: " + d.domainKind()));
        }
        if (d.dataType() == null || !TYPES.contains(d.dataType())) {
            out.add(DomainIssue.of(DomainIssueCode.S06, "DATA_TYPE", "데이터 타입: " + d.dataType()));
        }
        if (d.length() != null && d.length() < 0) {
            out.add(DomainIssue.of(DomainIssueCode.S06, "LENGTH", "길이는 음수일 수 없다"));
        }
        if (d.scale() != null && d.scale() < 0) {
            out.add(DomainIssue.of(DomainIssueCode.S06, "SCALE", "소수 자리는 음수일 수 없다"));
        }
        if (d.unitCode() != null && !facts.unitExists(d.unitCode())) {
            out.add(DomainIssue.of(DomainIssueCode.S06, "UNIT_CODE", "단위 원장에 없는 단위: " + d.unitCode()));
        }
        if ("QTY".equals(d.domainKind())) {
            if (d.dataType() != null && !"NUMBER".equals(d.dataType())) {
                out.add(DomainIssue.of(DomainIssueCode.S06, "DATA_TYPE", "QTY 는 NUMBER 여야 한다"));
            }
            if (d.parentDomainId() == null && d.unitCode() == null) {
                out.add(DomainIssue.of(DomainIssueCode.S06, "UNIT_CODE", "QTY 최상위는 단위 필수"));
            }
        }
        for (int i = 0; i < d.testCases().size(); i++) {
            DomainTestCase c = d.testCases().get(i);
            if (c.problem() != null) {
                out.add(DomainIssue.of(DomainIssueCode.S06, "TEST_CASES", String.valueOf(i), c.problem()));
            }
            if (d.stdName() != null && c.vars() != null
                    && c.vars().keySet().stream().anyMatch(k -> k.equalsIgnoreCase(d.stdName()))) {
                out.add(DomainIssue.of(DomainIssueCode.S06, "TEST_CASES", String.valueOf(i), "변수 이름이 표준명과 같다"));
            }
        }
    }

    /** R05 — 비즈니스식 변수(value 제외)가 컬럼 사전 물리명에 있어야 한다(대소문자 무시). */
    private void columnDictionary(String bizRule, DictionaryFacts facts, List<DomainIssue> out) {
        List<String> vars = compiler.usedVariables(bizRule).stream()
                .filter(v -> !v.equalsIgnoreCase(ReservedNames.DOMAIN_VALUE))
                .filter(v -> !v.startsWith(ReservedNames.RESERVED_PREFIX) && !v.equalsIgnoreCase(ReservedNames.EVAL_TS))
                .toList();
        if (vars.isEmpty()) {
            return;
        }
        Set<String> registered = facts.registeredPhysNames(vars);
        for (String v : vars) {
            if (!registered.contains(v.toUpperCase(Locale.ROOT))) {
                out.add(DomainIssue.of(DomainIssueCode.R05, "BIZ_RULE", v));
            }
        }
    }

    private static void codeShape(DomainDraft d, List<DomainIssue> out) {
        boolean code = "CODE".equals(d.domainKind());
        if (code && d.stdRule() != null) {
            out.add(DomainIssue.of(DomainIssueCode.S03, "STD_RULE", "CODE 는 표준식을 두지 않는다(코드 참조만)"));
        }
        if (!code && (d.maruCodeId() != null || d.cateId() != null)) {
            out.add(DomainIssue.of(DomainIssueCode.S03, "MARU_CODE_ID", "CODE 가 아니면 코드 참조를 두지 않는다"));
        }
        if ((d.maruCodeId() == null) != (d.cateId() == null)) {
            out.add(DomainIssue.of(DomainIssueCode.S03, "CATE_ID", "마루 코드와 카테고리는 함께 채우거나 함께 비운다"));
        }
    }

    /** 제안된 부모에서 위로 올라가다 자신을 만나거나, 되돌아오거나, 깊이 가드를 넘으면 순환이다. */
    private static boolean cycle(DomainDraft d, DomainTreeSnapshot snapshot) {
        if (d.parentDomainId() == null) {
            return false;
        }
        Set<Long> seen = new HashSet<>();
        Long cur = d.parentDomainId();
        int steps = 0;
        while (cur != null) {
            if (cur.equals(d.domainId()) || !seen.add(cur) || ++steps > DomainTreeSnapshot.MAX_DEPTH) {
                return true;
            }
            cur = snapshot.find(cur).map(DomainNode::parentDomainId).orElse(null);
        }
        return false;
    }

    /**
     * S01 — 구조 칼럼(종류·타입·단위)은 수정에서 바꿀 수 없다. 부모는 구조 칼럼이 아니다(부모 연결·교체·제거 허용, D-132).
     * 부모가 바뀌면 자기 단위 칸은 여기서 보지 않는다 — 연결 제거는 상속받던 단위를 자기 행에 복사하므로 칸 값이 바뀐다.
     * 유효 단위가 그대로인지는 {@link #parentUnit} 이 본다.
     */
    private static void structural(DomainNode stored, DomainDraft d, List<DomainIssue> out) {
        compare("DOMAIN_KIND", stored.domainKind(), d.domainKind(), out);
        compare("DATA_TYPE", stored.dataType(), d.dataType(), out);
        if (Objects.equals(stored.parentDomainId(), d.parentDomainId())) {
            compare("UNIT_CODE", stored.unitCode(), d.unitCode(), out);
        }
    }

    /**
     * S02 — 부모를 바꿔도 유효 단위는 그대로여야 한다(D-132). 자기 단위가 비어 상속받던 도메인을 단위가 다른 부모 밑으로
     * 옮기는 경우를 잡는다(자기 단위가 있는 경우는 {@link #inheritance} 의 S02 가 잡는다).
     */
    private void parentUnit(DomainNode stored, DomainDraft d, DomainTreeSnapshot snapshot, List<DomainIssue> out) {
        String before;
        String after;
        try {
            before = assembler.assemble(snapshot.chainRootFirst(stored.domainId())).unitCode();
            DomainNode node = d.toNode(compiler.ast(d.stdRule()), compiler.ast(d.bizRule()), null);
            after = assembler.assemble(snapshot.withDraft(node).chainRootFirst(node.domainId())).unitCode();
        } catch (DomainTreeSnapshot.CycleException e) {
            return;
        }
        if (!Objects.equals(before, after)) {
            out.add(DomainIssue.of(DomainIssueCode.S02, "UNIT_CODE", "유효 단위 " + before + " → " + after));
        }
    }

    private static void compare(String field, Object before, Object after, List<DomainIssue> out) {
        if (!Objects.equals(before, after)) {
            out.add(DomainIssue.of(DomainIssueCode.S01, field, before + " → " + after));
        }
    }

    /** S02·R06·R09·W01·소수 ≤ 길이 — 초안을 얹은 체인으로 판정한다. */
    private void inheritance(DomainDraft d, DomainTreeSnapshot snapshot, List<DomainIssue> out) {
        DomainNode node = d.toNode(compiler.ast(d.stdRule()), compiler.ast(d.bizRule()), null);
        List<DomainNode> chain;
        try {
            chain = snapshot.withDraft(node).chainRootFirst(node.domainId());
        } catch (DomainTreeSnapshot.CycleException e) {
            out.add(DomainIssue.of(DomainIssueCode.R07, "PARENT_DOMAIN_ID", e.getMessage()));
            return;
        }
        EffectiveDomainView parent = chain.size() > 1 ? assembler.assemble(chain.subList(0, chain.size() - 1)) : null;
        Integer effLength = d.length() != null ? d.length() : parent == null ? null : parent.length();
        if (d.scale() != null && effLength != null && d.scale() > effLength) {
            out.add(DomainIssue.of(DomainIssueCode.S06, "SCALE", "소수 자리 " + d.scale() + " > 길이 " + effLength));
        }
        if (parent != null) {
            if (d.domainKind() != null && !d.domainKind().equals(parent.domainKind())) {
                out.add(DomainIssue.of(DomainIssueCode.S02, "DOMAIN_KIND", "부모 " + parent.domainKind()));
            }
            if (d.dataType() != null && !d.dataType().equals(parent.dataType())) {
                out.add(DomainIssue.of(DomainIssueCode.S02, "DATA_TYPE", "부모 " + parent.dataType()));
            }
            if (d.unitCode() != null && !d.unitCode().equals(parent.unitCode())) {
                out.add(DomainIssue.of(DomainIssueCode.S02, "UNIT_CODE", "부모 " + parent.unitCode()));
            }
            if (d.length() != null && parent.length() != null && d.length() > parent.length()) {
                out.add(DomainIssue.of(DomainIssueCode.R06, "LENGTH", "부모 " + parent.length() + ", 입력 " + d.length()));
            }
            if (d.scale() != null && parent.scale() != null && d.scale() > parent.scale()) {
                out.add(DomainIssue.of(DomainIssueCode.R06, "SCALE", "부모 " + parent.scale() + ", 입력 " + d.scale()));
            }
            boolean sameLength = d.length() == null || d.length().equals(parent.length());
            boolean sameScale = d.scale() == null || d.scale().equals(parent.scale());
            boolean noOwnCode = !"CODE".equals(d.domainKind()) || d.maruCodeId() == null;
            if (d.stdRule() == null && d.bizRule() == null && sameLength && sameScale && noOwnCode) {
                out.add(DomainIssue.of(DomainIssueCode.W01, null, null));
            }
        }
        if ("CODE".equals(d.domainKind()) && assembler.assemble(chain).codeRef() == null) {
            out.add(DomainIssue.of(DomainIssueCode.R09, "MARU_CODE_ID", null));
        }
    }
}
