import org.gradle.api.services.BuildService
import org.gradle.api.services.BuildServiceParameters

import java.util.concurrent.TimeUnit

/**
 * 시험용 Oracle PDB 한 개를 빌드 한 번에 한 번만 복제하고 빌드가 끝나면 지우는 빌드 서비스(oracle-1007 b4).
 * dmes.test-conventions 가 켠 모듈의 Test 태스크가 시작할 때 acquire() 를 부르고, 접속값을 시스템 속성으로 넘긴다.
 *
 * 켜는 법(기본은 꺼짐 — 아무것도 하지 않는다):
 *   -Pdmes.ora.test=clone             템플릿(기본 TPL_EMPTY)에서 T_<레인> PDB 를 복제해 쓰고, 빌드가 끝나면 지운다
 *   -Pdmes.ora.template=TPL_DATA      복제 원본 템플릿(데이터까지 적재한 것)
 *   -Pdmes.ora.pdb=L_ORA_MDM          이미 있는 PDB 를 그대로 쓴다(복제·삭제 없음)
 * 같은 값을 환경 변수 DMES_ORA_TEST(clone)·DMES_ORA_TEMPLATE·DMES_ORA_PDB 로도 줄 수 있다.
 *
 * 복제·삭제는 scripts/oracle/pdb.mjs 가 한다(PC 전체 잠금·열린 PDB 상한을 거친다). 이 클래스는 node 를 부를 뿐이다.
 * PC 잠금은 복제 직전부터 빌드가 끝나 PDB 를 지울 때까지(시험 JVM 이 도는 구간 포함) `pdb.mjs lock-hold` 가 쥔다.
 * 그래서 PC 전체에서 Oracle 을 쓰는 시험 빌드는 한 번에 하나만 돈다. 기존 PDB 를 쓰는 existing 모드도 같다.
 * 잠금 주인은 node 프로세스이고 표준 입력이 닫히면(Gradle 이 죽어도) 스스로 놓는다.
 *
 * included build 마다 Gradle 이 서비스 인스턴스를 따로 만든다(sharedServices 는 빌드마다 따로다). 그래서 모듈 여러 개를 한 번에 시험하면
 * 서비스가 여러 개 생기고, 각자 lock-hold 를 잡으면 먼저 잡은 쪽이 빌드가 끝날 때까지 쥐고 있어 나머지가 영원히 기다린다(교착, 2026-10-07 21:12).
 * 이를 막으려고 같은 JVM(Gradle 데몬) 안에서는 **처음 acquire 한 서비스(주인)가 잠금·PDB 를 하나만 만들고**, 나머지는 시스템 속성
 * (dmes.ora.harness.pdb·lockpid, 문자열만)으로 그 값을 받아 쓴다. 클래스로더가 달라도 System 속성과 intern 된 문자열은 JVM 하나에 하나다.
 * 정리(drop·잠금 놓기)는 주인만 하고, 서비스는 모든 시험 태스크가 끝난 뒤에 닫히므로 이른 정리는 일어나지 않는다.
 * 멤버에 private 을 두지 않는다 — Gradle 이 서비스를 하위 클래스로 감싸 클로저에서 private 에 닿지 못한다.
 */
abstract class OraTestPdbService implements BuildService<Parameters>, AutoCloseable {
    interface Parameters extends BuildServiceParameters {
        org.gradle.api.provider.Property<String> getRepoRoot()
        org.gradle.api.provider.Property<String> getLane()
        org.gradle.api.provider.Property<String> getMode()      // clone | existing
        org.gradle.api.provider.Property<String> getTemplate()
        org.gradle.api.provider.Property<String> getPdb()       // existing 일 때 PDB 이름
    }

    static final String SHARED_PDB = 'dmes.ora.harness.pdb'
    static final String SHARED_LOCK_PID = 'dmes.ora.harness.lockpid'
    static final String SHARED_KEY = 'dmes.ora.harness.key'         // mode|template|pdb — 주인과 다른 설정을 쓰는 서비스를 가려낸다
    static final String SHARED_FAILED = 'dmes.ora.harness.failed'   // 이번 빌드에서 준비가 한 번 실패했다는 표시(같은 빌드의 다음 시도는 곧바로 실패)
    static final String TURN_OWNER = 'dmes.ora.harness.turn'        // 지금 Oracle 시험 차례를 쥔 test 태스크(키). 없으면 비어 있다
    /** JVM 하나에 하나인 감시 대상(intern 된 문자열은 클래스로더와 무관하게 같은 객체다). */
    static final Object JVM_MONITOR = 'dmes.ora.harness.monitor'.intern()

    final Set<String> turnsHeld = new LinkedHashSet<>()   // 이 서비스가 건 차례(close 가 못 푼 것을 푼다)
    String pdbName
    boolean cloned = false
    boolean ownsLock = false
    Process lockHolder = null
    long lockPid = 0

    String settingsKey() {
        return "${parameters.mode.get()}|${parameters.template.get().toUpperCase()}|${parameters.pdb.get().toUpperCase()}"
    }

    /**
     * 시험 PDB 이름을 돌려준다. 같은 JVM 에서 처음 부르는 서비스가 잠금을 잡고 복제한다(주인). 다른 included build 의 서비스는
     * 주인이 올린 PDB 를 그대로 받는다. 같은 빌드에서 준비가 한 번 실패했으면 다시 시도하지 않고 곧바로 실패한다(--continue 로
     * 모듈마다 최대 30분짜리 복제를 되풀이하지 않게).
     */
    String acquire() {
        if (pdbName != null) return pdbName
        synchronized (JVM_MONITOR) {
            if (pdbName != null) return pdbName
            String failed = System.getProperty(SHARED_FAILED)
            if (failed != null) {
                throw new org.gradle.api.GradleException("이번 빌드에서 시험 PDB 준비가 이미 실패해 다시 시도하지 않는다: ${failed}")
            }
            String shared = liveSharedPdb()
            if (shared != null) {
                String key = System.getProperty(SHARED_KEY)
                if (key != null && key != settingsKey()) {
                    throw new org.gradle.api.GradleException("같은 빌드의 다른 모듈이 다른 Oracle 시험 설정(${key})을 쓰고 있어 ${settingsKey()} 로는 함께 쓸 수 없다. 모듈별로 따로 건다.")
                }
                pdbName = shared
                System.err.println("[dmes-ora] 같은 빌드의 시험 PDB ${shared} 를 함께 쓴다(잠금·복제는 한 번만)")
                return pdbName
            }
            holdPcLock()
            try {
                String name = acquireLocked()
                ownsLock = true
                System.setProperty(SHARED_PDB, name)
                System.setProperty(SHARED_LOCK_PID, String.valueOf(lockPid))
                System.setProperty(SHARED_KEY, settingsKey())
                return name
            } catch (Exception e) {
                System.setProperty(SHARED_FAILED, String.valueOf(e.message).readLines().find { it } ?: e.class.simpleName)
                logVmState('PDB 준비 실패')
                releasePcLock()
                throw e
            }
        }
    }

    /**
     * 주인이 올린 PDB 가 유효하면 그 이름, 없으면 null. 주인이 올렸는데 잠금을 쥔 lock-hold 가 죽었으면(누가 끝냈거나 비정상 종료) 예외다:
     * 이때 새 주인이 되면 다른 모듈이 쓰는 같은 이름의 PDB 를 지우고 다시 복제하게 되므로 이 빌드에서는 더 진행하지 않는다.
     * 속성은 주인이 닫을 때 지워지므로 다음 빌드에는 남지 않는다.
     */
    static String liveSharedPdb() {
        String pdb = System.getProperty(SHARED_PDB)
        String pid = System.getProperty(SHARED_LOCK_PID)
        if (pdb == null || pid == null) return null
        boolean alive = false
        try {
            alive = ProcessHandle.of(pid as long).map { it.isAlive() }.orElse(false)
        } catch (Exception ignored) { }
        if (!alive) {
            throw new org.gradle.api.GradleException("PC Oracle 잠금을 쥔 lock-hold(pid ${pid})가 빌드 도중 끝나 시험 PDB ${pdb} 를 더 쓸 수 없다. 다른 레인이 잠금을 가져갔을 수 있으니 PDB 를 지우거나 다시 만들지 않고 멈춘다. 빌드를 다시 실행한다.")
        }
        return pdb
    }

    String acquireLocked() {
        if (parameters.mode.get() == 'existing') {
            pdbName = parameters.pdb.get().toUpperCase()
            return pdbName
        }
        String name = 'T_' + parameters.lane.get().toUpperCase().replaceAll('[^A-Z0-9_]', '_')
        if (name.length() > 28) name = name.substring(0, 28)
        // 이전 시험이 비정상 종료돼 남긴 같은 이름 PDB 가 있으면 지운다(레인 하나가 이 이름 하나를 쓴다).
        runPdb(['drop', name], 600, true)
        String cloneOut = runPdbOutput(['clone', parameters.template.get().toUpperCase(), name], 1800)
        // 자동 작업(autotask·AWR) 끄기 확인 줄만 로그에 올린다.
        cloneOut.readLines().findAll { it.contains('자동 작업') || it.contains('autotask') || it.contains('AWR') || it.contains('복제·열기') }
                .each { System.err.println("[dmes-ora] ${it.replaceFirst(/^\[pdb\]\s*/, '')}") }
        pdbName = name
        cloned = true
        return pdbName
    }

    /** PC 전체 Oracle 잠금을 쥔다(이미 쥐고 있으면 그대로). 기다리는 한도는 DMES_ORA_HARNESS_LOCK_WAIT_SEC(기본 7200초). */
    void holdPcLock() {
        if (lockHolder != null) return
        File script = new File(parameters.repoRoot.get(), 'scripts/oracle/pdb.mjs')
        if (!script.isFile()) throw new org.gradle.api.GradleException("PDB 도구가 없다: ${script}")
        long waitSec = (System.getenv('DMES_ORA_HARNESS_LOCK_WAIT_SEC') ?: '7200') as long
        Process p = new ProcessBuilder(['node', script.absolutePath, 'lock-hold', '--wait-sec', String.valueOf(waitSec)])
                .redirectErrorStream(true).start()
        // 첫 줄 "LOCKED <pid>" 가 오면 잠금을 쥔 것이다. 이후 출력은 버린다(파이프가 막히지 않게 읽는다).
        def first = new java.util.concurrent.LinkedBlockingQueue<String>()
        Thread.start {
            String last = ''
            try {
                p.inputStream.eachLine { String l ->
                    if (l.startsWith('LOCKED')) first.offer(l) else last = l
                }
            } catch (Exception ignored) { }
            first.offer('종료: ' + last)
        }
        String line
        try {
            line = first.poll(waitSec + 60, TimeUnit.SECONDS)
        } catch (InterruptedException ie) {
            p.destroyForcibly()   // 취소돼도 lock-hold 가 남아 나중에 잠금을 쥐지 않게 한다
            throw ie
        }
        if (line == null || !line.startsWith('LOCKED')) {
            p.destroyForcibly()
            throw new org.gradle.api.GradleException("PC Oracle 잠금을 잡지 못했다(${line ?: '시간 초과'}). 다른 레인의 Oracle 작업이 끝나지 않았을 수 있다.")
        }
        lockHolder = p
        lockPid = p.pid()
    }

    void releasePcLock() {
        if (lockHolder == null) return
        try { lockHolder.outputStream.close() } catch (Exception ignored) { }
        if (!lockHolder.waitFor(10, TimeUnit.SECONDS)) lockHolder.destroyForcibly()
        lockHolder = null
        lockPid = 0
    }

    static String jdbcUrl(String pdb) {
        String host = System.getenv('DMES_ORA_HOST') ?: 'localhost'
        String port = System.getenv('DMES_ORA_PORT') ?: '1521'
        return "jdbc:oracle:thin:@//${host}:${port}/${pdb}"
    }

    /** runPdb 와 같지만 출력(표준 출력·오류 합침)을 돌려준다. 실패하면 예외. */
    String runPdbOutput(List<String> args, long timeoutSec) {
        File script = new File(parameters.repoRoot.get(), 'scripts/oracle/pdb.mjs')
        ProcessBuilder pb = new ProcessBuilder(['node', script.absolutePath] + args).redirectErrorStream(true)
        if (lockPid > 0) pb.environment().put('DMES_ORA_LOCK_HELD', String.valueOf(lockPid))
        Process p = pb.start()
        StringBuilder out = new StringBuilder()
        Thread t = Thread.start { p.inputStream.eachLine { out.append(it).append('\n') } }
        if (!p.waitFor(timeoutSec, TimeUnit.SECONDS)) {
            p.destroyForcibly()
            throw new org.gradle.api.GradleException("pdb.mjs ${args} 시간 초과(${timeoutSec}초)")
        }
        t.join(2000)
        if (p.exitValue() != 0) throw new org.gradle.api.GradleException("pdb.mjs ${args} 실패(exit ${p.exitValue()})\n${out}")
        return out.toString()
    }

    int runPdb(List<String> args, long timeoutSec, boolean ignoreFailure) {
        File script = new File(parameters.repoRoot.get(), 'scripts/oracle/pdb.mjs')
        if (!script.isFile()) throw new org.gradle.api.GradleException("PDB 도구가 없다: ${script}")
        List<String> cmd = ['node', script.absolutePath] + args
        ProcessBuilder pb = new ProcessBuilder(cmd).redirectErrorStream(true)
        // 이 서비스가 PC 잠금을 쥐고 있으니 자식 pdb.mjs 는 잠금을 다시 잡지 않고 지나간다.
        if (lockPid > 0) pb.environment().put('DMES_ORA_LOCK_HELD', String.valueOf(lockPid))
        Process p = pb.start()
        StringBuilder out = new StringBuilder()
        Thread t = Thread.start { p.inputStream.eachLine { out.append(it).append('\n') } }
        if (!p.waitFor(timeoutSec, TimeUnit.SECONDS)) {
            p.destroyForcibly()
            if (!ignoreFailure) throw new org.gradle.api.GradleException("pdb.mjs ${args} 시간 초과(${timeoutSec}초)")
            return -1
        }
        t.join(2000)
        if (p.exitValue() != 0 && !ignoreFailure) {
            throw new org.gradle.api.GradleException("pdb.mjs ${args} 실패(exit ${p.exitValue()})\n${out}")
        }
        return p.exitValue()
    }

    /**
     * VM 상태(free·loadavg)를 한 줄 로그로 남긴다(Oracle 명령이 아니다: podman machine ssh). Oracle 시험·접속이 실패했을 때 VM 크기 축소(2GB)
     * 때문인지 가리려는 용도다. available 150MB 미만이거나 load 10 이상이면 「VM 의심」 을 붙인다. podman 이 아니거나 읽지 못하면 조용히 건너뛴다.
     */
    synchronized void logVmState(String reason) {
        try {
            String engine = System.getenv('DMES_ORA_ENGINE') ?: 'podman'
            if (engine != 'podman') return
            Process p = new ProcessBuilder([engine, 'machine', 'ssh', '--', 'free -m; cat /proc/loadavg']).redirectErrorStream(true).start()
            StringBuilder out = new StringBuilder()
            Thread t = Thread.start { p.inputStream.eachLine { out.append(it).append('\n') } }
            if (!p.waitFor(20, TimeUnit.SECONDS)) { p.destroyForcibly(); return }
            t.join(2000)
            def mem = out.toString().readLines().find { it.startsWith('Mem:') }?.trim()?.split(/\s+/)
            def load = out.toString().readLines().find { it ==~ /^\d+\.\d+ \d+\.\d+ \d+\.\d+ .*/ }?.trim()?.split(/\s+/)
            if (mem == null || mem.length < 7 || load == null) return
            long available = mem[6] as long
            double load1 = load[0] as double
            boolean suspect = available < 150 || load1 >= 10
            System.err.println("[dmes-ora] ${reason}: VM available=${available}MB load=${load[0]} ${load[1]} ${load[2]}" +
                    (suspect ? ' → VM 의심(재실행 전에 조정자에게 보고: scripts/oracle/README.md 「Oracle 오류 판별」)' : ' (VM 정상 범위)'))
        } catch (Exception ignored) {
            // VM 상태를 못 읽어도 시험 결과는 바꾸지 않는다.
        }
    }

    /** 시험 PDB 의 세션 수 최대치를 한 줄 로그로 남긴다(sqlplus 한 번, 실패해도 무시). */
    void logSessions() {
        try {
            File script = new File(parameters.repoRoot.get(), 'scripts/oracle/pdb.mjs')
            ProcessBuilder pb = new ProcessBuilder(['node', script.absolutePath, 'sessions', pdbName]).redirectErrorStream(true)
            if (lockPid > 0) pb.environment().put('DMES_ORA_LOCK_HELD', String.valueOf(lockPid))
            Process p = pb.start()
            StringBuilder out = new StringBuilder()
            Thread t = Thread.start { try { p.inputStream.eachLine { out.append(it).append('\n') } } catch (Exception ignored) { } }
            if (!p.waitFor(60, TimeUnit.SECONDS)) { p.destroyForcibly(); return }   // 읽기는 별도 스레드라 멈춘 sqlplus 에 close 가 매이지 않는다
            t.join(2000)
            String text = out.toString().trim()
            String line = text.readLines().find { it.startsWith('sessions') } ?: text
            System.err.println("[dmes-ora] 시험 PDB ${pdbName} ${line}")
        } catch (Exception ignored) {
            // 세션 수를 못 세도 시험 결과는 바꾸지 않는다.
        }
    }

    /**
     * Oracle 을 쓰는 test 태스크의 차례를 받는다. 같은 빌드(같은 JVM)의 모듈들은 시험 PDB 를 공유하므로 한 번에 한 태스크만 돌려야 한다:
     * 모듈 시험 틀이 클래스 시작 때 스키마를 Flyway clean 하면 다른 모듈이 쓰던 표가 사라진다(2026-10-07 mcm-core·mcm 을 한 빌드에 묶었을 때
     * oracheck 21건 ORA-00942). --parallel 이어도 included build 사이에 같은 차례를 쓴다. 같은 키로 다시 부르면 그대로 통과한다.
     * 순서는 늘 차례 → PC 잠금 → 시험 슬롯이다(차례를 쥔 쪽만 잠금·슬롯으로 가므로 서로 기다리며 멈추지 않는다).
     */
    boolean tryTurn(String key) {
        synchronized (JVM_MONITOR) {
            String cur = System.getProperty(TURN_OWNER)
            if (cur != null && cur != key) return false
            System.setProperty(TURN_OWNER, key)
            return true
        }
    }

    /** around: 기다리는 동안만 감쌀 클로저(Runnable 을 받는다). 기다리는 동안 Gradle worker lease 를 놓는 데 쓴다. null 이면 그냥 기다린다. */
    void acquireTurn(String key, long waitMs, Closure around = null) {
        boolean announced = false
        if (!tryTurn(key)) {
            long deadline = System.currentTimeMillis() + waitMs
            announced = true
            Runnable waiter = {
                synchronized (JVM_MONITOR) {
                    while (true) {
                        String cur = System.getProperty(TURN_OWNER)
                        if (cur == null || cur == key) break
                        long left = deadline - System.currentTimeMillis()
                        if (left <= 0) {
                            throw new org.gradle.api.GradleException("Oracle 시험 차례를 ${waitMs / 1000}초 기다려도 받지 못했다(쥔 쪽: ${cur}). 같은 스키마를 쓰는 모듈은 따로 돌린다.")
                        }
                        JVM_MONITOR.wait(Math.min(left, 5000L))
                    }
                    System.setProperty(TURN_OWNER, key)
                }
            } as Runnable
            System.err.println("[dmes-ora] 같은 빌드의 다른 Oracle 시험이 끝나기를 기다린다: ${key}\n  쥔 쪽: ${System.getProperty(TURN_OWNER)}")
            if (around != null) around.call(waiter) else waiter.run()
        }
        synchronized (turnsHeld) { turnsHeld.add(key) }
        if (announced) System.err.println("[dmes-ora] 시험 차례를 받았다: ${key}")
    }

    /** 차례를 놓는다. 쥐고 있지 않으면 아무것도 하지 않는다(여러 번 불러도 안전). 다른 서비스 인스턴스가 불러도 된다. */
    void releaseTurn(String key) {
        synchronized (turnsHeld) { turnsHeld.remove(key) }
        synchronized (JVM_MONITOR) {
            if (key == System.getProperty(TURN_OWNER)) {
                System.clearProperty(TURN_OWNER)
                JVM_MONITOR.notifyAll()
            }
        }
    }

    @Override
    void close() {
        // 빌드 종료(성공·실패·취소)에서 불린다. 모든 시험 태스크가 끝난 뒤에 불린다고 본다(합성 빌드로 확인: tests/run.sh).
        // 주인만 정리한다: 복제한 PDB 를 지우고 PC 잠금을 놓는다. 서비스들은 빌드 끝에서 차례로 닫히며, 주인이 먼저 닫혀도 그때는 모든 시험이
        // 끝나 있다(tests/run.sh 가 정리 로그가 마지막 probe 뒤에 나오는지 확인한다).
        synchronized (JVM_MONITOR) {
            System.clearProperty(SHARED_FAILED)
        }
        List<String> turns
        synchronized (turnsHeld) { turns = new ArrayList<>(turnsHeld) }
        turns.each { releaseTurn(it) }
        if (!ownsLock) return
        try {
            System.clearProperty(SHARED_PDB)
            System.clearProperty(SHARED_LOCK_PID)
            System.clearProperty(SHARED_KEY)
            System.err.println("[dmes-ora] 정리: 시험 PDB ${pdbName}${cloned ? ' 삭제' : ' 유지(기존 PDB)'}·PC 잠금 해제")
            if (cloned && pdbName != null) {
                logSessions()
                try {
                    runPdb(['drop', pdbName], 600, true)
                } catch (Exception ignored) {
                    // 지우지 못해도 빌드 결과를 바꾸지 않는다 — 다음 시험이 같은 이름을 먼저 지운다.
                }
            }
        } finally {
            releasePcLock()
        }
    }
}
