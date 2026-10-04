package com.dongkuk.dmes.mcm.startpgm.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.menu.MenuCatalog;
import com.dongkuk.dmes.mcm.startpgm.dto.SecStartPgmSearchRequest;
import com.dongkuk.dmes.mcm.startpgm.dto.SecStartPgmToggleRequest;
import com.dongkuk.dmes.mcm.startpgm.entity.SecUserStartPgm;
import com.dongkuk.dmes.mcm.startpgm.repository.SecUserStartPgmRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** {@link SecStartPgmService} 단위 테스트 — 기본 화면 토글 on/off · 사용자 격리 · 메뉴 미매칭 오류 · 조회 순서. */
@ExtendWith(MockitoExtension.class)
class SecStartPgmServiceTest {

    private static final String PAGE_ID = "mcm:csa/commUserMng";

    @Mock SecUserStartPgmRepository startPgmRepository;
    @Mock MenuCatalog menuCatalog;
    @Mock SecurityIdentity securityIdentity;

    @InjectMocks SecStartPgmService service;

    private static SecMenu menu(String menuId, String parentMenuId, String objectId, String menuNm) {
        SecMenu m = new SecMenu();
        m.setMenuId(menuId);
        m.setParentMenuId(parentMenuId);
        m.setObjectId(objectId);
        m.setMenuNm(menuNm);
        m.setMenuSeq("3");
        m.setFullSeq("001003");
        m.setUseTp("Y");
        return m;
    }

    private static SecObj obj(String objectId, String sysCd) {
        SecObj o = new SecObj();
        o.setObjectId(objectId);
        o.setSystemCode(sysCd);
        return o;
    }

    private static SecUserStartPgm row(String userId, String fullId, String menuId, int seq) {
        SecUserStartPgm s = new SecUserStartPgm();
        s.setUserId(userId);
        s.setFullId(fullId);
        s.setMenuId(menuId);
        s.setMenuSeq(3);
        s.setStartSeq(seq);
        return s;
    }

    private void givenUserMenu() {
        when(menuCatalog.snapshot()).thenReturn(MenuCatalog.Snapshot.of(
                List.of(menu("M_USER", "csa", "commUserMng", "사용자 관리")),
                List.of(obj("commUserMng", "mcm"))));
    }

    private static SecStartPgmToggleRequest toggle(String userId, String pageId) {
        SecStartPgmToggleRequest req = new SecStartPgmToggleRequest();
        req.setUserId(userId);
        req.setPageId(pageId);
        return req;
    }

    @Test
    @DisplayName("미등록 화면 토글 → 사용자 내 마지막 순서 다음으로 추가(registered=true)")
    void toggleOn() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        givenUserMenu();
        when(startPgmRepository.findByUserIdAndFullIdAndMenuId("userA", "csa/commUserMng", "M_USER"))
                .thenReturn(List.of());
        when(startPgmRepository.maxStartSeqByUserId("userA")).thenReturn(2);

        Map<String, Object> result = service.toggleStartPgm(toggle(null, PAGE_ID));

        assertThat(result).containsEntry("registered", true).containsEntry("menuId", "M_USER");
        ArgumentCaptor<SecUserStartPgm> saved = ArgumentCaptor.forClass(SecUserStartPgm.class);
        verify(startPgmRepository).save(saved.capture());
        assertThat(saved.getValue().getUserId()).isEqualTo("userA");
        assertThat(saved.getValue().getFullId()).isEqualTo("csa/commUserMng");
        assertThat(saved.getValue().getMenuSeq()).isEqualTo(3);
        assertThat(saved.getValue().getStartSeq()).isEqualTo(3);
    }

    @Test
    @DisplayName("등록된 화면 토글 → 제거(registered=false), 추가하지 않음")
    void toggleOff() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        givenUserMenu();
        when(startPgmRepository.findByUserIdAndFullIdAndMenuId("userA", "csa/commUserMng", "M_USER"))
                .thenReturn(List.of(row("userA", "csa/commUserMng", "M_USER", 1)));

        Map<String, Object> result = service.toggleStartPgm(toggle(null, PAGE_ID));

        assertThat(result).containsEntry("registered", false);
        verify(startPgmRepository).deleteByUserIdAndFullIdAndMenuId("userA", "csa/commUserMng", "M_USER");
        verify(startPgmRepository, never()).save(any());
    }

    @Test
    @DisplayName("요청 body 의 userId 는 무시하고 인증 사용자 기준으로 토글한다(IDOR 차단)")
    void toggleUsesAuthenticatedUser() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        givenUserMenu();
        when(startPgmRepository.findByUserIdAndFullIdAndMenuId("userA", "csa/commUserMng", "M_USER"))
                .thenReturn(List.of());
        when(startPgmRepository.maxStartSeqByUserId("userA")).thenReturn(0);

        service.toggleStartPgm(toggle("victim", PAGE_ID));

        verify(startPgmRepository, never()).findByUserIdAndFullIdAndMenuId(
                org.mockito.ArgumentMatchers.eq("victim"), anyString(), anyString());
        ArgumentCaptor<SecUserStartPgm> saved = ArgumentCaptor.forClass(SecUserStartPgm.class);
        verify(startPgmRepository).save(saved.capture());
        assertThat(saved.getValue().getUserId()).isEqualTo("userA");
    }

    @Test
    @DisplayName("조회도 인증 사용자 것만 — 요청 userId 가 다른 사용자여도 그 사용자 목록은 읽지 않는다")
    void searchIsolatedByAuthenticatedUser() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(startPgmRepository.findByUserIdOrderByStartSeqAsc("userA")).thenReturn(List.of());

        SecStartPgmSearchRequest req = new SecStartPgmSearchRequest();
        req.setUserId("victim");

        assertThat(service.searchStartPgms(req)).isEmpty();
        verify(startPgmRepository, never()).findByUserIdOrderByStartSeqAsc("victim");
    }

    @Test
    @DisplayName("조회 결과는 START_SEQ 순서로 메뉴명·sysCd·componentPath 를 붙여 반환")
    void searchEnrichesRows() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(startPgmRepository.findByUserIdOrderByStartSeqAsc("userA")).thenReturn(List.of(
                row("userA", "csa/commUserMng", "M_USER", 1),
                row("userA", "csa/commRoleMng", "M_ROLE", 2)));
        when(menuCatalog.snapshot()).thenReturn(MenuCatalog.Snapshot.of(
                List.of(menu("M_USER", "csa", "commUserMng", "사용자 관리"),
                        menu("M_ROLE", "csa", "commRoleMng", "역할 관리")),
                List.of(obj("commUserMng", "mcm"), obj("commRoleMng", "mcm"))));

        List<Map<String, Object>> rows = service.searchStartPgms(new SecStartPgmSearchRequest());

        assertThat(rows).extracting(r -> r.get("menuNm")).containsExactly("사용자 관리", "역할 관리");
        assertThat(rows.get(0)).containsEntry("sysCd", "mcm")
                .containsEntry("componentPath", "csa/commUserMng")
                .containsEntry("startSeq", 1);
    }

    @Test
    @DisplayName("메뉴에 매칭되지 않는 pageId → INVALID_VALUE 오류, 저장하지 않음")
    void toggleUnknownPage() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        givenUserMenu();

        assertThatThrownBy(() -> service.toggleStartPgm(toggle(null, "mcm:csa/notExists")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
        verify(startPgmRepository, never()).save(any());
    }

    @Test
    @DisplayName("다른 모듈(sysCd)의 같은 경로는 매칭하지 않는다")
    void toggleOtherSysCdNotMatched() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        givenUserMenu();

        assertThatThrownBy(() -> service.toggleStartPgm(toggle(null, "mdm:csa/commUserMng")))
                .isInstanceOf(BusinessException.class);
        verify(startPgmRepository, never()).save(any());
    }

    @Test
    @DisplayName("pageId 형식 오류(콜론 없음) → INVALID_VALUE")
    void toggleMalformedPageId() {
        when(securityIdentity.currentUserId()).thenReturn("userA");

        assertThatThrownBy(() -> service.toggleStartPgm(toggle(null, "csa/commUserMng")))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
    }

    @Test
    @DisplayName("인증 사용자도 요청 userId 도 없으면 AUTH_FAILED")
    void toggleWithoutUser() {
        when(securityIdentity.currentUserId()).thenReturn(null);

        assertThatThrownBy(() -> service.toggleStartPgm(toggle(null, PAGE_ID)))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.AUTH_FAILED));
    }
}
