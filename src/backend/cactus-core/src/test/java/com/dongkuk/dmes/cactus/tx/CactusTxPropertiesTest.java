package com.dongkuk.dmes.cactus.tx;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link CactusTxProperties} 특성 테스트 — 프로퍼티 기본값을 고정한다.
 *
 * <p>검증기({@link CactusTxConfigValidator})·다중 TxMgr 자동설정은 managers 를 선언 순서대로 순회하므로
 * 기본 컨테이너가 삽입 순서를 지키는지 여기서 확인한다.
 */
class CactusTxPropertiesTest {

    @Test
    void managers_기본값은_삽입_순서를_지키는_LinkedHashMap이다() {
        Map<String, CactusTxProperties.TxMgrConfig> managers = new CactusTxProperties().getManagers();
        managers.put("b", new CactusTxProperties.TxMgrConfig());
        managers.put("a", new CactusTxProperties.TxMgrConfig());

        assertThat(managers).isInstanceOf(LinkedHashMap.class);
        assertThat(managers.keySet()).containsExactly("b", "a");
    }

    @Test
    void default_manager_기본값은_null이다() {
        assertThat(new CactusTxProperties().getDefaultManager()).isNull();
    }
}
