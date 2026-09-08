
(function () {
  var startButton = document.getElementById('startBtn');
  var tagline = document.getElementById('startTagline');
  var hint = document.getElementById('startHint');

  var messages = [
    'Two chemical-engineering games. Twenty seconds. Beat the board.',
    'Route three phases. Stabilize an exothermic reactor.',
    'Fast booth games built for keyboard, touch, and controllers.'
  ];
  var messageIndex = 0;

  var messageTimer = setInterval(function () {
    messageIndex = (messageIndex + 1) % messages.length;
    tagline.textContent = messages[messageIndex];
  }, 2600);

  function openArcade() {
    clearInterval(messageTimer);
    startButton.disabled = true;
    hint.textContent = 'Loading challenges…';
    document.body.classList.add('leaving');
    setTimeout(function () {
      window.location.href = 'game.html';
    }, 180);
  }

  startButton.addEventListener('click', openArcade);
  startButton.addEventListener('pointerdown', function () {
    hint.textContent = 'Ready? Keep every round under 20 seconds.';
  }, { passive:true });
})();
