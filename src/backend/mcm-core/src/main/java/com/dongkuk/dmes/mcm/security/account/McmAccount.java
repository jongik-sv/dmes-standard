/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 로그인·세션 판정에 쓰는 계정 한 줄 — TB_MCM_SEC_USER + TB_MCM_SEC_USER_PWD
 */
package com.dongkuk.dmes.mcm.security.account;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 로그인·토큰 갱신·세션 판정이 읽는 계정 값.
 *
 * @param lastPwdChngDate 비어 있으면 임시 비밀번호 상태(D9 — 값 비교가 아니라 이 빈칸으로 판정)
 * @param tempPwdExpirationDate 임시 비밀번호 만료 시각(D10)
 */
public record McmAccount(
        String userId,
        String userNm,
        String userEmpNo,
        String useTp,
        LocalDateTime startActiveDate,
        LocalDateTime endActiveDate,
        String hrSt,
        String inOutEmpTp,
        String lockYn,
        LocalDateTime lockAt,
        long lockCnt,
        long pwdFailCount,
        boolean pwdExpiryExempt,
        String userEncPwd,
        LocalDateTime lastPwdChngDate,
        LocalDateTime tempPwdExpirationDate) {

    /** 상태 — {@link AccountState#of}. */
    public AccountState state(LocalDate today) {
        return AccountState.of(useTp, startActiveDate, endActiveDate, hrSt, lockYn, today);
    }

    /** 잠금 칸이 서 있나(시간 잠금 만료 여부와 상관없이). */
    public boolean locked() {
        return "Y".equals(lockYn);
    }

    /** 임시 비밀번호 상태. */
    public boolean tempPassword() {
        return lastPwdChngDate == null;
    }

    /** 협력업체 등 인사에 없는 계정(내부 외부 구분 'O') — 관리자가 직접 관리한다(D13). */
    public boolean manual() {
        return "O".equals(inOutEmpTp);
    }
}
