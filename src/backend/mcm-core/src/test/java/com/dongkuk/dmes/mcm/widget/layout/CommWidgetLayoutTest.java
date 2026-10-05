package com.dongkuk.dmes.mcm.widget.layout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.layout.dto.CommWidgetLayoutRequest;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultTabRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.CommWidgetLayoutService;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetDefaultTabWriter;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetLayoutWriter;
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

/** {@link CommWidgetLayoutService} — 기본 배치 저장 검사(A 와 같음)·상위 부서 대체(§5.2)·배치 목록·부서 고르기. */
@ExtendWith(MockitoExtension.class)
class CommWidgetLayoutTest {

    @Mock WidgetDefaultLayoutRepository layoutRepository;
    @Mock WidgetLayoutWriter writer;
    @Mock DeptInfoRepository deptRepository;
    @Mock WidgetUserContextResolver userContextResolver;
    @Mock WidgetDefaultTabRepository tabRepository;
    @Mock WidgetDefaultTabWriter tabWriter;

    @InjectMocks CommWidgetLayoutService service;

    private static CommWidgetLayoutRequest key(String layoutKey) {
        CommWidgetLayoutRequest r = new CommWidgetLayoutRequest();
        r.setLayoutKey(layoutKey);
        return r;
    }

    private static CommWidgetLayoutRequest load(String layoutKey, String effective) {
        CommWidgetLayoutRequest r = key(layoutKey);
        r.setEffective(effective);
        return r;
    }

    private static Map<String, Object> widget(String instId, Object x, Object y, Object w, Object h) {
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

    private static WidgetDefaultLayout row(String key, String instId) {
        WidgetDefaultLayout l = new WidgetDefaultLayout();
        l.setLayoutKey(key);
        l.setInstId(instId);
        l.setWidgetId("home.notice");
        l.setPosX(0);
        l.setPosY(0);
        l.setSizeW(12);
        l.setSizeH(6);
        l.setLockYn("N");
        return l;
    }

    private static DeptInfo dept(String cd, String nm, String upper) {
        DeptInfo d = new DeptInfo();
        d.setDeptCd(cd);
        d.setDeptNm(nm);
        d.setUpperDeptCd(upper);
        d.setUseTp("Y");
        return d;
    }

    /** 키별 배치 — 없는 키는 빈 목록(strict stub 이 다른 인자 호출을 문제로 보지 않게 인자로 답한다). */
    private void layouts(Map<String, List<WidgetDefaultLayout>> byKey) {
        when(layoutRepository.findByLayoutKeyOrderByPosYAscPosXAsc(anyString()))
                .thenAnswer(inv -> byKey.getOrDefault(inv.getArgument(0, String.class), List.of()));
    }

    private void assertSaveRejected(String layoutKey, List<Map<String, Object>> widgets, String messagePart) {
        assertThatThrownBy(() -> service.saveLayout(key(layoutKey), widgets))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining(messagePart);
        verify(writer, never()).replace(anyString(), anyList());
    }

    // ── saveLayout ─────────────────────────────────────────────────

    @Test
    @DisplayName("부서 배치 저장은 그 부서 키로 통째로 바꾸고 위젯 수를 돌려준다(lockYn 없으면 N)")
    void saveDeptLayout() {
        when(deptRepository.existsById("D100")).thenReturn(true);
        Map<String, Object> locked = widget("w2", "12", 0, 12, 6);
        locked.put("lockYn", "Y");
        Map<String, Object> noLock = widget("w1", 0, 0, 12, 6);
        noLock.remove("lockYn");

        Map<String, Object> result = service.saveLayout(key("D100"), List.of(noLock, locked));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<LayoutItem>> captor = ArgumentCaptor.forClass(List.class);
        verify(writer).replace(eq("D100"), captor.capture());
        assertThat(captor.getValue()).containsExactly(
                new LayoutItem("w1", "home.notice", 0, 0, 12, 6, "N"),
                new LayoutItem("w2", "home.notice", 12, 0, 12, 6, "Y"));
        assertThat(result).containsEntry("layoutKey", "D100").containsEntry("count", 2);
    }

    @Test
    @DisplayName("전사(*) 배치는 부서 확인 없이 저장한다")
    void saveCompanyLayout() {
        service.saveLayout(key("*"), List.of(widget("w1", 0, 0, 24, 4)));

        verify(writer).replace(eq("*"), anyList());
        verifyNoInteractions(deptRepository);
    }

    @Test
    @DisplayName("없는 부서 키는 거절")
    void unknownDeptRejected() {
        when(deptRepository.existsById("X999")).thenReturn(false);
        assertSaveRejected("X999", List.of(widget("w1", 0, 0, 6, 6)), "부서");
        assertSaveRejected(" ", List.of(widget("w1", 0, 0, 6, 6)), "배치 키");
    }

    @Test
    @DisplayName("빈 목록 저장은 거절 — 지우려면 기본 배치 지우기")
    void emptyRejected() {
        assertSaveRejected("*", List.of(), "위젯이 하나도 없는 기본 배치는 저장할 수 없습니다. 지우려면 기본 배치 지우기를 쓰세요");
        assertSaveRejected("*", null, "위젯이 하나도 없는 기본 배치는 저장할 수 없습니다");
    }

    @Test
    @DisplayName("격자 밖(POS_X+SIZE_W=25)·음수 좌표·0 크기·정수 아닌 값은 거절")
    void gridRules() {
        assertSaveRejected("*", List.of(widget("w1", 20, 0, 5, 6)), "격자");
        assertSaveRejected("*", List.of(widget("w1", -1, 0, 5, 6)), "격자");
        assertSaveRejected("*", List.of(widget("w1", 0, 0, 0, 6)), "격자");
        assertSaveRejected("*", List.of(widget("w1", 1.5, 0, 5, 6)), "정수");
        assertSaveRejected("*", List.of(widget("w1", "a", 0, 5, 6)), "정수");
    }

    @Test
    @DisplayName("instId 중복은 DUPLICATE_DATA, 형식(영문·숫자·_·-, 40자)·widgetId·lockYn 도 검사")
    void itemRules() {
        assertThatThrownBy(() -> service.saveLayout(key("*"),
                List.of(widget("w1", 0, 0, 6, 6), widget("w1", 6, 0, 6, 6))))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.DUPLICATE_DATA));
        assertSaveRejected("*", List.of(widget("w 1", 0, 0, 6, 6)), "인스턴스 ID");
        assertSaveRejected("*", List.of(widget("w".repeat(41), 0, 0, 6, 6)), "인스턴스 ID");
        Map<String, Object> noWidget = widget("w1", 0, 0, 6, 6);
        noWidget.put("widgetId", "");
        assertSaveRejected("*", List.of(noWidget), "위젯 ID");
        Map<String, Object> badLock = widget("w1", 0, 0, 6, 6);
        badLock.put("lockYn", "X");
        assertSaveRejected("*", List.of(badLock), "lockYn");
        verify(writer, never()).replace(any(), any());
    }

    @Test
    @DisplayName("위젯은 기본 배치당 30개까지")
    void maxWidgets() {
        List<Map<String, Object>> many = new ArrayList<>();
        for (int i = 0; i < 31; i++) many.add(widget("w" + i, 0, i * 2, 6, 2));
        assertSaveRejected("*", many, "30");
    }

    // ── loadLayout ─────────────────────────────────────────────────

    @Test
    @DisplayName("effective=Y 이고 그 부서 행이 없으면 상위 부서 배치를 돌려주고 sourceKey 에 실제 키를 적는다")
    void loadEffectiveFromUpperDept() {
        when(userContextResolver.deptChain("D100")).thenReturn(List.of("D100", "D10", "D1"));
        layouts(Map.of("D10", List.of(row("D10", "a"), row("D10", "b")), "*", List.of(row("*", "c"))));

        Map<String, Object> result = service.loadLayout(load("D100", "Y"));

        assertThat(result).containsEntry("layoutKey", "D100").containsEntry("sourceKey", "D10");
        assertThat((List<?>) result.get("items")).hasSize(2);
        verify(layoutRepository, never()).findByLayoutKeyOrderByPosYAscPosXAsc("D1");
    }

    @Test
    @DisplayName("effective=Y 이고 부서·상위 부서 모두 없으면 전사(*) 배치")
    void loadEffectiveFromCompany() {
        when(userContextResolver.deptChain("D100")).thenReturn(List.of("D100", "D10"));
        layouts(Map.of("*", List.of(row("*", "a"))));

        Map<String, Object> result = service.loadLayout(load("D100", "Y"));

        assertThat(result).containsEntry("sourceKey", "*");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) result.get("items");
        assertThat(items).containsExactly(Map.of("instId", "a", "widgetId", "home.notice", "posX", 0, "posY", 0,
                "sizeW", 12, "sizeH", 6, "lockYn", "N"));
    }

    @Test
    @DisplayName("자기 행이 있으면 sourceKey = 자기 키")
    void loadOwnRows() {
        layouts(Map.of("D100", List.of(row("D100", "a")), "*", List.of(row("*", "c"))));

        Map<String, Object> result = service.loadLayout(load("D100", "Y"));

        assertThat(result).containsEntry("sourceKey", "D100");
        verifyNoInteractions(userContextResolver);
    }

    @Test
    @DisplayName("effective=N 이거나 키가 *(전사)면 그 키만 본다 — 없으면 items=[]·sourceKey=null")
    void loadOnlyThatKey() {
        Map<String, Object> notEffective = service.loadLayout(load("D100", "N"));
        assertThat(notEffective).containsEntry("layoutKey", "D100").containsEntry("sourceKey", null);
        assertThat((List<?>) notEffective.get("items")).isEmpty();

        Map<String, Object> company = service.loadLayout(load("*", "Y"));
        assertThat(company).containsEntry("layoutKey", "*").containsEntry("sourceKey", null);
        assertThat((List<?>) company.get("items")).isEmpty();
        verifyNoInteractions(userContextResolver);
    }

    // ── searchLayouts·deleteLayout·searchDepts ─────────────────────

    @Test
    @DisplayName("배치 목록은 전사(「전사」) 먼저, 그다음 부서 이름 순 — 기본 탭이 없으면 tabCount=0")
    void searchLayoutsCompanyFirst() {
        List<Object[]> counts = new ArrayList<>();
        counts.add(new Object[] {"D200", 3L});
        counts.add(new Object[] {"D100", 1L});
        counts.add(new Object[] {"*", 2L});
        when(layoutRepository.countGroupByLayoutKey()).thenReturn(counts);
        when(deptRepository.findAllById(anyList()))
                .thenReturn(List.of(dept("D100", "생산팀", "D10"), dept("D200", "가공팀", "D10")));

        Map<String, Object> result = service.searchLayouts(new CommWidgetLayoutRequest());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> layouts = (List<Map<String, Object>>) result.get("layouts");
        assertThat(layouts).containsExactly(
                Map.of("layoutKey", "*", "deptNm", "전사", "count", 2L, "tabCount", 0L),
                Map.of("layoutKey", "D200", "deptNm", "가공팀", "count", 3L, "tabCount", 0L),
                Map.of("layoutKey", "D100", "deptNm", "생산팀", "count", 1L, "tabCount", 0L));
    }

    @Test
    @DisplayName("기본 탭만 있는 키도 목록에 나온다(count=0) — 부서 이름도 함께 찾는다")
    void searchLayoutsWithTabOnlyKey() {
        List<Object[]> counts = new ArrayList<>();
        counts.add(new Object[] {"*", 2L});
        when(layoutRepository.countGroupByLayoutKey()).thenReturn(counts);
        List<Object[]> tabCounts = new ArrayList<>();
        tabCounts.add(new Object[] {"*", 1L});
        tabCounts.add(new Object[] {"D300", 2L});
        when(tabRepository.countGroupByLayoutKey()).thenReturn(tabCounts);
        when(deptRepository.findAllById(List.of("D300"))).thenReturn(List.of(dept("D300", "품질팀", null)));

        Map<String, Object> result = service.searchLayouts(new CommWidgetLayoutRequest());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> layouts = (List<Map<String, Object>>) result.get("layouts");
        assertThat(layouts).containsExactly(
                Map.of("layoutKey", "*", "deptNm", "전사", "count", 2L, "tabCount", 1L),
                Map.of("layoutKey", "D300", "deptNm", "품질팀", "count", 0L, "tabCount", 2L));
    }

    @Test
    @DisplayName("deleteLayout 은 그 키의 「홈」 기본 배치와 기본 탭을 한 트랜잭션(기본 탭 Writer)으로 지운다")
    void deleteLayout() {
        Map<String, Object> result = service.deleteLayout(key("D100"));

        verify(tabWriter).deleteKey("D100");
        verify(writer, never()).delete(anyString());
        assertThat(result).containsEntry("layoutKey", "D100");
    }

    @Test
    @DisplayName("부서 고르기는 코드·이름 앞부분 일치(대소문자 무시)만 남긴다")
    void searchDeptsPrefix() {
        when(deptRepository.searchByDeptKey("d1")).thenReturn(List.of(
                dept("D100", "생산팀", "D10"), dept("X200", "d1 연구팀", null), dept("X300", "품질d1", null)));

        CommWidgetLayoutRequest r = new CommWidgetLayoutRequest();
        r.setKeyword(" d1 ");
        Map<String, Object> result = service.searchDepts(r);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> depts = (List<Map<String, Object>>) result.get("depts");
        assertThat(depts).extracting(m -> m.get("deptCd")).containsExactly("D100", "X200");
        assertThat(depts.get(0)).containsEntry("deptNm", "생산팀").containsEntry("upperDeptCd", "D10");
    }

    @Test
    @DisplayName("검색어가 없으면 전체(사용 중 부서) 중 최대 50개")
    void searchDeptsAllLimited() {
        List<DeptInfo> all = new ArrayList<>();
        for (int i = 0; i < 60; i++) all.add(dept(String.format("D%03d", i), "부서" + i, null));
        when(deptRepository.searchByDeptKey(null)).thenReturn(all);

        Map<String, Object> result = service.searchDepts(new CommWidgetLayoutRequest());

        assertThat((List<?>) result.get("depts")).hasSize(50);
    }
}
