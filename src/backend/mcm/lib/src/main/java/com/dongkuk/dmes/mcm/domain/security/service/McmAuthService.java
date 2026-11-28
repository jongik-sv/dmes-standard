package com.dongkuk.dmes.mcm.domain.security.service;

import com.dongkuk.dmes.cactus.autoconfigure.CactusProperties;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.security.auth.AuthService;
import com.dongkuk.dmes.cactus.security.auth.LoginRequest;
import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.cactus.security.auth.SecUserRepository;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import com.dongkuk.dmes.cactus.security.jwt.JwtTokenProvider;
import com.dongkuk.dmes.cactus.security.jwt.TokenPair;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.security.account.AccountState;
import com.dongkuk.dmes.mcm.security.account.McmAccount;
import com.dongkuk.dmes.mcm.security.password.PasswordPolicyEvaluator;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * mcm용 AuthService — JWT 의 {@code ROLE_{roleId}} 클레임 빌드 + 계정 상태·비밀번호 정책.
 *
 * <p>Phase R5 재작성 (2026-06-01) — 사용자 → 역할그룹 → 역할 사슬로 {@code "ROLE_" + roleId} 클레임을 만든다.
 *
 * <p>2026-11-28 — 로그인·토큰 갱신을 이 클래스가 직접 한다(시안 「사용자 비활성화·퇴직 처리」).
 * cactus {@link AuthService#login} 은 비밀번호보다 계정 상태를 먼저 봐서 아무 비밀번호로 상태가 새었고,
 * 잠금을 USE_TP 로 담았으며, 임시 비밀번호·사용 기간을 몰랐다.
 *
 * <p>로그인 순서:
 * <ol>
 *   <li>계정 없음 → {@code AUTH_FAILED}</li>
 *   <li>잠금 중 — SYSADMIN 시간 잠금이 지났으면 저절로 푼다. 아직 잠겨 있으면 실패 횟수를 더 세지 않고,
 *       비밀번호가 맞을 때만 {@code ACCOUNT_LOCKED}(SYSADMIN 은 남은 분) · 틀리면 {@code AUTH_FAILED}</li>
 *   <li>비밀번호 틀림 → 실패 횟수 +1, 최대에 닿으면 잠금(SYSADMIN 은 15·30·60분 시간 잠금 + 다른 SYSADMIN 알림) → {@code AUTH_FAILED}</li>
 *   <li>비밀번호 맞음 → 상태: 퇴직 = {@code AUTH_FAILED}(일반 문구) · 비활성 = {@code ACCOUNT_DISABLED}「사용 중지」 ·
 *       기한 밖 = {@code ACCOUNT_DISABLED}「기간」</li>
 *   <li>임시 비밀번호(마지막 변경일 빈칸) → 토큰 없이 {@code PASSWORD_CHANGE_REQUIRED} · 임시 만료면 {@code TEMP_PASSWORD_EXPIRED}</li>
 *   <li>사용 기간 지남(제외 표시 없는 계정) → 토큰 없이 {@code PASSWORD_EXPIRED}. 7일 안이면 응답에 {@code passwordExpiresInDays}</li>
 *   <li>토큰 발급</li>
 * </ol>
 */
@Service
@Primary
public class McmAuthService extends AuthService {

    private static final Logger log = LoggerFactory.getLogger(McmAuthService.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    /** 「아이디 또는 비밀번호」 — 상태를 드러내지 않는 일반 실패 문구(로그인 화면과 같은 말). */
    static final String GENERIC_FAIL_MSG = "아이디 또는 비밀번호가 올바르지 않습니다";

    private final SecUserMappingRepository secUserMappingRepository;
    private final SecRoleGroupMappingRepository secRoleGroupMappingRepository;
    private final JwtTokenProvider tokenProvider;
    private final PasswordEncoder passwordEncoder;
    private final McmSecUserRepository accounts;
    private final PasswordPolicyEvaluator passwordPolicy;
    private final SysadminLockAlert sysadminLockAlert;
    private final int maxLoginFailures;
    private final List<Long> sysadminLockMinutes;
    private final Clock clock;

    @Autowired
    public McmAuthService(JwtTokenProvider tokenProvider,
                          PasswordEncoder passwordEncoder,
                          SecUserRepository secUserRepository,
                          CactusProperties properties,
                          SecUserMappingRepository secUserMappingRepository,
                          SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                          McmSecUserRepository accounts,
                          PasswordPolicyEvaluator passwordPolicy,
                          SysadminLockAlert sysadminLockAlert,
                          @Value("${mcm.security.sysadmin-lock-minutes:15,30,60}") List<Long> sysadminLockMinutes) {
        this(tokenProvider, passwordEncoder, secUserRepository, properties, secUserMappingRepository,
                secRoleGroupMappingRepository, accounts, passwordPolicy, sysadminLockAlert, sysadminLockMinutes,
                Clock.system(KST));
    }

    McmAuthService(JwtTokenProvider tokenProvider,
                   PasswordEncoder passwordEncoder,
                   SecUserRepository secUserRepository,
                   CactusProperties properties,
                   SecUserMappingRepository secUserMappingRepository,
                   SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                   McmSecUserRepository accounts,
                   PasswordPolicyEvaluator passwordPolicy,
                   SysadminLockAlert sysadminLockAlert,
                   List<Long> sysadminLockMinutes,
                   Clock clock) {
        super(tokenProvider, passwordEncoder, secUserRepository, properties);
        this.secUserMappingRepository = secUserMappingRepository;
        this.secRoleGroupMappingRepository = secRoleGroupMappingRepository;
        this.tokenProvider = tokenProvider;
        this.passwordEncoder = passwordEncoder;
        this.accounts = accounts;
        this.passwordPolicy = passwordPolicy;
        this.sysadminLockAlert = sysadminLockAlert;
        this.maxLoginFailures = properties.getSecurity().getMaxLoginFailures();
        this.sysadminLockMinutes = sysadminLockMinutes == null || sysadminLockMinutes.isEmpty()
                ? List.of(15L, 30L, 60L) : List.copyOf(sysadminLockMinutes);
        this.clock = clock;
    }

    @Override
    protected List<String> loadUserRoles(String userId) {
        List<String> roleGroupIds = secUserMappingRepository.findRoleGroupIdsByUserId(userId);
        if (roleGroupIds == null || roleGroupIds.isEmpty()) return List.of();
        List<String> roleIds = secRoleGroupMappingRepository.findRoleIdsByRoleGroupIdIn(roleGroupIds);
        if (roleIds == null || roleIds.isEmpty()) return List.of();
        return roleIds.stream()
                .distinct()
                .map(roleId -> "ROLE_" + roleId)
                .toList();
    }

    /**
     * 로그인. 실패 기록(횟수·잠금)은 업무 예외 직전에 같은 트랜잭션에서 쓰고 {@code noRollbackFor} 로 커밋한다(부모와 같다).
     */
    @Override
    @Transactional(noRollbackFor = BusinessException.class)
    public Map<String, Object> login(LoginRequest request) {
        String userId = request.userId();
        McmAccount acc = accounts.findAccount(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_FAILED));
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = now.toLocalDate();
        List<String> roles = loadUserRoles(userId);
        boolean sysadmin = isSysadmin(roles);

        // 1. 잠금 — SYSADMIN 시간 잠금이 지났으면 저절로 푼다
        boolean locked = acc.locked();
        if (locked && sysadmin && lockRemaining(acc, now).isZero()) {
            accounts.releaseTimedLock(userId);
            locked = false;
            log.info("[McmAuthService] SYSADMIN 시간 잠금 만료로 해제 — user={}", userId);
        }

        boolean passwordOk = acc.userEncPwd() != null && passwordEncoder.matches(request.password(), acc.userEncPwd());

        // 2. 잠금 중 — 실패 횟수를 더 세지 않는다. 사유는 비밀번호가 맞을 때만 알린다
        if (locked) {
            if (!passwordOk) throw new BusinessException(ErrorCode.AUTH_FAILED);
            throw lockedException(acc, sysadmin, now);
        }

        // 3. 비밀번호 틀림
        if (!passwordOk) {
            accounts.incrementTryCnt(userId);
            if (acc.pwdFailCount() + 1 >= maxLoginFailures) {
                accounts.lockUser(userId);
                if (sysadmin) {
                    alertSysadminLocked(userId, minutesFor(acc.lockCnt() + 1));
                }
            }
            throw new BusinessException(ErrorCode.AUTH_FAILED);
        }

        // 4. 비밀번호 맞음 — 상태
        assertLoginState(acc, today);

        // 5. 성공 — 실패·연속 잠금 횟수 0
        accounts.resetTryCnt(userId);

        // 6. 임시 비밀번호
        if (acc.tempPassword()) {
            if (acc.tempPwdExpirationDate() != null && now.isAfter(acc.tempPwdExpirationDate())) {
                throw new BusinessException(ErrorCode.TEMP_PASSWORD_EXPIRED);
            }
            throw new BusinessException(ErrorCode.PASSWORD_CHANGE_REQUIRED);
        }

        // 7. 사용 기간
        Long daysLeft = acc.pwdExpiryExempt() ? null : passwordPolicy.daysLeft(acc.lastPwdChngDate(), today);
        if (daysLeft != null && daysLeft < 0) {
            throw new BusinessException(ErrorCode.PASSWORD_EXPIRED,
                    "비밀번호 사용 기간(" + passwordPolicy.properties().getExpiryDays() + "일)이 지났습니다. 비밀번호를 바꾸세요");
        }

        // 8. 토큰
        UserInfo userInfo = new UserInfo(acc.userId(), acc.userNm(), acc.userEmpNo(), roles);
        TokenPair tokenPair = tokenProvider.generateTokenPair(userInfo);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("accessToken", tokenPair.accessToken());
        result.put("refreshToken", tokenPair.refreshToken());
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("userId", acc.userId());
        info.put("userNm", acc.userNm());
        info.put("userNo", acc.userEmpNo());
        result.put("userInfo", info);
        if (passwordPolicy.warn(daysLeft)) {
            result.put("passwordExpiresInDays", daysLeft);
        }
        return result;
    }

    /**
     * 토큰 갱신. 비활성·퇴직·기한 밖이면 막는다. 잠금은 막지 않는다 — 들어와 있던 세션은 그대로 둔다(시안 상태별 처리표).
     * 관리자가 비밀번호를 초기화한 계정(임시 상태)은 다시 로그인하게 한다.
     */
    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> refresh(String refreshToken) {
        String userId;
        try {
            userId = tokenProvider.validateRefreshToken(refreshToken);
        } catch (ExpiredJwtException e) {
            throw new BusinessException(ErrorCode.TOKEN_EXPIRED, "Refresh 토큰이 만료되었습니다. 다시 로그인하세요");
        } catch (JwtException e) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN, "유효하지 않은 Refresh 토큰입니다");
        }
        McmAccount acc = accounts.findAccount(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACCOUNT_DISABLED,
                        "사용자 정보를 찾을 수 없습니다. 다시 로그인하세요"));
        AccountState st = acc.state(LocalDate.now(clock));
        if (st.cutsSession()) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED, "계정 상태가 바뀌었습니다. 다시 로그인하세요");
        }
        if (acc.tempPassword()) {
            throw new BusinessException(ErrorCode.PASSWORD_CHANGE_REQUIRED);
        }
        List<String> roles = loadUserRoles(userId);
        UserInfo userInfo = new UserInfo(acc.userId(), acc.userNm(), acc.userEmpNo(), roles);
        TokenPair pair = tokenProvider.generateTokenPair(userInfo);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("accessToken", pair.accessToken());
        result.put("refreshToken", pair.refreshToken());
        return result;
    }

    /** 비밀번호가 맞은 뒤의 상태 판정. 퇴직은 일반 실패 문구(퇴직 여부를 드러내지 않는다). */
    static void assertLoginState(McmAccount acc, LocalDate today) {
        switch (acc.state(today)) {
            case RETIRED -> throw new BusinessException(ErrorCode.AUTH_FAILED);
            case SUSPENDED -> throw new BusinessException(ErrorCode.ACCOUNT_DISABLED,
                    "사용 중지된 계정입니다. 관리자에게 문의하세요");
            case EXPIRED -> throw new BusinessException(ErrorCode.ACCOUNT_DISABLED,
                    acc.startActiveDate() != null && acc.startActiveDate().toLocalDate().isAfter(today)
                            ? "계정 사용 시작일 전입니다"
                            : "계정 사용 기간이 끝났습니다. 관리자에게 문의하세요");
            default -> { /* ACTIVE · LOCKED(잠금은 앞에서 처리) */ }
        }
    }

    private BusinessException lockedException(McmAccount acc, boolean sysadmin, LocalDateTime now) {
        if (sysadmin) {
            long left = Math.max(1, (lockRemaining(acc, now).toSeconds() + 59) / 60);
            return new BusinessException(ErrorCode.ACCOUNT_LOCKED,
                    "비밀번호를 " + maxLoginFailures + "번 틀려 계정이 잠겼습니다. " + left + "분 뒤 다시 시도하세요");
        }
        return new BusinessException(ErrorCode.ACCOUNT_LOCKED,
                "비밀번호를 " + maxLoginFailures + "번 틀려 계정이 잠겼습니다. 관리자에게 잠금 해제를 요청하세요");
    }

    /** SYSADMIN 시간 잠금의 남은 시간. 잠근 시각을 모르면 0(바로 푼다). */
    Duration lockRemaining(McmAccount acc, LocalDateTime now) {
        if (acc.lockAt() == null) return Duration.ZERO;
        LocalDateTime until = acc.lockAt().plusMinutes(minutesFor(Math.max(1, acc.lockCnt())));
        return now.isBefore(until) ? Duration.between(now, until) : Duration.ZERO;
    }

    /** n 번째 연속 잠금의 시간(분) — 15·30·60, 넘으면 마지막 값. */
    long minutesFor(long n) {
        int i = (int) Math.min(Math.max(n, 1), sysadminLockMinutes.size()) - 1;
        return sysadminLockMinutes.get(i);
    }

    private static boolean isSysadmin(List<String> roles) {
        return roles.contains("ROLE_SYSADMIN") || roles.contains("ROLE_ROLE_SYSADMIN");
    }

    private void alertSysadminLocked(String userId, long minutes) {
        try {
            sysadminLockAlert.locked(userId, minutes, clientIp());
        } catch (RuntimeException ex) {
            log.warn("[McmAuthService] SYSADMIN 잠금 알림 실패 — user={} : {}", userId, ex.getMessage());
        }
    }

    private static String clientIp() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            HttpServletRequest req = attrs.getRequest();
            return req.getRemoteAddr();
        }
        return null;
    }

    /** 시험용 — 설정된 SYSADMIN 잠금 시간들. */
    List<Long> sysadminLockMinutes() {
        return new ArrayList<>(sysadminLockMinutes);
    }
}
