package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * {@code POST /internal/job/run} — MCM 이 모듈 앱에 실행을 푸시한다(설계 §4.10). {@code /api/} 로 시작하지 않아 포털 BFF 의 전달 경로로는 닿지 않는다.
 * 요청은 {@code X-Client-Key}(ClientKeyFilter)를 통과해야 하고, ClientKeyFilter 가 {@code X-Authenticated-User}·{@code X-Authenticated-Role} 헤더로 세운
 * 주체가 {@code system:mcm} + {@code ROLE_SYSTEM} 이어야 한다(아니면 403) — cactus-core 보안 설정은 바꾸지 않는다.
 * 스테레오타입 없이 클래스 수준 {@code @RequestMapping} 으로 핸들러가 되고 {@link JobAgentConfig} 가 {@code @Bean} 으로 올린다.
 */
@RequestMapping("/internal/job")
public class JobRunController {

    static final String MCM_PRINCIPAL = "system:mcm";
    static final String SYSTEM_AUTHORITY = "ROLE_SYSTEM";

    private final JobRunAcceptor acceptor;

    public JobRunController(JobRunAcceptor acceptor) {
        this.acceptor = acceptor;
    }

    @PostMapping("/run")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> run(@RequestBody JobRunRequest body, Authentication auth) {
        if (!isMcmSystem(auth)) return ResponseEntity.status(403).body(Map.of("code", "JOB_FORBIDDEN"));
        AcceptResult r = acceptor.accept(body);
        return ResponseEntity.status(r.status()).body(r.body());
    }

    static boolean isMcmSystem(Authentication auth) {
        return auth != null && auth.isAuthenticated() && MCM_PRINCIPAL.equals(auth.getName())
                && auth.getAuthorities().stream().anyMatch(a -> SYSTEM_AUTHORITY.equals(a.getAuthority()));
    }
}
