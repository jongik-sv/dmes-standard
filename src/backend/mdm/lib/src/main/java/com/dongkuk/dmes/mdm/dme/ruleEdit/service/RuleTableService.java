package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import static com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditSupport.ref;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditSupport.requireMdm;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditSupport.requireRowVersion;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditSupport.requireVer;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper.StoredRow;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.RuleIssueMaps;
import com.dongkuk.dmes.mdm.common.rule.RuleNativeWrites;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdIssuer;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdKind;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdRange;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.repository.MdmRuleRowRepository;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzer;
import kr.dongkuk.maru.mdm.engine.rule.RuleIssue;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 카드 ③ 의사결정표 저장(part TABLE, TSK-08-02 design §6.3.8).
 *
 * <p>한 트랜잭션: {@code beginDraftWrite}(소유자·DRAFT·row_version 검사 후 +1 — 판정은 공통 서비스만 한다, I6·I7) → 요청 행 검사(행
 * 종류·기본 행 하나·DERIVE 에 기본 행 금지·기존 row_id 는 이 DRAFT 에 있던 것만·셀 모양 I17·적중 정책) → 새 행 수만큼 한 번 발급 →
 * 그 버전 행 전부 삭제 → 요청 순서로 INSERT(NORMAL seq 1..n, DEFAULT 0 — 부분 유일 인덱스 때문에 UPDATE 로 순서를 바꾸지 않는다, I8·
 * I10) → HIT_POLICY 네이티브 UPDATE. 변수(TB_MDM_RULE_VAR)는 읽기만 한다. 트랜잭션 밖에서 저장한 정의로 서버 분석을 돌려 응답에
 * 싣는다(I12). ERROR 가 있어도 저장한다(D3) — 거부 정책은 {@link RuleSaveCheck}(08-04) 몫이다.
 */
@Service
public class RuleTableService implements RuleEditSavePart {

    static final String PART = "TABLE";
    private static final Set<String> ROW_KINDS = Set.of("NORMAL", "DEFAULT");
    private static final Set<String> HIT_POLICIES = Set.of("FIRST", "UNIQUE", "PRIORITY", "COLLECT", "ANY");

    private final RuleEditSupport support;
    private final RuleQueries queries;
    private final RuleNativeWrites writes;
    private final VersionWriteGuard writeGuard;
    private final MdmRuleIdIssuer issuer;
    private final RuleVarTypeResolver resolver;
    private final MdmRuleRowRepository rowRepository;
    private final ObjectProvider<RuleSaveCheck> saveChecks;
    private final TransactionTemplate tx;

    public RuleTableService(RuleEditSupport support, RuleQueries queries, RuleNativeWrites writes, VersionWriteGuard writeGuard,
                            MdmRuleIdIssuer issuer, RuleVarTypeResolver resolver, MdmRuleRowRepository rowRepository,
                            ObjectProvider<RuleSaveCheck> saveChecks, PlatformTransactionManager transactionManager) {
        this.support = support;
        this.queries = queries;
        this.writes = writes;
        this.writeGuard = writeGuard;
        this.issuer = issuer;
        this.resolver = resolver;
        this.rowRepository = rowRepository;
        this.saveChecks = saveChecks;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Override
    public String part() {
        return PART;
    }

    private record RequestedRow(int rowId, String rowKind, String cells, String note) {
    }

    private record Saved(long rowVersion, Map<String, Integer> rowIdMap, List<Map<String, Object>> rows, List<StoredRow> stored) {
    }

    @Override
    public RuleEditSaveResult save(RuleEditSaveRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        String id = rule.getMaruRuleId();
        int ver = requireVer(request.getVer());
        long expected = requireRowVersion(request.getRowVersion());
        List<Map<String, Object>> requested = request.getRows() == null ? List.of() : request.getRows();
        String me = support.me();

        Saved saved = tx.execute(status -> {
            long rowVersion = writeGuard.beginDraftWrite(ref(id, ver), expected, me);
            String hit = hitPolicy(rule.getRuleKind(), request.getHitPolicy());
            Set<Integer> varIds = queries.vars(id, ver).stream().map(MdmRuleVar::getVarId).collect(Collectors.toSet());
            List<RequestedRow> rows = checkRows(rule, requested, varIds, new HashSet<>(queries.rowIds(id, ver)));

            Map<Integer, Integer> issued = new LinkedHashMap<>();
            long fresh = rows.stream().filter(r -> r.rowId() < 0).count();
            if (fresh > 0) {
                MdmRuleIdRange range = issuer.issue(id, MdmRuleIdKind.ROW, (int) fresh);
                int next = range.first();
                for (RequestedRow r : rows) {
                    if (r.rowId() < 0) {
                        issued.put(r.rowId(), next++);
                    }
                }
            }
            queries.deleteRows(id, ver);
            int seq = 0;
            List<MdmRuleRow> entities = new ArrayList<>();
            List<Map<String, Object>> out = new ArrayList<>();
            List<StoredRow> stored = new ArrayList<>();
            for (RequestedRow r : rows) {
                int rowId = r.rowId() < 0 ? issued.get(r.rowId()) : r.rowId();
                int rowSeq = "NORMAL".equals(r.rowKind()) ? ++seq : 0;
                MdmRuleRow e = new MdmRuleRow(id, ver, rowId, r.rowKind(), rowSeq, r.cells());
                e.setNote(r.note());
                entities.add(e);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("rowId", rowId);
                m.put("seq", rowSeq);
                m.put("rowKind", r.rowKind());
                m.put("cells", r.cells());
                m.put("note", r.note());
                out.add(m);
                stored.add(new StoredRow(rowId, rowSeq, r.rowKind(), r.cells()));
            }
            rowRepository.saveAll(entities);
            rowRepository.flush();
            writes.updateHitPolicy(id, ver, hit);
            Map<String, Integer> rowIdMap = new LinkedHashMap<>();
            issued.forEach((tmp, real) -> rowIdMap.put(String.valueOf(tmp), real));
            return new Saved(rowVersion, rowIdMap, out, stored);
        });

        String hit = request.getHitPolicy() == null || request.getHitPolicy().isBlank() ? null : request.getHitPolicy().trim();
        List<ResolvedVar> vars = resolver.resolve(id, ver, queries.vars(id, ver));
        List<RuleIssue> analysis = RuleAnalyzer.analyze(
                RuleAnalysisInputMapper.toAnalysisRule(id, rule.getRuleKind(), hit, vars, saved.stored()));
        List<Map<String, Object>> issues = new ArrayList<>(RuleIssueMaps.of(analysis));
        RuleSaveContext context = new RuleSaveContext(id, ver, rule.getRuleKind(), hit, vars, saved.stored(), analysis);
        saveChecks.orderedStream().forEach(check -> issues.addAll(check.check(context)));
        return new RuleEditSaveResult(PART, saved.rowVersion(), saved.rowIdMap(), issues, saved.rows());
    }

    /** DECISION 은 다섯 정책 중 하나(필수), DERIVE 는 비어 있어야 한다. */
    private static String hitPolicy(String ruleKind, String raw) {
        String hit = raw == null || raw.isBlank() ? null : raw.trim();
        if ("DERIVE".equals(ruleKind)) {
            if (hit != null) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "산출 룰에는 적중 정책을 두지 않습니다: " + hit);
            }
            return null;
        }
        if (hit == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "적중 정책은 필수입니다.");
        }
        if (!HIT_POLICIES.contains(hit)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "적중 정책은 FIRST·UNIQUE·PRIORITY·COLLECT·ANY 중 하나여야 합니다: " + hit);
        }
        return hit;
    }

    private static List<RequestedRow> checkRows(MdmRule rule, List<Map<String, Object>> requested, Set<Integer> varIds, Set<Integer> existing) {
        List<RequestedRow> rows = new ArrayList<>(requested.size());
        Set<Integer> seen = new HashSet<>();
        int defaults = 0;
        for (int i = 0; i < requested.size(); i++) {
            Map<String, Object> raw = requested.get(i);
            String label = (i + 1) + "번째 행";
            if (raw == null) {
                throw invalid(label + "이 비었습니다");
            }
            int rowId = rowId(raw.get("rowId"), label);
            if (!seen.add(rowId)) {
                throw invalid(label + ": row_id " + rowId + " 가 두 번 나옵니다");
            }
            if (rowId > 0 && !existing.contains(rowId)) {
                throw invalid(label + ": row_id " + rowId + " 는 이 DRAFT 버전의 행이 아닙니다(새 행은 음수 임시 ID)");
            }
            String kind = raw.get("rowKind") instanceof String k ? k : null;
            if (kind == null || !ROW_KINDS.contains(kind)) {
                throw invalid(label + ": 행 종류는 NORMAL·DEFAULT 중 하나여야 합니다: " + kind);
            }
            if ("DEFAULT".equals(kind)) {
                if ("DERIVE".equals(rule.getRuleKind())) {
                    throw invalid("산출 룰에는 기본 행을 둘 수 없습니다");
                }
                if (++defaults > 1) {
                    throw invalid("기본 행은 하나만 둘 수 있습니다");
                }
            }
            if (!(raw.get("cells") instanceof String cells)) {
                throw invalid(label + ": cells 는 JSON 문자열이어야 합니다");
            }
            RuleCellsCodec.validateShape(RuleCellsCodec.parse(cells), varIds, label + "(row_id " + rowId + ")");
            Object note = raw.get("note");
            rows.add(new RequestedRow(rowId, kind, cells, note == null ? null : note.toString()));
        }
        return rows;
    }

    /** grids 바인딩은 JSON 숫자를 Double 로 넘긴다 — 정수만 받는다. 0 은 쓰지 않는다. */
    private static int rowId(Object value, String label) {
        if (!(value instanceof Number n) || n.doubleValue() != Math.rint(n.doubleValue()) || n.intValue() == 0) {
            throw invalid(label + ": row_id 는 0 이 아닌 정수여야 합니다(새 행은 음수): " + value);
        }
        return n.intValue();
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }
}
