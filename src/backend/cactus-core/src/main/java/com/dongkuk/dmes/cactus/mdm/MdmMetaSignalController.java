package com.dongkuk.dmes.cactus.mdm;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.util.ClassUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

/**
 * {@code POST /internal/mdm/metaSignal} — MDM 이 변경 기록({@code TB_MDM_META_REV})을 커밋한 뒤 보내는 "지금 확인" 신호(mdm ADR-0007 D2 개정,
 * 2026-10-12). 받으면 {@link MdmRevisionPoller#requestPoll()} 로 확인을 예약하고 바로 202 를 돌려준다 — 이 요청 스레드에서 확인하지 않는다.
 *
 * <p>본문은 쓰지 않는다(MDM 이 {@code latestSeq} 를 참고로 실어도 무시한다). 확인은 늘 {@code changes(since)} 로 받으므로 신호를 잃거나 위조돼도
 * 확인이 늦어지거나 한 번 더 돌 뿐이다.
 *
 * <p>보안: 예약 작업 실행 접수({@code /internal/job/run}, mcm-core {@code JobRunController})와 같은 방식이다. {@code /api/} 로 시작하지 않아 포털
 * BFF 의 전달 경로로는 닿지 않는다. 요청은 cactus 보안 체인의 {@code X-Client-Key}(ClientKeyFilter)를 통과해야 하고, ClientKeyFilter 가
 * {@code X-Authenticated-User}·{@code X-Authenticated-Role} 헤더로 세운 주체가 {@code system:mdm} + {@code ROLE_SYSTEM} 이어야 한다(아니면 403).
 * Spring Security 가 없는 앱이면 늘 403 이다(닫힌 쪽). mcm 의 EndpointPermissionFilter 는 이 경로에서 권한 키를 뽑지 못해 통과시킨다
 * ({@code /api/} 아님·OASIS 형태 아님·직접 실행 경로 아님).
 *
 * <p>{@link MdmMetaController} 처럼 스테레오타입 없이 클래스 수준 {@code @RequestMapping} + {@code @ResponseBody} 로 두고 {@link MdmAutoConfiguration}
 * 이 {@code @Bean} 으로 만든다.
 */
@ResponseBody
@RequestMapping("/internal/mdm")
public class MdmMetaSignalController {

    private static final Logger log = LoggerFactory.getLogger(MdmMetaSignalController.class);
    private static final boolean SECURITY_PRESENT = ClassUtils.isPresent(
            "org.springframework.security.core.context.SecurityContextHolder", MdmMetaSignalController.class.getClassLoader());
    static final String MDM_PRINCIPAL = "system:mdm";
    static final String SYSTEM_AUTHORITY = "ROLE_SYSTEM";

    private final MdmRevisionPoller poller;

    public MdmMetaSignalController(MdmRevisionPoller poller) {
        this.poller = poller;
    }

    @PostMapping("/metaSignal")
    public ResponseEntity<Map<String, Object>> signal(@RequestBody(required = false) Map<String, Object> ignored) {
        if (!SECURITY_PRESENT || !MdmSystemCaller.isMdm()) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("code", "MDM_SIGNAL_FORBIDDEN");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
        }
        boolean accepted = poller.requestPoll();
        log.debug("[mdm] 변경 신호 받음 — 확인 {}", accepted ? "예약" : "건너뜀(폴러 멈춤)");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("accepted", accepted);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(body);
    }

    /** Spring Security 클래스를 쓰는 판정 — {@link #SECURITY_PRESENT} 가 참일 때만 부른다. */
    private static final class MdmSystemCaller {

        static boolean isMdm() {
            Authentication a = SecurityContextHolder.getContext().getAuthentication();
            return a != null && a.isAuthenticated() && MDM_PRINCIPAL.equals(a.getName()) && a.getAuthorities() != null
                    && a.getAuthorities().stream().anyMatch(g -> SYSTEM_AUTHORITY.equals(g.getAuthority()));
        }
    }
}
