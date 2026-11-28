package com.dongkuk.dmes.mcm.security.password;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.repository.SecUserPwdHisRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 비밀번호 정책 평가기 — 갭 #9 (정책).
 *
 * <p>2026-11-28 (시안 「사용자 비활성화·퇴직 처리」 D9·D10·D11·D14):
 * <ul>
 *   <li>새 비밀번호 규칙 — 최소 길이·조합({@code mcm.password.min-length}·{@code complexity-pattern}),
 *       임시 비밀번호({@code mcm.password.initial}) 금지, 최근 N개 재사용 금지({@code history-count},
 *       이력 = {@code TB_MCM_SEC_USER_PWD_HIS} 의 본인 변경 줄)</li>
 *   <li>사용 기간 — 마지막 변경일 + {@code expiry-days}. 남은 일수가 {@code warn-days} 이하면 알림</li>
 *   <li>임시 비밀번호 만료 시각 — 초기화는 그날 23:59:59, 신규 계정은 {@code new-user-temp-days} 뒤 23:59:59</li>
 * </ul>
 *
 * <p>cactus PasswordPolicy 인터페이스 implement 안 함 (의존 방향 정책). mcm-core 자체 클래스.
 */
@Component
public class PasswordPolicyEvaluator {

    private static final LocalTime END_OF_DAY = LocalTime.of(23, 59, 59);

    private final McmPasswordProperties properties;
    private final Pattern complexityPattern;
    private final SecUserPwdHisRepository historyRepository;
    private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();

    /** 이력 비교 없이(시험·옛 경로). */
    public PasswordPolicyEvaluator(McmPasswordProperties properties) {
        this(properties, null);
    }

    @Autowired
    public PasswordPolicyEvaluator(McmPasswordProperties properties, SecUserPwdHisRepository historyRepository) {
        this.properties = properties;
        this.historyRepository = historyRepository;
        String pattern = properties.getComplexityPattern();
        this.complexityPattern = (pattern == null || pattern.isBlank())
                ? null : Pattern.compile(pattern);
    }

    /** 설정. */
    public McmPasswordProperties properties() {
        return properties;
    }

    /** 임시(최초) 비밀번호 값. */
    public String initialPassword() {
        String v = properties.getInitial();
        return v == null || v.isBlank() ? "dmes0000" : v;
    }

    /**
     * 비번 변경 시 정책 검증. 위반 시 {@link BusinessException}.
     *
     * @param rawPassword 평문 새 비밀번호
     * @param userId      소유자 ID — 최근 N개 재사용 비교에 쓴다(null 이면 건너뜀)
     */
    public void validate(String rawPassword, String userId) {
        if (rawPassword == null || rawPassword.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "비밀번호는 필수입니다.");
        }
        if (rawPassword.equals(initialPassword())) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "임시 비밀번호는 새 비밀번호로 쓸 수 없습니다.");
        }
        if (properties.getMinLength() > 0 && rawPassword.length() < properties.getMinLength()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    String.format("비밀번호는 최소 %d자 이상이어야 합니다.", properties.getMinLength()));
        }
        if (complexityPattern != null && !complexityPattern.matcher(rawPassword).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "비밀번호는 영문과 숫자를 모두 포함해야 합니다.");
        }
        if (userId != null && historyRepository != null && properties.getHistoryCount() > 0) {
            List<String> recent = historyRepository.findRecentSelfHashes(userId,
                    PageRequest.of(0, properties.getHistoryCount()));
            for (String hash : recent) {
                if (hash != null && bcrypt.matches(rawPassword, hash)) {
                    throw new BusinessException(ErrorCode.INVALID_VALUE,
                            String.format("최근 %d개 안에 쓴 비밀번호는 다시 쓸 수 없습니다.", properties.getHistoryCount()));
                }
            }
        }
    }

    /**
     * 비번 만료 여부 — 갭 #9 만료 정책.
     *
     * <p>{@code passSetDd} 가 null 이면 legacy 사용자 — {@code legacy-grace-days} 정책 적용:
     * 0 이하 즉시 만료 · 양수 N 만료 아님 · -1 미적용(만료 false). 2026-11-28 부터 빈 변경일은 임시 비밀번호 상태라
     * 로그인은 이 메서드보다 임시 판정을 먼저 한다.
     *
     * <p>{@code expiryDays} 가 0 이하면 만료 검증 비활성 — 항상 false 반환.
     */
    public boolean isExpired(LocalDate passSetDd) {
        if (properties.getExpiryDays() <= 0) return false;
        if (passSetDd == null) {
            int grace = properties.getLegacyGraceDays();
            if (grace == -1) return false;
            return grace <= 0;
        }
        LocalDate threshold = LocalDate.now().minusDays(properties.getExpiryDays());
        return passSetDd.isBefore(threshold);
    }

    /**
     * 사용 기간 남은 일수. 사용 기간이 꺼져 있거나 변경일이 없으면 null. 음수면 만료(만료일 다음 날부터 -1).
     * 만료일 = 마지막 변경일 + expiry-days(그날까지 쓸 수 있다).
     */
    public Long daysLeft(LocalDateTime lastPwdChngDate, LocalDate today) {
        if (properties.getExpiryDays() <= 0 || lastPwdChngDate == null) return null;
        LocalDate expiry = lastPwdChngDate.toLocalDate().plusDays(properties.getExpiryDays());
        return ChronoUnit.DAYS.between(today, expiry);
    }

    /** 만료 전 알림을 띄울 남은 일수인가. */
    public boolean warn(Long daysLeft) {
        return daysLeft != null && daysLeft >= 0 && properties.getWarnDays() > 0 && daysLeft <= properties.getWarnDays();
    }

    /** 관리자 초기화의 임시 만료 시각 — 그날 23:59:59. */
    public LocalDateTime tempExpiryForReset(LocalDate today) {
        return today.atTime(END_OF_DAY);
    }

    /** 신규 계정의 임시 만료 시각 — N일 뒤 23:59:59. */
    public LocalDateTime tempExpiryForNewUser(LocalDate today) {
        return today.plusDays(Math.max(0, properties.getNewUserTempDays())).atTime(END_OF_DAY);
    }
}
