(() => {
  'use strict';

  const STORAGE_KEY = 'mk97-scoring-desk-v6';
  const $ = id => document.getElementById(id);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const defaultPlayers = team => Array.from({length:11}, (_,i) => `${team} Player ${i+1}`);

  function createInnings(battingTeam, bowlingTeam, battingPlayers, bowlingPlayers, oversLimit){
    return {
      battingTeam,
      bowlingTeam,
      oversLimit,
      runs:0,
      wickets:0,
      balls:0,
      extras:{wd:0, nb:0, b:0, lb:0},
      batters: battingPlayers.map(name => ({name, runs:0, balls:0, fours:0, sixes:0, out:false, dismissal:''})),
      bowlers: bowlingPlayers.map(name => ({name, balls:0, runs:0, wickets:0, wides:0, noBalls:0})),
      striker:0,
      nonStriker:1,
      nextBatter:2,
      bowler:0,
      currentOver:[],
      deliveries:[],
      partnershipRuns:0,
      partnershipBalls:0,
      complete:false
    };
  }

  function freshState(){
    const teamA = 'Thunderbolts';
    const teamB = 'Strikers';
    const playersA = defaultPlayers(teamA);
    const playersB = defaultPlayers(teamB);
    return {
      version:6,
      configured:false,
      matchName:'Tampa Premier League',
      venue:'Tampa, Florida',
      scorer:'Scorer',
      teamA,
      teamB,
      playersA,
      playersB,
      oversLimit:20,
      batFirst:'A',
      currentInnings:0,
      target:null,
      matchComplete:false,
      result:'',
      innings:[createInnings(teamA, teamB, playersA, playersB, 20)],
      history:[]
    };
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return freshState();
      const s = JSON.parse(raw);
      if(!s || s.version !== 6) return freshState();
      s.history = [];
      return s;
    }catch{
      return freshState();
    }
  }

  let state = loadState();
  let eventState = {type:null, values:{}};
  let batterEditTarget = 'striker';

  const current = () => state.innings[state.currentInnings];
  const oversText = b => `${Math.floor((b || 0) / 6)}.${(b || 0) % 6}`;
  const oversToBalls = v => {
    const m = String(v || '0.0').trim().match(/^(\d+)(?:\.(\d))?$/);
    return m ? (Number(m[1]) * 6 + Math.min(5, Number(m[2] || 0))) : 0;
  };
  const initials = name => (String(name || '—').trim().split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase() || '—');
  const strikeRate = b => b && b.balls ? ((b.runs / b.balls) * 100).toFixed(2) : '0.00';
  const economy = b => b && b.balls ? (b.runs / (b.balls / 6)).toFixed(2) : '0.00';
  const runRate = inn => inn.balls ? (inn.runs / (inn.balls / 6)).toFixed(2) : '0.00';
  const extrasTotal = inn => (inn.extras.wd + inn.extras.nb + inn.extras.b + inn.extras.lb);
  const maxWickets = inn => Math.min(10, inn.batters.length - 1);

  function save(){
    const out = clone(state);
    out.history = [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  }

  function toast(msg){
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('toastStack').appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 180);
    }, 2200);
  }

  function pushHistory(){
    const snap = clone(state);
    snap.history = [];
    state.history.push(snap);
    if(state.history.length > 100) state.history.shift();
  }

  function undo(){
    if(!state.history.length){
      toast('Nothing to undo.');
      return;
    }
    const prev = state.history.pop();
    const hist = state.history;
    state = prev;
    state.history = hist;
    save();
    render();
    toast('Last action undone.');
  }

  function canScore(){
    if(!state.configured){
      openSetup();
      return false;
    }
    if(state.matchComplete || current().complete){
      toast('This innings is complete.');
      return false;
    }
    return true;
  }

  function swapStrike(inn){ [inn.striker, inn.nonStriker] = [inn.nonStriker, inn.striker]; }

  function newBatter(inn, side){
    if(inn.nextBatter >= inn.batters.length) return;
    if(side === 'striker') inn.striker = inn.nextBatter;
    else inn.nonStriker = inn.nextBatter;
    inn.nextBatter++;
  }

  function record(inn, {type, runs=0, legal=false, token}){
    inn.deliveries.push({id:Date.now() + Math.random(), type, runs, legal, token});
    inn.currentOver.push(token);
    if(inn.currentOver.length > 12) inn.currentOver.shift();
  }

  function finishOver(inn){
    if(inn.balls > 0 && inn.balls % 6 === 0){
      swapStrike(inn);
      inn.currentOver = [];
      toast(`Over ${Math.floor(inn.balls / 6)} complete.`);
    }
  }

  function finishMatch(){
    const a = state.innings[0];
    const b = state.innings[1];
    state.matchComplete = true;
    if(b.runs >= state.target){
      const left = Math.max(0, maxWickets(b) - b.wickets);
      state.result = `${b.battingTeam} won by ${left} wicket${left === 1 ? '' : 's'}`;
    }else if(b.runs === a.runs){
      state.result = 'Match tied';
    }else{
      const m = a.runs - b.runs;
      state.result = `${a.battingTeam} won by ${m} run${m === 1 ? '' : 's'}`;
    }
    toast(state.result);
  }

  function maybeComplete(){
    const inn = current();
    const done = inn.wickets >= maxWickets(inn) || inn.balls >= inn.oversLimit * 6 || (state.currentInnings === 1 && state.target && inn.runs >= state.target);
    if(!done) return false;
    inn.complete = true;
    if(state.currentInnings === 0){
      state.target = inn.runs + 1;
      const bt = state.batFirst === 'A' ? state.teamB : state.teamA;
      const bowl = state.batFirst === 'A' ? state.teamA : state.teamB;
      const bp = state.batFirst === 'A' ? state.playersB : state.playersA;
      const bowp = state.batFirst === 'A' ? state.playersA : state.playersB;
      state.innings.push(createInnings(bt, bowl, bp, bowp, state.oversLimit));
      state.currentInnings = 1;
      toast(`${bt} need ${state.target} to win.`);
    }else{
      finishMatch();
    }
    return true;
  }

  function scoreRun(r){
    if(!canScore()) return;
    pushHistory();
    const inn = current();
    const bat = inn.batters[inn.striker];
    const bow = inn.bowlers[inn.bowler];
    inn.runs += r; inn.balls++;
    bat.runs += r; bat.balls++;
    bow.balls++; bow.runs += r;
    inn.partnershipRuns += r; inn.partnershipBalls++;
    if(r === 4) bat.fours++;
    if(r === 6) bat.sixes++;
    record(inn, {type:'run', runs:r, legal:true, token:String(r)});
    if(r % 2) swapStrike(inn);
    if(!maybeComplete()) finishOver(inn);
    save(); render();
  }

  function scoreBye(type, r){
    if(!canScore()) return;
    pushHistory();
    const inn = current();
    const bat = inn.batters[inn.striker];
    const bow = inn.bowlers[inn.bowler];
    inn.runs += r; inn.balls++;
    bat.balls++; bow.balls++;
    inn.partnershipRuns += r; inn.partnershipBalls++;
    if(type === 'bye') inn.extras.b += r; else inn.extras.lb += r;
    record(inn, {type, runs:r, legal:true, token:`${r}${type === 'bye' ? 'B' : 'Lb'}`});
    if(r % 2) swapStrike(inn);
    if(!maybeComplete()) finishOver(inn);
    save(); render(); closeModal('eventModal');
  }

  function dismiss(inn, index, text, bowlerCredit){
    const b = inn.batters[index];
    if(!b || b.out) return;
    b.out = true; b.dismissal = text; inn.wickets++;
    if(bowlerCredit) inn.bowlers[inn.bowler].wickets++;
    inn.partnershipRuns = 0; inn.partnershipBalls = 0;
  }

  function applyWide(){
    if(!canScore()) return;
    pushHistory();
    const inn = current();
    const bow = inn.bowlers[inn.bowler];
    const completed = Number(eventState.values.runs || 0);
    const wicket = eventState.values.wicket || 'none';
    const total = 1 + completed;
    inn.runs += total; inn.extras.wd += total; bow.runs += total; bow.wides += total; inn.partnershipRuns += total;
    if(completed % 2) swapStrike(inn);
    let token = completed ? `Wd+${completed}` : 'Wd';
    if(wicket !== 'none'){
      let side = wicket === 'runoutNS' ? 'nonStriker' : 'striker';
      if(completed % 2) side = side === 'striker' ? 'nonStriker' : 'striker';
      const idx = inn[side];
      const credit = wicket === 'stumped' || wicket === 'hitwicket';
      const text = wicket === 'stumped' ? `st b ${bow.name}` : wicket === 'hitwicket' ? 'hit wicket' : 'run out';
      dismiss(inn, idx, text, credit);
      newBatter(inn, side);
      token += (wicket === 'runout' || wicket === 'runoutNS') ? '+RO' : '+W';
    }
    record(inn, {type:'wide', runs:total, legal:false, token});
    maybeComplete();
    save(); render(); closeModal('eventModal');
  }

  function applyNoBall(){
    if(!canScore()) return;
    pushHistory();
    const inn = current();
    const bat = inn.batters[inn.striker];
    const bow = inn.bowlers[inn.bowler];
    const add = Number(eventState.values.runs || 0);
    const source = eventState.values.source || 'bat';
    const wicket = eventState.values.wicket || 'none';
    inn.runs += 1 + add; inn.extras.nb++; bow.noBalls++; bow.runs += 1; inn.partnershipRuns += 1 + add;
    if(source === 'bat'){
      bat.runs += add; bow.runs += add; if(add === 4) bat.fours++; if(add === 6) bat.sixes++;
    }else if(source === 'bye'){
      inn.extras.b += add;
    }else if(source === 'legbye'){
      inn.extras.lb += add;
    }
    if(add % 2) swapStrike(inn);
    let token = add ? `Nb+${add}` : 'Nb';
    if(wicket !== 'none'){
      let side = wicket === 'runoutNS' ? 'nonStriker' : 'striker';
      if(add % 2) side = side === 'striker' ? 'nonStriker' : 'striker';
      const idx = inn[side];
      const text = wicket === 'obstructing' ? 'obstructing the field' : wicket === 'hitballtwice' ? 'hit the ball twice' : 'run out';
      dismiss(inn, idx, text, false);
      newBatter(inn, side);
      token += '+W';
    }
    record(inn, {type:'noball', runs:1 + add, legal:false, token});
    maybeComplete();
    save(); render(); closeModal('eventModal');
  }

  function applyWicket(){
    if(!canScore()) return;
    pushHistory();
    const inn = current();
    const bow = inn.bowlers[inn.bowler];
    const type = eventState.values.dismissal || 'bowled';
    const completed = Number(eventState.values.runs || 0);
    const source = eventState.values.source || 'bat';
    const legal = eventState.values.legal !== 'no';
    const originalStriker = inn.striker;
    if(completed){
      inn.runs += completed; inn.partnershipRuns += completed;
      if(source === 'bat'){
        inn.batters[originalStriker].runs += completed; bow.runs += completed;
        if(completed === 4) inn.batters[originalStriker].fours++;
        if(completed === 6) inn.batters[originalStriker].sixes++;
      }else if(source === 'bye'){
        inn.extras.b += completed;
      }else if(source === 'legbye'){
        inn.extras.lb += completed;
      }
      if(completed % 2) swapStrike(inn);
    }
    if(legal){
      inn.balls++; bow.balls++; inn.partnershipBalls++; inn.batters[originalStriker].balls++;
    }
    let side = type === 'runoutNS' ? 'nonStriker' : 'striker';
    if(completed % 2) side = side === 'striker' ? 'nonStriker' : 'striker';
    const idx = inn[side];
    const credit = ['bowled','caught','lbw','stumped','hitwicket'].includes(type);
    const text = {
      bowled:`b ${bow.name}`,
      caught:`c ? b ${bow.name}`,
      lbw:`lbw b ${bow.name}`,
      stumped:`st ? b ${bow.name}`,
      hitwicket:'hit wicket',
      runout:'run out',
      runoutNS:'run out',
      obstructing:'obstructing the field',
      hitballtwice:'hit the ball twice',
      retired:'retired out',
      timedout:'timed out'
    }[type] || 'out';
    dismiss(inn, idx, text, credit);
    newBatter(inn, side);
    record(inn, {type:'wicket', runs:completed, legal, token:completed ? `W+${completed}` : 'W'});
    if(!maybeComplete() && legal) finishOver(inn);
    save(); render(); closeModal('eventModal');
  }

  function requiredRate(){
    if(state.currentInnings !== 1 || !state.target) return '—';
    const inn = current();
    const need = Math.max(0, state.target - inn.runs);
    const left = Math.max(0, inn.oversLimit * 6 - inn.balls);
    return left ? (need / (left / 6)).toFixed(2) : '∞';
  }

  function projected(inn){
    if(!inn.balls) return 0;
    return Math.round(inn.runs + (inn.runs / inn.balls) * Math.max(0, inn.oversLimit * 6 - inn.balls));
  }

  function ballClass(t){
    if(t.includes('W') || t.includes('RO')) return 'wicket';
    if(t === '4') return 'four';
    if(t === '6') return 'six';
    if(/Wd|Nb|B|Lb/.test(t)) return 'extra';
    return '';
  }

  function renderTimeline(inn){
    const arr = inn.deliveries.slice(-16).map(d => d.token);
    $('timeline').innerHTML = arr.length ? arr.map(t => `<span class="ball ${ballClass(t)}">${t}</span>`).join('') : '<span class="ball">—</span>';
  }

  function render(){
    const inn = current();
    const s = inn.batters[inn.striker] || {};
    const n = inn.batters[inn.nonStriker] || {};
    const bo = inn.bowlers[inn.bowler] || {};
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

    $('strikerAvatar').textContent = initials(s.name);
    $('strikerName').textContent = s.name || '—';
    $('strikerRuns').textContent = s.runs || 0;
    $('strikerBalls').textContent = s.balls || 0;
    $('strikerSR').textContent = strikeRate(s);
    $('striker4s').textContent = s.fours || 0;
    $('striker6s').textContent = s.sixes || 0;

    $('nonStrikerAvatar').textContent = initials(n.name);
    $('nonStrikerName').textContent = n.name || '—';
    $('nonStrikerRuns').textContent = n.runs || 0;
    $('nonStrikerBalls').textContent = n.balls || 0;
    $('nonStrikerSR').textContent = strikeRate(n);
    $('nonStriker4s').textContent = n.fours || 0;
    $('nonStriker6s').textContent = n.sixes || 0;

    $('bowlerAvatar').textContent = initials(bo.name);
    $('bowlerName').textContent = bo.name || '—';
    $('bowlerOvers').textContent = oversText(bo.balls || 0);
    $('bowlerRuns').textContent = bo.runs || 0;
    $('bowlerWickets').textContent = bo.wickets || 0;
    $('bowlerWides').textContent = bo.wides || 0;
    $('bowlerNB').textContent = bo.noBalls || 0;
    $('bowlerEcon').textContent = economy(bo);

    renderTimeline(inn);
    $('timelineScore').textContent = `${inn.runs}/${inn.wickets} · ${oversText(inn.balls)}`;
    $('extras').textContent = extrasTotal(inn);
    $('projected').textContent = projected(inn);
    $('partnership').textContent = inn.partnershipRuns;
    $('wicketsLeft').textContent = Math.max(0, maxWickets(inn) - inn.wickets);

    const disabled = !state.configured || state.matchComplete || inn.complete;
    $$('.runAction,#wicketBtn,#wideBtn,#noBallBtn,#byeBtn,#legByeBtn,#endInningsBtn').forEach(b => b.disabled = disabled);
    $('undoBtn').disabled = !state.history.length;
  }

  function openModal(id){ $(id).classList.add('open'); }
  function closeModal(id){ $(id).classList.remove('open'); }

  function toggleSettings(force){
    const menu = $('settingsMenu');
    const open = typeof force === 'boolean' ? force : !menu.classList.contains('open');
    menu.classList.toggle('open', open);
    $('settingsBackdrop').classList.toggle('open', open);
    $('settingsBackdrop').setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('drawer-open', open);
    $('settingsToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function openSetup(){
    $('matchNameInput').value = state.matchName;
    $('venueInput').value = state.venue;
    $('teamAInput').value = state.teamA;
    $('teamBInput').value = state.teamB;
    $('oversInput').value = state.oversLimit;
    $('batFirstInput').value = state.batFirst;
    $('scorerInput').value = state.scorer;
    $('teamAPlayersInput').value = state.playersA.join('\n');
    $('teamBPlayersInput').value = state.playersB.join('\n');
    openModal('setupModal');
  }

  function parsePlayers(v, team){
    const arr = String(v || '').split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
    return arr.length >= 2 ? arr : defaultPlayers(team);
  }

  function saveSetup(){
    const teamA = $('teamAInput').value.trim() || 'Team A';
    const teamB = $('teamBInput').value.trim() || 'Team B';
    const overs = Math.max(1, Math.min(100, Number($('oversInput').value) || 20));
    const batFirst = $('batFirstInput').value;
    const a = parsePlayers($('teamAPlayersInput').value, teamA);
    const b = parsePlayers($('teamBPlayersInput').value, teamB);
    const changed = !state.configured || teamA !== state.teamA || teamB !== state.teamB || overs !== state.oversLimit || batFirst !== state.batFirst || JSON.stringify(a) !== JSON.stringify(state.playersA) || JSON.stringify(b) !== JSON.stringify(state.playersB);

    if(state.configured && changed && current().deliveries.length && !confirm('Changing teams, squads, batting order or overs will restart the match. Continue?')) return;

    state.matchName = $('matchNameInput').value.trim() || 'Cricket Match';
    state.venue = $('venueInput').value.trim() || 'Venue';
    state.scorer = $('scorerInput').value.trim() || 'Scorer';
    state.teamA = teamA; state.teamB = teamB;
    state.playersA = a; state.playersB = b;
    state.oversLimit = overs; state.batFirst = batFirst;

    if(changed){
      const bt = batFirst === 'A' ? teamA : teamB;
      const bowl = batFirst === 'A' ? teamB : teamA;
      const bp = batFirst === 'A' ? a : b;
      const bowp = batFirst === 'A' ? b : a;
      state.currentInnings = 0;
      state.target = null;
      state.matchComplete = false;
      state.result = '';
      state.history = [];
      state.innings = [createInnings(bt, bowl, bp, bowp, overs)];
    }

    state.configured = true;
    save(); render(); closeModal('setupModal'); toast('Match setup saved.');
  }

  function tile(value, label, group, cls=''){
    const active = eventState.values[group] === value ? 'active' : '';
    return `<button type="button" class="outcome-choice ${cls} ${active}" data-group="${group}" data-value="${value}">${label}</button>`;
  }

  function bindOutcomeTiles(){
    $$('#eventFields .outcome-choice').forEach(btn => btn.addEventListener('click', () => {
      eventState.values[btn.dataset.group] = btn.dataset.value;
      $$('#eventFields .outcome-choice').filter(x => x.dataset.group === btn.dataset.group).forEach(x => x.classList.toggle('active', x === btn));
    }));
  }

  function runTiles(group='runs', active='0'){
    eventState.values[group] = active;
    return Array.from({length:7}, (_,i) => tile(String(i), String(i), group, 'info')).join('');
  }

  function openWide(){
    if(!canScore()) return;
    eventState = {type:'wide', values:{runs:'0', wicket:'none'}};
    $('eventTitle').textContent = 'Wide — All Outcomes';
    $('eventSub').textContent = 'Tap the exact wide outcome.';
    $('eventFields').innerHTML = `
      <div class="outcome-section"><div class="outcome-section-title">Additional Runs Completed</div><div class="outcome-grid runs">${runTiles('runs','0')}</div></div>
      <div class="outcome-section"><div class="outcome-section-title">Wicket Outcome</div><div class="outcome-grid">${tile('none','No Wicket','wicket')}${tile('stumped','Stumped','wicket','danger')}${tile('hitwicket','Hit Wicket','wicket','danger')}${tile('runout','Run Out Striker','wicket','danger')}${tile('runoutNS','Run Out Non-Striker','wicket','danger')}</div></div>
      <div class="outcome-note">Wide does not count as a legal ball.</div>`;
    bindOutcomeTiles(); openModal('eventModal');
  }

  function openNoBall(){
    if(!canScore()) return;
    eventState = {type:'noball', values:{source:'bat', runs:'0', wicket:'none'}};
    $('eventTitle').textContent = 'No Ball — All Outcomes';
    $('eventSub').textContent = 'Tap run source, additional runs and wicket outcome.';
    $('eventFields').innerHTML = `
      <div class="outcome-section"><div class="outcome-section-title">Additional Run Source</div><div class="outcome-grid">${tile('bat','Bat Runs','source','info')}${tile('bye','Byes','source','warning')}${tile('legbye','Leg Byes','source','warning')}</div></div>
      <div class="outcome-section"><div class="outcome-section-title">Additional Runs</div><div class="outcome-grid runs">${runTiles('runs','0')}</div></div>
      <div class="outcome-section"><div class="outcome-section-title">Wicket Outcome</div><div class="outcome-grid">${tile('none','No Wicket','wicket')}${tile('runout','Run Out Striker','wicket','danger')}${tile('runoutNS','Run Out Non-Striker','wicket','danger')}${tile('obstructing','Obstructing Field','wicket','danger')}${tile('hitballtwice','Hit Ball Twice','wicket','danger')}</div></div>`;
    bindOutcomeTiles(); openModal('eventModal');
  }

  function openWicket(){
    if(!canScore()) return;
    eventState = {type:'wicket', values:{dismissal:'bowled', runs:'0', source:'bat', legal:'yes'}};
    $('eventTitle').textContent = 'Wicket — All Probabilities';
    $('eventSub').textContent = 'Every dismissal option is one tap.';
    $('eventFields').innerHTML = `
      <div class="outcome-section"><div class="outcome-section-title">Dismissal Type</div><div class="outcome-grid">${tile('bowled','Bowled','dismissal','danger')}${tile('caught','Caught','dismissal','danger')}${tile('lbw','LBW','dismissal','danger')}${tile('stumped','Stumped','dismissal','danger')}${tile('hitwicket','Hit Wicket','dismissal','danger')}${tile('runout','Run Out Striker','dismissal','danger')}${tile('runoutNS','Run Out Non-Striker','dismissal','danger')}${tile('obstructing','Obstructing Field','dismissal','danger')}${tile('hitballtwice','Hit Ball Twice','dismissal','danger')}${tile('retired','Retired Out','dismissal','danger')}${tile('timedout','Timed Out','dismissal','danger')}</div></div>
      <div class="outcome-section"><div class="outcome-section-title">Runs Completed</div><div class="outcome-grid runs">${runTiles('runs','0')}</div></div>
      <div class="outcome-section"><div class="outcome-section-title">Run Type</div><div class="outcome-grid">${tile('bat','Bat Runs','source','info')}${tile('bye','Byes','source','warning')}${tile('legbye','Leg Byes','source','warning')}</div></div>
      <div class="outcome-section"><div class="outcome-section-title">Count As Legal Ball?</div><div class="outcome-grid">${tile('yes','Yes','legal')}${tile('no','No','legal')}</div></div>`;
    bindOutcomeTiles(); openModal('eventModal');
  }

  function openBye(type){
    if(!canScore()) return;
    eventState = {type, values:{runs:'1'}};
    $('eventTitle').textContent = type === 'bye' ? 'Bye' : 'Leg Bye';
    $('eventSub').textContent = 'Tap the number of runs completed.';
    $('eventFields').innerHTML = `<div class="outcome-section"><div class="outcome-section-title">Runs</div><div class="outcome-grid runs">${Array.from({length:6}, (_,i) => tile(String(i+1), String(i+1), 'runs', 'warning')).join('')}</div></div><div class="outcome-note">This counts as a legal ball.</div>`;
    bindOutcomeTiles(); openModal('eventModal');
  }

  function applyEvent(){
    if(eventState.type === 'wide') applyWide();
    else if(eventState.type === 'noball') applyNoBall();
    else if(eventState.type === 'wicket') applyWicket();
    else if(eventState.type === 'bye' || eventState.type === 'legbye') scoreBye(eventState.type, Number(eventState.values.runs || 1));
  }

  function openBatter(which){
    const inn = current();
    batterEditTarget = which;
    $('batterModalTitle').textContent = which === 'striker' ? 'Edit Striker' : 'Edit Non-Striker';
    const currentIndex = which === 'striker' ? inn.striker : inn.nonStriker;
    $('editBatterSelect').innerHTML = inn.batters.map((b,i) => `<option value="${i}" ${i === currentIndex ? 'selected' : ''}>${b.name}${b.out ? ' (out)' : ''}</option>`).join('');
    fillBatter(); openModal('batterModal');
  }

  function fillBatter(){
    const b = current().batters[Number($('editBatterSelect').value)];
    if(!b) return;
    $('editBatterName').value = b.name;
    $('editBatterRuns').value = b.runs;
    $('editBatterBalls').value = b.balls;
    $('editBatter4s').value = b.fours;
    $('editBatter6s').value = b.sixes;
    $('editBatterRole').value = batterEditTarget;
  }

  function saveBatter(){
    pushHistory();
    const inn = current();
    const idx = Number($('editBatterSelect').value);
    const b = inn.batters[idx];
    if(!b) return;
    b.name = $('editBatterName').value.trim() || b.name;
    b.runs = Math.max(0, Number($('editBatterRuns').value) || 0);
    b.balls = Math.max(0, Number($('editBatterBalls').value) || 0);
    b.fours = Math.max(0, Number($('editBatter4s').value) || 0);
    b.sixes = Math.max(0, Number($('editBatter6s').value) || 0);
    const role = $('editBatterRole').value;
    if(role === 'striker'){
      if(idx === inn.nonStriker) swapStrike(inn); else inn.striker = idx;
    }else if(role === 'nonstriker'){
      if(idx === inn.striker) swapStrike(inn); else inn.nonStriker = idx;
    }
    save(); render(); closeModal('batterModal'); toast('Batter updated.');
  }

  function openBowler(){
    const inn = current();
    $('editBowlerSelect').innerHTML = inn.bowlers.map((b,i) => `<option value="${i}" ${i === inn.bowler ? 'selected' : ''}>${b.name}</option>`).join('');
    fillBowler(); openModal('bowlerModal');
  }

  function fillBowler(){
    const inn = current();
    const i = Number($('editBowlerSelect').value);
    const b = inn.bowlers[i];
    if(!b) return;
    $('editBowlerName').value = b.name;
    $('editBowlerOvers').value = oversText(b.balls);
    $('editBowlerRuns').value = b.runs;
    $('editBowlerWickets').value = b.wickets;
    $('editBowlerWides').value = b.wides;
    $('editBowlerNB').value = b.noBalls;
    $('editBowlerCurrent').value = i === inn.bowler ? 'yes' : 'no';
  }

  function saveBowler(){
    pushHistory();
    const inn = current();
    const i = Number($('editBowlerSelect').value);
    const b = inn.bowlers[i];
    if(!b) return;
    b.name = $('editBowlerName').value.trim() || b.name;
    b.balls = oversToBalls($('editBowlerOvers').value);
    b.runs = Math.max(0, Number($('editBowlerRuns').value) || 0);
    b.wickets = Math.max(0, Number($('editBowlerWickets').value) || 0);
    b.wides = Math.max(0, Number($('editBowlerWides').value) || 0);
    b.noBalls = Math.max(0, Number($('editBowlerNB').value) || 0);
    if($('editBowlerCurrent').value === 'yes') inn.bowler = i;
    save(); render(); closeModal('bowlerModal'); toast('Bowler updated.');
  }

  function openChangeBowler(){
    const inn = current();
    $('bowlerChoiceGrid').innerHTML = inn.bowlers.map((b,i) => `<button class="outcome-choice ${i === inn.bowler ? 'active' : ''}" data-bowler-index="${i}">${b.name}<br><small>${oversText(b.balls)} · ${b.runs}/${b.wickets}</small></button>`).join('');
    $$('#bowlerChoiceGrid [data-bowler-index]').forEach(btn => btn.addEventListener('click', () => {
      pushHistory();
      inn.bowler = Number(btn.dataset.bowlerIndex);
      save(); render(); closeModal('changeBowlerModal'); toast(`${inn.bowlers[inn.bowler].name} is now bowling.`);
    }));
    openModal('changeBowlerModal');
  }

  function openScorer(){ $('newScorerInput').value = state.scorer; openModal('scorerModal'); }
  function saveScorer(){ state.scorer = $('newScorerInput').value.trim() || 'Scorer'; save(); render(); closeModal('scorerModal'); toast('Scorer changed.'); }

  function endInnings(){
    if(!canScore()) return;
    if(!confirm('End the current innings now?')) return;
    pushHistory();
    current().complete = true;
    if(state.currentInnings === 0){
      state.target = current().runs + 1;
      const bt = state.batFirst === 'A' ? state.teamB : state.teamA;
      const bowl = state.batFirst === 'A' ? state.teamA : state.teamB;
      const bp = state.batFirst === 'A' ? state.playersB : state.playersA;
      const bowp = state.batFirst === 'A' ? state.playersA : state.playersB;
      state.innings.push(createInnings(bt, bowl, bp, bowp, state.oversLimit));
      state.currentInnings = 1;
    }else{
      finishMatch();
    }
    save(); render();
  }

  function reset(){
    if(!confirm('Reset the entire match?')) return;
    state = freshState();
    localStorage.removeItem(STORAGE_KEY);
    save(); render(); openSetup(); toggleSettings(false);
  }

  $$('.runAction').forEach(b => b.addEventListener('click', () => scoreRun(Number(b.dataset.runs))));
  $('setupBtn').addEventListener('click', openSetup);
  $('saveSetupBtn').addEventListener('click', saveSetup);
  $('wicketBtn').addEventListener('click', openWicket);
  $('wideBtn').addEventListener('click', openWide);
  $('noBallBtn').addEventListener('click', openNoBall);
  $('byeBtn').addEventListener('click', () => openBye('bye'));
  $('legByeBtn').addEventListener('click', () => openBye('legbye'));
  $('applyEventBtn').addEventListener('click', applyEvent);
  $('undoBtn').addEventListener('click', undo);
  $('endInningsBtn').addEventListener('click', endInnings);

  $('menuEditStrikerBtn').addEventListener('click', () => { toggleSettings(false); openBatter('striker'); });
  $('menuEditNonStrikerBtn').addEventListener('click', () => { toggleSettings(false); openBatter('nonstriker'); });
  $('menuChangeBowlerBtn').addEventListener('click', () => { toggleSettings(false); openChangeBowler(); });
  $('menuEditBowlerBtn').addEventListener('click', () => { toggleSettings(false); openBowler(); });
  $('menuChangeScorerBtn').addEventListener('click', () => { toggleSettings(false); openScorer(); });
  $('menuResetBtn').addEventListener('click', reset);

  $('editBatterSelect').addEventListener('change', fillBatter);
  $('saveBatterBtn').addEventListener('click', saveBatter);
  $('editBowlerSelect').addEventListener('change', fillBowler);
  $('saveBowlerBtn').addEventListener('click', saveBowler);
  $('saveScorerBtn').addEventListener('click', saveScorer);

  $('settingsToggle').addEventListener('click', e => {
    e.stopPropagation();
    toggleSettings();
  });
  $('settingsClose').addEventListener('click', () => toggleSettings(false));
  $('settingsBackdrop').addEventListener('click', () => toggleSettings(false));

  $$('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
  $$('.modal-wrap').forEach(m => m.addEventListener('click', e => { if(e.target === m) closeModal(m.id); }));
  document.addEventListener('click', e => {
    const menu = $('settingsMenu');
    const toggle = $('settingsToggle');
    if(menu.classList.contains('open') && !menu.contains(e.target) && !toggle.contains(e.target)) toggleSettings(false);
  });

  document.addEventListener('keydown', e => {
    if(e.target.matches('input,select,textarea')) return;
    if(e.key >= '0' && e.key <= '6') scoreRun(Number(e.key));
    if(e.key.toLowerCase() === 'u') undo();
    if(e.key.toLowerCase() === 'w') openWicket();
    if(e.key.toLowerCase() === 'd') openWide();
    if(e.key.toLowerCase() === 'n') openNoBall();
    if(e.key === 'Escape'){
      toggleSettings(false);
      $$('.modal-wrap.open').forEach(m => closeModal(m.id));
    }
  });

  render();
  if(!state.configured) openSetup();
})();
