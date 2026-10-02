package com.dongkuk.dmes.mcm.widget.def;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import com.dongkuk.dmes.mcm.widget.admin.repository.WidgetUsageRepository;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.entity.SecUserWidget;
import com.dongkuk.dmes.mcm.widget.layout.entity.WidgetDefaultLayout;
import com.dongkuk.dmes.mcm.widget.layout.repository.WidgetDefaultLayoutRepository;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetLayoutWriter;
import com.dongkuk.dmes.mcm.widget.layout.service.WidgetLayoutWriter.LayoutItem;
import com.dongkuk.dmes.mcm.widget.repository.SecUserWidgetRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

/** 기본 배치 저장소·Writer, 정의 CONFIG_JSON(LONG32VARCHAR), 사용자 수 집계 쿼리 — H2 메모리(스펙 §4.1·§4.2·§5.2). */
@SpringJUnitConfig(WidgetJpaTestConfig.class)
class WidgetDefaultLayoutRepositoryJpaTest {

    @Autowired WidgetDefaultLayoutRepository layoutRepository;
    @Autowired WidgetLayoutWriter writer;
    @Autowired WidgetDefRepository defRepository;
    @Autowired WidgetUsageRepository usageRepository;
    @Autowired SecUserWidgetRepository userWidgetRepository;

    @BeforeEach
    void clean() {
        layoutRepository.deleteAllInBatch();
        defRepository.deleteAllInBatch();
        userWidgetRepository.deleteAllInBatch();
    }

    private static LayoutItem item(String instId, int x, int y, int w, int h) {
        return new LayoutItem(instId, "home.notice", x, y, w, h, "N");
    }

    @Test
    @DisplayName("키별 저장·조회(위→아래·왼→오른쪽)·키별 개수·같은 instId 로 다시 바꾸기·키 삭제")
    void saveFindReplaceDelete() {
        writer.replace("*", List.of(item("b", 12, 0, 12, 6), item("a", 0, 0, 12, 6), item("c", 0, 6, 24, 4)));
        writer.replace("D100", List.of(item("x", 0, 0, 8, 8)));

        assertThat(layoutRepository.findByLayoutKeyOrderByPosYAscPosXAsc("*"))
                .extracting(WidgetDefaultLayout::getInstId)
                .containsExactly("a", "b", "c");
        Map<String, Long> counts = new HashMap<>();
        for (Object[] row : layoutRepository.countGroupByLayoutKey()) counts.put((String) row[0], (Long) row[1]);
        assertThat(counts).containsOnly(Map.entry("*", 3L), Map.entry("D100", 1L));

        // 같은 instId(a)가 겹치는 교체 — 지운 뒤 flush 해야 PK 충돌 없이 다시 넣는다.
        writer.replace("*", List.of(new LayoutItem("a", "home.todo", 4, 2, 6, 3, "Y"), item("d", 10, 0, 6, 6)));
        assertThat(layoutRepository.findByLayoutKeyOrderByPosYAscPosXAsc("*"))
                .extracting(WidgetDefaultLayout::getInstId, WidgetDefaultLayout::getWidgetId,
                        WidgetDefaultLayout::getPosX, WidgetDefaultLayout::getPosY, WidgetDefaultLayout::getLockYn)
                .containsExactly(tuple("d", "home.notice", 10, 0, "N"), tuple("a", "home.todo", 4, 2, "Y"));
        assertThat(layoutRepository.findByLayoutKeyOrderByPosYAscPosXAsc("D100")).hasSize(1);

        writer.delete("D100");
        assertThat(layoutRepository.findByLayoutKeyOrderByPosYAscPosXAsc("D100")).isEmpty();
        assertThat(layoutRepository.findByLayoutKeyOrderByPosYAscPosXAsc("*")).hasSize(2);
        writer.delete("NONE"); // 없는 키는 아무것도 하지 않는다
        assertThat(layoutRepository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("정의 CONFIG_JSON 은 LONG32VARCHAR 라 4000자를 넘는 값(5,000자)을 그대로 저장·조회한다")
    void longConfigJson() {
        String text = "가".repeat(4980);
        String json = "{\"markdown\":\"" + text + "\"}";
        assertThat(json.length()).isGreaterThan(4000);
        WidgetDef def = new WidgetDef();
        def.setWidgetId("def.k3x9q2ab");
        def.setSrcTp(WidgetDef.SRC_DEF);
        def.setTypeId("markdown");
        def.setTitle("긴 글");
        def.setUseYn("Y");
        def.setConfigJson(json);
        defRepository.saveAndFlush(def);

        WidgetDef read = defRepository.findById("def.k3x9q2ab").orElseThrow();
        assertThat(read.getConfigJson()).isEqualTo(json);
        assertThat(read.getCreatedAt()).isNotNull();
    }

    @Test
    @DisplayName("사용자 수 집계는 위젯별 DISTINCT 사용자 수(한 사용자가 여러 탭에 놓아도 1)")
    void usageCounts() {
        userWidgetRepository.saveAll(List.of(
                userWidget("userA", "home", "i1", "home.notice"),
                userWidget("userA", "tab-1", "i2", "home.notice"),
                userWidget("userB", "home", "i1", "home.notice"),
                userWidget("userB", "home", "i2", "def.k3x9q2ab")));

        Map<String, Long> usage = new HashMap<>();
        for (Object[] row : usageRepository.countUsersByWidget()) usage.put((String) row[0], (Long) row[1]);
        assertThat(usage).containsOnly(Map.entry("home.notice", 2L), Map.entry("def.k3x9q2ab", 1L));
        assertThat(usageRepository.countUsers("home.notice")).isEqualTo(2L);
        assertThat(usageRepository.countUsers("def.none")).isZero();
    }

    private static SecUserWidget userWidget(String userId, String tabId, String instId, String widgetId) {
        SecUserWidget w = new SecUserWidget();
        w.setUserId(userId);
        w.setTabId(tabId);
        w.setInstId(instId);
        w.setWidgetId(widgetId);
        w.setPosX(0);
        w.setPosY(0);
        w.setSizeW(6);
        w.setSizeH(6);
        w.setLockYn("N");
        return w;
    }
}
