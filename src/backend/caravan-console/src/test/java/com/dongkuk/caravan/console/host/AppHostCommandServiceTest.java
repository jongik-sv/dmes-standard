package com.dongkuk.caravan.console.host;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * AppHostCommandService 단위 테스트 — rowStatus C/U/D 일괄 쓰기 분기.
 * (As-Is AppHostService.saveHosts 의 분기 검증을 이관. 키는 가이드 §8-5 표준 {@code rowStatus}.)
 */
class AppHostCommandServiceTest {

    private AppHostJpaRepository repository;
    private AppHostCommandService service;

    @BeforeEach
    void setUp() {
        repository = mock(AppHostJpaRepository.class);
        service = new AppHostCommandService(repository);
    }

    @Test
    void applyChanges_create_calls_save() {
        var master = List.<Map<String, Object>>of(Map.of(
                "rowStatus", "C",
                "appHostId", "mqc",
                "worksCd", "p",
                "appHostNm", "품질관리",
                "appHostUrl", "http://localhost:8083"
        ));

        int cnt = service.applyChanges(master);

        verify(repository, times(1)).save(any(AppHostEntity.class));
        assertThat(cnt).isEqualTo(1);
    }

    @Test
    void applyChanges_update_calls_findById_then_save() {
        AppHostEntity existing = AppHostEntity.builder()
                .appHostId("mpn").worksCd("p").appHostNm("이전이름").appHostUrl("http://old:1234")
                .build();
        when(repository.findById(eq(new AppHostId("mpn", "p")))).thenReturn(Optional.of(existing));

        var master = List.<Map<String, Object>>of(Map.of(
                "rowStatus", "U",
                "appHostId", "mpn",
                "worksCd", "p",
                "appHostNm", "공정계획",
                "appHostUrl", "http://localhost:8081"
        ));

        int cnt = service.applyChanges(master);

        verify(repository).findById(eq(new AppHostId("mpn", "p")));
        verify(repository).save(existing);
        assertThat(existing.getAppHostNm()).isEqualTo("공정계획");
        assertThat(existing.getAppHostUrl()).isEqualTo("http://localhost:8081");
        assertThat(cnt).isEqualTo(1);
    }

    @Test
    void applyChanges_delete_calls_deleteById() {
        var master = List.<Map<String, Object>>of(Map.of(
                "rowStatus", "D",
                "appHostId", "mqc",
                "worksCd", "p"
        ));

        int cnt = service.applyChanges(master);

        verify(repository).deleteById(eq(new AppHostId("mqc", "p")));
        assertThat(cnt).isEqualTo(1);
    }

    @Test
    void applyChanges_update_missing_pk_not_counted() {
        when(repository.findById(eq(new AppHostId("ghost", "p")))).thenReturn(Optional.empty());

        var master = List.<Map<String, Object>>of(Map.of(
                "rowStatus", "U",
                "appHostId", "ghost",
                "worksCd", "p",
                "appHostNm", "없는호스트",
                "appHostUrl", "http://nope:1"
        ));

        int cnt = service.applyChanges(master);

        verify(repository).findById(eq(new AppHostId("ghost", "p")));
        verify(repository, times(0)).save(any());
        assertThat(cnt).isEqualTo(0);
    }

    @Test
    void applyChanges_unknown_status_skips() {
        var master = List.<Map<String, Object>>of(Map.of(
                "rowStatus", "X",
                "appHostId", "any", "worksCd", "p"
        ));

        int cnt = service.applyChanges(master);

        verify(repository, times(0)).save(any());
        verify(repository, times(0)).deleteById(any());
        assertThat(cnt).isEqualTo(0);
    }

    @Test
    void applyChanges_create_blank_name_or_url_is_rejected_before_save() {
        var blankName = List.<Map<String, Object>>of(Map.of(
                "rowStatus", "C", "appHostId", "mqc", "worksCd", "p",
                "appHostNm", " ", "appHostUrl", "http://localhost:8083"));
        var missingUrl = List.<Map<String, Object>>of(Map.of(
                "rowStatus", "U", "appHostId", "mqc", "worksCd", "p",
                "appHostNm", "품질관리"));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.applyChanges(blankName))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("appHostNm");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.applyChanges(missingUrl))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("appHostUrl");
        verify(repository, times(0)).save(any());
    }

    @Test
    void applyChanges_null_no_op() {
        int cnt = service.applyChanges(null);

        verify(repository, times(0)).save(any());
        assertThat(cnt).isEqualTo(0);
    }

    @Test
    void applyChanges_mixed_returns_processed_count() {
        var master = List.<Map<String, Object>>of(
                Map.of("rowStatus", "C", "appHostId", "mqc", "worksCd", "p",
                        "appHostNm", "품질관리", "appHostUrl", "http://localhost:8083"),
                Map.of("rowStatus", "D", "appHostId", "old", "worksCd", "p")
        );

        int cnt = service.applyChanges(master);

        assertThat(cnt).isEqualTo(2);
    }
}
