package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.ref;
import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireMdm;
import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireRowVersion;
import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireVer;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper.StoredRow;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.RuleHitPolicies;
import com.dongkuk.dmes.mdm.common.rule.RuleIssueMaps;
import com.dongkuk.dmes.mdm.common.rule.RuleNativeWrites;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput.DraftRow;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleLimits;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveRejections;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveValidator;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdIssuer;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdKind;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdRange;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRowRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzer;
import kr.dongkuk.maru.mdm.engine.rule.RuleIssue;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 카드 ③ 의사결정표 저장(part TABLE, TSK-08-02 design §6.3.8).
 *
 * <p>한 트랜잭션: {@code beginDraftWrite}(소유자·DRAFT·row_version 검사 후 +1 — 판정은 공통 서비스만 한다, I6·I7) → 적중 정책(요청 값,
 * 비면 저장된 값) → 정책이 바뀌면 저장된 열 설정과의 어긋남 검사({@link #policyConflicts}) → 요청 행 검사(행 종류·기본 행 하나·DERIVE 에
 * 기본 행 금지·기존 row_id 는 이 DRAFT 에 있던 것만·셀 모양 I17) → 행 수·셀 길이 상한 → 저장 시 검사({@link RuleSaveValidator}, 적용
 * 지점 TABLE, <b>새 정책으로</b> — TSK-08-04 design §6.1) → 새 행 수만큼 한 번 발급 → 그 버전 행 전부 삭제 → 요청 순서로 정규화한
 * 셀을 INSERT(NORMAL seq 1..n, DEFAULT 0 — 부분 유일 인덱스 때문에 UPDATE 로 순서를 바꾸지 않는다, I8·I10) → 정책이 바뀌었으면
 * HIT_POLICY 네이티브 UPDATE(COLLECT 가 아니게 바뀌면 기본 집계 LIST 도 비운다). 변수는 그 밖에는 읽기만 한다. 상한·검사에 ERROR 가
 * 하나라도 있으면 쓰기 전에 MDM021 로 거부하고 트랜잭션이 row_version 까지 되돌린다(08-04 D10 — 08-02 D3 의 "ERROR 가 있어도
 * 저장한다"를 뒤집었다). 트랜잭션 밖에서 저장한 정의로 서버 분석을 돌려 응답에 싣고(I12), 그 뒤에 검사기의 비분석 이슈(경고)를 발급
 * 번호로 바꿔 잇는다.
 *
 * <p><b>적중 정책은 여기서 쓴다(D-133, D-105 (4) 번복)</b>. 정책은 판정표의 해석 규칙(겹침이 경고인지 오류인지 등)이라 표 편집과 한
 * 묶음으로 고치고 한 번에 저장한다. 그래서 "정책만 바뀌고 표는 그 정책에 안 맞는" 상태가 저장되지 않는다.
 */
@Service
public class RuleTableService implements RuleEditSavePart {

    static final String PART = "TABLE";
    private static final Set<String> ROW_KINDS = Set.of("NORMAL", "DEFAULT");

    private final RuleScreenSupport support;
    private final RuleQueries queries;
    private final VersionWriteGuard writeGuard;
    private final MdmRuleIdIssuer issuer;
    private final RuleVarTypeResolver resolver;
    private final MdmRuleRowRepository rowRepository;
    private final RuleSaveValidator validator;
    private final RuleNativeWrites writes;
    private final TransactionTemplate tx;

    public RuleTableService(RuleScreenSupport support, RuleQueries queries, VersionWriteGuard writeGuard,
                            MdmRuleIdIssuer issuer, RuleVarTypeResolver resolver, MdmRuleRowRepository rowRepository,
                            RuleSaveValidator validator, RuleNativeWrites writes, PlatformTransactionManager transactionManager) {
        this.support = support;
        this.queries = queries;
        this.writes = writes;
        this.writeGuard = writeGuard;
        this.issuer = issuer;
        this.resolver = resolver;
        this.rowRepository = rowRepository;
        this.validator = validator;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Override
    public String part() {
        return PART;
    }

    record RequestedRow(int rowId, String rowKind, String cells, Map<Integer, Map<String, Object>> parsed, String note) {
    }

    private record Saved(long rowVersion, Map<String, Integer> rowIdMap, List<Map<String, Object>> rows, List<StoredRow> stored,
                         List<Map<String, Object>> checkIssues) {
    }

    @Override
    public RuleEditSaveResult save(RuleEditSaveRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        requireMdm(rule);
        String id = rule.getMaruRuleId();
        BigDecimal ver = requireVer(request.getVer());
        long expected = requireRowVersion(request.getRowVersion());
        List<Map<String, Object>> requested = request.getRows() == null ? List.of() : request.getRows();
        // 비면 저장된 값을 쓴다. 값이 오면 정규화한다 — DERIVE 에 값이 오면 여기서 거부한다(정책이 없는 룰).
        String requestedHit = request.getHitPolicy() == null || request.getHitPolicy().isBlank() ? null
                : RuleHitPolicies.normalize(rule.getRuleKind(), request.getHitPolicy());
        String me = support.me();

        Saved saved = tx.execute(status -> {
            long rowVersion = writeGuard.beginDraftWrite(ref(id, ver), expected, me);
            String storedHit = storedHitPolicy(id, ver);
            String hit = requestedHit != null ? requestedHit : storedHit;
            boolean hitChanged = !Objects.equals(hit, storedHit);
            List<MdmRuleVar> rawVars = queries.vars(id, ver);
            if (hitChanged) {
                List<Map<String, Object>> conflicts = policyConflicts(hit, rawVars);
                if (!conflicts.isEmpty()) {
                    throw RuleSaveRejections.reject(conflicts);
                }
            }
            Set<Integer> varIds = rawVars.stream().map(MdmRuleVar::getVarId).collect(Collectors.toSet());
            List<RequestedRow> rows = checkRows(rule, requested, varIds, new HashSet<>(queries.rowIds(id, ver)));
            limits(rows);
            List<ResolvedVar> vars = resolver.resolve(id, ver, rawVars);
            RuleCheckReport report = validator.validate(new RuleCheckInput(id, ver, rule.getRuleKind(), hit, rawVars, vars, draftRows(rows),
                    RuleSaveTarget.TABLE));
            if (report.hasErrors()) {
                throw RuleSaveRejections.reject(report.issues());
            }

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
            List<MdmRuleRow> entities = new ArrayList<>();
            List<Map<String, Object>> out = new ArrayList<>();
            List<StoredRow> stored = new ArrayList<>();
            for (int i = 0; i < rows.size(); i++) {
                RequestedRow r = rows.get(i);
                DraftRow normalized = report.normalizedRows().get(i);
                int rowId = r.rowId() < 0 ? issued.get(r.rowId()) : r.rowId();
                String cells = RuleCellsCodec.write(normalized.cells());
                MdmRuleRow e = new MdmRuleRow(id, ver, rowId, r.rowKind(), normalized.seq(), cells);
                e.setNote(r.note());
                entities.add(e);
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("rowId", rowId);
                m.put("seq", normalized.seq());
                m.put("rowKind", r.rowKind());
                m.put("cells", cells);
                m.put("note", r.note());
                out.add(m);
                stored.add(new StoredRow(rowId, normalized.seq(), r.rowKind(), cells));
            }
            rowRepository.saveAll(entities);
            rowRepository.flush();
            if (hitChanged) {
                writes.updateHitPolicy(id, ver, hit);
                if (!"COLLECT".equals(hit)) {
                    writes.clearDefaultCollectAgg(id, ver);
                }
            }
            Map<String, Integer> rowIdMap = new LinkedHashMap<>();
            issued.forEach((tmp, real) -> rowIdMap.put(String.valueOf(tmp), real));
            return new Saved(rowVersion, rowIdMap, out, stored, withIssuedRowIds(report.nonAnalysisIssues(), issued));
        });

        String hit = storedHitPolicy(id, ver);
        List<ResolvedVar> vars = resolver.resolve(id, ver, queries.vars(id, ver));
        List<RuleIssue> analysis = RuleAnalyzer.analyze(
                RuleAnalysisInputMapper.toAnalysisRule(id, rule.getRuleKind(), hit, vars, saved.stored()));
        List<Map<String, Object>> issues = new ArrayList<>(RuleIssueMaps.of(analysis));
        issues.addAll(saved.checkIssues());
        return new RuleEditSaveResult(PART, saved.rowVersion(), saved.rowIdMap(), issues, saved.rows());
    }

    /** 저장 요청 크기 상한(D6) — 행 수, 행마다 {@code cells} 문자열 길이, 그 합. 같으면 통과, 넘으면 MDM021(I23). */
    private static void limits(List<RequestedRow> rows) {
        List<Map<String, Object>> issues = new ArrayList<>();
        if (rows.size() > RuleLimits.MAX_ROWS) {
            issues.add(limitIssue(List.of(), "행이 " + rows.size() + "개다. 한 번에 " + RuleLimits.MAX_ROWS + "개까지 저장한다"));
        }
        long total = 0;
        for (RequestedRow r : rows) {
            int length = r.cells().length();
            total += length;
            if (length > RuleLimits.MAX_ROW_CELLS_CHARS) {
                issues.add(limitIssue(List.of(r.rowId()), RuleCheckReport.rowLabel(r.rowId()) + ": 셀 JSON 이 " + length + "자다. 행마다 "
                        + RuleLimits.MAX_ROW_CELLS_CHARS + "자까지 받는다"));
            }
        }
        if (total > RuleLimits.MAX_TOTAL_CELLS_CHARS) {
            issues.add(limitIssue(List.of(), "셀 JSON 이 모두 " + total + "자다. 한 번에 " + RuleLimits.MAX_TOTAL_CELLS_CHARS + "자까지 받는다"));
        }
        if (!issues.isEmpty()) {
            throw RuleSaveRejections.reject(issues);
        }
    }

    private static Map<String, Object> limitIssue(List<Integer> rowIds, String message) {
        return RuleCheckReport.issue(RuleSaveIssueCode.LIMIT_EXCEEDED.name(), RuleCheckReport.ERROR, rowIds, null, message);
    }

    /** 검사기 입력 행(값 테스트 BODY 도 쓴다) — 모양 검사를 통과한 셀, 새 행은 임시 번호 그대로, seq 는 INSERT 와 같은 규칙(NORMAL 1..n, DEFAULT 0). */
    static List<DraftRow> draftRows(List<RequestedRow> rows) {
        List<DraftRow> out = new ArrayList<>(rows.size());
        int seq = 0;
        for (RequestedRow r : rows) {
            out.add(new DraftRow(r.rowId(), "NORMAL".equals(r.rowKind()) ? ++seq : 0, r.rowKind(), r.parsed()));
        }
        return out;
    }

    /** 검사 이슈의 임시 row_id(음수)를 발급 번호로 바꾼 새 맵(design §7.4). 메시지는 그대로 둔다. */
    private static List<Map<String, Object>> withIssuedRowIds(List<Map<String, Object>> issues, Map<Integer, Integer> issued) {
        List<Map<String, Object>> out = new ArrayList<>(issues.size());
        for (Map<String, Object> issue : issues) {
            Map<String, Object> m = new LinkedHashMap<>(issue);
            if (issue.get("rowIds") instanceof List<?> ids) {
                m.put("rowIds", ids.stream().map(o -> (Integer) o).map(r -> issued.getOrDefault(r, r)).toList());
            }
            out.add(m);
        }
        return out;
    }

    /** DECISION 은 다섯 정책 중 하나(필수), DERIVE 는 비어 있어야 한다. 값 테스트 BODY 도 쓴다. */
    static String hitPolicy(String ruleKind, String raw) {
        return RuleHitPolicies.normalize(ruleKind, raw);
    }

    /**
     * 정책을 바꿀 때 저장된 열 설정과 어긋나는 곳(D-133) — 열 설정 검사({@code RuleColumnsService.check}·화면 {@code column-draft.ts})와 같은
     * 규칙·문구다: 집계는 COLLECT, 순위는 PRIORITY, 결과 열 그룹은 FIRST·UNIQUE 에서만. 하나라도 있으면 표 저장 전체를 거부한다 — 열
     * 설정을 먼저 고치고(지금 정책에서 집계·순위·그룹을 비운 뒤) 정책을 바꾼다.
     *
     * <p>집계 {@code LIST} 는 어긋남으로 보지 않는다. 열 설정이 COLLECT 결과 열에 채우는 기본값이자 DB 기본값이라 사람이 고른 값과
     * 구별되지 않고, 정책이 COLLECT 가 아니게 바뀌면 저장 때 비운다({@link RuleNativeWrites#clearDefaultCollectAgg}). 이것까지 막으면
     * COLLECT 에서 다른 정책으로는 영영 못 바꾼다(열 설정은 COLLECT 결과 열의 빈 집계를 LIST 로 채운다).
     */
    static List<Map<String, Object>> policyConflicts(String hit, List<MdmRuleVar> rawVars) {
        List<Map<String, Object>> out = new ArrayList<>();
        boolean grouped = false;
        for (MdmRuleVar v : rawVars) {
            if (!"RESULT".equals(v.getVarKind())) {
                continue;
            }
            String agg = v.getCollectAgg() == null || v.getCollectAgg().isBlank() ? null : v.getCollectAgg().trim();
            if (agg != null && !"LIST".equals(agg) && !"COLLECT".equals(hit)) {
                out.add(policyIssue(RuleSaveIssueCode.AGG_COLLECT, v.getVarId(),
                        "집계는 COLLECT 적중 정책의 결과 열에만 둡니다: " + v.getVarName() + "(" + agg + ")"));
            }
            if (hasPrio(v.getPrioList()) && !"PRIORITY".equals(hit)) {
                out.add(policyIssue(RuleSaveIssueCode.PRIO_PRIORITY, v.getVarId(),
                        "순위는 PRIORITY 적중 정책의 결과 열에만 둡니다: " + v.getVarName()));
            }
            grouped |= v.getResGrp() != null && !v.getResGrp().isBlank();
        }
        if (grouped && !"FIRST".equals(hit) && !"UNIQUE".equals(hit)) {
            out.add(policyIssue(RuleSaveIssueCode.GRP_POLICY, null, "결과 열 그룹은 FIRST·UNIQUE 적중 정책에서만 둘 수 있습니다: " + hit));
        }
        return out;
    }

    private static boolean hasPrio(String json) {
        return json != null && !json.isBlank() && !json.replaceAll("\\s", "").equals("[]");
    }

    private static Map<String, Object> policyIssue(RuleSaveIssueCode code, Integer varId, String message) {
        return RuleCheckReport.issue(code.name(), RuleCheckReport.ERROR, List.of(), varId, message);
    }

    /** 저장된 적중 정책 — 요청이 정책을 비우면 이 값을 쓰고, 요청 값과 견주어 바뀌었는지 가린다(D-133). */
    private String storedHitPolicy(String id, BigDecimal ver) {
        // DERIVE 는 저장된 정책이 null 이다 — Optional.of(null) 로 터지지 않게 조건을 건너뛴다.
        return queries.versions(id).stream()
                .filter(v -> VersionNumbers.same(v.getVer(), ver))
                .map(MdmRuleVer::getHitPolicy)
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
    }

    static List<RequestedRow> checkRows(MdmRule rule, List<Map<String, Object>> requested, Set<Integer> varIds, Set<Integer> existing) {
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
            Map<Integer, Map<String, Object>> parsed = RuleCellsCodec.parse(cells);
            RuleCellsCodec.validateShape(parsed, varIds, label + "(row_id " + rowId + ")");
            Object note = raw.get("note");
            rows.add(new RequestedRow(rowId, kind, cells, parsed, note == null ? null : note.toString()));
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
