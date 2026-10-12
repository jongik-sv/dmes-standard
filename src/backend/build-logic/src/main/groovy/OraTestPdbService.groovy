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
 * 복제·삭제는 scripts/oracle/pdb.mjs 가 한다(CDB 잠금·열린 PDB 상한을 거친다). 이 클래스는 node 를 부를 뿐이다.
 * 잠금 세분화(2026-10-12, scripts/oracle/pclock.mjs): 복제 직전부터 빌드가 끝나 PDB 를 지울 때까지(시험 JVM 이 도는 구간 포함)
 * `pdb.mjs seat-hold` 가 PC 시험 자리(seat, DMES_ORA_TEST_SEATS 개, 기본 2) 하나를 쥔다. CDB 잠금(dmes-ora-pdb.lock)은 복제·삭제를 하는
 * pdb.mjs 자식이 그때만 잠깐 잡는다. 그래서 PC 전체에서 Oracle 시험 빌드가 자리 수만큼 함께 돈다. 시험 PDB 이름은 자리 번호를 붙인
 * T_<레인>_<자리>라 같은 워크트리의 두 빌드도 겹치지 않는다. 기존 PDB 를 쓰는 existing 모드는 자리에 더해 그 PDB 의 사용 잠금도 쥔다.
 * 자리 주인은 node 프로세스이고 표준 입력이 닫히면(Gradle 이 죽어도) 스스로 놓는다.
 * 상위(heavy)가 자리를 먼저 쥐고 DMES_ORA_SEAT_HELD=<주인 pid> 를 주면 seat-hold 가 새로 잡지 않고 그 자리 번호를 쓴다(그 자리는 놓지 않는다).
 * 옛 상위가 CDB 잠금을 쥐고 DMES_ORA_LOCK_HELD=<주인 pid> 를 주면 자리 없이 그 잠금을 쓴다(adoptParentLock, 옛 동작 — 이 서비스는 그 잠금을 놓지 않는다).
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
    Process lockHolder = null   // seat-hold 프로세스(자리 주인 또는 상위 자리를 받은 대리)
    long lockPid = 0            // 살아 있는 동안 이 빌드가 시험 PDB 를 쓸 수 있는 프로세스(seat-hold 또는 상위 CDB 잠금 주인)
    int seatIndex = 0           // 쥔 시험 자리 번호(1..N). 상위 CDB 잠금을 받았으면 0
    boolean parentMutex = false // 상위가 쥔 CDB 잠금을 받았다(옛 동작) — 자식 pdb.mjs 에 DMES_ORA_LOCK_HELD 를 넘긴다

    /** 시험 PDB 이름 T_<레인>_<자리>. pdb.mjs 의 이름 규칙(T_ 뒤 25자 이하)에 맞게 레인 부분을 먼저 자른다. */
    static String testPdbName(String lane, int seat) {
        String base = lane.toUpperCase().replaceAll('[^A-Z0-9_]', '_')
        String suffix = '_' + seat
        int max = 25 - suffix.length()
        if (base.length() > max) base = base.substring(0, max)
        return 'T_' + base + suffix
    }

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
     * 주인이 올린 PDB 가 유효하면 그 이름, 없으면 null. 주인이 올렸는데 자리를 쥔 seat-hold 가 죽었으면(누가 끝냈거나 비정상 종료) 예외다:
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
            throw new org.gradle.api.GradleException("PC Oracle 시험 자리를 쥔 seat-hold(pid ${pid})가 빌드 도중 끝나 시험 PDB ${pdb} 를 더 쓸 수 없다. 다른 레인이 잠금을 가져갔을 수 있으니 PDB 를 지우거나 다시 만들지 않고 멈춘다. 빌드를 다시 실행한다.")
        }
        return pdb
    }

    String acquireLocked() {
        if (parameters.mode.get() == 'existing') {
            pdbName = parameters.pdb.get().toUpperCase()
            return pdbName
        }
        String name = testPdbName(parameters.lane.get(), seatIndex)
        // 이전 시험이 비정상 종료돼 남긴 같은 이름 PDB 가 있으면 지운다(레인·자리 하나가 이 이름 하나를 쓰고, 그 자리는 지금 이 빌드가 쥐었다).
        runPdb(['drop', name], 600, true)
        // 열린 PDB 자리(DMES_ORA_MAX_OPEN)가 모자라면 복제는 다른 시험 빌드가 PDB 를 지울 때까지 기다린다(CDB 잠금 밖에서). 자리 수가
        // 열린 PDB 여유보다 많아도 실패하지 않고 줄을 서게 기다림 한도를 하니스 한도와 맞춘다.
        long roomWait = (System.getenv('DMES_ORA_HARNESS_LOCK_WAIT_SEC') ?: '7200') as long
        String cloneOut = runPdbOutput(['clone', parameters.template.get().toUpperCase(), name], roomWait + 1800,
                ['DMES_ORA_ROOM_WAIT_SEC': String.valueOf(roomWait)])
        // 자동 작업(autotask·AWR) 끄기 확인 줄만 로그에 올린다.
        cloneOut.readLines().findAll { it.contains('자동 작업') || it.contains('autotask') || it.contains('AWR') || it.contains('복제·열기') }
                .each { System.err.println("[dmes-ora] ${it.replaceFirst(/^\[pdb\]\s*/, '')}") }
        pdbName = name
        cloned = true
        return pdbName
    }

    /**
     * PC Oracle 시험 자리를 쥔다(이미 쥐고 있으면 그대로). 기다리는 한도는 DMES_ORA_HARNESS_LOCK_WAIT_SEC(기본 7200초).
     * 옛 상위가 CDB 잠금을 넘겼으면(DMES_ORA_LOCK_HELD) 그것을 쓰고 자리는 잡지 않는다(CDB 잠금 → 자리 순서로 기다리면 교착할 수 있다).
     * 그 밖에는 `pdb.mjs seat-hold` 를 띄운다. 상위 heavy 가 자리를 넘겼으면(DMES_ORA_SEAT_HELD) seat-hold 가 그 번호를 그대로 낸다.
     */
    void holdPcLock() {
        if (lockHolder != null || lockPid > 0) return
        File script = new File(parameters.repoRoot.get(), 'scripts/oracle/pdb.mjs')
        if (!script.isFile()) throw new org.gradle.api.GradleException("PDB 도구가 없다: ${script}")
        if (adoptParentLock(script)) return
        long waitSec = (System.getenv('DMES_ORA_HARNESS_LOCK_WAIT_SEC') ?: '7200') as long
        List<String> cmd = ['node', script.absolutePath, 'seat-hold', '--wait-sec', String.valueOf(waitSec)]
        if (parameters.mode.get() == 'existing') cmd += ['--pdb', parameters.pdb.get().toUpperCase()]
        Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start()
        // 첫 줄 "SEATED <pid> <자리> [adopted]" 가 오면 자리를 쥔 것이다. 이후 출력은 버린다(파이프가 막히지 않게 읽는다).
        def first = new java.util.concurrent.LinkedBlockingQueue<String>()
        Thread.start {
            String last = ''
            try {
                p.inputStream.eachLine { String l ->
                    if (l.startsWith('SEATED')) first.offer(l) else last = l
                }
            } catch (Exception ignored) { }
            first.offer('종료: ' + last)
        }
        String line
        try {
            line = first.poll(waitSec + 60, TimeUnit.SECONDS)
        } catch (InterruptedException ie) {
            p.destroyForcibly()   // 취소돼도 seat-hold 가 남아 나중에 자리를 쥐지 않게 한다
            throw ie
        }
        if (line == null || !line.startsWith('SEATED')) {
            p.destroyForcibly()
            throw new org.gradle.api.GradleException("PC Oracle 시험 자리를 잡지 못했다(${line ?: '시간 초과'}). 다른 레인의 Oracle 시험이 끝나지 않았을 수 있다(node scripts/oracle/pdb.mjs seats).")
        }
        String[] parts = line.trim().split(/\s+/)
        lockHolder = p
        lockPid = p.pid()
        seatIndex = parts.length > 2 && parts[2].isInteger() ? parts[2] as int : 1
        System.err.println("[dmes-ora] PC Oracle 시험 자리 seat-${seatIndex} 를 ${parts.length > 3 ? '상위(heavy)에게서 받았다' : '잡았다'}" +
                "(자리 ${System.getenv('DMES_ORA_TEST_SEATS') ?: '2'}개, 복제·삭제 때만 CDB 잠금을 잠깐 잡는다)")
    }

    /**
     * 옛 상위(자리 도입 전 heavy·e2e 등)가 이미 CDB 잠금을 쥐고 환경변수 DMES_ORA_LOCK_HELD=<잠금 주인 pid> 로 알렸으면 그 잠금을 쓴다 —
     * 상위가 빌드 전 구간 CDB 잠금을 쥐므로 자리를 따로 잡지 않는다(옛 동작). 주인 pid 가 잠금 owner 와 같고 살아 있는지는
     * `pdb.mjs lock-held` 가 가린다(pdb.mjs 와 같은 잠금 코드, 임시 폴더 해석도 같다). 유효하지 않으면 false 라 기존대로 직접 잡는다.
     * 이 서비스는 그 잠금의 주인이 아니므로 놓지 않는다(lockHolder 는 null 로 둔다). 시스템 환경변수가 없으면 아무것도 하지 않는다.
     */
    boolean adoptParentLock(File script) {
        String held = System.getenv('DMES_ORA_LOCK_HELD')
        if (held == null || !held.trim().isLong() || held.trim().toLong() <= 0) return false
        long pid = held.trim().toLong()
        try {
            ProcessBuilder pb = new ProcessBuilder(['node', script.absolutePath, 'lock-held']).redirectErrorStream(true)
            pb.environment().put('DMES_ORA_LOCK_HELD', String.valueOf(pid))
            Process p = pb.start()
            Thread t = Thread.start { try { p.inputStream.eachLine { } } catch (Exception ignored) { } }
            if (!p.waitFor(30, TimeUnit.SECONDS)) { p.destroyForcibly(); return false }
            t.join(1000)
            if (p.exitValue() != 0) {
                System.err.println("[dmes-ora] DMES_ORA_LOCK_HELD=${pid} 가 유효한 CDB 잠금이 아니라 시험 자리를 직접 잡는다")
                return false
            }
        } catch (Exception e) {
            return false
        }
        lockPid = pid
        parentMutex = true
        System.err.println("[dmes-ora] 상위가 쥔 CDB 잠금(pid ${pid})을 그대로 쓴다(시험 자리는 잡지 않는다)")
        return true
    }

    void releasePcLock() {
        if (lockHolder == null) return
        try { lockHolder.outputStream.close() } catch (Exception ignored) { }
        if (!lockHolder.waitFor(10, TimeUnit.SECONDS)) lockHolder.destroyForcibly()
        lockHolder = null
        lockPid = 0
        parentMutex = false
    }

    static String jdbcUrl(String pdb) {
        String host = System.getenv('DMES_ORA_HOST') ?: 'localhost'
        String port = System.getenv('DMES_ORA_PORT') ?: '1521'
        return "jdbc:oracle:thin:@//${host}:${port}/${pdb}"
    }

    /**
     * 자식 pdb.mjs 의 환경. 시험 자리만 쥔 경우 DMES_ORA_LOCK_HELD 를 지워 자식이 복제·삭제 때 CDB 잠금을 스스로 잠깐 잡게 한다
     * (Gradle 을 띄운 환경에 남은 값을 물려받지 않게). 옛 상위 CDB 잠금을 받았으면 그 pid 를 넘겨 다시 잡지 않게 한다.
     */
    void childEnv(ProcessBuilder pb) {
        if (parentMutex && lockPid > 0) pb.environment().put('DMES_ORA_LOCK_HELD', String.valueOf(lockPid))
        else pb.environment().remove('DMES_ORA_LOCK_HELD')
    }

    /** runPdb 와 같지만 출력(표준 출력·오류 합침)을 돌려준다. 실패하면 예외. */
    String runPdbOutput(List<String> args, long timeoutSec, Map<String, String> env = [:]) {
        File script = new File(parameters.repoRoot.get(), 'scripts/oracle/pdb.mjs')
        ProcessBuilder pb = new ProcessBuilder(['node', script.absolutePath] + args).redirectErrorStream(true)
        childEnv(pb)
        pb.environment().putAll(env)
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
        childEnv(pb)
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
            childEnv(pb)
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
     * 순서는 늘 차례 → PC 시험 자리 → (복제·삭제 때만 CDB 잠금) → 시험 슬롯이다(차례를 쥔 쪽만 자리·슬롯으로 가므로 서로 기다리며 멈추지 않는다).
     * 차례는 한 빌드(JVM) 안의 직렬화이고, 시험 자리는 빌드 사이의 동시 실행 상한이다.
     */
    boolean tryTurn(String key) {
        synchronized (JVM_MONITOR) {
            String cur = System.getProperty(TURN_OWNER)
            if (cur != null && cur != key) return false
            System.setProperty(TURN_OWNER, key)
            synchronized (turnsHeld) { turnsHeld.add(key) }   // 주인 표시와 같은 구간에서 기록한다 — 사이에 취소돼도 close 가 풀 수 있다
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
                            throw new org.gradle.api.GradleException("Oracle 시험 차례를 ${waitMs / 1000}초 기다려도 받지 못했다(쥔 쪽: ${cur}). " +
                                    "쥔 쪽 태스크가 이미 끝났다면 그 마무리 태스크(<test>OraTurnRelease)가 돌지 못한 것이니 gradle 데몬을 멈추고(gradlew --stop) 다시 실행한다. " +
                                    "같은 스키마를 쓰는 모듈은 따로 돌린다.")
                        }
                        JVM_MONITOR.wait(Math.min(left, 5000L))
                    }
                    System.setProperty(TURN_OWNER, key)
                    synchronized (turnsHeld) { turnsHeld.add(key) }
                }
            } as Runnable
            System.err.println("[dmes-ora] 같은 빌드의 다른 Oracle 시험이 끝나기를 기다린다: ${key}\n  쥔 쪽: ${System.getProperty(TURN_OWNER)}")
            if (around != null) around.call(waiter) else waiter.run()
        }
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
        // 주인만 정리한다: 복제한 PDB 를 지우고(CDB 잠금은 drop 이 잠깐 잡는다) 그다음 시험 자리를 놓는다. 서비스들은 빌드 끝에서 차례로 닫히며, 주인이 먼저 닫혀도 그때는 모든 시험이
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
            System.err.println("[dmes-ora] 정리: 시험 PDB ${pdbName}${cloned ? ' 삭제' : ' 유지(기존 PDB)'}·시험 자리 seat-${seatIndex} 해제")
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
