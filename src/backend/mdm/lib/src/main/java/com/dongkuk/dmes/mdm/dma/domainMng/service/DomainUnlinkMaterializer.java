package com.dongkuk.dmes.mdm.dma.domainMng.service;

import com.dongkuk.dmes.mdm.common.dictionary.DomainChainAssembler;
import com.dongkuk.dmes.mdm.common.dictionary.DomainNode;
import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import kr.dongkuk.maru.mdm.engine.domain.EffectiveExpressions;
import org.springframework.stereotype.Component;

/**
 * 부모 연결 제거 때의 구체화(D-132). 저장된 행에 부모가 있고 초안에 부모가 없으면, 지금까지 옛 부모 체인에서 상속받던 값을
 * 초안에 복사해 제거 뒤에도 유효 정의가 같게 한다.
 *
 * <ul>
 *   <li>대체 상속 칸(길이·소수·단위·코드 참조 쌍)은 자기 값이 비어 있을 때만 옛 부모의 유효값으로 채운다.</li>
 *   <li>누적 상속 칸(표준식·비즈니스식)은 옛 부모 체인의 식과 자기 식을 {@code &&} 로 잇는다. 표준식은 MASTER 를 붙이지 않은
 *       {@link EffectiveDomainView#chainStdExpr()} 를 쓴다 — CODE 는 표준식을 두지 않는다(S03, {@code CK_TB_MDM_DOMAIN_CODE}).</li>
 * </ul>
 *
 * <p>순수 계산이다. 구체화한 뒤에도 제약(QTY 단위·FLAG 표준식 등)을 못 채우면 검사기가 해당 규칙으로 거부한다.
 * 같은 저장 행에서 다시 부르면 같은 결과를 낸다 — 검증과 저장이 같은 값을 본다.
 */
@Component
public class DomainUnlinkMaterializer {

    private final DomainChainAssembler assembler;

    public DomainUnlinkMaterializer(DomainChainAssembler assembler) {
        this.assembler = assembler;
    }

    /** @param fields 복사한 칸(DB 칼럼명). 비어 있으면 구체화하지 않았다 */
    public record Result(DomainDraft draft, List<String> fields) {}

    public Result materialize(DomainNode stored, DomainDraft d, DomainTreeSnapshot snapshot) {
        if (stored == null || stored.parentDomainId() == null || d.parentDomainId() != null) {
            return new Result(d, List.of());
        }
        EffectiveDomainView parent;
        try {
            parent = assembler.assemble(snapshot.chainRootFirst(stored.parentDomainId()));
        } catch (DomainTreeSnapshot.CycleException | IllegalArgumentException e) {
            return new Result(d, List.of());
        }
        List<String> fields = new ArrayList<>();
        Integer length = fill("LENGTH", d.length(), parent.length(), fields);
        Integer scale = fill("SCALE", d.scale(), parent.scale(), fields);
        String unit = fill("UNIT_CODE", d.unitCode(), parent.unitCode(), fields);
        String maruCodeId = d.maruCodeId();
        String cateId = d.cateId();
        if (maruCodeId == null && parent.codeRef() != null) {
            maruCodeId = parent.codeRef().maruCodeId();
            cateId = parent.codeRef().cateId();
            fields.add("MARU_CODE_ID");
            fields.add("CATE_ID");
        }
        String stdRule = join("STD_RULE", parent.chainStdExpr(), d.stdRule(), fields);
        String bizRule = join("BIZ_RULE", parent.bizExpr(), d.bizRule(), fields);
        DomainDraft out = new DomainDraft(d.domainId(), d.ver(), d.domainName(), d.stdName(), null, d.domainKind(),
                d.dataType(), length, scale, unit, maruCodeId, cateId, stdRule, bizRule, d.description(), d.testCases(),
                d.examples());
        return new Result(out, List.copyOf(fields));
    }

    private static <T> T fill(String field, T own, T inherited, List<String> fields) {
        if (own != null || inherited == null) {
            return own;
        }
        fields.add(field);
        return inherited;
    }

    private static String join(String field, String inherited, String own, List<String> fields) {
        if (inherited == null) {
            return own;
        }
        String joined = EffectiveExpressions.text(Arrays.asList(inherited, own));
        if (!Objects.equals(joined, own)) {
            fields.add(field);
        }
        return joined;
    }
}
