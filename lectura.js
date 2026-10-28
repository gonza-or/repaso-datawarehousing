/* Lectura en voz alta de la diapositiva actual (Web Speech API, sin servicios externos). */
(function(){
'use strict';
var synth=window.speechSynthesis, Utt=window.SpeechSynthesisUtterance;
if(!synth||!Utt)return;
var slides=Array.prototype.slice.call(document.querySelectorAll('.slide'));
if(!slides.length)return;

var RATES=[0.8,1,1.25,1.5];
var store={get:function(k,d){try{var v=localStorage.getItem('lectura-'+k);return v===null?d:JSON.parse(v)}catch(e){return d}},
           set:function(k,v){try{localStorage.setItem('lectura-'+k,JSON.stringify(v))}catch(e){}}};
var rate=store.get('rate',1); if(RATES.indexOf(rate)<0)rate=1;
var continuo=store.get('continuo',true);

/* ---------- Voz en español ---------- */
var voice=null;
function pickVoice(){
  var vs=synth.getVoices()||[], best=null, bestScore=-1;
  var pref=['es-uy','es-ar','es-419','es-us','es-mx','es-cl','es-co','es-es'];
  vs.forEach(function(v){
    var l=(v.lang||'').toLowerCase().replace('_','-');
    if(l.slice(0,2)!=='es')return;
    var i=pref.indexOf(l), s=i<0?10:100-i*5;
    if(/google|natural|neural|premium|enhanced|mejorad/i.test(v.name))s+=8;
    if(s>bestScore){bestScore=s;best=v}
  });
  voice=best;
}
pickVoice();
if(synth.addEventListener)synth.addEventListener('voiceschanged',pickVoice);else synth.onvoiceschanged=pickVoice;

/* ---------- Texto visible de la diapositiva ---------- */
var SKIP='.pq,.arrow,.venn,.code,pre,script,style,[aria-hidden="true"],.q-side,#qPos,.result.unknown,.button-row,.q-legend,.lectura';
var BLOCK=/^(block|flex|grid|list-item|table|table-row|table-caption|flow-root)$/;
function visible(el){var cs=getComputedStyle(el);return cs.display!=='none'&&cs.visibility!=='hidden'}
function collect(node,out){
  if(node.nodeType===3){out.push(node.nodeValue);return}
  if(node.nodeType!==1)return;
  var el=node;
  if(el.matches(SKIP)||el.hidden||!visible(el))return;
  if(el.tagName==='BUTTON'&&!el.classList.contains('opt'))return;
  var d=getComputedStyle(el).display, block=BLOCK.test(d)||el.tagName==='BR';
  if(el.tagName==='TD'||el.tagName==='TH'){out.push(', ')}
  else if(block)out.push('\n');
  for(var c=el.firstChild;c;c=c.nextSibling)collect(c,out);
  if(el.classList.contains('letter'))out.push(': ');
  else if(el.classList.contains('chip')||el.classList.contains('tag'))out.push(', ');
  else if(block)out.push('\n');
}
function clean(t){
  return t.replace(/\s*[→⇒➜]\s*/g,', ').replace(/[\u2190-\u21ff\u2700-\u27bf\u2b00-\u2bff\u{1F000}-\u{1FAFF}\uFE0F]/gu,' ')
    .replace(/\s*[·•|]\s*/g,', ').replace(/(\D)\s*\/\s*|\s*\/\s*(?=\D)/g,'$1, ').replace(/\bvs\.?(?=\s)/gi,'versus')
    .replace(/PREGUNTA (\d+) DEL BANCO/g,'Pregunta $1 del banco').replace(/[«»"“”]/g,'').replace(/\s*—\s*/g,', ').replace(/[ \t]+/g,' ');
}
function slideText(s){
  var out=[];collect(s,out);
  return clean(out.join('')).split('\n').map(function(l){return l.trim().replace(/^[,;:.\s]+/,'').replace(/[,;\s]+$/,'')})
    .filter(Boolean).map(function(l){return /[.!?:¿¡…]$/.test(l)?l:l+'.'}).join(' ').replace(/\s+([,.])/g,'$1').replace(/,\s*,/g,',');
}
function chunks(text){
  var parts=text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g)||[], res=[];
  parts.forEach(function(p){
    p=p.trim(); if(!p)return;
    while(p.length>180){var cut=p.lastIndexOf(', ',180);if(cut<60)cut=p.lastIndexOf(' ',180);if(cut<60)cut=180;res.push(p.slice(0,cut+1).trim());p=p.slice(cut+1).trim()}
    if(p)res.push(p);
  });
  return res;
}

/* ---------- Control flotante ---------- */
var css='.lectura{position:fixed;z-index:25;right:clamp(12px,3vw,56px);display:flex;align-items:center;gap:6px;padding:5px;border-radius:16px;background:rgba(6,18,32,.92);border:1px solid var(--line,rgba(177,216,249,.2));box-shadow:0 10px 34px rgba(0,0,0,.45);font-size:15px}'+
'.lectura button{border:1px solid rgba(115,225,237,.36);background:rgba(18,49,72,.75);color:var(--text,#f4f8ff);border-radius:12px;min-height:40px;padding:7px 12px;font-weight:790;white-space:nowrap;font-size:15px}'+
'.lectura .lec-main{background:var(--cyan,#73e1ed);color:#082331;border-color:var(--cyan,#73e1ed)}'+
'.lectura .lec-extra{display:none}.lectura.on .lec-extra{display:inline-block}'+
'.lectura [aria-pressed="true"]{border-color:var(--cyan,#73e1ed);color:var(--cyan,#73e1ed)}'+
'@media(max-width:680px){.slide{padding-bottom:72px}.lectura{gap:4px;padding:4px}.lectura button{padding:6px 9px;min-height:38px;font-size:14px}}';
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
var box=document.createElement('div');box.className='lectura';box.setAttribute('role','group');box.setAttribute('aria-label','Lectura en voz alta');
box.innerHTML='<button type="button" class="lec-main" title="Escuchar esta diapositiva (L)"></button>'+
  '<button type="button" class="lec-extra lec-stop" title="Detener" aria-label="Detener">■</button>'+
  '<button type="button" class="lec-extra lec-rate" title="Velocidad"></button>'+
  '<button type="button" class="lec-extra lec-cont" title="Seguir leyendo y pasar sola a la siguiente diapositiva">Continuo</button>';
document.body.appendChild(box);
var bMain=box.querySelector('.lec-main'),bStop=box.querySelector('.lec-stop'),bRate=box.querySelector('.lec-rate'),bCont=box.querySelector('.lec-cont');
function place(){var f=document.querySelector('.bottom');box.style.bottom=((f?f.offsetHeight:0)+10)+'px'}
place();window.addEventListener('resize',place);

/* ---------- Motor ---------- */
var state='idle', queue=[], idx=0, gen=0, slideEl=null, advanceTimer=null;
function current(){return document.querySelector('.slide.active')}
function render(){
  bMain.textContent=state==='playing'?'❚❚ Pausa':state==='paused'?'▶ Seguir':'🔊 Escuchar';
  bMain.setAttribute('aria-label',state==='playing'?'Pausar lectura':state==='paused'?'Seguir leyendo':'Escuchar esta diapositiva');
  box.classList.toggle('on',state!=='idle');
  bRate.textContent=String(rate).replace('.',',')+'×';bRate.setAttribute('aria-label','Velocidad '+rate);
  bCont.setAttribute('aria-pressed',String(continuo));
}
function speakNext(){
  var my=++gen;
  if(idx>=queue.length){onSlideEnd();return}
  var u=new Utt(queue[idx]);
  u.lang=voice?voice.lang:'es-UY'; if(voice)u.voice=voice; u.rate=rate;
  u.onend=function(){if(my!==gen||state!=='playing')return;idx++;speakNext()};
  u.onerror=function(e){if(my!==gen||state!=='playing')return;if(e&&(e.error==='interrupted'||e.error==='canceled'))return;idx++;speakNext()};
  window.__lecturaUtt=u; /* evita que Chrome descarte el objeto antes del onend */
  synth.speak(u);
}
function onSlideEnd(){
  if(!continuo){stop();return}
  var next=document.getElementById('nextBtn'), i=slides.indexOf(current());
  if(!next||next.disabled||i>=slides.length-1){stop();return}
  clearTimeout(advanceTimer);
  advanceTimer=setTimeout(function(){if(state==='playing')next.click()},700);
}
function startSlide(textOverride){
  clearTimeout(advanceTimer);gen++;synth.cancel();
  slideEl=current();
  queue=chunks(textOverride||slideText(slideEl));idx=0;state='playing';render();
  speakNext();
}
function pause(){gen++;clearTimeout(advanceTimer);synth.cancel();state='paused';render()}
function resume(){state='playing';render();synth.cancel();speakNext()}
function stop(){gen++;clearTimeout(advanceTimer);synth.cancel();state='idle';queue=[];idx=0;render()}
function toggle(){if(state==='playing')pause();else if(state==='paused'&&current()===slideEl)resume();else startSlide()}

bMain.addEventListener('click',toggle);
bStop.addEventListener('click',stop);
bRate.addEventListener('click',function(){rate=RATES[(RATES.indexOf(rate)+1)%RATES.length];store.set('rate',rate);render();if(state==='playing'){synth.cancel();speakNext()}});
bCont.addEventListener('click',function(){continuo=!continuo;store.set('continuo',continuo);render()});

/* Cambio de diapositiva: si estaba leyendo, lee la nueva; si estaba en pausa, se detiene. */
var mo=new MutationObserver(function(){
  var c=current(); if(!c||c===slideEl)return;
  if(state==='playing')startSlide();else if(state==='paused')stop();
});
slides.forEach(function(s){mo.observe(s,{attributes:true,attributeFilter:['class']})});

/* Práctica: nueva pregunta → la lee; al responder → lee el resultado. */
var qp=document.getElementById('qPrompt'),qf=document.getElementById('qFeedback'),lastQ=qp?qp.textContent:'';
if(qp&&qf){
  new MutationObserver(function(){
    if(current()!==slideEl||state==='idle')return;
    if(qp.textContent!==lastQ){lastQ=qp.textContent;if(state==='playing')startSlide();else stop();return}
    if(state==='playing'&&!qf.classList.contains('unknown')){var t=slideText(qf);if(t)startSlide(t)}
  }).observe(qf.parentNode,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
}

document.addEventListener('keydown',function(ev){
  if(ev.ctrlKey||ev.metaKey||ev.altKey)return;
  var el=document.activeElement;if(el&&/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))return;
  if(ev.key==='l'||ev.key==='L'){ev.preventDefault();toggle()}
});
window.addEventListener('pagehide',function(){synth.cancel()});
synth.cancel();
render();
window.__lectura={slideText:slideText,chunks:chunks,state:function(){return state},voice:function(){return voice}};
})();
