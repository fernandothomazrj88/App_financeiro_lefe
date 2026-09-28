const API_URL='https://script.google.com/macros/s/AKfycbxvqJpcrAHsgxTDJ7-U_spCaCmJf2oCbOl5qo3ULDHOlWdggkJYqJhkQCLzkib0t_yEvg/exec';

let sessao={
  token:localStorage.getItem('vf_token'),
  usuario:JSON.parse(localStorage.getItem('vf_usuario')||'null')
};

let moduloAtual=null;
let subtelaModulo=null;

document.addEventListener('DOMContentLoaded',iniciarApp);

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register('./service-worker.js?v=8');
      await reg.update();
      console.log('LeFe Finances PWA v8 ativo.',reg.scope);
    }catch(err){
      console.warn('Falha ao registrar PWA:',err);
    }
  });
}

function iniciarApp(){
  configurarLogin();
  configurarLogout();
  configurarModulos();
  $('btn-voltar').addEventListener('click',voltarModuloOuHome);
  $('btn-logout-modulo').addEventListener('click',sair);
  if(sessao.token&&sessao.usuario) abrirHome(); else abrirLogin();
}

function configurarLogin(){
  $('form-login').addEventListener('submit',async e=>{
    e.preventDefault();
    const usuario=$('usuario').value.trim();
    const senha=$('senha').value;
    const botao=$('btn-login');
    const mensagem=$('mensagem-login');
    mensagem.textContent='';
    botao.disabled=true;
    botao.textContent='Entrando...';
    try{
      const r=await chamarApi({action:'login',usuario,senha});
      if(!r.sucesso) throw new Error(r.erro||'Não foi possível entrar.');
      sessao={token:r.token,usuario:r.usuario};
      localStorage.setItem('vf_token',r.token);
      localStorage.setItem('vf_usuario',JSON.stringify(r.usuario));
      abrirHome();
    }catch(err){
      mensagem.textContent=err.message;
    }finally{
      botao.disabled=false;
      botao.textContent='Entrar';
    }
  });
}

function configurarLogout(){
  $('btn-logout').addEventListener('click',sair);
}

function configurarModulos(){
  document.querySelectorAll('.modulo').forEach(b=>{
    b.addEventListener('click',()=>abrirModulo(b.dataset.modulo));
  });
}

function abrirLogin(){
  subtelaModulo=null;
  mostrarTela('tela-login');
  window.scrollTo(0,0);
}

function abrirHome(){
  subtelaModulo=null;
  moduloAtual=null;
  mostrarTela('tela-home');
  window.scrollTo(0,0);

  const nome=sessao.usuario?.nome||'';
  const login=(sessao.usuario?.usuario||'').toLowerCase();
  $('nome-usuario').textContent=nome+' 👋';

  const hero=document.querySelector('.hero-personalizado');
  const imagem=$('hero-usuario');
  const frase=$('hero-frase');

  hero.classList.remove('leticia','fernando');

  if(login==='leticia'){
    hero.classList.add('leticia');
    imagem.src='assets/leticia-home.png';
    imagem.alt='Letícia';
    frase.innerHTML='Disciplina hoje,<br>liberdade <strong>amanhã</strong> 🧡';
  }else if(login==='fernando'){
    hero.classList.add('fernando');
    imagem.src='assets/fernando-home.png';
    imagem.alt='Fernando';
    frase.innerHTML='Planejamento hoje,<br>conquistas <strong>sempre</strong> 🧡';
  }else{
    imagem.src='assets/casal-login.png';
    frase.innerHTML='';
  }
}

function mostrarTela(id){
  ['tela-login','tela-home','tela-modulo'].forEach(x=>{
    $(x).classList.toggle('escondido',x!==id);
  });
}

async function sair(){
  try{
    if(sessao.token) await chamarApi({action:'logout',token:sessao.token});
  }catch(e){}
  localStorage.removeItem('vf_token');
  localStorage.removeItem('vf_usuario');
  sessao={token:null,usuario:null};
  $('senha').value='';
  abrirLogin();
}

async function voltarModuloOuHome(){
  if(subtelaModulo==='registrar-pagamento' && moduloAtual==='financeiro'){
    subtelaModulo=null;
    const c=$('modulo-conteudo');
    c.innerHTML='<div class="carregando">Carregando...</div>';
    try{
      await renderFinanceiro(c);
      rolarModuloTopo();
    }catch(e){
      c.innerHTML='<div class="erro">'+esc(e.message)+'</div>';
    }
    return;
  }
  abrirHome();
}

async function abrirModulo(modulo){
  moduloAtual=modulo;
  subtelaModulo=null;
  mostrarTela('tela-modulo');
  rolarModuloTopo();

  const c=$('modulo-conteudo');
  c.innerHTML='<div class="carregando">Carregando...</div>';

  try{
    if(modulo==='financeiro') await renderFinanceiro(c);
    else if(modulo==='mercado') await renderMercado(c);
    else if(modulo==='relatorios') await renderRelatorios(c);
    else if(modulo==='calendario') await renderCalendario(c);
    else if(modulo==='comprovantes') await renderComprovantes(c);
    else if(modulo==='configuracoes') await renderConfiguracoes(c);
  }catch(e){
    c.innerHTML='<div class="erro">'+esc(e.message)+'</div>';
    if(String(e.message).toLowerCase().includes('sessão')){
      setTimeout(sair,900);
    }
  }
}

/* =========================================================
   FINANCEIRO
========================================================= */

async function renderFinanceiro(c){
  subtelaModulo=null;
  const ref=referenciaAtual();

  const [resumo,lista]=await Promise.all([
    chamarApi({action:'resumoFinanceiro',token:sessao.token,referencia:ref}),
    chamarApi({action:'listarFinanceiro',token:sessao.token,referencia:ref})
  ]);

  assertOk(resumo);
  assertOk(lista);

  c.innerHTML=
    cabecalho('🪙','Financeiro','Contas, pagamentos e comprovantes')+
    `<div class="cards-resumo">
      <div class="card-resumo"><small>Entradas</small><strong class="verde">${moeda(resumo.dados.entradas)}</strong></div>
      <div class="card-resumo"><small>Saídas</small><strong class="vermelho">${moeda(resumo.dados.saidas)}</strong></div>
      <div class="card-resumo"><small>Saldo do mês</small><strong class="${resumo.dados.saldo>=0?'verde':'vermelho'}">${moeda(resumo.dados.saldo)}</strong></div>
      <div class="card-resumo"><small>Atrasadas</small><strong class="vermelho">${moeda(resumo.dados.atrasado)}</strong></div>
    </div>
    <div class="painel">
      <div class="painel-titulo"><h3>Contas do mês</h3><span>${lista.dados.length}</span></div>
      <div class="lista-modulo">
        ${lista.dados.length?lista.dados.map(itemFinanceiro).join(''):'<div class="vazio">Nenhum lançamento neste mês.</div>'}
      </div>
    </div>`;

  c.querySelectorAll('[data-pagar-id]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const id=btn.dataset.pagarId;
      const item=(lista.dados||[]).find(x=>String(x.id)===String(id));
      if(!item) return toast('Conta não encontrada.');
      await renderRegistrarPagamento(c,item);
    });
  });
}

function itemFinanceiro(x){
  const st=String(x.status||'').toLowerCase().replaceAll('_','');
  const podePagar=
    x.tipo==='DESPESA' &&
    ['A_PAGAR','ATRASADO'].includes(String(x.status||'').toUpperCase());

  return `<div class="item-lista item-financeiro">
    <div class="info-item-financeiro">
      <div class="descricao">${esc(x.descricao||'Sem descrição')}</div>
      <div class="meta">${esc(x.categoria||'')} ${x.vencimento?'• '+dataBR(x.vencimento):''}</div>
      <span class="badge ${st}">${esc(String(x.status||'').replaceAll('_',' '))}</span>
    </div>
    <div class="lado-item-financeiro">
      <div class="valor ${x.tipo==='RECEITA'?'verde':'vermelho'}">${x.tipo==='RECEITA'?'+ ':'- '}${moeda(x.valor)}</div>
      ${podePagar?`<button class="botao-pagar" data-pagar-id="${escAttr(x.id)}">💳 Registrar pagamento</button>`:''}
    </div>
  </div>`;
}

async function renderRegistrarPagamento(c,item){
  subtelaModulo='registrar-pagamento';
  rolarModuloTopo();

  const venc=item.vencimento?dataBR(item.vencimento):'Sem vencimento';
  const status=String(item.status||'').replaceAll('_',' ');
  const valor=Number(item.valor||0).toFixed(2);

  c.innerHTML=
    cabecalho('🧾','Registrar pagamento','Preencha os dados e anexe o comprovante')+
    `<section class="conta-pagamento-resumo">
      <div>
        <strong>${esc(item.descricao||'Conta')}</strong>
        <span>${esc(item.categoria||'')} • ${esc(venc)}</span>
      </div>
      <div class="resumo-pagamento-direita">
        <strong>${moeda(item.valor)}</strong>
        <span class="badge ${String(item.status||'').toLowerCase().replaceAll('_','')}">${esc(status)}</span>
      </div>
    </section>

    <form id="form-registrar-pagamento" class="form-pagamento">
      <label class="campo-pagamento">
        <span>💲 Valor pago *</span>
        <input id="pagamento-valor" type="number" min="0.01" step="0.01" inputmode="decimal" value="${escAttr(valor)}" required>
      </label>

      <label class="campo-pagamento">
        <span>📅 Data do pagamento *</span>
        <input id="pagamento-data" type="date" value="${dataInputHoje()}" required>
      </label>

      <div class="campo-pagamento">
        <span>💳 Forma de pagamento *</span>
        <input id="pagamento-forma" type="hidden" value="PIX">
        <div class="formas-pagamento">
          <button type="button" class="forma-pagamento ativo" data-forma="PIX">🔷 PIX</button>
          <button type="button" class="forma-pagamento" data-forma="CRÉDITO">💳 Crédito</button>
          <button type="button" class="forma-pagamento" data-forma="DÉBITO">🏦 Débito</button>
          <button type="button" class="forma-pagamento" data-forma="DINHEIRO">💵 Dinheiro</button>
        </div>
      </div>

      <label class="campo-pagamento">
        <span>💬 Observação</span>
        <textarea id="pagamento-observacao" rows="3" maxlength="250" placeholder="Ex.: pago pelo app do banco"></textarea>
      </label>

      <div class="campo-pagamento campo-comprovante">
        <div class="linha-campo-comprovante">
          <span>📎 Anexar comprovante</span>
          <small>JPG, PNG ou PDF • máx. 10 MB</small>
        </div>
        <label class="seletor-arquivo">
          <input id="pagamento-arquivo" type="file" accept="image/jpeg,image/png,application/pdf">
          <strong>📎 Escolher arquivo</strong>
          <span id="nome-arquivo">Nenhum arquivo selecionado</span>
        </label>
      </div>

      <button id="btn-salvar-pagamento" type="submit" class="botao-salvar-pagamento">✅ Salvar pagamento</button>
      <button id="btn-cancelar-pagamento" type="button" class="botao-cancelar-pagamento">Cancelar</button>
    </form>`;

  c.querySelectorAll('.forma-pagamento').forEach(btn=>{
    btn.addEventListener('click',()=>{
      c.querySelectorAll('.forma-pagamento').forEach(x=>x.classList.remove('ativo'));
      btn.classList.add('ativo');
      $('pagamento-forma').value=btn.dataset.forma;
    });
  });

  $('pagamento-arquivo').addEventListener('change',e=>{
    const file=e.target.files?.[0];
    $('nome-arquivo').textContent=file?`${file.name} • ${formatarBytes(file.size)}`:'Nenhum arquivo selecionado';
  });

  $('btn-cancelar-pagamento').addEventListener('click',async()=>{
    subtelaModulo=null;
    c.innerHTML='<div class="carregando">Carregando...</div>';
    await renderFinanceiro(c);
    rolarModuloTopo();
  });

  $('form-registrar-pagamento').addEventListener('submit',async e=>{
    e.preventDefault();

    const botao=$('btn-salvar-pagamento');
    const valorPago=Number($('pagamento-valor').value||0);
    const dataPagamento=$('pagamento-data').value;
    const formaPagamento=$('pagamento-forma').value;
    const observacao=$('pagamento-observacao').value.trim();
    const file=$('pagamento-arquivo').files?.[0]||null;

    if(valorPago<=0) return toast('Informe um valor pago válido.');
    if(!dataPagamento) return toast('Informe a data do pagamento.');
    if(!formaPagamento) return toast('Escolha a forma de pagamento.');

    botao.disabled=true;
    botao.textContent=file?'Enviando comprovante...':'Salvando...';

    try{
      const payload={
        action:'registrarPagamento',
        token:sessao.token,
        id:item.id,
        dados:{
          valorPago,
          dataPagamento,
          formaPagamento,
          observacao
        }
      };

      if(file){
        payload.arquivo=await arquivoParaPayload(file);
      }

      botao.textContent='Salvando pagamento...';
      const r=await chamarApi(payload);
      assertOk(r);

      toast('Pagamento registrado com sucesso ✅');
      subtelaModulo=null;
      await renderFinanceiro(c);
      rolarModuloTopo();
    }catch(err){
      toast(err.message||'Erro ao registrar pagamento.');
      botao.disabled=false;
      botao.textContent='✅ Salvar pagamento';
    }
  });
}

/* =========================================================
   MERCADO
========================================================= */

async function renderMercado(c){
  subtelaModulo=null;
  const r=await chamarApi({action:'listarMercado',token:sessao.token,referencia:referenciaAtual()});
  assertOk(r);
  const itens=r.dados||[];
  c.innerHTML=cabecalho('🛒','Mercado','Lista de compras e registros')+`<div class="painel"><div class="painel-titulo"><h3>Minha lista de compras</h3><span>${itens.length} itens</span></div><div class="lista-modulo">${itens.length?itens.map(itemMercado).join(''):'<div class="vazio">Sua lista está vazia. Você pode preencher a aba MERCADO na planilha.</div>'}</div></div>`;
  c.querySelectorAll('[data-mercado-id]').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true;
    try{
      const novo=btn.dataset.ok!=='SIM';
      const rr=await chamarApi({action:'atualizarItemMercado',token:sessao.token,id:btn.dataset.mercadoId,dados:{comprado:novo?'SIM':'NÃO'}});
      assertOk(rr);
      await renderMercado(c);
    }catch(e){
      toast(e.message);
    }finally{
      btn.disabled=false;
    }
  }));
}

function itemMercado(x){
  const ok=String(x.comprado).toUpperCase()==='SIM';
  return `<div class="item-lista"><div><div class="descricao">${esc(x.produto)}</div><div class="meta">${esc(x.categoria||'')} • ${esc(String(x.quantidade||''))} ${esc(x.unidade||'')}</div></div><button class="check-mercado ${ok?'ok':''}" data-mercado-id="${esc(x.id)}" data-ok="${ok?'SIM':'NÃO'}">${ok?'✓':''}</button></div>`;
}

/* =========================================================
   RELATÓRIOS / CALENDÁRIO / COMPROVANTES / CONFIG
========================================================= */

async function renderRelatorios(c){
  subtelaModulo=null;
  const ref=referenciaAtual();
  const r=await chamarApi({action:'resumoFinanceiro',token:sessao.token,referencia:ref});
  assertOk(r);
  const d=r.dados;
  const max=Math.max(d.entradas,d.saidas,1);
  c.innerHTML=cabecalho('📊','Relatórios','Resumo da vida financeira no mês')+`<div class="cards-resumo"><div class="card-resumo"><small>Entradas</small><strong class="verde">${moeda(d.entradas)}</strong></div><div class="card-resumo"><small>Saídas</small><strong class="vermelho">${moeda(d.saidas)}</strong></div><div class="card-resumo"><small>Saldo</small><strong class="${d.saldo>=0?'verde':'vermelho'}">${moeda(d.saldo)}</strong></div><div class="card-resumo"><small>A pagar</small><strong class="amarelo">${moeda(d.aPagar)}</strong></div></div><div class="painel"><div class="painel-titulo"><h3>Comparativo do mês</h3></div><div class="grafico-barras"><div class="barra" style="height:${Math.max(10,d.entradas/max*100)}%"><span>Entradas</span></div><div class="barra" style="height:${Math.max(10,d.saidas/max*100)}%;background:#a54b17"><span>Saídas</span></div></div></div>`;
}

async function renderCalendario(c){
  subtelaModulo=null;
  const r=await chamarApi({action:'listarFinanceiro',token:sessao.token,referencia:referenciaAtual()});
  assertOk(r);
  const itens=(r.dados||[]).filter(x=>x.tipo==='DESPESA'&&x.vencimento).sort((a,b)=>new Date(a.vencimento)-new Date(b.vencimento));
  c.innerHTML=cabecalho('📅','Calendário','Vencimentos e contas futuras')+`<div class="painel"><div class="painel-titulo"><h3>Vencimentos do mês</h3><span>${itens.length}</span></div><div class="lista-modulo">${itens.length?itens.map(itemFinanceiro).join(''):'<div class="vazio">Nenhum vencimento cadastrado.</div>'}</div></div>`;
}

async function renderComprovantes(c){
  subtelaModulo=null;
  const r=await chamarApi({action:'listarComprovantes',token:sessao.token,referencia:referenciaAtual()});
  assertOk(r);
  const itens=r.dados||[];
  c.innerHTML=cabecalho('🧾','Comprovantes','Arquivos salvos no Drive')+`<div class="painel"><div class="painel-titulo"><h3>Comprovantes</h3><span>${itens.length}</span></div><div class="lista-modulo">${itens.length?itens.map(x=>`<div class="item-lista"><div><div class="descricao">${esc(x.descricao)}</div><div class="meta">${esc(x.origem)}${x.data?' • '+dataBR(x.data):''}</div></div><a class="link-comprovante" href="${escAttr(x.url)}" target="_blank" rel="noopener">Abrir</a></div>`).join(''):'<div class="vazio">Nenhum comprovante salvo neste mês.</div>'}</div></div>`;
}

async function renderConfiguracoes(c){
  subtelaModulo=null;
  const r=await chamarApi({action:'listarConfig',token:sessao.token});
  assertOk(r);
  const dados=r.dados||[];
  const grupos={};
  dados.forEach(x=>(grupos[x.tipo]??=[]).push(x));
  c.innerHTML=cabecalho('⚙️','Configurações','Categorias, pagamentos e preferências')+Object.entries(grupos).map(([tipo,itens])=>`<div class="painel grupo-config"><h3>${tituloTipo(tipo)}</h3>${itens.map(x=>`<div class="config-linha"><strong>${esc(x.nome)}</strong>${x.valor?`<div class="meta">${esc(String(x.valor))}</div>`:''}</div>`).join('')}</div>`).join('');
}

/* =========================================================
   HELPERS
========================================================= */

function cabecalho(i,t,s){
  return `<section class="cabecalho-modulo"><div class="icone-grande">${i}</div><div><h2>${esc(t)}</h2><p>${esc(s)}</p></div></section>`;
}

function referenciaAtual(){
  const d=new Date();
  const m=String(d.getMonth()+1).padStart(2,'0');
  return `${m}/${d.getFullYear()}`;
}

function dataInputHoje(){
  const d=new Date();
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
}

function moeda(v){
  return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
}

function dataBR(v){
  const d=new Date(v);
  return isNaN(d)?'':d.toLocaleDateString('pt-BR');
}

function tituloTipo(t){
  return ({
    CATEGORIA_RECEITA:'Receitas',
    CATEGORIA_DESPESA:'Despesas',
    CATEGORIA_MERCADO:'Mercado',
    FORMA_PAGAMENTO:'Formas de pagamento',
    SISTEMA:'Sistema'
  })[t]||t.replaceAll('_',' ');
}

function assertOk(r){
  if(!r||!r.sucesso) throw new Error(r?.erro||'Erro na API');
}

function $(id){
  return document.getElementById(id);
}

function esc(v){
  return String(v??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));
}

function escAttr(v){
  return esc(v);
}

function toast(m){
  const t=$('toast');
  t.textContent=m;
  t.classList.remove('escondido');
  clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.add('escondido'),3000);
}

function rolarModuloTopo(){
  const tela=$('tela-modulo');
  if(tela && typeof tela.scrollTo==='function') tela.scrollTo({top:0,behavior:'auto'});
  window.scrollTo(0,0);
}

function formatarBytes(bytes){
  if(!bytes) return '0 KB';
  if(bytes<1024*1024) return `${Math.max(1,Math.round(bytes/1024))} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

function arquivoParaPayload(file){
  const permitidos=['image/jpeg','image/png','application/pdf'];
  const max=10*1024*1024;

  if(!permitidos.includes(file.type)){
    throw new Error('Use um comprovante JPG, PNG ou PDF.');
  }

  if(file.size>max){
    throw new Error('O comprovante deve ter no máximo 10 MB.');
  }

  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{
      const resultado=String(reader.result||'');
      const base64=resultado.includes('base64,')?resultado.split('base64,')[1]:resultado;
      resolve({
        nome:file.name,
        mimeType:file.type,
        base64
      });
    };
    reader.onerror=()=>reject(new Error('Não foi possível ler o comprovante.'));
    reader.readAsDataURL(file);
  });
}

async function chamarApi(dados){
  const r=await fetch(API_URL,{
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(dados),
    cache:'no-store'
  });

  if(!r.ok) throw new Error('Erro de comunicação com o servidor.');

  const t=await r.text();
  try{
    return JSON.parse(t);
  }catch(e){
    throw new Error('Resposta inválida da API.');
  }
}
