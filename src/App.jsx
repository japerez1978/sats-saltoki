import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";

const STORAGE_KEY = "sats_saltoki_v5";
const COLS = ["Fecha","Referencia","Artículo","Proveedor","Uds","Cliente","GARANTIA","Nº Calidad","SAT","Acciones","Revisión","Terminado"];

const emptyForm = () => ({
  id: Date.now(),
  fecha: new Date().toISOString().slice(0,10),
  referencia:"", articulo:"", proveedor:"",
  uds:1, cliente:"", garantia:false,
  nCalidad:"", nSAT:"", acciones:"",
  revision:"", terminado:false, fotos:[]
});

const toRow = (s) => ({
  fecha:      s.fecha||null, referencia:s.referencia, articulo:s.articulo,
  proveedor:  s.proveedor, uds:parseInt(s.uds)||1, cliente:s.cliente,
  garantia:   !!s.garantia, n_calidad:s.nCalidad, n_sat:s.nSAT,
  acciones:   s.acciones, revision:s.revision, terminado:!!s.terminado, fotos:s.fotos||[],
});

const fromRow = (r) => ({
  id:r.id, fecha:r.fecha||"", referencia:r.referencia||"", articulo:r.articulo||"",
  proveedor:r.proveedor||"", uds:r.uds||1, cliente:r.cliente||"",
  garantia:!!r.garantia, nCalidad:r.n_calidad||"", nSAT:r.n_sat||"",
  acciones:r.acciones||"", revision:r.revision||"", terminado:!!r.terminado, fotos:r.fotos||[],
});

function fmt(iso) {
  if (!iso) return "";
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function isoFromDisplay(str, dateFormat="dmy") {
  if (!str) return "";
  const s = String(str).trim();
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0,10);
  if (s.match(/^\d{5}$/)) {
    try {
      const date = XLSX.SSF.parse_date_code(Number(s));
      if (date) return `${date.y}-${String(date.m).padStart(2,"0")}-${String(date.d).padStart(2,"0")}`;
    } catch(e) {}
  }
  if (s.includes("/") || s.includes("-")) {
    const p = s.split(/[\/\-]/);
    if (p.length === 3) {
      let [a,b,c] = p;
      if (c.length===2) c="20"+c;
      const na=parseInt(a), nb=parseInt(b);
      if (na>12) return `${c}-${b.padStart(2,"0")}-${a.padStart(2,"0")}`;
      if (nb>12) return `${c}-${a.padStart(2,"0")}-${b.padStart(2,"0")}`;
      if (dateFormat==="mdy") return `${c}-${a.padStart(2,"0")}-${b.padStart(2,"0")}`;
      return `${c}-${b.padStart(2,"0")}-${a.padStart(2,"0")}`;
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return "";
}

function todayStr() {
  const d=new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(2)}`;
}

function lastLine(text) {
  if (!text) return "";
  const lines=text.split("\n").map(l=>l.trim()).filter(Boolean);
  return lines[lines.length-1]||"";
}

function importFromWorkbook(wb, dateFormat="dmy") {
  const ws=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});
  if(rows.length<2) return [];
  const header=rows[0].map(h=>String(h).trim().toLowerCase());
  const idx=(...names)=>{for(const n of names){const i=header.findIndex(h=>h.includes(n.toLowerCase()));if(i>=0)return i;}return -1;};
  const iF=idx("fecha"),iRef=idx("referencia"),iArt=idx("artículo","articulo"),iPro=idx("proveedor");
  const iUds=idx("uds"),iCli=idx("cliente"),iGar=idx("garantia","garantía");
  const iCal=idx("calidad","devol","nº calidad"),iSAT=idx("sat");
  const iAcc=idx("acciones","accion"),iRev=idx("revisión","revision"),iTer=idx("terminado");
  return rows.slice(1).filter(r=>r.some(c=>c!=="")).map((r,i)=>{
    const get=i=>i>=0?String(r[i]??"").trim():"";
    return {
      id:Date.now()+i, fecha:isoFromDisplay(get(iF),dateFormat), referencia:get(iRef),
      articulo:get(iArt), proveedor:get(iPro), uds:get(iUds)||1, cliente:get(iCli),
      garantia:["s","si","sí","true","1"].includes(get(iGar).toLowerCase()),
      nCalidad:get(iCal), nSAT:get(iSAT), acciones:get(iAcc),
      revision:get(iRev), terminado:["s","si","sí","true","1"].includes(get(iTer).toLowerCase()), fotos:[]
    };
  });
}

// ---- Storage helpers ----
const BUCKET = "sat-fotos";

async function uploadPhoto(file, satId) {
  const ext = file.name.split(".").pop();
  const path = `${satId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function deletePhoto(url) {
  // Extract path from full URL
  const parts = url.split(`/${BUCKET}/`);
  if (parts.length < 2) return;
  const path = parts[1];
  await supabase.storage.from(BUCKET).remove([path]);
}


  const data=[COLS,...sats.map(s=>[
    fmt(s.fecha),s.referencia,s.articulo,s.proveedor,s.uds,s.cliente,
    s.garantia?"s":"",s.nCalidad,s.nSAT,(s.acciones||"").replace(/\n/g," | "),
    s.revision,s.terminado?"S":""
  ])];
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet(data);
  ws["!cols"]=[70,100,220,180,40,70,60,100,90,350,120,70].map(w=>({wch:Math.round(w/7)}));
  XLSX.utils.book_append_sheet(wb,ws,"SATs");
  XLSX.writeFile(wb,`SATs_Saltoki_Logrono_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ---- Photo viewer ----
function PhotoViewer({ fotos, onClose }) {
  const [idx,setIdx]=useState(0);
  return (
    <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-3xl w-full" onClick={e=>e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white text-3xl">×</button>
        <img src={fotos[idx]} alt="" className="w-full max-h-[80vh] object-contain rounded-xl"/>
        {fotos.length>1 && (
          <>
            <div className="flex justify-center gap-3 mt-3">
              {fotos.map((_,i)=>(
                <button key={i} onClick={()=>setIdx(i)} className={`w-2.5 h-2.5 rounded-full ${i===idx?"bg-white":"bg-white/40"}`}/>
              ))}
            </div>
            <button onClick={()=>setIdx(i=>(i-1+fotos.length)%fotos.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full w-10 h-10 text-xl">‹</button>
            <button onClick={()=>setIdx(i=>(i+1)%fotos.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full w-10 h-10 text-xl">›</button>
          </>
        )}
      </div>
    </div>
  );
}

// ---- SAT Modal ----
function SATModal({ sat, onSave, onClose }) {
  const [form,setForm]=useState({...sat, fotos:sat.fotos||[]});
  const [newAction,setNewAction]=useState("");
  const [photoViewer,setPhotoViewer]=useState(false);
  const [uploading,setUploading]=useState(false);
  const logRef=useRef();
  const photoRef=useRef();
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  const addAction=()=>{
    const t=newAction.trim(); if(!t) return;
    const line=`-(${todayStr()}) ${t}`;
    setForm(f=>({...f,acciones:f.acciones?f.acciones+"\n"+line:line}));
    setNewAction("");
    setTimeout(()=>logRef.current?.scrollTo(0,99999),50);
  };

  const handlePhotos=async(e)=>{
    const files=Array.from(e.target.files);
    if(!files.length) return;
    setUploading(true);
    try {
      // Use existing id if editing, temp id if new
      const satId = typeof sat.id === "number" && sat.id > 1700000000000
        ? `tmp_${sat.id}` : String(sat.id);
      const urls = await Promise.all(files.map(f => uploadPhoto(f, satId)));
      setForm(f=>({...f, fotos:[...(f.fotos||[]),...urls]}));
    } catch(err) {
      alert("Error subiendo foto: "+err.message);
    } finally {
      setUploading(false);
    }
    e.target.value="";
  };

  const removePhoto=async(i)=>{
    const url = form.fotos[i];
    // Delete from storage if it's a real URL (not base64)
    if (url.startsWith("http")) {
      try { await deletePhoto(url); } catch(e) { console.warn("No se pudo borrar del storage", e); }
    }
    setForm(f=>({...f,fotos:f.fotos.filter((_,j)=>j!==i)}));
  };

  const lines=(form.acciones||"").split("\n").filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="font-bold text-gray-800 text-lg">{sat.articulo?"✏️ Editar SAT":"➕ Nuevo SAT"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Fecha</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.fecha} onChange={e=>set("fecha",e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Referencia</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm font-mono" value={form.referencia} onChange={e=>set("referencia",e.target.value)} placeholder="Ej: 2501000020"/>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Artículo *</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.articulo} onChange={e=>set("articulo",e.target.value)}/>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Proveedor</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.proveedor} onChange={e=>set("proveedor",e.target.value)}/>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Uds</label>
              <input type="number" min="1" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.uds} onChange={e=>set("uds",e.target.value)}/>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1 font-medium">Cliente</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.cliente} onChange={e=>set("cliente",e.target.value)}/>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center gap-2 mt-4">
              <input type="checkbox" id="gar" checked={form.garantia} onChange={e=>set("garantia",e.target.checked)} className="w-4 h-4 accent-yellow-500"/>
              <label htmlFor="gar" className="text-sm font-medium">GARANTÍA</label>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Nº Calidad / DEVOL</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.nCalidad} onChange={e=>set("nCalidad",e.target.value)}/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">SAT / Incidencia</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.nSAT} onChange={e=>set("nSAT",e.target.value)}/>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Revisión</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.revision} onChange={e=>set("revision",e.target.value)}/>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Registro de acciones</label>
            <div ref={logRef} className="max-h-44 overflow-y-auto bg-gray-50 border rounded-lg p-3 text-xs space-y-1 mb-2">
              {lines.length===0 && <p className="text-gray-400 italic">Sin acciones todavía</p>}
              {lines.map((l,i)=>(
                <div key={i} className="flex gap-1">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span className="text-gray-700">{l.replace(/^-/,"").trim()}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 border rounded-lg px-3 py-2 text-sm" placeholder="Nueva acción... (Enter para añadir)"
                value={newAction} onChange={e=>setNewAction(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addAction()}/>
              <button onClick={addAction} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Añadir</button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Fotos</label>
            <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos}/>
            {(form.fotos||[]).length===0 ? (
              <button onClick={()=>photoRef.current.click()} disabled={uploading}
                className="w-full border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl py-6 text-gray-400 hover:text-blue-500 text-sm transition flex flex-col items-center gap-2">
                <span className="text-3xl">{uploading?"⏳":"📷"}</span>
                <span>{uploading?"Subiendo fotos...":"Pulsa para añadir fotos"}</span>
              </button>
            ) : (
              <div>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {form.fotos.map((f,i)=>(
                    <div key={i} className="relative group">
                      <img src={f} alt="" className="w-full h-20 object-cover rounded-lg cursor-pointer border hover:opacity-90" onClick={()=>setPhotoViewer(true)}/>
                      <button onClick={()=>removePhoto(i)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100 flex items-center justify-center">×</button>
                    </div>
                  ))}
                  <button onClick={()=>photoRef.current.click()} disabled={uploading}
                    className="h-20 border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-lg text-gray-400 hover:text-blue-500 text-2xl flex items-center justify-center transition">
                    {uploading?"⏳":"+"}
                  </button>
                </div>
                <button onClick={()=>setPhotoViewer(true)} className="text-xs text-blue-500 hover:underline">Ver todas ({form.fotos.length})</button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="term" checked={form.terminado} onChange={e=>set("terminado",e.target.checked)} className="w-5 h-5 accent-green-600"/>
            <label htmlFor="term" className="text-sm font-semibold text-green-700">TERMINADO</label>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex gap-3">
          <button onClick={()=>{if(!form.articulo.trim())return; onSave(form);}}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold text-sm">Guardar SAT</button>
          <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm">Cancelar</button>
        </div>
      </div>
      {photoViewer && <PhotoViewer fotos={form.fotos} onClose={()=>setPhotoViewer(false)}/>}
    </div>
  );
}

// ---- Bulk action modal ----
function BulkModal({ count, onAction, onClose }) {
  const [action, setAction] = useState("");
  const [value, setValue] = useState("");

  const actions = [
    { key:"delete",     label:"🗑 Eliminar seleccionados",        needsValue:false },
    { key:"terminado",  label:"✅ Marcar como Terminado",          needsValue:false },
    { key:"noterminado",label:"↩️ Marcar como No Terminado",      needsValue:false },
    { key:"garantia",   label:"⭐ Marcar con Garantía",           needsValue:false },
    { key:"nogarantia", label:"⭐ Quitar Garantía",               needsValue:false },
    { key:"proveedor",  label:"📦 Cambiar Proveedor",             needsValue:true  },
    { key:"cliente",    label:"👤 Cambiar Cliente",               needsValue:true  },
    { key:"revision",   label:"📝 Cambiar Revisión",              needsValue:true  },
  ];

  const selected = actions.find(a=>a.key===action);
  const canApply = action && (!selected?.needsValue || value.trim());

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e=>e.stopPropagation()}>
        <div className="px-6 py-5 border-b flex items-center justify-between">
          <h2 className="font-bold text-gray-800 text-lg">Acción masiva</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700 font-medium">
            {count} registro{count!==1?"s":""} seleccionado{count!==1?"s":""}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">¿Qué quieres hacer?</label>
            <select className="w-full border rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white"
              value={action} onChange={e=>{setAction(e.target.value); setValue("");}}>
              <option value="">— Selecciona una acción —</option>
              {actions.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </div>
          {selected?.needsValue && (
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">Nuevo valor</label>
              <input className="w-full border rounded-xl px-3 py-2.5 text-sm" placeholder="Escribe el nuevo valor..."
                value={value} onChange={e=>setValue(e.target.value)}/>
            </div>
          )}
          {action==="delete" && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
              ⚠️ Esta acción eliminará permanentemente los {count} registros seleccionados. No se puede deshacer.
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t flex gap-3">
          <button onClick={()=>canApply&&onAction(action,value)}
            disabled={!canApply}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition
              ${canApply
                ? action==="delete"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
            {action==="delete" ? "Eliminar" : "Aplicar"}
          </button>
          <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ---- Column header ----
function ColHeader({ label, fieldKey, sats, filters, setFilters, sortKey, sortDir, onSort }) {
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState("");
  const ref=useRef();

  useEffect(()=>{
    const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  const active=!!filters[fieldKey];
  let options=[];
  if (fieldKey==="garantia"||fieldKey==="terminado") options=["Sí","No"];
  else options=[...new Set(sats.map(s=>String(s[fieldKey]||"")))].filter(Boolean).sort();
  const filtered=search?options.filter(o=>o.toLowerCase().includes(search.toLowerCase())):options;
  const select=(v)=>{setFilters(f=>({...f,[fieldKey]:v}));setOpen(false);setSearch("");};
  const clear=(e)=>{e.stopPropagation();setFilters(f=>({...f,[fieldKey]:""}));};

  return (
    <div className="relative flex items-center gap-1" ref={ref}>
      <button onClick={()=>onSort(fieldKey)} className="flex items-center gap-1 hover:text-blue-200 transition">
        <span>{label}</span>
        <span className="text-[10px] opacity-60">{sortKey===fieldKey?(sortDir==="asc"?"▲":"▼"):"⇅"}</span>
      </button>
      <button onClick={()=>setOpen(o=>!o)}
        className={`ml-0.5 rounded px-1 transition text-[11px] ${active?"bg-blue-400 text-white":"opacity-50 hover:opacity-100"}`}>▾</button>
      {active && <button onClick={clear} className="text-blue-300 hover:text-white text-[11px] leading-none">×</button>}
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border rounded-xl shadow-2xl z-50 w-52 py-2" onClick={e=>e.stopPropagation()}>
          <div className="px-2 pb-2">
            <input autoFocus className="w-full border rounded-lg px-2 py-1.5 text-xs text-gray-700" placeholder="Buscar..."
              value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <button onClick={()=>select("")} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-400 italic">— Todos —</button>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length===0 && <p className="text-xs text-gray-400 px-3 py-2">Sin resultados</p>}
            {filtered.map(o=>(
              <button key={o} onClick={()=>select(o)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 truncate text-gray-700 ${filters[fieldKey]===o?"font-bold text-blue-600 bg-blue-50":""}`}>
                {o}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- App ----
export default function App() {
  const [sats,setSats]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null);
  const [bulkModal,setBulkModal]=useState(false);
  const [selected,setSelected]=useState(new Set()); // ids seleccionados
  const [filtro,setFiltro]=useState("todos");
  const [busqueda,setBusqueda]=useState("");
  const [confirmDel,setConfirmDel]=useState(null);
  const [msg,setMsg]=useState("");
  const [dateFormat,setDateFormat]=useState("dmy");
  const fileRef=useRef();

  const [filters,setFilters]=useState({
    proveedor:"",cliente:"",garantia:"",terminado:"",
    referencia:"",articulo:"",nCalidad:"",nSAT:""
  });
  const [sortKey,setSortKey]=useState("fecha");
  const [sortDir,setSortDir]=useState("desc");
  const onSort=(key)=>{ if(sortKey===key) setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortKey(key);setSortDir("asc");} };

  const showMsg=(m,ms=4000)=>{setMsg(m);setTimeout(()=>setMsg(""),ms);};

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      const{data,error}=await supabase.from("sats").select("*").order("fecha",{ascending:false});
      if(error) showMsg("❌ Error cargando: "+error.message,8000);
      else setSats((data||[]).map(fromRow));
      setLoading(false);
    })();
  },[]);

  const save=async(form)=>{
    const row=toRow(form);
    let error;
    if(typeof form.id==="number"&&form.id>1700000000000){
      const res=await supabase.from("sats").insert([row]).select();
      error=res.error;
      if(!error&&res.data?.[0]) setSats(prev=>[fromRow(res.data[0]),...prev]);
    } else {
      const res=await supabase.from("sats").update(row).eq("id",form.id).select();
      error=res.error;
      if(!error&&res.data?.[0]) setSats(prev=>prev.map(s=>s.id===form.id?fromRow(res.data[0]):s));
    }
    if(error){showMsg("❌ Error guardando: "+error.message,8000);return;}
    setModal(null);
  };

  const del=async(id)=>{
    const{error}=await supabase.from("sats").delete().eq("id",id);
    if(error){showMsg("❌ Error eliminando: "+error.message,8000);return;}
    setSats(s=>s.filter(x=>x.id!==id));
    setConfirmDel(null);
  };

  // Bulk action handler
  const handleBulkAction=async(action,value)=>{
    const ids=[...selected];
    if(ids.length===0) return;
    setBulkModal(false);

    if(action==="delete"){
      const{error}=await supabase.from("sats").delete().in("id",ids);
      if(error){showMsg("❌ Error: "+error.message,8000);return;}
      setSats(s=>s.filter(x=>!ids.includes(x.id)));
      showMsg(`✅ ${ids.length} registros eliminados.`);
    } else {
      // Build update patch
      const patch={};
      if(action==="terminado")   patch.terminado=true;
      if(action==="noterminado") patch.terminado=false;
      if(action==="garantia")    patch.garantia=true;
      if(action==="nogarantia")  patch.garantia=false;
      if(action==="proveedor")   patch.proveedor=value;
      if(action==="cliente")     patch.cliente=value;
      if(action==="revision")    patch.revision=value;

      const{error}=await supabase.from("sats").update(patch).in("id",ids);
      if(error){showMsg("❌ Error: "+error.message,8000);return;}
      // Update local state
      setSats(prev=>prev.map(s=>{
        if(!ids.includes(s.id)) return s;
        const updated={...s};
        if("terminado" in patch) updated.terminado=patch.terminado;
        if("garantia"  in patch) updated.garantia=patch.garantia;
        if("proveedor" in patch) updated.proveedor=patch.proveedor;
        if("cliente"   in patch) updated.cliente=patch.cliente;
        if("revision"  in patch) updated.revision=patch.revision;
        return updated;
      }));
      showMsg(`✅ ${ids.length} registros actualizados.`);
    }
    setSelected(new Set());
  };

  const handleImport=(e)=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=async ev=>{
      try{
        const wb=XLSX.read(ev.target.result,{type:"array",cellDates:true});
        const imported=importFromWorkbook(wb,dateFormat);
        if(!imported.length){showMsg("⚠️ No se encontraron datos.");return;}
        showMsg("⏳ Importando "+imported.length+" registros...",30000);
        const rows=imported.map(toRow);
        const{error}=await supabase.from("sats").insert(rows);
        if(error){showMsg("❌ Error importando: "+error.message,8000);return;}
        const{data}=await supabase.from("sats").select("*").order("fecha",{ascending:false});
        setSats((data||[]).map(fromRow));
        showMsg(`✅ ${imported.length} registros importados correctamente.`);
      }catch(err){showMsg("❌ Error: "+err.message,8000);}
    };
    reader.readAsArrayBuffer(file);
    e.target.value="";
  };

  const anyFilter=Object.values(filters).some(Boolean);

  const filtered=sats
    .filter(s=>{
      const mF=filtro==="todos"||(filtro==="activos"?!s.terminado:s.terminado);
      const q=busqueda.toLowerCase();
      const mB=!q||[s.articulo,s.proveedor,s.cliente,s.referencia,s.nCalidad,s.nSAT,s.acciones].some(v=>(v||"").toLowerCase().includes(q));
      const mCF=Object.entries(filters).every(([k,v])=>{
        if(!v) return true;
        if(k==="garantia") return v==="Sí"?s.garantia:!s.garantia;
        if(k==="terminado") return v==="Sí"?s.terminado:!s.terminado;
        return String(s[k]||"")===v;
      });
      return mF&&mB&&mCF;
    })
    .sort((a,b)=>{
      let va=String(a[sortKey]||""),vb=String(b[sortKey]||"");
      if(sortKey==="fecha"){va=a.fecha||"";vb=b.fecha||"";}
      const cmp=va.localeCompare(vb,"es",{numeric:true});
      return sortDir==="asc"?cmp:-cmp;
    });

  // Select helpers
  const allVisibleSelected = filtered.length>0 && filtered.every(s=>selected.has(s.id));
  const toggleAll = () => {
    if(allVisibleSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(s=>s.id)));
  };
  const toggleOne = (id) => {
    setSelected(prev=>{
      const next=new Set(prev);
      next.has(id)?next.delete(id):next.add(id);
      return next;
    });
  };

  const total=sats.length, activos=sats.filter(s=>!s.terminado).length, term=sats.filter(s=>s.terminado).length;
  const hProps={sats,filters,setFilters,sortKey,sortDir,onSort};

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-40 px-3 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white rounded-xl px-3 py-2 font-bold text-lg shrink-0">SAT</div>
            <div>
              <div className="font-bold text-gray-800 text-sm">Gestión de SATs · Saltoki Logroño</div>
              <div className="text-xs text-gray-400">{total} registros · {activos} activos · {term} terminados</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input className="border rounded-xl px-3 py-2 text-sm w-48" placeholder="🔍 Buscar..."
              value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
            <div className="flex rounded-xl overflow-hidden border text-sm">
              {[["todos","Todos"],["activos","Activos"],["terminados","Terminados"]].map(([k,l])=>(
                <button key={k} onClick={()=>setFiltro(k)}
                  className={`px-3 py-2 font-medium ${filtro===k?"bg-blue-600 text-white":"bg-white text-gray-600 hover:bg-gray-50"}`}>{l}</button>
              ))}
            </div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport}/>
            <div className="flex items-center gap-1 border rounded-xl overflow-hidden text-sm">
              <span className="px-2 text-gray-500 text-xs bg-gray-50 border-r py-2">📅</span>
              <button onClick={()=>setDateFormat("dmy")} className={`px-3 py-2 text-xs font-medium transition ${dateFormat==="dmy"?"bg-blue-600 text-white":"bg-white text-gray-600 hover:bg-gray-50"}`}>dd/mm</button>
              <button onClick={()=>setDateFormat("mdy")} className={`px-3 py-2 text-xs font-medium transition ${dateFormat==="mdy"?"bg-blue-600 text-white":"bg-white text-gray-600 hover:bg-gray-50"}`}>mm/dd</button>
            </div>
            <button onClick={()=>fileRef.current.click()} className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-xl text-sm font-semibold shadow">📂 Cargar</button>
            <button onClick={()=>exportToExcel(sats)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl text-sm font-semibold shadow">📥 Exportar</button>
            <button onClick={()=>setModal(emptyForm())} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-xl text-sm font-semibold shadow">+ Nuevo</button>
          </div>
        </div>

        {/* Bulk action bar — aparece cuando hay seleccionados */}
        {selected.size>0 && (
          <div className="mt-2 flex items-center gap-3 bg-blue-600 text-white rounded-xl px-4 py-2.5">
            <span className="text-sm font-semibold">{selected.size} seleccionado{selected.size!==1?"s":""}</span>
            <button onClick={()=>setBulkModal(true)}
              className="bg-white text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-sm font-semibold transition">
              ⚡ Acción masiva
            </button>
            <button onClick={()=>setSelected(new Set())} className="ml-auto text-blue-200 hover:text-white text-sm">
              Deseleccionar todo
            </button>
          </div>
        )}

        {anyFilter && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Filtros:</span>
            {Object.entries(filters).filter(([,v])=>v).map(([k,v])=>(
              <span key={k} className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                {k}: <strong>{v}</strong>
                <button onClick={()=>setFilters(f=>({...f,[k]:""}))} className="hover:text-red-500 font-bold">×</button>
              </span>
            ))}
            <button onClick={()=>setFilters({proveedor:"",cliente:"",garantia:"",terminado:"",referencia:"",articulo:"",nCalidad:"",nSAT:""})}
              className="text-xs text-red-400 hover:text-red-600 hover:underline">Limpiar todo</button>
          </div>
        )}
        {msg && <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800">{msg}</div>}
      </div>

      {/* Table */}
      <div className="px-2 py-3">
        {loading ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3">⏳</div>
            <p className="font-medium">Cargando datos de Supabase...</p>
          </div>
        ) : filtered.length===0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3">📋</div>
            <p className="font-medium">No hay SATs que mostrar</p>
            <p className="text-sm mt-1">Pulsa "📂 Cargar" para importar tu Excel, o "+ Nuevo" para empezar</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl shadow">
              <table className="w-full text-xs border-collapse" style={{tableLayout:"fixed"}}>
                <colgroup>
                  <col style={{width:"3%"}}/>   {/* checkbox */}
                  <col style={{width:"6%"}}/>   {/* Fecha */}
                  <col style={{width:"8%"}}/>   {/* Referencia */}
                  <col style={{width:"15%"}}/>  {/* Artículo */}
                  <col style={{width:"11%"}}/>  {/* Proveedor */}
                  <col style={{width:"3%"}}/>   {/* Uds */}
                  <col style={{width:"6%"}}/>   {/* Cliente */}
                  <col style={{width:"5%"}}/>   {/* Garantía */}
                  <col style={{width:"7%"}}/>   {/* Nº Calidad */}
                  <col style={{width:"6%"}}/>   {/* SAT */}
                  <col style={{width:"17%"}}/>  {/* Última acción */}
                  <col style={{width:"5%"}}/>   {/* Revisión */}
                  <col style={{width:"5%"}}/>   {/* Terminado */}
                  <col style={{width:"4%"}}/>   {/* Fotos */}
                  <col style={{width:"3%"}}/>   {/* Del */}
                </colgroup>
                <thead>
                  <tr className="bg-gray-700 text-white text-[11px]">
                    <th className="px-2 py-2 border border-gray-600">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll}
                        className="w-3.5 h-3.5 accent-blue-400 cursor-pointer"/>
                    </th>
                    {[
                      {label:"Fecha",key:"fecha"},{label:"Referencia",key:"referencia"},
                      {label:"Artículo",key:"articulo"},{label:"Proveedor",key:"proveedor"},
                      {label:"Uds",key:"uds"},{label:"Cliente",key:"cliente"},
                      {label:"Garantía",key:"garantia"},{label:"Nº Calidad",key:"nCalidad"},
                      {label:"SAT",key:"nSAT"},{label:"Última acción",key:"acciones"},
                      {label:"Revisión",key:"revision"},{label:"Terminado",key:"terminado"},
                    ].map(({label,key})=>(
                      <th key={key} className="px-2 py-2 text-left border border-gray-600">
                        <ColHeader label={label} fieldKey={key} {...hProps}/>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-left border border-gray-600">Fotos</th>
                    <th className="border border-gray-600"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s,i)=>{
                    const last=lastLine(s.acciones);
                    const isSel=selected.has(s.id);
                    const bg=isSel?"bg-blue-50":s.terminado?"bg-green-50":i%2===0?"bg-white":"bg-gray-50";
                    return (
                      <tr key={s.id} className={`${bg} hover:bg-blue-50 transition group cursor-pointer`}>
                        <td className="px-2 py-1.5 border border-gray-200 text-center" onClick={e=>e.stopPropagation()}>
                          <input type="checkbox" checked={isSel} onChange={()=>toggleOne(s.id)}
                            className="w-3.5 h-3.5 accent-blue-600 cursor-pointer"/>
                        </td>
                        <td className="px-2 py-1.5 border border-gray-200 whitespace-nowrap font-medium text-gray-700" onClick={()=>setModal({...s})}>{fmt(s.fecha)}</td>
                        <td className="px-2 py-1.5 border border-gray-200 font-mono text-gray-600 truncate" onClick={()=>setModal({...s})}>{s.referencia}</td>
                        <td className="px-2 py-1.5 border border-gray-200 font-medium text-gray-800 truncate" title={s.articulo} onClick={()=>setModal({...s})}>{s.articulo}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-gray-600 truncate" title={s.proveedor} onClick={()=>setModal({...s})}>{s.proveedor}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-center" onClick={()=>setModal({...s})}>{s.uds}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-gray-600 truncate" onClick={()=>setModal({...s})}>{s.cliente}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-center" onClick={()=>setModal({...s})}>{s.garantia&&<span className="bg-yellow-100 text-yellow-800 px-1 py-0.5 rounded font-semibold">Sí</span>}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-gray-600 truncate" onClick={()=>setModal({...s})}>{s.nCalidad}</td>
                        <td className="px-2 py-1.5 border border-gray-200 truncate" onClick={()=>setModal({...s})}>{s.nSAT&&<span className="bg-purple-100 text-purple-800 px-1 py-0.5 rounded">{s.nSAT}</span>}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-gray-600 truncate" title={last} onClick={()=>setModal({...s})}>{last.replace(/^-/,"").trim()}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-gray-500 truncate" onClick={()=>setModal({...s})}>{s.revision}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-center" onClick={()=>setModal({...s})}>{s.terminado&&<span className="bg-green-500 text-white px-1 py-0.5 rounded font-bold text-[10px]">S</span>}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-center" onClick={()=>setModal({...s})}>
                          {(s.fotos||[]).length>0
                            ?<span className="bg-blue-100 text-blue-700 px-1 py-0.5 rounded text-[10px] font-medium">📷{s.fotos.length}</span>
                            :<span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-1 py-1.5 border border-gray-200 text-center">
                          <button onClick={e=>{e.stopPropagation();setConfirmDel(s.id);}}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600">🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-1.5 text-xs text-gray-400 text-right px-1">{filtered.length} de {sats.length} registros</div>
          </>
        )}
      </div>

      {modal && <SATModal sat={modal} onSave={save} onClose={()=>setModal(null)}/>}
      {bulkModal && <BulkModal count={selected.size} onAction={handleBulkAction} onClose={()=>setBulkModal(false)}/>}

      {confirmDel && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="font-semibold text-gray-800 mb-1">¿Eliminar este SAT?</p>
            <p className="text-sm text-gray-500 mb-5">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={()=>del(confirmDel)} className="flex-1 bg-red-600 text-white py-2.5 rounded-xl font-semibold text-sm">Eliminar</button>
              <button onClick={()=>setConfirmDel(null)} className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl font-semibold text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
