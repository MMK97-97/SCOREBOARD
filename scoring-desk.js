(() => {
  'use strict';

  const STORAGE_KEY = 'mk97-scoring-desk-v1';
  const MAX_OVERS = 20;

  const $ = (id) => document.getElementById(id);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const initialState = () => ({
    battingTeam: 'Thunderbolts',
    bowlingTeam: 'Strikers',
    runs: 0,
    wickets: 0,
    balls: 0,
    extras: { wd: 0, nb: 0, b: 0, lb: 0 },
    striker: 0,
    nonStriker: 1,
    nextBatter: 2,
    batters: Array.from({ length: 11 }, (_, i) => ({
      name: `Thunderbolts Player ${i + 1}`,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      out: false
    })),
    bowler: {
      name: 'Strikers Player 1',
      balls: 0,
      runs: 0,
      wickets: 0,
      wides: 0,
      noBalls: 0
    },
    currentOver: [],
    deliveries: [],
    partnershipRuns: 0,
    partnershipBalls: 0,
    history: []
  });

  let state = loadState();

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Array.isArray(saved.batters)) return initialState();
      saved.history = [];
      return saved;
    } catch {
      return initialState();
    }
  }

  function saveState() {
    const copy = structuredCloneSafe(state);
    copy.history = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
  }

  function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function pushHistory() {
    const snapshot = structuredCloneSafe(state);
    snapshot.history = [];
    state.history.push(snapshot);
    if (state.history.length > 60) state.history.shift();
  }

  function oversText(balls) {
    return `${Math.floor(balls / 6)}.${balls % 6}`;
  }

  function strikeRate(batter) {
    return batter.balls ? ((batter.runs / batter.balls) * 100).toFixed(2) : '0.00';
  }

  function currentRunRate() {
    return state.balls ? (state.runs / (state.balls / 6)).toFixed(2) : '0.00';
  }

  function projectedScore() {
    if (!state.balls) return 0;
    return Math.round((state.runs / state.balls) * (MAX_OVERS * 6));
  }

  function extrasTotal() {
    return state.extras.wd + state.extras.nb + state.extras.b + state.extras.lb;
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map((p) => p[0]).join('') || '—').toUpperCase();
  }

  function swapStrike() {
    [state.striker, state.nonStriker] = [state.nonStriker, state.striker];
  }

  function addDelivery({ token, runs, legal, type, text }) {
    state.deliveries.push({
      id: Date.now() + Math.random(),
      token,
      runs,
      legal,
      type,
      text,
      score: `${state.runs}/${state.wickets}`,
      ball: legal ? `${Math.floor((state.balls - 1) / 6)}.${((state.balls - 1) % 6) + 1}` : `${oversText(state.balls)}`
    });

    state.currentOver.push(token);
    if (state.currentOver.length > 12) state.currentOver.shift();
  }

  function finishLegalBall() {
    if (state.balls > 0 && state.balls % 6 === 0) {
      swapStrike();
      state.currentOver = [];
    }
  }

  function scoreRun(runs) {
    if (state.wickets >= 10 || state.balls >= MAX_OVERS * 6) return;

    pushHistory();

    const batter = state.batters[state.striker];
    const bowler = state.bowler;

    state.runs += runs;
    state.balls += 1;
    state.partnershipRuns += runs;
    state.partnershipBalls += 1;

    batter.runs += runs;
    batter.balls += 1;
    if (runs === 4) batter.fours += 1;
    if (runs === 6) batter.sixes += 1;

    bowler.balls += 1;
    bowler.runs += runs;

    addDelivery({
      token: String(runs),
      runs,
      legal: true,
      type: 'run',
      text: runs === 0
        ? `${bowler.name} to ${batter.name}, dot ball.`
        : runs === 4
          ? `${bowler.name} to ${batter.name}, FOUR.`
          : runs === 6
            ? `${bowler.name} to ${batter.name}, SIX.`
            : `${bowler.name} to ${batter.name}, ${runs} run${runs === 1 ? '' : 's'}.`
    });

    if (runs % 2 === 1) swapStrike();
    finishLegalBall();
    commit();
  }

  function scoreWicket() {
    if (state.wickets >= 10 || state.balls >= MAX_OVERS * 6) return;

    pushHistory();

    const batter = state.batters[state.striker];
    const bowler = state.bowler;

    state.wickets += 1;
    state.balls += 1;
    state.partnershipBalls += 1;

    batter.balls += 1;
    batter.out = true;
    bowler.balls += 1;
    bowler.wickets += 1;

    addDelivery({
      token: 'W',
      runs: 0,
      legal: true,
      type: 'wicket',
      text: `${bowler.name} to ${batter.name}, WICKET!`
    });

    state.partnershipRuns = 0;
    state.partnershipBalls = 0;

    if (state.nextBatter < state.batters.length) {
      state.striker = state.nextBatter;
      state.nextBatter += 1;
    }

    finishLegalBall();
    commit();
  }

  function scoreExtra(type) {
    if (state.wickets >= 10 || state.balls >= MAX_OVERS * 6) return;

    pushHistory();

    const batter = state.batters[state.striker];
    const bowler = state.bowler;
    const legal = type === 'bye' || type === 'legbye';

    state.runs += 1;
    state.partnershipRuns += 1;

    if (type === 'wide') {
      state.extras.wd += 1;
      bowler.wides += 1;
      bowler.runs += 1;
    }

    if (type === 'noball') {
      state.extras.nb += 1;
      bowler.noBalls += 1;
      bowler.runs += 1;
    }

    if (type === 'bye') state.extras.b += 1;
    if (type === 'legbye') state.extras.lb += 1;

    if (legal) {
      state.balls += 1;
      state.partnershipBalls += 1;
      batter.balls += 1;
      bowler.balls += 1;
    }

    const tokenMap = { wide: 'Wd', noball: 'Nb', bye: '1B', legbye: '1Lb' };
    const textMap = {
      wide: 'Wide ball, one extra.',
      noball: 'No ball, one extra.',
      bye: 'Bye, one run.',
      legbye: 'Leg bye, one run.'
    };

    addDelivery({
      token: tokenMap[type],
      runs: 1,
      legal,
      type,
      text: `${bowler.name} to ${batter.name}, ${textMap[type]}`
    });

    if (legal) {
      swapStrike();
      finishLegalBall();
    }

    commit();
  }

  function undo() {
    if (!state.history.length) return;
    const previous = state.history.pop();
    const remaining = state.history;
    state = previous;
    state.history = remaining;
    commit(false);
  }

  function resetMatch() {
    if (!confirm('Reset the scoring desk and clear all recorded balls?')) return;
    state = initialState();
    localStorage.removeItem(STORAGE_KEY);
    commit();
  }

  function commit(save = true) {
    if (save) saveState();
    render();
  }

  function ballClass(token) {
    if (token === 'W') return 'wicket';
    if (token === '4') return 'four';
    if (token === '6') return 'six';
    if (/Wd|Nb|B|Lb/.test(token)) return 'extra';
    return 'neutral';
  }

  function renderCurrentOver() {
    const container = $('currentOver');
    if (!state.currentOver.length) {
      container.innerHTML = '<span class="ball neutral">—</span>';
      return;
    }
    container.innerHTML = state.currentOver.map((token) => `<span class="ball ${ballClass(token)}">${token}</span>`).join('');
  }

  function renderTimeline() {
    const container = $('timeline');
    const recent = [...state.deliveries].slice(-7).reverse();

    if (!recent.length) {
      container.innerHTML = '<div class="empty-state">No balls recorded yet. Start scoring to build the live feed.</div>';
      return;
    }

    container.innerHTML = recent.map((item) => `
      <article class="timeline-item">
        <div class="timeline-ball">${item.ball}</div>
        <div class="timeline-copy">
          <strong>${item.token} · ${item.score}</strong>
          <p>${escapeHtml(item.text)}</p>
        </div>
      </article>
    `).join('');
  }

  function render() {
    const striker = state.batters[state.striker];
    const nonStriker = state.batters[state.nonStriker];
    const bowler = state.bowler;

    const fours = state.batters.reduce((sum, batter) => sum + batter.fours, 0);
    const sixes = state.batters.reduce((sum, batter) => sum + batter.sixes, 0);
    const dotBalls = state.deliveries.filter((d) => d.legal && d.type === 'run' && d.runs === 0).length;
    const last12 = state.deliveries.slice(-12).reduce((sum, d) => sum + (d.runs || 0), 0);
    const runsThisOver = state.currentOver.reduce((sum, token) => {
      if (token === 'W') return sum;
      if (token === 'Wd' || token === 'Nb') return sum + 1;
      const match = token.match(/^\d+/);
      return sum + (match ? Number(match[0]) : 0);
    }, 0);

    $('teamName').textContent = state.battingTeam;
    $('teamCrest').textContent = initials(state.battingTeam).slice(0, 1);
    $('score').textContent = `${state.runs}/${state.wickets}`;
    $('overs').textContent = `${oversText(state.balls)} ov`;
    $('crr').textContent = currentRunRate();
    $('projected').textContent = projectedScore();
    $('extras').textContent = extrasTotal();
    $('partnership').textContent = state.partnershipRuns;
    $('last12').textContent = last12;
    $('boundaries').textContent = fours + sixes;
    $('runsThisOver').textContent = runsThisOver;
    $('dotBalls').textContent = dotBalls;
    $('foursSixes').textContent = `${fours} / ${sixes}`;
    $('wicketsLeft').textContent = Math.max(0, 10 - state.wickets);
    $('ringOvers').textContent = oversText(state.balls);

    const progress = Math.min(1, state.balls / (MAX_OVERS * 6));
    $('progressRing').style.setProperty('--progress', `${progress * 360}deg`);

    if (state.balls === 0) {
      $('situation').innerHTML = 'Ready to begin <span>live scoring.</span>';
    } else if (state.wickets >= 10) {
      $('situation').innerHTML = `Innings complete <span>${state.runs} all out.</span>`;
    } else if (state.balls >= MAX_OVERS * 6) {
      $('situation').innerHTML = `Innings complete <span>${state.runs}/${state.wickets}.</span>`;
    } else {
      $('situation').innerHTML = `${state.runs}/${state.wickets} after <span>${oversText(state.balls)} overs.</span>`;
    }

    $('strikerAvatar').textContent = initials(striker.name);
    $('strikerName').textContent = striker.name;
    $('strikerRuns').textContent = striker.runs;
    $('strikerBalls').textContent = striker.balls;
    $('strikerSR').textContent = strikeRate(striker);

    $('nonStrikerAvatar').textContent = initials(nonStriker.name);
    $('nonStrikerName').textContent = nonStriker.name;
    $('nonStrikerRuns').textContent = nonStriker.runs;
    $('nonStrikerBalls').textContent = nonStriker.balls;
    $('nonStrikerSR').textContent = strikeRate(nonStriker);

    $('bowlerAvatar').textContent = initials(bowler.name);
    $('bowlerName').textContent = bowler.name;
    $('bowlerFigures').textContent = `${oversText(bowler.balls)} · ${bowler.runs}/${bowler.wickets}`;

    $('undoBtn').disabled = !state.history.length;
    renderCurrentOver();
    renderTimeline();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char]));
  }

  $$('.run-btn').forEach((button) => {
    button.addEventListener('click', () => scoreRun(Number(button.dataset.runs)));
  });

  $$('.extra-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'wicket') scoreWicket();
      else scoreExtra(action);
    });
  });

  $('swapStrikeBtn').addEventListener('click', () => {
    pushHistory();
    swapStrike();
    commit();
  });

  $('undoBtn').addEventListener('click', undo);
  $('resetBtn').addEventListener('click', resetMatch);

  document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select')) return;
    if (/^[0-6]$/.test(event.key)) scoreRun(Number(event.key));
    if (event.key.toLowerCase() === 'w') scoreWicket();
    if (event.key.toLowerCase() === 'u') undo();
  });

  render();
})();
