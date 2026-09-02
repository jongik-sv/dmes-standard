package com.dongkuk.dmes.mcm.security.endpoint;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link PermKey#parseBackendOasisUrl(String, String)} 단위 테스트 — BFF RBAC Phase 6-4 (BE 백스톱 복구).
 *
 * <p>BFF→BE 실제 경로(`/oasis/...`, `/{module}/oasis/...`)가 UserPermCache 와 정합하는 PermKey 로 파싱되는지 검증.
 */
class PermKeyTest {

    @Test
    @DisplayName("shape1 /oasis/{serviceId}/{action} → PermKey(default,oasis,objId,action) 소문자")
    void backend_shape1_dev() {
        assertThat(PermKey.parseBackendOasisUrl("/oasis/tcErrorList/search", "mcm"))
                .isEqualTo(new PermKey("mcm", "oasis", "tcerrorlist", "search"));
        assertThat(PermKey.parseBackendOasisUrl("/oasis/commUserMng/searchDetail", "mcm"))
                .isEqualTo(new PermKey("mcm", "oasis", "commusermng", "searchdetail"));
    }

    @Test
    @DisplayName("shape2 /{module}/oasis/{serviceId}/{action} → PermKey(module,oasis,objId,action)")
    void backend_shape2_prod() {
        assertThat(PermKey.parseBackendOasisUrl("/mcm/oasis/tcErrorList/search", "mcm"))
                .isEqualTo(new PermKey("mcm", "oasis", "tcerrorlist", "search"));
    }

    @Test
    @DisplayName("쿼리스트링 제거")
    void backend_querystring() {
        assertThat(PermKey.parseBackendOasisUrl("/oasis/tcErrorList/search?x=1&y=2", "mcm"))
                .isEqualTo(new PermKey("mcm", "oasis", "tcerrorlist", "search"));
    }

    @Test
    @DisplayName("OASIS 형태 아님 → null (auth/caravanConsole/actuator/세그먼트부족)")
    void backend_null_cases() {
        assertThat(PermKey.parseBackendOasisUrl("/api/auth/login", "mcm")).isNull();
        assertThat(PermKey.parseBackendOasisUrl("/caravanConsole/topics", "mcm")).isNull();
        assertThat(PermKey.parseBackendOasisUrl("/actuator/health", "mcm")).isNull();
        assertThat(PermKey.parseBackendOasisUrl("/oasis/onlyService", "mcm")).isNull();
        assertThat(PermKey.parseBackendOasisUrl("/service/foo", "mcm")).isNull();
        assertThat(PermKey.parseBackendOasisUrl(null, "mcm")).isNull();
    }

    @Test
    @DisplayName("shape1 인데 defaultModule 비어있으면 null (module 불명)")
    void backend_shape1_blank_default() {
        assertThat(PermKey.parseBackendOasisUrl("/oasis/tcErrorList/search", "")).isNull();
    }

    @Test
    @DisplayName("기존 parseUrl(/api/...) 회귀 — 4-seg OASIS / 3-seg 컨벤션")
    void parseUrl_regression() {
        assertThat(PermKey.parseUrl("/api/mcm/oasis/tcErrorList/search"))
                .isEqualTo(new PermKey("mcm", "oasis", "tcerrorlist", "search"));
        assertThat(PermKey.parseUrl("/api/mpn/plant/search"))
                .isEqualTo(new PermKey("mpn", "", "plant", "search"));
        assertThat(PermKey.parseUrl("/oasis/tcErrorList/search")).isNull(); // /api/ 아니면 parseUrl 은 null
    }
}
