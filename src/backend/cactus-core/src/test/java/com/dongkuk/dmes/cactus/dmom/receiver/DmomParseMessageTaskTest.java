package com.dongkuk.dmes.cactus.dmom.receiver;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.format.DmomFormatRepository;
import com.dongkuk.dmes.cactus.dmom.format.FormatItem;
import com.dongkuk.dmes.cactus.dmom.format.FormatLayout;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DmomParseMessageTaskTest {

    private final DmomFormatRepository repository = mock(DmomFormatRepository.class);
    private final DmomParseMessageTask task = new DmomParseMessageTask(repository, new MessageParser());

    private static FormatLayout layout(FormatItem... items) {
        return new FormatLayout("FMT", BigDecimal.ONE, List.of(items));
    }

    @Test
    void parse_포맷조회_후_역파싱_위임() {
        FormatLayout layout = layout(
                new FormatItem(1, "E", "A", "A", "1", 10, 0),
                new FormatItem(2, "E", "B", "B", "1", 10, 0)
        );
        when(repository.getActiveLayout(eq("TC"), eq("IF"))).thenReturn(layout);

        Map<String, Object> result = task.parse("TC", "IF", "x|y|");

        assertThat(result).containsEntry("A", "x").containsEntry("B", "y");
    }

    @Test
    void parse_포맷부재면_DmomException() {
        when(repository.getActiveLayout(eq("TC"), eq("IF"))).thenReturn(FormatLayout.empty());

        assertThatThrownBy(() -> task.parse("TC", "IF", "x|"))
                .isInstanceOf(DmomException.class)
                .hasMessageContaining("FORMAT_LAYOUT 없음");
    }
}
