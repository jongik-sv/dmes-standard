package com.dongkuk.dmes.mdm.internal.userOwnership;

import com.dongkuk.dmes.mdm.internal.userOwnership.dto.OwnershipHandoverRequest;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.OwnershipSummaryRequest;
import com.dongkuk.dmes.mdm.internal.userOwnership.dto.ReleaseClaimsRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 퇴직 처리 서버 API — MCM 이 사용자를 퇴직 처리할 때 부른다({@link UserOwnershipService}).
 *
 * <ul>
 *   <li>{@code POST /internal/mdm/userOwnership/summary} — 사용자별·종류별 건수</li>
 *   <li>{@code POST /internal/mdm/userOwnership/handover} — 넘기기(트랜잭션 하나)</li>
 *   <li>{@code POST /internal/mdm/userOwnership/releaseClaims} — ERD 작업 중 표시만 지우기</li>
 * </ul>
 *
 * <p>보안: 예약 작업 접수({@code /internal/job/run}, mcm-core {@code JobRunController})와 같은 방식이다. {@code /api/} 로 시작하지 않아 포털 BFF 의
 * 전달 경로로는 닿지 않는다. 요청은 cactus 보안 체인의 {@code X-Client-Key}(ClientKeyFilter, 키 {@code cactus.security.client-key} — 환경 변수
 * {@code BACKEND_CLIENT_KEY} 가 먼저)를 통과해야 하고, ClientKeyFilter 가 {@code X-Authenticated-User}·{@code X-Authenticated-Role} 헤더로 세운
 * 주체가 {@code system:mcm} + {@code ROLE_SYSTEM} 이어야 한다(아니면 403). 보안 설정은 바꾸지 않는다.
 *
 * <p>응답은 봉투 없는 JSON 이다(다른 {@code /internal/**} 와 같다). 오류는 {@code {"code":..., "message":...}} — 403 {@code USER_OWNERSHIP_FORBIDDEN},
 * 400 {@code USER_OWNERSHIP_INVALID}.
 */
@RestController
@RequestMapping("/internal/mdm/userOwnership")
public class UserOwnershipController {

    static final String MCM_PRINCIPAL = "system:mcm";
    static final String SYSTEM_AUTHORITY = "ROLE_SYSTEM";
    static final String FORBIDDEN = "USER_OWNERSHIP_FORBIDDEN";
    static final String INVALID = "USER_OWNERSHIP_INVALID";

    private final UserOwnershipService service;

    public UserOwnershipController(UserOwnershipService service) {
        this.service = service;
    }

    @PostMapping("/summary")
    public ResponseEntity<Map<String, Object>> summary(@RequestBody(required = false) OwnershipSummaryRequest body) {
        return guarded(() -> Map.of("items", service.summary(body == null ? null : body.users())));
    }

    @PostMapping("/handover")
    public ResponseEntity<Map<String, Object>> handover(@RequestBody(required = false) OwnershipHandoverRequest body) {
        return guarded(() -> Map.of("items", service.handover(body)));
    }

    @PostMapping("/releaseClaims")
    public ResponseEntity<Map<String, Object>> releaseClaims(@RequestBody(required = false) ReleaseClaimsRequest body) {
        return guarded(() -> Map.of("cnt", service.releaseClaims(body == null ? null : body.userId())));
    }

    private static ResponseEntity<Map<String, Object>> guarded(Supplier<Map<String, Object>> work) {
        if (!isMcmSystem(SecurityContextHolder.getContext().getAuthentication())) {
            return error(HttpStatus.FORBIDDEN, FORBIDDEN, "MCM 서버 호출만 받습니다");
        }
        try {
            return ResponseEntity.ok(work.get());
        } catch (UserOwnershipService.InvalidRequest e) {
            return error(HttpStatus.BAD_REQUEST, INVALID, e.getMessage());
        }
    }

    static boolean isMcmSystem(Authentication auth) {
        return auth != null && auth.isAuthenticated() && MCM_PRINCIPAL.equals(auth.getName()) && auth.getAuthorities() != null
                && auth.getAuthorities().stream().anyMatch(a -> SYSTEM_AUTHORITY.equals(a.getAuthority()));
    }

    private static ResponseEntity<Map<String, Object>> error(HttpStatus status, String code, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", code);
        body.put("message", message);
        return ResponseEntity.status(status).body(body);
    }
}
