package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
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
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * 룰 영역 화면 서비스 공용 — 룰 읽기·원천 검사·버전 키·현재 시각·요청 사용자(TSK-08-02 design §6.3). 업무 규칙은 두지 않는다.
 *
 * <p>D-105 로 헤더·버전 화면({@code ruleMng})과 내용 화면({@code ruleEdit})이 같이 쓰게 됐다. {@code dme.ruleEdit.service} 에
 * 두면 한쪽이 다른 화면의 패키지를 의존하므로 여기(룰 공용 영역)로 옮겼다. D-105 이전에는 패키지-private 였지만 두 화면이
 * 함께 쓰므로 public 으로 넓혔다.
 */
@Component
public class RuleScreenSupport {

    public static final String SOURCE_MDM = "MDM";
    private static final Set<String> IN_APPROVAL = Set.of("REQUESTED", "APPROVED");

    private final MdmRuleRepository ruleRepository;
    private final MdmCurrentUser currentUser;
    private final Clock clock;

    public RuleScreenSupport(MdmRuleRepository ruleRepository, MdmCurrentUser currentUser, Clock clock) {
        this.ruleRepository = ruleRepository;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    public MdmRule loadRule(String ruleId) {
        if (ruleId == null || ruleId.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "룰 ID 는 필수입니다.");
        }
        return ruleRepository.findById(ruleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "룰을 찾을 수 없습니다: " + ruleId));
    }

    /** 외부 원천(EXTERNAL) 룰은 조회만 한다(수용 기준 2, D11). */
    public static void requireMdm(MdmRule rule) {
        if (!SOURCE_MDM.equals(rule.getSourceKind())) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "외부 원천(EXTERNAL) 룰은 조회만 할 수 있습니다: " + rule.getMaruRuleId());
        }
    }

    /**
     * 결재 중(REQUESTED·APPROVED) 버전이 있으면 MDM006(D14). 공통 {@code VersionWriteGuard.checkCanCreateVersion} 은 DRAFT·적용 전
     * RELEASED 만 보므로 룰은 결재 중 두 상태를 여기서 더 본다. 공통 가드와 겹치지 않게 이 두 상태만 본다.
     */
    public static void requireNoVersionInApproval(Collection<MdmRuleVer> versions) {
        if (versions.stream().anyMatch(v -> IN_APPROVAL.contains(v.getStatus()))) {
            throw MdmErrors.of(MdmErrorCode.UNAPPLIED_VERSION_EXISTS);
        }
    }

    public static VersionRef ref(String ruleId, BigDecimal ver) {
        return new VersionRef(VersionTarget.BUSINESS_RULE, ruleId, VersionNumbers.scaled(ver));
    }

    /**
     * 화면이 보낸 버전 문자열(예: {@code "1.001"})을 scale 3 버전으로(D-144). 비면 필수 오류, 소수 넷째 자리 이상이거나 숫자가 아니면
     * 형식 오류다. 정수 문자열 {@code "1"} 은 {@code 1.000} 이다.
     */
    public static BigDecimal requireVer(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "버전은 필수입니다.");
        }
        return parseVer(raw);
    }

    /** 응답에 싣는 버전 문자열({@code "1.001"}). 버전이 없으면 null. */
    public static String verText(BigDecimal ver) {
        return ver == null ? null : VersionNumbers.plain(ver);
    }

    /** 비어 있으면 null(서버가 기본 버전을 고른다). 형식 오류는 {@link #requireVer} 와 같다. */
    public static BigDecimal optionalVer(String raw) {
        return raw == null || raw.isBlank() ? null : parseVer(raw);
    }

    private static BigDecimal parseVer(String raw) {
        try {
            return VersionNumbers.parse(raw);
        } catch (IllegalArgumentException | ArithmeticException e) { // NumberFormatException 포함
            throw MdmErrors.of(MdmErrorCode.INVALID_INPUT, "버전 형식이 올바르지 않습니다: " + raw, List.of());
        }
    }

    public static long requireRowVersion(Long rowVersion) {
        if (rowVersion == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "row_version 은 필수입니다.");
        }
        return rowVersion;
    }

    public static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    public String me() {
        return currentUser.userId();
    }

    public LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }
}
