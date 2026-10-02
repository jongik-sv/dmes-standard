package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.domain.DefaultDomainValidator;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import org.junit.jupiter.api.Test;

/** spec 2026-10-02-mdm-meta-cache-design §5.1 — cactus-core 가 엔진을 api 의존으로 문다(업무 모듈이 엔진 spi·검증기를 쓴다). */
class MdmEngineDependencyTest {

    @Test
    void 엔진_spi_와_검증기가_cactus_core_클래스패스에_있다() {
        assertThat(DefinitionLookup.class.getPackageName()).isEqualTo("kr.dongkuk.maru.mdm.engine.spi");
        assertThat(CodeLookup.class).isInterface();
        assertThat(DefaultDomainValidator.class).isNotNull();
        assertThat(DefaultCodeResolver.class).isNotNull();
    }
}
