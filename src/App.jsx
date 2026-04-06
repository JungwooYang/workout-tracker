import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ─── STORAGE (localStorage) ───
const ST = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) { console.error(e); } }
};

// ─── HELPERS ───
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const toKey = (d) => { const dt=new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`; };
const todayKey = () => toKey(new Date());
const fmtDate = (d) => new Date(d).toLocaleDateString("ko-KR",{month:"long",day:"numeric"});
const fmtFull = (d) => new Date(d).toLocaleDateString("ko-KR",{year:"numeric",month:"long",day:"numeric"});
const fmtShort = (d) => new Date(d).toLocaleDateString("ko-KR",{month:"short",day:"numeric"});
const fmtDur = (s) => { const m=Math.floor(s/60),sec=s%60; return `${m}분 ${sec}초`; };
const fmtTimer = (s) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

// ─── CSV ───
function parseFleekCSV(text) {
  try {
    const lines = text.replace(/\r/g,"").split("\n").filter(l=>l.trim());
    if(lines.length<2) return [];
    const h=lines[0].replace(/^\uFEFF/,"").split(",").map(x=>x.trim().replace(/^"|"$/g,""));
    
    // Support Fleek ("Exercise"), Strong/Hevy ("Exercise Name"), self-export
    const di = h.findIndex(x=>x==="Date");
    const ei = h.findIndex(x=>x==="Exercise Name" || x==="Exercise");
    const wi = h.findIndex(x=>x.includes("Weight"));
    const ri = h.findIndex(x=>x==="Reps");
    
    if(di===-1||ei===-1) return [];
    
    const byD={};
    for(let i=1;i<lines.length;i++){
      // Handle quoted CSV fields
      const c=lines[i].match(/(".*?"|[^,]*)/g)?.map(x=>x.replace(/^"|"$/g,"").trim()) || lines[i].split(",");
      if(!c[di] || !c[ei]) continue;
      
      let dk;
      try {
        const raw = c[di].trim();
        // Handle various date formats: YYYY-MM-DD, YYYY-MM-DD HH:MM:SS, ISO with T
        if(raw.match(/^\d{4}-\d{2}-\d{2}$/)) {
          dk = raw;
        } else if(raw.match(/^\d{4}-\d{2}-\d{2}[\sT]/)) {
          dk = raw.substring(0, 10);
        } else {
          const dt = new Date(raw);
          if(isNaN(dt)) continue;
          dk = toKey(dt);
        }
      } catch { continue; }
      
      const ex = c[ei]?.trim();
      if(!ex) continue;
      if(!byD[dk]) byD[dk]={};
      if(!byD[dk][ex]) byD[dk][ex]=[];
      byD[dk][ex].push({
        weight: wi>=0 ? (parseFloat(c[wi])||0) : 0,
        reps: ri>=0 ? (parseInt(c[ri])||0) : 0,
        done: true
      });
    }
    return Object.entries(byD).map(([date,exs])=>({
      id:uid(),date,duration:0,
      exercises:Object.entries(exs).map(([name,sets])=>({name,sets}))
    }));
  } catch(err) {
    console.error("CSV parse error:", err);
    return [];
  }
}

function exportCSV(workouts) {
  let csv="Date,Exercise,Weight(kg),Reps,Duration(min)\n";
  workouts.sort((a,b)=>a.date.localeCompare(b.date)).forEach(w=>{
    w.exercises.forEach(ex=>{ex.sets.forEach(s=>{
      csv+=`${w.date},${ex.name},${s.weight},${s.reps},${Math.round((w.duration||0)/60)}\n`;
    });});
  });
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download=`workout_${todayKey()}.csv`; a.click();
}

// ─── REST TIMER (in-app only) ───
function InlineTimer() {
  const [rem, setRem] = useState(0);
  const [running, setRunning] = useState(false);
  const iv = useRef(null);
  const presets = [60,90,120,180];

  useEffect(() => {
    if(running && rem>0) {
      iv.current = setInterval(()=>setRem(p=>{
        if(p<=1){setRunning(false);clearInterval(iv.current);return 0;}
        return p-1;
      }),1000);
    }
    return ()=>clearInterval(iv.current);
  },[running, rem]);

  const start = (s) => {setRem(s);setRunning(true);};

  if(!running && rem===0) return (
    <div style={{display:"flex",gap:6,justifyContent:"center",padding:"8px 0"}}>
      {presets.map(p=>(
        <button key={p} onClick={()=>start(p)} style={S.timerPill}>{p}s</button>
      ))}
    </div>
  );

  return (
    <div style={{textAlign:"center",padding:"10px 0"}}>
      <div style={{fontSize:32,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:rem===0?"#f5f5f5":"#ef4444",letterSpacing:3}}>
        {fmtTimer(rem)}
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:8}}>
        {running ? (
          <button onClick={()=>{setRunning(false);clearInterval(iv.current);}} style={{...S.pill,background:"#422006",color:"#fbbf24"}}>일시정지</button>
        ) : rem>0 ? (
          <button onClick={()=>setRunning(true)} style={{...S.pill,background:"#1a1a1a",color:"#f5f5f5"}}>재개</button>
        ) : null}
        <button onClick={()=>{setRunning(false);clearInterval(iv.current);setRem(0);}} style={{...S.pill,background:"#1e1e2e",color:"#888"}}>리셋</button>
      </div>
    </div>
  );
}

// ─── MAIN ───
export default function App() {
  const [tab, setTab] = useState("workout");
  const [workouts, setWorkouts] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [active, setActive] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [selEx, setSelEx] = useState(null);
  const [calMonth, setCalMonth] = useState(new Date());
  const [editR, setEditR] = useState(null);
  const [showAddEx, setShowAddEx] = useState(false);
  const [exSearch, setExSearch] = useState("");
  const [newExName, setNewExName] = useState("");
  const [rExName, setRExName] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const fileRef = useRef(null);
  const timerRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);

  // Load
  useEffect(()=>{(()=>{
    const w=ST.get("workouts"); if(w)setWorkouts(w);
    const r=ST.get("routines"); if(r)setRoutines(r);
    setLoaded(true);
  })();},[]);

  // Save
  useEffect(()=>{if(loaded)ST.set("workouts",workouts);},[workouts,loaded]);
  useEffect(()=>{if(loaded)ST.set("routines",routines);},[routines,loaded]);

  // Workout elapsed timer
  useEffect(()=>{
    if(active){
      timerRef.current=setInterval(()=>{
        setElapsed(Math.floor((Date.now()-active.startTime)/1000));
      },1000);
    } else { clearInterval(timerRef.current); setElapsed(0); }
    return ()=>clearInterval(timerRef.current);
  },[active]);

  // ─── WORKOUT ───
  const startEmpty = () => setActive({id:uid(),date:todayKey(),exercises:[],startTime:Date.now()});
  const startRoutine = (r) => setActive({
    id:uid(),date:todayKey(),startTime:Date.now(),
    exercises:r.exercises.map(e=>({name:e.name,sets:Array.from({length:e.sets||3},()=>({weight:0,reps:0,done:false}))}))
  });
  const finish = () => {
    if(!active) return;
    const dur = Math.floor((Date.now()-active.startTime)/1000);
    const cleaned = {...active, duration:dur, exercises:active.exercises.filter(e=>e.sets.some(s=>s.weight>0||s.reps>0))};
    if(cleaned.exercises.length>0) setWorkouts(p=>[...p,cleaned]);
    setActive(null);
  };
  const discard = () => setActive(null);
  const addEx = (name) => setActive(p=>({...p,exercises:[...p.exercises,{name,sets:[{weight:0,reps:0,done:false}]}]}));
  const updateSet = (ei,si,f,v) => setActive(p=>({...p,exercises:p.exercises.map((e,i)=>i!==ei?e:{...e,sets:e.sets.map((s,j)=>j!==si?s:{...s,[f]:v})})}));
  const toggleDone = (ei,si) => setActive(p=>({...p,exercises:p.exercises.map((e,i)=>i!==ei?e:{...e,sets:e.sets.map((s,j)=>j!==si?s:{...s,done:!s.done})})}));
  const addSet = (ei) => setActive(p=>{const ls=p.exercises[ei].sets; const l=ls[ls.length-1]||{weight:0,reps:0,done:false}; return {...p,exercises:p.exercises.map((e,i)=>i!==ei?e:{...e,sets:[...e.sets,{weight:l.weight,reps:l.reps,done:false}]})};});
  const rmSet = (ei,si) => setActive(p=>({...p,exercises:p.exercises.map((e,i)=>i!==ei?e:{...e,sets:e.sets.filter((_,j)=>j!==si)})}));
  const rmEx = (ei) => setActive(p=>({...p,exercises:p.exercises.filter((_,i)=>i!==ei)}));

  // Stats
  const allExNames = [...new Set(workouts.flatMap(w=>w.exercises.map(e=>e.name)))].sort();
  const getHist = (name) => {
    const h=[];
    workouts.filter(w=>w.exercises.some(e=>e.name===name)).sort((a,b)=>a.date.localeCompare(b.date)).forEach(w=>{
      const ex=w.exercises.find(e=>e.name===name); if(!ex)return;
      const mW=Math.max(...ex.sets.map(s=>s.weight));
      const vol=ex.sets.reduce((a,s)=>a+s.weight*s.reps,0);
      const rm=Math.max(...ex.sets.map(s=>s.reps>0?s.weight*(1+s.reps/30):0));
      h.push({date:w.date,label:fmtShort(w.date),maxWeight:mW,volume:vol,est1rm:Math.round(rm*10)/10,sets:ex.sets});
    });
    return h;
  };
  const getPrev = (name) => { for(let i=workouts.length-1;i>=0;i--){const ex=workouts[i].exercises.find(e=>e.name===name);if(ex)return{date:workouts[i].date,sets:ex.sets};} return null; };

  // Calendar
  const wDates = new Set(workouts.map(w=>w.date));
  const calDays = () => {
    const y=calMonth.getFullYear(),m=calMonth.getMonth();
    const first=new Date(y,m,1).getDay(), last=new Date(y,m+1,0).getDate();
    const d=[]; for(let i=0;i<first;i++)d.push(null); for(let i=1;i<=last;i++)d.push(toKey(new Date(y,m,i)));
    return d;
  };
  const [calSel, setCalSel] = useState(null);

  // Import
  const handleImport = (e) => {
    const f=e.target.files[0]; if(!f)return;
    setImportMsg("읽는 중...");
    const r=new FileReader();
    r.onload=(ev)=>{
      try {
        const text = ev.target.result;
        const parsed=parseFleekCSV(text);
        if(!parsed.length){setImportMsg("파싱 실패 — CSV 형식을 확인하세요");return;}
        setWorkouts(p=>{
          const ex=new Set(p.map(w=>w.date));
          const nw=parsed.filter(w=>!ex.has(w.date));
          setImportMsg(`${nw.length}개 세션 추가 (${parsed.length-nw.length}개 중복 스킵)`);
          return [...p,...nw].sort((a,b)=>a.date.localeCompare(b.date));
        });
      } catch(err) {
        setImportMsg("오류: " + err.message);
      }
    };
    r.onerror=()=>{ setImportMsg("파일 읽기 실패"); };
    r.readAsText(f, "UTF-8");
  };

  const filtered = allExNames.filter(n=>n.toLowerCase().includes(exSearch.toLowerCase()));

  if(!loaded) return <div style={S.app}><div style={{padding:40,textAlign:"center",color:"#666"}}>로딩 중...</div></div>;

  // ═══ ACTIVE WORKOUT VIEW ═══
  if(active) return (
    <div style={S.app}>
      <div style={S.page}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <h2 style={{...S.h2,margin:0}}>운동 중</h2>
          <div style={{fontSize:22,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:"#7f1d1d"}}>{fmtTimer(elapsed)}</div>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button onClick={finish} style={{...S.pill,background:"#7f1d1d",color:"#fecaca",flex:1}}>✓ 완료 저장</button>
          <button onClick={discard} style={{...S.pill,background:"#27272a",color:"#888"}}>취소</button>
        </div>

        {/* Rest Timer */}
        <InlineTimer />

        {/* Exercises */}
        {active.exercises.map((ex,ei)=>{
          const prev=getPrev(ex.name);
          return(
            <div key={ei} style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:15,fontWeight:700,color:"#e0e0e0"}}>{ex.name}</span>
                <button onClick={()=>rmEx(ei)} style={{background:"none",border:"none",color:"#444",fontSize:18,cursor:"pointer"}}>×</button>
              </div>
              {prev && <div style={{fontSize:11,color:"#555",marginBottom:8}}>이전 ({fmtDate(prev.date)}): {prev.sets.map(s=>`${s.weight}×${s.reps}`).join(" / ")}</div>}

              <div style={{display:"grid",gridTemplateColumns:"28px 1fr 1fr 36px 36px",gap:4,fontSize:11,color:"#555",marginBottom:4,paddingLeft:2}}>
                <span></span><span>KG</span><span>횟수</span><span></span><span></span>
              </div>
              {ex.sets.map((s,si)=>(
                <div key={si} style={{display:"grid",gridTemplateColumns:"28px 1fr 1fr 36px 36px",gap:4,marginBottom:3,alignItems:"center"}}>
                  <span style={{color:"#444",fontSize:12,textAlign:"center"}}>{si+1}</span>
                  <input type="number" inputMode="decimal" value={s.weight||""} onChange={e=>updateSet(ei,si,"weight",parseFloat(e.target.value)||0)}
                    style={{...S.inp,background:s.done?"#1a1210":"#111119",borderColor:s.done?"#2a1a1a":"#1e1e2e"}} placeholder="0" />
                  <input type="number" inputMode="numeric" value={s.reps||""} onChange={e=>updateSet(ei,si,"reps",parseInt(e.target.value)||0)}
                    style={{...S.inp,background:s.done?"#1a1210":"#111119",borderColor:s.done?"#2a1a1a":"#1e1e2e"}} placeholder="0" />
                  <button onClick={()=>toggleDone(ei,si)} style={{...S.check,background:s.done?"#7f1d1d":"#1e1e2e",color:s.done?"#fecaca":"#444"}}>✓</button>
                  <button onClick={()=>rmSet(ei,si)} style={{background:"none",border:"none",color:"#333",fontSize:14,cursor:"pointer"}}>−</button>
                </div>
              ))}
              <button onClick={()=>addSet(ei)} style={{...S.pill,width:"100%",marginTop:6,background:"#0d0d14",color:"#444",border:"1px dashed #222"}}>+ 세트</button>
            </div>
          );
        })}

        <button onClick={()=>setShowAddEx(true)} style={{...S.pill,width:"100%",padding:"14px",background:"#111119",color:"#ef4444",border:"1px solid #2a1515",marginTop:8,fontSize:14}}>+ 운동 추가</button>

        {showAddEx && (
          <div style={S.overlay}>
            <div style={S.sheet}>
              <h3 style={{color:"#ddd",marginBottom:12,fontSize:16}}>운동 추가</h3>
              <input value={exSearch} onChange={e=>setExSearch(e.target.value)} placeholder="검색..." style={{...S.inp,width:"100%",marginBottom:8}} />
              <div style={{maxHeight:200,overflow:"auto",marginBottom:10}}>
                {filtered.map(n=>(
                  <div key={n} onClick={()=>{addEx(n);setShowAddEx(false);setExSearch("");}} style={S.listItem}>{n}</div>
                ))}
                {filtered.length===0 && exSearch && <div style={{padding:10,color:"#555",fontSize:13}}>검색 결과 없음</div>}
              </div>
              <div style={{display:"flex",gap:8}}>
                <input value={newExName} onChange={e=>setNewExName(e.target.value)} placeholder="새 운동 이름 직접 입력" style={{...S.inp,flex:1}} />
                <button onClick={()=>{if(newExName.trim()){addEx(newExName.trim());setNewExName("");setShowAddEx(false);}}} style={{...S.pill,background:"#2a2a2a",color:"#f5f5f5"}}>추가</button>
              </div>
              <button onClick={()=>{setShowAddEx(false);setExSearch("");}} style={{...S.pill,width:"100%",marginTop:10,background:"#1e1e2e",color:"#888"}}>닫기</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ═══ MAIN TABS ═══
  return (
    <div style={S.app}>
      {/* ─── WORKOUT + ROUTINES TAB ─── */}
      {tab==="workout" && !editR && (
        <div style={S.page}>
          <h2 style={S.h2}>운동</h2>

          <button onClick={startEmpty} style={S.bigBtn}>
            <span style={{fontSize:16,color:"#ef4444"}}>＋</span>
            <span>빈 운동 시작</span>
          </button>

          {routines.length>0 && (
            <div style={{marginTop:20}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <h3 style={{...S.h3,margin:0}}>내 루틴</h3>
                <button onClick={()=>setEditR({id:uid(),name:"",exercises:[]})} style={{...S.pill,background:"#2a1515",color:"#ef4444",fontSize:11}}>+ 새 루틴</button>
              </div>
              {routines.map(r=>(
                <div key={r.id} style={{...S.card,cursor:"pointer"}} onClick={()=>startRoutine(r)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontWeight:700,color:"#ddd",fontSize:14}}>{r.name}</div>
                      <div style={{fontSize:12,color:"#555",marginTop:3}}>{r.exercises.map(e=>e.name).join(" · ")}</div>
                    </div>
                    <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>setEditR({...r})} style={{...S.mini,color:"#ef4444"}}>✎</button>
                      <button onClick={()=>setRoutines(p=>p.filter(x=>x.id!==r.id))} style={{...S.mini,color:"#555"}}>×</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {routines.length===0 && (
            <button onClick={()=>setEditR({id:uid(),name:"",exercises:[]})} style={{...S.bigBtn,marginTop:12,borderStyle:"dashed",color:"#555"}}>
              <span style={{color:"#ef4444"}}>＋</span><span>첫 루틴 만들기</span>
            </button>
          )}

          {workouts.length>0 && (
            <div style={{marginTop:24}}>
              <h3 style={S.h3}>최근 기록</h3>
              {workouts.slice(-5).reverse().map(w=>(
                <div key={w.id} style={S.card}>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontWeight:600,fontSize:13,color:"#999"}}>{fmtFull(w.date)}</span>
                    {w.duration>0 && <span style={{fontSize:12,color:"#444"}}>{fmtDur(w.duration)}</span>}
                  </div>
                  <div style={{fontSize:12,color:"#555",marginTop:4}}>{w.exercises.map(e=>`${e.name} ${e.sets.length}세트`).join(" · ")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── ROUTINE EDITOR ─── */}
      {tab==="workout" && editR && (
        <div style={S.page}>
          <h2 style={S.h2}>{editR.name||"새 루틴"}</h2>
          <input value={editR.name} onChange={e=>setEditR(p=>({...p,name:e.target.value}))} placeholder="루틴 이름 (예: A-전면)" style={{...S.inp,width:"100%",marginBottom:14,fontSize:16,padding:"12px 14px"}} />

          {editR.exercises.map((ex,i)=>(
            <div key={i} style={{display:"flex",gap:8,marginBottom:6,alignItems:"center"}}>
              <span style={{flex:1,fontSize:14,color:"#ccc"}}>{ex.name}</span>
              <button onClick={()=>setEditR(p=>({...p,exercises:p.exercises.filter((_,j)=>j!==i)}))} style={{...S.mini,color:"#555"}}>×</button>
            </div>
          ))}

          <div style={{display:"flex",gap:8,marginTop:10}}>
            <input value={rExName} onChange={e=>setRExName(e.target.value)} placeholder="운동 이름" style={{...S.inp,flex:1}} list="rlist" />
            <datalist id="rlist">{allExNames.map(n=><option key={n} value={n}/>)}</datalist>
            <button onClick={()=>{if(rExName.trim()){setEditR(p=>({...p,exercises:[...p.exercises,{name:rExName.trim()}]}));setRExName("");}}} style={{...S.pill,background:"#2a2a2a",color:"#f5f5f5"}}>+</button>
          </div>

          <div style={{display:"flex",gap:8,marginTop:20}}>
            <button onClick={()=>{
              if(!editR.name.trim())return;
              setRoutines(p=>{const i=p.findIndex(r=>r.id===editR.id);return i>=0?p.map(r=>r.id===editR.id?editR:r):[...p,editR];});
              setEditR(null);
            }} style={{...S.pill,flex:1,padding:"12px",background:"#2a2a2a",color:"#f5f5f5",fontSize:14}}>저장</button>
            <button onClick={()=>setEditR(null)} style={{...S.pill,flex:1,padding:"12px",background:"#1e1e2e",color:"#888",fontSize:14}}>취소</button>
          </div>
        </div>
      )}

      {/* ─── CALENDAR TAB ─── */}
      {tab==="calendar" && (
        <div style={S.page}>
          <h2 style={S.h2}>달력</h2>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <button onClick={()=>setCalMonth(new Date(calMonth.getFullYear(),calMonth.getMonth()-1))} style={S.mini}>◀</button>
            <h2 style={{...S.h2,margin:0}}>{calMonth.getFullYear()}년 {calMonth.getMonth()+1}월</h2>
            <button onClick={()=>setCalMonth(new Date(calMonth.getFullYear(),calMonth.getMonth()+1))} style={S.mini}>▶</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,textAlign:"center",marginBottom:6}}>
            {["일","월","화","수","목","금","토"].map(d=><div key={d} style={{fontSize:11,color:"#444",padding:4}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
            {calDays().map((d,i)=>{
              const has=d&&wDates.has(d); const isT=d===todayKey(); const isSel=d===calSel;
              return <div key={i} onClick={()=>{if(d)setCalSel(calSel===d?null:d);}} style={{
                padding:8,borderRadius:8,textAlign:"center",fontSize:13,cursor:d?"pointer":"default",
                background:isSel?"#2a1515":has?"#111119":"transparent",
                color:isT?"#ef4444":has?"#f87171":d?"#444":"transparent",
                fontWeight:isT?800:400,
                border:isT?"1px solid #dc2626":isSel?"1px solid #3a2020":"1px solid transparent",
                position:"relative"
              }}>
                {d?parseInt(d.split("-")[2]):""}
                {has && <div style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",width:4,height:4,borderRadius:2,background:"#ef4444"}} />}
              </div>;
            })}
          </div>

          {calSel && (
            <div style={{marginTop:16}}>
              {workouts.filter(w=>w.date===calSel).map(w=>(
                <div key={w.id} style={S.card}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontWeight:600,fontSize:13,color:"#aaa"}}>{fmtFull(w.date)}</span>
                    {w.duration>0 && <span style={{fontSize:12,color:"#444"}}>{fmtDur(w.duration)}</span>}
                  </div>
                  {w.exercises.map((ex,i)=>(
                    <div key={i} style={{marginBottom:4}}>
                      <div style={{fontSize:13,fontWeight:600,color:"#999"}}>{ex.name}</div>
                      <div style={{fontSize:12,color:"#555"}}>{ex.sets.map((s,j)=>`${s.weight}kg×${s.reps}`).join("  /  ")}</div>
                    </div>
                  ))}
                </div>
              ))}
              {!workouts.some(w=>w.date===calSel) && <div style={{textAlign:"center",color:"#444",padding:20,fontSize:13}}>기록 없음</div>}
            </div>
          )}
        </div>
      )}

      {/* ─── STATS TAB ─── */}
      {tab==="stats" && !selEx && (
        <div style={S.page}>
          <h2 style={S.h2}>통계</h2>
          {allExNames.length===0 && <div style={{color:"#555",padding:20,textAlign:"center"}}>운동 기록이 없습니다</div>}
          {allExNames.map(name=>{
            const h=getHist(name); const mW=h.length?Math.max(...h.map(x=>x.maxWeight)):0;
            return (
              <div key={name} onClick={()=>setSelEx(name)} style={{...S.card,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:"#ccc",fontSize:14}}>{name}</span>
                <span style={{color:"#ef4444",fontSize:13,whiteSpace:"nowrap"}}>{mW>0?`${mW}kg · `:""}{h.length}회</span>
              </div>
            );
          })}
        </div>
      )}

      {tab==="stats" && selEx && (
        <div style={S.page}>
          <button onClick={()=>setSelEx(null)} style={{...S.mini,color:"#ef4444",marginBottom:12,fontSize:13}}>← 목록</button>
          <h2 style={S.h2}>{selEx}</h2>
          {(()=>{
            const h=getHist(selEx); if(!h.length) return <div style={{color:"#555"}}>기록 없음</div>;
            const last=h[h.length-1];
            return <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:20}}>
                <div style={S.stat}><div style={S.statN}>{last.maxWeight}</div><div style={S.statL}>최근 최고(kg)</div></div>
                <div style={S.stat}><div style={S.statN}>{last.est1rm}</div><div style={S.statL}>추정 1RM</div></div>
                <div style={S.stat}><div style={S.statN}>{h.length}</div><div style={S.statL}>총 수행</div></div>
              </div>
              <h3 style={S.h3}>최고중량</h3>
              <div style={{height:180,marginBottom:20}}>
                <ResponsiveContainer><LineChart data={h.slice(-20)}>
                  <XAxis dataKey="label" tick={{fontSize:10,fill:"#555"}} /><YAxis tick={{fontSize:10,fill:"#555"}} domain={["auto","auto"]} />
                  <Tooltip contentStyle={{background:"#16161e",border:"1px solid #2a2a3a",borderRadius:8}} labelStyle={{color:"#888"}} />
                  <Line type="monotone" dataKey="maxWeight" stroke="#ef4444" strokeWidth={2} dot={{r:2.5,fill:"#ef4444"}} name="kg" />
                </LineChart></ResponsiveContainer>
              </div>
              <h3 style={S.h3}>볼륨</h3>
              <div style={{height:180,marginBottom:20}}>
                <ResponsiveContainer><LineChart data={h.slice(-20)}>
                  <XAxis dataKey="label" tick={{fontSize:10,fill:"#555"}} /><YAxis tick={{fontSize:10,fill:"#555"}} domain={["auto","auto"]} />
                  <Tooltip contentStyle={{background:"#16161e",border:"1px solid #2a2a3a",borderRadius:8}} labelStyle={{color:"#888"}} />
                  <Line type="monotone" dataKey="volume" stroke="#f87171" strokeWidth={1.5} dot={{r:2,fill:"#f87171"}} name="kg" strokeDasharray="4 2" />
                </LineChart></ResponsiveContainer>
              </div>
              <h3 style={S.h3}>최근 기록</h3>
              {h.slice(-8).reverse().map((x,i)=>(
                <div key={i} style={S.card}>
                  <div style={{fontSize:12,color:"#666"}}>{fmtFull(x.date)}</div>
                  <div style={{fontSize:13,color:"#bbb",marginTop:2}}>{x.sets.map(s=>`${s.weight}×${s.reps}`).join("  /  ")}</div>
                </div>
              ))}
            </>;
          })()}
        </div>
      )}

      {/* ─── SETTINGS TAB ─── */}
      {tab==="settings" && (
        <div style={S.page}>
          <h2 style={S.h2}>설정</h2>
          <div style={S.card}>
            <h3 style={{...S.h3,marginBottom:8}}>CSV 가져오기</h3>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} style={{display:"none"}} />
            <button onClick={()=>fileRef.current?.click()} style={{...S.pill,width:"100%",padding:"10px",background:"#2a1515",color:"#ef4444"}}>파일 선택</button>
            {importMsg && <div style={{marginTop:8,fontSize:12,color:"#ef4444"}}>{importMsg}</div>}
          </div>
          <div style={S.card}>
            <h3 style={{...S.h3,marginBottom:8}}>CSV 내보내기</h3>
            <button onClick={()=>exportCSV(workouts)} style={{...S.pill,width:"100%",padding:"10px",background:"#1a1a1a",color:"#f5f5f5"}}>백업 다운로드</button>
          </div>
          <div style={S.card}>
            <h3 style={{...S.h3,marginBottom:8}}>데이터</h3>
            <div style={{fontSize:13,color:"#888",lineHeight:1.8}}>
              {workouts.length}개 세션 · {workouts.reduce((a,w)=>a+w.exercises.reduce((b,e)=>b+e.sets.length,0),0)}개 세트 · {allExNames.length}개 종목 · {routines.length}개 루틴
            </div>
          </div>
          <div style={S.card}>
            <h3 style={{...S.h3,color:"#dc2626",marginBottom:8}}>초기화</h3>
            <button onClick={()=>{if(confirm("모든 데이터를 삭제합니다.")){setWorkouts([]);setRoutines([]);}}} style={{...S.pill,width:"100%",padding:"10px",background:"#1c0a0a",color:"#f87171"}}>전체 삭제</button>
          </div>
        </div>
      )}

      {/* ─── NAV ─── */}
      <nav style={S.nav}>
        {[
          {id:"workout",label:"운동",svg:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6.5 6.5L17.5 17.5M6.5 17.5L17.5 6.5" style={{display:"none"}}/><rect x="1" y="10" width="4" height="4" rx="1"/><rect x="19" y="10" width="4" height="4" rx="1"/><rect x="5" y="8" width="3" height="8" rx="1"/><rect x="16" y="8" width="3" height="8" rx="1"/><line x1="8" y1="12" x2="16" y2="12"/></svg>},
          {id:"calendar",label:"달력",svg:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="8" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1" fill="currentColor" stroke="none"/></svg>},
          {id:"stats",label:"통계",svg:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22,6 13.5,14.5 8.5,9.5 2,16"/><polyline points="16,6 22,6 22,12"/></svg>},
          {id:"settings",label:"설정",svg:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>},
        ].map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);if(t.id==="stats")setSelEx(null);if(t.id==="workout")setEditR(null);}} style={{...S.navBtn,color:tab===t.id?"#ef4444":"#444"}}>
            {t.svg}
            <span style={{fontSize:10,marginTop:3}}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

// ─── STYLES ───
const S = {
  app:{fontFamily:"'Pretendard',-apple-system,sans-serif",background:"#0e0e0e",color:"#e0e0e0",minHeight:"100vh",maxWidth:480,margin:"0 auto",position:"relative",paddingBottom:68},
  page:{padding:"20px 16px"},
  h2:{fontSize:22,fontWeight:800,color:"#f5f5f5",margin:"0 0 16px",letterSpacing:"-0.02em"},
  h3:{fontSize:12,fontWeight:700,color:"#4a4a4a",margin:"0 0 10px",textTransform:"uppercase",letterSpacing:"0.06em"},
  card:{background:"#161616",borderRadius:12,padding:"14px 16px",marginBottom:8,border:"1px solid #222"},
  bigBtn:{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"16px 20px",borderRadius:14,border:"1px solid #222",background:"#161616",color:"#aaa",fontSize:15,fontWeight:600,cursor:"pointer",textAlign:"left"},
  pill:{padding:"8px 16px",borderRadius:20,border:"none",fontSize:13,fontWeight:600,cursor:"pointer"},
  mini:{background:"none",border:"none",fontSize:15,cursor:"pointer",padding:"4px 8px",color:"#555"},
  inp:{background:"#161616",border:"1px solid #2a2a2a",borderRadius:8,padding:"8px 10px",color:"#e0e0e0",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box"},
  check:{width:36,height:36,borderRadius:8,border:"1px solid #2a2a2a",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
  stat:{background:"#161616",borderRadius:10,padding:12,textAlign:"center",border:"1px solid #222"},
  statN:{fontSize:20,fontWeight:800,color:"#ef4444"},
  statL:{fontSize:11,color:"#555",marginTop:4},
  listItem:{padding:"10px 12px",borderBottom:"1px solid #1a1a1a",cursor:"pointer",fontSize:14,color:"#ccc"},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100},
  sheet:{background:"#161616",borderRadius:"16px 16px 0 0",padding:20,width:"100%",maxWidth:480,maxHeight:"70vh"},
  timerPill:{padding:"6px 14px",borderRadius:16,border:"1px solid #2a2a2a",background:"#0e0e0e",color:"#555",fontSize:12,fontWeight:600,cursor:"pointer"},
  nav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,display:"flex",justifyContent:"space-around",background:"#0e0e0e",borderTop:"1px solid #1a1a1a",padding:"8px 0",zIndex:50},
  navBtn:{display:"flex",flexDirection:"column",alignItems:"center",background:"none",border:"none",cursor:"pointer",padding:"4px 12px"},
};
