/**
 * 룰 세트 흐름 구조 해석(룰 세트 흐름도 spec §3, plan C2·C3). 흐름 정의({@code spi.DefinitionLookup.FlowDefinition})를
 * 구조 검사한 뒤 블록 트리({@link kr.dongkuk.maru.mdm.engine.flow.Seq}·{@link kr.dongkuk.maru.mdm.engine.flow.Split})로 바꾸고
 * 노드 사이 관계를 답한다. {@code spi} 만 본다 — 식을 평가하지 않는다. 엔진 {@code rule}(실행)과 mdm 분석기(정적 검사)가 쓴다.
 * m-mdm {@code pages/dme/ruleSetEdit/flow-model.ts} 가 같은 알고리즘·문구를 갖고 {@code rule-set-corpus.json} 이 동치를 고정한다.
 */
package kr.dongkuk.maru.mdm.engine.flow;
