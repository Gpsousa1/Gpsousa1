# Guia de Paridade Mobile — Lucrom

> Como transformar a versão mobile do Lucrom, hoje **"só estética"**, em uma
> versão com **a mesma estrutura e as mesmas funcionalidades da versão web**.

Este documento é um guia técnico para o desenvolvedor que vai implementar a
paridade mobile. Ele explica **como o app está montado hoje**, **por que o
mobile ainda é só visual**, e **o passo a passo concreto** (com nomes de
arquivos e números de linha) para chegar na paridade total.

Arquivo principal do app: `artifacts/lucrom/src/LucromUnificado.jsx`
(um monólito React de ~12.600 linhas). Todos os números de linha citados abaixo
se referem a esse arquivo, salvo indicação em contrário.

---

## 1. Resumo executivo (TL;DR)

- **Boa notícia:** web e mobile usam **exatamente o mesmo código**. Não existe
  um "app mobile separado" para reconstruir do zero. Toda a lógica de negócio
  (score, crédito, fluxo de caixa, DAS, missões, antifraude) **já funciona** e é
  **compartilhada** entre desktop e celular.
- **O problema não é falta de funcionalidade — é falta de layout responsivo.**
  As telas foram desenhadas para desktop com **grades de largura fixa** e
  **tabelas largas com rolagem horizontal**. No celular isso vira colunas
  espremidas, texto pequeno e conteúdo cortado. Por isso a sensação de que o
  mobile é "só estético": ele *mostra* as telas, mas a **estrutura** não se
  adapta como deveria.
- **O que fazer:** tornar os componentes de layout **responsivos** (empilhar em
  1 coluna no celular, transformar tabelas em cartões, adaptar o shell de
  navegação). É um trabalho de **layout/CSS + alguns ajustes de navegação**, não
  de reescrever regras de negócio.

---

## 2. Como o Lucrom está montado hoje (arquitetura)

### 2.1 Um único app React (SPA)

O app inteiro é renderizado a partir de um único componente
`export default function Lucrom()` (linhas **12380–12578**), montado por
`src/main.tsx` → `src/App.tsx`.

Não há React Router. A navegação é feita por **estado local**:

| Estado | O que controla | Linhas |
|---|---|---|
| `route` | Tela pública x app (`landing`/`login`/`cadastro`/`verify`/`app`) | 12398–12404, 12543–12575 |
| `page` | Qual das ~50 telas internas está aberta | 12394 |
| `sidebar` | Menu lateral aberto/fechado | 12395 |
| `demoMode` | Modo demonstração (dados isolados) | 12405–12408 |

Navegação entre telas internas é feita pela função `go(pageKey)` exposta via
contexto `GoCtx` (linha **12428**).

### 2.2 Onde mora a lógica de negócio (as "engines")

Toda a regra de negócio roda **no navegador** (modo demo, sem backend). Isso é
importante: **a mesma lógica atende web e mobile**.

| Engine | Função | Linhas |
|---|---|---|
| `ScoreEngine` | Score Lucrom (12 variáveis, 300–1000) | 815–905 |
| `FraudEngine` | Antifraude (velocity, valores redondos, etc.) | 733–778 |
| `LedgerEngine` | Razão contábil de partidas dobradas | 782–795 |
| `IdempotencyStore` | Anti duplo-clique em transações | 799–808 |
| `SmartTriggerEngine` | Notificações proativas (a cada 60s) | 931–1092 |
| `ImpostosEngine` / `CnaeEngine` | DAS, teto MEI, CNAE | 907–926, 1094+ |

O estado global fica em um `useReducer` (init em **1545–1604**, reducer em
**1665–2108**), servindo como fonte única de verdade.

### 2.3 Perfis (MEI / Parceiro / Admin)

O objeto `NAV` (linhas **1335–1388**) define três menus, um por perfil:

- **Cliente (MEI):** 16 itens (`home` … `perfil`)
- **Parceiro:** 11 itens (`parc_dash` … `parc_lgpd`)
- **Admin:** 19 itens (`adm_dash` … `adm_cad_admin`)

O menu lateral (`Sidebar`, **2837–2985**) lê `NAV[perfil]`. As telas são
resolvidas por `getPage(page, …)` (**10588–10642**).

### 2.4 O shell da área logada

Quando `route === "app"` (linhas **12548–12575**), a estrutura é:

```
<div flex, height:100vh>
  ├── Sidebar (drawer lateral)              2837–2985
  ├── Coluna principal (marginLeft: sidebar?248:0)
  │     ├── TopBar (☰, busca, notificações, usuário)   2987–3150
  │     └── <main> → getPage(page)          12564–12567
  ├── BottomNav (barra fixa inferior)        2685–2759
  ├── GlobalSearch (modal ⌘K)                2761–2804
  └── ConsentBanner (LGPD)
```

> **Conclusão-chave:** não existe versão mobile separada. O celular renderiza
> os **mesmos componentes** do desktop. Logo, "colocar o mobile com a mesma
> estrutura da web" = **fazer esses mesmos componentes se adaptarem à tela
> pequena**.

---

## 3. Diagnóstico: por que o mobile é "só estético" hoje

Hoje o app tem **quase nenhuma responsividade** na área logada. O hook
`useResponsive()` (linhas **408–423**, com breakpoints `xs<640`, `sm 640–767`,
`md 768–1023`, `lg≥1024`) é usado em **apenas 2 lugares** de todo o arquivo:
na `Landing` (**10883**) e na `PageCalculadora` (**6597**). Nenhuma outra tela
muda de layout conforme o tamanho da tela.

Problemas concretos:

| # | Problema | Onde | Efeito no celular |
|---|---|---|---|
| 1 | **Grade de largura fixa.** `Grid` usa `repeat(cols,1fr)` sempre, sem empilhar | `function Grid` **2510–2512** (usado em dezenas de telas) | Grades de 3–6 colunas viram colunas minúsculas e espremidas em vez de empilhar em 1 coluna |
| 2 | **Tabelas largas com rolagem horizontal.** `minWidth` + `overflowX:auto` | Lançamentos `minWidth:480` **3640**; e em **3721, 5981, 7945, 9228, 10379** | O usuário precisa rolar de lado para ler; colunas ficam cortadas |
| 3 | **Calculadora só adapta em `sm`.** `isMobile = bp === "sm"` | **6597–6598, 6761, 6825** | Em celulares abaixo de 640px (`xs`, a maioria) a calculadora volta ao layout desktop de 4 colunas |
| 4 | **Shell não sabe se é mobile.** `marginLeft: sidebar?248:0` e `BottomNav` fixa | **12551, 12571** | A `BottomNav` aparece **até no desktop**; e quando o menu abre no celular o conteúdo é empurrado/espremido |
| 5 | **Navegação incompleta na barra inferior.** Só 5 atalhos por perfil | `BottomNav` **2685–2708** | 11–14 telas por perfil só são acessíveis pelo menu ☰ (não há atalho direto) |
| 6 | **Troca de perfil no demo quebrada.** `demoMode` não é passado ao `TopBar` | `TopBar` render **12552–12558**; seletor em **3113–3132** | No demo o seletor Cliente/Parceiro/Admin nunca aparece |
| 7 | **Sem `@media`, sem breakpoints Tailwind, sem `matchMedia`.** Tudo é estilo inline fixo | arquivo todo | Não há base de responsividade para o navegador ajustar sozinho |
| 8 | **Zoom bloqueado.** `maximum-scale=1` na meta viewport | `index.html` linha 5 | Usuário não consegue dar pinch-zoom para ler conteúdo pequeno |

> Ou seja: o mobile "parece" pronto porque muitos cartões pequenos por acaso
> cabem em 390px, mas a **estrutura** (grades e tabelas) foi feita para desktop.
> Telas densas (dashboards de Parceiro/Admin, relatórios, tabelas) quebram.

---

## 4. Definição de "paridade": o que significa "mesma estrutura da web"

Considere a paridade atingida quando, em um celular (largura ~360–430px):

1. **Toda tela** que existe no desktop é **acessível** e **legível** no celular.
2. **Toda ação** que funciona no desktop funciona no celular (lançar receita,
   pagar DAS, emitir certificado, solicitar crédito, aprovar proposta como
   Parceiro, gerir como Admin, etc.).
3. **Nenhuma grade** fica espremida: grades de várias colunas **empilham** em 1
   coluna (ou no máximo 2) no celular.
4. **Nenhuma tabela** exige rolagem horizontal: tabelas viram **lista de
   cartões** empilhados no celular.
5. **Navegação adaptada:** todos os itens de menu são alcançáveis pelo celular
   (barra inferior + menu, ou drawer completo).
6. **Formulários e modais** ocupam a tela de forma confortável (largura total,
   botões grandes o suficiente para o toque — mínimo 44×44px).

---

## 5. Plano de implementação passo a passo

A ordem abaixo vai do "alicerce" (que destrava tudo) até o polimento.

### Passo 0 — Liberar o zoom (rápido)

Em `artifacts/lucrom/index.html` (linha 5), trocar:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
```

por:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

### Passo 1 — Criar a base de responsividade

O hook `useResponsive()` já existe (**408–423**). Padronize um helper único de
"é mobile" para o app todo (celular = abaixo de `md`, ou seja `< 768px`):

```jsx
// usar em qualquer componente
const bp = useResponsive();               // "xs" | "sm" | "md" | "lg"
const isMobile = bp === "xs" || bp === "sm";   // < 768px
```

> Corrigir também o `isMobile` da `PageCalculadora` (**6598**), que hoje ignora
> o `xs`.

### Passo 2 — Tornar o `Grid` responsivo (destrava a maioria das telas)

O componente `Grid` (**2510–2512**) é usado em dezenas de lugares. Torná-lo
responsivo conserta muitas telas de uma vez, sem tocar em cada página:

```jsx
function Grid({ cols = 2, gap = 12, minCol, children, style = {} }) {
  // No celular: empilha em 1 coluna. minCol permite auto-fit opcional.
  const template = minCol
    ? `repeat(auto-fill, minmax(${minCol}px, 1fr))`
    : `repeat(${cols}, 1fr)`;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: template,
        gap,
        ...style,
      }}
      data-cols={cols}
      className="lucrom-grid"
    >
      {children}
    </div>
  );
}
```

E adicionar **uma** regra global de CSS no bloco `<style>` do `Lucrom()`
(**12491–12532**) para empilhar no celular sem precisar editar cada `Grid`:

```css
@media (max-width: 767px) {
  .lucrom-grid { grid-template-columns: 1fr !important; }
  /* opcional: manter 2 colunas para grades de estatística pequenas */
  .lucrom-grid[data-cols="3"], .lucrom-grid[data-cols="4"] {
    grid-template-columns: repeat(2, 1fr) !important;
  }
}
```

> Esta é a mudança de **maior impacto**: como quase todo layout de várias
> colunas passa pelo `Grid`, empilhar aqui resolve dezenas de telas.

### Passo 3 — Adaptar o shell (menu lateral e barra inferior)

No shell (**12548–12575**), usar `isMobile` para:

- **Desktop (`≥768px`):** menu lateral **fixo** (sempre visível), **sem**
  `BottomNav`. Ajustar `marginLeft` para a largura do menu.
- **Mobile (`<768px`):** menu lateral como **drawer** por cima (como hoje),
  **com** `BottomNav`, e `marginLeft: 0` (conteúdo nunca é empurrado).

```jsx
const bp = useResponsive();
const isMobile = bp === "xs" || bp === "sm";
// ...
<div style={{ ..., marginLeft: isMobile ? 0 : (sidebar ? T.sideW : 0) }}>
// ...
{isMobile && <BottomNav .../>}   {/* barra inferior só no celular */}
```

### Passo 4 — Padrão "tabela → cartões" no celular

Criar **um** componente reutilizável para tabelas responsivas e trocar os
`<table>` largos por ele. No celular ele vira lista de cartões; no desktop,
tabela normal.

```jsx
function DataTable({ columns, rows, renderCard }) {
  const bp = useResponsive();
  const isMobile = bp === "xs" || bp === "sm";
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((row, i) => renderCard(row, i))}
      </div>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>{/* columns */}</thead>
        <tbody>{/* rows */}</tbody>
      </table>
    </div>
  );
}
```

Aplicar nos pontos com `minWidth`+`overflowX` já mapeados: **3640** (Lançamentos),
**3721, 5981, 7945, 9228, 10379** (relatórios, carteira do Parceiro, telas de
Admin, etc.).

### Passo 5 — Completar a navegação no celular

A `BottomNav` (**2685–2708**) só tem 5 atalhos por perfil. Opções (escolher uma):

- **(A) Recomendada:** manter 4 atalhos principais + um botão **"Mais"** que
  abre o menu lateral completo (`onMenu`). Garante acesso a todas as telas.
- **(B)** Gerar a barra inferior a partir dos itens mais usados de `NAV[perfil]`.

O importante é garantir que **todas** as 11–19 telas por perfil sejam
alcançáveis no celular (hoje já são, via ☰ — este passo é sobre conveniência).

### Passo 6 — Consertar a troca de perfil no modo demo

Passar `demoMode` ao `TopBar` (**12552–12558**) para reativar o seletor
Cliente/Parceiro/Admin (**3113–3132**). Sem isso, no celular em demo o usuário
fica preso no perfil Cliente e não consegue exercitar Parceiro/Admin.

### Passo 7 — Polimento de toque e modais

- **Alvos de toque:** garantir mínimo de **44×44px** em botões e ícones
  clicáveis (barra inferior, ações de tabela, chips).
- **Modais/drawers:** no celular, modais devem ocupar **tela cheia** ou
  bottom-sheet, com largura total; hoje vários usam `maxWidth` fixo.
- **Inputs:** `font-size` ≥ 16px em campos de texto para evitar zoom automático
  do iOS.

---

## 6. Checklist página por página

Depois dos Passos 2–4 (Grid responsivo + tabelas → cartões), a maioria das telas
já fica ok. Use esta lista para conferir/ajustar tela a tela. Prioridade:
**Alta** = tela densa que quebra hoje.

### Perfil Cliente (MEI) — `NAV.Cliente` (1336–1353)

| Tela (`page`) | Componente | Prioridade | Observação mobile |
|---|---|---|---|
| `home` | `PageHome` (~3350) | Alta | Grades de estatística e cartões → empilhar |
| `lancamentos` | (tabela ~3640) | Alta | Tabela → cartões |
| `missions` | `PageMissoes` (~3772) | Média | Cards de missão em 1 coluna |
| `impostos` (DAS) | — | Média | Cards de DAS/DASN empilham |
| `relatorios` | (charts ~10379) | Alta | Grade 2×2 de gráficos → 1 coluna; resumo topo |
| `calculadora` | `PageCalculadora` (6596) | Alta | Corrigir `isMobile` p/ incluir `xs` |
| `operacoes`, `propostas` | — | Média | Listas/tabelas → cartões |
| `openfinance`, `cert_ccfv`, `cert_a1`, `notas`, `planos`, `privacidade`, `edumei`, `perfil` | — | Baixa | Conferir grades e formulários |

### Perfil Parceiro — `NAV.Parceiro` (1354–1366)

| Tela | Prioridade | Observação |
|---|---|---|
| `parc_dash` | Alta | Dashboard denso (KPIs em grade) → empilhar |
| `parc_carteira` | Média | Já usa `auto-fill minmax(280px)` (**8259**) — ok |
| `parc_operacoes` | Alta | Pipeline com `overflowX` (**7920**) → repensar no celular |
| `parc_score`, `parc_settlement`, `parc_lgpd` | Média | Tabelas → cartões |

### Perfil Admin — `NAV.Admin` (1367–1387)

| Tela | Prioridade | Observação |
|---|---|---|
| `adm_dash` | Alta | Muitos KPIs em grade → empilhar |
| `adm_operacoes`, `adm_usuarios`, `adm_fraudes`, `adm_parceiros` | Alta | Telas de tabela → cartões |
| `adm_ledger`, `adm_health`, `adm_teto`, `adm_edu`, `adm_planos`, demais | Média/Baixa | Conferir grades e formulários |

---

## 7. Como testar a paridade

Ambiente de desenvolvimento (ver também `AGENTS.md`):

```bash
cd artifacts/lucrom
PORT=5000 BASE_PATH=/ npm run dev   # http://localhost:5000
```

Roteiro de teste no Chrome:

1. Abrir o DevTools → **modo dispositivo** (Ctrl+Shift+M).
2. Testar nas larguras: **360px** (Android comum), **390px** (iPhone),
   **768px** (tablet/limite `md`), **1024px+** (desktop).
3. Para **cada** tela de cada perfil, verificar os 6 critérios da seção 4
   (acessível, funcional, grades empilham, tabelas viram cartões, navegação
   completa, toque confortável).
4. No modo demo, alternar Cliente/Parceiro/Admin (após o Passo 6) e repetir.

Sugestão: comparar lado a lado a mesma tela em `1200px` e `390px` — o conteúdo e
as ações devem ser os mesmos; só o arranjo muda.

---

## 8. Mapa de referência rápido (arquivo/linha)

Tudo em `artifacts/lucrom/src/LucromUnificado.jsx`:

| Área | Linhas |
|---|---|
| Componente raiz `Lucrom()` | 12380–12578 |
| Shell da área logada (`route==="app"`) | 12548–12575 |
| `useResponsive()` (breakpoints) | 408–423 |
| `Grid` (grade de largura fixa) | 2510–2512 |
| `Sidebar` (menu lateral) | 2837–2985 |
| `TopBar` (topo) | 2987–3150 |
| Seletor de perfil (demo) | 3113–3132 |
| `BottomNav` (barra inferior) | 2685–2759 |
| `GlobalSearch` (busca ⌘K) | 2761–2804 |
| Menus por perfil (`NAV`) | 1335–1388 |
| Resolver de telas (`getPage`) | 10588–10642 |
| Estado inicial (`INIT`) | 1545–1604 |
| Reducer (todas as ações) | 1665–2108 |
| Engines (Score/Fraud/Ledger/…) | 733–1092 |
| `Landing` (responsiva, referência de padrão) | 10882–11324 |
| `PageCalculadora` (única tela interna responsiva) | 6596–6844 |
| Meta viewport (zoom) | `index.html` linha 5 |

---

## 9. Decisão de arquitetura: um app responsivo x app mobile separado

Como web e mobile **já compartilham o mesmo código**, há duas estratégias:

### Opção A — Um único app responsivo (recomendada)

Fazer os componentes atuais responderem ao tamanho da tela (este documento).

- **Prós:** menor esforço; **paridade garantida por construção** (é o mesmo
  código); uma base para manter; funciona no navegador do celular na hora;
  pode virar **PWA** (instalável) com pouco esforço adicional.
- **Contras:** não é um app "nativo" na loja (mas resolve 100% do pedido de
  "mesma estrutura e funcionalidade no mobile").

### Opção B — App mobile separado (React Native / nativo)

- **Prós:** presença nas lojas, recursos nativos (push, biometria).
- **Contras:** esforço **muito** maior; exigiria **extrair as engines** (score,
  fraude, razão, impostos) para um pacote/serviço compartilhado ou um **backend
  real** (hoje elas rodam só no navegador); risco alto de a versão mobile
  **divergir** da web ao longo do tempo — exatamente o problema de "só estético"
  que se quer evitar.

**Recomendação:** seguir a **Opção A** primeiro (paridade responsiva + PWA).
Só considerar a Opção B depois, e sempre reaproveitando as mesmas regras de
negócio (nunca reimplementá-las separadamente).

---

### Próximos passos sugeridos

1. Passo 0 (viewport) + Passo 2 (`Grid` responsivo) — maior impacto, menor risco.
2. Passo 3 (shell) + Passo 4 (tabelas → cartões).
3. Rodar o checklist da seção 6, perfil por perfil.
4. Passos 5–7 (navegação, demo, polimento de toque).
5. (Opcional) empacotar como PWA para instalação no celular.
