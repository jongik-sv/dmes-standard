package com.dongkuk.dmes.mcm.widget.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetTabSaveRequest;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetUserSearchRequest;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTabId;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItem;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultTabs;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import com.dongkuk.dmes.mcm.widget.repository.WidgetUserLookupRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * {@link SecWidgetService} 기본 탭·공유·사용자 찾기(design-widget-tabs.md §3.1) — 해석 집합 풀기, 재정의·되돌리기,
 * def-* 거절 규칙, 기본 탭을 포함한 탭 한도, shareTab 이름·한도·받는 사람 확인, searchUsers 입력 검사.
 */
@ExtendWith(MockitoExtension.class)
class SecWidgetDefaultTabTest {

    @Mock SecUserWidgetTabRepository tabRepository;
    @Mock SecUserWidgetRepository widgetRepository;
    @Mock SecWidgetTabWriter writer;
    @Mock SecurityIdentity securityIdentity;
    @Mock WidgetDefaultTabs defaultTabs;
    @Mock WidgetDefaultLayoutRepository layoutRepository;
    @Mock WidgetUserContextResolver userContextResolver;
    @Mock WidgetUserLookupRepository userLookup;

    @InjectMocks SecWidgetService service;

    /** userA 는 D100 → D10 부서, 기본 탭은 D10 키의 「생산」(def-1)·「품질」(def-2). */
    private final WidgetDefaultTabs.Resolved userAResolved =
            new WidgetDefaultTabs.Resolved("D10", List.of(defTab("D10", "def-1", "생산", 1), defTab("D10", "def-2", "품질", 2)));

    @BeforeEach
    void userA() {
        lenient().when(securityIdentity.currentUserId()).thenReturn("userA");
        lenient().when(userLookup.findDeptCd("userA")).thenReturn("D100");
        lenient().when(userContextResolver.deptChain("D100")).thenReturn(List.of("D100", "D10"));
        lenient().when(defaultTabs.resolve(List.of("D100", "D10"))).thenReturn(userAResolved);
    }

    // ── fixtures ───────────────────────────────────────────────────

    private static WidgetDefaultTab defTab(String key, String tabId, String nm, int seq) {
        WidgetDefaultTab t = new WidgetDefaultTab();
        t.setLayoutKey(key);
        t.setTabId(tabId);
        t.setTabNm(nm);
        t.setTabSeq(seq);
        return t;
    }

    private static WidgetDefaultTabItem defItem(String key, String tabId, String instId) {
        WidgetDefaultTabItem i = new WidgetDefaultTabItem();
        i.setLayoutKey(key);
        i.setTabId(tabId);
        i.setInstId(instId);
        i.setWidgetId("home.notice");
        i.setPosX(0);
        i.setPosY(0);
        i.setSizeW(12);
        i.setSizeH(6);
        i.setLockYn("Y");
        return i;
    }

    private static SecUserWidgetTab tab(String userId, String tabId, String nm, int seq, String lockYn) {
        SecUserWidgetTab t = new SecUserWidgetTab();
        t.setUserId(userId);
        t.setTabId(tabId);
        t.setTabNm(nm);
        t.setTabSeq(seq);
        t.setLockYn(lockYn);
        return t;
    }

    private static SecUserWidget userWidget(String userId, String tabId, String instId, String lockYn, String config) {
        SecUserWidget w = new SecUserWidget();
        w.setUserId(userId);
        w.setTabId(tabId);
        w.setInstId(instId);
        w.setWidgetId("home.notice");
        w.setPosX(2);
        w.setPosY(3);
        w.setSizeW(8);
        w.setSizeH(5);
        w.setLockYn(lockYn);
        w.setConfigJson(config);
        return w;
    }

    private static SecWidgetTabSaveRequest save(String tabId, String tabNm, Integer seq, String lockYn) {
        SecWidgetTabSaveRequest r = new SecWidgetTabSaveRequest();
        r.setTabId(tabId);
        r.setTabNm(tabNm);
        r.setTabSeq(seq);
        r.setLockYn(lockYn);
        return r;
    }

    private static SecWidgetTabRequest tabReq(String tabId) {
        SecWidgetTabRequest r = new SecWidgetTabRequest();
        r.setTabId(tabId);
        return r;
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

    private static List<Map<String, Object>> targets(String... userIds) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (String id : userIds) rows.add(Map.of("userId", id));
        return rows;
    }

    /** 받는 사람 target 의 부서·기본 탭·탭 행. */
    private void receiver(String target, WidgetDefaultTabs.Resolved resolved, List<SecUserWidgetTab> rows) {
        when(userLookup.findDeptCd(target)).thenReturn("X" + target);
        when(userContextResolver.deptChain("X" + target)).thenReturn(List.of("X" + target));
        when(defaultTabs.resolve(List.of("X" + target))).thenReturn(resolved);
        when(tabRepository.findByUserIdOrderByTabSeqAsc(target)).thenReturn(rows);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> result, String key) {
        return (List<Map<String, Object>>) result.get(key);
    }

    // ── search ─────────────────────────────────────────────────────

    @Test
    @DisplayName("search — 홈 → 기본 탭(관리자 이름·100+순서, 재정의 행이 있으면 그 배치·잠금) → 일반 탭, 해석 밖 def 행은 숨긴다")
    void searchResolvesDefaultTabs() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(
                tab("userA", "home", "홈", 0, "N"),
                tab("userA", "tab-1", "내 탭", 1, "N"),
                tab("userA", "def-1", "옛 이름", 101, "Y"),
                tab("userA", "def-9", "지운 탭", 109, "N")));
        when(widgetRepository.findByUserId("userA")).thenReturn(List.of(
                userWidget("userA", "home", "h1", "N", null),
                userWidget("userA", "def-1", "o1", "N", "{\"a\":1}"),
                userWidget("userA", "def-9", "x1", "N", null),
                userWidget("userA", "tab-1", "t1", "N", null)));
        when(defaultTabs.itemsByTab("D10")).thenReturn(Map.of(
                "def-1", List.of(defItem("D10", "def-1", "d1")),
                "def-2", List.of(defItem("D10", "def-2", "d2"))));

        Map<String, Object> result = service.search(new SecWidgetSearchRequest());

        List<Map<String, Object>> tabs = list(result, "tabs");
        assertThat(tabs).extracting(t -> t.get("tabId")).containsExactly("home", "def-1", "def-2", "tab-1");
        assertThat(tabs.get(0)).containsEntry("defaultYn", "N").containsEntry("customYn", "N");
        assertThat(tabs.get(1)).containsEntry("tabNm", "생산").containsEntry("tabSeq", 101)
                .containsEntry("lockYn", "Y").containsEntry("defaultYn", "Y").containsEntry("customYn", "Y");
        assertThat(tabs.get(2)).containsEntry("tabNm", "품질").containsEntry("tabSeq", 102)
                .containsEntry("lockYn", "N").containsEntry("defaultYn", "Y").containsEntry("customYn", "N");
        assertThat(tabs.get(3)).containsEntry("tabNm", "내 탭").containsEntry("defaultYn", "N");

        List<Map<String, Object>> widgets = list(result, "widgets");
        assertThat(widgets).extracting(w -> w.get("tabId") + "/" + w.get("instId"))
                .containsExactlyInAnyOrder("home/h1", "def-1/o1", "tab-1/t1", "def-2/d2");
        assertThat(widgets).filteredOn(w -> "d2".equals(w.get("instId"))).singleElement()
                .satisfies(w -> assertThat(w).containsEntry("lockYn", "Y").containsEntry("configJson", null));
        verify(userLookup).findDeptCd("userA");
    }

    // ── saveTab ────────────────────────────────────────────────────

    @Test
    @DisplayName("saveTab def-N — 해석 집합의 탭이면 관리자 이름·100+순서로 재정의 행을 저장(요청 이름·순서 무시, 잠금은 반영)")
    void saveDefaultTabOverride() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(new ArrayList<>());

        service.saveTab(save("def-2", "바꾼 이름", 1, "Y"), List.of(widget("i1")));

        ArgumentCaptor<SecWidgetTabWriter.TabValues> cap = ArgumentCaptor.forClass(SecWidgetTabWriter.TabValues.class);
        verify(writer).replaceTab(eq("userA"), cap.capture(), anyList());
        assertThat(cap.getValue()).isEqualTo(new SecWidgetTabWriter.TabValues("def-2", "품질", 102, "Y"));
    }

    @Test
    @DisplayName("saveTab def-N — 해석 집합 밖 ID(다른 부서·지운 탭)는 거절")
    void saveDefaultTabOutsideSetRejected() {
        assertThatThrownBy(() -> service.saveTab(save("def-9", "x", 1, "N"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("def-9");
        verify(writer, never()).replaceTab(anyString(), any(), anyList());
    }

    @Test
    @DisplayName("일반 탭 이름이 기본 탭 이름과 같으면 중복으로 거절")
    void userTabNameClashesWithDefault() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(new ArrayList<>());

        assertThatThrownBy(() -> service.saveTab(save("tab-1", "품질", 1, "N"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("같은 이름");
    }

    @Test
    @DisplayName("탭 한도 — 기본 탭 2개 + 일반 7개면 새 일반 탭 거절, 재정의 행(def-*)은 두 번 세지 않는다")
    void tabLimitCountsDefaultTabs() {
        List<SecUserWidgetTab> rows = new ArrayList<>();
        rows.add(tab("userA", "home", "홈", 0, "N"));
        rows.add(tab("userA", "def-1", "생산", 101, "N"));
        rows.add(tab("userA", "def-2", "품질", 102, "N"));
        for (int i = 1; i <= 6; i++) rows.add(tab("userA", "tab-" + i, "t" + i, i, "N"));
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(rows);

        // 일반 6 + 기본 2 = 8 < 9 → 허용(홈 포함 10번째 탭)
        service.saveTab(save("tab-7", "t7", 7, "N"), List.of());
        verify(writer).replaceTab(eq("userA"), any(), anyList());

        rows.add(tab("userA", "tab-7", "t7", 7, "N"));
        assertThatThrownBy(() -> service.saveTab(save("tab-8", "t8", 8, "N"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("10");
    }

    // ── saveTab newYn(화면이 연 뒤 생긴 공유 사본과 같은 tab-N) ─────

    private static SecWidgetTabSaveRequest saveNew(String tabId, String tabNm, String newYn) {
        SecWidgetTabSaveRequest r = save(tabId, tabNm, 5, "N");
        r.setNewYn(newYn);
        return r;
    }

    private String savedTabId() {
        ArgumentCaptor<SecWidgetTabWriter.TabValues> cap = ArgumentCaptor.forClass(SecWidgetTabWriter.TabValues.class);
        verify(writer).replaceTab(eq("userA"), cap.capture(), anyList());
        return cap.getValue().tabId();
    }

    @Test
    @DisplayName("newYn=Y 이고 같은 tab-N 이 있으면 기존 행을 덮어쓰지 않고 최대 번호+1 로 새 탭 저장, 응답 tabId 도 새 ID")
    void saveNewMovesWhenIdTaken() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(
                tab("userA", "home", "홈", 0, "N"), tab("userA", "tab-1", "a", 1, "N"), tab("userA", "tab-3", "(공유) a", 2, "N")));

        Map<String, Object> result = service.saveTab(saveNew("tab-3", "새 탭", "Y"), List.of(widget("i1")));

        assertThat(savedTabId()).isEqualTo("tab-4");
        assertThat(result).containsEntry("tabId", "tab-4").containsEntry("savedCount", 1);
        verify(writer, never()).replaceTab(eq("userA"), eq(new SecWidgetTabWriter.TabValues("tab-3", "새 탭", 5, "N")), anyList());
    }

    @Test
    @DisplayName("newYn=Y 여도 같은 ID 가 없으면 요청 ID 그대로")
    void saveNewKeepsFreeId() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(tab("userA", "tab-1", "a", 1, "N")));

        assertThat(service.saveTab(saveNew("tab-5", "새 탭", "Y"), List.of())).containsEntry("tabId", "tab-5");
        assertThat(savedTabId()).isEqualTo("tab-5");
    }

    @Test
    @DisplayName("newYn 이 없으면 같은 ID 는 기존 탭 저장(덮어쓰기) 그대로")
    void saveWithoutNewYnOverwrites() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(tab("userA", "tab-3", "a", 1, "N")));

        assertThat(service.saveTab(saveNew("tab-3", "a2", null), List.of())).containsEntry("tabId", "tab-3");
        assertThat(savedTabId()).isEqualTo("tab-3");
    }

    @Test
    @DisplayName("newYn=Y 로 옮긴 새 탭에도 탭 한도(기본 탭 포함 10)와 이름 중복 검사를 다시 적용한다")
    void saveNewMovedStillChecksLimitAndName() {
        List<SecUserWidgetTab> rows = new ArrayList<>();
        rows.add(tab("userA", "home", "홈", 0, "N"));
        for (int i = 1; i <= 7; i++) rows.add(tab("userA", "tab-" + i, "t" + i, i, "N"));
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(rows);

        // 일반 7 + 기본 2 = 9 → 기존 tab-3 저장이 아니라 새 탭이므로 거절
        assertThatThrownBy(() -> service.saveTab(saveNew("tab-3", "새 탭", "Y"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("10");
        rows.remove(rows.size() - 1);
        // 옮긴 새 탭의 이름이 원래 tab-3 이름과 같으면 중복으로 거절
        assertThatThrownBy(() -> service.saveTab(saveNew("tab-3", "t3", "Y"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("같은 이름");
        verify(writer, never()).replaceTab(anyString(), any(), anyList());
    }

    @Test
    @DisplayName("home 은 newYn=Y 여도 무시하고 home 으로 저장한다")
    void saveNewIgnoredForHome() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(tab("userA", "home", "홈", 0, "N")));

        assertThat(service.saveTab(saveNew("home", "홈", "Y"), List.of())).containsEntry("tabId", "home");
        assertThat(savedTabId()).isEqualTo("home");
    }

    // ── deleteTab·reorderTabs·resetTab ─────────────────────────────

    @Test
    @DisplayName("deleteTab 은 def-* 를 거절한다")
    void deleteDefaultTabRejected() {
        assertThatThrownBy(() -> service.deleteTab(tabReq("def-1")))
                .isInstanceOf(BusinessException.class).hasMessageContaining("기본 탭");
        verify(writer, never()).deleteTab(anyString(), anyString());
    }

    @Test
    @DisplayName("reorderTabs 는 def-* 를 건너뛴다(순서 고정)")
    void reorderSkipsDefaultTabs() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(
                tab("userA", "def-1", "생산", 101, "N"), tab("userA", "tab-1", "a", 1, "N"), tab("userA", "tab-2", "b", 2, "N")));

        service.reorderTabs(List.of(Map.of("tabId", "def-1"), Map.of("tabId", "tab-2"), Map.of("tabId", "tab-1")));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Integer>> cap = ArgumentCaptor.forClass(Map.class);
        verify(writer).reorder(eq("userA"), cap.capture());
        assertThat(cap.getValue()).containsExactlyInAnyOrderEntriesOf(Map.of("tab-2", 1, "tab-1", 2));
    }

    @Test
    @DisplayName("resetTab — 해석 집합의 def-N·home 은 재정의 행을 지우고, 집합 밖 def·일반 탭은 거절")
    void resetTab() {
        assertThat(service.resetTab(tabReq("def-1"))).containsEntry("tabId", "def-1").containsEntry("deleted", true);
        verify(writer).deleteTab("userA", "def-1");
        service.resetTab(tabReq("home"));
        verify(writer).deleteTab("userA", "home");

        assertThatThrownBy(() -> service.resetTab(tabReq("def-9"))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.resetTab(tabReq("tab-1"))).isInstanceOf(BusinessException.class);
        verify(writer, never()).deleteTab("userA", "def-9");
        verify(writer, never()).deleteTab("userA", "tab-1");
    }

    // ── shareTab ───────────────────────────────────────────────────

    /** 본인 tab-1(이름 name, 위젯 2개: 잠금·설정 있음). */
    private void ownTab1(String name) {
        when(tabRepository.findById(new SecUserWidgetTabId("userA", "tab-1")))
                .thenReturn(Optional.of(tab("userA", "tab-1", name, 1, "Y")));
        when(widgetRepository.findByUserIdAndTabId("userA", "tab-1")).thenReturn(List.of(
                userWidget("userA", "tab-1", "a1", "Y", "{\"c\":1}"), userWidget("userA", "tab-1", "a2", "N", null)));
    }

    @Test
    @DisplayName("shareTab — 원본은 본인 행에서 읽고, 받는 사람에게 「(공유) 이름」(20자) 새 tab-N·instId 재발급·잠금 해제로 복사")
    void shareCopiesTab() {
        ownTab1("생산 실적 현황 보고서 모음집");
        when(userLookup.findActiveUserIds(eq(Set.of("userB")), any())).thenReturn(List.of("userB"));
        receiver("userB", WidgetDefaultTabs.Resolved.EMPTY, List.of(
                tab("userB", "home", "홈", 0, "N"), tab("userB", "tab-1", "x", 1, "N"), tab("userB", "tab-3", "y", 5, "N")));

        Map<String, Object> result = service.shareTab(tabReq("tab-1"), targets("userB"));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<SecWidgetTabWriter.TabCopy>> cap = ArgumentCaptor.forClass(List.class);
        verify(writer).copyTabs(cap.capture());
        SecWidgetTabWriter.TabCopy copy = cap.getValue().get(0);
        assertThat(copy.userId()).isEqualTo("userB");
        assertThat(copy.tab()).isEqualTo(new SecWidgetTabWriter.TabValues("tab-4", "(공유) 생산 실적 현황 보고서 모음", 6, "N"));
        assertThat(copy.tab().tabNm()).hasSize(20);
        assertThat(copy.widgets()).hasSize(2).allSatisfy(w -> {
            assertThat(w.instId()).matches("^[A-Za-z0-9_-]{1,40}$").isNotIn("a1", "a2");
            assertThat(w.lockYn()).isEqualTo("N");
            assertThat(w.posX()).isEqualTo(2);
        });
        assertThat(copy.widgets().get(0).configJson()).isEqualTo("{\"c\":1}");
        assertThat(list(result, "results")).singleElement().satisfies(r -> assertThat(r)
                .containsEntry("userId", "userB").containsEntry("ok", true)
                .containsEntry("tabNm", "(공유) 생산 실적 현황 보고서 모음").containsEntry("message", null));
        verify(widgetRepository, never()).findByUserIdAndTabId(eq("userB"), anyString());
    }

    @Test
    @DisplayName("shareTab 이름 — 받는 사람 탭·기본 탭 이름과 겹치면 숫자 꼬리, 꼬리를 붙여도 20자 이하")
    void shareNameTail() {
        assertThat(SecWidgetService.shareName("내 탭", Set.of("홈"))).isEqualTo("(공유) 내 탭");
        assertThat(SecWidgetService.shareName("내 탭", Set.of("(공유) 내 탭"))).isEqualTo("(공유) 내 탭 2");
        assertThat(SecWidgetService.shareName("내 탭", Set.of("(공유) 내 탭", "(공유) 내 탭 2"))).isEqualTo("(공유) 내 탭 3");
        String longNm = "가나다라마바사아자차카타파하";
        String first = SecWidgetService.shareName(longNm, Set.of());
        assertThat(first).isEqualTo("(공유) 가나다라마바사아자차카타파하").hasSize(19);
        String full = SecWidgetService.shareName(longNm + "거너", Set.of());
        assertThat(full).hasSize(20);
        String tailed = SecWidgetService.shareName(longNm + "거너", Set.of(full));
        assertThat(tailed).hasSize(20).endsWith(" 2").startsWith("(공유) 가나다라");
    }

    @Test
    @DisplayName("shareTab — 받는 사람 한도(기본 탭 포함) 초과·본인·없는/비활성 사용자는 그 사람만 실패, 나머지는 복사")
    void sharePartialFailures() {
        ownTab1("내 탭");
        when(userLookup.findActiveUserIds(eq(Set.of("userB", "userC", "ghost")), any())).thenReturn(List.of("userB", "userC"));
        receiver("userB", WidgetDefaultTabs.Resolved.EMPTY, List.of(tab("userB", "tab-2", "(공유) 내 탭", 1, "N")));
        List<SecUserWidgetTab> full = new ArrayList<>();
        for (int i = 1; i <= 7; i++) full.add(tab("userC", "tab-" + i, "c" + i, i, "N"));
        receiver("userC", new WidgetDefaultTabs.Resolved("*", List.of(defTab("*", "def-3", "a", 1), defTab("*", "def-4", "b", 2))),
                full);

        Map<String, Object> result = service.shareTab(tabReq("tab-1"), targets("userB", "userA", "userC", "ghost", "userB"));

        List<Map<String, Object>> results = list(result, "results");
        assertThat(results).extracting(r -> r.get("userId") + ":" + r.get("ok"))
                .containsExactly("userB:true", "userA:false", "userC:false", "ghost:false");
        assertThat(results.get(0)).containsEntry("tabNm", "(공유) 내 탭 2");
        assertThat((String) results.get(1).get("message")).contains("본인");
        assertThat((String) results.get(2).get("message")).contains("가득");
        assertThat((String) results.get(3).get("message")).contains("사용하지 않는");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<SecWidgetTabWriter.TabCopy>> cap = ArgumentCaptor.forClass(List.class);
        verify(writer).copyTabs(cap.capture());
        assertThat(cap.getValue()).extracting(SecWidgetTabWriter.TabCopy::userId).containsExactly("userB");
        assertThat(cap.getValue().get(0).tab().tabId()).isEqualTo("tab-3");
    }

    @Test
    @DisplayName("shareTab — 받는 사람이 모두 실패면 쓰지 않는다 · 받는 사람 없음·11명은 통째로 거절 · 없는 원본 탭 거절")
    void shareRejections() {
        ownTab1("내 탭");
        when(userLookup.findActiveUserIds(eq(Set.of("ghost")), any())).thenReturn(List.of());

        String tooLong = "u".repeat(31);
        Map<String, Object> result = service.shareTab(tabReq("tab-1"), targets("userA", " ", "ghost", tooLong));
        List<Map<String, Object>> results = list(result, "results");
        assertThat(results).extracting(r -> r.get("userId")).containsExactly("userA", "", "ghost", tooLong);
        assertThat(results).extracting(r -> r.get("ok")).containsExactly(false, false, false, false);
        assertThat((String) results.get(1).get("message")).contains("비었");
        assertThat((String) results.get(3).get("message")).contains("너무 깁니다");
        verify(writer, never()).copyTabs(anyList());

        assertThatThrownBy(() -> service.shareTab(tabReq("tab-1"), List.of())).isInstanceOf(BusinessException.class);
        String[] eleven = new String[11];
        for (int i = 0; i < 11; i++) eleven[i] = "u" + i;
        assertThatThrownBy(() -> service.shareTab(tabReq("tab-1"), targets(eleven)))
                .isInstanceOf(BusinessException.class).hasMessageContaining("10");
        when(tabRepository.findById(new SecUserWidgetTabId("userA", "tab-5"))).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.shareTab(tabReq("tab-5"), targets("userB")))
                .isInstanceOf(BusinessException.class).hasMessageContaining("없는 탭");
    }

    @Test
    @DisplayName("shareTab 기본 탭 — 재정의 행이 없으면 관리자 배치를 원본으로(이름은 관리자 이름), 받는 쪽에서는 일반 탭")
    void shareDefaultTabWithoutOverride() {
        when(tabRepository.findById(new SecUserWidgetTabId("userA", "def-2"))).thenReturn(Optional.empty());
        when(defaultTabs.items("D10", "def-2")).thenReturn(List.of(defItem("D10", "def-2", "d2")));
        when(userLookup.findActiveUserIds(eq(Set.of("userB")), any())).thenReturn(List.of("userB"));
        receiver("userB", WidgetDefaultTabs.Resolved.EMPTY, List.of());

        service.shareTab(tabReq("def-2"), targets("userB"));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<SecWidgetTabWriter.TabCopy>> cap = ArgumentCaptor.forClass(List.class);
        verify(writer).copyTabs(cap.capture());
        SecWidgetTabWriter.TabCopy copy = cap.getValue().get(0);
        assertThat(copy.tab()).isEqualTo(new SecWidgetTabWriter.TabValues("tab-1", "(공유) 품질", 1, "N"));
        assertThat(copy.widgets()).singleElement().satisfies(w -> {
            assertThat(w.widgetId()).isEqualTo("home.notice");
            assertThat(w.lockYn()).isEqualTo("N");
            assertThat(w.instId()).isNotEqualTo("d2");
        });
    }

    @Test
    @DisplayName("shareTab 홈 — 사용자 행이 없으면 부서 기준 「홈」 기본 배치를 원본으로, 그것도 없으면 거절")
    void shareHomeFallback() {
        when(tabRepository.findById(new SecUserWidgetTabId("userA", "home"))).thenReturn(Optional.empty());
        WidgetDefaultLayout l = new WidgetDefaultLayout();
        l.setLayoutKey("*");
        l.setInstId("h1");
        l.setWidgetId("home.todo");
        l.setPosX(0);
        l.setPosY(0);
        l.setSizeW(6);
        l.setSizeH(4);
        l.setLockYn("Y");
        when(layoutRepository.findByLayoutKeyOrderByPosYAscPosXAsc(anyString()))
                .thenAnswer(inv -> "*".equals(inv.getArgument(0)) ? List.of(l) : List.of());
        when(userLookup.findActiveUserIds(eq(Set.of("userB")), any())).thenReturn(List.of("userB"));
        receiver("userB", WidgetDefaultTabs.Resolved.EMPTY, List.of());

        service.shareTab(tabReq("home"), targets("userB"));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<SecWidgetTabWriter.TabCopy>> cap = ArgumentCaptor.forClass(List.class);
        verify(writer).copyTabs(cap.capture());
        assertThat(cap.getValue().get(0).tab().tabNm()).isEqualTo("(공유) 홈");
        assertThat(cap.getValue().get(0).widgets()).singleElement()
                .satisfies(w -> assertThat(w.widgetId()).isEqualTo("home.todo"));
    }

    // ── searchUsers ────────────────────────────────────────────────

    @Test
    @DisplayName("searchUsers — 1자는 거절, 2자 이상은 본인을 빼고 20건 상한으로 찾는다(칸은 userId·userNm·deptNm)")
    void searchUsers() {
        SecWidgetUserSearchRequest one = new SecWidgetUserSearchRequest();
        one.setKeyword(" a ");
        assertThatThrownBy(() -> service.searchUsers(one)).isInstanceOf(BusinessException.class).hasMessageContaining("2자");
        SecWidgetUserSearchRequest tooLong = new SecWidgetUserSearchRequest();
        tooLong.setKeyword("가".repeat(31));
        assertThatThrownBy(() -> service.searchUsers(tooLong)).isInstanceOf(BusinessException.class).hasMessageContaining("30자");
        verify(userLookup, never()).searchActive(anyString(), anyString(), any(), anyInt());

        when(userLookup.searchActive(eq("김_"), eq("userA"), any(), eq(20)))
                .thenReturn(List.of(new WidgetUserLookupRepository.UserRow("userB", "김_철수", "생산팀")));
        SecWidgetUserSearchRequest two = new SecWidgetUserSearchRequest();
        two.setKeyword(" 김_ ");
        Map<String, Object> result = service.searchUsers(two);

        assertThat(list(result, "users")).containsExactly(Map.of("userId", "userB", "userNm", "김_철수", "deptNm", "생산팀"));
    }
}
