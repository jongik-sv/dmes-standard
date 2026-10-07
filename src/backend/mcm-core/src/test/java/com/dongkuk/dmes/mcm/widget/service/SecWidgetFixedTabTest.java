package com.dongkuk.dmes.mcm.widget.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetFixedTabs;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetFixedTabs.FixedTab;
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
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * {@link SecWidgetService} 고정 탭(스펙 2026-10-07-widget-fixed-tabs) — 고정 탭 + 개인 탭 응답, 옛 「홈」·기본 탭 재정의 행의 지연 이전,
 * 고정 탭 쓰기 거절, 되돌리기가 행을 지우지 않음, 개인 탭 한도, 공유 원본·이름·받는 사람 확인, searchUsers 입력 검사.
 */
@ExtendWith(MockitoExtension.class)
class SecWidgetFixedTabTest {

    @Mock SecUserWidgetTabRepository tabRepository;
    @Mock SecUserWidgetRepository widgetRepository;
    @Mock SecWidgetTabWriter writer;
    @Mock SecWidgetInstSplitWriter instSplitWriter;
    @Mock SecurityIdentity securityIdentity;
    @Mock WidgetFixedTabs fixedTabs;
    @Mock WidgetDefaultLayoutRepository layoutRepository;
    @Mock WidgetUserContextResolver userContextResolver;
    @Mock WidgetUserLookupRepository userLookup;
    @Mock PlatformTransactionManager transactionManager;

    @InjectMocks SecWidgetService service;

    /** userA(D100 → D10): 전사 「공지」(def-9) → 생산1팀 대표 탭(dept-D100) → D10 의 「생산」(def-1)·「품질」(def-2). */
    private final List<FixedTab> userAFixed = List.of(
            fixed("def-9", "공지", 101, "전사 기본 탭", "c9"),
            fixed("dept-D100", "생산1팀", 200, "생산1팀 부서 탭", "m1"),
            fixed("def-1", "생산", 211, "생산부 부서 탭", "d1"),
            fixed("def-2", "품질", 212, "생산부 부서 탭", "d2"));

    @BeforeEach
    void userA() {
        lenient().when(securityIdentity.currentUserId()).thenReturn("userA");
        lenient().when(userLookup.findDeptCd("userA")).thenReturn("D100");
        lenient().when(userContextResolver.deptChain("D100")).thenReturn(List.of("D100", "D10"));
        lenient().when(fixedTabs.resolve(List.of("D100", "D10"))).thenReturn(userAFixed);
        // 새 탭은 writer 가 실제로 쓴 ID 를 돌려준다 — 시험에서는 바란 ID 그대로.
        lenient().when(writer.insertTab(anyString(), any(), anyList()))
                .thenAnswer(inv -> inv.<SecWidgetTabWriter.TabValues>getArgument(1).tabId());
    }

    // ── fixtures ───────────────────────────────────────────────────

    private static FixedTab fixed(String tabId, String nm, int seq, String origin, String instId) {
        return new FixedTab(tabId, nm, seq, origin,
                List.of(new WidgetFixedTabs.Item(instId, "home.notice", 0, 0, 12, 6, "Y")));
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

    /** 받는 사람 target 의 부서·고정 탭·탭 행. */
    private void receiver(String target, List<FixedTab> fixed, List<SecUserWidgetTab> rows) {
        lenient().when(userLookup.findDeptCd(target)).thenReturn("X" + target);
        lenient().when(userContextResolver.deptChain("X" + target)).thenReturn(List.of("X" + target));
        lenient().when(fixedTabs.resolve(List.of("X" + target))).thenReturn(fixed);
        when(tabRepository.findByUserIdOrderByTabSeqAsc(target)).thenReturn(rows);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> result, String key) {
        return (List<Map<String, Object>>) result.get(key);
    }

    // ── search ─────────────────────────────────────────────────────

    @Test
    @DisplayName("search — 고정 탭(관리자 이름·대역 순서·fixedYn·잠금·출처, 관리자 위젯) → 개인 탭. home 은 돌려주지 않는다")
    void searchFixedThenPersonal() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(
                tab("userA", "tab-1", "내 탭", 1, "N"), tab("userA", "tab-2", "둘째", 2, "Y")));
        when(widgetRepository.findByUserId("userA")).thenReturn(List.of(userWidget("userA", "tab-1", "t1", "N", "{\"a\":1}")));

        Map<String, Object> result = service.search(new SecWidgetSearchRequest());

        List<Map<String, Object>> tabs = list(result, "tabs");
        assertThat(tabs).extracting(t -> t.get("tabId")).containsExactly("def-9", "dept-D100", "def-1", "def-2", "tab-1", "tab-2");
        assertThat(tabs.get(1)).containsEntry("tabNm", "생산1팀").containsEntry("tabSeq", 200).containsEntry("lockYn", "Y")
                .containsEntry("fixedYn", "Y").containsEntry("defaultYn", "Y").containsEntry("customYn", "N")
                .containsEntry("origin", "생산1팀 부서 탭");
        assertThat(tabs.get(5)).containsEntry("tabNm", "둘째").containsEntry("lockYn", "Y").containsEntry("fixedYn", "N")
                .doesNotContainKey("origin");
        assertThat(list(result, "widgets")).extracting(w -> w.get("tabId") + "/" + w.get("instId"))
                .containsExactly("def-9/c9", "dept-D100/m1", "def-1/d1", "def-2/d2", "tab-1/t1");
        verify(writer, never()).moveTabs(anyString(), anyList());
    }

    @Test
    @DisplayName("search 이전 — 위젯 있는 home·고정 집합 안 def 재정의는 개인 탭으로(내 홈 맨 앞, 내 {탭명} 뒤), 빈 행·집합 밖 행은 그대로 숨김")
    void searchMigratesLegacyRows() {
        List<SecUserWidgetTab> before = List.of(
                tab("userA", "home", "홈", 0, "N"),
                tab("userA", "def-1", "옛 이름", 211, "N"),
                tab("userA", "def-2", "품질", 212, "N"),
                tab("userA", "def-7", "지운 탭", 107, "N"),
                tab("userA", "tab-1", "내 탭", 1, "N"),
                tab("userA", "tab-4", "넷째", 3, "N"));
        List<SecUserWidget> beforeWidgets = List.of(
                userWidget("userA", "home", "h1", "N", null),
                userWidget("userA", "def-1", "o1", "N", null),
                userWidget("userA", "def-7", "x1", "N", null),
                userWidget("userA", "tab-1", "t1", "N", null));
        List<SecUserWidgetTab> after = List.of(
                tab("userA", "tab-5", "내 홈", 0, "N"),
                tab("userA", "def-2", "품질", 212, "N"),
                tab("userA", "def-7", "지운 탭", 107, "N"),
                tab("userA", "tab-1", "내 탭", 1, "N"),
                tab("userA", "tab-4", "넷째", 3, "N"),
                tab("userA", "tab-6", "내 생산", 4, "N"));
        List<SecUserWidget> afterWidgets = List.of(
                userWidget("userA", "tab-5", "h1", "N", null),
                userWidget("userA", "tab-6", "o1", "N", null),
                userWidget("userA", "def-7", "x1", "N", null),
                userWidget("userA", "tab-1", "t1", "N", null));
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(before, after);
        when(widgetRepository.findByUserId("userA")).thenReturn(beforeWidgets, afterWidgets);

        Map<String, Object> result = service.search(new SecWidgetSearchRequest());

        verify(writer).moveTabs("userA", List.of(
                new SecWidgetTabWriter.TabMove("home", "tab-5", "내 홈", 0),
                new SecWidgetTabWriter.TabMove("def-1", "tab-6", "내 생산", 4)));
        assertThat(list(result, "tabs")).extracting(t -> t.get("tabId"))
                .containsExactly("def-9", "dept-D100", "def-1", "def-2", "tab-5", "tab-1", "tab-4", "tab-6");
        assertThat(list(result, "widgets")).extracting(w -> w.get("tabId") + "/" + w.get("instId"))
                .contains("tab-5/h1", "tab-6/o1", "tab-1/t1").doesNotContain("def-7/x1");
        verify(writer, never()).deleteTab(anyString(), anyString());
    }

    @Test
    @DisplayName("search 이전 — 위젯 0개인 옛 home 행만 있으면 옮기지 않고 숨긴다(지우지도 않는다)")
    void searchLeavesEmptyLegacyHome() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(
                tab("userA", "home", "홈", 0, "N"), tab("userA", "tab-1", "그냥", 1, "N")));
        when(widgetRepository.findByUserId("userA")).thenReturn(List.of(userWidget("userA", "tab-1", "t1", "N", null)));

        Map<String, Object> result = service.search(new SecWidgetSearchRequest());

        assertThat(list(result, "tabs")).extracting(t -> t.get("tabId")).doesNotContain("home").contains("tab-1");
        verify(writer, never()).moveTabs(anyString(), anyList());
        verify(writer, never()).deleteTab(anyString(), anyString());
    }

    @Test
    @DisplayName("sharedInstSplits — 개인 탭 위젯만, 고정 instId 이거나 default- 접두일 때만 나눈다(w- 로 시작하는 사용자 instId·고정 탭 쪽·옛 행은 그대로)")
    void sharedInstSplitsPicksOnlyOverlappingPersonalWidgets() {
        List<SecUserWidget> widgets = List.of(
                userWidget("userA", "tab-1", "c9", "N", null),           // 고정 탭 항목과 같음
                userWidget("userA", "tab-1", "default-kpi", "N", null),  // 프런트 기본 배치 접두어
                userWidget("userA", "tab-1", "w-mine", "N", null),       // 겹침 없음
                userWidget("userA", "tab-2", "c9", "N", null),           // 다른 개인 탭도 같은 규칙, 위젯마다 새 ID
                userWidget("userA", "home", "c9", "N", null),            // 옮기지 않은 옛 행은 대상이 아니다
                userWidget("userA", "def-1", "default-kpi", "N", null),
                userWidget("userA", "tab-9", "c9", "N", null));          // 탭 행이 없는 고아 위젯 행도 건드리지 않는다
        int[] n = {0};

        List<SecWidgetInstSplitWriter.Split> splits = SecWidgetService.sharedInstSplits(Set.of("tab-1", "tab-2"), widgets, Set.of("c9"), () -> "n" + (++n[0]));

        assertThat(splits).containsExactly(
                new SecWidgetInstSplitWriter.Split("tab-1", "c9", "n1"),
                new SecWidgetInstSplitWriter.Split("tab-1", "default-kpi", "n2"),
                new SecWidgetInstSplitWriter.Split("tab-2", "c9", "n3"));
    }

    @Test
    @DisplayName("search instId 분리 실패(DB 잠금 등) — 오류 없이 응답하고 행을 지우지 않으며, 다음 조회가 다시 시도한다")
    void searchInstSplitFailureDoesNotBreakHome() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(tab("userA", "tab-1", "내 홈", 0, "N")));
        when(widgetRepository.findByUserId("userA")).thenReturn(List.of(userWidget("userA", "tab-1", "c9", "N", null)));
        doThrow(new CannotAcquireLockException("busy")).when(instSplitWriter).splitInstIds(eq("userA"), anyList());

        Map<String, Object> first = service.search(new SecWidgetSearchRequest());

        assertThat(list(first, "tabs")).extracting(t -> t.get("tabId")).contains("tab-1");
        service.search(new SecWidgetSearchRequest());
        verify(instSplitWriter, times(2)).splitInstIds(eq("userA"), anyList());
        verify(writer, never()).deleteTab(anyString(), anyString());
    }

    @Test
    @DisplayName("search 이전 실패(DB 잠금 등) — 오류 없이 옛 행을 숨긴 채 응답하고, 다음 조회가 다시 옮긴다")
    void searchMigrationFailureDoesNotBreakHome() {
        List<SecUserWidgetTab> rows = List.of(tab("userA", "home", "홈", 0, "N"), tab("userA", "tab-1", "a", 1, "N"));
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(rows);
        when(widgetRepository.findByUserId("userA")).thenReturn(List.of(userWidget("userA", "home", "h1", "N", null)));
        when(writer.moveTabs(eq("userA"), anyList())).thenThrow(new CannotAcquireLockException("busy")).thenReturn(1);

        Map<String, Object> first = service.search(new SecWidgetSearchRequest());

        assertThat(list(first, "tabs")).extracting(t -> t.get("tabId")).contains("tab-1").doesNotContain("home");
        assertThat(list(first, "widgets")).extracting(w -> w.get("instId")).doesNotContain("h1");
        service.search(new SecWidgetSearchRequest());
        verify(writer, times(2)).moveTabs("userA", List.of(new SecWidgetTabWriter.TabMove("home", "tab-2", "내 홈", 0)));
        verify(writer, never()).deleteTab(anyString(), anyString());
    }

    @Test
    @DisplayName("legacyMoves 이름 — 개인·고정 탭 이름과 겹치면 숫자 꼬리, 20자 안. 번호는 개인 탭 최대 번호 다음부터")
    void legacyMoveNames() {
        List<SecUserWidgetTab> rows = List.of(
                tab("userA", "home", "홈", 0, "N"),
                tab("userA", "def-2", "품질", 212, "N"),
                tab("userA", "tab-9", "내 홈", 1, "N"),
                tab("userA", "tab-2", "내 품질", 7, "N"));
        List<SecUserWidget> widgets = List.of(userWidget("userA", "home", "h", "N", null),
                userWidget("userA", "def-2", "q", "N", null));
        List<FixedTab> fixed = List.of(fixed("def-2", "품질", 212, "o", "d2"), fixed("def-3", "내 홈 2", 213, "o", "d3"));

        assertThat(SecWidgetService.legacyMoves(rows, widgets, fixed)).containsExactly(
                new SecWidgetTabWriter.TabMove("home", "tab-10", "내 홈 3", 0),
                new SecWidgetTabWriter.TabMove("def-2", "tab-11", "내 품질 2", 8));
        assertThat(SecWidgetService.uniqueName("내 " + "가".repeat(25), Set.of())).hasSize(20);
    }

    // ── 고정 탭 쓰기 거절 ──────────────────────────────────────────

    @Test
    @DisplayName("saveTab·deleteTab 은 고정 탭(home·def-*·dept-*)을 거절하고, 되돌리기 둘은 행을 지우지 않고 거절한다")
    void fixedTabsAreReadOnly() {
        for (String id : List.of("home", "def-1", "def-99", "dept-D100")) {
            assertThatThrownBy(() -> service.saveTab(save(id, "x", 1, "N"), List.of(widget("i1"))))
                    .isInstanceOf(BusinessException.class).hasMessageContaining("관리자가 정한 탭");
            assertThatThrownBy(() -> service.deleteTab(tabReq(id)))
                    .isInstanceOf(BusinessException.class).hasMessageContaining("관리자가 정한 탭");
        }
        assertThatThrownBy(() -> service.resetHome(new SecWidgetSearchRequest())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.resetTab(tabReq("def-1"))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.resetTab(tabReq("home"))).isInstanceOf(BusinessException.class);
        verify(writer, never()).replaceTab(anyString(), any(), anyList());
        verify(writer, never()).insertTab(anyString(), any(), anyList());
        verify(writer, never()).deleteTab(anyString(), anyString());
    }

    @Test
    @DisplayName("개인 탭 이름이 고정 탭 이름·「홈」과 같으면 중복으로 거절")
    void personalNameClashesWithFixed() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(new ArrayList<>());

        assertThatThrownBy(() -> service.saveTab(save("tab-1", "품질", 1, "N"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("같은 이름");
        assertThatThrownBy(() -> service.saveTab(save("tab-1", "생산1팀", 1, "N"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("같은 이름");
        assertThatThrownBy(() -> service.saveTab(save("tab-1", "홈", 1, "N"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("같은 이름");
    }

    @Test
    @DisplayName("개인 탭 한도 — 고정 탭 수와 옛 행은 세지 않고 tab-N 만 10개까지")
    void personalTabLimit() {
        List<SecUserWidgetTab> rows = new ArrayList<>();
        rows.add(tab("userA", "home", "홈", 0, "N"));
        rows.add(tab("userA", "def-2", "품질", 212, "N"));
        for (int i = 1; i <= 9; i++) rows.add(tab("userA", "tab-" + i, "t" + i, i, "N"));
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(rows);

        service.saveTab(save("tab-10", "t10", 10, "N"), List.of());
        verify(writer).insertTab(eq("userA"), any(), anyList());

        rows.add(tab("userA", "tab-10", "t10", 10, "N"));
        assertThatThrownBy(() -> service.saveTab(save("tab-11", "t11", 11, "N"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("10");
    }

    // ── saveTab newYn(화면이 연 뒤 생긴 공유 사본과 같은 tab-N) ─────

    private static SecWidgetTabSaveRequest saveNew(String tabId, String tabNm, String newYn) {
        SecWidgetTabSaveRequest r = save(tabId, tabNm, 5, "N");
        r.setNewYn(newYn);
        return r;
    }

    /** 새 탭 저장이 writer.insertTab 으로 바란 ID. */
    private String insertedTabId() {
        ArgumentCaptor<SecWidgetTabWriter.TabValues> cap = ArgumentCaptor.forClass(SecWidgetTabWriter.TabValues.class);
        verify(writer).insertTab(eq("userA"), cap.capture(), anyList());
        return cap.getValue().tabId();
    }

    @Test
    @DisplayName("newYn=Y 이고 같은 tab-N 이 있으면 기존 행을 덮어쓰지 않고 최대 번호+1 로 새 탭 저장, 응답 tabId 도 새 ID")
    void saveNewMovesWhenIdTaken() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(
                tab("userA", "tab-1", "a", 1, "N"), tab("userA", "tab-3", "(공유) a", 2, "N")));

        Map<String, Object> result = service.saveTab(saveNew("tab-3", "새 탭", "Y"), List.of(widget("i1")));

        assertThat(insertedTabId()).isEqualTo("tab-4");
        assertThat(result).containsEntry("tabId", "tab-4").containsEntry("savedCount", 1);
        verify(writer, never()).replaceTab(anyString(), any(), anyList());
    }

    @Test
    @DisplayName("새 탭은 덮어쓰지 않고 넣기만 한다 — writer 가 그사이 찬 번호를 피해 고른 ID 를 응답한다(동시 이전 「내 홈」 보호)")
    void saveNewReturnsWriterId() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(tab("userA", "tab-1", "a", 1, "N")));
        when(writer.insertTab(eq("userA"), any(), anyList())).thenReturn("tab-3");

        assertThat(service.saveTab(saveNew("tab-2", "새 탭", "Y"), List.of(widget("i1")))).containsEntry("tabId", "tab-3");
        verify(writer, never()).replaceTab(anyString(), any(), anyList());
    }

    @Test
    @DisplayName("newYn=Y 여도 같은 ID 가 없으면 요청 ID 그대로, newYn 이 없으면 같은 ID 는 덮어쓰기")
    void saveNewKeepsFreeIdOrOverwrites() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(tab("userA", "tab-1", "a", 1, "N")));

        assertThat(service.saveTab(saveNew("tab-5", "새 탭", "Y"), List.of())).containsEntry("tabId", "tab-5");
        assertThat(service.saveTab(saveNew("tab-1", "a2", null), List.of())).containsEntry("tabId", "tab-1");
        verify(writer, times(1)).insertTab(eq("userA"), any(), anyList());
        verify(writer, times(1)).replaceTab(eq("userA"), any(), anyList());
    }

    @Test
    @DisplayName("newYn=Y 로 옮긴 새 탭에도 개인 탭 한도와 이름 중복 검사를 다시 적용한다")
    void saveNewMovedStillChecksLimitAndName() {
        List<SecUserWidgetTab> rows = new ArrayList<>();
        for (int i = 1; i <= 10; i++) rows.add(tab("userA", "tab-" + i, "t" + i, i, "N"));
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(rows);

        assertThatThrownBy(() -> service.saveTab(saveNew("tab-3", "새 탭", "Y"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("10");
        rows.remove(rows.size() - 1);
        assertThatThrownBy(() -> service.saveTab(saveNew("tab-3", "t3", "Y"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("같은 이름");
        verify(writer, never()).replaceTab(anyString(), any(), anyList());
        verify(writer, never()).insertTab(anyString(), any(), anyList());
    }

    @Test
    @DisplayName("기존 개인 탭 이름이 나중에 생긴 고정 탭 이름과 같아도 이름을 그대로 두면 배치 저장은 된다, 「내 홈」 순서 0 유지")
    void existingNameClashStillSaves() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(tab("userA", "tab-1", "품질", 0, "N")));

        service.saveTab(save("tab-1", "품질", 0, "N"), List.of(widget("i1")));

        ArgumentCaptor<SecWidgetTabWriter.TabValues> cap = ArgumentCaptor.forClass(SecWidgetTabWriter.TabValues.class);
        verify(writer).replaceTab(eq("userA"), cap.capture(), anyList());
        assertThat(cap.getValue().tabSeq()).isZero();
        assertThatThrownBy(() -> service.saveTab(save("tab-1", "생산", 0, "N"), List.of()))
                .isInstanceOf(BusinessException.class).hasMessageContaining("같은 이름");
    }

    @Test
    @DisplayName("reorderTabs 는 고정·옛 행을 건너뛴다")
    void reorderSkipsFixed() {
        when(tabRepository.findByUserIdOrderByTabSeqAsc("userA")).thenReturn(List.of(
                tab("userA", "def-1", "생산", 211, "N"), tab("userA", "home", "홈", 0, "N"),
                tab("userA", "tab-1", "a", 1, "N"), tab("userA", "tab-2", "b", 2, "N")));

        service.reorderTabs(List.of(Map.of("tabId", "def-1"), Map.of("tabId", "tab-2"), Map.of("tabId", "home"),
                Map.of("tabId", "tab-1")));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Integer>> cap = ArgumentCaptor.forClass(Map.class);
        verify(writer).reorder(eq("userA"), cap.capture());
        assertThat(cap.getValue()).containsExactlyInAnyOrderEntriesOf(Map.of("tab-2", 1, "tab-1", 2));
    }

    // ── shareTab ───────────────────────────────────────────────────

    /** 본인 tab-1(이름 name, 위젯 2개: 잠금·설정 있음). */
    private void ownTab1(String name) {
        when(tabRepository.findById(new SecUserWidgetTabId("userA", "tab-1")))
                .thenReturn(Optional.of(tab("userA", "tab-1", name, 1, "Y")));
        when(widgetRepository.findByUserIdAndTabId("userA", "tab-1")).thenReturn(List.of(
                userWidget("userA", "tab-1", "a1", "Y", "{\"c\":1}"), userWidget("userA", "tab-1", "a2", "N", null)));
    }

    @SuppressWarnings("unchecked")
    private List<SecWidgetTabWriter.TabCopy> copied() {
        ArgumentCaptor<List<SecWidgetTabWriter.TabCopy>> cap = ArgumentCaptor.forClass(List.class);
        verify(writer).copyTabs(cap.capture());
        return cap.getValue();
    }

    @Test
    @DisplayName("shareTab — 원본은 본인 행, 받는 사람에게 「(공유) 이름」(20자) 새 tab-N·instId 재발급·잠금 해제, 받는 사람 옛 행은 세지 않는다")
    void shareCopiesTab() {
        ownTab1("생산 실적 현황 보고서 모음집");
        when(userLookup.findActiveUserIds(eq(Set.of("userB")), any())).thenReturn(List.of("userB"));
        receiver("userB", List.of(), List.of(
                tab("userB", "home", "홈", 0, "N"), tab("userB", "tab-1", "x", 1, "N"), tab("userB", "tab-3", "y", 5, "N")));

        Map<String, Object> result = service.shareTab(tabReq("tab-1"), targets("userB"));

        SecWidgetTabWriter.TabCopy copy = copied().get(0);
        assertThat(copy.userId()).isEqualTo("userB");
        assertThat(copy.tab()).isEqualTo(new SecWidgetTabWriter.TabValues("tab-4", "(공유) 생산 실적 현황 보고서 모음", 6, "N"));
        assertThat(copy.widgets()).hasSize(2).allSatisfy(w -> {
            assertThat(w.instId()).matches("^[A-Za-z0-9_-]{1,40}$").isNotIn("a1", "a2");
            assertThat(w.lockYn()).isEqualTo("N");
        });
        assertThat(copy.widgets().get(0).configJson()).isEqualTo("{\"c\":1}");
        assertThat(list(result, "results")).singleElement().satisfies(r -> assertThat(r)
                .containsEntry("userId", "userB").containsEntry("ok", true).containsEntry("message", null));
    }

    @Test
    @DisplayName("shareTab 이름 — 받는 사람 탭 이름과 겹치면 숫자 꼬리, 꼬리를 붙여도 20자 이하")
    void shareNameTail() {
        assertThat(SecWidgetService.shareName("내 탭", Set.of("홈"))).isEqualTo("(공유) 내 탭");
        assertThat(SecWidgetService.shareName("내 탭", Set.of("(공유) 내 탭"))).isEqualTo("(공유) 내 탭 2");
        assertThat(SecWidgetService.shareName("내 탭", Set.of("(공유) 내 탭", "(공유) 내 탭 2"))).isEqualTo("(공유) 내 탭 3");
        String longNm = "가나다라마바사아자차카타파하";
        String full = SecWidgetService.shareName(longNm + "거너", Set.of());
        assertThat(full).hasSize(20);
        assertThat(SecWidgetService.shareName(longNm + "거너", Set.of(full))).hasSize(20).endsWith(" 2");
    }

    @Test
    @DisplayName("shareTab — 받는 사람 개인 탭 10개·본인·없는/비활성 사용자는 그 사람만 실패, 고정 탭 이름과 겹치면 꼬리")
    void sharePartialFailures() {
        ownTab1("내 탭");
        when(userLookup.findActiveUserIds(eq(Set.of("userB", "userC", "ghost")), any())).thenReturn(List.of("userB", "userC"));
        receiver("userB", List.of(fixed("def-3", "(공유) 내 탭", 101, "o", "z")), List.of(tab("userB", "tab-2", "b", 1, "N")));
        List<SecUserWidgetTab> full = new ArrayList<>();
        for (int i = 1; i <= 10; i++) full.add(tab("userC", "tab-" + i, "c" + i, i, "N"));
        receiver("userC", List.of(), full);

        Map<String, Object> result = service.shareTab(tabReq("tab-1"), targets("userB", "userA", "userC", "ghost", "userB"));

        List<Map<String, Object>> results = list(result, "results");
        assertThat(results).extracting(r -> r.get("userId") + ":" + r.get("ok"))
                .containsExactly("userB:true", "userA:false", "userC:false", "ghost:false");
        assertThat(results.get(0)).containsEntry("tabNm", "(공유) 내 탭 2");
        assertThat((String) results.get(2).get("message")).contains("가득");
        assertThat(copied()).extracting(SecWidgetTabWriter.TabCopy::userId).containsExactly("userB");
    }

    @Test
    @DisplayName("shareTab — 받는 사람이 모두 실패면 쓰지 않는다 · 받는 사람 없음·11명은 통째로 거절 · 없는 원본 탭 거절")
    void shareRejections() {
        ownTab1("내 탭");
        when(userLookup.findActiveUserIds(eq(Set.of("ghost")), any())).thenReturn(List.of());

        Map<String, Object> result = service.shareTab(tabReq("tab-1"), targets("userA", " ", "ghost"));
        assertThat(list(result, "results")).extracting(r -> r.get("ok")).containsExactly(false, false, false);
        verify(writer, never()).copyTabs(anyList());

        assertThatThrownBy(() -> service.shareTab(tabReq("tab-1"), List.of())).isInstanceOf(BusinessException.class);
        String[] eleven = new String[11];
        for (int i = 0; i < 11; i++) eleven[i] = "u" + i;
        assertThatThrownBy(() -> service.shareTab(tabReq("tab-1"), targets(eleven)))
                .isInstanceOf(BusinessException.class).hasMessageContaining("10");
        when(tabRepository.findById(new SecUserWidgetTabId("userA", "tab-5"))).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.shareTab(tabReq("tab-5"), targets("userB")))
                .isInstanceOf(BusinessException.class).hasMessageContaining("없는 탭");
        assertThatThrownBy(() -> service.shareTab(tabReq("def-99"), targets("userB")))
                .isInstanceOf(BusinessException.class).hasMessageContaining("def-99");
    }

    @Test
    @DisplayName("shareTab 고정 탭 — 관리자 배치가 원본(재정의 행은 보지 않음, 이름은 관리자 이름), 받는 쪽에서는 개인 탭")
    void shareFixedTab() {
        when(userLookup.findActiveUserIds(eq(Set.of("userB")), any())).thenReturn(List.of("userB"));
        receiver("userB", List.of(), List.of());

        service.shareTab(tabReq("dept-D100"), targets("userB"));

        SecWidgetTabWriter.TabCopy copy = copied().get(0);
        assertThat(copy.tab()).isEqualTo(new SecWidgetTabWriter.TabValues("tab-1", "(공유) 생산1팀", 1, "N"));
        assertThat(copy.widgets()).singleElement().satisfies(w -> {
            assertThat(w.lockYn()).isEqualTo("N");
            assertThat(w.instId()).isNotEqualTo("m1");
        });
        verify(tabRepository, never()).findById(new SecUserWidgetTabId("userA", "dept-D100"));
    }

    @Test
    @DisplayName("shareTab 홈 — 전사 「홈」 배치가 원본(사용자 home 행은 보지 않음), 없으면 거절")
    void shareHomeUsesCompanyLayout() {
        WidgetDefaultLayout l = new WidgetDefaultLayout();
        l.setLayoutKey("*");
        l.setInstId("h1");
        l.setWidgetId("home.todo");
        l.setPosX(0);
        l.setPosY(0);
        l.setSizeW(6);
        l.setSizeH(4);
        l.setLockYn("Y");
        when(layoutRepository.findByLayoutKeyOrderByPosYAscPosXAsc("*")).thenReturn(List.of(l), List.of());
        when(userLookup.findActiveUserIds(eq(Set.of("userB")), any())).thenReturn(List.of("userB"));
        receiver("userB", List.of(), List.of());

        service.shareTab(tabReq("home"), targets("userB"));

        SecWidgetTabWriter.TabCopy copy = copied().get(0);
        assertThat(copy.tab().tabNm()).isEqualTo("(공유) 홈");
        assertThat(copy.widgets()).singleElement().satisfies(w -> assertThat(w.widgetId()).isEqualTo("home.todo"));
        verify(tabRepository, never()).findById(new SecUserWidgetTabId("userA", "home"));

        assertThatThrownBy(() -> service.shareTab(tabReq("home"), targets("userB")))
                .isInstanceOf(BusinessException.class).hasMessageContaining("전사");
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
