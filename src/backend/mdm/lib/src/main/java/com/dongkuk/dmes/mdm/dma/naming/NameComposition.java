package com.dongkuk.dmes.mdm.dma.naming;

import java.util.List;

/** 분해·역분해 결과. placeholder 는 {@code ***} 자리가 하나라도 있는지다. */
public record NameComposition(Direction direction, String input, List<NameToken> tokens, String logicalName,
                              String physName, boolean placeholder) {
}
