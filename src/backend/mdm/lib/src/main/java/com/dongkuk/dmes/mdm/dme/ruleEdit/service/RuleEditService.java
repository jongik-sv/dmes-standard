package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeReader;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleDomainSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleDomainSearchResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSearchResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleExprParseRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleExprParseResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleTestRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleTestResult;
import com.ezylang.evalex.parser.ParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker.Problem;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.springframework.stereotype.Service;

/**
 * 룰 내용 편집({@code ruleEdit}) OASIS 진입 파사드 — TSK-08-02 design §6.1. BPMN {@code services/dme/ruleEdit.bpmn} 의 분기와 1:1:
 * search({@link #searchRules})·view·save·parseExpr·searchDomains(TSK-08-03)·execute({@link #runTest}, 값 테스트 — TSK-08-04 D3).
 *
 * <p><b>D-105 로 헤더·버전 관리({@code copy}·{@code delete}·{@code lock}·{@code unlock}·{@code handover}·{@code save}
 * target HEADER, 그리고 {@code save} 의 part HEADER) 는 {@code ruleMng} 으로 옮겨 갔다.</b> 여기는 ③ 의사결정표·열 설정과
 * ④⑤⑥ 값 테스트·테스트 케이스, ⑧ 활용처 — <b>내용 편집만</b> 한다. 액션이 11개에서 5개로 줄었다.
 *
 * <p>여전히 버전 목록은 읽는다 — 내용을 고르려면 어느 DRAFT 를 고르는지 알아야 하기 때문이다. 다만 읽기 전용이고 관리
 * 버튼은 없다(버전 관리는 헤더·버전 화면).
 *
 * <p>업무 규칙은 두지 않고 카드별 서비스에 넘긴다. {@code save} 는 {@code part} 로 {@link RuleEditSavePart} 빈을 고른다.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — OASIS 파라미터 이름 바인딩이 깨진다(I25).
 */
@Service("ruleEditService")
public class RuleEditService {

    static final int SEARCH_LIMIT = 20;
    static final int DOMAIN_SEARCH_LIMIT = 8;

    private final RuleQueries queries;
    private final RuleViewService viewService;
    private final ExpressionChecker checker;
    private final MdmEvaluator evaluator;
    private final DomainTreeReader domainTreeReader;
    private final RuleValueTestService valueTestService;
    private final Map<String, RuleEditSavePart> parts = new HashMap<>();

    public RuleEditService(RuleQueries queries, RuleViewService viewService, ExpressionChecker checker, MdmEvaluator evaluator,
                           DomainTreeReader domainTreeReader, RuleValueTestService valueTestService,
                           List<RuleEditSavePart> saveParts) {
        this.queries = queries;
        this.viewService = viewService;
        this.checker = checker;
        this.evaluator = evaluator;
        this.domainTreeReader = domainTreeReader;
        this.valueTestService = valueTestService;
        for (RuleEditSavePart part : saveParts) {
            if (parts.put(part.part(), part) != null) {
                throw new IllegalStateException("같은 저장 부분이 둘이다: " + part.part());
            }
        }
    }

    // action: search — target RULE(기본, 상단 룰 고르기)·DOMAIN(도메인 검색 위젯). BPMN 은 이 메서드를 부른다.
    public Object search(RuleEditSearchRequest request) {
        String target = request == null ? null : RuleScreenSupport.blankToNull(request.getTarget());
        if (target == null || "RULE".equals(target)) {
            return searchRules(request);
        }
        if ("DOMAIN".equals(target)) {
            RuleDomainSearchRequest q = new RuleDomainSearchRequest();
            q.setKeyword(request.getKeyword());
            return searchDomains(q);
        }
        throw new BusinessException(ErrorCode.INVALID_VALUE, "검색 대상은 RULE·DOMAIN 중 하나여야 합니다: " + target);
    }

    // 룰 고르기(target=RULE)
    public RuleEditSearchResult searchRules(RuleEditSearchRequest request) {
        String keyword = request == null ? null : RuleScreenSupport.blankToNull(request.getKeyword());
        return new RuleEditSearchResult(queries.searchPrefix(keyword, SEARCH_LIMIT).stream()
                .map(r -> new RuleEditSearchResult.Row(r.getMaruRuleId(), r.getMaruRuleName(), r.getRuleKind(), r.getStatus(), r.getSourceKind()))
                .toList());
    }

    // action: view
    public RuleEditViewResult view(RuleEditViewRequest request) {
        return viewService.view(request);
    }

    // action: save — part 전략(확장 지점 §6.8). HEADER 는 D-105 로 ruleMng 으로 갔다 — 여기 남는 부분은 TABLE·COLUMNS·CASE 뿐이다.
    public RuleEditSaveResult save(RuleEditSaveRequest request) {
        RuleEditSavePart part = parts.get(request.getPart());
        if (part == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "모르는 저장 부분입니다: " + request.getPart());
        }
        return part.save(request);
    }

    // action: execute(BPMN) → runTest — 값 테스트(TSK-08-04 D3). 저장된 버전·편집 중인 본문을 판정하고 원장에 쓰지 않는다.
    public RuleTestResult runTest(RuleTestRequest request) {
        return valueTestService.run(request);
    }

    // action: validate(BPMN) → parseExpr — 식 입력 칸의 디바운스 파싱(서버 EvalEx 단일 진원, 불변 9). 화면은 파싱 결과만 해석한다.
    public RuleExprParseResult parseExpr(RuleExprParseRequest request) {
        String text = request == null ? null : RuleScreenSupport.blankToNull(request.getText());
        if (text == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "식이 비었습니다.");
        }
        if (request.getSlot() == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "식 칸 종류(slot)가 필요합니다.");
        }
        Slot slot;
        try {
            slot = Slot.valueOf(request.getSlot().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "모르는 식 칸 종류입니다: " + request.getSlot());
        }
        List<Map<String, Object>> problems = new ArrayList<>();
        for (Problem p : checker.check(text, slot)) {
            if (ExpressionChecker.PARSE.equals(p.kind())) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "식을 파싱할 수 없습니다: " + p.detail());
            }
            if (ExpressionChecker.VARIABLE.equals(p.kind())) {
                continue; // 참조 변수는 refVars 로 준다 — 해결 여부는 저장 검사(RuleColumnsService)가 잰다
            }
            problems.add(Map.of("kind", p.kind(), "detail", p.detail()));
        }
        Map<String, Object> ast;
        try {
            ast = AstExporter.export(text, evaluator.configuration());
        } catch (ParseException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "식을 파싱할 수 없습니다: " + text);
        }
        boolean supported = functions(ast).stream().allMatch(FunctionSets.BASE::contains);
        return new RuleExprParseResult(ast, List.copyOf(evaluator.usedVariables(text)), supported, problems);
    }

    private static List<String> functions(Map<String, Object> node) {
        List<String> out = new ArrayList<>();
        collectFunctions(node, out);
        return out;
    }

    /** AST Map(type·value·params) 에서 함수 이름을 모은다 — BASE 밖이면 화면이 평가하지 못 한다(evalex-guide §8.5). */
    @SuppressWarnings("unchecked")
    private static void collectFunctions(Map<String, Object> node, List<String> out) {
        if (node == null) {
            return;
        }
        if ("FUNCTION".equals(node.get("type")) && node.get("value") != null) {
            out.add(String.valueOf(node.get("value")).toUpperCase(Locale.ROOT));
        }
        if (node.get("params") instanceof List<?> list) {
            for (Object p : list) {
                if (p instanceof Map) {
                    collectFunctions((Map<String, Object>) p, out);
                }
            }
        }
    }

    // action: search target=DOMAIN → searchDomains — 값 타입 도메인 검색 위젯(평면 8건). domainMng search 는 트리 응답이라 쓰지 않았다(design 이탈란).
    public RuleDomainSearchResult searchDomains(RuleDomainSearchRequest request) {
        String kw = request == null ? null : RuleScreenSupport.blankToNull(request.getKeyword());
        String needle = kw == null ? "" : kw.toUpperCase(Locale.ROOT);
        List<DomainNode> matched = new ArrayList<>();
        for (DomainNode n : domainTreeReader.load().nodes()) {
            if (needle.isEmpty() || contains(n.stdName(), needle) || contains(n.domainName(), needle)) {
                matched.add(n);
            }
        }
        // 표준명·도메인명이 검색어와 같은 도메인을 맨 앞에 둔다 — 화면이 직접 입력한 이름을 8건 자르기 전에 찾게(열 설정 도메인 칸).
        matched.sort(Comparator
                .<DomainNode>comparingInt(n -> equalsIgnoreCase(n.stdName(), needle) || equalsIgnoreCase(n.domainName(), needle) ? 0
                        : n.stdName() != null && n.stdName().toUpperCase(Locale.ROOT).startsWith(needle) ? 1 : 2)
                .thenComparing(n -> n.stdName() == null ? "" : n.stdName().toUpperCase(Locale.ROOT)));
        return new RuleDomainSearchResult(matched.stream().limit(DOMAIN_SEARCH_LIMIT)
                .map(n -> new RuleDomainSearchResult.Row(n.domainId(), n.stdName(), n.domainName(), n.domainKind(),
                        n.dataType(), n.length(), n.scale(), n.stdRule()))
                .toList());
    }

    private static boolean equalsIgnoreCase(String value, String needle) {
        return value != null && !needle.isEmpty() && value.trim().toUpperCase(Locale.ROOT).equals(needle);
    }

    private static boolean contains(String value, String needle) {
        return value != null && value.toUpperCase(Locale.ROOT).contains(needle);
    }
}
