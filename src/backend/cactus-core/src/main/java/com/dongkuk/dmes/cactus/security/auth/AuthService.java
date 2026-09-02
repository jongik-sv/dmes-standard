package com.dongkuk.dmes.cactus.security.auth;

import com.dongkuk.dmes.cactus.autoconfigure.CactusProperties;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import com.dongkuk.dmes.cactus.security.jwt.JwtTokenProvider;
import com.dongkuk.dmes.cactus.security.jwt.TokenPair;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 인증 비즈니스 로직.
 * 프로젝트에서 상속하여 loadUserRoles()를 오버라이드할 수 있다.
 *
 * <p>빈 등록은 {@link com.dongkuk.dmes.cactus.autoconfigure.CactusAuthAutoConfiguration}
 * 에서 {@code cactus.auth.enabled=true} 인 경우에만 수행된다.
 */
public class AuthService {

    /** JWT 토큰 프로바이더 */
    private final JwtTokenProvider tokenProvider;
    /** 비밀번호 인코더 */
    private final PasswordEncoder passwordEncoder;
    /** 사용자 정보 리포지토리 */
    protected final SecUserRepository secUserRepository;
    /** 로그인 실패 허용 최대 횟수 */
    private final int maxLoginFailures;

    /**
     * AuthService 생성자.
     */
    public AuthService(JwtTokenProvider tokenProvider,
                       PasswordEncoder passwordEncoder,
                       SecUserRepository secUserRepository,
                       CactusProperties properties) {
        this.tokenProvider = tokenProvider;
        this.passwordEncoder = passwordEncoder;
        this.secUserRepository = secUserRepository;
        this.maxLoginFailures = properties.getSecurity().getMaxLoginFailures();
    }

    /**
     * 로그인 처리.
     */
    @Transactional
    public Map<String, Object> login(LoginRequest request) {
        // 1. 사용자 조회
        SecUser user = secUserRepository.findById(request.userId())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_FAILED));

        // 2~4. 계정 사용 가능 여부 (활성/잠금/유효기간) — login/refresh 공통
        assertAccountUsable(user);

        // 5. 잠금 횟수 체크
        if (user.getTryCnt() != null && user.getTryCnt() >= maxLoginFailures) {
            secUserRepository.lockUser(request.userId());
            throw new BusinessException(ErrorCode.ACCOUNT_LOCKED);
        }

        // 6. 비밀번호 검증
        if (!passwordEncoder.matches(request.password(), user.getUserPass())) {
            secUserRepository.incrementTryCnt(request.userId());
            if ((user.getTryCnt() != null ? user.getTryCnt() : 0) + 1 >= maxLoginFailures) {
                secUserRepository.lockUser(request.userId());
            }
            throw new BusinessException(ErrorCode.AUTH_FAILED);
        }

        // 7. 성공: 시도횟수 리셋
        secUserRepository.resetTryCnt(request.userId());

        // 8. 역할 조회
        List<String> roles = loadUserRoles(request.userId());

        // 9. 토큰 생성 (roles 포함)
        UserInfo userInfo = new UserInfo(
                user.getUserId(), user.getUserNm(), user.getUserEmpNo(), roles);
        TokenPair tokenPair = tokenProvider.generateTokenPair(userInfo);

        // 10. 응답
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("accessToken", tokenPair.accessToken());
        result.put("refreshToken", tokenPair.refreshToken());

        Map<String, Object> info = new LinkedHashMap<>();
        info.put("userId", user.getUserId());
        info.put("userNm", user.getUserNm());
        info.put("userNo", user.getUserEmpNo());
        result.put("userInfo", info);

        // 비밀번호 초기화 여부
        if ("Y".equals(user.getPassInitYn())) {
            result.put("passwordChangeRequired", true);
        }

        return result;
    }

    /**
     * 역할 조회 — 기본 구현은 ROLE_USER.
     * 프로젝트에서 오버라이드하여 DB 역할을 반환한다.
     */
    protected List<String> loadUserRoles(String userId) {
        return List.of("ROLE_USER");
    }

    /**
     * 토큰 갱신.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> refresh(String refreshToken) {
        // 1. Refresh Token 검증
        String userId;
        try {
            userId = tokenProvider.validateRefreshToken(refreshToken);
        } catch (ExpiredJwtException e) {
            throw new BusinessException(ErrorCode.TOKEN_EXPIRED,
                    "Refresh 토큰이 만료되었습니다. 다시 로그인하세요");
        } catch (JwtException e) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN,
                    "유효하지 않은 Refresh 토큰입니다");
        }

        // 2. 사용자 재조회 + 계정 사용 가능 여부 (활성/잠금/유효기간)
        SecUser user = secUserRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACCOUNT_DISABLED,
                        "사용자 정보를 찾을 수 없습니다. 다시 로그인하세요"));
        assertAccountUsable(user);

        // 3. 역할 재조회
        List<String> roles = loadUserRoles(userId);

        // 4. 새 토큰 발급
        UserInfo userInfo = new UserInfo(
                user.getUserId(), user.getUserNm(), user.getUserEmpNo(), roles);
        TokenPair newTokenPair = tokenProvider.generateTokenPair(userInfo);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("accessToken", newTokenPair.accessToken());
        result.put("refreshToken", newTokenPair.refreshToken());
        return result;
    }

    /**
     * 로그아웃.
     */
    public void logout(String userId) {
        // 필요 시 로그아웃 이력 저장
    }

    /**
     * 계정 사용 가능 여부 검증. login/refresh 양쪽에서 동일 정책으로 사용된다.
     *
     * <p>검증 항목 (실패 시 {@link BusinessException}):
     * <ul>
     *   <li>{@link SecUser#isActive()} = false → {@link ErrorCode#ACCOUNT_DISABLED}</li>
     *   <li>{@link SecUser#isLocked()} = true → {@link ErrorCode#ACCOUNT_LOCKED}</li>
     *   <li>{@link SecUser#getValidStrDd()} 가 미래 → {@link ErrorCode#ACCOUNT_DISABLED} ("유효기간 시작 전")</li>
     *   <li>{@link SecUser#getValidEndDd()} 가 과거 → {@link ErrorCode#ACCOUNT_DISABLED} ("유효기간 만료")</li>
     * </ul>
     *
     * <p>refresh 토큰 갱신 시에도 본 검증을 거쳐야, 잠긴 계정이나 만료된 계정이
     * 기존 refreshToken 으로 세션을 연장하지 못한다.
     */
    private void assertAccountUsable(SecUser user) {
        if (!user.isActive()) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
        }
        if (user.isLocked()) {
            throw new BusinessException(ErrorCode.ACCOUNT_LOCKED);
        }
        LocalDate today = LocalDate.now();
        if (user.getValidStrDd() != null && today.isBefore(user.getValidStrDd())) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, "계정 유효기간 시작 전입니다");
        }
        if (user.getValidEndDd() != null && today.isAfter(user.getValidEndDd())) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, "계정 유효기간이 만료되었습니다");
        }
    }
}
