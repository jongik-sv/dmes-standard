/*
 * 작성자: Agent
 * 작성일: 2026-09-24
 * 내용: domainMng (도메인 관리) OASIS 서비스 — search / view / validate / execute / save / delete 6 action
 */
package com.dongkuk.dmes.mdm.dma.domainMng.service;

import com.dongkuk.dmes.mdm.common.dictionary.DomainChainAssembler;
import com.dongkuk.dmes.mdm.common.dictionary.DomainImpactQueries;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeReader;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainImpact;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainImpactLookup;
import com.dongkuk.dmes.mdm.contract.dictionary.MdmDomainReference;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainDeleteRequest;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainDraftRequest;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainMngSearchRequest;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainMngViewRequest;
import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainPreviewRequest;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmUnitRepository;
import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 도메인 관리({@code domainMng}) OASIS 진입 서비스(TSK-04-03 design.md §3.1).
 *
 * <p>정본: 기능설계서 {@code docs/mdm/screens/domainMng/domainMng_기능설계서.md}, 구현 설계 {@code docs/mdm/tasks/TSK-04-03/design.md}.
 * BPMN {@code services/dma/domainMng.bpmn} 의 {@code actionGateway} 6 분기와 1:1 이다. 쓰기는 {@code save}·{@code delete} 만 한다(불변 I16).
 *
 * <p>부모 연결·교체·제거(D-132)는 따로 액션을 두지 않고 {@code validate}(경고 미리보기) → {@code save}(확인 후 쓰기)로 한다.
 * 액션 이름은 RBAC 키라 {@code MdmActions} 어휘 안에서만 고르고, 두 단계 흐름·하위 재검사·동시 수정 검사·롤백이 이미 거기 있다.
 * 부모가 없어지면 {@link DomainUnlinkMaterializer} 가 상속받던 값을 초안에 복사한 뒤 같은 검사를 돈다.
 *
 * <p>{@code delete} 는 컬럼·룰 변수를 JPA 로 고쳐야 해서 {@link TransactionTemplate}(REQUIRED)으로 감싼다(MetaRevisionRecorder 와 같은 방식).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다.</b> 붙이면 CGLIB 프록시가 파라미터 이름을 잃어 OASIS 바인딩이
 * {@code ParameterName must not be null} 로 죽는다. 트랜잭션은 OASIS action 한 건이다 — {@code save} 가 하위 재검사에서
 * 던지면 {@code SpringTransactionHandler} 가 자기 행 쓰기까지 되돌린다(F3, 불변 I6).
 *
 * <p>DB 읽기는 요청 스레드에서 스냅샷으로 끝내고, 식 평가(엔진 가상 스레드)는 순수 계산이다(불변 I11).
 */
@Service("domainMngService")
public class DomainMngService {

    private static final Pattern STD_NAME = Pattern.compile("^[A-Z][A-Z0-9_]*$");
    private static final String FALLBACK_COLUMN = "VALUE";
    private static final Set<DomainIssueCode> COMPILE_CODES =
            EnumSet.of(DomainIssueCode.R01, DomainIssueCode.R02, DomainIssueCode.R04, DomainIssueCode.S05);

    private final DomainTreeReader reader;
    private final DomainChainAssembler assembler;
    private final DomainRuleChecker checker;
    private final DomainTestCaseRunner runner;
    private final DomainChangeClassifier classifier;
    private final DomainUnlinkMaterializer materializer;
    private final DomainExpressionCompiler compiler;
    private final DomainImpactQueries queries;
    private final MdmDomainImpactLookup impactLookup;
    private final MdmDomainRepository domainRepository;
    private final MdmUnitRepository unitRepository;
    private final MetaRevisionRecorder recorder;
    private final EntityManager entityManager;
    private final TransactionTemplate tx;

    public DomainMngService(DomainTreeReader reader, DomainChainAssembler assembler, DomainRuleChecker checker,
                            DomainTestCaseRunner runner, DomainChangeClassifier classifier,
                            DomainUnlinkMaterializer materializer, DomainExpressionCompiler compiler,
                            DomainImpactQueries queries,
                            MdmDomainImpactLookup impactLookup, MdmDomainRepository domainRepository,
                            MdmUnitRepository unitRepository, MetaRevisionRecorder recorder,
                            EntityManager entityManager, PlatformTransactionManager transactionManager) {
        this.reader = reader;
        this.assembler = assembler;
        this.checker = checker;
        this.runner = runner;
        this.classifier = classifier;
        this.materializer = materializer;
        this.compiler = compiler;
        this.queries = queries;
        this.impactLookup = impactLookup;
        this.domainRepository = domainRepository;
        this.unitRepository = unitRepository;
        this.recorder = recorder;
        this.entityManager = entityManager;
        this.tx = new TransactionTemplate(transactionManager);
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — 일치 행 + 그 조상(트리 모양 유지), DFS 순서
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> search(DomainMngSearchRequest request) {
        DomainTreeSnapshot snapshot = reader.load();
        String keyword = request.getKeyword() == null || request.getKeyword().isBlank()
                ? null : request.getKeyword().trim().toLowerCase(Locale.ROOT);
        String kind = request.getDomainKind() == null || request.getDomainKind().isBlank() ? null : request.getDomainKind().trim();
        Set<Long> matched = new HashSet<>();
        for (DomainNode n : snapshot.nodes()) {
            boolean byKeyword = keyword == null || contains(n.domainName(), keyword) || contains(n.stdName(), keyword);
            boolean byKind = kind == null || kind.equals(n.domainKind());
            if (byKeyword && byKind) {
                matched.add(n.domainId());
            }
        }
        Set<Long> include = new HashSet<>(matched);
        for (Long id : matched) {
            Set<Long> seen = new HashSet<>();
            Long cur = snapshot.find(id).map(DomainNode::parentDomainId).orElse(null);
            while (cur != null && seen.add(cur) && snapshot.find(cur).isPresent()) {
                include.add(cur);
                cur = snapshot.find(cur).get().parentDomainId();
            }
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        for (DomainTreeSnapshot.Positioned p : snapshot.dfs()) {
            if (include.contains(p.node().domainId())) {
                Map<String, Object> row = row(snapshot, p.node(), p.depth());
                row.put("MATCHED", matched.contains(p.node().domainId()));
                rows.add(row);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domains", rows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: view — 상세 + 요구 변수 + 영향도
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> view(DomainMngViewRequest request) {
        DomainTreeSnapshot snapshot = reader.load();
        DomainNode node = snapshot.find(request.getDomainId())
                .orElseThrow(() -> DomainRejections.notFound(request.getDomainId()));
        int depth = snapshot.cyclic(node.domainId()) ? 0 : snapshot.chainRootFirst(node.domainId()).size() - 1;
        Map<String, Object> domain = row(snapshot, node, depth);
        domain.put("DESCRIPTION", node.description());
        domain.put("EXAMPLES", DomainTestCases.examplesFromJson(node.examplesJson()));
        domain.put("TEST_CASES", DomainTestCases.toRows(DomainTestCases.fromJson(node.testCasesJson())));
        EffectiveDomainView view = effective(snapshot, node.domainId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domain", domain);
        out.put("requiredVars", requiredVarRows(view == null ? List.of() : view.bizRequiredVars()));
        out.put("impact", impactTable(node.domainId(), snapshot));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: validate — 전부 검사, 쓰기 없음
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> validate(DomainDraftRequest request, List<Map<String, Object>> testCases,
                                        List<Map<String, Object>> examples) {
        DomainTreeSnapshot snapshot = reader.load();
        Check check = check(DomainDraft.from(request, testCases, examples), snapshot);
        DomainDraft draft = check.draft();
        List<DomainIssue> issues = new ArrayList<>(check.issues());
        List<Map<String, Object>> results = new ArrayList<>(check.results());
        if (DomainChangeClassifier.rechecksDescendants(check.classification().kind()) && check.stored() != null
                && check.node() != null) {
            // 저장 경로의 하위 재검사(쓰고 나서 DB 기준)를 초안을 얹은 메모리 스냅샷으로 미리 보여 준다
            DomainTreeSnapshot memory = snapshot.withDraft(check.node());
            issues.addAll(checker.descendantLengthIssues(memory, draft.nodeId()));
            Descendants d = runDescendants(memory, draft.nodeId());
            issues.addAll(d.issues());
            results.addAll(d.results());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", issues.stream().noneMatch(DomainIssue::isError));
        out.put("issues", issues.stream().map(DomainIssue::toRow).toList());
        out.put("classification", check.classification().kind());
        out.put("diff", check.classification().diff());
        out.put("testResults", results);
        out.put("effective", effectiveRow(check.view()));
        out.put("requiredVars", requiredVarRows(check.view() == null ? List.of() : check.view().bizRequiredVars()));
        out.put("impact", check.stored() == null ? emptyImpact() : impactTable(check.stored().domainId(), snapshot));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: execute — 서버 미리보기(비즈니스식·편집 중 식), 쓰기 없음
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> execute(DomainPreviewRequest request, List<Map<String, Object>> vars) {
        DomainDraft draft = new DomainDraft(request.getDomainId(), null, null, DomainDraft.norm(request.getStdName()),
                request.getParentDomainId(), DomainDraft.norm(request.getDomainKind()), DomainDraft.norm(request.getDataType()),
                request.getLength(), request.getScale(), null, DomainDraft.norm(request.getMaruCodeId()), DomainDraft.norm(request.getCateId()),
                DomainDraft.norm(request.getStdRule()), DomainDraft.norm(request.getBizRule()), null, List.of(), List.of());
        List<DomainIssue> compile = new ArrayList<>();
        compile.addAll(compiler.check(draft.stdRule(), Slot.DOMAIN_STD, "STD_RULE"));
        compile.addAll(compiler.check(draft.bizRule(), Slot.DOMAIN_BIZ, "BIZ_RULE"));
        compile.removeIf(i -> !COMPILE_CODES.contains(i.code()));
        DomainTreeSnapshot snapshot = reader.load();
        DomainNode node = draft.toNode(compiler.ast(draft.stdRule()), compiler.ast(draft.bizRule()), null);
        EffectiveDomainView view = null;
        try {
            view = assembler.assemble(snapshot.withDraft(node).chainRootFirst(node.domainId()));
        } catch (DomainTreeSnapshot.CycleException e) {
            compile.add(DomainIssue.of(DomainIssueCode.R07, "PARENT_DOMAIN_ID", e.getMessage()));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("effStdExpr", view == null ? null : view.stdExpr());
        out.put("effStdAst", view == null ? null : view.stdAstJson());
        out.put("effBizExpr", view == null ? null : view.bizExpr());
        out.put("bizRequiredVars", view == null ? List.of() : view.bizRequiredVars());
        out.put("compileIssues", compile.stream().map(DomainIssue::toRow).toList());
        if (compile.isEmpty() && view != null) {
            out.putAll(runner.preview(view, column(draft.stdName()), request.getValue(), varMap(vars)));
        }
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: save — 검사 → 자기 행 쓰기 → (값 정의 변경이면) 같은 트랜잭션에서 하위 재검사
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> save(DomainDraftRequest request, List<Map<String, Object>> testCases,
                                    List<Map<String, Object>> examples) {
        DomainDraft requested = DomainDraft.from(request, testCases, examples);
        // 1 스냅샷(요청 스레드) · 대상 존재 · 동시 수정(D5)
        DomainTreeSnapshot snapshot = reader.load();
        MdmDomain entity = null;
        if (requested.domainId() != null) {
            entity = domainRepository.findById(requested.domainId()).orElse(null);
            if (entity != null && !Objects.equals(requested.ver(), entity.getVersion())) {
                throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
            }
        }
        // 2 자기 행 검사 — 전부 모은다(연결 제거면 구체화한 초안으로). 하위 도메인은 여기서 보지 않는다(쓰고 나서 DB 기준, 불변 I6)
        Check check = check(requested, snapshot);
        DomainDraft draft = check.draft();
        if (check.issues().stream().anyMatch(DomainIssue::isError)) {
            throw DomainRejections.reject(check.issues());
        }
        // 3 자기 값만 쓴다(파생값·배포 순번 없음, 불변 I1·I10)
        if (entity == null) {
            entity = new MdmDomain(draft.domainName(), draft.stdName(), draft.domainKind(), draft.dataType());
        }
        apply(entity, draft);
        entity = domainRepository.saveAndFlush(entity);
        // 4 값 정의·부모 변경 — 같은 트랜잭션에서 다시 읽어 하위 구조 제약·테스트 케이스 재실행. 실패하면 던져 전체를 되돌린다
        List<DomainIssue> warnings = new ArrayList<>(check.issues());
        List<Long> rerun = new ArrayList<>();
        if (DomainChangeClassifier.rechecksDescendants(check.classification().kind())) {
            DomainTreeSnapshot written = reader.load();
            List<DomainIssue> after = new ArrayList<>(checker.descendantLengthIssues(written, entity.getDomainId()));
            Descendants d = runDescendants(written, entity.getDomainId());
            after.addAll(d.issues());
            if (after.stream().anyMatch(DomainIssue::isError)) {
                throw DomainRejections.reject(after);
            }
            warnings.addAll(after);
            rerun.addAll(d.rerunIds());
        }
        // 5 메타 캐시 무효화 — 이 도메인·하위 도메인·참조 컬럼(spec 2026-10-02 §3.2). 같은 트랜잭션이라 위에서 던지면 남지 않는다.
        //   이름·정의·예시·테스트 케이스만 바뀐(COMPATIBLE) 저장이 아니면 그 컬럼을 쓰는 RELEASED 전문까지 펼친다 — 전문 합성의 타입·단위·소수가
        //   유효 도메인에서 온다(검토 I1). 구조·부모·값 정의 변경은 판정 없이 펼친다(의심스러우면 거는 쪽)
        recorder.domain(entity.getDomainId(),
                !DomainChangeClassifier.COMPATIBLE.equals(check.classification().kind()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domainId", entity.getDomainId());
        out.put("ver", entity.getVersion());
        out.put("classification", check.classification().kind());
        out.put("warnings", warnings.stream().filter(i -> !i.isError()).map(DomainIssue::toRow).toList());
        out.put("rerunDomainIds", rerun);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: delete — 하위 도메인은 지우는 도메인의 부모로 올리고(값 흡수), 참조는 부모로 옮기거나(없으면) 비운 뒤 행을 지운다
    // ────────────────────────────────────────────────────────────────

    /**
     * 도메인 1행 삭제. 한 OASIS action 트랜잭션에서 다음을 한다. 중간에 던지면 전부 되돌린다.
     *
     * <ol>
     *   <li>동시 수정 검사(D5).</li>
     *   <li>직속 하위 도메인을 지우는 도메인의 부모로 올린다. 지우는 도메인의 자기 값을 하위에 흡수해 유효 정의를 지킨다
     *       ({@link DomainUnlinkMaterializer#absorb}). 쓰기 전에 메모리 스냅샷으로 하위마다 저장 검사·테스트 케이스를 돌려, 삭제 전에는 없던
     *       오류가 생기면 거부한다. 삭제 전에도 있던 오류는 막지 않고 {@code preexistingIssues} 로 돌려준다.</li>
     *   <li>참조 컬럼({@code TB_MDM_COLUMN})과 룰 변수({@code TB_MDM_RULE_VAR})의 {@code DOMAIN_ID} 를 지우는 도메인의 부모로 옮긴다.
     *       부모가 없으면 비운다. 룰 변수는 타입을 잃지 않게 {@code DATA_TYPE} 이 비어 있으면 지우는 도메인의 유효 데이터 타입을 넣는다.</li>
     *   <li>메타 변경 기록 — 쓰기 전에 지우는 도메인·하위·참조 컬럼·전문을 펼친다(쓰고 나면 참조가 사라져 펼칠 수 없다). 룰 변수를 옮긴 룰도 기록한다.</li>
     * </ol>
     */
    public Map<String, Object> delete(DomainDeleteRequest request) {
        // REQUIRED — OASIS action 트랜잭션에 합류하고, 없으면(서비스 직접 호출 시험) 스스로 연다. 던지면 전부 되돌린다.
        return tx.execute(status -> deleteInTx(request));
    }

    private Map<String, Object> deleteInTx(DomainDeleteRequest request) {
        if (request == null || request.getDomainId() == null) {
            throw DomainRejections.notFound(null);
        }
        Long id = request.getDomainId();
        MdmDomain entity = domainRepository.findById(id).orElseThrow(() -> DomainRejections.notFound(id));
        if (!Objects.equals(request.getVer(), entity.getVersion())) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
        DomainTreeSnapshot snapshot = reader.load();
        DomainNode removed = snapshot.find(id).orElseThrow(() -> DomainRejections.notFound(id));
        Long newParent = removed.parentDomainId();
        EffectiveDomainView removedView = effective(snapshot, id);

        // 1 하위 도메인 — 흡수한 초안을 메모리 스냅샷에 얹고 검사한다(쓰기 없음)
        List<DomainNode> children = snapshot.children(id);
        List<DomainDraft> drafts = new ArrayList<>();
        DomainTreeSnapshot memory = snapshot;
        for (DomainNode child : children) {
            DomainDraft draft = materializer.absorb(child, removed).draft();
            drafts.add(draft);
            memory = memory.withDraft(draft.toNode(compiler.ast(draft.stdRule()), compiler.ast(draft.bizRule()), child.ver()));
        }
        // 삭제 전에도 있던 오류(예: 코드 참조 없는 CODE 트리의 R09)는 삭제가 만든 것이 아니므로 막지 않는다.
        // 흡수로 유효 정의가 같아서, 삭제 뒤에 새로 생긴 오류만 거부한다. 기존 오류는 결과의 preexistingIssues 로 알린다.
        List<DomainIssue> baseline = new ArrayList<>();
        for (DomainNode child : children) {
            baseline.addAll(childIssues(asIs(child), snapshot));
        }
        Set<String> known = new HashSet<>();
        for (DomainIssue i : baseline) {
            if (i.isError()) {
                known.add(issueKey(i));
            }
        }
        List<DomainIssue> issues = new ArrayList<>();
        for (DomainDraft draft : drafts) {
            issues.addAll(childIssues(draft, memory));
        }
        List<DomainIssue> preexisting = issues.stream().filter(i -> i.isError() && known.contains(issueKey(i))).toList();
        issues.removeAll(preexisting);
        if (issues.stream().anyMatch(DomainIssue::isError)) {
            throw DomainRejections.reject(issues);
        }

        // 2 메타 변경 기록 — 참조가 남아 있을 때 펼친다(같은 트랜잭션이라 아래에서 던지면 남지 않는다)
        recorder.domain(id, true);

        // 3 하위 도메인 쓰기
        List<Long> moved = new ArrayList<>();
        for (DomainDraft draft : drafts) {
            MdmDomain child = domainRepository.findById(draft.domainId()).orElseThrow(() -> DomainRejections.notFound(draft.domainId()));
            apply(child, draft);
            domainRepository.saveAndFlush(child);
            moved.add(child.getDomainId());
        }

        // 4 참조 컬럼·룰 변수 옮기기
        List<MdmColumn> columns = entityManager
                .createQuery("select c from MdmColumn c where c.domainId = :id", MdmColumn.class)
                .setParameter("id", id).getResultList();
        for (MdmColumn c : columns) {
            c.setDomainId(newParent);
        }
        List<MdmRuleVar> vars = entityManager
                .createQuery("select v from MdmRuleVar v where v.domainId = :id", MdmRuleVar.class)
                .setParameter("id", id).getResultList();
        Set<String> rules = new LinkedHashSet<>();
        String fallbackType = removedView == null ? removed.dataType() : removedView.dataType();
        for (MdmRuleVar v : vars) {
            v.setDomainId(newParent);
            if (newParent == null && (v.getDataType() == null || v.getDataType().isBlank())) {
                v.setDataType(fallbackType);
            }
            rules.add(v.getMaruRuleId());
        }
        entityManager.flush();

        // 5 행 삭제 → 쓰고 난 DB 기준 하위 재검사(쓰기 전 검사와 같은 결과여야 한다. 다르면 되돌린다)
        domainRepository.delete(entity);
        domainRepository.flush();
        DomainTreeSnapshot written = reader.load();
        List<DomainIssue> after = new ArrayList<>();
        for (Long childId : moved) {
            after.addAll(checker.descendantLengthIssues(written, childId));
            after.addAll(runDescendants(written, childId).issues());
        }
        after.removeIf(i -> i.isError() && known.contains(issueKey(i)));
        if (after.stream().anyMatch(DomainIssue::isError)) {
            throw DomainRejections.reject(after);
        }
        for (String ruleId : rules) {
            recorder.rule(ruleId);
        }
        issues.addAll(after);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("domainId", id);
        out.put("newParentDomainId", newParent);
        out.put("movedDomainIds", moved);
        out.put("movedColumnCount", columns.size());
        out.put("movedRuleVarCount", vars.size());
        out.put("warnings", issues.stream().filter(i -> !i.isError()).map(DomainIssue::toRow).toList());
        out.put("preexistingIssues", preexisting.stream().map(DomainIssue::toRow).toList());
        return out;
    }

    /** 저장된 하위 행 그대로의 초안 — 삭제 전 기준 검사용. */
    private static DomainDraft asIs(DomainNode n) {
        return new DomainDraft(n.domainId(), n.ver(), n.domainName(), n.stdName(), n.parentDomainId(), n.domainKind(),
                n.dataType(), n.length(), n.scale(), n.unitCode(), n.maruCodeId(), n.cateId(), n.stdRule(), n.bizRule(),
                n.description(), DomainTestCases.fromJson(n.testCasesJson()), DomainTestCases.examplesFromJson(n.examplesJson()));
    }

    /** 삭제 전·후 오류 비교 키 — 메시지는 부모 값이 들어가 달라지므로 코드·칸·대상만 본다. */
    private static String issueKey(DomainIssue i) {
        return i.code() + "|" + i.field() + "|" + i.itemKey();
    }

    /** 삭제로 올리는 하위 1건 검사 — 저장 검사 + 결과 타입 + 자기 테스트 케이스 + 그 아래 길이·테스트 케이스(메모리 스냅샷 기준). */
    private List<DomainIssue> childIssues(DomainDraft draft, DomainTreeSnapshot memory) {
        List<DomainIssue> issues = new ArrayList<>();
        for (DomainIssue i : checker.check(draft, memory, facts())) {
            issues.add(i.itemKey() == null ? DomainIssue.of(i.code(), i.field(), String.valueOf(draft.domainId()),
                    "하위 도메인 " + draft.domainName() + "(" + draft.domainId() + ") " + nullToEmpty(i.message())) : i);
        }
        issues.addAll(runner.checkResultTypes(draft));
        EffectiveDomainView view = effective(memory, draft.domainId());
        if (view != null) {
            for (int i = 0; i < draft.testCases().size(); i++) {
                DomainTestCase c = draft.testCases().get(i);
                DomainTestCaseRunner.CaseResult r = runner.run(view, column(draft.stdName()), c);
                if (r.result().equals("MISMATCH") || r.result().equals("ERROR")) {
                    issues.add(DomainIssue.of(DomainIssueCode.R08, "TEST_CASES", String.valueOf(draft.domainId()),
                            "하위 도메인 " + draft.domainName() + "(" + draft.domainId() + ") 케이스 " + (i + 1) + " 입력 " + shown(c.value())
                                    + " 기대 " + c.expect() + " → " + r.result()));
                }
            }
        }
        issues.addAll(checker.descendantLengthIssues(memory, draft.domainId()));
        issues.addAll(runDescendants(memory, draft.domainId()).issues());
        return issues;
    }

    /** 메시지 속 입력값 — 빈 값은 보이지 않으므로 "(빈 값)" 으로 쓴다. */
    private static String shown(String value) {
        return value == null || value.isEmpty() ? "(빈 값)" : value;
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    // ────────────────────────────────────────────────────────────────
    // 내부
    // ────────────────────────────────────────────────────────────────

    /** @param draft 검사한 초안 — 연결 제거면 구체화한 것. 저장은 이 값을 쓴다 */
    private record Check(DomainDraft draft, List<DomainIssue> issues, DomainChangeClassifier.Classification classification,
                         List<Map<String, Object>> results, EffectiveDomainView view, DomainNode node, DomainNode stored) {}

    private record Descendants(List<DomainIssue> issues, List<Map<String, Object>> results, List<Long> rerunIds) {}

    /** 자기 행 검사 — (연결 제거면 구체화) 거부 조건·경고 + 결과 타입 + 자기 테스트 케이스 + 부모 변경 경고. */
    private Check check(DomainDraft requested, DomainTreeSnapshot snapshot) {
        DomainNode stored = requested.domainId() == null ? null : snapshot.find(requested.domainId()).orElse(null);
        DomainUnlinkMaterializer.Result materialized = materializer.materialize(stored, requested, snapshot);
        DomainDraft draft = materialized.draft();
        List<DomainIssue> issues = new ArrayList<>(checker.check(draft, snapshot, facts()));
        issues.addAll(runner.checkResultTypes(draft));
        DomainChangeClassifier.Classification classification = classifier.classify(stored, draft);
        if (DomainChangeClassifier.PARENT_CHANGE.equals(classification.kind())) {
            issues.add(parentImpact(stored, draft, snapshot));
            if (!materialized.fields().isEmpty()) {
                issues.add(DomainIssue.of(DomainIssueCode.W05, "PARENT_DOMAIN_ID", String.join(", ", materialized.fields())));
            }
        }
        DomainNode node = draft.toNode(compiler.ast(draft.stdRule()), compiler.ast(draft.bizRule()),
                stored == null ? null : stored.ver());
        EffectiveDomainView view = null;
        boolean cycle = issues.stream().anyMatch(i -> i.code() == DomainIssueCode.R07);
        boolean parentMissing = draft.parentDomainId() != null && snapshot.find(draft.parentDomainId()).isEmpty();
        if (!cycle && !parentMissing) {
            try {
                view = assembler.assemble(snapshot.withDraft(node).chainRootFirst(node.domainId()));
            } catch (DomainTreeSnapshot.CycleException e) {
                view = null;
            }
        }
        List<Map<String, Object>> results = new ArrayList<>();
        if (view != null) {
            boolean undecided = false;
            for (int i = 0; i < draft.testCases().size(); i++) {
                DomainTestCase c = draft.testCases().get(i);
                DomainTestCaseRunner.CaseResult r = runner.run(view, column(draft.stdName()), c);
                results.add(resultRow(draft.domainId(), draft.domainName(), true, i, c, r));
                // 행 모양 오류(S06, 예: 빈 입력)는 검사기가 이미 알렸다 — 같은 케이스를 R08 로 두 번 알리지 않는다
                if (c.problem() == null && (r.result().equals("MISMATCH") || r.result().equals("ERROR"))) {
                    issues.add(DomainIssue.of(DomainIssueCode.R08, "TEST_CASES", String.valueOf(i),
                            "케이스 " + (i + 1) + " 입력 " + shown(c.value()) + " 기대 " + c.expect() + " → " + r.result() + " " + r.message()));
                }
                undecided |= r.result().equals("UNDECIDED");
            }
            if (undecided && issues.stream().noneMatch(i -> i.code() == DomainIssueCode.W02)) {
                issues.add(DomainIssue.of(DomainIssueCode.W02, "TEST_CASES", "코드 판정이 필요한 케이스를 판정하지 않았다"));
            }
        }
        return new Check(draft, issues, classification, results, view, node, stored);
    }

    /** W04 — 부모 변경 영향(참조 컬럼 수는 자기와 하위 도메인을 참조하는 컬럼, 영향도 표와 같은 재귀 조회). */
    private DomainIssue parentImpact(DomainNode stored, DomainDraft draft, DomainTreeSnapshot snapshot) {
        Set<Long> descendants = new HashSet<>();
        Set<Long> columns = new HashSet<>();
        for (DomainImpactQueries.SubtreeRow r : queries.subtree(stored.domainId())) {
            if (r.depth() >= 1 && !r.domainId().equals(stored.domainId())) {
                descendants.add(r.domainId());
            }
            if (r.columnId() != null) {
                columns.add(r.columnId());
            }
        }
        String effect = draft.parentDomainId() == null
                ? "연결 제거 — 유효 정의는 그대로다"
                : "유효 정의가 새 부모 기준으로 바뀐다";
        return DomainIssue.of(DomainIssueCode.W04, "PARENT_DOMAIN_ID", "부모 " + domainLabel(stored.parentDomainId(), snapshot)
                + " → " + domainLabel(draft.parentDomainId(), snapshot) + ", 참조 컬럼 " + columns.size() + "개, 하위 도메인 "
                + descendants.size() + "개 — " + effect);
    }

    private static String domainLabel(Long id, DomainTreeSnapshot snapshot) {
        if (id == null) {
            return "(없음)";
        }
        return snapshot.find(id).map(n -> n.domainName() + "(" + id + ")").orElse(String.valueOf(id));
    }

    /** 하위 도메인 테스트 케이스 재실행 — 주어진 스냅샷(검증: 메모리, 저장: 쓰고 난 DB) 기준 유효 정의로. */
    private Descendants runDescendants(DomainTreeSnapshot snapshot, long targetId) {
        List<DomainIssue> issues = new ArrayList<>();
        List<Map<String, Object>> results = new ArrayList<>();
        List<Long> rerun = new ArrayList<>();
        boolean undecided = false;
        for (Long id : snapshot.descendants(targetId)) {
            DomainNode n = snapshot.find(id).orElseThrow();
            List<DomainTestCase> cases = DomainTestCases.fromJson(n.testCasesJson());
            if (cases.isEmpty()) {
                continue;
            }
            EffectiveDomainView view;
            try {
                view = assembler.assemble(snapshot.chainRootFirst(id));
            } catch (DomainTreeSnapshot.CycleException e) {
                continue;
            }
            rerun.add(id);
            for (int i = 0; i < cases.size(); i++) {
                DomainTestCase c = cases.get(i);
                DomainTestCaseRunner.CaseResult r = runner.run(view, column(n.stdName()), c);
                results.add(resultRow(id, n.domainName(), false, i, c, r));
                if (r.result().equals("MISMATCH") || r.result().equals("ERROR")) {
                    issues.add(DomainIssue.of(DomainIssueCode.R08, "TEST_CASES", String.valueOf(id),
                            "하위 도메인 " + n.domainName() + "(" + id + ") 케이스 " + (i + 1) + " 입력 " + shown(c.value())
                                    + " 기대 " + c.expect() + " → " + r.result()));
                }
                undecided |= r.result().equals("UNDECIDED");
            }
        }
        if (undecided) {
            issues.add(DomainIssue.of(DomainIssueCode.W02, "TEST_CASES", "하위 도메인의 코드 판정 케이스를 판정하지 않았다"));
        }
        return new Descendants(issues, results, rerun);
    }

    private void apply(MdmDomain e, DomainDraft d) {
        boolean code = "CODE".equals(d.domainKind());
        e.setDomainName(d.domainName());
        e.setStdName(d.stdName());
        e.setParentDomainId(d.parentDomainId());
        e.setDomainKind(d.domainKind());
        e.setDataType(d.dataType());
        e.setLength(d.length());
        e.setScale(d.scale());
        e.setUnitCode(d.unitCode());
        e.setMaruCodeId(d.maruCodeId());
        e.setCateId(d.cateId());
        e.setStdRule(code ? null : d.stdRule());
        e.setStdAst(code ? null : compiler.astJson(d.stdRule()));
        e.setBizRule(d.bizRule());
        e.setBizAst(compiler.astJson(d.bizRule()));
        e.setDescription(d.description());
        e.setExamples(DomainTestCases.examplesToJson(d.examples()));
        e.setTestCases(DomainTestCases.toJson(d.testCases()));
    }

    private DomainRuleChecker.DictionaryFacts facts() {
        return new DomainRuleChecker.DictionaryFacts() {
            @Override
            public boolean unitExists(String unitCode) {
                return unitRepository.existsById(unitCode);
            }

            @Override
            public Set<String> registeredPhysNames(Collection<String> physNames) {
                return queries.columnNamesByPhysName(physNames).keySet();
            }
        };
    }

    private EffectiveDomainView effective(DomainTreeSnapshot snapshot, Long id) {
        try {
            return assembler.assemble(snapshot.chainRootFirst(id));
        } catch (DomainTreeSnapshot.CycleException e) {
            return null;
        }
    }

    /** 목록 행 — 자기 값 + 유효값(저장하지 않는 조립값). */
    private Map<String, Object> row(DomainTreeSnapshot snapshot, DomainNode n, int depth) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("DOMAIN_ID", n.domainId());
        m.put("PARENT_DOMAIN_ID", n.parentDomainId());
        m.put("DEPTH", depth);
        m.put("DOMAIN_NAME", n.domainName());
        m.put("STD_NAME", n.stdName());
        m.put("DOMAIN_KIND", n.domainKind());
        m.put("DATA_TYPE", n.dataType());
        m.put("LENGTH", n.length());
        m.put("SCALE", n.scale());
        m.put("UNIT_CODE", n.unitCode());
        m.put("MARU_CODE_ID", n.maruCodeId());
        m.put("CATE_ID", n.cateId());
        m.put("STD_RULE", n.stdRule());
        m.put("BIZ_RULE", n.bizRule());
        m.put("VER", n.ver());
        m.putAll(effectiveRow(effective(snapshot, n.domainId())));
        m.put("CHILD_COUNT", snapshot.children(n.domainId()).size());
        return m;
    }

    private static Map<String, Object> effectiveRow(EffectiveDomainView v) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("EFF_LENGTH", v == null ? null : v.length());
        m.put("EFF_SCALE", v == null ? null : v.scale());
        m.put("EFF_UNIT_CODE", v == null ? null : v.unitCode());
        m.put("EFF_MARU_CODE_ID", v == null || v.codeRef() == null ? null : v.codeRef().maruCodeId());
        m.put("EFF_CATE_ID", v == null || v.codeRef() == null ? null : v.codeRef().cateId());
        m.put("EFF_STD_EXPR", v == null ? null : v.stdExpr());
        m.put("EFF_STD_AST", v == null ? null : v.stdAstJson());
        m.put("EFF_BIZ_EXPR", v == null ? null : v.bizExpr());
        m.put("BIZ_REQUIRED_VARS", v == null ? List.of() : v.bizRequiredVars());
        m.put("HAS_BIZ", v != null && v.bizExpr() != null);
        return m;
    }

    private List<Map<String, Object>> requiredVarRows(List<String> vars) {
        Map<String, String> names = queries.columnNamesByPhysName(vars);
        List<Map<String, Object>> out = new ArrayList<>();
        for (String v : vars) {
            String columnName = names.get(v.toUpperCase(Locale.ROOT));
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("PHYS_NAME", v);
            m.put("COLUMN_NAME", columnName);
            m.put("REGISTERED", columnName != null);
            out.add(m);
        }
        return out;
    }

    /** 화면 영향도 표(§3.6) — 하위 도메인·참조 컬럼(재귀 CTE) + 03·06 참조(SPI) + 배포 보류. */
    private Map<String, Object> impactTable(Long id, DomainTreeSnapshot snapshot) {
        List<DomainImpactQueries.SubtreeRow> subtree = queries.subtree(id);
        MdmDomainImpact impact = impactLookup.impact(id);
        List<Map<String, Object>> descendants = new ArrayList<>();
        List<Map<String, Object>> columns = new ArrayList<>();
        Set<Long> seenDomains = new LinkedHashSet<>();
        Set<Long> seenColumns = new LinkedHashSet<>();
        boolean cycle = false;
        for (DomainImpactQueries.SubtreeRow r : subtree) {
            cycle |= r.depth() >= DomainTreeSnapshot.MAX_DEPTH;
            if (r.depth() >= 1 && !r.domainId().equals(id) && seenDomains.add(r.domainId())) {
                DomainNode n = snapshot.find(r.domainId()).orElse(null);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("DOMAIN_ID", r.domainId());
                m.put("DOMAIN_NAME", n == null ? null : n.domainName());
                m.put("STD_NAME", n == null ? null : n.stdName());
                m.put("DEPTH", r.depth());
                descendants.add(m);
            }
            if (r.columnId() != null && seenColumns.add(r.columnId())) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("COLUMN_ID", r.columnId());
                m.put("COLUMN_NAME", r.columnName());
                m.put("PHYS_NAME", r.physName());
                m.put("DOMAIN_ID", r.domainId());
                columns.add(m);
            }
        }
        List<Map<String, Object>> ruleVars = new ArrayList<>();
        List<Map<String, Object>> layoutItems = new ArrayList<>();
        List<Map<String, Object>> others = new ArrayList<>();
        for (MdmDomainReference ref : impact.externalReferences()) {
            Map<String, Object> m = new LinkedHashMap<>();
            switch (ref.refKind()) {
                case "RULE_VAR" -> {
                    m.put("REF_KEY", ref.refKey());
                    ruleVars.add(m);
                }
                case "LAYOUT_ITEM" -> {
                    m.put("REF_KEY", ref.refKey());
                    layoutItems.add(m);
                }
                default -> {
                    m.put("REF_KIND", ref.refKind());
                    m.put("REF_KEY", ref.refKey());
                    others.add(m);
                }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("descendants", descendants);
        out.put("columns", columns);
        out.put("ruleVars", ruleVars);
        out.put("layoutItems", layoutItems);
        out.put("otherRefs", others);
        out.put("systems", impact.affectedSystemCodes());
        out.put("deployHeld", true);
        out.put("cycle", cycle);
        return out;
    }

    private static Map<String, Object> emptyImpact() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("descendants", List.of());
        out.put("columns", List.of());
        out.put("ruleVars", List.of());
        out.put("layoutItems", List.of());
        out.put("otherRefs", List.of());
        out.put("systems", List.of());
        out.put("deployHeld", true);
        out.put("cycle", false);
        return out;
    }

    private static Map<String, Object> resultRow(Long domainId, String name, boolean own, int idx, DomainTestCase c,
                                                 DomainTestCaseRunner.CaseResult r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("DOMAIN_ID", domainId);
        m.put("DOMAIN_NAME", name);
        m.put("OWN", own);
        m.put("IDX", idx);
        m.put("VALUE", c.value());
        m.put("EXPECT", c.expect());
        m.put("ACTUAL", r.actual());
        m.put("RESULT", r.result());
        m.put("MESSAGE", r.message());
        return m;
    }

    /** 미리보기 변수 grid {@code [{NAME, VALUE}]} → 레코드 값. 화면은 문자열로 보내므로 숫자·불린 모양은 바꿔 넣는다. */
    private static Map<String, Object> varMap(List<Map<String, Object>> rows) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (rows == null) {
            return out;
        }
        for (Map<String, Object> row : rows) {
            Object name = row.get("NAME");
            if (name == null || name.toString().isBlank()) {
                continue;
            }
            Object value = row.get("VALUE");
            if (value instanceof String s) {
                String t = s.trim();
                if (t.isEmpty()) {
                    value = null;
                } else if (t.matches("^[+-]?[0-9]+(\\.[0-9]+)?$")) {
                    value = new java.math.BigDecimal(t);
                } else if (t.equalsIgnoreCase("true") || t.equalsIgnoreCase("false")) {
                    value = Boolean.parseBoolean(t);
                }
            }
            out.put(name.toString().trim(), value);
        }
        return out;
    }

    private static String column(String stdName) {
        return stdName != null && STD_NAME.matcher(stdName).matches() ? stdName : FALLBACK_COLUMN;
    }

    private static boolean contains(String s, String lowerKeyword) {
        return s != null && s.toLowerCase(Locale.ROOT).contains(lowerKeyword);
    }
}
