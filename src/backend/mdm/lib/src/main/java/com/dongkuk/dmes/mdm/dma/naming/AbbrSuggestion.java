package com.dongkuk.dmes.mdm.dma.naming;

import java.util.List;

/** 약어 제안(design.md §6.10). base 가 null 이면 영문명에서 약어를 만들 수 없다. */
public record AbbrSuggestion(String base, boolean baseTaken, String suggested, List<String> alternatives) {
}
