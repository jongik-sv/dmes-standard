package com.dongkuk.dmes.mcm.widget.layout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.widget.layout.dto.CommWidgetDefaultTabRequest;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItem;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabItemRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.CommWidgetDefaultTabService;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultTabWriter;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetLayoutWriter.LayoutItem;
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

/** {@link CommWidgetDefaultTabService} — 기본 탭 불러오기·저장 검사(키당 5개·이름 중복·빈 목록 허용·새 ID)·지우기·순서(§3.2). */
@ExtendWith(MockitoExtension.class)
class CommWidgetDefaultTabTest {

    @Mock WidgetDefaultTabRepository tabRepository;
    @Mock WidgetDefaultTabItemRepository itemRepository;
    @Mock WidgetDefaultTabWriter writer;
    @Mock DeptInfoRepository deptRepository;

    @InjectMocks CommWidgetDefaultTabService service;

    private static CommWidgetDefaultTabRequest req(String layoutKey, String tabId, String tabNm, Integer seq) {
        CommWidgetDefaultTabRequest r = new CommWidgetDefaultTabRequest();
        r.setLayoutKey(layoutKey);
        r.setTabId(tabId);
        r.setTabNm(tabNm);
        r.setTabSeq(seq);
        return r;
    }

    private static WidgetDefaultTab tab(String key, String tabId, String nm, int seq) {
        WidgetDefaultTab t = new WidgetDefaultTab();
        t.setLayoutKey(key);
        t.setTabId(tabId);
        t.setTabNm(nm);
        t.setTabSeq(seq);
        return t;
    }

    private static Map<String, Object> widget(String instId) {
        Map<String, Object> m = new HashMap<>();
        m.put("instId", instId);
        m.put("widgetId", "home.notice");
        m.put("posX", 0);
        m.put("posY", 0);
        m.put("sizeW", 6);
        m.put("sizeH", 6);
        return m;
    }

    @Test
    @DisplayName("loadDefaultTabs 는 그 키의 탭을 순서대로, 탭마다 위젯 items 와 함께 돌려준다")
    void load() {
        when(tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc("*"))
                .thenReturn(List.of(tab("*", "def-2", "생산", 1), tab("*", "def-1", "빈 탭", 2)));
        WidgetDefaultTabItem i = new WidgetDefaultTabItem();
        i.setLayoutKey("*");
        i.setTabId("def-2");
        i.setInstId("w1");
        i.setWidgetId("home.notice");
        i.setPosX(0);
        i.setPosY(0);
        i.setSizeW(12);
        i.setSizeH(6);
        i.setLockYn("Y");
        when(itemRepository.findByLayoutKeyOrderByTabIdAscPosYAscPosXAsc("*")).thenReturn(List.of(i));

        Map<String, Object> result = service.loadDefaultTabs(req("*", null, null, null));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tabs = (List<Map<String, Object>>) result.get("tabs");
        assertThat(result).containsEntry("layoutKey", "*");
        assertThat(tabs).extracting(t -> t.get("tabId")).containsExactly("def-2", "def-1");
        assertThat(tabs.get(0)).containsEntry("tabNm", "생산").containsEntry("tabSeq", 1);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) tabs.get(0).get("items");
        assertThat(items).containsExactly(Map.of("instId", "w1", "widgetId", "home.notice",
                "posX", 0, "posY", 0, "sizeW", 12, "sizeH", 6, "lockYn", "Y"));
        assertThat((List<?>) tabs.get(1).get("items")).isEmpty();
    }

    @Test
    @DisplayName("새 기본 탭 — tabId 없음·그 키에 없는 def-N 이면 새 채번(null 로 Writer 호출), 빈 위젯 목록도 저장, 순서는 맨 뒤")
    void saveNew() {
        when(tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc("*")).thenReturn(List.of(tab("*", "def-1", "a", 1)));
        when(writer.save(eq("*"), isNull(), eq("생산"), eq(2), anyList())).thenReturn("def-7");

        Map<String, Object> result = service.saveDefaultTab(req("*", "def-99", "생산", null), List.of());

        assertThat(result).containsEntry("layoutKey", "*").containsEntry("tabId", "def-7").containsEntry("count", 0);
    }

    @Test
    @DisplayName("기존 기본 탭 저장 — 같은 ID 로 바꾸고 순서는 요청 값(없으면 그대로), 위젯 검사는 「홈」 기본 배치와 같다")
    void saveExisting() {
        when(deptRepository.existsById("D100")).thenReturn(true);
        when(tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc("D100"))
                .thenReturn(List.of(tab("D100", "def-1", "a", 1), tab("D100", "def-3", "b", 2)));
        when(writer.save(eq("D100"), eq("def-3"), eq("b2"), eq(2), anyList())).thenReturn("def-3");

        service.saveDefaultTab(req("D100", "def-3", "b2", null), List.of(widget("w1")));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<LayoutItem>> cap = ArgumentCaptor.forClass(List.class);
        verify(writer).save(eq("D100"), eq("def-3"), eq("b2"), eq(2), cap.capture());
        assertThat(cap.getValue()).containsExactly(new LayoutItem("w1", "home.notice", 0, 0, 6, 6, "N"));

        assertThatThrownBy(() -> service.saveDefaultTab(req("D100", "def-3", "b", null), List.of(widget("w 1"))))
                .isInstanceOf(BusinessException.class).hasMessageContaining("인스턴스 ID");
    }

    @Test
    @DisplayName("키당 5개 — 새 탭은 거절, 기존 탭 저장은 허용 · 같은 키 이름 중복·20자 초과·없는 부서는 거절")
    void saveRules() {
        List<WidgetDefaultTab> five = new ArrayList<>();
        for (int i = 1; i <= 5; i++) five.add(tab("*", "def-" + i, "t" + i, i));
        when(tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc("*")).thenReturn(five);

        assertThatThrownBy(() -> service.saveDefaultTab(req("*", null, "새", null), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("5");
        assertThatThrownBy(() -> service.saveDefaultTab(req("*", "def-2", "t1", null), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("같은 이름");
        assertThatThrownBy(() -> service.saveDefaultTab(req("*", "def-2", "가".repeat(21), null), List.of()))
                .isInstanceOf(BusinessException.class);
        verify(writer, never()).save(anyString(), any(), anyString(), anyInt(), anyList());

        when(writer.save(eq("*"), eq("def-2"), eq("t2"), eq(2), anyList())).thenReturn("def-2");
        service.saveDefaultTab(req("*", "def-2", "t2", null), List.of());

        when(deptRepository.existsById("X999")).thenReturn(false);
        assertThatThrownBy(() -> service.saveDefaultTab(req("X999", null, "a", null), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("부서");
    }

    @Test
    @DisplayName("deleteDefaultTab 은 def-N 형식만 받아 Writer 로 지우고, reorderDefaultTabs 는 그 키의 탭만 1부터 매긴다")
    void deleteAndReorder() {
        when(writer.delete("*", "def-2")).thenReturn(true);
        assertThat(service.deleteDefaultTab(req("*", "def-2", null, null))).containsEntry("deleted", true);
        assertThatThrownBy(() -> service.deleteDefaultTab(req("*", "tab-1", null, null))).isInstanceOf(BusinessException.class);

        when(tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc("*"))
                .thenReturn(List.of(tab("*", "def-1", "a", 1), tab("*", "def-2", "b", 2)));
        Map<String, Object> result = service.reorderDefaultTabs(req("*", null, null, null),
                List.of(Map.of("tabId", "def-2"), Map.of("tabId", "def-9"), Map.of("tabId", "def-1")));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Integer>> cap = ArgumentCaptor.forClass(Map.class);
        verify(writer).reorder(eq("*"), cap.capture());
        assertThat(cap.getValue()).containsExactlyInAnyOrderEntriesOf(Map.of("def-2", 1, "def-1", 2));
        assertThat(result).containsEntry("count", 2);
    }
}
