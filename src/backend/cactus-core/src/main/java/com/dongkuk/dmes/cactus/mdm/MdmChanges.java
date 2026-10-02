package com.dongkuk.dmes.cactus.mdm;

import java.util.List;

/** metaFeed search 결과 — {@code truncated} 면 limit 를 넘어 다 받지 못했다. */
public record MdmChanges(long latestSeq, List<MdmChange> items, boolean truncated) {
}
