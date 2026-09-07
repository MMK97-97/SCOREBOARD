(() => {
  'use strict';

  const STORAGE_KEY = 'mk97-scoring-desk-v10';
  const $ = id => document.getElementById(id);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const defaultPlayers = team => Array.from({ length: 11 }, (_, i) => `${team} Player ${i + 1}`);

  function createInnings(battingTeam, bowlingTeam, battingPlayers, bowlingPlayers, oversLimit) {
    return {
      battingTeam,
      bowlingTeam,
      oversLimit,
      runs: 0,
      wickets: 0,
      balls: 0,
      extras: { wd: 0, nb: 0, b: 0, lb: 0 },
      batters: battingPlayers.map(name => ({ name, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, dismissal: '' })),
      bowlers: bowlingPlayers.map(name => ({ name, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 })),
      striker: 0,
      nonStriker: 1,
      nextBatter: 2,
      bowler: 0,
      currentOver: [],
      overHistory: [],
      deliveries: [],
      partnershipRuns: 0,
      partnershipBalls: 0,
      complete: false
    };
  }

  function freshState() {
    const teamA = 'Thunderbolts';
    const teamB = 'Strikers';
    const playersA = defaultPlayers(teamA);
    const playersB = defaultPlayers(teamB);
    return {
      version: 10,
      configured: false,
      scorer: 'Scorer',
      teamA,
      teamB,
      playersA,
      playersB,
      oversLimit: 20,
      batFirst: 'A',
      currentInnings: 0,
      target: null,
      matchComplete: false,
      result: '',
      innings: [createInnings(teamA, teamB, playersA, playersB, 20)],
      history: []
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== 10) return freshState();
      saved.history = [];
      saved.innings.forEach(inn => {
        if (!Array.isArray(inn.overHistory)) inn.overHistory = [];
        if (!Array.isArray(inn.currentOver)) inn.currentOver = [];
      });
      return saved;
    } catch {
      return freshState();
    }
  }

  let state = loadState();
  let eventState = { type: null, values: {} };
  let batterEditTarget = 'striker';

  const current = () => state.innings[state.currentInnings];
  const oversText = balls => `${Math.floor((balls || 0) / 6)}.${(balls || 0) % 6}`;
  const oversToBalls = value => {
    const match = String(value || '0.0').trim().match(/^(\d+)(?:\.(\d))?$/);
    return match ? Number(match[1]) * 6 + Math.min(5, Number(match[2] || 0)) : 0;
  };
  const initials = name => String(name || '—').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '—';
  const strikeRate = b => b && b.balls ? ((b.runs / b.balls) * 100).toFixed(2) : '0.00';
  const economy = b => b && b.balls ? (b.runs / (b.balls / 6)).toFixed(2) : '0.00';
  const runRate = inn => inn.balls ? (inn.runs / (inn.balls / 6)).toFixed(2) : '0.00';
  const maxWickets = inn => Math.min(10, inn.batters.length - 1);

  function save() {
    const copy = clone(state);
    copy.history = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
  }

  function pushHistory() {
    const snap = clone(state);
    snap.history = [];
    state.history.push(snap);
    if (state.history.length > 100) state.history.shift();
  }

  function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    $('toastStack').appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 180);
    }, 2100);
  }

  function undo() {
    if (!state.history.length) {
      toast('Nothing to undo.');
      return;
    }
    const previous = state.history.pop();
    const history = state.history;
    state = previous;
    state.history = history;
    save();
    render();
    toast('Last action undone.');
  }

  function canScore() {
    if (!state.configured) {
      openSetup();
      return false;
    }
    if (state.matchComplete || current().complete) {
      toast('This innings is complete.');
      return false;
    }
    return true;
  }

  function swapStrike(inn) {
    [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker];
  }

  function newBatter(inn, side) {
    if (inn.nextBatter >= inn.batters.length) return;
    if (side === 'striker') inn.striker = inn.nextBatter;
    else inn.nonStriker = inn.nextBatter;
    inn.nextBatter++;
  }

  function record(inn, { type, runs = 0, legal = false, token }) {
    inn.deliveries.push({ id: Date.now() + Math.random(), type, runs, legal, token });
    inn.currentOver.push(token);
  }

  function finishOver(inn) {
    if (!(inn.balls > 0 && inn.balls % 6 === 0)) return;
    const bow = inn.bowlers[inn.bowler];
    inn.overHistory.push({
      number: Math.floor(inn.balls / 6),
      bowlerIndex: inn.bowler,
      bowlerName: bow.name,
      balls: [...inn.currentOver],
      figures: {
        balls: bow.balls,
        runs: bow.runs,
        wickets: bow.wickets,
        wides: bow.wides,
        noBalls: bow.noBalls
      }
    });
    if (inn.overHistory.length > 20) inn.overHistory.shift();
    inn.currentOver = [];
    swapStrike(inn);
    toast(`Over ${Math.floor(inn.balls / 6)} complete.`);
  }

  function finishMatch() {
    const first = state.innings[0];
    const second = state.innings[1];
    state.matchComplete = true;
    if (second.runs >= state.target) {
      const wicketsLeft = Math.max(0, maxWickets(second) - second.wickets);
      state.result = `${second.battingTeam} won by ${wicketsLeft} wicket${wicketsLeft === 1 ? '' : 's'}`;
    } else if (second.runs === first.runs) {
      state.result = 'Match tied';
    } else {
      const margin = first.runs - second.runs;
      state.result = `${first.battingTeam} won by ${margin} run${margin === 1 ? '' : 's'}`;
    }
    toast(state.result);
  }

  function startSecondInnings() {
    const first = current();
    state.target = first.runs + 1;
    const battingTeam = state.batFirst === 'A' ? state.teamB : state.teamA;
    const bowlingTeam = state.batFirst === 'A' ? state.teamA : state.teamB;
    const battingPlayers = state.batFirst === 'A' ? state.playersB : state.playersA;
    const bowlingPlayers = state.batFirst === 'A' ? state.playersA : state.playersB;
    state.innings.push(createInnings(battingTeam, bowlingTeam, battingPlayers, bowlingPlayers, state.oversLimit));
    state.currentInnings = 1;
    toast(`${battingTeam} need ${state.target} to win.`);
  }

  function maybeComplete() {
    const inn = current();
    const complete = inn.wickets >= maxWickets(inn) || inn.balls >= inn.oversLimit * 6 || (state.currentInnings === 1 && state.target && inn.runs >= state.target);
    if (!complete) return false;
    inn.complete = true;
    if (state.currentInnings === 0) startSecondInnings();
    else finishMatch();
    return true;
  }

  function scoreRun(runs) {
    if (!canScore()) return;
    pushHistory();
    const inn = current();
    const bat = inn.batters[inn.striker];
    const bow = inn.bowlers[inn.bowler];

    inn.runs += runs;
    inn.balls++;
    bat.runs += runs;
    bat.balls++;
    bow.balls++;
    bow.runs += runs;
    inn.partnershipRuns += runs;
    inn.partnershipBalls++;
    if (runs === 4) bat.fours++;
    if (runs === 6) bat.sixes++;

    record(inn, { type: 'run', runs, legal: true, token: String(runs) });
    if (runs % 2) swapStrike(inn);
    if (!maybeComplete()) finishOver(inn);
    save();
    render();
  }

  function scoreBye(type, runs) {
    if (!canScore()) return;
    pushHistory();
    const inn = current();
    const bat = inn.batters[inn.striker];
    const bow = inn.bowlers[inn.bowler];

    inn.runs += runs;
    inn.balls++;
    bat.balls++;
    bow.balls++;
    inn.partnershipRuns += runs;
    inn.partnershipBalls++;
    if (type === 'bye') inn.extras.b += runs;
    else inn.extras.lb += runs;

    record(inn, { type, runs, legal: true, token: `${runs}${type === 'bye' ? 'B' : 'Lb'}` });
    if (runs % 2) swapStrike(inn);
    if (!maybeComplete()) finishOver(inn);
    save();
    render();
    closeModal('eventModal');
  }

  function dismiss(inn, batterIndex, dismissal, bowlerCredit) {
    const batter = inn.batters[batterIndex];
    if (!batter || batter.out) return;
    batter.out = true;
    batter.dismissal = dismissal;
    inn.wickets++;
    if (bowlerCredit) inn.bowlers[inn.bowler].wickets++;
    inn.partnershipRuns = 0;
    inn.partnershipBalls = 0;
  }

  function applyWide() {
    if (!canScore()) return;
    pushHistory();
    const inn = current();
    const bow = inn.bowlers[inn.bowler];
    const completed = Number(eventState.values.runs || 0);
    const wicket = eventState.values.wicket || 'none';
    const total = 1 + completed;

    inn.runs += total;
    inn.extras.wd += total;
    bow.runs += total;
    bow.wides += total;
    inn.partnershipRuns += total;
    if (completed % 2) swapStrike(inn);

    let token = completed ? `Wd+${completed}` : 'Wd';
    if (wicket !== 'none') {
      let side = wicket === 'runoutNS' ? 'nonStriker' : 'striker';
      if (completed % 2) side = side === 'striker' ? 'nonStriker' : 'striker';
      const index = inn[side];
      const bowlerCredit = wicket === 'stumped' || wicket === 'hitwicket';
      const dismissal = wicket === 'stumped' ? `st b ${bow.name}` : wicket === 'hitwicket' ? 'hit wicket' : 'run out';
      dismiss(inn, index, dismissal, bowlerCredit);
      newBatter(inn, side);
      token += wicket.startsWith('runout') ? '+RO' : '+W';
    }

    record(inn, { type: 'wide', runs: total, legal: false, token });
    maybeComplete();
    save();
    render();
    closeModal('eventModal');
  }

  function applyNoBall() {
    if (!canScore()) return;
    pushHistory();
    const inn = current();
    const bat = inn.batters[inn.striker];
    const bow = inn.bowlers[inn.bowler];
    const add = Number(eventState.values.runs || 0);
    const source = eventState.values.source || 'bat';
    const wicket = eventState.values.wicket || 'none';

    inn.runs += 1 + add;
    inn.extras.nb++;
    bow.noBalls++;
    bow.runs += 1;
    inn.partnershipRuns += 1 + add;

    if (source === 'bat') {
      bat.runs += add;
      bow.runs += add;
      if (add === 4) bat.fours++;
      if (add === 6) bat.sixes++;
    } else if (source === 'bye') {
      inn.extras.b += add;
    } else if (source === 'legbye') {
      inn.extras.lb += add;
    }

    if (add % 2) swapStrike(inn);
    let token = add ? `Nb+${add}` : 'Nb';

    if (wicket !== 'none') {
      let side = wicket === 'runoutNS' ? 'nonStriker' : 'striker';
      if (add % 2) side = side === 'striker' ? 'nonStriker' : 'striker';
      const index = inn[side];
      const dismissal = wicket === 'obstructing' ? 'obstructing the field' : wicket === 'hitballtwice' ? 'hit the ball twice' : 'run out';
      dismiss(inn, index, dismissal, false);
      newBatter(inn, side);
      token += '+W';
    }

    record(inn, { type: 'noball', runs: 1 + add, legal: false, token });
    maybeComplete();
    save();
    render();
    closeModal('eventModal');
  }

  function applyWicket() {
    if (!canScore()) return;
    pushHistory();
    const inn = current();
    const bow = inn.bowlers[inn.bowler];
    const type = eventState.values.dismissal || 'bowled';
    const completed = Number(eventState.values.runs || 0);
    const source = eventState.values.source || 'bat';
    const legal = eventState.values.legal !== 'no';
    const originalStriker = inn.striker;

    if (completed) {
      inn.runs += completed;
      inn.partnershipRuns += completed;
      if (source === 'bat') {
        inn.batters[originalStriker].runs += completed;
        bow.runs += completed;
        if (completed === 4) inn.batters[originalStriker].fours++;
        if (completed === 6) inn.batters[originalStriker].sixes++;
      } else if (source === 'bye') {
        inn.extras.b += completed;
      } else if (source === 'legbye') {
        inn.extras.lb += completed;
      }
      if (completed % 2) swapStrike(inn);
    }

    if (legal) {
      inn.balls++;
      bow.balls++;
      inn.partnershipBalls++;
      inn.batters[originalStriker].balls++;
    }

    let side = type === 'runoutNS' ? 'nonStriker' : 'striker';
    if (completed % 2) side = side === 'striker' ? 'nonStriker' : 'striker';
    const index = inn[side];
    const bowlerCredit = ['bowled', 'caught', 'lbw', 'stumped', 'hitwicket'].includes(type);
    const dismissal = {
      bowled: `b ${bow.name}`,
      caught: `c ? b ${bow.name}`,
      lbw: `lbw b ${bow.name}`,
      stumped: `st ? b ${bow.name}`,
      hitwicket: 'hit wicket',
      runout: 'run out',
      runoutNS: 'run out',
      obstructing: 'obstructing the field',
      hitballtwice: 'hit the ball twice',
      retired: 'retired out',
      timedout: 'timed out'
    }[type] || 'out';

    dismiss(inn, index, dismissal, bowlerCredit);
    newBatter(inn, side);
    record(inn, { type: 'wicket', runs: completed, legal, token: completed ? `W+${completed}` : 'W' });
    if (!maybeComplete() && legal) finishOver(inn);
    save();
    render();
    closeModal('eventModal');
  }

  function requiredRate() {
    if (state.currentInnings !== 1 || !state.target) return '—';
    const inn = current();
    const need = Math.max(0, state.target - inn.runs);
    const ballsLeft = Math.max(0, inn.oversLimit * 6 - inn.balls);
    return ballsLeft ? (need / (ballsLeft / 6)).toFixed(2) : '∞';
  }

  function renderPreviousBowler(inn) {
    const previous = inn.overHistory[inn.overHistory.length - 1];
    if (!previous) {
      $('previousBowlerName').textContent = '—';
      $('previousBowlerFigures').textContent = '0.0 • 0/0';
      $('previousOverSummary').innerHTML = '<span>—</span>';
      return;
    }
    const f = previous.figures;
    $('previousBowlerName').textContent = previous.bowlerName;
    $('previousBowlerFigures').textContent = `${oversText(f.balls)} • ${f.runs}/${f.wickets}`;
    $('previousOverSummary').innerHTML = previous.balls.map(ball => `<span>${ball}</span>`).join('') || '<span>—</span>';
  }

  function renderThreeOvers(inn) {
    const completed = inn.overHistory.slice(-3).map(over => ({ number: over.number, balls: over.balls }));
    const currentOverNumber = Math.floor(inn.balls / 6) + 1;
    if (inn.currentOver.length) completed.push({ number: currentOverNumber, balls: [...inn.currentOver], current: true });
    const lastThree = completed.slice(-3);
    $('threeOverTimeline').innerHTML = lastThree.length ? lastThree.map(over => `
      <div class="over-group">
        <b>${over.current ? 'NOW' : `OV ${over.number}`}</b>
        ${over.balls.map(ball => `<span>${ball}</span>`).join('')}
      </div>
    `).join('') : '<div class="over-group empty"><span>—</span></div>';
  }

  function render() {
    const inn = current();
    const striker = inn.batters[inn.striker] || {};
    const nonStriker = inn.batters[inn.nonStriker] || {};
    const bowler = inn.bowlers[inn.bowler] || {};
    const battingA = inn.battingTeam === state.teamA;

    $('teamAName').textContent = state.teamA;
    $('teamBName').textContent = state.teamB;
    $('teamACrest').textContent = initials(state.teamA);
    $('teamBCrest').textContent = initials(state.teamB);
    $('teamAStatus').textContent = battingA ? 'Batting' : 'Bowling';
    $('teamBStatus').textContent = battingA ? 'Bowling' : 'Batting';
    $('mainScore').textContent = `${inn.runs}/${inn.wickets}`;
    $('mainOvers').textContent = `${oversText(inn.balls)} overs`;
    $('crr').textContent = runRate(inn);
    $('rrr').textContent = requiredRate();
    $('target').textContent = state.target ?? '—';

    $('strikerAvatar').textContent = initials(striker.name);
    $('strikerName').textContent = striker.name || '—';
    $('strikerRuns').textContent = striker.runs || 0;
    $('strikerBalls').textContent = striker.balls || 0;
    $('strikerSR').textContent = strikeRate(striker);
    $('striker4s').textContent = striker.fours || 0;
    $('striker6s').textContent = striker.sixes || 0;

    $('nonStrikerAvatar').textContent = initials(nonStriker.name);
    $('nonStrikerName').textContent = nonStriker.name || '—';
    $('nonStrikerRuns').textContent = nonStriker.runs || 0;
    $('nonStrikerBalls').textContent = nonStriker.balls || 0;
    $('nonStrikerSR').textContent = strikeRate(nonStriker);
    $('nonStriker4s').textContent = nonStriker.fours || 0;
    $('nonStriker6s').textContent = nonStriker.sixes || 0;

    $('bowlerAvatar').textContent = initials(bowler.name);
    $('bowlerName').textContent = bowler.name || '—';
    $('bowlerOvers').textContent = oversText(bowler.balls || 0);
    $('bowlerRuns').textContent = bowler.runs || 0;
    $('bowlerWickets').textContent = bowler.wickets || 0;
    $('bowlerWides').textContent = bowler.wides || 0;
    $('bowlerNB').textContent = bowler.noBalls || 0;
    $('bowlerEcon').textContent = economy(bowler);

    renderPreviousBowler(inn);
    renderThreeOvers(inn);
    $('timelineScore').textContent = `${inn.runs}/${inn.wickets} • ${oversText(inn.balls)}`;

    const disabled = !state.configured || state.matchComplete || inn.complete;
    $$('.run-key,#byeBtn,#legByeBtn,#wicketBtn,#wideBtn,#noBallBtn,#endInningsBtn').forEach(btn => btn.disabled = disabled);
    $('undoBtn').disabled = !state.history.length;
  }

  function openMenu() {
    $('settingsDrawer').classList.add('open');
    $('settingsDrawer').setAttribute('aria-hidden', 'false');
    $('menuBackdrop').classList.add('open');
    $('menuButton').setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    $('settingsDrawer').classList.remove('open');
    $('settingsDrawer').setAttribute('aria-hidden', 'true');
    $('menuBackdrop').classList.remove('open');
    $('menuButton').setAttribute('aria-expanded', 'false');
  }

  function openModal(id) { $(id).classList.add('open'); }
  function closeModal(id) { $(id).classList.remove('open'); }

  function openSetup() {
    $('teamAInput').value = state.teamA;
    $('teamBInput').value = state.teamB;
    $('oversInput').value = state.oversLimit;
    $('batFirstInput').value = state.batFirst;
    $('teamAPlayersInput').value = state.playersA.join('\n');
    $('teamBPlayersInput').value = state.playersB.join('\n');
    openModal('setupModal');
  }

  function parsePlayers(value, team) {
    const players = String(value || '').split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
    return players.length >= 2 ? players : defaultPlayers(team);
  }

  function saveSetup() {
    const teamA = $('teamAInput').value.trim() || 'Team A';
    const teamB = $('teamBInput').value.trim() || 'Team B';
    const oversLimit = Math.max(1, Math.min(100, Number($('oversInput').value) || 20));
    const batFirst = $('batFirstInput').value;
    const playersA = parsePlayers($('teamAPlayersInput').value, teamA);
    const playersB = parsePlayers($('teamBPlayersInput').value, teamB);

    const changed = !state.configured || teamA !== state.teamA || teamB !== state.teamB || oversLimit !== state.oversLimit || batFirst !== state.batFirst || JSON.stringify(playersA) !== JSON.stringify(state.playersA) || JSON.stringify(playersB) !== JSON.stringify(state.playersB);
    if (state.configured && changed && current().deliveries.length && !confirm('Changing teams, squads, batting order or overs will restart the match. Continue?')) return;

    state.teamA = teamA;
    state.teamB = teamB;
    state.playersA = playersA;
    state.playersB = playersB;
    state.oversLimit = oversLimit;
    state.batFirst = batFirst;

    if (changed) {
      const battingTeam = batFirst === 'A' ? teamA : teamB;
      const bowlingTeam = batFirst === 'A' ? teamB : teamA;
      const battingPlayers = batFirst === 'A' ? playersA : playersB;
      const bowlingPlayers = batFirst === 'A' ? playersB : playersA;
      state.currentInnings = 0;
      state.target = null;
      state.matchComplete = false;
      state.result = '';
      state.history = [];
      state.innings = [createInnings(battingTeam, bowlingTeam, battingPlayers, bowlingPlayers, oversLimit)];
    }

    state.configured = true;
    save();
    render();
    closeModal('setupModal');
    toast('Match setup saved.');
  }

  function outcomeTile(value, label, group, cls = '') {
    const active = eventState.values[group] === value ? 'active' : '';
    return `<button type="button" class="outcome-choice ${cls} ${active}" data-group="${group}" data-value="${value}">${label}</button>`;
  }

  function runTiles(group = 'runs', active = '0') {
    eventState.values[group] = active;
    return Array.from({ length: 7 }, (_, i) => outcomeTile(String(i), String(i), group, 'info')).join('');
  }

  function bindOutcomeTiles() {
    $$('#eventFields .outcome-choice').forEach(btn => btn.addEventListener('click', () => {
      eventState.values[btn.dataset.group] = btn.dataset.value;
      $$('#eventFields .outcome-choice').filter(x => x.dataset.group === btn.dataset.group).forEach(x => x.classList.toggle('active', x === btn));
    }));
  }

  function openWide() {
    if (!canScore()) return;
    eventState = { type: 'wide', values: { runs: '0', wicket: 'none' } };
    $('eventTitle').textContent = 'Wide — All Outcomes';
    $('eventSub').textContent = 'Tap the exact outcome.';
    $('eventFields').innerHTML = `
      <div class="outcome-section"><div class="outcome-title">Additional Runs Completed</div><div class="outcome-grid runs">${runTiles('runs', '0')}</div></div>
      <div class="outcome-section"><div class="outcome-title">Wicket Outcome</div><div class="outcome-grid">${outcomeTile('none', 'No Wicket', 'wicket')}${outcomeTile('stumped', 'Stumped', 'wicket', 'danger')}${outcomeTile('hitwicket', 'Hit Wicket', 'wicket', 'danger')}${outcomeTile('runout', 'Run Out Striker', 'wicket', 'danger')}${outcomeTile('runoutNS', 'Run Out Non-Striker', 'wicket', 'danger')}</div></div>
      <div class="outcome-note">Wide does not count as a legal ball.</div>`;
    bindOutcomeTiles();
    openModal('eventModal');
  }

  function openNoBall() {
    if (!canScore()) return;
    eventState = { type: 'noball', values: { source: 'bat', runs: '0', wicket: 'none' } };
    $('eventTitle').textContent = 'No Ball — All Outcomes';
    $('eventSub').textContent = 'Tap the exact outcome.';
    $('eventFields').innerHTML = `
      <div class="outcome-section"><div class="outcome-title">Additional Run Source</div><div class="outcome-grid">${outcomeTile('bat', 'Bat Runs', 'source', 'info')}${outcomeTile('bye', 'Byes', 'source', 'warning')}${outcomeTile('legbye', 'Leg Byes', 'source', 'warning')}</div></div>
      <div class="outcome-section"><div class="outcome-title">Additional Runs</div><div class="outcome-grid runs">${runTiles('runs', '0')}</div></div>
      <div class="outcome-section"><div class="outcome-title">Wicket Outcome</div><div class="outcome-grid">${outcomeTile('none', 'No Wicket', 'wicket')}${outcomeTile('runout', 'Run Out Striker', 'wicket', 'danger')}${outcomeTile('runoutNS', 'Run Out Non-Striker', 'wicket', 'danger')}${outcomeTile('obstructing', 'Obstructing Field', 'wicket', 'danger')}${outcomeTile('hitballtwice', 'Hit Ball Twice', 'wicket', 'danger')}</div></div>`;
    bindOutcomeTiles();
    openModal('eventModal');
  }

  function openWicket() {
    if (!canScore()) return;
    eventState = { type: 'wicket', values: { dismissal: 'bowled', runs: '0', source: 'bat', legal: 'yes' } };
    $('eventTitle').textContent = 'Wicket — All Probabilities';
    $('eventSub').textContent = 'Tap dismissal type and exact delivery outcome.';
    $('eventFields').innerHTML = `
      <div class="outcome-section"><div class="outcome-title">Dismissal Type</div><div class="outcome-grid">${outcomeTile('bowled', 'Bowled', 'dismissal', 'danger')}${outcomeTile('caught', 'Caught', 'dismissal', 'danger')}${outcomeTile('lbw', 'LBW', 'dismissal', 'danger')}${outcomeTile('stumped', 'Stumped', 'dismissal', 'danger')}${outcomeTile('hitwicket', 'Hit Wicket', 'dismissal', 'danger')}${outcomeTile('runout', 'Run Out Striker', 'dismissal', 'danger')}${outcomeTile('runoutNS', 'Run Out Non-Striker', 'dismissal', 'danger')}${outcomeTile('obstructing', 'Obstructing Field', 'dismissal', 'danger')}${outcomeTile('hitballtwice', 'Hit Ball Twice', 'dismissal', 'danger')}${outcomeTile('retired', 'Retired Out', 'dismissal', 'danger')}${outcomeTile('timedout', 'Timed Out', 'dismissal', 'danger')}</div></div>
      <div class="outcome-section"><div class="outcome-title">Runs Completed</div><div class="outcome-grid runs">${runTiles('runs', '0')}</div></div>
      <div class="outcome-section"><div class="outcome-title">Run Type</div><div class="outcome-grid">${outcomeTile('bat', 'Bat Runs', 'source', 'info')}${outcomeTile('bye', 'Byes', 'source', 'warning')}${outcomeTile('legbye', 'Leg Byes', 'source', 'warning')}</div></div>
      <div class="outcome-section"><div class="outcome-title">Legal Ball?</div><div class="outcome-grid">${outcomeTile('yes', 'Yes', 'legal')}${outcomeTile('no', 'No', 'legal')}</div></div>`;
    bindOutcomeTiles();
    openModal('eventModal');
  }

  function openBye(type) {
    if (!canScore()) return;
    eventState = { type, values: { runs: '1' } };
    $('eventTitle').textContent = type === 'bye' ? 'Byes' : 'Leg Byes';
    $('eventSub').textContent = 'Tap runs completed.';
    $('eventFields').innerHTML = `
      <div class="outcome-section"><div class="outcome-title">Runs</div><div class="outcome-grid runs">${Array.from({ length: 6 }, (_, i) => outcomeTile(String(i + 1), String(i + 1), 'runs', 'warning')).join('')}</div></div>
      <div class="outcome-note">This counts as a legal ball.</div>`;
    bindOutcomeTiles();
    openModal('eventModal');
  }

  function applyEvent() {
    if (eventState.type === 'wide') applyWide();
    else if (eventState.type === 'noball') applyNoBall();
    else if (eventState.type === 'wicket') applyWicket();
    else if (eventState.type === 'bye' || eventState.type === 'legbye') scoreBye(eventState.type, Number(eventState.values.runs || 1));
  }

  function openBatter(which) {
    const inn = current();
    batterEditTarget = which;
    $('batterModalTitle').textContent = which === 'striker' ? 'Edit Striker' : 'Edit Non-Striker';
    const selected = which === 'striker' ? inn.striker : inn.nonStriker;
    $('editBatterSelect').innerHTML = inn.batters.map((b, i) => `<option value="${i}" ${i === selected ? 'selected' : ''}>${b.name}${b.out ? ' (out)' : ''}</option>`).join('');
    fillBatter();
    openModal('batterModal');
  }

  function fillBatter() {
    const batter = current().batters[Number($('editBatterSelect').value)];
    if (!batter) return;
    $('editBatterName').value = batter.name;
    $('editBatterRuns').value = batter.runs;
    $('editBatterBalls').value = batter.balls;
    $('editBatter4s').value = batter.fours;
    $('editBatter6s').value = batter.sixes;
    $('editBatterRole').value = batterEditTarget;
  }

  function saveBatter() {
    pushHistory();
    const inn = current();
    const index = Number($('editBatterSelect').value);
    const batter = inn.batters[index];
    if (!batter) return;
    batter.name = $('editBatterName').value.trim() || batter.name;
    batter.runs = Math.max(0, Number($('editBatterRuns').value) || 0);
    batter.balls = Math.max(0, Number($('editBatterBalls').value) || 0);
    batter.fours = Math.max(0, Number($('editBatter4s').value) || 0);
    batter.sixes = Math.max(0, Number($('editBatter6s').value) || 0);

    const role = $('editBatterRole').value;
    if (role === 'striker') {
      if (index === inn.nonStriker) swapStrike(inn);
      else inn.striker = index;
    } else if (role === 'nonstriker') {
      if (index === inn.striker) swapStrike(inn);
      else inn.nonStriker = index;
    }

    save();
    render();
    closeModal('batterModal');
    toast('Batter updated.');
  }

  function openBowler() {
    const inn = current();
    $('editBowlerSelect').innerHTML = inn.bowlers.map((b, i) => `<option value="${i}" ${i === inn.bowler ? 'selected' : ''}>${b.name}</option>`).join('');
    fillBowler();
    openModal('bowlerModal');
  }

  function fillBowler() {
    const inn = current();
    const index = Number($('editBowlerSelect').value);
    const bowler = inn.bowlers[index];
    if (!bowler) return;
    $('editBowlerName').value = bowler.name;
    $('editBowlerOvers').value = oversText(bowler.balls);
    $('editBowlerRuns').value = bowler.runs;
    $('editBowlerWickets').value = bowler.wickets;
    $('editBowlerWides').value = bowler.wides;
    $('editBowlerNB').value = bowler.noBalls;
    $('editBowlerCurrent').value = index === inn.bowler ? 'yes' : 'no';
  }

  function saveBowler() {
    pushHistory();
    const inn = current();
    const index = Number($('editBowlerSelect').value);
    const bowler = inn.bowlers[index];
    if (!bowler) return;
    bowler.name = $('editBowlerName').value.trim() || bowler.name;
    bowler.balls = oversToBalls($('editBowlerOvers').value);
    bowler.runs = Math.max(0, Number($('editBowlerRuns').value) || 0);
    bowler.wickets = Math.max(0, Number($('editBowlerWickets').value) || 0);
    bowler.wides = Math.max(0, Number($('editBowlerWides').value) || 0);
    bowler.noBalls = Math.max(0, Number($('editBowlerNB').value) || 0);
    if ($('editBowlerCurrent').value === 'yes') inn.bowler = index;
    save();
    render();
    closeModal('bowlerModal');
    toast('Bowler updated.');
  }

  function openScorer() {
    $('newScorerInput').value = state.scorer;
    openModal('scorerModal');
  }

  function saveScorer() {
    state.scorer = $('newScorerInput').value.trim() || 'Scorer';
    save();
    closeModal('scorerModal');
    toast('Scorer changed.');
  }

  function resetMatch() {
    if (!confirm('Reset the entire match?')) return;
    state = freshState();
    localStorage.removeItem(STORAGE_KEY);
    save();
    render();
    closeMenu();
    openSetup();
  }

  function endInnings() {
    if (!canScore()) return;
    if (!confirm('End the current innings now?')) return;
    pushHistory();
    current().complete = true;
    if (state.currentInnings === 0) startSecondInnings();
    else finishMatch();
    save();
    render();
  }

  $$('.run-key').forEach(btn => btn.addEventListener('click', () => scoreRun(Number(btn.dataset.runs))));
  $('byeBtn').addEventListener('click', () => openBye('bye'));
  $('legByeBtn').addEventListener('click', () => openBye('legbye'));
  $('wicketBtn').addEventListener('click', openWicket);
  $('wideBtn').addEventListener('click', openWide);
  $('noBallBtn').addEventListener('click', openNoBall);
  $('endInningsBtn').addEventListener('click', endInnings);
  $('undoBtn').addEventListener('click', undo);

  $('menuButton').addEventListener('click', openMenu);
  $('drawerClose').addEventListener('click', closeMenu);
  $('menuBackdrop').addEventListener('click', closeMenu);
  $('menuEditStriker').addEventListener('click', () => { closeMenu(); openBatter('striker'); });
  $('menuEditNonStriker').addEventListener('click', () => { closeMenu(); openBatter('nonstriker'); });
  $('menuEditBowler').addEventListener('click', () => { closeMenu(); openBowler(); });
  $('menuChangeScorer').addEventListener('click', () => { closeMenu(); openScorer(); });
  $('menuResetMatch').addEventListener('click', resetMatch);

  $('setupBtn').addEventListener('click', openSetup);
  $('saveSetupBtn').addEventListener('click', saveSetup);
  $('applyEventBtn').addEventListener('click', applyEvent);
  $('editBatterSelect').addEventListener('change', fillBatter);
  $('saveBatterBtn').addEventListener('click', saveBatter);
  $('editBowlerSelect').addEventListener('change', fillBowler);
  $('saveBowlerBtn').addEventListener('click', saveBowler);
  $('saveScorerBtn').addEventListener('click', saveScorer);

  $$('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  $$('.modal-wrap').forEach(modal => modal.addEventListener('click', e => {
    if (e.target === modal) closeModal(modal.id);
  }));

  document.addEventListener('keydown', event => {
    if (event.target.matches('input,select,textarea')) return;
    if (event.key >= '0' && event.key <= '6') scoreRun(Number(event.key));
    if (event.key.toLowerCase() === 'u') undo();
    if (event.key.toLowerCase() === 'w') openWicket();
    if (event.key.toLowerCase() === 'd') openWide();
    if (event.key.toLowerCase() === 'n') openNoBall();
    if (event.key === 'Escape') {
      closeMenu();
      $$('.modal-wrap.open').forEach(modal => closeModal(modal.id));
    }
  });

  render();
  if (!state.configured) openSetup();
})();
