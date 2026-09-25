package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import static com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditSupport.ref;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditSupport.requireMdm;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditSupport.requireRowVersion;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditSupport.requireVer;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.check.AxisCoverage;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput.DraftRow;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveRejections;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveValidator;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdIssuer;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdKind;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdRange;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleColumnsSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.repository.MdmRuleRowRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleVarRepository;
import com.ezylang.evalex.parser.ParseException;
import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker.Problem;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-08-03 열 설정 저장(part COLUMNS) — 초안 전체를 한 번에 검사해 거부가 하나라도 있으면 아무것도 반영하지 않는다(원자 적용, 불변 2).
 * 적용은 UX_TB_MDM_RULE_VAR_SEQ(조건/결과 각각 seq 유일) 때문에 표 파트와 같은 전체 DELETE → 재 INSERT 관례(I8)를 쓴다.
 * 파사드 규칙(I25)대로 {@code @Transactional} 대신 생성자에서 만든 {@link TransactionTemplate} 이 원자성을 준다.
 *
 * <p>검사 규칙은 시안 06 열 설정 표(colCheck)와 06 문서를 그대로 옮긴 것 — 화면(column-draft.ts)이 같은 목록을 이중으로 검사한다.
 * 변수 타입 판정은 {@link RuleVarTypeResolver} 를 그대로 부른다(화면·서버가 같은 판정, I16). 식 파싱은 서버 EvalEx 가 단일 진원(불변 9):
 * 그룹 열 조건(grp_cond)·조건 식 변수(var_ast)·산출 결과 식(expr) 전부 {@link ExpressionChecker} 로 검사하고 {@link AstExporter}
 * 로 AST 를 만들어 텍스트와 같은 줄에 저장한다.
 */
@Service
public class RuleColumnsService implements RuleEditSavePart {

    static final String PART = "COLUMNS";
    private static final Set<String> VAR_KINDS = Set.of("COND", "RESULT");
    private static final Set<String> COND_DISPS = Set.of("Equal", "1", "2", "Expression");
    private static final Set<String> RESULT_DISPS = Set.of("Value", "Expression");
    private static final Set<String> AXES = Set.of("ROW", "COL", "NONE");

    private final RuleEditSupport support;
    private final RuleQueries queries;
    private final VersionWriteGuard writeGuard;
    private final MdmRuleIdIssuer issuer;
    private final RuleVarTypeResolver resolver;
    private final ExpressionChecker checker;
    private final MdmEvaluator evaluator;
    private final MdmRuleVarRepository varRepository;
    private final MdmRuleRowRepository rowRepository;
    private final EntityManager entityManager;
    private final RuleSaveValidator validator;
    private final TransactionTemplate tx;

    public RuleColumnsService(RuleEditSupport support, RuleQueries queries, VersionWriteGuard writeGuard, MdmRuleIdIssuer issuer,
                              RuleVarTypeResolver resolver, ExpressionChecker checker, MdmEvaluator evaluator,
                              MdmRuleVarRepository varRepository, MdmRuleRowRepository rowRepository, EntityManager entityManager,
                              RuleSaveValidator validator, PlatformTransactionManager transactionManager) {
        this.support = support;
        this.queries = queries;
        this.writeGuard = writeGuard;
        this.issuer = issuer;
        this.resolver = resolver;
        this.checker = checker;
        this.evaluator = evaluator;
        this.varRepository = varRepository;
        this.rowRepository = rowRepository;
        this.entityManager = entityManager;
        this.validator = validator;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Override
    public String part() {
        return PART;
    }

    /** 검사를 마친 줄 — 파싱 결과(AST JSON)까지 함께 든다(불변 9 — 파싱은 검사에서 1회). */
    private static final class Line {
        final RuleColumnsSaveRequest req;
        final int tmpId;
        String varAst;
        String grpCondAst;
        String exprAst;
        ResolvedVar resolved;

        Line(RuleColumnsSaveRequest req, int tmpId) {
            this.req = req;
            this.tmpId = tmpId;
        }

        boolean kept() {
            return !req.isDeleted();
        }
    }

    @Override
    public RuleEditSaveResult save(RuleEditSaveRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        String id = rule.getMaruRuleId();
        int ver = requireVer(request.getVer());
        long expected = requireRowVersion(request.getRowVersion());
        List<Map<String, Object>> requested = request.getRows() == null ? List.of() : request.getRows();
        boolean derive = "DERIVE".equals(rule.getRuleKind());
        String me = support.me();

        return tx.execute(status -> {
            long rowVersion = writeGuard.beginDraftWrite(ref(id, ver), expected, me);
            List<MdmRuleVar> before = queries.vars(id, ver);
            List<Line> lines = parse(requested);
            String hit = hitPolicy(derive, request.getHitPolicy(), currentHitPolicy(id, ver));
            List<Map<String, Object>> issues = new ArrayList<>();
            check(id, ver, derive, hit, lines, before, issues);
            Map<String, Integer> rowIdMap = apply(id, ver, hit, lines, before, derive);
            issues.addAll(saveChecks(id, ver, rule.getRuleKind(), hit));
            return new RuleEditSaveResult(PART, rowVersion, rowIdMap, issues, null);
        });
    }

    private List<Line> parse(List<Map<String, Object>> requested) {
        List<Line> out = new ArrayList<>(requested.size());
        int next = -1;
        for (Map<String, Object> raw : requested) {
            out.add(new Line(RuleColumnsSaveRequest.of(raw), next));
            next--;
        }
        return out;
    }

    private String hitPolicy(boolean derive, String requested, String current) {
        if (derive && requested != null) {
            throw reject("산출 룰에는 적중 정책을 두지 않습니다: " + requested);
        }
        return requested != null ? requested : current;
    }

    private String currentHitPolicy(String id, int ver) {
        List<String> hits = entityManager
                .createQuery("SELECT v.hitPolicy FROM MdmRuleVer v WHERE v.maruRuleId = :id AND v.ver = :ver", String.class)
                .setParameter("id", id).setParameter("ver", ver).getResultList();
        return hits.isEmpty() ? null : hits.get(0);
    }

    // ── 검사 — 거부가 하나라도 있으면 예외로 전체를 되돌린다(불변 2). ──

    private void check(String id, int ver, boolean derive, String hit, List<Line> lines, List<MdmRuleVar> before,
                       List<Map<String, Object>> issues) {
        Map<Integer, MdmRuleVar> current = new HashMap<>();
        for (MdmRuleVar v : before) {
            current.put(v.getVarId(), v);
        }
        Set<Integer> seen = new HashSet<>();
        for (Line line : lines) {
            RuleColumnsSaveRequest req = line.req;
            boolean cond = "COND".equals(req.varKind());
            if (req.varKind() == null || !VAR_KINDS.contains(req.varKind())) {
                throw reject("구분은 COND·RESULT 중 하나여야 합니다: " + req.varKind());
            }
            if (!req.isNew()) {
                if (!current.containsKey(req.varId())) {
                    throw reject("이 초안에 없는 var_id 입니다: " + req.varId());
                }
                if (!seen.add(req.varId())) {
                    throw reject("var_id 가 중복됩니다: " + req.varId());
                }
            }
            if (req.varName() == null) {
                throw reject((cond ? "조건 변수" : "결과 변수명") + "은(는) 필수입니다.");
            }
            Set<String> disps = cond ? COND_DISPS : RESULT_DISPS;
            if (req.dispType() == null || !disps.contains(req.dispType())) {
                throw reject("표시 타입은 " + String.join("·", disps) + " 중 하나여야 합니다: " + req.dispType());
            }
            if (derive && cond) {
                throw reject("산출 룰에는 조건 열을 둘 수 없습니다: " + req.varName());
            }
            if (derive && !"Expression".equals(req.dispType())) {
                throw reject("산출 룰의 결과 열은 식(Expression)이어야 합니다: " + req.varName());
            }
            if (req.axis() != null) {
                if (!cond) {
                    throw reject("축(axis)은 조건 열에만 둡니다: " + req.varName());
                }
                if (!AXES.contains(req.axis())) {
                    throw reject("축은 ROW·COL·NONE 중 하나여야 합니다: " + req.axis());
                }
            }
            if (cond && (req.resGrp() != null || req.grpCond() != null)) {
                throw reject("그룹과 열 조건은 결과 열에만 둡니다: " + req.varName());
            }
            if (req.expr() != null && !derive) {
                throw reject("결과 식은 산출 룰의 결과 열에만 둡니다: " + req.varName());
            }
            if (!cond && req.domainId() == null && req.dataType() == null) {
                throw reject("결과 열은 값 타입(도메인 또는 기본 타입)을 선언해야 합니다: " + req.varName());
            }
            if (cond && "Expression".equals(req.dispType()) && req.label() == null) {
                throw reject("식 변수는 표시명이 필수입니다: " + req.varName());
            }
            if (req.collectAgg() != null && !"COLLECT".equals(hit)) {
                throw reject("집계는 COLLECT 적중 정책의 결과 열에만 둡니다: " + req.varName());
            }
            if (req.prioList() != null && !req.prioList().isEmpty() && !"PRIORITY".equals(hit)) {
                throw reject("순위는 PRIORITY 적중 정책의 결과 열에만 둡니다: " + req.varName());
            }
            if (cond && !"Expression".equals(req.dispType()) && !ExpressionChecker.checkVariableName(req.varName()).isEmpty()) {
                throw reject("쓸 수 없는 변수명입니다(EvalEx 상수·예약어): " + req.varName());
            }
        }

        List<Line> kept = lines.stream().filter(Line::kept).toList();
        resolveTypes(id, ver, kept);
        checkResultNames(kept);
        checkGroups(id, ver, hit, kept);
        checkDeriveExprs(id, ver, derive, kept);
        pivotCoverWarning(id, ver, hit, kept, issues);
    }

    /** 식 파싱(불변 9)·타입 해석 — Line.resolved 를 채운다. 타입 판정은 RuleVarTypeResolver 를 그대로(I16). */
    private void resolveTypes(String id, int ver, List<Line> kept) {
        List<MdmRuleVar> tmp = new ArrayList<>(kept.size());
        for (Line line : kept) {
            RuleColumnsSaveRequest req = line.req;
            boolean cond = "COND".equals(req.varKind());
            if (cond && "Expression".equals(req.dispType())) {
                line.varAst = parseOrReject(req.varName(), Slot.RULE_COND_EXPR, "조건 식");
            }
            MdmRuleVar v = new MdmRuleVar(id, ver, line.tmpId, req.varKind(), 0);
            v.setDispType(req.dispType());
            v.setVarName(req.varName());
            v.setDomainId(req.domainId());
            v.setDataType(req.dataType());
            v.setVarAst(line.varAst);
            v.setLabel(req.label());
            tmp.add(v);
        }
        List<ResolvedVar> resolved = resolver.resolve(id, ver, tmp);
        for (int i = 0; i < kept.size(); i++) {
            Line line = kept.get(i);
            line.resolved = resolved.get(i);
            RuleColumnsSaveRequest req = line.req;
            boolean cond = "COND".equals(req.varKind());
            if (cond && !"Expression".equals(req.dispType()) && "UNRESOLVED".equals(line.resolved.typeSource())) {
                throw reject("프로그램 변수는 값 타입을 선언해야 합니다(사전 물리명이 아니면 도메인·기본 타입 필수): " + req.varName());
            }
            if (req.domainId() != null && line.resolved.domainId() == null) {
                throw reject("없는 도메인입니다: " + req.domainId());
            }
            if (!cond && "UNRESOLVED".equals(line.resolved.typeSource())) {
                throw reject("결과 열의 값 타입을 확인할 수 없습니다: " + req.varName());
            }
        }
    }

    private void checkResultNames(List<Line> kept) {
        Set<String> names = new HashSet<>();
        for (Line line : kept) {
            if ("RESULT".equals(line.req.varKind()) && !names.add(line.req.varName())) {
                throw reject("결과 변수명이 버전 안에서 중복됩니다: " + line.req.varName());
            }
        }
    }

    /** 결과 열 그룹(불변 5)·그룹 열 조건(grp_cond) 검사. */
    private void checkGroups(String id, int ver, String hit, List<Line> kept) {
        boolean grouped = kept.stream().anyMatch(l -> l.req.resGrp() != null);
        if (grouped && !"FIRST".equals(hit) && !"UNIQUE".equals(hit)) {
            throw reject("결과 열 그룹은 FIRST·UNIQUE 적중 정책에서만 둘 수 있습니다: " + hit);
        }
        Map<String, List<Line>> groups = new LinkedHashMap<>();
        for (Line line : kept) {
            if (!"RESULT".equals(line.req.varKind())) {
                continue;
            }
            if (line.req.resGrp() == null) {
                if (line.req.grpCond() != null) {
                    throw reject("그룹에 든 결과 열에만 열 조건을 둘 수 있습니다: " + line.req.varName());
                }
                continue;
            }
            if (line.req.grpCond() != null) {
                line.grpCondAst = parseOrReject(line.req.grpCond(), Slot.RULE_GRP_COND, "열 조건");
            }
            groups.computeIfAbsent(line.req.resGrp(), k -> new ArrayList<>()).add(line);
        }
        for (Map.Entry<String, List<Line>> entry : groups.entrySet()) {
            List<Line> cols = entry.getValue();
            if (cols.size() < 2) {
                throw reject("결과 열 그룹 '" + entry.getKey() + "' 은(는) 열이 2개 이상이어야 합니다.");
            }
            String type = null;
            int defaults = 0;
            boolean defaultLast = false;
            for (int i = 0; i < cols.size(); i++) {
                Line line = cols.get(i);
                if (type == null) {
                    type = line.resolved.dataType();
                } else if (!type.equals(line.resolved.dataType())) {
                    throw reject("결과 열 그룹 '" + entry.getKey() + "' 의 데이터 타입이 서로 다릅니다: "
                            + type + " vs " + line.resolved.dataType());
                }
                if (line.req.grpCond() == null) {
                    defaults++;
                    defaultLast = i == cols.size() - 1;
                }
            }
            if (defaults > 1) {
                throw reject("결과 열 그룹 '" + entry.getKey() + "' 의 기본 열(열 조건 없음)은 하나여야 합니다.");
            }
            if (defaults == 1 && !defaultLast) {
                throw reject("결과 열 그룹 '" + entry.getKey() + "' 의 기본 열은 그룹의 마지막 순서여야 합니다.");
            }
            boolean sameAsOutside = kept.stream().anyMatch(
                    l -> l.req.resGrp() == null && "RESULT".equals(l.req.varKind()) && entry.getKey().equals(l.req.varName()));
            if (sameAsOutside) {
                throw reject("그룹 이름 '" + entry.getKey() + "' 과(와) 같은 그룹 밖 결과 변수명이 있습니다.");
            }
        }
        for (Line line : kept) {
            if (line.req.grpCond() == null) {
                continue;
            }
            for (String name : evaluator.usedVariables(line.req.grpCond())) {
                String source = typeSourceOf(id, ver, name);
                if (!"COLUMN".equals(source) && !"RULE_RESULT".equals(source)) {
                    throw reject("열 조건의 참조 변수가 컬럼 사전·앞 룰 결과에 없습니다: " + name);
                }
            }
        }
    }

    /** 산출 룰 결과 식(불변 4) — 앞 seq 결과 참조만 허용. */
    private void checkDeriveExprs(String id, int ver, boolean derive, List<Line> kept) {
        if (!derive) {
            return;
        }
        List<Line> results = kept.stream().filter(l -> "RESULT".equals(l.req.varKind())).toList();
        boolean anyExpr = results.stream().anyMatch(l -> l.req.expr() != null);
        if (!anyExpr) {
            return;
        }
        if (queries.rows(id, ver).stream().noneMatch(r -> "NORMAL".equals(r.getRowKind()))) {
            throw reject("산출 룰에는 결과 식을 둘 NORMAL 행이 없습니다.");
        }
        for (int i = 0; i < results.size(); i++) {
            Line line = results.get(i);
            if (line.req.expr() == null) {
                continue;
            }
            line.exprAst = parseOrReject(line.req.expr(), Slot.RULE_RESULT_EXPR, "결과 식");
            for (String name : evaluator.usedVariables(line.req.expr())) {
                for (int j = i; j < results.size(); j++) {
                    if (results.get(j).req.varName().equals(name)) {
                        throw reject("결과 식은 자기 자신·뒤 순서의 결과 변수를 참조할 수 없습니다: " + name + " in " + line.req.varName());
                    }
                }
            }
        }
    }

    /** 축 조합 완전성은 경고로만(불변 3 — 저장은 평탄화 그대로). */
    private void pivotCoverWarning(String id, int ver, String hit, List<Line> kept, List<Map<String, Object>> issues) {
        Integer rowVar = null;
        Integer colVar = null;
        for (Line line : kept) {
            if (line.req.isNew() || !"COND".equals(line.req.varKind()) || line.req.axis() == null) {
                continue;
            }
            if ("ROW".equals(line.req.axis()) && rowVar == null) {
                rowVar = line.req.varId();
            }
            if ("COL".equals(line.req.axis()) && colVar == null) {
                colVar = line.req.varId();
            }
        }
        List<Map<Integer, Map<String, Object>>> normal = queries.rows(id, ver).stream().filter(r -> "NORMAL".equals(r.getRowKind()))
                .map(r -> RuleCellsCodec.parse(r.getCells())).toList();
        AxisCoverage.gap(hit, rowVar, colVar, normal)
                .ifPresent(message -> issues.add(Map.of("code", AxisCoverage.CODE, "severity", "WARNING", "message", message)));
    }

    /**
     * 적용 뒤 정의로 저장 시 검사(TSK-08-04 design §6.1 COLUMNS 열) — 커밋 전이라 ERROR 면 거부해 적용 전체를 되돌린다. COLUMNS 는 셀·미완성·
     * 생성·분석을 돌리지 않으므로(I18, 열 추가가 가능해야 한다) 세트 순서·MDM 참조가 거부하고 계약 변경·케이스 결과 타입이 경고한다.
     */
    private List<Map<String, Object>> saveChecks(String id, int ver, String ruleKind, String hit) {
        List<MdmRuleVar> rawVars = queries.vars(id, ver);
        List<DraftRow> rows = queries.rows(id, ver).stream()
                .map(r -> new DraftRow(r.getRowId(), r.getSeq(), r.getRowKind(), RuleCellsCodec.parse(r.getCells()))).toList();
        RuleCheckReport report = validator.validate(new RuleCheckInput(id, ver, ruleKind, hit, rawVars, resolver.resolve(id, ver, rawVars), rows,
                RuleSaveTarget.COLUMNS));
        if (report.hasErrors()) {
            throw RuleSaveRejections.reject(report.issues());
        }
        return report.issues();
    }

    // ── 적용 — 전체 DELETE → 재 INSERT + 셀 비움·삭제·산출 식 반영. ──

    private Map<String, Integer> apply(String id, int ver, String hit, List<Line> lines, List<MdmRuleVar> before, boolean derive) {
        Map<Integer, MdmRuleVar> current = new HashMap<>();
        for (MdmRuleVar v : before) {
            current.put(v.getVarId(), v);
        }
        List<Line> kept = lines.stream().filter(Line::kept).toList();
        Map<String, Integer> rowIdMap = new LinkedHashMap<>();
        int fresh = (int) kept.stream().filter(l -> l.req.isNew()).count();
        MdmRuleIdRange range = fresh > 0 ? issuer.issue(id, MdmRuleIdKind.VAR, fresh) : null;
        int issued = range != null ? range.first() - 1 : 0;

        Map<Line, Integer> finalIds = new LinkedHashMap<>();
        for (Line line : kept) {
            RuleColumnsSaveRequest req = line.req;
            if (req.isNew()) {
                issued++;
                if (req.varId() != null) {
                    rowIdMap.put(String.valueOf(req.varId()), issued);
                }
                finalIds.put(line, issued);
            } else {
                finalIds.put(line, req.varId());
            }
        }

        int condSeq = 0;
        int resultSeq = 0;
        List<MdmRuleVar> insert = new ArrayList<>(kept.size());
        for (Line line : kept) {
            RuleColumnsSaveRequest req = line.req;
            boolean cond = "COND".equals(req.varKind());
            boolean result = "RESULT".equals(req.varKind());
            MdmRuleVar v = new MdmRuleVar(id, ver, finalIds.get(line), req.varKind(), cond ? ++condSeq : ++resultSeq);
            v.setDispType(req.dispType());
            v.setAxis(cond ? (req.axis() == null ? "NONE" : req.axis()) : null);
            v.setVarName(req.varName());
            v.setVarAst(cond && "Expression".equals(req.dispType()) ? line.varAst : null);
            v.setDomainId(req.domainId());
            v.setDataType(req.dataType());
            // JPA 가 DB 기본값을 덮으므로(불변 10) COLLECT 결과 열의 기본 집계를 여기서 정한다(06: collect_agg 는 COLLECT 결과열만, 기본 'LIST').
            v.setCollectAgg(req.collectAgg() != null ? req.collectAgg() : ("COLLECT".equals(hit) && result ? "LIST" : null));
            v.setPrioList(req.prioList() == null || req.prioList().isEmpty() ? null : DomainJson.write(req.prioList()));
            v.setResGrp(result ? req.resGrp() : null);
            v.setGrpCond(result ? req.grpCond() : null);
            v.setGrpCondAst(result && req.grpCond() != null ? line.grpCondAst : null);
            v.setLabel(req.label());
            v.setDescription(req.description());
            insert.add(v);
        }

        entityManager.createQuery("DELETE FROM MdmRuleVar v WHERE v.maruRuleId = :id AND v.ver = :ver")
                .setParameter("id", id).setParameter("ver", ver).executeUpdate();
        // 검사에서 로드한 기존 줄 엔티티가 영속 컨텍스트에 남아 있으면 재 INSERT 가 merge → UPDATE(0행) 로 간다 — 표 파트가
        // before 를 로드하지 않아 이 문제를 모르는 것과 같은 효과를 낸다. bulk DELETE 는 컨텍스트를 못 치우므로 여기서 치운다.
        entityManager.clear();
        varRepository.saveAll(insert);
        updateCells(id, ver, lines, kept, finalIds, current, derive);
        return rowIdMap;
    }

    /** 표시 타입·조건 변수 변경 열의 셀 비움(불변 8)·삭제 열 제거·산출 식 셀 반영. */
    private void updateCells(String id, int ver, List<Line> lines, List<Line> kept, Map<Line, Integer> finalIds,
                             Map<Integer, MdmRuleVar> current, boolean derive) {
        Set<Integer> clear = new HashSet<>();
        for (Line line : lines) {
            RuleColumnsSaveRequest req = line.req;
            if (req.isNew()) {
                continue;
            }
            if (req.isDeleted()) {
                clear.add(req.varId());
                continue;
            }
            MdmRuleVar old = current.get(req.varId());
            boolean cond = "COND".equals(req.varKind());
            if (old != null && (!old.getDispType().equals(req.dispType()) || (cond && !old.getVarName().equals(req.varName())))) {
                clear.add(req.varId());
            }
        }
        Map<Integer, Map<String, String>> exprs = new LinkedHashMap<>();
        if (derive) {
            for (Line line : kept) {
                if (line.req.expr() != null) {
                    exprs.put(finalIds.get(line), Map.of("expr", line.req.expr(), "ast", line.exprAst));
                }
            }
        }
        if (clear.isEmpty() && exprs.isEmpty()) {
            return;
        }
        List<MdmRuleRow> changed = new ArrayList<>();
        for (MdmRuleRow row : queries.rows(id, ver)) {
            if (!"NORMAL".equals(row.getRowKind())) {
                continue;
            }
            Map<Integer, Map<String, Object>> cells = RuleCellsCodec.parse(row.getCells());
            boolean dirty = false;
            for (Integer varId : clear) {
                if (cells.remove(varId) != null) {
                    dirty = true;
                }
            }
            for (Map.Entry<Integer, Map<String, String>> e : exprs.entrySet()) {
                cells.put(e.getKey(), new LinkedHashMap<>(e.getValue()));
                dirty = true;
            }
            if (dirty) {
                row.setCells(RuleCellsCodec.write(cells));
                changed.add(row);
            }
        }
        rowRepository.saveAll(changed);
    }

    // ── 파싱 헬퍼(불변 9 — 서버 EvalEx 단일 진원). ──

    /** 검사를 통과하면 AST JSON 을 돌려준다 — 파싱은 여기서 1회, apply 는 이 값을 그대로 저장한다. */
    private String parseOrReject(String text, Slot slot, String field) {
        for (Problem p : checker.check(text, slot)) {
            if (!ExpressionChecker.VARIABLE.equals(p.kind())) {
                throw reject(field + " 검사 실패(" + p.kind() + "): " + p.detail());
            }
        }
        return DomainJson.write(ast(text));
    }

    private Map<String, Object> ast(String text) {
        try {
            return AstExporter.export(text, evaluator.configuration());
        } catch (ParseException e) {
            throw reject("식을 파싱할 수 없습니다: " + text);
        }
    }

    /** 이름 하나의 타입 소스 — RuleVarTypeResolver 의 판정을 그대로(컬럼 사전·앞 룰 결과인지). */
    private String typeSourceOf(String id, int ver, String name) {
        MdmRuleVar tmp = new MdmRuleVar(id, ver, 0, "COND", 1);
        tmp.setDispType("Equal");
        tmp.setVarName(name);
        return resolver.resolve(id, ver, List.of(tmp)).get(0).typeSource();
    }

    private static BusinessException reject(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }
}
