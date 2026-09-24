package com.dongkuk.dmes.mdm.dme.ruleEdit.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
import java.util.Set;
import org.springframework.stereotype.Component;

/** 룰 화면 서비스 공용 — 룰 읽기·원천 검사·버전 키·현재 시각·요청 사용자(TSK-08-02 design §6.3). 업무 규칙은 두지 않는다. */
@Component
public class RuleEditSupport {

    static final String SOURCE_MDM = "MDM";
    private static final Set<String> IN_APPROVAL = Set.of("REQUESTED", "APPROVED");

    private final MdmRuleRepository ruleRepository;
    private final MdmCurrentUser currentUser;
    private final Clock clock;

    public RuleEditSupport(MdmRuleRepository ruleRepository, MdmCurrentUser currentUser, Clock clock) {
        this.ruleRepository = ruleRepository;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    MdmRule loadRule(String ruleId) {
        if (ruleId == null || ruleId.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 ID 는 필수입니다.");
        }
        return ruleRepository.findById(ruleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "룰을 찾을 수 없습니다: " + ruleId));
    }

    /** 외부 원천(EXTERNAL) 룰은 조회만 한다(수용 기준 2, D11). */
    static void requireMdm(MdmRule rule) {
        if (!SOURCE_MDM.equals(rule.getSourceKind())) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "외부 원천(EXTERNAL) 룰은 조회만 할 수 있습니다: " + rule.getMaruRuleId());
        }
    }

    /**
     * 결재 중(REQUESTED·APPROVED) 버전이 있으면 MDM006(D14). 공통 {@code VersionWriteGuard.checkCanCreateVersion} 은 DRAFT·적용 전
     * RELEASED 만 보므로 룰은 결재 중 두 상태를 여기서 더 본다. 공통 가드와 겹치지 않게 이 두 상태만 본다.
     */
    static void requireNoVersionInApproval(Collection<MdmRuleVer> versions) {
        if (versions.stream().anyMatch(v -> IN_APPROVAL.contains(v.getStatus()))) {
            throw MdmErrors.of(MdmErrorCode.UNAPPLIED_VERSION_EXISTS);
        }
    }

    static VersionRef ref(String ruleId, int ver) {
        return new VersionRef(VersionTarget.BUSINESS_RULE, ruleId, BigDecimal.valueOf(ver));
    }

    static int requireVer(Integer ver) {
        if (ver == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "버전은 필수입니다.");
        }
        return ver;
    }

    static long requireRowVersion(Long rowVersion) {
        if (rowVersion == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "row_version 은 필수입니다.");
        }
        return rowVersion;
    }

    static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    String me() {
        return currentUser.userId();
    }

    LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }
}
