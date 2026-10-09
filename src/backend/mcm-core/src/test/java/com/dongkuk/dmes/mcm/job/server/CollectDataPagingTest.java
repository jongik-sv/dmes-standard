package com.dongkuk.dmes.mcm.job.server;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** collectData 의 DB 와 무관한 계산(기간 경계·한도 자르기·쪽 경계 정리) — DB 없이 돈다. */
class CollectDataPagingTest {

    @Test
    @DisplayName("days — 없으면 7, 1~90 으로 자른다")
    void clampDays() {
        assertThat(CollectDataPaging.clampDays(null)).isEqualTo(7);
        assertThat(CollectDataPaging.clampDays(0)).isEqualTo(1);
        assertThat(CollectDataPaging.clampDays(-5)).isEqualTo(1);
        assertThat(CollectDataPaging.clampDays(1)).isEqualTo(1);
        assertThat(CollectDataPaging.clampDays(90)).isEqualTo(90);
        assertThat(CollectDataPaging.clampDays(91)).isEqualTo(90);
        assertThat(CollectDataPaging.clampDays(Integer.MAX_VALUE)).isEqualTo(90);
    }

    @Test
    @DisplayName("limit — 없으면 500, 1~500 으로 자른다")
    void clampLimit() {
        assertThat(CollectDataPaging.clampLimit(null)).isEqualTo(500);
        assertThat(CollectDataPaging.clampLimit(0)).isEqualTo(1);
        assertThat(CollectDataPaging.clampLimit(-1)).isEqualTo(1);
        assertThat(CollectDataPaging.clampLimit(1)).isEqualTo(1);
        assertThat(CollectDataPaging.clampLimit(500)).isEqualTo(500);
        assertThat(CollectDataPaging.clampLimit(501)).isEqualTo(500);
    }

    @Test
    @DisplayName("fromSlot — 지금에서 days 일 전의 yyyyMMddHHmm(12자), 월·연 경계를 넘는다")
    void fromSlot() {
        assertThat(CollectDataPaging.fromSlot(LocalDateTime.of(2026, 10, 9, 14, 5, 59), 7)).isEqualTo("202610021405");
        assertThat(CollectDataPaging.fromSlot(LocalDateTime.of(2026, 1, 3, 0, 0), 7)).isEqualTo("202512270000");
        assertThat(CollectDataPaging.fromSlot(LocalDateTime.of(2026, 3, 1, 23, 59), 1)).isEqualTo("202602282359");
        assertThat(CollectDataPaging.fromSlot(LocalDateTime.of(2026, 10, 9, 14, 5), 90)).hasSize(12).isEqualTo("202607111405");
    }

    @Test
    @DisplayName("isSlot — 숫자 12자만")
    void isSlot() {
        assertThat(CollectDataPaging.isSlot("202610091405")).isTrue();
        assertThat(CollectDataPaging.isSlot("20261009140")).isFalse();
        assertThat(CollectDataPaging.isSlot("2026100914055")).isFalse();
        assertThat(CollectDataPaging.isSlot("2026-10-09 14")).isFalse();
        assertThat(CollectDataPaging.isSlot("20261009140a")).isFalse();
        assertThat(CollectDataPaging.isSlot(null)).isFalse();
    }

    @Test
    @DisplayName("trim — 읽은 행이 limit 이하면 그대로, truncated=false, 다음 쪽 없음(정확히 limit 행도 같다)")
    void trimNotTruncated() {
        assertThat(CollectDataPaging.trim(List.of(), 3)).isEqualTo(new CollectDataPaging.Trim(0, false, null));
        assertThat(CollectDataPaging.trim(List.of("B", "B", "A"), 3)).isEqualTo(new CollectDataPaging.Trim(3, false, null));
        assertThat(CollectDataPaging.trim(List.of("C"), 3)).isEqualTo(new CollectDataPaging.Trim(1, false, null));
    }

    @Test
    @DisplayName("trim — limit 번째와 limit+1 번째의 SLOT 이 다르면 limit 행 그대로, 다음 쪽 기준은 마지막 행의 SLOT")
    void trimCleanBoundary() {
        // SLOT 내림차순: 9 9 8 | 7(다음 쪽 첫 행) — 마지막으로 돌려준 SLOT 8 보다 작은 쪽부터 읽으면 7 이 이어진다
        assertThat(CollectDataPaging.trim(List.of("9", "9", "8", "7"), 3)).isEqualTo(new CollectDataPaging.Trim(3, true, "8"));
    }

    @Test
    @DisplayName("trim — 경계 SLOT 이 갈리면 그 SLOT 의 읽은 행을 버리고, 다음 쪽 기준은 남은 마지막 행의 SLOT(= 버린 SLOT 보다 큼)")
    void trimSplitBoundary() {
        // 9 9 8 8 | 8 — limit 4: 4번째(8)와 5번째(8)가 같은 SLOT, 8 을 모두 버리고 SLOT < 9 로 이어 읽으면 8 이 처음부터 다시 나온다
        assertThat(CollectDataPaging.trim(List.of("9", "9", "8", "8", "8"), 4)).isEqualTo(new CollectDataPaging.Trim(2, true, "9"));
        // 5번째 행이 마지막으로 돌려줄 행과 같은 SLOT 일 때 — 9 8 | 8
        assertThat(CollectDataPaging.trim(List.of("9", "8", "8"), 2)).isEqualTo(new CollectDataPaging.Trim(1, true, "9"));
    }

    @Test
    @DisplayName("trim — 한 회차 행이 limit 보다 많으면 버릴 행이 전부라 limit 행에서 자르고 truncated=true")
    void trimSingleSlotOverLimit() {
        assertThat(CollectDataPaging.trim(List.of("5", "5", "5"), 2)).isEqualTo(new CollectDataPaging.Trim(2, true, "5"));
        assertThat(CollectDataPaging.trim(List.of("5", "5"), 1)).isEqualTo(new CollectDataPaging.Trim(1, true, "5"));
    }
}
