package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.blankToNull;
import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireRowVersion;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.RuleCaseInputs;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport;
import com.dongkuk.dmes.mdm.common.rule.RuleTestCaseQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleTestCaseWrites;
import com.dongkuk.dmes.mdm.common.rule.check.RuleLimits;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdIssuer;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleIdKind;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleTestCase;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 카드 ⑥ 테스트 케이스 저장(part CASE, TSK-08-04 design §6.6·I25). 케이스는 버전과 무관하게 룰에 붙으므로(06:1058) 버전·DRAFT 소유를
 * 보지 않고 담당자 역할(MDM013)·원천 MDM·폐기 아님만 본다(D8). 새 케이스는 {@code issue(CASE)} 로 번호를 받아 엔티티를 persist 하고, 수정·삭제는
 * 케이스의 {@code ROW_VERSION} 조건 네이티브 쓰기다(0행이면 MDM001). JSON 두 칸은 DB CHECK({@code json_valid}) 전에 여기서 객체인지 본다.
 * 상한({@link RuleLimits})은 같으면 통과·넘으면 MDM021(I23), 룰당 케이스 수는 새 케이스에만 건다.
 */
@Service
public class RuleTestCaseService implements RuleEditSavePart {

    static final String PART = "CASE";

    private final RuleScreenSupport support;
    private final RuleStewardCheck stewardCheck;
    private final RuleTestCaseQueries queries;
    private final RuleTestCaseWrites writes;
    private final MdmRuleIdIssuer issuer;
    private final TransactionTemplate tx;

    public RuleTestCaseService(RuleScreenSupport support, RuleStewardCheck stewardCheck, RuleTestCaseQueries queries, RuleTestCaseWrites writes,
                               MdmRuleIdIssuer issuer, PlatformTransactionManager transactionManager) {
        this.support = support;
        this.stewardCheck = stewardCheck;
        this.queries = queries;
        this.writes = writes;
        this.issuer = issuer;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Override
    public String part() {
        return PART;
    }

    @Override
    public RuleEditSaveResult save(RuleEditSaveRequest request) {
        MdmRule rule = support.loadRule(request.getMaruRuleId());
        // 외부 원천(EXTERNAL) 룰도 케이스는 쓴다(D-145) — 케이스는 버전과 무관한 검증 자료이고 표 정의는 바꾸지 않는다.
        if ("DEPRECATED".equals(rule.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "폐기한 룰에는 테스트 케이스를 쓸 수 없습니다", List.of());
        }
        stewardCheck.requireSteward();
        String id = rule.getMaruRuleId();
        if (Boolean.TRUE.equals(request.getCaseDeleted())) {
            return delete(id, request);
        }
        String name = blankToNull(request.getCaseName());
        if (name == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "케이스 이름은 필수입니다.");
        }
        if (name.length() > RuleLimits.MAX_CASE_NAME_CHARS) {
            throw limit("케이스 이름이 " + name.length() + "자다. " + RuleLimits.MAX_CASE_NAME_CHARS + "자까지 받는다");
        }
        String input = request.getInputJson();
        if (input == null || input.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "입력 JSON(inputJson)은 필수입니다.");
        }
        RuleCaseInputs.requireObject("입력", input);
        String expected = request.getExpectedJson() == null || request.getExpectedJson().isBlank() ? null : request.getExpectedJson();
        if (expected != null) {
            RuleCaseInputs.requireObject("기대", expected);
        }
        String description = blankToNull(request.getDescription());
        if (request.getCaseId() == null) {
            Integer caseId = tx.execute(status -> insert(id, name, input, expected, description));
            RuleEditSaveResult out = result(0L);
            out.setCaseId(caseId);
            return out;
        }
        int caseId = request.getCaseId();
        long rowVersion = requireRowVersion(request.getRowVersion());
        Integer changed = tx.execute(status -> writes.update(id, caseId, rowVersion, name, input, expected, description));
        if (changed == null || changed == 0) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
        RuleEditSaveResult out = result(rowVersion + 1);
        out.setCaseId(caseId);
        return out;
    }

    private Integer insert(String id, String name, String input, String expected, String description) {
        long count = queries.count(id);
        if (count >= RuleLimits.MAX_CASES_PER_RULE) {
            throw limit("룰의 케이스가 이미 " + count + "건이다. 룰마다 " + RuleLimits.MAX_CASES_PER_RULE + "건까지 둔다");
        }
        int caseId = issuer.issue(id, MdmRuleIdKind.CASE, 1).first();
        MdmRuleTestCase c = new MdmRuleTestCase(id, caseId, input);
        c.setCaseName(name);
        c.setExpectedJson(expected);
        c.setDescription(description);
        writes.insert(c);
        return caseId;
    }

    private RuleEditSaveResult delete(String id, RuleEditSaveRequest request) {
        if (request.getCaseId() == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "지울 케이스 ID(caseId)는 필수입니다.");
        }
        int caseId = request.getCaseId();
        long rowVersion = requireRowVersion(request.getRowVersion());
        Integer changed = tx.execute(status -> writes.delete(id, caseId, rowVersion));
        if (changed == null || changed == 0) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
        RuleEditSaveResult out = result(null);
        out.setCaseId(caseId);
        return out;
    }

    private static RuleEditSaveResult result(Long rowVersion) {
        return new RuleEditSaveResult(PART, rowVersion, Map.of(), List.of(), List.of());
    }

    private static BusinessException limit(String detail) {
        return RuleCaseInputs.limit(detail);
    }
}
