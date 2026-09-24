package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSearchResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleVersionResult;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * 룰 화면({@code ruleEdit}) OASIS 진입 파사드 — TSK-08-02 design §6.1. BPMN {@code services/dme/ruleEdit.bpmn} 의 여덟 분기와 1:1:
 * search({@link #searchRules})·view·save·delete·copy({@link #newVersion})·lock·unlock·handover. 업무 규칙은 두지 않고 카드별 서비스에
 * 넘긴다. save 는 {@code part} 로 {@link RuleEditSavePart} 빈을, delete 는 {@code target}(VERSION·RULE)으로 서비스를 고른다.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다(MUST)</b> — OASIS 파라미터 이름 바인딩이 깨진다(I25).
 */
@Service("ruleEditService")
public class RuleEditService {

    static final int SEARCH_LIMIT = 20;

    private final RuleQueries queries;
    private final RuleViewService viewService;
    private final RuleVersionService versionService;
    private final RuleHeaderService headerService;
    private final Map<String, RuleEditSavePart> parts = new HashMap<>();

    public RuleEditService(RuleQueries queries, RuleViewService viewService, RuleVersionService versionService,
                           RuleHeaderService headerService, List<RuleEditSavePart> saveParts) {
        this.queries = queries;
        this.viewService = viewService;
        this.versionService = versionService;
        this.headerService = headerService;
        for (RuleEditSavePart part : saveParts) {
            if (parts.put(part.part(), part) != null) {
                throw new IllegalStateException("같은 저장 부분이 둘이다: " + part.part());
            }
        }
    }

    // action: search — 상단 룰 고르기
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
}
