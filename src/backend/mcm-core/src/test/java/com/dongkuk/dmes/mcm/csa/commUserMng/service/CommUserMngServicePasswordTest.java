package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngPwdInitRequest;
import com.dongkuk.dmes.mcm.entity.SecUserPwd;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link CommUserMngService#pwdinit} 단건 비밀번호 초기화 분기 특성 테스트 (SSO_RESET_FLAG 가 "Y" 가 아닐 때).
 *
 * <p>저장된 해시는 {@code BCryptPasswordEncoder.matches} 로 확인한다(해시 문자열 자체는 salt 때문에 매번 다르다).
 */
class CommUserMngServicePasswordTest extends CommUserMngJpaTestBase {

    static CommUserMngPwdInitRequest req(String userId, String empNo, String ssoFlag) {
        CommUserMngPwdInitRequest r = new CommUserMngPwdInitRequest();
        r.setUSER_ID(userId);
        r.setUSER_EMP_NO(empNo);
        r.setSSO_RESET_FLAG(ssoFlag);
        return r;
    }

    @Test
    @DisplayName("기존 비밀번호 행 — ENC 는 초기 비밀번호, SSO 는 USER_ID+사번으로 다시 만든다. 응답은 cnt_save·INIT_PWD·INIT_PWD_USER_ID 순")
    void resetsExistingRow() {
        fx.user("p1", null, LocalDateTime.of(2026, 1, 1, 0, 0));
        fx.pwd("p1", "oldEnc", "oldSso");

        Map<String, Object> out = inTx(() -> service.pwdinit(req("p1", "123", null), null));

        assertThat(out.keySet()).containsExactly("cnt_save", "INIT_PWD", "INIT_PWD_USER_ID");
        assertThat(out.values()).containsExactly(1, DEFAULT_PASSWORD, "p1");
        SecUserPwd p = secUserPwdRepository.findById("p1").orElseThrow();
        assertThat(BCRYPT.matches(DEFAULT_PASSWORD, p.getUserEncPwd())).isTrue();
        assertThat(BCRYPT.matches("p1123", p.getUserSsoPwd())).isTrue();
        assertThat(secUserPwdRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("비밀번호 행이 없으면 새로 만든다 — 사용자 존재 여부는 보지 않는다, 사번이 없으면 SSO 는 USER_ID 만")
    void createsRowWithoutUserCheck() {
        // 결함 의심: TB_MCM_SEC_USER 에 없는 USER_ID 도 비밀번호 행을 만들고 성공(cnt 1)으로 답한다.
        Map<String, Object> out = inTx(() -> service.pwdinit(req("nouser", null, "N"), null));

        assertThat(out.values()).containsExactly(1, DEFAULT_PASSWORD, "nouser");
        SecUserPwd p = secUserPwdRepository.findById("nouser").orElseThrow();
        assertThat(BCRYPT.matches(DEFAULT_PASSWORD, p.getUserEncPwd())).isTrue();
        assertThat(BCRYPT.matches("nouser", p.getUserSsoPwd())).isTrue();
        assertThat(secUserRepository.findById("nouser")).isEmpty();
    }

    @Test
    @DisplayName("SSO_RESET_FLAG 가 대문자 Y 가 아니면(소문자 y·N·null) 단건 분기 — master 는 무시한다")
    void nonYFlagGoesSingleBranch() {
        fx.pwd("other", "keepEnc", "keepSso");

        Map<String, Object> out = inTx(() -> service.pwdinit(req("p2", "9", "y"),
                List.of(row("USER_ID", "other", "USER_EMP_NO", "1"))));

        assertThat(out.values()).containsExactly(1, DEFAULT_PASSWORD, "p2");
        assertThat(BCRYPT.matches("p29", secUserPwdRepository.findById("p2").orElseThrow().getUserSsoPwd())).isTrue();
        SecUserPwd other = secUserPwdRepository.findById("other").orElseThrow();
        assertThat(other.getUserEncPwd()).isEqualTo("keepEnc");
        assertThat(other.getUserSsoPwd()).isEqualTo("keepSso");
    }

    @Test
    @DisplayName("USER_ID 가 비거나 요청이 null 이면 cnt 0 만 — INIT_PWD 키 없음, 저장 없음")
    void blankUserId() {
        Map<String, Object> blank = inTx(() -> service.pwdinit(req(" ", "1", null), null));
        assertThat(blank).containsExactly(Map.entry("cnt_save", 0));

        Map<String, Object> nullReq = inTx(() -> service.pwdinit(null, List.of(row("USER_ID", "x"))));
        assertThat(nullReq).containsExactly(Map.entry("cnt_save", 0));

        assertThat(secUserPwdRepository.count()).isZero();
    }
}
