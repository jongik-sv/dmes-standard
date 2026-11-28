/*
 * 내용: commUserMng 저장·비밀번호·SSO 가 함께 쓰는 TB_MCM_SEC_USER_PWD 쓰기 지원 (패키지 private).
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.entity.SecUserPwd;
import com.dongkuk.dmes.mcm.entity.SecUserPwdHis;
import com.dongkuk.dmes.mcm.repository.SecUserPwdHisRepository;
import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import com.dongkuk.dmes.mcm.security.password.PasswordPolicyEvaluator;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * commUserMng 비밀번호 행 쓰기 지원 — 임시 비밀번호, bcrypt 인코더, mergeCommonPwdInit 등가 upsert.
 *
 * <p>계정 생성·재생성({@link CommUserMngSaveService}), 단건 초기화({@link CommUserMngPasswordService}),
 * SSO 일괄 초기화({@link CommUserMngSsoService}), 인사 입사 계정 생성({@link CommUserMngHrService}) 이 같이 쓴다.
 * 인코더는 이 빈 하나에 {@code new BCryptPasswordEncoder()}(기본 strength 10) 로 하나만 둔다 — 비용 불변.
 *
 * <p>2026-11-28 (시안 D9·D10) — 소스 상수 {@code dmesInit!1} 을 지웠다. 임시 비밀번호는 설정
 * {@code mcm.password.initial}(기본 {@code dmes0000}) 하나를 모두 쓴다(전화로 불러 주기 쉽게). 임시 상태 판정은 값이 아니라
 * {@code LAST_PWD_CHNG_DATE} 빈칸이다. 그래서 초기화는 그 칸을 비우고 임시 만료일을 쓴다 — 초기화는 그날 23:59:59,
 * 신규·재생성 계정은 7일 뒤 23:59:59.
 */
@Component("commUserMngPwdWriter")
class CommUserMngPwdWriter {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();

    private final SecUserPwdRepository secUserPwdRepository;
    private final PasswordPolicyEvaluator passwordPolicy;
    private final ObjectProvider<SecUserPwdHisRepository> pwdHisRepository;

    CommUserMngPwdWriter(SecUserPwdRepository secUserPwdRepository,
                         PasswordPolicyEvaluator passwordPolicy,
                         ObjectProvider<SecUserPwdHisRepository> pwdHisRepository) {
        this.secUserPwdRepository = secUserPwdRepository;
        this.passwordPolicy = passwordPolicy;
        this.pwdHisRepository = pwdHisRepository;
    }

    /** bcrypt 해시 — 호출마다 salt 가 새로 붙는다. */
    String encode(String raw) {
        return bcrypt.encode(raw);
    }

    /** 임시 비밀번호 평문 — 관리자 팝업 안내용(값은 설정에 있다). */
    String initialPassword() {
        return passwordPolicy.initialPassword();
    }

    /** 관리자 초기화 — 임시 만료 = 그날 23:59:59. */
    void resetToInitial(String userId, String userEmpNo) {
        resetToInitial(userId, userEmpNo, false);
    }

    /**
     * 임시 비밀번호로 다시 쓴다 — mergeCommonPwdInit 등가 + 임시 상태.
     * USER_ENC_PWD = bcrypt(임시), USER_SSO_PWD = bcrypt(USER_ID + USER_EMP_NO(null 이면 "")),
     * LAST_PWD_CHNG_DATE = 빈칸, TEMP_PWD_EXPIRATION_DATE = 초기화 그날 / 신규 7일 뒤 23:59:59. 이력에 INIT 한 줄.
     *
     * @param newUser 신규·재생성·인사 입사 계정이면 true
     */
    void resetToInitial(String userId, String userEmpNo, boolean newUser) {
        String hash = bcrypt.encode(passwordPolicy.initialPassword());
        LocalDate today = LocalDate.now(KST);
        SecUserPwd p = secUserPwdRepository.findById(userId).orElse(null);
        if (p == null) {
            p = new SecUserPwd();
            p.setUserId(userId);
        }
        p.setUserEncPwd(hash);
        p.setUserSsoPwd(bcrypt.encode(userId + (userEmpNo == null ? "" : userEmpNo)));
        p.setLastPwdChngDate(null);
        p.setTempPwdExpirationDate(newUser
                ? passwordPolicy.tempExpiryForNewUser(today)
                : passwordPolicy.tempExpiryForReset(today));
        secUserPwdRepository.save(p);
        SecUserPwdHisRepository his = pwdHisRepository.getIfAvailable();
        if (his != null) {
            his.save(new SecUserPwdHis(userId, LocalDateTime.now(KST), hash, SecUserPwdHis.TP_INIT, null));
        }
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
