package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.naming.NameComposition;
import com.dongkuk.dmes.mdm.dma.naming.NameToken;
import com.dongkuk.dmes.mdm.dma.naming.TokenStatus;
import com.fasterxml.jackson.databind.node.ArrayNode;

/** 논리명으로 물리명·도메인을 채운다. 후보가 하나일 때만 채우고, 아니면 NEEDS_CHOICE(스펙 4.1). */
record ErdColumnFill(String phys, Long domainId) {

    static ErdColumnFill fromLogical(ErdNaming naming, Ctx c, String logical, String id) {
        if (logical == null || logical.isBlank()) {
            throw c.invalid("물리명과 논리명이 모두 없습니다", "logical 또는 phys 를 넣으세요", id, "phys");
        }
        NameComposition nc = naming.forward(logical).orElseThrow(() ->
                c.invalid("사전 판정을 쓸 수 없습니다", "phys 를 직접 넣으세요", id, "phys"));
        boolean single = !nc.placeholder() && nc.tokens().stream()
                .allMatch(t -> t.status() == TokenStatus.MATCHED || t.status() == TokenStatus.SYNONYM);
        if (!single) {
            ArrayNode choices = ErdModelCodec.MAPPER.createArrayNode();
            for (NameToken t : nc.tokens()) {
                var o = choices.addObject().put("seq", t.seq()).put("surface", t.surface()).put("status", t.status().name());
                var cands = o.putArray("candidates");
                if (t.candidates() != null) {
                    t.candidates().forEach(cd -> cands.addObject()
                            .put("termId", cd.term().termId())
                            .put("termName", cd.term().termName())
                            .put("senseNo", cd.term().senseNo())
                            .put("engAbbr", cd.term().engAbbr())
                            .put("via", String.valueOf(cd.via())));
                }
            }
            throw c.needsChoice(id, "phys", "논리명 '" + logical + "' 의 물리명을 하나로 정할 수 없습니다",
                    "choices 에서 토막별 약어를 골라 phys 를 직접 넣으세요", choices);
        }
        Long domainId = naming.recommendDomain(nc.physName()).map(ErdDomainSpec::domainId).orElse(null);
        return new ErdColumnFill(nc.physName(), domainId);
    }
}
