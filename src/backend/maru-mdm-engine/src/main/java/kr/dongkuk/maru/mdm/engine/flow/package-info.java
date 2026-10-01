/**
 * 룰 세트 흐름 구조 해석(룰 세트 흐름도 spec §3, plan C2·C3). 흐름 정의({@code spi.DefinitionLookup.FlowDefinition})를
 * 구조 검사한 뒤 블록 트리({@link kr.dongkuk.maru.mdm.engine.flow.Seq}·{@link kr.dongkuk.maru.mdm.engine.flow.Split})로 바꾸고
 * 노드 사이 관계를 답한다. {@code spi} 만 본다 — 식을 평가하지 않는다. 엔진 {@code rule}(실행)과 mdm 분석기(정적 검사)가 쓴다.
 * 받는 노드(CATCH)는 붙은 단계(RULE·TASK)와 함께 {@link kr.dongkuk.maru.mdm.engine.flow.Guarded} 한 칸이 된다(받는 노드 spec §3).
 * IF 와 처리 갈래는 합류(MERGE) 없이 모이는 자리·돌아오는 자리로 바로 가고, 해석이 그 자리를 줄기에서 계산한다(implicit-join spec §2, D-136).
 * 옛 형식(IF·받는 노드가 붙은 노드를 가리키는 MERGE)도 그대로 받는다. MERGE 는 새 형식에서 병렬 합류에만 쓴다.
 * m-mdm {@code pages/dme/ruleSetEdit/flow-model.ts} 가 같은 알고리즘·문구를 갖고 {@code rule-set-corpus.json} 이 동치를 고정한다.
 */
package kr.dongkuk.maru.mdm.engine.flow;
