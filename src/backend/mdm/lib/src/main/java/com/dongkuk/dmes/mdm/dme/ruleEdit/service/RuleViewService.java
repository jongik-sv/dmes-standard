package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper.StoredRow;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.RuleIssueMaps;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleTestCaseQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.RuleVersionRow;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult.RowInfo;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult.RuleInfo;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult.VarCandidate;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzer;
import org.springframework.stereotype.Service;

/**
 * view 조립(TSK-08-02 design §6.2·§6.3.1). 버전을 고르지 않으면 06 시안 {@code curVer} 순서로 고른다: 미적용(작성 중 DRAFT·결재 중·
 * 적용 시각이 아직 오지 않은 확정 RELEASED) → 현재 RELEASED({@code APPLY_FROM <= now < APPLY_TO}) → 가장 큰 ver. 읽기는 누구나 된다.
 * {@code editable} = 원천 MDM && 선택 버전 DRAFT && 소유자 = 나(I7).
 *
 * <p><b>D-105 (3)</b>: 버전 목록은 <b>읽기 전용</b>으로 남는다 — 내용을 고르려면 어느 DRAFT 를 고르는지 알아야 하기 때문이다.
 * 그래서 목록은 공용 읽기 모델 {@link RuleVersionRow} 를 그대로 쓴다(확정 취소 가능 여부 같은 관리 플래그는 없다 — 버전 관리는
 * 헤더·버전 화면). 헤더 편집 가능 여부({@code headerEditable})도 헤더·버전 화면으로 갔다 여���는 값이 없다.
 */
@Service
public class RuleViewService {

    private static final String TEXT_PATTERN = "yyyy-MM-dd HH:mm:ss";

    private final RuleScreenSupport support;
    private final RuleQueries queries;
    private final RuleVarTypeResolver resolver;
    private final RuleUsageService usageService;
    private final MdmTemporalBinder temporal;
    private final MdmColumnRepository columnRepository;
    private final RuleTestCaseQueries testCaseQueries;

    public RuleViewService(RuleScreenSupport support, RuleQueries queries, RuleVarTypeResolver resolver,
                           RuleUsageService usageService, MdmTemporalBinder temporal, MdmColumnRepository columnRepository,
                           RuleTestCaseQueries testCaseQueries) {
        this.support = support;
        this.queries = queries;
        this.resolver = resolver;
        this.usageService = usageService;
        this.temporal = temporal;
        this.columnRepository = columnRepository;
        this.testCaseQueries = testCaseQueries;
    }

    public RuleEditViewResult view(RuleEditViewRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        String id = rule.getMaruRuleId();
        List<MdmRuleVer> versions = queries.versions(id);
        LocalDateTime now = support.now();
        String me = support.me();
        MdmRuleVer selected = request.getVer() != null
                ? versions.stream().filter(v -> v.getVer().equals(request.getVer())).findFirst()
                        .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "룰 버전을 찾을 수 없습니다: " + id + " v" + request.getVer()))
                : pickDefault(versions, now).orElse(null);

        RuleEditViewResult out = new RuleEditViewResult();
        out.setMe(me);
        out.setRule(ruleInfo(rule, versions, now));
        out.setVersions(versions.stream().map(v -> versionInfo(v)).toList());
        out.setUnappliedVersionExists(versions.stream().anyMatch(v -> RuleVersions.isUnapplied(v, now)));
        out.setConfirmScreenReady(true);
        if (selected == null) {
            out.setVars(List.of());
            out.setRows(List.of());
            out.setBaseRows(List.of());
            out.setBaseVars(List.of());
            out.setVarCandidates(List.of());
            out.setVarMeta(List.of());
            out.setBaseVarMeta(List.of());
            out.setIssues(List.of());
            out.setEditable(false);
        } else {
            int ver = selected.getVer();
            out.setSelectedVer(ver);
            List<ResolvedVar> vars = resolver.resolve(id, ver, queries.vars(id, ver));
            List<MdmRuleRow> rows = queries.rows(id, ver);
            out.setVars(vars);
            out.setRows(rows.stream().map(RuleViewService::rowInfo).toList());
            out.setBaseRows(selected.getBaseVer() == null ? List.of()
                    : queries.rows(id, selected.getBaseVer()).stream().map(RuleViewService::rowInfo).toList());
            out.setBaseVars(selected.getBaseVer() == null ? List.of()
                    : resolver.resolve(id, selected.getBaseVer(), queries.vars(id, selected.getBaseVer())));
            out.setVarCandidates(varCandidates(id));
            out.setVarMeta(queries.vars(id, ver).stream().map(RuleViewService::varMeta).toList());
            // base 버전의 저장 원값 — 입력 계약 diff 가 base 의 열 조건(grp_cond) 참조를 지금 값과 섞지 않게 한다.
            out.setBaseVarMeta(selected.getBaseVer() == null ? List.of()
                    : queries.vars(id, selected.getBaseVer()).stream().map(RuleViewService::varMeta).toList());
            List<StoredRow> stored = rows.stream().map(r -> new StoredRow(r.getRowId(), r.getSeq(), r.getRowKind(), r.getCells())).toList();
            out.setIssues(RuleIssueMaps.of(RuleAnalyzer.analyze(
                    RuleAnalysisInputMapper.toAnalysisRule(id, rule.getRuleKind(), selected.getHitPolicy(), vars, stored))));
            out.setEditable(RuleScreenSupport.SOURCE_MDM.equals(rule.getSourceKind()) && "DRAFT".equals(selected.getStatus())
                    && me != null && me.equals(selected.getOwnerId()));
        }
        out.setUsage(usageService.usage(id, out.getSelectedVer()));
        // 테스트 케이스는 버전과 무관하다(06:1058) — 버전을 고르지 못해도 싣는다.
        out.setTestCases(testCaseQueries.cases(id).stream().map(c -> new RuleEditViewResult.TestCaseInfo(c.getCaseId(), c.getCaseName(),
                c.getInputJson(), c.getExpectedJson(), c.getDescription(), c.getRowVersion())).toList());
        return out;
    }

    private static RuleEditViewResult.VarMeta varMeta(MdmRuleVar v) {
        List<String> prio = v.getPrioList() == null || v.getPrioList().isBlank() ? null
                : DomainJson.readList(v.getPrioList()).stream().map(String::valueOf).toList();
        return new RuleEditViewResult.VarMeta(v.getVarId(), v.getResGrp(), v.getGrpCond(), v.getCollectAgg(), prio,
                v.getDomainId(), v.getDataType());
    }

    /** 식 입력 칸 datalist 소스 — 컬럼 사전 물리명·앞 룰 결과 변수(resolver 가 쓰는 것과 같은 조회, TSK-08-03). */
    private List<VarCandidate> varCandidates(String id) {
        List<VarCandidate> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (MdmColumn c : columnRepository.findAllByOrderByPhysNameAsc()) {
            if (c.getPhysName() != null && seen.add(c.getPhysName())) {
                String label = c.getLabelMid() != null ? c.getLabelMid() : c.getLabelLong();
                out.add(new VarCandidate(c.getPhysName(), label, "COLUMN"));
            }
        }
        for (MdmRuleVar r : queries.latestReleasedResultVarsExcept(id)) {
            if (r.getVarName() != null && r.getVarName().isBlank()) {
                continue;
            }
            if (r.getVarName() != null && seen.add(r.getVarName())) {
                out.add(new VarCandidate(r.getVarName(), r.getLabel(), "RULE_RESULT"));
            }
            if (r.getResGrp() != null && !r.getResGrp().isBlank() && seen.add(r.getResGrp())) {
                out.add(new VarCandidate(r.getResGrp(), r.getLabel(), "RULE_RESULT"));
            }
        }
        return out;
    }

    private static Optional<MdmRuleVer> pickDefault(List<MdmRuleVer> versions, LocalDateTime now) {
        // 1순위는 공통 정의(04 「버전 상태와 적용시점」)의 미적용 버전이다 — DRAFT·REQUESTED·APPROVED 에 {@code APPLY_FROM > now} 인
        // RELEASED(예정 확정)까지 한 정의로 센다.(공통 버전 서비스가 미적용 2개를 막아 실제로는 0~1개다.)
        // 확정 취소(D8)는 예정 확정 버전에만 가능하므로, 지금 적용 중인 RELEASED 로 먼저 떨어지면 ② 버전 카드의 동작이
        // 전부 꺼진 채로 첫 진입한다(사용자가 버전 행을 눌러야 그 버전에 닿는다).
        Optional<MdmRuleVer> unapplied = RuleVersions.unapplied(versions, now);
        if (unapplied.isPresent()) {
            return unapplied;
        }
        return RuleVersions.currentReleased(versions, now)
                .or(() -> versions.stream().max(Comparator.comparing(MdmRuleVer::getVer)));
    }

    /** 상태는 계산 상태다(TSK-08-05 design §6.7, I19). */
    private static RuleInfo ruleInfo(MdmRule rule, List<MdmRuleVer> versions, LocalDateTime now) {
        RuleInfo info = new RuleInfo();
        info.setMaruRuleId(rule.getMaruRuleId());
        info.setMaruRuleName(rule.getMaruRuleName());
        info.setRuleKind(rule.getRuleKind());
        info.setStatus(RuleVersions.effectiveStatus(rule.getStatus(), versions, now));
        info.setSourceKind(rule.getSourceKind());
        info.setSourceSystem(rule.getSourceSystem());
        info.setDescription(rule.getDescription());
        info.setUsageNote(rule.getUsageNote());
        return info;
    }

    /** 버전 목록 한 행 — 공용 읽기 모델. 관리 플래그는 헤더·버전 화면 몫이라 여기 없다(D-105 (3)). */
    private RuleVersionRow versionInfo(MdmRuleVer v) {
        return new RuleVersionRow(v.getVer(), v.getStatus(), text(v.getApplyFrom()), text(v.getApplyTo()), v.getOwnerId(),
                v.getBaseVer(), v.getHitPolicy(), v.getRowVersion());
    }

    private String text(LocalDateTime value) {
        return value == null ? null : java.time.format.DateTimeFormatter.ofPattern(TEXT_PATTERN).format(temporal.fromDb(value));
    }

    private static RowInfo rowInfo(MdmRuleRow r) {
        return new RowInfo(r.getRowId(), r.getSeq(), r.getRowKind(), RuleCellsCodec.normalizeStored(r.getCells()), r.getNote());
    }
}
