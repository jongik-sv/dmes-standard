package com.dongkuk.dmes.mcm.widget.layout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.dto.SecWidgetSearchRequest;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTabId;
import com.dongkuk.dmes.mcm.widget.service.SecWidgetService;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.widget.def.dto.WidgetDefListRequest;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.def.service.WidgetDefService;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItem;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabItemRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultTabWriter;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultTabs;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetFixedTabs;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetLayoutWriter.LayoutItem;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import com.dongkuk.dmes.mcm.widget.repository.WidgetUserLookupRepository;
import com.dongkuk.dmes.mcm.widget.service.SecWidgetTabWriter;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.PersistenceException;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 기본 탭 저장소·해석·Writer 채번과 공유 받는 사람 찾기 쿼리 — H2 메모리(design-widget-tabs.md §1~§3).
 * 기본 탭이 있어도 widgetDef/list 의 「홈」 기본 배치(homeDefault)는 바뀌지 않음을 실제 저장소로 확인한다.
 */
@SpringJUnitConfig(WidgetTabsJpaTestConfig.class)
class WidgetDefaultTabJpaTest {

    @Autowired WidgetDefaultLayoutRepository layoutRepository;
    @Autowired WidgetDefaultTabRepository tabRepository;
    @Autowired WidgetDefaultTabItemRepository itemRepository;
    @Autowired SecUserWidgetTabRepository userTabRepository;
    @Autowired SecUserWidgetRepository userWidgetRepository;
    @Autowired WidgetFixedTabs fixedTabs;
    @Autowired WidgetDefaultTabWriter writer;
    @Autowired WidgetUserLookupRepository userLookup;
    @Autowired SecWidgetTabWriter shareWriter;
    @Autowired PlatformTransactionManager txManager;
    @PersistenceContext EntityManager em;

    @BeforeEach
    void clean() {
        layoutRepository.deleteAllInBatch();
        itemRepository.deleteAllInBatch();
        tabRepository.deleteAllInBatch();
        userWidgetRepository.deleteAllInBatch();
        userTabRepository.deleteAllInBatch();
        new TransactionTemplate(txManager).executeWithoutResult(s -> {
            em.createQuery("delete from McmSecUser").executeUpdate();
            em.createQuery("delete from DeptInfo").executeUpdate();
        });
    }

    private static LayoutItem item(String instId) {
        return new LayoutItem(instId, "home.notice", 0, 0, 6, 6, "N");
    }

    private void homeLayout(String key, String instId) {
        WidgetDefaultLayout l = new WidgetDefaultLayout();
        l.setLayoutKey(key);
        l.setInstId(instId);
        l.setWidgetId("home.notice");
        l.setPosX(0);
        l.setPosY(0);
        l.setSizeW(12);
        l.setSizeH(6);
        l.setLockYn("N");
        layoutRepository.saveAndFlush(l);
    }

    private void userTab(String userId, String tabId) {
        SecUserWidgetTab t = new SecUserWidgetTab();
        t.setUserId(userId);
        t.setTabId(tabId);
        t.setTabNm("재정의");
        t.setTabSeq(100);
        t.setLockYn("N");
        userTabRepository.saveAndFlush(t);
    }

    // ── ① widgetDef/list homeDefault = 전사 배치만 ──────────────────

    @Test
    @DisplayName("widgetDef/list 의 homeDefault 는 전사(*) 「홈」 배치만 본다 — 부서 배치·기본 탭만 있으면 null(스펙 2026-10-07 §5)")
    void homeDefaultIsCompanyOnly() {
        WidgetDefService defService = new WidgetDefService(mock(WidgetDefRepository.class), layoutRepository);
        writer.save("D100", null, "생산", 1, List.of(item("t1"), item("t2")));
        homeLayout("D100", "dh1");

        Map<String, Object> deptOnly = defService.list(new WidgetDefListRequest());
        assertThat(deptOnly.get("homeDefault")).isNull();
        assertThat(deptOnly.get("homeDefaultKey")).isNull();

        homeLayout("*", "h1");
        Map<String, Object> withHome = defService.list(new WidgetDefListRequest());
        assertThat(withHome.get("homeDefaultKey")).isEqualTo("*");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> homeDefault = (List<Map<String, Object>>) withHome.get("homeDefault");
        assertThat(homeDefault).singleElement().satisfies(m -> assertThat(m).containsEntry("instId", "h1"));
    }

    // ── ② 고정 탭 집합 ─────────────────────────────────────────────

    @Test
    @DisplayName("고정 탭 = 전사 기본 탭 → 부서 사슬(가까운 순)마다 대표 탭(부서 「홈」 배치가 있을 때만)+기본 탭, 대역 순서·출처·관리자 위젯")
    void fixedTabsUnionCompanyAndDeptChain() {
        String star = writer.save("*", null, "전사 탭", 1, List.of(item("c1")));
        String b = writer.save("D10", null, "B", 2, List.of());
        String a = writer.save("D10", null, "A", 1, List.of(item("w1")));
        String own = writer.save("D100", null, "우리 팀", 1, List.of());
        homeLayout("D100", "dh1");
        homeLayout("*", "h1");

        List<WidgetFixedTabs.FixedTab> tabs = fixedTabs.resolve(List.of("D100", "D10"));

        assertThat(tabs).extracting(WidgetFixedTabs.FixedTab::tabId).containsExactly(star, "dept-D100", own, a, b);
        assertThat(tabs).extracting(WidgetFixedTabs.FixedTab::tabSeq).containsExactly(101, 200, 201, 211, 212);
        assertThat(tabs.get(1).tabNm()).isEqualTo("생산1팀");
        assertThat(tabs.get(1).origin()).isEqualTo("생산1팀 부서 탭");
        assertThat(tabs.get(0).origin()).isEqualTo("전사 기본 탭");
        assertThat(tabs.get(3).origin()).isEqualTo("D10 부서 탭"); // 부서 이름이 없으면 코드
        assertThat(tabs.get(1).items()).extracting(WidgetFixedTabs.Item::instId).containsExactly("dh1");
        assertThat(tabs.get(3).items()).extracting(WidgetFixedTabs.Item::instId).containsExactly("w1");

        // 하위 부서 사용자도 상위 부서 탭을 보고, 부서 배치가 없는 사용자는 전사 탭만 본다.
        assertThat(fixedTabs.resolve(List.of("D101", "D100", "D10"))).extracting(WidgetFixedTabs.FixedTab::tabId)
                .containsExactly(star, "dept-D100", own, a, b);
        assertThat(fixedTabs.resolve(List.of("D200"))).extracting(WidgetFixedTabs.FixedTab::tabId).containsExactly(star);
        assertThat(fixedTabs.resolve(List.of())).extracting(WidgetFixedTabs.FixedTab::tabId).containsExactly(star);
    }

    // ── ③ 옛 행 이전 ───────────────────────────────────────────────

    private void userWidget(String userId, String tabId, String instId) {
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

    @Test
    @DisplayName("moveTabs — 행을 지우지 않고 TAB_ID·이름·순서만 바꾸며 위젯 instId 는 그대로, 두 번째 실행은 아무것도 하지 않는다")
    void moveTabsRenamesWithoutDeleting() {
        userTab("userA", "home");
        userWidget("userA", "home", "h1");
        userWidget("userA", "home", "h2");
        userTab("userA", "tab-1");
        userWidget("userA", "tab-1", "t1");
        userTab("userB", "home");
        userWidget("userB", "home", "b1");
        List<SecWidgetTabWriter.TabMove> moves = List.of(new SecWidgetTabWriter.TabMove("home", "tab-2", "내 홈", 0));

        assertThat(shareWriter.moveTabs("userA", moves)).isEqualTo(1);

        assertThat(userTabRepository.findByUserIdOrderByTabSeqAsc("userA"))
                .extracting(SecUserWidgetTab::getTabId, SecUserWidgetTab::getTabNm, SecUserWidgetTab::getTabSeq)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("tab-2", "내 홈", 0),
                        org.assertj.core.groups.Tuple.tuple("tab-1", "재정의", 100));
        assertThat(userWidgetRepository.findByUserIdAndTabId("userA", "tab-2"))
                .extracting(SecUserWidget::getInstId).containsExactlyInAnyOrder("h1", "h2");
        assertThat(userWidgetRepository.findByUserId("userA")).hasSize(3);
        assertThat(userWidgetRepository.findByUserIdAndTabId("userB", "home")).hasSize(1); // 다른 사용자는 그대로

        assertThat(shareWriter.moveTabs("userA", moves)).isZero();
        assertThat(userWidgetRepository.findByUserId("userA")).hasSize(3);
    }

    @Test
    @DisplayName("moveTabs — 바란 ID 에 탭 행이나 탭 행 없는 위젯 행이 있으면 다음 빈 번호로 옮긴다(덮어쓰기·섞임 없음)")
    void moveTabsSkipsTakenIds() {
        userTab("userA", "home");
        userWidget("userA", "home", "h1");
        userTab("userA", "tab-2");
        userWidget("userA", "tab-3", "orphan"); // 탭 행 없는 위젯

        shareWriter.moveTabs("userA", List.of(new SecWidgetTabWriter.TabMove("home", "tab-2", "내 홈", 0)));

        assertThat(userTabRepository.findByUserIdOrderByTabSeqAsc("userA")).extracting(SecUserWidgetTab::getTabId)
                .containsExactlyInAnyOrder("tab-4", "tab-2");
        assertThat(userWidgetRepository.findByUserIdAndTabId("userA", "tab-4")).extracting(SecUserWidget::getInstId)
                .containsExactly("h1");
        assertThat(userWidgetRepository.findByUserIdAndTabId("userA", "tab-3")).extracting(SecUserWidget::getInstId)
                .containsExactly("orphan");
        assertThat(userTabRepository.findById(new SecUserWidgetTabId("userA", "tab-4")).orElseThrow().getUpdatedBy())
                .isEqualTo("userA");
    }

    @Test
    @DisplayName("insertTab — 바란 tab-N 이 그사이 옮겨진 「내 홈」이면 덮어쓰지 않고 다음 빈 번호에 넣는다")
    void insertTabNeverOverwrites() {
        userTab("userA", "tab-2");
        userWidget("userA", "tab-2", "h1");
        SecWidgetTabWriter.WidgetValues w = new SecWidgetTabWriter.WidgetValues("n1", "home.notice", 0, 0, 6, 6, "N", null);

        String id = shareWriter.insertTab("userA", new SecWidgetTabWriter.TabValues("tab-2", "새 탭", 3, "N"), List.of(w));

        assertThat(id).isEqualTo("tab-3");
        assertThat(userTabRepository.findById(new SecUserWidgetTabId("userA", "tab-2")).orElseThrow().getTabNm()).isEqualTo("재정의");
        assertThat(userWidgetRepository.findByUserIdAndTabId("userA", "tab-2")).extracting(SecUserWidget::getInstId)
                .containsExactly("h1");
        assertThat(userWidgetRepository.findByUserIdAndTabId("userA", "tab-3")).extracting(SecUserWidget::getInstId)
                .containsExactly("n1");
    }

    @Test
    @DisplayName("search — OASIS 처럼 바깥 트랜잭션 안에서 불러도 이전은 자기 트랜잭션으로 커밋되고, 바깥이 롤백돼도 남는다")
    void searchMigratesOutsideOuterTransaction() {
        userTab("userA", "home");
        userWidget("userA", "home", "h1");
        userTab("userA", "tab-1");
        SecurityIdentity identity = mock(SecurityIdentity.class);
        when(identity.currentUserId()).thenReturn("userA");
        WidgetUserContextResolver resolver = mock(WidgetUserContextResolver.class);
        when(resolver.deptChain(org.mockito.ArgumentMatchers.any())).thenReturn(List.of());
        SecWidgetService service = new SecWidgetService(userTabRepository, userWidgetRepository, shareWriter, identity,
                fixedTabs, layoutRepository, resolver, userLookup, txManager);

        Map<String, Object> result = new TransactionTemplate(txManager).execute(status -> {
            userTabRepository.findAll(); // 바깥이 먼저 읽는다(OASIS 서비스 시작과 같게)
            Map<String, Object> r = service.search(new SecWidgetSearchRequest());
            status.setRollbackOnly();
            return r;
        });

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tabs = (List<Map<String, Object>>) result.get("tabs");
        assertThat(tabs).extracting(t -> t.get("tabId") + ":" + t.get("tabNm")).containsExactly("tab-2:내 홈", "tab-1:재정의");
        assertThat(userTabRepository.findByUserIdOrderByTabSeqAsc("userA")).extracting(SecUserWidgetTab::getTabId)
                .containsExactlyInAnyOrder("tab-2", "tab-1");
        assertThat(userWidgetRepository.findByUserIdAndTabId("userA", "tab-2")).extracting(SecUserWidget::getInstId)
                .containsExactly("h1");
    }

    // ── Writer 채번·교체·키 삭제 ─────────────────────────────────────

    @Test
    @DisplayName("새 def-N 은 기본 탭과 사용자 재정의 행에 남은 번호까지 숫자로 비교한 최댓값 + 1")
    void nextTabIdAvoidsUserOverrides() {
        assertThat(writer.save("*", null, "a", 1, List.of())).isEqualTo("def-1");
        assertThat(writer.save("D100", null, "b", 1, List.of())).isEqualTo("def-2");
        userTab("userA", "def-5");
        assertThat(writer.save("*", null, "c", 2, List.of())).isEqualTo("def-6");
        userTab("userB", "def-10");
        userTab("userB", "tab-99");
        assertThat(writer.save("*", null, "d", 3, List.of())).isEqualTo("def-11");
    }

    @Test
    @DisplayName("기존 탭 저장은 이름·순서·위젯을 통째로 바꾸고, TAB_ID 는 다른 키에서도 하나뿐이다")
    void replaceAndUniqueTabId() {
        String id = writer.save("*", null, "a", 1, List.of(item("w1"), item("w2")));
        writer.save("*", id, "a2", 3, List.of(new LayoutItem("w1", "home.todo", 6, 0, 6, 6, "Y")));

        WidgetDefaultTab row = tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc("*").get(0);
        assertThat(row.getTabNm()).isEqualTo("a2");
        assertThat(row.getTabSeq()).isEqualTo(3);
        assertThat(itemRepository.findByLayoutKeyAndTabIdOrderByPosYAscPosXAsc("*", id))
                .extracting(WidgetDefaultTabItem::getInstId, WidgetDefaultTabItem::getWidgetId, WidgetDefaultTabItem::getLockYn)
                .containsExactly(org.assertj.core.groups.Tuple.tuple("w1", "home.todo", "Y"));

        WidgetDefaultTab clash = new WidgetDefaultTab();
        clash.setLayoutKey("D100");
        clash.setTabId(id);
        clash.setTabNm("x");
        clash.setTabSeq(1);
        assertThatThrownBy(() -> tabRepository.saveAndFlush(clash)).isInstanceOf(DataAccessException.class);
    }

    @Test
    @DisplayName("deleteKey 는 그 키의 「홈」 기본 배치·기본 탭·위젯만 지우고, delete 는 사용자 재정의 행을 남긴다")
    void deleteKeyAndTab() {
        homeLayout("D100", "h1");
        homeLayout("*", "h2");
        String d = writer.save("D100", null, "a", 1, List.of(item("w1")));
        String s = writer.save("*", null, "b", 1, List.of(item("w2")));
        userTab("userA", s);

        writer.deleteKey("D100");
        assertThat(layoutRepository.findByLayoutKeyOrderByPosYAscPosXAsc("D100")).isEmpty();
        assertThat(tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc("D100")).isEmpty();
        assertThat(itemRepository.findByLayoutKeyAndTabIdOrderByPosYAscPosXAsc("D100", d)).isEmpty();
        assertThat(layoutRepository.findByLayoutKeyOrderByPosYAscPosXAsc("*")).hasSize(1);
        assertThat(tabRepository.findByLayoutKeyOrderByTabSeqAscTabIdAsc("*")).hasSize(1);

        assertThat(writer.delete("*", s)).isTrue();
        assertThat(writer.delete("*", s)).isFalse();
        assertThat(itemRepository.count()).isZero();
        assertThat(userTabRepository.findByUserIdOrderByTabSeqAsc("userA")).extracting(SecUserWidgetTab::getTabId)
                .containsExactly(s);
    }

    // ── ⑥ 공유 사본 쓰기 ───────────────────────────────────────────

    @Test
    @DisplayName("copyTabs — 정해 둔 tab-N 이 그사이 생겼으면 받는 사람 탭을 덮어쓰지 않고 다음 빈 번호로 넣는다")
    void copyTabsNeverOverwrites() {
        userTab("userB", "tab-3");
        userTab("userB", "tab-4");
        SecWidgetTabWriter.WidgetValues w =
                new SecWidgetTabWriter.WidgetValues("s1", "home.notice", 0, 0, 6, 6, "N", "{\"c\":1}");

        shareWriter.copyTabs(List.of(new SecWidgetTabWriter.TabCopy("userB",
                new SecWidgetTabWriter.TabValues("tab-3", "(공유) 내 탭", 9, "N"), List.of(w))));

        assertThat(userTabRepository.findByUserIdOrderByTabSeqAsc("userB"))
                .extracting(SecUserWidgetTab::getTabId, SecUserWidgetTab::getTabNm)
                .containsExactlyInAnyOrder(org.assertj.core.groups.Tuple.tuple("tab-3", "재정의"),
                        org.assertj.core.groups.Tuple.tuple("tab-4", "재정의"),
                        org.assertj.core.groups.Tuple.tuple("tab-5", "(공유) 내 탭"));
        assertThat(userWidgetRepository.findByUserIdAndTabId("userB", "tab-5"))
                .singleElement().satisfies(r -> assertThat(r.getConfigJson()).isEqualTo("{\"c\":1}"));
    }

    @Test
    @DisplayName("copyTabs — 사본 하나가 PK 충돌로 실패하면 오류가 드러나고 같은 호출의 다른 받는 사람 사본도 함께 롤백된다")
    void copyTabsRollsBackTogether() {
        // userC 사본에 같은 instId 가 두 번 — 두 번째 위젯 persist 가 PK 충돌한다(빈 번호 고르기로는 피할 수 없는 충돌).
        SecWidgetTabWriter.WidgetValues w = new SecWidgetTabWriter.WidgetValues("s1", "home.notice", 0, 0, 6, 6, "N", null);

        assertThatThrownBy(() -> shareWriter.copyTabs(List.of(
                new SecWidgetTabWriter.TabCopy("userB", new SecWidgetTabWriter.TabValues("tab-1", "(공유) a", 1, "N"), List.of(w)),
                new SecWidgetTabWriter.TabCopy("userC", new SecWidgetTabWriter.TabValues("tab-1", "(공유) a", 1, "N"), List.of(w, w)))))
                .isInstanceOf(PersistenceException.class);

        assertThat(userTabRepository.findByUserIdOrderByTabSeqAsc("userB")).isEmpty();
        assertThat(userWidgetRepository.findByUserId("userB")).isEmpty();
        assertThat(userTabRepository.findByUserIdOrderByTabSeqAsc("userC")).isEmpty();
        assertThat(userWidgetRepository.findByUserId("userC")).isEmpty();
    }

    @Test
    @DisplayName("copyTabs — 받는 사람에게 탭 행 없이 남은 위젯 행(tab-1)이 있으면 그 번호를 건너뛰어 섞이지 않는다")
    void copyTabsSkipsOrphanWidgets() {
        userWidget("userC", "tab-1", "s1");
        SecWidgetTabWriter.WidgetValues w = new SecWidgetTabWriter.WidgetValues("s1", "home.notice", 0, 0, 6, 6, "N", null);

        shareWriter.copyTabs(List.of(
                new SecWidgetTabWriter.TabCopy("userC", new SecWidgetTabWriter.TabValues("tab-1", "(공유) a", 1, "N"), List.of(w))));

        assertThat(userTabRepository.findByUserIdOrderByTabSeqAsc("userC")).extracting(SecUserWidgetTab::getTabId)
                .containsExactly("tab-2");
        assertThat(userWidgetRepository.findByUserIdAndTabId("userC", "tab-1")).hasSize(1);
        assertThat(userWidgetRepository.findByUserIdAndTabId("userC", "tab-2")).hasSize(1);
    }

    // ── ⑦ 사용자 찾기 쿼리 ─────────────────────────────────────────

    private void user(String userId, String userNm, String deptCd, String useTp, LocalDateTime end) {
        new TransactionTemplate(txManager).executeWithoutResult(st -> {
            SecUser u = new SecUser();
            u.setUserId(userId);
            u.setUserNm(userNm);
            u.setDeptCd(deptCd);
            u.setUseTp(useTp);
            u.setEndActiveDate(end);
            em.persist(u);
        });
    }

    private void dept(String deptCd, String deptNm) {
        new TransactionTemplate(txManager).executeWithoutResult(st -> {
            DeptInfo d = new DeptInfo();
            d.setDeptCd(deptCd);
            d.setDeptNm(deptNm);
            d.setUseTp("Y");
            em.persist(d);
        });
    }

    @Test
    @DisplayName("searchActive — 아이디·이름 포함(대소문자 무시), %·_ 는 글자로, 사용 중(USE_TP=Y·마감 전)만, 본인 제외, 부서 이름")
    void searchActiveUsers() {
        LocalDateTime now = LocalDateTime.now();
        dept("D100", "생산팀");
        user("u1", "김철수", "D100", "Y", null);
        user("u2", "김철호", "D100", "N", null);
        user("u3", "김%희", null, "Y", now.plusDays(3));
        user("u4", "김_수", null, "Y", null);
        user("u5", "김마감", null, "Y", now.minusDays(1));
        user("abcUser", "에이", null, "Y", null);
        user("me", "김본인", null, "Y", null);

        assertThat(userLookup.searchActive("김철", "me", now, 20))
                .containsExactly(new WidgetUserLookupRepository.UserRow("u1", "김철수", "생산팀"));
        assertThat(userLookup.searchActive("김%", "me", now, 20)).extracting(WidgetUserLookupRepository.UserRow::userId)
                .containsExactly("u3");
        assertThat(userLookup.searchActive("김_", "me", now, 20)).extracting(WidgetUserLookupRepository.UserRow::userId)
                .containsExactly("u4");
        assertThat(userLookup.searchActive("ABC", "me", now, 20)).extracting(WidgetUserLookupRepository.UserRow::userId)
                .containsExactly("abcUser");
        assertThat(userLookup.searchActive("본인", "me", now, 20)).isEmpty();
        assertThat(userLookup.searchActive("김", "me", now, 20)).extracting(WidgetUserLookupRepository.UserRow::userId)
                .containsExactlyInAnyOrder("u1", "u3", "u4");

        assertThat(userLookup.findActiveUserIds(List.of("u1", "u2", "u5", "ghost"), now)).containsExactly("u1");
        assertThat(userLookup.findDeptCd("u1")).isEqualTo("D100");
        assertThat(userLookup.findDeptCd("u3")).isNull();
        assertThat(userLookup.findDeptCd("ghost")).isNull();
    }

    @Test
    @DisplayName("searchActive — 이스케이프 문자 '!' 자체도 글자로 찾는다(!·!%·!_ 가 와일드카드나 이스케이프로 새지 않는다)")
    void searchActiveEscapeCharItself() {
        user("e1", "김!수", null, "Y", null);
        user("e2", "김수", null, "Y", null);
        user("e3", "김!%수", null, "Y", null);
        user("e4", "김!x수", null, "Y", null);
        LocalDateTime now = LocalDateTime.now();

        assertThat(userLookup.searchActive("김!수", "me", now, 20)).extracting(WidgetUserLookupRepository.UserRow::userId)
                .containsExactly("e1");
        assertThat(userLookup.searchActive("!%", "me", now, 20)).extracting(WidgetUserLookupRepository.UserRow::userId)
                .containsExactly("e3");
        assertThat(userLookup.searchActive("김!_수", "me", now, 20)).isEmpty();
        assertThat(userLookup.searchActive("!", "me", now, 20)).extracting(WidgetUserLookupRepository.UserRow::userId)
                .containsExactlyInAnyOrder("e1", "e3", "e4");
    }

    @Test
    @DisplayName("searchActive 는 limit(20)건까지만 이름 순으로 돌려준다")
    void searchActiveLimit() {
        for (int i = 0; i < 25; i++) user(String.format("t%02d", i), String.format("시험%02d", i), null, "Y", null);

        List<WidgetUserLookupRepository.UserRow> rows = userLookup.searchActive("시험", "me", LocalDateTime.now(), 20);

        assertThat(rows).hasSize(20);
        assertThat(rows.get(0).userNm()).isEqualTo("시험00");
        assertThat(rows.get(19).userNm()).isEqualTo("시험19");
    }
}
