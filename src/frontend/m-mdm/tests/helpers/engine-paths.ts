import path from "node:path";

/**
 * TSK-03-04 design.md §3.2 — 엔진 쪽 파일 경로를 한 곳에서 정한다.
 * `m-mdm/tests/helpers/` 에서 `../../../../` 는 `src/` 다.
 */
export const ENGINE_ROOT = path.resolve(__dirname, "../../../../backend/maru-mdm-engine");
export const CORPUS_PATH = path.join(
  ENGINE_ROOT,
  "src/test/resources/kr/dongkuk/maru/mdm/engine/corpus/engine-corpus.json",
);
/** TSK-08-02 §6.6.2 — 분석 코퍼스(한 벌). Java `RuleAnalysisCorpusTest` 와 함께 읽는다. */
export const ANALYSIS_CORPUS_PATH = path.join(
  ENGINE_ROOT,
  "src/test/resources/kr/dongkuk/maru/mdm/engine/analysis/analysis-corpus.json",
);
/** TSK-08-06 §3.3 — 세트 계산 코퍼스(한 벌, mdm/lib test resources). Java `RuleSetCorpusTest` 와 함께 읽는다. */
export const RULE_SET_CORPUS_PATH = path.resolve(
  __dirname,
  "../../../../backend/mdm/lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule/rule-set-corpus.json",
);
export const JAVA_EXPR_DIR = path.join(ENGINE_ROOT, "src/main/java/kr/dongkuk/maru/mdm/engine/expr");
export const PACKAGE_ROOT = path.resolve(__dirname, "../..");
/** TSK-08-04 §2.1 — 입력 계약 코퍼스(한 벌). Java `InputContractCorpusTest` 와 함께 읽는다. */
export const INPUT_CONTRACT_CORPUS_PATH = path.join(
  ENGINE_ROOT,
  "src/test/resources/kr/dongkuk/maru/mdm/engine/contract/input-contract-corpus.json",
);
