package com.dongkuk.dmes.mcm.widget.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabSaveRequest;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/** {@link SecWidgetService} — 사용자 격리(IDOR)·입력 검사·한도·탭 교체 위임. */
@ExtendWith(MockitoExtension.class)
class SecWidgetServiceTest {

    @Mock SecUserWidgetTabRepository tabRepository;
    @Mock SecUserWidgetRepository widgetRepository;
    @Mock SecWidgetTabWriter writer;
    @Mock SecurityIdentity securityIdentity;

    @InjectMocks SecWidgetService service;

    private static SecWidgetTabSaveRequest save(String tabId, String tabNm) {
        SecWidgetTabSaveRequest r = new SecWidgetTabSaveRequest();
        r.setTabId(tabId);
        r.setTabNm(tabNm);
        r.setTabSeq(1);
        r.setLockYn("N");
        return r;
    }

    private static Map<String, Object> widget(String instId, int x, int y, int w, int h) {
        Map<String, Object> m = new HashMap<>();
        m.put("instId", instId);
        m.put("widgetId", "home.notice");
        m.put("posX", x);
        m.put("posY", y);
        m.put("sizeW", w);
        m.put("sizeH", h);
        m.put("lockYn", "N");
        return m;
    }

    private static SecUserWidgetTab tab(String userId, String tabId, String nm, int seq) {
        SecUserWidgetTab t = new SecUserWidgetTab();
        t.setUserId(userId);
        t.setTabId(tabId);
        t.setTabNm(nm);
        t.setTabSeq(seq);
        t.setLockYn("N");
        return t;
    }

    @Test
    @DisplayName("search 는 인증 사용자의 탭·위젯만 Map 목록으로 돌려준다")
    void searchReturnsOwnTabsAndWidgets() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(tab("userA", "home", "홈", 0)));
        SecUserWidget w = new SecUserWidget();
        w.setUserId("userA"); w.setTabId("home"); w.setInstId("i1"); w.setWidgetId("home.notice");
        w.setPosX(0); w.setPosY(0); w.setSizeW(10); w.setSizeH(16); w.setLockYn("Y");
        when(widgetRepository.findByUserId("userA")).thenReturn(List.of(w));

        Map<String, Object> result = service.search(new SecWidgetSearchRequest());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tabs = (List<Map<String, Object>>) result.get("tabs");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> widgets = (List<Map<String, Object>>) result.get("widgets");
        assertThat(tabs).singleElement().satisfies(t -> {
            assertThat(t.get("tabId")).isEqualTo("home");
            assertThat(t.get("tabNm")).isEqualTo("홈");
            assertThat(t.get("lockYn")).isEqualTo("N");
        });
        assertThat(widgets).singleElement().satisfies(m -> {
            assertThat(m.get("instId")).isEqualTo("i1");
            assertThat(m.get("sizeW")).isEqualTo(10);
            assertThat(m.get("lockYn")).isEqualTo("Y");
        });
    }

    @Test
    @DisplayName("인증 사용자가 없으면 모든 action 이 AUTH_FAILED 로 거절되고 저장소를 건드리지 않는다")
    void rejectsWithoutUser() {
        when(securityIdentity.currentUserId()).thenReturn(null);

        assertThatThrownBy(() -> service.search(new SecWidgetSearchRequest())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.saveTab(save("home", "홈"), List.of())).isInstanceOf(BusinessException.class);
        verify(tabRepository, never()).findByUserIdOrderByTabSeqAsc(anyString());
        verify(writer, never()).replaceTab(anyString(), any(), anyList());
    }

    @Test
    @DisplayName("saveTab 은 인증 사용자로 탭 교체를 Writer 에 맡긴다 — home 이름은 「홈」으로 고정")
    void saveTabDelegatesToWriter() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(new ArrayList<>());

        Map<String, Object> result = service.saveTab(save("home", "아무 이름"), List.of(widget("i1", 0, 0, 10, 16)));

        ArgumentCaptor<SecWidgetTabWriter.TabValues> tabCap = ArgumentCaptor.forClass(SecWidgetTabWriter.TabValues.class);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<SecWidgetTabWriter.WidgetValues>> widgetCap = ArgumentCaptor.forClass(List.class);
        verify(writer).replaceTab(eq("userA"), tabCap.capture(), widgetCap.capture());
        assertThat(tabCap.getValue().tabNm()).isEqualTo("홈");
        assertThat(tabCap.getValue().tabSeq()).isEqualTo(0);
        assertThat(widgetCap.getValue()).singleElement().satisfies(v -> {
            assertThat(v.instId()).isEqualTo("i1");
            assertThat(v.sizeW()).isEqualTo(10);
        });
        assertThat(result).containsEntry("tabId", "home").containsEntry("savedCount", 1);
    }

    @Test
    @DisplayName("saveTab 입력 검사 — tabId 형식·이름 길이·이름 중복·격자 밖·instId 중복")
    void saveTabValidates() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA"))
                .thenReturn(List.of(tab("userA", "home", "홈", 0), tab("userA", "tab-1", "내 생산", 1)));

        assertThatThrownBy(() -> service.saveTab(save("bad id", "가"), List.of())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.saveTab(save("tab-2", " "), List.of())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.saveTab(save("tab-2", "가".repeat(21)), List.of())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.saveTab(save("tab-2", "내 생산"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("같은 이름");
        assertThatThrownBy(() -> service.saveTab(save("tab-2", "품질"), List.of(widget("i1", 20, 0, 6, 6))))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.saveTab(save("tab-2", "품질"), List.of(widget("i1", 0, 0, 6, 6), widget("i1", 6, 0, 6, 6))))
                .isInstanceOf(BusinessException.class);
        verify(writer, never()).replaceTab(anyString(), any(), anyList());
    }

    @Test
    @DisplayName("같은 탭의 이름 그대로 저장은 중복으로 보지 않는다")
    void saveTabSameNameSameTab() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(tab("userA", "tab-1", "내 생산", 1)));

        service.saveTab(save("tab-1", "내 생산"), List.of());

        verify(writer).replaceTab(eq("userA"), any(), anyList());
    }

    @Test
    @DisplayName("탭 10개면 새 탭은 거절, 기존 탭 저장은 허용 · 위젯 31개는 거절")
    void saveTabLimits() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        List<SecUserWidgetTab> ten = new ArrayList<>();
        ten.add(tab("userA", "home", "홈", 0));
        for (int i = 1; i <= 9; i++) ten.add(tab("userA", "tab-" + i, "t" + i, i));
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(ten);

        assertThatThrownBy(() -> service.saveTab(save("tab-10", "새"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("10");
        service.saveTab(save("tab-3", "t3"), List.of());
        List<Map<String, Object>> many = new ArrayList<>();
        for (int i = 0; i < 31; i++) many.add(widget("i" + i, 0, i * 6, 6, 6));
        assertThatThrownBy(() -> service.saveTab(save("tab-3", "t3"), many))
                .isInstanceOf(BusinessException.class).hasMessageContaining("30");
    }

    @Test
    @DisplayName("home 이 없고 일반 탭이 9개여도 home 저장은 통과하고 새 일반 탭은 거절된다")
    void homeExemptFromTabLimit() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        List<SecUserWidgetTab> nine = new ArrayList<>();
        for (int i = 1; i <= 9; i++) nine.add(tab("userA", "tab-" + i, "t" + i, i));
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(nine);

        service.saveTab(save("home", "홈"), List.of());
        verify(writer).replaceTab(eq("userA"), any(), anyList());

        assertThatThrownBy(() -> service.saveTab(save("tab-10", "새"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("10");
    }

    @Test
    @DisplayName("deleteTab 은 home 을 거절하고, 다른 탭은 Writer 로 지운다")
    void deleteTab() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        SecWidgetTabRequest home = new SecWidgetTabRequest();
        home.setTabId("home");
        assertThatThrownBy(() -> service.deleteTab(home)).isInstanceOf(BusinessException.class);

        SecWidgetTabRequest req = new SecWidgetTabRequest();
        req.setTabId("tab-1");
        assertThat(service.deleteTab(req)).containsEntry("deleted", true);
        verify(writer).deleteTab("userA", "tab-1");
    }

    @Test
    @DisplayName("reorderTabs 는 home 을 빼고 받은 순서대로 1부터 매긴다")
    void reorderTabs() {
        when(securityIdentity.currentUserId()).thenReturn("userA");
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA"))
                .thenReturn(List.of(tab("userA", "home", "홈", 0), tab("userA", "tab-1", "a", 1), tab("userA", "tab-2", "b", 2)));

        Map<String, Object> result = service.reorderTabs(List.of(Map.of("tabId", "tab-2"), Map.of("tabId", "home"), Map.of("tabId", "tab-1")));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Integer>> cap = ArgumentCaptor.forClass(Map.class);
        verify(writer).reorder(eq("userA"), cap.capture());
        assertThat(cap.getValue()).containsExactlyInAnyOrderEntriesOf(Map.of("tab-2", 1, "tab-1", 2));
        assertThat(result).containsEntry("count", 2);
    }

    @Test
    @DisplayName("resetHome 은 인증 사용자의 home 탭만 지운다")
    void resetHome() {
        when(securityIdentity.currentUserId()).thenReturn("userA");

        service.resetHome(new SecWidgetSearchRequest());

        verify(writer).deleteTab("userA", "home");
    }
}
