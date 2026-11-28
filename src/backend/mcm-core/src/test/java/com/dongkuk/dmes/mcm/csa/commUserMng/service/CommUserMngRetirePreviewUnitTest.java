/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: searchRetirePreview 의 MDM 분기 단위 시험 — 담당 건수·ERD 작업 중 표시 건수·MDM 실패(OWNED_ERROR)
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngStateRequest;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.security.account.UserOwnershipClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** {@link CommUserMngLifecycleService#retirePreview} — DB 없이 MDM 응답만 바꿔 본다. */
class CommUserMngRetirePreviewUnitTest {

    UserLifecycleCore core;
    UserOwnershipClient client;
    ObjectProvider<UserOwnershipClient> provider;
    CommUserMngLifecycleService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        core = mock(UserLifecycleCore.class);
        client = mock(UserOwnershipClient.class);
        provider = mock(ObjectProvider.class);
        service = new CommUserMngLifecycleService(core, provider);

        SecUser u = new SecUser();
        u.setUserId("pv");
        u.setUserEmpNo("E1");
        when(core.require("pv")).thenReturn(u);
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("ROLE_GROUP_CNT", 2);
        counts.put("ASSIGN_CNT", 1);
        when(core.retirePreview(u)).thenReturn(counts);
    }

    static CommUserMngStateRequest req() {
        CommUserMngStateRequest r = new CommUserMngStateRequest();
        r.setUSER_ID("pv");
        return r;
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> owned(Map<String, Object> out) {
        return (List<Map<String, Object>>) out.get("ds_owned");
    }

    @Test
    @DisplayName("MDM 담당 전부를 ds_owned 로(ERD_CLAIM 포함), ERD_CLAIM 건수는 CLAIM_CNT")
    void ownedAndClaims() {
        when(provider.getIfAvailable()).thenReturn(client);
        when(client.summary(anyList())).thenReturn(List.of(
                new UserOwnershipClient.Owned("pv", "CODE_OWNER", "코드 초안 소유", 4, false),
                new UserOwnershipClient.Owned("pv", "ERD_CLAIM", "ERD 작업 중 표시", 3, false)));

        Map<String, Object> out = service.retirePreview(req());

        assertThat(out).containsEntry("ROLE_GROUP_CNT", 2).containsEntry("ASSIGN_CNT", 1)
                .containsEntry("CLAIM_CNT", 3L).doesNotContainKey("OWNED_ERROR");
        assertThat(owned(out)).extracting(r -> r.get("KIND")).containsExactly("CODE_OWNER", "ERD_CLAIM");
        assertThat(owned(out).get(0)).containsEntry("CNT", 4L).containsEntry("KIND_NM", "코드 초안 소유");
    }

    @Test
    @DisplayName("MDM 실패 — 빈 ds_owned·OWNED_ERROR, CLAIM_CNT 없음, 역할그룹·배정 건수는 그대로")
    void mdmFails() {
        when(provider.getIfAvailable()).thenReturn(client);
        when(client.summary(anyList())).thenThrow(new UserOwnershipClient.UnavailableException("down", null));

        Map<String, Object> out = service.retirePreview(req());

        assertThat(out).containsEntry("ROLE_GROUP_CNT", 2).containsEntry("ASSIGN_CNT", 1)
                .containsEntry("OWNED_ERROR", "MDM 담당 데이터를 읽지 못했습니다").doesNotContainKey("CLAIM_CNT");
        assertThat(owned(out)).isEmpty();
    }

    @Test
    @DisplayName("MDM 연결 설정 없음 — searchOwned 와 같은 문구")
    void noClient() {
        when(provider.getIfAvailable()).thenReturn(null);

        Map<String, Object> out = service.retirePreview(req());

        assertThat(out).containsEntry("OWNED_ERROR", "MDM 연결 설정이 없습니다").containsEntry("ROLE_GROUP_CNT", 2);
        assertThat(service.searchOwned(req())).containsEntry("OWNED_ERROR", "MDM 연결 설정이 없습니다");
    }
}
