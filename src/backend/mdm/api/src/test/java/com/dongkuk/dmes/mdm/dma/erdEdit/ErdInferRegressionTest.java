package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMeta;
import com.dongkuk.dmes.mdm.dma.erdEdit.dbmeta.ErdDbMetaReader;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.ErdHints;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.ErdRelationInferrer;
import com.dongkuk.dmes.mdm.dma.erdEdit.infer.InferredRelation;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdEvidence;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * 관계 추정기 회귀(스펙 시험 3, 단계 1 S10). MDM V1 표의 DB FK 를 정답으로 두고, FK 를 숨긴 채 칼럼명 규칙만 돌려 표 짝 정밀도·재현율을 잰다.
 * 기준은 연구 변형 x 의 표 짝 수치(0.57·0.78)다. 컬럼 짝 수치(0.43·0.69)가 아니다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class ErdInferRegressionTest extends AbstractMdmSharedDbTest {

    @Autowired ErdDbMetaReader reader;
    final ErdRelationInferrer inferrer = new ErdRelationInferrer();

    ErdDbMeta v1() {
        return ErdV1Meta.restrict(reader.read("MDMAPUSER"), ErdV1Meta.tables());
    }

    static Set<String> pairs(List<InferredRelation> rels) {
        return rels.stream().map(r -> r.childTable() + ">" + r.parentTable()).collect(Collectors.toCollection(TreeSet::new));
    }

    @Test
    void nameRuleKeepsResearchPrecisionAndRecallOnMdmV1() {
        ErdDbMeta meta = v1();
        List<ErdDbMeta.Constraint> fks = meta.constraints().stream().filter(c -> "R".equals(c.type())).toList();
        assertThat(fks).as("V1 FK 수(정답)").hasSize((int) ErdV1Meta.foreignKeyCount());
        assertThat(fks).hasSize(53);
        Set<String> truth = fks.stream().map(c -> c.table() + ">" + c.refTable()).collect(Collectors.toCollection(TreeSet::new));
        assertThat(truth).as("정답 표 짝 수").hasSize(51);

        ErdDbMeta hidden = new ErdDbMeta(meta.owner(), meta.tables(),
                meta.constraints().stream().filter(c -> !"R".equals(c.type())).toList(), meta.indexes());
        List<InferredRelation> rels = inferrer.infer(hidden, ErdHints.EMPTY);
        assertThat(rels).allSatisfy(r -> {
            assertThat(r.state()).isEqualTo("INFERRED");
            assertThat(r.evidence()).extracting(ErdEvidence::kind).containsOnly("NAME_RULE");
        });

        Set<String> predicted = pairs(rels);
        Set<String> hit = new TreeSet<>(predicted);
        hit.retainAll(truth);
        Set<String> falsePositive = new TreeSet<>(predicted);
        falsePositive.removeAll(truth);
        Set<String> missed = new TreeSet<>(truth);
        missed.removeAll(predicted);
        double precision = (double) hit.size() / predicted.size();
        double recall = (double) hit.size() / truth.size();
        String report = String.format("표 짝 예측 %d, 정답 %d, 맞음 %d, 정밀도 %.4f, 재현율 %.4f%n오탐 %s%n놓침 %s",
                predicted.size(), truth.size(), hit.size(), precision, recall, falsePositive, missed);
        System.out.println("[ErdInferRegressionTest] " + report);
        assertThat(precision).as(report).isGreaterThanOrEqualTo(0.57);
        assertThat(recall).as(report).isGreaterThanOrEqualTo(0.78);
    }

    /** 완료 기준 "MDM FK 는 DB 상태로 들어온다". FK 마다 DB 관계가 있고, 같은 표 짝에 다른 짝의 추정 관계가 남지 않는다. */
    @Test
    void everyV1ForeignKeyComesInAsDbRelation() {
        ErdDbMeta meta = v1();
        List<InferredRelation> rels = inferrer.infer(meta, ErdHints.EMPTY);
        for (ErdDbMeta.Constraint fk : meta.constraints().stream().filter(c -> "R".equals(c.type())).toList()) {
            assertThat(rels).as(fk.name()).anySatisfy(r -> {
                assertThat(r.state()).isEqualTo("DB");
                assertThat(r.evidence()).contains(new ErdEvidence("DB_FK", fk.name()));
                assertThat(r.childTable()).isEqualTo(fk.table());
                assertThat(r.childColumns()).isEqualTo(fk.columns());
                assertThat(r.parentTable()).isEqualTo(fk.refTable());
                assertThat(r.parentColumns()).isEqualTo(fk.refColumns());
            });
        }
        Set<String> dbPairs = pairs(rels.stream().filter(r -> "DB".equals(r.state())).toList());
        assertThat(pairs(rels.stream().filter(r -> "INFERRED".equals(r.state())).toList())).doesNotContainAnyElementsOf(dbPairs);
        assertThat(rels).filteredOn(r -> "DB".equals(r.state())).allMatch(r -> r.candidateRank() == null);
    }
}
