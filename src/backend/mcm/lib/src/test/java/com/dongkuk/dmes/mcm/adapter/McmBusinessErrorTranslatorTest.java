package com.dongkuk.dmes.mcm.adapter;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.common.BusinessErrorTranslator;
import com.dongkuk.dmes.cactus.common.BusinessErrorTranslator.Translated;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.exception.ErrorDetail;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;

/** {@link McmBusinessErrorTranslator} — mcm-core 업무 예외를 cactus 응답 계약으로 옮기는 규칙(BE 리팩토링 2회차 F2). */
class McmBusinessErrorTranslatorTest {

    private final McmBusinessErrorTranslator translator = new McmBusinessErrorTranslator();

    @Test
    void mcm_core_업무_예외는_ErrorCode_코드와_같은_칸의_행_상세로_옮긴다() {
        BusinessException be = new BusinessException(ErrorCode.REQUIRED_VALUE, "입력값을 확인해주세요.", List.of(
                ErrorDetail.ofGrid("master", "r1", 0, "masterCode", "E001", "코드ID를 입력해 주십시오."),
                ErrorDetail.of("E003", "중복")));

        Translated t = translator.translate(be);

        assertThat(t.code()).isEqualTo("E001");
        assertThat(t.errors()).containsExactly(
                new com.dongkuk.dmes.cactus.web.response.ErrorDetail("master", "r1", 0, "masterCode", "E001", "코드ID를 입력해 주십시오."),
                new com.dongkuk.dmes.cactus.web.response.ErrorDetail(null, null, null, null, "E003", "중복"));
    }

    @Test
    void 행_상세가_없으면_코드만_옮긴다() {
        Translated t = translator.translate(new BusinessException(ErrorCode.DUPLICATE_DATA, "중복 데이터"));

        assertThat(t.code()).isEqualTo("E003");
        assertThat(t.errors()).isNull();
    }

    @Test
    void 행_상세의_null_원소는_null_로_둔다() {
        BusinessException be = new BusinessException(ErrorCode.INVALID_VALUE, "x",
                Arrays.asList(null, ErrorDetail.of("E002", "y")));

        assertThat(translator.translate(be).errors()).containsExactly(
                null, new com.dongkuk.dmes.cactus.web.response.ErrorDetail(null, null, null, null, "E002", "y"));
    }

    @Test
    void mcm_core_업무_예외가_아니면_null_이다() {
        assertThat(translator.translate(new IllegalStateException("x"))).isNull();
        assertThat(translator.translate(new com.dongkuk.dmes.cactus.common.BusinessException(
                com.dongkuk.dmes.cactus.common.ErrorCode.REQUIRED_VALUE))).isNull();
        // 원인은 보지 않는다 — 사슬은 응답 변환기가 걷는다.
        assertThat(translator.translate(new IllegalStateException("감쌈",
                new BusinessException(ErrorCode.REQUIRED_VALUE)))).isNull();
    }

    @Test
    void mcm_core_ErrorCode_는_모두_cactus_ErrorCode_에_같은_이름_같은_코드로_있다() {
        for (ErrorCode mcm : ErrorCode.values()) {
            com.dongkuk.dmes.cactus.common.ErrorCode cactus = com.dongkuk.dmes.cactus.common.ErrorCode.valueOf(mcm.name());
            assertThat(cactus.getCode()).as(mcm.name()).isEqualTo(mcm.getCode());
            assertThat(cactus.getHttpStatus()).as(mcm.name()).isEqualTo(mcm.getHttpStatus());
        }
    }

    /** mcm 앱의 {@code @ComponentScan("com.dongkuk.dmes.mcm")} 이 이 클래스를 빈 후보로 찾는다 — 다른 어댑터를 띄우지 않고 후보만 본다. */
    @Test
    void adapter_패키지_컴포넌트_스캔_후보에_BusinessErrorTranslator_구현이_있다() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(true);
        List<String> found = scanner.findCandidateComponents("com.dongkuk.dmes.mcm.adapter").stream()
                .map(BeanDefinition::getBeanClassName)
                .filter(name -> {
                    try {
                        return BusinessErrorTranslator.class.isAssignableFrom(Class.forName(name));
                    } catch (ClassNotFoundException e) {
                        throw new IllegalStateException(e);
                    }
                })
                .toList();
        assertThat(found).containsExactly(McmBusinessErrorTranslator.class.getName());
    }
}
