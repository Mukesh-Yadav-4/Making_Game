(() => {
  'use strict';
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const screens = { start: $('startScreen'), pause: $('pauseScreen'), over: $('gameOverScreen') };
  const hud = $('hud'), touchControls = $('touchControls');

  // --- Retention layer: combo + missions + feedback ---
  const missionPool = [
    {type:'destroy', target:12, reward:250, label:'Destroy 12 hazards'},
    {type:'orbs', target:6, reward:300, label:'Collect 6 energy orbs'},
    {type:'combo', target:5, reward:350, label:'Reach a x5 combo'},
    {type:'survive', target:45, reward:450, label:'Survive for 45 seconds'},
    {type:'boss', target:1, reward:550, label:'Defeat 1 boss'}
  ];

  function addRetentionUI(){
    if($('retentionUI')) return;
    const wrap=document.createElement('div');
    wrap.id='retentionUI';
    wrap.innerHTML=`
      <div id="comboUI"><span>COMBO</span><b id="comboValue">x1</b><i id="comboBar"></i></div>
      <div id="missionUI"><span>MISSION</span><b id="missionValue">Loading...</b><i id="missionBar"></i></div>
      <div id="eventToast"></div>`;
    document.querySelector('.app-shell').appendChild(wrap);
    const s=document.createElement('style');
    s.textContent=`
      #retentionUI{position:absolute;inset:0;pointer-events:none;z-index:2;font-family:Arial,Helvetica,sans-serif}
      #comboUI,#missionUI{position:absolute;top:max(66px,calc(env(safe-area-inset-top) + 56px));padding:7px 9px;background:rgba(5,10,25,.68);backdrop-filter:blur(3px);border:1px solid rgba(84,248,255,.32);box-shadow:0 0 14px rgba(84,248,255,.12)}
      #comboUI{left:18px;width:115px;border-color:rgba(255,230,77,.45)}
      #missionUI{right:18px;width:min(195px,42vw)}
      #comboUI span,#missionUI span,#comboUI b,#missionUI b{display:block}
      #comboUI span,#missionUI span{color:#8da0c5;font-size:.5rem;letter-spacing:.15em}
      #comboUI b{color:#ffe64d;font-size:1.25rem;margin-top:2px;text-shadow:0 0 12px rgba(255,230,77,.5)}
      #missionUI b{color:#d9fbff;font-size:.58rem;line-height:1.25;margin-top:3px}
      #comboUI i,#missionUI i{display:block;height:3px;margin-top:6px;background:#ffe64d;box-shadow:0 0 8px #ffe64d;width:100%;transition:width .08s}
      #missionUI i{background:#54f8ff;box-shadow:0 0 8px #54f8ff;width:0}
      #eventToast{position:absolute;left:50%;top:35%;transform:translate(-50%,-50%) scale(.86);opacity:0;padding:8px 14px;border:1px solid #ffe64d;background:rgba(30,25,3,.84);color:#fff7b2;font-weight:900;letter-spacing:.1em;text-align:center;text-shadow:0 0 10px rgba(255,230,77,.45);transition:opacity .12s,transform .12s}
      #eventToast.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
      @media(max-width:520px){#comboUI{left:12px;top:max(112px,calc(env(safe-area-inset-top) + 100px))}#missionUI{right:12px;top:max(112px,calc(env(safe-area-inset-top) + 100px));width:150px}}
      @media(max-width:420px){#missionUI{width:145px}}
    `;
    document.head.appendChild(s);
  }
  addRetentionUI();

  const retention = {combo:0,bestCombo:0,comboTimer:0,nearMisses:0,mission:null,progress:{destroy:0,orbs:0,combo:0,survive:0,boss:0},completed:0};

  function newMission(){
    retention.mission={...missionPool[Math.floor(Math.random()*missionPool.length)]};
    retention.progress={destroy:0,orbs:0,combo:0,survive:0,boss:0};
    updateRetentionUI();
  }

  function updateRetentionUI(){
    const mission=retention.mission;
    $('comboValue').textContent=`x${Math.max(1,retention.combo)}`;
    $('comboBar').style.width=`${Math.max(0,Math.min(100,retention.comboTimer/4*100))}%`;
    if(mission){
      const p=retention.progress[mission.type]||0;
      $('missionValue').textContent=`${mission.label}  ${Math.min(mission.target,Math.floor(p))}/${mission.target}`;
      $('missionBar').style.width=`${Math.min(100,p/mission.target*100)}%`;
    }
  }

  function showEvent(message){
    const el=$('eventToast'); el.textContent=message; el.classList.add('show');
    clearTimeout(showEvent.t); showEvent.t=setTimeout(()=>el.classList.remove('show'),950);
  }

  function progressMission(type, amount=1){
    if(!retention.mission || retention.mission.type!==type) return;
    retention.progress[type]=Math.min(retention.mission.target,retention.progress[type]+amount);
    if(retention.progress[type]>=retention.mission.target){
      const reward=retention.mission.reward;
      game.score+=reward; retention.completed++; beep('mission'); showEvent(`MISSION COMPLETE +${reward}`);
      setTimeout(()=>{ if(game.state==='playing'){ newMission(); showEvent(`NEW MISSION: ${retention.mission.label}`); }},450);
      retention.mission=null;
    }
    updateRetentionUI();
  }

  function addCombo(amount=1){
    retention.combo=Math.min(10,retention.combo+amount);
    retention.bestCombo=Math.max(retention.bestCombo,retention.combo);
    retention.comboTimer=4;
    progressMission('combo',retention.combo);
    if(retention.combo>=3) showEvent(`COMBO x${retention.combo}`);
    updateRetentionUI();
  }

  function resetCombo(){
    retention.combo=0; retention.comboTimer=0; updateRetentionUI();
  }

  function comboMultiplier(){ return 1+Math.min(9,retention.combo)*.15; }

  const difficultyData = {
    easy:   {speed:175, spawn:1.25, maxObstacles:5, label:'EASY'},
    normal: {speed:225, spawn:.95, maxObstacles:7, label:'NORMAL'},
    hard:   {speed:305, spawn:.68, maxObstacles:10, label:'HARD'}
  };
  const themes=[['#111735','#07071a','#02020a'],['#1b1238','#0b0721','#03020d'],['#123638','#061b24','#020b0d'],['#35112a','#190718','#08020c'],['#263313','#0c1b0b','#030904']];
  const bossTypes=[
    ['VOID WARDEN','#ff3dc8'],
    ['CIRCUIT HYDRA','#a56bff'],
    ['NIGHT REAPER','#ff5b65'],
    ['CHROME BEHEMOTH','#ff9d45'],
    ['THE NULL KING','#77ff9e'],
    ['PLASMA SERAPH','#54f8ff'],
    ['RIFT DEVOURER','#b06cff'],
    ['NEON LEVIATHAN','#45ffb0'],
    ['BLACKOUT PRIME','#ff4b7a'],
    ['OMEGA: THE VOID','#ffffff']
  ];
  let w=0,h=0,dpr=1,last=0,animationId=0,selectedDifficulty='normal',audioCtx,musicNext=0,musicStep=0;
  const keys = { left:false, right:false, fire:false };
  const game = { state:'menu', score:0, lives:3, shield:false, gunTimer:0, gunCooldown:0, gunTier:1, elapsed:0, spawnTimer:0, orbTimer:0, shieldTimer:0, gunTimerDrop:0, lifeTimer:0, novaTimer:0, bossTimer:0, bossLevel:1, scene:0, clearTimer:0, hitCooldown:0, shake:0, player:null, boss:null, destroyed:{block:0,meteor:0,ship:0}, obstacles:[], orbs:[], powers:[], gunDrops:[], novaDrops:[], novas:[], lifeCells:[], bullets:[], enemyShots:[], areaAttacks:[], particles:[], stars:[] };

  function resize() { dpr=Math.min(window.devicePixelRatio||1,2); w=canvas.clientWidth; h=canvas.clientHeight; canvas.width=w*dpr; canvas.height=h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); makeStars(); if(game.player) game.player.y=h-80; }
  function makeStars() { game.stars=Array.from({length:Math.max(60,Math.floor(w*h/9000))},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.5+.2,s:Math.random()*.45+.1,speed:40+Math.random()*160})); }
  function show(name) { Object.entries(screens).forEach(([key,el])=>{ el.classList.toggle('hidden',key!==name); el.classList.toggle('active',key===name); }); }
  function setHud(visible) { hud.classList.toggle('hidden',!visible); touchControls.classList.toggle('hidden',!visible); }
  function updateHud() { $('scoreValue').textContent=String(Math.floor(game.score)).padStart(6,'0'); $('livesValue').textContent=Array.from({length:5},(_,i)=>i<game.lives?'◆':'◇').join(' '); $('destroyedValue').textContent=Object.values(game.destroyed).reduce((a,b)=>a+b,0); $('difficultyValue').textContent=difficultyData[selectedDifficulty].label+(game.shield?' ◉':''); }
  function getLeaderboard() { try { return JSON.parse(localStorage.getItem('neonEscapeLeaderboard')||'[]'); } catch (_) { return []; } }
  function renderLeaderboard() { const scores=getLeaderboard(); for(const id of ['menuLeaderboard','gameOverLeaderboard']) { const list=$(id); list.innerHTML=scores.length?scores.map(score=>`<li><span>${score}</span></li>`).join(''):'<li class="empty">No runs recorded yet</li>'; } }
  function saveScore(score) { const scores=[...getLeaderboard(),score].sort((a,b)=>b-a).slice(0,5); localStorage.setItem('neonEscapeLeaderboard',JSON.stringify(scores)); renderLeaderboard(); }
  function beep(type) {
    try {
      audioCtx ??= new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==='suspended') audioCtx.resume();
      const o=audioCtx.createOscillator(), g=audioCtx.createGain(), filter=audioCtx.createBiquadFilter();
      const map={
        start:[260,620,.16,'sine',.085],orb:[620,1120,.13,'triangle',.085],hit:[190,55,.25,'sawtooth',.095],
        shield:[400,760,.22,'sine',.085],life:[480,960,.28,'sine',.09],gunstart:[260,980,.28,'square',.09],
        gunend:[820,180,.3,'sine',.085],shot1:[940,520,.07,'square',.032],shot2:[520,180,.11,'sawtooth',.034],
        shot3:[180,38,.2,'sawtooth',.04],shot4:[95,20,.26,'sawtooth',.046],destroy:[140,45,.16,'sawtooth',.055],
        shatter:[220,28,.28,'square',.095],whoosh:[410,95,.13,'sine',.05],nova:[120,780,.38,'sawtooth',.105],
        attack:[70,32,.48,'sawtooth',.12],boss:[55,210,.58,'sawtooth',.13],win:[330,990,.5,'triangle',.105],
        over:[230,50,.55,'sawtooth',.095],mission:[420,920,.24,'square',.09],combo:[520,1040,.12,'triangle',.08],
        bossHit:[780,170,.12,'square',.11],bossPhase:[110,740,.4,'sawtooth',.12],final:[48,980,.8,'sawtooth',.15]
      };
      const [a,b,d,shape,volume]=map[type] || map.destroy;
      const now=audioCtx.currentTime;
      o.type=shape;
      o.frequency.setValueAtTime(a,now);
      o.frequency.exponentialRampToValueAtTime(Math.max(20,b),now+d);
      filter.type='lowpass'; filter.frequency.setValueAtTime(Math.max(500,Math.min(4800,Math.max(a,b)*2.2)),now);
      g.gain.setValueAtTime(volume,now);
      g.gain.exponentialRampToValueAtTime(.001,now+d);
      o.connect(filter).connect(g).connect(audioCtx.destination);
      o.start(now); o.stop(now+d+.02);
    } catch (_) {}
  }

  function intenseBossFX(kind='hit') {
    try {
      audioCtx ??= new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==='suspended') audioCtx.resume();
      const now=audioCtx.currentTime;
      const specs={
        entrance:[[58,180,.55],[110,42,.65]],
        attack:[[85,28,.24],[180,45,.34]],
        hit:[[860,210,.12],[310,65,.2]],
        defeat:[[160,38,.62],[95,20,.85],[520,110,.28]],
        final:[[42,980,.9],[70,1180,1.05],[130,40,.65]]
      };
      for(const [a,b,d] of (specs[kind]||specs.hit)){
        const o=audioCtx.createOscillator(),g=audioCtx.createGain(),f=audioCtx.createBiquadFilter();
        o.type='sawtooth'; o.frequency.setValueAtTime(a,now); o.frequency.exponentialRampToValueAtTime(Math.max(20,b),now+d);
        f.type='lowpass'; f.frequency.setValueAtTime(Math.min(5000,Math.max(a,b)*2.5),now);
        g.gain.setValueAtTime(kind==='defeat'?.12:.08,now); g.gain.exponentialRampToValueAtTime(.001,now+d);
        o.connect(f).connect(g).connect(audioCtx.destination); o.start(now); o.stop(now+d+.02);
      }
    } catch (_) {}
  }
  function musicNote(frequency, when, length, volume, type='triangle') { if(!audioCtx)return; const o=audioCtx.createOscillator(),g=audioCtx.createGain(),filter=audioCtx.createBiquadFilter(); o.type=type;o.frequency.value=frequency;filter.type='lowpass';filter.frequency.value=game.boss?820:1250;g.gain.setValueAtTime(.001,when);g.gain.exponentialRampToValueAtTime(volume,when+.025);g.gain.exponentialRampToValueAtTime(.001,when+length);o.connect(filter).connect(g).connect(audioCtx.destination);o.start(when);o.stop(when+length+.03); }
  function musicTick() { if(!audioCtx || game.state!=='playing')return; const now=audioCtx.currentTime; if(!musicNext)musicNext=now; const tempo=game.boss?.24:.38; const progression=[[146.83,174.61,220],[130.81,164.81,196],[174.61,220,261.63],[123.47,146.83,185]]; while(musicNext<now+.12){const bar=Math.floor(musicStep/8);const chord=progression[(bar+Math.floor(musicStep/48))%progression.length];musicNote(chord[0]/2,musicNext,tempo*.9,.255,'sine');if(musicStep%2===0)musicNote(chord[1],musicNext,tempo*.75,.1725);if(musicStep%4===2)musicNote(chord[2],musicNext,tempo*.35,.135,'triangle');if(game.boss&&musicStep%2===0)musicNote(chord[0],musicNext,tempo*.22,.225,'sawtooth');musicStep++;musicNext+=tempo;} }
  function startGame() { cancelAnimationFrame(animationId); game.state='playing'; game.score=0;game.lives=3;game.shield=false;game.gunTimer=0;game.gunCooldown=0;game.gunTier=1;game.elapsed=0;game.spawnTimer=.65;game.orbTimer=4;game.shieldTimer=10;game.gunTimerDrop=8;game.lifeTimer=34;game.novaTimer=30;game.bossTimer=25;game.bossLevel=1;game.scene=0;game.clearTimer=0;game.hitCooldown=0;game.shake=0;game.boss=null;game.destroyed={block:0,meteor:0,ship:0};game.obstacles=[];game.orbs=[];game.powers=[];game.gunDrops=[];game.novaDrops=[];game.novas=[];game.lifeCells=[];game.bullets=[];game.enemyShots=[];game.areaAttacks=[];game.particles=[];musicNext=0;musicStep=0; retention.combo=0;retention.bestCombo=0;retention.comboTimer=0;retention.nearMisses=0;retention.completed=0;newMission(); $('bossAlert').classList.add('hidden');$('gunMeter').classList.add('hidden');$('levelClear').classList.add('hidden');game.player={x:w/2,y:h-80,size:38,speed:780};$('retentionUI').style.display='block';show('none');setHud(true);updateHud();updateRetentionUI();beep('start');last=performance.now();animationId=requestAnimationFrame(loop); }
  function toMenu() { game.state='menu';cancelAnimationFrame(animationId);$('bossAlert').classList.add('hidden');$('gunMeter').classList.add('hidden');$('retentionUI').style.display='none';show('start');setHud(false);renderLeaderboard(); }
  function togglePause() { if(game.state==='playing'){game.state='paused';musicNext=0;show('pause');}else if(game.state==='paused'){game.state='playing';musicNext=0;show('none');last=performance.now();animationId=requestAnimationFrame(loop);} }
  function difficulty() { return difficultyData[selectedDifficulty]; }
  function spawnObstacle(x) { const roll=Math.random(), type=game.elapsed>25&&roll>.87?'ship':game.elapsed>12&&roll>.68?'meteor':'block'; const size=type==='block'?30+Math.random()*34:type==='meteor'?58+Math.random()*38:66+Math.random()*34; const stats={block:{health:2,points:35},meteor:{health:5,points:100},ship:{health:8,points:180}}[type]; game.obstacles.push({x:x??(18+Math.random()*(w-36-size)),y:-size,size,type,...stats,speed:difficulty().speed*(.82+Math.random()*.5)+game.elapsed*4.4,spin:(Math.random()-.5)*3,vx:type==='ship'?(Math.random()>.5?1:-1)*(42+Math.random()*55):0}); }
  function destroyObstacle(o,color='#ff3dc8') { if(o.counted)return; o.dead=true;o.counted=true;game.destroyed[o.type]++;game.score+=Math.round(o.points*comboMultiplier());progressMission('destroy');addCombo(1);addParticles(o.x+o.size/2,o.y+o.size/2,color,20);beep('destroy'); }
  function spawnOrb() { const p=game.player; const x=Math.max(24,Math.min(w-24,p.x+(Math.random()-.5)*Math.min(260,w*.42))); game.orbs.push({x,y:-20,r:10,speed:125+game.elapsed*.8,pulse:Math.random()*6.28}); }
  function spawnShield() { game.powers.push({x:26+Math.random()*(w-52),y:-22,r:12,speed:155,pulse:0}); }
  function spawnGun() { const roll=Math.random(),tier=roll>.97?4:roll>.87?3:roll>.62?2:1; game.gunDrops.push({x:28+Math.random()*(w-56),y:-25,r:15+tier*2,speed:145,pulse:0,tier}); }
  function spawnNova() { game.novaDrops.push({x:28+Math.random()*(w-56),y:-25,r:15,speed:135,pulse:0}); }
  function spawnLifeCell() { game.lifeCells.push({x:28+Math.random()*(w-56),y:-25,r:14,speed:130,pulse:0}); }
  function bossInfo(level) { const index=Math.min(bossTypes.length-1,Math.max(0,level-1)); const [name,color]=bossTypes[index]; return {name,color,rank:level,type:index}; }
  function summonBoss() { const info=bossInfo(game.bossLevel), scale=1+Math.min(.72,(game.bossLevel-1)*.08), health=20+game.bossLevel*62; game.boss={x:w/2,y:110,width:142*scale,height:68*scale,dir:Math.random()>.5?1:-1,time:0,attack:.85,maxHealth:health,health,info}; $('bossLevel').textContent=`LEVEL ${game.bossLevel} BOSS`; $('bossName').textContent=info.name; $('bossAlert').style.borderColor=info.color; $('bossAlert').classList.remove('hidden'); beep('boss'); intenseBossFX(game.bossLevel===10?'final':'entrance'); }
  function clearBoss() { const b=game.boss;if(!b)return; game.score+=500+game.bossLevel*160; progressMission('boss'); addCombo(2); addParticles(b.x,b.y,b.info.color,70); game.scene=(game.scene+1)%themes.length; const cleared=game.bossLevel;game.bossLevel++;game.bossTimer=35+Math.random()*16;game.clearTimer=3;game.boss=null;$('bossAlert').classList.add('hidden');$('levelClear').textContent=`LEVEL ${cleared} CLEARED`;$('levelClear').classList.remove('hidden');beep('shatter');beep('win');intenseBossFX(cleared===10?'final':'defeat');if(cleared===10)showEvent('OMEGA DESTROYED  //  YOU SURVIVED THE VOID'); else showEvent(`BOSS DEFEATED  //  LEVEL ${cleared}`); }
  function fireGun() { if(game.gunTimer<=0||game.gunCooldown>0)return; const p=game.player,stats=[null,{damage:1,pierce:1,color:'#ffe64d',sound:'shot1'},{damage:2,pierce:2,color:'#54f8ff',sound:'shot2'},{damage:4,pierce:3,color:'#5b176e',sound:'shot3'},{damage:7,pierce:5,color:'#ff4b4b',sound:'shot4'}][game.gunTier]; game.bullets.push({x:p.x,y:p.y-p.size*.7,speed:880+game.gunTier*45,...stats});game.gunCooldown=keys.fire?.09:.19;beep(stats.sound); }
  function activateNova() { const p=game.player;game.novas.push({x:p.x,y:p.y,r:12,max:210,life:.55});for(const o of game.obstacles)destroyObstacle(o,'#a56bff');for(const s of game.enemyShots)s.dead=true;for(const a of game.areaAttacks)a.y=h+100;if(game.boss){game.boss.health-=18; if(game.boss.health<=0)clearBoss();}beep('nova'); }
  function addParticles(x,y,color,count=14) { for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,v=40+Math.random()*180;game.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.4+Math.random()*.45,max:.85,color,size:1+Math.random()*3});} }
  function hit() { if(game.hitCooldown>0)return; resetCombo(); if(game.shield){game.shield=false;game.hitCooldown=.6;addParticles(game.player.x,game.player.y,'#54f8ff',24);beep('shield');return;} game.lives--;game.hitCooldown=1.2;game.shake=.45;addParticles(game.player.x,game.player.y,'#ff3dc8',28);beep('hit');updateHud();if(game.lives<=0){setTimeout(endGame,350);} }
  function endGame() { if(game.state!=='playing')return;game.state='over';setHud(false);$('bossAlert').classList.add('hidden');$('gunMeter').classList.add('hidden');$('retentionUI').style.display='none';showEvent(`BEST COMBO x${Math.max(1,retention.bestCombo)}`);const final=Math.floor(game.score);const high=Math.max(final,Number(localStorage.getItem('neonEscapeHighScore'))||0);localStorage.setItem('neonEscapeHighScore',high);saveScore(final);$('finalScore').textContent=final;$('highScore').textContent=high;const total=Object.values(game.destroyed).reduce((a,b)=>a+b,0);$('destroyedTotal').textContent=total;$('blocksDestroyed').textContent=game.destroyed.block;$('meteorsDestroyed').textContent=game.destroyed.meteor;$('shipsDestroyed').textContent=game.destroyed.ship;show('over');beep('over'); }
  function overlaps(a,b,rA,rB) { return Math.abs(a.x-b.x)<rA+rB && Math.abs(a.y-b.y)<rA+rB; }
  function update(dt) {
    const p=game.player;
    game.elapsed+=dt; game.score+=dt*(10+game.elapsed*.16); game.hitCooldown=Math.max(0,game.hitCooldown-dt); game.gunCooldown=Math.max(0,game.gunCooldown-dt); game.clearTimer=Math.max(0,game.clearTimer-dt); retention.comboTimer=Math.max(0,retention.comboTimer-dt); if(retention.comboTimer<=0&&retention.combo>0)resetCombo(); if(game.clearTimer===0)$('levelClear').classList.add('hidden'); game.shake=Math.max(0,game.shake-dt); progressMission('survive',dt); musicTick();
    const timeScale=game.clearTimer>0?.55:1; for(const star of game.stars){star.y+=star.speed*dt*(game.boss?1.65:1)*timeScale;if(star.y>h){star.y=-8;star.x=Math.random()*w;}}
    const direction=(keys.right?1:0)-(keys.left?1:0); p.x=Math.max(p.size/2,Math.min(w-p.size/2,p.x+direction*p.speed*dt));
    game.spawnTimer-=dt; game.orbTimer-=dt; game.shieldTimer-=dt; game.gunTimerDrop-=dt; game.lifeTimer-=dt; game.novaTimer-=dt; game.bossTimer-=dt;
    const factor=Math.max(.42,1-game.elapsed*.009);
    if(game.spawnTimer<=0){ if(game.obstacles.length<difficulty().maxObstacles) spawnObstacle(); game.spawnTimer=difficulty().spawn*factor*(.8+Math.random()*.45); }
    if(game.orbTimer<=0){ if(game.orbs.length===0) spawnOrb(); game.orbTimer=8+Math.random()*5; }
    if(game.shieldTimer<=0){ spawnShield(); game.shieldTimer=15+Math.random()*12; }
    if(game.gunTimerDrop<=0){ if(game.gunDrops.length===0)spawnGun(); game.gunTimerDrop=9+Math.random()*6; }
    if(game.novaTimer<=0){ if(game.novaDrops.length===0)spawnNova(); game.novaTimer=38+Math.random()*20; }
    if(game.lifeTimer<=0){ if(game.lives<5) spawnLifeCell(); game.lifeTimer=42+Math.random()*28; }
    if(game.bossTimer<=0 && !game.boss){ summonBoss(); game.bossTimer=43+Math.random()*18; }

    if(game.boss){
      const b=game.boss; b.time+=dt; b.attack-=dt*timeScale; b.x+=b.dir*115*dt*timeScale;
      if(b.x<b.width*.6 || b.x>w-b.width*.6) b.dir*=-1;
      if(b.attack<=0){
        const level=game.bossLevel;
        const type=b.info.type;
        let attackType=Math.floor(Math.random()*3);
        if(type===1) attackType=1;                       // Circuit Hydra: projectile specialist
        else if(type===2) attackType=Math.random()<.65?0:2; // Night Reaper: pressure + sweep
        else if(type===3) attackType=2;                  // Chrome Behemoth: wide area attacks
        else if(type===4) attackType=Math.random()<.5?1:2; // Null King: ranged/area mix
        else if(type===5) attackType=Math.random()<.7?1:2; // Plasma Seraph: rapid shots
        else if(type===6) attackType=Math.random()<.55?0:2; // Rift Devourer: falling/area
        else if(type===7) attackType=Math.random()<.5?0:1; // Neon Leviathan: mixed pressure
        else if(type===8) attackType=Math.floor(Math.random()*3); // Blackout Prime: all patterns
        else if(type===9) attackType=Math.floor(Math.random()*4); // Omega: all + burst

        if(attackType===0){
          const count=2+Math.min(4,Math.floor(level/2));
          for(let i=0;i<count;i++){
            const offset=(i-(count-1)/2)*Math.max(18,58-level*2);
            spawnObstacle(Math.max(16,Math.min(w-78,b.x+offset-30)));
          }
        } else if(attackType===1){
          const count=2+Math.min(5,Math.ceil(level/2));
          for(let i=0;i<count;i++){
            const spread=(i-(count-1)/2)*19;
            game.enemyShots.push({
              x:b.x+spread,
              y:b.y+b.height*.45,
              size:10+level*1.7,
              speed:265+level*24+(type===5?90:0)
            });
          }
          if(level>=7 && Math.random()<.65){
            game.enemyShots.push({x:p.x,y:b.y+b.height*.45,size:12+level,speed:310+level*18});
          }
        } else if(attackType===2){
          game.areaAttacks.push({
            y:b.y+b.height*.5,
            speed:185+level*20,
            gapX:p.x,
            gap:Math.max(48,76-level*2.5),
            hit:false
          });
          if(level>=8)game.areaAttacks.push({
            y:b.y+b.height*.5-34,
            speed:145+level*17,
            gapX:Math.max(24,Math.min(w-24,p.x+(Math.random()-.5)*120)),
            gap:Math.max(44,64-level*1.5),hit:false
          });
        } else {
          // Omega's signature burst: all three attack families at once.
          const count=5;
          for(let i=0;i<count;i++) game.enemyShots.push({x:b.x+(i-2)*24,y:b.y+b.height*.45,size:15,speed:360+level*20});
          for(const offset of [-52,0,52]) spawnObstacle(Math.max(16,Math.min(w-78,b.x+offset-30)));
          game.areaAttacks.push({y:b.y+b.height*.5,speed:220,gapX:p.x,gap:52,hit:false});
        }

        beep('attack');
        intenseBossFX(level>=8?'attack':'hit');
        const phaseBoost=level>=10&&b.health/b.maxHealth<.35 ? .28 : 0;
        b.attack=Math.max(.7,2.15-level*.115-phaseBoost);
        if(level===10&&b.health/b.maxHealth<.35){
          b.dir*= -1;
          intenseBossFX('final');
        }
      }
      $('bossHealth').style.width=`${Math.max(0,(b.health/b.maxHealth)*100)}%`;
    }
    if(game.gunTimer>0){ game.gunTimer=Math.max(0,game.gunTimer-dt); fireGun(); $('gunMeter').classList.remove('hidden'); $('gunMeter').firstElementChild.textContent=`T${game.gunTier} PLASMA BLASTER`; $('gunCharge').style.width=`${game.gunTimer/11*100}%`; if(game.gunTimer===0){ $('gunMeter').classList.add('hidden');beep('gunend'); } }
    for(const o of game.obstacles){ o.y+=o.speed*dt*timeScale;o.x+=o.vx*dt*timeScale;if(!o.whooshed&&Math.abs(o.y-p.y)<42&&Math.abs((o.x+o.size/2)-p.x)<o.size*.55+65){o.whooshed=true;beep('whoosh');if(retention.combo>=4)beep('combo');}if(o.type==='ship'&&(o.x<0||o.x>w-o.size))o.vx*=-1; if(overlaps(p,o,p.size*.38,o.size*.42)){ o.dead=true; hit(); } }
    for(const o of game.orbs){
      o.y+=o.speed*dt*timeScale; o.pulse+=dt*7; const dx=p.x-o.x, dy=p.y-o.y, distance=Math.hypot(dx,dy);
      if(distance>.1 && distance<145 && o.y>p.y-165){ const pull=(1-distance/145)*520; o.x+=dx/distance*pull*dt; o.y+=dy/distance*pull*dt; }
      if(overlaps(p,o,p.size*.55,o.r)){ o.dead=true; game.score+=75; progressMission('orbs'); addParticles(o.x,o.y,'#ffe64d',18); beep('orb'); }
    }
    for(const s of game.powers){ s.y+=s.speed*dt*timeScale; s.pulse+=dt*6; if(overlaps(p,s,p.size*.42,s.r)){ s.dead=true; game.shield=true; addParticles(s.x,s.y,'#54f8ff',22); beep('shield'); } }
    for(const gun of game.gunDrops){ gun.y+=gun.speed*dt*timeScale; gun.pulse+=dt*7; if(overlaps(p,gun,p.size*.46,gun.r)){ gun.dead=true;game.gunTimer=11;game.gunTier=gun.tier;addParticles(gun.x,gun.y,gun.tier===4?'#ff4b4b':gun.tier===3?'#5b176e':gun.tier===2?'#54f8ff':'#ffe64d',32);beep('gunstart'); } }
    for(const nova of game.novaDrops){nova.y+=nova.speed*dt*timeScale;nova.pulse+=dt*6;if(overlaps(p,nova,p.size*.48,nova.r)){nova.dead=true;activateNova();}}
    for(const life of game.lifeCells){ life.y+=life.speed*dt*timeScale; life.pulse+=dt*6; if(overlaps(p,life,p.size*.46,life.r)){ life.dead=true; game.lives=Math.min(5,game.lives+1); addParticles(life.x,life.y,'#61ffab',28); beep('life'); } }
    for(const shot of game.enemyShots){shot.y+=shot.speed*dt*timeScale;if(overlaps(p,shot,p.size*.4,shot.size*.55)){shot.dead=true;hit();}}
    for(const wave of game.areaAttacks){wave.y+=wave.speed*dt*timeScale;if(!wave.hit&&Math.abs(wave.y-p.y)<p.size*.55){wave.hit=true;if(Math.abs(p.x-wave.gapX)>wave.gap)hit();}}
    for(const bullet of game.bullets){
      bullet.y-=bullet.speed*dt;
      for(const o of game.obstacles){if(!o.dead && Math.abs(bullet.x-(o.x+o.size/2))<o.size*.52 && bullet.y>o.y && bullet.y<o.y+o.size){o.health-=bullet.damage;bullet.pierce--;addParticles(bullet.x,bullet.y,bullet.color,5);if(o.health<=0)destroyObstacle(o,bullet.color);if(bullet.pierce<=0)bullet.dead=true;break;}}
      if(!bullet.dead && game.boss && bullet.y<game.boss.y+game.boss.height/2 && bullet.y>game.boss.y-game.boss.height/2 && Math.abs(bullet.x-game.boss.x)<game.boss.width/2){bullet.pierce--;game.boss.health-=bullet.damage;addParticles(bullet.x,bullet.y,bullet.color,5);if(game.boss.health<=0)clearBoss();else if(game.boss.health/game.boss.maxHealth<.5&&bullet.damage>=4)intenseBossFX('hit');if(bullet.pierce<=0)bullet.dead=true;}
    }
    game.obstacles=game.obstacles.filter(o=>!o.dead&&o.y<h+100); game.orbs=game.orbs.filter(o=>!o.dead&&o.y<h+35); game.powers=game.powers.filter(o=>!o.dead&&o.y<h+35); game.gunDrops=game.gunDrops.filter(o=>!o.dead&&o.y<h+40);game.novaDrops=game.novaDrops.filter(o=>!o.dead&&o.y<h+40); game.lifeCells=game.lifeCells.filter(o=>!o.dead&&o.y<h+38);game.bullets=game.bullets.filter(o=>!o.dead&&o.y>-20);game.enemyShots=game.enemyShots.filter(o=>!o.dead&&o.y<h+40);game.areaAttacks=game.areaAttacks.filter(o=>o.y<h+35);for(const nova of game.novas){nova.r+=nova.max*dt/.55;nova.life-=dt;}game.novas=game.novas.filter(o=>o.life>0);
    for(const q of game.particles){q.x+=q.vx*dt;q.y+=q.vy*dt;q.vy+=110*dt;q.life-=dt;} game.particles=game.particles.filter(q=>q.life>0); updateHud();
  }
  function glow(color,blur=15){ctx.shadowColor=color;ctx.shadowBlur=blur;ctx.fillStyle=color;ctx.strokeStyle=color;}
  function draw() { const palette=themes[game.scene];ctx.clearRect(0,0,w,h);const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,palette[0]);grad.addColorStop(.55,palette[1]);grad.addColorStop(1,palette[2]);ctx.fillStyle=grad;ctx.fillRect(0,0,w,h); for(const s of game.stars){ctx.globalAlpha=.25+Math.sin(game.elapsed*s.s*8+s.x)*.2;ctx.fillStyle='#9edcff';ctx.fillRect(s.x,s.y,s.r,Math.max(s.r,s.speed*.018));}ctx.globalAlpha=1;
    const scan=ctx.createLinearGradient(0,0,0,5);scan.addColorStop(0,'rgba(84,248,255,.025)');scan.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=scan;for(let y=0;y<h;y+=5)ctx.fillRect(0,y,w,4);
    if(game.boss){ const b=game.boss,level=game.bossLevel;ctx.save(); if(level===10&&b.health/b.maxHealth<.35){ctx.globalAlpha=.85+Math.sin(game.elapsed*16)*.15;}ctx.translate(b.x,b.y);glow(b.info.color,34);ctx.beginPath();ctx.moveTo(-b.width*.55,b.height*.25);ctx.lineTo(-b.width*.35,-b.height*.55);ctx.lineTo(0,-b.height*.78);ctx.lineTo(b.width*.35,-b.height*.55);ctx.lineTo(b.width*.55,b.height*.25);ctx.lineTo(b.width*.3,b.height*.58);ctx.lineTo(-b.width*.3,b.height*.58);ctx.closePath();ctx.fill();ctx.fillStyle='rgba(8,4,20,.78)';ctx.shadowBlur=0;ctx.fillRect(-b.width*.34,-b.height*.15,b.width*.68,b.height*.48);for(let i=0;i<Math.min(5,2+level);i++){const x=(i-(Math.min(5,2+level)-1)/2)*b.width*.2;glow('#ffe64d',12);ctx.fillRect(x-5,-7,10,9);}if(level>2){glow(b.info.color,20);ctx.beginPath();ctx.moveTo(-b.width*.38,-b.height*.4);ctx.lineTo(-b.width*.55,-b.height*.8);ctx.lineTo(-b.width*.12,-b.height*.48);ctx.moveTo(b.width*.38,-b.height*.4);ctx.lineTo(b.width*.55,-b.height*.8);ctx.lineTo(b.width*.12,-b.height*.48);ctx.stroke();}ctx.restore(); }
    for(const o of game.obstacles){ctx.save();ctx.translate(o.x+o.size/2,o.y+o.size/2);ctx.rotate(o.spin*game.elapsed);if(o.type==='meteor'){glow('#ff704d',26);ctx.beginPath();for(let i=0;i<7;i++){const a=i*Math.PI*2/7,r=o.size*(.39+(i%2)*.08);i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.fillStyle='#4e1735';ctx.shadowBlur=0;ctx.beginPath();ctx.arc(-o.size*.12,-o.size*.1,o.size*.12,0,Math.PI*2);ctx.fill();}else if(o.type==='ship'){glow('#a56bff',26);ctx.beginPath();ctx.ellipse(0,0,o.size*.52,o.size*.2,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#22113b';ctx.shadowBlur=0;ctx.beginPath();ctx.ellipse(0,-o.size*.06,o.size*.2,o.size*.13,0,Math.PI,0);ctx.fill();glow('#54f8ff',13);ctx.fillRect(-o.size*.36,o.size*.12,o.size*.72,4);}else{glow('#ff3dc8',18);ctx.fillRect(-o.size/2,-o.size/2,o.size,o.size);ctx.fillStyle='#ffe0f7';ctx.shadowBlur=4;ctx.fillRect(-o.size*.24,-o.size*.24,o.size*.48,o.size*.48);}ctx.restore();}
    for(const o of game.orbs){ctx.save();glow('#ffe64d',20);ctx.beginPath();ctx.arc(o.x,o.y,o.r+Math.sin(o.pulse)*1.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fffce0';ctx.shadowBlur=5;ctx.beginPath();ctx.arc(o.x-3,o.y-3,3,0,Math.PI*2);ctx.fill();ctx.restore();}
    for(const s of game.powers){ctx.save();glow('#54f8ff',20);ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#54f8ff';ctx.shadowBlur=8;ctx.fillRect(s.x-3,s.y-8,6,16);ctx.fillRect(s.x-8,s.y-3,16,6);ctx.restore();}
    for(const gun of game.gunDrops){const color=gun.tier===4?'#ff4b4b':gun.tier===3?'#5b176e':gun.tier===2?'#54f8ff':'#ffe64d';ctx.save();ctx.translate(gun.x,gun.y);glow(color,24);ctx.rotate(Math.PI/4);ctx.fillRect(-gun.r,-gun.r,gun.r*2,gun.r*2);ctx.rotate(-Math.PI/4);ctx.fillStyle=gun.tier>=3?'#26052d':'#fff6b2';ctx.shadowBlur=5;ctx.fillRect(-3,-10,6,20);ctx.fillRect(-9,-3,18,6);if(gun.tier>1){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,gun.r+4,0,Math.PI*2);ctx.stroke();}ctx.restore();}
    for(const nova of game.novaDrops){ctx.save();ctx.translate(nova.x,nova.y);glow('#a56bff',28);ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,r=i%2?nova.r*.48:nova.r;i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.restore();}
    for(const life of game.lifeCells){ctx.save();glow('#61ffab',24);ctx.fillRect(life.x-life.r,life.y-life.r,life.r*2,life.r*2);ctx.fillStyle='#effff6';ctx.shadowBlur=5;ctx.fillRect(life.x-3,life.y-life.r*.65,6,life.r*1.3);ctx.fillRect(life.x-life.r*.65,life.y-3,life.r*1.3,6);ctx.restore();}
    for(const shot of game.enemyShots){glow('#ff3dc8',20);ctx.beginPath();ctx.arc(shot.x,shot.y,shot.size*.55,0,Math.PI*2);ctx.fill();}
    for(const wave of game.areaAttacks){glow('#ff3dc8',22);ctx.fillRect(0,wave.y-4,Math.max(0,wave.gapX-wave.gap),8);ctx.fillRect(Math.min(w,wave.gapX+wave.gap),wave.y-4,w,8);ctx.fillStyle='#fff0fc';ctx.shadowBlur=8;ctx.fillRect(0,wave.y-1,Math.max(0,wave.gapX-wave.gap),2);ctx.fillRect(Math.min(w,wave.gapX+wave.gap),wave.y-1,w,2);}
    for(const nova of game.novas){ctx.save();ctx.globalAlpha=Math.max(0,nova.life/.55);glow('#a56bff',30);ctx.lineWidth=7;ctx.beginPath();ctx.arc(nova.x,nova.y,nova.r,0,Math.PI*2);ctx.stroke();ctx.restore();}ctx.globalAlpha=1;
    for(const bullet of game.bullets){glow(bullet.color,bullet.damage>2?25:16);ctx.fillRect(bullet.x-2-bullet.damage*.25,bullet.y-11,4+bullet.damage*.5,15+bullet.damage*2);}
    for(const q of game.particles){ctx.globalAlpha=q.life/q.max;glow(q.color,8);ctx.fillRect(q.x-q.size/2,q.y-q.size/2,q.size,q.size);}ctx.globalAlpha=1;
    if(game.player){const p=game.player;ctx.save();if(game.shield){glow('#54f8ff',20);ctx.globalAlpha=.7;ctx.beginPath();ctx.arc(p.x,p.y,p.size*.9+Math.sin(game.elapsed*8)*2,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}glow(game.hitCooldown>0&&game.lives>0?'#fff':'#54f8ff',22);ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);ctx.fillStyle='#edffff';ctx.shadowBlur=4;ctx.fillRect(p.x-p.size*.22,p.y-p.size*.22,p.size*.44,p.size*.44);ctx.restore();}
    ctx.shadowBlur=0;ctx.fillStyle='rgba(84,248,255,.18)';ctx.fillRect(0,h-45,w,1); }
  function loop(now) { if(game.state!=='playing')return;const dt=Math.min(.035,(now-last)/1000||0);last=now;update(dt);if(game.shake>0){const n=game.shake/.45;canvas.style.transform=`translate(${(Math.random()-.5)*10*n}px, ${(Math.random()-.5)*10*n}px)`;}else canvas.style.transform='';draw();animationId=requestAnimationFrame(loop); }
  function keyChange(e,down) { const k=e.key.toLowerCase();if(['arrowleft','arrowright','a','d','p','r',' '].includes(k))e.preventDefault();if(k==='arrowleft'||k==='a')keys.left=down;if(k==='arrowright'||k==='d')keys.right=down;if(k===' ')keys.fire=down;if(down&&!e.repeat&&k==='p')togglePause();if(down&&!e.repeat&&k==='r'&&(game.state==='playing'||game.state==='paused'||game.state==='over'))startGame(); }
  document.addEventListener('keydown',e=>keyChange(e,true));document.addEventListener('keyup',e=>keyChange(e,false));
  function touch(button,key){for(const ev of ['pointerdown','pointerup','pointercancel','pointerleave'])button.addEventListener(ev,e=>{e.preventDefault();keys[key]=ev==='pointerdown';});}
  touch($('leftButton'),'left');touch($('rightButton'),'right');
  touch($('fireButton'),'fire');
  document.querySelectorAll('.difficulty-button').forEach(b=>b.addEventListener('click',()=>{selectedDifficulty=b.dataset.difficulty;document.querySelectorAll('.difficulty-button').forEach(x=>x.classList.toggle('selected',x===b));}));
  $('startButton').addEventListener('click',startGame);$('restartButton').addEventListener('click',startGame);$('menuButton').addEventListener('click',toMenu);$('pauseButton').addEventListener('click',togglePause);$('resumeButton').addEventListener('click',togglePause);window.addEventListener('resize',resize);document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.state==='playing')togglePause();});renderLeaderboard();resize();draw();
})();