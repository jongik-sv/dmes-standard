package com.dongkuk.dmes.mcm.widget.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.chat.entity.WidgetChatMessage;
import com.dongkuk.dmes.mcm.widget.chat.repository.WidgetChatMessageRepository;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.layout.WidgetTabsJpaTestConfig;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabItemRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultTabWriter;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetFixedTabs;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetLayoutWriter.LayoutItem;
import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemo;
import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemoId;
import com.dongkuk.dmes.mcm.widget.memo.repository.WidgetMemoRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import com.dongkuk.dmes.mcm.widget.repository.WidgetUserLookupRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * 고정 탭 위젯과 같은 instId 를 쓰는 개인 탭 위젯의 instId 분리(스펙 2026-10-07-widget-fixed-tabs §4) — H2 메모리, 실제 저장소·Writer·
 * 고정 탭 해석 위에서 {@code secWidget/search} 를 돌린다. 겹침 감지·재발급·메모/대화 복사·멱등·겹침 없는 사용자 무변화·
 * 한쪽 메모를 고친 뒤 다른 쪽이 그대로임·행 삭제 없음을 확인한다.
 */
@SpringJUnitConfig(WidgetTabsJpaTestConfig.class)
class SecWidgetInstSplitJpaTest {

    @Autowired WidgetDefaultLayoutRepository layoutRepository;
    @Autowired WidgetDefaultTabRepository tabRepository;
    @Autowired WidgetDefaultTabItemRepository itemRepository;
    @Autowired SecUserWidgetTabRepository userTabRepository;
    @Autowired SecUserWidgetRepository userWidgetRepository;
    @Autowired WidgetMemoRepository memoRepository;
    @Autowired WidgetChatMessageRepository chatRepository;
    @Autowired WidgetFixedTabs fixedTabs;
    @Autowired WidgetDefaultTabWriter defaultTabWriter;
    @Autowired SecWidgetTabWriter tabWriter;
    @Autowired SecWidgetInstSplitWriter splitWriter;
    @Autowired PlatformTransactionManager txManager;

    private SecurityIdentity securityIdentity;
    private SecWidgetService service;

    @BeforeEach
    void setUp() {
        chatRepository.deleteAllInBatch();
        memoRepository.deleteAllInBatch();
        userWidgetRepository.deleteAllInBatch();
        userTabRepository.deleteAllInBatch();
        layoutRepository.deleteAllInBatch();
        itemRepository.deleteAllInBatch();
        tabRepository.deleteAllInBatch();

        securityIdentity = mock(SecurityIdentity.class);
        WidgetUserContextResolver resolver = mock(WidgetUserContextResolver.class);
        WidgetUserLookupRepository lookup = mock(WidgetUserLookupRepository.class);
        when(lookup.findDeptCd("userA")).thenReturn(null);
        when(resolver.deptChain(null)).thenReturn(List.of());
        service = new SecWidgetService(userTabRepository, userWidgetRepository, tabWriter, splitWriter, securityIdentity,
                fixedTabs, layoutRepository, resolver, lookup, txManager);
        loginAs("userA");

        // 고정 집합: 전사 「홈」 배치 h1 + 전사 기본 탭 「전사 탭」 항목 c1
        homeLayout("h1");
        defaultTabWriter.save("*", null, "전사 탭", 1, List.of(new LayoutItem("c1", "home.notice", 0, 0, 6, 6, "N")));
    }

    // ── fixtures ───────────────────────────────────────────────────

    private void loginAs(String userId) {
        when(securityIdentity.currentUserId()).thenReturn(userId);
    }

    private void homeLayout(String instId) {
        WidgetDefaultLayout l = new WidgetDefaultLayout();
        l.setLayoutKey("*");
        l.setInstId(instId);
        l.setWidgetId("home.notice");
        l.setPosX(0);
        l.setPosY(0);
        l.setSizeW(12);
        l.setSizeH(6);
        l.setLockYn("N");
        layoutRepository.saveAndFlush(l);
    }

    private void personalTab(String userId, String tabId, String nm, int seq) {
        SecUserWidgetTab t = new SecUserWidgetTab();
        t.setUserId(userId);
        t.setTabId(tabId);
        t.setTabNm(nm);
        t.setTabSeq(seq);
        t.setLockYn("N");
        userTabRepository.saveAndFlush(t);
    }

    private void widget(String userId, String tabId, String instId) {
        SecUserWidget w = new SecUserWidget();
        w.setUserId(userId);
        w.setTabId(tabId);
        w.setInstId(instId);
        w.setWidgetId("home.notice");
        w.setPosX(0);
        w.setPosY(0);
        w.setSizeW(6);
        w.setSizeH(6);
        w.setLockYn("N");
        userWidgetRepository.saveAndFlush(w);
    }

    private void memo(String userId, String instId, String content, String title) {
        WidgetMemo m = new WidgetMemo();
        m.setUserId(userId);
        m.setInstId(instId);
        m.setDefId("def.memo1234");
        m.setFmt("md");
        m.setContent(content);
        m.setTitle(title);
        memoRepository.saveAndFlush(m);
    }

    private void chat(String userId, String instId, int seq, String role, String content) {
        WidgetChatMessage c = new WidgetChatMessage();
        c.setUserId(userId);
        c.setInstId(instId);
        c.setMsgSeq(seq);
        c.setRoleTp(role);
        c.setContent(content);
        c.setLinksJson(seq == 2 ? "[{\"pageId\":\"p1\",\"title\":\"화면\"}]" : null);
        chatRepository.saveAndFlush(c);
    }

    @SuppressWarnings("unchecked")
    private List<String> personalInstIds(String tabId) {
        Map<String, Object> result = service.search(new SecWidgetSearchRequest());
        return ((List<Map<String, Object>>) result.get("widgets")).stream()
                .filter(w -> tabId.equals(w.get("tabId"))).map(w -> (String) w.get("instId")).toList();
    }

    // ── 시험 ───────────────────────────────────────────────────────

    @Test
    @DisplayName("search — 고정 탭 instId(전사 「홈」 배치·고정 탭 항목)·default- 접두 개인 위젯은 새 instId 를 받고 메모·대화가 복사되며, 고정 쪽은 그대로다")
    void splitsOverlappingInstIdsAndCopiesMemoAndChat() {
        personalTab("userA", "tab-1", "내 홈", 0);
        widget("userA", "tab-1", "h1");           // 전사 「홈」 배치와 같음
        widget("userA", "tab-1", "c1");           // 고정 탭 항목과 같음
        widget("userA", "tab-1", "default-kpi");  // 프런트 기본 배치 접두어
        widget("userA", "tab-1", "w-own");        // 겹침 없음
        memo("userA", "h1", "원본 메모", "내 제목");
        memo("userB", "h1", "남의 메모", null);
        chat("userA", "h1", 1, "user", "질문");
        chat("userA", "h1", 2, "assistant", "답");

        List<String> after = personalInstIds("tab-1");

        assertThat(after).hasSize(4).contains("w-own").doesNotContain("h1", "c1", "default-kpi");
        String newH1 = after.stream().filter(i -> !i.equals("w-own")).filter(i -> memoRepository
                .existsById(new WidgetMemoId("userA", i))).findFirst().orElseThrow();
        WidgetMemo copied = memoRepository.findById(new WidgetMemoId("userA", newH1)).orElseThrow();
        assertThat(copied.getContent()).isEqualTo("원본 메모");
        assertThat(copied.getTitle()).isEqualTo("내 제목");
        assertThat(copied.getDefId()).isEqualTo("def.memo1234");
        assertThat(copied.getFmt()).isEqualTo("md");
        // 옛 instId 의 메모·대화는 지우지 않는다(고정 위젯이 계속 쓴다).
        assertThat(memoRepository.findById(new WidgetMemoId("userA", "h1")).orElseThrow().getContent()).isEqualTo("원본 메모");
        assertThat(chatRepository.findByUserIdAndInstIdOrderByMsgSeqAsc("userA", "h1")).hasSize(2);
        List<WidgetChatMessage> chatCopy = chatRepository.findByUserIdAndInstIdOrderByMsgSeqAsc("userA", newH1);
        assertThat(chatCopy).extracting(WidgetChatMessage::getMsgSeq, WidgetChatMessage::getRoleTp, WidgetChatMessage::getContent)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(1, "user", "질문"),
                        org.assertj.core.groups.Tuple.tuple(2, "assistant", "답"));
        assertThat(chatCopy.get(1).getLinksJson()).contains("p1");
        assertThat(memoRepository.findById(new WidgetMemoId("userB", "h1")).orElseThrow().getContent()).isEqualTo("남의 메모");
        assertThat(userWidgetRepository.findByUserId("userA")).hasSize(4); // 행 삭제 없음

        // 한쪽 메모를 고쳐도 다른 쪽은 그대로.
        WidgetMemo edit = memoRepository.findById(new WidgetMemoId("userA", newH1)).orElseThrow();
        edit.setContent("개인 탭에서 고침");
        memoRepository.saveAndFlush(edit);
        assertThat(memoRepository.findById(new WidgetMemoId("userA", "h1")).orElseThrow().getContent()).isEqualTo("원본 메모");
        assertThat(memoRepository.findById(new WidgetMemoId("userA", newH1)).orElseThrow().getContent())
                .isEqualTo("개인 탭에서 고침");

        // 멱등 — 두 번째 조회는 아무것도 바꾸지 않는다.
        long memos = memoRepository.count();
        long chats = chatRepository.count();
        assertThat(personalInstIds("tab-1")).containsExactlyInAnyOrderElementsOf(after);
        assertThat(memoRepository.count()).isEqualTo(memos);
        assertThat(chatRepository.count()).isEqualTo(chats);
        assertThat(memoRepository.findById(new WidgetMemoId("userA", newH1)).orElseThrow().getContent())
                .isEqualTo("개인 탭에서 고침");
    }

    @Test
    @DisplayName("search — 겹침 없는 사용자는 위젯·메모·대화가 그대로이고, 고정 탭 응답은 관리자 instId 를 그대로 돌려준다")
    void noOverlapChangesNothing() {
        personalTab("userA", "tab-1", "내 탭", 0);
        widget("userA", "tab-1", "w-a");
        widget("userA", "tab-1", "w-b");
        memo("userA", "w-a", "메모", null);
        chat("userA", "w-a", 1, "user", "질문");

        assertThat(personalInstIds("tab-1")).containsExactlyInAnyOrder("w-a", "w-b");

        assertThat(memoRepository.count()).isEqualTo(1);
        assertThat(chatRepository.count()).isEqualTo(1);
        assertThat(userWidgetRepository.findByUserId("userA")).extracting(SecUserWidget::getInstId)
                .containsExactlyInAnyOrder("w-a", "w-b");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> widgets = (List<Map<String, Object>>) service.search(new SecWidgetSearchRequest()).get("widgets");
        assertThat(widgets).extracting(w -> w.get("instId")).contains("c1"); // 고정 탭 위젯은 관리자 instId 그대로
    }

    @Test
    @DisplayName("splitInstIds — 메모·대화가 없어도 위젯만 새 instId 로 바뀌고, 이미 나뉜 위젯·새 instId 쪽에 있는 메모는 건드리지 않으며, 두 번째 호출은 0")
    void writerIsIdempotentAndKeepsExistingTargets() {
        personalTab("userA", "tab-1", "내 홈", 0);
        widget("userA", "tab-1", "h1");
        widget("userA", "tab-1", "default-notice");
        memo("userA", "default-notice", "옛 메모", null);
        memo("userA", "s-new2", "이미 있는 메모", null);
        chat("userA", "default-notice", 1, "user", "옛 질문");
        chat("userA", "s-new2", 1, "user", "이미 있는 대화");
        List<SecWidgetInstSplitWriter.Split> splits = List.of(
                new SecWidgetInstSplitWriter.Split("tab-1", "h1", "s-new1"),
                new SecWidgetInstSplitWriter.Split("tab-1", "default-notice", "s-new2"));

        assertThat(splitWriter.splitInstIds("userA", splits)).isEqualTo(2);

        assertThat(userWidgetRepository.findByUserIdAndTabId("userA", "tab-1")).extracting(SecUserWidget::getInstId)
                .containsExactlyInAnyOrder("s-new1", "s-new2");
        assertThat(memoRepository.existsById(new WidgetMemoId("userA", "s-new1"))).isFalse(); // 복사할 메모가 없었다
        assertThat(memoRepository.findById(new WidgetMemoId("userA", "s-new2")).orElseThrow().getContent())
                .isEqualTo("이미 있는 메모"); // 덮어쓰지 않는다
        assertThat(chatRepository.findByUserIdAndInstIdOrderByMsgSeqAsc("userA", "s-new2"))
                .extracting(WidgetChatMessage::getContent).containsExactly("이미 있는 대화");
        assertThat(memoRepository.findById(new WidgetMemoId("userA", "default-notice")).orElseThrow().getContent())
                .isEqualTo("옛 메모");

        assertThat(splitWriter.splitInstIds("userA", splits)).isZero();
        assertThat(userWidgetRepository.findByUserId("userA")).hasSize(2);
    }
}
