
(function () {
  'use strict';

  function $(selector) { return document.querySelector(selector); }
  function $$(selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); }

  var screens = $$('.screen');
  var currentGame = null;
  var lastResult = null;
  var soundOn = true;

  function show(id) {
    stopAll();
    screens.forEach(function (screen) { screen.classList.remove('active'); });
    $('#' + id).classList.add('active');
    window.scrollTo(0, 0);
  }

  /* ---------- Leaderboard ---------- */
  function boards() {
    try {
      return JSON.parse(localStorage.getItem('aicheArcadeV3') || '{"sep":[],"react":[]}');
    } catch (error) {
      return { sep:[], react:[] };
    }
  }

  function saveBoards(boardData) {
    localStorage.setItem('aicheArcadeV3', JSON.stringify(boardData));
  }

  function bests() {
    var data = boards();
    var sepScores = data.sep.slice().sort(function (a, b) { return b.score - a.score; });
    var reactScores = data.react.slice().sort(function (a, b) { return b.score - a.score; });

    $('#sepBest').textContent = sepScores.length ? sepScores[0].score.toFixed(1) + '%' : '—';
    if (reactScores.length) {
      var score = reactScores[0].score;
      $('#reactBest').textContent = (score < 0 ? '−$' : '$') + Math.abs(Math.round(score)).toLocaleString();
    } else {
      $('#reactBest').textContent = '—';
    }
  }

  /* ---------- Lightweight arcade audio ---------- */
  var audio = null;
  var masterGain = null;
  var compressor = null;
  var noiseBuffer = null;
  var musicStep = 0;
  var musicTimer = null;

  function audioInit() {
    if (audio || !soundOn) return;
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    audio = new AudioContextClass();
    masterGain = audio.createGain();
    masterGain.gain.value = 0.48;
    compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -15;
    compressor.ratio.value = 8;
    masterGain.connect(compressor);
    compressor.connect(audio.destination);

    /* Build noise once instead of rebuilding a random audio buffer every beat. */
    var samples = Math.floor(audio.sampleRate * 0.18);
    noiseBuffer = audio.createBuffer(1, samples, audio.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
  }

  function ensureAudio() {
    audioInit();
    if (audio && audio.state === 'suspended') audio.resume();
  }

  function tone(freq, duration, type, volume, delay) {
    if (!soundOn) return;
    ensureAudio();
    if (!audio) return;
    duration = duration || 0.08;
    type = type || 'square';
    volume = volume || 0.08;
    delay = delay || 0;

    var oscillator = audio.createOscillator();
    var gain = audio.createGain();
    var start = audio.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(masterGain || audio.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function kick(volume) {
    if (!soundOn) return;
    ensureAudio();
    if (!audio) return;
    var oscillator = audio.createOscillator();
    var gain = audio.createGain();
    var start = audio.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(145, start);
    oscillator.frequency.exponentialRampToValueAtTime(42, start + 0.12);
    gain.gain.setValueAtTime(volume || 0.14, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(start);
    oscillator.stop(start + 0.15);
  }

  function noise(duration, volume) {
    if (!soundOn) return;
    ensureAudio();
    if (!audio || !noiseBuffer) return;
    var source = audio.createBufferSource();
    var gain = audio.createGain();
    var filter = audio.createBiquadFilter();
    source.buffer = noiseBuffer;
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    gain.gain.setValueAtTime(volume || 0.05, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + (duration || 0.07));
    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start();
    source.stop(audio.currentTime + (duration || 0.07));
  }

  function good() { tone(660,.07,'square',.11); tone(880,.08,'square',.10,.055); tone(1100,.1,'triangle',.08,.11); }
  function bad() { tone(190,.15,'sawtooth',.12); tone(118,.20,'sawtooth',.09,.07); noise(.10,.055); }
  function dramatic() { kick(.17); tone(220,.10,'sawtooth',.10); tone(440,.09,'square',.08,.08); tone(660,.11,'square',.07,.16); }

  function musicTick() {
    if (!soundOn || !audio || audio.state !== 'running' || !currentGame) return;
    var step = musicStep++ % 12;
    if (step % 4 === 0) kick(currentGame === 'react' ? .08 : .07);

    if (currentGame === 'sep') {
      var sepNotes = [392,494,587,784];
      if (step % 2 === 0) tone(sepNotes[(step / 2) % 4], .07, 'square', .028);
    } else if (currentGame === 'react') {
      var heat = Math.max(0, Math.min(1, (temp - 160) / 22));
      if (step % 2 === 0) tone([165,196,220,247][(step / 2) % 4], .08, 'sawtooth', .025 + heat * .02);
    }
  }

  function startMusic() {
    if (musicTimer) return;
    musicTimer = setInterval(musicTick, 200);
  }

  function stopMusic() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
  }

  $('#soundBtn').addEventListener('click', function () {
    soundOn = !soundOn;
    $('#soundBtn').textContent = soundOn ? '🔊 ARCADE SOUND' : '🔇 SOUND OFF';
    if (soundOn) { ensureAudio(); dramatic(); }
  });

  /* ---------- Game chooser ---------- */
  $('#pickSep').addEventListener('click', function () {
    currentGame = 'sep';
    ensureAudio();
    resetSep();
    show('sepGame');
  });

  $('#pickReact').addEventListener('click', function () {
    currentGame = 'react';
    ensureAudio();
    resetReact();
    show('reactGame');
  });

  /* ---------- Separator ---------- */
  var sepRunning = false;
  var sepLeft = 20;
  var sepTimer = null;
  var sepAnim = null;
  var slugX = -110;
  var slugSpeed = 260; /* pixels per second, frame-rate independent */
  var slugLastFrame = 0;
  var phase = 'gas';
  var correct = 0;
  var total = 0;
  var combo = 0;
  var phases = ['gas','oil','water'];
  var sepField = $('#sepField');
  var slug = $('#slug');
  var sepLimit = 0;

  function resetSep() {
    stopAll();
    sepRunning = false;
    sepLeft = 20; correct = 0; total = 0; combo = 0; slugX = -110; slugLastFrame = 0;
    $('#sepTime').textContent = '20';
    $('#purity').textContent = '100';
    $('#combo').textContent = '0';
    $('#sepOverlay').classList.remove('hidden');
    setSlug('gas');
  }

  function setSlug(nextPhase) {
    phase = nextPhase;
    slug.className = 'slug ' + nextPhase;
    slug.textContent = nextPhase.toUpperCase();
    slugX = -110;
    slug.style.transform = 'translate3d(' + slugX + 'px,0,0)';
  }

  function nextSlug() {
    setSlug(phases[Math.floor(Math.random() * phases.length)]);
    slugSpeed = 265 + Math.min(170, total * 8);
  }

  function startSep() {
    if (sepRunning) return;
    ensureAudio(); dramatic(); startMusic(); startGamepadPolling();
    sepRunning = true;
    sepLimit = sepField.clientWidth * 0.78;
    slugLastFrame = performance.now();
    $('#sepOverlay').classList.add('hidden');
    sepTimer = setInterval(function () {
      sepLeft--;
      $('#sepTime').textContent = sepLeft;
      if (sepLeft <= 0) finishSep();
    }, 1000);
    sepAnim = requestAnimationFrame(sepLoop);
  }

  function sepLoop(now) {
    if (!sepRunning) return;
    var dt = Math.min(0.05, Math.max(0.001, (now - slugLastFrame) / 1000));
    slugLastFrame = now;
    slugX += slugSpeed * dt;
    slug.style.transform = 'translate3d(' + slugX.toFixed(1) + 'px,0,0)';
    if (slugX > sepLimit) route('miss');
    sepAnim = requestAnimationFrame(sepLoop);
  }

  var flashTimer = null;
  function flash(text, ok) {
    var box = $('#sepFlash');
    clearTimeout(flashTimer);
    box.textContent = text;
    box.className = 'flashmsg show ' + (ok ? 'correct' : 'wrong');
    flashTimer = setTimeout(function () { box.className = 'flashmsg'; }, 520);
  }

  function route(chosen) {
    if (!sepRunning) return;
    total++;
    var ok = chosen === phase;
    if (ok) {
      correct++; combo++; good();
      flash(combo >= 3 ? 'COMBO ×' + combo : 'PERFECT!', true);
    } else {
      combo = 0; bad(); flash('CONTAMINATION!', false);
    }
    $('#combo').textContent = combo;
    $('#purity').textContent = ((correct / Math.max(1,total)) * 100).toFixed(0);
    nextSlug();
  }

  $$('.route').forEach(function (button) {
    button.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      route(button.dataset.phase);
    });
  });
  $('#sepGo').addEventListener('click', startSep);

  function finishSep() {
    if (!sepRunning) return;
    sepRunning = false;
    clearInterval(sepTimer);
    cancelAnimationFrame(sepAnim);
    var purity = total ? correct / total * 100 : 0;
    lastResult = { game:'sep', score:purity, detail:correct + ' correct routes out of ' + total + '.' };
    showResult();
  }

  /* ---------- Reactor ---------- */
  var reactRunning = false;
  var reactLeft = 20;
  var reactTimer = null;
  var reactLoopId = null;
  var temp = 155, pressure = 5, feed = 100, product = 94, cooling = 50;
  var ambient = 30, heatLoad = 0, coolingEfficiency = 1, profit = 0, dangerTime = 0;
  var eventIndex = 0, lastReactFrame = 0, lastUiUpdate = 0;

  var events = [
    {name:'☀️ SUMMER HEATWAVE',ambient:44,heat:3.5,coolEff:.72,feed:100,sun:'☀️',text:'Hot cooling water — reactor starts heating!'},
    {name:'🌙 COOL NIGHT',ambient:23,heat:-1.5,coolEff:1.22,feed:100,sun:'🌙',text:'Cooling suddenly gets stronger!'},
    {name:'⚡ FEED SURGE',ambient:33,heat:3.2,coolEff:1,feed:116,sun:'⚡',text:'More reactant enters — more heat released!'},
    {name:'💧 COOLING FLOW DIP',ambient:34,heat:2.2,coolEff:.58,feed:100,sun:'💧',text:'Cooling capacity dropped!'}
  ];

  function resetReact() {
    stopAll();
    reactRunning = false; reactLeft = 20; temp = 155; pressure = 5; feed = 100; product = 94; cooling = 50;
    ambient = 30; heatLoad = 0; coolingEfficiency = 1; profit = 0; dangerTime = 0; eventIndex = 0;
    lastReactFrame = 0; lastUiUpdate = 0;
    $('#reactTime').textContent = '20';
    $('#reactOverlay').classList.remove('hidden');
    $('#blowdown').classList.remove('show');
    updateReactUI();
    setWeather('🌤️','Normal conditions',30);
  }

  function setWeather(icon, text, temperature) {
    $('#sun').textContent = icon;
    $('#ambient').textContent = temperature + '°C';
    $('#weatherText').textContent = text;
    if (temperature >= 40) $('#reactField').style.background = 'linear-gradient(#5b2910 0 52%,#211007 52%)';
    else if (temperature <= 26) $('#reactField').style.background = 'linear-gradient(#0a2743 0 52%,#0e1724 52%)';
    else $('#reactField').style.background = 'linear-gradient(#101720 0 52%,#15100d 52%)';
  }

  function startReact() {
    if (reactRunning) return;
    ensureAudio(); dramatic(); startMusic(); startGamepadPolling();
    reactRunning = true;
    lastReactFrame = performance.now();
    $('#reactOverlay').classList.add('hidden');
    reactTimer = setInterval(function () {
      reactLeft--;
      $('#reactTime').textContent = reactLeft;
      if (reactLeft === 15 || reactLeft === 9 || reactLeft === 4) disturb();
      if (reactLeft <= 0) finishReact(false);
    }, 1000);
    reactLoopId = requestAnimationFrame(reactLoop);
  }

  function disturb() {
    var event = events[eventIndex++ % events.length];
    ambient = event.ambient; heatLoad = event.heat; coolingEfficiency = event.coolEff; feed = event.feed;
    setWeather(event.sun,event.text,event.ambient); dramatic();
    var weather = $('#weather');
    weather.querySelector('span').textContent = event.name;
    $('#sun').style.transform = 'scale(1.22) rotate(8deg)';
    setTimeout(function () {
      $('#sun').style.transform = '';
      if (reactRunning) weather.querySelector('span').textContent = '🇧🇭 BAHRAIN';
    }, 1300);
  }

  function adjustCool(amount) {
    if (!reactRunning) return;
    cooling = Math.max(0, Math.min(100, cooling + amount));
    tone(amount > 0 ? 520 : 300, .045, 'square', .04);
  }

  $('#reactGo').addEventListener('click', startReact);

  /* Press-and-hold touch controls. One quick press still works like a click. */
  var holdTimer = null;
  var holdInterval = null;
  function startHold(button, amount, event) {
    if (event) event.preventDefault();
    if (!reactRunning) return;
    button.classList.add('pressed');
    adjustCool(amount);
    clearTimeout(holdTimer); clearInterval(holdInterval);
    holdTimer = setTimeout(function () {
      holdInterval = setInterval(function () { adjustCool(amount * 0.55); }, 90);
    }, 220);
  }
  function stopHold(button) {
    button.classList.remove('pressed');
    clearTimeout(holdTimer); clearInterval(holdInterval);
    holdTimer = null; holdInterval = null;
  }

  var lessCool = $('#lessCool');
  var moreCool = $('#moreCool');
  lessCool.addEventListener('pointerdown', function (e) { startHold(lessCool,-8,e); });
  moreCool.addEventListener('pointerdown', function (e) { startHold(moreCool,8,e); });
  ['pointerup','pointercancel','pointerleave'].forEach(function (name) {
    lessCool.addEventListener(name, function () { stopHold(lessCool); });
    moreCool.addEventListener(name, function () { stopHold(moreCool); });
  });

  function reactLoop(now) {
    if (!reactRunning) return;
    var dt = Math.min(.05, Math.max(.008, (now - lastReactFrame) / 1000 || .016));
    lastReactFrame = now;

    var rateFactor = Math.max(.18, Math.min(1.72, Math.exp((temp - 155) / 26)));
    var feedFactor = feed / 100;
    var reactionRate = rateFactor * feedFactor;
    product = Math.max(18, Math.min(155, 94 * reactionRate));

    var weatherPush = (ambient - 30) * .20;
    var feedPush = (feed - 100) * .12;
    var selfHeating = (reactionRate - 1) * 10.5;
    var coolingPush = (cooling - 50) * .34 * coolingEfficiency;
    var equilibrium = 155 + weatherPush + feedPush + heatLoad + selfHeating - coolingPush;

    temp += (equilibrium - temp) * .72 * dt;
    pressure = 5 + Math.max(-.7, (temp - 155) * .052) + (feed - 100) * .012;

    var tooCold = temp < 147;
    var tooHot = temp > 163;
    var coolingCost = cooling * .34;
    var revenue = product * 2.45;
    var instabilityPenalty = tooHot ? Math.max(0,temp - 163) * 4 : (tooCold ? Math.max(0,147 - temp) * 1.4 : 0);
    profit += (revenue - coolingCost - instabilityPenalty) * dt;

    if (temp > 183 || pressure > 6.75) dangerTime += dt;
    else dangerTime = Math.max(0,dangerTime - dt * 1.8);

    if (dangerTime > 1) { finishReact(true); return; }

    /* Physics stays smooth at display refresh rate; expensive text DOM updates are capped at ~20 fps. */
    if (now - lastUiUpdate >= 50) {
      updateReactUI();
      lastUiUpdate = now;
    }
    reactLoopId = requestAnimationFrame(reactLoop);
  }

  function updateReactUI() {
    $('#feed').textContent = Math.round(feed);
    $('#prod').textContent = Math.round(product);
    $('#temp').textContent = temp.toFixed(0);
    $('#pressure').textContent = pressure.toFixed(1);
    $('#cool').textContent = Math.round(cooling);
    $('#profit').textContent = Math.max(0,Math.round(profit)).toLocaleString();
    var pos = Math.max(2, Math.min(98, 50 - (temp - 155) * 2.2));
    $('#needle').style.top = pos + '%';

    var status = $('#reactStatus');
    if (temp < 147) { status.className='reactStatus cold'; status.textContent='❄️ COLD → SLOW REACTION · LOW FLOW'; }
    else if (temp <= 163) { status.className='reactStatus good'; status.textContent='⚡ BEST REACTION ZONE · MAX PROFIT'; }
    else if (temp < 178) { status.className='reactStatus hot'; status.textContent='🔥 HOT → REACTION SPEEDING UP'; }
    else { status.className='reactStatus danger'; status.textContent='🚨 RUNAWAY RISK · COOL NOW!'; }
  }

  function finishReact(blowdown) {
    if (!reactRunning) return;
    reactRunning = false;
    clearInterval(reactTimer);
    cancelAnimationFrame(reactLoopId);
    stopHold(lessCool); stopHold(moreCool);

    if (blowdown) {
      $('#blowdown').classList.add('show'); bad(); kick(.22); tone(72,1,'sawtooth',.14); noise(.6,.09);
      var emergencyScore = -250000 + Math.round(profit);
      setTimeout(function () {
        lastResult = { game:'react', score:emergencyScore, detail:'Exothermic runaway risk triggered ESD + blowdown. Equipment protected, production lost.' };
        showResult();
      }, 900);
    } else {
      var finalScore = Math.max(0,Math.round(profit));
      good();
      lastResult = { game:'react', score:finalScore, detail:'20-second shift complete. Keeping R-101 warm enough increased reaction rate, product flow, and profit.' };
      showResult();
    }
  }

  /* ---------- Result screen ---------- */
  function showResult() {
    stopAll();
    $('#saveMsg').textContent = '';
    $('#playerName').value = '';
    $('#playerMajor').value = '';

    if (lastResult.game === 'sep') {
      currentGame = 'sep';
      $('#resultTitle').textContent = 'Product Purity';
      $('#resultScore').textContent = lastResult.score.toFixed(1) + '%';
      $('#resultDetail').textContent = lastResult.detail;
      $('#boardTitle').textContent = '🧪 3-Phase Separator Leaderboard';
    } else {
      currentGame = 'react';
      $('#resultTitle').textContent = lastResult.score < 0 ? 'Emergency Blowdown' : 'Operating Profit';
      $('#resultScore').textContent = (lastResult.score < 0 ? '−$' : '$') + Math.abs(Math.round(lastResult.score)).toLocaleString();
      $('#resultDetail').textContent = lastResult.detail;
      $('#boardTitle').textContent = '🔥 R-101 Profit Leaderboard';
    }
    renderBoard();
    screens.forEach(function (screen) { screen.classList.remove('active'); });
    $('#result').classList.add('active');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];
    });
  }

  function renderBoard() {
    var data = boards();
    var arr = (currentGame === 'sep' ? data.sep : data.react).slice().sort(function (a,b) { return b.score - a.score; }).slice(0,10);
    var box = $('#boardRows');
    box.innerHTML = '';
    if (!arr.length) { box.innerHTML = '<div style="color:#9fb1c5">No scores yet — be first.</div>'; return; }

    arr.forEach(function (record,index) {
      var row = document.createElement('div');
      row.className = 'row';
      var scoreText = currentGame === 'sep' ? record.score.toFixed(1) + '%' : (record.score < 0 ? '−$' : '$') + Math.abs(Math.round(record.score)).toLocaleString();
      row.innerHTML = '<b>#' + (index + 1) + '</b><b>' + escapeHtml(record.name) + '</b><span>' + escapeHtml(record.major) + '</span><b>' + scoreText + '</b>';
      box.appendChild(row);
    });
  }

  $('#saveScore').addEventListener('click', function () {
    var name = $('#playerName').value.trim();
    var major = $('#playerMajor').value;
    if (!name || !major) { $('#saveMsg').textContent = 'Enter your name and choose your major.'; return; }

    var data = boards();
    data[currentGame].push({name:name,major:major,score:lastResult.score});
    data[currentGame] = data[currentGame].sort(function (a,b) { return b.score - a.score; }).slice(0,50);
    saveBoards(data);
    $('#saveMsg').textContent = '✓ Added to leaderboard';
    renderBoard(); bests();
  });

  $('#playAgain').addEventListener('click', function () {
    if (currentGame === 'sep') { resetSep(); showWithoutStop('sepGame'); }
    else { resetReact(); showWithoutStop('reactGame'); }
  });

  $('#backGames').addEventListener('click', function () {
    currentGame = null;
    bests();
    show('choose');
  });

  function showWithoutStop(id) {
    screens.forEach(function (screen) { screen.classList.remove('active'); });
    $('#' + id).classList.add('active');
    window.scrollTo(0,0);
  }

  /* ---------- Keyboard controls ---------- */
  document.addEventListener('keydown', function (event) {
    if (document.activeElement && ['INPUT','SELECT'].indexOf(document.activeElement.tagName) !== -1) return;

    if (currentGame === 'sep' && sepRunning) {
      if (event.key === '1' || event.key === 'ArrowLeft') { event.preventDefault(); route('gas'); }
      if (event.key === '2' || event.key === 'ArrowDown') { event.preventDefault(); route('oil'); }
      if (event.key === '3' || event.key === 'ArrowRight') { event.preventDefault(); route('water'); }
    }

    if (currentGame === 'react' && reactRunning) {
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') { event.preventDefault(); adjustCool(8); }
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') { event.preventDefault(); adjustCool(-8); }
    }
  });

  /* ---------- PS5 / generic gamepad support ---------- */
  var gamepadTimer = null;
  var gp0 = false, gp1 = false, gp2 = false;
  function startGamepadPolling() {
    if (gamepadTimer || !navigator.getGamepads) return;
    gamepadTimer = setInterval(pollGamepad, 90);
  }
  function stopGamepadPolling() {
    if (gamepadTimer) clearInterval(gamepadTimer);
    gamepadTimer = null;
  }
  function pollGamepad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var pad = pads && pads[0];
    if (!pad) return;

    if (currentGame === 'sep' && sepRunning) {
      if (pad.buttons[2] && pad.buttons[2].pressed && !gp2) { route('gas'); gp2 = true; }
      else if (!pad.buttons[2] || !pad.buttons[2].pressed) gp2 = false;
      if (pad.buttons[0] && pad.buttons[0].pressed && !gp0) { route('oil'); gp0 = true; }
      else if (!pad.buttons[0] || !pad.buttons[0].pressed) gp0 = false;
      if (pad.buttons[1] && pad.buttons[1].pressed && !gp1) { route('water'); gp1 = true; }
      else if (!pad.buttons[1] || !pad.buttons[1].pressed) gp1 = false;
    }

    if (currentGame === 'react' && reactRunning && pad.axes.length) {
      if (pad.axes[0] > .55) adjustCool(1.5);
      if (pad.axes[0] < -.55) adjustCool(-1.5);
    }
  }

  window.addEventListener('gamepadconnected', function (event) {
    $('#controlStatus').textContent = '🎮 ' + (event.gamepad.id.indexOf('DualSense') >= 0 ? 'PS5 READY' : 'CONTROLLER READY');
  });
  window.addEventListener('gamepaddisconnected', function () {
    $('#controlStatus').textContent = '⌨️ 👆 READY';
  });

  function stopAll() {
    sepRunning = false;
    reactRunning = false;
    clearInterval(sepTimer);
    clearInterval(reactTimer);
    cancelAnimationFrame(sepAnim);
    cancelAnimationFrame(reactLoopId);
    clearTimeout(holdTimer);
    clearInterval(holdInterval);
    stopMusic();
    stopGamepadPolling();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopAll();
  });

  bests();
})();
