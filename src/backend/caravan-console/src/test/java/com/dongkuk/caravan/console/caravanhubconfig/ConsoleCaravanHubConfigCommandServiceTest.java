package com.dongkuk.caravan.console.caravanhubconfig;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.dongkuk.caravan.console.exception.ConsoleException;

/**
 * ConsoleCaravanHubConfigCommandService 단위 테스트 — rowStatus C/U/D 분기 + ftpPassword 마스킹 보존(Q-005)
 * + 저장 시점 검증(C-5).
 */
class ConsoleCaravanHubConfigCommandServiceTest {

    private ConsoleCaravanHubConfigJpaRepository repository;
    private ConsoleCaravanHubConfigCommandService service;

    @BeforeEach
    void setUp() {
        repository = mock(ConsoleCaravanHubConfigJpaRepository.class);
        service = new ConsoleCaravanHubConfigCommandService(repository);
    }

    /** null 을 담을 수 있는 mutable map(Map.of 는 null 불가). */
    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    // ─────────────────────────── C/U/D 분기 ───────────────────────────

    @Test
    void applyChanges_create_calls_save() {
        var master = List.of(row(
                "rowStatus", "C", "topicId", "MMCMTT01", "direction", "INBOUND",
                "integrationType", "DB", "dbSchema", "EAIUSER", "dbTableName", "IF_MMCMTT01", "useYn", "Y"));

        int cnt = service.applyChanges(master);

        verify(repository, times(1)).save(any(ConsoleCaravanHubConfigEntity.class));
        assertThat(cnt).isEqualTo(1);
    }

    @Test
    void applyChanges_update_applies_columns() {
        ConsoleCaravanHubConfigEntity existing = ConsoleCaravanHubConfigEntity.builder()
                .topicId("MMCMTT01").direction("INBOUND").integrationType("DB").useYn("Y").build();
        when(repository.findById(eq(new ConsoleCaravanHubConfigId("MMCMTT01", "INBOUND")))).thenReturn(Optional.of(existing));

        var master = List.of(row(
                "rowStatus", "U", "topicId", "MMCMTT01", "direction", "INBOUND",
                "integrationType", "HTTP", "httpUrl", "http://x", "useYn", "N"));

        int cnt = service.applyChanges(master);

        verify(repository).save(existing);
        assertThat(existing.getIntegrationType()).isEqualTo("HTTP");
        assertThat(existing.getHttpUrl()).isEqualTo("http://x");
        assertThat(existing.getUseYn()).isEqualTo("N");
        assertThat(cnt).isEqualTo(1);
    }

    @Test
    void applyChanges_update_masked_password_preserved() {
        ConsoleCaravanHubConfigEntity existing = ConsoleCaravanHubConfigEntity.builder()
                .topicId("FILE01").direction("OUTBOUND").integrationType("FILE")
                .ftpHost("h").ftpUser("u").ftpPassword("realSecret").filePath("/out").useYn("Y").build();
        when(repository.findById(eq(new ConsoleCaravanHubConfigId("FILE01", "OUTBOUND")))).thenReturn(Optional.of(existing));

        // 그리드가 돌려보낸 마스킹값 → 기존 비밀번호 보존되어야 함
        var master = List.of(row(
                "rowStatus", "U", "topicId", "FILE01", "direction", "OUTBOUND",
                "integrationType", "FILE", "ftpHost", "h2", "filePath", "/out",
                "ftpPassword", ConsoleCaravanHubConfigService.FTP_PASSWORD_MASK, "useYn", "Y"));

        service.applyChanges(master);

        assertThat(existing.getFtpHost()).isEqualTo("h2");
        assertThat(existing.getFtpPassword()).isEqualTo("realSecret");   // 마스킹 → 보존
    }

    @Test
    void applyChanges_update_new_password_set() {
        ConsoleCaravanHubConfigEntity existing = ConsoleCaravanHubConfigEntity.builder()
                .topicId("FILE01").direction("OUTBOUND").integrationType("FILE")
                .ftpHost("h").filePath("/out").ftpPassword("oldpw").useYn("Y").build();
        when(repository.findById(eq(new ConsoleCaravanHubConfigId("FILE01", "OUTBOUND")))).thenReturn(Optional.of(existing));

        var master = List.of(row(
                "rowStatus", "U", "topicId", "FILE01", "direction", "OUTBOUND",
                "integrationType", "FILE", "ftpHost", "h", "filePath", "/out",
                "ftpPassword", "newpw", "useYn", "Y"));

        service.applyChanges(master);

        assertThat(existing.getFtpPassword()).isEqualTo("newpw");
    }

    @Test
    void applyChanges_delete_calls_deleteById() {
        var master = List.of(row(
                "rowStatus", "D", "topicId", "MMCMTT01", "direction", "INBOUND"));

        int cnt = service.applyChanges(master);

        verify(repository).deleteById(eq(new ConsoleCaravanHubConfigId("MMCMTT01", "INBOUND")));
        assertThat(cnt).isEqualTo(1);
    }

    @Test
    void applyChanges_update_missing_pk_not_counted() {
        when(repository.findById(any())).thenReturn(Optional.empty());
        var master = List.of(row(
                "rowStatus", "U", "topicId", "ghost", "direction", "INBOUND", "integrationType", "DB",
                "dbSchema", "S", "dbTableName", "T", "useYn", "Y"));

        int cnt = service.applyChanges(master);

        verify(repository, times(0)).save(any());
        assertThat(cnt).isEqualTo(0);
    }

    @Test
    void applyChanges_unknown_and_null() {
        int unknown = service.applyChanges(List.of(row(
                "rowStatus", "X", "topicId", "t", "direction", "INBOUND")));
        int nullCnt = service.applyChanges(null);

        verify(repository, times(0)).save(any());
        verify(repository, times(0)).deleteById(any());
        assertThat(unknown).isEqualTo(0);
        assertThat(nullCnt).isEqualTo(0);
    }

    // ─────────────────────────── 저장 시점 검증 (C-5) ───────────────────────────

    @Test
    void validate_rejects_invalid_direction() {
        var master = List.of(row("rowStatus", "C", "topicId", "T", "direction", "BOTH",
                "integrationType", "DB", "dbSchema", "S", "dbTableName", "IF_T"));
        assertThatThrownBy(() -> service.applyChanges(master))
                .isInstanceOf(ConsoleException.class).hasMessageContaining("DIRECTION");
    }

    @Test
    void validate_rejects_invalid_type_ftp() {
        var master = List.of(row("rowStatus", "C", "topicId", "T", "direction", "OUTBOUND",
                "integrationType", "FTP"));
        assertThatThrownBy(() -> service.applyChanges(master))
                .isInstanceOf(ConsoleException.class).hasMessageContaining("INTEGRATION_TYPE");
    }

    @Test
    void validate_rejects_http_without_url() {
        var master = List.of(row("rowStatus", "C", "topicId", "T", "direction", "OUTBOUND",
                "integrationType", "HTTP", "useYn", "Y"));
        assertThatThrownBy(() -> service.applyChanges(master))
                .isInstanceOf(ConsoleException.class).hasMessageContaining("HTTP_URL");
    }

    @Test
    void validate_rejects_db_without_schema() {
        var master = List.of(row("rowStatus", "C", "topicId", "T", "direction", "INBOUND",
                "integrationType", "DB", "dbTableName", "IF_T", "useYn", "Y"));
        assertThatThrownBy(() -> service.applyChanges(master))
                .isInstanceOf(ConsoleException.class).hasMessageContaining("DB_SCHEMA");
    }

    @Test
    void validate_rejects_invalid_table_name() {
        var master = List.of(row("rowStatus", "C", "topicId", "T", "direction", "INBOUND",
                "integrationType", "DB", "dbSchema", "S", "dbTableName", "IF-T; DROP"));
        assertThatThrownBy(() -> service.applyChanges(master))
                .isInstanceOf(ConsoleException.class).hasMessageContaining("DB_TABLE_NAME");
    }

    @Test
    void validate_rejects_bad_http_headers_json() {
        var master = List.of(row("rowStatus", "C", "topicId", "T", "direction", "OUTBOUND",
                "integrationType", "HTTP", "httpUrl", "http://x", "httpHeaders", "{not-json"));
        assertThatThrownBy(() -> service.applyChanges(master))
                .isInstanceOf(ConsoleException.class).hasMessageContaining("HTTP_HEADERS");
    }

    @Test
    void validate_rejects_same_table_inbound_outbound_loop() {
        // 이미 INBOUND/DB(S.T) 가 있는 토픽에 OUTBOUND/DB(S.T) 저장 → 루프
        when(repository.findById(eq(new ConsoleCaravanHubConfigId("T", "INBOUND"))))
                .thenReturn(Optional.of(ConsoleCaravanHubConfigEntity.builder()
                        .topicId("T").direction("INBOUND").integrationType("DB")
                        .dbSchema("S").dbTableName("IF_T").build()));

        var master = List.of(row("rowStatus", "C", "topicId", "T", "direction", "OUTBOUND",
                "integrationType", "DB", "dbSchema", "S", "dbTableName", "IF_T", "useYn", "Y"));

        assertThatThrownBy(() -> service.applyChanges(master))
                .isInstanceOf(ConsoleException.class).hasMessageContaining("루프");
    }

    @Test
    void validate_allows_inbound_outbound_different_tables() {
        when(repository.findById(eq(new ConsoleCaravanHubConfigId("T", "INBOUND"))))
                .thenReturn(Optional.of(ConsoleCaravanHubConfigEntity.builder()
                        .topicId("T").direction("INBOUND").integrationType("DB")
                        .dbSchema("S").dbTableName("IF_T").build()));

        var master = List.of(row("rowStatus", "C", "topicId", "T", "direction", "OUTBOUND",
                "integrationType", "DB", "dbSchema", "S", "dbTableName", "IF_T_OUT", "useYn", "Y"));

        int cnt = service.applyChanges(master);
        assertThat(cnt).isEqualTo(1);
    }
}
