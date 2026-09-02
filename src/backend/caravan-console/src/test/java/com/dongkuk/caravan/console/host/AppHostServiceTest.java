package com.dongkuk.caravan.console.host;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.caravan.console.config.ConsoleProperties;
import com.dongkuk.caravan.console.host.dto.AppHostResponse;
import com.dongkuk.caravan.console.host.dto.AppHostSearchRequest;
import com.dongkuk.caravan.console.host.exception.RemoteHostException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

/**
 * AppHostService(OASIS 진입 빈) 단위 테스트 — Repository + ConsoleProperties + AppHostCommandService mock.
 * 쓰기 C/U/D 분기 자체는 {@link AppHostCommandServiceTest} 가 검증한다.
 */
class AppHostServiceTest {

    private AppHostJpaRepository repository;
    private AppHostCommandService commandService;
    private AppHostService service;

    @BeforeEach
    void setUp() {
        repository = mock(AppHostJpaRepository.class);
        commandService = mock(AppHostCommandService.class);
        ConsoleProperties props = new ConsoleProperties("p", new ConsoleProperties.Message(200), new ConsoleProperties.Kafka("localhost:9092"));
        service = new AppHostService(repository, props, commandService);
    }

    @Test
    void getHostUrl_found_returns_url() {
        when(repository.findByWorksCdOrderByAppHostId("p")).thenReturn(List.of(
                AppHostEntity.builder().appHostId("mpn").worksCd("p")
                        .appHostUrl("http://localhost:8081").build()));

        String url = service.getHostUrl("mpn");

        assertThat(url).isEqualTo("http://localhost:8081");
    }

    @Test
    void getHostUrl_case_insensitive() {
        // APP_HOST_ID 는 대문자 HUB1, 조회는 소문자 hub1 — casing 무관 매칭(C-6).
        when(repository.findByWorksCdOrderByAppHostId("p")).thenReturn(List.of(
                AppHostEntity.builder().appHostId("HUB1").worksCd("p")
                        .appHostUrl("http://localhost:8200").build()));

        assertThat(service.getHostUrl("hub1")).isEqualTo("http://localhost:8200");
        assertThat(service.getHostUrl("Hub1")).isEqualTo("http://localhost:8200");
    }

    @Test
    void getHostUrl_not_found_throws_RemoteHostException() {
        when(repository.findByWorksCdOrderByAppHostId("p")).thenReturn(List.of());

        assertThatThrownBy(() -> service.getHostUrl("unknown"))
                .isInstanceOf(RemoteHostException.class)
                .hasMessageContaining("호스트 미등록")
                .hasMessageContaining("unknown")
                .hasMessageContaining("p");
    }

    @Test
    void getHostUrlMap_returns_bizSystem_to_url_mapping() {
        when(repository.findByWorksCdOrderByAppHostId("p")).thenReturn(List.of(
                AppHostEntity.builder().appHostId("mcm").worksCd("p").appHostUrl("http://localhost:8080").build(),
                AppHostEntity.builder().appHostId("mls").worksCd("p").appHostUrl("http://localhost:8084").build(),
                AppHostEntity.builder().appHostId("mpn").worksCd("p").appHostUrl("http://localhost:8081").build()
        ));

        Map<String, String> map = service.getHostUrlMap();

        assertThat(map).containsEntry("mcm", "http://localhost:8080");
        assertThat(map).containsEntry("mls", "http://localhost:8084");
        assertThat(map).containsEntry("mpn", "http://localhost:8081");
        assertThat(map).hasSize(3);
    }

    @Test
    void getHostUrlMap_case_insensitive_lookup() {
        // APP_HOST_ID 대문자 HUB1 → 소문자/혼합 casing 으로도 조회되어야 함(C-6).
        when(repository.findByWorksCdOrderByAppHostId("p")).thenReturn(List.of(
                AppHostEntity.builder().appHostId("HUB1").worksCd("p")
                        .appHostUrl("http://localhost:8200").build()));

        Map<String, String> map = service.getHostUrlMap();

        assertThat(map.containsKey("hub1")).isTrue();
        assertThat(map.get("hub1")).isEqualTo("http://localhost:8200");
        assertThat(map.get("HUB1")).isEqualTo("http://localhost:8200");
    }

    @Test
    void getAllHostsByWorks_uses_console_works_code() {
        when(repository.findByWorksCdOrderByAppHostId("p")).thenReturn(List.of(
                AppHostEntity.builder().appHostId("mcm").worksCd("p").build()
        ));

        List<AppHostEntity> hosts = service.getAllHostsByWorks();

        assertThat(hosts).hasSize(1);
        verify(repository).findByWorksCdOrderByAppHostId("p");
    }

    @SuppressWarnings("unchecked")
    @Test
    void search_returns_map_with_list_and_cnt() {
        when(repository.findAll(any(Specification.class), any(Sort.class))).thenReturn(List.of(
                AppHostEntity.builder().appHostId("mcm").worksCd("p")
                        .appHostNm("공통관리").appHostUrl("http://localhost:8080").build()
        ));

        Map<String, Object> result = service.search(new AppHostSearchRequest());

        List<AppHostResponse> list = (List<AppHostResponse>) result.get("list");
        assertThat(list).hasSize(1);
        assertThat(list.get(0).getAppHostId()).isEqualTo("mcm");
        assertThat(list.get(0).getWorksCd()).isEqualTo("p");
        assertThat(result.get("cnt")).isEqualTo(1);
    }

    @SuppressWarnings("unchecked")
    @Test
    void save_delegates_to_command_then_requeries() {
        var master = List.<Map<String, Object>>of(Map.of(
                "rowStatus", "C", "appHostId", "mqc", "worksCd", "p",
                "appHostNm", "품질관리", "appHostUrl", "http://localhost:8083"));
        when(commandService.applyChanges(master)).thenReturn(1);
        when(repository.findAll(any(Specification.class), any(Sort.class))).thenReturn(List.of(
                AppHostEntity.builder().appHostId("mqc").worksCd("p")
                        .appHostNm("품질관리").appHostUrl("http://localhost:8083").build()
        ));

        Map<String, Object> result = service.save(new AppHostSearchRequest(), master);

        verify(commandService).applyChanges(master);
        assertThat(result.get("cnt_save")).isEqualTo(1);
        List<AppHostResponse> list = (List<AppHostResponse>) result.get("list");
        assertThat(list).hasSize(1);
        assertThat(list.get(0).getAppHostId()).isEqualTo("mqc");
    }
}
