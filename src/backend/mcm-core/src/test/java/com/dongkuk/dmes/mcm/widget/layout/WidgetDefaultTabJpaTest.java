package com.dongkuk.dmes.mcm.widget.layout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContext;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.dto.WidgetDefListRequest;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.def.service.WidgetDefService;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidgetTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTab;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultTabItem;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabItemRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultTabWriter;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultTabs;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetLayoutWriter.LayoutItem;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetTabRepository;
import com.dongkuk.dmes.mcm.widget.repository.WidgetUserLookupRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
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
    @Autowired WidgetDefaultTabs defaultTabs;
    @Autowired WidgetDefaultTabWriter writer;
    @Autowired WidgetUserLookupRepository userLookup;
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

    // ── ① widgetDef/list homeDefault 불변 ──────────────────────────

    @Test
    @DisplayName("기본 탭이 있어도 widgetDef/list 의 homeDefault 는 「홈」 기본 배치만 본다(기본 탭만 있으면 null)")
    void homeDefaultUnaffectedByDefaultTabs() {
        WidgetUserContextResolver resolver = mock(WidgetUserContextResolver.class);
        when(resolver.current()).thenReturn(new WidgetUserContext("userA", "사용자A", "D100", null, List.of("D100", "D10")));
        WidgetDefService defService = new WidgetDefService(mock(WidgetDefRepository.class), layoutRepository, resolver);
        writer.save("D100", null, "생산", 1, List.of(item("t1"), item("t2")));
        writer.save("D10", null, "품질", 1, List.of(item("t3")));

        Map<String, Object> onlyTabs = defService.list(new WidgetDefListRequest());
        assertThat(onlyTabs.get("homeDefault")).isNull();
        assertThat(onlyTabs.get("homeDefaultKey")).isNull();

        homeLayout("*", "h1");
        Map<String, Object> withHome = defService.list(new WidgetDefListRequest());
        assertThat(withHome.get("homeDefaultKey")).isEqualTo("*");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> homeDefault = (List<Map<String, Object>>) withHome.get("homeDefault");
        assertThat(homeDefault).singleElement().satisfies(m -> assertThat(m).containsEntry("instId", "h1"));
    }

    // ── ② 해석 순서 ────────────────────────────────────────────────

    @Test
    @DisplayName("기본 탭 집합 = 부서 → 상위 부서 → 전사 중 기본 탭이 있는 첫 키의 탭 전체(관리자 순서)")
    void resolveFirstKeyWithTabs() {
        String b = writer.save("D10", null, "B", 2, List.of());
        String a = writer.save("D10", null, "A", 1, List.of(item("w1")));
        String star = writer.save("*", null, "전사 탭", 1, List.of());

        WidgetDefaultTabs.Resolved upper = defaultTabs.resolve(List.of("D100", "D10"));
        assertThat(upper.layoutKey()).isEqualTo("D10");
        assertThat(upper.tabs()).extracting(WidgetDefaultTab::getTabId).containsExactly(a, b);
        assertThat(defaultTabs.itemsByTab("D10")).containsOnlyKeys(a);

        assertThat(defaultTabs.resolve(List.of("D200")).layoutKey()).isEqualTo("*");
        assertThat(defaultTabs.resolve(List.of()).tabs()).extracting(WidgetDefaultTab::getTabId).containsExactly(star);

        tabRepository.deleteAllInBatch();
        assertThat(defaultTabs.resolve(List.of("D100"))).isEqualTo(WidgetDefaultTabs.Resolved.EMPTY);
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
    @DisplayName("searchActive 는 limit(20)건까지만 이름 순으로 돌려준다")
    void searchActiveLimit() {
        for (int i = 0; i < 25; i++) user(String.format("t%02d", i), String.format("시험%02d", i), null, "Y", null);

        List<WidgetUserLookupRepository.UserRow> rows = userLookup.searchActive("시험", "me", LocalDateTime.now(), 20);

        assertThat(rows).hasSize(20);
        assertThat(rows.get(0).userNm()).isEqualTo("시험00");
        assertThat(rows.get(19).userNm()).isEqualTo("시험19");
    }
}
