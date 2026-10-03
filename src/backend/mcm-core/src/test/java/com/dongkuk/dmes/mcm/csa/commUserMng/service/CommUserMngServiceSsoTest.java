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
        pwdWithOtherColumns("s1", "encS1", "oldS1");
        pwdWithOtherColumns("s3", "encS3", "oldS3");
        fx.pwd("untouched", "encU", "ssoU");
        SecUserPwd s1Before = pwdOf("s1");

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

        // 기존 행은 SSO 해시만 바뀐다 — 마지막 변경일(만료 판정 기준)·SALT·임시 비밀번호·임시 만료일은 그대로.
        assertOtherPwdColumnsKept("s1");
        assertOtherPwdColumnsKept("s3");

        // 기존 행 경로는 JPQL 벌크 UPDATE(SSO 컬럼만 SET)라 엔티티 리스너(McmAuditListener)가 돌지 않는다 →
        // VER·U_AT·U_USR_ID 가 그대로다. 운영(MSSQL)과 같은 조건이다. 로컬 SQLite 는 mcm JpaConfig 가
        // McmAuditStatementInspector 를 걸어 UPDATE 에 감사 컬럼을 덧붙이므로 거기서는 VER 가 오른다(H2 시험 구성에는 없다).
        // 일괄 처리를 saveAll 등 엔티티 저장으로 바꾸면 VER 가 오르고 U_AT 가 바뀌어 여기서 걸린다 —
        // 그 변화를 받아들일지는 그때 판단하고 이 단언을 고친다.
        assertThat(s1.getVersion()).isEqualTo(s1Before.getVersion());
        assertThat(s1.getUpdatedAt()).isEqualTo(s1Before.getUpdatedAt());
        assertThat(s1.getUpdatedBy()).isEqualTo(s1Before.getUpdatedBy());

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
        // 두 행 모두 이어 붙인 평문이 "ab" 다 — USER_ID "ab"(사번 없음) / USER_ID "a" + 사번 "b".
        // 해시를 행 사이에 재사용·캐시하면 두 문자열이 같아져 여기서 걸린다.
        inTx(() -> service.pwdinit(ssoReq(), List.of(
                row("USER_ID", "ab"),
                row("USER_ID", "a", "USER_EMP_NO", "b"))));
        String ab = pwdOf("ab").getUserSsoPwd();
        String a = pwdOf("a").getUserSsoPwd();
        assertThat(BCRYPT.matches("ab", ab)).isTrue();
        assertThat(BCRYPT.matches("ab", a)).isTrue();
        assertThat(ab).isNotEqualTo(a);
        assertThat(ab).isNotEqualTo("ab"); // 평문 저장 아님
        assertThat(a).isNotEqualTo("ab");
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
