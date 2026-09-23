package com.dongkuk.dmes.mdm.dma.naming;

/** 분해에 쓰는 용어 한 건(TB_MDM_TERM 의 필요한 칸만). synonymsJson·aliasesJson 은 DB 의 JSON 텍스트 그대로다. */
public record TermEntry(Long termId, String termName, int senseNo, String definition, String context,
                        String engName, String engAbbr, String synonymsJson, String aliasesJson) {
}
