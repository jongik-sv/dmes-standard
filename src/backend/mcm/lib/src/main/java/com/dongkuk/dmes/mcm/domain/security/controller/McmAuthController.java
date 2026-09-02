package com.dongkuk.dmes.mcm.domain.security.controller;

import com.dongkuk.dmes.cactus.common.ApiResponse;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.security.auth.AuthService;
import com.dongkuk.dmes.cactus.security.auth.LoginRequest;
import com.dongkuk.dmes.cactus.security.auth.RefreshRequest;
import com.dongkuk.dmes.cactus.security.auth.SecUser;
import com.dongkuk.dmes.cactus.security.auth.SecUserRepository;
import com.dongkuk.dmes.mcm.audit.entity.LoginLog;
import com.dongkuk.dmes.mcm.audit.entity.RevokedToken;
import com.dongkuk.dmes.mcm.audit.repository.LoginLogRepository;
import com.dongkuk.dmes.mcm.audit.repository.RevokedTokenRepository;
import com.dongkuk.dmes.mcm.security.endpoint.UserPermCache;
import com.dongkuk.dmes.mcm.security.password.PasswordPolicyEvaluator;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 프론트엔드 전용 인증 엔드포인트.
 * cactus-core 의 default AuthController 와 별도로 /api/auth/* 경로 제공.
 *
 * <p>갭 #14 (로그인 이력) — login/refresh/logout 시 mcm-core 의 LoginLogRepository 에 기록.
 * cactus-core AuthService 에 hook 을 추가하지 않고 컨트롤러 레벨에서 처리하여 cactus 비변경.
 */
@RestController
@RequestMapping("/api/auth")
public class McmAuthController {

    private final AuthService authService;
    private final LoginLogRepository loginLogRepository;
    private final SecUserRepository secUserRepository;
    private final PasswordPolicyEvaluator passwordPolicyEvaluator;
    private final RevokedTokenRepository revokedTokenRepository;
    private final UserPermCache userPermCache;
    private final SecretKey jwtSigningKey;

    public McmAuthController(AuthService authService,
                             LoginLogRepository loginLogRepository,
                             SecUserRepository secUserRepository,
                             PasswordPolicyEvaluator passwordPolicyEvaluator,
                             RevokedTokenRepository revokedTokenRepository,
                             UserPermCache userPermCache,
                             @Value("${cactus.jwt.secret}") String jwtSecret) {
        this.authService = authService;
        this.loginLogRepository = loginLogRepository;
        this.secUserRepository = secUserRepository;
        this.passwordPolicyEvaluator = passwordPolicyEvaluator;
        this.revokedTokenRepository = revokedTokenRepository;
        this.userPermCache = userPermCache;
        this.jwtSigningKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(jwtSecret));
    }

    @PostMapping("/login")
    public ApiResponse<?> login(@RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        try {
            // 가변 복사본 — permKeys / passwordExpired 등 응답 메타를 단일 map 에 누적.
            Map<String, Object> result = new LinkedHashMap<>(authService.login(request));
            recordLoginEvent(request.userId(), "LOGIN_SUCCESS", httpRequest);

            // RBAC-PATH-CONVENTION §5.2 — 로그인 직후 PermKey 캐시 빌드 (eager).
            // 이후 요청은 EndpointPermissionFilter 가 O(1) lookup. 실패해도 lazy 재로드 가능하므로 swallow.
            try {
                userPermCache.loadAndCache(request.userId());
            } catch (Exception ignore) {
                // 캐시 빌드 실패가 로그인 자체를 막지 않게.
            }

            // BFF RBAC (방식 T) — 로그인 응답에 권한키 배열 적재. FE 가 NextAuth token.perms 로 저장하고
            // BFF proxy.ts 가 URL→키 멤버십 검증에 사용. SYSADMIN 은 ["*"]. 실패해도 로그인 막지 않음.
            try {
                result.put("permKeys", userPermCache.toKeyStrings(request.userId()));
            } catch (Exception ignore) {
                // permKeys 빌드 실패는 BE EndpointPermissionFilter 백스톱이 커버.
            }

            // 갭 #9 — 비번 만료 검증. 응답 메타에 passwordExpired 추가
            SecUser user = secUserRepository.findById(request.userId()).orElse(null);
            if (user != null && passwordPolicyEvaluator.isExpired(user.getPassSetDd())) {
                result.put("passwordExpired", true);
            }
            return ApiResponse.ok(result);
        } catch (BusinessException ex) {
            recordLoginEvent(request.userId(), "LOGIN_FAIL", httpRequest);
            throw ex;
        }
    }

    @PostMapping("/refresh")
    public ApiResponse<?> refresh(@RequestBody RefreshRequest request) {
        Map<String, Object> result = authService.refresh(request.refreshToken());
        return ApiResponse.ok(result);
    }

    @PostMapping("/logout")
    public ApiResponse<?> logout(@RequestBody Map<String, Object> request, HttpServletRequest httpRequest) {
        String userId = (String) request.get("userId");
        if (userId != null) {
            authService.logout(userId);
            recordLoginEvent(userId, "LOGOUT", httpRequest);
            try { userPermCache.invalidate(userId); } catch (Exception ignore) {}
        }

        // 갭 #12 — Authorization 헤더의 access 토큰 jti 를 RevokedToken 에 적재
        revokeAccessToken(userId, httpRequest);

        return ApiResponse.ok(Map.of("ok", true));
    }

    /**
     * Authorization 헤더에서 Bearer 토큰을 추출해 jti / exp 를 파싱한 뒤
     * RevokedToken 에 적재. 이후 같은 jti 의 요청은 RevokedTokenFilter 가 401 처리.
     * 실패 시 swallow (로그아웃 자체를 막지 않음).
     */
    private void revokeAccessToken(String userId, HttpServletRequest httpRequest) {
        try {
            String header = httpRequest.getHeader("Authorization");
            if (header == null || !header.startsWith("Bearer ")) return;
            String token = header.substring(7);

            Claims claims = Jwts.parser()
                    .verifyWith(jwtSigningKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            String jti = claims.getId();
            Instant exp = claims.getExpiration() != null ? claims.getExpiration().toInstant() : null;
            if (jti == null || jti.isBlank()) return;

            if (revokedTokenRepository.findById(jti).isEmpty()) {
                RevokedToken rt = new RevokedToken();
                rt.setJti(jti);
                rt.setUserId(userId);
                rt.setRevokedAt(Instant.now());
                rt.setExpiresAt(exp);
                revokedTokenRepository.save(rt);
            }
        } catch (Exception ignore) {
            // 회수 실패가 로그아웃을 막지 않도록 swallow
        }
    }

    private void recordLoginEvent(String userId, String eventType, HttpServletRequest httpRequest) {
        try {
            LoginLog log = new LoginLog();
            log.setLogId(UUID.randomUUID().toString());
            log.setUserId(userId);
            log.setEventType(eventType);
            log.setClientIp(httpRequest != null ? httpRequest.getRemoteAddr() : null);
            log.setUserAgent(httpRequest != null ? httpRequest.getHeader("User-Agent") : null);
            log.setOccurredAt(Instant.now());
            loginLogRepository.save(log);
        } catch (Exception ignore) {
            // 감사 로그 실패가 인증 흐름을 막지 않도록
        }
    }
}
