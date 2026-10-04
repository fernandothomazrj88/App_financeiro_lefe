const API_URL='https://script.google.com/macros/s/AKfycbxvqJpcrAHSgxTDJ7-U_spCaCmJf2oCbOl5qo3ULdH0lWdggkJYqJhkQCLzkib0t_yEvg/exec';

let sessao={
  token:localStorage.getItem('vf_token'),
  usuario:JSON.parse(localStorage.getItem('vf_usuario')||'null')
};

let moduloAtual=null;
let subtelaModulo=null;

const LEFE_APP_VERSION='26.13';

// Cache leve em memória para o módulo Casa.
// Evita novas leituras da API ao trocar de aba rapidamente.
const CASA_CACHE_TTL=60000;
const casaCache={
  tarefasAtivas:null,
  tarefasAtivasEm:0,
  tarefasHistorico:null,
  tarefasHistoricoEm:0,
  rotinas:null,
  rotinasEm:0
};

function limparCacheCasa(){
  casaCache.tarefasAtivas=null;
  casaCache.tarefasAtivasEm=0;
  casaCache.tarefasHistorico=null;
  casaCache.tarefasHistoricoEm=0;
  casaCache.rotinas=null;
  casaCache.rotinasEm=0;
}

function cacheCasaValido(valor,quando){
  return Array.isArray(valor) && (Date.now()-quando)<CASA_CACHE_TTL;
}

async function prepararAtualizacaoLeFe(){
  try{
    const chave='lefe-home-cache-reset-'+LEFE_APP_VERSION;
    if(localStorage.getItem(chave)==='ok') return;
    localStorage.setItem(chave,'ok');
    if('caches' in window){
      const nomes=await caches.keys();
      await Promise.all(nomes.filter(n=>n.startsWith('lefe-home-')).map(n=>caches.delete(n)));
    }
    if('serviceWorker' in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.update().catch(()=>{})));
    }
  }catch(e){
    console.warn('Limpeza de cache ignorada:',e);
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  // A limpeza de cache/atualização do PWA acontece em segundo plano.
  // Assim o app pode mostrar a tela imediatamente, sem esperar o Service Worker.
  iniciarApp();
  prepararAtualizacaoLeFe();
});

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register('./service-worker.js?v=26.13');
      await reg.update();
      console.log('LeFe Home PWA v26.8 ativo.',reg.scope);
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
  const financeiroSubtela=[
    'registrar-pagamento',
    'nova-despesa',
    'nova-receita'
  ];

  if(moduloAtual==='financeiro' && financeiroSubtela.includes(subtelaModulo)){
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

  if(moduloAtual==='mercado' && (subtelaModulo==='novo-item-mercado' || subtelaModulo==='finalizar-compra-mercado')){
    subtelaModulo=null;
    const c=$('modulo-conteudo');
    c.innerHTML='<div class="carregando">Carregando...</div>';
    try{
      await renderMercado(c);
      rolarModuloTopo();
    }catch(e){
      c.innerHTML='<div class="erro">'+esc(e.message)+'</div>';
    }
    return;
  }

  if(moduloAtual==='compras-planejadas' && subtelaModulo==='nova-compra-planejada'){
    subtelaModulo=null;
    const c=$('modulo-conteudo');
    c.innerHTML='<div class="carregando">Carregando...</div>';
    try{
      await renderComprasPlanejadas(c);
      rolarModuloTopo();
    }catch(e){
      c.innerHTML='<div class="erro">'+esc(e.message)+'</div>';
    }
    return;
  }

  if(moduloAtual==='casa' && subtelaModulo==='nova-tarefa-casa'){
    subtelaModulo=null;
    const c=$('modulo-conteudo');
    c.innerHTML='<div class="carregando">Carregando...</div>';
    try{
      await renderCasa(c);
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
    else if(modulo==='casa') await renderCasa(c);
    else if(modulo==='compras-planejadas') await renderComprasPlanejadas(c);
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
    `<div class="cabecalho-financeiro">
      ${cabecalho('🪙','Financeiro','Contas, pagamentos e comprovantes')}
      <div class="acoes-nova-financeiro">
        <button id="btn-nova-despesa" type="button" class="botao-nova-despesa">＋ Despesa</button>
        <button id="btn-nova-receita" type="button" class="botao-nova-receita">＋ Receita</button>
      </div>
    </div>`+
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

  $('btn-nova-despesa').addEventListener('click',async()=>{
    await renderNovaDespesa(c);
  });

  $('btn-nova-receita').addEventListener('click',async()=>{
    await renderNovaReceita(c);
  });

  c.querySelectorAll('[data-liquidar-id]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const id=btn.dataset.liquidarId;
      const item=(lista.dados||[]).find(x=>String(x.id)===String(id));
      if(!item) return toast('Lançamento não encontrado.');
      await renderRegistrarPagamento(c,item);
    });
  });
}

function itemFinanceiro(x){
  const st=String(x.status||'').toLowerCase().replaceAll('_','');
  const ehReceita=x.tipo==='RECEITA';
  const podeLiquidar=
    (x.tipo==='DESPESA' && ['A_PAGAR','ATRASADO'].includes(String(x.status||'').toUpperCase())) ||
    (x.tipo==='RECEITA' && String(x.status||'').toUpperCase()==='A_RECEBER');
  const textoBotao=ehReceita?'💰 Registrar recebimento':'💳 Registrar pagamento';

  return `<div class="item-lista item-financeiro">
    <div class="info-item-financeiro">
      <div class="descricao">${esc(x.descricao||'Sem descrição')}</div>
      <div class="meta">${esc(x.categoria||'')} ${x.vencimento?'• '+dataBR(x.vencimento):''}</div>
      <span class="badge ${st}">${esc(String(x.status||'').replaceAll('_',' '))}</span>
    </div>
    <div class="lado-item-financeiro">
      <div class="valor ${ehReceita?'verde':'vermelho'}">${ehReceita?'+ ':'- '}${moeda(x.valor)}</div>
      ${podeLiquidar?`<button class="botao-pagar" data-liquidar-id="${escAttr(x.id)}">${textoBotao}</button>`:''}
    </div>
  </div>`;
}

async function renderNovaDespesa(c){
  subtelaModulo='nova-despesa';
  rolarModuloTopo();

  let categorias=[
    'Moradia',
    'Energia',
    'Internet',
    'Telefone',
    'Cartões',
    'Dívidas',
    'Assinaturas',
    'Educação',
    'Mercado',
    'Saúde',
    'Transporte',
    'Lazer',
    'Outros'
  ];

  try{
    const r=await chamarApi({
      action:'listarConfig',
      token:sessao.token,
      tipo:'CATEGORIA_DESPESA'
    });
    assertOk(r);

    const configuradas=(r.dados||[])
      .map(x=>String(x.nome||'').trim())
      .filter(Boolean);

    if(configuradas.length) categorias=[...new Set(configuradas)];
  }catch(e){
    // Mantém categorias padrão para que o cadastro continue disponível.
  }

  const ref=referenciaAtual();
  const refInput=ref.split('/').reverse().join('-');

  c.innerHTML=
    cabecalho('💸','Nova despesa','Cadastre uma nova conta ou gasto')+
    `<form id="form-nova-despesa" class="form-pagamento form-nova-despesa">

      <label class="campo-pagamento">
        <span>📝 Descrição *</span>
        <input id="despesa-descricao" type="text" maxlength="120" placeholder="Ex.: Conta de luz" required>
      </label>

      <label class="campo-pagamento">
        <span>💲 Valor *</span>
        <input id="despesa-valor" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00" required>
      </label>

      <label class="campo-pagamento">
        <span>🏷️ Categoria *</span>
        <select id="despesa-categoria" required>
          <option value="">Selecione uma categoria</option>
          ${categorias.map(x=>`<option value="${escAttr(x)}">${esc(x)}</option>`).join('')}
        </select>
      </label>

      <label class="campo-pagamento">
        <span>📅 Vencimento *</span>
        <input id="despesa-vencimento" type="date" value="${dataInputHoje()}" required>
        <small class="ajuda-campo">Se a data já passou, a conta será criada como atrasada.</small>
      </label>

      <label class="campo-pagamento">
        <span>🗓️ Referência *</span>
        <input id="despesa-referencia" type="month" value="${escAttr(refInput)}" required>
        <small class="ajuda-campo">É o mês ao qual esta despesa pertence.</small>
      </label>

      <label class="campo-pagamento">
        <span>🔁 Recorrente</span>
        <select id="despesa-recorrente">
          <option value="NÃO">Não</option>
          <option value="SIM">Sim</option>
        </select>
      </label>

      <label class="campo-pagamento">
        <span>💬 Observação</span>
        <textarea id="despesa-observacao" rows="3" maxlength="250" placeholder="Ex.: vence todo dia 10"></textarea>
      </label>

      <button id="btn-salvar-despesa" type="submit" class="botao-salvar-pagamento">💾 Salvar despesa</button>
      <button id="btn-cancelar-despesa" type="button" class="botao-cancelar-pagamento">Cancelar</button>
    </form>`;

  $('btn-cancelar-despesa').addEventListener('click',async()=>{
    subtelaModulo=null;
    c.innerHTML='<div class="carregando">Carregando...</div>';
    await renderFinanceiro(c);
    rolarModuloTopo();
  });

  $('form-nova-despesa').addEventListener('submit',async e=>{
    e.preventDefault();

    const botao=$('btn-salvar-despesa');
    const descricao=$('despesa-descricao').value.trim();
    const valor=Number($('despesa-valor').value||0);
    const categoria=$('despesa-categoria').value;
    const vencimento=$('despesa-vencimento').value;
    const refMes=$('despesa-referencia').value;
    const recorrente=$('despesa-recorrente').value;
    const observacao=$('despesa-observacao').value.trim();

    if(!descricao) return toast('Informe a descrição.');
    if(valor<=0) return toast('Informe um valor válido.');
    if(!categoria) return toast('Escolha uma categoria.');
    if(!vencimento) return toast('Informe o vencimento.');
    if(!refMes) return toast('Informe a referência.');

    const referencia=`${refMes.slice(5,7)}/${refMes.slice(0,4)}`;

    botao.disabled=true;
    botao.textContent='Salvando despesa...';

    try{
      const r=await chamarApi({
        action:'novoLancamento',
        token:sessao.token,
        dados:{
          tipo:'DESPESA',
          descricao,
          categoria,
          referencia,
          valor,
          vencimento,
          dataPagamento:'',
          formaPagamento:'',
          parcelaAtual:'',
          totalParcelas:'',
          grupoParcela:'',
          observacao,
          recorrente
        }
      });

      assertOk(r);

      toast(
        r.status==='ATRASADO'
          ? 'Despesa cadastrada como atrasada ⚠️'
          : 'Despesa cadastrada com sucesso ✅'
      );

      subtelaModulo=null;
      await renderFinanceiro(c);
      rolarModuloTopo();
    }catch(err){
      toast(err.message||'Erro ao cadastrar despesa.');
      botao.disabled=false;
      botao.textContent='💾 Salvar despesa';
    }
  });
}

async function renderNovaReceita(c){
  subtelaModulo='nova-receita';
  rolarModuloTopo();

  let categorias=['Salário','Férias','Bônus','Outros'];

  try{
    const r=await chamarApi({
      action:'listarConfig',
      token:sessao.token,
      tipo:'CATEGORIA_RECEITA'
    });
    assertOk(r);

    const configuradas=(r.dados||[])
      .map(x=>String(x.nome||'').trim())
      .filter(Boolean);

    if(configuradas.length) categorias=[...new Set(configuradas)];
  }catch(e){
    // Mantém categorias padrão para que o cadastro continue disponível.
  }

  const ref=referenciaAtual();
  const refInput=ref.split('/').reverse().join('-');

  c.innerHTML=
    cabecalho('💰','Nova receita','Cadastre uma entrada de dinheiro')+
    `<form id="form-nova-receita" class="form-pagamento form-nova-receita">

      <label class="campo-pagamento">
        <span>📝 Descrição *</span>
        <input id="receita-descricao" type="text" maxlength="120" placeholder="Ex.: Salário" required>
      </label>

      <label class="campo-pagamento">
        <span>💲 Valor *</span>
        <input id="receita-valor" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00" required>
      </label>

      <label class="campo-pagamento">
        <span>🏷️ Categoria *</span>
        <select id="receita-categoria" required>
          <option value="">Selecione uma categoria</option>
          ${categorias.map(x=>`<option value="${escAttr(x)}">${esc(x)}</option>`).join('')}
        </select>
      </label>

      <label class="campo-pagamento">
        <span>📅 Data prevista *</span>
        <input id="receita-vencimento" type="date" value="${dataInputHoje()}" required>
        <small class="ajuda-campo">A receita será criada como A RECEBER até você registrar o recebimento.</small>
      </label>

      <label class="campo-pagamento">
        <span>🗓️ Referência *</span>
        <input id="receita-referencia" type="month" value="${escAttr(refInput)}" required>
        <small class="ajuda-campo">É o mês ao qual esta receita pertence.</small>
      </label>

      <label class="campo-pagamento">
        <span>🔁 Recorrente</span>
        <select id="receita-recorrente">
          <option value="NÃO">Não</option>
          <option value="SIM">Sim</option>
        </select>
      </label>

      <label class="campo-pagamento">
        <span>💬 Observação</span>
        <textarea id="receita-observacao" rows="3" maxlength="250" placeholder="Ex.: pagamento mensal"></textarea>
      </label>

      <button id="btn-salvar-receita" type="submit" class="botao-salvar-pagamento">💾 Salvar receita</button>
      <button id="btn-cancelar-receita" type="button" class="botao-cancelar-pagamento">Cancelar</button>
    </form>`;

  $('btn-cancelar-receita').addEventListener('click',async()=>{
    subtelaModulo=null;
    c.innerHTML='<div class="carregando">Carregando...</div>';
    await renderFinanceiro(c);
    rolarModuloTopo();
  });

  $('form-nova-receita').addEventListener('submit',async e=>{
    e.preventDefault();

    const botao=$('btn-salvar-receita');
    const descricao=$('receita-descricao').value.trim();
    const valor=Number($('receita-valor').value||0);
    const categoria=$('receita-categoria').value;
    const vencimento=$('receita-vencimento').value;
    const refMes=$('receita-referencia').value;
    const recorrente=$('receita-recorrente').value;
    const observacao=$('receita-observacao').value.trim();

    if(!descricao) return toast('Informe a descrição.');
    if(valor<=0) return toast('Informe um valor válido.');
    if(!categoria) return toast('Escolha uma categoria.');
    if(!vencimento) return toast('Informe a data prevista.');
    if(!refMes) return toast('Informe a referência.');

    const referencia=`${refMes.slice(5,7)}/${refMes.slice(0,4)}`;

    botao.disabled=true;
    botao.textContent='Salvando receita...';

    try{
      const r=await chamarApi({
        action:'novoLancamento',
        token:sessao.token,
        dados:{
          tipo:'RECEITA',
          descricao,
          categoria,
          referencia,
          valor,
          vencimento,
          dataPagamento:'',
          formaPagamento:'',
          parcelaAtual:'',
          totalParcelas:'',
          grupoParcela:'',
          observacao,
          recorrente
        }
      });

      assertOk(r);
      toast('Receita cadastrada com sucesso ✅');
      subtelaModulo=null;
      await renderFinanceiro(c);
      rolarModuloTopo();
    }catch(err){
      toast(err.message||'Erro ao cadastrar receita.');
      botao.disabled=false;
      botao.textContent='💾 Salvar receita';
    }
  });
}

async function renderRegistrarPagamento(c,item){
  subtelaModulo='registrar-pagamento';
  rolarModuloTopo();

  const ehReceita=item.tipo==='RECEITA';
  const titulo=ehReceita?'Registrar recebimento':'Registrar pagamento';
  const subtitulo=ehReceita?'Preencha os dados do recebimento e anexe o comprovante':'Preencha os dados e anexe o comprovante';
  const verbo=ehReceita?'recebido':'pago';
  const venc=item.vencimento?dataBR(item.vencimento):'Sem data';
  const status=String(item.status||'').replaceAll('_',' ');
  const valor=Number(item.valor||0).toFixed(2);

  c.innerHTML=
    cabecalho(ehReceita?'💰':'🧾',titulo,subtitulo)+
    `<section class="conta-pagamento-resumo">
      <div>
        <strong>${esc(item.descricao||'Lançamento')}</strong>
        <span>${esc(item.categoria||'')} • ${esc(venc)}</span>
      </div>
      <div class="resumo-pagamento-direita">
        <strong>${moeda(item.valor)}</strong>
        <span class="badge ${String(item.status||'').toLowerCase().replaceAll('_','')}">${esc(status)}</span>
      </div>
    </section>

    <form id="form-registrar-pagamento" class="form-pagamento">
      <label class="campo-pagamento">
        <span>💲 Valor ${verbo} *</span>
        <input id="pagamento-valor" type="number" min="0.01" step="0.01" inputmode="decimal" value="${escAttr(valor)}" required>
      </label>

      <label class="campo-pagamento">
        <span>📅 Data do ${ehReceita?'recebimento':'pagamento'} *</span>
        <input id="pagamento-data" type="date" value="${dataInputHoje()}" required>
      </label>

      <div class="campo-pagamento">
        <span>💳 Forma ${ehReceita?'de recebimento':'de pagamento'} *</span>
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
        <textarea id="pagamento-observacao" rows="3" maxlength="250" placeholder="Ex.: ${ehReceita?'recebido via banco':'pago pelo app do banco'}"></textarea>
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

      <button id="btn-salvar-pagamento" type="submit" class="botao-salvar-pagamento">✅ Salvar ${ehReceita?'recebimento':'pagamento'}</button>
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

    if(valorPago<=0) return toast(`Informe um valor ${verbo} válido.`);
    if(!dataPagamento) return toast(`Informe a data do ${ehReceita?'recebimento':'pagamento'}.`);
    if(!formaPagamento) return toast(`Escolha a forma ${ehReceita?'de recebimento':'de pagamento'}.`);

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

      botao.textContent=`Salvando ${ehReceita?'recebimento':'pagamento'}...`;
      const r=await chamarApi(payload);
      assertOk(r);

      toast(`${ehReceita?'Recebimento':'Pagamento'} registrado com sucesso ✅`);
      subtelaModulo=null;
      await renderFinanceiro(c);
      rolarModuloTopo();
    }catch(err){
      toast(err.message||`Erro ao registrar ${ehReceita?'recebimento':'pagamento'}.`);
      botao.disabled=false;
      botao.textContent=`✅ Salvar ${ehReceita?'recebimento':'pagamento'}`;
    }
  });
}


/* =========================================================
   MERCADO
========================================================= */

async function renderMercado(c){
  subtelaModulo='listas-mercado';
  rolarModuloTopo();
  try{
    const r=await chamarApi({action:'listarListasMercado',token:sessao.token});
    assertOk(r);
    renderListasMercado(c,r.dados||[]);
  }catch(e){
    toast(e.message||'Não foi possível carregar suas listas de mercado.');
    c.innerHTML=cabecalho('🛒','Mercado','Não foi possível carregar as listas')+`<div class="painel"><div class="vazio">Tente novamente em alguns segundos.</div></div>`;
  }
}

function renderListasMercado(c,listas){
  const abertas=(listas||[]).filter(x=>String(x.status||'ABERTA').toUpperCase()==='ABERTA');
  const finalizadas=(listas||[]).filter(x=>String(x.status||'').toUpperCase()!=='ABERTA');

  const cardLista=x=>{
    const aberta=String(x.status||'ABERTA').toUpperCase()==='ABERTA';
    const statusTxt=aberta?'EM ANDAMENTO':String(x.status||'').toUpperCase()==='FINALIZADA'?'FINALIZADA':'ARQUIVADA';
    const statusClass=aberta?'concluida':statusTxt==='FINALIZADA'?'concluida':'cancelada';
    const data=x.dataAtualizacao||x.dataCriacao;
    const dataFmt=data?new Date(data).toLocaleDateString('pt-BR'):'—';
    const podeExcluir=!Number(x.itens||0)&&!Number(x.totalCompras||0);
    return `<div class="lista-mercado-card">
      <button type="button" class="lista-mercado-card-main" data-abrir-lista-mercado="${escAttr(x.id)}">
        <div class="lista-mercado-card-icone">${aberta?'🛒':'🧾'}</div>
        <div class="lista-mercado-card-corpo">
          <div class="lista-mercado-card-topo"><strong>${esc(x.nome||'Lista sem nome')}</strong><span class="badge badge-casa ${statusClass}">${statusTxt}</span></div>
          <div class="meta">${Number(x.itens||0)} ${Number(x.itens||0)===1?'item':'itens'} • ${Number(x.pendentes||0)} pendentes${Number(x.quantidadeCompras||0)?' • '+Number(x.quantidadeCompras||0)+' compra(s)':''}</div>
          <div class="meta">Atualizada em ${dataFmt}${Number(x.totalCompras||0)>0?' • Gasto: '+moeda(x.totalCompras):''}</div>
        </div>
        <span class="lista-mercado-seta">›</span>
      </button>
      <div class="lista-mercado-card-acoes">
        <button type="button" class="rotina-mini" data-editar-lista-mercado="${escAttr(x.id)}">✏️ Renomear</button>
        ${podeExcluir?`<button type="button" class="rotina-mini perigo" data-excluir-lista-mercado="${escAttr(x.id)}">🗑️ Excluir</button>`:''}
      </div>
    </div>`;
  };

  c.innerHTML=`<div class="cabecalho-modulo cabecalho-mercado">
      <div class="icone-grande">🛒</div>
      <div><h2>Mercado</h2><p>Crie listas separadas para cada compra.</p></div>
      <div class="acoes-mercado-topo"><button id="btn-nova-lista-mercado" type="button" class="botao-nova-despesa">＋ Lista</button></div>
    </div>
    <div class="painel mercado-listas-intro">
      <div class="painel-titulo"><h3>📋 Minhas listas</h3><span>${(listas||[]).length}</span></div>
      <p class="ajuda-campo">Cada lista é independente. Toque em uma lista para abrir os itens, colocar preços e finalizar a compra.</p>
      <div class="barra-mercado-superior">
        <button id="btn-historico-mercado" type="button" class="botao-exportar-mercado">📜 Histórico de compras</button>
      </div>
    </div>
    ${abertas.length?`<div class="painel"><div class="painel-titulo"><h3>🛒 Em andamento</h3><span>${abertas.length}</span></div><div class="lista-mercado-cards">${abertas.map(cardLista).join('')}</div></div>`:''}
    ${finalizadas.length?`<div class="painel"><div class="painel-titulo"><h3>🧾 Finalizadas e arquivadas</h3><span>${finalizadas.length}</span></div><div class="lista-mercado-cards">${finalizadas.map(cardLista).join('')}</div></div>`:''}
    ${!(listas||[]).length?`<div class="painel"><div class="vazio">Você ainda não criou nenhuma lista. Clique em ＋ Lista para começar.</div></div>`:''}`;

  $('btn-nova-lista-mercado').onclick=()=>renderNovaListaMercado(c);
  $('btn-historico-mercado').onclick=()=>renderHistoricoMercado(c);

  c.querySelectorAll('[data-abrir-lista-mercado]').forEach(btn=>btn.onclick=()=>renderListaMercadoDetalhe(c,btn.dataset.abrirListaMercado));
  c.querySelectorAll('[data-editar-lista-mercado]').forEach(btn=>btn.onclick=()=>{
    const item=(listas||[]).find(x=>String(x.id)===String(btn.dataset.editarListaMercado));
    if(item)renderEditarListaMercado(c,item);
  });
  c.querySelectorAll('[data-excluir-lista-mercado]').forEach(btn=>btn.onclick=async()=>{
    const id=btn.dataset.excluirListaMercado;
    if(!confirm('Excluir esta lista vazia?'))return;
    btn.disabled=true;
    try{
      const r=await chamarApi({action:'excluirListaMercado',token:sessao.token,id});
      assertOk(r);toast('Lista excluída. 🗑️');await renderMercado(c);
    }catch(e){toast(e.message||'Não foi possível excluir a lista.');btn.disabled=false;}
  });
}

async function renderNovaListaMercado(c){
  subtelaModulo='nova-lista-mercado';
  rolarModuloTopo();
  c.innerHTML=cabecalho('🛒','Nova lista de mercado','Dê um nome para identificar esta compra')+
  `<form id="form-nova-lista-mercado" class="form-pagamento">
    <label class="campo-pagamento"><span>📝 Nome da lista *</span><input id="nova-lista-nome" type="text" maxlength="100" placeholder="Ex.: Compra rápida — 03/10" required></label>
    <label class="campo-pagamento"><span>💬 Observação</span><textarea id="nova-lista-observacao" maxlength="300" rows="3" placeholder="Ex.: compras para o fim de semana"></textarea></label>
    <div class="aviso-preco-mercado">💡 Você poderá adicionar os itens agora e colocar os preços somente quando estiver no mercado.</div>
    <div class="cal-form-acoes"><button id="btn-cancelar-nova-lista" type="button" class="botao-cancelar-pagamento">Cancelar</button><button id="btn-criar-lista-mercado" type="submit" class="botao-salvar-pagamento">🛒 Criar lista</button></div>
  </form>`;
  $('btn-cancelar-nova-lista').onclick=()=>renderMercado(c);
  $('form-nova-lista-mercado').onsubmit=async e=>{
    e.preventDefault();
    const btn=$('btn-criar-lista-mercado');btn.disabled=true;btn.textContent='Criando...';
    try{
      const r=await chamarApi({action:'criarListaMercado',token:sessao.token,dados:{nome:$('nova-lista-nome').value.trim(),referencia:referenciaAtual(),observacao:$('nova-lista-observacao').value.trim()}});
      assertOk(r);toast('Lista criada! 🛒');await renderListaMercadoDetalhe(c,r.id);
    }catch(err){toast(err.message||'Não foi possível criar a lista.');btn.disabled=false;btn.textContent='🛒 Criar lista';}
  };
}

async function renderEditarListaMercado(c,item){
  subtelaModulo='editar-lista-mercado';
  rolarModuloTopo();
  c.innerHTML=cabecalho('✏️','Renomear lista','Altere o nome sem perder os itens')+
  `<form id="form-editar-lista-mercado" class="form-pagamento">
    <label class="campo-pagamento"><span>📝 Nome da lista *</span><input id="editar-lista-nome" type="text" maxlength="100" value="${escAttr(item.nome||'')}" required></label>
    <label class="campo-pagamento"><span>💬 Observação</span><textarea id="editar-lista-observacao" maxlength="300" rows="3">${esc(item.observacao||'')}</textarea></label>
    <div class="cal-form-acoes"><button id="btn-cancelar-editar-lista" type="button" class="botao-cancelar-pagamento">Cancelar</button><button id="btn-salvar-editar-lista" type="submit" class="botao-salvar-pagamento">💾 Salvar</button></div>
  </form>`;
  $('btn-cancelar-editar-lista').onclick=()=>renderMercado(c);
  $('form-editar-lista-mercado').onsubmit=async e=>{
    e.preventDefault();
    const btn=$('btn-salvar-editar-lista');btn.disabled=true;btn.textContent='Salvando...';
    try{
      const r=await chamarApi({action:'atualizarListaMercado',token:sessao.token,id:item.id,dados:{nome:$('editar-lista-nome').value.trim(),observacao:$('editar-lista-observacao').value.trim()}});
      assertOk(r);toast('Lista atualizada! ✅');await renderMercado(c);
    }catch(err){toast(err.message||'Não foi possível atualizar a lista.');btn.disabled=false;btn.textContent='💾 Salvar';}
  };
}

async function renderListaMercadoDetalhe(c,listaId,filtroInicial='TODAS',buscaInicial=''){
  subtelaModulo='lista-mercado-detalhe';
  rolarModuloTopo();
  try{
    const [rl,ri]=await Promise.all([
      chamarApi({action:'listarListasMercado',token:sessao.token}),
      chamarApi({action:'listarMercado',token:sessao.token,listaId})
    ]);
    assertOk(rl);assertOk(ri);
    const lista=(rl.dados||[]).find(x=>String(x.id)===String(listaId));
    if(!lista)throw new Error('Lista não encontrada.');
    renderListaMercado(c,lista,ri.dados||[],filtroInicial,buscaInicial);
  }catch(e){toast(e.message||'Não foi possível abrir a lista.');await renderMercado(c);}
}

function renderListaMercado(c,lista,itens,filtro='TODAS',busca=''){
  const categorias=['TODAS','ESSENCIAL','ADICIONAIS','MISTURA','LIMPEZA/HIGIENE'];
  const buscaNorm=String(busca||'').trim().toLowerCase();
  const listaId=String(lista.id);
  const finalizada=String(lista.status||'').toUpperCase()==='FINALIZADA';
  let ativos=(itens||[]).filter(x=>String(x.naLista||'SIM').toUpperCase()!=='NÃO');
  let visiveis=ativos.filter(x=>{const cat=String(x.categoria||'').toUpperCase();const texto=[x.produto,x.categoria,x.observacao].join(' ').toLowerCase();return (filtro==='TODAS'||cat===filtro)&&(!buscaNorm||texto.includes(buscaNorm));});
  const pendentes=ativos.filter(x=>String(x.comprado||'NÃO').toUpperCase()!=='SIM');
  const comprados=ativos.filter(x=>String(x.comprado||'NÃO').toUpperCase()==='SIM');
  const totalComprado=comprados.reduce((t,x)=>t+Number(x.valorTotal||0),0);
  const semPreco=comprados.filter(x=>Number(x.valorTotal||0)<=0);
  const avisoPreco=semPreco.length?`<div class="aviso-preco-mercado">⚠️ ${semPreco.length} item(ns) marcado(s) como comprado ainda está(ão) sem preço.</div>`:'';

  c.innerHTML=`<div class="cabecalho-modulo cabecalho-mercado">
    <div class="icone-grande">🛒</div><div><h2>${esc(lista.nome||'Lista de mercado')}</h2><p>${finalizada?'Lista finalizada':'Lista em andamento'}</p></div>
    <div class="acoes-mercado-topo"><button id="btn-voltar-listas-mercado" type="button" class="botao-exportar-mercado">← Listas</button></div>
  </div>
  <div class="cards-resumo cards-resumo-mercado"><div class="card-resumo"><small>Na lista</small><strong class="laranja">${ativos.length}</strong></div><div class="card-resumo"><small>Comprados</small><strong class="verde">${comprados.length}</strong></div><div class="card-resumo"><small>Total comprado</small><strong class="laranja">${moeda(totalComprado)}</strong></div></div>
  <div class="painel mercado-acoes-principais">
    <div class="barra-mercado-superior">
      ${!finalizada?`<button id="btn-novo-item-mercado" type="button" class="botao-nova-despesa">＋ Item</button><button id="btn-finalizar-compra-mercado" type="button" class="botao-salvar-pagamento">🧾 Finalizar compra</button>`:''}
      <button id="btn-exportar-lista-mercado" type="button" class="botao-exportar-mercado">🖼️ Salvar lista</button>
      <button id="btn-historico-mercado" type="button" class="botao-exportar-mercado">📜 Histórico</button>
    </div>
    <div class="ajuda-campo">${finalizada?'Esta lista já foi finalizada. Você pode consultar os itens e o histórico.':'Em casa, monte a lista sem preços. No mercado, informe o preço real e marque o que foi comprado.'}</div>
    ${avisoPreco}
    <div class="busca-mercado-wrap"><span>🔎</span><input id="busca-mercado" type="search" value="${escAttr(busca)}" placeholder="Buscar produto..." autocomplete="off"></div>
    <div class="barra-acoes barra-acoes-mercado">${categorias.map(cat=>`<button type="button" class="chip ${cat===filtro?'ativo':''}" data-filtro-mercado="${escAttr(cat)}">${esc(cat==='LIMPEZA/HIGIENE'?'Limpeza/Higiene':cat.charAt(0)+cat.slice(1).toLowerCase())}</button>`).join('')}</div>
  </div>
  <div class="painel"><div class="painel-titulo"><h3>📋 Itens desta lista</h3><span>${visiveis.length}${pendentes.length?' • '+pendentes.length+' pendentes':''}</span></div><div class="lista-modulo lista-mercado-v21">${visiveis.length?visiveis.map(itemMercadoV21).join(''):'<div class="vazio">Nenhum item encontrado nesta lista.</div>'}</div></div>`;

  $('btn-voltar-listas-mercado').onclick=()=>renderMercado(c);
  $('btn-historico-mercado').onclick=()=>renderHistoricoMercado(c);
  $('btn-exportar-lista-mercado').onclick=()=>abrirExportacaoMercado(itens,lista.nome);
  if($('btn-novo-item-mercado'))$('btn-novo-item-mercado').onclick=()=>renderNovoItemMercado(c,lista);
  if($('btn-finalizar-compra-mercado'))$('btn-finalizar-compra-mercado').onclick=()=>renderFinalizarCompraMercado(c,lista,itens);

  let timer=null;
  $('busca-mercado').addEventListener('input',e=>{const v=e.target.value;clearTimeout(timer);timer=setTimeout(()=>renderListaMercado(c,lista,itens,filtro,v),160);});
  c.querySelectorAll('[data-filtro-mercado]').forEach(btn=>btn.addEventListener('click',()=>renderListaMercado(c,lista,itens,btn.dataset.filtroMercado,$('busca-mercado').value)));

  c.querySelectorAll('[data-mercado-preco]').forEach(input=>input.addEventListener('change',async()=>{
    const id=input.dataset.mercadoPreco;const raw=String(input.value||'').trim().replace(',','.');const valor=raw===''?0:Number(raw);
    if(!Number.isFinite(valor)||valor<0){toast('Informe um preço válido.');return;} input.disabled=true;
    try{const rr=await chamarApi({action:'atualizarItemMercado',token:sessao.token,id,dados:{valorUnitario:valor}});assertOk(rr);toast('Preço atualizado! 💰');await renderListaMercadoDetalhe(c,listaId,filtro,$('busca-mercado')?.value||'');}catch(e){toast(e.message||'Não foi possível salvar o preço.');input.disabled=false;}
  }));

  c.querySelectorAll('[data-mercado-id]').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true;try{const novo=btn.dataset.ok!=='SIM';const rr=await chamarApi({action:'atualizarItemMercado',token:sessao.token,id:btn.dataset.mercadoId,dados:{comprado:novo?'SIM':'NÃO'}});assertOk(rr);toast(novo?'Item marcado como comprado! 🛒':'Item voltou para a lista.');await renderListaMercadoDetalhe(c,listaId,filtro,$('busca-mercado')?.value||'');}catch(e){toast(e.message||'Não foi possível atualizar o item.');btn.disabled=false;}
  }));

  c.querySelectorAll('[data-excluir-mercado-id]').forEach(btn=>btn.addEventListener('click',async()=>{
    const id=btn.dataset.excluirMercadoId;const produto=btn.dataset.produto||'este item';if(!confirm(`Excluir "${produto}" da lista?\n\nO item não será apagado do histórico se já tiver sido comprado.`))return;btn.disabled=true;
    try{const rr=await chamarApi({action:'excluirItemMercado',token:sessao.token,id});assertOk(rr);toast('Item excluído da lista. 🗑️');await renderListaMercadoDetalhe(c,listaId,filtro,$('busca-mercado')?.value||'');}catch(e){toast(e.message||'Não foi possível excluir o item.');btn.disabled=false;}
  }));
}

function itemMercadoV21(x){
  const ok=String(x.comprado||'NÃO').toUpperCase()==='SIM';const qtd=Number(x.quantidade||0);const qtdTxt=qtd?`${qtd} ${x.unidade||'un'}`:'';const valorUnitario=Number(x.valorUnitario||0);const total=Number(x.valorTotal||0);
  return `<div class="item-lista item-mercado-v21 ${ok?'item-mercado-comprado':''}"><div class="item-mercado-info"><div class="descricao">${esc(x.produto||'Produto')}</div><div class="meta">${esc(x.categoria||'')}${qtdTxt?' • '+esc(qtdTxt):''}</div>${x.observacao?`<div class="meta">💬 ${esc(x.observacao)}</div>`:''}<div class="mercado-preco-area"><label class="mercado-preco-label">Preço por unidade</label><div class="mercado-preco-linha"><div class="campo-preco-mercado"><span>R$</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${valorUnitario>0?valorUnitario.toFixed(2):''}" placeholder="0,00" data-mercado-preco="${escAttr(x.id)}" aria-label="Preço de ${escAttr(x.produto||'produto')}" ${String(x.compraId||'')?'disabled':''}></div><span class="total-item-mercado">${total>0?'Total: '+moeda(total):'Total: —'}</span></div></div><div class="mercado-item-acoes"><button type="button" class="botao-marcar-mercado ${ok?'ok':''}" data-mercado-id="${escAttr(x.id)}" data-ok="${ok?'SIM':'NÃO'}" ${String(x.compraId||'')?'disabled':''}><span class="icone-check-mercado">${ok?'✓':'○'}</span><span>${ok?'Comprado — tocar para desfazer':'Marcar como comprado'}</span></button>${!String(x.compraId||'')?`<button type="button" class="botao-excluir-mercado" data-excluir-mercado-id="${escAttr(x.id)}" data-produto="${escAttr(x.produto||'item')}">🗑️ Excluir</button>`:''}</div></div></div>`;
}

async function renderNovoItemMercado(c,lista){
  subtelaModulo='novo-item-mercado';rolarModuloTopo();
  const categorias=['ESSENCIAL','ADICIONAIS','MISTURA','LIMPEZA/HIGIENE'];const unidades=['un','kg','g','L','ml','pct','cx'];
  c.innerHTML=cabecalho('➕','Adicionar item',`Lista: ${esc(lista.nome||'')}`)+`<form id="form-novo-item-mercado" class="form-pagamento"><label class="campo-pagamento"><span>📝 Produto *</span><input id="mercado-produto" type="text" maxlength="120" placeholder="Ex.: Arroz 5 kg" required></label><label class="campo-pagamento"><span>🏷️ Categoria</span><select id="mercado-categoria">${categorias.map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label><div class="grid-dois-mercado"><label class="campo-pagamento"><span>🔢 Quantidade</span><input id="mercado-quantidade" type="number" min="0.01" step="0.01" value="1" inputmode="decimal"></label><label class="campo-pagamento"><span>📦 Unidade</span><select id="mercado-unidade">${unidades.map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label></div><label class="campo-pagamento"><span>💬 Observação</span><textarea id="mercado-observacao" maxlength="250" rows="3" placeholder="Marca, tamanho, sabor, preferência..."></textarea></label><div class="aviso-preco-mercado">💡 O preço fica para depois. No mercado, informe o valor real e marque o que foi comprado.</div><div class="cal-form-acoes"><button id="btn-cancelar-item-mercado" type="button" class="botao-cancelar-pagamento">Cancelar</button><button id="btn-salvar-item-mercado" type="submit" class="botao-salvar-pagamento">🛒 Adicionar à lista</button></div></form>`;
  $('btn-cancelar-item-mercado').onclick=()=>renderListaMercadoDetalhe(c,lista.id);
  $('form-novo-item-mercado').onsubmit=async e=>{e.preventDefault();const btn=$('btn-salvar-item-mercado');btn.disabled=true;btn.textContent='Salvando...';try{const r=await chamarApi({action:'inserirItemMercado',token:sessao.token,dados:{listaId:lista.id,referencia:lista.referencia||referenciaAtual(),categoria:$('mercado-categoria').value,produto:$('mercado-produto').value.trim(),quantidade:Number($('mercado-quantidade').value||1),unidade:$('mercado-unidade').value,valorUnitario:0,observacao:$('mercado-observacao').value.trim()}});assertOk(r);toast('Item adicionado à lista! 🛒');await renderListaMercadoDetalhe(c,lista.id);}catch(err){toast(err.message||'Não foi possível adicionar o item.');btn.disabled=false;btn.textContent='🛒 Adicionar à lista';}};
}

async function renderFinalizarCompraMercado(c,lista,itens){
  subtelaModulo='finalizar-compra-mercado';rolarModuloTopo();
  const selecionados=(itens||[]).filter(x=>String(x.comprado||'NÃO').toUpperCase()==='SIM'&&String(x.naLista||'SIM').toUpperCase()!=='NÃO');
  if(!selecionados.length){toast('Marque primeiro os itens que vocês realmente compraram.');subtelaModulo=null;return;}
  const semPreco=selecionados.filter(x=>Number(x.valorTotal||0)<=0);if(semPreco.length){const nomes=semPreco.slice(0,3).map(x=>x.produto).join(', ');toast(`Informe o preço de: ${nomes}${semPreco.length>3?' e outros itens.':''}`);subtelaModulo=null;return;}
  const totalCalculado=selecionados.reduce((t,x)=>t+Number(x.valorTotal||0),0);const formas=['PIX','CRÉDITO','DÉBITO','DINHEIRO'];
  c.innerHTML=cabecalho('🧾','Finalizar compra',`Lista: ${esc(lista.nome||'')}`)+`<form id="form-finalizar-compra-mercado" class="form-pagamento"><div class="painel"><div class="painel-titulo"><h3>${selecionados.length} itens comprados</h3><strong class="laranja">${moeda(totalCalculado)}</strong></div><p class="ajuda-campo">Total calculado pelos preços informados. O valor do caixa pode ser diferente.</p><div class="lista-mini-mercado">${selecionados.map(x=>`<div>🛒 ${esc(x.produto)} <span>${moeda(x.valorTotal)}</span></div>`).join('')}</div></div><label class="campo-pagamento"><span>🏪 Onde comprou?</span><input id="compra-mercado-nome" type="text" maxlength="120" placeholder="Ex.: Guanabara"></label><label class="campo-pagamento"><span>💰 Total pago no caixa *</span><input id="compra-mercado-valor" type="number" min="0" step="0.01" inputmode="decimal" value="${totalCalculado.toFixed(2)}" required></label><label class="campo-pagamento"><span>💳 Forma de pagamento</span><select id="compra-mercado-forma">${formas.map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label><label class="campo-pagamento"><span>📎 Comprovante</span><input id="compra-mercado-arquivo" type="file" accept="image/jpeg,image/png,application/pdf"><small class="ajuda-campo">JPG, PNG ou PDF até 10 MB.</small></label><label class="campo-pagamento"><span>💬 Observação</span><textarea id="compra-mercado-observacao" rows="3" maxlength="300" placeholder="Ex.: faltou um produto ou houve substituição."></textarea></label><div class="cal-form-acoes"><button id="btn-cancelar-finalizar-compra" type="button" class="botao-cancelar-pagamento">Cancelar</button><button id="btn-finalizar-compra" type="submit" class="botao-salvar-pagamento">✅ Registrar compra</button></div></form>`;
  $('btn-cancelar-finalizar-compra').onclick=()=>renderListaMercadoDetalhe(c,lista.id);
  $('form-finalizar-compra-mercado').onsubmit=async e=>{e.preventDefault();const btn=$('btn-finalizar-compra');btn.disabled=true;btn.textContent='Registrando...';try{const arquivo=$('compra-mercado-arquivo').files?.[0];const payload={action:'registrarCompra',token:sessao.token,dados:{data:dataInputHoje(),referencia:lista.referencia||referenciaAtual(),listaId:lista.id,mercado:$('compra-mercado-nome').value.trim(),tipoCompra:'COMPRA',valorTotal:Number($('compra-mercado-valor').value||0),formaPagamento:$('compra-mercado-forma').value,observacao:$('compra-mercado-observacao').value.trim(),itemIds:selecionados.map(x=>x.id)}};if(arquivo)payload.arquivo=await arquivoParaPayload(arquivo);const r=await chamarApi(payload);assertOk(r);toast(r.listaFinalizada?'Compra registrada e lista finalizada! 🧾✅':'Compra registrada! Os itens não comprados continuam na lista. 🧾✅');await renderListaMercadoDetalhe(c,lista.id);}catch(err){toast(err.message||'Não foi possível registrar a compra.');btn.disabled=false;btn.textContent='✅ Registrar compra';}};
}

async function renderHistoricoMercado(c, filtroInicial='TODAS', buscaInicial=''){
  subtelaModulo='historico-mercado';
  rolarModuloTopo();

  try{
    const r=await chamarApi({action:'listarCompras',token:sessao.token});
    assertOk(r);
    renderHistoricoMercadoLista(c,r.dados||[],filtroInicial,buscaInicial);
  }catch(e){
    toast(e.message||'Não foi possível carregar o histórico.');
    await renderMercado(c);
  }
}

function renderHistoricoMercadoLista(c,compras,filtro='TODAS',busca=''){
  const agora=new Date();
  const mesAtual=agora.getMonth();
  const anoAtual=agora.getFullYear();
  const mesAnterior=mesAtual===0?11:mesAtual-1;
  const anoMesAnterior=mesAtual===0?anoAtual-1:anoAtual;
  const buscaNorm=String(busca||'').trim().toLowerCase();

  const dataCompra=x=>{
    const d=new Date(x.data||x.criadoEm||'');
    return Number.isNaN(d.getTime())?null:d;
  };

  let lista=(compras||[]).filter(x=>{
    const d=dataCompra(x);
    let okFiltro=true;
    if(filtro==='ESTE_MES') okFiltro=!!d&&d.getMonth()===mesAtual&&d.getFullYear()===anoAtual;
    if(filtro==='MES_ANTERIOR') okFiltro=!!d&&d.getMonth()===mesAnterior&&d.getFullYear()===anoMesAnterior;
    const texto=[x.mercado,x.listaNome,x.tipoCompra,x.formaPagamento,x.observacao].join(' ').toLowerCase();
    return okFiltro && (!buscaNorm||texto.includes(buscaNorm));
  }).sort((a,b)=>{
    const da=dataCompra(a)?.getTime()||0;
    const db=dataCompra(b)?.getTime()||0;
    return db-da;
  });

  const totalPeriodo=lista.reduce((t,x)=>t+Number(x.valorTotal||0),0);
  const qtdItens=lista.reduce((t,x)=>t+Number(x.quantidadeItens||0),0);

  c.innerHTML=
    cabecalho('📜','Histórico de compras','Tudo o que já foi registrado no Mercado')+
    `<div class="cards-resumo cards-resumo-mercado historico-resumo-mercado">
      <div class="card-resumo"><small>Compras</small><strong class="laranja">${lista.length}</strong></div>
      <div class="card-resumo"><small>Itens</small><strong class="verde">${qtdItens}</strong></div>
      <div class="card-resumo"><small>Total</small><strong class="laranja">${moeda(totalPeriodo)}</strong></div>
    </div>`+
    `<div class="painel historico-filtros-mercado">
      <div class="barra-acoes barra-acoes-mercado">
        ${[['TODAS','Todas'],['ESTE_MES','Este mês'],['MES_ANTERIOR','Mês anterior']].map(([v,t])=>`<button type="button" class="chip ${filtro===v?'ativo':''}" data-filtro-historico="${v}">${t}</button>`).join('')}
      </div>
      <div class="busca-mercado-wrap" style="margin-top:10px;margin-bottom:0"><span>🔎</span><input id="busca-historico-mercado" type="search" value="${escAttr(busca)}" placeholder="Buscar por mercado..." autocomplete="off"></div>
    </div>`+
    `<div class="painel">
      <div class="painel-titulo"><h3>Compras registradas</h3><span>${lista.length} ${lista.length===1?'compra':'compras'}</span></div>
      <div class="lista-modulo historico-lista-mercado">
        ${lista.length?lista.map(itemHistoricoMercado).join(''):'<div class="vazio">Nenhuma compra encontrada neste filtro.</div>'}
      </div>
    </div>`+
    `<button id="btn-voltar-mercado-historico" type="button" class="botao-cancelar-pagamento">← Voltar para Mercado</button>`;

  $('btn-voltar-mercado-historico').addEventListener('click',()=>renderMercado(c));

  c.querySelectorAll('[data-filtro-historico]').forEach(btn=>{
    btn.addEventListener('click',()=>renderHistoricoMercadoLista(c,compras,btn.dataset.filtroHistorico,$('busca-historico-mercado').value));
  });

  let timer=null;
  $('busca-historico-mercado').addEventListener('input',e=>{
    clearTimeout(timer);
    const v=e.target.value;
    timer=setTimeout(()=>renderHistoricoMercadoLista(c,compras,filtro,v),160);
  });

  c.querySelectorAll('[data-historico-toggle]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const id=btn.dataset.historicoToggle;
      const alvo=document.querySelector(`[data-historico-detalhe="${CSS.escape(id)}"]`);
      if(!alvo) return;
      const aberto=alvo.classList.toggle('aberto');
      btn.textContent=aberto?'▲ Ocultar itens':'▼ Ver itens';
    });
  });
}

function itemHistoricoMercado(x){
  const d=new Date(x.data||x.criadoEm||'');
  const dataFmt=Number.isNaN(d.getTime())?'—':d.toLocaleDateString('pt-BR');
  const itens=Array.isArray(x.itens)?x.itens:[];
  const quantidade=Number(x.quantidadeItens||itens.length||0);
  const comprovante=x.comprovanteUrl?`<a class="historico-comprovante-mercado" href="${escAttr(x.comprovanteUrl)}" target="_blank" rel="noopener">📎 Comprovante</a>`:'';
  const listaItens=itens.length
    ? itens.map(i=>`<div class="historico-item-linha"><span>${esc(i.produto||'Produto')} <small>${Number(i.quantidade||0)} ${esc(i.unidade||'un')}</small></span><strong>${moeda(i.valorTotal||0)}</strong></div>`).join('')
    : '<div class="historico-sem-itens">Itens desta compra não foram vinculados.</div>';

  return `<div class="historico-compra-card">
    <div class="historico-compra-topo">
      <div>
        <div class="historico-mercado-nome">🏪 ${esc(x.mercado||'Mercado não informado')}</div>
        <div class="historico-meta">${dataFmt} • ${esc(x.formaPagamento||'Forma não informada')}${x.listaNome?` • ${esc(x.listaNome)}`:''}</div>
      </div>
      <div class="historico-total">${moeda(x.valorTotal||0)}</div>
    </div>
    <div class="historico-compra-meta">
      <span>🛒 ${quantidade} ${quantidade===1?'item':'itens'}</span>
      ${x.tipoCompra?`<span>• ${esc(x.tipoCompra)}</span>`:''}
    </div>
    <div class="historico-acoes">
      <button type="button" class="botao-exportar-mercado" data-historico-toggle="${escAttr(x.id)}">▼ Ver itens</button>
      ${comprovante}
    </div>
    <div class="historico-detalhe-mercado" data-historico-detalhe="${escAttr(x.id)}">${listaItens}${x.observacao?`<div class="historico-observacao">💬 ${esc(x.observacao)}</div>`:''}</div>
  </div>`;
}


async function renderFinalizarCompraMercado(c,itens){
  subtelaModulo='finalizar-compra-mercado';
  rolarModuloTopo();

  const selecionados=(itens||[]).filter(x=>
    String(x.comprado||'NÃO').toUpperCase()==='SIM' &&
    String(x.naLista||'SIM').toUpperCase()!=='NÃO'
  );

  if(!selecionados.length){
    toast('Marque primeiro os itens que vocês realmente compraram.');
    subtelaModulo=null;
    return;
  }

  const semPreco=selecionados.filter(x=>Number(x.valorTotal||0)<=0);

  if(semPreco.length){
    const nomes=semPreco.slice(0,3).map(x=>x.produto).join(', ');
    toast(`Informe o preço de: ${nomes}${semPreco.length>3?' e outros itens.':''}`);
    subtelaModulo=null;
    return;
  }

  const totalCalculado=selecionados.reduce((t,x)=>t+Number(x.valorTotal||0),0);
  const formas=['PIX','CRÉDITO','DÉBITO','DINHEIRO'];

  c.innerHTML=cabecalho('🧾','Finalizar compra','Confira o total dos itens que vocês compraram')+
  `<form id="form-finalizar-compra-mercado" class="form-pagamento">
    <div class="painel">
      <div class="painel-titulo"><h3>${selecionados.length} itens comprados</h3><strong class="laranja">${moeda(totalCalculado)}</strong></div>
      <p class="ajuda-campo">Esse é o total calculado pelos preços informados para cada item.</p>
      <div class="lista-mini-mercado">${selecionados.map(x=>`<div>🛒 ${esc(x.produto)} <span>${moeda(x.valorTotal)}</span></div>`).join('')}</div>
    </div>

    <label class="campo-pagamento">
      <span>🏪 Onde comprou?</span>
      <input id="compra-mercado-nome" type="text" maxlength="120" placeholder="Ex.: Guanabara">
    </label>

    <label class="campo-pagamento">
      <span>💰 Total pago no caixa *</span>
      <input id="compra-mercado-valor" type="number" min="0" step="0.01" inputmode="decimal" value="${totalCalculado.toFixed(2)}" required>
      <small class="ajuda-campo">Pode ajustar se houver desconto, acréscimo ou diferença no caixa.</small>
    </label>

    <label class="campo-pagamento">
      <span>💳 Forma de pagamento</span>
      <select id="compra-mercado-forma">${formas.map(x=>`<option value="${x}">${x}</option>`).join('')}</select>
    </label>

    <label class="campo-pagamento">
      <span>📎 Comprovante</span>
      <input id="compra-mercado-arquivo" type="file" accept="image/jpeg,image/png,application/pdf">
      <small class="ajuda-campo">JPG, PNG ou PDF até 10 MB.</small>
    </label>

    <label class="campo-pagamento">
      <span>💬 Observação</span>
      <textarea id="compra-mercado-observacao" rows="3" maxlength="300" placeholder="Ex.: faltou um produto ou houve substituição."></textarea>
    </label>

    <button id="btn-finalizar-compra" type="submit" class="botao-salvar-pagamento">✅ Registrar compra</button>
    <button id="btn-cancelar-finalizar-compra" type="button" class="botao-cancelar-pagamento">Cancelar</button>
  </form>`;

  $('btn-cancelar-finalizar-compra').addEventListener('click',()=>renderMercado(c));

  $('form-finalizar-compra-mercado').addEventListener('submit',async e=>{
    e.preventDefault();

    const btn=$('btn-finalizar-compra');
    btn.disabled=true;
    btn.textContent='Registrando...';

    try{
      const arquivo=$('compra-mercado-arquivo').files?.[0];

      const payload={
        action:'registrarCompra',
        token:sessao.token,
        dados:{
          data:dataInputHoje(),
          referencia:referenciaAtual(),
          mercado:$('compra-mercado-nome').value.trim(),
          tipoCompra:'MENSAL',
          valorTotal:Number($('compra-mercado-valor').value||0),
          formaPagamento:$('compra-mercado-forma').value,
          observacao:$('compra-mercado-observacao').value.trim(),
          itemIds:selecionados.map(x=>x.id)
        }
      };

      if(arquivo) payload.arquivo=await arquivoParaPayload(arquivo);

      const r=await chamarApi(payload);
      assertOk(r);

      toast('Compra registrada e itens arquivados! 🧾✅');
      await renderMercado(c);
      rolarModuloTopo();
    }catch(err){
      toast(err.message||'Não foi possível registrar a compra.');
      btn.disabled=false;
      btn.textContent='✅ Registrar compra';
    }
  });
}

/* =========================================================
   MERCADO V23 — EXPORTAÇÃO DA LISTA
========================================================= */

function abrirExportacaoMercado(itens,nomeLista='Lista de mercado'){
  const ativos=(itens||[]).filter(x=>String(x.naLista||'SIM').toUpperCase()!=='NÃO');
  const canvas=criarCanvasListaMercado(ativos,nomeLista);
  const imagem=canvas.toDataURL('image/png');

  const antigo=document.getElementById('modal-exportacao-mercado');
  if(antigo) antigo.remove();

  const modal=document.createElement('div');
  modal.id='modal-exportacao-mercado';
  modal.className='modal-exportacao-mercado';
  modal.innerHTML=`
    <div class="modal-exportacao-card">
      <div class="modal-exportacao-topo">
        <div>
          <h3>🖼️ ${esc(nomeLista||'Lista de mercado')}</h3>
          <p>Visualize e salve a lista para levar com você.</p>
        </div>
        <button type="button" class="modal-exportacao-fechar" id="fechar-exportacao-mercado">✕</button>
      </div>
      <div class="modal-exportacao-preview">
        <img src="${imagem}" alt="Prévia da lista de mercado">
      </div>
      <div class="modal-exportacao-acoes">
        <button type="button" class="botao-exportacao principal" id="baixar-lista-png">🖼️ PNG</button>
        <button type="button" class="botao-exportacao" id="baixar-lista-jpeg">📷 JPEG</button>
        <button type="button" class="botao-exportacao" id="imprimir-lista-pdf">📄 PDF</button>
      </div>
      <small class="ajuda-campo exportacao-nota">PNG/JPEG baixam a imagem da lista. PDF abre a impressão do navegador para você escolher “Salvar como PDF”.</small>
    </div>`;

  document.body.appendChild(modal);
  document.body.classList.add('modal-aberto');

  const fechar=()=>{
    modal.remove();
    document.body.classList.remove('modal-aberto');
  };

  $('fechar-exportacao-mercado').addEventListener('click',fechar);
  modal.addEventListener('click',e=>{if(e.target===modal)fechar();});
  $('baixar-lista-png').addEventListener('click',()=>baixarCanvasListaMercado(canvas,'png'));
  $('baixar-lista-jpeg').addEventListener('click',()=>baixarCanvasListaMercado(criarCanvasListaMercado(ativos),'jpeg'));
  $('imprimir-lista-pdf').addEventListener('click',()=>imprimirListaMercado(ativos));
}

function criarCanvasListaMercado(itens,nomeLista='LISTA DE MERCADO'){
  const ordem=['ESSENCIAL','MISTURA','ADICIONAIS','LIMPEZA/HIGIENE'];
  const grupos={};
  ordem.forEach(c=>grupos[c]=[]);
  (itens||[]).forEach(x=>{
    const c=String(x.categoria||'ADICIONAIS').toUpperCase();
    if(!grupos[c]) grupos[c]=[];
    grupos[c].push(x);
  });
  Object.keys(grupos).forEach(c=>grupos[c].sort((a,b)=>String(a.produto||'').localeCompare(String(b.produto||''),'pt-BR')));

  const totalItens=Object.values(grupos).reduce((n,g)=>n+g.length,0);
  const altura=190+Object.values(grupos).reduce((n,g)=>n+(g.length?60+g.length*78:0),0)+100;
  const canvas=document.createElement('canvas');
  canvas.width=1200;
  canvas.height=Math.max(700,altura);
  const ctx=canvas.getContext('2d');

  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#ED7014';
  ctx.fillRect(0,0,canvas.width,120);
  ctx.fillStyle='#111111';
  ctx.font='800 42px Arial';
  ctx.fillText('LeFe Home',55,58);
  ctx.fillStyle='#ffffff';
  ctx.font='700 30px Arial';
  ctx.fillText(String(nomeLista||'LISTA DE MERCADO').substring(0,42).toUpperCase(),55,98);

  ctx.fillStyle='#222222';
  ctx.font='20px Arial';
  ctx.fillText(`${new Date().toLocaleDateString('pt-BR')} • ${totalItens} ${totalItens===1?'item':'itens'}`,880,68);
  ctx.font='18px Arial';
  ctx.fillText('Fernando & Letícia',880,96);

  let y=165;
  Object.entries(grupos).forEach(([cat,lista])=>{
    if(!lista.length) return;
    const nome=cat==='LIMPEZA/HIGIENE'?'LIMPEZA / HIGIENE':cat;
    ctx.fillStyle='#111111';
    ctx.fillRect(45,y-30,1110,48);
    ctx.fillStyle='#ffffff';
    ctx.font='700 22px Arial';
    ctx.fillText(nome,y+3,70+0);
    y+=55;

    lista.forEach(x=>{
      const comprado=String(x.comprado||'NÃO').toUpperCase()==='SIM';
      const qtd=Number(x.quantidade||0);
      const qtdTxt=qtd?`${qtd} ${x.unidade||'un'}`:'';
      const unit=Number(x.valorUnitario||0);
      const total=Number(x.valorTotal||0);

      ctx.strokeStyle=comprado?'#ED7014':'#777777';
      ctx.lineWidth=3;
      ctx.strokeRect(58,y-18,28,28);
      if(comprado){
        ctx.fillStyle='#ED7014';
        ctx.fillRect(58,y-18,28,28);
        ctx.strokeStyle='#ffffff';
        ctx.lineWidth=4;
        ctx.beginPath();ctx.moveTo(64,y-3);ctx.lineTo(70,y+4);ctx.lineTo(82,y-10);ctx.stroke();
      }

      ctx.fillStyle=comprado?'#777777':'#111111';
      ctx.font='700 25px Arial';
      ctx.fillText(String(x.produto||'Produto'),105,y+3);
      ctx.font='18px Arial';
      ctx.fillStyle='#555555';
      ctx.fillText(qtdTxt||'Quantidade não informada',105,y+30);

      if(unit>0){
        ctx.fillStyle='#ED7014';
        ctx.font='700 18px Arial';
        ctx.fillText(`R$ ${unit.toFixed(2).replace('.',',')}${total>0&&qtd>1?'  •  Total '+moeda(total):''}`,760,y+16);
      }
      y+=78;
    });
    y+=8;
  });

  ctx.fillStyle='#eeeeee';
  ctx.fillRect(45,y,1110,1);
  y+=38;
  const comprados=(itens||[]).filter(x=>String(x.comprado||'NÃO').toUpperCase()==='SIM');
  const totalComprado=comprados.reduce((t,x)=>t+Number(x.valorTotal||0),0);
  ctx.fillStyle='#111111';
  ctx.font='700 24px Arial';
  ctx.fillText(`Comprados: ${comprados.length}   •   Total: ${moeda(totalComprado)}`,55,y);
  ctx.fillStyle='#777777';
  ctx.font='16px Arial';
  ctx.fillText('Gerado pelo LeFe Home',55,y+30);

  return canvas;
}

function baixarCanvasListaMercado(canvas,formato){
  const ext=formato==='jpeg'?'jpg':'png';
  const mime=formato==='jpeg'?'image/jpeg':'image/png';
  canvas.toBlob(blob=>{
    if(!blob){toast('Não foi possível gerar a imagem.');return;}
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`lefe-home-lista-mercado-${dataInputHoje()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast(`Lista salva em ${ext.toUpperCase()}! 🧡`);
  },mime,formato==='jpeg'?0.95:undefined);
}

function imprimirListaMercado(itens){
  const grupos={};
  (itens||[]).forEach(x=>{
    const c=String(x.categoria||'ADICIONAIS').toUpperCase();
    (grupos[c] ||= []).push(x);
  });
  Object.values(grupos).forEach(g=>g.sort((a,b)=>String(a.produto||'').localeCompare(String(b.produto||''),'pt-BR')));

  const ordem=['ESSENCIAL','MISTURA','ADICIONAIS','LIMPEZA/HIGIENE'];
  const conteudo=ordem.filter(c=>grupos[c]?.length).map(c=>{
    const nome=c==='LIMPEZA/HIGIENE'?'Limpeza / Higiene':c.charAt(0)+c.slice(1).toLowerCase();
    return `<section><h2>${esc(nome)}</h2>${grupos[c].map(x=>{
      const ok=String(x.comprado||'NÃO').toUpperCase()==='SIM';
      const qtd=Number(x.quantidade||0);
      const qtdTxt=qtd?`${qtd} ${esc(x.unidade||'un')}`:'';
      const total=Number(x.valorTotal||0);
      return `<div class="linha"><span class="check">${ok?'✓':'□'}</span><strong>${esc(x.produto||'Produto')}</strong><span>${qtdTxt}</span><span>${total>0?moeda(total):''}</span></div>`;
    }).join('')}</section>`;
  }).join('');

  const w=window.open('','_blank','width=900,height=900');
  if(!w){toast('O navegador bloqueou a janela de PDF. Permita pop-ups para o LeFe Home.');return;}
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>LeFe Home - Lista de Mercado</title><style>
    @page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#111;margin:0}header{border-bottom:4px solid #ED7014;padding-bottom:12px;margin-bottom:20px}h1{margin:0;font-size:28px}p{margin:5px 0;color:#666}section{margin-bottom:18px;break-inside:avoid}h2{background:#111;color:#fff;padding:8px 10px;font-size:17px;margin:0 0 7px}.linha{display:grid;grid-template-columns:32px 1fr 100px 100px;gap:8px;padding:8px 4px;border-bottom:1px solid #ddd;font-size:14px;align-items:center}.check{font-size:20px}.rodape{margin-top:20px;border-top:1px solid #ddd;padding-top:10px;color:#666;font-size:12px}@media print{.no-print{display:none}}button{padding:10px 14px;background:#ED7014;color:#fff;border:0;border-radius:8px;font-weight:700}</style></head><body><header><h1>LeFe Home — Lista de Mercado</h1><p>${new Date().toLocaleDateString('pt-BR')} • Fernando & Letícia</p></header>${conteudo}<div class="rodape">Lista gerada pelo LeFe Home.</div><div class="no-print" style="margin-top:20px"><button onclick="window.print()">📄 Salvar como PDF / Imprimir</button></div><script>setTimeout(()=>window.print(),350)<\/script></body></html>`);
  w.document.close();
}

/* =========================================================
   CASA
========================================================= */

async function obterTarefasCasaCache_(abaCasa){
  const historico=abaCasa==='historico';
  const agora=Date.now();
  if(historico && cacheCasaValido(casaCache.tarefasHistorico,casaCache.tarefasHistoricoEm)) return casaCache.tarefasHistorico;
  if(!historico && cacheCasaValido(casaCache.tarefasAtivas,casaCache.tarefasAtivasEm)) return casaCache.tarefasAtivas;

  const hoje=dataInputHoje();
  const fim=dataInputOffset(30);
  const r=await chamarApi({
    action:'listarTarefasCasa',
    token:sessao.token,
    inicio:historico?dataInputOffset(-90):hoje,
    fim:historico?hoje:fim,
    status:historico?'CONCLUIDA':''
  });
  assertOk(r);

  const tarefas=(r.dados||[]).sort((a,b)=>{
    const chaveA=historico?(a.concluidaEm||a.dataPrevista):(a.dataPrevista);
    const chaveB=historico?(b.concluidaEm||b.dataPrevista):(b.dataPrevista);
    const da=new Date(chaveA||0).getTime();
    const db=new Date(chaveB||0).getTime();
    if(da!==db)return da-db;
    return String(a.tarefa||'').localeCompare(String(b.tarefa||''),'pt-BR');
  });

  if(historico){
    casaCache.tarefasHistorico=tarefas;
    casaCache.tarefasHistoricoEm=agora;
  }else{
    casaCache.tarefasAtivas=tarefas;
    casaCache.tarefasAtivasEm=agora;
  }
  return tarefas;
}

async function obterRotinasCasaCache_(){
  if(cacheCasaValido(casaCache.rotinas,casaCache.rotinasEm)) return casaCache.rotinas;
  const rr=await chamarApi({action:'listarRotinasCasa',token:sessao.token});
  assertOk(rr);
  const rotinas=rr.dados||[];
  casaCache.rotinas=rotinas;
  casaCache.rotinasEm=Date.now();
  return rotinas;
}

async function renderCasa(c, abaCasa='hoje'){
  subtelaModulo=null;

  const abas=[
    ['hoje','📅 Hoje'],
    ['calendario','🗓️ Calendário'],
    ['tarefas','✓ Tarefas'],
    ['rotinas','🔁 Rotinas'],
    ['historico','🕘 Histórico']
  ];

  // Rotinas não precisa carregar as tarefas. Isso elimina uma chamada
  // pesada e deixa a troca para essa aba praticamente imediata.
  const tarefas=abaCasa==='rotinas'?[]:await obterTarefasCasaCache_(abaCasa);

  // Guarda as tarefas já carregadas na tela.
  // A edição usa esse registro local para evitar uma nova consulta
  // com intervalo gigante.
  c.__tarefasCasa=tarefas;

  const pendentes=tarefas.filter(x=>String(x.status||'').toUpperCase()==='PENDENTE').length;
  const concluidas=tarefas.filter(x=>String(x.status||'').toUpperCase()==='CONCLUIDA').length;

  const textoBotaoCasa=abaCasa==='rotinas'?'＋ Rotina':'＋ Tarefa';

  c.innerHTML=
    `<div class="cabecalho-casa">
      ${cabecalho('🏠','Casa','Rotinas, tarefas e limpeza')}
      <button id="btn-nova-tarefa-casa" type="button" class="botao-nova-tarefa-casa">${textoBotaoCasa}</button>
    </div>`+
    `<div class="tabs-casa">${abas.map(([id,nome])=>`<button type="button" class="tab-casa ${id===abaCasa?'ativo':''}" data-aba-casa="${id}">${nome}</button>`).join('')}</div>`+
    `<div id="conteudo-casa-v25"></div>`;

  $('btn-nova-tarefa-casa').addEventListener('click',async()=>{
    if(abaCasa==='rotinas') await renderNovaRotinaCasa(c);
    else await renderNovaTarefaCasa(c);
  });
  c.querySelectorAll('[data-aba-casa]').forEach(btn=>btn.addEventListener('click',async()=>{
    await renderCasa(c,btn.dataset.abaCasa);
  }));

  const alvo=$('conteudo-casa-v25');

  if(abaCasa==='hoje'){
    const hoje=dataInputHoje();
    const hojeTarefas=tarefas.filter(x=>String(x.dataPrevista||'').slice(0,10)===hoje);
    const proximas=tarefas.filter(x=>String(x.dataPrevista||'').slice(0,10)>hoje).slice(0,10);
    alvo.innerHTML=
      `<div class="cards-resumo cards-resumo-casa">
        <div class="card-resumo"><small>Hoje</small><strong class="laranja">${hojeTarefas.length}</strong></div>
        <div class="card-resumo"><small>Pendentes</small><strong class="amarelo">${pendentes}</strong></div>
        <div class="card-resumo"><small>Concluídas</small><strong class="verde">${concluidas}</strong></div>
      </div>`+
      `<div class="painel"><div class="painel-titulo"><h3>📅 Tarefas de hoje</h3><span>${hojeTarefas.length}</span></div><div class="lista-modulo">${hojeTarefas.length?hojeTarefas.map(x=>itemTarefaCasaV25(x,false)).join(''):'<div class="vazio">Nenhuma tarefa para hoje. 🎉</div>'}</div></div>`+
      `<div class="painel"><div class="painel-titulo"><h3>⏭️ Próximas tarefas</h3><span>${proximas.length}</span></div><div class="lista-modulo">${proximas.length?proximas.map(x=>itemTarefaCasaV25(x,true)).join(''):'<div class="vazio">Nenhuma tarefa próxima cadastrada.</div>'}</div></div>`;
  }

  if(abaCasa==='tarefas'){
    alvo.innerHTML=
      `<div class="painel casa-filtros"><div class="filtros-casa-linha">
        <button class="filtro-casa ativo" data-status-casa="TODAS">Todas</button>
        <button class="filtro-casa" data-status-casa="PENDENTE">Pendentes</button>
        <button class="filtro-casa" data-status-casa="CONCLUIDA">Concluídas</button>
      </div></div>`+
      `<div class="painel"><div class="painel-titulo"><h3>✓ Próximos 30 dias</h3><span>${tarefas.length}</span></div><div id="lista-todas-casa" class="lista-modulo">${tarefas.length?tarefas.map(x=>itemTarefaCasaV25(x,true)).join(''):'<div class="vazio">Nenhuma tarefa encontrada.</div>'}</div></div>`;
    c.querySelectorAll('[data-status-casa]').forEach(btn=>btn.addEventListener('click',()=>{
      c.querySelectorAll('[data-status-casa]').forEach(b=>b.classList.remove('ativo'));
      btn.classList.add('ativo');
      const st=btn.dataset.statusCasa;
      const lista=st==='TODAS'?tarefas:tarefas.filter(x=>String(x.status||'').toUpperCase()===st);
      $('lista-todas-casa').innerHTML=lista.length?lista.map(x=>itemTarefaCasaV25(x,true)).join(''):'<div class="vazio">Nenhuma tarefa nesse filtro.</div>';
      ligarBotoesTarefaCasa(c);
    }));
  }

  if(abaCasa==='calendario'){
    const anoMes=new Date();
    const ano=anoMes.getFullYear(), mes=anoMes.getMonth();
    const inicioMes=new Date(ano,mes,1);
    const fimMes=new Date(ano,mes+1,0);
    const chaveInicio=`${ano}-${String(mes+1).padStart(2,'0')}-01`;
    const chaveFim=`${ano}-${String(mes+1).padStart(2,'0')}-${String(fimMes.getDate()).padStart(2,'0')}`;
    const doMes=tarefas.filter(x=>{const k=String(x.dataPrevista||'').slice(0,10);return k>=chaveInicio&&k<=chaveFim;});
    const porDia={}; doMes.forEach(x=>{const k=String(x.dataPrevista||'').slice(0,10);(porDia[k]??=[]).push(x);});
    const primeiro=(inicioMes.getDay()+6)%7;
    let celulas='';
    for(let i=0;i<primeiro;i++)celulas+='<div class="dia-calendario vazio-calendario"></div>';
    for(let d=1;d<=fimMes.getDate();d++){
      const k=`${ano}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const lista=porDia[k]||[];
      const classes=[k===dataInputHoje()?'hoje':'',lista.length?'com-tarefa':''].filter(Boolean).join(' ');
      celulas+=`<button type="button" class="dia-calendario ${classes}" data-dia-casa="${k}"><strong>${d}</strong>${lista.length?`<span>${lista.length}</span>`:''}</button>`;
    }
    alvo.innerHTML=`<div class="painel calendario-casa-v25"><div class="calendario-titulo"><h3>🗓️ ${inicioMes.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</h3></div><div class="dias-semana"><span>SEG</span><span>TER</span><span>QUA</span><span>QUI</span><span>SEX</span><span>SÁB</span><span>DOM</span></div><div class="grade-calendario">${celulas}</div></div><div id="detalhe-dia-casa" class="painel"><div class="vazio">Toque em um dia para ver as tarefas.</div></div>`;
    c.querySelectorAll('[data-dia-casa]').forEach(btn=>btn.addEventListener('click',()=>{
      const k=btn.dataset.diaCasa, lista=porDia[k]||[];
      $('detalhe-dia-casa').innerHTML=`<div class="painel-titulo"><h3>📅 ${dataBR(k)}</h3><span>${lista.length}</span></div><div class="lista-modulo">${lista.length?lista.map(x=>itemTarefaCasaV25(x,false)).join(''):'<div class="vazio">Nenhuma tarefa neste dia.</div>'}</div>`;
      ligarBotoesTarefaCasa(c);
    }));
  }

  if(abaCasa==='rotinas'){
    const rotinas=await obterRotinasCasaCache_();
    c.__rotinasCasa=rotinas;
    alvo.innerHTML=`<div class="painel"><div class="painel-titulo"><h3>🔁 Rotinas da casa</h3><span>${rotinas.filter(x=>String(x.ativa).toUpperCase()==='SIM').length} ativas</span></div><div class="lista-modulo">${rotinas.length?rotinas.map(itemRotinaCasaV26).join(''):'<div class="vazio">Nenhuma rotina cadastrada.</div>'}</div></div>`;
    ligarBotoesRotinaCasa(c);
  }

  if(abaCasa==='historico'){
    alvo.innerHTML=`<div class="painel"><div class="painel-titulo"><h3>🕘 Histórico</h3><span>${tarefas.length}</span></div><div class="lista-modulo">${tarefas.length?tarefas.map(x=>itemTarefaCasaV25(x,true,true)).join(''):'<div class="vazio">Nenhuma tarefa concluída nos últimos 90 dias.</div>'}</div></div>`;
  }

  ligarBotoesTarefaCasa(c);
}

function itemTarefaCasaV25(x,mostrarData,modoHistorico=false){
  const status=String(x.status||'PENDENTE').toUpperCase();
  const dataBase=modoHistorico?(x.concluidaEm||x.dataPrevista):x.dataPrevista;
  const data=mostrarData&&dataBase?`<span class="data-tarefa-casa">${dataBR(dataBase)}</span>`:'';
  const botaoConcluir=status==='PENDENTE'?`<button class="botao-concluir-tarefa" data-concluir-tarefa="${escAttr(x.id)}">✓ Concluir</button>`:'';
  const botoesEdicao=`<div class="acoes-tarefa-casa"><button type="button" class="botao-editar-tarefa" data-editar-tarefa="${escAttr(x.id)}">✏️ Editar</button><button type="button" class="botao-excluir-tarefa" data-excluir-tarefa="${escAttr(x.id)}">🗑️ Excluir</button></div>`;
  return `<div class="item-lista item-tarefa-casa">
    <div class="info-tarefa-casa"><div class="descricao">${esc(x.tarefa||'Sem descrição')}</div><div class="meta">${esc(x.responsavel||'Ambos')}${data?' • '+data:''}</div>${x.observacao?`<div class="observacao-tarefa-casa">${esc(x.observacao)}</div>`:''}<span class="badge badge-casa ${status.toLowerCase()}">${esc(status.replaceAll('_',' '))}</span></div>
    <div class="lado-tarefa-casa">${botaoConcluir}${botoesEdicao}</div>
  </div>`;
}

function itemRotinaCasaV25(x){
  const ativa=String(x.ativa||'').toUpperCase()==='SIM';
  const frequencia={DIAS:'A cada dias',SEMANAL:'Semanal',SEMANAL_ALTERNADA:'Quarta alternada',MENSAL:'Mensal',PRIMEIRO_SABADO:'Primeiro sábado'}[x.frequencia]||String(x.frequencia||'');
  let detalhe=frequencia;
  if(x.frequencia==='DIAS') detalhe=`A cada ${Number(x.intervaloDias||0)} dias`;
  if(x.frequencia==='SEMANAL') detalhe=`Toda ${['domingo','segunda','terça','quarta','quinta','sexta','sábado'][Number(x.diaSemana)||0]||'semana'}`;
  if(x.frequencia==='SEMANAL_ALTERNADA') detalhe='Toda quarta-feira, alternando';
  return `<div class="rotina-casa-item"><div><strong>${esc(x.tarefa||'Rotina')}</strong><div class="meta">${esc(detalhe)} • ${esc(x.responsavel||'Ambos')}</div><div class="rotina-descricao">${esc(x.descricao||'')}</div></div><span class="badge badge-casa ${ativa?'concluida':'cancelada'}">${ativa?'ATIVA':'INATIVA'}</span></div>`;
}

function ligarBotoesTarefaCasa(c){
  c.querySelectorAll('[data-concluir-tarefa]').forEach(btn=>{
    btn.onclick=async()=>{
      const id=btn.dataset.concluirTarefa;
      btn.disabled=true;
      try{
        const rr=await chamarApi({action:'concluirTarefaCasa',token:sessao.token,id,concluidaPor:sessao.usuario?.nome||''});
        assertOk(rr); limparCacheCasa(); toast('Tarefa concluída! ✅'); await renderCasa(c,'hoje');
      }catch(e){toast(e.message||'Não foi possível concluir a tarefa.');btn.disabled=false;}
    };
  });

  c.querySelectorAll('[data-editar-tarefa]').forEach(btn=>{
    btn.onclick=async()=>{
      const id=btn.dataset.editarTarefa;
      try{
        const item=(c.__tarefasCasa||[]).find(x=>String(x.id)===String(id));
        if(!item)throw new Error('Tarefa não encontrada na tela atual. Atualize a página e tente novamente.');
        await renderEditarTarefaCasa(c,item);
      }catch(e){toast(e.message||'Não foi possível abrir a tarefa.');}
    };
  });

  c.querySelectorAll('[data-excluir-tarefa]').forEach(btn=>{
    btn.onclick=async()=>{
      const id=btn.dataset.excluirTarefa;
      if(!confirm('Excluir esta tarefa? Ela será removida das listas do Casa, sem apagar o registro da planilha.'))return;
      btn.disabled=true;
      try{
        const rr=await chamarApi({action:'excluirTarefaCasa',token:sessao.token,id});
        assertOk(rr); limparCacheCasa(); toast('Tarefa excluída! 🗑️'); await renderCasa(c,'hoje');
      }catch(e){toast(e.message||'Não foi possível excluir a tarefa.');btn.disabled=false;}
    };
  });
}

async function renderEditarTarefaCasa(c,item){
  subtelaModulo='editar-tarefa-casa';
  rolarModuloTopo();
  c.innerHTML=cabecalho('✏️','Editar tarefa','Atualize os dados desta tarefa da casa')+`<form id="form-editar-tarefa-casa" class="form-pagamento form-nova-tarefa-casa">
    <label class="campo-pagamento"><span>📝 Tarefa *</span><input id="casa-editar-tarefa" type="text" maxlength="120" value="${escAttr(item.tarefa||'')}" required></label>
    <label class="campo-pagamento"><span>📅 Data *</span><input id="casa-editar-data" type="date" value="${escAttr(dataInputDateLocal(item.dataPrevista))}" required></label>
    <label class="campo-pagamento"><span>👤 Responsável *</span><select id="casa-editar-responsavel" required><option value="Fernando">Fernando</option><option value="Letícia">Letícia</option><option value="Ambos">Ambos</option></select></label>
    <label class="campo-pagamento"><span>💬 Observação</span><textarea id="casa-editar-observacao" maxlength="300">${esc(item.observacao||'')}</textarea></label>
    <div class="painel" style="margin:0 0 10px;padding:10px"><small class="meta">Status atual: <strong>${esc(String(item.status||'PENDENTE'))}</strong></small></div>
    <div class="cal-form-acoes"><button id="btn-cancelar-edicao-casa" type="button" class="botao-cancelar-pagamento">Cancelar</button><button id="btn-salvar-edicao-casa" type="submit" class="botao-salvar-pagamento">💾 Salvar alterações</button></div>
  </form>`;
  $('casa-editar-responsavel').value=item.responsavel||'Ambos';
  $('btn-cancelar-edicao-casa').onclick=async()=>{await renderCasa(c,'hoje');};
  $('form-editar-tarefa-casa').onsubmit=async e=>{
    e.preventDefault();
    const botao=$('btn-salvar-edicao-casa');botao.disabled=true;botao.textContent='Salvando...';
    try{
      const dados={tarefa:$('casa-editar-tarefa').value.trim(),dataPrevista:$('casa-editar-data').value,responsavel:$('casa-editar-responsavel').value,observacao:$('casa-editar-observacao').value.trim()};
      if(!dados.tarefa||!dados.dataPrevista)throw new Error('Informe tarefa e data.');
      const rr=await chamarApi({action:'atualizarTarefaCasa',token:sessao.token,id:item.id,dados});
      assertOk(rr);limparCacheCasa();toast('Tarefa atualizada! ✅');await renderCasa(c,'hoje');rolarModuloTopo();
    }catch(e){toast(e.message||'Não foi possível atualizar a tarefa.');botao.disabled=false;botao.textContent='💾 Salvar alterações';}
  };
}

function itemRotinaCasaV26(x){
  const ativa=String(x.ativa||'').toUpperCase()==='SIM';
  const freq=String(x.frequencia||'').toUpperCase();
  const nomesDia=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  let detalhe='';
  if(freq==='DIAS') detalhe=`A cada ${Number(x.intervaloDias||0)} dias`;
  else if(freq==='SEMANAL') detalhe=`Toda ${nomesDia[Number(x.diaSemana)]||'semana'}`;
  else if(freq==='SEMANAL_ALTERNADA') detalhe=`Toda ${nomesDia[Number(x.diaSemana)]||'semana'}, alternando`;
  else if(freq==='MENSAL') detalhe=`Todo dia ${Number(x.diaMes||0)} do mês`;
  else if(freq==='PRIMEIRO_SABADO') detalhe='Primeiro sábado do mês';
  else detalhe=freq||'Frequência não definida';

  return `<div class="rotina-casa-item">
    <div class="rotina-casa-corpo">
      <div class="rotina-casa-topo"><div><strong>${esc(x.tarefa||'Rotina')}</strong><div class="meta">${esc(detalhe)} • ${esc(x.responsavel||'Ambos')}</div></div><span class="badge badge-casa ${ativa?'concluida':'cancelada'}">${ativa?'ATIVA':'INATIVA'}</span></div>
      ${x.descricao?`<div class="rotina-descricao">${esc(x.descricao)}</div>`:''}
      <div class="rotina-casa-acoes">
        <button type="button" class="rotina-mini" data-editar-rotina="${escAttr(x.id)}">✏️ Editar</button>
        <button type="button" class="rotina-mini" data-toggle-rotina="${escAttr(x.id)}">${ativa?'⏸️ Desativar':'▶️ Ativar'}</button>
        <button type="button" class="rotina-mini perigo" data-excluir-rotina="${escAttr(x.id)}">🗑️ Excluir</button>
      </div>
    </div>
  </div>`;
}

function ligarBotoesRotinaCasa(c){
  c.querySelectorAll('[data-editar-rotina]').forEach(btn=>{
    btn.onclick=async()=>{
      try{
        const item=(c.__rotinasCasa||[]).find(x=>String(x.id)===String(btn.dataset.editarRotina));
        if(!item)throw new Error('Rotina não encontrada. Atualize a tela e tente novamente.');
        await renderEditarRotinaCasa(c,item);
      }catch(e){toast(e.message||'Não foi possível abrir a rotina.');}
    };
  });

  c.querySelectorAll('[data-toggle-rotina]').forEach(btn=>{
    btn.onclick=async()=>{
      const id=btn.dataset.toggleRotina;
      const item=(c.__rotinasCasa||[]).find(x=>String(x.id)===String(id));
      if(!item)return;
      const ativa=String(item.ativa||'').toUpperCase()==='SIM';
      btn.disabled=true;
      try{
        const rr=await chamarApi({action:'atualizarStatusRotinaCasa',token:sessao.token,id,status:ativa?'NÃO':'SIM'});
        assertOk(rr); limparCacheCasa(); toast(ativa?'Rotina desativada.':'Rotina ativada.'); await renderCasa(c,'rotinas');
      }catch(e){toast(e.message||'Não foi possível alterar o status da rotina.');btn.disabled=false;}
    };
  });

  c.querySelectorAll('[data-excluir-rotina]').forEach(btn=>{
    btn.onclick=async()=>{
      const id=btn.dataset.excluirRotina;
      const item=(c.__rotinasCasa||[]).find(x=>String(x.id)===String(id));
      if(!item)return;
      if(!confirm(`Excluir a rotina "${item.tarefa||'Rotina'}"?\n\nEla será desativada e permanecerá registrada para preservar o histórico. As tarefas já geradas não serão apagadas.`))return;
      btn.disabled=true;
      try{
        const rr=await chamarApi({action:'excluirRotinaCasa',token:sessao.token,id});
        assertOk(rr); limparCacheCasa(); toast('Rotina excluída. 🗑️'); await renderCasa(c,'rotinas');
      }catch(e){toast(e.message||'Não foi possível excluir a rotina.');btn.disabled=false;}
    };
  });
}

function rotinaDiasSemanaOptions(selected){
  const nomes=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  return nomes.map((n,i)=>`<option value="${i}" ${Number(selected)===i?'selected':''}>${n}</option>`).join('');
}

function atualizarCamposFrequenciaRotinaCasa(item){
  const freq=$('rotina-frequencia')?.value||'DIAS';
  const wrap=$('rotina-opcoes-frequencia');
  if(!wrap)return;
  if(freq==='DIAS'){
    wrap.innerHTML=`<label class="campo-pagamento"><span>🔢 Intervalo em dias *</span><input id="rotina-intervalo" type="number" min="1" max="365" value="${Number(item?.intervaloDias||2)}" required></label>`;
  }else if(freq==='SEMANAL'){
    wrap.innerHTML=`<label class="campo-pagamento"><span>📆 Dia da semana *</span><select id="rotina-dia-semana" required>${rotinaDiasSemanaOptions(item?.diaSemana)}</select></label>`;
  }else if(freq==='SEMANAL_ALTERNADA'){
    wrap.innerHTML=`<label class="campo-pagamento"><span>📆 Dia da semana *</span><select id="rotina-dia-semana" required>${rotinaDiasSemanaOptions(item?.diaSemana===undefined?3:item?.diaSemana)}</select></label><label class="campo-pagamento"><span>🔄 Semana do ciclo *</span><select id="rotina-semana-base" required><option value="0" ${Number(item?.semanaBase||0)===0?'selected':''}>1ª semana do ciclo</option><option value="1" ${Number(item?.semanaBase||0)===1?'selected':''}>2ª semana do ciclo</option></select></label>`;
  }else if(freq==='MENSAL'){
    wrap.innerHTML=`<label class="campo-pagamento"><span>📅 Dia do mês *</span><input id="rotina-dia-mes" type="number" min="1" max="31" value="${Number(item?.diaMes||1)}" required></label>`;
  }else{
    wrap.innerHTML=`<div class="painel rotina-ajuda-frequencia"><small>🗓️ O LeFe Home usará automaticamente o primeiro sábado de cada mês.</small></div>`;
  }
}

async function renderFormRotinaCasa(c,item=null){
  subtelaModulo=item?'editar-rotina-casa':'nova-rotina-casa';
  rolarModuloTopo();
  const nomeUsuario=sessao.usuario?.nome||'';
  const responsavelPadrao=['Fernando','Letícia'].includes(nomeUsuario)?nomeUsuario:'Ambos';
  const freqInicial=item?.frequencia||'DIAS';
  const ativaInicial=String(item?.ativa||'SIM').toUpperCase()==='SIM';
  const titulo=item?'Editar rotina':'Nova rotina';
  const subtitulo=item?'Atualize a regra desta rotina da casa':'Cadastre uma regra para o LeFe Home gerar as tarefas automaticamente';

  c.innerHTML=cabecalho(item?'✏️':'➕',titulo,subtitulo)+`<form id="form-rotina-casa" class="form-pagamento form-nova-tarefa-casa">
    <label class="campo-pagamento"><span>📝 Nome da rotina *</span><input id="rotina-tarefa" type="text" maxlength="120" value="${escAttr(item?.tarefa||'')}" placeholder="Ex.: Lavar roupas" required></label>
    <label class="campo-pagamento"><span>💬 Descrição</span><textarea id="rotina-descricao" maxlength="300" placeholder="Explique o que deve ser feito.">${esc(item?.descricao||'')}</textarea></label>
    <label class="campo-pagamento"><span>🔁 Frequência *</span><select id="rotina-frequencia" required><option value="DIAS">A cada X dias</option><option value="SEMANAL">Toda semana</option><option value="SEMANAL_ALTERNADA">Semanal alternada</option><option value="MENSAL">Todo dia do mês</option><option value="PRIMEIRO_SABADO">Primeiro sábado do mês</option></select></label>
    <div id="rotina-opcoes-frequencia"></div>
    <label class="campo-pagamento"><span>📅 Data de início *</span><input id="rotina-data-inicio" type="date" value="${escAttr(dataInputDateLocal(item?.dataInicio)||dataInputHoje())}" required></label>
    <label class="campo-pagamento"><span>👤 Responsável *</span><select id="rotina-responsavel" required><option value="Fernando">Fernando</option><option value="Letícia">Letícia</option><option value="Ambos">Ambos</option></select></label>
    <label class="campo-pagamento"><span>⚙️ Status</span><select id="rotina-ativa"><option value="SIM">Ativa</option><option value="NÃO">Inativa</option></select></label>
    <div class="painel rotina-ajuda-frequencia"><small>ℹ️ A alteração da regra vale para novas ocorrências. Tarefas que já foram geradas permanecem como estão.</small></div>
    <div class="cal-form-acoes"><button id="btn-cancelar-rotina" type="button" class="botao-cancelar-pagamento">Cancelar</button><button id="btn-salvar-rotina" type="submit" class="botao-salvar-pagamento">💾 ${item?'Salvar alterações':'Criar rotina'}</button></div>
  </form>`;

  $('rotina-frequencia').value=freqInicial;
  $('rotina-responsavel').value=item?.responsavel||responsavelPadrao;
  $('rotina-ativa').value=ativaInicial?'SIM':'NÃO';
  atualizarCamposFrequenciaRotinaCasa(item);
  $('rotina-frequencia').addEventListener('change',()=>atualizarCamposFrequenciaRotinaCasa(null));
  $('btn-cancelar-rotina').onclick=async()=>{await renderCasa(c,'rotinas');};

  $('form-rotina-casa').onsubmit=async e=>{
    e.preventDefault();
    const botao=$('btn-salvar-rotina'); botao.disabled=true; botao.textContent='Salvando...';
    try{
      const freq=$('rotina-frequencia').value;
      const dados={
        tarefa:$('rotina-tarefa').value.trim(),
        descricao:$('rotina-descricao').value.trim(),
        frequencia:freq,
        intervaloDias:freq==='DIAS'?Number($('rotina-intervalo')?.value||0):'',
        dataInicio:$('rotina-data-inicio').value,
        diaSemana:(freq==='SEMANAL'||freq==='SEMANAL_ALTERNADA')?Number($('rotina-dia-semana')?.value||0):(freq==='PRIMEIRO_SABADO'?6:''),
        semanaBase:freq==='SEMANAL_ALTERNADA'?Number($('rotina-semana-base')?.value||0):'',
        diaMes:freq==='MENSAL'?Number($('rotina-dia-mes')?.value||0):'',
        responsavel:$('rotina-responsavel').value,
        ativa:$('rotina-ativa').value,
        ordem:item?.ordem||''
      };
      if(!dados.tarefa||!dados.dataInicio)throw new Error('Informe nome e data de início.');
      if(freq==='DIAS'&&dados.intervaloDias<1)throw new Error('Informe um intervalo de dias válido.');
      if((freq==='SEMANAL'||freq==='SEMANAL_ALTERNADA')&&(dados.diaSemana<0||dados.diaSemana>6))throw new Error('Informe o dia da semana.');
      if(freq==='SEMANAL_ALTERNADA'&&(dados.semanaBase!==0&&dados.semanaBase!==1))throw new Error('Informe a semana do ciclo.');
      if(freq==='MENSAL'&&(dados.diaMes<1||dados.diaMes>31))throw new Error('Informe um dia do mês entre 1 e 31.');
      const acao=item?'atualizarRotinaCasa':'inserirRotinaCasa';
      const payload={action:acao,token:sessao.token,dados};
      if(item)payload.id=item.id;
      const rr=await chamarApi(payload); assertOk(rr); limparCacheCasa(); toast(item?'Rotina atualizada! ✅':'Rotina criada! 🏠'); await renderCasa(c,'rotinas'); rolarModuloTopo();
    }catch(e){toast(e.message||'Não foi possível salvar a rotina.');botao.disabled=false;botao.textContent=`💾 ${item?'Salvar alterações':'Criar rotina'}`;}
  };
}

async function renderNovaRotinaCasa(c){await renderFormRotinaCasa(c,null);}
async function renderEditarRotinaCasa(c,item){await renderFormRotinaCasa(c,item);}

async function renderNovaTarefaCasa(c){
  subtelaModulo='nova-tarefa-casa';
  rolarModuloTopo();
  const nomeUsuario=sessao.usuario?.nome||'';
  const responsavelPadrao=['Fernando','Letícia'].includes(nomeUsuario)?nomeUsuario:'Ambos';
  c.innerHTML=cabecalho('➕','Nova tarefa','Adicione uma tarefa manual para a casa')+`<form id="form-nova-tarefa-casa" class="form-pagamento form-nova-tarefa-casa">
    <label class="campo-pagamento"><span>📝 Tarefa *</span><input id="casa-tarefa" type="text" maxlength="120" placeholder="Ex.: Lavar as roupas" required></label>
    <label class="campo-pagamento"><span>📅 Data *</span><input id="casa-data" type="date" value="${dataInputHoje()}" required></label>
    <label class="campo-pagamento"><span>👤 Responsável *</span><select id="casa-responsavel" required><option value="Fernando" ${responsavelPadrao==='Fernando'?'selected':''}>Fernando</option><option value="Letícia" ${responsavelPadrao==='Letícia'?'selected':''}>Letícia</option><option value="Ambos" ${responsavelPadrao==='Ambos'?'selected':''}>Ambos</option></select></label>
    <label class="campo-pagamento"><span>💬 Observação</span><textarea id="casa-observacao" maxlength="300" placeholder="Algum detalhe da tarefa?"></textarea></label>
    <button id="btn-salvar-tarefa-casa" type="submit" class="botao-salvar-pagamento">✅ Inserir tarefa</button><button id="btn-cancelar-tarefa-casa" type="button" class="botao-cancelar-pagamento">Cancelar</button></form>`;
  $('btn-cancelar-tarefa-casa').onclick=async()=>{await renderCasa(c,'hoje');};
  $('form-nova-tarefa-casa').onsubmit=async e=>{
    e.preventDefault(); const botao=$('btn-salvar-tarefa-casa'); botao.disabled=true; botao.textContent='Salvando...';
    try{const r=await chamarApi({action:'inserirTarefaCasa',token:sessao.token,dados:{tarefa:$('casa-tarefa').value.trim(),dataPrevista:$('casa-data').value,responsavel:$('casa-responsavel').value,observacao:$('casa-observacao').value.trim()}});assertOk(r);limparCacheCasa();toast('Tarefa inserida com sucesso! 🏠');await renderCasa(c,'hoje');rolarModuloTopo();}
    catch(err){toast(err.message||'Não foi possível inserir a tarefa.');botao.disabled=false;botao.textContent='✅ Inserir tarefa';}
  };
}

/* =========================================================
   COMPRAS PLANEJADAS
========================================================= */

async function renderComprasPlanejadas(c, filtroInicial='TODAS', buscaInicial='', ordemInicial='RECENTES'){
  subtelaModulo=null;

  const r=await chamarApi({
    action:'listarComprasPlanejadas',
    token:sessao.token
  });
  assertOk(r);

  const itens=r.dados||[];
  renderListaComprasPlanejadas(c,itens,filtroInicial,buscaInicial,ordemInicial);
}

function resumoComprasPlanejadas(itens){
  const ativas=itens.filter(x=>!['COMPRADA','DESISTIMOS'].includes(String(x.status||'').toUpperCase()));
  const compradas=itens.filter(x=>String(x.status||'').toUpperCase()==='COMPRADA');
  const total=ativas.reduce((s,x)=>s+Number(x.preco||0),0);
  return {ativas,compradas,total};
}

function filtrarOrdenarComprasPlanejadas(itens,filtro='TODAS',busca='',ordem='RECENTES'){
  const termo=String(busca||'').trim().toLowerCase();
  let lista=filtro==='TODAS'
    ? [...itens]
    : itens.filter(x=>String(x.status||'').toUpperCase()===filtro);

  if(termo){
    lista=lista.filter(x=>[
      x.nome,x.loja,x.categoria,x.descricao,x.observacao
    ].some(v=>String(v||'').toLowerCase().includes(termo)));
  }

  const statusOrdem={DESEJADA:1,PESQUISANDO:2,AGUARDANDO:3,COMPRADA:4,DESISTIMOS:5};
  lista.sort((a,b)=>{
    if(ordem==='MENOR_PRECO') return Number(a.preco||0)-Number(b.preco||0);
    if(ordem==='MAIOR_PRECO') return Number(b.preco||0)-Number(a.preco||0);
    if(ordem==='NOME_AZ') return String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR');
    if(ordem==='NOME_ZA') return String(b.nome||'').localeCompare(String(a.nome||''),'pt-BR');
    if(ordem==='STATUS') return (statusOrdem[String(a.status||'').toUpperCase()]||99)-(statusOrdem[String(b.status||'').toUpperCase()]||99);

    const da=new Date(a.criadoEm||a.atualizadoEm||0).getTime()||0;
    const db=new Date(b.criadoEm||b.atualizadoEm||0).getTime()||0;
    return db-da;
  });

  return lista;
}

function resumoCategoriasCompras(itens){
  const mapa={};
  itens
    .filter(x=>!['COMPRADA','DESISTIMOS'].includes(String(x.status||'').toUpperCase()))
    .forEach(x=>{
      const cat=String(x.categoria||'Outros');
      if(!mapa[cat]) mapa[cat]={categoria:cat,quantidade:0,total:0};
      mapa[cat].quantidade++;
      mapa[cat].total+=Number(x.preco||0);
    });

  return Object.values(mapa).sort((a,b)=>b.total-a.total);
}

function renderListaComprasPlanejadas(c,itens,filtro='TODAS',busca='',ordem='RECENTES'){
  const resumo=resumoComprasPlanejadas(itens);
  const itensFiltrados=filtrarOrdenarComprasPlanejadas(itens,filtro,busca,ordem);
  const categorias=resumoCategoriasCompras(itens);

  c.innerHTML=
    `<div class="cabecalho-compras-planejadas">
      ${cabecalho('🛍️','Compras Planejadas','Coisas que queremos comprar depois')}
      <button id="btn-nova-compra-planejada" type="button" class="botao-nova-compra-planejada">＋ Compra</button>
    </div>`+
    `<div class="cards-resumo cards-resumo-compras">
      <div class="card-resumo"><small>Planejadas</small><strong class="laranja">${resumo.ativas.length}</strong></div>
      <div class="card-resumo"><small>Total planejado</small><strong class="laranja">${moeda(resumo.total)}</strong></div>
      <div class="card-resumo"><small>Compradas</small><strong class="verde">${resumo.compradas.length}</strong></div>
    </div>`+
    `<div class="painel painel-categorias-compras">
      <div class="painel-titulo"><h3>💰 Total por categoria</h3><span>ativas</span></div>
      <div class="categorias-compras-grid">
        ${categorias.length?categorias.map(x=>`<div class="categoria-compra-resumo"><strong>${esc(x.categoria)}</strong><span>${x.quantidade} ${x.quantidade===1?'item':'itens'}</span><b>${moeda(x.total)}</b></div>`).join(''):'<div class="vazio">Nenhuma compra planejada ativa.</div>'}
      </div>
    </div>`+
    `<div class="controles-compras-planejadas">
      <label class="campo-busca-compras">
        <span>🔎</span>
        <input id="busca-compras-planejadas" type="search" value="${escAttr(busca)}" placeholder="Buscar produto, loja ou categoria..." autocomplete="off">
      </label>
      <select id="ordem-compras-planejadas" aria-label="Ordenar compras">
        <option value="RECENTES" ${ordem==='RECENTES'?'selected':''}>Mais recentes</option>
        <option value="MENOR_PRECO" ${ordem==='MENOR_PRECO'?'selected':''}>Menor preço</option>
        <option value="MAIOR_PRECO" ${ordem==='MAIOR_PRECO'?'selected':''}>Maior preço</option>
        <option value="NOME_AZ" ${ordem==='NOME_AZ'?'selected':''}>Nome A–Z</option>
        <option value="NOME_ZA" ${ordem==='NOME_ZA'?'selected':''}>Nome Z–A</option>
        <option value="STATUS" ${ordem==='STATUS'?'selected':''}>Por status</option>
      </select>
    </div>`+
    `<div class="barra-filtros-compras">
      ${chipCompra('TODAS','Todas',filtro)}
      ${chipCompra('DESEJADA','Quero comprar',filtro)}
      ${chipCompra('PESQUISANDO','Pesquisando',filtro)}
      ${chipCompra('AGUARDANDO','Aguardando',filtro)}
      ${chipCompra('COMPRADA','Compradas',filtro)}
      ${chipCompra('DESISTIMOS','Desistimos',filtro)}
    </div>`+
    `<div class="cabecalho-lista-compras">
      <strong>${esc(rotuloFiltroCompra(filtro))}</strong>
      <span>${itensFiltrados.length} ${itensFiltrados.length===1?'item':'itens'}</span>
    </div>`+
    `<div id="lista-compras-planejadas" class="lista-compras-planejadas">
      ${itensFiltrados.length?itensFiltrados.map(itemCompraPlanejada).join(''):'<div class="painel vazio">Nenhum item encontrado.<br>Adicione uma compra ou altere a busca/filtro. 🛍️</div>'}
    </div>`;

  $('btn-nova-compra-planejada').addEventListener('click',async()=>{
    await renderNovaCompraPlanejada(c);
  });

  const buscaEl=$('busca-compras-planejadas');
  let timerBusca;
  buscaEl.addEventListener('input',()=>{
    clearTimeout(timerBusca);
    const valor=buscaEl.value;
    const pos=buscaEl.selectionStart ?? valor.length;
    timerBusca=setTimeout(()=>{
      const ordemAtual=$('ordem-compras-planejadas')?.value||ordem;
      renderListaComprasPlanejadas(c,itens,filtro,valor,ordemAtual);
      const novoCampo=$('busca-compras-planejadas');
      if(novoCampo){
        novoCampo.focus();
        try{novoCampo.setSelectionRange(pos,pos);}catch(e){}
      }
    },180);
  });

  $('ordem-compras-planejadas').addEventListener('change',()=>{
    renderListaComprasPlanejadas(c,itens,filtro,buscaEl.value,$('ordem-compras-planejadas').value);
  });

  c.querySelectorAll('[data-filtro-compra]').forEach(btn=>{
    btn.addEventListener('click',()=>renderListaComprasPlanejadas(c,itens,btn.dataset.filtroCompra,buscaEl.value,$('ordem-compras-planejadas').value));
  });

  ligarStatusComprasPlanejadas(c,filtro,busca,ordem);

  c.querySelectorAll('[data-editar-compra]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const item=itens.find(x=>String(x.id)===String(btn.dataset.editarCompra));
      if(item) renderEditarCompraPlanejada(c,item);
    });
  });

  c.querySelectorAll('[data-excluir-compra]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const item=itens.find(x=>String(x.id)===String(btn.dataset.excluirCompra));
      if(!item) return;
      const confirma=window.confirm(`Excluir "${item.nome||'esta compra'}" da lista?\n\nEssa ação não pode ser desfeita.`);
      if(!confirma) return;
      btn.disabled=true;
      try{
        const rr=await chamarApi({
          action:'excluirCompraPlanejada',
          token:sessao.token,
          id:item.id
        });
        assertOk(rr);
        toast('Compra excluída. 🗑️');
        await renderComprasPlanejadas(c,filtro,busca,ordem);
      }catch(e){
        toast(e.message||'Não foi possível excluir.');
        btn.disabled=false;
      }
    });
  });
}

function rotuloFiltroCompra(filtro){
  return ({
    TODAS:'Todas as compras',
    DESEJADA:'Quero comprar',
    PESQUISANDO:'Em pesquisa',
    AGUARDANDO:'Aguardando oportunidade',
    COMPRADA:'Compradas',
    DESISTIMOS:'Desistimos'
  })[filtro]||'Compras';
}

function ligarStatusComprasPlanejadas(c,filtro,busca='',ordem='RECENTES'){
  c.querySelectorAll('[data-status-compra]').forEach(sel=>{
    sel.addEventListener('change',async()=>{
      sel.disabled=true;
      try{
        const rr=await chamarApi({
          action:'atualizarStatusCompraPlanejada',
          token:sessao.token,
          id:sel.dataset.statusCompra,
          status:sel.value
        });
        assertOk(rr);
        toast('Status atualizado! ✅');
        await renderComprasPlanejadas(c,filtro,busca,ordem);
      }catch(e){
        toast(e.message||'Não foi possível atualizar.');
        sel.disabled=false;
      }
    });
  });
}

function chipCompra(valor,label,atual){
  return `<button type="button" class="chip chip-compra ${valor===atual?'ativo':''}" data-filtro-compra="${escAttr(valor)}">${esc(label)}</button>`;
}

function itemCompraPlanejada(x){
  const status=String(x.status||'DESEJADA').toUpperCase();
  const imagem=x.imagemUrl
    ? `<a class="imagem-link-compra" href="${escAttr(x.link)}" target="_blank" rel="noopener noreferrer"><img class="imagem-compra-planejada" src="${escAttr(x.imagemUrl)}" alt="" loading="lazy" onerror="this.style.display='none'" /></a>`
    : '<a class="imagem-link-compra" href="'+escAttr(x.link)+'" target="_blank" rel="noopener noreferrer"><div class="imagem-compra-planejada sem-imagem">🛍️</div></a>';
  const descricao=x.descricao?`<div class="descricao-compra-planejada">${esc(x.descricao)}</div>`:'';
  const preco=Number(x.preco||0)>0?moeda(x.preco):'Preço não informado';
  const categoria=x.categoria?`<span>🏷️ ${esc(x.categoria)}</span>`:'';
  const loja=x.loja?`<span>🏪 ${esc(x.loja)}</span>`:'<span>🏪 Loja não identificada</span>';

  return `<article class="card-compra-planejada ${status.toLowerCase()}">
    ${imagem}
    <div class="conteudo-compra-planejada">
      <div class="topo-card-compra">
        <div class="titulo-compra-wrap">
          <h3>${esc(x.nome||'Produto')}</h3>
          <div class="meta-compra-planejada">${loja}${categoria?` <b>•</b> ${categoria}`:''}</div>
        </div>
        <strong class="preco-compra-planejada">${esc(preco)}</strong>
      </div>
      ${descricao}
      <div class="linha-status-compra">
        <span class="badge-compra ${status.toLowerCase()}">${esc(formatarStatusCompra(status))}</span>
        <select class="select-status-compra" data-status-compra="${escAttr(x.id)}" aria-label="Status da compra">
          ${statusOptionsCompra(status)}
        </select>
      </div>
      ${x.observacao?`<div class="observacao-compra-planejada">💬 ${esc(x.observacao)}</div>`:''}
      <div class="acoes-compra-planejada">
        <a class="botao-link-compra" href="${escAttr(x.link)}" target="_blank" rel="noopener noreferrer">🔗 Ver produto</a>
        <button type="button" class="botao-editar-compra" data-editar-compra="${escAttr(x.id)}">✏️ Editar</button>
        <button type="button" class="botao-excluir-compra" data-excluir-compra="${escAttr(x.id)}">🗑️</button>
      </div>
    </div>
  </article>`;
}

function statusOptionsCompra(atual){
  const op=[
    ['DESEJADA','Quero comprar'],
    ['PESQUISANDO','Pesquisando'],
    ['AGUARDANDO','Aguardando oportunidade'],
    ['COMPRADA','Comprada'],
    ['DESISTIMOS','Desistimos']
  ];
  return op.map(([v,t])=>`<option value="${v}" ${v===atual?'selected':''}>${t}</option>`).join('');
}

function formatarStatusCompra(status){
  return ({
    DESEJADA:'Quero comprar',
    PESQUISANDO:'Pesquisando',
    AGUARDANDO:'Aguardando',
    COMPRADA:'Comprada',
    DESISTIMOS:'Desistimos'
  })[status]||status;
}

async function renderNovaCompraPlanejada(c){
  subtelaModulo='nova-compra-planejada';
  let ultimoLinkBusca='';
  rolarModuloTopo();

  const categorias=['Casa','Vestuário','Cama, mesa e banho','Cozinha','Eletrônicos','Ferramentas','Outros'];

  c.innerHTML=
    cabecalho('🛍️','Adicionar compra','Cole o link e tente buscar os dados automaticamente')+
    `<form id="form-nova-compra-planejada" class="form-pagamento form-nova-compra-planejada" autocomplete="off">
      <label class="campo-pagamento">
        <span>🔗 Link do produto *</span>
        <div class="campo-link-produto">
          <input id="compra-link" type="url" maxlength="2000" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://loja.com/produto..." required>
          <button id="btn-buscar-produto" type="button" class="botao-buscar-produto">Buscar</button>
        </div>
        <small class="ajuda-campo">O LeFe Home tenta encontrar nome, preço, loja e imagem.</small>
      </label>

      <div id="aviso-busca-produto" class="aviso-busca-produto escondido"></div>

      <label class="campo-pagamento"><span>📝 Nome do produto *</span><input id="compra-nome" type="text" maxlength="180" autocomplete="off" placeholder="Ex.: Jogo de cama casal" required></label>
      <label class="campo-pagamento"><span>💰 Preço</span><input id="compra-preco" type="number" min="0" step="0.01" inputmode="decimal" autocomplete="off" placeholder="0,00"></label>
      <label class="campo-pagamento"><span>🏪 Loja</span><input id="compra-loja" type="text" maxlength="120" autocomplete="off" placeholder="Ex.: Mercado Livre"></label>
      <label class="campo-pagamento"><span>🏷️ Categoria</span><select id="compra-categoria">${categorias.map(x=>`<option value="${escAttr(x)}">${esc(x)}</option>`).join('')}</select></label>
      <label class="campo-pagamento"><span>💬 Descrição</span><textarea id="compra-descricao" maxlength="500" autocomplete="off" rows="3" placeholder="Descrição encontrada no produto ou escrita por vocês."></textarea></label>
      <label class="campo-pagamento"><span>📌 Status</span><select id="compra-status">${statusOptionsCompra('DESEJADA')}</select></label>
      <label class="campo-pagamento"><span>💬 Observação</span><textarea id="compra-observacao" maxlength="500" autocomplete="off" rows="3" placeholder="Ex.: esperar promoção ou comparar com outra loja."></textarea></label>
      <input id="compra-imagem" type="hidden">
      <button id="btn-salvar-compra-planejada" type="submit" class="botao-salvar-pagamento">🛍️ Adicionar à lista</button>
      <button id="btn-cancelar-compra-planejada" type="button" class="botao-cancelar-pagamento">Cancelar</button>
    </form>`;

  $('btn-cancelar-compra-planejada').addEventListener('click',async()=>renderComprasPlanejadas(c));
  ligarBuscaProdutoCompraPlanejada({modo:'novo'});

  $('form-nova-compra-planejada').addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=$('btn-salvar-compra-planejada');
    const link=$('compra-link').value.trim();
    const nome=$('compra-nome').value.trim();
    const preco=Number($('compra-preco').value||0);
    if(!link) return toast('Informe o link do produto.');
    if(!nome) return toast('Informe o nome do produto.');
    btn.disabled=true; btn.textContent='Salvando...';
    try{
      const r=await chamarApi({action:'inserirCompraPlanejada',token:sessao.token,dados:{link,nome,descricao:$('compra-descricao').value.trim(),preco,loja:$('compra-loja').value.trim(),categoria:$('compra-categoria').value,status:$('compra-status').value,imagemUrl:$('compra-imagem').value.trim(),observacao:$('compra-observacao').value.trim()}});
      assertOk(r);
      toast('Compra adicionada à lista! 🛍️');
      await renderComprasPlanejadas(c);
      rolarModuloTopo();
    }catch(err){
      toast(err.message||'Não foi possível adicionar a compra.');
      btn.disabled=false; btn.textContent='🛍️ Adicionar à lista';
    }
  });
}

function ligarBuscaProdutoCompraPlanejada({modo='novo'}={}){
  let ultimoLinkBusca=$('compra-link')?.value.trim()||'';
  const linkInput=$('compra-link');
  const aviso=$('aviso-busca-produto');
  const btn=$('btn-buscar-produto');
  if(!linkInput||!btn) return;

  linkInput.addEventListener('input',()=>{
    const atual=linkInput.value.trim();
    if(ultimoLinkBusca && atual!==ultimoLinkBusca){
      $('compra-nome').value='';
      $('compra-preco').value='';
      $('compra-loja').value='';
      $('compra-descricao').value='';
      $('compra-imagem').value='';
      aviso.classList.add('escondido');
      ultimoLinkBusca='';
    }
  });

  btn.addEventListener('click',async()=>{
    const link=linkInput.value.trim();
    if(!link) return toast('Cole primeiro o link do produto.');

    $('compra-nome').value='';
    $('compra-preco').value='';
    $('compra-loja').value='';
    $('compra-descricao').value='';
    $('compra-imagem').value='';
    btn.disabled=true; btn.textContent='Buscando...';
    aviso.classList.remove('escondido'); aviso.textContent='🔎 Lendo os dados da página...';
    try{
      const r=await chamarApi({action:'buscarProdutoLink',token:sessao.token,link});
      assertOk(r);
      const d=r.dados||{};
      if(d.nome) $('compra-nome').value=d.nome;
      if(Number(d.preco||0)>0) $('compra-preco').value=Number(d.preco).toFixed(2);
      if(d.loja) $('compra-loja').value=d.loja;
      if(d.descricao) $('compra-descricao').value=d.descricao;
      if(d.imagemUrl) $('compra-imagem').value=d.imagemUrl;
      ultimoLinkBusca=link;
      aviso.textContent=r.aviso||'✅ Dados encontrados. Confira antes de salvar.';
    }catch(e){
      ultimoLinkBusca='';
      aviso.textContent='⚠️ Não foi possível buscar automaticamente. Você pode preencher os campos manualmente.';
      toast(e.message||'Não foi possível ler esse link.');
    }finally{
      btn.disabled=false; btn.textContent='Buscar';
    }
  });
}

async function renderEditarCompraPlanejada(c,item){
  subtelaModulo='editar-compra-planejada';
  rolarModuloTopo();
  const categorias=['Casa','Vestuário','Cama, mesa e banho','Cozinha','Eletrônicos','Ferramentas','Outros'];

  c.innerHTML=
    cabecalho('✏️','Editar compra','Atualize os dados desta compra planejada')+
    `<form id="form-editar-compra-planejada" class="form-pagamento form-nova-compra-planejada" autocomplete="off">
      <div class="identificador-edicao">ID: <strong>${esc(item.id)}</strong></div>
      <label class="campo-pagamento"><span>🔗 Link do produto *</span><div class="campo-link-produto"><input id="compra-link" type="url" maxlength="2000" value="${escAttr(item.link||'')}" autocomplete="off" autocapitalize="none" spellcheck="false" required><button id="btn-buscar-produto" type="button" class="botao-buscar-produto">Buscar</button></div></label>
      <div id="aviso-busca-produto" class="aviso-busca-produto escondido"></div>
      <label class="campo-pagamento"><span>📝 Nome do produto *</span><input id="compra-nome" type="text" maxlength="180" value="${escAttr(item.nome||'')}" required></label>
      <label class="campo-pagamento"><span>💰 Preço</span><input id="compra-preco" type="number" min="0" step="0.01" inputmode="decimal" value="${Number(item.preco||0)>0?Number(item.preco).toFixed(2):''}"></label>
      <label class="campo-pagamento"><span>🏪 Loja</span><input id="compra-loja" type="text" maxlength="120" value="${escAttr(item.loja||'')}"></label>
      <label class="campo-pagamento"><span>🏷️ Categoria</span><select id="compra-categoria">${categorias.map(x=>`<option value="${escAttr(x)}" ${x===item.categoria?'selected':''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="campo-pagamento"><span>💬 Descrição</span><textarea id="compra-descricao" maxlength="500" rows="3">${esc(item.descricao||'')}</textarea></label>
      <label class="campo-pagamento"><span>📌 Status</span><select id="compra-status">${statusOptionsCompra(String(item.status||'DESEJADA').toUpperCase())}</select></label>
      <label class="campo-pagamento"><span>💬 Observação</span><textarea id="compra-observacao" maxlength="500" rows="3">${esc(item.observacao||'')}</textarea></label>
      <input id="compra-imagem" type="hidden" value="${escAttr(item.imagemUrl||'')}">
      <button id="btn-salvar-compra-planejada" type="submit" class="botao-salvar-pagamento">💾 Salvar alterações</button>
      <button id="btn-cancelar-compra-planejada" type="button" class="botao-cancelar-pagamento">Cancelar</button>
    </form>`;

  $('btn-cancelar-compra-planejada').addEventListener('click',async()=>renderComprasPlanejadas(c));
  ligarBuscaProdutoCompraPlanejada({modo:'editar'});

  $('form-editar-compra-planejada').addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=$('btn-salvar-compra-planejada');
    const nome=$('compra-nome').value.trim();
    if(!nome) return toast('Informe o nome do produto.');
    btn.disabled=true; btn.textContent='Salvando...';
    try{
      const r=await chamarApi({action:'atualizarCompraPlanejada',token:sessao.token,id:item.id,dados:{link:$('compra-link').value.trim(),nome,descricao:$('compra-descricao').value.trim(),preco:Number($('compra-preco').value||0),loja:$('compra-loja').value.trim(),categoria:$('compra-categoria').value,status:$('compra-status').value,imagemUrl:$('compra-imagem').value.trim(),observacao:$('compra-observacao').value.trim()}});
      assertOk(r);
      toast('Compra atualizada! ✅');
      await renderComprasPlanejadas(c);
      rolarModuloTopo();
    }catch(err){
      toast(err.message||'Não foi possível atualizar a compra.');
      btn.disabled=false; btn.textContent='💾 Salvar alterações';
    }
  });
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

let calendarioEstado={ano:new Date().getFullYear(),mes:new Date().getMonth(),diaSelecionado:null};
let calendarioFormId=null;

async function renderCalendario(c){
  subtelaModulo=null;
  const ano=calendarioEstado.ano, mes=calendarioEstado.mes;
  const inicio=chaveDataLocalFront(new Date(ano,mes,1));
  const fim=chaveDataLocalFront(new Date(ano,mes+1,0));
  const r=await chamarApi({action:'listarCalendario',token:sessao.token,inicio,fim});
  assertOk(r);
  const itens=r.dados?.eventos||[];
  const eventosMes=itens.filter(x=>x.origem==='CALENDARIO');
  const casaMes=itens.filter(x=>x.origem==='CASA');
  const financeiroMes=itens.filter(x=>x.origem==='FINANCEIRO');
  const hoje=chaveDataLocalFront(new Date());
  if(!calendarioEstado.diaSelecionado || !String(calendarioEstado.diaSelecionado).startsWith(`${ano}-${String(mes+1).padStart(2,'0')}`)){
    calendarioEstado.diaSelecionado=(hoje>=inicio&&hoje<=fim)?hoje:inicio;
  }
  const diasSemana=['SEG','TER','QUA','QUI','SEX','SÁB','DOM'];
  const primeiro=(new Date(ano,mes,1).getDay()+6)%7;
  const ultimo=new Date(ano,mes+1,0).getDate();
  const porDia={};
  itens.forEach(x=>{const k=chaveDataLocalFront(x.data);(porDia[k]??=[]).push(x)});
  let celulas='';
  for(let i=0;i<primeiro;i++) celulas+='<div class="cal-vazio-dia"></div>';
  for(let d=1;d<=ultimo;d++){
    const k=chaveDataLocalFront(new Date(ano,mes,d));
    const lista=porDia[k]||[];
    const cls=[k===hoje?'hoje':'',k===calendarioEstado.diaSelecionado?'selecionado':''].filter(Boolean).join(' ');
    celulas+=`<button type="button" class="cal-dia ${cls}" data-cal-dia="${k}"><strong>${d}</strong>${lista.slice(0,3).map(calChip).join('')}${lista.length>3?`<span class="cal-mais">+${lista.length-3}</span>`:''}</button>`;
  }
  const selecionados=(porDia[calendarioEstado.diaSelecionado]||[]).sort(calOrdenarItens);
  const tituloMes=new Date(ano,mes,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const diaTitulo=calendarioEstado.diaSelecionado?calendarioEstado.diaSelecionado.split('-').reverse().join('/'):'';
  const proximos=itens.filter(x=>chaveDataLocalFront(x.data)>=hoje).sort(calOrdenarItens).slice(0,8);

  c.innerHTML=cabecalho('📅','Calendário','Compromissos, tarefas e vencimentos')+`
    <div class="cal-topo-acoes">
      <button type="button" class="botao-cal-principal" id="btn-novo-evento-cal">＋ Novo evento</button>
      <button type="button" class="botao-cal-secundario" id="btn-cal-hoje">Hoje</button>
    </div>
    <div class="cards-resumo cal-resumo">
      <div class="card-resumo"><small>Eventos</small><strong class="laranja">${eventosMes.length}</strong></div>
      <div class="card-resumo"><small>Casa</small><strong class="verde">${casaMes.length}</strong></div>
      <div class="card-resumo"><small>Financeiro</small><strong class="amarelo">${financeiroMes.length}</strong></div>
    </div>
    <div id="cal-form-wrap"></div>
    <div class="painel calendario-principal">
      <div class="cal-navegacao"><button type="button" class="cal-nav" id="cal-mes-anterior">‹</button><h3>${esc(tituloMes)}</h3><button type="button" class="cal-nav" id="cal-mes-proximo">›</button></div>
      <div class="cal-dias-semana">${diasSemana.map(x=>`<span>${x}</span>`).join('')}</div>
      <div class="cal-grade">${celulas}</div>
    </div>
    <div id="cal-detalhe-dia" class="painel">
      <div class="painel-titulo"><h3>📌 ${diaTitulo}</h3><span>${selecionados.length}</span></div>
      <div class="lista-modulo">${selecionados.length?selecionados.map(itemCalendarioCard).join(''):'<div class="vazio">Nenhum compromisso neste dia.</div>'}</div>
    </div>
    <div class="painel">
      <div class="painel-titulo"><h3>⏭️ Próximos</h3><span>${proximos.length}</span></div>
      <div class="lista-modulo">${proximos.length?proximos.map(itemCalendarioCard).join(''):'<div class="vazio">Nenhum item próximo.</div>'}</div>
    </div>`;

  $('btn-novo-evento-cal').onclick=async()=>{calendarioFormId=null;renderCalendarioFormulario(c,{dataInicio:calendarioEstado.diaSelecionado||hoje});};
  $('btn-cal-hoje').onclick=async()=>{const d=new Date();calendarioEstado.ano=d.getFullYear();calendarioEstado.mes=d.getMonth();calendarioEstado.diaSelecionado=chaveDataLocalFront(d);await renderCalendario(c);rolarModuloTopo();};
  $('cal-mes-anterior').onclick=async()=>{calendarioEstado.mes--;if(calendarioEstado.mes<0){calendarioEstado.mes=11;calendarioEstado.ano--;}calendarioEstado.diaSelecionado=null;await renderCalendario(c);};
  $('cal-mes-proximo').onclick=async()=>{calendarioEstado.mes++;if(calendarioEstado.mes>11){calendarioEstado.mes=0;calendarioEstado.ano++;}calendarioEstado.diaSelecionado=null;await renderCalendario(c);};
  c.querySelectorAll('[data-cal-dia]').forEach(btn=>btn.onclick=async()=>{calendarioEstado.diaSelecionado=btn.dataset.calDia;await renderCalendario(c);});
  c.querySelectorAll('[data-cal-editar]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.calEditar;const item=itens.find(x=>x.origem==='CALENDARIO'&&x.serieId===id);if(item){calendarioFormId=id;renderCalendarioFormulario(c,item);}});
  c.querySelectorAll('[data-cal-excluir]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.calExcluir;if(!confirm('Excluir este evento? Para eventos recorrentes, toda a série será desativada.'))return;try{const rr=await chamarApi({action:'excluirEventoCalendario',token:sessao.token,id});assertOk(rr);toast('Evento excluído. 🗑️');await renderCalendario(c);}catch(e){toast(e.message||'Não foi possível excluir o evento.');}});
}

function renderCalendarioFormulario(c,item={}){
  const wrap=$('cal-form-wrap');
  if(!wrap)return;
  const dataInicio=item.dataInicio||item.data||dataInputHoje();
  const dataFim=item.dataFim||'';
  wrap.innerHTML=`<div class="painel cal-form"><div class="painel-titulo"><h3>${calendarioFormId?'✏️ Editar evento':'➕ Novo evento'}</h3><button type="button" class="cal-fechar" id="cal-form-fechar">✕</button></div><div class="form-pagamento">
    <label class="campo-pagamento"><span>Título</span><input id="cal-titulo" type="text" maxlength="120" value="${escAttr(item.titulo||'')}" placeholder="Ex.: Jantar, consulta, compromisso..."></label>
    <label class="campo-pagamento"><span>Descrição</span><textarea id="cal-descricao" maxlength="500" placeholder="Detalhes opcionais">${esc(item.descricao||'')}</textarea></label>
    <div class="cal-form-grid"><label class="campo-pagamento"><span>Data</span><input id="cal-data" type="date" value="${escAttr(dataInputDateLocal(dataInicio))}"></label><label class="campo-pagamento"><span>Horário</span><input id="cal-hora" type="time" value="${escAttr(item.hora||'')}"></label></div>
    <div class="cal-form-grid"><label class="campo-pagamento"><span>Categoria</span><select id="cal-categoria"><option value="PESSOAL">Pessoal</option><option value="CASA">Casa</option><option value="COMPROMISSO">Compromisso</option><option value="OUTRO">Outro</option></select></label><label class="campo-pagamento"><span>Responsável</span><select id="cal-responsavel"><option>Fernando</option><option>Letícia</option><option>Ambos</option></select></label></div>
    <label class="campo-pagamento"><span>Repetição</span><select id="cal-recorrencia"><option value="NENHUMA">Não repetir</option><option value="DIARIA">Todos os dias</option><option value="SEMANAL">Toda semana</option><option value="MENSAL">Todo mês</option></select></label>
    <label class="campo-pagamento"><span>Repetir até (opcional)</span><input id="cal-data-fim" type="date" value="${escAttr(dataInputDateLocal(dataFim))}"></label>
    <div class="cal-form-acoes"><button type="button" class="botao-cal-secundario" id="cal-form-cancelar">Cancelar</button><button type="button" class="botao-cal-principal" id="cal-form-salvar">💾 Salvar evento</button></div>
  </div></div>`;
  $('cal-categoria').value=item.categoria||'PESSOAL';
  $('cal-responsavel').value=item.responsavel||'Ambos';
  $('cal-recorrencia').value=item.recorrencia||'NENHUMA';
  const fechar=()=>{calendarioFormId=null;wrap.innerHTML='';};
  $('cal-form-fechar').onclick=fechar; $('cal-form-cancelar').onclick=fechar;
  $('cal-form-salvar').onclick=async()=>{
    const btn=$('cal-form-salvar');btn.disabled=true;btn.textContent='Salvando...';
    try{
      const dados={titulo:$('cal-titulo').value.trim(),descricao:$('cal-descricao').value.trim(),dataInicio:$('cal-data').value,hora:$('cal-hora').value,categoria:$('cal-categoria').value,responsavel:$('cal-responsavel').value,recorrencia:$('cal-recorrencia').value,dataFim:$('cal-data-fim').value};
      if(!dados.titulo)throw new Error('Informe o título do evento.');
      const acao=calendarioFormId?'atualizarEventoCalendario':'inserirEventoCalendario';
      const payload={action:acao,token:sessao.token,dados};if(calendarioFormId)payload.id=calendarioFormId;
      const rr=await chamarApi(payload);assertOk(rr);toast(calendarioFormId?'Evento atualizado! ✅':'Evento criado! 📅');calendarioFormId=null;await renderCalendario(c);rolarModuloTopo();
    }catch(e){toast(e.message||'Não foi possível salvar o evento.');btn.disabled=false;btn.textContent='💾 Salvar evento';}
  };
  wrap.scrollIntoView({behavior:'smooth',block:'start'});
}

function calChip(x){const ic=x.origem==='CASA'?'🏠':x.origem==='FINANCEIRO'?'💰':'📌';return `<span class="cal-chip ${String(x.origem||'').toLowerCase()}">${ic} ${esc(x.titulo).slice(0,18)}</span>`;}
function itemCalendarioCard(x){const ic=x.origem==='CASA'?'🏠':x.origem==='FINANCEIRO'?'💰':'📌';const meta=[x.hora||'',x.responsavel||'',x.origem==='CASA'?(x.status||''):''].filter(Boolean).join(' • ');const valor=x.origem==='FINANCEIRO'?`<strong class="valor">${moeda(x.valor)}</strong>`:'';return `<div class="item-lista cal-item-card"><div><div class="descricao">${ic} ${esc(x.titulo)}</div><div class="meta">${esc(meta||'Calendário')}${x.recorrencia&&x.recorrencia!=='NENHUMA'?' • 🔁 '+esc(nomeRecorrencia(x.recorrencia)):''}</div>${x.descricao?`<div class="cal-descricao">${esc(x.descricao)}</div>`:''}${x.status?`<span class="badge ${String(x.status).toLowerCase()==='concluida'?'pago':'apagar'}">${esc(x.status)}</span>`:''}</div><div class="cal-item-direita">${valor}${x.editavel?`<div class="cal-acoes"><button type="button" class="cal-mini" data-cal-editar="${escAttr(x.serieId||x.id)}">✏️</button><button type="button" class="cal-mini perigo" data-cal-excluir="${escAttr(x.serieId||x.id)}">🗑️</button></div>`:''}</div></div>`;}
function nomeRecorrencia(v){return ({DIARIA:'diária',SEMANAL:'semanal',MENSAL:'mensal'})[v]||v;}
function calOrdenarItens(a,b){const da=chaveDataLocalFront(a.data),db=chaveDataLocalFront(b.data);if(da!==db)return da.localeCompare(db);return String(a.hora||'').localeCompare(String(b.hora||''))||String(a.titulo||'').localeCompare(String(b.titulo||''),'pt-BR');}
function chaveDataLocalFront(v){if(v instanceof Date)return dataInputDateLocal(v);const s=String(v||'');if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const d=new Date(s);return isNaN(d)?'':dataInputDateLocal(d);}
function dataInputDateLocal(v){if(!v)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(String(v)))return String(v);const d=v instanceof Date?v:new Date(v);if(isNaN(d))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

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

function dataInputOffset(dias){
  const d=new Date();
  d.setDate(d.getDate()+Number(dias||0));
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
