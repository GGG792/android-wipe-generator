// ===== Agreement Popup =====
(function () {
  const overlay = document.getElementById('agreementOverlay');
  const btn = document.getElementById('agreeBtn');
  const num = document.getElementById('countdownNum');
  let left = 3;
  const timer = setInterval(() => {
    left--;
    if (left <= 0) {
      clearInterval(timer);
      btn.textContent = '✓ 我已阅读并同意 I AGREE';
      btn.classList.add('ready');
      btn.disabled = false;
    } else { num.textContent = left; }
  }, 1000);
  btn.addEventListener('click', () => { if (!btn.disabled) overlay.style.display = 'none'; });
})();

// ===== Mode notes =====
const modeNotes = {
  none: '📄 输出明文 .sh 文件，所有逻辑直接可见。',
  openssl: '🔒 输出 .enc.sh：内部脚本已用 AES-256-CBC 真实加密，cat 文件看不到 rm 命令。运行时需要设备有 openssl 命令（Termux / root 环境自带）。密码由系统随机生成，生成后请立即保存。',
  makeself: '📦 输出 .run 自解压文件：内部脚本已 gzip 压缩内嵌，cat 文件看不到明文逻辑。运行时需要设备有 base64 和 gunzip 命令。',
  shc: '⚙️ shc 编译成 ELF 二进制需要在 Linux 机器上执行二次编译。本工具会输出一个编译脚本 build.sh，在有 shc 的机器上运行它即可生成最终二进制。'
};

document.getElementById('encryptMode').addEventListener('change', function () {
  const n = document.getElementById('modeNotes');
  n.style.display = 'block';
  n.textContent = modeNotes[this.value] || '';
});

// ===== Helpers =====
function getSelectedDirs() {
  return Array.from(document.querySelectorAll('#dirList input[type="checkbox"]:checked')).map(cb => cb.value);
}

function randomPassword(len = 24) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  let pw = '';
  for (let i = 0; i < len; i++) pw += chars[arr[i] % chars.length];
  return pw;
}

function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

// ===== Inner wipe script (the payload that gets encrypted/compressed) =====
function buildInnerScript(banner, dirs, selfDel) {
  const L = [];
  L.push('#!/system/bin/sh');
  L.push('LOGFILE="/sdcard/wipe_log.txt"');
  L.push('exec > >(tee -a "$LOGFILE") 2>&1');
  L.push('echo "========================================"');
  if (banner) L.push('echo "  ' + banner + '"');
  L.push('echo "  Android Root Wipe"');
  L.push('echo "========================================"');
  L.push('echo ""');
  L.push('echo "[*] Checking root access..."');
  L.push('if [ "$(id -u)" -ne 0 ]; then');
  L.push('    echo -e "\\033[31m[!] Root required! Aborting.\\033[0m"');
  L.push('    exit 1');
  L.push('fi');
  L.push('echo "[+] Root confirmed."');
  L.push('echo ""');
  L.push('echo -e "\\033[31m========================================\\033[0m"');
  L.push('echo -e "\\033[31m[!!!] FATAL WARNING [!!!]\\033[0m"');
  L.push('echo -e "\\033[31mThis will PERMANENTLY DELETE:\\033[0m"');
  dirs.forEach(d => L.push('echo -e "\\033[31m  - ' + d + '\\033[0m"'));
  L.push('echo -e "\\033[31m\\033[1mIRREVERSIBLE!\\033[0m"');
  L.push('echo ""');
  L.push('echo "[*] Type CONFIRM-WIPE to continue:"');
  L.push('attempt=0');
  L.push('while [ $attempt -lt 3 ]; do');
  L.push('    echo -n "[?] Confirm: "');
  L.push('    read input');
  L.push('    if [ "$input" = "CONFIRM-WIPE" ]; then break; fi');
  L.push('    attempt=$((attempt+1))');
  L.push('    echo -e "\\033[31m[!] Wrong. Attempt $attempt/3\\033[0m"');
  L.push('done');
  L.push('if [ $attempt -ge 3 ]; then');
  L.push('    echo -e "\\033[31m[!] Too many failures. Aborting.\\033[0m"');
  L.push('    exit 1');
  L.push('fi');
  L.push('echo ""');
  L.push('echo "[*] 10-second countdown. Ctrl+C to cancel."');
  L.push('for i in 10 9 8 7 6 5 4 3 2 1; do');
  L.push('    echo -ne "\\r[*] $i  "');
  L.push('    sleep 1');
  L.push('done');
  L.push('echo ""');
  L.push('echo -e "\\033[31m[!] EXECUTING WIPE...\\033[0m"');
  dirs.forEach(d => {
    L.push('echo "[*] Wiping ' + d + ' ..."');
    L.push('rm -rf "' + d + '"/* 2>/dev/null');
  });
  L.push('echo "[+] Done. Log: $LOGFILE"');
  if (selfDel) { L.push('rm -f "$0"'); }
  L.push('exit 0');
  return L.join('\n');
}

// ===== Mode 1: none — plaintext =====
function buildNone(inner) {
  return inner;
}

// ===== Mode 2: OpenSSL AES-256-CBC real encryption =====
function buildOpenSSL(inner, password) {
  // Real AES-256-CBC encryption via CryptoJS
  const encrypted = CryptoJS.AES.encrypt(inner, password);
  const cipherB64 = encrypted.toString(); // base64 "U2FsdGVkX1..."

  // Split ciphertext into lines for readability
  const wrapped = cipherB64.replace(/(.{64})/g, '$1\n');

  return '#!/system/bin/sh\n' +
'# ============================================\n' +
'# AES-256-CBC ENCRYPTED WIPE SCRIPT\n' +
'# Payload is real ciphertext - no plaintext commands.\n' +
'# Requires: openssl\n' +
'# ============================================\n\n' +
'CIPHERTEXT="$(cat <<\'ENDOFCIPHERTEXT\'\n' +
wrapped + '\n' +
'ENDOFCIPHERTEXT\n' +
')"\n\n' +
'echo "[*] AES-256-CBC encrypted wipe script"\n' +
'echo -n "[*] Enter decryption password: "\n' +
'read -s PW\n' +
'echo ""\n\n' +
'TMP=$(mktemp /data/local/tmp/wipe_XXXXXX.sh)\n' +
'echo "$CIPHERTEXT" | tr -d \' \\n\\r\' | openssl enc -d -aes-256-cbc -pass pass:"$PW" -out "$TMP" 2>/dev/null\n\n' +
'if [ $? -ne 0 ] || [ ! -s "$TMP" ]; then\n' +
'    echo -e "\\033[31m[!] Wrong password or corrupted payload.\\033[0m"\n' +
'    rm -f "$TMP"\n' +
'    exit 1\n' +
'fi\n\n' +
'chmod 755 "$TMP"\n' +
'sh "$TMP"\n' +
'RC=$?\n' +
'rm -f "$TMP"\n' +
'exit $RC\n';
}

// ===== Mode 3: makeself — gzip-compressed self-extractor =====
function buildMakeself(inner) {
  // gzip compress the inner script using pako
  const innerBytes = new TextEncoder().encode(inner);
  const gzipped = pako.gzip(innerBytes);
  // Convert gzipped bytes to base64
  let binary = '';
  for (let i = 0; i < gzipped.length; i++) binary += String.fromCharCode(gzipped[i]);
  const gzB64 = btoa(binary);
  const wrapped = gzB64.replace(/(.{64})/g, '$1\n');

  return '#!/system/bin/sh\n' +
'# ============================================\n' +
'# MAKESELF SELF-EXTRACTING ARCHIVE\n' +
'# Payload is gzip-compressed - no plaintext visible.\n' +
'# Requires: base64, gunzip\n' +
'# ============================================\n\n' +
'PAYLOAD="$(cat <<\'ENDOFPAYLOAD\'\n' +
wrapped + '\n' +
'ENDOFPAYLOAD\n' +
')"\n\n' +
'echo "[*] Extracting self-extracting archive..."\n' +
'TMPDIR=$(mktemp -d /data/local/tmp/wipe_XXXXXX)\n' +
'TMP="$TMPDIR/inner.sh"\n\n' +
'echo "$PAYLOAD" | tr -d \' \\n\\r\' | base64 -d | gunzip > "$TMP" 2>/dev/null\n\n' +
'if [ $? -ne 0 ] || [ ! -s "$TMP" ]; then\n' +
'    echo -e "\\033[31m[!] Extraction failed.\\033[0m"\n' +
'    rm -rf "$TMPDIR"\n' +
'    exit 1\n' +
'fi\n\n' +
'chmod 755 "$TMP"\n' +
'sh "$TMP"\n' +
'RC=$?\n' +
'rm -rf "$TMPDIR"\n' +
'exit $RC\n';
}

// ===== Mode 4: shc — output a build script =====
function buildShcBuildScript(inner) {
  // We can't compile to ELF in browser, so output a build script
  // that the user runs on a Linux machine with shc installed
  const innerB64 = b64encode(inner);

  return '#!/system/bin/sh\n' +
'# ============================================\n' +
'# SHC BUILD SCRIPT\n' +
'# Run this on a Linux machine with shc installed:\n' +
'#   sudo apt install shc   (or build from source)\n' +
'#   chmod +x build_shc.sh && ./build_shc.sh\n' +
'# It will produce wipe_binary (ELF) in current dir.\n' +
'# ============================================\n\n' +
'set -e\n\n' +
'INNER=$(mktemp /tmp/wipe_inner_XXXXXX.sh)\n' +
'trap "rm -f $INNER" EXIT\n\n' +
'# Decode embedded inner script\n' +
'cat > "$INNER" <<\'ENDOFINNER\'\n' +
innerB64.replace(/(.{64})/g, '$1\n') + '\n' +
'ENDOFINNER\n\n' +
'base64 -d "$INNER" > "${INNER}.real" 2>/dev/null || cp "$INNER" "${INNER}.real"\n' +
'chmod +x "${INNER}.real"\n\n' +
'echo "[*] Compiling with shc..."\n' +
'if ! command -v shc >/dev/null 2>&1; then\n' +
'    echo "[!] shc not found. Install it first: sudo apt install shc"\n' +
'    exit 1\n' +
'fi\n\n' +
'shc -f "${INNER}.real" -o wipe_binary -r\n\n' +
'echo "[+] Done. Binary: ./wipe_binary"\n' +
'echo "[*] Push to device: adb push wipe_binary /data/local/tmp/ && adb shell su -c /data/local/tmp/wipe_binary"\n';
}

// ===== Main generate =====
let currentExt = '.sh';
let currentPassword = '';

function generate() {
  const banner = document.getElementById('bannerTitle').value.trim();
  const mode = document.getElementById('encryptMode').value;
  const dirs = getSelectedDirs();
  const selfDel = document.getElementById('selfDelete').checked;

  if (dirs.length === 0) { alert('请至少选择一个要清理的目录！'); return; }

  const inner = buildInnerScript(banner, dirs, selfDel);
  let script = '';
  currentPassword = '';
  document.getElementById('pwBanner').style.display = 'none';

  if (mode === 'none') {
    script = buildNone(inner);
    currentExt = '.sh';
  } else if (mode === 'openssl') {
    currentPassword = randomPassword(24);
    script = buildOpenSSL(inner, currentPassword);
    currentExt = '.enc.sh';
    // Show password banner
    document.getElementById('pwValue').textContent = currentPassword;
    document.getElementById('pwBanner').style.display = 'flex';
  } else if (mode === 'makeself') {
    script = buildMakeself(inner);
    currentExt = '.run';
  } else if (mode === 'shc') {
    script = buildShcBuildScript(inner);
    currentExt = '_build.sh';
  }

  lastGeneratedScript = script;
  renderOutput(script);
}

// ===== Syntax Highlight =====
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderOutput(code) {
  const esc = escapeHtml(code);
  const highlighted = esc.split('\n').map(line => {
    if (/^\s*#/.test(line)) return '<span class="tok-comment">' + line + '</span>';
    // Long base64/ciphertext blobs — render as "data" not highlighted
    if (/^[A-Za-z0-9+/=]{40,}$/.test(line)) return '<span style="color:#888">' + line + '</span>';
    let out = line;
    out = out.replace(/&quot;([^&]*)&quot;/g, '<span class="tok-string">"$1"</span>');
    out = out.replace(/\b(echo|rm|read|exit|sleep|id|tee|mktemp|chmod|base64|openssl|gunzip|tr|sed|cut|cat|trap|set)\b/g, '<span class="tok-command">$1</span>');
    out = out.replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, '<span class="tok-var">$&</span>');
    out = out.replace(/\b(if|then|else|fi|for|in|do|done|while|case|esac|break|exit|set|trap)\b/g, '<span class="tok-keyword">$1</span>');
    return out;
  }).join('\n');
  document.getElementById('outputArea').innerHTML = '<code class="language-bash">' + highlighted + '</code>';
}

// ===== Events =====
document.getElementById('generateBtn').addEventListener('click', generate);
document.getElementById('copyBtn').addEventListener('click', copyOutput);
document.getElementById('downloadBtn').addEventListener('click', downloadSh);
document.getElementById('copyPwBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(currentPassword).then(() => alert('密码已复制！'));
});

let lastGeneratedScript = '';

function copyOutput() {
  if (!lastGeneratedScript) { alert('请先生成脚本！'); return; }
  navigator.clipboard.writeText(lastGeneratedScript).then(() => alert('已复制！'));
}

function downloadSh() {
  if (!lastGeneratedScript) { alert('请先生成脚本！'); return; }
  const blob = new Blob([lastGeneratedScript], { type: 'text/x-sh' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'android_wipe_' + Date.now() + currentExt;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
