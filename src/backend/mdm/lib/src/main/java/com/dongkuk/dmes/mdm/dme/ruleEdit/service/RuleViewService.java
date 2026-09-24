package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper.StoredRow;
import com.dongkuk.dmes.mdm.common.rule.RuleIssueMaps;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.RuleVersions;
import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult.RowInfo;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult.RuleInfo;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult.VarCandidate;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult.VersionInfo;
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
 * view 조립(TSK-08-02 design §6.2·§6.3.1). 버전을 고르지 않으면 06 시안 {@code curVer} 순서로 고른다: 미적용 DRAFT → 그 밖의 미적용
 * (REQUESTED·APPROVED) → 현재 RELEASED({@code APPLY_FROM <= now < APPLY_TO}) → 가장 큰 ver. 읽기는 누구나 된다.
 * {@code editable} = 원천 MDM && 선택 버전 DRAFT && 소유자 = 나(I7), {@code headerEditable} 은 {@link RuleHeaderService} 규칙(D6).
 */
@Service
public class RuleViewService {

    private static final Set<String> IN_APPROVAL = Set.of("REQUESTED", "APPROVED");
    private static final String TEXT_PATTERN = "yyyy-MM-dd HH:mm:ss";

    private final RuleEditSupport support;
    private final RuleQueries queries;
    private final RuleVarTypeResolver resolver;
    private final RuleHeaderService headerService;
    private final RuleUsageService usageService;
    private final MdmTemporalBinder temporal;
    private final MdmColumnRepository columnRepository;

    public RuleViewService(RuleEditSupport support, RuleQueries queries, RuleVarTypeResolver resolver, RuleHeaderService headerService,
                           RuleUsageService usageService, MdmTemporalBinder temporal, MdmColumnRepository columnRepository) {
        this.support = support;
        this.queries = queries;
        this.resolver = resolver;
        this.headerService = headerService;
        this.usageService = usageService;
        this.temporal = temporal;
        this.columnRepository = columnRepository;
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
        out.setRule(ruleInfo(rule));
        out.setVersions(versions.stream().map(this::versionInfo).toList());
        out.setUnappliedVersionExists(versions.stream().anyMatch(v -> RuleVersions.isUnapplied(v, now)));
        out.setHeaderEditable(headerService.headerEditable(rule, versions));
        out.setConfirmScreenReady(false);
        if (selected == null) {
            out.setVars(List.of());
            out.setRows(List.of());
            out.setBaseRows(List.of());
            out.setBaseVars(List.of());
            out.setVarCandidates(List.of());
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
            List<StoredRow> stored = rows.stream().map(r -> new StoredRow(r.getRowId(), r.getSeq(), r.getRowKind(), r.getCells())).toList();
            out.setIssues(RuleIssueMaps.of(RuleAnalyzer.analyze(
                    RuleAnalysisInputMapper.toAnalysisRule(id, rule.getRuleKind(), selected.getHitPolicy(), vars, stored))));
            out.setEditable(RuleEditSupport.SOURCE_MDM.equals(rule.getSourceKind()) && "DRAFT".equals(selected.getStatus())
                    && me != null && me.equals(selected.getOwnerId()));
        }
        out.setUsage(usageService.usage(id, out.getSelectedVer()));
        return out;
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
        Comparator<MdmRuleVer> byVer = Comparator.comparing(MdmRuleVer::getVer);
        Optional<MdmRuleVer> draft = versions.stream().filter(v -> "DRAFT".equals(v.getStatus())).max(byVer);
        if (draft.isPresent()) {
            return draft;
        }
        Optional<MdmRuleVer> approval = versions.stream().filter(v -> IN_APPROVAL.contains(v.getStatus())).max(byVer);
        if (approval.isPresent()) {
            return approval;
        }
        Optional<MdmRuleVer> current = RuleVersions.currentReleased(versions, now);
        return current.isPresent() ? current : versions.stream().max(byVer);
    }

    private static RuleInfo ruleInfo(MdmRule rule) {
        RuleInfo info = new RuleInfo();
        info.setMaruRuleId(rule.getMaruRuleId());
        info.setMaruRuleName(rule.getMaruRuleName());
        info.setRuleKind(rule.getRuleKind());
        info.setStatus(rule.getStatus());
        info.setSourceKind(rule.getSourceKind());
        info.setSourceSystem(rule.getSourceSystem());
        info.setDescription(rule.getDescription());
        info.setUsageNote(rule.getUsageNote());
        return info;
    }

    private VersionInfo versionInfo(MdmRuleVer v) {
        VersionInfo info = new VersionInfo();
        info.setVer(v.getVer());
        info.setStatus(v.getStatus());
        info.setApplyFrom(text(v.getApplyFrom()));
        info.setApplyTo(text(v.getApplyTo()));
        info.setOwnerId(v.getOwnerId());
        info.setBaseVer(v.getBaseVer());
        info.setHitPolicy(v.getHitPolicy());
        info.setRowVersion(v.getRowVersion());
        return info;
    }

    private String text(LocalDateTime value) {
        return value == null ? null : java.time.format.DateTimeFormatter.ofPattern(TEXT_PATTERN).format(temporal.fromDb(value));
    }

    private static RowInfo rowInfo(MdmRuleRow r) {
        return new RowInfo(r.getRowId(), r.getSeq(), r.getRowKind(), r.getCells(), r.getNote());
    }
}
