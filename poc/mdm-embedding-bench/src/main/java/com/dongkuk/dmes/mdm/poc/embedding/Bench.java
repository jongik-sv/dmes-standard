package com.dongkuk.dmes.mdm.poc.embedding;

import ai.onnxruntime.OrtEnvironment;
import com.dongkuk.dmes.mdm.poc.embedding.TermCorpus.Term;
import java.io.BufferedReader;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * TSK-02-02 임베딩 측정 진입점. 모드는 첫 인자, 나머지는 {@code key=value}.
 *
 * <pre>
 * info                                   그래프 입출력 이름, ORT 버전, 토크나이저 확인
 * tokens                                 코퍼스 1만 건 토큰 길이 분포(p50/p95/max)
 * single  threads=4 n=200                콜드 로드, 단건 인코딩 p50/p95(전체 입력 · 표기만)
 * batch   threads=4 batch=32 limit=10000 sort=true save=DIR
 *                                        일괄 인코딩 처리량·총시간. save 가 있으면 CLS·mean 벡터를 float32 LE 로 저장
 * scan    sizes=10000,100000 q=200       무작위 단위 벡터 전수 내적 + top-5 (인코딩 제외)
 * query   threads=4 vectors=DIR n=100    질의 1건 = 인코딩 + 1만×1024 전수 코사인 (p50/p95)
 * sqlite  vectors=DIR db=FILE            SQLite BLOB 원장 칼럼 왕복(적재·전체 읽기·디코드·단건 갱신)
 * pooling threads=4 vectors=DIR          CLS vs masked mean 유사어 쌍 순위(정성 확인용)
 * </pre>
 *
 * 모델 폴더는 환경변수 {@code MODEL_DIR}(model.onnx·tokenizer.json). 모델은 저장소에 넣지 않는다.
 */
public final class Bench {

    static final int CORPUS = 10_000;
    static final long SEED = 20260924L;

    public static void main(String[] args) throws Exception {
        String mode = args.length > 0 ? args[0] : "info";
        Map<String, String> kv = new HashMap<>();
        for (int i = 1; i < args.length; i++) {
            String[] p = args[i].split("=", 2);
            kv.put(p[0], p.length > 1 ? p[1] : "true");
        }
        env();
        switch (mode) {
            case "info" -> info();
            case "tokens" -> tokens();
            case "single" -> single(intv(kv, "threads", 4), intv(kv, "n", 200));
            case "batch" -> batch(intv(kv, "threads", 4), intv(kv, "batch", 32), intv(kv, "limit", CORPUS),
                    Boolean.parseBoolean(kv.getOrDefault("sort", "true")), kv.get("save"));
            case "scan" -> scan(kv.getOrDefault("sizes", "10000,100000"), intv(kv, "q", 200));
            case "query" -> query(intv(kv, "threads", 4), Path.of(kv.get("vectors")), intv(kv, "n", 100));
            case "sqlite" -> sqlite(Path.of(kv.get("vectors")), Path.of(kv.get("db")));
            case "pooling" -> pooling(intv(kv, "threads", 4), Path.of(kv.get("vectors")));
            default -> throw new IllegalArgumentException("모드: " + mode);
        }
    }

    // ---------------------------------------------------------------- 모드

    static void info() throws Exception {
        try (KureEncoder enc = new KureEncoder(modelDir(), 4)) {
            out("inputs", enc.inputs().toString());
            out("outputs", enc.outputs().toString());
            String s = "코일 두께: 대상의 두꺼운 정도 (Coil Thickness)";
            out("tokens(sample)", Arrays.toString(enc.tokenizer().encode(s).getTokens()));
            out("ids(sample)", Arrays.toString(enc.tokenizer().encode(s).getIds()));
            float[] v = enc.encodeCls(s);
            double n = 0;
            for (float x : v) {
                n += x * x;
            }
            out("dim", String.valueOf(v.length));
            out("l2norm", String.format("%.6f", Math.sqrt(n)));
        }
    }

    static void tokens() throws Exception {
        List<Term> terms = TermCorpus.generate(CORPUS, SEED);
        try (KureEncoder enc = new KureEncoder(modelDir(), 1)) {
            int[] full = new int[terms.size()];
            int[] name = new int[terms.size()];
            int[] chars = new int[terms.size()];
            for (int i = 0; i < terms.size(); i++) {
                String in = TermCorpus.encodeInput(terms.get(i));
                full[i] = enc.tokenCount(in);
                name[i] = enc.tokenCount(terms.get(i).name());
                chars[i] = in.length();
            }
            out("corpus.size", String.valueOf(terms.size()));
            out("tokens.full", dist(full));
            out("tokens.nameOnly", dist(name));
            out("chars.full", dist(chars));
            for (int i = 0; i < 3; i++) {
                out("sample." + i, TermCorpus.encodeInput(terms.get(i * 3333)));
            }
        }
    }

    static void single(int threads, int n) throws Exception {
        List<Term> terms = TermCorpus.generate(CORPUS, SEED);
        out("rss.beforeLoad.MB", rssMb());
        long t0 = System.nanoTime();
        try (KureEncoder enc = new KureEncoder(modelDir(), threads)) {
            long t1 = System.nanoTime();
            enc.encodeCls("코일 두께");
            long t2 = System.nanoTime();
            out("coldLoad.sessionAndTokenizer.ms", ms(t1 - t0));
            out("coldLoad.firstInference.ms", ms(t2 - t1));
            out("rss.afterLoad.MB", rssMb());
            Random rnd = new Random(7);
            for (int i = 0; i < 20; i++) {   // 워밍업
                enc.encodeCls(TermCorpus.encodeInput(terms.get(rnd.nextInt(terms.size()))));
            }
            double[] full = new double[n];
            double[] name = new double[n];
            for (int i = 0; i < n; i++) {
                Term t = terms.get(rnd.nextInt(terms.size()));
                long a = System.nanoTime();
                enc.encodeCls(TermCorpus.encodeInput(t));
                long b = System.nanoTime();
                enc.encodeCls(t.name());
                long c = System.nanoTime();
                full[i] = (b - a) / 1e6;
                name[i] = (c - b) / 1e6;
            }
            out("threads", String.valueOf(threads));
            out("single.fullInput.ms", pct(full));
            out("single.nameOnly.ms", pct(name));
            out("rss.afterSingle.MB", rssMb());
        }
    }

    static void batch(int threads, int batch, int limit, boolean sort, String save) throws Exception {
        List<Term> terms = TermCorpus.generate(CORPUS, SEED).subList(0, limit);
        try (KureEncoder enc = new KureEncoder(modelDir(), threads)) {
            enc.encodeCls("워밍업");
            List<Integer> order = new ArrayList<>();
            for (int i = 0; i < terms.size(); i++) {
                order.add(i);
            }
            if (sort) {   // 길이순으로 묶으면 배치 안 패딩이 줄어든다
                int[] len = new int[terms.size()];
                for (int i = 0; i < terms.size(); i++) {
                    len[i] = enc.tokenCount(TermCorpus.encodeInput(terms.get(i)));
                }
                order.sort(Comparator.comparingInt(i -> len[i]));
            }
            float[][] cls = new float[terms.size()][];
            float[][] mean = new float[terms.size()][];
            long rssPeak = 0;
            long t0 = System.nanoTime();
            for (int s = 0; s < order.size(); s += batch) {
                List<Integer> idx = order.subList(s, Math.min(order.size(), s + batch));
                List<String> texts = new ArrayList<>(idx.size());
                for (int i : idx) {
                    texts.add(TermCorpus.encodeInput(terms.get(i)));
                }
                KureEncoder.Pooled[] p = enc.encode(texts);
                for (int k = 0; k < idx.size(); k++) {
                    cls[idx.get(k)] = p[k].cls();
                    mean[idx.get(k)] = p[k].mean();
                }
                if ((s / batch) % 20 == 0) {
                    rssPeak = Math.max(rssPeak, Long.parseLong(rssMb()));
                }
            }
            long t1 = System.nanoTime();
            double sec = (t1 - t0) / 1e9;
            out("batch.params", "threads=" + threads + " batch=" + batch + " limit=" + limit + " sortByLength=" + sort);
            out("batch.total.s", String.format("%.1f", sec));
            out("batch.throughput.termsPerSec", String.format("%.1f", terms.size() / sec));
            out("batch.perTerm.ms", String.format("%.2f", sec * 1000 / terms.size()));
            out("batch.est10k.min", String.format("%.1f", sec / terms.size() * 10_000 / 60));
            out("rss.peakSampled.MB", String.valueOf(rssPeak));
            out("rss.afterBatch.MB", rssMb());
            if (save != null) {
                Path dir = Path.of(save);
                Files.createDirectories(dir);
                writeMatrix(dir.resolve("cls.f32"), cls);
                writeMatrix(dir.resolve("mean.f32"), mean);
                out("saved", dir.toString());
            }
        }
    }

    static void scan(String sizes, int q) {
        Random rnd = new Random(11);
        for (String sz : sizes.split(",")) {
            int n = Integer.parseInt(sz.strip());
            float[] m = new float[n * KureEncoder.DIM];   // 행 우선 연속 배열(n × 1024)
            for (int i = 0; i < n; i++) {
                float[] v = randomUnit(rnd);
                System.arraycopy(v, 0, m, i * KureEncoder.DIM, KureEncoder.DIM);
            }
            for (int w = 0; w < 5; w++) {
                topK(m, n, randomUnit(rnd), 5);
            }
            double[] t = new double[q];
            for (int i = 0; i < q; i++) {
                float[] qv = randomUnit(rnd);
                long a = System.nanoTime();
                topK(m, n, qv, 5);
                t[i] = (System.nanoTime() - a) / 1e6;
            }
            out("scan.n=" + n + ".ms", pct(t) + " matrixMB=" + (long) n * KureEncoder.DIM * 4 / (1024 * 1024));
        }
    }

    static void query(int threads, Path vectors, int n) throws Exception {
        List<Term> terms = TermCorpus.generate(CORPUS, SEED);
        float[][] cls = readMatrix(vectors.resolve("cls.f32"));
        float[] m = flatten(cls);
        try (KureEncoder enc = new KureEncoder(modelDir(), threads)) {
            Random rnd = new Random(13);
            for (int i = 0; i < 20; i++) {
                topK(m, cls.length, enc.encodeCls(terms.get(rnd.nextInt(terms.size())).name()), 5);
            }
            double[] name = new double[n];
            double[] full = new double[n];
            double[] scanOnly = new double[n];
            for (int i = 0; i < n; i++) {
                Term t = terms.get(rnd.nextInt(terms.size()));
                long a = System.nanoTime();
                topK(m, cls.length, enc.encodeCls(t.name()), 5);
                long b = System.nanoTime();
                float[] qv = enc.encodeCls(TermCorpus.encodeInput(t));
                long c = System.nanoTime();
                topK(m, cls.length, qv, 5);
                long d = System.nanoTime();
                name[i] = (b - a) / 1e6;
                full[i] = (d - b) / 1e6;
                scanOnly[i] = (d - c) / 1e6;
            }
            out("query.threads", String.valueOf(threads));
            out("query.corpus", String.valueOf(cls.length));
            out("query.nameOnly.encodePlusScan.ms", pct(name));
            out("query.fullInput.encodePlusScan.ms", pct(full));
            out("query.scanOnly.ms", pct(scanOnly));
            out("rss.query.MB", rssMb());
        }
    }

    static void sqlite(Path vectors, Path db) throws Exception {
        float[][] cls = readMatrix(vectors.resolve("cls.f32"));
        Files.deleteIfExists(db);
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + db)) {
            try (Statement st = c.createStatement()) {
                st.execute("CREATE TABLE TB_MDM_TERM_PROBE (TERM_ID INTEGER PRIMARY KEY, TERM_NAME TEXT NOT NULL,"
                        + " EMBEDDING BLOB, EMBEDDING_MODEL VARCHAR(100))");
            }
            c.setAutoCommit(false);
            long a = System.nanoTime();
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO TB_MDM_TERM_PROBE (TERM_ID, TERM_NAME, EMBEDDING, EMBEDDING_MODEL) VALUES (?,?,?,?)")) {
                for (int i = 0; i < cls.length; i++) {
                    ps.setInt(1, i + 1);
                    ps.setString(2, "용어" + i);
                    ps.setBytes(3, toBytes(cls[i]));
                    ps.setString(4, "KURE-v1:int8:cls:v1");
                    ps.addBatch();
                }
                ps.executeBatch();
            }
            c.commit();
            long b = System.nanoTime();
            float[][] back = new float[cls.length][];
            try (PreparedStatement ps = c.prepareStatement(
                    "SELECT TERM_ID, EMBEDDING FROM TB_MDM_TERM_PROBE WHERE EMBEDDING_MODEL = ?")) {
                ps.setString(1, "KURE-v1:int8:cls:v1");
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        back[rs.getInt(1) - 1] = fromBytes(rs.getBytes(2));
                    }
                }
            }
            long d = System.nanoTime();
            double[] upd = new double[100];
            try (PreparedStatement ps = c.prepareStatement(
                    "UPDATE TB_MDM_TERM_PROBE SET EMBEDDING = ?, EMBEDDING_MODEL = ? WHERE TERM_ID = ?")) {
                for (int i = 0; i < upd.length; i++) {
                    long x = System.nanoTime();
                    ps.setBytes(1, toBytes(cls[i]));
                    ps.setString(2, "KURE-v1:int8:cls:v1");
                    ps.setInt(3, i + 1);
                    ps.executeUpdate();
                    c.commit();
                    upd[i] = (System.nanoTime() - x) / 1e6;
                }
            }
            boolean same = true;
            for (int i = 0; i < cls.length && same; i++) {
                same = Arrays.equals(cls[i], back[i]);
            }
            out("sqlite.version", c.getMetaData().getDatabaseProductVersion());
            out("sqlite.insert10k.ms", ms(b - a));
            out("sqlite.selectAllAndDecode10k.ms", ms(d - b));
            out("sqlite.singleUpdateCommit.ms", pct(upd));
            out("sqlite.roundTripBitExact", String.valueOf(same));
            out("sqlite.fileMB", String.format("%.1f", Files.size(db) / 1048576.0));
        }
    }

    /** 유사어 쌍 정성 확인 — 코퍼스 1만 건에 대상 용어 15건을 섞고, 질의(표기만)로 대상의 순위를 본다. */
    static void pooling(int threads, Path vectors) throws Exception {
        String[][] pairs = {
                {"오차", "편차", "기준값에서 벗어난 정도", "Deviation"},
                {"출하예정일", "납기", "고객에게 제품을 인도하기로 약속한 날짜", "Due Date"},
                {"판두께", "두께", "대상의 두꺼운 정도", "Thickness"},
                {"수요가", "고객사", "제품을 구매하는 거래처", "Customer"},
                {"결함", "불량", "품질 기준을 충족하지 못한 상태", "Defect"},
                {"작업실적", "생산실적", "실제로 생산한 결과 수량과 시각", "Production Actual"},
                {"설비이상", "설비고장", "설비가 정상 기능을 잃은 상태", "Equipment Failure"},
                {"보유수량", "재고", "창고에 보관 중인 제품의 수량", "Inventory"},
                {"반출", "출하", "제품을 고객에게 내보내는 일", "Shipment"},
                {"재질", "강종", "화학 성분과 용도로 나눈 강의 종류", "Steel Grade"},
                {"감기온도", "권취온도", "코일을 감을 때의 스트립 온도", "Coiling Temperature"},
                {"라인휴지", "조업정지", "라인 가동을 멈춘 상태", "Line Stop"},
                {"스크랩", "폐기", "쓸 수 없어 버리는 처리", "Scrap"},
                {"입하일", "입고일자", "자재가 창고에 들어온 날짜", "Receipt Date"},
                {"조업자", "작업자", "공정을 수행하는 사람", "Operator"},
        };
        float[][] cls = readMatrix(vectors.resolve("cls.f32"));
        float[][] mean = readMatrix(vectors.resolve("mean.f32"));
        try (KureEncoder enc = new KureEncoder(modelDir(), threads)) {
            List<String> targets = new ArrayList<>();
            List<String> queries = new ArrayList<>();
            for (String[] p : pairs) {
                targets.add(TermCorpus.encodeInput(p[1], p[2], p[3]));
                queries.add(p[0]);
            }
            KureEncoder.Pooled[] t = enc.encode(targets);
            KureEncoder.Pooled[] q = enc.encode(queries);
            int n = cls.length + pairs.length;
            float[] mc = new float[n * KureEncoder.DIM];
            float[] mm = new float[n * KureEncoder.DIM];
            for (int i = 0; i < cls.length; i++) {
                System.arraycopy(cls[i], 0, mc, i * KureEncoder.DIM, KureEncoder.DIM);
                System.arraycopy(mean[i], 0, mm, i * KureEncoder.DIM, KureEncoder.DIM);
            }
            for (int i = 0; i < pairs.length; i++) {
                System.arraycopy(t[i].cls(), 0, mc, (cls.length + i) * KureEncoder.DIM, KureEncoder.DIM);
                System.arraycopy(t[i].mean(), 0, mm, (cls.length + i) * KureEncoder.DIM, KureEncoder.DIM);
            }
            int[] rc = new int[pairs.length];
            int[] rm = new int[pairs.length];
            for (int i = 0; i < pairs.length; i++) {
                rc[i] = rank(mc, n, q[i].cls(), cls.length + i);
                rm[i] = rank(mm, n, q[i].mean(), cls.length + i);
                out("pair." + pairs[i][0] + "->" + pairs[i][1], "clsRank=" + rc[i] + " meanRank=" + rm[i]);
            }
            out("pooling.cls", "top1=" + count(rc, 1) + " top5=" + count(rc, 5) + " /" + pairs.length);
            out("pooling.mean", "top1=" + count(rm, 1) + " top5=" + count(rm, 5) + " /" + pairs.length);
        }
    }

    // ---------------------------------------------------------------- 계산

    /** 전수 내적 top-k. 벡터가 L2 정규화돼 있으므로 내적 = 코사인. 반환은 행 번호(점수 내림차순). */
    static int[] topK(float[] m, int n, float[] q, int k) {
        int[] idx = new int[k];
        float[] sc = new float[k];
        Arrays.fill(sc, Float.NEGATIVE_INFINITY);
        int d = q.length;
        for (int i = 0; i < n; i++) {
            int off = i * d;
            float s = 0;
            for (int j = 0; j < d; j++) {
                s += m[off + j] * q[j];
            }
            if (s > sc[k - 1]) {
                int p = k - 1;
                while (p > 0 && sc[p - 1] < s) {
                    sc[p] = sc[p - 1];
                    idx[p] = idx[p - 1];
                    p--;
                }
                sc[p] = s;
                idx[p] = i;
            }
        }
        return idx;
    }

    static int rank(float[] m, int n, float[] q, int target) {
        int d = q.length;
        float ts = 0;
        for (int j = 0; j < d; j++) {
            ts += m[target * d + j] * q[j];
        }
        int r = 1;
        for (int i = 0; i < n; i++) {
            if (i == target) {
                continue;
            }
            float s = 0;
            for (int j = 0; j < d; j++) {
                s += m[i * d + j] * q[j];
            }
            if (s > ts) {
                r++;
            }
        }
        return r;
    }

    static float[] randomUnit(Random rnd) {
        float[] v = new float[KureEncoder.DIM];
        for (int i = 0; i < v.length; i++) {
            v[i] = (float) rnd.nextGaussian();
        }
        return KureEncoder.l2(v);
    }

    // ---------------------------------------------------------------- 입출력

    /** 원장 칼럼 형식: float32 little-endian 1024개 = 4096 바이트. */
    static byte[] toBytes(float[] v) {
        ByteBuffer bb = ByteBuffer.allocate(v.length * 4).order(ByteOrder.LITTLE_ENDIAN);
        for (float x : v) {
            bb.putFloat(x);
        }
        return bb.array();
    }

    static float[] fromBytes(byte[] b) {
        ByteBuffer bb = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN);
        float[] v = new float[b.length / 4];
        for (int i = 0; i < v.length; i++) {
            v[i] = bb.getFloat();
        }
        return v;
    }

    static void writeMatrix(Path p, float[][] m) throws IOException {
        try (DataOutputStream out = new DataOutputStream(Files.newOutputStream(p))) {
            out.writeInt(m.length);
            for (float[] v : m) {
                out.write(toBytes(v));
            }
        }
    }

    static float[][] readMatrix(Path p) throws IOException {
        try (DataInputStream in = new DataInputStream(Files.newInputStream(p))) {
            int n = in.readInt();
            float[][] m = new float[n][];
            byte[] buf = new byte[KureEncoder.DIM * 4];
            for (int i = 0; i < n; i++) {
                in.readFully(buf);
                m[i] = fromBytes(buf);
            }
            return m;
        }
    }

    static float[] flatten(float[][] m) {
        float[] f = new float[m.length * KureEncoder.DIM];
        for (int i = 0; i < m.length; i++) {
            System.arraycopy(m[i], 0, f, i * KureEncoder.DIM, KureEncoder.DIM);
        }
        return f;
    }

    // ---------------------------------------------------------------- 보고

    static void env() {
        out("env.java", System.getProperty("java.version") + " " + System.getProperty("java.vm.name"));
        out("env.os", System.getProperty("os.name") + " " + System.getProperty("os.arch"));
        out("env.cpus", String.valueOf(Runtime.getRuntime().availableProcessors()));
        out("env.ort", OrtEnvironment.getEnvironment().getVersion());
    }

    static Path modelDir() {
        String d = System.getenv("MODEL_DIR");
        if (d == null) {
            throw new IllegalStateException("MODEL_DIR 환경변수가 필요하다(model.onnx·tokenizer.json 폴더)");
        }
        return Path.of(d);
    }

    /** 프로세스 RSS(MB). ORT 는 네이티브 메모리를 쓰므로 JVM 힙이 아니라 ps 의 RSS 를 본다. */
    static String rssMb() {
        try {
            Process p = new ProcessBuilder("ps", "-o", "rss=", "-p", String.valueOf(ProcessHandle.current().pid()))
                    .start();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                return String.valueOf(Long.parseLong(r.readLine().strip()) / 1024);
            }
        } catch (IOException e) {
            return "-1";
        }
    }

    static String pct(double[] a) {
        double[] s = a.clone();
        Arrays.sort(s);
        return String.format("p50=%.2f p95=%.2f max=%.2f n=%d", s[(int) (s.length * 0.50)],
                s[Math.min(s.length - 1, (int) (s.length * 0.95))], s[s.length - 1], s.length);
    }

    static String dist(int[] a) {
        int[] s = a.clone();
        Arrays.sort(s);
        return "p50=" + s[s.length / 2] + " p95=" + s[(int) (s.length * 0.95)] + " max=" + s[s.length - 1]
                + " min=" + s[0];
    }

    static int count(int[] ranks, int k) {
        int c = 0;
        for (int r : ranks) {
            if (r <= k) {
                c++;
            }
        }
        return c;
    }

    static String ms(long nanos) {
        return String.format("%.1f", nanos / 1e6);
    }

    static int intv(Map<String, String> kv, String k, int def) {
        return kv.containsKey(k) ? Integer.parseInt(kv.get(k)) : def;
    }

    static void out(String k, String v) {
        System.out.println(k + "\t" + v);
    }
}
