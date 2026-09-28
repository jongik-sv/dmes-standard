package com.dongkuk.dmes.mcm.domain.security.controller;

import com.dongkuk.dmes.cactus.common.ApiResponse;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.security.auth.AuthService;
import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.cactus.security.auth.LoginRequest;
import com.dongkuk.dmes.cactus.security.auth.RefreshRequest;
import com.dongkuk.dmes.cactus.security.auth.SecUser;
import com.dongkuk.dmes.cactus.security.auth.SecUserRepository;
import com.dongkuk.dmes.mcm.audit.entity.LoginLog;
import com.dongkuk.dmes.mcm.audit.entity.RevokedToken;
import com.dongkuk.dmes.mcm.audit.repository.LoginLogRepository;
import com.dongkuk.dmes.mcm.audit.repository.RevokedTokenRepository;
import com.dongkuk.dmes.mcm.domain.security.service.McmSecUserRepository;
import com.dongkuk.dmes.mcm.security.endpoint.UserPermCache;
import com.dongkuk.dmes.mcm.security.password.PasswordPolicyEvaluator;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.time.LocalDate;
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
    private final PasswordEncoder passwordEncoder;
    private final McmSecUserRepository mcmSecUserRepository;

    public McmAuthController(AuthService authService,
                             LoginLogRepository loginLogRepository,
                             SecUserRepository secUserRepository,
                             PasswordPolicyEvaluator passwordPolicyEvaluator,
                             RevokedTokenRepository revokedTokenRepository,
                             UserPermCache userPermCache,
                             PasswordEncoder passwordEncoder,
                             McmSecUserRepository mcmSecUserRepository,
                             @Value("${cactus.jwt.secret}") String jwtSecret) {
        this.authService = authService;
        this.loginLogRepository = loginLogRepository;
        this.secUserRepository = secUserRepository;
        this.passwordPolicyEvaluator = passwordPolicyEvaluator;
        this.revokedTokenRepository = revokedTokenRepository;
        this.userPermCache = userPermCache;
        this.passwordEncoder = passwordEncoder;
        this.mcmSecUserRepository = mcmSecUserRepository;
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

    /**
     * PATCH /api/auth/change-password — 본인 비밀번호 변경.
     *
     * <p>프런트 계약: {@code m-mcm/app/api/auth/password/route.ts} 의 PATCH 가 이 경로로
     * 프록시하고, {@code shared/auth/PasswordChangeModal} 가
     * {@code {email, currentPassword, newPassword, confirmPassword}} 를 보낸다.
     * 화면은 로그인 폼의 "비밀번호 변경" 링크에서 호출하므로 JWT 를 갖고 있지 않다 —
     * 그래서 {@code /api/auth/**} permitAll 에 머물고, 신원 확인은 "기존 비밀번호" 로만 한다.
     *
     * <p>IDOR 방지를 위해 body 의 userId 를 신뢰하지 않는다. 존재하는 계정인지 먼저 대조하고,
     * 실제 변경은 그 계정의 저장된 해시와 {@code currentPassword} 가 일치할 때만 수행한다.
     * 계정 없음/잠김/기존 비밀번호 불일치를 구분하지 않고 같은 401 을 돌려줘야 계정 존재 여부가
     * 새지 않는다.
     *
     * <p>응답 형식 주의 — 실패 사유는 {@link ApiResponse} 의 최상위 {@code message} /
     * {@code errorCode} 에 실린다. BFF route.ts 가 이를 {@code error:{code,message}} 로
     * 변환해 화면에 전달한다.
     */
    @PatchMapping("/change-password")
    public ResponseEntity<?> changePassword(@RequestBody Map<String, Object> request, HttpServletRequest httpRequest) {
        String userId = asString(request.get("email"));
        String currentPassword = asString(request.get("currentPassword"));
        String newPassword = asString(request.get("newPassword"));
        String confirmPassword = asString(request.get("confirmPassword"));

        if (userId == null || userId.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "아이디를 입력해주세요.");
        }
        if (currentPassword == null || currentPassword.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "기존 비밀번호를 입력해주세요.");
        }
        if (newPassword == null || newPassword.isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "새 비밀번호를 입력해주세요.");
        }
        if (confirmPassword != null && !confirmPassword.equals(newPassword)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "새 비밀번호가 일치하지 않습니다.");
        }
        if (currentPassword.equals(newPassword)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "새 비밀번호는 기존 비밀번호와 달라야 합니다.");
        }

        SecUser user = secUserRepository.findById(userId).orElse(null);
        // 잠금/비활성은 잠금 해제 전용 경로에서 안내한다. 여기서 ACCOUNT_LOCKED 를 던지면
        // 계정 존재 여부와 잠금 여부가 갈라져 열거에 쓰인다.
        boolean accountUsable = user != null
                && !"Y".equals(user.getLockYn())
                && passwordEncoder.matches(currentPassword, user.getUserPass());
        if (!accountUsable) {
            if (user != null) recordLoginEvent(userId, "LOGIN_FAIL", httpRequest);
            throw new BusinessException(ErrorCode.AUTH_FAILED, "기존 비밀번호가 올바르지 않습니다.");
        }

        // 갭 #9 — 정책 검증(최소 길이 · 영문/숫자). PasswordPolicyEvaluator 는 mcm-core
        // BusinessException 을 던지는데 전역 핸들러는 cactus 쪽만 잡으므로(그러면 500 으로 새고
        // 사유가 S999 로 뭉개진다) 메시지를 물려받아 cactus 예외로 다시 던진다.
        try {
            passwordPolicyEvaluator.validate(newPassword, userId);
        } catch (com.dongkuk.dmes.mcm.common.exception.BusinessException ex) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, ex.getMessage());
        }

        // McmSecUserRepository 는 JpaRepository#save 가 미구현 stub 이라 네이티브 UPDATE 로 쓴다.
        // 반영 0 이면 PWD 행이 없던 계정이므로 INSERT 로 이어 붙인다.
        String hashed = passwordEncoder.encode(newPassword);
        if (mcmSecUserRepository.updatePassword(userId, hashed) == 0) {
            mcmSecUserRepository.insertPassword(userId, hashed);
        }

        try { userPermCache.invalidate(userId); } catch (Exception ignore) {}

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("userId", userId);
        out.put("changed", true);
        return ResponseEntity.ok(ApiResponse.ok(out));
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

    /**
     * 요청 파라미터를 문자열로 정규화. 숫자·boolean 이 섞여 온 채로 비교하지 않도록 한 곳에서 처리한다.
     */
    private static String asString(Object value) {
        if (value == null) return null;
        String s = String.valueOf(value);
        return s.isEmpty() ? null : s;
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
