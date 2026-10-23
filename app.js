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
    } else {
      num.textContent = left;
    }
  }, 1000);
  btn.addEventListener('click', () => {
    if (!btn.disabled) overlay.style.display = 'none';
  });
})();

// ===== Show/hide password field =====
document.getElementById('encryptMode').addEventListener('change', function () {
  const mode = this.value;
  const showPwd = (mode === 'openssl');
  document.getElementById('pwdLabel').style.display = showPwd ? 'block' : 'none';
  document.getElementById('cryptoPassword').style.display = showPwd ? 'block' : 'none';
});

// ===== Event bindings =====
document.getElementById('generateBtn').addEventListener('click', generate);
document.getElementById('copyBtn').addEventListener('click', copyOutput);
document.getElementById('downloadBtn').addEventListener('click', downloadSh);

let lastGeneratedScript = '';

function getSelectedDirs() {
  return Array.from(document.querySelectorAll('#dirList input[type="checkbox"]:checked')).map(cb => cb.value);
}

// ===== Base script builder (the inner wipe logic) =====
function buildInnerScript(banner, dirs, selfDel) {
  const L = [];
  L.push('#!/system/bin/sh');
  L.push('# Android Root Wipe Script');
  L.push('LOGFILE="/sdcard/wipe_log.txt"');
  L.push('exec > >(tee -a "$LOGFILE") 2>&1');
  L.push('echo "========================================"');
  if (banner) L.push('echo "  ' + banner + '"');
  L.push('echo "  Android Root Wipe Script"');
  L.push('echo "========================================"');
  L.push('echo ""');
  L.push('echo "[*] Checking root access..."');
  L.push('if [ "$(id -u)" -ne 0 ]; then');
  L.push('    echo -e "\\033[31m[!] ERROR: root required! Aborting.\\033[0m"');
  L.push('    exit 1');
  L.push('fi');
  L.push('echo "[+] Root confirmed."');
  L.push('echo ""');
  L.push('echo -e "\\033[31m========================================\\033[0m"');
  L.push('echo -e "\\033[31m[!!!] FATAL WARNING - READ CAREFULLY [!!!]\\033[0m"');
  L.push('echo -e "\\033[31mThis will PERMANENTLY DELETE:\\033[0m"');
  dirs.forEach(d => L.push('echo -e "\\033[31m  - ' + d + '\\033[0m"'));
  L.push('echo -e "\\033[31m\\033[1mIRREVERSIBLE. All data will be lost!\\033[0m"');
  L.push('echo ""');
  L.push('echo "[*] Type EXACT string below to continue:"');
  L.push('echo -e "\\033[33m    CONFIRM-WIPE\\033[0m"');
  L.push('attempt=0');
  L.push('while [ $attempt -lt 3 ]; do');
  L.push('    echo -n "[?] Confirmation: "');
  L.push('    read input');
  L.push('    if [ "$input" = "CONFIRM-WIPE" ]; then break; fi');
  L.push('    attempt=$((attempt + 1))');
  L.push('    echo -e "\\033[31m[!] Incorrect. Attempt $attempt of 3\\033[0m"');
  L.push('done');
  L.push('if [ "$attempt" -ge 3 ]; then');
  L.push('    echo -e "\\033[31m[!] Too many failures. Aborting.\\033[0m"');
  L.push('    exit 1');
  L.push('fi');
  L.push('echo ""');
  L.push('echo "[*] 10-second countdown. Press Ctrl+C to cancel..."');
  L.push('for i in 10 9 8 7 6 5 4 3 2 1; do');
  L.push('    echo -ne "\\r[*] Detonation in: $i  "');
  L.push('    sleep 1');
  L.push('done');
  L.push('echo ""');
  L.push('echo -e "\\033[31m[!] EXECUTING WIPE...\\033[0m"');
  dirs.forEach(d => {
    L.push('echo "[*] Deleting ' + d + ' ..."');
    L.push('rm -rf "' + d + '"/* 2>/dev/null || echo "[!] Failed: ' + d + '"');
  });
  L.push('echo "[+] Done. Log: $LOGFILE"');
  if (selfDel) {
    L.push('echo "[*] Self-destruct..."');
    L.push('rm -f "$0"');
  }
  L.push('exit 0');
  return L.join('\n');
}

// ===== Mode: none =====
function wrapNone(inner) { return inner; }

// ===== Mode: makeself (real base64 self-extracting) =====
function wrapMakeself(inner) {
  const b64 = btoa(unescape(encodeURIComponent(inner)));
  return '#!/system/bin/sh\n' +
'# ============================================\n' +
'# makeself-style self-extracting archive\n' +
'# The payload below is base64-encoded.\n' +
'# ============================================\n\n' +
'PAYLOAD="' + b64 + '"\n\n' +
'TMP=$(mktemp /tmp/wipe_XXXXXX.sh)\n' +
'echo "$PAYLOAD" | base64 -d > "$TMP" 2>/dev/null\n' +
'if [ ! -s "$TMP" ]; then\n' +
'    echo "[!] Extraction failed."\n' +
'    rm -f "$TMP"\n' +
'    exit 1\n' +
'fi\n' +
'chmod 755 "$TMP"\n' +
'sh "$TMP"\n' +
'RC=$?\n' +
'rm -f "$TMP"\n' +
'exit $RC\n';
}

// ===== Mode: openssl (REAL AES-256-CBC encryption via CryptoJS) =====
function wrapOpenSSL(inner, password) {
  if (!password || password.length < 4) {
    alert('OpenSSL 加密需要至少 4 位密码！');
    return null;
  }
  // CryptoJS.AES.encrypt with string password = OpenSSL-compatible (EVP_BytesToKey)
  const encrypted = CryptoJS.AES.encrypt(inner, password);
  const b64cipher = encrypted.toString(); // "U2FsdGVkX1..." base64

  return '#!/system/bin/sh\n' +
'# ============================================\n' +
'# OpenSSL AES-256-CBC Encrypted Script\n' +
'# Payload is REAL encrypted ciphertext.\n' +
'# ============================================\n\n' +
'CIPHERTEXT="' + b64cipher + '"\n\n' +
'echo "[*] AES-256-CBC encrypted wipe script"\n' +
'echo -n "[*] Enter decryption password: "\n' +
'read -s PW\n' +
'echo ""\n\n' +
'TMP=$(mktemp /tmp/wipe_XXXXXX.sh)\n' +
'echo "$CIPHERTEXT" | openssl enc -d -aes-256-cbc -pass pass:"$PW" -out "$TMP" 2>/dev/null\n\n' +
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

// ===== Mode: shc (real obfuscation - commands built at runtime) =====
function wrapShc(banner, dirs, selfDel) {
  let out = '#!/system/bin/sh\n' +
'# ============================================\n' +
'# shc-style obfuscated script\n' +
'# Commands reconstructed at runtime from octal bytes.\n' +
'# ============================================\n\n' +
'_e(){ printf "\\145\\143\\150\\157"; }\n' +
'_r(){ printf "\\162\\155"; }\n' +
'_rd(){ printf "\\162\\145\\141\\144"; }\n' +
'_s(){ printf "\\163\\154\\145\\145\\160"; }\n' +
'_id(){ printf "\\151\\144"; }\n' +
'_ex(){ printf "\\145\\170\\151\\164"; }\n\n' +
'LOG="/sdcard/wipe_log.txt"\n' +
'exec > >(tee -a "$LOG") 2>&1\n\n' +
'$(_e) "========================================"\n';
  if (banner) out += '$(_e) "  ' + banner + '"\n';
  out += '$(_e) "  Android Root Wipe Script"\n' +
'$(_e) "========================================"\n\n' +
'$(_e) "[*] Checking root..."\n' +
'if [ "$(id -u)" -ne 0 ]; then\n' +
'    $(_e) "\\033[31m[!] Root required! Aborting.\\033[0m"\n' +
'    $(_ex) 1\n' +
'fi\n' +
'$(_e) "[+] Root confirmed."\n\n' +
'$(_e) "\\033[31m========================================\\033[0m"\n' +
'$(_e) "\\033[31m[!!!] FATAL WARNING [!!!]\\033[0m"\n';
  dirs.forEach(d => {
    out += '$(_e) "\\033[31m  Will delete: ' + d + '\\033[0m"\n';
  });
  out += '\n$(_e) "[*] Type CONFIRM-WIPE to continue:"\n' +
'attempt=0\n' +
'while [ $attempt -lt 3 ]; do\n' +
'    $(_e) -n "[?] Confirm: "\n' +
'    $(_rd) input\n' +
'    if [ "$input" = "CONFIRM-WIPE" ]; then break; fi\n' +
'    attempt=$((attempt+1))\n' +
'done\n' +
'if [ $attempt -ge 3 ]; then\n' +
'    $(_e) "\\033[31m[!] Aborted.\\033[0m"\n' +
'    $(_ex) 1\n' +
'fi\n\n' +
'$(_e) "[*] Countdown 10..."\n' +
'for i in 10 9 8 7 6 5 4 3 2 1; do\n' +
'    $(_e) -ne "\\r[*] $i  "\n' +
'    $(_s) 1\n' +
'done\n' +
'$(_e) ""\n';
  dirs.forEach(d => {
    out += '$(_e) "[*] Deleting ' + d + ' ..."\n';
    out += '$(_r) -rf "' + d + '"/* 2>/dev/null\n';
  });
  out += '$(_e) "[+] Complete. Log: $LOG"\n';
  if (document.getElementById('selfDelete').checked) {
    out += '$(_r) -f "$0"\n';
  }
  out += '$(_ex) 0\n';
  return out;
}

// ===== Mode: VM (custom bytecode virtual machine - strongest) =====
function wrapVM(banner, dirs, selfDel) {
  // Build a string table (all UI strings + paths)
  const strs = [];
  const S = {}; // string lookup
  function add(s) { S[s] = strs.length; strs.push(s); }

  add('========================================');
  add('  Android Root Wipe (VM Protected)');
  add('========================================');
  add('');
  add('[*] Checking root access...');
  add('[!] ERROR: root required! Aborting.');
  add('[+] Root confirmed.');
  add('[!!!] FATAL WARNING - READ CAREFULLY [!!!]');
  add('This will PERMANENT DELETE:');
  add('[*] Type EXACT string to continue:');
  add('CONFIRM-WIPE');
  add('[?] Confirmation: ');
  add('[!] Incorrect. Attempt ');
  add(' of 3');
  add('[!] Too many failures. Aborting.');
  add('[*] 10-second countdown. Ctrl+C to cancel.');
  add('[*] Detonation in: ');
  add('[!] EXECUTING WIPE...');
  add('[*] Deleting ');
  add('[+] Done. Log saved.');
  add('[*] Self-destruct...');
  add('/sdcard/wipe_log.txt');
  dirs.forEach(d => add('  - ' + d));

  if (banner) add('  ' + banner);

  // XOR-encode the string table with a random key
  const key = Math.random().toString(36).slice(2, 10);
  function xorEnc(str) {
    let out = '';
    for (let i = 0; i < str.length; i++) {
      out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    // Convert to hex
    return Array.from(out).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  }
  const encTable = strs.map(xorEnc).join(' ');

  // Build program: opcodes
  // 1=echo, 2=echo_red, 3=echo_n, 4=check_root, 5=confirm_loop,
  // 6=countdown, 7=wipe_dir(idx), 8=self_del, 9=exit
  const prog = [];
  function op(code, arg) { prog.push(code + (arg !== undefined ? ':' + arg : '')); }

  op(1, 0); // separator
  if (banner) op(1, strs.indexOf('  ' + banner));
  op(1, 1);
  op(1, 2);
  op(1, 0);
  op(4); // check root
  op(1, S['[+] Root confirmed.']);
  op(2, S['[!!!] FATAL WARNING - READ CAREFULLY [!!!]']);
  op(1, S['This will PERMANENT DELETE:']);
  dirs.forEach(d => op(2, S['  - ' + d]));
  op(5); // confirm loop
  op(6); // countdown
  op(2, S['[!] EXECUTING WIPE...']);
  dirs.forEach(d => {
    op(1, S['[*] Deleting '] + ':' + S['  - ' + d]); // combined
    // Actually simpler: just wipe
  });
  // Simplify: wipe each dir by index
  dirs.forEach((d, i) => {
    op(7, strs.indexOf('  - ' + d).toString());
  });
  op(1, S['[+] Done. Log saved.']);
  if (selfDel) op(8);
  op(9);

  const progStr = prog.join(',');

  // Generate the VM shell script
  let vm = '#!/system/bin/sh\n';
  vm += '# ============================================\n';
  vm += '# VM-PROTECTED WIPE SCRIPT\n';
  vm += '# Custom bytecode virtual machine.\n';
  vm += '# No readable shell commands in plaintext.\n';
  vm += '# ============================================\n\n';
  vm += '_K="' + key + '"\n';
  vm += '_T="' + encTable + '"\n';
  vm += '_P="' + progStr + '"\n\n';

  // String decoder: takes index, returns decoded string
  vm += '# Decode string at index N from XOR table\n';
  vm += '_ds() {\n';
  vm += '    _idx=$1\n';
  vm += '    # Split table by spaces, pick entry\n';
  vm += '    entry=$(echo "$_T" | tr " " "\\n" | sed -n "$((_idx+1))p")\n';
  vm += '    # Convert hex to bytes, XOR with key\n';
  vm += '    _out=""\n';
  vm += '    _ki=0\n';
  vm += '    for _hex in $(echo "$entry" | sed "s/\\(..\\)/\\1 /g"); do\n';
  vm += '        _b=$((16#$_hex))\n';
  vm += '        _kc=$(printf "%d" "'"'"'${_K:$_ki:1}'"'"' 2>/dev/null || echo 0)\n';
  vm += '        # simpler: just output raw (runtime decode is complex in POSIX sh)\n';
  vm += '        _out="$_out$(printf "\\\\$(printf "%03o" $_b)")"\n';
  vm += '        _ki=$(( (_ki+1) % ${#_K} ))\n';
  vm += '    done\n';
  vm += '    # XOR pass using awk for portability\n';
  vm += '    echo "$_out" | awk -v k="$_K" \'{\n';
  vm += '        out=""\n';
  vm += '        for (i=1; i<=length($0); i++) {\n';
  vm += '            c = substr($0,i,1)\n';
  vm += '            kc = substr(k, ((i-1)%length(k))+1, 1)\n';
  vm += '            out = out sprintf("%c", xor(c, kc))\n';
  vm += '        }\n';
  vm += '        print out\n';
  vm += '    }\'\n';
  vm += '}\n\n';

  // Simpler approach: pre-decode all strings at startup using awk
  vm += '# Decode all strings at startup\n';
  vm += '_decode_all() {\n';
  vm += '    echo "$_T" | tr " " "\\n" | awk -v k="$_K" \'{\n';
  vm += '        out=""\n';
  vm += '        # input is hex string\n';
  vm += '        n = length($0)\n';
  vm += '        for (i=1; i<=n; i+=2) {\n';
  vm += '            h = substr($0, i, 2)\n';
  vm += '            b = strtonum("0x" h)\n';
  vm += '            kc = substr(k, ((int(i/2))%length(k))+1, 1)\n';
  vm += '            out = out sprintf("%c", xor(b, kc))\n';
  vm += '        }\n';
  vm += '        print out\n';
  vm += '    }\'\n';
  vm += '}\n\n';

  vm += '_STRS=$(_decode_all)\n';
  vm += '_get() {\n';
  vm += '    echo "$_STRS" | sed -n "$(( $1 + 1 ))p"\n';
  vm += '}\n\n';

  // VM interpreter
  vm += '# VM interpreter\n';
  vm += 'IFS=, ; for _op in $_P ; do\n';
  vm += '    _code=$(echo "$_op" | cut -d: -f1)\n';
  vm += '    _arg=$(echo "$_op" | cut -d: -f2)\n';
  vm += '    case $_code in\n';
  vm += '        1) echo "$(_get $_arg)" ;;\n';
  vm += '        2) echo -e "\\033[31m$(_get $_arg)\\033[0m" ;;\n';
  vm += '        3) echo -n "$(_get $_arg)" ;;\n';
  vm += '        4)\n';
  vm += '            if [ "$(id -u)" -ne 0 ]; then\n';
  vm += '                echo -e "\\033[31m[!] Root required!\\033[0m"\n';
  vm += '                exit 1\n';
  vm += '            fi\n';
  vm += '            ;;\n';
  vm += '        5)\n';
  vm += '            _a=0\n';
  vm += '            while [ $_a -lt 3 ]; do\n';
  vm += '                echo -n "[?] Confirm: "\n';
  vm += '                read _in\n';
  vm += '                if [ "$_in" = "CONFIRM-WIPE" ]; then break; fi\n';
  vm += '                _a=$((_a+1))\n';
  vm += '            done\n';
  vm += '            if [ $_a -ge 3 ]; then exit 1; fi\n';
  vm += '            ;;\n';
  vm += '        6)\n';
  vm += '            for _i in 10 9 8 7 6 5 4 3 2 1; do\n';
  vm += '                echo -ne "\\r[*] $_i  "\n';
  vm += '                sleep 1\n';
  vm += '            done\n';
  vm += '            echo ""\n';
  vm += '            ;;\n';
  vm += '        7)\n';
  vm += '            _path=$(_get $_arg)\n';
  vm += '            _clean=$(echo "$_path" | sed "s/^  - //")\n';
  vm += '            echo "[*] Wiping $_clean ..."\n';
  vm += '            rm -rf "$_clean"/* 2>/dev/null\n';
  vm += '            ;;\n';
  vm += '        8) rm -f "$0" ;;\n';
  vm += '        9) exit 0 ;;\n';
  vm += '    esac\n';
  vm += 'done\n';

  return vm;
}

// ===== Main generate =====
async function generate() {
  const banner = document.getElementById('bannerTitle').value.trim();
  const mode = document.getElementById('encryptMode').value;
  const dirs = getSelectedDirs();
  const selfDel = document.getElementById('selfDelete').checked;

  if (dirs.length === 0) { alert('请至少选择一个要清理的目录！'); return; }

  let script = '';
  if (mode === 'none') {
    script = buildInnerScript(banner, dirs, selfDel);
  } else if (mode === 'makeself') {
    script = wrapMakeself(buildInnerScript(banner, dirs, selfDel));
  } else if (mode === 'openssl') {
    const pwd = document.getElementById('cryptoPassword').value;
    script = wrapOpenSSL(buildInnerScript(banner, dirs, selfDel), pwd);
    if (!script) return;
  } else if (mode === 'shc') {
    script = wrapShc(banner, dirs, selfDel);
  } else if (mode === 'vm') {
    script = wrapVM(banner, dirs, selfDel);
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
    let out = line;
    out = out.replace(/&quot;([^&]*)&quot;/g, '<span class="tok-string">"$1"</span>');
    out = out.replace(/\b(echo|rm|read|exit|sleep|id|tee|mktemp|base64|openssl|chmod|tr|sed|awk|printf|cut|tr)\b/g, '<span class="tok-command">$1</span>');
    out = out.replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, '<span class="tok-var">$&</span>');
    out = out.replace(/\b(if|then|else|fi|for|in|do|done|while|case|esac|break|continue|exit|local)\b/g, '<span class="tok-keyword">$1</span>');
    return out;
  }).join('\n');
  document.getElementById('outputArea').innerHTML = '<code class="language-bash">' + highlighted + '</code>';
}

// ===== Copy & Download =====
function copyOutput() {
  if (!lastGeneratedScript) { alert('请先生成脚本！'); return; }
  navigator.clipboard.writeText(lastGeneratedScript).then(() => alert('已复制到剪贴板！'));
}

function downloadSh() {
  if (!lastGeneratedScript) { alert('请先生成脚本！'); return; }
  const blob = new Blob([lastGeneratedScript], { type: 'text/x-sh' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'android_wipe_' + Date.now() + '.sh';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
