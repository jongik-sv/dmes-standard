package com.dongkuk.dmes.mcm.security.endpoint;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Set;

/**
 * 사용자가 요청 URL 에 대한 PERM 을 가지는지 검증한다.
 *
 * <p>매칭 정책 (Phase R2 — legacy resolver 폐기 후):
 * <ul>
 *   <li>URL 이 {@link PermKey#parseUrl(String)} 으로 파싱 가능 ({@code /api/{module}/{objId}/{action}}
 *       3-segment 또는 {@code /api/{module}/{serviceId}/{objId}/{action}} 4-segment) 이면
 *       {@link UserPermCache} 에서 O(1) lookup. 매칭 시 통과, 아니면 403.</li>
 *   <li>그 외 URL (예: actuator, login, 4 segment 미달 URL) 은 통과 — RBAC 매칭 대상 ✗
 *       (transition 기간 동안 mpn/mpp/mqc legacy URL 도 UNMATCHED 통과).</li>
 * </ul>
 *
 * <p>servlet context 자동 등록을 막기 위해 사이트는
 * {@code FilterRegistrationBean<EndpointPermissionFilter>} 를 등록하고
 * {@code setEnabled(false)} 로 막은 뒤, SecurityFilterChain 에 직접 추가한다.
 *
 * <p>정책:
 * <ul>
 *   <li>미인증 요청은 통과 (앞단 인증 필터가 처리).</li>
 *   <li>SYSADMIN 도 PermKey 멤버십으로 판정 (2026-07-30 순수 RBAC 전환). 브레이크글라스
 *       {@code mcm.security.sysadmin-freepass=true} 시에만 舊 전면 통과.</li>
 *   <li>PermKey 추출 가능 URL — cache 에 있으면 통과, 없으면 403.</li>
 *   <li>PermKey 추출 불가 URL — 통과 (RBAC 대상 ✗).</li>
 * </ul>
 */
@Component
public class EndpointPermissionFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(EndpointPermissionFilter.class);

    private final UserPermCache userPermCache;
    private final SecurityIdentity securityIdentity;
    /** 자기 시스템 모듈 코드 — BFF→BE `/oasis/...`(module 세그먼트 없음) 파싱 시 module 기본값. */
    private final String oasisServiceGroup;
    /** SYSADMIN 브레이크글라스 — true 시 舊 전면통과 복원 (기본 false = 순수 RBAC, 2026-07-30). */
    private final boolean sysadminFreepass;

    public EndpointPermissionFilter(UserPermCache userPermCache,
                                    SecurityIdentity securityIdentity,
                                    @Value("${cactus.oasis.service-group:mcm}") String oasisServiceGroup,
                                    @Value("${mcm.security.sysadmin-freepass:false}") boolean sysadminFreepass) {
        this.userPermCache = userPermCache;
        this.securityIdentity = securityIdentity;
        this.oasisServiceGroup = oasisServiceGroup;
        this.sysadminFreepass = sysadminFreepass;
        if (sysadminFreepass) {
            log.warn("[EndpointPermissionFilter] SYSADMIN freepass 활성(브레이크글라스) — 순수 RBAC 미적용 상태");
        }
    }

    /**
     * AUTH_ONLY OASIS 서비스 — 본인 데이터(메뉴/권한/즐겨찾기/기본 화면)라 RBAC 면제(인증만).
     * BFF {@code proxy.ts} 의 AUTH_ONLY_API_PREFIXES 와 동기화 (objId/action 소문자 prefix).
     * 미면제 시 비-SYSADMIN 의 메뉴/버튼 로딩이 403 으로 깨진다(secUser/secFavorite 는 grant 대상 아님).
     */
    private static final List<String> AUTH_ONLY_OBJ_ACTION_PREFIXES = List.of(
            "secuser/mymenus",          // myMenus, myMenusTree
            "secuser/mypermissions",
            "secuser/mybuttonendpoints",
            "secfavorite/search",
            "secfavorite/toggle",
            "secfavorite/addfolder",    // 사이드바 즐겨찾기 그룹 추가
            "secfavorite/deletefolder", // 사이드바 즐겨찾기 그룹 삭제
            "secstartpgm/search",       // 포털 기본 화면 조회
            "secstartpgm/toggle",       // 탭 우클릭 기본 화면 등록/해제
            "secwidget/",               // 포털 홈 위젯 탭·배치(search/saveTab/deleteTab/reorderTabs/resetHome) — 본인 데이터 (2026-10-02)
            "ntfnotification/",         // 포털 알림 (list/unreadCount/markRead/markAllRead) — 본인 데이터
            "noticeboard/search",       // 포털 홈 공지 목록(mls) — 서비스가 현재 사용자 역할로 게시 대상을 거른다 (2026-10-02)
            "screenusage/record",       // 포털 화면 사용 구간 기록 — 로그인 사용자 전원, 사용자·부서는 서버가 인증 정보로 채운다 (2026-10-02)
            // MDM 메타 캐시(2026-10-02, spec 2026-10-02-mdm-meta-cache-design §5.5) — cactus /api/{module}/mdmMeta/*. 3-segment 라 권한 데이터로
            // 맞출 수 없다(serviceId ""). 화면 메타는 로그인 사용자, 관리 action 은 MdmMetaController 가 SYSADMIN 을 다시 본다. BFF proxy.ts 와 동기화.
            "mdmmeta/"
    );

    static boolean isAuthOnly(PermKey k) {
        String oa = k.objId() + "/" + k.action(); // PermKey 필드는 이미 소문자
        for (String prefix : AUTH_ONLY_OBJ_ACTION_PREFIXES) {
            if (oa.startsWith(prefix)) return true;
        }
        return false;
    }

    /**
     * ASYNC dispatch (예: Servlet 3.0+ 비동기 요청, OASIS BPMN executor 의 내부 dispatch) 시에는
     * 본 필터를 다시 실행하지 않는다. 본 필터가 chain 의 후미에 위치 (revokedToken 뒤) 한 상태에서
     * 후속 필터 또는 비즈니스 로직이 ASYNC re-dispatch 를 트리거하면 동일 chain 이 재진입되어
     * {@code EndpointPermissionFilter.doFilterInternal} 의 무한 재귀 → StackOverflowError 가 발생.
     * 인증/권한 검증은 최초 진입 시 1회면 충분하다.
     */
    @Override
    protected boolean shouldNotFilterAsyncDispatch() {
        return true;
    }

    /**
     * ERROR dispatch (예: {@code sendError} 후 컨테이너가 /error 로 재전달) 시에도 본 필터를 건너뛴다.
     * 본 필터 자신이 {@code sendError(SC_FORBIDDEN)} 으로 응답하면 컨테이너가 /error 페이지로
     * 재전달하면서 같은 SecurityFilterChain 을 다시 통과 → 재귀 위험.
     */
    @Override
    protected boolean shouldNotFilterErrorDispatch() {
        return true;
    }

    /** 같은 request 가 어떤 dispatch type 으로든 재진입할 때 본 filter 로직 중복 실행 차단. */
    private static final String ATTR_GUARD = "MCM_ENDPOINT_PERMISSION_FILTER_DONE";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                     HttpServletResponse response,
                                     FilterChain filterChain) throws ServletException, IOException {
        if (Boolean.TRUE.equals(request.getAttribute(ATTR_GUARD))) {
            filterChain.doFilter(request, response);
            return;
        }
        request.setAttribute(ATTR_GUARD, Boolean.TRUE);

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean authenticated = auth != null && auth.isAuthenticated()
                && !"anonymousUser".equals(String.valueOf(auth.getPrincipal()));
        if (!authenticated) {
            filterChain.doFilter(request, response);
            return;
        }

        // 브레이크글라스 시에만 SYSADMIN 전면 통과 — 평시 SYSADMIN 도 아래 PermKey 멤버십 판정(백필 데이터 기반).
        if (sysadminFreepass
                && (securityIdentity.hasAuthority("ROLE_SYSADMIN")
                    || securityIdentity.hasAuthority("SYSADMIN"))) {
            filterChain.doFilter(request, response);
            return;
        }

        String uri = request.getRequestURI();
        String userId = securityIdentity.currentUserId();

        // PermKey 추출 — FE 컨벤션(/api/{module}/{objId}/{action}) 또는
        // BFF→BE OASIS 실제 경로(/oasis/{serviceId}/{action}, /{module}/oasis/{serviceId}/{action}).
        PermKey requested = PermKey.parseUrl(uri);
        if (requested == null) {
            requested = PermKey.parseBackendOasisUrl(uri, oasisServiceGroup);
        }
        if (requested == null) {
            // RBAC 대상 ✗ (PermKey 추출 불가) — 통과
            filterChain.doFilter(request, response);
            return;
        }

        // AUTH_ONLY — 본인 데이터(IDOR 보호) OASIS 서비스는 RBAC 면제(인증만).
        if (isAuthOnly(requested)) {
            filterChain.doFilter(request, response);
            return;
        }

        Set<PermKey> userPerms = userPermCache.getPermissions(userId);
        if (userPerms.contains(requested)) {
            filterChain.doFilter(request, response);
            return;
        }

        log.info("[EndpointPermissionFilter] denied user={} uri={} permKey={}",
                userId, uri, requested);
        response.sendError(HttpServletResponse.SC_FORBIDDEN, "Endpoint permission denied");
    }
}
