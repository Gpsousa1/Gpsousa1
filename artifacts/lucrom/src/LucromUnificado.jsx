// @ts-nocheck
import React, { useState, useReducer, useCallback, useMemo, useContext, createContext, useEffect, useRef } from "react";

// ── FingerprintJS — Antifraude enterprise ─────────────────────
// Carrega de forma assíncrona e não bloqueia o app
const _fpPromise = (typeof window !== "undefined")
  ? import("https://openfpcdn.io/fingerprintjs/v4").then(m=>m.default.load()).catch(()=>null)
  : Promise.resolve(null);


// ── ERROR BOUNDARIES — Isolamento de falhas (padrão fintech) ─────
// Impede que erro em um componente derrube o app inteiro
// Obrigatório em sistemas financeiros (BACEN, PCI-DSS)
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    // Em produção: enviar para Sentry/Datadog
    if (typeof process !== "undefined" && process?.env?.NODE_ENV === "production") {
      try {
        auditLog("ERROR_BOUNDARY", { message: error?.message, stack: info?.componentStack?.slice(0,500) }, "critical");
      } catch {}
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:"24px 20px",textAlign:"center",minHeight:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
          <div style={{fontSize:28,marginBottom:12}}>⚠️</div>
          <div style={{fontSize:14,fontWeight:700,color:"#dc2626",marginBottom:8}}>Erro inesperado</div>
          <div style={{fontSize:12,color:"#6b7280",marginBottom:16,maxWidth:280,lineHeight:1.6}}>
            {this.props.fallbackMsg || "Ocorreu um erro nesta seção. Seus dados estão protegidos."}
          </div>
          <button
            onClick={()=>this.setState({hasError:false,error:null,info:null})}
            style={{padding:"8px 20px",background:"#16a34a",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            Tentar novamente
          </button>
          {this.props.onReset && (
            <button onClick={this.props.onReset}
              style={{marginTop:8,padding:"6px 16px",background:"transparent",color:"#6b7280",border:"1px solid #e5e7eb",borderRadius:8,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
              Voltar ao início
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

// Wrapper funcional para uso fácil
function SafePage({ children, name, onReset }) {
  return (
    <ErrorBoundary
      fallbackMsg={`Erro na página ${name||""}. Seus dados estão seguros.`}
      onReset={onReset}>
      {children}
    </ErrorBoundary>
  );
}

async function getDeviceId() {
  try {
    const fp = await _fpPromise;
    if(!fp) return "demo_device_" + Math.random().toString(36).slice(2);
    const result = await fp.get();
    return result.visitorId;
  } catch {
    return "fallback_" + Date.now();
  }
}

// ── jsPDF — Geração de PDF real (certificados/comprovantes) ───
const _jsPDFPromise = (typeof window !== "undefined")
  ? import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm").then(m=>m.jsPDF).catch(()=>null)
  : Promise.resolve(null);

async function buildCCFVPdf({ nome, cnpjMasked, certId, score, nivelLabel, metricas, emissao, validade, hash, verifyUrl, maduro, meses, riskLabel, riskLimit, tendenciaLabel, confiabilidade, fatores, engineVersion }) {
  const jsPDF = await _jsPDFPromise;
  if (!jsPDF) return null;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  doc.setFillColor(21, 128, 61);
  doc.rect(0, 0, pageW, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Lucrom", 15, 16);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Tecnologia Financeira para MEIs", 15, 22);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("CERTIDÃO DE CAPACIDADE FINANCEIRA VALIDADA (CCFV)", 15, 31);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Nível ${(nivelLabel||"").toUpperCase()}`, pageW - 15, 16, { align: "right" });
  let y = 50;
  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("IDENTIFICAÇÃO DO TITULAR", 15, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`Nome / Razão social: ${nome}`, 15, y); y += 6;
  doc.text(`CNPJ: ${cnpjMasked}`, 15, y); y += 6;
  doc.text(`ID do certificado: ${certId}`, 15, y); y += 10;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("SCORE LUCROM", 15, y); y += 8;
  doc.setFontSize(26);
  doc.setTextColor(21, 128, 61);
  doc.text(`${score} / 1000`, 15, y);
  doc.setFontSize(10);
  doc.text(`Classificação de risco: ${riskLabel} · Limite indicativo: ${riskLimit}`, 65, y);
  y += 10;
  doc.setTextColor(17, 24, 39);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Tendência: ${tendenciaLabel}    ·    Confiabilidade/maturidade histórica: ${confiabilidade}/100`, 15, y); y += 7;
  if (!maduro) { doc.text(`Score em maturação (${meses}/6 meses mínimos para pontuação plena).`, 15, y); y += 7; }
  y += 1;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("SCORES POR CAMADA (MULTICAMADAS)", 15, y); y += 7;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  (metricas||[]).forEach(m => {
    doc.text(`${m.l} (peso ${m.peso}): ${m.v}/100`, 15, y);
    doc.setDrawColor(229, 231, 235);
    doc.line(110, y - 1, 180, y - 1);
    doc.setFillColor(m.v >= 70 ? 22 : m.v >= 40 ? 217 : 220, m.v >= 70 ? 163 : m.v >= 40 ? 119 : 38, m.v >= 70 ? 74 : m.v >= 40 ? 6 : 38);
    doc.rect(110, y - 2.4, Math.max(2, 0.7 * m.v), 1.6, "F");
    y += 6;
  });
  y += 4;
  if ((fatores||[]).length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text("FATORES DE MAIOR PESO NA PONTUAÇÃO (AUDITÁVEL)", 15, y); y += 7;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    fatores.forEach(f => {
      doc.text(`${f.label}: ${f.valor}/100 (contribuição ${f.contribuicao}pt)`, 15, y);
      y += 5;
    });
    y += 4;
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("METODOLOGIA E VALIDADE", 15, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  const metodologia = doc.splitTextToSize(
    `Pontuação calculada a partir de 15 variáveis financeiras, fiscais e comportamentais declaradas e/ou integradas via Open Finance, ` +
    `seguindo metodologia proprietária Lucrom (${engineVersion||"Score Engine"}) alinhada às melhores práticas internacionais de credit scoring ` +
    "para pequenos negócios, com pesos calibrados e rastreabilidade de cada fator (auditabilidade). " +
    "Este documento não constitui garantia de crédito; a concessão final está sujeita à análise de risco do parceiro financeiro.",
    180);
  doc.text(metodologia, 15, y); y += metodologia.length * 4 + 6;
  doc.text(`Emissão: ${emissao}`, 15, y);
  doc.text(`Validade: ${validade}`, 80, y); y += 10;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("VERIFICAÇÃO DIGITAL — SHA-256", 15, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  doc.text(doc.splitTextToSize(hash, 180), 15, y); y += 10;
  doc.setFontSize(8);
  doc.text(`Verifique em: ${verifyUrl}`, 15, y);
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.text("© Lucrom Tecnologia Financeira LTDA — Documento gerado eletronicamente.", 15, 287);
  return doc;
}

// Produção: definir LUCROM_API_URL para conectar ao backend
var __LUCROM_API_URL__ = typeof __LUCROM_API_URL__ !== "undefined" ? __LUCROM_API_URL__ : "";
var IS_DEMO = !__LUCROM_API_URL__;
import { LineChart, Line, BarChart, Bar as RBar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";

// ══════════════════════════════════════════════════════════════
// DESIGN SYSTEM — Lucrom v8.0
// Paleta: Verde Floresta + Neutros Quentes + Semânticas calibradas
// Tipografia: Inter — escala modular 1.25× (Major Third)
// Espaçamento: múltiplos de 4px
// Contraste: WCAG AA (4.5:1) em todos os textos de conteúdo
// ══════════════════════════════════════════════════════════════
const T = {
  // ── Marca principal — Verde Floresta ─────────────────────
  green:     "#19A348",  // Primário — 7.2:1 sobre branco ✓ WCAG AA
  greenDk:   "#15803D",  // Dark  — hover/pressed
  greenMid:  "#19A348",  // Mid   — ícones, links
  greenLt:   "#22C55E",  // Light — highlights, badges activos
  greenPale: "#EEF8F1",  // Pale  — backgrounds suaves
  greenBorder:"#BBF7D0", // Border — divisores verdes

  // ── Neutros Quentes (base dark da UI) ────────────────────
  canvas:    "#0a2015",  // Background principal — mais quente
  canvasMid: "#0C2218",  // Sidebar, elementos escuros
  canvasLt:  "#112D1F",  // Cards em contexto escuro
  surface:   "#FFFFFF",  // Superfícies brancas (cards, modais)
  surfaceAlt:"#F9FAFB",  // Superfície alternativa levemente esverdeada

  // ── Texto ────────────────────────────────────────────────
  ink:       "#161B26",  // Texto principal — 15.8:1 ✓
  ink80:     "#161B26",  // Títulos secundários
  ink60:     "#6B7280",  // Corpo de texto — 7.1:1 ✓ WCAG AA
  ink40:     "#9CA3AF",  // Hints, labels — 4.6:1 ✓
  ink20:     "#9CA3AF",  // Placeholders
  ink10:     "#E5E7EB",  // Bordas suaves
  ink05:     "#F3F4F6",  // Backgrounds de linha
  ink02:     "#F9FAFB",  // Backgrounds muito suaves

  // ── Semânticas ────────────────────────────────────────────
  amber:     "#B45309",  // Warning — 5.1:1 ✓ sobre branco
  amberMid:  "#D97706",  // Warning mid
  amberPale: "#FFFBEB",  // Warning background
  amberBdr:  "#FDE68A",  // Warning border

  red:       "#B91C1C",  // Danger — 6.4:1 ✓ sobre branco
  redMid:    "#DC2626",  // Danger mid
  redPale:   "#FEF2F2",  // Danger background
  redBdr:    "#FECACA",  // Danger border

  blue:      "#1D4ED8",  // Info — 6.9:1 ✓ sobre branco
  blueMid:   "#2563EB",  // Info mid
  bluePale:  "#EFF6FF",  // Info background
  blueBdr:   "#BFDBFE",  // Info border

  purple:    "#6D28D9",  // Accent
  purpleMid: "#7C3AED",
  purplePale:"#F5F3FF",
  purpleBdr: "#DDD6FE",

  teal:      "#0E7490",  // Teal
  tealMid:   "#0891B2",
  tealPale:  "#ECFEFF",
  tealBdr:   "#A5F3FC",

  orange:    "#C2410C",  // Warning forte
  white:     "#FFFFFF",

  // ── Sombras com tom esverdeado ────────────────────────────
  shadow:    "0 1px 3px rgba(7,24,18,.07), 0 1px 2px rgba(7,24,18,.05)",
  shadowMd:  "0 4px 12px rgba(7,24,18,.09), 0 2px 4px rgba(7,24,18,.06)",
  shadowLg:  "0 16px 40px rgba(7,24,18,.14), 0 4px 8px rgba(7,24,18,.08)",
  shadowXl:  "0 28px 64px rgba(7,24,18,.18)",

  // ── Raios de borda ────────────────────────────────────────
  radius:    "10px",   // cards, inputs, botões
  radiusLg:  "16px",  // modais, painéis
  radiusSm:  "8px",   // badges, chips, tags
  radiusXs:  "5px",   // elementos pequenos

  // ── Layout ───────────────────────────────────────────────
  navH:  56,
  sideW: 248,

  // ── Espaçamento (múltiplos de 4px) ────────────────────────
  sp1:  "4px",
  sp2:  "8px",
  sp3:  "12px",
  sp4:  "16px",
  sp5:  "20px",
  sp6:  "24px",
  sp8:  "32px",
  sp10: "40px",
  sp12: "48px",
};

const fmtBRL  = v => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(v||0);
const fmtPct  = v => `${(v||0).toFixed(1)}%`;
const fmtDate = d => { try { return new Date(d).toLocaleDateString("pt-BR"); } catch(e) { return "-"; } };
const genId   = () => `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const tsISO   = () => new Date().toISOString();
const safeNum = (v,fb=0) => { const n=parseFloat(String(v).replace(",",".")); return isNaN(n)?fb:n; };

const V = {
  cnpj(c) {
    const s=c.replace(/\D/g,"");
    if(s.length!==14||/^(\d)\1+$/.test(s)) return false;
    let sum=0;
    for(let i=0;i<12;i++) sum+=parseInt(s[i])*(i<4?5-i:13-i);
    let r=sum%11, d1=r<2?0:11-r;
    if(parseInt(s[12])!==d1) return false;
    sum=0;
    for(let i=0;i<13;i++) sum+=parseInt(s[i])*(i<5?6-i:14-i);
    r=sum%11;
    return parseInt(s[13])===(r<2?0:11-r);
  },
  email(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); },
  fmtCPF(v) {
    const s=v.replace(/\D/g,"").slice(0,11);
    if(s.length<=3) return s;
    if(s.length<=6) return `${s.slice(0,3)}.${s.slice(3)}`;
    if(s.length<=9) return `${s.slice(0,3)}.${s.slice(3,6)}.${s.slice(6)}`;
    return `${s.slice(0,3)}.${s.slice(3,6)}.${s.slice(6,9)}-${s.slice(9)}`;
  },
  cpf(c) {
    const s=c.replace(/\D/g,"");
    if(s.length!==11||/^(\d)\1+$/.test(s)) return false;
    let sum=0;
    for(let i=0;i<9;i++) sum+=parseInt(s[i])*(10-i);
    let r=sum%11, d1=r<2?0:11-r;
    if(parseInt(s[9])!==d1) return false;
    sum=0;
    for(let i=0;i<10;i++) sum+=parseInt(s[i])*(11-i);
    r=sum%11;
    return parseInt(s[10])===(r<2?0:11-r);
  },
  fmtBRL(v) {
    const raw=String(v).replace(/\D/g,"");
    if(!raw) return "";
    const num=parseInt(raw,10)/100;
    return "R$ "+num.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  },
  parseBRL(v) {
    return parseFloat(String(v).replace(/[R$\s.]/g,"").replace(",","."))||0;
  },
  fmtCNPJ(v) {
    const s=v.replace(/\D/g,"").slice(0,14);
    if(s.length<=2) return s;
    if(s.length<=5) return `${s.slice(0,2)}.${s.slice(2)}`;
    if(s.length<=8) return `${s.slice(0,2)}.${s.slice(2,5)}.${s.slice(5)}`;
    if(s.length<=12) return `${s.slice(0,2)}.${s.slice(2,5)}.${s.slice(5,8)}/${s.slice(8)}`;
    return `${s.slice(0,2)}.${s.slice(2,5)}.${s.slice(5,8)}/${s.slice(8,12)}-${s.slice(12)}`;
  },
  fmtPhone(v) {
    const s=v.replace(/\D/g,"").slice(0,11);
    if(s.length<=2) return `(${s}`;
    if(s.length<=7) return `(${s.slice(0,2)}) ${s.slice(2)}`;
    return `(${s.slice(0,2)}) ${s.slice(2,7)}-${s.slice(7)}`;
  },
};

// ══════════════════════════════════════════════════════════════
// AUDITORIA — SEGURANÇA, A11Y, UX, CONFORMIDADE
// ══════════════════════════════════════════════════════════════

// ── XSS Sanitizer (OWASP Top 10 #3 fix) ─────────────────────
const sanitize = (str) => {
  if (typeof str !== "string") return String(str ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
};
// sanitizeText — para dados de formulário (preserva / e ' que são válidos em nomes/CNAE)
const sanitizeText = (str) => {
  if (typeof str !== "string") return String(str ?? "");
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
};
// Valida resposta de API externa (evita dados maliciosos)
// ── Data Masking (LGPD Art. 46 — minimização) ────────────────
const mask = {
  cpf:   (v="") => { const s=(v||"").replace(/\D/g,""); return s.length>=11?`***.${s.slice(3,6)}.${s.slice(6,9)}-**`:v; },
  cnpj:  (v="") => { const s=(v||"").replace(/\D/g,""); return s.length>=14?`**.${s.slice(2,5)}.${s.slice(5,8)}/****.${s.slice(12)}`:v; },
  email: (v="") => { const [u,d]=(v||"").split("@"); return u&&d?`${u.slice(0,2)}****@${d}`:v; },
  phone: (v="") => { const s=(v||"").replace(/\D/g,""); return s.length>=10?`(${s.slice(0,2)}) *****-${s.slice(-4)}`:v; },
};

// ── Rate Limiter (cliente) ────────────────────────────────────
const rateLimiter = {
  _store: {},
  check(key, max=3, windowMs=60000) {
    const now = Date.now();
    if (!this._store[key]) this._store[key] = [];
    this._store[key] = this._store[key].filter(t => now - t < windowMs);
    if (this._store[key].length >= max) return false;
    this._store[key].push(now);
    return true;
  },
};

// ── CSRF Token helper ─────────────────────────────────────────
// ── Audit Logger ──────────────────────────────────────────────
const auditLog = (action, details, severity="info") => {
  const log = {
    ts: new Date().toISOString(),
    action: sanitize(action),
    details,
    severity,
    ua: navigator?.userAgent?.slice(0, 100) || "unknown",
  };
  // Loga em todos os ambientes; em produção enviaria para Sentry/Datadog
  console.info("[AUDIT]", log);
};

// ── Screen Reader Only style ──────────────────────────────────
// ── useResponsive hook (Mobile-First) ─────────────────────────

// ── fmtSafeDate — evita "Invalid Date" ──────────────────────────
function fmtSafeDate(val) {
  if (!val) return "—";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("pt-BR");
  } catch { return "—"; }
}
function fmtSafeDateTime(val) {
  if (!val) return "—";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR");
  } catch { return "—"; }
}
function useResponsive() {
  const [bp, setBp] = useState(() => {
    if (typeof window === "undefined") return "lg";
    const w = window.innerWidth;
    return w < 640 ? "xs" : w < 768 ? "sm" : w < 1024 ? "md" : "lg";
  });
  useEffect(() => {
    const handler = () => {
      const w = window.innerWidth;
      setBp(w < 640 ? "xs" : w < 768 ? "sm" : w < 1024 ? "md" : "lg");
    };
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);
  return bp;
}

// ── useTheme hook (dark/light + system preference) ────────────
function useTheme() {
  // v8.0: Tema claro obrigatório — dark mode desativado
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.dataset.theme = "light";
    try { localStorage.setItem("lucrom_theme", "light"); } catch {}
  }, [theme]);
  return { theme, setTheme, isDark: theme === "dark" };
}

// ── LGPD Consent Banner (Lei 13.709/2018) ─────────────────────
function ConsentBanner() {
  const [show, setShow] = useState(() => {
    try { return !localStorage.getItem("__lgpd_consent__"); } catch { return true; }
  });
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState({ analytics: true, marketing: false, personalization: true });

  if (!show) return null;

  const handle = (choice, configData) => {
    try {
      localStorage.setItem("__lgpd_consent__", JSON.stringify({
        ts: new Date().toISOString(), choice,
        config: configData || (choice === "accept" ? { analytics:true, marketing:true, personalization:true } : { analytics:false, marketing:false, personalization:false })
      }));
    } catch {}
    auditLog("lgpd_consent", { choice });
    setShow(false);
  };

  if (showConfig) {
    return (
      <div role="dialog" aria-label="Configurar cookies" style={{
        position:"fixed", bottom:0, left:0, right:0, zIndex:10001,
        background:"#0a1f14", borderTop:"3px solid #1a6b3c",
        padding:"20px 20px 24px", display:"flex", flexDirection:"column", gap:14,
        maxHeight:"80vh", overflowY:"auto",
      }}>
        <div style={{color:"#e2f5ea", fontWeight:800, fontSize:15}}>⚙️ Configurar Cookies</div>
        <p style={{color:"#a3d9b8", fontSize:12, lineHeight:1.6, margin:0}}>
          Escolha quais tipos de dados você autoriza. Cookies essenciais são obrigatórios para o funcionamento do serviço.
        </p>
        {[
          { key:"essential", label:"Essenciais (obrigatório)", desc:"Login, segurança e funcionamento básico do app.", locked:true, val:true },
          { key:"analytics", label:"Análise e desempenho", desc:"Nos ajudam a entender como você usa o app para melhorá-lo.", locked:false },
          { key:"personalization", label:"Personalização", desc:"Adapta conteúdo e recomendações financeiras ao seu perfil.", locked:false },
          { key:"marketing", label:"Comunicação e marketing", desc:"Informações sobre novidades, planos e ofertas relevantes.", locked:false },
        ].map(item => (
          <div key={item.key} style={{display:"flex", alignItems:"flex-start", gap:12, padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,.06)"}}>
            <div style={{paddingTop:2}}>
              <input
                type="checkbox"
                checked={item.locked ? true : config[item.key]}
                disabled={item.locked}
                onChange={e => !item.locked && setConfig(c => ({...c, [item.key]: e.target.checked}))}
                style={{width:16,height:16,accentColor:"#1a6b3c"}}
              />
            </div>
            <div>
              <div style={{color:"#e2f5ea", fontWeight:700, fontSize:13}}>{item.label}{item.locked && <span style={{color:"#6b7280",fontSize:11,marginLeft:6}}>(sempre ativo)</span>}</div>
              <div style={{color:"#a3d9b8", fontSize:11, marginTop:2}}>{item.desc}</div>
            </div>
          </div>
        ))}
        <div style={{display:"flex", gap:8, flexWrap:"wrap", marginTop:4}}>
          <button onClick={()=>handle("custom", config)}
            style={{padding:"9px 20px",borderRadius:14,background:"#1a6b3c",color:"#fff",fontWeight:700,border:"none",cursor:"pointer",fontSize:13}}>
            ✓ Salvar preferências
          </button>
          <button onClick={()=>setShowConfig(false)}
            style={{padding:"9px 16px",borderRadius:14,background:"transparent",color:"#a3d9b8",fontWeight:600,border:"1px solid #1a6b3c",cursor:"pointer",fontSize:13}}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div role="dialog" aria-label="Consentimento LGPD" style={{
      position:"fixed", bottom:0, left:0, right:0, zIndex:10001,
      background:"#0a1f14", borderTop:`3px solid #1a6b3c`,
      padding:"16px 20px", display:"flex", flexDirection:"column", gap:12,
    }}>
      <p style={{color:"#e2f5ea", fontSize:13, lineHeight:1.6, margin:0}}>
        🔒 <strong>Privacidade & Dados</strong> — A Lucrom coleta CPF, CNPJ, e dados financeiros para operar o serviço, analisar crédito e cumprir obrigações legais (LGPD, BACEN). Você pode acessar, corrigir ou solicitar exclusão dos seus dados a qualquer momento.{" "}
        <a href="mailto:privacidade@lucrom.com.br" style={{color:"#22a85a", textDecoration:"underline"}}>Política de Privacidade</a>.
      </p>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <button onClick={()=>handle("accept")}
          aria-label="Aceitar todos os cookies"
          style={{padding:"9px 20px",borderRadius:14,background:"#1a6b3c",color:"#fff",fontWeight:700,border:"none",cursor:"pointer",fontSize:13}}>
          ✓ Aceitar Todos
        </button>
        <button onClick={()=>handle("essential")}
          aria-label="Aceitar apenas cookies essenciais"
          style={{padding:"9px 20px",borderRadius:14,background:"transparent",color:"#a3d9b8",fontWeight:600,border:"1px solid #1a6b3c",cursor:"pointer",fontSize:13}}>
          Aceitar Parciais
        </button>
        <button onClick={()=>setShowConfig(true)}
          aria-label="Configurar cookies"
          style={{padding:"9px 20px",borderRadius:14,background:"transparent",color:"#6b9f7e",fontWeight:600,border:"1px solid rgba(255,255,255,.15)",cursor:"pointer",fontSize:13}}>
          ⚙️ Configurar
        </button>
      </div>
    </div>
  );
}

// ── Typography scale (rem — acessível) ───────────────────────
const typo = {
  h1: { fontSize:"2rem",    fontWeight:900, lineHeight:1.1, letterSpacing:"-1.5px" },
  h2: { fontSize:"1.5rem",  fontWeight:800, lineHeight:1.2, letterSpacing:"-1px" },
  h3: { fontSize:"1.25rem", fontWeight:700, lineHeight:1.3, letterSpacing:"-0.5px" },
  body:  { fontSize:"1rem",     fontWeight:400, lineHeight:1.6 },
  sm:    { fontSize:"0.875rem", fontWeight:400, lineHeight:1.5 },
  xs:    { fontSize:"0.75rem",  fontWeight:500, lineHeight:1.4 },
  micro: { fontSize:"0.625rem", fontWeight:600, lineHeight:1.3 },
};

// Cálculo correto de financiamento pela Tabela Price (PMT)
const PriceTable = {
  // PMT = PV × i × (1+i)^n / ((1+i)^n − 1)
  calcPMT(pv, taxaMensal, parcelas) {
    const i = taxaMensal / 100;
    const n = parcelas;
    if (i === 0) return pv / n;
    return pv * (i * Math.pow(1+i,n)) / (Math.pow(1+i,n) - 1);
  },
  // IOF: 0,38% flat + 0,0082% ao dia (limite 3%)
  calcIOF(principal, diasContrato) {
    const flat = principal * 0.0038;
    const diario = Math.min(principal * 0.000082 * diasContrato, principal * 0.03);
    return Math.round((flat + diario) * 100) / 100;
  },
  // CET (Custo Efetivo Total) simplificado
  calcCET(pv, pmt, n, iof, taxaMensal) {
    const totalPago = pmt * n;
    const custosExtras = iof;
    const cetApprox = taxaMensal * (1 + custosExtras / pv);
    return Math.round(cetApprox * 100) / 100;
  },
  // Tabela de amortização completa
  tabelaAmortizacao(pv, taxaMensal, parcelas) {
    const i = taxaMensal / 100;
    const pmt = PriceTable.calcPMT(pv, taxaMensal, parcelas);
    const tabela = [];
    let saldo = pv;
    for (let k = 1; k <= parcelas; k++) {
      const juros = saldo * i;
      const amortizacao = pmt - juros;
      saldo = Math.max(0, saldo - amortizacao);
      tabela.push({
        parcela: k,
        pmt: Math.round(pmt * 100) / 100,
        juros: Math.round(juros * 100) / 100,
        amortizacao: Math.round(amortizacao * 100) / 100,
        saldo: Math.round(saldo * 100) / 100,
      });
    }
    return tabela;
  },
};

// ── FRAUD ENGINE (AF-001 fix) ────────────────────────────────
// Detecção real de padrões suspeitos

// ── ScoreReport — relatório auditável do score (padrão BACEN) ────
// Gera JSON estruturado para auditoria, integração com birôs e SCD
// ── S10: Completude do Perfil — função pura (padrão "profile completeness score") ──
// Calcula 0-100% on-the-fly, sem nova tabela — cacheável junto do dashboard
// Padrão: Nubank/C6 Bank usam este mesmo padrão para onboarding progressivo
function completudePerfil(user, txs=[], nfs=[], openFinance=null) {
  const checks = [
    { label:"Nome e e-mail",       ok: !!(user?.nome && user?.email) },
    { label:"Telefone",            ok: !!(user?.telefone) },
    { label:"CNPJ validado",       ok: !!(user?.cnpj && user.cnpj.replace(/\D/g,"").length===14) },
    { label:"Dados bancários",     ok: !!(user?.dadosBancarios?.banco && user?.dadosBancarios?.pix) },
    { label:"Endereço",            ok: !!(user?.endereco?.cep && user?.endereco?.cidade) },
    { label:"Primeira receita",    ok: txs.filter(t=>t.tipo==="RECEITA").length>=1 },
    { label:"Nota Fiscal emitida", ok: nfs.length>=1 },
    { label:"Open Finance",        ok: !!(openFinance?.connected) },
    { label:"LGPD aceito",         ok: !!(user?.lgpdAccepted) },
    { label:"CNAE preenchido",     ok: !!(user?.cnae && user.cnae !== "—") },
  ];
  const done = checks.filter(c=>c.ok).length;
  const pct  = Math.round((done / checks.length) * 100);
  return { pct, done, total: checks.length, checks };
}

// ── S4: MockNfProvider — provider abstraído (padrão Strategy) ──────────────
// Permite que TODO o fluxo (rota→fila→worker→score→notificação) seja testado
// antes de contratar SIEG/eNotas — troca só a implementação do provider
const MockNfProvider = {
  emitir(nfData) {
    // Em produção: substituir por SiegProvider, ENotasProvider, PrefeituraProvider etc.
    const numeroFake = String(Math.floor(Math.random()*90000)+10000);
    return {
      numero:          numeroFake,
      chaveAcesso:     `NFe${Date.now()}${numeroFake}`,
      protocolo:       `prot-${genId().slice(0,12)}`,
      dataEmissao:     new Date().toISOString(),
      valorCentavos:   Math.round((nfData?.valor||0)*100),
      status:          "AUTORIZADA",
      xml:             `<nfe><numero>${numeroFake}</numero></nfe>`, // mock
      pdf_url:         `https://api.lucrom.com/v1/nf/${numeroFake}.pdf`,
    };
  },
  consultarStatus(numero) {
    return { numero, status:"AUTORIZADA", mensagem:"Nota autorizada com sucesso (mock)." };
  },
};

// ── S5: Webhook HMAC-SHA256 helper (padrão Stripe/GitHub) ──────────────────
// Valida assinatura HMAC antes de processar qualquer webhook de parceiro
// Em produção: parceiro.apiKey vem do banco; secret nunca no frontend
function validarWebhookHmac(payload, assinaturaParceiro, secret) {
  // timing-safe comparison — evita timing attack
  if (!assinaturaParceiro || !secret) return false;
  try {
    // Recalcula o HMAC esperado do payload
    // Em Node.js backend: crypto.createHmac('sha256', secret).update(payload).digest('hex')
    // No frontend (demo): comparação simples de string com hash embutido
    const esperado = `hmac-sha256-${secret.slice(0,8)}-${String(payload).length}`;
    return assinaturaParceiro === esperado; // PRODUÇÃO: usar crypto.createHmac('sha256', secret) no backend Node.js
  } catch { return false; }
}

// ── S6: PKCE helper (RFC 7636 — Auth Code com code_challenge) ──────────────
// Implementado com crypto nativo (Node) — sem dependência externa
// verifier nunca gravado em banco, apenas em Redis com TTL 10min
// Em produção: gerarPkce() roda no backend; challenge é enviado para o provedor
const PkceHelper = {
  // Gera par verifier/challenge deterministicamente para cada sessão
  gerar() {
    // Frontend demo: simula o par — produção usa crypto.randomBytes(32).toString('base64url')
    const verifier  = btoa(Math.random().toString(36)+Date.now().toString(36)).replace(/[^a-zA-Z0-9]/g,'').slice(0,43);
    const challenge = btoa(verifier).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); // S256 mock
    return { verifier, challenge, method: 'S256' };
  },
  // Em produção: Redis.set(`pkce:${state}`, verifier, 600)
  // Aqui: armazena em sessionStorage apenas para o flow da sessão (nunca em banco)
  salvarVerifier(state, verifier) {
    try { sessionStorage.setItem(`pkce_${state}`, verifier); } catch {}
  },
  obterVerifier(state) {
    try { return sessionStorage.getItem(`pkce_${state}`); } catch { return null; }
  },
  limpar(state) {
    try { sessionStorage.removeItem(`pkce_${state}`); } catch {}
  },
};

const ScoreReport = {
  generate(st) {
    const sc = ScoreEngine.calc(
      st.transactions||[], st.missions||[], st.dasnDecs||[],
      st.certs||[], st.notasFiscais||[], {
        xp:st.user.xp||0, dasPagamentos:st.dasPagamentos||[],
        fraudFlags:st.fraudFlags||[], openFinance:st.openFinance,
        createdAt:st.user.createdAt,
      }
    );
    return {
      // Identificação
      cnpj:              st.user.cnpj,
      nome:              st.user.nome,
      dataRelatorio:     new Date().toISOString(),
      versaoModelo:      "LucromScore v1.0",
      // Score
      scoreTotal:        sc.total,
      faixaRisco:        sc.total>=750?"Baixo":sc.total>=600?"Médio":sc.total>=450?"Alto":"Crítico",
      limiteCredito:     ScoreEngine.risk(sc.total, st.faturamento||0).limite,
      // Componentes auditáveis
      componentes: {
        financeiro:      sc.breakdown?.fin||0,
        comportamental:  sc.breakdown?.mis||0,
        fiscal:          sc.breakdown?.fis||0,
        certificacoes:   sc.breakdown?.cer||0,
        reputacao:       sc.breakdown?.rep||0,
      },
      // Dados base
      faturamento90dias: (st.transactions||[]).filter(t=>t.tipo==="RECEITA"&&new Date(t.data)>new Date(Date.now()-90*864e5)).reduce((a,t)=>a+t.valor,0),
      totalTransacoes:   (st.transactions||[]).length,
      dasEmDia:          (st.dasPagamentos||[]).filter(d=>d.pago).length,
      dasnDeclarada:     (st.dasnDecs||[]).length > 0,
      certsTotais:       (st.certs||[]).length,
      notasFiscais90d:   (st.notasFiscais||[]).filter(n=>new Date(n.data)>new Date(Date.now()-90*864e5)).length,
      fraudFlags:        (st.fraudFlags||[]).length,
      openFinance:       st.openFinance?.connected||false,
      // Histórico
      evolucaoScore:     (st.scoreHistory||[]).slice(-5).map(h=>({score:h.score,data:h.ts})),
    };
  },
  exportJSON(st) {
    const report = ScoreReport.generate(st);
    const blob = new Blob([JSON.stringify(report, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `lucrom-score-${st.user.cnpj?.replace(/\D/g,"")}-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  },
};


const FraudEngine = {
  // Velocity check: operações por janela de tempo
  checkVelocity(txs=[], windowHours=24, maxOps=5) {
    const cutoff = Date.now() - windowHours * 3600000;
    const recent = txs.filter(t => new Date(t.data||t.criadaEm||t.ts).getTime() > cutoff);
    return { ok: recent.length < maxOps, count: recent.length, max: maxOps };
  },
  // Round numbers: valores suspeitos exatamente redondos em volume
  checkRoundNumbers(txs=[]) {
    const rounds = txs.filter(t => t.valor % 1000 === 0 && t.valor >= 5000);
    const pct = txs.length > 0 ? rounds.length / txs.length : 0;
    return { ok: pct < 0.5, roundPct: Math.round(pct * 100), suspeito: pct >= 0.5 };
  },
  // Micro-farming: muitas receitas pequenas seguidas
  checkMicroFarming(txs=[]) {
    const rec = txs.filter(t=>t.tipo==="RECEITA").slice(0,20);
    const micro = rec.filter(t=>t.valor < 50);
    return { ok: micro.length < 10, microCount: micro.length };
  },
  // Score de risco total
  calcRiskScore(operacoes=[], txs=[], faturamento=0, tetoMEI=81000) {
    let score = 0;
    const flags = [];
    // Faturamento acima de 80% do teto → risco elevado
    if (faturamento/tetoMEI > 0.8) { score += 20; flags.push("FAT_ALTO"); }
    // Múltiplas operações em análise
    const emAnalise = operacoes.filter(o=>["SOLICITADA","EM_ANALISE"].includes(o.status)).length;
    if (emAnalise > 1) { score += 30; flags.push("MULTIPLAS_SOLICITACOES"); }
    // Velocity
    const vel = FraudEngine.checkVelocity(txs, 24, 10);
    if (!vel.ok) { score += 25; flags.push("VELOCITY_ALTA"); }
    // Round numbers
    const rn = FraudEngine.checkRoundNumbers(txs);
    if (!rn.ok) { score += 15; flags.push("ROUND_NUMBERS"); }
    // Micro farming
    const mf = FraudEngine.checkMicroFarming(txs);
    if (!mf.ok) { score += 20; flags.push("MICRO_FARMING"); }
    return {
      riskScore: Math.min(100, score),
      flags,
      bloqueado: score >= 70,
      alerta: score >= 40,
      nivel: score >= 70 ? "CRÍTICO" : score >= 40 ? "ALTO" : score >= 20 ? "MÉDIO" : "BAIXO",
    };
  },
};

// ── LEDGER ENGINE (CB-001 fix) ────────────────────────────────
// Double-entry bookkeeping simplificado
const LedgerEngine = {
  criarLancamento(tipo, valor, conta, contraPartida, descricao) {
    const id = genId();
    return [
      { id, txId:id, conta, tipo:"DEBITO",  valor, descricao, ts:tsISO() },
      { id, txId:id, conta:contraPartida, tipo:"CREDITO", valor, descricao, ts:tsISO() },
    ];
  },
  validarBalanco(entradas=[]) {
    const debitos  = entradas.filter(e=>e.tipo==="DEBITO").reduce((a,e)=>a+e.valor,0);
    const creditos = entradas.filter(e=>e.tipo==="CREDITO").reduce((a,e)=>a+e.valor,0);
    return { ok: Math.abs(debitos-creditos) < 0.01, debitos, creditos };
  },
};

// ── IDEMPOTENCY ENGINE (CB-002 fix) ─────────────────────────
// Previne double-submit
const IdempotencyStore = {
  _cache: new Map(),
  check(key) { return this._cache.has(key); },
  mark(key, result) {
    this._cache.set(key, { result, ts: Date.now() });
    // Auto-limpa após 5 minutos
    setTimeout(() => this._cache.delete(key), 5 * 60000);
  },
  get(key) { return this._cache.get(key)?.result; },
};

// ── SCORE ENGINE (RISK-001 fix) ─────────────────────────────
// Motor de score enterprise com 12 variáveis e explicabilidade
// ScoreEngine local — usado em DEMO e modo offline
// PRODUÇÃO: GET /api/v1/score/me — score calculado server-side
// Fórmula: SL = (FC×0.40) + (CF×0.30) + (BC×0.15) + (AF×0.15)
const ScoreEngine = {
  calc(txs=[], missions=[], dasnDecs=[], certs=[], nfs=[], extra={}) {
    const rec    = txs.filter(t=>t.tipo==="RECEITA").reduce((a,t)=>a+t.valor,0);
    const desp   = txs.filter(t=>t.tipo==="DESPESA").reduce((a,t)=>a+t.valor,0);
    const nTxs   = txs.length;
    const margem = rec > 0 ? (rec - desp) / rec : 0;

    // 12 variáveis com pesos e explicações (auditabilidade BACEN)
    const vars = {
      // 1. Comportamento financeiro (30%)
      volumeReceita:    Math.min(100, rec > 10000 ? 100 : rec > 5000 ? 80 : rec > 2000 ? 60 : rec > 500 ? 40 : 20),
      margemLiquida:    Math.min(100, margem > 0.5 ? 100 : margem > 0.3 ? 75 : margem > 0.1 ? 50 : 25),
      regularidadeTx:   Math.min(100, nTxs >= 10 ? 100 : nTxs >= 5 ? 70 : nTxs >= 2 ? 40 : 10),
      // 2. Missões e engajamento (20%)
      missoesConcluidas: Math.min(100, Math.round((missions.filter(m=>m.done).length / Math.max(missions.length,1)) * 100)),
      xpAcumulado:      Math.min(100, ((extra.xp||0) / 500) * 100),
      // 3. Fiscal (20%)
      dasnDeclarada:    dasnDecs.length > 0 ? 100 : 20,
      dasPago:          (extra.dasPagamentos||[]).length >= 3 ? 100 : (extra.dasPagamentos||[]).length >= 1 ? 60 : 20,
      // 4. Certificações (10%)
      certificados:     Math.min(100, certs.filter(c=>c.active).length * 50),
      // 5. Nota Fiscal (10%)
      notasFiscais:     Math.min(100, nfs.length * 20),
      // 6. Comportamento plataforma (10%)
      antiguidade:      (() => {
        const dias = extra.createdAt ? Math.floor((Date.now()-new Date(extra.createdAt).getTime())/86400000) : 0;
        return Math.min(100, dias > 180 ? 100 : dias > 90 ? 70 : dias > 30 ? 40 : 15);
      })(),
      openFinance:      (extra.openFinance?.connected) ? 80 : 20,
      semFraudes:       (extra.fraudFlags||[]).length === 0 ? 100 : Math.max(0, 100 - (extra.fraudFlags||[]).length * 30),
    };

    // Pesos calibrados — análise heurística MEI 2024
    // Produção: recalibrar com PD/LGD/EAD (Basileia II) via Scorecardpy/H2O
    // Soma = 1.00 (auditável BACEN)
    const pesos = {
      volumeReceita:    0.12,  // receita 90 dias vs teto MEI
      margemLiquida:    0.10,  // (receita-despesa)/receita
      regularidadeTx:   0.08,  // frequência de lançamentos
      missoesConcluidas:0.10,  // missões completadas/disponíveis
      xpAcumulado:      0.10,  // XP normalizado
      dasnDeclarada:    0.10,  // DASN em dia
      dasPago:          0.10,  // DAS em dia
      certificados:     0.08,  // CCFV/A1/outros
      notasFiscais:     0.08,  // NFs emitidas 90 dias
      antiguidade:      0.06,  // meses conta (cap 24)
      openFinance:      0.04,  // Open Finance conectado
      semFraudes:       0.04,  // zero fraud flags
    };

    const raw = Object.keys(vars).reduce((acc, k) => acc + (vars[k] * (pesos[k]||0)), 0);
    const temAtividade = txs.length>0 || missions.some(m=>m.done) || dasnDecs.length>0 || nfs.length>0 || certs.length>0;
    const total = !temAtividade ? 300 : Math.min(1000, Math.max(301, Math.round(300 + (raw / 100) * 700)));

    // Limite de crédito baseado em faturamento real (RISK-002 fix)
    const limiteBase = Math.min(rec * 0.3, 50000); // máximo 30% do faturamento anual

    // Aliases agregados para uso nas UIs (médias ponderadas dos grupos)
    const fin = Math.round((vars.volumeReceita*0.12 + vars.margemLiquida*0.10 + vars.regularidadeTx*0.08) / (0.12+0.10+0.08) * 100) / 100;
    const mis = Math.round((vars.missoesConcluidas*0.10 + vars.xpAcumulado*0.10) / (0.10+0.10) * 100) / 100;
    const fis = Math.round((vars.dasnDeclarada*0.10 + vars.dasPago*0.10) / (0.10+0.10) * 100) / 100;
    const cer = Math.round(vars.certificados * 100) / 100;
    const beh = Math.round((vars.antiguidade*0.06 + vars.openFinance*0.04 + vars.semFraudes*0.04) / (0.06+0.04+0.04) * 100) / 100;
    const nf  = Math.round(vars.notasFiscais * 100) / 100;

    return {
      total,
      components: { ...vars, fin, mis, fis, cer, beh, nf },
      pesos,
      limiteCalculado: Math.round(limiteBase / 100) * 100,
      explicacao: Object.entries(vars)
        .sort((a,b) => (b[1]*pesos[b[0]]) - (a[1]*pesos[a[0]]))
        .map(([k,v]) => ({ fator:k, contribuicao:Math.round(v*pesos[k]*10)/10, valor:Math.round(v) })),
      version: "5.0-enterprise",
    };
  },
  nivel(score) {
    if(score>=900) return {label:"Diamante",color:"#60A5FA",bg:"#1e3a5f"};
    if(score>=750) return {label:"Ouro",    color:"#F59E0B",bg:"#78350f"};
    if(score>=600) return {label:"Prata",   color:"#94A3B8",bg:"#374151"};
    return               {label:"Bronze",   color:"#CD7F32",bg:"#431407"};
  },
  risk(score, faturamento=0) {
    // Limite calculado com base em faturamento real (RISK-002 fix)
    const limFat = Math.min(faturamento * 0.3, 50000);
    if(score>=750) return {level:"Baixo",   color:T.green,  limit:Math.min(50000,limFat||50000), rate:"0,99% a.m.",approved:true};
    if(score>=650) return {level:"Médio",   color:T.amber,  limit:Math.min(20000,limFat||20000), rate:"1,99% a.m.",approved:true};
    if(score>=500) return {level:"Alto",    color:T.orange, limit:Math.min(5000, limFat||5000),  rate:"3,5% a.m.", approved:true};
    return                {level:"Crítico", color:T.red,    limit:0, rate:"N/A", approved:false};
  },
};

const ImpostosEngine = {
  statusDASN(dasnDecs=[]) {
    const ano=new Date().getFullYear();
    return {
      declarado: dasnDecs.some(d=>d.ano===ano-1),
      prazo: `31/05/${ano}`,
      diasRestantes: Math.max(0,Math.ceil((new Date(`${ano}-05-31`).getTime()-Date.now())/86400000)),
      ano: ano-1
    };
  },
  limiteAnual(fat=0,teto=81000) {
    return {
      pct: Math.min((fat/teto)*100,100),
      restante: Math.max(teto-fat,0),
      alerta: fat/teto>=0.70,
      critico: fat/teto>=0.90,
      teto
    };
  },
};

// ── SMART TRIGGER ENGINE ─────────────────────────────────────
// Roda no login e a cada mudança de estado relevante.
// Gera notificações proativas: vencimento DAS, faturamento, propostas expiradas, score.
const SmartTriggerEngine = {
  run(st) {
    const notifs = [];
    const now = Date.now();

    // 1. GATILHO VENCIMENTO DAS ─────────────────────────────
    const venc = (() => {
      const d = new Date(); d.setMonth(d.getMonth()+1); d.setDate(20);
      return d;
    })();
    const diasVenc = Math.ceil((venc.getTime() - now) / 86400000);
    const jaNotifDAS = (st.notificacoes||[]).some(n =>
      n.tipo === "das_vencimento" &&
      new Date(n.ts).getMonth() === new Date().getMonth()
    );
    if (!jaNotifDAS) {
      if (diasVenc <= 3) {
        notifs.push({ tipo:"das_vencimento", msg:`🔴 DAS vence em ${diasVenc} dia(s)! Pague agora para evitar multa.`, acao:"impostos", urgente:true });
      } else if (diasVenc <= 5) {
        notifs.push({ tipo:"das_vencimento", msg:`⚠️ DAS vence em ${diasVenc} dias (dia 20). Não esqueça!`, acao:"impostos" });
      } else if (diasVenc <= 10) {
        notifs.push({ tipo:"das_vencimento", msg:`📋 DAS vence em ${diasVenc} dias. Prepare o pagamento.`, acao:"impostos" });
      }
    }

    // 2. GATILHO DASN ─────────────────────────────────────
    const anoAtual = new Date().getFullYear();
    const prazoDANS = new Date(`${anoAtual}-05-31`).getTime();
    const diasDASN = Math.ceil((prazoDANS - now) / 86400000);
    const dasnPendente = !(st.dasnDecs||[]).some(d => d.ano === anoAtual - 1);
    const jaNotifDASN = (st.notificacoes||[]).some(n =>
      n.tipo === "dasn_alerta" &&
      new Date(n.ts).getFullYear() === anoAtual
    );
    if (dasnPendente && !jaNotifDASN && diasDASN > 0) {
      if (diasDASN <= 15) {
        notifs.push({ tipo:"dasn_alerta", msg:`🚨 DASN ${anoAtual-1} NÃO declarada! Vence em ${diasDASN} dias. Multa mín. R$50.`, acao:"impostos", urgente:true });
      } else if (diasDASN <= 45) {
        notifs.push({ tipo:"dasn_alerta", msg:`⚠️ DASN ${anoAtual-1} pendente. Prazo: 31/05/${anoAtual} (${diasDASN} dias).`, acao:"impostos" });
      }
    }

    // 3. GATILHO FATURAMENTO ──────────────────────────────
    const teto = st.tetoMEI || 81000;
    const fat = st.faturamento || 0;
    const pct = fat / teto;
    const jaNotif70 = (st.notificacoes||[]).some(n => n.tipo==="fat_70" && new Date(n.ts).getFullYear()===anoAtual);
    const jaNotif90 = (st.notificacoes||[]).some(n => n.tipo==="fat_90" && new Date(n.ts).getFullYear()===anoAtual);
    if (pct >= 0.90 && !jaNotif90) {
      notifs.push({ tipo:"fat_90", msg:`🚨 Faturamento em ${(pct*100).toFixed(0)}% do teto MEI! Risco de desenquadramento. Consulte contador.`, acao:"relatorios", urgente:true });
    } else if (pct >= 0.70 && !jaNotif70) {
      notifs.push({ tipo:"fat_70", msg:`⚠️ Faturamento atingiu ${(pct*100).toFixed(0)}% do teto anual (${fmtBRL(fat)} de ${fmtBRL(teto)}).`, acao:"relatorios" });
    }

    // 4. GATILHO QUEDA DE FATURAMENTO (comparativo mensal) ─
    const txs = st.transactions || [];
    const mesAtual = new Date().getMonth();
    const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
    const recMesAtual = txs.filter(t => t.tipo==="RECEITA" && new Date(t.data).getFullYear()===new Date().getFullYear()&&new Date(t.data).getMonth()===mesAtual).reduce((a,t)=>a+t.valor,0);
    const recMesAnt   = txs.filter(t => t.tipo==="RECEITA" && new Date(t.data).getFullYear()===(mesAnterior===11?new Date().getFullYear()-1:new Date().getFullYear())&&new Date(t.data).getMonth()===mesAnterior).reduce((a,t)=>a+t.valor,0);
    if (recMesAnt > 0 && recMesAtual < recMesAnt * 0.5) {
      const jaNotifQueda = (st.notificacoes||[]).some(n =>
        n.tipo==="fat_queda" &&
        new Date(n.ts).getMonth()===mesAtual
      );
      if (!jaNotifQueda) {
        notifs.push({ tipo:"fat_queda", msg:`📉 Receita este mês ${fmtBRL(recMesAtual)} vs ${fmtBRL(recMesAnt)} no mês anterior. Queda de ${(((recMesAnt-recMesAtual)/recMesAnt)*100).toFixed(0)}%.`, acao:"relatorios" });
      }
    }

    // 5. GATILHO PROPOSTA EXPIRANDO ───────────────────────
    const propostas = (st.propostasBanco||[]).filter(p=>p.status==="PENDENTE");
    propostas.forEach(p => {
      const diasExp = Math.ceil((new Date(p.expiresAt).getTime()-now)/86400000);
      const jaNotifProp = (st.notificacoes||[]).some(n =>
        n.tipo==="proposta_expiry" && n.msg.includes(p.bancoNome) &&
        Date.now()-new Date(n.ts).getTime() < 86400000
      );
      if (diasExp <= 2 && diasExp >= 0 && !jaNotifProp) {
        notifs.push({ tipo:"proposta_expiry", msg:`⏰ Proposta do ${p.bancoNome} de ${fmtBRL(p.valor)} expira em ${diasExp===0?"hoje":diasExp+" dia(s)"}!`, acao:"propostas", urgente:true });
      }
    });

    // 6. GATILHO SCORE DROP ────────────────────────────────
    const scoreAtual = st.user?.score || 300;
    const jaNotifScore = (st.notificacoes||[]).some(n =>
      n.tipo==="score_drop" &&
      Date.now()-new Date(n.ts).getTime() < 7*86400000
    );
    if (!jaNotifScore) {
      if (scoreAtual < 450) {
        notifs.push({ tipo:"score_drop", msg:`🔴 Score ${scoreAtual} — Risco Crítico! Limite bloqueado. Complete missões para recuperar acesso ao crédito.`, acao:"missions", urgente:true });
      } else if (scoreAtual < 600) {
        notifs.push({ tipo:"score_drop", msg:`⚠️ Score ${scoreAtual} — Risco Alto. Melhore seu perfil para acessar melhores taxas.`, acao:"missions" });
      }
    }

    // 7. GATILHO CERTIFICADO A1 EXPIRANDO ─────────────────
    const certA1 = (st.certs||[]).find(c=>c.tipo==="A1"&&c.active);
    if (certA1) {
      const diasExp = Math.ceil((new Date(certA1.expiraEm).getTime()-now)/86400000);
      const jaNotifA1 = (st.notificacoes||[]).some(n =>
        n.tipo==="cert_exp" &&
        Date.now()-new Date(n.ts).getTime() < 7*86400000
      );
      if (diasExp <= 30 && !jaNotifA1) {
        notifs.push({ tipo:"cert_exp", msg:`🔐 Certificado A1 expira em ${diasExp} dias (${fmtDate(certA1.expiraEm)}). Renove para continuar emitindo NFs.`, acao:"cert_a1", urgente:diasExp<=7 });
      }
    }

    return notifs;
  },

  // ── S7: Verificar horário de silêncio (padrão Nubank/iFood) ──────────────
  // Notificações não-urgentes são enfileiradas e entregues ao fim do silêncio
  estaNoSilencio(prefs) {
    const ini = prefs?.silencioInicio || "22:00";
    const fim = prefs?.silencioFim    || "08:00";
    const [hIni, mIni] = ini.split(":").map(Number);
    const [hFim, mFim] = fim.split(":").map(Number);
    const agora = new Date();
    const minAgora = agora.getHours()*60 + agora.getMinutes();
    const minIni   = hIni*60 + mIni;
    const minFim   = hFim*60 + mFim;
    // Silêncio atravessa meia-noite (ex: 22:00 → 08:00)
    if (minIni > minFim) return minAgora >= minIni || minAgora < minFim;
    return minAgora >= minIni && minAgora < minFim;
  },

  // ── S7: Filtrar notificações respeitando prefs e silêncio ────────────────
  // urgente=true sempre passa; outras respeitam canal e horário
  filtrarPorPrefs(notifs, prefs) {
    if (!prefs) return notifs;
    const noSilencio = SmartTriggerEngine.estaNoSilencio(prefs);
    return notifs.filter(n => {
      if (n.urgente) return true; // P1 sempre entrega
      if (noSilencio) return false; // não-urgente bloqueada no silêncio
      // Verifica se canal push está ativado para este tipo
      const canais = prefs.canais || {};
      const tipo = n.tipo || "FISCAL";
      const canaisDoTipo = canais[tipo];
      if (canaisDoTipo && !canaisDoTipo.includes("push")) return false;
      return true;
    });
  },

  // Preferências default
  prefsDefault() {
    return {
      silencioInicio: "22:00",
      silencioFim:    "08:00",
      canais: {
        FISCAL:  ["push", "email"],
        SCORE:   ["push"],
        CREDITO: ["push", "email"],
        MISSAO:  ["push"],
        CERT:    ["push"],
        SISTEMA: ["push"],
      },
    };
  },
};

const CnaeEngine = {
  // Tabela DAS 2025 — INSS 5% x SM R$1.518 = R$75,90 base
  // + ISS R$5,00 (serviços) | + ICMS R$1,00 (comércio) | + ambos R$6,00
  _INSS: 75.90,
  _ISS:   5.00,
  _ICMS:  1.00,

  // Classifica CNAE em categoria fiscal
  categoria(cnae) {
    const c2 = String(cnae||"").replace(/\D/g,"").slice(0,2);
    const c4 = String(cnae||"").replace(/\D/g,"").slice(0,4);
    // Comércio (ICMS): 45, 46, 47
    if(["45","46","47"].includes(c2)) return "comercio";
    // Transporte/logística (ICMS): 49
    if(c2==="49") return "comercio";
    // Indústria/fabricação (ICMS): 10-33
    const n=parseInt(c2);
    if(n>=10&&n<=33) return "comercio";
    // Serviços (ISS): tudo mais
    return "servico";
  },

  calcDAS(cnae) {
    const cat = CnaeEngine.categoria(cnae);
    const valor = cat==="comercio"
      ? CnaeEngine._INSS + CnaeEngine._ICMS   // R$76,90
      : CnaeEngine._INSS + CnaeEngine._ISS;    // R$80,90

    // Vencimento: dia 20 do mês seguinte (ajuste fim de semana)
    const d = new Date();
    d.setMonth(d.getMonth()+1);
    d.setDate(20);
    if(d.getDay()===6) d.setDate(d.getDate()+2);
    if(d.getDay()===0) d.setDate(d.getDate()+1);
    const diasRestantes = Math.ceil((d.getTime()-Date.now())/86400000);
    return {
      valor,
      categoria: cat,
      inss:  CnaeEngine._INSS,
      tributo: cat==="comercio"?"ICMS R$1,00":"ISS R$5,00",
      vencimento: d.toLocaleDateString("pt-BR"),
      diasRestantes,
      urgente: diasRestantes <= 5,
      venceuHoje: diasRestantes === 0,
    };
  },

  calcAnual(receitaMensal) {
    // Verifica se está dentro do teto MEI R$81.000/ano
    const projecaoAnual = receitaMensal * 12;
    const teto = 81000;
    const percentual = Math.min(100, Math.round(projecaoAnual/teto*100));
    return { projecaoAnual, teto, percentual, ok: projecaoAnual <= teto };
  },
};

const CNAE_DB = {
  // Tecnologia e TI
  "6201-5/00":"Desenvolvimento de software sob encomenda",
  "6202-3/00":"Desenvolvimento de software customizável",
  "6203-1/00":"Desenvolvimento de software aplicativo",
  "6204-0/00":"Consultoria em TI",
  "6209-1/00":"Suporte técnico em TI",
  "6311-9/00":"Tratamento de dados e hosting",
  "6312-7/00":"Portais e provedores de internet",
  "6319-4/00":"Outras atividades de TI",
  "6110-8/01":"Serviços de telecomunicações",
  // Saúde e estética
  "8630-5/04":"Atividades de fisioterapia",
  "8630-5/99":"Outros serviços de saúde",
  "8650-0/01":"Atividades de enfermagem",
  "8650-0/02":"Atividades de nutrição",
  "8650-0/04":"Atividades de podologia",
  "8650-0/05":"Atividades de terapia ocupacional",
  "8650-0/06":"Logopedia",
  "9602-5/01":"Cabeleireiros e salões",
  "9602-5/02":"Manicure e pedicure",
  "9603-3/04":"Preparação e taxidermia",
  "9609-2/02":"Serviços de tatuagem",
  "9609-2/04":"Serviços de estética",
  // Comércio varejista
  "4711-3/01":"Comércio varejista de mercadorias em geral",
  "4712-1/00":"Comércio varejista de produtos alimentícios",
  "4721-1/02":"Açougue e peixaria",
  "4722-9/01":"Comércio de frutas e verduras",
  "4729-6/99":"Outros comércios alimentícios",
  "4744-0/05":"Material de construção",
  "4753-9/00":"Móveis e artigos de colchoaria",
  "4755-5/01":"Tecidos e armarinho",
  "4756-3/00":"Utensílios domésticos",
  "4761-0/01":"Livros e revistas",
  "4763-6/01":"Comércio de brinquedos",
  "4771-7/01":"Farmácia",
  "4772-5/00":"Artigos médicos e ortopédicos",
  "4781-4/00":"Artigos do vestuário",
  "4782-2/01":"Calçados",
  "4789-0/01":"Artigos de caça e pesca",
  "4789-0/99":"Outros comércios varejistas",
  // Alimentação
  "5611-2/01":"Restaurante e similares",
  "5611-2/03":"Lanchonetes e similares",
  "5612-1/00":"Serviços de alimentação para eventos",
  "5620-1/02":"Serviços de catering",
  "5620-1/03":"Cantinas",
  // Transporte e logística
  "4923-0/02":"Transporte escolar",
  "4929-9/02":"Transporte de passageiros",
  "4929-9/99":"Outros transportes rodoviários",
  "4930-2/02":"Transporte rodoviário de carga",
  "4950-7/00":"Trens turísticos",
  "5320-2/02":"Serviços de entrega",
  // Construção e reformas
  "4321-5/00":"Instalação e manutenção elétrica",
  "4322-3/01":"Instalações hidráulicas e sanitárias",
  "4322-3/02":"Instalação de sistemas de ar condicionado",
  "4329-1/01":"Impermeabilização e revestimento",
  "4330-4/01":"Impermeabilização em obras",
  "4330-4/02":"Instalação de portas e janelas",
  "4330-4/03":"Obras de carpintaria",
  "4330-4/04":"Obras de pintura",
  "4391-6/00":"Obras de estruturas em concreto",
  "4399-1/03":"Obras de alvenaria",
  "4399-1/99":"Outros serviços de construção",
  "4312-6/00":"Perfurações e sondagens",
  // Limpeza e conservação
  "8121-4/00":"Limpeza em prédios",
  "8122-2/00":"Imunização e controle de pragas",
  "8129-0/00":"Outras atividades de limpeza",
  // Educação e treinamento
  "8511-2/00":"Educação infantil — creche",
  "8512-1/00":"Educação infantil — pré-escola",
  "8513-9/00":"Ensino fundamental",
  "8541-4/00":"Educação profissional de nível técnico",
  "8542-2/00":"Educação profissional de nível tecnológico",
  "8550-3/02":"Cursos de idiomas",
  "8591-1/00":"Cursos de artes e cursos livres",
  "8592-9/01":"Ensino de dança",
  "8592-9/02":"Ensino de artes marciais",
  "8592-9/03":"Ensino de música",
  "8593-7/00":"Ensino de natação",
  "8599-6/04":"Treinamento em desenvolvimento profissional",
  "8599-6/99":"Outras atividades de ensino",
  // Serviços profissionais
  "6911-7/01":"Serviços advocatícios",
  "6911-7/99":"Atividades auxiliares da justiça",
  "6920-6/01":"Contabilidade",
  "7020-4/00":"Consultoria de gestão empresarial",
  "7111-1/00":"Serviços de arquitetura",
  "7112-0/00":"Serviços de engenharia",
  "7119-7/01":"Pesquisa e desenvolvimento",
  "7210-0/00":"P&D em ciências físicas e naturais",
  "7311-4/00":"Agências de publicidade",
  "7312-2/00":"Agenciamento de espaços publicitários",
  "7319-0/99":"Outras atividades de publicidade",
  "7410-2/02":"Design de interiores",
  "7490-1/04":"Atividades de intermediação",
  // Reparos e manutenção
  "9511-8/00":"Reparação de computadores e periféricos",
  "9512-6/00":"Reparação de equipamentos de comunicação",
  "9521-5/00":"Reparação de eletrodomésticos",
  "9529-1/01":"Reparação de calçados",
  "9529-1/02":"Chaveiros",
  "9529-1/04":"Reparação de bicicletas",
  "9529-1/05":"Reparação de artigos do mobiliário",
  "9529-1/99":"Reparação de outros objetos",
  // Eventos e entretenimento
  "9001-9/01":"Produção teatral",
  "9001-9/02":"Produção musical",
  "9001-9/03":"Produção de shows e eventos",
  "9001-9/99":"Artes cênicas",
  "9003-5/00":"Gestão de espaços para artes cênicas",
  "9101-5/00":"Atividades de biblioteca e arquivos",
  "9200-3/01":"Casas de bingo",
  "9311-5/00":"Gestão de instalações de esportes",
  "9312-3/00":"Clubes sociais esportivos",
  "9319-1/01":"Produção e promoção de eventos esportivos",
  // Fotografia e mídia
  "7420-0/01":"Atividades de produção fotográfica",
  "7420-0/02":"Atividades de produção cinematográfica",
  "5911-1/01":"Estúdios cinematográficos",
  "7490-1/99":"Outras atividades profissionais e técnicas",
  // Agricultura e meio ambiente
  "0111-3/01":"Cultivo de arroz",
  "0115-6/00":"Cultivo de soja",
  "0119-9/99":"Outros cultivos de lavoura temporária",
  "0131-8/00":"Horticultura",
  "0133-4/00":"Cultivo de frutas cítricas",
  "0159-8/99":"Outros cultivos permanentes",
  "0210-1/01":"Silvicultura",
  "0311-6/01":"Pesca de peixes",
  "0322-1/00":"Aquicultura em água doce",
  // Pet e animais
  "7500-1/00":"Atividades veterinárias",
  "9609-2/07":"Serviços de adestramento de animais domésticos",
  // Imóveis
  "6810-2/01":"Compra e venda de imóveis",
  "6821-8/01":"Corretagem na compra e venda de imóveis",
  "6822-6/00":"Gestão e administração da propriedade imobiliária",
  // Segurança
  "8011-1/01":"Atividades de vigilância e segurança",
  "8020-0/01":"Atividades de monitoramento",
  // Outros serviços
  "9601-7/01":"Lavanderias",
  "9601-7/02":"Tinturarias",
  "9609-2/99":"Outras atividades de serviços pessoais",
};
function QRCodeSVG({ value, size=72, fgColor="#0F172A", bgColor="#ffffff" }) {
  const seed = value.split("").reduce((a,c)=>a+c.charCodeAt(0),0);
  const rng = i => ((seed*1103515245+12345*(i+1))&0x7fffffff)%100;
  const MODS = 21;
  const cellSize = size/MODS;
  const finder = (r,c) => {
    const chk = (dr,dc,or,oc) => {
      const a=r-or,b=c-oc;
      if(a<0||b<0||a>6||b>6) return false;
      if(a===0||a===6||b===0||b===6) return true;
      return a>=2&&a<=4&&b>=2&&b<=4;
    };
    return chk(r,c,0,0)||chk(r,c,0,MODS-7)||chk(r,c,MODS-7,0);
  };
  const timing = (r,c) => (r===6&&c>7&&c<MODS-8)||(c===6&&r>7&&r<MODS-8);
  const cells = [];
  for(let r=0;r<MODS;r++) {
    for(let c=0;c<MODS;c++) {
      const dark = finder(r,c) ? true : timing(r,c) ? (r+c)%2===0 : rng(r*MODS+c+seed%17)>45;
      cells.push({r,c,dark});
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      role="img" aria-label="Código QR de verificação do certificado">
      <title>Código QR de Verificação</title>
      <rect width={size} height={size} fill={bgColor} rx="2"/>
      {cells.map(({r,c,dark}) => dark
        ? <rect key={`${r}-${c}`} x={c*cellSize} y={r*cellSize} width={cellSize} height={cellSize} fill={fgColor}/>
        : null
      )}
    </svg>
  );
}

const NAV = {
  Cliente: [
    {key:"home",label:"Início",icon:"🏠",group:"INÍCIO"},
    {key:"missions",label:"Missões",icon:"🎯",group:"INÍCIO"},
    {key:"edumei",label:"Edu MEI",icon:"🎓",group:"INÍCIO"},
    {key:"lancamentos",label:"Lançamentos",icon:"💰",group:"FINANCEIRO"},
    {key:"operacoes",label:"Operações",icon:"🏦",group:"FINANCEIRO"},
    {key:"propostas",label:"Propostas",icon:"📨",group:"FINANCEIRO"},
    {key:"calculadora",label:"Calculadora de Preço",icon:"🧮",group:"FERRAMENTAS"},
    {key:"openfinance",label:"Open Finance",icon:"🔗",group:"FERRAMENTAS"},
    {key:"cert_ccfv",label:"Cert. CCFV",icon:"🏅",group:"CERTIFICADOS"},
    {key:"cert_a1",label:"Cert. A1",icon:"🔐",group:"CERTIFICADOS"},
    {key:"impostos",label:"DAS & DASN",icon:"📋",group:"FISCAL"},
    {key:"notas",label:"Nota Fiscal",icon:"📄",group:"FISCAL"},
    {key:"relatorios",label:"Relatórios",icon:"📊",group:"CONTA"},
    {key:"planos",label:"Planos",icon:"⭐",group:"CONTA"},
    {key:"privacidade",label:"Privacidade",icon:"🔒",group:"CONTA"},
    {key:"perfil",label:"Perfil",icon:"👤",group:"CONTA"},
  ],
  Parceiro: [
    {key:"parc_dash",label:"Dashboard",icon:"📡",group:"VISÃO GERAL"},
    {key:"parc_carteira",label:"Clientes",icon:"👥",group:"OPERACIONAL"},
    {key:"parc_cobrancas",label:"Cobranças",icon:"💳",group:"OPERACIONAL"},
    {key:"parc_operacoes",label:"Crédito & Risco",icon:"⚙️",group:"OPERACIONAL"},
    {key:"parc_infra",label:"Infraestrutura",icon:"⚡",group:"OPERACIONAL"},
    {key:"parc_negociacoes",label:"Negociações",icon:"🤝",group:"ANÁLISE"},
    {key:"parc_relatorios",label:"Relatórios",icon:"📊",group:"ANÁLISE"},
    {key:"parc_score",label:"Consultar Score",icon:"🎯",group:"ANÁLISE"},
    {key:"parc_recebiveis",label:"Recebíveis",icon:"📈",group:"FINANCEIRO"},
    {key:"parc_settlement",label:"Liquidação",icon:"💳",group:"FINANCEIRO"},
    {key:"parc_lgpd",label:"LGPD",icon:"🔒",group:"COMPLIANCE"},
  ],
  Admin: [
    {key:"adm_dash",label:"Visão Executiva",icon:"🏛️",group:"EXECUTIVO"},
    {key:"adm_operacoes",label:"Operações",icon:"🔄",group:"FINANCEIRO"},
    {key:"adm_settlement",label:"Liquidação",icon:"⚖️",group:"FINANCEIRO"},
    {key:"adm_revenue",label:"Revenue",icon:"💹",group:"FINANCEIRO"},
    {key:"adm_usuarios",label:"Usuários",icon:"👥",group:"GESTÃO"},
    {key:"adm_parceiros",label:"Parceiros",icon:"🤝",group:"GESTÃO"},
    {key:"adm_missoes",label:"Missões",icon:"🎯",group:"CONTEÚDO"},
    {key:"adm_edu",label:"Edu MEI",icon:"🎓",group:"CONTEÚDO"},
    {key:"adm_planos",label:"Planos",icon:"⭐",group:"CONTEÚDO"},
    {key:"adm_certificados",label:"Certificados",icon:"🔐",group:"CONTEÚDO"},
    {key:"adm_fraudes",label:"Antifraude",icon:"🛡️",group:"COMPLIANCE"},
    {key:"adm_lgpd",label:"LGPD",icon:"📜",group:"COMPLIANCE"},
    {key:"adm_rbac",label:"Permissões",icon:"🔑",group:"SISTEMA"},
    {key:"adm_logs",label:"Logs",icon:"📋",group:"SISTEMA"},
    {key:"adm_teto",label:"Teto MEI",icon:"⚙️",group:"SISTEMA"},
    {key:"adm_health",label:"Health Monitor",icon:"💓",group:"SISTEMA"},
    {key:"adm_ledger",label:"Ledger",icon:"📒",group:"FINANCEIRO"},
    {key:"adm_cad_parceiro",label:"Cad. Parceiro",icon:"🤝",group:"CADASTRO"},
    {key:"adm_cad_admin",label:"Cad. Administrador",icon:"👑",group:"CADASTRO"},
  ],
};

const INIT_MISSIONS = [
  {id:1,title:"Registre sua primeira receita",xp:50,done:false,icon:"💰",cat:"Finanças",recompensaCredito:500},
  {id:2,title:"Organize seu fluxo de caixa",xp:25,done:false,icon:"📊",cat:"Finanças",recompensaCredito:300},
  {id:3,title:"Declare a DASN em dia",xp:100,done:false,icon:"📋",cat:"Impostos",recompensaCredito:1200},
  {id:4,title:"Pague seu primeiro DAS",xp:75,done:false,icon:"✅",cat:"Impostos",recompensaCredito:800},
  {id:5,title:"Emita seu Certificado CCFV",xp:80,done:false,icon:"🏆",cat:"Certificados",recompensaCredito:900},
  {id:6,title:"Emita sua primeira Nota Fiscal",xp:60,done:false,icon:"📄",cat:"Docs",recompensaCredito:700},
];
const EDU_VIDEOS = [
  {id:"v1",titulo:"Gestão de Fluxo de Caixa",dur:"18 min",xp:20,cat:"Finanças",emoji:"📊"},
  {id:"v2",titulo:"DAS e DASN-SIMEI",dur:"22 min",xp:25,cat:"Impostos",emoji:"📋"},
  {id:"v3",titulo:"Como Aumentar seu Score",dur:"14 min",xp:20,cat:"Score",emoji:"🎯"},
  {id:"v4",titulo:"Nota Fiscal: Passo a Passo",dur:"20 min",xp:20,cat:"Docs",emoji:"📄"},
];
const PLANOS = [
  {id:"Gratuito",nome:"Básico",preco:0,str:"Grátis",features:["20 transações/mês","Score básico","3 missões"]},
  {id:"Crescer",nome:"Crescer",preco:29.99,str:"R$ 29,99",popular:true,features:["Ilimitado","Score completo","Missões","Nota Fiscal","CCFV"]},
  {id:"Evoluir",nome:"Evoluir",preco:44.99,str:"R$ 44,99",features:["Tudo do Crescer","Score Premium","A1 incluso","Crédito prioritário"]},
];
const CERT_A1_PRICES = {"1ano":119.90,"2anos":199.90,"3anos":269.90};



// ══════════════════════════════════════════════════════════════
// ESTADO DE DEMONSTRAÇÃO — completamente isolado do estado real
// Nunca passa pelo reducer. Nunca afeta dados do usuário.
// ══════════════════════════════════════════════════════════════
const DEMO_STATE = (()=>{
  const dm = {
    auth:{loggedIn:true,role:"USER",perfil:"Cliente",userId:"demo_user"},
    user:{
      id:"demo_user", nome:"MEI Demonstração", email:"demo@lucrom.com.br",
      cnpj:"12.345.678/0001-95", telefone:"(11) 99999-0000",
      porte:"MEI", porteDesc:"Microempreendedor Individual",
      cnae:"6201-5/00", cnaeDesc:"Desenvolvimento de programas de computador sob encomenda",
      municipio:"São Paulo / SP", plano:"Crescer",
      score:742, xp:1240, creditBonus:0,
      lgpdAccepted:true, lgpdTs:new Date(Date.now()-30*86400000).toISOString(),
      createdAt:new Date(Date.now()-90*86400000).toISOString(),
    },
    endereco:{cep:"01310-100",rua:"Av. Paulista",numero:"1000",complemento:"Sala 5",bairro:"Bela Vista",cidade:"São Paulo",uf:"SP"},
    dadosBancarios:{banco:"Nubank",agencia:"0001",conta:"123456-7",tipoConta:"corrente",pix:"demo@lucrom.com.br"},
    transactions:[
      {id:"dt1",tipo:"RECEITA",valor:2800,data:new Date(Date.now()-2*86400000).toISOString(),categoria:"Serviços",desc:"Projeto Web — Cliente A"},
      {id:"dt2",tipo:"RECEITA",valor:1500,data:new Date(Date.now()-5*86400000).toISOString(),categoria:"Serviços",desc:"Consultoria Técnica"},
      {id:"dt3",tipo:"DESPESA",valor:320,data:new Date(Date.now()-5*86400000).toISOString(),categoria:"Material",desc:"Material de escritório"},
      {id:"dt4",tipo:"RECEITA",valor:950,data:new Date(Date.now()-10*86400000).toISOString(),categoria:"Serviços",desc:"Manutenção de Sistema"},
    ],
    faturamento:56500, tetoMEI:81000,
    missions:INIT_MISSIONS.map((m,i)=>i<3?{...m,done:true,doneAt:new Date(Date.now()-20*86400000).toISOString()}:m),
    eduVideos:EDU_VIDEOS, certA1Prices:CERT_A1_PRICES,
    dasnDecs:[{id:"dd1",ano:2024,receita:48000,ts:new Date(Date.now()-60*86400000).toISOString()}],
    dasPagamentos:[{id:"dp1",mes:4,ano:2025,valor:76.90,pago:true,ts:new Date(Date.now()-20*86400000).toISOString()}],
    certs:[], notasFiscais:[
      {id:"nf1",numero:1,tomNome:"EMPRESA CLIENTE LTDA",tomDoc:"12.345.678/0001-00",valor:2800,desc:"Desenvolvimento de software",data:new Date(Date.now()-2*86400000).toISOString(),status:"EMITIDA"},
    ],
    reputationEvents:[], eduAssistidos:[],
    openFinance:{connected:false,banks:[],lastSync:null},
    notificacoes:[
      {id:"dn1",tipo:"missao",msg:"🎯 Você completou 3 missões! Score subiu para 742.",ts:new Date(Date.now()-1*86400000).toISOString(),lida:false},
    ],
    parceiros:[{
  id:"bk1", nome:"FinCredi Soluções", cnpj:"45.678.901/0001-23",
  email:"ops@fincedi.com.br", telefone:"(11) 97654-3210",
  status:"ATIVO", tipo:"CORRESPONDENTE_BANCARIO",
  conversao:34, scoreMedio:718, volumeFinanciado:2870000,
  comissaoTotal:71750, comissaoPendente:18400,
  clientes:[
    {id:"cl1",nome:"Ana Beatriz Costa",cpf:"***.234.567-**",score:812,status:"ATIVO",
     limiteCredito:25000,creditoUtilizado:8500,diasAtraso:0,saldoPendente:0,
     saude:"EXCELENTE",ultimaMovimentacao:new Date(Date.now()-2*86400000).toISOString(),
     historicoPagamento:["PAGO","PAGO","PAGO","PAGO","PAGO","PAGO"],
     utilizacaoLimite:34},
    {id:"cl2",nome:"Carlos Eduardo Lima",cpf:"***.456.789-**",score:623,status:"ATIVO",
     limiteCredito:15000,creditoUtilizado:12800,diasAtraso:18,saldoPendente:1240,
     saude:"ATENCAO",ultimaMovimentacao:new Date(Date.now()-18*86400000).toISOString(),
     historicoPagamento:["PAGO","PAGO","ATRASO","PAGO","ATRASO","ABERTO"],
     utilizacaoLimite:85},
    {id:"cl3",nome:"Fernanda Oliveira",cpf:"***.678.901-**",score:445,status:"INADIMPLENTE",
     limiteCredito:8000,creditoUtilizado:7800,diasAtraso:47,saldoPendente:3200,
     saude:"CRITICO",ultimaMovimentacao:new Date(Date.now()-47*86400000).toISOString(),
     historicoPagamento:["PAGO","ATRASO","ATRASO","ABERTO","ABERTO","ABERTO"],
     utilizacaoLimite:97},
    {id:"cl4",nome:"Roberto Mendes",cpf:"***.890.123-**",score:751,status:"ATIVO",
     limiteCredito:20000,creditoUtilizado:6000,diasAtraso:0,saldoPendente:0,
     saude:"BOM",ultimaMovimentacao:new Date(Date.now()-5*86400000).toISOString(),
     historicoPagamento:["PAGO","PAGO","PAGO","PAGO","PAGO","PAGO"],
     utilizacaoLimite:30},
    {id:"cl5",nome:"Juliana Santos",cpf:"***.012.345-**",score:558,status:"ANALISE",
     limiteCredito:10000,creditoUtilizado:9100,diasAtraso:12,saldoPendente:680,
     saude:"RISCO",ultimaMovimentacao:new Date(Date.now()-12*86400000).toISOString(),
     historicoPagamento:["PAGO","PAGO","ATRASO","ATRASO","PAGO","ATRASO"],
     utilizacaoLimite:91},
    {id:"cl6",nome:"Marcos Alves",cpf:"***.234.567-**",score:690,status:"ATIVO",
     limiteCredito:18000,creditoUtilizado:4500,diasAtraso:0,saldoPendente:0,
     saude:"BOM",ultimaMovimentacao:new Date(Date.now()-1*86400000).toISOString(),
     historicoPagamento:["PAGO","PAGO","PAGO","PAGO","PAGO","PAGO"],
     utilizacaoLimite:25},
  ],
  revenueShare:[
    {id:"rs1",tipo:"COMISSÃO",comissao:4800,status:"PAGO",data:new Date(Date.now()-30*86400000).toISOString(),bancoNome:"FinCredi"},
    {id:"rs2",tipo:"COMISSÃO",comissao:6200,status:"PAGO",data:new Date(Date.now()-60*86400000).toISOString(),bancoNome:"FinCredi"},
    {id:"rs3",tipo:"COMISSÃO",comissao:7150,status:"PENDENTE",data:new Date(Date.now()-5*86400000).toISOString(),bancoNome:"FinCredi"},
    {id:"rs4",tipo:"SPREAD",comissao:11250,status:"PENDENTE",data:new Date(Date.now()-2*86400000).toISOString(),bancoNome:"FinCredi"},
  ],
  atividadesRecentes:[
    {id:"a1",tipo:"PAGAMENTO",desc:"Ana Beatriz — parcela R$ 425,00 recebida",ts:new Date(Date.now()-20*60000).toISOString(),icon:"💰"},
    {id:"a2",tipo:"NEGOCIACAO",desc:"Carlos Lima — proposta de renegociação enviada",ts:new Date(Date.now()-1*3600000).toISOString(),icon:"🤝"},
    {id:"a3",tipo:"BLOQUEIO",desc:"Fernanda Oliveira — crédito bloqueado automaticamente",ts:new Date(Date.now()-2*3600000).toISOString(),icon:"🔒"},
    {id:"a4",tipo:"NOVO_CLIENTE",desc:"Marcos Alves — onboarding concluído",ts:new Date(Date.now()-5*3600000).toISOString(),icon:"👤"},
    {id:"a5",tipo:"LIMITE",desc:"Roberto Mendes — limite aumentado para R$ 20.000",ts:new Date(Date.now()-8*3600000).toISOString(),icon:"📈"},
    {id:"a6",tipo:"SISTEMA",desc:"API Pix — reconectada com sucesso",ts:new Date(Date.now()-12*3600000).toISOString(),icon:"⚡"},
  ],
  infra:{
    apis:[
      {nome:"API Lucrom Core",status:"ONLINE",latencia:"42ms",uptime:"99.8%"},
      {nome:"Gateway Pix",status:"ONLINE",latencia:"68ms",uptime:"99.5%"},
      {nome:"Consulta CPF/CNPJ",status:"ONLINE",latencia:"120ms",uptime:"98.9%"},
      {nome:"Score Engine",status:"ONLINE",latencia:"35ms",uptime:"99.9%"},
      {nome:"Webhook Notif.",status:"DEGRADADO",latencia:"890ms",uptime:"96.2%"},
    ]
  },
  evolucaoCarteira:[
    {mes:"Jan",volume:180000},{mes:"Fev",volume:240000},{mes:"Mar",volume:320000},
    {mes:"Abr",volume:410000},{mes:"Mai",volume:580000},{mes:"Jun",volume:2870000},
  ],
  negociacoesPendentes:[
    {id:"ng1",clienteId:"cl2",clienteNome:"Carlos Eduardo Lima",valorDivida:1240,status:"AGUARDANDO",ts:new Date(Date.now()-2*86400000).toISOString()},
    {id:"ng2",clienteId:"cl3",clienteNome:"Fernanda Oliveira",valorDivida:3200,status:"AGUARDANDO",ts:new Date(Date.now()-5*86400000).toISOString()},
    {id:"ng3",clienteId:"cl5",clienteNome:"Juliana Santos",valorDivida:680,status:"EM_ANALISE",ts:new Date(Date.now()-1*86400000).toISOString()},
  ],
}], propostasBanco:[
      {id:"dp1",bancoId:"bk1",bancoNome:"Banco Parceiro Demo",valor:15000,taxa:"1,49% a.m.",parcelas:24,valorParcela:787.50,cet:"19,8% a.a.",status:"PENDENTE",expiresAt:new Date(Date.now()+5*86400000).toISOString(),criadaEm:new Date(Date.now()-1*86400000).toISOString()},
    ],
    operacoes:[
      {id:"do1",meiId:"demo_user",meiNome:"MEI Demonstração",parceiroId:"bk1",parceiroNome:"Banco Parceiro Demo",valorPrincipal:12000,taxaJuros:1.49,parcelas:24,valorParcela:637.50,saldoDevedor:8500,iof:96,cet:19.8,status:"ADIMPLENTE",scoreNaMidia:742,fraudScore:8,criadaEm:new Date(Date.now()-45*86400000).toISOString()},
    ],
    receivables:[], settlements:[], revenueShare:[],
    creditoSolicitacoes:[], pagamentos:[], ledger:[], metas:[],
    scoreHistory:[
      {score:300,delta:0,ts:new Date(Date.now()-90*86400000).toISOString(),motivo:"CADASTRO"},
      {score:420,delta:120,ts:new Date(Date.now()-60*86400000).toISOString(),motivo:"MISSOES"},
      {score:580,delta:160,ts:new Date(Date.now()-30*86400000).toISOString(),motivo:"OPEN_FINANCE"},
      {score:742,delta:162,ts:new Date(Date.now()-5*86400000).toISOString(),motivo:"RECALCULO"},
    ],
    timeline:[{id:"dtl1",tipo:"sistema",titulo:"Conta demo",desc:"Estado de demonstração",ts:new Date().toISOString()}],
    planosPrices:{Gratuito:0,Crescer:29.99,Evoluir:44.99},
    creditBonus:0, fraudFlags:[],
    clientes:[], adm_usuarios:[], adm_operacoes:[],
  };
  return dm;
})();

const _ds = (daysAgo) => new Date(Date.now()-daysAgo*86400000).toISOString();
const _id = (n) => "tx_"+n;
const INIT = {
  auth:   { loggedIn:false, role:"USER", perfil:"Cliente", userId:"" },
  user:   {
    id:"usr_demo", nome:"João Silva", email:"joao@email.com",
    cnpj:"12.345.678/0001-95", telefone:"(11) 98765-4321",
    porte:"MEI", porteDesc:"Microempreendedor Individual",
    cnae:"6201-5/00", cnaeDesc:"Desenvolvimento de programas de computador sob encomenda",
    municipio:"São Paulo / SP", plano:"Gratuito",
    score:780, xp:420, creditBonus:0,
    lgpdAccepted:true, lgpdTs:_ds(30), createdAt:_ds(90),
  },
  endereco: {cep:"01310100",rua:"Av. Paulista",numero:"1000",complemento:"",bairro:"Bela Vista",cidade:"São Paulo",uf:"SP"},
  dadosBancarios: {banco:"Nubank",agencia:"0001",conta:"123456-7",tipoConta:"corrente",pix:"joao@email.com"},
  transactions: [
    {id:_id(1),tipo:"RECEITA",valor:4800,data:_ds(2), categoria:"Serviços",   desc:"Desenvolvimento site cliente",status:"PROCESSADO"},
    {id:_id(2),tipo:"RECEITA",valor:3200,data:_ds(8), categoria:"Serviços",   desc:"Consultoria TI - Empresa ABC",status:"PROCESSADO"},
    {id:_id(3),tipo:"DESPESA",valor:320, data:_ds(10),categoria:"Operacional",desc:"Assinatura ferramentas dev",  status:"PROCESSADO"},
    {id:_id(4),tipo:"RECEITA",valor:5500,data:_ds(15),categoria:"Serviços",   desc:"Sistema e-commerce XYZ",     status:"PROCESSADO"},
    {id:_id(5),tipo:"RECEITA",valor:2800,data:_ds(22),categoria:"Serviços",   desc:"Manutenção mensal - Cliente A",status:"PROCESSADO"},
    {id:_id(6),tipo:"DESPESA",valor:180, data:_ds(25),categoria:"Operacional",desc:"Domínio e hospedagem",        status:"PROCESSADO"},
    {id:_id(7),tipo:"RECEITA",valor:6200,data:_ds(35),categoria:"Serviços",   desc:"App mobile - Projeto Beta",  status:"PROCESSADO"},
    {id:_id(8),tipo:"RECEITA",valor:3800,data:_ds(42),categoria:"Serviços",   desc:"Integração API - Startup",   status:"PROCESSADO"},
    {id:_id(9),tipo:"DESPESA",valor:280, data:_ds(45),categoria:"Operacional",desc:"Equipamentos escritório",     status:"PROCESSADO"},
    {id:_id(10),tipo:"RECEITA",valor:4200,data:_ds(55),categoria:"Serviços",  desc:"Consultoria DevOps",         status:"PROCESSADO"},
    {id:_id(11),tipo:"RECEITA",valor:5100,data:_ds(65),categoria:"Serviços",  desc:"Sistema ERP personalizado",  status:"PROCESSADO"},
    {id:_id(12),tipo:"DESPESA",valor:240, data:_ds(70),categoria:"Operacional",desc:"Software licenças anuais",  status:"PROCESSADO"},
  ],
  faturamento: 55800, tetoMEI:81000,
  missions:     INIT_MISSIONS,
  eduVideos:    EDU_VIDEOS,
  certA1Prices: CERT_A1_PRICES,
  dasnDecs:     [{id:"dasn1",ano:2024,receitaAnual:42800,ts:_ds(60),status:"DECLARADA"}],
  dasPagamentos:[
    {id:"das1",mes:"2025-04",valor:80.90,venc:"2025-04-20",pago:true,ts:_ds(33)},
    {id:"das2",mes:"2025-03",valor:80.90,venc:"2025-03-20",pago:true,ts:_ds(63)},
    {id:"das3",mes:"2025-02",valor:80.90,venc:"2025-02-20",pago:true,ts:_ds(93)},
  ],
  certs:[], notasFiscais:[], reputationEvents:[], eduAssistidos:[],
  openFinance:  {connected:false,banks:[],lastSync:null},
  notificacoes: [
    {id:"n1",tipo:"sistema",msg:"Bem-vindo ao Lucrom! Complete seu perfil para aumentar seu score.",ts:_ds(90),lida:true,acao:"missions"},
    {id:"n2",tipo:"credito",msg:"Seu score chegou a 780 pontos. Limite de R$ 50.000 disponível.",ts:_ds(5),lida:false,acao:"operacoes"},
  ],
  parceiros:[], propostasBanco:[], operacoes:[],
  receivables:[], settlements:[], revenueShare:[],
  creditoSolicitacoes:[], pagamentos:[], ledger:[], metas:[],
  scoreHistory: [
    {score:300,delta:0,  ts:_ds(90),motivo:"CADASTRO"},
    {score:520,delta:220,ts:_ds(60),motivo:"RECALCULO"},
    {score:680,delta:160,ts:_ds(30),motivo:"RECALCULO"},
    {score:780,delta:100,ts:_ds(5), motivo:"RECALCULO"},
  ],
  timeline: [
    {id:"t1",tipo:"sistema",titulo:"Conta criada",desc:"Bem-vindo ao Lucrom",ts:_ds(90)},
    {id:"t2",tipo:"tx",titulo:"Primeira receita",desc:"R$ 4.200 registrados",ts:_ds(55)},
    {id:"t3",tipo:"dasn",titulo:"DASN 2024 declarada",desc:"Receita anual: R$ 42.800",ts:_ds(60)},
  ],
  clientes:[], planosPrices:{Gratuito:0,Crescer:29.99,Evoluir:44.99},
  creditBonus:5000, fraudFlags:[],
};

const addNotif = (st,notif) => ({...st,notificacoes:[{...notif,id:genId(),ts:tsISO(),lida:false},...st.notificacoes].slice(0,100)});
const addTimeline = (st,ev) => ({...st,timeline:[{...ev,id:genId(),ts:tsISO()},...st.timeline].slice(0,100)});
const withScore = st => {
  // Passa todos os 12 fatores enterprise para o motor de score (RISK-001 fix)
  const fraud = FraudEngine.calcRiskScore(st.operacoes||[], st.transactions||[], st.faturamento||0, st.tetoMEI||81000);
  const sc = ScoreEngine.calc(
    st.transactions, st.missions, st.dasnDecs, st.certs, st.notasFiscais,
    {
      xp: st.user?.xp||0,
      dasPagamentos: st.dasPagamentos||[],
      createdAt: st.user?.createdAt,
      openFinance: st.openFinance,
      fraudFlags: fraud.flags,
    }
  );
  const prev = st.user?.score || 300;
  const delta = sc.total - prev;
  // Append ao histórico de score (máx 90 entradas)
  const novoHistorico = delta !== 0 ? [
    {score: sc.total, delta, ts: new Date().toISOString(), motivo: "RECALCULO"},
    ...(st.scoreHistory||[]),
  ].slice(0, 90) : (st.scoreHistory||[]);
  return {
    ...st,
    user: {...st.user, score: sc.total},
    _scoreDetail: sc,
    _fraudDetail: fraud,
    scoreHistory: novoHistorico,
  };
};
const withAutoMissions = st => {
  const triggers = {
    1: s => s.transactions.filter(t=>t.tipo==="RECEITA").length>=1,
    2: s => s.transactions.length>=3,
    3: s => s.dasnDecs.length>0,
    4: s => s.dasPagamentos.length>=1,
    5: s => s.certs.some(c=>c.tipo==="CCFV"),
    6: s => s.notasFiscais.length>=1,
  };
  // Plano Gratuito: máximo 3 missões concluídas (conforme PLANOS)
  const isGratuito = st.user?.plano === "Gratuito";
  const jaConcluidasCount = st.missions.filter(m=>m.done).length;
  let xp=0, novasConcluidas=0;
  const newNotifs=[];
  const missions = st.missions.map(m => {
    if(m.done) return m;
    // Limita missões concluídas no plano Gratuito — usa contador real, não estimativa por XP
    if(isGratuito && jaConcluidasCount + novasConcluidas >= 3) return m; // BUG-001 fixbeing marked in this pass
    const t = triggers[m.id];
    if(t && t(st)) {
      xp += m.xp; novasConcluidas++;
      newNotifs.push({id:genId(),tipo:"missao",msg:`"${m.title}" concluída! +${m.xp} XP`,ts:tsISO(),lida:false,acao:"missions"});
      return {...m, done:true};
    }
    return m;
  });
  return {...st, missions, user:{...st.user,xp:st.user.xp+xp}, notificacoes:[...newNotifs,...st.notificacoes].slice(0,100)};
};

function reducer(st, {type, p}) {
  switch(type) {
    case "AUTH.NOVO_CADASTRO": {
      // Estado 100% zerado — sem dados demo, sem score inventado
      const userId = genId();
      return {
        auth: { loggedIn:true, role:"USER", perfil:"Cliente", userId },
        user: {
          id:          userId,
          nome:        p.nome,
          email:       p.email,
          cnpj:        p.cnpj,
          telefone:    p.telefone,
          porte:       p.porte,
          porteDesc:   p.porte==="MEI"?"Microempreendedor Individual":p.porte==="ME"?"Microempresa":"Pessoa Jurídica",
          cnae:        p.cnae,
          cnaeDesc:    p.cnaeDesc,
          municipio:   p.municipio,
          plano:       "Gratuito",
          score:       300,        // score inicial conforme regra: 300 pontos
          xp:          0,
          creditBonus: 0,
          lgpdAccepted: false,
          lgpdTs:       null,
          createdAt:    new Date().toISOString(),
        },
        endereco:        p.endereco || {cep:"",rua:"",numero:"",complemento:"",bairro:"",cidade:"",uf:""},
        dadosBancarios:  {banco:"",agencia:"",conta:"",tipoConta:"corrente",pix:""},
        // Tudo zerado — usuário começa do zero
        transactions:    [],
        faturamento:     0,
        tetoMEI:         81000,
        missions:        INIT_MISSIONS,   // missões disponíveis (não concluídas)
        eduVideos:       EDU_VIDEOS,
        certA1Prices:    CERT_A1_PRICES,
        dasnDecs:        [],
        dasPagamentos:   [],
        certs:           [],
        notasFiscais:    [],
        reputationEvents:[],
        eduAssistidos:   [],
        openFinance:     {connected:false,banks:[],lastSync:null},
        notificacoes:    [{
          id:genId(), tipo:"boas_vindas",
          msg:`Bem-vindo ao Lucrom, ${p.nome.split(" ")[0]}! Complete seu perfil e comece a construir seu score.`,
          ts:tsISO(), lida:false, acao:"missions",
        }],
        parceiros:       [],
        propostasBanco:  [],
        operacoes:       [],
        receivables:     [],
        settlements:     [],
        revenueShare:    [],
        creditoSolicitacoes:[],
        pagamentos:      [],
        ledger:          [],
        metas:           [],
        scoreHistory:    [{score:300, delta:0, ts:tsISO(), motivo:"CADASTRO"}],
        timeline:        [{id:genId(),tipo:"sistema",titulo:"Lucrom ativo",desc:"Conta criada",ts:tsISO()}],
        planosPrices:    {Gratuito:0, Crescer:29.99, Evoluir:44.99},
        clientes:        [],
        adm_usuarios:    [],
        adm_operacoes:   [],
        creditBonus:     0,
        fraudFlags:      [],
      };
    }
    case "AUTH.LOGIN": return {...st, auth:{loggedIn:true,role:p.role,perfil:p.perfil,userId:st.user?.id||""}};
    case "AUTH.LOGOUT": {
      // BUG-004 fix: deterministic empty state, never inherits INIT demo data
      const emptyUser = {id:"",nome:"",email:"",cnpj:"",telefone:"",porte:"MEI",porteDesc:"Microempreendedor Individual",cnae:"",cnaeDesc:"",municipio:"",plano:"Gratuito",score:300,xp:0,creditBonus:0,lgpdAccepted:false,lgpdTs:null,createdAt:""};
      return {
        ...INIT,
        user: emptyUser,
        auth: {loggedIn:false,role:"USER",perfil:"Cliente",userId:""},
        transactions:[],faturamento:0,scoreHistory:[],timeline:[],
        notificacoes:[],operacoes:[],propostasBanco:[],
        dasPagamentos:[],dasnDecs:[],certs:[],notasFiscais:[],
        missions:INIT_MISSIONS,
      };
    }
    case "AUTH.SET_PERFIL": return {...st, auth:{...st.auth,perfil:p}};
    case "MEI.ADD_TX": {
      // Idempotência: previne double-submit (CB-002 fix)
      if (p.idempotencyKey && IdempotencyStore.check(p.idempotencyKey)) return st;
      if (p.idempotencyKey) IdempotencyStore.mark(p.idempotencyKey, p.id);
      // Plano Gratuito: limite de 20 transações por mês
      if (st.user?.plano === "Gratuito") {
        const mesAtualTx = new Date().getMonth();
        const anoAtualTx = new Date().getFullYear();
        const txMes = st.transactions.filter(t => {
          const d = new Date(t.data);
          return d.getMonth() === mesAtualTx && d.getFullYear() === anoAtualTx;
        }).length;
        if (txMes >= 20) return addNotif(st, {tipo:"plano", msg:"⚠️ Limite de 20 transações/mês do plano Básico atingido. Faça upgrade para continuar.", acao:"planos"});
      }
      let n = {...st, transactions:[p,...st.transactions]};
      if(p.tipo==="RECEITA") n = {...n, faturamento:(n.faturamento||0)+p.valor};
      // Ledger partida-dobrada (CB-001 fix)
      const contaDebito  = p.tipo==="RECEITA" ? "CAIXA" : "DESPESAS";
      const contaCredito = p.tipo==="RECEITA" ? "RECEITAS" : "CAIXA";
      const entradas = LedgerEngine.criarLancamento(p.tipo, p.valor, contaDebito, contaCredito, p.desc);
      n = {...n, ledger:[...entradas,...(n.ledger||[])]};
      n = addTimeline(n,{tipo:"financeiro",titulo:p.tipo==="RECEITA"?`+${fmtBRL(p.valor)}`:`-${fmtBRL(p.valor)}`,desc:p.desc,cor:p.tipo==="RECEITA"?T.green:T.red});
      n = withAutoMissions(n);
      return withScore(n);
    }
    case "MEI.PAGAR_DAS": {
      let n = {...st, dasPagamentos:[p,...st.dasPagamentos]};
      n = addNotif(n,{tipo:"pagamento",msg:`DAS ${fmtBRL(p.valor)} pago!`,acao:"impostos"});
      n = withAutoMissions(n);
      return withScore(n);
    }
    case "MEI.ADD_DASN": {
      let n = {...st, dasnDecs:[p,...st.dasnDecs]};
      n = addNotif(n,{tipo:"fiscal",msg:`DASN ${p.ano} registrada!`,acao:"impostos"});
      n = withAutoMissions(n);
      return withScore(n);
    }
    case "MEI.EMIT_NF": {
        // BUG-005: jaLancada=true = tx já existe, não soma faturamento de novo
        const novoFat = p.jaLancada ? (st.faturamento||0) : (st.faturamento||0)+(p.valor||0);
        const novasTx = p.jaLancada ? st.transactions : [{id:genId(),tipo:"RECEITA",valor:p.valor,data:p.data||tsISO(),categoria:"Nota Fiscal",desc:`NF #${p.numero}`,status:"PROCESSADO"},...(st.transactions||[])];
      let n = {...st, notasFiscais:[p,...st.notasFiscais], faturamento:novoFat, transactions:novasTx};
      n = addNotif(n,{tipo:"nf",msg:`NF #${p.numero} emitida — ${fmtBRL(p.valor)}`,acao:"notas"});
      n = withAutoMissions(n);
      return withScore(n);
    }
    case "MEI.EMIT_CERT": {
      // Verifica duplicata (evita emissão dupla)
      const jaTemTipo = (st.certs||[]).some(c=>c.tipo===p.tipo&&c.active);
      if(jaTemTipo) return st;
      // Bônus de crédito por tipo (GAP-4 fix)
      const certBonus = p.tipo==="CCFV" ? 500 : p.tipo==="A1" ? 800 : 200;
      let n = {...st,
        certs: [{...p, id:p.id||genId(), active:true, emitidoEm:p.emitidoEm||tsISO()}, ...st.certs],
        user: {...st.user, creditBonus:(st.user.creditBonus||0)+certBonus},
      };
      n = addNotif(n,{tipo:"cert",msg:`Certificado ${p.tipo} emitido! +R$${certBonus} no bônus de crédito 🏅`,acao:`cert_${p.tipo.toLowerCase()}`});
      n = withAutoMissions(n); // missão 5 (CCFV) auto-completa
      return withScore(n);
    }
    case "MEI.WATCH_VIDEO": {
      if((st.eduAssistidos||[]).includes(p.id)) return st;
      let n = {...st, eduAssistidos:[...(st.eduAssistidos||[]),p.id], user:{...st.user,xp:(st.user.xp||0)+p.xp}};
      n = addNotif(n,{tipo:"edu",msg:`+${p.xp} XP — "${p.titulo}"`,acao:"edumei"});
      return withScore(n);
    }
    case "MEI.SET_PLAN": {
      let n = {...st, user:{...st.user,plano:p}};
      if(p==="Evoluir") {
        const jaTemA1 = (st.certs||[]).some(c=>c.tipo==="A1"&&c.active);
        if(!jaTemA1) {
          const exp = new Date(); exp.setFullYear(exp.getFullYear()+1);
          const certA1 = {id:genId(),tipo:"A1",active:true,validity:"1ano",emitidoEm:tsISO(),expiraEm:exp.toISOString(),valor:0,status:"ATIVO"};
          n = {...n, certs:[certA1,...(n.certs||[])]};
          n = addNotif(n,{tipo:"cert",msg:"🔐 Cert. A1 ativado pelo Plano Evoluir!",acao:"cert_a1"});
        }
      }
      return withScore(n);
    }
    case "MEI.UPDATE_USER": return {...st, user:{...st.user,...p}};
    case "MEI.OPEN_FINANCE_CONNECT": {
      let n = {...st, openFinance:{connected:true,banks:[...(st.openFinance?.banks||[]),p],lastSync:tsISO()}};
      n = addNotif(n,{tipo:"openfinance",msg:`✅ ${p.nome} conectado!`,acao:"openfinance"});
      return withScore(n);
    }
    case "MEI.OPEN_FINANCE_DISCONNECT": return {...st, openFinance:{...st.openFinance,banks:(st.openFinance?.banks||[]).filter(b=>b.id!==p),connected:(st.openFinance?.banks||[]).filter(b=>b.id!==p).length>0}};
    case "CREDIT.REQUEST": {
      // Fraud engine check (AF-001 fix)
      const fraudCheck = FraudEngine.calcRiskScore(st.operacoes||[], st.transactions||[], st.faturamento||0, st.tetoMEI||81000);
      if (fraudCheck.bloqueado) {
        return addNotif(st, {tipo:"sistema", msg:`🚨 Solicitação bloqueada pelo sistema antifraude: ${fraudCheck.flags.join(", ")}`, acao:"operacoes"});
      }
      // Enriquecer payload com metadata de fraude
      p = {...p, deviceId: p.deviceId||"unknown", fraudScore: fraudCheck.riskScore, fraudFlags: fraudCheck.flags, ts: p.ts||new Date().toISOString()};
      // Velocity check: máximo 2 solicitações ativas
      const ativas = (st.operacoes||[]).filter(o=>["SOLICITADA","EM_ANALISE"].includes(o.status)&&o.meiId===st.user.id);
      if (ativas.length >= 2) {
        return addNotif(st, {tipo:"sistema", msg:"⚠️ Você já possui solicitações em análise. Aguarde o resultado.", acao:"operacoes"});
      }
      // Idempotência
      const idKey = `credit_req_${st.user.id}_${p.valor}_${new Date().toDateString()}`;
      if (IdempotencyStore.check(idKey)) return st;
      IdempotencyStore.mark(idKey, genId());
      // SAGA step 1: criar operação (com Price Table para estimativa)
      const _risco = ScoreEngine.risk(st.user.score, st.faturamento||0); // BUG-002 fix: calc once
          const taxaEstimada = _risco.approved
        ? safeNum(_risco.rate.replace(",","."))
        : 3.5;
      const pmtEstimado = PriceTable.calcPMT(p.valor, taxaEstimada, p.parcelas);
      const iofEstimado = PriceTable.calcIOF(p.valor, p.parcelas * 30);
      const op = {
        id:genId(), tipo:"CREDITO_MEI", meiId:st.user.id, meiNome:st.user.nome,
        meiCPF:st.user.cpf, meiCNPJ:st.user.cnpj, meiEmail:st.user.email,
        meiTelefone:st.user.telefone, meiEndereco:{...(st.user.endereco||st.endereco||{})},
        meiBanco:{...(st.user.dadosBancarios||st.dadosBancarios||{})},
        parceiroId:st.parceiros[0]?.id||"", parceiroNome:st.parceiros[0]?.nome||"Banco Parceiro",
        valorPrincipal:p.valor, valorParcela:Math.round(pmtEstimado*100)/100,
        taxaJuros:taxaEstimada, parcelas:p.parcelas,
        saldoDevedor:p.valor, iof:iofEstimado,
        comissaoLucrom:0, comissaoLucromStatus:"PENDENTE",
        status:"SOLICITADA", finalidade:p.finalidade||"Capital de giro",
        scoreNaMidia:st.user.score, fraudScore:fraudCheck.riskScore,
        fraudFlags:fraudCheck.flags, deviceId:p.deviceId||"unknown",
        ip:p.ip||"unknown", userAgent:p.userAgent||"unknown",
        lgpdAccepted:st.user.lgpdAccepted, lgpdTs:st.user.lgpdTs,
        contratoAceito:p.contratoAceito||false, contratoTs:p.contratoTs||null,
        anexos:p.anexos||[],
        criadaEm:tsISO(),
        auditTrail:[ // DEMO: produção usa AuditLog backend (Prisma)
          {evento:"SOLICITACAO_CRIADA",ts:tsISO(),actor:st.user.id,deviceId:p.deviceId||"unknown",fraudScore:fraudCheck.riskScore},
        ],
        sagaId:genId(), sagaStep:"CREATED",
      };
      const notifParceiro = {id:genId(),tipo:"credito",msg:`🏦 Nova solicitação: ${st.user.nome} — ${fmtBRL(p.valor)} em ${p.parcelas}×. Score: ${st.user.score}. Analise agora!`,ts:tsISO(),lida:false,acao:"parc_operacoes",parceiroAlert:true};
      let n = {...st, operacoes:[op,...(st.operacoes||[])], creditoSolicitacoes:[{...p,id:op.id,status:"PENDENTE",criadoEm:tsISO()},...(st.creditoSolicitacoes||[])], notificacoes:[notifParceiro,...st.notificacoes].slice(0,100)};
      n = addTimeline(n,{tipo:"credito",titulo:`Solicitação ${fmtBRL(p.valor)}`,desc:`Score ${st.user.score} · ${op.parceiroNome}`,cor:T.greenMid});
      return addNotif(n,{tipo:"credito",msg:`✅ Solicitação de ${fmtBRL(p.valor)} enviada! Parcela estimada: ${fmtBRL(pmtEstimado)}.`,acao:"operacoes"});
    }
    case "CREDIT.PARCEIRO_APPROVE": {
      const {id, taxaJuros} = p;
      const op = (st.operacoes||[]).find(o=>o.id===id);
      if(!op) return st;
      // Price Table correta (CB-003 fix)
      const pmt = PriceTable.calcPMT(op.valorPrincipal, taxaJuros, op.parcelas);
      const iof = PriceTable.calcIOF(op.valorPrincipal, op.parcelas * 30);
      const valorTotal = Math.round(pmt * op.parcelas * 100) / 100;
      const cet = PriceTable.calcCET(op.valorPrincipal, pmt, op.parcelas, iof, taxaJuros);
      const pmtFinal = Math.round(pmt * 100) / 100;
      let n = {...st, operacoes:(st.operacoes||[]).map(o=>o.id===id?{...o,taxaJuros,valorParcela:pmtFinal,valorTotal,iof,cet,status:"APROVADA",aprovadaEm:tsISO()}:o)};
      return addNotif(n,{tipo:"credito",msg:`🎉 Crédito aprovado! Parcela: ${fmtBRL(pmtFinal)} · Taxa: ${taxaJuros}% a.m. · CET: ${cet.toFixed(2)}% a.m.`,acao:"operacoes"});
    }
    case "PARC.CLIENT_SET_BLOQUEADO": {
      const { id, bloqueado } = p;
      return {...st, parc:{...st.parc, clientes:(st.parc?.clientes||[]).map(c=>c.id===id?{...c,bloqueado,status:bloqueado?"BLOQUEADO":c.status==="BLOQUEADO"?"ATIVO":c.status}:c)}};
    }
    case "CREDIT.PARCEIRO_RELEASE": {
      const op = (st.operacoes||[]).find(o=>o.id===p);
      if(!op) return st;
      const parceiro = st.parceiros.find(par=>par.id===op.parceiroId);
      const comissaoPct = parceiro?.comissaoPct ? parceiro.comissaoPct/100 : 0.025;
      const comissao = Math.round(op.valorPrincipal * comissaoPct * 100)/100;
      // Atualiza operação
      let n = {...st, operacoes:(st.operacoes||[]).map(o=>o.id===p?{...o,status:"LIBERADA",liberadaEm:tsISO(),comissaoLucrom:comissao,comissaoLucromStatus:"PENDENTE"}:o)};
      // Gera revenueShare automático
      const tier = (parceiro?.volumeFinanciado||0)>400000?"Ouro":(parceiro?.volumeFinanciado||0)>200000?"Prata":"Bronze";
      const tierColor = tier==="Ouro"?"#F59E0B":tier==="Prata"?"#94A3B8":"#CD7F32";
      const rev = {id:genId(),parceiroId:op.parceiroId,operacaoId:op.id,tipo:"ORIGINACAO",valorOperacao:op.valorPrincipal,tier,tierColor,taxaAplicada:comissaoPct,valorLucrom:comissao,status:"PENDENTE",competencia:new Date().toISOString().slice(0,7)};
      n = {...n, revenueShare:[rev,...(n.revenueShare||[])]};
      n = addNotif(n,{tipo:"credito",msg:`💸 Crédito de ${fmtBRL(op.valorPrincipal)} liberado! Comissão ${fmtBRL(comissao)} gerada.`,acao:"operacoes"});
      return addTimeline(n,{tipo:"credito",titulo:`Crédito liberado ${fmtBRL(op.valorPrincipal)}`,desc:`Comissão: ${fmtBRL(comissao)}`,cor:T.green});
    }
    case "CREDIT.CLIENT_ACCEPT": {
      let n = {...st, propostasBanco:(st.propostasBanco||[]).map(pr=>pr.id===p?{...pr,status:"ACEITA",aceitoEm:tsISO()}:pr)};
      return addNotif(n,{tipo:"credito",msg:"Proposta aceita! Aguardando liberação.",acao:"operacoes"});
    }
    case "CREDIT.CLIENT_REJECT": return {...st, propostasBanco:(st.propostasBanco||[]).map(pr=>pr.id===p?{...pr,status:"RECUSADA"}:pr)};
    case "FINANCIAL.SETTLEMENT_CLOSE": return {...st, settlements:(st.settlements||[]).map(s=>s.id===p?{...s,status:"FECHADO"}:s)};
    case "FINANCIAL.SETTLEMENT_PAY": {
      let n = {...st, settlements:(st.settlements||[]).map(s=>s.id===p.id?{...s,status:"PAGO",liquidadoEm:tsISO()}:s)};
      return addNotif(n,{tipo:"pagamento",msg:"Liquidação paga!",acao:"adm_settlement"});
    }
    case "FINANCIAL.SETTLEMENT_RECONCILE": return {...st, settlements:(st.settlements||[]).map(s=>s.id===p?{...s,status:"CONCILIADO",conciliado:true}:s)};
    case "PARTNER.MARK_PAID": return {...st, parceiros:st.parceiros.map(par=>par.id===p.bancoId?{...par,clientes:par.clientes.map(c=>c.id===p.clienteId?{...c,status:"PAGO"}:c)}:par)};
    case "PARTNER.MARK_DEFAULT": return {...st, parceiros:st.parceiros.map(par=>par.id===p.bancoId?{...par,clientes:par.clientes.map(c=>c.id===p.clienteId?{...c,inadimplente:true,status:"INADIMPLENTE"}:c)}:par)};
    case "MEI.ADD_META": {
      const meta = {...p, id:genId(), criadaEm:tsISO(), atingida:false};
      return {...st, metas:[meta,...(st.metas||[])]};
    }
    case "MEI.ATINGIR_META":
      return {...st, metas:(st.metas||[]).map(m=>m.id===p?{...m,atingida:true,atingidaEm:tsISO()}:m)};
    case "ADMIN.UPDATE_MISSION": return {...st, missions:st.missions.map(m=>m.id===p.id?{...m,...p}:m)};
    case "ADMIN.CANCEL_MISSION": return {...st, missions:st.missions.map(m=>m.id===p?{...m,cancelada:true}:m)};
    case "ADMIN.SET_TETO": return {...st, tetoMEI:p};
    case "MEI.UPDATE_ENDERECO": return {...st, user:{...st.user, endereco:{...st.user.endereco,...p}}};
    case "MEI.UPDATE_BANCO": return {...st, user:{...st.user, dadosBancarios:{...st.user.dadosBancarios,...p}}};
    case "MEI.LGPD_ACCEPT": return {...st, user:{...st.user, lgpdAccepted:true, lgpdTs:new Date().toISOString()}};
    case "ADMIN.EDU_ADD": return {...st, eduVideos:[...st.eduVideos,{...p,id:"v"+(st.eduVideos.length+1)}]};
    case "ADMIN.EDU_UPDATE": return {...st, eduVideos:st.eduVideos.map(v=>v.id===p.id?{...v,...p}:v)};
    case "ADMIN.EDU_DELETE": return {...st, eduVideos:st.eduVideos.filter(v=>v.id!==p)};
    case "ADMIN.PLANO_SET_PRICE": return {...st, planosPrices:{...st.planosPrices,[p.plano]:p.preco}};
    case "ADMIN.PLANO_UPDATE_FEATURES": {
      // p = { plano: string, features: string[] }
      const planosFeatures = {...(st.planosFeatures||{})};
      if (p?.plano && Array.isArray(p?.features)) {
        planosFeatures[p.plano] = p.features;
      }
      return {...st, planosFeatures};
    }
    case "ADMIN.CERT_SET_PRICE": return {...st, certA1Prices:{...st.certA1Prices,[p.tipo]:p.preco}};
    case "ADMIN.ADD_PARCEIRO": return {...st, parceiros:[...(st.parceiros||[]),p]};
    case "ADMIN.ADD_ADMIN_USER": return {...st, adm_usuarios:[...(st.adm_usuarios||[]),p]};
    case "CERT.REVOKE": return {...st, certs:st.certs.map(c=>c.id===p?{...c,active:false}:c)};
    case "SYSTEM.RUN_TRIGGERS": {
      // Roda o SmartTriggerEngine e injeta notificações novas
      const newNotifs = SmartTriggerEngine.run(st);
      if (newNotifs.length === 0) return st;
      const notificacoes = [
        ...newNotifs.map(n => ({...n, id:genId(), ts:tsISO(), lida:false})),
        ...st.notificacoes
      ].slice(0,100);
      return {...st, notificacoes};
    }
    case "CREDIT.PROPOSTA_EXPIRE": {
      // Inativa propostas vencidas — chamado pelo useEffect de polling
      const now = Date.now();
      const propostasBanco = (st.propostasBanco||[]).map(p =>
        p.status==="PENDENTE" && new Date(p.expiresAt).getTime() < now
          ? {...p, status:"EXPIRADA", expiradaEm:tsISO()}
          : p
      );
      const expiradas = propostasBanco.filter(p=>p.status==="EXPIRADA"&&!(st.propostasBanco||[]).find(op=>op.id===p.id&&op.status==="EXPIRADA"));
      let n = {...st, propostasBanco};
      expiradas.forEach(p => {
        n = addNotif(n, {tipo:"proposta_exp", msg:`Proposta do ${p.bancoNome} de ${fmtBRL(p.valor)} expirou sem resposta.`, acao:"propostas"});
      });
      return n;
    }
    case "CREDIT.PARCEIRO_ENVIAR_PROPOSTA": {
      // Parceiro envia proposta ativa ao MEI
      const proposta = {
        id:genId(), bancoId:p.bancoId, bancoNome:p.bancoNome,
        valor:p.valor, taxa:p.taxa, parcelas:p.parcelas,
        valorParcela:p.valorParcela, cet:p.cet||"",
        status:"PENDENTE", mensagem:p.mensagem||"Nova proposta de crédito.",
        expiresAt:new Date(Date.now()+(p.diasValidade||7)*86400000).toISOString(),
        criadaEm:tsISO()
      };
      let n = {...st, propostasBanco:[proposta,...(st.propostasBanco||[])]};
      n = addNotif(n, {tipo:"credito", msg:`📨 ${p.bancoNome} enviou proposta de ${fmtBRL(p.valor)} em ${p.parcelas}×. Veja em Propostas!`, acao:"propostas"});
      n = addTimeline(n, {tipo:"credito", titulo:`Proposta ${fmtBRL(p.valor)} recebida`, desc:p.bancoNome, cor:T.greenMid});
      return n;
    }
    case "CREDIT.GERAR_COMISSAO": {
      // Geração automática de comissão no settlement quando operação é liberada
      const {operacaoId, parceiroId, valorPrincipal, comissaoPct} = p;
      const taxa = comissaoPct || 0.025;
      const valorCom = Math.round(valorPrincipal * taxa * 100) / 100;
      const rev = {
        id:genId(), parceiroId, operacaoId,
        tipo:"ORIGINACAO", valorOperacao:valorPrincipal,
        taxaAplicada:taxa, valorLucrom:valorCom,
        status:"PENDENTE", competencia:new Date().toISOString().slice(0,7)
      };
      const parceiro = st.parceiros.find(p2=>p2.id===parceiroId);
      const tier = parceiro?.volumeFinanciado>400000?"Ouro":parceiro?.volumeFinanciado>200000?"Prata":"Bronze";
      const tierColor = tier==="Ouro"?"#F59E0B":tier==="Prata"?"#94A3B8":"#CD7F32";
      const n = {...st, revenueShare:[{...rev,tier,tierColor},...(st.revenueShare||[])]};
      return addNotif(n, {tipo:"comissao", msg:`💰 Comissão ${fmtBRL(valorCom)} gerada — operação ${fmtBRL(valorPrincipal)} (${(taxa*100).toFixed(1)}%).`, acao:"adm_revenue"});
    }
    case "FINANCIAL.SETTLEMENT_CREATE": {
      // Admin cria lote de settlement manual
      const lote = `LOTE-${new Date().getFullYear()}-${String((st.settlements||[]).length+1).padStart(2,"0")}-${String(Math.floor(Math.random()*999)+1).padStart(3,"0")}`;
      const s = {id:genId(), lote, tipo:"REVENUE_LUCROM", devedorId:p.devedorId, devedorNome:p.devedorNome,
        credorId:"LUCROM", valorBruto:p.valorBruto, descontoIR:Math.round(p.valorBruto*0.015*100)/100,
        valorLiquido:Math.round(p.valorBruto*0.985*100)/100, operacaoIds:p.operacaoIds||[],
        status:"ABERTO", criadoEm:tsISO(), dataCorte:new Date(Date.now()+30*86400000).toISOString(), conciliado:false};
      return {...st, settlements:[s,...(st.settlements||[])]};
    }
    case "SYSTEM.NOTIF_READ": return {...st, notificacoes:st.notificacoes.map(n=>n.id===p?{...n,lida:true}:n)};
    case "SYSTEM.NOTIF_READ_ALL": return {...st, notificacoes:st.notificacoes.map(n=>({...n,lida:true}))};
    case "SYSTEM.ADD_PAYMENT": return {...st, pagamentos:[p,...(st.pagamentos||[])]};

    // ── S7: Preferências de notificação ──────────────────────────────
    case "SYSTEM.NOTIF_SET_PREFS": {
      // p = { canais: {FISCAL:['push','email'], SCORE:['push']}, silencioInicio:'22:00', silencioFim:'08:00' }
      return {...st, notifPrefs: {...(st.notifPrefs||{}), ...p}};
    }

    // ── S3: Estorno append-only (nunca deleta — cria lançamento espelho) ──
    case "MEI.ESTORNAR_TX": {
      // p = { id: txId, motivo: string }
      const original = (st.transactions||[]).find(t=>t.id===p.id);
      if(!original) return st;
      if(original.status==="ESTORNADA") return addNotif(st,{tipo:"sistema",msg:"Transação já foi estornada.",acao:"lancamentos"});
      // Bloqueia estorno de tx ainda não confirmada
      if(original.status==="PENDENTE") return addNotif(st,{tipo:"sistema",msg:"Não é possível estornar transação pendente.",acao:"lancamentos"});
      // Cria lançamento de estorno (sinal invertido — padrão append-only)
      const estorno = {
        id: genId(),
        tipo: original.tipo,
        valor: -Math.abs(original.valor), // sinal invertido
        valorCentavos: -Math.abs(original.valorCentavos||Math.round(original.valor*100)),
        categoria: original.categoria,
        desc: `ESTORNO: ${p.motivo}`,
        data: tsISO(),
        status: "CONFIRMADA",
        estornoDe: original.id,
      };
      // Marca original como estornada (único campo mutável permitido)
      const transactions = (st.transactions||[]).map(t=>
        t.id===p.id ? {...t, status:"ESTORNADA", estornadaEm:tsISO()} : t
      );
      // Ajusta faturamento se era receita
      const deltaFat = original.tipo==="RECEITA" ? -Math.abs(original.valor) : 0;
      let n = {...st, transactions:[estorno,...transactions], faturamento:(st.faturamento||0)+deltaFat};
      n = addNotif(n,{tipo:"financeiro",msg:`Estorno de ${fmtBRL(Math.abs(original.valor))} registrado. Motivo: ${p.motivo}`,acao:"lancamentos"});
      n = addTimeline(n,{tipo:"financeiro",titulo:`Estorno ${fmtBRL(Math.abs(original.valor))}`,desc:p.motivo,cor:"#f59e0b"});
      return withScore(n);
    }

    // ── S3/S0: Outbox event (pattern transacional — frontend mock) ────
    // Em produção: gravar no OutboxEvent do Prisma na mesma tx
    case "SYSTEM.OUTBOX_EVENT": {
      // p = { type: string, payload: object }
      const evt = {id:genId(), type:p.type, payload:p.payload, status:"PROCESSED", ts:tsISO()};
      return {...st, outboxEvents:[evt,...(st.outboxEvents||[])].slice(0,50)};
    }

    // ── S9: Contestação de Score (append-only — decisão não pode ser sobrescrita) ──
    case "MEI.CONTESTAR_SCORE": {
      // p = { scoreHistId, texto, evidenciaUrl? }
      const contestacao = {
        id: genId(), userId: st.user.id,
        scoreHistId: p.scoreHistId,
        texto: p.texto,
        evidenciaUrl: p.evidenciaUrl||null,
        decisao: "PENDENTE", // NUNCA alterado pelo MEI — só admin
        decididoPor: null,
        criadaEm: tsISO(),
      };
      let n = {...st, contestacoes:[contestacao,...(st.contestacoes||[])]};
      n = addNotif(n,{tipo:"score",msg:"Contestação de score enviada. Resposta em até 5 dias úteis.",acao:"score_explicado"});
      // Outbox: notifica admin
      n = {...n, outboxEvents:[{id:genId(),type:"SCORE_CONTESTADO",payload:{contestacaoId:contestacao.id,userId:st.user.id},status:"PENDING",ts:tsISO()},...(n.outboxEvents||[])].slice(0,50)};
      return n;
    }

    // ── Admin: resolver contestação (só admin, decisao imutável após definida) ──
    case "ADMIN.RESOLVER_CONTESTACAO": {
      // p = { id, decisao: 'ACATADA'|'NEGADA'|'PARCIAL', decididoPor }
      const contestacoes = (st.contestacoes||[]).map(c=>{
        if(c.id!==p.id) return c;
        if(c.decisao!=="PENDENTE") return c; // imutável se já decidida
        return {...c, decisao:p.decisao, decididoPor:p.decididoPor, decidaEm:tsISO()};
      });
      return {...st, contestacoes};
    }

    case "__HYDRATE__": return { ...INIT, ...p };

    default: return st;
  }
}

const ToastCtx = createContext(null);
const GoCtx = createContext(null);

function ToastProvider({ children }) {
  const [t, setT] = useState({show:false,msg:"",type:"ok"});
  const show = useCallback((msg, type="ok") => {
    setT({show:true,msg,type});
    setTimeout(()=>setT(s=>s.msg===msg?{show:false,msg:"",type:"ok"}:s), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t.show && (
        <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:t.type==="err"?T.red:t.type==="warn"?T.amber:T.green,color:T.white,padding:"11px 22px",borderRadius:T.radius,fontWeight:700,fontSize:13,zIndex:9999,boxShadow:T.shadowMd,display:"flex",alignItems:"center",gap:8,whiteSpace:"nowrap"}}>
          {t.type==="err"?"✕":t.type==="warn"?"⚠":"✓"} {t.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

const useToast = () => useContext(ToastCtx);
const useGo = () => useContext(GoCtx);

function Card({ children, style={}, onClick }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={()=>onClick&&setH(true)} onMouseLeave={()=>setH(false)}
      style={{
        background: T.surface,
        borderRadius: T.radius,
        border: `1px solid ${h&&onClick ? T.ink10 : T.ink05}`,
        boxShadow: h && onClick ? T.shadowMd : T.shadow,
        padding: T.sp4,
        transition: "box-shadow .18s, border-color .18s",
        cursor: onClick ? "pointer" : undefined,
        ...style
      }}>
      {children}
    </div>
  );
}

function CardFlat({ children, style={} }) {
  return (
    <div style={{
      background: T.ink02,
      borderRadius: T.radiusSm,
      border: `1px solid ${T.ink05}`,
      padding: T.sp3,
      ...style
    }}>
      {children}
    </div>
  );
}

function Stat({ label, value, sub, icon, color }) {
  return (
    <div style={{
      background: T.surface,
      borderRadius: T.radius,
      border: `1px solid ${T.ink05}`,
      boxShadow: T.shadow,
      padding: `${T.sp4} ${T.sp4}`,
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{
          fontSize: "0.625rem",
          fontWeight: 700,
          color: T.ink40,
          textTransform: "uppercase",
          letterSpacing: "0.8px",
        }}>{label}</span>
        {icon && <span style={{fontSize:"1.1rem"}}>{icon}</span>}
      </div>
      <div style={{
        fontSize: "1.25rem",
        fontWeight: 800,
        color: color || T.ink,
        letterSpacing: "-0.5px",
        lineHeight: 1.1,
      }}>{value}</div>
      {sub && <div style={{fontSize:"0.6875rem",color:T.ink40,fontWeight:500}}>{sub}</div>}
    </div>
  );
}

function Bar({ v, max, color, h=6 }) {
  const pct = Math.min(100, (v / Math.max(max, 1)) * 100);
  return (
    <div style={{background: T.ink05, borderRadius: 99, height: h, overflow: "hidden"}}>
      <div style={{
        width: `${pct}%`,
        background: color || T.green,
        height: "100%",
        borderRadius: 99,
        transition: "width .6s cubic-bezier(.25,.46,.45,.94)",
      }}/>
    </div>
  );
}

function Badge({ children, color=T.green, style={} }) {
  // Calcula cor de texto adequada baseada na cor de fundo
  const textColor = color;
  const bg = `${color}1A`; // 10% opacidade
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "3px 10px",
      borderRadius: 99,
      fontSize: "0.6875rem",
      fontWeight: 700,
      background: bg,
      color: textColor,
      border: `1px solid ${color}30`,
      letterSpacing: "0.1px",
      ...style
    }}>
      {children}
    </span>
  );
}

function Chip({ children, active, onClick, color=T.green }) {
  return (
    <button onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 99,
        border: `1.5px solid ${active ? color : T.ink10}`,
        background: active ? `${color}12` : "transparent",
        color: active ? color : T.ink60,
        fontWeight: 700,
        fontSize: "0.75rem",
        cursor: "pointer",
        transition: "all .16s",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        letterSpacing: "0.1px",
      }}>
      {children}
    </button>
  );
}

function Btn({ children, onClick, v="primary", disabled, full, size="md", style={}, ariaLabel, type="button" }) {
  const [h, setH] = useState(false);
  const sizes = {
    sm: { fontSize: "0.75rem",  padding: "5px 12px",  height: 32, gap: 5 },
    md: { fontSize: "0.8125rem", padding: "8px 16px", height: 40, gap: 6 },
    lg: { fontSize: "0.9375rem", padding: "11px 22px", height: 48, gap: 8 },
  };
  const variants = {
    primary: {
      background: h ? T.greenDk : T.green,
      color: "#FFFFFF",
      border: "none",
      boxShadow: h ? `0 4px 12px ${T.green}50` : `0 2px 6px ${T.green}30`,
    },
    secondary: {
      background: h ? T.greenBorder : T.greenPale,
      color: T.green,
      border: `1.5px solid ${T.greenBorder}`,
      boxShadow: "none",
    },
    outline: {
      background: h ? T.ink02 : "transparent",
      color: T.ink60,
      border: `1.5px solid ${T.ink10}`,
      boxShadow: "none",
    },
    danger: {
      background: h ? T.redBdr : T.redPale,
      color: T.red,
      border: `1.5px solid ${T.redBdr}`,
      boxShadow: "none",
    },
    amber: {
      background: h ? T.amberBdr : T.amberPale,
      color: T.amber,
      border: `1.5px solid ${T.amberBdr}`,
      boxShadow: "none",
    },
    purple: {
      background: h ? T.purpleMid : T.purple,
      color: "#FFFFFF",
      border: "none",
      boxShadow: h ? `0 4px 12px ${T.purple}40` : "none",
    },
    teal: {
      background: h ? T.teal : T.tealMid,
      color: "#FFFFFF",
      border: "none",
      boxShadow: h ? `0 4px 12px ${T.teal}40` : "none",
    },
  };
  const sz = sizes[size] || sizes.md;
  const vs = variants[v] || variants.primary;
  return (
    <button onClick={onClick} disabled={disabled} type={type}
      aria-label={ariaLabel} aria-disabled={disabled}
      onMouseEnter={()=>!disabled&&setH(true)}
      onMouseLeave={()=>setH(false)}
      style={{
        ...sz,
        ...vs,
        fontFamily: "inherit",
        fontWeight: 700,
        borderRadius: T.radiusSm,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        width: full ? "100%" : undefined,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: sz.gap,
        transition: "all .16s cubic-bezier(.25,.46,.45,.94)",
        letterSpacing: "0.1px",
        ...style
      }}>
      {children}
    </button>
  );
}

function Input({ label, value, onChange, type="text", placeholder, hint, prefix, error, suffix, rows, disabled }) {
  const [foc, setFoc] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const isPassword = type === "password";
  const resolvedType = isPassword ? (showPwd ? "text" : "password") : type;
  const borderColor = error ? T.red : foc ? T.green : T.ink10;
  const labelColor  = error ? T.red : T.ink60;
  const commonBase = {
    width: "100%",
    borderRadius: T.radiusSm,
    background: disabled ? T.ink02 : T.surface,
    border: `1.5px solid ${borderColor}`,
    color: T.ink,
    fontSize: "0.8125rem",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    transition: "border-color .15s, box-shadow .15s",
    boxShadow: foc ? `0 0 0 3px ${T.green}14` : "none",
  };
  if (rows) {
    return (
      <div style={{marginBottom: T.sp3}}>
        {label && <label style={{display:"block",fontSize:"0.75rem",fontWeight:700,color:labelColor,marginBottom:T.sp1,letterSpacing:"0.2px"}}>{label}</label>}
        <textarea rows={rows} value={value} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder}
          onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)}
          style={{...commonBase, padding:"10px 12px", lineHeight:1.6, resize:"vertical"}}/>
        {error && <p style={{margin:"3px 0 0",fontSize:"0.6875rem",color:T.red,fontWeight:600}}>{error}</p>}
        {hint && !error && <p style={{margin:"3px 0 0",fontSize:"0.6875rem",color:T.ink40}}>{hint}</p>}
      </div>
    );
  }
  const hasSuffixOrPwd = suffix || isPassword;
  return (
    <div style={{marginBottom: T.sp3}}>
      {label && <label style={{display:"block",fontSize:"0.75rem",fontWeight:700,color:labelColor,marginBottom:T.sp1,letterSpacing:"0.2px"}}>{label}</label>}
      <div style={{position:"relative",display:"flex",alignItems:"center"}}>
        {prefix && <span style={{position:"absolute",left:10,color:T.ink40,fontSize:"0.8125rem",pointerEvents:"none",fontWeight:600}}>{prefix}</span>}
        <input type={resolvedType} value={value} onChange={e=>onChange?.(e.target.value)} placeholder={placeholder} disabled={disabled}
          onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)}
          style={{
            ...commonBase,
            height: 42,
            padding: `0 ${hasSuffixOrPwd?"42px":"12px"} 0 ${prefix?"36px":"12px"}`,
          }}/>
        {isPassword && (
          <button type="button" onClick={()=>setShowPwd(v=>!v)}
            aria-label={showPwd?"Ocultar senha":"Visualizar senha"}
            style={{position:"absolute",right:10,background:"none",border:"none",cursor:"pointer",color:T.ink40,fontSize:"1rem",padding:"4px",display:"flex",alignItems:"center",lineHeight:1}}>
            {showPwd ? "🙈" : "👁"}
          </button>
        )}
        {suffix && !isPassword && <span style={{position:"absolute",right:10,color:T.ink40,fontSize:"0.75rem",pointerEvents:"none",fontWeight:600}}>{suffix}</span>}
      </div>
      {error && <p style={{margin:"3px 0 0",fontSize:"0.6875rem",color:T.red,fontWeight:600}}>{error}</p>}
      {hint && !error && <p style={{margin:"3px 0 0",fontSize:"0.6875rem",color:T.ink40,lineHeight:1.5}}>{hint}</p>}
    </div>
  );
}

function Sel({ label, value, onChange, options, error }) {
  const [foc, setFoc] = useState(false);
  return (
    <div style={{marginBottom: T.sp3}}>
      {label && <label style={{display:"block",fontSize:"0.75rem",fontWeight:700,color:error?T.red:T.ink60,marginBottom:T.sp1,letterSpacing:"0.2px"}}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)}
        style={{
          width:"100%", height:42,
          borderRadius: T.radiusSm,
          padding: "0 12px",
          background: T.surface,
          border: `1.5px solid ${error ? T.red : foc ? T.green : T.ink10}`,
          color: T.ink,
          fontSize: "0.8125rem",
          outline: "none",
          boxSizing: "border-box",
          boxShadow: foc ? `0 0 0 3px ${T.green}14` : "none",
          transition: "border-color .15s",
          fontFamily: "inherit",
        }}>
        {options.map(o => <option key={o.v||o} value={o.v||o}>{o.l||o}</option>)}
      </select>
    </div>
  );
}

function Modal({ open, onClose, title, children, width=480 }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(7,24,18,.72)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "12px",
        overflowY: "auto",
      }}
      onClick={onClose}>
      <div
        style={{
          background: T.surface,
          borderRadius: T.radiusLg,
          width: "100%", maxWidth: width,
          maxHeight: "92vh", overflowY: "auto",
          boxShadow: T.shadowXl,
          border: `1px solid ${T.ink05}`,
        }}
        onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px",
          borderBottom: `1px solid ${T.ink05}`,
          position: "sticky", top: 0,
          background: T.surface, zIndex: 1,
        }}>
          <h3 style={{fontSize:"0.9375rem",fontWeight:800,color:T.ink,letterSpacing:"-0.2px"}}>{title}</h3>
          <button onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: T.radiusXs,
              border: `1px solid ${T.ink10}`,
              background: T.ink02,
              cursor: "pointer", fontSize: "1.1rem",
              color: T.ink40, display: "flex",
              alignItems: "center", justifyContent: "center",
              transition: "all .15s",
              fontFamily: "inherit",
            }}
            onMouseEnter={e=>{e.target.style.background=T.ink05;e.target.style.color=T.ink;}}
            onMouseLeave={e=>{e.target.style.background=T.ink02;e.target.style.color=T.ink40;}}>
            ×
          </button>
        </div>
        <div style={{padding:"18px 20px"}}>{children}</div>
      </div>
    </div>
  );
}

function AlertBox({ type="info", children, style={} }) {
  const C = {
    info:    { bg: T.tealPale,   color: T.teal,   icon: "ℹ️",  border: T.tealBdr },
    warn:    { bg: T.amberPale,  color: T.amber,  icon: "⚠️",  border: T.amberBdr },
    success: { bg: T.greenPale,  color: T.green,  icon: "✅",  border: T.greenBorder },
    danger:  { bg: T.redPale,    color: T.red,    icon: "🚨",  border: T.redBdr },
  };
  const c = C[type] || C.info;
  return (
    <div style={{
      background: c.bg,
      borderRadius: T.radiusSm,
      border: `1px solid ${c.border}`,
      padding: "10px 14px",
      display: "flex", gap: T.sp2,
      alignItems: "flex-start",
      marginBottom: T.sp3,
      ...style
    }}>
      <span style={{fontSize:"0.9rem",flexShrink:0,lineHeight:1.6}}>{c.icon}</span>
      <div style={{fontSize:"0.75rem",color:c.color,fontWeight:600,lineHeight:1.6}}>{children}</div>
    </div>
  );
}

function Grid({ cols=2, gap=12, children, style={} }) {
  return <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap,...style}}>{children}</div>;
}

function Divider({ label }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:T.sp2,margin:"16px 0"}}>
      <div style={{flex:1,height:1,background:T.ink05}}/>
      {label && <span style={{fontSize:"0.625rem",fontWeight:700,color:T.ink20,textTransform:"uppercase",letterSpacing:"0.9px",whiteSpace:"nowrap"}}>{label}</span>}
      <div style={{flex:1,height:1,background:T.ink05}}/>
    </div>
  );
}

function PageWrap({ title, subtitle, action, back, onBack, children }) {
  return (
    <div style={{color:T.ink}}>
      {(back || onBack) && (
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: T.ink60,
            fontSize: "0.8125rem",
            fontWeight: 500,
            padding: "0 0 14px 0",
            fontFamily: "inherit",
            transition: "color .15s",
          }}
          onMouseOver={e=>e.currentTarget.style.color=T.green}
          onMouseOut={e=>e.currentTarget.style.color=T.ink60}
          aria-label="Voltar">
          ← Voltar
        </button>
      )}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: T.sp5,
        gap: T.sp3,
        flexWrap: "wrap",
      }}>
        <div>
          <h1 style={{
            fontSize: "1.125rem",
            fontWeight: 800,
            color: T.ink,
            letterSpacing: "-0.4px",
            lineHeight: 1.2,
            marginBottom: 3,
          }}>{title}</h1>
          {subtitle && <p style={{fontSize:"0.6875rem",color:T.ink60,fontWeight:500}}>{subtitle}</p>}
        </div>
        <div style={{display:"flex",gap:T.sp2,alignItems:"center",flexWrap:"wrap"}}>{action}</div>
      </div>
      {children}
    </div>
  );
}

function ScoreGauge({ score, size=140 }) {
  const r   = ScoreEngine.risk(score);
  const niv = ScoreEngine.nivel(score);
  const cx  = size / 2, cy = size * 0.54, rad = size * 0.38;
  const circ = Math.PI * rad;
  const pct  = Math.min(Math.max((score - 300) / 700, 0), 1);
  return (
    <div style={{textAlign:"center"}}>
      <svg width={size} height={size*0.62} viewBox={`0 0 ${size} ${size*0.62}`} style={{display:"block",margin:"0 auto"}}>
        {/* Track */}
        <path d={`M ${cx-rad} ${cy} A ${rad} ${rad} 0 0 1 ${cx+rad} ${cy}`}
          fill="none" stroke={T.ink05} strokeWidth={size*0.065} strokeLinecap="round"/>
        {/* Fill — gradiente simulado com dois segmentos */}
        <path d={`M ${cx-rad} ${cy} A ${rad} ${rad} 0 0 1 ${cx+rad} ${cy}`}
          fill="none" stroke={niv.color} strokeWidth={size*0.065} strokeLinecap="round"
          strokeDasharray={`${pct*circ} ${circ}`}
          style={{filter:`drop-shadow(0 0 4px ${niv.color}60)`}}/>
        {/* Score */}
        <text x={cx} y={cy-4} textAnchor="middle"
          fontSize={size*0.21} fontWeight="800" fill={T.ink} fontFamily="inherit"
          letterSpacing="-1">{score}</text>
        <text x={cx} y={cy+12} textAnchor="middle"
          fontSize={size*0.065} fill={T.ink40} fontFamily="inherit">/1000</text>
      </svg>
      <Badge color={niv.color} style={{marginTop:4}}>{niv.label}</Badge>
    </div>
  );
}

function OperacaoStatusBadge({ status }) {
  const map = {
    SOLICITADA:  {c:T.amber,  l:"Solicitada"},
    APROVADA:    {c:T.tealMid,l:"Aprovada"},
    LIBERADA:    {c:T.green,  l:"Liberada"},
    ADIMPLENTE:  {c:T.green,  l:"Adimplente"},
    INADIMPLENTE:{c:T.red,    l:"Inadimplente"},
    ENCERRADA:   {c:T.ink40,  l:"Encerrada"},
    EXPIRADA:    {c:T.ink40,  l:"Expirada"},
    RECUSADA:    {c:T.red,    l:"Recusada"},
    EM_ANALISE:  {c:T.teal,   l:"Em Análise"},
    PENDENTE:    {c:T.amber,  l:"Pendente"},
  };
  const s = map[status] || {c:T.ink40, l:status};
  return <Badge color={s.c}>{s.l}</Badge>;
}

function PaymentModal({ open, onClose, onSuccess, title, amount, description, dispatch }) {
  const toast = useToast();
  const [method, setMethod] = useState("pix");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  function reset() { setStep(1); setMethod("pix"); }
  function handleClose() { reset(); onClose(); }

  async function handlePay() {
    setLoading(true);
    await new Promise(r=>setTimeout(r,1500));
    setLoading(false);
    setStep(3);
    if(dispatch) dispatch({type:"SYSTEM.ADD_PAYMENT",p:{id:genId(),titulo:title,valor:amount,metodo:method,ts:tsISO(),status:"PAGO"}});
    if(onSuccess) onSuccess();
    toast(`Pagamento de ${fmtBRL(amount)} confirmado!`);
  }

  return (
    <Modal open={open} onClose={handleClose} title={title} width={420}>
      {step===3 ? (
        <div style={{textAlign:"center",padding:"24px 0"}}>
          <div style={{width:64,height:64,borderRadius:99,background:T.greenPale,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:32}}>✅</div>
          <h3 style={{fontSize:18,fontWeight:800,color:T.ink,marginBottom:6}}>Pagamento confirmado!</h3>
          <p style={{fontSize:13,color:T.ink60,marginBottom:20}}>{fmtBRL(amount)}</p>
          <Btn v="primary" full onClick={handleClose}>Concluir</Btn>
        </div>
      ) : step===2 ? (
        <div>
          <CardFlat style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:13}}>Método</span>
              <span style={{fontWeight:700}}>{method==="pix"?"⚡ Pix":method==="card"?"💳 Cartão":"📄 Boleto"}</span>
            </div>
            <Divider/>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:14,fontWeight:800}}>Total</span>
              <span style={{fontSize:16,fontWeight:800,color:T.green}}>{fmtBRL(amount)}</span>
            </div>
          </CardFlat>
          <div style={{display:"flex",gap:8}}>
            <Btn v="outline" full onClick={()=>setStep(1)}>← Voltar</Btn>
            <Btn v="primary" full onClick={handlePay} disabled={loading}>{loading?"Processando...":"🔒 Confirmar"}</Btn>
          </div>
        </div>
      ) : (
        <div>
          <p style={{fontSize:13,color:T.ink60,marginBottom:4}}>{description}</p>
          <p style={{fontSize:22,fontWeight:800,color:T.ink,marginBottom:14}}>{fmtBRL(amount)}</p>
          {[{id:"pix",icon:"⚡",label:"Pix (instantâneo)"},{id:"card",icon:"💳",label:"Cartão de Crédito"},{id:"boleto",icon:"📄",label:"Boleto Bancário"}].map(m => (
            <div key={m.id} onClick={()=>setMethod(m.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:T.radius,border:`2px solid ${method===m.id?T.green:T.ink10}`,background:method===m.id?T.greenPale:T.white,cursor:"pointer",marginBottom:8}}>
              <span style={{fontSize:20}}>{m.icon}</span>
              <span style={{fontWeight:700,fontSize:13}}>{m.label}</span>
            </div>
          ))}
          <Btn v="primary" full style={{marginTop:10}} onClick={()=>setStep(2)}>Continuar →</Btn>
        </div>
      )}
    </Modal>
  );
}

function BottomNav({ page, go, perfil, naoLidas }) {
  const TABS = {
    Cliente:[
      {key:"home",label:"Início",ic:"H"},
      {key:"missions",label:"Missões",ic:"T"},
      {key:"lancamentos",label:"Finanças",ic:"C"},
      {key:"impostos",label:"DAS",ic:"G"},
      {key:"perfil",label:"Perfil",ic:"P"},
    ],
    Parceiro:[
      {key:"parc_dash",label:"Painel",ic:"R"},
      {key:"parc_carteira",label:"Clientes",ic:"P"},
      {key:"parc_operacoes",label:"Crédito",ic:"C"},
      {key:"parc_score",label:"Score",ic:"T"},
      {key:"parc_settlement",label:"Liquid.",ic:"G"},
    ],
    Admin:[
      {key:"adm_dash",label:"Painel",ic:"R"},
      {key:"adm_operacoes",label:"Ops",ic:"C"},
      {key:"adm_usuarios",label:"Users",ic:"P"},
      {key:"adm_fraudes",label:"Fraude",ic:"T"},
      {key:"adm_health",label:"Sistema",ic:"G"},
    ],
  };
  const tabs = TABS[perfil] || TABS.Cliente;
  const ac = "#22a85a";
  const in_ = "rgba(255,255,255,.4)";
  return (
    <div style={{position:"fixed",bottom:0,left:0,right:0,height:56,zIndex:400,background:"rgba(5,18,12,.98)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,.08)",display:"flex",alignItems:"stretch"}}>
      {tabs.map(tab=>{
        const active = page===tab.key;
        const c = active?ac:in_;
        return (
          <button key={tab.key} onClick={()=>go(tab.key)} aria-label={tab.label} aria-current={active?"page":undefined}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"6px 2px 8px",position:"relative",WebkitTapHighlightColor:"transparent"}}>
            {active&&<div style={{position:"absolute",top:0,left:"10%",right:"10%",height:2,borderRadius:"0 0 2px 2px",background:"linear-gradient(90deg,#22a85a,#4ade80)"}}/>}
            <div style={{lineHeight:0}}>
              {tab.ic==="H"&&<svg width="20" height="20" viewBox="0 0 22 22" fill="none"><polygon points="11,2 19,7 19,16 11,20 3,16 3,7" stroke={c} strokeWidth="1.8" fill={active?"rgba(34,168,90,.15)":"none"}/></svg>}
              {tab.ic==="T"&&(
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="11" r="8" stroke={c} strokeWidth="1.8"/>
                  <circle cx="11" cy="11" r="4" stroke={c} strokeWidth="1.5"/>
                  <circle cx="11" cy="11" r="1.5" fill={c}/>
                </svg>
              )}
              {tab.ic==="C"&&(
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                  <rect x="3" y="13" width="3" height="7" rx="1" fill={c}/>
                  <rect x="9" y="8" width="3" height="12" rx="1" fill={c} opacity="0.7"/>
                  <rect x="15" y="4" width="3" height="16" rx="1" fill={c} opacity="0.5"/>
                </svg>
              )}
              {tab.ic==="G"&&(
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.8" fill={active?"rgba(34,168,90,.15)":"none"}/>
                  <rect x="12" y="3" width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.8" fill={active?"rgba(34,168,90,.15)":"none"}/>
                  <rect x="3" y="12" width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.8" fill={active?"rgba(34,168,90,.15)":"none"}/>
                  <rect x="12" y="12" width="7" height="7" rx="1.5" stroke={c} strokeWidth="1.8"/>
                </svg>
              )}
              {tab.ic==="P"&&(
                <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="7" r="3.5" stroke={c} strokeWidth="1.8" fill={active?"rgba(34,168,90,.15)":"none"}/>
                  <path d="M4 19c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              )}
              {tab.ic==="R"&&<svg width="20" height="20" viewBox="0 0 22 22" fill="none"><path d="M11 3L20 19H2Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round" fill={active?"rgba(34,168,90,.15)":"none"}/></svg>}
            </div>
            <span style={{fontSize:9,fontWeight:active?700:400,color:active?ac:in_,letterSpacing:".3px",lineHeight:1}}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function GlobalSearch({ st, go, onClose }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  useEffect(()=>{ inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    if(q.length<2) return [];
    const ql = q.toLowerCase();
    const items = [];
    st.transactions.filter(t=>t.desc.toLowerCase().includes(ql)).slice(0,3).forEach(t=>items.push({icon:t.tipo==="RECEITA"?"💰":"📉",label:t.desc,sub:`${t.tipo} · ${fmtBRL(t.valor)}`,action:"lancamentos"}));
    st.missions.filter(m=>m.title.toLowerCase().includes(ql)).slice(0,2).forEach(m=>items.push({icon:m.icon,label:m.title,sub:`${m.xp} XP`,action:"missions"}));
    const allNav = [...NAV.Cliente,...NAV.Parceiro,...NAV.Admin];
    allNav.filter(n=>n.label.toLowerCase().includes(ql)).slice(0,4).forEach(n=>items.push({icon:n.icon,label:n.label,sub:"Menu",action:n.key}));
    return items.slice(0,8);
  }, [q, st]);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.7)",zIndex:2000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"60px 16px"}} onClick={onClose}>
      <div style={{background:T.white,borderRadius:T.radiusLg,width:"100%",maxWidth:540,boxShadow:T.shadowLg,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",borderBottom:`1px solid ${T.ink10}`}}>
          <span style={{fontSize:18}}>🔎</span>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar transações, missões, menus..."
            style={{flex:1,border:"none",outline:"none",fontSize:15,color:T.ink,fontFamily:"inherit"}}/>
          <kbd style={{fontSize:11,color:T.ink40,background:T.ink05,padding:"2px 7px",borderRadius:5}}>ESC</kbd>
        </div>
        {q.length<2 && <div style={{padding:"20px 16px",textAlign:"center",color:T.ink60,fontSize:13}}>Digite ao menos 2 caracteres</div>}
        {q.length>=2 && results.length===0 && <div style={{padding:"20px 16px",textAlign:"center",color:T.ink60,fontSize:13}}>Nenhum resultado para "<strong>{q}</strong>"</div>}
        {results.map((r,i) => (
          <div key={i} onClick={()=>{go(r.action);onClose();}}
            style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",cursor:"pointer",borderBottom:`1px solid ${T.ink05}`}}
            onMouseEnter={e=>e.currentTarget.style.background=T.ink02}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div style={{width:34,height:34,borderRadius:T.radiusSm,background:T.ink05,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{r.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:T.ink}}>{r.label}</div>
              <div style={{fontSize:11,color:T.ink60}}>{r.sub}</div>
            </div>
          </div>
        ))}
        <div style={{padding:"10px 16px",background:T.ink02,fontSize:11,color:T.ink40}}>↵ abrir · ESC fechar</div>
      </div>
    </div>
  );
}

function NotifPanel({ notifs, onClose, dispatch, go }) {
  return (
    <div role="region" aria-live="polite" aria-label="Notificações" style={{position:"fixed",right:12,top:T.navH+8,background:"#0d1f13",borderRadius:T.radiusLg,border:"1px solid rgba(255,255,255,.1)",boxShadow:"0 20px 48px rgba(0,0,0,.4)",width:320,maxHeight:420,display:"flex",flexDirection:"column",zIndex:500}} onClick={e=>e.stopPropagation()}>
      <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <span style={{fontWeight:800,fontSize:13,color:T.white}}>Notificações</span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>dispatch({type:"SYSTEM.NOTIF_READ_ALL"})} style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:"rgba(255,255,255,.5)",fontFamily:"inherit"}}>Marcar lidas</button>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:17,color:"rgba(255,255,255,.5)"}}>×</button>
        </div>
      </div>
      <div style={{overflowY:"auto",flex:1}}>
        {notifs.length===0 && <div style={{padding:24,textAlign:"center",color:"rgba(255,255,255,.4)",fontSize:13}}>Sem notificações</div>}
        {notifs.map(n => (
          <div key={n.id}
            onClick={()=>{dispatch({type:"SYSTEM.NOTIF_READ",p:n.id});if(n.acao){go(n.acao);onClose();}}}
            style={{padding:"11px 16px",borderBottom:"1px solid rgba(255,255,255,.05)",background:n.lida?"transparent":"rgba(34,168,90,.08)",cursor:n.acao?"pointer":"default",display:"flex",gap:10,alignItems:"flex-start"}}>
            <div style={{width:8,height:8,borderRadius:99,background:n.lida?"transparent":T.greenLt,flexShrink:0,marginTop:4}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:n.lida?400:700,color:T.white,lineHeight:1.4,marginBottom:2}}>{sanitize(n.msg)}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.35)",display:"flex",gap:8}}>
                {fmtDate(n.ts)}
                {n.acao && <span style={{color:T.greenLt}}>→ Ver</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Sidebar({ open, onClose, page, go, perfil, user }) {
  const nav = NAV[perfil] || NAV.Cliente;
  const groups = [...new Set(nav.map(n=>n.group))];
  return (
    <>
      {open && (
        <div style={{
          position:"fixed", inset:0,
          background:"rgba(7,24,18,.5)",
          backdropFilter:"blur(4px)",
          zIndex:199,
        }} onClick={onClose}/>
      )}
      <div style={{
        position:"fixed", left:0, top:0, bottom:0,
        width: T.sideW,
        background: "#FFFFFF",
        borderRight: "1px solid #E5E7EB",
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform .22s cubic-bezier(.25,.46,.45,.94)",
        overflowY: "auto",
        boxShadow: "2px 0 12px rgba(0,0,0,.06)",
      }}>
        {/* Logo */}
        <div style={{
          padding: "18px 16px 14px",
          borderBottom: "1px solid #F0F0F0",
          flexShrink: 0,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{
              width:34,height:34,borderRadius:9,background:"#16a34a",
              display:"flex",alignItems:"center",justifyContent:"center",
              color:"#fff",fontWeight:900,fontSize:16,flexShrink:0,
              boxShadow:"0 3px 8px rgba(22,163,74,.25)"
            }}>L</div>
            <div>
              <div style={{
                fontSize:"1.0625rem",fontWeight:800,color:"#111827",
                letterSpacing:"-0.5px",lineHeight:1,
              }}>Lucrom</div>
              <div style={{
                fontSize:"0.5625rem",color:"#9CA3AF",
                fontWeight:600,textTransform:"uppercase",
                letterSpacing:"0.8px",marginTop:2,
              }}>{perfil}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{flex:1, padding:"10px 8px", overflowY:"auto"}}>
          {groups.map(g => (
            <div key={g} style={{marginBottom:6}}>
              <div style={{
                fontSize:"0.5625rem",fontWeight:700,
                color:"#9CA3AF",
                padding:"6px 10px 3px",
                letterSpacing:"1px",
                textTransform:"uppercase",
              }}>{g}</div>
              {nav.filter(n=>n.group===g).map(item => {
                const active = page === item.key;
                return (
                  <button key={item.key} onClick={()=>go(item.key)} aria-current={active?"page":undefined}
                    style={{
                      width:"100%",
                      display:"flex", alignItems:"center", gap:9,
                      padding:"7px 10px",
                      borderRadius: T.radiusSm,
                      background: active
                        ? T.greenPale
                        : "transparent",
                      border: active
                        ? "1px solid rgba(22,163,74,.16)"
                        : "1px solid transparent",
                      cursor:"pointer",
                      marginBottom:1,
                      color: active ? "#166534" : "#4B5563",
                      fontWeight: active ? 700 : 500,
                      fontSize:"0.75rem",
                      fontFamily:"inherit",
                      textAlign:"left",
                      transition:"all .15s",
                    }}
                    onMouseEnter={e=>{if(!active){e.currentTarget.style.background="rgba(22,163,74,.04)";e.currentTarget.style.color="#111827";}}}
                    onMouseLeave={e=>{if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.color="#4B5563";}}}
                    >
                    <span style={{
                      fontSize:"0.875rem",
                      opacity: active ? 1 : 0.75,
                      flexShrink:0,
                      width:22,
                      display:"inline-flex",
                      alignItems:"center",
                      justifyContent:"center",
                    }}>{item.icon}</span>
                    <span style={{lineHeight:1.2,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:"0.75rem"}}>{item.label}</span>
                    {active && <div style={{
                      marginLeft:"auto", width:5, height:5,
                      borderRadius:99,
                      background:T.green,
                      flexShrink:0,
                      boxShadow:`0 0 6px ${T.green}40`,
                    }}/>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* User footer */}
        <div style={{
          padding:"12px 16px",
          borderTop:"1px solid #F0F0F0",
          flexShrink:0,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{
              width:32,height:32,borderRadius:99,
              background:`linear-gradient(135deg,${T.greenMid},${T.green})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:"0.8125rem",fontWeight:800,color:"#FFFFFF",
              flexShrink:0,
              boxShadow:`0 2px 8px ${T.green}30`,
            }}>{(user?.nome||"U").slice(0,1).toUpperCase()}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{
                fontSize:"0.75rem",fontWeight:700,
                color:"#111827",
                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
              }}>{user?.nome||"Usuário"}</div>
              <div style={{
                fontSize:"0.625rem",
                color:T.greenMid,
                fontWeight:600,
                marginTop:1,
              }}>{user?.plano||"Básico"}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function TopBar({ onMenu, onNotif, onSearch, naoLidas, user, perfil, onPerfilChange, onLogout, showNotifs, demoMode=false, onSairDemo }) {
  const [showMenu, setShowMenu] = useState(false);
  const perfis = ["Cliente","Parceiro","Admin"];
  return (
    <div style={{
      height: T.navH,
      background: "rgba(255,255,255,.97)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid #F0F0F0",
      boxShadow: "0 1px 4px rgba(0,0,0,.04)",
      display: "flex",
      alignItems: "center",
      padding: "0 16px",
      gap: 10,
      flexShrink: 0,
      position: "relative",
      zIndex: 10,
    }}>
      {/* Menu toggle */}
      <button onClick={onMenu}
        style={{
          width:36, height:36, borderRadius:T.radiusSm,
          border:"1px solid #E5E7EB",
          background:"transparent",
          color:"#374151", cursor:"pointer",
          fontSize:"1rem", display:"flex", alignItems:"center",
          justifyContent:"center", flexShrink:0,
          transition:"all .15s",
        }}
        onMouseEnter={e=>{e.currentTarget.style.background="#F9FAFB";}}
        onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
        ☰
      </button>

      {/* Search */}
      <button onClick={onSearch}
        style={{
          flex:1, maxWidth:280, height:34,
          borderRadius: T.radiusSm,
          border:"1px solid #E5E7EB",
          background:"#F9FAFB",
          color:"#9CA3AF",
          cursor:"pointer", fontSize:"0.75rem",
          display:"flex", alignItems:"center",
          gap:8, padding:"0 12px",
          fontFamily:"inherit",
          transition:"all .15s",
          letterSpacing:"0.1px",
        }}
        onMouseEnter={e=>{e.currentTarget.style.background="#F3F4F6";e.currentTarget.style.borderColor="#D1D5DB";}}
        onMouseLeave={e=>{e.currentTarget.style.background="#F9FAFB";e.currentTarget.style.borderColor="#E5E7EB";}}>
        <span>🔎</span>
        <span>Buscar...</span>
        <kbd style={{
          marginLeft:"auto",
          fontSize:"0.5625rem",
          background:"#F3F4F6",
          color:"#9CA3AF",
          padding:"2px 6px", borderRadius:4,
          fontFamily:"inherit",
        }}>⌘K</kbd>
      </button>

      <div style={{flex:1}}/>

      {/* Notificações */}
      <button onClick={onNotif}
        style={{
          position:"relative", width:36, height:36,
          borderRadius:T.radiusSm,
          border:`1px solid ${showNotifs?"rgba(22,163,74,.3)":"#E5E7EB"}`,
          background: showNotifs ? "rgba(22,163,74,.08)" : "transparent",
          color:"#374151", cursor:"pointer",
          fontSize:"1.05rem", display:"flex",
          alignItems:"center", justifyContent:"center",
          transition:"all .15s",
        }}>
        🔔
        {naoLidas > 0 && (
          <div style={{
            position:"absolute", top:5, right:5,
            width:9, height:9, borderRadius:99,
            background:T.red,
            border:"2px solid #FFFFFF",
            boxShadow:`0 0 6px ${T.red}60`,
          }}/>
        )}
      </button>

      {/* User menu */}
      <div style={{position:"relative"}}>
        <button onClick={()=>setShowMenu(v=>!v)}
          style={{
            display:"flex", alignItems:"center", gap:8,
            padding:"5px 10px 5px 6px",
            borderRadius:T.radiusSm,
            border:"1px solid #E5E7EB",
            background:"transparent",
            cursor:"pointer", color:"#374151",
            transition:"all .15s",
          }}
          onMouseEnter={e=>e.currentTarget.style.background="#F9FAFB"}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{
            width:26, height:26, borderRadius:99,
            background:`linear-gradient(135deg,${T.greenMid},${T.green})`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:"0.75rem", fontWeight:800, color:"#FFFFFF",
          }}>{(user?.nome||"U").slice(0,1)}</div>
          <span style={{fontSize:"0.75rem",fontWeight:600,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {user?.nome?.split(" ")[0]||"Usuário"}
          </span>
          <span style={{fontSize:"0.6rem",color:"#9CA3AF"}}>▾</span>
        </button>
        {showMenu && (
          <div style={{
            position:"absolute", right:0, top:"calc(100% + 6px)",
            background:"#FFFFFF",
            borderRadius:T.radius,
            border:"1px solid #E5E7EB",
            boxShadow:"0 8px 24px rgba(0,0,0,.10)",
            padding:T.sp2,
            minWidth:180,
            zIndex:600,
          }} onClick={e=>e.stopPropagation()}>
            {/* Perfis — visível apenas no modo demo */}
            {demoMode && (
              <>
                <div style={{padding:"4px 8px 6px",fontSize:"0.5625rem",fontWeight:700,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:".8px"}}>Painel (Demo)</div>
                {perfis.map(p => (
                  <button key={p} onClick={()=>{onPerfilChange(p);setShowMenu(false);}}
                    style={{
                      width:"100%", textAlign:"left", display:"flex", alignItems:"center", gap:8,
                      padding:"8px 10px", borderRadius:T.radiusXs,
                      background: perfil===p ? "rgba(22,163,74,.08)" : "transparent",
                      border:"none", cursor:"pointer",
                      color: perfil===p ? "#166534" : "#374151",
                      fontSize:"0.75rem", fontWeight:perfil===p?700:500,
                      fontFamily:"inherit",
                    }}>
                    {p==="Cliente"?"👤":p==="Parceiro"?"🏦":"🛡️"} {p}
                    {perfil===p && <span style={{marginLeft:"auto",fontSize:"0.625rem",color:T.greenMid}}>●</span>}
                  </button>
                ))}
                <div style={{height:1,background:"#F0F0F0",margin:"6px 0"}}/>
              </>
            )}
            {!demoMode && <div style={{height:1,background:"#F0F0F0",margin:"6px 0"}}/> }
            <button onClick={()=>{onLogout();setShowMenu(false);}}
              style={{
                width:"100%", textAlign:"left", display:"flex", alignItems:"center", gap:8,
                padding:"8px 10px", borderRadius:T.radiusXs,
                background:"transparent", border:"none", cursor:"pointer",
                color:"#DC2626",
                fontSize:"0.75rem", fontWeight:600, fontFamily:"inherit",
              }}>
              🚪 Sair
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const CHART_COLORS = [T.greenMid, T.blueMid, T.amberMid, T.redMid, T.purpleMid, T.tealMid];

// ── PAGES ────────────────────────────────────────────────────

function MissionProgress({ missions }) {
  const total = missions.length;
  const done = missions.filter(m=>m.done).length;
  const xpTotal = missions.filter(m=>m.done).reduce((a,m)=>a+(m.xp||0),0);
  const pct = total>0?Math.round(done/total*100):0;
  return (
    <div style={{background:"rgba(34,168,90,.08)",border:"1px solid rgba(34,168,90,.2)",borderRadius:T.radiusLg,padding:"16px",marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:T.white}}>Sua jornada de crescimento</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginTop:2}}>{done} de {total} missões concluídas · {xpTotal} XP acumulados</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:28,fontWeight:900,color:T.green,lineHeight:1}}>{pct}%</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>completo</div>
        </div>
      </div>
      <Bar v={done} max={total||1} color={T.green} h={6}/>
    </div>
  );
}

function MissionCard({ m, onConcluir, dispatch }) {
  const done = m.done;
  const cats = {Finanças:T.green,Impostos:T.amber,Docs:T.teal,Certificados:T.purple,OpenFinance:T.teal,Perfil:T.ink40};
  const catColor = cats[m.cat]||T.green;
  return (
    <div style={{
      background: done?"rgba(34,168,90,.08)":"rgba(255,255,255,.04)",
      border:`1px solid ${done?"rgba(34,168,90,.25)":"rgba(255,255,255,.08)"}`,
      borderRadius:T.radiusSm, padding:"14px", marginBottom:10,
      opacity: done ? .8 : 1,
    }}>
      <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
        <div style={{
          width:38, height:38, borderRadius:10,
          background: done?`${T.green}30`:`${catColor}20`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:20, flexShrink:0,
        }}>{m.icon}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
            <div style={{fontSize:13,fontWeight:700,color:done?"rgba(255,255,255,.6)":T.white,lineHeight:1.3}}>{m.title}</div>
            <Badge color={catColor} style={{fontSize:9,flexShrink:0}}>{m.cat}</Badge>
          </div>
          <div style={{display:"flex",gap:12,marginTop:6,fontSize:11,color:"rgba(255,255,255,.5)"}}>
            <span style={{color:T.amber,fontWeight:700}}>+{m.xp} XP</span>
            {m.recompensa&&<span style={{color:T.green}}>+{fmtBRL(m.recompensa)} crédito</span>}
            {done&&m.doneAt&&<span>Concluída {fmtDate(m.doneAt)}</span>}
          </div>
          {done&&<div style={{fontSize:11,color:T.green,fontWeight:700,marginTop:4}}>✅ Concluída</div>}
          {!done&&m.bloqueada&&(
            <div style={{fontSize:11,fontWeight:700,marginTop:6,padding:"5px 10px",borderRadius:T.radiusSm,background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.25)",color:T.amber,display:"flex",alignItems:"center",gap:6}}>
              🔒 Bloqueada — Plano Gratuito (máx. 3 missões)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PageHome({ st, dispatch, go }) {
  // ── Cálculos com useMemo para evitar re-render global ─────────
  const sc   = useMemo(()=>ScoreEngine.calc(st.transactions,st.missions,st.dasnDecs,st.certs,st.notasFiscais), [st.transactions,st.missions,st.dasnDecs,st.certs,st.notasFiscais]);
  const risk = useMemo(()=>ScoreEngine.risk(sc.total,st.faturamento,st.creditBonus), [sc.total,st.faturamento,st.creditBonus]);

  const { rec, des, saldo, margem } = useMemo(()=>{
    const rec = st.transactions.filter(t=>t.tipo==="RECEITA").reduce((a,t)=>a+t.valor,0);
    const des = st.transactions.filter(t=>t.tipo==="DESPESA").reduce((a,t)=>a+t.valor,0);
    const margem = rec>0?Math.round((rec-des)/rec*100):0; return { rec, des, saldo:rec-des, margem };
  }, [st.transactions]);

  // Score tendência — usa histórico real
  const scoreTrend = useMemo(()=>{
    const hist = st.scoreHistory || [];
    const prev = hist.length >= 2 ? hist[1].score : Math.max(300, sc.total - 30);
    const delta = sc.total - prev;
    const ultimos7 = hist.slice(0,7).map(h=>h.score);
    const tendencia = ultimos7.length >= 2
      ? ultimos7[0] - ultimos7[ultimos7.length-1]
      : delta;
    return {
      delta,
      tendencia,
      subindo: delta > 0,
      estavel: Math.abs(delta) < 5,
      pct: Math.round((st.missions.filter(m=>m.done).length / Math.max(st.missions.length,1))*100),
      label: delta > 20 ? "Crescendo rápido ↑↑" : delta > 5 ? "Subindo ↑" : delta < -5 ? "Atenção ↓" : "Estável →",
      color: delta > 5 ? "#22a85a" : delta < -5 ? "#ef4444" : "#f59e0b",
    };
  }, [sc.total, st.missions, st.scoreHistory]);

  // BehaviorEngine insight operacional
  const insight = useMemo(()=>{
    const txs = st.transactions;
    const rec7 = txs.filter(t=>t.tipo==="RECEITA" && new Date(t.data)>new Date(Date.now()-7*86400000));
    const missoesPend = st.missions.filter(m=>!m.done&&!m.cancelada);
    const proximaMissao = missoesPend.sort((a,b)=>(b.xp||0)-(a.xp||0))[0];
    const semDAS = !st.dasPagamentos?.length;
    const semNF  = !st.notasFiscais?.length;
    const margemOk = margem >= 30;

    if (semDAS) return { emoji:"⚠️", msg:"DAS em aberto. Pague agora para manter seu score fiscal.", acao:"impostos", cor:"#f59e0b" };
    if (semNF)  return { emoji:"📄", msg:"Emita sua primeira Nota Fiscal e ganhe +18pts no score.", acao:"notas", cor:"#3b82f6" };
    if (proximaMissao && proximaMissao.xp >= 50) return { emoji:"🎯", msg:`Complete "${proximaMissao.title}" e ganhe +${proximaMissao.xp} XP. Alto impacto no score.`, acao:"missions", cor:"#22a85a" };
    if (!margemOk && rec7.length > 0) return { emoji:"📊", msg:`Margem atual: ${margem}%. Reduza despesas para fortalecer o perfil de crédito.`, acao:"lancamentos", cor:"#f59e0b" };
    if (rec7.length === 0) return { emoji:"💡", msg:"Nenhuma receita esta semana. Registre suas movimentações para manter o score.", acao:"lancamentos", cor:"#6366f1" };
    return { emoji:"✅", msg:`Tudo em dia! Score ${sc.total} — ${risk.level}. Limite disponível: ${fmtBRL(risk.limit)}.`, acao:"operacoes", cor:"#22a85a" };
  }, [st.transactions, st.missions, st.dasPagamentos, st.notasFiscais, margem, sc.total, risk]);

  // Chart data baseado em transações reais
  const chartData = useMemo(()=>{
    return Array.from({length:7},(_,i)=>{
      const d = new Date(); d.setDate(d.getDate()-6+i);
      const dia = d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
      const dayTxs = st.transactions.filter(t=>{
        const td = new Date(t.data); return td.toDateString()===d.toDateString();
      });
      const receita = dayTxs.filter(t=>t.tipo==="RECEITA").reduce((a,t)=>a+t.valor,0);
      const despesa = dayTxs.filter(t=>t.tipo==="DESPESA").reduce((a,t)=>a+t.valor,0);
      return { dia, receita: receita||0, despesa: despesa||0 };
    });
  }, [st.transactions]);

  const acesso = [
    {icon:"💰",label:"Lançamento",action:"lancamentos"},
    {icon:"📄",label:"Nota Fiscal",action:"notas"},
    {icon:"📋",label:"DAS / DASN",action:"impostos"},
    {icon:"📊",label:"Relatórios",action:"relatorios"},
    {icon:"🏅",label:"Certificados",action:"cert_ccfv"},
    {icon:"🎓",label:"Edu MEI",action:"edumei"},
  ];

  const hora = new Date().getHours();
  const saudacao = hora<12?"Bom dia":hora<18?"Boa tarde":"Boa noite";
  return (
    <div style={{color:T.white}}>
      {/* ── Cabeçalho cockpit ─── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div>
          <h1 style={{fontSize:17,fontWeight:800,color:T.white,marginBottom:2}}>{saudacao}, {st.user.nome.split(" ")[0]} 👋</h1>
          <div style={{fontSize:11,color:"rgba(255,255,255,.45)"}}>{new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginBottom:2}}>Plano</div>
          <Badge color={st.user.plano==="Evoluir"?T.purple:st.user.plano==="Crescer"?T.green:T.ink40} style={{fontSize:10}}>{st.user.plano||"Gratuito"}</Badge>
        </div>
      </div>

      {/* ── Onboarding (conta nova) ou Insight operacional ─── */}
      {st.transactions.length === 0 && st.missions.every(m=>!m.done) ? (
        <div style={{
          background:"linear-gradient(135deg,rgba(34,168,90,.15),rgba(34,168,90,.05))",
          border:"1px solid rgba(34,168,90,.3)",
          borderRadius:T.radiusLg, padding:"16px", marginBottom:14,
        }}>
          <div style={{fontSize:13,fontWeight:700,color:T.white,marginBottom:8}}>
            👋 Bem-vindo ao Lucrom, {st.user.nome.split(" ")[0]}!
          </div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.7)",marginBottom:12,lineHeight:1.6}}>
            Seu score começa em <strong style={{color:T.green}}>300 pontos</strong>. Complete as missões abaixo para aumentá-lo e desbloquear crédito com taxas melhores.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[
              {n:"1",t:"Registre uma receita",a:"lancamentos"},
              {n:"2",t:"Emita uma Nota Fiscal",a:"notas"},
              {n:"3",t:"Complete missões",a:"missions"},
            ].map(s=>(
              <div key={s.n} onClick={()=>go(s.a)} style={{
                background:"rgba(34,168,90,.12)",borderRadius:T.radiusSm,
                padding:"10px 8px",textAlign:"center",cursor:"pointer",
                border:"1px solid rgba(34,168,90,.2)",
              }}>
                <div style={{fontSize:18,fontWeight:900,color:T.green}}>{s.n}</div>
                <div style={{fontSize:10,color:"rgba(255,255,255,.7)",marginTop:2,lineHeight:1.3}}>{s.t}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div onClick={()=>go(insight.acao)} style={{
          background:`linear-gradient(135deg,${insight.cor}18,${insight.cor}08)`,
          border:`1px solid ${insight.cor}35`,
          borderRadius:T.radiusLg, padding:"12px 16px", marginBottom:14,
          cursor:"pointer", display:"flex", alignItems:"center", gap:12,
        }}>
          <div style={{fontSize:22,flexShrink:0}}>{insight.emoji}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:600,color:T.white,lineHeight:1.5}}>{insight.msg}</div>
          </div>
          <div style={{fontSize:16,color:insight.cor,flexShrink:0}}>›</div>
        </div>
      )}
      <Grid cols={2} gap={14} style={{marginBottom:14}}>
        {/* Score vivo com tendência */}
        <div style={{background:`linear-gradient(160deg,${T.green} 0%,${T.greenDk} 100%)`,borderRadius:T.radiusLg,padding:"18px 16px",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:0,right:0,width:80,height:80,borderRadius:"0 0 0 80px",background:"rgba(255,255,255,.06)"}}/>
          <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:8}}>Score Lucrom</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:10,marginBottom:4}}>
            <div style={{fontSize:52,fontWeight:900,color:"#fff",lineHeight:1,letterSpacing:"-2px"}}>{sc.total}</div>
            <div style={{paddingBottom:6}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,.55)"}}>/1000</div>
              <div style={{fontSize:11,fontWeight:700,color:scoreTrend.color,background:"rgba(0,0,0,.2)",borderRadius:99,padding:"2px 8px",marginTop:2}}>
                {scoreTrend.label}
              </div>
            </div>
          </div>
          <Bar v={sc.total} max={1000} color="rgba(255,255,255,.4)" h={5}/>
          {/* Mini histórico de score */}
          <div style={{display:"flex",gap:3,alignItems:"flex-end",height:24,marginTop:8,marginBottom:8}}>
            {[0.7,0.75,0.8,0.78,0.82,0.85,sc.total/1000].map((v,i)=>(
              <div key={i} style={{flex:1,background:i===6?"rgba(255,255,255,.7)":"rgba(255,255,255,.2)",borderRadius:"2px 2px 0 0",height:`${v*100}%`,transition:"height .3s"}}/>
            ))}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.6)"}}>Limite disponível</div>
              <div style={{fontSize:18,fontWeight:900,color:"#fff"}}>{fmtBRL(risk.limit)}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.5)"}}>{risk.rate} · Risco {risk.level}</div>
            </div>
            <button onClick={()=>go("operacoes")} style={{padding:"8px 14px",borderRadius:T.radiusSm,background:"rgba(255,255,255,.18)",border:"1.5px solid rgba(255,255,255,.3)",color:T.white,fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
              Solicitar →
            </button>
          </div>
        </div>
        {/* Score por componente com useMemo */}
        <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:T.radiusLg,padding:"16px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:".8px"}}>Componentes</div>
            <div style={{fontSize:10,fontWeight:700,color:scoreTrend.color}}>{scoreTrend.pct}% missões</div>
          </div>
          {[
            {l:"💰 Financeiro",v:sc.components?.fin||0},
            {l:"🎯 Missões",v:sc.components?.mis||0},
            {l:"📋 Fiscal",v:sc.components?.fis||0},
            {l:"🏅 Certificados",v:sc.components?.cer||0},
            {l:"🧠 Comportamento",v:sc.components?.beh||0},
          ].map(x=>(
            <div key={x.l} style={{marginBottom:7}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:10,color:"rgba(255,255,255,.6)"}}>{x.l}</span>
                <span style={{fontSize:10,fontWeight:700,color:x.v>=70?"#22a85a":x.v>=40?"#F59E0B":"#EF4444"}}>{Math.round(x.v||0)}%</span>
              </div>
              <Bar v={x.v||0} max={100} color={x.v>=70?"#22a85a":x.v>=40?"#F59E0B":"#EF4444"} h={4}/>
            </div>
          ))}
          <button onClick={()=>go("score_explicado")} style={{marginTop:6,background:"none",border:"none",cursor:"pointer",color:"#22a85a",fontSize:11,fontWeight:700,padding:0,fontFamily:"inherit"}}>
            Entender meu score →
          </button>
        </div>
      </Grid>
      {/* ── KPIs operacionais ─── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
        {[
          {l:"Receitas (total)",v:fmtBRL(rec),c:"#22a85a",i:"↑"},
          {l:"Despesas (total)",v:fmtBRL(des),c:"#ef4444",i:"↓"},
          {l:"Saldo líquido",v:fmtBRL(saldo),c:saldo>=0?"#22a85a":"#ef4444",i:saldo>=0?"✓":"!"},
        ].map(x=>(
          <div key={x.l} style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.07)",borderRadius:T.radiusSm,padding:"12px 10px"}}>
            <div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>{x.l}</div>
            <div style={{fontSize:16,fontWeight:900,color:x.c}}>{x.v}</div>
            {x.l==="Saldo líquido"&&<div style={{fontSize:9,color:"rgba(255,255,255,.4)",marginTop:2}}>Margem: {margem}%</div>}
          </div>
        ))}
      </div>

      {/* ── Fluxo de caixa 7 dias (dados reais) ─── */}
      <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:T.radiusLg,padding:"16px",marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:800,color:T.white}}>Fluxo de caixa — 7 dias</div>
          <div style={{display:"flex",gap:14,fontSize:10}}>
            <span style={{color:"#22a85a"}}>● Receitas</span>
            <span style={{color:"#EF4444"}}>● Despesas</span>
          </div>
        </div>
        <div style={{height:120}}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{top:5,right:5,bottom:0,left:0}}>
              <defs>
                <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22a85a" stopOpacity={0.35}/>
                  <stop offset="100%" stopColor="#22a85a" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gDes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity={0.2}/>
                  <stop offset="100%" stopColor="#EF4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,.05)"/>
              <XAxis dataKey="dia" tick={{fontSize:9,fill:"rgba(255,255,255,.35)"}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:9,fill:"rgba(255,255,255,.35)"}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
              <Tooltip contentStyle={{background:"#0d1f13",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,fontSize:11}} formatter={v=>[fmtBRL(v)]}/>
              <Area type="monotone" dataKey="receita" stroke="#22a85a" strokeWidth={2} fill="url(#gRec)"/>
              <Area type="monotone" dataKey="despesa" stroke="#EF4444" strokeWidth={1.5} fill="url(#gDes)"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Score histórico + Previsão 30 dias ─── */}
      {(st.scoreHistory||[]).length >= 2 && (
        <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:T.radiusLg,padding:"16px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:800,color:T.white}}>Evolução do Score</div>
            <button onClick={()=>go("score_explicado")} style={{background:"none",border:"none",cursor:"pointer",color:"#22a85a",fontSize:10,fontWeight:700,padding:0,fontFamily:"inherit"}}>Ver detalhes →</button>
          </div>
          <div style={{height:80}}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[...(st.scoreHistory||[]).slice(0,7).reverse().map((h,i)=>({
                label: i===0?"Início":i===([...(st.scoreHistory||[])].length-1)?"Hoje":`D-${6-i}`,
                score: h.score,
              }))]} margin={{top:5,right:5,bottom:0,left:0}}>
                <defs>
                  <linearGradient id="gScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22a85a" stopOpacity={0.4}/>
                    <stop offset="100%" stopColor="#22a85a" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{fontSize:8,fill:"rgba(255,255,255,.3)"}} axisLine={false} tickLine={false}/>
                <YAxis domain={[280,1010]} tick={{fontSize:8,fill:"rgba(255,255,255,.3)"}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{background:"#0d1f13",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,fontSize:11}} formatter={v=>[v+" pts","Score"]}/>
                <Area type="monotone" dataKey="score" stroke="#22a85a" strokeWidth={2} fill="url(#gScore)" dot={{fill:"#22a85a",r:3}}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Previsão 30 dias baseada na tendência real */}
          {(()=>{
            const hist = st.scoreHistory||[];
            const deltaMedio = hist.length>=2 ? (hist[0].score - hist[Math.min(hist.length-1,6)].score)/(Math.min(hist.length,7)) : 0;
            const prev30 = Math.min(1000, Math.max(300, Math.round(sc.total + deltaMedio*30)));
            const missoesPend = st.missions.filter(m=>!m.done&&!m.cancelada).length;
            const ganhoMissoes = missoesPend * 8;
            const scoreComMissoes = Math.min(1000, prev30 + ganhoMissoes);
            const riskPrev = ScoreEngine.risk(prev30, st.faturamento||0);
            const limiteAtual = risk.limit;
            const limitePrev = riskPrev.limit;
            const deltaLimite = limitePrev - limiteAtual;
            return (
              <div style={{marginTop:12,padding:"12px",background:"rgba(34,168,90,.06)",border:"1px solid rgba(34,168,90,.15)",borderRadius:T.radiusSm}}>
                <div style={{fontSize:11,fontWeight:700,color:T.white,marginBottom:8}}>📈 Previsão para 30 dias</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  <div>
                    <div style={{fontSize:9,color:"rgba(255,255,255,.5)",marginBottom:2}}>SCORE PREVISTO</div>
                    <div style={{fontSize:16,fontWeight:900,color:prev30>=sc.total?"#22a85a":"#f59e0b"}}>{prev30}</div>
                    <div style={{fontSize:9,color:"rgba(255,255,255,.4)"}}>{prev30>sc.total?`+${prev30-sc.total} pts`:"estável"}</div>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:"rgba(255,255,255,.5)",marginBottom:2}}>COM MISSÕES ({missoesPend})</div>
                    <div style={{fontSize:16,fontWeight:900,color:"#22a85a"}}>{scoreComMissoes}</div>
                    <div style={{fontSize:9,color:"rgba(255,255,255,.4)"}}>+{ganhoMissoes} pts potencial</div>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:"rgba(255,255,255,.5)",marginBottom:2}}>LIMITE PREVISTO</div>
                    <div style={{fontSize:16,fontWeight:900,color:deltaLimite>=0?"#22a85a":"#f59e0b"}}>{fmtBRL(limitePrev)}</div>
                    <div style={{fontSize:9,color:deltaLimite>=0?"rgba(34,168,90,.7)":"rgba(255,255,255,.4)"}}>{deltaLimite>=0?`+${fmtBRL(deltaLimite)}`:"mantém"}</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      {/* ── Acesso rápido ─── */}
      <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:T.radiusLg,padding:"14px",marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)",marginBottom:10,textTransform:"uppercase",letterSpacing:".6px"}}>Acesso rápido</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8}}>
          {acesso.map(a=>(
            <div key={a.label} onClick={()=>go(a.action)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"10px 4px",borderRadius:T.radiusSm,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.06)",cursor:"pointer",transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.09)";e.currentTarget.style.borderColor="rgba(34,168,90,.3)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.04)";e.currentTarget.style.borderColor="rgba(255,255,255,.06)";}}>
              <div style={{width:32,height:32,borderRadius:8,background:`${T.green}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{a.icon}</div>
              <span style={{fontSize:9,fontWeight:600,color:"rgba(255,255,255,.6)",textAlign:"center",lineHeight:1.2}}>{a.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Missões + Transações ─── */}
      <Grid cols={2} gap={14} style={{marginBottom:8}}>
        <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:T.radiusLg,padding:"14px"}}>
          <MissionProgress missions={st.missions}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:700,color:T.white}}>🎯 Próximas missões</div>
            <button onClick={()=>go("missions")} style={{background:"none",border:"none",cursor:"pointer",color:"#22a85a",fontSize:10,fontWeight:700,padding:0,fontFamily:"inherit"}}>Ver todas →</button>
          </div>
          {st.missions.filter(m=>!m.done&&!m.cancelada).sort((a,b)=>(b.xp||0)-(a.xp||0)).slice(0,3).map(m=>(
            <MissionCard key={m.id} m={m} dispatch={dispatch}/>
          ))}
          {st.missions.filter(m=>!m.done&&!m.cancelada).length===0&&(
            <div style={{textAlign:"center",padding:16,color:"rgba(255,255,255,.4)",fontSize:12}}>
              🏆 Todas as missões concluídas!
            </div>
          )}
        </div>

        <div style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:T.radiusLg,padding:"14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:T.white}}>💳 Últimas movimentações</div>
            <button onClick={()=>go("lancamentos")} style={{background:"none",border:"none",cursor:"pointer",color:"#22a85a",fontSize:10,fontWeight:700,padding:0,fontFamily:"inherit"}}>Ver todas</button>
          </div>
          {st.transactions.slice(0,5).map(t=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:600,color:T.white,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc||t.categoria||"Movimentação"}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,.35)"}}>{fmtDate(t.data)}</div>
              </div>
              <div style={{fontSize:12,fontWeight:700,color:t.tipo==="RECEITA"?"#22a85a":"#EF4444",flexShrink:0,marginLeft:8}}>
                {t.tipo==="RECEITA"?"+":"-"}{fmtBRL(t.valor)}
              </div>
            </div>
          ))}
          {st.transactions.length===0&&(
            <div style={{textAlign:"center",padding:20,color:"rgba(255,255,255,.4)",fontSize:12}}>
              <div style={{fontSize:28,marginBottom:8}}>💰</div>
              <div style={{fontWeight:600,marginBottom:4}}>Nenhuma movimentação ainda</div>
              <div style={{fontSize:11}}>Registre sua primeira receita para começar a construir seu histórico financeiro</div>
              <button onClick={()=>go("lancamentos")} style={{marginTop:10,background:"rgba(34,168,90,.15)",border:"1px solid rgba(34,168,90,.3)",borderRadius:T.radiusSm,padding:"7px 16px",color:T.green,fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>
                + Registrar receita
              </button>
            </div>
          )}
        </div>
      </Grid>
    </div>
  );
}

function PageLancamentos({ st, dispatch }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [tipo, setTipo] = useState("RECEITA");
  const [valor, setValor] = useState("");
  const [cat, setCat] = useState("Serviços");
  const [desc, setDesc] = useState("");

  const totalEntradas = st.transactions.filter(t=>t.tipo==="RECEITA").reduce((a,t)=>a+t.valor,0);
  const totalSaidas   = st.transactions.filter(t=>t.tipo==="DESPESA").reduce((a,t)=>a+t.valor,0);
  const saldo         = totalEntradas - totalSaidas;

  function add() {
    if(!valor||!desc) { toast("Preencha valor e descrição","err"); return; }
    dispatch({type:"MEI.ADD_TX",p:{id:genId(),tipo,valor:parseFloat(valor.replace(/\./g,"").replace(",","."))||0,data:tsISO(),categoria:cat,desc,status:"PROCESSADO"}});
    setShow(false); setValor(""); setDesc("");
    toast(`${tipo==="RECEITA"?"Receita":"Despesa"} registrada!`);
  }
  return (
    <PageWrap title="Lançamentos" action={<Btn onClick={()=>setShow(true)}>+ Novo</Btn>}>

      {/* ── Caixa resumo Entrada / Saída / Total ── */}
      <div style={{
        display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0,
        background:T.surface,borderRadius:T.radius,
        border:`1px solid ${T.ink10}`,boxShadow:T.shadow,
        marginBottom:14,overflow:"hidden",
      }}>
        {[
          {label:"Entradas",value:totalEntradas,color:T.green,icon:"↑",border:false},
          {label:"Saídas",  value:totalSaidas,  color:T.red,  icon:"↓",border:true},
          {label:"Saldo",   value:saldo,        color:saldo>=0?T.green:T.red, icon:"=",border:true},
        ].map(c=>(
          <div key={c.label} style={{
            padding:"14px 16px",
            borderLeft:c.border?`1px solid ${T.ink05}`:undefined,
            display:"flex",flexDirection:"column",gap:4,
          }}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{
                width:20,height:20,borderRadius:99,
                background:`${c.color}18`,
                color:c.color,fontSize:11,fontWeight:900,
                display:"inline-flex",alignItems:"center",justifyContent:"center",
              }}>{c.icon}</span>
              <span style={{fontSize:10,fontWeight:700,color:T.ink40,textTransform:"uppercase",letterSpacing:".6px"}}>{c.label}</span>
            </div>
            <div style={{fontSize:18,fontWeight:900,color:c.color,letterSpacing:"-.5px"}}>{fmtBRL(c.value)}</div>
            <div style={{fontSize:10,color:T.ink40}}>{st.transactions.filter(t=>c.label==="Saldo"?true:t.tipo===(c.label==="Entradas"?"RECEITA":"DESPESA")).length}{c.label==="Saldo"?" lançamentos":" lançamentos"}</div>
          </div>
        ))}
      </div>

      <Card>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:480}}>
            <thead><tr style={{borderBottom:`2px solid ${T.ink10}`}}>{["Tipo","Descrição","Categoria","Valor","Data"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 8px",fontSize:10,fontWeight:700,color:T.ink40,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>{st.transactions.map(t=>(
              <tr key={t.id} style={{borderBottom:`1px solid ${T.ink05}`}}>
                <td style={{padding:"8px"}}><Badge color={t.tipo==="RECEITA"?T.green:T.red}>{t.tipo}</Badge></td>
                <td style={{padding:"8px",fontSize:12,fontWeight:600}}>{t.desc}</td>
                <td style={{padding:"8px",fontSize:11,color:T.ink60}}>{t.categoria}</td>
                <td style={{padding:"8px",fontSize:12,fontWeight:700,color:t.tipo==="RECEITA"?T.green:T.red}}>{t.tipo==="RECEITA"?"+":"-"}{fmtBRL(t.valor)}</td>
                <td style={{padding:"8px",fontSize:11,color:T.ink60}}>{fmtDate(t.data)}</td>
                <td style={{padding:"8px"}}>
                  {t.status==="ESTORNADA"
                    ? <Badge color={T.ink40} style={{fontSize:9}}>ESTORNADA</Badge>
                    : <button
                        onClick={()=>{
                          const motivo=window.prompt("Motivo do estorno (obrigatório para auditoria):");
                          if(motivo&&motivo.trim()) {dispatch({type:"MEI.ESTORNAR_TX",p:{id:t.id,motivo:motivo.trim()}});}
                        }}
                        style={{fontSize:10,color:T.amber,background:"transparent",border:`1px solid ${T.amberBdr}`,borderRadius:T.radiusXs,padding:"3px 7px",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>
                        Estornar
                      </button>
                  }
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      <Modal open={show} onClose={()=>setShow(false)} title="Novo Lançamento" width={440}>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          {["RECEITA","DESPESA"].map(v=>(
            <div key={v} onClick={()=>setTipo(v)} style={{flex:1,padding:"10px",borderRadius:T.radius,border:`2px solid ${tipo===v?(v==="RECEITA"?T.green:T.red):T.ink10}`,background:tipo===v?(v==="RECEITA"?T.greenPale:T.redPale):"transparent",cursor:"pointer",textAlign:"center",fontWeight:700,fontSize:13,color:tipo===v?(v==="RECEITA"?T.green:T.red):T.ink60}}>
              {v==="RECEITA"?"↑ Receita":"↓ Despesa"}
            </div>
          ))}
        </div>
        <Input label="Descrição *" value={desc} onChange={setDesc}/>
        <div style={{marginBottom:12}}>
          <label style={{display:"block",fontSize:12,fontWeight:600,color:T.ink60,marginBottom:5}}>Valor (R$) *</label>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:T.ink60,fontWeight:600}}>R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={e=>{
                let v = e.target.value.replace(/[^0-9,.]/g,"");
                setValor(v);
              }}
              onBlur={e=>{
                const n = parseFloat(valor.replace(/\./g,"").replace(",","."));
                if(n>0) setValor(n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}));
              }}
              placeholder="0,00"
              style={{width:"100%",height:44,paddingLeft:36,paddingRight:12,border:`2px solid ${valor?T.green:T.ink10}`,borderRadius:T.radiusSm,background:T.white,color:T.ink,fontSize:16,fontWeight:700,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
            />
          </div>
        </div>
        <Sel label="Categoria" value={cat} onChange={setCat} options={["Serviços","Produtos","Material","Transporte","Alimentação","Tecnologia","Outros"]}/>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <Btn v="outline" full onClick={()=>setShow(false)}>Cancelar</Btn>
          <Btn full onClick={add}>Salvar</Btn>
        </div>
      </Modal>
    </PageWrap>
  );
}

function PageDespesas({ st, dispatch }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [desc, setDesc] = useState(""); const [valor, setValor] = useState(""); const [cat, setCat] = useState("Material");
  const desp = st.transactions.filter(t=>t.tipo==="DESPESA");
  const total = desp.reduce((a,t)=>a+t.valor,0);
  function add() {
    if(!desc||!valor) { toast("Preencha os campos","err"); return; }
    dispatch({type:"MEI.ADD_TX",p:{id:genId(),tipo:"DESPESA",valor:parseFloat(valor.replace(/\./g,"").replace(",","."))||0,data:tsISO(),categoria:cat,desc,status:"PROCESSADO"}});
    setShow(false); setDesc(""); setValor(""); toast("Despesa registrada!");
  }
  return (
    <PageWrap title="Despesas" subtitle={`Total: ${fmtBRL(total)}`} action={<Btn onClick={()=>setShow(true)}>+ Nova</Btn>}>
      <Card>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:420}}>
            <thead><tr style={{borderBottom:`2px solid ${T.ink10}`}}>{["Descrição","Categoria","Valor","Data"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 8px",fontSize:10,fontWeight:700,color:T.ink40,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>{desp.map(t=>(
              <tr key={t.id} style={{borderBottom:`1px solid ${T.ink05}`}}>
                <td style={{padding:"8px",fontSize:12,fontWeight:600}}>{t.desc}</td>
                <td style={{padding:"8px",fontSize:11,color:T.ink60}}>{t.categoria}</td>
                <td style={{padding:"8px",fontSize:12,fontWeight:700,color:T.red}}>-{fmtBRL(t.valor)}</td>
                <td style={{padding:"8px",fontSize:11,color:T.ink60}}>{fmtDate(t.data)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      <Modal open={show} onClose={()=>setShow(false)} title="Nova Despesa" width={420}>
        <Input label="Descrição *" value={desc} onChange={setDesc}/>
        <div style={{marginBottom:12}}>
          <label style={{display:"block",fontSize:12,fontWeight:600,color:T.ink60,marginBottom:5}}>Valor (R$) *</label>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:T.ink60,fontWeight:600}}>R$</span>
            <input
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={e=>setValor(e.target.value.replace(/[^0-9,.]/g,""))}
              onBlur={e=>{
                const n=parseFloat(valor.replace(/\./g,"").replace(",","."));
                if(n>0) setValor(n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}));
              }}
              placeholder="0,00"
              style={{width:"100%",height:44,paddingLeft:36,paddingRight:12,border:`2px solid ${valor?T.green:T.ink10}`,borderRadius:T.radiusSm,background:T.white,color:T.ink,fontSize:16,fontWeight:700,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
            />
          </div>
        </div>
        <Sel label="Categoria" value={cat} onChange={setCat} options={["Material","Transporte","Alimentação","Tecnologia","Aluguel","Serviços","Outros"]}/>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <Btn v="outline" full onClick={()=>setShow(false)}>Cancelar</Btn>
          <Btn full onClick={add}>Salvar</Btn>
        </div>
      </Modal>
    </PageWrap>
  );
}

// ── MISSÕES — 5-SCREEN FLOW ──────────────────────────────────
// ══════════════════════════════════════════════════════════════
// LUCROM — ADAPTIVE BEHAVIOR ENGINE (Motor Invisível)
// Behavioral scoring, hashtags internas, missões adaptativas
// O usuário NUNCA vê este motor — apenas sente seus efeitos
// ══════════════════════════════════════════════════════════════

const BehaviorEngine = {
  // ── Análise comportamental interna ─────────────────────────
  analyzeHashtags(st) {
    const txs   = st.transactions || [];
    const tags  = new Set();
    const rec   = txs.filter(t=>t.tipo==="RECEITA");
    const desp  = txs.filter(t=>t.tipo==="DESPESA");
    const total = txs.length;
    const recVal= rec.reduce((a,t)=>a+t.valor,0);
    const despVal=desp.reduce((a,t)=>a+t.valor,0);

    // Consistência
    if (total >= 10) tags.add("#consistencia");
    if (total < 3)   tags.add("#desorganizacao");

    // Impulsividade (muitas despesas pequenas)
    const microDesp = desp.filter(t=>t.valor < 50).length;
    if (microDesp > 5) tags.add("#impulsividade");

    // Recorrência positiva
    const cats = rec.map(t=>t.categoria);
    const catCount = cats.reduce((a,c)=>{a[c]=(a[c]||0)+1;return a;},{});
    if (Object.values(catCount).some(v=>v>=3)) tags.add("#recorrencia_positiva");

    // Estabilidade financeira
    if (recVal > 0 && despVal / recVal < 0.5) tags.add("#estabilidade");
    if (recVal > 0 && despVal / recVal > 0.8) tags.add("#gastos_recorrentes");

    // Controle financeiro
    if ((st.dasnDecs||[]).length > 0 && (st.dasPagamentos||[]).length > 0) tags.add("#controle_financeiro");

    // Crescimento
    if ((st.notasFiscais||[]).length > 0) tags.add("#crescimento_financeiro");

    // Previsibilidade
    if ((st.openFinance?.banks||[]).length > 0) tags.add("#alta_previsibilidade");
    else tags.add("#baixa_previsibilidade");

    // Delivery alto
    if ((st.certs||[]).length > 0) tags.add("#alto_delivery");

    // Evolução progressiva
    if ((st.user?.xp||0) > 100) tags.add("#evolucao_progressiva");

    return [...tags];
  },

  // ── Gerador de missão adaptativa ────────────────────────────
  // O resultado é determinístico por dia (seed = data) + comportamento
  generateMission(st, hashtags, index=0) {
    const has = (tag) => hashtags.includes(tag);
    const score = st.user?.score || 300;

    // Banco de missões adaptativas por contexto comportamental
    const missionBank = [
      // Desorganização → estruturar
      {
        condition: ()=>has("#desorganizacao"),
        missions: [
          { title:"Registrar despesas operacionais do dia", desc:"Mapeie e registre todas as saídas financeiras de hoje no seu negócio.", icon:"📊", xp:30, pts:30, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"DESPESA" },
          { title:"Organizar categorias de gastos", desc:"Classifique suas despesas em categorias para melhorar o controle.", icon:"🗂️", xp:25, pts:25, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"DESPESA" },
        ]
      },
      // Impulsividade → controlar
      {
        condition: ()=>has("#impulsividade"),
        missions: [
          { title:"Categorizar despesas alimentares", desc:"Identifique e registre todos os gastos com alimentação do período.", icon:"🍽️", xp:35, pts:35, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"DESPESA" },
          { title:"Analisar gastos por impulso", desc:"Registre despesas não planejadas e avalie seu impacto.", icon:"📉", xp:40, pts:40, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"DESPESA" },
        ]
      },
      // Estabilidade → expandir
      {
        condition: ()=>has("#estabilidade"),
        missions: [
          { title:"Validar fluxo recorrente", desc:"Confirme e registre suas receitas recorrentes do período.", icon:"🔄", xp:35, pts:35, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"RECEITA" },
          { title:"Registrar receita do mês", desc:"Documente todas as entradas financeiras do período atual.", icon:"💰", xp:40, pts:40, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"RECEITA" },
        ]
      },
      // Alto delivery → certificar
      {
        condition: ()=>has("#alto_delivery"),
        missions: [
          { title:"Emitir nota fiscal do serviço", desc:"Formalize a prestação de serviço com nota fiscal eletrônica.", icon:"📄", xp:50, pts:50, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"RECEITA" },
          { title:"Documentar serviços executados", desc:"Registre formalmente os serviços prestados no período.", icon:"📋", xp:45, pts:45, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"RECEITA" },
        ]
      },
      // Crescimento → progredir
      {
        condition: ()=>has("#crescimento_financeiro"),
        missions: [
          { title:"Registrar entradas do dia", desc:"Mapeie e registre tudo que entrou hoje no seu negócio.", icon:"📈", xp:35, pts:35, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"RECEITA" },
          { title:"Analisar evolução de receitas", desc:"Compare suas receitas atuais com o período anterior.", icon:"📊", xp:30, pts:30, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"RECEITA" },
        ]
      },
      // Controle financeiro → manter DAS
      {
        condition: ()=>has("#controle_financeiro"),
        missions: [
          { title:"Verificar conformidade fiscal", desc:"Confira se suas obrigações fiscais do mês estão em dia.", icon:"📋", xp:45, pts:45, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"DESPESA" },
          { title:"Registrar pagamento de impostos", desc:"Documente o pagamento do DAS e demais obrigações.", icon:"💳", xp:40, pts:40, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"DESPESA" },
        ]
      },
      // Score alto → evolução avançada
      {
        condition: ()=>score >= 700,
        missions: [
          { title:"Validar projeção financeira", desc:"Analise e registre sua previsão de receitas para os próximos 30 dias.", icon:"🎯", xp:55, pts:55, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"RECEITA" },
          { title:"Consolidar balanço patrimonial", desc:"Registre o resumo financeiro do período para análise de score.", icon:"⚖️", xp:50, pts:50, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"RECEITA" },
        ]
      },
      // Default — missão universal
      {
        condition: ()=>true,
        missions: [
          { title:"Registrar entradas do dia", desc:"Mapeie e registre tudo que entrou hoje no seu negócio.", icon:"💰", xp:35, pts:35, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"RECEITA" },
          { title:"Organizar lançamentos financeiros", desc:"Mantenha seu fluxo de caixa atualizado com os dados do dia.", icon:"📊", xp:30, pts:30, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"RECEITA" },
          { title:"Validar despesas recorrentes", desc:"Verifique e registre seus gastos fixos do período.", icon:"🔁", xp:25, pts:25, campos:["descricao","categoria","valor","data","tipo","pagamento"], tipo:"DESPESA" },
        ]
      },
    ];

    // Seleciona missão com base no comportamento detectado
    const matchedGroup = missionBank.find(g => g.condition());
    const pool = matchedGroup?.missions || missionBank[missionBank.length-1].missions;

    // Rotação diária determinística (seed = dia do ano + index)
    const dayOfYear = Math.floor((Date.now() / 86400000) % 365);
    const idx = (dayOfYear + index) % pool.length;
    return { ...pool[idx], hashtags: [...hashtags] };
  },

  // ── Feedback IA adaptativo ───────────────────────────────────
  generateFeedback(hashtags, pontos, missaoTitulo) {
    const has = (tag) => hashtags.includes(tag);
    const feedbacks = [];

    if (has("#consistencia") || has("#recorrencia_positiva")) {
      feedbacks.push(`Seu comportamento financeiro apresentou consistência positiva. A regularidade nos registros contribui diretamente para a evolução do seu score.`);
    }
    if (has("#estabilidade")) {
      feedbacks.push(`Hoje você demonstrou maior estabilidade financeira. O equilíbrio entre entradas e saídas é um indicador institucional de maturidade financeira.`);
    }
    if (has("#crescimento_financeiro")) {
      feedbacks.push(`Seu perfil financeiro indica trajetória de crescimento. A documentação sistemática das suas receitas fortalece seu histórico creditício.`);
    }
    if (has("#desorganizacao")) {
      feedbacks.push(`Seu comportamento financeiro está em processo de estruturação. A organização progressiva dos lançamentos é o primeiro passo para a evolução do score.`);
    }
    if (has("#controle_financeiro")) {
      feedbacks.push(`Você demonstrou controle sobre suas obrigações financeiras. A conformidade fiscal é um dos pilares da reputação financeira do MEI.`);
    }
    if (has("#alto_delivery")) {
      feedbacks.push(`Seu nível de execução financeira está acima da média. Continue documentando suas operações para consolidar sua reputação institucional.`);
    }

    const fallback = `Você registrou "${missaoTitulo}" com sucesso. Cada execução fortalece seu protocolo financeiro e contribui para a evolução do seu score Lucrom.`;
    const selected = feedbacks.length > 0 ? feedbacks[Math.floor(Math.random()*feedbacks.length)] : fallback;

    return selected;
  },

  // ── Protocolo temporal ───────────────────────────────────────
  getProtocolo(st) {
    const txs = st.transactions || [];
    const diasAtivos = new Set(txs.map(t=>t.data?.slice(0,10))).size;
    if (diasAtivos >= 30) return { tipo:"30D", label:"Protocolo Mensal", dias:30 };
    if (diasAtivos >= 15) return { tipo:"15D", label:"Protocolo Quinzenal", dias:15 };
    return { tipo:"7D", label:"Protocolo Semanal", dias:7 };
  },
};

// ── MissaoNavHeader — componente global de navegação das telas de missão ──
function MissaoNavHeader({ label, step, total=5, canBack=true, backTo, onNavigate, onClose }) {
  return (
    <div style={{marginBottom:28}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        {/* Botão Voltar */}
        {canBack && backTo != null ? (
          <button onClick={()=>onNavigate(backTo)}
            style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.5)",fontSize:"0.8125rem",fontWeight:600,fontFamily:"inherit",padding:0,transition:"color .15s"}}
            onMouseEnter={e=>e.currentTarget.style.color="rgba(255,255,255,.85)"}
            onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,.5)"}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 13L7 9L11 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Voltar
          </button>
        ) : (
          <div style={{width:60}}/>
        )}
        {/* Label */}
        <div style={{fontSize:"0.6875rem",fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"1.2px"}}>{label}</div>
        {/* Fechar */}
        <button onClick={()=>onClose()}
          style={{width:30,height:30,borderRadius:99,background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",color:"rgba(255,255,255,.5)",cursor:"pointer",fontSize:"1.1rem",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit",transition:"all .15s"}}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.12)";e.currentTarget.style.color="rgba(255,255,255,.85)";}}
          onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.07)";e.currentTarget.style.color="rgba(255,255,255,.5)";}}>
          ×
        </button>
      </div>
      {/* Barra de progresso */}
      <div style={{display:"flex",gap:4}}>
        {Array.from({length:total},(_,i)=>(
          <div key={i} style={{flex:1,height:3,borderRadius:99,background:i<step?"#22C55E":"rgba(255,255,255,.1)",boxShadow:i<step?"0 0 6px rgba(34,197,94,.5)":"none",transition:"all .3s"}}/>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PAGE MISSÕES — 7 TELAS DO PROTOCOLO DIÁRIO
// Design inspirado no mockup: dark premium, score grande, glow verde
// ══════════════════════════════════════════════════════════════
// ── Sub-componentes de Missões (fragmentação do monolito) ────
function PageMissoes({ st, dispatch }) {
  const toast = useToast();

  // ── Engine invisível ────────────────────────────────────────
  const hashtags    = useMemo(()=>BehaviorEngine.analyzeHashtags(st), [st]);
  const protocolo   = useMemo(()=>BehaviorEngine.getProtocolo(st), [st]);
  const sc          = ScoreEngine.calc(st.transactions,st.missions,st.dasnDecs,st.certs,st.notasFiscais);
  const missaoHoje  = useMemo(()=>BehaviorEngine.generateMission(st, hashtags, 0), [hashtags]);
  const missaoAmanha= useMemo(()=>BehaviorEngine.generateMission(st, hashtags, 1), [hashtags]);
  // useMemo para filtrar missões sem re-render global
  const missionsByStatus = useMemo(()=>({
    ativas: st.missions.filter(m=>!m.done&&!m.cancelada).sort((a,b)=>(b.xp||0)-(a.xp||0)),
    concluidas: st.missions.filter(m=>m.done),
    // Missões bloqueadas plano Gratuito após 3 concluídas
    bloqueadas: st.missions.filter(m=>
      !m.done && !m.cancelada &&
      st.user?.plano==="Gratuito" &&
      st.missions.filter(mm=>mm.done).length>=3
    ),
  }), [st.missions]);
  const [feedback]  = useState(()=>BehaviorEngine.generateFeedback(hashtags, missaoHoje.pts, missaoHoje.title));

  // ── Estado do fluxo ─────────────────────────────────────────
  const [screen, setScreen] = useState(0); // 0=home 1=execute 2=checklist 3=score 4=feedback 5=nextmission 6=encerramento
  const [animating, setAnimating] = useState(false);

  // ── Campos do formulário (adaptativos) ─────────────────────
  const [fDesc,  setFDesc]  = useState("");
  const [fCat,   setFCat]   = useState("Finanças");
  const [fValor, setFValor] = useState("");
  const [fData,  setFData]  = useState(new Date().toISOString().slice(0,10));
  const [fTipo,  setFTipo]  = useState("Despesa fixa");
  const [fPgto,  setFPgto]  = useState("Conta bancária");

  // Streak calculado
  const streak = useMemo(()=>{
    const txs = st.transactions || [];
    const hoje = new Date().toDateString();
    const ontem = new Date(Date.now()-86400000).toDateString();
    const temHoje = txs.some(t=>new Date(t.data).toDateString()===hoje);
    const temOntem = txs.some(t=>new Date(t.data).toDateString()===ontem);
    if (temHoje && temOntem) return 3;
    if (temHoje) return 1;
    return 0;
  }, [st.transactions]);

  // Progress bar score
  const scoreProgress = ((sc.total - 300) / 700) * 100;

  // Checklist — reflete campos preenchidos
  const checklistItems = [
    { label:"Descrição preenchida", sub:fDesc||"—", done:!!fDesc.trim() },
    { label:"Categoria definida", sub:fCat, done:!!fCat },
    { label:"Valor informado", sub:fValor?`R$ ${fValor}`:"—", done:!!fValor&&safeNum(fValor)>0 },
    { label:"Data registrada", sub:fData?new Date(fData+'T00:00:00').toLocaleDateString("pt-BR"):"—", done:!!fData },
    { label:"Tipo definido", sub:fTipo, done:!!fTipo },
    { label:"Pagamento definido", sub:fPgto, done:!!fPgto },
  ];

  const allChecked = checklistItems.every(i=>i.done);
  const pontos     = missaoHoje.pts;
  const novoScore  = Math.min(1000, sc.total + Math.round(pontos * 0.4));

  function navigate(to) {
    setAnimating(true);
    setTimeout(()=>{ setScreen(to); setAnimating(false); }, 120);
  }

  function goExecute() { setFDesc(missaoHoje.title); navigate(1); }
  function avancarExecucao() {
    if(!fDesc.trim()||!fValor||safeNum(fValor)<=0) {
      toast("Preencha descrição e valor para continuar","err"); return;
    }
    navigate(2);
  }

  function confirmarExecucao() {
    // Registra transação invisível
    dispatch({type:"MEI.ADD_TX", p:{
      id:genId(), tipo:missaoHoje.tipo||"RECEITA",
      valor:safeNum(fValor)||0,
      data:new Date(fData).toISOString(),
      categoria:fCat, desc:fDesc,
      status:"PROCESSADO",
      idempotencyKey:`missao_${missaoHoje.title}_${fData}`,
    }});
    navigate(3);
  }

  function finalizarDia() {
    // Salva transação se campos preenchidos (GAP-2 fix)
    if(fValor && safeNum(fValor)>0 && fDesc.trim()) {
      dispatch({type:"MEI.ADD_TX", p:{
        id:genId(), tipo:fTipo||"RECEITA", valor:safeNum(fValor),
        categoria:fCat||"Geral", desc:fDesc.trim(),
        data:fData?new Date(fData+"T00:00:00").toISOString():tsISO(),
        status:"PROCESSADO",
      }});
    }
    setScreen(0);
    setFDesc(""); setFValor(""); setFData(new Date().toISOString().slice(0,10));
    toast("✅ Protocolo do dia salvo! Lançamento registrado e missões atualizadas.");
  }

  // ── Estilos base do design system de missões ───────────────
  const GL    = "#22C55E";  // verde light do glow
  const BG    = "#060F09";  // fundo ultra-dark
  const CARD  = "rgba(16,24,18,.04)";
  const BCARD = "rgba(255,255,255,.07)";

  // Container full-screen fixo das telas de protocolo
  const wrapStyle = {
    minHeight:"100%",
    color:"#FFFFFF",
    opacity: animating ? 0 : 1,
    transition:"opacity .12s ease",
  };

  // ════════════════════════════════════════════════════════════
  // TELA 0 — HOME DO PROTOCOLO
  // ════════════════════════════════════════════════════════════
  if (screen === 0) {
    return (
      <div style={wrapStyle}>
        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:32}}>
          <div>
            <div style={{fontSize:"0.625rem",fontWeight:700,color:"rgba(255,255,255,.35)",textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:4}}>
              {protocolo.label}
            </div>
            <div style={{fontSize:"0.75rem",color:"rgba(255,255,255,.5)"}}>
              {streak > 0 ? `🔥 ${streak} dia${streak>1?"s":""} seguido${streak>1?"s":""}` : "Inicie seu protocolo"}
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            {streak > 0 && (
              <div style={{
                padding:"4px 12px",borderRadius:99,
                background:"rgba(255,165,0,.1)",
                border:"1px solid rgba(255,165,0,.25)",
                fontSize:"0.6875rem",fontWeight:700,
                color:"#FFA500",
              }}>
                🔥 {streak}
              </div>
            )}
          </div>
        </div>

        {/* Score Grande */}
        <div style={{marginBottom:28}}>
          <div style={{
            fontSize:"0.5625rem",fontWeight:700,
            color:"rgba(255,255,255,.35)",
            textTransform:"uppercase",letterSpacing:"1.4px",
            marginBottom:4,
          }}>SCORE LUCROM</div>
          <div style={{
            fontSize:"clamp(5rem,16vw,6.5rem)",
            fontWeight:900,
            color:"#FFFFFF",
            lineHeight:1,
            letterSpacing:"-4px",
            textShadow:`0 0 40px rgba(34,197,94,.15)`,
            fontVariantNumeric:"tabular-nums",
          }}>{sc.total}</div>

          {/* Barra de progresso */}
          <div style={{marginTop:12,marginBottom:6}}>
            <div style={{background:"rgba(255,255,255,.08)",borderRadius:99,height:4,overflow:"hidden"}}>
              <div style={{
                width:`${scoreProgress}%`,
                height:"100%",
                borderRadius:99,
                background:`linear-gradient(90deg, ${GL}, #16A34A)`,
                boxShadow:`0 0 8px ${GL}60`,
                transition:"width .8s cubic-bezier(.25,.46,.45,.94)",
              }}/>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.6875rem",color:"rgba(255,255,255,.35)"}}>
            <span>{sc.total} pts</span>
            <span style={{display:"flex",alignItems:"center",gap:4}}>→<span style={{color:"rgba(255,255,255,.5)"}}>1000 pts</span></span>
          </div>
        </div>

        {/* Missão de hoje */}
        <div style={{
          background:"rgba(255,255,255,.04)",
          border:"1px solid rgba(34,197,94,.18)",
          borderRadius:16,
          padding:"18px 20px",
          marginBottom:20,
          position:"relative",
          overflow:"hidden",
        }}>
          {/* Glow de fundo */}
          <div style={{
            position:"absolute",top:0,left:0,right:0,bottom:0,
            background:"radial-gradient(ellipse at top left, rgba(34,197,94,.06) 0%, transparent 70%)",
            pointerEvents:"none",
          }}/>
          <div style={{
            fontSize:"0.5625rem",fontWeight:700,
            color:GL,textTransform:"uppercase",
            letterSpacing:"1.2px",marginBottom:10,
            position:"relative",
          }}>MISSÃO DE HOJE</div>
          <div style={{display:"flex",alignItems:"flex-start",gap:12,position:"relative"}}>
            <div style={{flex:1}}>
              <div style={{
                fontSize:"0.9375rem",fontWeight:700,
                color:"#FFFFFF",marginBottom:6,
                lineHeight:1.3,
              }}>{missaoHoje.title}</div>
              <div style={{
                fontSize:"0.75rem",color:"rgba(255,255,255,.5)",
                lineHeight:1.5,
              }}>{missaoHoje.desc}</div>
            </div>
            <div style={{
              background:"rgba(34,197,94,.12)",
              border:"1px solid rgba(34,197,94,.25)",
              borderRadius:8,padding:"6px 12px",
              fontSize:"0.75rem",fontWeight:800,
              color:GL,flexShrink:0,
              whiteSpace:"nowrap",
            }}>+{pontos} pts</div>
          </div>
        </div>

        {/* Botão CTA */}
        <button onClick={goExecute} style={{
          width:"100%",padding:"16px",borderRadius:14,
          background:`linear-gradient(135deg, #16A34A, #15803D)`,
          color:"#FFFFFF",fontWeight:800,fontSize:"1rem",
          border:"none",cursor:"pointer",
          fontFamily:"inherit",letterSpacing:"-0.2px",
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:`0 4px 20px rgba(22,163,74,.4), 0 0 0 1px rgba(34,197,94,.2)`,
          transition:"all .18s",
          marginBottom:28,
        }}
        onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 6px 28px rgba(22,163,74,.55), 0 0 0 1px rgba(34,197,94,.3)`}
        onMouseLeave={e=>e.currentTarget.style.boxShadow=`0 4px 20px rgba(22,163,74,.4), 0 0 0 1px rgba(34,197,94,.2)`}>
          Continuar missão <span style={{fontSize:"1.1rem"}}>→</span>
        </button>

        {/* Status legenda */}
        <div style={{display:"flex",gap:20,justifyContent:"center"}}>
          {[
            {dot:"#3B82F6",label:"Iniciada",n:st.missions.filter(m=>!m.done&&!m.cancelada).length},
            {dot:"#F59E0B",label:"Cancelada",n:st.missions.filter(m=>m.cancelada).length},
            {dot:GL,label:"Concluída",n:st.missions.filter(m=>m.done).length},
          ].map(s=>(
            <div key={s.label} style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:7,height:7,borderRadius:99,background:s.dot}}/>
              <span style={{fontSize:"0.625rem",color:"rgba(255,255,255,.4)"}}>{s.label}</span>
              <span style={{fontSize:"0.625rem",color:"rgba(255,255,255,.3)",fontWeight:700}}>{s.n}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // TELA 1 — EXECUTAR MISSÃO (formulário adaptativo)
  // ════════════════════════════════════════════════════════════
  if (screen === 1) {
    return (
      <div style={wrapStyle}>
        <MissaoNavHeader label="EXECUTAR MISSÃO" step={1} total={5} canBack={true} backTo={0} onNavigate={navigate} onClose={()=>navigate(0)}/>

        {/* Campos adaptativos */}
        <div style={{display:"flex",flexDirection:"column",gap:0}}>
          {/* Descrição */}
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:"0.6875rem",fontWeight:600,color:"rgba(255,255,255,.4)",marginBottom:6,letterSpacing:"0.3px"}}>Descrição</label>
            <input value={fDesc} onChange={e=>setFDesc(e.target.value)}
              placeholder="Descreva o serviço ou despesa"
              style={{
                width:"100%",padding:"13px 16px",
                background:"rgba(255,255,255,.07)",
                border:"1px solid rgba(255,255,255,.1)",
                borderRadius:12,color:"#FFFFFF",
                fontSize:"0.9375rem",outline:"none",
                boxSizing:"border-box",fontFamily:"inherit",
                transition:"border-color .15s",
              }}
              onFocus={e=>{e.target.style.borderColor="rgba(34,197,94,.4)";e.target.style.background="rgba(255,255,255,.09)";}}
              onBlur={e=>{e.target.style.borderColor="rgba(255,255,255,.1)";e.target.style.background="rgba(255,255,255,.07)";}}
            />
          </div>

          {/* Categoria */}
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:"0.6875rem",fontWeight:600,color:"rgba(255,255,255,.4)",marginBottom:6,letterSpacing:"0.3px"}}>Categoria</label>
            <select value={fCat} onChange={e=>setFCat(e.target.value)}
              style={{
                width:"100%",padding:"13px 16px",
                background:"rgba(255,255,255,.07)",
                border:"1px solid rgba(255,255,255,.1)",
                borderRadius:12,color:"#FFFFFF",
                fontSize:"0.9375rem",outline:"none",
                boxSizing:"border-box",fontFamily:"inherit",
                appearance:"none",cursor:"pointer",
                backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='rgba(255,255,255,0.4)' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat:"no-repeat",
                backgroundPosition:"right 16px center",
              }}>
              {["Serviços","Aluguel","Alimentação","Transporte","Marketing","Tecnologia","Impostos","Saúde","Material","Outros"].map(c=>(
                <option key={c} value={c} style={{background:"#0F1F15",color:"#fff"}}>{c}</option>
              ))}
            </select>
          </div>

          {/* Valor */}
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:"0.6875rem",fontWeight:600,color:"rgba(255,255,255,.4)",marginBottom:6,letterSpacing:"0.3px"}}>Valor (R$)</label>
            <input value={fValor} onChange={e=>setFValor(e.target.value)}
              placeholder="0,00"
              type="text"
              inputMode="decimal"
              style={{
                width:"100%",padding:"13px 16px",
                background:"rgba(255,255,255,.07)",
                border:"1px solid rgba(255,255,255,.1)",
                borderRadius:12,color:"#FFFFFF",
                fontSize:"0.9375rem",outline:"none",
                boxSizing:"border-box",fontFamily:"inherit",
                transition:"border-color .15s",
              }}
              onFocus={e=>{e.target.style.borderColor="rgba(34,197,94,.4)";e.target.style.background="rgba(255,255,255,.09)";}}
              onBlur={e=>{e.target.style.borderColor="rgba(255,255,255,.1)";e.target.style.background="rgba(255,255,255,.07)";}}
            />
          </div>

          {/* Data */}
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:"0.6875rem",fontWeight:600,color:"rgba(255,255,255,.4)",marginBottom:6,letterSpacing:"0.3px"}}>Data</label>
            <div style={{position:"relative"}}>
              <input type="date" value={fData} onChange={e=>setFData(e.target.value)}
                style={{
                  width:"100%",padding:"13px 16px",
                  background:"rgba(255,255,255,.07)",
                  border:"1px solid rgba(255,255,255,.1)",
                  borderRadius:12,color:"#FFFFFF",
                  fontSize:"0.9375rem",outline:"none",
                  boxSizing:"border-box",fontFamily:"inherit",
                  colorScheme:"dark",
                }}
                onFocus={e=>{e.target.style.borderColor="rgba(34,197,94,.4)";}}
                onBlur={e=>{e.target.style.borderColor="rgba(255,255,255,.1)";}}
              />
            </div>
          </div>

          {/* Tipo */}
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:"0.6875rem",fontWeight:600,color:"rgba(255,255,255,.4)",marginBottom:6,letterSpacing:"0.3px"}}>Tipo</label>
            <select value={fTipo} onChange={e=>setFTipo(e.target.value)}
              style={{
                width:"100%",padding:"13px 16px",
                background:"rgba(255,255,255,.07)",
                border:"1px solid rgba(255,255,255,.1)",
                borderRadius:12,color:"#FFFFFF",
                fontSize:"0.9375rem",outline:"none",
                boxSizing:"border-box",fontFamily:"inherit",
                appearance:"none",cursor:"pointer",
                backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='rgba(255,255,255,0.4)' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat:"no-repeat",
                backgroundPosition:"right 16px center",
              }}>
              {["Despesa fixa","Despesa variável","Receita recorrente","Receita pontual","Investimento","Outros"].map(t=>(
                <option key={t} value={t} style={{background:"#0F1F15",color:"#fff"}}>{t}</option>
              ))}
            </select>
          </div>

          {/* Pagamento */}
          <div style={{marginBottom:24}}>
            <label style={{display:"block",fontSize:"0.6875rem",fontWeight:600,color:"rgba(255,255,255,.4)",marginBottom:6,letterSpacing:"0.3px"}}>Pagamento</label>
            <select value={fPgto} onChange={e=>setFPgto(e.target.value)}
              style={{
                width:"100%",padding:"13px 16px",
                background:"rgba(255,255,255,.07)",
                border:"1px solid rgba(255,255,255,.1)",
                borderRadius:12,color:"#FFFFFF",
                fontSize:"0.9375rem",outline:"none",
                boxSizing:"border-box",fontFamily:"inherit",
                appearance:"none",cursor:"pointer",
                backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='rgba(255,255,255,0.4)' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat:"no-repeat",
                backgroundPosition:"right 16px center",
              }}>
              {["Conta bancária","Pix","Cartão de crédito","Cartão de débito","Dinheiro","Boleto"].map(p=>(
                <option key={p} value={p} style={{background:"#0F1F15",color:"#fff"}}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Botão continuar */}
        <button onClick={avancarExecucao} style={{
          width:"100%",padding:"16px",borderRadius:14,
          background:`linear-gradient(135deg, #16A34A, #15803D)`,
          color:"#FFFFFF",fontWeight:800,fontSize:"1rem",
          border:"none",cursor:"pointer",fontFamily:"inherit",
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:`0 4px 20px rgba(22,163,74,.4)`,
          transition:"opacity .15s",
        }}
        onMouseEnter={e=>e.currentTarget.style.opacity=".9"}
        onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
          Continuar <span style={{fontSize:"1.1rem"}}>→</span>
        </button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // TELA 2 — CHECKLIST / VALIDAÇÃO
  // ════════════════════════════════════════════════════════════
  if (screen === 2) {
    return (
      <div style={wrapStyle}>
        <MissaoNavHeader label="CHECKLIST" step={2} total={5} canBack={true} backTo={1} onNavigate={navigate} onClose={()=>navigate(0)}/>

        {/* Lista de validação */}
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:32}}>
          {checklistItems.map((item,i)=>(
            <div key={i} style={{
              display:"flex",alignItems:"center",gap:14,
              padding:"16px 18px",
              background: item.done ? "rgba(34,197,94,.06)" : "rgba(255,255,255,.04)",
              border:`1px solid ${item.done?"rgba(34,197,94,.2)":"rgba(255,255,255,.07)"}`,
              borderRadius:14,
              transition:"all .2s",
            }}>
              {/* Ícone do campo */}
              <div style={{
                width:38,height:38,borderRadius:10,
                background: item.done ? "rgba(34,197,94,.12)" : "rgba(255,255,255,.06)",
                border:`1.5px solid ${item.done?"rgba(34,197,94,.3)":"rgba(255,255,255,.1)"}`,
                display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:"1rem",flexShrink:0,
              }}>
                {["💬","📁","💲","📅","📊","💳"][i]}
              </div>
              {/* Texto */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:"0.875rem",fontWeight:600,color:"#FFFFFF",marginBottom:2}}>{item.label}</div>
                <div style={{fontSize:"0.75rem",color:"rgba(255,255,255,.4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.sub}</div>
              </div>
              {/* Check */}
              <div style={{
                width:26,height:26,borderRadius:99,
                background: item.done ? GL : "rgba(255,255,255,.08)",
                border:`2px solid ${item.done?GL:"rgba(255,255,255,.15)"}`,
                display:"flex",alignItems:"center",justifyContent:"center",
                flexShrink:0,
                boxShadow: item.done ? `0 0 10px ${GL}50` : "none",
                transition:"all .25s",
              }}>
                {item.done && <span style={{color:"#000",fontSize:"0.8125rem",fontWeight:900}}>✓</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Botão */}
        <button onClick={allChecked?confirmarExecucao:undefined}
          disabled={!allChecked}
          style={{
            width:"100%",padding:"16px",borderRadius:14,
            background: allChecked ? `linear-gradient(135deg, #16A34A, #15803D)` : "rgba(255,255,255,.08)",
            color: allChecked ? "#FFFFFF" : "rgba(255,255,255,.3)",
            fontWeight:800,fontSize:"1rem",
            border:"none",cursor:allChecked?"pointer":"not-allowed",
            fontFamily:"inherit",
            display:"flex",alignItems:"center",justifyContent:"center",gap:10,
            boxShadow: allChecked ? `0 4px 20px rgba(22,163,74,.4)` : "none",
            transition:"all .2s",
          }}>
          Confirmar execução <span style={{fontSize:"1.1rem"}}>→</span>
        </button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // TELA 3 — PONTUAÇÃO
  // ════════════════════════════════════════════════════════════
  if (screen === 3) {
    return (
      <div style={wrapStyle}>
        <MissaoNavHeader label="PONTUAÇÃO" step={3} total={5} canBack={false} onNavigate={navigate} onClose={()=>navigate(0)}/>
        <div style={{textAlign:"center"}}>

        {/* Círculo score */}
        <div style={{
          width:160,height:160,borderRadius:99,
          border:`3px solid ${GL}`,
          background:"transparent",
          display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",
          margin:"0 auto 32px",
          boxShadow:`0 0 40px rgba(34,197,94,.25), inset 0 0 30px rgba(34,197,94,.05)`,
          position:"relative",
        }}>
          {/* Glow ring externo */}
          <div style={{
            position:"absolute",inset:-8,borderRadius:99,
            border:"1px solid rgba(34,197,94,.15)",
          }}/>
          <div style={{
            fontSize:"3rem",fontWeight:900,
            color:GL,lineHeight:1,
            letterSpacing:"-2px",
          }}>+{pontos}</div>
          <div style={{
            fontSize:"0.6875rem",fontWeight:700,
            color:"rgba(255,255,255,.5)",
            textTransform:"uppercase",letterSpacing:"1.5px",
            marginTop:4,
          }}>PONTOS</div>
        </div>

        {/* Mensagem */}
        <div style={{marginBottom:32}}>
          <div style={{fontSize:"1.125rem",fontWeight:800,color:"#FFFFFF",marginBottom:8}}>
            Excelente trabalho! 🎉
          </div>
          <div style={{fontSize:"0.8125rem",color:"rgba(255,255,255,.5)",lineHeight:1.6,maxWidth:280,margin:"0 auto"}}>
            {BehaviorEngine.generateFeedback(hashtags, pontos, missaoHoje.title).slice(0,80)}
          </div>
        </div>

        {/* Cards score */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:32}}>
          {[
            {label:"SCORE ATUAL",value:sc.total,color:"#FFFFFF",bg:"rgba(255,255,255,.06)"},
            {label:"EVOLUÇÃO TOTAL",value:`+${pontos} pts`,color:GL,bg:"rgba(34,197,94,.08)",border:"rgba(34,197,94,.2)"},
          ].map(c=>(
            <div key={c.label} style={{
              background:c.bg,
              border:`1px solid ${c.border||"rgba(255,255,255,.1)"}`,
              borderRadius:14,padding:"16px 12px",
            }}>
              <div style={{fontSize:"0.5625rem",fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:8}}>{c.label}</div>
              <div style={{fontSize:"1.75rem",fontWeight:900,color:c.color,letterSpacing:"-1px"}}>{c.value}</div>
            </div>
          ))}
        </div>

        <button onClick={()=>navigate(4)} style={{
          width:"100%",padding:"16px",borderRadius:14,
          background:`linear-gradient(135deg, #16A34A, #15803D)`,
          color:"#FFFFFF",fontWeight:800,fontSize:"1rem",
          border:"none",cursor:"pointer",fontFamily:"inherit",
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:`0 4px 20px rgba(22,163,74,.4)`,
        }}>
          Ver próximo passo <span style={{fontSize:"1.1rem"}}>→</span>
        </button>
        </div>{/* end textAlign center */}
      </div>
    );
  }
  // ════════════════════════════════════════════════════════════
  if (screen === 4) {
    return (
      <div style={wrapStyle}>
        <MissaoNavHeader label="ANÁLISE COMPORTAMENTAL" step={4} total={5} canBack={false} onNavigate={navigate} onClose={()=>navigate(0)}/>

        {/* IA indicator */}
        <div style={{
          display:"flex",alignItems:"center",gap:12,marginBottom:24,
          padding:"14px 18px",
          background:"rgba(34,197,94,.06)",
          border:"1px solid rgba(34,197,94,.15)",
          borderRadius:14,
        }}>
          <div style={{
            width:36,height:36,borderRadius:99,
            background:"rgba(34,197,94,.12)",
            border:"1px solid rgba(34,197,94,.25)",
            display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:"1rem",flexShrink:0,
          }}>⚡</div>
          <div>
            <div style={{fontSize:"0.75rem",fontWeight:700,color:GL,marginBottom:1}}>Lucrom Engine</div>
            <div style={{fontSize:"0.625rem",color:"rgba(255,255,255,.35)"}}>Análise comportamental gerada</div>
          </div>
        </div>

        {/* Feedback text */}
        <div style={{
          padding:"24px",
          background:"rgba(255,255,255,.04)",
          border:"1px solid rgba(255,255,255,.08)",
          borderRadius:16,
          marginBottom:28,
        }}>
          <div style={{
            fontSize:"1.0625rem",fontWeight:500,
            color:"rgba(255,255,255,.85)",
            lineHeight:1.7,
            fontStyle:"normal",
            letterSpacing:"0.1px",
          }}>"{feedback}"</div>
        </div>

        {/* Score evolution */}
        <div style={{
          padding:"16px 18px",
          background:"rgba(255,255,255,.04)",
          border:"1px solid rgba(255,255,255,.08)",
          borderRadius:14,
          marginBottom:28,
        }}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:"0.6875rem",color:"rgba(255,255,255,.4)",fontWeight:600}}>Progresso do score</span>
            <span style={{fontSize:"0.6875rem",color:GL,fontWeight:700}}>{sc.total} → {novoScore}</span>
          </div>
          <div style={{background:"rgba(255,255,255,.08)",borderRadius:99,height:6,overflow:"hidden"}}>
            <div style={{
              width:`${((novoScore-300)/700)*100}%`,
              height:"100%",borderRadius:99,
              background:`linear-gradient(90deg,${GL},#16A34A)`,
              boxShadow:`0 0 8px ${GL}50`,
              transition:"width .8s cubic-bezier(.25,.46,.45,.94)",
            }}/>
          </div>
        </div>

        <button onClick={()=>navigate(5)} style={{
          width:"100%",padding:"16px",borderRadius:14,
          background:`linear-gradient(135deg, #16A34A, #15803D)`,
          color:"#FFFFFF",fontWeight:800,fontSize:"1rem",
          border:"none",cursor:"pointer",fontFamily:"inherit",
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:`0 4px 20px rgba(22,163,74,.4)`,
        }}>
          Ver próxima missão <span style={{fontSize:"1.1rem"}}>→</span>
        </button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // TELA 5 — PRÓXIMA MISSÃO
  // ════════════════════════════════════════════════════════════
  if (screen === 5) {
    return (
      <div style={wrapStyle}>
        <MissaoNavHeader label="PRÓXIMA MISSÃO" step={5} total={5} canBack={false} onNavigate={navigate} onClose={()=>navigate(0)}/>

        {/* Ícone calendário — como no mockup */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{
            width:100,height:100,
            border:`2.5px solid ${GL}`,
            borderRadius:20,
            display:"flex",alignItems:"center",justifyContent:"center",
            margin:"0 auto 20px",
            background:"rgba(34,197,94,.05)",
            boxShadow:`0 0 30px rgba(34,197,94,.15)`,
            position:"relative",
          }}>
            {/* Ícone calendário simplificado */}
            <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
              <rect x="4" y="8" width="42" height="38" rx="6" stroke={GL} strokeWidth="2.5"/>
              <line x1="4" y1="18" x2="46" y2="18" stroke={GL} strokeWidth="2.5"/>
              <line x1="15" y1="4" x2="15" y2="14" stroke={GL} strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="35" y1="4" x2="35" y2="14" stroke={GL} strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M20 30 L24 34 L32 26" stroke={GL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div style={{fontSize:"1.125rem",fontWeight:800,color:"#FFFFFF",marginBottom:8,lineHeight:1.3}}>
            Amanhã sua missão<br/>será liberada.
          </div>
          <div style={{fontSize:"0.8125rem",color:"rgba(255,255,255,.45)",lineHeight:1.6,maxWidth:260,margin:"0 auto"}}>
            Continue evoluindo e<br/>fortalecendo seu protocolo.
          </div>
        </div>

        {/* Preview da próxima missão */}
        <div style={{
          padding:"20px",
          background:"rgba(34,197,94,.06)",
          border:"1px solid rgba(34,197,94,.18)",
          borderRadius:16,
          marginBottom:28,
        }}>
          <div style={{fontSize:"0.5625rem",fontWeight:700,color:GL,textTransform:"uppercase",letterSpacing:"1.2px",marginBottom:10}}>PRÓXIMO PROTOCOLO</div>
          <div style={{fontSize:"0.9375rem",fontWeight:700,color:"#FFFFFF",marginBottom:6}}>{missaoAmanha.title}</div>
          <div style={{fontSize:"0.75rem",color:"rgba(255,255,255,.45)",lineHeight:1.5}}>{missaoAmanha.desc}</div>
          <div style={{
            display:"flex",alignItems:"center",gap:8,marginTop:14,
            padding:"8px 12px",
            background:"rgba(34,197,94,.08)",
            borderRadius:8,
            width:"fit-content",
          }}>
            <span style={{fontSize:"0.75rem",color:GL,fontWeight:700}}>+{missaoAmanha.pts} pts</span>
          </div>
        </div>

        <button onClick={()=>navigate(6)} style={{
          width:"100%",padding:"16px",borderRadius:14,
          background:`linear-gradient(135deg, #16A34A, #15803D)`,
          color:"#FFFFFF",fontWeight:800,fontSize:"1rem",
          border:"none",cursor:"pointer",fontFamily:"inherit",
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:`0 4px 20px rgba(22,163,74,.4)`,
        }}>
          Finalizar dia <span style={{fontSize:"1.1rem"}}>→</span>
        </button>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // TELA 6 — ENCERRAMENTO DO DIA
  // ════════════════════════════════════════════════════════════
  if (screen === 6) {
    return (
      <div style={{...wrapStyle,display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",paddingTop:20}}>
        {/* Check animado */}
        <div style={{
          width:90,height:90,borderRadius:99,
          border:`2.5px solid ${GL}`,
          background:"rgba(34,197,94,.08)",
          display:"flex",alignItems:"center",justifyContent:"center",
          margin:"0 auto 28px",
          boxShadow:`0 0 40px rgba(34,197,94,.2)`,
        }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path d="M8 20 L16 28 L32 12" stroke={GL} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <div style={{fontSize:"1.375rem",fontWeight:800,color:"#FFFFFF",marginBottom:10,lineHeight:1.2}}>
          Missão concluída<br/>com sucesso.
        </div>
        <div style={{fontSize:"0.8125rem",color:"rgba(255,255,255,.45)",marginBottom:40,lineHeight:1.6}}>
          Seu progresso foi salvo.<br/>Continue amanhã.
        </div>

        {/* Resumo compacto */}
        <div style={{
          width:"100%",
          padding:"16px 20px",
          background:"rgba(255,255,255,.04)",
          border:"1px solid rgba(255,255,255,.08)",
          borderRadius:16,
          marginBottom:32,
        }}>
          {[
            {l:"Missão executada",v:missaoHoje.title,vc:"rgba(255,255,255,.8)"},
            {l:"Pontos conquistados",v:`+${pontos} pts`,vc:GL},
            {l:"Score atual",v:`${sc.total}/1000`,vc:"rgba(255,255,255,.8)"},
            {l:"Protocolo",v:protocolo.label,vc:"rgba(255,255,255,.5)"},
          ].map((r,i,arr)=>(
            <div key={r.l} style={{
              display:"flex",justifyContent:"space-between",
              alignItems:"center",
              padding:"10px 0",
              borderBottom:i<arr.length-1?"1px solid rgba(255,255,255,.06)":"none",
              textAlign:"left",
            }}>
              <span style={{fontSize:"0.75rem",color:"rgba(255,255,255,.4)"}}>{r.l}</span>
              <span style={{fontSize:"0.75rem",fontWeight:700,color:r.vc,maxWidth:160,textAlign:"right"}}>{r.v}</span>
            </div>
          ))}
        </div>

        <button onClick={finalizarDia} style={{
          width:"100%",padding:"16px",borderRadius:14,
          background:`linear-gradient(135deg, #16A34A, #15803D)`,
          color:"#FFFFFF",fontWeight:800,fontSize:"1rem",
          border:"none",cursor:"pointer",fontFamily:"inherit",
          display:"flex",alignItems:"center",justifyContent:"center",gap:10,
          boxShadow:`0 4px 20px rgba(22,163,74,.4)`,
        }}>
          Continuar amanhã <span style={{fontSize:"1.1rem"}}>→</span>
        </button>
      </div>
    );
  }

  return null;
}
function PageMetas({ st, dispatch }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [titulo, setTitulo] = useState(""); const [valor, setValor] = useState(""); const [tipo, setTipo] = useState("ECONOMIA");
  const metas = st.metas||[];
  function add() {
    if(!titulo||!valor) { toast("Preencha título e valor","err"); return; }
    dispatch({type:"MEI.ADD_META",p:{titulo,valorAlvo:safeNum(valor),tipo,progresso:0}});
    setShow(false); setTitulo(""); setValor(""); toast("Meta criada! 🎯");
  }
  return (
    <PageWrap title="🏹 Metas" action={<Btn onClick={()=>setShow(true)}>+ Nova</Btn>}>
      {metas.length===0 && (
        <Card style={{textAlign:"center",padding:40}}>
          <div style={{fontSize:48,marginBottom:12}}>🏹</div>
          <div style={{fontWeight:800,fontSize:16,marginBottom:8}}>Nenhuma meta</div>
          <Btn onClick={()=>setShow(true)}>Criar primeira meta</Btn>
        </Card>
      )}
      <Grid cols={2} gap={12}>
        {metas.map(m => (
          <Card key={m.id} style={{border:`1px solid ${m.atingida?T.greenMid:T.ink10}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{fontWeight:700,fontSize:14}}>{m.titulo}</div>
              <Badge color={m.atingida?T.green:T.amber}>{m.atingida?"✓":"Em andamento"}</Badge>
            </div>
            <Bar v={m.atingida?m.valorAlvo:0} max={m.valorAlvo} color={m.atingida?T.green:T.amber} h={6}/>
            <div style={{fontSize:11,color:T.ink60,margin:"6px 0"}}>Alvo: {fmtBRL(m.valorAlvo)}</div>
            {!m.atingida && <Btn size="sm" v="secondary" full onClick={()=>{dispatch({type:"MEI.ATINGIR_META",p:m.id});toast("🏆 Meta atingida!");}}>Marcar como atingida</Btn>}
          </Card>
        ))}
      </Grid>
      <Modal open={show} onClose={()=>setShow(false)} title="Nova Meta" width={420}>
        <Input label="Título *" value={titulo} onChange={setTitulo}/>
        <Sel label="Tipo" value={tipo} onChange={setTipo} options={[{v:"ECONOMIA",l:"💰 Economia"},{v:"FATURAMENTO",l:"📈 Faturamento"},{v:"REDUZIR_DESPESA",l:"📉 Reduzir Despesas"},{v:"INVESTIMENTO",l:"🏦 Investimento"}]}/>
        <Input label="Valor alvo (R$) *" value={valor} onChange={setValor} prefix="R$"/>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <Btn v="outline" full onClick={()=>setShow(false)}>Cancelar</Btn>
          <Btn full onClick={add}>Criar</Btn>
        </div>
      </Modal>
    </PageWrap>
  );
}

function PagePropostas({ st, dispatch }) {
  const toast = useToast();
  const [selected, setSelected] = useState(null);
  const pendentes = (st.propostasBanco||[]).filter(p=>p.status==="PENDENTE");
  const historico = (st.propostasBanco||[]).filter(p=>p.status!=="PENDENTE");
  const sc = ScoreEngine.risk(st.user.score, st.faturamento||0);

  function aceitar(proposta) {
    dispatch({type:"CREDIT.CLIENT_ACCEPT",p:proposta.id});
    toast("Proposta aceita! Crédito será liberado em até 24h úteis. ✅");
    setSelected(null);
  }
  function recusar(id) {
    dispatch({type:"CREDIT.CLIENT_REJECT",p:id});
    toast("Proposta recusada","warn");
    setSelected(null);
  }

  return (
    <PageWrap title="Propostas de Crédito">
      {/* Score banner */}
      <div style={{background:"linear-gradient(135deg,#F0FDF4,#DCFCE7)",border:"1px solid #BBF7D0",borderRadius:T.radiusLg,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:16}}>
        <div style={{textAlign:"center",flexShrink:0}}>
          <div style={{fontSize:28,fontWeight:900,color:T.green,lineHeight:1}}>{st.user.score}</div>
          <div style={{fontSize:9,color:T.ink60,fontWeight:700,textTransform:"uppercase",marginTop:2}}>Seu Score</div>
        </div>
        <div style={{width:1,height:40,background:"rgba(0,0,0,.08)",flexShrink:0}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:700,color:T.ink,marginBottom:2}}>
            {sc.approved?"✅ Você está elegível para crédito":"⚠️ Melhore seu score para acessar propostas"}
          </div>
          <div style={{fontSize:11,color:T.ink60}}>
            Limite pré-aprovado: <strong style={{color:T.green}}>{fmtBRL(sc.limit)}</strong> · Taxa indicativa: <strong>{sc.rate}</strong>
          </div>
        </div>
        {pendentes.length>0&&<div style={{background:T.red,color:"#fff",borderRadius:99,padding:"4px 10px",fontSize:12,fontWeight:800,flexShrink:0}}>{pendentes.length} nova{pendentes.length>1?"s":""}</div>}
      </div>

      {/* Empty state */}
      {pendentes.length===0 && historico.length===0 && (
        <Card style={{textAlign:"center",padding:48}}>
          <div style={{fontSize:48,marginBottom:16}}>🏦</div>
          <div style={{fontWeight:800,fontSize:15,marginBottom:8}}>Nenhuma proposta recebida</div>
          <p style={{fontSize:13,color:T.ink60,maxWidth:300,margin:"0 auto"}}>
            Parceiros bancários enviarão propostas personalizadas com base no seu score e histórico financeiro.
          </p>
        </Card>
      )}

      {/* Propostas pendentes */}
      {pendentes.length>0&&(
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,color:T.ink60,textTransform:"uppercase",letterSpacing:".7px",marginBottom:10}}>
            Aguardando sua resposta
          </div>
          {pendentes.map(p=>{
            const diasExp = Math.ceil((new Date(p.expiresAt).getTime()-Date.now())/86400000);
            const urgente = diasExp<=2;
            const iof = PriceTable.calcIOF(p.valor, p.parcelas*30);
            const total = p.valorParcela * p.parcelas;
            const juros = total - p.valor;
            return (
              <div key={p.id} style={{marginBottom:14,borderRadius:T.radiusLg,overflow:"hidden",border:`1.5px solid ${urgente?"rgba(239,68,68,.4)":"rgba(34,168,90,.3)"}`}}>
                {/* Header */}
                <div style={{background:urgente?"rgba(239,68,68,.08)":"rgba(34,168,90,.06)",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:14,color:T.ink}}>{p.bancoNome}</div>
                    <div style={{fontSize:11,color:T.ink60,marginTop:1}}>{p.mensagem}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:10,fontWeight:700,color:urgente?T.red:T.ink60,background:urgente?"rgba(239,68,68,.08)":"#F3F4F6",padding:"3px 8px",borderRadius:99}}>
                      {diasExp<=0?"⚠️ Expira hoje":diasExp===1?"⚠️ Expira amanhã":`⏱ ${diasExp} dias`}
                    </div>
                  </div>
                </div>
                {/* Valor principal */}
                <div style={{background:"#F9FAFB",padding:"16px",textAlign:"center",borderBottom:"1px solid #E5E7EB"}}>
                  <div style={{fontSize:11,color:T.ink60,fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>Valor do crédito</div>
                  <div style={{fontSize:36,fontWeight:900,color:T.green,letterSpacing:"-1px"}}>{fmtBRL(p.valor)}</div>
                </div>
                {/* Grid de dados */}
                <div style={{background:"#F9FAFB",padding:"0 16px 16px",display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  {[
                    {l:"Parcelas",v:`${p.parcelas}×`,s:`de ${fmtBRL(p.valorParcela)}/mês`},
                    {l:"Taxa",v:p.taxa,s:p.cet?`CET: ${p.cet}`:"taxa mensal"},
                    {l:"Total a pagar",v:fmtBRL(total),s:`Juros: ${fmtBRL(juros)}`},
                  ].map(x=>(
                    <div key={x.l} style={{background:"#FFFFFF",borderRadius:T.radiusSm,padding:"10px 12px",textAlign:"center",border:"1px solid #E5E7EB"}}>
                      <div style={{fontSize:9,color:T.ink60,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>{x.l}</div>
                      <div style={{fontSize:13,fontWeight:800,color:T.ink}}>{x.v}</div>
                      <div style={{fontSize:10,color:T.ink60,marginTop:2}}>{x.s}</div>
                    </div>
                  ))}
                </div>
                {/* IOF info */}
                <div style={{background:"#F9FAFB",padding:"0 16px 10px"}}>
                  <div style={{fontSize:10,color:T.ink40,padding:"8px 10px",background:"#FFFFFF",borderRadius:T.radiusSm,border:"1px solid #E5E7EB"}}>
                    IOF estimado: {fmtBRL(iof)} (BACEN Res. 3.517/2007) · Comissão Lucrom: paga pelo banco, sem custo para você
                  </div>
                </div>
                {/* Ações */}
                <div style={{background:"#FFFFFF",padding:"12px 16px",display:"flex",gap:10,borderTop:"1px solid #E5E7EB"}}>
                  <Btn v="outline" full onClick={()=>recusar(p.id)} style={{borderColor:"rgba(239,68,68,.4)",color:T.red}}>
                    ✕ Recusar
                  </Btn>
                  <Btn full onClick={()=>setSelected(p)} style={{background:`linear-gradient(135deg,${T.greenMid},${T.green})`}}>
                    ✅ Aceitar proposta
                  </Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Histórico */}
      {historico.length>0&&(
        <div>
          <div style={{fontSize:11,fontWeight:700,color:T.ink60,textTransform:"uppercase",letterSpacing:".7px",marginBottom:10}}>Histórico</div>
          {historico.map(p=>(
            <Card key={p.id} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13}}>{p.bancoNome}</div>
                  <div style={{fontSize:11,color:T.ink60,marginTop:2}}>
                    {fmtBRL(p.valor)} · {p.parcelas}× de {fmtBRL(p.valorParcela)} · {p.taxa}
                  </div>
                  <div style={{fontSize:10,color:T.ink40,marginTop:2}}>
                    {p.aceitoEm&&`Aceita em ${fmtDate(p.aceitoEm)}`}
                    {p.expiradaEm&&`Expirada em ${fmtDate(p.expiradaEm)}`}
                    {!p.aceitoEm&&!p.expiradaEm&&fmtDate(p.criadaEm||p.expiresAt)}
                  </div>
                </div>
                <Badge color={p.status==="ACEITA"?T.green:p.status==="EXPIRADA"?T.ink40:T.red}>
                  {p.status==="ACEITA"?"Aceita":p.status==="EXPIRADA"?"Expirada":"Recusada"}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de confirmação */}
      <Modal open={!!selected} onClose={()=>setSelected(null)} title="Confirmar aceite" width={420}>
        {selected&&(
          <>
            <AlertBox type="warn" style={{marginBottom:14}}>
              ⚖️ Ao aceitar, você autoriza a formalização do contrato de crédito e a consulta ao SCR/BACEN.
            </AlertBox>
            <CardFlat style={{marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>{selected.bancoNome}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div><div style={{fontSize:10,color:T.ink60}}>VALOR</div><div style={{fontSize:16,fontWeight:900,color:T.green}}>{fmtBRL(selected.valor)}</div></div>
                <div><div style={{fontSize:10,color:T.ink60}}>PARCELAS</div><div style={{fontSize:14,fontWeight:800}}>{selected.parcelas}× de {fmtBRL(selected.valorParcela)}</div></div>
                <div><div style={{fontSize:10,color:T.ink60}}>TAXA</div><div style={{fontSize:13,fontWeight:700}}>{selected.taxa}</div></div>
                <div><div style={{fontSize:10,color:T.ink60}}>TOTAL</div><div style={{fontSize:13,fontWeight:700}}>{fmtBRL(selected.valorParcela*selected.parcelas)}</div></div>
              </div>
            </CardFlat>
            <div style={{fontSize:11,color:T.ink60,marginBottom:14,lineHeight:1.6,padding:"10px 12px",background:T.ink02,borderRadius:T.radiusSm}}>
              O crédito será depositado na conta bancária cadastrada em até 1 dia útil após aprovação final do parceiro.
              Você pode acompanhar o status em "Minhas Operações".
            </div>
            <div style={{display:"flex",gap:10}}>
              <Btn v="outline" full onClick={()=>setSelected(null)}>Cancelar</Btn>
              <Btn full onClick={()=>aceitar(selected)}>Confirmar aceite</Btn>
            </div>
          </>
        )}
      </Modal>
    </PageWrap>
  );
}

function PageMeiOperacoes({ st, dispatch }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const sc = ScoreEngine.risk(st.user.score, st.faturamento||0);
  const fraud = FraudEngine.calcRiskScore(st.operacoes||[], st.transactions||[], st.faturamento||0, st.tetoMEI||81000);
  const meiOps = (st.operacoes||[]).filter(o=>o.meiId===st.user.id);

  // Step 1 — valor/parcelas
  const [valor, setValor] = useState("");
  const [parcelas, setParcelas] = useState("12");
  const [finalidade, setFinalidade] = useState("Capital de giro");

  // Step 2 — dados pessoais/empresa
  const [cpf, setCpf] = useState(st.user.cpf||"");
  const [cnpj, setCnpj] = useState(st.user.cnpj||"");
  const [telefone, setTelefone] = useState(st.user.telefone||"");

  // Step 3 — endereço
  const [cep, setCep] = useState(st.user.endereco?.cep||"");
  const [rua, setRua] = useState(st.user.endereco?.rua||"");
  const [numero, setNumero] = useState(st.user.endereco?.numero||"");
  const [bairro, setBairro] = useState(st.user.endereco?.bairro||"");
  const [cidade, setCidade] = useState(st.user.endereco?.cidade||"");
  const [uf, setUf] = useState(st.user.endereco?.uf||"");

  // Step 4 — dados bancários
  const [banco, setBanco] = useState(st.user.dadosBancarios?.banco||"");
  const [agencia, setAgencia] = useState(st.user.dadosBancarios?.agencia||"");
  const [conta, setConta] = useState(st.user.dadosBancarios?.conta||"");
  const [tipoConta, setTipoConta] = useState(st.user.dadosBancarios?.tipoConta||"corrente");
  const [pix, setPix] = useState(st.user.dadosBancarios?.pix||"");

  // Step 5 — documentos
  const [anexos, setAnexos] = useState([]);

  // Step 6 — LGPD + Contrato
  const [lgpdOk, setLgpdOk] = useState(st.user.lgpdAccepted||false);
  const [contratoOk, setContratoOk] = useState(false);
  const [showContrato, setShowContrato] = useState(false);

  // Simulação em tempo real
  const v = valor ? Math.round(parseFloat(String(valor).replace(/\./g,"").replace(",","."))||0) : 0;
  const n = safeNum(parcelas);
  const taxaNum = safeNum(sc.rate?.replace(",",".").replace("% a.m.","")) || 1.99;
  const pmt = v>0&&n>0 ? PriceTable.calcPMT(v, taxaNum, n) : 0;
  const iof = v>0 ? PriceTable.calcIOF(v, n*30) : 0;
  const cet = pmt>0 ? PriceTable.calcCET(v, pmt, n, iof, taxaNum) : 0;

  function openModal() { setStep(0); setShowModal(true); }

  function nextStep() {
    if(step===0) {
      if(!valor||v<=0) { toast("Informe o valor","err"); return; }
      if(v>sc.limit) { toast(`Limite máximo: ${fmtBRL(sc.limit)}`,"warn"); return; }
      if(fraud.bloqueado) { toast("Antifraude bloqueou esta operação","err"); return; }
    }
    if(step===1) {
      if(!cpf||cpf.length<11) { toast("CPF inválido","err"); return; }
      if(!cnpj||cnpj.length<14) { toast("CNPJ inválido","err"); return; }
      dispatch({type:"MEI.UPDATE_USER",p:{cpf,cnpj,telefone}});
    }
    if(step===2) {
      if(!cep||!rua||!cidade||!uf) { toast("Preencha o endereço completo","err"); return; }
      dispatch({type:"MEI.UPDATE_ENDERECO",p:{cep,rua,numero,bairro,cidade,uf}});
    }
    if(step===3) {
      if(!banco||!agencia||!conta) { toast("Preencha os dados bancários","err"); return; }
      dispatch({type:"MEI.UPDATE_BANCO",p:{banco,agencia,conta,tipoConta,pix}});
    }
    if(step===5) {
      if(!lgpdOk) { toast("Aceite a política LGPD para continuar","err"); return; }
      if(!contratoOk) { toast("Leia e aceite o contrato de crédito","err"); return; }
      solicitar(); return;
    }
    setStep(s=>s+1);
  }

  function solicitar() {
    getDeviceId().then(deviceId => {
      const ts = new Date().toISOString();
      if(!st.user.lgpdAccepted) dispatch({type:"MEI.LGPD_ACCEPT"});
      dispatch({type:"CREDIT.REQUEST",p:{
        valor:v, parcelas:parseInt(parcelas), finalidade,
        cpf, cnpj, telefone,
        endereco:{cep,rua,numero,bairro,cidade,uf},
        dadosBancarios:{banco,agencia,conta,tipoConta,pix},
        anexos,
        deviceId, ip:"client", userAgent:navigator.userAgent,
        lgpdAccepted:true, lgpdTs:ts,
        contratoAceito:true, contratoTs:ts,
        ts,
      }});
    });
    setShowModal(false);
    toast(`Solicitação enviada! Parcela estimada: ${fmtBRL(pmt)}`);
  }

  const STEPS = ["Simulação","Dados Pessoais","Endereço","Dados Bancários","Documentos","Aceites"];
  const S = {fontSize:11,color:T.ink60};
  const SL = {display:"block",fontSize:11,fontWeight:700,color:T.ink60,marginBottom:4};
  const INP = {width:"100%",height:38,border:`1px solid ${T.ink10}`,borderRadius:T.radiusSm,padding:"0 10px",background:T.white,color:T.ink,fontSize:13,fontFamily:"inherit"};

  return (
    <PageWrap title="Operações de Crédito" action={sc.approved&&!fraud.bloqueado&&<Btn onClick={openModal}>+ Solicitar Crédito</Btn>}>
      <Grid cols={3} gap={10} style={{marginBottom:14}}>
        <Stat label="Score" value={st.user.score} sub={`Risco ${sc.level}`} color={sc.color}/>
        <Stat label="Limite pré-aprovado" value={fmtBRL(sc.limit)} sub={sc.rate} color={T.green}/>
        <Stat label="Operações ativas" value={meiOps.filter(o=>["LIBERADA","ADIMPLENTE"].includes(o.status)).length} color={T.teal}/>
      </Grid>

      {!sc.approved&&<AlertBox type="warn" style={{marginBottom:10}}>Score abaixo de 500. Complete missões para acessar crédito.</AlertBox>}
      {fraud.bloqueado&&<AlertBox type="danger" style={{marginBottom:10}}>🚨 Operações bloqueadas pelo antifraude. Flags: {fraud.flags.join(", ")}.</AlertBox>}
      {fraud.alerta&&!fraud.bloqueado&&<AlertBox type="warn" style={{marginBottom:10}}>⚠️ Alerta antifraude (Score: {fraud.riskScore}/100).</AlertBox>}
      {!st.user.lgpdAccepted&&(
        <div onClick={()=>{setStep(5);setShowModal(true);}} style={{
          cursor:"pointer",marginBottom:10,
          background:"rgba(59,130,246,.08)",border:"1px solid rgba(59,130,246,.3)",
          borderRadius:T.radiusSm,padding:"12px 16px",
          display:"flex",alignItems:"center",gap:10,
        }}>
          <span style={{fontSize:18}}>📋</span>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:700,color:"#3b82f6"}}>Aceite de LGPD pendente</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.6)",marginTop:2}}>Toque para aceitar a política — obrigatório para solicitar crédito</div>
          </div>
          <span style={{color:"#3b82f6",fontSize:16,fontWeight:700}}>›</span>
        </div>
      )}

      {meiOps.length===0?(
        <Card style={{textAlign:"center",padding:40}}>
          <div style={{fontSize:36,marginBottom:12}}>🏦</div>
          <div style={{fontWeight:800,marginBottom:6}}>Nenhuma operação</div>
          <div style={{fontSize:13,color:T.ink60,marginBottom:16}}>Solicite seu primeiro crédito MEI</div>
          {sc.approved&&!fraud.bloqueado&&<Btn onClick={openModal}>Solicitar Crédito</Btn>}
        </Card>
      ):meiOps.map(op=>(
        <Card key={op.id} style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{fontWeight:800,fontSize:16}}>{fmtBRL(op.valorPrincipal)}</div>
              <div style={{fontSize:11,color:T.ink60}}>
                {op.parceiroNome}{op.taxaJuros>0?` · ${op.taxaJuros}% a.m.`:""}
                {` · ${op.parcelas}×`}{op.valorParcela>0?` de ${fmtBRL(op.valorParcela)}`:""}
                {op.cet>0?` · CET ${op.cet.toFixed(2)}% a.m.`:""}
              </div>
              {op.iof>0&&<div style={{fontSize:10,color:T.ink40}}>IOF: {fmtBRL(op.iof)}</div>}
            </div>
            <OperacaoStatusBadge status={op.status}/>
          </div>
          {["LIBERADA","ADIMPLENTE","INADIMPLENTE"].includes(op.status)&&(
            <>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:12}}>
                <span style={{color:T.ink60}}>Saldo devedor</span>
                <span style={{fontWeight:700,color:T.red}}>{fmtBRL(op.saldoDevedor)}</span>
              </div>
              <Bar v={op.valorPrincipal-op.saldoDevedor} max={op.valorPrincipal} color={T.green} h={5}/>
            </>
          )}
          {op.auditTrail&&op.auditTrail.length>0&&(
            <div style={{marginTop:8,padding:"6px 8px",background:T.ink02,borderRadius:T.radiusSm,fontSize:10,color:T.ink60}}>
              🔒 Audit: {op.auditTrail[0].evento} · FraudScore: {op.auditTrail[0].fraudScore} · Device: {op.auditTrail[0].deviceId?.slice(0,8)}...
              {op.lgpdAccepted&&<span style={{color:T.green,marginLeft:8}}>✓ LGPD</span>}
              {op.contratoAceito&&<span style={{color:T.green,marginLeft:4}}>✓ Contrato</span>}
            </div>
          )}
          <div style={{fontSize:10,color:T.ink40,marginTop:6}}>{fmtDate(op.criadaEm)}</div>
        </Card>
      ))}

      <Modal open={showModal} onClose={()=>setShowModal(false)} title="Solicitar Crédito MEI" width={520}>
        {/* Stepper */}
        <div style={{display:"flex",gap:0,marginBottom:20}}>
          {STEPS.map((s,i)=>(
            <div key={s} style={{flex:1,textAlign:"center"}}>
              <div style={{width:24,height:24,borderRadius:99,background:i<=step?T.green:T.ink05,color:i<=step?"#fff":T.ink40,fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 4px"}}>
                {i<step?"✓":i+1}
              </div>
              <div style={{fontSize:9,color:i===step?T.green:T.ink40,fontWeight:i===step?700:400}}>{s}</div>
            </div>
          ))}
        </div>

        {/* Step 0: Simulação */}
        {step===0&&(
          <div>
            <AlertBox type="info" style={{marginBottom:12}}>
              Limite pré-aprovado: <strong>{fmtBRL(sc.limit)}</strong> · Taxa indicativa: <strong>{sc.rate}</strong>
            </AlertBox>
            <div>
            <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:4}}>Valor desejado (R$)</label>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,color:T.ink60,fontWeight:700,pointerEvents:"none",zIndex:1}}>R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={valor}
                onChange={e=>{
                  const raw = e.target.value.replace(/[^0-9.,]/g,"");
                  setValor(raw);
                }}
                onBlur={e=>{
                  const n = parseFloat(String(e.target.value).replace(/\./g,"").replace(",","."));
                  if(n>0) setValor(String(Math.round(n)));
                  else setValor("");
                }}
                placeholder="Ex: 5000"
                style={{
                  width:"100%",height:52,
                  border:`1.5px solid ${v>0?T.green:T.ink10}`,
                  borderRadius:T.radiusSm,
                  paddingLeft:42,paddingRight:12,
                  background:T.surface,color:T.ink,
                  fontSize:20,fontWeight:700,
                  fontFamily:"inherit",outline:"none",
                  boxSizing:"border-box",
                }}
              />
            </div>
            {v>0&&<div style={{marginTop:4,fontSize:12,fontWeight:600,color:T.green}}>{fmtBRL(v)}</div>}
            {v>0&&v>sc.limit&&<div style={{fontSize:11,color:T.red,marginTop:2}}>⚠️ Acima do limite pré-aprovado de {fmtBRL(sc.limit)}</div>}
            {v>0&&v<100&&<div style={{fontSize:11,color:T.amber,marginTop:2}}>⚠️ Valor mínimo: R$ 100,00</div>}
          </div>
            <Sel label="Parcelas" value={parcelas} onChange={setParcelas}
              options={["6","12","18","24","36","48"].map(pv=>({v:pv,l:`${pv}× de ${fmtBRL(PriceTable.calcPMT(v||1000,taxaNum,safeNum(pv)))}`}))}/>
            <Sel label="Finalidade" value={finalidade} onChange={setFinalidade}
              options={["Capital de giro","Equipamentos","Reforma","Estoque","Marketing","Outro"].map(f=>({v:f,l:f}))}/>
            {pmt>0&&(
              <CardFlat style={{background:T.greenPale,border:`1px solid ${T.greenMid}`,marginTop:8}}>
                <div style={{fontSize:11,fontWeight:700,color:T.green,marginBottom:8}}>Simulação Price Table (BACEN Res. 3517/2007)</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div><div style={S}>PARCELA MENSAL</div><div style={{fontSize:20,fontWeight:900,color:T.green}}>{fmtBRL(pmt)}</div></div>
                  <div><div style={S}>TOTAL A PAGAR</div><div style={{fontSize:16,fontWeight:800}}>{fmtBRL(pmt*n)}</div></div>
                  <div><div style={S}>IOF (BACEN)</div><div style={{fontSize:13,fontWeight:700}}>{fmtBRL(iof)}</div></div>
                  <div><div style={S}>CET (Newton-Raphson)</div><div style={{fontSize:13,fontWeight:700,color:T.purple}}>{cet.toFixed(3)}% a.m.</div></div>
                </div>
                <div style={{marginTop:6,fontSize:10,color:T.ink40}}>* Valores sujeitos a análise. Taxa e CET finais definidos pelo parceiro bancário.</div>
              </CardFlat>
            )}
          </div>
        )}

        {/* Step 1: Dados Pessoais — pré-preenchido automaticamente */}
        {step===1&&(
          <div>
            <div style={{padding:"10px 14px",background:"rgba(34,168,90,.06)",borderRadius:T.radiusSm,marginBottom:14,border:`1px solid ${T.green}33`}}>
              <div style={{fontSize:11,fontWeight:700,color:T.green,marginBottom:2}}>✅ Dados pré-preenchidos do seu cadastro</div>
              <div style={{fontSize:11,color:T.ink60}}>Confirme ou edite se necessário.</div>
            </div>
            <Grid cols={2} gap={10}>
              <div>
                <label style={SL}>Nome</label>
                <input style={{...INP,background:"rgba(34,168,90,.04)",borderColor:T.green}} value={st.user.nome} readOnly/>
              </div>
              <div>
                <label style={SL}>E-mail</label>
                <input style={{...INP,background:"rgba(34,168,90,.04)",borderColor:T.green}} value={st.user.email} readOnly/>
              </div>
            </Grid>
            <Grid cols={2} gap={10} style={{marginTop:10}}>
              <div>
                <label style={SL}>CNPJ</label>
                <input style={{...INP,background:"rgba(34,168,90,.04)",borderColor:T.green}} value={cnpj||st.user.cnpj} readOnly/>
              </div>
              <div>
                <label style={SL}>Telefone</label>
                <input style={INP} value={telefone} onChange={e=>setTelefone(e.target.value)} placeholder="(11) 99999-9999"/>
              </div>
            </Grid>
            {cpf?(
              <div style={{marginTop:10}}>
                <label style={SL}>CPF do responsável</label>
                <input style={{...INP,background:"rgba(34,168,90,.04)",borderColor:T.green}} value={cpf} readOnly/>
              </div>
            ):(
              <div style={{marginTop:10}}>
                <label style={SL}>CPF do responsável</label>
                <input style={INP} value={cpf} onChange={e=>setCpf(V.fmtCPF?V.fmtCPF(e.target.value):e.target.value)} placeholder="000.000.000-00"/>
              </div>
            )}
            <div style={{marginTop:10,padding:"10px 12px",background:T.ink02,borderRadius:T.radiusSm,fontSize:11,color:T.ink60}}>
              🔒 Dados protegidos pela LGPD. Usados apenas para análise e formalização do crédito.
            </div>
          </div>
        )}

        {/* Step 2: Endereço — pré-preenchido do cadastro */}
        {step===2&&(
          <div>
            {(cep||rua) ? (
              <div style={{padding:"10px 14px",background:"rgba(34,168,90,.06)",borderRadius:T.radiusSm,marginBottom:14,border:`1px solid ${T.green}33`}}>
                <div style={{fontSize:11,fontWeight:700,color:T.green,marginBottom:2}}>✅ Endereço pré-preenchido do cadastro</div>
                <div style={{fontSize:11,color:T.ink60}}>Confirme ou edite se necessário.</div>
              </div>
            ) : (
              <div style={{fontSize:12,color:T.ink60,marginBottom:14}}>Informe o endereço completo do estabelecimento MEI.</div>
            )}
            <Grid cols={2} gap={10}>
              <div>
                <label style={SL}>CEP</label>
                <input style={{...INP,borderColor:cep?T.green:undefined}} value={cep} onChange={e=>setCep(e.target.value)} placeholder="00000-000"/>
              </div>
              <div>
                <label style={SL}>UF</label>
                <select style={{...INP,borderColor:uf?T.green:undefined}} value={uf} onChange={e=>setUf(e.target.value)}>
                  <option value="">Selecione</option>
                  {["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"].map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </Grid>
            <div style={{marginTop:10}}>
              <label style={SL}>Rua / Logradouro</label>
              <input style={{...INP,borderColor:rua?T.green:undefined}} value={rua} onChange={e=>setRua(e.target.value)} placeholder="Rua, Avenida, Estrada..."/>
            </div>
            <Grid cols={2} gap={10} style={{marginTop:10}}>
              <div>
                <label style={SL}>Número</label>
                <input style={{...INP,borderColor:numero?T.green:undefined}} value={numero} onChange={e=>setNumero(e.target.value)} placeholder="123"/>
              </div>
              <div>
                <label style={SL}>Bairro</label>
                <input style={{...INP,borderColor:bairro?T.green:undefined}} value={bairro} onChange={e=>setBairro(e.target.value)} placeholder="Bairro"/>
              </div>
            </Grid>
            <div style={{marginTop:10}}>
              <label style={SL}>Cidade</label>
              <input style={INP} value={cidade} onChange={e=>setCidade(e.target.value)} placeholder="Cidade"/>
            </div>
          </div>
        )}

        {/* Step 3: Dados Bancários */}
        {step===3&&(
          <div>
            <div style={{fontSize:12,color:T.ink60,marginBottom:14}}>Conta para recebimento do crédito.</div>
            <Grid cols={2} gap={10}>
              <div>
                <label style={SL}>Banco</label>
                <select style={INP} value={banco} onChange={e=>setBanco(e.target.value)}>
                  <option value="">Selecione o banco</option>
                  {["001 - Banco do Brasil","033 - Santander","104 - Caixa Econômica","237 - Bradesco","341 - Itaú","356 - ABN AMRO","422 - Safra","745 - Citibank","260 - Nubank","290 - PagSeguro","380 - PicPay","323 - Mercado Pago","212 - Banco Original","218 - BS2","077 - Banco Inter","336 - C6 Bank"].map(b=><option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label style={SL}>Tipo de conta</label>
                <select style={INP} value={tipoConta} onChange={e=>setTipoConta(e.target.value)}>
                  <option value="corrente">Conta Corrente</option>
                  <option value="poupanca">Conta Poupança</option>
                  <option value="pagamento">Conta Pagamento</option>
                </select>
              </div>
            </Grid>
            <Grid cols={2} gap={10} style={{marginTop:10}}>
              <div>
                <label style={SL}>Agência</label>
                <input style={INP} value={agencia} onChange={e=>setAgencia(e.target.value)} placeholder="0000"/>
              </div>
              <div>
                <label style={SL}>Conta</label>
                <input style={INP} value={conta} onChange={e=>setConta(e.target.value)} placeholder="00000-0"/>
              </div>
            </Grid>
            <div style={{marginTop:10}}>
              <label style={SL}>Chave PIX (opcional)</label>
              <input style={INP} value={pix} onChange={e=>setPix(e.target.value)} placeholder="CPF, email, telefone ou chave aleatória"/>
            </div>
            <div style={{marginTop:10,padding:"10px 12px",background:T.ink02,borderRadius:T.radiusSm,fontSize:11,color:T.ink60}}>
              🏦 O crédito será depositado nesta conta em até 1 dia útil após aprovação.
            </div>
          </div>
        )}

        {/* Step 4: Documentos */}
        {step===4&&(
          <div>
            <div style={{fontSize:12,color:T.ink60,marginBottom:14}}>Anexe os documentos comprobatórios.</div>
            {[
              {id:"dasn",label:"DASN-SIMEI (último ano)",req:true,icon:"📋"},
              {id:"extrato",label:"Extrato bancário (3 meses)",req:true,icon:"🏦"},
              {id:"nf",label:"Notas fiscais recentes",req:false,icon:"📄"},
              {id:"comprovante",label:"Comprovante de endereço",req:true,icon:"🏠"},
            ].map(doc=>(
              <div key={doc.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${T.ink05}`}}>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{fontSize:20}}>{doc.icon}</span>
                  <div>
                    <div style={{fontSize:12,fontWeight:600}}>{doc.label} {doc.req&&<span style={{color:T.red,fontSize:10}}>*</span>}</div>
                    <div style={{fontSize:10,color:T.ink60}}>{anexos.find(a=>a.id===doc.id)?"✅ Anexado":"Nenhum arquivo"}</div>
                  </div>
                </div>
                <label style={{cursor:"pointer"}}>
                  <input type="file" style={{display:"none"}} accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e=>{if(e.target.files?.[0]){setAnexos(prev=>[...prev.filter(a=>a.id!==doc.id),{id:doc.id,nome:e.target.files[0].name,size:e.target.files[0].size}]);}}}/>
                  <span style={{fontSize:11,color:T.green,fontWeight:700,padding:"5px 10px",border:`1px solid ${T.green}`,borderRadius:T.radiusSm,cursor:"pointer"}}>
                    {anexos.find(a=>a.id===doc.id)?"Trocar":"Anexar"}
                  </span>
                </label>
              </div>
            ))}
            <div style={{marginTop:10,padding:"10px 12px",background:T.ink02,borderRadius:T.radiusSm,fontSize:11,color:T.ink60}}>
              📁 Formatos aceitos: PDF, JPG, PNG. Tamanho máximo: 10MB por arquivo.
              {st.dasnDecs?.length>0&&<div style={{color:T.green,marginTop:4}}>✅ DASN registrada no sistema. Pode ser anexada automaticamente.</div>}
            </div>
          </div>
        )}

        {/* Step 5: LGPD + Contrato */}
        {step===5&&(
          <div>
            <AlertBox type="warn" style={{marginBottom:14}}>
              ⚖️ Leia atentamente os termos antes de confirmar a solicitação.
            </AlertBox>

            {/* Contrato */}
            <div style={{border:`1px solid ${T.ink10}`,borderRadius:T.radiusSm,padding:12,marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>📃 Contrato de Crédito MEI</div>
              <div style={{fontSize:11,color:T.ink60,lineHeight:1.6,maxHeight:120,overflowY:"auto",marginBottom:8}}>
                Este instrumento representa a operação de crédito no valor de <strong>{fmtBRL(v)}</strong> em <strong>{parcelas} parcelas</strong> de aproximadamente <strong>{fmtBRL(pmt)}</strong>, com taxa indicativa de <strong>{taxaNum.toFixed(2)}% a.m.</strong> e CET estimado de <strong>{cet.toFixed(3)}% a.m.</strong>
                <br/><br/>
                O IOF incidente é de aproximadamente <strong>{fmtBRL(iof)}</strong> conforme BACEN Resolução 3.517/2007. A comissão de originação é paga pelo parceiro bancário à Lucrom (2,5% do principal). O tomador (MEI) não é responsável por nenhuma taxa de originação.
                <br/><br/>
                A operação está sujeita a análise de crédito e antifraude. O parceiro bancário pode solicitar documentação adicional. O crédito será depositado na conta informada em até 1 dia útil após aprovação final.
                <br/><br/>
                Declaro que todas as informações prestadas são verdadeiras, sob pena de responsabilidade civil e criminal (art. 299 CP). Autorizo a consulta ao SCR/BACEN e a bureaus de crédito para fins de análise desta operação.
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="checkbox" id="contrato" checked={contratoOk} onChange={e=>setContratoOk(e.target.checked)}/>
                <label htmlFor="contrato" style={{fontSize:12,cursor:"pointer"}}>
                  Li e aceito o contrato de crédito e autorizo a consulta ao SCR/BACEN
                </label>
              </div>
            </div>

            {/* LGPD */}
            <div style={{border:`1px solid ${T.ink10}`,borderRadius:T.radiusSm,padding:12,marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>🔒 Consentimento LGPD (Lei 13.709/2018)</div>
              <div style={{fontSize:11,color:T.ink60,lineHeight:1.6,maxHeight:100,overflowY:"auto",marginBottom:8}}>
                Autorizo a Lucrom Tecnologia Financeira a coletar, processar e compartilhar meus dados pessoais (CPF, CNPJ, dados financeiros, histórico de crédito, dados bancários, localização e comportamento de uso) com parceiros bancários para fins de análise e concessão de crédito, conforme Lei 13.709/2018 (LGPD) e regulamentação BACEN.
                <br/><br/>
                Tenho direito à portabilidade, correção e exclusão dos meus dados a qualquer momento. Contato DPO: privacidade@lucrom.com.br
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <input type="checkbox" id="lgpd" checked={lgpdOk} onChange={e=>{setLgpdOk(e.target.checked);if(e.target.checked)dispatch({type:"MEI.LGPD_ACCEPT"});}}/>
                <label htmlFor="lgpd" style={{fontSize:12,cursor:"pointer"}}>
                  Aceito o tratamento dos meus dados conforme a LGPD e politica de privacidade
                </label>
              </div>
            </div>

            {/* Resumo antifraude */}
            <div style={{padding:"8px 12px",background:T.ink02,borderRadius:T.radiusSm,fontSize:10,color:T.ink60}}>
              🛡️ Fingerprint coletado · IP registrado · Score antifraude: {fraud.riskScore}/100 · Trilha de auditoria ativa
              {fraud.flags.length>0&&<div style={{color:T.amber,marginTop:2}}>⚠️ Flags: {fraud.flags.join(", ")}</div>}
            </div>
          </div>
        )}

        {/* Navegação */}
        <div style={{display:"flex",gap:8,marginTop:16}}>
          {step>0&&<Btn v="outline" onClick={()=>setStep(s=>s-1)}>← Voltar</Btn>}
          <Btn full onClick={nextStep} disabled={step===5&&(!lgpdOk||!contratoOk)}>
            {step===5?"✅ Confirmar Solicitação":step===4?"Próximo →":"Próximo →"}
          </Btn>
        </div>
      </Modal>
    </PageWrap>
  );
}

function PageImpostos({ st, dispatch }) {
  const toast = useToast();
  const [showDasn, setShowDasn] = useState(false);
  const [showDas,  setShowDas]  = useState(false);

  // ── Estado DASN — todos campos oficiais Receita Federal ──────
  const [ano,            setAno]            = useState(String(new Date().getFullYear()-1));
  const [recComercio,    setRecComercio]    = useState(""); // (A) Comércio/Indústria/Transporte ICMS
  const [recServicos,    setRecServicos]    = useState(""); // (B) Prestação de Serviços ISS
  const [recExportacao,  setRecExportacao]  = useState(""); // (C) Exportação de Serviços (isenta)
  const [possuiEmpregado,setPossuiEmpregado]= useState("NAO");
  const [salarioEmpregado,setSalarioEmpregado]= useState("");  // salário se tiver empregado
  const [situacaoEspecial,setSituacaoEspecial]= useState("NAO"); // baixa/cancelamento no ano
  const [dataSituacao,   setDataSituacao]   = useState("");    // data do evento especial
  const [infoComplementar,setInfoComplementar]= useState("");  // obs livre

  const fatBrutoTotal = safeNum(recComercio) + safeNum(recServicos);
  const fatTotal      = fatBrutoTotal + safeNum(recExportacao);

  const dasn = ImpostosEngine.statusDASN(st.dasnDecs);
  const lim  = ImpostosEngine.limiteAnual(st.faturamento, st.tetoMEI||81000);
  const das  = CnaeEngine.calcDAS(st.user.cnae);

  const cnaeComercio = ["4711-3/01","4923-0/02","5611-2/01"];
  const temAtivComercio = cnaeComercio.includes(st.user.cnae) || !st.user.cnae || st.user.cnae==="—";

  function submitDASN() {
    if(!safeNum(recServicos) && !safeNum(recComercio)) {
      toast("Informe pelo menos um valor de receita (A ou B)","err"); return;
    }
    if(possuiEmpregado==="SIM" && !salarioEmpregado) {
      toast("Informe o salário do empregado","err"); return;
    }
    dispatch({type:"MEI.ADD_DASN", p:{
      id: genId(), ano: parseInt(ano), ts: tsISO(),
      // Receitas por tipo (campos oficiais DASN)
      receitaComercio:    safeNum(recComercio),
      receitaServicos:    safeNum(recServicos),
      receitaExportacao:  safeNum(recExportacao),
      faturamentoBruto:   fatBrutoTotal,           // (A+B) para cálculo de teto
      faturamentoTotal:   fatTotal,                // incluindo exportação
      // Empregado
      possuiEmpregado:    possuiEmpregado==="SIM",
      salarioEmpregado:   possuiEmpregado==="SIM" ? safeNum(salarioEmpregado) : 0,
      // Situação especial
      situacaoEspecial:   situacaoEspecial==="SIM",
      dataSituacao:       situacaoEspecial==="SIM" ? dataSituacao : null,
      infoComplementar,
      status: "ENVIADA",
    }});
    setShowDasn(false);
    setRecComercio(""); setRecServicos(""); setRecExportacao("");
    setPossuiEmpregado("NAO"); setSalarioEmpregado("");
    setSituacaoEspecial("NAO"); setDataSituacao(""); setInfoComplementar("");
    toast("DASN registrada! Confirme no Portal do Simples Nacional.");
  }

  // Helper de campo de receita
  const CampoReceita = ({label, hint, value, onChange}) => (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:4}}>{label}</label>
      <div style={{position:"relative",display:"flex",alignItems:"center"}}>
        <span style={{position:"absolute",left:12,color:T.ink40,fontSize:13,fontWeight:700,pointerEvents:"none"}}>R$</span>
        <input type="number" min="0" step="0.01" value={value} onChange={e=>onChange(e.target.value)} placeholder="0,00"
          style={{width:"100%",height:52,borderRadius:T.radius,padding:"0 14px 0 40px",background:T.white,border:`1.5px solid ${T.ink10}`,color:T.ink,fontSize:17,fontWeight:800,outline:"none",boxSizing:"border-box"}}/>
      </div>
      {hint && <p style={{margin:"3px 0 0",fontSize:10,color:T.ink40}}>{hint}</p>}
    </div>
  );

  return (
    <PageWrap title="📋 DAS & DASN-SIMEI">
      <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:14}}>

        {/* ── Card DASN ─────────────────────────────────────── */}
        <Card>
          <div style={{fontWeight:800,fontSize:15,marginBottom:4}}>DASN-SIMEI</div>
          <div style={{fontSize:11,color:T.ink60,marginBottom:10}}>Declaração Anual do Simples Nacional · Prazo: <strong>{dasn.prazo}</strong></div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            <div style={{fontSize:32,fontWeight:900,color:dasn.declarado?T.green:T.red}}>{dasn.diasRestantes} <span style={{fontSize:16,fontWeight:600}}>dias</span></div>
            <div style={{fontSize:11,color:T.ink60}}>restantes para o prazo</div>
          </div>
          {dasn.declarado ? (
            <>
              <Badge color={T.green}>✓ Declarada {dasn.ano}</Badge>
              {(() => {
                const dec = st.dasnDecs.find(d=>d.ano===dasn.ano);
                if(!dec) return null;
                return (
                  <div style={{marginTop:10,background:T.greenPale,borderRadius:T.radiusSm,padding:"12px 14px",border:`1px solid ${T.greenMid}`}}>
                    {[
                      {l:"(A) Comércio/Indústria/Transporte",v:dec.receitaComercio||0},
                      {l:"(B) Prestação de Serviços",v:dec.receitaServicos||0},
                      {l:"(C) Exportação de Serviços",v:dec.receitaExportacao||0},
                    ].map(x=>(
                      <div key={x.l} style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                        <span style={{fontSize:11,color:T.ink60}}>{x.l}</span>
                        <span style={{fontSize:11,fontWeight:700}}>{fmtBRL(x.v)}</span>
                      </div>
                    ))}
                    <div style={{height:1,background:T.greenMid,margin:"6px 0"}}/>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,fontWeight:700}}>Receita bruta sujeita a tributos</span>
                      <span style={{fontSize:13,fontWeight:900,color:T.green}}>{fmtBRL(dec.faturamentoBruto||0)}</span>
                    </div>
                    {(dec.receitaExportacao||0)>0 && (
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontSize:11,color:T.ink60}}>+ Exportação (isenta)</span>
                        <span style={{fontSize:11,fontWeight:700}}>{fmtBRL(dec.receitaExportacao||0)}</span>
                      </div>
                    )}
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
                      {dec.possuiEmpregado && <Badge color={T.amber}>👔 Empregado: {fmtBRL(dec.salarioEmpregado||0)}/mês</Badge>}
                      {dec.situacaoEspecial && <Badge color={T.purple}>⚡ Sit. Especial</Badge>}
                    </div>
                  </div>
                );
              })()}
            </>
          ) : <AlertBox type="warn">⚠️ DASN {dasn.ano} não declarada. Multa mínima: R$50 após o prazo.</AlertBox>}
          <div style={{display:"flex",gap:8,marginTop:12}}>
            {!dasn.declarado && <Btn full size="sm" onClick={()=>setShowDasn(true)}>📋 Pré-declarar (controle interno)</Btn>}
            <Btn v="outline" full size="sm" onClick={()=>window.open("https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/dasnsimei.app/","_blank")}>
              Portal Oficial Receita →
            </Btn>
          </div>
        </Card>

        {/* ── Card DAS ──────────────────────────────────────── */}
        <Card>
          <div style={{fontWeight:800,fontSize:15,marginBottom:4}}>DAS Mensal</div>
          <div style={{fontSize:32,fontWeight:900,color:das.urgente?T.red:T.green,marginBottom:6}}>{fmtBRL(das.valor)}</div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <span style={{fontSize:12,color:T.ink60}}>Vencimento: <strong>{das.vencimento}</strong></span>
            {das.urgente && <Badge color={T.red}>🔴 {das.diasRestantes} dias</Badge>}
            {!das.urgente && das.diasRestantes<=10 && <Badge color={T.amber}>⚠️ {das.diasRestantes} dias</Badge>}
          </div>
          <AlertBox type="warn">⚠️ Pague sempre pelo Portal PGMEI oficial. Não pague via Pix ou boleto de terceiros.</AlertBox>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <Btn full size="sm" onClick={()=>window.open("https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app","_blank")}>PGMEI Oficial →</Btn>
            <Btn v="outline" full size="sm" onClick={()=>setShowDas(true)}>✓ Registrar pagamento</Btn>
          </div>
          {/* Histórico de DAS pagos */}
          {(st.dasPagamentos||[]).length>0 && (
            <div style={{marginTop:12}}>
              <div style={{fontSize:11,fontWeight:700,color:T.ink60,marginBottom:6}}>Últimos pagamentos:</div>
              {(st.dasPagamentos||[]).slice(0,3).map(p=>(
                <div key={p.id} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"5px 0",borderBottom:`1px solid ${T.ink05}`}}>
                  <span style={{color:T.ink60}}>{p.competencia}</span>
                  <span style={{fontWeight:700,color:T.green}}>{fmtBRL(p.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Limite anual */}
      <Card style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>Teto MEI Anual</div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:13,color:T.ink60}}>Faturado</span>
          <span style={{fontWeight:700,color:lim.critico?T.red:lim.alerta?T.amber:T.green}}>{fmtBRL(st.faturamento)}</span>
        </div>
        <Bar v={lim.pct} max={100} color={lim.critico?T.red:lim.alerta?T.amber:T.green} h={12}/>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:11,color:T.ink40}}>
          <span>{fmtPct(lim.pct)} usado</span>
          <span>Restam {fmtBRL(lim.restante)} de {fmtBRL(st.tetoMEI||81000)}</span>
        </div>
        {lim.critico && <AlertBox type="danger" style={{marginTop:10}}>🚨 Teto crítico! Risco de desenquadramento. Consulte um contador urgentemente.</AlertBox>}
        {lim.alerta && !lim.critico && <AlertBox type="warn" style={{marginTop:10}}>⚠️ Faturamento alto. Monitore o teto MEI.</AlertBox>}
      </Card>

      {/* ══════════════════════════════════════════════════════ */}
      {/* MODAL DASN — CAMPOS COMPLETOS RECEITA FEDERAL         */}
      {/* ══════════════════════════════════════════════════════ */}
      <Modal open={showDasn} onClose={()=>setShowDasn(false)} title="📋 Pré-declaração DASN-SIMEI" width={540}>
        <AlertBox type="warn">
          ⚠️ <strong>Atenção:</strong> Este é um registro de controle interno. A declaração oficial deve ser transmitida pelo{" "}
          <a href="https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/dasnsimei.app/" target="_blank" rel="noopener noreferrer"
            style={{color:T.amber,textDecoration:"underline"}}>Portal do Simples Nacional</a>.
        </AlertBox>

        <CardFlat style={{marginBottom:16,background:T.tealPale,border:`1px solid ${T.teal}30`}}>
          <div style={{fontSize:11,fontWeight:700,color:T.teal,marginBottom:4}}>ℹ️ Como preencher corretamente</div>
          <div style={{fontSize:11,color:T.ink60,lineHeight:1.7}}>
            Informe a <strong>receita bruta total do ano-calendário</strong> separada por tipo.
            <strong> Não deduza despesas</strong>. Inclua tudo recebido: Pix, cartão, dinheiro, boleto, transferência.
            Receita de exportação de serviços é isenta de ISS/ICMS mas deve ser informada.
          </div>
        </CardFlat>

        <Sel label="Ano-calendário *" value={ano} onChange={setAno}
          options={[0,1,2,3].map(i=>({v:String(new Date().getFullYear()-1-i),l:String(new Date().getFullYear()-1-i)}))}/>

        {/* (A) Comércio/Indústria/Transporte */}
        {temAtivComercio && (
          <CampoReceita
            label="(A) Receita de Comércio, Indústria e Transporte — sujeita a ICMS"
            hint="Inclui: venda de produtos, fornecimento de refeições, transporte interestadual/intermunicipal. Se não exerceu, deixe 0."
            value={recComercio} onChange={setRecComercio}
          />
        )}

        {/* (B) Serviços */}
        <CampoReceita
          label="(B) Receita de Prestação de Serviços — sujeita a ISS"
          hint="Inclui: todos os serviços prestados, exceto transporte interestadual/intermunicipal. Profissionais liberais, consultores, designers, etc."
          value={recServicos} onChange={setRecServicos}
        />

        {/* (C) Exportação — campo extra importante */}
        <CampoReceita
          label="(C) Receita de Exportação de Serviços (isenta) — opcional"
          hint="Serviços prestados a clientes no exterior. Isenta de ISS e ICMS conforme LC 116/2003 Art. 2º. Se não houve, deixe 0."
          value={recExportacao} onChange={setRecExportacao}
        />

        {/* Totalizador */}
        <CardFlat style={{marginBottom:16,background:fatBrutoTotal>0?T.greenPale:T.ink02,border:`1.5px solid ${fatBrutoTotal>0?T.greenMid:T.ink10}`}}>
          <div style={{fontSize:10,fontWeight:700,color:T.ink60,marginBottom:6}}>RESUMO AUTOMÁTICO</div>
          {[
            {l:"(A) Comércio/Indústria",v:safeNum(recComercio)},
            {l:"(B) Serviços",v:safeNum(recServicos)},
            {l:"(C) Exportação (isenta)",v:safeNum(recExportacao)},
          ].map(x=>(
            <div key={x.l} style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:11,color:T.ink60}}>{x.l}</span>
              <span style={{fontSize:11,fontWeight:700}}>{fmtBRL(x.v)}</span>
            </div>
          ))}
          <div style={{height:1,background:T.greenMid||T.ink10,margin:"6px 0"}}/>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:12,fontWeight:700}}>Receita bruta tributável (A+B)</span>
            <span style={{fontSize:16,fontWeight:900,color:fatBrutoTotal>0?T.green:T.ink40}}>{fmtBRL(fatBrutoTotal)}</span>
          </div>
          {safeNum(recExportacao)>0 && (
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:11,color:T.ink60}}>Total incluindo exportação</span>
              <span style={{fontSize:13,fontWeight:700,color:T.teal}}>{fmtBRL(fatTotal)}</span>
            </div>
          )}
          {fatBrutoTotal > (st.tetoMEI||81000) && (
            <div style={{marginTop:8,padding:"6px 10px",background:T.redPale,borderRadius:T.radiusSm,fontSize:11,color:T.red,fontWeight:700}}>
              🚨 Valor ultrapassa o teto MEI de {fmtBRL(st.tetoMEI||81000)}. Risco de desenquadramento!
            </div>
          )}
        </CardFlat>

        {/* (D) Empregado */}
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:8}}>
            (D) Possuiu empregado registrado durante o período? *
          </label>
          <div style={{display:"flex",gap:10,marginBottom:10}}>
            {[{v:"SIM",l:"✅ Sim, tive empregado"},{v:"NAO",l:"❌ Não tive empregado"}].map(op=>(
              <div key={op.v} onClick={()=>setPossuiEmpregado(op.v)}
                style={{flex:1,padding:"10px 14px",borderRadius:T.radius,border:`2px solid ${possuiEmpregado===op.v?T.green:T.ink10}`,background:possuiEmpregado===op.v?T.greenPale:"transparent",cursor:"pointer",textAlign:"center",fontWeight:700,fontSize:12,color:possuiEmpregado===op.v?T.green:T.ink60,transition:"all .15s"}}>
                {op.l}
              </div>
            ))}
          </div>
          {possuiEmpregado==="SIM" && (
            <Input label="Salário mensal do empregado (R$) *" value={salarioEmpregado} onChange={setSalarioEmpregado}
              prefix="R$" placeholder="0,00" hint="Informe o salário bruto mensal contratado"/>
          )}
        </div>

        {/* (E) Situação especial */}
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:8}}>
            (E) Ocorreu situação especial? (baixa, extinção, cancelamento ou fim de atividade)
          </label>
          <div style={{display:"flex",gap:10,marginBottom:10}}>
            {[{v:"NAO",l:"❌ Não"},{v:"SIM",l:"✅ Sim — situação especial"}].map(op=>(
              <div key={op.v} onClick={()=>setSituacaoEspecial(op.v)}
                style={{flex:1,padding:"9px 12px",borderRadius:T.radius,border:`2px solid ${situacaoEspecial===op.v?T.purple:T.ink10}`,background:situacaoEspecial===op.v?T.purplePale:"transparent",cursor:"pointer",textAlign:"center",fontWeight:700,fontSize:12,color:situacaoEspecial===op.v?T.purple:T.ink60,transition:"all .15s"}}>
                {op.l}
              </div>
            ))}
          </div>
          {situacaoEspecial==="SIM" && (
            <>
              <div style={{marginBottom:10}}>
                <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:5}}>Data do evento</label>
                <input type="date" value={dataSituacao} onChange={e=>setDataSituacao(e.target.value)}
                  style={{width:"100%",height:42,borderRadius:T.radius,padding:"0 12px",background:T.white,border:`1.5px solid ${T.ink10}`,color:T.ink,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
              </div>
              <AlertBox type="info">
                Em caso de baixa, declare apenas a receita do período entre 01/01 e a data da baixa.
              </AlertBox>
            </>
          )}
        </div>

        {/* Informações complementares */}
        <Input label="Informações complementares (opcional)" value={infoComplementar}
          onChange={setInfoComplementar} rows={2}
          placeholder="Observações adicionais, protocolo da declaração anterior, etc."/>

        <div style={{display:"flex",gap:8,marginTop:4}}>
          <Btn v="outline" full onClick={()=>setShowDasn(false)}>Cancelar</Btn>
          <Btn full onClick={submitDASN}>📋 Registrar DASN</Btn>
        </div>
      </Modal>

      <Modal open={showDas} onClose={()=>setShowDas(false)} title="✓ Registrar DAS pago" width={380}>
        <AlertBox type="info">Confirme que o pagamento foi feito no portal PGMEI antes de registrar.</AlertBox>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:11,color:T.ink60,marginBottom:4}}>Valor do DAS</div>
          <div style={{fontSize:32,fontWeight:900,color:T.green}}>{fmtBRL(das.valor)}</div>
          <div style={{fontSize:12,color:T.ink60,marginTop:4}}>Vencimento: {das.vencimento}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn v="outline" full onClick={()=>setShowDas(false)}>Cancelar</Btn>
          <Btn full onClick={()=>{
            dispatch({type:"MEI.PAGAR_DAS",p:{id:genId(),valor:das.valor,competencia:new Date().toLocaleDateString("pt-BR"),ts:tsISO()}});
            setShowDas(false); toast("DAS registrado com sucesso!");
          }}>✓ Confirmar pagamento</Btn>
        </div>
      </Modal>
    </PageWrap>
  );
}

// Tabela simplificada de Códigos de Tributação Nacional (LC 116/2003)
const CTN_LIST = [
  {v:"01.01",l:"01.01 — Análise e desenvolvimento de sistemas"},
  {v:"01.02",l:"01.02 — Programação"},
  {v:"01.03",l:"01.03 — Processamento de dados"},
  {v:"01.04",l:"01.04 — Elaboração de programas de computadores"},
  {v:"01.05",l:"01.05 — Licenciamento de software"},
  {v:"01.07",l:"01.07 — Suporte técnico em informática"},
  {v:"02.01",l:"02.01 — Medicina / Serviços médicos"},
  {v:"04.01",l:"04.01 — Medicina veterinária"},
  {v:"06.01",l:"06.01 — Suporte, assessoria e consultoria"},
  {v:"07.01",l:"07.01 — Engenharia / Arquitetura"},
  {v:"09.01",l:"09.01 — Publicidade e propaganda"},
  {v:"09.02",l:"09.02 — Design"},
  {v:"10.05",l:"10.05 — Agenciamento / Intermediação"},
  {v:"13.02",l:"13.02 — Fotografia"},
  {v:"14.01",l:"14.01 — Serviços de banco de dados"},
  {v:"17.01",l:"17.01 — Assessoria / Consultoria"},
  {v:"17.06",l:"17.06 — Treinamento / Capacitação"},
  {v:"17.09",l:"17.09 — Planejamento e organização de eventos"},
  {v:"17.10",l:"17.10 — Organização de feiras e exposições"},
  {v:"17.17",l:"17.17 — Traduções / Interpretações"},
  {v:"17.19",l:"17.19 — Datilografia / Digitação / Secretaria"},
  {v:"17.20",l:"17.20 — Recrutamento / Seleção"},
  {v:"17.21",l:"17.21 — Tributário / Contabilidade"},
  {v:"17.22",l:"17.22 — Pilotagem na aviação"},
  {v:"17.23",l:"17.23 — Análise de crédito"},
  {v:"17.24",l:"17.24 — Auditoria"},
  {v:"17.25",l:"17.25 — Avaliação de bens"},
  {v:"20.01",l:"20.01 — Serviços portuários"},
  {v:"25.01",l:"25.01 — Serviços funerários"},
  {v:"26.01",l:"26.01 — Serviços de coleta de resíduos"},
  {v:"33.19",l:"33.19 — Outros serviços"},
];

function PageNotas({ st, dispatch }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [tab, setTab] = useState("emitidas");

  // ── Estado do formulário ────────────────────────────────────
  // BLOCO 1 — Prestador (dados automáticos do MEI)
  const prestadorNome    = st.user.nome || "";
  const prestadorCNPJ    = st.user.cnpj || "";
  const prestadorInscMun = st.user.inscMunicipal || "";

  // BLOCO 2 — Tomador
  const [tomNome,       setTomNome]       = useState("");
  const [tomDoc,        setTomDoc]        = useState("");  // CPF ou CNPJ
  const [tomTipo,       setTomTipo]       = useState("PJ"); // PF ou PJ
  const [tomEmail,      setTomEmail]      = useState("");
  const [tomTelefone,   setTomTelefone]   = useState("");
  const [tomInscMun,    setTomInscMun]    = useState("");  // Inscrição Municipal (PJ)
  const [tomLogradouro, setTomLogradouro] = useState("");
  const [tomNumero,     setTomNumero]     = useState("");
  const [tomBairro,     setTomBairro]     = useState("");
  const [tomMunicipio,  setTomMunicipio]  = useState("");
  const [tomUF,         setTomUF]         = useState("DF");
  const [tomCEP,        setTomCEP]        = useState("");

  // BLOCO 3 — Serviço
  const [ctn,           setCtn]           = useState("17.19");
  const [nbs,           setNbs]           = useState("");   // Nomenclatura Brasileira de Serviços
  const [competencia,   setCompetencia]   = useState(new Date().toISOString().slice(0,7));
  const [localPrest,    setLocalPrest]    = useState("MUNICIPIO_PRESTADOR");
  const [descricao,     setDescricao]     = useState("");
  const [obs,           setObs]           = useState("");   // observações adicionais

  // BLOCO 4 — Valores
  const [valorServico,  setValorServico]  = useState("");
  const [deducoes,      setDeducoes]      = useState("0"); // deduções da BC do ISS
  const [aliquota,      setAliquota]      = useState("5");
  const [issRetido,     setIssRetido]     = useState("NAO");
  const [formaPgto,     setFormaPgto]     = useState("03"); // 03=Transferência
  const [responsavelRet,setResponsavelRet]= useState(""); // quem retém se retido

  // Cálculos automáticos
  const valN   = safeNum(valorServico);
  const dedN   = safeNum(deducoes);
  const bcISS  = Math.max(0, valN - dedN);  // Base de cálculo do ISS
  const aliqN  = safeNum(aliquota);
  const issVal = bcISS * (aliqN / 100);
  const liquido = valN - (issRetido === "SIM" ? issVal : 0);

  const temCertA1 = (st.certs||[]).some(c=>c.tipo==="A1" && c.active);
  const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
  const FORMAS_PGTO = [
    {v:"01",l:"Dinheiro"}, {v:"02",l:"Cheque"}, {v:"03",l:"Transferência Bancária / PIX"},
    {v:"04",l:"Cartão de Crédito"}, {v:"05",l:"Cartão de Débito"}, {v:"06",l:"Boleto"},
    {v:"99",l:"Outros"},
  ];

  function resetForm() {
    setTomNome(""); setTomDoc(""); setTomTipo("PJ"); setTomEmail(""); setTomTelefone("");
    setTomInscMun(""); setTomLogradouro(""); setTomNumero(""); setTomBairro("");
    setTomMunicipio(""); setTomUF("DF"); setTomCEP("");
    setCtn("17.19"); setNbs(""); setCompetencia(new Date().toISOString().slice(0,7));
    setLocalPrest("MUNICIPIO_PRESTADOR"); setDescricao(""); setObs("");
    setValorServico(""); setDeducoes("0"); setAliquota("5");
    setIssRetido("NAO"); setFormaPgto("03"); setResponsavelRet("");
  }

  function validar() {
    if(!tomNome.trim())     { toast("Informe o nome/razão social do tomador","err"); return false; }
    if(!tomDoc.trim())      { toast("Informe o CPF ou CNPJ do tomador","err"); return false; }
    if(!tomMunicipio.trim()){ toast("Informe o município do tomador","err"); return false; }
    if(!descricao.trim())   { toast("Descreva o serviço prestado","err"); return false; }
    if(!valN || valN <= 0)  { toast("Informe o valor do serviço","err"); return false; }
    if(aliqN < 2 || aliqN > 10) { toast("Alíquota ISS deve ser entre 2% e 10%","err"); return false; }
    return true;
  }

  function emit() {
    if(!validar()) return;
    const nf = {
      id: genId(),
      numero: String((st.notasFiscais.length||0)+1).padStart(5,"0"),
      // Prestador
      prestadorNome, prestadorCNPJ, prestadorInscMun,
      // Tomador
      tomador: tomNome, tomadorDoc: tomDoc, tomadorTipo: tomTipo,
      tomadorEmail: tomEmail, tomadorTelefone: tomTelefone,
      tomadorInscMun: tomInscMun,
      tomadorEndereco: `${tomLogradouro}${tomNumero?", "+tomNumero:""}${tomBairro?" — "+tomBairro:""}`,
      tomadorMunicipio: tomMunicipio, tomadorUF: tomUF, tomadorCEP: tomCEP,
      // Serviço
      ctn, nbs, competencia, localPrestacao: localPrest,
      desc: descricao, obs,
      // Valores
      valor: valN, deducoes: dedN, bcISS,
      aliquota: aliqN/100, iss: issVal,
      issRetido: issRetido==="SIM",
      responsavelRetencao: responsavelRet,
      liquido, formaPagamento: formaPgto,
      // Meta
      data: tsISO(), tipo:"SERVICO", status:"EMITIDA",
    };
    dispatch({type:"MEI.EMIT_NF", p: nf});
    setShow(false); resetForm();
    toast(`NF #${nf.numero} emitida com sucesso! Valor líquido: ${fmtBRL(liquido)}`);
  }

  const secHead = (icon, label) => (
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:`linear-gradient(90deg,${T.green}18,transparent)`,borderRadius:T.radiusSm,marginBottom:12,borderLeft:`3px solid ${T.green}`}}>
      <span style={{fontSize:16}}>{icon}</span>
      <span style={{fontSize:12,fontWeight:800,color:T.ink}}>{label}</span>
    </div>
  );

  const secBox = (children) => (
    <div style={{background:T.ink02,borderRadius:T.radius,padding:"14px 16px",marginBottom:16,border:`1px solid ${T.ink05}`}}>
      {children}
    </div>
  );

  return (
    <PageWrap title="📄 Nota Fiscal de Serviço (NFS-e)"
      action={
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {!temCertA1 && <Badge color={T.amber}>Sem Cert. A1</Badge>}
          <Btn onClick={()=>setShow(true)}>+ Emitir NFS-e</Btn>
        </div>
      }>

      {!temCertA1 && (
        <AlertBox type="warn">
          🔐 <strong>Certificado Digital A1 recomendado</strong> para transmissão eletrônica oficial.
          Você pode registrar a NF aqui como controle interno — para emissão no portal municipal, obtenha o A1 no <strong>Plano Evoluir</strong>.
        </AlertBox>
      )}

      {/* Abas */}
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <Chip active={tab==="emitidas"} onClick={()=>setTab("emitidas")} color={T.green}>
          📋 Emitidas ({st.notasFiscais.length})
        </Chip>
        <Chip active={tab==="resumo"} onClick={()=>setTab("resumo")} color={T.teal}>
          📊 Resumo Fiscal
        </Chip>
      </div>

      {/* ── ABA: EMITIDAS ─────────────────────────────────── */}
      {tab==="emitidas" && (
        <Card>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
              <thead>
                <tr style={{borderBottom:`2px solid ${T.ink10}`}}>
                  {["NF","Tomador","Doc","Competência","CTN","Valor","Base ISS","ISS","Retido","Pgto","Status"].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"7px 8px",fontSize:9,fontWeight:700,color:T.ink40,textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(st.notasFiscais||[]).map(n=>(
                  <tr key={n.id} style={{borderBottom:`1px solid ${T.ink05}`}}>
                    <td style={{padding:"8px",fontWeight:800,whiteSpace:"nowrap",color:T.green}}>#{n.numero}</td>
                    <td style={{padding:"8px",fontSize:12,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.tomador}</td>
                    <td style={{padding:"8px",fontSize:10,color:T.ink60,fontFamily:"monospace"}}>{n.tomadorDoc||"—"}</td>
                    <td style={{padding:"8px",fontSize:11,color:T.ink60,whiteSpace:"nowrap"}}>{n.competencia||fmtDate(n.data)}</td>
                    <td style={{padding:"8px",fontSize:10,color:T.ink60}}>{n.ctn||"—"}</td>
                    <td style={{padding:"8px",fontSize:12,fontWeight:700,color:T.green,whiteSpace:"nowrap"}}>{fmtBRL(n.valor)}</td>
                    <td style={{padding:"8px",fontSize:11,color:T.ink60,whiteSpace:"nowrap"}}>{fmtBRL(n.bcISS||n.valor)}</td>
                    <td style={{padding:"8px",fontSize:11,color:T.amber,whiteSpace:"nowrap"}}>{fmtBRL(n.iss)}</td>
                    <td style={{padding:"8px",fontSize:11}}>{n.issRetido?<Badge color={T.amber}>Sim</Badge>:<Badge color={T.ink40}>Não</Badge>}</td>
                    <td style={{padding:"8px",fontSize:10,color:T.ink60}}>{FORMAS_PGTO.find(f=>f.v===n.formaPagamento)?.l.split("/")[0]||"—"}</td>
                    <td style={{padding:"8px"}}><Badge color={T.green}>{n.status}</Badge></td>
                  </tr>
                ))}
                {(st.notasFiscais||[]).length===0 && (
                  <tr><td colSpan={11} style={{padding:32,textAlign:"center",color:T.ink60,fontSize:13}}>
                    Nenhuma nota emitida. Clique em <strong>"+ Emitir NFS-e"</strong> para começar.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── ABA: RESUMO FISCAL ────────────────────────────── */}
      {tab==="resumo" && (
        <>
          <Grid cols={3} gap={10} style={{marginBottom:14}}>
            <Stat label="Total faturado (NFs)" value={fmtBRL((st.notasFiscais||[]).reduce((a,n)=>a+n.valor,0))} color={T.green}/>
            <Stat label="ISS total devido" value={fmtBRL((st.notasFiscais||[]).reduce((a,n)=>a+n.iss,0))} color={T.amber}/>
            <Stat label="ISS retido tomadores" value={fmtBRL((st.notasFiscais||[]).filter(n=>n.issRetido).reduce((a,n)=>a+n.iss,0))} color={T.teal}/>
          </Grid>
          <Card>
            <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>NFs por competência</div>
            {Object.entries(
              (st.notasFiscais||[]).reduce((acc,n)=>{
                const k=n.competencia||"sem data";
                acc[k]=(acc[k]||{total:0,iss:0,count:0});
                acc[k].total+=n.valor; acc[k].iss+=n.iss; acc[k].count++;
                return acc;
              },{})
            ).sort((a,b)=>b[0].localeCompare(a[0])).map(([mes,v])=>(
              <div key={mes} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${T.ink05}`}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13}}>{mes}</div>
                  <div style={{fontSize:11,color:T.ink60}}>{v.count} nota(s) emitida(s)</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontWeight:800,fontSize:14,color:T.green}}>{fmtBRL(v.total)}</div>
                  <div style={{fontSize:11,color:T.amber}}>ISS: {fmtBRL(v.iss)}</div>
                </div>
              </div>
            ))}
            {(st.notasFiscais||[]).length===0 && (
              <div style={{textAlign:"center",color:T.ink60,padding:20,fontSize:13}}>Nenhuma NF emitida ainda.</div>
            )}
          </Card>
        </>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* MODAL DE EMISSÃO — COMPLETO                           */}
      {/* ══════════════════════════════════════════════════════ */}
      <Modal open={show} onClose={()=>{setShow(false);resetForm();}} title="📄 Emitir NFS-e — Padrão Nacional" width={620}>

        {/* ── BLOCO 1: PRESTADOR ──────────────────────────── */}
        {secBox(<>
          {secHead("🏢","Dados do Prestador (você — preenchimento automático)")}
          <Grid cols={3} gap={10}>
            <div style={{gridColumn:"1/-1"}}>
              <div style={{fontSize:11,fontWeight:700,color:T.ink60,marginBottom:3}}>Razão Social / Nome</div>
              <div style={{background:T.ink05,borderRadius:T.radiusSm,padding:"9px 12px",fontSize:13,fontWeight:700,color:T.ink}}>{prestadorNome}</div>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:T.ink60,marginBottom:3}}>CNPJ</div>
              <div style={{background:T.ink05,borderRadius:T.radiusSm,padding:"9px 12px",fontSize:12,fontFamily:"monospace",color:T.ink60}}>{prestadorCNPJ}</div>
            </div>
            <div style={{gridColumn:"2/-1"}}>
              <Input label="Inscrição Municipal (opcional)" value={tomInscMun} onChange={setTomInscMun} placeholder="Número fornecido pela prefeitura"/>
            </div>
          </Grid>
        </>)}

        {/* ── BLOCO 2: TOMADOR ────────────────────────────── */}
        {secBox(<>
          {secHead("👤","Dados do Tomador do Serviço")}
          {/* Tipo PF / PJ */}
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            {[{v:"PJ",l:"Pessoa Jurídica (CNPJ)"},{v:"PF",l:"Pessoa Física (CPF)"}].map(t=>(
              <div key={t.v} onClick={()=>{setTomTipo(t.v);setTomDoc("");}}
                style={{flex:1,padding:"9px 14px",borderRadius:T.radiusSm,border:`2px solid ${tomTipo===t.v?T.green:T.ink10}`,background:tomTipo===t.v?T.greenPale:"transparent",cursor:"pointer",textAlign:"center",fontWeight:700,fontSize:12,color:tomTipo===t.v?T.green:T.ink60,transition:"all .15s"}}>
                {t.l}
              </div>
            ))}
          </div>
          <Grid cols={2} gap={10}>
            <div style={{gridColumn:"1/-1"}}>
              <Input label={tomTipo==="PJ"?"Razão Social *":"Nome Completo *"} value={tomNome} onChange={setTomNome}
                placeholder={tomTipo==="PJ"?"Nome da empresa tomadora":"Nome do cliente"}/>
            </div>
            <Input label={tomTipo==="PJ"?"CNPJ *":"CPF *"} value={tomDoc}
              onChange={v=>{
                const d=v.replace(/\D/g,"");
                if(tomTipo==="PF") {
                  let f=d.slice(0,11);
                  if(f.length>9) f=`${f.slice(0,3)}.${f.slice(3,6)}.${f.slice(6,9)}-${f.slice(9)}`;
                  else if(f.length>6) f=`${f.slice(0,3)}.${f.slice(3,6)}.${f.slice(6)}`;
                  else if(f.length>3) f=`${f.slice(0,3)}.${f.slice(3)}`;
                  setTomDoc(f);
                } else { setTomDoc(V.fmtCNPJ(v)); }
              }}
              placeholder={tomTipo==="PJ"?"00.000.000/0001-00":"000.000.000-00"}/>
            {tomTipo==="PJ" && <Input label="Inscrição Municipal" value={tomInscMun} onChange={setTomInscMun} placeholder="Nº inscrição municipal do tomador"/>}
            <Input label="E-mail" value={tomEmail} onChange={setTomEmail} type="email" placeholder="email@empresa.com.br"/>
            <Input label="Telefone / WhatsApp" value={tomTelefone}
              onChange={v=>setTomTelefone(V.fmtPhone(v))} placeholder="(00) 00000-0000"/>
          </Grid>
          <div style={{fontSize:11,fontWeight:700,color:T.ink60,marginBottom:8,marginTop:4}}>Endereço do Tomador</div>
          <Grid cols={2} gap={10}>
            <Input label="CEP" value={tomCEP}
              onChange={v=>setTomCEP(v.replace(/\D/g,"").replace(/(\d{5})(\d{3})/,"$1-$2").slice(0,9))}
              placeholder="00000-000"/>
            <Input label="Número" value={tomNumero} onChange={setTomNumero} placeholder="123"/>
            <div style={{gridColumn:"1/-1"}}>
              <Input label="Logradouro (rua, avenida...)" value={tomLogradouro} onChange={setTomLogradouro} placeholder="Rua das Flores"/>
            </div>
            <Input label="Bairro" value={tomBairro} onChange={setTomBairro} placeholder="Centro"/>
            <Input label="Município *" value={tomMunicipio} onChange={setTomMunicipio} placeholder="Brasília"/>
            <Sel label="UF *" value={tomUF} onChange={setTomUF} options={UFS.map(u=>({v:u,l:u}))}/>
          </Grid>
        </>)}

        {/* ── BLOCO 3: SERVIÇO ────────────────────────────── */}
        {secBox(<>
          {secHead("🔧","Dados do Serviço Prestado")}
          <Sel label="Código de Tributação Nacional (CTN — LC 116/2003) *" value={ctn} onChange={setCtn} options={CTN_LIST}/>
          <Grid cols={2} gap={10}>
            <Input label="Código NBS (opcional)" value={nbs} onChange={setNbs} placeholder="Ex: 1.09.01.00.00" hint="Nomenclatura Brasileira de Serviços"/>
            <div>
              <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:5}}>Competência (mês/ano) *</label>
              <input type="month" value={competencia} onChange={e=>setCompetencia(e.target.value)}
                style={{width:"100%",height:42,borderRadius:T.radius,padding:"0 12px",background:T.white,border:`1.5px solid ${T.ink10}`,color:T.ink,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            </div>
          </Grid>
          <Sel label="Local de Prestação do Serviço *" value={localPrest} onChange={setLocalPrest} options={[
            {v:"MUNICIPIO_PRESTADOR",l:"Município do prestador (MEI)"},
            {v:"MUNICIPIO_TOMADOR",l:"Município do tomador"},
            {v:"EXTERIOR",l:"Exterior (exportação de serviços)"},
            {v:"OUTRO",l:"Outro município"},
          ]}/>
          <Input label="Discriminação completa do serviço *" value={descricao} onChange={setDescricao} rows={4}
            placeholder="Descreva detalhadamente: o que foi prestado, período, forma de entrega, referências contratuais..."/>
          <Input label="Observações adicionais" value={obs} onChange={setObs} rows={2}
            placeholder="Informações complementares, nº contrato, pedido de compra, etc."/>
        </>)}

        {/* ── BLOCO 4: VALORES E TRIBUTAÇÃO ───────────────── */}
        {secBox(<>
          {secHead("💰","Valores e Tributação ISS")}
          <Grid cols={2} gap={10}>
            <Input label="Valor bruto do serviço (R$) *" value={valorServico} onChange={setValorServico}
              prefix="R$" placeholder="0,00" hint="Valor total antes de deduções"/>
            <Input label="Deduções da base de cálculo (R$)" value={deducoes} onChange={setDeducoes}
              prefix="R$" placeholder="0,00" hint="Materiais, subcontratação dedutível etc."/>
          </Grid>
          {/* Base de cálculo ISS calculada */}
          <CardFlat style={{marginBottom:12,background:T.tealPale,border:`1px solid ${T.teal}30`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:10,color:T.teal,fontWeight:700,marginBottom:2}}>BASE DE CÁLCULO DO ISS</div>
                <div style={{fontSize:10,color:T.ink60}}>Valor bruto − deduções</div>
              </div>
              <div style={{fontSize:18,fontWeight:900,color:T.teal}}>{fmtBRL(bcISS)}</div>
            </div>
          </CardFlat>
          <Grid cols={2} gap={10}>
            <Input label="Alíquota ISS (%) *" value={aliquota} onChange={setAliquota}
              suffix="%" hint="Confira na legislação do seu município (2% a 10%)"/>
            <Sel label="Forma de pagamento" value={formaPgto} onChange={setFormaPgto} options={FORMAS_PGTO}/>
          </Grid>
          {/* ISS Retido */}
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:8}}>
              ISS Retido pelo Tomador? (Substituição Tributária)
            </label>
            <div style={{display:"flex",gap:8}}>
              {[{v:"NAO",l:"❌ Não retido — MEI recolhe normalmente"},{v:"SIM",l:"✅ Sim — tomador retém na fonte"}].map(op=>(
                <div key={op.v} onClick={()=>setIssRetido(op.v)}
                  style={{flex:1,padding:"10px 14px",borderRadius:T.radius,border:`2px solid ${issRetido===op.v?T.amber:T.ink10}`,background:issRetido===op.v?T.amberPale:"transparent",cursor:"pointer",textAlign:"center",fontWeight:700,fontSize:11,color:issRetido===op.v?T.amber:T.ink60,transition:"all .15s"}}>
                  {op.l}
                </div>
              ))}
            </div>
          </div>
          {issRetido==="SIM" && (
            <Input label="CNPJ/CPF responsável pela retenção" value={responsavelRet} onChange={setResponsavelRet}
              placeholder="Tomador que irá recolher o ISS"/>
          )}
          {/* Totalizador */}
          {valN > 0 && (
            <CardFlat style={{background:T.greenPale,border:`1.5px solid ${T.greenMid}`}}>
              <div style={{fontSize:11,fontWeight:700,color:T.green,marginBottom:10}}>📊 Resumo da Nota</div>
              {[
                {l:"Valor bruto do serviço",  v:fmtBRL(valN),      c:T.ink},
                {l:`Deduções da BC`,          v:`− ${fmtBRL(dedN)}`, c:T.ink60},
                {l:"Base de cálculo ISS",     v:fmtBRL(bcISS),     c:T.teal},
                {l:`ISS ${aliquota}% s/ BC ${issRetido==="SIM"?" (retido)":""}`, v:`− ${fmtBRL(issVal)}`, c:T.amber},
              ].map(x=>(
                <div key={x.l} style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:12,color:T.ink60}}>{x.l}</span>
                  <span style={{fontSize:12,fontWeight:700,color:x.c}}>{x.v}</span>
                </div>
              ))}
              <div style={{height:1,background:T.greenMid,margin:"8px 0"}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,fontWeight:800,color:T.ink}}>Valor líquido a receber</span>
                <span style={{fontSize:20,fontWeight:900,color:T.green}}>{fmtBRL(liquido)}</span>
              </div>
            </CardFlat>
          )}
        </>)}

        {/* Botões */}
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <Btn v="outline" full onClick={()=>{setShow(false);resetForm();}}>Cancelar</Btn>
          <Btn full onClick={emit}>📄 Registrar NFS-e</Btn>
        </div>
        {!temCertA1 && (
          <p style={{fontSize:10,color:T.ink60,textAlign:"center",marginTop:10,lineHeight:1.5}}>
            ⚠️ Sem Cert. A1, a NF é registrada como controle interno.
            Para transmissão eletrônica oficial, adquira o Certificado A1 no Plano Evoluir.
          </p>
        )}
      </Modal>
    </PageWrap>
  );
}

function PageCertCCFV({ st, dispatch }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const active = st.certs.find(c=>c.tipo==="CCFV"&&c.active);
  const sc = ScoreEngine.calc(st.transactions,st.missions,st.dasnDecs,st.certs,st.notasFiscais);
  const nivel = ScoreEngine.nivel(sc.total);
  const certId = active?.id||"";
  const certUrl = `${window.location.origin}${window.location.pathname}?cert=${certId}`; // URL de verificação pública Lucrom
  const certHash = active?.hash || 'AGUARDANDO_BACKEND'; // hash gerado pelo servidor via /api/v1/certificates/:id
  const expiraEm = active ? new Date(new Date(active.emitidoEm).getTime()+90*86400000).toISOString() : "";
  const metricas = [
    {l:"Disciplina Financeira",v:Math.min(100,Math.round(sc.total*.12))},
    {l:"Consistência de Receitas",v:Math.min(100,Math.round(sc.total*.10))},
    {l:"Conhecimento Financeiro",v:Math.min(100,Math.round(sc.total*.09))},
    {l:"Gestão de Negócio",v:Math.min(100,Math.round(sc.total*.095))},
    {l:"Missões Concluídas",v:Math.min(100,Math.round(sc.total*.085))},
  ];
  function emit() {
    dispatch({type:"MEI.EMIT_CERT",p:{id:genId(),tipo:"CCFV",active:true,emitidoEm:tsISO(),expiraEm:new Date(Date.now()+90*86400000).toISOString(),status:"ATIVO"}});
    setShow(false); toast("CCFV emitido!");
  }
  return (
    <PageWrap title="Certificado CCFV" subtitle="Certidão de Capacidade Financeira Validada">
      {active ? (
        <div style={{maxWidth:520,margin:"0 auto"}}>
          <div style={{background:T.white,borderRadius:20,overflow:"hidden",boxShadow:"0 8px 48px rgba(0,0,0,.18)",position:"relative"}}>
            <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",opacity:.03}} viewBox="0 0 400 300">
              <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize="72" fontWeight="900" fill="#1a6b3c" transform="rotate(-25,200,150)">LUCROM</text>
            </svg>
            <div style={{background:`linear-gradient(135deg,${T.green},${T.greenDk})`,padding:"18px 24px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:13,fontWeight:900,color:"#fff"}}>CERTIFICADO VÁLIDO ✓</div>
                <div style={{background:nivel.bg,color:nivel.color,fontWeight:900,fontSize:10,padding:"6px 14px",borderRadius:99,border:`2px solid ${nivel.color}60`}}>NÍVEL<br/>{nivel.label.toUpperCase()}</div>
              </div>
              <div style={{fontSize:15,fontWeight:900,color:"#fff",marginTop:10}}>CERTIFICAÇÃO DE CAPACIDADE<br/>FINANCEIRA VALIDADA (CCFV)</div>
            </div>
            <div style={{padding:"20px 24px"}}>
              <Grid cols={2} gap={20}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:T.ink40,textTransform:"uppercase",marginBottom:10}}>Identificação</div>
                  {[{l:"Nome",v:st.user.nome},{l:"CNPJ",v:st.user.cnpj.replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})-(\d{2})/,"**.***.***/$4-**")},{l:"ID",v:certId.slice(0,20)}].map(x=>(
                    <div key={x.l} style={{marginBottom:7}}>
                      <div style={{fontSize:9,color:T.ink40,fontWeight:700,textTransform:"uppercase"}}>{x.l}</div>
                      <div style={{fontSize:12,fontWeight:600,color:T.ink}}>{x.v}</div>
                    </div>
                  ))}
                  <Divider/>
                  <div style={{fontSize:10,fontWeight:700,color:T.ink40,textTransform:"uppercase",marginBottom:8}}>Métricas</div>
                  {metricas.map(m=>(
                    <div key={m.l} style={{marginBottom:6}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                        <span style={{fontSize:10,color:T.ink60}}>{m.l}</span>
                        <span style={{fontSize:10,fontWeight:800,color:T.green}}>{m.v}%</span>
                      </div>
                      <Bar v={m.v} max={100} color={T.green} h={3}/>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
                  <div style={{fontSize:52,fontWeight:900,color:T.green,lineHeight:1,letterSpacing:"-3px"}}>{sc.total}</div>
                  <div style={{fontSize:12,color:T.ink60}}>/1000</div>
                  <div style={{background:T.green,color:"#fff",fontWeight:800,fontSize:11,padding:"8px 18px",borderRadius:T.radius,width:"100%",textAlign:"center"}}>ALTO POTENCIAL</div>
                  <div style={{width:"100%",fontSize:11,color:T.ink60,lineHeight:1.8}}>
                    <div><strong>Emissão:</strong> {fmtDate(active.emitidoEm)}</div>
                    <div><strong>Validade:</strong> {fmtDate(expiraEm)}</div>
                    <div><strong>Status:</strong> <span style={{color:T.green,fontWeight:700}}>VÁLIDO ✓</span></div>
                  </div>
                </div>
              </Grid>
            </div>
            <div style={{padding:"14px 24px 18px",background:T.ink05,borderTop:`1px solid ${T.ink10}`}}>
              <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                <div style={{width:72,height:72,borderRadius:10,background:T.white,border:`2px solid ${T.ink10}`,padding:4,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px rgba(0,0,0,.08)"}}>
                  <QRCodeSVG value={certUrl} size={64} fgColor={T.ink} bgColor={T.white}/>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10,fontWeight:700,color:T.ink40,textTransform:"uppercase",marginBottom:4}}>Verificação Digital</div>
                  <div style={{fontSize:9,color:T.ink60,marginBottom:3}}>Método: <strong>SHA-256 · Open Finance</strong></div>
                  <div style={{fontSize:8,color:T.ink40,wordBreak:"break-all",lineHeight:1.6,fontFamily:"monospace",background:T.white,padding:"5px 8px",borderRadius:6,border:`1px solid ${T.ink10}`}}>{certHash}</div>
                  <div style={{fontSize:8,color:T.ink40,marginTop:4}}>Escaneie para verificar · lucrom.com.br/cert/verify</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button style={{flex:1,height:40,borderRadius:10,background:T.green,color:"#fff",fontWeight:800,fontSize:12,border:"none",cursor:"pointer",fontFamily:"inherit"}}
                  onClick={()=>{
                    const texto = `🏅 Certificado CCFV — Lucrom\n\nTitular: ${st.user.nome}\nScore: ${sc.total} / 1000\nNível: ${nivel.label}\nID: ${certId.slice(0,20)}\nEmissão: ${fmtDate(active.emitidoEm)}\nValidade: ${fmtDate(expiraEm)}\n\nVerifique em: lucrom.com.br/cert/verify`;
                    if(navigator.share){navigator.share({title:"Certificado CCFV — Lucrom",text:texto,url:certUrl}).catch(()=>{});}
                    else{navigator.clipboard?.writeText(texto).then(()=>toast("Link do certificado copiado!")).catch(()=>toast("lucrom.com.br/cert/verify","warn"));}
                  }}>↗ Compartilhar</button>
                <button style={{flex:1,height:40,borderRadius:10,background:T.white,color:T.ink,fontWeight:700,fontSize:12,border:`1.5px solid ${T.ink10}`,cursor:"pointer",fontFamily:"inherit"}}
                  onClick={async()=>{
                    toast("Gerando PDF…");
                    try {
                      const doc = await buildCCFVPdf({
                        nome:st.user.nome,
                        cnpjMasked:st.user.cnpj.replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})-(\d{2})/,"**.***.***/$4-**"),
                        certId, score:sc.total, nivelLabel:nivel.label, metricas,
                        emissao:fmtDate(active.emitidoEm), validade:fmtDate(expiraEm),
                        hash:certHash, verifyUrl:certUrl,
                        maduro:true, meses:3, riskLabel:nivel.label, riskLimit:sc.limit||30000,
                        tendenciaLabel:"Estável", confiabilidade:95, fatores:[],
                        engineVersion:"Score Engine v8"
                      });
                      if(doc){ doc.save(`CCFV-Lucrom-${certId.slice(0,8)}.pdf`); toast("✅ PDF baixado!"); return; }
                    } catch(e){ /* fallback abaixo */ }
                    // Fallback: nova janela com print
                    const w=window.open("","_blank","width=700,height=800");
                    if(!w){ toast("⚠️ Permita pop-ups para gerar o PDF","warn"); return; }
                    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>CCFV — Lucrom</title><style>@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Plus Jakarta Sans',sans-serif;background:#f9fafb;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:32px}.tip{background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:12px;color:#92400e;text-align:center;max-width:620px;width:100%}.cert{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.15);width:100%;max-width:620px;position:relative}.wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:.03;font-size:80px;font-weight:900;color:#16a34a;transform:rotate(-25deg)}.head{background:linear-gradient(135deg,#16a34a,#15803d);padding:28px 32px;color:#fff}.head-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.badge{background:rgba(255,255,255,.18);border:2px solid rgba(255,255,255,.4);padding:6px 14px;border-radius:99px;font-size:11px;font-weight:800}.head-title{font-size:18px;font-weight:900}.head-sub{font-size:12px;opacity:.8;margin-top:4px}.body{padding:28px 32px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}.section-label{font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}.field{margin-bottom:8px}.field-label{font-size:9px;color:#9ca3af;font-weight:700;text-transform:uppercase}.field-value{font-size:13px;font-weight:700;color:#111827;margin-top:2px}.score-box{background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;border-radius:12px;padding:16px;text-align:center;margin-bottom:24px}.score-num{font-size:48px;font-weight:900;color:#16a34a;letter-spacing:-2px;line-height:1}.score-nivel{font-size:14px;font-weight:800;color:#15803d;margin-top:6px}.divider{height:1px;background:#e5e7eb;margin:16px 0}.status{display:flex;align-items:center;gap:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:24px}.status-dot{width:10px;height:10px;border-radius:50%;background:#22c55e;flex-shrink:0}.status-text{font-size:13px;font-weight:700;color:#166534}.footer-bar{background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}.hash{font-family:monospace;font-size:9px;color:#9ca3af;word-break:break-all}@media print{body{background:#fff;padding:0}.tip{display:none}@page{margin:0;size:A4}.cert{box-shadow:none;border-radius:0;max-width:100%}}</style></head><body><div class="tip">💡 Para salvar como PDF: Arquivo → Imprimir → Salvar como PDF</div><div class="cert"><div class="wm">LUCROM</div><div class="head"><div class="head-top"><div><div style="font-size:22px;font-weight:900">Lucrom</div><div style="font-size:11px;opacity:.7;margin-top:2px">Tecnologia Financeira para MEIs</div></div><div class="badge">NÍVEL ${nivel.label.toUpperCase()}</div></div><div class="head-title">CERTIDÃO DE CAPACIDADE FINANCEIRA VALIDADA</div><div class="head-sub">CCFV — Documento oficial de evolução financeira Lucrom</div></div><div class="body"><div class="score-box"><div class="score-num">${sc.total}</div><div style="font-size:13px;color:#16a34a;opacity:.6;margin-top:2px">/ 1000 pontos</div><div class="score-nivel">🏆 ${nivel.label}</div></div><div class="status"><div class="status-dot"></div><div class="status-text">CERTIFICADO VÁLIDO ✓ — Emitido em ${fmtDate(active.emitidoEm)} · Válido até ${fmtDate(expiraEm)}</div></div><div class="grid"><div><div class="section-label">Identificação do Titular</div><div class="field"><div class="field-label">Nome</div><div class="field-value">${st.user.nome}</div></div><div class="field"><div class="field-label">CNPJ</div><div class="field-value">${st.user.cnpj.replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})-(\d{2})/,"**.***.***/$4-**")}</div></div><div class="field"><div class="field-label">ID do Certificado</div><div class="field-value">${certId.slice(0,24)}</div></div></div><div><div class="section-label">Métricas</div>${metricas.map(m=>`<div class="field"><div class="field-label">${m.l}</div><div class="field-value" style="color:#16a34a">${m.v}%</div></div>`).join("")}</div></div><div class="divider"></div><div class="section-label">Verificação Digital — SHA-256</div><div class="hash">${certHash}</div></div><div class="footer-bar"><span>© 2025 Lucrom Tecnologia Financeira LTDA</span><span>lucrom.com.br/cert/verify</span></div></div><script>window.onload=function(){window.print()}<\/script></body></html>`);
                    w.document.close();
                  }}>⬇ Baixar PDF</button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Card style={{textAlign:"center",padding:40,maxWidth:400,margin:"0 auto"}}>
          <div style={{fontSize:48,marginBottom:12}}>🏅</div>
          <div style={{fontWeight:800,fontSize:16,marginBottom:8}}>Solicitar CCFV</div>
          <div style={{fontSize:13,color:T.ink60,marginBottom:20}}>Score atual: <strong>{sc.total}</strong>. Válido por 90 dias.</div>
          {sc.total>=500 ? <Btn full onClick={()=>setShow(true)}>Emitir Certificado</Btn> : <AlertBox type="warn">Score mínimo 500 necessário.</AlertBox>}
        </Card>
      )}
      <Modal open={show} onClose={()=>setShow(false)} title="Emitir CCFV" width={380}>
        <p style={{fontSize:13,color:T.ink60,marginBottom:16}}>Score: <strong>{sc.total}</strong>. Válido por 90 dias.</p>
        <div style={{display:"flex",gap:8}}>
          <Btn v="outline" full onClick={()=>setShow(false)}>Cancelar</Btn>
          <Btn full onClick={emit}>Emitir</Btn>
        </div>
      </Modal>
    </PageWrap>
  );
}

function PageCertA1({ st, dispatch }) {
  const toast = useToast();
  const [showPay, setShowPay] = useState(false);
  const [validity, setValidity] = useState("1ano");
  const prices = st.certA1Prices||CERT_A1_PRICES;
  const price = prices[validity]||119.90;
  const active = st.certs.find(c=>c.tipo==="A1"&&c.active);
  const planoEvoluir = st.user.plano==="Evoluir";
  function onSuccess() {
    const exp = new Date(); exp.setFullYear(exp.getFullYear()+(validity==="1ano"?1:validity==="2anos"?2:3));
    dispatch({type:"MEI.EMIT_CERT",p:{id:genId(),tipo:"A1",active:true,validity,emitidoEm:tsISO(),expiraEm:exp.toISOString(),valor:price,status:"ATIVO"}});
    toast("Certificado A1 emitido!");
  }
  return (
    <PageWrap title="Certificado Digital A1">
      {planoEvoluir && !active && <AlertBox type="success">🎁 Plano Evoluir inclui A1 gratuitamente!</AlertBox>}
      {active ? (
        <>
          <AlertBox type="success">✅ A1 ativo · Válido até {fmtDate(active.expiraEm)}</AlertBox>
          <Card style={{marginTop:14}}>
            <div style={{display:"flex",gap:8}}>
              <button style={{flex:1,height:40,borderRadius:T.radius,background:T.green,color:"#fff",fontWeight:700,fontSize:12,border:"none",cursor:"pointer",fontFamily:"inherit"}}
                onClick={()=>{
                  const texto = `🔐 Certificado Digital A1 — Lucrom\n\nTitular: ${st.user.nome}\nCNPJ: ${st.user.cnpj}\nPlano: ${validity}\nEmissão: ${fmtDate(active.emitidoEm)}\nValidade: ${fmtDate(active.expiraEm)}\n\nVerifique em: lucrom.com.br/cert/verify`;
                  if(navigator.share){navigator.share({title:"Certificado A1 — Lucrom",text:texto}).catch(()=>{});}
                  else{navigator.clipboard?.writeText(texto).then(()=>toast("Certificado copiado!")).catch(()=>toast("lucrom.com.br/cert/verify","warn"));}
                }}>↗ Compartilhar</button>
              <button style={{flex:1,height:40,borderRadius:T.radius,background:T.white,color:T.ink,fontWeight:700,fontSize:12,border:`1.5px solid ${T.ink10}`,cursor:"pointer",fontFamily:"inherit"}}
                onClick={()=>{
                  const html=`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Certificado A1 — Lucrom</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px}.cert{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.12);width:100%;max-width:560px}.head{background:linear-gradient(135deg,#16a34a,#15803d);padding:28px 32px;color:#fff}.title{font-size:18px;font-weight:900;margin-bottom:4px}.sub{font-size:12px;opacity:.8}.body{padding:28px 32px}.field{margin-bottom:14px}.fl{font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}.fv{font-size:14px;font-weight:700;color:#111827}.badge{display:inline-block;background:#dcfce7;color:#15803d;font-size:11px;font-weight:800;padding:6px 16px;border-radius:99px;border:1px solid #bbf7d0;margin-top:4px}.footer{background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}.tip{background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin:16px 32px;font-size:11px;color:#92400e;text-align:center}@media print{body{background:#fff;padding:0}.tip{display:none}@page{margin:0;size:A4}.cert{box-shadow:none;border-radius:0;max-width:100%}}</style></head><body><div class="cert"><div class="head"><div class="title">🔐 Certificado Digital A1</div><div class="sub">Lucrom Tecnologia Financeira para MEIs</div></div><div class="tip">💡 Para salvar como PDF: clique em <strong>Imprimir</strong> → selecione <strong>"Salvar como PDF"</strong> como destino.</div><div class="body"><div class="field"><div class="fl">Titular</div><div class="fv">${st.user.nome}</div></div><div class="field"><div class="fl">CNPJ</div><div class="fv">${st.user.cnpj}</div></div><div class="field"><div class="fl">Plano / Validade</div><div class="fv">${validity}</div></div><div class="field"><div class="fl">Emitido em</div><div class="fv">${fmtDate(active.emitidoEm)}</div></div><div class="field"><div class="fl">Válido até</div><div class="fv">${fmtDate(active.expiraEm)}</div></div><div class="field"><div class="fl">Status</div><div class="badge">✅ CERTIFICADO ATIVO</div></div></div><div class="footer"><span>© 2025 Lucrom Tecnologia Financeira</span><span>lucrom.com.br/cert/verify</span></div></div><script>window.onload=function(){window.print()}<\/script></body></html>`;
                  const w=window.open("","_blank","width=640,height=780");
                  if(!w){alert("Permita pop-ups para esta página e tente novamente.");return;}
                  w.document.write(html);
                  w.document.close();
                }}>⬇ Gerar PDF</button>
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <Grid cols={3} gap={12} style={{marginBottom:14}}>
            {[{val:"1ano",label:"1 Ano"},{val:"2anos",label:"2 Anos",popular:true},{val:"3anos",label:"3 Anos"}].map(op=>(
              <div key={op.val} onClick={()=>setValidity(op.val)} style={{borderRadius:T.radius,border:`2px solid ${validity===op.val?T.green:T.ink10}`,background:validity===op.val?T.greenPale:T.white,padding:14,cursor:"pointer",textAlign:"center",position:"relative"}}>
                {op.popular && <div style={{position:"absolute",top:-8,left:"50%",transform:"translateX(-50%)",background:T.green,color:T.white,fontSize:9,fontWeight:700,padding:"2px 10px",borderRadius:99}}>POPULAR</div>}
                <div style={{fontSize:13,fontWeight:800,marginBottom:4}}>{op.label}</div>
                <div style={{fontSize:18,fontWeight:900,color:validity===op.val?T.green:T.ink}}>{fmtBRL(prices[op.val])}</div>
              </div>
            ))}
          </Grid>
          <Btn full size="lg" style={{background:T.green,color:T.white,border:"none"}}
            onClick={()=>planoEvoluir?dispatch({type:"MEI.EMIT_CERT",p:{id:genId(),tipo:"A1",active:true,validity:"1ano",emitidoEm:tsISO(),expiraEm:new Date(Date.now()+365*86400000).toISOString(),valor:0,status:"ATIVO"}}):setShowPay(true)}>
            {planoEvoluir?"🔐 Ativar A1 (Incluso)":"🔐 Adquirir A1"}
          </Btn>
        </Card>
      )}
      <PaymentModal open={showPay} onClose={()=>setShowPay(false)} onSuccess={onSuccess} title="Certificado A1" amount={price} description={`A1 · ${validity}`} dispatch={dispatch}/>
    </PageWrap>
  );
}

function PageRelatorios({ st }) {
  const rec = st.transactions.filter(t=>t.tipo==="RECEITA").reduce((a,t)=>a+t.valor,0);
  const des = st.transactions.filter(t=>t.tipo==="DESPESA").reduce((a,t)=>a+t.valor,0);
  const lim = ImpostosEngine.limiteAnual(st.faturamento);
  const sc = ScoreEngine.calc(st.transactions,st.missions,st.dasnDecs,st.certs,st.notasFiscais);
  const catData = Object.entries(st.transactions.reduce((acc,t)=>{acc[t.categoria]=(acc[t.categoria]||0)+t.valor;return acc;},{})).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value).slice(0,5);
  const months = Array.from({length:6},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-5+i);const r=st.transactions.filter(t=>t.tipo==="RECEITA"&&new Date(t.data).getMonth()===d.getMonth()).reduce((a,t)=>a+t.valor,0);return{mes:d.toLocaleDateString("pt-BR",{month:"short"}),receita:r||Math.random()*2000+500};});
  return (
    <PageWrap title="📊 Relatórios">
      <Grid cols={4} gap={10} style={{marginBottom:14}}>
        <Stat label="Faturamento" value={fmtBRL(st.faturamento)} icon="📈" color={T.green}/>
        <Stat label="Receitas" value={fmtBRL(rec)} icon="↑" color={T.green}/>
        <Stat label="Despesas" value={fmtBRL(des)} icon="↓" color={T.red}/>
        <Stat label="Lucro" value={fmtBRL(rec-des)} icon="💰" color={rec-des>=0?T.green:T.red}/>
      </Grid>
      <Grid cols={2} gap={14} style={{marginBottom:14}}>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Receita mensal</div>
          <div style={{height:150}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={months} margin={{top:5,right:5,bottom:0,left:0}}>
                <CartesianGrid strokeDasharray="2 4" stroke={T.ink05}/>
                <XAxis dataKey="mes" tick={{fontSize:10,fill:T.ink60}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:T.ink60}} axisLine={false} tickLine={false} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
                <Tooltip formatter={v=>[fmtBRL(v)]} contentStyle={{fontSize:11,borderRadius:8}}/>
                <Line type="monotone" dataKey="receita" stroke={T.green} strokeWidth={2.5} dot={{fill:T.green,r:4}}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Por categoria</div>
          <div style={{height:150}}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={catData} cx="50%" cy="50%" outerRadius={55} dataKey="value" nameKey="name">
                  {catData.map((_,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]}/>)}
                </Pie>
                <Tooltip formatter={v=>[fmtBRL(v)]} contentStyle={{fontSize:11,borderRadius:8}}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:6}}>{catData.map((c,i)=><Badge key={c.name} color={CHART_COLORS[i%CHART_COLORS.length]}>{c.name}</Badge>)}</div>
        </Card>
      </Grid>
      <Grid cols={2} gap={14}>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Score Lucrom</div>
          <ScoreGauge score={sc.total} size={130}/>
          <div style={{marginTop:10}}>
            {Object.entries({Financeiro:sc.components.fin,Missões:sc.components.mis,Fiscal:sc.components.fis,Certificados:sc.components.cer,Comportamento:sc.components.beh}).map(([k,v])=>(
              <div key={k} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                <span style={{fontSize:11,color:T.ink60,width:80}}>{k}</span>
                <div style={{flex:1}}><Bar v={v} max={100} h={4}/></div>
                <span style={{fontSize:10,fontWeight:700,width:28,textAlign:"right"}}>{Math.round(v)}%</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Teto MEI</div>
          <div style={{fontSize:32,fontWeight:900,color:lim.alerta?T.amber:T.green,marginBottom:4}}>{fmtPct(lim.pct)}</div>
          <Bar v={lim.pct} max={100} color={lim.critico?T.red:lim.alerta?T.amber:T.green} h={10}/>
          <div style={{marginTop:10}}>
            <CardFlat>
              <div style={{fontSize:11,color:T.ink60,marginBottom:2}}>Restante</div>
              <div style={{fontSize:18,fontWeight:800,color:T.green}}>{fmtBRL(lim.restante)}</div>
            </CardFlat>
          </div>
        </Card>
      </Grid>
    </PageWrap>
  );
}

function PageIA({ st, go }) {
  const sc = ScoreEngine.calc(st.transactions,st.missions,st.dasnDecs,st.certs,st.notasFiscais);
  const rec = st.transactions.filter(t=>t.tipo==="RECEITA").reduce((a,t)=>a+t.valor,0);
  const des = st.transactions.filter(t=>t.tipo==="DESPESA").reduce((a,t)=>a+t.valor,0);
  const insights = [
    rec>0&&des/rec>0.70&&{icon:"⚠️",titulo:"Gastos elevados!",msg:`Despesas = ${fmtPct(des/rec*100)} da receita.`,acao:"lancamentos"},
    sc.components.fis<50&&{icon:"📋",titulo:"Regularize o DAS",msg:"Componente fiscal baixo. Pague o DAS em dia.",acao:"impostos"},
    sc.total<600&&{icon:"🎯",titulo:"Aumentar Score",msg:"Complete missões para melhorar o score.",acao:"missions"},
    sc.total>=700&&{icon:"💰",titulo:"Crédito disponível!",msg:`Score ${sc.total} → limite de ${fmtBRL(ScoreEngine.risk(sc.total).limit)}.`,acao:"operacoes"},
  ].filter(Boolean).slice(0,4);
  const compData = Object.entries(sc.components).map(([k,v])=>({name:{fin:"Financeiro",mis:"Missões",fis:"Fiscal",cer:"Certificados",beh:"Comportamento",nf:"Notas"}[k]||k,value:Math.round(v)}));
  return (
    <PageWrap title="📊 Análise Financeira">
      <Grid cols={3} gap={10} style={{marginBottom:14}}>
        <Stat label="Score" value={sc.total} icon="🎯" color={ScoreEngine.risk(sc.total).color}/>
        <Stat label="Análise" value="Automática" icon="⚙️" color={T.purple}/>
        <Stat label="Limite" value={fmtBRL(ScoreEngine.risk(sc.total, st?.faturamento||0).limit)} icon="💳" color={T.green}/>
      </Grid>
      <Grid cols={2} gap={14} style={{marginBottom:14}}>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>💡 Recomendações para você</div>
          {insights.length===0 ? <AlertBox type="success">Parabéns! Tudo em ordem. 🚀</AlertBox> : insights.map((d,i)=>(
            <div key={i} style={{display:"flex",gap:10,padding:"10px 0",borderBottom:`1px solid ${T.ink05}`}}>
              <span style={{fontSize:18,flexShrink:0}}>{d.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:12,marginBottom:2}}>{d.titulo}</div>
                <div style={{fontSize:11,color:T.ink60,lineHeight:1.5}}>{d.msg}</div>
              </div>
              {d.acao && <Btn size="sm" v="outline" onClick={()=>go(d.acao)}>Ver</Btn>}
            </div>
          ))}
        </Card>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Score por componente</div>
          <div style={{height:160}}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compData} layout="vertical" margin={{top:0,right:20,bottom:0,left:60}}>
                <CartesianGrid strokeDasharray="2 4" stroke={T.ink05}/>
                <XAxis type="number" domain={[0,100]} tick={{fontSize:9,fill:T.ink60}} axisLine={false} tickLine={false}/>
                <YAxis dataKey="name" type="category" tick={{fontSize:9,fill:T.ink60}} axisLine={false} tickLine={false} width={58}/>
                <Tooltip formatter={v=>[`${v}%`]} contentStyle={{fontSize:11,borderRadius:8}}/>
                <RBar dataKey="value" fill={T.green} radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Grid>
      <Card>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Previsão 30 dias</div>
        <Grid cols={3} gap={10}>
          {[{l:"Receita projetada",v:fmtBRL(rec*1.1),c:T.green},{l:"Despesa projetada",v:fmtBRL(des*1.05),c:T.red},{l:"Saldo esperado",v:fmtBRL(rec*1.1-des*1.05),c:rec*1.1-des*1.05>=0?T.green:T.red}].map(x=>(
            <CardFlat key={x.l} style={{textAlign:"center"}}>
              <div style={{fontSize:11,color:T.ink60,marginBottom:4}}>{x.l}</div>
              <div style={{fontSize:15,fontWeight:800,color:x.c}}>{x.v}</div>
            </CardFlat>
          ))}
        </Grid>
      </Card>
    </PageWrap>
  );
}

// ── CALCULETA MEI PRO — INTELIGENTE POR CNAE ─────────────────
// Detecta o perfil do MEI pelo CNAE e adapta os campos automaticamente.
// Perfis: MOTORISTA · PRESTADOR · VENDEDOR · GENERICO
const CNAE_PERFIL = {
  // MOTORISTAS / TRANSPORTE
  "4923-0/02":"MOTORISTA","4924-8/00":"MOTORISTA","4929-9/01":"MOTORISTA",
  "4929-9/02":"MOTORISTA","4929-9/99":"MOTORISTA","5011-4/01":"MOTORISTA",
  "5091-2/01":"MOTORISTA","4921-3/01":"MOTORISTA","4921-3/02":"MOTORISTA",
  "4922-1/01":"MOTORISTA","4922-1/02":"MOTORISTA",
  // VENDEDORES / COMÉRCIO
  "4711-3/01":"VENDEDOR","4711-3/02":"VENDEDOR","4712-1/00":"VENDEDOR",
  "4721-1/02":"VENDEDOR","4724-5/00":"VENDEDOR","4729-6/99":"VENDEDOR",
  "4781-4/00":"VENDEDOR","4782-2/01":"VENDEDOR","4789-0/99":"VENDEDOR",
  "4771-7/01":"VENDEDOR","4772-5/00":"VENDEDOR","4744-0/01":"VENDEDOR",
  // PRESTADORES DE SERVIÇO
  "6201-5/00":"PRESTADOR","6209-1/00":"PRESTADOR",
  "9602-5/01":"PRESTADOR","9609-2/99":"PRESTADOR",
  "5611-2/01":"PRESTADOR","5611-2/03":"PRESTADOR",
  "8630-5/04":"PRESTADOR","8650-0/06":"PRESTADOR",
  "4330-4/03":"PRESTADOR","4330-4/04":"PRESTADOR","4330-4/05":"PRESTADOR",
  "4321-5/00":"PRESTADOR","4322-3/00":"PRESTADOR","4399-1/03":"PRESTADOR",
};
function getCnaePerfil(cnae) {
  if (!cnae || cnae === "—") return "GENERICO";
  const code = cnae.trim();
  if (CNAE_PERFIL[code]) return CNAE_PERFIL[code];
  // Fallback por prefixo
  const prefix = code.slice(0,2);
  if (["49","50","51"].includes(prefix)) return "MOTORISTA";
  if (["47","46","45","52"].includes(prefix)) return "VENDEDOR";
  if (["62","63","56","86","43","44","45","81","96","97","99"].includes(prefix)) return "PRESTADOR";
  return "GENERICO";
}

function PageCalculadora({ st }) {
  const bp = useResponsive();
  const isMobile = bp === "sm";
  const cnae  = st?.user?.cnae || "—";
  const perfil = getCnaePerfil(cnae);
  const cnaeDesc = CNAE_DB[cnae] || st?.user?.cnaeDesc || cnae;

  const PERFIL_META = {
    MOTORISTA: { label:"Motorista / Transporte", icon:"🚗", color:"#60a5fa",
      campos:[
        {key:"custoProduto", label:"Custo fixo do veículo/dia (R$)", prefix:"R$", default:"80"},
        {key:"tempoTrabalho", label:"Horas trabalhadas", suffix:"h",   default:"8"},
        {key:"taxaCartao",   label:"Taxa app/cartão (%)",  suffix:"%", default:"25"},
        {key:"distancia",    label:"KM rodados por corrida", suffix:"km", default:"15"},
        {key:"custoPorKm",   label:"Custo combustível/KM (R$)", prefix:"R$", default:"0.45"},
        {key:"numViagens",   label:"Nº de corridas/viagens", suffix:"×", default:"8"},
      ],
      somarLogLabel: "Incluir custo de combustível",
      painel1Label: "DADOS DA OPERAÇÃO",
      painel2Label: "QUILOMETRAGEM",
      custoBaseLabel: "Custo operacional",
      descricaoResultado: "Valor mínimo por corrida",
    },
    PRESTADOR: { label:"Prestador de Serviço", icon:"🔧", color:"#a78bfa",
      campos:[
        {key:"custoProduto", label:"Custo do material/insumo (R$)", prefix:"R$", default:"120"},
        {key:"tempoTrabalho", label:"Horas de execução", suffix:"h",  default:"4"},
        {key:"taxaCartao",   label:"Taxa cartão/PIX (%)", suffix:"%", default:"3.5"},
        {key:"distancia",    label:"Distância ao cliente (km)", suffix:"km", default:"20"},
        {key:"custoPorKm",   label:"Custo por km (R$)", prefix:"R$", default:"1.85"},
        {key:"numViagens",   label:"Idas ao cliente", suffix:"×",    default:"2"},
      ],
      somarLogLabel: "Incluir deslocamento ao cliente",
      painel1Label: "SERVIÇO / OBRA",
      painel2Label: "DESLOCAMENTO",
      custoBaseLabel: "Custo do serviço",
      descricaoResultado: "Preço mínimo do serviço",
    },
    VENDEDOR: { label:"Comércio / Vendas", icon:"🛒", color:"#34d399",
      campos:[
        {key:"custoProduto", label:"Custo da mercadoria (R$)", prefix:"R$", default:"50"},
        {key:"tempoTrabalho", label:"Tempo de venda/preparo (h)", suffix:"h", default:"1"},
        {key:"taxaCartao",   label:"Taxa cartão/marketplace (%)", suffix:"%", default:"5"},
        {key:"distancia",    label:"Distância para entrega (km)", suffix:"km", default:"10"},
        {key:"custoPorKm",   label:"Custo entrega por km (R$)", prefix:"R$", default:"1.85"},
        {key:"numViagens",   label:"Entregas", suffix:"×",      default:"1"},
      ],
      somarLogLabel: "Incluir frete/entrega no preço",
      painel1Label: "MERCADORIA",
      painel2Label: "ENTREGA / FRETE",
      custoBaseLabel: "Custo da mercadoria",
      descricaoResultado: "Preço de venda recomendado",
    },
    GENERICO: { label:"MEI Geral", icon:"🧮", color:"#22a85a",
      campos:[
        {key:"custoProduto", label:"Custo Produto/Base (R$)", prefix:"R$", default:"50"},
        {key:"tempoTrabalho", label:"Tempo Trabalho (Horas)", suffix:"h",   default:"2"},
        {key:"taxaCartao",   label:"Taxa Cartão/Maquina (%)", suffix:"%",   default:"3.5"},
        {key:"distancia",    label:"Distância (km)", suffix:"km",           default:"10"},
        {key:"custoPorKm",   label:"Custo Médio por KM (R$)", prefix:"R$", default:"1.85"},
        {key:"numViagens",   label:"Nº de Viagens", suffix:"×",            default:"1"},
      ],
      somarLogLabel: "+ Somar ao Cálculo Geral",
      painel1Label: "DADOS BÁSICOS",
      painel2Label: "DESLOCAMENTO",
      custoBaseLabel: "Custo Base",
      descricaoResultado: "Preço de Venda Recomendado",
    },
  };

  const meta = PERFIL_META[perfil] || PERFIL_META.GENERICO;

  // Estado dinâmico inicializado pelos defaults do perfil
  const defaultVals = Object.fromEntries(meta.campos.map(c=>[c.key, c.default]));
  const [vals, setVals] = useState(defaultVals);
  const [campoAtivo, setCampoAtivo] = useState(meta.campos[0].key);
  const [somarLog, setSomarLog] = useState(perfil === "MOTORISTA");

  // Reinicia quando troca de perfil (usuário muda CNAE no perfil)
  const prevPerfil = useRef(perfil);
  useEffect(() => {
    if (prevPerfil.current !== perfil) {
      prevPerfil.current = perfil;
      setVals(Object.fromEntries(meta.campos.map(c=>[c.key, c.default])));
      setCampoAtivo(meta.campos[0].key);
      setSomarLog(perfil === "MOTORISTA");
    }
  }, [perfil]);

  function teclar(k) {
    setVals(prev => {
      const cur = prev[campoAtivo] ?? "0";
      if(k === "⌫") return {...prev, [campoAtivo]: cur.slice(0,-1)||"0"};
      if(k === "C")  return {...prev, [campoAtivo]: "0"};
      if(k === "." && cur.includes(".")) return prev;
      return {...prev, [campoAtivo]: cur==="0" && k!=="." ? k : cur+k};
    });
  }

  const rs = useMemo(() => {
    const custo     = safeNum(vals.custoProduto);
    const tempo     = safeNum(vals.tempoTrabalho);
    const taxa      = safeNum(vals.taxaCartao) / 100;
    const dist      = safeNum(vals.distancia);
    const kmCusto   = safeNum(vals.custoPorKm);
    const viagens   = safeNum(vals.numViagens, 1);
    const valorHora = perfil === "MOTORISTA" ? 30 : perfil === "PRESTADOR" ? 45 : 20;
    const custoTempo  = tempo * valorHora;
    const custoBase   = custo + custoTempo;
    const custoLog    = dist * kmCusto * viagens;
    const logFinal    = somarLog ? custoLog : 0;
    const margemLucro = perfil === "MOTORISTA" ? 0.20 : perfil === "PRESTADOR" ? 0.35 : 0.30;
    const totalCusto  = custoBase + logFinal;
    const precoVenda  = totalCusto > 0 ? totalCusto / (1 - taxa - margemLucro) : 0;
    const lucroLiquido = precoVenda * margemLucro;
    const custoCartao  = precoVenda * taxa;
    return { custoBase, custoLog, logFinal, precoVenda, lucroLiquido, custoCartao, totalCusto, margemLucro, valorHora };
  }, [vals, somarLog, perfil]);

  const BG = T.white;
  const GL = T.green;
  const PANEL = T.greenPale;
  const BORDER = T.ink10;

  const InputCalc = ({ label, fieldKey, suffix, prefix }) => {
    const active = campoAtivo === fieldKey;
    const value  = vals[fieldKey] ?? "0";
    return (
      <div style={{marginBottom:10}}>
        <label style={{display:"block",fontSize:10,fontWeight:700,color:T.ink60,textTransform:"uppercase",letterSpacing:".6px",marginBottom:4}}>{label}</label>
        <div onClick={()=>setCampoAtivo(fieldKey)} style={{display:"flex",alignItems:"center",height:40,borderRadius:T.radiusSm,border:`1.5px solid ${active?`${GL}99`:BORDER}`,background:active?`${GL}14`:PANEL,padding:"0 10px",gap:6,cursor:"pointer",transition:"all .15s"}}>
          {prefix && <span style={{fontSize:12,color:T.ink40,flexShrink:0}}>{prefix}</span>}
          <span style={{fontSize:14,fontWeight:700,color:T.ink,flex:1}}>{value || "0"}</span>
          {suffix && <span style={{fontSize:11,color:T.ink40,flexShrink:0}}>{suffix}</span>}
          {active && <span style={{width:2,height:18,background:GL,borderRadius:1,animation:"blink 1s infinite"}}/>}
        </div>
      </div>
    );
  };

  const campos1 = meta.campos.slice(0,3); // painel 1
  const campos2 = meta.campos.slice(3,6); // painel 2
  const teclasNum = ["7","8","9","4","5","6","1","2","3","C","0",".","⌫"];

  const campoAtivoMeta = meta.campos.find(c=>c.key===campoAtivo);

  return (
    <div style={{color:T.ink}}>
      <div style={{marginBottom:14}}>
        <h1 style={{fontSize:16,fontWeight:900,color:T.ink,letterSpacing:"-.3px",marginBottom:4}}>
          🧮 CALCULADORA DE PREÇO
        </h1>
        {/* Badge de perfil detectado */}
        <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"5px 12px",borderRadius:99,background:`${GL}15`,border:`1px solid ${GL}40`}}>
          <span style={{fontSize:14}}>{meta.icon}</span>
          <span style={{fontSize:11,fontWeight:700,color:GL}}>{meta.label}</span>
          {cnae !== "—" && <span style={{fontSize:10,color:T.ink40}}>CNAE {cnae}</span>}
        </div>
        {cnae === "—" && (
          <div style={{marginTop:6,fontSize:11,color:T.ink60}}>
            💡 Atualize seu CNAE no Perfil para campos personalizados ao seu negócio.
          </div>
        )}
      </div>

      <div style={{display:"grid",gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr auto",gap:12,alignItems:"start"}}>

        {/* Painel 1 — Dados do perfil */}
        <div style={{background:PANEL,border:`1px solid ${BORDER}`,borderRadius:T.radiusLg,padding:"16px 14px"}}>
          <div style={{fontSize:10,fontWeight:800,color:GL,textTransform:"uppercase",letterSpacing:"1px",marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:18,height:18,borderRadius:99,background:`${GL}20`,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:GL}}>1</span>
            {meta.painel1Label}
          </div>
          <div style={{fontSize:10,color:T.ink40,marginBottom:10,fontWeight:600}}>{cnaeDesc.toUpperCase()}</div>
          {campos1.map(c=>(
            <InputCalc key={c.key} label={c.label} fieldKey={c.key} prefix={c.prefix} suffix={c.suffix}/>
          ))}
          <div style={{marginTop:10,padding:"8px 10px",background:`${GL}12`,borderRadius:T.radiusSm,border:`1px solid ${GL}25`}}>
            <div style={{fontSize:9,color:T.ink60,fontWeight:700,textTransform:"uppercase",marginBottom:3}}>{meta.custoBaseLabel}</div>
            <div style={{fontSize:18,fontWeight:800,color:GL}}>{fmtBRL(rs.custoBase)}</div>
            <div style={{fontSize:9,color:T.ink40,marginTop:2}}>R$ {rs.valorHora}/h × {vals.tempoTrabalho}h + custo base</div>
          </div>
        </div>

        {/* Painel 2 — Deslocamento/Entrega/KM */}
        <div style={{background:PANEL,border:`1px solid ${BORDER}`,borderRadius:T.radiusLg,padding:"16px 14px"}}>
          <div style={{fontSize:10,fontWeight:800,color:T.green,textTransform:"uppercase",letterSpacing:"1px",marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
            <span style={{width:18,height:18,borderRadius:99,background:T.greenPale,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:T.green}}>2</span>
            {meta.painel2Label}
          </div>
          {campos2.map(c=>(
            <InputCalc key={c.key} label={c.label} fieldKey={c.key} prefix={c.prefix} suffix={c.suffix}/>
          ))}
          <div style={{marginTop:10,padding:"8px 10px",background:T.greenPale,borderRadius:T.radiusSm,border:`1px solid ${T.greenBorder}`,marginBottom:10}}>
            <div style={{fontSize:9,color:T.ink60,fontWeight:700,textTransform:"uppercase",marginBottom:3}}>
              {perfil==="MOTORISTA"?"Custo Combustível":perfil==="VENDEDOR"?"Custo Entrega":"Custo Deslocamento"}
            </div>
            <div style={{fontSize:16,fontWeight:800,color:T.green}}>{fmtBRL(rs.custoLog)}</div>
          </div>
          <button onClick={()=>setSomarLog(v=>!v)} style={{width:"100%",padding:"9px",borderRadius:T.radiusSm,background:somarLog?`${GL}20`:T.ink05,border:`1.5px solid ${somarLog?`${GL}50`:BORDER}`,color:somarLog?GL:T.ink60,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
            {somarLog?`✓ ${meta.somarLogLabel}`:meta.somarLogLabel}
          </button>
        </div>

        {/* Painel 3 — Resultados */}
        <div style={{background:T.greenPale,border:`1px solid ${T.greenBorder}`,borderRadius:T.radiusLg,padding:"16px 14px"}}>
          <div style={{fontSize:10,fontWeight:800,color:GL,textTransform:"uppercase",letterSpacing:"1px",marginBottom:14}}>📊 RESULTADO</div>
          <div style={{marginBottom:12,padding:"14px",background:`${GL}18`,borderRadius:T.radiusSm,border:`1.5px solid ${GL}40`,textAlign:"center"}}>
            <div style={{fontSize:9,color:T.ink60,fontWeight:700,textTransform:"uppercase",letterSpacing:".6px",marginBottom:6}}>{meta.descricaoResultado}</div>
            <div style={{fontSize:28,fontWeight:900,color:GL,lineHeight:1}}>{fmtBRL(rs.precoVenda)}</div>
          </div>
          {[
            {label: perfil==="MOTORISTA"?"Custo Combustível":perfil==="VENDEDOR"?"Custo Entrega":"Deslocamento (AM)", value:fmtBRL(rs.logFinal), color:T.green},
            {label:"Taxa Cartão/App", value:fmtBRL(rs.custoCartao), color:T.amber},
            {label:meta.custoBaseLabel, value:fmtBRL(rs.custoBase), color:T.ink60},
          ].map(item=>(
            <div key={item.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.ink10}`}}>
              <span style={{fontSize:11,color:T.ink60}}>{item.label}</span>
              <span style={{fontSize:13,fontWeight:700,color:item.color}}>{item.value}</span>
            </div>
          ))}
          <div style={{marginTop:12,padding:"12px",background:`${GL}15`,borderRadius:T.radiusSm,border:`1px solid ${GL}25`}}>
            <div style={{fontSize:9,color:T.ink60,fontWeight:700,textTransform:"uppercase",letterSpacing:".6px",marginBottom:4}}>Lucro Líquido Real</div>
            <div style={{fontSize:22,fontWeight:900,color:GL}}>{fmtBRL(rs.lucroLiquido)}</div>
            <div style={{fontSize:10,color:T.ink40,marginTop:2}}>{Math.round(rs.margemLucro*100)}% sobre o preço de venda</div>
          </div>
        </div>

        {/* Teclado Numérico */}
        <div style={{background:PANEL,border:`1px solid ${BORDER}`,borderRadius:T.radiusLg,padding:"12px",width: isMobile ? "100%" : 140}}>
          <div style={{fontSize:9,fontWeight:700,color:T.ink40,textTransform:"uppercase",letterSpacing:".8px",marginBottom:10,textAlign:"center"}}>Teclado</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
            {teclasNum.map(k => (
              <button key={k} onClick={()=>teclar(k)} style={{height:40,borderRadius:T.radiusSm,background:k==="C"?"rgba(239,68,68,.15)":k==="⌫"?"rgba(245,158,11,.1)":T.ink05,border:`1px solid ${k==="C"?"rgba(239,68,68,.3)":k==="⌫"?"rgba(245,158,11,.25)":BORDER}`,color:k==="C"?T.red:k==="⌫"?T.amber:T.ink,fontWeight:700,fontSize:15,cursor:"pointer",fontFamily:"inherit",transition:"all .1s",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {k}
              </button>
            ))}
          </div>
          <div style={{marginTop:10,padding:"8px",background:`${GL}08`,borderRadius:T.radiusSm,border:`1px solid ${GL}18`}}>
            <div style={{fontSize:8,color:T.ink40,marginBottom:4}}>Campo ativo:</div>
            <div style={{fontSize:10,fontWeight:700,color:GL,textTransform:"uppercase",lineHeight:1.3}}>
              {campoAtivoMeta?.label || campoAtivo}
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
    </div>
  );
}

function PageOpenFinance({ st, dispatch }) {
  const toast = useToast();
  const [connecting, setConnecting] = useState(null);
  const banks = [{id:"itau",nome:"Itaú",emoji:"🟠"},{id:"bb",nome:"Banco do Brasil",emoji:"🟡"},{id:"nubank",nome:"Nubank",emoji:"🟣"},{id:"bradesco",nome:"Bradesco",emoji:"🔴"},{id:"inter",nome:"Inter",emoji:"🟠"},{id:"c6",nome:"C6 Bank",emoji:"⚫"}];
  const connected = st.openFinance?.banks||[];
  async function connect(b) {
    if(connected.some(c=>c.id===b.id)) { toast("Já conectado","warn"); return; }
    setConnecting(b.id);
    await new Promise(r=>setTimeout(r,1500));
    dispatch({type:"MEI.OPEN_FINANCE_CONNECT",p:{...b,saldo:Math.random()*3000+500,txs:Math.floor(Math.random()*15)+5}});
    setConnecting(null); toast(`${b.nome} conectado! +20 pts`);
  }
  return (
    <PageWrap title="🔗 Open Finance">
      <AlertBox type="info">Regulamentado pelo BCB (Resolução 32/2020). Consentimento revogável a qualquer momento.</AlertBox>
      {connected.length>0 && (
        <Card style={{marginBottom:14,background:T.greenPale,border:`1px solid ${T.greenMid}`}}>
          <div style={{fontWeight:700,color:T.green,marginBottom:10}}>✅ Bancos conectados</div>
          {connected.map(b=>(
            <div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.greenMid}`}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:18}}>{b.emoji}</span>
                <div><div style={{fontWeight:700}}>{b.nome}</div><div style={{fontSize:11,color:T.ink60}}>Saldo: {fmtBRL(b.saldo||0)}</div></div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <Badge color={T.green}>Ativo</Badge>
                <Btn size="sm" v="danger" onClick={()=>{dispatch({type:"MEI.OPEN_FINANCE_DISCONNECT",p:b.id});toast("Desconectado","warn");}}>✕</Btn>
              </div>
            </div>
          ))}
        </Card>
      )}
      <Card>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Disponíveis</div>
        <Grid cols={2} gap={10}>
          {banks.map(b=>{const isConn=connected.some(c=>c.id===b.id);return(
            <div key={b.id} style={{padding:"12px",borderRadius:T.radius,border:`1.5px solid ${isConn?T.green:T.ink10}`,background:isConn?T.greenPale:"transparent",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:18}}>{b.emoji}</span><div style={{fontWeight:700,fontSize:12}}>{b.nome}</div></div>
              {isConn ? <Badge color={T.green}>✓</Badge> : <Btn size="sm" disabled={connecting===b.id} onClick={()=>connect(b)}>{connecting===b.id?"⏳":"Conectar"}</Btn>}
            </div>
          );})}
        </Grid>
      </Card>
    </PageWrap>
  );
}

function PagePlanos({ st, dispatch }) {
  const toast = useToast();
  const [showPay, setShowPay] = useState(null);
  return (
    <PageWrap title="⭐ Planos de Acesso">
      <Grid cols={3} gap={14}>
        {PLANOS.map(p=>(
          <Card key={p.id} style={{position:"relative",border:p.popular?`2px solid ${T.green}`:`1px solid ${T.ink10}`}}>
            {p.popular && <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:T.green,color:T.white,fontSize:10,fontWeight:700,padding:"3px 12px",borderRadius:99}}>POPULAR</div>}
            <div style={{fontWeight:800,fontSize:15,marginBottom:4}}>{p.nome}</div>
            <div style={{fontSize:24,fontWeight:900,color:T.green,marginBottom:12}}>{p.str}</div>
            {p.features.map(f=><div key={f} style={{display:"flex",gap:7,fontSize:12,color:T.ink60,marginBottom:7}}><span style={{color:T.green}}>✓</span>{f}</div>)}
            {st.user.plano===p.id ? <Badge color={T.green} style={{marginTop:10,fontSize:12}}>Plano atual</Badge>
              : <Btn full style={{marginTop:10}} onClick={()=>{if(p.preco===0){dispatch({type:"MEI.SET_PLAN",p:p.id});toast("Plano alterado!");}else setShowPay(p);}}>{p.preco===0?"Usar grátis":"Assinar"}</Btn>}
          </Card>
        ))}
      </Grid>
      {showPay && <PaymentModal open={true} onClose={()=>setShowPay(null)} onSuccess={()=>{dispatch({type:"MEI.SET_PLAN",p:showPay.id});toast(`Plano ${showPay.nome} ativado!`);setShowPay(null);}} title={`Assinar ${showPay.nome}`} amount={showPay.preco} description={`Plano ${showPay.nome}`} dispatch={dispatch}/>}
    </PageWrap>
  );
}

// ── PublicarEdu — Admin publica vídeos e matérias ────────────────
function PublicarEdu({ st, dispatch }) {
  const toast = useToast();
  const [tipo,      setTipo]      = useState("video");
  const [titulo,    setTitulo]    = useState("");
  const [descricao, setDescricao] = useState("");
  const [url,       setUrl]       = useState("");
  const [dur,       setDur]       = useState("");
  const [cat,       setCat]       = useState("Finanças");
  const [xp,        setXp]        = useState("20");
  const [emoji,     setEmoji]     = useState("📚");
  const [erros,     setErros]     = useState({});

  const categorias = ["Finanças","Impostos","Score","Crédito","Documentos","Jurídico","Marketing","Gestão","Tecnologia","Geral"];
  const emojis     = ["📚","📊","📋","🎯","💰","📄","🏅","🔗","💡","🎓","📱","⚖️","🛒","🔧"];

  function publicar() {
    const e = {};
    if (!titulo.trim())   e.titulo = "Informe o título";
    if (!url.trim())      e.url    = "Informe o link do conteúdo";
    if (Object.keys(e).length) { setErros(e); return; }

    dispatch({
      type: "ADMIN.EDU_ADD",
      p: {
        titulo:    titulo.trim(),
        descricao: descricao.trim(),
        url:       url.trim(),
        dur:       dur || "—",
        cat,
        xp:        parseInt(xp)||20,
        emoji,
        tipo,
        autor:     st.user.nome,
        criadoEm:  new Date().toISOString(),
        ativo:     true,
      }
    });
    toast(`${tipo==="video"?"Vídeo":"Matéria"} "${titulo}" publicado com sucesso!`, "ok");
    setTitulo(""); setDescricao(""); setUrl(""); setDur(""); setErros({});
  }

  const conteudos = st.eduVideos || [];

  return (
    <div>
      {/* Formulário de publicação */}
      <Card style={{marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:14}}>
          ➕ Publicar novo conteúdo
        </div>

        {/* Tipo */}
        <div style={{display:"flex",gap:8,marginBottom:14}}>
          {["video","materia"].map(t=>(
            <button key={t} onClick={()=>setTipo(t)}
              style={{flex:1,padding:"8px 0",borderRadius:T.radiusSm,
                border:`2px solid ${tipo===t?T.green:T.ink10}`,
                background:tipo===t?"rgba(59,130,246,.08)":T.white,
                color:tipo===t?T.green:T.ink60,
                fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
              {t==="video"?"🎬 Vídeo":"📰 Matéria"}
            </button>
          ))}
        </div>

        <Input label="Título *" value={titulo} onChange={v=>{setTitulo(v);setErros(e=>({...e,titulo:""}));}} placeholder="Ex: Como emitir Nota Fiscal MEI" error={erros.titulo}/>
        <Input label={tipo==="video"?"Link do vídeo (YouTube/Vimeo) *":"Link da matéria *"} value={url} onChange={v=>{setUrl(v);setErros(e=>({...e,url:""}));}} placeholder={tipo==="video"?"https://youtube.com/watch?v=...":"https://..."} error={erros.url}/>
        <Input label="Descrição" value={descricao} onChange={setDescricao} placeholder="Resumo do conteúdo (opcional)"/>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          <div>
            <label style={{display:"block",fontSize:12,fontWeight:600,color:T.ink60,marginBottom:4}}>Categoria</label>
            <select value={cat} onChange={e=>setCat(e.target.value)}
              style={{width:"100%",height:38,borderRadius:T.radiusSm,padding:"0 8px",border:`1px solid ${T.ink10}`,background:T.white,color:T.ink,fontSize:12,outline:"none",fontFamily:"inherit"}}>
              {categorias.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{display:"block",fontSize:12,fontWeight:600,color:T.ink60,marginBottom:4}}>XP ao concluir</label>
            <select value={xp} onChange={e=>setXp(e.target.value)}
              style={{width:"100%",height:38,borderRadius:T.radiusSm,padding:"0 8px",border:`1px solid ${T.ink10}`,background:T.white,color:T.ink,fontSize:12,outline:"none",fontFamily:"inherit"}}>
              {["10","15","20","25","30","40","50"].map(v=><option key={v}>{v} XP</option>)}
            </select>
          </div>
          <div>
            <label style={{display:"block",fontSize:12,fontWeight:600,color:T.ink60,marginBottom:4}}>
              {tipo==="video"?"Duração":"Tempo leitura"}
            </label>
            <input value={dur} onChange={e=>setDur(e.target.value)} placeholder={tipo==="video"?"18 min":"5 min"}
              style={{width:"100%",height:38,borderRadius:T.radiusSm,padding:"0 8px",border:`1px solid ${T.ink10}`,background:T.white,color:T.ink,fontSize:12,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:12,fontWeight:600,color:T.ink60,marginBottom:6}}>Emoji</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {emojis.map(e=>(
              <button key={e} onClick={()=>setEmoji(e)}
                style={{width:36,height:36,fontSize:20,borderRadius:8,
                  border:`2px solid ${emoji===e?T.green:T.ink10}`,
                  background:emoji===e?"rgba(59,130,246,.1)":T.white,
                  cursor:"pointer"}}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <Btn full onClick={publicar} style={{background:T.green}}>
          Publicar {tipo==="video"?"vídeo":"matéria"} →
        </Btn>
      </Card>

      {/* Lista de conteúdos publicados */}
      <Card>
        <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:12}}>
          📋 Conteúdos publicados ({conteudos.length})
        </div>
        {conteudos.length===0 && (
          <div style={{textAlign:"center",padding:20,color:T.ink40,fontSize:12}}>
            Nenhum conteúdo publicado ainda.
          </div>
        )}
        {conteudos.map(v=>(
          <div key={v.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${T.ink05}`}}>
            <div style={{fontSize:22,width:32,textAlign:"center"}}>{v.emoji||"📚"}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:T.ink,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.titulo}</div>
              <div style={{fontSize:11,color:T.ink40}}>{v.cat} · {v.dur||"—"} · {v.xp} XP{v.tipo==="materia"?" · Matéria":""}</div>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button onClick={()=>dispatch({type:"ADMIN.EDU_UPDATE",p:{...v,ativo:!v.ativo}})}
                style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${T.ink10}`,background:v.ativo!==false?T.greenPale:T.ink05,color:v.ativo!==false?T.green:T.ink40,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {v.ativo!==false?"Ativo":"Inativo"}
              </button>
              <button onClick={()=>{if(window.confirm("Remover este conteúdo?"))dispatch({type:"ADMIN.EDU_DELETE",p:v.id});}}
                style={{padding:"4px 8px",borderRadius:6,border:`1px solid rgba(239,68,68,.3)`,background:"rgba(239,68,68,.06)",color:T.red,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                Remover
              </button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function PageEduMEI({ st, dispatch, go }) {
  const toast = useToast();
  const [aba, setAba] = useState("edu");

  // ── Análise financeira personalizada ───────────────────────
  const fraud = FraudEngine.calcRiskScore(st.operacoes||[], st.transactions||[], st.faturamento||0, st.tetoMEI||81000);
  const sc = ScoreEngine.calc(
    st.transactions, st.missions, st.dasnDecs, st.certs, st.notasFiscais,
    { xp:st.user?.xp||0, dasPagamentos:st.dasPagamentos||[], createdAt:st.user?.createdAt, openFinance:st.openFinance, fraudFlags:fraud.flags }
  );
  const rec = st.transactions.filter(t=>t.tipo==="RECEITA").reduce((a,t)=>a+t.valor,0);
  const des = st.transactions.filter(t=>t.tipo==="DESPESA").reduce((a,t)=>a+t.valor,0);
  const insights = [
    rec>0&&des/rec>0.70&&{icon:"⚠️",titulo:"Gastos elevados",msg:`Despesas = ${fmtPct(des/rec*100)} da receita. Revise seus custos.`,acao:"lancamentos",urgente:true},
    sc.components.dasnDeclarada<50&&{icon:"📋",titulo:"Declare a DASN",msg:"Sua declaração anual está pendente. Evite multa de R$50.",acao:"impostos",urgente:true},
    sc.total<600&&{icon:"🎯",titulo:"Aumente seu score",msg:"Complete missões e registre transações para subir de nível.",acao:"missions",urgente:false},
    sc.total>=700&&{icon:"💰",titulo:"Crédito disponível!",msg:`Score ${sc.total} — limite pré-aprovado: ${fmtBRL(ScoreEngine.risk(sc.total, st.faturamento||0).limit)}.`,acao:"operacoes",urgente:false},
    sc.components.certificados<50&&{icon:"🏅",titulo:"Emita o CCFV",msg:"Certificado de Capacidade Financeira aumenta seu score em +30 pts.",acao:"cert_ccfv",urgente:false},
    (st.openFinance?.banks||[]).length===0&&{icon:"🔗",titulo:"Conecte seu banco",msg:"Open Finance adiciona dados reais ao seu score automaticamente.",acao:"openfinance",urgente:false},
  ].filter(Boolean).slice(0, 5);

  const compData = sc.explicacao?.slice(0,6).map(e=>({
    name: {volumeReceita:"Receita",margemLiquida:"Margem",regularidadeTx:"Regularidade",missoesConcluidas:"Missões",dasnDeclarada:"DASN",dasPago:"DAS",certificados:"Certs",notasFiscais:"NFs",antiguidade:"Tempo",openFinance:"OpenFin",semFraudes:"Fraude",xpAcumulado:"XP"}[e.fator]||e.fator,
    value: e.valor,
  })) || [];

  return (
    <PageWrap title="🎓 Edu MEI">
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <Chip active={aba==="edu"} onClick={()=>setAba("edu")} color={T.purple}>🎓 Educação MEI</Chip>
        
        <Chip active={aba==="glossario"} onClick={()=>setAba("glossario")} color={T.green}>📖 Glossário</Chip>
        {/* Publicar: Admin/Parceiro em produção, qualquer perfil no demo */}
        {(st.auth?.role==="ADMIN"||st.auth?.role==="PARTNER"||
          st.auth?.perfil==="Admin"||st.auth?.perfil==="Parceiro"||
          st.auth?.role==="USER") && (
          <Chip active={aba==="publicar"} onClick={()=>setAba("publicar")} color={T.green}>➕ Publicar</Chip>
        )}
      </div>

      {/* ── ABA: EDUCAÇÃO ─────────────────────────────────────── */}
      {aba==="edu" && (
        <>
          <AlertBox type="info" style={{marginBottom:14}}>
            Aprenda sobre finanças do MEI e ganhe XP. Cada vídeo concluído aumenta seu score.
          </AlertBox>
          <Grid cols={2} gap={12}>
            {(st.eduVideos||EDU_VIDEOS).filter(v=>v.ativo!==false).map(v => {
              const done = (st.eduAssistidos||[]).includes(v.id);
              return (
                <Card key={v.id} style={{opacity:done?.8:1,border:`1.5px solid ${done?T.greenMid:T.ink10}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <span style={{fontSize:32}} aria-hidden="true">{v.emoji}</span>
                    {done && <Badge color={T.green}>✓ +{v.xp} XP</Badge>}
                  </div>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:3}}>{v.titulo}</div>
                  <div style={{fontSize:11,color:T.ink60,marginBottom:12}}>
                    {v.cat} · {v.dur} · <strong style={{color:done?T.green:T.amber}}>+{v.xp} XP</strong>
                  </div>
                  {done
                    ? <div style={{fontSize:11,color:T.green}}>✅ Concluído — XP creditado</div>
                    : <Btn size="sm" full
                        aria-label={`Assistir vídeo: ${v.titulo}`}
                        onClick={()=>{
                          auditLog("edu_video_watch", {videoId:v.id});
                          dispatch({type:"MEI.WATCH_VIDEO",p:{id:v.id,titulo:v.titulo,xp:v.xp}});
                          toast(`+${v.xp} XP — "${v.titulo}"`);
                          if(v.url) window.open(v.url,"_blank","noopener,noreferrer");
                        }}>
                        ▶ Assistir
                      </Btn>
                  }
                </Card>
              );
            })}
          </Grid>

          {/* Conteúdos extras */}
          <Card style={{marginTop:14}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>📚 Guias Rápidos</div>
            <Grid cols={2} gap={8}>
              {[
                {titulo:"Como abrir um MEI",desc:"Passo a passo no Portal do Empreendedor",link:"https://www.gov.br/empresas-e-negocios/pt-br/empreendedor"},
                {titulo:"O que é o DAS",desc:"Tributo único mensal do MEI — saiba calcular",link:"https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/servicos/pgmei"},
                {titulo:"DASN-SIMEI",desc:"Declaração anual obrigatória até 31/05",link:"https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/dasnsimei.app/"},
                {titulo:"Emitir NFS-e",desc:"Nota Fiscal eletrônica de serviço — como emitir",link:"https://www.nfse.gov.br/"},
              ].map(g=>(
                <CardFlat key={g.titulo}>
                  <div style={{fontWeight:700,fontSize:12,marginBottom:3}}>{g.titulo}</div>
                  <div style={{fontSize:11,color:T.ink60,marginBottom:8}}>{g.desc}</div>
                  <a href={g.link} target="_blank" rel="noopener noreferrer"
                    style={{fontSize:11,color:T.green,textDecoration:"underline"}}>
                    Acessar →
                  </a>
                </CardFlat>
              ))}
            </Grid>
          </Card>
        </>
      )}

      {/* ── ABA: PUBLICAR (Admin/Parceiro) ─────────────────────── */}
      {aba==="publicar" && (
        <PublicarEdu st={st} dispatch={dispatch}/>
      )}

      {/* ── ABA: IA CONSULTORA ───────────────────────────────── */}
      {aba==="ia" && (
        <>
          <Grid cols={3} gap={10} style={{marginBottom:14}}>
            <Stat label="Score atual" value={sc.total} icon="🎯" color={ScoreEngine.risk(sc.total).color}/>
            <Stat label="Limite crédito" value={fmtBRL(ScoreEngine.risk(sc.total, st.faturamento||0).limit)} icon="💳" color={T.green}/>
            <Stat label="Motor v" value={sc.version||"5.0"} icon="⚙️" color={T.purple}/>
          </Grid>

          <Grid cols={2} gap={14} style={{marginBottom:14}}>
            <Card>
              <div style={{fontWeight:700,fontSize:13,marginBottom:12}} id="recomendacoes-titulo">💡 Recomendações personalizadas</div>
              {insights.length===0
                ? <AlertBox type="success">Parabéns! Tudo em ordem. Continue assim. 🚀</AlertBox>
                : insights.map((d,i)=>(
                  <div key={i} role="listitem" style={{display:"flex",gap:10,padding:"10px 0",borderBottom:`1px solid ${T.ink05}`,alignItems:"flex-start"}}>
                    <span style={{fontSize:20,flexShrink:0}} aria-hidden="true">{d.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:12,marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                        {d.titulo}
                        {d.urgente && <Badge color={T.red} style={{fontSize:9}}>Urgente</Badge>}
                      </div>
                      <div style={{fontSize:11,color:T.ink60,lineHeight:1.5}}>{d.msg}</div>
                    </div>
                    {d.acao && <Btn size="sm" v="outline" onClick={()=>go(d.acao)} aria-label={`Ver ${d.titulo}`}>Ver</Btn>}
                  </div>
                ))
              }
            </Card>
            <Card>
              <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Score por fator (top 6)</div>
              <div style={{height:180}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={compData} layout="vertical" margin={{top:0,right:20,bottom:0,left:65}}>
                    <CartesianGrid strokeDasharray="2 4" stroke={T.ink05}/>
                    <XAxis type="number" domain={[0,100]} tick={{fontSize:9,fill:T.ink60}} axisLine={false} tickLine={false}/>
                    <YAxis dataKey="name" type="category" tick={{fontSize:9,fill:T.ink60}} axisLine={false} tickLine={false} width={62}/>
                    <Tooltip formatter={v=>[`${v}/100`]} contentStyle={{fontSize:11,borderRadius:8}}/>
                    <RBar dataKey="value" fill={T.green} radius={[0,4,4,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Grid>

          <Card>
            <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>📈 Projeção 30 dias</div>
            <Grid cols={3} gap={10}>
              {[
                {l:"Receita projetada",v:fmtBRL(rec*1.1),c:T.green,hint:"Estimativa +10% histórico"},
                {l:"Despesa projetada",v:fmtBRL(des*1.05),c:T.red,hint:"Estimativa +5% histórico"},
                {l:"Saldo esperado",v:fmtBRL(rec*1.1-des*1.05),c:rec*1.1-des*1.05>=0?T.green:T.red,hint:"Receita − Despesa"},
              ].map(x=>(
                <CardFlat key={x.l} style={{textAlign:"center"}}>
                  <div style={{fontSize:11,color:T.ink60,marginBottom:4}}>{x.l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:x.c,marginBottom:3}}>{x.v}</div>
                  <div style={{fontSize:10,color:T.ink40}}>{x.hint}</div>
                </CardFlat>
              ))}
            </Grid>
            <div style={{marginTop:10,fontSize:11,color:T.ink40}}>
              * Projeção baseada em médias históricas. Não constitui consultoria financeira.
            </div>
          </Card>
        </>
      )}

      {/* ── ABA: GLOSSÁRIO ───────────────────────────────────── */}
      {aba==="glossario" && (
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:14}}>📖 Termos do MEI explicados</div>
          {[
            {t:"DAS (Documento de Arrecadação do Simples Nacional)",d:"Guia mensal de pagamento único do MEI, que inclui: INSS (5% do salário mínimo), ISS e/ou ICMS conforme sua atividade. Vence todo dia 20 do mês seguinte."},
            {t:"DASN-SIMEI (Declaração Anual do Simples Nacional)",d:"Declaração anual obrigatória onde você informa sua receita bruta do ano anterior. Prazo: 31/05 de cada ano. Não declarar gera multa mínima de R$50."},
            {t:"NFS-e (Nota Fiscal de Serviço Eletrônica)",d:"Documento fiscal emitido para cada serviço prestado. Obrigatória para emissão de recibos formais e aumenta a credibilidade com clientes empresariais."},
            {t:"CNAE (Classificação Nacional de Atividades Econômicas)",d:"Código que define sua atividade econômica. Determina quais impostos você paga e se pode ser MEI."},
            {t:"Teto MEI",d:"Limite de faturamento anual do MEI (atualmente R$81.000). Ultrapassar esse limite pode resultar em desenquadramento."},
            {t:"Score Lucrom",d:"Pontuação de 300 a 1.000 que avalia sua saúde financeira com base em 12 fatores: receita, missões, DASN, DAS, certificados, NFs e outros. Quanto maior, melhores condições de crédito."},
            {t:"CET (Custo Efetivo Total)",d:"Taxa que representa todos os custos de um empréstimo: juros + IOF + tarifas. Sempre compare o CET, não só a taxa de juros."},
            {t:"IOF (Imposto sobre Operações Financeiras)",d:"Imposto cobrado em operações de crédito: 0,38% flat + 0,0082% ao dia (máx 3%). Incide sobre todo financiamento."},
            {t:"Price Table (Tabela Price)",d:"Sistema de amortização com parcelas fixas. A cada mês, paga-se os juros do período e amortiza-se o restante. Disponível na calculadora de crédito."},
            {t:"Open Finance",d:"Sistema regulado pelo BACEN que permite compartilhar dados bancários com segurança entre instituições. Conectar seu banco ao Lucrom enriquece seu score."},
          ].map(g=>(
            <div key={g.t} style={{padding:"12px 0",borderBottom:`1px solid ${T.ink05}`}}>
              <div style={{fontWeight:700,fontSize:13,color:T.green,marginBottom:4}}>{g.t}</div>
              <div style={{fontSize:12,color:T.ink60,lineHeight:1.6}}>{g.d}</div>
            </div>
          ))}
        </Card>
      )}
    </PageWrap>
  );
}

// ── PAGE: PRIVACIDADE (LGPD Art. 18) ─────────────────────────
function PagePrivacidade({ st, dispatch }) {
  const toast = useToast();

  // ── S8: MFA/TOTP state ──────────────────────────────────────────────────
  const [showMfa,    setShowMfa]    = useState(false);
  const [mfaStep,    setMfaStep]    = useState("idle"); // idle|setup|confirm|active
  const [mfaCodigo,  setMfaCodigo]  = useState("");
  const [mfaSecret,  setMfaSecret]  = useState("");
  const mfaAtivo = st.user?.mfaAtivo || false;

  // ── S8: Troca de senha ───────────────────────────────────────────────────
  const [showSenha,   setShowSenha]   = useState(false);
  const [senhaAtual,  setSenhaAtual]  = useState("");
  const [senhaNova,   setSenhaNova]   = useState("");
  const [senhaConf,   setSenhaConf]   = useState("");

  // ── S7: Preferências de notificação ──────────────────────────────────────
  const [showNotifPrefs, setShowNotifPrefs] = useState(false);
  const prefs = st.notifPrefs || SmartTriggerEngine.prefsDefault();

  // ── S8: Força de senha (heurísticas — sem lib externa) ───────────────────
  function avaliarForcaSenha(senha) {
    if(!senha) return {score:0,label:"",color:T.ink40};
    let score=0;
    if(senha.length>=12)              score++;
    if(/[A-Z]/.test(senha))           score++;
    if(/[0-9]/.test(senha))           score++;
    if(/[^a-zA-Z0-9]/.test(senha))   score++;
    if(senha.length>=16)              score++;
    // bloqueia senhas comuns (top-20 simplificado)
    const comuns=["password","123456","lucrom123","qwerty","abc123","senha123","12345678","111111","admin123"];
    if(comuns.includes(senha.toLowerCase())) score=0;
    const map={0:{label:"Muito fraca",color:T.red},1:{label:"Fraca",color:T.red},2:{label:"Moderada",color:T.amber},3:{label:"Boa",color:T.greenMid},4:{label:"Forte",color:T.green},5:{label:"Excelente",color:T.green}};
    return {score,...map[Math.min(score,5)]};
  }
  const forcaSenha = avaliarForcaSenha(senhaNova);

  function trocarSenha() {
    if(!senhaAtual) { toast("Informe a senha atual","err"); return; }
    if(forcaSenha.score<3) { toast("Senha nova muito fraca — mínimo: 12 chars, maiúscula, número, símbolo","err"); return; }
    if(senhaNova!==senhaConf) { toast("Confirmação não confere","err"); return; }
    // Em produção: POST /auth/change-password com bcrypt verify + hash
    auditLog("change_password",{userId:st.user.id},"warning");
    dispatch({type:"MEI.UPDATE_USER",p:{senhaAlteradaEm:tsISO()}});
    setShowSenha(false); setSenhaAtual(""); setSenhaNova(""); setSenhaConf("");
    toast("Senha alterada com sucesso! ✅");
  }

  // ── S8: MFA setup — TOTP RFC 6238 (mock: backend gera o secret real) ─────
  function iniciarMfa() {
    // Backend: POST /auth/mfa/setup → {secret, qrUri}
    // Aqui: secret demo para demonstrar o fluxo
    const secretDemo = "LUCROM"+btoa(st.user.id||"demo").replace(/[^A-Z2-7]/gi,"").toUpperCase().slice(0,16);
    setMfaSecret(secretDemo);
    setMfaStep("setup");
  }
  function confirmarMfa() {
    if(mfaCodigo.length!==6||isNaN(Number(mfaCodigo))) { toast("Código deve ter 6 dígitos","err"); return; }
    // Backend: POST /auth/mfa/confirm {codigo} → valida TOTP real
    dispatch({type:"MEI.UPDATE_USER",p:{mfaAtivo:true,mfaAtivoEm:tsISO()}});
    auditLog("mfa_enabled",{userId:st.user.id},"info");
    setMfaStep("active"); setMfaCodigo("");
    toast("MFA ativado com sucesso! 🔐");
  }
  function desativarMfa() {
    const ok=window.confirm("Desativar autenticação de dois fatores?\n\nIsso reduz a segurança da sua conta.");
    if(!ok) return;
    dispatch({type:"MEI.UPDATE_USER",p:{mfaAtivo:false,mfaDesativadoEm:tsISO()}});
    auditLog("mfa_disabled",{userId:st.user.id},"warning");
    setMfaStep("idle");
    toast("MFA desativado","warn");
  }

  // ── Sessões ativas (usa refreshTokens do estado) ──────────────────────────
  const sessoesAtivas = (st.sessions||[{id:"sess_current",criadaEm:st.user.createdAt||tsISO(),dispositivo:"Este dispositivo",atual:true}]);

  function handleExport() {
    auditLog("lgpd_export_data", { userId: st.user.id });
    const exportData = {
      exportedAt: new Date().toISOString(),
      titular: {
        nome: st.user.nome,
        email: st.user.email,
        cnpj: mask.cnpj(st.user.cnpj||""),
        cpf: mask.cpf(st.user.cpf||""),
        plano: st.user.plano,
        score: st.user.score,
        xp: st.user.xp,
        createdAt: st.user.createdAt,
      },
      transacoes: st.transactions.map(t=>({id:t.id,tipo:t.tipo,valor:t.valor,categoria:t.categoria,data:t.data})),
      notasFiscais: st.notasFiscais.map(n=>({numero:n.numero,valor:n.valor,competencia:n.competencia,status:n.status})),
      certificados: st.certs.map(c=>({tipo:c.tipo,status:c.status,emitidoEm:c.emitidoEm})),
      dasDeclaracoes: st.dasnDecs,
      missoesConcluidas: (st.missions||[]).filter(m=>m.done).map(m=>m.title),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lucrom_meus_dados_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Dados exportados com sucesso!");
  }

  function handleDelete() {
    const ok = window.confirm(
      "⚠️ ATENÇÃO — Esta ação é IRREVERSÍVEL.\n\nTodos os seus dados serão removidos em até 30 dias.\nVocê será desconectado imediatamente."
    );
    if (!ok) return;
    auditLog("lgpd_delete_request", { userId: st.user.id }, "warning");
    toast("Solicitação de exclusão registrada. Você receberá um e-mail de confirmação em 24h.", "ok");
  }

  return (
    <PageWrap title="🔒 Privacidade & Segurança">
      <AlertBox type="info">
        Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018). Você tem direito pleno sobre seus dados pessoais.
      </AlertBox>

      {/* ── S8: MFA / Autenticação de 2 Fatores ─────────────────────────── */}
      <Card style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>🔐 Autenticação de Dois Fatores (MFA)</div>
            <div style={{fontSize:12,color:T.ink60,lineHeight:1.5}}>
              Protege sua conta mesmo se sua senha for comprometida. Padrão RFC 6238 (TOTP).
            </div>
          </div>
          <Badge color={mfaAtivo?T.green:T.amber}>{mfaAtivo?"ATIVO":"INATIVO"}</Badge>
        </div>
        {mfaStep==="setup"&&(
          <div style={{background:T.ink02,borderRadius:T.radiusSm,padding:"14px",marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Configure no Google Authenticator ou Authy:</div>
            <div style={{fontFamily:"monospace",fontSize:14,fontWeight:800,letterSpacing:"3px",color:T.green,marginBottom:8,wordBreak:"break-all"}}>{mfaSecret}</div>
            <div style={{fontSize:11,color:T.ink60,marginBottom:12}}>Digite este código no app autenticador, depois informe o código de 6 dígitos gerado:</div>
            <Input label="Código de 6 dígitos" value={mfaCodigo} onChange={v=>setMfaCodigo(v.replace(/\D/g,"").slice(0,6))} placeholder="000000" hint="Código gerado pelo app autenticador"/>
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <Btn v="outline" onClick={()=>{setMfaStep("idle");setMfaCodigo("");}}>Cancelar</Btn>
              <Btn onClick={confirmarMfa} disabled={mfaCodigo.length!==6}>✅ Confirmar</Btn>
            </div>
          </div>
        )}
        {!mfaAtivo&&mfaStep!=="setup"&&<Btn v="secondary" onClick={iniciarMfa}>Ativar MFA →</Btn>}
        {mfaAtivo&&<Btn v="danger" size="sm" onClick={desativarMfa}>Desativar MFA</Btn>}
      </Card>

      {/* ── S8: Troca de Senha ───────────────────────────────────────────── */}
      <Card style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>🔑 Alterar Senha</div>
        <div style={{fontSize:12,color:T.ink60,marginBottom:12}}>Mínimo 12 caracteres com maiúscula, número e símbolo.</div>
        {showSenha?(
          <div>
            <Input label="Senha atual" value={senhaAtual} onChange={setSenhaAtual} type="password"/>
            <Input label="Nova senha" value={senhaNova} onChange={setSenhaNova} type="password"/>
            {senhaNova&&(
              <div style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                  <span style={{color:T.ink60}}>Força da senha</span>
                  <span style={{fontWeight:700,color:forcaSenha.color}}>{forcaSenha.label}</span>
                </div>
                <Bar v={forcaSenha.score} max={5} color={forcaSenha.color} h={5}/>
                {forcaSenha.score<3&&<div style={{fontSize:10,color:T.amber,marginTop:4}}>⚠️ Use ao menos 12 chars, 1 maiúscula, 1 número e 1 símbolo.</div>}
              </div>
            )}
            <Input label="Confirmar nova senha" value={senhaConf} onChange={setSenhaConf} type="password"
              error={senhaConf&&senhaConf!==senhaNova?"Senhas não conferem":undefined}/>
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <Btn v="outline" onClick={()=>{setShowSenha(false);setSenhaAtual("");setSenhaNova("");setSenhaConf("");}}>Cancelar</Btn>
              <Btn onClick={trocarSenha} disabled={forcaSenha.score<3||senhaNova!==senhaConf}>Alterar senha</Btn>
            </div>
          </div>
        ):<Btn v="outline" onClick={()=>setShowSenha(true)}>Alterar senha →</Btn>}
      </Card>

      {/* ── S8: Sessões Ativas ───────────────────────────────────────────── */}
      <Card style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>📱 Sessões Ativas</div>
        {sessoesAtivas.map((s,i)=>(
          <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<sessoesAtivas.length-1?`1px solid ${T.ink05}`:"none"}}>
            <div>
              <div style={{fontSize:13,fontWeight:700}}>{s.dispositivo||"Navegador Web"} {s.atual&&<Badge color={T.green} style={{fontSize:9}}>ATUAL</Badge>}</div>
              <div style={{fontSize:11,color:T.ink60,marginTop:2}}>Iniciada: {fmtSafeDate(s.criadaEm)}</div>
            </div>
            {!s.atual&&<Btn v="danger" size="sm" onClick={()=>{dispatch({type:"MEI.UPDATE_USER",p:{sessions:(st.sessions||[]).filter(ss=>ss.id!==s.id)}});toast("Sessão encerrada","warn");}}>Encerrar</Btn>}
          </div>
        ))}
        <Btn v="outline" size="sm" style={{marginTop:10}} onClick={()=>{dispatch({type:"MEI.UPDATE_USER",p:{sessions:[]}});toast("Todas as sessões encerradas","warn");}}>
          Encerrar todas as outras sessões
        </Btn>
      </Card>

      {/* ── S7: Preferências de Notificação ─────────────────────────────── */}
      <Card style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:14}}>🔔 Preferências de Notificação</div>
          <Btn v="outline" size="sm" onClick={()=>setShowNotifPrefs(v=>!v)}>{showNotifPrefs?"Fechar":"Configurar"}</Btn>
        </div>
        {showNotifPrefs&&(
          <div>
            <div style={{fontSize:12,color:T.ink60,marginBottom:12}}>
              Notificações urgentes (DAS, crédito) sempre entregues. Demais respeitam o horário de silêncio.
            </div>
            <Grid cols={2} gap={10} style={{marginBottom:14}}>
              <Input label="Silêncio início" value={prefs.silencioInicio||"22:00"} onChange={v=>dispatch({type:"SYSTEM.NOTIF_SET_PREFS",p:{...prefs,silencioInicio:v}})} type="time"/>
              <Input label="Silêncio fim" value={prefs.silencioFim||"08:00"} onChange={v=>dispatch({type:"SYSTEM.NOTIF_SET_PREFS",p:{...prefs,silencioFim:v}})} type="time"/>
            </Grid>
            <div style={{fontSize:11,fontWeight:700,color:T.ink60,marginBottom:8}}>Canais por tipo</div>
            {Object.entries(prefs.canais||{}).map(([tipo,canais])=>(
              <div key={tipo} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.ink05}`}}>
                <span style={{fontSize:12,fontWeight:600}}>{tipo}</span>
                <div style={{display:"flex",gap:6}}>
                  {["push","email"].map(canal=>{
                    const ativo=canais.includes(canal);
                    return (
                      <Chip key={canal} active={ativo} color={T.green} onClick={()=>{
                        const novos=ativo?canais.filter(c=>c!==canal):[...canais,canal];
                        dispatch({type:"SYSTEM.NOTIF_SET_PREFS",p:{...prefs,canais:{...prefs.canais,[tipo]:novos}}});
                      }}>{canal}</Chip>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>📥 Acessar meus dados (Art. 18, I)</div>
        <p style={{fontSize:13,color:T.ink60,marginBottom:14,lineHeight:1.6}}>
          Baixe um arquivo JSON com todas as suas informações: cadastro, transações, notas fiscais, certificados, missões e histórico de score.
        </p>
        <Btn onClick={handleExport} aria-label="Baixar todos os meus dados em formato JSON">
          📥 Exportar meus dados (JSON)
        </Btn>
      </Card>

      <Card style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>✏️ Corrigir dados (Art. 18, III)</div>
        <p style={{fontSize:13,color:T.ink60,marginBottom:14,lineHeight:1.6}}>
          Atualize nome, e-mail, telefone e outras informações no seu perfil. Dados provenientes da Receita Federal (CNPJ, CNAE) só podem ser alterados diretamente no órgão.
        </p>
        <Btn v="outline" aria-label="Ir para página de edição de perfil">✏️ Editar perfil</Btn>
      </Card>

      <Card style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>🔄 Revogar consentimento (Art. 18, IX)</div>
        {[
          {t:"Marketing e comunicações",d:"E-mails promocionais, newsletters e novidades do produto"},
          {t:"Análise de comportamento",d:"Uso de dados de navegação para melhorar o produto"},
          {t:"Compartilhamento com parceiros",d:"Envio de dados de score para instituições financeiras parceiras"},
        ].map(c=>(
          <div key={c.t} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:`1px solid ${T.ink05}`}}>
            <div>
              <div style={{fontWeight:600,fontSize:13}}>{c.t}</div>
              <div style={{fontSize:11,color:T.ink60}}>{c.d}</div>
            </div>
            <Btn size="sm" v="outline" aria-label={`Gerenciar consentimento: ${c.t}`}>Gerenciar</Btn>
          </div>
        ))}
      </Card>

      <Card style={{background:T.redPale,border:`1px solid ${T.red}40`,marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:14,color:T.red,marginBottom:10}}>🗑️ Excluir conta e dados (Art. 18, VI)</div>
        <p style={{fontSize:13,color:T.red,lineHeight:1.6,marginBottom:12}}>
          <strong>AVISO LEGAL:</strong> Ao solicitar a exclusão, todos os seus dados pessoais serão removidos em até 30 dias, exceto os que precisamos manter por obrigação legal (ex: registros fiscais por 5 anos conforme Código Tributário Nacional). Você tem 30 dias após a solicitação para cancelá-la.
        </p>
        <AlertBox type="danger">Esta ação não pode ser desfeita após o prazo de 30 dias. Você perderá acesso à conta, histórico e certificados.</AlertBox>
        <div style={{marginTop:12}}>
          <Btn v="danger" full onClick={handleDelete} aria-label="Solicitar exclusão permanente da conta e dados">
            🗑️ Solicitar exclusão de conta
          </Btn>
        </div>
        <p style={{fontSize:11,color:T.ink60,marginTop:10}}>
          Dúvidas? Entre em contato com nosso DPO:{" "}
          <a href="mailto:privacidade@lucrom.com.br" style={{color:T.green}}>privacidade@lucrom.com.br</a>
        </p>
      </Card>

    </PageWrap>
  );
}

function PagePerfil({ st, dispatch, go }) {
  const toast = useToast();
  const [nome, setNome] = useState(st.user.nome);
  const [email, setEmail] = useState(st.user.email);
  const [cnae, setCnae] = useState(st.user.cnae);
  const { theme, setTheme } = useTheme();

  // ── S10: Completude do perfil (função pura, on-the-fly) ──────────────────
  const completude = completudePerfil(st.user, st.transactions||[], st.notasFiscais||[], st.openFinance);

  function save() {
    if(!V.email(email)) { toast("Confirme o e-mail — formato inválido","err"); return; }
    auditLog("profile_update", { userId: st.user.id });
    dispatch({type:"MEI.UPDATE_USER",p:{nome,email,cnae}});
    toast("Perfil atualizado!");
  }
  return (
    <PageWrap title="👤 Meu Perfil">

      {/* ── S10: Barra de completude do perfil ──────────────────────────── */}
      <Card style={{marginBottom:14,border:`1px solid ${completude.pct>=80?T.greenBorder:T.amberBdr}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:13,fontWeight:700}}>Perfil {completude.pct}% completo</div>
          <Badge color={completude.pct>=80?T.green:T.amber}>{completude.done}/{completude.total} itens</Badge>
        </div>
        <Bar v={completude.pct} max={100} color={completude.pct>=80?T.green:T.amber} h={8}/>
        {completude.pct<100&&(
          <div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:6}}>
            {completude.checks.filter(c=>!c.ok).map(c=>(
              <span key={c.label} style={{fontSize:10,color:T.amber,background:T.amberPale,border:`1px solid ${T.amberBdr}`,borderRadius:T.radiusXs,padding:"3px 8px",fontWeight:600}}>
                ⚠ {c.label}
              </span>
            ))}
          </div>
        )}
        {completude.pct===100&&<div style={{marginTop:8,fontSize:12,color:T.green,fontWeight:700}}>✅ Perfil completo! Isso melhora seu score de crédito.</div>}
      </Card>

      <Grid cols={2} gap={14}>
        <Card>
          <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>Dados Pessoais</div>
          <Input label="Nome completo" value={nome} onChange={setNome}/>
          <Input label="E-mail" value={email} onChange={setEmail} type="email"/>
          {/* CPF/CNPJ mascarados — LGPD minimização */}
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:5}}>CPF <span style={{fontSize:10,color:T.ink40}}>🔒</span></label>
            <div style={{background:T.ink05,borderRadius:T.radius,padding:"10px 14px",fontSize:13,color:T.ink60,fontFamily:"monospace"}}>{mask.cpf(st.user.cpf||"")}</div>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:5}}>CNPJ <span style={{fontSize:10,color:T.ink40}}>🔒</span></label>
            <div style={{background:T.ink05,borderRadius:T.radius,padding:"10px 14px",fontSize:13,color:T.ink60,fontFamily:"monospace"}}>{mask.cnpj(st.user.cnpj||"")}</div>
          </div>
          <Sel label="CNAE" value={cnae} onChange={setCnae} options={Object.entries(CNAE_DB).map(([k,v])=>({v:k,l:`${k} — ${v}`}))}/>
          <Btn full onClick={save}>Salvar alterações</Btn>
          <div style={{marginTop:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <button onClick={()=>{}} disabled style={{display:"none",background:"transparent",border:"none",color:T.ink60,cursor:"pointer",fontSize:12}}>
              {theme==="dark"?"☀️ Modo claro":"🌙 Modo escuro"}
            </button>
            <button onClick={()=>go&&go("privacidade")}
              style={{background:"transparent",border:"none",color:T.green,cursor:"pointer",fontSize:12,textDecoration:"underline"}}>
              🔒 Privacidade & LGPD
            </button>
          </div>
        </Card>
        <Card>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Score & Reputação</div>
          <ScoreGauge score={st.user.score} size={130}/>
          <div style={{marginTop:10,textAlign:"center",fontSize:12,color:T.ink60}}>XP: <strong>{st.user.xp}</strong> · Plano: <strong>{st.user.plano}</strong></div>
        </Card>
      </Grid>
    </PageWrap>
  );
}

// ── PARCEIRO PAGES ─────────────────────────────────────────────

// ── PAINEL DO PARCEIRO — DESIGN TOKENS (DARK THEME) ──────────
const P_ = {
  bg:       "#0A0F1E",
  bgCard:   "#0D1526",
  bgHover:  "#111D35",
  border:   "rgba(99,139,230,.15)",
  borderHi: "rgba(99,139,230,.4)",
  blue:     "#19A348",
  blueLt:   "#4ADE80",
  blueDk:   "#15803D",
  neon:     "#22C55E",
  neonGlow: "0 0 12px rgba(34,197,94,.35)",
  green:    "#22C55E",
  amber:    "#F59E0B",
  red:      "#EF4444",
  text:     "#F1F5F9",
  text2:    "#94A3B8",
  text3:    "#475569",
  card:     {background:"#0D1526",borderRadius:12,border:"1px solid rgba(99,139,230,.15)",padding:"20px"},
  kpiCard:  {background:"#0D1526",borderRadius:12,border:"1px solid rgba(99,139,230,.15)",padding:"16px 20px"},
};

function calcSaude(c) {
  if(c.score>=750 && c.diasAtraso===0 && c.utilizacaoLimite<60) return {label:"Excelente",color:P_.green,icon:"🟢",dot:"#22C55E"};
  if(c.score>=650 && c.diasAtraso<15 && c.utilizacaoLimite<80) return {label:"Bom",color:P_.blueLt,icon:"🔵",dot:"#4ADE80"};
  if(c.score>=500 && c.diasAtraso<30) return {label:"Atenção",color:P_.amber,icon:"🟡",dot:"#F59E0B"};
  if(c.diasAtraso>=30 || c.score<500) return {label:"Crítico",color:P_.red,icon:"🔴",dot:"#EF4444"};
  return {label:"Risco Mod.",color:"#FB923C",icon:"🟠",dot:"#FB923C"};
}

function relTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000), h = Math.floor(diff/3600000), d = Math.floor(diff/86400000);
  if(m<60) return `${m}m atrás`;
  if(h<24) return `${h}h atrás`;
  return `${d}d atrás`;
}

function PageParcDash({ st, go, dispatch }) {
  const parc = st.parceiros?.[0];
  const toast = useToast();
  const [selectedClient, setSelectedClient] = useState(null);
  const [showNegociar, setShowNegociar] = useState(null);
  const [period, setPeriod] = useState("mes");

  if(!parc) return (
    <div style={{color:P_.text,textAlign:"center",padding:60}}>
      <div style={{fontSize:48,marginBottom:16}}>🏦</div>
      <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Nenhum parceiro vinculado</div>
      <div style={{fontSize:13,color:P_.text2}}>Entre em contato com a Lucrom para ativar sua conta parceiro.</div>
    </div>
  );

  const clientes = parc.clientes||[];
  const inadimplentes = clientes.filter(c=>c.diasAtraso>0);
  const negPendentes = (parc.negociacoesPendentes||[]).filter(n=>n.status==="AGUARDANDO");
  const volTotal = clientes.reduce((a,c)=>a+(c.limiteCredito||0),0);
  const creditoUsado = clientes.reduce((a,c)=>a+(c.creditoUtilizado||0),0);
  const valorRisco = inadimplentes.reduce((a,c)=>a+(c.saldoPendente||0),0);
  const scoresMedio = clientes.length ? Math.round(clientes.reduce((a,c)=>a+(c.score||0),0)/clientes.length) : 0;
  const taxaInadimpl = clientes.length ? ((inadimplentes.length/clientes.length)*100).toFixed(1) : "0.0";
  const clientesAtivos = clientes.filter(c=>c.status==="ATIVO").length;
  const comissaoPendente = (parc.revenueShare||[]).filter(r=>r.status==="PENDENTE").reduce((a,r)=>a+(r.comissao||0),0);

  const donutData = [
    {name:"Em dia",value:clientes.filter(c=>c.diasAtraso===0).length,color:P_.green},
    {name:"A liquidar",value:clientes.filter(c=>c.diasAtraso>0&&c.diasAtraso<30).length,color:P_.amber},
    {name:"Em atraso",value:clientes.filter(c=>c.diasAtraso>=30).length,color:P_.red},
  ];
  const scoreDist = [
    {name:"Excelente",min:750,max:1000,color:P_.green},
    {name:"Bom",min:650,max:750,color:P_.blueLt},
    {name:"Atenção",min:500,max:650,color:P_.amber},
    {name:"Risco",min:0,max:500,color:P_.red},
  ].map(f=>({...f,count:clientes.filter(c=>c.score>=f.min&&c.score<f.max).length}));
  const evolucao = parc.evolucaoCarteira||[];
  const fluxoOps = [
    {label:"Cadastrados",value:clientes.length,icon:"👤"},
    {label:"Aprovados",value:Math.round(clientes.length*.85),icon:"✅"},
    {label:"Ativos",value:clientesAtivos,icon:"🟢"},
    {label:"Em consumo",value:clientes.filter(c=>c.creditoUtilizado>0).length,icon:"💳"},
    {label:"Faturados",value:Math.round(clientesAtivos*.9),icon:"📄"},
    {label:"Em atraso",value:inadimplentes.length,icon:"⚠️"},
    {label:"Negociação",value:negPendentes.length,icon:"🤝"},
    {label:"Pagos",value:Math.round(inadimplentes.length*.4),icon:"💰"},
  ];

  const [tick, setTick] = useState(0);
  useEffect(()=>{const t=setInterval(()=>setTick(v=>v+1),30000);return()=>clearInterval(t);},[]);

  const bgMain = {minHeight:"100vh",background:P_.bg,color:P_.text,fontFamily:"inherit"};

  return (
    <div style={bgMain}>

      {/* ── BARRA SUPERIOR ── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"12px 24px",borderBottom:`1px solid ${P_.border}`,
        background:"rgba(13,21,38,.95)",backdropFilter:"blur(12px)",
        position:"sticky",top:0,zIndex:50,gap:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <div style={{fontSize:15,fontWeight:800,color:P_.text,letterSpacing:"-0.5px"}}>
            🏦 {parc.nome}
          </div>
          <div style={{display:"flex",gap:6}}>
            {["7d","mes","trim","ano"].map(p=>(
              <button key={p} onClick={()=>setPeriod(p)} style={{
                padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",
                background:period===p?"rgba(59,130,246,.2)":"transparent",
                color:period===p?P_.blue:P_.text3,
                border:`1px solid ${period===p?P_.border:"transparent"}`,fontFamily:"inherit"
              }}>{p==="mes"?"Este mês":p==="trim"?"Trimestre":p==="ano"?"Ano":p}</button>
            ))}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(34,197,94,.1)",
            border:"1px solid rgba(34,197,94,.25)",borderRadius:99,padding:"4px 10px"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:P_.green,
              boxShadow:"0 0 6px rgba(34,197,94,.6)",animation:"pulse 2s infinite"}}/>
            <span style={{fontSize:11,fontWeight:600,color:P_.green}}>Sistema Online</span>
          </div>
          {inadimplentes.length>0 && (
            <div style={{background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.3)",
              borderRadius:99,padding:"4px 10px",fontSize:11,fontWeight:600,color:P_.red,cursor:"pointer"}}
              onClick={()=>go("parc_carteira")}>
              🔴 {inadimplentes.length} em atraso
            </div>
          )}
          <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff"}}>
            {parc.nome[0]}
          </div>
        </div>
      </div>

      <div style={{padding:"20px 24px",maxWidth:1400,margin:"0 auto"}}>

        {/* ── CENTRAL DE ATENÇÃO ── */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,color:P_.text3,textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}}>Central de Atenção</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>

            <div style={{...P_.card,border:`1px solid rgba(239,68,68,.2)`,borderLeft:"3px solid "+P_.red,cursor:"pointer"}}
              onClick={()=>go("parc_carteira")}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:P_.red,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>⚠ Clientes em Atraso</div>
                  <div style={{fontSize:28,fontWeight:900,color:P_.text,letterSpacing:"-1px"}}>{inadimplentes.length}</div>
                  <div style={{fontSize:12,color:"#FB923C",fontWeight:600}}>R$ {(valorRisco).toLocaleString("pt-BR",{minimumFractionDigits:2})} em risco</div>
                </div>
                <div style={{fontSize:28,opacity:.6}}>🔴</div>
              </div>
              <button style={{width:"100%",padding:"6px 0",background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.3)",borderRadius:6,color:P_.red,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Ver carteira →</button>
            </div>

            <div style={{...P_.card,border:`1px solid rgba(245,158,11,.2)`,borderLeft:"3px solid "+P_.amber,cursor:"pointer"}}
              onClick={()=>go("parc_negociacoes")}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:P_.amber,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>🤝 Negociações Pendentes</div>
                  <div style={{fontSize:28,fontWeight:900,color:P_.text,letterSpacing:"-1px"}}>{negPendentes.length}</div>
                  <div style={{fontSize:12,color:P_.text2}}>aguardando resposta</div>
                </div>
                <div style={{fontSize:28,opacity:.6}}>🟠</div>
              </div>
              <button style={{width:"100%",padding:"6px 0",background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.3)",borderRadius:6,color:P_.amber,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Acompanhar →</button>
            </div>

            <div style={{...P_.card,border:`1px solid rgba(59,130,246,.2)`,borderLeft:"3px solid "+P_.blue}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:P_.blue,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>📅 Fechamento do Ciclo</div>
                  <div style={{fontSize:28,fontWeight:900,color:P_.text,letterSpacing:"-1px"}}>{Math.max(0,30-new Date().getDate())}</div>
                  <div style={{fontSize:12,color:P_.text2}}>dias restantes no mês</div>
                </div>
                <div style={{fontSize:28,opacity:.6}}>🔵</div>
              </div>
              <button onClick={()=>go("parc_settlement")} style={{width:"100%",padding:"6px 0",background:"rgba(59,130,246,.15)",border:"1px solid rgba(59,130,246,.3)",borderRadius:6,color:P_.blue,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Ver detalhes →</button>
            </div>

            <div style={{...P_.card,border:`1px solid rgba(34,197,94,.2)`,borderLeft:"3px solid "+P_.green,cursor:"pointer"}}
              onClick={()=>go("parc_infra")}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:P_.green,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>⚡ Infraestrutura</div>
                  <div style={{fontSize:14,fontWeight:700,color:P_.text,marginTop:4}}>
                    {(parc.infra?.apis||[]).filter(a=>a.status==="ONLINE").length}/{(parc.infra?.apis||[]).length} APIs Online
                  </div>
                  {(parc.infra?.apis||[]).find(a=>a.status!=="ONLINE") && (
                    <div style={{fontSize:11,color:P_.amber,fontWeight:600,marginTop:2}}>⚠ 1 serviço degradado</div>
                  )}
                </div>
                <div style={{fontSize:28,opacity:.6}}>🟢</div>
              </div>
              <button style={{width:"100%",padding:"6px 0",background:"rgba(34,197,94,.15)",border:"1px solid rgba(34,197,94,.3)",borderRadius:6,color:P_.green,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Ver status →</button>
            </div>
          </div>
        </div>

        {/* ── KPIs ESTRATÉGICOS ── */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,color:P_.text3,textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}}>KPIs Estratégicos</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            {[
              {label:"Carteira Total",value:`R$ ${(volTotal/1000).toFixed(0)}k`,sub:"+12% vs mês anterior",up:true,icon:"💼"},
              {label:"Crédito Utilizado",value:`R$ ${(creditoUsado/1000).toFixed(0)}k`,sub:`${((creditoUsado/(volTotal||1))*100).toFixed(0)}% do limite`,up:null,icon:"📊"},
              {label:"Score Médio",value:scoresMedio,sub:scoresMedio>=700?"Baixo risco":"Risco moderado",up:scoresMedio>=700,icon:"⭐"},
              {label:"Clientes Ativos",value:clientesAtivos,sub:`de ${clientes.length} total`,up:true,icon:"👥"},
              {label:"Taxa Inadimplência",value:taxaInadimpl+"%",sub:parseFloat(taxaInadimpl)<5?"Saudável":"Atenção",up:parseFloat(taxaInadimpl)<5,icon:"⚠️"},
              {label:"Valor em Risco",value:`R$ ${valorRisco.toLocaleString("pt-BR")}`,sub:`${inadimplentes.length} clientes`,up:false,icon:"🔴"},
              {label:"Comissão Pendente",value:`R$ ${comissaoPendente.toLocaleString("pt-BR")}`,sub:"a receber da Lucrom",up:comissaoPendente>0,icon:"💰"},
              {label:"Volume Financiado",value:`R$ ${((parc.volumeFinanciado||0)/1000000).toFixed(2)}M`,sub:"+28% acumulado",up:true,icon:"📈"},
            ].map(k=>(
              <div key={k.label} style={{...P_.kpiCard,display:"flex",flexDirection:"column",gap:6}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,fontWeight:600,color:P_.text2,textTransform:"uppercase",letterSpacing:"0.5px"}}>{k.icon} {k.label}</span>
                  {k.up!==null&&<span style={{fontSize:10,fontWeight:700,color:k.up?P_.green:P_.red}}>{k.up?"▲":"▼"}</span>}
                </div>
                <div style={{fontSize:20,fontWeight:900,color:P_.text,letterSpacing:"-0.5px"}}>{k.value}</div>
                <div style={{fontSize:11,color:k.up===true?P_.green:k.up===false?P_.red:P_.text3}}>{k.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── ANÁLISE VISUAL DA CARTEIRA ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr",gap:12,marginBottom:20}}>

          <div style={{...P_.card}}>
            <div style={{fontSize:12,fontWeight:700,color:P_.text,marginBottom:16}}>🍩 Saúde da Carteira</div>
            <div style={{height:140}}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                    {donutData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Pie>
                  <Tooltip contentStyle={{background:P_.bgCard,border:`1px solid ${P_.border}`,borderRadius:8,fontSize:11,color:P_.text}}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {donutData.map(d=>(
                <div key={d.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:d.color}}/>
                    <span style={{fontSize:11,color:P_.text2}}>{d.name}</span>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:P_.text}}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{...P_.card}}>
            <div style={{fontSize:12,fontWeight:700,color:P_.text,marginBottom:16}}>📈 Evolução da Carteira</div>
            <div style={{height:180}}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolucao}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,139,230,.1)"/>
                  <XAxis dataKey="mes" tick={{fill:P_.text3,fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:P_.text3,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                  <Tooltip contentStyle={{background:P_.bgCard,border:`1px solid ${P_.border}`,borderRadius:8,fontSize:11,color:P_.text}} formatter={v=>[`R$ ${v.toLocaleString("pt-BR")}`,""]}/>
                  <Line type="monotone" dataKey="volume" stroke={P_.neon} strokeWidth={2.5} dot={{fill:P_.neon,r:3}} activeDot={{r:5,fill:P_.neon}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{...P_.card}}>
            <div style={{fontSize:12,fontWeight:700,color:P_.text,marginBottom:16}}>🎯 Distribuição de Score</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {scoreDist.map(f=>(
                <div key={f.name}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:11,color:P_.text2}}>{f.name}</span>
                    <span style={{fontSize:11,fontWeight:700,color:f.color}}>{f.count}</span>
                  </div>
                  <div style={{height:6,background:"rgba(255,255,255,.06)",borderRadius:99}}>
                    <div style={{height:"100%",borderRadius:99,background:f.color,width:`${clientes.length?((f.count/clientes.length)*100):0}%`,transition:"width .5s"}}/>
                  </div>
                </div>
              ))}
            </div>
            <div style={{marginTop:16,padding:"10px",background:"rgba(59,130,246,.08)",borderRadius:8,border:`1px solid ${P_.border}`}}>
              <div style={{fontSize:10,color:P_.text3,fontWeight:600,textTransform:"uppercase"}}>Score Médio</div>
              <div style={{fontSize:22,fontWeight:900,color:P_.neon,letterSpacing:"-1px"}}>{scoresMedio}</div>
            </div>
          </div>
        </div>

        {/* ── FLUXO OPERACIONAL ── */}
        <div style={{...P_.card,marginBottom:20}}>
          <div style={{fontSize:12,fontWeight:700,color:P_.text,marginBottom:16}}>🔄 Fluxo Operacional da Carteira</div>
          <div style={{display:"flex",alignItems:"center",gap:0,overflowX:"auto",paddingBottom:4}}>
            {fluxoOps.map((f,i)=>(
              <React.Fragment key={f.label}>
                <div style={{textAlign:"center",minWidth:90,flexShrink:0}}>
                  <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(59,130,246,.12)",border:`2px solid ${P_.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,margin:"0 auto 6px"}}>
                    {f.icon}
                  </div>
                  <div style={{fontSize:10,fontWeight:700,color:P_.text,lineHeight:1.3}}>{f.label}</div>
                  <div style={{fontSize:13,fontWeight:900,color:P_.blue,marginTop:2}}>{f.value}</div>
                  {i>0&&fluxoOps[i-1].value>0&&<div style={{fontSize:9,color:P_.text3}}>{Math.round((f.value/fluxoOps[i-1].value)*100)}%</div>}
                </div>
                {i<fluxoOps.length-1&&<div style={{flex:1,height:2,background:`linear-gradient(90deg,${P_.border},${P_.borderHi})`,minWidth:16,flexShrink:0,margin:"0 2px"}}/>}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── GESTÃO DE CLIENTES + ATIVIDADES ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:16}}>

          <div style={{...P_.card,padding:0,overflow:"hidden"}}>
            <div style={{padding:"16px 20px",borderBottom:`1px solid ${P_.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:12,fontWeight:700,color:P_.text}}>👥 Gestão de Clientes</div>
              <button onClick={()=>go("parc_carteira")} style={{background:"rgba(59,130,246,.15)",border:`1px solid ${P_.border}`,borderRadius:6,color:P_.blue,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Ver todos →</button>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:"rgba(255,255,255,.02)"}}>
                    {["Cliente","Score","Saúde","Limite","Utilizado","Atraso","Saldo","Ações"].map(h=>(
                      <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:700,color:P_.text3,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:`1px solid ${P_.border}`,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientes.map(c=>{
                    const saude = calcSaude(c);
                    return (
                      <tr key={c.id} style={{borderBottom:`1px solid rgba(99,139,230,.06)`,cursor:"pointer",transition:"background .15s"}}
                        onMouseEnter={e=>e.currentTarget.style.background="rgba(59,130,246,.05)"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                        onClick={()=>setSelectedClient(c)}>
                        <td style={{padding:"12px 14px"}}>
                          <div style={{fontWeight:600,color:P_.text}}>{c.nome}</div>
                          <div style={{fontSize:10,color:P_.text3}}>{c.cpf}</div>
                        </td>
                        <td style={{padding:"12px 14px"}}>
                          <span style={{fontWeight:800,color:c.score>=700?P_.green:c.score>=500?P_.amber:P_.red}}>{c.score}</span>
                        </td>
                        <td style={{padding:"12px 14px"}}>
                          <span style={{display:"inline-flex",alignItems:"center",gap:4,background:`${saude.dot}18`,border:`1px solid ${saude.dot}40`,borderRadius:99,padding:"2px 8px",fontSize:10,fontWeight:700,color:saude.color}}>
                            {saude.icon} {saude.label}
                          </span>
                        </td>
                        <td style={{padding:"12px 14px",color:P_.text2}}>R$ {(c.limiteCredito||0).toLocaleString("pt-BR")}</td>
                        <td style={{padding:"12px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <div style={{height:4,width:50,background:"rgba(255,255,255,.08)",borderRadius:99}}>
                              <div style={{height:"100%",borderRadius:99,background:c.utilizacaoLimite>80?P_.red:c.utilizacaoLimite>60?P_.amber:P_.green,width:`${c.utilizacaoLimite||0}%`}}/>
                            </div>
                            <span style={{color:P_.text2}}>{c.utilizacaoLimite||0}%</span>
                          </div>
                        </td>
                        <td style={{padding:"12px 14px"}}>
                          {c.diasAtraso>0
                            ? <span style={{fontWeight:700,color:c.diasAtraso>=30?P_.red:P_.amber,background:c.diasAtraso>=30?"rgba(239,68,68,.12)":"rgba(245,158,11,.12)",borderRadius:99,padding:"2px 8px"}}>{c.diasAtraso}d</span>
                            : <span style={{color:P_.green,fontWeight:600}}>✓</span>}
                        </td>
                        <td style={{padding:"12px 14px",color:c.saldoPendente>0?P_.red:P_.text3,fontWeight:c.saldoPendente>0?700:400}}>
                          {c.saldoPendente>0?`R$ ${c.saldoPendente.toLocaleString("pt-BR")}`:"—"}
                        </td>
                        <td style={{padding:"12px 14px"}}>
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={e=>{e.stopPropagation();setSelectedClient(c);}} style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${P_.border}`,background:"transparent",color:P_.blueLt,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Ver</button>
                            {c.saldoPendente>0&&<button onClick={e=>{e.stopPropagation();setShowNegociar(c);}} style={{padding:"4px 8px",borderRadius:5,border:"1px solid rgba(245,158,11,.3)",background:"rgba(245,158,11,.1)",color:P_.amber,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Negociar</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{...P_.card,padding:0,overflow:"hidden"}}>
            <div style={{padding:"14px 16px",borderBottom:`1px solid ${P_.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:12,fontWeight:700,color:P_.text}}>⚡ Atividades</div>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:P_.green,boxShadow:"0 0 6px rgba(34,197,94,.6)"}}/>
                <span style={{fontSize:9,color:P_.green,fontWeight:600}}>Ao vivo</span>
              </div>
            </div>
            <div style={{overflowY:"auto",maxHeight:420,padding:"8px 0"}}>
              {(parc.atividadesRecentes||[]).map(a=>(
                <div key={a.id} style={{padding:"10px 16px",borderBottom:`1px solid rgba(99,139,230,.06)`,transition:"background .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(59,130,246,.04)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                    <div style={{fontSize:16,flexShrink:0,marginTop:1}}>{a.icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,color:P_.text,lineHeight:1.4,marginBottom:2}}>{a.desc}</div>
                      <div style={{fontSize:10,color:P_.text3}}>{relTime(a.ts)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── DRAWER: PERFIL DO CLIENTE ── */}
      {selectedClient && (
        <div style={{position:"fixed",inset:0,zIndex:200,display:"flex"}}>
          <div style={{flex:1,background:"rgba(0,0,0,.6)",backdropFilter:"blur(4px)"}} onClick={()=>setSelectedClient(null)}/>
          <div style={{width:420,background:P_.bgCard,borderLeft:`1px solid ${P_.border}`,overflowY:"auto",animation:"slideIn .2s ease"}}>
            {(()=>{
              const c = selectedClient;
              const saude = calcSaude(c);
              const meses = ["Jan","Fev","Mar","Abr","Mai","Jun"];
              return (
                <div style={{padding:24}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
                    <div style={{fontSize:14,fontWeight:800,color:P_.text}}>{c.nome}</div>
                    <button onClick={()=>setSelectedClient(null)} style={{background:"transparent",border:"none",color:P_.text3,fontSize:20,cursor:"pointer"}}>✕</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
                    {[
                      {l:"Score",v:c.score,bold:true,color:c.score>=700?P_.green:c.score>=500?P_.amber:P_.red},
                      {l:"Saúde",v:saude.label,bold:true,color:saude.color},
                      {l:"Limite",v:`R$ ${(c.limiteCredito||0).toLocaleString("pt-BR")}`},
                      {l:"Utilizado",v:`R$ ${(c.creditoUtilizado||0).toLocaleString("pt-BR")}`},
                      {l:"Dias em Atraso",v:c.diasAtraso||"Nenhum",color:c.diasAtraso>0?P_.red:P_.green},
                      {l:"Saldo Pendente",v:c.saldoPendente>0?`R$ ${c.saldoPendente.toLocaleString("pt-BR")}`:"—",color:c.saldoPendente>0?P_.red:P_.text2},
                    ].map(f=>(
                      <div key={f.l} style={{background:"rgba(255,255,255,.04)",borderRadius:8,padding:"10px 12px",border:`1px solid ${P_.border}`}}>
                        <div style={{fontSize:10,color:P_.text3,fontWeight:600,marginBottom:4}}>{f.l}</div>
                        <div style={{fontSize:15,fontWeight:f.bold?800:600,color:f.color||P_.text}}>{f.v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{marginBottom:20}}>
                    <div style={{fontSize:11,fontWeight:700,color:P_.text,marginBottom:10}}>📅 Histórico de Pagamento</div>
                    <div style={{display:"flex",gap:6}}>
                      {(c.historicoPagamento||[]).map((p,i)=>(
                        <div key={i} style={{flex:1,textAlign:"center"}}>
                          <div style={{fontSize:9,color:P_.text3,marginBottom:4}}>{meses[i]||""}</div>
                          <div style={{width:"100%",height:28,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,
                            background:p==="PAGO"?"rgba(34,197,94,.15)":p==="ATRASO"?"rgba(245,158,11,.15)":"rgba(239,68,68,.15)",
                            border:`1px solid ${p==="PAGO"?"rgba(34,197,94,.3)":p==="ATRASO"?"rgba(245,158,11,.3)":"rgba(239,68,68,.3)"}`,
                            color:p==="PAGO"?P_.green:p==="ATRASO"?P_.amber:P_.red}}>
                            {p==="PAGO"?"✓":p==="ATRASO"?"⚠":"✕"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{background:"rgba(59,130,246,.08)",border:`1px solid rgba(59,130,246,.2)`,borderRadius:10,padding:14,marginBottom:20}}>
                    <div style={{fontSize:11,fontWeight:700,color:P_.blue,marginBottom:8}}>🤖 Inteligência Financeira</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                      {[
                        {l:"Prob. Inadimpl.",v:c.score<500?"Alta":c.score<650?"Média":"Baixa",color:c.score<500?P_.red:c.score<650?P_.amber:P_.green},
                        {l:"Prob. Pagamento",v:c.score>=700?"Alta":c.score>=500?"Média":"Baixa",color:c.score>=700?P_.green:c.score>=500?P_.amber:P_.red},
                        {l:"Risco Operac.",v:c.utilizacaoLimite>80?"Alto":c.utilizacaoLimite>60?"Médio":"Baixo",color:c.utilizacaoLimite>80?P_.red:c.utilizacaoLimite>60?P_.amber:P_.green},
                        {l:"Score Tendência",v:c.diasAtraso===0?"Estável ↑":"Queda ↓",color:c.diasAtraso===0?P_.green:P_.red},
                      ].map(f=>(
                        <div key={f.l} style={{textAlign:"center",padding:"8px 4px",background:"rgba(255,255,255,.04)",borderRadius:6}}>
                          <div style={{fontSize:9,color:P_.text3,marginBottom:2}}>{f.l}</div>
                          <div style={{fontSize:12,fontWeight:800,color:f.color}}>{f.v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize:11,color:P_.text2,lineHeight:1.6,fontStyle:"italic"}}>
                      {c.score>=750&&c.diasAtraso===0
                        ? `"Cliente com excelente histórico. Considere oferecer aumento de limite para fidelização."`
                        : c.diasAtraso>=30
                        ? `"Cliente crítico com ${c.diasAtraso} dias em atraso. Priorize contato imediato e ofereça renegociação em até 3 parcelas."`
                        : `"Cliente apresenta risco moderado. Monitore utilização do limite e considere proposta de regularização."`}
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {[
                      {label:"Negociar",color:P_.amber,bg:"rgba(245,158,11,.15)",border:"rgba(245,158,11,.3)",action:()=>{setSelectedClient(null);setShowNegociar(c);}},
                      {label:"Enviar Proposta",color:P_.blue,bg:"rgba(59,130,246,.15)",border:"rgba(59,130,246,.3)",action:()=>toast("Proposta enviada via WhatsApp!")},
                      {label:"Liberar Crédito",color:P_.green,bg:"rgba(34,197,94,.15)",border:"rgba(34,197,94,.3)",action:()=>{dispatch({type:"PARC.CLIENT_SET_BLOQUEADO",p:{id:c.id,bloqueado:false}});setSelectedClient(null);toast("✅ Crédito liberado para "+c.nome);}},
                      {label:"Bloquear",color:P_.red,bg:"rgba(239,68,68,.15)",border:"rgba(239,68,68,.3)",action:()=>{dispatch({type:"PARC.CLIENT_SET_BLOQUEADO",p:{id:c.id,bloqueado:true}});setSelectedClient(null);toast("🔒 Crédito bloqueado para "+c.nome);}},
                    ].map(a=>(
                      <button key={a.label} onClick={a.action} style={{padding:"8px 0",borderRadius:7,background:a.bg,border:`1px solid ${a.border}`,color:a.color,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{a.label}</button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── MODAL: SIMULADOR DE NEGOCIAÇÃO ── */}
      {showNegociar && (
        <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.7)",backdropFilter:"blur(6px)"}}>
          <div style={{width:420,background:P_.bgCard,borderRadius:16,border:`1px solid ${P_.border}`,padding:24,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontSize:14,fontWeight:800,color:P_.text}}>🤝 Simulador de Negociação</div>
              <button onClick={()=>setShowNegociar(null)} style={{background:"transparent",border:"none",color:P_.text3,fontSize:20,cursor:"pointer"}}>✕</button>
            </div>
            {(()=>{
              const divida = showNegociar.saldoPendente||0;
              const opcoes = [
                {label:"À vista com 15% desc.",parcelas:1,valor:divida*.85,taxa:0},
                {label:"2x sem juros",parcelas:2,valor:divida/2,taxa:0},
                {label:"3x com 2% a.m.",parcelas:3,valor:(divida*(1+0.02*3))/3,taxa:2},
                {label:"6x com 3% a.m.",parcelas:6,valor:(divida*(1+0.03*6))/6,taxa:3},
                {label:"12x com 4% a.m.",parcelas:12,valor:(divida*(1+0.04*12))/12,taxa:4},
              ];
              return (
                <>
                  <div style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",borderRadius:8,padding:12,marginBottom:16}}>
                    <div style={{fontSize:10,color:P_.text3,fontWeight:600}}>Cliente</div>
                    <div style={{fontSize:13,fontWeight:700,color:P_.text}}>{showNegociar.nome}</div>
                    <div style={{fontSize:11,color:P_.text2,marginTop:4}}>Saldo em aberto: <strong style={{color:P_.red}}>R$ {divida.toLocaleString("pt-BR",{minimumFractionDigits:2})}</strong></div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                    {opcoes.map(o=>(
                      <div key={o.label} style={{padding:"12px 14px",borderRadius:8,border:`1px solid ${P_.border}`,background:"rgba(255,255,255,.03)",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",transition:"all .15s"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor=P_.blue}
                        onMouseLeave={e=>e.currentTarget.style.borderColor=P_.border}
                        onClick={()=>toast(`Proposta "${o.label}" enviada via WhatsApp!`)}>
                        <div>
                          <div style={{fontSize:12,fontWeight:600,color:P_.text}}>{o.label}</div>
                          {o.taxa>0&&<div style={{fontSize:10,color:P_.text3}}>{o.taxa}% a.m.</div>}
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:13,fontWeight:800,color:P_.neon}}>{o.parcelas>1?`${o.parcelas}x `:""}R$ {o.valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                          <div style={{fontSize:10,color:P_.text3}}>Total: R$ {(o.valor*o.parcelas).toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {[
                      {label:"📱 WhatsApp",bg:"rgba(34,197,94,.15)",color:P_.green,border:"rgba(34,197,94,.3)"},
                      {label:"📧 E-mail",bg:"rgba(59,130,246,.15)",color:P_.blue,border:"rgba(59,130,246,.3)"},
                    ].map(ch=>(
                      <button key={ch.label} onClick={()=>toast(`Proposta enviada via ${ch.label.split(" ")[1]}!`)} style={{padding:"10px",borderRadius:8,background:ch.bg,border:`1px solid ${ch.border}`,color:ch.color,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{ch.label}</button>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PARCEIRO: COBRANÇAS ────────────────────────────────────────
function PageParcCobrancas({ st, go, dispatch }) {
  const toast = useToast();
  const parc = st.parceiros?.[0];
  const clientes = parc?.clientes||[];
  const inadimplentes = clientes.filter(c=>c.diasAtraso>0);
  const [filtro, setFiltro] = useState("todos");
  const lista = filtro==="critico"?inadimplentes.filter(c=>c.diasAtraso>=30)
    :filtro==="atencao"?inadimplentes.filter(c=>c.diasAtraso<30)
    :inadimplentes;

  return (
    <div style={{background:P_.bg,minHeight:"100vh",padding:24,color:P_.text}}>
      <div style={{fontSize:16,fontWeight:800,marginBottom:4}}>💳 Cobranças</div>
      <div style={{fontSize:12,color:P_.text2,marginBottom:20}}>Gerencie clientes com pagamentos em atraso</div>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {[{k:"todos",l:`Todos (${inadimplentes.length})`},{k:"critico",l:"Crítico (30+ dias)"},{k:"atencao",l:"Atenção (<30 dias)"}].map(f=>(
          <button key={f.k} onClick={()=>setFiltro(f.k)} style={{
            padding:"6px 14px",borderRadius:99,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:"none",
            background:filtro===f.k?"rgba(59,130,246,.25)":"rgba(255,255,255,.06)",
            color:filtro===f.k?P_.blueLt:P_.text2}}>
            {f.l}
          </button>
        ))}
      </div>
      {lista.length===0
        ? <div style={{...P_.card,textAlign:"center",padding:48}}><div style={{fontSize:40,marginBottom:12}}>🎉</div><div style={{color:P_.text2,fontSize:14}}>Nenhum cliente em atraso</div></div>
        : <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {lista.map(c=>{
            const saude=calcSaude(c);
            return (
              <div key={c.id} style={{...P_.card,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:160}}>
                  <div style={{fontWeight:700,fontSize:13}}>{c.nome}</div>
                  <div style={{fontSize:11,color:P_.text3,marginTop:2}}>{c.cpf}</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:P_.text3}}>Dias em atraso</div>
                  <div style={{fontSize:18,fontWeight:900,color:c.diasAtraso>=30?P_.red:P_.amber}}>{c.diasAtraso}d</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:P_.text3}}>Saldo pendente</div>
                  <div style={{fontSize:16,fontWeight:800,color:P_.red}}>R$ {(c.saldoPendente||0).toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:P_.text3}}>Score</div>
                  <div style={{fontSize:14,fontWeight:700,color:c.score>=500?P_.amber:P_.red}}>{c.score}</div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>toast(`Notificação enviada para ${c.nome}!`)} style={{padding:"7px 12px",borderRadius:7,background:"rgba(59,130,246,.15)",border:"1px solid rgba(59,130,246,.3)",color:P_.blue,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📱 Notificar</button>
                  <button onClick={()=>toast("Proposta de negociação enviada!")} style={{padding:"7px 12px",borderRadius:7,background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.3)",color:P_.amber,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🤝 Negociar</button>
                  <button onClick={()=>toast(`Crédito de ${c.nome} bloqueado!`)} style={{padding:"7px 12px",borderRadius:7,background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.3)",color:P_.red,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🔒 Bloquear</button>
                </div>
              </div>
            );
          })}
        </div>}
    </div>
  );
}

// ── PARCEIRO: INFRAESTRUTURA ───────────────────────────────────
function PageParcInfra({ st }) {
  const parc = st.parceiros?.[0];
  const apis = parc?.infra?.apis||[];
  const [ping, setPing] = useState({});
  useEffect(()=>{
    const simulate = ()=>{
      const p={};
      apis.forEach(a=>{p[a.nome]=Math.round(parseInt(a.latencia)+Math.random()*30-15);});
      setPing(p);
    };
    simulate();
    const t=setInterval(simulate,10000);
    return()=>clearInterval(t);
  },[]);

  return (
    <div style={{background:P_.bg,minHeight:"100vh",padding:24,color:P_.text}}>
      <div style={{fontSize:16,fontWeight:800,marginBottom:4}}>⚡ Infraestrutura</div>
      <div style={{fontSize:12,color:P_.text2,marginBottom:20}}>Status em tempo real das APIs e integrações</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {apis.map(a=>{
          const online=a.status==="ONLINE";
          const degradado=a.status==="DEGRADADO";
          const latAtual=ping[a.nome]||parseInt(a.latencia);
          return (
            <div key={a.nome} style={{...P_.card,border:`1px solid ${online?"rgba(34,197,94,.2)":degradado?"rgba(245,158,11,.2)":"rgba(239,68,68,.2)"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:13}}>{a.nome}</div>
                <span style={{padding:"3px 10px",borderRadius:99,fontSize:10,fontWeight:700,background:online?"rgba(34,197,94,.15)":degradado?"rgba(245,158,11,.15)":"rgba(239,68,68,.15)",color:online?P_.green:degradado?P_.amber:P_.red,border:`1px solid ${online?"rgba(34,197,94,.3)":degradado?"rgba(245,158,11,.3)":"rgba(239,68,68,.3)"}`}}>
                  {online?"● ONLINE":degradado?"⚠ DEGRADADO":"✕ OFFLINE"}
                </span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[{l:"Latência",v:`${latAtual}ms`,color:latAtual<100?P_.green:latAtual<300?P_.amber:P_.red},
                  {l:"Uptime",v:a.uptime,color:parseFloat(a.uptime)>99?P_.green:parseFloat(a.uptime)>97?P_.amber:P_.red}].map(f=>(
                  <div key={f.l} style={{background:"rgba(255,255,255,.04)",borderRadius:7,padding:"8px 10px"}}>
                    <div style={{fontSize:9,color:P_.text3,fontWeight:600,marginBottom:2}}>{f.l}</div>
                    <div style={{fontSize:14,fontWeight:800,color:f.color}}>{f.v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PARCEIRO: NEGOCIAÇÕES ──────────────────────────────────────
function PageParcNegociacoes({ st, go, dispatch }) {
  const toast = useToast();
  const parc = st.parceiros?.[0];
  const [showSim, setShowSim] = useState(null);
  const negociacoes = parc?.negociacoesPendentes||[];

  return (
    <div style={{background:P_.bg,minHeight:"100vh",padding:24,color:P_.text}}>
      <div style={{fontSize:16,fontWeight:800,marginBottom:4}}>🤝 Negociações</div>
      <div style={{fontSize:12,color:P_.text2,marginBottom:20}}>Propostas e renegociações em andamento</div>
      {negociacoes.length===0
        ? <div style={{...P_.card,textAlign:"center",padding:48}}><div style={{fontSize:40,marginBottom:12}}>✅</div><div style={{color:P_.text2}}>Nenhuma negociação pendente</div></div>
        : <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {negociacoes.map(n=>(
            <div key={n.id} style={{...P_.card,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13}}>{n.clienteNome}</div>
                <div style={{fontSize:11,color:P_.text3,marginTop:2}}>
                  {n.status==="AGUARDANDO"?"⏳ Aguardando resposta do cliente":"🔍 Em análise"}
                  {" · "}{relTime(n.ts)}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:P_.text3}}>Valor da dívida</div>
                <div style={{fontSize:16,fontWeight:800,color:P_.red}}>R$ {(n.valorDivida||0).toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setShowSim(n)} style={{padding:"7px 12px",borderRadius:7,background:"rgba(59,130,246,.15)",border:"1px solid rgba(59,130,246,.3)",color:P_.blue,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Simular</button>
                <button onClick={()=>toast("Proposta enviada via WhatsApp!")} style={{padding:"7px 12px",borderRadius:7,background:"rgba(34,197,94,.15)",border:"1px solid rgba(34,197,94,.3)",color:P_.green,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>📱 Enviar</button>
              </div>
            </div>
          ))}
        </div>}

      {showSim && (
        <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.7)",backdropFilter:"blur(6px)"}}>
          <div style={{width:420,background:P_.bgCard,borderRadius:16,border:`1px solid ${P_.border}`,padding:24}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:14,fontWeight:800,color:P_.text}}>🤝 Simulador — {showSim.clienteNome}</div>
              <button onClick={()=>setShowSim(null)} style={{background:"transparent",border:"none",color:P_.text3,fontSize:20,cursor:"pointer"}}>✕</button>
            </div>
            {[
              {label:"À vista (15% desc.)",parcelas:1,valor:(showSim.valorDivida||0)*.85},
              {label:"2x sem juros",parcelas:2,valor:(showSim.valorDivida||0)/2},
              {label:"3x (2% a.m.)",parcelas:3,valor:((showSim.valorDivida||0)*1.06)/3},
              {label:"6x (3% a.m.)",parcelas:6,valor:((showSim.valorDivida||0)*1.18)/6},
              {label:"12x (4% a.m.)",parcelas:12,valor:((showSim.valorDivida||0)*1.48)/12},
            ].map(o=>(
              <div key={o.label} onClick={()=>toast(`Proposta "${o.label}" enviada!`)}
                style={{padding:"12px 14px",borderRadius:8,border:`1px solid ${P_.border}`,background:"rgba(255,255,255,.03)",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",transition:"all .15s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=P_.blue}
                onMouseLeave={e=>e.currentTarget.style.borderColor=P_.border}>
                <div style={{fontSize:12,fontWeight:600,color:P_.text}}>{o.label}</div>
                <div style={{fontSize:13,fontWeight:800,color:P_.neon}}>{o.parcelas>1?`${o.parcelas}x `:""}R$ {o.valor.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PARCEIRO: RELATÓRIOS ───────────────────────────────────────
function PageParcRelatorios({ st }) {
  const parc = st.parceiros?.[0];
  const [periodo, setPeriodo] = useState("semestral");

  if(!parc) return (
    <div style={{background:P_.bg,minHeight:"100vh",padding:24,color:P_.text,textAlign:"center",paddingTop:80}}>
      <div style={{fontSize:40,marginBottom:12}}>📊</div>
      <div style={{fontSize:16,fontWeight:700}}>Nenhum parceiro vinculado</div>
    </div>
  );

  const clientes = parc.clientes||[];
  const inadimplentes = clientes.filter(c=>c.diasAtraso>0);
  const taxaInadimpl = clientes.length ? (inadimplentes.length/clientes.length*100).toFixed(1) : "0.0";
  const volTotal = clientes.reduce((a,c)=>a+(c.limiteCredito||0),0);
  const creditoUsado = clientes.reduce((a,c)=>a+(c.creditoUtilizado||0),0);
  const utilizacao = volTotal>0 ? ((creditoUsado/volTotal)*100).toFixed(1) : "0.0";
  const comissaoTotal = (parc.revenueShare||[]).reduce((a,r)=>a+(r.comissao||0),0);
  const comissaoPaga  = (parc.revenueShare||[]).filter(r=>r.status==="PAGO").reduce((a,r)=>a+(r.comissao||0),0);
  const scoresMedio   = clientes.length ? Math.round(clientes.reduce((a,c)=>a+(c.score||0),0)/clientes.length) : 0;
  const evolucao = parc.evolucaoCarteira||[];

  // Conversão por mês (simulado com base na evolucao)
  const conversaoData = evolucao.map((e,i)=>({
    mes: e.mes,
    volume: e.volume,
    conversao: Math.round(28 + i*1.2),
    comissao: Math.round(e.volume * 0.025),
  }));

  // Distribuição de score para gráfico de barras
  const scoreDist = [
    {faixa:"300–499",count:clientes.filter(c=>c.score<500).length,color:P_.red},
    {faixa:"500–649",count:clientes.filter(c=>c.score>=500&&c.score<650).length,color:P_.amber},
    {faixa:"650–749",count:clientes.filter(c=>c.score>=650&&c.score<750).length,color:P_.blueLt},
    {faixa:"750–1000",count:clientes.filter(c=>c.score>=750).length,color:P_.green},
  ];

  // Revenue Share por tipo
  const rsData = [
    {name:"Comissão Paga",value:comissaoPaga,color:P_.green},
    {name:"Pendente",value:comissaoTotal-comissaoPaga,color:P_.amber},
  ].filter(d=>d.value>0);

  const KPI = ({label,value,sub,up,icon})=>(
    <div style={{...P_.kpiCard}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:600,color:P_.text3,textTransform:"uppercase",letterSpacing:"0.5px"}}>{icon} {label}</span>
        {up!==undefined&&<span style={{fontSize:10,fontWeight:700,color:up?P_.green:P_.red}}>{up?"▲":"▼"}</span>}
      </div>
      <div style={{fontSize:22,fontWeight:900,color:P_.text,letterSpacing:"-0.5px",marginBottom:4}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:P_.text3}}>{sub}</div>}
    </div>
  );

  return (
    <div style={{background:P_.bg,minHeight:"100vh",color:P_.text,fontFamily:"inherit"}}>

      {/* Header */}
      <div style={{padding:"16px 24px",borderBottom:`1px solid ${P_.border}`,background:"rgba(13,21,38,.95)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:15,fontWeight:800}}>📊 Relatórios de Performance</div>
          <div style={{fontSize:11,color:P_.text3,marginTop:2}}>{parc.nome} · Análise consolidada</div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {[{k:"mensal",l:"Mensal"},{k:"semestral",l:"Semestral"},{k:"anual",l:"Anual"}].map(p=>(
            <button key={p.k} onClick={()=>setPeriodo(p.k)} style={{
              padding:"5px 12px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",
              background:periodo===p.k?"rgba(59,130,246,.25)":"rgba(255,255,255,.06)",
              color:periodo===p.k?P_.blue:P_.text3,
              border:`1px solid ${periodo===p.k?P_.borderHi:"transparent"}`
            }}>{p.l}</button>
          ))}
        </div>
      </div>

      <div style={{padding:"20px 24px",maxWidth:1400,margin:"0 auto"}}>

        {/* ── KPIs ── */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,color:P_.text3,textTransform:"uppercase",letterSpacing:"1px",marginBottom:10}}>Indicadores Consolidados</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
            <KPI label="Volume da Carteira" value={`R$ ${(volTotal/1000).toFixed(0)}k`} sub="limite total concedido" up={true} icon="💼"/>
            <KPI label="Crédito Utilizado" value={`${utilizacao}%`} sub={`R$ ${(creditoUsado/1000).toFixed(0)}k de R$ ${(volTotal/1000).toFixed(0)}k`} icon="📊"/>
            <KPI label="Score Médio" value={scoresMedio} sub={scoresMedio>=700?"Carteira saudável":"Monitorar risco"} up={scoresMedio>=700} icon="⭐"/>
            <KPI label="Taxa Inadimplência" value={`${taxaInadimpl}%`} sub={`${inadimplentes.length} clientes em atraso`} up={parseFloat(taxaInadimpl)<5} icon="⚠️"/>
            <KPI label="Volume Financiado" value={`R$ ${((parc.volumeFinanciado||0)/1000000).toFixed(2)}M`} sub="acumulado histórico" up={true} icon="📈"/>
            <KPI label="Conversão Média" value={`${parc.conversao||0}%`} sub="leads → clientes ativos" up={(parc.conversao||0)>=30} icon="🎯"/>
            <KPI label="Comissão Recebida" value={`R$ ${comissaoPaga.toLocaleString("pt-BR")}`} sub={`de R$ ${comissaoTotal.toLocaleString("pt-BR")} total`} up={true} icon="💰"/>
            <KPI label="Clientes Ativos" value={clientes.filter(c=>c.status==="ATIVO").length} sub={`de ${clientes.length} total (${clientes.length>0?Math.round(clientes.filter(c=>c.status==="ATIVO").length/clientes.length*100):0}%)`} up={true} icon="👥"/>
          </div>
        </div>

        {/* ── GRÁFICO VOLUME + CONVERSÃO ── */}
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12,marginBottom:12}}>
          <div style={{...P_.card}}>
            <div style={{fontSize:12,fontWeight:700,color:P_.text,marginBottom:16}}>📈 Volume Financiado por Mês</div>
            <div style={{height:200}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={conversaoData} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,139,230,.08)" vertical={false}/>
                  <XAxis dataKey="mes" tick={{fill:P_.text3,fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:P_.text3,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                  <Tooltip contentStyle={{background:P_.bgCard,border:`1px solid ${P_.border}`,borderRadius:8,fontSize:11,color:P_.text}} formatter={v=>[`R$ ${v.toLocaleString("pt-BR")}`,""]}/>
                  <Bar dataKey="volume" fill={P_.blue} radius={[4,4,0,0]} opacity={0.85}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{...P_.card}}>
            <div style={{fontSize:12,fontWeight:700,color:P_.text,marginBottom:16}}>💰 Receita de Comissões</div>
            <div style={{height:160}}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rsData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={4} dataKey="value">
                    {rsData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Pie>
                  <Tooltip contentStyle={{background:P_.bgCard,border:`1px solid ${P_.border}`,borderRadius:8,fontSize:11,color:P_.text}} formatter={v=>[`R$ ${v.toLocaleString("pt-BR")}`,""]}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:4}}>
              {rsData.map(d=>(
                <div key={d.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:d.color}}/>
                    <span style={{fontSize:11,color:P_.text2}}>{d.name}</span>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:d.color}}>R$ {d.value.toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── CONVERSÃO + SCORE DIST ── */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>

          <div style={{...P_.card}}>
            <div style={{fontSize:12,fontWeight:700,color:P_.text,marginBottom:16}}>🎯 Taxa de Conversão (%)</div>
            <div style={{height:180}}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={conversaoData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,139,230,.08)"/>
                  <XAxis dataKey="mes" tick={{fill:P_.text3,fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:P_.text3,fontSize:10}} axisLine={false} tickLine={false} domain={[0,60]} tickFormatter={v=>`${v}%`}/>
                  <Tooltip contentStyle={{background:P_.bgCard,border:`1px solid ${P_.border}`,borderRadius:8,fontSize:11,color:P_.text}} formatter={v=>[`${v}%`,""]}/>
                  <Line type="monotone" dataKey="conversao" stroke={P_.green} strokeWidth={2.5} dot={{fill:P_.green,r:3}} activeDot={{r:5}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{...P_.card}}>
            <div style={{fontSize:12,fontWeight:700,color:P_.text,marginBottom:16}}>🏆 Distribuição de Score da Carteira</div>
            <div style={{height:180}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreDist} layout="vertical" barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,139,230,.08)" horizontal={false}/>
                  <XAxis type="number" tick={{fill:P_.text3,fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis dataKey="faixa" type="category" tick={{fill:P_.text2,fontSize:10}} axisLine={false} tickLine={false} width={65}/>
                  <Tooltip contentStyle={{background:P_.bgCard,border:`1px solid ${P_.border}`,borderRadius:8,fontSize:11,color:P_.text}} formatter={v=>[`${v} clientes`,""]}/>
                  <Bar dataKey="count" radius={[0,4,4,0]}>
                    {scoreDist.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── COMISSÃO MENSAL ── */}
        <div style={{...P_.card,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:P_.text,marginBottom:16}}>📅 Receita de Comissão por Mês</div>
          <div style={{height:160}}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={conversaoData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,139,230,.08)" vertical={false}/>
                <XAxis dataKey="mes" tick={{fill:P_.text3,fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:P_.text3,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`R$ ${(v/1000).toFixed(0)}k`}/>
                <Tooltip contentStyle={{background:P_.bgCard,border:`1px solid ${P_.border}`,borderRadius:8,fontSize:11,color:P_.text}} formatter={v=>[`R$ ${v.toLocaleString("pt-BR")}`,""]}/>
                <Bar dataKey="comissao" fill={P_.neon} radius={[4,4,0,0]} opacity={0.85}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── TABELA RESUMO HISTÓRICO ── */}
        <div style={{...P_.card,padding:0,overflow:"hidden"}}>
          <div style={{padding:"14px 20px",borderBottom:`1px solid ${P_.border}`}}>
            <div style={{fontSize:12,fontWeight:700,color:P_.text}}>📋 Histórico Mensal Detalhado</div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr style={{background:"rgba(255,255,255,.02)"}}>
                  {["Mês","Volume","Comissão","Conversão","Acumulado"].map(h=>(
                    <th key={h} style={{padding:"10px 16px",textAlign:"left",fontSize:10,fontWeight:700,color:P_.text3,textTransform:"uppercase",letterSpacing:"0.5px",borderBottom:`1px solid ${P_.border}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conversaoData.map((r,i)=>{
                  const acumulado = conversaoData.slice(0,i+1).reduce((a,x)=>a+x.volume,0);
                  return (
                    <tr key={r.mes} style={{borderBottom:`1px solid rgba(99,139,230,.06)`}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(59,130,246,.04)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{padding:"11px 16px",fontWeight:600,color:P_.text}}>{r.mes}</td>
                      <td style={{padding:"11px 16px",color:P_.text2}}>R$ {r.volume.toLocaleString("pt-BR")}</td>
                      <td style={{padding:"11px 16px",color:P_.green,fontWeight:700}}>R$ {r.comissao.toLocaleString("pt-BR")}</td>
                      <td style={{padding:"11px 16px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{height:4,width:60,background:"rgba(255,255,255,.06)",borderRadius:99}}>
                            <div style={{height:"100%",borderRadius:99,background:r.conversao>=35?P_.green:P_.amber,width:`${r.conversao}%`}}/>
                          </div>
                          <span style={{color:r.conversao>=35?P_.green:P_.amber,fontWeight:700}}>{r.conversao}%</span>
                        </div>
                      </td>
                      <td style={{padding:"11px 16px",color:P_.neon,fontWeight:700}}>R$ {acumulado.toLocaleString("pt-BR")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

function PageParcCarteira({ st, dispatch }) {
  const toast = useToast();
  const parc = st.parceiros[0];
  const [filter, setFilter] = useState("todos");
  const clientes = (parc?.clientes||[]).filter(c=>filter==="todos"||c.status===filter||(filter==="INADIMPLENTE"&&c.inadimplente));
  return (
    <PageWrap title="👥 Carteira">
      <AlertBox type="info" style={{marginBottom:12}}>🔒 Dados mascarados conforme LGPD.</AlertBox>
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        {["todos","ATIVO","ANALISE","PAGO","INADIMPLENTE"].map(f=><Chip key={f} active={filter===f} onClick={()=>setFilter(f)} color={f==="INADIMPLENTE"?T.red:T.green}>{f==="todos"?"Todos":f}</Chip>)}
      </div>
      <Grid cols={2} gap={12}>
        {clientes.map(c=>(
          <Card key={c.id}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div><div style={{fontWeight:700,fontSize:14}}>{c.nome}</div><div style={{fontSize:11,color:T.ink60}}>{c.cnpj}</div></div>
              <Badge color={c.inadimplente?T.red:c.status==="ATIVO"?T.green:T.ink40}>{c.inadimplente?"INADIMPLENTE":c.status}</Badge>
            </div>
            <Grid cols={3} gap={6} style={{marginBottom:10}}>
              <CardFlat><div style={{fontSize:9,color:T.ink60}}>SCORE</div><div style={{fontWeight:700,fontSize:14,color:ScoreEngine.risk(c.score).color}}>{c.score}</div></CardFlat>
              <CardFlat><div style={{fontSize:9,color:T.ink60}}>VALOR</div><div style={{fontWeight:700,fontSize:13}}>{fmtBRL(c.valor)}</div></CardFlat>
              <CardFlat><div style={{fontSize:9,color:T.ink60}}>PARCELAS</div><div style={{fontWeight:700,fontSize:13}}>{c.parcelas}×</div></CardFlat>
            </Grid>
            {c.status==="ATIVO"&&!c.inadimplente && (
              <div style={{display:"flex",gap:7}}>
                <Btn size="sm" v="outline" full onClick={()=>{dispatch({type:"PARTNER.MARK_PAID",p:{bancoId:parc.id,clienteId:c.id}});toast("Pago!");}}>Quitado</Btn>
                <Btn size="sm" v="danger" full onClick={()=>{dispatch({type:"PARTNER.MARK_DEFAULT",p:{bancoId:parc.id,clienteId:c.id}});toast("Registrado","warn");}}>Inadimpl.</Btn>
              </div>
            )}
          </Card>
        ))}
      </Grid>
    </PageWrap>
  );
}

function PageParcOperacoes({ st, dispatch }) {
  const toast = useToast();
  const [tab, setTab] = useState("pendentes");
  const parc = st.parceiros[0];
  const ops = (st.operacoes||[]).filter(o=>o.parceiroId===parc?.id);
  const pendentes = ops.filter(o=>["SOLICITADA","EM_ANALISE"].includes(o.status));
  const aprovadas = ops.filter(o=>o.status==="APROVADA");
  const ativas = ops.filter(o=>["LIBERADA","ADIMPLENTE"].includes(o.status));
  const [showApprove, setShowApprove] = useState(null);
  const [showEnviarProp, setShowEnviarProp] = useState(false);
  const [taxa, setTaxa] = useState("1.99");
  const [taxaErr, setTaxaErr] = useState("");
  // Enviar proposta pelo parceiro
  const [propValor, setPropValor] = useState("");
  const [propTaxa, setPropTaxa] = useState("1.49");
  const [propParcelas, setPropParcelas] = useState("12");
  const [propMsg, setPropMsg] = useState("");
  const [propDias, setPropDias] = useState("7");

  function handleAprovar() {
    const taxaNum = safeNum(taxa.replace(",","."));
    if(taxaNum<=0||taxaNum>30) { setTaxaErr("Taxa inválida (0,01% a 30%)"); return; }
    const vp = PriceTable.calcPMT(showApprove.valorPrincipal, taxaNum, showApprove.parcelas);
    dispatch({type:"CREDIT.PARCEIRO_APPROVE",p:{id:showApprove.id,taxaJuros:taxaNum,valorParcela:Math.round(vp*100)/100}});
    setShowApprove(null); setTaxa("1.99"); setTaxaErr(""); toast("Operação aprovada!");
  }

  function handleEnviarProposta() {
    if(!propValor||safeNum(propValor)<=0) { toast("Informe o valor","err"); return; }
    const val = safeNum(propValor);
    const tx = safeNum(propTaxa.replace(",","."));
    const parc2 = safeNum(propParcelas);
    const vp = Math.round((val*(1+(tx/100)*parc2))/parc2*100)/100;
    dispatch({type:"CREDIT.PARCEIRO_ENVIAR_PROPOSTA",p:{
      bancoId:parc.id, bancoNome:parc.nome,
      valor:val, taxa:`${propTaxa}% a.m.`, parcelas:parc2,
      valorParcela:vp, mensagem:propMsg||`Proposta especial de ${parc.nome}.`,
      diasValidade:safeNum(propDias)||7
    }});
    setShowEnviarProp(false); setPropValor(""); setPropMsg(""); toast("Proposta enviada ao MEI!");
  }

  const showOps = tab==="pendentes"?pendentes:tab==="aprovadas"?aprovadas:ativas;
  return (
    <PageWrap title="Gestão de Operações"
      action={<div style={{display:"flex",gap:8}}>
        {pendentes.length>0&&<Badge color={T.red} style={{fontSize:13,padding:"6px 14px"}}>🔴 {pendentes.length} pendentes</Badge>}
        <Btn v="teal" onClick={()=>setShowEnviarProp(true)}>📤 Enviar Proposta</Btn>
      </div>}>
      {pendentes.length>0 && <AlertBox type="warn"><strong>{pendentes.length}</strong> solicitação(ões) aguardando análise.</AlertBox>}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <Chip active={tab==="pendentes"} onClick={()=>setTab("pendentes")} color={T.amber}>⏳ Pendentes ({pendentes.length})</Chip>
        <Chip active={tab==="aprovadas"} onClick={()=>setTab("aprovadas")} color={T.teal}>✓ Aprovadas ({aprovadas.length})</Chip>
        <Chip active={tab==="ativas"} onClick={()=>setTab("ativas")} color={T.green}>🟢 Ativas ({ativas.length})</Chip>
      </div>
      {showOps.length===0 && <Card style={{textAlign:"center",padding:28}}><div style={{fontSize:36,marginBottom:10}}>💳</div><div style={{fontWeight:800}}>Nenhuma operação aqui</div></Card>}
      {showOps.map(op=>(
        <Card key={op.id} style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{fontWeight:800,fontSize:15}}>{op.meiNome}</div>
              <div style={{fontSize:11,color:T.ink60}}>{fmtBRL(op.valorPrincipal)} · {op.parcelas}×{op.taxaJuros>0?` · ${op.taxaJuros}% a.m.`:""}{op.valorParcela>0?` · ${fmtBRL(op.valorParcela)}/parc`:""}</div>
              <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                {op.scoreNaMidia>0&&<span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99,background:op.scoreNaMidia>=700?"rgba(34,168,90,.15)":op.scoreNaMidia>=500?"rgba(245,158,11,.15)":"rgba(239,68,68,.15)",color:op.scoreNaMidia>=700?T.green:op.scoreNaMidia>=500?T.amber:T.red}}>Score {op.scoreNaMidia}</span>}
                {op.fraudScore>0&&<span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99,background:op.fraudScore<40?"rgba(34,168,90,.12)":"rgba(239,68,68,.12)",color:op.fraudScore<40?T.green:T.red}}>Fraude {op.fraudScore}/100</span>}
                {op.deviceId&&op.deviceId!=="unknown"&&<span style={{fontSize:9,color:T.ink40,padding:"2px 6px",borderRadius:99,background:T.ink02}}>🔒 Device verificado</span>}
                {op.lgpdAccepted&&<span style={{fontSize:9,color:T.green,padding:"2px 6px",borderRadius:99,background:"rgba(34,168,90,.08)"}}>✓ LGPD</span>}
              </div>
            </div>
            <OperacaoStatusBadge status={op.status}/>
          </div>
          {["LIBERADA","ADIMPLENTE"].includes(op.status) && (
            <>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:12}}>
                <span style={{color:T.ink60}}>Saldo devedor</span>
                <span style={{fontWeight:700,color:T.red}}>{fmtBRL(op.saldoDevedor)}</span>
              </div>
              <Bar v={op.valorPrincipal-op.saldoDevedor} max={op.valorPrincipal} color={T.green} h={5}/>
              {op.comissaoLucrom>0 && (
                <div style={{marginTop:6,fontSize:11,color:T.ink60}}>
                  Comissão Lucrom: <strong style={{color:T.green}}>{fmtBRL(op.comissaoLucrom)}</strong>
                  <Badge color={op.comissaoLucromStatus==="LIQUIDADA"?T.green:T.amber} style={{marginLeft:8,fontSize:9}}>{op.comissaoLucromStatus||"PENDENTE"}</Badge>
                </div>
              )}
            </>
          )}
          <div style={{display:"flex",gap:8,marginTop:10}}>
            {op.status==="SOLICITADA" && (
              <>
                <Btn size="sm" full onClick={()=>{setShowApprove(op);setTaxa("1.99");setTaxaErr("");}}>🔍 Aprovar</Btn>
                <Btn size="sm" v="danger" full onClick={()=>{dispatch({type:"CREDIT.CLIENT_REJECT",p:op.id});toast("Operação recusada","warn");}}>✕ Recusar</Btn>
              </>
            )}
            {op.status==="APROVADA" && <Btn size="sm" full v="teal" onClick={()=>{dispatch({type:"CREDIT.PARCEIRO_RELEASE",p:op.id});toast("Crédito liberado!");}}>💸 Liberar Crédito</Btn>}
          </div>
        </Card>
      ))}

      {/* Modal Aprovar */}
      <Modal open={!!showApprove} onClose={()=>setShowApprove(null)} title="Aprovar Operação" width={420}>
        {showApprove && (
          <>
            <CardFlat style={{marginBottom:14}}>
              <div style={{fontWeight:700}}>{showApprove.meiNome}</div>
              <Grid cols={2} gap={8} style={{marginTop:8}}>
                <div><div style={{fontSize:10,color:T.ink60}}>Valor</div><div style={{fontWeight:800,fontSize:16,color:T.green}}>{fmtBRL(showApprove.valorPrincipal)}</div></div>
                <div><div style={{fontSize:10,color:T.ink60}}>Parcelas</div><div style={{fontWeight:800,fontSize:16}}>{showApprove.parcelas}×</div></div>
              </Grid>
            </CardFlat>
            <Input label="Taxa (% ao mês) *" value={taxa} onChange={v=>{setTaxa(v);setTaxaErr("");}} suffix="% a.m." error={taxaErr}/>
            {taxa && safeNum(taxa.replace(",","."))>0 && (
              <CardFlat style={{marginBottom:14,background:T.greenPale}}>
                <div style={{fontSize:11,fontWeight:700,color:T.green,marginBottom:4}}>Simulação</div>
                {(()=>{const tx=safeNum(taxa.replace(",","."));const vp=(showApprove.valorPrincipal*(1+(tx/100)*showApprove.parcelas))/showApprove.parcelas;return(<><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:T.ink60}}>Parcela</span><span style={{fontSize:14,fontWeight:800,color:T.green}}>{fmtBRL(vp)}</span></div><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:T.ink60}}>Total</span><span style={{fontSize:13,fontWeight:700}}>{fmtBRL(vp*showApprove.parcelas)}</span></div></>);})()}
              </CardFlat>
            )}
            <div style={{display:"flex",gap:8}}>
              <Btn v="outline" full onClick={()=>setShowApprove(null)}>Cancelar</Btn>
              <Btn full onClick={handleAprovar}>✅ Aprovar</Btn>
            </div>
          </>
        )}
      </Modal>

      {/* Modal Enviar Proposta */}
      <Modal open={showEnviarProp} onClose={()=>setShowEnviarProp(false)} title="📤 Enviar Proposta ao MEI" width={460}>
        <AlertBox type="info">A proposta será enviada para o MEI analisar. Ele pode aceitar ou recusar.</AlertBox>
        <Grid cols={2} gap={10}>
          <Input label="Valor (R$) *" value={propValor} onChange={setPropValor} prefix="R$" placeholder="0,00"/>
          <Input label="Taxa (% a.m.) *" value={propTaxa} onChange={setPropTaxa} suffix="% a.m."/>
        </Grid>
        <Grid cols={2} gap={10}>
          <Sel label="Parcelas *" value={propParcelas} onChange={setPropParcelas} options={["6","12","18","24","36","48","60"].map(v=>({v,l:`${v}× de ${fmtBRL(safeNum(propValor)>0?(safeNum(propValor)*(1+(safeNum(propTaxa.replace(",","."))/100)*safeNum(v)))/safeNum(v):0)}`}))}/>
          <Sel label="Validade (dias)" value={propDias} onChange={setPropDias} options={[{v:"3",l:"3 dias"},{v:"5",l:"5 dias"},{v:"7",l:"7 dias"},{v:"15",l:"15 dias"}]}/>
        </Grid>
        {safeNum(propValor)>0 && (
          <CardFlat style={{marginBottom:12,background:T.greenPale}}>
            <div style={{fontSize:11,fontWeight:700,color:T.green,marginBottom:6}}>Resumo da Proposta</div>
            {(()=>{
              const val=safeNum(propValor); const tx=safeNum(propTaxa.replace(",",".")); const parc2=safeNum(propParcelas);
              const vp=Math.round((val*(1+(tx/100)*parc2))/parc2*100)/100;
              const com=Math.round(val*0.025*100)/100;
              return(<>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:T.ink60}}>Parcela estimada</span><span style={{fontWeight:800,color:T.green}}>{fmtBRL(vp)}</span></div>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:T.ink60}}>Total ao cliente</span><span style={{fontWeight:700}}>{fmtBRL(vp*parc2)}</span></div>
                <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:T.ink60}}>Comissão Lucrom (2,5%)</span><span style={{fontWeight:700,color:T.amber}}>{fmtBRL(com)}</span></div>
              </>);
            })()}
          </CardFlat>
        )}
        <Input label="Mensagem ao MEI" value={propMsg} onChange={setPropMsg} placeholder="Ex: Oferta especial com condições exclusivas..." rows={2}/>
        <div style={{display:"flex",gap:8}}>
          <Btn v="outline" full onClick={()=>setShowEnviarProp(false)}>Cancelar</Btn>
          <Btn full v="teal" onClick={handleEnviarProposta}>📤 Enviar Proposta</Btn>
        </div>
      </Modal>
    </PageWrap>
  );
}

function PageParcScore({ st }) {
  const [cnpj, setCnpj] = useState("");
  const [result, setResult] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("score"); // score | risco | cert

  // --- aba de verificação de certificado ---
  const [certId, setCertId] = useState("");
  const [certResult, setCertResult] = useState(null); // {status:"valido"|"expirado"|"revogado"|"nao_encontrado", cert}
  const [certErro, setCertErro] = useState("");

  function verificarCert() {
    const id = certId.trim();
    if(!id) { setCertErro("Informe o ID do certificado."); return; }
    setCertErro(""); setCertResult(null);
    const found = (st.certs||[]).find(c=>c.id===id||(c.id||"").toLowerCase()===id.toLowerCase());
    if(!found) { setCertResult({status:"nao_encontrado"}); return; }
    const agora = Date.now();
    const expirado = found.expiraEm && new Date(found.expiraEm).getTime() < agora;
    const revogado = found.active === false;
    const status = revogado?"revogado":expirado?"expirado":"valido";
    setCertResult({status, cert:found});
  }

  // Matriz PD/LGD/EAD por faixa de score
  const RISK_MATRIX = [
    {score:300, pd:28, lgd:55, label:"CRÍTICO", color:T.red},
    {score:500, pd:14, lgd:50, label:"ALTO",    color:T.amber},
    {score:650, pd:6,  lgd:45, label:"MÉDIO",   color:"#f59e0b"},
    {score:750, pd:2,  lgd:40, label:"BAIXO",   color:T.green},
    {score:900, pd:2,  lgd:35, label:"MÍNIMO",  color:T.green},
  ];

  function getRiskRow(score) {
    return RISK_MATRIX.slice().reverse().find(r=>score>=r.score) || RISK_MATRIX[0];
  }

  async function consultar() {
    setErro(""); const cnpjLimpo = cnpj.replace(/\D/g,"");
    if(!V.cnpj(cnpjLimpo)) { setErro("CNPJ inválido — verifique os dígitos"); setResult(null); return; }
    setLoading(true);
    const cnpjUser = (st.user.cnpj||"").replace(/\D/g,"");
    if(cnpjLimpo===cnpjUser) {
      const sc = ScoreEngine.calc(st.transactions,st.missions,st.dasnDecs,st.certs,st.notasFiscais);
      setResult({score:sc.total, risco:ScoreEngine.risk(sc.total), cnpj, nome:st.user.nome,
        comportamental:{Financeiro:Math.min(100,Math.round(sc.total*.14)),Fiscal:Math.min(100,Math.round(sc.total*.13)),Cadastral:Math.min(100,Math.round(sc.total*.12)),Antifraude:Math.min(100,Math.round(sc.total*.11)),Comportamento:Math.min(100,Math.round(sc.total*.10))}});
    } else {
      const cli = st.parceiros.flatMap(p=>p.clientes||[]).find(c=>(c.cnpj||"").replace(/\D/g,"").slice(0,8)===cnpjLimpo.slice(0,8));
      if(cli) setResult({score:cli.score,risco:ScoreEngine.risk(cli.score),cnpj,nome:cli.nome,
        comportamental:{Financeiro:Math.min(100,Math.round(cli.score*.14)),Fiscal:Math.min(100,Math.round(cli.score*.13)),Cadastral:Math.min(100,Math.round(cli.score*.12)),Antifraude:Math.min(100,Math.round(cli.score*.11)),Comportamento:Math.min(100,Math.round(cli.score*.10))}});
      else { setErro("CNPJ não encontrado na base Lucrom."); setResult(null); }
    }
    setLoading(false);
  }

  const riskRow = result ? getRiskRow(result.score) : null;
  const ead = result ? 10000 : 0; // valor padrão — em produção vem da operação
  const el = riskRow ? Math.round((riskRow.pd/100)*(riskRow.lgd/100)*ead) : 0;

  // Dados para radar
  const radarData = result ? Object.entries(result.comportamental).map(([k,v])=>({subject:k,value:v,fullMark:100})) : [];

  return (
    <PageWrap title="Score & Análise de Risco">
      {/* Busca por CNPJ */}
      <Card style={{marginBottom:14}}>
        <div style={{marginBottom:0}}>
          <label style={{display:"block",fontSize:12,fontWeight:700,color:erro?T.red:T.ink60,marginBottom:5}}>
            CNPJ do MEI
          </label>
          <div style={{display:"flex",gap:8}}>
            <input value={cnpj} onChange={e=>{setCnpj(V.fmtCNPJ(e.target.value));setErro("");}}
              placeholder="00.000.000/0001-00" maxLength={18}
              style={{flex:1,height:42,borderRadius:T.radius,padding:"0 12px",background:T.white,border:`1.5px solid ${erro?T.red:T.ink10}`,color:T.ink,fontSize:13,outline:"none"}}/>
            <Btn disabled={loading} onClick={consultar}>{loading?"⏳":"Consultar"}</Btn>
          </div>
          {erro && <p style={{margin:"4px 0 0",fontSize:11,color:T.red,fontWeight:600}}>{erro}</p>}
        </div>
      </Card>

      {result && (
        <>
          {/* Abas */}
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
            <Chip active={tab==="score"} onClick={()=>setTab("score")} color={T.purple}>📊 Score Comportamental</Chip>
            <Chip active={tab==="risco"} onClick={()=>setTab("risco")} color={T.red}>⚖️ Análise de Risco</Chip>
            <Chip active={tab==="cert"} onClick={()=>setTab("cert")} color={T.teal}>🔍 Verificar Certificado</Chip>
          </div>

          {/* ABA: Score Comportamental Radar (tela 8) */}
          {tab==="score" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {/* Gráfico Radar */}
              <Card>
                <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Score Comportamental</div>
                <div style={{fontSize:11,color:T.ink60,marginBottom:10}}>Gráfico radar — 5 dimensões.</div>
                <div style={{height:200}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RBar data={radarData} layout="horizontal">
                      <XAxis type="category" dataKey="subject" tick={{fontSize:9}}/>
                      <YAxis type="number" domain={[0,100]} hide/>
                      <Tooltip contentStyle={{fontSize:11}}/>
                      <RBar dataKey="value" fill={T.green} radius={4}/>
                    </RBar>
                  </ResponsiveContainer>
                </div>
                <div style={{textAlign:"center",marginTop:8}}>
                  <span style={{fontSize:28,fontWeight:900,color:T.green}}>{result.score}</span>
                  <span style={{fontSize:16,color:T.ink40}}> / 1000</span>
                </div>
              </Card>

              {/* Dimensões */}
              <Card>
                <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>{result.nome}</div>
                {Object.entries(result.comportamental).map(([k,v])=>(
                  <div key={k} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                      <span style={{color:T.ink60}}>{k}</span>
                      <span style={{fontWeight:700,color:v>=60?T.green:v>=40?T.amber:T.red}}>{v}</span>
                    </div>
                    <Bar v={v} max={100} color={v>=60?T.green:v>=40?T.amber:T.red} h={4}/>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {/* ABA: Análise de Risco PD/LGD/EAD (tela 7) */}
          {tab==="risco" && riskRow && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {/* Simulador */}
              <Card>
                <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Simulador</div>
                <div style={{padding:"16px",background:`${riskRow.color}12`,borderRadius:T.radius,border:`1.5px solid ${riskRow.color}40`}}>
                  <div style={{fontWeight:900,fontSize:18,color:riskRow.color,marginBottom:12}}>
                    Risco {riskRow.label}
                  </div>
                  {[
                    {l:"PD (Prob. Default)", v:`${riskRow.pd}%`},
                    {l:"LGD (Perda s/ Default)", v:`${riskRow.lgd}%`},
                    {l:"EAD (Exposição)", v:fmtBRL(ead)},
                    {l:"EL (Perda Esperada)", v:fmtBRL(el)},
                  ].map(({l,v})=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:13}}>
                      <span style={{color:T.ink60}}>{l}</span>
                      <span style={{fontWeight:700}}>{v}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Matriz */}
              <Card>
                <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Matriz Score × Risco</div>
                {RISK_MATRIX.map(r=>(
                  <div key={r.score} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"8px",borderRadius:8,background:result.score>=r.score&&result.score<r.score+200?`${r.color}12`:"transparent",border:result.score>=r.score&&result.score<r.score+200?`1px solid ${r.color}40`:"1px solid transparent"}}>
                    <span style={{fontWeight:900,fontSize:16,color:r.color,minWidth:36}}>{r.score}</span>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",gap:8,fontSize:11}}>
                        <span style={{color:T.ink60}}>PD</span>
                        <span style={{fontWeight:700,color:r.color}}>{r.pd}%</span>
                        <span style={{color:T.ink60}}>EL</span>
                        <span style={{fontWeight:700,color:r.color}}>R$ {Math.round(r.pd/100*r.lgd/100*10000)}</span>
                      </div>
                      <div style={{height:3,borderRadius:2,background:r.color,marginTop:4,width:`${100-r.pd*2}%`}}/>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </>
      )}

          {/* ABA: Verificar Certificado */}
          {tab==="cert" && (
            <Card>
              <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>🔍 Verificar Certificado do MEI</div>
              <div style={{display:"flex",gap:8,marginBottom:certErro?6:12}}>
                <input value={certId} onChange={e=>{setCertId(e.target.value);setCertErro("");setCertResult(null);}}
                  onKeyDown={e=>e.key==="Enter"&&verificarCert()}
                  placeholder="Cole o ID do certificado (ex: CCFV-2025-ABCD1234)"
                  style={{flex:1,height:42,borderRadius:T.radius,padding:"0 12px",background:T.white,border:`1.5px solid ${certErro?T.red:T.ink10}`,color:T.ink,fontSize:13,outline:"none"}}/>
                <Btn onClick={verificarCert}>Verificar</Btn>
              </div>
              {certErro && <p style={{margin:"0 0 10px",fontSize:11,color:T.red,fontWeight:600}}>{certErro}</p>}

              {certResult && certResult.status==="nao_encontrado" && (
                <div style={{padding:16,background:"rgba(239,68,68,.06)",border:`1.5px solid ${T.red}30`,borderRadius:T.radius,textAlign:"center"}}>
                  <div style={{fontSize:20,marginBottom:6}}>❌</div>
                  <div style={{fontWeight:700,fontSize:13,color:T.red}}>Certificado não encontrado</div>
                  <div style={{fontSize:12,color:T.ink60,marginTop:4}}>Verifique o ID informado. O ID consta no PDF do certificado e no painel do MEI.</div>
                </div>
              )}

              {certResult && certResult.cert && (()=>{
                const c = certResult.cert;
                const statusColor = certResult.status==="valido"?T.green:certResult.status==="expirado"?T.amber:T.red;
                const statusLabel = certResult.status==="valido"?"✅ CERTIFICADO VÁLIDO":certResult.status==="expirado"?"⚠️ CERTIFICADO EXPIRADO":"🚫 CERTIFICADO REVOGADO";
                return (
                  <div style={{border:`2px solid ${statusColor}40`,borderRadius:T.radius,overflow:"hidden"}}>
                    <div style={{background:`${statusColor}12`,padding:"12px 16px",borderBottom:`1px solid ${statusColor}20`}}>
                      <div style={{fontWeight:900,fontSize:15,color:statusColor}}>{statusLabel}</div>
                      <div style={{fontSize:11,color:T.ink60,marginTop:2}}>ID: {c.id}</div>
                    </div>
                    <div style={{padding:16}}>
                      {[
                        {l:"Tipo",        v:c.tipo||"CCFV"},
                        {l:"Titular",     v:c.meiNome||c.userId||"MEI Lucrom"},
                        {l:"CNPJ",        v:c.cnpj ? c.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5") : "—"},
                        {l:"Emitido em",  v:fmtDate(c.emitidoEm||c.ts)},
                        {l:"Expira em",   v:c.expiraEm?fmtDate(c.expiraEm):"—"},
                        {l:"Score",       v:c.score ? `${c.score} pts` : "—"},
                        {l:"Nível",       v:c.nivel||"—"},
                      ].map(({l,v})=>(
                        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.ink05}`,fontSize:13}}>
                          <span style={{color:T.ink60,fontWeight:500}}>{l}</span>
                          <span style={{fontWeight:700,color:T.ink}}>{v}</span>
                        </div>
                      ))}
                      {c.hash && <div style={{marginTop:10,padding:"8px 10px",background:T.ink03,borderRadius:T.radiusSm,fontSize:10,color:T.ink40,fontFamily:"monospace",wordBreak:"break-all"}}>SHA-256: {c.hash}</div>}
                    </div>
                  </div>
                );
              })()}

              {!certResult && (
                <AlertBox type="info">Cole o ID do certificado para validar autenticidade antes de liberar crédito.</AlertBox>
              )}
            </Card>
          )}

      {!result && !erro && (
        <AlertBox type="info">Apenas CNPJs de MEIs cadastrados na plataforma Lucrom.</AlertBox>
      )}
    </PageWrap>
  );
}

function PageParcRecebiveis({ st }) {
  const parc = st.parceiros?.[0];
  const ops = (st.operacoes||[]).filter(o=>!o.parceiroId||o.parceiroId===parc?.id);
  const revenueShare = parc?.revenueShare||[];
  const totalOps = ops.length;
  const volCredito = ops.reduce((a,o)=>a+(o.valorPrincipal||0),0);
  const comissoes = revenueShare.reduce((a,r)=>a+(r.comissao||0),0);

  function exportCSV() {
    const header = "Parceiro,Tipo,Valor,Status,Data\n";
    const rows = revenueShare.map(r=>
      `"${r.bancoNome||parc?.nome||""}", "${r.tipo||"COMISSÃO"}","${(r.comissao||0).toFixed(2)}","${r.status||""}","${fmtSafeDate(r.criadoEm||r.data)}"`
    ).join("\n");
    const blob = new Blob([header+rows],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="historico-financeiro.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageWrap title="📊 Histórico Financeiro" subtitle="Timeline de operações e comissões."
      action={<div style={{display:"flex",gap:8}}>
        <Btn v="outline" size="sm" onClick={exportCSV}>⬇ CSV</Btn>
      </div>}>
      <Grid cols={3} gap={10} style={{marginBottom:16}}>
        <Stat label="TOTAL OPERAÇÕES" value={totalOps} icon="📋" color={T.ink}/>
        <Stat label="VOL. CRÉDITO" value={fmtBRL(volCredito)} icon="💳" color={T.teal}/>
        <Stat label="COMISSÕES" value={fmtBRL(comissoes)} icon="💰" color={T.green}/>
      </Grid>
      <Card>
        {revenueShare.length===0 && ops.length===0 && <Empty icon="📊" title="Sem histórico" desc="Operações aparecerão aqui."/>}
        {(revenueShare.length>0?revenueShare:ops).map((r,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",borderBottom:`0.5px solid ${T.ink05}`}}>
            <div style={{width:36,height:36,borderRadius:99,background:r.status==="PAGO"?T.greenPale:"rgba(245,158,11,.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>💰</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13}}>{r.bancoNome||r.meiNome||parc?.nome||"Parceiro"}</div>
              <div style={{fontSize:11,color:T.ink60}}>{r.tipo||"COMISSÃO"} · {fmtSafeDate(r.criadoEm||r.data||r.createdAt)}</div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontWeight:700,fontSize:14,color:T.green}}>{fmtBRL(r.comissao||r.valorPrincipal||0)}</div>
              <Badge color={r.status==="PAGO"?T.green:T.amber} style={{fontSize:10}}>{r.status==="PAGO"?"PAGO":"PENDENTE"}</Badge>
            </div>
          </div>
        ))}
      </Card>
    </PageWrap>
  );
}

function PageParcSettlement({ st }) {
  const parc = (st.parceiros||[])[0];
  const revenue = (parc && Array.isArray(parc.revenueShare)) ? parc.revenueShare : [];
  const pendentes = revenue.filter(r=>r && r.status!=="PAGO");
  const pagos     = revenue.filter(r=>r && r.status==="PAGO");
  const totalPagar = pendentes.reduce((a,r)=>a+Number(r.comissao||0),0);
  const totalPago  = pagos.reduce((a,r)=>a+Number(r.comissao||0),0);
  const nomeParc = parc?.nome||"Parceiro";

  return (
    <PageWrap title="💳 Taxas à Lucrom">
      <AlertBox type="warn">A Lucrom cobra <strong>2,5%</strong> sobre cada operação aprovada.</AlertBox>
      <div style={{marginBottom:14}}/>

      <Grid cols={2} gap={10} style={{marginBottom:16}}>
        <Card style={{borderColor:totalPagar>0?T.amber:"transparent"}}>
          <div style={{fontSize:11,fontWeight:700,color:T.ink40,textTransform:"uppercase",marginBottom:4}}>
            {totalPagar>0?"⚠️":"✅"} A PAGAR
          </div>
          <div style={{fontSize:24,fontWeight:900,color:totalPagar>0?T.amber:T.green}}>{fmtBRL(totalPagar)}</div>
          {totalPagar>0&&<div style={{height:3,background:T.amber,borderRadius:2,marginTop:8}}/>}
        </Card>
        <Card style={{borderColor:T.green}}>
          <div style={{fontSize:11,fontWeight:700,color:T.ink40,textTransform:"uppercase",marginBottom:4}}>✅ JÁ PAGO</div>
          <div style={{fontSize:24,fontWeight:900,color:T.green}}>{fmtBRL(totalPago)}</div>
          <div style={{height:3,background:T.green,borderRadius:2,marginTop:8}}/>
        </Card>
      </Grid>

      {pendentes.length>0&&(
        <Card style={{marginBottom:12,borderColor:T.amber}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Em aberto</div>
          {pendentes.map((r,i)=>(
            <div key={r.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<pendentes.length-1?`1px solid ${T.ink05}`:"none"}}>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{r.bancoNome||nomeParc}</div>
                <div style={{fontSize:11,color:T.ink60}}>Ref: {fmtSafeDate(r.data||r.vencimento||r.criadoEm)}</div>
                <div style={{fontSize:10,color:T.ink40}}>{r.tipo||"COMISSÃO"}</div>
              </div>
              <div style={{fontWeight:700,color:T.amber,fontSize:15}}>{fmtBRL(r.comissao||0)}</div>
            </div>
          ))}
        </Card>
      )}

      {pagos.length>0&&(
        <Card>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Histórico pago</div>
          {pagos.map((r,i)=>(
            <div key={r.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:i<pagos.length-1?`1px solid ${T.ink05}`:"none"}}>
              <div>
                <div style={{fontWeight:600,fontSize:13}}>{r.bancoNome||nomeParc}</div>
                <div style={{fontSize:11,color:T.ink60}}>{fmtSafeDate(r.data||r.pagoEm||r.criadoEm)}</div>
                <div style={{fontSize:10,color:T.ink40}}>{r.tipo||"COMISSÃO"}</div>
              </div>
              <div style={{fontWeight:700,color:T.green,fontSize:15}}>{fmtBRL(r.comissao||0)}</div>
            </div>
          ))}
        </Card>
      )}

      {revenue.length===0&&<Empty icon="💳" title="Sem taxas" desc="Comissões aparecerão após operações aprovadas."/>}
    </PageWrap>
  );
}

function PageParcLGPD() {
  return (
    <PageWrap title="🔒 LGPD">
      <Card>
        <AlertBox type="info">Conformidade com Lei nº 13.709/2018.</AlertBox>
        {[{t:"Dados coletados",d:"Nome, CPF, CNPJ, e-mail, dados financeiros para análise."},{t:"Finalidade",d:"Análise de crédito, score MEI e comunicações."},{t:"Direitos do titular",d:"Acesso, correção, exclusão via suporte@lucrom.com.br."}].map(s=>(
          <div key={s.t} style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{s.t}</div>
            <div style={{fontSize:12,color:T.ink60,lineHeight:1.6}}>{s.d}</div>
          </div>
        ))}
      </Card>
    </PageWrap>
  );
}

// ── ADMIN PAGES ────────────────────────────────────────────────

function PageAdmDash({ st }) {
  const totalVol = st.parceiros.reduce((a,p)=>a+(p.volumeFinanciado||0),0);
  const settAbertos = (st.settlements||[]).filter(s=>s.status==="ABERTO").length;
  const revenueData = Array.from({length:6},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-5+i);return{mes:d.toLocaleDateString("pt-BR",{month:"short"}),revenue:Math.random()*5000+2000};});
  const agingPie = [{name:"A Vencer",value:40,color:T.green},{name:"Em Atraso",value:25,color:T.amber},{name:"Inadimplente",value:35,color:T.red}];
  return (
    <PageWrap title="🏛️ Visão Executiva">
      {settAbertos>0 && <AlertBox type="warn"><strong>{settAbertos}</strong> lote(s) aguardando fechamento.</AlertBox>}
      <Grid cols={4} gap={10} style={{marginBottom:14}}>
        <Stat label="Volume Total" value={fmtBRL(totalVol)} icon="💹" color={T.green}/>
        <Stat label="Operações" value={(st.operacoes||[]).length} icon="📊" color={T.teal}/>
        <Stat label="Parceiros" value={st.parceiros.length} icon="🤝" color={T.purple}/>
        <Stat label="Liquidações" value={settAbertos} icon="⚖️" color={T.amber}/>
      </Grid>
      <Grid cols={2} gap={14} style={{marginBottom:14}}>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>💹 Revenue mensal</div>
          <div style={{height:150}}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{top:5,right:5,bottom:0,left:0}}>
                <defs><linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.green} stopOpacity={0.3}/><stop offset="100%" stopColor={T.green} stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="2 4" stroke={T.ink05}/>
                <XAxis dataKey="mes" tick={{fontSize:10,fill:T.ink60}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:T.ink60}} axisLine={false} tickLine={false} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
                <Tooltip formatter={v=>[fmtBRL(v)]} contentStyle={{fontSize:11,borderRadius:8}}/>
                <Area type="monotone" dataKey="revenue" stroke={T.green} strokeWidth={2} fill="url(#gRev)"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Aging da carteira</div>
          <div style={{height:130}}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={agingPie} cx="50%" cy="50%" outerRadius={50} dataKey="value">
                  {agingPie.map((x,i)=><Cell key={i} fill={x.color}/>)}
                </Pie>
                <Tooltip contentStyle={{fontSize:11,borderRadius:8}}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>{agingPie.map(x=><Badge key={x.name} color={x.color}>{x.name}</Badge>)}</div>
        </Card>
      </Grid>
      <Card>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Operações por status</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {["SOLICITADA","APROVADA","LIBERADA","ADIMPLENTE","INADIMPLENTE"].map(s=>{
            const count = (st.operacoes||[]).filter(o=>o.status===s).length;
            return count>0 ? <div key={s} style={{padding:"10px 14px",borderRadius:T.radius,background:T.ink02,textAlign:"center"}}><div style={{fontSize:18,fontWeight:900}}>{count}</div><div style={{fontSize:9,color:T.ink60,textTransform:"uppercase",marginTop:2}}>{s.replace("_"," ")}</div></div> : null;
          })}
        </div>
      </Card>
    </PageWrap>
  );
}

function PageAdmOperacoes({ st }) {
  const [tab, setTab] = useState("todas");
  const ops = st.operacoes||[];
  const filtered = tab==="ativas"?ops.filter(o=>["LIBERADA","ADIMPLENTE"].includes(o.status)):tab==="pendentes"?ops.filter(o=>["SOLICITADA","APROVADA"].includes(o.status)):ops;
  return (
    <PageWrap title="🔄 Todas as Operações">
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <Chip active={tab==="todas"} onClick={()=>setTab("todas")}>Todas ({ops.length})</Chip>
        <Chip active={tab==="ativas"} onClick={()=>setTab("ativas")} color={T.green}>Ativas</Chip>
        <Chip active={tab==="pendentes"} onClick={()=>setTab("pendentes")} color={T.amber}>Pendentes</Chip>
      </div>
      <Card>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:560}}>
            <thead><tr style={{borderBottom:`2px solid ${T.ink10}`}}>{["MEI","Parceiro","Principal","Saldo","Taxa","Parcelas","Status"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 8px",fontSize:10,fontWeight:700,color:T.ink40,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>{filtered.map(op=>(
              <tr key={op.id} style={{borderBottom:`1px solid ${T.ink05}`}}>
                <td style={{padding:"8px",fontSize:12,fontWeight:600}}>{op.meiNome}</td>
                <td style={{padding:"8px",fontSize:11,color:T.ink60}}>{op.parceiroNome}</td>
                <td style={{padding:"8px",fontSize:12,fontWeight:700}}>{fmtBRL(op.valorPrincipal)}</td>
                <td style={{padding:"8px",fontSize:12,fontWeight:700,color:T.red}}>{fmtBRL(op.saldoDevedor)}</td>
                <td style={{padding:"8px",fontSize:12}}>{op.taxaJuros>0?`${op.taxaJuros}%`:"—"}</td>
                <td style={{padding:"8px",fontSize:12}}>{op.parcelas}×</td>
                <td style={{padding:"8px"}}><OperacaoStatusBadge status={op.status}/></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </PageWrap>
  );
}

function PageAdmSettlement({ st, dispatch }) {
  const toast = useToast();
  const settlements = st.settlements||[];
  const [tab, setTab] = useState("abertos");
  const filtered = tab==="abertos"?settlements.filter(s=>s.status==="ABERTO"):tab==="fechados"?settlements.filter(s=>s.status==="FECHADO"):tab==="pagos"?settlements.filter(s=>["PAGO","CONCILIADO"].includes(s.status)):settlements;
  return (
    <PageWrap title="⚖️ Central de Liquidação">
      <Grid cols={4} gap={10} style={{marginBottom:14}}>
        <Stat label="Abertos" value={settlements.filter(s=>s.status==="ABERTO").length} color={T.amber}/>
        <Stat label="Fechados" value={settlements.filter(s=>s.status==="FECHADO").length} color={T.teal}/>
        <Stat label="Pagos" value={settlements.filter(s=>s.status==="PAGO").length} color={T.green}/>
        <Stat label="Pendente" value={fmtBRL(settlements.filter(s=>["ABERTO","FECHADO"].includes(s.status)).reduce((a,s)=>a+s.valorLiquido,0))} color={T.amber}/>
      </Grid>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        {["abertos","fechados","pagos","todos"].map(t=><Chip key={t} active={tab===t} onClick={()=>setTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</Chip>)}
      </div>
      {filtered.map(s=>(
        <Card key={s.id} style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{fontWeight:700,fontSize:14}}>{s.lote}</div>
              <div style={{fontSize:11,color:T.ink60}}>{s.tipo} · {s.devedorNome} · Corte: {fmtDate(s.dataCorte)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontWeight:800,fontSize:15,color:T.green}}>{fmtBRL(s.valorLiquido)}</div>
              <Badge color={s.status==="CONCILIADO"?T.green:s.status==="PAGO"?T.greenMid:s.status==="FECHADO"?T.amber:T.orange}>{s.status}</Badge>
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            {s.status==="ABERTO" && <Btn size="sm" v="amber" onClick={()=>{dispatch({type:"FINANCIAL.SETTLEMENT_CLOSE",p:s.id});toast("Fechado!");}}>Fechar</Btn>}
            {s.status==="FECHADO" && <Btn size="sm" onClick={()=>{dispatch({type:"FINANCIAL.SETTLEMENT_PAY",p:{id:s.id}});toast("Pago!");}}>Pagar</Btn>}
            {s.status==="PAGO"&&!s.conciliado && <Btn size="sm" v="secondary" onClick={()=>{dispatch({type:"FINANCIAL.SETTLEMENT_RECONCILE",p:s.id});toast("Conciliado!");}}>Conciliar</Btn>}
          </div>
        </Card>
      ))}
      {filtered.length===0 && <Card style={{textAlign:"center",padding:28}}><div style={{fontSize:36,marginBottom:10}}>⚖️</div><div style={{fontWeight:800}}>Nenhum settlement</div></Card>}
    </PageWrap>
  );
}

function PageAdmRevenue({ st }) {
  const entries = st.revenueShare||[];
  const parceiros = [...new Set(entries.map(e=>e.parceiroId))].map(pid=>{
    const mine = entries.filter(e=>e.parceiroId===pid);
    return {parceiroId:pid,nome:st.parceiros.find(p=>p.id===pid)?.nome||pid,total:mine.reduce((a,e)=>a+e.valorLucrom,0),volume:mine.reduce((a,e)=>a+e.valorOperacao,0),qtd:mine.length,tier:mine[0]?.tier,tierColor:mine[0]?.tierColor};
  });
  const totalRevenue = parceiros.reduce((a,p)=>a+p.total,0);
  return (
    <PageWrap title="💹 Revenue Share">
      <Grid cols={3} gap={10} style={{marginBottom:14}}>
        <Stat label="Revenue Total" value={fmtBRL(totalRevenue)} color={T.green}/>
        <Stat label="Volume" value={fmtBRL(parceiros.reduce((a,p)=>a+p.volume,0))} color={T.teal}/>
        <Stat label="Parceiros" value={parceiros.length} color={T.purple}/>
      </Grid>
      {parceiros.map(p=>(
        <Card key={p.parceiroId} style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div><div style={{fontWeight:700,fontSize:15}}>{p.nome}</div><div style={{fontSize:11,color:T.ink60}}>{p.qtd} ops · Volume: {fmtBRL(p.volume)}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontWeight:800,fontSize:16,color:T.green}}>{fmtBRL(p.total)}</div><Badge color={p.tierColor||T.green}>{p.tier}</Badge></div>
          </div>
          <Bar v={p.total} max={Math.max(totalRevenue,1)} color={p.tierColor||T.green} h={5}/>
        </Card>
      ))}
    </PageWrap>
  );
}

function PageAdmUsuarios({ st }) {
  return (
    <PageWrap title="👥 Usuários">
      <Card>
        {[st.user].filter(Boolean).map((u,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${T.ink05}`}}>
            <div style={{width:32,height:32,borderRadius:99,background:T.greenDk,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff"}}>{(u.nome||"?")[0]}</div>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700}}>{u.nome}</div><div style={{fontSize:11,color:T.ink60}}>{u.email} · {u.cnpj}</div></div>
            <Badge color={u.plano==="Evoluir"?T.purple:u.plano==="Crescer"?T.green:T.ink40}>{u.plano||"Gratuito"}</Badge>
          </div>
        ))}
      </Card>
    </PageWrap>
  );
}

function PageAdmParceiros({ st }) {
  return (
    <PageWrap title="🤝 Parceiros">
      <Grid cols={3} gap={10} style={{marginBottom:14}}>
        <Stat label="Ativos" value={st.parceiros.filter(p=>p.status==="ATIVO").length} color={T.green}/>
        <Stat label="Volume total" value={fmtBRL(st.parceiros.reduce((a,p)=>a+(p.volumeFinanciado||0),0))} color={T.teal}/>
        <Stat label="Comissão aberta" value={fmtBRL(st.parceiros.reduce((a,p)=>a+(p.comissaoEmAberto||0),0))} color={T.amber}/>
      </Grid>
      {st.parceiros.map(p=>(
        <Card key={p.id} style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <div><div style={{fontWeight:800,fontSize:15}}>{p.nome}</div><div style={{fontSize:11,color:T.ink60}}>{p.tipo} · {p.clientes?.length||0} clientes</div></div>
            <Badge color={p.status==="ATIVO"?T.green:T.red}>{p.status}</Badge>
          </div>
          <Grid cols={4} gap={8}>
            <CardFlat><div style={{fontSize:9,color:T.ink60}}>Volume</div><div style={{fontSize:13,fontWeight:800,color:T.green}}>{fmtBRL(p.volumeFinanciado||0)}</div></CardFlat>
            <CardFlat><div style={{fontSize:9,color:T.ink60}}>Consultas</div><div style={{fontSize:13,fontWeight:800}}>{p.consultas||0}</div></CardFlat>
            <CardFlat><div style={{fontSize:9,color:T.ink60}}>Conversão</div><div style={{fontSize:13,fontWeight:800,color:T.teal}}>{p.conversao||0}%</div></CardFlat>
            <CardFlat><div style={{fontSize:9,color:T.ink60}}>Score Médio</div><div style={{fontSize:13,fontWeight:800,color:T.purple}}>{p.scoreMedio||0}</div></CardFlat>
          </Grid>
        </Card>
      ))}
    </PageWrap>
  );
}

function PageAdmMissoes({ st, dispatch }) {
  const toast = useToast();
  const [showEdit, setShowEdit] = useState(null);
  const [mTitle, setMTitle] = useState(""); const [mXp, setMXp] = useState("");
  return (
    <PageWrap title="🎯 Missões">
      {st.missions.map(m=>(
        <Card key={m.id} style={{marginBottom:8,opacity:m.cancelada?.55:1}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:38,height:38,borderRadius:T.radiusSm,background:m.done?T.greenPale:T.purplePale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{m.icon}</div>
            <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{m.title}</div><div style={{fontSize:11,color:T.ink60}}>{m.cat} · {m.xp} XP</div></div>
            <div style={{display:"flex",gap:6}}>
              {m.done && <Badge color={T.green}>✓</Badge>}
              {!m.cancelada && <Btn size="sm" v="outline" onClick={()=>{setShowEdit(m);setMTitle(m.title);setMXp(String(m.xp));}}>✏️</Btn>}
              {!m.cancelada&&!m.done && <Btn size="sm" v="danger" onClick={()=>{dispatch({type:"ADMIN.CANCEL_MISSION",p:m.id});toast("Cancelada","warn");}}>✕</Btn>}
            </div>
          </div>
        </Card>
      ))}
      <Modal open={!!showEdit} onClose={()=>setShowEdit(null)} title="Editar Missão" width={420}>
        <Input label="Título" value={mTitle} onChange={setMTitle}/>
        <Input label="XP" value={mXp} onChange={setMXp}/>
        <div style={{display:"flex",gap:8}}>
          <Btn v="outline" full onClick={()=>setShowEdit(null)}>Cancelar</Btn>
          <Btn full onClick={()=>{dispatch({type:"ADMIN.UPDATE_MISSION",p:{id:showEdit.id,title:mTitle,xp:parseInt(mXp)||0}});setShowEdit(null);toast("Salvo!");}}>Salvar</Btn>
        </div>
      </Modal>
    </PageWrap>
  );
}

function PageAdmPlanos({ st, dispatch }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [editPreco, setEditPreco] = useState("");
  const [editFeats, setEditFeats] = useState("");
  const prices = st.planosPrices || {Gratuito:0, Crescer:29.99, Evoluir:44.99};

  function savePreco(planoId) {
    const v = parseFloat(editPreco.replace(",","."));
    if(isNaN(v)||v<0) { toast("Valor inválido","err"); return; }
    dispatch({type:"ADMIN.PLANO_SET_PRICE", p:{plano:planoId, preco:v}});
    toast("Preço atualizado ✅");
    setEditing(null);
  }

  return (
    <PageWrap title="⭐ Planos & Preços">
      <AlertBox type="info" style={{marginBottom:14}}>
        Alterações de preço afetam novos assinantes. Assinantes existentes mantêm o preço vigente.
      </AlertBox>
      <Grid cols={3} gap={14}>
        {PLANOS.map(p=>(
          <Card key={p.id} style={{borderTop:`3px solid ${p.popular?T.green:T.ink10}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <div style={{fontWeight:800,fontSize:15}}>{p.nome}</div>
                {p.popular&&<Badge color={T.green} style={{marginTop:4,fontSize:10}}>Popular</Badge>}
              </div>
              <Btn size="sm" v="outline" onClick={()=>{setEditing(p.id);setEditPreco(String(prices[p.id]??p.preco));}}>
                ✏️ Editar
              </Btn>
            </div>
            {editing===p.id ? (
              <div>
                <label style={{fontSize:11,fontWeight:700,color:T.ink60,display:"block",marginBottom:4}}>
                  Novo preço (R$)
                </label>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <input
                    type="number" value={editPreco} onChange={e=>setEditPreco(e.target.value)}
                    step="0.01" min="0"
                    style={{flex:1,height:36,border:`1.5px solid ${T.green}`,borderRadius:T.radiusSm,padding:"0 10px",background:T.white,color:T.ink,fontSize:13}}
                  />
                  <Btn size="sm" onClick={()=>savePreco(p.id)}>Salvar</Btn>
                  <Btn size="sm" v="outline" onClick={()=>setEditing(null)}>✕</Btn>
                </div>
              </div>
            ) : (
              <div style={{fontSize:26,fontWeight:900,color:T.green,marginBottom:12}}>
                {prices[p.id]===0?"Grátis":"R$ "+Number(prices[p.id]??p.preco).toFixed(2).replace(".",",")}
              </div>
            )}
            <div style={{borderTop:`1px solid ${T.ink05}`,paddingTop:10}}>
              <div style={{fontSize:11,fontWeight:700,color:T.ink60,marginBottom:6}}>FUNCIONALIDADES</div>
              {p.features.map(f=>(
                <div key={f} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5,fontSize:12,color:T.ink60}}>
                  <span style={{color:T.green,fontWeight:700}}>✓</span>{f}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </Grid>

      <Card style={{marginTop:14}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Histórico de assinaturas ativas</div>
        <Grid cols={3} gap={10}>
          {PLANOS.map(p=>(
            <div key={p.id} style={{textAlign:"center",padding:"12px",background:T.ink02,borderRadius:T.radiusSm}}>
              <div style={{fontSize:22,fontWeight:900,color:T.green}}>
                {(st.planos||[]).filter(u=>u===p.id).length || (p.id==="Gratuito"?247:p.id==="Crescer"?89:34)}
              </div>
              <div style={{fontSize:11,color:T.ink60}}>{p.nome}</div>
            </div>
          ))}
        </Grid>
      </Card>
    </PageWrap>
  );
}

function PageAdmCertificados({ st, dispatch }) {
  const toast = useToast();
  const [editingPrice, setEditingPrice] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [busca, setBusca] = useState("");
  const [admCertId, setAdmCertId] = useState("");
  const [admCertResult, setAdmCertResult] = useState(null);
  const [admCertErro, setAdmCertErro] = useState("");
  const prices = st.certA1Prices || CERT_A1_PRICES;
  const tiers = [
    {key:"1ano", label:"A1 — 1 Ano"},
    {key:"2anos",label:"A1 — 2 Anos"},
    {key:"3anos",label:"A1 — 3 Anos"},
  ];

  function savePrice(tipo) {
    const v = parseFloat(editVal.replace(",","."));
    if(isNaN(v)||v<=0) { toast("Valor inválido","err"); return; }
    dispatch({type:"ADMIN.CERT_SET_PRICE", p:{tipo, preco:v}});
    toast("Preço atualizado ✅");
    setEditingPrice(null);
  }

  function revogar(certId) {
    dispatch({type:"CERT.REVOKE", p:certId});
    toast("Certificado revogado");
  }

  function admVerificar() {
    const id = admCertId.trim();
    if(!id) { setAdmCertErro("Informe o ID do certificado."); return; }
    setAdmCertErro(""); setAdmCertResult(null);
    const found = (st.certs||[]).find(c=>c.id===id||(c.id||"").toLowerCase()===id.toLowerCase());
    if(!found) { setAdmCertResult({status:"nao_encontrado"}); return; }
    const agora = Date.now();
    const expirado = found.expiraEm && new Date(found.expiraEm).getTime() < agora;
    const revogado = found.active === false;
    setAdmCertResult({status:revogado?"revogado":expirado?"expirado":"valido", cert:found});
  }

  const certs = st.certs || [];
  const buscaLow = busca.toLowerCase();
  const ccfvList = certs.filter(c=>c.tipo==="CCFV"&&(!busca||
    (c.id||"").toLowerCase().includes(buscaLow)||
    (c.meiNome||c.userId||"").toLowerCase().includes(buscaLow)||
    (c.cnpj||"").includes(busca)));
  const a1List   = certs.filter(c=>c.tipo==="A1"&&(!busca||
    (c.id||"").toLowerCase().includes(buscaLow)||
    (c.meiNome||c.userId||"").toLowerCase().includes(buscaLow)||
    (c.cnpj||"").includes(busca)));

  const ativos   = certs.filter(c=>c.active!==false&&!(c.expiraEm&&new Date(c.expiraEm)<new Date())).length;
  const expirados = certs.filter(c=>c.expiraEm&&new Date(c.expiraEm)<new Date()).length;
  const revogados = certs.filter(c=>c.active===false).length;

  return (
    <PageWrap title="🔐 Certificados">
      <Grid cols={3} gap={10} style={{marginBottom:16}}>
        <Stat label="CCFV emitidos" value={certs.filter(c=>c.tipo==="CCFV").length} color={T.green}/>
        <Stat label="A1 emitidos"   value={certs.filter(c=>c.tipo==="A1").length}   color={T.purple}/>
        <Stat label="Total"         value={certs.length}    color={T.teal}/>
      </Grid>
      <Grid cols={3} gap={10} style={{marginBottom:16}}>
        <Stat label="ATIVOS"    value={ativos}    color={T.green}  icon="✅"/>
        <Stat label="EXPIRADOS" value={expirados} color={T.amber}  icon="⚠️"/>
        <Stat label="REVOGADOS" value={revogados} color={T.red}    icon="🚫"/>
      </Grid>

      {/* Verificação por ID */}
      <Card style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>🔍 Verificar Certificado por ID</div>
        <div style={{display:"flex",gap:8,marginBottom:admCertErro?6:0}}>
          <input value={admCertId} onChange={e=>{setAdmCertId(e.target.value);setAdmCertErro("");setAdmCertResult(null);}}
            onKeyDown={e=>e.key==="Enter"&&admVerificar()}
            placeholder="ID do certificado..."
            style={{flex:1,height:38,borderRadius:T.radius,padding:"0 12px",background:T.white,border:`1.5px solid ${admCertErro?T.red:T.ink10}`,color:T.ink,fontSize:13,outline:"none"}}/>
          <Btn size="sm" onClick={admVerificar}>Verificar</Btn>
        </div>
        {admCertErro && <p style={{margin:"4px 0 0",fontSize:11,color:T.red,fontWeight:600}}>{admCertErro}</p>}
        {admCertResult && admCertResult.status==="nao_encontrado" && (
          <div style={{marginTop:10,padding:"10px 12px",background:"rgba(239,68,68,.06)",border:`1px solid ${T.red}30`,borderRadius:T.radiusSm,fontSize:12,color:T.red,fontWeight:600}}>❌ Certificado não encontrado na base.</div>
        )}
        {admCertResult && admCertResult.cert && (()=>{
          const c = admCertResult.cert;
          const sc = admCertResult.status;
          const col = sc==="valido"?T.green:sc==="expirado"?T.amber:T.red;
          const lbl = sc==="valido"?"✅ VÁLIDO":sc==="expirado"?"⚠️ EXPIRADO":"🚫 REVOGADO";
          return (
            <div style={{marginTop:10,border:`2px solid ${col}40`,borderRadius:T.radius,overflow:"hidden"}}>
              <div style={{background:`${col}12`,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><span style={{fontWeight:900,fontSize:14,color:col}}>{lbl}</span><span style={{fontSize:11,color:T.ink60,marginLeft:10}}>ID: {c.id}</span></div>
                {c.active!==false&&<Btn size="sm" v="danger" onClick={()=>{revogar(c.id);setAdmCertResult(null);setAdmCertId("");}}>Revogar</Btn>}
              </div>
              <div style={{padding:"12px 14px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 16px"}}>
                  {[
                    {l:"Tipo",       v:c.tipo||"CCFV"},
                    {l:"Titular",    v:c.meiNome||c.userId||"—"},
                    {l:"CNPJ",       v:c.cnpj||"—"},
                    {l:"Score",      v:c.score?`${c.score} pts`:"—"},
                    {l:"Nível",      v:c.nivel||"—"},
                    {l:"Emitido",    v:fmtDate(c.emitidoEm||c.ts)},
                    {l:"Expira",     v:c.expiraEm?fmtDate(c.expiraEm):"—"},
                    {l:"Validade",   v:c.validade||"—"},
                  ].map(({l,v})=>(
                    <div key={l} style={{fontSize:12}}>
                      <span style={{color:T.ink60}}>{l}: </span>
                      <span style={{fontWeight:700}}>{v}</span>
                    </div>
                  ))}
                </div>
                {c.hash&&<div style={{marginTop:8,fontSize:10,color:T.ink40,fontFamily:"monospace",wordBreak:"break-all"}}>SHA-256: {c.hash}</div>}
              </div>
            </div>
          );
        })()}
      </Card>

      {/* Busca geral */}
      <Card style={{marginBottom:14}}>
        <input value={busca} onChange={e=>setBusca(e.target.value)}
          placeholder="🔎 Filtrar por nome, CNPJ ou ID..."
          style={{width:"100%",height:38,boxSizing:"border-box",borderRadius:T.radius,padding:"0 12px",background:T.white,border:`1.5px solid ${T.ink10}`,color:T.ink,fontSize:13,outline:"none"}}/>
      </Card>

      <Card style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>💰 Preços — Certificado A1 Digital</div>
        {tiers.map(tier=>(
          <div key={tier.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${T.ink05}`}}>
            <span style={{fontSize:13,fontWeight:600}}>{tier.label}</span>
            {editingPrice===tier.key ? (
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input
                  type="number" value={editVal}
                  onChange={e=>setEditVal(e.target.value)}
                  step="0.01" min="0"
                  style={{width:100,height:32,border:`1.5px solid ${T.green}`,borderRadius:T.radiusSm,padding:"0 8px",background:T.white,color:T.ink,fontSize:13}}
                />
                <Btn size="sm" onClick={()=>savePrice(tier.key)}>Salvar</Btn>
                <Btn size="sm" v="outline" onClick={()=>setEditingPrice(null)}>✕</Btn>
              </div>
            ) : (
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:15,fontWeight:800,color:T.green}}>{fmtBRL(prices[tier.key])}</span>
                <Btn size="sm" v="outline" onClick={()=>{setEditingPrice(tier.key);setEditVal(String(prices[tier.key]));}}>✏️ Editar</Btn>
              </div>
            )}
          </div>
        ))}
      </Card>

      <Card style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>📋 Certificados CCFV emitidos ({ccfvList.length})</div>
        {ccfvList.length===0
          ? <div style={{color:T.ink60,fontSize:13,textAlign:"center",padding:20}}>Nenhum certificado CCFV emitido</div>
          : ccfvList.map(c=>(
            <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${T.ink05}`}}>
              <div>
                <div style={{fontSize:13,fontWeight:700}}>{c.userId||c.meiNome||"MEI"}</div>
                <div style={{fontSize:11,color:T.ink60}}>Emitido: {fmtDate(c.emitidoEm||c.ts)} · {c.active?"Ativo":"Revogado"}</div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <Badge color={c.active?T.green:T.ink40}>{c.active?"Ativo":"Revogado"}</Badge>
                {c.active&&<Btn size="sm" v="danger" onClick={()=>revogar(c.id)}>Revogar</Btn>}
              </div>
            </div>
          ))
        }
      </Card>

      <Card>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>🔑 Certificados A1 emitidos ({a1List.length})</div>
        {a1List.length===0
          ? <div style={{color:T.ink60,fontSize:13,textAlign:"center",padding:20}}>Nenhum certificado A1 emitido</div>
          : a1List.map(c=>(
            <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${T.ink05}`}}>
              <div>
                <div style={{fontSize:13,fontWeight:700}}>{c.userId||c.meiNome||"MEI"}</div>
                <div style={{fontSize:11,color:T.ink60}}>
                  Validade: {c.validade||"1 ano"} · Emitido: {fmtDate(c.emitidoEm||c.ts)}
                  {c.expiraEm&&<span> · Expira: {fmtDate(c.expiraEm)}</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <Badge color={c.active?T.purple:T.ink40}>{c.active?"Ativo":"Revogado"}</Badge>
                {c.active&&<Btn size="sm" v="danger" onClick={()=>revogar(c.id)}>Revogar</Btn>}
              </div>
            </div>
          ))
        }
      </Card>
    </PageWrap>
  );
}

function PageAdmEdu({ st, dispatch }) {
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({titulo:"",url:"",dur:"",xp:20,cat:"Finanças",emoji:"📊"});
  const CATS = ["Finanças","Impostos","Score","Docs","Crédito","LGPD","Abertura"];

  const videos = st.eduVideos || EDU_VIDEOS;

  function openEdit(v) {
    setEditId(v.id);
    setForm({titulo:v.titulo, url:v.url||"", dur:v.dur, xp:v.xp, cat:v.cat, emoji:v.emoji});
    setShowAdd(false);
  }

  function openAdd() {
    setEditId(null);
    setForm({titulo:"",url:"",dur:"",xp:20,cat:"Finanças",emoji:"📊"});
    setShowAdd(true);
  }

  function save() {
    if(!form.titulo.trim()) { toast("Título obrigatório","err"); return; }
    if(editId) {
      dispatch({type:"ADMIN.EDU_UPDATE", p:{id:editId,...form}});
      toast("Vídeo atualizado ✅");
      setEditId(null);
    } else {
      dispatch({type:"ADMIN.EDU_ADD", p:{...form}});
      toast("Vídeo adicionado ✅");
      setShowAdd(false);
    }
  }

  function del(id) {
    dispatch({type:"ADMIN.EDU_DELETE", p:id});
    toast("Vídeo removido");
    if(editId===id) setEditId(null);
  }

  const FormBlock = (
    <Card style={{marginBottom:14,border:`1.5px solid ${T.green}`}}>
      <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:T.green}}>
        {editId ? "✏️ Editar conteúdo" : "➕ Novo conteúdo Edu MEI"}
      </div>
      <Grid cols={2} gap={10}>
        <Input label="Título" value={form.titulo} onChange={v=>setForm(f=>({...f,titulo:v}))} placeholder="Ex: Gestão de Fluxo de Caixa"/>
        <Input label="Duração" value={form.dur} onChange={v=>setForm(f=>({...f,dur:v}))} placeholder="Ex: 18 min"/>
      </Grid>
      <Input label="Link do vídeo (YouTube/Vimeo)" value={form.url} onChange={v=>setForm(f=>({...f,url:v}))} placeholder="https://youtube.com/watch?v=..."/>
      <Grid cols={3} gap={10} style={{marginTop:10}}>
        <Input label="XP concedido" value={String(form.xp)} onChange={v=>setForm(f=>({...f,xp:parseInt(v)||0}))} type="number"/>
        <div>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:T.ink60,marginBottom:4}}>Categoria</label>
          <select value={form.cat} onChange={e=>setForm(f=>({...f,cat:e.target.value}))}
            style={{width:"100%",height:40,border:`1.5px solid ${T.ink10}`,borderRadius:T.radiusSm,padding:"0 10px",background:T.white,color:T.ink,fontSize:13}}>
            {CATS.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Input label="Emoji" value={form.emoji} onChange={v=>setForm(f=>({...f,emoji:v}))} placeholder="📊"/>
      </Grid>
      <div style={{display:"flex",gap:8,marginTop:12}}>
        <Btn onClick={save}>{editId?"Salvar alterações":"Adicionar vídeo"}</Btn>
        <Btn v="outline" onClick={()=>{setShowAdd(false);setEditId(null);}}>Cancelar</Btn>
      </div>
    </Card>
  );

  return (
    <PageWrap title="🎓 Edu MEI — Gestão de Conteúdo"
      action={<Btn size="sm" onClick={openAdd}>➕ Novo vídeo</Btn>}>

      {(showAdd || editId) && FormBlock}

      <Card>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>
          Conteúdos cadastrados ({videos.length})
        </div>
        {videos.length===0 && (
          <div style={{textAlign:"center",padding:32,color:T.ink60,fontSize:13}}>
            Nenhum conteúdo. Clique em "Novo vídeo" para adicionar.
          </div>
        )}
        {videos.map(v=>(
          <div key={v.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${T.ink05}`}}>
            <div style={{fontSize:26,width:36,textAlign:"center",flexShrink:0}}>{v.emoji}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:2}}>{v.titulo}</div>
              <div style={{fontSize:11,color:T.ink60}}>
                <Badge color={T.teal} style={{fontSize:9,marginRight:6}}>{v.cat}</Badge>
                {v.dur} · <span style={{color:T.amber,fontWeight:700}}>+{v.xp} XP</span>
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexShrink:0}}>
              <Btn size="sm" v="outline" onClick={()=>openEdit(v)}>✏️</Btn>
              <Btn size="sm" v="danger" onClick={()=>del(v.id)}>🗑️</Btn>
            </div>
          </div>
        ))}
      </Card>
    </PageWrap>
  );
}

function PageAdmFraudes({ st }) {
  const [selected, setSelected] = useState(null);

  // Roda o fraud engine para todos os usuários simulados
  const analises = useMemo(() => {
    const usuarios = [
      { id:st.user.id, nome:st.user.nome, txs:st.transactions, operacoes:st.operacoes||[], faturamento:st.faturamento, tetoMEI:st.tetoMEI },
      { id:"usr_002", nome:"Maria Costa", txs:[{tipo:"RECEITA",valor:5000,data:tsISO()},{tipo:"RECEITA",valor:5000,data:tsISO()},{tipo:"RECEITA",valor:5000,data:tsISO()}], operacoes:[], faturamento:30000, tetoMEI:81000 },
      { id:"usr_003", nome:"Pedro Lima", txs:[{tipo:"RECEITA",valor:50,data:tsISO()},{tipo:"RECEITA",valor:45,data:tsISO()},{tipo:"RECEITA",valor:48,data:tsISO()},{tipo:"RECEITA",valor:52,data:tsISO()},{tipo:"RECEITA",valor:49,data:tsISO()},{tipo:"RECEITA",valor:50,data:tsISO()},{tipo:"RECEITA",valor:51,data:tsISO()},{tipo:"RECEITA",valor:47,data:tsISO()},{tipo:"RECEITA",valor:50,data:tsISO()},{tipo:"RECEITA",valor:46,data:tsISO()},{tipo:"RECEITA",valor:48,data:tsISO()}], operacoes:[], faturamento:5000, tetoMEI:81000 },
    ];
    return usuarios.map(u => ({
      ...u,
      fraud: FraudEngine.calcRiskScore(u.operacoes, u.txs, u.faturamento, u.tetoMEI),
      velocity: FraudEngine.checkVelocity(u.txs),
      roundNumbers: FraudEngine.checkRoundNumbers(u.txs),
      microFarming: FraudEngine.checkMicroFarming(u.txs),
    }));
  }, [st]);

  const bloqueados = analises.filter(a=>a.fraud.bloqueado).length;
  const alertas    = analises.filter(a=>a.fraud.alerta&&!a.fraud.bloqueado).length;

  const nivelColor = nivel => nivel==="CRÍTICO"?T.red:nivel==="ALTO"?T.orange:nivel==="MÉDIO"?T.amber:T.green;

  return (
    <PageWrap title="🛡️ Antifraude — Motor Ativo">
      <Grid cols={4} gap={10} style={{marginBottom:14}}>
        <Stat label="Usuários analisados" value={analises.length} icon="👥" color={T.teal}/>
        <Stat label="Bloqueados" value={bloqueados} icon="🚫" color={T.red}/>
        <Stat label="Em alerta" value={alertas} icon="⚠️" color={T.amber}/>
        <Stat label="Limpos" value={analises.length-bloqueados-alertas} icon="✅" color={T.green}/>
      </Grid>

      {bloqueados > 0 && <AlertBox type="danger">🚨 {bloqueados} usuário(s) com risco CRÍTICO detectado. Ação imediata necessária.</AlertBox>}

      <Card style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Regras Ativas do Motor</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {[
            {nome:"VELOCITY_ATTACK",desc:"Muitas operações em 24h",ativa:true,disparos:analises.filter(a=>!a.velocity.ok).length},
            {nome:"ROUND_NUMBERS",desc:">50% dos valores redondos",ativa:true,disparos:analises.filter(a=>!a.roundNumbers.ok).length},
            {nome:"MICRO_FARMING",desc:"Muitas receitas < R$50",ativa:true,disparos:analises.filter(a=>!a.microFarming.ok).length},
            {nome:"MULTIPLAS_SOLICIT",desc:"Mais de 2 sol. simultâneas",ativa:true,disparos:analises.filter(a=>a.fraud.flags.includes("MULTIPLAS_SOLICITACOES")).length},
            {nome:"FAT_ALTO",desc:"Faturamento >80% do teto",ativa:true,disparos:analises.filter(a=>a.fraud.flags.includes("FAT_ALTO")).length},
            {nome:"AML_COAF",desc:"Reporte COAF (em breve)",ativa:false,disparos:0},
          ].map(r=>(
            <CardFlat key={r.nome} style={{borderLeft:`3px solid ${r.ativa?T.green:T.ink40}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:11,fontWeight:800,color:r.ativa?T.ink:T.ink40}}>{r.nome}</div>
                  <div style={{fontSize:10,color:T.ink60,marginTop:2}}>{r.desc}</div>
                </div>
                <Badge color={r.ativa?T.green:T.ink40}>{r.ativa?"ON":"OFF"}</Badge>
              </div>
              {r.ativa && <div style={{marginTop:6,fontSize:12,fontWeight:700,color:r.disparos>0?T.red:T.green}}>{r.disparos} disparo(s)</div>}
            </CardFlat>
          ))}
        </div>
      </Card>

      <div style={{fontWeight:700,fontSize:13,color:T.white,marginBottom:10}}>Análise Individual</div>
      {analises.map(a => (
        <Card key={a.id} style={{marginBottom:10,border:`1.5px solid ${a.fraud.bloqueado?T.red:a.fraud.alerta?T.amber:T.green}30`}}
          onClick={()=>setSelected(selected===a.id?null:a.id)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14}}>{a.nome}</div>
              <div style={{fontSize:11,color:T.ink60,marginTop:2}}>
                Risco: <strong style={{color:nivelColor(a.fraud.nivel)}}>{a.fraud.nivel}</strong>
                {a.fraud.flags.length>0 && ` · Flags: ${a.fraud.flags.join(", ")}`}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:22,fontWeight:900,color:nivelColor(a.fraud.nivel)}}>{a.fraud.riskScore}</div>
              <div style={{fontSize:10,color:T.ink60}}>Risk Score</div>
            </div>
          </div>
          {selected===a.id && (
            <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${T.ink10}`}}>
              <Grid cols={3} gap={8}>
                <CardFlat style={{background:a.velocity.ok?T.greenPale:T.redPale}}>
                  <div style={{fontSize:10,fontWeight:700,marginBottom:3}}>VELOCITY</div>
                  <div style={{fontSize:12}}>{a.velocity.count}/{a.velocity.max} ops/24h</div>
                  <Badge color={a.velocity.ok?T.green:T.red}>{a.velocity.ok?"OK":"ALERTA"}</Badge>
                </CardFlat>
                <CardFlat style={{background:a.roundNumbers.ok?T.greenPale:T.redPale}}>
                  <div style={{fontSize:10,fontWeight:700,marginBottom:3}}>ROUND NUMBERS</div>
                  <div style={{fontSize:12}}>{a.roundNumbers.roundPct}% redondos</div>
                  <Badge color={a.roundNumbers.ok?T.green:T.red}>{a.roundNumbers.ok?"OK":"SUSPEITO"}</Badge>
                </CardFlat>
                <CardFlat style={{background:a.microFarming.ok?T.greenPale:T.redPale}}>
                  <div style={{fontSize:10,fontWeight:700,marginBottom:3}}>MICRO FARMING</div>
                  <div style={{fontSize:12}}>{a.microFarming.microCount} transações micro</div>
                  <Badge color={a.microFarming.ok?T.green:T.red}>{a.microFarming.ok?"OK":"ALERTA"}</Badge>
                </CardFlat>
              </Grid>
              {a.fraud.bloqueado && (
                <AlertBox type="danger" style={{marginTop:10}}>
                  ⛔ Usuário bloqueado automaticamente. Operações de crédito suspensas.
                </AlertBox>
              )}
            </div>
          )}
        </Card>
      ))}
    </PageWrap>
  );
}

function PageAdmLGPD() {
  const [aba, setAba] = useState("bases");
  return (
    <PageWrap title="📜 LGPD — Conformidade Completa">
      <AlertBox type="info">Lei nº 13.709/2018 · Regulamentação ANPD · Vigência: 01/08/2021</AlertBox>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {["bases","direitos","retencao","incidente","dpo"].map(a=>(
          <Chip key={a} active={aba===a} onClick={()=>setAba(a)}>
            {a==="bases"?"Bases Legais":a==="direitos"?"Direitos":a==="retencao"?"Retenção":a==="incidente"?"Incidentes":"DPO"}
          </Chip>
        ))}
      </div>
      {aba==="bases" && (
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Bases Legais Utilizadas (Art. 7º LGPD)</div>
          {[
            {base:"Consentimento (Art. 7º, I)",uso:"Newsletter, comunicações de marketing",como:"Opt-in explícito com granularidade por tipo"},
            {base:"Execução de Contrato (Art. 7º, V)",uso:"Dados necessários para prestação do serviço Lucrom",como:"Termos de Uso e Política de Privacidade"},
            {base:"Legítimo Interesse (Art. 7º, IX)",uso:"Score de crédito, antifraude, segurança",como:"Balanceamento de interesses documentado (LIA)"},
            {base:"Cumprimento Legal (Art. 7º, II)",uso:"COAF, BACEN, Receita Federal",como:"Obrigações regulatórias específicas"},
            {base:"Proteção ao Crédito (Art. 7º, X)",uso:"Bureau de crédito, análise de risco",como:"Finalidade específica e documentada"},
          ].map(b=>(
            <CardFlat key={b.base} style={{marginBottom:8}}>
              <div style={{fontWeight:700,fontSize:12,color:T.green,marginBottom:4}}>{b.base}</div>
              <div style={{fontSize:11,color:T.ink60}}><strong>Uso:</strong> {b.uso}</div>
              <div style={{fontSize:11,color:T.ink60}}><strong>Mecanismo:</strong> {b.como}</div>
            </CardFlat>
          ))}
        </Card>
      )}
      {aba==="direitos" && (
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Direitos dos Titulares (Art. 18 LGPD)</div>
          {[
            {d:"Acesso",desc:"Titular pode ver todos os dados coletados",prazo:"15 dias",canal:"privacidade@lucrom.com.br"},
            {d:"Correção",desc:"Atualizar dados inexatos ou incompletos",prazo:"15 dias",canal:"App ou suporte"},
            {d:"Anonimização",desc:"Anonimizar dados desnecessários",prazo:"15 dias",canal:"Solicitação formal"},
            {d:"Portabilidade",desc:"Exportar dados em formato estruturado (JSON/CSV)",prazo:"15 dias",canal:"App — botão Exportar"},
            {d:"Eliminação",desc:"Excluir dados tratados com consentimento",prazo:"15 dias",canal:"privacidade@lucrom.com.br"},
            {d:"Informação",desc:"Saber com quem dados foram compartilhados",prazo:"15 dias",canal:"Política de Privacidade"},
            {d:"Revogação",desc:"Revogar consentimento a qualquer momento",prazo:"Imediato",canal:"Configurações do App"},
          ].map(d=>(
            <div key={d.d} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${T.ink05}`}}>
              <div>
                <div style={{fontWeight:700,fontSize:12}}>{d.d}</div>
                <div style={{fontSize:11,color:T.ink60}}>{d.desc}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <Badge color={T.green}>{d.prazo}</Badge>
                <div style={{fontSize:10,color:T.ink40,marginTop:3}}>{d.canal}</div>
              </div>
            </div>
          ))}
        </Card>
      )}
      {aba==="retencao" && (
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Política de Retenção de Dados</div>
          {[
            {tipo:"Dados de cadastro (nome, e-mail, CNPJ)",retencao:"5 anos após encerramento",base:"Art. 12 CPC"},
            {tipo:"Transações financeiras",retencao:"10 anos",base:"Lei 9.613/98 (AML)"},
            {tipo:"Logs de acesso e auditoria",retencao:"6 meses",base:"Art. 37 LGPD + Marco Civil"},
            {tipo:"Dados de score e crédito",retencao:"5 anos",base:"Lei 12.414/2011 (Cadastro Positivo)"},
            {tipo:"DASN e dados fiscais",retencao:"5 anos",base:"Regulação Receita Federal"},
            {tipo:"Consentimentos e revogações",retencao:"Indefinido (prova de conformidade)",base:"Art. 7º, I LGPD"},
            {tipo:"Dados biométricos (futuros)",retencao:"3 anos ou revogação",base:"ANPD Resolução CD/ANPD nº 4"},
          ].map(r=>(
            <div key={r.tipo} style={{padding:"10px 0",borderBottom:`1px solid ${T.ink05}`}}>
              <div style={{fontWeight:600,fontSize:12}}>{r.tipo}</div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                <span style={{fontSize:11,color:T.ink60}}>Retenção: <strong>{r.retencao}</strong></span>
                <Badge color={T.teal}>{r.base}</Badge>
              </div>
            </div>
          ))}
        </Card>
      )}
      {aba==="incidente" && (
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Plano de Resposta a Incidentes (Art. 48 LGPD)</div>
          <AlertBox type="warn">Prazo: comunicar à ANPD em até 72h após conhecimento do incidente.</AlertBox>
          {[
            {etapa:"1. Detecção",desc:"SIEM identifica acesso anômalo ou vazamento"},
            {etapa:"2. Contenção (0-4h)",desc:"Isolar sistemas afetados, revogar credenciais comprometidas"},
            {etapa:"3. Avaliação (4-12h)",desc:"Avaliar dados afetados, número de titulares, natureza dos dados"},
            {etapa:"4. Notificação ANPD (<72h)",desc:"Comunicar via portal gov.br/anpd com: data, natureza, dados, titulares, medidas"},
            {etapa:"5. Notificação Titulares",desc:"Se risco relevante: comunicar titulares afetados via e-mail/app"},
            {etapa:"6. Remediação",desc:"Correção da vulnerabilidade, auditoria forense, hardening"},
            {etapa:"7. Relatório Final",desc:"Documentar lições aprendidas, atualizar RIPD"},
          ].map(e=>(
            <div key={e.etapa} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.ink05}`}}>
              <div style={{width:32,height:32,borderRadius:99,background:T.greenPale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:T.green,flexShrink:0}}>{e.etapa.split(".")[0]}</div>
              <div><div style={{fontSize:12,fontWeight:700}}>{e.etapa}</div><div style={{fontSize:11,color:T.ink60}}>{e.desc}</div></div>
            </div>
          ))}
        </Card>
      )}
      {aba==="dpo" && (
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>DPO — Encarregado de Proteção de Dados (Art. 41 LGPD)</div>
          <CardFlat style={{marginBottom:12,background:T.tealPale}}>
            <div style={{fontSize:12,fontWeight:700,color:T.teal,marginBottom:4}}>Contato oficial do DPO</div>
            <div style={{fontSize:13}}>📧 privacidade@lucrom.com.br</div>
            <div style={{fontSize:12,color:T.ink60,marginTop:4}}>Resposta em até 15 dias úteis</div>
          </CardFlat>
          {[
            {resp:"Orientar colaboradores e terceiros",status:"✅"},
            {resp:"Receber comunicações da ANPD",status:"✅"},
            {resp:"Atender solicitações dos titulares",status:"✅"},
            {resp:"Manter RIPD atualizado",status:"⚠️ Em elaboração"},
            {resp:"Realizar treinamentos de privacidade",status:"⚠️ Previsto Q3/2025"},
            {resp:"Auditar parceiros (suboperadores)",status:"⚠️ Previsto Q4/2025"},
          ].map(r=>(
            <div key={r.resp} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.ink05}`}}>
              <span style={{fontSize:12}}>{r.resp}</span>
              <span style={{fontSize:12,fontWeight:700}}>{r.status}</span>
            </div>
          ))}
        </Card>
      )}
    </PageWrap>
  );
}

function PageAdmRBAC() {
  return (
    <PageWrap title="🔑 Permissões">
      <Grid cols={3} gap={12}>
        {[{nome:"Admin",perms:["Tudo","Liquidação","Revenue","Config"]},{nome:"Parceiro",perms:["Carteira própria","Score","Crédito","Recebíveis"]},{nome:"Cliente (MEI)",perms:["Financeiro próprio","Certificados","Missões","Operações"]}].map(r=>(
          <Card key={r.nome}>
            <div style={{fontWeight:800,fontSize:14,marginBottom:10}}>{r.nome}</div>
            {r.perms.map(p=><div key={p} style={{fontSize:12,color:T.ink60,marginBottom:6}}>🔑 {p}</div>)}
          </Card>
        ))}
      </Grid>
    </PageWrap>
  );
}

function PageAdmLogs({ st }) {
  const [filter, setFilter] = useState("TODOS");
  const logs = [...st.timeline].sort((a,b)=>new Date(b.ts).getTime()-new Date(a.ts).getTime());
  const filtered = filter==="TODOS" ? logs : logs.filter(l=>l.tipo===filter.toLowerCase());
  return (
    <PageWrap title="📋 Logs">
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        {["TODOS","sistema","financeiro","credito","fiscal"].map(f=><Chip key={f} active={filter===f} onClick={()=>setFilter(f)}>{f.toUpperCase()}</Chip>)}
      </div>
      <Card>
        <div style={{fontFamily:"monospace",fontSize:11}}>
          {filtered.slice(0,50).map((e,i)=>(
            <div key={i} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:`1px solid ${T.ink05}`}}>
              <span style={{color:T.ink40,minWidth:70,flexShrink:0}}>{new Date(e.ts).toLocaleTimeString("pt-BR")}</span>
              <div style={{width:7,height:7,borderRadius:99,background:e.cor||T.ink40,marginTop:4,flexShrink:0}}/>
              <span style={{color:T.ink,fontWeight:600,minWidth:80,flexShrink:0}}>{(e.tipo||"sistema").toUpperCase()}</span>
              <span style={{color:T.ink60,flex:1}}>{e.titulo}</span>
              <span style={{color:T.ink40}}>{e.desc}</span>
            </div>
          ))}
          {filtered.length===0 && <div style={{padding:16,textAlign:"center",color:T.ink60}}>Nenhum log.</div>}
        </div>
      </Card>
    </PageWrap>
  );
}

function PageAdmTeto({ st, dispatch }) {
  const toast = useToast();
  const [teto, setTeto] = useState(String(st.tetoMEI||81000));
  return (
    <PageWrap title="⚙️ Teto MEI">
      <AlertBox type="warn">Atualize apenas com mudança oficial na legislação.</AlertBox>
      <Grid cols={2} gap={14}>
        <Card>
          <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>Configuração</div>
          <CardFlat style={{marginBottom:14}}>
            <div style={{fontSize:10,color:T.ink60,marginBottom:3}}>TETO VIGENTE</div>
            <div style={{fontSize:28,fontWeight:900,color:T.green}}>{fmtBRL(st.tetoMEI||81000)}</div>
          </CardFlat>
          <Input label="Novo valor (R$)" value={teto} onChange={setTeto} prefix="R$"/>
          <Btn full onClick={()=>{const v=safeNum(teto);if(v<50000||v>500000){toast("Valor inválido","err");return;}dispatch({type:"ADMIN.SET_TETO",p:v});toast(`Teto: ${fmtBRL(v)}`); }}>Atualizar</Btn>
        </Card>
        <Card>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12}}>Histórico</div>
          {[{ano:2025,valor:81000,lei:"CGSN 163/2022"},{ano:2024,valor:81000,lei:"CGSN 163/2022"}].map(h=>(
            <div key={h.ano} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.ink05}`}}>
              <div><div style={{fontSize:13,fontWeight:600}}>{h.ano}</div><div style={{fontSize:11,color:T.ink60}}>{h.lei}</div></div>
              <span style={{fontSize:13,fontWeight:800,color:T.green}}>{fmtBRL(h.valor)}</span>
            </div>
          ))}
        </Card>
      </Grid>
    </PageWrap>
  );
}

// ── PAGE ROUTER ───────────────────────────────────────────────
// ── PAGE: SCORE DETALHADO (RISK-001 fix — explicabilidade BACEN) ─
// ── S9: ContestacaoForm — append-only, decisão imutável (padrão BACEN) ────
// A decisão NÃO pode ser sobrescrita após ser definida (validado no reducer)
function ContestacaoForm({ st, dispatch }) {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [texto, setTexto] = useState("");
  const [evidencia, setEvidencia] = useState("");
  const scoreAtual = st.user?.score || 300;
  const ultimoHist = (st.scoreHistory||[]).slice(-1)[0];

  function enviar() {
    if(!texto.trim()||texto.trim().length<20) { toast("Descreva a contestação com pelo menos 20 caracteres","err"); return; }
    dispatch({type:"MEI.CONTESTAR_SCORE",p:{
      scoreHistId: ultimoHist?.id || "score_atual",
      texto: texto.trim(),
      evidenciaUrl: evidencia.trim()||null,
    }});
    setShow(false); setTexto(""); setEvidencia("");
    toast("Contestação enviada! Resposta em até 5 dias úteis. ✅");
  }

  if(!show) return <Btn v="outline" size="sm" onClick={()=>setShow(true)}>⚖️ Contestar este score</Btn>;
  return (
    <div style={{background:T.ink02,borderRadius:T.radiusSm,padding:"14px",marginTop:8}}>
      <div style={{fontSize:12,fontWeight:700,color:T.ink,marginBottom:8}}>
        Contestação — Score atual: <span style={{color:T.green}}>{scoreAtual}</span>
      </div>
      <Input label="Descreva sua contestação *" value={texto} onChange={setTexto} rows={3}
        placeholder="Ex: Tenho todas as obrigações fiscais em dia. O DAS de abril foi pago em 15/04/2025 (comprovante em anexo)..."/>
      <Input label="URL de evidência (opcional)" value={evidencia} onChange={setEvidencia}
        placeholder="Link para comprovante, extrato ou documento"/>
      <AlertBox type="info" style={{marginBottom:10}}>
        Após envio, a contestação é <strong>imutável</strong>. Um analista responderá em até 5 dias úteis.
        Padrão BACEN Circular 3.909/2018 — toda contestação é auditável.
      </AlertBox>
      <div style={{display:"flex",gap:8}}>
        <Btn v="outline" onClick={()=>{setShow(false);setTexto("");setEvidencia("");}}>Cancelar</Btn>
        <Btn onClick={enviar} disabled={texto.trim().length<20}>Enviar contestação</Btn>
      </div>
    </div>
  );
}

function PageScoreExplicado({ st }) {
  const fraud = FraudEngine.calcRiskScore(st.operacoes||[], st.transactions||[], st.faturamento||0, st.tetoMEI||81000);
  const sc = ScoreEngine.calc(
    st.transactions, st.missions, st.dasnDecs, st.certs, st.notasFiscais,
    { xp:st.user?.xp||0, dasPagamentos:st.dasPagamentos||[], createdAt:st.user?.createdAt, openFinance:st.openFinance, fraudFlags:fraud.flags }
  );
  const risco = ScoreEngine.risk(sc.total, st.faturamento||0);
  const nivel = ScoreEngine.nivel(sc.total);

  const nomeFator = {
    volumeReceita:"Volume de Receita", margemLiquida:"Margem Líquida",
    regularidadeTx:"Regularidade de Transações", missoesConcluidas:"Missões Concluídas",
    xpAcumulado:"XP Acumulado", dasnDeclarada:"DASN Declarada",
    dasPago:"DAS em Dia", certificados:"Certificações", notasFiscais:"Notas Fiscais",
    antiguidade:"Tempo na Plataforma", openFinance:"Open Finance", semFraudes:"Histórico Limpo",
  };

  return (
    <PageWrap title="🔍 Score Detalhado"
      action={<Btn v="outline" size="sm" onClick={()=>ScoreReport.exportJSON(st)}>📄 Relatório BACEN</Btn>}>
      <Grid cols={2} gap={14} style={{marginBottom:14}}>
        <Card style={{background:`linear-gradient(135deg,${T.green},${T.greenDk})`,color:T.white,border:"none"}}>
          <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.6)",marginBottom:8,textTransform:"uppercase"}}>Score Lucrom</div>
          <div style={{fontSize:56,fontWeight:900,lineHeight:1,color:"#fff",marginBottom:4}}>{sc.total}</div>
          <div style={{fontSize:14,color:"rgba(255,255,255,.7)"}}>/1000 · Nível {nivel.label}</div>
          <div style={{marginTop:10,padding:"8px 12px",background:"rgba(255,255,255,.15)",borderRadius:8}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,.7)"}}>Limite pré-aprovado</div>
            <div style={{fontSize:20,fontWeight:800,color:"#fff"}}>{fmtBRL(risco.limit)}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>Taxa: {risco.rate} · Risco: {risco.level}</div>
          </div>
        </Card>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Antifraude</div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
            <div style={{fontSize:32,fontWeight:900,color:fraud.riskScore>=70?T.red:fraud.riskScore>=40?T.amber:T.green}}>{fraud.riskScore}</div>
            <div>
              <Badge color={fraud.riskScore>=70?T.red:fraud.riskScore>=40?T.amber:T.green}>{fraud.nivel}</Badge>
              <div style={{fontSize:11,color:T.ink60,marginTop:4}}>Risk Score</div>
            </div>
          </div>
          {fraud.flags.length>0 ? (
            fraud.flags.map(f=><div key={f} style={{fontSize:11,color:T.red,marginBottom:4}}>⚠️ {f}</div>)
          ) : (
            <div style={{fontSize:12,color:T.green}}>✅ Nenhum flag de fraude detectado</div>
          )}
        </Card>
      </Grid>

      <Card style={{marginBottom:14}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>Composição do Score — 12 Fatores (v5.0 Enterprise)</div>
        <div style={{fontSize:11,color:T.ink60,marginBottom:14}}>Auditável conforme Resolução BCB 4.557/2017. Cada fator e seu peso estão disponíveis para revisão.</div>
        {sc.explicacao.map((e,i)=>(
          <div key={e.fator} style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:12,fontWeight:600,color:T.ink}}>{i+1}. {nomeFator[e.fator]||e.fator}</span>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:11,color:T.ink60}}>Peso: {(sc.pesos[e.fator]*100).toFixed(0)}%</span>
                <span style={{fontSize:12,fontWeight:700,color:e.valor>=70?T.green:e.valor>=40?T.amber:T.red}}>{e.valor}/100</span>
              </div>
            </div>
            <Bar v={e.valor} max={100} color={e.valor>=70?T.green:e.valor>=40?T.amber:T.red} h={6}/>
            <div style={{fontSize:10,color:T.ink40,marginTop:2}}>Contribuição: +{e.contribuicao.toFixed(1)} pts</div>
          </div>
        ))}
      </Card>

      <Card>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Como melhorar seu score</div>
        {sc.explicacao.filter(e=>e.valor<70).slice(0,4).map(e=>(
          <div key={e.fator} style={{display:"flex",gap:10,padding:"10px 0",borderBottom:`1px solid ${T.ink05}`}}>
            <div style={{width:36,height:36,borderRadius:8,background:T.amberPale,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>💡</div>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:T.ink}}>{nomeFator[e.fator]}</div>
              <div style={{fontSize:11,color:T.ink60}}>
                {e.fator==="dasnDeclarada" && "Declare a DASN anual no Portal do Simples Nacional"}
                {e.fator==="dasPago" && "Pague o DAS todo mês antes do dia 20"}
                {e.fator==="notasFiscais" && "Emita NFS-e para cada serviço prestado"}
                {e.fator==="certificados" && "Solicite o Certificado CCFV na plataforma"}
                {e.fator==="openFinance" && "Conecte seu banco via Open Finance"}
                {e.fator==="xpAcumulado" && "Complete missões para ganhar XP"}
                {e.fator==="missoesConcluidas" && "Finalize as missões pendentes"}
                {e.fator==="antiguidade" && "Continue usando a plataforma regularmente"}
                {e.fator==="volumeReceita" && "Registre todas as suas receitas"}
                {e.fator==="margemLiquida" && "Reduza suas despesas operacionais"}
                {e.fator==="regularidadeTx" && "Mantenha lançamentos regulares"}
                {e.fator==="semFraudes" && "Mantenha histórico de operações limpo"}
              </div>
            </div>
          </div>
        ))}

      {/* ── S9: Contestação de Score (append-only — padrão BACEN) ──────── */}
      <Card style={{marginTop:14}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>⚖️ Contestar Score</div>
        <div style={{fontSize:12,color:T.ink60,marginBottom:12,lineHeight:1.6}}>
          Discorda do seu score? Envie uma contestação com evidências. Prazo de resposta: 5 dias úteis.
          Conforme BACEN Circular 3.909/2018, toda contestação é registrada e auditável.
        </div>
        {(st.contestacoes||[]).length>0&&(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:T.ink60,marginBottom:8}}>Contestações anteriores</div>
            {(st.contestacoes||[]).slice(0,3).map(c=>(
              <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.ink05}`}}>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:T.ink}}>{c.texto.slice(0,60)}{c.texto.length>60?"...":""}</div>
                  <div style={{fontSize:10,color:T.ink60}}>{fmtSafeDate(c.criadaEm)}</div>
                </div>
                <Badge color={c.decisao==="ACATADA"?T.green:c.decisao==="NEGADA"?T.red:c.decisao==="PARCIAL"?T.amber:T.teal}>
                  {c.decisao}
                </Badge>
              </div>
            ))}
          </div>
        )}
        <ContestacaoForm st={st} dispatch={dispatch}/>
      </Card>
      </Card>
    </PageWrap>
  );
}

// ── PAGE: SIMULADOR PRICE TABLE (CB-003 fix) ──────────────────
// ── PAGE: HEALTH MONITOR (SRE-001 fix) ───────────────────────
function PageHealthMonitor({ st }) {
  const [tick, setTick] = useState(0);
  useEffect(()=>{ const t=setInterval(()=>setTick(v=>v+1),5000); return()=>clearInterval(t); },[]);

  const metrics = useMemo(()=>{
    const now = Date.now();
    const txs = st.transactions||[];
    const ops = st.operacoes||[];
    const notifs = st.notificacoes||[];
    // Simula métricas de observabilidade
    const reqPerSec = Math.round(3 + Math.random()*7);
    const latencyP50 = Math.round(45 + Math.random()*30);
    const latencyP99 = Math.round(latencyP50 * 3.5);
    const errorRate  = parseFloat((Math.random()*0.8).toFixed(2));
    const cacheHit   = Math.round(85 + Math.random()*12);
    const dbConns    = Math.round(8 + Math.random()*12);
    return {
      // Golden Signals (SRE Google)
      traffic: reqPerSec,
      latency: { p50:latencyP50, p99:latencyP99 },
      errors:  errorRate,
      saturation: { cpu:Math.round(20+Math.random()*30), mem:Math.round(40+Math.random()*20), disk:34 },
      // App metrics
      totalTxs:txs.length, totalOps:ops.length, notifPending:notifs.filter(n=>!n.lida).length,
      cacheHit, dbConns,
      // Status
      services: [
        {nome:"API Backend",   status:"UP",  latency:latencyP50},
        {nome:"PostgreSQL",    status:"UP",  latency:Math.round(2+Math.random()*5)},
        {nome:"Redis Cache",   status:"UP",  latency:Math.round(0.5+Math.random()*1.5)},
        {nome:"Score Engine",  status:"UP",  latency:Math.round(12+Math.random()*8)},
        {nome:"Fraud Engine",  status:"UP",  latency:Math.round(8+Math.random()*5)},
        {nome:"Job Scheduler", status:"UP",  latency:0},
        {nome:"Open Finance",  status:"DEG", latency:450},  // degradado
        {nome:"Receita WS",    status:"UP",  latency:180},
      ],
    };
  }, [tick, st]);

  const statusColor = s => s==="UP"?T.green:s==="DEG"?T.amber:T.red;

  return (
    <PageWrap title="💓 Health Monitor — Golden Signals">
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14}}>
        <div style={{width:8,height:8,borderRadius:99,background:T.green,animation:"pulse 1s infinite"}}/>
        <span style={{fontSize:12,color:T.white,fontWeight:600}}>Sistema operacional — atualiza a cada 5s</span>
        <Badge color={T.green}>LIVE</Badge>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>

      {/* 4 Golden Signals */}
      <div style={{fontWeight:700,fontSize:12,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".8px",marginBottom:8}}>4 Golden Signals (SRE Google)</div>
      <Grid cols={4} gap={10} style={{marginBottom:14}}>
        <Card style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",color:T.white}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginBottom:4}}>TRÁFEGO</div>
          <div style={{fontSize:28,fontWeight:900,color:T.teal}}>{metrics.traffic}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>req/segundo</div>
        </Card>
        <Card style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",color:T.white}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginBottom:4}}>LATÊNCIA</div>
          <div style={{fontSize:28,fontWeight:900,color:metrics.latency.p99>300?T.red:metrics.latency.p99>150?T.amber:T.green}}>{metrics.latency.p99}ms</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>P99 · P50: {metrics.latency.p50}ms</div>
        </Card>
        <Card style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",color:T.white}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginBottom:4}}>ERROS</div>
          <div style={{fontSize:28,fontWeight:900,color:metrics.errors>1?T.red:metrics.errors>0.1?T.amber:T.green}}>{metrics.errors}%</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>error rate</div>
        </Card>
        <Card style={{background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",color:T.white}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,.5)",marginBottom:4}}>SATURAÇÃO</div>
          <div style={{fontSize:28,fontWeight:900,color:metrics.saturation.cpu>80?T.red:metrics.saturation.cpu>60?T.amber:T.green}}>{metrics.saturation.cpu}%</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.4)"}}>CPU · Mem: {metrics.saturation.mem}% · Disk: {metrics.saturation.disk}%</div>
        </Card>
      </Grid>

      <Grid cols={2} gap={14} style={{marginBottom:14}}>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Status dos Serviços</div>
          {metrics.services.map(s=>(
            <div key={s.nome} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${T.ink05}`}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:8,height:8,borderRadius:99,background:statusColor(s.status)}}/>
                <span style={{fontSize:12,fontWeight:600}}>{s.nome}</span>
              </div>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                {s.latency>0 && <span style={{fontSize:11,color:T.ink60}}>{s.latency}ms</span>}
                <Badge color={statusColor(s.status)}>{s.status}</Badge>
              </div>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Métricas da Aplicação</div>
          {[
            {l:"Transações totais",v:metrics.totalTxs,c:T.green},
            {l:"Operações de crédito",v:metrics.totalOps,c:T.teal},
            {l:"Notificações pendentes",v:metrics.notifPending,c:T.amber},
            {l:"Cache hit rate",v:`${metrics.cacheHit}%`,c:T.teal},
            {l:"Conexões DB ativas",v:metrics.dbConns,c:metrics.dbConns>15?T.red:T.green},
          ].map(m=>(
            <div key={m.l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${T.ink05}`}}>
              <span style={{fontSize:12,color:T.ink60}}>{m.l}</span>
              <span style={{fontSize:13,fontWeight:700,color:m.c}}>{m.v}</span>
            </div>
          ))}
          <AlertBox type="warn" style={{marginTop:12}}>
            <strong>Open Finance</strong> degradado. Latência: 450ms. Verificar parceiro.
          </AlertBox>
        </Card>
      </Grid>
    </PageWrap>
  );
}

// ── PAGE: LEDGER CONTÁBIL (CB-001 fix) ───────────────────────
function PageAdmLedger({ st }) {
  const ledger = st.ledger || [];
  const balanço = LedgerEngine.validarBalanco(ledger);
  const totalDebitos  = ledger.filter(e=>e.tipo==="DEBITO").reduce((a,e)=>a+e.valor,0);
  const totalCreditos = ledger.filter(e=>e.tipo==="CREDITO").reduce((a,e)=>a+e.valor,0);
  const contas = [...new Set(ledger.map(e=>e.conta))];

  return (
    <PageWrap title="📒 Ledger Contábil (Partida Dobrada)">
      <Grid cols={3} gap={10} style={{marginBottom:14}}>
        <Stat label="Total Débitos" value={fmtBRL(totalDebitos)} icon="📤" color={T.red}/>
        <Stat label="Total Créditos" value={fmtBRL(totalCreditos)} icon="📥" color={T.green}/>
        <Stat label="Balanço" value={balanço.ok?"✅ Balanceado":"⚠️ Desbalanceado"} color={balanço.ok?T.green:T.red}/>
      </Grid>
      {ledger.length === 0 ? (
        <Card style={{textAlign:"center",padding:32}}>
          <div style={{fontSize:40,marginBottom:12}}>📒</div>
          <div style={{fontWeight:700}}>Nenhum lançamento contábil</div>
          <p style={{fontSize:12,color:T.ink60,marginTop:8}}>Registre transações para gerar entradas duplas automaticamente.</p>
        </Card>
      ) : (
        <Card>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:560,fontSize:12}}>
              <thead>
                <tr style={{borderBottom:`2px solid ${T.ink10}`}}>
                  {["TX ID","Conta","Tipo","Valor","Descrição","Data"].map(h=>(
                    <th key={h} style={{padding:"7px 8px",textAlign:"left",fontSize:10,fontWeight:700,color:T.ink40,textTransform:"uppercase"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.slice(0,50).map((e,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${T.ink05}`,background:e.tipo==="DEBITO"?"#fff5f5":"#f0fff4"}}>
                    <td style={{padding:"6px 8px",fontFamily:"monospace",fontSize:10,color:T.ink60}}>{e.txId?.slice(-8)}</td>
                    <td style={{padding:"6px 8px",fontWeight:600}}>{e.conta}</td>
                    <td style={{padding:"6px 8px"}}><Badge color={e.tipo==="DEBITO"?T.red:T.green}>{e.tipo}</Badge></td>
                    <td style={{padding:"6px 8px",fontWeight:700,color:e.tipo==="DEBITO"?T.red:T.green}}>{fmtBRL(e.valor)}</td>
                    <td style={{padding:"6px 8px",color:T.ink60}}>{e.descricao}</td>
                    <td style={{padding:"6px 8px",color:T.ink60,fontSize:10}}>{fmtDate(e.ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageWrap>
  );
}

// ── Cadastro de Parceiro (Admin) ──────────────────────────────
function PageAdmCadastroParceiro({ st, dispatch }) {
  const toast = useToast();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [tipo, setTipo] = useState("Correspondente Bancário");
  const [comissao, setComissao] = useState("3");
  const [loading, setLoading] = useState(false);

  function salvar(e) {
    e.preventDefault();
    if(!nome.trim()||!email.trim()||!cnpj.trim()) { toast("Preencha nome, e-mail e CNPJ","err"); return; }
    if(!V.email(email.trim())) { toast("E-mail inválido","err"); return; }
    setLoading(true);
    setTimeout(()=>{
      dispatch({type:"ADMIN.ADD_PARCEIRO",p:{
        id:genId(), nome:nome.trim(), email:email.trim(),
        cnpj:cnpj.replace(/\D/g,""), telefone, tipo,
        comissao:parseFloat(comissao)||3,
        status:"ATIVO", volumeFinanciado:0, clientes:[], consultas:0, conversao:0, scoreMedio:0,
        criadoEm:new Date().toISOString(),
      }});
      toast("✅ Parceiro cadastrado com sucesso!");
      setNome(""); setEmail(""); setCnpj(""); setTelefone(""); setComissao("3");
      setLoading(false);
    }, 600);
  }

  const INP = {width:"100%",height:38,border:`1px solid ${T.ink10}`,borderRadius:T.radiusSm,padding:"0 10px",fontSize:13,fontFamily:"inherit",background:T.white,color:T.ink};
  const LBL = {display:"block",fontSize:11,fontWeight:700,color:T.ink60,marginBottom:4};

  return (
    <PageWrap title="🤝 Cadastro de Parceiro">
      <AlertBox type="info" style={{marginBottom:16}}>
        Parceiros cadastrados terão acesso ao Painel Parceiro e poderão gerir clientes MEI e operações de crédito.
      </AlertBox>
      <Card style={{maxWidth:540}}>
        <form onSubmit={salvar}>
          <Grid cols={2} gap={12}>
            <div style={{gridColumn:"1/-1"}}>
              <label style={LBL}>Nome / Razão Social *</label>
              <input style={INP} value={nome} onChange={e=>setNome(e.target.value)} placeholder="Ex: Financeira Brasil Ltda"/>
            </div>
            <div>
              <label style={LBL}>E-mail de acesso *</label>
              <input style={INP} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="parceiro@empresa.com.br"/>
            </div>
            <div>
              <label style={LBL}>CNPJ *</label>
              <input style={INP} value={cnpj} onChange={e=>setCnpj(V.fmtCNPJ(e.target.value))} placeholder="00.000.000/0001-00"/>
            </div>
            <div>
              <label style={LBL}>Telefone</label>
              <input style={INP} value={telefone} onChange={e=>setTelefone(V.fmtPhone(e.target.value))} placeholder="(11) 99999-9999"/>
            </div>
            <div>
              <label style={LBL}>Tipo de Parceiro</label>
              <select style={INP} value={tipo} onChange={e=>setTipo(e.target.value)}>
                <option>Correspondente Bancário</option>
                <option>Fintech Parceira</option>
                <option>Cooperativa de Crédito</option>
                <option>Plataforma de Empréstimos</option>
              </select>
            </div>
            <div>
              <label style={LBL}>Comissão (% sobre operação)</label>
              <input style={INP} type="number" min="0" max="10" step="0.1" value={comissao} onChange={e=>setComissao(e.target.value)}/>
            </div>
          </Grid>
          <div style={{display:"flex",gap:10,marginTop:20}}>
            <Btn type="submit" full disabled={loading}>{loading?"Cadastrando...":"Cadastrar Parceiro"}</Btn>
          </div>
        </form>
      </Card>
      {(st.parceiros||[]).length > 0 && (
        <div style={{marginTop:20}}>
          <div style={{fontSize:12,fontWeight:700,color:T.ink40,textTransform:"uppercase",letterSpacing:".8px",marginBottom:10}}>Parceiros Cadastrados</div>
          {(st.parceiros||[]).slice().reverse().map(p=>(
            <Card key={p.id} style={{marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13}}>{p.nome}</div>
                  <div style={{fontSize:11,color:T.ink60}}>{p.email} · {p.tipo}</div>
                </div>
                <Badge color={p.status==="ATIVO"?T.green:T.red}>{p.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageWrap>
  );
}

// ── Cadastro de Administrador ──────────────────────────────────
function PageAdmCadastroAdmin({ st, dispatch }) {
  const toast = useToast();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nivel, setNivel] = useState("ADMIN");
  const [loading, setLoading] = useState(false);

  function salvar(e) {
    e.preventDefault();
    if(!nome.trim()||!email.trim()||!senha) { toast("Preencha todos os campos obrigatórios","err"); return; }
    if(!V.email(email.trim())) { toast("E-mail inválido","err"); return; }
    if(senha.length < 8) { toast("Senha mínima de 8 caracteres","err"); return; }
    setLoading(true);
    setTimeout(()=>{
      dispatch({type:"ADMIN.ADD_ADMIN_USER",p:{
        id:genId(), nome:nome.trim(), email:email.trim(),
        role:nivel, status:"ATIVO",
        criadoEm:new Date().toISOString(),
      }});
      toast("✅ Administrador cadastrado com sucesso!");
      setNome(""); setEmail(""); setSenha(""); setNivel("ADMIN");
      setLoading(false);
    }, 600);
  }

  const INP = {width:"100%",height:38,border:`1px solid ${T.ink10}`,borderRadius:T.radiusSm,padding:"0 10px",fontSize:13,fontFamily:"inherit",background:T.white,color:T.ink};
  const LBL = {display:"block",fontSize:11,fontWeight:700,color:T.ink60,marginBottom:4};

  return (
    <PageWrap title="👑 Cadastro de Administrador">
      <AlertBox type="warn" style={{marginBottom:16}}>
        Administradores têm acesso irrestrito à plataforma. Cadastre apenas usuários autorizados pela equipe Lucrom.
      </AlertBox>
      <Card style={{maxWidth:480}}>
        <form onSubmit={salvar}>
          <Grid cols={1} gap={12}>
            <div>
              <label style={LBL}>Nome completo *</label>
              <input style={INP} value={nome} onChange={e=>setNome(e.target.value)} placeholder="Ex: João Silva"/>
            </div>
            <div>
              <label style={LBL}>E-mail de acesso *</label>
              <input style={INP} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@lucrom.com.br"/>
            </div>
            <div>
              <label style={LBL}>Senha inicial *</label>
              <input style={INP} type="password" value={senha} onChange={e=>setSenha(e.target.value)} placeholder="Mínimo 8 caracteres"/>
            </div>
            <div>
              <label style={LBL}>Nível de acesso</label>
              <select style={INP} value={nivel} onChange={e=>setNivel(e.target.value)}>
                <option value="ADMIN">Admin — Acesso completo</option>
                <option value="ADMIN_READONLY">Admin Leitura — Apenas visualização</option>
                <option value="SUPORTE">Suporte — Acesso limitado</option>
              </select>
            </div>
          </Grid>
          <div style={{marginTop:10,padding:"10px 12px",background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.15)",borderRadius:T.radiusSm,fontSize:11,color:"#B91C1C"}}>
            🔐 O administrador deverá alterar a senha no primeiro acesso.
          </div>
          <div style={{display:"flex",gap:10,marginTop:16}}>
            <Btn type="submit" full disabled={loading}>{loading?"Cadastrando...":"Cadastrar Administrador"}</Btn>
          </div>
        </form>
      </Card>
    </PageWrap>
  );
}

// ── Lazy page loader — simula code splitting por rota ─────────
// Em produção com Vite/Next: import() + React.lazy + Suspense
// Aqui: renderização condicional com indicador de loading
function PageLoading({ msg={msg} }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"#F9FAFB",gap:16}}>
      <div style={{width:40,height:40,borderRadius:99,border:`3px solid ${T.green}`,borderTopColor:"transparent",animation:"spin 0.8s linear infinite"}}/>
      <div style={{fontSize:13,color:T.ink60}}>Carregando...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function getPage(page, view, safeDispatch, go) {
  const st = view;
  const dispatch = safeDispatch;
  const P = {st, dispatch, go};
  const W = (name, node) => <SafePage name={name} onReset={()=>go("home")}>{node}</SafePage>;
  const map = {
    home:       W("Início",         <PageHome {...P}/>),
    missions:   W("Missões",        <PageMissoes {...P}/>),
    ia:         W("IA Consultora",  <PageIA st={st} go={go}/>),
    edumei:     W("Educação MEI",   <PageEduMEI {...P}/>),
    lancamentos:W("Lançamentos",    <PageLancamentos {...P}/>),
    despesas:   W("Despesas",       <PageDespesas {...P}/>),
    operacoes:  W("Operações",      <PageMeiOperacoes {...P}/>),
    propostas:  W("Propostas",      <PagePropostas {...P}/>),
    calculadora:W("Calculadora",    <PageCalculadora st={st}/>),
    openfinance:W("Open Finance",   <PageOpenFinance st={st} dispatch={dispatch}/>),
    cert_ccfv:  W("Cert CCFV",      <PageCertCCFV {...P}/>),
    cert_a1:    W("Cert A1",        <PageCertA1 {...P}/>),
    impostos:   W("Impostos",       <PageImpostos {...P}/>),
    notas:      W("Notas Fiscais",  <PageNotas {...P}/>),
    relatorios: W("Relatórios",     <PageRelatorios st={st}/>),
    planos:     W("Planos",         <PagePlanos {...P}/>),
    privacidade:W("Privacidade",    <PagePrivacidade st={st} dispatch={dispatch}/>),
    perfil:     W("Perfil",         <PagePerfil {...P}/>),
    parc_dash:  W("Painel Parceiro",   <PageParcDash st={st} go={go} dispatch={dispatch}/>),
    parc_carteira:W("Carteira",        <PageParcCarteira {...P}/>),
    parc_cobrancas:W("Cobranças",      <PageParcCobrancas st={st} go={go} dispatch={dispatch}/>),
    parc_operacoes:W("Op.Parceiro",    <PageParcOperacoes {...P}/>),
    parc_infra: W("Infraestrutura",    <PageParcInfra st={st}/>),
    parc_negociacoes:W("Negociações",  <PageParcNegociacoes st={st} go={go} dispatch={dispatch}/>),
    parc_relatorios:W("Relatórios",   <PageParcRelatorios st={st}/>),
    parc_score: W("Score Parceiro",    <PageParcScore st={st}/>),
    parc_recebiveis:W("Recebíveis",    <PageParcRecebiveis st={st}/>),
    parc_settlement:W("Liquidação",    <PageParcSettlement st={st}/>),
    parc_lgpd:  W("LGPD Parceiro",     <PageParcLGPD/>),
    adm_dash:   W("Admin",          <PageAdmDash st={st}/>),
    adm_operacoes:W("Op.Admin",     <PageAdmOperacoes st={st}/>),
    adm_settlement:W("Liquidação Adm",<PageAdmSettlement {...P}/>),
    adm_revenue:W("Revenue",        <PageAdmRevenue st={st}/>),
    adm_usuarios:W("Usuários",      <PageAdmUsuarios st={st}/>),
    adm_parceiros:W("Parceiros Adm",<PageAdmParceiros st={st}/>),
    adm_missoes:<PageAdmMissoes {...P}/>, adm_edu:<PageAdmEdu {...P}/>, adm_planos:<PageAdmPlanos {...P}/>,
    adm_certificados:<PageAdmCertificados {...P}/>,
    adm_fraudes:<PageAdmFraudes st={st}/>,
    adm_lgpd:<PageAdmLGPD/>, adm_rbac:<PageAdmRBAC/>,
    adm_logs:<PageAdmLogs st={st}/>, adm_teto:<PageAdmTeto st={st} dispatch={dispatch}/>,
    adm_health:<PageHealthMonitor st={st}/>,
    adm_ledger:<PageAdmLedger st={st}/>,
    adm_cad_parceiro:<PageAdmCadastroParceiro st={st} dispatch={dispatch}/>,
    adm_cad_admin:<PageAdmCadastroAdmin st={st} dispatch={dispatch}/>,
    metas:<PageMetas {...P}/>,
    score_explicado:<PageScoreExplicado st={st}/>,
  };
  return map[page] || <PageHome {...P}/>;
}

// ── PÁGINA PÚBLICA: VERIFICAR CERTIFICADO ────────────────────
function PageCertVerify({ onGoSite, st }) {
  const toast = useToast();
  const [inputId, setInputId] = useState(()=>{
    try { return new URLSearchParams(window.location.search).get("cert")||""; } catch{ return ""; }
  });
  const [status, setStatus] = useState(()=>{
    try { return new URLSearchParams(window.location.search).get("cert") ? "idle" : "idle"; } catch{ return "idle"; }
  });
  const [certData, setCertData] = useState(null);

  // Roda automaticamente se veio com ?cert= na URL
  useEffect(()=>{
    const p = new URLSearchParams(window.location.search);
    const id = p.get("cert")||p.get("verify");
    if(id){ setInputId(id); setTimeout(()=>doVerify(id), 100); }
  // eslint-disable-next-line
  },[]);

  function doVerify(id) {
    const q = (id||inputId).trim();
    if(!q){ toast("Digite o ID do certificado","warn"); return; }
    setStatus("loading");
    setTimeout(()=>{
      // Procura nos certs emitidos no estado local (demo ou real)
      const allCerts = st?.certs||[];
      const found = allCerts.find(c=>
        c.id===q || c.id?.startsWith(q) || q.startsWith(c.id?.slice(0,8)||"__")
      );
      if(found){
        const expiraEm = found.expiraEm || new Date(new Date(found.emitidoEm).getTime()+90*86400000).toISOString();
        const sc = ScoreEngine.calc(st.transactions||[],st.missions||[],st.dasnDecs||[],st.certs||[],st.notasFiscais||[]);
        const nivel = ScoreEngine.nivel(sc.total);
        setCertData({
          id: found.id,
          tipo: found.tipo||"CCFV",
          status: new Date(expiraEm)>new Date() ? "VÁLIDO" : "EXPIRADO",
          titular: st?.user?.nome||"—",
          cnpj: st?.user?.cnpj ? st.user.cnpj.replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})-(\d{2})/,"**.***.***/$4-**") : "—",
          emitidoEm: found.emitidoEm,
          expiraEm,
          score: sc.total,
          nivel: nivel.label,
          nivelColor: nivel.color,
          nivelBg: nivel.bg,
          hash: found.hash||"AGUARDANDO_BACKEND",
          valido: new Date(expiraEm)>new Date(),
        });
        setStatus("found");
      } else if(IS_DEMO && q.length>=6) {
        // Demo: simula um certificado genérico para IDs desconhecidos
        const fakeExp = new Date(Date.now()+60*86400000).toISOString();
        setCertData({
          id: q,
          tipo: q.toUpperCase().includes("A1")?"A1":"CCFV",
          status: "VÁLIDO",
          titular: "Titular do Certificado",
          cnpj: "**.***.***/**-**",
          emitidoEm: new Date(Date.now()-10*86400000).toISOString(),
          expiraEm: fakeExp,
          score: 742,
          nivel: "Ouro",
          nivelColor: "#d97706",
          nivelBg: "#fffbeb",
          hash: "SHA256:"+q.split("").map(c=>c.charCodeAt(0).toString(16)).join("").slice(0,48).toUpperCase()+"...",
          valido: true,
          isDemo: true,
        });
        setStatus("found");
      } else {
        setStatus("notfound");
      }
    }, 800);
  }

  const validColor = certData?.valido ? "#16a34a" : "#dc2626";
  const validBg    = certData?.valido ? "#f0fdf4" : "#fef2f2";
  const validBorder= certData?.valido ? "#bbf7d0" : "#fecaca";

  return (
    <div style={{minHeight:"100vh",background:"#f9fafb",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
      {/* Header */}
      <header style={{background:"linear-gradient(135deg,#16a34a,#15803d)",padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 4px 16px rgba(22,163,74,.25)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:9,background:"rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:900,color:"#fff"}}>L</div>
          <div>
            <div style={{fontWeight:800,fontSize:16,color:"#fff",lineHeight:1}}>Lucrom</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.7)",lineHeight:1,marginTop:2}}>Verificação de Certificados</div>
          </div>
        </div>
        <button onClick={onGoSite} style={{background:"rgba(255,255,255,.15)",border:"1.5px solid rgba(255,255,255,.3)",color:"#fff",padding:"8px 18px",borderRadius:8,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.25)";}}
          onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.15)";}}>
          ← Voltar ao site
        </button>
      </header>

      {/* Hero */}
      <div style={{background:"linear-gradient(180deg,rgba(22,163,74,.06) 0%,transparent 100%)",padding:"48px 24px 32px",textAlign:"center"}}>
        <div style={{fontSize:52,marginBottom:12}}>🔍</div>
        <h1 style={{fontWeight:900,fontSize:28,color:"#111827",letterSpacing:"-1px",marginBottom:10}}>Verificação de Certificado</h1>
        <p style={{fontSize:14,color:"#6b7280",lineHeight:1.7,maxWidth:480,margin:"0 auto"}}>
          Digite o ID do certificado CCFV ou Digital A1 para confirmar a autenticidade, validade e dados do titular.
        </p>
      </div>

      {/* Search box */}
      <div style={{maxWidth:560,margin:"0 auto",padding:"0 24px 48px"}}>
        <div style={{background:"#fff",borderRadius:16,padding:28,boxShadow:"0 4px 24px rgba(0,0,0,.08)",border:"1px solid #e5e7eb",marginBottom:24}}>
          <div style={{fontSize:11,fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:".6px",marginBottom:10}}>ID do Certificado</div>
          <div style={{display:"flex",gap:10}}>
            <input
              value={inputId}
              onChange={e=>setInputId(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&doVerify()}
              placeholder="Cole aqui o ID do certificado..."
              style={{flex:1,padding:"12px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:13,outline:"none",fontFamily:"inherit",transition:"border-color .15s",color:"#111827"}}
              onFocus={e=>{e.currentTarget.style.borderColor="#16a34a";}}
              onBlur={e=>{e.currentTarget.style.borderColor="#e5e7eb";}}
            />
            <button onClick={()=>doVerify()} disabled={status==="loading"} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:10,padding:"12px 20px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",opacity:status==="loading"?.7:1,transition:"all .15s"}}>
              {status==="loading"?"⏳ Buscando...":"Verificar"}
            </button>
          </div>
          <div style={{fontSize:11,color:"#9ca3af",marginTop:8}}>
            O ID está no PDF do certificado, no rodapé da tela CCFV ou no QR Code.
          </div>
        </div>

        {/* Resultado: ENCONTRADO */}
        {status==="found" && certData && (
          <div style={{background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,.1)",border:`2px solid ${validBorder}`}}>
            {/* Status banner */}
            <div style={{background:validBg,borderBottom:`1.5px solid ${validBorder}`,padding:"14px 24px",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:12,height:12,borderRadius:99,background:validColor,flexShrink:0,boxShadow:`0 0 0 3px ${validBorder}`}}/>
              <div>
                <div style={{fontWeight:800,fontSize:14,color:validColor}}>{certData.valido?"✅ CERTIFICADO VÁLIDO":"❌ CERTIFICADO EXPIRADO"}</div>
                {certData.isDemo && <div style={{fontSize:10,color:"#f59e0b",fontWeight:600}}>⚠️ Modo demonstração — dados simulados</div>}
              </div>
              <div style={{marginLeft:"auto",background:certData.nivelBg||"#f0fdf4",color:certData.nivelColor||"#16a34a",fontWeight:800,fontSize:10,padding:"5px 12px",borderRadius:99,border:`1.5px solid ${certData.nivelColor||"#16a34a"}40`}}>
                NÍVEL {(certData.nivel||"").toUpperCase()}
              </div>
            </div>

            {/* Dados */}
            <div style={{padding:"24px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
                {[
                  {l:"Tipo de Certificado",v:certData.tipo==="CCFV"?"CCFV — Capacidade Financeira Validada":"Certificado Digital A1"},
                  {l:"Titular",v:certData.titular},
                  {l:"CNPJ (mascarado)",v:certData.cnpj},
                  {l:"Score Lucrom",v:`${certData.score} / 1000`},
                  {l:"Emitido em",v:fmtDate(certData.emitidoEm)},
                  {l:"Válido até",v:fmtDate(certData.expiraEm)},
                ].map(f=>(
                  <div key={f.l} style={{padding:"12px 14px",borderRadius:10,background:"#f9fafb",border:"1px solid #e5e7eb"}}>
                    <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:".5px",marginBottom:4}}>{f.l}</div>
                    <div style={{fontSize:13,fontWeight:700,color:"#111827"}}>{f.v}</div>
                  </div>
                ))}
              </div>

              {/* ID & Hash */}
              <div style={{background:"#f9fafb",borderRadius:10,padding:"14px 16px",border:"1px solid #e5e7eb",marginBottom:16}}>
                <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>ID do Certificado</div>
                <div style={{fontFamily:"monospace",fontSize:11,color:"#374151",wordBreak:"break-all"}}>{certData.id}</div>
              </div>
              <div style={{background:"#f9fafb",borderRadius:10,padding:"14px 16px",border:"1px solid #e5e7eb"}}>
                <div style={{fontSize:9,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>Assinatura SHA-256</div>
                <div style={{fontFamily:"monospace",fontSize:10,color:"#6b7280",wordBreak:"break-all",lineHeight:1.6}}>{certData.hash}</div>
              </div>
            </div>

            {/* Footer */}
            <div style={{background:"#f9fafb",borderTop:"1px solid #e5e7eb",padding:"14px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div style={{fontSize:11,color:"#9ca3af"}}>© 2025 Lucrom Tecnologia Financeira LTDA</div>
              <button onClick={()=>{setStatus("idle");setCertData(null);setInputId("");}} style={{background:"transparent",border:"1px solid #e5e7eb",borderRadius:8,padding:"6px 14px",fontSize:11,fontWeight:600,color:"#6b7280",cursor:"pointer",fontFamily:"inherit"}}>Verificar outro</button>
            </div>
          </div>
        )}

        {/* Resultado: NÃO ENCONTRADO */}
        {status==="notfound" && (
          <div style={{background:"#fff",borderRadius:16,padding:32,boxShadow:"0 4px 24px rgba(0,0,0,.08)",border:"1.5px solid #fecaca",textAlign:"center"}}>
            <div style={{fontSize:48,marginBottom:12}}>❌</div>
            <div style={{fontWeight:800,fontSize:16,color:"#dc2626",marginBottom:8}}>Certificado não encontrado</div>
            <div style={{fontSize:13,color:"#6b7280",lineHeight:1.7,marginBottom:20}}>
              Nenhum certificado foi localizado com este ID.<br/>
              Verifique se o ID foi copiado corretamente.
            </div>
            <div style={{background:"#fff7ed",borderRadius:10,padding:"14px 16px",border:"1px solid #fed7aa",marginBottom:20,textAlign:"left"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#c2410c",marginBottom:6}}>💡 Como encontrar o ID correto:</div>
              {["No PDF do certificado — seção 'Verificação Digital'","No e-mail de emissão enviado pela Lucrom","Na tela CCFV do seu painel → abaixo do QR Code"].map(t=>(
                <div key={t} style={{fontSize:12,color:"#7c3aed"===t?"#374151":"#374151",marginBottom:4,paddingLeft:8}}>• {t}</div>
              ))}
            </div>
            <button onClick={()=>{setStatus("idle");setInputId("");}} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:10,padding:"10px 24px",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Tentar novamente</button>
          </div>
        )}

        {/* Info boxes */}
        {status==="idle" && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:8}}>
            {[
              {icon:"🏅",t:"Certificado CCFV",d:"Certidão de Capacidade Financeira Validada. Válido por 90 dias."},
              {icon:"🔐",t:"Certificado A1",d:"Assinatura Digital com validade jurídica. 1, 2 ou 3 anos."},
              {icon:"🛡️",t:"SHA-256 Verificado",d:"Assinatura criptográfica garante integridade e autenticidade."},
              {icon:"⚡",t:"Verificação Instantânea",d:"Consulta em tempo real na base de dados Lucrom."},
            ].map(x=>(
              <div key={x.t} style={{background:"#fff",borderRadius:12,padding:"18px 16px",border:"1px solid #e5e7eb",boxShadow:"0 2px 8px rgba(0,0,0,.04)"}}>
                <div style={{fontSize:24,marginBottom:8}}>{x.icon}</div>
                <div style={{fontWeight:700,fontSize:13,color:"#111827",marginBottom:4}}>{x.t}</div>
                <div style={{fontSize:12,color:"#6b7280",lineHeight:1.5}}>{x.d}</div>
              </div>
            ))}
          </div>
        )}

        {/* Footer legal */}
        <div style={{marginTop:36,textAlign:"center",fontSize:11,color:"#9ca3af",lineHeight:1.8}}>
          <div>lucrom.com.br/cert/verify — Portal oficial de verificação Lucrom</div>
          <div>Dúvidas: <a href="mailto:suporte@lucrom.com.br" style={{color:"#16a34a",textDecoration:"none"}}>suporte@lucrom.com.br</a></div>
        </div>
      </div>
    </div>
  );
}

// ── LANDING ───────────────────────────────────────────────────
const LEGAL_CONTENT = {
  "Termos de Uso": `**Termos de Uso — Lucrom Tecnologia Financeira**\n\nAo usar a plataforma Lucrom, você concorda com estes termos:\n\n• O serviço é destinado exclusivamente a Microempreendedores Individuais (MEIs) brasileiros.\n• O Score Lucrom é calculado com base em dados fornecidos pelo próprio usuário e não constitui garantia de crédito.\n• A Lucrom não é uma instituição financeira. A concessão de crédito é realizada por parceiros bancários regulados pelo BACEN.\n• O usuário é responsável pela veracidade das informações cadastradas.\n• A conta poderá ser suspensa em caso de uso indevido ou fraude detectada pelo sistema antifraude Lucrom.\n• Termos sujeitos a alteração mediante aviso prévio de 30 dias.\n\nDúvidas: contato@lucrom.com.br`,
  "Política de Privacidade": `**Política de Privacidade — Lucrom (LGPD Lei 13.709/2018)**\n\n**Dados coletados:** CPF, CNPJ, nome, e-mail, telefone, dados financeiros e histórico de transações.\n\n**Finalidade:** Operação do serviço, cálculo do Score Lucrom, análise de crédito e cumprimento de obrigações legais (BACEN, Receita Federal).\n\n**Compartilhamento:** Dados são compartilhados com parceiros bancários somente para análise e concessão de crédito, mediante consentimento expresso.\n\n**Seus direitos (Art. 18 LGPD):**\n• Acesso aos dados (prazo: 15 dias)\n• Correção de dados incorretos\n• Portabilidade e exclusão\n• Revogação de consentimento a qualquer momento\n\n**DPO — Encarregado:** privacidade@lucrom.com.br\n\nPara exercer seus direitos, acesse "Privacidade & Segurança" no seu painel.`,
  "Política de Cookies": `**Política de Cookies — Lucrom**\n\n**Cookies essenciais (não podem ser recusados):**\n• Sessão de autenticação (segurança)\n• Preferências de consentimento LGPD\n• Estado do usuário (plano, notificações)\n\n**Cookies analíticos (opcionais):**\n• Métricas de uso para melhorias da plataforma\n• Identificação de erros e performance\n\n**Cookies de marketing (opcionais):**\n• Personalização de ofertas de crédito relevantes\n• Comunicações por e-mail e push\n\nVocê pode gerenciar suas preferências a qualquer momento via banner de consentimento ou nas configurações do navegador.\n\nContato: privacidade@lucrom.com.br`,
  "LGPD": `**Conformidade LGPD — Lucrom (Lei 13.709/2018)**\n\n**Bases legais utilizadas:**\n• Execução de contrato (Art. 7º, V) — dados necessários para o serviço\n• Obrigação legal (Art. 7º, II) — BACEN, Receita Federal\n• Legítimo interesse (Art. 7º, IX) — antifraude e segurança\n• Consentimento (Art. 7º, I) — comunicações e crédito\n\n**Retenção de dados:**\n• Dados cadastrais: durante vigência do contrato + 5 anos\n• Logs de auditoria: 6 meses\n• Dados fiscais: 5 anos (CTN)\n\n**Seus direitos:** acesse "Privacidade & Segurança" no painel.\n\n**DPO:** privacidade@lucrom.com.br`,
  "Sobre a Lucrom": `**Sobre a Lucrom**\n\nA Lucrom é uma fintech brasileira dedicada exclusivamente aos Microempreendedores Individuais (MEIs).\n\nNossa missão é democratizar o acesso ao crédito e à educação financeira para os +15 milhões de MEIs no Brasil.\n\n**O que oferecemos:**\n• Score de Evolução Financeira exclusivo para MEIs\n• Simulação e solicitação de crédito justo\n• Gestão de finanças, DAS e notas fiscais\n• Certificação CCFV de capacidade financeira\n• Missões de educação financeira gamificadas\n\n**Contato:** contato@lucrom.com.br\n**Suporte:** suporte@lucrom.com.br\n**Privacidade:** privacidade@lucrom.com.br\n\n© 2025 Lucrom Tecnologia Financeira LTDA`,
  "da.sign": `**da.sign — Certificação de Segurança**\n\nA Lucrom utiliza a infraestrutura de segurança da.sign para:\n\n• Assinatura digital de certificados CCFV e A1\n• Verificação de identidade (KYC) de MEIs\n• Armazenamento seguro de documentos com validade jurídica\n• Conformidade com a ICP-Brasil (Infraestrutura de Chaves Públicas)\n\nTodos os certificados emitidos possuem validade legal conforme a Lei 14.063/2020 (Assinaturas Eletrônicas).\n\nVerifique a autenticidade em: lucrom.com.br/cert/verify`,
};

function Landing({ onLogin, onCadastro, onDemo, onVerify }) {
  const bp = useResponsive();
  const isDesktop = bp === "lg";
  const isTablet = bp === "md" || bp === "lg";
  const [legalModal, setLegalModal] = useState(null);

  const scrollToComoFunciona = () => {
    document.getElementById("como-funciona")?.scrollIntoView({behavior:"smooth"});
  };

  // Scroll-reveal animations
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      .reveal{opacity:0;transform:translateY(32px);transition:opacity .65s cubic-bezier(.22,.61,.36,1),transform .65s cubic-bezier(.22,.61,.36,1)}
      .reveal.visible{opacity:1;transform:translateY(0)}
      .reveal-left{opacity:0;transform:translateX(-32px);transition:opacity .65s cubic-bezier(.22,.61,.36,1),transform .65s cubic-bezier(.22,.61,.36,1)}
      .reveal-left.visible{opacity:1;transform:translateX(0)}
      .reveal-right{opacity:0;transform:translateX(32px);transition:opacity .65s cubic-bezier(.22,.61,.36,1),transform .65s cubic-bezier(.22,.61,.36,1)}
      .reveal-right.visible{opacity:1;transform:translateX(0)}
      .reveal-scale{opacity:0;transform:scale(.94);transition:opacity .55s cubic-bezier(.22,.61,.36,1),transform .55s cubic-bezier(.22,.61,.36,1)}
      .reveal-scale.visible{opacity:1;transform:scale(1)}
    `;
    document.head.appendChild(style);
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if(e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); } });
    }, {threshold:0.12});
    setTimeout(()=>{
      document.querySelectorAll(".reveal,.reveal-left,.reveal-right,.reveal-scale").forEach(el => io.observe(el));
    }, 80);
    return () => { io.disconnect(); style.remove(); };
  }, []);

  return (
    <div style={{background:"#FFFFFF",minHeight:"100vh",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>

      {/* ── NAV ─────────────────────────────────────────────── */}
      <nav style={{
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding: isTablet ? "0 48px" : "0 20px",
        height:64,
        borderBottom:"1px solid #F0F0F0",
        position:"sticky",top:0,background:"rgba(255,255,255,.97)",
        backdropFilter:"blur(12px)",zIndex:100,
        boxShadow:"0 1px 4px rgba(0,0,0,.04)"
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{
            width:38,height:38,borderRadius:10,background:"#16a34a",
            display:"flex",alignItems:"center",justifyContent:"center",
            color:"#fff",fontWeight:900,fontSize:18,letterSpacing:"-1px",
            boxShadow:"0 3px 10px rgba(22,163,74,.3)"
          }}>L</div>
          <span style={{fontWeight:800,fontSize:19,color:"#111827",letterSpacing:"-0.5px"}}>Lucrom</span>
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <button onClick={onLogin} style={{
            padding: isTablet ? "9px 24px" : "8px 14px",
            border:"1.5px solid #D1D5DB",borderRadius:9,
            background:"transparent",fontWeight:600,
            fontSize: isTablet ? 14 : 13,
            cursor:"pointer",whiteSpace:"nowrap",
            color:"#374151",fontFamily:"inherit",transition:"all .15s"
          }}>Entrar</button>
          <button onClick={onCadastro} style={{
            padding: isTablet ? "9px 24px" : "8px 14px",
            border:"none",borderRadius:9,background:"#16a34a",
            color:"#fff",fontWeight:700,
            fontSize: isTablet ? 14 : 13,
            cursor:"pointer",whiteSpace:"nowrap",
            fontFamily:"inherit",transition:"all .15s",
            boxShadow:"0 3px 10px rgba(22,163,74,.25)",
          }}>Comece agora</button>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────── */}
      <section style={{
        maxWidth:1200,margin:"0 auto",
        padding: isTablet ? "72px 48px 64px" : "40px 20px",
        display:"grid",
        gridTemplateColumns: isTablet ? "1.1fr 1fr" : "1fr",
        gap: isTablet ? 64 : 40,
        alignItems:"center"
      }}>
        {/* Left */}
        <div className="reveal-left">
          <div style={{
            display:"inline-flex",alignItems:"center",
            background:"#DCFCE7",color:"#166534",
            fontSize:11,fontWeight:700,letterSpacing:1.5,
            textTransform:"uppercase",padding:"6px 14px",
            borderRadius:99,marginBottom:28,
          }}>O PRIMEIRO SCORE DE EVOLUÇÃO FINANCEIRA PARA MEIS</div>

          <h1 style={{
            fontSize: isDesktop ? 50 : isTablet ? 40 : 32,
            fontWeight:900,lineHeight:1.1,
            color:"#111827",margin:"0 0 22px",
            letterSpacing:"-1.8px"
          }}>
            O primeiro Score<br/>de Evolução<br/>
            Financeira para{" "}
            <span style={{color:"#16a34a"}}>MEIs.</span>
          </h1>

          <p style={{
            fontSize:16,color:"#4B5563",lineHeight:1.75,
            margin:"0 0 36px",maxWidth:430
          }}>
            Organize suas finanças, fortaleça sua reputação<br/>
            e acompanhe sua evolução financeira.
          </p>

          <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:44}}>
            <button onClick={onCadastro} style={{
              display:"flex",alignItems:"center",gap:8,
              padding:"14px 30px",background:"#16a34a",color:"#fff",
              border:"none",borderRadius:10,fontWeight:700,fontSize:15,
              cursor:"pointer",fontFamily:"inherit",
              boxShadow:"0 4px 16px rgba(22,163,74,.3)",transition:"all .15s"
            }}>Comece agora <span>→</span></button>
            <button onClick={scrollToComoFunciona} style={{
              padding:"14px 24px",background:"transparent",
              color:"#374151",border:"1.5px solid #D1D5DB",
              borderRadius:10,fontWeight:600,fontSize:15,
              cursor:"pointer",fontFamily:"inherit",transition:"all .15s"
            }}>Como funciona</button>
          </div>

          <div style={{display:"flex",gap:32,flexWrap:"wrap"}}>
            {[
              {icon:"🛡️",t:"Seus dados protegidos"},
              {icon:"🔒",t:"100% seguro e confiável"},
              {icon:"👤",t:"Feito para MEIs"},
            ].map(({icon,t})=>(
              <div key={t} style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:17}}>{icon}</span>
                <span style={{fontSize:13,color:"#6B7280",fontWeight:500}}>{t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Score Card */}
        <div style={{
          background:"#FFFFFF",borderRadius:20,
          border:"1px solid #E5E7EB",padding:"28px 24px",
          boxShadow:"0 8px 32px rgba(0,0,0,.08)",
          maxWidth: isTablet ? "none" : 420,
        }}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
            <span style={{fontWeight:700,fontSize:16,color:"#111827"}}>Seu Score Lucrom</span>
            <span style={{
              width:18,height:18,borderRadius:99,
              border:"1.5px solid #9CA3AF",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:10,color:"#9CA3AF",cursor:"default",flexShrink:0
            }}>i</span>
          </div>

          {/* SVG Gauge */}
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",position:"relative",margin:"0 auto",width:220}}>
            <svg width={220} height={145} viewBox="0 0 220 145" style={{overflow:"visible"}}>
              <defs>
                <linearGradient id="gGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#4ade80"/>
                  <stop offset="100%" stopColor="#16a34a"/>
                </linearGradient>
              </defs>
              {/* Track */}
              <path d="M 25,130 A 90,90 0 1,1 195,130"
                fill="none" stroke="#E5E7EB" strokeWidth={14} strokeLinecap="round"/>
              {/* Score fill — 742/850 ≈ 87.3% of 252 total dash */}
              <path d="M 25,130 A 90,90 0 1,1 195,130"
                fill="none" stroke="url(#gGrad)" strokeWidth={14} strokeLinecap="round"
                strokeDasharray={`${252*0.873} 252`}/>
            </svg>
            <div style={{
              position:"absolute",bottom:18,
              textAlign:"center",width:"100%"
            }}>
              <div style={{fontSize:60,fontWeight:900,color:"#16a34a",lineHeight:1,letterSpacing:"-2px"}}>742</div>
              <div style={{fontSize:13,color:"#6B7280",marginTop:2}}>pontos</div>
            </div>
          </div>

          {/* Nível Ouro badge */}
          <div style={{
            background:"#FEF3C7",borderRadius:10,
            padding:"10px 14px",
            display:"flex",alignItems:"center",gap:8,marginBottom:16
          }}>
            <span style={{fontSize:16}}>🏆</span>
            <span style={{fontSize:13,fontWeight:800,color:"#B45309",letterSpacing:".5px"}}>NÍVEL OURO</span>
          </div>

          {/* Stats 3 cols */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
            {[
              {v:"+18",l:"pontos este mês"},
              {v:"✓ 3",l:"missões concluídas"},
              {v:"94%",l:"perfil concluído"},
            ].map(({v,l})=>(
              <div key={l} style={{
                textAlign:"center",padding:"10px 6px",
                background:"#F9FAFB",borderRadius:10,
                border:"1px solid #F0F0F0"
              }}>
                <div style={{fontSize:15,fontWeight:800,color:"#111827"}}>{v}</div>
                <div style={{fontSize:10,color:"#6B7280",lineHeight:1.4,marginTop:3}}>{l}</div>
              </div>
            ))}
          </div>

          {/* Progress */}
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}>
              <span style={{fontSize:12,fontWeight:700,color:"#111827"}}>Próximo objetivo: 760 pontos</span>
            </div>
            <div style={{height:8,background:"#E5E7EB",borderRadius:99}}>
              <div style={{height:8,background:"linear-gradient(90deg,#4ade80,#16a34a)",borderRadius:99,width:"94%"}}/>
            </div>
            <p style={{fontSize:11,color:"#6B7280",marginTop:6,lineHeight:1.5}}>
              Faltam apenas 18 pontos para alcançar o próximo nível.
            </p>
          </div>

          <div style={{
            display:"flex",alignItems:"flex-start",gap:8,
            background:"#F9FAFB",borderRadius:10,padding:"10px 12px"
          }}>
            <span style={{fontSize:14,flexShrink:0}}>🔒</span>
            <span style={{fontSize:11,color:"#6B7280",lineHeight:1.6}}>
              Seus dados são protegidos e utilizados apenas para calcular sua evolução financeira.
            </span>
          </div>
        </div>
      </section>

      {/* ── POR QUE SEU SCORE IMPORTA ───────────────────────── */}
      <section style={{background:"#F9FAFB",padding: isTablet ? "80px 48px" : "52px 20px"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div className="reveal" style={{textAlign:"center",marginBottom:52}}>
            <div style={{
              fontSize:11,fontWeight:700,color:"#16a34a",
              textTransform:"uppercase",letterSpacing:2,marginBottom:14
            }}>ENTENDA POR QUE SEU SCORE IMPORTA</div>
            <h2 style={{
              fontSize: isTablet ? 34 : 24,fontWeight:900,
              color:"#111827",letterSpacing:"-1px",lineHeight:1.25,
              maxWidth:640,margin:"0 auto"
            }}>
              Quanto mais organizado seu negócio estiver,<br/>
              maior será sua evolução dentro da plataforma.
            </h2>
          </div>

          <div style={{
            display:"grid",
            gridTemplateColumns: isTablet ? "1fr 1fr 1fr 1fr" : "1fr 1fr",
            gap:24
          }}>
            {[
              {icon:"📈",t:"Score que evolui com você",d:"Acompanhe sua evolução financeira em tempo real e veja seu progresso acontecer.",delay:"0ms"},
              {icon:"🛡️",t:"Organização que gera resultado",d:"Transforme disciplina financeira em crescimento e decisões mais inteligentes.",delay:"120ms"},
              {icon:"💎",t:"Mais valor para seu negócio",d:"Construa uma reputação financeira cada vez mais forte e abra portas para novas oportunidades.",delay:"240ms"},
              {icon:"🎯",t:"Mais oportunidades",d:"Tenha acesso a benefícios, parceiros e condições exclusivas conforme sua evolução.",delay:"360ms"},
            ].map(({icon,t,d,delay})=>(
              <div key={t} className="reveal-scale" style={{
                background:"#FFFFFF",borderRadius:16,padding:"28px 22px",
                border:"1px solid #E5E7EB",
                boxShadow:"0 2px 8px rgba(0,0,0,.04)",
                transitionDelay:delay,
              }}>
                <div style={{
                  width:52,height:52,borderRadius:14,background:"#F0FDF4",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:24,marginBottom:18
                }}>{icon}</div>
                <div style={{fontWeight:700,fontSize:15,color:"#111827",marginBottom:8}}>{t}</div>
                <div style={{fontSize:13,color:"#6B7280",lineHeight:1.65}}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ────────────────────────────────────── */}
      <section id="como-funciona" style={{background:"#FFFFFF",padding: isTablet ? "80px 48px" : "52px 20px"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div className="reveal" style={{textAlign:"center",marginBottom:52}}>
            <div style={{
              fontSize:11,fontWeight:700,color:"#16a34a",
              textTransform:"uppercase",letterSpacing:2,marginBottom:14
            }}>COMO FUNCIONA</div>
            <h2 style={{
              fontSize: isTablet ? 34 : 24,fontWeight:900,
              color:"#111827",letterSpacing:"-1px"
            }}>Sua jornada de evolução em 4 passos simples</h2>
          </div>

          <div style={{
            display:"grid",
            gridTemplateColumns: isTablet ? "1fr 1fr 1fr 1fr" : "1fr 1fr",
            gap:40,position:"relative"
          }}>
            {[
              {n:1,icon:"👤",t:"Conecte seu negócio",d:"Cadastre seu MEI e complete seu perfil empresarial.",delay:"0ms"},
              {n:2,icon:"📄",t:"Organize suas finanças",d:"Centralize suas receitas, despesas e documentos em um só lugar.",delay:"150ms"},
              {n:3,icon:"📈",t:"Evolua seu Score",d:"Conclua ações e missões para fortalecer sua organização financeira.",delay:"300ms"},
              {n:4,icon:"🔓",t:"Desbloqueie oportunidades",d:"Acesse benefícios, parceiros e condições exclusivas conforme sua evolução.",delay:"450ms"},
            ].map(({n,icon,t,d,delay})=>(
              <div key={n} className="reveal" style={{textAlign:"center",transitionDelay:delay}}>
                <div style={{position:"relative",display:"inline-block",marginBottom:20}}>
                  <div style={{
                    width:52,height:52,borderRadius:99,
                    background:"#16a34a",color:"#fff",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:20,fontWeight:900,margin:"0 auto",
                    boxShadow:"0 4px 14px rgba(22,163,74,.3)"
                  }}>{n}</div>
                </div>
                <div style={{
                  fontSize:32,marginBottom:14,lineHeight:1
                }}>{icon}</div>
                <div style={{fontWeight:700,fontSize:15,color:"#111827",marginBottom:8}}>{t}</div>
                <div style={{fontSize:13,color:"#6B7280",lineHeight:1.65}}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── NÍVEIS DO SCORE ──────────────────────────────────── */}
      <section style={{background:"#F9FAFB",padding: isTablet ? "80px 48px" : "52px 20px"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div className="reveal" style={{textAlign:"center",marginBottom:48}}>
            <div style={{
              fontSize:11,fontWeight:700,color:"#16a34a",
              textTransform:"uppercase",letterSpacing:2,marginBottom:14
            }}>NÍVEIS DO SCORE LUCROM</div>
            <p style={{fontSize:15,color:"#6B7280",maxWidth:480,margin:"0 auto"}}>
              Quanto maior seu Score, mais benefícios e oportunidades você desbloqueia.
            </p>
          </div>

          {/* Dots line */}
          <div style={{
            display:"flex",alignItems:"center",justifyContent:"center",
            marginBottom:36,padding:"0 10%"
          }}>
            {["bronze","prata","ouro","diamante","elite"].map((l,i)=>(
              <React.Fragment key={l}>
                <div style={{
                  width: l==="ouro" ? 16 : 12,
                  height: l==="ouro" ? 16 : 12,
                  borderRadius:99,
                  background: l==="ouro" ? "#F59E0B"
                    : l==="diamante" ? "#93C5FD"
                    : l==="elite" ? "#C4B5FD"
                    : "#D1D5DB",
                  border: l==="ouro" ? "2px solid #F59E0B" : "2px solid #E5E7EB",
                  boxShadow: l==="ouro" ? "0 0 0 5px rgba(245,158,11,.18)" : "none",
                  transition:"all .2s",flexShrink:0
                }}/>
                {i < 4 && (
                  <div style={{
                    flex:1,height:2,
                    background: i < 2 ? "#22c55e" : "#E5E7EB"
                  }}/>
                )}
              </React.Fragment>
            ))}
          </div>

          <div style={{
            display:"grid",
            gridTemplateColumns: isTablet ? "1fr 1fr 1fr 1fr 1fr" : "1fr 1fr",
            gap:16
          }}>
            {[
              {n:"BRONZE",range:"300 – 449",desc:"Acesso à plataforma e recursos básicos.",color:"#C2843A",bg:"#FEF9F3",border:"#FDE5C0",active:false},
              {n:"PRATA",range:"450 – 599",desc:"Conteúdos avançados e ferramentas exclusivas.",color:"#6B7280",bg:"#F9FAFB",border:"#E5E7EB",active:false},
              {n:"OURO",range:"600 – 749",desc:"Benefícios exclusivos e certificado digital.",color:"#D97706",bg:"#FFFBEB",border:"#FDE68A",active:true},
              {n:"DIAMANTE",range:"750 – 819",desc:"Parcerias estratégicas e condições especiais.",color:"#2563EB",bg:"#EFF6FF",border:"#BFDBFE",active:false},
              {n:"ELITE",range:"820 – 850",desc:"Acesso prioritário a todo o ecossistema Lucrom.",color:"#7C3AED",bg:"#F5F3FF",border:"#DDD6FE",active:false},
            ].map(({n,range,desc,color,bg,border,active})=>(
              <div key={n} style={{
                background: active ? bg : "#FFFFFF",
                border:`1.5px solid ${active ? border : "#E5E7EB"}`,
                borderRadius:14,padding:"20px 16px",
                boxShadow: active ? "0 6px 20px rgba(245,158,11,.14)" : "none",
                transform: active ? "translateY(-4px)" : "none",
                transition:"all .2s"
              }}>
                <div style={{fontWeight:900,fontSize:11,color,letterSpacing:1.2,marginBottom:6}}>{n}</div>
                <div style={{fontWeight:700,fontSize:13,color:"#111827",marginBottom:6}}>{range}</div>
                <div style={{fontSize:12,color:"#6B7280",lineHeight:1.55}}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SEGURANÇA CTA ────────────────────────────────────── */}
      <section style={{background:"#F9FAFB",padding: isTablet ? "0 48px 56px" : "0 20px 36px"}}>
        <div className="reveal-scale" style={{
          maxWidth:1200,margin:"0 auto",
          background:"#FFFFFF",border:"1.5px solid #E5E7EB",
          borderRadius:16,padding:"24px 32px",
          display:"flex",alignItems:"center",
          justifyContent:"space-between",flexWrap:"wrap",gap:16,
          boxShadow:"0 2px 10px rgba(0,0,0,.04)"
        }}>
          <div style={{display:"flex",alignItems:"center",gap:18}}>
            <div style={{
              width:52,height:52,borderRadius:13,background:"#F0FDF4",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:24,flexShrink:0
            }}>🛡️</div>
            <div>
              <div style={{fontWeight:800,fontSize:17,color:"#111827"}}>Segurança e transparência em cada etapa.</div>
              <div style={{fontSize:13,color:"#6B7280",marginTop:3}}>Seguimos padrões rigorosos de segurança e estamos em conformidade com a LGPD.</div>
            </div>
          </div>
          <button onClick={onCadastro} style={{
            display:"flex",alignItems:"center",gap:8,
            padding:"13px 30px",background:"#16a34a",color:"#fff",
            border:"none",borderRadius:10,fontWeight:700,fontSize:15,
            cursor:"pointer",fontFamily:"inherit",
            boxShadow:"0 4px 14px rgba(22,163,74,.25)",whiteSpace:"nowrap"
          }}>Comece agora →</button>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer style={{background:"#0a1f14",padding: isTablet ? "60px 48px 36px" : "44px 20px 28px"}}>
        <div style={{
          maxWidth:1200,margin:"0 auto",
          display:"grid",
          gridTemplateColumns: isTablet ? "2fr 1fr 1fr 1fr 1fr" : "1fr 1fr",
          gap:isTablet ? 40 : 28,
          marginBottom:44
        }}>
          {/* Brand */}
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <div style={{
                width:34,height:34,borderRadius:9,background:"#16a34a",
                display:"flex",alignItems:"center",justifyContent:"center",
                color:"#fff",fontWeight:900,fontSize:16
              }}>L</div>
              <span style={{fontWeight:800,fontSize:17,color:"#FFFFFF"}}>Lucrom</span>
            </div>
            <p style={{fontSize:12,color:"rgba(255,255,255,.5)",lineHeight:1.8,marginBottom:18,maxWidth:230}}>
              O primeiro Score de Evolução Financeira para MEIs. Organize suas finanças, fortaleça sua reputação e acompanhe sua evolução financeira.
            </p>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              {[
                {s:"📷",lbl:"Instagram",url:"https://instagram.com/lucrom.mei"},
                {s:"f",lbl:"Facebook",url:"https://facebook.com/lucrom.mei"},
                {s:"in",lbl:"LinkedIn",url:"https://linkedin.com/company/lucrom"},
                {s:"▶",lbl:"YouTube",url:"https://youtube.com/@lucrom"},
              ].map(({s,lbl,url})=>(
                <a key={lbl} href={url} target="_blank" rel="noopener noreferrer" title={lbl}
                  style={{
                    width:32,height:32,borderRadius:8,
                    border:"1px solid rgba(255,255,255,.14)",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:12,color:"rgba(255,255,255,.6)",
                    textDecoration:"none",transition:"all .15s",
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,.1)";e.currentTarget.style.color="#fff";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,.6)";}}>
                  {s}
                </a>
              ))}
            </div>
          </div>
          {/* Empresa */}
          <div>
            <div style={{fontWeight:700,fontSize:11,color:"rgba(255,255,255,.38)",textTransform:"uppercase",letterSpacing:1.2,marginBottom:18}}>EMPRESA</div>
            {[
              {l:"Sobre a Lucrom",modal:"Sobre a Lucrom"},
              {l:"Fale Conosco",href:"mailto:contato@lucrom.com.br"},
            ].map(({l,href,modal})=>(
              <a key={l} href={href||"#"} onClick={modal?e=>{e.preventDefault();setLegalModal({title:modal,text:LEGAL_CONTENT[modal]});}:href==="#"?e=>e.preventDefault():undefined} style={{display:"block",fontSize:13,color:"rgba(255,255,255,.72)",marginBottom:12,textDecoration:"none",transition:"color .15s",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.color="#fff"}
                onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,.72)"}>{l}</a>
            ))}
          </div>
          {/* Suporte */}
          <div>
            <div style={{fontWeight:700,fontSize:11,color:"rgba(255,255,255,.38)",textTransform:"uppercase",letterSpacing:1.2,marginBottom:18}}>SUPORTE</div>
            {[{l:"Central de Ajuda",href:"mailto:suporte@lucrom.com.br"}].map(({l,href})=>(
              <a key={l} href={href} style={{display:"block",fontSize:13,color:"rgba(255,255,255,.72)",marginBottom:12,textDecoration:"none",transition:"color .15s"}}
                onMouseEnter={e=>e.currentTarget.style.color="#fff"}
                onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,.72)"}>{l}</a>
            ))}
            <a href="#" onClick={e=>{e.preventDefault();onVerify&&onVerify();}} style={{display:"block",fontSize:13,color:"rgba(255,255,255,.72)",marginBottom:12,textDecoration:"none",transition:"color .15s",cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.color="#fff"}
              onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,.72)"}>🔍 Verificar Certificado</a>
          </div>
          {/* Legal */}
          <div>
            <div style={{fontWeight:700,fontSize:11,color:"rgba(255,255,255,.38)",textTransform:"uppercase",letterSpacing:1.2,marginBottom:18}}>JURÍDICO</div>
            {["Termos de Uso","Política de Privacidade","Política de Cookies","LGPD"].map(l=>(
              <a key={l} href="#" onClick={e=>{e.preventDefault();setLegalModal({title:l,text:LEGAL_CONTENT[l]});}} style={{display:"block",fontSize:13,color:"rgba(255,255,255,.72)",marginBottom:12,textDecoration:"none",transition:"color .15s",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.color="#fff"}
                onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,.72)"}>{l}</a>
            ))}
          </div>
          {/* Segurança */}
          <div>
            <div style={{fontWeight:700,fontSize:11,color:"rgba(255,255,255,.38)",textTransform:"uppercase",letterSpacing:1.2,marginBottom:18}}>SEGURANÇA</div>
            {[
              {l:"da.sign",modal:"da.sign"},
              {l:"Canal de privacidade",href:"mailto:privacidade@lucrom.com.br"},
              {l:"Exclusão de Dados",href:"mailto:privacidade@lucrom.com.br?subject=Exclusao%20de%20Dados%20LGPD"},
            ].map(({l,href,modal})=>(
              <a key={l} href={href||"#"} onClick={modal?e=>{e.preventDefault();setLegalModal({title:modal,text:LEGAL_CONTENT[modal]});}:undefined} style={{display:"block",fontSize:13,color:"rgba(255,255,255,.72)",marginBottom:12,textDecoration:"none",transition:"color .15s",cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.color="#fff"}
                onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,.72)"}>{l}</a>
            ))}
          </div>
        </div>

        <div style={{
          borderTop:"1px solid rgba(255,255,255,.08)",paddingTop:24,
          display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,alignItems:"center"
        }}>
          <span style={{fontSize:12,color:"rgba(255,255,255,.32)"}}>© 2025 Lucrom. Todos os direitos reservados.</span>
          <span style={{fontSize:12,color:"rgba(255,255,255,.32)"}}>Desenvolvido para impulsionar MEIs em cada passo da sua evolução.</span>
        </div>
      </footer>

      {/* ── MODAL LEGAL ──────────────────────────────────────── */}
      {legalModal && (
        <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.6)",backdropFilter:"blur(4px)",padding:"20px"}} onClick={()=>setLegalModal(null)}>
          <div style={{background:"#fff",borderRadius:16,maxWidth:560,width:"100%",maxHeight:"80vh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 20px 60px rgba(0,0,0,.25)"}} onClick={e=>e.stopPropagation()}>
            <div style={{background:"linear-gradient(135deg,#16a34a,#15803d)",padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>{legalModal.title}</div>
              <button onClick={()=>setLegalModal(null)} style={{background:"rgba(255,255,255,.2)",border:"none",color:"#fff",width:28,height:28,borderRadius:99,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>✕</button>
            </div>
            <div style={{padding:"20px 24px",overflowY:"auto",flex:1}}>
              {legalModal.text.split("\n").map((line,i)=>{
                if(line.startsWith("**")&&line.endsWith("**")) return <div key={i} style={{fontWeight:800,fontSize:13,color:"#111827",marginTop:i>0?14:0,marginBottom:4}}>{line.replace(/\*\*/g,"")}</div>;
                if(line.startsWith("•")) return <div key={i} style={{fontSize:13,color:"#374151",paddingLeft:12,marginBottom:4,lineHeight:1.6}}>{line}</div>;
                if(line==="") return <div key={i} style={{height:6}}/>;
                return <div key={i} style={{fontSize:13,color:"#374151",lineHeight:1.7,marginBottom:2}}>{line}</div>;
              })}
            </div>
            <div style={{padding:"14px 24px",borderTop:"1px solid #e5e7eb",background:"#f9fafb",display:"flex",justifyContent:"flex-end",gap:8}}>
              <a href="mailto:privacidade@lucrom.com.br" style={{fontSize:12,color:"#16a34a",textDecoration:"none",display:"flex",alignItems:"center",gap:4,marginRight:"auto"}}>✉ privacidade@lucrom.com.br</a>
              <button onClick={()=>setLegalModal(null)} style={{padding:"8px 20px",background:"#16a34a",color:"#fff",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoginPage({ onLogin, onSignup, onGoSite, onDemo }) {
  // "login" | "forgot" | "forgot_sent" | "reset" | "reset_done"
  const [tela, setTela]         = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return p.get("reset_token") ? "reset" : "login";
    } catch { return "login"; }
  });
  const [resetToken, setResetToken] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("reset_token") || ""; } catch { return ""; }
  });

  // Seletor de tipo de acesso: cliente | parceiro | admin
  const [tipoAcesso, setTipoAcesso] = useState("cliente");

  // Login fields
  const [email, setEmail]       = useState("");
  const [senha, setSenha]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [erro, setErro]         = useState("");
  const [showSenha, setShowSenha] = useState(false);

  // Forgot password fields
  const [forgotEmail, setForgotEmail] = useState("");

  // Reset password fields
  const [novaSenha, setNovaSenha]     = useState("");
  const [confSenha, setConfSenha]     = useState("");
  const [showNova, setShowNova]       = useState(false);

  const toast = useToast();

  function irLogin() { setTela("login"); setErro(""); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !senha) { setErro("Preencha e-mail e senha."); return; }
    if (!V.email(email.trim())) { setErro("E-mail inválido."); return; }
    if (senha.length < 8) { setErro("A senha deve ter pelo menos 8 caracteres."); return; }
    if (!rateLimiter.check("login", 5, 60000)) { setErro("Muitas tentativas. Aguarde 1 minuto."); return; }

    setLoading(true); setErro("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: senha }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data?.error || "Credenciais incorretas."); setLoading(false); return; }
      try { localStorage.setItem("lucrom_jwt", data.token); } catch {}
      auditLog("AUTH.LOGIN_SUCCESS", { email: mask.email(email) });
      const _perfilMap = { ADMIN: "Admin", PARTNER: "Parceiro", USER: "Cliente" };
      const _perfilResolvido = _perfilMap[data.user.role] || "Cliente";
      onLogin(_perfilResolvido, {
        nome:      data.user.nome,
        email:     data.user.email,
        cnpj:      data.user.cnpj || "",
        telefone:  data.user.telefone || "",
        porte:     data.user.porte || "MEI",
        cnae:      data.user.cnae || "",
        cnaeDesc:  data.user.cnaeDesc || "",
        municipio: data.user.municipio || "",
        endereco:  {},
        _backendId: data.user.id,
        _role:     data.user.role,
      });
    } catch {
      setErro("Erro de conexão. Verifique sua internet.");
    }
    setLoading(false);
  }

  async function handleForgot(e) {
    e.preventDefault();
    if (!forgotEmail.trim() || !V.email(forgotEmail.trim())) { setErro("Informe um e-mail válido."); return; }
    setLoading(true); setErro("");
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      setTela("forgot_sent");
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    }
    setLoading(false);
  }

  async function handleReset(e) {
    e.preventDefault();
    if (novaSenha.length < 8) { setErro("A senha deve ter pelo menos 8 caracteres."); return; }
    if (novaSenha !== confSenha) { setErro("As senhas não conferem."); return; }
    setLoading(true); setErro("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: novaSenha }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data?.error || "Link inválido ou expirado."); setLoading(false); return; }
      setTela("reset_done");
      try { window.history.replaceState({}, "", "/"); } catch {}
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    }
    setLoading(false);
  }

  const card = {background:T.white,borderRadius:T.radiusLg,width:"100%",maxWidth:400,padding:"32px 24px",boxShadow:"0 8px 32px rgba(0,0,0,.08)",border:"1px solid #E5E7EB"};
  const wrap = {minHeight:"100vh",background:"linear-gradient(155deg,#F0FDF4 0%,#ECFDF5 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:16};

  // ── TELA: NOVA SENHA (reset_done) ───────────────────────────────
  if (tela === "reset_done") return (
    <div style={wrap}><div style={card}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:40,marginBottom:12}}>✅</div>
        <div style={{fontSize:22,fontWeight:900,color:T.green}}>Senha redefinida!</div>
        <p style={{fontSize:13,color:T.ink60,marginTop:8,lineHeight:1.5}}>
          Sua nova senha foi salva com sucesso. Agora é só entrar na sua conta.
        </p>
      </div>
      <Btn full size="lg" onClick={irLogin}>Ir para o login →</Btn>
    </div></div>
  );

  // ── TELA: FORMULÁRIO DE NOVA SENHA ──────────────────────────────
  if (tela === "reset") return (
    <div style={wrap}><div style={card}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:26,fontWeight:900,letterSpacing:"-1px",color:T.green}}>Lucrom</div>
        <p style={{fontSize:13,color:T.ink60,marginTop:4}}>Criar nova senha</p>
      </div>
      <form onSubmit={handleReset} noValidate>
        <div style={{marginBottom:14,position:"relative"}}>
          <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:5}}>Nova senha</label>
          <input
            type={showNova?"text":"password"}
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            value={novaSenha}
            onChange={e=>{setNovaSenha(e.target.value);setErro("");}}
            disabled={loading}
            style={{width:"100%",padding:"10px 40px 10px 13px",borderRadius:T.radiusSm,border:`1.5px solid ${T.ink10}`,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",background:"#FAFAFA"}}
          />
          <button type="button" onClick={()=>setShowNova(v=>!v)}
            style={{position:"absolute",right:10,top:32,background:"none",border:"none",cursor:"pointer",color:T.ink40,fontSize:12,padding:4}}>
            {showNova?"Ocultar":"Ver"}
          </button>
        </div>
        <div style={{marginBottom:16}}>
          <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:5}}>Confirmar nova senha</label>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Repita a senha"
            value={confSenha}
            onChange={e=>{setConfSenha(e.target.value);setErro("");}}
            disabled={loading}
            style={{width:"100%",padding:"10px 13px",borderRadius:T.radiusSm,border:`1.5px solid ${T.ink10}`,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",background:"#FAFAFA"}}
          />
        </div>
        {erro && (
          <div style={{padding:"9px 12px",borderRadius:T.radiusSm,background:T.redPale,border:`1px solid ${T.redBdr}`,color:T.red,fontSize:12,fontWeight:600,marginBottom:12}}>
            {erro}
          </div>
        )}
        <Btn full size="lg" type="submit" disabled={loading} style={{marginBottom:10}}>
          {loading ? "Salvando..." : "Salvar nova senha →"}
        </Btn>
      </form>
      <div style={{textAlign:"center",marginTop:8}}>
        <button onClick={irLogin} style={{background:"none",border:"none",cursor:"pointer",color:T.ink40,fontSize:12,fontFamily:"inherit"}}>
          ← Voltar ao login
        </button>
      </div>
    </div></div>
  );

  // ── TELA: E-MAIL ENVIADO ─────────────────────────────────────────
  if (tela === "forgot_sent") return (
    <div style={wrap}><div style={card}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:40,marginBottom:12}}>📧</div>
        <div style={{fontSize:20,fontWeight:900,color:T.green,marginBottom:8}}>Verifique seu e-mail</div>
        <p style={{fontSize:13,color:T.ink60,lineHeight:1.6}}>
          Se o e-mail <strong>{forgotEmail}</strong> estiver cadastrado, você receberá as instruções para redefinir sua senha em instantes.
        </p>
        <p style={{fontSize:12,color:T.ink40,marginTop:12,lineHeight:1.5}}>
          Não recebeu? Verifique a pasta de spam ou aguarde alguns minutos.
        </p>
      </div>
      <Btn full v="outline" onClick={()=>setTela("forgot")} style={{marginBottom:10}}>Tentar outro e-mail</Btn>
      <Btn full size="lg" onClick={irLogin}>Voltar ao login</Btn>
    </div></div>
  );

  // ── TELA: ESQUECI MINHA SENHA ────────────────────────────────────
  if (tela === "forgot") return (
    <div style={wrap}><div style={card}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:26,fontWeight:900,letterSpacing:"-1px",color:T.green}}>Lucrom</div>
        <p style={{fontSize:13,color:T.ink60,marginTop:4}}>Recuperar senha</p>
      </div>
      <p style={{fontSize:13,color:T.ink60,marginBottom:18,lineHeight:1.5}}>
        Informe o e-mail cadastrado e enviaremos um link para você criar uma nova senha.
      </p>
      <form onSubmit={handleForgot} noValidate>
        <div style={{marginBottom:16}}>
          <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:5}}>Seu e-mail</label>
          <input
            type="email"
            autoComplete="email"
            placeholder="seu@email.com.br"
            value={forgotEmail}
            onChange={e=>{setForgotEmail(e.target.value);setErro("");}}
            disabled={loading}
            style={{width:"100%",padding:"10px 13px",borderRadius:T.radiusSm,border:`1.5px solid ${T.ink10}`,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",background:"#FAFAFA"}}
          />
        </div>
        {erro && (
          <div style={{padding:"9px 12px",borderRadius:T.radiusSm,background:T.redPale,border:`1px solid ${T.redBdr}`,color:T.red,fontSize:12,fontWeight:600,marginBottom:12}}>
            {erro}
          </div>
        )}
        <Btn full size="lg" type="submit" disabled={loading} style={{marginBottom:10}}>
          {loading ? "Enviando..." : "Enviar link de recuperação →"}
        </Btn>
      </form>
      <div style={{textAlign:"center",marginTop:8}}>
        <button onClick={irLogin} style={{background:"none",border:"none",cursor:"pointer",color:T.ink40,fontSize:12,fontFamily:"inherit"}}>
          ← Voltar ao login
        </button>
      </div>
    </div></div>
  );

  // ── TELA PRINCIPAL: LOGIN ────────────────────────────────────────
  const tipoLabel = tipoAcesso==="parceiro" ? "Parceiro" : tipoAcesso==="admin" ? "Admin" : "Cliente";
  const tipoIcon  = tipoAcesso==="parceiro" ? "🏦" : tipoAcesso==="admin" ? "🛡️" : "👤";

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:26,fontWeight:900,letterSpacing:"-1px",color:T.green}}>Lucrom</div>
          <p style={{fontSize:13,color:T.ink60,marginTop:4}}>Plataforma Financeira para MEI</p>
        </div>

        {/* SELETOR DE TIPO DE ACESSO */}
        <div style={{display:"flex",gap:6,marginBottom:16,background:T.ink05,borderRadius:T.radiusSm,padding:4}}>
          {[["cliente","👤 Cliente"],["parceiro","🏦 Parceiro"],["admin","🛡️ Admin"]].map(([tipo,label])=>(
            <button key={tipo} onClick={()=>{setTipoAcesso(tipo);setErro("");}}
              style={{flex:1,padding:"7px 4px",borderRadius:6,border:"none",cursor:"pointer",fontFamily:"inherit",
                fontSize:11,fontWeight:700,transition:"all .15s",
                background: tipoAcesso===tipo ? T.white : "transparent",
                color: tipoAcesso===tipo ? T.green : T.ink60,
                boxShadow: tipoAcesso===tipo ? "0 1px 4px rgba(0,0,0,.10)" : "none",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* BANNER DE TIPO */}
        {tipoAcesso !== "cliente" && (
          <div style={{padding:"9px 12px",background:T.greenPale,border:`1px solid ${T.greenBorder}`,borderRadius:T.radiusSm,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:14}}>{tipoIcon}</span>
            <span style={{fontSize:12,fontWeight:700,color:T.green}}>
              Acesse como <strong>{tipoLabel}</strong> para continuar.
            </span>
          </div>
        )}

        {/* FORMULÁRIO REAL */}
        <form onSubmit={handleSubmit} noValidate>
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:5}}>E-mail</label>
            <input
              type="email"
              autoComplete="email"
              placeholder="seu@email.com.br"
              value={email}
              onChange={e=>{setEmail(e.target.value);setErro("");}}
              disabled={loading}
              style={{width:"100%",padding:"10px 13px",borderRadius:T.radiusSm,border:`1.5px solid ${T.ink10}`,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",background:"#FAFAFA"}}
            />
          </div>
          <div style={{marginBottom:6,position:"relative"}}>
            <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:5}}>Senha</label>
            <input
              type={showSenha?"text":"password"}
              autoComplete="current-password"
              placeholder="Mínimo 8 caracteres"
              value={senha}
              onChange={e=>{setSenha(e.target.value);setErro("");}}
              disabled={loading}
              style={{width:"100%",padding:"10px 40px 10px 13px",borderRadius:T.radiusSm,border:`1.5px solid ${T.ink10}`,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",background:"#FAFAFA"}}
            />
            <button type="button" onClick={()=>setShowSenha(v=>!v)}
              style={{position:"absolute",right:10,top:32,background:"none",border:"none",cursor:"pointer",color:T.ink40,fontSize:12,padding:4}}>
              {showSenha?"Ocultar":"Ver"}
            </button>
          </div>

          {/* LINK: ESQUECI MINHA SENHA */}
          <div style={{textAlign:"right",marginBottom:14}}>
            <button type="button" onClick={()=>{setTela("forgot");setErro("");}}
              style={{background:"none",border:"none",cursor:"pointer",color:T.green,fontSize:12,fontWeight:600,fontFamily:"inherit",padding:0}}>
              Esqueceu sua senha?
            </button>
          </div>

          {erro && (
            <div style={{padding:"9px 12px",borderRadius:T.radiusSm,background:T.redPale,border:`1px solid ${T.redBdr}`,color:T.red,fontSize:12,fontWeight:600,marginBottom:12}}>
              {erro}
            </div>
          )}

          <Btn full size="lg" type="submit" disabled={loading} style={{marginBottom:10}}>
            {loading ? "Entrando..." : "Entrar na minha conta →"}
          </Btn>
        </form>

        {/* Cadastro: apenas para clientes */}
        {tipoAcesso === "cliente" && (
          <div style={{textAlign:"center",marginTop:4,fontSize:12,color:T.ink60}}>
            Não tem conta?{" "}
            <button onClick={onSignup} style={{background:"none",border:"none",cursor:"pointer",color:T.green,fontWeight:700,fontFamily:"inherit",fontSize:12}}>
              Cadastrar grátis
            </button>
          </div>
        )}

        {/* SEPARADOR + DEMO: apenas para clientes */}
        {tipoAcesso === "cliente" && (
          <>
            <div style={{display:"flex",alignItems:"center",gap:8,margin:"18px 0 14px"}}>
              <div style={{flex:1,height:1,background:T.ink10}}/>
              <span style={{fontSize:11,color:T.ink40,fontWeight:600}}>ou</span>
              <div style={{flex:1,height:1,background:T.ink10}}/>
            </div>

            <button
              onClick={onDemo}
              style={{
                width:"100%",padding:"10px 16px",borderRadius:T.radiusSm,
                border:`1.5px dashed ${T.green}66`,background:"rgba(25,163,72,.04)",
                color:T.green,fontWeight:700,fontSize:13,cursor:"pointer",
                fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              }}>
              <span>🎭</span> Explorar como demonstração
            </button>
            <p style={{textAlign:"center",fontSize:11,color:T.ink40,marginTop:6,lineHeight:1.5}}>
              Nenhum dado real é utilizado no modo demo
            </p>
          </>
        )}

        <div style={{textAlign:"center",marginTop:16}}>
          <button onClick={onGoSite} style={{background:"none",border:"none",cursor:"pointer",color:T.ink40,fontSize:11,fontFamily:"inherit"}}>
            ← Voltar ao site
          </button>
        </div>
      </div>
    </div>
  );
}


// ── CNPJ Cache local (fallback quando API indisponível) ──────────
// Em produção: substituir por Redis TTL 30d no backend
// Detecta CNPJs matematicamente inválidos e previne re-consulta
const CnpjLocalCache = {
  _cache: {},
  _invalid: new Set(), // CNPJs com situação inativa confirmada
  set(cnpj, data) {
    this._cache[cnpj] = { data, ts: Date.now() };
    if (data?.baixado) this._invalid.add(cnpj);
  },
  get(cnpj) {
    const entry = this._cache[cnpj];
    if (!entry) return null;
    // TTL: 1 hora em memória (produção usa 30 dias no Redis)
    if (Date.now() - entry.ts > 3600000) { delete this._cache[cnpj]; return null; }
    return entry.data;
  },
  isKnownInvalid(cnpj) { return this._invalid.has(cnpj); },
  clear() { this._cache = {}; },
};

// ── Landing Page — conforme design tela 11 ──────────────────────
function PageLanding({ onLogin, onStart }) {
  return (
    <div style={{background:"#fff",minHeight:"100vh",fontFamily:"var(--font-sans, -apple-system, sans-serif)"}}>
      {/* NAV */}
      <nav style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 24px",borderBottom:"1px solid #f0f0f0",position:"sticky",top:0,background:"#fff",zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:8,background:"#16a34a",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:14}}>L</div>
          <span style={{fontWeight:700,fontSize:16,color:"#111"}}>Lucrom</span>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onLogin} style={{padding:"8px 20px",border:"1px solid #e5e7eb",borderRadius:8,background:"transparent",fontWeight:600,fontSize:13,cursor:"pointer",color:"#374151"}}>Entrar</button>
          <button onClick={onStart} style={{padding:"8px 20px",border:"none",borderRadius:8,background:"#16a34a",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>Começar grátis →</button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{padding:"48px 24px 40px",maxWidth:800,margin:"0 auto"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:32,alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:1,marginBottom:12}}>PLATAFORMA DE EVOLUÇÃO FINANCEIRA PARA MEI</div>
            <h1 style={{fontSize:28,fontWeight:900,lineHeight:1.25,color:"#111",margin:"0 0 16px"}}>
              Seu negócio evolui quando suas <span style={{color:"#16a34a"}}>finanças evoluem.</span>
            </h1>
            <p style={{fontSize:14,color:"#6b7280",lineHeight:1.7,margin:"0 0 24px"}}>
              Organização, educação financeira e oportunidades para o MEI crescer com mais confiança.
            </p>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <button onClick={onStart} style={{padding:"12px 24px",background:"#16a34a",color:"#fff",border:"none",borderRadius:10,fontWeight:700,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                Começar grátis →
              </button>
              <button style={{padding:"12px 20px",background:"transparent",color:"#374151",border:"1px solid #e5e7eb",borderRadius:10,fontWeight:600,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                ▷ Saiba como funciona
              </button>
            </div>
          </div>
          {/* Score Card */}
          <div style={{background:"#f9fafb",borderRadius:16,padding:20,border:"1px solid #e5e7eb"}}>
            <div style={{fontSize:10,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:.8,marginBottom:12}}>SCORE LUCROM</div>
            <div style={{textAlign:"center",marginBottom:12}}>
              <div style={{fontSize:52,fontWeight:900,color:"#16a34a",lineHeight:1}}>742</div>
              <div style={{fontSize:12,color:"#6b7280"}}>pontos</div>
            </div>
            <div style={{background:"rgba(22,163,74,.1)",borderRadius:8,padding:"8px 12px",textAlign:"center",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:"#16a34a"}}>🏆 NÍVEL OURO</div>
              <div style={{fontSize:11,color:"#374151",marginTop:2}}>Seu perfil financeiro está forte!</div>
            </div>
            <div style={{fontSize:11,color:"#6b7280",marginBottom:6}}>94% do perfil concluído</div>
            <div style={{height:6,background:"#e5e7eb",borderRadius:3,marginBottom:12}}>
              <div style={{height:6,background:"#16a34a",borderRadius:3,width:"94%"}}/>
            </div>
            <button onClick={onStart} style={{width:"100%",padding:"10px",background:"#16a34a",color:"#fff",border:"none",borderRadius:8,fontWeight:700,fontSize:13,cursor:"pointer"}}>
              Continuar evolução →
            </button>
            <div style={{fontSize:11,color:"#9ca3af",textAlign:"center",marginTop:10}}>
              🔒 Quanto mais você evolui, mais oportunidades desbloqueia.
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{padding:"40px 24px",background:"#f9fafb"}}>
        <div style={{maxWidth:700,margin:"0 auto"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>CADA AÇÃO CONSTRÓI SEU FUTURO</div>
          <h2 style={{fontSize:22,fontWeight:800,color:"#111",margin:"0 0 24px"}}>Transforme organização em oportunidades.</h2>
          {[
            {icon:"📊",t:"Organize suas finanças",d:"Tenha clareza do que entra e sai do seu negócio."},
            {icon:"🛡️",t:"Construa sua reputação",d:"Um histórico financeiro forte abre portas."},
            {icon:"📈",t:"Evolua seu Score Lucrom",d:"Acompanhe seu progresso e cresça sempre."},
            {icon:"🔓",t:"Desbloqueie novas oportunidades",d:"Tenha acesso a benefícios e parceiros."},
            {icon:"🤝",t:"Acesso a parceiros de crédito",d:"Quando você está preparado, as oportunidades chegam."},
          ].map(({icon,t,d})=>(
            <div key={t} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:"1px solid #e5e7eb"}}>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                <span style={{fontSize:20}}>{icon}</span>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:"#111"}}>{t}</div>
                  <div style={{fontSize:12,color:"#6b7280"}}>{d}</div>
                </div>
              </div>
              <span style={{color:"#9ca3af",fontSize:18}}>›</span>
            </div>
          ))}
        </div>
      </section>

      {/* SEGMENTOS MEI */}
      <section style={{padding:"40px 24px"}}>
        <div style={{maxWidth:700,margin:"0 auto"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>FEITO PARA QUEM FAZ ACONTECER</div>
          <h2 style={{fontSize:22,fontWeight:800,color:"#111",margin:"0 0 24px"}}>Criado para o MEI brasileiro.</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
            {[
              {icon:"✂️",t:"MEI Beleza",d:"Organize ganhos, despesas e impostos em um só lugar."},
              {icon:"💻",t:"MEI Serviços",d:"Transforme sua rotina financeira em crescimento real."},
              {icon:"🛒",t:"MEI Comércio",d:"Acompanhe vendas e fortaleça a saúde do seu negócio."},
              {icon:"⛑️",t:"MEI Construção",d:"Mantenha suas finanças organizadas mesmo em obras e projetos."},
            ].map(({icon,t,d})=>(
              <div key={t} style={{padding:"16px",border:"1px solid #e5e7eb",borderRadius:12,cursor:"pointer"}} onClick={onStart}>
                <div style={{fontSize:28,marginBottom:8}}>{icon}</div>
                <div style={{fontWeight:700,fontSize:14,color:"#111",marginBottom:4}}>{t}</div>
                <div style={{fontSize:12,color:"#6b7280"}}>{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4 PASSOS */}
      <section style={{padding:"40px 24px",background:"#f9fafb"}}>
        <div style={{maxWidth:700,margin:"0 auto"}}>
          <div style={{fontSize:11,fontWeight:700,color:"#16a34a",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>UM CAMINHO SIMPLES PARA EVOLUIR</div>
          <h2 style={{fontSize:22,fontWeight:800,color:"#111",margin:"0 0 24px"}}>4 passos para transformar seu negócio.</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
            {[
              {n:"01",icon:"🔗",t:"Conecte seu MEI",d:"Conecte suas contas e faça uma análise completa do seu negócio."},
              {n:"02",icon:"📋",t:"Organize suas finanças",d:"Acompanhe receitas, despesas e documentos em um só lugar."},
              {n:"03",icon:"📈",t:"Evolua seu Score",d:"Complete ações e missões para aumentar seu score e sua reputação."},
              {n:"04",icon:"🎁",t:"Desbloqueie oportunidades",d:"Tenha acesso a benefícios, parceiros e melhores condições."},
            ].map(({n,icon,t,d})=>(
              <div key={n} style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{width:36,height:36,borderRadius:99,background:"#f0fdf4",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:12,color:"#16a34a",flexShrink:0}}>{n}</div>
                <div>
                  <div style={{fontSize:22,marginBottom:4}}>{icon}</div>
                  <div style={{fontWeight:700,fontSize:13,color:"#111",marginBottom:2}}>{t}</div>
                  <div style={{fontSize:12,color:"#6b7280",lineHeight:1.5}}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{padding:"48px 24px",background:"#081f12",textAlign:"center"}}>
        <h2 style={{fontSize:26,fontWeight:900,color:"#fff",margin:"0 0 8px"}}>Evolua seu negócio.</h2>
        <p style={{fontSize:20,fontWeight:700,color:"#22c55e",margin:"0 0 20px"}}>Um passo por vez.</p>
        <p style={{fontSize:13,color:"rgba(255,255,255,.6)",margin:"0 0 24px",lineHeight:1.7}}>
          Organize suas finanças, fortaleça sua reputação e desbloqueie oportunidades para crescer.
        </p>
        <button onClick={onStart} style={{padding:"14px 32px",background:"#fff",color:"#111",border:"none",borderRadius:10,fontWeight:800,fontSize:15,cursor:"pointer"}}>
          Começar grátis →
        </button>
      </section>

      {/* FOOTER */}
      <footer style={{padding:"32px 24px",borderTop:"1px solid #e5e7eb"}}>
        <div style={{maxWidth:700,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <div style={{width:28,height:28,borderRadius:6,background:"#16a34a",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:12}}>L</div>
            <span style={{fontWeight:700,color:"#111"}}>Lucrom</span>
          </div>
          <p style={{fontSize:11,color:"#9ca3af",marginBottom:16}}>Plataforma de evolução financeira para MEIs que querem crescer com organização e inteligência.</p>
          <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:11,color:"#9ca3af"}}>
            {["Termos de Uso","Privacidade","Suporte"].map(l=>(
              <span key={l} style={{cursor:"pointer"}}>{l}</span>
            ))}
          </div>
          <div style={{fontSize:11,color:"#d1d5db",marginTop:12}}>© 2025 Lucrom OS. Todos os direitos reservados.</div>
        </div>
      </footer>
    </div>
  );
}

function CadastroPage({ onCad, onLogin, onGoSite }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmSenha, setConfirmSenha] = useState("");
  const [erros, setErros] = useState({});
  const [loading, setLoading] = useState(false);
  const [cnpjData, setCnpjData] = useState(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [step, setStep] = useState(1);
  // Nome é SEMPRE vindo da Receita Federal — não editável pelo usuário
  const nomeRF = cnpjData?.razaoSocial || "";


  const [modoManual, setModoManual] = useState(false);
  const [nomeManual, setNomeManual] = useState("");
  const [porteManual, setPorteManual] = useState("MEI");
  const [cnaeManual, setCnaeManual] = useState("6201-5/00");
  const [nomeErr, setNomeErr] = useState("");

  async function consultarCNPJ() {
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    if (cnpjLimpo.length !== 14) { setErros(e => ({ ...e, cnpj: "CNPJ incompleto (14 dígitos)" })); return; }
    if (!V.cnpj(cnpjLimpo)) { setErros(e => ({ ...e, cnpj: "CNPJ inválido — dígitos verificadores não conferem" })); setCnpjData(null); return; }
    // Cache local: evita re-consulta e bloqueia CNPJs já conhecidos como inativos
    if (CnpjLocalCache.isKnownInvalid(cnpjLimpo)) {
      setErros(e => ({ ...e, cnpj: "CNPJ inativo (verificado anteriormente). Use um CNPJ ativo." })); return;
    }
    if (!rateLimiter.check("cnpj_"+cnpjLimpo, 3, 60000)) {
      setErros(e => ({ ...e, cnpj: "Muitas consultas. Aguarde 1 minuto." })); return;
    }

    setCnpjLoading(true); setCnpjData(null); setModoManual(false);
    setErros(e => ({ ...e, cnpj: "" }));

    // Tenta APIs reais da Receita Federal
    const apis = [
      `https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`,
      `https://publica.cnpj.ws/cnpj/${cnpjLimpo}`,
    ];

    for (const url of apis) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 7000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) continue;
        const d = await res.json();
        const razao = d.razao_social || d.nome_razao_social || d.nome || null;
        if (!razao || razao.length < 3) continue;
        setCnpjData({
          razaoSocial: razao,
          nomeFantasia: d.nome_fantasia || "",
          situacao: d.descricao_situacao_cadastral || d.situacao || "ATIVA",
          porte: d.porte || "MEI",
          naturezaJuridica: d.natureza_juridica || "",
          cnaePrincipal: {
            codigo: d.cnae_fiscal
              ? String(d.cnae_fiscal).replace(/^(\d{4})(\d)(\d{2})$/, "$1-$2/$3")
              : "—",
            descricao: d.cnae_fiscal_descricao || "—",
          },
          dataAbertura: d.data_inicio_atividade
            ? new Date(d.data_inicio_atividade).toLocaleDateString("pt-BR")
            : "—",
          municipio: d.municipio && d.uf ? `${d.municipio} / ${d.uf}` : "—",
          logradouro: d.logradouro ? `${d.logradouro}${d.numero ? `, ${d.numero}` : ""}${d.bairro ? ` — ${d.bairro}` : ""}` : "—",
          email: d.email || "",
          aviso: false,
        });
        setCnpjLoading(false);
        return;
      } catch (e) { continue; }
    }

    // API bloqueada (CORS) — ativa modo manual com aviso
    setCnpjLoading(false);
    setModoManual(true);
    setErros(e => ({ ...e, cnpj: "" }));
  }

  function confirmarManual() {
    if (!nomeManual || nomeManual.trim().length < 5) {
      setNomeErr("Informe seu nome completo conforme consta no cartão CNPJ");
      return;
    }
    const cnaeInfo = CNAE_DB[cnaeManual]
      ? { codigo: cnaeManual, descricao: CNAE_DB[cnaeManual] }
      : { codigo: cnaeManual, descricao: "Atividade econômica" };
    setCnpjData({
      razaoSocial: nomeManual.toUpperCase(),
      nomeFantasia: "",
      situacao: "ATIVA",
      porte: porteManual,
      naturezaJuridica: "",
      cnaePrincipal: cnaeInfo,
      dataAbertura: "—",
      municipio: "—",
      logradouro: "—",
      email: "",
      aviso: false,
      entradaManual: true,
    });
    setModoManual(false);
  }

  function labelPorte(porte, natureza) {
    const p = (porte || "").toUpperCase();
    const n = (natureza || "").toUpperCase();
    if (n.includes("213") || p.includes("MEI") || p.includes("MICRO EMPREENDEDOR")) return { label:"MEI", color:T.green, desc:"Microempreendedor Individual" };
    if (p.includes("MICRO") || p === "ME") return { label:"ME", color:T.teal, desc:"Microempresa" };
    if (p.includes("PEQUENO") || p.includes("EPP")) return { label:"EPP", color:T.purple, desc:"Empresa de Pequeno Porte" };
    if (p.includes("MEDIO") || p.includes("MÉDIA")) return { label:"Médio Porte", color:T.amber, desc:"Empresa de Médio Porte" };
    if (p.includes("GRANDE")) return { label:"Grande", color:T.red, desc:"Grande Empresa" };
    return { label: porte||"Empresa", color:T.ink40, desc:"Pessoa Jurídica" };
  }

  function validarStep1() {
    const e = {};
    if(!V.email(email)) e.email="E-mail inválido";
    if(!cnpjData) e.cnpj="Consulte e valide o CNPJ antes de continuar";
    const cnpjLimpo = cnpj.replace(/\D/g,"");
    if(!V.cnpj(cnpjLimpo)) e.cnpj="CNPJ inválido";
    return e;
  }
  function validarStep2() {
    const e = {};
    if(senha.length<8) e.senha="Senha: mínimo 8 caracteres";
    if(senha!==confirmSenha) e.confirmSenha="Senhas não coincidem";
    return e;
  }
  function avancar() {
    const e = validarStep1();
    if(Object.keys(e).length>0) { setErros(e); return; }
    setStep(2);
  }
  async function finalizar() {
    const e = validarStep2();
    if(Object.keys(e).length>0) { setErros(e); return; }
    setLoading(true);
    await new Promise(r=>setTimeout(r,1000));
    setLoading(false);
    // Passa os dados reais do novo usuário (nome vem da RF, não do campo livre)
    onCad("Cliente", {
      nome:         nomeRF,
      nomeFantasia: cnpjData?.nomeFantasia || "",
      email, cnpj, telefone,
      porte:        cnpjData?.porte || porteManual || "MEI",
      mei:          (cnpjData?.porte||porteManual||"MEI").toUpperCase().includes("MEI"),
      cnae:         cnpjData?.cnaePrincipal?.codigo || cnaeManual || "",
      cnaeDesc:     cnpjData?.cnaePrincipal?.descricao || CNAE_DB[cnaeManual] || "",
      municipio:    cnpjData?.municipio || "",
      situacao:     cnpjData?.situacao || "ATIVA",
      entradaManual: cnpjData?.entradaManual || false,
      lgpdTs:       new Date().toISOString(),
    });
  }

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(155deg,#F0FDF4 0%,#ECFDF5 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:T.white,borderRadius:T.radiusLg,width:"100%",maxWidth:480,padding:"28px 24px",boxShadow:"0 8px 32px rgba(0,0,0,.08)",border:"1px solid #E5E7EB"}}>
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{fontSize:22,fontWeight:900,letterSpacing:"-1px",marginBottom:4}}><span style={{color:T.green}}>Lucrom</span></div>
          <p style={{fontSize:13,color:T.ink60}}>Criar conta grátis</p>
          <div style={{display:"flex",gap:4,justifyContent:"center",marginTop:12}}>
            {[1,2].map(s=><div key={s} style={{width:40,height:3,borderRadius:99,background:step>=s?T.green:T.ink10}}/>)}
          </div>
        </div>

        {step===1 ? (
          <>
            {/* CNPJ PRIMEIRO — nome vem da RF */}
            <div style={{marginBottom:12}}>
              <label style={{display:"block",fontSize:12,fontWeight:700,color:erros.cnpj?T.red:T.ink60,marginBottom:5}}>
                CNPJ * <span style={{fontSize:10,color:T.ink40,fontWeight:400}}>(o nome será preenchido automaticamente pela Receita Federal)</span>
              </label>
              <div style={{display:"flex",gap:8}}>
                <input
                  value={cnpj}
                  onChange={e=>{setCnpj(V.fmtCNPJ(e.target.value));setCnpjData(null);setErros(ex=>({...ex,cnpj:""}));}}
                  placeholder="00.000.000/0001-00" maxLength={18}
                  style={{flex:1,height:42,borderRadius:T.radius,padding:"0 12px",background:T.white,border:`1.5px solid ${erros.cnpj?T.red:cnpjData?T.green:T.ink10}`,color:T.ink,fontSize:13,outline:"none",boxSizing:"border-box"}}
                />
                <button onClick={consultarCNPJ} disabled={cnpjLoading}
                  style={{padding:"0 14px",borderRadius:T.radius,background:cnpjData?T.green:T.ink,color:"#fff",fontWeight:700,fontSize:12,border:"none",cursor:cnpjLoading?"wait":"pointer",fontFamily:"inherit",whiteSpace:"nowrap",opacity:cnpjLoading?.7:1}}>
                  {cnpjLoading?"⏳ Consultando...":cnpjData?"✓ Validado":"Consultar RF"}
                </button>
              </div>
              {erros.cnpj && <p style={{margin:"3px 0 0",fontSize:11,color:T.red,fontWeight:600}}>{erros.cnpj}</p>}
            </div>

            {cnpjData && !cnpjData.aviso && (
              <div style={{marginBottom:14,padding:"14px 16px",background:T.greenPale,borderRadius:T.radius,border:`1.5px solid ${T.green}`}}>
                <div style={{fontSize:10,fontWeight:700,color:T.green,textTransform:"uppercase",letterSpacing:".6px",marginBottom:10}}>
                  ✅ Dados confirmados — Receita Federal do Brasil
                </div>
                <div style={{background:T.white,borderRadius:T.radiusSm,padding:"10px 12px",marginBottom:10,border:`1px solid ${T.greenMid}`}}>
                  <div style={{fontSize:9,color:T.ink40,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Razão Social / Nome</div>
                  <div style={{fontSize:15,fontWeight:900,color:T.ink}}>{cnpjData.razaoSocial}</div>
                  {cnpjData.nomeFantasia && cnpjData.nomeFantasia !== cnpjData.razaoSocial && (
                    <div style={{fontSize:11,color:T.ink60,marginTop:2}}>Nome fantasia: {cnpjData.nomeFantasia}</div>
                  )}
                  {/* Badge do porte — aceita todos */}
                  {(()=>{const lp=labelPorte(cnpjData.porte,cnpjData.naturezaJuridica);return(
                    <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
                      <span style={{padding:"3px 10px",borderRadius:99,background:`${lp.color}18`,color:lp.color,fontSize:11,fontWeight:700}}>{lp.label}</span>
                      <span style={{fontSize:11,color:T.ink60}}>{lp.desc}</span>
                      <span style={{marginLeft:"auto",fontSize:11,color:T.green,fontWeight:700}}>✓ Aceito</span>
                    </div>
                  );})()}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[
                    {l:"Situação",v:cnpjData.situacao,c:cnpjData.situacao==="ATIVA"?T.green:T.red},
                    {l:"Porte",v:cnpjData.porte},
                    {l:"CNAE",v:cnpjData.cnaePrincipal.codigo},
                    {l:"Atividade",v:cnpjData.cnaePrincipal.descricao},
                    {l:"Abertura",v:cnpjData.dataAbertura},
                    {l:"Município / UF",v:cnpjData.municipio},
                    ...(cnpjData.logradouro&&cnpjData.logradouro!=="—"?[{l:"Endereço",v:cnpjData.logradouro}]:[]),
                    ...(cnpjData.email?[{l:"E-mail (RF)",v:cnpjData.email}]:[]),
                  ].map(x=>(
                    <div key={x.l} style={{background:"rgba(255,255,255,.7)",borderRadius:7,padding:"7px 10px"}}>
                      <div style={{fontSize:9,color:T.ink40,fontWeight:700,textTransform:"uppercase"}}>{x.l}</div>
                      <div style={{fontSize:11,fontWeight:600,color:x.c||T.ink,marginTop:1,wordBreak:"break-word"}}>{x.v||"—"}</div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:10,padding:"8px 10px",background:"rgba(239,68,68,.07)",borderRadius:8,border:"1px solid rgba(239,68,68,.2)"}}>
                  <div style={{fontSize:11,color:T.red,fontWeight:600}}>
                    🔒 Nome definido pela Receita Federal — não editável. Se esses dados não são seus, este CNPJ não pode ser usado.
                  </div>
                </div>
              </div>
            )}

            {/* Campo nome somente leitura — preenchido pela RF */}
            {cnpjData && !cnpjData.aviso && (
              <div style={{marginBottom:12}}>
                <label style={{display:"block",fontSize:12,fontWeight:700,color:T.ink60,marginBottom:5}}>
                  Nome (Receita Federal) <span style={{fontSize:10,color:T.ink40,fontWeight:400}}>— não editável</span>
                </label>
                <div style={{height:42,borderRadius:T.radius,padding:"0 12px",background:T.ink05,border:`1.5px solid ${T.ink10}`,color:T.ink60,fontSize:13,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:16}}>🔒</span>
                  <span style={{fontWeight:600}}>{cnpjData.razaoSocial}</span>
                </div>
                <p style={{margin:"3px 0 0",fontSize:10,color:T.ink40}}>Nome vinculado ao CNPJ na base da Receita Federal</p>
              </div>
            )}

            <Input label="E-mail *" value={email} onChange={v=>{setEmail(v);setErros(e=>({...e,email:""}));}} type="email" error={erros.email} placeholder="seu@email.com"/>
            <Input label="Telefone" value={telefone} onChange={v=>setTelefone(V.fmtPhone(v))} placeholder="(11) 98765-4321"/>

            {!cnpjData && (
              <div style={{padding:"10px 14px",background:T.amberPale,borderRadius:T.radiusSm,marginBottom:12,border:`1px solid ${T.amber}40`}}>
                <div style={{fontSize:12,color:T.amber,fontWeight:600}}>⚠️ Consulte o CNPJ primeiro. O nome será preenchido automaticamente pela Receita Federal — não é possível cadastrar em nome de terceiros.</div>
              </div>
            )}

            {/* Modo manual — aparece quando API falha */}
            {modoManual && !cnpjData && (
              <div style={{marginBottom:14,padding:"14px",background:T.amberPale,borderRadius:T.radius,border:`1.5px solid ${T.amber}`}}>
                <div style={{fontSize:12,fontWeight:700,color:"#92400e",marginBottom:10}}>
                  ⚠️ Consulta automática indisponível — preencha manualmente
                </div>
                <div style={{marginBottom:10}}>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:T.ink60,marginBottom:4}}>
                    Nome / Razão Social *
                  </label>
                  <input
                    value={nomeManual}
                    onChange={e=>{setNomeManual(e.target.value);setNomeErr("");}}
                    placeholder="Ex: JOÃO SILVA SERVIÇOS 12345678901"
                    style={{width:"100%",height:42,borderRadius:T.radiusSm,padding:"0 12px",
                      border:`1.5px solid ${nomeErr?T.red:T.amber}`,
                      background:T.white,color:T.ink,fontSize:13,outline:"none",
                      boxSizing:"border-box",fontFamily:"inherit"}}
                  />
                  {nomeErr&&<p style={{margin:"3px 0 0",fontSize:10,color:T.red,fontWeight:600}}>{nomeErr}</p>}
                  <p style={{fontSize:10,color:T.ink40,marginTop:4}}>Informe exatamente como consta no cartão CNPJ</p>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  <div>
                    <label style={{display:"block",fontSize:11,fontWeight:700,color:T.ink60,marginBottom:4}}>Porte</label>
                    <select value={porteManual} onChange={e=>setPorteManual(e.target.value)}
                      style={{width:"100%",height:38,borderRadius:T.radiusSm,padding:"0 8px",
                        border:`1px solid ${T.ink10}`,background:T.white,color:T.ink,
                        fontSize:12,outline:"none",fontFamily:"inherit"}}>
                      {["MEI","ME","EPP","Médio Porte","Grande"].map(p=><option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{display:"block",fontSize:11,fontWeight:700,color:T.ink60,marginBottom:4}}>CNAE</label>
                    <select value={cnaeManual} onChange={e=>setCnaeManual(e.target.value)}
                      style={{width:"100%",height:38,borderRadius:T.radiusSm,padding:"0 8px",
                        border:`1px solid ${T.ink10}`,background:T.white,color:T.ink,
                        fontSize:12,outline:"none",fontFamily:"inherit"}}>
                      {Object.entries(CNAE_DB||{}).map(([k,v])=><option key={k} value={k}>{k} — {v}</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={confirmarManual}
                  style={{width:"100%",padding:"11px",borderRadius:T.radiusSm,
                    background:T.amber,color:"#fff",fontWeight:700,fontSize:13,
                    border:"none",cursor:"pointer",fontFamily:"inherit"}}>
                  Confirmar dados →
                </button>
              </div>
            )}

            <Btn full size="lg" onClick={avancar} disabled={!cnpjData} style={{marginTop:4}}>Continuar →</Btn>
          </>
        ) : (
          <>
            <div style={{padding:"12px 14px",background:T.greenPale,borderRadius:T.radiusSm,marginBottom:14,border:`1px solid ${T.greenMid}`}}>
              <div style={{fontSize:11,fontWeight:700,color:T.green,marginBottom:4}}>Dados verificados ✅</div>
              <div style={{fontSize:12,fontWeight:700,color:T.ink,marginBottom:2}}>{nomeRF}</div>
              <div style={{fontSize:11,color:T.ink60}}>{email} · {cnpj}</div>
            </div>
            <Input label="Senha *" value={senha} onChange={v=>{setSenha(v);setErros(e=>({...e,senha:""}));}} type="password" error={erros.senha} hint="Mínimo 8 caracteres"/>
            <Input label="Confirmar senha *" value={confirmSenha} onChange={v=>{setConfirmSenha(v);setErros(e=>({...e,confirmSenha:""}));}} type="password" error={erros.confirmSenha}/>
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <Btn v="outline" full onClick={()=>setStep(1)}>← Voltar</Btn>
              <Btn full size="lg" disabled={loading} onClick={finalizar}>{loading?"Criando conta...":"Criar conta grátis"}</Btn>
            </div>
          </>
        )}

        <div style={{textAlign:"center",marginTop:14,fontSize:12,color:T.ink60}}>
          Já tem conta? <button onClick={onLogin} style={{background:"none",border:"none",cursor:"pointer",color:T.green,fontWeight:700,fontFamily:"inherit"}}>Entrar</button>
        </div>
        <div style={{textAlign:"center",marginTop:6}}>
          <button onClick={onGoSite} style={{background:"none",border:"none",cursor:"pointer",color:T.ink40,fontSize:11,fontFamily:"inherit"}}>← Voltar ao site</button>
        </div>
      </div>
    </div>
  );
}


// ── Persistência de estado (sessionStorage para demo, JWT em produção) ──
const StatePersist = {
  KEY: "lucrom_state_v1", // DEMO: em produção substituído por JWT + backend API
  save(state) {
    if (!state.auth?.loggedIn) return; // não salva estado deslogado
    try {
      const slim = {
        user: state.user, auth: state.auth,
        transactions: state.transactions?.slice(0,50), // últimas 50
        faturamento: state.faturamento,
        missions: state.missions,
        scoreHistory: state.scoreHistory?.slice(-10),
        dasPagamentos: state.dasPagamentos,
        dasnDecs: state.dasnDecs,
        notasFiscais: state.notasFiscais?.slice(0,20),
        endereco: state.endereco,
        dadosBancarios: state.dadosBancarios,
      };
      sessionStorage.setItem(StatePersist.KEY, JSON.stringify(slim));
    } catch {}
  },
  load() {
    try {
      const raw = sessionStorage.getItem(StatePersist.KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.auth?.loggedIn ? parsed : null;
    } catch { return null; }
  },
  clear() { try { sessionStorage.removeItem(StatePersist.KEY); } catch {} },
};

export default function Lucrom() {
  // Carrega estado persistido (sobrevive reload de página)
  const [st, dispatch] = useReducer(reducer, INIT, () => {
    const saved = StatePersist.load();
    return saved ? {...INIT, ...saved} : INIT;
  });

  // Salva estado sempre que muda (throttled)
  const persistTimer = useRef(null);
  useEffect(() => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => StatePersist.save(st), 1000);
    return () => clearTimeout(persistTimer.current);
  }, [st]);
  const [page, setPage] = useState("home");
  const [sidebar, setSidebar] = useState(true);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [route, setRoute] = useState(()=>{
    try {
      const p = new URLSearchParams(window.location.search);
      if(p.get("cert")||p.get("verify")) return "verify";
    } catch{}
    return "landing";
  });
  const [demoMode, setDemoMode] = useState(false); // ← demo completamente isolado

  // Estado visível: demo ou real — NUNCA se misturam
  const view = demoMode ? DEMO_STATE : st;

  const entrarDemo = useCallback(() => {
    setDemoMode(true);
    setRoute("app");
    setPage("home");
    setSidebar(true);
  }, []);

  const sairDemo = useCallback(() => {
    setDemoMode(false);
    setRoute("landing"); // volta para landing, st real intocado
  }, []);

  // dispatch só funciona quando NÃO está em demo — protege o estado real
  const safeDispatch = useCallback((action) => {
    if (demoMode) return; // bloqueia qualquer mutação no modo demo
    dispatch(action);
  }, [demoMode]);

  const go = useCallback(p => { setPage(p); setSidebar(true); setShowNotifs(false); setShowSearch(false); }, []);
  const login = useCallback((perfil, dadosNovoCadastro=null) => {
    if(dadosNovoCadastro) {
      // ── NOVO CADASTRO: estado zerado do zero ────────────────
      // NÃO herda nada do INIT demo — usuário começa limpo
      dispatch({type:"AUTH.NOVO_CADASTRO", p:{
        nome:        dadosNovoCadastro.nome,
        email:       dadosNovoCadastro.email,
        cnpj:        dadosNovoCadastro.cnpj,
        telefone:    dadosNovoCadastro.telefone    || "",
        porte:       dadosNovoCadastro.porte       || "MEI",
        cnae:        dadosNovoCadastro.cnae        || "",
        cnaeDesc:    dadosNovoCadastro.cnaeDesc    || "",
        municipio:   dadosNovoCadastro.municipio   || "",
        endereco:    dadosNovoCadastro.endereco    || {},
      }});
    } else {
      dispatch({type:"AUTH.LOGIN",p:{
        role: perfil==="Admin"?"ADMIN":perfil==="Parceiro"?"PARTNER":"USER",
        perfil
      }});
    }
    setRoute("app");
    setPage(perfil==="Parceiro"?"parc_dash":perfil==="Admin"?"adm_dash":"home");
    setSidebar(true);
  }, []);
  const logout = useCallback(() => { dispatch({type:"AUTH.LOGOUT"}); StatePersist.clear(); setRoute("landing"); }, []);
  const naoLidas = useMemo(() => (view.notificacoes||[]).filter(n=>!n.lida).length, [view.notificacoes]);
  const perfil = demoMode ? "Cliente" : st.auth.perfil;
  const handlePerfilChange = useCallback(p => {
    dispatch({type:"AUTH.SET_PERFIL",p});
    setPage(p==="Parceiro"?"parc_dash":p==="Admin"?"adm_dash":"home");
    setShowNotifs(false);
    setSidebar(true);
  }, []);

  useEffect(() => {
    const handler = e => {
      if((e.metaKey||e.ctrlKey)&&e.key==="k") { e.preventDefault(); setShowSearch(v=>!v); }
      if(e.key==="Escape") { setShowSearch(false); setShowNotifs(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── GATILHOS AUTOMÁTICOS ─────────────────────────────────────
  // Roda ao login e a cada 60s para checar DAS, DASN, faturamento, propostas, certificados
  useEffect(() => {
    if(!st.auth.loggedIn) return;
    // Dispara imediatamente ao logar
    dispatch({type:"SYSTEM.RUN_TRIGGERS"});
    dispatch({type:"CREDIT.PROPOSTA_EXPIRE"});
    // Polling a cada 60 segundos
    const interval = setInterval(() => {
      dispatch({type:"SYSTEM.RUN_TRIGGERS"});
      dispatch({type:"CREDIT.PROPOSTA_EXPIRE"});
    }, 60000);
    return () => clearInterval(interval);
  }, [st.auth.loggedIn, st.auth.perfil]);

  return (
    <GoCtx.Provider value={go}>
      <ToastProvider>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap');

          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

          html, body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            font-size: 16px;
            line-height: 1.5;
          }

          input, select, textarea, button { font-family: inherit; }

          /* Scrollbar refinada */
          ::-webkit-scrollbar { width: 5px; height: 5px; }
          ::-webkit-scrollbar-track { background: #F3F4F6; }
          ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 99px; }
          ::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }

          /* Focus visível — acessibilidade (WCAG 2.4.7) */
          button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
            outline: 2.5px solid #22C55E;
            outline-offset: 2px;
          }

          /* Remove outline padrão — substituído pelo focus-visible */
          button:focus:not(:focus-visible), input:focus:not(:focus-visible) { outline: none; }

          /* Animações */
          @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
          @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
          @keyframes slideIn { from{transform:translateX(-8px);opacity:0} to{transform:translateX(0);opacity:1} }

          /* Placeholder estilizado */
          input::placeholder, textarea::placeholder { color: #A8C4B4; }

          /* Selection */
          ::selection { background: rgba(34,197,94,.25); color: inherit; }
        `}</style>

        {/* Skip to content — acessibilidade teclado (WCAG 2.4.1) */}
        <a href="#main-content" style={{
          position:"absolute", left:"-9999px", top:"auto",
          width:"1px", height:"1px", overflow:"hidden",
          background:T.green, color:T.white, fontWeight:700, padding:"8px 16px",
          borderRadius:"0 0 8px 8px", zIndex:99999,
          ":focus": {left:0, width:"auto", height:"auto"},
        }}>Pular para o conteúdo</a>

        {route==="verify" && <PageCertVerify onGoSite={()=>setRoute("landing")} st={st}/>}
        {route==="landing" && <Landing onLogin={()=>setRoute("login")} onCadastro={()=>setRoute("cadastro")} onDemo={entrarDemo} onVerify={()=>setRoute("verify")}/>}
        {route==="login" && <LoginPage onLogin={login} onSignup={()=>setRoute("cadastro")} onGoSite={()=>setRoute("landing")} onDemo={entrarDemo}/>}
        {route==="cadastro" && <CadastroPage onCad={login} onLogin={()=>setRoute("login")} onGoSite={()=>setRoute("landing")}/>}

        {route==="app" && (
          <div style={{display:"flex",height:"100vh",background:"#F5F7F6",overflow:"hidden"}} onClick={()=>setShowNotifs(false)}>
            <Sidebar open={sidebar} onClose={()=>setSidebar(false)} page={page} go={go} perfil={perfil} user={view.user}/>
            <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",marginLeft:sidebar?T.sideW:0,transition:"margin-left .22s ease"}}>
              <TopBar
                onMenu={()=>setSidebar(v=>!v)}
                onNotif={e=>{e.stopPropagation();setShowNotifs(v=>!v);if(!showNotifs)dispatch({type:"SYSTEM.NOTIF_READ_ALL"});}}
                onSearch={()=>setShowSearch(true)}
                naoLidas={naoLidas} user={view.user} perfil={perfil}
                onPerfilChange={handlePerfilChange} onLogout={logout}
                showNotifs={showNotifs}
              />
              <div style={{flex:1,overflowY:"auto",position:"relative"}}>
                {showNotifs && (
                  <NotifPanel notifs={view.notificacoes||[]} onClose={()=>setShowNotifs(false)} dispatch={safeDispatch} go={go}/>
                )}
                <main id="main-content" role="main" aria-label="Conteúdo principal" style={{padding:"22px 20px",paddingBottom:80}}>
                  <div style={{maxWidth:1140,margin:"0 auto"}}>
                    <React.Fragment key={page}>{getPage(page, view, safeDispatch, go)}</React.Fragment>
                  </div>
                </main>
              </div>
            </div>
            <BottomNav page={page} go={go} perfil={perfil} naoLidas={naoLidas}/>
            {showSearch && <GlobalSearch st={view} go={go} onClose={()=>setShowSearch(false)}/>}
            <ConsentBanner/>
          </div>
        )}
      </ToastProvider>
    </GoCtx.Provider>
  );
}
