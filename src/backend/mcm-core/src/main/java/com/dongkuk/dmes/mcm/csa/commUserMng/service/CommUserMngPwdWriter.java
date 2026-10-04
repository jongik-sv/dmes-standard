/*
 * 내용: commUserMng 저장·비밀번호·SSO 가 함께 쓰는 TB_MCM_SEC_USER_PWD 쓰기 지원 (패키지 private).
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.entity.SecUserPwd;
import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * commUserMng 비밀번호 행 쓰기 지원 — 초기 비밀번호 상수, bcrypt 인코더, mergeCommonPwdInit 등가 upsert.
 *
 * <p>계정 생성·재생성({@link CommUserMngSaveService}), 단건 초기화({@link CommUserMngPasswordService}),
 * SSO 일괄 초기화({@link CommUserMngSsoService}) 가 같이 쓴다. 분할 전 {@code CommUserMngService} 의
 * {@code bcrypt} 필드·{@code DEFAULT_PASSWORD}·{@code upsertUserPwd} 를 그대로 옮긴 것이다.
 * 인코더는 이 빈 하나에 {@code new BCryptPasswordEncoder()}(기본 strength 10) 로 하나만 둔다 — 비용 불변.
 */
@Component("commUserMngPwdWriter")
class CommUserMngPwdWriter {

    /**
     * 신규 계정 생성·비밀번호 초기화 시 부여하는 초기 비밀번호.
     *
     * <p><b>실 프로젝트 착수 시 반드시 바꾼다.</b> 지금은 소스 상수라 값이 저장소에 노출되므로,
     * 운영 적용 전에 설정({@code mcm.password.initial}) 또는 시크릿 저장소로 외부화하고
     * 최초 로그인 시 변경 강제(비밀번호 만료 정책)와 함께 쓴다.
     *
     * <p>2026-09-28 — {@code pwdinit} 가 이 값을 {@code INIT_PWD} 응답으로 되돌려 관리자 화면의
     * "초기 비밀번호" 팝업에 표시한다(사용자 요청 / 기능설계서 M-032 — As-Is {@code pwdtmp} 콜백 대체).
     * 값이 화면에 노출되는 경로가 생겼으므로 외부화 과제의 우선순위는 오히려 올라간다.
     */
    static final String DEFAULT_PASSWORD = "dmesInit!1";

    private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();

    private final SecUserPwdRepository secUserPwdRepository;

    CommUserMngPwdWriter(SecUserPwdRepository secUserPwdRepository) {
        this.secUserPwdRepository = secUserPwdRepository;
    }

    /** bcrypt 해시 — 호출마다 salt 가 새로 붙는다. */
    String encode(String raw) {
        return bcrypt.encode(raw);
    }

    /**
     * 초기 비밀번호와 SSO 비밀번호를 함께 다시 쓴다 — mergeCommonPwdInit 등가.
     * USER_ENC_PWD = bcrypt(DEFAULT_PASSWORD), USER_SSO_PWD = bcrypt(USER_ID + USER_EMP_NO(null 이면 "")).
     */
    void resetToInitial(String userId, String userEmpNo) {
        upsertUserPwd(userId,
                bcrypt.encode(DEFAULT_PASSWORD),
                bcrypt.encode(userId + (userEmpNo == null ? "" : userEmpNo)));
    }

    /**
     * TB_MCM_SEC_USER_PWD upsert — mergeCommonPwdInit 등가.
     * encPwd 가 null 이면 SSO 만 갱신 / encPwd 있으면 둘 다 갱신.
     */
    void upsertUserPwd(String userId, String encPwd, String ssoPwd) {
        SecUserPwd p = secUserPwdRepository.findById(userId).orElse(null);
        if (p == null) {
            p = new SecUserPwd();
            p.setUserId(userId);
        }
        if (encPwd != null) {
            p.setUserEncPwd(encPwd);
        }
        if (ssoPwd != null) {
            p.setUserSsoPwd(ssoPwd);
        }
        secUserPwdRepository.save(p);
    }
}
