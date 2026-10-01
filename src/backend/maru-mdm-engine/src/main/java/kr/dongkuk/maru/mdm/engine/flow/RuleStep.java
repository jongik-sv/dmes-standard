package kr.dongkuk.maru.mdm.engine.flow;

/** RULE 노드 하나. */
public record RuleStep(String nodeId, String ruleId) implements Step {}
