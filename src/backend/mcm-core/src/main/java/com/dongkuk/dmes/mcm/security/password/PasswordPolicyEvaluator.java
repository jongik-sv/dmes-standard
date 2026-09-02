package com.dongkuk.dmes.mcm.security.password;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.regex.Pattern;

/**
 * 비밀번호 정책 평가기 — 갭 #9 (정책).
 *
 * <p>Phase R7 (2026-06-01) — legacy SecUserPwHis 폐기로 history 검증은 no-op 처리.
 * 신규 history 정책은 별도 PR (W5 SecUserPwd 확장 또는 별도 history 테이블 신설) 에서 재도입 예정.
 *
 * <p>cactus PasswordPolicy 인터페이스 implement 안 함 (의존 방향 정책). mcm-core 자체 클래스.
 * SecUserService.saveUsers / resetPassword 가 직접 호출. 사이트 McmAuthController.login 에서
 * 만료 검증 시 본 evaluator 를 직접 주입받아 호출.
 */
@Component
public class PasswordPolicyEvaluator {

    private final McmPasswordProperties properties;
    private final Pattern complexityPattern;

    public PasswordPolicyEvaluator(McmPasswordProperties properties) {
        this.properties = properties;
        String pattern = properties.getComplexityPattern();
        this.complexityPattern = (pattern == null || pattern.isBlank())
                ? null : Pattern.compile(pattern);
    }

    /**
     * 비번 변경/등록 시 정책 검증. 위반 시 {@link BusinessException}.
     *
     * @param rawPassword 평문 새 비밀번호
     * @param userId      소유자 ID — Phase R7: history 검증 비활성화 (legacy SecUserPwHis 폐기)
     */
    public void validate(String rawPassword, String userId) {
        if (rawPassword == null || rawPassword.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "비밀번호는 필수입니다.");
        }
        if (properties.getMinLength() > 0 && rawPassword.length() < properties.getMinLength()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    String.format("비밀번호는 최소 %d자 이상이어야 합니다.", properties.getMinLength()));
        }
        if (complexityPattern != null && !complexityPattern.matcher(rawPassword).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "비밀번호는 영문과 숫자를 모두 포함해야 합니다.");
        }
        // Phase R7 — history 검증 no-op (legacy SecUserPwHis 폐기). 신규 history 는 후속 PR.
        // properties.getHistoryCount() 가 양수여도 본 evaluator 는 검증 skip.
    }

    /**
     * 비번 만료 여부 — 갭 #9 만료 정책.
     *
     * <p>{@code passSetDd} 가 null 이면 legacy 사용자 — {@code legacy-grace-days} 정책 적용:
     * <ul>
     *   <li>0 이하: 즉시 만료 (= 옵션 A 강제 변경)</li>
     *   <li>양수 N: 정책 도입 시점 (지금 — LocalDate.now()) + N일 유예. 단순화하여 N일 안에 만료로 본다</li>
     *   <li>-1: legacy 미적용 (만료 false)</li>
     * </ul>
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
}
