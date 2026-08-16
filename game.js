(() => {
  'use strict';
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const screens = { start: $('startScreen'), pause: $('pauseScreen'), over: $('gameOverScreen') };
  const hud = $('hud'), touchControls = $('touchControls');
  const difficultyData = {
    easy:   {speed:145, spawn:1.35, maxObstacles:5, label:'EASY'},
    normal: {speed:185, spawn:1.05, maxObstacles:7, label:'NORMAL'},
    hard:   {speed:260, spawn:.74, maxObstacles:10, label:'HARD'}
  };
  const themes=[['#111735','#07071a','#02020a'],['#1b1238','#0b0721','#03020d'],['#123638','#061b24','#020b0d'],['#35112a','#190718','#08020c'],['#263313','#0c1b0b','#030904']];
  const bossTypes=[['VOID WARDEN','#ff3dc8'],['CIRCUIT HYDRA','#a56bff'],['NIGHT REAPER','#ff5b65'],['CHROME BEHEMOTH','#ff9d45'],['THE NULL KING','#77ff9e']];
  let w=0,h=0,dpr=1,last=0,animationId=0,selectedDifficulty='normal',audioCtx,musicNext=0,musicStep=0;
  const keys = { left:false, right:false, fire:false };
  const game = { state:'menu', score:0, lives:3, shield:false, gunTimer:0, gunCooldown:0, elapsed:0, spawnTimer:0, orbTimer:0, shieldTimer:0, gunTimerDrop:0, lifeTimer:0, bossTimer:0, bossLevel:1, scene:0, hitCooldown:0, shake:0, player:null, boss:null, obstacles:[], orbs:[], powers:[], gunDrops:[], lifeCells:[], bullets:[], enemyShots:[], areaAttacks:[], particles:[], stars:[] };

  function resize() { dpr=Math.min(window.devicePixelRatio||1,2); w=canvas.clientWidth; h=canvas.clientHeight; canvas.width=w*dpr; canvas.height=h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); makeStars(); if(game.player) game.player.y=h-80; }
  function makeStars() { game.stars=Array.from({length:Math.max(60,Math.floor(w*h/9000))},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.5+.2,s:Math.random()*.45+.1,speed:40+Math.random()*160})); }
  function show(name) { Object.entries(screens).forEach(([key,el])=>{ el.classList.toggle('hidden',key!==name); el.classList.toggle('active',key===name); }); }
  function setHud(visible) { hud.classList.toggle('hidden',!visible); touchControls.classList.toggle('hidden',!visible); }
  function updateHud() { $('scoreValue').textContent=String(Math.floor(game.score)).padStart(6,'0'); $('livesValue').textContent=Array.from({length:5},(_,i)=>i<game.lives?'◆':'◇').join(' '); $('difficultyValue').textContent=difficultyData[selectedDifficulty].label+(game.shield?' ◉':''); }
  function getLeaderboard() { try { return JSON.parse(localStorage.getItem('neonEscapeLeaderboard')||'[]'); } catch (_) { return []; } }
  function renderLeaderboard() { const scores=getLeaderboard(); for(const id of ['menuLeaderboard','gameOverLeaderboard']) { const list=$(id); list.innerHTML=scores.length?scores.map(score=>`<li><span>${score}</span></li>`).join(''):'<li class="empty">No runs recorded yet</li>'; } }
  function saveScore(score) { const scores=[...getLeaderboard(),score].sort((a,b)=>b-a).slice(0,5); localStorage.setItem('neonEscapeLeaderboard',JSON.stringify(scores)); renderLeaderboard(); }
  function beep(type) { try { audioCtx ??= new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended') audioCtx.resume(); const o=audioCtx.createOscillator(), g=audioCtx.createGain(); const map={start:[260,620,.16,'sine'],orb:[620,1120,.13,'triangle'],hit:[190,55,.25,'sawtooth'],shield:[400,760,.22,'sine'],life:[480,960,.28,'sine'],gunstart:[260,980,.28,'square'],gunend:[820,180,.3,'sine'],shot:[940,520,.07,'square'],destroy:[140,45,.16,'sawtooth'],attack:[70,32,.48,'sawtooth'],boss:[90,210,.4,'sawtooth'],win:[330,990,.5,'triangle'],over:[230,50,.55,'sawtooth']}; const [a,b,d,shape]=map[type]; o.type=shape;o.frequency.setValueAtTime(a,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(20,b),audioCtx.currentTime+d);g.gain.setValueAtTime(type==='shot'?.025:type==='destroy'?.035:.075,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+d);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+d); } catch (_) {} }
  function musicNote(frequency, when, length, volume, type='triangle') { if(!audioCtx)return; const o=audioCtx.createOscillator(),g=audioCtx.createGain(),filter=audioCtx.createBiquadFilter(); o.type=type;o.frequency.value=frequency;filter.type='lowpass';filter.frequency.value=game.boss?820:1250;g.gain.setValueAtTime(.001,when);g.gain.exponentialRampToValueAtTime(volume,when+.025);g.gain.exponentialRampToValueAtTime(.001,when+length);o.connect(filter).connect(g).connect(audioCtx.destination);o.start(when);o.stop(when+length+.03); }
  function musicTick() { if(!audioCtx || game.state!=='playing')return; const now=audioCtx.currentTime; if(!musicNext)musicNext=now; const tempo=game.boss?.24:.38; const progression=[[146.83,174.61,220],[130.81,164.81,196],[174.61,220,261.63],[123.47,146.83,185]]; while(musicNext<now+.12){const bar=Math.floor(musicStep/8);const chord=progression[(bar+Math.floor(musicStep/48))%progression.length];musicNote(chord[0]/2,musicNext,tempo*.9,.042,'sine');if(musicStep%2===0)musicNote(chord[1],musicNext,tempo*.75,.028);if(musicStep%4===2)musicNote(chord[2],musicNext,tempo*.35,.024,'triangle');if(game.boss&&musicStep%2===0)musicNote(chord[0],musicNext,tempo*.22,.04,'sawtooth');musicStep++;musicNext+=tempo;} }
  function startGame() { cancelAnimationFrame(animationId); game.state='playing'; game.score=0;game.lives=3;game.shield=false;game.gunTimer=0;game.gunCooldown=0;game.elapsed=0;game.spawnTimer=.65;game.orbTimer=4;game.shieldTimer=10;game.gunTimerDrop=20;game.lifeTimer=34;game.bossTimer=25;game.bossLevel=1;game.scene=0;game.hitCooldown=0;game.shake=0;game.boss=null;game.obstacles=[];game.orbs=[];game.powers=[];game.gunDrops=[];game.lifeCells=[];game.bullets=[];game.enemyShots=[];game.areaAttacks=[];game.particles=[];musicNext=0;musicStep=0; $('bossAlert').classList.add('hidden');$('gunMeter').classList.add('hidden');game.player={x:w/2,y:h-80,size:38,speed:780};show('none');setHud(true);updateHud();beep('start');last=performance.now();animationId=requestAnimationFrame(loop); }
  function toMenu() { game.state='menu';cancelAnimationFrame(animationId);$('bossAlert').classList.add('hidden');$('gunMeter').classList.add('hidden');show('start');setHud(false);renderLeaderboard(); }
  function togglePause() { if(game.state==='playing'){game.state='paused';musicNext=0;show('pause');}else if(game.state==='paused'){game.state='playing';musicNext=0;show('none');last=performance.now();animationId=requestAnimationFrame(loop);} }
  function difficulty() { return difficultyData[selectedDifficulty]; }
  function spawnObstacle(x) { const roll=Math.random(), type=game.elapsed>25&&roll>.87?'ship':game.elapsed>12&&roll>.68?'meteor':'block'; const size=type==='block'?30+Math.random()*34:type==='meteor'?58+Math.random()*38:66+Math.random()*34; game.obstacles.push({x:x??(18+Math.random()*(w-36-size)),y:-size,size,type,health:type==='block'?1:type==='meteor'?2:3,speed:difficulty().speed*(.82+Math.random()*.5)+game.elapsed*4.4,spin:(Math.random()-.5)*3,vx:type==='ship'?(Math.random()>.5?1:-1)*(42+Math.random()*55):0}); }
  function spawnOrb() { const p=game.player; const x=Math.max(24,Math.min(w-24,p.x+(Math.random()-.5)*Math.min(260,w*.42))); game.orbs.push({x,y:-20,r:10,speed:125+game.elapsed*.8,pulse:Math.random()*6.28}); }
  function spawnShield() { game.powers.push({x:26+Math.random()*(w-52),y:-22,r:12,speed:155,pulse:0}); }
  function spawnGun() { game.gunDrops.push({x:28+Math.random()*(w-56),y:-25,r:15,speed:145,pulse:0}); }
  function spawnLifeCell() { game.lifeCells.push({x:28+Math.random()*(w-56),y:-25,r:14,speed:130,pulse:0}); }
  function bossInfo(level) { const [name,color]=bossTypes[(level-1)%bossTypes.length]; return {name,color,rank:Math.ceil(level/bossTypes.length)}; }
  function summonBoss() { const info=bossInfo(game.bossLevel), scale=1+Math.min(.55,(game.bossLevel-1)*.08); game.boss={x:w/2,y:110,width:142*scale,height:68*scale,dir:Math.random()>.5?1:-1,time:0,attack:.9,duration:13+game.bossLevel*1.8,maxHealth:16+game.bossLevel*10,health:16+game.bossLevel*10,info}; $('bossLevel').textContent=`LEVEL ${game.bossLevel} BOSS`; $('bossName').textContent=info.name; $('bossAlert').style.borderColor=info.color; $('bossAlert').classList.remove('hidden');beep('boss'); }
  function clearBoss(defeated) { const b=game.boss;if(!b)return; game.score+=defeated?350+game.bossLevel*100:175+game.bossLevel*60; addParticles(b.x,b.y,b.info.color,defeated?56:34); game.scene=(game.scene+1)%themes.length; game.bossLevel++;game.bossTimer=35+Math.random()*16;game.boss=null;$('bossAlert').classList.add('hidden');beep('win'); }
  function fireGun() { if(game.gunTimer<=0||game.gunCooldown>0)return; const p=game.player; game.bullets.push({x:p.x,y:p.y-p.size*.7,speed:930,pierce:4,damage:2});game.gunCooldown=keys.fire?.09:.18;beep('shot'); }
  function addParticles(x,y,color,count=14) { for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,v=40+Math.random()*180;game.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.4+Math.random()*.45,max:.85,color,size:1+Math.random()*3});} }
  function hit() { if(game.hitCooldown>0)return; if(game.shield){game.shield=false;game.hitCooldown=.6;addParticles(game.player.x,game.player.y,'#54f8ff',24);beep('shield');return;} game.lives--;game.hitCooldown=1.2;game.shake=.45;addParticles(game.player.x,game.player.y,'#ff3dc8',28);beep('hit');updateHud();if(game.lives<=0){setTimeout(endGame,350);} }
  function endGame() { if(game.state!=='playing')return;game.state='over';setHud(false);$('bossAlert').classList.add('hidden');$('gunMeter').classList.add('hidden');const final=Math.floor(game.score);const high=Math.max(final,Number(localStorage.getItem('neonEscapeHighScore'))||0);localStorage.setItem('neonEscapeHighScore',high);saveScore(final);$('finalScore').textContent=final;$('highScore').textContent=high;show('over');beep('over'); }
  function overlaps(a,b,rA,rB) { return Math.abs(a.x-b.x)<rA+rB && Math.abs(a.y-b.y)<rA+rB; }
  function update(dt) {
    const p=game.player;
    game.elapsed+=dt; game.score+=dt*(10+game.elapsed*.16); game.hitCooldown=Math.max(0,game.hitCooldown-dt); game.gunCooldown=Math.max(0,game.gunCooldown-dt); game.shake=Math.max(0,game.shake-dt); musicTick();
    for(const star of game.stars){star.y+=star.speed*dt*(game.boss?1.65:1);if(star.y>h){star.y=-8;star.x=Math.random()*w;}}
    const direction=(keys.right?1:0)-(keys.left?1:0); p.x=Math.max(p.size/2,Math.min(w-p.size/2,p.x+direction*p.speed*dt));
    game.spawnTimer-=dt; game.orbTimer-=dt; game.shieldTimer-=dt; game.gunTimerDrop-=dt; game.lifeTimer-=dt; game.bossTimer-=dt;
    const factor=Math.max(.42,1-game.elapsed*.009);
    if(game.spawnTimer<=0){ if(game.obstacles.length<difficulty().maxObstacles) spawnObstacle(); game.spawnTimer=difficulty().spawn*factor*(.8+Math.random()*.45); }
    if(game.orbTimer<=0){ if(game.orbs.length===0) spawnOrb(); game.orbTimer=8+Math.random()*5; }
    if(game.shieldTimer<=0){ spawnShield(); game.shieldTimer=15+Math.random()*12; }
    if(game.gunTimerDrop<=0){ if(game.gunDrops.length===0 && game.gunTimer<=0)spawnGun(); game.gunTimerDrop=24+Math.random()*18; }
    if(game.lifeTimer<=0){ if(game.lives<5) spawnLifeCell(); game.lifeTimer=42+Math.random()*28; }
    if(game.bossTimer<=0 && !game.boss){ summonBoss(); game.bossTimer=43+Math.random()*18; }

    if(game.boss){
      const b=game.boss; b.time+=dt; b.attack-=dt; b.x+=b.dir*115*dt;
      if(b.x<b.width*.6 || b.x>w-b.width*.6) b.dir*=-1;
      if(b.attack<=0){
        const attackType=Math.floor(Math.random()*3);
        if(attackType===0){ const spread=game.bossLevel>3?[-34,0,34]:[-20,20]; spread.forEach(offset=>spawnObstacle(Math.max(16,Math.min(w-70,b.x+offset-28)))); }
        else if(attackType===1){ for(let i=0;i<2+Math.min(3,game.bossLevel);i++)game.enemyShots.push({x:b.x+(i-(1+Math.min(3,game.bossLevel)/2))*18,y:b.y+b.height*.45,size:10+game.bossLevel*1.5,speed:260+game.bossLevel*22}); }
        else game.areaAttacks.push({y:b.y+b.height*.5,speed:180+game.bossLevel*18,gapX:p.x,gap:74+Math.max(0,32-game.bossLevel*3),hit:false});
        beep('attack'); b.attack=Math.max(.95,2.15-game.bossLevel*.12);
      }
      $('bossHealth').style.width=`${Math.max(0,(b.health/b.maxHealth)*100)}%`;
      if(b.time>=b.duration)clearBoss(false);
    }
    if(game.gunTimer>0){ game.gunTimer=Math.max(0,game.gunTimer-dt); fireGun(); $('gunMeter').classList.remove('hidden'); $('gunCharge').style.width=`${game.gunTimer/11*100}%`; if(game.gunTimer===0){ $('gunMeter').classList.add('hidden');beep('gunend'); } }
    for(const o of game.obstacles){ o.y+=o.speed*dt;o.x+=o.vx*dt;if(o.type==='ship'&&(o.x<0||o.x>w-o.size))o.vx*=-1; if(overlaps(p,o,p.size*.38,o.size*.42)){ o.dead=true; hit(); } }
    for(const o of game.orbs){
      o.y+=o.speed*dt; o.pulse+=dt*7; const dx=p.x-o.x, dy=p.y-o.y, distance=Math.hypot(dx,dy);
      if(distance>.1 && distance<145 && o.y>p.y-165){ const pull=(1-distance/145)*520; o.x+=dx/distance*pull*dt; o.y+=dy/distance*pull*dt; }
      if(overlaps(p,o,p.size*.55,o.r)){ o.dead=true; game.score+=75; addParticles(o.x,o.y,'#ffe64d',18); beep('orb'); }
    }
    for(const s of game.powers){ s.y+=s.speed*dt; s.pulse+=dt*6; if(overlaps(p,s,p.size*.42,s.r)){ s.dead=true; game.shield=true; addParticles(s.x,s.y,'#54f8ff',22); beep('shield'); } }
    for(const gun of game.gunDrops){ gun.y+=gun.speed*dt; gun.pulse+=dt*7; if(overlaps(p,gun,p.size*.46,gun.r)){ gun.dead=true;game.gunTimer=11;addParticles(gun.x,gun.y,'#ffe64d',28);beep('gunstart'); } }
    for(const life of game.lifeCells){ life.y+=life.speed*dt; life.pulse+=dt*6; if(overlaps(p,life,p.size*.46,life.r)){ life.dead=true; game.lives=Math.min(5,game.lives+1); addParticles(life.x,life.y,'#61ffab',28); beep('life'); } }
    for(const shot of game.enemyShots){shot.y+=shot.speed*dt;if(overlaps(p,shot,p.size*.4,shot.size*.55)){shot.dead=true;hit();}}
    for(const wave of game.areaAttacks){wave.y+=wave.speed*dt;if(!wave.hit&&Math.abs(wave.y-p.y)<p.size*.55){wave.hit=true;if(Math.abs(p.x-wave.gapX)>wave.gap)hit();}}
    for(const bullet of game.bullets){
      bullet.y-=bullet.speed*dt;
      for(const o of game.obstacles){if(!o.dead && Math.abs(bullet.x-(o.x+o.size/2))<o.size*.52 && bullet.y>o.y && bullet.y<o.y+o.size){o.health-=bullet.damage;bullet.pierce--;addParticles(bullet.x,bullet.y,'#ffe64d',5);if(o.health<=0){o.dead=true;game.score+=30;addParticles(o.x+o.size/2,o.y+o.size/2,'#ff3dc8',20);beep('destroy');}if(bullet.pierce<=0)bullet.dead=true;break;}}
      if(!bullet.dead && game.boss && bullet.y<game.boss.y+game.boss.height/2 && bullet.y>game.boss.y-game.boss.height/2 && Math.abs(bullet.x-game.boss.x)<game.boss.width/2){bullet.pierce--;game.boss.health-=bullet.damage;addParticles(bullet.x,bullet.y,game.boss.info.color,5);if(game.boss.health<=0)clearBoss(true);if(bullet.pierce<=0)bullet.dead=true;}
    }
    game.obstacles=game.obstacles.filter(o=>!o.dead&&o.y<h+100); game.orbs=game.orbs.filter(o=>!o.dead&&o.y<h+35); game.powers=game.powers.filter(o=>!o.dead&&o.y<h+35); game.gunDrops=game.gunDrops.filter(o=>!o.dead&&o.y<h+40); game.lifeCells=game.lifeCells.filter(o=>!o.dead&&o.y<h+38);game.bullets=game.bullets.filter(o=>!o.dead&&o.y>-20);game.enemyShots=game.enemyShots.filter(o=>!o.dead&&o.y<h+40);game.areaAttacks=game.areaAttacks.filter(o=>o.y<h+35);
    for(const q of game.particles){q.x+=q.vx*dt;q.y+=q.vy*dt;q.vy+=110*dt;q.life-=dt;} game.particles=game.particles.filter(q=>q.life>0); updateHud();
  }
  function glow(color,blur=15){ctx.shadowColor=color;ctx.shadowBlur=blur;ctx.fillStyle=color;ctx.strokeStyle=color;}
  function draw() { const palette=themes[game.scene];ctx.clearRect(0,0,w,h);const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,palette[0]);grad.addColorStop(.55,palette[1]);grad.addColorStop(1,palette[2]);ctx.fillStyle=grad;ctx.fillRect(0,0,w,h); for(const s of game.stars){ctx.globalAlpha=.25+Math.sin(game.elapsed*s.s*8+s.x)*.2;ctx.fillStyle='#9edcff';ctx.fillRect(s.x,s.y,s.r,Math.max(s.r,s.speed*.018));}ctx.globalAlpha=1;
    const scan=ctx.createLinearGradient(0,0,0,5);scan.addColorStop(0,'rgba(84,248,255,.025)');scan.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=scan;for(let y=0;y<h;y+=5)ctx.fillRect(0,y,w,4);
    if(game.boss){ const b=game.boss,level=game.bossLevel;ctx.save();ctx.translate(b.x,b.y);glow(b.info.color,34);ctx.beginPath();ctx.moveTo(-b.width*.55,b.height*.25);ctx.lineTo(-b.width*.35,-b.height*.55);ctx.lineTo(0,-b.height*.78);ctx.lineTo(b.width*.35,-b.height*.55);ctx.lineTo(b.width*.55,b.height*.25);ctx.lineTo(b.width*.3,b.height*.58);ctx.lineTo(-b.width*.3,b.height*.58);ctx.closePath();ctx.fill();ctx.fillStyle='rgba(8,4,20,.78)';ctx.shadowBlur=0;ctx.fillRect(-b.width*.34,-b.height*.15,b.width*.68,b.height*.48);for(let i=0;i<Math.min(5,2+level);i++){const x=(i-(Math.min(5,2+level)-1)/2)*b.width*.2;glow('#ffe64d',12);ctx.fillRect(x-5,-7,10,9);}if(level>2){glow(b.info.color,20);ctx.beginPath();ctx.moveTo(-b.width*.38,-b.height*.4);ctx.lineTo(-b.width*.55,-b.height*.8);ctx.lineTo(-b.width*.12,-b.height*.48);ctx.moveTo(b.width*.38,-b.height*.4);ctx.lineTo(b.width*.55,-b.height*.8);ctx.lineTo(b.width*.12,-b.height*.48);ctx.stroke();}ctx.restore(); }
    for(const o of game.obstacles){ctx.save();ctx.translate(o.x+o.size/2,o.y+o.size/2);ctx.rotate(o.spin*game.elapsed);if(o.type==='meteor'){glow('#ff704d',26);ctx.beginPath();for(let i=0;i<7;i++){const a=i*Math.PI*2/7,r=o.size*(.39+(i%2)*.08);i?ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r):ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.fillStyle='#4e1735';ctx.shadowBlur=0;ctx.beginPath();ctx.arc(-o.size*.12,-o.size*.1,o.size*.12,0,Math.PI*2);ctx.fill();}else if(o.type==='ship'){glow('#a56bff',26);ctx.beginPath();ctx.ellipse(0,0,o.size*.52,o.size*.2,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#22113b';ctx.shadowBlur=0;ctx.beginPath();ctx.ellipse(0,-o.size*.06,o.size*.2,o.size*.13,0,Math.PI,0);ctx.fill();glow('#54f8ff',13);ctx.fillRect(-o.size*.36,o.size*.12,o.size*.72,4);}else{glow('#ff3dc8',18);ctx.fillRect(-o.size/2,-o.size/2,o.size,o.size);ctx.fillStyle='#ffe0f7';ctx.shadowBlur=4;ctx.fillRect(-o.size*.24,-o.size*.24,o.size*.48,o.size*.48);}ctx.restore();}
    for(const o of game.orbs){ctx.save();glow('#ffe64d',20);ctx.beginPath();ctx.arc(o.x,o.y,o.r+Math.sin(o.pulse)*1.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fffce0';ctx.shadowBlur=5;ctx.beginPath();ctx.arc(o.x-3,o.y-3,3,0,Math.PI*2);ctx.fill();ctx.restore();}
    for(const s of game.powers){ctx.save();glow('#54f8ff',20);ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#54f8ff';ctx.shadowBlur=8;ctx.fillRect(s.x-3,s.y-8,6,16);ctx.fillRect(s.x-8,s.y-3,16,6);ctx.restore();}
    for(const gun of game.gunDrops){ctx.save();ctx.translate(gun.x,gun.y);glow('#ffe64d',24);ctx.rotate(Math.PI/4);ctx.fillRect(-gun.r,-gun.r,gun.r*2,gun.r*2);ctx.rotate(-Math.PI/4);ctx.fillStyle='#fff6b2';ctx.shadowBlur=5;ctx.fillRect(-3,-10,6,20);ctx.fillRect(-9,-3,18,6);ctx.restore();}
    for(const life of game.lifeCells){ctx.save();glow('#61ffab',24);ctx.fillRect(life.x-life.r,life.y-life.r,life.r*2,life.r*2);ctx.fillStyle='#effff6';ctx.shadowBlur=5;ctx.fillRect(life.x-3,life.y-life.r*.65,6,life.r*1.3);ctx.fillRect(life.x-life.r*.65,life.y-3,life.r*1.3,6);ctx.restore();}
    for(const shot of game.enemyShots){glow('#ff3dc8',20);ctx.beginPath();ctx.arc(shot.x,shot.y,shot.size*.55,0,Math.PI*2);ctx.fill();}
    for(const wave of game.areaAttacks){glow('#ff3dc8',22);ctx.fillRect(0,wave.y-4,Math.max(0,wave.gapX-wave.gap),8);ctx.fillRect(Math.min(w,wave.gapX+wave.gap),wave.y-4,w,8);ctx.fillStyle='#fff0fc';ctx.shadowBlur=8;ctx.fillRect(0,wave.y-1,Math.max(0,wave.gapX-wave.gap),2);ctx.fillRect(Math.min(w,wave.gapX+wave.gap),wave.y-1,w,2);}
    for(const bullet of game.bullets){glow('#ffe64d',16);ctx.fillRect(bullet.x-2,bullet.y-11,4,15);}
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
