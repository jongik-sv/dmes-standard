package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeReader;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
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
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleVersionResult;
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
 * 룰 화면({@code ruleEdit}) OASIS 진입 파사드 — TSK-08-02 design §6.1. BPMN {@code services/dme/ruleEdit.bpmn} 의 분기와 1:1:
 * search({@link #searchRules})·view·save·delete·copy({@link #newVersion})·lock·unlock·handover·parseExpr·searchDomains(TSK-08-03).
 * 업무 규칙은 두지 않고 카드별 서비스에 넘긴다. save 는 {@code part} 로 {@link RuleEditSavePart} 빈을, delete 는 {@code target}(VERSION·RULE)으로
 * 서비스를 고른다.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — OASIS 파라미터 이름 바인딩이 깨진다(I25).
 */
@Service("ruleEditService")
public class RuleEditService {

    static final int SEARCH_LIMIT = 20;
    static final int DOMAIN_SEARCH_LIMIT = 8;

    private final RuleQueries queries;
    private final RuleViewService viewService;
    private final RuleVersionService versionService;
    private final RuleHeaderService headerService;
    private final ExpressionChecker checker;
    private final MdmEvaluator evaluator;
    private final DomainTreeReader domainTreeReader;
    private final Map<String, RuleEditSavePart> parts = new HashMap<>();

    public RuleEditService(RuleQueries queries, RuleViewService viewService, RuleVersionService versionService,
                           RuleHeaderService headerService, ExpressionChecker checker, MdmEvaluator evaluator,
                           DomainTreeReader domainTreeReader, List<RuleEditSavePart> saveParts) {
        this.queries = queries;
        this.viewService = viewService;
        this.versionService = versionService;
        this.headerService = headerService;
        this.checker = checker;
        this.evaluator = evaluator;
        this.domainTreeReader = domainTreeReader;
        for (RuleEditSavePart part : saveParts) {
            if (parts.put(part.part(), part) != null) {
                throw new IllegalStateException("같은 저장 부분이 둘이다: " + part.part());
            }
        }
    }

    // action: search — target RULE(기본, 상단 룰 고르기)·DOMAIN(도메인 검색 위젯). BPMN 은 이 메서드를 부른다.
    public Object search(RuleEditSearchRequest request) {
        String target = request == null ? null : RuleEditSupport.blankToNull(request.getTarget());
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
        String keyword = request == null ? null : RuleEditSupport.blankToNull(request.getKeyword());
        return new RuleEditSearchResult(queries.searchPrefix(keyword, SEARCH_LIMIT).stream()
                .map(r -> new RuleEditSearchResult.Row(r.getMaruRuleId(), r.getMaruRuleName(), r.getRuleKind(), r.getStatus(), r.getSourceKind()))
                .toList());
    }

    // action: view
    public RuleEditViewResult view(RuleEditViewRequest request) {
        return viewService.view(request);
    }

    // action: save — part 전략(확장 지점 §6.8)
    public RuleEditSaveResult save(RuleEditSaveRequest request) {
        RuleEditSavePart part = parts.get(request.getPart());
        if (part == null) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "모르는 저장 부분입니다: " + request.getPart());
        }
        return part.save(request);
    }

    // action: delete — VERSION(DRAFT 삭제)·RULE(폐기)
    public RuleVersionResult delete(RuleVersionRequest request) {
        if ("VERSION".equals(request.getTarget())) {
            return versionService.deleteDraft(request);
        }
        if ("RULE".equals(request.getTarget())) {
            return headerService.deprecate(request);
        }
        throw new BusinessException(ErrorCode.INVALID_VALUE, "삭제 대상은 VERSION·RULE 중 하나여야 합니다: " + request.getTarget());
    }

    // action: copy
    public RuleVersionResult newVersion(RuleVersionRequest request) {
        return versionService.newVersion(request);
    }

    // action: lock
    public RuleVersionResult lock(RuleVersionRequest request) {
        return versionService.lock(request);
    }

    // action: unlock
    public RuleVersionResult unlock(RuleVersionRequest request) {
        return versionService.unlock(request);
    }

    // action: handover
    public RuleVersionResult handover(RuleVersionRequest request) {
        return versionService.handover(request);
    }

    // action: validate(BPMN) → parseExpr — 식 입력 칸의 디바운스 파싱(서버 EvalEx 단일 진원, 불변 9). 화면은 파싱 결과만 해석한다.
    public RuleExprParseResult parseExpr(RuleExprParseRequest request) {
        String text = request == null ? null : RuleEditSupport.blankToNull(request.getText());
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
        String kw = request == null ? null : RuleEditSupport.blankToNull(request.getKeyword());
        String needle = kw == null ? "" : kw.toUpperCase(Locale.ROOT);
        List<DomainNode> matched = new ArrayList<>();
        for (DomainNode n : domainTreeReader.load().nodes()) {
            if (needle.isEmpty() || contains(n.stdName(), needle) || contains(n.domainName(), needle)) {
                matched.add(n);
            }
        }
        matched.sort(Comparator
                .<DomainNode>comparingInt(n -> n.stdName() != null && n.stdName().toUpperCase(Locale.ROOT).startsWith(needle) ? 0 : 1)
                .thenComparing(n -> n.stdName() == null ? "" : n.stdName().toUpperCase(Locale.ROOT)));
        return new RuleDomainSearchResult(matched.stream().limit(DOMAIN_SEARCH_LIMIT)
                .map(n -> new RuleDomainSearchResult.Row(n.domainId(), n.stdName(), n.domainName(), n.domainKind(),
                        n.dataType(), n.length(), n.scale(), n.stdRule()))
                .toList());
    }

    private static boolean contains(String value, String needle) {
        return value != null && value.toUpperCase(Locale.ROOT).contains(needle);
    }
}
