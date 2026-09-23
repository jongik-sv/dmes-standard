# mdm-embedding-bench — 용어 임베딩 PoC (TSK-02-02)

KURE-v1 ONNX INT8 을 ONNX Runtime Java(CPU)로 돌려 용어 1만 건 기준 인코딩·질의 시간과 저장 방식 비용을 잰다.
결정은 `docs/mdm/tasks/TSK-02-02/design.md` §6.8~§6.10, 요약 수치는 [results/README.md](results/README.md).

- 독립 Gradle 프로젝트다. `src/backend` composite build·`testAll` 에 넣지 않는다.
- ONNX Runtime·토크나이저 의존은 여기에만 있다. `maru-mdm-engine` 에 넣지 않는다(TRD §10).
- 모델 파일(약 568 MB)은 저장소에 넣지 않는다. 받아서 `MODEL_DIR` 로 가리킨다.

## 모델 받기

```bash
MODEL_DIR=/path/to/scratch/kure-onnx; mkdir -p "$MODEL_DIR"; cd "$MODEL_DIR"
R=https://huggingface.co/thkmon/KURE-v1-onnx-int8/resolve/118dcc12c125320225de077e57a9f367ce8f6407
for f in model.onnx tokenizer.json tokenizer_config.json special_tokens_map.json config.json; do curl -sL -o $f $R/$f; done
shasum -a 256 model.onnx   # 1808718e3d54308c8d7bf67fbad5632e08e44b029653e3e31cdd7ed0180d171b
```

## 빌드·실행

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
src/backend/gradlew -p poc/mdm-embedding-bench installDist --no-daemon     # 리포 루트에서
B=poc/mdm-embedding-bench/build/install/mdm-embedding-bench/bin/mdm-embedding-bench
export MODEL_DIR=...
$B info                                   # 그래프 입출력·토큰화 확인
$B tokens                                 # 코퍼스 토큰 길이 분포
$B single threads=4 n=200                 # 콜드 로드·단건 인코딩
$B batch threads=4 batch=1 limit=10000 save=$SCRATCH/vectors   # 1만 건 일괄(약 8분)
JAVA_OPTS=-Xmx6g $B scan sizes=10000,100000,1000000 q=100       # 전수 비교 규모별
$B query threads=4 vectors=$SCRATCH/vectors n=200               # 질의 = 인코딩 + 전수 비교
$B sqlite vectors=$SCRATCH/vectors db=$SCRATCH/probe.db         # SQLite BLOB 왕복
$B pooling threads=4 vectors=$SCRATCH/vectors                   # CLS vs mean 정성 확인
```

zsh 에서 인자 묶음을 변수로 넘길 때는 `${=cfg}` 로 펼친다(zsh 는 따옴표 없는 변수를 쪼개지 않는다).

## 파일

| 파일 | 내용 |
|---|---|
| `TermCorpus.java` | 합성 용어 1만 건(시드 고정)과 인코딩 입력 형식 `"{표기}: {정의} ({영문명})"` |
| `KureEncoder.java` | 토크나이저 + ORT 세션, CLS·masked mean 풀링과 L2 정규화 |
| `Bench.java` | 측정 모드 8종 |
| `results/raw-*.txt` | 원시 출력 |
