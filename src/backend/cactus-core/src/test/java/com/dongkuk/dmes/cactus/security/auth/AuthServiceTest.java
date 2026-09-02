package com.dongkuk.dmes.cactus.security.auth;

import com.dongkuk.dmes.cactus.autoconfigure.CactusProperties;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.security.jwt.JwtTokenProvider;
import com.dongkuk.dmes.cactus.security.jwt.TokenPair;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private SecUserRepository secUserRepository;

    private AuthService authService;
    private JwtTokenProvider tokenProvider;
    private PasswordEncoder passwordEncoder;

    private static final String SECRET = Base64.getEncoder().encodeToString(
            "this-is-a-test-secret-key-at-least-32-bytes!!".getBytes(StandardCharsets.UTF_8)
    );

    @BeforeEach
    void setUp() {
        CactusProperties properties = new CactusProperties();
        properties.getJwt().setSecret(SECRET);
        properties.getJwt().setIssuer("dmes-test");
        properties.getJwt().setAccessTokenExpiry(3600);
        properties.getJwt().setRefreshTokenExpiry(86400);
        properties.getSecurity().setMaxLoginFailures(5);

        tokenProvider = new JwtTokenProvider(properties);
        passwordEncoder = new PasswordEncoder();

        authService = new AuthService(
                tokenProvider, passwordEncoder,
                secUserRepository,
                properties
        );
    }

    private SecUser createActiveUser(String userId, String userNm, String userNo,
                                     String rawPassword, int tryCnt) {
        SecUser user = mock(SecUser.class, withSettings().strictness(org.mockito.quality.Strictness.LENIENT));
        when(user.getUserId()).thenReturn(userId);
        when(user.getUserNm()).thenReturn(userNm);
        when(user.getUserEmpNo()).thenReturn(userNo);
        when(user.getUserPass()).thenReturn(passwordEncoder.encode(rawPassword));
        when(user.isActive()).thenReturn(true);
        when(user.isLocked()).thenReturn(false);
        when(user.getTryCnt()).thenReturn(tryCnt);
        when(user.getPassInitYn()).thenReturn("N");
        when(user.getValidStrDd()).thenReturn(null);
        when(user.getValidEndDd()).thenReturn(null);
        return user;
    }

    // ── 로그인 성공 ──

    @Test
    @DisplayName("로그인 성공 - 토큰 쌍 + userInfo 반환")
    void login_success() {
        SecUser user = createActiveUser("admin", "홍길동", "E0001", "password123!", 0);
        when(secUserRepository.findById("admin")).thenReturn(Optional.of(user));

        Map<String, Object> result = authService.login(new LoginRequest("admin", "password123!"));

        assertNotNull(result.get("accessToken"));
        assertNotNull(result.get("refreshToken"));

        @SuppressWarnings("unchecked")
        Map<String, Object> userInfo = (Map<String, Object>) result.get("userInfo");
        assertEquals("admin", userInfo.get("userId"));
        assertEquals("홍길동", userInfo.get("userNm"));

        verify(secUserRepository).resetTryCnt("admin");
    }

    // ── 로그인 실패 ──

    @Test
    @DisplayName("존재하지 않는 사용자 → AUTH_FAILED")
    void login_userNotFound() {
        when(secUserRepository.findById("unknown")).thenReturn(Optional.empty());

        BusinessException ex = assertThrows(BusinessException.class, () ->
                authService.login(new LoginRequest("unknown", "password"))
        );
        assertEquals(ErrorCode.AUTH_FAILED, ex.getErrorCode());
    }

    @Test
    @DisplayName("비활성 계정 → ACCOUNT_DISABLED")
    void login_inactiveUser() {
        SecUser user = mock(SecUser.class);
        when(user.isActive()).thenReturn(false);
        when(secUserRepository.findById("admin")).thenReturn(Optional.of(user));

        BusinessException ex = assertThrows(BusinessException.class, () ->
                authService.login(new LoginRequest("admin", "password"))
        );
        assertEquals(ErrorCode.ACCOUNT_DISABLED, ex.getErrorCode());
    }

    @Test
    @DisplayName("잠긴 계정 → ACCOUNT_LOCKED")
    void login_lockedUser() {
        SecUser user = mock(SecUser.class, withSettings().strictness(org.mockito.quality.Strictness.LENIENT));
        when(user.isActive()).thenReturn(true);
        when(user.isLocked()).thenReturn(true);
        when(secUserRepository.findById("admin")).thenReturn(Optional.of(user));

        BusinessException ex = assertThrows(BusinessException.class, () ->
                authService.login(new LoginRequest("admin", "password"))
        );
        assertEquals(ErrorCode.ACCOUNT_LOCKED, ex.getErrorCode());
    }

    @Test
    @DisplayName("비밀번호 불일치 → AUTH_FAILED, 시도횟수 증가")
    void login_wrongPassword() {
        SecUser user = createActiveUser("admin", "홍길동", "E0001", "correctPassword", 0);
        when(secUserRepository.findById("admin")).thenReturn(Optional.of(user));

        BusinessException ex = assertThrows(BusinessException.class, () ->
                authService.login(new LoginRequest("admin", "wrongPassword"))
        );
        assertEquals(ErrorCode.AUTH_FAILED, ex.getErrorCode());
        verify(secUserRepository).incrementTryCnt("admin");
    }

    @Test
    @DisplayName("시도횟수 초과 시 잠금 처리")
    void login_lockOnMaxFailures() {
        SecUser user = createActiveUser("admin", "홍길동", "E0001", "correctPassword", 4);
        when(secUserRepository.findById("admin")).thenReturn(Optional.of(user));

        assertThrows(BusinessException.class, () ->
                authService.login(new LoginRequest("admin", "wrongPassword"))
        );
        verify(secUserRepository).incrementTryCnt("admin");
        verify(secUserRepository).lockUser("admin");
    }

    // ── 토큰 갱신 ──

    @Test
    @DisplayName("Refresh 성공 - 새 토큰 쌍 반환")
    void refresh_success() {
        com.dongkuk.dmes.cactus.security.context.UserInfo userInfo =
                new com.dongkuk.dmes.cactus.security.context.UserInfo("admin", "홍길동", "E0001");
        TokenPair original = tokenProvider.generateTokenPair(userInfo);

        SecUser user = createActiveUser("admin", "홍길동", "E0001", "pwd", 0);
        when(secUserRepository.findById("admin")).thenReturn(Optional.of(user));

        Map<String, Object> result = authService.refresh(original.refreshToken());

        assertNotNull(result.get("accessToken"));
        assertNotNull(result.get("refreshToken"));
        assertNotEquals(original.accessToken(), result.get("accessToken"));
    }

    @Test
    @DisplayName("Refresh - 비활성 사용자 → ACCOUNT_DISABLED")
    void refresh_inactiveUser() {
        com.dongkuk.dmes.cactus.security.context.UserInfo userInfo =
                new com.dongkuk.dmes.cactus.security.context.UserInfo("admin", "홍길동", "E0001");
        TokenPair original = tokenProvider.generateTokenPair(userInfo);

        SecUser user = mock(SecUser.class);
        when(user.isActive()).thenReturn(false);
        when(secUserRepository.findById("admin")).thenReturn(Optional.of(user));

        BusinessException ex = assertThrows(BusinessException.class, () ->
                authService.refresh(original.refreshToken())
        );
        assertEquals(ErrorCode.ACCOUNT_DISABLED, ex.getErrorCode());
    }

    @Test
    @DisplayName("Refresh - 잘못된 토큰 → INVALID_TOKEN")
    void refresh_invalidToken() {
        BusinessException ex = assertThrows(BusinessException.class, () ->
                authService.refresh("invalid.token.here")
        );
        assertEquals(ErrorCode.INVALID_TOKEN, ex.getErrorCode());
    }

    @Test
    @DisplayName("Refresh - 잠긴 사용자 → ACCOUNT_LOCKED (login 과 동일한 정책)")
    void refresh_lockedUser() {
        com.dongkuk.dmes.cactus.security.context.UserInfo userInfo =
                new com.dongkuk.dmes.cactus.security.context.UserInfo("admin", "홍길동", "E0001");
        TokenPair original = tokenProvider.generateTokenPair(userInfo);

        SecUser user = mock(SecUser.class, withSettings().strictness(org.mockito.quality.Strictness.LENIENT));
        when(user.isActive()).thenReturn(true);
        when(user.isLocked()).thenReturn(true);
        when(secUserRepository.findById("admin")).thenReturn(Optional.of(user));

        BusinessException ex = assertThrows(BusinessException.class, () ->
                authService.refresh(original.refreshToken())
        );
        assertEquals(ErrorCode.ACCOUNT_LOCKED, ex.getErrorCode());
    }

    @Test
    @DisplayName("Refresh - validStrDd 가 미래 → ACCOUNT_DISABLED (유효기간 시작 전)")
    void refresh_validStrDdInFuture() {
        com.dongkuk.dmes.cactus.security.context.UserInfo userInfo =
                new com.dongkuk.dmes.cactus.security.context.UserInfo("admin", "홍길동", "E0001");
        TokenPair original = tokenProvider.generateTokenPair(userInfo);

        SecUser user = mock(SecUser.class, withSettings().strictness(org.mockito.quality.Strictness.LENIENT));
        when(user.isActive()).thenReturn(true);
        when(user.isLocked()).thenReturn(false);
        when(user.getValidStrDd()).thenReturn(java.time.LocalDate.now().plusDays(1));
        when(secUserRepository.findById("admin")).thenReturn(Optional.of(user));

        BusinessException ex = assertThrows(BusinessException.class, () ->
                authService.refresh(original.refreshToken())
        );
        assertEquals(ErrorCode.ACCOUNT_DISABLED, ex.getErrorCode());
        assertTrue(ex.getMessage().contains("유효기간 시작"));
    }

    @Test
    @DisplayName("Refresh - validEndDd 가 과거 → ACCOUNT_DISABLED (유효기간 만료)")
    void refresh_validEndDdInPast() {
        com.dongkuk.dmes.cactus.security.context.UserInfo userInfo =
                new com.dongkuk.dmes.cactus.security.context.UserInfo("admin", "홍길동", "E0001");
        TokenPair original = tokenProvider.generateTokenPair(userInfo);

        SecUser user = mock(SecUser.class, withSettings().strictness(org.mockito.quality.Strictness.LENIENT));
        when(user.isActive()).thenReturn(true);
        when(user.isLocked()).thenReturn(false);
        when(user.getValidEndDd()).thenReturn(java.time.LocalDate.now().minusDays(1));
        when(secUserRepository.findById("admin")).thenReturn(Optional.of(user));

        BusinessException ex = assertThrows(BusinessException.class, () ->
                authService.refresh(original.refreshToken())
        );
        assertEquals(ErrorCode.ACCOUNT_DISABLED, ex.getErrorCode());
        assertTrue(ex.getMessage().contains("유효기간"));
    }
}
