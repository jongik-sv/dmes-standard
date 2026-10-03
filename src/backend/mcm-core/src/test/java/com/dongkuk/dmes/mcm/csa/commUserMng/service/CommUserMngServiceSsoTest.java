package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngPwdInitRequest;
import com.dongkuk.dmes.mcm.entity.SecUserPwd;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link CommUserMngService#pwdinit} SSO 일괄 초기화 분기 특성 테스트 (SSO_RESET_FLAG="Y").
 *
 * <p>다음 단계에서 행별 UPDATE·upsert 를 일괄 처리로 바꾸더라도 DB 에 남는 결과와 cnt 가 같아야 한다.
 * 그래서 저장소 호출(updateSsoPwd 횟수 등)은 보지 않고 남은 행과 해시 일치만 본다.
 */
class CommUserMngServiceSsoTest extends CommUserMngJpaTestBase {

    static CommUserMngPwdInitRequest ssoReq() {
        CommUserMngPwdInitRequest r = new CommUserMngPwdInitRequest();
        r.setSSO_RESET_FLAG("Y");
        r.setUSER_ID("ignored"); // SSO 분기에서는 요청의 USER_ID 를 보지 않는다
        r.setUSER_EMP_NO("0");
        return r;
    }

    SecUserPwd pwdOf(String userId) {
        return secUserPwdRepository.findById(userId).orElseThrow();
    }

    @Test
    @DisplayName("행마다 SSO 해시 = bcrypt(USER_ID+사번) — 기존 행은 ENC 유지, 없는 행은 ENC null 로 새로 만든다, 응답은 cnt_save 만")
    void bulkReset() {
        fx.pwd("s1", "encS1", "oldS1");
        fx.pwd("s3", "encS3", "oldS3");
        fx.pwd("untouched", "encU", "ssoU");

        List<Map<String, Object>> master = new ArrayList<>(Arrays.asList(
                row("USER_ID", "s1", "USER_EMP_NO", "100", "USER_NM", "하나"),
                row("USER_ID", "s2", "USER_EMP_NO", "200"),      // 비밀번호 행 없음 → 새로 만든다
                row("USER_ID", "", "USER_EMP_NO", "300"),        // 빈 USER_ID → 건너뜀
                null,                                            // null 행 → 건너뜀
                row("USER_EMP_NO", "400"),                       // USER_ID 없음 → 건너뜀
                row("USER_ID", "s3")));                          // 사번 없음 → USER_ID 만

        Map<String, Object> out = inTx(() -> service.pwdinit(ssoReq(), master));

        assertThat(out).containsExactly(Map.entry("cnt_save", 3));

        SecUserPwd s1 = pwdOf("s1");
        assertThat(s1.getUserEncPwd()).isEqualTo("encS1");
        assertThat(BCRYPT.matches("s1100", s1.getUserSsoPwd())).isTrue();

        SecUserPwd s2 = pwdOf("s2");
        assertThat(s2.getUserEncPwd()).isNull();
        assertThat(BCRYPT.matches("s2200", s2.getUserSsoPwd())).isTrue();

        SecUserPwd s3 = pwdOf("s3");
        assertThat(s3.getUserEncPwd()).isEqualTo("encS3");
        assertThat(BCRYPT.matches("s3", s3.getUserSsoPwd())).isTrue();

        SecUserPwd u = pwdOf("untouched");
        assertThat(u.getUserEncPwd()).isEqualTo("encU");
        assertThat(u.getUserSsoPwd()).isEqualTo("ssoU");

        // 요청의 USER_ID("ignored") 로는 아무것도 만들지 않는다
        assertThat(secUserPwdRepository.findById("ignored")).isEmpty();
        assertThat(secUserPwdRepository.count()).isEqualTo(4);
        // 사용자 존재 여부는 보지 않는다 — TB_MCM_SEC_USER 가 비어 있어도 위 결과가 나온다.
        assertThat(secUserRepository.count()).isZero();
    }

    @Test
    @DisplayName("행마다 salt 가 달라 같은 평문이라도 해시 문자열이 다르다")
    void perRowSalt() {
        inTx(() -> service.pwdinit(ssoReq(), List.of(
                row("USER_ID", "a", "USER_EMP_NO", "1"),
                row("USER_ID", "b"))));
        String a = pwdOf("a").getUserSsoPwd();
        String b = pwdOf("b").getUserSsoPwd();
        assertThat(BCRYPT.matches("a1", a)).isTrue();
        assertThat(BCRYPT.matches("b", b)).isTrue();
        assertThat(a).isNotEqualTo(b);
        assertThat(a).isNotEqualTo("a1"); // 평문 저장 아님
    }

    @Test
    @DisplayName("비밀번호 행이 없는 같은 USER_ID 가 두 번 오면 둘 다 센다 — 마지막 행의 사번으로 만든 해시가 남는다")
    void duplicateUserIdWithoutRow() {
        Map<String, Object> out = inTx(() -> service.pwdinit(ssoReq(), List.of(
                row("USER_ID", "dupu", "USER_EMP_NO", "first"),
                row("USER_ID", "dupu", "USER_EMP_NO", "second"))));

        assertThat(out).containsExactly(Map.entry("cnt_save", 2));
        assertThat(secUserPwdRepository.count()).isEqualTo(1);
        SecUserPwd p = pwdOf("dupu");
        assertThat(BCRYPT.matches("dupusecond", p.getUserSsoPwd())).isTrue();
        assertThat(p.getUserEncPwd()).isNull();
    }

    @Test
    @DisplayName("기존 행이 있는 같은 USER_ID 가 두 번 와도 마지막 행이 남는다")
    void duplicateUserIdWithRow() {
        fx.pwd("dupe", "enc", "old");
        Map<String, Object> out = inTx(() -> service.pwdinit(ssoReq(), List.of(
                row("USER_ID", "dupe", "USER_EMP_NO", "1"),
                row("USER_ID", "dupe", "USER_EMP_NO", "2"))));

        assertThat(out).containsExactly(Map.entry("cnt_save", 2));
        assertThat(BCRYPT.matches("dupe2", pwdOf("dupe").getUserSsoPwd())).isTrue();
        assertThat(pwdOf("dupe").getUserEncPwd()).isEqualTo("enc");
    }

    @Test
    @DisplayName("master 가 null 이거나 비면 cnt 0, INIT_PWD 없음")
    void emptyMaster() {
        assertThat(inTx(() -> service.pwdinit(ssoReq(), null))).containsExactly(Map.entry("cnt_save", 0));
        assertThat(inTx(() -> service.pwdinit(ssoReq(), List.of()))).containsExactly(Map.entry("cnt_save", 0));
        assertThat(secUserPwdRepository.count()).isZero();
    }
}
