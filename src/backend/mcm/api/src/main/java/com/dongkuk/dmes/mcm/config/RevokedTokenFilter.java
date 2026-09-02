package com.dongkuk.dmes.mcm.config;

import com.dongkuk.dmes.mcm.audit.repository.RevokedTokenRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;

/**
 * JWT 회수 토큰 필터 (갭 #12). cactus {@code JwtAuthenticationFilter} 가 통과시킨 토큰의 jti 가
 * {@code TB_SEC_REVOKED_TOKEN} 에 있으면 SecurityContext 를 비우고 401 처리.
 *
 * <p>cactus-core 수정 없이 사이트 슬라이스에 추가. SecurityFilterChain 에서
 * {@code addFilterAfter(revokedTokenFilter, JwtAuthenticationFilter.class)} 로 등록.
 *
 * <p>본 필터는 yml 의 cactus secret 키를 그대로 재사용하여 jti 추출. 실제 인증·만료 검증은
 * cactus 가 이미 했으므로 본 필터는 jti 블랙리스트 체크만.
 */
@Component
public class RevokedTokenFilter extends OncePerRequestFilter {

    private final RevokedTokenRepository revokedTokenRepository;
    private final SecretKey signingKey;

    /**
     * 프로퍼티 키는 {@code cactus.jwt.secret} 이 정본이다 (JwtTokenProvider/CactusProperties 와 동일).
     * 키 파생도 provider 와 동일하게 <b>Base64 디코딩</b> 후 HMAC 키로 만든다 —
     * 2026-08-12 수정 전에는 ① 잘못된 키({@code cactus.security.jwt.secret}) 참조로 signingKey=null,
     * ② raw bytes 사용으로 서명 불일치가 겹쳐 본 필터가 무력화(no-op)돼 있었다.
     */
    public RevokedTokenFilter(RevokedTokenRepository revokedTokenRepository,
                              @Value("${cactus.jwt.secret:}") String secret) {
        this.revokedTokenRepository = revokedTokenRepository;
        this.signingKey = (secret == null || secret.isBlank())
                ? null
                : new SecretKeySpec(io.jsonwebtoken.io.Decoders.BASE64.decode(secret), "HmacSHA256");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        if (signingKey != null) {
            String authHeader = request.getHeader("Authorization");
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                String token = authHeader.substring(7);
                String jti = extractJti(token);
                if (jti != null && revokedTokenRepository.findById(jti).isPresent()) {
                    SecurityContextHolder.clearContext();
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.getWriter().write("{\"meta\":{\"success\":false,\"code\":\"A009\",\"message\":\"회수된 토큰입니다\"}}");
                    return;
                }
            }
        }
        chain.doFilter(request, response);
    }

    private String extractJti(String token) {
        try {
            Jws<Claims> claims = Jwts.parser().verifyWith(signingKey).build().parseSignedClaims(token);
            return claims.getPayload().getId();
        } catch (Exception e) {
            return null;
        }
    }
}
