package com.dongkuk.dmes.mdm.dme.ruleSetEdit.service;

import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.blankToNull;
import static com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport.requireRowVersion;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.RuleCaseInputs;
import com.dongkuk.dmes.mdm.common.rule.RuleSetRunner;
import com.dongkuk.dmes.mdm.common.rule.RuleSetTestCaseQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetTestCaseWrites;
import com.dongkuk.dmes.mdm.common.rule.RuleStewardCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleLimits;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveResult;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleSetTestCase;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.sql.SQLException;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 룰 세트 테스트 케이스 저장·삭제({@code ruleSetEdit} save {@code part=CASE}, 흐름도 3단계 P7). 케이스는 세트의 버전·{@code ROW_VERSION} 과
 * 무관하다 — 케이스 저장은 세트 행을 건드리지 않는다. 담당자 역할(MDM013)·폐기 아님(MDM009)만 본다(P-D8). 새 케이스 번호는 세트 안 최대 번호 + 1
 * 이라(룰 케이스의 카운터와 다르다) 지운 번호를 다시 쓰고, 동시에 저장하면 PK 충돌로 MDM001 이 된다.
 *
 * <p>{@code @Transactional} 을 붙이지 않는다(MUST) — OASIS 파라미터 이름 바인딩이 깨진다. 쓰기는 {@link TransactionTemplate}.
 */
@Service
public class RuleSetTestCaseService {

    /** 세트당 저장 상한이자 한 번 실행 상한(P-D5). */
    public static final int MAX_CASES_PER_SET = 50;
    static final String CONCURRENT_CASE_MESSAGE = "같은 세트에 케이스가 동시에 저장됐습니다. 목록을 다시 불러와 저장하세요";
    /** Oracle 고유 제약 위반 오류 코드(ORA-00001). */
    private static final int ORA_UNIQUE_VIOLATION = 1;
    /** V1 기준선의 PK 제약 이름 — 같은 (세트, 케이스 ID) 동시 INSERT 를 이것으로 가린다. */
    private static final String PK_CONSTRAINT = "PK_TB_MDM_RULE_SET_TEST_CASE";

    private final MdmRuleSetRepository setRepository;
    private final RuleStewardCheck stewardCheck;
    private final RuleSetTestCaseQueries queries;
    private final RuleSetTestCaseWrites writes;
    private final TransactionTemplate tx;

    public RuleSetTestCaseService(MdmRuleSetRepository setRepository, RuleStewardCheck stewardCheck, RuleSetTestCaseQueries queries,
                                  RuleSetTestCaseWrites writes, PlatformTransactionManager transactionManager) {
        this.setRepository = setRepository;
        this.stewardCheck = stewardCheck;
        this.queries = queries;
        this.writes = writes;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public RuleSetSaveResult save(RuleSetSaveRequest request) {
        String setId = blankToNull(request.getSetId());
        if (setId == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 세트 ID 는 필수입니다.");
        }
        MdmRuleSet set = setRepository.findById(setId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "룰 세트를 찾을 수 없습니다: " + setId));
        if (RuleSetEditService.DEPRECATED.equals(set.getStatus())) {
            throw MdmErrors.of(MdmErrorCode.TRANSITION_NOT_ALLOWED, "폐기한 룰 세트에는 테스트 케이스를 쓸 수 없습니다", List.of());
        }
        stewardCheck.requireSteward();
        if (Boolean.TRUE.equals(request.getCaseDeleted())) {
            return delete(setId, request);
        }
        String name = blankToNull(request.getCaseName());
        if (name == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "케이스 이름은 필수입니다.");
        }
        if (name.length() > RuleLimits.MAX_CASE_NAME_CHARS) {
            throw RuleCaseInputs.limit("케이스 이름이 " + name.length() + "자다. " + RuleLimits.MAX_CASE_NAME_CHARS + "자까지 받는다");
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
        String evalTs = blankToNull(request.getEvalTs());
        if (evalTs != null) {
            RuleSetRunner.parseKst(evalTs); // 형식 검사만 — 받은 글자를 그대로 저장한다(P-D6)
        }
        String description = blankToNull(request.getDescription());
        if (request.getCaseId() == null) {
            return insert(setId, name, input, evalTs, expected, description);
        }
        int caseId = request.getCaseId();
        long rowVersion = requireRowVersion(request.getRowVersion());
        Integer changed = tx.execute(status -> writes.update(setId, caseId, rowVersion, name, input, evalTs, expected, description));
        if (changed == null || changed == 0) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
        return result(setId, rowVersion + 1, caseId);
    }

    private RuleSetSaveResult insert(String setId, String name, String input, String evalTs, String expected, String description) {
        Integer caseId;
        try {
            caseId = tx.execute(status -> {
                long count = queries.count(setId);
                if (count >= MAX_CASES_PER_SET) {
                    throw RuleCaseInputs.limit("세트의 케이스가 이미 " + count + "건이다. 세트마다 " + MAX_CASES_PER_SET + "건까지 둔다");
                }
                int next = queries.maxCaseId(setId) + 1;
                MdmRuleSetTestCase c = new MdmRuleSetTestCase(setId, next, input);
                c.setCaseName(name);
                c.setEvalTs(evalTs);
                c.setExpectedJson(expected);
                c.setDescription(description);
                writes.insert(c);
                return next;
            });
        } catch (BusinessException e) {
            throw e;
        } catch (RuntimeException e) {
            // 예외 번역 층(JpaSystemException·DataIntegrityViolationException 등)에 기대지 않고 원인 사슬의 JDBC 오류로 가린다.
            if (!primaryKeyClash(e)) {
                throw e;
            }
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT, CONCURRENT_CASE_MESSAGE, List.of());
        }
        return result(setId, 0L, caseId);
    }

    private RuleSetSaveResult delete(String setId, RuleSetSaveRequest request) {
        if (request.getCaseId() == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "지울 케이스 ID(caseId)는 필수입니다.");
        }
        int caseId = request.getCaseId();
        long rowVersion = requireRowVersion(request.getRowVersion());
        Integer changed = tx.execute(status -> writes.delete(setId, caseId, rowVersion));
        if (changed == null || changed == 0) {
            throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
        }
        return result(setId, null, caseId);
    }

    /**
     * 원인 사슬에 이 표의 PK 위반이 있는가 — Oracle {@code ORA-00001}(오류 코드 1)이고 문구에 PK 제약 이름이 든 것만 본다.
     * 다른 제약(UNIQUE·CHECK·FK) 위반은 그대로 던진다. 23 이상은 문구 뒤에 표·칼럼을 덧붙이므로 문구 전체는 비교하지 않는다.
     */
    private static boolean primaryKeyClash(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            String m = t.getMessage();
            boolean uniqueViolation = (t instanceof SQLException s && s.getErrorCode() == ORA_UNIQUE_VIOLATION)
                    || (m != null && m.contains("ORA-00001"));
            if (uniqueViolation && m != null && m.contains(PK_CONSTRAINT)) {
                return true;
            }
        }
        return false;
    }

    private static RuleSetSaveResult result(String setId, Long rowVersion, int caseId) {
        RuleSetSaveResult out = new RuleSetSaveResult(setId, rowVersion, List.of());
        out.setCaseId(caseId);
        return out;
    }
}
