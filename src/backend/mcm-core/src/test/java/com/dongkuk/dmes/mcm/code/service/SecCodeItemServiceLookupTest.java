package com.dongkuk.dmes.mcm.code.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.code.entity.SecCodeGroup;
import com.dongkuk.dmes.mcm.code.entity.SecCodeItem;
import com.dongkuk.dmes.mcm.code.entity.SecCodeItemId;
import com.dongkuk.dmes.mcm.code.repository.SecCodeGroupRepository;
import com.dongkuk.dmes.mcm.code.repository.SecCodeItemRepository;
import org.springframework.data.domain.Pageable;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** QueryCodeLookup 구현(맞춤 레포트·위젯 조건의 codeGroup 확인) — 60초 보관·그룹 200개 상한·그룹 존재 판정. */
class SecCodeItemServiceLookupTest {

    private static final class MutableClock extends Clock {
        Instant now = Instant.parse("2026-10-10T00:00:00Z");

        public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(java.time.ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }

    private static SecCodeItem item(String group, String code) {
        SecCodeItem i = new SecCodeItem();
        i.setId(new SecCodeItemId(group, code));
        return i;
    }

    @Test
    @DisplayName("items: 활성 항목 코드를 60초 보관하고, 빈 결과는 보관하지 않으며, 그룹 이름이 이상하면 읽지 않는다")
    void itemsCache() {
        SecCodeItemRepository items = mock(SecCodeItemRepository.class);
        MutableClock clock = new MutableClock();
        SecCodeItemService service = new SecCodeItemService(items, mock(SecCodeGroupRepository.class), clock);
        when(items.findActiveItemCds(eq("G1"), any(Pageable.class))).thenReturn(List.of("A", "B"));
        when(items.findActiveItemCds(eq("EMPTY"), any(Pageable.class))).thenReturn(List.of());

        assertThat(service.items("G1")).containsExactlyInAnyOrder("A", "B");
        assertThat(service.items("G1")).hasSize(2);
        verify(items, times(1)).findActiveItemCds(eq("G1"), any(Pageable.class));
        clock.now = clock.now.plus(Duration.ofSeconds(61));
        service.items("G1");
        verify(items, times(2)).findActiveItemCds(eq("G1"), any(Pageable.class));

        assertThat(service.items("EMPTY")).isEmpty();
        service.items("EMPTY");
        verify(items, times(2)).findActiveItemCds(eq("EMPTY"), any(Pageable.class)); // 빈 결과는 보관하지 않는다

        assertThat(service.items(null)).isEmpty();
        assertThat(service.items("X".repeat(51))).isEmpty();
        verify(items, times(0)).findActiveItemCds(eq("X".repeat(51)), any(Pageable.class));
    }

    @Test
    @DisplayName("items: 보관 그룹은 200개까지 — 넘으면 보관 없이 읽기만 한다")
    void cacheBound() {
        SecCodeItemRepository items = mock(SecCodeItemRepository.class);
        SecCodeItemService service = new SecCodeItemService(items, mock(SecCodeGroupRepository.class), new MutableClock());
        for (int i = 0; i < 205; i++) {
            String group = "G" + i;
            when(items.findActiveItemCds(eq(group), any(Pageable.class))).thenReturn(List.of("A"));
            service.items(group);
        }
        service.items("G204");
        verify(items, times(2)).findActiveItemCds(eq("G204"), any(Pageable.class)); // 201번째 이후 그룹은 보관되지 않았다
        service.items("G0");
        verify(items, times(1)).findActiveItemCds(eq("G0"), any(Pageable.class));
    }

    @Test
    @DisplayName("groupExists: 그룹이 있고 USE_YN='Y' 일 때만 true")
    void groupExists() {
        SecCodeGroupRepository groups = mock(SecCodeGroupRepository.class);
        SecCodeGroup on = new SecCodeGroup();
        on.setUseYn("Y");
        SecCodeGroup off = new SecCodeGroup();
        off.setUseYn("N");
        when(groups.findById("ON")).thenReturn(Optional.of(on));
        when(groups.findById("OFF")).thenReturn(Optional.of(off));
        when(groups.findById("NONE")).thenReturn(Optional.empty());
        SecCodeItemService service = new SecCodeItemService(mock(SecCodeItemRepository.class), groups, new MutableClock());
        assertThat(service.groupExists("ON")).isTrue();
        assertThat(service.groupExists("OFF")).isFalse();
        assertThat(service.groupExists("NONE")).isFalse();
        assertThat(service.groupExists("")).isFalse();
        Set<String> none = service.items("NONE");
        assertThat(none).isEmpty();
    }

    @Test
    @DisplayName("items: 그룹 항목은 쿼리에서 5000개로 제한해 읽는다")
    void itemLimitInQuery() {
        SecCodeItemRepository items = mock(SecCodeItemRepository.class);
        SecCodeItemService service = new SecCodeItemService(items, mock(SecCodeGroupRepository.class), new MutableClock());
        when(items.findActiveItemCds(eq("BIG"), any(Pageable.class))).thenReturn(List.of("A"));
        service.items("BIG");
        org.mockito.ArgumentCaptor<Pageable> page = org.mockito.ArgumentCaptor.forClass(Pageable.class);
        verify(items).findActiveItemCds(eq("BIG"), page.capture());
        assertThat(page.getValue().getPageSize()).isEqualTo(SecCodeItemService.LOOKUP_MAX_ITEMS);
    }
}
