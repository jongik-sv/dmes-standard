package com.dongkuk.dmes.mdm.dma.naming;

import java.util.List;

/**
 * 분해 토큰(design.md §6.5). seq 는 1부터, surface 는 원 입력 글자, selected 는 고른 용어(UNKNOWN 이면 null),
 * abbr 은 고른 용어 약어 또는 {@code ***}.
 */
public record NameToken(int seq, String surface, TokenStatus status, TermEntry selected, String abbr,
                        List<TermCandidate> candidates) {
}
